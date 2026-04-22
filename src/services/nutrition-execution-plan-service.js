import {
  getNutritionDayTypeLabel,
  isHardNutritionDayType,
  isHybridNutritionDayType,
  isRecoveryNutritionDayType,
  isStrengthNutritionDayType,
  normalizeNutritionDayType,
} from "./nutrition-day-taxonomy-service.js";

const sanitizeText = (value = "") => String(value || "").replace(/\s+/g, " ").trim();

const hashString = (value = "") => {
  const input = String(value || "");
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
};

const titleCase = (value = "") => sanitizeText(value)
  .split(" ")
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(" ");

const roundToStep = (value = 0, step = 5) => Math.round(Number(value || 0) / step) * step;

const clampRangeFloor = (value = 0, floor = 0) => Math.max(floor, value);
const chooseCount = (n = 0, k = 0) => {
  const safeN = Math.max(0, Math.floor(Number(n || 0)));
  const safeK = Math.max(0, Math.floor(Number(k || 0)));
  if (!safeK || safeK > safeN) return 0;
  if (safeK === safeN) return 1;
  let result = 1;
  for (let index = 1; index <= safeK; index += 1) {
    result = (result * (safeN - (safeK - index))) / index;
  }
  return Math.round(result);
};

const NUTRITION_AFFORDABILITY_PROFILES = Object.freeze({
  valueSensitive: "value_sensitive",
  balancedValue: "balanced_value",
  premiumOpen: "premium_open",
});

const formatRange = (label = "", target = 0, spread = 0, unit = "", { floor = 0, mustHit = false } = {}) => {
  const center = roundToStep(Number(target || 0), unit === "kcal" ? 50 : 5);
  const low = clampRangeFloor(roundToStep(center - spread, unit === "kcal" ? 50 : 5), floor);
  const high = clampRangeFloor(roundToStep(center + spread, unit === "kcal" ? 50 : 5), floor);
  const suffix = mustHit ? " (must hit)" : "";
  return {
    label,
    value: unit === "kcal"
      ? `~${low.toLocaleString()}-${high.toLocaleString()}`
      : `${low}-${high}${unit}`,
    suffix,
  };
};

const buildDayLabel = (dateKey = "") => {
  const safeDate = dateKey ? new Date(`${dateKey}T12:00:00`) : null;
  if (!safeDate || Number.isNaN(safeDate.getTime())) return "Today";
  return safeDate.toLocaleDateString("en-US", { weekday: "long" });
};

const splitAnchorIntoItems = (text = "") => sanitizeText(text)
  .split(/\s*\+\s*|\s*,\s*|\s*\/\s*/g)
  .map((part) => sanitizeText(part))
  .filter(Boolean)
  .slice(0, 5)
  .map((part, index) => {
    if (index === 0 && !/^optional:/i.test(part)) return titleCase(part);
    return part;
  });

const dedupeList = (items = []) => [...new Set((items || []).map((item) => sanitizeText(item)).filter(Boolean))];

const titleCaseFragment = (value = "") => sanitizeText(value)
  .split(" ")
  .filter(Boolean)
  .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
  .join(" ");

const GROCERY_STOP_WORDS = new Set([
  "bowl",
  "plate",
  "side",
  "meal",
  "build",
  "optional",
]);

const GROCERY_CANONICAL_MATCHERS = Object.freeze([
  { pattern: /\begg whites?\b/i, label: "Egg whites" },
  { pattern: /\beggs?\b/i, label: "Eggs" },
  { pattern: /\bgreek yogurt\b/i, label: "Greek yogurt" },
  { pattern: /\bskyr\b/i, label: "Skyr" },
  { pattern: /\bcottage cheese\b/i, label: "Cottage cheese" },
  { pattern: /\bprotein shake\b|\bwhey\b/i, label: "Protein shake" },
  { pattern: /\bprotein bar\b/i, label: "Protein bar" },
  { pattern: /\bjerky\b/i, label: "Jerky" },
  { pattern: /\bchicken thighs?\b/i, label: "Chicken thighs" },
  { pattern: /\bground chicken\b/i, label: "Ground chicken" },
  { pattern: /\bchicken sausage\b/i, label: "Chicken sausage" },
  { pattern: /\bchicken\b/i, label: "Chicken" },
  { pattern: /\bground turkey\b/i, label: "Ground turkey" },
  { pattern: /\bturkey sausage\b/i, label: "Turkey sausage" },
  { pattern: /\bturkey meatballs?\b/i, label: "Turkey meatballs" },
  { pattern: /\bturkey\b/i, label: "Turkey" },
  { pattern: /\blean ground beef\b/i, label: "Lean ground beef" },
  { pattern: /\bbeef meatballs?\b/i, label: "Beef meatballs" },
  { pattern: /\bsteak\b|\bsirloin\b|\bflank\b|\btop round\b/i, label: "Steak" },
  { pattern: /\bbeef\b/i, label: "Beef" },
  { pattern: /\bsalmon\b/i, label: "Salmon" },
  { pattern: /\bshrimp\b/i, label: "Shrimp" },
  { pattern: /\btuna\b/i, label: "Tuna" },
  { pattern: /\bpork tenderloin\b/i, label: "Pork tenderloin" },
  { pattern: /\bpork chop\b/i, label: "Pork chop" },
  { pattern: /\btofu\b/i, label: "Tofu" },
  { pattern: /\btempeh\b/i, label: "Tempeh" },
  { pattern: /\blentils?\b/i, label: "Lentils" },
  { pattern: /\bchickpeas?\b/i, label: "Chickpeas" },
  { pattern: /\bblack beans?\b/i, label: "Black beans" },
  { pattern: /\bedamame\b/i, label: "Edamame" },
  { pattern: /\boats?\b|\boatmeal\b/i, label: "Oats" },
  { pattern: /\bgranola\b/i, label: "Granola" },
  { pattern: /\brice cakes?\b/i, label: "Rice cakes" },
  { pattern: /\bcream of rice\b/i, label: "Cream of rice" },
  { pattern: /\bjasmine rice\b|\bbasmati rice\b|\bbrown rice\b|\bwild rice\b|\brice\b/i, label: "Rice" },
  { pattern: /\broti\b/i, label: "Roti" },
  { pattern: /\bnaan\b/i, label: "Naan" },
  { pattern: /\bpita\b/i, label: "Pita" },
  { pattern: /\bwrap\b/i, label: "Wraps" },
  { pattern: /\bbagels?\b/i, label: "Bagels" },
  { pattern: /\benglish muffin\b/i, label: "English muffins" },
  { pattern: /\btoast\b|\bsourdough\b/i, label: "Bread" },
  { pattern: /\bcorn tortillas?\b|\btortillas?\b/i, label: "Tortillas" },
  { pattern: /\bpotatoes?\b/i, label: "Potatoes" },
  { pattern: /\bsweet potato\b/i, label: "Sweet potatoes" },
  { pattern: /\bquinoa\b/i, label: "Quinoa" },
  { pattern: /\bfarro\b/i, label: "Farro" },
  { pattern: /\bcouscous\b/i, label: "Couscous" },
  { pattern: /\bpasta\b|\borzo\b|\bcavatappi\b|\blentil pasta\b|\bchickpea pasta\b/i, label: "Pasta" },
  { pattern: /\bnoodles?\b|\budon\b|\bsoba\b/i, label: "Noodles" },
  { pattern: /\bspinach\b/i, label: "Spinach" },
  { pattern: /\bkale\b/i, label: "Kale" },
  { pattern: /\barugula\b/i, label: "Arugula" },
  { pattern: /\bmixed greens\b|\bsalad base\b|\bsalad greens\b/i, label: "Salad greens" },
  { pattern: /\blettuce\b|\bromaine\b/i, label: "Lettuce" },
  { pattern: /\bcucumber\b/i, label: "Cucumber" },
  { pattern: /\btomato\b/i, label: "Tomatoes" },
  { pattern: /\bonions?\b|\bshallots?\b|\bleeks?\b/i, label: "Onions" },
  { pattern: /\bpeppers?\b/i, label: "Peppers" },
  { pattern: /\bmushrooms?\b/i, label: "Mushrooms" },
  { pattern: /\bzucchini\b/i, label: "Zucchini" },
  { pattern: /\bbroccoli\b|\bbroccolini\b/i, label: "Broccoli" },
  { pattern: /\bcarrots?\b/i, label: "Carrots" },
  { pattern: /\bgreen beans?\b/i, label: "Green beans" },
  { pattern: /\bcabbage\b|\bslaw\b/i, label: "Cabbage" },
  { pattern: /\bcauliflower\b/i, label: "Cauliflower" },
  { pattern: /\bbrussels sprouts?\b/i, label: "Brussels sprouts" },
  { pattern: /\beggplant\b/i, label: "Eggplant" },
  { pattern: /\bbanana\b/i, label: "Bananas" },
  { pattern: /\bberries?\b/i, label: "Berries" },
  { pattern: /\bpineapple\b/i, label: "Pineapple" },
  { pattern: /\bmango\b/i, label: "Mango" },
  { pattern: /\bapple\b/i, label: "Apples" },
  { pattern: /\borange\b|\bclementines?\b/i, label: "Citrus" },
  { pattern: /\bgrapes?\b/i, label: "Grapes" },
  { pattern: /\bmelon\b|\bwatermelon\b/i, label: "Melon" },
  { pattern: /\bkiwi\b/i, label: "Kiwi" },
  { pattern: /\bfruit\b/i, label: "Fruit" },
  { pattern: /\bfeta\b/i, label: "Feta" },
  { pattern: /\btzatziki\b/i, label: "Tzatziki" },
  { pattern: /\bsalsa\b|\bpico\b/i, label: "Salsa" },
  { pattern: /\bavocado\b/i, label: "Avocado" },
  { pattern: /\bhot sauce\b/i, label: "Hot sauce" },
  { pattern: /\bkimchi\b/i, label: "Kimchi" },
  { pattern: /\bhummus\b/i, label: "Hummus" },
  { pattern: /\btahini\b/i, label: "Tahini" },
  { pattern: /\bparmesan\b/i, label: "Parmesan" },
  { pattern: /\bgoat cheese\b/i, label: "Goat cheese" },
  { pattern: /\bpeanut butter\b/i, label: "Peanut butter" },
  { pattern: /\balmond butter\b/i, label: "Almond butter" },
  { pattern: /\bhoney\b/i, label: "Honey" },
  { pattern: /\bchia\b/i, label: "Chia seeds" },
  { pattern: /\bflax\b/i, label: "Flax seeds" },
  { pattern: /\bwalnuts?\b/i, label: "Walnuts" },
  { pattern: /\bpecans?\b/i, label: "Pecans" },
  { pattern: /\bpistachios?\b/i, label: "Pistachios" },
  { pattern: /\bolive oil\b/i, label: "Olive oil" },
  { pattern: /\blemon\b|\blime\b/i, label: "Lemon or lime" },
  { pattern: /\bsalt\b/i, label: "Salt" },
  { pattern: /\bgarlic\b/i, label: "Garlic" },
  { pattern: /\bchili\b/i, label: "Chili powder" },
  { pattern: /\bcumin\b/i, label: "Cumin" },
  { pattern: /\bpaprika\b/i, label: "Paprika" },
  { pattern: /\bpesto\b/i, label: "Pesto" },
  { pattern: /\bsoy\b/i, label: "Soy sauce" },
  { pattern: /\bginger\b/i, label: "Ginger" },
  { pattern: /\bsesame\b/i, label: "Sesame" },
]);

const splitBuildItemIntoGroceryFragments = (item = "") => sanitizeText(item)
  .replace(/^optional:\s*/i, "")
  .replace(/^side of\s+/i, "")
  .replace(/^add\s+/i, "")
  .replace(/\s+if .+$/i, "")
  .replace(/\s+within .+$/i, "")
  .replace(/\s+at the end$/i, "")
  .replace(/\s+on the side$/i, "")
  .split(/\s*\+\s*|\s*,\s*|\s+and\s+|\s+or\s+|\s*\/\s*/i)
  .map((fragment) => sanitizeText(fragment))
  .filter(Boolean);

const normalizeGroceryFragment = (fragment = "") => {
  const normalized = sanitizeText(fragment).replace(/\(.*?\)/g, "").trim();
  if (!normalized) return "";
  const directMatch = GROCERY_CANONICAL_MATCHERS.find((entry) => entry.pattern.test(normalized));
  if (directMatch?.label) return directMatch.label;

  const fallback = normalized
    .replace(/^\d+(?:\.\d+)?\s+/i, "")
    .replace(/^(whole|cooked|optional)\s+/i, "")
    .trim();
  const normalizedFallback = fallback.toLowerCase();
  if (!normalizedFallback || GROCERY_STOP_WORDS.has(normalizedFallback)) return "";
  return titleCaseFragment(fallback);
};

const buildSectionGroceryItems = (buildItems = []) => dedupeList(
  (buildItems || [])
    .flatMap((item) => splitBuildItemIntoGroceryFragments(item))
    .map((fragment) => normalizeGroceryFragment(fragment))
    .filter(Boolean)
);

const buildSectionCoachLine = (slotKey = "", ctx = {}) => {
  if (slotKey === "breakfast") {
    if (ctx.hardSession || ctx.hybridSession) return "Keep the easiest carbs visible here if the main work is still ahead.";
    if (ctx.strengthSession) return "Get a real protein hit in early so dinner is not trying to rescue the whole day.";
    if (ctx.recoverySession) return "Keep breakfast automatic, high protein, and easy to digest.";
    return "Start the day with the most repeatable high-protein meal you can hit without thinking.";
  }
  if (slotKey === "lunch") {
    if (ctx.hardSession || ctx.hybridSession) return "This is the meal that protects the later session, so do not let carbs disappear here.";
    if (ctx.strengthSession) return "Use lunch to bridge into the lift without feeling heavy or random.";
    return "Lunch should feel like a real anchor meal, not a snacky placeholder.";
  }
  if (slotKey === "dinner") {
    if (ctx.hardSession || ctx.hybridSession) return "Dinner is the main recovery meal today, so both protein and carbs need to be obvious.";
    if (ctx.strengthSession) return "Finish with a full recovery plate instead of trying to backfill with snacks.";
    return "Make dinner satisfying enough that the night does not drift into convenience eating.";
  }
  return "Use snacks to finish protein cleanly instead of turning them into a second dinner.";
};

const buildSectionPrepLine = (slotKey = "", ctx = {}) => {
  if (slotKey === "breakfast") return ctx.travelMode
    ? "Keep a travel-safe version in sight so breakfast never depends on finding the perfect option."
    : "Prep two or three servings at once so breakfast stays automatic on busy mornings.";
  if (slotKey === "lunch") return "Batch the protein and carb base up front, then swap the produce and finish so lunches still feel fresh.";
  if (slotKey === "dinner") return "Cook the carb and vegetables ahead so dinner only needs protein plus quick assembly.";
  return "Keep two of these protein backfills visible at home, at work, or in the bag you actually carry.";
};

const buildSectionBackupLine = (slotKey = "", ctx = {}) => {
  if (slotKey === "breakfast") return ctx.travelMode
    ? "Fallback: hotel eggs, yogurt, fruit, and the easiest carb you trust."
    : "Fallback: Greek yogurt, fruit, and a shake.";
  if (slotKey === "lunch") return ctx.travelMode
    ? "Fallback: airport or grocery bowl with extra protein and one clean carb."
    : "Fallback: rice bowl or wrap plus fruit and water.";
  if (slotKey === "dinner") return "Fallback: lean protein, rice or potatoes, and one frozen or bagged vegetable.";
  return ctx.bodyCompBias
    ? "Fallback: shake before bed instead of letting the night drift into grazing."
    : "Fallback: shake plus fruit if protein is still short late in the day.";
};

const buildSectionSupport = (slotKey = "", ctx = {}, buildItems = []) => ({
  coachLine: buildSectionCoachLine(slotKey, ctx),
  prepLine: buildSectionPrepLine(slotKey, ctx),
  backupLine: buildSectionBackupLine(slotKey, ctx),
  groceryItems: buildSectionGroceryItems(buildItems),
});

const VALUE_STORE_MATCHERS = Object.freeze([
  /\baldi\b/i,
  /\bwalmart\b/i,
  /\bcostco\b/i,
  /\bsam'?s\b/i,
  /\btarget\b/i,
  /\bkroger\b/i,
  /\bmeijer\b/i,
  /\bheb\b/i,
  /\bfood lion\b/i,
  /\bwinco\b/i,
  /\bgrocery outlet\b/i,
  /\btrader joe'?s\b/i,
]);

const PREMIUM_STORE_MATCHERS = Object.freeze([
  /\bwhole foods\b/i,
  /\bsprouts\b/i,
  /\bfresh market\b/i,
  /\bcentral market\b/i,
  /\berewhon\b/i,
]);

const VALUE_MEAL_HINTS = Object.freeze([
  /\bground turkey\b/i,
  /\bchicken\b/i,
  /\bbeans?\b/i,
  /\blentils?\b/i,
  /\btuna\b/i,
  /\beggs?\b/i,
  /\brotisserie\b/i,
  /\bcottage cheese\b/i,
]);

const PREMIUM_MEAL_HINTS = Object.freeze([
  /\bsteak\b/i,
  /\bsirloin\b/i,
  /\bshrimp\b/i,
  /\bsalmon\b/i,
  /\bbison\b/i,
  /\bmahi\b/i,
]);

const PROTEIN_COST_TIER_BY_ID = Object.freeze({
  chicken_breast: "budget",
  chicken_thigh: "budget",
  lean_ground_chicken: "budget",
  chicken_sausage: "budget",
  lean_ground_turkey: "budget",
  turkey_meatballs: "budget",
  turkey_burger: "budget",
  tuna: "budget",
  sardines: "budget",
  lentils: "budget",
  black_beans: "budget",
  chickpeas: "budget",
  cottage_cheese_protein: "budget",
  tofu: "budget",
  seitan: "budget",
  edamame: "budget",
  tempeh: "moderate",
  pork_tenderloin: "moderate",
  pork_chop: "moderate",
  ham_steak: "moderate",
  cod: "moderate",
  tilapia: "moderate",
  trout: "moderate",
  lean_ground_beef: "moderate",
  beef_meatballs: "moderate",
  top_round: "moderate",
  salmon: "premium",
  shrimp: "premium",
  flank_steak: "premium",
  sirloin: "premium",
  bison: "premium",
  mahi_mahi: "premium",
});

const inferAffordabilityProfile = ({
  grocerySignals = [],
  restaurantSignals = [],
  safeMealSignals = [],
  mealAnchorSignals = [],
} = {}) => {
  const rawSignals = [
    ...(Array.isArray(grocerySignals) ? grocerySignals : []),
    ...(Array.isArray(restaurantSignals) ? restaurantSignals : []),
    ...(Array.isArray(safeMealSignals) ? safeMealSignals : []),
    ...(Array.isArray(mealAnchorSignals) ? mealAnchorSignals : []),
  ]
    .map((entry) => {
      if (typeof entry === "string") return sanitizeText(entry);
      if (entry && typeof entry === "object") return sanitizeText(entry.name || entry.meal || entry.label || "");
      return "";
    })
    .filter(Boolean);

  let score = 0;
  rawSignals.forEach((signal) => {
    if (VALUE_STORE_MATCHERS.some((matcher) => matcher.test(signal))) score += 2;
    if (PREMIUM_STORE_MATCHERS.some((matcher) => matcher.test(signal))) score -= 2;
    if (VALUE_MEAL_HINTS.some((matcher) => matcher.test(signal))) score += 1;
    if (PREMIUM_MEAL_HINTS.some((matcher) => matcher.test(signal))) score -= 1;
  });

  if (score >= 2) return NUTRITION_AFFORDABILITY_PROFILES.valueSensitive;
  if (score <= -2) return NUTRITION_AFFORDABILITY_PROFILES.premiumOpen;
  return NUTRITION_AFFORDABILITY_PROFILES.balancedValue;
};

const getAffordabilityChoiceScore = (item = null, ctx = {}, poolName = "") => {
  if (!item || !/Protein/i.test(poolName || "")) return 0;
  const tier = PROTEIN_COST_TIER_BY_ID[item.id] || "moderate";
  if (ctx.affordabilityProfile === NUTRITION_AFFORDABILITY_PROFILES.valueSensitive) {
    if (tier === "budget") return 4;
    if (tier === "moderate") return 1;
    return -4;
  }
  if (ctx.affordabilityProfile === NUTRITION_AFFORDABILITY_PROFILES.premiumOpen) {
    if (tier === "premium") return 3;
    if (tier === "moderate") return 2;
    return 0;
  }
  if (tier === "budget") return 3;
  if (tier === "moderate") return 2;
  return -2;
};

const buildMacroRangeText = (target = 0, spread = 0, unit = "g") => {
  const step = unit === "kcal" ? 50 : 5;
  const center = roundToStep(Number(target || 0), step);
  const low = clampRangeFloor(roundToStep(center - spread, step), 0);
  const high = clampRangeFloor(roundToStep(center + spread, step), 0);
  return unit === "kcal"
    ? `~${low.toLocaleString()}-${high.toLocaleString()}`
    : `${low}-${high}${unit}`;
};

const normalizeMealPatternFeedback = ({
  likedMealPatterns = {},
  dislikedMealPatterns = {},
  mealPatternFeedback = {},
} = {}) => {
  const voteMap = {};
  Object.entries(likedMealPatterns || {}).forEach(([key, value]) => {
    const safeKey = sanitizeText(key).toLowerCase();
    if (safeKey && value) voteMap[safeKey] = "liked";
  });
  Object.entries(dislikedMealPatterns || {}).forEach(([key, value]) => {
    const safeKey = sanitizeText(key).toLowerCase();
    if (safeKey && value) voteMap[safeKey] = "disliked";
  });
  Object.entries(mealPatternFeedback || {}).forEach(([key, value]) => {
    const safeKey = sanitizeText(key).toLowerCase();
    const safeValue = sanitizeText(value).toLowerCase();
    if (!safeKey) return;
    if (["liked", "like", "up"].includes(safeValue)) voteMap[safeKey] = "liked";
    else if (["disliked", "dislike", "down", "avoid"].includes(safeValue)) voteMap[safeKey] = "disliked";
    else delete voteMap[safeKey];
  });
  return {
    voteMap,
    likedPatternKeys: new Set(
      Object.entries(voteMap)
        .filter(([, value]) => value === "liked")
        .map(([key]) => key)
    ),
    dislikedPatternKeys: new Set(
      Object.entries(voteMap)
        .filter(([, value]) => value === "disliked")
        .map(([key]) => key)
    ),
  };
};

const normalizeSlotOverrides = (slotOverrides = {}) => {
  const safeOverrides = {};
  Object.entries(slotOverrides || {}).forEach(([slotKey, override]) => {
    const safeSlotKey = sanitizeText(slotKey).toLowerCase();
    if (!safeSlotKey || !override || typeof override !== "object") return;
    const seedOffset = Math.max(0, Math.round(Number(override.seedOffset || 0)));
    const patternId = sanitizeText(override.patternId || "").toLowerCase();
    const mode = sanitizeText(override.mode || (seedOffset > 0 || patternId ? "pattern" : "anchor")).toLowerCase();
    safeOverrides[safeSlotKey] = {
      mode: mode === "pattern" ? "pattern" : "anchor",
      seedOffset,
      patternId,
    };
  });
  return safeOverrides;
};

const shouldUsePatternOverride = (slotOverride = null) => (
  Boolean(slotOverride)
  && (slotOverride?.mode === "pattern" || Number(slotOverride?.seedOffset || 0) > 0 || Boolean(slotOverride?.patternId))
);

const buildSlotSeed = (ctx = {}, slotKey = "", slotOverride = null) => {
  const seedOffset = Math.max(0, Math.round(Number(slotOverride?.seedOffset || 0)));
  return `${ctx.seed}_${slotKey}${seedOffset ? `_variant_${seedOffset}` : ""}`;
};

const buildSectionTargetLine = (slotKey = "", ctx = {}) => {
  const proteinTarget = buildMacroRangeText(Number(ctx?.targets?.p || 190) * 0.24, 5, "g");
  if (slotKey === "breakfast") return `${proteinTarget} protein to lock the day in early.`;
  if (slotKey === "lunch") {
    return ctx.hardSession || ctx.hybridSession
      ? "Main fuel meal. Keep carbs visible and protein obvious."
      : "Main anchor meal. High protein with a real carb side.";
  }
  if (slotKey === "dinner") {
    return ctx.hardSession || ctx.hybridSession
      ? "Recovery dinner. Protein plus a visible carb side."
      : "Satisfying close to the day without drifting into grazing.";
  }
  return `Use this to guarantee ${buildMacroRangeText(Number(ctx?.targets?.p || 190), 10, "g")} protein overall.`;
};

const buildRecipeSteps = (slotKey = "", buildItems = [], ctx = {}) => {
  const visibleItems = (buildItems || []).map((item) => sanitizeText(item)).filter(Boolean);
  const primaryItems = visibleItems.slice(0, 3);
  if (slotKey === "snack") {
    return [
      "Pick one or two of the listed options based on how much protein is still missing.",
      "Pair the fastest protein option with fruit or an easy carb if energy is low.",
      "Keep one option visible at home and one option in the bag, car, or work fridge.",
    ];
  }
  return [
    primaryItems.length
      ? `Set out the core build: ${primaryItems.join(", ")}.`
      : "Set out the protein, carb, and produce pieces before you start.",
    slotKey === "breakfast"
      ? "Cook or assemble the protein base first, then add the produce or carb side."
      : "Cook or warm the protein and carb base first so the meal feels finished fast.",
    "Add the vegetables and finish with the sauce, topper, or seasoning instead of leaving it plain.",
    ctx.hardSession || ctx.hybridSession
      ? "Keep the carb side fully visible if the main session is still ahead or just finished."
      : "Adjust the carb portion to match the day, but keep the protein serving intact.",
  ];
};

const buildImprovementTips = (slotKey = "", ctx = {}) => {
  if (slotKey === "breakfast") {
    return [
      "Prep two or three breakfasts at once so the first meal never depends on motivation.",
      ctx.hardSession || ctx.hybridSession
        ? "Add fruit or the carb side before the session instead of trying to catch up later."
        : "Keep the portion clean, then save extra carbs for later if training is later in the day.",
      "Salt and season savory breakfasts so they feel like real food, not punishment food.",
    ];
  }
  if (slotKey === "lunch") {
    return [
      "Batch the protein and carb base once, then change the finish so lunches do not feel identical.",
      ctx.hardSession || ctx.hybridSession
        ? "Do not let lunch turn into a low-carb salad on a day that still needs output."
        : "Use lunch as the steady anchor that prevents convenience snacking later.",
      "Finish the bowl with acid, sauce, or herbs so the meal tastes deliberate.",
    ];
  }
  if (slotKey === "dinner") {
    return [
      "Season the protein and starch together so dinner feels finished instead of assembled.",
      ctx.bodyCompBias
        ? "Keep sauces measured, but do not strip all flavor out of the plate."
        : "Let the dinner be satisfying enough that late-night grazing never gets invited in.",
      "Prep the vegetable and carb side ahead so dinner can still be fast on tired nights.",
    ];
  }
  return [
    "Use snacks to close the protein gap, not to replace the real meals.",
    "Keep a travel-safe option around so the plan survives busy days.",
    "If protein is still short at night, use the shake before bed instead of improvising.",
  ];
};

const buildObjectiveItems = (ctx = {}) => {
  const objectives = [];
  if (ctx.bodyCompBias) objectives.push("Stay in fat-loss range");
  else if (ctx.hardSession || ctx.hybridSession) objectives.push("Stay fueled for the session");
  else if (ctx.strengthSession) objectives.push("Protect training output and recovery");
  else if (ctx.recoverySession) objectives.push("Recover without drifting off plan");
  else objectives.push("Stay steady and low friction");
  objectives.push(`Hit protein (${buildMacroRangeText(Number(ctx?.targets?.p || 190), 10, "g")})`);
  if (ctx.hardSession || ctx.hybridSession) objectives.push(`Keep carbs visible (${buildMacroRangeText(Number(ctx?.targets?.c || 220), 20, "g")})`);
  else if (ctx.recoverySession || ctx.bodyCompBias) objectives.push("Keep carbs controlled, not low");
  else objectives.push("Keep carbs moderate and useful");
  objectives.push("No decision fatigue");
  return objectives.slice(0, 4);
};

const buildExecutionRules = (ctx = {}) => {
  const rules = [];
  if (ctx.hardSession || ctx.hybridSession) {
    rules.push("Do not save calories early. Underfueling today makes the next hard day worse.");
    rules.push("Keep carbs controlled, not low. Performance still needs fuel.");
  } else if (ctx.recoverySession) {
    rules.push("Eat normally today. Recovery days still need real meals.");
    rules.push("Keep the day protein-forward instead of turning it into all-day snacking.");
  } else if (ctx.strengthSession) {
    rules.push("Keep protein high and steady. Do not let dinner rescue the whole day.");
    rules.push("Put the easier carbs near the lift instead of scattering them randomly.");
  } else {
    rules.push("Eat like the day matters, even when it is a simpler training day.");
  }
  if (ctx.travelMode) rules.push("Travel rule: protein first, carb second, sauce last.");
  else rules.push("Prep tomorrow quietly: make sure protein is cooked and the carb base is ready.");
  if (ctx.bodyCompBias) rules.push("Keep sauces and extras deliberate, not random.");
  return dedupeList(rules).slice(0, 4);
};

const createChoice = (id, label, family = id) => Object.freeze({ id, label, family, short: label.replace(/\s*\(.+\)\s*/g, "") });

const BREAKFAST_STARCH_POOL = Object.freeze([
  createChoice("oats", "1 cup oats"),
  createChoice("sourdough", "2 slices sourdough"),
  createChoice("potatoes", "Roasted potatoes"),
  createChoice("bagel", "1 bagel"),
  createChoice("english_muffin", "1 English muffin"),
  createChoice("berries_granola", "Berries + granola"),
  createChoice("rice", "Rice"),
  createChoice("corn_tortillas", "Corn tortillas"),
  createChoice("cream_of_rice", "Cream of rice"),
  createChoice("whole_grain_toast", "Whole-grain toast"),
  createChoice("sprouted_toast", "Sprouted toast"),
  createChoice("whole_grain_waffles", "Whole-grain waffles"),
  createChoice("overnight_oats_base", "Overnight oats"),
  createChoice("bran_cereal", "High-fiber cereal"),
  createChoice("rice_cakes", "Rice cakes"),
  createChoice("buckwheat", "Buckwheat"),
  createChoice("mini_bagel", "Mini bagel"),
  createChoice("sweet_potato_hash", "Sweet potato hash"),
  createChoice("quinoa_breakfast", "Quinoa"),
  createChoice("muesli", "Muesli"),
]);

const BREAKFAST_FRUIT_POOL = Object.freeze([
  createChoice("banana", "Banana"),
  createChoice("berries", "Berries"),
  createChoice("pineapple", "Pineapple"),
  createChoice("mango", "Mango"),
  createChoice("apple", "Apple"),
  createChoice("orange", "Orange"),
  createChoice("grapes", "Grapes"),
  createChoice("peaches", "Peaches"),
  createChoice("pear", "Pear"),
  createChoice("kiwi", "Kiwi"),
  createChoice("plum", "Plum"),
  createChoice("strawberries", "Strawberries"),
  createChoice("blueberries", "Blueberries"),
  createChoice("raspberries", "Raspberries"),
  createChoice("blackberries", "Blackberries"),
  createChoice("melon", "Melon"),
  createChoice("watermelon", "Watermelon"),
  createChoice("cherries", "Cherries"),
  createChoice("apricots", "Apricots"),
  createChoice("clementines", "Clementines"),
  createChoice("papaya", "Papaya"),
  createChoice("figs", "Figs"),
]);

const SAVORY_VEG_POOL = Object.freeze([
  createChoice("spinach_onions", "Spinach + onions"),
  createChoice("peppers_onions", "Peppers + onions"),
  createChoice("spinach_tomato", "Spinach + tomato"),
  createChoice("mushrooms_spinach", "Mushrooms + spinach"),
  createChoice("zucchini_peppers", "Zucchini + peppers"),
  createChoice("kale_onions", "Kale + onions"),
  createChoice("broccoli_onions", "Broccoli + onions"),
  createChoice("arugula_tomato", "Arugula + tomato"),
  createChoice("asparagus_onions", "Asparagus + onions"),
  createChoice("cauliflower_peppers", "Cauliflower + peppers"),
  createChoice("brussels_onions", "Brussels sprouts + onions"),
  createChoice("green_beans_onions", "Green beans + onions"),
  createChoice("cabbage_peppers", "Cabbage + peppers"),
  createChoice("bok_choy_mushrooms", "Bok choy + mushrooms"),
  createChoice("broccolini_tomato", "Broccolini + tomato"),
  createChoice("spinach_artichoke", "Spinach + artichoke"),
  createChoice("tomato_basil", "Tomato + basil"),
  createChoice("peppers_mushrooms", "Peppers + mushrooms"),
  createChoice("kale_mushrooms", "Kale + mushrooms"),
  createChoice("shallots_spinach", "Shallots + spinach"),
  createChoice("roasted_tomato_onion", "Roasted tomato + onion"),
  createChoice("leeks_spinach", "Leeks + spinach"),
]);

const BREAKFAST_TOPPING_POOL = Object.freeze([
  createChoice("feta", "Feta"),
  createChoice("tzatziki", "Tzatziki"),
  createChoice("avocado", "Avocado"),
  createChoice("hot_sauce", "Optional: hot sauce"),
  createChoice("salsa", "Salsa"),
  createChoice("goat_cheese", "Goat cheese"),
  createChoice("peanut_butter", "Peanut butter"),
  createChoice("almond_butter", "Almond butter"),
  createChoice("honey", "Honey"),
  createChoice("chia", "Chia seeds"),
  createChoice("pumpkin_seeds", "Pumpkin seeds"),
  createChoice("flax", "Flax seeds"),
  createChoice("walnuts", "Walnuts"),
  createChoice("pecans", "Pecans"),
  createChoice("pistachios", "Pistachios"),
  createChoice("parmesan", "Parmesan"),
  createChoice("ricotta", "Ricotta"),
  createChoice("cottage_cheese_top", "Cottage cheese"),
  createChoice("jam", "Jam"),
  createChoice("maple_syrup", "Maple syrup"),
  createChoice("cinnamon", "Cinnamon"),
  createChoice("everything_seasoning", "Everything seasoning"),
  createChoice("pico", "Pico de gallo"),
  createChoice("olive_tapenade", "Olive tapenade"),
  createChoice("kimchi", "Kimchi"),
  createChoice("hummus", "Hummus"),
]);

const MAIN_PROTEIN_POOL = Object.freeze([
  createChoice("chicken_breast", "Chicken (6-8 oz)", "chicken"),
  createChoice("chicken_thigh", "Chicken thighs (6-8 oz)", "chicken"),
  createChoice("lean_ground_turkey", "Ground turkey (6-8 oz)", "turkey"),
  createChoice("turkey_meatballs", "Turkey meatballs", "turkey"),
  createChoice("lean_ground_beef", "Lean ground beef (6-8 oz)", "beef"),
  createChoice("flank_steak", "Steak (6-8 oz)", "beef"),
  createChoice("sirloin", "Sirloin (6-8 oz)", "beef"),
  createChoice("salmon", "Salmon (6-8 oz)", "salmon"),
  createChoice("shrimp", "Shrimp", "shrimp"),
  createChoice("tuna", "Tuna", "tuna"),
  createChoice("pork_tenderloin", "Pork tenderloin", "pork"),
  createChoice("tofu", "Tofu", "tofu"),
  createChoice("tempeh", "Tempeh", "tempeh"),
  createChoice("cod", "Cod", "white_fish"),
  createChoice("tilapia", "Tilapia", "white_fish"),
  createChoice("mahi_mahi", "Mahi mahi", "white_fish"),
  createChoice("trout", "Trout", "trout"),
  createChoice("sardines", "Sardines", "sardines"),
  createChoice("lean_ground_chicken", "Ground chicken (6-8 oz)", "chicken"),
  createChoice("chicken_sausage", "Chicken sausage", "chicken"),
  createChoice("turkey_burger", "Turkey burger patty", "turkey"),
  createChoice("beef_meatballs", "Lean beef meatballs", "beef"),
  createChoice("bison", "Bison", "bison"),
  createChoice("top_round", "Top round steak", "beef"),
  createChoice("pork_chop", "Pork chop", "pork"),
  createChoice("ham_steak", "Lean ham steak", "pork"),
  createChoice("seitan", "Seitan", "seitan"),
  createChoice("edamame", "Edamame", "edamame"),
  createChoice("lentils", "Lentils", "lentils"),
  createChoice("black_beans", "Black beans", "beans"),
  createChoice("chickpeas", "Chickpeas", "beans"),
  createChoice("cottage_cheese_protein", "Cottage cheese", "dairy_protein"),
]);

const BOWL_CARB_POOL = Object.freeze([
  createChoice("jasmine_rice", "Rice (1 cup cooked)", "rice"),
  createChoice("basmati_rice", "Basmati rice", "rice"),
  createChoice("quinoa", "Quinoa", "quinoa"),
  createChoice("farro", "Farro", "farro"),
  createChoice("couscous", "Couscous", "couscous"),
  createChoice("roasted_potatoes", "Roasted potatoes", "potatoes"),
  createChoice("sweet_potato", "Sweet potato", "potatoes"),
  createChoice("pita", "Pita", "bread"),
  createChoice("wrap", "Whole-grain wrap", "wrap"),
  createChoice("pasta", "Pasta", "pasta"),
  createChoice("rice_noodles", "Rice noodles", "noodles"),
  createChoice("wild_rice", "Wild rice", "rice"),
  createChoice("brown_rice", "Brown rice", "rice"),
  createChoice("orzo", "Orzo", "pasta"),
  createChoice("cavatappi", "Cavatappi", "pasta"),
  createChoice("udon", "Udon noodles", "noodles"),
  createChoice("soba", "Soba noodles", "noodles"),
  createChoice("barley", "Barley", "barley"),
  createChoice("polenta", "Polenta", "corn"),
  createChoice("lentil_pasta", "Lentil pasta", "pasta"),
  createChoice("chickpea_pasta", "Chickpea pasta", "pasta"),
  createChoice("sourdough_roll", "Sourdough roll", "bread"),
  createChoice("naan", "Naan", "bread"),
  createChoice("roti", "Roti", "bread"),
  createChoice("bagel_side", "Bagel", "bread"),
  createChoice("mashed_potatoes", "Mashed potatoes", "potatoes"),
  createChoice("baby_potatoes", "Baby potatoes", "potatoes"),
  createChoice("plantains", "Plantains", "plantains"),
]);

const BOWL_PRODUCE_POOL = Object.freeze([
  createChoice("cucumber_tomato_onion", "Cucumber, tomato, and onion"),
  createChoice("spinach_salad", "Spinach or salad base"),
  createChoice("roasted_peppers_onions", "Roasted peppers + onions"),
  createChoice("broccoli_carrots", "Broccoli + carrots"),
  createChoice("shredded_lettuce_pico", "Shredded lettuce + pico"),
  createChoice("mixed_greens", "Mixed greens"),
  createChoice("snap_peas_carrots", "Snap peas + carrots"),
  createChoice("zucchini_tomatoes", "Zucchini + tomatoes"),
  createChoice("green_beans_peppers", "Green beans + peppers"),
  createChoice("cabbage_cilantro", "Shredded cabbage + cilantro"),
  createChoice("arugula_fennel", "Arugula + fennel"),
  createChoice("romaine_cucumber", "Romaine + cucumber"),
  createChoice("broccolini_lemon", "Broccolini + lemon"),
  createChoice("charred_corn_peppers", "Charred corn + peppers"),
  createChoice("pickled_onions_cucumber", "Pickled onions + cucumber"),
  createChoice("roasted_cauliflower", "Roasted cauliflower"),
  createChoice("brussels_balsamic", "Brussels sprouts"),
  createChoice("kale_slaw", "Kale slaw"),
  createChoice("edamame_cabbage", "Edamame + cabbage"),
  createChoice("beets_arugula", "Beets + arugula"),
  createChoice("tomato_basil_salad", "Tomato + basil salad"),
  createChoice("roasted_eggplant", "Roasted eggplant"),
  createChoice("grilled_zucchini", "Grilled zucchini"),
  createChoice("peas_mint", "Peas + herbs"),
  createChoice("carrot_ribbon_salad", "Carrot ribbon salad"),
  createChoice("spinach_strawberries", "Spinach + strawberries"),
  createChoice("cucumber_dill", "Cucumber + dill"),
  createChoice("radish_cucumber", "Radish + cucumber"),
  createChoice("roasted_squash", "Roasted squash"),
  createChoice("slaw_jalapeno", "Slaw + jalapeno"),
]);

const DINNER_VEG_POOL = Object.freeze([
  createChoice("broccoli", "Broccoli"),
  createChoice("green_beans", "Green beans"),
  createChoice("asparagus", "Asparagus"),
  createChoice("roasted_zucchini", "Roasted zucchini"),
  createChoice("brussels", "Brussels sprouts"),
  createChoice("mixed_veg", "Mixed roasted vegetables"),
  createChoice("peppers_onions", "Peppers + onions"),
  createChoice("spinach", "Sauteed spinach"),
  createChoice("cauliflower", "Cauliflower"),
  createChoice("salad", "Simple salad"),
  createChoice("broccolini", "Broccolini"),
  createChoice("carrots", "Roasted carrots"),
  createChoice("cabbage", "Sauteed cabbage"),
  createChoice("bok_choy", "Bok choy"),
  createChoice("snap_peas", "Snap peas"),
  createChoice("mushrooms", "Mushrooms"),
  createChoice("kale", "Kale"),
  createChoice("beets", "Beets"),
  createChoice("acorn_squash", "Acorn squash"),
  createChoice("spaghetti_squash", "Spaghetti squash"),
  createChoice("fennel", "Roasted fennel"),
  createChoice("okra", "Okra"),
  createChoice("eggplant", "Eggplant"),
  createChoice("collards", "Collard greens"),
]);

const LUNCH_FINISH_POOL = Object.freeze([
  createChoice("olive_lemon", "Lemon + olive oil + salt"),
  createChoice("feta_tzatziki", "Feta + tzatziki"),
  createChoice("salsa_avocado", "Salsa + avocado"),
  createChoice("pesto_parmesan", "Pesto + parmesan"),
  createChoice("sesame_soy", "Sesame + soy glaze"),
  createChoice("hummus_sumac", "Hummus + sumac"),
  createChoice("tahini_lemon", "Tahini + lemon"),
  createChoice("chili_crisp", "Chili crisp"),
  createChoice("chimichurri", "Chimichurri"),
  createChoice("green_goddess", "Green goddess dressing"),
  createChoice("yogurt_dill", "Yogurt + dill"),
  createChoice("harissa_yogurt", "Harissa yogurt"),
  createChoice("chipotle_yogurt", "Chipotle yogurt"),
  createChoice("lime_cilantro", "Lime + cilantro"),
  createChoice("balsamic_olive", "Balsamic + olive oil"),
  createChoice("soy_lime", "Soy + lime"),
  createChoice("miso_ginger", "Miso + ginger"),
  createChoice("sriracha_mayo_light", "Light sriracha mayo"),
  createChoice("bbq_light", "Light BBQ sauce"),
  createChoice("romesco", "Romesco"),
  createChoice("olive_herbs", "Olive oil + herbs"),
  createChoice("sun_dried_tomato", "Sun-dried tomato dressing"),
]);

const DINNER_FINISH_POOL = Object.freeze([
  createChoice("paprika_oil", "Olive oil + salt + paprika"),
  createChoice("garlic_chili_cumin", "Garlic + chili powder + cumin + salt"),
  createChoice("oregano_lemon", "Oregano + lemon + olive oil"),
  createChoice("ginger_soy", "Ginger + soy + sesame"),
  createChoice("black_pepper_butter", "Black pepper + a small butter finish"),
  createChoice("pesto_parm", "Pesto + parmesan"),
  createChoice("shawarma_spice", "Shawarma spice + lemon"),
  createChoice("chipotle_lime", "Chipotle + lime"),
  createChoice("cajun_rub", "Cajun spice + olive oil"),
  createChoice("garlic_herb", "Garlic + herbs"),
  createChoice("harissa_lemon", "Harissa + lemon"),
  createChoice("balsamic_rosemary", "Balsamic + rosemary"),
  createChoice("mustard_honey", "Mustard + honey"),
  createChoice("soy_garlic", "Soy + garlic"),
  createChoice("blackened_spice", "Blackened spice"),
  createChoice("taco_spice", "Taco seasoning"),
  createChoice("curry_yogurt", "Curry yogurt"),
  createChoice("teriyaki_light", "Light teriyaki glaze"),
  createChoice("zaatar_oil", "Za'atar + olive oil"),
  createChoice("buffalo_light", "Light buffalo sauce"),
  createChoice("garlic_parm", "Garlic + parmesan"),
  createChoice("smoky_paprika", "Smoked paprika + garlic"),
]);

const SNACK_BACKFILL_POOL = Object.freeze([
  { id: "shake_banana", label: "Protein shake (30-40g) + banana", family: "shake", tags: ["hard", "hybrid", "strength", "running"] },
  { id: "greek_yogurt", label: "Greek yogurt (20g) + berries", family: "yogurt", tags: ["body_comp", "recovery", "general"] },
  { id: "cottage_cheese", label: "Cottage cheese (20g) + pineapple", family: "cottage_cheese", tags: ["strength", "recovery", "general"] },
  { id: "skyr_granola", label: "Skyr + granola", family: "skyr", tags: ["hard", "running", "hybrid"] },
  { id: "rtd_shake", label: "Ready-to-drink shake + pretzels", family: "ready_shake", tags: ["travel", "hard", "time_crunch"] },
  { id: "jerky_fruit", label: "Jerky + fruit", family: "jerky", tags: ["travel", "general", "body_comp"] },
  { id: "edamame_shake", label: "Edamame + whey shake", family: "plant_combo", tags: ["general", "hybrid"] },
  { id: "turkey_rollups", label: "Turkey roll-ups + fruit", family: "turkey", tags: ["strength", "body_comp"] },
  { id: "protein_bar_yogurt", label: "Protein bar + yogurt", family: "bar", tags: ["travel", "time_crunch"] },
  { id: "oats_whey", label: "Instant oats + whey", family: "oats", tags: ["running", "hard"] },
  { id: "milk_cereal", label: "High-protein cereal + milk", family: "cereal", tags: ["hard", "general"] },
  { id: "apple_cheese", label: "Apple + string cheese + shake", family: "cheese", tags: ["recovery", "body_comp"] },
  { id: "skyr_kiwi", label: "Skyr + kiwi", family: "skyr", tags: ["general", "recovery", "body_comp"] },
  { id: "protein_pudding", label: "Protein pudding cup", family: "pudding", tags: ["body_comp", "general"] },
  { id: "turkey_crackers", label: "Turkey slices + crackers", family: "turkey", tags: ["strength", "general"] },
  { id: "egg_fruit", label: "Hard-boiled eggs + fruit", family: "eggs", tags: ["recovery", "general"] },
  { id: "tuna_rice_cakes", label: "Tuna + rice cakes", family: "tuna", tags: ["hard", "running"] },
  { id: "hummus_pita_yogurt", label: "Hummus + pita + Greek yogurt", family: "hummus_combo", tags: ["general", "hybrid"] },
  { id: "cottage_berries_cereal", label: "Cottage cheese + berries + cereal", family: "cottage_cheese", tags: ["hard", "strength"] },
  { id: "fairlife_shake", label: "Fairlife shake + banana", family: "ready_shake", tags: ["travel", "hard", "strength"] },
  { id: "protein_oatmeal", label: "Protein oatmeal cup", family: "oatmeal", tags: ["running", "hard"] },
  { id: "salmon_crackers", label: "Smoked salmon + crackers", family: "salmon", tags: ["general", "travel"] },
  { id: "edamame_fruit", label: "Edamame + fruit", family: "edamame", tags: ["general", "recovery"] },
  { id: "cheese_jerky", label: "Cheese stick + jerky", family: "jerky", tags: ["travel", "strength"] },
  { id: "protein_muffin", label: "Protein muffin + yogurt", family: "muffin", tags: ["general", "time_crunch"] },
  { id: "trail_mix_shake", label: "Trail mix + protein shake", family: "trail_mix", tags: ["hard", "travel"] },
  { id: "turkey_hummus_wrap", label: "Turkey + hummus wrap", family: "wrap", tags: ["strength", "general"] },
  { id: "overnight_oats_cup", label: "Overnight oats cup + skyr", family: "oatmeal", tags: ["running", "hard", "general"] },
  { id: "tuna_pita", label: "Tuna pita + fruit", family: "tuna", tags: ["general", "travel", "strength"] },
  { id: "protein_pancakes", label: "Protein pancakes + yogurt", family: "pancake", tags: ["hard", "general"] },
  { id: "cottage_rice_cakes", label: "Cottage cheese + rice cakes + jam", family: "cottage_cheese", tags: ["running", "hard", "general"] },
  { id: "egg_wrap", label: "Egg wrap + salsa", family: "eggs", tags: ["strength", "general", "time_crunch"] },
  { id: "tofu_snack_box", label: "Tofu snack box + fruit", family: "tofu", tags: ["recovery", "general"] },
  { id: "protein_cereal_cup", label: "Protein cereal cup + milk", family: "cereal", tags: ["time_crunch", "general"] },
  { id: "yogurt_trail_mix", label: "Greek yogurt + trail mix", family: "yogurt", tags: ["travel", "general"] },
  { id: "bean_dip_plate", label: "Bean dip + pita + shake", family: "bean_combo", tags: ["hybrid", "general"] },
  { id: "skyr_apple_pb", label: "Skyr + apple + peanut butter", family: "skyr", tags: ["body_comp", "recovery", "general"] },
  { id: "smoked_turkey_bagel", label: "Smoked turkey + mini bagel", family: "turkey", tags: ["running", "strength", "travel"] },
  { id: "chia_pudding_shake", label: "Chia pudding + protein shake", family: "chia", tags: ["body_comp", "general"] },
]);

const CUISINE_POOL_PREFERENCES = Object.freeze({
  mediterranean: {
    savoryVeg: ["spinach_tomato", "arugula_tomato", "spinach_onions"],
    breakfastTopping: ["feta", "tzatziki", "avocado"],
    lunchFinish: ["olive_lemon", "feta_tzatziki", "tahini_lemon", "hummus_sumac"],
    dinnerFinish: ["oregano_lemon", "shawarma_spice", "pesto_parm"],
    bowlProduce: ["cucumber_tomato_onion", "spinach_salad", "roasted_peppers_onions"],
    bowlCarb: ["jasmine_rice", "quinoa", "couscous", "roasted_potatoes", "pita"],
    lunchProtein: ["chicken_breast", "salmon", "shrimp", "lean_ground_turkey"],
    dinnerProtein: ["salmon", "chicken_breast", "pork_tenderloin", "shrimp"],
  },
  mexican: {
    savoryVeg: ["peppers_onions", "spinach_onions"],
    breakfastTopping: ["salsa", "avocado", "hot_sauce"],
    lunchFinish: ["salsa_avocado", "olive_lemon"],
    dinnerFinish: ["garlic_chili_cumin", "chipotle_lime", "paprika_oil"],
    bowlProduce: ["shredded_lettuce_pico", "cabbage_cilantro", "peppers_onions"],
    bowlCarb: ["jasmine_rice", "roasted_potatoes", "corn_tortillas", "wrap"],
    lunchProtein: ["chicken_breast", "lean_ground_beef", "lean_ground_turkey", "shrimp"],
    dinnerProtein: ["lean_ground_beef", "chicken_breast", "sirloin", "shrimp"],
  },
  asian: {
    breakfastTopping: ["hot_sauce", "honey"],
    lunchFinish: ["sesame_soy", "chili_crisp"],
    dinnerFinish: ["ginger_soy", "chili_crisp"],
    bowlProduce: ["snap_peas_carrots", "broccoli_carrots", "green_beans_peppers"],
    bowlCarb: ["jasmine_rice", "basmati_rice", "rice_noodles"],
    lunchProtein: ["chicken_breast", "salmon", "shrimp", "tofu"],
    dinnerProtein: ["salmon", "shrimp", "chicken_breast", "tofu"],
  },
  italian: {
    breakfastTopping: ["goat_cheese", "honey"],
    lunchFinish: ["pesto_parmesan", "olive_lemon"],
    dinnerFinish: ["pesto_parm", "black_pepper_butter", "oregano_lemon"],
    bowlProduce: ["mixed_greens", "zucchini_tomatoes", "spinach_salad"],
    bowlCarb: ["pasta", "roasted_potatoes", "farro", "sourdough"],
    lunchProtein: ["chicken_breast", "turkey_meatballs", "salmon"],
    dinnerProtein: ["turkey_meatballs", "chicken_breast", "sirloin", "salmon"],
  },
  american_grill: {
    breakfastTopping: ["avocado", "hot_sauce", "peanut_butter"],
    lunchFinish: ["olive_lemon", "salsa_avocado"],
    dinnerFinish: ["paprika_oil", "black_pepper_butter", "garlic_chili_cumin"],
    bowlProduce: ["mixed_greens", "broccoli_carrots", "roasted_peppers_onions"],
    bowlCarb: ["roasted_potatoes", "sweet_potato", "jasmine_rice", "wrap"],
    lunchProtein: ["chicken_breast", "sirloin", "lean_ground_turkey", "salmon"],
    dinnerProtein: ["sirloin", "lean_ground_beef", "chicken_breast", "salmon"],
  },
  middle_eastern: {
    breakfastTopping: ["feta", "tzatziki", "avocado"],
    lunchFinish: ["hummus_sumac", "tahini_lemon", "olive_lemon"],
    dinnerFinish: ["shawarma_spice", "oregano_lemon"],
    bowlProduce: ["cucumber_tomato_onion", "spinach_salad", "cabbage_cilantro"],
    bowlCarb: ["jasmine_rice", "pita", "quinoa", "roasted_potatoes"],
    lunchProtein: ["chicken_breast", "lean_ground_turkey", "salmon"],
    dinnerProtein: ["chicken_breast", "pork_tenderloin", "salmon", "lean_ground_turkey"],
  },
});

const PATTERN_LIBRARY = Object.freeze({
  breakfast: [
    {
      id: "egg_bowl",
      cuisines: ["mediterranean", "american_grill", "middle_eastern", "mexican", "general"],
      goalBiases: ["strength", "hybrid_performance", "general"],
      mealFamilies: ["strength_support", "hybrid_support", "balanced", "recovery"],
      highCarb: false,
      bodyCompFriendly: true,
      detailLabel: "Why this matters",
      title: () => "Egg Bowl",
      pickParts: (ctx, state, seed) => ({
        veg: pickFromPool({ poolName: "savoryVeg", pool: SAVORY_VEG_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_veg`, usedSet: state.usedProduce }),
        topping: pickFromPool({ poolName: "breakfastTopping", pool: BREAKFAST_TOPPING_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_top`, usedSet: state.usedFinishes }),
        starch: pickFromPool({ poolName: "breakfastCarb", pool: BREAKFAST_STARCH_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
      }),
      build: (ctx, picks) => {
        const items = ["2 whole eggs", "1 cup egg whites", picks.veg.label, picks.topping.label];
        if (ctx.hardSession || ctx.hybridSession) items.push(`Add ${picks.starch.label.toLowerCase()} if the session is still ahead.`);
        return items;
      },
      detailLine: (ctx) => ctx.hardSession
        ? "Protein gets locked in early, and you still have room to place carbs closer to the session."
        : "High protein and real food volume make the rest of the day easier to control.",
      why: (ctx) => ctx.goalBias === "body_comp"
        ? "This is high satiety, high protein, and still flexible enough to keep carbs available later."
        : "This gets a real protein hit in early without making breakfast feel heavy.",
    },
    {
      id: "greek_yogurt_bowl",
      cuisines: ["mediterranean", "general", "american_grill"],
      goalBiases: ["running", "body_comp", "general"],
      mealFamilies: ["quality_endurance", "long_endurance", "balanced", "recovery"],
      highCarb: true,
      bodyCompFriendly: true,
      detailLabel: "Upgrade move",
      title: () => "Greek Yogurt Bowl",
      pickParts: (ctx, state, seed) => ({
        fruit: pickFromPool({ poolName: "breakfastFruit", pool: BREAKFAST_FRUIT_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_fruit`, usedSet: state.usedProduce }),
        topping: pickFromPool({ poolName: "breakfastCarb", pool: BREAKFAST_STARCH_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        finish: pickFromPool({ poolName: "breakfastTopping", pool: BREAKFAST_TOPPING_POOL.filter((item) => ["honey", "chia", "almond_butter", "peanut_butter"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_top`, usedSet: state.usedFinishes }),
      }),
      build: (ctx, picks) => [
        "2 cups Greek yogurt or skyr",
        picks.fruit.label,
        picks.topping.id === "berries_granola" ? picks.topping.label : `${picks.topping.label} on the side`,
        picks.finish.label,
      ],
      detailLine: (ctx) => ctx.hardSession
        ? "Add a second carb source here if the quality session is early or the last hard day left you flat."
        : "Keep this simple and repeatable. It should feel like a default, not a project.",
      why: (ctx) => ctx.recoverySession
        ? "Easy protein and carbs without a lot of prep is exactly the point today."
        : "This is light enough to digest well and still strong on protein.",
    },
    {
      id: "overnight_oats",
      cuisines: ["general", "mediterranean", "american_grill"],
      goalBiases: ["running", "hybrid_performance"],
      mealFamilies: ["quality_endurance", "long_endurance", "hybrid_support", "balanced"],
      highCarb: true,
      detailLabel: "Why this matters",
      title: () => "Overnight Oats",
      pickParts: (ctx, state, seed) => ({
        fruit: pickFromPool({ poolName: "breakfastFruit", pool: BREAKFAST_FRUIT_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_fruit`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "breakfastTopping", pool: BREAKFAST_TOPPING_POOL.filter((item) => ["honey", "chia", "almond_butter", "peanut_butter"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_top`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "Oats",
        "Whey or Greek yogurt",
        picks.fruit.label,
        picks.finish.label,
      ],
      detailLine: () => "This is a cleaner way to put carbs where performance actually benefits from them.",
      why: () => "Low friction, easy to prep ahead, and much harder to mess up on a busy morning.",
    },
    {
      id: "breakfast_tacos",
      cuisines: ["mexican", "american_grill", "general"],
      goalBiases: ["strength", "hybrid_performance", "general"],
      mealFamilies: ["strength_support", "hybrid_support", "balanced"],
      highCarb: true,
      detailLabel: "Execution tip",
      title: () => "Breakfast Tacos",
      pickParts: (ctx, state, seed) => ({
        fruit: pickFromPool({ poolName: "breakfastFruit", pool: BREAKFAST_FRUIT_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_fruit`, usedSet: state.usedProduce }),
        topping: pickFromPool({ poolName: "breakfastTopping", pool: BREAKFAST_TOPPING_POOL.filter((item) => ["salsa", "avocado", "hot_sauce", "feta"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_top`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "2 eggs + 1 cup egg whites",
        "Corn tortillas",
        "Turkey sausage or black beans",
        picks.topping.label,
        `Side of ${picks.fruit.label.toLowerCase()}`,
      ],
      detailLine: () => "Keep the fat moderate so this still feels like fuel, not a food coma.",
      why: () => "This reads like a real meal, which makes adherence easier than another bowl of plain oats.",
    },
    {
      id: "hotel_breakfast_plate",
      cuisines: ["general"],
      goalBiases: ["general", "running", "strength", "body_comp", "hybrid_performance"],
      mealFamilies: ["quality_endurance", "long_endurance", "hybrid_support", "strength_support", "recovery", "balanced"],
      highCarb: true,
      travelFriendly: true,
      detailLabel: "Travel version",
      title: () => "Hotel Breakfast Plate",
      pickParts: (ctx, state, seed) => ({
        fruit: pickFromPool({ poolName: "breakfastFruit", pool: BREAKFAST_FRUIT_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_fruit`, usedSet: state.usedProduce }),
        starch: pickFromPool({ poolName: "breakfastCarb", pool: BREAKFAST_STARCH_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
      }),
      build: (_ctx, picks) => [
        "Eggs",
        "Greek yogurt",
        picks.fruit.label,
        picks.starch.label,
      ],
      detailLine: () => "Do not overthink this. Get protein first, then the easiest carb you trust.",
      why: () => "Travel days reward clean defaults more than creative food choices.",
    },
    {
      id: "cottage_cheese_bowl",
      cuisines: ["general", "american_grill", "mediterranean"],
      goalBiases: ["body_comp", "strength", "general"],
      mealFamilies: ["recovery", "balanced", "strength_support"],
      bodyCompFriendly: true,
      detailLabel: "Why this works",
      title: () => "Cottage Cheese Bowl",
      pickParts: (ctx, state, seed) => ({
        fruit: pickFromPool({ poolName: "breakfastFruit", pool: BREAKFAST_FRUIT_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_fruit`, usedSet: state.usedProduce }),
        topping: pickFromPool({ poolName: "breakfastTopping", pool: BREAKFAST_TOPPING_POOL.filter((item) => ["chia", "walnuts", "pecans", "honey", "cinnamon"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_top`, usedSet: state.usedFinishes }),
        starch: pickFromPool({ poolName: "breakfastCarb", pool: BREAKFAST_STARCH_POOL.filter((item) => ["berries_granola", "rice_cakes", "muesli"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
      }),
      build: (_ctx, picks) => [
        "1.5-2 cups cottage cheese",
        picks.fruit.label,
        picks.starch.label,
        picks.topping.label,
      ],
      detailLine: () => "This is one of the cheapest high-protein breakfasts you can keep in rotation without getting bored.",
      why: () => "High protein, fast assembly, and enough texture that it does not feel like backup food.",
    },
    {
      id: "protein_smoothie",
      cuisines: ["general", "american_grill"],
      goalBiases: ["running", "hybrid_performance", "general"],
      mealFamilies: ["quality_endurance", "long_endurance", "hybrid_support", "balanced"],
      highCarb: true,
      detailLabel: "Execution tip",
      title: () => "Protein Smoothie",
      pickParts: (ctx, state, seed) => ({
        fruit: pickFromPool({ poolName: "breakfastFruit", pool: BREAKFAST_FRUIT_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_fruit`, usedSet: state.usedProduce }),
        starch: pickFromPool({ poolName: "breakfastCarb", pool: BREAKFAST_STARCH_POOL.filter((item) => ["oats", "cream_of_rice", "rice_cakes", "mini_bagel"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        finish: pickFromPool({ poolName: "breakfastTopping", pool: BREAKFAST_TOPPING_POOL.filter((item) => ["peanut_butter", "almond_butter", "chia", "cinnamon"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_top`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "Whey or ready-to-drink protein shake",
        picks.fruit.label,
        picks.starch.label,
        picks.finish.label,
      ],
      detailLine: () => "Blend it thick enough to feel like breakfast, not like a random supplement.",
      why: () => "This is the fastest way to get protein and a usable carb source in when mornings are tight.",
    },
    {
      id: "savory_oats",
      cuisines: ["general", "american_grill", "mediterranean"],
      goalBiases: ["strength", "general", "hybrid_performance"],
      mealFamilies: ["strength_support", "balanced", "hybrid_support"],
      detailLabel: "Make it better",
      title: () => "Savory Oats",
      pickParts: (ctx, state, seed) => ({
        veg: pickFromPool({ poolName: "savoryVeg", pool: SAVORY_VEG_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_veg`, usedSet: state.usedProduce }),
        topping: pickFromPool({ poolName: "breakfastTopping", pool: BREAKFAST_TOPPING_POOL.filter((item) => ["parmesan", "feta", "hot_sauce", "everything_seasoning"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_top`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "Savory oats",
        "Egg whites or 2 whole eggs",
        picks.veg.label,
        picks.topping.label,
      ],
      detailLine: () => "Salt it properly and use the eggs or egg whites as the protein anchor, not as an afterthought.",
      why: () => "This breaks the sweet-breakfast loop while still giving you a cheap, repeatable protein-and-carb base.",
    },
    {
      id: "breakfast_sandwich",
      cuisines: ["american_grill", "general"],
      goalBiases: ["strength", "general", "hybrid_performance"],
      mealFamilies: ["strength_support", "balanced", "hybrid_support"],
      highCarb: true,
      detailLabel: "Execution tip",
      title: () => "Breakfast Sandwich",
      pickParts: (ctx, state, seed) => ({
        starch: pickFromPool({ poolName: "breakfastCarb", pool: BREAKFAST_STARCH_POOL.filter((item) => ["english_muffin", "bagel", "whole_grain_toast", "sprouted_toast"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        fruit: pickFromPool({ poolName: "breakfastFruit", pool: BREAKFAST_FRUIT_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_fruit`, usedSet: state.usedProduce }),
        topping: pickFromPool({ poolName: "breakfastTopping", pool: BREAKFAST_TOPPING_POOL.filter((item) => ["hot_sauce", "avocado", "salsa", "parmesan"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_top`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "2 eggs + egg whites",
        picks.starch.label,
        "Turkey sausage or chicken sausage",
        picks.topping.label,
        `Side of ${picks.fruit.label.toLowerCase()}`,
      ],
      detailLine: () => "Keep one version of this easy enough that you would still make it on a rushed weekday.",
      why: () => "If breakfast needs to feel normal and satisfying, this is a better default than another forced bowl.",
    },
    {
      id: "chia_skyr_pudding",
      cuisines: ["general", "mediterranean"],
      goalBiases: ["body_comp", "running", "general"],
      mealFamilies: ["recovery", "balanced", "quality_endurance"],
      bodyCompFriendly: true,
      detailLabel: "Why this matters",
      title: () => "Chia Skyr Pudding",
      pickParts: (ctx, state, seed) => ({
        fruit: pickFromPool({ poolName: "breakfastFruit", pool: BREAKFAST_FRUIT_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_fruit`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "breakfastTopping", pool: BREAKFAST_TOPPING_POOL.filter((item) => ["honey", "almond_butter", "cinnamon", "walnuts"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_top`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "Skyr or Greek yogurt",
        "Chia seeds",
        picks.fruit.label,
        picks.finish.label,
      ],
      detailLine: () => "Prep two jars at a time so it behaves like a default breakfast instead of a one-off recipe.",
      why: () => "This keeps breakfast cold, fast, and protein-forward without leaning on the same yogurt bowl every time.",
    },
  ],
  lunch: [
    {
      id: "mediterranean_bowl",
      cuisines: ["mediterranean", "middle_eastern", "general"],
      goalBiases: ["general", "strength", "hybrid_performance", "body_comp"],
      mealFamilies: ["strength_support", "hybrid_support", "balanced", "recovery"],
      detailLabel: "Upgrade move",
      title: (picks) => `${picks.protein.short} Mediterranean Bowl`,
      pickParts: (ctx, state, seed) => ({
        protein: pickFromPool({ poolName: "lunchProtein", pool: MAIN_PROTEIN_POOL.filter((item) => ["chicken_breast", "chicken_thigh", "salmon", "shrimp", "lean_ground_turkey"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_protein`, usedSet: state.usedProteins }),
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        produce: pickFromPool({ poolName: "bowlProduce", pool: BOWL_PRODUCE_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_produce`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "lunchFinish", pool: LUNCH_FINISH_POOL, cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        picks.protein.label,
        picks.carb.label,
        picks.produce.label,
        picks.finish.label,
      ],
      detailLine: (ctx) => ctx.bodyCompBias
        ? "Keep the carb measured, but do not strip it so hard that the afternoon falls apart."
        : "Add lemon + olive oil + salt at the end so it actually tastes like a real lunch.",
      why: (ctx) => ctx.strengthSession
        ? "Balanced carbs here set up a better afternoon lift and keep protein pacing on track."
        : "This is the steady-energy lunch: enough carb to keep momentum, enough protein to keep the day useful.",
    },
    {
      id: "burrito_bowl",
      cuisines: ["mexican", "american_grill", "general"],
      goalBiases: ["running", "hybrid_performance", "strength"],
      mealFamilies: ["quality_endurance", "long_endurance", "hybrid_support", "strength_support", "balanced"],
      highCarb: true,
      detailLabel: "Execution tip",
      title: (picks) => `${picks.protein.short} Burrito Bowl`,
      pickParts: (ctx, state, seed) => ({
        protein: pickFromPool({ poolName: "lunchProtein", pool: MAIN_PROTEIN_POOL.filter((item) => ["chicken_breast", "lean_ground_beef", "lean_ground_turkey", "shrimp", "sirloin"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_protein`, usedSet: state.usedProteins }),
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["jasmine_rice", "roasted_potatoes", "wrap"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        produce: pickFromPool({ poolName: "bowlProduce", pool: BOWL_PRODUCE_POOL.filter((item) => ["shredded_lettuce_pico", "cabbage_cilantro", "peppers_onions"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_produce`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "lunchFinish", pool: LUNCH_FINISH_POOL.filter((item) => ["salsa_avocado", "olive_lemon"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        picks.protein.label,
        picks.carb.label,
        picks.produce.label,
        picks.finish.label,
      ],
      detailLine: (ctx) => ctx.hardSession
        ? "If the hard work is later, do not be shy with the rice."
        : "Keep sauces controlled and let the protein + carb do the work.",
      why: () => "This is a reliable fuel meal when you need something satisfying and hard to miss.",
    },
    {
      id: "shawarma_plate",
      cuisines: ["middle_eastern", "mediterranean", "general"],
      goalBiases: ["strength", "general", "body_comp"],
      mealFamilies: ["strength_support", "balanced", "recovery", "hybrid_support"],
      detailLabel: "Upgrade move",
      title: (picks) => `${picks.protein.short} Shawarma Plate`,
      pickParts: (ctx, state, seed) => ({
        protein: pickFromPool({ poolName: "lunchProtein", pool: MAIN_PROTEIN_POOL.filter((item) => ["chicken_breast", "chicken_thigh", "lean_ground_turkey", "salmon"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_protein`, usedSet: state.usedProteins }),
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["jasmine_rice", "pita", "quinoa", "roasted_potatoes"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        produce: pickFromPool({ poolName: "bowlProduce", pool: BOWL_PRODUCE_POOL.filter((item) => ["cucumber_tomato_onion", "spinach_salad", "cabbage_cilantro"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_produce`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "lunchFinish", pool: LUNCH_FINISH_POOL.filter((item) => ["hummus_sumac", "tahini_lemon", "feta_tzatziki"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [picks.protein.label, picks.carb.label, picks.produce.label, picks.finish.label],
      detailLine: () => "Salt this like a real meal. Under-seasoned food is one of the fastest routes to random snacking.",
      why: () => "This gives you a high-protein lunch without turning it into another boring salad.",
    },
    {
      id: "teriyaki_bowl",
      cuisines: ["asian", "general"],
      goalBiases: ["running", "hybrid_performance", "general"],
      mealFamilies: ["quality_endurance", "long_endurance", "hybrid_support", "balanced"],
      highCarb: true,
      detailLabel: "Execution tip",
      title: (picks) => `${picks.protein.short} Rice Bowl`,
      pickParts: (ctx, state, seed) => ({
        protein: pickFromPool({ poolName: "lunchProtein", pool: MAIN_PROTEIN_POOL.filter((item) => ["chicken_breast", "salmon", "shrimp", "tofu"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_protein`, usedSet: state.usedProteins }),
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["jasmine_rice", "basmati_rice", "rice_noodles"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        produce: pickFromPool({ poolName: "bowlProduce", pool: BOWL_PRODUCE_POOL.filter((item) => ["snap_peas_carrots", "broccoli_carrots", "green_beans_peppers"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_produce`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "lunchFinish", pool: LUNCH_FINISH_POOL.filter((item) => ["sesame_soy", "chili_crisp"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [picks.protein.label, picks.carb.label, picks.produce.label, picks.finish.label],
      detailLine: () => "Keep the sauce honest. You want flavor, not an accidental calorie bomb.",
      why: () => "This lands cleanly when you want carbs visible but still want the meal to feel structured.",
    },
    {
      id: "wrap_plate",
      cuisines: ["american_grill", "general", "italian"],
      goalBiases: ["body_comp", "strength", "general"],
      mealFamilies: ["balanced", "recovery", "strength_support"],
      bodyCompFriendly: true,
      detailLabel: "Make it elite",
      title: (picks) => `${picks.protein.short} Wrap`,
      pickParts: (ctx, state, seed) => ({
        protein: pickFromPool({ poolName: "lunchProtein", pool: MAIN_PROTEIN_POOL.filter((item) => ["chicken_breast", "tuna", "lean_ground_turkey", "sirloin"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_protein`, usedSet: state.usedProteins }),
        produce: pickFromPool({ poolName: "bowlProduce", pool: BOWL_PRODUCE_POOL.filter((item) => ["mixed_greens", "cucumber_tomato_onion", "spinach_salad"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_produce`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "lunchFinish", pool: LUNCH_FINISH_POOL.filter((item) => ["olive_lemon", "pesto_parmesan", "tahini_lemon"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        picks.protein.label,
        "Whole-grain wrap",
        picks.produce.label,
        picks.finish.label,
        "Fruit or yogurt on the side",
      ],
      detailLine: () => "This is the low-friction option. Use it when convenience matters more than culinary ambition.",
      why: () => "You still get a real lunch, but it moves much faster than a bowl or plate build.",
    },
    {
      id: "airport_grain_bowl",
      cuisines: ["general"],
      goalBiases: ["general", "running", "strength", "body_comp", "hybrid_performance"],
      mealFamilies: ["quality_endurance", "long_endurance", "hybrid_support", "strength_support", "recovery", "balanced"],
      highCarb: true,
      travelFriendly: true,
      detailLabel: "Travel version",
      title: () => "Airport Grain Bowl",
      pickParts: (ctx, state, seed) => ({
        protein: pickFromPool({ poolName: "lunchProtein", pool: MAIN_PROTEIN_POOL.filter((item) => ["chicken_breast", "salmon", "shrimp", "tofu"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_protein`, usedSet: state.usedProteins }),
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["jasmine_rice", "quinoa", "wrap"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
      }),
      build: (_ctx, picks) => [
        picks.protein.label,
        picks.carb.label,
        "Greens + cut veg",
        "Sauce on the side",
      ],
      detailLine: () => "Protein first, carb second, sauce last. That order solves most airport choices.",
      why: () => "This is the simplest way to keep travel food from becoming random snack food.",
    },
    {
      id: "turkey_meatball_pita",
      cuisines: ["mediterranean", "middle_eastern", "general"],
      goalBiases: ["strength", "general", "body_comp"],
      mealFamilies: ["strength_support", "balanced", "recovery"],
      detailLabel: "Upgrade move",
      title: () => "Turkey Meatball Pita",
      pickParts: (ctx, state, seed) => ({
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["pita", "naan", "roti"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        produce: pickFromPool({ poolName: "bowlProduce", pool: BOWL_PRODUCE_POOL.filter((item) => ["cucumber_tomato_onion", "spinach_salad", "pickled_onions_cucumber"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_produce`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "lunchFinish", pool: LUNCH_FINISH_POOL.filter((item) => ["yogurt_dill", "tahini_lemon", "feta_tzatziki"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "Turkey meatballs",
        picks.carb.label,
        picks.produce.label,
        picks.finish.label,
      ],
      detailLine: () => "This keeps lunch feeling different from the bowl rotation without getting any more complicated.",
      why: () => "It is protein-heavy, affordable, and easy to batch without tasting like another chicken-rice reheating job.",
    },
    {
      id: "tofu_noodle_bowl",
      cuisines: ["asian", "general"],
      goalBiases: ["running", "hybrid_performance", "general"],
      mealFamilies: ["quality_endurance", "hybrid_support", "balanced", "recovery"],
      highCarb: true,
      detailLabel: "Make it better",
      title: () => "Tofu Noodle Bowl",
      pickParts: (ctx, state, seed) => ({
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["rice_noodles", "udon", "soba", "jasmine_rice"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        produce: pickFromPool({ poolName: "bowlProduce", pool: BOWL_PRODUCE_POOL.filter((item) => ["edamame_cabbage", "snap_peas_carrots", "broccoli_carrots", "cucumber_dill"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_produce`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "lunchFinish", pool: LUNCH_FINISH_POOL.filter((item) => ["sesame_soy", "soy_lime", "miso_ginger", "chili_crisp"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "Tofu",
        picks.carb.label,
        picks.produce.label,
        picks.finish.label,
      ],
      detailLine: () => "Crisp the tofu or buy it pre-baked. Texture matters a lot here.",
      why: () => "This opens up a real plant-protein lunch lane so the plan does not just bounce between poultry and salmon.",
    },
    {
      id: "tuna_white_bean_salad",
      cuisines: ["mediterranean", "general"],
      goalBiases: ["body_comp", "general", "strength"],
      mealFamilies: ["recovery", "balanced", "strength_support"],
      bodyCompFriendly: true,
      detailLabel: "Why this works",
      title: () => "Tuna + White Bean Salad",
      pickParts: (ctx, state, seed) => ({
        produce: pickFromPool({ poolName: "bowlProduce", pool: BOWL_PRODUCE_POOL.filter((item) => ["mixed_greens", "cucumber_tomato_onion", "pickled_onions_cucumber", "tomato_basil_salad"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_produce`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "lunchFinish", pool: LUNCH_FINISH_POOL.filter((item) => ["olive_lemon", "olive_herbs", "green_goddess", "balsamic_olive"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "Tuna",
        "White beans or chickpeas",
        picks.produce.label,
        picks.finish.label,
        "Bread or crackers on the side if needed",
      ],
      detailLine: () => "This is one of the best cheap lunches for high protein without another hot bowl.",
      why: () => "Useful when you want lunch to stay light, savory, and affordable without losing structure.",
    },
    {
      id: "chicken_pasta_salad",
      cuisines: ["italian", "general"],
      goalBiases: ["general", "running", "strength"],
      mealFamilies: ["balanced", "quality_endurance", "strength_support"],
      highCarb: true,
      detailLabel: "Execution tip",
      title: () => "Chicken Pasta Salad",
      pickParts: (ctx, state, seed) => ({
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["pasta", "orzo", "cavatappi", "lentil_pasta"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        produce: pickFromPool({ poolName: "bowlProduce", pool: BOWL_PRODUCE_POOL.filter((item) => ["tomato_basil_salad", "spinach_salad", "mixed_greens", "roasted_peppers_onions"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_produce`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "lunchFinish", pool: LUNCH_FINISH_POOL.filter((item) => ["pesto_parmesan", "sun_dried_tomato", "olive_herbs", "balsamic_olive"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "Chicken",
        picks.carb.label,
        picks.produce.label,
        picks.finish.label,
      ],
      detailLine: () => "This is best cold or room temp, which makes it one of the easiest meal-prep lunches in the library.",
      why: () => "Different texture, different flavor system, same strong protein-and-carb structure.",
    },
    {
      id: "lentil_power_bowl",
      cuisines: ["mediterranean", "middle_eastern", "general"],
      goalBiases: ["body_comp", "general", "hybrid_performance"],
      mealFamilies: ["recovery", "balanced", "hybrid_support"],
      bodyCompFriendly: true,
      detailLabel: "Why this matters",
      title: () => "Lentil Power Bowl",
      pickParts: (ctx, state, seed) => ({
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["quinoa", "farro", "roasted_potatoes", "brown_rice"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        produce: pickFromPool({ poolName: "bowlProduce", pool: BOWL_PRODUCE_POOL.filter((item) => ["kale_slaw", "cucumber_tomato_onion", "beets_arugula", "roasted_cauliflower"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_produce`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "lunchFinish", pool: LUNCH_FINISH_POOL.filter((item) => ["tahini_lemon", "hummus_sumac", "harissa_yogurt", "olive_lemon"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "Lentils",
        picks.carb.label,
        picks.produce.label,
        picks.finish.label,
      ],
      detailLine: () => "Do not treat this like the sad vegetarian option. Season it like a real lunch.",
      why: () => "This gives the engine a value-smart, fiber-heavy lunch that still looks intentional.",
    },
    {
      id: "value_protein_plate",
      cuisines: ["general", "american_grill", "mediterranean"],
      goalBiases: ["general", "strength", "body_comp"],
      mealFamilies: ["balanced", "recovery", "strength_support"],
      bodyCompFriendly: true,
      detailLabel: "Budget-smart move",
      title: (picks) => `${picks.protein.short} Lunch Plate`,
      pickParts: (ctx, state, seed) => ({
        protein: pickFromPool({ poolName: "lunchProtein", pool: MAIN_PROTEIN_POOL.filter((item) => ["chicken_thigh", "lean_ground_turkey", "tuna", "lentils", "black_beans", "chickpeas"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_protein`, usedSet: state.usedProteins }),
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["roasted_potatoes", "brown_rice", "jasmine_rice", "pita"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        produce: pickFromPool({ poolName: "bowlProduce", pool: BOWL_PRODUCE_POOL.filter((item) => ["mixed_greens", "cabbage_cilantro", "cucumber_tomato_onion", "carrot_ribbon_salad"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_produce`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "lunchFinish", pool: LUNCH_FINISH_POOL.filter((item) => ["olive_lemon", "lime_cilantro", "chipotle_yogurt", "yogurt_dill"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [picks.protein.label, picks.carb.label, picks.produce.label, picks.finish.label],
      detailLine: () => "This is the anti-$30 lunch. Strong protein, real carbs, and no premium-ingredient tax.",
      why: () => "Some users need the plan to feel financially repeatable, not just nutritionally sound.",
    },
  ],
  dinner: [
    {
      id: "ground_beef_plate",
      cuisines: ["american_grill", "mexican", "general"],
      goalBiases: ["strength", "hybrid_performance", "general"],
      mealFamilies: ["strength_support", "balanced", "hybrid_support"],
      detailLabel: "Execution tip",
      title: () => "Ground Beef + Potatoes + Broccoli",
      pickParts: (ctx, state, seed) => ({
        protein: pickFromPool({ poolName: "dinnerProtein", pool: MAIN_PROTEIN_POOL.filter((item) => ["lean_ground_beef", "lean_ground_turkey"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_protein`, usedSet: state.usedProteins }),
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["roasted_potatoes", "sweet_potato", "jasmine_rice"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        veg: pickFromPool({ poolName: "dinnerVeg", pool: DINNER_VEG_POOL.filter((item) => ["broccoli", "green_beans", "mixed_veg"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_veg`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "dinnerFinish", pool: DINNER_FINISH_POOL.filter((item) => ["garlic_chili_cumin", "paprika_oil", "chipotle_lime"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [picks.protein.label, picks.carb.label, picks.veg.label],
      detailLine: (_ctx, picks) => `Cook the protein with ${picks.finish.label.toLowerCase()}. Finish the starch the same way so the whole plate tastes finished.`,
      why: (ctx) => ctx.hardSession
        ? "Heavier and satisfying, which is exactly what you want after a demanding session."
        : "This is a strong default dinner because it closes the day without inviting late-night snacking.",
    },
    {
      id: "salmon_plate",
      cuisines: ["mediterranean", "asian", "general"],
      goalBiases: ["running", "body_comp", "general"],
      mealFamilies: ["quality_endurance", "long_endurance", "recovery", "balanced"],
      highCarb: true,
      bodyCompFriendly: true,
      detailLabel: "Upgrade move",
      title: (picks) => `${picks.protein.short} + ${picks.carb.short} + ${picks.veg.short}`,
      pickParts: (ctx, state, seed) => ({
        protein: pickFromPool({ poolName: "dinnerProtein", pool: MAIN_PROTEIN_POOL.filter((item) => ["salmon", "shrimp", "chicken_breast"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_protein`, usedSet: state.usedProteins }),
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["jasmine_rice", "basmati_rice", "sweet_potato", "roasted_potatoes"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        veg: pickFromPool({ poolName: "dinnerVeg", pool: DINNER_VEG_POOL.filter((item) => ["asparagus", "broccoli", "spinach", "salad"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_veg`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "dinnerFinish", pool: DINNER_FINISH_POOL.filter((item) => ["oregano_lemon", "ginger_soy", "pesto_parm"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [picks.protein.label, picks.carb.label, picks.veg.label],
      detailLine: (_ctx, picks) => `Finish it with ${picks.finish.label.toLowerCase()} so the plate feels deliberate instead of plain diet food.`,
      why: (ctx) => ctx.recoverySession
        ? "This is clean, satisfying recovery food without much decision fatigue."
        : "Protein stays high, the carb is visible, and the meal still feels light enough to digest well.",
    },
    {
      id: "shawarma_dinner",
      cuisines: ["middle_eastern", "mediterranean", "general"],
      goalBiases: ["strength", "general"],
      mealFamilies: ["strength_support", "hybrid_support", "balanced"],
      detailLabel: "Execution tip",
      title: (picks) => `${picks.protein.short} Shawarma Plate`,
      pickParts: (ctx, state, seed) => ({
        protein: pickFromPool({ poolName: "dinnerProtein", pool: MAIN_PROTEIN_POOL.filter((item) => ["chicken_breast", "pork_tenderloin", "lean_ground_turkey"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_protein`, usedSet: state.usedProteins }),
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["jasmine_rice", "pita", "roasted_potatoes"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        veg: pickFromPool({ poolName: "dinnerVeg", pool: DINNER_VEG_POOL.filter((item) => ["salad", "roasted_zucchini", "spinach"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_veg`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "dinnerFinish", pool: DINNER_FINISH_POOL.filter((item) => ["shawarma_spice", "oregano_lemon"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [picks.protein.label, picks.carb.label, picks.veg.label],
      detailLine: (_ctx, picks) => `Use ${picks.finish.label.toLowerCase()} and actually salt the starch. That is the difference between solid and forgettable.`,
      why: () => "This keeps dinner satisfying enough that the day still feels easy to repeat tomorrow.",
    },
    {
      id: "stir_fry_plate",
      cuisines: ["asian", "general"],
      goalBiases: ["running", "hybrid_performance", "general"],
      mealFamilies: ["quality_endurance", "long_endurance", "hybrid_support", "balanced"],
      highCarb: true,
      detailLabel: "Make it better",
      title: (picks) => `${picks.protein.short} Stir-Fry`,
      pickParts: (ctx, state, seed) => ({
        protein: pickFromPool({ poolName: "dinnerProtein", pool: MAIN_PROTEIN_POOL.filter((item) => ["shrimp", "chicken_breast", "salmon", "tofu"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_protein`, usedSet: state.usedProteins }),
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["jasmine_rice", "rice_noodles", "basmati_rice"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        veg: pickFromPool({ poolName: "dinnerVeg", pool: DINNER_VEG_POOL.filter((item) => ["broccoli", "green_beans", "mixed_veg", "cauliflower"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_veg`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "dinnerFinish", pool: DINNER_FINISH_POOL.filter((item) => ["ginger_soy", "chili_crisp"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [picks.protein.label, picks.carb.label, picks.veg.label],
      detailLine: (_ctx, picks) => `Keep the wok sauce to ${picks.finish.label.toLowerCase()} and do not drown the bowl in oil.`,
      why: () => "This is a fast recovery dinner when you want carbs present but do not want a heavy meal.",
    },
    {
      id: "pasta_recovery_dinner",
      cuisines: ["italian", "general"],
      goalBiases: ["running", "strength", "general"],
      mealFamilies: ["quality_endurance", "long_endurance", "strength_support", "balanced"],
      highCarb: true,
      detailLabel: "Execution tip",
      title: (picks) => `${picks.protein.short} Pasta Bowl`,
      pickParts: (ctx, state, seed) => ({
        protein: pickFromPool({ poolName: "dinnerProtein", pool: MAIN_PROTEIN_POOL.filter((item) => ["turkey_meatballs", "chicken_breast", "shrimp"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_protein`, usedSet: state.usedProteins }),
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["pasta", "farro"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        veg: pickFromPool({ poolName: "dinnerVeg", pool: DINNER_VEG_POOL.filter((item) => ["spinach", "roasted_zucchini", "salad"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_veg`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "dinnerFinish", pool: DINNER_FINISH_POOL.filter((item) => ["pesto_parm", "black_pepper_butter", "oregano_lemon"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [picks.protein.label, picks.carb.label, picks.veg.label],
      detailLine: (_ctx, picks) => `Use ${picks.finish.label.toLowerCase()} to finish it. A little flavor goes a long way here.`,
      why: () => "This works especially well when you need a carb-visible dinner that still feels like an actual meal.",
    },
    {
      id: "hotel_grill_plate",
      cuisines: ["general"],
      goalBiases: ["general", "running", "strength", "body_comp", "hybrid_performance"],
      mealFamilies: ["quality_endurance", "long_endurance", "hybrid_support", "strength_support", "recovery", "balanced"],
      travelFriendly: true,
      detailLabel: "Travel version",
      title: () => "Hotel Grill Plate",
      pickParts: (ctx, state, seed) => ({
        protein: pickFromPool({ poolName: "dinnerProtein", pool: MAIN_PROTEIN_POOL.filter((item) => ["chicken_breast", "salmon", "sirloin"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_protein`, usedSet: state.usedProteins }),
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["jasmine_rice", "roasted_potatoes", "sweet_potato"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
      }),
      build: (_ctx, picks) => [picks.protein.label, picks.carb.label, "Vegetables"],
      detailLine: () => "Sauce on the side. Double vegetables only if the carb side is still visible.",
      why: () => "Travel dinners should solve the problem quickly, not tempt you into a random room-service spiral.",
    },
    {
      id: "turkey_meatball_marinara",
      cuisines: ["italian", "general"],
      goalBiases: ["strength", "general", "running"],
      mealFamilies: ["strength_support", "quality_endurance", "balanced"],
      highCarb: true,
      detailLabel: "Execution tip",
      title: () => "Turkey Meatball Marinara Bowl",
      pickParts: (ctx, state, seed) => ({
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["pasta", "orzo", "lentil_pasta", "roasted_potatoes"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        veg: pickFromPool({ poolName: "dinnerVeg", pool: DINNER_VEG_POOL.filter((item) => ["spinach", "mushrooms", "broccolini", "salad"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_veg`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "dinnerFinish", pool: DINNER_FINISH_POOL.filter((item) => ["pesto_parm", "garlic_parm", "garlic_herb"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "Turkey meatballs",
        picks.carb.label,
        picks.veg.label,
        picks.finish.label,
      ],
      detailLine: () => "Batch the meatballs once and this becomes one of the easiest high-protein dinners in the whole rotation.",
      why: () => "This gives you an Italian-leaning recovery dinner without defaulting to steak or salmon.",
    },
    {
      id: "shrimp_taco_plate",
      cuisines: ["mexican", "general"],
      goalBiases: ["running", "hybrid_performance", "general"],
      mealFamilies: ["quality_endurance", "hybrid_support", "balanced"],
      highCarb: true,
      detailLabel: "Make it better",
      title: () => "Shrimp Taco Plate",
      pickParts: (ctx, state, seed) => ({
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["jasmine_rice", "roasted_potatoes", "plantains", "brown_rice"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        veg: pickFromPool({ poolName: "dinnerVeg", pool: DINNER_VEG_POOL.filter((item) => ["cabbage", "peppers_onions", "salad", "broccolini"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_veg`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "dinnerFinish", pool: DINNER_FINISH_POOL.filter((item) => ["chipotle_lime", "taco_spice", "smoky_paprika"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "Shrimp",
        "Corn tortillas",
        picks.carb.label,
        picks.veg.label,
        picks.finish.label,
      ],
      detailLine: () => "Keep it taco-plate style on weeknights so it stays fast instead of turning into a full assembly project.",
      why: () => "This opens up another high-protein, carb-visible dinner that does not look like the same bowl in disguise.",
    },
    {
      id: "tofu_curry_bowl",
      cuisines: ["asian", "general"],
      goalBiases: ["general", "body_comp", "hybrid_performance"],
      mealFamilies: ["balanced", "recovery", "hybrid_support"],
      detailLabel: "Why this works",
      title: () => "Tofu Curry Bowl",
      pickParts: (ctx, state, seed) => ({
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["basmati_rice", "jasmine_rice", "naan", "roti"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        veg: pickFromPool({ poolName: "dinnerVeg", pool: DINNER_VEG_POOL.filter((item) => ["cauliflower", "bok_choy", "green_beans", "spinach"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_veg`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "dinnerFinish", pool: DINNER_FINISH_POOL.filter((item) => ["curry_yogurt", "harissa_lemon", "garlic_herb"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "Tofu",
        picks.carb.label,
        picks.veg.label,
        picks.finish.label,
      ],
      detailLine: () => "A little coconut or yogurt-based curry flavor goes a long way here. It should taste warm and deliberate.",
      why: () => "This creates a real plant-forward dinner lane so variety is structural, not cosmetic.",
    },
    {
      id: "pork_tenderloin_plate",
      cuisines: ["american_grill", "mediterranean", "general"],
      goalBiases: ["strength", "general", "body_comp"],
      mealFamilies: ["strength_support", "balanced", "recovery"],
      detailLabel: "Execution tip",
      title: () => "Pork Tenderloin Plate",
      pickParts: (ctx, state, seed) => ({
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["baby_potatoes", "roasted_potatoes", "farro", "polenta"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        veg: pickFromPool({ poolName: "dinnerVeg", pool: DINNER_VEG_POOL.filter((item) => ["green_beans", "carrots", "fennel", "salad"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_veg`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "dinnerFinish", pool: DINNER_FINISH_POOL.filter((item) => ["mustard_honey", "balsamic_rosemary", "zaatar_oil", "garlic_herb"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "Pork tenderloin",
        picks.carb.label,
        picks.veg.label,
        picks.finish.label,
      ],
      detailLine: () => "This is one of the easiest ways to add another lean dinner protein without the price creep of steak every week.",
      why: () => "A premium-feeling dinner does not always need premium-protein pricing.",
    },
    {
      id: "lentil_bolognese_bowl",
      cuisines: ["italian", "general"],
      goalBiases: ["body_comp", "general", "running"],
      mealFamilies: ["balanced", "recovery", "quality_endurance"],
      bodyCompFriendly: true,
      detailLabel: "Budget-smart move",
      title: () => "Lentil Bolognese Bowl",
      pickParts: (ctx, state, seed) => ({
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["pasta", "lentil_pasta", "polenta", "cavatappi"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        veg: pickFromPool({ poolName: "dinnerVeg", pool: DINNER_VEG_POOL.filter((item) => ["spinach", "mushrooms", "salad", "roasted_zucchini"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_veg`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "dinnerFinish", pool: DINNER_FINISH_POOL.filter((item) => ["pesto_parm", "garlic_parm", "smoky_paprika"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [
        "Lentils or lentil bolognese",
        picks.carb.label,
        picks.veg.label,
        picks.finish.label,
      ],
      detailLine: () => "This keeps the dinner rotation cheaper and fiber-heavier without feeling like a compromise meal.",
      why: () => "A premium app should still know how to build good lower-cost dinners, not just more salmon and steak.",
    },
    {
      id: "white_fish_weeknight_plate",
      cuisines: ["mediterranean", "american_grill", "general"],
      goalBiases: ["running", "general", "body_comp"],
      mealFamilies: ["quality_endurance", "recovery", "balanced"],
      highCarb: true,
      bodyCompFriendly: true,
      detailLabel: "Make it better",
      title: () => "White Fish Weeknight Plate",
      pickParts: (ctx, state, seed) => ({
        protein: pickFromPool({ poolName: "dinnerProtein", pool: MAIN_PROTEIN_POOL.filter((item) => ["cod", "tilapia", "mahi_mahi", "trout"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_protein`, usedSet: state.usedProteins }),
        carb: pickFromPool({ poolName: "bowlCarb", pool: BOWL_CARB_POOL.filter((item) => ["jasmine_rice", "baby_potatoes", "sweet_potato", "couscous"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_carb`, usedSet: state.usedCarbs }),
        veg: pickFromPool({ poolName: "dinnerVeg", pool: DINNER_VEG_POOL.filter((item) => ["asparagus", "broccolini", "spinach", "okra"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_veg`, usedSet: state.usedProduce }),
        finish: pickFromPool({ poolName: "dinnerFinish", pool: DINNER_FINISH_POOL.filter((item) => ["oregano_lemon", "cajun_rub", "blackened_spice", "garlic_herb"].includes(item.id)), cuisineKey: ctx.cuisineKey, state, seed: `${seed}_finish`, usedSet: state.usedFinishes }),
      }),
      build: (_ctx, picks) => [picks.protein.label, picks.carb.label, picks.veg.label, picks.finish.label],
      detailLine: () => "Use frozen white fish if needed. The goal is to make weeknight variety realistic, not precious.",
      why: () => "This adds another fast protein lane that is lighter than beef and usually cheaper than salmon.",
    },
  ],
});

const POOL_BY_NAME = Object.freeze({
  savoryVeg: SAVORY_VEG_POOL,
  breakfastTopping: BREAKFAST_TOPPING_POOL,
  breakfastCarb: BREAKFAST_STARCH_POOL,
  breakfastFruit: BREAKFAST_FRUIT_POOL,
  lunchProtein: MAIN_PROTEIN_POOL,
  dinnerProtein: MAIN_PROTEIN_POOL,
  bowlCarb: BOWL_CARB_POOL,
  bowlProduce: BOWL_PRODUCE_POOL,
  lunchFinish: LUNCH_FINISH_POOL,
  dinnerVeg: DINNER_VEG_POOL,
  dinnerFinish: DINNER_FINISH_POOL,
});

const orderPoolByCuisine = (poolName = "", pool = [], cuisineKey = "") => {
  const preferredIds = CUISINE_POOL_PREFERENCES?.[cuisineKey]?.[poolName] || [];
  if (!preferredIds.length) return [...pool];
  const byId = new Map(pool.map((item) => [item.id, item]));
  const preferred = preferredIds.map((id) => byId.get(id)).filter(Boolean);
  const remainder = pool.filter((item) => !preferredIds.includes(item.id));
  return [...preferred, ...remainder];
};

function pickFromPool({
  poolName = "",
  pool = [],
  cuisineKey = "",
  state = null,
  seed = "",
  usedSet = null,
} = {}) {
  const ctx = state?.ctx || {};
  const orderedPool = orderPoolByCuisine(poolName, pool, cuisineKey);
  const scoredPool = orderedPool
    .map((item) => ({
      item,
      score: getAffordabilityChoiceScore(item, ctx, poolName),
    }))
    .sort((left, right) => right.score - left.score || left.item.id.localeCompare(right.item.id));
  const topScore = scoredPool[0]?.score ?? 0;
  const affordabilityPool = scoredPool
    .filter((entry) => entry.score >= topScore - 1)
    .map((entry) => entry.item);
  const valueAwarePool = affordabilityPool.length ? affordabilityPool : orderedPool;
  const available = valueAwarePool.filter((item) => !(usedSet instanceof Set) || !usedSet.has(item.family));
  const finalPool = available.length ? available : valueAwarePool;
  const choice = finalPool[hashString(seed) % Math.max(1, finalPool.length)] || valueAwarePool[0] || null;
  if (choice && usedSet instanceof Set) usedSet.add(choice.family);
  return choice;
}

const scorePattern = (pattern = {}, ctx = {}) => {
  let score = 0;
  const patternId = sanitizeText(pattern?.id || "").toLowerCase();
  if (pattern.travelFriendly && ctx.travelMode) score += 7;
  if (pattern.travelFriendly && !ctx.travelMode) score -= 2;
  if (Array.isArray(pattern.mealFamilies) && pattern.mealFamilies.includes(ctx.mealFamily)) score += 5;
  if (Array.isArray(pattern.cuisines) && pattern.cuisines.includes(ctx.cuisineKey)) score += 4;
  if (Array.isArray(pattern.goalBiases) && pattern.goalBiases.includes(ctx.goalBias)) score += 2;
  if (ctx.hardSession && pattern.highCarb) score += 2;
  if (ctx.bodyCompBias && pattern.bodyCompFriendly) score += 2;
  if (ctx.recoverySession && Array.isArray(pattern.mealFamilies) && pattern.mealFamilies.includes("recovery")) score += 2;
  if (ctx.likedPatternKeys instanceof Set && ctx.likedPatternKeys.has(patternId)) score += 6;
  if (ctx.dislikedPatternKeys instanceof Set && ctx.dislikedPatternKeys.has(patternId)) score -= 8;
  return score;
};

const choosePattern = (slotKey = "", ctx = {}, slotOverride = null) => {
  const patterns = PATTERN_LIBRARY[slotKey] || [];
  const forcedPatternId = sanitizeText(slotOverride?.patternId || "").toLowerCase();
  if (forcedPatternId) {
    const forcedPattern = patterns.find((pattern) => sanitizeText(pattern?.id || "").toLowerCase() === forcedPatternId);
    if (forcedPattern) return forcedPattern;
  }
  const nonDislikedPatterns = patterns.filter((pattern) => !ctx.dislikedPatternKeys?.has(sanitizeText(pattern?.id || "").toLowerCase()));
  const sourcePatterns = nonDislikedPatterns.length ? nonDislikedPatterns : patterns;
  const scored = sourcePatterns
    .map((pattern) => ({ pattern, score: scorePattern(pattern, ctx) }))
    .sort((left, right) => right.score - left.score || left.pattern.id.localeCompare(right.pattern.id));
  const topScore = scored[0]?.score ?? 0;
  const candidatePatterns = scored
    .filter((entry) => entry.score >= topScore - 1)
    .map((entry) => entry.pattern);
  const finalPatterns = candidatePatterns.length ? candidatePatterns : sourcePatterns;
  const slotSeed = buildSlotSeed(ctx, slotKey, slotOverride);
  return finalPatterns[hashString(`${slotSeed}_pattern`) % Math.max(1, finalPatterns.length)] || sourcePatterns[0] || patterns[0] || null;
};

const buildSavedAnchorSection = (slotKey = "", anchorText = "", ctx = {}) => {
  const label = slotKey === "snack" ? "Snacks" : titleCase(slotKey);
  const buildItems = splitAnchorIntoItems(anchorText);
  const support = buildSectionSupport(slotKey, ctx, buildItems.length ? buildItems : [anchorText]);
  return {
    key: slotKey,
    slotKey,
    label,
    title: sanitizeText(anchorText) || `${label} anchor`,
    buildHeading: "Build",
    buildItems: buildItems.length ? buildItems : [sanitizeText(anchorText)],
    targetLine: buildSectionTargetLine(slotKey, ctx),
    detailLabel: "Saved anchor",
    detailLine: slotKey === "breakfast"
      ? "Use the meal you already repeat well. The win is consistency, not novelty."
      : "This is already one of your repeatable defaults. Keep the portions honest and move on.",
    why: ctx.bodyCompBias
      ? "Reliable meals beat perfectly optimized meals you never actually eat."
      : "A repeatable anchor is valuable because it removes one more decision from the day.",
    preferenceKey: `anchor_${slotKey}`,
    sourceType: "anchor",
    overrideApplied: false,
    seedOffset: 0,
    recipeSteps: buildRecipeSteps(slotKey, buildItems.length ? buildItems : [anchorText], ctx),
    improvementTips: buildImprovementTips(slotKey, ctx),
    ...support,
  };
};

const buildPatternSection = (slotKey = "", ctx = {}, state = {}, slotOverride = null) => {
  const pattern = choosePattern(slotKey, ctx, slotOverride);
  if (!pattern) return null;
  const slotSeed = buildSlotSeed(ctx, slotKey, slotOverride);
  const picks = pattern.pickParts ? pattern.pickParts(ctx, state, slotSeed) : {};
  const buildItems = dedupeList(typeof pattern.build === "function" ? pattern.build(ctx, picks) : []);
  const support = buildSectionSupport(slotKey, ctx, buildItems);
  return {
    key: slotKey,
    slotKey,
    label: slotKey === "snack" ? "Snacks" : titleCase(slotKey),
    title: typeof pattern.title === "function" ? sanitizeText(pattern.title(picks, ctx)) : sanitizeText(pattern.title),
    buildHeading: "Build",
    buildItems,
    targetLine: buildSectionTargetLine(slotKey, ctx),
    detailLabel: pattern.detailLabel || "Execution note",
    detailLine: sanitizeText(typeof pattern.detailLine === "function" ? pattern.detailLine(ctx, picks) : pattern.detailLine),
    why: sanitizeText(typeof pattern.why === "function" ? pattern.why(ctx, picks) : pattern.why),
    preferenceKey: pattern.id,
    sourceType: "pattern",
    overrideApplied: shouldUsePatternOverride(slotOverride),
    seedOffset: Math.max(0, Math.round(Number(slotOverride?.seedOffset || 0))),
    recipeSteps: buildRecipeSteps(slotKey, buildItems, ctx),
    improvementTips: buildImprovementTips(slotKey, ctx),
    ...support,
  };
};

const chooseSnackOptions = (ctx = {}, slotOverride = null) => {
  const tagBias = ctx.travelMode
    ? "travel"
    : ctx.hardSession
    ? "hard"
    : ctx.hybridSession
    ? "hybrid"
    : ctx.strengthSession
    ? "strength"
    : ctx.bodyCompBias
    ? "body_comp"
    : ctx.recoverySession
    ? "recovery"
    : "general";
  const filtered = SNACK_BACKFILL_POOL.filter((option) => option.tags.includes(tagBias));
  const pool = filtered.length ? filtered : SNACK_BACKFILL_POOL;
  const selections = [];
  const usedFamilies = new Set();
  const slotSeed = buildSlotSeed(ctx, "snack", slotOverride);
  for (let index = 0; index < 4; index += 1) {
    const available = pool.filter((option) => !usedFamilies.has(option.family));
    const finalPool = available.length ? available : pool;
    const choice = finalPool[hashString(`${slotSeed}_snack_${index}`) % finalPool.length];
    if (choice && !selections.some((option) => option.id === choice.id)) {
      selections.push(choice);
      usedFamilies.add(choice.family);
    }
  }
  return selections.slice(0, 4);
};

const buildSnackSection = (ctx = {}, slotOverride = null) => {
  const options = chooseSnackOptions(ctx, slotOverride);
  const buildItems = options.map((option) => option.label);
  const support = buildSectionSupport("snack", ctx, buildItems);
  return {
    key: "snack",
    slotKey: "snack",
    label: "Snacks",
    title: "Protein Backfill",
    buildHeading: "Pick 2",
    buildItems,
    targetLine: buildSectionTargetLine("snack", ctx),
    detailLabel: "If protein is light at night",
    detailLine: ctx.bodyCompBias
      ? "Use the shake before bed instead of grazing."
      : "A shake before bed beats trying to cram another full meal into the night.",
    why: `This is the easiest way to guarantee protein without letting the last meal sprawl.`,
    preferenceKey: "protein_backfill",
    sourceType: "pattern",
    overrideApplied: shouldUsePatternOverride(slotOverride),
    seedOffset: Math.max(0, Math.round(Number(slotOverride?.seedOffset || 0))),
    recipeSteps: buildRecipeSteps("snack", buildItems, ctx),
    improvementTips: buildImprovementTips("snack", ctx),
    ...support,
  };
};

const buildMacroTargetRows = (targets = {}) => ([
  formatRange("Calories", Number(targets?.cal || 2300), 100, "kcal", { floor: 1600 }),
  formatRange("Protein", Number(targets?.p || 190), 10, "g", { floor: 120, mustHit: true }),
  formatRange("Carbs", Number(targets?.c || 220), 20, "g", { floor: 80 }),
  formatRange("Fat", Number(targets?.f || 70), 10, "g", { floor: 35 }),
]);

const buildFocusLine = (ctx = {}) => {
  if (ctx.hybridSession) return "Carbs where the work is, protein across the whole day.";
  if (ctx.hardSession) return "Carb support, protein backfill, and easy decisions.";
  if (ctx.strengthSession) return "High protein, steady carbs, and a real recovery dinner.";
  if (ctx.recoverySession) return "High protein, simple meals, and appetite control.";
  if (ctx.bodyCompBias) return "High protein, satisfying meals, and tighter extras.";
  return "Balanced meals, stable energy, and low-friction execution.";
};

const buildWhyLine = (ctx = {}) => {
  const sessionLabel = sanitizeText(ctx.workoutLabel || ctx.dayTypeLabel || "today's work").toLowerCase();
  if (ctx.offTrackSignal) return `The day already drifted a bit, so the plan keeps the next meals simple and protein-forward instead of chasing perfection.`;
  if (ctx.missedProteinSignal) return `Protein looks light so far, so the rest of the day biases easy protein backfill without making dinner huge.`;
  if (ctx.hungerSignal) return `Hunger is running hot, so the meals stay bigger on volume and cleaner on choices.`;
  if (ctx.hybridSession) return `${titleCase(sessionLabel)} needs both steady carbs and real protein support, so neither side of the day gets underfed.`;
  if (ctx.hardSession) return `${titleCase(sessionLabel)} is the performance lever today, so carbs need to show up before and after it.`;
  if (ctx.strengthSession) return `${titleCase(sessionLabel)} is the money work today, so protein stays high and carbs stay close to the lift.`;
  if (ctx.recoverySession) return `Recovery is the job today, so meals stay simple, protein-forward, and easy to repeat.`;
  return `Today's meals are built to support the work without turning the day into a macro puzzle.`;
};

const buildContext = ({
  dateKey = "",
  dayType = "",
  mealFamily = "",
  goalBias = "general",
  workoutLabel = "",
  preferredCuisines = [],
  targets = {},
  travelMode = false,
  missedProteinSignal = false,
  hungerSignal = false,
  offTrackSignal = false,
  likedMealPatterns = {},
  dislikedMealPatterns = {},
  mealPatternFeedback = {},
  favoriteGroceries = [],
  favoriteRestaurants = [],
  safeMeals = [],
  mealAnchorSignals = [],
  slotOverrides = {},
} = {}) => {
  const normalizedDayType = normalizeNutritionDayType(dayType);
  const primaryCuisine = sanitizeText(preferredCuisines?.[0] || "").toLowerCase() || "general";
  const patternFeedback = normalizeMealPatternFeedback({
    likedMealPatterns,
    dislikedMealPatterns,
    mealPatternFeedback,
  });
  const affordabilityProfile = inferAffordabilityProfile({
    grocerySignals: favoriteGroceries,
    restaurantSignals: favoriteRestaurants,
    safeMealSignals: safeMeals,
    mealAnchorSignals,
  });
  return {
    seed: `${dateKey || "undated"}_${normalizedDayType}_${goalBias}_${primaryCuisine}_${sanitizeText(workoutLabel)}`,
    dateKey,
    dayType: normalizedDayType,
    dayTypeLabel: getNutritionDayTypeLabel(normalizedDayType),
    mealFamily,
    goalBias,
    workoutLabel,
    cuisineKey: primaryCuisine,
    hardSession: isHardNutritionDayType(normalizedDayType),
    hybridSession: isHybridNutritionDayType(normalizedDayType),
    strengthSession: isStrengthNutritionDayType(normalizedDayType),
    recoverySession: isRecoveryNutritionDayType(normalizedDayType),
    bodyCompBias: goalBias === "body_comp" || goalBias === "body_comp_strength",
    targets,
    travelMode,
    missedProteinSignal,
    hungerSignal,
    offTrackSignal,
    likedPatternKeys: patternFeedback.likedPatternKeys,
    dislikedPatternKeys: patternFeedback.dislikedPatternKeys,
    mealPatternVoteMap: patternFeedback.voteMap,
    slotOverrides: normalizeSlotOverrides(slotOverrides),
    affordabilityProfile,
  };
};

const buildCatalogStats = () => {
  const ingredientCount = [
    ...BREAKFAST_STARCH_POOL,
    ...BREAKFAST_FRUIT_POOL,
    ...SAVORY_VEG_POOL,
    ...BREAKFAST_TOPPING_POOL,
    ...MAIN_PROTEIN_POOL,
    ...BOWL_CARB_POOL,
    ...BOWL_PRODUCE_POOL,
    ...DINNER_VEG_POOL,
    ...LUNCH_FINISH_POOL,
    ...DINNER_FINISH_POOL,
  ].length + SNACK_BACKFILL_POOL.length;

  const estimatedBreakfastVariants = (SAVORY_VEG_POOL.length * BREAKFAST_TOPPING_POOL.length * BREAKFAST_STARCH_POOL.length)
    + (BREAKFAST_FRUIT_POOL.length * BREAKFAST_STARCH_POOL.length * 4)
    + (BREAKFAST_FRUIT_POOL.length * 4)
    + (BREAKFAST_FRUIT_POOL.length * 4)
    + BREAKFAST_FRUIT_POOL.length;
  const estimatedLunchVariants = 5
    * (MAIN_PROTEIN_POOL.length * BOWL_CARB_POOL.length * BOWL_PRODUCE_POOL.length * LUNCH_FINISH_POOL.length);
  const estimatedDinnerVariants = 5
    * (MAIN_PROTEIN_POOL.length * BOWL_CARB_POOL.length * DINNER_VEG_POOL.length * DINNER_FINISH_POOL.length);
  const snackSingleVariants = SNACK_BACKFILL_POOL.length;
  const snackPairVariants = chooseCount(SNACK_BACKFILL_POOL.length, 2);
  const estimatedSnackVariants = snackSingleVariants + snackPairVariants;

  return Object.freeze({
    uniqueIngredientCount: ingredientCount,
    estimatedMealVariants: estimatedBreakfastVariants + estimatedLunchVariants + estimatedDinnerVariants + estimatedSnackVariants,
    recipeCountBySlot: Object.freeze({
      breakfast: estimatedBreakfastVariants,
      lunch: estimatedLunchVariants,
      dinner: estimatedDinnerVariants,
      snack: estimatedSnackVariants,
    }),
    patternCountBySlot: Object.freeze({
      breakfast: PATTERN_LIBRARY.breakfast.length,
      lunch: PATTERN_LIBRARY.lunch.length,
      dinner: PATTERN_LIBRARY.dinner.length,
      snack: SNACK_BACKFILL_POOL.length,
    }),
  });
};

export const NUTRITION_EXECUTION_CATALOG_STATS = buildCatalogStats();

export const buildNutritionExecutionPlan = ({
  dateKey = "",
  dayType = "",
  mealFamily = "",
  goalBias = "general",
  workoutLabel = "",
  preferredCuisines = [],
  savedMealAnchors = {},
  targets = {},
  travelMode = false,
  missedProteinSignal = false,
  hungerSignal = false,
  offTrackSignal = false,
  likedMealPatterns = {},
  dislikedMealPatterns = {},
  mealPatternFeedback = {},
  favoriteGroceries = [],
  favoriteRestaurants = [],
  safeMeals = [],
  mealAnchorSignals = [],
  slotOverrides = {},
} = {}) => {
  const ctx = buildContext({
    dateKey,
    dayType,
    mealFamily,
    goalBias,
    workoutLabel,
    preferredCuisines,
    targets,
    travelMode,
    missedProteinSignal,
    hungerSignal,
    offTrackSignal,
    likedMealPatterns,
    dislikedMealPatterns,
    mealPatternFeedback,
    favoriteGroceries,
    favoriteRestaurants,
    safeMeals,
    mealAnchorSignals,
    slotOverrides,
  });
  const state = {
    ctx,
    usedProteins: new Set(),
    usedCarbs: new Set(),
    usedProduce: new Set(),
    usedFinishes: new Set(),
  };
  const breakfastAnchor = sanitizeText(savedMealAnchors?.breakfast || "");
  const lunchAnchor = sanitizeText(savedMealAnchors?.lunch || "");
  const breakfastOverride = ctx.slotOverrides?.breakfast || null;
  const lunchOverride = ctx.slotOverrides?.lunch || null;
  const dinnerOverride = ctx.slotOverrides?.dinner || null;
  const snackOverride = ctx.slotOverrides?.snack || null;
  const breakfastSection = breakfastAnchor && !shouldUsePatternOverride(breakfastOverride)
    ? buildSavedAnchorSection("breakfast", breakfastAnchor, ctx)
    : buildPatternSection("breakfast", ctx, state, breakfastOverride);
  const lunchSection = lunchAnchor && !shouldUsePatternOverride(lunchOverride)
    ? buildSavedAnchorSection("lunch", lunchAnchor, ctx)
    : buildPatternSection("lunch", ctx, state, lunchOverride);
  const dinnerSection = buildPatternSection("dinner", ctx, state, dinnerOverride);
  const snackSection = buildSnackSection(ctx, snackOverride);
  const sections = [breakfastSection, lunchSection, dinnerSection, snackSection].filter(Boolean);

  return {
    title: `${buildDayLabel(dateKey)} — Nutrition Plan`,
    focusLine: buildFocusLine(ctx),
    whyLine: buildWhyLine(ctx),
    objectiveItems: buildObjectiveItems(ctx),
    macroTargets: buildMacroTargetRows(targets),
    executionRules: buildExecutionRules(ctx),
    sections,
    catalogStats: NUTRITION_EXECUTION_CATALOG_STATS,
    rotationKey: ctx.seed,
    affordabilityProfileKey: ctx.affordabilityProfile,
  };
};
