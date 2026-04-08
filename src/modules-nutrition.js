export const NUTRITION = {
  longRun:   { cal: 2900, p: 190, c: 320, f: 70, label: "Long Run Day" },
  hardRun:   { cal: 2700, p: 190, c: 280, f: 68, label: "Hard Run Day" },
  easyRun:   { cal: 2600, p: 190, c: 255, f: 68, label: "Easy Run Day" },
  otf:       { cal: 2650, p: 190, c: 265, f: 68, label: "OTF Day" },
  strength:  { cal: 2500, p: 190, c: 220, f: 72, label: "Strength Only Day" },
  rest:      { cal: 2350, p: 185, c: 195, f: 72, label: "Rest Day" },
  travelRun: { cal: 2650, p: 185, c: 270, f: 68, label: "Travel + Run Day" },
  travelRest:{ cal: 2300, p: 180, c: 190, f: 70, label: "Travel Rest Day" },
};

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
      "Prioritize protein first at every meal — order the biggest lean protein option on the menu",
      "Hotel breakfast: eggs + Greek yogurt + fruit. Skip pastries and waffles.",
      "Bring: protein powder single-serve packets, protein bars (Quest/RXBar), mixed nuts",
      "At restaurants: ask for sauces on the side, double protein, swap fries for veg or side salad",
      "Airport: Chipotle (double chicken bowl, no sour cream), Subway (double meat on whole wheat), any salad with grilled protein",
      "Hydration: aim for 100oz water on travel days — airports and hotels are dehydrating",
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
  let out = { ...targets };
  if (!primary) return out;
  if (primary.category === "body_comp") {
    out.cal = dayType === "longRun" ? Math.max(out.cal - 50, 2300) : Math.max(out.cal - 120, 2200);
    out.p = Math.max(out.p, 195);
  }
  if (primary.category === "running") {
    if (["hardRun","longRun","travelRun"].includes(dayType)) out.c += 25;
    out.f = Math.max(60, out.f - 3);
  }
  if (primary.category === "strength") {
    if (["strength","otf"].includes(dayType)) { out.p += 10; out.c += 10; }
  }
  return out;
};

export const mapWorkoutToNutritionDayType = (todayWorkout, environmentMode) => {
  const explicitDayType = String(todayWorkout?.nutri || "").trim();
  if (explicitDayType && NUTRITION[explicitDayType]) return explicitDayType;
  const workoutType = String(todayWorkout?.type || "").toLowerCase();
  const runType = String(todayWorkout?.run?.t || "").toLowerCase();
  if (workoutType === "long" || workoutType === "long-run" || /long/.test(runType)) return "longRun";
  if (workoutType === "hard" || workoutType === "hard-run" || /tempo|interval/.test(runType)) return "hardRun";
  if (workoutType === "easy" || workoutType === "easy-run" || /easy/.test(runType)) return environmentMode.includes("travel") ? "travelRun" : "easyRun";
  if (workoutType === "otf" || workoutType === "conditioning") return "otf";
  if (workoutType === "strength" || workoutType === "strength+prehab") return "strength";
  if (workoutType === "recovery" || workoutType === "rest") return environmentMode.includes("travel") ? "travelRest" : "rest";
  return "easyRun";
};

const clonePlainValue = (value) => {
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
  const raw = clonePlainValue(feedback || {});
  const nested = clonePlainValue(raw?.actualNutrition || raw?.actualNutritionLog || null);
  const status = String(
    nested?.quickStatus
    || raw?.status
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
    nested?.hydration?.oz
    ?? raw?.hydrationOz
    ?? nested?.hydrationOz
    ?? 0
  ) || 0;
  const hydrationTargetOz = Number(
    nested?.hydration?.targetOz
    ?? raw?.hydrationTargetOz
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
    planReference: clonePlainValue(raw?.planReference || nested?.planReference || planReference || null),
    loggedAt: hasAnySignal ? (Number(nested?.loggedAt || raw?.ts || Date.now()) || Date.now()) : null,
    legacy: {
      status,
      issue,
      note,
    },
  };
};

export const normalizeActualNutritionLogCollection = (nutritionFeedback = {}) => (
  Object.fromEntries(
    Object.entries(nutritionFeedback || {}).map(([dateKey, feedback]) => [
      dateKey,
      normalizeActualNutritionLog({ dateKey, feedback }),
    ])
  )
);

export const compareNutritionPrescriptionToActual = ({ nutritionPrescription = null, actualNutritionLog = null } = {}) => {
  const actual = actualNutritionLog ? normalizeActualNutritionLog({ dateKey: actualNutritionLog?.dateKey || "", feedback: actualNutritionLog }) : null;
  const hasActual = Boolean(actual?.loggedAt);
  const dayType = String(nutritionPrescription?.dayType || "").toLowerCase();
  const hardDay = ["hardrun", "longrun", "travelrun", "otf"].includes(dayType);
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
    ? "Nutrition prescription unavailable."
    : !hasActual
    ? "Actual nutrition has not been logged yet."
    : deviationKind === "followed"
    ? "Nutrition broadly matched the prescribed day."
    : deviationKind === "partial"
    ? "Nutrition was mostly on plan, with some drift."
    : deviationKind === "under_fueled"
    ? "Nutrition came in under plan and may have limited recovery or performance."
    : deviationKind === "over_indulged"
    ? "Nutrition overshot the intended plan."
    : "Nutrition deviated from the intended plan.";

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

export const deriveAdaptiveNutrition = ({ todayWorkout, goals, momentum, personalization, bodyweights, learningLayer, nutritionFeedback, nutritionActualLogs, coachPlanAdjustments, salvageLayer, failureMode }) => {
  const todayKey = new Date().toISOString().split("T")[0];
  const schedule = personalization?.environmentConfig?.schedule || [];
  const isScheduledTravelDate = schedule.some(s => s?.mode === "Travel" && s?.startDate && s?.endDate && todayKey >= s.startDate && todayKey <= s.endDate);
  const environmentMode = isScheduledTravelDate ? "travel" : (personalization.travelState.environmentMode || "home");
  const dayTypeOverride = coachPlanAdjustments?.nutritionOverrides?.[new Date().toISOString().split("T")[0]];
  const mappedDay = dayTypeOverride || mapWorkoutToNutritionDayType(todayWorkout, environmentMode);
  const travelMode = environmentMode.includes("travel") || isScheduledTravelDate || personalization?.travelState?.isTravelWeek;
  const dayType = travelMode
    ? (["hardRun", "longRun", "easyRun", "otf"].includes(mappedDay) ? "travelRun" : "travelRest")
    : mappedDay;
  const goalContext = getGoalContext(goals);
  const baseTargets = NUTRITION[dayType] || NUTRITION.easyRun;
  let targets = applyGoalNutritionTargets(baseTargets, dayType, goalContext);
  let phaseAwareAdjustment = null;
  const currentPhase = todayWorkout?.week?.phase || "BASE";

  const activeGoals = goalContext.active || [];
  const hasBodyCompGoal = activeGoals.some(g => g.category === "body_comp");
  const hasStrengthGoal = activeGoals.some(g => g.category === "strength");
  if (hasBodyCompGoal && hasStrengthGoal) {
    const heavyLiftDay = ["strength", "otf"].includes(dayType) || ["run+strength", "strength+prehab"].includes(todayWorkout?.type);
    const easyRunWeek = !!todayWorkout?.week?.cutback || ["easyRun", "rest", "travelRest"].includes(dayType);
    if (heavyLiftDay) {
      const prev = { ...targets };
      targets.cal = Math.max(targets.cal, NUTRITION.strength.cal);
      targets.c = Math.max(targets.c, NUTRITION.strength.c);
      targets.p = Math.max(targets.p, 200);
      phaseAwareAdjustment = {
        active: true,
        mode: "maintenance_on_lift_days",
        summary: "Maintenance calories on heavy lift days to protect strength output.",
        why: `Strength day detected (${todayWorkout?.label || dayType}), so calories/carbs were protected from deficit.`,
        delta: { cal: targets.cal - prev.cal, c: targets.c - prev.c, p: targets.p - prev.p },
      };
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
    }
  }

  const recentBW = (bodyweights || []).slice(-10).map(x => Number(x.w)).filter(Boolean);
  const bwTrend = recentBW.length >= 2 ? recentBW[recentBW.length - 1] - recentBW[0] : 0;
  const recentFeedback = Object.values(nutritionActualLogs || normalizeActualNutritionLogCollection(nutritionFeedback || {})).slice(-10);
  const hungerHits = recentFeedback.filter(f => f.deviationKind === "under_fueled" || f.issue === "hunger").length;
  const offTrackHits = recentFeedback.filter(f => f.adherence === "low" || f.quickStatus === "off_track").length;

  if (goalContext.primary?.category === "body_comp") {
    if (bwTrend < -2.2 || hungerHits >= 2 || momentum.inconsistencyRisk === "high") {
      targets.cal += 120;
      targets.c += 20;
    }
    if (offTrackHits >= 3) {
      targets.cal += 90;
      targets.f += 5;
    }
  }

  if (goalContext.primary?.category === "running" && ["hardRun","longRun","travelRun"].includes(dayType)) {
    if (learningLayer?.stats?.harder >= 2) {
      targets.c += 20;
      targets.cal += 70;
    }
  }

  if (salvageLayer?.active || failureMode?.hardeningMode) {
    targets = { ...targets, cal: Math.max(targets.cal, NUTRITION.easyRun.cal), p: Math.max(targets.p, 190) };
  }

  let phaseMode = "maintain";
  if (phaseAwareAdjustment?.mode === "maintenance_on_lift_days") phaseMode = "maintain";
  else if (phaseAwareAdjustment?.mode === "deficit_on_easy_weeks") phaseMode = "cut";
  else if (goalContext.primary?.category === "strength" || ["PEAKBUILD", "PEAK"].includes(currentPhase)) phaseMode = "build";
  else if (goalContext.primary?.category === "body_comp") phaseMode = ["BASE", "BUILDING"].includes(currentPhase) ? "cut" : "maintain";
  else if (["hardRun", "longRun", "otf"].includes(dayType)) phaseMode = "build";

  const templateKey = travelMode ? "travel" : "home";
  const mealPlan = templateKey === "travel"
    ? { tips: MEAL_PLANS.travel.tips, gym: MEAL_PLANS.travel.gym }
    : (["longRun","hardRun","travelRun"].includes(dayType) ? MEAL_PLANS.home.longRun : dayType === "rest" ? MEAL_PLANS.home.rest : MEAL_PLANS.home.training);

  const simplified = learningLayer?.adjustmentBias === "simplify" || momentum.momentumState.includes("drifting") || offTrackHits >= 3;
  const strategy = simplified
    ? ["3 simple meals + 1 protein snack", "Use one saved safe default meal", "Anchor breakfast + protein-forward dinner"]
    : ["Distribute protein across 4+ meals", "Front-load carbs around key run", "Keep hydration + sodium stable"];

  const explanation = goalContext.primary
    ? `Nutrition adapts to primary goal (${goalContext.primary.name}) and today (${dayType}).`
    : `Nutrition follows training demand for today (${dayType}).`;

  return {
    dayType,
    targets,
    mealPlan,
    strategy,
    simplified,
    explanation,
    phaseAwareAdjustment,
    phaseMode,
    goalContext,
    travelMode,
    workoutType: todayWorkout?.type || "",
    workoutLabel: todayWorkout?.label || todayWorkout?.type || "session",
  };
};

export const deriveRealWorldNutritionEngine = ({ location, dayType, goalContext, nutritionLayer, momentum, favorites, travelMode, learningLayer, timeOfDay, loggedIntake }) => {
  const city = (location || "Austin").trim() || "Austin";
  const key = `${city.toLowerCase()}_${dayType}`;
  const favoriteRestaurants = favorites?.restaurants || [];
  const favoriteSafeMeals = favorites?.safeMeals || [];
  const groceryPrefs = favorites?.groceries || [];
  const workoutType = String(nutritionLayer?.workoutType || "").toLowerCase();
  const workoutLabel = String(nutritionLayer?.workoutLabel || dayType || "session");
  const primaryCategory = goalContext?.primary?.category || "general_fitness";
  const timeBucket = String(timeOfDay || "").toLowerCase() || "afternoon";
  const intakeStatus = String(loggedIntake?.status || "").toLowerCase();
  const intakeIssue = String(loggedIntake?.issue || "").toLowerCase();
  const intakeNote = String(loggedIntake?.note || "").toLowerCase();
  const hydrationOz = Number(loggedIntake?.hydrationOz || 0);
  const missedProteinSignal = /protein|shake|missed meal|skipped|underate|under ate|not enough/.test(intakeIssue) || /protein|skip|missed|under/.test(intakeNote);
  const hungerSignal = intakeIssue === "hunger" || /hungry|ravenous/.test(intakeNote);
  const offTrackSignal = intakeStatus === "off_track";
  const hardSession = ["hardRun", "longRun", "travelRun", "otf"].includes(dayType) || /hard|long|tempo|interval/.test(workoutType);
  const strengthSession = dayType === "strength" || /strength/.test(workoutType);
  const recoverySession = ["rest", "travelRest"].includes(dayType) || /rest|recovery/.test(workoutType);

  const quickOptions = [
    { name: `Chipotle (${city})`, meal: "Double chicken rice bowl + fajita veg + pico", type: "restaurant", macroFit: "high_protein_high_carb" },
    { name: `CAVA (${city})`, meal: "Greens + grains bowl, double chicken, hummus on side", type: "restaurant", macroFit: "balanced" },
    { name: `Panera (${city})`, meal: "Teriyaki bowl + Greek yogurt", type: "restaurant", macroFit: "moderate" },
    { name: `Whole Foods (${city})`, meal: "Hot bar: lean protein + rice + veg", type: "grocery", macroFit: "custom" },
    { name: `Trader Joe's (${city})`, meal: "Pre-cooked chicken + microwave rice + salad kit", type: "grocery", macroFit: "budget" },
  ];

  const travelBreakfast = [
    "Hotel buffet: eggs + oatmeal + fruit",
    "Greek yogurt + banana + protein bar",
    "Starbucks: egg bites + oatmeal + latte",
  ];

  const defaultMealStructure = nutritionLayer?.simplified
    ? ["Meal 1: protein + carb anchor", "Meal 2: default safe meal", "Meal 3: protein + veg + carb", "Snack: protein + fruit"]
    : ["Meal 1: structured breakfast", "Meal 2: performance lunch", "Meal 3: recovery dinner", "Snack: protein top-up"];

  const constraints = [];
  if (travelMode) constraints.push("travel_logistics");
  if (momentum?.logGapDays >= 3) constraints.push("low_logging_momentum");
  if (learningLayer?.stats?.timeBlockers >= 1) constraints.push("time_pressure");

  const recommendations = [...favoriteSafeMeals.map(m => ({ name: m.name || "Saved safe meal", meal: m.meal || m.name, type: "saved", macroFit: "known" })), ...quickOptions]
    .slice(0, 8);

  const mealStructure = (() => {
    const breakfastBase = hardSession
      ? "Oats + banana + whey or Greek yogurt"
      : strengthSession
      ? "Eggs or Greek yogurt + oats or toast"
      : recoverySession
      ? "Eggs or yogurt + fruit + lighter starch"
      : "Protein breakfast + fruit + steady carbs";
    const lunchBase = hardSession
      ? "Rice bowl with lean protein + extra carbs + produce"
      : strengthSession
      ? "Protein bowl with rice/potatoes + vegetables"
      : recoverySession
      ? "Protein-heavy plate + vegetables + moderate carbs"
      : "Balanced bowl with protein, carbs, and produce";
    const dinnerBase = hardSession
      ? "Recovery dinner: lean protein + rice/potatoes + vegetables"
      : strengthSession
      ? "Lift-day dinner: protein + carbs + produce"
      : recoverySession
      ? "Lean protein + vegetables + controlled carbs"
      : "Protein-forward dinner + produce";
    const snackBase = hardSession
      ? "Banana + shake or yogurt"
      : strengthSession
      ? "Protein shake or Greek yogurt + fruit"
      : "Fruit + protein snack";

    const mealByTime = timeBucket === "morning"
      ? {
          breakfast: hardSession ? `Pre-session breakfast: ${breakfastBase}` : `Start with ${breakfastBase}`,
          lunch: hardSession ? "Recovery lunch: lean protein + rice + produce" : lunchBase,
          dinner: dinnerBase,
          snack: snackBase,
        }
      : timeBucket === "evening"
      ? {
          breakfast: recoverySession ? breakfastBase : "Protein breakfast + fruit; save bigger carbs for later",
          lunch: hardSession || strengthSession ? `Pre-session lunch: ${lunchBase}` : lunchBase,
          dinner: hardSession || strengthSession ? `Post-session dinner: ${dinnerBase}` : dinnerBase,
          snack: snackBase,
        }
      : {
          breakfast: breakfastBase,
          lunch: hardSession || strengthSession ? `Pre-session lunch: ${lunchBase}` : lunchBase,
          dinner: dinnerBase,
          snack: snackBase,
        };

    if (primaryCategory === "body_comp") {
      mealByTime.breakfast = `${mealByTime.breakfast}; keep fats controlled and protein high`;
      mealByTime.dinner = `${mealByTime.dinner}; plate vegetables first`;
    } else if (primaryCategory === "strength") {
      mealByTime.lunch = `${mealByTime.lunch}; keep an extra carb serving ready`;
      mealByTime.snack = "Add a shake or yogurt if protein is lagging";
    } else if (primaryCategory === "running") {
      mealByTime.breakfast = `${mealByTime.breakfast}; do not miss carbs before quality work`;
    }

    if (missedProteinSignal || offTrackSignal) {
      mealByTime.snack = "Reset snack: protein shake + fruit within the next hour";
      mealByTime.dinner = `${mealByTime.dinner}; make this your protein catch-up meal`;
    } else if (hungerSignal) {
      mealByTime.snack = "Add a higher-volume snack: Greek yogurt, fruit, and granola";
    }

    return mealByTime;
  })();

  const dailyRecommendations = (() => {
    const lines = [];
    if (hardSession) lines.push(`Center carbs around ${workoutLabel} so output stays high.`);
    else if (strengthSession) lines.push(`Keep protein evenly spaced today so ${workoutLabel} is supported.`);
    else if (recoverySession) lines.push("Keep meals simple and protein-forward; recovery is the job today.");
    else lines.push("Use balanced meals and avoid random snacking so energy stays steady.");

    if (timeBucket === "morning") lines.push("Front-load breakfast because your useful training window is early.");
    else if (timeBucket === "evening") lines.push("Save the larger carb hit for later because training demand is later in the day.");
    else lines.push("Keep lunch as the anchor meal so the rest of the day is easier to control.");

    if (offTrackSignal || missedProteinSignal) lines.push("Use the next meal to reset protein instead of trying to make up the whole day at once.");
    else if (hungerSignal) lines.push("Add volume from fruit/yogurt before reaching for convenience snacks.");

    if (hydrationOz > 0 && hydrationOz < 40) lines.push("Hydration is still low, so pair the next meal with a large water refill.");
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
    return `${workoutLabel} sets the training demand, ${goalLine} sets the bias, ${timeBucket} shapes meal timing, and ${intakeLine}`;
  })();

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
    mealStructure,
    dailyRecommendations,
    whyToday,
    groceryHooks,
    travelBreakfast,
    defaultMealStructure,
    constraints,
    groceryPrefs,
    favoriteRestaurants,
    notes: travelMode
      ? "Travel mode: prioritize convenience + protein certainty."
      : "Home mode: prioritize prep consistency + meal anchors.",
    summary: `${city}: ${recommendations.length} quick nutrition options aligned to ${dayType}.`,
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
  if (["longRun", "hardRun", "travelRun"].includes(dayType)) return "Higher carbs support quality run output and glycogen restoration. Fat stays moderate to keep digestion smooth around sessions.";
  if (["rest", "travelRest"].includes(dayType)) return "Slightly lower carbs on rest days maintains energy balance while keeping protein high to preserve lean mass and recovery.";
  return "Balanced carbs/protein supports training quality, recovery, and consistency.";
};

export const getPlaceRecommendations = ({ city, dayType, favorites, mode, query }) => {
  const key = (city || "").toLowerCase();
  const base = LOCAL_PLACE_TEMPLATES[key] || LOCAL_PLACE_TEMPLATES.default;
  const saved = (favorites?.restaurants || []).map(r => r.name).filter(Boolean);
  const all = [...new Set([...saved, ...base])];
  const q = (query || "").toLowerCase().trim();
  const filtered = q ? all.filter(name => name.toLowerCase().includes(q)) : all;
  return filtered.slice(0, 8).map(name => ({ name, meal: mode === "travel" ? "Lean protein + carb side + veg" : ["longRun","hardRun","travelRun"].includes(dayType) ? "Protein bowl + extra rice" : "Protein-heavy plate + produce", source: saved.includes(name) ? "saved" : "local" }));
};

export const buildGroceryBasket = ({ store, city, days, dayType }) => {
  const protein = ["pre-cooked chicken breast", "lean ground turkey", "Greek yogurt", "protein shakes"];
  const carbs = ["microwave jasmine rice", "oats", "fruit", "whole grain wraps"];
  const fats = ["avocado", "olive oil packets", "mixed nuts"];
  const produce = ["bagged salad", "steam-in-bag veggies", "berries"];
  const extras = ["electrolytes", "sparkling water", "salsa/hot sauce"];
  const runBonus = ["bagels", "honey", "rice cakes"];
  return { store, city, days, items: [...protein, ...carbs, ...fats, ...produce, ...extras, ...(["longRun", "hardRun", "travelRun"].includes(dayType) ? runBonus : [])] };
};

export const deriveFridgeCoachMealSuggestion = ({ fridgeInput, dayType = "easyRun" }) => {
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
  const carbPick = carb || (["longRun", "hardRun", "travelRun"].includes(dayType) ? "rice or oats" : "fruit or potato");
  const producePick = produce || "any frozen or fresh vegetable";
  const fatPick = fat || "olive oil or a few nuts";
  const meal = `${proteinPick} + ${carbPick} + ${producePick} (${fatPick} optional)`;
  const coachLine = `Coach suggestion: ${meal}. Keep portions centered on your target and protein-first.`;
  return { meal, coachLine, items };
};
