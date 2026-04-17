import { appendProvenanceSidecar, buildProvenanceEvent, PROVENANCE_ACTORS } from "./services/provenance-service.js";
import { AFFECTED_AREAS, normalizeInjuryArea } from "./services/injury-planning-service.js";
import {
  isHardNutritionDayType,
  isLongEnduranceNutritionDayType,
  normalizeNutritionDayType,
  NUTRITION_DAY_TYPES,
} from "./services/nutrition-day-taxonomy-service.js";

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

const sanitizeText = (value = "", maxLength = 120) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const clampNumberCoachEngine = (value, min, max, fallback = min) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
};

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
    pain: /(pain|hurt|achilles|ankle|foot|knee|shin|calf|hamstring|hip|back|shoulder|elbow|wrist|neck|injury|flare)/.test(msg),
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

const dedupeCoachLines = (lines = []) => {
  const seen = new Set();
  return (lines || []).filter((line) => {
    const key = sanitizeText(String(line || "").toLowerCase().replace(/\[[^\]]+\]/g, ""), 160);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const inferCoachPromptKind = (input = "", signals = {}) => {
  if (signals.pain) return "pain";
  if (signals.travel) return "travel";
  if (signals.missed) return "missed";
  if (signals.fatigue) return "fatigue";
  if (signals.progress) return "progress";
  if (signals.nutrition) return "nutrition";
  if (signals.why) return "why";
  return sanitizeText(input, 80) ? "status" : "status";
};

const buildCoachPacketSummary = ({
  promptKind = "status",
  todayWorkout = null,
  planningBasis = null,
  momentum = null,
  nutritionComparison = null,
  notices = [],
  recommendations = [],
  effects = [],
} = {}) => {
  const sessionLabel = sanitizeText(todayWorkout?.label || todayWorkout?.type || "today's session", 120) || "today's session";
  const basisLabel = sanitizeText(planningBasis?.activeProgramName || planningBasis?.activeStyleName || "", 80);
  const leadingRecommendation = sanitizeText(String(recommendations?.[0] || "").replace(/^[^:]+:\s*/i, "").replace(/\s*\[[^\]]+\]\s*$/i, ""), 180);
  const leadingEffect = sanitizeText(effects?.[0] || notices?.[0] || "", 180);

  if (promptKind === "travel") {
    return {
      promptKind,
      headline: `Travel day: keep ${sessionLabel} alive with the lowest-friction version.`,
      recommendedAction: "Use the travel-ready session and portable meal defaults instead of forcing the normal setup.",
      whyNow: "Travel changes setup, food access, and timing more than it changes the goal of the day.",
      watchFor: "Hotel-gym friction and missed meals.",
    };
  }
  if (promptKind === "fatigue") {
    return {
      promptKind,
      headline: "Recovery is the limiter today, not motivation.",
      recommendedAction: `Condense ${sessionLabel} and protect the next 48 hours instead of forcing full intensity.`,
      whyNow: "Poor sleep and fatigue hurt quality more than volume, so the clean win is a smaller repeatable session.",
      watchFor: "Worsening soreness, poor mechanics, or a second recovery hit tomorrow.",
    };
  }
  if (promptKind === "missed") {
    return {
      promptKind,
      headline: "Do not stack yesterday on top of today.",
      recommendedAction: `Let the missed session go and execute ${sessionLabel} cleanly instead of chasing training debt.`,
      whyNow: "Trying to make up missed work usually creates three messy days instead of one missed day.",
      watchFor: "The urge to add volume back immediately.",
    };
  }
  if (promptKind === "progress") {
    return {
      promptKind,
      headline: "Push one notch, not five.",
      recommendedAction: `Keep the full ${sessionLabel} and add one small progression only if the first half feels crisp.`,
      whyNow: "Good momentum supports a controlled progression, but the week should not jump in load from one excited prompt.",
      watchFor: "Session quality and next-day fatigue.",
    };
  }
  if (promptKind === "pain") {
    return {
      promptKind,
      headline: "Protect the irritated area first.",
      recommendedAction: `De-load ${sessionLabel}, use the low-impact option, and keep the pain response from escalating.`,
      whyNow: "Pain changes what is safe today more than any goal priority does.",
      watchFor: "Pain that sharpens, spreads, or changes how you move.",
    };
  }
  if (promptKind === "nutrition") {
    return {
      promptKind,
      headline: "Tighten the food decision that matters most today.",
      recommendedAction: leadingRecommendation || "Use the simplest meal structure that still supports training.",
      whyNow: nutritionComparison?.hasActual
        ? "Actual intake is more useful than assumptions, so nutrition adjustments should answer the real logged gap."
        : "When logging is light, the safest move is a low-friction default instead of fake precision.",
      watchFor: "Missed protein, missed carbs around training, or hydration lag.",
    };
  }
  return {
    promptKind,
    headline: basisLabel ? `${basisLabel}: current coach status.` : "Current coach status.",
    recommendedAction: leadingRecommendation || `Execute ${sessionLabel} as planned and log the actual result.`,
    whyNow: leadingEffect || `Momentum is ${sanitizeText(momentum?.momentumState || "unknown", 60)} and the coach is staying inside deterministic plan boundaries.`,
    watchFor: "Consistency, recovery, and whether today's session stays repeatable.",
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

const buildCoachBrief = ({ todayWorkout, momentum, nutritionLayer, nutritionComparison, notices, recommendations, effects, coachMemoryContext, planningBasis = null }) => {
  const chaotic = ["drifting", "falling off"].includes(momentum?.momentumState) || momentum?.inconsistencyRisk === "high";
  const lockedIn = momentum?.momentumState === "building momentum" && momentum?.inconsistencyRisk !== "high";
  const recoveryRisk = notices.some(n => /pain|recovery|fatigue|hardening/i.test(n));
  const basisSummary = sanitizeText(planningBasis?.planBasisExplanation?.basisSummary || planningBasis?.todayLine || "", 180);
  const basisDetail = sanitizeText(planningBasis?.planBasisExplanation?.personalizationSummary || planningBasis?.coachLine || "", 180);
  const adherenceLine = sanitizeText(planningBasis?.adherence?.summary || "", 180);
  const focusLine = recoveryRisk
    ? "Execute the reduced-load version cleanly and protect recovery quality today."
    : chaotic
    ? "Keep today simple and finishable so momentum stays alive."
    : lockedIn
    ? "Hit today with intent and quality—this is a progression day."
    : "Execute the planned session as written with clean control.";
  const workoutLine = todayWorkout?.minDay
    ? `${todayWorkout?.label || "Session"} — short version (${todayWorkout?.fallback || "20-30 minutes"}), then stop.`
    : `${todayWorkout?.label || "Session"} — ${todayWorkout?.run?.d || todayWorkout?.d || "30-45 minutes"} with ${todayWorkout?.success || "steady execution and controlled effort"}.`;
  const whyLines = [
    recommendations?.[0]?.replace(/\s*\[[^\]]+\]\s*$/, "") || "This recommendation reflects your current readiness and consistency pattern.",
    effects?.[0] || "The goal is to maximize useful training while minimizing relapse risk.",
    basisSummary || null,
    recoveryRisk ? "Reduced load is intentional today because recovery risk is elevated." : null,
    chaotic ? "Consistency beats optimization this week—stack completions first." : null,
  ].filter(Boolean).slice(0, 4);
  const nutritionLine = nutritionLayer?.targets
    ? `${Math.round(nutritionLayer.targets.p || 0)}g protein · ${Math.round(nutritionLayer.targets.cal || 0)} kcal · ${Math.round(nutritionLayer.targets.c || 0)}g carbs`
    : "Protein-first meals and normal intake today.";
  const nutritionActualLine = nutritionComparison?.hasActual
    ? `Actual nutrition: ${String(nutritionComparison.deviationKind || "unknown").replace(/_/g, " ")} · adherence ${nutritionComparison.adherence || "unknown"} · impact ${nutritionComparison.matters || "unknown"}`
    : "Actual nutrition: not logged yet.";
  const coachNote = coachMemoryContext?.recurringBreakdowns?.[0]
    ? `Last breakdown came from ${coachMemoryContext.recurringBreakdowns[0].why}; today we remove that friction before it starts.`
    : coachMemoryContext?.injuryHistory?.[0]
    ? `We remember your injury pattern, so warm-up quality and controlled load stay non-negotiable.`
    : lockedIn
    ? "You’re trending in the right direction—use today to build on that streak."
    : "Stay direct: complete today, log it, and move on.";

  return `TODAY'S FOCUS:\n${focusLine}\n\nWORKOUT:\n${workoutLine}\n\nWHY THIS TODAY:\n- ${whyLines.join("\n- ")}${basisDetail ? `\n\nPLAN BASIS:\n${basisDetail}` : ""}${adherenceLine ? `\n\nADHERENCE:\n${adherenceLine}` : ""}\n\nNUTRITION:\n${nutritionLine}\n${nutritionActualLine}\n\nCOACH NOTE:\n${coachNote}`;
};

export const deterministicCoachPacket = ({ input, todayWorkout, currentWeek, logs, bodyweights, personalization, learning, salvage, planComposer, optimizationLayer, failureMode, momentum, strengthLayer, nutritionLayer, nutritionActual = null, nutritionComparison = null, arbitration, expectations, memoryInsights = [], coachMemoryContext = null, realWorldNutrition, recalibration }) => {
  const s = detectCoachSignals(input);
  const promptKind = inferCoachPromptKind(input, s);
  const voiceMode = inferCoachVoiceMode(momentum);
  const painLevel = inferPainLevel(input);
  const area = normalizeInjuryArea(input) || "Achilles";
  const planningBasis = planComposer?.planningBasis || null;

  const notices = [];
  const recommendations = [];
  const effects = [];
  const actions = [];
  const addRecommendation = (msg, confidence = "moderate") => recommendations.push(withConfidenceTone(msg, confidence, voiceMode));

  if (planningBasis?.activeProgramName) {
    notices.push(`Active basis: ${planningBasis.activeProgramName}${planningBasis?.activeStyleName ? ` + ${planningBasis.activeStyleName}` : ""}.`);
    if (planningBasis?.compromiseLine) effects.push(planningBasis.compromiseLine);
    if (planningBasis?.adherence?.summary) effects.push(planningBasis.adherence.summary);
  } else if (planningBasis?.activeStyleName) {
    notices.push(`Style influence active: ${planningBasis.activeStyleName}.`);
  }

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
      { type: COACH_TOOL_ACTIONS.CHANGE_NUTRITION_DAY, payload: { dayType: NUTRITION_DAY_TYPES.travelEndurance } }
    );
  }

  if (s.missed) {
    notices.push("Missed-session context detected.");
    addRecommendation("do not stack missed work on top of today; keep today's key session and let yesterday go.", "high");
    effects.push("The week stays more stable when you stop chasing missed volume and return to the current day.");
    actions.push({ type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 10, reason: "missed_session_reset" } });
  }

  if (s.fatigue || learning?.stats?.harder >= 2 || salvage?.active) {
    notices.push(`Recovery signal detected (${s.fatigue ? "fatigue" : "soreness"}).`);
    addRecommendation("reduce weekly density and prioritize completion of core sessions.", "high");
    effects.push("Hard sessions are down-shifted; consistency is prioritized over intensity.");
    actions.push(
      { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 15 } },
      { type: COACH_TOOL_ACTIONS.REPLACE_SPEED_EASY, payload: { week: currentWeek } }
    );
  }

  if ((s.running || todayWorkout?.type === "long") && isLongEnduranceNutritionDayType(nutritionLayer?.dayType || "")) {
    notices.push("Long-run fueling context active.");
    addRecommendation("increase pre-long-run carbs to improve quality and recovery.", "moderate");
    effects.push("Higher carb availability should improve long-run quality and reduce late-session fade.");
    actions.push({ type: COACH_TOOL_ACTIONS.INCREASE_PRELONGRUN_CARBS, payload: { grams: 40 } });
  }

  if (s.nutrition && nutritionLayer?.simplified) {
    notices.push("Nutrition friction detected; simplification mode already favored.");
    addRecommendation("anchor meals to defaults for 3-7 days and reduce decision load.", "high");
    actions.push({
      type: COACH_TOOL_ACTIONS.CHANGE_NUTRITION_DAY,
      payload: {
        dayType: todayWorkout?.type === "rest" ? NUTRITION_DAY_TYPES.recovery : NUTRITION_DAY_TYPES.runEasy,
      },
    });
  }

  if (nutritionComparison?.hasActual && nutritionComparison?.deviationKind === "under_fueled") {
    notices.push("Actual nutrition suggests you under-fueled relative to plan.");
    addRecommendation("protect recovery by adding a low-friction protein + carb anchor today.", nutritionComparison?.matters === "high" ? "high" : "moderate");
    effects.push("Fueling gap is called out explicitly so tomorrow's training quality is easier to protect.");
  }
  if (nutritionComparison?.hasActual && nutritionComparison?.deviationKind === "over_indulged") {
    notices.push("Actual nutrition overshot the intended plan.");
    addRecommendation("reset with the next planned meal instead of compensating aggressively.", "moderate");
  }
  if (nutritionComparison?.hasActual && nutritionComparison?.deviationKind === "deviated") {
    notices.push("Actual nutrition drifted from the prescribed structure.");
  }
  if (nutritionActual?.hydration?.pct != null && nutritionActual.hydration.pct < 60) {
    notices.push("Hydration is still below target.");
    addRecommendation("close the hydration gap before evening so recovery is less compromised.", "moderate");
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

  if (s.progress) {
    notices.push("You asked for a progression check.");
    addRecommendation("keep the full session and add only one small progression if quality stays high.", "moderate");
    effects.push("Progression is capped so today's enthusiasm does not quietly rewrite the week's load.");
    actions.push({ type: COACH_TOOL_ACTIONS.PROGRESS_STRENGTH_EMPHASIS, payload: { weeks: 1, reason: "progress_prompt" } });
  }

  if (nutritionLayer?.dayType && isHardNutritionDayType(nutritionLayer.dayType)) {
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
  const dedupedNotices = dedupeCoachLines(notices).slice(0, 4);
  const dedupedRecommendations = dedupeCoachLines(recommendations).slice(0, 4);
  const dedupedEffects = dedupeCoachLines(effects).slice(0, 4);
  const summary = buildCoachPacketSummary({
    promptKind,
    todayWorkout,
    planningBasis,
    momentum,
    nutritionComparison,
    notices: dedupedNotices,
    recommendations: dedupedRecommendations,
    effects: dedupedEffects,
  });

  return {
    notices: dedupedNotices,
    recommendations: dedupedRecommendations,
    effects: dedupedEffects,
    actions: dedupedActions,
    summary,
    coachBrief: buildCoachBrief({
      todayWorkout,
      momentum,
      nutritionLayer,
      nutritionComparison,
      notices: dedupedNotices,
      recommendations: dedupedRecommendations,
      effects: dedupedEffects,
      coachMemoryContext,
      planningBasis,
    }),
    meta: {
      promptKind,
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

const sanitizeCoachActionPayload = (type, payload = {}) => {
  if (type === COACH_TOOL_ACTIONS.SET_PAIN_STATE) {
    return {
      level: PAIN_LEVELS.includes(payload?.level) ? payload.level : "mild_tightness",
      area: AFFECTED_AREAS.includes(payload?.area) ? payload.area : "Achilles",
    };
  }
  if (type === COACH_TOOL_ACTIONS.CLEAR_PAIN_STATE) return {};
  if (type === COACH_TOOL_ACTIONS.SWAP_TODAY_RECOVERY) {
    return { reason: sanitizeText(payload?.reason || "protect_day", 80) || "protect_day" };
  }
  if (type === COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME || type === COACH_TOOL_ACTIONS.REDUCE_LONG_RUN_AGGRESSIVENESS) {
    return { pct: clampNumberCoachEngine(payload?.pct, 5, 40, 10), reason: sanitizeText(payload?.reason || "", 80) };
  }
  if (type === COACH_TOOL_ACTIONS.CONVERT_RUN_TO_LOW_IMPACT || type === COACH_TOOL_ACTIONS.REPLACE_SPEED_EASY) {
    return { week: clampNumberCoachEngine(payload?.week, 1, 52, 1), reason: sanitizeText(payload?.reason || "", 80) };
  }
  if (type === COACH_TOOL_ACTIONS.ADD_ACHILLES_BLOCK) {
    return { block: sanitizeText(payload?.block || "extra_achilles_8min", 60) || "extra_achilles_8min" };
  }
  if (type === COACH_TOOL_ACTIONS.CHANGE_NUTRITION_DAY) {
    const dayType = sanitizeText(payload?.dayType || "", 40);
    return dayType ? { dayType, reason: sanitizeText(payload?.reason || "", 80) } : null;
  }
  if (type === COACH_TOOL_ACTIONS.INCREASE_PRELONGRUN_CARBS) {
    return { grams: clampNumberCoachEngine(payload?.grams, 10, 120, 30), reason: sanitizeText(payload?.reason || "", 80) };
  }
  if (type === COACH_TOOL_ACTIONS.SWITCH_TRAVEL_MEALS || type === COACH_TOOL_ACTIONS.SWITCH_TRAVEL_NUTRITION_MODE) {
    return { enabled: payload?.enabled !== false, reason: sanitizeText(payload?.reason || "", 80) };
  }
  if (type === COACH_TOOL_ACTIONS.MOVE_LONG_RUN) {
    return {
      days: clampNumberCoachEngine(payload?.days, 1, 3, 1),
      toDay: sanitizeText(payload?.toDay || "", 20),
      week: clampNumberCoachEngine(payload?.week, 1, 52, 1),
      reason: sanitizeText(payload?.reason || "", 80),
    };
  }
  if (type === COACH_TOOL_ACTIONS.INSERT_DELOAD_WEEK) {
    return { week: clampNumberCoachEngine(payload?.week, 1, 52, 1), reason: sanitizeText(payload?.reason || "", 80) };
  }
  if (type === COACH_TOOL_ACTIONS.PROGRESS_STRENGTH_EMPHASIS) {
    return { weeks: clampNumberCoachEngine(payload?.weeks, 1, 4, 1), reason: sanitizeText(payload?.reason || "", 80) };
  }
  if (type === COACH_TOOL_ACTIONS.INCREASE_CALORIES_SLIGHTLY || type === COACH_TOOL_ACTIONS.REDUCE_DEFICIT_AGGRESSIVENESS) {
    return { kcal: clampNumberCoachEngine(payload?.kcal, 50, 300, 120), reason: sanitizeText(payload?.reason || "", 80) };
  }
  if (type === COACH_TOOL_ACTIONS.SHIFT_CARBS_AROUND_WORKOUT) {
    return {
      pre: clampNumberCoachEngine(payload?.pre, 0, 120, 30),
      post: clampNumberCoachEngine(payload?.post, 0, 120, 40),
      reason: sanitizeText(payload?.reason || "", 80),
    };
  }
  if (type === COACH_TOOL_ACTIONS.SIMPLIFY_MEALS_THIS_WEEK || type === COACH_TOOL_ACTIONS.USE_DEFAULT_MEAL_STRUCTURE_3_DAYS) {
    return { days: clampNumberCoachEngine(payload?.days, 1, 7, 3), reason: sanitizeText(payload?.reason || "", 80) };
  }
  return cloneUnsupportedPayload(payload);
};

const cloneUnsupportedPayload = (payload = {}) => {
  try {
    return JSON.parse(JSON.stringify(payload || {}));
  } catch {
    return {};
  }
};

const inferCoachProposalActor = (proposalSource = "") => (
  /ai|llm/i.test(String(proposalSource || "")) ? PROVENANCE_ACTORS.aiInterpretation : PROVENANCE_ACTORS.deterministicEngine
);

export const acceptCoachActionProposal = ({ action = null, allowedActions = Object.values(COACH_TOOL_ACTIONS), proposalSource = "coach_surface" } = {}) => {
  if (!action || typeof action !== "object") {
    return { accepted: null, rejected: ["action_missing"] };
  }
  const type = sanitizeText(action?.type || "", 80);
  if (!type || !allowedActions.includes(type)) {
    return { accepted: null, rejected: [`action_type_not_allowed:${type || "unknown"}`] };
  }
  const payload = sanitizeCoachActionPayload(type, action?.payload || {});
  if (payload == null) {
    return { accepted: null, rejected: [`action_payload_invalid:${type}`] };
  }
  const acceptedAt = Date.now();
  const normalizedProposalSource = sanitizeText(action?.proposalSource || proposalSource, 40) || proposalSource;
  const rationale = sanitizeText(action?.rationale || action?.reason || action?.payload?.reason || "", 160);
  return {
    accepted: {
      type,
      payload,
      rationale,
      proposalSource: normalizedProposalSource,
      acceptedBy: "deterministic_gate",
      acceptancePolicy: "acceptance_only",
      provenance: buildProvenanceEvent({
        actor: inferCoachProposalActor(normalizedProposalSource),
        trigger: normalizedProposalSource || "coach_surface",
        mutationType: "coach_action_acceptance",
        revisionReason: rationale || `Accepted coach action ${type.replace(/_/g, " ").toLowerCase()}.`,
        sourceInputs: [
          "coach_action_proposal",
          type,
          normalizedProposalSource || "coach_surface",
        ],
        confidence: "medium",
        timestamp: acceptedAt,
        details: {
          actionType: type,
          acceptedBy: "deterministic_gate",
          acceptancePolicy: "acceptance_only",
        },
      }),
    },
    rejected: [],
  };
};

export const applyCoachActionMutation = ({ action, runtime, currentWeek, todayWorkout, mergePersonalization, buildInjuryRuleResult, dateKey = new Date().toISOString().split("T")[0] }) => {
  let nextAdjustments = { ...runtime.adjustments, dayOverrides: { ...(runtime.adjustments.dayOverrides || {}) }, nutritionOverrides: { ...(runtime.adjustments.nutritionOverrides || {}) }, weekVolumePct: { ...(runtime.adjustments.weekVolumePct || {}) }, extra: { ...(runtime.adjustments.extra || {}) } };
  let nextWeekNotes = { ...runtime.weekNotes };
  let nextAlerts = [...runtime.planAlerts];
  let nextPersonalization = runtime.personalization;
  const mutationAt = Date.now();
  const actionProvenance = buildProvenanceEvent(action?.provenance || {
    actor: inferCoachProposalActor(action?.proposalSource || action?.source || "coach_surface"),
    trigger: action?.proposalSource || action?.source || "coach_surface",
    mutationType: "coach_action_acceptance",
    revisionReason: action?.rationale || action?.payload?.reason || action?.reason || action?.type || "coach action",
    sourceInputs: [
      "coach_action_proposal",
      action?.type || "unknown",
    ],
    confidence: "medium",
    timestamp: mutationAt,
    details: {
      actionType: action?.type || "",
    },
  });

  if (action.type === COACH_TOOL_ACTIONS.SWAP_TODAY_RECOVERY) {
    nextAdjustments.dayOverrides[dateKey] = {
      label: "Recovery Day Override",
      type: "rest",
      reason: action.payload.reason,
      nutri: NUTRITION_DAY_TYPES.recovery,
      provenance: actionProvenance,
    };
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
    nextAdjustments.extra = appendProvenanceSidecar(nextAdjustments.extra, "weekVolumeByWeek", currentWeek, actionProvenance);
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
    nextAdjustments.nutritionOverrides[dateKey] = {
      dayType: normalizeNutritionDayType(action.payload.dayType, NUTRITION_DAY_TYPES.runEasy),
      reason: action.payload.reason || action.rationale || "coach_action",
      provenance: actionProvenance,
    };
  }
  if (action.type === COACH_TOOL_ACTIONS.INCREASE_PRELONGRUN_CARBS) {
    nextAdjustments.extra.preLongRunCarbBonus = action.payload.grams || 30;
    nextWeekNotes[currentWeek] = `Coach added +${action.payload.grams || 30}g carbs before long run.`;
  }
  if (action.type === COACH_TOOL_ACTIONS.SWITCH_TRAVEL_MEALS) {
    nextPersonalization = mergePersonalization(nextPersonalization, { travelState: { ...nextPersonalization.travelState, isTravelWeek: true, access: "hotel" } });
    nextAdjustments.nutritionOverrides[dateKey] = {
      dayType: NUTRITION_DAY_TYPES.travelEndurance,
      reason: action.payload.reason || action.rationale || "travel_meal_switch",
      provenance: actionProvenance,
    };
  }
  if (action.type === COACH_TOOL_ACTIONS.MOVE_LONG_RUN) {
    nextWeekNotes[action.payload.week || currentWeek] = `Coach moved long run to ${action.payload.toDay || "Sunday"} this week.`;
  }
  if (action.type === COACH_TOOL_ACTIONS.INSERT_DELOAD_WEEK) {
    nextWeekNotes[action.payload.week] = "Coach inserted deload intent: reduce volume + cap intensity this week.";
    nextAdjustments.weekVolumePct[action.payload.week] = 85;
    nextAdjustments.extra = appendProvenanceSidecar(nextAdjustments.extra, "weekVolumeByWeek", action.payload.week, actionProvenance);
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
    nextAdjustments.nutritionOverrides[dateKey] = {
      dayType: NUTRITION_DAY_TYPES.travelEndurance,
      reason: action.payload.reason || action.rationale || "travel_nutrition_mode",
      provenance: actionProvenance,
    };
    nextWeekNotes[currentWeek] = "Coach switched nutrition strategy to travel mode.";
  }
  if (action.type === COACH_TOOL_ACTIONS.USE_DEFAULT_MEAL_STRUCTURE_3_DAYS) {
    nextAdjustments.extra.defaultMealStructureDays = action.payload.days || 3;
    nextWeekNotes[currentWeek] = `Coach enabled default meal structure for ${action.payload.days || 3} days.`;
  }
  return { adjustments: nextAdjustments, weekNotes: nextWeekNotes, planAlerts: nextAlerts, personalization: nextPersonalization };
};
