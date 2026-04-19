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
  todayWeek: "adjust_today",
  changePlan: "adjust_week",
  askAnything: "ask_coach",
});

export const buildCoachModeCards = ({
  activeMode = COACH_SURFACE_MODES.todayWeek,
} = {}) => ([
  {
    id: COACH_SURFACE_MODES.todayWeek,
    label: "Adjust today",
    description: "Pick the situation and see one recommended move.",
    emphasis: "primary",
    active: activeMode === COACH_SURFACE_MODES.todayWeek,
  },
  {
    id: COACH_SURFACE_MODES.changePlan,
    label: "Adjust this week",
    description: "See one weekly change before it touches the plan.",
    emphasis: "primary",
    active: activeMode === COACH_SURFACE_MODES.changePlan,
  },
  {
    id: COACH_SURFACE_MODES.askAnything,
    label: "Ask coach",
    description: "Get an answer first. Preview a change before you use it.",
    emphasis: "secondary",
    active: activeMode === COACH_SURFACE_MODES.askAnything,
  },
]);

export const buildCoachActionLabel = (actionType = "") => {
  const normalized = sanitizeText(actionType, 80).toUpperCase();
  if (!normalized) return "Coach action";
  if (normalized === COACH_TOOL_ACTIONS.SWAP_TODAY_RECOVERY) return "Make today a recovery day";
  if (normalized === COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME) return "Reduce this week's volume";
  if (normalized === COACH_TOOL_ACTIONS.CONVERT_RUN_TO_LOW_IMPACT || normalized === COACH_TOOL_ACTIONS.REPLACE_SPEED_EASY) return "Swap high-impact for low-impact";
  if (normalized === COACH_TOOL_ACTIONS.REDUCE_LONG_RUN_AGGRESSIVENESS) return "Ease the long-run build";
  if (normalized === COACH_TOOL_ACTIONS.SIMPLIFY_MEALS_THIS_WEEK || normalized === COACH_TOOL_ACTIONS.USE_DEFAULT_MEAL_STRUCTURE_3_DAYS) return "Simplify meals this week";
  if (normalized === COACH_TOOL_ACTIONS.SWITCH_TRAVEL_MEALS || normalized === COACH_TOOL_ACTIONS.SWITCH_TRAVEL_NUTRITION_MODE) return "Switch to travel nutrition";
  if (normalized === COACH_TOOL_ACTIONS.SET_PAIN_STATE || normalized === COACH_TOOL_ACTIONS.ADD_ACHILLES_BLOCK) return "Add pain-aware modifications";
  if (normalized === COACH_TOOL_ACTIONS.INSERT_DELOAD_WEEK) return "Insert deload next week";
  if (normalized === COACH_TOOL_ACTIONS.MOVE_LONG_RUN) return "Move long run";
  if (normalized === COACH_TOOL_ACTIONS.CHANGE_NUTRITION_DAY) return "Change today's nutrition day";
  if (normalized === COACH_TOOL_ACTIONS.INCREASE_PRELONGRUN_CARBS) return "Add more fuel before the long run";
  if (normalized === COACH_TOOL_ACTIONS.INCREASE_CALORIES_SLIGHTLY) return "Raise daily calories a bit";
  if (normalized === COACH_TOOL_ACTIONS.REDUCE_DEFICIT_AGGRESSIVENESS) return "Ease the calorie deficit";
  if (normalized === COACH_TOOL_ACTIONS.SHIFT_CARBS_AROUND_WORKOUT) return "Move carbs closer to training";
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
      description: `Shift the plan toward safer options for ${injuryArea}.`,
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
      description: "Line up a lighter next week before you use it.",
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
  if (type === COACH_TOOL_ACTIONS.SWAP_TODAY_RECOVERY) return "Recovery is the better call than forcing today's full workload.";
  if (type === COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME) return "This week needs less pressure, not a full rebuild.";
  if (type === COACH_TOOL_ACTIONS.CONVERT_RUN_TO_LOW_IMPACT || type === COACH_TOOL_ACTIONS.REPLACE_SPEED_EASY) return "A lower-impact version keeps the signal without forcing the same risk.";
  if (type === COACH_TOOL_ACTIONS.REDUCE_LONG_RUN_AGGRESSIVENESS) return "The long run can still move forward without pushing the edge today.";
  if (type === COACH_TOOL_ACTIONS.SIMPLIFY_MEALS_THIS_WEEK || type === COACH_TOOL_ACTIONS.USE_DEFAULT_MEAL_STRUCTURE_3_DAYS) return "Food needs to get simpler before it gets more ambitious.";
  if (type === COACH_TOOL_ACTIONS.SWITCH_TRAVEL_MEALS || type === COACH_TOOL_ACTIONS.SWITCH_TRAVEL_NUTRITION_MODE) return "Travel calls for a cleaner fallback than the normal home setup.";
  if (type === COACH_TOOL_ACTIONS.SET_PAIN_STATE || type === COACH_TOOL_ACTIONS.ADD_ACHILLES_BLOCK) return "Your next stretch should respect the pain signal instead of talking around it.";
  if (type === COACH_TOOL_ACTIONS.INSERT_DELOAD_WEEK) return "A lighter next week is the cleaner call before fatigue stacks higher.";
  if (type === COACH_TOOL_ACTIONS.MOVE_LONG_RUN) return "The long run belongs on a better day this week.";
  if (type === COACH_TOOL_ACTIONS.CHANGE_NUTRITION_DAY) return "Today's fueling should match the day you actually need.";
  if (type === COACH_TOOL_ACTIONS.INCREASE_PRELONGRUN_CARBS) return "The long run needs a little more fuel support going in.";
  if (type === COACH_TOOL_ACTIONS.INCREASE_CALORIES_SLIGHTLY) return "Recovery needs a small calorie lift right now.";
  if (type === COACH_TOOL_ACTIONS.REDUCE_DEFICIT_AGGRESSIVENESS) return "The calorie deficit is asking too much from this stretch.";
  if (type === COACH_TOOL_ACTIONS.SHIFT_CARBS_AROUND_WORKOUT) return "More of your fuel should land closer to the work.";
  if (type === COACH_TOOL_ACTIONS.PROGRESS_STRENGTH_EMPHASIS) return "Strength is ready for a slightly stronger push.";
  return "Coach has a clean next move ready.";
};

const stripCoachPrefix = (value = "", maxLength = 220) => sanitizeText(
  String(value || "").replace(/^coach\s+/i, ""),
  maxLength
);

const describeCoachActionLikelyEffect = (action = null) => {
  const type = sanitizeText(action?.type || "", 80).toUpperCase();
  if (type === COACH_TOOL_ACTIONS.SWAP_TODAY_RECOVERY) return "Today gets lighter so recovery can catch up.";
  if (type === COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME) return "This week gets lighter without changing the larger plan.";
  if (type === COACH_TOOL_ACTIONS.CONVERT_RUN_TO_LOW_IMPACT || type === COACH_TOOL_ACTIONS.REPLACE_SPEED_EASY) return "Impact drops while you still keep the training signal.";
  if (type === COACH_TOOL_ACTIONS.REDUCE_LONG_RUN_AGGRESSIVENESS) return "The long run stays in the plan, but with less pressure.";
  if (type === COACH_TOOL_ACTIONS.SIMPLIFY_MEALS_THIS_WEEK || type === COACH_TOOL_ACTIONS.USE_DEFAULT_MEAL_STRUCTURE_3_DAYS) return "Meals get easier to repeat for the next few days.";
  if (type === COACH_TOOL_ACTIONS.SWITCH_TRAVEL_MEALS || type === COACH_TOOL_ACTIONS.SWITCH_TRAVEL_NUTRITION_MODE) return "Food choices shift toward travel-friendly defaults.";
  if (type === COACH_TOOL_ACTIONS.SET_PAIN_STATE || type === COACH_TOOL_ACTIONS.ADD_ACHILLES_BLOCK) return "Future sessions get more protective around the painful area.";
  if (type === COACH_TOOL_ACTIONS.INSERT_DELOAD_WEEK) return "The next week becomes lighter before fatigue piles up.";
  if (type === COACH_TOOL_ACTIONS.MOVE_LONG_RUN) return "The long run shifts to a cleaner day in the same week.";
  if (type === COACH_TOOL_ACTIONS.CHANGE_NUTRITION_DAY) return "Today's fueling matches the day you actually need.";
  if (type === COACH_TOOL_ACTIONS.INCREASE_PRELONGRUN_CARBS) return "The next long run gets a little more fuel support.";
  if (type === COACH_TOOL_ACTIONS.INCREASE_CALORIES_SLIGHTLY) return "Recovery gets a small calorie bump.";
  if (type === COACH_TOOL_ACTIONS.REDUCE_DEFICIT_AGGRESSIVENESS) return "The calorie deficit eases so training feels steadier.";
  if (type === COACH_TOOL_ACTIONS.SHIFT_CARBS_AROUND_WORKOUT) return "More of your carbs land near training time.";
  if (type === COACH_TOOL_ACTIONS.PROGRESS_STRENGTH_EMPHASIS) return "Strength gets a slightly stronger push over the next stretch.";
  return "The next stretch of the plan becomes easier to execute.";
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
      likelyEffect: "",
      effectLines: [],
      diffLines: [],
      auditLine: "",
    };
  }

  if (!commitResult.ok || !commitResult.mutation) {
    return {
      status: "blocked",
      headline: buildCoachActionLabel(action?.type),
      summary: sanitizeText(commitResult?.ui?.message || "We couldn't get this change ready right now.", 220),
      likelyEffect: "Nothing changes until a ready update is available.",
      effectLines: [],
      diffLines: [],
      auditLine: "Review another option when you're ready.",
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
  const cleanedWeekNote = stripCoachPrefix(weekNote);
  const injuryLevel = sanitizeText(nextPersonalization?.injuryPainState?.level || "", 80);
  const injuryArea = sanitizeText(nextPersonalization?.injuryPainState?.area || action?.payload?.area || "", 60);
  const diffLines = dedupeStrings([
    todayOverride
      ? `Today becomes ${sanitizeText(todayOverride?.label || humanizeText(todayOverride?.type) || "a lighter session", 120)}.`
      : "",
    Number.isFinite(weekVolumePct)
      ? `This week lands at ${weekVolumePct}% of normal volume.`
      : "",
    Number.isFinite(futureWeekVolumePct) && nextWeekKey !== currentWeek
      ? `Week ${nextWeekKey} lands at ${futureWeekVolumePct}% of normal volume.`
      : "",
    nutritionOverride?.dayType
      ? `Today's fueling shifts to ${getNutritionDayTypeLabel(nutritionOverride.dayType) || humanizeText(nutritionOverride.dayType)}.`
      : "",
    injuryLevel && injuryArea
      ? `${humanizeText(injuryArea)} is marked as ${humanizeText(injuryLevel)}, so future sessions stay more protective.`
      : "",
    Number.isFinite(extra?.strengthEmphasisWeeks)
      ? `Strength emphasis stays elevated for ${extra.strengthEmphasisWeeks} week${extra.strengthEmphasisWeeks === 1 ? "" : "s"}.`
      : "",
    Number.isFinite(extra?.defaultMealStructureDays)
      ? `Default meal structure covers the next ${extra.defaultMealStructureDays} day${extra.defaultMealStructureDays === 1 ? "" : "s"}.`
      : "",
    extra?.mealSimplicityMode
      ? "Meal planning gets simpler this week."
      : "",
    extra?.travelNutritionMode
      ? "Travel nutrition mode turns on."
      : "",
    Number.isFinite(extra?.nutritionCalorieDelta)
      ? `Daily calories rise by about ${extra.nutritionCalorieDelta} kcal.`
      : "",
    Number.isFinite(extra?.nutritionDeficitReduction)
      ? `The calorie deficit eases by about ${extra.nutritionDeficitReduction} kcal per day.`
      : "",
    extra?.carbShift?.pre || extra?.carbShift?.post
      ? `Carbs shift to about ${Number(extra?.carbShift?.pre || 0)}g before and ${Number(extra?.carbShift?.post || 0)}g after training.`
      : "",
    Number.isFinite(extra?.preLongRunCarbBonus)
      ? `Long-run fueling adds about ${extra.preLongRunCarbBonus}g of carbs beforehand.`
      : "",
    Number.isFinite(extra?.longRunReductionPct)
      ? `Long-run pressure eases by ${extra.longRunReductionPct}%.`
      : "",
    cleanedWeekNote,
  ]);
  const likelyEffect = diffLines[0] || describeCoachActionLikelyEffect(action);

  return {
    status: "ready",
    headline: buildCoachActionLabel(action?.type),
    summary: describeCoachActionPreviewSummary(action),
    likelyEffect,
    effectLines: diffLines,
    diffLines,
    auditLine: commitResult?.accepted?.acceptancePolicy === "acceptance_only"
      ? "Review first, then apply if you want this update."
      : "Apply this update when you're ready.",
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
      detail: sanitizeText(action?.reason || action?.rationale || "Saved coach change.", 220),
      timestampLabel: formatDateTimeLabel(action?.ts || 0),
      proposalSourceLabel: humanizeText(action?.proposalSource || action?.source || "coach surface") || "coach surface",
      auditLine: describeProvenanceRecord(
        action?.provenance,
        action?.acceptedBy
          ? `Saved through ${humanizeText(action.acceptedBy)}.`
          : "Saved coach change."
      ),
    }))
);

export const buildCoachRecentQuestionModel = ({
  messages = [],
  limit = 4,
} = {}) => {
  const entries = (Array.isArray(messages) ? messages : [])
    .filter((message) => String(message?.role || "").toLowerCase() === "user")
    .slice(-Math.max(1, Number(limit) || 4))
    .reverse()
    .map((message, index) => ({
      id: sanitizeText(message?.id || `coach_question_${index}`, 120) || `coach_question_${index}`,
      question: sanitizeText(message?.text || "", 180),
      timestampLabel: formatDateTimeLabel(message?.ts || 0),
    }))
    .filter((entry) => entry.question);
  return {
    count: entries.length,
    summary: entries.length
      ? `${entries.length} recent question${entries.length === 1 ? "" : "s"}`
      : "No recent questions yet.",
    entries,
  };
};

export const buildCoachAskAnythingStateModel = ({
  apiKey = "",
} = {}) => {
  return {
    aiAvailable: true,
    advisoryOnly: true,
    canMutatePlan: false,
    headline: "Answers only",
    detail: "Ask for a call, a tradeoff, or a next step. Chat never changes your plan. Preview a change before you use it.",
  };
};
