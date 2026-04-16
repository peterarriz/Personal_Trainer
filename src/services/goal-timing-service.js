export const DEFAULT_VISIBLE_GOAL_HORIZON_WEEKS = 12;
export const OPEN_ENDED_TIMING_VALUE = "open_ended";

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const normalizePositiveInteger = (value, fallback = null) => {
  if (value === "" || value == null) return fallback;
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(1, Math.round(numeric));
};

const toMiddayDate = (value = "") => {
  const clean = sanitizeText(value, 24);
  if (!clean) return null;
  const date = new Date(`${clean}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
};

export const formatGoalDateLabel = (value = "") => {
  const date = toMiddayDate(value);
  if (!date) return sanitizeText(value, 24);
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

export const isOpenEndedTimingValue = (value = "") => {
  const clean = sanitizeText(value, 120).toLowerCase();
  if (!clean) return false;
  if (clean === OPEN_ENDED_TIMING_VALUE) return true;
  return /open[ -]?ended|no hard (?:date|deadline|end date)|no deadline|no end date|ongoing/.test(clean);
};

export const buildVisiblePlanningHorizonLabel = (weeks = DEFAULT_VISIBLE_GOAL_HORIZON_WEEKS) => {
  const normalizedWeeks = normalizePositiveInteger(weeks, DEFAULT_VISIBLE_GOAL_HORIZON_WEEKS) || DEFAULT_VISIBLE_GOAL_HORIZON_WEEKS;
  if (normalizedWeeks === 12) return "next 3 months";
  if (normalizedWeeks % 4 === 0 && normalizedWeeks >= 8 && normalizedWeeks <= 52) {
    const months = Math.max(1, Math.round(normalizedWeeks / 4));
    return `next ${months} month${months === 1 ? "" : "s"}`;
  }
  return `next ${normalizedWeeks} week${normalizedWeeks === 1 ? "" : "s"}`;
};

export const buildTimingModeHelpText = ({
  timingMode = "open_ended",
  visibleHorizonWeeks = DEFAULT_VISIBLE_GOAL_HORIZON_WEEKS,
} = {}) => {
  const visibleHorizonLabel = buildVisiblePlanningHorizonLabel(visibleHorizonWeeks);
  if (timingMode === "exact_date") {
    return "Use an exact date when the calendar really matters.";
  }
  if (timingMode === "target_horizon") {
    return `Use a target window in weeks. The ${visibleHorizonLabel} stay a visible plan, not a forced finish line.`;
  }
  return `No fixed deadline. The ${visibleHorizonLabel} show the next phase, not the whole journey.`;
};

export const resolveGoalTimingShape = (goal = {}) => {
  const targetDate = sanitizeText(goal?.targetDate || goal?.resolvedGoal?.targetDate || "", 24);
  const targetHorizonWeeks = normalizePositiveInteger(goal?.targetHorizonWeeks ?? goal?.resolvedGoal?.targetHorizonWeeks, null);
  if (targetDate && !isOpenEndedTimingValue(targetDate)) {
    return {
      mode: "exact_date",
      targetDate,
      targetHorizonWeeks,
      openEnded: false,
    };
  }
  if (targetHorizonWeeks) {
    return {
      mode: "target_horizon",
      targetDate: "",
      targetHorizonWeeks,
      openEnded: false,
    };
  }
  return {
    mode: "open_ended",
    targetDate: "",
    targetHorizonWeeks: null,
    openEnded: true,
  };
};

export const buildGoalTimingPresentation = (
  goal = {},
  {
    visibleHorizonWeeks = DEFAULT_VISIBLE_GOAL_HORIZON_WEEKS,
    now = new Date(),
  } = {},
) => {
  const timing = resolveGoalTimingShape(goal);
  const visibleHorizonLabel = buildVisiblePlanningHorizonLabel(visibleHorizonWeeks);
  if (timing.mode === "exact_date") {
    const targetDateLabel = formatGoalDateLabel(timing.targetDate);
    const targetDate = toMiddayDate(timing.targetDate);
    const safeNow = now instanceof Date ? now : new Date(now);
    const weeksUntilTarget = targetDate && !Number.isNaN(safeNow?.getTime?.())
      ? Math.max(0, Math.ceil((targetDate.getTime() - safeNow.getTime()) / (7 * 86400000)))
      : null;
    return {
      ...timing,
      visibleHorizonLabel,
      label: `Target date: ${targetDateLabel}`,
      detail: Number.isFinite(weeksUntilTarget) && weeksUntilTarget > visibleHorizonWeeks
        ? `The ${visibleHorizonLabel} show the next phase toward this longer goal.`
        : `The ${visibleHorizonLabel} show the projected work toward this date.`,
    };
  }
  if (timing.mode === "target_horizon") {
    return {
      ...timing,
      visibleHorizonLabel,
      label: `Target horizon: about ${timing.targetHorizonWeeks} weeks`,
      detail: timing.targetHorizonWeeks > visibleHorizonWeeks
        ? `The ${visibleHorizonLabel} show the next phase of this longer push.`
        : `This is a target window, not a promise that everything ends inside the visible plan.`,
    };
  }
  return {
    ...timing,
    visibleHorizonLabel,
    label: "Open-ended",
    detail: `The ${visibleHorizonLabel} show the next phase, not a finish line.`,
  };
};
