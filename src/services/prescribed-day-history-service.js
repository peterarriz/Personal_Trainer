import {
  buildProvenanceEvent,
  buildStructuredProvenance,
  normalizeProvenanceEvent,
  PROVENANCE_ACTORS,
} from "./provenance-service.js";

const cloneStructuredValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

export const PRESCRIBED_DAY_HISTORY_VERSION = 2;
export const PRESCRIBED_DAY_DURABILITY = {
  durable: "durable",
  legacyBackfill: "legacy_backfill",
  fallbackDerived: "fallback_derived",
};

export const stripPlannedRecordMetadata = (record = null) => {
  if (!record) return null;
  const next = cloneStructuredValue(record);
  if (!next) return null;
  delete next.capturedAt;
  delete next.updatedAt;
  return next;
};

const normalizeRevisionText = (value = "") => String(value || "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const collectPatternNumbers = (text = "", regex = /$^/) => {
  const values = [];
  String(text || "").replace(regex, (_, numeric) => {
    const parsed = Number(numeric);
    if (Number.isFinite(parsed)) values.push(parsed);
    return _;
  });
  return values;
};

const sumPatternNumbers = (text = "", regex = /$^/) => (
  collectPatternNumbers(text, regex).reduce((sum, value) => sum + value, 0)
);

const extractRunStructureMetrics = (training = null) => {
  const run = training?.run || null;
  const detail = String(run?.d || training?.strengthDuration || training?.fallback || "").trim();
  const totalMinutes = sumPatternNumbers(detail, /(\d+(?:\.\d+)?)\s*min\b/gi);
  const totalMiles = sumPatternNumbers(detail, /(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/gi);
  return {
    runType: normalizeRevisionText(run?.t || ""),
    detailKey: normalizeRevisionText(detail),
    totalMinutes: totalMinutes > 0 ? totalMinutes : null,
    totalMiles: totalMiles > 0 ? Number(totalMiles.toFixed(2)) : null,
    strengthTrack: normalizeRevisionText(training?.strengthTrack || ""),
  };
};

const extractNutritionMaterialMetrics = (nutrition = null) => {
  const prescription = nutrition?.prescription || nutrition || {};
  const targets = prescription?.targets || prescription || {};
  const metric = (value, precision = 0) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? Number(numeric.toFixed(precision)) : null;
  };
  return {
    dayType: normalizeRevisionText(nutrition?.dayType || prescription?.dayType || ""),
    calories: metric(targets?.cal || targets?.calories || prescription?.cal || prescription?.calories || null),
    protein: metric(targets?.p || targets?.protein || prescription?.p || prescription?.protein || null),
    carbs: metric(targets?.c || targets?.carbs || prescription?.c || prescription?.carbs || null),
    fat: metric(targets?.f || targets?.fat || prescription?.f || prescription?.fat || null),
    hydrationOz: metric(targets?.hydrationTargetOz || prescription?.hydrationTargetOz || null),
  };
};

const extractRecoveryMaterialMetrics = (recovery = null) => ({
  state: normalizeRevisionText(recovery?.state || recovery?.mode || ""),
  recommendation: normalizeRevisionText(recovery?.prescription?.recommendation || recovery?.recommendation || recovery?.recoveryLine || ""),
  intensityGuidance: normalizeRevisionText(recovery?.prescription?.intensityGuidance || ""),
  success: normalizeRevisionText(recovery?.prescription?.success || recovery?.success || ""),
});

const extractExplicitUserAdjustmentKey = (plannedDayRecord = null) => (
  Array.isArray(plannedDayRecord?.provenance?.events)
    ? plannedDayRecord.provenance.events
      .filter((event) => event?.actor === PROVENANCE_ACTORS.user)
      .map((event) => [
        normalizeRevisionText(event?.trigger || ""),
        normalizeRevisionText(event?.mutationType || ""),
        normalizeRevisionText(event?.revisionReason || ""),
      ].filter(Boolean).join(":"))
      .filter(Boolean)
      .join("|")
    : ""
);

export const buildMaterialPlannedDaySnapshot = (plannedDayRecord = null) => {
  if (!plannedDayRecord?.dateKey) return null;
  const resolvedTraining = plannedDayRecord?.resolved?.training || plannedDayRecord?.base?.training || null;
  const baseTraining = plannedDayRecord?.base?.training || null;
  return {
    dateKey: plannedDayRecord.dateKey,
    sessionType: normalizeRevisionText(resolvedTraining?.type || baseTraining?.type || ""),
    sessionLabel: normalizeRevisionText(resolvedTraining?.label || baseTraining?.label || ""),
    sessionIdentity: normalizeRevisionText([
      resolvedTraining?.label || baseTraining?.label || "",
      resolvedTraining?.type || baseTraining?.type || "",
      resolvedTraining?.strengthTrack || baseTraining?.strengthTrack || "",
      resolvedTraining?.run?.t || baseTraining?.run?.t || "",
    ].filter(Boolean).join(" ")),
    runStructure: extractRunStructureMetrics(resolvedTraining || baseTraining || null),
    readinessState: normalizeRevisionText(
      plannedDayRecord?.resolved?.recovery?.state
      || resolvedTraining?.readinessState
      || plannedDayRecord?.decision?.mode
      || ""
    ),
    decisionMode: normalizeRevisionText(plannedDayRecord?.decision?.mode || ""),
    nutrition: extractNutritionMaterialMetrics(plannedDayRecord?.resolved?.nutrition || plannedDayRecord?.base?.nutrition || null),
    recovery: extractRecoveryMaterialMetrics(plannedDayRecord?.resolved?.recovery || plannedDayRecord?.base?.recovery || null),
    explicitUserAdjustmentKey: extractExplicitUserAdjustmentKey(plannedDayRecord),
  };
};

const hasDifferenceAtThreshold = (currentValue, nextValue, threshold = 1) => {
  if (!Number.isFinite(currentValue) || !Number.isFinite(nextValue)) return false;
  return Math.abs(Number(nextValue) - Number(currentValue)) >= threshold;
};

export const hasMaterialPlannedDayChange = (currentRecord = null, nextRecord = null) => {
  const current = buildMaterialPlannedDaySnapshot(currentRecord);
  const next = buildMaterialPlannedDaySnapshot(nextRecord);
  if (!current || !next) return current !== next;
  if (current.sessionType !== next.sessionType) return true;
  if (current.sessionIdentity !== next.sessionIdentity || current.sessionLabel !== next.sessionLabel) return true;
  if (current.runStructure?.runType !== next.runStructure?.runType) return true;
  if (hasDifferenceAtThreshold(current.runStructure?.totalMinutes, next.runStructure?.totalMinutes, 5)) return true;
  if (hasDifferenceAtThreshold(current.runStructure?.totalMiles, next.runStructure?.totalMiles, 0.5)) return true;
  if (
    current.runStructure?.detailKey !== next.runStructure?.detailKey
    && !Number.isFinite(current.runStructure?.totalMinutes)
    && !Number.isFinite(next.runStructure?.totalMinutes)
    && !Number.isFinite(current.runStructure?.totalMiles)
    && !Number.isFinite(next.runStructure?.totalMiles)
  ) return true;
  if (current.runStructure?.strengthTrack !== next.runStructure?.strengthTrack) return true;
  if (current.readinessState !== next.readinessState || current.decisionMode !== next.decisionMode) return true;
  if (current.nutrition?.dayType !== next.nutrition?.dayType) return true;
  if (hasDifferenceAtThreshold(current.nutrition?.calories, next.nutrition?.calories, 100)) return true;
  if (hasDifferenceAtThreshold(current.nutrition?.protein, next.nutrition?.protein, 15)) return true;
  if (hasDifferenceAtThreshold(current.nutrition?.carbs, next.nutrition?.carbs, 15)) return true;
  if (hasDifferenceAtThreshold(current.nutrition?.fat, next.nutrition?.fat, 15)) return true;
  if (hasDifferenceAtThreshold(current.nutrition?.hydrationOz, next.nutrition?.hydrationOz, 12)) return true;
  if (JSON.stringify(current.recovery || {}) !== JSON.stringify(next.recovery || {})) return true;
  if (current.explicitUserAdjustmentKey !== next.explicitUserAdjustmentKey) return true;
  return false;
};

export const getStableCaptureAtForDate = (dateKey = "") => {
  const parsed = new Date(`${dateKey}T12:00:00`).getTime();
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

const isPrescribedDayHistoryEntry = (entry = null) => Boolean(
  entry
  && typeof entry === "object"
  && Array.isArray(entry.revisions)
  && Number(entry.historyVersion || 0) >= 1
);

const inferProvenanceActorFromDurability = (durability = "", sourceType = "") => {
  if (durability === PRESCRIBED_DAY_DURABILITY.legacyBackfill) return PROVENANCE_ACTORS.migration;
  if (durability === PRESCRIBED_DAY_DURABILITY.fallbackDerived) return PROVENANCE_ACTORS.fallback;
  if (/ai/i.test(sourceType || "")) return PROVENANCE_ACTORS.aiInterpretation;
  return PROVENANCE_ACTORS.deterministicEngine;
};

const buildPrescribedRevisionProvenance = ({
  sourceType = "plan_day_engine",
  durability = PRESCRIBED_DAY_DURABILITY.durable,
  reason = "daily_decision_capture",
  capturedAt = Date.now(),
  plannedDayRecord = null,
} = {}) => {
  const actor = inferProvenanceActorFromDurability(durability, sourceType);
  return buildProvenanceEvent({
    actor,
    trigger: sourceType || "plan_day_engine",
    mutationType: "prescribed_day_revision",
    revisionReason: String(reason || "daily_decision_capture").replace(/_/g, " "),
    sourceInputs: [
      sourceType || "plan_day_engine",
      durability || PRESCRIBED_DAY_DURABILITY.durable,
      plannedDayRecord?.provenance?.summary ? "plan_day_provenance" : "",
    ],
    confidence: actor === PROVENANCE_ACTORS.fallback ? "low" : actor === PROVENANCE_ACTORS.migration ? "medium" : "high",
    timestamp: capturedAt,
    details: {
      sourceType,
      durability,
      planDayId: plannedDayRecord?.id || "",
      decisionMode: plannedDayRecord?.decision?.mode || "",
    },
  });
};

export const getCurrentPrescribedDayRevision = (entry = null) => {
  if (!entry) return null;
  if (!isPrescribedDayHistoryEntry(entry)) {
    return entry?.dateKey ? {
      revisionId: entry?.revisionId || `${entry.dateKey}_rev_1`,
      revisionNumber: Number(entry?.revisionNumber || 1),
      capturedAt: entry?.capturedAt || entry?.updatedAt || null,
      durability: entry?.durability || (entry?.source === "legacy_schedule_helper" ? PRESCRIBED_DAY_DURABILITY.fallbackDerived : PRESCRIBED_DAY_DURABILITY.durable),
      sourceType: entry?.source || "legacy_single_snapshot",
      reason: entry?.reason || "legacy_single_snapshot",
      provenance: normalizeProvenanceEvent(entry?.provenance || null, {
        actor: inferProvenanceActorFromDurability(entry?.durability, entry?.source),
        trigger: entry?.source || "legacy_single_snapshot",
        mutationType: "prescribed_day_revision",
        revisionReason: entry?.reason || "legacy_single_snapshot",
        sourceInputs: [entry?.source || "legacy_single_snapshot"],
        timestamp: entry?.capturedAt || entry?.updatedAt || Date.now(),
        details: {
          durability: entry?.durability || PRESCRIBED_DAY_DURABILITY.durable,
        },
      }),
      record: entry,
    } : null;
  }
  const revisions = Array.isArray(entry.revisions) ? entry.revisions : [];
  if (!revisions.length) return null;
  const matched = revisions.find((revision) => revision?.revisionId === entry.currentRevisionId);
  return matched || revisions[revisions.length - 1] || null;
};

export const getCurrentPrescribedDayRecord = (entry = null) => {
  const revision = getCurrentPrescribedDayRevision(entry);
  return revision?.record || null;
};

const buildPrescribedDayRevision = ({
  plannedDayRecord = null,
  revisionNumber = 1,
  capturedAt = Date.now(),
  sourceType = "plan_day_engine",
  durability = PRESCRIBED_DAY_DURABILITY.durable,
  reason = "daily_decision_capture",
} = {}) => {
  if (!plannedDayRecord?.dateKey) return null;
  return {
    revisionId: `${plannedDayRecord.dateKey}_rev_${revisionNumber}_${capturedAt}`,
    revisionNumber,
    capturedAt,
    sourceType,
    durability,
    reason,
    provenance: buildPrescribedRevisionProvenance({
      sourceType,
      durability,
      reason,
      capturedAt,
      plannedDayRecord,
    }),
    record: {
      ...cloneStructuredValue(plannedDayRecord),
      capturedAt,
      updatedAt: capturedAt,
    },
  };
};

export const createPrescribedDayHistoryEntry = ({
  plannedDayRecord = null,
  capturedAt = Date.now(),
  sourceType = "plan_day_engine",
  durability = PRESCRIBED_DAY_DURABILITY.durable,
  reason = "daily_decision_capture",
  validateInvariant = null,
} = {}) => {
  if (!plannedDayRecord?.dateKey) return null;
  const revision = buildPrescribedDayRevision({
    plannedDayRecord,
    revisionNumber: 1,
    capturedAt,
    sourceType,
    durability,
    reason,
  });
  if (!revision) return null;
  const nextEntry = {
    model: "prescribed_day_history",
    historyVersion: PRESCRIBED_DAY_HISTORY_VERSION,
    dateKey: plannedDayRecord.dateKey,
    firstCapturedAt: capturedAt,
    lastCapturedAt: capturedAt,
    currentRevisionId: revision.revisionId,
    revisions: [revision],
    provenance: buildStructuredProvenance({
      keyDrivers: plannedDayRecord?.provenance?.keyDrivers || [],
      events: [revision.provenance],
      summary: plannedDayRecord?.provenance?.summary || revision?.reason || "",
    }),
  };
  if (typeof validateInvariant === "function") {
    validateInvariant(nextEntry, plannedDayRecord.dateKey, "createPrescribedDayHistoryEntry");
  }
  return nextEntry;
};

export const normalizePrescribedDayHistoryEntry = (dateKey = "", entry = null) => {
  if (!dateKey || !entry) return null;
  if (isPrescribedDayHistoryEntry(entry)) {
    const revisions = (entry.revisions || [])
      .map((revision, idx) => {
        const record = revision?.record || null;
        if (!record?.dateKey) return null;
        return {
          revisionId: revision?.revisionId || `${record.dateKey}_rev_${idx + 1}_${revision?.capturedAt || entry?.lastCapturedAt || Date.now()}`,
          revisionNumber: Number(revision?.revisionNumber || (idx + 1)),
          capturedAt: revision?.capturedAt || entry?.lastCapturedAt || Date.now(),
          sourceType: revision?.sourceType || record?.source || "plan_day_engine",
          durability: revision?.durability || record?.durability || (record?.source === "legacy_schedule_helper" ? PRESCRIBED_DAY_DURABILITY.fallbackDerived : PRESCRIBED_DAY_DURABILITY.durable),
          reason: revision?.reason || "history_normalized",
          provenance: normalizeProvenanceEvent(revision?.provenance || record?.provenance || null, {
            actor: inferProvenanceActorFromDurability(revision?.durability || record?.durability, revision?.sourceType || record?.source),
            trigger: revision?.sourceType || record?.source || "plan_day_engine",
            mutationType: "prescribed_day_revision",
            revisionReason: revision?.reason || "history_normalized",
            sourceInputs: [revision?.sourceType || record?.source || "plan_day_engine"],
            timestamp: revision?.capturedAt || entry?.lastCapturedAt || Date.now(),
            details: {
              durability: revision?.durability || record?.durability || PRESCRIBED_DAY_DURABILITY.durable,
            },
          }),
          record: {
            ...cloneStructuredValue(record),
            capturedAt: record?.capturedAt || revision?.capturedAt || entry?.lastCapturedAt || Date.now(),
            updatedAt: record?.updatedAt || revision?.capturedAt || entry?.lastCapturedAt || Date.now(),
          },
        };
      })
      .filter(Boolean)
      .sort((a, b) => Number(a.revisionNumber || 0) - Number(b.revisionNumber || 0));
    if (!revisions.length) return null;
    const currentRevision = revisions.find((revision) => revision.revisionId === entry.currentRevisionId) || revisions[revisions.length - 1];
    return {
      model: "prescribed_day_history",
      historyVersion: PRESCRIBED_DAY_HISTORY_VERSION,
      dateKey,
      firstCapturedAt: entry?.firstCapturedAt || revisions[0]?.capturedAt || Date.now(),
      lastCapturedAt: entry?.lastCapturedAt || currentRevision?.capturedAt || Date.now(),
      currentRevisionId: currentRevision?.revisionId || revisions[revisions.length - 1]?.revisionId,
      revisions,
      provenance: buildStructuredProvenance({
        keyDrivers: currentRevision?.record?.provenance?.keyDrivers || entry?.provenance?.keyDrivers || [],
        events: revisions.map((revision) => revision?.provenance).filter(Boolean),
        summary: currentRevision?.record?.provenance?.summary || entry?.provenance?.summary || currentRevision?.reason || "",
      }),
    };
  }
  const capturedAt = entry?.capturedAt || entry?.updatedAt || Date.now();
  return createPrescribedDayHistoryEntry({
    plannedDayRecord: { ...cloneStructuredValue(entry), dateKey: entry?.dateKey || dateKey },
    capturedAt,
    sourceType: entry?.source || "legacy_single_snapshot",
    durability: entry?.durability || (entry?.source === "legacy_schedule_helper" ? PRESCRIBED_DAY_DURABILITY.fallbackDerived : PRESCRIBED_DAY_DURABILITY.durable),
    reason: "legacy_single_snapshot_normalized",
  });
};

export const upsertPrescribedDayHistoryEntry = ({
  dateKey = "",
  existingEntry = null,
  plannedDayRecord = null,
  capturedAt = Date.now(),
  sourceType = "plan_day_engine",
  durability = PRESCRIBED_DAY_DURABILITY.durable,
  reason = "daily_decision_capture",
  validateInvariant = null,
} = {}) => {
  if (!dateKey || !plannedDayRecord?.dateKey) return { nextEntry: normalizePrescribedDayHistoryEntry(dateKey, existingEntry), changed: false };
  const normalizedExisting = normalizePrescribedDayHistoryEntry(dateKey, existingEntry);
  if (!normalizedExisting) {
    const nextEntry = createPrescribedDayHistoryEntry({ plannedDayRecord, capturedAt, sourceType, durability, reason, validateInvariant });
    if (typeof validateInvariant === "function") {
      validateInvariant(nextEntry, dateKey, "upsertPrescribedDayHistoryEntry.create");
    }
    return {
      nextEntry,
      changed: true,
    };
  }
  const currentRecord = getCurrentPrescribedDayRecord(normalizedExisting);
  const currentComparable = JSON.stringify(stripPlannedRecordMetadata(currentRecord) || null);
  const nextComparable = JSON.stringify(stripPlannedRecordMetadata(plannedDayRecord) || null);
  if (currentComparable === nextComparable || !hasMaterialPlannedDayChange(currentRecord, plannedDayRecord)) {
    return {
      nextEntry: normalizedExisting,
      changed: !isPrescribedDayHistoryEntry(existingEntry),
    };
  }
  const nextRevisionNumber = Number(normalizedExisting?.revisions?.[normalizedExisting.revisions.length - 1]?.revisionNumber || 0) + 1;
  const nextRevision = buildPrescribedDayRevision({
    plannedDayRecord,
    revisionNumber: nextRevisionNumber,
    capturedAt,
    sourceType,
    durability,
    reason,
  });
  const nextRevisions = [...(normalizedExisting.revisions || []), nextRevision].slice(-16);
  const nextEntry = {
    ...normalizedExisting,
    lastCapturedAt: capturedAt,
    currentRevisionId: nextRevision.revisionId,
    revisions: nextRevisions,
    provenance: buildStructuredProvenance({
      keyDrivers: plannedDayRecord?.provenance?.keyDrivers || normalizedExisting?.provenance?.keyDrivers || [],
      events: nextRevisions.map((revision) => revision?.provenance).filter(Boolean),
      summary: plannedDayRecord?.provenance?.summary || normalizedExisting?.provenance?.summary || nextRevision?.reason || "",
    }),
  };
  if (typeof validateInvariant === "function") {
    validateInvariant(nextEntry, dateKey, "upsertPrescribedDayHistoryEntry.update");
  }
  return {
    nextEntry,
    changed: true,
  };
};

export const buildPlanReference = (plannedDayEntry = null) => {
  const revision = getCurrentPrescribedDayRevision(plannedDayEntry);
  const plannedDayRecord = revision?.record || getCurrentPrescribedDayRecord(plannedDayEntry);
  if (!plannedDayRecord?.dateKey) return null;
  return {
    planDayId: plannedDayRecord.id || `plan_day_${plannedDayRecord.dateKey}`,
    dateKey: plannedDayRecord.dateKey,
    source: plannedDayRecord.source || revision?.sourceType || "planned_day_record",
    capturedAt: revision?.capturedAt || plannedDayRecord.capturedAt || null,
    updatedAt: plannedDayRecord.updatedAt || revision?.capturedAt || null,
    decisionMode: plannedDayRecord?.decision?.mode || "",
    modifiedFromBase: Boolean(plannedDayRecord?.decision?.modifiedFromBase),
    revisionId: revision?.revisionId || "",
    revisionNumber: Number(revision?.revisionNumber || 1),
    durability: revision?.durability || plannedDayRecord?.durability || PRESCRIBED_DAY_DURABILITY.durable,
    provenance: normalizeProvenanceEvent(revision?.provenance || plannedDayRecord?.provenance || null, {
      actor: inferProvenanceActorFromDurability(revision?.durability || plannedDayRecord?.durability, revision?.sourceType || plannedDayRecord?.source),
      trigger: revision?.sourceType || plannedDayRecord?.source || "planned_day_record",
      mutationType: "plan_reference",
      revisionReason: revision?.reason || "",
      sourceInputs: ["plannedDayRecords"],
      timestamp: revision?.capturedAt || plannedDayRecord?.updatedAt || Date.now(),
      details: {
        decisionMode: plannedDayRecord?.decision?.mode || "",
      },
    }),
  };
};
