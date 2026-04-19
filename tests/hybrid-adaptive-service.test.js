import test from "node:test";
import assert from "node:assert/strict";

import {
  HYBRID_ADAPTIVE_COHORTS,
  buildHybridAdaptiveContext,
  buildHybridAdaptiveOutcomeLabels,
  deriveHybridAdaptiveCohort,
  isMeaningfulHybridAdaptiveUser,
} from "../src/services/hybrid-adaptive-service.js";

test("hybrid detection requires a meaningful run lane plus strength or physique lane", () => {
  assert.equal(isMeaningfulHybridAdaptiveUser({
    primaryGoalCategory: "hybrid",
    architecture: "hybrid_performance",
    runningGoalActive: true,
    strengthGoalActive: true,
  }), true);

  assert.equal(isMeaningfulHybridAdaptiveUser({
    primaryGoalCategory: "running",
    architecture: "race_prep_dominant",
    runningGoalActive: true,
    strengthGoalActive: false,
  }), false);

  assert.equal(isMeaningfulHybridAdaptiveUser({
    primaryGoalCategory: "fat_loss",
    secondaryGoalCategories: ["running"],
    architecture: "hybrid_performance",
    runningGoalActive: true,
    physiqueGoalActive: true,
  }), true);
});

test("hybrid cohorts classify beginner, fat-loss, performance, travel-heavy, and inconsistent schedule hybrids", () => {
  assert.equal(deriveHybridAdaptiveCohort({
    primaryGoalCategory: "hybrid",
    architecture: "hybrid_performance",
    runningGoalActive: true,
    strengthGoalActive: true,
    experienceLevel: "beginner",
  }), HYBRID_ADAPTIVE_COHORTS.beginner);

  assert.equal(deriveHybridAdaptiveCohort({
    primaryGoalCategory: "fat_loss",
    secondaryGoalCategories: ["running", "strength"],
    architecture: "hybrid_performance",
    runningGoalActive: true,
    strengthGoalActive: true,
    experienceLevel: "intermediate",
  }), HYBRID_ADAPTIVE_COHORTS.fatLoss);

  assert.equal(deriveHybridAdaptiveCohort({
    primaryGoalCategory: "hybrid",
    architecture: "hybrid_performance",
    runningGoalActive: true,
    strengthGoalActive: true,
    experienceLevel: "advanced",
    travelHeavy: true,
  }), HYBRID_ADAPTIVE_COHORTS.travelHeavy);

  assert.equal(deriveHybridAdaptiveCohort({
    primaryGoalCategory: "hybrid",
    architecture: "hybrid_performance",
    runningGoalActive: true,
    strengthGoalActive: true,
    experienceLevel: "advanced",
    scheduleReliability: "variable",
  }), HYBRID_ADAPTIVE_COHORTS.inconsistentSchedule);

  assert.equal(deriveHybridAdaptiveCohort({
    primaryGoalCategory: "hybrid",
    architecture: "hybrid_performance",
    runningGoalActive: true,
    strengthGoalActive: true,
    experienceLevel: "advanced",
    scheduleReliability: "steady",
  }), HYBRID_ADAPTIVE_COHORTS.performance);
});

test("hybrid context derives hard-day, mixed-session, and lower-body guard signals", () => {
  const context = buildHybridAdaptiveContext({
    primaryGoalCategory: "hybrid",
    secondaryGoalCategories: ["running", "strength"],
    architecture: "hybrid_performance",
    planArchetypeId: "hybrid_performance",
    experienceLevel: "advanced",
    scheduleReliability: "steady",
    runningGoalActive: true,
    strengthGoalActive: true,
    dayTemplates: {
      1: { type: "run+strength", label: "Quality Run + Strength Finish" },
      3: { type: "strength+prehab", label: "Primary Strength Focus" },
      4: { type: "hard-run", label: "Tempo Run" },
      6: { type: "long-run", label: "Long Run" },
    },
    currentPhase: "BUILD",
  });

  assert.equal(context.hybridMeaningful, true);
  assert.equal(context.hybridHardDayBand, "high");
  assert.equal(context.hybridMixedSessionBand, "single");
  assert.equal(context.hybridRunBuildPhase, "build_phase");
  assert.equal(context.hybridLowerBodyGuardNeeded, true);
});

test("hybrid outcome labels highlight schedule overflow, overload, and preserved consistency", () => {
  const successLabels = buildHybridAdaptiveOutcomeLabels({
    row: {
      hybridMeaningful: true,
      hybridCohort: HYBRID_ADAPTIVE_COHORTS.travelHeavy,
      compositeSuccessScore: 0.8,
      hybridSessionFormatAction: "favor_mixed_sessions",
      immediateOutcome: { painRate: 0, frustrationSignals: [] },
    },
  });
  const overloadLabels = buildHybridAdaptiveOutcomeLabels({
    row: {
      hybridMeaningful: true,
      compositeSuccessScore: 0.32,
      hybridHardDayBand: "high",
      hybridRunBuildPhase: "build_phase",
      immediateOutcome: { painRate: 0, frustrationSignals: [] },
    },
  });
  const scheduleLabels = buildHybridAdaptiveOutcomeLabels({
    row: {
      hybridMeaningful: true,
      hybridCohort: HYBRID_ADAPTIVE_COHORTS.inconsistentSchedule,
      compositeSuccessScore: 0.35,
      immediateOutcome: { painRate: 0, frustrationSignals: ["time"] },
    },
  });

  assert.equal(successLabels.successLabel, "hybrid_mixed_session_success");
  assert.equal(overloadLabels.failureLabel, "hybrid_overload_failure");
  assert.equal(scheduleLabels.failureLabel, "hybrid_schedule_overflow_failure");
});
