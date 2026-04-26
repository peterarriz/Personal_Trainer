import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { getGoalContext, normalizeActualNutritionLog, compareNutritionPrescriptionToActual, getPlaceRecommendations, buildGroceryBasket, mergeActualNutritionLogUpdate, applyHydrationQuickAdd } from "../../modules-nutrition.js";
import { buildMacroShiftLine } from "../../prompts/coach-text.js";
import { buildWeeklyNutritionCalendarModel, mergeMealPatternHistoryFromCalendar } from "../../services/nutrition-weekly-calendar-service.js";
import { buildWeeklyNutritionGroceryModel } from "../../services/nutrition-weekly-grocery-service.js";
import { buildNutritionSurfaceModel } from "../../services/nutrition-surface-service.js";
import { buildSaveFeedbackModel, SAVE_FEEDBACK_PHASES } from "../../services/save-feedback-service.js";
import {
  isHardNutritionDayType,
  isRecoveryNutritionDayType,
  isStrengthNutritionDayType,
  normalizeNutritionDayType,
  NUTRITION_DAY_TYPES,
} from "../../services/nutrition-day-taxonomy-service.js";
import { joinDisplayParts } from "../../services/text-format-service.js";
import { StateFeedbackBanner, StateFeedbackChip } from "../../components/StateFeedbackPrimitives.jsx";

const buildLocationAwareOrderSuggestion = ({ nearby = [] }) => {
 const nameList = (nearby || []).map(n => String(n?.name || "").toLowerCase());
 if (nameList.some(n => n.includes("chipotle"))) {
 return "Nearby option: Chipotle with double chicken, fajita veggies, and black beans keeps protein high and fits today's target.";
 }
 if (nameList.some(n => n.includes("cava"))) {
 return "Nearby option: CAVA with greens + grains, double chicken, and hummus on the side keeps the meal balanced and protein-forward.";
 }
 if (nameList.some(n => n.includes("panera"))) {
 return "Nearby option: Panera with a teriyaki chicken bowl plus Greek yogurt is an easy protein-forward backup.";
 }
 return null;
};

export function NutritionTab({ planDay = null, surfaceModel = null, todayWorkout: legacyTodayWorkout, currentWeek, logs, personalization, athleteProfile = null, momentum, bodyweights, learningLayer, nutritionLayer: legacyNutritionLayer, realWorldNutrition: legacyRealWorldNutrition, nutritionActualLogs = {}, nutritionFavorites, weeklyNutritionReview = null, saveNutritionFavorites, saveNutritionActualLog, syncStateModel = null, syncSurfaceModel = null, runtime = {} }) {
 const { C, PROFILE, WEEKS, DEFAULT_NUTRITION_FAVORITES, sanitizeDisplayText, sanitizeStatusLabel, buildProvenanceText, cleanSurfaceSessionLabel, resolveCanonicalSurfaceSessionLabel, buildReviewBadgeTone, SyncStateCallout, CompactSyncStatus } = runtime;
 const todayWorkout = planDay?.resolved?.training || legacyTodayWorkout;
 const goals = athleteProfile?.goals || [];
 const nutritionLayer = planDay?.resolved?.nutrition?.prescription || legacyNutritionLayer;
 const realWorldNutrition = planDay?.resolved?.nutrition?.reality || legacyRealWorldNutrition;
 const planDayWeek = planDay?.week || null;
 const localFoodContext = personalization?.localFoodContext || {};
 const savedLocation = personalization?.connectedDevices?.location || {};
 const [localNutritionFavorites, setLocalNutritionFavorites] = useState(nutritionFavorites || {});
 const favorites = {
 ...DEFAULT_NUTRITION_FAVORITES,
 ...(localNutritionFavorites || {}),
 mealAnchors: {
 ...(DEFAULT_NUTRITION_FAVORITES?.mealAnchors || {}),
 ...(localNutritionFavorites?.mealAnchors || {}),
 },
 supplementStack: Array.isArray(localNutritionFavorites?.supplementStack) ? localNutritionFavorites.supplementStack : [],
 likedMealPatterns: {
 ...(DEFAULT_NUTRITION_FAVORITES?.likedMealPatterns || {}),
 ...(localNutritionFavorites?.likedMealPatterns || {}),
 },
 dislikedMealPatterns: {
 ...(DEFAULT_NUTRITION_FAVORITES?.dislikedMealPatterns || {}),
 ...(localNutritionFavorites?.dislikedMealPatterns || {}),
 },
 mealPatternFeedback: {
 ...(DEFAULT_NUTRITION_FAVORITES?.mealPatternFeedback || {}),
 ...(localNutritionFavorites?.mealPatternFeedback || {}),
 },
 mealPatternFeedbackMeta: {
 ...(DEFAULT_NUTRITION_FAVORITES?.mealPatternFeedbackMeta || {}),
 ...(localNutritionFavorites?.mealPatternFeedbackMeta || {}),
 },
 mealCalendarOverrides: {
 ...(DEFAULT_NUTRITION_FAVORITES?.mealCalendarOverrides || {}),
 ...(localNutritionFavorites?.mealCalendarOverrides || {}),
 },
 mealPatternHistory: Array.isArray(localNutritionFavorites?.mealPatternHistory)
 ? localNutritionFavorites.mealPatternHistory
 : Array.isArray(DEFAULT_NUTRITION_FAVORITES?.mealPatternHistory)
 ? DEFAULT_NUTRITION_FAVORITES.mealPatternHistory
 : [],
 };
 const locationPermissionGranted = Boolean(localFoodContext?.locationPermissionGranted || savedLocation?.status === "granted");
 const locationUnavailable = !locationPermissionGranted && ["denied", "unavailable"].includes(String(localFoodContext?.locationStatus || savedLocation?.status || "").toLowerCase());
 const showNearbySection = locationPermissionGranted;
 const resolvedLocationLabel = showNearbySection
 ? localFoodContext.city || localFoodContext.locationLabel || "Nearby area"
 : "";
 const hasSavedStorePreference = Boolean(localFoodContext.groceryOptions?.[0] || favorites?.groceries?.[0]?.name || favorites?.groceries?.[0]);
 const [store, setStore] = useState(localFoodContext.groceryOptions?.[0] || favorites?.groceries?.[0]?.name || favorites?.groceries?.[0] || "Saved default");
 const EMPTY_NUTRITION_CHECK = { deviationKind: "", issue: "", note: "" };
 const [nutritionCheck, setNutritionCheck] = useState(EMPTY_NUTRITION_CHECK);
 const [nutritionSavePhase, setNutritionSavePhase] = useState(SAVE_FEEDBACK_PHASES.idle);
 const [nutritionSaveDetail, setNutritionSaveDetail] = useState("");
 const [nutritionSaveError, setNutritionSaveError] = useState("");
 const [nutritionSavedAtLabel, setNutritionSavedAtLabel] = useState("");
 const [lastKey, setLastKey] = useState("");
 const [hydrationOz, setHydrationOz] = useState(0);
 const [hydrationNudgedAt, setHydrationNudgedAt] = useState(null);
 const [showHydrationNudge, setShowHydrationNudge] = useState(false);
 const [supplementTaken, setSupplementTaken] = useState({});
 const [openSupplementInfo, setOpenSupplementInfo] = useState("");
 const [newSupplementName, setNewSupplementName] = useState("");
 const [newSupplementTiming, setNewSupplementTiming] = useState("");
 const [mealFeedbackPicker, setMealFeedbackPicker] = useState({ scope: "", key: "", reason: "" });
 const [mealReusePicker, setMealReusePicker] = useState({ dateKey: "", slotKey: "", patternId: "" });
 const [mealAnchorDrafts, setMealAnchorDrafts] = useState({
 breakfast: "",
 lunch: "",
 travelFallback: "",
 emergencyOrder: "",
 });
 const goalContext = getGoalContext(goals) || { primary: null, secondary: [] };
 const dayType = normalizeNutritionDayType(nutritionLayer?.dayType || todayWorkout?.nutri || NUTRITION_DAY_TYPES.runEasy);
 const city = showNearbySection ? resolvedLocationLabel : "";
 const nearby = (showNearbySection
 ? getPlaceRecommendations({ city, dayType, favorites, mode: "nearby", query: "" })
 : [])
 .map((x, i) => ({ id: x?.id || `nearby_${i}_${x?.name || "option"}`, name: x?.name || "Nearby option", meal: x?.meal || "Protein + carbs + produce" }))
 .filter(x => x.id !== lastKey)
 .slice(0, 2);
 const locationAwareOrder = showNearbySection ? buildLocationAwareOrderSuggestion({ nearby }) : null;
 const basket = buildGroceryBasket({ store, city, days: 3, dayType });
 const fastest = nearby[0] || { name: "Saved default", meal: "Protein shake + fruit + sandwich", tag: "fallback" };
 const travelBreakfast = ["Starbucks: egg bites + oatmeal + banana", "Hotel breakfast: eggs + Greek yogurt + fruit", "Airport: wrap + extra protein + water"];
 const bodyCompActive = goals?.some(g => g.active && g.category === "body_comp");
 const strengthActive = goals?.some(g => g.active && g.category === "strength");
 const runningActive = goals?.some(g => g.active && g.category === "running");
 const hardDay = isHardNutritionDayType(dayType) || ["hard-run", "long-run"].includes(todayWorkout?.type);
 const recoveryDay = isRecoveryNutritionDayType(dayType) || todayWorkout?.type === "rest";
 const strengthDay = isStrengthNutritionDayType(dayType) || ["run+strength", "strength+prehab"].includes(todayWorkout?.type);
 const simplifiedWeek = ["drifting","falling off"].includes(momentum?.momentumState) || learningLayer?.adjustmentBias === "simplify";
 const nutritionUnavailable = !nutritionLayer || !realWorldNutrition;
 const resolvedTargets = nutritionLayer?.targets || { cal: 2500, p: 190, c: 240, f: 70 };
 const phaseMode = (nutritionLayer?.phaseMode || "maintain").toUpperCase();
 const currentPhase = planDayWeek?.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
 const todayDate = new Date();
 todayDate.setHours(0, 0, 0, 0);
 const todayKey = sanitizeDisplayText(planDay?.dateKey || todayDate.toISOString().split("T")[0]);
 const yesterday = new Date(todayDate);
 yesterday.setDate(todayDate.getDate() - 1);
 const yesterdayKey = yesterday.toISOString().split("T")[0];
 const yesterdayType = String(logs?.[yesterdayKey]?.type || "");
 const yesterdayIntensity = /(interval|tempo|long|hard|race)/i.test(yesterdayType) ? "high" : /(rest|easy|recovery)/i.test(yesterdayType) ? "low" : "moderate";
 const bw7 = (bodyweights || []).slice(-7).map(x => Number(x?.w)).filter(n => Number.isFinite(n));
 const weightTrend7day = bw7.length >= 2 ? (bw7[bw7.length - 1] - bw7[0]) : 0;
 const macroShiftLine = buildMacroShiftLine({
 yesterdayIntensity,
 todaySessionType: dayType || todayWorkout?.type || "session",
 phase: `${phaseMode}/${currentPhase}`,
 weightTrend7day,
 });
 const latestWeight = Number(bodyweights?.[bodyweights.length - 1]?.w) || Number(personalization?.profile?.weight) || PROFILE.weight || 190;
 const workoutType = todayWorkout?.type || "";
 const intensityBonus = (["hard", "long"].includes(workoutType) || isHardNutritionDayType(dayType))
 ? 30
 : (["easy", "otf", "strength"].includes(workoutType) || isStrengthNutritionDayType(dayType) || dayType === NUTRITION_DAY_TYPES.runEasy)
 ? 18
 : 8;
 const storedHydrationTargetOz = Number(nutritionLayer?.targets?.hydrationTargetOz || nutritionLayer?.hydrationTargetOz || 0) || 0;
 const inferredHydrationTargetOz = Math.max(80, Math.round((latestWeight * 0.5) + intensityBonus));
 const hydrationTargetOz = storedHydrationTargetOz || inferredHydrationTargetOz;
 const hydrationTargetLabel = storedHydrationTargetOz ? `Target ${hydrationTargetOz} oz` : `Suggested ${hydrationTargetOz} oz`;
 const hydrationPct = Math.max(0, Math.min(100, Math.round(((hydrationOz || 0) / hydrationTargetOz) * 100)));
 const savedMealAnchors = {
 breakfast: String(favorites?.mealAnchors?.breakfast || "").trim(),
 lunch: String(favorites?.mealAnchors?.lunch || "").trim(),
 travelFallback: String(favorites?.mealAnchors?.travelFallback || "").trim(),
 emergencyOrder: String(favorites?.mealAnchors?.emergencyOrder || "").trim(),
 };

 const proteinLevel = `${Math.round(resolvedTargets.p)}g`;
 const carbLevel = `${Math.round(resolvedTargets.c)}g`;
 const calorieLevel = `${Math.round(resolvedTargets.cal)} kcal`;
 const targetChangeSummary = sanitizeDisplayText(nutritionLayer?.targetChangeSummary || macroShiftLine);
 const breakfast = realWorldNutrition?.mealStructure?.breakfast || "Greek yogurt + fruit + granola";
 const lunch = realWorldNutrition?.mealStructure?.lunch || "Protein bowl with rice/potatoes + veggies";
 const dinner = realWorldNutrition?.mealStructure?.dinner || "Lean protein + carb + vegetable";
 const snack = realWorldNutrition?.mealStructure?.snack || (hardDay ? "Banana + protein shake" : "Apple + string cheese");
 const mealSlots = Array.isArray(realWorldNutrition?.mealSlots) ? realWorldNutrition.mealSlots : [];
 const dailyRecommendations = Array.isArray(realWorldNutrition?.dailyRecommendations) ? realWorldNutrition.dailyRecommendations : [];
 const whyThisToday = realWorldNutrition?.whyToday || macroShiftLine;
 const performanceGuidance = realWorldNutrition?.performanceGuidance || null;
 const adaptiveContext = realWorldNutrition?.adaptiveContext || null;
 const performanceGuidanceRows = performanceGuidance
 ? [
 { key: "day_before", label: "DAY BEFORE", line: sanitizeDisplayText(performanceGuidance.dayBefore || "") },
 { key: "day_of", label: "DAY OF", line: sanitizeDisplayText(performanceGuidance.dayOf || "") },
 { key: "during", label: "DURING", line: sanitizeDisplayText(performanceGuidance.during || "") },
 { key: "recovery", label: "RECOVERY", line: sanitizeDisplayText(performanceGuidance.recovery || "") },
 { key: "hydration", label: "HYDRATION", line: sanitizeDisplayText(performanceGuidance.hydration || "") },
 { key: "sodium", label: "SODIUM", line: sanitizeDisplayText(performanceGuidance.sodium || "") },
 ].filter((entry) => Boolean(entry.line))
 : [];
 const adaptiveContextRows = adaptiveContext
 ? [
 { key: "phase", label: adaptiveContext?.phase?.label || "Phase", line: sanitizeDisplayText(adaptiveContext?.phase?.line || "") },
 { key: "trend", label: adaptiveContext?.trend?.label || "Trend", line: sanitizeDisplayText(adaptiveContext?.trend?.line || "") },
 { key: "energy", label: adaptiveContext?.energy?.label || "Energy model", line: sanitizeDisplayText(adaptiveContext?.energy?.line || "") },
 { key: "adjustment", label: adaptiveContext?.adjustment?.label || "Adjustment", line: sanitizeDisplayText(adaptiveContext?.adjustment?.line || "") },
 ].filter((entry) => Boolean(entry.line))
 : [];
 const emergencyOrder = sanitizeDisplayText(realWorldNutrition?.emergencyOrder || savedMealAnchors.emergencyOrder || "");
 const groceryHooks = realWorldNutrition?.groceryHooks || null;
 const customSupplementStack = Array.isArray(favorites?.supplementStack) ? favorites.supplementStack : [];
 const phaseModeLower = String(nutritionLayer?.phaseMode || "maintain").toLowerCase();
 const sessionKind = String(todayWorkout?.type || dayType || "rest");
 const sessionIntensity = /hard|long|interval|tempo/.test(sessionKind) ? "hard" : /strength|otf|hybrid/.test(sessionKind) ? "moderate" : "easy";
 const nowHour = new Date().getHours();
 const inferredSessionTime = todayWorkout?.sessionTime || todayWorkout?.scheduledTime || (nowHour < 12 ? "morning" : nowHour < 18 ? "afternoon" : "evening");
 const isTravelNoSession = Boolean(nutritionLayer?.travelMode && (recoveryDay || sessionKind === "rest"));
 const directiveSentence = isTravelNoSession
 ? joinDisplayParts(["Travel day with no session", "keep it simple and hit your recovery anchors."])
 : hardDay
 ? joinDisplayParts(["Hard session today", "lead with carbs, close with protein."])
 : strengthDay
 ? joinDisplayParts(["Strength session today", "prioritize protein timing and steady carbs."])
 : recoveryDay
 ? joinDisplayParts(["Recovery day", "keep protein high and appetite decisions simple."])
 : joinDisplayParts(["Steady day", "balanced meals and consistency win."]);
 const shoppingDay = Number(favorites?.shoppingDay ?? 0);
 const todayDow = new Date().getDay();
 const showSundayGrocerySection = todayDow === shoppingDay || todayDow === ((shoppingDay + 6) % 7);
 const describeSupplementPlainText = (name = "") => {
 const lower = String(name || "").toLowerCase();
 if (lower.includes("creatine")) return "Creatine helps your muscles produce quick energy and recover between hard efforts.";
 if (lower.includes("protein")) return "Protein powder is a convenient way to close protein gaps when meals fall short.";
 if (lower.includes("electrolyte")) return "Electrolytes replace sodium and minerals lost in sweat so pacing and energy stay steadier.";
 if (lower.includes("omega")) return "Omega-3s support general recovery and joint comfort when training load builds.";
 if (lower.includes("magnesium")) return "Magnesium supports relaxation and sleep quality, which improves recovery.";
 if (lower.includes("vitamin d")) return "Vitamin D3 supports immune and bone function, especially if sun exposure is inconsistent.";
 return `${name || "This supplement"} supports consistency when food or training constraints are high.`;
 };
 const defaultSupplements = [
 { key: "Creatine", name: "Creatine", defaultTiming: "with breakfast", defaultDose: "5g", product: "Thorne Creatine Monohydrate", contexts: ["daily"] },
 { key: "Protein", name: "Protein", defaultTiming: "post-workout if food protein is low", defaultDose: "1 scoop", product: "Transparent Labs 100% Grass-Fed Whey", contexts: ["hard_day", "strength_day", "if_needed"] },
 { key: "Electrolytes", name: "Electrolytes", defaultTiming: "30 min pre-run", defaultDose: "1 serving", product: "LMNT Electrolyte Drink Mix", contexts: ["hard_day", "travel_day"] },
 { key: "Omega-3", name: "Omega-3", defaultTiming: "with lunch", defaultDose: "2 caps", product: "Nordic Naturals Ultimate Omega", contexts: ["daily"] },
 { key: "Magnesium", name: "Magnesium", defaultTiming: "before bed", defaultDose: "400mg", product: "Doctor's Best High Absorption Magnesium", contexts: ["daily", "recovery_day"] },
 { key: "Vitamin D3", name: "Vitamin D3", defaultTiming: "with first meal", defaultDose: "1 cap", product: "NOW Vitamin D3 2000 IU", contexts: ["daily"] },
 ];
 const approvedSupplementStack = customSupplementStack
 .map((supplement, idx) => ({
 key: `custom_${idx}_${String(supplement?.name || "supplement").toLowerCase().replace(/\s+/g, "_")}`,
 name: supplement?.name || "Custom Supplement",
 defaultTiming: supplement?.timing || "with a meal",
 defaultDose: supplement?.dose || "1 serving",
 product: supplement?.product || `${supplement?.name || "Brand"} (user-selected brand)`,
 contexts: Array.isArray(supplement?.contexts) ? supplement.contexts : ["daily"],
 }))
 .filter((supplement, idx, arr) => idx === arr.findIndex((candidate) => String(candidate?.name || "").toLowerCase() === String(supplement?.name || "").toLowerCase()));
 const supplementCatalog = [
 ...defaultSupplements,
 ...approvedSupplementStack,
 ].filter((supplement, idx, arr) => idx === arr.findIndex((candidate) => String(candidate?.name || "").toLowerCase() === String(supplement?.name || "").toLowerCase()));
 const supplementCatalogByName = Object.fromEntries(supplementCatalog.map((supplement) => [
 String(supplement?.name || "").toLowerCase(),
 supplement,
 ]));
 const activeSupplementItems = Array.isArray(planDay?.resolved?.supplements?.plan?.items)
 ? planDay.resolved.supplements.plan.items
 : [];
 const supplementRows = activeSupplementItems.map((item, index) => {
 const catalog = supplementCatalogByName[String(item?.name || "").toLowerCase()] || {};
 return {
 key: item?.id || `active_supplement_${index}`,
 name: item?.name || catalog.name || "Supplement",
 instruction: [item?.dose || catalog.defaultDose || "", item?.timing || catalog.defaultTiming || ""].filter(Boolean).join(" ").trim(),
 purpose: item?.purpose || catalog.purpose || "",
 product: item?.product || catalog.product || "",
 plain: describeSupplementPlainText(item?.name || catalog.name || "Supplement"),
 };
 });
 const supplementInfoByName = Object.fromEntries([
 ...supplementCatalog,
 ...supplementRows,
 ].map((supplement) => [
 supplement.name,
 {
 plain: describeSupplementPlainText(supplement.name),
 why: `Included for your active goals: ${(goals || []).filter((goal) => goal.active).map((goal) => goal.name).slice(0, 2).join(" + ") || "performance consistency"}.`,
 stop: "Reduce or pause if your clinician advises, if labs indicate no need, or if GI side effects persist for more than a week.",
 product: supplement.product ? `${supplement.product} - Amazon or brand direct.` : "Use the brand and dose you already tolerate well.",
 },
 ]));
 const mealMacroPlan = [
 { key: "breakfast", label: "Breakfast", text: breakfast, split: { p: 0.24, c: 0.27, f: 0.24 } },
 { key: "lunch", label: "Lunch", text: lunch, split: { p: 0.30, c: 0.30, f: 0.28 } },
 { key: "dinner", label: "Dinner", text: dinner, split: { p: 0.31, c: 0.28, f: 0.30 } },
 { key: "snack", label: "Optional snack", text: snack, split: { p: 0.15, c: 0.15, f: 0.18 } },
 ];
 const mealMacroRows = mealMacroPlan.map((m, idx) => {
 const p = Math.round((resolvedTargets.p || 0) * m.split.p);
 const c = Math.round((resolvedTargets.c || 0) * m.split.c);
 const f = Math.round((resolvedTargets.f || 0) * m.split.f);
 const running = mealMacroPlan.slice(0, idx + 1).reduce((acc, cur) => ({
 p: acc.p + Math.round((resolvedTargets.p || 0) * cur.split.p),
 c: acc.c + Math.round((resolvedTargets.c || 0) * cur.split.c),
 f: acc.f + Math.round((resolvedTargets.f || 0) * cur.split.f),
 }), { p: 0, c: 0, f: 0 });
 return { ...m, p, c, f, running };
 });
 const mealSlotByKey = Object.fromEntries(mealSlots.map((slot) => [slot.key, slot]));

 const nutritionLogDateOptions = Array.from({ length: 7 }, (_, offset) => {
 const nextDate = new Date(`${todayKey}T12:00:00`);
 nextDate.setDate(nextDate.getDate() - offset);
 return nextDate.toISOString().split("T")[0];
 });
 const [selectedLogDateKey, setSelectedLogDateKey] = useState(todayKey);
 const selectedLogDateOptionKey = nutritionLogDateOptions.join("|");
 const selectedLogIsToday = selectedLogDateKey === todayKey;
 const formatNutritionLogDateLabel = (dateKey = "") => {
 if (!dateKey) return "Today";
 const safeDate = new Date(`${dateKey}T12:00:00`);
 if (Number.isNaN(safeDate.getTime())) return dateKey;
 const formatted = safeDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
 return dateKey === todayKey ? `${formatted} (Today)` : formatted;
 };
 const actualNutritionToday = nutritionActualLogs?.[todayKey] || planDay?.resolved?.nutrition?.actual || normalizeActualNutritionLog({ dateKey: todayKey, feedback: {} });
 const actualNutritionForSelectedDate = nutritionActualLogs?.[selectedLogDateKey]
 || (selectedLogIsToday ? planDay?.resolved?.nutrition?.actual : null)
 || normalizeActualNutritionLog({ dateKey: selectedLogDateKey, feedback: {} });
 const selectedLogDateLabel = formatNutritionLogDateLabel(selectedLogDateKey);
 const nutritionComparison = planDay?.resolved?.nutrition?.comparison || compareNutritionPrescriptionToActual({
 nutritionPrescription: nutritionLayer,
 actualNutritionLog: actualNutritionToday,
 });
 const nutritionGoalName = goalContext?.primary?.name || "current goal";
  const currentSessionLabel = cleanSurfaceSessionLabel(todayWorkout?.label || todayWorkout?.type || dayType || "session", "session");
 const nutritionBasisLabel = planDay?.resolved?.nutrition?.prescription
 ? "stored nutrition target for today"
 : "suggested nutrition defaults for today";
 const nutritionProvenance = buildProvenanceText({
 inputs: [
 nutritionBasisLabel,
 `your current goal (${nutritionGoalName})`,
 "time of day",
 actualNutritionToday?.loggedAt ? "your logged nutrition today" : null,
 ],
 limitation: actualNutritionToday?.loggedAt ? "" : "Today's intake log is limited.",
 });
 const recoveryPrescription = planDay?.resolved?.recovery?.prescription || null;
 const supplementPlan = planDay?.resolved?.supplements?.plan || null;
  const canonicalNutritionLabel = resolveCanonicalSurfaceSessionLabel({
  sessionType: surfaceModel?.display?.sessionType || "",
  sessionLabel: surfaceModel?.display?.sessionLabel
  || currentSessionLabel
  || "Today's session",
  fallback: "Today's session",
  isHybrid: Boolean(todayWorkout?.run && todayWorkout?.strengthDuration)
  || String(todayWorkout?.type || "").toLowerCase() === "run+strength",
  });
 const canonicalNutritionReason = sanitizeDisplayText(
 surfaceModel?.canonicalReasonLine
 || surfaceModel?.preferenceAndAdaptationLine
 || nutritionProvenance
 );
 const hasStoredSupplementPlan = activeSupplementItems.length > 0;
 const showSupplementChecklist = supplementRows.length > 0;
 const supplementPrescriptionLine = hasStoredSupplementPlan
 ? `Active today: ${activeSupplementItems.slice(0, 3).map((item) => `${item.name} (${item.timing})`).join(" - ")}`
 : approvedSupplementStack.length
 ? "You have an approved supplement stack, but nothing is active for today's training and recovery context."
 : "No supplement stack is approved yet. Add only the supplements you actually use.";
 const approvedSupplementLine = approvedSupplementStack.length
 ? `${approvedSupplementStack.length} approved item${approvedSupplementStack.length === 1 ? "" : "s"} stored for contextual use.`
 : "Approved supplements are opt-in. Nothing becomes a checklist until you add it here.";
 const hydrationSupportLine = storedHydrationTargetOz
 ? recoveryPrescription?.hydrationSupport?.summary || `Stored hydration target: ${Math.round(storedHydrationTargetOz)} oz.`
 : "No explicit hydration target is stored for today. The tracker below uses a suggested baseline from bodyweight and session load.";
 const weeklyNutritionHeadline = weeklyNutritionReview?.coaching?.headline || "Your weekly food strategy gets sharper as you log real days.";
 const weeklyPlannedVsActualLine = weeklyNutritionReview?.coaching?.plannedVsActualLine || "Keep the plan separate from what actually happened so next week's guidance stays realistic.";
 const weeklyAdherenceLine = weeklyNutritionReview?.adherence?.summary || "Still learning which days feel easiest to execute.";
 const weeklyHydrationLine = weeklyNutritionReview?.hydration?.summary || "Hydration pattern is still coming into focus.";
const weeklySupplementLine = weeklyNutritionReview?.supplements?.summary || "Supplement routine is optional and still taking shape.";
const weeklyFrictionLine = weeklyNutritionReview?.friction?.summary || "No repeating meal friction has stood out yet.";
const weeklyAdaptationLine = weeklyNutritionReview?.adaptation?.summary || "Stay with the current meal structure next week.";
const weeklyTopCauses = Array.isArray(weeklyNutritionReview?.friction?.topCauses)
 ? weeklyNutritionReview.friction.topCauses.slice(0, 2)
 : [];
useEffect(() => {
if (nutritionLogDateOptions.includes(selectedLogDateKey)) return;
setSelectedLogDateKey(todayKey);
}, [todayKey, selectedLogDateKey, selectedLogDateOptionKey]);
useEffect(() => {
setNutritionSavePhase(SAVE_FEEDBACK_PHASES.idle);
setNutritionSaveDetail("");
setNutritionSaveError("");
setNutritionSavedAtLabel("");
}, [selectedLogDateKey]);
useEffect(() => {
setMealAnchorDrafts({
breakfast: savedMealAnchors.breakfast,
 lunch: savedMealAnchors.lunch,
 travelFallback: savedMealAnchors.travelFallback,
 emergencyOrder: savedMealAnchors.emergencyOrder,
 });
 }, [savedMealAnchors.breakfast, savedMealAnchors.lunch, savedMealAnchors.travelFallback, savedMealAnchors.emergencyOrder]);
 useEffect(() => {
 if (!actualNutritionForSelectedDate?.loggedAt) {
 setNutritionCheck(EMPTY_NUTRITION_CHECK);
 setHydrationOz(0);
 setHydrationNudgedAt(null);
 setSupplementTaken({});
 setShowHydrationNudge(false);
 return;
 }
 setNutritionCheck({
 deviationKind: actualNutritionForSelectedDate?.deviationKind || "",
 issue: actualNutritionForSelectedDate?.issue || "",
 note: actualNutritionForSelectedDate?.note || "",
 });
 setHydrationOz(Number(actualNutritionForSelectedDate?.hydration?.oz || 0));
 setHydrationNudgedAt(actualNutritionForSelectedDate?.hydration?.nudgedAt || null);
 setSupplementTaken(actualNutritionForSelectedDate?.supplements?.takenMap || {});
 setShowHydrationNudge(false);
 }, [
 selectedLogDateKey,
 actualNutritionForSelectedDate?.loggedAt,
 actualNutritionForSelectedDate?.deviationKind,
 actualNutritionForSelectedDate?.issue,
 actualNutritionForSelectedDate?.note,
 actualNutritionForSelectedDate?.hydration?.oz,
 actualNutritionForSelectedDate?.hydration?.nudgedAt,
 JSON.stringify(actualNutritionForSelectedDate?.supplements?.takenMap || {}),
 ]);
 useEffect(() => {
 if (!selectedLogIsToday) return;
 const hour = new Date().getHours();
 if (hour < 15 || hydrationPct >= 50 || hydrationNudgedAt || showHydrationNudge) return;
 setShowHydrationNudge(true);
 const nudgedAt = Date.now();
 setHydrationNudgedAt(nudgedAt);
 }, [hydrationPct, hydrationNudgedAt, selectedLogIsToday, showHydrationNudge, todayKey]);
const hasExplicitNutritionSignal = (payload = {}) => {
const safePayload = payload || {};
return Boolean(
String(safePayload?.deviationKind || "").trim()
 || String(safePayload?.issue || "").trim()
 || String(safePayload?.note || "").trim()
 || Number(safePayload?.hydrationOz || 0) > 0
 || Object.values(safePayload?.supplementTaken || {}).some(Boolean)
);
};
const persistNutritionFeedback = async (payload, successMessage = "Saved nutrition update.") => {
if (!hasExplicitNutritionSignal(payload)) return;
startNutritionSave("Saving your nutrition update.");
const result = await saveNutritionActualLog(selectedLogDateKey, payload);
if (!result?.ok) {
failNutritionSave("Nutrition update did not save. Try again.");
return;
}
finishNutritionSave(successMessage);
};
 const nutritionQuickLogReady = hasExplicitNutritionSignal({
 ...nutritionCheck,
 hydrationOz,
 supplementTaken,
 });
 const logHydration = async (oz = 12) => {
 const nextHydration = applyHydrationQuickAdd({
 currentOz: hydrationOz,
 targetOz: hydrationTargetOz,
 incrementOz: oz,
 });
 setHydrationOz(nextHydration.hydrationOz);
 await persistNutritionFeedback({ ...nutritionCheck, hydrationOz: nextHydration.hydrationOz, hydrationTargetOz, hydrationNudgedAt }, "Hydration saved.");
 };
 const toggleSupplementTaken = async (name) => {
 const nextTaken = { ...supplementTaken, [name]: !supplementTaken?.[name] };
 setSupplementTaken(nextTaken);
 await persistNutritionFeedback({ ...nutritionCheck, hydrationOz, hydrationTargetOz, hydrationNudgedAt, supplementTaken: nextTaken }, "Supplement update saved.");
 };
const saveMealAnchors = async () => {
const nextAnchors = {
breakfast: String(mealAnchorDrafts?.breakfast || "").trim(),
lunch: String(mealAnchorDrafts?.lunch || "").trim(),
travelFallback: String(mealAnchorDrafts?.travelFallback || "").trim(),
emergencyOrder: String(mealAnchorDrafts?.emergencyOrder || "").trim(),
};
startNutritionSave("Saving your meal anchors.");
const nextFavorites = { ...favorites, mealAnchors: nextAnchors };
const result = await saveNutritionFavorites(nextFavorites);
if (!result?.ok) {
failNutritionSave("Meal anchors did not save. Try again.");
return;
}
setLocalNutritionFavorites(nextFavorites);
finishNutritionSave("Meal anchors saved.");
};
 const getMealPatternVote = (preferenceKey = "") => {
 const safeKey = String(preferenceKey || "").trim().toLowerCase();
 if (!safeKey) return "";
 const explicitVote = String(favorites?.mealPatternFeedback?.[safeKey] || "").trim().toLowerCase();
 if (["liked", "disliked"].includes(explicitVote)) return explicitVote;
 if (favorites?.likedMealPatterns?.[safeKey]) return "liked";
 if (favorites?.dislikedMealPatterns?.[safeKey]) return "disliked";
 return "";
 };
 const getMealPatternFeedbackReason = (preferenceKey = "") => {
 const safeKey = String(preferenceKey || "").trim().toLowerCase();
 return String(favorites?.mealPatternFeedbackMeta?.[safeKey]?.reason || "").trim().toLowerCase();
 };
 const saveMealPatternVote = async (preferenceKey, vote, options = {}) => {
 const safeKey = String(preferenceKey || "").trim().toLowerCase();
 const safeVote = String(vote || "").trim().toLowerCase();
 const safeReason = String(options?.reason || "").trim().toLowerCase();
 if (!safeKey || !["liked", "disliked"].includes(safeVote)) return;
 const currentVote = getMealPatternVote(safeKey);
 const currentReason = getMealPatternFeedbackReason(safeKey);
 const applyingReasonUpdate = safeVote === "disliked" && Boolean(safeReason) && currentVote === "disliked" && safeReason !== currentReason;
 const removing = currentVote === safeVote && !applyingReasonUpdate;
 const nextLikedMealPatterns = { ...(favorites?.likedMealPatterns || {}) };
 const nextDislikedMealPatterns = { ...(favorites?.dislikedMealPatterns || {}) };
 const nextMealPatternFeedback = { ...(favorites?.mealPatternFeedback || {}) };
 const nextMealPatternFeedbackMeta = { ...(favorites?.mealPatternFeedbackMeta || {}) };
 delete nextLikedMealPatterns[safeKey];
 delete nextDislikedMealPatterns[safeKey];
 if (removing) {
 delete nextMealPatternFeedback[safeKey];
 delete nextMealPatternFeedbackMeta[safeKey];
 setMealFeedbackPicker({ scope: "", key: "", reason: "" });
 } 
 else {
 nextMealPatternFeedback[safeKey] = safeVote;
 if (safeVote === "liked") nextLikedMealPatterns[safeKey] = true;
 if (safeVote === "disliked") nextDislikedMealPatterns[safeKey] = true;
 if (safeVote === "disliked" && safeReason) {
 nextMealPatternFeedbackMeta[safeKey] = {
 vote: "disliked",
 reason: safeReason,
 updatedAt: new Date().toISOString(),
 };
 } else if (safeVote === "liked") {
 delete nextMealPatternFeedbackMeta[safeKey];
 }
 }
 startNutritionSave(removing ? "Removing meal feedback." : safeVote === "liked" ? "Saving meal like." : "Saving meal avoid.");
 const nextFavoritesBase = {
  ...favorites,
  likedMealPatterns: nextLikedMealPatterns,
  dislikedMealPatterns: nextDislikedMealPatterns,
  mealPatternFeedback: nextMealPatternFeedback,
  mealPatternFeedbackMeta: nextMealPatternFeedbackMeta,
 };
 const nextFavorites = mergeVisibleMealHistory(nextFavoritesBase);
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
  failNutritionSave("Meal feedback did not save. Try again.");
  return;
 }
 setLocalNutritionFavorites(nextFavorites);
 if (!removing && safeVote === "disliked" && !safeReason) {
 setMealFeedbackPicker({ scope: "pattern", key: safeKey, reason: getMealPatternFeedbackReason(safeKey) || "" });
 } else if (!removing) {
 setMealFeedbackPicker({ scope: "", key: "", reason: "" });
 }
 finishNutritionSave(
  removing
   ? "Meal feedback removed."
   : safeVote === "liked"
   ? "Meal moved up in the rotation."
   : "Meal moved down in the rotation."
 );
 };
 const rotateMealCalendarSlot = async (dateKey, slotKey) => {
 const safeDateKey = String(dateKey || "").trim();
 const safeSlotKey = String(slotKey || "").trim().toLowerCase();
 if (!safeDateKey || !safeSlotKey) return;
 const nextOverrides = { ...(favorites?.mealCalendarOverrides || {}) };
 const nextDateOverrides = { ...(nextOverrides?.[safeDateKey] || {}) };
 const currentSeedOffset = Math.max(0, Math.round(Number(nextDateOverrides?.[safeSlotKey]?.seedOffset || 0)));
 nextDateOverrides[safeSlotKey] = {
  mode: "pattern",
  seedOffset: currentSeedOffset + 1,
 };
 nextOverrides[safeDateKey] = nextDateOverrides;
 startNutritionSave("Rotating this meal slot.");
 const nextFavorites = mergeVisibleMealHistory({
  ...favorites,
  mealCalendarOverrides: nextOverrides,
 });
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
  failNutritionSave("Meal rotation did not save. Try again.");
  return;
 }
 setLocalNutritionFavorites(nextFavorites);
 finishNutritionSave("Weekly meal slot rotated.");
 };
 const resetMealCalendarSlot = async (dateKey, slotKey) => {
 const safeDateKey = String(dateKey || "").trim();
 const safeSlotKey = String(slotKey || "").trim().toLowerCase();
 if (!safeDateKey || !safeSlotKey) return;
 const nextOverrides = { ...(favorites?.mealCalendarOverrides || {}) };
 const nextDateOverrides = { ...(nextOverrides?.[safeDateKey] || {}) };
 delete nextDateOverrides[safeSlotKey];
 if (Object.keys(nextDateOverrides).length > 0) nextOverrides[safeDateKey] = nextDateOverrides;
 else delete nextOverrides[safeDateKey];
 startNutritionSave("Resetting this meal slot.");
 const nextFavorites = mergeVisibleMealHistory({
  ...favorites,
  mealCalendarOverrides: nextOverrides,
 });
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
  failNutritionSave("Meal reset did not save. Try again.");
  return;
 }
 setLocalNutritionFavorites(nextFavorites);
 finishNutritionSave("Meal slot reset to the default rotation.");
 };
 const resetVisibleWeekMealCalendar = async () => {
 const nextOverrides = { ...(favorites?.mealCalendarOverrides || {}) };
 (weeklyMealCalendarModel?.days || []).forEach((day) => {
  if (day?.dateKey) delete nextOverrides[day.dateKey];
 });
 startNutritionSave("Resetting this week's meal calendar.");
 const nextFavorites = mergeVisibleMealHistory({
  ...favorites,
  mealCalendarOverrides: nextOverrides,
 });
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
  failNutritionSave("Weekly meal calendar did not reset. Try again.");
  return;
 }
 setLocalNutritionFavorites(nextFavorites);
 finishNutritionSave("Weekly meal calendar reset.");
 };
 const reuseMealCalendarPattern = async (sourceMeal = null, targetDateKey = "") => {
 const safeTargetDateKey = String(targetDateKey || "").trim();
 const safeSlotKey = String(sourceMeal?.slotKey || "").trim().toLowerCase();
 const safePatternId = String(sourceMeal?.patternId || sourceMeal?.preferenceKey || "").trim().toLowerCase();
 if (!safeTargetDateKey || !safeSlotKey || !safePatternId) return;
 const nextOverrides = { ...(favorites?.mealCalendarOverrides || {}) };
 const nextDateOverrides = { ...(nextOverrides?.[safeTargetDateKey] || {}) };
 nextDateOverrides[safeSlotKey] = {
  mode: "pattern",
  seedOffset: 0,
  patternId: safePatternId,
 };
 nextOverrides[safeTargetDateKey] = nextDateOverrides;
 startNutritionSave("Reusing this meal on another day.");
 const nextFavorites = mergeVisibleMealHistory({
  ...favorites,
  mealCalendarOverrides: nextOverrides,
 });
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
  failNutritionSave("Meal reuse did not save. Try again.");
  return;
 }
 setLocalNutritionFavorites(nextFavorites);
 setMealReusePicker({ dateKey: "", slotKey: "", patternId: "" });
 finishNutritionSave("Meal reused on the selected day.");
 };
 const toggleApprovedSupplement = async (supplement) => {
 const nextName = String(supplement?.name || "").trim();
 if (!nextName) return;
 const exists = approvedSupplementStack.some((item) => String(item?.name || "").toLowerCase() === nextName.toLowerCase());
 const nextStack = exists
 ? approvedSupplementStack.filter((item) => String(item?.name || "").toLowerCase() !== nextName.toLowerCase())
 : [
 ...approvedSupplementStack,
 {
 name: supplement.name,
 timing: supplement.defaultTiming,
 dose: supplement.defaultDose,
 product: supplement.product,
 contexts: supplement.contexts || ["daily"],
 },
 ];
 startNutritionSave("Saving your approved supplements.");
 const nextFavorites = { ...favorites, supplementStack: nextStack };
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
 failNutritionSave("Supplement changes did not save. Try again.");
 return;
 }
 setLocalNutritionFavorites(nextFavorites);
 finishNutritionSave(exists ? "Supplement removed from your saved stack." : "Supplement added to your saved stack.");
 };
 const addCustomSupplement = async () => {
 if (!newSupplementName.trim() || !newSupplementTiming.trim()) return;
 const nextStack = [
 ...approvedSupplementStack,
 { name: newSupplementName.trim(), timing: newSupplementTiming.trim(), contexts: ["daily"] },
 ];
 startNutritionSave("Saving your supplement defaults.");
 const nextFavorites = { ...favorites, supplementStack: nextStack };
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
 failNutritionSave("Supplement defaults did not save. Try again.");
 return;
 }
 setLocalNutritionFavorites(nextFavorites);
 setNewSupplementName("");
 setNewSupplementTiming("");
 finishNutritionSave("Supplement defaults saved.");
 };
 const removeCustomSupplement = async (name) => {
 const nextStack = approvedSupplementStack.filter((x) => String(x?.name || "").toLowerCase() !== String(name || "").toLowerCase());
 startNutritionSave("Saving your supplement defaults.");
 const nextFavorites = { ...favorites, supplementStack: nextStack };
 const result = await saveNutritionFavorites(nextFavorites);
 if (!result?.ok) {
 failNutritionSave("Supplement defaults did not save. Try again.");
 return;
 }
 setLocalNutritionFavorites(nextFavorites);
 finishNutritionSave("Supplement defaults saved.");
 };

 const nutritionTone = buildReviewBadgeTone(nutritionComparison?.adherence || nutritionComparison?.deviationKind, C);
 const targetTone = buildReviewBadgeTone(sessionIntensity === "hard" ? "progression" : recoveryDay ? "recovery" : "match", C);
 const comparisonLabel = actualNutritionToday?.loggedAt
 ? `${sanitizeStatusLabel(nutritionComparison?.adherence, "logged")} - ${sanitizeStatusLabel(nutritionComparison?.deviationKind, "matched")}`
 : "Not logged yet";
 const complianceLine = actualNutritionToday?.loggedAt
 ? sanitizeDisplayText(nutritionComparison?.summary || "Nutrition logged.")
: "Log a quick outcome once the day settles so today's plan and what you actually ate stay clear.";
 const savedFallbackMeal = sanitizeDisplayText(
 savedMealAnchors.lunch
 || savedMealAnchors.breakfast
 || favorites?.safeMeals?.[0]?.meal
 || favorites?.safeMeals?.[0]?.name
 || favorites?.defaultMeals?.[0]?.meal
 || favorites?.defaultMeals?.[0]?.name
 || ""
 );
 const fastFallback = locationAwareOrder || (showNearbySection
 ? `${fastest.name}: ${fastest.meal}`
 : nutritionLayer?.travelMode
 ? savedMealAnchors.travelFallback || travelBreakfast[0]
 : emergencyOrder
 ? `Emergency order: ${emergencyOrder}`
 : savedFallbackMeal
 ? `Saved default: ${savedFallbackMeal}`
 : "Use your default: protein + carb + fruit + water.");
 const approvedSupplementNames = new Set(
 approvedSupplementStack.map((supplement) => String(supplement?.name || "").toLowerCase())
 );
 const approvedCustomSupplements = approvedSupplementStack.filter((supplement) => (
 !defaultSupplements.some((preset) => String(preset?.name || "").toLowerCase() === String(supplement?.name || "").toLowerCase())
 ));
 const breakfastAnchorSuggestion = sanitizeDisplayText(mealSlotByKey.breakfast?.primary || breakfast);
 const lunchAnchorSuggestion = sanitizeDisplayText(mealSlotByKey.lunch?.primary || lunch);
 const travelAnchorSuggestion = sanitizeDisplayText(
 savedMealAnchors.travelFallback
 || mealSlotByKey.breakfast?.travelSwap
 || mealSlotByKey.lunch?.travelSwap
 || travelBreakfast[0]
 );
 const emergencyOrderLine = emergencyOrder || "No emergency takeout order is saved yet.";
 const travelOrGroceryTitle = nutritionLayer?.travelMode ? "TRAVEL OPTION" : "GROCERY HOOK";
 const travelOrGroceryLine = nutritionLayer?.travelMode
 ? travelAnchorSuggestion
 : hasSavedStorePreference
 ? `${store}: ${(groceryHooks?.priorityItems || basket?.items || []).slice(0, 4).join(", ") || "lean protein, fruit, easy carbs, hydration"}`
 : `Suggested staples: ${(groceryHooks?.priorityItems || basket?.items || []).slice(0, 4).join(", ") || "lean protein, fruit, easy carbs, hydration"}`;
const nutritionSurfaceModel = buildNutritionSurfaceModel({
dayType,
todayWorkout,
nutritionLayer,
 realWorldNutrition,
 weeklyNutritionReview,
 nutritionComparison,
 hydrationOz,
 hydrationTargetOz,
fallbackMeal: fastFallback,
});
const executionPlan = nutritionSurfaceModel?.executionPlan || realWorldNutrition?.executionPlan || null;
const executionPlanSections = Array.isArray(executionPlan?.sections) ? executionPlan.sections : [];
const weeklyNutritionGroceryModel = useMemo(() => buildWeeklyNutritionGroceryModel({
planWeek: planDayWeek?.planWeek || null,
nutritionLayer,
 goalContext,
 favorites,
 momentum,
 learningLayer,
 location: city,
 }), [planDayWeek?.planWeek, nutritionLayer, goalContext, favorites, momentum, learningLayer, city]);
const weeklyMealCalendarModel = useMemo(() => buildWeeklyNutritionCalendarModel({
 planWeek: planDayWeek?.planWeek || null,
 nutritionLayer,
 goalContext,
 favorites,
 momentum,
 learningLayer,
 location: city,
 todayKey,
 }), [planDayWeek?.planWeek, nutritionLayer, goalContext, favorites, momentum, learningLayer, city, todayKey]);
const mergeVisibleMealHistory = useCallback((nextFavorites = {}, calendarModel = weeklyMealCalendarModel) => ({
 ...nextFavorites,
 mealPatternHistory: mergeMealPatternHistoryFromCalendar({
 history: nextFavorites?.mealPatternHistory || favorites?.mealPatternHistory || [],
 days: calendarModel?.days || [],
 }),
}), [favorites?.mealPatternHistory, weeklyMealCalendarModel]);
 const executionPlanMacroTargets = Array.isArray(executionPlan?.macroTargets) && executionPlan.macroTargets.length
 ? executionPlan.macroTargets
 : [
 { label: "Calories", value: calorieLevel, suffix: "" },
 { label: "Protein", value: proteinLevel, suffix: " (must hit)" },
 { label: "Carbs", value: carbLevel, suffix: "" },
 { label: "Fat", value: `${Math.round(resolvedTargets.f || 0)}g`, suffix: "" },
 ];
 const executionPlanTitle = sanitizeDisplayText(executionPlan?.title || "Today's food plan");
 const executionPlanFocusLine = sanitizeDisplayText(executionPlan?.focusLine || directiveSentence || "Simple meals, steady energy, fewer decisions.");
 const executionPlanWhyLine = sanitizeDisplayText(executionPlan?.whyLine || whyThisToday || "Meals are matched to today's training.");
 const compressNutritionCopy = (text = "", maxLen = 110) => {
 const normalized = String(text || "").replace(/\s+/g, " ").trim();
 if (!normalized) return "";
 if (normalized.length <= maxLen) return normalized;
 return `${normalized.slice(0, Math.max(0, maxLen - 1)).trim()}...`;
 };
 const compactDirectiveSentence = compressNutritionCopy(directiveSentence, 78);
 const compactNutritionReason = sanitizeDisplayText(canonicalNutritionReason || nutritionProvenance);
 const compactTargetChangeSummary = targetChangeSummary && targetChangeSummary !== canonicalNutritionReason
 ? compressNutritionCopy(targetChangeSummary, 88)
 : "";
 const compactComplianceLine = compressNutritionCopy(complianceLine, 88);
 const visiblePerformanceGuidanceRows = performanceGuidanceRows.slice(0, 3);
 const compactAdaptiveContextRows = adaptiveContextRows.slice(0, 2);
 const compactWhyThisToday = compressNutritionCopy(whyThisToday, 92);
 const compactDailyRecommendations = dailyRecommendations
 .slice(0, 2)
 .map((line) => compressNutritionCopy(line, 72))
 .filter(Boolean);
 const compactWeeklyNutritionHeadline = compressNutritionCopy(weeklyNutritionHeadline, 84);
 const compactWeeklyPlannedVsActualLine = compressNutritionCopy(weeklyPlannedVsActualLine, 88);
 const compactWeeklyFrictionLine = compressNutritionCopy(weeklyFrictionLine, 84);
 const compactHydrationSupportLine = compressNutritionCopy(hydrationSupportLine, 88);
 const compactSupplementPrescriptionLine = compressNutritionCopy(supplementPrescriptionLine, 88);
const compactApprovedSupplementLine = compressNutritionCopy(approvedSupplementLine, 88);
const compactNutritionHeroLine = compressNutritionCopy(nutritionSurfaceModel?.heroLine || compactDirectiveSentence, 112);
const compactNutritionTargetBiasLine = compressNutritionCopy(nutritionSurfaceModel?.targetBiasLine || "", 88);
const compactNutritionStrategySummary = compressNutritionCopy(nutritionSurfaceModel?.strategySummary || compactWhyThisToday, 118);
 const executionPlanObjectives = Array.isArray(executionPlan?.objectiveItems) && executionPlan.objectiveItems.length
 ? executionPlan.objectiveItems
 : [
 compactDirectiveSentence || "Stay consistent today.",
 `Hit protein (${proteinLevel})`,
 hardDay || strengthDay ? "Keep carbs visible around training." : "Keep the day low friction.",
 "No decision fatigue.",
 ].filter(Boolean).slice(0, 4);
 const executionPlanRules = Array.isArray(executionPlan?.executionRules) && executionPlan.executionRules.length
 ? executionPlan.executionRules
 : [
 hardDay || strengthDay
 ? "Eat normally today. Saving calories now usually backfires later."
 : "Keep meals normal and repeatable today.",
 recoveryDay
 ? "Recovery still needs real meals."
 : "Keep protein high and let carbs match the work.",
 nutritionLayer?.travelMode
 ? "Travel rule: protein first, carb second, sauce last."
 : "Prep tomorrow quietly before the night gets busy.",
 ].filter(Boolean).slice(0, 4);
const nutritionStrategyRows = Array.isArray(nutritionSurfaceModel?.strategyRows)
? nutritionSurfaceModel.strategyRows
: [];
const nutritionAdjustmentRows = Array.isArray(nutritionSurfaceModel?.adjustments)
 ? nutritionSurfaceModel.adjustments
 : [];
 const compactFuelingDetailSummary = compactDailyRecommendations[0]
 || compressNutritionCopy(performanceGuidance?.priorityLine || whyThisToday, 96)
 || compactDirectiveSentence;
 const compactApprovedSupplementEmptyLine = approvedSupplementStack.length
 ? "Approved stack saved."
 : "No approved supplements saved yet.";
 const startNutritionSave = (detail = "Saving your nutrition update.") => {
 setNutritionSavePhase(SAVE_FEEDBACK_PHASES.saving);
 setNutritionSaveDetail(detail);
 setNutritionSaveError("");
 };
 const finishNutritionSave = (detail = "Nutrition is up to date.") => {
 const stamp = new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
 setNutritionSavedAtLabel(stamp);
 setNutritionSaveDetail(detail);
 setNutritionSaveError("");
 setNutritionSavePhase(SAVE_FEEDBACK_PHASES.saved);
 };
 const failNutritionSave = (message = "Nutrition update did not save. Try again.") => {
 setNutritionSaveError(message);
 setNutritionSavePhase(SAVE_FEEDBACK_PHASES.error);
 };
 const nutritionSaveFeedbackModel = buildSaveFeedbackModel({
 phase: nutritionSavePhase,
 syncState: syncStateModel,
 savedAtLabel: nutritionSavedAtLabel,
 successMessage: nutritionSaveDetail,
 savingMessage: nutritionSaveDetail,
 errorMessage: nutritionSaveError,
 });
 const showNutritionQuietSyncChip = Boolean(syncSurfaceModel?.showCompactChip && syncSurfaceModel?.tone !== "healthy");

 return (
 <div className="fi" data-testid="nutrition-tab" style={{ display:"grid", gap:"0.75rem" }}>
 {syncSurfaceModel?.showFullCard && (
 <SyncStateCallout
 model={syncSurfaceModel}
 dataTestId="nutrition-sync-status"
 compact
 style={{ background:"rgba(11, 20, 32, 0.76)" }}
 />
 )}
 <div data-testid="nutrition-execution-plan-header" className="card card-soft card-action" style={{ borderColor:C.blue+"28" }}>
 <div style={{ display:"grid", gap:"0.28rem", marginBottom:"0.55rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"flex-start", flexWrap:"wrap" }}>
 <div className="sect-title" style={{ color:C.blue, marginBottom:0 }}>{executionPlanTitle.toUpperCase()}</div>
 <span className="ui-pill" style={{ color:C.blue, background:`${C.blue}12`, borderColor:`${C.blue}22` }}>
 {sanitizeDisplayText(nutritionSurfaceModel?.laneLabel || sanitizeStatusLabel(dayType, "today"))}
 </span>
 </div>
 <div style={{ display:"grid", gap:"0.12rem" }}>
 <div style={{ fontSize:"0.44rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>Focus</div>
 <div style={{ fontSize:"0.68rem", color:"#f8fafc", lineHeight:1.35 }}>{executionPlanFocusLine}</div>
 </div>
 {!!canonicalNutritionLabel && (
 <div data-testid="nutrition-canonical-session-label" style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {canonicalNutritionLabel}
 </div>
 )}
 <div style={{ display:"grid", gap:"0.12rem" }}>
 <div style={{ fontSize:"0.44rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>Why today</div>
 <div style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.5 }}>{executionPlanWhyLine}</div>
 </div>
 {!!canonicalNutritionReason && canonicalNutritionReason !== executionPlanWhyLine && (
 <div data-testid="nutrition-canonical-reason" style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {canonicalNutritionReason}
 </div>
 )}
 {!!surfaceModel?.explanationSourceLabel && (
 <div style={{ fontSize:"0.44rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 {surfaceModel.explanationSourceLabel}
 </div>
 )}
 {nutritionSaveFeedbackModel.show && (
 <StateFeedbackBanner
 model={nutritionSaveFeedbackModel}
 dataTestId="nutrition-save-status"
 compact
 />
 )}
 {showNutritionQuietSyncChip && (
 <CompactSyncStatus
 model={syncSurfaceModel}
 dataTestId="nutrition-sync-status"
 style={{
 background:"rgba(11, 20, 32, 0.32)",
 opacity:0.88,
 }}
 />
 )}
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:"0.35rem" }}>
 {executionPlanMacroTargets.map((row, index) => {
 const tone = row.label === "Protein" ? C.red : row.label === "Carbs" ? C.green : row.label === "Calories" ? C.amber : "#dbe7f6";
 return (
 <div key={`${row.label}_${index}`} style={{ border:"1px solid #22324a", borderRadius:10, background:"#0f172a", padding:"0.5rem 0.55rem" }}>
 <div style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em" }}>{sanitizeDisplayText(row.label)}</div>
 <div style={{ fontSize:"0.62rem", color:tone, marginTop:"0.12rem" }}>
 {sanitizeDisplayText(`${row.value || ""}${row.suffix || ""}`)}
 </div>
 </div>
 );
 })}
 </div>
 <div data-testid="nutrition-plan-objectives" style={{ display:"grid", gap:"0.16rem", marginTop:"0.46rem" }}>
 <div style={{ fontSize:"0.44rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>Objective</div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.28rem" }}>
 {executionPlanObjectives.map((item, index) => (
 <div key={`nutrition_objective_${index}`} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0b1321", padding:"0.46rem 0.52rem", fontSize:"0.52rem", color:"#dbe7f6", lineHeight:1.45 }}>
 {sanitizeDisplayText(item)}
 </div>
 ))}
 </div>
 </div>
 <div style={{ display:"flex", gap:"0.28rem", flexWrap:"wrap", marginTop:"0.42rem" }}>
 <span className="ui-pill" style={{ color:nutritionTone.color, background:nutritionTone.bg, borderColor:"transparent" }}>
 {comparisonLabel}
 </span>
 </div>
 <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.45, marginTop:"0.45rem" }}>
 {compactComplianceLine}
 </div>
 </div>

<div data-testid="nutrition-execution-plan-meals" className="card card-subtle" style={{ borderColor:C.amber+"28" }}>
<div style={{ display:"grid", gap:"0.18rem", marginBottom:"0.45rem" }}>
<div className="sect-title" style={{ color:C.amber, marginBottom:0 }}>TODAY'S MEALS</div>
 <div style={{ fontSize:"0.58rem", color:"#f8fafc", lineHeight:1.45 }}>{compactNutritionStrategySummary}</div>
</div>
<div style={{ display:"grid", gap:"0.4rem" }}>
{executionPlanSections.map((section, sectionIndex) => {
const sectionPreferenceKey = String(section.preferenceKey || "").trim().toLowerCase();
const sectionCanVote = section.sourceType !== "anchor" && Boolean(sectionPreferenceKey);
const sectionVote = sectionCanVote ? getMealPatternVote(sectionPreferenceKey) : "";
const sectionLiked = sectionVote === "liked";
const sectionDisliked = sectionVote === "disliked";
const sectionReason = sectionCanVote ? getMealPatternFeedbackReason(sectionPreferenceKey) : "";
const showSectionReasonPicker = sectionCanVote && (sectionDisliked || mealFeedbackPicker.key === sectionPreferenceKey);
return (
<div key={section.key || `execution_meal_${sectionIndex}`} style={{ border:"1px solid #22324a", borderRadius:14, background:"#0f172a", padding:"0.72rem 0.8rem", display:"grid", gap:"0.32rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.45rem", alignItems:"flex-start", flexWrap:"wrap" }}>
 <div style={{ display:"grid", gap:"0.08rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>{sanitizeDisplayText(section.label || "Meal")}</div>
 <div style={{ fontSize:"0.68rem", color:"#f8fafc", lineHeight:1.35, fontWeight:600 }}>{sanitizeDisplayText(section.title || "Meal build")}</div>
 {!!section.targetLine && (
 <div style={{ fontSize:"0.5rem", color:"#9fb2d2", lineHeight:1.45 }}>{sanitizeDisplayText(section.targetLine)}</div>
 )}
 </div>
 {!!sectionCanVote && (
 <div style={{ display:"flex", gap:"0.22rem", flexWrap:"wrap" }}>
 <button
 data-testid={`nutrition-like-meal-${section.key || sectionIndex}`}
 className="btn"
 onClick={()=>saveMealPatternVote(sectionPreferenceKey, "liked")}
 style={{
 fontSize:"0.48rem",
 borderColor:sectionLiked ? C.green : "#2a3b56",
 color:sectionLiked ? C.green : "#dbe7f6",
 background:sectionLiked ? `${C.green}12` : "transparent",
 }}
 >
 {sectionLiked ? "Liked" : "Thumbs up"}
 </button>
 <button
 data-testid={`nutrition-dislike-meal-${section.key || sectionIndex}`}
 className="btn"
 onClick={()=>{
 if (sectionDisliked) {
 saveMealPatternVote(sectionPreferenceKey, "disliked");
 return;
 }
 setMealFeedbackPicker({ scope: "pattern", key: sectionPreferenceKey, reason: sectionReason || "" });
 }}
 style={{
 fontSize:"0.48rem",
 borderColor:sectionDisliked ? C.red : "#2a3b56",
 color:sectionDisliked ? C.red : "#dbe7f6",
 background:sectionDisliked ? `${C.red}12` : "transparent",
 }}
 >
 {sectionDisliked ? "Avoiding" : "Thumbs down"}
 </button>
 </div>
 )}
 </div>
 {!!showSectionReasonPicker && (
 <div style={{ display:"grid", gap:"0.18rem" }}>
 <div style={{ fontSize:"0.44rem", color:"#8fa5c8", letterSpacing:"0.08em", textTransform:"uppercase" }}>Tune this down because</div>
 <div style={{ display:"flex", gap:"0.22rem", flexWrap:"wrap" }}>
 {[
 { key:"too_expensive", label:"Too expensive" },
 { key:"too_much_prep", label:"Too much prep" },
 { key:"not_for_me", label:"Not for me" },
 { key:"too_often", label:"Too often" },
 ].map((reasonOption) => {
 const activeReason = sectionReason === reasonOption.key;
 return (
 <button
 key={`${sectionPreferenceKey}_${reasonOption.key}`}
 type="button"
 className="btn"
 data-testid={`nutrition-meal-reason-${section.key || sectionIndex}-${reasonOption.key}`}
 onClick={()=>saveMealPatternVote(sectionPreferenceKey, "disliked", { reason: reasonOption.key })}
 style={{
 fontSize:"0.45rem",
 borderColor:activeReason ? C.red : "#2a3b56",
 color:activeReason ? C.red : "#cfe0f4",
 background:activeReason ? `${C.red}12` : "transparent",
 }}
 >
 {reasonOption.label}
 </button>
 );
 })}
 </div>
 </div>
 )}
 {!!section.buildItems?.length && (
 <div style={{ display:"grid", gap:"0.14rem", marginTop:"0.08rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#8fa5c8", letterSpacing:"0.08em", textTransform:"uppercase" }}>{sanitizeDisplayText(section.buildHeading || "Build")}</div>
 {section.buildItems.slice(0, 4).map((item, itemIndex) => (
 <div key={`${section.key || sectionIndex}_build_${itemIndex}`} style={{ fontSize:"0.56rem", color:"#dbe7f6", lineHeight:1.5 }}>
 {itemIndex + 1}. {sanitizeDisplayText(item)}
 </div>
 ))}
 </div>
 )}
 {!!section.detailLine && (
 <div style={{ display:"grid", gap:"0.08rem", marginTop:"0.08rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.45 }}>{sanitizeDisplayText(section.detailLine)}</div>
 </div>
 )}
 {!!section.recipeCard && (
 <details data-testid={`nutrition-meal-recipe-${section.key || sectionIndex}`} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0b1321", padding:"0.5rem 0.56rem" }}>
 <summary style={{ cursor:"pointer", fontSize:"0.5rem", color:"#dbe7f6" }}>Recipe + prep</summary>
 <div style={{ display:"grid", gap:"0.32rem", marginTop:"0.38rem" }}>
 {!!section.recipeCard.summary && (
 <div style={{ fontSize:"0.5rem", color:"#cfe0f4", lineHeight:1.5 }}>
 {sanitizeDisplayText(section.recipeCard.summary)}
 </div>
 )}
 {!!section.recipeCard.metaItems?.length && (
 <div style={{ display:"flex", gap:"0.26rem", flexWrap:"wrap" }}>
 {section.recipeCard.metaItems.map((item, itemIndex) => (
 <span
 key={`${section.key || sectionIndex}_recipe_meta_${itemIndex}`}
 className="ui-pill"
 style={{ color:"#dbe7f6", background:"rgba(15, 23, 42, 0.76)", borderColor:"#22324a" }}
 >
 {sanitizeDisplayText(`${item.label}: ${item.value}`)}
 </span>
 ))}
 </div>
 )}
 {!!section.recipeCard.ingredientItems?.length && (
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.43rem", color:"#8fa5c8", letterSpacing:"0.08em", textTransform:"uppercase" }}>Ingredients</div>
 {section.recipeCard.ingredientItems.map((item, itemIndex) => (
 <div key={`${section.key || sectionIndex}_recipe_ingredient_${itemIndex}`} style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.5 }}>
 {itemIndex + 1}. {sanitizeDisplayText(item)}
 </div>
 ))}
 </div>
 )}
 {!!section.recipeCard.groceryItems?.length && (
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.43rem", color:"#8fa5c8", letterSpacing:"0.08em", textTransform:"uppercase" }}>Pull for the week</div>
 <div style={{ display:"flex", gap:"0.24rem", flexWrap:"wrap" }}>
 {section.recipeCard.groceryItems.map((item, itemIndex) => (
 <span
 key={`${section.key || sectionIndex}_recipe_grocery_${itemIndex}`}
 className="ui-pill"
 style={{ color:"#dbe7f6", background:"rgba(15, 23, 42, 0.76)", borderColor:"#22324a" }}
 >
 {sanitizeDisplayText(item)}
 </span>
 ))}
 </div>
 </div>
 )}
 {!!section.recipeCard.steps?.length && (
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.43rem", color:"#8fa5c8", letterSpacing:"0.08em", textTransform:"uppercase" }}>Method</div>
 {section.recipeCard.steps.map((step, stepIndex) => (
 <div key={`${section.key || sectionIndex}_recipe_${stepIndex}`} style={{ fontSize:"0.5rem", color:"#cfe0f4", lineHeight:1.5 }}>
 {stepIndex + 1}. {sanitizeDisplayText(step)}
 </div>
 ))}
 </div>
 )}
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.28rem" }}>
 {!!section.recipeCard.coachCue && (
 <div style={{ border:"1px solid #1e293b", borderRadius:12, background:"#0f172a", padding:"0.46rem 0.52rem", display:"grid", gap:"0.12rem" }}>
 <div style={{ fontSize:"0.42rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>Coach cue</div>
 <div style={{ fontSize:"0.49rem", color:"#dbe7f6", lineHeight:1.45 }}>{sanitizeDisplayText(section.recipeCard.coachCue)}</div>
 </div>
 )}
 {!!section.recipeCard.prepLine && (
 <div style={{ border:"1px solid #1e293b", borderRadius:12, background:"#0f172a", padding:"0.46rem 0.52rem", display:"grid", gap:"0.12rem" }}>
 <div style={{ fontSize:"0.42rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>Make-ahead</div>
 <div style={{ fontSize:"0.49rem", color:"#dbe7f6", lineHeight:1.45 }}>{sanitizeDisplayText(section.recipeCard.prepLine)}</div>
 </div>
 )}
 {!!section.recipeCard.fallbackLine && (
 <div style={{ border:"1px solid #1e293b", borderRadius:12, background:"#0f172a", padding:"0.46rem 0.52rem", display:"grid", gap:"0.12rem" }}>
 <div style={{ fontSize:"0.42rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>Backup</div>
 <div style={{ fontSize:"0.49rem", color:"#dbe7f6", lineHeight:1.45 }}>{sanitizeDisplayText(section.recipeCard.fallbackLine)}</div>
 </div>
 )}
 </div>
 {!!section.recipeCard.finishLine && (
 <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {sanitizeDisplayText(section.recipeCard.finishLine)}
 </div>
 )}
 {!!section.recipeCard.upgradeIdeas?.length && (
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.43rem", color:"#8fa5c8", letterSpacing:"0.08em", textTransform:"uppercase" }}>Upgrade ideas</div>
 {section.recipeCard.upgradeIdeas.map((tip, tipIndex) => (
 <div key={`${section.key || sectionIndex}_tip_${tipIndex}`} style={{ fontSize:"0.5rem", color:"#cfe0f4", lineHeight:1.5 }}>
 {tipIndex + 1}. {sanitizeDisplayText(tip)}
 </div>
 ))}
 </div>
 )}
 </div>
 </details>
 )}
 </div>
);
})}
{!executionPlanSections.length && (
<div style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.62rem 0.7rem", fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.45 }}>
 {compactFuelingDetailSummary}
 </div>
)}
</div>
</div>

 <div data-testid="nutrition-execution-rules" className="card card-subtle" style={{ borderColor:C.blue+"24" }}>
 <div style={{ display:"grid", gap:"0.18rem" }}>
 <div className="sect-title" style={{ color:C.blue, marginBottom:0 }}>HOW TO USE IT</div>
 {executionPlanRules.map((rule, index) => (
 <div key={`nutrition_rule_${index}`} style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.5 }}>
 {index + 1}. {sanitizeDisplayText(rule)}
 </div>
 ))}
 </div>
 </div>

 {weeklyMealCalendarModel && (
 <div data-testid="nutrition-weekly-meal-calendar" className="card card-subtle" style={{ borderColor:C.blue+"26" }}>
 <div style={{ display:"grid", gap:"0.18rem", marginBottom:"0.45rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", flexWrap:"wrap", alignItems:"flex-start" }}>
 <div style={{ display:"grid", gap:"0.12rem" }}>
 <div className="sect-title" style={{ color:C.blue, marginBottom:0 }}>WEEKLY MEAL CALENDAR</div>
 <div style={{ fontSize:"0.56rem", color:"#dbe7f6", lineHeight:1.5 }}>{sanitizeDisplayText(weeklyMealCalendarModel.summary)}</div>
 </div>
 <div style={{ display:"flex", gap:"0.26rem", flexWrap:"wrap", alignItems:"center" }}>
 <span className="ui-pill" style={{ color:C.blue, background:`${C.blue}12`, borderColor:`${C.blue}22` }}>
 {sanitizeDisplayText(weeklyMealCalendarModel.weekLabel || "This week")}
 </span>
 {weeklyMealCalendarModel.overrideCount > 0 && (
 <button
 data-testid="nutrition-weekly-calendar-reset"
 className="btn"
 onClick={resetVisibleWeekMealCalendar}
 style={{ fontSize:"0.48rem", borderColor:"#2a3b56", color:"#dbe7f6" }}
 >
 Reset week
 </button>
 )}
 </div>
 </div>
 <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.45 }}>
 Rotate any slot that looks stale. The grocery list below follows this calendar.
 </div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:"0.42rem" }}>
 {weeklyMealCalendarModel.days.map((day) => (
 <div
 key={day.dateKey}
 data-testid={`nutrition-meal-calendar-day-${day.dateKey}`}
 style={{
 border:"1px solid #22324a",
 borderRadius:14,
 background:day.isToday ? "linear-gradient(180deg, rgba(15,23,42,0.98), rgba(11,19,33,0.94))" : "#0f172a",
 padding:"0.62rem 0.68rem",
 display:"grid",
 gap:"0.32rem",
 }}
 >
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.3rem", alignItems:"baseline", flexWrap:"wrap" }}>
 <div style={{ display:"grid", gap:"0.08rem" }}>
 <div style={{ fontSize:"0.47rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 {sanitizeDisplayText(day.dayLabel)}{day.isToday ? " - Today" : ""}
 </div>
 <div style={{ fontSize:"0.58rem", color:"#f8fafc", lineHeight:1.4 }}>{sanitizeDisplayText(day.sessionLabel)}</div>
 </div>
 {day.hasSavedOverrides && (
 <span className="ui-pill" style={{ color:C.amber, background:`${C.amber}12`, borderColor:`${C.amber}22` }}>
 Edited
 </span>
 )}
 </div>
 <div style={{ display:"grid", gap:"0.26rem" }}>
 {day.meals.map((meal) => {
 const mealVote = meal.preferenceKey ? getMealPatternVote(meal.preferenceKey) : "";
 const mealLiked = mealVote === "liked";
 const mealDisliked = mealVote === "disliked";
 const mealReason = meal.preferenceKey ? getMealPatternFeedbackReason(meal.preferenceKey) : "";
 const showMealReasonPicker = Boolean(meal.preferenceKey) && (mealDisliked || mealFeedbackPicker.key === meal.preferenceKey);
 const showReusePicker = mealReusePicker.dateKey === day.dateKey && mealReusePicker.slotKey === meal.slotKey && mealReusePicker.patternId === meal.patternId;
 return (
 <div
 key={`${day.dateKey}_${meal.slotKey}`}
 data-testid={`nutrition-meal-calendar-slot-${day.dateKey}-${meal.slotKey}`}
 style={{ border:"1px solid #1e293b", borderRadius:12, background:"#0b1321", padding:"0.48rem 0.54rem", display:"grid", gap:"0.18rem" }}
 >
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.3rem", alignItems:"baseline", flexWrap:"wrap" }}>
 <div style={{ fontSize:"0.44rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>
 {sanitizeDisplayText(meal.label)}
 </div>
 <div style={{ display:"flex", gap:"0.2rem", flexWrap:"wrap", alignItems:"center" }}>
 {meal.sourceType === "anchor" && (
 <span className="ui-pill" style={{ color:"#8fa5c8", background:"rgba(30,41,59,0.6)", borderColor:"#22324a" }}>
 Saved anchor
 </span>
 )}
 {meal.hasOverride && (
 <span className="ui-pill" style={{ color:C.amber, background:`${C.amber}12`, borderColor:`${C.amber}22` }}>
 Rotated
 </span>
 )}
 </div>
 </div>
 <div style={{ fontSize:"0.56rem", color:"#f8fafc", lineHeight:1.42 }}>{sanitizeDisplayText(meal.title)}</div>
 {!!meal.targetLine && (
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.42 }}>{sanitizeDisplayText(meal.targetLine)}</div>
 )}
 {!!meal.buildPreview?.length && (
 <div style={{ fontSize:"0.48rem", color:"#cfe0f4", lineHeight:1.42 }}>
 {meal.buildPreview.map((item) => sanitizeDisplayText(item)).join(" • ")}
 </div>
 )}
 <div style={{ display:"flex", gap:"0.2rem", flexWrap:"wrap" }}>
 {!!meal.preferenceKey && meal.sourceType !== "anchor" && (
 <>
 <button
 data-testid={`nutrition-calendar-like-${day.dateKey}-${meal.slotKey}`}
 className="btn"
 onClick={()=>saveMealPatternVote(meal.preferenceKey, "liked")}
 style={{
 fontSize:"0.46rem",
 borderColor:mealLiked ? C.green : "#2a3b56",
 color:mealLiked ? C.green : "#dbe7f6",
 background:mealLiked ? `${C.green}12` : "transparent",
 }}
 >
 {mealLiked ? "Liked" : "Like"}
 </button>
 <button
 data-testid={`nutrition-calendar-dislike-${day.dateKey}-${meal.slotKey}`}
 className="btn"
 onClick={()=>{
 if (mealDisliked) {
 saveMealPatternVote(meal.preferenceKey, "disliked");
 return;
 }
 setMealFeedbackPicker({ scope: "pattern", key: meal.preferenceKey, reason: mealReason || "" });
 }}
 style={{
 fontSize:"0.46rem",
 borderColor:mealDisliked ? C.red : "#2a3b56",
 color:mealDisliked ? C.red : "#dbe7f6",
 background:mealDisliked ? `${C.red}12` : "transparent",
 }}
 >
 {mealDisliked ? "Avoiding" : "Avoid"}
 </button>
 </>
 )}
 {!!meal.patternId && meal.sourceType === "pattern" && (
 <button
 data-testid={`nutrition-meal-calendar-reuse-${day.dateKey}-${meal.slotKey}`}
 className="btn"
 onClick={()=>setMealReusePicker((current) => current.dateKey === day.dateKey && current.slotKey === meal.slotKey && current.patternId === meal.patternId ? { dateKey: "", slotKey: "", patternId: "" } : { dateKey: day.dateKey, slotKey: meal.slotKey, patternId: meal.patternId })}
 style={{ fontSize:"0.46rem", borderColor:"#2a3b56", color:"#dbe7f6" }}
 >
 Reuse
 </button>
 )}
 <button
 data-testid={`nutrition-meal-calendar-rotate-${day.dateKey}-${meal.slotKey}`}
 className="btn"
 onClick={()=>rotateMealCalendarSlot(day.dateKey, meal.slotKey)}
 style={{ fontSize:"0.46rem", borderColor:"#2a3b56", color:"#dbe7f6" }}
 >
 Rotate
 </button>
 {meal.hasOverride && (
 <button
 data-testid={`nutrition-meal-calendar-reset-${day.dateKey}-${meal.slotKey}`}
 className="btn"
 onClick={()=>resetMealCalendarSlot(day.dateKey, meal.slotKey)}
 style={{ fontSize:"0.46rem", borderColor:"#2a3b56", color:"#dbe7f6" }}
 >
 Reset
 </button>
 )}
 </div>
 {!!showMealReasonPicker && (
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.42rem", color:"#8fa5c8", letterSpacing:"0.08em", textTransform:"uppercase" }}>Why dial this down</div>
 <div style={{ display:"flex", gap:"0.18rem", flexWrap:"wrap" }}>
 {[
 { key:"too_expensive", label:"Too expensive" },
 { key:"too_much_prep", label:"Too much prep" },
 { key:"not_for_me", label:"Not for me" },
 { key:"too_often", label:"Too often" },
 ].map((reasonOption) => {
 const activeReason = mealReason === reasonOption.key;
 return (
 <button
 key={`${meal.preferenceKey}_${reasonOption.key}`}
 type="button"
 className="btn"
 data-testid={`nutrition-calendar-reason-${day.dateKey}-${meal.slotKey}-${reasonOption.key}`}
 onClick={()=>saveMealPatternVote(meal.preferenceKey, "disliked", { reason: reasonOption.key })}
 style={{
 fontSize:"0.44rem",
 borderColor:activeReason ? C.red : "#2a3b56",
 color:activeReason ? C.red : "#cfe0f4",
 background:activeReason ? `${C.red}12` : "transparent",
 }}
 >
 {reasonOption.label}
 </button>
 );
 })}
 </div>
 </div>
 )}
 {!!showReusePicker && (
 <div style={{ display:"grid", gap:"0.16rem" }}>
 <div style={{ fontSize:"0.42rem", color:"#8fa5c8", letterSpacing:"0.08em", textTransform:"uppercase" }}>Reuse on</div>
 <div style={{ display:"flex", gap:"0.18rem", flexWrap:"wrap" }}>
 {weeklyMealCalendarModel.days
 .filter((targetDay) => targetDay.dateKey !== day.dateKey)
 .map((targetDay) => (
 <button
 key={`${meal.patternId}_${targetDay.dateKey}`}
 type="button"
 className="btn"
 data-testid={`nutrition-meal-calendar-reuse-target-${day.dateKey}-${meal.slotKey}-${targetDay.dateKey}`}
 onClick={()=>reuseMealCalendarPattern(meal, targetDay.dateKey)}
 style={{ fontSize:"0.44rem", borderColor:"#2a3b56", color:"#dbe7f6" }}
 >
 {sanitizeDisplayText(targetDay.dayLabel)}
 </button>
 ))}
 </div>
 </div>
 )}
 </div>
 );
 })}
 </div>
 </div>
 ))}
 </div>
 </div>
 )}

 {weeklyNutritionGroceryModel && (
 <div data-testid="nutrition-weekly-grocery-list" className="card card-subtle" style={{ borderColor:C.green+"28" }}>
 <div style={{ display:"grid", gap:"0.18rem", marginBottom:"0.45rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", flexWrap:"wrap", alignItems:"flex-start" }}>
 <div className="sect-title" style={{ color:C.green, marginBottom:0 }}>WEEK + GROCERIES</div>
 <span className="ui-pill" style={{ color:C.green, background:`${C.green}12`, borderColor:`${C.green}22` }}>
 {sanitizeDisplayText(weeklyNutritionGroceryModel.weekLabel || "This week")}
 </span>
 </div>
 <div style={{ fontSize:"0.56rem", color:"#dbe7f6", lineHeight:1.5 }}>{sanitizeDisplayText(weeklyNutritionGroceryModel.summary)}</div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))", gap:"0.4rem" }}>
 {weeklyNutritionGroceryModel.groups.map((group) => (
 <div key={group.key} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.56rem 0.62rem", display:"grid", gap:"0.18rem" }}>
 <div style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>{sanitizeDisplayText(group.label)}</div>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 {group.items.map((item) => (
 <div key={`${group.key}_${item.name}`} style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"baseline" }}>
 <div style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.4 }}>{sanitizeDisplayText(item.name)}</div>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8", whiteSpace:"nowrap" }}>x{item.count}</div>
 </div>
 ))}
 </div>
 </div>
 ))}
 </div>
 {weeklyNutritionGroceryModel.prepNotes?.length > 0 && (
 <div style={{ marginTop:"0.42rem", border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.56rem 0.62rem", display:"grid", gap:"0.18rem" }}>
 <div style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em", textTransform:"uppercase" }}>Batch prep</div>
 {weeklyNutritionGroceryModel.prepNotes.map((note, index) => (
 <div key={`weekly_grocery_prep_${index}`} style={{ fontSize:"0.53rem", color:"#dbe7f6", lineHeight:1.45 }}>
 {index + 1}. {sanitizeDisplayText(note)}
 </div>
 ))}
 </div>
 )}
 {!!weeklyNutritionGroceryModel.dailyPlans?.length && (
 <details style={{ marginTop:"0.42rem" }}>
 <summary style={{ cursor:"pointer", fontSize:"0.53rem", color:"#8fa5c8" }}>See the generated week behind this list</summary>
 <div style={{ display:"grid", gap:"0.28rem", marginTop:"0.45rem" }}>
 {weeklyNutritionGroceryModel.dailyPlans.map((day) => (
 <div key={day.dateKey} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.5rem 0.56rem", display:"grid", gap:"0.12rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"baseline", flexWrap:"wrap" }}>
 <div style={{ fontSize:"0.53rem", color:"#f8fafc" }}>{sanitizeDisplayText(day.dayLabel)}</div>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8" }}>{sanitizeDisplayText(day.sessionLabel)}</div>
 </div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>
 {day.meals.map((meal, index) => `${index + 1}. ${sanitizeDisplayText(meal)}`).join("   ")}
 </div>
 </div>
 ))}
 </div>
 </details>
 )}
 </div>
 )}

 <div data-testid="nutrition-quick-log" className="card card-action" style={{ borderColor:C.green+"30", background:"#0d1410" }}>
 <div style={{ display:"grid", gap:"0.18rem", marginBottom:"0.45rem" }}>
 <div className="sect-title" style={{ color:C.green, marginBottom:0 }}>LOG FOOD</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {selectedLogIsToday
 ? "Save the day in a few taps."
 : "Log a recent day."}
 </div>
 </div>
 <div style={{ display:"grid", gap:"0.35rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.4rem", flexWrap:"wrap", alignItems:"end" }}>
 <div data-testid="nutrition-log-date-label" style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>
 For {selectedLogDateLabel}.
 </div>
 <label style={{ display:"grid", gap:"0.14rem", minWidth:180 }}>
 <span style={{ fontSize:"0.44rem", color:"#64748b", letterSpacing:"0.08em" }}>LOG DAY</span>
 <select data-testid="nutrition-log-date-select" value={selectedLogDateKey} onChange={(e)=>setSelectedLogDateKey(e.target.value)} style={{ fontSize:"0.54rem" }}>
 {nutritionLogDateOptions.map((dateKey) => (
 <option key={dateKey} value={dateKey}>{formatNutritionLogDateLabel(dateKey)}</option>
 ))}
 </select>
 </label>
 </div>
 <div style={{ display:"grid", gap:"0.18rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.45 }}>How did the day compare with the plan?</div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:"0.3rem" }}>
 {[["followed","Followed plan"],["under_fueled","Under-fueled"],["over_indulged","Ate more than planned"],["deviated","Different than plan"]].map(([key, label]) => (
 <button key={key} className={`btn ${nutritionCheck.deviationKind===key ? "btn-selected" : ""}`} onClick={()=>setNutritionCheck((current)=>({ ...current, deviationKind:key, issue:key === "followed" ? "" : current.issue }))} style={{ fontSize:"0.54rem", borderColor:nutritionCheck.deviationKind===key?C.green:"#1e293b", color:nutritionCheck.deviationKind===key?C.green:"#64748b", background:nutritionCheck.deviationKind===key?`${C.green}12`:"transparent" }}>
 {label}
 </button>
 ))}
 </div>
 </div>
 <div style={{ display:"grid", gap:"0.18rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.45 }}>Main friction, if anything</div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(110px,1fr))", gap:"0.3rem" }}>
 {[["","None"],["hunger","Hunger"],["convenience","Convenience"],["travel","Travel"]].map(([key, label]) => (
 <button key={label} className={`btn ${(nutritionCheck.issue||"")===key ? "btn-selected" : ""}`} onClick={()=>setNutritionCheck((current)=>({ ...current, issue:key }))} style={{ fontSize:"0.54rem", borderColor:(nutritionCheck.issue||"")===key?C.blue:"#1e293b", color:(nutritionCheck.issue||"")===key?C.blue:"#64748b", background:(nutritionCheck.issue||"")===key?`${C.blue}12`:"transparent" }}>
 {label}
 </button>
 ))}
 </div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.35rem", alignItems:"start" }}>
 <input value={nutritionCheck.note || ""} onChange={e=>setNutritionCheck((current)=>({ ...current, note:e.target.value }))} placeholder="Quick note (optional)" />
 <button data-testid="nutrition-save-quick" className="btn btn-primary" disabled={!nutritionQuickLogReady} onClick={()=>persistNutritionFeedback({ ...nutritionCheck, hydrationOz, hydrationTargetOz, hydrationNudgedAt, supplementTaken }, actualNutritionForSelectedDate?.loggedAt ? `Nutrition log updated for ${selectedLogDateLabel}.` : `Nutrition log saved for ${selectedLogDateLabel}.`)} style={{ fontSize:"0.52rem", opacity:nutritionQuickLogReady ? 1 : 0.5, width:"fit-content" }}>
 Save
 </button>
 </div>
 </div>
 </div>

 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.75rem" }}>
 <div className="card card-subtle" style={{ borderColor:C.blue+"24" }}>
 <div style={{ display:"grid", gap:"0.18rem", marginBottom:"0.4rem" }}>
 <div className="sect-title" style={{ color:C.blue, marginBottom:0 }}>HYDRATION</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.45 }}>{compactHydrationSupportLine}</div>
 </div>
 <button className="btn" onClick={()=>logHydration(12)} style={{ width:"100%", display:"block", textAlign:"left", borderColor:"#2a3b56", padding:"0.42rem 0.46rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.56rem", color:"#dbe7f6", marginBottom:"0.22rem" }}>
 <span>{Math.round(hydrationOz)} oz logged</span>
 <span style={{ color:"#8fa5c8" }}>{hydrationTargetLabel}</span>
 </div>
 <div style={{ width:"100%", height:10, borderRadius:999, background:"#0f172a", border:"1px solid #243752", overflow:"hidden" }}>
 <div style={{ width:`${hydrationPct}%`, height:"100%", background: hydrationPct >= 100 ? C.green : C.blue, transition:"width 180ms ease" }} />
 </div>
 <div style={{ marginTop:"0.2rem", fontSize:"0.5rem", color:"#8fa5c8" }}>Tap to add 12 oz</div>
 </button>
 </div>

 <div className="card card-subtle" style={{ borderColor:C.green+"24" }}>
 <div style={{ display:"grid", gap:"0.18rem", marginBottom:"0.4rem" }}>
 <div className="sect-title" style={{ color:C.green, marginBottom:0 }}>TODAY'S ADJUSTMENTS</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.45 }}>{compactFuelingDetailSummary}</div>
 </div>
 <div style={{ display:"grid", gap:"0.35rem" }}>
 {(nutritionAdjustmentRows.length ? nutritionAdjustmentRows : [{ key: "detail_focus", label: "Today", line: compactFuelingDetailSummary }]).map((row) => (
 <div key={row.key} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.5rem 0.55rem", display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>{sanitizeDisplayText(row.label)}</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{sanitizeDisplayText(row.line)}</div>
 </div>
 ))}
 </div>
 </div>
 </div>

 <details data-testid="nutrition-performance-guidance" className="card card-subtle" style={{ borderColor:C.green+"28" }}>
 <summary style={{ cursor:"pointer", fontSize:"0.56rem", color:"#dbe7f6" }}>
 Fueling details
 </summary>
 <div style={{ display:"grid", gap:"0.42rem", marginTop:"0.45rem" }}>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.58rem", color:"#f8fafc", lineHeight:1.45 }}>{compactWhyThisToday}</div>
 {compactDailyRecommendations.length > 0 && (
 <div style={{ display:"grid", gap:"0.14rem" }}>
 {compactDailyRecommendations.map((line, index) => (
 <div key={`nutrition_detail_tip_${index}`} style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {line}
 </div>
 ))}
 </div>
 )}
 </div>
 {!!visiblePerformanceGuidanceRows.length && (
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))", gap:"0.35rem" }}>
 {visiblePerformanceGuidanceRows.map((entry) => (
 <div key={entry.key} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.5rem 0.55rem", display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>{entry.label}</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{entry.line}</div>
 </div>
 ))}
 </div>
 )}
 {!!compactAdaptiveContextRows.length && (
 <div data-testid="nutrition-adaptive-context" style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(190px,1fr))", gap:"0.35rem" }}>
 {compactAdaptiveContextRows.map((entry) => (
 <div key={entry.key} style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.5rem 0.55rem", display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>{sanitizeDisplayText(entry.label)}</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{compressNutritionCopy(entry.line, 78)}</div>
 </div>
 ))}
 </div>
 )}
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.35rem" }}>
 <div style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.5rem 0.55rem", display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>LOW-FRICTION BACKUP</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{fastFallback}</div>
 </div>
 <div style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.5rem 0.55rem", display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>{travelOrGroceryTitle}</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{travelOrGroceryLine}</div>
 </div>
 <div style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.5rem 0.55rem", display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>EMERGENCY ORDER</div>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{emergencyOrderLine}</div>
 </div>
 </div>
 </div>
 </details>

 <details data-testid="nutrition-meal-anchors" className="card card-subtle" style={{ borderColor:C.blue+"24" }}>
 <summary style={{ cursor:"pointer", fontSize:"0.56rem", color:"#dbe7f6" }}>Saved meal anchors</summary>
 <div style={{ display:"grid", gap:"0.18rem", marginTop:"0.45rem", marginBottom:"0.45rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.45 }}>
 Save the meals you repeat so this tab stays useful when the day gets busy.
 </div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.35rem" }}>
 <label style={{ display:"grid", gap:"0.16rem" }}>
 <span style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em" }}>DEFAULT BREAKFAST</span>
 <input value={mealAnchorDrafts.breakfast} onChange={(e)=>setMealAnchorDrafts((current)=>({ ...current, breakfast:e.target.value }))} placeholder="Greek yogurt + berries + granola" />
 </label>
 <label style={{ display:"grid", gap:"0.16rem" }}>
 <span style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em" }}>DEFAULT LUNCH</span>
 <input value={mealAnchorDrafts.lunch} onChange={(e)=>setMealAnchorDrafts((current)=>({ ...current, lunch:e.target.value }))} placeholder="Chicken rice bowl + fruit" />
 </label>
 <label style={{ display:"grid", gap:"0.16rem" }}>
 <span style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em" }}>TRAVEL FALLBACK</span>
 <input value={mealAnchorDrafts.travelFallback} onChange={(e)=>setMealAnchorDrafts((current)=>({ ...current, travelFallback:e.target.value }))} placeholder="Egg bites + oatmeal + banana" />
 </label>
 <label style={{ display:"grid", gap:"0.16rem" }}>
 <span style={{ fontSize:"0.46rem", color:"#64748b", letterSpacing:"0.08em" }}>EMERGENCY TAKEOUT</span>
 <input value={mealAnchorDrafts.emergencyOrder} onChange={(e)=>setMealAnchorDrafts((current)=>({ ...current, emergencyOrder:e.target.value }))} placeholder="Chipotle double chicken bowl" />
 </label>
 </div>
 <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap", marginTop:"0.45rem" }}>
 <button className="btn" onClick={()=>setMealAnchorDrafts((current)=>({ ...current, breakfast: breakfastAnchorSuggestion }))} style={{ fontSize:"0.5rem", borderColor:"#2a3b56", color:"#dbe7f6" }}>
 Use today's breakfast
 </button>
 <button className="btn" onClick={()=>setMealAnchorDrafts((current)=>({ ...current, lunch: lunchAnchorSuggestion }))} style={{ fontSize:"0.5rem", borderColor:"#2a3b56", color:"#dbe7f6" }}>
 Use today's lunch
 </button>
 <button className="btn btn-primary" onClick={saveMealAnchors} style={{ fontSize:"0.5rem" }}>
 Save anchors
 </button>
 </div>
 <div style={{ display:"grid", gap:"0.14rem", marginTop:"0.42rem" }}>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>Breakfast suggestion: {breakfastAnchorSuggestion}</div>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>Lunch suggestion: {lunchAnchorSuggestion}</div>
 <div style={{ fontSize:"0.47rem", color:"#8fa5c8", lineHeight:1.45 }}>Travel backup: {travelAnchorSuggestion}</div>
 </div>
 </details>

 <details className="card card-subtle" style={{ borderColor:C.blue+"24" }}>
 <summary style={{ cursor:"pointer", fontSize:"0.56rem", color:"#dbe7f6" }}>Supplement plan</summary>
 <div style={{ display:"grid", gap:"0.42rem", marginTop:"0.45rem" }}>
 <div style={{ display:"grid", gap:"0.14rem" }}>
 <div style={{ fontSize:"0.5rem", color:"#dbe7f6", lineHeight:1.45 }}>{compactSupplementPrescriptionLine}</div>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {showSupplementChecklist ? compactApprovedSupplementLine : compactApprovedSupplementEmptyLine}
 </div>
 </div>
 {!showSupplementChecklist && (
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>
 {compactApprovedSupplementEmptyLine}
 </div>
 )}
 {showSupplementChecklist && (
 <div style={{ display:"grid", gap:"0.3rem" }}>
 {supplementRows.map((supp, i) => (
 <div key={`${supp.name}_${i}`} style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.42rem 0.48rem" }}>
 <div style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:"0.35rem", alignItems:"center" }}>
 <button className="btn" onClick={()=>toggleSupplementTaken(supp.name)} style={{ width:24, minWidth:24, height:24, padding:0, borderColor:"#2d435f", color:supplementTaken?.[supp.name] ? C.green : "#64748b", background:"transparent", fontSize:"0.62rem" }}>
 {supplementTaken?.[supp.name] ? "x" : ""}
 </button>
 <div>
 <div style={{ fontSize:"0.56rem", color:"#dbe7f6" }}>{supp.name}</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", marginTop:"0.08rem" }}>{supp.instruction}</div>
 </div>
 <button className="btn" onClick={()=>setOpenSupplementInfo(prev => prev === supp.name ? "" : supp.name)} style={{ fontSize:"0.48rem", padding:"0.12rem 0.34rem", color:"#8fa5c8", borderColor:"#2c3e58" }}>{openSupplementInfo === supp.name ? "Hide" : "Why"}</button>
 </div>
 {openSupplementInfo === supp.name && (
 <div style={{ marginTop:"0.28rem", fontSize:"0.51rem", color:"#9fb2d2", lineHeight:1.55 }}>
 {supplementInfoByName[supp.name]?.plain}
 </div>
 )}
 </div>
 ))}
 </div>
 )}
 <details style={{ border:"1px solid #22324a", borderRadius:12, background:"#0f172a", padding:"0.52rem 0.56rem" }}>
 <summary style={{ cursor:"pointer", fontSize:"0.52rem", color:"#dbe7f6" }}>Manage approved supplements</summary>
 <div style={{ display:"grid", gap:"0.28rem", marginTop:"0.4rem" }}>
 <div style={{ fontSize:"0.45rem", color:"#64748b", letterSpacing:"0.08em" }}>APPROVED STACK</div>
 <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.45 }}>
 {compactApprovedSupplementLine}
 </div>
 <div style={{ display:"flex", gap:"0.3rem", flexWrap:"wrap" }}>
 {defaultSupplements.map((supplement) => {
 const isApproved = approvedSupplementNames.has(String(supplement?.name || "").toLowerCase());
 return (
 <button
 key={supplement.key}
 className="btn"
 onClick={()=>toggleApprovedSupplement(supplement)}
 style={{
 fontSize:"0.48rem",
 borderColor:isApproved ? C.green : "#2a3b56",
 color:isApproved ? C.green : "#dbe7f6",
 background:isApproved ? `${C.green}12` : "transparent",
 }}
 >
 {isApproved ? `Remove ${supplement.name}` : `Add ${supplement.name}`}
 </button>
 );
 })}
 </div>
 {approvedCustomSupplements.length > 0 && (
 <div style={{ display:"grid", gap:"0.18rem" }}>
 {approvedCustomSupplements.map((supplement) => (
 <div key={`approved_custom_${supplement.key}`} style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"center", flexWrap:"wrap" }}>
 <div style={{ fontSize:"0.48rem", color:"#dbe7f6", lineHeight:1.45 }}>
 {supplement.name} / {supplement.defaultTiming}
 </div>
 <button className="btn" onClick={()=>removeCustomSupplement(supplement.name)} style={{ fontSize:"0.46rem", borderColor:"#2a3b56", color:"#8fa5c8" }}>
 Remove
 </button>
 </div>
 ))}
 </div>
 )}
 <div style={{ display:"grid", gridTemplateColumns:"minmax(0,1fr) minmax(0,1fr) auto", gap:"0.3rem", alignItems:"start" }}>
 <input value={newSupplementName} onChange={(e)=>setNewSupplementName(e.target.value)} placeholder="Custom supplement" />
 <input value={newSupplementTiming} onChange={(e)=>setNewSupplementTiming(e.target.value)} placeholder="Timing" />
 <button className="btn btn-primary" onClick={addCustomSupplement} disabled={!newSupplementName.trim() || !newSupplementTiming.trim()} style={{ fontSize:"0.48rem", opacity:newSupplementName.trim() && newSupplementTiming.trim() ? 1 : 0.5 }}>
 Add
 </button>
 </div>
 </div>
 </details>
 </div>
 </details>

 </div>
 );
 /*
 <div className="fi">
 <div className="card card-soft card-action" style={{ marginBottom:"0.8rem", borderColor:C.blue+"28" }}>
 <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"0.45rem", flexWrap:"wrap", marginBottom:"0.45rem" }}>
 <div>
 <div className="sect-title" style={{ color:C.blue, marginBottom:"0.14rem" }}>TODAY'S NUTRITION TARGET</div>
 <div style={{ fontSize:"0.6rem", color:"#e2e8f0", lineHeight:1.5 }}>{directiveSentence}</div>
 </div>
 <div style={{ display:"flex", gap:"0.28rem", flexWrap:"wrap", justifyContent:"flex-end" }}>
 <span className="ui-pill" style={{ color:targetTone.color, background:targetTone.bg, borderColor:"transparent" }}>{sanitizeStatusLabel(dayType, "today")}</span>
 <span className="ui-pill" style={{ color:nutritionTone.color, background:nutritionTone.bg, borderColor:"transparent" }}>{comparisonLabel}</span>
 <span className="ui-pill" style={{ color:"#8fa5c8", background:"#0f172a", borderColor:"#243752" }}>{phaseMode}</span>
 </div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(120px,1fr))", gap:"0.4rem" }}>
 {[["Protein", proteinLevel, C.red], ["Carbs", carbLevel, C.green], ["Calories", calorieLevel, C.amber]].map(([label, value, col]) => (
 <div key={label} style={{ background:"#0f172a", border:`1px solid ${col}30`, borderRadius:10, padding:"0.46rem 0.4rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>{label}</div>
 <div className="mono" style={{ color:col, fontSize:"0.9rem", marginTop:"0.12rem" }}>{value}</div>
 </div>
 ))}
 </div>
 </div>

 <div className="card" style={{ marginBottom:"0.8rem" }}>
 <div className="sect-title" style={{ color:C.green, marginBottom:"0.35rem" }}>WHY THIS MATCHES TODAY'S TRAINING</div>
 <div style={{ display:"grid", gap:"0.35rem" }}>
 <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.48rem 0.52rem" }}>
 <div style={{ fontSize:"0.58rem", color:"#dbe7f6", lineHeight:1.55 }}>{whyThisToday}</div>
 </div>
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.38rem" }}>
 <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.45rem 0.5rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>TRAINING LINK</div>
 <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.14rem", lineHeight:1.5 }}>{currentSessionLabel}</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", marginTop:"0.12rem", lineHeight:1.5 }}>{macroShiftLine}</div>
 </div>
 <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.45rem 0.5rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>GUIDANCE BASIS</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", marginTop:"0.14rem", lineHeight:1.55 }}>{nutritionProvenance}</div>
 </div>
 </div>
 {dailyRecommendations.length > 0 && (
 <div style={{ display:"grid", gap:"0.22rem" }}>
 {dailyRecommendations.slice(0, 3).map((line, idx) => (
 <div key={`nutrition_rec_${idx}`} style={{ fontSize:"0.54rem", color:"#c7d5ea", lineHeight:1.5 }}>
 {idx + 1}. {line}
 </div>
 ))}
 </div>
 )}
 </div>
 </div>

 <div className="card" style={{ marginBottom:"0.8rem" }}>
 <div className="sect-title" style={{ color:C.amber, marginBottom:"0.35rem" }}>MEAL STRUCTURE</div>
 <div style={{ display:"grid", gap:"0.38rem" }}>
 {mealMacroRows.map((meal) => (
 <div key={meal.key} style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.46rem 0.52rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", gap:"0.4rem", alignItems:"center", flexWrap:"wrap" }}>
 <div style={{ fontSize:"0.58rem", color:"#e2e8f0" }}>{meal.label}</div>
 <div style={{ fontSize:"0.48rem", color:"#8fa5c8" }}>{meal.p}g protein - {meal.c}g carbs - {meal.f}g fat</div>
 </div>
 <div style={{ fontSize:"0.54rem", color:"#c7d5ea", marginTop:"0.12rem", lineHeight:1.5 }}>{meal.text}</div>
 </div>
 ))}
 <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.38rem" }}>
 <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.45rem 0.5rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>LOW-FRICTION BACKUP</div>
 <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.14rem", lineHeight:1.5 }}>{fastFallback}</div>
 </div>
 <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.45rem 0.5rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>SHOPPING / TRAVEL NOTE</div>
 <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.14rem", lineHeight:1.5 }}>
 {nutritionLayer?.travelMode
 ? travelBreakfast[0]
 : hasSavedStorePreference
 ? `${store}: ${(groceryHooks?.priorityItems || basket?.items || []).slice(0, 4).join(", ") || "lean protein, fruit, easy carbs, hydration"}`
 : `Suggested staples: ${(groceryHooks?.priorityItems || basket?.items || []).slice(0, 4).join(", ") || "lean protein, fruit, easy carbs, hydration"}`}
 </div>
 </div>
 </div>
 </div>
 </div>

 <div className="card" style={{ marginBottom:"0.8rem", borderColor:C.blue+"24" }}>
 <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>RECOVERY + SUPPLEMENTS</div>
 <div style={{ display:"grid", gap:"0.34rem" }}>
 <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.45rem 0.5rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>RECOVERY</div>
 <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.14rem", lineHeight:1.55 }}>
{recoveryPrescription?.summary || "Recovery guidance is connected to today's plan."}
 </div>
 <div style={{ fontSize:"0.49rem", color:"#8fa5c8", marginTop:"0.12rem", lineHeight:1.5 }}>{hydrationSupportLine}</div>
 </div>
 <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.45rem 0.5rem" }}>
 <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>SUPPLEMENTS</div>
 <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.14rem", lineHeight:1.55 }}>{supplementPrescriptionLine}</div>
 </div>
 </div>
 </div>

 <div className="card" style={{ marginBottom:"0.8rem" }}>
<div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>HYDRATION & SUPPLEMENTS</div>
 <div style={{ display:"grid", gap:"0.42rem" }}>
 <button className="btn" onClick={()=>logHydration(12)} style={{ width:"100%", display:"block", textAlign:"left", borderColor:"#2a3b56", padding:"0.42rem 0.46rem" }}>
 <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.56rem", color:"#dbe7f6", marginBottom:"0.22rem" }}>
 <span>{Math.round(hydrationOz)} oz logged</span>
 <span style={{ color:"#8fa5c8" }}>{hydrationTargetLabel}</span>
 </div>
 <div style={{ width:"100%", height:10, borderRadius:999, background:"#0f172a", border:"1px solid #243752", overflow:"hidden" }}>
 <div style={{ width:`${hydrationPct}%`, height:"100%", background: hydrationPct >= 100 ? C.green : C.blue, transition:"width 180ms ease" }} />
 </div>
 <div style={{ marginTop:"0.2rem", fontSize:"0.5rem", color:"#8fa5c8" }}>Tap to add 12 oz</div>
 </button>
 {!showSupplementChecklist && (
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.5 }}>
Your supplement checklist shows up once a supplement plan is saved for today.
 </div>
 )}
 {showSupplementChecklist && (
 <div style={{ display:"grid", gap:"0.3rem" }}>
 {supplementRows.map((supp, i) => (
 <div key={`${supp.name}_${i}`} style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.42rem 0.48rem" }}>
 <div style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:"0.35rem", alignItems:"center" }}>
 <button className="btn" onClick={()=>toggleSupplementTaken(supp.name)} style={{ width:24, minWidth:24, height:24, padding:0, borderColor:"#2d435f", color:supplementTaken?.[supp.name] ? C.green : "#64748b", background:"transparent", fontSize:"0.62rem" }}>
 {supplementTaken?.[supp.name] ? "?" : ""}
 </button>
 <div>
 <div style={{ fontSize:"0.56rem", color:"#dbe7f6" }}>{supp.name}</div>
 <div style={{ fontSize:"0.5rem", color:"#8fa5c8", marginTop:"0.08rem" }}>{supp.instruction}</div>
 </div>
 <button className="btn" onClick={()=>setOpenSupplementInfo(prev => prev === supp.name ? "" : supp.name)} style={{ fontSize:"0.48rem", padding:"0.12rem 0.34rem", color:"#8fa5c8", borderColor:"#2c3e58" }}>{openSupplementInfo === supp.name ? "Hide" : "Why"}</button>
 </div>
 {openSupplementInfo === supp.name && (
 <div style={{ marginTop:"0.28rem", fontSize:"0.51rem", color:"#9fb2d2", lineHeight:1.55 }}>
 {supplementInfoByName[supp.name]?.plain}
 </div>
 )}
 </div>
 ))}
 </div>
 )}
 </div>
 </div>

 </div>
 */
}

// COACH TAB (REDESIGNED)
