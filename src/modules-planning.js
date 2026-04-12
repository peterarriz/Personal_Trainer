import {
  deriveCanonicalAthleteState as deriveCanonicalGoalProfileState,
  daysUntil,
  getActiveTimeBoundGoal,
  getGoalBuckets,
  inferGoalType,
  normalizeGoalObject,
  normalizeGoals,
} from "./services/canonical-athlete-service.js";
import {
  buildLegacyProvenanceAdjustmentView,
  buildProvenanceEvent,
  buildStructuredProvenance,
  PROVENANCE_ACTORS,
} from "./services/provenance-service.js";
import {
  buildCanonicalSupplementPlan,
  buildRecoveryPrescription,
  normalizeActualRecoveryLog,
  deriveSupplementActual,
} from "./services/recovery-supplement-service.js";
import { assessGoalFeasibility } from "./services/goal-feasibility-service.js";
import {
  deriveActiveIssueContextFromPersonalization,
  deriveTrainingContextFromPersonalization,
  TRAINING_EQUIPMENT_VALUES,
  TRAINING_INTENSITY_VALUES,
  TRAINING_SESSION_DURATION_VALUES,
} from "./services/training-context-service.js";
import { dedupeStrings } from "./utils/collection-utils.js";

export { daysUntil, deriveCanonicalGoalProfileState, getActiveTimeBoundGoal, getGoalBuckets, inferGoalType, normalizeGoalObject, normalizeGoals };

export const DEFAULT_PLANNING_HORIZON_WEEKS = 12;
export const RECOVERY_BLOCK_WEEKS = 2;
export const PROGRAM_BLOCK_MODEL_VERSION = 1;

const clonePlainValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const normalizeTrainingSignature = (day = {}) => JSON.stringify({
  type: day?.type || "",
  label: day?.label || "",
  runType: day?.run?.t || "",
  runDuration: day?.run?.d || "",
  strSess: day?.strSess || "",
  strengthTrack: day?.strengthTrack || "",
  strengthDuration: day?.strengthDuration || "",
  nutri: day?.nutri || "",
  minDay: Boolean(day?.minDay),
  readinessState: day?.readinessState || "",
});

const buildPlanDaySummary = (drivers = [], modifiedFromBase = false) => {
  const uniqueDrivers = dedupeStrings(drivers).slice(0, 3);
  if (!uniqueDrivers.length) {
    return modifiedFromBase
      ? "Today's recommendation reflects deterministic plan adjustments."
      : "Today's recommendation matches the planned day.";
  }
  if (!modifiedFromBase) {
    return `Today's recommendation reflects ${uniqueDrivers.join(", ")}.`;
  }
  return `Today's recommendation was adjusted from the base plan by ${uniqueDrivers.join(", ")}.`;
};

const clampNumber = (value, min, max) => Math.max(min, Math.min(max, Number.isFinite(Number(value)) ? Number(value) : min));
const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const isRunSessionType = (value = "") => ["run+strength", "easy-run", "hard-run", "long-run"].includes(String(value || "").toLowerCase());
const resolvePlannedSessionKind = (plannedSession = null) => {
  const type = String(plannedSession?.type || "").toLowerCase();
  if (!type) return "";
  if (type === "rest" || type === "recovery") return "recovery";
  if (type === "run+strength") return "cardio";
  if (/strength/.test(type)) return "strength";
  if (/run|conditioning|otf/.test(type)) return "cardio";
  return "";
};
const buildConditioningSession = ({
  label = "Conditioning",
  detail = "20-30 min zone-2 bike, rower, incline walk, or circuit",
  nutri = "easyRun",
  lowImpact = false,
} = {}) => ({
  type: "conditioning",
  label,
  nutri,
  fallback: detail,
  intensityGuidance: lowImpact ? "easy aerobic only" : "controlled aerobic conditioning",
  environmentNote: lowImpact ? "Use any low-impact aerobic setup available." : "",
});

const resolveFriendlyStrengthSlotLabel = (slot = "") => {
  const safeSlot = String(slot || "").trim().toUpperCase();
  return safeSlot ? `Full-Body Strength ${safeSlot}` : "Full-Body Strength";
};

const resolveFriendlySessionLabel = (label = "", context = {}) => {
  const safeLabel = sanitizeText(label, 120);
  const safeSlot = String(context?.strSess || "").trim().toUpperCase();
  if (!safeLabel) return safeSlot ? resolveFriendlyStrengthSlotLabel(safeSlot) : "Planned session";
  if (/^strength ([ab])$/i.test(safeLabel)) return resolveFriendlyStrengthSlotLabel(safeLabel.match(/^strength ([ab])$/i)?.[1]);
  if (/^strength priority ([ab])$/i.test(safeLabel)) return resolveFriendlyStrengthSlotLabel(safeLabel.match(/^strength priority ([ab])$/i)?.[1]);
  if (/^metabolic strength ([ab])$/i.test(safeLabel)) return `Strength Circuit ${String(safeLabel.match(/^metabolic strength ([ab])$/i)?.[1] || "").toUpperCase()}`;
  if (/^upper push\/pull strength$/i.test(safeLabel)) return "Upper-Body Push/Pull Strength";
  if (/^quality run \+ strength$/i.test(safeLabel)) return "Quality Run + Strength Finish";
  if (/^run \+ strength$/i.test(safeLabel)) return "Easy Run + Strength Finish";
  if (/^conditioning \/ otf$/i.test(safeLabel)) return "Conditioning Intervals";
  if (/^conditioning \(low-friction\)$/i.test(safeLabel)) return "Low-Friction Conditioning";
  if (/^supportive conditioning run$/i.test(safeLabel)) return "Easy Conditioning Run";
  if (/^supportive run\/walk$/i.test(safeLabel)) return "Easy Run/Walk";
  if (/^strength focus$/i.test(safeLabel)) return "Full-Body Strength Focus";
  if (/^short version strength$/i.test(safeLabel)) return "Short Full-Body Strength A";
  if (/^short version strength ([ab])$/i.test(safeLabel)) return `Short Full-Body Strength ${String(safeLabel.match(/^short version strength ([ab])$/i)?.[1] || "").toUpperCase()}`;
  return safeLabel;
};

const normalizeSessionEntryLabel = (session = null) => {
  if (!session || typeof session !== "object") return session;
  return {
    ...session,
    label: resolveFriendlySessionLabel(session?.label || "", session),
  };
};

const resolveResolvedGoalDescriptor = ({ goal = null, resolvedGoal = null, fallbackCategory = "" } = {}) => {
  const metricKey = String(resolvedGoal?.primaryMetric?.key || "").toLowerCase();
  const summary = sanitizeText(resolvedGoal?.summary || goal?.name || "", 160).toLowerCase();
  const category = String(resolvedGoal?.planningCategory || goal?.category || fallbackCategory || "").toLowerCase();
  const goalFamily = String(resolvedGoal?.goalFamily || goal?.goalFamily || "").toLowerCase();
  if (goalFamily === "athletic_power" || /\b(dunk|vertical|jump higher|jumping higher|explosive)\b/.test(summary)) return "athletic power";
  if (/bench|press/.test(metricKey) || /\bbench\b/.test(summary)) return "pressing strength";
  if (/squat/.test(metricKey) || /\bsquat\b/.test(summary)) return "squat strength";
  if (/deadlift/.test(metricKey) || /\bdeadlift\b/.test(summary)) return "pulling strength";
  if (/half_marathon/.test(metricKey) || /half marathon/.test(summary)) return "half-marathon endurance";
  if (/marathon/.test(metricKey) || /\bmarathon\b/.test(summary)) return "marathon endurance";
  if (/\b10k\b/.test(metricKey) || /\b10k\b/.test(summary)) return "10K pace support";
  if (/\b5k\b/.test(metricKey) || /\b5k\b/.test(summary)) return "5K pace support";
  if (/waist|progress_photos|body_fat|bodyweight/.test(metricKey) || category === "body_comp") return "body-composition progress";
  if (category === "strength") return "strength progression";
  if (category === "running") return "race-specific fitness";
  if (category === "body_comp") return "body-composition progress";
  return "primary-goal progress";
};

const resolveEmphasisLabel = ({
  architecture = "hybrid_performance",
  category = "",
  role = "dominant",
  goal = null,
  resolvedGoal = null,
} = {}) => {
  const descriptor = resolveResolvedGoalDescriptor({ goal, resolvedGoal, fallbackCategory: category });
  if (role === "secondary") {
    if (category === "strength") return /upper-body/i.test(sanitizeText(goal?.name || resolvedGoal?.summary || "", 120)) ? "Upper-body maintenance" : "Strength maintenance";
    if (category === "running") return "Conditioning maintenance";
    if (category === "body_comp") return "Body-composition maintenance";
    return "Secondary maintenance";
  }
  if (architecture === "event_prep_upper_body_maintenance") return "Race prep";
  if (architecture === "race_prep_dominant") return descriptor === "race-specific fitness" ? "Race-specific running" : descriptor === "half-marathon endurance" ? "Half-marathon race prep" : "Run performance";
  if (architecture === "strength_dominant") return descriptor === "athletic power" ? "Athletic-power progression" : descriptor === "pressing strength" ? "Pressing strength progression" : descriptor === "squat strength" ? "Squat strength progression" : descriptor === "pulling strength" ? "Pulling strength progression" : "Strength progression";
  if (architecture === "body_comp_conditioning") return "Fat-loss momentum";
  if (architecture === "maintenance_rebuild") return "Hybrid rebuild";
  if (category === "running") return "Run performance";
  if (category === "strength") return "Strength progression";
  if (category === "body_comp") return "Body-composition progress";
  return "Hybrid performance";
};

const resolveWeeklyFocusLabel = ({
  architecture = "hybrid_performance",
  dominantCategory = "",
  secondaryCategory = "",
  primaryGoal = null,
  primaryResolvedGoal = null,
} = {}) => {
  const descriptor = resolveResolvedGoalDescriptor({ goal: primaryGoal, resolvedGoal: primaryResolvedGoal, fallbackCategory: dominantCategory });
  if (architecture === "event_prep_upper_body_maintenance") return "Build race-specific fitness while keeping upper-body strength alive";
  if (architecture === "race_prep_dominant") return descriptor === "half-marathon endurance" ? "Build half-marathon pace and endurance" : "Build race-specific endurance and quality";
  if (architecture === "strength_dominant") return descriptor === "athletic power" ? "Build athletic power with repeatable lower-body work" : descriptor === "pressing strength" ? "Build pressing strength with repeatable full-body work" : "Build primary strength with repeatable full-body work";
  if (architecture === "body_comp_conditioning") return "Drive fat-loss momentum while protecting strength";
  if (architecture === "maintenance_rebuild") return "Rebuild repeatable run and strength rhythm";
  if (dominantCategory === "running") return secondaryCategory === "strength" ? "Build run fitness while keeping strength in the week" : "Build run fitness with repeatable support work";
  if (dominantCategory === "strength") return secondaryCategory === "running" ? "Build strength while keeping conditioning supportive" : "Build strength with repeatable support work";
  if (dominantCategory === "body_comp") return "Build sustainable body-composition momentum";
  return "Keep the primary lane moving without losing the secondary one";
};

const buildSessionsByDayFromTemplate = (template = {}) => {
  const restDay = { type: "rest", label: "Active Recovery", nutri: "rest", isRecoverySlot: true };
  return {
    1: template?.mon ? normalizeSessionEntryLabel({ type: "easy-run", label: `${template.mon.t || "Easy"} Run`, run: clonePlainValue(template.mon), nutri: template?.nutri || "easyRun" }) : null,
    2: null,
    3: template?.str ? normalizeSessionEntryLabel({ type: "strength+prehab", label: `Strength ${template.str}`, strSess: template.str, nutri: "strength" }) : null,
    4: template?.thu ? normalizeSessionEntryLabel({ type: "hard-run", label: `${template.thu.t || "Quality"} Run`, run: clonePlainValue(template.thu), nutri: template?.nutri || "hardRun" }) : null,
    5: template?.fri ? normalizeSessionEntryLabel({ type: "easy-run", label: `${template.fri.t || "Easy"} Run`, run: clonePlainValue(template.fri), nutri: "easyRun" }) : null,
    6: template?.sat ? normalizeSessionEntryLabel({ type: "long-run", label: `${template.sat.t || "Long"} Run`, run: clonePlainValue(template.sat), nutri: "longRun" }) : null,
    0: restDay,
  };
};

const normalizeRunSignature = (run = null) => JSON.stringify({
  t: run?.t || "",
  d: run?.d || "",
});

const invertStrengthSession = (value = "") => value === "A" ? "B" : value === "B" ? "A" : value;

const resolveProjectedRunTemplateSlot = ({ dayKey = null, session = null, referenceTemplate = {} } = {}) => {
  const sessionSignature = normalizeRunSignature(session?.run || null);
  const templateSlots = [
    ["mon", referenceTemplate?.mon || null],
    ["thu", referenceTemplate?.thu || null],
    ["fri", referenceTemplate?.fri || null],
    ["sat", referenceTemplate?.sat || null],
  ];
  const matchedSlot = templateSlots.find(([, templateRun]) => normalizeRunSignature(templateRun || null) === sessionSignature);
  if (matchedSlot?.[0]) return matchedSlot[0];
  return null;
};

const projectSessionsByDayFromCanonicalPattern = ({
  template = {},
  referenceTemplate = {},
  sessionsByDay = null,
} = {}) => {
  if (!sessionsByDay || !Object.keys(sessionsByDay || {}).length) {
    return buildSessionsByDayFromTemplate(template);
  }

  const projected = Object.fromEntries(
    Object.entries(sessionsByDay || {}).map(([dayKeyRaw, session]) => {
      if (!session) return [dayKeyRaw, null];
      const dayKey = Number(dayKeyRaw);
      const nextSession = clonePlainValue(session);
      const runSlot = nextSession?.run
        ? resolveProjectedRunTemplateSlot({ dayKey, session: nextSession, referenceTemplate })
        : null;
      const projectedRun = runSlot ? clonePlainValue(template?.[runSlot] || null) : null;

      if (projectedRun) {
        nextSession.run = projectedRun;
        const currentLabel = String(nextSession?.label || "");
        const shouldRewriteRunLabel = ["hard-run", "easy-run", "long-run"].includes(String(nextSession?.type || ""))
          && /run$/i.test(currentLabel);
        if (shouldRewriteRunLabel) {
          nextSession.label = `${projectedRun.t || (nextSession.type === "long-run" ? "Long" : nextSession.type === "hard-run" ? "Quality" : "Easy")} Run`;
        }
      }

      const referenceStrength = String(referenceTemplate?.str || "");
      const templateStrength = String(template?.str || "");
      if (nextSession?.strSess && referenceStrength && templateStrength) {
        const alternateReference = invertStrengthSession(referenceStrength);
        if (String(nextSession.strSess) === referenceStrength) nextSession.strSess = templateStrength;
        else if (alternateReference && String(nextSession.strSess) === alternateReference) nextSession.strSess = invertStrengthSession(templateStrength) || nextSession.strSess;
      }

      return [dayKeyRaw, normalizeSessionEntryLabel(nextSession)];
    })
  );

  return projected;
};

const resolveProgramBlockWindow = ({
  currentWeek = 1,
  weekTemplate = {},
  weekTemplates = [],
} = {}) => {
  const phase = weekTemplate?.phase || weekTemplates?.[Math.max(0, currentWeek - 1)]?.phase || "";
  if (!phase || !Array.isArray(weekTemplates) || !weekTemplates.length) {
    return {
      phase,
      startWeek: currentWeek,
      endWeek: currentWeek,
      weekIndexInBlock: 1,
      totalWeeks: 1,
      weeksRemaining: 0,
    };
  }

  const safeIndex = Math.max(0, Math.min(currentWeek - 1, weekTemplates.length - 1));
  let startIndex = safeIndex;
  let endIndex = safeIndex;

  while (startIndex > 0 && weekTemplates[startIndex - 1]?.phase === phase) startIndex -= 1;
  while (endIndex < weekTemplates.length - 1 && weekTemplates[endIndex + 1]?.phase === phase) endIndex += 1;

  return {
    phase,
    startWeek: startIndex + 1,
    endWeek: endIndex + 1,
    weekIndexInBlock: (safeIndex - startIndex) + 1,
    totalWeeks: (endIndex - startIndex) + 1,
    weeksRemaining: Math.max(0, endIndex - safeIndex),
  };
};

const buildProgramBlockCompatibilityIntent = (programBlock = null) => (
  !programBlock ? null : {
    prioritized: programBlock?.goalAllocation?.prioritized || programBlock?.dominantEmphasis?.label || "Consistency and execution",
    maintained: clonePlainValue(programBlock?.goalAllocation?.maintained || [programBlock?.secondaryEmphasis?.label || "general fitness"].filter(Boolean)),
    minimized: programBlock?.goalAllocation?.minimized || "non-primary volume",
    narrative: programBlock?.summary || "",
  }
);

const buildFallbackProgramBlockFromCompatibilityIntent = ({
  weekNumber = 1,
  weekTemplate = {},
  weekTemplates = [],
  goals = [],
  architecture = "hybrid_performance",
  blockIntent = null,
  constraints = [],
} = {}) => {
  if (!blockIntent) return null;
  const window = resolveProgramBlockWindow({ currentWeek: weekNumber, weekTemplate, weekTemplates });
  const prioritized = blockIntent?.prioritized || "Consistency and execution";
  const maintained = Array.isArray(blockIntent?.maintained) && blockIntent.maintained.length
    ? blockIntent.maintained
    : ["general fitness"];
  return {
    version: PROGRAM_BLOCK_MODEL_VERSION,
    id: `program_block_${window.phase || "current"}_${window.startWeek}_${window.endWeek}`,
    label: `${window.phase || "Current"} · ${prioritized}`,
    architecture,
    phase: window.phase || "",
    window,
    dominantEmphasis: {
      category: goals?.[0]?.category || "hybrid",
      label: prioritized,
      objective: blockIntent?.narrative || `${prioritized} is the top block priority.`,
      role: "dominant",
    },
    secondaryEmphasis: {
      category: "maintenance",
      label: maintained[0] || "general fitness",
      objective: `${maintained[0] || "General fitness"} stays in maintenance range while the primary lane leads.`,
      role: "secondary",
    },
    recoveryPosture: {
      level: "balanced",
      summary: "Recovery is managed to keep the block repeatable.",
    },
    nutritionPosture: {
      mode: "maintenance_support",
      summary: "Nutrition supports repeatable training and recovery.",
    },
    successCriteria: [
      `Keep ${prioritized.toLowerCase()} moving without breaking consistency.`,
    ],
    constraints: clonePlainValue(constraints || []),
    tradeoffs: [
      blockIntent?.minimized ? `${blockIntent.minimized} is intentionally limited this block.` : "",
    ].filter(Boolean),
    goalAllocation: {
      prioritized,
      maintained,
      minimized: blockIntent?.minimized || "non-primary volume",
    },
    drivers: dedupeStrings([prioritized, ...(maintained || [])]),
    summary: blockIntent?.narrative || `${prioritized} is prioritized while secondary work stays supportive.`,
  };
};

const getResolvedGoalPayload = (goal = {}) => goal?.resolvedGoal || null;

const buildResolvedGoalBlockContext = ({
  goals = [],
  programContext = {},
} = {}) => {
  const activeGoals = Array.isArray(goals) ? goals.filter((goal) => goal?.active !== false) : [];
  const primaryGoal = activeGoals[0] || null;
  const secondaryGoals = activeGoals.slice(1, 3);
  const resolvedPrimaryGoal = getResolvedGoalPayload(primaryGoal);
  const resolvedSecondaryGoals = secondaryGoals.map((goal) => getResolvedGoalPayload(goal)).filter(Boolean);
  const resolvedGoals = activeGoals.map((goal) => getResolvedGoalPayload(goal)).filter(Boolean);
  const proxyMetricLabels = dedupeStrings(resolvedGoals.flatMap((goal) => (goal?.proxyMetrics || []).map((metric) => sanitizeText(metric?.label || "", 80)))).slice(0, 4);
  const primaryMetricLabel = sanitizeText(resolvedPrimaryGoal?.primaryMetric?.label || "", 80);
  const tradeoffs = dedupeStrings([
    ...activeGoals.flatMap((goal) => goal?.tradeoffs || []),
    ...resolvedGoals.flatMap((goal) => goal?.tradeoffs || []),
    ...(programContext?.goalFeasibility?.conflictFlags || []).map((flag) => sanitizeText(flag?.summary || "", 180)),
  ]).slice(0, 5);
  const feasibilityByGoalId = new Map((programContext?.goalFeasibility?.goalAssessments || []).map((item) => [item.goalId, item]));
  const primaryAssessment = resolvedPrimaryGoal ? feasibilityByGoalId.get(resolvedPrimaryGoal.id) || null : null;
  const sequencingSummary = sanitizeText(programContext?.goalFeasibility?.suggestedSequencing?.[0]?.summary || "", 220);
  const realisticByDateSummary = sanitizeText(programContext?.goalFeasibility?.realisticByTargetDate?.[0]?.summary || "", 220);
  const longerHorizonSummary = sanitizeText(programContext?.goalFeasibility?.longerHorizonNeeds?.[0]?.summary || "", 220);
  const maintainedLabels = secondaryGoals.map((goal) => goal?.name).filter(Boolean);
  const minimizedLabel = activeGoals.find((goal) => goal?.category === "injury_prevention")?.name || "non-primary volume";

  return {
    primaryGoal,
    secondaryGoals,
    resolvedPrimaryGoal,
    resolvedSecondaryGoals,
    resolvedGoals,
    primaryMetricLabel,
    proxyMetricLabels,
    tradeoffs,
    primaryAssessment,
    sequencingSummary,
    realisticByDateSummary,
    longerHorizonSummary,
    maintainedLabels,
    minimizedLabel,
  };
};

const goalLooksUpperBodyFocused = (goal = {}) => {
  const text = sanitizeText([
    goal?.name,
    goal?.resolvedGoal?.summary,
    goal?.resolvedGoal?.primaryMetric?.label,
    goal?.resolvedGoal?.primaryMetric?.key,
  ].filter(Boolean).join(" "), 240).toLowerCase();
  return /(bench|upper body|push|pull|press|chin|pull-up|pull up|row)/i.test(text);
};

export const buildProgramBlock = ({
  weekNumber = 1,
  weekTemplate = {},
  weekTemplates = [],
  goals = [],
  architecture = "hybrid_performance",
  constraints = [],
  drivers = [],
  unlockMessage = "",
  programContext = {},
} = {}) => {
  const { active } = getGoalBuckets(goals);
  const primary = active[0] || null;
  const secondaryGoals = active.filter((goal) => goal?.id !== primary?.id).slice(0, 2);
  const runningGoal = active.find((goal) => goal?.category === "running") || null;
  const strengthGoal = active.find((goal) => goal?.category === "strength") || null;
  const bodyCompGoal = active.find((goal) => goal?.category === "body_comp") || null;
  const window = resolveProgramBlockWindow({ currentWeek: weekNumber, weekTemplate, weekTemplates });
  const phase = window.phase || weekTemplate?.phase || "";
  const lowBandwidth = Boolean(programContext?.lowBandwidth);
  const bodyCompActive = Boolean(programContext?.bodyCompActive || bodyCompGoal);
  const resolvedContext = buildResolvedGoalBlockContext({
    goals: active,
    programContext,
  });
  const primaryResolvedGoal = resolvedContext.resolvedPrimaryGoal;
  const primaryFeasibility = resolvedContext.primaryAssessment;
  const primaryMetricLabel = resolvedContext.primaryMetricLabel;
  const proxyMetricLabels = resolvedContext.proxyMetricLabels;
  const feasibilityStatus = sanitizeText(programContext?.goalFeasibility?.realismStatus || "", 40).toLowerCase();

  const maintainedGoals = active
    .filter((goal) => goal?.id !== primary?.id && goal?.category !== "injury_prevention")
    .slice(0, 2)
    .map((goal) => goal?.name)
    .filter(Boolean);
  const minimizedGoal = active.find((goal) => goal?.category === "injury_prevention")?.name || "non-primary volume";
  const primaryMeasurabilityTier = primaryResolvedGoal?.measurabilityTier || primary?.measurabilityTier || "";
  const primaryTargetHorizonWeeks = primaryResolvedGoal?.targetHorizonWeeks || primary?.targetHorizonWeeks || null;
  const dominantMetricLine = primaryMetricLabel
    ? `${primaryMetricLabel} is the main success anchor for this block.`
    : proxyMetricLabels.length
    ? `${proxyMetricLabels.slice(0, 2).join(" and ")} are the working signals for block progress.`
    : "";
  const horizonLine = primaryTargetHorizonWeeks
    ? `${primaryTargetHorizonWeeks} week target horizon sets the pacing of this block.`
    : primaryMeasurabilityTier === "exploratory_fuzzy"
    ? "This block starts by proving a first 30-day win before pushing a narrower target."
    : "";
  const feasibilityLine = resolvedContext.realisticByDateSummary || resolvedContext.longerHorizonSummary || "";
  const sequencingLine = resolvedContext.sequencingSummary || "";

  let labelSuffix = "Hybrid performance";
  let dominantEmphasis = {
    category: primary?.category || "hybrid",
    label: resolveEmphasisLabel({
      architecture,
      category: primary?.category || "hybrid",
      role: "dominant",
      goal: primary,
      resolvedGoal: primaryResolvedGoal,
    }),
    objective: ["Advance the primary lane while keeping the rest of the system credible.", horizonLine, feasibilityLine].filter(Boolean).join(" "),
    role: "dominant",
    measurabilityTier: primaryMeasurabilityTier,
    targetHorizonWeeks: primaryTargetHorizonWeeks,
  };
  let secondaryEmphasis = {
    category: secondaryGoals[0]?.category || "maintenance",
    label: resolveEmphasisLabel({
      architecture,
      category: secondaryGoals[0]?.category || "maintenance",
      role: "secondary",
      goal: secondaryGoals[0] || null,
      resolvedGoal: resolvedContext.resolvedSecondaryGoals[0] || null,
    }) || "General fitness",
    objective: sequencingLine || "Secondary work stays in maintenance range while the dominant lane leads.",
    role: "secondary",
  };
  let minimizedEmphasis = {
    category: active.find((goal) => goal?.name === minimizedGoal)?.category || "support",
    label: minimizedGoal,
    objective: `${minimizedGoal} receives the least dedicated block volume so the main goal stack stays coherent.`,
    role: "minimized",
  };
  let recoveryPosture = {
    level: "balanced",
    summary: "Recovery is managed so the block can be repeated cleanly across several weeks.",
  };
  let nutritionPosture = {
    mode: "maintenance_support",
    summary: ["Nutrition supports steady training quality and repeatable recovery.", dominantMetricLine].filter(Boolean).join(" "),
  };
  let successCriteria = [
    "Keep the dominant lane progressing without losing consistency.",
    "Hold the secondary lane in a credible maintenance range.",
    "Finish the block with recovery still intact.",
    dominantMetricLine,
    feasibilityLine,
  ];
  let tradeoffs = [...resolvedContext.tradeoffs];

  if (architecture === "event_prep_upper_body_maintenance") {
    labelSuffix = "Event-prep + upper-body maintenance";
    dominantEmphasis = {
      category: "running",
      label: resolveEmphasisLabel({
        architecture,
        category: "running",
        role: "dominant",
        goal: primary || runningGoal,
        resolvedGoal: primaryResolvedGoal,
      }),
      objective: [
        "Event-specific endurance or race prep takes first claim on fatigue, scheduling, and lower-body freshness this block.",
        horizonLine,
        feasibilityLine,
      ].filter(Boolean).join(" "),
      role: "dominant",
      measurabilityTier: primaryMeasurabilityTier,
      targetHorizonWeeks: primaryTargetHorizonWeeks,
    };
    secondaryEmphasis = {
      category: "strength",
      label: resolveEmphasisLabel({
        architecture,
        category: "strength",
        role: "secondary",
        goal: strengthGoal,
        resolvedGoal: resolvedContext.resolvedSecondaryGoals.find((goal) => goal?.planningCategory === "strength") || null,
      }) || "Upper-body maintenance",
      objective: sequencingLine || "Upper-body strength is maintained with low leg-cost sessions so the event-prep lane stays clean.",
      role: "secondary",
    };
    recoveryPosture = {
      level: "protective",
      summary: "Recovery strongly protects key run sessions and long-run quality by minimizing lower-body lifting fatigue.",
    };
    nutritionPosture = {
      mode: "performance_support",
      summary: [
        "Nutrition supports event-specific quality work while keeping enough protein to preserve upper-body training identity.",
        dominantMetricLine,
      ].filter(Boolean).join(" "),
    };
    successCriteria = [
      "Land the event-specific key sessions without lower-body lifting spillover.",
      "Keep 2 upper-body maintenance exposures each week.",
      "Arrive at the next block with race-specific durability intact.",
      dominantMetricLine,
      feasibilityLine,
    ];
    tradeoffs = dedupeStrings([
      "Lower-body hypertrophy and heavy bilateral lifting are intentionally minimized while event prep leads.",
      ...tradeoffs,
    ]);
  } else if (architecture === "race_prep_dominant") {
    labelSuffix = "Run-dominant + strength-maintenance";
    dominantEmphasis = {
      category: "running",
      label: resolveEmphasisLabel({
        architecture,
        category: "running",
        role: "dominant",
        goal: primary || runningGoal,
        resolvedGoal: primaryResolvedGoal,
      }),
      objective: [
        "Run quality and endurance progression get first claim on fatigue and recovery this block.",
        horizonLine,
        feasibilityLine,
      ].filter(Boolean).join(" "),
      role: "dominant",
      measurabilityTier: primaryMeasurabilityTier,
      targetHorizonWeeks: primaryTargetHorizonWeeks,
    };
    secondaryEmphasis = {
      category: strengthGoal ? "strength" : "maintenance",
      label: resolveEmphasisLabel({
        architecture,
        category: strengthGoal ? "strength" : "maintenance",
        role: "secondary",
        goal: strengthGoal,
        resolvedGoal: resolvedContext.resolvedSecondaryGoals.find((goal) => goal?.planningCategory === "strength") || null,
      }) || "Strength maintenance",
      objective: sequencingLine || "Strength stays in maintenance range so it supports running instead of competing with it.",
      role: "secondary",
    };
    recoveryPosture = {
      level: lowBandwidth || ["aggressive", "unrealistic"].includes(feasibilityStatus) ? "protective" : "balanced",
      summary: lowBandwidth || ["aggressive", "unrealistic"].includes(feasibilityStatus)
        ? "Recovery is protected so run rhythm survives even when bandwidth is limited."
        : "Recovery is biased toward protecting the key run sessions and long-run quality.",
    };
    nutritionPosture = {
      mode: lowBandwidth ? "recovery_support" : "performance_support",
      summary: [
        "Fuel key run sessions, protect tendon recovery, and replenish enough to keep quality work credible.",
        dominantMetricLine,
      ].filter(Boolean).join(" "),
    };
    successCriteria = [
      "Land the key run sessions for the block without stacking recovery debt.",
      "Keep 1-2 strength touches in maintenance range.",
      "Arrive at the next phase with run durability intact.",
      dominantMetricLine,
      feasibilityLine,
    ];
    tradeoffs = dedupeStrings([
      "Strength volume stays capped while running receives the cleanest recovery windows.",
      ...tradeoffs,
    ]);
  } else if (architecture === "strength_dominant") {
    labelSuffix = "Strength-dominant + conditioning-maintenance";
    dominantEmphasis = {
      category: "strength",
      label: resolveEmphasisLabel({
        architecture,
        category: "strength",
        role: "dominant",
        goal: primary || strengthGoal,
        resolvedGoal: primaryResolvedGoal,
      }),
      objective: [
        "Strength progression is the main stressor to advance during this block.",
        horizonLine,
        feasibilityLine,
      ].filter(Boolean).join(" "),
      role: "dominant",
      measurabilityTier: primaryMeasurabilityTier,
      targetHorizonWeeks: primaryTargetHorizonWeeks,
    };
    secondaryEmphasis = {
      category: runningGoal ? "running" : "conditioning",
      label: resolveEmphasisLabel({
        architecture,
        category: runningGoal ? "running" : "conditioning",
        role: "secondary",
        goal: runningGoal,
        resolvedGoal: resolvedContext.resolvedSecondaryGoals.find((goal) => goal?.planningCategory === "running") || null,
      }) || "Conditioning maintenance",
      objective: sequencingLine || "Conditioning stays supportive so it preserves work capacity without stealing lower-body recovery.",
      role: "secondary",
    };
    recoveryPosture = {
      level: lowBandwidth || ["aggressive", "unrealistic"].includes(feasibilityStatus) ? "protective" : "balanced",
      summary: lowBandwidth || ["aggressive", "unrealistic"].includes(feasibilityStatus)
        ? "Recovery is kept protective so strength rhythm survives inconsistent weeks."
        : "Recovery protects the primary lifts while still leaving room for supportive conditioning.",
    };
    nutritionPosture = {
      mode: "strength_support",
      summary: [
        "Nutrition emphasizes protein coverage, lift-day fueling, and enough intake to keep strength sessions productive.",
        dominantMetricLine,
      ].filter(Boolean).join(" "),
    };
    successCriteria = [
      "Progress the primary strength lifts with controlled fatigue.",
      "Keep 1-2 conditioning exposures so hybrid fitness does not collapse.",
      "Finish the block stronger without letting supportive conditioning interfere.",
      dominantMetricLine,
      feasibilityLine,
    ];
    tradeoffs = dedupeStrings([
      "Conditioning stays supportive rather than chasing peak endurance or speed.",
      ...tradeoffs,
    ]);
  } else if (architecture === "body_comp_conditioning") {
    labelSuffix = "Body-comp + strength-retention";
    dominantEmphasis = {
      category: "body_comp",
      label: resolveEmphasisLabel({
        architecture,
        category: "body_comp",
        role: "dominant",
        goal: primary || bodyCompGoal,
        resolvedGoal: primaryResolvedGoal,
      }),
      objective: [
        "Energy balance and adherence drive the block while training protects lean mass and momentum.",
        horizonLine,
        feasibilityLine,
      ].filter(Boolean).join(" "),
      role: "dominant",
      measurabilityTier: primaryMeasurabilityTier,
      targetHorizonWeeks: primaryTargetHorizonWeeks,
    };
    secondaryEmphasis = {
      category: "strength",
      label: resolveEmphasisLabel({
        architecture,
        category: "strength",
        role: "secondary",
        goal: strengthGoal,
        resolvedGoal: resolvedContext.resolvedSecondaryGoals.find((goal) => goal?.planningCategory === "strength") || null,
      }) || "Strength retention",
      objective: sequencingLine || "Strength work stays present enough to retain muscle and training identity while conditioning supports expenditure.",
      role: "secondary",
    };
    recoveryPosture = {
      level: lowBandwidth || feasibilityStatus === "aggressive" ? "protective" : "balanced",
      summary: lowBandwidth || feasibilityStatus === "aggressive"
        ? "Recovery is slightly more protective so the deficit stays sustainable and strength can be retained."
        : "Recovery is protected enough to preserve adherence while the deficit stays sustainable.",
    };
    nutritionPosture = {
      mode: "deficit_support",
      summary: [
        "Nutrition prioritizes satiety, protein retention, and a deficit that the athlete can actually repeat.",
        dominantMetricLine,
      ].filter(Boolean).join(" "),
    };
    successCriteria = [
      "Keep nutrition adherence high enough that the deficit is sustainable.",
      "Retain minimum effective strength work.",
      "Use conditioning to support expenditure without creating rebound fatigue.",
      dominantMetricLine || "Use proxy metrics to show body-composition progress instead of guessing.",
      feasibilityLine,
    ];
    tradeoffs = dedupeStrings([
      "Aggressive performance progression is intentionally limited while body-comp pressure is active.",
      ...tradeoffs,
    ]);
  } else if (architecture === "maintenance_rebuild") {
    labelSuffix = "Balanced hybrid rebuild";
    dominantEmphasis = {
      category: "hybrid",
      label: "Balanced hybrid rebuild",
      objective: [
        "Rebuild rhythm with finishable run and strength doses before asking the athlete to push again.",
        horizonLine,
        feasibilityLine,
      ].filter(Boolean).join(" "),
      role: "dominant",
      measurabilityTier: primaryMeasurabilityTier,
      targetHorizonWeeks: primaryTargetHorizonWeeks,
    };
    secondaryEmphasis = {
      category: primary?.category || "maintenance",
      label: resolveEmphasisLabel({
        architecture,
        category: primary?.category || "maintenance",
        role: "secondary",
        goal: primary,
        resolvedGoal: primaryResolvedGoal,
      }) || "Primary goal maintenance",
      objective: sequencingLine || "Primary-goal qualities stay in maintenance range while consistency and recovery are restored.",
      role: "secondary",
    };
    recoveryPosture = {
      level: "protective",
      summary: "Recovery is protective on purpose so consistency can stabilize before progression returns.",
    };
    nutritionPosture = {
      mode: "consistency_support",
      summary: [
        "Nutrition stays low-friction and repeatable so the athlete can rebuild adherence across the block.",
        dominantMetricLine,
      ].filter(Boolean).join(" "),
    };
    successCriteria = [
      "String together repeatable sessions for several weeks in a row.",
      "Keep both run and strength in minimum effective range.",
      "Exit the block fresher and more consistent than it started.",
      dominantMetricLine || "Use simple check-ins and consistency proxies as the first proof of progress.",
      feasibilityLine,
    ];
    tradeoffs = dedupeStrings([
      "Aggressive progression is deferred until consistency and recovery are trustworthy again.",
      ...tradeoffs,
    ]);
  } else {
    labelSuffix = dominantEmphasis.category === "running" && strengthGoal
      ? "Run-dominant + strength-maintenance"
      : dominantEmphasis.category === "strength" && runningGoal
      ? "Strength-dominant + conditioning-maintenance"
      : "Hybrid performance";
    dominantEmphasis = {
      category: primary?.category || "hybrid",
      label: resolveEmphasisLabel({
        architecture,
        category: primary?.category || "hybrid",
        role: "dominant",
        goal: primary,
        resolvedGoal: primaryResolvedGoal,
      }),
      objective: [
        primary?.category === "running"
          ? "Run fitness advances while strength work stays present enough to keep the athlete meaningfully hybrid."
          : primary?.category === "strength"
          ? "Strength advances while conditioning stays present enough to protect broader fitness."
          : "Run, strength, and conditioning stay balanced enough that progress remains credible across lanes.",
        horizonLine,
        feasibilityLine,
      ].filter(Boolean).join(" "),
      role: "dominant",
      measurabilityTier: primaryMeasurabilityTier,
      targetHorizonWeeks: primaryTargetHorizonWeeks,
    };
    secondaryEmphasis = {
      category: secondaryGoals[0]?.category || (primary?.category === "running" ? "strength" : "running"),
      label: resolveEmphasisLabel({
        architecture,
        category: secondaryGoals[0]?.category || (primary?.category === "running" ? "strength" : "running"),
        role: "secondary",
        goal: secondaryGoals[0] || null,
        resolvedGoal: resolvedContext.resolvedSecondaryGoals[0] || null,
      }) || (primary?.category === "running" ? "Strength maintenance" : "Conditioning maintenance"),
      objective: sequencingLine || (primary?.category === "running"
        ? "Strength stays in maintenance range so the athlete still looks and performs like a hybrid athlete."
        : primary?.category === "strength"
        ? "Conditioning stays supportive so strength work remains the main driver without losing aerobic support."
        : "Secondary work is maintained so no lane falls too far behind while the block stays balanced."),
      role: "secondary",
    };
    recoveryPosture = {
      level: lowBandwidth || feasibilityStatus === "aggressive" ? "protective" : "balanced",
      summary: lowBandwidth
        ? "Recovery stays slightly protective so hybrid work remains finishable."
        : feasibilityStatus === "aggressive"
        ? "Recovery leans slightly protective because the active goal stack has real tradeoffs to manage."
        : "Recovery is balanced so both dominant and secondary work can stay credible across the block.",
    };
    nutritionPosture = {
      mode: primary?.category === "running"
        ? "performance_support"
        : primary?.category === "strength"
        ? "strength_support"
        : bodyCompActive
        ? "deficit_support"
        : "maintenance_support",
      summary: [
        primary?.category === "running"
          ? "Nutrition leans toward supporting key run work while covering enough protein to preserve strength."
          : primary?.category === "strength"
          ? "Nutrition supports productive lifting while keeping conditioning compatible."
          : bodyCompActive
          ? "Nutrition keeps the deficit sustainable enough that the hybrid structure survives."
          : "Nutrition supports repeatable hybrid training without overcommitting to one lane.",
        dominantMetricLine,
      ].filter(Boolean).join(" "),
    };
    successCriteria = [
      "Progress the dominant lane while keeping the secondary lane credible.",
      "Maintain enough cross-training that the athlete stays truly hybrid.",
      "Keep the block repeatable instead of overfilling a single week.",
      dominantMetricLine,
      feasibilityLine,
    ];
    tradeoffs = dedupeStrings([
      "The secondary lane is maintained, not pushed, while the dominant lane receives cleaner recovery and planning attention.",
      ...tradeoffs,
    ]);
  }

  minimizedEmphasis = {
    category: active.find((goal) => goal?.name === minimizedGoal)?.category || "support",
    label: minimizedGoal,
    objective: `${minimizedGoal} receives the least dedicated block volume so the dominant and maintained lanes stay coherent.`,
    role: "minimized",
  };

  if (unlockMessage) tradeoffs = [...tradeoffs, unlockMessage];

  const safeConstraints = dedupeStrings([...(constraints || [])]);
  const safeTradeoffs = dedupeStrings([...(tradeoffs || []), ...safeConstraints.slice(0, 2)]).slice(0, 5);
  const safeCriteria = dedupeStrings(successCriteria.filter(Boolean)).slice(0, 5);
  const prioritized = dominantEmphasis.label || primary?.name || "Consistency and execution";
  const maintained = maintainedGoals.length
    ? maintainedGoals
    : [secondaryEmphasis.label || "general fitness"].filter(Boolean);
  const summary = `${dominantEmphasis.objective} ${secondaryEmphasis.objective} ${minimizedEmphasis.objective}`.trim();

  return {
    version: PROGRAM_BLOCK_MODEL_VERSION,
    id: `program_block_${phase || "current"}_${window.startWeek}_${window.endWeek}_${architecture}`,
    label: `${phase || "Current"} - ${labelSuffix}`,
    architecture,
    phase,
    window,
    dominantEmphasis,
    secondaryEmphasis,
    minimizedEmphasis,
    recoveryPosture,
    nutritionPosture,
    successCriteria: safeCriteria,
    constraints: safeConstraints,
    tradeoffs: safeTradeoffs,
    goalAllocation: {
      prioritized,
      maintained,
      minimized: minimizedGoal,
    },
    goalStack: {
      primaryResolvedGoalId: primaryResolvedGoal?.id || "",
      secondaryResolvedGoalIds: resolvedContext.resolvedSecondaryGoals.map((goal) => goal.id).filter(Boolean),
      measurabilityTier: primaryMeasurabilityTier,
      targetHorizonWeeks: primaryTargetHorizonWeeks,
      primaryMetricLabel,
      proxyMetricLabels,
      realismStatus: feasibilityStatus || "",
      realisticByDate: resolvedContext.realisticByDateSummary || "",
      sequencingSummary: sequencingLine,
    },
    feasibility: clonePlainValue(programContext?.goalFeasibility || null),
    drivers: dedupeStrings([
      prioritized,
      ...(maintained || []),
      minimizedGoal,
      ...(drivers || []),
      phase,
      architecture,
      programContext?.inconsistencyRisk ? `risk ${programContext.inconsistencyRisk}` : "",
    ]).slice(0, 8),
    summary,
  };
};

const resolveWeeklyNutritionEmphasis = ({
  primaryCategory = "general_fitness",
  architecture = "hybrid_performance",
  recoveryBias = "moderate",
  performanceBias = "moderate",
} = {}) => {
  if (recoveryBias === "high") return "recovery support and consistent fueling";
  if (primaryCategory === "body_comp" || architecture === "body_comp_conditioning") return "satiety, recovery, and deficit adherence";
  if (primaryCategory === "strength" || architecture === "strength_dominant") return "protein coverage and session recovery";
  if (performanceBias === "high" || ["race_prep_dominant", "event_prep_upper_body_maintenance"].includes(architecture)) return "fuel key sessions and replenish quality work";
  if (architecture === "maintenance_rebuild") return "consistency and low-friction meals";
  return "balanced support for training and recovery";
};

export const deriveWeeklyIntent = ({
  weekNumber = 1,
  weekTemplate = {},
  weekTemplates = [],
  goals = [],
  architecture = "hybrid_performance",
  programBlock = null,
  programContext = null,
  blockIntent = null,
  momentum = {},
  learningLayer = {},
  weeklyCheckin = {},
  coachPlanAdjustments = {},
  failureMode = {},
  environmentSelection = null,
  constraints = [],
} = {}) => {
  const { active } = getGoalBuckets(goals);
  const primaryGoal = active[0] || null;
  const normalizedProgramBlock = programBlock
    || buildFallbackProgramBlockFromCompatibilityIntent({
      weekNumber,
      weekTemplate,
      weekTemplates,
      goals,
      architecture,
      blockIntent,
      constraints,
    });
  const volumePctRaw = Number(coachPlanAdjustments?.weekVolumePct?.[String(weekNumber)] || 100);
  const volumePct = clampNumber(volumePctRaw, 70, 120);
  const lowEnergy = Number(weeklyCheckin?.energy || 3) <= 2;
  const highStress = Number(weeklyCheckin?.stress || 3) >= 4;
  const lowConfidence = Number(weeklyCheckin?.confidence || 3) <= 2;
  const simplifyBias = learningLayer?.adjustmentBias === "simplify";
  const cutback = Boolean(weekTemplate?.cutback);
  const chaotic = failureMode?.mode === "chaotic";
  const reEntry = Boolean(failureMode?.isReEntry);
  const intensityPosture = programContext?.trainingContext?.intensityPosture?.confirmed
    ? programContext.trainingContext.intensityPosture.value
    : TRAINING_INTENSITY_VALUES.unknown;
  const adjusted = Boolean(
    chaotic
    || reEntry
    || cutback
    || lowEnergy
    || highStress
    || lowConfidence
    || simplifyBias
    || volumePct !== 100
    || environmentSelection?.scope === "week"
  );

  let aggressionLevel = "steady";
  if (chaotic || reEntry || normalizedProgramBlock?.recoveryPosture?.level === "protective") aggressionLevel = "rebuild";
  else if (cutback || lowEnergy || highStress || lowConfidence || simplifyBias || volumePct < 100) aggressionLevel = "controlled";
  else if (
    volumePct > 100
    || normalizedProgramBlock?.recoveryPosture?.level === "progressive"
    || ["race_prep_dominant", "strength_dominant", "event_prep_upper_body_maintenance"].includes(architecture)
  ) aggressionLevel = "progressive";
  else if (intensityPosture === TRAINING_INTENSITY_VALUES.aggressive) aggressionLevel = "progressive";
  else if (intensityPosture === TRAINING_INTENSITY_VALUES.conservative) aggressionLevel = "controlled";

  let recoveryBias = normalizedProgramBlock?.recoveryPosture?.level === "protective"
    ? "high"
    : normalizedProgramBlock?.recoveryPosture?.level === "progressive"
    ? "low"
    : "moderate";
  if (chaotic || reEntry || cutback || lowEnergy || highStress) recoveryBias = "high";
  else if (aggressionLevel === "progressive") recoveryBias = "low";

  let volumeBias = "baseline";
  if (cutback || volumePct < 100) volumeBias = "reduced";
  else if (volumePct > 100) volumeBias = "expanded";

  let performanceBias = "moderate";
  if (recoveryBias === "high") performanceBias = "low";
  else if (["race_prep_dominant", "strength_dominant", "event_prep_upper_body_maintenance"].includes(architecture) && aggressionLevel === "progressive") performanceBias = "high";

  const focus = resolveWeeklyFocusLabel({
    architecture,
    dominantCategory: normalizedProgramBlock?.dominantEmphasis?.category || primaryGoal?.category || "",
    secondaryCategory: normalizedProgramBlock?.secondaryEmphasis?.category || "",
    primaryGoal,
    primaryResolvedGoal: normalizedProgramBlock?.goalStack?.primaryResolvedGoalId
      ? active.find((goal) => (goal?.resolvedGoal?.id || "") === normalizedProgramBlock.goalStack.primaryResolvedGoalId)?.resolvedGoal || primaryGoal?.resolvedGoal || null
      : primaryGoal?.resolvedGoal || null,
  }) || normalizedProgramBlock?.dominantEmphasis?.label
    || blockIntent?.prioritized
    || primaryGoal?.name
    || weekTemplate?.label
    || "Consistency and execution";
  const primaryCategory = primaryGoal?.category || "general_fitness";
  const weeklyConstraints = dedupeStrings([
    ...(normalizedProgramBlock?.constraints || []),
    ...(normalizedProgramBlock?.tradeoffs || []),
    ...(constraints || []),
    weekTemplate?.cutback ? "Cutback week" : "",
    chaotic ? "Salvage mode is active this week" : "",
    reEntry ? "Re-entry week: protect momentum first" : "",
    weeklyCheckin?.blocker ? `Weekly blocker: ${String(weeklyCheckin.blocker).replace(/_/g, " ")}` : "",
    environmentSelection?.scope === "week" ? `${String(environmentSelection?.mode || "custom").replace(/_/g, " ")} environment this week` : "",
    volumePct !== 100 ? `Volume set to ${volumePct}%` : "",
  ]);
  const nutritionEmphasis = recoveryBias === "high"
    ? resolveWeeklyNutritionEmphasis({
      primaryCategory,
      architecture,
      recoveryBias,
      performanceBias,
    })
    : normalizedProgramBlock?.nutritionPosture?.summary || resolveWeeklyNutritionEmphasis({
      primaryCategory,
      architecture,
      recoveryBias,
      performanceBias,
    });
  const status = adjusted ? "adjusted" : "planned";
  const maintainedFocus = normalizedProgramBlock?.secondaryEmphasis?.label || "";
  const minimizedFocus = normalizedProgramBlock?.minimizedEmphasis?.label || normalizedProgramBlock?.goalAllocation?.minimized || "";
  const tradeoffFocus = normalizedProgramBlock?.tradeoffs?.[0] || "";
  const successDefinition = recoveryBias === "high"
    ? ["event_prep_upper_body_maintenance", "race_prep_dominant"].includes(architecture)
      ? architecture === "event_prep_upper_body_maintenance"
        ? "Protect recovery, land the key event-prep work, and keep upper-body maintenance exposures minimal but real."
        : "Protect recovery, land the key event-prep work, and keep the maintained strength work minimal but real."
      : architecture === "body_comp_conditioning"
      ? "Protect recovery, keep the deficit repeatable, and land the minimum effective maintenance work."
      : "Protect recovery, land the minimum effective work, and keep logging."
    : normalizedProgramBlock?.successCriteria?.length > 1
    ? `${normalizedProgramBlock.successCriteria[0]} ${normalizedProgramBlock.successCriteria[1]}`
    : normalizedProgramBlock?.successCriteria?.[0]
    ? normalizedProgramBlock.successCriteria[0]
    : performanceBias === "high"
    ? "Hit the key quality sessions without sacrificing recovery."
    : "String together repeatable sessions and keep the week stable.";
  const rationale = adjusted
    ? `This week is adjusted inside ${String(normalizedProgramBlock?.label || "the current block").toLowerCase()} around ${focus.toLowerCase()} with a ${aggressionLevel.replace(/_/g, " ")} posture. ${maintainedFocus ? `${maintainedFocus} stays maintained.` : ""} ${minimizedFocus ? `${minimizedFocus} stays minimized.` : ""}`.trim()
    : `This week sits inside ${String(normalizedProgramBlock?.label || "the current block").toLowerCase()} and advances ${focus.toLowerCase()} with a ${aggressionLevel.replace(/_/g, " ")} posture. ${maintainedFocus ? `${maintainedFocus} stays maintained.` : ""} ${minimizedFocus ? `${minimizedFocus} stays minimized.` : ""}`.trim();

  return {
    id: `weekly_intent_${weekNumber}`,
    weekNumber,
    programBlockId: normalizedProgramBlock?.id || "",
    blockLabel: normalizedProgramBlock?.label || "",
    focus,
    aggressionLevel,
    recoveryBias,
    volumeBias,
    performanceBias,
    nutritionEmphasis,
    weeklyConstraints,
    status,
    adjusted,
    volumePct,
    successDefinition,
    maintainedFocus,
    minimizedFocus,
    tradeoffFocus,
    drivers: dedupeStrings([
      focus,
      maintainedFocus,
      minimizedFocus,
      normalizedProgramBlock?.dominantEmphasis?.label || "",
      blockIntent?.prioritized || "",
      primaryGoal?.name || "",
      tradeoffFocus,
      volumePct !== 100 ? `volume ${volumePct}%` : "",
      weeklyCheckin?.blocker ? String(weeklyCheckin.blocker).replace(/_/g, " ") : "",
    ]),
    blockTradeoffs: clonePlainValue(normalizedProgramBlock?.tradeoffs || []),
    rationale,
  };
};

export const buildPlanWeek = ({
  weekNumber = 1,
  template = {},
  weekTemplates = [],
  referenceTemplate = null,
  label = "",
  specificity = "high",
  kind = "plan",
  startDate = null,
  endDate = null,
  goals = [],
  architecture = "hybrid_performance",
  programBlock = null,
  programContext = null,
  blockIntent = null,
  split = null,
  sessionsByDay = null,
  momentum = {},
  learningLayer = {},
  weeklyCheckin = {},
  coachPlanAdjustments = {},
  failureMode = {},
  environmentSelection = null,
  constraints = [],
} = {}) => {
  const hasCanonicalSessionPattern = Boolean(sessionsByDay && Object.keys(sessionsByDay || {}).length);
  const normalizedSessions = clonePlainValue(
    projectSessionsByDayFromCanonicalPattern({
      template,
      referenceTemplate: referenceTemplate || template,
      sessionsByDay: hasCanonicalSessionPattern ? sessionsByDay : null,
    })
  );
  const normalizedProgramBlock = programBlock
    || buildProgramBlock({
      weekNumber,
      weekTemplate: template,
      weekTemplates,
      goals,
      architecture,
      constraints,
      drivers: programContext?.drivers || [],
      unlockMessage: programContext?.unlockMessage || "",
      programContext,
    })
    || buildFallbackProgramBlockFromCompatibilityIntent({
      weekNumber,
      weekTemplate: template,
      weekTemplates,
      goals,
      architecture,
      blockIntent,
      constraints,
    });
  const compatibilityBlockIntent = blockIntent || buildProgramBlockCompatibilityIntent(normalizedProgramBlock);
  const weeklyIntent = deriveWeeklyIntent({
    weekNumber,
    weekTemplate: template,
    weekTemplates,
    goals,
    architecture,
    programBlock: normalizedProgramBlock,
    programContext,
    blockIntent: compatibilityBlockIntent,
    momentum,
    learningLayer,
    weeklyCheckin,
    coachPlanAdjustments,
    failureMode,
    environmentSelection,
    constraints,
  });
  const sessionSource = hasCanonicalSessionPattern
    ? normalizeRunSignature(referenceTemplate?.mon || null) === normalizeRunSignature(template?.mon || null)
      && normalizeRunSignature(referenceTemplate?.thu || null) === normalizeRunSignature(template?.thu || null)
      && normalizeRunSignature(referenceTemplate?.fri || null) === normalizeRunSignature(template?.fri || null)
      && normalizeRunSignature(referenceTemplate?.sat || null) === normalizeRunSignature(template?.sat || null)
      && String(referenceTemplate?.str || "") === String(template?.str || "")
      ? "canonical_week_pattern"
      : "projected_canonical_week_pattern"
    : "template_fallback";

  return {
    id: `plan_week_${weekNumber}`,
    weekNumber,
    absoluteWeek: weekNumber,
    phase: template?.phase || "",
    label: label || `${template?.phase || "BASE"} · Week ${weekNumber}`,
    kind,
    specificity,
    startDate: startDate || null,
    endDate: endDate || null,
    status: weeklyIntent.status,
    adjusted: Boolean(weeklyIntent.adjusted),
    architecture,
    programBlock: clonePlainValue(normalizedProgramBlock || null),
    blockIntent: clonePlainValue(compatibilityBlockIntent || null),
    split: clonePlainValue(split || null),
    weeklyIntent,
    focus: weeklyIntent.focus,
    aggressionLevel: weeklyIntent.aggressionLevel,
    recoveryBias: weeklyIntent.recoveryBias,
    volumeBias: weeklyIntent.volumeBias,
    performanceBias: weeklyIntent.performanceBias,
    nutritionEmphasis: weeklyIntent.nutritionEmphasis,
    successDefinition: weeklyIntent.successDefinition,
    drivers: clonePlainValue(weeklyIntent.drivers || []),
    rationale: weeklyIntent.rationale,
    sessionsByDay: normalizedSessions,
    template: clonePlainValue(template || {}),
    summary: weeklyIntent.rationale,
    constraints: clonePlainValue(weeklyIntent.weeklyConstraints || []),
    source: {
      sessionModel: sessionSource,
      specificity,
      planningModel: normalizedProgramBlock ? "program_block" : "block_intent_legacy",
      hasCanonicalSessions: hasCanonicalSessionPattern,
      usesTemplateFallback: sessionSource === "template_fallback",
    },
  };
};

/**
 * Canonical PlanDay contract shared by Today, Program, Coach, Nutrition, and Logging.
 *
 * Shape:
 * {
 *   id,
 *   dateKey,
 *   dayOfWeek,
 *   week,
 *   base: {
 *     training,
 *     nutrition,
 *     recovery,
 *     supplements,
 *     logging,
 *   },
 *   resolved: {
 *     training,
 *     nutrition: { prescription, reality },
 *     recovery,
 *     supplements,
 *     logging,
 *   },
 *   decision: {
 *     mode,
 *     modeLabel,
 *     confidence,
 *     source,
 *     inputDriven,
 *     modifiedFromBase,
 *   },
 *   provenance: {
 *     keyDrivers,
 *     adjustments,
 *     summary,
 *   },
 *   flags,
 * }
 */
export const buildCanonicalPlanDay = (args = {}) => {
  const {
    dateKey = "",
    dayOfWeek = 0,
    currentWeek = 1,
    baseWeek = {},
    basePlannedDay = null,
    resolvedDay = null,
    todayPlan = null,
    readiness = null,
    nutrition = {},
    adjustments = {},
    context = {},
    logging = {},
  } = args;
  const baseTraining = clonePlainValue(basePlannedDay || {});
  const resolvedTraining = clonePlainValue(resolvedDay || basePlannedDay || {});
  const planWeek = clonePlainValue(context?.planWeek || null);
  const programBlock = clonePlainValue(context?.programBlock || planWeek?.programBlock || null);
  const compatibilityBlockIntent = clonePlainValue(
    context?.blockIntent
    || planWeek?.blockIntent
    || buildProgramBlockCompatibilityIntent(programBlock)
    || null
  );
  const weeklyIntent = clonePlainValue(context?.weeklyIntent || planWeek?.weeklyIntent || null);
  const readinessState = clonePlainValue(readiness || {});
  const nutritionPrescription = clonePlainValue(nutrition?.prescription || null);
  const nutritionReality = clonePlainValue(nutrition?.reality || null);
  const nutritionActual = clonePlainValue(nutrition?.actual || null);
  const nutritionComparison = clonePlainValue(nutrition?.comparison || null);
  const dailyCheckin = clonePlainValue(logging?.dailyCheckin || null);
  const sessionLog = clonePlainValue(logging?.sessionLog || null);
  const nutritionLog = clonePlainValue(logging?.nutritionLog || null);
  const supplementLog = clonePlainValue(logging?.supplementLog || null);
  const dayOverride = adjustments?.dayOverride || null;
  const nutritionOverride = adjustments?.nutritionOverride || null;
  const injuryRule = adjustments?.injuryRule || null;
  const injuryState = clonePlainValue(adjustments?.injuryState || null);
  const failureMode = adjustments?.failureMode || null;
  const garminReadiness = adjustments?.garminReadiness || null;
  const deviceSyncAudit = adjustments?.deviceSyncAudit || null;
  const environmentSelection = adjustments?.environmentSelection || null;
  const supplementsPlan = buildCanonicalSupplementPlan({
    dateKey,
    supplementPlan: clonePlainValue(
      nutritionPrescription?.supplements
      || context?.supplementPlan
      || []
    ),
    training: resolvedTraining,
    nutritionPrescription,
  });
  const supplementsActual = deriveSupplementActual({
    supplementPlan: supplementsPlan,
    nutritionActualLog: nutritionActual || nutritionLog || null,
    supplementLog,
  });
  const baseRecoveryPrescription = buildRecoveryPrescription({
    dateKey,
    training: baseTraining,
    readinessState: null,
    nutritionPrescription,
    supplementPlan: supplementsPlan,
    injuryState,
  });
  const resolvedRecoveryPrescription = buildRecoveryPrescription({
    dateKey,
    training: resolvedTraining,
    readinessState,
    nutritionPrescription,
    supplementPlan: supplementsPlan,
    injuryState,
  });
  const actualRecovery = normalizeActualRecoveryLog({
    dateKey,
    dailyCheckin,
    nutritionActualLog: nutritionActual || nutritionLog || null,
    recoveryPrescription: resolvedRecoveryPrescription,
    supplementPlan: supplementsPlan,
    supplementLog,
    injuryState,
  });

  const baseSignature = normalizeTrainingSignature(baseTraining);
  const resolvedSignature = normalizeTrainingSignature(resolvedTraining);
  const comparisonModified = baseSignature !== resolvedSignature;
  const provenanceTimestamp = Date.now();

  const adjustmentEvents = [
    dayOverride ? buildProvenanceEvent({
      actor: dayOverride?.provenance?.actor || PROVENANCE_ACTORS.user,
      trigger: "day_override",
      mutationType: "daily_override",
      revisionReason: String(dayOverride?.reason || "day override").replace(/_/g, " "),
      sourceInputs: dayOverride?.provenance?.sourceInputs || ["coachPlanAdjustments.dayOverrides"],
      confidence: dayOverride?.provenance?.confidence || "high",
      timestamp: dayOverride?.provenance?.timestamp || provenanceTimestamp,
      details: {
        mode: dayOverride?.type || "",
        sourcePath: "coachPlanAdjustments.dayOverrides",
      },
    }) : null,
    nutritionOverride ? buildProvenanceEvent({
      actor: nutritionOverride?.provenance?.actor || PROVENANCE_ACTORS.user,
      trigger: "nutrition_override",
      mutationType: "nutrition_override",
      revisionReason: String(nutritionOverride?.reason || nutritionOverride?.dayType || nutritionOverride).replace(/_/g, " "),
      sourceInputs: nutritionOverride?.provenance?.sourceInputs || ["coachPlanAdjustments.nutritionOverrides"],
      confidence: nutritionOverride?.provenance?.confidence || "high",
      timestamp: nutritionOverride?.provenance?.timestamp || provenanceTimestamp,
      details: {
        dayType: nutritionOverride?.dayType || nutritionOverride,
        sourcePath: "coachPlanAdjustments.nutritionOverrides",
      },
    }) : null,
    injuryRule?.mods?.length ? buildProvenanceEvent({
      actor: PROVENANCE_ACTORS.deterministicEngine,
      trigger: "injury_rule",
      mutationType: "protective_adjustment",
      revisionReason: injuryRule.mods.join("; "),
      sourceInputs: ["injuryPainState", "buildInjuryRuleResult"],
      confidence: "high",
      timestamp: provenanceTimestamp,
      details: {
        modifications: clonePlainValue(injuryRule.mods || []),
      },
    }) : null,
    failureMode?.mode && failureMode.mode !== "normal" ? buildProvenanceEvent({
      actor: PROVENANCE_ACTORS.deterministicEngine,
      trigger: "failure_mode",
      mutationType: "compliance_hardening",
      revisionReason: String(failureMode.mode).replace(/_/g, " "),
      sourceInputs: ["failureMode", "momentum", "logs"],
      confidence: "high",
      timestamp: provenanceTimestamp,
      details: {
        mode: failureMode.mode,
      },
    }) : null,
    garminReadiness?.mode ? buildProvenanceEvent({
      actor: PROVENANCE_ACTORS.deterministicEngine,
      trigger: "device_readiness",
      mutationType: "readiness_adjustment",
      revisionReason: `garmin readiness ${String(garminReadiness.mode).replace(/_/g, " ")}`,
      sourceInputs: ["garminReadiness", "connectedDevices.garmin"],
      confidence: "medium",
      timestamp: provenanceTimestamp,
      details: {
        mode: garminReadiness.mode,
      },
    }) : null,
    deviceSyncAudit?.planMode && deviceSyncAudit.planMode !== "normal" ? buildProvenanceEvent({
      actor: PROVENANCE_ACTORS.deterministicEngine,
      trigger: "device_sync",
      mutationType: "device_fallback",
      revisionReason: String(deviceSyncAudit.reason || `device plan mode ${deviceSyncAudit.planMode}`).trim(),
      sourceInputs: ["deviceSyncAudit", "connectedDevices"],
      confidence: "medium",
      timestamp: provenanceTimestamp,
      details: {
        planMode: deviceSyncAudit.planMode,
      },
    }) : null,
    environmentSelection?.scope === "today" ? buildProvenanceEvent({
      actor: PROVENANCE_ACTORS.user,
      trigger: "environment_override",
      mutationType: "daily_override",
      revisionReason: `${String(environmentSelection?.mode || "custom")} mode for today`,
      sourceInputs: ["environmentSelection", "environmentConfig.todayOverride"],
      confidence: "high",
      timestamp: provenanceTimestamp,
      details: {
        scope: environmentSelection?.scope || "",
        mode: environmentSelection?.mode || "",
      },
    }) : null,
    readinessState?.state && readinessState.state !== "steady" ? buildProvenanceEvent({
      actor: PROVENANCE_ACTORS.deterministicEngine,
      trigger: "readiness_adjustment",
      mutationType: "readiness_adjustment",
      revisionReason: readinessState?.userVisibleLine || readinessState?.stateLabel || readinessState?.state,
      sourceInputs: [
        "dailyCheckins",
        "recent_session_history",
        readinessState?.metrics?.hasTodayRecoveryInput ? "today_readiness_input" : "",
        readinessState?.source || "readiness_engine",
      ],
      confidence: "high",
      timestamp: provenanceTimestamp,
      details: {
        state: readinessState?.state || "",
        source: readinessState?.source || "deterministic_engine",
      },
    }) : null,
  ].filter(Boolean);

  const keyDrivers = dedupeStrings([
    todayPlan?.reason,
    programBlock?.dominantEmphasis?.label ? `block ${programBlock.dominantEmphasis.label}` : "",
    weeklyIntent?.focus ? `week focus ${weeklyIntent.focus}` : "",
    weeklyIntent?.aggressionLevel ? `week posture ${String(weeklyIntent.aggressionLevel).replace(/_/g, " ")}` : "",
    ...(Array.isArray(readinessState?.factors) ? readinessState.factors : []),
    dayOverride?.reason ? String(dayOverride.reason).replace(/_/g, " ") : "",
    nutritionOverride ? `nutrition ${String(nutritionOverride).replace(/_/g, " ")}` : "",
    injuryRule?.mods?.[0] || "",
    failureMode?.mode && failureMode.mode !== "normal" ? `failure mode ${String(failureMode.mode).replace(/_/g, " ")}` : "",
    garminReadiness?.mode ? `garmin readiness ${String(garminReadiness.mode).replace(/_/g, " ")}` : "",
    deviceSyncAudit?.planMode && deviceSyncAudit.planMode !== "normal" ? String(deviceSyncAudit.reason || `device plan mode ${deviceSyncAudit.planMode}`) : "",
    environmentSelection?.mode ? `${String(environmentSelection.mode).toLowerCase()} environment` : "",
  ]).slice(0, 6);

  const modifiedFromBase = comparisonModified || adjustmentEvents.length > 0;
  const decisionMode = readinessState?.state
    || resolvedTraining?.readinessState
    || (modifiedFromBase ? "adjusted" : "planned");
  const decisionModeLabel = readinessState?.stateLabel
    || resolvedTraining?.readinessStateLabel
    || (modifiedFromBase ? "Adjusted" : "Planned");

  return {
    id: dateKey ? `plan_day_${dateKey}` : `plan_day_week_${currentWeek}_day_${dayOfWeek}`,
    dateKey,
    dayOfWeek,
    week: {
      currentWeek,
      phase: resolvedTraining?.week?.phase || programBlock?.phase || baseWeek?.phase || "",
      label: resolvedTraining?.week?.label || programBlock?.label || baseWeek?.label || "",
      architecture: context?.architecture || "",
      programBlock,
      blockIntent: compatibilityBlockIntent,
      planWeekId: planWeek?.id || "",
      status: planWeek?.status || weeklyIntent?.status || "planned",
      adjusted: Boolean(planWeek?.adjusted || weeklyIntent?.adjusted),
      summary: planWeek?.summary || weeklyIntent?.rationale || programBlock?.summary || "",
      constraints: clonePlainValue(planWeek?.constraints || weeklyIntent?.weeklyConstraints || programBlock?.constraints || []),
      successDefinition: weeklyIntent?.successDefinition || programBlock?.successCriteria?.[0] || "",
      weeklyIntent,
      planWeek,
      todayPlan: clonePlainValue(todayPlan || null),
    },
    base: {
      training: baseTraining,
      nutrition: {
        dayType: baseTraining?.nutri || nutritionPrescription?.dayType || null,
        prescription: null,
        actual: null,
        comparison: null,
      },
      recovery: {
        mode: baseTraining?.type === "rest" ? "recovery" : "planned",
        recommendation: baseTraining?.recoveryRecommendation || baseRecoveryPrescription?.summary || "",
        success: baseTraining?.success || baseRecoveryPrescription?.successCriteria?.[0] || "",
        prescription: baseRecoveryPrescription,
        actual: null,
        summary: baseRecoveryPrescription?.summary || "",
      },
      supplements: {
        plan: supplementsPlan,
        actual: null,
        summary: supplementsPlan?.summary || "",
      },
      logging: {
        dateKey,
        expectedStatus: "planned",
      },
    },
    resolved: {
      training: resolvedTraining,
      nutrition: {
        dayType: nutritionPrescription?.dayType || resolvedTraining?.nutri || baseTraining?.nutri || null,
        prescription: nutritionPrescription,
        reality: nutritionReality,
        actual: nutritionActual,
        comparison: nutritionComparison,
      },
      recovery: {
        state: readinessState?.state || resolvedTraining?.readinessState || "steady",
        stateLabel: readinessState?.stateLabel || resolvedTraining?.readinessStateLabel || "Steady",
        source: readinessState?.source || "deterministic_engine",
        inputDriven: Boolean(readinessState?.inputDriven),
        coachLine: readinessState?.coachLine || "",
        recoveryLine: readinessState?.recoveryLine || resolvedTraining?.recoveryRecommendation || "",
        userVisibleLine: readinessState?.userVisibleLine || "",
        factors: clonePlainValue(readinessState?.factors || []),
        metrics: clonePlainValue(readinessState?.metrics || resolvedTraining?.readinessInputs || {}),
        summary: resolvedRecoveryPrescription?.summary || "",
        prescription: {
          ...clonePlainValue(resolvedRecoveryPrescription || {}),
          recommendation: resolvedTraining?.recoveryRecommendation || resolvedRecoveryPrescription?.summary || "",
          success: resolvedTraining?.success || resolvedRecoveryPrescription?.successCriteria?.[0] || "",
          intensityGuidance: resolvedTraining?.intensityGuidance || "",
        },
        actual: actualRecovery,
      },
      supplements: {
        plan: supplementsPlan,
        actual: supplementsActual,
        summary: supplementsPlan?.summary || "",
      },
      logging: {
        dateKey,
        status: logging?.sessionStatus || "not_logged",
        dailyCheckin,
        sessionLog,
        nutritionLog,
        supplementLog: supplementsActual?.takenMap || supplementsActual,
        hasCheckin: Boolean(dailyCheckin),
        hasSessionLog: Boolean(sessionLog),
        hasNutritionLog: Boolean(nutritionLog),
        hasRecoveryLog: Boolean(actualRecovery?.loggedAt),
      },
    },
    decision: {
      mode: decisionMode,
      modeLabel: decisionModeLabel,
      confidence: null,
      source: readinessState?.source || (adjustmentEvents[0]?.trigger || "deterministic_engine"),
      inputDriven: Boolean(readinessState?.inputDriven),
      modifiedFromBase,
    },
    provenance: {
      ...buildStructuredProvenance({
        keyDrivers,
        events: [
          buildProvenanceEvent({
            actor: PROVENANCE_ACTORS.deterministicEngine,
            trigger: "plan_day_resolution",
            mutationType: "plan_day_resolution",
            revisionReason: modifiedFromBase ? "resolved daily recommendation differs from base plan" : "resolved daily recommendation matches base plan",
            sourceInputs: [
              "weeklyIntent",
              "todayPlan",
              "basePlannedDay",
              "readiness",
              "nutrition",
            ],
            confidence: "high",
            timestamp: provenanceTimestamp,
            details: {
              modifiedFromBase,
              decisionMode,
            },
          }),
          ...adjustmentEvents,
        ],
        summary: buildPlanDaySummary(keyDrivers, modifiedFromBase),
      }),
      keyDrivers,
      summary: buildPlanDaySummary(keyDrivers, modifiedFromBase),
      adjustments: buildLegacyProvenanceAdjustmentView(adjustmentEvents),
    },
    flags: {
      isModified: modifiedFromBase,
      coachModified: Boolean(dayOverride || nutritionOverride),
      environmentModified: Boolean(environmentSelection?.scope === "today" || resolvedTraining?.environmentNote),
      injuryModified: Boolean(injuryRule?.mods?.length),
      readinessModified: Boolean(readinessState?.state && readinessState.state !== "steady"),
      nutritionModified: Boolean(
        nutritionOverride
        || (nutritionPrescription?.dayType && nutritionPrescription.dayType !== baseTraining?.nutri)
      ),
      deviceModified: Boolean(garminReadiness?.mode || (deviceSyncAudit?.planMode && deviceSyncAudit.planMode !== "normal")),
      failureModeModified: Boolean(failureMode?.mode && failureMode.mode !== "normal"),
      minDay: Boolean(resolvedTraining?.minDay),
      restDay: ["rest", "recovery"].includes(String(resolvedTraining?.type || "").toLowerCase()),
    },
  };
};

export const composeGoalNativePlan = ({ goals, personalization, momentum, learningLayer, baseWeek, currentWeek = 1, weekTemplates = [] }) => {
  const { active } = getGoalBuckets(goals);
  const primary = active[0] || null;
  const secondary = active.slice(1, 3);
  const trainingContext = deriveTrainingContextFromPersonalization({ personalization });
  const activeIssueContext = deriveActiveIssueContextFromPersonalization({ personalization });
  const env = trainingContext?.environment?.confirmed ? trainingContext.environment.value : "unknown";
  const equipmentAccess = trainingContext?.equipmentAccess?.value || TRAINING_EQUIPMENT_VALUES.unknown;
  const environmentKnown = Boolean(trainingContext?.environment?.confirmed);
  const equipmentKnown = Boolean(trainingContext?.equipmentAccess?.confirmed);
  const hasGym = equipmentAccess === TRAINING_EQUIPMENT_VALUES.fullGym || equipmentAccess === TRAINING_EQUIPMENT_VALUES.basicGym;
  const runningGoal = active.find(g => g.category === "running");
  const strengthGoal = active.find(g => g.category === "strength");
  const bodyCompGoal = active.find(g => g.category === "body_comp");
  const hasRunningGoal = Boolean(runningGoal);
  const raceNear = daysUntil(runningGoal?.targetDate) <= 56;
  const inconsistencyRisk = momentum?.inconsistencyRisk || "medium";
  const lowBandwidth = inconsistencyRisk === "high" || learningLayer?.adjustmentBias === "simplify";
  const strengthPriority = primary?.category === "strength" && !lowBandwidth;
  const bodyCompActive = !!bodyCompGoal;
  const resolvedGoals = active.map((goal) => goal?.resolvedGoal).filter(Boolean);
  const upperBodyMaintenance = Boolean(runningGoal && strengthGoal && goalLooksUpperBodyFocused(strengthGoal));

  const runningScore = (primary?.category === "running" ? 3 : 0) + (runningGoal ? 2 : 0) + (raceNear ? 2 : 0);
  const strengthEnvironmentScore = hasGym ? 1 : equipmentKnown ? -1 : 0;
  const strengthScore = (primary?.category === "strength" ? 3 : 0) + (strengthGoal ? 2 : 0) + strengthEnvironmentScore;
  const bodyCompScore = (primary?.category === "body_comp" ? 3 : 0) + (bodyCompGoal ? 2 : 0) + (lowBandwidth ? 1 : 0);

  let architecture = "hybrid_performance";
  if (lowBandwidth) {
    if (primary?.category === "strength") architecture = "strength_dominant";
    else if (primary?.category === "body_comp") architecture = "body_comp_conditioning";
    else architecture = "maintenance_rebuild";
  } else if (primary?.category === "running" && upperBodyMaintenance) architecture = "event_prep_upper_body_maintenance";
  else if (primary?.category === "running") architecture = "race_prep_dominant";
  else if (primary?.category === "body_comp") architecture = "body_comp_conditioning";
  else if (primary?.category === "strength") architecture = "strength_dominant";
  else if (runningScore >= Math.max(strengthScore, bodyCompScore) && raceNear && upperBodyMaintenance) architecture = "event_prep_upper_body_maintenance";
  else if (runningScore >= Math.max(strengthScore, bodyCompScore) && raceNear) architecture = "race_prep_dominant";
  else if (bodyCompScore >= Math.max(runningScore, strengthScore)) architecture = "body_comp_conditioning";
  else if (strengthScore >= Math.max(runningScore, bodyCompScore)) architecture = "strength_dominant";

  const splits = {
    event_prep_upper_body_maintenance: { run: 4, strength: 2, conditioning: 0, recovery: 1 },
    race_prep_dominant: { run: 4, strength: 2, conditioning: 1, recovery: 1 },
    strength_dominant: { run: 2, strength: 4, conditioning: 1, recovery: 1 },
    body_comp_conditioning: { run: 2, strength: 3, conditioning: 2, recovery: 1 },
    hybrid_performance: { run: 3, strength: 3, conditioning: 1, recovery: 1 },
    maintenance_rebuild: { run: 2, strength: 2, conditioning: 1, recovery: 2 },
  };
  const noRunGoalSplitOverrides = {
    strength_dominant: { run: 0, strength: 4, conditioning: 2, recovery: 1 },
    body_comp_conditioning: { run: 0, strength: 3, conditioning: 3, recovery: 1 },
    hybrid_performance: { run: 0, strength: 3, conditioning: 2, recovery: 1 },
    maintenance_rebuild: { run: 0, strength: 2, conditioning: 1, recovery: 2 },
  };
  const split = !hasRunningGoal && noRunGoalSplitOverrides[architecture]
    ? noRunGoalSplitOverrides[architecture]
    : splits[architecture];

  const constraints = [];
  if (equipmentKnown && !hasGym && strengthGoal) constraints.push("Bench-specific progression constrained by the confirmed equipment setup; using lower-equipment substitutes.");
  if (!["race_prep_dominant", "event_prep_upper_body_maintenance"].includes(architecture) && runningGoal) constraints.push("Running kept supportive/maintenance until running priority or race proximity increases.");
  if (architecture === "event_prep_upper_body_maintenance") constraints.push("Lower-body lifting volume is capped so the event-prep lane keeps the cleanest recovery windows.");
  const why = [
    `Primary goal: ${primary?.name || "none set"}.`,
    environmentKnown ? `Environment: ${env}.` : "Environment is still unconfirmed, so planning stays setup-neutral where possible.",
    `Inconsistency risk: ${inconsistencyRisk}.`,
    bodyCompGoal ? "Body-comp goal is active and materially affects split allocation." : null,
    raceNear ? "Race date is near enough to increase running weight." : null,
    !hasRunningGoal ? "No running goal is active, so conditioning stays non-run by default." : null,
    upperBodyMaintenance ? "Secondary strength work is upper-body biased, so lower-body fatigue can stay subordinate to event prep." : null,
  ].filter(Boolean);

  const restDay = (label = "Active Recovery") => ({ type: "rest", label, nutri: "rest", isRecoverySlot: true });

  const dayTemplates = {
    event_prep_upper_body_maintenance: {
      1: { type: "hard-run", label: `${baseWeek.mon?.t || "Quality"} Run`, run: baseWeek.mon, nutri: "hardRun" },
      2: { type: "strength+prehab", label: "Upper-Body Maintenance A", strSess: baseWeek.str || "A", nutri: "strength", upperBodyBias: true },
      3: { type: "easy-run", label: "Easy Run", run: baseWeek.fri || { t: "Easy", d: "25-35 min" }, nutri: "easyRun" },
      4: { type: "hard-run", label: `${baseWeek.thu?.t || "Tempo"} Run`, run: baseWeek.thu, nutri: "hardRun" },
      5: { type: "strength+prehab", label: "Upper-Body Maintenance B", strSess: baseWeek.str === "A" ? "B" : "A", nutri: "strength", upperBodyBias: true },
      6: { type: "long-run", label: "Long Run", run: baseWeek.sat, nutri: "longRun" },
      0: restDay("Active Recovery"),
    },
    race_prep_dominant: {
      1: { type: "run+strength", label: "Quality Run + Strength Finish", run: baseWeek.mon, strSess: baseWeek.str, nutri: "hardRun" },
      2: { type: "conditioning", label: "Conditioning Intervals", nutri: "otf" },
      3: { type: "strength+prehab", label: "Strength + Durability", strSess: baseWeek.str === "A" ? "B" : "A", nutri: "strength" },
      4: { type: "hard-run", label: `${baseWeek.thu?.t || "Tempo"} Run`, run: baseWeek.thu, nutri: "hardRun" },
      5: { type: "easy-run", label: "Easy Run", run: baseWeek.fri, nutri: "easyRun" },
      6: { type: "long-run", label: "Long Run", run: baseWeek.sat, nutri: "longRun" },
      0: restDay("Active Recovery"),
    },
    strength_dominant: {
      1: { type: "strength+prehab", label: "Full-Body Strength A", strSess: "A", nutri: "strength" },
      2: hasRunningGoal
        ? { type: "easy-run", label: "Easy Conditioning Run", run: { t: "Easy", d: "20-30 min zone-2" }, nutri: "easyRun" }
        : buildConditioningSession({ label: "Supportive Conditioning", detail: "20-30 min zone-2 bike, rower, incline walk, or circuit", lowImpact: true }),
      3: { type: "strength+prehab", label: "Full-Body Strength B", strSess: "B", nutri: "strength" },
      4: { type: "strength+prehab", label: "Upper Push/Pull Strength", strSess: "A", nutri: "strength" },
      5: hasRunningGoal
        ? { type: "easy-run", label: "Conditioning Support", run: { t: "Easy", d: "20-25 min + strides optional" }, nutri: "easyRun" }
        : buildConditioningSession({ label: "Conditioning Support", detail: "15-25 min controlled conditioning + mobility finish", lowImpact: true }),
      6: { type: "strength+prehab", label: "Full-Body Strength", strSess: "B", nutri: "strength" },
      0: restDay("Active Recovery"),
    },
    body_comp_conditioning: {
      1: { type: "strength+prehab", label: "Strength Circuit A", strSess: "A", nutri: "strength" },
      2: hasRunningGoal
        ? { type: "easy-run", label: "Conditioning (low-friction)", run: { t: "Easy", d: "25-35 min zone-2" }, nutri: "easyRun" }
        : buildConditioningSession({ label: "Conditioning (low-friction)", detail: "25-35 min zone-2 bike, incline walk, or circuit", lowImpact: true }),
      3: { type: "strength+prehab", label: "Strength Circuit B", strSess: "B", nutri: "strength" },
      4: { type: "conditioning", label: "Conditioning Intervals", nutri: "otf" },
      5: { type: "strength+prehab", label: "Strength Retention", strSess: "A", nutri: "strength" },
      6: hasRunningGoal
        ? { type: "easy-run", label: "Easy Run/Walk", run: { t: "Easy", d: "20-30 min" }, nutri: "easyRun" }
        : buildConditioningSession({ label: "Supportive Conditioning", detail: "20-30 min easy conditioning or brisk walk", lowImpact: true }),
      0: restDay("Active Recovery - Steps + Mobility"),
    },
    hybrid_performance: {
      1: hasRunningGoal
        ? { type: "run+strength", label: "Easy Run + Strength Finish", run: baseWeek.mon, strSess: baseWeek.str, nutri: "easyRun" }
        : { type: "strength+prehab", label: "Strength + Conditioning Primer", strSess: baseWeek.str, nutri: "strength" },
      2: { type: "conditioning", label: "Conditioning", nutri: "otf" },
      3: { type: "strength+prehab", label: "Full-Body Strength B + Durability", strSess: baseWeek.str === "A" ? "B" : "A", nutri: "strength" },
      4: hasRunningGoal
        ? { type: "hard-run", label: `${baseWeek.thu?.t || "Tempo"} Run`, run: baseWeek.thu, nutri: "hardRun" }
        : buildConditioningSession({ label: "Conditioning Intervals", detail: "20-30 min controlled intervals or mixed-modality conditioning" }),
      5: { type: "strength+prehab", label: "Full-Body Strength Focus", strSess: baseWeek.str, nutri: "strength" },
      6: hasRunningGoal
        ? { type: "easy-run", label: "Supportive Endurance", run: baseWeek.fri, nutri: "easyRun" }
        : buildConditioningSession({ label: "Supportive Conditioning", detail: "20-30 min easy conditioning to keep work capacity alive", lowImpact: true }),
      0: restDay("Active Recovery"),
    },
    maintenance_rebuild: {
      1: { type: "strength+prehab", label: "Short Full-Body Strength A", strSess: "A", nutri: "strength" },
      2: restDay("Active Recovery - Walk"),
      3: hasRunningGoal
        ? { type: "easy-run", label: "Short Conditioning", run: { t: "Easy", d: "20-25 min" }, nutri: "easyRun" }
        : buildConditioningSession({ label: "Short Conditioning", detail: "15-20 min easy conditioning or brisk walk", lowImpact: true }),
      4: { type: "strength+prehab", label: "Short Full-Body Strength B", strSess: "B", nutri: "strength" },
      5: restDay("Active Recovery"),
      6: buildConditioningSession({ label: "Optional Conditioning", detail: "15-20 min optional easy conditioning", lowImpact: true }),
      0: restDay("Active Recovery"),
    },
  };

  const annotateTemplate = (template) => {
    const out = Object.fromEntries(Object.entries(template || {}).map(([day, session]) => {
      const nextSession = { ...session };
      const isStrengthSession = ["run+strength", "strength+prehab"].includes(nextSession.type);
      if (isStrengthSession && !strengthPriority && !/short strength/i.test(nextSession.label || "")) {
        nextSession.label = `${nextSession.label} (Short Strength)`;
      }
      if (isStrengthSession) {
        nextSession.strengthDose = strengthPriority ? "40-55 min strength progression" : "20-35 min maintenance strength";
      }
      const allowsOptionalCore = nextSession.type !== "rest";
      if (bodyCompActive && allowsOptionalCore) {
        nextSession.optionalSecondary = "Optional: 10 min core finisher";
      }
      return [day, normalizeSessionEntryLabel(nextSession)];
    }));
    return out;
  };

  const annotatedTemplates = annotateTemplate(dayTemplates[architecture]);
  let strengthSessionsPerWeek = Object.values(annotatedTemplates).filter(s => ["run+strength", "strength+prehab"].includes(s?.type)).length;
  if (strengthGoal && strengthSessionsPerWeek < 1) {
    annotatedTemplates[3] = { type: "strength+prehab", label: "Minimum Strength Touchpoint", strSess: "A", nutri: "strength", strengthDose: "20-30 min maintenance strength" };
    strengthSessionsPerWeek = 1;
  }

  const maintainedGoals = active
    .filter(g => g.id !== primary?.id && g.category !== "injury_prevention")
    .slice(0, 2)
    .map(g => g.name);
  const minimizedGoal = active.find(g => g.category === "injury_prevention")?.name || "non-primary volume";
  const goalFeasibility = resolvedGoals.length
    ? assessGoalFeasibility({
        resolvedGoals,
        userBaseline: {
          experienceLevel: personalization?.profile?.estimatedFitnessLevel || personalization?.canonicalAthlete?.userProfile?.experienceLevel || "unknown",
          fitnessLevel: personalization?.fitnessSignals?.fitnessLevel || personalization?.profile?.fitnessLevel || "",
          currentBaseline: personalization?.profile?.goalMix || "",
          primaryGoalLabel: primary?.name || "",
        },
        scheduleReality: {
          trainingDaysPerWeek: Number(personalization?.userGoalProfile?.days_per_week || personalization?.canonicalAthlete?.userProfile?.daysPerWeek || 0),
          sessionLength: trainingContext?.sessionDuration?.confirmed ? trainingContext.sessionDuration.value : "",
          trainingLocation: environmentKnown ? env : "",
          scheduleNotes: lowBandwidth ? "Bandwidth is currently limited." : "",
        },
        currentExperienceContext: {
          injuryConstraintContext: {
            constraints: activeIssueContext?.activeConstraints || [],
            injuryText: activeIssueContext?.notes || "",
          },
          equipmentAccessContext: {
            equipment: trainingContext?.equipmentAccess?.confirmed ? (trainingContext.equipmentAccess.items || []) : [],
            trainingLocation: environmentKnown ? env : "",
          },
          startingFresh: Boolean(personalization?.planResetUndo?.startedAt),
        },
        now: Date.now(),
      })
    : null;
  const programContext = {
    environmentMode: env,
    environmentKnown,
    hasGym,
    lowBandwidth,
    strengthPriority,
    bodyCompActive,
    inconsistencyRisk,
    trainingContext,
    drivers: [primary?.name, ...secondary.map(g => g.name)].filter(Boolean),
    unlockMessage: equipmentKnown && !hasGym && strengthGoal ? "When gym access returns, bench-specific progression can move from foundation mode to direct loading." : "",
    goalFeasibility,
  };
  const programBlock = buildProgramBlock({
    weekNumber: currentWeek,
    weekTemplate: baseWeek,
    weekTemplates,
    goals,
    architecture,
    constraints,
    drivers: programContext.drivers,
    unlockMessage: programContext.unlockMessage,
    programContext,
  });
  const blockIntent = buildProgramBlockCompatibilityIntent(programBlock) || {
    prioritized: primary?.name || "Consistency and execution",
    maintained: maintainedGoals.length ? maintainedGoals : ["general fitness"],
    minimized: minimizedGoal,
    narrative: `This block prioritizes ${primary?.category || "consistency"}. ${maintainedGoals[0] ? `${maintainedGoals[0]} is maintained.` : "Secondary goals are maintained."} ${bodyCompActive ? "Core work stays minimal but consistent." : "Non-primary accessories stay intentionally limited."}`,
  };

  return {
    architecture,
    split,
    why,
    constraints,
    drivers: [primary?.name, ...secondary.map(g => g.name)].filter(Boolean),
    unlockMessage: programContext.unlockMessage,
    dayTemplates: annotatedTemplates,
    programContext,
    programBlock,
    blockIntent,
    strengthAllocation: {
      sessionsPerWeek: strengthSessionsPerWeek,
      dosing: strengthPriority ? "full" : "maintenance",
      targetSessionDuration: strengthPriority ? "40-55 min" : "20-35 min",
    },
    aestheticAllocation: bodyCompActive ? {
      active: true,
      weeklyCoreFinishers: 3,
      dosage: "8-12 min optional finishers",
    } : { active: false },
  };
};

export const getSpecificityBand = (offset) => offset <= 1 ? "high" : offset <= 5 ? "medium" : "directional";

export const getHorizonAnchor = (goals = [], horizonWeeks = DEFAULT_PLANNING_HORIZON_WEEKS) => {
  const timeGoal = getActiveTimeBoundGoal(goals);
  if (!timeGoal) return { nearest: null, withinHorizon: false, weekIndex: null };
  const weekIndex = Math.ceil((Math.max(0, timeGoal.days) + 1) / 7);
  return { nearest: timeGoal, withinHorizon: weekIndex <= horizonWeeks, weekIndex };
};

const labelPhaseWeeks = (rows = []) => {
  const counts = {};
  return rows.map((row) => {
    if (row.kind !== "plan") return row;
    const phase = row?.template?.phase || "BASE";
    counts[phase] = (counts[phase] || 0) + 1;
    return { ...row, phaseWeek: counts[phase], phaseLabel: `${phase} · Week ${counts[phase]}` };
  });
};

export const buildRollingHorizonWeeks = ({
  currentWeek,
  horizonWeeks = DEFAULT_PLANNING_HORIZON_WEEKS,
  goals,
  weekTemplates,
  architecture = "hybrid_performance",
  programBlock = null,
  programContext = null,
  blockIntent = null,
  split = null,
  sessionsByDay = null,
  referenceTemplate = null,
  momentum = {},
  learningLayer = {},
  weeklyCheckins = {},
  coachPlanAdjustments = {},
  failureMode = {},
  environmentSelection = null,
  constraints = [],
}) => {
  const anchor = getHorizonAnchor(goals, horizonWeeks);
  const timeGoal = getActiveTimeBoundGoal(goals);
  const today = new Date();

  const buildPlanWeekRow = (idx) => {
    const absoluteWeek = currentWeek + idx;
    const templateIndex = Math.max(0, Math.min((absoluteWeek - 1), (weekTemplates?.length || 1) - 1));
    const template = weekTemplates[templateIndex] || weekTemplates[weekTemplates.length - 1] || {};
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + (idx * 7));
    const endDate = new Date(startDate);
    endDate.setDate(endDate.getDate() + 6);
    const isCurrentWeek = absoluteWeek === currentWeek;
    const planWeek = buildPlanWeek({
      weekNumber: absoluteWeek,
      template,
      weekTemplates,
      referenceTemplate: referenceTemplate || template,
      label: `${template?.phase || "BASE"} - Week ${absoluteWeek}`,
      specificity: getSpecificityBand(idx),
      kind: "plan",
      startDate,
      endDate,
      goals,
      architecture,
      programBlock: isCurrentWeek ? programBlock : null,
      programContext,
      blockIntent,
      split,
      sessionsByDay,
      momentum,
      learningLayer,
      weeklyCheckin: weeklyCheckins?.[String(absoluteWeek)] || {},
      coachPlanAdjustments,
      failureMode: isCurrentWeek ? failureMode : {},
      environmentSelection: isCurrentWeek ? environmentSelection : null,
      constraints,
    });
    return {
      kind: "plan",
      slot: idx + 1,
      absoluteWeek,
      template,
      planWeek,
      specificity: getSpecificityBand(idx),
      startDate,
      endDate,
      anchorHit: anchor.withinHorizon && anchor.weekIndex === (idx + 1),
    };
  };

  if (!timeGoal) {
    const fallback = Array.from({ length: horizonWeeks }).map((_, idx) => buildPlanWeekRow(idx));
    return fallback.map((row) => ({
      ...row,
      weekLabel: row?.planWeek?.label || `${row?.template?.phase || "BASE"} - Week ${row.absoluteWeek}`,
    }));
  }

  const daysToDeadline = daysUntil(timeGoal.targetDate);
  if (daysToDeadline >= 0) {
    const rows = Array.from({ length: horizonWeeks }).map((_, idx) => buildPlanWeekRow(idx));
    return labelPhaseWeeks(rows).map(row => ({
      ...row,
      weekLabel: row?.planWeek?.label || row.weekLabel || row.phaseLabel || `Week ${row.absoluteWeek}`,
    }));
  }

  const daysSinceDeadline = Math.abs(daysToDeadline);
  const recoveryWeeksRemaining = Math.max(0, RECOVERY_BLOCK_WEEKS - Math.floor(daysSinceDeadline / 7));
  if (recoveryWeeksRemaining > 0) {
    const recoveryRows = Array.from({ length: Math.min(horizonWeeks, recoveryWeeksRemaining) }).map((_, idx) => {
      const startDate = new Date(today);
      startDate.setDate(startDate.getDate() + (idx * 7));
      const endDate = new Date(startDate);
      endDate.setDate(endDate.getDate() + 6);
      return {
        kind: "recovery",
        slot: idx + 1,
        absoluteWeek: currentWeek + idx,
        weekLabel: `Recovery · Week ${idx + 1}`,
        focus: "Rebuild freshness and mobility before selecting a new race block.",
        startDate,
        endDate,
      };
    });
    if (recoveryRows.length < horizonWeeks) {
      recoveryRows.push({ kind: "next_goal_prompt", slot: recoveryRows.length + 1, absoluteWeek: currentWeek + recoveryRows.length, weekLabel: "Set Next Goal", focus: "Recovery block complete. Set your next time-bound goal." });
    }
    return recoveryRows;
  }

  return [{ kind: "next_goal_prompt", slot: 1, absoluteWeek: currentWeek, weekLabel: "Set Next Goal", focus: "Your previous race block has ended. Start the next time-bound plan." }];
};

// ── DETERMINISTIC TODAY-PLAN ENGINE ─────────────────────────────────────────

const GOAL_SESSION_ROTATIONS = {
  fat_loss:        ["strength", "cardio", "strength", "cardio", "strength", "cardio"],
  muscle_gain:     ["strength", "strength", "cardio", "strength", "strength", "cardio"],
  endurance:       ["cardio", "cardio", "strength", "cardio", "cardio", "strength"],
  general_fitness: ["strength", "cardio", "strength", "cardio", "strength", "cardio"],
};

const STRENGTH_LABELS = {
  fat_loss:        ["Metabolic Strength A", "Metabolic Strength B", "Strength Retention"],
  muscle_gain:     ["Upper Body Strength", "Lower Body Strength", "Push/Pull Strength", "Full-Body Strength"],
  endurance:       ["Maintenance Strength", "Prehab + Core"],
  general_fitness: ["Full-Body Strength A", "Full-Body Strength B"],
};

const CARDIO_LABELS = {
  fat_loss:        ["Conditioning Intervals", "Steady-State Cardio", "HIIT Circuit"],
  muscle_gain:     ["Easy Conditioning", "Low-Intensity Cardio"],
  endurance:       ["Tempo Run", "Easy Run", "Long Run", "Interval Session"],
  general_fitness: ["Conditioning", "Easy Cardio", "Interval Training"],
};

const INTENSITY_MAP = {
  beginner:     { base: "low",    push: "moderate" },
  intermediate: { base: "moderate", push: "high"   },
  advanced:     { base: "moderate", push: "high"   },
};

const SESSION_DURATIONS = { "20": 20, "30": 30, "45": 45, "60+": 60 };

/**
 * generateTodayPlan — deterministic engine that decides today's workout.
 *
 * @param {Object} userProfile - canonical user profile
 *   { primaryGoalKey, experienceLevel, daysPerWeek, sessionLength, equipmentAccess, constraints }
 * @param {Object} recentActivity - { logs: { [dateKey]: { date, type, feel, notes } }, todayKey: "YYYY-MM-DD" }
 * @param {Object} fatigueSignals - { fatigueScore (0-10), trend: "improving"|"stable"|"worsening", momentum: string, injuryLevel: string }
 * @returns {{ type, duration, intensity, label, reason }}
 */
export const generateTodayPlan = (userProfile = {}, recentActivity = {}, fatigueSignals = {}, planningContext = {}) => {
  const goal = userProfile.primaryGoalKey || userProfile.primary_goal || "general_fitness";
  const experience = userProfile.experienceLevel || userProfile.experience_level || "beginner";
  const targetDays = userProfile.daysPerWeek || userProfile.days_per_week || 3;
  const trainingContext = userProfile.trainingContext || null;
  const sessionLen = trainingContext?.sessionDuration?.confirmed
    ? trainingContext.sessionDuration.value
    : (userProfile.sessionLength || userProfile.session_length || TRAINING_SESSION_DURATION_VALUES.min30);
  let duration = SESSION_DURATIONS[sessionLen] || 30;
  const hasConstraints = (userProfile.constraints || []).length > 0;
  const intensityPosture = trainingContext?.intensityPosture?.confirmed
    ? trainingContext.intensityPosture.value
    : TRAINING_INTENSITY_VALUES.unknown;
  const hasConfirmedSessionDuration = Boolean(trainingContext?.sessionDuration?.confirmed);

  const todayKey = recentActivity.todayKey || new Date().toISOString().split("T")[0];
  const logs = recentActivity.logs || {};
  const fatigue = fatigueSignals.fatigueScore ?? 2;
  const fatigueTrend = fatigueSignals.trend || "stable";
  const momentum = fatigueSignals.momentum || "stable";
  const injuryLevel = fatigueSignals.injuryLevel || "none";
  const planWeek = planningContext?.planWeek || null;
  const programBlock = planningContext?.programBlock || planWeek?.programBlock || null;
  const weeklyIntent = planningContext?.weeklyIntent || planWeek?.weeklyIntent || null;
  const plannedSession = planningContext?.plannedSession || null;
  const plannedSessionKind = resolvePlannedSessionKind(plannedSession);

  // ── 1. Compute recent activity window (last 7 days) ──────────────
  const today = new Date(todayKey + "T12:00:00");
  const recentEntries = Object.entries(logs)
    .filter(([d]) => {
      const diff = (today.getTime() - new Date(d + "T12:00:00").getTime()) / 86400000;
      return diff > 0 && diff <= 7;
    })
    .sort((a, b) => b[0].localeCompare(a[0]));

  const sessionsThisWeek = recentEntries.length;
  const daysSinceLastWorkout = recentEntries.length
    ? Math.floor((today.getTime() - new Date(recentEntries[0][0] + "T12:00:00").getTime()) / 86400000)
    : 99;

  // ── 2. Classify recent sessions ───────────────────────────────────
  const recentTypes = recentEntries.map(([, l]) => {
    const t = String(l.type || "").toLowerCase();
    if (/strength|push|pull|upper|lower|full.body|metabolic/i.test(t)) return "strength";
    if (/run|cardio|conditioning|interval|tempo|hiit|otf/i.test(t)) return "cardio";
    return "other";
  });

  const recentStrength = recentTypes.filter(t => t === "strength").length;
  const recentCardio = recentTypes.filter(t => t === "cardio").length;

  // ── 3. Recovery gate ──────────────────────────────────────────────
  const needsRecovery =
    injuryLevel === "severe" ||
    injuryLevel === "moderate_pain" ||
    fatigue >= 7 ||
    fatigueTrend === "worsening" && fatigue >= 5 ||
    momentum === "falling off" && daysSinceLastWorkout <= 1 ||
    sessionsThisWeek >= targetDays ||
    daysSinceLastWorkout === 0; // already logged today

  if (needsRecovery) {
    const reason = injuryLevel === "severe"
      ? "Injury severity requires full rest."
      : injuryLevel === "moderate_pain"
      ? "Moderate pain detected — active recovery only."
      : fatigue >= 7
      ? "Fatigue is elevated — recovery prioritized to protect next session."
      : sessionsThisWeek >= targetDays
      ? `Weekly target of ${targetDays} sessions already reached. Recovery day.`
      : daysSinceLastWorkout === 0
      ? "Session already logged today."
      : "Accumulated fatigue warrants a recovery day.";

    return {
      type: "recovery",
      duration: Math.min(duration, 20),
      intensity: "low",
      label: injuryLevel === "severe"
        ? "Rest Day"
        : "Active Recovery - Walk + Mobility",
      reason,
    };
  }

  // ── 4. Re-entry logic (long gap) ─────────────────────────────────
  if (plannedSession?.type === "rest") {
    return {
      type: "recovery",
      duration: Math.min(duration, 20),
      intensity: "low",
      label: plannedSession?.label || "Active Recovery",
      reason: weeklyIntent?.focus
        ? `This week's plan protects ${String(weeklyIntent.focus).toLowerCase()} with a recovery day today.`
        : "This week's plan calls for recovery today.",
    };
  }

  const isReEntry = daysSinceLastWorkout >= 4;
  if (isReEntry) {
    if (plannedSession && plannedSessionKind && plannedSessionKind !== "recovery") {
      const plannedLabel = plannedSession?.label || (plannedSessionKind === "strength" ? "Strength session" : "Conditioning session");
      return {
        type: plannedSessionKind,
        duration: Math.min(duration, plannedSessionKind === "strength" ? 30 : 25),
        intensity: "low",
        label: plannedLabel,
        reason: `${daysSinceLastWorkout} days since last session. Starting with the easiest version of today's planned ${plannedLabel.toLowerCase()} so the current block stays aligned.`,
      };
    }
    return {
      type: "strength",
      duration: Math.min(duration, 25),
      intensity: "low",
      label: "Re-entry: Easy Full-Body Movement",
      reason: `${daysSinceLastWorkout} days since last session. Starting easy to rebuild rhythm.`,
    };
  }

  // ── 5. Determine session type via goal rotation ───────────────────
  const rotation = GOAL_SESSION_ROTATIONS[goal] || GOAL_SESSION_ROTATIONS.general_fitness;
  // Position in rotation = total sessions completed this week
  const rotationIndex = sessionsThisWeek % rotation.length;
  let sessionType = rotation[rotationIndex];
  const plannedSessionType = String(plannedSession?.type || "").toLowerCase();
  if (plannedSessionType === "run+strength") sessionType = "cardio";
  else if (/strength/.test(plannedSessionType)) sessionType = "strength";
  else if (/run|conditioning|otf/.test(plannedSessionType)) sessionType = "cardio";

  // Balance correction: if one type is overrepresented, flip
  const targetSplit = rotation.filter(t => t === "strength").length / rotation.length;
  const actualStrengthRatio = sessionsThisWeek > 0 ? recentStrength / sessionsThisWeek : 0;
  if (sessionType === "strength" && actualStrengthRatio > targetSplit + 0.2 && recentCardio === 0) {
    sessionType = "cardio";
  } else if (sessionType === "cardio" && actualStrengthRatio < targetSplit - 0.2 && recentStrength === 0) {
    sessionType = "strength";
  }

  // ── 6. Determine intensity ────────────────────────────────────────
  const intensityBase = INTENSITY_MAP[experience] || INTENSITY_MAP.beginner;
  let intensity = intensityBase.base;
  // Push harder when fresh (2+ days gap, low fatigue, building momentum)
  if (daysSinceLastWorkout >= 2 && fatigue <= 3 && (momentum === "building momentum" || momentum === "stable")) {
    intensity = intensityBase.push;
  }
  // Pull back if constraints or elevated fatigue
  if (hasConstraints || fatigue >= 5) {
    intensity = "low";
  }
  if (programBlock?.recoveryPosture?.level === "protective" || weeklyIntent?.recoveryBias === "high") {
    intensity = "low";
  } else if (weeklyIntent?.aggressionLevel === "progressive" && !hasConstraints && fatigue <= 3) {
    intensity = intensityBase.push;
  }
  if (intensityPosture === TRAINING_INTENSITY_VALUES.conservative && intensity !== "low") {
    intensity = intensityBase.base;
  } else if (intensityPosture === TRAINING_INTENSITY_VALUES.aggressive && !hasConstraints && fatigue <= 3 && intensity !== "low") {
    intensity = intensityBase.push;
  }
  if (weeklyIntent?.volumeBias === "reduced") {
    duration = Math.max(20, duration - 10);
  } else if (weeklyIntent?.volumeBias === "expanded") {
    duration = Math.min(60, duration + 10);
  }

  // ── 7. Select label ──────────────────────────────────────────────
  const labelPool = sessionType === "strength"
    ? (STRENGTH_LABELS[goal] || STRENGTH_LABELS.general_fitness)
    : (CARDIO_LABELS[goal] || CARDIO_LABELS.general_fitness);
  const labelIndex = (sessionType === "strength" ? recentStrength : recentCardio) % labelPool.length;
  const label = plannedSession?.label || labelPool[labelIndex];

  // ── 8. Build reason ──────────────────────────────────────────────
  const reasonParts = [
    `Goal: ${goal.replace(/_/g, " ")}.`,
    `${sessionsThisWeek} of ${targetDays} sessions done this week.`,
    daysSinceLastWorkout >= 2
      ? `${daysSinceLastWorkout} days rest — ready to push.`
      : daysSinceLastWorkout === 1
      ? "Back-to-back day — moderate approach."
      : null,
    fatigue >= 4 ? `Fatigue elevated (${fatigue}/10) — intensity adjusted.` : null,
    hasConstraints ? `Active constraints: ${userProfile.constraints.join(", ")}.` : null,
    weeklyIntent?.focus ? `Week focus: ${weeklyIntent.focus}.` : null,
    weeklyIntent?.aggressionLevel ? `Week posture: ${String(weeklyIntent.aggressionLevel).replace(/_/g, " ")}.` : null,
    !hasConfirmedSessionDuration ? "Typical session duration is still unconfirmed, so the default plan length is being used." : null,
    intensityPosture === TRAINING_INTENSITY_VALUES.aggressive ? "User preference: push when recovery supports it." : null,
    intensityPosture === TRAINING_INTENSITY_VALUES.conservative ? "User preference: keep progression more controlled." : null,
  ].filter(Boolean);

  return {
    type: sessionType,
    duration,
    intensity,
    label,
    reason: reasonParts.join(" "),
  };
};
