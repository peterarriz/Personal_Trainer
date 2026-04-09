import {
  DEFAULT_PLANNING_HORIZON_WEEKS,
  buildPlanWeek,
  buildRollingHorizonWeeks,
  getHorizonAnchor,
} from "../modules-planning.js";

const toAnchorDate = ({ planStartDate = "", fallbackStartDate = null } = {}) => {
  if (planStartDate) return new Date(`${planStartDate}T12:00:00`);
  if (fallbackStartDate instanceof Date) return new Date(fallbackStartDate.getTime());
  if (fallbackStartDate) return new Date(fallbackStartDate);
  return new Date();
};

export const resolveCurrentPlanWeekNumber = ({
  planStartDate = "",
  fallbackStartDate = null,
  now = new Date(),
} = {}) => {
  const anchor = toAnchorDate({ planStartDate, fallbackStartDate });
  const diff = (now - anchor) / (1000 * 60 * 60 * 24 * 7);
  return Math.max(1, Math.ceil(diff));
};

export const resolvePlanWeekNumberForDateKey = ({
  dateKey = "",
  planStartDate = "",
  fallbackStartDate = null,
} = {}) => {
  const anchor = toAnchorDate({ planStartDate, fallbackStartDate });
  const dateObj = new Date(`${dateKey}T12:00:00`);
  const diffWeeks = Math.ceil((dateObj - anchor) / (1000 * 60 * 60 * 24 * 7));
  return Math.max(1, diffWeeks);
};

export const resolveCurrentPlanWeekWindow = ({ todayKey = "" } = {}) => {
  const weekStart = new Date(`${todayKey}T12:00:00`);
  const weekStartDay = weekStart.getDay();
  const mondayShift = weekStartDay === 0 ? -6 : 1 - weekStartDay;
  weekStart.setDate(weekStart.getDate() + mondayShift);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekEnd.getDate() + 6);
  return {
    startDate: weekStart.toISOString().split("T")[0],
    endDate: weekEnd.toISOString().split("T")[0],
  };
};

export const assembleCurrentPlanWeek = ({
  todayKey = "",
  currentWeek = 1,
  baseWeek = {},
  goals = [],
  planComposer = {},
  momentum = {},
  learningLayer = {},
  currentWeeklyCheckin = {},
  coachPlanAdjustments = {},
  failureMode = {},
  environmentSelection = null,
} = {}) => {
  const { startDate, endDate } = resolveCurrentPlanWeekWindow({ todayKey });

  return buildPlanWeek({
    weekNumber: currentWeek,
    template: baseWeek,
    referenceTemplate: baseWeek,
    label: `${baseWeek?.phase || "BASE"} - Week ${currentWeek}`,
    specificity: "high",
    kind: "plan",
    startDate,
    endDate,
    goals,
    architecture: planComposer?.architecture || "hybrid_performance",
    blockIntent: planComposer?.blockIntent || null,
    split: planComposer?.split || null,
    sessionsByDay: planComposer?.dayTemplates || null,
    momentum,
    learningLayer,
    weeklyCheckin: currentWeeklyCheckin,
    coachPlanAdjustments,
    failureMode,
    environmentSelection,
    constraints: planComposer?.constraints || [],
  });
};

export const overlayCanonicalCurrentPlanWeek = ({
  rollingHorizon = [],
  currentWeek = 1,
  currentPlanWeek = null,
} = {}) => (
  (rollingHorizon || []).map((row) => (
    row?.kind === "plan" && row?.absoluteWeek === currentWeek && currentPlanWeek
      ? {
          ...row,
          planWeek: currentPlanWeek,
          weekLabel: currentPlanWeek.label,
          template: currentPlanWeek.template || row.template,
        }
      : row
  ))
);

export const assemblePlanWeekRuntime = ({
  todayKey = "",
  currentWeek = 1,
  dayOfWeek = 0,
  goals = [],
  baseWeek = {},
  weekTemplates = [],
  planComposer = {},
  momentum = {},
  learningLayer = {},
  weeklyCheckins = {},
  coachPlanAdjustments = {},
  failureMode = {},
  environmentSelection = null,
  horizonWeeks = DEFAULT_PLANNING_HORIZON_WEEKS,
} = {}) => {
  const currentWeeklyCheckin = weeklyCheckins?.[String(currentWeek)] || {};
  const currentPlanWeek = assembleCurrentPlanWeek({
    todayKey,
    currentWeek,
    baseWeek,
    goals,
    planComposer,
    momentum,
    learningLayer,
    currentWeeklyCheckin,
    coachPlanAdjustments,
    failureMode,
    environmentSelection,
  });
  const currentPlanSession = currentPlanWeek?.sessionsByDay?.[dayOfWeek] || planComposer?.dayTemplates?.[dayOfWeek] || null;
  const rollingHorizonBase = buildRollingHorizonWeeks({
    currentWeek,
    horizonWeeks,
    goals,
    weekTemplates,
    architecture: planComposer?.architecture || "hybrid_performance",
    blockIntent: planComposer?.blockIntent || null,
    split: planComposer?.split || null,
    sessionsByDay: planComposer?.dayTemplates || null,
    referenceTemplate: baseWeek,
    momentum,
    learningLayer,
    weeklyCheckins,
    coachPlanAdjustments,
    failureMode,
    environmentSelection,
    constraints: planComposer?.constraints || [],
  });

  return {
    currentWeeklyCheckin,
    currentPlanWeek,
    currentPlanSession,
    rollingHorizonBase,
    rollingHorizon: overlayCanonicalCurrentPlanWeek({
      rollingHorizon: rollingHorizonBase,
      currentWeek,
      currentPlanWeek,
    }),
    horizonAnchor: getHorizonAnchor(goals, horizonWeeks),
  };
};

export const buildFallbackProgramPreviewWeeks = ({
  currentWeek = 1,
  currentPlanWeek = null,
  weekTemplates = [],
  goals = [],
  planComposer = {},
  momentum = {},
  learningLayer = {},
  weeklyCheckins = {},
  failureMode = {},
  environmentSelection = null,
  previewLength = 4,
} = {}) => {
  const fallbackReferenceTemplate = currentPlanWeek?.template
    || weekTemplates[Math.max(0, Math.min(currentWeek - 1, weekTemplates.length - 1))]
    || weekTemplates[0]
    || {};

  return Array.from({ length: previewLength }).map((_, idx) => {
    const absoluteWeek = currentWeek + idx;
    const template = weekTemplates[Math.max(0, Math.min(absoluteWeek - 1, weekTemplates.length - 1))] || weekTemplates[0] || {};
    const planWeek = buildPlanWeek({
      weekNumber: absoluteWeek,
      template,
      referenceTemplate: fallbackReferenceTemplate,
      label: `${template?.phase || "BASE"} · Week ${absoluteWeek}`,
      specificity: idx <= 1 ? "high" : idx <= 5 ? "medium" : "directional",
      kind: "plan",
      goals,
      architecture: planComposer?.architecture || "hybrid_performance",
      blockIntent: planComposer?.blockIntent || null,
      split: planComposer?.split || null,
      sessionsByDay: planComposer?.dayTemplates || null,
      momentum,
      learningLayer,
      weeklyCheckin: weeklyCheckins?.[String(absoluteWeek)] || {},
      failureMode: absoluteWeek === currentWeek ? failureMode : {},
      environmentSelection: absoluteWeek === currentWeek ? environmentSelection : null,
      constraints: planComposer?.constraints || [],
    });

    return {
      kind: "plan",
      slot: idx + 1,
      absoluteWeek,
      planWeek,
      template,
      weekLabel: planWeek?.label || `${template?.phase || "BASE"} · Week ${absoluteWeek}`,
      source: {
        mode: "program_preview_fallback",
        usesTemplateFallback: Boolean(planWeek?.source?.usesTemplateFallback),
      },
    };
  });
};

// Prefer canonical horizon rows. The fallback preview keeps Program usable
// while the rest of the weekly planning stack is still being extracted.
export const resolveProgramDisplayHorizon = ({
  rollingHorizon = [],
  currentWeek = 1,
  currentPlanWeek = null,
  weekTemplates = [],
  goals = [],
  planComposer = {},
  momentum = {},
  learningLayer = {},
  weeklyCheckins = {},
  failureMode = {},
  environmentSelection = null,
  previewLength = 4,
} = {}) => {
  const safeRollingHorizon = Array.isArray(rollingHorizon) ? rollingHorizon : [];
  if (safeRollingHorizon.length > 0) return safeRollingHorizon;

  return buildFallbackProgramPreviewWeeks({
    currentWeek,
    currentPlanWeek,
    weekTemplates,
    goals,
    planComposer,
    momentum,
    learningLayer,
    weeklyCheckins,
    failureMode,
    environmentSelection,
    previewLength,
  });
};
