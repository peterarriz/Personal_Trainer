import { runIntakeFieldExtractionRuntime } from "./ai-runtime-service.js";
import { validateMissingAnchorAnswer } from "./intake-machine-service.js";

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const AI_PERSIST_CONFIDENCE_THRESHOLD = 0.85;

const buildClarifyingQuestion = ({
  fieldId = "",
  captureText = "",
} = {}) => {
  const cleanCapture = sanitizeText(captureText, 120);
  if (!cleanCapture) return "Can you confirm that before I save it?";
  switch (fieldId) {
    case "current_strength_baseline":
      return `I read that as ${cleanCapture} for your current top set. Is that right?`;
    case "target_timeline":
      return `I read that as ${cleanCapture} for the target date or month. Is that right?`;
    case "current_run_frequency":
      return `I read that as ${cleanCapture}. Is that your normal weekly run frequency?`;
    case "longest_recent_run":
      return `I read that as ${cleanCapture} for your longest recent run. Is that right?`;
    case "recent_pace_baseline":
      return `I read that as ${cleanCapture} for your recent pace or result. Is that right?`;
    default:
      return `I read that as ${cleanCapture}. Is that right?`;
  }
};

const buildFieldExtractionAnswerValue = ({
  anchor = null,
  candidate = null,
} = {}) => {
  const inputType = sanitizeText(anchor?.input_type || "", 30).toLowerCase();
  const parsedValue = candidate?.parsed_value;
  const rawText = sanitizeText(candidate?.raw_text || "", 220);

  if (inputType === "choice_chips") {
    const choiceValue = sanitizeText(parsedValue?.value || parsedValue || "", 80);
    return {
      value: choiceValue,
      raw: sanitizeText(parsedValue?.raw || rawText || choiceValue, 120),
    };
  }

  if (inputType === "date_or_month") {
    const value = sanitizeText(parsedValue?.value || rawText, 40);
    const mode = sanitizeText(
      parsedValue?.mode || (/^\d{4}-\d{2}-\d{2}$/.test(value) ? "date" : /^\d{4}-\d{2}$/.test(value) ? "month" : ""),
      10
    ).toLowerCase();
    return {
      value,
      mode: mode || "month",
      raw: sanitizeText(parsedValue?.raw || rawText || value, 120),
    };
  }

  if (inputType === "number_with_unit") {
    const unit = sanitizeText(
      parsedValue?.unit
      || anchor?.unit
      || toArray(anchor?.unit_options)[0]?.value
      || "",
      20
    ).toLowerCase();
    return {
      value: parsedValue?.value ?? rawText,
      unit,
      raw: sanitizeText(parsedValue?.raw || rawText, 120),
    };
  }

  if (inputType === "number") {
    return parsedValue?.value ?? parsedValue ?? rawText;
  }

  if (inputType === "strength_top_set") {
    return sanitizeText(parsedValue?.raw || rawText, 160);
  }

  return sanitizeText(
    typeof parsedValue === "string"
      ? parsedValue
      : parsedValue?.raw || rawText,
    220
  );
};

const buildPacketArgsFromContext = (context = {}) => ({
  intakeContext: context?.typedIntakePacket?.intake || context?.intakeContext || {},
});

const mapValidatedCandidate = ({
  anchor = null,
  candidate = null,
  validation = null,
  answerValue = null,
} = {}) => {
  const capturePreviewText = sanitizeText(validation?.summaryText || candidate?.raw_text || "", 180);
  const aiConfidence = Number(candidate?.confidence || 0);
  const shouldPersist = Boolean(validation?.isValid && aiConfidence >= AI_PERSIST_CONFIDENCE_THRESHOLD);
  return {
    field_id: sanitizeText(anchor?.field_id || candidate?.field_id || "", 80),
    raw_text: sanitizeText(candidate?.raw_text || "", 220),
    answer_value: answerValue,
    ai_confidence: aiConfidence,
    evidence_spans: toArray(candidate?.evidence_spans).slice(0, 3),
    validation,
    capturePreviewText,
    shouldPersist,
    clarifyingQuestion: shouldPersist
      ? ""
      : buildClarifyingQuestion({
          fieldId: anchor?.field_id || candidate?.field_id || "",
          captureText: capturePreviewText,
        }),
  };
};

export const aiExtractForMissingFields = async ({
  utterance = "",
  missing_fields = [],
  context = {},
} = {}) => {
  const cleanUtterance = sanitizeText(utterance, 600);
  const eligibleFields = toArray(missing_fields).filter((item) => item?.field_id);
  if (!cleanUtterance || !eligibleFields.length) {
    return {
      ok: false,
      status: "no_eligible_fields",
      validatedCandidates: [],
      discardedCandidates: [],
      userFacingError: "I need one active intake field before I can extract anything.",
    };
  }

  const runtime = context?.runFieldExtractionRuntime
    ? await context.runFieldExtractionRuntime({
        utterance: cleanUtterance,
        missingFields: eligibleFields,
        statePacket: context?.statePacket || null,
        packetArgs: buildPacketArgsFromContext(context),
      })
    : await runIntakeFieldExtractionRuntime({
        safeFetchWithTimeout: context?.safeFetchWithTimeout,
        utterance: cleanUtterance,
        missingFields: eligibleFields,
        statePacket: context?.statePacket || null,
        packetArgs: buildPacketArgsFromContext(context),
      });

  if (!runtime?.ok || !runtime?.extraction) {
    return {
      ok: false,
      status: "runtime_failed",
      validatedCandidates: [],
      discardedCandidates: [],
      userFacingError: sanitizeText(runtime?.ui?.message || runtime?.error || "I couldn't confidently extract that. Use the field control below.", 220),
    };
  }

  const anchorByFieldId = new Map(eligibleFields.map((item) => [item.field_id, item]));
  const validatedCandidates = [];
  const discardedCandidates = [];

  toArray(runtime?.extraction?.candidates).forEach((candidate) => {
    const fieldId = sanitizeText(candidate?.field_id || "", 80);
    const anchor = anchorByFieldId.get(fieldId);
    if (!anchor) {
      discardedCandidates.push({
        field_id: fieldId,
        reason: "field_not_eligible",
      });
      return;
    }
    const answerValue = buildFieldExtractionAnswerValue({
      anchor,
      candidate,
    });
    const validation = validateMissingAnchorAnswer({
      anchor,
      raw_text: candidate?.raw_text || cleanUtterance,
      answer_value: answerValue,
      multi_bind_mode: false,
    });
    if (!validation?.isValid) {
      discardedCandidates.push({
        field_id: fieldId,
        reason: sanitizeText(validation?.parseErrorCode || validation?.formError || "validation_failed", 120),
      });
      return;
    }
    validatedCandidates.push(mapValidatedCandidate({
      anchor,
      candidate,
      validation,
      answerValue,
    }));
  });

  if (!validatedCandidates.length) {
    return {
      ok: false,
      status: "no_valid_capture",
      validatedCandidates: [],
      discardedCandidates,
      userFacingError: "I couldn't confidently bind that to the current field. Use one of the examples below.",
    };
  }

  const persistable = validatedCandidates.filter((item) => item.shouldPersist);
  if (persistable.length) {
    return {
      ok: true,
      status: "ready_to_persist",
      validatedCandidates: persistable,
      discardedCandidates,
      userFacingError: "",
    };
  }

  return {
    ok: true,
    status: "needs_clarification",
    validatedCandidates,
    discardedCandidates,
    userFacingError: validatedCandidates[0]?.clarifyingQuestion || "Can you confirm that before I save it?",
  };
};
