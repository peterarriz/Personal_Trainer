import { COACH_TOOL_ACTIONS } from "../modules-coach-engine.js";
import { describeProvenanceRecord } from "./provenance-service.js";
import { getNutritionDayTypeLabel } from "./nutrition-day-taxonomy-service.js";

const sanitizeText = (value = "", maxLength = 200) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const dedupeStrings = (items = []) => {
  const seen = new Set();
  return toArray(items)
    .map((item) => sanitizeText(item, 220))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const humanizeText = (value = "") => sanitizeText(String(value || "").replace(/_/g, " "), 120);

const formatDateTimeLabel = (value = null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return "";
  try {
    return new Date(numeric).toLocaleString();
  } catch {
    return "";
  }
};

export const COACH_SURFACE_MODES = Object.freeze({
  todayWeek: "today_week",
  changePlan: "change_plan",
  askAnything: "ask_anything",
});

export const buildCoachActionLabel = (actionType = "") => {
  const normalized = sanitizeText(actionType, 80).toUpperCase();
  if (!normalized) return "Coach action";
  if (normalized === COACH_TOOL_ACTIONS.SWAP_TODAY_RECOVERY) return "Make today a recovery day";
  if (normalized === COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME) return "Reduce this week's volume";
  if (normalized === COACH_TOOL_ACTIONS.CONVERT_RUN_TO_LOW_IMPACT || normalized === COACH_TOOL_ACTIONS.REPLACE_SPEED_EASY) return "Swap high-impact for low-impact";
  if (normalized === COACH_TOOL_ACTIONS.SIMPLIFY_MEALS_THIS_WEEK || normalized === COACH_TOOL_ACTIONS.USE_DEFAULT_MEAL_STRUCTURE_3_DAYS) return "Simplify meals this week";
  if (normalized === COACH_TOOL_ACTIONS.SET_PAIN_STATE || normalized === COACH_TOOL_ACTIONS.ADD_ACHILLES_BLOCK) return "Add pain-aware modifications";
  if (normalized === COACH_TOOL_ACTIONS.INSERT_DELOAD_WEEK) return "Insert deload next week";
  if (normalized === COACH_TOOL_ACTIONS.MOVE_LONG_RUN) return "Move long run";
  if (normalized === COACH_TOOL_ACTIONS.CHANGE_NUTRITION_DAY) return "Change today's nutrition day";
  if (normalized === COACH_TOOL_ACTIONS.PROGRESS_STRENGTH_EMPHASIS) return "Progress strength emphasis";
  return humanizeText(normalized) || "Coach action";
};

export const buildCoachQuickChangeActions = ({
  currentWeek = 1,
  todayWorkout = null,
  injuryArea = "Achilles",
} = {}) => {
  const sessionType = sanitizeText(todayWorkout?.type || todayWorkout?.label || "", 80).toLowerCase();
  const looksRunFocused = /\brun\b|\blong\b|\btempo\b|\beasy\b/.test(sessionType);

  return [
    {
      id: "swap_today_recovery",
      label: buildCoachActionLabel(COACH_TOOL_ACTIONS.SWAP_TODAY_RECOVERY),
      description: "Replace today's load with a safer recovery version.",
      scopeLabel: "Today",
      action: {
        type: COACH_TOOL_ACTIONS.SWAP_TODAY_RECOVERY,
        payload: {
          reason: "manual_recovery_day",
        },
      },
    },
    {
      id: "reduce_week_volume",
      label: buildCoachActionLabel(COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME),
      description: "Pull the current week back without changing your goals.",
      scopeLabel: "This week",
      action: {
        type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME,
        payload: {
          pct: 12,
          reason: "manual_volume_reduction",
        },
      },
    },
    looksRunFocused ? {
      id: "swap_low_impact",
      label: buildCoachActionLabel(COACH_TOOL_ACTIONS.REPLACE_SPEED_EASY),
      description: "Trade the riskier run stress for easier low-impact work.",
      scopeLabel: "Today",
      action: {
        type: COACH_TOOL_ACTIONS.REPLACE_SPEED_EASY,
        payload: {
          week: currentWeek,
          reason: "manual_low_impact_swap",
        },
      },
    } : null,
    {
      id: "simplify_meals",
      label: buildCoachActionLabel(COACH_TOOL_ACTIONS.SIMPLIFY_MEALS_THIS_WEEK),
      description: "Lower nutrition friction while keeping the week usable.",
      scopeLabel: "Nutrition",
      action: {
        type: COACH_TOOL_ACTIONS.SIMPLIFY_MEALS_THIS_WEEK,
        payload: {
          days: 7,
          reason: "manual_meal_simplify",
        },
      },
    },
    {
      id: "pain_mods",
      label: buildCoachActionLabel(COACH_TOOL_ACTIONS.SET_PAIN_STATE),
      description: `Bias the plan toward safer options for ${injuryArea}.`,
      scopeLabel: "Pain-aware",
      action: {
        type: COACH_TOOL_ACTIONS.SET_PAIN_STATE,
        payload: {
          level: "mild_tightness",
          area: sanitizeText(injuryArea, 40) || "Achilles",
        },
      },
    },
    {
      id: "insert_deload",
      label: buildCoachActionLabel(COACH_TOOL_ACTIONS.INSERT_DELOAD_WEEK),
      description: "Stage a lighter next week before you accept it.",
      scopeLabel: "Next week",
      action: {
        type: COACH_TOOL_ACTIONS.INSERT_DELOAD_WEEK,
        payload: {
          week: Math.max(1, Number(currentWeek || 1) + 1),
          reason: "manual_deload",
        },
      },
    },
    looksRunFocused ? {
      id: "move_long_run",
      label: buildCoachActionLabel(COACH_TOOL_ACTIONS.MOVE_LONG_RUN),
      description: "Push the long run later instead of forcing it into a bad day.",
      scopeLabel: "Schedule",
      action: {
        type: COACH_TOOL_ACTIONS.MOVE_LONG_RUN,
        payload: {
          days: 1,
          week: Math.max(1, Number(currentWeek || 1)),
          reason: "manual_long_run_move",
        },
      },
    } : null,
  ].filter(Boolean);
};

const describeCoachActionPreviewSummary = (action = null) => {
  const type = sanitizeText(action?.type || "", 80).toUpperCase();
  if (type === COACH_TOOL_ACTIONS.SWAP_TODAY_RECOVERY) return "Start with recovery instead of forcing the planned workload.";
  if (type === COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME) return "Take pressure off this week while keeping the plan direction intact.";
  if (type === COACH_TOOL_ACTIONS.CONVERT_RUN_TO_LOW_IMPACT || type === COACH_TOOL_ACTIONS.REPLACE_SPEED_EASY) return "Swap the riskier session for an easier low-impact version.";
  if (type === COACH_TOOL_ACTIONS.SIMPLIFY_MEALS_THIS_WEEK || type === COACH_TOOL_ACTIONS.USE_DEFAULT_MEAL_STRUCTURE_3_DAYS) return "Trade food complexity for a simpler structure you can repeat.";
  if (type === COACH_TOOL_ACTIONS.SET_PAIN_STATE || type === COACH_TOOL_ACTIONS.ADD_ACHILLES_BLOCK) return "Bias the next block toward pain-aware modifications.";
  if (type === COACH_TOOL_ACTIONS.INSERT_DELOAD_WEEK) return "Stage a lighter next week before it becomes canonical.";
  if (type === COACH_TOOL_ACTIONS.MOVE_LONG_RUN) return "Move the long run later instead of stacking it into a bad day.";
  if (type === COACH_TOOL_ACTIONS.CHANGE_NUTRITION_DAY) return "Realign today's nutrition with the training day you actually need.";
  if (type === COACH_TOOL_ACTIONS.PROGRESS_STRENGTH_EMPHASIS) return "Nudge strength emphasis forward without silently changing the whole plan.";
  return "Preview a deterministic coach change before it becomes part of the plan.";
};

export const buildCoachActionPreviewModel = ({
  action = null,
  commitResult = null,
  currentWeek = 1,
  todayKey = "",
  todayWorkout = null,
} = {}) => {
  if (!action || !commitResult) {
    return {
      status: "idle",
      headline: "",
      summary: "",
      effectLines: [],
      auditLine: "",
    };
  }

  if (!commitResult.ok || !commitResult.mutation) {
    return {
      status: "blocked",
      headline: buildCoachActionLabel(action?.type),
      summary: sanitizeText(commitResult?.ui?.message || "This proposal cannot be committed through the deterministic gate.", 220),
      effectLines: [],
      auditLine: "Nothing changes unless a deterministic preview can be accepted.",
    };
  }

  const nextWeekKey = Math.max(1, Number(action?.payload?.week || currentWeek || 1));
  const mutation = commitResult.mutation || {};
  const weekVolumePct = Number(mutation?.adjustments?.weekVolumePct?.[currentWeek]);
  const futureWeekVolumePct = Number(mutation?.adjustments?.weekVolumePct?.[nextWeekKey]);
  const todayOverride = mutation?.adjustments?.dayOverrides?.[todayKey] || null;
  const nutritionOverride = mutation?.adjustments?.nutritionOverrides?.[todayKey] || null;
  const extra = mutation?.adjustments?.extra || {};
  const nextPersonalization = mutation?.personalization || {};
  const weekNote = sanitizeText(
    mutation?.weekNotes?.[nextWeekKey]
    || mutation?.weekNotes?.[currentWeek]
    || "",
    220
  );
  const injuryLevel = sanitizeText(nextPersonalization?.injuryPainState?.level || "", 80);
  const injuryArea = sanitizeText(nextPersonalization?.injuryPainState?.area || action?.payload?.area || "", 60);

  return {
    status: "ready",
    headline: buildCoachActionLabel(action?.type),
    summary: describeCoachActionPreviewSummary(action),
    effectLines: dedupeStrings([
      todayOverride
        ? `Today switches to ${sanitizeText(todayOverride?.label || humanizeText(todayOverride?.type) || "a recovery override", 120)}.`
        : "",
      Number.isFinite(weekVolumePct)
        ? `Week ${currentWeek} volume target becomes ${weekVolumePct}% of normal.`
        : "",
      Number.isFinite(futureWeekVolumePct) && nextWeekKey !== currentWeek
        ? `Week ${nextWeekKey} volume target becomes ${futureWeekVolumePct}% of normal.`
        : "",
      nutritionOverride?.dayType
        ? `Today's nutrition day changes to ${getNutritionDayTypeLabel(nutritionOverride.dayType) || humanizeText(nutritionOverride.dayType)}.`
        : "",
      injuryLevel && injuryArea
        ? `${humanizeText(injuryArea)} is tracked as ${humanizeText(injuryLevel)} for future plan safeguards.`
        : "",
      Number.isFinite(extra?.strengthEmphasisWeeks)
        ? `Strength emphasis is nudged for ${extra.strengthEmphasisWeeks} week${extra.strengthEmphasisWeeks === 1 ? "" : "s"}.`
        : "",
      Number.isFinite(extra?.defaultMealStructureDays)
        ? `Default meal structure is used for ${extra.defaultMealStructureDays} day${extra.defaultMealStructureDays === 1 ? "" : "s"}.`
        : "",
      extra?.mealSimplicityMode
        ? "Meal planning shifts to a simpler structure for this week."
        : "",
      extra?.travelNutritionMode
        ? "Travel nutrition mode becomes active."
        : "",
      Number.isFinite(extra?.nutritionCalorieDelta)
        ? `Nutrition target shifts by about ${extra.nutritionCalorieDelta} kcal per day.`
        : "",
      Number.isFinite(extra?.longRunReductionPct)
        ? `Long-run aggressiveness drops by ${extra.longRunReductionPct}%.`
        : "",
      weekNote ? `Audit note: ${weekNote}` : "",
      todayWorkout?.label
        ? `Current reference session: ${sanitizeText(todayWorkout.label, 120)}.`
        : "",
    ]),
    auditLine: commitResult?.accepted?.acceptancePolicy === "acceptance_only"
      ? "Nothing changes until you explicitly accept this deterministic preview."
      : "This change still requires explicit acceptance.",
  };
};

export const buildCoachActionHistoryModel = ({
  coachActions = [],
} = {}) => (
  (coachActions || [])
    .filter((action) => action?.acceptedBy)
    .map((action, index) => ({
      id: sanitizeText(action?.id || `coach_action_${index}`, 120) || `coach_action_${index}`,
      headline: buildCoachActionLabel(action?.type),
      detail: sanitizeText(action?.reason || action?.rationale || "Accepted deterministic change.", 220),
      timestampLabel: formatDateTimeLabel(action?.ts || 0),
      proposalSourceLabel: humanizeText(action?.proposalSource || action?.source || "coach surface") || "coach surface",
      auditLine: describeProvenanceRecord(
        action?.provenance,
        action?.acceptedBy
          ? `Accepted through ${humanizeText(action.acceptedBy)}.`
          : "Accepted deterministic change."
      ),
    }))
);

export const buildCoachAskAnythingStateModel = ({
  apiKey = "",
} = {}) => {
  const aiAvailable = Boolean(sanitizeText(apiKey, 20));
  return {
    aiAvailable,
    advisoryOnly: true,
    canMutatePlan: false,
    headline: aiAvailable ? "Advisory only" : "AI advisory is off",
    detail: aiAvailable
      ? "Answers here can interpret, explain, and suggest. They never change plan state."
      : "Open-ended Coach Q&A is unavailable right now. This mode never changes plan state.",
  };
};
