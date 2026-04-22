import { comparePlannedDayToActual } from "../modules-checkins.js";
import { resolveCurrentPlanWeekWindow } from "./plan-week-service.js";
import {
  buildProgramRoadmapRows,
  buildProgramWeekGridCells,
} from "./program-roadmap-service.js";
import { joinDisplayParts } from "./text-format-service.js";
import {
  buildPlanDayTrustModel,
  buildPlanWeekTrustModel,
} from "./compact-trust-service.js";
import { buildGoalProgressTrackingFromGoals } from "./goal-progress-service.js";

const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];

const DAY_LABELS = Object.freeze({
  1: "Mon",
  2: "Tue",
  3: "Wed",
  4: "Thu",
  5: "Fri",
  6: "Sat",
  0: "Sun",
});

const STATUS_TONES = Object.freeze({
  completed: { color: "#2da772", background: "rgba(45, 167, 114, 0.12)", borderColor: "rgba(45, 167, 114, 0.24)" },
  upcoming: { color: "#dbe7f6", background: "rgba(30, 41, 59, 0.7)", borderColor: "rgba(71, 85, 105, 0.72)" },
  adjusted: { color: "#c97a2b", background: "rgba(201, 122, 43, 0.12)", borderColor: "rgba(201, 122, 43, 0.24)" },
  recovery: { color: "#8fa5c8", background: "rgba(100, 116, 139, 0.18)", borderColor: "rgba(100, 116, 139, 0.28)" },
  preview: { color: "#6e63d9", background: "rgba(110, 99, 217, 0.12)", borderColor: "rgba(110, 99, 217, 0.24)" },
  missed: { color: "#d85d78", background: "rgba(216, 93, 120, 0.12)", borderColor: "rgba(216, 93, 120, 0.24)" },
});

const GOAL_PROGRESS_STATUS_LABELS = Object.freeze({
  on_track: "On track",
  building: "Building",
  review_based: "Review based",
  needs_data: "Needs data",
});

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const toFiniteNumber = (value, fallback = null) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clamp01 = (value) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(1, Math.max(0, parsed));
};

const toDateKey = (date) => {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";
  return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
};

const addDays = (dateKey = "", dayOffset = 0) => {
  if (!dateKey) return "";
  const next = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(next.getTime())) return "";
  next.setDate(next.getDate() + Number(dayOffset || 0));
  return toDateKey(next);
};

const resolveCurrentDayOfWeek = (dateKey = "") => {
  const date = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(date.getTime())) return new Date().getDay();
  return date.getDay();
};

const resolveWeekStartDate = ({
  currentPlanWeek = null,
  todayKey = "",
} = {}) => (
  sanitizeText(
    currentPlanWeek?.startDate
    || currentPlanWeek?.planWeek?.startDate
    || resolveCurrentPlanWeekWindow({ todayKey }).startDate,
    40
  )
);

const resolveWeekDateMap = ({
  absoluteWeek = 1,
  currentWeek = 1,
  weekStartDate = "",
} = {}) => {
  const currentStart = new Date(`${weekStartDate}T12:00:00`);
  if (Number.isNaN(currentStart.getTime())) return {};
  const offsetWeeks = Number(absoluteWeek || currentWeek) - Number(currentWeek || 1);
  currentStart.setDate(currentStart.getDate() + (offsetWeeks * 7));
  const mappedStartDate = toDateKey(currentStart);
  return {
    1: mappedStartDate,
    2: addDays(mappedStartDate, 1),
    3: addDays(mappedStartDate, 2),
    4: addDays(mappedStartDate, 3),
    5: addDays(mappedStartDate, 4),
    6: addDays(mappedStartDate, 5),
    0: addDays(mappedStartDate, 6),
  };
};

const normalizeSessionType = ({ title = "", detail = "", isRest = false } = {}) => {
  if (isRest) return "rest";
  const normalized = `${title} ${detail}`.toLowerCase();
  if (/run \+ strength|hybrid/.test(normalized)) return "run+strength";
  if (/long run/.test(normalized)) return "long-run";
  if (/tempo|interval|threshold|quality|speed|run/.test(normalized)) return "easy-run";
  if (/strength|bench|squat|deadlift|press|row|lift/.test(normalized)) return "strength+prehab";
  if (/walk|mobility|recovery/.test(normalized)) return "rest";
  return "conditioning";
};

const buildPseudoTrainingFromCell = (cell = null) => {
  if (!cell) return null;
  const type = normalizeSessionType({
    title: cell?.title,
    detail: cell?.detail,
    isRest: Boolean(cell?.isRest),
  });
  if (type === "rest") {
    return {
      type: "rest",
      label: sanitizeText(cell?.title || "Recovery / rest", 80),
      isRecoverySlot: true,
    };
  }
  const title = sanitizeText(cell?.title || "Session", 80);
  const detail = sanitizeText(cell?.detail || "", 120);
  const training = {
    type,
    label: title,
  };
  if (type === "easy-run" || type === "long-run" || type === "run+strength") {
    training.run = {
      t: title,
      d: detail,
    };
  }
  if (type === "strength+prehab" || type === "run+strength") {
    training.strengthDose = detail || "Strength session";
    training.strengthDuration = detail || "Strength session";
  }
  if (type === "conditioning") {
    training.fallback = detail || "Conditioning session";
  }
  return training;
};

const buildPlannedRecordFromCell = ({
  cell = null,
  dateKey = "",
  weekContext = null,
} = {}) => {
  const training = buildPseudoTrainingFromCell(cell);
  if (!training) return null;
  return {
    dateKey,
    week: weekContext || {},
    base: { training },
    resolved: { training },
  };
};

const resolveGoalCategory = (goal = null) => sanitizeText(
  goal?.resolvedGoal?.planningCategory
  || goal?.planningCategory
  || goal?.category
  || "",
  40
).toLowerCase();

const resolveGoalSummary = (goal = null) => sanitizeText(
  goal?.summary
  || goal?.name
  || goal?.resolvedGoal?.summary
  || goal?.label
  || goal?.goal
  || "Goal",
  80
);

const isStrengthCell = (cell = null) => /strength|bench|squat|deadlift|press|row|lift/i.test(`${cell?.title || ""} ${cell?.detail || ""}`);
const isRunCell = (cell = null) => /run|tempo|interval|threshold|long|easy/i.test(`${cell?.title || ""} ${cell?.detail || ""}`);
const isLongRunCell = (cell = null) => /long run/i.test(`${cell?.title || ""} ${cell?.detail || ""}`);
const isQualityCell = (cell = null) => /tempo|interval|threshold|quality|speed/i.test(`${cell?.title || ""} ${cell?.detail || ""}`);
const isRecoveryCell = (cell = null) => Boolean(cell?.isRest) || /recovery|mobility|reset|walk/i.test(`${cell?.title || ""} ${cell?.detail || ""}`);
const isHybridCell = (cell = null) => /run \+ strength|hybrid/i.test(`${cell?.title || ""} ${cell?.detail || ""}`);

const buildGoalDistanceItems = ({
  goals = [],
  logs = {},
  bodyweights = [],
  dailyCheckins = {},
  weeklyCheckins = {},
  manualProgressInputs = {},
} = {}) => {
  const tracking = buildGoalProgressTrackingFromGoals({
    goals,
    logs,
    bodyweights,
    dailyCheckins,
    weeklyCheckins,
    manualProgressInputs,
  });
  const cards = Array.isArray(tracking?.goalCards) ? tracking.goalCards : [];
  const exactCards = cards.filter((card) => card?.progressAnchor?.kind === "exact_metric");
  const statusCards = cards.filter((card) => card?.progressAnchor?.kind === "status");
  const selectedCards = exactCards.slice(0, 2);
  if (selectedCards.length < 2) {
    const firstStatusCard = statusCards[0];
    if (firstStatusCard) selectedCards.push(firstStatusCard);
  }

  return selectedCards.slice(0, 2).map((card) => {
    const anchor = card?.progressAnchor || null;
    if (!anchor) return null;
    if (anchor.kind === "exact_metric") {
      return {
        key: sanitizeText(card?.goalId || card?.summary || "", 80) || `goal_distance_${card?.planningPriority || 1}`,
        kind: "exact_metric",
        summary: sanitizeText(anchor?.summary || card?.summary || "Goal", 120),
        metricLabel: sanitizeText(anchor?.metricLabel || "", 80),
        statusKey: sanitizeText(anchor?.status || card?.status || "building", 24).toLowerCase() || "building",
        statusLabel: GOAL_PROGRESS_STATUS_LABELS[sanitizeText(anchor?.status || card?.status || "building", 24).toLowerCase()] || "Building",
        distanceLabel: sanitizeText(anchor?.distanceLabel || anchor?.emptyStateLine || "", 140),
        baselineLabel: sanitizeText(anchor?.baselineLabel || "", 80),
        currentLabel: sanitizeText(anchor?.currentLabel || "", 80),
        targetLabel: sanitizeText(anchor?.targetLabel || "", 80),
        currentDate: sanitizeText(anchor?.currentDate || "", 24),
        progressRatio: clamp01(anchor?.progressRatio),
      };
    }
    return {
      key: sanitizeText(card?.goalId || card?.summary || "", 80) || `goal_status_${card?.planningPriority || 1}`,
      kind: "status",
      summary: sanitizeText(anchor?.summary || card?.summary || "Goal", 120),
      metricLabel: sanitizeText(anchor?.metricLabel || "Review anchor", 80),
      statusKey: sanitizeText(anchor?.status || card?.status || "review_based", 24).toLowerCase() || "review_based",
      statusLabel: GOAL_PROGRESS_STATUS_LABELS[sanitizeText(anchor?.status || card?.status || "review_based", 24).toLowerCase()] || "Review based",
      headline: sanitizeText(anchor?.headline || "", 120),
      detailLine: sanitizeText(anchor?.detailLine || "", 200),
      noteLine: sanitizeText(anchor?.noteLine || "", 180),
    };
  }).filter(Boolean);
};

const buildStatusModel = ({
  cell = null,
  dateKey = "",
  todayKey = "",
  weekContext = null,
  logEntry = null,
  dailyCheckin = null,
  isPreview = false,
  isToday = false,
  todayWasAdjusted = false,
} = {}) => {
  if (isPreview) {
    return {
      key: "preview",
      label: "Preview",
      detail: "This is still forecast and can change.",
      tone: STATUS_TONES.preview,
    };
  }

  const isRecovery = isRecoveryCell(cell);
  const comparison = comparePlannedDayToActual({
    plannedDayRecord: buildPlannedRecordFromCell({ cell, dateKey, weekContext }),
    actualLog: logEntry || {},
    dailyCheckin: dailyCheckin || {},
    dateKey,
  });

  if (comparison?.completionKind === "as_prescribed") {
    return {
      key: "completed",
      label: "Completed",
      detail: "Finished as prescribed.",
      tone: STATUS_TONES.completed,
    };
  }
  if (comparison?.completionKind === "modified" || comparison?.completionKind === "custom_session") {
    return {
      key: "adjusted",
      label: "Adjusted",
      detail: comparison?.summary || "The actual session changed from plan.",
      tone: STATUS_TONES.adjusted,
    };
  }
  if (comparison?.completionKind === "skipped" || comparison?.differenceKind === "not_logged_over_48h") {
    return {
      key: "missed",
      label: "Missed",
      detail: comparison?.summary || "The planned work did not happen.",
      tone: STATUS_TONES.missed,
    };
  }
  if (isToday && todayWasAdjusted) {
    return {
      key: "adjusted",
      label: "Adjusted",
      detail: "Today's prescription has already been tuned.",
      tone: STATUS_TONES.adjusted,
    };
  }
  if (isRecovery) {
    return {
      key: "recovery",
      label: "Recovery",
      detail: dateKey && dateKey < todayKey ? "Recovery slot in the committed week." : "Recovery slot protects the next key session.",
      tone: STATUS_TONES.recovery,
    };
  }
  return {
    key: "upcoming",
    label: "Upcoming",
    detail: isToday ? "This is the active session for today." : "Still ahead in the committed week.",
    tone: STATUS_TONES.upcoming,
  };
};

const buildDaySummaryLine = (cell = null, status = null) => {
  if (!cell) return "";
  if (status?.key === "preview") return "Forecast";
  if (status?.key === "completed") return "Done";
  if (status?.key === "missed") return "Missed";
  if (status?.key === "adjusted") return "Changed";
  if (status?.key === "recovery") return "Recovery";
  return "Ahead";
};

const buildWeekDays = ({
  weekRow = null,
  currentWeek = 1,
  weekStartDate = "",
  todayKey = "",
  liveTodayTraining = null,
  fallbackSessionsByDay = {},
  logs = {},
  dailyCheckins = {},
  todayWasAdjusted = false,
} = {}) => {
  const absoluteWeek = Number(weekRow?.absoluteWeek || currentWeek || 1);
  const isPreviewWeek = absoluteWeek > Number(currentWeek || 1);
  const currentDayOfWeek = resolveCurrentDayOfWeek(todayKey);
  const cells = buildProgramWeekGridCells({
    weekRow,
    currentWeek,
    currentDayOfWeek,
    liveTodayTraining,
    fallbackSessionsByDay,
  });
  const dateMap = resolveWeekDateMap({
    absoluteWeek,
    currentWeek,
    weekStartDate,
  });
  return cells.map((cell) => {
    const dateKey = dateMap[cell.dayKey] || "";
    const isToday = Boolean(dateKey && dateKey === todayKey);
    const status = buildStatusModel({
      cell,
      dateKey,
      todayKey,
      weekContext: weekRow?.planWeek || null,
      logEntry: logs?.[dateKey] || null,
      dailyCheckin: dailyCheckins?.[dateKey] || null,
      isPreview: isPreviewWeek,
      isToday,
      todayWasAdjusted,
    });
    const dayModel = {
      key: `${absoluteWeek}_${cell.dayKey}`,
      dayKey: cell.dayKey,
      dayLabel: DAY_LABELS[cell.dayKey] || cell.dayLabel || "",
      dateKey,
      title: sanitizeText(cell.title || "Session", 72),
      detail: sanitizeText(cell.detail || "", 120),
      isToday,
      isRest: Boolean(cell.isRest),
      isHybrid: isHybridCell(cell),
      isRun: isRunCell(cell),
      isStrength: isStrengthCell(cell),
      isQuality: isQualityCell(cell),
      isLongRun: isLongRunCell(cell),
      status,
      summaryLabel: buildDaySummaryLine(cell, status),
      actionLabel: isToday ? "Open today" : "Review day",
    };
    return {
      ...dayModel,
      trustModel: buildPlanDayTrustModel({ day: dayModel, preview: isPreviewWeek }),
    };
  });
};

const buildWeekShapeLine = (days = []) => {
  const plannedDays = days.filter((day) => !day?.isRest);
  const runCount = plannedDays.filter((day) => day?.isRun || day?.isLongRun || day?.isHybrid).length;
  const strengthCount = plannedDays.filter((day) => day?.isStrength || day?.isHybrid).length;
  const recoveryCount = days.filter((day) => day?.isRest).length;
  return joinDisplayParts([
    `${plannedDays.length} planned sessions`,
    runCount ? `${runCount} run day${runCount === 1 ? "" : "s"}` : "",
    strengthCount ? `${strengthCount} strength day${strengthCount === 1 ? "" : "s"}` : "",
    recoveryCount ? `${recoveryCount} recovery slot${recoveryCount === 1 ? "" : "s"}` : "",
  ]) || "This week is mapped.";
};

const buildStatusSummaryLine = (days = []) => {
  const completedCount = days.filter((day) => day?.status?.key === "completed").length;
  const adjustedCount = days.filter((day) => day?.status?.key === "adjusted").length;
  const missedCount = days.filter((day) => day?.status?.key === "missed").length;
  if (missedCount > 0) {
    return `${missedCount} day${missedCount === 1 ? "" : "s"} missed, ${adjustedCount} adjusted, ${completedCount} completed.`;
  }
  if (adjustedCount > 0) {
    return `${adjustedCount} day${adjustedCount === 1 ? "" : "s"} adjusted, ${completedCount} completed so far.`;
  }
  if (completedCount > 0) {
    return `${completedCount} day${completedCount === 1 ? "" : "s"} completed so far.`;
  }
  return "Nothing has been logged yet this week.";
};

const buildGoalAlignmentItems = ({ goals = [], days = [] } = {}) => {
  const plannedDays = days.filter((day) => !day?.isRest);
  const runCount = plannedDays.filter((day) => day?.isRun || day?.isLongRun || day?.isHybrid).length;
  const strengthCount = plannedDays.filter((day) => day?.isStrength || day?.isHybrid).length;
  const longRunPresent = plannedDays.some((day) => day?.isLongRun);
  const qualityPresent = plannedDays.some((day) => day?.isQuality);
  const recoveryCount = days.filter((day) => day?.isRest).length;

  const items = (Array.isArray(goals) ? goals : []).slice(0, 3).map((goal) => {
    const category = resolveGoalCategory(goal);
    const summary = resolveGoalSummary(goal);
    if (category === "running") {
      return {
        label: summary,
        detail: longRunPresent
          ? `The long run stays in view, and ${qualityPresent ? "quality work is still present." : "the rest of the run week stays supportive."}`
          : `${runCount} run day${runCount === 1 ? "" : "s"} keep the running lane moving.`,
      };
    }
    if (category === "strength") {
      return {
        label: summary,
        detail: `${strengthCount} strength day${strengthCount === 1 ? "" : "s"} keep the lifting lane alive without crowding the week.`,
      };
    }
    if (category === "body_comp") {
      return {
        label: summary,
        detail: `${plannedDays.length} planned sessions plus ${recoveryCount} recovery slot${recoveryCount === 1 ? "" : "s"} support output while recovery stays visible.`,
      };
    }
    return {
      label: summary,
      detail: buildWeekShapeLine(days),
    };
  });

  if (items.length) return items;
  return [{
    label: "Goal balance",
    detail: buildWeekShapeLine(days),
  }];
};

const buildUpcomingSessionItems = ({
  currentWeekDays = [],
  nextWeekDays = [],
  todayKey = "",
} = {}) => {
  const committedUpcoming = currentWeekDays.filter((day) => day?.dateKey >= todayKey && !day?.isRest && day?.status?.key !== "completed");
  const weighted = committedUpcoming
    .map((day) => ({
      ...day,
      weight: day.isLongRun ? 5 : day.isQuality ? 4 : day.isStrength ? 3 : day.isHybrid ? 3 : 1,
      preview: false,
    }))
    .sort((a, b) => b.weight - a.weight || a.dateKey.localeCompare(b.dateKey));

  const previewCandidates = nextWeekDays
    .filter((day) => !day?.isRest)
    .map((day) => ({
      ...day,
      weight: day.isLongRun ? 5 : day.isQuality ? 4 : day.isStrength ? 3 : day.isHybrid ? 3 : 1,
      preview: true,
    }))
    .sort((a, b) => b.weight - a.weight || a.dayKey - b.dayKey);

  return [...weighted, ...previewCandidates].slice(0, 3).map((day) => ({
    key: `${day.key}_upcoming`,
    title: day.title,
    detail: day.detail,
    dayLabel: day.dayLabel,
    statusLabel: day.preview ? "Preview" : day.status?.label || "Upcoming",
    preview: Boolean(day.preview),
  }));
};

const buildPreviewWeekSummary = (weekRow = null, days = []) => {
  if (!weekRow) return null;
  return {
    absoluteWeek: Number(weekRow?.absoluteWeek || 0) || null,
    label: sanitizeText(weekRow?.weekLabel || `Week ${weekRow?.absoluteWeek || ""}`, 80),
    focus: sanitizeText(
      weekRow?.planWeek?.weeklyIntent?.focus
      || weekRow?.planWeek?.summary
      || weekRow?.focus
      || "The next week is still forecast.",
      140
    ),
    shapeLine: buildWeekShapeLine(days),
    days: days.slice(0, 7),
  };
};

export const buildPlanSurfaceModel = ({
  planDay = null,
  surfaceModel = null,
  currentPlanWeek = null,
  currentWeek = 1,
  rollingHorizon = [],
  logs = {},
  bodyweights = [],
  dailyCheckins = {},
  weeklyCheckins = {},
  athleteGoals = [],
  manualProgressInputs = {},
  todayWorkout = null,
} = {}) => {
  const todayKey = sanitizeText(planDay?.dateKey || toDateKey(new Date()), 40);
  const weekStartDate = resolveWeekStartDate({
    currentPlanWeek,
    todayKey,
  });
  const currentWeekRow = {
    kind: "plan",
    absoluteWeek: Number(currentWeek || 1),
    weekLabel: sanitizeText(currentPlanWeek?.label || `Week ${currentWeek || 1}`, 80),
    planWeek: currentPlanWeek || {},
  };
  const normalizedHorizon = [
    currentWeekRow,
    ...(Array.isArray(rollingHorizon) ? rollingHorizon.filter((row) => Number(row?.absoluteWeek || 0) > Number(currentWeek || 1)) : []),
  ]
    .filter(Boolean)
    .reduce((rows, row) => {
      const absoluteWeek = Number(row?.absoluteWeek || 0);
      if (!absoluteWeek || rows.some((existing) => Number(existing?.absoluteWeek || 0) === absoluteWeek)) return rows;
      rows.push(row);
      return rows;
    }, [])
    .slice(0, 4);

  const roadmapRows = buildProgramRoadmapRows({
    displayHorizon: normalizedHorizon,
    currentWeek,
  });

  const currentWeekDays = buildWeekDays({
    weekRow: currentWeekRow,
    currentWeek,
    weekStartDate,
    todayKey,
    liveTodayTraining: todayWorkout || planDay?.resolved?.training || null,
    fallbackSessionsByDay: currentPlanWeek?.sessionsByDay || {},
    logs,
    dailyCheckins,
    todayWasAdjusted: Boolean(planDay?.decision?.modifiedFromBase || planDay?.flags?.isModified),
  });

  const nextPreviewRow = normalizedHorizon.find((row) => Number(row?.absoluteWeek || 0) > Number(currentWeek || 1)) || null;
  const nextWeekDays = nextPreviewRow
    ? buildWeekDays({
      weekRow: nextPreviewRow,
      currentWeek,
      weekStartDate,
      todayKey,
      liveTodayTraining: null,
      fallbackSessionsByDay: nextPreviewRow?.planWeek?.sessionsByDay || {},
      logs,
      dailyCheckins,
      todayWasAdjusted: false,
    })
    : [];

  const currentDay = currentWeekDays.find((day) => day?.isToday) || currentWeekDays.find((day) => day?.dateKey >= todayKey) || currentWeekDays[0] || null;
  const alignmentItems = buildGoalAlignmentItems({
    goals: athleteGoals,
    days: currentWeekDays,
  });
  const previewWeek = buildPreviewWeekSummary(nextPreviewRow, nextWeekDays);
  const goalDistanceItems = buildGoalDistanceItems({
    goals: athleteGoals,
    logs,
    bodyweights,
    dailyCheckins,
    weeklyCheckins,
    manualProgressInputs,
  });

  return {
    weekLabel: sanitizeText(currentPlanWeek?.label || `Week ${currentWeek || 1}`, 80),
    intentLine: sanitizeText(
      currentPlanWeek?.weeklyIntent?.focus
      || currentPlanWeek?.summary
      || surfaceModel?.display?.purpose
      || "This week keeps the current goals moving without letting one lane crowd out the others.",
      180
    ),
    balanceLine: buildWeekShapeLine(currentWeekDays),
    commitmentLabel: "Committed week",
    commitmentLine: "This week is committed. Future weeks stay preview-only until they arrive.",
    currentDay,
    currentWeekDays,
    currentWeekSummaryLine: buildStatusSummaryLine(currentWeekDays),
    goalDistanceItems,
    alignmentItems,
    weekTrustModel: buildPlanWeekTrustModel({
      currentDay,
      previewWeek,
    }),
    roadmapRows: roadmapRows.map((row) => ({
      ...row,
      stateLabel: row?.isCurrentWeek ? "Committed" : "Preview",
    })),
    upcomingKeySessions: buildUpcomingSessionItems({
      currentWeekDays,
      nextWeekDays,
      todayKey,
    }),
    previewWeek,
  };
};

export default buildPlanSurfaceModel;
