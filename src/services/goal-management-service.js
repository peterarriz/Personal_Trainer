import { normalizeGoals } from "./canonical-athlete-service.js";
import { projectResolvedGoalToPlanningGoal } from "./goal-resolution-service.js";
import { buildIntakeGoalStackReviewModel } from "./intake-goal-flow-service.js";
import {
  buildProvenanceEvent,
  buildStructuredProvenance,
  describeProvenanceRecord,
  normalizeStructuredProvenance,
  PROVENANCE_ACTORS,
} from "./provenance-service.js";
import { dedupeStrings } from "../utils/collection-utils.js";

export const GOAL_MANAGEMENT_VERSION = 1;

export const GOAL_MANAGEMENT_CHANGE_TYPES = {
  edit: "edit",
  reprioritize: "reprioritize",
  archive: "archive",
  restore: "restore",
};

export const GOAL_ARCHIVE_STATUSES = {
  archived: "archived",
  completed: "completed",
  dropped: "dropped",
};

const FIELD_LABELS = {
  summary: "Goal summary",
  planningCategory: "Goal focus",
  primaryMetric: "Target metric",
  proxyMetrics: "Proxy tracking",
  targetDate: "Exact date",
  targetHorizonWeeks: "Target horizon",
  openEnded: "Open-ended status",
  planningPriority: "Priority",
  status: "Status",
};

const PROVENANCE_FIELDS = [
  "summary",
  "planningCategory",
  "primaryMetric",
  "proxyMetrics",
  "targetDate",
  "targetHorizonWeeks",
  "openEnded",
  "planningPriority",
  "status",
];

const GOAL_TYPE_LABELS = {
  performance: "Event goal",
  running: "Running goal",
  strength: "Strength goal",
  body_comp: "Body-comp goal",
  appearance: "Appearance goal",
  athletic_power: "Athletic-power goal",
  re_entry: "Re-entry goal",
  general_fitness: "General fitness goal",
};

const DEFAULT_GOAL_MANAGEMENT = {
  version: GOAL_MANAGEMENT_VERSION,
  archivedGoals: [],
  history: [],
};

const DEFAULT_RESILIENCE_GOAL = {
  id: "g_resilience",
  name: "Resilience & injury prevention",
  type: "ongoing",
  category: "injury_prevention",
  priority: 4,
  targetDate: "",
  targetHorizonWeeks: null,
  measurableTarget: "",
  active: true,
  status: "active",
  tracking: { mode: "progress_tracker" },
};

const cloneValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const toArray = (value) => (Array.isArray(value) ? value : value == null ? [] : [value]);

const sanitizeText = (value = "", maxLength = 200) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const slugify = (value = "", fallback = "goal") => {
  const cleaned = String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
};

const formatDateLabel = (value = "") => {
  const raw = sanitizeText(value, 24);
  if (!raw) return "";
  const date = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(date.getTime())) return raw;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const toIsoTimestamp = (value = Date.now()) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const toTimestampMs = (value = Date.now()) => {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? Date.now() : date.getTime();
};

const normalizeInteger = (value, fallback = null) => {
  if (value === "" || value == null) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.round(numeric));
};

const isResilienceGoal = (goal = null) => (
  goal?.id === "g_resilience"
  || sanitizeText(goal?.category || "", 40).toLowerCase() === "injury_prevention"
  || sanitizeText(goal?.resolvedGoal?.planningCategory || "", 40).toLowerCase() === "injury_prevention"
);

const normalizeMetric = (metric = null, fallbackKind = "primary") => {
  if (!metric || typeof metric !== "object") return null;
  const label = sanitizeText(metric?.label || metric?.name || "", 120);
  if (!label) return null;
  return {
    key: sanitizeText(metric?.key || slugify(label, fallbackKind), 80).toLowerCase(),
    label,
    unit: sanitizeText(metric?.unit || "", 24),
    targetValue: sanitizeText(metric?.targetValue || metric?.value || "", 80),
    kind: sanitizeText(metric?.kind || fallbackKind, 20).toLowerCase() || fallbackKind,
  };
};

const normalizeProxyMetrics = (metrics = []) => {
  const seen = new Set();
  return toArray(metrics)
    .map((metric) => normalizeMetric(metric, "proxy"))
    .filter((metric) => {
      if (!metric?.label) return false;
      const key = metric.key || metric.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const resolveGoalFamilyForCategory = (category = "", fallbackFamily = "") => {
  const normalizedCategory = sanitizeText(category, 40).toLowerCase();
  const normalizedFallback = sanitizeText(fallbackFamily, 40).toLowerCase();
  if (normalizedCategory === "strength" && normalizedFallback === "athletic_power") return "athletic_power";
  if (normalizedCategory === "strength") return normalizedFallback || "strength";
  if (normalizedCategory === "running") return normalizedFallback === "performance" ? normalizedFallback : "performance";
  if (normalizedCategory === "body_comp") return normalizedFallback || "body_comp";
  if (normalizedCategory === "injury_prevention") return "general_fitness";
  return normalizedFallback || "general_fitness";
};

const inferMeasurabilityTier = ({ primaryMetric = null, proxyMetrics = [], fallbackTier = "" } = {}) => {
  if (primaryMetric?.label && primaryMetric?.targetValue) return "fully_measurable";
  if ((proxyMetrics || []).length > 0 || primaryMetric?.label) return "proxy_measurable";
  const normalizedFallback = sanitizeText(fallbackTier, 40).toLowerCase();
  return normalizedFallback || "exploratory_fuzzy";
};

const buildTrackingLabels = (goal = {}) => dedupeStrings([
  sanitizeText(goal?.primaryMetric?.label || goal?.resolvedGoal?.primaryMetric?.label || "", 120),
  ...normalizeProxyMetrics(goal?.proxyMetrics || goal?.resolvedGoal?.proxyMetrics || []).map((metric) => metric.label),
]).slice(0, 5);

const buildTimingSummary = (goal = {}) => {
  const targetDate = sanitizeText(goal?.targetDate || goal?.resolvedGoal?.targetDate || "", 24);
  const targetHorizonWeeks = normalizeInteger(goal?.targetHorizonWeeks ?? goal?.resolvedGoal?.targetHorizonWeeks, null);
  if (targetDate) return `Exact date: ${formatDateLabel(targetDate)}`;
  if (targetHorizonWeeks) return `${targetHorizonWeeks}-week horizon`;
  return "Open-ended";
};

const buildGoalSnapshot = (goal = null) => {
  const resolvedGoal = goal?.resolvedGoal || {};
  const summary = sanitizeText(resolvedGoal?.summary || goal?.name || "", 160);
  const planningCategory = sanitizeText(resolvedGoal?.planningCategory || goal?.category || "general_fitness", 40).toLowerCase() || "general_fitness";
  const goalFamily = resolveGoalFamilyForCategory(planningCategory, resolvedGoal?.goalFamily || goal?.goalFamily || "");
  const targetDate = sanitizeText(resolvedGoal?.targetDate || goal?.targetDate || "", 24);
  const targetHorizonWeeks = normalizeInteger(resolvedGoal?.targetHorizonWeeks ?? goal?.targetHorizonWeeks, null);
  const primaryMetric = normalizeMetric(resolvedGoal?.primaryMetric || goal?.primaryMetric || null, "primary");
  const proxyMetrics = normalizeProxyMetrics(resolvedGoal?.proxyMetrics || goal?.proxyMetrics || []);
  return {
    summary,
    planningCategory,
    goalFamily,
    primaryMetric,
    proxyMetrics,
    targetDate,
    targetHorizonWeeks,
    openEnded: !targetDate && !targetHorizonWeeks,
    planningPriority: normalizeInteger(resolvedGoal?.planningPriority ?? goal?.priority, null),
    status: sanitizeText(goal?.status || (goal?.active === false ? "archived" : "active"), 40).toLowerCase() || "active",
    measurabilityTier: inferMeasurabilityTier({
      primaryMetric,
      proxyMetrics,
      fallbackTier: resolvedGoal?.measurabilityTier || goal?.measurabilityTier || "",
    }),
  };
};

const formatSnapshotFieldValue = (field = "", value = null) => {
  if (field === "planningPriority") return Number.isFinite(Number(value)) ? `Priority ${Number(value)}` : "Unordered";
  if (field === "targetDate") return value ? formatDateLabel(value) : "No exact date";
  if (field === "targetHorizonWeeks") return Number.isFinite(Number(value)) ? `${Number(value)} weeks` : "No horizon";
  if (field === "openEnded") return value ? "Open-ended" : "Not open-ended";
  if (field === "primaryMetric") {
    const metric = normalizeMetric(value, "primary");
    if (!metric?.label) return "No target metric";
    return [metric.label, metric.targetValue, metric.unit].filter(Boolean).join(" ");
  }
  if (field === "proxyMetrics") {
    const metrics = normalizeProxyMetrics(value);
    return metrics.length ? metrics.map((metric) => metric.label).join(", ") : "No proxy tracking";
  }
  if (field === "planningCategory") return GOAL_TYPE_LABELS[sanitizeText(value, 40).toLowerCase()] || sanitizeText(value, 80) || "Goal";
  if (field === "status") return sanitizeText(value, 80) || "active";
  return sanitizeText(value, 200) || "Not set";
};

const valuesMatch = (left, right) => {
  if (left == null && right == null) return true;
  return JSON.stringify(left) === JSON.stringify(right);
};

const diffGoalSnapshots = (previousSnapshot = null, nextSnapshot = null) => (
  PROVENANCE_FIELDS
    .filter((field) => !valuesMatch(previousSnapshot?.[field], nextSnapshot?.[field]))
    .map((field) => ({
      field,
      label: FIELD_LABELS[field] || field,
      before: formatSnapshotFieldValue(field, previousSnapshot?.[field]),
      after: formatSnapshotFieldValue(field, nextSnapshot?.[field]),
    }))
);

const buildFieldProvenanceMap = ({
  previousFieldProvenance = {},
  previousSnapshot = null,
  nextSnapshot = null,
  changedFields = [],
  capturedAt = toIsoTimestamp(),
  sourceLabel = "Goal management",
  changeType = GOAL_MANAGEMENT_CHANGE_TYPES.edit,
} = {}) => {
  const changedFieldSet = new Set((changedFields || []).map((entry) => entry.field));
  const timestamp = toTimestampMs(capturedAt);
  const nextMap = {};
  PROVENANCE_FIELDS.forEach((field) => {
    const previousRecord = normalizeStructuredProvenance(previousFieldProvenance?.[field] || null, {
      summary: `${FIELD_LABELS[field] || field} was previously captured.`,
    });
    if (!changedFieldSet.has(field) && previousRecord?.events?.length) {
      nextMap[field] = previousRecord;
      return;
    }
    const event = buildProvenanceEvent({
      actor: PROVENANCE_ACTORS.user,
      trigger: `goal_management_${changeType}`,
      mutationType: "goal_field_update",
      revisionReason: `${FIELD_LABELS[field] || field} changed in Goals settings.`,
      sourceInputs: [sourceLabel],
      confidence: "high",
      timestamp,
      details: {
        field,
        before: formatSnapshotFieldValue(field, previousSnapshot?.[field]),
        after: formatSnapshotFieldValue(field, nextSnapshot?.[field]),
      },
    });
    nextMap[field] = buildStructuredProvenance({
      keyDrivers: dedupeStrings([
        ...(previousRecord?.keyDrivers || []),
        sourceLabel,
      ]),
      events: [
        ...((previousRecord?.events || []).slice(-5)),
        event,
      ],
      summary: `${FIELD_LABELS[field] || field} was last updated from ${sourceLabel.toLowerCase()}.`,
    });
  });
  return nextMap;
};

const buildGoalVersion = ({
  recordId = "",
  snapshot = null,
  previousVersion = null,
  changedFields = [],
  capturedAt = toIsoTimestamp(),
  sourceLabel = "Goal management",
  changeType = GOAL_MANAGEMENT_CHANGE_TYPES.edit,
} = {}) => ({
  versionId: `goal_version_${slugify(recordId || snapshot?.summary || "goal", "goal")}_${toTimestampMs(capturedAt)}`,
  capturedAt,
  changeType,
  sourceLabel: sanitizeText(sourceLabel, 80),
  changedFields: cloneValue(changedFields || []),
  snapshot: cloneValue(snapshot || {}),
  fieldProvenance: buildFieldProvenanceMap({
    previousFieldProvenance: previousVersion?.fieldProvenance || {},
    previousSnapshot: previousVersion?.snapshot || null,
    nextSnapshot: snapshot,
    changedFields,
    capturedAt,
    sourceLabel,
    changeType,
  }),
});

const resolveRecordId = (goal = {}, idx = 0) => sanitizeText(
  goal?.goalRecordId
  || goal?.goalManagement?.recordId
  || goal?.resolvedGoal?.id
  || goal?.id
  || `goal_record_${idx + 1}`,
  140
);

const ensureManagedGoal = (goal = null, idx = 0, now = new Date()) => {
  const normalized = normalizeGoals([cloneValue(goal || {})])[0] || null;
  if (!normalized) return null;
  const recordId = resolveRecordId(normalized, idx);
  const existingMeta = normalized?.goalManagement || {};
  const existingVersions = Array.isArray(existingMeta?.versions) ? existingMeta.versions.map((version) => cloneValue(version)) : [];
  if (existingVersions.length > 0) {
    const activeVersionId = sanitizeText(existingMeta?.activeVersionId || existingVersions[0]?.versionId || "", 160) || existingVersions[0].versionId;
    const activeVersion = existingVersions.find((version) => version?.versionId === activeVersionId) || existingVersions[0];
    return {
      ...normalized,
      goalRecordId: recordId,
      goalVersionId: activeVersion?.versionId || activeVersionId,
      goalManagement: {
        recordId,
        createdAt: existingMeta?.createdAt || activeVersion?.capturedAt || toIsoTimestamp(now),
        activeVersionId: activeVersion?.versionId || activeVersionId,
        lastChangedAt: existingMeta?.lastChangedAt || activeVersion?.capturedAt || toIsoTimestamp(now),
        lastChangeType: existingMeta?.lastChangeType || activeVersion?.changeType || GOAL_MANAGEMENT_CHANGE_TYPES.edit,
        versions: existingVersions,
      },
    };
  }
  const snapshot = buildGoalSnapshot(normalized);
  const seededVersion = buildGoalVersion({
    recordId,
    snapshot,
    previousVersion: null,
    changedFields: PROVENANCE_FIELDS.map((field) => ({
      field,
      label: FIELD_LABELS[field] || field,
      before: "Not previously recorded",
      after: formatSnapshotFieldValue(field, snapshot?.[field]),
    })),
    capturedAt: toIsoTimestamp(now),
    sourceLabel: normalized?.resolvedGoal?.confirmedByUser ? "Confirmed goal setup" : "Imported goal state",
    changeType: GOAL_MANAGEMENT_CHANGE_TYPES.edit,
  });
  return {
    ...normalized,
    goalRecordId: recordId,
    goalVersionId: seededVersion.versionId,
    goalManagement: {
      recordId,
      createdAt: seededVersion.capturedAt,
      activeVersionId: seededVersion.versionId,
      lastChangedAt: seededVersion.capturedAt,
      lastChangeType: seededVersion.changeType,
      versions: [seededVersion],
    },
  };
};

const commitManagedGoal = ({
  currentGoal = null,
  nextGoal = null,
  idx = 0,
  changeType = GOAL_MANAGEMENT_CHANGE_TYPES.edit,
  sourceLabel = "Goal settings",
  capturedAt = toIsoTimestamp(),
} = {}) => {
  const preparedCurrent = currentGoal ? ensureManagedGoal(currentGoal, idx, capturedAt) : null;
  const preparedNext = ensureManagedGoal(nextGoal, idx, capturedAt);
  if (!preparedNext) return null;
  const baseMeta = preparedCurrent?.goalManagement || preparedNext?.goalManagement || {};
  const previousVersion = (baseMeta?.versions || []).find((version) => version?.versionId === baseMeta?.activeVersionId)
    || (baseMeta?.versions || [])[0]
    || null;
  const previousSnapshot = previousVersion?.snapshot || buildGoalSnapshot(preparedCurrent);
  const nextSnapshot = buildGoalSnapshot(preparedNext);
  const changedFields = diffGoalSnapshots(previousSnapshot, nextSnapshot);
  if (!changedFields.length && preparedCurrent?.goalManagement) {
    return {
      ...preparedNext,
      goalRecordId: preparedCurrent.goalRecordId || preparedNext.goalRecordId,
      goalVersionId: preparedCurrent.goalVersionId || preparedNext.goalVersionId,
      goalManagement: cloneValue(preparedCurrent.goalManagement),
    };
  }
  const recordId = preparedCurrent?.goalRecordId || preparedNext.goalRecordId || resolveRecordId(preparedNext, idx);
  const nextVersion = buildGoalVersion({
    recordId,
    snapshot: nextSnapshot,
    previousVersion,
    changedFields,
    capturedAt,
    sourceLabel,
    changeType,
  });
  return {
    ...preparedNext,
    goalRecordId: recordId,
    goalVersionId: nextVersion.versionId,
    goalManagement: {
      recordId,
      createdAt: baseMeta?.createdAt || previousVersion?.capturedAt || capturedAt,
      activeVersionId: nextVersion.versionId,
      lastChangedAt: capturedAt,
      lastChangeType: changeType,
      versions: [nextVersion, ...((baseMeta?.versions || []).slice(0, 11))],
    },
  };
};

const extractResolvedGoal = (goal = null) => {
  if (!goal) return null;
  const snapshot = buildGoalSnapshot(goal);
  const primaryMetric = normalizeMetric(goal?.resolvedGoal?.primaryMetric || goal?.primaryMetric || null, "primary");
  const proxyMetrics = normalizeProxyMetrics(goal?.resolvedGoal?.proxyMetrics || goal?.proxyMetrics || []);
  return {
    ...(cloneValue(goal?.resolvedGoal || {}) || {}),
    id: resolveRecordId(goal),
    summary: sanitizeText(goal?.resolvedGoal?.summary || goal?.name || snapshot.summary, 160),
    planningCategory: snapshot.planningCategory,
    goalFamily: resolveGoalFamilyForCategory(snapshot.planningCategory, goal?.resolvedGoal?.goalFamily || goal?.goalFamily || snapshot.goalFamily),
    planningPriority: normalizeInteger(goal?.priority ?? goal?.resolvedGoal?.planningPriority, snapshot.planningPriority || 1),
    primaryMetric,
    proxyMetrics,
    targetDate: snapshot.targetDate,
    targetHorizonWeeks: snapshot.targetHorizonWeeks,
    confirmedByUser: true,
    confirmationSource: sanitizeText(goal?.resolvedGoal?.confirmationSource || "goal_settings_management", 60),
    confidence: sanitizeText(goal?.resolvedGoal?.confidence || goal?.confidenceLevel || "medium", 20).toLowerCase() || "medium",
    measurabilityTier: snapshot.measurabilityTier,
    tradeoffs: dedupeStrings(toArray(goal?.resolvedGoal?.tradeoffs || goal?.tradeoffs || []).map((item) => sanitizeText(item, 180))),
    unresolvedGaps: dedupeStrings(toArray(goal?.resolvedGoal?.unresolvedGaps || goal?.unresolvedGaps || []).map((item) => sanitizeText(item, 180))),
    first30DaySuccessDefinition: sanitizeText(goal?.resolvedGoal?.first30DaySuccessDefinition || goal?.first30DaySuccessDefinition || "", 220),
    reviewCadence: sanitizeText(goal?.resolvedGoal?.reviewCadence || goal?.reviewCadence || "weekly", 40) || "weekly",
    refinementTrigger: sanitizeText(goal?.resolvedGoal?.refinementTrigger || goal?.refinementTrigger || "30_day_resolution_review", 80) || "30_day_resolution_review",
  };
};

const buildPlannerGoalFromResolvedGoal = ({ currentGoal = null, resolvedGoal = null, priority = 1, idx = 0 } = {}) => {
  const projected = projectResolvedGoalToPlanningGoal({
    ...(cloneValue(resolvedGoal || {}) || {}),
    id: resolveRecordId(currentGoal || resolvedGoal || {}, idx),
    planningPriority: priority,
    confirmedByUser: true,
  }, idx);
  return {
    ...(cloneValue(currentGoal || {}) || {}),
    ...projected,
    id: currentGoal?.id || projected.id,
    goalRecordId: resolveRecordId(currentGoal || resolvedGoal || {}, idx),
    goalVersionId: currentGoal?.goalVersionId || "",
    active: true,
    status: "active",
    priority,
    archivedAt: null,
    resolvedGoal: {
      ...projected.resolvedGoal,
      id: resolveRecordId(currentGoal || resolvedGoal || {}, idx),
      planningPriority: priority,
      confirmedByUser: true,
      confirmationSource: sanitizeText(
        resolvedGoal?.confirmationSource || currentGoal?.resolvedGoal?.confirmationSource || "goal_settings_management",
        60
      ),
    },
  };
};

const sortGoalsByPriority = (goals = []) => (
  [...(goals || [])].sort((left, right) => (
    Number(left?.priority || 999) - Number(right?.priority || 999)
    || sanitizeText(left?.name || "", 160).localeCompare(sanitizeText(right?.name || "", 160))
  ))
);

const reorderByIds = (goals = [], orderedGoalIds = []) => {
  const map = new Map(sortGoalsByPriority(goals).map((goal) => [resolveRecordId(goal), goal]));
  const ordered = [];
  toArray(orderedGoalIds).forEach((goalId) => {
    const cleanGoalId = sanitizeText(goalId, 140);
    const found = map.get(cleanGoalId);
    if (found) {
      ordered.push(found);
      map.delete(cleanGoalId);
    }
  });
  return [...ordered, ...map.values()];
};

const buildPlannerGoalCollection = ({ activeGoals = [], currentGoals = [] } = {}) => {
  const currentGoalList = normalizeGoals(cloneValue(currentGoals || []));
  const resilienceGoal = currentGoalList.find((goal) => isResilienceGoal(goal)) || cloneValue(DEFAULT_RESILIENCE_GOAL);
  const committedUserGoals = sortGoalsByPriority(activeGoals).map((goal, index) => ({
    ...goal,
    active: true,
    status: "active",
    priority: index + 1,
  }));
  const committedResilienceGoal = {
    ...resilienceGoal,
    active: true,
    status: "active",
    priority: committedUserGoals.length + 1,
  };
  return normalizeGoals([
    ...committedUserGoals,
    committedResilienceGoal,
  ]);
};

const finalizeActiveGoals = ({
  currentActiveGoals = [],
  nextActiveGoals = [],
  previousGoalsByRecordId = null,
  changeType = GOAL_MANAGEMENT_CHANGE_TYPES.edit,
  sourceLabel = "Goal settings",
  capturedAt = toIsoTimestamp(),
} = {}) => {
  const previousMap = previousGoalsByRecordId || new Map(
    sortGoalsByPriority(currentActiveGoals).map((goal, idx) => {
      const prepared = ensureManagedGoal(goal, idx, capturedAt);
      return [resolveRecordId(prepared, idx), prepared];
    })
  );
  const committedGoals = toArray(nextActiveGoals).map((goal, index) => {
    const cleanRecordId = resolveRecordId(goal, index);
    const currentGoal = previousMap.get(cleanRecordId) || null;
    const resolvedGoal = extractResolvedGoal({
      ...(cloneValue(goal || {}) || {}),
      resolvedGoal: {
        ...(cloneValue(goal?.resolvedGoal || {}) || {}),
        id: cleanRecordId,
      },
      priority: index + 1,
    });
    const projectedGoal = buildPlannerGoalFromResolvedGoal({
      currentGoal: goal,
      resolvedGoal,
      priority: index + 1,
      idx: index,
    });
    return commitManagedGoal({
      currentGoal,
      nextGoal: projectedGoal,
      idx: index,
      changeType,
      sourceLabel,
      capturedAt,
    });
  }).filter(Boolean);
  const changedFieldsByGoalId = Object.fromEntries(
    committedGoals.map((goal) => {
      const recordId = resolveRecordId(goal);
      const previousGoal = previousMap.get(recordId) || null;
      return [recordId, diffGoalSnapshots(buildGoalSnapshot(previousGoal), buildGoalSnapshot(goal))];
    })
  );
  return {
    committedGoals,
    changedFieldsByGoalId,
  };
};

const buildHistoryEntry = ({
  changeType = GOAL_MANAGEMENT_CHANGE_TYPES.edit,
  subjectGoal = null,
  changedFields = [],
  previousOrder = [],
  nextOrder = [],
  impactLines = [],
  capturedAt = toIsoTimestamp(),
  archiveStatus = "",
} = {}) => ({
  id: `goal_management_${changeType}_${toTimestampMs(capturedAt)}`,
  changeType,
  changedAt: capturedAt,
  goalRecordId: resolveRecordId(subjectGoal || {}, 0),
  goalSummary: sanitizeText(subjectGoal?.name || subjectGoal?.resolvedGoal?.summary || "", 160),
  archiveStatus: sanitizeText(archiveStatus || subjectGoal?.status || "", 40).toLowerCase(),
  changedFields: cloneValue(changedFields || []),
  previousOrder: cloneValue(previousOrder || []),
  nextOrder: cloneValue(nextOrder || []),
  impactLines: cloneValue(impactLines || []),
});

const buildGoalCardModel = ({
  goal = null,
  priorityLabel = "",
  fallbackPriorityLabel = "",
} = {}) => {
  const managedGoal = ensureManagedGoal(goal);
  const activeVersion = managedGoal?.goalManagement?.versions?.find((version) => version?.versionId === managedGoal?.goalManagement?.activeVersionId)
    || managedGoal?.goalManagement?.versions?.[0]
    || null;
  const snapshot = activeVersion?.snapshot || buildGoalSnapshot(managedGoal);
  const currentFieldProvenance = activeVersion?.fieldProvenance || {};
  return {
    id: resolveRecordId(managedGoal),
    runtimeId: sanitizeText(managedGoal?.id || "", 140),
    summary: sanitizeText(managedGoal?.name || managedGoal?.resolvedGoal?.summary || snapshot.summary, 160),
    status: sanitizeText(managedGoal?.status || (managedGoal?.active === false ? "archived" : "active"), 40).toLowerCase() || "active",
    priority: normalizeInteger(managedGoal?.priority, null),
    priorityLabel: priorityLabel || fallbackPriorityLabel || (managedGoal?.priority <= 3 ? `Priority ${managedGoal.priority}` : "Additional goal"),
    goalTypeLabel: GOAL_TYPE_LABELS[snapshot.goalFamily] || GOAL_TYPE_LABELS[snapshot.planningCategory] || "Goal",
    timingLabel: buildTimingSummary(managedGoal),
    trackingLabels: buildTrackingLabels(managedGoal),
    tradeoff: sanitizeText((managedGoal?.tradeoffs || managedGoal?.resolvedGoal?.tradeoffs || [])[0] || "", 180),
    fuzzyLine: sanitizeText((managedGoal?.unresolvedGaps || managedGoal?.resolvedGoal?.unresolvedGaps || [])[0] || "", 180),
    lastChangedAt: managedGoal?.goalManagement?.lastChangedAt || activeVersion?.capturedAt || "",
    activeVersionLabel: `Version ${(managedGoal?.goalManagement?.versions || []).length || 1}`,
    fieldRows: PROVENANCE_FIELDS.map((field) => ({
      field,
      label: FIELD_LABELS[field] || field,
      value: formatSnapshotFieldValue(field, snapshot?.[field]),
      provenanceSummary: describeProvenanceRecord(
        currentFieldProvenance?.[field] || null,
        `${FIELD_LABELS[field] || field} came from the active goal version.`
      ),
      updatedAt: currentFieldProvenance?.[field]?.updatedAt || managedGoal?.goalManagement?.lastChangedAt || "",
    })),
    historyRows: (managedGoal?.goalManagement?.versions || []).map((version) => ({
      id: version?.versionId || "",
      changedAt: version?.capturedAt || "",
      changeType: sanitizeText(version?.changeType || "", 40).toLowerCase(),
      sourceLabel: sanitizeText(version?.sourceLabel || "", 80),
      changedFields: cloneValue(version?.changedFields || []),
    })),
  };
};

const buildImpactLines = ({
  currentActiveGoals = [],
  nextActiveGoals = [],
  changeType = GOAL_MANAGEMENT_CHANGE_TYPES.edit,
  changedFields = [],
  archiveStatus = "",
  nextTradeoffStatement = "",
  subjectGoal = null,
} = {}) => {
  const currentPrimary = sortGoalsByPriority(currentActiveGoals)[0] || null;
  const nextPrimary = sortGoalsByPriority(nextActiveGoals)[0] || null;
  const lines = [];
  if (nextPrimary?.name) {
    if (resolveRecordId(currentPrimary) !== resolveRecordId(nextPrimary)) {
      lines.push(`${nextPrimary.name} moves into Priority 1 and gets the clearest progression push.`);
    } else {
      lines.push(`Priority 1 stays ${nextPrimary.name}.`);
    }
  }
  if (nextActiveGoals[1]?.name) {
    lines.push(`${nextActiveGoals[1].name} stays active while Priority 1 drives most of the progression.`);
  }
  if (nextActiveGoals.length >= 3) {
    const additionalCount = Math.max(0, nextActiveGoals.length - 2);
    if (additionalCount === 1) {
      lines.push(`${nextActiveGoals[2].name} still influences exercise selection and tracking where possible.`);
    } else if (additionalCount > 1) {
      lines.push("Lower-priority goals still influence exercise selection and tracking where possible.");
    }
  }
  if (changeType === GOAL_MANAGEMENT_CHANGE_TYPES.archive && subjectGoal?.name) {
    lines.push(`${subjectGoal.name} moves out of the active stack as ${sanitizeText(archiveStatus || subjectGoal?.status || "archived", 40).toLowerCase()}. Historical plans and logs stay attached to the earlier version.`);
  }
  if (changeType === GOAL_MANAGEMENT_CHANGE_TYPES.restore && subjectGoal?.name) {
    lines.push(`${subjectGoal.name} returns to the active stack and starts influencing plan decisions again.`);
  }
  if (changedFields.some((entry) => entry.field === "targetDate")) {
    const targetDate = sanitizeText(subjectGoal?.resolvedGoal?.targetDate || subjectGoal?.targetDate || "", 24);
    lines.push(targetDate ? `This goal now uses a hard date of ${formatDateLabel(targetDate)}.` : "This goal no longer uses a hard deadline.");
  }
  if (changedFields.some((entry) => entry.field === "targetHorizonWeeks")) {
    const targetHorizonWeeks = normalizeInteger(subjectGoal?.resolvedGoal?.targetHorizonWeeks ?? subjectGoal?.targetHorizonWeeks, null);
    if (targetHorizonWeeks) lines.push(`This goal now uses a ${targetHorizonWeeks}-week horizon.`);
  }
  if (changedFields.some((entry) => entry.field === "openEnded")) {
    const isOpenEnded = !sanitizeText(subjectGoal?.resolvedGoal?.targetDate || subjectGoal?.targetDate || "", 24)
      && !normalizeInteger(subjectGoal?.resolvedGoal?.targetHorizonWeeks ?? subjectGoal?.targetHorizonWeeks, null);
    if (isOpenEnded) lines.push("This goal is open-ended now, so the planner will guide steady progression without a fake finish line.");
  }
  if (changedFields.some((entry) => entry.field === "primaryMetric" || entry.field === "proxyMetrics")) {
    const trackingLabels = buildTrackingLabels(subjectGoal);
    lines.push(`Tracking will focus on ${trackingLabels.length ? trackingLabels.join(", ") : "the updated goal signal"}.`);
  }
  if (nextTradeoffStatement) {
    lines.push(nextTradeoffStatement);
  }
  return dedupeStrings(lines).slice(0, 6);
};

const buildGoalManagementEnvelope = (personalization = {}, patch = {}) => ({
  ...(cloneValue(personalization?.goalManagement || DEFAULT_GOAL_MANAGEMENT) || {}),
  ...cloneValue(patch || {}),
  version: GOAL_MANAGEMENT_VERSION,
});

export const buildGoalSettingsViewModel = ({
  goals = [],
  personalization = {},
  now = new Date(),
} = {}) => {
  const normalizedCurrentGoals = normalizeGoals(cloneValue(goals || []));
  const activeGoals = sortGoalsByPriority(
    normalizedCurrentGoals
      .filter((goal) => goal?.active && !isResilienceGoal(goal))
      .map((goal, idx) => ensureManagedGoal(goal, idx, now))
      .filter(Boolean)
  );
  const archivedGoals = sortGoalsByPriority(
    toArray(personalization?.goalManagement?.archivedGoals || [])
      .map((goal, idx) => ensureManagedGoal({
        ...goal,
        active: false,
      }, idx, now))
      .filter(Boolean)
  );
  const resolvedGoals = activeGoals.map((goal) => extractResolvedGoal(goal)).filter(Boolean);
  const reviewModel = buildIntakeGoalStackReviewModel({
    resolvedGoals,
    goalStackConfirmation: {
      orderedGoalIds: resolvedGoals.map((goal) => sanitizeText(goal?.id || "", 140)).filter(Boolean),
      removedGoalIds: [],
    },
  });
  const priorityLabelsById = Object.fromEntries(
    toArray(reviewModel?.orderedGoalStack?.items || []).map((item, index) => [
      sanitizeText(item?.id || "", 140),
      sanitizeText(item?.priorityLabel || (index < 3 ? `Priority ${index + 1}` : "Additional goal"), 80),
    ])
  );
  return {
    currentGoals: activeGoals.map((goal, index) => buildGoalCardModel({
      goal,
      priorityLabel: priorityLabelsById[resolveRecordId(goal)],
      fallbackPriorityLabel: index < 3 ? `Priority ${index + 1}` : "Additional goal",
    })),
    archivedGoals: archivedGoals.map((goal) => buildGoalCardModel({
      goal,
      priorityLabel: sanitizeText(goal?.status || "archived", 80),
      fallbackPriorityLabel: sanitizeText(goal?.status || "archived", 80),
    })),
    currentGoalOrder: activeGoals.map((goal) => resolveRecordId(goal)),
    tradeoffStatement: sanitizeText(reviewModel?.tradeoffStatement || reviewModel?.reviewContract?.tradeoff_statement || "", 220),
    reviewModel,
    historyFeed: toArray(personalization?.goalManagement?.history || []).map((entry) => ({
      id: sanitizeText(entry?.id || "", 160),
      changeType: sanitizeText(entry?.changeType || "", 40).toLowerCase(),
      changedAt: entry?.changedAt || "",
      goalSummary: sanitizeText(entry?.goalSummary || "", 160),
      changedFields: cloneValue(entry?.changedFields || []),
      impactLines: cloneValue(entry?.impactLines || []),
      archiveStatus: sanitizeText(entry?.archiveStatus || "", 40).toLowerCase(),
    })),
  };
};

export const buildGoalEditorDraft = ({ goal = null } = {}) => {
  const managedGoal = ensureManagedGoal(goal);
  const snapshot = buildGoalSnapshot(managedGoal);
  return {
    goalId: resolveRecordId(managedGoal || {}, 0),
    summary: snapshot.summary,
    planningCategory: snapshot.planningCategory,
    primaryMetricLabel: sanitizeText(snapshot.primaryMetric?.label || "", 120),
    primaryMetricTargetValue: sanitizeText(snapshot.primaryMetric?.targetValue || "", 80),
    primaryMetricUnit: sanitizeText(snapshot.primaryMetric?.unit || "", 24),
    proxyMetrics: normalizeProxyMetrics(snapshot.proxyMetrics || []).map((metric) => ({
      key: metric.key,
      label: metric.label,
      unit: metric.unit,
    })),
    timingMode: snapshot.targetDate ? "exact_date" : snapshot.targetHorizonWeeks ? "target_horizon" : "open_ended",
    targetDate: snapshot.targetDate,
    targetHorizonWeeks: snapshot.targetHorizonWeeks ? String(snapshot.targetHorizonWeeks) : "",
    status: sanitizeText(managedGoal?.status || "active", 40).toLowerCase() || "active",
  };
};

const buildResolvedGoalFromDraft = ({
  goal = null,
  draft = {},
  priority = 1,
} = {}) => {
  const currentResolvedGoal = extractResolvedGoal(goal) || {};
  const planningCategory = sanitizeText(draft?.planningCategory || currentResolvedGoal?.planningCategory || goal?.category || "general_fitness", 40).toLowerCase() || "general_fitness";
  const primaryMetric = normalizeMetric({
    key: draft?.primaryMetricKey || currentResolvedGoal?.primaryMetric?.key || slugify(draft?.primaryMetricLabel || currentResolvedGoal?.primaryMetric?.label || "metric", "metric"),
    label: draft?.primaryMetricLabel || currentResolvedGoal?.primaryMetric?.label || "",
    unit: draft?.primaryMetricUnit || currentResolvedGoal?.primaryMetric?.unit || "",
    targetValue: draft?.primaryMetricTargetValue || currentResolvedGoal?.primaryMetric?.targetValue || "",
  }, "primary");
  const proxyMetrics = normalizeProxyMetrics(
    toArray(draft?.proxyMetrics || []).map((metric) => ({
      key: metric?.key || slugify(metric?.label || "", "proxy"),
      label: metric?.label || "",
      unit: metric?.unit || "",
    }))
  );
  const timingMode = sanitizeText(draft?.timingMode || "", 40).toLowerCase();
  const targetDate = timingMode === "exact_date"
    ? sanitizeText(draft?.targetDate || "", 24)
    : "";
  const targetHorizonWeeks = timingMode === "target_horizon"
    ? normalizeInteger(draft?.targetHorizonWeeks, null)
    : null;
  const measurabilityTier = inferMeasurabilityTier({
    primaryMetric,
    proxyMetrics,
    fallbackTier: currentResolvedGoal?.measurabilityTier || goal?.measurabilityTier || "",
  });
  return {
    ...cloneValue(currentResolvedGoal || {}),
    id: resolveRecordId(goal || currentResolvedGoal || {}, 0),
    summary: sanitizeText(draft?.summary || currentResolvedGoal?.summary || goal?.name || "", 160),
    planningCategory,
    goalFamily: resolveGoalFamilyForCategory(planningCategory, currentResolvedGoal?.goalFamily || goal?.goalFamily || ""),
    planningPriority: priority,
    targetDate,
    targetHorizonWeeks,
    primaryMetric,
    proxyMetrics,
    measurabilityTier,
    confirmedByUser: true,
    confirmationSource: "settings_goal_management",
  };
};

export const buildGoalManagementPreview = ({
  goals = [],
  personalization = {},
  change = {},
  now = new Date(),
} = {}) => {
  const changeType = sanitizeText(change?.type || "", 40).toLowerCase();
  if (!Object.values(GOAL_MANAGEMENT_CHANGE_TYPES).includes(changeType)) return null;

  const currentViewModel = buildGoalSettingsViewModel({ goals, personalization, now });
  const currentActiveGoals = sortGoalsByPriority(
    normalizeGoals(cloneValue(goals || []))
      .filter((goal) => goal?.active && !isResilienceGoal(goal))
      .map((goal, idx) => ensureManagedGoal(goal, idx, now))
      .filter(Boolean)
  );
  const currentArchivedGoals = sortGoalsByPriority(
    toArray(personalization?.goalManagement?.archivedGoals || [])
      .map((goal, idx) => ensureManagedGoal({ ...goal, active: false }, idx, now))
      .filter(Boolean)
  );
  const capturedAt = toIsoTimestamp(now);

  let nextActiveGoals = currentActiveGoals.map((goal) => cloneValue(goal));
  let nextArchivedGoals = currentArchivedGoals.map((goal) => cloneValue(goal));
  let subjectGoal = null;
  let subjectChangedFields = [];
  let changeLabel = "";

  if (changeType === GOAL_MANAGEMENT_CHANGE_TYPES.reprioritize) {
    const orderedGoalIds = toArray(change?.orderedGoalIds || []).map((goalId) => sanitizeText(goalId, 140)).filter(Boolean);
    const { committedGoals, changedFieldsByGoalId } = finalizeActiveGoals({
      currentActiveGoals,
      nextActiveGoals: reorderByIds(nextActiveGoals, orderedGoalIds),
      changeType,
      sourceLabel: "Settings reprioritization",
      capturedAt,
    });
    nextActiveGoals = committedGoals;
    subjectChangedFields = Object.values(changedFieldsByGoalId).flat().filter(Boolean);
    changeLabel = "Priority order updated";
  }

  if (changeType === GOAL_MANAGEMENT_CHANGE_TYPES.edit) {
    const targetGoalId = sanitizeText(change?.goalId || "", 140);
    const targetIndex = nextActiveGoals.findIndex((goal) => resolveRecordId(goal) === targetGoalId);
    if (targetIndex < 0) return null;
    const currentGoal = nextActiveGoals[targetIndex];
    const nextResolvedGoal = buildResolvedGoalFromDraft({
      goal: currentGoal,
      draft: change?.draft || {},
      priority: targetIndex + 1,
    });
    nextActiveGoals[targetIndex] = buildPlannerGoalFromResolvedGoal({
      currentGoal,
      resolvedGoal: nextResolvedGoal,
      priority: targetIndex + 1,
      idx: targetIndex,
    });
    const { committedGoals, changedFieldsByGoalId } = finalizeActiveGoals({
      currentActiveGoals,
      nextActiveGoals,
      changeType,
      sourceLabel: "Settings goal edit",
      capturedAt,
    });
    nextActiveGoals = committedGoals;
    subjectGoal = nextActiveGoals.find((goal) => resolveRecordId(goal) === targetGoalId) || null;
    subjectChangedFields = changedFieldsByGoalId[targetGoalId] || [];
    changeLabel = subjectGoal?.name ? `Edit ${subjectGoal.name}` : "Goal edited";
  }

  if (changeType === GOAL_MANAGEMENT_CHANGE_TYPES.archive) {
    const targetGoalId = sanitizeText(change?.goalId || "", 140);
    const archiveStatus = sanitizeText(change?.archiveStatus || GOAL_ARCHIVE_STATUSES.archived, 40).toLowerCase() || GOAL_ARCHIVE_STATUSES.archived;
    const targetIndex = nextActiveGoals.findIndex((goal) => resolveRecordId(goal) === targetGoalId);
    if (targetIndex < 0) return null;
    const currentGoal = nextActiveGoals[targetIndex];
    nextActiveGoals.splice(targetIndex, 1);
    const archivedGoal = commitManagedGoal({
      currentGoal,
      nextGoal: {
        ...currentGoal,
        active: false,
        status: archiveStatus,
        archivedAt: capturedAt,
      },
      idx: targetIndex,
      changeType,
      sourceLabel: `Settings ${archiveStatus}`,
      capturedAt,
    });
    nextArchivedGoals = [archivedGoal, ...nextArchivedGoals.filter((goal) => resolveRecordId(goal) !== targetGoalId)];
    const { committedGoals } = finalizeActiveGoals({
      currentActiveGoals,
      nextActiveGoals,
      changeType,
      sourceLabel: "Settings archive",
      capturedAt,
    });
    nextActiveGoals = committedGoals;
    subjectGoal = archivedGoal;
    subjectChangedFields = diffGoalSnapshots(buildGoalSnapshot(currentGoal), buildGoalSnapshot(archivedGoal));
    changeLabel = `${currentGoal?.name || "Goal"} marked ${archiveStatus}`;
  }

  if (changeType === GOAL_MANAGEMENT_CHANGE_TYPES.restore) {
    const targetGoalId = sanitizeText(change?.goalId || "", 140);
    const archivedGoalIndex = nextArchivedGoals.findIndex((goal) => resolveRecordId(goal) === targetGoalId);
    if (archivedGoalIndex < 0) return null;
    const archivedGoal = nextArchivedGoals[archivedGoalIndex];
    nextArchivedGoals.splice(archivedGoalIndex, 1);
    nextActiveGoals.push({
      ...archivedGoal,
      active: true,
      status: "active",
      archivedAt: null,
    });
    const previousGoalsByRecordId = new Map(
      [
        ...currentActiveGoals,
        archivedGoal,
      ].map((goal, idx) => {
        const prepared = ensureManagedGoal(goal, idx, now);
        return [resolveRecordId(prepared, idx), prepared];
      })
    );
    const { committedGoals, changedFieldsByGoalId } = finalizeActiveGoals({
      currentActiveGoals,
      nextActiveGoals,
      previousGoalsByRecordId,
      changeType,
      sourceLabel: "Settings restore",
      capturedAt,
    });
    nextActiveGoals = committedGoals;
    subjectGoal = nextActiveGoals.find((goal) => resolveRecordId(goal) === targetGoalId) || null;
    subjectChangedFields = changedFieldsByGoalId[targetGoalId] || [];
    changeLabel = `${subjectGoal?.name || "Goal"} restored`;
  }

  const nextGoals = buildPlannerGoalCollection({
    activeGoals: nextActiveGoals,
    currentGoals: goals,
  });
  const previousOrder = currentActiveGoals.map((goal) => resolveRecordId(goal));
  const nextOrder = nextActiveGoals.map((goal) => resolveRecordId(goal));
  const nextGoalManagement = buildGoalManagementEnvelope(personalization, {
    archivedGoals: nextArchivedGoals,
  });
  const nextPreviewPersonalization = {
    ...cloneValue(personalization || {}),
    goalManagement: nextGoalManagement,
  };
  const nextViewModel = buildGoalSettingsViewModel({
    goals: nextGoals,
    personalization: nextPreviewPersonalization,
    now,
  });
  const impactLines = buildImpactLines({
    currentActiveGoals,
    nextActiveGoals,
    changeType,
    changedFields: subjectChangedFields,
    archiveStatus: change?.archiveStatus || subjectGoal?.status || "",
    nextTradeoffStatement: nextViewModel?.tradeoffStatement || "",
    subjectGoal,
  });
  const historyEntry = buildHistoryEntry({
    changeType,
    subjectGoal,
    changedFields: subjectChangedFields,
    previousOrder,
    nextOrder,
    impactLines,
    capturedAt,
    archiveStatus: change?.archiveStatus || subjectGoal?.status || "",
  });
  nextGoalManagement.history = [historyEntry, ...toArray(personalization?.goalManagement?.history || [])].slice(0, 60);

  return {
    changeType,
    changeLabel,
    plannerChangeMode: changeType === GOAL_MANAGEMENT_CHANGE_TYPES.edit
      ? "refine_current_goal"
      : "reprioritize_goal_stack",
    historyEntry,
    currentGoals: goals,
    nextGoals,
    nextResolvedGoals: nextActiveGoals.map((goal) => extractResolvedGoal(goal)).filter(Boolean),
    nextGoalManagement,
    currentViewModel,
    nextViewModel,
    subjectGoalId: resolveRecordId(subjectGoal || {}, 0),
    subjectGoalSummary: sanitizeText(subjectGoal?.name || subjectGoal?.resolvedGoal?.summary || "", 160),
    changedFields: subjectChangedFields,
    impactLines,
    previousOrder,
    nextOrder,
    explicitHistoryNote: "Historical plan truth and workout logs stay preserved. This change only affects the active goal version going forward.",
  };
};
