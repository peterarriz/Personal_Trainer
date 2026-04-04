export const COACH_TOOL_ACTIONS = {
  SET_PAIN_STATE: "SET_PAIN_STATE",
  CLEAR_PAIN_STATE: "CLEAR_PAIN_STATE",
  PROGRESS_STRENGTH_EMPHASIS: "PROGRESS_STRENGTH_EMPHASIS",
  REDUCE_LONG_RUN_AGGRESSIVENESS: "REDUCE_LONG_RUN_AGGRESSIVENESS",
  SWAP_TODAY_RECOVERY: "SWAP_TODAY_RECOVERY",
  REDUCE_WEEKLY_VOLUME: "REDUCE_WEEKLY_VOLUME",
  CONVERT_RUN_TO_LOW_IMPACT: "CONVERT_RUN_TO_LOW_IMPACT",
  REPLACE_SPEED_EASY: "REPLACE_SPEED_EASY",
  ADD_ACHILLES_BLOCK: "ADD_ACHILLES_BLOCK",
  CHANGE_NUTRITION_DAY: "CHANGE_NUTRITION_DAY",
  INCREASE_PRELONGRUN_CARBS: "INCREASE_PRELONGRUN_CARBS",
  SWITCH_TRAVEL_MEALS: "SWITCH_TRAVEL_MEALS",
  INCREASE_CALORIES_SLIGHTLY: "INCREASE_CALORIES_SLIGHTLY",
  REDUCE_DEFICIT_AGGRESSIVENESS: "REDUCE_DEFICIT_AGGRESSIVENESS",
  SHIFT_CARBS_AROUND_WORKOUT: "SHIFT_CARBS_AROUND_WORKOUT",
  SIMPLIFY_MEALS_THIS_WEEK: "SIMPLIFY_MEALS_THIS_WEEK",
  SWITCH_TRAVEL_NUTRITION_MODE: "SWITCH_TRAVEL_NUTRITION_MODE",
  USE_DEFAULT_MEAL_STRUCTURE_3_DAYS: "USE_DEFAULT_MEAL_STRUCTURE_3_DAYS",
  MOVE_LONG_RUN: "MOVE_LONG_RUN",
  INSERT_DELOAD_WEEK: "INSERT_DELOAD_WEEK",
};

const PAIN_LEVELS = ["none", "mild_tightness", "moderate_pain", "sharp_pain_stop"];
export const AFFECTED_AREAS = ["Achilles", "calf", "knee", "shin", "hip", "general fatigue"];

const inferPainLevel = (msg) => {
  const x = msg.toLowerCase();
  if (/sharp|stabbing|stop/.test(x)) return "sharp_pain_stop";
  if (/moderate|painful|hurts/.test(x)) return "moderate_pain";
  if (/tight|mild|stiff/.test(x)) return "mild_tightness";
  return "none";
};

export const detectCoachSignals = (input) => {
  const msg = String(input || "").toLowerCase();
  return {
    pain: /(pain|hurt|achilles|knee|shin|calf|injury|flare)/.test(msg),
    travel: /(travel|hotel|airport|trip|road)/.test(msg),
    missed: /(missed|skip|couldn't|didn't)/.test(msg),
    fatigue: /(fatigue|tired|exhausted|sleep|burned)/.test(msg),
    nutrition: /(nutrition|food|meal|calorie|hungry|macro)/.test(msg),
    strength: /(bench|strength|upper|lower|lift|gym)/.test(msg),
    running: /(run|tempo|interval|long run|pace)/.test(msg),
    simplify: /(simple|simplify|easier|overwhelmed|busy)/.test(msg),
    progress: /(progress|push|harder|advance|increase)/.test(msg),
    why: /(why|reason|because|explain)/.test(msg),
  };
};

export const inferCoachVoiceMode = (momentum) => {
  if (momentum?.coachMode === "protect mode") return "protect";
  if (momentum?.momentumState === "falling off") return "reset";
  if (momentum?.momentumState === "drifting") return "simplify";
  if (momentum?.momentumState === "building momentum") return "push";
  return "rebuild";
};

export const withConfidenceTone = (message, confidence = "moderate", voiceMode = "rebuild") => {
  const tonePrefix = voiceMode === "protect" ? "Protective adjustment:" : voiceMode === "reset" ? "Reset move:" : voiceMode === "simplify" ? "Simplify move:" : voiceMode === "push" ? "Progression move:" : "Coaching move:";
  const confidenceTag = confidence === "high" ? "[high confidence]" : confidence === "low" ? "[exploratory]" : "[moderate confidence]";
  return `${tonePrefix} ${message} ${confidenceTag}`;
};

export const deterministicCoachPacket = ({ input, todayWorkout, currentWeek, logs, bodyweights, personalization, learning, salvage, planComposer, optimizationLayer, failureMode, momentum, strengthLayer, nutritionLayer, arbitration, expectations, memoryInsights = [], coachMemoryContext = null, realWorldNutrition, recalibration }) => {
  const s = detectCoachSignals(input);
  const voiceMode = inferCoachVoiceMode(momentum);
  const painLevel = inferPainLevel(input);
  const area = AFFECTED_AREAS.find(a => input.toLowerCase().includes(a.toLowerCase())) || "Achilles";

  const notices = [];
  const recommendations = [];
  const effects = [];
  const actions = [];
  const addRecommendation = (msg, confidence = "moderate") => recommendations.push(withConfidenceTone(msg, confidence, voiceMode));

  const last7 = Object.entries(logs || {}).filter(([d]) => ((Date.now() - new Date(`${d}T12:00:00`).getTime()) / 86400000) <= 7).length;
  const bwTrend = (bodyweights || []).length >= 2 ? (bodyweights[bodyweights.length - 1].w - bodyweights[0].w) : 0;

  if (s.pain || PAIN_LEVELS.includes(painLevel) && painLevel !== "none") {
    notices.push(`Pain signal detected (${painLevel.replaceAll("_", " ")} in ${area}).`);
    addRecommendation("de-load intensity today and switch to low-impact recovery while preserving momentum.", "high");
    effects.push("Hard run intensity is removed; recovery and tendon load management are prioritized.");
    actions.push(
      { type: COACH_TOOL_ACTIONS.SET_PAIN_STATE, payload: { level: painLevel === "none" ? "mild_tightness" : painLevel, area } },
      { type: COACH_TOOL_ACTIONS.SWAP_TODAY_RECOVERY, payload: { reason: "Achilles tightness detected" } },
      { type: COACH_TOOL_ACTIONS.ADD_ACHILLES_BLOCK, payload: { block: "extra_achilles_8min" } }
    );
  }

  if (s.travel || personalization?.travelState?.isTravelWeek) {
    notices.push("Travel context detected or active.");
    addRecommendation("switch to travel-ready training and meal defaults for consistency.", "moderate");
    effects.push("Plan friction is reduced with simpler sessions and portable meal options.");
    actions.push(
      { type: COACH_TOOL_ACTIONS.SWITCH_TRAVEL_MEALS, payload: { enabled: true } },
      { type: COACH_TOOL_ACTIONS.CHANGE_NUTRITION_DAY, payload: { dayType: "travelRun" } }
    );
  }

  if (s.missed || s.fatigue || learning?.stats?.harder >= 2 || salvage?.active) {
    notices.push(`Recovery signal detected (${s.missed ? "missed session + " : ""}${s.fatigue ? "fatigue" : "soreness"}).`);
    addRecommendation("reduce weekly density and prioritize completion of core sessions.", "high");
    effects.push("Hard sessions are down-shifted; consistency is prioritized over intensity.");
    actions.push(
      { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 15 } },
      { type: COACH_TOOL_ACTIONS.REPLACE_SPEED_EASY, payload: { week: currentWeek } }
    );
  }

  if ((s.running || todayWorkout?.type === "long") && nutritionLayer?.dayType === "longRun") {
    notices.push("Long-run fueling context active.");
    addRecommendation("increase pre-long-run carbs to improve quality and recovery.", "moderate");
    effects.push("Higher carb availability should improve long-run quality and reduce late-session fade.");
    actions.push({ type: COACH_TOOL_ACTIONS.INCREASE_PRELONGRUN_CARBS, payload: { grams: 40 } });
  }

  if (s.nutrition && nutritionLayer?.simplified) {
    notices.push("Nutrition friction detected; simplification mode already favored.");
    addRecommendation("anchor meals to defaults for 3-7 days and reduce decision load.", "high");
    actions.push({ type: COACH_TOOL_ACTIONS.CHANGE_NUTRITION_DAY, payload: { dayType: todayWorkout?.type === "rest" ? "rest" : "easyRun" } });
  }

  if (optimizationLayer?.adaptiveRecommendations?.reduceDensity) {
    notices.push("Optimization layer suggests density reduction.");
    addRecommendation("insert a deload week to improve confidence and freshness.", "moderate");
    effects.push("Expected: better adherence and improved session quality in the next 7-14 days.");
    actions.push({ type: COACH_TOOL_ACTIONS.INSERT_DELOAD_WEEK, payload: { week: currentWeek + 1 } });
  }

  if (failureMode?.mode === "chaotic" || failureMode?.isLowEngagement) {
    notices.push("Failure-mode hardening detected: chaotic or low engagement state.");
    addRecommendation("simplify the next 7 days with minimum-dose sessions and lower aggressiveness.", "high");
    effects.push("Expected: reduced overwhelm and improved follow-through this week.");
    actions.push({ type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 10 } });
  } else if (momentum?.momentumState === "building momentum") {
    notices.push("Momentum is building.");
    addRecommendation("apply a modest progression where readiness is high.", "moderate");
    actions.push({ type: COACH_TOOL_ACTIONS.PROGRESS_STRENGTH_EMPHASIS, payload: { weeks: 1 } });
  }

  if ((arbitration?.primary?.category === "strength" || s.strength) && momentum?.momentumState !== "falling off") {
    notices.push("Strength priority is active.");
    addRecommendation("shift one session toward pressing progression while keeping run quality protected.", "moderate");
    effects.push("Upper-body strength should progress with limited endurance interference.");
    actions.push({ type: COACH_TOOL_ACTIONS.PROGRESS_STRENGTH_EMPHASIS, payload: { weeks: 2 } });
  }

  if (arbitration?.primary?.category === "running" && (s.running || momentum?.fatigueNotes >= 2)) {
    notices.push("Run performance priority with fatigue constraints.");
    addRecommendation("dial back long run load slightly to protect consistency and recovery.", "high");
    effects.push("Run quality should remain higher across the week with lower burnout risk.");
    actions.push({ type: COACH_TOOL_ACTIONS.REDUCE_LONG_RUN_AGGRESSIVENESS, payload: { pct: 10 } });
  }

  if (arbitration?.primary?.category === "body_comp") {
    if (bwTrend <= -2.2 || nutritionLayer?.targets?.cal < 2300) {
      notices.push("Weight trend suggests deficit may be too aggressive.");
      addRecommendation("increase calories slightly to support adherence and performance.", "high");
      effects.push("Recovery and session quality should improve with minimal body-comp downside.");
      actions.push({ type: COACH_TOOL_ACTIONS.INCREASE_CALORIES_SLIGHTLY, payload: { kcal: 120 } });
    }
    if (learning?.stats?.skipped >= 2 || momentum?.inconsistencyRisk === "high") {
      notices.push("Adherence risk is elevated during body-comp phase.");
      addRecommendation("reduce deficit aggressiveness and simplify the food environment.", "high");
      actions.push({ type: COACH_TOOL_ACTIONS.REDUCE_DEFICIT_AGGRESSIVENESS, payload: { kcal: 100 } });
    }
  }

  if (nutritionLayer?.dayType && ["hardRun", "longRun", "travelRun"].includes(nutritionLayer.dayType)) {
    addRecommendation("shift more carbs pre/post workout to support quality output.", "moderate");
    actions.push({ type: COACH_TOOL_ACTIONS.SHIFT_CARBS_AROUND_WORKOUT, payload: { pre: 30, post: 40 } });
  }

  if (learning?.adjustmentBias === "simplify" || s.simplify) {
    notices.push("Check-ins show repeated friction (time/stress/hard sessions).");
    addRecommendation("run a simplified meal structure this week to lower cognitive load.", "high");
    actions.push({ type: COACH_TOOL_ACTIONS.SIMPLIFY_MEALS_THIS_WEEK, payload: { days: 7 } });
  }

  if (realWorldNutrition?.constraints?.includes("travel_logistics")) {
    notices.push("Real-world nutrition engine detects travel logistics constraints.");
    addRecommendation("activate travel nutrition mode with portable defaults.", "moderate");
    actions.push({ type: COACH_TOOL_ACTIONS.SWITCH_TRAVEL_NUTRITION_MODE, payload: { enabled: true } });
  }

  if (realWorldNutrition?.constraints?.includes("time_pressure")) {
    notices.push("Time pressure is likely to disrupt meal execution.");
    addRecommendation("use a default meal structure for 3 days to stabilize adherence.", "moderate");
    actions.push({ type: COACH_TOOL_ACTIONS.USE_DEFAULT_MEAL_STRUCTURE_3_DAYS, payload: { days: 3 } });
  }

  if (s.why) {
    effects.push(`Decision basis: momentum=${momentum?.momentumState || "unknown"}, risk=${momentum?.inconsistencyRisk || "unknown"}, salvage=${salvage?.active ? "on" : "off"}, coachMode=${momentum?.coachMode || "n/a"}.`);
    effects.push(`Goal arbitration: ${arbitration?.todayLine || "not available"}`);
    effects.push(`Expectation engine: ${expectations?.coachLine || "not available"}`);
  }

  if (coachMemoryContext?.injuryHistory?.length) {
    notices.push(`Injury history in view: ${coachMemoryContext.injuryHistory[0]}.`);
    addRecommendation("keep warm-up and tissue prep non-negotiable before intensity.", "moderate");
  }
  if (coachMemoryContext?.preferredMotivationStyle) {
    effects.push(`Coaching tone bias: ${coachMemoryContext.preferredMotivationStyle}.`);
  }
  if (coachMemoryContext?.recurringBreakdowns?.length) {
    const b = coachMemoryContext.recurringBreakdowns[0];
    notices.push(`Pattern remembered: week ${b.week} broke down from ${b.why}.`);
    addRecommendation(`front-load friction control for ${b.why} this week (shorter sessions + clearer anchors).`, "high");
  }

  if (memoryInsights?.length) {
    const m = memoryInsights[0];
    notices.push(`Memory cue: ${m.msg || m.key}`);
    effects.push(`Applied long-term memory (${m.key}) with ${m.confidence || "moderate"} confidence.`);
  }

  if (recalibration?.changes?.length) {
    notices.push(`Recalibration suggests: ${recalibration.changes[0]}`);
    effects.push(`Recalibration confidence: ${recalibration.confidence || "moderate"}.`);
  }

  if (!notices.length) notices.push(`You logged ${last7} sessions in the last 7 days with ${personalization.trainingState.loadStatus} load.`);
  if (!recommendations.length) addRecommendation("continue this week as planned and tighten execution quality.", "moderate");
  if (!effects.length) effects.push("Primary effect: better consistency with controlled fatigue and clearer nutrition anchors.");

  const dedupedActions = [];
  const seen = new Set();
  for (const a of actions) {
    const key = `${a.type}|${JSON.stringify(a.payload || {})}`;
    if (seen.has(key)) continue;
    seen.add(key);
    dedupedActions.push(a);
    if (dedupedActions.length >= 4) break;
  }

  return {
    notices: notices.slice(0, 5),
    recommendations: recommendations.slice(0, 5),
    effects: effects.slice(0, 5),
    actions: dedupedActions,
    meta: {
      mode: voiceMode,
      momentum: momentum?.momentumState || "unknown",
      risk: momentum?.inconsistencyRisk || "unknown",
      salvage: !!salvage?.active,
      planFocus: planComposer?.focus || "balanced",
      optimizationBias: optimizationLayer?.adjustmentBias || "hold",
      failureMode: failureMode?.mode || "normal",
      nutritionMode: nutritionLayer?.simplified ? "simplified" : "full",
      memoryApplied: !!coachMemoryContext,
    }
  };
};

export const applyCoachActionMutation = ({ action, runtime, currentWeek, todayWorkout, mergePersonalization, buildInjuryRuleResult, dateKey = new Date().toISOString().split("T")[0] }) => {
  let nextAdjustments = { ...runtime.adjustments, dayOverrides: { ...(runtime.adjustments.dayOverrides || {}) }, nutritionOverrides: { ...(runtime.adjustments.nutritionOverrides || {}) }, weekVolumePct: { ...(runtime.adjustments.weekVolumePct || {}) }, extra: { ...(runtime.adjustments.extra || {}) } };
  let nextWeekNotes = { ...runtime.weekNotes };
  let nextAlerts = [...runtime.planAlerts];
  let nextPersonalization = runtime.personalization;

  if (action.type === COACH_TOOL_ACTIONS.SWAP_TODAY_RECOVERY) {
    nextAdjustments.dayOverrides[dateKey] = { label: "Recovery Day Override", type: "rest", reason: action.payload.reason, nutri: "rest" };
    nextAlerts = [{ id:`coach_${Date.now()}`, type:"warning", msg:"Coach swapped today to recovery based on risk signals." }, ...nextAlerts].slice(0, 10);
  }
  if (action.type === COACH_TOOL_ACTIONS.SET_PAIN_STATE) {
    nextPersonalization = mergePersonalization(nextPersonalization, {
      injuryPainState: {
        ...nextPersonalization.injuryPainState,
        level: action.payload.level,
        area: action.payload.area || "Achilles",
        activeModifications: buildInjuryRuleResult(todayWorkout, { level: action.payload.level, area: action.payload.area || "Achilles" }).mods,
      }
    });
  }
  if (action.type === COACH_TOOL_ACTIONS.CLEAR_PAIN_STATE) {
    nextPersonalization = mergePersonalization(nextPersonalization, {
      injuryPainState: {
        ...nextPersonalization.injuryPainState,
        level: "none",
        activeModifications: [],
      }
    });
  }
  if (action.type === COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME) {
    nextAdjustments.weekVolumePct[currentWeek] = 100 - (action.payload.pct || 10);
    nextWeekNotes[currentWeek] = `Coach reduced this week volume by ${action.payload.pct || 10}% for recovery control.`;
  }
  if (action.type === COACH_TOOL_ACTIONS.CONVERT_RUN_TO_LOW_IMPACT || action.type === COACH_TOOL_ACTIONS.REPLACE_SPEED_EASY) {
    nextWeekNotes[currentWeek] = "Coach converted high intensity session to easy aerobic / low-impact work.";
  }
  if (action.type === COACH_TOOL_ACTIONS.ADD_ACHILLES_BLOCK) {
    nextAdjustments.extra.achillesBlock = "8-min protocol added daily";
    nextPersonalization = mergePersonalization(nextPersonalization, { injuryPainState: { ...nextPersonalization.injuryPainState, achilles: { ...nextPersonalization.injuryPainState.achilles, status: "watch", painScore: Math.max(2, nextPersonalization.injuryPainState.achilles.painScore) } } });
  }
  if (action.type === COACH_TOOL_ACTIONS.CHANGE_NUTRITION_DAY) {
    nextAdjustments.nutritionOverrides[dateKey] = action.payload.dayType;
  }
  if (action.type === COACH_TOOL_ACTIONS.INCREASE_PRELONGRUN_CARBS) {
    nextAdjustments.extra.preLongRunCarbBonus = action.payload.grams || 30;
    nextWeekNotes[currentWeek] = `Coach added +${action.payload.grams || 30}g carbs before long run.`;
  }
  if (action.type === COACH_TOOL_ACTIONS.SWITCH_TRAVEL_MEALS) {
    nextPersonalization = mergePersonalization(nextPersonalization, { travelState: { ...nextPersonalization.travelState, isTravelWeek: true, access: "hotel" } });
    nextAdjustments.nutritionOverrides[dateKey] = "travelRun";
  }
  if (action.type === COACH_TOOL_ACTIONS.MOVE_LONG_RUN) {
    nextWeekNotes[action.payload.week || currentWeek] = `Coach moved long run to ${action.payload.toDay || "Sunday"} this week.`;
  }
  if (action.type === COACH_TOOL_ACTIONS.INSERT_DELOAD_WEEK) {
    nextWeekNotes[action.payload.week] = "Coach inserted deload intent: reduce volume + cap intensity this week.";
    nextAdjustments.weekVolumePct[action.payload.week] = 85;
  }
  if (action.type === COACH_TOOL_ACTIONS.PROGRESS_STRENGTH_EMPHASIS) {
    nextWeekNotes[currentWeek] = "Coach emphasized strength progression for next 2 weeks (pressing priority).";
    nextAdjustments.extra.strengthEmphasisWeeks = action.payload.weeks || 2;
  }
  if (action.type === COACH_TOOL_ACTIONS.REDUCE_LONG_RUN_AGGRESSIVENESS) {
    nextWeekNotes[currentWeek] = `Coach reduced long-run aggressiveness by ${action.payload.pct || 10}% next week.`;
    nextAdjustments.extra.longRunReductionPct = action.payload.pct || 10;
  }
  if (action.type === COACH_TOOL_ACTIONS.INCREASE_CALORIES_SLIGHTLY) {
    nextAdjustments.extra.nutritionCalorieDelta = (nextAdjustments.extra.nutritionCalorieDelta || 0) + (action.payload.kcal || 120);
    nextWeekNotes[currentWeek] = `Coach increased nutrition target by ~${action.payload.kcal || 120} kcal/day.`;
  }
  if (action.type === COACH_TOOL_ACTIONS.REDUCE_DEFICIT_AGGRESSIVENESS) {
    nextAdjustments.extra.nutritionDeficitReduction = action.payload.kcal || 100;
    nextWeekNotes[currentWeek] = "Coach reduced deficit aggressiveness to protect adherence/performance.";
  }
  if (action.type === COACH_TOOL_ACTIONS.SHIFT_CARBS_AROUND_WORKOUT) {
    nextAdjustments.extra.carbShift = { pre: action.payload.pre || 30, post: action.payload.post || 40 };
    nextWeekNotes[currentWeek] = "Coach shifted carbs toward workout windows.";
  }
  if (action.type === COACH_TOOL_ACTIONS.SIMPLIFY_MEALS_THIS_WEEK) {
    nextAdjustments.extra.mealSimplicityMode = true;
    nextWeekNotes[currentWeek] = "Coach enabled simplified meal structure this week.";
  }
  if (action.type === COACH_TOOL_ACTIONS.SWITCH_TRAVEL_NUTRITION_MODE) {
    nextAdjustments.extra.travelNutritionMode = true;
    nextAdjustments.nutritionOverrides[dateKey] = "travelRun";
    nextWeekNotes[currentWeek] = "Coach switched nutrition strategy to travel mode.";
  }
  if (action.type === COACH_TOOL_ACTIONS.USE_DEFAULT_MEAL_STRUCTURE_3_DAYS) {
    nextAdjustments.extra.defaultMealStructureDays = action.payload.days || 3;
    nextWeekNotes[currentWeek] = `Coach enabled default meal structure for ${action.payload.days || 3} days.`;
  }
  return { adjustments: nextAdjustments, weekNotes: nextWeekNotes, planAlerts: nextAlerts, personalization: nextPersonalization };
};
