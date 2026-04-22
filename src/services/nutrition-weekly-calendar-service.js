import { deriveRealWorldNutritionEngine } from "../modules-nutrition.js";
import { getNutritionTargetsForDayType, normalizeNutritionDayType } from "./nutrition-day-taxonomy-service.js";

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const buildDateKeyWithOffset = (startDate = "", offset = 0) => {
  const base = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + offset);
  return base.toISOString().split("T")[0];
};

const buildWeekdayLabel = (dateKey = "") => {
  const date = dateKey ? new Date(`${dateKey}T12:00:00`) : null;
  if (!date || Number.isNaN(date.getTime())) return "Day";
  return date.toLocaleDateString("en-US", { weekday: "short" });
};

const formatDateRangeLabel = (startDate = "", endDate = "") => {
  const start = startDate ? new Date(`${startDate}T12:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T12:00:00`) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
};

const buildSessionLabel = (session = null) => sanitizeText(
  session?.label
  || String(session?.type || "").replaceAll("-", " ")
  || "Session",
  120
);

const summarizeSlotPreview = (section = null) => (
  (Array.isArray(section?.buildItems) ? section.buildItems : [])
    .map((item) => sanitizeText(item, 80))
    .filter(Boolean)
    .slice(0, 2)
);

const buildWeekDayExecutionPlan = ({
  dateKey = "",
  session = null,
  nutritionLayer = null,
  goalContext = null,
  favorites = {},
  momentum = {},
  learningLayer = {},
  location = "",
} = {}) => {
  const dayType = normalizeNutritionDayType(session?.nutri || "recovery", "recovery");
  const targets = getNutritionTargetsForDayType(dayType, "recovery");
  return deriveRealWorldNutritionEngine({
    location,
    dateKey,
    dayType,
    goalContext,
    nutritionLayer: {
      ...(nutritionLayer || {}),
      dayType,
      workoutType: session?.type || "",
      workoutLabel: session?.label || `${buildWeekdayLabel(dateKey)} session`,
      targets: {
        cal: targets.cal,
        p: targets.p,
        c: targets.c,
        f: targets.f,
        hydrationTargetOz: Number(nutritionLayer?.targets?.hydrationTargetOz || nutritionLayer?.hydrationTargetOz || 0) || 0,
        sodiumTargetMg: Number(nutritionLayer?.targets?.sodiumTargetMg || nutritionLayer?.sodiumTargetMg || 0) || 0,
      },
    },
    momentum,
    favorites,
    travelMode: Boolean(nutritionLayer?.travelMode),
    learningLayer,
    timeOfDay: session?.sessionTime || session?.scheduledTime || "afternoon",
    loggedIntake: {},
  });
};

export const buildWeeklyNutritionCalendarModel = ({
  planWeek = null,
  nutritionLayer = null,
  goalContext = null,
  favorites = {},
  momentum = {},
  learningLayer = {},
  location = "",
  todayKey = "",
} = {}) => {
  if (!planWeek?.startDate || !planWeek?.endDate) return null;
  const sessionsByDay = planWeek?.sessionsByDay || {};
  const mealCalendarOverrides = favorites?.mealCalendarOverrides || {};
  const days = [];
  let overrideCount = 0;

  for (let offset = 0; offset < 7; offset += 1) {
    const dateKey = buildDateKeyWithOffset(planWeek.startDate, offset);
    if (!dateKey) continue;
    const dayIndex = new Date(`${dateKey}T12:00:00`).getDay();
    const session = sessionsByDay?.[dayIndex] || null;
    const executionPlan = buildWeekDayExecutionPlan({
      dateKey,
      session,
      nutritionLayer,
      goalContext,
      favorites,
      momentum,
      learningLayer,
      location,
    })?.executionPlan || null;
    const sections = Array.isArray(executionPlan?.sections) ? executionPlan.sections : [];
    const meals = sections.map((section) => {
      const meal = {
        slotKey: sanitizeText(section?.slotKey || section?.key || "", 40).toLowerCase(),
        label: sanitizeText(section?.label || "Meal", 40),
        title: sanitizeText(section?.title || "Meal", 120),
        targetLine: sanitizeText(section?.targetLine || "", 120),
        preferenceKey: sanitizeText(section?.preferenceKey || "", 80).toLowerCase(),
        sourceType: sanitizeText(section?.sourceType || "pattern", 40).toLowerCase(),
        hasOverride: Boolean(section?.overrideApplied),
        seedOffset: Math.max(0, Math.round(Number(section?.seedOffset || 0))),
        buildPreview: summarizeSlotPreview(section),
        groceryItems: Array.isArray(section?.groceryItems) ? section.groceryItems : [],
      };
      if (meal.hasOverride) overrideCount += 1;
      return meal;
    });
    const hasSavedOverrides = Boolean(mealCalendarOverrides?.[dateKey] && Object.keys(mealCalendarOverrides[dateKey] || {}).length);

    days.push({
      dateKey,
      dayLabel: buildWeekdayLabel(dateKey),
      isToday: Boolean(todayKey && todayKey === dateKey),
      sessionLabel: buildSessionLabel(session),
      meals,
      hasSavedOverrides,
    });
  }

  return {
    title: "Weekly meal calendar",
    weekLabel: formatDateRangeLabel(planWeek.startDate, planWeek.endDate),
    summary: overrideCount > 0
      ? "Rotate anything that looks stale. The grocery list below follows the current calendar, including your meal swaps."
      : "Today stays first. The week below is where you can rotate meals, keep good ones, and stop the same defaults from repeating.",
    days,
    overrideCount,
  };
};
