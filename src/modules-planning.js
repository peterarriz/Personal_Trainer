import {
  deriveCanonicalAthleteState as deriveCanonicalGoalProfileState,
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

export { deriveCanonicalGoalProfileState, getActiveTimeBoundGoal, getGoalBuckets, inferGoalType, normalizeGoalObject, normalizeGoals };

export const DEFAULT_PLANNING_HORIZON_WEEKS = 12;
export const RECOVERY_BLOCK_WEEKS = 2;

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

const buildSessionsByDayFromTemplate = (template = {}) => {
  const restDay = { type: "rest", label: "Active Recovery", nutri: "rest", isRecoverySlot: true };
  return {
    1: template?.mon ? { type: "easy-run", label: `${template.mon.t || "Easy"} Run`, run: clonePlainValue(template.mon), nutri: template?.nutri || "easyRun" } : null,
    2: null,
    3: template?.str ? { type: "strength+prehab", label: `Strength ${template.str}`, strSess: template.str, nutri: "strength" } : null,
    4: template?.thu ? { type: "hard-run", label: `${template.thu.t || "Quality"} Run`, run: clonePlainValue(template.thu), nutri: template?.nutri || "hardRun" } : null,
    5: template?.fri ? { type: "easy-run", label: `${template.fri.t || "Easy"} Run`, run: clonePlainValue(template.fri), nutri: "easyRun" } : null,
    6: template?.sat ? { type: "long-run", label: `${template.sat.t || "Long"} Run`, run: clonePlainValue(template.sat), nutri: "longRun" } : null,
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

      return [dayKeyRaw, nextSession];
    })
  );

  return projected;
};

const resolveWeeklyNutritionEmphasis = ({
  primaryCategory = "running",
  architecture = "hybrid_performance",
  recoveryBias = "moderate",
  performanceBias = "moderate",
} = {}) => {
  if (recoveryBias === "high") return "recovery support and consistent fueling";
  if (primaryCategory === "body_comp" || architecture === "body_comp_conditioning") return "satiety, recovery, and deficit adherence";
  if (primaryCategory === "strength" || architecture === "strength_dominant") return "protein coverage and session recovery";
  if (performanceBias === "high" || architecture === "race_prep_dominant") return "fuel key sessions and replenish quality work";
  if (architecture === "maintenance_rebuild") return "consistency and low-friction meals";
  return "balanced support for training and recovery";
};

export const deriveWeeklyIntent = ({
  weekNumber = 1,
  weekTemplate = {},
  goals = [],
  architecture = "hybrid_performance",
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
  const volumePctRaw = Number(coachPlanAdjustments?.weekVolumePct?.[String(weekNumber)] || 100);
  const volumePct = clampNumber(volumePctRaw, 70, 120);
  const lowEnergy = Number(weeklyCheckin?.energy || 3) <= 2;
  const highStress = Number(weeklyCheckin?.stress || 3) >= 4;
  const lowConfidence = Number(weeklyCheckin?.confidence || 3) <= 2;
  const simplifyBias = learningLayer?.adjustmentBias === "simplify";
  const cutback = Boolean(weekTemplate?.cutback);
  const chaotic = failureMode?.mode === "chaotic";
  const reEntry = Boolean(failureMode?.isReEntry);
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
  if (chaotic || reEntry) aggressionLevel = "rebuild";
  else if (cutback || lowEnergy || highStress || lowConfidence || simplifyBias || volumePct < 100) aggressionLevel = "controlled";
  else if (volumePct > 100 || ["race_prep_dominant", "strength_dominant"].includes(architecture)) aggressionLevel = "progressive";

  let recoveryBias = "moderate";
  if (chaotic || reEntry || cutback || lowEnergy || highStress) recoveryBias = "high";
  else if (aggressionLevel === "progressive") recoveryBias = "low";

  let volumeBias = "baseline";
  if (cutback || volumePct < 100) volumeBias = "reduced";
  else if (volumePct > 100) volumeBias = "expanded";

  let performanceBias = "moderate";
  if (recoveryBias === "high") performanceBias = "low";
  else if (["race_prep_dominant", "strength_dominant"].includes(architecture) && aggressionLevel === "progressive") performanceBias = "high";

  const focus = weekTemplate?.label
    || blockIntent?.prioritized
    || primaryGoal?.name
    || "Consistency and execution";
  const primaryCategory = primaryGoal?.category || "running";
  const weeklyConstraints = dedupeStrings([
    ...(constraints || []),
    weekTemplate?.cutback ? "Cutback week" : "",
    chaotic ? "Salvage mode is active this week" : "",
    reEntry ? "Re-entry week: protect momentum first" : "",
    weeklyCheckin?.blocker ? `Weekly blocker: ${String(weeklyCheckin.blocker).replace(/_/g, " ")}` : "",
    environmentSelection?.scope === "week" ? `${String(environmentSelection?.mode || "custom").replace(/_/g, " ")} environment this week` : "",
    volumePct !== 100 ? `Volume set to ${volumePct}%` : "",
  ]);
  const nutritionEmphasis = resolveWeeklyNutritionEmphasis({
    primaryCategory,
    architecture,
    recoveryBias,
    performanceBias,
  });
  const status = adjusted ? "adjusted" : "planned";
  const successDefinition = recoveryBias === "high"
    ? "Protect recovery, land the minimum effective work, and keep logging."
    : performanceBias === "high"
    ? "Hit the key quality sessions without sacrificing recovery."
    : "String together repeatable sessions and keep the week stable.";
  const rationale = adjusted
    ? `This week is adjusted around ${focus.toLowerCase()} with a ${aggressionLevel.replace(/_/g, " ")} posture.`
    : `This week is organized around ${focus.toLowerCase()} with a steady planning posture.`;

  return {
    id: `weekly_intent_${weekNumber}`,
    weekNumber,
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
    drivers: dedupeStrings([
      focus,
      blockIntent?.prioritized || "",
      primaryGoal?.name || "",
      volumePct !== 100 ? `volume ${volumePct}%` : "",
      weeklyCheckin?.blocker ? String(weeklyCheckin.blocker).replace(/_/g, " ") : "",
    ]),
    rationale,
  };
};

export const buildPlanWeek = ({
  weekNumber = 1,
  template = {},
  referenceTemplate = null,
  label = "",
  specificity = "high",
  kind = "plan",
  startDate = null,
  endDate = null,
  goals = [],
  architecture = "hybrid_performance",
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
  const weeklyIntent = deriveWeeklyIntent({
    weekNumber,
    weekTemplate: template,
    goals,
    architecture,
    blockIntent,
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
    blockIntent: clonePlainValue(blockIntent || null),
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
  const failureMode = adjustments?.failureMode || null;
  const garminReadiness = adjustments?.garminReadiness || null;
  const deviceSyncAudit = adjustments?.deviceSyncAudit || null;
  const environmentSelection = adjustments?.environmentSelection || null;
  const supplementsPlan = clonePlainValue(
    nutritionPrescription?.supplements
    || context?.supplementPlan
    || []
  );
  const supplementsActual = clonePlainValue(
    supplementLog
    || nutritionLog?.supplementTaken
    || []
  );

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
      phase: resolvedTraining?.week?.phase || baseWeek?.phase || "",
      label: resolvedTraining?.week?.label || baseWeek?.label || "",
      architecture: context?.architecture || "",
      blockIntent: clonePlainValue(context?.blockIntent || null),
      planWeekId: planWeek?.id || "",
      status: planWeek?.status || weeklyIntent?.status || "planned",
      adjusted: Boolean(planWeek?.adjusted || weeklyIntent?.adjusted),
      summary: planWeek?.summary || weeklyIntent?.rationale || "",
      constraints: clonePlainValue(planWeek?.constraints || weeklyIntent?.weeklyConstraints || []),
      successDefinition: weeklyIntent?.successDefinition || "",
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
        recommendation: baseTraining?.recoveryRecommendation || "",
        success: baseTraining?.success || "",
      },
      supplements: {
        plan: supplementsPlan,
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
        prescription: {
          recommendation: resolvedTraining?.recoveryRecommendation || "",
          success: resolvedTraining?.success || "",
          intensityGuidance: resolvedTraining?.intensityGuidance || "",
        },
      },
      supplements: {
        plan: supplementsPlan,
        actual: supplementsActual,
      },
      logging: {
        dateKey,
        status: logging?.sessionStatus || "not_logged",
        dailyCheckin,
        sessionLog,
        nutritionLog,
        supplementLog: supplementsActual,
        hasCheckin: Boolean(dailyCheckin),
        hasSessionLog: Boolean(sessionLog),
        hasNutritionLog: Boolean(nutritionLog),
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

export const composeGoalNativePlan = ({ goals, personalization, momentum, learningLayer, baseWeek }) => {
  const { active } = getGoalBuckets(goals);
  const primary = active[0] || null;
  const secondary = active.slice(1, 3);
  const env = personalization?.travelState?.environmentMode || personalization?.travelState?.access || "home";
  const hasGym = ["full gym", "limited gym"].includes(env);
  const runningGoal = active.find(g => g.category === "running");
  const strengthGoal = active.find(g => g.category === "strength");
  const bodyCompGoal = active.find(g => g.category === "body_comp");
  const raceNear = daysUntil(runningGoal?.targetDate) <= 56;
  const inconsistencyRisk = momentum?.inconsistencyRisk || "medium";
  const lowBandwidth = inconsistencyRisk === "high" || learningLayer?.adjustmentBias === "simplify";
  const strengthPriority = primary?.category === "strength" && !lowBandwidth;
  const bodyCompActive = !!bodyCompGoal;

  const runningScore = (primary?.category === "running" ? 3 : 0) + (runningGoal ? 2 : 0) + (raceNear ? 2 : 0);
  const strengthScore = (primary?.category === "strength" ? 3 : 0) + (strengthGoal ? 2 : 0) + (hasGym ? 1 : -1);
  const bodyCompScore = (primary?.category === "body_comp" ? 3 : 0) + (bodyCompGoal ? 2 : 0) + (lowBandwidth ? 1 : 0);

  let architecture = "hybrid_performance";
  if (lowBandwidth) architecture = "maintenance_rebuild";
  else if (runningScore >= Math.max(strengthScore, bodyCompScore) && (raceNear || primary?.category === "running")) architecture = "race_prep_dominant";
  else if (bodyCompScore >= Math.max(runningScore, strengthScore)) architecture = "body_comp_conditioning";
  else if (strengthScore >= Math.max(runningScore, bodyCompScore)) architecture = hasGym ? "strength_dominant" : "hybrid_performance";

  const splits = {
    race_prep_dominant: { run: 4, strength: 2, conditioning: 1, recovery: 1 },
    strength_dominant: { run: 2, strength: 4, conditioning: 1, recovery: 1 },
    body_comp_conditioning: { run: 2, strength: 3, conditioning: 2, recovery: 1 },
    hybrid_performance: { run: 3, strength: 3, conditioning: 1, recovery: 1 },
    maintenance_rebuild: { run: 2, strength: 2, conditioning: 1, recovery: 2 },
  };
  const split = splits[architecture];

  const constraints = [];
  if (!hasGym && strengthGoal) constraints.push("Bench-specific progression constrained by no gym access; using home/limited-equipment substitutes.");
  if (architecture !== "race_prep_dominant" && runningGoal) constraints.push("Running kept supportive/maintenance until running priority or race proximity increases.");
  const why = [
    `Primary goal: ${primary?.name || "none set"}.`,
    `Environment: ${env}.`,
    `Inconsistency risk: ${inconsistencyRisk}.`,
    bodyCompGoal ? "Body-comp goal is active and materially affects split allocation." : null,
    raceNear ? "Race date is near enough to increase running weight." : null,
  ].filter(Boolean);

  const restDay = (label = "Active Recovery") => ({ type: "rest", label, nutri: "rest", isRecoverySlot: true });

  const dayTemplates = {
    race_prep_dominant: {
      1: { type: "run+strength", label: "Quality Run + Strength", run: baseWeek.mon, strSess: baseWeek.str, nutri: "hardRun" },
      2: { type: "conditioning", label: "Conditioning / OTF", nutri: "otf" },
      3: { type: "strength+prehab", label: "Strength + Prehab", strSess: baseWeek.str === "A" ? "B" : "A", nutri: "strength" },
      4: { type: "hard-run", label: `${baseWeek.thu?.t || "Tempo"} Run`, run: baseWeek.thu, nutri: "hardRun" },
      5: { type: "easy-run", label: "Easy Run", run: baseWeek.fri, nutri: "easyRun" },
      6: { type: "long-run", label: "Long Run", run: baseWeek.sat, nutri: "longRun" },
      0: restDay("Active Recovery"),
    },
    strength_dominant: {
      1: { type: "strength+prehab", label: "Strength Priority A", strSess: "A", nutri: "strength" },
      2: { type: "easy-run", label: "Supportive Conditioning Run", run: { t: "Easy", d: "20-30 min zone-2" }, nutri: "easyRun" },
      3: { type: "strength+prehab", label: "Strength Priority B", strSess: "B", nutri: "strength" },
      4: { type: "strength+prehab", label: "Upper Push/Pull Strength", strSess: "A", nutri: "strength" },
      5: { type: "easy-run", label: "Conditioning Support", run: { t: "Easy", d: "20-25 min + strides optional" }, nutri: "easyRun" },
      6: { type: "strength+prehab", label: "Full-Body Strength", strSess: "B", nutri: "strength" },
      0: restDay("Active Recovery"),
    },
    body_comp_conditioning: {
      1: { type: "strength+prehab", label: "Metabolic Strength A", strSess: "A", nutri: "strength" },
      2: { type: "easy-run", label: "Conditioning (low-friction)", run: { t: "Easy", d: "25-35 min zone-2" }, nutri: "easyRun" },
      3: { type: "strength+prehab", label: "Metabolic Strength B", strSess: "B", nutri: "strength" },
      4: { type: "conditioning", label: "Conditioning Intervals / OTF", nutri: "otf" },
      5: { type: "strength+prehab", label: "Strength Retention", strSess: "A", nutri: "strength" },
      6: { type: "easy-run", label: "Supportive Run/Walk", run: { t: "Easy", d: "20-30 min" }, nutri: "easyRun" },
      0: restDay("Active Recovery — Steps + Mobility"),
    },
    hybrid_performance: {
      1: { type: "run+strength", label: "Run + Strength", run: baseWeek.mon, strSess: baseWeek.str, nutri: "easyRun" },
      2: { type: "conditioning", label: "Conditioning", nutri: "otf" },
      3: { type: "strength+prehab", label: "Strength B + Prehab", strSess: baseWeek.str === "A" ? "B" : "A", nutri: "strength" },
      4: { type: "hard-run", label: `${baseWeek.thu?.t || "Tempo"} Run`, run: baseWeek.thu, nutri: "hardRun" },
      5: { type: "strength+prehab", label: "Strength Focus", strSess: baseWeek.str, nutri: "strength" },
      6: { type: "easy-run", label: "Supportive Endurance", run: baseWeek.fri, nutri: "easyRun" },
      0: restDay("Active Recovery"),
    },
    maintenance_rebuild: {
      1: { type: "strength+prehab", label: "Short Version Strength", strSess: "A", nutri: "strength" },
      2: restDay("Active Recovery — Walk"),
      3: { type: "easy-run", label: "Short Conditioning", run: { t: "Easy", d: "20-25 min" }, nutri: "easyRun" },
      4: { type: "strength+prehab", label: "Short Version Strength B", strSess: "B", nutri: "strength" },
      5: restDay("Active Recovery"),
      6: { type: "conditioning", label: "Optional Conditioning", nutri: "easyRun" },
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
      return [day, nextSession];
    }));
    return out;
  };

  const annotatedTemplates = annotateTemplate(dayTemplates[architecture]);
  let strengthSessionsPerWeek = Object.values(annotatedTemplates).filter(s => ["run+strength", "strength+prehab"].includes(s?.type)).length;
  if (strengthGoal && strengthSessionsPerWeek < 1) {
    annotatedTemplates[3] = { type: "strength+prehab", label: "Minimum Strength Touchpoint (Short Strength)", strSess: "A", nutri: "strength", strengthDose: "20-30 min maintenance strength" };
    strengthSessionsPerWeek = 1;
  }

  const maintainedGoals = active
    .filter(g => g.id !== primary?.id && g.category !== "injury_prevention")
    .slice(0, 2)
    .map(g => g.name);
  const minimizedGoal = active.find(g => g.category === "injury_prevention")?.name || "non-primary volume";
  const blockIntent = {
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
    unlockMessage: !hasGym && strengthGoal ? "When gym access returns, bench-specific progression can move from foundation mode to direct loading." : "",
    dayTemplates: annotatedTemplates,
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
      referenceTemplate: referenceTemplate || template,
      label: `${template?.phase || "BASE"} - Week ${absoluteWeek}`,
      specificity: getSpecificityBand(idx),
      kind: "plan",
      startDate,
      endDate,
      goals,
      architecture,
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
  const sessionLen = userProfile.sessionLength || userProfile.session_length || "30";
  let duration = SESSION_DURATIONS[sessionLen] || 30;
  const hasConstraints = (userProfile.constraints || []).length > 0;

  const todayKey = recentActivity.todayKey || new Date().toISOString().split("T")[0];
  const logs = recentActivity.logs || {};
  const fatigue = fatigueSignals.fatigueScore ?? 2;
  const fatigueTrend = fatigueSignals.trend || "stable";
  const momentum = fatigueSignals.momentum || "stable";
  const injuryLevel = fatigueSignals.injuryLevel || "none";
  const planWeek = planningContext?.planWeek || null;
  const weeklyIntent = planningContext?.weeklyIntent || planWeek?.weeklyIntent || null;
  const plannedSession = planningContext?.plannedSession || null;

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
        : "Active Recovery — Walk + Mobility",
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
  if (/strength/.test(plannedSessionType)) sessionType = "strength";
  else if (/run|conditioning/.test(plannedSessionType)) sessionType = "cardio";

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
  if (weeklyIntent?.recoveryBias === "high") {
    intensity = "low";
  } else if (weeklyIntent?.aggressionLevel === "progressive" && !hasConstraints && fatigue <= 3) {
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
  ].filter(Boolean);

  return {
    type: sessionType,
    duration,
    intensity,
    label,
    reason: reasonParts.join(" "),
  };
};
