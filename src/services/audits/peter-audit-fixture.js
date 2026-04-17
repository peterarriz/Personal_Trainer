import {
  projectResolvedGoalToPlanningGoal,
  resolveGoalTranslation,
} from "../goal-resolution-service.js";
import { normalizeGoals } from "../canonical-athlete-service.js";

export const PETER_AUDIT_REFERENCE_DATE = "2026-04-16";
export const PETER_AUDIT_DEADLINE = "2026-12-31";

export const PETER_AUDIT_ASSUMPTIONS = Object.freeze({
  profile: {
    name: "Peter",
    age: 34,
    units: "imperial",
    timezone: "America/Chicago",
    experienceLevel: "intermediate",
    trainingAgeYears: 4,
  },
  anchors: {
    benchTopSet: { exercise: "Bench Press", weight: 185, reps: 5, source: "explicit_audit_assumption" },
    running: { weeklyFrequency: 3, longestRecentRunMiles: 7, recentPaceText: "8:55", source: "explicit_audit_assumption" },
    bodyweight: { value: 185, unit: "lb", source: "explicit_audit_assumption" },
    waist: { value: 34, unit: "in", source: "explicit_audit_assumption" },
  },
  schedule: {
    trainingDaysPerWeek: 4,
    sessionLength: "45 min",
    trainingLocation: "Gym",
    equipment: ["barbell", "rack", "bench", "dumbbells", "treadmill"],
  },
  recovery: {
    activeInjury: "none reported",
    sleepReality: "normal working-adult variability",
  },
  nutrition: {
    compliance: "moderate",
    note: "Good-enough weekday adherence with occasional under-fueling risk on hard days.",
  },
});

const cloneValue = (value = null) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const buildIntakePacket = ({
  rawGoalText = "",
  appearanceConstraints = [],
} = {}) => ({
  version: "2026-04-v1",
  intent: "intake_interpretation",
  intake: {
    rawGoalText,
    baselineContext: {
      primaryGoalLabel: "General Fitness",
      currentBaseline: "Intermediate training background",
      experienceLevel: "Intermediate",
      fitnessLevel: "Intermediate",
    },
    scheduleReality: cloneValue(PETER_AUDIT_ASSUMPTIONS.schedule),
    equipmentAccessContext: {
      trainingLocation: PETER_AUDIT_ASSUMPTIONS.schedule.trainingLocation,
      equipment: cloneValue(PETER_AUDIT_ASSUMPTIONS.schedule.equipment),
    },
    injuryConstraintContext: {
      injuryText: "",
      constraints: [],
    },
    userProvidedConstraints: {
      timingConstraints: ["December 2026"],
      appearanceConstraints: cloneValue(appearanceConstraints),
      additionalContext: "",
    },
  },
});

const buildResolvedGoalFromText = ({
  rawGoalText = "",
  appearanceConstraints = [],
} = {}) => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildIntakePacket({ rawGoalText, appearanceConstraints }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: PETER_AUDIT_REFERENCE_DATE,
  });
  return cloneValue(resolution?.resolvedGoals?.[0] || null);
};

const resequenceResolvedGoal = (resolvedGoal = null, planningPriority = 1) => ({
  ...(cloneValue(resolvedGoal) || {}),
  planningPriority,
  intakeConfirmedRole: planningPriority === 1 ? "primary" : "maintained",
});

export const buildPeterAuditGoalFixture = () => {
  const resolvedGoals = [
    buildResolvedGoalFromText({ rawGoalText: "run a 1:45 half marathon" }),
    buildResolvedGoalFromText({ rawGoalText: "bench 225" }),
    buildResolvedGoalFromText({ rawGoalText: "lose 15 pounds" }),
    buildResolvedGoalFromText({
      rawGoalText: "have visible abs / six pack level leanness",
      appearanceConstraints: ["visible abs", "six pack level leanness"],
    }),
  ]
    .map((goal, index) => resequenceResolvedGoal(goal, index + 1))
    .filter(Boolean);

  const planningGoals = resolvedGoals.map((goal, index) => projectResolvedGoalToPlanningGoal(goal, index));
  const goals = normalizeGoals(planningGoals.map((goal, index) => ({
    ...goal,
    id: goal.id || `goal_${index + 1}`,
    priority: index + 1,
    active: true,
  })));

  return {
    referenceDate: PETER_AUDIT_REFERENCE_DATE,
    deadline: PETER_AUDIT_DEADLINE,
    assumptions: cloneValue(PETER_AUDIT_ASSUMPTIONS),
    resolvedGoals,
    planningGoals,
    goals,
    bodyweights: [
      { date: PETER_AUDIT_REFERENCE_DATE, w: PETER_AUDIT_ASSUMPTIONS.anchors.bodyweight.value },
    ],
    personalization: {
      profile: {
        estimatedFitnessLevel: "intermediate",
        fitnessLevel: "intermediate",
        bodyweight: PETER_AUDIT_ASSUMPTIONS.anchors.bodyweight.value,
      },
      userGoalProfile: {
        days_per_week: PETER_AUDIT_ASSUMPTIONS.schedule.trainingDaysPerWeek,
        session_length: "45",
      },
      manualProgressInputs: {
        measurements: {
          bodyweight_baseline: [{
            date: PETER_AUDIT_REFERENCE_DATE,
            value: PETER_AUDIT_ASSUMPTIONS.anchors.bodyweight.value,
            source: "user_override",
          }],
          waist_circumference: [{
            date: PETER_AUDIT_REFERENCE_DATE,
            value: PETER_AUDIT_ASSUMPTIONS.anchors.waist.value,
            source: "user_override",
          }],
        },
        benchmarks: {
          lift_results: [{
            date: PETER_AUDIT_REFERENCE_DATE,
            exercise: PETER_AUDIT_ASSUMPTIONS.anchors.benchTopSet.exercise,
            weight: PETER_AUDIT_ASSUMPTIONS.anchors.benchTopSet.weight,
            reps: PETER_AUDIT_ASSUMPTIONS.anchors.benchTopSet.reps,
            source: "user_override",
          }],
          run_results: [{
            date: PETER_AUDIT_REFERENCE_DATE,
            distanceMiles: PETER_AUDIT_ASSUMPTIONS.anchors.running.longestRecentRunMiles,
            paceText: PETER_AUDIT_ASSUMPTIONS.anchors.running.recentPaceText,
            source: "user_override",
          }],
        },
      },
    },
  };
};
