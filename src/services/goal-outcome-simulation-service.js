import { composeGoalNativePlan, normalizeGoals } from "../modules-planning.js";
import { buildPlannedDayRecord } from "../modules-checkins.js";
import {
  projectResolvedGoalToPlanningGoal,
  resolveGoalTranslation,
} from "./goal-resolution-service.js";
import { assessGoalFeasibility } from "./goal-feasibility-service.js";
import { buildGoalProgressTrackingFromGoals } from "./goal-progress-service.js";
import { buildTrainingContextFromEditor } from "./training-context-service.js";
import {
  buildGoalManagementPreview,
  GOAL_ARCHIVE_STATUSES,
  GOAL_MANAGEMENT_CHANGE_TYPES,
} from "./goal-management-service.js";
import { normalizePerformanceLogsCollection } from "./performance-record-service.js";

const SIMULATION_MODEL_VERSION = "2026-04-goal-outcome-simulation-v1";
const SIMULATION_BASE_WEEK = {
  phase: "BASE",
  label: "Foundation",
  mon: { t: "Easy", d: "30 min" },
  thu: { t: "Tempo", d: "22 min" },
  sat: { t: "Long", d: "40 min" },
  str: "A",
  nutri: "easyRun",
};
const SIMULATION_WEEK_TEMPLATES = [
  SIMULATION_BASE_WEEK,
  { phase: "BASE", label: "Foundation 2", mon: { t: "Easy", d: "35 min" }, thu: { t: "Tempo", d: "24 min" }, sat: { t: "Long", d: "45 min" }, str: "A", nutri: "easyRun" },
  { phase: "BUILD", label: "Build 1", mon: { t: "Easy", d: "35 min" }, thu: { t: "Tempo", d: "28 min" }, sat: { t: "Long", d: "50 min" }, str: "B", nutri: "hardRun" },
  { phase: "BUILD", label: "Build 2", mon: { t: "Easy", d: "40 min" }, thu: { t: "Intervals", d: "4 x 3 min" }, sat: { t: "Long", d: "55 min" }, str: "B", nutri: "hardRun" },
  { phase: "PEAK", label: "Peak", mon: { t: "Easy", d: "35 min" }, thu: { t: "Tempo", d: "32 min" }, sat: { t: "Long", d: "60 min" }, str: "A", nutri: "hardRun" },
  { phase: "DELOAD", label: "Reset", mon: { t: "Easy", d: "25 min" }, thu: { t: "Steady", d: "20 min" }, sat: { t: "Long", d: "35 min" }, str: "A", nutri: "easyRun" },
];

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const TARGET_HALF_SECONDS = 105 * 60;
const TARGET_BENCH_WEIGHT = 225;
const TARGET_BODYWEIGHT = 180;
const START_HALF_SECONDS_ASSUMPTION = 115 * 60;
const MAX_ARM_GROWTH_INDEX = 10;

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const toFiniteNumber = (value, fallback = null) => {
  if (value === "" || value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const round1 = (value = 0) => Number(Number(value || 0).toFixed(1));
const roundToHalf = (value = 0) => Math.round(Number(value || 0) * 2) / 2;
const roundToQuarter = (value = 0) => Math.round(Number(value || 0) * 4) / 4;
const cloneValue = (value = null) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const toDateKey = (value = new Date()) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (Number.isNaN(date.getTime())) return new Date().toISOString().split("T")[0];
  date.setHours(0, 0, 0, 0);
  return date.toISOString().split("T")[0];
};

const fromDateKey = (dateKey = "") => {
  const parsed = new Date(`${sanitizeText(dateKey, 24)}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const addDaysToDateKey = (dateKey = "", days = 0) => {
  const date = fromDateKey(dateKey);
  date.setDate(date.getDate() + Number(days || 0));
  return toDateKey(date);
};

const startOfWeekMonday = (value = "") => {
  const date = fromDateKey(value || new Date());
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  date.setDate(date.getDate() + diff);
  return toDateKey(date);
};

const createSeededRng = (seed = 1) => {
  let state = Math.abs(Math.round(Number(seed) || 1)) % 2147483647;
  if (state <= 0) state += 2147483646;
  return () => {
    state = (state * 16807) % 2147483647;
    return (state - 1) / 2147483646;
  };
};

const clamp = (value = 0, min = 0, max = 1) => Math.min(max, Math.max(min, value));

const formatSecondsAsClock = (seconds = 0) => {
  const safe = Math.max(0, Math.round(Number(seconds || 0)));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
};

const formatPace = (secondsPerMile = 0) => {
  const safe = Math.max(0, Math.round(Number(secondsPerMile || 0)));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};

const parseClockToSeconds = (value = "") => {
  const text = sanitizeText(value, 24);
  if (!text) return null;
  const parts = text.split(":").map((part) => Number(part));
  if (parts.some((part) => !Number.isFinite(part))) return null;
  if (parts.length === 3) return (parts[0] * 3600) + (parts[1] * 60) + parts[2];
  if (parts.length === 2) return (parts[0] * 60) + parts[1];
  return null;
};

const parseNumericTarget = (value = "") => {
  const match = String(value || "").match(/-?\d+(?:\.\d+)?/);
  return match ? Number(match[0]) : null;
};

const parseDurationMinutes = (value = "") => {
  const text = sanitizeText(value, 80).toLowerCase();
  const direct = text.match(/(\d{1,3})\s*min/);
  if (direct?.[1]) return Number(direct[1]);
  const intervalMatch = text.match(/(\d+)\s*x\s*(\d+)\s*min/);
  if (intervalMatch?.[1] && intervalMatch?.[2]) {
    return (Number(intervalMatch[1]) * Number(intervalMatch[2])) + 16;
  }
  return 35;
};

const parseSetCount = (value = "") => {
  const text = sanitizeText(value, 40);
  const match = text.match(/(\d+)/);
  return match?.[1] ? Math.max(1, Number(match[1])) : 3;
};

const parseRepCount = (value = "") => {
  const text = sanitizeText(value, 40);
  const exact = text.match(/(\d+)\s*(?:rep|reps)/i);
  if (exact?.[1]) return Math.max(1, Number(exact[1]));
  const range = text.match(/(\d+)\s*-\s*(\d+)/);
  if (range?.[1] && range?.[2]) {
    return Math.round((Number(range[1]) + Number(range[2])) / 2);
  }
  const fallback = text.match(/(\d+)/);
  return fallback?.[1] ? Math.max(1, Number(fallback[1])) : 8;
};

const resolveSessionFamily = (session = {}) => {
  const type = sanitizeText(session?.type || "", 60).toLowerCase();
  if (/rest|recovery|mobility|walk/.test(type)) return "recovery";
  if (/hard-run|easy-run|long-run|tempo|run/.test(type)) return "run";
  if (/strength|prehab/.test(type)) return "strength";
  if (/conditioning/.test(type)) return "conditioning";
  if (/run\+strength/.test(type) || /mixed/.test(type)) return "mixed";
  return "custom";
};

const buildGoalCompletenessFields = ({ goalText = "", currentBodyweight = null } = {}) => {
  const lower = sanitizeText(goalText, 160).toLowerCase();
  const fields = {};
  if (Number.isFinite(currentBodyweight)) {
    fields.current_bodyweight = { value: String(currentBodyweight), raw: String(currentBodyweight) };
  }
  if (/bench/.test(lower)) {
    fields.lift_focus = { value: "bench", raw: "Bench" };
  }
  if (/half marathon|marathon|10k|5k|run/.test(lower)) {
    fields.event_distance = { value: /half marathon/.test(lower) ? "half_marathon" : /marathon/.test(lower) ? "marathon" : /\b10k\b/.test(lower) ? "10k" : /\b5k\b/.test(lower) ? "5k" : "", raw: lower };
  }
  return fields;
};

const buildSimulationIntakePacket = ({
  rawGoalText = "",
  currentBodyweight = null,
  raceTargetDate = "",
  availableDays = [],
} = {}) => ({
  version: "2026-04-v1",
  intake: {
    rawGoalText,
    baselineContext: {
      primaryGoalLabel: rawGoalText,
      currentBaseline: "Intermediate hybrid trainee with real-life schedule variability.",
      experienceLevel: "Intermediate",
      fitnessLevel: "Intermediate",
    },
    scheduleReality: {
      trainingDaysPerWeek: 5,
      sessionLength: "45",
      trainingLocation: "Gym",
      availableDays,
    },
    equipmentAccessContext: {
      trainingLocation: "Gym",
      equipment: ["barbell", "rack", "bench", "dumbbells", "treadmill"],
    },
    injuryConstraintContext: {
      injuryText: "",
      constraints: [],
    },
    goalCompletenessContext: {
      fields: buildGoalCompletenessFields({
        goalText: rawGoalText,
        currentBodyweight,
      }),
    },
    userProvidedConstraints: {
      timingConstraints: [raceTargetDate].filter(Boolean),
      additionalContext: "",
      appearanceConstraints: [],
    },
  },
});

const resolveGoalFromText = ({
  rawGoalText = "",
  currentBodyweight = null,
  raceTargetDate = "",
  availableDays = [],
  priority = 1,
  role = "primary",
  now = new Date(),
} = {}) => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: rawGoalText,
    typedIntakePacket: buildSimulationIntakePacket({
      rawGoalText,
      currentBodyweight,
      raceTargetDate,
      availableDays,
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true, source: "goal_outcome_simulation" },
    now,
  });
  const resolvedGoal = cloneValue(resolution?.resolvedGoals?.[0] || null);
  if (!resolvedGoal) return null;
  resolvedGoal.planningPriority = priority;
  resolvedGoal.intakeConfirmedRole = role;
  return resolvedGoal;
};

const reorderResolvedGoals = (resolvedGoals = [], orderedGoalIds = []) => {
  const orderedMap = new Map((orderedGoalIds || []).map((goalId, index) => [goalId, index]));
  return [...(resolvedGoals || [])]
    .sort((left, right) => {
      const leftOrder = orderedMap.has(left?.id) ? orderedMap.get(left.id) : Number(left?.planningPriority || 999);
      const rightOrder = orderedMap.has(right?.id) ? orderedMap.get(right.id) : Number(right?.planningPriority || 999);
      return leftOrder - rightOrder;
    })
    .map((goal, index) => ({
      ...goal,
      planningPriority: index + 1,
      intakeConfirmedRole: index === 0 ? "primary" : index === 1 ? "maintained" : index === 2 ? "support" : "background",
    }));
};

const buildPlanningGoals = (resolvedGoals = []) => normalizeGoals(
  (resolvedGoals || []).map((resolvedGoal, index) => {
    const planningGoal = projectResolvedGoalToPlanningGoal(resolvedGoal, index);
    return {
      ...planningGoal,
      id: planningGoal.id || `goal_${index + 1}`,
      priority: index + 1,
      active: true,
    };
  })
);

const buildSimulationPersonalization = ({
  currentBodyweight = 193,
  availableDays = [],
} = {}) => {
  const trainingContext = buildTrainingContextFromEditor({
    mode: "Gym",
    equipment: "full_gym",
    equipmentItems: ["barbell", "rack", "bench", "dumbbells", "treadmill"],
    availableDays,
    time: "45",
    intensity: "Standard",
  });
  return {
    profile: {
      name: "Simulated athlete",
      age: 34,
      fitnessLevel: "intermediate",
      estimatedFitnessLevel: "intermediate",
      bodyweight: currentBodyweight,
      onboardingComplete: true,
      profileSetupComplete: true,
    },
    userGoalProfile: {
      days_per_week: 5,
      session_length: "45",
      equipment_access: ["full_gym"],
      available_days: availableDays,
    },
    trainingContext,
    goalManagement: {
      archivedGoals: [],
      history: [],
    },
    manualProgressInputs: {
      measurements: {
        bodyweight_baseline: [{
          date: "",
          value: currentBodyweight,
          source: "simulation",
        }],
      },
      benchmarks: {
        lift_results: [],
        run_results: [],
      },
    },
  };
};

const resolveSimulationTargets = ({
  resolvedGoals = [],
  currentBodyweight = 193,
} = {}) => {
  const activeGoals = toArray(resolvedGoals);
  const runGoal = activeGoals.find((goal) => goal?.planningCategory === "running");
  const benchGoal = activeGoals.find((goal) => /bench/i.test(`${goal?.summary || ""} ${goal?.primaryMetric?.label || ""}`));
  const bodyCompGoal = activeGoals.find((goal) => goal?.planningCategory === "body_comp");
  const runTargetSeconds = parseClockToSeconds(runGoal?.primaryMetric?.targetValue || "") || TARGET_HALF_SECONDS;
  const benchTargetWeight = parseNumericTarget(benchGoal?.primaryMetric?.targetValue || "") || TARGET_BENCH_WEIGHT;
  let bodyweightTarget = TARGET_BODYWEIGHT;
  const bodyCompMetricKey = sanitizeText(bodyCompGoal?.primaryMetric?.key || "", 60).toLowerCase();
  if (bodyCompMetricKey === "bodyweight_target") {
    bodyweightTarget = parseNumericTarget(bodyCompGoal?.primaryMetric?.targetValue || "") || TARGET_BODYWEIGHT;
  } else if (bodyCompMetricKey === "bodyweight_change") {
    const delta = parseNumericTarget(bodyCompGoal?.primaryMetric?.targetValue || "");
    bodyweightTarget = Number.isFinite(delta) ? round1(currentBodyweight + delta) : TARGET_BODYWEIGHT;
  }
  return {
    runTargetSeconds,
    benchTargetWeight,
    bodyweightTarget,
  };
};

const buildWeeklyEvent = ({ week = 1, rng = () => 0.5 } = {}) => {
  const generic = {
    label: "steady week",
    travel: false,
    illness: false,
    workStress: false,
    motivationWave: "normal",
    nutritionDrift: false,
    underRecovered: false,
    swapThursdayRun: rng() < 0.58,
    shortenSaturdayKey: rng() < 0.44,
    addArmWork: rng() < 0.74,
    skipMobility: rng() < 0.62,
    goodWeek: false,
    taper: false,
  };
  if (week === 4) return { ...generic, label: "travel week", travel: true, nutritionDrift: true, underRecovered: true };
  if (week === 8) return { ...generic, label: "mild illness week", illness: true, underRecovered: true, nutritionDrift: true };
  if (week === 13) return { ...generic, label: "stressful work week", workStress: true, motivationWave: "low", nutritionDrift: true, shortenSaturdayKey: true };
  if (week === 18) return { ...generic, label: "strong momentum week", goodWeek: true, motivationWave: "high", swapThursdayRun: false, shortenSaturdayKey: false };
  if (week === 22) return { ...generic, label: "busy but resilient week", workStress: true, shortenSaturdayKey: rng() < 0.3, swapThursdayRun: true };
  if (week >= 25 && week <= 26) return { ...generic, label: "taper week", taper: true, swapThursdayRun: false, shortenSaturdayKey: false };
  return generic;
};

const resolvePriorityChangeTargets = ({ goals = [], eventWeekPassed = false, bodyweightAchieved = false } = {}) => {
  const activeGoals = (goals || []).filter((goal) => goal?.active !== false);
  if (!activeGoals.length) return [];
  const byId = Object.fromEntries(activeGoals.map((goal) => [goal.id, goal]));
  const benchGoal = activeGoals.find((goal) => /bench/i.test(`${goal?.name || ""} ${goal?.resolvedGoal?.summary || ""}`));
  const runGoal = activeGoals.find((goal) => goal?.category === "running");
  const bodyCompGoal = activeGoals.find((goal) => goal?.category === "body_comp");
  const armGoal = activeGoals.find((goal) => /arm|bicep|tricep|muscle/i.test(`${goal?.name || ""} ${goal?.resolvedGoal?.summary || ""}`) && goal?.category === "strength");
  if (eventWeekPassed && benchGoal) {
    return [
      benchGoal.id,
      ...(armGoal?.id ? [armGoal.id] : []),
      ...(runGoal?.id ? [runGoal.id] : []),
      ...(bodyCompGoal?.id && !bodyweightAchieved ? [bodyCompGoal.id] : []),
    ].filter(Boolean);
  }
  return [
    ...(runGoal?.id ? [runGoal.id] : []),
    ...(bodyCompGoal?.id && !bodyweightAchieved ? [bodyCompGoal.id] : []),
    ...(benchGoal?.id ? [benchGoal.id] : []),
    ...(armGoal?.id ? [armGoal.id] : []),
  ].filter(Boolean);
};

const resolveExerciseWeight = ({ exerciseName = "", currentBenchWeight = 155 } = {}) => {
  const text = sanitizeText(exerciseName, 120).toLowerCase();
  if (/bench press top set|bench press/.test(text)) return roundToHalf(currentBenchWeight);
  if (/incline/.test(text)) return roundToHalf(currentBenchWeight * 0.78);
  if (/db shoulder press|shoulder press|overhead/.test(text)) return roundToHalf(currentBenchWeight * 0.45);
  if (/row|pull-up|pull up|pull-down|pulldown/.test(text)) return roundToHalf(currentBenchWeight * 0.8);
  if (/tricep|pressdown|skull crusher|close-grip/.test(text)) return roundToHalf(currentBenchWeight * 0.35);
  if (/curl|hammer curl|preacher/.test(text)) return roundToHalf(currentBenchWeight * 0.25);
  if (/lateral raise|front raise|rear delt|face pull/.test(text)) return roundToHalf(currentBenchWeight * 0.12);
  if (/squat/.test(text)) return roundToHalf(currentBenchWeight * 1.45);
  if (/romanian deadlift|deadlift|hinge/.test(text)) return roundToHalf(currentBenchWeight * 1.5);
  return null;
};

const buildStrengthPerformanceRows = ({
  exercises = [],
  currentBenchWeight = 155,
  completionFactor = 1,
} = {}) => (
  toArray(exercises)
    .map((exercise = {}) => {
      const exerciseName = sanitizeText(exercise?.ex || exercise?.exercise || "", 120);
      if (!exerciseName) return null;
      const sets = Math.max(1, Math.round(parseSetCount(exercise?.sets || "") * completionFactor));
      const reps = Math.max(1, Math.round(parseRepCount(exercise?.reps || "") * (completionFactor < 1 ? completionFactor : 1)));
      return {
        exercise: exerciseName,
        weightUsed: resolveExerciseWeight({ exerciseName, currentBenchWeight }),
        actualWeight: resolveExerciseWeight({ exerciseName, currentBenchWeight }),
        prescribedWeight: resolveExerciseWeight({ exerciseName, currentBenchWeight }),
        repsCompleted: reps,
        actualReps: reps,
        actualSets: sets,
        prescribedSets: parseSetCount(exercise?.sets || ""),
        prescribedReps: parseRepCount(exercise?.reps || ""),
        bodyweightOnly: /push-up|push up|carry|plank|dead bug|bird dog|wall slide/.test(exerciseName.toLowerCase()),
        bandTension: /band /.test(exerciseName.toLowerCase()) ? "light" : null,
        completionRatio: Number(completionFactor.toFixed(2)),
        feelThisSession: completionFactor >= 1 ? 3 : 4,
        sessionFeelScore: completionFactor >= 1 ? 3 : 4,
      };
    })
    .filter(Boolean)
);

const buildExtraArmRows = ({ currentBenchWeight = 155 } = {}) => ([
  {
    exercise: "Cable curl or DB curl",
    weightUsed: roundToHalf(currentBenchWeight * 0.25),
    actualWeight: roundToHalf(currentBenchWeight * 0.25),
    prescribedWeight: roundToHalf(currentBenchWeight * 0.25),
    repsCompleted: 12,
    actualReps: 12,
    actualSets: 2,
    prescribedSets: 2,
    prescribedReps: 12,
    bodyweightOnly: false,
    bandTension: null,
    completionRatio: 1,
    feelThisSession: 3,
    sessionFeelScore: 3,
  },
  {
    exercise: "Cable pressdown or DB triceps extension",
    weightUsed: roundToHalf(currentBenchWeight * 0.3),
    actualWeight: roundToHalf(currentBenchWeight * 0.3),
    prescribedWeight: roundToHalf(currentBenchWeight * 0.3),
    repsCompleted: 12,
    actualReps: 12,
    actualSets: 2,
    prescribedSets: 2,
    prescribedReps: 12,
    bodyweightOnly: false,
    bandTension: null,
    completionRatio: 1,
    feelThisSession: 3,
    sessionFeelScore: 3,
  },
]);

const buildRunMetrics = ({
  session = {},
  currentHalfSeconds = START_HALF_SECONDS_ASSUMPTION,
  completionFactor = 1,
  taper = false,
} = {}) => {
  const family = resolveSessionFamily(session);
  const plannedMinutes = parseDurationMinutes(session?.run?.d || session?.run?.duration || session?.detail || "");
  const basePace = currentHalfSeconds / 13.1;
  const paceSeconds = family === "long-run"
    ? basePace + (taper ? 55 : 75)
    : family === "hard-run"
    ? basePace + 15
    : family === "conditioning"
    ? basePace + 50
    : basePace + 90;
  const actualMinutes = Math.max(16, Math.round(plannedMinutes * completionFactor));
  const distanceMiles = roundToQuarter((actualMinutes * 60) / paceSeconds);
  return {
    durationMinutes: actualMinutes,
    distanceMiles,
    paceSeconds: Math.round(paceSeconds),
    paceText: formatPace(paceSeconds),
  };
};

const buildDailyCheckin = ({
  dateKey = "",
  status = "completed_as_planned",
  feel = 3,
  event = {},
  note = "",
} = {}) => ({
  status,
  sessionFeel: feel >= 4 ? "harder_than_expected" : feel <= 2 ? "easier_than_expected" : "about_right",
  blocker: status === "skipped"
    ? event?.travel
      ? "schedule_travel"
      : event?.illness
      ? "pain_injury"
      : event?.workStress
      ? "time"
      : "motivation"
    : "",
  note: sanitizeText(note, 220),
  readiness: {
    sleep: event?.underRecovered ? 2 : 3,
    stress: event?.workStress ? 4 : event?.travel ? 4 : 2,
    soreness: event?.illness ? 4 : event?.underRecovered ? 3 : 2,
  },
  ts: new Date(`${dateKey}T12:00:00`).getTime(),
  dateKey,
});

const buildLogEntry = ({
  dateKey = "",
  session = {},
  status = "completed_as_planned",
  selection = "completed",
  modality = "",
  note = "",
  runMetrics = null,
  strengthPerformance = [],
  swapLabel = "",
  modified = false,
  swapped = false,
} = {}) => {
  const sessionType = sanitizeText(session?.type || "", 80).toLowerCase() || "session";
  const sessionLabel = sanitizeText(session?.label || "Session", 120) || "Session";
  const feel = status === "skipped" ? "2" : modified ? "4" : "3";
  return {
    date: dateKey,
    type: sessionLabel,
    miles: runMetrics?.distanceMiles ? String(runMetrics.distanceMiles) : "",
    pace: runMetrics?.paceText || "",
    runTime: runMetrics?.durationMinutes ? String(runMetrics.durationMinutes) : "",
    notes: sanitizeText(note, 220),
    feel,
    location: /strength/.test(sessionType) ? "gym" : "outdoor",
    strengthPerformance,
    checkin: {
      status,
      feelRating: feel,
      note: sanitizeText(note, 220),
      ts: new Date(`${dateKey}T12:00:00`).getTime(),
    },
    actualSession: {
      status,
      completionKind: status === "skipped"
        ? "skipped"
        : swapped
        ? "custom_session"
        : modified
        ? "modified"
        : "as_prescribed",
      sessionType,
      sessionLabel: swapped ? (swapLabel || `${sessionLabel} substitute`) : sessionLabel,
      sessionFamily: resolveSessionFamily(session),
      modifiedFromPlan: Boolean(modified || swapped),
      swapFromPlan: Boolean(swapped),
      userSelection: selection,
      modality: modality || (/run/.test(sessionType) ? "run" : /conditioning/.test(sessionType) ? "bike" : "strength"),
      rpe: status === "skipped" ? "" : modified ? "8" : "7",
      bodyStatus: status === "skipped" ? "low_energy" : "",
      recoveryState: "",
      swapLabel: swapped ? (swapLabel || sessionLabel) : "",
      loggedAt: new Date(`${dateKey}T12:00:00`).getTime(),
    },
    editedAt: new Date(`${dateKey}T12:00:00`).getTime(),
    ts: new Date(`${dateKey}T12:00:00`).getTime(),
  };
};

const buildPlannedDayFromSession = ({
  dateKey = "",
  weekNumber = 1,
  session = {},
} = {}) => buildPlannedDayRecord({
  id: `sim_plan_day_${dateKey}`,
  dateKey,
  week: {
    number: weekNumber,
    label: `Sim Week ${weekNumber}`,
  },
  base: {
    training: cloneValue(session),
    nutrition: null,
    recovery: null,
    supplements: null,
  },
  resolved: {
    training: cloneValue(session),
    nutrition: null,
    recovery: null,
    supplements: null,
  },
  decision: {},
  provenance: {
    summary: "Goal outcome simulation",
    sourceKind: "simulation",
  },
  flags: {},
});

const getDayDateKey = (weekStartDateKey = "", plannerDay = 0) => {
  const normalized = Number(plannerDay);
  if (normalized === 0) return addDaysToDateKey(weekStartDateKey, 6);
  return addDaysToDateKey(weekStartDateKey, normalized - 1);
};

const findGoalByPattern = (goals = [], pattern = /.^/) => (
  (goals || []).find((goal) => pattern.test(`${goal?.name || ""} ${goal?.resolvedGoal?.summary || ""}`))
);

const resolveGoalIdsByPurpose = (goals = []) => ({
  run: findGoalByPattern(goals, /half marathon|marathon|10k|5k|run/i)?.id || "",
  bench: findGoalByPattern(goals, /bench/i)?.id || "",
  bodyComp: findGoalByPattern(goals, /cut|lose|lean/i)?.id || "",
  arms: findGoalByPattern(goals, /arm|bicep|tricep/i)?.id || "",
});

const maybeApplyGoalManagementChange = ({
  state = {},
  now = new Date(),
  orderedGoalIds = [],
  archiveGoalId = "",
  archiveStatus = GOAL_ARCHIVE_STATUSES.completed,
} = {}) => {
  let nextState = state;
  if (orderedGoalIds.length >= 2) {
    const preview = buildGoalManagementPreview({
      goals: nextState.goals,
      personalization: nextState.personalization,
      change: {
        type: GOAL_MANAGEMENT_CHANGE_TYPES.reprioritize,
        orderedGoalIds,
      },
      now,
    });
    if (preview?.nextGoals) {
      nextState = {
        ...nextState,
        goals: normalizeGoals(preview.nextGoals),
        personalization: {
          ...nextState.personalization,
          goalManagement: preview.nextGoalManagement,
        },
      };
    }
  }
  if (archiveGoalId) {
    const preview = buildGoalManagementPreview({
      goals: nextState.goals,
      personalization: nextState.personalization,
      change: {
        type: GOAL_MANAGEMENT_CHANGE_TYPES.archive,
        goalId: archiveGoalId,
        archiveStatus,
      },
      now,
    });
    if (preview?.nextGoals) {
      nextState = {
        ...nextState,
        goals: normalizeGoals(preview.nextGoals),
        personalization: {
          ...nextState.personalization,
          goalManagement: preview.nextGoalManagement,
        },
      };
    }
  }
  return nextState;
};

const buildWeeklyNutritionScore = ({ event = {}, completedCount = 0, plannedCount = 0 } = {}) => {
  const adherence = plannedCount > 0 ? completedCount / plannedCount : 0.7;
  let score = 0.77 + ((adherence - 0.7) * 0.2);
  if (event?.nutritionDrift) score -= 0.14;
  if (event?.travel) score -= 0.08;
  if (event?.goodWeek) score += 0.08;
  if (event?.taper) score += 0.04;
  return clamp(Number(score.toFixed(2)), 0.45, 0.96);
};

const buildWeekSummary = ({
  week = 1,
  weekStartDateKey = "",
  composer = null,
  goals = [],
  event = {},
  adherence = {},
  currentWeight = 0,
  currentBenchWeight = 0,
  currentHalfSeconds = START_HALF_SECONDS_ASSUMPTION,
  armGrowthIndex = 0,
  completedGoals = [],
  notes = [],
} = {}) => ({
  week,
  weekStartDateKey,
  architecture: sanitizeText(composer?.architecture || "", 80),
  activeGoals: (goals || []).filter((goal) => goal?.active !== false).map((goal) => sanitizeText(goal?.name || goal?.resolvedGoal?.summary || "", 160)),
  eventLabel: sanitizeText(event?.label || "", 120),
  plannedSessionCount: adherence.plannedSessionCount || 0,
  completedSessionCount: adherence.completedSessionCount || 0,
  adherencePct: adherence.plannedSessionCount > 0 ? Number((adherence.completedSessionCount / adherence.plannedSessionCount).toFixed(2)) : 0,
  weeklyNutritionScore: adherence.nutritionScore || 0,
  bodyweight: round1(currentWeight),
  benchWorkingWeight: roundToHalf(currentBenchWeight),
  estimatedHalfMarathonTime: formatSecondsAsClock(currentHalfSeconds),
  armGrowthIndex: Number(armGrowthIndex.toFixed(1)),
  completedGoals: completedGoals.map((goal) => sanitizeText(goal, 120)),
  notes: notes.map((note) => sanitizeText(note, 180)).filter(Boolean).slice(0, 5),
});

const scoreSimulation = ({
  intakeDiagnostics = {},
  feasibility = null,
  finalWeight = 0,
  finalBenchWeight = 0,
  finalHalfSeconds = START_HALF_SECONDS_ASSUMPTION,
  armGrowthIndex = 0,
  habitsAdapted = {},
  completedGoals = [],
  targets = {},
} = {}) => {
  const benchTargetWeight = Number.isFinite(Number(targets?.benchTargetWeight)) ? Number(targets.benchTargetWeight) : TARGET_BENCH_WEIGHT;
  const runTargetSeconds = Number.isFinite(Number(targets?.runTargetSeconds)) ? Number(targets.runTargetSeconds) : TARGET_HALF_SECONDS;
  const bodyweightTarget = Number.isFinite(Number(targets?.bodyweightTarget)) ? Number(targets.bodyweightTarget) : TARGET_BODYWEIGHT;
  const resolutionGoals = intakeDiagnostics?.goals || [];
  const measurableResolvedCount = resolutionGoals.filter((goal) => goal?.primaryMetric || goal?.planningCategory === "strength").length;
  const intakeScore = clamp(
    55
      + (measurableResolvedCount * 8)
      + (feasibility?.targetValidation?.clarificationRequired ? -12 : 0)
      + ((feasibility?.blockingReasons || []).length ? -10 : 0)
      + ((feasibility?.warningReasons || []).length ? -4 : 0),
    0,
    100,
  );
  const planningScore = clamp(
    58
      + (habitsAdapted?.longRunMovedOffSaturday ? 10 : -4)
      + (habitsAdapted?.qualityRunMovedOffThursday ? 8 : -2)
      + (habitsAdapted?.armPreferenceLearned ? 6 : 0)
      + ((feasibility?.conflictFlags || []).length ? -6 : 4),
    0,
    100,
  );
  const outcomesScore = clamp(
    15
      + (finalWeight <= bodyweightTarget + 0.5 ? 28 : finalWeight <= bodyweightTarget + 3 ? 18 : 8)
      + (finalHalfSeconds <= runTargetSeconds ? 26 : finalHalfSeconds <= (runTargetSeconds + 5 * 60) ? 16 : 6)
      + (finalBenchWeight >= benchTargetWeight ? 26 : finalBenchWeight >= (benchTargetWeight - 30) ? 12 : 4)
      + (armGrowthIndex >= 7 ? 10 : armGrowthIndex >= 4.5 ? 6 : 2)
      + (completedGoals.length * 2),
    0,
    100,
  );
  const scienceHonestyScore = clamp(
    65
      + (feasibility?.targetValidation?.clarificationRequired ? 6 : 0)
      + ((feasibility?.warningReasons || []).length ? 4 : 0)
      + ((feasibility?.blockingReasons || []).length ? 6 : 0),
    0,
    100,
  );
  const totalScore = Math.round(
    (intakeScore * 0.24)
    + (planningScore * 0.26)
    + (outcomesScore * 0.34)
    + (scienceHonestyScore * 0.16)
  );
  return {
    intakeScore,
    planningScore,
    outcomesScore,
    scienceHonestyScore,
    totalScore,
  };
};

export const runGoalOutcomeSimulation = ({
  now = "2026-04-22",
  durationWeeks = 30,
  raceTargetDate = "2026-10-18",
  seed = 20260422,
  goalInputs = [
    { text: "Bench 225 x 3 x 6", current: { weight: 155, reps: 6, sets: 4 } },
    { text: "Run a 1:45 half marathon" },
    { text: "Cut to 180 pounds" },
    { text: "Build arm muscle" },
  ],
} = {}) => {
  const startDateKey = startOfWeekMonday(now);
  const rng = createSeededRng(seed);
  const availableDays = ["mon", "tue", "thu", "fri", "sat", "sun"];

  let resolvedGoals = goalInputs
    .map((goalInput, index) => resolveGoalFromText({
      rawGoalText: goalInput?.text || "",
      currentBodyweight: TARGET_BODYWEIGHT + 13,
      raceTargetDate: /half marathon|marathon|10k|5k/i.test(goalInput?.text || "") ? raceTargetDate : "",
      availableDays,
      priority: index + 1,
      role: index === 0 ? "primary" : index === 1 ? "maintained" : index === 2 ? "support" : "background",
      now,
    }))
    .filter(Boolean);

  const feasibility = assessGoalFeasibility({
    resolvedGoals,
    userBaseline: {
      experienceLevel: "intermediate",
      fitnessLevel: "intermediate",
      currentBaseline: "Bench press 155 x 4 x 6, bodyweight 193 lb, no explicit run benchmark captured yet.",
      primaryGoalLabel: resolvedGoals[0]?.summary || "",
    },
    scheduleReality: {
      trainingDaysPerWeek: 5,
      sessionLength: "45",
    },
    intakeCompleteness: {
      facts: {
        current_bodyweight: 193,
        current_strength_baseline: "Bench press 155 x 4 x 6",
      },
      missingRequired: ["Current running baseline"],
      missingOptional: ["Current waist measurement"],
    },
    currentExperienceContext: {
      equipment: ["barbell", "rack", "bench", "dumbbells", "treadmill"],
      trainingLocation: "Gym",
    },
    now,
  });

  const reorderedResolvedGoals = reorderResolvedGoals(
    resolvedGoals,
    toArray(feasibility?.recommendedPriorityOrdering).map((item) => item?.goalId).filter(Boolean)
  );
  const simulationTargets = resolveSimulationTargets({
    resolvedGoals: reorderedResolvedGoals,
    currentBodyweight: 193,
  });
  const goals = buildPlanningGoals(reorderedResolvedGoals);

  let state = {
    goals,
    personalization: buildSimulationPersonalization({
      currentBodyweight: 193,
      availableDays,
    }),
    logs: {},
    dailyCheckins: {},
    weeklyCheckins: {},
    plannedDayRecords: {},
    bodyweights: [{ date: startDateKey, w: 193 }],
    currentWeight: 193,
    currentBenchWeight: 155,
    currentHalfSeconds: START_HALF_SECONDS_ASSUMPTION,
    armGrowthIndex: 0,
    achievedGoals: [],
    weeklySnapshots: [],
    benchmarkWarnings: ["No current running benchmark was provided, so the half-marathon projection starts from a low-confidence estimate."],
    habitNotes: [],
  };

  state.personalization.manualProgressInputs.measurements.bodyweight_baseline[0].date = startDateKey;
  state.personalization.manualProgressInputs.benchmarks.lift_results.push({
    date: startDateKey,
    exercise: "Bench Press",
    weight: 155,
    reps: 6,
    sets: 4,
    source: "simulation_baseline",
  });

  for (let week = 1; week <= durationWeeks; week += 1) {
    const weekStartDateKey = addDaysToDateKey(startDateKey, (week - 1) * 7);
    const safeNow = new Date(`${addDaysToDateKey(weekStartDateKey, 2)}T12:00:00`);
    const event = buildWeeklyEvent({ week, rng });
    const eventWeekPassed = fromDateKey(weekStartDateKey).getTime() > fromDateKey(raceTargetDate).getTime();
    const goalIds = resolveGoalIdsByPurpose(state.goals);

    if (week === 1 || eventWeekPassed || state.currentWeight <= (simulationTargets.bodyweightTarget + 0.5)) {
      state = maybeApplyGoalManagementChange({
        state,
        now: safeNow,
        orderedGoalIds: resolvePriorityChangeTargets({
          goals: state.goals,
          eventWeekPassed,
          bodyweightAchieved: state.currentWeight <= (simulationTargets.bodyweightTarget + 0.5),
        }),
      });
    }

    if (goalIds.bodyComp && state.currentWeight <= (simulationTargets.bodyweightTarget + 0.5) && !state.achievedGoals.includes(goalIds.bodyComp)) {
      state = maybeApplyGoalManagementChange({
        state,
        now: safeNow,
        archiveGoalId: goalIds.bodyComp,
        archiveStatus: GOAL_ARCHIVE_STATUSES.completed,
      });
      state.achievedGoals = [...state.achievedGoals, goalIds.bodyComp];
    }

    const recentSnapshots = state.weeklySnapshots.slice(-4);
    const recentAdherence = recentSnapshots.length
      ? recentSnapshots.reduce((sum, snapshot) => sum + Number(snapshot.adherencePct || 0), 0) / recentSnapshots.length
      : 0.78;
    const momentum = {
      inconsistencyRisk: recentAdherence >= 0.8 ? "low" : recentAdherence >= 0.68 ? "medium" : "high",
      momentumState: recentAdherence >= 0.8 ? "stable" : recentAdherence >= 0.68 ? "mixed" : "fragile",
    };
    const learningLayer = {
      adjustmentBias: recentAdherence < 0.68 ? "simplify" : "steady",
    };
    const composer = composeGoalNativePlan({
      goals: state.goals,
      personalization: state.personalization,
      momentum,
      learningLayer,
      baseWeek: SIMULATION_BASE_WEEK,
      currentWeek: week,
      weekTemplates: SIMULATION_WEEK_TEMPLATES,
      logs: state.logs,
      bodyweights: state.bodyweights,
      dailyCheckins: state.dailyCheckins,
      nutritionActualLogs: {},
      weeklyNutritionReview: null,
      coachActions: [],
      todayKey: addDaysToDateKey(weekStartDateKey, 2),
      currentDayOfWeek: 3,
      plannedDayRecords: state.plannedDayRecords,
      planWeekRecords: {},
    });

    const weekPlannedDayRecords = {};
    const weekLogs = {};
    const weekDailyCheckins = {};
    const noteLines = [];
    let plannedSessionCount = 0;
    let completedSessionCount = 0;
    let completedBenchSessions = 0;
    let completedRunSessions = 0;
    let completedQualityRuns = 0;
    let completedLongRuns = 0;
    let lowerBodyStrengthSessions = 0;
    let armAccessoryTouches = 0;
    let upperCompoundTouches = 0;

    Object.entries(composer?.dayTemplates || {}).forEach(([dayKey, session]) => {
      if (!session) return;
      const dateKey = getDayDateKey(weekStartDateKey, Number(dayKey));
      weekPlannedDayRecords[dateKey] = buildPlannedDayFromSession({
        dateKey,
        weekNumber: week,
        session,
      });
      const family = resolveSessionFamily(session);
      if (family === "recovery" || session?.isRecoverySlot) return;
      plannedSessionCount += 1;
    });

    const fridayDateKey = getDayDateKey(weekStartDateKey, 5);
    const thursdayDateKey = getDayDateKey(weekStartDateKey, 4);
    const saturdayDateKey = getDayDateKey(weekStartDateKey, 6);

    Object.entries(composer?.dayTemplates || {}).forEach(([dayKey, session]) => {
      if (!session) return;
      const numericDay = Number(dayKey);
      const dateKey = getDayDateKey(weekStartDateKey, numericDay);
      const family = resolveSessionFamily(session);
      if (family === "recovery" || session?.isRecoverySlot) return;

      let targetDateKey = dateKey;
      let skippedPlannedDay = false;
      let modified = false;
      let swapped = false;

      if (numericDay === 4 && family === "run" && /hard-run/.test(session?.type || "") && event.swapThursdayRun && composer?.dayTemplates?.[5]) {
        skippedPlannedDay = true;
        swapped = true;
        targetDateKey = fridayDateKey;
        noteLines.push("Quality run drifted from Thursday to Friday again.");
        weekLogs[dateKey] = buildLogEntry({
          dateKey,
          session,
          status: "skipped",
          selection: "skipped",
          modality: "run",
          note: "Could not get the hard run done on Thursday.",
        });
        weekDailyCheckins[dateKey] = buildDailyCheckin({
          dateKey,
          status: "skipped",
          feel: 2,
          event,
          note: "Hard run slipped to Friday.",
        });
      }

      if (skippedPlannedDay) return;

      let status = "completed_as_planned";
      let completionFactor = 1;
      if (family === "run" && numericDay === 6 && event.shortenSaturdayKey) {
        status = "completed_modified";
        modified = true;
        completionFactor = 0.7;
        noteLines.push("Weekend key session got shortened.");
      } else if ((event.travel || event.illness) && rng() < 0.3) {
        status = "skipped";
        completionFactor = 0;
      } else if (event.workStress && rng() < 0.18) {
        status = "completed_modified";
        modified = true;
        completionFactor = 0.8;
      }

      let runMetrics = null;
      let strengthPerformance = [];
      let modality = family === "conditioning" ? "bike" : family === "run" || family === "mixed" ? "run" : "strength";

      if (family === "run" || family === "mixed" || family === "conditioning") {
        runMetrics = status === "skipped"
          ? null
          : buildRunMetrics({
              session,
              currentHalfSeconds: state.currentHalfSeconds,
              completionFactor,
              taper: event.taper,
            });
      }

      if (family === "strength" || family === "mixed") {
        strengthPerformance = status === "skipped"
          ? []
          : buildStrengthPerformanceRows({
              exercises: session?.prescribedExercises || [],
              currentBenchWeight: state.currentBenchWeight,
              completionFactor,
            });
        if (event.addArmWork && /upper|bench|maintenance|strength/i.test(`${session?.label || ""} ${session?.type || ""}`)) {
          strengthPerformance = [...strengthPerformance, ...buildExtraArmRows({ currentBenchWeight: state.currentBenchWeight })];
          modified = true;
          if (status === "completed_as_planned") status = "completed_modified";
          noteLines.push("Extra arm work kept getting added.");
        }
      }

      weekLogs[targetDateKey] = buildLogEntry({
        dateKey: targetDateKey,
        session,
        status,
        selection: status === "skipped" ? "skipped" : swapped ? "swapped" : modified ? "partial" : "completed",
        modality,
        note: status === "skipped"
          ? event.travel
            ? "Travel disrupted the session."
            : event.illness
            ? "Session missed due to low recovery."
            : "Real-life friction won this day."
          : modified
          ? "Session completed with a realistic modification."
          : "",
        runMetrics,
        strengthPerformance,
        swapLabel: swapped ? "Friday quality run" : "",
        modified,
        swapped,
      });
      weekDailyCheckins[targetDateKey] = buildDailyCheckin({
        dateKey: targetDateKey,
        status,
        feel: status === "completed_as_planned" ? 3 : status === "skipped" ? 2 : 4,
        event,
        note: modified ? "Modified for real life." : "",
      });

      if (status !== "skipped") {
        completedSessionCount += 1;
        if (family === "run" || family === "mixed" || family === "conditioning") completedRunSessions += 1;
        if (family === "run" && /hard-run/.test(session?.type || "")) completedQualityRuns += 1;
        if (family === "run" && /long-run/.test(session?.type || "")) completedLongRuns += 1;
        if (family === "strength" || family === "mixed") {
          const corpus = `${session?.label || ""} ${(session?.prescribedExercises || []).map((exercise) => exercise?.ex || "").join(" ")}`.toLowerCase();
          if (/bench|upper|maintenance|push/.test(corpus)) completedBenchSessions += 1;
          if (/squat|rdl|split squat|lunge|lower/.test(corpus)) lowerBodyStrengthSessions += 1;
          const upperRows = strengthPerformance.filter((row) => /bench|press|row|pull|curl|tricep|lateral|face pull/.test(String(row?.exercise || "").toLowerCase()));
          upperCompoundTouches += upperRows.filter((row) => /bench|press|row|pull/.test(String(row?.exercise || "").toLowerCase())).length;
          armAccessoryTouches += upperRows.filter((row) => /curl|tricep|pressdown|hammer|skull crusher/.test(String(row?.exercise || "").toLowerCase())).length;
        }
      }
    });

    state.logs = normalizePerformanceLogsCollection({
      ...state.logs,
      ...weekLogs,
    });
    state.dailyCheckins = {
      ...state.dailyCheckins,
      ...weekDailyCheckins,
    };
    state.plannedDayRecords = {
      ...state.plannedDayRecords,
      ...weekPlannedDayRecords,
    };
    state.weeklyCheckins[weekStartDateKey] = {
      ts: new Date(`${weekStartDateKey}T12:00:00`).getTime(),
      energy: event.illness ? 2 : event.workStress ? 2 : 3,
      stress: event.travel || event.workStress ? 4 : 2,
      confidence: completedSessionCount >= Math.max(1, plannedSessionCount - 1) ? 4 : 3,
    };

    const nutritionScore = buildWeeklyNutritionScore({
      event,
      completedCount: completedSessionCount,
      plannedCount: plannedSessionCount,
    });
    const weightGapFactor = clamp((state.currentWeight - simulationTargets.bodyweightTarget) / Math.max(6, 193 - simulationTargets.bodyweightTarget), 0.2, 1);
    const weightDelta = clamp(
      Number(((-0.18 - (nutritionScore * 0.42) - (completedRunSessions * 0.04) - (completedLongRuns * 0.06) + (event.travel ? 0.18 : 0) + (event.illness ? 0.14 : 0) + (event.goodWeek ? -0.08 : 0)) * weightGapFactor).toFixed(2)),
      -1.05,
      0.45,
    );
    state.currentWeight = round1(state.currentWeight + weightDelta);
    state.bodyweights = [...state.bodyweights, { date: addDaysToDateKey(weekStartDateKey, 6), w: state.currentWeight }];

    const benchHeadroom = clamp((simulationTargets.benchTargetWeight - state.currentBenchWeight) / Math.max(25, simulationTargets.benchTargetWeight - 155), 0.18, 1);
    const benchDelta = clamp(
      Number((((completedBenchSessions * 0.95) + (armAccessoryTouches * 0.08) + (upperCompoundTouches * 0.02) - (completedQualityRuns * 0.35) - (completedLongRuns * 0.42) - (Math.abs(Math.min(weightDelta, 0)) * 0.7) - (event.illness ? 0.9 : 0) + (event.goodWeek ? 0.35 : 0)) * benchHeadroom).toFixed(2)),
      -1.25,
      2.2,
    );
    state.currentBenchWeight = roundToHalf(state.currentBenchWeight + benchDelta);

    const runHeadroom = clamp((state.currentHalfSeconds - simulationTargets.runTargetSeconds) / Math.max(4 * 60, START_HALF_SECONDS_ASSUMPTION - simulationTargets.runTargetSeconds), 0.2, 1);
    const runImprovementSeconds = clamp(
      Number((((completedQualityRuns * 12) + (completedLongRuns * 14) + ((completedRunSessions - completedQualityRuns - completedLongRuns) * 5) + ((193 - state.currentWeight) * 0.7) - (completedBenchSessions * 2.5) - (lowerBodyStrengthSessions * 3.5) - (event.illness ? 18 : 0) - (event.travel ? 8 : 0) - ((nutritionScore < 0.68) ? 10 : 0) + (event.goodWeek ? 8 : 0)) * runHeadroom).toFixed(1)),
      -25,
      38,
    );
    state.currentHalfSeconds = Math.max(simulationTargets.runTargetSeconds - 120, Math.round(state.currentHalfSeconds - runImprovementSeconds));

    const armDelta = clamp(
      Number((((armAccessoryTouches * 0.12) + (completedBenchSessions * 0.05) + (upperCompoundTouches * 0.008) - (Math.abs(Math.min(weightDelta, 0)) * 0.16) - (event.illness ? 0.32 : 0) + (event.goodWeek ? 0.16 : 0))).toFixed(2)),
      -0.12,
      0.42,
    );
    state.armGrowthIndex = clamp(Number((state.armGrowthIndex + armDelta).toFixed(1)), 0, MAX_ARM_GROWTH_INDEX);

    if (week === 1 || week % 4 === 0 || benchDelta >= 1.5) {
      state.personalization.manualProgressInputs.benchmarks.lift_results.push({
        date: addDaysToDateKey(weekStartDateKey, 6),
        exercise: "Bench Press",
        weight: state.currentBenchWeight,
        reps: 6,
        sets: 3,
        source: "simulation_checkpoint",
      });
    }
    if (week % 6 === 0 || week === durationWeeks) {
      state.personalization.manualProgressInputs.benchmarks.run_results.push({
        date: addDaysToDateKey(weekStartDateKey, 6),
        distanceMiles: 6.2,
        durationMinutes: round1((state.currentHalfSeconds / 13.1) * 6.2 / 60),
        paceText: formatPace(state.currentHalfSeconds / 13.1),
        source: "simulation_checkpoint",
      });
    }

    if (addDaysToDateKey(weekStartDateKey, 6) === raceTargetDate || (fromDateKey(weekStartDateKey).getTime() <= fromDateKey(raceTargetDate).getTime() && fromDateKey(addDaysToDateKey(weekStartDateKey, 6)).getTime() >= fromDateKey(raceTargetDate).getTime())) {
      const raceAdjustment = (event.travel ? 35 : 0) + (event.illness ? 60 : 0) - (event.taper ? 25 : 0);
      const raceTime = Math.round(state.currentHalfSeconds + raceAdjustment);
      state.personalization.manualProgressInputs.benchmarks.run_results.push({
        date: raceTargetDate,
        distanceMiles: 13.1,
        durationMinutes: round1(raceTime / 60),
        paceText: formatPace(raceTime / 13.1),
        source: "simulation_race",
      });
      if (raceTime <= simulationTargets.runTargetSeconds && goalIds.run && !state.achievedGoals.includes(goalIds.run)) {
        state = maybeApplyGoalManagementChange({
          state,
          now: new Date(`${raceTargetDate}T12:00:00`),
          archiveGoalId: goalIds.run,
          archiveStatus: GOAL_ARCHIVE_STATUSES.completed,
        });
        state.achievedGoals = [...state.achievedGoals, goalIds.run];
      }
      noteLines.push(`Race benchmark landed at ${formatSecondsAsClock(raceTime)}.`);
    }

    const longRunDayKey = Object.entries(composer?.dayTemplates || {}).find(([, session]) => /long-run/.test(String(session?.type || "")))?.[0];
    const hardRunDayKey = Object.entries(composer?.dayTemplates || {}).find(([, session]) => /hard-run/.test(String(session?.type || "")))?.[0];
    const habitsAdaptedThisWeek = {
      longRunMovedOffSaturday: Number(longRunDayKey) !== 6,
      qualityRunMovedOffThursday: hardRunDayKey && Number(hardRunDayKey) !== 4,
      armPreferenceLearned: Object.values(state.logs).some((entry) => /curl|tricep/i.test(JSON.stringify(entry?.strengthPerformance || []))),
    };
    if (habitsAdaptedThisWeek.longRunMovedOffSaturday) noteLines.push("This week's long session landed off Saturday.");
    if (habitsAdaptedThisWeek.qualityRunMovedOffThursday) noteLines.push("This week's quality run landed off Thursday.");

    state.weeklySnapshots.push(buildWeekSummary({
      week,
      weekStartDateKey,
      composer,
      goals: state.goals,
      event,
      adherence: {
        plannedSessionCount,
        completedSessionCount,
        nutritionScore,
      },
      currentWeight: state.currentWeight,
      currentBenchWeight: state.currentBenchWeight,
      currentHalfSeconds: state.currentHalfSeconds,
      armGrowthIndex: state.armGrowthIndex,
      completedGoals: state.achievedGoals,
      notes: noteLines,
    }));
  }

  const progressTracking = buildGoalProgressTrackingFromGoals({
    goals: state.goals,
    logs: state.logs,
    bodyweights: state.bodyweights,
    dailyCheckins: state.dailyCheckins,
    weeklyCheckins: state.weeklyCheckins,
    manualProgressInputs: state.personalization.manualProgressInputs,
    now: addDaysToDateKey(startDateKey, (durationWeeks * 7) - 1),
  });

  const scoreCard = scoreSimulation({
    intakeDiagnostics: {
      goals: reorderedResolvedGoals,
    },
    feasibility,
    finalWeight: state.currentWeight,
    finalBenchWeight: state.currentBenchWeight,
    finalHalfSeconds: state.currentHalfSeconds,
    armGrowthIndex: state.armGrowthIndex,
    targets: simulationTargets,
    habitsAdapted: {
      longRunMovedOffSaturday: state.weeklySnapshots.some((snapshot) => snapshot.notes.some((note) => /long session landed off saturday/i.test(note))),
      qualityRunMovedOffThursday: state.weeklySnapshots.some((snapshot) => snapshot.notes.some((note) => /quality run landed off thursday/i.test(note) || /quality run drifted from thursday to friday/i.test(note))),
      armPreferenceLearned: state.weeklySnapshots.some((snapshot) => snapshot.notes.some((note) => /arm work/i.test(note))),
    },
    completedGoals: state.achievedGoals,
  });

  return {
    version: SIMULATION_MODEL_VERSION,
    generatedAt: toDateKey(new Date()),
    startDateKey,
    durationWeeks,
    raceTargetDate,
    assumptions: {
      benchBaseline: "155 x 4 x 6",
      bodyweightBaseline: "193 lb",
      runningBaseline: "No explicit run benchmark provided; simulation starts from a low-confidence 1:55:00 half-marathon estimate and corrects from logged run behavior.",
      habits: [
        "Quality run often drifts from Thursday to Friday.",
        "Saturday key work is often shortened.",
        "Upper-body sessions often get extra arm work.",
        "Mobility and optional recovery work are inconsistently completed.",
      ],
    },
    intakeDiagnostics: {
      resolvedGoals: reorderedResolvedGoals.map((goal) => ({
        summary: goal?.summary || "",
        planningCategory: goal?.planningCategory || "",
        goalFamily: goal?.goalFamily || "",
        primaryMetric: goal?.primaryMetric || null,
        unresolvedGaps: goal?.unresolvedGaps || [],
      })),
      feasibility,
    },
    finalState: {
      bodyweight: round1(state.currentWeight),
      benchWorkingWeightFor6: roundToHalf(state.currentBenchWeight),
      estimatedHalfMarathonTime: formatSecondsAsClock(state.currentHalfSeconds),
      armGrowthIndex: Number(state.armGrowthIndex.toFixed(1)),
    },
    achievedGoalIds: [...state.achievedGoals],
    weeklySnapshots: state.weeklySnapshots,
    progressTracking,
    scoreCard,
    productVerdict: scoreCard.totalScore >= 85
      ? "ready"
      : scoreCard.totalScore >= 70
      ? "promising_but_constrained"
      : "not_yet_good_enough",
    issuesFound: [
      ...state.benchmarkWarnings,
      ...(state.currentBenchWeight < (simulationTargets.benchTargetWeight - 25) ? [`Bench-specific progress stayed materially short of ${simulationTargets.benchTargetWeight} x 3 x 6 under the combined race-plus-cut demand.`] : []),
      ...(state.currentHalfSeconds > simulationTargets.runTargetSeconds ? ["The half-marathon target stayed just outside the likely outcome band in this noisy real-world simulation."] : []),
      ...(state.currentWeight > (simulationTargets.bodyweightTarget + 0.5) ? [`Fat-loss pacing did not cleanly reach ${simulationTargets.bodyweightTarget} lb in time.`] : []),
      ...(state.armGrowthIndex < 5 ? ["Arm-muscle progress improved, but the current stack still underdoses direct hypertrophy relative to the other three goals."] : []),
    ],
  };
};

export { SIMULATION_MODEL_VERSION };
