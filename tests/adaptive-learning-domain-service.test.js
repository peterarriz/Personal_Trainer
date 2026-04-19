import test from "node:test";
import assert from "node:assert/strict";

import {
  buildCoachSuggestionRecommendationEventInput,
  buildDayPrescriptionRecommendationEventInput,
  buildGoalChangeEventInput,
  buildIntakeCompletionRecommendationEventInput,
  buildNutritionOutcomeEventInput,
  buildNutritionRecommendationEventInput,
  buildPlanGenerationRecommendationEventInput,
  buildWeeklyPlanRefreshRecommendationEventInput,
  buildWeeklyEvaluationEventInput,
  buildWorkoutOutcomeEventInput,
} from "../src/services/adaptive-learning-domain-service.js";
import { ADAPTIVE_ADHERENCE_OUTCOMES, ADAPTIVE_OUTCOME_KINDS, ADAPTIVE_RECOMMENDATION_KINDS } from "../src/services/adaptive-learning-event-service.js";

const goals = [
  {
    id: "goal_1",
    active: true,
    priority: 1,
    category: "running",
    resolvedGoal: {
      id: "resolved_goal_1",
      summary: "Run a 1:45 half marathon",
      planningCategory: "running",
      planningPriority: 1,
    },
  },
];

const currentPlanWeek = {
  id: "plan_week_4",
  weekNumber: 4,
  phase: "BUILD",
  label: "BUILD - Week 4",
  status: "planned",
  adjusted: true,
  summary: "Threshold work builds this week.",
  constraints: ["Saturday long run"],
  weeklyIntent: {
    focus: "Threshold durability",
    rationale: "Keep quality visible while protecting the long run.",
  },
  programBlock: {
    label: "Half marathon build",
    dominantEmphasis: {
      category: "running",
      label: "Threshold work",
    },
  },
  adaptivePolicyRuntime: {
    mode: "shadow",
  },
  adaptivePolicyTraces: [
    {
      decisionPointId: "progression_aggressiveness_band",
      mode: "shadow",
      decisionMode: "shadow",
      defaultActionId: "default_band",
      chosenActionId: "default_band",
      shadowTopActionId: "conservative_band",
      usedAdaptiveChoice: false,
      fallbackReason: "shadow_mode",
      contextSnapshot: {
        primaryGoalCategory: "running",
        scheduleReliability: "variable",
      },
      candidateScores: [
        {
          actionId: "default_band",
          label: "Default band",
          score: 0.02,
          confidenceScore: 20,
          sampleSize: 8,
          evidenceEffectSize: 0.01,
        },
        {
          actionId: "conservative_band",
          label: "Conservative band",
          score: 0.12,
          confidenceScore: 84,
          sampleSize: 18,
          evidenceEffectSize: 0.09,
          matchedRuleIds: ["rule_1"],
          matchedEvidenceSummaries: ["Controlled progression improved four-week adherence."],
        },
      ],
      explanation: "Shadow mode scored conservative band, but the planner kept default band.",
    },
  ],
};

const planDay = {
  id: "plan_day_2026-04-18",
  dateKey: "2026-04-18",
  dayOfWeek: 6,
  week: {
    currentWeek: 4,
    phase: "BUILD",
    planWeekId: "plan_week_4",
    planWeek: currentPlanWeek,
  },
  base: {
    training: {
      label: "Tempo session",
      type: "hard-run",
    },
  },
  resolved: {
    training: {
      label: "Tempo session",
      type: "hard-run",
      run: { t: "Tempo", d: "3 x 8 min" },
    },
    nutrition: {
      dayType: "run_hard",
      prescription: {
        dayType: "run_hard",
        headline: "Fuel the session",
        targets: {
          cal: 2700,
          p: 170,
          c: 340,
          f: 70,
          hydrationTargetOz: 110,
        },
      },
    },
    recovery: {
      state: "steady",
    },
  },
  decision: {
    mode: "planned",
    source: "plan_day_resolution",
    modifiedFromBase: false,
  },
  provenance: {
    summary: "The threshold session stays as written because recovery signals are stable.",
    keyDrivers: ["Threshold durability", "Recovery is steady"],
  },
  flags: {
    isModified: false,
  },
};

test("plan and intake recommendation builders return machine-joinable payloads", () => {
  const intakeEvent = buildIntakeCompletionRecommendationEventInput({
    goals,
    personalization: {
      profile: {
        onboardingComplete: true,
        estimatedFitnessLevel: "intermediate",
      },
      trainingContext: {
        environment: { value: "gym" },
      },
    },
  });
  const planEvent = buildPlanGenerationRecommendationEventInput({
    goals,
    planComposer: {
      architecture: "endurance_only",
    },
    currentPlanWeek,
    currentWeek: 4,
  });

  assert.equal(intakeEvent.recommendationKind, ADAPTIVE_RECOMMENDATION_KINDS.intakeCompletion);
  assert.equal(intakeEvent.goalStack[0].summary, "Run a 1:45 half marathon");
  assert.equal(planEvent.recommendationKind, ADAPTIVE_RECOMMENDATION_KINDS.planGeneration);
  assert.equal(planEvent.planStage.planWeekId, "plan_week_4");
  assert.equal(planEvent.chosenOption.label, "BUILD - Week 4");
});

test("nutrition and coach recommendation builders produce consumer-surface recommendation records", () => {
  const nutritionEvent = buildNutritionRecommendationEventInput({
    goals,
    planDay,
  });
  const coachEvent = buildCoachSuggestionRecommendationEventInput({
    goals,
    action: {
      type: "REDUCE_WEEKLY_VOLUME",
      proposalSource: "coach_adjust_week",
      source: "coach_adjust_week",
    },
    planDay,
    displaySource: "Adjust this week",
    recommendation: "Reduce this week's volume",
    why: "Recent recovery signals are shaky.",
    likelyEffect: "The week gets lighter without changing the goal.",
  });

  assert.equal(nutritionEvent.recommendationKind, ADAPTIVE_RECOMMENDATION_KINDS.nutritionRecommendation);
  assert.equal(nutritionEvent.chosenOption.details.carbs, 340);
  assert.equal(coachEvent.recommendationKind, ADAPTIVE_RECOMMENDATION_KINDS.coachSuggestion);
  assert.equal(coachEvent.chosenOption.source, "coach_adjust_week");
  assert.equal(coachEvent.whyChosen[0], "Recent recovery signals are shaky.");
});

test("weekly and daily recommendation builders attach adaptive shadow decisions without changing the chosen plan", () => {
  const weeklyEvent = buildWeeklyPlanRefreshRecommendationEventInput({
    goals,
    currentPlanWeek,
    currentWeek: 4,
    dayOfWeek: 1,
  });
  const dayEvent = buildDayPrescriptionRecommendationEventInput({
    goals,
    planDay,
    currentWeek: 4,
    dayOfWeek: 6,
  });

  assert.equal(weeklyEvent.chosenOption.label, "BUILD - Week 4");
  assert.equal(weeklyEvent.adaptivePolicyShadow?.runtimeMode, "shadow");
  assert.equal(weeklyEvent.adaptivePolicyShadow?.decisions?.[0]?.shadowTopActionId, "conservative_band");
  assert.equal(weeklyEvent.adaptivePolicyShadow?.decisions?.[0]?.contextSnapshot?.scheduleReliability, "variable");
  assert.equal(dayEvent.adaptivePolicyShadow?.decisions?.[0]?.decisionPointId, "progression_aggressiveness_band");
});

test("hybrid adaptive shadow context flows into contextual inputs for later analysis", () => {
  const hybridWeek = {
    ...currentPlanWeek,
    adaptivePolicyTraces: [
      {
        decisionPointId: "hybrid_session_format_choice",
        mode: "shadow",
        decisionMode: "shadow",
        defaultActionId: "keep_current_structure",
        chosenActionId: "keep_current_structure",
        shadowTopActionId: "favor_short_split_sessions",
        fallbackReason: "shadow_mode",
        contextSnapshot: {
          primaryGoalCategory: "hybrid",
          hybridMeaningful: true,
          hybridCohort: "inconsistent_schedule_hybrid",
          hybridHardDayBand: "high",
          hybridRunBuildPhase: "build_phase",
          hybridLowerBodyGuardNeeded: true,
        },
        candidateScores: [
          {
            actionId: "keep_current_structure",
            label: "Keep current structure",
            score: 0.01,
            confidenceScore: 10,
            sampleSize: 4,
            evidenceEffectSize: 0.005,
          },
          {
            actionId: "favor_short_split_sessions",
            label: "Favor short split sessions",
            score: 0.1,
            confidenceScore: 83,
            sampleSize: 15,
            evidenceEffectSize: 0.07,
          },
        ],
        explanation: "Shadow mode scored favor short split sessions, but the planner kept the current structure.",
      },
    ],
  };

  const weeklyEvent = buildWeeklyPlanRefreshRecommendationEventInput({
    goals,
    currentPlanWeek: hybridWeek,
    currentWeek: 4,
    dayOfWeek: 1,
  });

  assert.equal(weeklyEvent.contextualInputs.hybrid_meaningful, true);
  assert.equal(weeklyEvent.contextualInputs.hybrid_cohort, "inconsistent_schedule_hybrid");
  assert.equal(weeklyEvent.contextualInputs.hybrid_hard_day_band, "high");
  assert.equal(weeklyEvent.contextualInputs.hybrid_session_format_action, "favor_short_split_sessions");
});

test("outcome builders tie execution back to recommendation joins", () => {
  const workoutOutcome = buildWorkoutOutcomeEventInput({
    recommendationJoinKey: "day_prescription_abc123",
    decisionId: "decision_day_prescription_abc123",
    dateKey: "2026-04-18",
    comparison: {
      completionKind: "modified",
      differenceKind: "modified",
      summary: "Modified from plan after the second block.",
    },
    checkin: {
      status: "completed_modified",
      sessionFeel: "harder_than_expected",
      blocker: "pain_injury",
    },
    planDay,
    plannedDayRecord: {
      id: "plan_day_2026-04-18",
    },
    actualLog: {
      actualSession: {
        modifiedFromPlan: true,
      },
    },
  });
  const nutritionOutcome = buildNutritionOutcomeEventInput({
    recommendationJoinKey: "nutrition_recommendation_abc123",
    decisionId: "decision_nutrition_recommendation_abc123",
    dateKey: "2026-04-18",
    actualNutritionLog: {
      deviationKind: "under_fueled",
      issue: "low_carb_intake",
      note: "Missed the pre-run carbs.",
    },
  });

  assert.equal(workoutOutcome.recommendationJoinKey, "day_prescription_abc123");
  assert.equal(workoutOutcome.adherenceOutcome, ADAPTIVE_ADHERENCE_OUTCOMES.modified);
  assert.equal(workoutOutcome.painFlag, true);
  assert.equal(nutritionOutcome.outcomeKind, ADAPTIVE_OUTCOME_KINDS.nutritionLog);
  assert.equal(nutritionOutcome.userModifications[0], "under fueled");
});

test("goal change and weekly evaluation builders summarize later learning windows", () => {
  const goalChangeEvent = buildGoalChangeEventInput({
    changeKind: "abandon",
    changeMode: "reprioritize_goal_stack",
    historyEvent: {
      effectiveDate: "2026-04-18",
      rawGoalIntent: "Shift the main focus to the marathon.",
      archivedPlanId: "archive_1",
      label: "Re-prioritize Goals",
    },
    previousGoals: ["Run a 1:45 half marathon", "Bench 225"],
    nextGoals: ["Run a 1:45 half marathon"],
    abandonedGoals: ["Bench 225"],
    rationale: "The strength goal can wait until after the race.",
  });
  const weeklyEvaluation = buildWeeklyEvaluationEventInput({
    currentPlanWeek,
    weeklyCheckin: {
      summary: "Good week overall.",
    },
    recentComparisons: [
      { completionKind: "as_prescribed", recommendationJoinKey: "day_1" },
      { completionKind: "modified", recommendationJoinKey: "day_2" },
      { completionKind: "skipped", recommendationJoinKey: "day_3" },
      { differenceKind: "not_logged_over_48h", recommendationJoinKey: "day_4" },
    ],
    nutritionSummary: "Fueling was mostly on plan.",
    acceptedCoachActions: 2,
    goalProgressSignal: "Threshold pace is trending the right way.",
  });

  assert.equal(goalChangeEvent.abandonedGoals[0], "Bench 225");
  assert.equal(weeklyEvaluation.evaluationWeekNumber, 4);
  assert.equal(weeklyEvaluation.completedSessions, 1);
  assert.equal(weeklyEvaluation.modifiedSessions, 1);
  assert.equal(weeklyEvaluation.skippedSessions, 1);
  assert.equal(weeklyEvaluation.missedSessions, 1);
  assert.equal(weeklyEvaluation.linkedRecommendationJoinKeys.length, 4);
});
