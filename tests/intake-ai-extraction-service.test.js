import test from "node:test";
import assert from "node:assert/strict";

import { aiExtractForMissingFields } from "../src/services/intake-ai-extraction-service.js";

const buildAnchor = ({
  field_id,
  label,
  input_type,
  validation = {},
  examples = [],
  unit = "",
  unit_options = [],
  options = [],
} = {}) => ({
  field_id,
  label,
  input_type,
  validation,
  examples,
  unit,
  unit_options,
  options,
});

test("bounded AI extraction validates a strength top set and marks it ready to persist", async () => {
  const result = await aiExtractForMissingFields({
    utterance: "my bench is around 185 x 5 right now",
    missing_fields: [
      buildAnchor({
        field_id: "current_strength_baseline",
        label: "Current bench baseline",
        input_type: "strength_top_set",
        validation: {
          message: "Add a recent top set, best single, or estimated max for this lift.",
        },
        examples: ["185x5"],
      }),
    ],
    context: {
      runFieldExtractionRuntime: async () => ({
        ok: true,
        extraction: {
          candidates: [
            {
              field_id: "current_strength_baseline",
              confidence: 0.97,
              raw_text: "185 x 5",
              parsed_value: {
                weight: 185,
                reps: 5,
                raw: "185 x 5",
              },
              evidence_spans: [
                { start: 19, end: 26, text: "185 x 5" },
              ],
            },
          ],
        },
      }),
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready_to_persist");
  assert.equal(result.validatedCandidates.length, 1);
  assert.equal(result.validatedCandidates[0].field_id, "current_strength_baseline");
  assert.equal(result.validatedCandidates[0].validation.summaryText, "185x5");
  assert.equal(result.validatedCandidates[0].shouldPersist, true);
});

test("bounded AI extraction keeps the card open when confidence is low", async () => {
  const result = await aiExtractForMissingFields({
    utterance: "October 12",
    missing_fields: [
      buildAnchor({
        field_id: "target_timeline",
        label: "Race date or target month",
        input_type: "date_or_month",
        validation: {
          message: "Enter the race date, target month, or rough time window for this goal.",
        },
      }),
    ],
    context: {
      runFieldExtractionRuntime: async () => ({
        ok: true,
        extraction: {
          candidates: [
            {
              field_id: "target_timeline",
              confidence: 0.61,
              raw_text: "October 12",
              parsed_value: {
                mode: "month",
                value: "2026-10",
                raw: "October 12",
              },
              evidence_spans: [
                { start: 0, end: 10, text: "October 12" },
              ],
            },
          ],
        },
      }),
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "needs_clarification");
  assert.equal(result.validatedCandidates.length, 1);
  assert.equal(result.validatedCandidates[0].capturePreviewText, "October 12");
  assert.match(result.validatedCandidates[0].clarifyingQuestion, /October 12/i);
  assert.equal(result.validatedCandidates[0].shouldPersist, false);
});

test("bounded AI extraction discards fields that are not currently eligible", async () => {
  const result = await aiExtractForMissingFields({
    utterance: "185 x 5 and October 12",
    missing_fields: [
      buildAnchor({
        field_id: "current_strength_baseline",
        label: "Current bench baseline",
        input_type: "strength_top_set",
        validation: {
          message: "Add a recent top set, best single, or estimated max for this lift.",
        },
      }),
    ],
    context: {
      runFieldExtractionRuntime: async () => ({
        ok: true,
        extraction: {
          candidates: [
            {
              field_id: "current_strength_baseline",
              confidence: 0.94,
              raw_text: "185 x 5",
              parsed_value: {
                weight: 185,
                reps: 5,
                raw: "185 x 5",
              },
              evidence_spans: [
                { start: 0, end: 7, text: "185 x 5" },
              ],
            },
            {
              field_id: "target_timeline",
              confidence: 0.91,
              raw_text: "October 12",
              parsed_value: {
                mode: "month",
                value: "2026-10",
                raw: "October 12",
              },
              evidence_spans: [
                { start: 12, end: 22, text: "October 12" },
              ],
            },
          ],
        },
      }),
    },
  });

  assert.equal(result.ok, true);
  assert.equal(result.status, "ready_to_persist");
  assert.deepEqual(
    result.validatedCandidates.map((item) => item.field_id),
    ["current_strength_baseline"]
  );
  assert.deepEqual(
    result.discardedCandidates,
    [{ field_id: "target_timeline", reason: "field_not_eligible" }]
  );
});
