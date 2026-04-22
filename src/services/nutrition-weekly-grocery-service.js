import { deriveRealWorldNutritionEngine } from "../modules-nutrition.js";
import { getNutritionTargetsForDayType, normalizeNutritionDayType } from "./nutrition-day-taxonomy-service.js";

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const titleCase = (value = "") => sanitizeText(value)
  .split(" ")
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(" ");

const buildDateKeyWithOffset = (startDate = "", offset = 0) => {
  const base = new Date(`${startDate}T12:00:00`);
  if (Number.isNaN(base.getTime())) return "";
  base.setDate(base.getDate() + offset);
  return base.toISOString().split("T")[0];
};

const formatDateRangeLabel = (startDate = "", endDate = "") => {
  const start = startDate ? new Date(`${startDate}T12:00:00`) : null;
  const end = endDate ? new Date(`${endDate}T12:00:00`) : null;
  if (!start || !end || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} - ${end.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
};

const buildDayLabel = (dateKey = "") => {
  const date = dateKey ? new Date(`${dateKey}T12:00:00`) : null;
  if (!date || Number.isNaN(date.getTime())) return "Day";
  return date.toLocaleDateString("en-US", { weekday: "short" });
};

const GROCERY_BUCKETS = Object.freeze([
  {
    key: "proteins",
    label: "Protein",
    matchers: [
      /\beggs?\b/i,
      /\begg whites?\b/i,
      /\bchicken\b/i,
      /\bturkey\b/i,
      /\bbeef\b/i,
      /\bsteak\b/i,
      /\bsalmon\b/i,
      /\bshrimp\b/i,
      /\btuna\b/i,
      /\bpork\b/i,
      /\btofu\b/i,
      /\btempeh\b/i,
      /\blentils?\b/i,
      /\bchickpeas?\b/i,
      /\bblack beans?\b/i,
      /\bedamame\b/i,
      /\bgreek yogurt\b/i,
      /\bskyr\b/i,
      /\bcottage cheese\b/i,
    ],
  },
  {
    key: "carbs",
    label: "Carbs",
    matchers: [
      /\brice\b/i,
      /\boats?\b/i,
      /\bgranola\b/i,
      /\bbagels?\b/i,
      /\bbread\b/i,
      /\btortillas?\b/i,
      /\bpotatoes?\b/i,
      /\bsweet potatoes?\b/i,
      /\bquinoa\b/i,
      /\bfarro\b/i,
      /\bcouscous\b/i,
      /\bpasta\b/i,
      /\bnoodles?\b/i,
      /\bpita\b/i,
      /\bwraps?\b/i,
      /\bnaan\b/i,
      /\broti\b/i,
      /\bcream of rice\b/i,
      /\brice cakes?\b/i,
    ],
  },
  {
    key: "produce",
    label: "Produce",
    matchers: [
      /\bspinach\b/i,
      /\bkale\b/i,
      /\barugula\b/i,
      /\blettuce\b/i,
      /\bsalad greens\b/i,
      /\bcucumber\b/i,
      /\btomatoes?\b/i,
      /\bonions?\b/i,
      /\bpeppers?\b/i,
      /\bmushrooms?\b/i,
      /\bzucchini\b/i,
      /\bbroccoli\b/i,
      /\bcarrots?\b/i,
      /\bgreen beans?\b/i,
      /\bcabbage\b/i,
      /\bcauliflower\b/i,
      /\bbrussels sprouts?\b/i,
      /\beggplant\b/i,
      /\bbananas?\b/i,
      /\bberries?\b/i,
      /\bpineapple\b/i,
      /\bmango\b/i,
      /\bapples?\b/i,
      /\bcitrus\b/i,
      /\bgrapes?\b/i,
      /\bmelon\b/i,
      /\bkiwi\b/i,
      /\bfruit\b/i,
      /\bavocado\b/i,
    ],
  },
  {
    key: "extras",
    label: "Flavor + extras",
    matchers: [
      /\bfeta\b/i,
      /\btzatziki\b/i,
      /\bsalsa\b/i,
      /\bhot sauce\b/i,
      /\bhummus\b/i,
      /\btahini\b/i,
      /\bparmesan\b/i,
      /\bgoat cheese\b/i,
      /\bpeanut butter\b/i,
      /\balmond butter\b/i,
      /\bhoney\b/i,
      /\bchia\b/i,
      /\bflax\b/i,
      /\bwalnuts?\b/i,
      /\bpecans?\b/i,
      /\bpistachios?\b/i,
      /\bolive oil\b/i,
      /\blemon\b/i,
      /\blime\b/i,
      /\bsalt\b/i,
      /\bgarlic\b/i,
      /\bchili powder\b/i,
      /\bcumin\b/i,
      /\bpaprika\b/i,
      /\bpesto\b/i,
      /\bsoy sauce\b/i,
      /\bginger\b/i,
      /\bsesame\b/i,
      /\bkimchi\b/i,
    ],
  },
  {
    key: "backfills",
    label: "Backfills",
    matchers: [
      /\bprotein shake\b/i,
      /\bprotein bar\b/i,
      /\bjerky\b/i,
    ],
  },
]);

const classifyWeeklyGroceryBucket = (item = "") => {
  const text = sanitizeText(item).toLowerCase();
  const matched = GROCERY_BUCKETS.find((bucket) => bucket.matchers.some((pattern) => pattern.test(text)));
  return matched?.key || "extras";
};

const createBucketMaps = () => Object.fromEntries(
  GROCERY_BUCKETS.map((bucket) => [bucket.key, new Map()])
);

const recordBucketItem = (bucketMap = null, item = "", dayLabel = "") => {
  if (!(bucketMap instanceof Map)) return;
  const safeItem = sanitizeText(item);
  if (!safeItem) return;
  const current = bucketMap.get(safeItem) || { name: safeItem, count: 0, days: [] };
  current.count += 1;
  if (dayLabel && !current.days.includes(dayLabel)) current.days.push(dayLabel);
  bucketMap.set(safeItem, current);
};

const buildPrepNotes = (groupedItems = {}) => {
  const topProteins = (groupedItems.proteins || []).filter((item) => item.count >= 2).slice(0, 2);
  const topCarbs = (groupedItems.carbs || []).filter((item) => item.count >= 2).slice(0, 2);
  const topProduce = (groupedItems.produce || []).filter((item) => item.count >= 2).slice(0, 3);
  const topBackfills = (groupedItems.backfills || []).filter((item) => item.count >= 2).slice(0, 2);
  const notes = [];

  if (topProteins.length) {
    notes.push(`Batch ${topProteins.map((item) => item.name.toLowerCase()).join(" and ")} early so lunch and dinner stay easy.`);
  }
  if (topCarbs.length) {
    notes.push(`Prep ${topCarbs.map((item) => item.name.toLowerCase()).join(" and ")} up front so harder days do not lean on takeout.`);
  }
  if (topProduce.length) {
    notes.push(`Wash or chop ${topProduce.map((item) => item.name.toLowerCase()).join(", ")} once so the bowls stay low friction.`);
  }
  if (topBackfills.length) {
    notes.push(`Keep ${topBackfills.map((item) => item.name.toLowerCase()).join(" and ")} visible so protein does not get left for late night.`);
  }
  if (!notes.length) {
    notes.push("Buy a little heavier on anything that shows up three times or more this week.");
  }
  return notes.slice(0, 4);
};

const buildDayPlanSummary = (executionPlan = null) => {
  const sections = Array.isArray(executionPlan?.sections) ? executionPlan.sections : [];
  return sections
    .filter((section) => section?.label !== "Snacks")
    .map((section) => sanitizeText(section?.title || ""))
    .filter(Boolean)
    .slice(0, 3);
};

export const buildWeeklyNutritionGroceryModel = ({
  planWeek = null,
  nutritionLayer = null,
  goalContext = null,
  favorites = {},
  momentum = {},
  learningLayer = {},
  location = "",
} = {}) => {
  if (!planWeek?.startDate || !planWeek?.endDate) return null;
  const sessionsByDay = planWeek?.sessionsByDay || {};
  const bucketMaps = createBucketMaps();
  const dayPlans = [];

  for (let offset = 0; offset < 7; offset += 1) {
    const dateKey = buildDateKeyWithOffset(planWeek.startDate, offset);
    if (!dateKey) continue;
    const dayLabel = buildDayLabel(dateKey);
    const dayIndex = new Date(`${dateKey}T12:00:00`).getDay();
    const session = sessionsByDay?.[dayIndex] || null;
    const dayType = normalizeNutritionDayType(session?.nutri || "recovery", "recovery");
    const targets = getNutritionTargetsForDayType(dayType, "recovery");
    const engine = deriveRealWorldNutritionEngine({
      location,
      dateKey,
      dayType,
      goalContext,
      nutritionLayer: {
        ...(nutritionLayer || {}),
        dayType,
        workoutType: session?.type || "",
        workoutLabel: session?.label || `${dayLabel} session`,
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
    const executionPlan = engine?.executionPlan || null;
    const sections = Array.isArray(executionPlan?.sections) ? executionPlan.sections : [];
    const groceryItems = sections.flatMap((section) => (
      Array.isArray(section?.groceryItems) ? section.groceryItems : []
    ));
    groceryItems.forEach((item) => {
      const bucketKey = classifyWeeklyGroceryBucket(item);
      recordBucketItem(bucketMaps[bucketKey], item, dayLabel);
    });

    dayPlans.push({
      dateKey,
      dayLabel,
      sessionLabel: sanitizeText(session?.label || (session ? titleCase(String(session?.type || "session").replaceAll("-", " ")) : "Recovery day")),
      meals: buildDayPlanSummary(executionPlan),
      groceryItems,
    });
  }

  const groupedItems = Object.fromEntries(
    Object.entries(bucketMaps).map(([bucketKey, bucketMap]) => [
      bucketKey,
      [...bucketMap.values()].sort((left, right) => right.count - left.count || left.name.localeCompare(right.name)),
    ])
  );
  const groups = GROCERY_BUCKETS
    .map((bucket) => ({
      key: bucket.key,
      label: bucket.label,
      items: (groupedItems[bucket.key] || []).slice(0, 10),
    }))
    .filter((bucket) => bucket.items.length);
  const totalUniqueItems = groups.reduce((sum, group) => sum + group.items.length, 0);
  const highRepeatItems = groups
    .flatMap((group) => group.items)
    .filter((item) => item.count >= 3)
    .map((item) => item.name);
  const allItems = Object.values(groupedItems).flatMap((items) => items.map((item) => item.name));

  return {
    title: "This week's grocery list",
    weekLabel: formatDateRangeLabel(planWeek.startDate, planWeek.endDate),
    summary: highRepeatItems.length
      ? `Built from the generated week. Buy heavier on ${highRepeatItems.slice(0, 3).map((item) => item.toLowerCase()).join(", ")} because they repeat three or more times.`
      : "Built from the generated week. Use this as the anchor list, then layer in any household staples you already keep around.",
    groups,
    prepNotes: buildPrepNotes(groupedItems),
    dailyPlans: dayPlans,
    totalUniqueItems,
    allItems,
  };
};
