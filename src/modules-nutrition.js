import {
 buildNutritionDayTargetsMap,
 getNutritionDayTypeLabel,
 isBaseEnduranceNutritionDayType,
 isConditioningNutritionDayType,
 isEnduranceNutritionDayType,
 isHardNutritionDayType,
 isHybridNutritionDayType,
 isLongEnduranceNutritionDayType,
 isRecoveryNutritionDayType,
 isStrengthNutritionDayType,
 normalizeNutritionDayType,
 NUTRITION_DAY_TYPES,
 resolveWorkoutNutritionDayType,
} from "./services/nutrition-day-taxonomy-service.js";
import { buildNutritionExecutionPlan } from "./services/nutrition-execution-plan-service.js";

export const NUTRITION = Object.freeze(buildNutritionDayTargetsMap());

export const MEAL_PLANS = {
 home: {
 longRun: [
 { meal: "Pre-run (1hr before)", foods: ["1 cup oats + banana + honey", "Black coffee"], cal: 380, p: 12, c: 78, f: 4 },
 { meal: "Post-run (within 30 min)", foods: ["Protein shake (40g protein)", "2 rice cakes + peanut butter"], cal: 480, p: 45, c: 42, f: 12 },
 { meal: "Lunch", foods: ["8oz chicken breast", "1.5 cups white rice", "Broccoli + olive oil"], cal: 680, p: 60, c: 75, f: 14 },
 { meal: "Snack", foods: ["Greek yogurt (plain, 2%)", "Berries + granola"], cal: 320, p: 22, c: 38, f: 8 },
 { meal: "Dinner", foods: ["8oz salmon", "Sweet potato", "Mixed greens + avocado"], cal: 720, p: 52, c: 55, f: 28 },
 { meal: "Before bed", foods: ["Cottage cheese (1 cup)", "Casein shake optional"], cal: 200, p: 24, c: 8, f: 5 },
 ],
 training: [
 { meal: "Breakfast", foods: ["4 eggs scrambled", "2 slices sourdough", "Avocado"], cal: 580, p: 32, c: 48, f: 28 },
 { meal: "Lunch", foods: ["Ground turkey bowl", "Brown rice", "Black beans + salsa"], cal: 650, p: 52, c: 68, f: 14 },
 { meal: "Snack", foods: ["Protein bar or shake", "Apple"], cal: 300, p: 25, c: 32, f: 8 },
 { meal: "Dinner", foods: ["8oz steak or chicken", "Roasted veg", "Quinoa"], cal: 680, p: 55, c: 55, f: 20 },
 { meal: "Evening", foods: ["Greek yogurt or cottage cheese"], cal: 180, p: 22, c: 8, f: 4 },
 ],
 rest: [
 { meal: "Breakfast", foods: ["3 eggs + 2 whites", "Spinach omelette", "1 slice toast"], cal: 420, p: 35, c: 28, f: 18 },
 { meal: "Lunch", foods: ["Large salad + 6oz chicken", "Olive oil dressing"], cal: 480, p: 48, c: 18, f: 20 },
 { meal: "Snack", foods: ["Protein shake", "Handful almonds"], cal: 310, p: 30, c: 14, f: 16 },
 { meal: "Dinner", foods: ["6oz lean protein", "Roasted veg", "Small portion starch"], cal: 520, p: 45, c: 40, f: 16 },
 ]
 },
 travel: {
 tips: [
 "Prioritize protein first at every meal - order the biggest lean protein option on the menu",
 "Hotel breakfast: eggs + Greek yogurt + fruit. Skip pastries and waffles.",
 "Bring: protein powder single-serve packets, protein bars (Quest/RXBar), mixed nuts",
 "At restaurants: ask for sauces on the side, double protein, swap fries for veg or side salad",
 "Airport: Chipotle (double chicken bowl, no sour cream), Subway (double meat on whole wheat), any salad with grilled protein",
 "Hydration: aim for 100oz water on travel days - airports and hotels are dehydrating",
 "Room service hack: grilled chicken or salmon + steamed veg + plain rice = clean macro hit",
 ],
 gym: {
 chest: ["Barbell Bench Press 4×8", "Incline DB Press 3×10", "Cable Fly 3×12", "Dips 3×failure"],
 back: ["Pull-ups 4×8", "Barbell Row 4×8", "Cable Row 3×12", "Face Pull 3×15"],
 arms: ["EZ Bar Curl 4×10", "Hammer Curl 3×12", "Tricep Pushdown 4×12", "Skull Crushers 3×10"],
 legs: ["Squat 4×8", "Romanian Deadlift 3×10", "Leg Press 3×12", "Calf Raise 4×15"],
 full: ["Deadlift 4×5", "DB Bench 3×10", "Pull-up 3×8", "Lunge 3×12 each", "Plank 3×60sec"],
 }
 }
};

export const getGoalContext = (goals) => {
 const active = (goals || []).filter(g => g.active);
 const primary = active.sort((a,b)=>a.priority-b.priority)[0] || null;
 const secondary = active.sort((a,b)=>a.priority-b.priority).slice(1, 3);
 return { primary, secondary, active };
};

export const applyGoalNutritionTargets = (targets, dayType, goalContext) => {
 if (!targets) return null;
 const primary = goalContext.primary;
 const activeCategories = new Set((goalContext?.active || []).map((goal) => String(goal?.category || "").trim().toLowerCase()).filter(Boolean));
 const normalizedDayType = normalizeNutritionDayType(dayType);
 let out = { ...targets };
 if (!primary) return out;
 if (primary.category === "body_comp") {
 out.cal = isLongEnduranceNutritionDayType(normalizedDayType) ? Math.max(out.cal - 50, 2300) : Math.max(out.cal - 120, 2200);
 out.p = Math.max(out.p, 195);
 }
 if (primary.category === "running") {
 if (isHardNutritionDayType(normalizedDayType)) out.c += 25;
 out.f = Math.max(60, out.f - 3);
 }
 if (primary.category === "strength") {
 if (
 isStrengthNutritionDayType(normalizedDayType)
 || isConditioningNutritionDayType(normalizedDayType)
 || isHybridNutritionDayType(normalizedDayType)
 ) {
 out.p += 10;
 out.c += 10;
 }
 }
 if (activeCategories.has("running") && primary.category !== "running" && isHardNutritionDayType(normalizedDayType)) {
 out.c += 15;
 }
 if (
 activeCategories.has("strength")
 && primary.category !== "strength"
 && (
 isStrengthNutritionDayType(normalizedDayType)
 || isConditioningNutritionDayType(normalizedDayType)
 || isHybridNutritionDayType(normalizedDayType)
 )
 ) {
 out.p += 8;
 out.c += 5;
 }
 return out;
};

const sanitizeNutritionText = (value = "", fallback = "") => String(value || "").replace(/\s+/g, " ").trim() || fallback;

const normalizeMealAnchors = (anchors = {}) => ({
 breakfast: sanitizeNutritionText(anchors?.breakfast || ""),
 lunch: sanitizeNutritionText(anchors?.lunch || ""),
 travelFallback: sanitizeNutritionText(anchors?.travelFallback || ""),
 emergencyOrder: sanitizeNutritionText(anchors?.emergencyOrder || ""),
});

const resolveNutritionGoalBias = (goalContext = {}) => {
 const activeCategories = new Set((goalContext?.active || []).map((goal) => String(goal?.category || "").trim().toLowerCase()).filter(Boolean));
 const primaryCategory = String(goalContext?.primary?.category || "").trim().toLowerCase();
 if (activeCategories.has("body_comp") && activeCategories.has("strength")) return "body_comp_strength";
 if (activeCategories.has("running") && activeCategories.has("strength")) return "hybrid_performance";
 if (primaryCategory === "body_comp") return "body_comp";
 if (primaryCategory === "strength") return "strength";
 if (primaryCategory === "running") return "running";
 return "general";
};

const resolveNutritionMealFamily = (dayType = "") => {
 const normalizedDayType = normalizeNutritionDayType(dayType);
 if (isLongEnduranceNutritionDayType(normalizedDayType)) return "long_endurance";
 if (isHardNutritionDayType(normalizedDayType)) return "quality_endurance";
 if (isStrengthNutritionDayType(normalizedDayType)) return "strength_support";
 if (isHybridNutritionDayType(normalizedDayType) || isConditioningNutritionDayType(normalizedDayType)) return "hybrid_support";
 if (isRecoveryNutritionDayType(normalizedDayType)) return "recovery";
 return "balanced";
};

const MEAL_SLOT_LIBRARY = Object.freeze({
 long_endurance: {
 breakfast: {
 primary: "Pre-session oats + banana + honey + whey or Greek yogurt",
 fast: "Bagel + banana + ready-to-drink protein shake",
 travel: "Hotel oatmeal + eggs + fruit",
 },
 lunch: {
 primary: "Recovery rice bowl with lean protein + fruit",
 fast: "Rotisserie chicken + microwave rice + fruit cup",
 travel: "Chipotle bowl or airport rice bowl with double protein",
 },
 dinner: {
 primary: "Lean protein + rice or potatoes + vegetables",
 fast: "Pre-cooked protein + potato + bagged salad",
 travel: "Grilled protein + plain rice + vegetables",
 },
 snack: {
 primary: "Greek yogurt + granola + berries",
 fast: "Protein shake + banana",
 travel: "Protein bar + fruit + water",
 },
 },
 quality_endurance: {
 breakfast: {
 primary: "Oats + banana + whey or Greek yogurt",
 fast: "Toast or bagel + banana + shake",
 travel: "Egg bites + oatmeal + fruit",
 },
 lunch: {
 primary: "Rice bowl with lean protein + extra carbs + produce",
 fast: "Wrap + fruit + shake",
 travel: "Double-protein grain bowl",
 },
 dinner: {
 primary: "Recovery dinner with lean protein + rice/potatoes + vegetables",
 fast: "Pre-cooked chicken + rice cup + salad kit",
 travel: "Salmon or chicken + rice + vegetables",
 },
 snack: {
 primary: "Banana + yogurt or protein shake",
 fast: "Ready-to-drink shake + pretzels",
 travel: "Greek yogurt + banana",
 },
 },
 strength_support: {
 breakfast: {
 primary: "Eggs or Greek yogurt + oats or toast",
 fast: "Breakfast sandwich + fruit",
 travel: "Hotel eggs + toast + fruit",
 },
 lunch: {
 primary: "Protein bowl with rice or potatoes + vegetables",
 fast: "Rotisserie chicken wrap + fruit",
 travel: "Double-protein salad or grain bowl",
 },
 dinner: {
 primary: "Lift-day dinner with protein + carbs + produce",
 fast: "Pre-cooked protein + potato + bagged veg",
 travel: "Steak or chicken + potato + vegetables",
 },
 snack: {
 primary: "Protein shake or Greek yogurt + fruit",
 fast: "Shake + granola bar",
 travel: "Protein shake + banana",
 },
 },
 hybrid_support: {
 breakfast: {
 primary: "Protein breakfast + fruit + steady carbs",
 fast: "Greek yogurt cup + granola + banana",
 travel: "Egg bites + fruit + oatmeal",
 },
 lunch: {
 primary: "Balanced bowl with protein, carbs, and produce",
 fast: "Chicken wrap + fruit + electrolyte water",
 travel: "Grain bowl with double protein",
 },
 dinner: {
 primary: "Protein-forward dinner + carbs + vegetables",
 fast: "Pre-cooked protein + rice cup + salad",
 travel: "Grilled protein plate + rice + vegetables",
 },
 snack: {
 primary: "Fruit + protein snack",
 fast: "Protein bar + fruit",
 travel: "Greek yogurt + fruit",
 },
 },
 recovery: {
 breakfast: {
 primary: "Eggs or yogurt + fruit + lighter starch",
 fast: "Greek yogurt + berries + toast",
 travel: "Eggs + fruit + yogurt",
 },
 lunch: {
 primary: "Protein-heavy plate + vegetables + moderate carbs",
 fast: "Rotisserie chicken + salad kit + potato",
 travel: "Salad + grilled protein + soup or rice side",
 },
 dinner: {
 primary: "Lean protein + vegetables + controlled carbs",
 fast: "Pre-cooked protein + frozen veg + rice cup",
 travel: "Fish or chicken + vegetables + rice",
 },
 snack: {
 primary: "Fruit + protein snack",
 fast: "String cheese + apple",
 travel: "Greek yogurt cup + fruit",
 },
 },
 balanced: {
 breakfast: {
 primary: "Protein breakfast + fruit + steady carbs",
 fast: "Greek yogurt + fruit + granola",
 travel: "Eggs + oatmeal + fruit",
 },
 lunch: {
 primary: "Balanced bowl with protein, carbs, and produce",
 fast: "Wrap + fruit + yogurt",
 travel: "Protein bowl + carb side + vegetables",
 },
 dinner: {
 primary: "Protein-forward dinner + produce",
 fast: "Pre-cooked protein + potato + salad",
 travel: "Grilled protein + rice + vegetables",
 },
 snack: {
 primary: "Protein snack + fruit",
 fast: "Shake + fruit",
 travel: "Protein bar + water",
 },
 },
});

const GOAL_BIAS_NOTES = Object.freeze({
 body_comp: {
 breakfast: "Keep fats controlled and protein high.",
 lunch: "Make vegetables obvious so fullness stays easier to manage.",
 dinner: "Plate vegetables first and keep extras intentional.",
 snack: "Use this to solve hunger or protein, not to graze.",
 },
 strength: {
 breakfast: "Do not miss the carb serving if training quality matters.",
 lunch: "Keep an extra carb serving ready if output is lagging.",
 dinner: "Make this your biggest recovery meal.",
 snack: "Add this when protein is behind.",
 },
 running: {
 breakfast: "Do not miss carbs before quality work.",
 lunch: "Keep carbs near the session instead of scattering them randomly.",
 dinner: "Close the day with glycogen restoration.",
 snack: "Use fruit + protein to protect the next run.",
 },
 body_comp_strength: {
 breakfast: "Keep protein high without stripping lift-support carbs.",
 lunch: "Stay precise, but still protect lift-day performance.",
 dinner: "Use this as the muscle-retention meal.",
 snack: "Treat this as a protein catch-up tool.",
 },
 hybrid_performance: {
 breakfast: "Fuel the mixed demand instead of picking only run or lift bias.",
 lunch: "Cover both aerobic and strength demand.",
 dinner: "Recover both systems before tomorrow.",
 snack: "Use this when either carbs or protein are lagging.",
 },
 general: {},
});

const buildNutritionTargetChangeSummary = ({ dayTypeLabel = "", baseTargets = {}, targets = {}, reasons = [] } = {}) => {
 const deltas = [
 { key: "cal", label: "kcal", value: Math.round(Number(targets?.cal || 0) - Number(baseTargets?.cal || 0)) },
 { key: "p", label: "g protein", value: Math.round(Number(targets?.p || 0) - Number(baseTargets?.p || 0)) },
 { key: "c", label: "g carbs", value: Math.round(Number(targets?.c || 0) - Number(baseTargets?.c || 0)) },
 ].filter((item) => item.value !== 0);
 if (!deltas.length) return `Today's targets match the standard ${dayTypeLabel || "training-day"} profile.`;
 const deltaLine = deltas
 .map((item) => `${item.value > 0 ? "+" : ""}${item.value} ${item.label}`)
 .join(", ");
 const whyLine = reasons.length
 ? reasons.slice(0, 2).join(" and ")
 : "today's goal and training context";
 return `Compared with a standard ${dayTypeLabel || "training-day"} profile, today shifts ${deltaLine} because ${whyLine}.`;
};

const NUTRITION_DEFICIT_PRESETS = Object.freeze({
 maintain: {
  key: "maintain",
  label: "Maintain",
  weeklyTargetCalories: 0,
 },
 performance_first_cut: {
  key: "performance_first_cut",
  label: "Performance-first cut",
  weeklyTargetCalories: 900,
 },
 moderate_cut: {
  key: "moderate_cut",
  label: "Moderate cut",
  weeklyTargetCalories: 1600,
 },
 assertive_cut: {
  key: "assertive_cut",
  label: "Assertive cut",
  weeklyTargetCalories: 2200,
 },
});

const DAILY_DEFICIT_WEIGHTS = Object.freeze({
 long_endurance: 0.2,
 quality_endurance: 0.35,
 hybrid_support: 0.5,
 strength_support: 0.6,
 recovery: 1.45,
 balanced: 0.85,
});

const CUISINE_SLOT_LIBRARY = Object.freeze({
 mexican: {
  breakfast: "Egg and bean tacos + fruit",
  lunch: "Chicken rice bowl + beans + salsa",
  dinner: "Lean protein fajita bowl + rice + peppers",
  snack: "Greek yogurt + fruit or a turkey tortilla roll-up",
 },
 mediterranean: {
  breakfast: "Greek yogurt bowl + honey + fruit",
  lunch: "Chicken shawarma-style rice bowl + cucumber salad",
  dinner: "Salmon or chicken + rice + roasted vegetables + tzatziki on the side",
  snack: "Greek yogurt + fruit + a few nuts",
 },
 asian: {
  breakfast: "Eggs + rice + fruit",
  lunch: "Teriyaki-style rice bowl with lean protein + vegetables",
  dinner: "Lean protein stir-fry + rice",
  snack: "Greek yogurt + fruit or edamame",
 },
 italian: {
  breakfast: "Eggs + toast + fruit",
  lunch: "Chicken pesto rice bowl or turkey sandwich + fruit",
  dinner: "Chicken or fish + pasta or potatoes + vegetables",
  snack: "Yogurt + fruit",
 },
 american_grill: {
  breakfast: "Eggs + toast + fruit",
  lunch: "Turkey or chicken sandwich + fruit + yogurt",
  dinner: "Grilled chicken or steak + potato + vegetables",
  snack: "Cottage cheese or yogurt + fruit",
 },
 middle_eastern: {
  breakfast: "Greek yogurt + fruit + honey",
  lunch: "Chicken kebab bowl + rice + cucumber-tomato salad",
  dinner: "Lean kofta or chicken + rice + roasted vegetables",
  snack: "Yogurt + fruit or hummus + pita",
 },
});

const CUISINE_QUICK_OPTION_LIBRARY = Object.freeze({
 mexican: { name: "Chipotle", meal: "Double chicken rice bowl + beans + salsa", type: "restaurant", macroFit: "high_protein_high_carb" },
 mediterranean: { name: "CAVA", meal: "Greens + grains bowl, double chicken, hummus on side", type: "restaurant", macroFit: "balanced" },
 asian: { name: "Teriyaki bowl", meal: "Chicken teriyaki bowl + rice + vegetables", type: "restaurant", macroFit: "balanced" },
 italian: { name: "Italian deli", meal: "Turkey or chicken sandwich + fruit + yogurt", type: "restaurant", macroFit: "moderate" },
 american_grill: { name: "Grill plate", meal: "Grilled chicken + baked potato + vegetables", type: "restaurant", macroFit: "balanced" },
 middle_eastern: { name: "Kebab bowl", meal: "Chicken kebab bowl + rice + salad", type: "restaurant", macroFit: "balanced" },
});

const BODYWEIGHT_TREND_STATES = Object.freeze({
 unknown: "unknown",
 droppingFast: "dropping_fast",
 droppingSteady: "dropping_steady",
 flat: "flat",
 rising: "rising",
});

const PERFORMANCE_FUELING_LIBRARY = Object.freeze({
 quality_endurance: {
  label: "Quality-session fueling",
  dayBefore: "Use a carb-forward dinner and keep late-night grazing low. If the session is early or especially important, add roughly 40-60g extra carbs from rice, potatoes, oats, bread, or fruit.",
  preSessionMorning: "If you are training within 60-90 minutes of waking, keep the pre-session choice simple: 30-60g easy carbs, low fiber, low fat.",
  preSessionLater: "Make the main pre-session meal land 3-4 hours before training, then top off with 20-30g easy carbs 30-60 minutes before the session if energy tends to fade.",
  during: "For a quality session that runs longer than about 60 minutes including warm-up and cooldown, sip fluids and use a small carb top-up if pace or quality drops late.",
  recovery: "Within 60 minutes, get 25-35g protein plus 60-90g carbs, then eat a normal recovery meal 2-3 hours later.",
  preloadHydration: "Drink 16-20 oz in the 2-3 hours before training, then 8-12 oz in the last 20 minutes if urine is still dark.",
  duringHydration: "Use 12-20 oz per hour when the session runs long, the weather is hot, or you are a heavy sweater.",
  sodium: "Use roughly 300-500 mg sodium before the session and 400-700 mg per hour if sweat rate or heat is high.",
  priorityLine: "Protect carbs close to the session so the quality work actually stays quality work.",
 },
 long_endurance: {
  label: "Long-run fueling",
  dayBefore: "Bias the evening meal toward easy-to-digest carbs, keep fiber moderate, and add an extra carb serving if the long run starts early.",
  preSessionMorning: "Aim for 60-90g carbs 2-3 hours before the run when possible. If time is short, use 30-45g easy carbs and keep it low fiber.",
  preSessionLater: "Build lunch around easy carbs and moderate protein, then use a smaller carb top-off 30-60 minutes before the run.",
  during: "If the long run lasts longer than roughly 75 minutes, plan carbs during the run instead of hoping breakfast is enough.",
  recovery: "Start recovery with 30-40g protein plus a larger carb hit, then keep carbs coming across the next 4 hours.",
  preloadHydration: "Drink 18-24 oz in the 2-3 hours before the run, then 8-12 oz closer to the start if needed.",
  duringHydration: "Use 18-28 oz per hour as conditions and sweat rate allow.",
  sodium: "Plan roughly 400-700 mg sodium before the run and 500-800 mg per hour during longer or hotter runs.",
  priorityLine: "Long-run days need both bigger glycogen support and a real during-run plan when duration climbs.",
 },
 strength_support: {
  label: "Strength-session fueling",
  dayBefore: "Keep dinner normal but do not let protein or carbs run low if tomorrow includes heavy lifting.",
  preSessionMorning: "Use 25-35g protein plus 25-40g carbs before the lift if you train early and tolerate food well.",
  preSessionLater: "Land a mixed meal 2-4 hours before the session with protein and steady carbs, not just a protein-only snack.",
  during: "Fluids usually beat sports nutrition during a normal lift unless the session is very long or combined with conditioning.",
  recovery: "Use 30-40g protein and 40-70g carbs after the session so strength support work is not underfed.",
  preloadHydration: "Drink 16-20 oz before the session and keep a bottle nearby during the lift.",
  duringHydration: "Use 12-18 oz per hour during longer gym sessions.",
  sodium: "Normal meals usually cover sodium here, but a salty pre-session meal or electrolyte drink can help if you arrive flat or dehydrated.",
  priorityLine: "Protein timing matters, but carbs still help preserve lift quality and total work.",
 },
 hybrid_support: {
  label: "Hybrid-session fueling",
  dayBefore: "Do not choose only a run bias or only a lift bias. Use a normal protein intake plus enough carbs to support both pieces.",
  preSessionMorning: "If the session starts early, use easy carbs plus a lighter protein hit so the run is not underfueled and the lift still has substrate.",
  preSessionLater: "Build the pre-session meal around protein plus steady carbs, then add a small carb top-off if the run segment comes first or lasts longer.",
  during: "If the combined session pushes past about 75 minutes, treat it more like endurance work and use fluids plus carbs during.",
  recovery: "Recover both systems: 30-40g protein and a meaningful carb refill instead of protein alone.",
  preloadHydration: "Drink 18-22 oz before the session, then carry fluids because hybrid days can quietly run long.",
  duringHydration: "Use 14-22 oz per hour, and add carbs during if the combined duration climbs.",
  sodium: "Use 300-500 mg sodium before the session and move toward endurance-style sodium support as heat, sweat, or duration rise.",
  priorityLine: "Hybrid days need enough carbs to preserve the run without letting protein slide for the lift.",
 },
 recovery: {
  label: "Recovery-day nutrition",
  dayBefore: "No special loading is needed. Keep meals regular, protein steady, and appetite decisions simple.",
  preSessionMorning: "Recovery days do not need special pre-session fueling. Use normal breakfast structure and hydration.",
  preSessionLater: "Keep meals predictable and protein-forward so the day does not become random snacking.",
  during: "No special during-session fueling is needed unless recovery work turns into a long outdoor session in the heat.",
  recovery: "Keep protein high, use moderate carbs, and let simpler meals make adherence easier.",
  preloadHydration: "Build hydration around normal meals and thirst instead of aggressive loading.",
  duringHydration: "Use water normally through the day.",
  sodium: "Salt meals to taste unless heat, travel, or sweat loss says otherwise.",
  priorityLine: "Recovery days are where consistency and appetite control should feel easiest.",
 },
 balanced: {
  label: "Balanced training-day nutrition",
  dayBefore: "Use a normal dinner with protein, produce, and enough carbs to avoid starting the next day behind.",
  preSessionMorning: "If training is early, keep breakfast light and digestible with some carbs and protein.",
  preSessionLater: "Use lunch or the prior meal as the main fuel anchor, then top off only if needed.",
  during: "Most balanced training days only need fluids during the session.",
  recovery: "Use the next meal to cover protein, carbs, and produce without trying to micromanage the rest of the day.",
  preloadHydration: "Start the session reasonably hydrated, not overfilled.",
  duringHydration: "Drink to keep pace with thirst and training duration.",
  sodium: "Normal meals usually cover the sodium need here.",
 priorityLine: "Balanced days should feel repeatable, not fragile.",
 },
});

const normalizeNutritionStringList = (values = []) => (
 [...new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean))]
);

const parsePositiveNutritionNumber = (value, fallback = null) => {
 if (value === "" || value == null) return fallback;
 const numeric = Number(value);
 return Number.isFinite(numeric) && numeric > 0 ? Math.round(numeric) : fallback;
};

const parseNonNegativeNutritionNumber = (value, fallback = null) => {
 if (value === "" || value == null) return fallback;
 const numeric = Number(value);
 return Number.isFinite(numeric) && numeric >= 0 ? Math.round(numeric) : fallback;
};

const roundCaloriesToNearest25 = (value = 0) => Math.round(Number(value || 0) / 25) * 25;

const resolveDeficitPresetFromTarget = (weeklyTargetCalories = 0) => {
 const safeTarget = Math.max(0, Number(weeklyTargetCalories || 0));
 const presets = Object.values(NUTRITION_DEFICIT_PRESETS);
 return presets.find((preset) => preset.weeklyTargetCalories === safeTarget) || null;
};

const resolveHeuristicMaintenanceEstimateCalories = ({
 latestWeightLb = 0,
 goalContext = {},
 currentPhase = "",
} = {}) => {
 const activeCategories = new Set((goalContext?.active || []).map((goal) => String(goal?.category || "").trim().toLowerCase()).filter(Boolean));
 let estimate = Number(latestWeightLb || 0) * 14;
 if (activeCategories.has("running")) estimate += 35;
 if (activeCategories.has("strength")) estimate += 25;
 if (["PEAKBUILD", "PEAK"].includes(String(currentPhase || "").toUpperCase())) estimate += 50;
 return Math.max(2000, roundCaloriesToNearest25(estimate));
};

const resolveNutritionPreferenceProfile = ({
 personalization = {},
 goalContext = {},
 currentPhase = "",
 latestWeightLb = 0,
 bodyweightTrend = null,
 hungerHits = 0,
} = {}) => {
 const raw = personalization?.nutritionPreferenceState || {};
 const preferredCuisines = normalizeNutritionStringList(raw?.preferredCuisines || []).map((value) => String(value).toLowerCase());
 const preferredMeals = normalizeNutritionStringList(raw?.preferredMeals || []);
 const dislikes = normalizeNutritionStringList(raw?.dislikes || []);
 const manualMaintenanceEstimateCalories = parsePositiveNutritionNumber(raw?.maintenanceEstimateCalories, null);
 const heuristicMaintenanceEstimateCalories = resolveHeuristicMaintenanceEstimateCalories({
  latestWeightLb,
  goalContext,
  currentPhase,
 });
 const maintenanceEstimateCalories = manualMaintenanceEstimateCalories || heuristicMaintenanceEstimateCalories;
 const maintenanceEstimateSource = manualMaintenanceEstimateCalories ? "manual" : "heuristic";
 const activeCategories = new Set((goalContext?.active || []).map((goal) => String(goal?.category || "").trim().toLowerCase()).filter(Boolean));
 const hasBodyCompGoal = activeCategories.has("body_comp");
 const manualWeeklyDeficitTargetCalories = parseNonNegativeNutritionNumber(raw?.weeklyDeficitTargetCalories, null);
 const defaultWeeklyDeficitTargetCalories = !hasBodyCompGoal
  ? 0
  : bodyweightTrend?.state === BODYWEIGHT_TREND_STATES.droppingFast || hungerHits >= 2
  ? NUTRITION_DEFICIT_PRESETS.performance_first_cut.weeklyTargetCalories
  : activeCategories.has("running") || activeCategories.has("strength")
  ? NUTRITION_DEFICIT_PRESETS.moderate_cut.weeklyTargetCalories
  : NUTRITION_DEFICIT_PRESETS.assertive_cut.weeklyTargetCalories;
 const weeklyDeficitTargetCalories = manualWeeklyDeficitTargetCalories ?? defaultWeeklyDeficitTargetCalories;
 const weeklyDeficitSource = manualWeeklyDeficitTargetCalories != null ? "manual" : "default";
 const preset = resolveDeficitPresetFromTarget(weeklyDeficitTargetCalories)
  || (weeklyDeficitTargetCalories <= 0 ? NUTRITION_DEFICIT_PRESETS.maintain : NUTRITION_DEFICIT_PRESETS.moderate_cut);
 return {
  style: sanitizeNutritionText(raw?.style || ""),
  carbTolerance: sanitizeNutritionText(raw?.carbTolerance || ""),
  preferredMeals,
  dislikes,
  preferredCuisines,
  maintenanceEstimateCalories,
  maintenanceEstimateSource,
  weeklyDeficitTargetCalories,
  weeklyDeficitSource,
  deficitPresetKey: preset.key,
  deficitPresetLabel: preset.label,
  explicitModelActive: Number.isFinite(Number(maintenanceEstimateCalories)) && Number.isFinite(Number(weeklyDeficitTargetCalories)),
 };
};

const resolveDailyDeficitBudgetCalories = ({
 dayType = "",
 weeklyDeficitTargetCalories = 0,
 bodyweightTrendState = BODYWEIGHT_TREND_STATES.unknown,
} = {}) => {
 const mealFamily = resolveNutritionMealFamily(dayType);
 const avgDailyDeficitCalories = Math.max(0, Number(weeklyDeficitTargetCalories || 0)) / 7;
 const weight = DAILY_DEFICIT_WEIGHTS[mealFamily] || DAILY_DEFICIT_WEIGHTS.balanced;
 const softened = bodyweightTrendState === BODYWEIGHT_TREND_STATES.droppingFast ? 0.8 : 1;
 return Math.max(0, Math.round(avgDailyDeficitCalories * weight * softened));
};

const applyAdditionalCaloriesToTargets = ({
 targets = {},
 additionalCalories = 0,
 dayType = "",
} = {}) => {
 const safeAdditionalCalories = Math.max(0, Math.round(Number(additionalCalories || 0)));
 if (!safeAdditionalCalories) return { ...targets };
 const normalizedDayType = normalizeNutritionDayType(dayType);
 const carbShare = isLongEnduranceNutritionDayType(normalizedDayType)
  ? 0.72
  : isHardNutritionDayType(normalizedDayType)
  ? 0.68
  : isHybridNutritionDayType(normalizedDayType) || isConditioningNutritionDayType(normalizedDayType)
  ? 0.62
  : isStrengthNutritionDayType(normalizedDayType)
  ? 0.56
  : 0.46;
 const carbCalories = Math.round(safeAdditionalCalories * carbShare);
 const fatCalories = Math.max(0, safeAdditionalCalories - carbCalories);
 const carbDelta = Math.max(0, Math.round(carbCalories / 20) * 5);
 const fatDelta = Math.max(0, Math.round(fatCalories / 18) * 2);
 return {
  ...targets,
  c: Math.round(Number(targets?.c || 0) + carbDelta),
  f: Math.round(Number(targets?.f || 0) + fatDelta),
 };
};

const applyExplicitEnergyModel = ({
 targets = {},
 dayType = "",
 energyModel = null,
 adjustmentReasons = [],
} = {}) => {
 const nextEnergyModel = { ...(energyModel || {}) };
 if (!energyModel?.explicitModelActive) {
  return {
   targets: { ...targets },
   energyModel: nextEnergyModel,
   adjustmentReasons,
  };
 }
 const dailyDeficitTargetCalories = resolveDailyDeficitBudgetCalories({
  dayType,
  weeklyDeficitTargetCalories: energyModel.weeklyDeficitTargetCalories,
  bodyweightTrendState: energyModel.bodyweightTrendState,
 });
 const minimumAllowedCalories = Math.round(Number(energyModel.maintenanceEstimateCalories || targets?.cal || 0) - dailyDeficitTargetCalories);
 let nextTargets = { ...targets };
 let nextReasons = [...adjustmentReasons];
 let guardrailApplied = false;
 if (
  Number.isFinite(Number(nextTargets?.cal))
  && Number.isFinite(Number(minimumAllowedCalories))
  && Number(nextTargets.cal) < minimumAllowedCalories
 ) {
  const calorieDelta = minimumAllowedCalories - Number(nextTargets.cal);
  nextTargets = {
   ...applyAdditionalCaloriesToTargets({
    targets: nextTargets,
    additionalCalories: calorieDelta,
    dayType,
   }),
   cal: minimumAllowedCalories,
  };
  nextReasons = [...new Set([...nextReasons, "explicit maintenance and weekly deficit model protected this day"])];
  guardrailApplied = true;
 }
 const protectedSession = isHardNutritionDayType(dayType)
  || isLongEnduranceNutritionDayType(dayType)
  || isHybridNutritionDayType(dayType)
  || isConditioningNutritionDayType(dayType)
  || isStrengthNutritionDayType(dayType);
 nextEnergyModel.dailyDeficitTargetCalories = dailyDeficitTargetCalories;
 nextEnergyModel.minimumAllowedCalories = minimumAllowedCalories;
 nextEnergyModel.guardrailApplied = guardrailApplied;
 nextEnergyModel.protectedSession = Boolean(protectedSession);
 nextEnergyModel.line = Number(nextEnergyModel.weeklyDeficitTargetCalories || 0) > 0
  ? `Using a ${nextEnergyModel.maintenanceEstimateSource === "manual" ? "saved" : "heuristic"} maintenance estimate of about ${Math.round(nextEnergyModel.maintenanceEstimateCalories)} kcal/day and a ${nextEnergyModel.weeklyDeficitSource === "manual" ? "saved" : "default"} weekly cut target of about ${Math.round(nextEnergyModel.weeklyDeficitTargetCalories)} kcal/week. ${protectedSession ? `Today's demand only carries about ${dailyDeficitTargetCalories} kcal of that deficit so performance stays protected.` : `Lower-demand days can hold about ${dailyDeficitTargetCalories} kcal of that deficit.`}`
  : `Using a ${nextEnergyModel.maintenanceEstimateSource === "manual" ? "saved" : "heuristic"} maintenance estimate of about ${Math.round(nextEnergyModel.maintenanceEstimateCalories)} kcal/day with no planned weekly deficit.`;
 return {
  targets: nextTargets,
  energyModel: nextEnergyModel,
  adjustmentReasons: nextReasons,
 };
};

const buildCuisinePreferenceLine = (preferredCuisines = []) => {
 const safeCuisines = (preferredCuisines || []).map((value) => sanitizeNutritionText(value).replace(/_/g, " ")).filter(Boolean);
 if (!safeCuisines.length) return "";
 if (safeCuisines.length === 1) return `Cuisine preference: ${safeCuisines[0]}-leaning meal suggestions keep the same macro structure with food choices you are more likely to repeat.`;
 return `Cuisine preferences: ${safeCuisines.slice(0, 2).join(" and ")}-leaning meal suggestions keep the same macro structure with food choices you are more likely to repeat.`;
};

const classifyBodyweightTrend = ({ bodyweights = [], fallbackWeight = 0 } = {}) => {
 const values = (bodyweights || [])
 .map((entry) => Number(entry?.w ?? entry?.value ?? entry))
 .filter((value) => Number.isFinite(value));
 const latestWeight = values.length ? values[values.length - 1] : (Number(fallbackWeight || 0) || 0);
 if (values.length < 2) {
  return {
   state: BODYWEIGHT_TREND_STATES.unknown,
   deltaLb: 0,
   weeklyRateLb: 0,
   latestWeightLb: latestWeight,
   line: latestWeight ? `Bodyweight anchor is ${Math.round(latestWeight * 10) / 10} lb. More repeat weigh-ins are needed before the app should push big nutrition changes.` : "More repeat weigh-ins are needed before bodyweight trend should drive nutrition changes.",
  };
 }
 const deltaLb = Number((values[values.length - 1] - values[0]).toFixed(1));
 const weeklyRateLb = Number((((deltaLb) / Math.max(1, values.length - 1)) * 7).toFixed(1));
 let state = BODYWEIGHT_TREND_STATES.flat;
 if (weeklyRateLb <= -1.5) state = BODYWEIGHT_TREND_STATES.droppingFast;
 else if (weeklyRateLb <= -0.4) state = BODYWEIGHT_TREND_STATES.droppingSteady;
 else if (weeklyRateLb >= 0.6) state = BODYWEIGHT_TREND_STATES.rising;
 const line = state === BODYWEIGHT_TREND_STATES.droppingFast
 ? `Recent bodyweight is falling about ${Math.abs(weeklyRateLb)} lb per week, which is fast enough to justify extra performance protection.`
 : state === BODYWEIGHT_TREND_STATES.droppingSteady
 ? `Recent bodyweight is drifting down about ${Math.abs(weeklyRateLb)} lb per week, which is a workable cut pace if training stays good.`
 : state === BODYWEIGHT_TREND_STATES.rising
 ? `Recent bodyweight is trending up about ${weeklyRateLb} lb per week, so lower-demand days should stay honest if body comp is active.`
 : `Recent bodyweight is mostly flat, so nutrition should bias consistency over aggressive changes.`;
 return {
  state,
  deltaLb,
  weeklyRateLb,
  latestWeightLb: latestWeight,
  line,
 };
};

const buildHydrationAndSodiumPlan = ({
 latestWeightLb = 0,
 dayType = "",
 travelMode = false,
} = {}) => {
 const normalizedDayType = normalizeNutritionDayType(dayType);
 const longSession = isLongEnduranceNutritionDayType(normalizedDayType);
 const hardSession = isHardNutritionDayType(normalizedDayType) && !longSession;
 const strengthSession = isStrengthNutritionDayType(normalizedDayType);
 const hybridSession = isHybridNutritionDayType(normalizedDayType) || isConditioningNutritionDayType(normalizedDayType);
 const recoverySession = isRecoveryNutritionDayType(normalizedDayType);
 const dailyTargetOz = Math.max(
  80,
  Math.round(
   (Number(latestWeightLb || 0) * 0.5)
   + (longSession ? 32 : hardSession ? 24 : hybridSession ? 22 : strengthSession ? 16 : recoverySession ? 6 : 10)
   + (travelMode ? 8 : 0)
  )
 );
 const preloadOz = longSession ? "18-24 oz" : hardSession || hybridSession ? "16-20 oz" : strengthSession ? "16-20 oz" : "12-16 oz";
 const topOffOz = recoverySession ? "Sip to thirst" : "8-12 oz";
 const duringOzPerHour = longSession ? "18-28 oz/hr" : hardSession || hybridSession ? "12-20 oz/hr" : strengthSession ? "12-18 oz/hr" : "sips as needed";
 const dailySodiumTargetMg = longSession ? 3400 : hardSession || hybridSession ? 3000 : strengthSession ? 2800 : 2400;
 const beforeSessionMg = longSession ? "400-700 mg" : hardSession || hybridSession ? "300-500 mg" : strengthSession ? "300-500 mg" : "salt meals normally";
 const duringSessionMgPerHour = longSession ? "500-800 mg/hr" : hardSession || hybridSession ? "400-700 mg/hr" : strengthSession ? "optional unless you sweat heavily" : "not needed";
 return {
  dailyTargetOz,
  preloadOz,
  topOffOz,
  duringOzPerHour,
  dailySodiumTargetMg,
  beforeSessionMg,
  duringSessionMgPerHour,
  hydrationLine: `Daily target ${dailyTargetOz} oz. Preload ${preloadOz}, then ${topOffOz.toLowerCase()} before training${recoverySession ? "." : ` and ${duringOzPerHour} during longer or hotter sessions.`}`,
  sodiumLine: `Baseline sodium lands around ${dailySodiumTargetMg} mg for this demand level. ${recoverySession ? "Salt meals normally." : `Use ${beforeSessionMg} before training and ${duringSessionMgPerHour} if duration, heat, or sweat loss rises.`}`,
 };
};

const buildPhaseNutritionGuidance = ({
 phaseMode = "maintain",
 currentPhase = "BASE",
 dayType = "",
 goalBias = "general",
} = {}) => {
 const normalizedDayType = normalizeNutritionDayType(dayType);
 if (phaseMode === "cut") {
  return {
   label: "Cut with performance guardrails",
   line: isHardNutritionDayType(normalizedDayType) || isLongEnduranceNutritionDayType(normalizedDayType)
   ? "This is still a cut phase, but high-demand run days are protected so the deficit mostly lands on lower-demand windows."
   : "This phase is using lower-demand days to create the deficit while keeping protein high and key sessions protected.",
  };
 }
 if (phaseMode === "build") {
  return {
   label: "Performance support phase",
   line: ["PEAKBUILD", "PEAK"].includes(String(currentPhase || "").toUpperCase())
   ? "Peak weeks push fueling toward performance and recovery, not aggressive restriction."
   : goalBias === "hybrid_performance"
   ? "Mixed running and strength demand keeps carbs and recovery support higher than a generic fitness template."
   : "This phase is biased toward performance support, so carbs and recovery get more room around demanding sessions.",
  };
 }
 return {
  label: "Maintenance phase",
  line: "This phase is using steady intake to support repeatable training quality without forcing a big surplus or deficit.",
 };
};

const buildSessionFuelingPlan = ({
 dayType = "",
 workoutLabel = "",
 hydrationPlan = null,
 bodyweightTrend = null,
 phaseGuidance = null,
} = {}) => {
 const mealFamily = resolveNutritionMealFamily(dayType);
 const template = PERFORMANCE_FUELING_LIBRARY[mealFamily] || PERFORMANCE_FUELING_LIBRARY.balanced;
 const trendLine = bodyweightTrend?.state === BODYWEIGHT_TREND_STATES.droppingFast
 ? "Because bodyweight is falling quickly, key-session fueling should be protected instead of pushing the deficit harder."
 : bodyweightTrend?.state === BODYWEIGHT_TREND_STATES.rising
 ? "Because bodyweight is drifting up, keep lower-demand meals more deliberate instead of quietly adding extras."
 : bodyweightTrend?.state === BODYWEIGHT_TREND_STATES.droppingSteady
 ? "Bodyweight is moving in a reasonable direction, so keep the fueling plan steady and repeatable."
 : "No strong bodyweight signal is changing the base fueling script today.";
 return {
  key: mealFamily,
  label: template.label,
  headline: `${sanitizeNutritionText(workoutLabel || "Today's session")} uses a ${template.label.toLowerCase()} script.`,
  priorityLine: template.priorityLine,
  dayBefore: template.dayBefore,
  preSessionMorning: template.preSessionMorning,
  preSessionLater: template.preSessionLater,
  during: template.during,
  recovery: template.recovery,
  hydration: template.preloadHydration,
  duringHydration: template.duringHydration,
  sodium: template.sodium,
  phaseLine: phaseGuidance?.line || "",
  trendLine,
  hydrationLine: hydrationPlan?.hydrationLine || "",
  sodiumLine: hydrationPlan?.sodiumLine || "",
 };
};

export const mapWorkoutToNutritionDayType = (todayWorkout, environmentMode) => (
 resolveWorkoutNutritionDayType({
 todayWorkout,
 environmentMode,
 })
);

const clonePlainValueNutrition = (value) => {
 if (value == null) return value;
 try {
 return JSON.parse(JSON.stringify(value));
 } catch {
 return value;
 }
};

const normalizeSupplementTakenMap = (supplementTaken = {}) => {
 if (Array.isArray(supplementTaken)) {
 return supplementTaken.reduce((acc, item) => {
 const key = String(item || "").trim();
 if (key) acc[key] = true;
 return acc;
 }, {});
 }
 if (supplementTaken && typeof supplementTaken === "object") {
 return Object.entries(supplementTaken).reduce((acc, [key, value]) => {
 if (String(key || "").trim()) acc[key] = Boolean(value);
 return acc;
 }, {});
 }
 if (typeof supplementTaken === "string" && supplementTaken.trim()) {
 return { [supplementTaken.trim()]: true };
 }
 return {};
};

export const applyHydrationQuickAdd = ({
 currentOz = 0,
 targetOz = 0,
 incrementOz = 12,
} = {}) => {
 const safeCurrentOz = Math.max(0, Number(currentOz || 0));
 const safeTargetOz = Math.max(0, Number(targetOz || 0));
 const safeIncrementOz = Math.max(0, Number(incrementOz || 0));
 const hydrationOz = safeCurrentOz + safeIncrementOz;
 const hydrationPct = safeTargetOz > 0
 ? Math.max(0, Math.min(100, Math.round((hydrationOz / safeTargetOz) * 100)))
 : 0;
 return {
 hydrationOz,
 hydrationTargetOz: safeTargetOz,
 hydrationPct,
 };
};

const inferNutritionDeviationKind = ({ status = "", issue = "", note = "" } = {}) => {
 const statusText = String(status || "").toLowerCase();
 const issueText = String(issue || "").toLowerCase();
 const noteText = String(note || "").toLowerCase();
 if (issueText === "hunger" || /under.?fuel|under ate|underate|missed meal|skipped meal|not enough|hungry|ravenous/.test(noteText)) return "under_fueled";
 if (issueText === "overate" || /over.?ate|binge|overindulg|dessert|alcohol|takeout spiral/.test(noteText)) return "over_indulged";
 if (["travel", "convenience"].includes(issueText) || /travel|airport|hotel|convenien|ate out|schedule/.test(noteText)) return "deviated";
 if (statusText === "on_track") return "followed";
 if (statusText === "decent") return "partial";
 if (statusText === "off_track") return "deviated";
 return "unknown";
};

const mapDeviationKindToLegacyStatus = (deviationKind = "", fallbackStatus = "") => {
 if (fallbackStatus) return fallbackStatus;
 if (deviationKind === "followed") return "on_track";
 if (deviationKind === "partial") return "decent";
 if (["under_fueled", "over_indulged", "deviated"].includes(deviationKind)) return "off_track";
 return "";
};

export const normalizeActualNutritionLog = ({ dateKey = "", feedback = {}, planReference = null } = {}) => {
 const raw = clonePlainValueNutrition(feedback || {});
 const nested = clonePlainValueNutrition(raw?.actualNutrition || raw?.actualNutritionLog || null);
 const status = String(
 raw?.status
 || nested?.quickStatus
 || nested?.status
 || ""
 ).toLowerCase();
 const issue = String(raw?.issue || nested?.issue || nested?.friction || "").toLowerCase();
 const note = String(raw?.note || nested?.note || "").trim();
 const supplementTakenMap = normalizeSupplementTakenMap(
 raw?.supplementTaken
 || nested?.supplements?.takenMap
 || nested?.supplements?.taken
 || nested?.supplementTaken
 || {}
 );
 const hydrationOz = Number(
 raw?.hydrationOz
 ?? nested?.hydration?.oz
 ?? nested?.hydrationOz
 ?? 0
 ) || 0;
 const hydrationTargetOz = Number(
 raw?.hydrationTargetOz
 ?? nested?.hydration?.targetOz
 ?? nested?.hydrationTargetOz
 ?? 0
 ) || 0;
 const deviationKind = String(
 raw?.deviationKind
 || nested?.deviationKind
 || inferNutritionDeviationKind({ status, issue, note })
 );
 const quickStatus = mapDeviationKindToLegacyStatus(deviationKind, status);
 const hydrationPct = hydrationTargetOz > 0
 ? Math.max(0, Math.min(100, Math.round((hydrationOz / hydrationTargetOz) * 100)))
 : null;
 const takenNames = Object.entries(supplementTakenMap)
 .filter(([, taken]) => Boolean(taken))
 .map(([name]) => name);
 const hasAnySignal = Boolean(
 status
 || issue
 || note
 || deviationKind !== "unknown"
 || hydrationOz > 0
 || hydrationTargetOz > 0
 || takenNames.length > 0
 );
 const followedPlan = deviationKind === "followed"
 ? true
 : ["under_fueled", "over_indulged", "deviated"].includes(deviationKind)
 ? false
 : null;
 const adherence = deviationKind === "followed"
 ? "high"
 : deviationKind === "partial"
 ? "partial"
 : ["under_fueled", "over_indulged", "deviated"].includes(deviationKind)
 ? "low"
 : "unknown";

 return {
 id: dateKey ? `actual_nutrition_${dateKey}` : `actual_nutrition_${Date.now()}`,
 model: "actual_nutrition_log_v1",
 dateKey,
 status: quickStatus,
 quickStatus,
 adherence,
 followedPlan,
 deviationKind,
 issue,
 note,
 hydrationOz,
 hydrationTargetOz,
 supplementTaken: supplementTakenMap,
 friction: issue || "",
 hydration: {
 oz: hydrationOz,
 targetOz: hydrationTargetOz,
 pct: hydrationPct,
 nudgedAt: raw?.hydrationNudgedAt || nested?.hydration?.nudgedAt || null,
 },
 supplements: {
 takenMap: supplementTakenMap,
 takenNames,
 count: takenNames.length,
 },
 planReference: clonePlainValueNutrition(raw?.planReference || nested?.planReference || planReference || null),
 loggedAt: hasAnySignal ? (Number(raw?.ts || nested?.loggedAt || Date.now()) || Date.now()) : null,
 legacy: {
 status,
 issue,
 note,
 },
 };
};

export const normalizeActualNutritionLogCollection = (legacyNutritionFeedback = {}) => (
 Object.fromEntries(
 Object.entries(legacyNutritionFeedback || {}).map(([dateKey, feedback]) => [
 dateKey,
 normalizeActualNutritionLog({ dateKey, feedback }),
 ])
 )
);

// LEGACY_COMPAT: older saves still arrive with nutritionFeedback instead of
// nutritionActualLogs. Keep this adapter at the persistence boundary until
// legacy payloads are migrated out of circulation.
export const resolveNutritionActualLogStoreCompat = ({
 nutritionActualLogs = null,
 legacyNutritionFeedback = null,
} = {}) => {
 const hasNormalizedNutritionActualStore = Boolean(
 nutritionActualLogs
 && typeof nutritionActualLogs === "object"
 );
 return hasNormalizedNutritionActualStore
 ? clonePlainValueNutrition(nutritionActualLogs || {})
 : normalizeActualNutritionLogCollection(legacyNutritionFeedback || {});
};

// LEGACY_COMPAT: export-only bridge for older tooling/snapshots that still
// expect nutritionFeedback shape. Runtime truth remains ActualNutritionLog.
export const buildLegacyNutritionFeedbackFromActualLog = (actualNutritionLog = null) => {
 if (!actualNutritionLog || typeof actualNutritionLog !== "object") return {};
 const normalized = normalizeActualNutritionLog({
 dateKey: actualNutritionLog?.dateKey || "",
 feedback: actualNutritionLog,
 });
 return {
 status: normalized.quickStatus || "",
 issue: normalized.issue || "",
 note: normalized.note || "",
 deviationKind: normalized.deviationKind || "",
 hydrationOz: Number(normalized.hydrationOz || 0),
 hydrationTargetOz: Number(normalized.hydrationTargetOz || 0),
 hydrationNudgedAt: normalized.hydration?.nudgedAt || null,
 supplementTaken: normalized.supplements?.takenMap || {},
 planReference: clonePlainValueNutrition(normalized.planReference || null),
 actualNutrition: clonePlainValueNutrition(normalized),
 actualNutritionLog: clonePlainValueNutrition(normalized),
 ts: Number(normalized.loggedAt || Date.now()) || Date.now(),
 };
};

// LEGACY_COMPAT: batch bridge for older persistence/export consumers.
export const buildLegacyNutritionFeedbackCollectionFromActualLogs = (nutritionActualLogs = {}) => (
 Object.fromEntries(
 Object.entries(nutritionActualLogs || {}).map(([dateKey, actualNutritionLog]) => [
 dateKey,
 buildLegacyNutritionFeedbackFromActualLog({
 ...(actualNutritionLog || {}),
 dateKey: actualNutritionLog?.dateKey || dateKey,
 }),
 ])
 )
);

export const mergeActualNutritionLogUpdate = ({
 dateKey = "",
 previousLog = null,
 feedback = {},
 planReference = null,
} = {}) => {
 const previousLegacy = buildLegacyNutritionFeedbackFromActualLog(previousLog);
 return normalizeActualNutritionLog({
 dateKey,
 feedback: {
 ...previousLegacy,
 ...(feedback || {}),
 planReference,
 ts: Date.now(),
 },
 planReference,
 });
};

export const compareNutritionPrescriptionToActual = ({ nutritionPrescription = null, actualNutritionLog = null } = {}) => {
 const actual = actualNutritionLog ? normalizeActualNutritionLog({ dateKey: actualNutritionLog?.dateKey || "", feedback: actualNutritionLog }) : null;
 const hasActual = Boolean(actual?.loggedAt);
 const dayType = normalizeNutritionDayType(nutritionPrescription?.dayType || "");
 const hardDay = isHardNutritionDayType(dayType);
 const hydrationPct = Number(actual?.hydration?.pct || 0);
 const deviationKind = actual?.deviationKind || "unknown";
 const matters = !hasActual
 ? "unknown"
 : deviationKind === "followed"
 ? "low"
 : deviationKind === "partial"
 ? (hardDay ? "medium" : "low")
 : deviationKind === "under_fueled"
 ? (hardDay || hydrationPct < 60 ? "high" : "medium")
 : deviationKind === "over_indulged"
 ? "medium"
 : "medium";
 const summary = !nutritionPrescription
 ? "Nutrition plan is not ready yet."
 : !hasActual
 ? "Food has not been logged yet."
 : deviationKind === "followed"
 ? "Food broadly matched today's plan."
 : deviationKind === "partial"
 ? "Food was mostly on plan, with some drift."
 : deviationKind === "under_fueled"
 ? "Food came in short and may have limited recovery or performance."
 : deviationKind === "over_indulged"
 ? "Food ran higher than the plan."
 : "Food drifted from today's plan.";

 return {
 hasPrescription: Boolean(nutritionPrescription),
 hasActual,
 dayType: nutritionPrescription?.dayType || "",
 adherence: actual?.adherence || "unknown",
 followedPlan: actual?.followedPlan ?? null,
 deviationKind,
 hydrationPct: actual?.hydration?.pct ?? null,
 matters,
 summary,
 confidence: actual ? "high" : "low",
 };
};

export const deriveAdaptiveNutrition = ({ todayWorkout, goals, momentum, personalization, bodyweights, learningLayer, nutritionActualLogs, legacyNutritionFeedback, coachPlanAdjustments, salvageLayer, failureMode }) => {
 const todayKey = new Date().toISOString().split("T")[0];
 const schedule = personalization?.environmentConfig?.schedule || [];
 const isScheduledTravelDate = schedule.some(s => s?.mode === "Travel" && s?.startDate && s?.endDate && todayKey >= s.startDate && todayKey <= s.endDate);
 const environmentMode = isScheduledTravelDate ? "travel" : (personalization.travelState.environmentMode || "home");
 const rawDayTypeOverride = coachPlanAdjustments?.nutritionOverrides?.[todayKey];
 const dayTypeOverride = rawDayTypeOverride?.dayType || rawDayTypeOverride || "";
 const travelMode = environmentMode.includes("travel") || isScheduledTravelDate || personalization?.travelState?.isTravelWeek;
 const mappedDay = dayTypeOverride
 ? normalizeNutritionDayType(dayTypeOverride)
 : mapWorkoutToNutritionDayType(todayWorkout, environmentMode);
 let dayType = normalizeNutritionDayType(mappedDay);
 if (travelMode) {
 if (isRecoveryNutritionDayType(dayType)) {
 dayType = NUTRITION_DAY_TYPES.travelRecovery;
 } else if (isEnduranceNutritionDayType(dayType) || isConditioningNutritionDayType(dayType)) {
 dayType = NUTRITION_DAY_TYPES.travelEndurance;
 }
 }
 const goalContext = getGoalContext(goals);
 const baseTargets = NUTRITION[dayType] || NUTRITION[NUTRITION_DAY_TYPES.runEasy];
 const goalBias = resolveNutritionGoalBias(goalContext);
 let targets = applyGoalNutritionTargets(baseTargets, dayType, goalContext);
 let phaseAwareAdjustment = null;
 const adjustmentReasons = [];
 const currentPhase = todayWorkout?.week?.phase || "BASE";
 const recentBW = (bodyweights || []).slice(-10).map(x => Number(x.w)).filter(Boolean);
 const latestKnownWeight = Number(recentBW[recentBW.length - 1] || personalization?.profile?.bodyweight || personalization?.profile?.weight || 185);
 const bodyweightTrend = classifyBodyweightTrend({
  bodyweights,
  fallbackWeight: latestKnownWeight,
 });

 const activeGoals = goalContext.active || [];
 const hasBodyCompGoal = activeGoals.some(g => g.category === "body_comp");
 const hasStrengthGoal = activeGoals.some(g => g.category === "strength");
 if (goalContext.primary?.category === "body_comp") adjustmentReasons.push("fat-loss bias keeps protein high");
 if (goalContext.primary?.category === "running" && isHardNutritionDayType(dayType)) adjustmentReasons.push("running priority protects carbs on harder sessions");
 if (goalContext.primary?.category === "strength" && (isStrengthNutritionDayType(dayType) || isConditioningNutritionDayType(dayType) || isHybridNutritionDayType(dayType))) adjustmentReasons.push("strength priority protects protein and carbs on support days");
 if (goalBias === "hybrid_performance") adjustmentReasons.push("secondary goals keep mixed-demand days from collapsing into one bias");
 if (hasBodyCompGoal && hasStrengthGoal) {
 const heavyLiftDay = (
 isStrengthNutritionDayType(dayType)
 || isConditioningNutritionDayType(dayType)
 || isHybridNutritionDayType(dayType)
 || ["run+strength", "strength+prehab"].includes(todayWorkout?.type)
 );
 const easyRunWeek = !!todayWorkout?.week?.cutback || isBaseEnduranceNutritionDayType(dayType) || isRecoveryNutritionDayType(dayType);
 if (heavyLiftDay) {
 const prev = { ...targets };
 targets.cal = Math.max(targets.cal, NUTRITION[NUTRITION_DAY_TYPES.strengthSupport].cal);
 targets.c = Math.max(targets.c, NUTRITION[NUTRITION_DAY_TYPES.strengthSupport].c);
 targets.p = Math.max(targets.p, 200);
 phaseAwareAdjustment = {
 active: true,
 mode: "maintenance_on_lift_days",
 summary: "Maintenance calories on heavy lift days to protect strength output.",
 why: `Strength day detected (${todayWorkout?.label || dayType}), so calories/carbs were protected from deficit.`,
 delta: { cal: targets.cal - prev.cal, c: targets.c - prev.c, p: targets.p - prev.p },
 };
 adjustmentReasons.push("heavy lift work kept calories closer to maintenance");
 } else if (easyRunWeek) {
 const prev = { ...targets };
 targets.cal = Math.max(2200, targets.cal - 140);
 targets.c = Math.max(170, targets.c - 20);
 phaseAwareAdjustment = {
 active: true,
 mode: "deficit_on_easy_weeks",
 summary: "Deficit bias on easier run weeks to keep fat-loss moving.",
 why: "Easy-load context detected, so a modest deficit was applied while protein stays high.",
 delta: { cal: targets.cal - prev.cal, c: targets.c - prev.c, p: targets.p - prev.p },
 };
 adjustmentReasons.push("easier training load allowed a modest deficit");
  }
 }

 const bwTrend = recentBW.length >= 2 ? recentBW[recentBW.length - 1] - recentBW[0] : 0;
 // LEGACY_COMPAT: adaptive nutrition still reads legacy nutritionFeedback for
 // older payloads that have not been normalized onto nutritionActualLogs.
 const recentFeedback = Object.values(
 resolveNutritionActualLogStoreCompat({
 nutritionActualLogs: (nutritionActualLogs && Object.keys(nutritionActualLogs).length) ? nutritionActualLogs : null,
 legacyNutritionFeedback,
 })
 ).slice(-10);
 const hungerHits = recentFeedback.filter(f => f.deviationKind === "under_fueled" || f.issue === "hunger").length;
 const offTrackHits = recentFeedback.filter(f => f.adherence === "low" || f.quickStatus === "off_track").length;
 const preferenceProfile = resolveNutritionPreferenceProfile({
  personalization,
  goalContext,
  currentPhase,
  latestWeightLb: latestKnownWeight,
  bodyweightTrend,
  hungerHits,
 });

 if (goalContext.primary?.category === "body_comp") {
 if (bodyweightTrend.state === BODYWEIGHT_TREND_STATES.droppingFast || bwTrend < -2.2 || hungerHits >= 2 || momentum.inconsistencyRisk === "high") {
 targets.cal += 120;
 targets.c += 20;
 adjustmentReasons.push("recent hunger or fast weight drop softened the deficit");
 }
 if (offTrackHits >= 3) {
 targets.cal += 90;
 targets.f += 5;
 adjustmentReasons.push("recent off-track days reduced restriction to improve adherence");
 }
 }

 if (goalContext.primary?.category === "running" && isHardNutritionDayType(dayType)) {
 if (learningLayer?.stats?.harder >= 2) {
 targets.c += 20;
 targets.cal += 70;
 adjustmentReasons.push("recent hard sessions looked harder than expected");
 }
 }

 if (
  (goalContext.primary?.category === "running" || goalBias === "hybrid_performance")
  && bodyweightTrend.state === BODYWEIGHT_TREND_STATES.droppingFast
 ) {
  targets.cal += 80;
  targets.c += 15;
  adjustmentReasons.push("performance guardrail softened the drop while bodyweight is falling quickly");
 }

 if (
  goalContext.primary?.category === "body_comp"
  && bodyweightTrend.state === BODYWEIGHT_TREND_STATES.rising
  && offTrackHits === 0
  && !isHardNutritionDayType(dayType)
  && !isLongEnduranceNutritionDayType(dayType)
 ) {
  targets.cal = Math.max(2100, targets.cal - 80);
  targets.c = Math.max(160, targets.c - 10);
  adjustmentReasons.push("flat or rising bodyweight kept easier-day intake tighter");
 }

 if (salvageLayer?.active || failureMode?.hardeningMode) {
 targets = {
 ...targets,
 cal: Math.max(targets.cal, NUTRITION[NUTRITION_DAY_TYPES.runEasy].cal),
 p: Math.max(targets.p, 190),
 };
 adjustmentReasons.push("hardening mode prevented aggressive restriction");
 }

 let energyModel = {
  maintenanceEstimateCalories: preferenceProfile.maintenanceEstimateCalories,
  maintenanceEstimateSource: preferenceProfile.maintenanceEstimateSource,
  weeklyDeficitTargetCalories: preferenceProfile.weeklyDeficitTargetCalories,
  weeklyDeficitSource: preferenceProfile.weeklyDeficitSource,
  deficitPresetKey: preferenceProfile.deficitPresetKey,
  deficitPresetLabel: preferenceProfile.deficitPresetLabel,
  bodyweightTrendState: bodyweightTrend.state,
  explicitModelActive: Boolean(preferenceProfile.explicitModelActive),
 };
 const explicitEnergyResolution = applyExplicitEnergyModel({
  targets,
  dayType,
  energyModel,
  adjustmentReasons,
 });
 targets = explicitEnergyResolution.targets;
 energyModel = explicitEnergyResolution.energyModel;
 adjustmentReasons.splice(0, adjustmentReasons.length, ...explicitEnergyResolution.adjustmentReasons);

 let phaseMode = "maintain";
 if (phaseAwareAdjustment?.mode === "maintenance_on_lift_days") phaseMode = "maintain";
 else if (phaseAwareAdjustment?.mode === "deficit_on_easy_weeks") phaseMode = "cut";
 else if (goalContext.primary?.category === "strength" || ["PEAKBUILD", "PEAK"].includes(currentPhase)) phaseMode = "build";
 else if (goalContext.primary?.category === "body_comp") phaseMode = ["BASE", "BUILDING"].includes(currentPhase) ? "cut" : "maintain";
 else if (isHardNutritionDayType(dayType) || isConditioningNutritionDayType(dayType)) phaseMode = "build";
 const hydrationPlan = buildHydrationAndSodiumPlan({
  latestWeightLb: latestKnownWeight,
  dayType,
  travelMode,
 });
 targets = {
  ...targets,
  hydrationTargetOz: hydrationPlan.dailyTargetOz,
  sodiumTargetMg: hydrationPlan.dailySodiumTargetMg,
 };
 const phaseGuidance = buildPhaseNutritionGuidance({
  phaseMode,
  currentPhase,
  dayType,
  goalBias,
 });
 const sessionFuelingPlan = buildSessionFuelingPlan({
  dayType,
  workoutLabel: todayWorkout?.label || todayWorkout?.type || dayType,
  hydrationPlan,
  bodyweightTrend,
  phaseGuidance,
 });

 const templateKey = travelMode ? "travel" : "home";
 const mealPlan = templateKey === "travel"
 ? { tips: MEAL_PLANS.travel.tips, gym: MEAL_PLANS.travel.gym }
 : (
 isLongEnduranceNutritionDayType(dayType)
 ? MEAL_PLANS.home.longRun
 : isRecoveryNutritionDayType(dayType)
 ? MEAL_PLANS.home.rest
 : MEAL_PLANS.home.training
 );

 const simplified = learningLayer?.adjustmentBias === "simplify" || momentum.momentumState.includes("drifting") || offTrackHits >= 3;
 const strategy = simplified
 ? ["3 simple meals + 1 protein snack", "Use one saved safe default meal", "Anchor breakfast + protein-forward dinner"]
 : ["Distribute protein across 4+ meals", "Front-load carbs around key run", "Keep hydration + sodium stable"];
 const dayTypeLabel = getNutritionDayTypeLabel(dayType);

 const explanation = goalContext.primary
 ? `Nutrition adapts to primary goal (${goalContext.primary.name}) and today (${dayTypeLabel}).`
 : `Nutrition follows training demand for today (${dayTypeLabel}).`;
 const deltaFromBaseline = {
 cal: Math.round(Number(targets?.cal || 0) - Number(baseTargets?.cal || 0)),
 p: Math.round(Number(targets?.p || 0) - Number(baseTargets?.p || 0)),
 c: Math.round(Number(targets?.c || 0) - Number(baseTargets?.c || 0)),
 f: Math.round(Number(targets?.f || 0) - Number(baseTargets?.f || 0)),
 };
 const targetChangeSummary = buildNutritionTargetChangeSummary({
 dayTypeLabel,
 baseTargets,
 targets,
 reasons: [...new Set(adjustmentReasons)],
 });

 return {
 dayType,
 dayTypeLabel,
 baselineTargets: baseTargets,
 deltaFromBaseline,
 targetChangeSummary,
 adjustmentReasons: [...new Set(adjustmentReasons)],
 targets,
 mealPlan,
 strategy,
 simplified,
 explanation,
 phaseAwareAdjustment,
 phaseMode,
  phaseGuidance,
  bodyweightTrend,
  energyModel,
  hydrationPlan,
  sessionFuelingPlan,
  preferenceProfile,
 goalBias,
 goalContext,
 travelMode,
 workoutType: todayWorkout?.type || "",
 workoutLabel: todayWorkout?.label || todayWorkout?.type || "session",
 };
};

export const deriveRealWorldNutritionEngine = ({ location, dateKey = "", dayType, goalContext, nutritionLayer, momentum, favorites, travelMode, learningLayer, timeOfDay, loggedIntake }) => {
 const city = (location || "").trim() || "your area";
 const normalizedDayType = normalizeNutritionDayType(dayType || nutritionLayer?.dayType || "");
 const dayTypeLabel = getNutritionDayTypeLabel(normalizedDayType);
 const key = `${city.toLowerCase()}_${normalizedDayType}`;
 const favoriteRestaurants = favorites?.restaurants || [];
 const favoriteSafeMeals = favorites?.safeMeals || [];
 const groceryPrefs = favorites?.groceries || [];
 const savedMealAnchors = normalizeMealAnchors(favorites?.mealAnchors || {});
 const mealAnchors = savedMealAnchors;
 const workoutType = String(nutritionLayer?.workoutType || "").toLowerCase();
 const workoutLabel = String(nutritionLayer?.workoutLabel || dayTypeLabel || normalizedDayType || "session");
 const primaryCategory = goalContext?.primary?.category || "general_fitness";
 const goalBias = resolveNutritionGoalBias(goalContext);
 const mealFamily = resolveNutritionMealFamily(normalizedDayType);
 const slotTemplates = MEAL_SLOT_LIBRARY[mealFamily] || MEAL_SLOT_LIBRARY.balanced;
 const preferenceProfile = nutritionLayer?.preferenceProfile || {};
 const preferredCuisines = preferenceProfile?.preferredCuisines || [];
 const primaryCuisineKey = preferredCuisines[0] || "";
 const cuisineSlotTemplates = CUISINE_SLOT_LIBRARY[primaryCuisineKey] || null;
 const cuisineQuickOption = primaryCuisineKey && CUISINE_QUICK_OPTION_LIBRARY[primaryCuisineKey]
  ? {
   ...CUISINE_QUICK_OPTION_LIBRARY[primaryCuisineKey],
   name: `${CUISINE_QUICK_OPTION_LIBRARY[primaryCuisineKey].name} (${city})`,
  }
  : null;
 const cuisinePreferenceLine = buildCuisinePreferenceLine(preferredCuisines);
 const goalBiasNotes = GOAL_BIAS_NOTES[goalBias] || GOAL_BIAS_NOTES.general;
 const timeBucket = String(timeOfDay || "").toLowerCase() || "afternoon";
 const intakeStatus = String(loggedIntake?.status || "").toLowerCase();
 const intakeIssue = String(loggedIntake?.issue || "").toLowerCase();
 const intakeNote = String(loggedIntake?.note || "").toLowerCase();
 const hydrationOz = Number(loggedIntake?.hydrationOz || 0);
 const missedProteinSignal = /protein|shake|missed meal|skipped|underate|under ate|not enough/.test(intakeIssue) || /protein|skip|missed|under/.test(intakeNote);
 const hungerSignal = intakeIssue === "hunger" || /hungry|ravenous/.test(intakeNote);
 const offTrackSignal = intakeStatus === "off_track";
 const hardSession = isHardNutritionDayType(normalizedDayType) || /hard|long|tempo|interval/.test(workoutType);
 const strengthSession = isStrengthNutritionDayType(normalizedDayType) || /strength/.test(workoutType);
 const recoverySession = isRecoveryNutritionDayType(normalizedDayType) || /rest|recovery/.test(workoutType);
 const sessionFuelingPlan = nutritionLayer?.sessionFuelingPlan || buildSessionFuelingPlan({
  dayType: normalizedDayType,
  workoutLabel,
  hydrationPlan: nutritionLayer?.hydrationPlan || null,
  bodyweightTrend: nutritionLayer?.bodyweightTrend || null,
  phaseGuidance: nutritionLayer?.phaseGuidance || null,
 });
 const hydrationPlan = nutritionLayer?.hydrationPlan || buildHydrationAndSodiumPlan({
  latestWeightLb: Number(nutritionLayer?.bodyweightTrend?.latestWeightLb || 185),
  dayType: normalizedDayType,
  travelMode,
 });
 const dayOfFuelingLine = timeBucket === "morning"
 ? sessionFuelingPlan.preSessionMorning
 : sessionFuelingPlan.preSessionLater;
 const performanceGuidance = {
  headline: sessionFuelingPlan.headline,
  priorityLine: sessionFuelingPlan.priorityLine,
  dayBefore: sessionFuelingPlan.dayBefore,
  dayOf: dayOfFuelingLine,
  during: sessionFuelingPlan.during,
  recovery: sessionFuelingPlan.recovery,
  hydration: sessionFuelingPlan.hydrationLine || hydrationPlan.hydrationLine,
  sodium: sessionFuelingPlan.sodiumLine || hydrationPlan.sodiumLine,
 };
 const adaptiveContext = {
  phase: {
   label: nutritionLayer?.phaseGuidance?.label || "Phase mode",
   line: nutritionLayer?.phaseGuidance?.line || "No explicit phase adjustment is active today.",
  },
  trend: {
   label: "Bodyweight trend",
   line: nutritionLayer?.bodyweightTrend?.line || "Bodyweight trend is not strong enough to change today's nutrition script yet.",
  },
  energy: {
   label: "Energy model",
   line: nutritionLayer?.energyModel?.line || "No explicit maintenance or weekly deficit model is active yet.",
  },
  adjustment: {
   label: "Why the targets changed",
   line: nutritionLayer?.targetChangeSummary || "Today's targets match the standard day-demand profile.",
  },
 };

 const quickOptions = [
 mealAnchors.emergencyOrder ? { name: "Emergency fallback", meal: mealAnchors.emergencyOrder, type: "anchor", macroFit: "fallback" } : null,
 cuisineQuickOption,
 { name: `Chipotle (${city})`, meal: "Double chicken rice bowl + fajita veg + pico", type: "restaurant", macroFit: "high_protein_high_carb" },
 { name: `CAVA (${city})`, meal: "Greens + grains bowl, double chicken, hummus on side", type: "restaurant", macroFit: "balanced" },
 { name: `Panera (${city})`, meal: "Teriyaki bowl + Greek yogurt", type: "restaurant", macroFit: "moderate" },
 { name: `Whole Foods (${city})`, meal: "Hot bar: lean protein + rice + veg", type: "grocery", macroFit: "custom" },
 { name: `Trader Joe's (${city})`, meal: "Pre-cooked chicken + microwave rice + salad kit", type: "grocery", macroFit: "budget" },
 ].filter(Boolean);

 const travelBreakfast = [
 "Hotel buffet: eggs + oatmeal + fruit",
 "Greek yogurt + banana + protein bar",
 "Starbucks: egg bites + oatmeal + latte",
 ];

 const defaultMealStructure = nutritionLayer?.simplified
 ? ["Meal 1: protein + carb anchor", "Meal 2: default safe meal", "Meal 3: protein + veg + carb", "Snack: protein + fruit"]
 : ["Meal 1: structured breakfast", "Meal 2: performance lunch", "Meal 3: recovery dinner", "Snack: extra protein snack"];

 const constraints = [];
 if (travelMode) constraints.push("travel_logistics");
 if (momentum?.logGapDays >= 3) constraints.push("low_logging_momentum");
 if (learningLayer?.stats?.timeBlockers >= 1) constraints.push("time_pressure");

 const recommendations = [...favoriteSafeMeals.map(m => ({ name: m.name || "Saved safe meal", meal: m.meal || m.name, type: "saved", macroFit: "known" })), ...quickOptions]
 .slice(0, 8);
 const slotLabels = { breakfast: "Breakfast", lunch: "Lunch", dinner: "Dinner", snack: "Optional snack" };
 const addTimingContext = (slotKey = "", text = "") => {
 const safeText = sanitizeNutritionText(text);
 if (!safeText) return "";
 if (slotKey === "breakfast" && timeBucket === "morning" && hardSession) return `Pre-session: ${safeText}`;
 if (slotKey === "breakfast" && timeBucket === "evening" && !recoverySession) return `Earlier anchor: ${safeText}`;
 if (slotKey === "lunch" && timeBucket === "evening" && (hardSession || strengthSession)) return `Pre-session: ${safeText}`;
 if (slotKey === "dinner" && timeBucket === "evening" && (hardSession || strengthSession)) return `Post-session: ${safeText}`;
 if (slotKey === "lunch" && timeBucket === "morning" && hardSession) return `Recovery lunch: ${safeText}`;
 return safeText;
 };
 const mealSlots = Object.keys(slotTemplates).map((slotKey) => {
 const template = slotTemplates[slotKey] || {};
 const anchorValue = slotKey === "breakfast"
 ? mealAnchors.breakfast
 : slotKey === "lunch"
 ? mealAnchors.lunch
 : "";
 const cuisinePrimary = cuisineSlotTemplates?.[slotKey] || "";
 const resetFastSwap = slotKey === "snack"
 ? "Reset snack: protein shake + fruit within the next hour"
 : slotKey === "dinner"
 ? "Catch-up dinner: lean protein + rice or potatoes + vegetables"
 : slotKey === "lunch"
 ? "Reset lunch: rice bowl or wrap + fruit + water"
 : "Reset meal: protein + carb + fruit";
 const hungerFastSwap = slotKey === "snack"
 ? "Higher-volume snack: Greek yogurt, fruit, and granola"
 : template.fast;
 const fastSwapBase = missedProteinSignal || offTrackSignal
 ? resetFastSwap
 : hungerSignal
 ? hungerFastSwap
 : template.fast;
 const travelSwapBase = slotKey === "breakfast"
 ? template.travel
 : mealAnchors.travelFallback || template.travel;
 const primary = addTimingContext(slotKey, anchorValue || cuisinePrimary || template.primary);
 const fastSwap = addTimingContext(slotKey, fastSwapBase);
 const travelSwap = addTimingContext(slotKey, travelSwapBase);
 return {
 key: slotKey,
 label: slotLabels[slotKey] || slotKey,
 primary,
 fastSwap,
 travelSwap,
 note: sanitizeNutritionText([goalBiasNotes?.[slotKey] || "", cuisinePreferenceLine].filter(Boolean).join(" ")),
 savedAnchor: Boolean(anchorValue),
 anchorSource: anchorValue ? slotKey : "",
 };
 });
 const mealStructure = Object.fromEntries(mealSlots.map((slot) => [slot.key, slot.primary]));

 const dailyRecommendations = (() => {
  const lines = [];
  if (hardSession) lines.push(`Center carbs around ${workoutLabel} so output stays high and do not leave the session underfueled.`);
  else if (strengthSession) lines.push(`Keep protein evenly spaced today and still keep enough carbs in the pre- and post-lift windows.`);
  else if (recoverySession) lines.push("Keep meals simple and protein-forward; recovery is the job today.");
  else lines.push("Use balanced meals and avoid random snacking so energy stays steady.");

  lines.push(dayOfFuelingLine);

  if (offTrackSignal || missedProteinSignal) lines.push("Use the next meal to reset protein instead of trying to make up the whole day at once.");
  else if (hungerSignal) lines.push("Add volume from fruit/yogurt before reaching for convenience snacks.");

  if (hydrationOz > 0 && hydrationOz < 40) lines.push("Hydration is still low, so pair the next meal with a large water refill.");
  else lines.push(performanceGuidance.hydration);
  if (cuisinePreferenceLine) lines.push(cuisinePreferenceLine);
  return lines.slice(0, 3);
  })();

 const whyToday = (() => {
 const goalLine = primaryCategory === "body_comp"
 ? "fat-loss progress"
 : primaryCategory === "strength"
 ? "strength progress"
 : primaryCategory === "running"
 ? "running quality"
 : "consistent training";
 const intakeLine = offTrackSignal
 ? "Today already drifted off plan, so the next recommendation is designed to reset instead of chase perfection."
 : missedProteinSignal
 ? "Logged intake suggests protein fell short, so the next meals bias catch-up protein."
 : hungerSignal
 ? "Hunger signals are elevated, so volume and meal timing are pushed up to protect adherence."
 : "No major intake issue is logged, so recommendations stay aligned with training demand.";
  return `${workoutLabel} sets the training demand, ${goalLine} sets the bias, ${timeBucket} shapes meal timing, ${sessionFuelingPlan.priorityLine.toLowerCase()}, ${cuisinePreferenceLine ? `${cuisinePreferenceLine.toLowerCase()}, ` : ""}and ${intakeLine}`;
  })();
 const executionPlan = buildNutritionExecutionPlan({
  dateKey,
  dayType: normalizedDayType,
  mealFamily,
  goalBias,
  workoutLabel,
  preferredCuisines,
  savedMealAnchors: mealAnchors,
  targets: nutritionLayer?.targets || {},
  travelMode,
  missedProteinSignal,
  hungerSignal,
 offTrackSignal,
 likedMealPatterns: favorites?.likedMealPatterns || {},
  dislikedMealPatterns: favorites?.dislikedMealPatterns || {},
  mealPatternFeedback: favorites?.mealPatternFeedback || {},
  mealPatternFeedbackMeta: favorites?.mealPatternFeedbackMeta || {},
  mealPatternHistory: favorites?.mealPatternHistory || [],
  slotOverrides: favorites?.mealCalendarOverrides?.[dateKey] || {},
  favoriteGroceries: favorites?.groceries || [],
  favoriteRestaurants: favorites?.restaurants || [],
  safeMeals: [
    ...(favorites?.safeMeals || []),
    ...(favorites?.defaultMeals || []),
    ...(favorites?.travelMeals || []),
  ],
  mealAnchorSignals: Object.values(mealAnchors || {}),
 });
 const emergencyOrder = mealAnchors.emergencyOrder
 || recommendations.find((option) => option?.type === "anchor" || option?.type === "restaurant")?.meal
 || "";

 const groceryHooks = {
 active: true,
 focus: hardSession ? "carb_restock" : strengthSession ? "protein_restock" : recoverySession ? "simple_recovery" : "balanced_defaults",
 priorityItems: hardSession
 ? ["rice", "oats", "fruit", "lean protein"]
 : strengthSession
 ? ["Greek yogurt", "eggs", "lean protein", "rice/potatoes"]
 : ["lean protein", "fruit", "bagged salad", "easy staples"],
 carryForwardMeals: [mealStructure.breakfast, mealStructure.lunch].filter(Boolean),
 };

 return {
 key,
 city,
 recommendations,
 mealFamily,
 goalBias,
 mealAnchors,
 mealSlots,
 mealStructure,
 executionPlan,
  dailyRecommendations,
  whyToday,
 performanceGuidance,
 adaptiveContext,
 cuisinePreferenceLine,
 emergencyOrder,
  groceryHooks,
 travelBreakfast,
 defaultMealStructure,
 constraints,
 groceryPrefs,
 favoriteRestaurants,
 notes: travelMode
 ? "Travel mode: prioritize convenience + protein certainty."
 : "Home mode: prioritize prep consistency + meal anchors.",
 summary: `${city}: ${recommendations.length} quick nutrition options aligned to ${dayTypeLabel || normalizedDayType}.`,
 };
};

export const LOCAL_PLACE_TEMPLATES = {
 austin: ["Chipotle", "CAVA", "Whole Foods", "Trader Joe's", "H-E-B", "Torchy's (protein bowl)", "Flower Child"],
 dallas: ["Chipotle", "CAVA", "Whole Foods", "Trader Joe's", "Central Market", "Eatzi's", "Salata"],
 houston: ["Chipotle", "CAVA", "Whole Foods", "Trader Joe's", "H-E-B", "Sweetgreen", "Salata"],
 seattle: ["Chipotle", "CAVA", "Whole Foods", "Trader Joe's", "Met Market", "Evergreens", "Homegrown"],
 default: ["Chipotle", "CAVA", "Whole Foods", "Trader Joe's", "Panera", "Starbucks", "Any grocery hot bar"],
};

export const explainMacroShift = (dayType) => {
 const normalizedDayType = normalizeNutritionDayType(dayType);
 if (isHardNutritionDayType(normalizedDayType)) return "Higher carbs support harder or longer training output and glycogen restoration. Fat stays moderate to keep digestion smooth around the session.";
 if (isRecoveryNutritionDayType(normalizedDayType)) return "Slightly lower carbs on recovery days maintains energy balance while keeping protein high to preserve lean mass and recovery.";
 return "Balanced carbs/protein supports training quality, recovery, and consistency.";
};

export const getPlaceRecommendations = ({ city, dayType, favorites, mode, query }) => {
 const key = (city || "").toLowerCase();
 const base = LOCAL_PLACE_TEMPLATES[key] || LOCAL_PLACE_TEMPLATES.default;
 const saved = (favorites?.restaurants || []).map(r => r.name).filter(Boolean);
 const all = [...new Set([...saved, ...base])];
 const q = (query || "").toLowerCase().trim();
 const filtered = q ? all.filter(name => name.toLowerCase().includes(q)) : all;
 const normalizedDayType = normalizeNutritionDayType(dayType);
 return filtered.slice(0, 8).map(name => ({
 name,
 meal: mode === "travel"
 ? "Lean protein + carb side + veg"
 : isHardNutritionDayType(normalizedDayType)
 ? "Protein bowl + extra rice"
 : "Protein-heavy plate + produce",
 source: saved.includes(name) ? "saved" : "local",
 }));
};

export const buildGroceryBasket = ({ store, city, days, dayType }) => {
 const protein = ["pre-cooked chicken breast", "lean ground turkey", "Greek yogurt", "protein shakes"];
 const carbs = ["microwave jasmine rice", "oats", "fruit", "whole grain wraps"];
 const fats = ["avocado", "olive oil packets", "mixed nuts"];
 const produce = ["bagged salad", "steam-in-bag veggies", "berries"];
 const extras = ["electrolytes", "sparkling water", "salsa/hot sauce"];
 const runBonus = ["bagels", "honey", "rice cakes"];
 const normalizedDayType = normalizeNutritionDayType(dayType);
 return {
 store,
 city,
 days,
 items: [...protein, ...carbs, ...fats, ...produce, ...extras, ...(isHardNutritionDayType(normalizedDayType) ? runBonus : [])],
 };
};

const buildAnchorMealLabel = (anchor = null) => {
 const text = typeof anchor === "string"
 ? anchor
 : anchor?.meal || anchor?.name || "";
 return String(text || "").trim();
};

const dedupeBasketItems = (items = []) => (
 [...new Set((items || []).map((item) => String(item || "").trim()).filter(Boolean))]
);

export const deriveGroceryExecutionSupport = ({
 nutritionLayer = null,
 realWorldNutrition = null,
 weeklyNutritionReview = null,
 favorites = {},
 localFoodContext = {},
 savedLocation = {},
 dayType = "",
 travelMode = false,
 recoveryDay = false,
 hardDay = false,
 strengthDay = false,
} = {}) => {
 const city = String(localFoodContext?.city || localFoodContext?.locationLabel || "your area").trim() || "your area";
 const preferredStore = String(localFoodContext?.groceryOptions?.[0] || favorites?.groceries?.[0]?.name || favorites?.groceries?.[0] || "your usual grocery stop").trim() || "your usual grocery stop";
 const locationPermissionGranted = Boolean(localFoodContext?.locationPermissionGranted || savedLocation?.status === "granted");
 const savedMealAnchors = normalizeMealAnchors(favorites?.mealAnchors || {});
 const savedSafeMeals = (favorites?.safeMeals || []).map(buildAnchorMealLabel).filter(Boolean);
 const savedDefaultMeals = (favorites?.defaultMeals || []).map(buildAnchorMealLabel).filter(Boolean);
 const savedTravelMeals = (favorites?.travelMeals || []).map(buildAnchorMealLabel).filter(Boolean);
 const groceryHooks = realWorldNutrition?.groceryHooks || {};
 const weeklyFriction = String(weeklyNutritionReview?.friction?.dominantCause || weeklyNutritionReview?.friction?.topCauses?.[0]?.key || "").toLowerCase();
 const adaptationMode = String(weeklyNutritionReview?.adaptation?.mode || "").toLowerCase();
 const travelConstraint = travelMode || weeklyFriction === "travel";
 const convenienceConstraint = ["convenience", "time_pressure", "late_day"].includes(weeklyFriction) || adaptationMode === "simplify_defaults";
 const needsReset = adaptationMode === "simplify_defaults" || weeklyFriction === "convenience" || weeklyFriction === "time_pressure";
 const basketType = travelConstraint
 ? "travel_hotel_mini_fridge_basket"
 : recoveryDay
 ? "two_day_recovery_basket"
 : hardDay || strengthDay
 ? "fast_protein_carb_basket"
 : "todays_grocery_reset";
 const title = basketType === "travel_hotel_mini_fridge_basket"
 ? "Travel Hotel Mini-Fridge Basket"
 : basketType === "two_day_recovery_basket"
 ? "2-Day Recovery Basket"
 : basketType === "fast_protein_carb_basket"
 ? "Fast Protein + Carb Basket"
 : "Today's Grocery Reset";
 const summary = basketType === "travel_hotel_mini_fridge_basket"
 ? "Built for hotel, airport, or convenience-store constraints without pretending full grocery access."
 : basketType === "two_day_recovery_basket"
 ? "Keeps recovery days simple: high protein, easy hydration, and low-decision meals."
 : basketType === "fast_protein_carb_basket"
 ? "Biases easy protein and quick carbs so today's training target is easier to hit."
 : "A small reset basket to make the next 24 hours easier, not more complicated.";
 const baseBasket = buildGroceryBasket({
 store: preferredStore,
 city,
 days: basketType === "two_day_recovery_basket" ? 2 : 1,
 dayType: dayType || nutritionLayer?.dayType || NUTRITION_DAY_TYPES.runEasy,
 });

 const modeSpecificItems = basketType === "travel_hotel_mini_fridge_basket"
 ? ["Greek yogurt cups", "ready-to-drink protein shakes", "bananas", "microwave rice cups", "jerky or tuna packets", "electrolyte packets"]
 : basketType === "two_day_recovery_basket"
 ? ["Greek yogurt", "eggs", "rotisserie chicken or pre-cooked protein", "fruit", "bagged salad", "potatoes or rice", "electrolytes"]
 : basketType === "fast_protein_carb_basket"
 ? ["protein shakes", "Greek yogurt", "rice cups", "bagels", "bananas", "lean protein", "electrolytes"]
 : ["lean protein", "fruit", "rice or potatoes", "bagged salad", "Greek yogurt", "sparkling water"];
 const priorityItems = dedupeBasketItems([
 ...(groceryHooks?.priorityItems || []),
 ...modeSpecificItems,
 ]).slice(0, 8);
 const mealAnchors = dedupeBasketItems([
 savedMealAnchors.breakfast,
 savedMealAnchors.lunch,
 travelConstraint ? savedMealAnchors.travelFallback : "",
 ...(travelConstraint ? savedTravelMeals : []),
 ...savedDefaultMeals,
 ...savedSafeMeals,
 ...(groceryHooks?.carryForwardMeals || []),
 realWorldNutrition?.mealStructure?.breakfast || "",
 realWorldNutrition?.mealStructure?.lunch || "",
 ]).slice(0, 4);
 const convenienceOptions = travelConstraint
 ? [
 "Greek yogurt + fruit + protein shake",
 "Egg bites + oatmeal + banana",
 "Microwave rice cup + tuna packet + fruit",
 ]
 : hardDay || strengthDay
 ? [
 "Pre-cooked protein + rice cup + fruit",
 "Greek yogurt + bagel + banana",
 "Protein shake + wrap + electrolyte water",
 ]
 : [
 "Greek yogurt + berries + nuts",
 "Rotisserie chicken + salad kit + potato",
 "Eggs + toast + fruit",
 ];
 const locationContextLine = locationPermissionGranted
 ? `Using saved location context for examples only: ${city} / ${preferredStore}.`
 : `Using saved preferences only. Store and city examples are placeholders, not live availability.`;
 const weeklyExecutionLine = weeklyNutritionReview?.friction?.summary
 ? `Weekly pattern: ${weeklyNutritionReview.friction.summary}`
 : needsReset
 ? "Weekly pattern suggests simplifying food decisions."
 : "No strong weekly grocery friction showed up.";
 const honestyLine = travelConstraint
 ? "This is a convenience-first basket. It does not assume exact hotel, airport, or store inventory."
 : "This basket is a simple planning list, not a live inventory or price check.";
 const anchorPrompt = convenienceConstraint
 ? "Pick one breakfast anchor and one lunch anchor so the rest of the day needs fewer decisions."
 : "Use these as meal anchors, then fill the remaining meal with the same protein + carb + produce pattern.";

 return {
 title,
 basketType,
 summary,
 preferredStore,
 city,
 basket: {
 ...baseBasket,
 items: priorityItems,
 },
 mealAnchors,
 convenienceOptions,
 locationContextLine,
 weeklyExecutionLine,
 honestyLine,
 anchorPrompt,
 optionalityLine: "Optional support only. Keep today's plan first and use this helper only if it helps.",
 };
};

export const deriveFridgeCoachMealSuggestion = ({ fridgeInput, dayType = NUTRITION_DAY_TYPES.runEasy }) => {
 const raw = String(fridgeInput || "").trim().toLowerCase();
 if (!raw) {
 return { meal: "", coachLine: "Add a few fridge items first (example: eggs, rice, spinach)." };
 }
 const items = raw.split(/[,|/;\n]+/).map(x => x.trim()).filter(Boolean).slice(0, 12);
 const hasAny = (keywords) => items.find(item => keywords.some(k => item.includes(k)));

 const protein = hasAny(["chicken", "turkey", "beef", "steak", "salmon", "tuna", "fish", "egg", "yogurt", "cottage", "tofu", "tempeh", "protein"]);
 const carb = hasAny(["rice", "potato", "oat", "bread", "wrap", "tortilla", "pasta", "fruit", "banana", "berries", "quinoa", "bean"]);
 const produce = hasAny(["spinach", "broccoli", "salad", "pepper", "onion", "tomato", "vegetable", "veg", "kale", "zucchini", "carrot", "fruit", "berries", "banana", "apple"]);
 const fat = hasAny(["avocado", "olive oil", "nuts", "nut butter", "cheese", "seed"]);

 const proteinPick = protein || "eggs or Greek yogurt";
 const carbPick = carb || (isHardNutritionDayType(dayType) ? "rice or oats" : "fruit or potato");
 const producePick = produce || "any frozen or fresh vegetable";
 const fatPick = fat || "olive oil or a few nuts";
 const meal = `${proteinPick} + ${carbPick} + ${producePick} (${fatPick} optional)`;
 const coachLine = `Coach suggestion: ${meal}. Keep portions centered on your target and protein-first.`;
 return { meal, coachLine, items };
};
