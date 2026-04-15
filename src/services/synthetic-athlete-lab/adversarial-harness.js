import { composeGoalNativePlan, buildRollingHorizonWeeks, generateTodayPlan, normalizeGoals } from "../../modules-planning.js";
import { buildPlannedDayRecord } from "../../modules-checkins.js";
import {
  deriveAdaptiveNutrition,
  deriveRealWorldNutritionEngine,
  normalizeActualNutritionLog,
} from "../../modules-nutrition.js";
import { classifyStorageError } from "../../modules-auth-storage.js";
import { buildBrandThemeState, BRAND_THEME_IDS } from "../brand-theme-service.js";
import { deriveCanonicalAthleteState } from "../canonical-athlete-service.js";
import { resolveGoalTranslation } from "../goal-resolution-service.js";
import { buildMetricsBaselinesModel } from "../metrics-baselines-service.js";
import { buildSupportTierModel } from "../support-tier-service.js";
import { buildTrainingContextFromEditor } from "../training-context-service.js";
import { buildWorkoutLogDraft } from "../workout-log-form-service.js";
import {
  createProgramInstance,
  createStyleSelection,
  getProgramDefinitionById,
  getStyleDefinitionById,
  PROGRAM_FIDELITY_MODES,
} from "../program-catalog-service.ts";
import { deriveWeeklyNutritionAdaptation } from "../weekly-nutrition-review-service.js";
import {
  buildManualProgressInputsFromIntake,
  BASELINE_METRIC_KEYS,
} from "../intake-baseline-service.js";
import {
  buildMissingAnchorsEngine,
  applyMissingAnchorAnswer,
} from "../intake-machine-service.js";
import {
  buildGoalEditorDraft,
  buildGoalManagementPreview,
  buildGoalSettingsViewModel,
  GOAL_ARCHIVE_STATUSES,
  GOAL_MANAGEMENT_CHANGE_TYPES,
} from "../goal-management-service.js";
import {
  buildPersistedPlanWeekReview,
  createPersistedPlanWeekRecord,
  PLAN_WEEK_RECORD_COMMITMENT,
} from "../plan-week-persistence-service.js";
import { buildDayReview } from "../day-review-service.js";
import {
  createPrescribedDayHistoryEntry,
  getCurrentPrescribedDayRecord,
  getCurrentPrescribedDayRevision,
  upsertPrescribedDayHistoryEntry,
} from "../prescribed-day-history-service.js";
import {
  buildCoachActionHistoryModel,
  buildCoachAskAnythingStateModel,
  buildCoachQuickChangeActions,
} from "../coach-surface-service.js";
import { SYNTHETIC_ATHLETE_PERSONAS } from "./persona-catalog.js";

const LAB_SIMULATION_WEEKS = 26;
const LAB_VISIBLE_HORIZON_WEEKS = 12;
const LAB_START_DATE_KEY = "2026-01-05";
const LAB_REVIEW_DAY_OF_WEEK = 4;
const LAB_TODAY_DAY_OF_WEEK = 4;
const SCORE_BUCKET_KEYS = [
  "intake_clarity_score",
  "plan_credibility_score",
  "coach_usefulness_score",
  "settings_goals_management_score",
  "logging_usefulness_score",
  "review_confidence_score",
  "adaptation_honesty_score",
];
const REQUIRED_CLUSTER_IDS = [
  "intake_friction",
  "goal_miscapture",
  "hidden_secondary_goals",
  "baseline_timing_problems",
  "ugly_confusing_copy",
  "coach_ambiguity",
  "audit_confidence_erosion",
  "long_horizon_time_confusion",
  "sport_domain_mismatch",
  "support_tier_dishonesty",
  "plan_degradation",
];

const LAB_BASE_WEEK = {
  phase: "BASE",
  label: "Foundation",
  mon: { t: "Easy", d: "25 min" },
  thu: { t: "Steady", d: "20 min" },
  sat: { t: "Long", d: "35 min" },
  str: "A",
  nutri: "easyRun",
};

const LAB_WEEK_TEMPLATES = [
  LAB_BASE_WEEK,
  { phase: "BASE", label: "Foundation 2", mon: { t: "Easy", d: "30 min" }, thu: { t: "Tempo", d: "20 min" }, sat: { t: "Long", d: "40 min" }, str: "A", nutri: "easyRun" },
  { phase: "BUILD", label: "Build 1", mon: { t: "Easy", d: "30 min" }, thu: { t: "Tempo", d: "24 min" }, sat: { t: "Long", d: "45 min" }, str: "B", nutri: "hardRun" },
  { phase: "BUILD", label: "Build 2", mon: { t: "Easy", d: "35 min" }, thu: { t: "Intervals", d: "4 x 3 min" }, sat: { t: "Long", d: "50 min" }, str: "B", nutri: "hardRun" },
  { phase: "PEAK", label: "Peak", mon: { t: "Easy", d: "30 min" }, thu: { t: "Tempo", d: "28 min" }, sat: { t: "Long", d: "55 min" }, str: "A", nutri: "hardRun" },
  { phase: "DELOAD", label: "Reset", mon: { t: "Easy", d: "20 min" }, thu: { t: "Steady", d: "18 min" }, sat: { t: "Long", d: "30 min" }, str: "A", nutri: "easyRun" },
];

export const SYNTHETIC_ATHLETE_RELEASE_GATE_PERSONA_IDS = Object.freeze([
  "novice_obese_beginner",
  "recreational_swimmer",
  "bench_225_office_worker",
  "hybrid_athlete_split",
]);

export const SYNTHETIC_ATHLETE_CATALOG_MODES = Object.freeze({
  focus: "focus",
  releaseGate: "release_gate",
  expanded: "expanded",
  all: "all",
});

const FAILURE_CLUSTER_META = Object.freeze({
  intake_friction: {
    severity: "medium",
    subsystem: "intake",
    scoreBucket: "intake_clarity_score",
    recommendedFixCluster: "Intake staging and anchor scoping",
    likelyFiles: [
      "src/services/intake-machine-service.js",
      "src/services/intake-goal-flow-service.js",
      "src/trainer-dashboard.jsx",
      "tests/intake-machine-service.test.js",
      "e2e/intake.spec.js",
    ],
    specRefs: ["e2e/intake.spec.js"],
  },
  goal_miscapture: {
    severity: "severe",
    subsystem: "intake_planner",
    scoreBucket: "intake_clarity_score",
    recommendedFixCluster: "Goal parsing and ordered goal stack resolution",
    likelyFiles: [
      "src/services/goal-resolution-service.js",
      "src/services/intake-goal-flow-service.js",
      "tests/goal-resolution-service.test.js",
      "e2e/intake.spec.js",
    ],
    specRefs: ["tests/goal-resolution-service.test.js", "e2e/intake.spec.js"],
  },
  hidden_secondary_goals: {
    severity: "medium",
    subsystem: "goals",
    scoreBucket: "settings_goals_management_score",
    recommendedFixCluster: "Goal stack visibility and ordering",
    likelyFiles: [
      "src/services/intake-goal-flow-service.js",
      "src/services/goal-management-service.js",
      "src/trainer-dashboard.jsx",
      "e2e/goal-settings.spec.js",
    ],
    specRefs: ["e2e/intake.spec.js", "e2e/goal-settings.spec.js"],
  },
  baseline_timing_problems: {
    severity: "severe",
    subsystem: "baselines",
    scoreBucket: "plan_credibility_score",
    recommendedFixCluster: "Inline anchor collection and baseline provenance",
    likelyFiles: [
      "src/services/intake-machine-service.js",
      "src/services/intake-baseline-service.js",
      "src/services/metrics-baselines-service.js",
      "tests/intake-machine-service.test.js",
      "e2e/intake.spec.js",
    ],
    specRefs: ["e2e/intake.spec.js"],
  },
  ugly_confusing_copy: {
    severity: "medium",
    subsystem: "ux_copy",
    scoreBucket: "review_confidence_score",
    recommendedFixCluster: "Trust copy cleanup",
    likelyFiles: [
      "src/services/intake-goal-flow-service.js",
      "src/services/day-review-service.js",
      "src/trainer-dashboard.jsx",
      "e2e/trust-cleanup-integration.spec.js",
    ],
    specRefs: ["e2e/trust-cleanup-integration.spec.js"],
  },
  coach_ambiguity: {
    severity: "severe",
    subsystem: "coach",
    scoreBucket: "coach_usefulness_score",
    recommendedFixCluster: "Coach deterministic boundaries and previews",
    likelyFiles: [
      "src/services/coach-surface-service.js",
      "src/trainer-dashboard.jsx",
      "tests/coach-surface-service.test.js",
      "e2e/coach.spec.js",
    ],
    specRefs: ["e2e/coach.spec.js"],
  },
  audit_confidence_erosion: {
    severity: "medium",
    subsystem: "audit",
    scoreBucket: "review_confidence_score",
    recommendedFixCluster: "Review story hierarchy and advanced disclosure",
    likelyFiles: [
      "src/services/day-review-service.js",
      "src/services/plan-week-persistence-service.js",
      "src/review-audit-components.jsx",
      "e2e/trust-cleanup-integration.spec.js",
    ],
    specRefs: ["e2e/trust-cleanup-integration.spec.js"],
  },
  long_horizon_time_confusion: {
    severity: "medium",
    subsystem: "timeline",
    scoreBucket: "adaptation_honesty_score",
    recommendedFixCluster: "Goal timing semantics and projected-vs-committed framing",
    likelyFiles: [
      "src/services/goal-timing-service.js",
      "src/services/goal-management-service.js",
      "src/trainer-dashboard.jsx",
      "e2e/program.spec.js",
      "e2e/goal-settings.spec.js",
    ],
    specRefs: ["e2e/program.spec.js", "e2e/goal-settings.spec.js"],
  },
  sport_domain_mismatch: {
    severity: "severe",
    subsystem: "planner_domain",
    scoreBucket: "plan_credibility_score",
    recommendedFixCluster: "Domain adapter and baseline routing",
    likelyFiles: [
      "src/services/goal-resolution-service.js",
      "src/services/support-tier-service.js",
      "src/modules-planning.js",
      "tests/goal-resolution-service.test.js",
    ],
    specRefs: ["tests/goal-resolution-service.test.js"],
  },
  support_tier_dishonesty: {
    severity: "medium",
    subsystem: "support_tiers",
    scoreBucket: "plan_credibility_score",
    recommendedFixCluster: "Support-tier truthfulness and core-use-case coverage",
    likelyFiles: [
      "src/services/support-tier-service.js",
      "src/services/metrics-baselines-service.js",
      "tests/support-tier-service.test.js",
    ],
    specRefs: ["tests/support-tier-service.test.js"],
  },
  plan_degradation: {
    severity: "severe",
    subsystem: "planner",
    scoreBucket: "adaptation_honesty_score",
    recommendedFixCluster: "Adaptation rules and plan stability",
    likelyFiles: [
      "src/modules-planning.js",
      "src/services/day-review-service.js",
      "src/services/plan-week-persistence-service.js",
      "e2e/program.spec.js",
      "e2e/trust-cleanup-integration.spec.js",
    ],
    specRefs: ["e2e/program.spec.js", "e2e/trust-cleanup-integration.spec.js"],
  },
});

const BROWSER_PROBES = Object.freeze([
  {
    id: "obese_beginner_onboarding_probe",
    specRef: "e2e/synthetic-athlete-lab.spec.js",
    stepRef: "morbidly obese beginner onboarding, inline baseline capture, and post-build trust surfaces",
    rationale: "Covers browser-only intake, baseline, coach, and settings discoverability issues that service simulation can miss.",
  },
  {
    id: "intake_regression_probe",
    specRef: "e2e/intake.spec.js",
    stepRef: "staged intake, multi-goal interpretation, and milestone handling",
    rationale: "Protects the staged intake UX and deterministic confirmation boundary.",
  },
  {
    id: "coach_boundary_probe",
    specRef: "e2e/coach.spec.js",
    stepRef: "coach mode gating, preview-before-accept, and advisory non-mutation",
    rationale: "Validates the browser contract around Coach boundaries.",
  },
  {
    id: "goal_settings_probe",
    specRef: "e2e/goal-settings.spec.js",
    stepRef: "settings plan management, preview impact, archive/restore",
    rationale: "Covers settings discoverability and explicit goal-management commits.",
  },
  {
    id: "program_inline_probe",
    specRef: "e2e/program.spec.js",
    stepRef: "current-week and future-week inline expansion plus projected-horizon framing",
    rationale: "Checks week readability and inline detail interaction that service logic cannot verify.",
  },
  {
    id: "audit_confidence_probe",
    specRef: "e2e/trust-cleanup-integration.spec.js",
    stepRef: "review hierarchy and audit disclosure framing",
    rationale: "Protects trust-sensitive review language and audit demotion.",
  },
  {
    id: "exact_multigoal_probe",
    specRef: "e2e/synthetic-athlete-lab.spec.js",
    stepRef: "bench 225 plus aesthetics intake, inline baseline capture, and advisory coach boundary",
    rationale: "Catches exact multi-goal intake and coach non-mutation issues that synthetic scoring can miss.",
  },
  {
    id: "swim_anchor_probe",
    specRef: "e2e/synthetic-athlete-lab.spec.js",
    stepRef: "swim anchor capture, swim access reality, and swim baseline provenance after build",
    rationale: "Adds browser-level protection for swim-domain anchor timing and settings provenance.",
  },
]);

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const cloneValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};
const toNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const hashString = (value = "") => {
  let hash = 0;
  const text = String(value || "");
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
};

const midpointAge = (ageRange = "30-39") => {
  const match = String(ageRange || "").match(/(\d{2})-(\d{2})/);
  if (!match) return 34;
  return Math.round((Number(match[1]) + Number(match[2])) / 2);
};

const inferDaysPerWeek = (scheduleReality = "") => {
  const match = String(scheduleReality || "").match(/(\d)\s*(?:to|-)?\s*(\d)?\s*(?:sessions|runs|days)/i);
  if (!match) return 4;
  const first = Number(match[1] || 0);
  const second = Number(match[2] || 0);
  return second ? Math.round((first + second) / 2) : first || 4;
};

const addDaysToDateKey = (dateKey = LAB_START_DATE_KEY, days = 0) => {
  const base = new Date(`${String(dateKey || LAB_START_DATE_KEY).slice(0, 10)}T12:00:00`);
  base.setDate(base.getDate() + Number(days || 0));
  const month = `${base.getMonth() + 1}`.padStart(2, "0");
  const day = `${base.getDate()}`.padStart(2, "0");
  return `${base.getFullYear()}-${month}-${day}`;
};

const weekStartDateKeyFor = (weekNumber = 1) => addDaysToDateKey(LAB_START_DATE_KEY, (Math.max(1, Number(weekNumber || 1)) - 1) * 7);
const scoreSeverityPenalty = (severity = "medium") => (severity === "severe" ? 30 : severity === "medium" ? 14 : 5);
const hasLaneTheater = (value = "") => /leading now|we will maintain|support in the background|we will support|we are deferring|defer(?:ring)?/i.test(String(value || ""));
const hasRevisionHeroCopy = (value = "") => /rev(?:ision)?\s*\d+|plan changed|timeline mechanics/i.test(String(value || ""));

const buildManualProgressInputs = (baselineMetrics = {}, todayKey = LAB_START_DATE_KEY) => ({
  measurements: {
    [BASELINE_METRIC_KEYS.bodyweightBaseline]: baselineMetrics?.bodyweight ? [{
      date: todayKey,
      value: baselineMetrics.bodyweight,
      unit: "lb",
      source: "user_override",
      note: "Seed baseline",
    }] : [],
    waist_circumference: baselineMetrics?.waist ? [{
      date: todayKey,
      value: baselineMetrics.waist,
      unit: "in",
      source: "user_override",
      note: "Seed baseline",
    }] : [],
  },
  benchmarks: {
    lift_results: baselineMetrics?.lift ? [{
      date: todayKey,
      exercise: baselineMetrics.lift.exercise,
      weight: baselineMetrics.lift.weight,
      reps: baselineMetrics.lift.reps,
      sets: baselineMetrics.lift.sets || 1,
      source: "user_override",
      note: "Seed baseline",
    }] : [],
    run_results: baselineMetrics?.run ? [{
      date: todayKey,
      distanceMiles: baselineMetrics.run.distanceMiles,
      durationMinutes: baselineMetrics.run.durationMinutes,
      paceText: baselineMetrics.run.paceText || "",
      source: "user_override",
      note: "Seed baseline",
    }] : [],
  },
  metrics: {
    [BASELINE_METRIC_KEYS.swimBenchmark]: baselineMetrics?.swim ? [{
      date: todayKey,
      distance: baselineMetrics.swim.distance,
      distanceUnit: baselineMetrics.swim.distanceUnit || "",
      duration: baselineMetrics.swim.duration || "",
      source: "user_override",
      note: baselineMetrics.swim.note || "Seed baseline",
    }] : [],
    [BASELINE_METRIC_KEYS.swimAccessReality]: baselineMetrics?.swimAccessReality ? [{
      date: todayKey,
      value: baselineMetrics.swimAccessReality,
      source: "user_override",
      note: "Seed baseline",
    }] : [],
    [BASELINE_METRIC_KEYS.startingCapacity]: baselineMetrics?.startingCapacity ? [{
      date: todayKey,
      value: baselineMetrics.startingCapacity,
      source: "user_override",
      note: "Seed baseline",
    }] : [],
    vertical_jump: baselineMetrics?.jump ? [{
      date: todayKey,
      value: baselineMetrics.jump.value,
      unit: baselineMetrics.jump.unit || "in",
      source: "user_override",
      note: "Seed baseline",
    }] : [],
  },
});

const normalizeIntentEntries = (persona = {}) => (
  toArray(persona?.goalIntents || [])
    .map((entry) => typeof entry === "string" ? { text: entry } : entry)
    .map((entry) => ({
      ...entry,
      text: sanitizeText(entry?.text || entry?.rawGoalText || "", 420),
    }))
    .filter((entry) => entry.text)
);

const inferCoachUsageStyle = (persona = {}) => {
  const text = `${persona.coachInteractionBehavior || ""} ${toArray(persona.likelyFailureModes || []).join(" ")}`.toLowerCase();
  if (/never chats|never chat|rarely chats|hates chat|as few decisions as possible|never uses coach/.test(text)) return "never";
  if (/overuses coach|overuse|asks for reassurance often|compare every option|asks for help when sleep is wrecked/.test(text)) return "overuse";
  if (/concise|decision support|short answers|only when stuck|only when totally lost/.test(text)) return "minimal";
  return "balanced";
};

const inferChaosLevel = (persona = {}) => {
  const text = [
    persona.scheduleReality,
    persona.travelLikelihood,
    persona.loggingBehavior,
    persona.nutritionBehavior,
    persona.injuryContext,
    persona.bodyCompContext,
    persona.coachInteractionBehavior,
    toArray(persona.likelyFailureModes || []).join(" "),
  ].filter(Boolean).join(" ").toLowerCase();
  let score = 0;
  if (/wildly inconsistent|unpredictable|fragmented|night shift|rotating|travel|hotel|airport|newborn|kids|sleep disruption|limited sleep|chaotic/.test(text)) score += 2;
  if (/sporadic|missed sessions|motivation|drift|forgets|dropped balls|late meetings|compressed/.test(text)) score += 1;
  if (/pain|ache|rehab|injury|knee|shoulder|back|hip|achilles|pelvic floor/.test(text)) score += 1;
  return score >= 3 ? "high" : score >= 1 ? "medium" : "low";
};

const inferGoalPrecision = (persona = {}) => {
  const text = normalizeIntentEntries(persona).map((entry) => entry.text).join(" ").toLowerCase();
  if (!text) return "none";
  const hasExact = /\b\d+(?::\d+)?\b|\b(?:january|february|march|april|may|june|july|august|september|october|november|december|summer|fall|winter|spring)\b|20\d{2}/.test(text);
  const hasVague = /look athletic again|tone up|get fitter|fighter shape|back in shape|stay capable|for life|kinda stronger|slimmer|more energy/.test(text);
  if (hasExact && hasVague) return "hybrid";
  if (hasExact) return "exact";
  if (hasVague) return "vague";
  return normalizeIntentEntries(persona).length > 1 ? "hybrid" : "exact";
};

const inferGoalTimingStyle = (persona = {}) => {
  const text = `${normalizeIntentEntries(persona).map((entry) => entry.text).join(" ")} ${persona.bodyCompContext || ""}`.toLowerCase();
  if (/open-ended|no hard end date|for life|healthspan|no exact timeline|open ended/.test(text)) return "open_ended";
  if (/\bby\s+(?:summer|fall|winter|spring|january|february|march|april|may|june|july|august|september|october|november|december|[a-z]+)\b|\bwithin?\s+\d+\s+weeks?\b|20\d{2}/.test(text)) return "date_based";
  if (/\b\d+\b/.test(text) && /\bbench|squat|deadlift|mile|marathon|5k|10k|half marathon|lb|pounds?\b/.test(text)) return "exact_metric";
  return "open_ended";
};

const buildPersonaCatalogCoverage = (personas = []) => {
  const coverage = {
    exactUsers: 0,
    vagueUsers: 0,
    hybridUsers: 0,
    chaoticUsers: 0,
    dateBasedGoalUsers: 0,
    openEndedGoalUsers: 0,
    multiGoalUsers: 0,
    coachNeverUsers: 0,
    coachOveruseUsers: 0,
    travelHeavyUsers: 0,
    painSensitiveUsers: 0,
    swimUsers: 0,
    strengthUsers: 0,
    hybridDomainUsers: 0,
  };

  personas.forEach((persona) => {
    const text = normalizeIntentEntries(persona).map((entry) => entry.text).join(" ").toLowerCase();
    const precision = inferGoalPrecision(persona);
    const coachUsageStyle = inferCoachUsageStyle(persona);
    const timingStyle = inferGoalTimingStyle(persona);
    const goalCount = normalizeIntentEntries(persona).length;
    const domainFlags = {
      swim: /swim|pool|open water/.test(text) || /swim/.test(`${persona.enduranceContext || ""}`.toLowerCase()),
      strength: /bench|squat|deadlift|strength|stronger|muscle|lift/.test(text) || /strength|lifter|muscle/.test(`${persona.strengthContext || ""}`.toLowerCase()),
      endurance: /run|marathon|5k|10k|half|conditioning|endurance|hyrox|triathlon|soccer|basketball|boxing|fighter/.test(text),
      bodyComp: /lean|fat|weight|abs|six pack|tone|defined|look|appearance|body composition|lose/.test(text),
    };

    if (precision === "exact") coverage.exactUsers += 1;
    if (precision === "vague") coverage.vagueUsers += 1;
    if (precision === "hybrid") coverage.hybridUsers += 1;
    if (inferChaosLevel(persona) === "high") coverage.chaoticUsers += 1;
    if (timingStyle === "date_based" || timingStyle === "exact_metric") coverage.dateBasedGoalUsers += 1;
    if (timingStyle === "open_ended") coverage.openEndedGoalUsers += 1;
    if (goalCount > 1) coverage.multiGoalUsers += 1;
    if (coachUsageStyle === "never") coverage.coachNeverUsers += 1;
    if (coachUsageStyle === "overuse") coverage.coachOveruseUsers += 1;
    if (/high|travel|hotel|airport/.test(`${persona.travelLikelihood || ""} ${persona.scheduleReality || ""} ${persona.equipmentReality || ""}`.toLowerCase())) coverage.travelHeavyUsers += 1;
    if (/pain|ache|rehab|injury|knee|shoulder|back|hip|achilles|pelvic floor/.test(`${persona.injuryContext || ""}`.toLowerCase())) coverage.painSensitiveUsers += 1;
    if (domainFlags.swim) coverage.swimUsers += 1;
    if (domainFlags.strength) coverage.strengthUsers += 1;
    if (Object.values(domainFlags).filter(Boolean).length > 1) coverage.hybridDomainUsers += 1;
  });

  return coverage;
};

const selectSyntheticAthletePersonas = ({
  personas = null,
  catalogMode = SYNTHETIC_ATHLETE_CATALOG_MODES.focus,
  targetPersonaCount = 100,
} = {}) => {
  if (Array.isArray(personas) && personas.length) return personas;
  if (catalogMode === SYNTHETIC_ATHLETE_CATALOG_MODES.releaseGate) {
    return SYNTHETIC_ATHLETE_RELEASE_GATE_PERSONA_IDS
      .map((personaId) => SYNTHETIC_ATHLETE_PERSONAS.find((persona) => persona.id === personaId))
      .filter(Boolean);
  }
  if (catalogMode === SYNTHETIC_ATHLETE_CATALOG_MODES.expanded || catalogMode === SYNTHETIC_ATHLETE_CATALOG_MODES.all) {
    const limit = Math.max(1, Math.min(Number(targetPersonaCount || 100) || 100, SYNTHETIC_ATHLETE_PERSONAS.length));
    return SYNTHETIC_ATHLETE_PERSONAS.slice(0, limit);
  }
  return SYNTHETIC_ATHLETE_PERSONAS.filter((persona) => persona.id === "novice_obese_beginner").slice(0, 1);
};

const buildGoalsFromPersona = (persona = {}) => {
  const intents = normalizeIntentEntries(persona);
  const resolvedGoals = [];
  const planningGoals = [];
  intents.forEach((intent, intentIndex) => {
    const additionalContext = [
      persona.bodyCompContext,
      persona.strengthContext,
      persona.enduranceContext,
      persona.scheduleReality,
      persona.injuryContext,
      persona.equipmentReality,
    ].filter(Boolean).join(". ");
    const resolution = resolveGoalTranslation({
      rawUserGoalIntent: intent.text,
      typedIntakePacket: {
        version: "2026-04-v1",
        intake: {
          rawGoalText: intent.text,
          baselineContext: {
            primaryGoalLabel: intent.text,
            currentBaseline: [persona.strengthContext, persona.enduranceContext].filter(Boolean).join(". "),
          },
          scheduleReality: {
            trainingDaysPerWeek: inferDaysPerWeek(persona.scheduleReality),
            sessionLength: persona.sessionLength || "45",
            trainingLocation: persona.environmentMode || "Gym",
          },
          equipmentAccessContext: {
            trainingLocation: persona.environmentMode || "Gym",
            equipment: [persona.equipmentReality || persona.equipmentAccess || "basic_gym"].filter(Boolean),
          },
          injuryConstraintContext: {
            injuryText: persona.injuryContext || "",
            constraints: [persona.injuryContext].filter(Boolean),
          },
          userProvidedConstraints: {
            additionalContext,
          },
        },
      },
      explicitUserConfirmation: { confirmed: true, acceptedProposal: true, source: "synthetic_lab_persona" },
      now: LAB_START_DATE_KEY,
    });
    toArray(resolution?.resolvedGoals).forEach((goal) => {
      resolvedGoals.push({
        ...goal,
        planningPriority: resolvedGoals.length + 1,
      });
    });
    toArray(resolution?.planningGoals).forEach((goal) => {
      planningGoals.push({
        ...goal,
        id: `${persona.id}_goal_${planningGoals.length + 1}`,
        priority: planningGoals.length + 1,
        active: true,
        sourceIntentIndex: intentIndex,
      });
    });
  });

  return normalizeGoals(planningGoals.map((goal, index) => ({
    ...goal,
    id: goal.id || `${persona.id}_goal_${index + 1}`,
    priority: index + 1,
    resolvedGoal: resolvedGoals[index] || goal.resolvedGoal || null,
    goalRecordId: resolvedGoals[index]?.id || goal.goalRecordId || goal.id || `${persona.id}_goal_record_${index + 1}`,
  })));
};

const createPersonalization = ({ persona = {}, includeMetrics = true, programs = null } = {}) => {
  const age = midpointAge(persona.ageRange);
  const heightSeed = 64 + (hashString(persona.id) % 10);
  const bodyweight = persona?.baselineMetrics?.bodyweight || (160 + (hashString(`${persona.id}:bw`) % 80));
  const sessionLength = persona.sessionLength || "45";
  const equipmentReality = persona.equipmentReality || persona.equipmentAccess || "basic gym";
  return {
    settings: {
      units: persona.units === "metric"
        ? { weight: "kg", height: "cm", distance: "kilometers" }
        : { weight: "lbs", height: "ft_in", distance: "miles" },
      trainingPreferences: {
        intensityPreference: persona.preferredIntensity || "Standard",
        defaultEnvironment: persona.environmentMode || "Gym",
      },
      appearance: { theme: "Atlas", mode: "System" },
    },
    profile: {
      name: persona.name,
      timezone: persona.timezone || "America/Chicago",
      birthYear: 2026 - age,
      age,
      height: persona.units === "metric" ? Math.round(heightSeed * 2.54) : `${Math.floor(heightSeed / 12)}'${heightSeed % 12}"`,
      weight: bodyweight,
      bodyweight,
      trainingAgeYears: persona.trainingAgeYears || 0,
      onboardingComplete: true,
      profileSetupComplete: true,
    },
    userGoalProfile: {
      days_per_week: inferDaysPerWeek(persona.scheduleReality),
      session_length: sessionLength,
      equipment_access: [persona.equipmentAccess || "basic_gym"],
    },
    trainingContext: buildTrainingContextFromEditor({
      mode: persona.environmentMode || "Gym",
      equipment: persona.equipmentAccess || "basic_gym",
      equipmentItems: [equipmentReality],
      time: sessionLength,
      intensity: persona.preferredIntensity || "Standard",
    }),
    travelState: {
      environmentMode: String(persona.environmentMode || "Gym").toLowerCase() === "travel" ? "travel" : "home",
      access: "stable",
      isTravelWeek: false,
    },
    environmentConfig: {
      defaultMode: persona.environmentMode || "Gym",
      base: {
        mode: persona.environmentMode || "Gym",
        equipment: [equipmentReality],
        time: sessionLength,
      },
      schedule: [],
    },
    localFoodContext: {
      city: persona.timezone?.includes("Los_Angeles") ? "Los Angeles" : "Chicago",
      groceryOptions: [persona.travelLikelihood === "high" ? "Whole Foods" : "Trader Joe's"],
    },
    nutritionPreferenceState: {
      style: persona.bodyCompContext ? "structured" : "flexible",
      preferredMeals: ["protein-forward breakfast", "simple lunch bowl"],
    },
    manualProgressInputs: includeMetrics
      ? buildManualProgressInputs(persona.baselineMetrics || {}, LAB_START_DATE_KEY)
      : buildManualProgressInputs({}, LAB_START_DATE_KEY),
    goalManagement: {
      version: 1,
      archivedGoals: [],
      history: [],
    },
    programs,
  };
};

const buildProgramsState = ({ persona = {}, athleteProfile = null } = {}) => {
  const state = {};
  const programDefinition = getProgramDefinitionById(persona.programId || "");
  if (programDefinition) {
    state.activeProgramInstance = createProgramInstance({
      programDefinition,
      athleteProfile,
      fidelityMode: PROGRAM_FIDELITY_MODES.adaptToMe,
    });
  }
  const styleDefinition = getStyleDefinitionById(persona.styleId || "");
  if (styleDefinition) {
    state.activeStyleSelection = createStyleSelection({ styleDefinition });
  }
  return Object.keys(state).length ? state : null;
};

const buildScenarioNutritionReview = ({ persona = {}, event = {} } = {}) => {
  const behaviorText = `${persona.nutritionBehavior || ""} ${(persona.likelyFailureModes || []).join(" ")} ${event.nutritionDrift ? "nutrition drift" : ""}`.toLowerCase();
  const summary = {
    actual: { loggedDays: event.loggingPct >= 0.6 ? 5 : 3 },
    adherence: { lowDays: /chaotic|drift|airport|under|messy|snack/.test(behaviorText) ? 3 : 1 },
    deviationPattern: { counts: { under_fueled: /under|hungry|airport|class-heavy/.test(behaviorText) ? 2 : 0 } },
    hydration: { belowTargetDays: /travel|airport|hydration/.test(behaviorText) ? 3 : 1 },
    supplements: { missedDays: 0, expectedDays: 0 },
    friction: { topCauses: [{ key: event.travel ? "travel" : /chaotic|busy|shift/.test(behaviorText) ? "time_pressure" : "convenience" }] },
    prescribed: { hardTrainingDays: 2 },
  };
  return {
    summary,
    adaptation: deriveWeeklyNutritionAdaptation({ summary }),
  };
};

const createBaseState = (persona = {}) => {
  const goals = buildGoalsFromPersona(persona);
  const barePersonalization = createPersonalization({ persona, includeMetrics: false });
  const bareAthlete = deriveCanonicalAthleteState({ goals, personalization: barePersonalization, profileDefaults: { name: persona.name } });
  const programs = buildProgramsState({ persona, athleteProfile: bareAthlete });
  const personalization = createPersonalization({ persona, includeMetrics: true, programs });
  const athleteProfile = deriveCanonicalAthleteState({ goals, personalization, profileDefaults: { name: persona.name } });
  return {
    goals,
    resolvedGoals: goals.map((goal) => goal?.resolvedGoal || null).filter(Boolean),
    personalization,
    athleteProfile,
    answers: {},
    logs: {},
    dailyCheckins: {},
    nutritionActualLogs: {},
    bodyweights: persona?.baselineMetrics?.bodyweight ? [{ date: LAB_START_DATE_KEY, w: persona.baselineMetrics.bodyweight }] : [],
    planWeekRecords: {},
    weeklyCheckins: {},
    coachActions: [],
    currentBodyweight: toNumber(persona?.baselineMetrics?.bodyweight, 0),
    latestGoalSettingsView: null,
  };
};

const buildUserContextForAnchors = (persona = {}) => ({
  experienceLevel: persona.trainingAgeYears >= 5 ? "advanced" : persona.trainingAgeYears >= 1 ? "intermediate" : "beginner",
  trainingDaysPerWeek: inferDaysPerWeek(persona.scheduleReality),
  sessionLength: persona.sessionLength || "45 min",
  trainingLocation: persona.environmentMode || "Gym",
});

const buildAnchorAnswerForPersona = ({
  persona = {},
  anchor = null,
} = {}) => {
  const fieldId = sanitizeText(anchor?.field_id || "", 80);
  if (!fieldId) return null;
  if (fieldId === "starting_capacity_anchor") {
    const lowCapacity = /deconditioned|walking only|sedentary|obese beginner/i.test(`${persona.bodyCompContext} ${persona.strengthContext} ${persona.enduranceContext}`);
    const value = lowCapacity ? "10_easy_minutes" : "20_to_30_minutes";
    return {
      rawText: lowCapacity ? "about 10 easy minutes" : "about 20 to 30 minutes",
      answerValue: { value, raw: lowCapacity ? "about 10 easy minutes" : "about 20 to 30 minutes" },
    };
  }
  if (fieldId === "current_bodyweight" && Number.isFinite(persona?.baselineMetrics?.bodyweight)) {
    return {
      rawText: `${persona.baselineMetrics.bodyweight} lb`,
      answerValue: { value: persona.baselineMetrics.bodyweight, raw: `${persona.baselineMetrics.bodyweight} lb` },
    };
  }
  if (fieldId === "current_waist" && Number.isFinite(persona?.baselineMetrics?.waist)) {
    return {
      rawText: `${persona.baselineMetrics.waist} in`,
      answerValue: { value: persona.baselineMetrics.waist, raw: `${persona.baselineMetrics.waist} in` },
    };
  }
  if (fieldId === "current_strength_baseline" && persona?.baselineMetrics?.lift) {
    return {
      rawText: `${persona.baselineMetrics.lift.weight}x${persona.baselineMetrics.lift.reps || 1}`,
      answerValue: {
        weight: persona.baselineMetrics.lift.weight,
        reps: persona.baselineMetrics.lift.reps || 1,
        raw: `${persona.baselineMetrics.lift.weight}x${persona.baselineMetrics.lift.reps || 1}`,
      },
    };
  }
  if (fieldId === "current_strength_baseline" && persona?.baselineMetrics?.jump) {
    const raw = `${persona.baselineMetrics.jump.value}${persona.baselineMetrics.jump.unit || " in"} vertical`;
    return {
      rawText: raw,
      answerValue: { value: raw, raw },
    };
  }
  if (fieldId === "target_timeline") {
    const rawGoalText = normalizeIntentEntries(persona).map((entry) => entry.text).join(". ");
    const explicitTimeline = rawGoalText.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|spring|summer|fall|autumn|winter)\b/i)?.[1]
      || rawGoalText.match(/\b(20\d{2}-\d{2}(?:-\d{2})?)\b/)?.[1]
      || rawGoalText.match(/\b(\d+\s+weeks?)\b/i)?.[1]
      || "";
    const inferredTimeline = explicitTimeline || "October";
    if (!inferredTimeline) return null;
    return {
      rawText: inferredTimeline,
      answerValue: { value: inferredTimeline, raw: inferredTimeline },
    };
  }
  if (fieldId === "recent_swim_anchor" && persona?.baselineMetrics?.swim) {
    const raw = persona.baselineMetrics.swim.raw
      || `${persona.baselineMetrics.swim.distance || ""} ${persona.baselineMetrics.swim.distanceUnit || ""} in ${persona.baselineMetrics.swim.duration || ""}`.trim();
    return {
      rawText: raw,
      answerValue: { raw, value: raw },
    };
  }
  if (fieldId === "swim_access_reality") {
    const lowered = `${persona.enduranceContext || ""} ${persona.equipmentReality || ""}`.toLowerCase();
    const value = /open water/.test(lowered) ? "open_water" : /pool/.test(lowered) ? "pool" : "";
    if (!value) return null;
    return {
      rawText: value === "open_water" ? "open water" : "pool",
      answerValue: { value, raw: value === "open_water" ? "open water" : "pool" },
    };
  }
  if (fieldId === "current_run_frequency") {
    const days = inferDaysPerWeek(persona.scheduleReality);
    return {
      rawText: `${days} runs/week`,
      answerValue: { value: days, raw: `${days} runs/week` },
    };
  }
  if (fieldId === "running_endurance_anchor_kind") {
    const usesLongest = Boolean(persona?.baselineMetrics?.run?.distanceMiles || persona?.baselineMetrics?.run?.durationMinutes);
    const value = usesLongest ? "longest_recent_run" : "recent_pace_baseline";
    return {
      rawText: value === "longest_recent_run" ? "longest recent run" : "recent pace baseline",
      answerValue: { value, raw: value === "longest_recent_run" ? "longest recent run" : "recent pace baseline" },
    };
  }
  if (fieldId === "longest_recent_run" && persona?.baselineMetrics?.run) {
    const raw = persona.baselineMetrics.run.distanceMiles
      ? `${persona.baselineMetrics.run.distanceMiles} miles`
      : `${persona.baselineMetrics.run.durationMinutes} minutes`;
    return {
      rawText: raw,
      answerValue: { value: persona.baselineMetrics.run.distanceMiles || persona.baselineMetrics.run.durationMinutes, raw },
    };
  }
  if (fieldId === "recent_pace_baseline" && persona?.baselineMetrics?.run?.paceText) {
    return {
      rawText: persona.baselineMetrics.run.paceText,
      answerValue: { value: persona.baselineMetrics.run.paceText, raw: persona.baselineMetrics.run.paceText },
    };
  }
  if (fieldId === "appearance_proxy_anchor_kind") {
    const value = Number.isFinite(persona?.baselineMetrics?.bodyweight) ? "current_bodyweight" : Number.isFinite(persona?.baselineMetrics?.waist) ? "current_waist" : "skip_for_now";
    return {
      rawText: value === "current_bodyweight" ? "bodyweight" : value === "current_waist" ? "waist" : "skip for now",
      answerValue: { value, raw: value === "skip_for_now" ? "skip for now" : value },
    };
  }
  if (fieldId === "target_weight_change") {
    const weightGoalText = normalizeIntentEntries(persona).map((entry) => entry.text).find((entry) => /\blose\s+\d+\s*(?:lb|lbs|pounds?)\b/i.test(entry));
    const match = String(weightGoalText || "").match(/\blose\s+(\d+)\s*(?:lb|lbs|pounds?)\b/i);
    if (!match?.[1]) return null;
    const value = Number(match[1]);
    return {
      rawText: `${value} lb`,
      answerValue: { value, raw: `${value} lb` },
    };
  }
  return null;
};

const applyIntakeAnswersToState = ({
  persona = {},
  state = {},
} = {}) => {
  let nextAnswers = cloneValue(state.answers || {});
  let bindingsByFieldId = {};
  const askedFields = [];
  const answeredFields = [];
  const failures = [];
  let passes = 0;
  let engine = buildMissingAnchorsEngine({
    resolvedGoals: state.resolvedGoals,
    answers: nextAnswers,
    userContext: buildUserContextForAnchors(persona),
    bindingsByFieldId,
  });

  while (engine?.currentAnchor && askedFields.length < 12) {
    askedFields.push(engine.currentAnchor.field_id);
    const answer = buildAnchorAnswerForPersona({ persona, anchor: engine.currentAnchor });
    if (!answer) {
      failures.push({
        clusterId: "baseline_timing_problems",
        message: `Required anchor ${engine.currentAnchor.field_id} had no deterministic persona answer.`,
        stepRef: `week 0 > intake > clarify > ${engine.currentAnchor.field_id}`,
      });
      break;
    }
    const applied = applyMissingAnchorAnswer({
      answers: nextAnswers,
      anchor: engine.currentAnchor,
      raw_text: answer.rawText,
      answer_value: answer.answerValue,
      timestamp: `${LAB_START_DATE_KEY}T12:00:00.000Z`,
      source: "synthetic_lab",
    });
    if (!applied?.validation?.isValid) {
      failures.push({
        clusterId: "intake_friction",
        message: applied?.validation?.formError || `Failed to answer ${engine.currentAnchor.field_id}.`,
        stepRef: `week 0 > intake > clarify > ${engine.currentAnchor.field_id}`,
      });
      break;
    }
    nextAnswers = applied.answers;
    if (applied.binding?.field_id) {
      bindingsByFieldId = {
        ...bindingsByFieldId,
        [applied.binding.field_id]: applied.binding,
      };
    }
    answeredFields.push(engine.currentAnchor.field_id);
    passes += 1;
    engine = buildMissingAnchorsEngine({
      resolvedGoals: state.resolvedGoals,
      answers: nextAnswers,
      userContext: buildUserContextForAnchors(persona),
      bindingsByFieldId,
    });
  }

  const intakeBaselinePatch = buildManualProgressInputsFromIntake({
    answers: nextAnswers,
    resolvedGoals: state.resolvedGoals,
    manualProgressInputs: state.personalization?.manualProgressInputs || {},
    profile: state.personalization?.profile || {},
    todayKey: LAB_START_DATE_KEY,
    now: `${LAB_START_DATE_KEY}T12:00:00.000Z`,
  });

  return {
    nextState: {
      ...state,
      answers: nextAnswers,
      personalization: {
        ...state.personalization,
        manualProgressInputs: intakeBaselinePatch.manualProgressInputs,
        profile: {
          ...state.personalization.profile,
          ...intakeBaselinePatch.profilePatch,
        },
      },
      athleteProfile: deriveCanonicalAthleteState({
        goals: state.goals,
        personalization: {
          ...state.personalization,
          manualProgressInputs: intakeBaselinePatch.manualProgressInputs,
          profile: {
            ...state.personalization.profile,
            ...intakeBaselinePatch.profilePatch,
          },
        },
        profileDefaults: { name: persona.name },
      }),
    },
    intakeReport: {
      askedFields,
      answeredFields,
      missingRequiredFields: toArray(engine?.orderedFieldIds || []),
      missingAnchors: toArray(engine?.missingAnchors || []),
      capturedKeys: intakeBaselinePatch.capturedKeys || [],
      passes,
      failures,
    },
  };
};

const createFailureRecord = ({
  personaId = "",
  week = 0,
  clusterId = "",
  message = "",
  severity = "",
  subsystem = "",
  stepRef = "",
  evidence = null,
} = {}) => {
  const meta = FAILURE_CLUSTER_META[clusterId] || {};
  return {
    personaId: sanitizeText(personaId, 120),
    week,
    severity: severity || meta.severity || "medium",
    clusterId: sanitizeText(clusterId, 80),
    subsystem: subsystem || meta.subsystem || "unknown",
    scoreBucket: meta.scoreBucket || "plan_credibility_score",
    message: sanitizeText(message, 320),
    stepRef: sanitizeText(stepRef || `week ${week}`, 220),
    evidence: evidence == null ? null : cloneValue(evidence),
    screenshots: [],
    likelyFiles: cloneValue(meta.likelyFiles || []),
    specRefs: cloneValue(meta.specRefs || []),
    recommendedFixCluster: meta.recommendedFixCluster || "Synthetic lab follow-up",
  };
};

const createCheckRecord = ({
  id = "",
  week = 0,
  passed = false,
  clusterId = "",
  message = "",
  severity = "",
  subsystem = "",
  stepRef = "",
  evidence = null,
} = {}) => ({
  id: sanitizeText(id, 120),
  week,
  passed: Boolean(passed),
  clusterId: sanitizeText(clusterId, 80),
  severity: severity || FAILURE_CLUSTER_META[clusterId]?.severity || "medium",
  subsystem: subsystem || FAILURE_CLUSTER_META[clusterId]?.subsystem || "unknown",
  stepRef: sanitizeText(stepRef || `week ${week}`, 220),
  detail: sanitizeText(message, 320),
  evidence: evidence == null ? null : cloneValue(evidence),
});

const countPlannedSessions = (sessionsByDay = {}) => (
  Object.values(sessionsByDay || {}).filter((session) => session && !["rest", "recovery"].includes(String(session?.type || "").toLowerCase())).length
);

const pickReviewDayIndex = (sessionsByDay = {}) => {
  const preferred = sessionsByDay?.[LAB_REVIEW_DAY_OF_WEEK];
  if (preferred && !["rest", "recovery"].includes(String(preferred?.type || "").toLowerCase())) {
    return LAB_REVIEW_DAY_OF_WEEK;
  }
  const entries = Object.entries(sessionsByDay || {}).find(([, session]) => session && !["rest", "recovery"].includes(String(session?.type || "").toLowerCase()));
  return entries ? Number(entries[0]) : LAB_REVIEW_DAY_OF_WEEK;
};

const buildPlanDayRecord = ({
  dateKey = "",
  weekNumber = 1,
  phase = "BASE",
  training = null,
  nutritionTargets = null,
  decisionMode = "progression_ready",
  provenanceSummary = "Planned session snapshot.",
} = {}) => buildPlannedDayRecord({
  id: `plan_day_${dateKey}`,
  dateKey,
  week: { number: weekNumber, phase },
  base: {
    training,
    nutrition: nutritionTargets ? { prescription: { dayType: String(training?.type || "training"), targets: nutritionTargets } } : null,
    recovery: null,
    supplements: null,
  },
  resolved: {
    training,
    nutrition: nutritionTargets ? { prescription: { dayType: String(training?.type || "training"), targets: nutritionTargets } } : null,
    recovery: { state: decisionMode === "reduced_load" ? "caution" : "ready" },
    supplements: null,
  },
  decision: {
    mode: decisionMode,
    modifiedFromBase: decisionMode !== "progression_ready",
  },
  provenance: {
    summary: provenanceSummary,
    keyDrivers: [],
    events: [],
  },
    flags: {},
  });

const buildWeekEvent = ({ persona = {}, week = 1 } = {}) => {
  const coachUsageStyle = inferCoachUsageStyle(persona);
  const chaosLevel = inferChaosLevel(persona);
  const timingStyle = inferGoalTimingStyle(persona);
  const goalCount = normalizeIntentEntries(persona).length;
  const hasMultiGoal = goalCount > 1;
  const isTravelHeavy = /high|travel|hotel|airport/.test(`${persona.travelLikelihood || ""} ${persona.scheduleReality || ""} ${persona.equipmentReality || ""}`.toLowerCase());
  const isPainSensitive = /pain|ache|rehab|back|hip|achilles|knee|shoulder|pelvic floor|injury/.test(String(persona.injuryContext || "").toLowerCase());
  const nutritionRisk = /fat loss|lose|cut|lean|restaurant|airport|night shift|protein|chaotic|dieter|meal|snack/.test(`${persona.bodyCompContext || ""} ${persona.nutritionBehavior || ""} ${normalizeIntentEntries(persona).map((entry) => entry.text).join(" ")}`.toLowerCase());
  const equipmentVolatile = /hotel|travel|bands|minimal|apartment|home dumbbells/.test(`${persona.equipmentReality || ""} ${persona.environmentMode || ""}`.toLowerCase());
  const baseAdherence = chaosLevel === "high" ? 0.64 : chaosLevel === "medium" ? 0.72 : 0.8;
  const baseLogging = coachUsageStyle === "never" ? 0.58 : chaosLevel === "high" ? 0.64 : 0.76;
  const defaultCoachUsage = coachUsageStyle === "never"
    ? "none"
    : coachUsageStyle === "overuse"
    ? week % 3 === 0 ? "overuse" : "ask_anything"
    : coachUsageStyle === "minimal"
    ? week % 8 === 0 ? "change_plan" : "none"
    : week % 7 === 0
    ? "ask_anything"
    : week % 5 === 0
    ? "change_plan"
    : "none";

  const generic = {
    label: "steady usage",
    adherencePct: baseAdherence,
    loggingPct: baseLogging,
    nutritionDrift: false,
    travel: false,
    painFlare: false,
    scheduleChange: false,
    equipmentMode: "normal",
    coachUsage: defaultCoachUsage,
    motivation: chaosLevel === "high" && week % 6 === 0 ? "low" : week % 6 === 0 ? "mixed" : "steady",
    goalChange: null,
  };

  if (persona.id === "novice_obese_beginner") {
    if (week === 2) return { ...generic, label: "half-finished week", adherencePct: 0.5, loggingPct: 0.45, motivation: "shaky" };
    if (week === 4) return { ...generic, label: "travel week", adherencePct: 0.38, loggingPct: 0.35, travel: true, scheduleChange: true, equipmentMode: "hotel", coachUsage: "change_plan" };
    if (week === 6) return { ...generic, label: "knee flare", adherencePct: 0.32, loggingPct: 0.65, painFlare: true, coachUsage: "change_plan", motivation: "low" };
    if (week === 8) return { ...generic, label: "motivation dip", adherencePct: 0.42, loggingPct: 0.25, motivation: "low", coachUsage: "none" };
    if (week === 10) return { ...generic, label: "schedule changed", adherencePct: 0.58, loggingPct: 0.52, scheduleChange: true, coachUsage: "ask_anything" };
    if (week === 12) {
      return {
        ...generic,
        label: "goal edited to an exact date",
        adherencePct: 0.68,
        loggingPct: 0.72,
        coachUsage: "change_plan",
        goalChange: {
          kind: "edit",
          timingMode: "exact_date",
          targetDate: "2026-09-30",
        },
      };
    }
    if (week === 14) return { ...generic, label: "goals reprioritized", adherencePct: 0.64, loggingPct: 0.74, coachUsage: "change_plan", goalChange: { kind: "reprioritize" } };
    if (week === 16) return { ...generic, label: "equipment changed", adherencePct: 0.52, loggingPct: 0.55, equipmentMode: "bands_only", coachUsage: "change_plan", goalChange: { kind: "edit", timingMode: "target_horizon", targetHorizonWeeks: 20 } };
    if (week === 18) return { ...generic, label: "nutrition drift", adherencePct: 0.48, loggingPct: 0.5, nutritionDrift: true, coachUsage: "ask_anything", goalChange: { kind: "edit", timingMode: "open_ended" } };
    if (week === 20) return { ...generic, label: "coach overuse week", adherencePct: 0.56, loggingPct: 0.7, coachUsage: "overuse", motivation: "mixed" };
    if (week === 22) return { ...generic, label: "archive lower-priority goal", adherencePct: 0.62, loggingPct: 0.72, coachUsage: "change_plan", goalChange: { kind: "archive" } };
    if (week === 24) return { ...generic, label: "restore goal", adherencePct: 0.7, loggingPct: 0.78, coachUsage: "change_plan", goalChange: { kind: "restore" } };
    if (week === 26) return { ...generic, label: "steady finish", adherencePct: 0.82, loggingPct: 0.84, motivation: "steady" };
    return generic;
  }

  if (week === 4 && isTravelHeavy) {
    return {
      ...generic,
      label: "travel disruption",
      adherencePct: Math.max(0.36, baseAdherence - 0.22),
      loggingPct: Math.max(0.35, baseLogging - 0.18),
      travel: true,
      scheduleChange: true,
      equipmentMode: "hotel",
      coachUsage: coachUsageStyle === "never" ? "none" : "change_plan",
      motivation: chaosLevel === "high" ? "low" : "mixed",
    };
  }
  if (week === 8 && isPainSensitive) {
    return {
      ...generic,
      label: "pain flare",
      adherencePct: Math.max(0.34, baseAdherence - 0.26),
      loggingPct: Math.min(0.78, baseLogging + 0.04),
      painFlare: true,
      coachUsage: coachUsageStyle === "never" ? "none" : "change_plan",
      motivation: "low",
    };
  }
  if (week === 10 && chaosLevel !== "low") {
    return {
      ...generic,
      label: "schedule changed",
      adherencePct: Math.max(0.48, baseAdherence - 0.12),
      loggingPct: Math.max(0.46, baseLogging - 0.1),
      scheduleChange: true,
      coachUsage: coachUsageStyle === "never" ? "none" : "ask_anything",
      motivation: "mixed",
    };
  }
  if (week === 12 && (hasMultiGoal || timingStyle !== "open_ended")) {
    const goalChange = timingStyle === "open_ended"
      ? { kind: "edit", timingMode: "target_horizon", targetHorizonWeeks: 16 }
      : timingStyle === "date_based"
      ? { kind: "edit", timingMode: "target_horizon", targetHorizonWeeks: 20 }
      : { kind: "edit", timingMode: "exact_date", targetDate: "2026-09-30" };
    return {
      ...generic,
      label: timingStyle === "open_ended" ? "goal sharpened into a milestone horizon" : timingStyle === "date_based" ? "timeline softened into a milestone horizon" : "goal pinned to an exact date",
      adherencePct: Math.max(0.6, baseAdherence - 0.04),
      loggingPct: Math.max(0.68, baseLogging),
      coachUsage: coachUsageStyle === "never" ? "none" : "change_plan",
      goalChange,
    };
  }
  if (week === 14 && hasMultiGoal) {
    return {
      ...generic,
      label: "goals reprioritized",
      adherencePct: Math.max(0.6, baseAdherence - 0.02),
      loggingPct: Math.max(0.7, baseLogging),
      coachUsage: coachUsageStyle === "never" ? "none" : "change_plan",
      goalChange: { kind: "reprioritize" },
    };
  }
  if (week === 16 && equipmentVolatile) {
    return {
      ...generic,
      label: "equipment changed",
      adherencePct: Math.max(0.46, baseAdherence - 0.14),
      loggingPct: Math.max(0.48, baseLogging - 0.06),
      equipmentMode: "bands_only",
      coachUsage: coachUsageStyle === "never" ? "none" : "change_plan",
      goalChange: timingStyle === "date_based" ? { kind: "edit", timingMode: "target_horizon", targetHorizonWeeks: 20 } : null,
    };
  }
  if (week === 18 && nutritionRisk) {
    return {
      ...generic,
      label: "nutrition drift",
      adherencePct: Math.max(0.44, baseAdherence - 0.18),
      loggingPct: Math.max(0.5, baseLogging - 0.1),
      nutritionDrift: true,
      coachUsage: coachUsageStyle === "never" ? "none" : "ask_anything",
      goalChange: timingStyle !== "open_ended" ? { kind: "edit", timingMode: "open_ended" } : null,
    };
  }
  if (week === 20 && coachUsageStyle === "overuse") {
    return {
      ...generic,
      label: "coach overuse week",
      adherencePct: Math.max(0.54, baseAdherence - 0.08),
      loggingPct: Math.max(0.7, baseLogging),
      coachUsage: "overuse",
      motivation: "mixed",
    };
  }
  if (week === 22 && hasMultiGoal) {
    return {
      ...generic,
      label: "archive lower-priority goal",
      adherencePct: Math.max(0.6, baseAdherence - 0.02),
      loggingPct: Math.max(0.7, baseLogging),
      coachUsage: coachUsageStyle === "never" ? "none" : "change_plan",
      goalChange: { kind: "archive" },
    };
  }
  if (week === 24 && hasMultiGoal) {
    return {
      ...generic,
      label: "restore archived goal",
      adherencePct: Math.max(0.68, baseAdherence),
      loggingPct: Math.max(0.76, baseLogging),
      coachUsage: coachUsageStyle === "never" ? "none" : "change_plan",
      goalChange: { kind: "restore" },
    };
  }
  if (week === 26) return { ...generic, label: "steady finish", adherencePct: Math.max(0.8, baseAdherence), loggingPct: Math.max(0.82, baseLogging), motivation: "steady" };
  return generic;
};

const applyWeekPersonalization = ({
  personalization = {},
  persona = {},
  event = {},
} = {}) => {
  const next = cloneValue(personalization || {});
  const sessionLength = event.travel ? "25" : event.scheduleChange ? "30" : persona.sessionLength || "45";
  const equipmentMode = event.equipmentMode === "hotel"
    ? { mode: "Travel", equipment: "bodyweight", equipmentItems: ["hotel gym", "bodyweight"], time: sessionLength, intensity: "Conservative" }
    : event.equipmentMode === "bands_only"
    ? { mode: "Home", equipment: "bands", equipmentItems: ["bands"], time: sessionLength, intensity: "Conservative" }
    : { mode: persona.environmentMode || "Gym", equipment: persona.equipmentAccess || "basic_gym", equipmentItems: [persona.equipmentReality || persona.equipmentAccess || "basic gym"], time: sessionLength, intensity: persona.preferredIntensity || "Standard" };
  next.trainingContext = buildTrainingContextFromEditor(equipmentMode);
  next.userGoalProfile = {
    ...(next.userGoalProfile || {}),
    days_per_week: Math.max(2, inferDaysPerWeek(persona.scheduleReality) - (event.scheduleChange ? 1 : 0)),
    session_length: sessionLength,
  };
  next.travelState = {
    environmentMode: event.travel ? "travel" : "home",
    access: event.travel ? "hotel" : "stable",
    isTravelWeek: Boolean(event.travel),
  };
  return next;
};

const pickCoachAction = ({
  event = {},
  quickActions = [],
} = {}) => {
  if (!Array.isArray(quickActions) || !quickActions.length) return null;
  if (event.painFlare) return quickActions.find((action) => /pain-aware/i.test(action.label)) || null;
  if (event.travel) return quickActions.find((action) => /move long run|reduce this week's volume/i.test(action.label)) || null;
  if (event.nutritionDrift) return quickActions.find((action) => /simplify meals/i.test(action.label)) || null;
  if (event.coachUsage === "overuse") return quickActions.find((action) => /reduce this week's volume/i.test(action.label)) || quickActions[0];
  return quickActions.find((action) => /reduce this week's volume|recovery/i.test(action.label)) || quickActions[0];
};

const buildWeekOutcome = ({
  week = 1,
  event = {},
  planWeek = null,
  plannedSession = null,
} = {}) => {
  const weekStartDateKey = weekStartDateKeyFor(week);
  const sessionsByDay = planWeek?.sessionsByDay || {};
  const sessionEntries = Object.entries(sessionsByDay)
    .map(([dayIndex, session]) => ({ dayIndex: Number(dayIndex), session }))
    .filter(({ session }) => session && !["rest", "recovery"].includes(String(session?.type || "").toLowerCase()))
    .sort((left, right) => left.dayIndex - right.dayIndex);
  const plannedSessionCount = sessionEntries.length;
  const completedCount = Math.max(0, Math.min(plannedSessionCount, Math.round(plannedSessionCount * Number(event.adherencePct || 0))));
  const loggedCompletedCount = Math.max(0, Math.min(completedCount, Math.round(completedCount * Number(event.loggingPct || 0))));
  const logs = {};
  const dailyCheckins = {};
  const nutritionActualLogs = {};
  const reviewDayIndex = pickReviewDayIndex(sessionsByDay);

  sessionEntries.forEach(({ dayIndex, session }, index) => {
    const dateKey = addDaysToDateKey(weekStartDateKey, dayIndex);
    const completed = index < completedCount;
    const logged = index < loggedCompletedCount;
    const modified = completed && (event.painFlare || event.travel || event.scheduleChange) && dayIndex === reviewDayIndex;
    if (completed && logged) {
      logs[dateKey] = {
        type: modified ? `${session.label} Modified` : session.label,
        actualSession: {
          status: modified ? "completed_modified" : "completed_as_planned",
          sessionType: session.type,
          sessionLabel: modified ? `${session.label} Modified` : session.label,
        },
      };
    } else if (!completed && dayIndex === reviewDayIndex) {
      logs[dateKey] = {
        checkin: {
          status: "skipped",
          note: event.label,
        },
      };
    }
    dailyCheckins[dateKey] = {
      status: completed ? (modified ? "completed_modified" : "completed_as_planned") : "skipped",
      note: completed ? (modified ? event.label : "Completed") : event.label,
    };
    nutritionActualLogs[dateKey] = normalizeActualNutritionLog({
      dateKey,
      feedback: {
        deviationKind: event.nutritionDrift && dayIndex === reviewDayIndex ? "under_fueled" : "followed",
        hydrationOz: event.travel ? 48 : 84,
        hydrationTargetOz: 96,
        note: event.nutritionDrift ? "Food choices drifted this week." : "Stayed close to the plan.",
      },
    });
  });

  const weeklyCheckin = {
    energy: event.painFlare ? 2 : event.motivation === "low" ? 2 : 3,
    stress: event.travel || event.scheduleChange ? 4 : 2,
    confidence: event.motivation === "low" ? 2 : event.coachUsage === "change_plan" ? 3 : 4,
    ts: new Date(`${weekStartDateKey}T12:00:00`).getTime(),
  };

  return {
    plannedSessionCount,
    completedCount,
    loggedCompletedCount,
    logs,
    dailyCheckins,
    nutritionActualLogs,
    weeklyCheckin,
    reviewDayIndex,
    reviewDateKey: addDaysToDateKey(weekStartDateKey, reviewDayIndex),
    reviewSession: sessionsByDay?.[reviewDayIndex] || plannedSession || null,
  };
};

const buildWeekBodyweight = ({
  currentBodyweight = 0,
  event = {},
} = {}) => {
  if (!Number.isFinite(currentBodyweight) || currentBodyweight <= 0) return currentBodyweight;
  const adherenceDelta = Number(event.adherencePct || 0) >= 0.75 ? -0.6 : Number(event.adherencePct || 0) >= 0.5 ? -0.25 : 0;
  const nutritionPenalty = event.nutritionDrift ? 0.4 : 0;
  const travelPenalty = event.travel ? 0.2 : 0;
  const painPenalty = event.painFlare ? 0.15 : 0;
  return Number((currentBodyweight + adherenceDelta + nutritionPenalty + travelPenalty + painPenalty).toFixed(1));
};

const evaluateGoalManagement = ({
  state = {},
  event = {},
  week = 1,
  failures = [],
  checks = [],
} = {}) => {
  const now = new Date(`${weekStartDateKeyFor(week)}T12:00:00`);
  const currentView = buildGoalSettingsViewModel({
    goals: state.goals,
    personalization: state.personalization,
    now,
  });
  let nextState = state;

  if (!event.goalChange) {
    return {
      nextState: {
        ...state,
        latestGoalSettingsView: currentView,
      },
      failures,
      checks,
    };
  }

  const activeCardIds = currentView.currentGoalOrder || [];
  const activeCards = currentView.currentGoals || [];
  const weightGoalCard = activeCards.find((card) => /lose|lean/i.test(`${card.summary || ""} ${card.primaryMetricLabel || ""}`));
  const fallbackGoalCard = activeCards.find((card) => card?.id && card.id !== activeCardIds[0]) || activeCards[0] || null;
  const editableGoalCard = weightGoalCard || fallbackGoalCard;
  const change = (() => {
    if (event.goalChange.kind === "reprioritize" && activeCardIds.length >= 2) {
      return {
        type: GOAL_MANAGEMENT_CHANGE_TYPES.reprioritize,
        orderedGoalIds: [...activeCardIds.slice(1, 2), ...activeCardIds.slice(0, 1), ...activeCardIds.slice(2)],
      };
    }
    if (event.goalChange.kind === "archive" && editableGoalCard?.id) {
      return {
        type: GOAL_MANAGEMENT_CHANGE_TYPES.archive,
        goalId: editableGoalCard.id,
        archiveStatus: GOAL_ARCHIVE_STATUSES.archived,
      };
    }
    if (event.goalChange.kind === "restore") {
      const archivedCard = (currentView.archivedGoals || []).find((card) => /lose|lean/i.test(`${card.summary || ""} ${card.primaryMetricLabel || ""}`))
        || (currentView.archivedGoals || [])[0]
        || null;
      if (!archivedCard?.id) return null;
      return {
        type: GOAL_MANAGEMENT_CHANGE_TYPES.restore,
        goalId: archivedCard.id,
      };
    }
    if (event.goalChange.kind === "edit" && editableGoalCard?.id) {
      const draft = buildGoalEditorDraft({
        goal: (state.goals || []).find((goal) => String(goal.goalRecordId || goal.resolvedGoal?.id || goal.id) === editableGoalCard.id) || null,
      });
      return {
        type: GOAL_MANAGEMENT_CHANGE_TYPES.edit,
        goalId: editableGoalCard.id,
        draft: {
          ...draft,
          timingMode: event.goalChange.timingMode,
          targetDate: event.goalChange.targetDate || "",
          targetHorizonWeeks: event.goalChange.targetHorizonWeeks ? String(event.goalChange.targetHorizonWeeks) : "",
        },
      };
    }
    return null;
  })();

  if (!change) {
    failures.push(createFailureRecord({
      personaId: state.personalization?.profile?.name || "",
      week,
      clusterId: "hidden_secondary_goals",
      message: "Settings goal-management change could not be targeted to an active or archived goal.",
      stepRef: `week ${week} > settings > goals`,
    }));
    return { nextState: state, failures, checks };
  }

  const preview = buildGoalManagementPreview({
    goals: state.goals,
    personalization: state.personalization,
    change,
    now,
  });

  const previewPassed = Boolean(preview?.impactLines?.length && preview?.explicitHistoryNote);
  checks.push(createCheckRecord({
    id: `goal_management_preview_week_${week}`,
    week,
    passed: previewPassed,
    clusterId: previewPassed ? "" : "hidden_secondary_goals",
    message: previewPassed
      ? "Goal-management preview surfaced plan impact and history-preservation copy."
      : "Goal-management preview did not produce actionable impact lines.",
    stepRef: `week ${week} > settings > goals`,
    evidence: preview ? { impactLines: preview.impactLines, explicitHistoryNote: preview.explicitHistoryNote } : null,
  }));
  if (!previewPassed) {
    failures.push(createFailureRecord({
      personaId: state.personalization?.profile?.name || "",
      week,
      clusterId: "hidden_secondary_goals",
      message: "Goal-management preview failed to explain the impact before commit.",
      stepRef: `week ${week} > settings > goals`,
      evidence: preview,
    }));
    return { nextState: state, failures, checks };
  }

  nextState = {
    ...state,
    goals: normalizeGoals(preview.nextGoals || state.goals),
    personalization: {
      ...state.personalization,
      goalManagement: preview.nextGoalManagement,
    },
    latestGoalSettingsView: preview.nextViewModel,
  };

  const historyVisible = (preview?.nextGoalManagement?.history || []).length > 0;
  if (!historyVisible) {
    failures.push(createFailureRecord({
      personaId: state.personalization?.profile?.name || "",
      week,
      clusterId: "audit_confidence_erosion",
      message: "Goal-management commit did not preserve a visible history entry.",
      stepRef: `week ${week} > settings > goals > confirm`,
      evidence: preview,
    }));
  }

  return { nextState, failures, checks };
};

const runArchetypeQuickProbe = (persona = {}) => {
  const goals = buildGoalsFromPersona(persona);
  const personalization = createPersonalization({ persona, includeMetrics: true, programs: null });
  const athleteProfile = deriveCanonicalAthleteState({ goals, personalization, profileDefaults: { name: persona.name } });
  const supportTier = buildSupportTierModel({
    goals,
    domainAdapterId: athleteProfile?.primaryGoal?.resolvedGoal?.primaryDomain || athleteProfile?.goalCapabilityStack?.primary?.primaryDomain || "",
    goalCapabilityStack: athleteProfile?.goalCapabilityStack || null,
  });
  const anchorEngine = buildMissingAnchorsEngine({
    resolvedGoals: goals.map((goal) => goal?.resolvedGoal || null).filter(Boolean),
    answers: {},
    userContext: buildUserContextForAnchors(persona),
  });
  const composer = composeGoalNativePlan({
    goals,
    personalization,
    athleteProfile,
    momentum: { inconsistencyRisk: "medium", momentumState: "stable" },
    learningLayer: {},
    baseWeek: LAB_BASE_WEEK,
    currentWeek: 1,
    weekTemplates: LAB_WEEK_TEMPLATES,
    logs: {},
    bodyweights: persona?.baselineMetrics?.bodyweight ? [{ date: LAB_START_DATE_KEY, w: persona.baselineMetrics.bodyweight }] : [],
    dailyCheckins: {},
    nutritionActualLogs: {},
    weeklyNutritionReview: null,
    coachActions: [],
    todayKey: LAB_START_DATE_KEY,
    currentDayOfWeek: LAB_TODAY_DAY_OF_WEEK,
    plannedDayRecords: {},
    planWeekRecords: {},
  });
  const metricsModel = buildMetricsBaselinesModel({
    athleteProfile,
    personalization,
    logs: {},
    bodyweights: persona?.baselineMetrics?.bodyweight ? [{ date: LAB_START_DATE_KEY, w: persona.baselineMetrics.bodyweight }] : [],
  });
  const blockers = [];
  if (!goals.length && toArray(persona.goalIntents).length) blockers.push("No goals resolved.");
  if (!composer?.programBlock) blockers.push("Planner did not produce a usable first block.");
  if (anchorEngine?.missingAnchors?.length > 3) blockers.push("Too many required anchors before the first build.");
  if (persona.supportTierExpectation && supportTier?.id !== persona.supportTierExpectation) {
    blockers.push("Support tier undershoots the expected core-use-case level.");
  }
  const verdict = blockers.length ? "watch" : "credible";
  return {
    personaId: persona.id,
    name: persona.name,
    supportTier: supportTier?.id || "",
    verdict,
    resolvedGoalCount: goals.length,
    missingRequiredAnchors: toArray(anchorEngine?.missingAnchors || []).map((anchor) => anchor.field_id),
    missingBaselineCards: toArray(metricsModel?.missingCards || []).map((card) => card.id),
    blockers,
  };
};

const computeCategoryScores = (failures = []) => (
  Object.fromEntries(
    SCORE_BUCKET_KEYS.map((bucket) => {
      const relevant = failures.filter((failure) => failure.scoreBucket === bucket);
      const penalty = relevant.reduce((sum, failure) => sum + scoreSeverityPenalty(failure.severity), 0);
      return [bucket, Math.max(0, 100 - penalty)];
    })
  )
);

const averageCategoryScores = (scores = {}) => {
  const values = SCORE_BUCKET_KEYS.map((bucket) => Number(scores?.[bucket] || 0));
  return Number((values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)).toFixed(1));
};

const buildClusterTaxonomy = (personaResults = []) => {
  const taxonomy = Object.fromEntries(REQUIRED_CLUSTER_IDS.map((clusterId) => [clusterId, {
    clusterId,
    severity: FAILURE_CLUSTER_META[clusterId]?.severity || "medium",
    subsystem: FAILURE_CLUSTER_META[clusterId]?.subsystem || "unknown",
    count: 0,
    severeCount: 0,
    mediumCount: 0,
    personas: [],
    stepRefs: [],
    sampleMessage: "",
    recommendedFixCluster: FAILURE_CLUSTER_META[clusterId]?.recommendedFixCluster || "",
    likelyFiles: cloneValue(FAILURE_CLUSTER_META[clusterId]?.likelyFiles || []),
    specRefs: cloneValue(FAILURE_CLUSTER_META[clusterId]?.specRefs || []),
  }]));

  personaResults.forEach((result) => {
    toArray(result?.failures || []).forEach((failure) => {
      const bucket = taxonomy[failure.clusterId];
      if (!bucket) return;
      bucket.count += 1;
      if (failure.severity === "severe") bucket.severeCount += 1;
      if (failure.severity === "medium") bucket.mediumCount += 1;
      bucket.personas = [...new Set([...bucket.personas, result.personaId])];
      bucket.stepRefs = [...new Set([...bucket.stepRefs, failure.stepRef])].slice(0, 8);
      if (!bucket.sampleMessage) bucket.sampleMessage = failure.message;
    });
  });

  return taxonomy;
};

const runPersona = (persona = {}, { weeks = LAB_SIMULATION_WEEKS } = {}) => {
  let state = createBaseState(persona);
  const failures = [];
  const checks = [];
  const timeline = [];
  const personaLabel = persona.id || persona.name || "persona";
  const rawGoalTexts = normalizeIntentEntries(persona).map((entry) => entry.text);

  if (rawGoalTexts.length > 1 && state.goals.length < rawGoalTexts.length) {
    failures.push(createFailureRecord({
      personaId: personaLabel,
      week: 0,
      clusterId: "goal_miscapture",
      message: `Persona supplied ${rawGoalTexts.length} goals but only ${state.goals.length} resolved goals survived intake parsing.`,
      stepRef: "week 0 > intake > interpretation",
      evidence: { rawGoalTexts, resolvedGoalSummaries: state.goals.map((goal) => goal?.resolvedGoal?.summary || goal?.name || "") },
    }));
  }

  const intakeApplied = applyIntakeAnswersToState({ persona, state });
  state = intakeApplied.nextState;
  intakeApplied.intakeReport.failures.forEach((failure) => {
    failures.push(createFailureRecord({
      personaId: personaLabel,
      week: 0,
      clusterId: failure.clusterId,
      message: failure.message,
      stepRef: failure.stepRef,
      evidence: intakeApplied.intakeReport,
    }));
  });

  const intakeAnchorPassed = intakeApplied.intakeReport.missingRequiredFields.length === 0;
  checks.push(createCheckRecord({
    id: "intake_required_anchors_resolved",
    week: 0,
    passed: intakeAnchorPassed,
    clusterId: intakeAnchorPassed ? "" : "baseline_timing_problems",
    message: intakeAnchorPassed
      ? "Required intake anchors were answered inline before build."
      : "Required intake anchors were still missing at build time.",
    stepRef: "week 0 > intake > clarify",
    evidence: intakeApplied.intakeReport,
  }));
  if (!intakeAnchorPassed) {
    failures.push(createFailureRecord({
      personaId: personaLabel,
      week: 0,
      clusterId: "baseline_timing_problems",
      message: "Inline intake did not gather all required anchors before the first plan build.",
      stepRef: "week 0 > intake > clarify",
      evidence: intakeApplied.intakeReport,
    }));
  }

  if (intakeApplied.intakeReport.askedFields.length > 4) {
    failures.push(createFailureRecord({
      personaId: personaLabel,
      week: 0,
      clusterId: "intake_friction",
      message: `Intake asked ${intakeApplied.intakeReport.askedFields.length} required anchor questions for the first build.`,
      stepRef: "week 0 > intake > clarify",
      evidence: intakeApplied.intakeReport.askedFields,
    }));
  }

  const initialSupportTier = buildSupportTierModel({
    goals: state.goals,
    domainAdapterId: state.athleteProfile?.primaryGoal?.resolvedGoal?.primaryDomain || state.athleteProfile?.goalCapabilityStack?.primary?.primaryDomain || "",
    goalCapabilityStack: state.athleteProfile?.goalCapabilityStack || null,
  });
  if (persona.supportTierExpectation && initialSupportTier?.id !== persona.supportTierExpectation) {
    failures.push(createFailureRecord({
      personaId: personaLabel,
      week: 0,
      clusterId: "support_tier_dishonesty",
      message: `Expected ${persona.supportTierExpectation} coverage for this persona, but the planner classified it as ${initialSupportTier?.id || "unknown"}.`,
      stepRef: "week 0 > intake > confirm",
      evidence: { expected: persona.supportTierExpectation, actual: initialSupportTier?.id, basisLine: initialSupportTier?.basisLine },
    }));
  }

  for (let week = 1; week <= weeks; week += 1) {
    const event = buildWeekEvent({ persona, week });
    const weekDateKey = weekStartDateKeyFor(week);
    const weekPersonalization = applyWeekPersonalization({
      personalization: state.personalization,
      persona,
      event,
    });
    const athleteProfile = deriveCanonicalAthleteState({
      goals: state.goals,
      personalization: weekPersonalization,
      profileDefaults: { name: persona.name },
    });
    const momentum = {
      inconsistencyRisk: Number(event.loggingPct || 0) < 0.55 ? "high" : "medium",
      momentumState: event.motivation === "low" ? "fragile" : "stable",
    };
    const nutritionReview = buildScenarioNutritionReview({ persona, event });
    const baseComposer = composeGoalNativePlan({
      goals: state.goals,
      personalization: weekPersonalization,
      athleteProfile,
      momentum,
      learningLayer: {},
      baseWeek: LAB_BASE_WEEK,
      currentWeek: week,
      weekTemplates: LAB_WEEK_TEMPLATES,
      logs: state.logs,
      bodyweights: state.bodyweights,
      dailyCheckins: state.dailyCheckins,
      nutritionActualLogs: state.nutritionActualLogs,
      weeklyNutritionReview: event.nutritionDrift ? nutritionReview : null,
      coachActions: state.coachActions,
      todayKey: addDaysToDateKey(weekDateKey, LAB_TODAY_DAY_OF_WEEK),
      currentDayOfWeek: LAB_TODAY_DAY_OF_WEEK,
      plannedDayRecords: {},
      planWeekRecords: state.planWeekRecords,
    });
    const reviewDayIndex = pickReviewDayIndex(baseComposer?.dayTemplates || {});
    const baseReviewSession = baseComposer?.dayTemplates?.[reviewDayIndex] || null;
    const coachQuickActions = buildCoachQuickChangeActions({
      currentWeek: week,
      todayWorkout: baseReviewSession,
      injuryArea: event.painFlare ? "Knee" : "General",
    });
    const askAnythingState = buildCoachAskAnythingStateModel({
      apiKey: event.coachUsage === "ask_anything" || event.coachUsage === "overuse" ? "lab-api-key" : "",
    });
    const chosenCoachAction = (event.coachUsage === "change_plan" || event.coachUsage === "overuse")
      ? pickCoachAction({ event, quickActions: coachQuickActions })
      : null;
    const acceptedCoachAction = chosenCoachAction ? {
      ...chosenCoachAction.action,
      id: `coach_action_${persona.id}_${week}`,
      ts: new Date(`${weekDateKey}T12:00:00`).getTime(),
      acceptedBy: "synthetic_lab",
      proposalSource: "synthetic_lab",
      reason: event.label,
    } : null;
    const effectiveCoachActions = acceptedCoachAction ? [...state.coachActions, acceptedCoachAction] : state.coachActions;
    const effectiveComposer = acceptedCoachAction ? composeGoalNativePlan({
      goals: state.goals,
      personalization: weekPersonalization,
      athleteProfile,
      momentum,
      learningLayer: {},
      baseWeek: LAB_BASE_WEEK,
      currentWeek: week,
      weekTemplates: LAB_WEEK_TEMPLATES,
      logs: state.logs,
      bodyweights: state.bodyweights,
      dailyCheckins: state.dailyCheckins,
      nutritionActualLogs: state.nutritionActualLogs,
      weeklyNutritionReview: event.nutritionDrift ? nutritionReview : null,
      coachActions: effectiveCoachActions,
      todayKey: addDaysToDateKey(weekDateKey, LAB_TODAY_DAY_OF_WEEK),
      currentDayOfWeek: LAB_TODAY_DAY_OF_WEEK,
      plannedDayRecords: {},
      planWeekRecords: state.planWeekRecords,
    }) : baseComposer;

    const rollingHorizon = buildRollingHorizonWeeks({
      currentWeek: week,
      horizonWeeks: LAB_VISIBLE_HORIZON_WEEKS,
      goals: state.goals,
      weekTemplates: LAB_WEEK_TEMPLATES,
      architecture: effectiveComposer.architecture,
      programBlock: effectiveComposer.programBlock,
      programContext: effectiveComposer.programContext,
      blockIntent: effectiveComposer.blockIntent,
      split: effectiveComposer.split,
      sessionsByDay: effectiveComposer.dayTemplates,
      referenceTemplate: LAB_BASE_WEEK,
      constraints: effectiveComposer.constraints,
    });
    const currentPlanWeek = rollingHorizon?.[0]?.planWeek || null;
    const plannedSession = effectiveComposer?.dayTemplates?.[reviewDayIndex] || null;
    const todayKey = addDaysToDateKey(weekDateKey, LAB_TODAY_DAY_OF_WEEK);
    const todayPlan = generateTodayPlan(
      {
        primaryGoalKey: athleteProfile?.userProfile?.primaryGoalKey,
        experienceLevel: athleteProfile?.userProfile?.experienceLevel,
        daysPerWeek: athleteProfile?.userProfile?.daysPerWeek,
        sessionLength: athleteProfile?.userProfile?.sessionLength,
        constraints: athleteProfile?.userProfile?.constraints || [],
        trainingContext: athleteProfile?.trainingContext,
      },
      { todayKey, logs: state.logs },
      {
        fatigueScore: event.painFlare ? 4 : event.motivation === "low" ? 3 : 2,
        trend: event.nutritionDrift ? "down" : "stable",
        momentum: event.motivation === "low" ? "fragile" : "stable",
        injuryLevel: event.painFlare ? "moderate_pain" : "none",
      },
      {
        plannedSession,
        planningBasis: effectiveComposer.planningBasis,
        programBlock: effectiveComposer.programBlock,
        weeklyIntent: { focus: effectiveComposer.programBlock?.summary || "Execute the current week cleanly." },
        changeSummary: effectiveComposer.changeSummary,
      }
    );
    const logDraft = buildWorkoutLogDraft({
      dateKey: todayKey,
      plannedDayRecord: buildPlanDayRecord({
        dateKey: todayKey,
        weekNumber: week,
        phase: currentPlanWeek?.phase || "BASE",
        training: plannedSession,
        nutritionTargets: { cal: 2200, p: 180, c: 220, f: 70 },
      }),
      fallbackTraining: plannedSession,
    });
    const nutritionLayer = deriveAdaptiveNutrition({
      todayWorkout: plannedSession,
      goals: state.goals,
      momentum,
      personalization: weekPersonalization,
      bodyweights: state.bodyweights,
      learningLayer: {},
      nutritionActualLogs: state.nutritionActualLogs,
      coachPlanAdjustments: {},
      salvageLayer: {},
      failureMode: {},
    });
    const realWorldNutrition = deriveRealWorldNutritionEngine({
      location: weekPersonalization?.localFoodContext?.city || "Chicago",
      dayType: nutritionLayer?.dayType,
      goalContext: nutritionLayer?.goalContext,
      nutritionLayer,
      momentum,
      favorites: { groceries: weekPersonalization?.localFoodContext?.groceryOptions || [] },
      travelMode: nutritionLayer?.travelMode,
      learningLayer: {},
      timeOfDay: "evening",
      loggedIntake: null,
    });
    const weekOutcome = buildWeekOutcome({
      week,
      event,
      planWeek: currentPlanWeek,
      plannedSession,
    });

    const nutritionTargets = nutritionLayer?.targets || { cal: 2200, p: 180, c: 220, f: 70 };
    const baseReviewRecord = buildPlanDayRecord({
      dateKey: weekOutcome.reviewDateKey,
      weekNumber: week,
      phase: currentPlanWeek?.phase || "BASE",
      training: baseReviewSession,
      nutritionTargets,
      decisionMode: "progression_ready",
      provenanceSummary: "Original planned session.",
    });
    const finalReviewRecord = buildPlanDayRecord({
      dateKey: weekOutcome.reviewDateKey,
      weekNumber: week,
      phase: currentPlanWeek?.phase || "BASE",
      training: weekOutcome.reviewSession,
      nutritionTargets,
      decisionMode: (event.painFlare || event.travel || event.scheduleChange) ? "reduced_load" : "progression_ready",
      provenanceSummary: acceptedCoachAction ? "Coach-adjusted session." : "Current planned session.",
    });
    let prescribedHistory = createPrescribedDayHistoryEntry({
      plannedDayRecord: baseReviewRecord,
      capturedAt: new Date(`${weekOutcome.reviewDateKey}T09:00:00`).getTime(),
      reason: "daily_decision_capture",
    });
    const materiallyChanged = JSON.stringify(baseReviewRecord?.resolved?.training || null) !== JSON.stringify(finalReviewRecord?.resolved?.training || null);
    if (materiallyChanged) {
      prescribedHistory = upsertPrescribedDayHistoryEntry({
        dateKey: weekOutcome.reviewDateKey,
        existingEntry: prescribedHistory,
        plannedDayRecord: finalReviewRecord,
        capturedAt: new Date(`${weekOutcome.reviewDateKey}T11:00:00`).getTime(),
        reason: "same_day_adjustment",
      }).nextEntry;
    }

    const dayReview = buildDayReview({
      dateKey: weekOutcome.reviewDateKey,
      logs: weekOutcome.logs,
      dailyCheckins: weekOutcome.dailyCheckins,
      nutritionActualLogs: weekOutcome.nutritionActualLogs,
      resolvePrescribedHistory: () => prescribedHistory,
      getCurrentPrescribedDayRevision,
      getCurrentPrescribedDayRecord,
    });

    const currentRecord = createPersistedPlanWeekRecord({
      planWeek: currentPlanWeek,
      weekKey: String(week),
      capturedAt: new Date(`${weekDateKey}T18:00:00`).getTime(),
      weeklyCheckin: weekOutcome.weeklyCheckin,
      commitment: PLAN_WEEK_RECORD_COMMITMENT.committed,
    });
    if (currentRecord) state.planWeekRecords[String(week)] = currentRecord;
    const weekReview = currentRecord ? buildPersistedPlanWeekReview({
      planWeekRecord: currentRecord,
      logs: weekOutcome.logs,
      weeklyCheckins: { [String(week)]: weekOutcome.weeklyCheckin },
      currentWeek: week,
    }) : null;

    const metricsModel = buildMetricsBaselinesModel({
      athleteProfile,
      personalization: weekPersonalization,
      logs: {
        ...state.logs,
        ...weekOutcome.logs,
      },
      bodyweights: state.bodyweights,
    });

    const goalManagementEval = evaluateGoalManagement({
      state: {
        ...state,
        personalization: weekPersonalization,
      },
      event,
      week,
      failures: [],
      checks: [],
    });
    state = goalManagementEval.nextState;
    goalManagementEval.failures.forEach((failure) => failures.push({
      ...failure,
      personaId: personaLabel,
    }));
    goalManagementEval.checks.forEach((check) => checks.push(check));

    const coachHistory = buildCoachActionHistoryModel({
      coachActions: effectiveCoachActions,
    });

    const mainChecks = [
      createCheckRecord({
        id: `plan_generation_week_${week}`,
        week,
        passed: Boolean(currentPlanWeek?.id && countPlannedSessions(currentPlanWeek?.sessionsByDay || {}) > 0),
        clusterId: "plan_degradation",
        message: "The deterministic planner should produce a readable current week.",
        stepRef: `week ${week} > program > current week`,
        evidence: { weekLabel: currentPlanWeek?.label, plannedSessionCount: countPlannedSessions(currentPlanWeek?.sessionsByDay || {}) },
      }),
      createCheckRecord({
        id: `today_useful_week_${week}`,
        week,
        passed: Boolean(todayPlan?.label && todayPlan?.reason),
        clusterId: "plan_degradation",
        message: "Today / This week should explain what today is and why it matters.",
        stepRef: `week ${week} > coach > today / this week`,
        evidence: todayPlan,
      }),
      createCheckRecord({
        id: `log_useful_week_${week}`,
        week,
        passed: Boolean(logDraft?.prescribedLabel || logDraft?.strength?.hasPrescribedStructure || logDraft?.run?.enabled),
        clusterId: "plan_degradation",
        message: "The log draft should stay pre-populated enough to be worth opening.",
        stepRef: `week ${week} > log`,
        evidence: { prescribedLabel: logDraft?.prescribedLabel, strength: logDraft?.strength, run: logDraft?.run },
      }),
      createCheckRecord({
        id: `review_story_week_${week}`,
        week,
        passed: Boolean(dayReview?.story?.plannedSummary && dayReview?.story?.actualSummary && dayReview?.story?.mainLesson && dayReview?.story?.nextEffect),
        clusterId: "audit_confidence_erosion",
        message: "Day review should foreground planned, actual, lesson, and next effect.",
        stepRef: `week ${week} > review > day`,
        evidence: dayReview?.story || null,
      }),
      createCheckRecord({
        id: `week_story_week_${week}`,
        week,
        passed: Boolean(weekReview?.story?.plannedSummary && weekReview?.story?.actualSummary && weekReview?.story?.nextEffect),
        clusterId: "audit_confidence_erosion",
        message: "Week review should emphasize what was planned, what happened, and what changes next.",
        stepRef: `week ${week} > review > week history`,
        evidence: weekReview?.story || null,
      }),
      createCheckRecord({
        id: `coach_actions_week_${week}`,
        week,
        passed: coachQuickActions.length >= 4,
        clusterId: "coach_ambiguity",
        message: "Change my plan should offer a small set of meaningfully different actions.",
        stepRef: `week ${week} > coach > change my plan`,
        evidence: coachQuickActions.map((action) => action.label),
      }),
      createCheckRecord({
        id: `coach_ai_boundary_week_${week}`,
        week,
        passed: !(event.coachUsage === "ask_anything") || (askAnythingState.advisoryOnly && askAnythingState.canMutatePlan === false && !acceptedCoachAction),
        clusterId: "coach_ambiguity",
        message: "Ask anything must stay advisory-only and never silently mutate plan state.",
        stepRef: `week ${week} > coach > ask anything`,
        evidence: { askAnythingState, acceptedCoachAction: acceptedCoachAction?.type || "" },
      }),
      createCheckRecord({
        id: `baseline_provenance_week_${week}`,
        week,
        passed: toArray(metricsModel?.cards || []).every((card) => card?.provenanceSummary),
        clusterId: "baseline_timing_problems",
        message: "Baseline cards should show why they matter and where the number came from.",
        stepRef: `week ${week} > settings > baselines`,
        evidence: metricsModel?.cards || [],
      }),
      createCheckRecord({
        id: `future_horizon_week_${week}`,
        week,
        passed: toArray(rollingHorizon || []).length >= LAB_VISIBLE_HORIZON_WEEKS,
        clusterId: "long_horizon_time_confusion",
        message: "Program should keep a clear next-3-month projection window without collapsing long goals into short deadlines.",
        stepRef: `week ${week} > program > future weeks`,
        evidence: { horizonCount: toArray(rollingHorizon || []).length },
      }),
    ];

    if (event.painFlare || event.travel || event.scheduleChange || event.nutritionDrift || Number(event.adherencePct || 0) < 0.6) {
      mainChecks.push(createCheckRecord({
        id: `adaptation_honesty_week_${week}`,
        week,
        passed: Boolean(effectiveComposer?.changeSummary?.headline || weekReview?.story?.nextEffect),
        clusterId: "plan_degradation",
        message: "Stressful weeks should produce an honest adaptation signal instead of pretending the week stayed unchanged.",
        stepRef: `week ${week} > planner > adaptation`,
        evidence: { changeSummary: effectiveComposer?.changeSummary, nextEffect: weekReview?.story?.nextEffect || "" },
      }));
    }

    mainChecks.forEach((check) => {
      checks.push(check);
      if (!check.passed && check.clusterId) {
        failures.push(createFailureRecord({
          personaId: personaLabel,
          week,
          clusterId: check.clusterId,
          message: check.detail,
          severity: check.severity,
          subsystem: check.subsystem,
          stepRef: check.stepRef,
          evidence: check.evidence,
        }));
      }
    });

    if (hasLaneTheater(goalManagementEval?.nextState?.latestGoalSettingsView?.tradeoffStatement || "")) {
      failures.push(createFailureRecord({
        personaId: personaLabel,
        week,
        clusterId: "ugly_confusing_copy",
        message: "Goal tradeoff copy still leaked lane-heavy terminology into a user-facing summary.",
        stepRef: `week ${week} > settings > goals`,
        evidence: goalManagementEval?.nextState?.latestGoalSettingsView?.tradeoffStatement || "",
      }));
    }
    if (hasRevisionHeroCopy(dayReview?.auditSummary || "")) {
      failures.push(createFailureRecord({
        personaId: personaLabel,
        week,
        clusterId: "audit_confidence_erosion",
        message: "Review copy still foregrounded revision mechanics instead of the training story.",
        stepRef: `week ${week} > review > day`,
        evidence: dayReview?.auditSummary || "",
      }));
    }
    if (/swim/i.test(rawGoalTexts.join(" ")) && !/swimming/i.test(String(state.athleteProfile?.primaryGoal?.resolvedGoal?.primaryDomain || ""))) {
      failures.push(createFailureRecord({
        personaId: personaLabel,
        week,
        clusterId: "sport_domain_mismatch",
        message: "Swim intent did not stay attached to a swim-capable domain adapter.",
        stepRef: `week ${week} > intake > interpretation`,
        evidence: { primaryDomain: state.athleteProfile?.primaryGoal?.resolvedGoal?.primaryDomain || "" },
      }));
    }

    const nextBodyweight = buildWeekBodyweight({
      currentBodyweight: state.currentBodyweight || state.personalization?.profile?.bodyweight || 0,
      event,
    });
    if (Number.isFinite(nextBodyweight) && nextBodyweight > 0) {
      state.bodyweights = [
        ...state.bodyweights,
        { date: addDaysToDateKey(weekDateKey, 6), w: nextBodyweight },
      ];
      state.currentBodyweight = nextBodyweight;
      state.personalization.profile.weight = nextBodyweight;
      state.personalization.profile.bodyweight = nextBodyweight;
    }

    const finalAthleteProfile = deriveCanonicalAthleteState({
      goals: state.goals,
      personalization: state.personalization,
      profileDefaults: { name: persona.name },
    });

    state = {
      ...state,
      personalization: state.personalization,
      athleteProfile: finalAthleteProfile,
      logs: {
        ...state.logs,
        ...weekOutcome.logs,
      },
      dailyCheckins: {
        ...state.dailyCheckins,
        ...weekOutcome.dailyCheckins,
      },
      nutritionActualLogs: {
        ...state.nutritionActualLogs,
        ...weekOutcome.nutritionActualLogs,
      },
      weeklyCheckins: {
        ...state.weeklyCheckins,
        [String(week)]: weekOutcome.weeklyCheckin,
      },
      coachActions: effectiveCoachActions,
      latestGoalSettingsView: state.latestGoalSettingsView || buildGoalSettingsViewModel({
        goals: state.goals,
        personalization: state.personalization,
        now: new Date(`${weekDateKey}T12:00:00`),
      }),
    };

    timeline.push({
      week,
      label: currentPlanWeek?.label || `Week ${week}`,
      event: event.label,
      plannedSessionCount: weekOutcome.plannedSessionCount,
      completedCount: weekOutcome.completedCount,
      loggedCompletedCount: weekOutcome.loggedCompletedCount,
      reviewClassification: dayReview?.story?.classificationLabel || "",
      weekClassification: weekReview?.story?.classificationLabel || "",
      coachUsage: event.coachUsage,
      goalOrder: toArray(state.latestGoalSettingsView?.currentGoals || []).map((card) => `${card.priorityLabel || ""}: ${card.summary || ""}`),
      visibleHorizonCount: toArray(rollingHorizon || []).length,
      actionHistoryCount: coachHistory.length,
      weeklyGroceryLine: realWorldNutrition?.summary || "",
    });
  }

  const categoryScores = computeCategoryScores(failures);
  const overallScore = averageCategoryScores(categoryScores);
  const severeBlockers = failures.filter((failure) => failure.severity === "severe");
  const mediumIssues = failures.filter((failure) => failure.severity === "medium");
  const overallPass = overallScore >= 85 && severeBlockers.length === 0 && mediumIssues.length === 0;
  const checksPassed = checks.filter((check) => check.passed).length;
  const supportTier = buildSupportTierModel({
    goals: state.goals,
    domainAdapterId: state.athleteProfile?.primaryGoal?.resolvedGoal?.primaryDomain || state.athleteProfile?.goalCapabilityStack?.primary?.primaryDomain || "",
    goalCapabilityStack: state.athleteProfile?.goalCapabilityStack || null,
  });

  return {
    personaId: persona.id,
    name: persona.name,
    supportTierExpected: persona.supportTierExpectation,
    supportTierActual: supportTier?.id || "",
    supportHeadline: supportTier?.headline || "",
    simulationWeeks: weeks,
    checks,
    checksPassed,
    checksFailed: checks.length - checksPassed,
    failures,
    severeBlockers,
    mediumIssues,
    categoryScores,
    overallScore,
    score: Number((overallScore / 100).toFixed(2)),
    overallPass,
    passed: overallPass,
    timeline,
    browserProbes: cloneValue(BROWSER_PROBES),
    recommendedFixClusters: [...new Set(failures.map((failure) => failure.recommendedFixCluster))],
    snapshots: {
      resolvedGoalCount: state.goals.length,
      finalGoalOrder: toArray(state.latestGoalSettingsView?.currentGoals || []).map((card) => card.summary || ""),
      archivedGoalCount: toArray(state.latestGoalSettingsView?.archivedGoals || []).length,
      finalBodyweight: state.currentBodyweight || null,
      actionHistoryCount: state.coachActions.length,
    },
  };
};

export const runSyntheticAthleteLab = ({
  personas = null,
  weeks = LAB_SIMULATION_WEEKS,
  includeArchetypeMatrix = true,
  catalogMode = SYNTHETIC_ATHLETE_CATALOG_MODES.focus,
  targetPersonaCount = 100,
} = {}) => {
  const selectedPersonas = selectSyntheticAthletePersonas({
    personas,
    catalogMode,
    targetPersonaCount,
  });
  const personaResults = selectedPersonas.map((persona) => runPersona(persona, { weeks }));
  const clusterTaxonomy = buildClusterTaxonomy(personaResults);
  const catalogCoverage = buildPersonaCatalogCoverage(selectedPersonas);
  const subsystemHeatmap = {};
  const clusters = Object.values(clusterTaxonomy)
    .filter((cluster) => cluster.count > 0)
    .sort((left, right) => right.count - left.count || left.clusterId.localeCompare(right.clusterId));

  personaResults.forEach((result) => {
    toArray(result.failures || []).forEach((failure) => {
      subsystemHeatmap[failure.subsystem] = (subsystemHeatmap[failure.subsystem] || 0) + 1;
    });
  });

  const themeSignatures = BRAND_THEME_IDS.map((themeId) => ({
    id: themeId,
    dark: `${buildBrandThemeState({ appearance: { theme: themeId, mode: "Dark" } }).cssVars["--bg"]}|${buildBrandThemeState({ appearance: { theme: themeId, mode: "Dark" } }).cssVars["--brand-accent"]}`,
    light: `${buildBrandThemeState({ appearance: { theme: themeId, mode: "Light" } }).cssVars["--bg"]}|${buildBrandThemeState({ appearance: { theme: themeId, mode: "Light" } }).cssVars["--brand-accent"]}`,
  }));

  const releaseGateMatrix = includeArchetypeMatrix
    ? SYNTHETIC_ATHLETE_RELEASE_GATE_PERSONA_IDS
      .map((personaId) => SYNTHETIC_ATHLETE_PERSONAS.find((persona) => persona.id === personaId))
      .filter(Boolean)
      .map((persona) => runArchetypeQuickProbe(persona))
    : [];
  const averageScore = Number((personaResults.reduce((sum, result) => sum + Number(result.overallScore || 0), 0) / Math.max(1, personaResults.length)).toFixed(1));
  const severeBlockerCount = personaResults.reduce((sum, result) => sum + toArray(result.severeBlockers || []).length, 0);
  const mediumIssueCount = personaResults.reduce((sum, result) => sum + toArray(result.mediumIssues || []).length, 0);
  const overallPass = personaResults.every((result) => result.overallPass);

  return {
    summary: {
      catalogMode,
      personaCount: personaResults.length,
      simulationWeeks: weeks,
      passedCount: personaResults.filter((result) => result.overallPass).length,
      failedCount: personaResults.filter((result) => !result.overallPass).length,
      averageScore,
      severeBlockerCount,
      mediumIssueCount,
      overallPass,
      releaseGateCandidate: overallPass && severeBlockerCount === 0 && releaseGateMatrix.every((entry) => entry.verdict === "credible"),
      catalogCoverage,
    },
    globalChecks: {
      transientCloudStatus: classifyStorageError(new Error("fetch_timeout")),
      themeCount: BRAND_THEME_IDS.length,
      distinctDarkThemes: new Set(themeSignatures.map((entry) => entry.dark)).size,
      distinctLightThemes: new Set(themeSignatures.map((entry) => entry.light)).size,
      browserProbeCount: BROWSER_PROBES.length,
    },
    personaResults,
    releaseGateMatrix,
    browserProbes: cloneValue(BROWSER_PROBES),
    catalogCoverage,
    clusterTaxonomy,
    clusters,
    failsForWho: clusters.slice(0, 10).map((cluster) => ({
      clusterId: cluster.clusterId,
      subsystem: cluster.subsystem,
      count: cluster.count,
      personas: cluster.personas.slice(0, 12),
      stepRefs: cluster.stepRefs.slice(0, 5),
    })),
    subsystemHeatmap,
  };
};
