import { normalizePersistedPlanWeekRecordMap } from "./plan-week-persistence-service.js";

export const GOAL_CHANGE_MODES = {
  refineCurrentGoal: "refine_current_goal",
  reprioritizeGoalStack: "reprioritize_goal_stack",
  startNewGoalArc: "start_new_goal_arc",
};

export const GOAL_CHANGE_MODE_META = {
  [GOAL_CHANGE_MODES.refineCurrentGoal]: {
    label: "Refine Current Goal",
    effectLine: "Refines the active goal structure without starting a new arc.",
    historyLine: "Past logs and earlier plan snapshots stay untouched. Planning updates from today forward.",
  },
  [GOAL_CHANGE_MODES.reprioritizeGoalStack]: {
    label: "Re-prioritize Goals",
    effectLine: "Changes the priority order the planner follows going forward.",
    historyLine: "Past logs and earlier plan snapshots stay untouched. The priority order changes going forward.",
  },
  [GOAL_CHANGE_MODES.startNewGoalArc]: {
    label: "Start New Goal Arc",
    effectLine: "Archives the current planning arc and starts a new one from today.",
    historyLine: "Past logs stay in history. Prior plan truth is archived before the new arc becomes active.",
  },
};

const cloneGoalChangeValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const normalizeDateKey = (value = "") => sanitizeText(value, 24);

const isBeforeToday = (dateKey = "", todayKey = "") => (
  Boolean(dateKey && todayKey && dateKey < todayKey)
);

const keepHistoricalPlannedDayRecords = ({ plannedDayRecords = {}, todayKey = "" } = {}) => (
  Object.fromEntries(
    Object.entries(plannedDayRecords || {})
      .filter(([dateKey]) => isBeforeToday(dateKey, todayKey))
      .map(([dateKey, entry]) => [dateKey, cloneGoalChangeValue(entry)])
  )
);

const keepPastPlanWeekRecords = ({ planWeekRecords = {}, currentWeek = 1 } = {}) => {
  const normalized = normalizePersistedPlanWeekRecordMap(planWeekRecords || {});
  return Object.fromEntries(
    Object.entries(normalized)
      .filter(([, entry]) => Number(entry?.absoluteWeek || entry?.weekNumber || 0) > 0 && Number(entry?.absoluteWeek || entry?.weekNumber || 0) < Number(currentWeek || 1))
      .map(([weekKey, entry]) => [weekKey, cloneGoalChangeValue(entry)])
  );
};

const keepPastWeekNotes = ({ weekNotes = {}, currentWeek = 1 } = {}) => (
  Object.fromEntries(
    Object.entries(weekNotes || {})
      .filter(([weekKey]) => Number(weekKey) > 0 && Number(weekKey) < Number(currentWeek || 1))
      .map(([weekKey, note]) => [weekKey, note])
  )
);

const buildPreviousGoalSummary = (goals = []) => (
  (Array.isArray(goals) ? goals : [])
    .filter((goal) => goal?.active && goal?.category !== "injury_prevention" && goal?.id !== "g_resilience")
    .sort((a, b) => Number(a?.priority || 99) - Number(b?.priority || 99))
    .map((goal) => sanitizeText(goal?.resolvedGoal?.summary || goal?.name || "", 140))
    .filter(Boolean)
);

const buildNextGoalSummary = (resolvedGoals = []) => (
  (Array.isArray(resolvedGoals) ? resolvedGoals : [])
    .map((goal) => sanitizeText(goal?.summary || "", 140))
    .filter(Boolean)
);

export const resolveGoalChangePlanStartDate = ({
  mode = GOAL_CHANGE_MODES.refineCurrentGoal,
  todayKey = "",
  existingPlanStartDate = "",
} = {}) => (
  mode === GOAL_CHANGE_MODES.startNewGoalArc
    ? normalizeDateKey(todayKey || existingPlanStartDate)
    : normalizeDateKey(existingPlanStartDate || todayKey)
);

export const prepareGoalChangeActiveState = ({
  mode = GOAL_CHANGE_MODES.refineCurrentGoal,
  todayKey = "",
  currentWeek = 1,
  plannedDayRecords = {},
  planWeekRecords = {},
  weeklyCheckins = {},
  weekNotes = {},
  planAlerts = [],
  paceOverrides = {},
  coachPlanAdjustments = null,
  defaultCoachPlanAdjustments = {},
} = {}) => {
  const nextPlannedDayRecords = keepHistoricalPlannedDayRecords({ plannedDayRecords, todayKey });
  const nextPlanWeekRecords = mode === GOAL_CHANGE_MODES.startNewGoalArc
    ? {}
    : keepPastPlanWeekRecords({ planWeekRecords, currentWeek });
  const nextWeeklyCheckins = mode === GOAL_CHANGE_MODES.startNewGoalArc
    ? {}
    : cloneGoalChangeValue(weeklyCheckins || {});
  const nextWeekNotes = mode === GOAL_CHANGE_MODES.startNewGoalArc
    ? {}
    : keepPastWeekNotes({ weekNotes, currentWeek });
  const nextPlanAlerts = [];
  const nextPaceOverrides = mode === GOAL_CHANGE_MODES.startNewGoalArc
    ? {}
    : cloneGoalChangeValue(paceOverrides || {});
  const nextCoachPlanAdjustments = cloneGoalChangeValue(defaultCoachPlanAdjustments || coachPlanAdjustments || {});

  return {
    plannedDayRecords: nextPlannedDayRecords,
    planWeekRecords: nextPlanWeekRecords,
    weeklyCheckins: nextWeeklyCheckins,
    weekNotes: nextWeekNotes,
    planAlerts: nextPlanAlerts,
    paceOverrides: nextPaceOverrides,
    coachPlanAdjustments: nextCoachPlanAdjustments,
  };
};

export const buildGoalChangeArchiveEntry = ({
  todayKey = "",
  mode = GOAL_CHANGE_MODES.refineCurrentGoal,
  rawGoalIntent = "",
  currentGoalState = {},
  goals = [],
  resolvedGoals = [],
  plannedDayRecords = {},
  planWeekRecords = {},
  weeklyCheckins = {},
  logs = {},
} = {}) => {
  const safeTodayKey = normalizeDateKey(todayKey);
  const modeMeta = GOAL_CHANGE_MODE_META[mode] || GOAL_CHANGE_MODE_META[GOAL_CHANGE_MODES.refineCurrentGoal];
  const priorStartDate = normalizeDateKey(currentGoalState?.planStartDate || "");
  const previousGoalSummary = buildPreviousGoalSummary(goals);
  const nextGoalSummary = buildNextGoalSummary(resolvedGoals);
  const planArcLabel = mode === GOAL_CHANGE_MODES.startNewGoalArc
    ? `${priorStartDate || "Unknown start"} -> ${safeTodayKey || "new arc"}`
    : `${priorStartDate || "Unknown start"} snapshot before ${modeMeta.label.toLowerCase()} on ${safeTodayKey || "today"}`;

  return {
    id: `goal_change_archive_${Date.now()}`,
    archivedAt: new Date().toISOString(),
    planArcLabel,
    archiveType: "goal_change",
    goalChange: {
      mode,
      label: modeMeta.label,
      rawGoalIntent: sanitizeText(rawGoalIntent, 420),
      previousGoals: previousGoalSummary,
      nextGoals: nextGoalSummary,
      archivedOn: safeTodayKey,
    },
    goalStateSnapshot: cloneGoalChangeValue(currentGoalState || {}),
    goalsSnapshot: cloneGoalChangeValue(goals || []),
    resolvedGoalsSnapshot: cloneGoalChangeValue(resolvedGoals || []),
    prescribedDayHistory: cloneGoalChangeValue(plannedDayRecords || {}),
    planWeekHistory: cloneGoalChangeValue(planWeekRecords || {}),
    weeklyCheckinsSnapshot: cloneGoalChangeValue(weeklyCheckins || {}),
    logEntries: Object.entries(logs || {})
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, entry]) => ({ date, ...cloneGoalChangeValue(entry || {}) })),
  };
};

export const buildGoalChangeHistoryEvent = ({
  todayKey = "",
  mode = GOAL_CHANGE_MODES.refineCurrentGoal,
  rawGoalIntent = "",
  previousGoals = [],
  nextGoals = [],
  archivedPlanId = "",
} = {}) => {
  const modeMeta = GOAL_CHANGE_MODE_META[mode] || GOAL_CHANGE_MODE_META[GOAL_CHANGE_MODES.refineCurrentGoal];
  return {
    id: `goal_change_${Date.now()}`,
    changedAt: new Date().toISOString(),
    effectiveDate: normalizeDateKey(todayKey),
    mode,
    label: modeMeta.label,
    rawGoalIntent: sanitizeText(rawGoalIntent, 420),
    previousGoals: [...(previousGoals || [])],
    nextGoals: [...(nextGoals || [])],
    archivedPlanId: sanitizeText(archivedPlanId, 80),
  };
};
