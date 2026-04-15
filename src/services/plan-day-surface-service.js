import { buildDayPrescriptionDisplay } from "./day-prescription-display-service.js";
import { dedupeStrings } from "../utils/collection-utils.js";

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const normalizeSurfaceId = (value = "") => sanitizeText(value, 40).toLowerCase() || "unknown";

const normalizeAuditValue = (value = "") => sanitizeText(value, 240).toLowerCase();

const mergePlanContextObject = (baseValue = null, overrideValue = null) => {
  const hasBase = Boolean(baseValue && typeof baseValue === "object" && !Array.isArray(baseValue));
  const hasOverride = Boolean(overrideValue && typeof overrideValue === "object" && !Array.isArray(overrideValue));
  if (hasBase && hasOverride) {
    return {
      ...baseValue,
      ...overrideValue,
    };
  }
  return overrideValue || baseValue || null;
};

const resolvePlanContext = ({
  planDay = null,
  plannedDayRecord = null,
  training = null,
  plannedTraining = null,
  week = null,
  provenance = null,
  flags = null,
  decision = null,
  dateKey = "",
} = {}) => {
  const sourceRecord = planDay || plannedDayRecord || null;
  const sourceWeek = sourceRecord?.week || null;
  const mergedWeek = mergePlanContextObject(sourceWeek, week);
  if (mergedWeek) {
    mergedWeek.weeklyIntent = mergePlanContextObject(sourceWeek?.weeklyIntent, week?.weeklyIntent);
    mergedWeek.planWeek = mergePlanContextObject(sourceWeek?.planWeek, week?.planWeek);
    mergedWeek.programBlock = mergePlanContextObject(sourceWeek?.programBlock, week?.programBlock);
    mergedWeek.changeSummary = mergePlanContextObject(sourceWeek?.changeSummary, week?.changeSummary);
    mergedWeek.planningBasis = mergePlanContextObject(sourceWeek?.planningBasis, week?.planningBasis);
  }
  return {
    dateKey: sanitizeText(
      sourceRecord?.dateKey
      || dateKey
      || "",
      40
    ),
    training: sourceRecord?.resolved?.training || training || sourceRecord?.base?.training || plannedTraining || null,
    plannedTraining: sourceRecord?.base?.training || plannedTraining || training || null,
    week: mergedWeek,
    provenance: mergePlanContextObject(sourceRecord?.provenance, provenance),
    flags: mergePlanContextObject(sourceRecord?.flags, flags),
    decision: mergePlanContextObject(sourceRecord?.decision, decision),
  };
};

export const buildCanonicalSurfaceMessaging = ({
  display = null,
  week = null,
  provenance = null,
} = {}) => {
  const planningBasis = week?.planningBasis || week?.planWeek?.planningBasis || null;
  const changeSummary = week?.changeSummary || week?.weeklyIntent?.changeSummary || week?.planWeek?.changeSummary || null;
  const changeSummaryLine = sanitizeText(
    changeSummary?.surfaceLine
    || [changeSummary?.headline, changeSummary?.preserved].filter(Boolean).join(" ")
    || "",
    220
  );
  const planningBasisLine = sanitizeText(
    planningBasis?.todayLine
    || planningBasis?.planBasisExplanation?.todayLine
    || planningBasis?.compromiseLine
    || planningBasis?.planBasisExplanation?.compromiseSummary
    || "",
    220
  );
  const provenanceLine = sanitizeText(
    provenance?.summary
    || "",
    220
  );
  const displayWhy = sanitizeText(display?.why || "", 220);
  const canonicalReasonLine = changeSummaryLine || planningBasisLine || provenanceLine || displayWhy;
  const preferenceAndAdaptationLine = canonicalReasonLine || displayWhy;
  const statusBits = dedupeStrings([
    changeSummary?.inputType === "training_preference" ? "training preference" : "",
    changeSummary?.headline || "",
    changeSummary?.preserved || "",
    planningBasis?.activeProgramName ? `basis ${planningBasis.activeProgramName}` : "",
    planningBasis?.activeStyleName ? `style ${planningBasis.activeStyleName}` : "",
  ]).slice(0, 4);

  return {
    canonicalReasonLine,
    preferenceAndAdaptationLine,
    changeSummaryLine,
    planningBasisLine,
    provenanceLine,
    statusBits,
  };
};

export const buildCanonicalPlanSurfaceModel = ({
  surface = "unknown",
  planDay = null,
  plannedDayRecord = null,
  training = null,
  plannedTraining = null,
  week = null,
  provenance = null,
  flags = null,
  decision = null,
  dateKey = "",
  prescribedExercises = [],
  includeWhy = true,
} = {}) => {
  const context = resolvePlanContext({
    planDay,
    plannedDayRecord,
    training,
    plannedTraining,
    week,
    provenance,
    flags,
    decision,
    dateKey,
  });
  const display = buildDayPrescriptionDisplay({
    training: context.training,
    week: context.week || {},
    provenance: context.provenance || null,
    includeWhy,
    prescribedExercises,
  });
  const plannedDisplay = buildDayPrescriptionDisplay({
    training: context.plannedTraining,
    week: context.week || {},
    provenance: context.provenance || null,
    includeWhy,
    prescribedExercises,
  });
  const messaging = buildCanonicalSurfaceMessaging({
    display,
    week: context.week || null,
    provenance: context.provenance || null,
  });

  return {
    surface: normalizeSurfaceId(surface),
    dateKey: context.dateKey,
    training: context.training,
    plannedTraining: context.plannedTraining,
    week: context.week,
    provenance: context.provenance,
    flags: context.flags,
    decision: context.decision,
    display,
    plannedDisplay,
    ...messaging,
    auditSnapshot: {
      surface: normalizeSurfaceId(surface),
      sessionLabel: display?.sessionLabel || "",
      sessionType: display?.sessionType || "",
      purpose: display?.purpose || "",
      structure: display?.structure || "",
      expectedDuration: display?.expectedDuration || "",
      canonicalReasonLine: messaging.canonicalReasonLine || "",
      preferenceAndAdaptationLine: messaging.preferenceAndAdaptationLine || "",
      changeSummaryLine: messaging.changeSummaryLine || "",
      planningBasisLine: messaging.planningBasisLine || "",
      decisionMode: context.decision?.mode || "",
      modifiedFromBase: Boolean(context.decision?.modifiedFromBase || context.flags?.isModified),
    },
  };
};

export const buildCanonicalPlanSurfaceAudit = ({
  canonicalSurface = null,
  surfaceModels = {},
} = {}) => {
  const normalizedSurfaceModels = Object.fromEntries(
    Object.entries(surfaceModels || {})
      .filter(([, value]) => Boolean(value?.auditSnapshot))
      .map(([key, value]) => [key, value.auditSnapshot])
  );
  const snapshots = Object.values(normalizedSurfaceModels);
  const baseline = canonicalSurface?.auditSnapshot || snapshots[0] || null;
  if (!baseline) {
    return {
      ok: true,
      baseline: null,
      surfaces: normalizedSurfaceModels,
      mismatches: [],
      comparedFields: [],
    };
  }

  const comparedFields = [
    "sessionLabel",
    "sessionType",
    "purpose",
    "structure",
    "expectedDuration",
    "canonicalReasonLine",
    "preferenceAndAdaptationLine",
  ];
  const baselineValues = Object.fromEntries(
    comparedFields.map((field) => [field, normalizeAuditValue(baseline?.[field] || "")])
  );
  const mismatches = [];

  Object.entries(normalizedSurfaceModels).forEach(([surfaceKey, snapshot]) => {
    comparedFields.forEach((field) => {
      const currentValue = normalizeAuditValue(snapshot?.[field] || "");
      if (!baselineValues[field] || !currentValue || baselineValues[field] === currentValue) return;
      mismatches.push({
        surface: surfaceKey,
        field,
        expected: baseline?.[field] || "",
        actual: snapshot?.[field] || "",
      });
    });
  });

  return {
    ok: mismatches.length === 0,
    baseline,
    surfaces: normalizedSurfaceModels,
    mismatches,
    comparedFields,
  };
};
