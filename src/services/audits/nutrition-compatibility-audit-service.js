import { composeGoalNativePlan } from "../../modules-planning.js";
import {
  deriveAdaptiveNutrition,
  normalizeActualNutritionLog,
} from "../../modules-nutrition.js";
import { deriveCanonicalAthleteState } from "../canonical-athlete-service.js";
import { getCurrentPrescribedDayRecord } from "../prescribed-day-history-service.js";
import {
  getNutritionDayTypeLabel,
  isHardNutritionDayType,
  isLongEnduranceNutritionDayType,
  normalizeNutritionDayType,
} from "../nutrition-day-taxonomy-service.js";
import {
  buildPeterAuditGoalFixture,
  PETER_AUDIT_REFERENCE_DATE,
} from "./peter-audit-fixture.js";
import {
  buildPeterTwelveWeekPlanAudit,
  PETER_AUDIT_WEEK_TEMPLATES,
} from "./peter-plan-audit-service.js";

export const NUTRITION_COMPATIBILITY_AUDIT_MODEL = "nutrition_compatibility_audit";
export const NUTRITION_COMPATIBILITY_AUDIT_VERSION = 1;

export const NUTRITION_AUDIT_LANES = Object.freeze({
  hardRun: "hard_run",
  longRun: "long_run",
  strength: "strength",
  recovery: "recovery",
});

export const MODERATE_CUT_COMPATIBILITY_THRESHOLDS = Object.freeze({
  hardVsRecoveryCalGap: 200,
  hardVsRecoveryCarbGap: 60,
  longVsHardCalGap: 150,
  longVsHardCarbGap: 25,
  retentionProteinFloor: 170,
  highDemandHydrationGap: 12,
});

const LANE_LABELS = Object.freeze({
  [NUTRITION_AUDIT_LANES.hardRun]: "Hard run",
  [NUTRITION_AUDIT_LANES.longRun]: "Long run",
  [NUTRITION_AUDIT_LANES.strength]: "Strength",
  [NUTRITION_AUDIT_LANES.recovery]: "Recovery",
});

const SEVERITY_ORDER = Object.freeze({
  high: 3,
  medium: 2,
  low: 1,
});

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const toFiniteNumber = (value, fallback = null) => {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
};

const toDateKey = (value = "") => {
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const next = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(next.getTime()) ? "" : next.toISOString().split("T")[0];
};

const previousDateKey = (dateKey = "") => {
  const safeDateKey = toDateKey(dateKey);
  if (!safeDateKey) return "";
  const next = new Date(`${safeDateKey}T12:00:00`);
  next.setDate(next.getDate() - 1);
  return next.toISOString().split("T")[0];
};

const formatHydrationEvidence = (day = null) => {
  if (!day) return "";
  if (Number.isFinite(day?.targets?.hydrationTargetOz)) return `${Math.round(day.targets.hydrationTargetOz)} oz explicit`;
  if (Number.isFinite(day?.suggestedHydrationTargetOz)) return `not explicit; Nutrition tab would suggest ~${Math.round(day.suggestedHydrationTargetOz)} oz`;
  return "not explicit";
};

const buildSuggestedHydrationTargetOz = ({
  laneKey = "",
  sessionType = "",
  dayType = "",
  bodyweightLb = 0,
} = {}) => {
  const corpus = `${laneKey} ${sessionType} ${dayType}`.toLowerCase();
  const intensityBonus = /hard_run|long_run|hard-run|long-run|run_quality|run_long/.test(corpus)
    ? 30
    : /strength|strength_support/.test(corpus)
    ? 18
    : 8;
  return Math.max(80, Math.round((Number(bodyweightLb || 0) * 0.5) + intensityBonus));
};

const normalizeRepresentativeDay = ({
  laneKey = "",
  sessionType = "",
  sessionLabel = "",
  dayType = "",
  targets = {},
  phaseMode = "",
  adjustmentReasons = [],
  bodyweightLb = 0,
} = {}) => {
  const normalizedDayType = normalizeNutritionDayType(dayType);
  const normalizedTargets = {
    cal: toFiniteNumber(targets?.cal, null),
    c: toFiniteNumber(targets?.c, null),
    p: toFiniteNumber(targets?.p, null),
    f: toFiniteNumber(targets?.f, null),
    hydrationTargetOz: toFiniteNumber(targets?.hydrationTargetOz, null),
  };
  return {
    laneKey,
    laneLabel: LANE_LABELS[laneKey] || sanitizeText(laneKey, 80),
    sessionType: sanitizeText(sessionType, 80),
    sessionLabel: sanitizeText(sessionLabel, 160),
    dayType: normalizedDayType,
    dayTypeLabel: getNutritionDayTypeLabel(normalizedDayType),
    phaseMode: sanitizeText(phaseMode, 40),
    targets: normalizedTargets,
    explicitHydrationTarget: Number.isFinite(normalizedTargets.hydrationTargetOz),
    suggestedHydrationTargetOz: buildSuggestedHydrationTargetOz({
      laneKey,
      sessionType,
      dayType: normalizedDayType,
      bodyweightLb,
    }),
    adjustmentReasons: (adjustmentReasons || []).map((reason) => sanitizeText(reason, 160)).filter(Boolean),
  };
};

const sortRiskFlags = (flags = []) => (
  [...(flags || [])].sort((left, right) => {
    const severityDelta = (SEVERITY_ORDER[right?.severity] || 0) - (SEVERITY_ORDER[left?.severity] || 0);
    if (severityDelta !== 0) return severityDelta;
    return String(left?.key || "").localeCompare(String(right?.key || ""));
  })
);

const pushRisk = (flags = [], risk = null) => {
  if (!risk?.key) return flags;
  return [
    ...flags,
    {
      key: sanitizeText(risk.key, 80),
      severity: ["high", "medium", "low"].includes(risk.severity) ? risk.severity : "low",
      area: sanitizeText(risk.area, 80),
      finding: sanitizeText(risk.finding, 320),
      evidence: sanitizeText(risk.evidence, 320),
    },
  ];
};

const buildRiskEvidence = (label = "", currentValue = null, compareLabel = "", compareValue = null, unit = "") => (
  `${label} ${currentValue}${unit}${compareLabel ? ` vs ${compareLabel} ${compareValue}${unit}` : ""}`.trim()
);

const resolveProteinFloor = ({ bodyweightLb = 0 } = {}) => (
  Math.max(
    MODERATE_CUT_COMPATIBILITY_THRESHOLDS.retentionProteinFloor,
    Math.round(Number(bodyweightLb || 0) * 0.9)
  )
);

const extractNutritionPrescriptionFromRecord = (entry = null) => {
  const record = getCurrentPrescribedDayRecord(entry) || entry || null;
  return (
    record?.resolved?.nutrition?.prescription
    || record?.base?.nutrition?.prescription
    || record?.nutrition?.prescription
    || null
  );
};

const buildSequentialExecutionRisks = ({
  plannedDayRecords = {},
  nutritionActualLogs = {},
} = {}) => {
  let flags = [];
  const qualityPairs = [];

  Object.keys(plannedDayRecords || {})
    .sort()
    .forEach((dateKey) => {
      const prescription = extractNutritionPrescriptionFromRecord(plannedDayRecords?.[dateKey]);
      const normalizedDayType = normalizeNutritionDayType(prescription?.dayType || "");
      if (!isHardNutritionDayType(normalizedDayType) && !isLongEnduranceNutritionDayType(normalizedDayType)) return;
      const priorDateKey = previousDateKey(dateKey);
      const priorActual = normalizeActualNutritionLog({
        dateKey: priorDateKey,
        feedback: nutritionActualLogs?.[priorDateKey] || {},
      });
      if (priorActual?.deviationKind === "under_fueled" || String(priorActual?.issue || "").toLowerCase() === "hunger") {
        qualityPairs.push(`${priorDateKey} -> ${dateKey}`);
      }
    });

  if (qualityPairs.length) {
    flags = pushRisk(flags, {
      key: "under_fueled_before_quality_day",
      severity: qualityPairs.length >= 2 ? "high" : "medium",
      area: "execution",
      finding: "Recent logs show under-fueling on the day before a hard or long run, which raises the risk that quality-session targets are directionally correct but not actually protected in execution.",
      evidence: `Flagged sequence${qualityPairs.length > 1 ? "s" : ""}: ${qualityPairs.join(", ")}`,
    });
  }

  return flags;
};

const buildCompatibilityRisks = ({
  representativeDays = [],
  bodyweightLb = 0,
  auditContext = {},
} = {}) => {
  let flags = [];
  const byLane = Object.fromEntries((representativeDays || []).map((day) => [day.laneKey, day]));
  const hardRun = byLane[NUTRITION_AUDIT_LANES.hardRun] || null;
  const longRun = byLane[NUTRITION_AUDIT_LANES.longRun] || null;
  const strength = byLane[NUTRITION_AUDIT_LANES.strength] || null;
  const recovery = byLane[NUTRITION_AUDIT_LANES.recovery] || null;
  const proteinFloor = resolveProteinFloor({ bodyweightLb });

  Object.values(NUTRITION_AUDIT_LANES).forEach((laneKey) => {
    if (!byLane[laneKey]) {
      flags = pushRisk(flags, {
        key: `missing_${laneKey}_representative_day`,
        severity: "medium",
        area: "coverage",
        finding: `The audit could not find a representative ${LANE_LABELS[laneKey] || laneKey} prescription in the current plan snapshot.`,
        evidence: `Missing lane: ${laneKey}`,
      });
    }
  });

  if (hardRun && recovery) {
    if (
      Number.isFinite(hardRun.targets.c)
      && Number.isFinite(recovery.targets.c)
      && hardRun.targets.c < recovery.targets.c + MODERATE_CUT_COMPATIBILITY_THRESHOLDS.hardVsRecoveryCarbGap
    ) {
      flags = pushRisk(flags, {
        key: "hard_run_carbs_not_high_enough_above_recovery",
        severity: "high",
        area: "carbs",
        finding: "Hard-run carbs are not meaningfully separated from recovery-day carbs, which weakens pre-quality and post-quality fueling support.",
        evidence: buildRiskEvidence("hard run", hardRun.targets.c, "recovery", recovery.targets.c, "g carbs"),
      });
    }
    if (
      Number.isFinite(hardRun.targets.cal)
      && Number.isFinite(recovery.targets.cal)
      && hardRun.targets.cal < recovery.targets.cal + MODERATE_CUT_COMPATIBILITY_THRESHOLDS.hardVsRecoveryCalGap
    ) {
      flags = pushRisk(flags, {
        key: "hard_run_calories_not_high_enough_above_recovery",
        severity: "high",
        area: "calories",
        finding: "Hard-run calories sit too close to recovery calories for a moderate cut that is still supposed to retain quality-session performance.",
        evidence: buildRiskEvidence("hard run", hardRun.targets.cal, "recovery", recovery.targets.cal, " kcal"),
      });
    }
  }

  if (longRun && hardRun) {
    if (
      Number.isFinite(longRun.targets.c)
      && Number.isFinite(hardRun.targets.c)
      && longRun.targets.c < hardRun.targets.c + MODERATE_CUT_COMPATIBILITY_THRESHOLDS.longVsHardCarbGap
    ) {
      flags = pushRisk(flags, {
        key: "long_run_carbs_not_high_enough_above_hard_run",
        severity: "medium",
        area: "carbs",
        finding: "Long-run carbs are not materially above hard-run carbs, which makes the highest-demand endurance day look under-separated.",
        evidence: buildRiskEvidence("long run", longRun.targets.c, "hard run", hardRun.targets.c, "g carbs"),
      });
    }
    if (
      Number.isFinite(longRun.targets.cal)
      && Number.isFinite(hardRun.targets.cal)
      && longRun.targets.cal < hardRun.targets.cal + MODERATE_CUT_COMPATIBILITY_THRESHOLDS.longVsHardCalGap
    ) {
      flags = pushRisk(flags, {
        key: "long_run_calories_not_high_enough_above_hard_run",
        severity: "medium",
        area: "calories",
        finding: "Long-run calories are not materially above hard-run calories, which weakens the highest-demand fueling day in the stack.",
        evidence: buildRiskEvidence("long run", longRun.targets.cal, "hard run", hardRun.targets.cal, " kcal"),
      });
    }
  }

  [hardRun, longRun, strength, recovery].filter(Boolean).forEach((day) => {
    if (Number.isFinite(day.targets.p) && day.targets.p < proteinFloor) {
      flags = pushRisk(flags, {
        key: `${day.laneKey}_protein_below_retention_floor`,
        severity: day.laneKey === NUTRITION_AUDIT_LANES.strength ? "high" : "medium",
        area: "protein",
        finding: `${day.laneLabel} protein drops below a simple retention floor for a moderate cut with concurrent performance goals.`,
        evidence: `${day.laneLabel} protein ${Math.round(day.targets.p)}g vs floor ${proteinFloor}g`,
      });
    }
  });

  if (hardRun && recovery && Number.isFinite(hardRun.targets.f) && Number.isFinite(recovery.targets.f) && hardRun.targets.f > recovery.targets.f) {
    flags = pushRisk(flags, {
      key: "hard_run_fat_not_pulled_back_relative_to_recovery",
      severity: "low",
      area: "fat",
      finding: "Hard-run fat is not lower than recovery fat, which can crowd carbs on the day that most needs them.",
      evidence: buildRiskEvidence("hard run", hardRun.targets.f, "recovery", recovery.targets.f, "g fat"),
    });
  }

  if (longRun && recovery && Number.isFinite(longRun.targets.f) && Number.isFinite(recovery.targets.f) && longRun.targets.f > recovery.targets.f) {
    flags = pushRisk(flags, {
      key: "long_run_fat_not_pulled_back_relative_to_recovery",
      severity: "low",
      area: "fat",
      finding: "Long-run fat is not lower than recovery fat, which makes the highest-carb day less clearly protected.",
      evidence: buildRiskEvidence("long run", longRun.targets.f, "recovery", recovery.targets.f, "g fat"),
    });
  }

  const highDemandDays = [hardRun, longRun].filter(Boolean);
  const missingExplicitHydration = highDemandDays.filter((day) => !day.explicitHydrationTarget);
  if (missingExplicitHydration.length) {
    flags = pushRisk(flags, {
      key: "high_demand_hydration_targets_not_explicit",
      severity: "medium",
      area: "hydration",
      finding: "Hard and long-run hydration support is not stored explicitly in the nutrition prescription layer; the UI can infer a suggestion later, but the saved target is not durable enough for audit-grade proof.",
      evidence: missingExplicitHydration.map((day) => `${day.laneLabel}: ${formatHydrationEvidence(day)}`).join("; "),
    });
  }

  if (
    hardRun?.explicitHydrationTarget
    && longRun?.explicitHydrationTarget
    && recovery?.explicitHydrationTarget
    && (
      hardRun.targets.hydrationTargetOz < recovery.targets.hydrationTargetOz + MODERATE_CUT_COMPATIBILITY_THRESHOLDS.highDemandHydrationGap
      || longRun.targets.hydrationTargetOz < hardRun.targets.hydrationTargetOz
    )
  ) {
    flags = pushRisk(flags, {
      key: "hydration_targets_not_progressive_with_demand",
      severity: "medium",
      area: "hydration",
      finding: "Stored hydration targets do not step up cleanly as demand rises from recovery to hard and long-run days.",
      evidence: `Recovery ${Math.round(recovery.targets.hydrationTargetOz)} oz, hard run ${Math.round(hardRun.targets.hydrationTargetOz)} oz, long run ${Math.round(longRun.targets.hydrationTargetOz)} oz`,
    });
  }

  if (auditContext?.hasBodyCompGoal && !auditContext?.explicitMaintenanceModel) {
    const evidenceBits = [recovery, hardRun, longRun]
      .filter(Boolean)
      .map((day) => `${day.laneLabel} ${Math.round(day.targets.cal || 0)} kcal`);
    flags = pushRisk(flags, {
      key: "moderate_cut_is_relative_not_first_class",
      severity: "low",
      area: "calories",
      finding: "The audit can infer a moderate cut from day-to-day calorie separation, but the nutrition model does not store an explicit maintenance estimate or weekly deficit target. 'Moderate cut' is still a relative judgment, not a first-class proven mode.",
      evidence: evidenceBits.join(", "),
    });
  }

  return flags;
};

const buildVerdict = (riskFlags = []) => {
  const hasHigh = (riskFlags || []).some((flag) => flag?.severity === "high");
  const hasAny = (riskFlags || []).length > 0;
  if (hasHigh) return "not_compatible";
  if (hasAny) return "compatible_with_gaps";
  return "compatible";
};

export const buildNutritionCompatibilityAudit = ({
  representativeDays = [],
  plannedDayRecords = {},
  nutritionActualLogs = {},
  bodyweightLb = 0,
  auditContext = {},
} = {}) => {
  const normalizedDays = (representativeDays || [])
    .map((day) => normalizeRepresentativeDay({ ...day, bodyweightLb }))
    .filter((day) => Boolean(day?.laneKey));
  const compatibilityRisks = buildCompatibilityRisks({
    representativeDays: normalizedDays,
    bodyweightLb,
    auditContext,
  });
  const executionRisks = buildSequentialExecutionRisks({
    plannedDayRecords,
    nutritionActualLogs,
  });
  const riskFlags = sortRiskFlags([...compatibilityRisks, ...executionRisks]);
  const verdict = buildVerdict(riskFlags);
  const summaryLine = verdict === "compatible"
    ? "Representative hard-run, long-run, strength, and recovery targets are internally compatible with a moderate cut and performance retention."
    : verdict === "compatible_with_gaps"
    ? "Representative targets are directionally compatible, but there are meaningful proof gaps or execution risks."
    : "Representative targets are not internally compatible enough to support a moderate cut with performance retention.";

  return {
    model: NUTRITION_COMPATIBILITY_AUDIT_MODEL,
    version: NUTRITION_COMPATIBILITY_AUDIT_VERSION,
    auditContext: {
      name: sanitizeText(auditContext?.name || "", 120),
      referenceDate: toDateKey(auditContext?.referenceDate || ""),
      hasBodyCompGoal: Boolean(auditContext?.hasBodyCompGoal),
      explicitMaintenanceModel: Boolean(auditContext?.explicitMaintenanceModel),
      planCoverage: auditContext?.planCoverage || null,
    },
    thresholds: MODERATE_CUT_COMPATIBILITY_THRESHOLDS,
    representativeDays: normalizedDays,
    riskFlags,
    verdict,
    summaryLine,
  };
};

const resolveRepresentativeSessions = (dayTemplates = {}) => {
  const entries = Object.values(dayTemplates || {});
  return {
    [NUTRITION_AUDIT_LANES.hardRun]: entries.find((session) => session?.type === "hard-run") || null,
    [NUTRITION_AUDIT_LANES.longRun]: entries.find((session) => session?.type === "long-run") || null,
    [NUTRITION_AUDIT_LANES.strength]: entries.find((session) => /strength/.test(String(session?.type || ""))) || null,
    [NUTRITION_AUDIT_LANES.recovery]: entries.find((session) => session?.type === "rest") || null,
  };
};

const buildRepresentativeDaysFromPeterPlan = () => {
  const fixture = buildPeterAuditGoalFixture();
  const athleteProfile = deriveCanonicalAthleteState({
    goals: fixture.goals,
    personalization: fixture.personalization,
    profileDefaults: { name: fixture.assumptions.profile.name },
  });
  const baseWeek = PETER_AUDIT_WEEK_TEMPLATES[0];
  const composer = composeGoalNativePlan({
    goals: fixture.goals,
    personalization: fixture.personalization,
    athleteProfile,
    momentum: { inconsistencyRisk: "low", momentumState: "stable" },
    learningLayer: {},
    currentWeek: 1,
    baseWeek,
    weekTemplates: PETER_AUDIT_WEEK_TEMPLATES,
    logs: {},
    bodyweights: fixture.bodyweights,
    dailyCheckins: {},
    nutritionActualLogs: {},
    coachActions: [],
    todayKey: fixture.referenceDate,
    currentDayOfWeek: 4,
    plannedDayRecords: {},
    planWeekRecords: {},
  });
  const personalization = {
    ...fixture.personalization,
    travelState: fixture.personalization?.travelState || {},
    environmentConfig: fixture.personalization?.environmentConfig || { schedule: [] },
  };
  const representativeSessions = resolveRepresentativeSessions(composer?.dayTemplates || {});

  return {
    fixture,
    representativeDays: Object.entries(representativeSessions)
      .map(([laneKey, session]) => {
        if (!session) return null;
        const nutritionLayer = deriveAdaptiveNutrition({
          todayWorkout: {
            ...session,
            week: { phase: baseWeek.phase, cutback: Boolean(baseWeek.cutback) },
          },
          goals: fixture.goals,
          momentum: { inconsistencyRisk: "low", momentumState: "stable" },
          personalization,
          bodyweights: fixture.bodyweights,
          learningLayer: {},
          nutritionActualLogs: {},
          coachPlanAdjustments: {},
          salvageLayer: {},
          failureMode: {},
        });
        return {
          laneKey,
          sessionType: session?.type || "",
          sessionLabel: session?.label || "",
          dayType: nutritionLayer?.dayType || session?.nutri || "",
          targets: nutritionLayer?.targets || {},
          phaseMode: nutritionLayer?.phaseMode || "",
          adjustmentReasons: nutritionLayer?.adjustmentReasons || [],
        };
      })
      .filter(Boolean),
  };
};

export const buildPeterNutritionCompatibilityAudit = () => {
  const { fixture, representativeDays } = buildRepresentativeDaysFromPeterPlan();
  const planAudit = buildPeterTwelveWeekPlanAudit();
  const planCoverage = {
    hardRunDays: planAudit.weeks.reduce((sum, week) => sum + week.sessions.filter((session) => session.type === "hard-run").length, 0),
    longRunDays: planAudit.weeks.reduce((sum, week) => sum + week.sessions.filter((session) => session.type === "long-run").length, 0),
    strengthDays: planAudit.weeks.reduce((sum, week) => sum + week.sessions.filter((session) => /strength/.test(String(session.type || ""))).length, 0),
    recoveryDays: planAudit.weeks.reduce((sum, week) => sum + week.sessions.filter((session) => session.type === "rest").length, 0),
  };

  return buildNutritionCompatibilityAudit({
    representativeDays,
    bodyweightLb: fixture.assumptions?.anchors?.bodyweight?.value || 0,
    auditContext: {
      name: "Peter nutrition target audit",
      referenceDate: PETER_AUDIT_REFERENCE_DATE,
      hasBodyCompGoal: true,
      explicitMaintenanceModel: false,
      planCoverage,
    },
  });
};

const renderRepresentativeTargetTable = (representativeDays = []) => {
  const lines = [
    "| Lane | Day type | Calories | Carbs | Protein | Fat | Hydration | Notes |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  (representativeDays || []).forEach((day) => {
    const notes = day.adjustmentReasons?.length
      ? day.adjustmentReasons.join("; ")
      : "No extra audit note";
    lines.push(
      `| ${day.laneLabel} | ${day.dayTypeLabel} (\`${day.dayType}\`) | ${Math.round(day.targets.cal || 0)} kcal | ${Math.round(day.targets.c || 0)}g | ${Math.round(day.targets.p || 0)}g | ${Math.round(day.targets.f || 0)}g | ${formatHydrationEvidence(day)} | ${notes} |`
    );
  });
  return lines.join("\n");
};

const renderRiskTable = (riskFlags = []) => {
  const lines = [
    "| ID | Severity | Area | Finding | Evidence |",
    "| --- | --- | --- | --- | --- |",
  ];
  if (!riskFlags.length) {
    lines.push("| none_detected | low | audit | No deterministic compatibility risks were detected in the current representative targets. | Targets and execution checks passed the current thresholds. |");
    return lines.join("\n");
  }
  riskFlags.forEach((risk) => {
    lines.push(`| \`${risk.key}\` | ${risk.severity} | ${risk.area} | ${risk.finding} | ${risk.evidence} |`);
  });
  return lines.join("\n");
};

export const renderNutritionCompatibilityAuditMarkdown = (audit = null) => {
  const safeAudit = audit || {};
  const planCoverage = safeAudit?.auditContext?.planCoverage || null;
  const coverageLine = planCoverage
    ? `- Plan coverage inspected: ${planCoverage.hardRunDays} hard-run days, ${planCoverage.longRunDays} long-run days, ${planCoverage.strengthDays} strength days, ${planCoverage.recoveryDays} recovery days`
    : "";
  return [
    "# Nutrition Compatibility Audit",
    "",
    safeAudit?.auditContext?.name ? `Reference: ${safeAudit.auditContext.name}` : "",
    safeAudit?.auditContext?.referenceDate ? `Reference date: ${safeAudit.auditContext.referenceDate}` : "",
    coverageLine,
    "",
    "## Summary",
    "",
    safeAudit?.summaryLine || "No audit summary available.",
    "",
    "## Representative Targets",
    "",
    renderRepresentativeTargetTable(safeAudit?.representativeDays || []),
    "",
    "## Risk Table",
    "",
    renderRiskTable(safeAudit?.riskFlags || []),
    "",
  ].filter(Boolean).join("\n");
};
