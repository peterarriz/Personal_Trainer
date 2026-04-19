import test from "node:test";
import assert from "node:assert/strict";

import { buildAdaptiveLearningAnalysisFixtureDataset } from "../src/services/adaptive-learning-analysis-fixture-service.js";
import { extractAdaptiveLearningEvents } from "../src/services/adaptive-learning-analysis/extraction.js";
import { buildAdaptiveLearningAnalysisRows } from "../src/services/adaptive-learning-analysis/feature-engineering.js";

test("adaptive learning feature engineering links recommendation rows to immediate, short, and medium outcomes", () => {
  const fixture = buildAdaptiveLearningAnalysisFixtureDataset();
  const extracted = extractAdaptiveLearningEvents({ sources: fixture.sources });
  const rows = buildAdaptiveLearningAnalysisRows({ events: extracted.events });

  const fastRampHybridRow = rows.find((row) => (
    row.recommendationKind === "weekly_plan_refresh"
    && row.primaryGoalCategory === "hybrid"
    && row.weeklyRunRampBand === "high"
    && row.strengthIntensityBand === "high"
  ));
  const travelSubstitutionRow = rows.find((row) => (
    row.recommendationKind === "weekly_plan_refresh"
    && row.travelHeavy
    && row.substitutionStyle === "short_mixed"
  ));
  const simpleNutritionRow = rows.find((row) => (
    row.recommendationKind === "nutrition_recommendation"
    && row.nutritionStyle === "simple_performance"
  ));
  const directCoachRow = rows.find((row) => (
    row.recommendationKind === "coach_suggestion"
    && row.coachPromptType === "direct_next_step"
  ));

  assert.ok(fastRampHybridRow);
  assert.equal(fastRampHybridRow.immediateOutcome.label, "failure");
  assert.equal(fastRampHybridRow.mediumTermOutcome.label, "failure");
  assert.equal(fastRampHybridRow.hybridLoadCombo, "high_run__high_strength");
  assert.equal(fastRampHybridRow.hybridFailureLabel, "hybrid_overload_failure");

  assert.ok(travelSubstitutionRow);
  assert.equal(travelSubstitutionRow.immediateOutcome.label, "success");
  assert.equal(travelSubstitutionRow.mediumTermOutcome.label, "success");

  assert.ok(simpleNutritionRow);
  assert.equal(simpleNutritionRow.immediateOutcome.label, "success");
  assert.equal(simpleNutritionRow.nutritionStyle, "simple_performance");

  assert.ok(directCoachRow);
  assert.equal(directCoachRow.immediateOutcome.label, "success");
  assert.equal(directCoachRow.coachPromptType, "direct_next_step");
});
