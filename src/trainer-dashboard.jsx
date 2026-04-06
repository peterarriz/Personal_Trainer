import { useState, useEffect, useRef, useMemo } from "react";
import { DEFAULT_PLANNING_HORIZON_WEEKS, composeGoalNativePlan, getHorizonAnchor, buildRollingHorizonWeeks } from "./modules-planning.js";
import { createAuthStorageModule } from "./modules-auth-storage.js";
import { getGoalContext, deriveAdaptiveNutrition, deriveRealWorldNutritionEngine, LOCAL_PLACE_TEMPLATES, getPlaceRecommendations, buildGroceryBasket } from "./modules-nutrition.js";
import { DEFAULT_DAILY_CHECKIN, CHECKIN_STATUS_OPTIONS, CHECKIN_FEEL_OPTIONS, CHECKIN_BLOCKER_OPTIONS, parseMicroCheckin, deriveClosedLoopValidationLayer, isWithinGracePeriod, resolveEffectiveStatus } from "./modules-checkins.js";
import { COACH_TOOL_ACTIONS, AFFECTED_AREAS, withConfidenceTone, deterministicCoachPacket, applyCoachActionMutation } from "./modules-coach-engine.js";

// ── PROFILE ──────────────────────────────────────────────────────────────────
const PROFILE = {
  name: "Athlete", height: "6'1\"", weight: 190, age: 30,
  goalRace: "July 19, 2026", goalTime: "1:45:00", goalPace: "8:01/mi",
  startDate: new Date("2026-03-23"),
  tdee: 3100,
  pushUpMax: 33,
};

// ── PLAN DATA ─────────────────────────────────────────────────────────────────
const PHASE_ZONES = {
  "BASE":     { easy:"10:15–10:30", tempo:"8:45–8:55", int:"8:00–8:10", long:"10:15–10:30", color:"#4ade80" },
  "BUILDING": { easy:"10:00–10:15", tempo:"8:38–8:48", int:"7:55–8:05", long:"10:00–10:15", color:"#60a5fa" },
  "PEAKBUILD":{ easy:"9:50–10:05",  tempo:"8:30–8:40", int:"7:50–8:00", long:"9:50–10:05",  color:"#f59e0b" },
  "PEAK":     { easy:"9:45–10:00",  tempo:"8:28–8:35", int:"7:45–7:55", long:"9:45–10:00",  color:"#f87171" },
  "TAPER":    { easy:"9:45–10:00",  tempo:"8:28–8:01🎯",int:"7:45–7:55",long:"9:45–10:00",  color:"#c084fc" },
};

const WEEKS = [
  { w:1,  phase:"BASE",     label:"Getting legs back",        mon:{t:"Easy",d:"3 mi"},     thu:{t:"Tempo",d:"2mi WU+20min+1mi CD"},    fri:{t:"Easy",d:"4 mi"},   sat:{t:"Long",d:"4 mi"},   str:"A", nutri:"easyRun" },
  { w:2,  phase:"BASE",     label:"Building rhythm",          mon:{t:"Easy",d:"3 mi"},     thu:{t:"Tempo",d:"2mi WU+25min+1mi CD"},    fri:{t:"Easy",d:"4 mi"},   sat:{t:"Long",d:"5 mi"},   str:"A", nutri:"easyRun" },
  { w:3,  phase:"BASE",     label:"First intervals",          mon:{t:"Easy",d:"3.5 mi"},   thu:{t:"Intervals",d:"1mi+3×8min/3min+1mi"},fri:{t:"Easy",d:"4.5 mi"}, sat:{t:"Long",d:"5 mi"},   str:"A", nutri:"hardRun" },
  { w:4,  phase:"BASE",     label:"⬇ Cutback",  cutback:true, mon:{t:"Easy",d:"3 mi"},     thu:{t:"Tempo",d:"1mi WU+20min easy+1mi"},  fri:{t:"Easy",d:"3 mi"},   sat:{t:"Long",d:"4 mi"},   str:"A", nutri:"easyRun" },
  { w:5,  phase:"BUILDING", label:"New territory",            mon:{t:"Easy",d:"3.5 mi"},   thu:{t:"Tempo",d:"2mi WU+30min+1mi CD"},    fri:{t:"Easy",d:"5 mi"},   sat:{t:"Long",d:"6 mi"},   str:"B", nutri:"easyRun" },
  { w:6,  phase:"BUILDING", label:"Speed sharpening",         mon:{t:"Easy",d:"4 mi"},     thu:{t:"Intervals",d:"1mi+4×6min/2min+1mi"},fri:{t:"Easy",d:"5 mi"},   sat:{t:"Long",d:"7 mi"},   str:"B", nutri:"hardRun" },
  { w:7,  phase:"BUILDING", label:"Dialing in",               mon:{t:"Easy",d:"4 mi"},     thu:{t:"Tempo",d:"2mi WU+35min+1mi CD"},    fri:{t:"Easy",d:"5.5 mi"}, sat:{t:"Long",d:"7 mi"},   str:"B", nutri:"easyRun" },
  { w:8,  phase:"BUILDING", label:"⬇ Cutback",  cutback:true, mon:{t:"Easy",d:"3 mi"},     thu:{t:"Tempo",d:"1mi WU+20min+1mi"},       fri:{t:"Easy",d:"4 mi"},   sat:{t:"Long",d:"5 mi"},   str:"B", nutri:"easyRun" },
  { w:9,  phase:"PEAKBUILD",label:"Double digits incoming",   mon:{t:"Easy",d:"4 mi"},     thu:{t:"Intervals",d:"1mi+4×8min/3min+1mi"},fri:{t:"Easy",d:"6 mi"},   sat:{t:"Long",d:"8 mi"},   str:"A", nutri:"hardRun" },
  { w:10, phase:"PEAKBUILD",label:"Pushing toward 9",         mon:{t:"Easy",d:"4.5 mi"},   thu:{t:"Tempo",d:"2mi WU+40min+1mi CD"},    fri:{t:"Easy",d:"6 mi"},   sat:{t:"Long",d:"9 mi"},   str:"A", nutri:"easyRun" },
  { w:11, phase:"PEAKBUILD",label:"Holding strong",           mon:{t:"Easy",d:"4.5 mi"},   thu:{t:"Intervals",d:"1mi+5×6min/2min+1mi"},fri:{t:"Easy",d:"6.5 mi"}, sat:{t:"Long",d:"9 mi"},   str:"A", nutri:"hardRun" },
  { w:12, phase:"PEAKBUILD",label:"⬇ Cutback",  cutback:true, mon:{t:"Easy",d:"3.5 mi"},   thu:{t:"Tempo",d:"1mi WU+25min+1mi"},       fri:{t:"Easy",d:"4 mi"},   sat:{t:"Long",d:"5 mi"},   str:"A", nutri:"easyRun" },
  { w:13, phase:"PEAK",     label:"Double digits",            mon:{t:"Easy",d:"5 mi"},     thu:{t:"Tempo",d:"2mi WU+45min+1mi CD"},    fri:{t:"Easy",d:"7 mi"},   sat:{t:"Long",d:"10 mi"},  str:"B", nutri:"easyRun" },
  { w:14, phase:"PEAK",     label:"Biggest week",             mon:{t:"Easy",d:"5 mi"},     thu:{t:"Intervals",d:"1mi+5×8min/3min+1mi"},fri:{t:"Easy",d:"7 mi"},   sat:{t:"Long",d:"11 mi"},  str:"B", nutri:"hardRun" },
  { w:15, phase:"PEAK",     label:"Peak complete",            mon:{t:"Easy",d:"5 mi"},     thu:{t:"Tempo",d:"2mi WU+45min+1mi CD"},    fri:{t:"Easy",d:"7 mi"},   sat:{t:"Long",d:"12 mi"},  str:"B", nutri:"easyRun" },
  { w:16, phase:"TAPER",    label:"Back off",                 mon:{t:"Easy",d:"4 mi"},     thu:{t:"Tempo",d:"1mi WU+30min+1mi"},       fri:{t:"Easy",d:"5 mi"},   sat:{t:"Long",d:"9 mi"},   str:"A", nutri:"easyRun" },
  { w:17, phase:"TAPER",    label:"Final sharpening",         mon:{t:"Easy",d:"3 mi"},     thu:{t:"Tempo",d:"1mi WU+20min@8:01+1mi"},  fri:{t:"Easy",d:"4 mi"},   sat:{t:"Long",d:"6 mi"},   str:"A", nutri:"easyRun" },
  { w:18, phase:"TAPER",    label:"🏁 Race Week", race:true,   mon:{t:"Easy",d:"3 mi shakeout"},thu:{t:"Easy",d:"2mi+strides"},        fri:{t:"Easy",d:"Rest/walk"},sat:{t:"Long",d:"🏁 13.1 mi"},str:null, nutri:"longRun" },
];

const STRENGTH = {
  A: {
    home: [
      { ex:"Wide Push-up", sets:"4×20", note:"Slow 3-count down. Outer chest." },
      { ex:"Standard Push-up", sets:"4×20", note:"Perfect form. 2 down, 1 up." },
      { ex:"Diamond Push-up", sets:"4×15", note:"Triceps. Rest 45 sec between sets." },
      { ex:"Decline Push-up (feet elevated)", sets:"3×15", note:"Upper chest emphasis." },
      { ex:"Band Chest Fly", sets:"4×15", note:"2-sec hold at center squeeze." },
      { ex:"Band Bicep Curl (slow)", sets:"4×15", note:"3-sec lower. No swinging." },
      { ex:"Band Tricep Overhead Extension", sets:"4×15", note:"Full lockout each rep." },
      { ex:"Plank to Push-up", sets:"3×10 each", note:"Core stability + chest combo." },
      { ex:"Dead Bug", sets:"3×12 each side", note:"Low back glued to floor." },
    ],
    hotel: [
      { ex:"Barbell Bench Press", sets:"5×5 → 4×8", note:"Start at ~135 lbs. Progressive overload weekly." },
      { ex:"Incline DB Press", sets:"4×10", note:"30-45° angle. Full stretch at bottom." },
      { ex:"Cable Chest Fly", sets:"4×12", note:"Slight forward lean. Squeeze hard at center." },
      { ex:"EZ Bar Curl", sets:"4×10", note:"Strict form. No body english." },
      { ex:"Hammer Curl", sets:"3×12 each", note:"Brachialis hit. Control the lower." },
      { ex:"Tricep Pushdown (cable)", sets:"4×12", note:"Elbows pinned to sides." },
      { ex:"Overhead Tricep Extension (cable)", sets:"3×12", note:"Full stretch overhead." },
      { ex:"Ab Wheel / Cable Crunch", sets:"4×15", note:"Slow. Feel the abs, not the hip flexors." },
    ]
  },
  B: {
    home: [
      { ex:"Push-up Complex (3 rounds)", sets:"Wide×15 → Std×15 → Diamond×12", note:"No rest within round. 90 sec between rounds. This is the abs killer too." },
      { ex:"Band Chest Press (one arm)", sets:"3×12 each", note:"Unilateral press challenges core stability." },
      { ex:"Band Bent-over Row", sets:"4×15", note:"Row to chest. Posture for racing." },
      { ex:"Band Overhead Press", sets:"4×12", note:"Stand on band. Full extension." },
      { ex:"Band Pull-Apart", sets:"4×20", note:"Straight arms. Rear delts + posture." },
      { ex:"Band Lateral Raise", sets:"3×12", note:"Slow lower. Don't shrug." },
      { ex:"Hollow Body Hold", sets:"4×30 sec", note:"THE abs exercise. Lower back pressed down, legs low." },
      { ex:"Bicycle Crunch", sets:"3×20 each side", note:"Controlled. Don't yank the neck." },
      { ex:"Leg Raise", sets:"4×15", note:"Lower abs. Slow lower, don't let them crash." },
    ],
    hotel: [
      { ex:"Incline Barbell Press", sets:"4×8", note:"Upper chest. Control the eccentric." },
      { ex:"DB Fly (flat)", sets:"4×12", note:"Wide arc. Deep stretch." },
      { ex:"Cable Row (seated)", sets:"4×12", note:"Full retraction at top." },
      { ex:"Face Pull", sets:"4×15", note:"External rotation. Protects shoulders for runners." },
      { ex:"Dips (weighted if possible)", sets:"4×10", note:"Lean slightly forward for chest emphasis." },
      { ex:"Cable Crunch", sets:"4×15", note:"Round the spine. Abs only." },
      { ex:"Hanging Leg Raise", sets:"4×12", note:"Full hang. Legs to 90°. Core only." },
      { ex:"Plank Variations", sets:"3×60 sec each", note:"Standard, side L, side R. Squeeze everything." },
    ]
  }
};

const ACHILLES = [
  { ex:"Eccentric Heel Drop (bilateral wks 1-4, single-leg wks 5+)", sets:"3×15 each leg", note:"The #1 exercise. 4-sec lower. Do EVERY day." },
  { ex:"Calf Stretch (straight leg)", sets:"2×60 sec each", note:"Deep stretch. Hold it." },
  { ex:"Calf Stretch (bent knee)", sets:"2×60 sec each", note:"Targets soleus → Achilles directly." },
  { ex:"Ankle Circles + Alphabet", sets:"1× each ankle", note:"Full mobility." },
  { ex:"Glute Bridge", sets:"3×15", note:"Strong glutes = less Achilles compensation." },
];

// ── HELPERS ───────────────────────────────────────────────────────────────────
const getCurrentWeek = () => {
  const now = new Date();
  const diff = (now - PROFILE.startDate) / (1000 * 60 * 60 * 24 * 7);
  return Math.max(1, Math.ceil(diff));
};

const getDayOfWeek = () => {
  return new Date().getDay(); // 0=Sun,1=Mon,...,6=Sat
};

const getTodayWorkout = (weekNum, dayNum) => {
  const week = WEEKS[(weekNum - 1) % WEEKS.length];
  if (!week) return null;
  const zones = PHASE_ZONES[week.phase];
  const dayMap = {
    1: { type: "run+strength", run: week.mon, strSess: week.str, label: "Easy Run + Strength A" },
    2: { type: "otf", label: "Orange Theory — Hybrid Day" },
    3: { type: "strength+prehab", strSess: week.str === "A" ? "B" : "A", label: "Strength B + Achilles Prehab" },
    4: { type: "hard-run", run: week.thu, label: `${week.thu?.t} Run` },
    5: { type: "easy-run", run: week.fri, label: "Easy Run" },
    6: { type: "long-run", run: week.sat, label: "Long Run" },
    0: { type: "rest", label: "Full Rest + Mobility" },
  };
  return { ...dayMap[dayNum], week, zones };
};

const dayColors = { "run+strength":"#4ade80", otf:"#f59e0b", "strength+prehab":"#60a5fa", "hard-run":"#f87171", "easy-run":"#a3e635", "long-run":"#f87171", rest:"#334155" };
const C = { green:"#4ade80", blue:"#60a5fa", amber:"#f59e0b", red:"#f87171", purple:"#c084fc", lime:"#a3e635", slate:"#475569" };
const DAY_CONTEXT_OVERRIDES = {
  busy_day: {
    label: "Busy Day Override",
    type: "rest",
    nutri: "easyRun",
    fallback: "10–15 min brisk walk + mobility",
    success: "Today = just show up for 10–20 minutes and hit protein target.",
  },
  low_energy_day: {
    label: "Low Energy Override",
    type: "easy-run",
    nutri: "rest",
    fallback: "15–20 min zone-2 easy movement",
    success: "Today = 20 minutes + recovery nutrition + early sleep.",
  },
  travel_day: {
    label: "Travel Day Override",
    type: "rest",
    nutri: "travelRun",
    fallback: "Hotel circuit 12 min (push-up, squat, plank)",
    success: "Today = keep momentum alive with minimum viable session.",
  },
  social_event_day: {
    label: "Social/Event Day Override",
    type: "rest",
    nutri: "rest",
    fallback: "10 min walk before event + hydration",
    success: "Today = don’t break the streak: minimum session + simple meal anchor.",
  },
  minimum_viable_day: {
    label: "Minimum Viable Day",
    type: "rest",
    nutri: "easyRun",
    fallback: "10–20 min fallback: 5 min mobility + 10 min easy cardio + 2 sets push/pull/core",
    success: "Today = minimum effective work, no guilt, preserve momentum.",
  },
};

const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
const safeFetchWithTimeout = async (url, options = {}, timeoutMs = 8500) => {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
};

const DEFAULT_PERSONALIZATION = {
  profile: {
    name: "Athlete",
    trainingAgeYears: 4,
    preferredCoachingTone: "direct",
    preferredTrainingStyle: "hybrid",
    goalMix: "aesthetics + endurance + strength",
    estimatedFitnessLevel: "intermediate",
    preferredEnvironments: ["home", "limited gym", "full gym", "travel"],
    inconsistencyRisk: "medium",
    currentMomentumState: "stable",
    likelyAdherencePattern: "needs low friction on chaotic weeks",
    injurySensitivity: "Achilles sensitive",
  },
  goalState: {
    primaryGoal: "Half marathon 1:45",
    priority: "performance",
    confidence: 0.68,
  },
  trainingState: {
    loadStatus: "building",
    fatigueScore: 2,
    trend: "steady",
    rationale: "Starting baseline.",
  },
  injuryPainState: {
    level: "none",
    area: "Achilles",
    achilles: { status: "managed", painScore: 1, trend: "stable" },
    notes: "",
    activeModifications: [],
  },
  travelState: {
    isTravelWeek: false,
    access: "home",
    nextTripNote: "",
    environmentMode: "home",
  },
  environmentConfig: {
    base: { equipment: "dumbbells", time: "30" },
    todayOverride: null,
    weekOverride: null,
  },
  adherenceMomentumState: {
    sevenDayCompletion: 0,
    consistency: "unknown",
    momentum: "neutral",
  },
  nutritionPreferenceState: {
    style: "high-protein performance",
    dislikes: ["pastries"],
    preferredMeals: ["rice bowls", "eggs", "greek yogurt"],
    carbTolerance: "high around workouts",
  },
  localFoodContext: {
    city: "Chicago",
    groceryOptions: ["Whole Foods", "Trader Joe's", "Costco"],
    quickOptions: ["Chipotle", "Subway", "Sweetgreen"],
  },
  coachMemory: {
    wins: [],
    constraints: ["Achilles sensitivity", "travel variability"],
    failurePatterns: ["inconsistency after busy days"],
    pushResponse: "responds well to modest progression",
    protectResponse: "adherence improves with simplification",
    commonBarriers: ["travel", "chaotic schedule"],
    preferredFoodPatterns: ["staple breakfast", "simple high-protein lunches"],
    scheduleConstraints: ["variable gym access weekdays"],
    simplicityVsVariety: "simplicity on weekdays, variety on weekends",
    lastAdjustment: "Initial baseline loaded.",
    longTermMemory: [],
  }
};

const PERSONALIZATION_ACTIONS = {
  SET_GOAL: "SET_GOAL",
  SET_TRAVEL: "SET_TRAVEL",
  SET_PAIN: "SET_PAIN",
  ADD_MEMORY: "ADD_MEMORY",
  UPDATE_NUTRITION_PREF: "UPDATE_NUTRITION_PREF",
};

const mergePersonalization = (base, patch) => ({
  ...base,
  ...patch,
  injuryPainState: { ...base.injuryPainState, ...(patch?.injuryPainState || {}), achilles: { ...base.injuryPainState.achilles, ...(patch?.injuryPainState?.achilles || {}) } },
  travelState: { ...base.travelState, ...(patch?.travelState || {}) },
  environmentConfig: {
    ...(base.environmentConfig || DEFAULT_PERSONALIZATION.environmentConfig),
    ...(patch?.environmentConfig || {}),
    base: { ...(base.environmentConfig?.base || DEFAULT_PERSONALIZATION.environmentConfig.base), ...(patch?.environmentConfig?.base || {}) },
  },
  nutritionPreferenceState: { ...base.nutritionPreferenceState, ...(patch?.nutritionPreferenceState || {}) },
  localFoodContext: { ...base.localFoodContext, ...(patch?.localFoodContext || {}) },
  coachMemory: { ...base.coachMemory, ...(patch?.coachMemory || {}), wins: patch?.coachMemory?.wins || base.coachMemory.wins, constraints: patch?.coachMemory?.constraints || base.coachMemory.constraints },
});

const derivePersonalization = (logs, bodyweights, previous) => {
  const base = mergePersonalization(DEFAULT_PERSONALIZATION, previous || {});
  const entries = Object.entries(logs || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const last14 = entries.slice(-14);
  const completed7 = entries.filter(([date]) => ((Date.now() - new Date(date + "T12:00:00").getTime()) / (1000 * 60 * 60 * 24)) <= 7).length;
  const avgFeel = last14.length ? (last14.reduce((s, [, l]) => s + (parseInt(l.feel || 3)), 0) / last14.length) : 3;
  const travelHits = last14.filter(([, l]) => l.location === "hotel").length;
  const achillesSignals = last14.filter(([, l]) => (l.notes || "").toLowerCase().includes("achilles") || (l.notes || "").toLowerCase().includes("tight")).length;
  const latestBW = (bodyweights || []).length ? bodyweights[bodyweights.length - 1].w : PROFILE.weight;
  const startBW = (bodyweights || []).length ? bodyweights[0].w : PROFILE.weight;
  const weightDelta = (latestBW - startBW).toFixed(1);
  return mergePersonalization(base, {
    goalState: {
      ...base.goalState,
      confidence: Math.min(0.95, Math.max(0.35, 0.5 + ((avgFeel - 3) * 0.1) + (completed7 >= 4 ? 0.1 : -0.05))),
    },
    trainingState: {
      loadStatus: avgFeel <= 2.2 ? "recovery-needed" : avgFeel >= 4 ? "ready-to-push" : "building",
      fatigueScore: Math.max(1, Math.min(5, Math.round(6 - avgFeel))),
      trend: entries.length < 5 ? "early" : avgFeel >= 3.2 ? "up" : "flat",
      rationale: `Avg feel ${avgFeel.toFixed(1)}/5 over last ${last14.length || 0} logs.`,
    },
    injuryPainState: {
      ...base.injuryPainState,
      achilles: {
        status: achillesSignals > 2 ? "flared" : achillesSignals > 0 ? "watch" : "managed",
        painScore: Math.min(5, Math.max(1, 2 + achillesSignals)),
        trend: achillesSignals > 2 ? "up" : "stable",
      },
    },
    travelState: {
      ...base.travelState,
      isTravelWeek: travelHits > 0,
      access: travelHits > 0 ? "hotel" : "home",
    },
    adherenceMomentumState: {
      sevenDayCompletion: completed7,
      consistency: completed7 >= 4 ? "high" : completed7 >= 2 ? "medium" : "low",
      momentum: avgFeel >= 3.5 && completed7 >= 4 ? "up" : completed7 <= 1 ? "down" : "neutral",
    },
    coachMemory: {
      ...base.coachMemory,
      lastAdjustment: `Momentum ${completed7}/7 sessions, bodyweight ${weightDelta > 0 ? "+" : ""}${weightDelta} lbs.`,
    }
  });
};

const buildInjuryRuleResult = (todayWorkout, injuryState) => {
  const level = injuryState?.level || "none";
  const area = injuryState?.area || "Achilles";
  if (level === "none") return { workout: todayWorkout, mods: [], why: "No active injury modifiers.", caution: null };
  const base = { ...(todayWorkout || { label: "Recovery Mode", type: "rest" }) };
  if (level === "mild_tightness") {
    return {
      workout: { ...base, label: `${base.label || "Session"} (Intensity Reduced)`, injuryAdjusted: true },
      mods: ["Reduce intensity by ~10%", "Add 10-15 min warm-up", "Preserve easy aerobic work only"],
      why: `${area} mild tightness is active, so we keep movement but reduce risk.`,
      caution: "Training adjustment logic only — not medical advice."
    };
  }
  if (level === "moderate_pain") {
    return {
      workout: { ...base, label: "Low-Impact Cardio / Walk + Recovery", type: "rest", injuryAdjusted: true, nutri: "rest" },
      mods: ["Remove tempo/speed work", "Replace with bike, incline walk, or easy walk", "Elevate recovery + mobility guidance"],
      why: `${area} moderate pain indicates hard running is too risky today.`,
      caution: "If pain persists/worsens, seek professional assessment."
    };
  }
  return {
    workout: { ...base, label: "Stop / Recovery Only", type: "rest", injuryAdjusted: true, nutri: "rest" },
    mods: ["Suppress hard run recommendations", "Switch to recovery mode only", "Use stop/caution language and monitor symptoms"],
    why: `${area} sharp pain signal requires immediate training de-load.`,
    caution: "Stop training and get medical guidance if symptoms are sharp or escalating."
  };
};

const resolveEnvironmentSelection = ({ personalization, todayKey, currentWeek }) => {
  const base = personalization?.environmentConfig?.base || { equipment: "dumbbells", time: "30" };
  const todayOverride = personalization?.environmentConfig?.todayOverride;
  const weekOverride = personalization?.environmentConfig?.weekOverride;
  if (todayOverride?.date === todayKey) return { ...base, ...todayOverride, scope: "today" };
  if (weekOverride?.week === currentWeek) return { ...base, ...weekOverride, scope: "week" };
  return { ...base, scope: "base" };
};

const applyEnvironmentToWorkout = (workout, env, context = {}) => {
  const next = { ...(workout || {}) };
  const equipment = env?.equipment || "dumbbells";
  const time = env?.time || "30";
  const weekState = context.weekState || "normal";
  const injuryFlag = context.injuryFlag || "none";
  const shortSession = time === "20";
  const mediumSession = time === "30";
  const longSession = time === "45+";
  const limitedEquipment = equipment === "none";
  const gymReady = equipment === "full_gym" || equipment === "basic_gym";
  const chaotic = weekState === "chaotic";
  const fatigued = weekState === "fatigued";
  const achillesLimited = injuryFlag !== "none";
  const dayIdentity = next.type === "long-run"
    ? "long"
    : next.type === "easy-run"
    ? "easy"
    : next.type === "hard-run"
    ? "tempo"
    : next.type === "strength+prehab"
    ? "strength"
    : next.type === "rest"
    ? "recovery"
    : next.type === "run+strength" || next.type === "otf"
    ? "hybrid"
    : "easy";

  const allowSecondary = !chaotic && !shortSession;
  if (!allowSecondary) next.optionalSecondary = null;

  if (dayIdentity === "long") {
    if (longSession) {
      next.run = next.run || { t: "Easy", d: "Long easy run" };
      next.environmentNote = "Long-run identity preserved.";
    } else if (mediumSession) {
      next.run = { ...(next.run || {}), t: "Easy", d: "25 min easy + 5 min cooldown" };
      next.environmentNote = "Compressed long-run day: easy aerobic time only.";
    } else {
      next.run = { ...(next.run || {}), t: "Easy", d: "20 min easy" };
      next.environmentNote = "Minimum viable long-run touchpoint.";
    }
    if (chaotic) next.fallback = "Short easy run or brisk walk. Keep the long-run rhythm.";
    if (achillesLimited) {
      next.run = { ...(next.run || {}), t: "Easy / run-walk", d: shortSession ? "15-20 min gentle run-walk" : "20-25 min gentle run-walk" };
      next.environmentNote = "Achilles-protect long day: reduced duration and intensity.";
    }
  }

  if (dayIdentity === "tempo") {
    if (longSession) {
      next.run = next.run || { t: "Tempo", d: "Warmup + tempo + cooldown" };
      next.environmentNote = "Tempo identity preserved.";
    } else if (mediumSession) {
      next.run = { ...(next.run || {}), t: fatigued ? "Steady" : "Tempo", d: "5 warmup + 15-18 min tempo + 5 cooldown" };
      next.environmentNote = fatigued ? "Fatigued week: steady effort instead of hard tempo." : "Compressed tempo set.";
    } else {
      next.run = { ...(next.run || {}), t: fatigued ? "Steady" : "Steady-hard", d: "5 easy + 10 steady-hard + 5 easy" };
      next.environmentNote = "Short tempo day: simple, controlled effort.";
    }
    if (achillesLimited) {
      next.run = { ...(next.run || {}), t: "Moderate steady", d: shortSession ? "15-20 min moderate steady" : "20-25 min moderate steady" };
      next.environmentNote = "Achilles-protect tempo day: no surges, steady effort.";
    }
  }

  if (dayIdentity === "easy") {
    if (longSession) {
      next.run = next.run || { t: "Easy", d: "Normal easy run" };
    } else if (mediumSession) {
      next.run = { ...(next.run || {}), t: "Easy", d: "25-30 min easy" };
    } else {
      next.run = { ...(next.run || {}), t: chaotic ? "Run/walk" : "Easy", d: "20 min easy or run/walk" };
    }
    if (chaotic) next.fallback = "Easy jog/walk fallback is enough today.";
    next.environmentNote = chaotic ? "Chaotic week: keep this simple and finish it." : "Easy-day identity preserved.";
  }

  if (dayIdentity === "strength") {
    next.strengthTrack = gymReady ? "hotel" : "home";
    if (limitedEquipment) {
      next.label = `${next.label || "Strength"} (Bodyweight only)`;
      next.environmentNote = shortSession ? "Minimum viable full-body bodyweight strength." : "Bodyweight full-body strength session.";
    } else if (equipment === "dumbbells") {
      next.label = `${next.label || "Strength"} (Dumbbell compounds)`;
      next.environmentNote = "Dumbbell compounds only. Keep it clean.";
    } else {
      next.label = `${next.label || "Strength"} (${equipment === "full_gym" ? "Full gym" : "Basic gym"})`;
      next.environmentNote = "Condensed full-body gym strength.";
    }
    next.strengthDuration = shortSession ? "15-20 min" : mediumSession ? "20-30 min" : "30-45 min";
    next.fallback = shortSession ? "Minimum viable strength: 2 compound moves + core." : next.fallback;
  }

  if (dayIdentity === "recovery") {
    next.type = "rest";
    next.label = "Recovery / Mobility";
    next.environmentNote = "Recovery stays recovery. Walk, mobility, rehab only.";
    next.optionalSecondary = null;
    next.fallback = "Easy walk + mobility only.";
  }

  if (dayIdentity === "hybrid") {
    if (shortSession) {
      next.label = "Hybrid (short): 12 min easy run + 8 min strength";
      next.environmentNote = "Hybrid compressed to keep both run and strength touchpoints.";
      next.strengthTrack = limitedEquipment ? "home" : gymReady ? "hotel" : "home";
    } else if (mediumSession) {
      next.label = "Hybrid: easy run + short strength";
      next.environmentNote = "Balanced hybrid session with simple structure.";
      next.strengthTrack = limitedEquipment ? "home" : gymReady ? "hotel" : "home";
    } else {
      next.environmentNote = "Hybrid day: run first, strength second.";
      next.strengthTrack = limitedEquipment ? "home" : gymReady ? "hotel" : "home";
    }
  }

  if (shortSession && !next.fallback) next.fallback = "20-min version: main work only.";
  if (mediumSession && !next.environmentNote) next.environmentNote = "30-min cap: prioritize main stimulus.";
  if (longSession && !next.environmentNote) next.environmentNote = gymReady ? "45+ min with full setup." : "45+ min available.";
  return next;
};

const scaleMilesString = (text, factor) => {
  if (!text) return text;
  const m = text.match(/(\d+(\.\d+)?)\s*mi/);
  if (!m) return text;
  const val = parseFloat(m[1]);
  const scaled = Math.max(2, Math.round((val * factor) * 10) / 10);
  return text.replace(m[0], `${scaled} mi`);
};

const computeAdaptiveSignals = ({ logs, bodyweights, personalization }) => {
  const entries = Object.entries(logs || {}).sort((a,b) => a[0].localeCompare(b[0]));
  const last14 = entries.slice(-14).map(([,l]) => l);
  const keySessions = last14.filter(l => /tempo|interval|long|race/i.test(l.type || "")).length;
  const completed = last14.length;
  const adherenceScore = Math.max(0, Math.min(1, completed / 8));
  const avgFeel = last14.length ? last14.reduce((s,l)=>s + parseInt(l.feel || 3), 0) / last14.length : 3;
  const easyHighEffortHits = last14.filter(l => /easy/i.test(l.type || "") && parseInt(l.feel || 3) <= 2).length;
  const missedPattern = Math.max(0, 8 - completed);
  const fatigueFlag = avgFeel <= 2.4 || easyHighEffortHits >= 2;
  const momentumFlag = adherenceScore >= 0.85 && avgFeel >= 3.5;
  const needDeload = fatigueFlag && (missedPattern >= 2 || keySessions <= 1);
  const readiness = needDeload ? "low" : momentumFlag ? "high" : "medium";
  const volumeTolerance = needDeload ? 0.88 : momentumFlag ? 1.05 : adherenceScore < 0.5 ? 0.93 : 1.0;
  const intensityTolerance = (personalization.injuryPainState.level !== "none" || fatigueFlag || personalization.travelState.isTravelWeek) ? 0.85 : momentumFlag ? 1.05 : 1.0;
  const bwDropFast = bodyweights.length >= 2 ? ((bodyweights[0].w - bodyweights[bodyweights.length - 1].w) / Math.max(1, bodyweights.length - 1)) > 0.35 : false;
  return { adherenceScore, fatigueFlag, momentumFlag, readiness, needDeload, volumeTolerance, intensityTolerance, bwDropFast };
};

const buildAdaptiveWeek = (week, signals, personalization, memoryInsights = []) => {
  const changed = [];
  const adjusted = JSON.parse(JSON.stringify(week));
  if (signals.volumeTolerance !== 1.0) {
    adjusted.mon.d = scaleMilesString(week.mon.d, signals.volumeTolerance);
    adjusted.fri.d = scaleMilesString(week.fri.d, signals.volumeTolerance);
    adjusted.sat.d = scaleMilesString(week.sat.d, signals.volumeTolerance);
    changed.push(`Volume ${signals.volumeTolerance > 1 ? "progressed" : "reduced"} (${Math.round((signals.volumeTolerance - 1) * 100)}%)`);
  }
  if (signals.intensityTolerance < 0.95 && /Tempo|Intervals/.test(week.thu.t)) {
    adjusted.thu.t = "Easy Aerobic";
    adjusted.thu.d = "30-45 min easy aerobic + strides optional";
    changed.push("Hard run replaced with easy aerobic work");
  }
  if (personalization.injuryPainState.level !== "none") {
    adjusted.thu.t = "Low-Impact";
    adjusted.thu.d = "Bike or incline walk 35-45 min";
    changed.push(`Intensity protected for ${personalization.injuryPainState.area} ${personalization.injuryPainState.level.replaceAll("_"," ")}`);
  }
  if (personalization.travelState.isTravelWeek) {
    adjusted.mon.d = scaleMilesString(adjusted.mon.d, 0.9);
    adjusted.fri.d = scaleMilesString(adjusted.fri.d, 0.9);
    changed.push("Travel simplification applied");
  }
  const env = personalization.travelState.environmentMode || "home";
  if (["no equipment","outdoors only"].includes(env)) {
    adjusted.str = "A";
    changed.push("Environment mode reduced equipment dependency.");
  }
  if (env === "limited gym") {
    changed.push("Limited-gym substitutions prioritized (dumbbell/cable friendly).");
  }
  if (memoryInsights.some(m => m.key === "prefers_simpler_weeks")) {
    adjusted.thu.t = adjusted.thu.t === "Intervals" ? "Tempo" : adjusted.thu.t;
    changed.push("Long-term memory: simpler weekly density improves follow-through.");
  }
  return { adjusted, changed };
};

const DEFAULT_MULTI_GOALS = [
  { id: "g_run_half", name: "Half marathon 1:45", category: "running", priority: 1, targetDate: "2026-07-19", measurableTarget: "1:45:00", active: true },
  { id: "g_abs", name: "Visible abs by summer", category: "body_comp", priority: 2, targetDate: "2026-06-15", measurableTarget: "Waist down + body fat trend", active: true },
  { id: "g_bench", name: "Bench 225 lbs", category: "strength", priority: 3, targetDate: "2026-09-01", measurableTarget: "225 x 1", active: true },
  { id: "g_injury", name: "Avoid injury flare-ups", category: "injury_prevention", priority: 1, targetDate: "", measurableTarget: "No flare-up weeks", active: true },
];

const arbitrateGoals = ({ goals, momentum, personalization }) => {
  const active = (goals || []).filter(g => g.active).sort((a,b)=>a.priority-b.priority);
  const primary = active[0] || null;
  const secondary = active.filter(g => g.id !== primary?.id).slice(0,3);
  const maintenance = active.slice(3);
  const deprioritized = [];
  const conflicts = [];
  const pushes = [];
  const maintains = [];
  const reduces = [];
  const consistencyThreatened = ["drifting","falling off"].includes(momentum.momentumState);
  const env = personalization.travelState.environmentMode || "home";

  if (primary?.category === "body_comp" && secondary.find(g=>g.category==="running")) {
    conflicts.push("Fat loss vs run performance");
    pushes.push("Run quality sessions");
    maintains.push("Moderate deficit only");
    reduces.push("Aggressive calorie cuts");
  }
  if (active.find(g=>g.category==="strength") && active.find(g=>g.category==="running")) {
    conflicts.push("Strength vs endurance recovery load");
    pushes.push("1–2 meaningful strength sessions");
    maintains.push("Key run sessions");
    reduces.push("Extra accessory volume");
  }
  if (consistencyThreatened) {
    conflicts.push("Consistency vs optimization");
    pushes.push("Low-friction routine completion");
    reduces.push("Complexity and perfection targets");
    active.slice(2).forEach(g=>deprioritized.push(g.name));
  }
  if (["no equipment","outdoors only","limited gym","travel"].includes(env)) {
    conflicts.push("Environment constraints vs ideal programming");
    maintains.push("Strength stimulus via substitutes");
    reduces.push("Barbell-specific progression assumptions");
  }
  const priorityStack = {
    primary: primary?.name || "None",
    secondary: secondary?.[0]?.name || "None",
    maintained: maintenance?.[0]?.name || secondary?.[1]?.name || "None"
  };
  const maintainGoals = secondary
    .filter(g => g.category !== "injury_prevention")
    .slice(0, 2)
    .map(g => g.name);
  const minimizeGoal = active.find(g => g.category === "injury_prevention")?.name || (secondary[2]?.name || "non-primary extras");
  const goalAllocation = {
    primary: primary?.name || "Consistency",
    maintained: maintainGoals.length ? maintainGoals : ["General fitness"],
    minimized: minimizeGoal,
  };
  const prioritizedCategory = primary?.category === "running"
    ? "running"
    : primary?.category === "strength"
    ? "strength"
    : primary?.category === "body_comp"
    ? "body composition"
    : "consistency";
  const allocationNarrative = `This block prioritizes ${prioritizedCategory}. ${goalAllocation.maintained[0]} is maintained. ${active.some(g => g.category === "body_comp") ? "Core work is kept minimal but consistent." : `${goalAllocation.minimized} is minimized this block.`}`;
  const strengthSessionsTarget = primary?.category === "strength" && !consistencyThreatened ? 2 : 1;
  const strengthInclusion = {
    sessionsPerWeek: strengthSessionsTarget === 2 ? "1–2" : "1",
    dose: primary?.category === "strength" && !consistencyThreatened ? "full_progression" : "maintenance_short",
    duration: primary?.category === "strength" && !consistencyThreatened ? "40-55 min" : "20-35 min",
    label: primary?.category === "strength" && !consistencyThreatened ? "Strength progression session" : "Short strength maintenance session",
  };
  const aestheticInclusion = active.some(g => g.category === "body_comp")
    ? { active: true, optionalLine: "Optional: 10 min core", weeklyTarget: "2-4 short finishers" }
    : { active: false, optionalLine: "" };
  const shiftReason = consistencyThreatened
    ? "This week is consistency-first to rebuild execution."
    : primary?.category === "running" && secondary.find(g => g.category === "body_comp")
    ? "This week is slightly run-focused while fat loss is supported through nutrition precision."
    : primary?.category === "body_comp" && active.find(g => g.category === "running")
    ? "This week is cut-focused while run quality is protected."
    : primary?.category === "strength"
    ? "This week is slightly strength-focused while endurance is maintained."
    : "This week keeps a balanced mixed-goal bias.";
  const decisionLinks = [
    consistencyThreatened
      ? "Volume is lower because adherence risk is elevated right now."
      : "Volume stays targeted so primary-goal sessions remain high quality.",
    primary?.category === "body_comp" || active.some(g => g.category === "body_comp")
      ? "Calories use a moderate deficit to keep fat loss moving without crashing performance."
      : "Calories stay closer to maintenance/performance support on quality training days.",
    primary?.category === "strength" && !consistencyThreatened
      ? "Strength progression is pushed this block with controlled fatigue."
      : "Strength progression is slowed to protect run quality and recovery."
  ];
  const explanation = `Primary: ${priorityStack.primary}. We push ${pushes[0] || "consistency"}, maintain ${maintains[0] || "secondary goals"}, and deprioritize ${reduces[0] || "non-essential load"} this week. ${allocationNarrative}`;
  const todayLine = `Goal arbitration: push ${pushes[0] || "consistency"}; maintain ${maintains[0] || "secondary goals"}; reduce ${reduces[0] || "non-essential load"}.`;
  const coachTradeoffLine = `Tradeoff: ${shiftReason} Strength is ${strengthInclusion.dose === "full_progression" ? "progressed" : "kept lighter"} (${strengthInclusion.duration}) so recovery supports ${priorityStack.primary}.`;
  const coachSummary = `${shiftReason} Decision links: ${decisionLinks.join(" ")}`;
  return { primary, secondary, maintenance, deprioritized, conflicts, pushes, maintains, reduces, explanation, priorityStack, shiftReason, decisionLinks, todayLine, coachSummary, goalAllocation, allocationNarrative, strengthInclusion, aestheticInclusion, coachTradeoffLine };
};

const getMomentumEngineState = ({ logs, bodyweights, personalization }) => {
  const entries = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0]));
  const last14 = entries.slice(-14);
  const last7Count = entries.filter(([d]) => ((Date.now()-new Date(d+"T12:00:00").getTime())/(1000*60*60*24)) <= 7).length;
  const logGapDays = entries.length ? Math.floor((Date.now() - new Date(entries[entries.length-1][0]+"T12:00:00").getTime())/(1000*60*60*24)) : 99;
  const bwLogs7 = (bodyweights || []).filter(b => ((Date.now()-new Date(b.date+"T12:00:00").getTime())/(1000*60*60*24)) <= 7).length;
  const fatigueNotes = last14.filter(([,l]) => /(tired|fatigue|chaos|travel|unmotivated|bad sleep|overwhelmed)/i.test(l.notes || "")).length;
  const completionRate = Math.min(1, last14.length / 8);
  let score = 50;
  score += completionRate * 30;
  score += Math.min(10, bwLogs7 * 3);
  score -= Math.min(25, logGapDays * 4);
  score -= fatigueNotes * 4;
  score -= last7Count <= 1 ? 12 : 0;
  score = Math.max(0, Math.min(100, Math.round(score)));
  const momentumState = score >= 75 ? "building momentum" : score >= 55 ? "stable" : score >= 35 ? "drifting" : "falling off";
  const coachMode = momentumState === "building momentum" ? "push mode" : momentumState === "stable" ? "rebuild mode" : momentumState === "drifting" ? "simplify mode" : "reset mode";
  const protectNeeded = personalization.injuryPainState.level !== "none" || fatigueNotes >= 3;
  const finalCoachMode = protectNeeded ? "protect mode" : coachMode;
  const likelyAdherencePattern = score >= 70 ? "high if structured" : score >= 45 ? "needs low-friction plan" : "requires reset prompts";
  const inconsistencyRisk = score >= 70 ? "low" : score >= 45 ? "medium" : "high";
  return { score, momentumState, coachMode: finalCoachMode, inconsistencyRisk, likelyAdherencePattern, completionRate, logGapDays, fatigueNotes };
};

const buildProactiveTriggers = ({ momentum, personalization, goals, learning, nutritionFeedback, longTermMemory }) => {
  const triggers = [];
  const dropFast = (longTermMemory || []).some(m => m.key === "drops_after_3_4_days" && m.confidence === "high");
  if (momentum.momentumState === "drifting") triggers.push({ id:"drift", msg:"Drift detected — want a simplified version of this week?", actionLabel:"Simplify week", actionType:"REDUCE_WEEKLY_VOLUME", payload:{ pct: 12 }, priority:85 });
  if (momentum.momentumState === "falling off") triggers.push({ id:"reset", msg:"Momentum has dipped — want a compressed reset week to make execution easier?", actionLabel:"Activate reset", actionType:"ACTIVATE_SALVAGE", payload:{}, priority:95 });
  if (momentum.score >= 80) triggers.push({ id:"progress", msg:"Consistency streak is strong — progress slightly this week?", actionLabel:"Progress slightly", actionType:"PROGRESS_STRENGTH_EMPHASIS", payload:{ weeks: 1 }, priority:70 });
  if (personalization.travelState.isTravelWeek) triggers.push({ id:"env", msg:"Environment changed — switch to travel/home assumptions?", actionLabel:"Switch travel mode", actionType:"SWITCH_TRAVEL_MODE", payload:{ mode:"travel" }, priority:72 });
  if (goals?.find(g=>g.category==="body_comp" && g.active) && momentum.logGapDays >= 3) triggers.push({ id:"nutrition", msg:"Nutrition drift risk is rising — simplify meals for a few days?", actionLabel:"Simplify meals", actionType:"SIMPLIFY_MEALS_THIS_WEEK", payload:{ days: 3 }, priority:78 });
  if (momentum.logGapDays >= (dropFast ? 2 : 3)) triggers.push({ id:"nolog", msg:"No logs recently — apply low-friction reset plan?", actionLabel:"Low-friction reset", actionType:"ACTIVATE_SALVAGE", payload:{}, priority:88 });
  if (learning?.stats?.timeBlockers >= 2) triggers.push({ id:"time_friction", msg:"Time blockers keep repeating — cap sessions and reduce density?", actionLabel:"Reduce density", actionType:"REDUCE_WEEKLY_VOLUME", payload:{ pct: 15 }, priority:84 });
  if (learning?.stats?.harder >= 3) triggers.push({ id:"too_hard", msg:"Sessions are repeatedly harder than expected — lower aggressiveness?", actionLabel:"Lower aggressiveness", actionType:"REDUCE_WEEKLY_VOLUME", payload:{ pct: 10 }, priority:80 });
  if ((learning?.stats?.equipBlockers || 0) + (learning?.stats?.travelBlockers || 0) >= 2) triggers.push({ id:"env_fast", msg:"Gym access pattern changed — switch environment assumptions faster?", actionLabel:"Use no-equipment mode", actionType:"SWITCH_ENV_MODE", payload:{ mode:"no equipment" }, priority:74 });
  const recentNutri = Object.values(nutritionFeedback || {}).slice(-7);
  if (recentNutri.filter(n => n.status === "off_track").length >= 2) triggers.push({ id:"nutri_simplify", msg:"Nutrition has been off-track — simplify meal structure for 3 days?", actionLabel:"Apply meal defaults", actionType:"SIMPLIFY_MEALS_THIS_WEEK", payload:{ days: 3 }, priority:82 });
  if (recentNutri.filter(n => n.issue === "travel" || n.issue === "convenience").length >= 2) triggers.push({ id:"nutri_travel", msg:"Travel/convenience is derailing nutrition — switch to travel nutrition mode?", actionLabel:"Enable travel nutrition", actionType:"SWITCH_TRAVEL_NUTRITION_MODE", payload:{ enabled:true }, priority:79 });
  if ((momentum.momentumState === "drifting" || momentum.momentumState === "falling off") && learning?.stats?.skipped >= 2) triggers.push({ id:"salvage_mode", msg:"You’ve missed 2+ sessions — switch to a 3-day salvage plan?", actionLabel:"Activate salvage", actionType:"ACTIVATE_SALVAGE", payload:{}, priority:92 });
  const confidenceBoost = learning?.adaptation?.active ? 6 : -4;
  return triggers
    .map(t => ({ ...t, priority: (t.priority || 50) + confidenceBoost }))
    .sort((a,b) => b.priority - a.priority)
    .slice(0, 2);
};

const detectBehaviorPatterns = ({ logs, bodyweights, personalization }) => {
  const entries = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0]));
  const last21 = entries.slice(-21);
  const patterns = [];
  const streakThenMiss = last21.some((_, i) => i >= 3 && /missed|skip|rest/i.test((last21[i]?.[1]?.notes || "")) && last21.slice(Math.max(0, i-3), i).filter(([,l])=>/run|strength|otf/i.test(l.type || "")).length >= 2);
  if (streakThenMiss) patterns.push("You often miss after 2–3 strong days.");
  const env = personalization.travelState.environmentMode || "home";
  const travelLow = ["travel","limited gym","no equipment"].includes(env) && last21.length < 6;
  if (travelLow) patterns.push("Adherence tends to drop when environment changes.");
  const strengthDrop = last21.filter(([,l])=>/strength/i.test(l.type || "")).length < 2 && last21.filter(([,l])=>/run|tempo|interval|long/i.test(l.type || "")).length >= 5;
  if (strengthDrop) patterns.push("Strength work drops when running ramps.");
  const bwInconsistent = (bodyweights || []).length < 2 || (bodyweights.filter(b => ((Date.now()-new Date(b.date+"T12:00:00").getTime())/(1000*60*60*24)) <= 14).length < 2);
  if (bwInconsistent) patterns.push("Bodyweight logging is inconsistent lately.");
  const fatigueRepeats = last21.filter(([,l]) => /(fatigue|chaos|busy|travel|bad sleep)/i.test(l.notes || "")).length >= 2;
  if (fatigueRepeats) patterns.push("Notes repeatedly mention fatigue/chaos/travel.");
  const checkinTimeSkips = last21.filter(([,l]) => l.checkin?.status === "skipped" && l.checkin?.blocker === "time").length >= 2;
  if (checkinTimeSkips) patterns.push("Check-ins suggest time is the most common skip trigger.");
  return patterns.slice(0, 4);
};

const generateDailyCoachBrief = ({ momentum, todayWorkout, arbitration, injuryState, patterns, learning, salvage }) => {
  const warning = injuryState.level !== "none" ? `Watch ${injuryState.area} (${injuryState.level.replaceAll("_"," ")}).` : momentum.momentumState === "falling off" ? "Consistency is the risk today." : "No major red flags.";
  const optionalAdjustment = learning?.adjustmentBias === "simplify"
    ? "Start with a 20-minute minimum dose today; extend only if energy is good."
    : injuryState.level !== "none"
    ? "Downgrade intensity one notch and keep aerobic work easy."
    : "If energy is low, do the first 20 minutes only and bank consistency.";
  return {
    focus: salvage?.active ? "Salvage week: execute the compressed essentials only." : momentum.momentumState.includes("drifting") ? "Preserve momentum, not perfection." : `Execute ${todayWorkout?.label || "today's session"} cleanly.`,
    why: arbitration.explanation,
    arbitrationLine: `${arbitration.todayLine} ${arbitration.coachTradeoffLine || ""}`.trim(),
    warning,
    success: todayWorkout?.minDay ? (todayWorkout?.success || "Today = minimum viable day and momentum preserved.") : salvage?.active ? salvage.compressedPlan.success : todayWorkout?.type === "rest" ? "Log recovery, mobility, and tomorrow plan." : "Complete the planned session and log how it felt.",
    optionalAdjustment,
    patternNote: learning?.topObservations?.[0]?.msg || patterns[0] || "No dominant negative pattern detected this week."
  };
};

const generateWeeklyCoachReview = ({ momentum, arbitration, signals, personalization, patterns, learning, nutritionFeedback, expectations, recalibration }) => ({
  ...(() => {
    const recentNutri = Object.values(nutritionFeedback || {}).slice(-7);
    const offTrack = recentNutri.filter(n => n.status === "off_track").length;
    const nutritionLearned = offTrack >= 2 ? "Nutrition consistency dropped; simplify meals and defaults." : null;
    return {
  wentWell: momentum.score >= 60 ? "You kept core training momentum." : "You still kept some training touchpoints alive.",
  drifted: momentum.momentumState === "drifting" || momentum.momentumState === "falling off" ? "Execution drifted on consistency and logging rhythm." : "Drift was limited.",
  learned: nutritionLearned || learning?.topObservations?.[0]?.msg || patterns[0] || "Current routine works best when kept simple.",
  changesNextWeek: learning?.adjustmentBias === "simplify"
    ? "Simplify next week structure (shorter sessions and lower friction defaults)."
    : learning?.adjustmentBias === "progress"
    ? "Progress modestly (+3-5%) while keeping recovery quality high."
    : momentum.momentumState === "building momentum" ? "Progress slightly (+5% load where tolerated)." : momentum.momentumState === "stable" ? "Hold structure and sharpen execution." : "Simplify week and reset friction points.",
  tradeoff: arbitration.conflicts[0] || "No major conflict this week; maintain balanced progress.",
  arbitrationShift: arbitration.shiftReason,
  expectation: expectations?.nextWindow || "Near-term outlook still forming.",
  expectationCondition: expectations?.conditionLine || "Condition: maintain current structure and logging for clearer trend signal.",
  expectationMotivation: expectations?.motivationLine || "Progress compounds with consistency.",
  recalibrationSummary: recalibration?.summary || "No recalibration this week.",
  recalibrationWhy: recalibration?.why || "",
  recalibrationChanges: recalibration?.changes || []
    };
  })()
});

const buildUnifiedDailyStory = ({ todayWorkout, dailyBrief, progress, arbitration, expectations, salvage, momentum }) => {
  const hasOverride = !!(todayWorkout?.coachOverride || todayWorkout?.minDay || todayWorkout?.reason);
  const priority = salvage?.active
    ? "salvage"
    : hasOverride
    ? "override"
    : ["drifting","falling off"].includes(momentum?.momentumState)
    ? "drift"
    : progress?.warnings?.length
    ? "progress"
    : "expectation";

  const sessionText = todayWorkout?.label || "today's session";
  const expectationSentence = expectations?.nextWindow
    ? `${expectations.nextWindow} ${expectations.conditionLine}`
    : "Near-term outlook stays positive if consistency holds.";
  const progressSentence = progress?.highlights?.slice(0, 2).join("; ") || "Progress signal is still forming.";
  const arbitrationSentence = arbitration?.todayLine || "Today prioritizes consistency and key goal quality.";
  const successSentence = dailyBrief?.success || "Complete the planned session and log how it felt.";

  if (priority === "salvage") {
    return {
      priority,
      brief: `This is a salvage day: execute only the essentials and protect momentum. ${salvage.compressedPlan.success} ${expectationSentence}`,
      success: successSentence
    };
  }
  if (priority === "override") {
    return {
      priority,
      brief: `Today is intentionally adjusted (${todayWorkout?.reason?.replaceAll("_"," ") || "coach override"}) so execution stays realistic. ${arbitrationSentence} ${expectationSentence}`,
      success: successSentence
    };
  }
  if (priority === "drift") {
    return {
      priority,
      brief: `Consistency is the top priority today. Keep ${sessionText} simple and complete; perfection is not required. ${progressSentence}.`,
      success: successSentence
    };
  }
  if (priority === "progress") {
    return {
      priority,
      brief: `You’re trending in the right direction (${progressSentence}), so today stays focused on high-value execution. ${arbitrationSentence}`,
      success: successSentence
    };
  }
  return {
    priority,
    brief: `Today is about steady execution of ${sessionText}. ${expectationSentence} ${arbitrationSentence}`,
    success: successSentence
  };
};

const deriveBehaviorLoop = ({ dailyCheckins, logs, momentum, salvageLayer }) => {
  const entries = Object.entries(dailyCheckins || {}).sort((a,b) => a[0].localeCompare(b[0]));
  const isSuccess = (c) => c?.status === "completed_as_planned" || c?.status === "completed_modified";
  const isMinViable = (c) => c?.status === "completed_modified" || /min(imum)?\s?(day|dose)/i.test(c?.note || "");
  const isCountable = (c, dateKey) => {
    const eff = resolveEffectiveStatus(c, dateKey);
    return eff !== "not_logged_grace" && eff !== "not_logged";
  };

  let consistencyStreak = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    const [dateKey, checkin] = entries[i];
    if (!isCountable(checkin, dateKey)) continue; // skip grace-period entries
    if (isSuccess(checkin)) consistencyStreak += 1;
    else break;
  }
  let minViableStreak = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isMinViable(entries[i][1])) minViableStreak += 1;
    else break;
  }

  const latest = entries[entries.length - 1]?.[1] || null;
  const latestStatus = latest?.status || "not_logged";
  const resolution = !latest || latestStatus === "not_logged"
    ? "New streak starts with one completed day."
    : latestStatus === "completed_as_planned"
    ? "Good day — you hit what mattered."
    : latestStatus === "completed_modified"
    ? "Not perfect, but you kept momentum."
    : latestStatus === "skipped"
    ? "Recovery day logged — next action is to restart with a minimum day."
    : "Day logged — momentum stays alive.";

  const identity = salvageLayer?.active
    ? "You’re handling setbacks like an athlete who stays in the game."
    : consistencyStreak >= 5
    ? "You’re building consistency identity."
    : ["drifting","falling off"].includes(momentum?.momentumState)
    ? "You’re back on track by showing up today."
    : "You’re reinforcing a reliable training rhythm.";

  return {
    consistencyStreak,
    minViableStreak,
    resolution,
    identity,
    recoveryTone: latest?.status === "skipped" || consistencyStreak === 0
  };
};

const deriveLongTermMemoryLayer = ({ logs, dailyCheckins, weeklyCheckins, nutritionFeedback, validationLayer, previousMemory = [] }) => {
  const entries = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0]));
  const checkins = Object.entries(dailyCheckins || {}).sort((a,b)=>a[0].localeCompare(b[0]));
  const weekly = Object.values(weeklyCheckins || {});
  const nutrition = Object.values(nutritionFeedback || {});
  const last28Logs = entries.slice(-28).map(([,l])=>l || {});
  const last28Checkins = checkins.slice(-28).map(([,c])=>c || {});

  const makeMemory = (key, bucket, label, evidence) => {
    const prev = (previousMemory || []).find(m => m.key === key);
    const toConf = (n) => n >= 5 ? "high" : n >= 3 ? "medium" : n >= 2 ? "low" : null;
    const conf = toConf(evidence);
    if (!conf) return null;
    const lastObserved = Date.now();
    return { key, bucket, label, confidence: conf, evidenceCount: evidence, lastObserved };
  };

  const memories = [
    makeMemory("prefers_simpler_weeks","behavior","stays more consistent when weeks are simpler", last28Checkins.filter(c => c.status === "completed_modified" && !c.passiveAssumed).length),
    makeMemory("drops_after_3_4_days","behavior","often loses momentum after 3-4 hard days", Math.max(0, last28Logs.length - 4 >= 0 ? last28Checkins.filter(c => c.status === "skipped").length : 0)),
    makeMemory("fatigue_sensitive","performance","fatigue rises quickly when load stacks too fast", weekly.filter(w => Number(w.energy || 3) <= 2 || Number(w.stress || 3) >= 4).length),
    makeMemory("home_better_than_travel","environment","home setup yields higher completion than travel weeks", entries.filter(([,l]) => l.location !== "hotel").length >= 6 ? entries.filter(([,l]) => l.location === "hotel").length : 0),
    makeMemory("nutrition_simple_meals","nutrition","adherence is better with simpler repeatable meals", nutrition.filter(n => n.status === "off_track" && ["convenience","travel"].includes(n.issue)).length >= 2 ? 3 : nutrition.filter(n => n.status === "decent" || n.status === "on_track").length),
    makeMemory("validation_simplify_positive","validation","simplifying weeks tends to improve adherence/momentum", (validationLayer?.recentResolved || []).filter(r => r.strategy === "simplify_density" && r.impact === "positive").length),
    makeMemory("validation_aggressive_negative","validation","aggressive progress blocks can reduce consistency", (validationLayer?.recentResolved || []).filter(r => r.strategy === "aggressive_progression" && r.impact === "negative").length),
  ].filter(Boolean);

  const decayedPrev = (previousMemory || []).map(m => {
    const days = Math.floor((Date.now() - Number(m.lastObserved || Date.now())) / (1000*60*60*24));
    if (days < 21) return m;
    const downgraded = m.confidence === "high" ? "medium" : m.confidence === "medium" ? "low" : "low";
    return { ...m, confidence: downgraded };
  });

  const merged = [...decayedPrev.filter(p => !memories.find(m => m.key === p.key)), ...memories]
    .sort((a,b) => (b.evidenceCount || 0) - (a.evidenceCount || 0))
    .slice(0, 10);
  return merged;
};

const deriveRecalibrationEngine = ({ currentWeek, progress, momentum, learningLayer, memoryInsights, arbitration }) => {
  const periodicTrigger = currentWeek > 1 && currentWeek % 4 === 0;
  const prolongedInconsistency = ["drifting","falling off"].includes(momentum?.momentumState) && (progress?.adherenceRate || 0) < 60;
  const majorPatternShift = (memoryInsights || []).some(m => ["drops_after_3_4_days","fatigue_sensitive"].includes(m.key) && m.confidence === "high");
  const active = periodicTrigger || prolongedInconsistency || majorPatternShift;
  const reasons = [
    periodicTrigger ? "4-week checkpoint reached" : null,
    prolongedInconsistency ? "consistency has been below target" : null,
    majorPatternShift ? "new high-confidence behavior pattern detected" : null
  ].filter(Boolean);

  const changes = [];
  if (prolongedInconsistency || learningLayer?.adjustmentBias === "simplify") changes.push("reduce weekly density and simplify session flow");
  if (progress?.weightSignal?.includes("holding roughly steady")) changes.push("tighten nutrition structure with simpler repeatable meals");
  if (progress?.runSignal?.includes("improving") && arbitration?.primary?.category === "running") changes.push("slightly progress run quality while maintaining recovery");
  if (progress?.strengthSignal?.includes("deprioritized")) changes.push("rebuild strength with minimum effective progression");
  if (!changes.length) changes.push("hold structure and sharpen execution quality");

  const aggressiveness = prolongedInconsistency ? "lower" : progress?.adherenceRate >= 75 ? "slightly_higher" : "steady";
  const summary = active
    ? "We’re recalibrating your plan to keep progress aligned with current reality."
    : "No recalibration needed this week.";
  const why = active
    ? `Trigger: ${reasons.join(" + ")}.`
    : "Current assumptions are still working.";
  const expect = aggressiveness === "lower"
    ? "Expect smoother execution and recovery over the next 1-2 weeks."
    : aggressiveness === "slightly_higher"
    ? "Expect gradual progression with controlled load increases."
    : "Expect steady progress if consistency holds.";

  return { active, reasons, changes: changes.slice(0, 4), aggressiveness, summary, why, expect };
};

const deriveStrengthLayer = ({ goals, momentum, personalization, logs }) => {
  const strengthGoal = (goals || []).find(g => g.active && g.category === "strength");
  const env = personalization.travelState.environmentMode || "home";
  const benchEstimate = parseInt((strengthGoal?.measurableTarget || "").match(/\d+/)?.[0] || "185");
  const trainingMax = Math.round(benchEstimate * 0.9); // conservative re-entry
  const arbitration = arbitrateGoals({ goals, momentum, personalization });
  let focus = "maintain";
  if (arbitration.primary?.category === "strength" && momentum.coachMode !== "protect mode") focus = "push";
  if (["drifting","falling off"].includes(momentum.momentumState) || arbitration.deprioritized.includes(strengthGoal?.name)) focus = "deprioritize";

  const recentBenchHits = Object.values(logs || {}).filter(l => /bench/i.test((l.type || "") + " " + (l.notes || ""))).length;
  const progression = focus === "push"
    ? [`Bench 4×6 @ ~${Math.round(trainingMax*0.72)} lbs`, "If bar speed is solid, add 5 lbs next week", "Incline DB 3×10 + row 3×10 + triceps 3×12"]
    : focus === "maintain"
    ? [`Bench 2×5 @ ~${Math.round(trainingMax*0.65)} lbs`, "Keep 1 short upper hypertrophy block", "No grind reps while run load is high"]
    : ["Minimal dose: push-up ladder 3 rounds", "DB or band press 3×12", "One pull movement + shoulder health work"];

  const lowerBody = ["Running weeks: 1 moderate lower session only", "Hip hinge + split squat + calf/achilles support", "Avoid heavy eccentric leg volume before key runs"];
  const substitutions = env === "full gym" ? ["Barbell bench", "Incline DB", "Cable fly"] :
    env === "limited gym" ? ["DB flat press", "Machine press", "Push-up tempo sets"] :
    env === "no equipment" || env === "outdoors only" ? ["Push-up mechanical drops", "Backpack floor press", "Bench dip + pike push-up"] :
    ["Band chest press", "Tempo push-ups", "Single-arm rows with available load"];
  const tradeoff = focus !== "push" ? "Strength progression is intentionally slowed to protect primary goals and consistency." : "Strength is currently being pushed while endurance is maintained.";
  return { focus, benchEstimate, trainingMax, recentBenchHits, progression, lowerBody, substitutions, tradeoff };
};

const deriveProgressEngine = ({ logs, bodyweights, momentum, strengthLayer }) => {
  const entries = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0]));
  const last14Logs = entries.slice(-14).map(([,l])=>l);
  const prev14Logs = entries.slice(-28, -14).map(([,l])=>l);
  const thisWeekCount = entries.filter(([d]) => ((Date.now()-new Date(d+"T12:00:00").getTime())/(1000*60*60*24)) <= 7).length;
  const prevWeekCount = entries.filter(([d]) => {
    const dd = ((Date.now()-new Date(d+"T12:00:00").getTime())/(1000*60*60*24));
    return dd > 7 && dd <= 14;
  }).length;
  const adherenceRate = Math.round(Math.min(100, (last14Logs.length / 10) * 100));
  const streak = (() => {
    let s = 0;
    for (let i = entries.length - 1; i >= 0; i--) {
      const diff = Math.floor((Date.now() - new Date(entries[i][0]+"T12:00:00").getTime())/(1000*60*60*24));
      if (diff <= s + 1) s += 1; else break;
    }
    return Math.min(s, 14);
  })();

  const bwRecent = (bodyweights || []).slice(-21);
  const bwWeeklyDelta = bwRecent.length >= 2 ? (bwRecent[bwRecent.length-1].w - bwRecent[0].w) / Math.max(1, Math.round(bwRecent.length/7)) : 0;
  const weightTrend = bwRecent.length < 2 ? "insufficient" : bwWeeklyDelta <= -0.3 ? "down" : bwWeeklyDelta >= 0.3 ? "up" : "flat";
  const weightSignal = weightTrend === "down" ? `weight trending down ~${Math.abs(bwWeeklyDelta).toFixed(1)} lb/week` : weightTrend === "up" ? `weight trending up ~${Math.abs(bwWeeklyDelta).toFixed(1)} lb/week` : "weight holding roughly steady";

  const runPaces = last14Logs.filter(l => /run|tempo|interval|long/i.test(l.type || "") && l.pace && /\d+:\d+/.test(l.pace)).map(l => {
    const [m,s] = l.pace.split(":").map(Number); return m + (s/60);
  });
  const prevRunPaces = prev14Logs.filter(l => /run|tempo|interval|long/i.test(l.type || "") && l.pace && /\d+:\d+/.test(l.pace)).map(l => {
    const [m,s] = l.pace.split(":").map(Number); return m + (s/60);
  });
  const runAvg = runPaces.length ? runPaces.reduce((a,b)=>a+b,0)/runPaces.length : null;
  const prevRunAvg = prevRunPaces.length ? prevRunPaces.reduce((a,b)=>a+b,0)/prevRunPaces.length : null;
  const runTrend = runAvg && prevRunAvg ? (runAvg < prevRunAvg - 0.15 ? "improving" : runAvg > prevRunAvg + 0.15 ? "declining" : "steady") : "insufficient";
  const runSignal = runTrend === "improving" ? "running endurance/performance improving" : runTrend === "declining" ? "running performance slightly down; simplify and recover" : runTrend === "steady" ? "running performance holding steady" : "running trend still forming";

  const strengthSignal = strengthLayer.focus === "push" ? `estimated bench TM pushing (${strengthLayer.trainingMax})` : strengthLayer.focus === "maintain" ? `strength holding steady (TM ${strengthLayer.trainingMax})` : "strength temporarily deprioritized to protect consistency";
  const consistencySignal = thisWeekCount > prevWeekCount ? "consistency improving vs last week" : thisWeekCount < prevWeekCount ? "consistency softer vs last week" : "consistency steady vs last week";
  const warnings = [];
  if (weightTrend === "flat") warnings.push("weight trend is flat");
  if (runTrend === "declining") warnings.push("run performance trend is down");
  if (adherenceRate < 55) warnings.push("adherence is low");

  const highlights = [weightSignal, runSignal, strengthSignal, consistencySignal].slice(0, 4);
  return { highlights, warnings, weightSignal, runSignal, strengthSignal, streak, adherenceRate, consistencySignal };
};

const deriveExpectationEngine = ({ progress, momentum, arbitration }) => {
  const adherenceBand = progress?.adherenceRate >= 75 ? "high" : progress?.adherenceRate >= 55 ? "moderate" : "low";
  const weightWeekly = (() => {
    const m = /~([0-9.]+) lb\/week/.exec(progress?.weightSignal || "");
    return m ? parseFloat(m[1]) : null;
  })();
  const monthWeight = weightWeekly ? Math.max(0.8, Math.min(4.5, weightWeekly * 4)) : null;
  const weightExpectation = progress?.weightSignal?.includes("down")
    ? `At this pace, you’ll likely drop ~${Math.round(monthWeight)}–${Math.round(monthWeight + 1)} lbs over the next month if consistency holds.`
    : progress?.weightSignal?.includes("steady")
    ? "Scale trend should stay relatively stable over the next month if intake and execution stay similar."
    : "Bodyweight trend may drift up if this pattern continues; tightening consistency should correct it.";
  const runExpectation = progress?.runSignal?.includes("improving")
    ? "Running capacity should improve steadily over the next few weeks if we keep this structure."
    : progress?.runSignal?.includes("holding steady")
    ? "Running performance should keep inching forward if consistency holds."
    : progress?.runSignal?.includes("down")
    ? "Running performance may stay flat or dip short-term unless we simplify load and recover better."
    : "Running forecast is still forming; 2–3 consistent weeks will make direction clearer.";
  const strengthExpectation = progress?.strengthSignal?.includes("pushing")
    ? "You’re on track to rebuild strength over the next few weeks if we maintain current structure."
    : "Strength should hold and gradually rebuild if consistency and recovery stay in place.";
  const expectationStrength = adherenceBand === "high" && momentum?.momentumState !== "falling off"
    ? "slightly_positive"
    : adherenceBand === "low" || ["drifting","falling off"].includes(momentum?.momentumState)
    ? "conservative"
    : "neutral";
  const nextWindow = expectationStrength === "slightly_positive"
    ? "Near-term outlook: cautiously positive."
    : expectationStrength === "conservative"
    ? "Near-term outlook: progress is still possible, but slower unless consistency improves."
    : "Near-term outlook: steady progress if routines remain stable.";
  const motivationLine = expectationStrength === "conservative"
    ? "This is still worth continuing — even small consistent weeks re-accelerate progress."
    : "This is worth continuing — current habits are creating real momentum.";
  const conditionLine = expectationStrength === "conservative"
    ? "Condition: outcomes improve meaningfully if consistency and logging tighten."
    : "Condition: outcomes hold if consistency, structure, and current intake stay similar.";
  const coachLine = `${nextWindow} ${motivationLine} ${conditionLine}`;
  return { weightExpectation, runExpectation, strengthExpectation, expectationStrength, nextWindow, motivationLine, conditionLine, coachLine };
};

const parseSessionMinutes = (log) => {
  const rt = String(log?.runTime || "").trim();
  if (/^\d+$/.test(rt)) return Number(rt);
  if (/^\d+:\d{2}$/.test(rt)) {
    const [m, s] = rt.split(":").map(Number);
    return m + Math.round((s || 0) / 60);
  }
  const txt = `${log?.type || ""} ${log?.notes || ""}`;
  const m = txt.match(/(\d+)\s*min/i);
  return m ? Number(m[1]) : null;
};

const derivePersonalOptimizationLayer = ({ logs, dailyCheckins, nutritionFeedback, coachActions, validationLayer }) => {
  const logEntries = Object.entries(logs || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const last42 = logEntries.slice(-42).map(([, l]) => l || {});
  const checkinEntries = Object.entries(dailyCheckins || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const last42Checkins = checkinEntries.slice(-42).map(([, c]) => c || {});
  const weeklyCompleted = [];
  for (let i = 0; i < last42Checkins.length; i += 7) {
    const week = last42Checkins.slice(i, i + 7);
    if (!week.length) continue;
    weeklyCompleted.push(week.filter(c => ["completed_as_planned", "completed_modified"].includes(c.status) && !c.passiveAssumed).length);
  }
  const avgWeeklySessions = weeklyCompleted.length ? weeklyCompleted.reduce((s, n) => s + n, 0) / weeklyCompleted.length : 3;
  const optimalFrequency = avgWeeklySessions >= 4.2 ? "4-5 sessions/week" : avgWeeklySessions >= 3 ? "3-4 sessions/week" : "2-3 sessions/week";

  const durations = last42.map(parseSessionMinutes).filter(Boolean);
  const avgMinutes = durations.length ? Math.round(durations.reduce((s, n) => s + n, 0) / durations.length) : 35;
  const optimalSessionLength = avgMinutes <= 35 ? "25-40 min" : avgMinutes <= 50 ? "35-50 min" : "45-60 min";

  const recentNutrition = Object.values(nutritionFeedback || {}).slice(-21);
  const hunger = recentNutrition.filter(n => n.issue === "hunger").length;
  const offTrack = recentNutrition.filter(n => n.status === "off_track").length;
  const optimalDeficitRange = hunger >= 2 || offTrack >= 4 ? "minimal deficit (0-150 kcal)" : "moderate deficit (120-250 kcal)";

  const modifications = last42Checkins.filter(c => c.status === "completed_modified").length;
  const skips = last42Checkins.filter(c => c.status === "skipped").length;
  const optimalComplexity = (modifications + skips) >= 8 ? "low complexity" : "moderate complexity";

  const experimentActions = (coachActions || []).filter(a => a.source === "optimization_experiment");
  const lastExperimentTs = experimentActions[0]?.ts || 0;
  const cooldownDays = Math.floor((Date.now() - Number(lastExperimentTs || 0)) / 86400000);
  const canExperiment = cooldownDays >= 10 && last42Checkins.length >= 12;
  const winningSignals = (validationLayer?.recentResolved || []).filter(r => r.impact === "positive").length;
  const losingSignals = (validationLayer?.recentResolved || []).filter(r => r.impact === "negative").length;
  const reinforcementBias = winningSignals > losingSignals ? "reinforce_winners" : losingSignals > winningSignals ? "reduce_losers" : "hold";

  const pendingExperiment = canExperiment ? {
    type: avgWeeklySessions >= 4 ? "volume_minus_small" : "volume_plus_small",
    deltaPct: 6,
    note: avgWeeklySessions >= 4 ? "Test slightly lower volume for better consistency." : "Test slightly higher volume if momentum is stable.",
  } : null;

  const coachLine = `You seem to perform best with ${optimalFrequency} and ${optimalSessionLength} sessions.`;
  return {
    optimalZones: { optimalFrequency, optimalSessionLength, optimalDeficitRange, optimalComplexity },
    experimentation: { canExperiment, pendingExperiment, cooldownDays },
    reinforcementBias,
    coachLine,
    confidence: last42Checkins.length >= 14 ? "medium" : "low",
  };
};

const deriveLearningLayer = ({ dailyCheckins, logs, weeklyCheckins, momentum, personalization, validationLayer, optimizationLayer }) => {
  const checkins = Object.entries(dailyCheckins || {}).sort((a,b)=>a[0].localeCompare(b[0]));
  const last28 = checkins.slice(-28).map(([,v]) => v || {});
  const total = Math.max(1, last28.length);
  const skipped = last28.filter(c => c.status === "skipped").length;
  const modified = last28.filter(c => c.status === "completed_modified").length;
  const harder = last28.filter(c => c.sessionFeel === "harder_than_expected").length;
  const easier = last28.filter(c => c.sessionFeel === "easier_than_expected").length;
  const timeBlockers = last28.filter(c => c.blocker === "time").length;
  const equipBlockers = last28.filter(c => c.blocker === "no_equipment").length;
  const travelBlockers = last28.filter(c => c.blocker === "schedule_travel").length;
  const skippedByTravel = last28.filter(c => c.status === "skipped" && ["schedule_travel","no_equipment"].includes(c.blocker)).length;
  const logsArr = Object.values(logs || {});
  const strengthMods = logsArr.filter(l => /strength/i.test(l.type || "") && l.checkin?.status === "completed_modified").length;
  const runMods = logsArr.filter(l => /run|tempo|interval|long/i.test(l.type || "") && l.checkin?.status === "completed_modified").length;
  const weekly = Object.values(weeklyCheckins || {});
  const lowEnergyWeeks = weekly.filter(w => Number(w.energy || 3) <= 2).length;
  const highStressWeeks = weekly.filter(w => Number(w.stress || 3) >= 4).length;
  const lowConfidenceWeeks = weekly.filter(w => Number(w.confidence || 3) <= 2).length;

  const toConfidence = (count) => count >= 4 ? "high" : count >= 2 ? "medium" : "low";
  const observations = [];
  if (timeBlockers >= 1) observations.push({ key:"time", count: timeBlockers, msg:"You tend to skip when sessions feel too long/busy; shorter sessions improve follow-through.", confidence: toConfidence(timeBlockers), impact: "reduce_session_length" });
  if (harder >= 1) observations.push({ key:"hard", count: harder, msg:"Sessions often feel harder than expected; progression should be less aggressive.", confidence: toConfidence(harder), impact: "lower_aggressiveness" });
  if ((equipBlockers + travelBlockers) >= 1) observations.push({ key:"env", count: equipBlockers + travelBlockers, msg:"When gym access disappears, adherence drops; switch to simpler environment assumptions faster.", confidence: toConfidence(equipBlockers + travelBlockers), impact: "simplify_environment" });
  if (strengthMods > runMods) observations.push({ key:"strength_mods", count: strengthMods - runMods + 1, msg:"You modify strength sessions more than runs; keep strength sessions concise and practical.", confidence: toConfidence(strengthMods - runMods + 1), impact: "strength_simplify" });
  if (skippedByTravel >= 1) observations.push({ key:"travel_falloff", count: skippedByTravel, msg:"You often fall off after travel/missed days; reduce weekly density during chaotic periods.", confidence: toConfidence(skippedByTravel), impact: "reduce_week_density" });
  if (easier >= 2 && skipped <= 1) observations.push({ key:"ready", count: easier, msg:"You’ve handled this workload well before; modest progression is usually tolerated.", confidence: toConfidence(easier), impact: "modest_progress" });
  if (highStressWeeks + lowEnergyWeeks >= 1) observations.push({ key:"stress", count: highStressWeeks + lowEnergyWeeks, msg:"High-stress/low-energy weeks reduce execution; simplify sooner.", confidence: toConfidence(highStressWeeks + lowEnergyWeeks), impact: "simplify_week" });
  const ranked = observations.sort((a,b) => b.count - a.count);
  const topObservations = ranked.slice(0, 3);
  const mediumHigh = topObservations.filter(o => ["medium","high"].includes(o.confidence));
  const adaptation = {
    active: mediumHigh.length > 0,
    reasons: mediumHigh.map(o => `${o.msg} (${o.confidence})`),
    reduceDensity: mediumHigh.some(o => ["reduce_week_density","simplify_week","reduce_session_length"].includes(o.impact)),
    lowerAggressiveness: mediumHigh.some(o => ["lower_aggressiveness","reduce_week_density"].includes(o.impact)),
    simplifyStrength: mediumHigh.some(o => o.impact === "strength_simplify"),
    environmentFastSwitch: mediumHigh.some(o => o.impact === "simplify_environment"),
    pushSlightly: mediumHigh.some(o => o.impact === "modest_progress") && !mediumHigh.some(o => o.impact === "lower_aggressiveness"),
    validationBias: validationLayer?.strategyAdjustments || {},
    optimizationBias: optimizationLayer?.reinforcementBias || "hold",
  };
  const validationSimplifyPenalty = Object.values(validationLayer?.strategyAdjustments || {}).filter(v => v === "reduce").length;
  const validationProgressBoost = Object.values(validationLayer?.strategyAdjustments || {}).filter(v => v === "strengthen").length;
  const optimizationReduce = optimizationLayer?.reinforcementBias === "reduce_losers";
  const optimizationReinforce = optimizationLayer?.reinforcementBias === "reinforce_winners";
  const adjustmentBias = harder >= 3 || skipped >= 3 || lowConfidenceWeeks >= 2 || optimizationReduce
    ? "simplify"
    : (easier >= 4 && modified <= 1 && skipped <= 1) || validationProgressBoost >= 2 || optimizationReinforce
    ? "progress"
    : validationSimplifyPenalty >= 1
    ? "simplify"
    : "hold";
  const explanation = topObservations.length
    ? `Based on ${last28.length} recent check-ins: ${topObservations.map(o => o.msg).join(" ")}`
    : validationLayer?.summary || "Learning layer needs a few more quick check-ins before giving strong guidance.";

  return {
    stats: { total, skipped, modified, harder, easier, timeBlockers, equipBlockers, travelBlockers },
    weeklySignals: { lowEnergyWeeks, highStressWeeks, lowConfidenceWeeks },
    topObservations,
    adaptation,
    adjustmentBias,
    explanation,
  };
};

const deriveSalvageLayer = ({ logs, momentum, dailyCheckins, weeklyCheckins, personalization, learningLayer }) => {
  const recentLogs = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0])).slice(-10);
  const recentCheckins = Object.values(dailyCheckins || {}).slice(-10);
  const recentWeekly = Object.values(weeklyCheckins || {}).slice(-2);
  const missedCount = recentCheckins.filter(c => c.status === "skipped").length;
  const timeChaosBlockers = recentCheckins.filter(c => ["time","schedule_travel"].includes(c.blocker)).length + recentLogs.filter(([,l]) => /(chaos|busy|no time|overwhelmed|travel)/i.test(l.notes || "")).length;
  const travelLowAdherence = ["travel","limited gym","no equipment"].includes(personalization.travelState.environmentMode || "") && (missedCount >= 2 || momentum.momentumState !== "stable");
  const lowEnergyConfidence = recentWeekly.some(w => Number(w.energy || 3) <= 2 || Number(w.confidence || 3) <= 2);
  const drifting = ["drifting","falling off"].includes(momentum.momentumState);
  const repeatedSkipSignals = missedCount >= 2;
  const triggerReasons = [];
  if (repeatedSkipSignals) triggerReasons.push("multiple skipped sessions");
  if (drifting) triggerReasons.push(`momentum is ${momentum.momentumState}`);
  if (timeChaosBlockers >= 3) triggerReasons.push("time/chaos blockers are repeating");
  if (travelLowAdherence) triggerReasons.push("travel + low adherence");
  if (lowEnergyConfidence) triggerReasons.push("weekly check-ins show low energy/confidence");
  const active = triggerReasons.length >= 2;

  const compressedPlan = {
    keep: [
      "1 key run OR long run (pick the most realistic one this week)",
      "1 strength session (full-body, 35-45 min)",
      "1 optional conditioning/recovery session (easy run, walk, or mobility)",
    ],
    remove: [
      "Extra accessory volume",
      "Second-tier intensity sessions",
      "Complex day-to-day meal decisions",
    ],
    success: "Win the week by completing 2 core sessions + 1 optional recovery touchpoint.",
    nutrition: "Use default repeatable meals for 3 days: protein anchor + easy carbs around training.",
  };

  const exitReady = !active && ["stable","building momentum"].includes(momentum.momentumState) && missedCount <= 1;
  const coachMessage = active
    ? "Week has been compressed to preserve momentum. We’re prioritizing consistency over perfection."
    : exitReady
    ? "Salvage mode can be exited: adherence and momentum have recovered."
    : "Standard mode active.";

  return { active, triggerReasons, compressedPlan, exitReady, coachMessage };
};

const getLastDateKey = (obj = {}) => {
  const keys = Object.keys(obj || {}).sort((a, b) => a.localeCompare(b));
  return keys.length ? keys[keys.length - 1] : null;
};

const diffDaysFromKey = (dateKey) => {
  if (!dateKey) return 999;
  const ms = new Date(`${dateKey}T12:00:00`).getTime();
  if (Number.isNaN(ms)) return 999;
  return Math.max(0, Math.floor((Date.now() - ms) / 86400000));
};

const deriveFailureModeHardening = ({ logs, dailyCheckins, bodyweights, coachPlanAdjustments, coachActions, salvageLayer }) => {
  const lastLogGap = diffDaysFromKey(getLastDateKey(logs));
  const lastCheckinGap = diffDaysFromKey(getLastDateKey(dailyCheckins));
  const lastBWDate = bodyweights?.length ? bodyweights[bodyweights.length - 1]?.date : null;
  const lastBWGap = diffDaysFromKey(lastBWDate);
  const engagementGapDays = Math.min(lastLogGap, lastCheckinGap);
  const isLowEngagement = engagementGapDays >= 5;
  const isReEntry = engagementGapDays >= 10;
  const recentOverrides = Object.keys(coachPlanAdjustments?.dayOverrides || {})
    .filter(k => diffDaysFromKey(k) <= 14).length;
  const recentSalvageActivations = (coachActions || [])
    .filter(a => a.type === "ACTIVATE_SALVAGE" && (Date.now() - Number(a.ts || 0)) <= 21 * 86400000).length;
  const chaotic = salvageLayer?.active || recentOverrides >= 3 || recentSalvageActivations >= 2;
  const staleData = Math.min(lastLogGap, lastBWGap) >= 10 || (lastLogGap >= 7 && lastBWGap >= 21);
  const mode = isReEntry ? "re_entry" : (chaotic ? "chaotic" : (isLowEngagement ? "low_engagement" : "normal"));
  const planningHorizonDays = chaotic ? 3 : isLowEngagement ? 4 : 7;
  const uncertainty = staleData ? "high" : isLowEngagement ? "medium" : "low";
  const minimumViableStructure = {
    sessions: ["1 key run/walk", "1 strength minimum session (20-35 min)", "1 optional recovery touchpoint"],
    expectation: "Aim for consistency touchpoints, not full-volume perfection."
  };
  const coachBehavior = {
    tone: "no-guilt-forward-looking",
    primaryLine: isReEntry
      ? "Welcome back — we reset from today and rebuild momentum with a re-entry week."
      : chaotic
      ? "Chaotic period detected — simplify immediately and protect consistency."
      : isLowEngagement
      ? "Low engagement detected — only essentials for now; keep it light and achievable."
      : "Standard coaching mode.",
  };
  return { mode, engagementGapDays, planningHorizonDays, uncertainty, staleData, chaotic, isLowEngagement, isReEntry, minimumViableStructure, coachBehavior };
};

// ── MAIN APP ──────────────────────────────────────────────────────────────────
export default function TrainerDashboard() {
  const [tab, setTab] = useState(0);
  const [logs, setLogs] = useState({});
  const [bodyweights, setBodyweights] = useState([]);
  const [loading, setLoading] = useState(true);
  // Dynamic plan state
  const [paceOverrides, setPaceOverrides] = useState({}); // { "BASE": { easy: "...", ... }, ... }
  const [weekNotes, setWeekNotes] = useState({});          // { 5: "Makeup long run added", ... }
  const [planAlerts, setPlanAlerts] = useState([]);        // [{ id, msg, type, ts }]
  const [personalization, setPersonalization] = useState(DEFAULT_PERSONALIZATION);
  const [goals, setGoals] = useState(DEFAULT_MULTI_GOALS);
  const [coachActions, setCoachActions] = useState([]);
  const [coachPlanAdjustments, setCoachPlanAdjustments] = useState({ dayOverrides: {}, nutritionOverrides: {}, weekVolumePct: {}, extra: {} });
  const [dailyCheckins, setDailyCheckins] = useState({});
  const [weeklyCheckins, setWeeklyCheckins] = useState({});
  const [nutritionFavorites, setNutritionFavorites] = useState({ restaurants: [], groceries: [], safeMeals: [], travelMeals: [], defaultMeals: [] });
  const [nutritionFeedback, setNutritionFeedback] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [storageStatus, setStorageStatus] = useState({ mode: "syncing", label: "SYNCING" });
  const [lastSaved, setLastSaved] = useState(null);
  const [dismissedTriggers, setDismissedTriggers] = useState([]);
  const [authSession, setAuthSession] = useState(null);
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const DEBUG_MODE = typeof window !== "undefined" && localStorage.getItem("trainer_debug") === "1";
  const logDiag = (...args) => { if (DEBUG_MODE) console.log("[trainer-debug]", ...args); };

  const today = new Date();
  const currentWeek = getCurrentWeek();
  const dayOfWeek = getDayOfWeek();
  const baseTodayWorkout = getTodayWorkout(currentWeek, dayOfWeek);
  const baseWeek = WEEKS[(currentWeek - 1) % WEEKS.length] || WEEKS[0];
  const todayKey = new Date().toISOString().split("T")[0];
  const dayOverride = coachPlanAdjustments.dayOverrides?.[todayKey];
  const nutritionOverride = coachPlanAdjustments.nutritionOverrides?.[todayKey];
  const environmentSelection = resolveEnvironmentSelection({ personalization, todayKey, currentWeek });
  const momentum = getMomentumEngineState({ logs, bodyweights, personalization });
  const patterns = detectBehaviorPatterns({ logs, bodyweights, personalization });
  const validationLayer = deriveClosedLoopValidationLayer({ coachActions, logs, dailyCheckins });
  const optimizationLayer = derivePersonalOptimizationLayer({ logs, dailyCheckins, nutritionFeedback, coachActions, validationLayer });
  const learningLayer = deriveLearningLayer({ dailyCheckins, logs, weeklyCheckins, momentum, personalization, validationLayer, optimizationLayer });
  const salvageLayer = deriveSalvageLayer({ logs, momentum, dailyCheckins, weeklyCheckins, personalization, learningLayer });
  const failureMode = deriveFailureModeHardening({ logs, dailyCheckins, bodyweights, coachPlanAdjustments, coachActions, salvageLayer });
  const planComposer = composeGoalNativePlan({ goals, personalization, momentum, learningLayer, currentWeek, baseWeek });
  const rollingHorizon = buildRollingHorizonWeeks({ currentWeek, horizonWeeks: DEFAULT_PLANNING_HORIZON_WEEKS, goals, weekTemplates: WEEKS });
  const horizonAnchor = getHorizonAnchor(goals, DEFAULT_PLANNING_HORIZON_WEEKS);
  const goalNativeWorkout = planComposer?.dayTemplates?.[dayOfWeek] ? { ...baseTodayWorkout, ...planComposer.dayTemplates[dayOfWeek], week: baseWeek, zones: baseTodayWorkout?.zones } : baseTodayWorkout;
  const todayWorkoutBase = dayOverride ? { ...goalNativeWorkout, ...dayOverride, coachOverride: true, nutri: nutritionOverride || dayOverride.nutri || goalNativeWorkout?.week?.nutri } : { ...goalNativeWorkout, nutri: nutritionOverride || goalNativeWorkout?.week?.nutri };
  const weekState = failureMode?.mode === "chaotic" ? "chaotic" : momentum?.fatigueNotes >= 2 ? "fatigued" : "normal";
  const todayWorkoutEnvironment = applyEnvironmentToWorkout(todayWorkoutBase, environmentSelection, { weekState, injuryFlag: personalization?.injuryPainState?.level || "none" });
  const injuryRule = buildInjuryRuleResult(todayWorkoutEnvironment, personalization.injuryPainState);
  const todayWorkout = injuryRule.workout;
  const arbitration = arbitrateGoals({ goals, momentum, personalization });
  const strengthLayer = deriveStrengthLayer({ goals, momentum, personalization, logs });
  const progressEngine = deriveProgressEngine({ logs, bodyweights, momentum, strengthLayer });
  const expectations = deriveExpectationEngine({ progress: progressEngine, momentum, arbitration });
  const behaviorLoop = deriveBehaviorLoop({ dailyCheckins, logs, momentum, salvageLayer });
  const longTermMemory = useMemo(
    () => deriveLongTermMemoryLayer({
      logs,
      dailyCheckins,
      weeklyCheckins,
      nutritionFeedback,
      validationLayer,
      previousMemory: personalization?.coachMemory?.longTermMemory || []
    }),
    [logs, dailyCheckins, weeklyCheckins, nutritionFeedback, validationLayer]
  );
  const memoryInsights = longTermMemory.filter(m => m.confidence === "high").slice(0, 4);
  const recalibration = deriveRecalibrationEngine({ currentWeek, progress: progressEngine, momentum, learningLayer, memoryInsights, arbitration });
  const todayWorkoutHardened = failureMode.isReEntry
    ? { ...todayWorkout, label: `Re-entry day: ${todayWorkout?.label || "minimum viable session"}`, minDay: true, success: "Re-entry week: complete one essential session and log it. Momentum first." }
    : (failureMode.mode === "chaotic" || failureMode.isLowEngagement)
    ? { ...todayWorkout, minDay: true, success: "Chaotic-week mode: complete the minimum viable session only." }
    : todayWorkout;
  const nutritionLayer = deriveAdaptiveNutrition({ todayWorkout: todayWorkoutHardened, goals, momentum, personalization, bodyweights, learningLayer, nutritionFeedback, coachPlanAdjustments, salvageLayer, failureMode });
  const realWorldNutrition = deriveRealWorldNutritionEngine({
    location: personalization?.localFoodContext?.city,
    dayType: nutritionLayer.dayType,
    goalContext: getGoalContext(goals),
    nutritionLayer,
    momentum,
    favorites: nutritionFavorites,
    travelMode: personalization.travelState.isTravelWeek || (personalization.travelState.environmentMode || "").includes("travel"),
    learningLayer
  });
  const dailyBrief = generateDailyCoachBrief({ momentum, todayWorkout: todayWorkoutHardened, arbitration, injuryState: personalization.injuryPainState, patterns, learning: learningLayer, salvage: salvageLayer });
  const dailyStory = buildUnifiedDailyStory({ todayWorkout: todayWorkoutHardened, dailyBrief, progress: progressEngine, arbitration, expectations, salvage: salvageLayer, momentum });
  const weeklyReview = generateWeeklyCoachReview({ momentum, arbitration, signals: computeAdaptiveSignals({ logs, bodyweights, personalization }), personalization, patterns, learning: learningLayer, nutritionFeedback, expectations, recalibration });
  const baseProactiveTriggers = buildProactiveTriggers({ momentum, personalization, goals, learning: learningLayer, nutritionFeedback, longTermMemory }).filter(t => !dismissedTriggers.includes(t.id));
  const optimizationTrigger = optimizationLayer.experimentation.canExperiment && optimizationLayer.experimentation.pendingExperiment
    ? [{
      id: "opt_micro",
      msg: `Optional micro-test: ${optimizationLayer.experimentation.pendingExperiment.note}`,
      actionLabel: "Run micro-test",
      actionType: optimizationLayer.experimentation.pendingExperiment.type === "volume_minus_small" ? "REDUCE_WEEKLY_VOLUME" : "PROGRESS_STRENGTH_EMPHASIS",
      payload: optimizationLayer.experimentation.pendingExperiment.type === "volume_minus_small"
        ? { pct: optimizationLayer.experimentation.pendingExperiment.deltaPct, reason: "optimization_micro_test" }
        : { weeks: 1, reason: "optimization_micro_test" },
      source: "optimization",
      priority: 52,
    }]
    : [];
  const proactiveTriggers = [...optimizationTrigger, ...baseProactiveTriggers];

  useEffect(() => {
    if (loading) return;
    const prev = JSON.stringify(personalization?.coachMemory?.longTermMemory || []);
    const next = JSON.stringify(longTermMemory || []);
    if (prev === next) return;
    const updated = mergePersonalization(personalization, { coachMemory: { ...personalization.coachMemory, longTermMemory } });
    setPersonalization(updated);
    persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback);
  }, [longTermMemory]);

  const setInjuryState = async (level, area = personalization.injuryPainState.area) => {
    const painScore = level === "none" ? 1 : level === "mild_tightness" ? 2 : level === "moderate_pain" ? 4 : 5;
    const updated = mergePersonalization(personalization, {
      profile: {
        ...personalization.profile,
        inconsistencyRisk: momentum.inconsistencyRisk,
        currentMomentumState: momentum.momentumState,
        likelyAdherencePattern: momentum.likelyAdherencePattern,
      },
      injuryPainState: {
        ...personalization.injuryPainState,
        level,
        area,
        achilles: { ...personalization.injuryPainState.achilles, status: level === "none" ? "managed" : level === "mild_tightness" ? "watch" : "flared", painScore },
        activeModifications: buildInjuryRuleResult(todayWorkoutBase, { level, area }).mods,
      }
    });
    setPersonalization(updated);
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments);
  };
  const setEnvironmentMode = async ({ equipment, time, scope = "base" }) => {
    const baseConfig = personalization.environmentConfig?.base || { equipment: "dumbbells", time: "30" };
    const selected = { equipment: equipment || baseConfig.equipment, time: time || baseConfig.time };
    const nextEnvironmentConfig = {
      ...(personalization.environmentConfig || {}),
      base: scope === "base" ? selected : baseConfig,
      todayOverride: scope === "today" ? { ...selected, date: todayKey } : (scope === "base" ? null : personalization.environmentConfig?.todayOverride || null),
      weekOverride: scope === "week" ? { ...selected, week: currentWeek } : (scope === "base" ? null : personalization.environmentConfig?.weekOverride || null),
    };
    const environmentMode = selected.equipment === "full_gym"
      ? "full gym"
      : selected.equipment === "basic_gym"
      ? "limited gym"
      : selected.equipment === "none"
      ? "home"
      : "limited gym";
    const updated = mergePersonalization(personalization, {
      environmentConfig: nextEnvironmentConfig,
      travelState: {
        ...personalization.travelState,
        environmentMode,
        access: environmentMode.includes("gym") ? "hotel" : environmentMode,
      },
    });
    setPersonalization(updated);
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments, goals);
  };

  const applyDayContextOverride = async (contextKey) => {
    const cfg = DAY_CONTEXT_OVERRIDES[contextKey];
    if (!cfg) return;
    const nextAdjustments = {
      ...coachPlanAdjustments,
      dayOverrides: { ...(coachPlanAdjustments.dayOverrides || {}), [todayKey]: { label: cfg.label, type: cfg.type, reason: contextKey, minDay: true, fallback: cfg.fallback, success: cfg.success, injuryAdjusted: false } },
      nutritionOverrides: { ...(coachPlanAdjustments.nutritionOverrides || {}), [todayKey]: cfg.nutri },
      extra: { ...(coachPlanAdjustments.extra || {}), dayContext: { ...((coachPlanAdjustments.extra || {}).dayContext || {}), [todayKey]: contextKey } }
    };
    const nextNotes = { ...weekNotes, [currentWeek]: `Day override applied (${contextKey.replaceAll("_"," ")}).` };
    setCoachPlanAdjustments(nextAdjustments);
    setWeekNotes(nextNotes);
    await persistAll(logs, bodyweights, paceOverrides, nextNotes, planAlerts, personalization, coachActions, nextAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback);
  };

  const shiftTodayWorkout = async (daysForward = 1) => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + Math.max(1, Math.min(6, daysForward)));
    const toKey = targetDate.toISOString().split("T")[0];
    const nextAdjustments = {
      ...coachPlanAdjustments,
      dayOverrides: {
        ...(coachPlanAdjustments.dayOverrides || {}),
        [toKey]: { ...todayWorkoutBase, label: `${todayWorkoutBase?.label || "Session"} (Shifted)`, shiftedFrom: todayKey, coachOverride: true },
        [todayKey]: { label: "Minimum Viable Day", type: "rest", reason: "schedule_shift", minDay: true, fallback: DAY_CONTEXT_OVERRIDES.minimum_viable_day.fallback, success: DAY_CONTEXT_OVERRIDES.minimum_viable_day.success }
      },
      nutritionOverrides: { ...(coachPlanAdjustments.nutritionOverrides || {}), [todayKey]: "easyRun" },
      extra: { ...(coachPlanAdjustments.extra || {}), scheduleFlex: true }
    };
    const nextNotes = { ...weekNotes, [currentWeek]: `Workout shifted from ${todayKey} to ${toKey}; sequence auto-rebalanced via minimum viable day.` };
    setCoachPlanAdjustments(nextAdjustments);
    setWeekNotes(nextNotes);
    await persistAll(logs, bodyweights, paceOverrides, nextNotes, planAlerts, personalization, coachActions, nextAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback);
  };

  // ── SUPABASE STORAGE ─────────────────────────────────────────────────────
  const authStorage = useMemo(() => createAuthStorageModule({
    safeFetchWithTimeout,
    logDiag,
    mergePersonalization,
    DEFAULT_PERSONALIZATION,
    DEFAULT_MULTI_GOALS,
  }), []);

  const { SB_URL, SB_CONFIG_ERROR, localLoad } = authStorage;

  const handleSignIn = async () => {
    await authStorage.handleSignIn({ authEmail, authPassword, setAuthError, setAuthSession });
  };

  const handleSignUp = async () => {
    await authStorage.handleSignUp({ authEmail, authPassword, setAuthError, setAuthSession });
  };

  const handleSignOut = async () => {
    await authStorage.handleSignOut({ authSession, setAuthSession, setStorageStatus });
  };

  const persistAll = async (newLogs, newBW, newOvr, newNotes, newAlerts, newPersonalization = personalization, newCoachActions = coachActions, newCoachPlanAdjustments = coachPlanAdjustments, newGoals = goals, newDailyCheckins = dailyCheckins, newWeeklyCheckins = weeklyCheckins, newNutritionFavorites = nutritionFavorites, newNutritionFeedback = nutritionFeedback) => {
    const payload = { logs: newLogs, bw: newBW, paceOverrides: newOvr, weekNotes: newNotes, planAlerts: newAlerts, personalization: newPersonalization, goals: newGoals, coachActions: newCoachActions, coachPlanAdjustments: newCoachPlanAdjustments, dailyCheckins: newDailyCheckins, weeklyCheckins: newWeeklyCheckins, nutritionFavorites: newNutritionFavorites, nutritionFeedback: newNutritionFeedback, v: 6, ts: Date.now() };
    await authStorage.persistAll({ payload, authSession, setStorageStatus });
  };

  const sbLoad = async () => {
    await authStorage.sbLoad({
      authSession,
      setters: {
        setLogs,
        setBodyweights,
        setPaceOverrides,
        setWeekNotes,
        setPlanAlerts,
        setPersonalization,
        setGoals,
        setCoachActions,
        setCoachPlanAdjustments,
        setDailyCheckins,
        setWeeklyCheckins,
        setNutritionFavorites,
        setNutritionFeedback,
      },
      persistAll,
    });
  };

  useEffect(() => {
    console.log("[supabase] resolved URL:", SB_URL || "(missing)");
    if (SB_CONFIG_ERROR) {
      setAuthError(`Supabase setup error: ${SB_CONFIG_ERROR}`);
      setStorageStatus({ mode: "local", label: "CONFIG ERROR" });
    }
    const restored = authStorage.loadAuthSession();
    if (restored) setAuthSession(restored);
    setLoading(false);
  }, [SB_URL, SB_CONFIG_ERROR, authStorage]);

  useEffect(() => {
    if (!authSession?.user?.id) return;
    (async () => {
      setLoading(true);
      try {
        await sbLoad();
        setStorageStatus({ mode: "cloud", label: "SYNCED" });
      } catch(e) {
        logDiag("Cloud load failed:", e.message);
        const cache = localLoad();
        if (cache) await importData(btoa(unescape(encodeURIComponent(JSON.stringify(cache)))));
        setStorageStatus({ mode: "local", label: "LOCAL MODE" });
      }
      setLoading(false);
    })();
  }, [authSession?.user?.id]);

  useEffect(() => {
    if (!loading) persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback);
  }, [goals]);

  const saveLogs = async (newLogs) => {
    setLogs(newLogs);
    const derivedBase = derivePersonalization(newLogs, bodyweights, personalization);
    const m = getMomentumEngineState({ logs: newLogs, bodyweights, personalization: derivedBase });
    const derived = mergePersonalization(derivedBase, { profile: { ...derivedBase.profile, inconsistencyRisk: m.inconsistencyRisk, currentMomentumState: m.momentumState, likelyAdherencePattern: m.likelyAdherencePattern } });
    setPersonalization(derived);
    try {
      await persistAll(newLogs, bodyweights, paceOverrides, weekNotes, planAlerts, derived, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback);
      setLastSaved(new Date().toLocaleTimeString());
    } catch(e) { logDiag("saveLogs fallback", e.message); setStorageStatus({ mode: "local", label: "LOCAL MODE" }); }
    analyzePlan(newLogs);
  };

  const saveBodyweights = async (arr) => {
    setBodyweights(arr);
    const derivedBase = derivePersonalization(logs, arr, personalization);
    const m = getMomentumEngineState({ logs, bodyweights: arr, personalization: derivedBase });
    const derived = mergePersonalization(derivedBase, { profile: { ...derivedBase.profile, inconsistencyRisk: m.inconsistencyRisk, currentMomentumState: m.momentumState, likelyAdherencePattern: m.likelyAdherencePattern } });
    setPersonalization(derived);
    try {
      await persistAll(logs, arr, paceOverrides, weekNotes, planAlerts, derived, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback);
      setLastSaved(new Date().toLocaleTimeString());
    } catch(e) { logDiag("saveBodyweights fallback", e.message); setStorageStatus({ mode: "local", label: "LOCAL MODE" }); }
  };

  const savePlanState = async (newOvr, newNotes, newAlerts) => {
    try { await persistAll(logs, bodyweights, newOvr, newNotes, newAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback); } catch(e) {}
  };

  const saveDailyCheckin = async (dateKey, checkin) => {
    const merged = { ...DEFAULT_DAILY_CHECKIN, ...(checkin || {}) };
    const nextDaily = { ...dailyCheckins, [dateKey]: { ...merged, ts: Date.now() } };
    const feelMap = { easier_than_expected: "4", about_right: "3", harder_than_expected: "2" };
    const baseLog = logs[dateKey] || {
      date: dateKey,
      type: todayWorkout?.label || todayWorkout?.type || "Planned Session",
      location: personalization.travelState.environmentMode === "travel" ? "hotel" : "home",
      miles: "",
      pace: "",
      pushups: "",
      notes: "",
    };
    const linkedLog = {
      ...baseLog,
      feel: baseLog.feel || feelMap[merged.sessionFeel] || "3",
      notes: merged.note ? (baseLog.notes ? `${baseLog.notes} | ${merged.note}` : merged.note) : baseLog.notes,
      checkin: merged,
      ts: Date.now()
    };
    const nextLogs = { ...logs, [dateKey]: linkedLog };
    setDailyCheckins(nextDaily);
    setLogs(nextLogs);
    await persistAll(nextLogs, bodyweights, paceOverrides, weekNotes, planAlerts, personalization, coachActions, coachPlanAdjustments, goals, nextDaily, weeklyCheckins, nutritionFavorites, nutritionFeedback);
  };

  const saveWeeklyCheckin = async (weekNum, checkin) => {
    const nextWeekly = { ...weeklyCheckins, [String(weekNum)]: { ...(checkin || {}), ts: Date.now() } };
    const nextAlerts = [{ id:`weekly_${Date.now()}`, type:"info", msg:"Weekly reflection saved — nice follow-through." }, ...planAlerts].slice(0, 12);
    setWeeklyCheckins(nextWeekly);
    setPlanAlerts(nextAlerts);
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, nextAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, nextWeekly, nutritionFavorites, nutritionFeedback);
  };

  const saveNutritionFavorites = async (nextFavorites) => {
    setNutritionFavorites(nextFavorites);
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nextFavorites, nutritionFeedback);
  };

  const saveNutritionFeedback = async (dateKey, feedback) => {
    const nextFeedback = { ...nutritionFeedback, [dateKey]: { ...(feedback || {}), ts: Date.now() } };
    setNutritionFeedback(nextFeedback);
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nextFeedback);
  };

  const applyProactiveNudge = async (trigger) => {
    const dateKey = new Date().toISOString().split("T")[0];
    let nextAdjustments = { ...coachPlanAdjustments, dayOverrides: { ...(coachPlanAdjustments.dayOverrides || {}) }, nutritionOverrides: { ...(coachPlanAdjustments.nutritionOverrides || {}) }, weekVolumePct: { ...(coachPlanAdjustments.weekVolumePct || {}) }, extra: { ...(coachPlanAdjustments.extra || {}) } };
    let nextPersonalization = personalization;
    let nextWeekNotes = { ...weekNotes };
    if (trigger.actionType === "REDUCE_WEEKLY_VOLUME") {
      nextAdjustments.weekVolumePct[currentWeek] = 100 - (trigger.payload?.pct || 10);
      nextWeekNotes[currentWeek] = `Proactive nudge applied: week volume reduced by ${trigger.payload?.pct || 10}%.`;
    }
    if (trigger.actionType === "PROGRESS_STRENGTH_EMPHASIS") nextAdjustments.extra.strengthEmphasisWeeks = trigger.payload?.weeks || 1;
    if (trigger.actionType === "SWITCH_TRAVEL_MODE") {
      nextPersonalization = mergePersonalization(nextPersonalization, { travelState: { ...nextPersonalization.travelState, environmentMode: trigger.payload?.mode || "travel", isTravelWeek: true } });
    }
    if (trigger.actionType === "SIMPLIFY_MEALS_THIS_WEEK") nextAdjustments.extra.defaultMealStructureDays = trigger.payload?.days || 3;
    if (trigger.actionType === "SWITCH_TRAVEL_NUTRITION_MODE") {
      nextAdjustments.extra.travelNutritionMode = true;
      nextAdjustments.nutritionOverrides[dateKey] = "travelRun";
    }
    if (trigger.actionType === "SWITCH_ENV_MODE") {
      nextPersonalization = mergePersonalization(nextPersonalization, { travelState: { ...nextPersonalization.travelState, environmentMode: trigger.payload?.mode || "home" } });
    }
    if (trigger.actionType === "ACTIVATE_SALVAGE") {
      nextAdjustments.weekVolumePct[currentWeek] = 80;
      nextAdjustments.extra.mealSimplicityMode = true;
      nextWeekNotes[currentWeek] = "Proactive nudge applied: salvage compression (core sessions only).";
    }
    const nextCoachActions = [{
      id:`nudge_${Date.now()}`,
      ts: Date.now(),
      type: trigger.actionType,
      payload: trigger.payload || {},
      source: trigger.source === "optimization" ? "optimization_experiment" : "proactive_nudge",
      reason: trigger.msg || "proactive trigger",
      triggerReason: trigger.id || "trigger"
    }, ...coachActions].slice(0, 80);
    setCoachActions(nextCoachActions);
    setCoachPlanAdjustments(nextAdjustments);
    setPersonalization(nextPersonalization);
    setWeekNotes(nextWeekNotes);
    setDismissedTriggers(prev => [...prev, trigger.id]);
    await persistAll(logs, bodyweights, paceOverrides, nextWeekNotes, planAlerts, nextPersonalization, nextCoachActions, nextAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback);
  };

  const exportData = () => {
    const payload = { logs, bw: bodyweights, paceOverrides, weekNotes, planAlerts, personalization, goals, coachActions, coachPlanAdjustments, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback, v: 6, ts: Date.now() };
    return btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  };

  const importData = async (str) => {
    try {
      const payload = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
      const newLogs = payload.logs || {};
      const newBW = payload.bw || [];
      const newOvr = payload.paceOverrides || {};
      const newNotes = payload.weekNotes || {};
      const newAlerts = payload.planAlerts || [];
      const newPersonalization = mergePersonalization(DEFAULT_PERSONALIZATION, payload.personalization || {});
      const newGoals = payload.goals || DEFAULT_MULTI_GOALS;
      const newCoachActions = payload.coachActions || [];
      const newCoachPlanAdjustments = payload.coachPlanAdjustments || { dayOverrides: {}, nutritionOverrides: {}, weekVolumePct: {}, extra: {} };
      const newDailyCheckins = payload.dailyCheckins || {};
      const newWeeklyCheckins = payload.weeklyCheckins || {};
      const newNutritionFavorites = payload.nutritionFavorites || { restaurants: [], groceries: [], safeMeals: [], travelMeals: [], defaultMeals: [] };
      const newNutritionFeedback = payload.nutritionFeedback || {};
      setLogs(newLogs);
      setBodyweights(newBW);
      setPaceOverrides(newOvr);
      setWeekNotes(newNotes);
      setPlanAlerts(newAlerts);
      setPersonalization(newPersonalization);
      setGoals(newGoals);
      setCoachActions(newCoachActions);
      setCoachPlanAdjustments(newCoachPlanAdjustments);
      setDailyCheckins(newDailyCheckins);
      setWeeklyCheckins(newWeeklyCheckins);
      setNutritionFavorites(newNutritionFavorites);
      setNutritionFeedback(newNutritionFeedback);
      // Push restored data to Supabase immediately
      await persistAll(newLogs, newBW, newOvr, newNotes, newAlerts, newPersonalization, newCoachActions, newCoachPlanAdjustments, newGoals, newDailyCheckins, newWeeklyCheckins, newNutritionFavorites, newNutritionFeedback);
      setLastSaved("restored + synced");
      setStorageStatus({ mode: "cloud", label: "SYNCED" });
      return true;
    } catch(e) {
      logDiag("import failed", e.message);
      setStorageStatus({ mode: "local", label: "RESTORE FAILED" });
      return false;
    }
  };
  // Merge default zones with any AI-generated overrides
  const getZones = (phaseName) => {
    const defaults = PHASE_ZONES[phaseName] || PHASE_ZONES["BASE"];
    const overrides = paceOverrides[phaseName] || {};
    return { ...defaults, ...overrides };
  };

  // ── AI PLAN ANALYSIS ──────────────────────────────────────────────────────
  // Fires after every log save. Compares actual vs prescribed, detects patterns,
  // returns JSON modifications to apply to the plan.
  const getAnthropicKey = () => (typeof window !== "undefined" ? (localStorage.getItem("coach_api_key") || localStorage.getItem("anthropic_api_key") || "") : "");
  const callAnthropic = async ({ system, user, maxTokens = 800 }) => {
    const key = getAnthropicKey();
    if (!key) return null;
    try {
      const res = await safeFetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: maxTokens,
          system,
          messages: [{ role: "user", content: user }]
        })
      }, 9000);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.content?.[0]?.text || null;
    } catch {
      return null;
    }
  };

  const analyzePlan = async (newLogs) => {
    setAnalyzing(true);
    try {
      const logEntries = Object.entries(newLogs)
        .sort((a,b) => a[0].localeCompare(b[0]))
        .slice(-14) // last 14 sessions
        .map(([date, l]) => `${date}: ${l.type} | ${l.miles||"?"}mi | pace:${l.pace||"?"} | feel:${l.feel||"?"}/5${l.notes ? " | "+l.notes : ""}`);

      const currentWeekData = WEEKS[(currentWeek - 1) % WEEKS.length];
      const currentZones = getZones(currentWeekData?.phase || "BASE");

      const systemPrompt = `You are an AI running coach analyzing an athlete's training log to dynamically adjust their plan. Respond ONLY with valid JSON, no other text.

ATHLETE: 30yo, 6'1", 190lbs, half marathon goal 1:45 (8:01/mi) on July 19 2026.
CURRENT WEEK: ${currentWeek}, Phase: ${currentWeekData?.phase}
PRESCRIBED PACES: Easy ${currentZones.easy}/mi, Tempo ${currentZones.tempo}/mi, Intervals ${currentZones.int}/mi, Long ${currentZones.long}/mi

RECENT LOGS (newest last):
${logEntries.join("\n") || "No logs yet"}

CURRENT PACE OVERRIDES: ${JSON.stringify(paceOverrides)}
CURRENT WEEK NOTES: ${JSON.stringify(weekNotes)}

Analyze the logs and return JSON in this exact format:
{
  "paceAdjustments": {
    "PHASE_NAME": { "easy": "X:XX-X:XX", "tempo": "X:XX-X:XX", "int": "X:XX-X:XX", "long": "X:XX-X:XX" }
  },
  "weekNotes": {
    "WEEK_NUMBER": "note text"
  },
  "alerts": [
    { "id": "unique_id", "type": "upgrade|warning|info|makeup", "msg": "message text" }
  ],
  "noChange": true
}

RULES:
- Only include paceAdjustments if the athlete is CONSISTENTLY (3+ sessions) running faster or slower than prescribed by 20+ sec/mi. Don't adjust after 1-2 sessions.
- Only include weekNotes for weeks that are materially affected (missed workouts, makeup runs, schedule shifts).
- alerts should be short, direct, coach-like. Max 3 alerts total.
- If pace logged is 0:00 or missing, ignore it for pace analysis.
- If nothing needs changing, return { "noChange": true }
- NEVER adjust taper weeks (16-18) paces down — protect the taper.`;

      const text = await callAnthropic({ system: systemPrompt, user: "Analyze my training logs and return plan adjustments.", maxTokens: 800 });
      if (!text) {
        setAnalyzing(false);
        return;
      }

      // Strip any markdown fences if present
      const cleaned = text.replace(/```json|```/g, "").trim();
      const result = JSON.parse(cleaned);

      if (result.noChange) {
        setAnalyzing(false);
        return;
      }

      // Apply pace adjustments
      let newOverrides = paceOverrides;
      if (result.paceAdjustments && Object.keys(result.paceAdjustments).length > 0) {
        newOverrides = { ...paceOverrides };
        Object.entries(result.paceAdjustments).forEach(([phase, zones]) => {
          newOverrides[phase] = { ...(newOverrides[phase] || {}), ...zones };
        });
        setPaceOverrides(newOverrides);
      }

      // Apply week notes
      let newWeekNotes = weekNotes;
      if (result.weekNotes && Object.keys(result.weekNotes).length > 0) {
        newWeekNotes = { ...weekNotes, ...result.weekNotes };
        setWeekNotes(newWeekNotes);
      }

      // Apply alerts (deduplicate by id)
      let newAlerts = planAlerts;
      if (result.alerts && result.alerts.length > 0) {
        const existingIds = new Set(planAlerts.map(a => a.id));
        const added = result.alerts
          .filter(a => !existingIds.has(a.id))
          .map(a => ({ ...a, ts: Date.now() }));
        newAlerts = [...added, ...planAlerts].slice(0, 10);
        setPlanAlerts(newAlerts);
      }

      // Persist plan state changes to Supabase
      if (newOverrides !== paceOverrides || newWeekNotes !== weekNotes || newAlerts !== planAlerts) {
        savePlanState(newOverrides, newWeekNotes, newAlerts);
      }
    } catch(e) {
      // Silent fail — analysis is best-effort, never blocks logging
      logDiag("Plan analysis degraded:", e.message);
    }
    setAnalyzing(false);
  };

  const TABS = ["Today", "Program", "Log", "Nutrition", "Coach"];

  if (loading) return (
    <div style={{ background:"linear-gradient(180deg,#0b111a 0%, #0f1622 55%, #131b28 100%)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace", color:"#5f7086", fontSize:"0.7rem", letterSpacing:"0.2em" }}>
      LOADING...
    </div>
  );

  if (!authSession?.user?.id) return (
    <div style={{ background:"linear-gradient(180deg,#0b111a 0%, #0f1622 55%, #131b28 100%)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace", color:"#e2e8f0", padding:"1rem" }}>
      <div style={{ width:"100%", maxWidth:380, border:"1px solid #2a3445", borderRadius:10, padding:"1rem", background:"#151e2b" }}>
        <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", letterSpacing:"0.12em", color:"#f87171", marginBottom:"0.5rem" }}>ACCOUNT ACCESS</div>
        <div style={{ fontSize:"0.58rem", color:"#64748b", marginBottom:"0.5rem" }}>Sign in to load your private training state.</div>
        <input value={authEmail} onChange={e=>setAuthEmail(e.target.value)} placeholder="email" style={{ marginBottom:"0.4rem" }} />
        <input type="password" value={authPassword} onChange={e=>setAuthPassword(e.target.value)} placeholder="password" style={{ marginBottom:"0.5rem" }} />
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.35rem" }}>
          <button className="btn btn-primary" onClick={handleSignIn} style={{ fontSize:"0.56rem" }}>SIGN IN</button>
          <button className="btn" onClick={handleSignUp} style={{ fontSize:"0.56rem", color:"#94a3b8" }}>SIGN UP</button>
        </div>
        {authError && <div style={{ marginTop:"0.45rem", fontSize:"0.55rem", color:"#f59e0b" }}>{authError}</div>}
      </div>
    </div>
  );


  const daysToRace = Math.max(0, Math.ceil((new Date("2026-07-19") - today) / (1000*60*60*24)));

  return (
    <div style={{ fontFamily:"'DM Mono','Courier New',monospace", background:"linear-gradient(180deg,#0b111a 0%, #0f1622 55%, #131b28 100%)", minHeight:"100vh", color:"#e2e8f0", padding:"1.65rem 1.2rem" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        :root{
          --bg:#0f1622;
          --panel:#182334;
          --panel-2:#202c40;
          --panel-3:#25334a;
          --border:#304157;
          --muted:#72839a;
          --text:#e2e8f0;
          --accent:#4ade80;
        }
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0f1622} ::-webkit-scrollbar-thumb{background:#2a374a;border-radius:2px}
        .fi{animation:fi 0.22s ease forwards}
        .hov{transition:all 0.2s ease;cursor:pointer} .hov:hover{background:rgba(255,255,255,0.04)!important}
        .btn{background:#1a2433;border:1px solid #314055;border-radius:8px;font-family:'DM Mono',monospace;font-size:0.6rem;letter-spacing:0.05em;cursor:pointer;padding:6px 11px;transition:all 0.2s ease;color:#b6c5d9}
        .btn:hover{border-color:#41546e;color:#f1f5f9;transform:translateY(-1px)}
        .btn:active{transform:translateY(0)}
        .btn-primary{background:#47d87f!important;border-color:#47d87f!important;color:#06110a!important;font-weight:600;box-shadow:0 4px 14px rgba(71,216,127,0.22)}
        .btn-primary:hover{filter:brightness(1.04);box-shadow:0 6px 16px rgba(71,216,127,0.24)}
        input,textarea,select{background:#1b2638;border:1px solid var(--border);border-radius:8px;color:var(--text);font-family:'DM Mono',monospace;font-size:0.68rem;padding:7px 10px;outline:none;width:100%;transition:border-color 0.2s ease, box-shadow 0.2s ease}
        input:focus,textarea:focus,select:focus{border-color:#4a5f7b;box-shadow:0 0 0 3px rgba(96,165,250,0.10)}
        @keyframes fi{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        .tag{font-size:0.56rem;padding:3px 7px;border-radius:999px;letter-spacing:0.03em;white-space:nowrap;background:#1b2638}
        .card{
          background:linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)) , var(--panel);
          border:1px solid rgba(129,149,178,0.11);
          border-radius:12px;
          padding:1.05rem;
          box-shadow:0 8px 20px rgba(4,8,14,0.28), inset 0 1px 0 rgba(255,255,255,0.02);
          transition:transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease
        }
        .card:hover{box-shadow:0 12px 28px rgba(4,8,14,0.35)}
        .card-strong{
          background:linear-gradient(180deg, rgba(96,165,250,0.08), rgba(96,165,250,0.01)), var(--panel-2);
          border-color:rgba(96,165,250,0.22);
          box-shadow:0 14px 32px rgba(6,12,22,0.42), 0 0 0 1px rgba(96,165,250,0.05);
        }
        .card-soft{
          background:linear-gradient(180deg, rgba(255,255,255,0.01), rgba(255,255,255,0)), var(--panel);
          border-color:rgba(129,149,178,0.08);
          box-shadow:0 6px 14px rgba(4,8,14,0.22);
        }
        .sect-title{font-family:'Bebas Neue',sans-serif;font-size:1.02rem;letter-spacing:0.04em;text-transform:none;color:#dbe7f6}
        details > summary{list-style:none}
        details > summary::-webkit-details-marker{display:none}
        details[open]{animation:fi 0.18s ease}
      `}</style>

      <div style={{ maxWidth:820, margin:"0 auto", background:"radial-gradient(140% 100% at 50% -5%, rgba(73,92,122,0.24), transparent 58%)" }}>

        {/* ── HEADER BAR ── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.25rem", flexWrap:"wrap", gap:"0.5rem" }}>
          <div>
            <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.8rem", letterSpacing:"0.08em", background:"linear-gradient(135deg,#fff 40%,#f87171)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", lineHeight:1 }}>
              PERSONAL TRAINER
            </h1>
            <div style={{ fontSize:"0.58rem", color:"#334155", letterSpacing:"0.12em", marginTop:2 }}>
              {fmtDate(today).toUpperCase()} · WEEK {currentWeek} · PERSONAL COACHING
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div className="mono" style={{ fontSize:"1.7rem", color:daysToRace <= 30 ? C.red : "#475569", fontWeight:500, lineHeight:1 }}>{daysToRace}</div>
            <div style={{ fontSize:"0.7rem", color:"#334155", marginTop:2 }}>days to race</div>
            <div style={{ marginTop:6, display:"flex", gap:"0.75rem", alignItems:"center", justifyContent:"flex-end" }}>
              <div style={{ fontSize:"0.65rem", color: storageStatus.mode === "cloud" ? "#4ade80" : "#f59e0b" }}>{storageStatus.mode === "cloud" ? "Synced" : "Offline"}</div>
              <button className="btn" onClick={handleSignOut} style={{ fontSize:"0.65rem", padding:"4px 10px" }}>Sign out</button>
            </div>
          </div>
        </div>
        {/* ── TABS ── */}
        <div style={{ display:"flex", gap:"0.25rem", marginBottom:"1.25rem", background:"#151f2e", padding:"0.3rem", borderRadius:10, border:"1px solid #2b394d", overflowX:"auto" }}>
          {TABS.map((t,i) => (
            <button key={t} className="btn" onClick={()=>setTab(i)}
              style={{ color:tab===i?"#0c1320":"#70839b", background:tab===i?"#e6edf7":"transparent", borderColor:tab===i?"#e6edf7":"transparent", fontWeight:tab===i?500:300, flexShrink:0 }}>
              {t}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════
            TODAY
        ══════════════════════════════════════════════════════════ */}
        {tab === 0 && <TodayTab todayWorkout={todayWorkoutHardened} currentWeek={currentWeek} logs={logs} bodyweights={bodyweights} planAlerts={planAlerts} setPlanAlerts={setPlanAlerts} analyzing={analyzing} getZones={getZones} personalization={personalization} goals={goals} momentum={momentum} strengthLayer={strengthLayer} dailyStory={dailyStory} behaviorLoop={behaviorLoop} proactiveTriggers={proactiveTriggers} onDismissTrigger={(id)=>setDismissedTriggers(prev=>[...prev,id])} onApplyTrigger={applyProactiveNudge} applyDayContextOverride={applyDayContextOverride} shiftTodayWorkout={shiftTodayWorkout} setEnvironmentMode={setEnvironmentMode} environmentSelection={environmentSelection} injuryRule={injuryRule} setInjuryState={setInjuryState} dailyCheckins={dailyCheckins} saveDailyCheckin={saveDailyCheckin} learningLayer={learningLayer} salvageLayer={salvageLayer} validationLayer={validationLayer} optimizationLayer={optimizationLayer} failureMode={failureMode} planComposer={planComposer} saveBodyweights={saveBodyweights} />}

        {/* ══════════════════════════════════════════════════════════
            PROGRAM
        ══════════════════════════════════════════════════════════ */}
        {tab === 1 && <PlanTab currentWeek={currentWeek} logs={logs} bodyweights={bodyweights} personalization={personalization} goals={goals} setGoals={setGoals} momentum={momentum} strengthLayer={strengthLayer} weeklyReview={weeklyReview} expectations={expectations} memoryInsights={memoryInsights} recalibration={recalibration} patterns={patterns} getZones={getZones} weekNotes={weekNotes} paceOverrides={paceOverrides} setPaceOverrides={setPaceOverrides} learningLayer={learningLayer} salvageLayer={salvageLayer} failureMode={failureMode} planComposer={planComposer} rollingHorizon={rollingHorizon} horizonAnchor={horizonAnchor} weeklyCheckins={weeklyCheckins} saveWeeklyCheckin={saveWeeklyCheckin} environmentSelection={environmentSelection} setEnvironmentMode={setEnvironmentMode} />}

        {/* ══════════════════════════════════════════════════════════
            LOG
        ══════════════════════════════════════════════════════════ */}
        {tab === 2 && <LogTab logs={logs} saveLogs={saveLogs} bodyweights={bodyweights} saveBodyweights={saveBodyweights} currentWeek={currentWeek} todayWorkout={todayWorkout} exportData={exportData} importData={importData} />}

        {/* ══════════════════════════════════════════════════════════
            NUTRITION
        ══════════════════════════════════════════════════════════ */}
        {tab === 3 && <NutritionTab todayWorkout={todayWorkoutHardened} personalization={personalization} goals={goals} momentum={momentum} bodyweights={bodyweights} learningLayer={learningLayer} nutritionLayer={nutritionLayer} realWorldNutrition={realWorldNutrition} nutritionFavorites={nutritionFavorites} saveNutritionFavorites={saveNutritionFavorites} nutritionFeedback={nutritionFeedback} saveNutritionFeedback={saveNutritionFeedback} />}

        {/* ══════════════════════════════════════════════════════════
            COACH
        ══════════════════════════════════════════════════════════ */}
        {tab === 4 && <CoachTab logs={logs} currentWeek={currentWeek} todayWorkout={todayWorkoutHardened} bodyweights={bodyweights} personalization={personalization} momentum={momentum} arbitration={arbitration} expectations={expectations} memoryInsights={memoryInsights} recalibration={recalibration} strengthLayer={strengthLayer} patterns={patterns} proactiveTriggers={proactiveTriggers} onApplyTrigger={applyProactiveNudge} learningLayer={learningLayer} salvageLayer={salvageLayer} validationLayer={validationLayer} optimizationLayer={optimizationLayer} failureMode={failureMode} planComposer={planComposer} nutritionLayer={nutritionLayer} realWorldNutrition={realWorldNutrition} nutritionFeedback={nutritionFeedback} setPersonalization={setPersonalization} coachActions={coachActions} setCoachActions={setCoachActions} coachPlanAdjustments={coachPlanAdjustments} setCoachPlanAdjustments={setCoachPlanAdjustments} weekNotes={weekNotes} setWeekNotes={setWeekNotes} planAlerts={planAlerts} setPlanAlerts={setPlanAlerts} onPersist={async (nextPersonalization, nextCoachActions, nextCoachPlanAdjustments = coachPlanAdjustments, nextWeekNotes = weekNotes, nextPlanAlerts = planAlerts) => {
          setPersonalization(nextPersonalization);
          setCoachActions(nextCoachActions);
          setCoachPlanAdjustments(nextCoachPlanAdjustments);
          setWeekNotes(nextWeekNotes);
          setPlanAlerts(nextPlanAlerts);
          await persistAll(logs, bodyweights, paceOverrides, nextWeekNotes, nextPlanAlerts, nextPersonalization, nextCoachActions, nextCoachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback);
        }} />}
      </div>
    </div>
  );
}

// ── TODAY TAB ─────────────────────────────────────────────────────────────────
function TodayTab({ todayWorkout, currentWeek, logs, bodyweights, planAlerts, setPlanAlerts, analyzing, getZones, personalization, goals, momentum, strengthLayer, dailyStory, behaviorLoop, proactiveTriggers, onDismissTrigger, onApplyTrigger, applyDayContextOverride, shiftTodayWorkout, setEnvironmentMode, environmentSelection, injuryRule, setInjuryState, dailyCheckins, saveDailyCheckin, learningLayer, salvageLayer, validationLayer, optimizationLayer, failureMode, planComposer, saveBodyweights }) {
  const zones = todayWorkout?.zones;
  const todayKey = new Date().toISOString().split("T")[0];
  const todayLog = logs[todayKey];
  const dayColor = todayWorkout ? (dayColors[todayWorkout.type] || C.green) : C.slate;
  const [injuryArea, setInjuryArea] = useState(personalization.injuryPainState.area || "Achilles");
  const defaultCheckin = dailyCheckins?.[todayKey] || (todayLog?.checkin || DEFAULT_DAILY_CHECKIN);
  const [checkin, setCheckin] = useState(defaultCheckin);
  const [checkinAck, setCheckinAck] = useState("");
  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [envDraft, setEnvDraft] = useState({ equipment: environmentSelection?.equipment || "dumbbells", time: environmentSelection?.time || "30", scope: "today" });
  const [cardExpanded, setCardExpanded] = useState(() => {
    try { return sessionStorage.getItem("card_" + todayKey) === "1"; } catch { return false; }
  });
  const [showInjuryPanel, setShowInjuryPanel] = useState(false);
  const conciseFocus = (dailyStory?.focus || dailyStory?.brief || "Execute today’s session cleanly.")
    .replace(/^execute\s*/i, "")
    .split(".")[0];
  const conciseSuccess = (dailyStory?.success || "Complete the session and log it.").split(".")[0];
  const equipmentLabel = environmentSelection?.equipment === "none"
    ? "No equipment"
    : environmentSelection?.equipment === "basic_gym"
    ? "Basic gym"
    : environmentSelection?.equipment === "full_gym"
    ? "Full gym"
    : "Dumbbells";
  const timeLabel = environmentSelection?.time === "45+" ? "45+ min" : `${environmentSelection?.time || "30"} min`;
  const injuryLevel = personalization.injuryPainState.level;
  const injuryBadge = injuryLevel === "none" ? null : injuryLevel === "mild_tightness" ? { label: "Mild", color: C.blue } : injuryLevel === "moderate_pain" ? { label: "Moderate", color: C.amber } : { label: "Pain/Stop", color: C.red };
  const strTrack = todayWorkout?.strengthTrack || "home";
  const strSess = todayWorkout?.strSess || "A";
  const strExercises = STRENGTH[strSess]?.[strTrack] || [];
  const hasStrength = todayWorkout?.type === "run+strength" || todayWorkout?.type === "strength+prehab";
  const hasPrehab = todayWorkout?.type === "strength+prehab";
  const runColor = todayWorkout?.run?.t === "Intervals" ? C.amber : todayWorkout?.run?.t === "Long" ? C.red : todayWorkout?.run?.t === "Tempo" ? C.amber : C.green;
  const runPace = todayWorkout?.run ? (todayWorkout.run.t === "Intervals" ? zones?.int : todayWorkout.run.t === "Long" ? zones?.long : todayWorkout.run.t === "Tempo" ? zones?.tempo : zones?.easy) : null;
  const tomorrowWorkout = getTodayWorkout(currentWeek, (getDayOfWeek() + 1) % 7);

  useEffect(() => { setCheckin(defaultCheckin); }, [todayKey, dailyCheckins?.[todayKey], todayLog?.checkin?.ts]);

  const toggleCard = () => {
    const next = !cardExpanded;
    setCardExpanded(next);
    try { sessionStorage.setItem("card_" + todayKey, next ? "1" : "0"); } catch {}
  };

  // Coach context lines (formerly in "More context" dropdown)
  const contextLines = [
    salvageLayer.active ? salvageLayer.compressedPlan.success : null,
    failureMode.mode !== "normal" ? failureMode.coachBehavior.primaryLine : null,
    validationLayer?.coachNudge || null,
  ].filter(Boolean);

  return (
    <div className="fi">
      {/* Header */}
      <div style={{ marginBottom:"0.85rem", display:"grid", gap:"0.2rem" }}>
        <div style={{ fontSize:"0.56rem", color:"#64748b", letterSpacing:"0.14em" }}>TODAY</div>
        <div style={{ fontFamily:"’Inter’,sans-serif", fontSize:"1.45rem", color:"#f8fafc", fontWeight:600, lineHeight:1.15 }}>{todayWorkout?.label || "Rest Day"}</div>
        <div style={{ fontSize:"0.58rem", color:"#cbd5e1", lineHeight:1.55 }}>{conciseFocus}</div>
      </div>

      {/* ── Expandable Workout Card ── */}
      <div
        onClick={toggleCard}
        style={{ marginBottom:"0.5rem", background:"#0f172a", border:`1px solid ${dayColor}18`, borderRadius:12, padding:"1rem 1.1rem", cursor:"pointer", transition:"border-color 0.15s", userSelect:"none" }}
      >
        {/* Card header row: badges + chevron */}
        <div style={{ display:"flex", alignItems:"center", gap:"0.4rem", marginBottom:"0.55rem", flexWrap:"wrap" }}>
          <span style={{ fontSize:"0.48rem", color:dayColor, background:dayColor+"15", padding:"0.15rem 0.45rem", borderRadius:6, fontWeight:500, letterSpacing:"0.04em" }}>
            {todayWorkout?.type?.replace(/[+-]/g," + ").toUpperCase() || "REST"}
          </span>
          <span onClick={e=>{ e.stopPropagation(); setEnvDraft({ equipment: environmentSelection?.equipment || "dumbbells", time: environmentSelection?.time || "30", scope: "today" }); setShowEnvEditor(true); }} style={{ fontSize:"0.48rem", color:"#94a3b8", background:"#1e293b", padding:"0.15rem 0.45rem", borderRadius:6, cursor:"pointer" }}>
            {equipmentLabel} · {timeLabel}
          </span>
          {injuryBadge && (
            <span onClick={e=>{ e.stopPropagation(); setShowInjuryPanel(p=>!p); }} style={{ fontSize:"0.48rem", color:injuryBadge.color, background:injuryBadge.color+"15", padding:"0.15rem 0.45rem", borderRadius:6, cursor:"pointer" }}>
              {injuryBadge.label}
            </span>
          )}
          <span style={{ marginLeft:"auto", fontSize:"0.65rem", color:"#475569", transform: cardExpanded ? "rotate(180deg)" : "rotate(0deg)", transition:"transform 0.2s" }}>▾</span>
        </div>

        {/* Key stats row (always visible) */}
        {todayWorkout?.run && (
          <div style={{ display:"flex", gap:"1.2rem", marginBottom: hasStrength ? "0.35rem" : 0 }}>
            <div>
              <div style={{ fontSize:"0.52rem", color:"#475569" }}>Distance</div>
              <div className="mono" style={{ fontSize:"0.85rem", color:runColor, fontWeight:500 }}>{todayWorkout.run.d}</div>
            </div>
            <div>
              <div style={{ fontSize:"0.52rem", color:"#475569" }}>Pace</div>
              <div className="mono" style={{ fontSize:"0.85rem", color:runColor, fontWeight:500 }}>{runPace}/mi</div>
            </div>
            <div>
              <div style={{ fontSize:"0.52rem", color:"#475569" }}>Type</div>
              <div style={{ fontSize:"0.85rem", color:runColor, fontWeight:500 }}>{todayWorkout.run.t}</div>
            </div>
          </div>
        )}
        {hasStrength && !todayWorkout?.run && (
          <div style={{ display:"flex", gap:"1.2rem" }}>
            <div>
              <div style={{ fontSize:"0.52rem", color:"#475569" }}>Session</div>
              <div style={{ fontSize:"0.85rem", color:C.blue, fontWeight:500 }}>Strength {strSess}</div>
            </div>
            <div>
              <div style={{ fontSize:"0.52rem", color:"#475569" }}>Track</div>
              <div style={{ fontSize:"0.85rem", color:C.blue, fontWeight:500 }}>{strTrack === "hotel" ? "Gym" : "Home"}</div>
            </div>
            <div>
              <div style={{ fontSize:"0.52rem", color:"#475569" }}>Duration</div>
              <div className="mono" style={{ fontSize:"0.85rem", color:C.blue, fontWeight:500 }}>{todayWorkout?.strengthDuration || "20-30 min"}</div>
            </div>
          </div>
        )}
        {hasStrength && todayWorkout?.run && (
          <div style={{ fontSize:"0.56rem", color:"#94a3b8" }}>
            + Strength {strSess} ({strTrack === "hotel" ? "Gym" : "Home"}) · {todayWorkout?.strengthDuration || "20-30 min"}
          </div>
        )}

        {/* ── Expanded detail ── */}
        {cardExpanded && (
          <div style={{ marginTop:"0.75rem", borderTop:"1px solid #1e293b", paddingTop:"0.75rem" }} onClick={e => e.stopPropagation()}>
            {/* Run section */}
            {todayWorkout?.run && (
              <div style={{ marginBottom: hasStrength ? "0.85rem" : 0 }}>
                <div style={{ fontSize:"0.52rem", color:"#64748b", letterSpacing:"0.1em", marginBottom:"0.4rem" }}>RUN</div>
                <div style={{ fontSize:"0.62rem", color:"#cbd5e1", lineHeight:1.65 }}>
                  {todayWorkout.run.t} — {todayWorkout.run.d} at {runPace}/mi
                </div>
                {todayWorkout?.environmentNote && <div style={{ fontSize:"0.54rem", color:"#94a3b8", marginTop:"0.2rem" }}>{todayWorkout.environmentNote}</div>}
              </div>
            )}

            {/* Strength section */}
            {hasStrength && (
              <div style={{ marginBottom: hasPrehab ? "0.85rem" : 0 }}>
                <div style={{ fontSize:"0.52rem", color:"#64748b", letterSpacing:"0.1em", marginBottom:"0.4rem" }}>STRENGTH {strSess} — {strTrack === "hotel" ? "GYM" : "HOME"}</div>
                <div style={{ display:"grid", gap:"0.3rem" }}>
                  {strExercises.map((ex, i) => (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"0.5rem", padding:"0.35rem 0", borderBottom: i < strExercises.length - 1 ? "1px solid #1e293b20" : "none" }}>
                      <div>
                        <div style={{ fontSize:"0.6rem", color:"#e2e8f0", fontWeight:500 }}>{ex.ex}</div>
                        <div style={{ fontSize:"0.5rem", color:"#64748b", marginTop:"0.1rem" }}>{ex.note}</div>
                      </div>
                      <div className="mono" style={{ fontSize:"0.58rem", color:C.blue, fontWeight:500, whiteSpace:"nowrap", alignSelf:"center" }}>{ex.sets}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Prehab section */}
            {hasPrehab && (
              <div>
                <div style={{ fontSize:"0.52rem", color:"#64748b", letterSpacing:"0.1em", marginBottom:"0.4rem" }}>ACHILLES PREHAB</div>
                <div style={{ display:"grid", gap:"0.3rem" }}>
                  {ACHILLES.map((ex, i) => (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"0.5rem", padding:"0.35rem 0", borderBottom: i < ACHILLES.length - 1 ? "1px solid #1e293b20" : "none" }}>
                      <div>
                        <div style={{ fontSize:"0.6rem", color:"#e2e8f0", fontWeight:500 }}>{ex.ex}</div>
                        <div style={{ fontSize:"0.5rem", color:"#64748b", marginTop:"0.1rem" }}>{ex.note}</div>
                      </div>
                      <div className="mono" style={{ fontSize:"0.58rem", color:C.green, fontWeight:500, whiteSpace:"nowrap", alignSelf:"center" }}>{ex.sets}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Optional secondary */}
            {(todayWorkout?.optionalSecondary || planComposer?.aestheticAllocation?.active) && (
              <div style={{ marginTop:"0.6rem", fontSize:"0.56rem", color:"#cbd5e1" }}>
                + {todayWorkout?.optionalSecondary || "Optional: 10 min core"}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tomorrow preview */}
      <div style={{ fontSize:"0.54rem", color:"#475569", marginBottom:"0.85rem", paddingLeft:"0.15rem" }}>
        Tomorrow: {tomorrowWorkout?.label || "Rest"}{tomorrowWorkout?.run ? ` — ${tomorrowWorkout.run.d}` : ""}
      </div>

      {/* Coach context (replaces "More context" dropdown) */}
      {contextLines.length > 0 && (
        <div style={{ marginBottom:"0.75rem", padding:"0.55rem 0.7rem", background:"#0d1117", borderRadius:8, display:"grid", gap:"0.25rem" }}>
          {contextLines.map((line, i) => (
            <div key={i} style={{ fontSize:"0.54rem", color: i === 0 ? C.amber : i === 1 ? C.green : C.blue }}>{line}</div>
          ))}
        </div>
      )}

      {/* Proactive nudge */}
      {proactiveTriggers[0] && (
        <div style={{ marginBottom:"0.75rem", display:"flex", gap:"0.35rem", alignItems:"center" }}>
          <button className="btn" onClick={()=>onApplyTrigger(proactiveTriggers[0])} style={{ fontSize:"0.52rem", color:C.green, borderColor:C.green+"30" }}>{proactiveTriggers[0].actionLabel || "Apply nudge"}</button>
          <button className="btn" onClick={()=>onDismissTrigger(proactiveTriggers[0].id)} style={{ fontSize:"0.52rem" }}>Dismiss</button>
        </div>
      )}

      {/* Fallback row */}
      <div style={{ marginBottom:"0.85rem", display:"grid", gridTemplateColumns:"1fr auto auto", alignItems:"center", gap:"0.4rem", background:"#0f141d", borderRadius:10, padding:"0.7rem 0.85rem" }}>
        <div style={{ fontSize:"0.55rem", color:"#7f92aa" }}>Fallback</div>
        <button className="btn" onClick={()=>applyDayContextOverride("minimum_viable_day")} style={{ fontSize:"0.5rem", color:C.green, borderColor:C.green+"30" }}>20-min version</button>
        <button className="btn" onClick={()=>shiftTodayWorkout(1)} style={{ fontSize:"0.5rem", color:C.blue, borderColor:C.blue+"30" }}>Move to tomorrow</button>
      </div>

      {/* Injury panel (shown when injury badge tapped) */}
      {showInjuryPanel && (
        <div className="card card-soft" style={{ marginBottom:"0.75rem" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.35rem" }}>
            <div className="sect-title" style={{ color:C.amber }}>INJURY STATUS</div>
            <button onClick={()=>setShowInjuryPanel(false)} style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:"0.7rem" }}>×</button>
          </div>
          <select value={injuryArea} onChange={e=>setInjuryArea(e.target.value)} style={{ fontSize:"0.56rem", marginBottom:"0.35rem" }}>
            {AFFECTED_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <div style={{ display:"flex", gap:"0.3rem", flexWrap:"wrap" }}>
            <button className="btn" onClick={()=>setInjuryState("none", injuryArea)} style={{ color:C.green, borderColor:C.green+"35" }}>Clear</button>
            <button className="btn" onClick={()=>setInjuryState("mild_tightness", injuryArea)} style={{ color:C.blue, borderColor:C.blue+"35" }}>Mild</button>
            <button className="btn" onClick={()=>setInjuryState("moderate_pain", injuryArea)} style={{ color:C.amber, borderColor:C.amber+"35" }}>Moderate</button>
            <button className="btn" onClick={()=>setInjuryState("sharp_pain_stop", injuryArea)} style={{ color:C.red, borderColor:C.red+"35" }}>Sharp/Stop</button>
          </div>
          <div style={{ marginTop:"0.35rem", fontSize:"0.54rem", color:"#64748b" }}>{injuryLevel.replaceAll("_"," ")} · {injuryRule.why}</div>
        </div>
      )}

      {/* Quick check-in */}
      <div className="card card-soft" style={{ marginBottom:"0.75rem" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.45rem" }}>QUICK CHECK-IN</div>
        <div style={{ display:"grid", gap:"0.35rem" }}>
          <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
            {CHECKIN_STATUS_OPTIONS.map(opt => (
              <button key={opt.key} className="btn" onClick={()=>setCheckin(c=>({ ...c, status: opt.key }))} style={{ fontSize:"0.52rem", color:checkin.status===opt.key?C.green:"#64748b", borderColor:checkin.status===opt.key?C.green+"40":"#1e293b" }}>{opt.label}</button>
            ))}
          </div>
          <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
            {CHECKIN_FEEL_OPTIONS.map(opt => (
              <button key={opt.key} className="btn" onClick={()=>setCheckin(c=>({ ...c, sessionFeel: opt.key }))} style={{ fontSize:"0.52rem", color:checkin.sessionFeel===opt.key?C.blue:"#64748b", borderColor:checkin.sessionFeel===opt.key?C.blue+"40":"#1e293b" }}>{opt.label}</button>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 120px auto", gap:"0.35rem" }}>
            <input value={checkin.note || ""} onChange={e=>setCheckin(c=>({ ...c, note: e.target.value }))} placeholder="Optional note" />
            <input type="number" step="0.1" value={checkin.bodyweight || ""} onChange={e=>setCheckin(c=>({ ...c, bodyweight: e.target.value }))} placeholder="BW" />
            <button className="btn btn-primary" disabled={checkin.status === "not_logged"} onClick={async ()=>{
              if (checkin.status === "not_logged") return;
              const parsed = parseMicroCheckin(checkin.note || "");
              const payload = parsed ? { ...checkin, ...parsed } : { ...checkin };
              await saveDailyCheckin(todayKey, payload);
              setCheckinAck("Saved.");
              if (checkin.bodyweight && !Number.isNaN(parseFloat(checkin.bodyweight))) {
                const entry = { date: todayKey, w: parseFloat(checkin.bodyweight) };
                const nextBW = [...bodyweights.filter(b => b.date !== todayKey), entry].sort((a,b) => a.date.localeCompare(b.date));
                await saveBodyweights(nextBW);
              }
            }} style={{ fontSize:"0.55rem", opacity: checkin.status === "not_logged" ? 0.4 : 1 }}>SAVE</button>
          </div>
          {checkinAck && <div style={{ fontSize:"0.54rem", color:C.green }}>{checkinAck}</div>}
        </div>
      </div>

      {/* Environment editor modal */}
      {showEnvEditor && (
        <div onClick={()=>setShowEnvEditor(false)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"flex-end", zIndex:50 }}>
          <div onClick={e=>e.stopPropagation()} className="card card-strong" style={{ width:"100%", borderRadius:"14px 14px 0 0", padding:"0.9rem 0.9rem 1rem", maxHeight:"82vh", overflowY:"auto" }}>
            <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>Environment</div>
            <div style={{ fontSize:"0.56rem", color:"#94a3b8", marginBottom:"0.45rem" }}>Adjust for real-world constraints.</div>
            <div style={{ fontSize:"0.52rem", color:"#64748b", letterSpacing:"0.08em", marginBottom:"0.25rem" }}>Equipment</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.3rem", marginBottom:"0.55rem" }}>
              {[["none","None"],["dumbbells","Dumbbells"],["basic_gym","Basic gym"],["full_gym","Full gym"]].map(([v,l]) => (
                <button key={v} className="btn" onClick={()=>setEnvDraft(prev=>({ ...prev, equipment:v }))} style={{ fontSize:"0.54rem", color:envDraft.equipment===v?C.green:"#94a3b8", borderColor:envDraft.equipment===v?C.green+"40":"#334155" }}>{l}</button>
              ))}
            </div>
            <div style={{ fontSize:"0.52rem", color:"#64748b", letterSpacing:"0.08em", marginBottom:"0.25rem" }}>Time available</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"0.3rem", marginBottom:"0.55rem" }}>
              {[["20","20 min"],["30","30 min"],["45+","45+ min"]].map(([v,l]) => (
                <button key={v} className="btn" onClick={()=>setEnvDraft(prev=>({ ...prev, time:v }))} style={{ fontSize:"0.54rem", color:envDraft.time===v?C.blue:"#94a3b8", borderColor:envDraft.time===v?C.blue+"40":"#334155" }}>{l}</button>
              ))}
            </div>
            <div style={{ fontSize:"0.52rem", color:"#64748b", letterSpacing:"0.08em", marginBottom:"0.25rem" }}>Apply scope</div>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.3rem", marginBottom:"0.65rem" }}>
              {[["today","Just today"],["week","This week"]].map(([v,l]) => (
                <button key={v} className="btn" onClick={()=>setEnvDraft(prev=>({ ...prev, scope:v }))} style={{ fontSize:"0.54rem", color:envDraft.scope===v?C.amber:"#94a3b8", borderColor:envDraft.scope===v?C.amber+"40":"#334155" }}>{l}</button>
              ))}
            </div>
            <button className="btn btn-primary" onClick={async ()=>{ await setEnvironmentMode(envDraft); setShowEnvEditor(false); }} style={{ width:"100%" }}>Apply changes</button>
          </div>
        </div>
      )}
    </div>
  );
}

function WorkoutBlock({ title, color, items }) {
  return (
    <div style={{ background:"#0f172a", borderRadius:10, padding:"1rem", border:`1px solid ${color}15` }}>
      <div style={{ fontSize:"0.78rem", color, marginBottom:"0.6rem", fontWeight:500 }}>{title}</div>
      <div style={{ display:"flex", gap:"1.25rem", flexWrap:"wrap" }}>
        {items.map(item => (
          <div key={item.label}>
            <div style={{ fontSize:"0.7rem", color:"#475569", marginBottom:"0.15rem" }}>{item.label}</div>
            <div className="mono" style={{ fontSize:"0.95rem", color, fontWeight:500 }}>{item.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PLAN TAB ──────────────────────────────────────────────────────────────────
function PlanTab({ currentWeek, logs, bodyweights, personalization, goals, setGoals, momentum, strengthLayer, weeklyReview, expectations, memoryInsights, recalibration, patterns, getZones, weekNotes, paceOverrides, setPaceOverrides, learningLayer, salvageLayer, failureMode, planComposer, rollingHorizon, horizonAnchor, weeklyCheckins, saveWeeklyCheckin, environmentSelection, setEnvironmentMode }) {
  const [openWeek, setOpenWeek] = useState(null);
  const weeklyDraft = weeklyCheckins?.[String(currentWeek)] || { energy: 3, stress: 3, confidence: 3 };
  const [miniWeekly, setMiniWeekly] = useState(weeklyDraft);
  useEffect(() => { setMiniWeekly(weeklyDraft); }, [currentWeek, weeklyCheckins?.[String(currentWeek)]?.ts]);
  const arbitration = arbitrateGoals({ goals, momentum, personalization });
  const signals = computeAdaptiveSignals({ logs, bodyweights, personalization });
  const adjustedWeekMap = {};
  (rollingHorizon || []).forEach((h) => {
    const w = h.template;
    if (h.slot >= 1) {
      const baseAdaptive = buildAdaptiveWeek(w, signals, personalization, memoryInsights);
      adjustedWeekMap[h.absoluteWeek] = baseAdaptive;
    }
  });

  return (
    <div className="fi">
      <div className="card card-strong" style={{ marginBottom:"0.85rem", borderColor:C.blue+"30" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>YOUR PROGRAM</div>
        <div style={{ fontSize:"0.6rem", color:"#e2e8f0", lineHeight:1.7 }}>Current block: <span style={{ color:C.blue }}>{planComposer.architecture.replaceAll("_"," ")}</span></div>
        <div style={{ fontSize:"0.58rem", color:"#cbd5e1", marginTop:"0.25rem", lineHeight:1.7 }}>
          {planComposer?.blockIntent?.narrative || arbitration.allocationNarrative}
        </div>
        <div style={{ fontSize:"0.58rem", color:"#94a3b8", marginTop:"0.2rem" }}>Prioritized: {planComposer?.blockIntent?.prioritized || arbitration.goalAllocation.primary}</div>
        <div style={{ fontSize:"0.58rem", color:"#94a3b8", marginTop:"0.15rem" }}>Maintained: {(planComposer?.blockIntent?.maintained || arbitration.goalAllocation.maintained || []).join(" · ")}</div>
        <div style={{ fontSize:"0.58rem", color:C.amber, marginTop:"0.15rem" }}>Minimized: {planComposer?.blockIntent?.minimized || arbitration.goalAllocation.minimized}</div>
        <div style={{ fontSize:"0.56rem", color:"#94a3b8", marginTop:"0.25rem" }}>
          Strength inclusion: {planComposer?.strengthAllocation?.sessionsPerWeek || 1} session{(planComposer?.strengthAllocation?.sessionsPerWeek || 1) > 1 ? "s" : ""}/week · {planComposer?.strengthAllocation?.targetSessionDuration || arbitration.strengthInclusion.duration}
        </div>
        {planComposer?.aestheticAllocation?.active && (
          <div style={{ fontSize:"0.56rem", color:"#94a3b8", marginTop:"0.15rem" }}>
            Aesthetic support: {planComposer.aestheticAllocation.dosage} ({planComposer.aestheticAllocation.weeklyCoreFinishers}/week target).
          </div>
        )}
        <div style={{ fontSize:"0.58rem", color:C.amber, marginTop:"0.25rem" }}>Tradeoff: {arbitration.coachTradeoffLine || arbitration.conflicts?.[0] || strengthLayer.tradeoff}</div>
        <div style={{ marginTop:"0.45rem", display:"grid", gridTemplateColumns:"1fr 1fr auto auto", gap:"0.3rem", alignItems:"center" }}>
          <select value={environmentSelection?.equipment || "dumbbells"} onChange={e=>setEnvironmentMode({ equipment:e.target.value, time: environmentSelection?.time || "30", scope: "week" })} style={{ fontSize:"0.55rem" }}>
            {[["none","No equipment"],["dumbbells","Dumbbells"],["basic_gym","Basic gym"],["full_gym","Full gym"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={environmentSelection?.time || "30"} onChange={e=>setEnvironmentMode({ equipment: environmentSelection?.equipment || "dumbbells", time:e.target.value, scope: "week" })} style={{ fontSize:"0.55rem" }}>
            {[["20","20 min"],["30","30 min"],["45+","45+ min"]].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <button className="btn" onClick={()=>setEnvironmentMode({ equipment: environmentSelection?.equipment || "dumbbells", time: environmentSelection?.time || "30", scope: "week" })} style={{ fontSize:"0.5rem" }}>This week</button>
          <button className="btn" onClick={()=>setEnvironmentMode({ equipment: environmentSelection?.equipment || "dumbbells", time: environmentSelection?.time || "30", scope: "base" })} style={{ fontSize:"0.5rem" }}>Set default</button>
        </div>
      </div>

      <div className="card card-soft" style={{ marginBottom:"0.85rem" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.45rem" }}>THIS WEEK CHECK-IN</div>
        <div style={{ display:"grid", gap:"0.35rem", fontSize:"0.57rem" }}>
          {[ ["energy", "Energy"], ["stress", "Stress"], ["confidence", "Confidence"] ].map(([k, label]) => (
            <div key={k} style={{ display:"grid", gridTemplateColumns:"120px 1fr", alignItems:"center", gap:"0.5rem" }}>
              <div style={{ color:"#94a3b8" }}>{label}</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"0.25rem" }}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} className="btn" onClick={()=>setMiniWeekly(prev=>({ ...prev, [k]: n }))} style={{ fontSize:"0.53rem", padding:"3px 0", borderColor:Number(miniWeekly[k])===n ? C.green : "#1e293b", color:Number(miniWeekly[k])===n ? C.green : "#64748b" }}>{n}</button>
                ))}
              </div>
            </div>
          ))}
          <button className="btn btn-primary" onClick={()=>saveWeeklyCheckin(currentWeek, miniWeekly)} style={{ width:"fit-content", fontSize:"0.55rem" }}>SAVE</button>
        </div>
      </div>

      <div style={{ display:"grid", gap:"0.65rem" }}>
        {(rollingHorizon || []).map((h) => {
          const w = h.template;
          const adaptive = adjustedWeekMap[h.absoluteWeek] || { adjusted: w, changed: [] };
          const isCurrent = h.absoluteWeek === currentWeek;
          const isNear = h.slot >= 2 && h.slot <= 4;
          const isFar = h.slot >= 5;
          const detailLevel = isCurrent ? "full" : isNear ? "medium" : "directional";
          const boxTone = isCurrent ? C.green : isNear ? C.blue : C.slate;
          return (
            <div key={h.absoluteWeek} className="card" style={{ borderColor:isCurrent ? C.green+"55" : "#1e293b", background:isCurrent ? "#0a160f" : "#0d1117" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:"0.5rem", marginBottom:"0.35rem", flexWrap:"wrap" }}>
                <div>
                  <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.15rem", color:boxTone, letterSpacing:"0.06em" }}>Week {h.absoluteWeek} · {w.phase}</div>
                  <div style={{ fontSize:"0.56rem", color:"#64748b" }}>{isCurrent ? "Most detailed" : isNear ? "Next up" : "Directional"}</div>
                </div>
                <button className="btn" onClick={()=>setOpenWeek(openWeek===h.absoluteWeek?null:h.absoluteWeek)} style={{ fontSize:"0.52rem" }}>{openWeek===h.absoluteWeek?"Hide":"View"}</button>
              </div>

              {detailLevel === "full" && (
                <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"0.45rem" }}>
                  {[["Mon", adaptive.adjusted.mon], ["Thu", adaptive.adjusted.thu], ["Fri", adaptive.adjusted.fri], ["Sat", adaptive.adjusted.sat]].map(([d,val]) => (
                    <div key={d} style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:8, padding:"0.45rem" }}>
                      <div style={{ fontSize:"0.5rem", color:"#64748b", letterSpacing:"0.08em" }}>{d}</div>
                      <div style={{ fontSize:"0.58rem", color:"#e2e8f0", marginTop:"0.1rem" }}>{val.t}</div>
                      <div style={{ fontSize:"0.55rem", color:boxTone }}>{val.d}</div>
                    </div>
                  ))}
                </div>
              )}

              {detailLevel === "medium" && (
                <div style={{ fontSize:"0.58rem", color:"#cbd5e1", lineHeight:1.7 }}>
                  {adaptive.adjusted.mon.t} ({adaptive.adjusted.mon.d}) · {adaptive.adjusted.thu.t} ({adaptive.adjusted.thu.d}) · Long run {adaptive.adjusted.sat.d}
                </div>
              )}

              {detailLevel === "directional" && (
                <div style={{ fontSize:"0.58rem", color:"#94a3b8", lineHeight:1.7 }}>
                  Directional focus: maintain consistency, keep one quality run, one long run, and one strength touchpoint.
                </div>
              )}

              {openWeek === h.absoluteWeek && adaptive.changed?.length > 0 && (
                <div style={{ marginTop:"0.4rem", fontSize:"0.55rem", color:"#64748b", lineHeight:1.6 }}>
                  {adaptive.changed.slice(0,3).map((line, i)=><div key={i}>• {line}</div>)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {Object.keys(paceOverrides).length > 0 && (
        <div style={{ marginTop:"0.75rem", padding:"0.6rem 0.8rem", background:"#0d1117", border:`1px solid ${C.amber}30`, borderRadius:8, fontSize:"0.58rem", color:C.amber }}>
          Paces were adjusted from recent execution. <button className="btn" onClick={() => setPaceOverrides({})} style={{ marginLeft:"0.4rem", fontSize:"0.5rem", color:C.amber, borderColor:C.amber+"30" }}>Reset</button>
        </div>
      )}
    </div>
  );
}

// ── LOG TAB (POLISHED) ──────────────────────────────────────────────────────
function LogTab({ logs, saveLogs, bodyweights, saveBodyweights, currentWeek, todayWorkout, exportData, importData }) {
  const today = new Date().toISOString().split("T")[0];
  const [quick, setQuick] = useState({ status:"", feel:"3", note:"", bodyweight:"" });
  const [detailed, setDetailed] = useState({ date:today, type: todayWorkout?.label||"", miles:"", pace:"", runTime:"", pushups:"", weight:"", notes:"", feel:"3", location:"home" });
  const [saved, setSaved] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [backupStr, setBackupStr] = useState("");
  const [backupMsg, setBackupMsg] = useState("");
  const [showBackup, setShowBackup] = useState(false);
  const [copied, setCopied] = useState(false);

  const history = Object.entries(logs || {}).sort((a,b)=>b[0].localeCompare(a[0]));
  const recent14 = history.slice(0,14);
  const completed14 = recent14.filter(([,l]) => ["completed_as_planned","completed_modified"].includes(l?.checkin?.status)).length;
  // New formula: exclude not_logged entries still within 48h grace period
  const countable14 = recent14.filter(([dateKey, l]) => {
    const eff = resolveEffectiveStatus(l?.checkin, dateKey);
    return eff !== "not_logged_grace" && eff !== "not_logged";
  }).length;
  const consistency = countable14 ? Math.round((completed14 / countable14) * 100) : 0;
  const avgFeel = recent14.length ? (recent14.reduce((s,[,l]) => s + Number(l.feel || 3), 0) / recent14.length).toFixed(1) : "-";
  const notable = history.find(([,l]) => /progress|better|strong|solid/i.test((l.notes || "").toLowerCase()));

  const saveQuick = async () => {
    if (!quick.status) return; // require explicit status selection
    const entry = {
      date: today,
      type: todayWorkout?.label || "Quick log",
      notes: quick.note || "",
      feel: quick.feel || "3",
      ts: Date.now(),
      checkin: { status: quick.status, sessionFeel: quick.feel === "5" ? "easier_than_expected" : quick.feel === "1" ? "harder_than_expected" : "about_right", note: quick.note || "", ts: Date.now() }
    };
    await saveLogs({ ...logs, [today]: entry });
    if (quick.bodyweight && !Number.isNaN(parseFloat(quick.bodyweight))) {
      const nextBW = [...bodyweights.filter(b => b.date !== today), { date: today, w: parseFloat(quick.bodyweight) }].sort((a,b)=>a.date.localeCompare(b.date));
      await saveBodyweights(nextBW);
    }
    setSaved(true);
    setSavedMsg("Saved — momentum captured.");
    setTimeout(()=>setSaved(false), 1800);
  };

  const saveDetailed = async () => {
    if (!detailed.date) return;
    await saveLogs({ ...logs, [detailed.date]: { ...detailed, ts: Date.now() } });
    setSaved(true);
    setSavedMsg("Detailed entry saved.");
    setTimeout(()=>setSaved(false), 1800);
  };

  const delLog = async (date) => {
    const next = { ...logs };
    delete next[date];
    await saveLogs(next);
  };

  return (
    <div className="fi">
      <div className="card" style={{ marginBottom:"0.8rem", borderColor:C.green+"40", background:"#0d1711" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.35rem" }}>QUICK LOG</div>
        <div style={{ fontSize:"0.58rem", color:"#94a3b8", marginBottom:"0.45rem" }}>Fast capture for today. Keep it simple.</div>
        <div style={{ display:"grid", gap:"0.4rem" }}>
          <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
            {[["completed_as_planned","Completed"],["completed_modified","Modified"],["skipped","Skipped"]].map(([k,lab]) => (
              <button key={k} className="btn" onClick={()=>setQuick(q=>({ ...q, status:k }))} style={{ fontSize:"0.52rem", color:quick.status===k?C.green:"#64748b", borderColor:quick.status===k?C.green+"35":"#1e293b", fontWeight:quick.status===k?600:400 }}>{lab}</button>
            ))}
            {!quick.status && <div style={{ fontSize:"0.54rem", color:"#475569" }}>Select one</div>}
          </div>
          <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
            {[1,2,3,4,5].map(n => (
              <button key={n} className="btn" onClick={()=>setQuick(q=>({ ...q, feel:String(n) }))} style={{ fontSize:"0.52rem", color:quick.feel===String(n)?C.blue:"#64748b", borderColor:quick.feel===String(n)?C.blue+"35":"#1e293b" }}>Feel {n}</button>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 120px auto", gap:"0.35rem" }}>
            <input value={quick.note} onChange={e=>setQuick(q=>({ ...q, note:e.target.value }))} placeholder="Optional note" />
            <input type="number" step="0.1" value={quick.bodyweight} onChange={e=>setQuick(q=>({ ...q, bodyweight:e.target.value }))} placeholder="BW" />
            <button className="btn btn-primary" onClick={saveQuick} style={{ fontSize:"0.55rem" }}>SAVE</button>
          </div>
          {saved && <div style={{ fontSize:"0.57rem", color:C.green }}>✓ {savedMsg}</div>}
        </div>
      </div>

      <details className="card" style={{ marginBottom:"0.8rem" }}>
        <summary style={{ cursor:"pointer", fontSize:"0.58rem", color:C.blue, letterSpacing:"0.08em" }}>DETAILED ENTRY (OPTIONAL)</summary>
        <div style={{ marginTop:"0.55rem", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.45rem" }}>
          <input type="date" value={detailed.date} onChange={e=>setDetailed({ ...detailed, date:e.target.value })} />
          <input value={detailed.type} onChange={e=>setDetailed({ ...detailed, type:e.target.value })} placeholder="Workout type" />
          <input type="number" step="0.1" value={detailed.miles} onChange={e=>setDetailed({ ...detailed, miles:e.target.value })} placeholder="Miles" />
          <input value={detailed.pace} onChange={e=>setDetailed({ ...detailed, pace:e.target.value })} placeholder="Pace" />
          <input value={detailed.runTime} onChange={e=>setDetailed({ ...detailed, runTime:e.target.value })} placeholder="Run time" />
          <input value={detailed.pushups} onChange={e=>setDetailed({ ...detailed, pushups:e.target.value })} placeholder="Push-ups" />
          <input value={detailed.weight} onChange={e=>setDetailed({ ...detailed, weight:e.target.value })} placeholder="Weight" />
          <select value={detailed.feel} onChange={e=>setDetailed({ ...detailed, feel:e.target.value })}>{[1,2,3,4,5].map(n=><option key={n} value={String(n)}>Feel {n}</option>)}</select>
          <input style={{ gridColumn:"1 / -1" }} value={detailed.notes} onChange={e=>setDetailed({ ...detailed, notes:e.target.value })} placeholder="Notes" />
          <button className="btn btn-primary" onClick={saveDetailed} style={{ width:"fit-content", fontSize:"0.55rem" }}>SAVE DETAILED</button>
        </div>
      </details>

      <div className="card" style={{ marginBottom:"0.8rem", borderColor:C.blue+"35" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>TREND SNAPSHOT</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.4rem" }}>
          <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:8, padding:"0.45rem" }}><div style={{ fontSize:"0.5rem", color:"#64748b" }}>Consistency (14)</div><div style={{ fontSize:"0.72rem", color:C.green }}>{consistency}%</div></div>
          <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:8, padding:"0.45rem" }}><div style={{ fontSize:"0.5rem", color:"#64748b" }}>Avg feel</div><div style={{ fontSize:"0.72rem", color:C.blue }}>{avgFeel}</div></div>
          <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:8, padding:"0.45rem" }}><div style={{ fontSize:"0.5rem", color:"#64748b" }}>Week</div><div style={{ fontSize:"0.72rem", color:C.amber }}>{currentWeek}</div></div>
        </div>
        <div style={{ marginTop:"0.35rem", fontSize:"0.56rem", color:"#94a3b8" }}>{notable ? `Notable session: ${notable[0]} · ${notable[1]?.type || "session"}` : "Keep logging to surface notable sessions."}</div>
        <div style={{ marginTop:"0.2rem", fontSize:"0.55rem", color:"#64748b" }}>What changed: plan intensity and nutrition guidance adapt directly from this logging pattern.</div>
      </div>

      <div className="card" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.45rem" }}>HISTORY</div>
        <div style={{ display:"grid", gap:"0.35rem" }}>
          {history.slice(0, 20).map(([date, log]) => {
            const effStatus = resolveEffectiveStatus(log?.checkin, date);
            const isNotLogged = effStatus === "not_logged_expired" || effStatus === "not_logged_grace";
            const isExpired = effStatus === "not_logged_expired";
            const displayNotes = (log.notes || "").replace(/Auto-assumed complete unless corrected\.?\s*/gi, "").trim();
            return (
            <div key={date} style={{ display:"grid", gridTemplateColumns:"95px 1fr auto auto", gap:"0.5rem", alignItems:"center", background: isNotLogged ? "#0a0e14" : "#0f172a", border:`1px solid ${isNotLogged ? "#151c28" : "#1e293b"}`, borderRadius:8, padding:"6px 8px", opacity: isNotLogged ? 0.7 : 1 }}>
              <div style={{ fontSize:"0.55rem", color:"#64748b" }}>{new Date(date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
              <div>
                <div style={{ fontSize:"0.58rem", color: isNotLogged ? "#64748b" : "#e2e8f0" }}>{log.type || "Session"}</div>
                {displayNotes && <div style={{ fontSize:"0.54rem", color:"#64748b" }}>{displayNotes}</div>}
              </div>
              {isExpired ? (
                <button className="btn" onClick={()=>setDetailed({ ...detailed, date, type: log.type || todayWorkout?.label || "" })} style={{ fontSize:"0.5rem", color:"#64748b", borderColor:"#1e293b", gridColumn:"span 2" }}>Add entry</button>
              ) : isNotLogged ? (
                <div style={{ fontSize:"0.55rem", color:"#475569", gridColumn:"span 2" }}></div>
              ) : (<>
                <div style={{ fontSize:"0.55rem", color:C.blue }}>Feel {log.feel || 3}</div>
                <button className="btn" onClick={()=>delLog(date)} style={{ fontSize:"0.5rem", color:C.red, borderColor:C.red+"30" }}>DEL</button>
              </>)}
            </div>
            );
          })}
        </div>
      </div>

      <BackupRestore exportData={exportData} importData={importData} logs={logs} bodyweights={bodyweights}
        backupStr={backupStr} setBackupStr={setBackupStr} backupMsg={backupMsg} setBackupMsg={setBackupMsg}
        showBackup={showBackup} setShowBackup={setShowBackup} copied={copied} setCopied={setCopied}
      />
    </div>
  );
}

function BackupRestore({ exportData, importData, logs, bodyweights, backupStr, setBackupStr, backupMsg, setBackupMsg, showBackup, setShowBackup, copied, setCopied }) {
  const logCount = Object.keys(logs).length;
  const handleCopy = () => {
    navigator.clipboard.writeText(exportData()).then(() => { setCopied(true); setBackupMsg("Copied!"); setTimeout(() => { setCopied(false); setBackupMsg(""); }, 3000); }).catch(() => { setBackupStr(exportData()); setBackupMsg("Copy the text below:"); });
  };
  const handleRestore = async () => {
    if (!backupStr.trim()) { setBackupMsg("Paste backup first."); return; }
    setBackupMsg("Restoring...");
    const ok = await importData(backupStr);
    setBackupMsg(ok ? "Restored!" : "Invalid backup.");
    if (ok) { setBackupStr(""); setTimeout(() => setBackupMsg(""), 3000); }
  };
  return (
    <details style={{ marginTop:"0.75rem" }}>
      <summary style={{ cursor:"pointer", fontSize:"0.75rem", color:"#475569", padding:"0.5rem 0" }}>
        Backup & Restore ({logCount} workouts)
      </summary>
      <div style={{ padding:"0.75rem 0", display:"grid", gap:"0.5rem" }}>
        <button className="btn" onClick={handleCopy} disabled={logCount===0} style={{ color:C.amber, borderColor:C.amber+"40" }}>
          {copied ? "Copied" : "Copy Backup"}
        </button>
        <textarea value={backupStr} onChange={e=>setBackupStr(e.target.value)} placeholder="Paste backup code to restore..." style={{ fontSize:"0.75rem", height:50, resize:"none" }} />
        <button className="btn" onClick={handleRestore} style={{ color:C.green, borderColor:C.green+"40" }}>Restore</button>
        {backupMsg && <div style={{ fontSize:"0.72rem", color:backupMsg.includes("Restored") || backupMsg.includes("Copied") ? C.green : C.amber }}>{backupMsg}</div>}
      </div>
    </details>
  );
}

// ── MINI CHART (kept) ───────────────────────────────────────────────────────
function MiniChart({ data, color, baseline }) {
  if (data.length < 2) return null;
  const min = Math.min(...data, baseline) - 2;
  const max = Math.max(...data, baseline) + 2;
  const w = 300, h = 50;
  const pts = data.map((v,i) => `${(i / (data.length-1)) * w},${h - ((v - min) / (max - min)) * h}`);
  const baselineY = h - ((baseline - min) / (max - min)) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width:"100%", height:50 }}>
      <line x1={0} y1={baselineY} x2={w} y2={baselineY} stroke="#1e293b" strokeWidth={1} strokeDasharray="4,4" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2} />
      {data.map((v,i) => <circle key={i} cx={(i/(data.length-1))*w} cy={h - ((v-min)/(max-min))*h} r={3} fill={color} />)}
    </svg>
  );
}

// ── NUTRITION TAB (REDESIGNED) ──────────────────────────────────────────────
function NutritionTab({ todayWorkout, personalization, goals, momentum, bodyweights, learningLayer, nutritionLayer, realWorldNutrition, nutritionFavorites, saveNutritionFavorites, nutritionFeedback, saveNutritionFeedback }) {
  const localFoodContext = personalization?.localFoodContext || { city: "Chicago", groceryOptions: ["Trader Joe's"] };
  const [store, setStore] = useState(localFoodContext.groceryOptions?.[0] || "Trader Joe's");
  const favorites = nutritionFavorites || { restaurants: [], groceries: [], safeMeals: [], travelMeals: [], defaultMeals: [] };
  const [nutritionCheck, setNutritionCheck] = useState({ status: "on_track", issue: "", note: "" });
  const [lastKey, setLastKey] = useState("");
  const goalContext = getGoalContext(goals) || { primary: null, secondary: [] };
  const dayType = nutritionLayer?.dayType || todayWorkout?.nutri || "easyRun";
  const city = localFoodContext.city || "Chicago";
  const nearby = (getPlaceRecommendations({ city, dayType, favorites, mode: "nearby", query: "" }) || [])
    .map((x, i) => ({ id: x?.id || `nearby_${i}_${x?.name || "option"}`, name: x?.name || "Nearby option", meal: x?.meal || "Protein + carbs + produce" }))
    .filter(x => x.id !== lastKey)
    .slice(0, 2);
  const basket = buildGroceryBasket({ store, city, days: 3, dayType });
  const fastest = nearby[0] || { name: "Saved default", meal: "Protein shake + fruit + sandwich", tag: "fallback" };
  const travelBreakfast = ["Starbucks: egg bites + oatmeal + banana", "Hotel breakfast: eggs + Greek yogurt + fruit", "Airport: wrap + extra protein + water"];
  const bodyCompActive = goals?.some(g => g.active && g.category === "body_comp");
  const strengthActive = goals?.some(g => g.active && g.category === "strength");
  const runningActive = goals?.some(g => g.active && g.category === "running");
  const hardDay = ["hardRun", "longRun"].includes(dayType) || ["hard-run", "long-run"].includes(todayWorkout?.type);
  const recoveryDay = dayType === "rest" || todayWorkout?.type === "rest";
  const strengthDay = dayType === "strength" || ["run+strength", "strength+prehab"].includes(todayWorkout?.type);
  const simplifiedWeek = ["drifting","falling off"].includes(momentum?.momentumState) || learningLayer?.adjustmentBias === "simplify";
  const nutritionUnavailable = !nutritionLayer || !realWorldNutrition;

  const proteinLevel = strengthActive || bodyCompActive ? "high" : "moderate";
  const carbLevel = hardDay ? "high" : recoveryDay ? "low" : "moderate";
  const calorieLevel = hardDay ? "higher" : recoveryDay && bodyCompActive ? "lower" : "normal";
  const topGuidance = nutritionUnavailable
    ? "Keep it simple today. Prioritize protein and eat normally."
    : simplifiedWeek
    ? "Keep this very simple today. Repeat easy meals and stay consistent."
    : hardDay
    ? "Eat a little more today. Fuel the run."
    : recoveryDay && bodyCompActive
    ? "Keep this day tight. High protein, avoid extra snacking."
    : "Eat normally today. Prioritize protein.";
  const secondGuidance = simplifiedWeek
    ? "Use 2–3 default meals so nutrition is automatic."
    : hardDay
    ? "Center meals around easy carbs before and after training."
    : strengthDay
    ? "Keep protein steady across the day to support recovery."
    : "Keep meals simple and repeatable so consistency stays easy.";
  const thirdGuidance = bodyCompActive
    ? "Use one planned snack so cravings don’t run the day."
    : runningActive
    ? "Hydrate early and add carbs around harder sessions."
    : "Pick meals you can repeat on busy days.";

  const breakfast = realWorldNutrition?.mealStructure?.breakfast || "Greek yogurt + fruit + granola";
  const lunch = realWorldNutrition?.mealStructure?.lunch || "Protein bowl with rice/potatoes + veggies";
  const dinner = realWorldNutrition?.mealStructure?.dinner || "Lean protein + carb + vegetable";
  const snack = hardDay ? "Banana + protein shake" : "Apple + string cheese";

  const todayKey = new Date().toISOString().split("T")[0];
  const feedbackToday = nutritionFeedback?.[todayKey];
  useEffect(() => { if (feedbackToday) setNutritionCheck(feedbackToday); }, [feedbackToday?.ts]);

  return (
    <div className="fi">
      <div className="card card-strong" style={{ marginBottom:"0.8rem", borderColor:C.green+"28" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.45rem" }}>TODAY'S DIRECTION</div>
        <div style={{ fontSize:"0.66rem", color:"#e2e8f0", lineHeight:1.65 }}>{topGuidance}</div>
        <div style={{ fontSize:"0.58rem", color:"#cbd5e1", lineHeight:1.65, marginTop:"0.2rem" }}>{secondGuidance}</div>
        <div style={{ fontSize:"0.56rem", color:"#94a3b8", lineHeight:1.65, marginTop:"0.2rem" }}>{thirdGuidance}</div>
      </div>

      <div className="card card-soft" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.45rem" }}>SIMPLE TARGETS</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.4rem" }}>
          {[["Protein", proteinLevel, C.red], ["Carbs", carbLevel, C.green], ["Calories", calorieLevel, C.amber]].map(([label, value, col]) => (
            <div key={label} style={{ background:"#0f172a", border:`1px solid ${col}30`, borderRadius:8, padding:"0.55rem 0.45rem", textAlign:"center" }}>
              <div style={{ fontSize:"0.53rem", color:"#64748b", letterSpacing:"0.06em" }}>{label}</div>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", color:col, fontSize:"1.05rem", marginTop:"0.1rem" }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:"0.45rem", fontSize:"0.56rem", color:"#94a3b8", lineHeight:1.65 }}>
          Focus today: {simplifiedWeek ? "simplified meals and consistency" : hardDay ? "hard training fuel" : recoveryDay ? "recovery and appetite control" : strengthDay ? "protein-led recovery" : "steady intake and consistency"}.
        </div>
        <div style={{ marginTop:"0.15rem", fontSize:"0.55rem", color:"#64748b" }}>
          Goals covered: {goalContext.primary?.name || "general fitness"}{goalContext.secondary?.length ? ` + ${(goalContext.secondary || []).map(g=>g?.name).filter(Boolean).join(" · ")}` : ""}.
        </div>
      </div>

      <div className="card card-soft" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.amber, marginBottom:"0.5rem" }}>WHAT THIS LOOKS LIKE</div>
        <div style={{ fontSize:"0.58rem", color:"#cbd5e1", lineHeight:1.7 }}>
          <div><span style={{ color:C.amber }}>Breakfast:</span> {breakfast}</div>
          <div><span style={{ color:C.amber }}>Lunch:</span> {lunch}</div>
          <div><span style={{ color:C.amber }}>Dinner:</span> {dinner}</div>
          <div><span style={{ color:C.amber }}>Optional snack:</span> {snack}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.55rem" }}>REAL-LIFE BACKUPS</div>
        <div style={{ display:"grid", gap:"0.35rem", marginBottom:"0.45rem" }}>
          {nearby.map(p => (
            <div key={p.id} style={{ background:"#0f172a", borderRadius:7, padding:"7px 9px", display:"flex", justifyContent:"space-between", gap:"0.6rem" }}>
              <div>
                <div style={{ fontSize:"0.63rem", color:"#e2e8f0" }}>{p.name || "Nearby option"}</div>
                <div style={{ fontSize:"0.58rem", color:"#94a3b8", marginTop:2 }}>{p.meal || "Protein + carbs + produce"}</div>
              </div>
              <button className="btn" onClick={()=>{ setLastKey(p.id || `${Date.now()}`); saveNutritionFavorites({ ...favorites, restaurants: [{ name: p.name || "Nearby option", meal: p.meal || "Protein + carbs + produce" }, ...favorites.restaurants].slice(0, 8) }); }} style={{ color:C.green, borderColor:C.green+"30", fontSize:"0.52rem" }}>
                SAVE
              </button>
            </div>
          ))}
        </div>
        <div style={{ fontSize:"0.56rem", color:"#94a3b8", lineHeight:1.65 }}>
          <div><span style={{ color:C.blue }}>Fastest good choice:</span> {fastest.name} — {fastest.meal}</div>
          <div><span style={{ color:C.blue }}>Travel backup:</span> {travelBreakfast[0]}</div>
          <div><span style={{ color:C.blue }}>Grocery reset:</span> {basket.items?.[0] || "pre-cooked protein + fruit + easy carbs"}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.purple, marginBottom:"0.5rem" }}>QUICK GROCERY RESET</div>
        <select value={store} onChange={e=>setStore(e.target.value)} style={{ marginBottom:"0.35rem" }}>
          {[...new Set([...(localFoodContext.groceryOptions || []), ...Object.keys(LOCAL_PLACE_TEMPLATES[city]?.groceries || {})])].map(s => <option key={s}>{s}</option>)}
        </select>
        <div style={{ fontSize:"0.56rem", color:"#94a3b8", marginBottom:"0.3rem" }}>{basket.title || "Simple 3-day list"}</div>
        {(basket.items || []).slice(0, 5).map((it,i)=><div key={i} style={{ fontSize:"0.56rem", color:"#64748b", lineHeight:1.6 }}>• {it}</div>)}
      </div>

      <div className="card">
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.5rem" }}>NUTRITION REFLECTION</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.3rem", marginBottom:"0.35rem" }}>
          {[["on_track","on track"],["decent","decent"],["off_track","off track"]].map(([k,lab]) => (
            <button key={k} className="btn" onClick={()=>setNutritionCheck(prev=>({ ...prev, status:k }))}
              style={{ fontSize:"0.72rem", borderColor:nutritionCheck.status===k?C.blue:"#1e293b", color:nutritionCheck.status===k?C.blue:"#64748b", background:nutritionCheck.status===k?`${C.blue}12`:"transparent" }}>{lab}</button>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"0.35rem" }}>
          <input value={nutritionCheck.note || ""} onChange={e=>setNutritionCheck(prev=>({ ...prev, note:e.target.value }))} placeholder="Quick note (optional)" />
          <button className="btn btn-primary" onClick={()=>saveNutritionFeedback(todayKey, nutritionCheck)} style={{ fontSize:"0.55rem" }}>SAVE</button>
        </div>
      </div>
    </div>
  );
}

// ── COACH TAB (REDESIGNED) ──────────────────────────────────────────────────
function CoachTab({ logs, currentWeek, todayWorkout, bodyweights, personalization, momentum, arbitration, expectations, memoryInsights, recalibration, strengthLayer, patterns, proactiveTriggers, onApplyTrigger, learningLayer, salvageLayer, validationLayer, optimizationLayer, failureMode, planComposer, nutritionLayer, realWorldNutrition, nutritionFeedback, setPersonalization, coachActions, setCoachActions, coachPlanAdjustments, setCoachPlanAdjustments, weekNotes, setWeekNotes, planAlerts, setPlanAlerts, onPersist }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [pendingActions, setPendingActions] = useState([]);
  const [memoryDraft, setMemoryDraft] = useState({
    failurePatterns: (personalization.coachMemory.failurePatterns || []).join(", "),
    commonBarriers: (personalization.coachMemory.commonBarriers || []).join(", "),
    simplicityVsVariety: personalization.coachMemory.simplicityVsVariety || "",
    preferredFoodPatterns: (personalization.coachMemory.preferredFoodPatterns || []).join(", "),
  });
  const [apiKey, setApiKey] = useState(typeof window !== "undefined" ? (localStorage.getItem("coach_api_key") || "") : "");
  const [coachMode, setCoachMode] = useState("auto");
  const [showSettings, setShowSettings] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => {
    setMessages([{
      role:"assistant",
      packet: deterministicCoachPacket({ input: "status", todayWorkout, currentWeek, logs, bodyweights, personalization, learning: learningLayer, salvage: salvageLayer, planComposer, optimizationLayer, failureMode, momentum, strengthLayer, nutritionLayer, arbitration, expectations, memoryInsights, realWorldNutrition, recalibration }),
      source: "deterministic"
    }]);
  }, []);

  const applyCoachAction = (action, runtime) => applyCoachActionMutation({ action, runtime, currentWeek, todayWorkout, mergePersonalization, buildInjuryRuleResult });

  const commitAction = async (action) => {
    const runtime = { adjustments: coachPlanAdjustments, weekNotes, planAlerts, personalization };
    const mutation = applyCoachAction(action, runtime);
    const nextActions = [{ ...action, id:`coach_act_${Date.now()}`, ts: Date.now(), source: "coach_confirmed", reason: action.reason || action.rationale || action.payload?.reason || "coach-confirmed" }, ...coachActions].slice(0, 60);
    setCoachActions(nextActions);
    setCoachPlanAdjustments(mutation.adjustments);
    setWeekNotes(mutation.weekNotes);
    setPlanAlerts(mutation.planAlerts);
    setPersonalization(mutation.personalization);
    await onPersist(mutation.personalization, nextActions, mutation.adjustments, mutation.weekNotes, mutation.planAlerts);
  };

  const getCoachResponse = async (userMsg) => {
    const deterministic = deterministicCoachPacket({ input: userMsg, todayWorkout, currentWeek, logs, bodyweights, personalization, learning: learningLayer, salvage: salvageLayer, planComposer, optimizationLayer, failureMode, momentum, strengthLayer, nutritionLayer, arbitration, expectations, memoryInsights, realWorldNutrition, recalibration });
    if (coachMode === "deterministic" || !apiKey) return { ...deterministic, source: "deterministic" };
    try {
      const res = await safeFetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest", max_tokens: 700,
          system: `Return strict JSON with keys notices[], recommendations[], effects[], actions[]. Actions must use these types only: ${Object.values(COACH_TOOL_ACTIONS).join(", ")}.`,
          messages: [{ role: "user", content: `Week ${currentWeek}, today ${todayWorkout?.label}. User said: "${userMsg}".` }]
        })
      });
      if (!res.ok) throw new Error("API unavailable");
      const data = await res.json();
      const text = data?.content?.[0]?.text || "{}";
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      return { ...deterministic, ...parsed, source: "llm" };
    } catch {
      return { ...deterministic, source: "deterministic-fallback" };
    }
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, pendingActions]);

  const send = async (preset) => {
    const userMsg = (preset || input).trim();
    if (!userMsg || loading) return;
    setInput("");
    setLoading(true);
    const packet = await getCoachResponse(userMsg);
    setMessages(m => [...m, { role:"user", text:userMsg }, { role:"assistant", packet, source: packet.source }]);
    setPendingActions(packet.actions || []);
    setLoading(false);
  };

  const quickPrompts = [
    "My Achilles feels tight", "I missed yesterday", "I'm traveling today",
    "I feel amazing this week", "I slept badly", "I want to push harder",
    "I'm not recovering well", "Simplify meals this week",
  ];

  const todayKey = new Date().toISOString().split("T")[0];
  const env = resolveEnvironmentSelection({ personalization, todayKey, currentWeek });
  const dayTypeMap = { "long-run":"long", "hard-run":"tempo", "easy-run":"easy", "strength+prehab":"strength", rest:"recovery" };
  const dayType = dayTypeMap[todayWorkout?.type] || "hybrid";
  const weekState = failureMode?.mode === "chaotic" ? "chaotic" : momentum?.fatigueNotes >= 2 ? "fatigued" : "normal";
  const adherenceTrend = momentum?.completionRate >= 0.72 ? "stable" : momentum?.completionRate >= 0.5 ? "mixed" : "slipping";
  const fatigueSignal = (personalization?.trainingState?.fatigueScore || 1) >= 4 || momentum?.fatigueNotes >= 2;
  const injuryFlag = personalization?.injuryPainState?.level || "none";
  const goalPriority = arbitration?.priorityStack?.primary || "Consistency";
  const recentLogCount = Object.keys(logs || {}).slice(-7).length;

  const coachDecisionMode = (() => {
    if (injuryFlag !== "none" || fatigueSignal) return "Protect";
    if (weekState === "chaotic" || env.time === "20" || adherenceTrend === "slipping") return "Simplify";
    if (momentum?.logGapDays >= 4 || recentLogCount <= 2) return "Rebuild";
    if ((momentum?.score || 0) >= 74 && weekState === "normal" && env.time !== "20") return "Push";
    return "Hold";
  })();

  const coachDecision = (() => {
    const dayLabel = dayType === "tempo" ? "quality run" : dayType === "long" ? "long-run" : dayType === "easy" ? "easy run" : dayType === "strength" ? "strength" : dayType === "recovery" ? "recovery" : "hybrid";
    if (coachDecisionMode === "Protect") return {
      stance: `Do the condensed ${dayLabel} version today and keep intensity controlled.`,
      why: `Recovery signals are elevated, so we protect consistency while keeping ${goalPriority} on track.`,
      watch: "I am watching pain and session feel after this workout.",
      options: [
        { label: "Do condensed version", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 10, reason: "protect_mode" } }, primary: true },
        { label: "Move to tomorrow", action: { type: COACH_TOOL_ACTIONS.MOVE_LONG_RUN, payload: { days: 1, reason: "protect_shift" } } }
      ]
    };
    if (coachDecisionMode === "Simplify") return {
      stance: `Keep this simple: complete the short ${dayLabel} version.`,
      why: `Time and adherence say simplify now, then rebuild consistency.`,
      watch: "I am watching completion rate over the next 3 days.",
      options: [
        { label: "Do condensed version", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 12, reason: "simplify_mode" } }, primary: true },
        { label: "Simplify week", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 15, reason: "simplify_week" } } }
      ]
    };
    if (coachDecisionMode === "Rebuild") return {
      stance: `Take the minimum viable ${dayLabel} session and rebuild rhythm first.`,
      why: `Recent execution dipped, so we rebuild frequency before adding load.`,
      watch: "I am watching whether you can stack 2-3 clean sessions.",
      options: [
        { label: "Do condensed version", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 15, reason: "rebuild_mode" } }, primary: true },
        { label: "Simplify week", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 18, reason: "rebuild_week" } } }
      ]
    };
    if (coachDecisionMode === "Push") return {
      stance: `Keep the full ${dayLabel} session and add one small progression.`,
      why: `Stability is strong enough to push while still protecting recovery.`,
      watch: "I am watching session quality and next-day fatigue.",
      options: [
        { label: "Keep full session", action: null, primary: true },
        { label: "Push slightly", action: { type: COACH_TOOL_ACTIONS.PROGRESS_STRENGTH_EMPHASIS, payload: { weeks: 1, reason: "push_mode" } } }
      ]
    };
    return {
      stance: `Keep the full ${dayLabel} session as written.`,
      why: `Current signals support staying steady and executing cleanly.`,
      watch: "I am watching consistency and workout quality this week.",
      options: [
        { label: "Keep full session", action: null, primary: true },
        { label: "Do condensed version", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 8, reason: "hold_condense" } } }
      ]
    };
  })();

  const applyDecisionOption = async (opt) => {
    if (!opt?.action) {
      setMessages(m => [...m, { role:"assistant", packet:{ notices:["Staying with the full plan."], recommendations:["Execute cleanly and log it."], effects:[`Mode: ${coachMode}.`], actions:[] }, source:"deterministic" }]);
      setPendingActions([]);
      return;
    }
    await commitAction({ ...opt.action, reason: opt.action.payload?.reason || "coach_decision" });
    setPendingActions([]);
    setMessages(m => [...m, { role:"assistant", packet:{ notices:["Decision applied."], recommendations:["Execute this version today."], effects:[`Mode: ${coachMode}.`], actions:[] }, source:"deterministic" }]);
  };

  return (
    <div className="fi" style={{ display:"grid", gap:"0.75rem" }}>
      <div className="card card-strong" style={{ borderColor:C.blue+"38" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>WHAT I WANT YOU TO DO</div>
        <div style={{ fontSize:"0.72rem", color:"#f1f5f9", lineHeight:1.55 }}>{coachDecision.stance}</div>
      </div>

      <div className="card card-soft">
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.3rem" }}>WHY</div>
        <div style={{ fontSize:"0.6rem", color:"#d1d9e6", lineHeight:1.65 }}>
          {coachDecision.why}
        </div>
      </div>

      <div className="card">
        <div className="sect-title" style={{ color:C.amber, marginBottom:"0.35rem" }}>CHOOSE</div>
        <div style={{ display:"flex", gap:"0.45rem", flexWrap:"wrap" }}>
          {coachDecision.options.slice(0, 2).map((opt, i) => (
            <button key={`${opt.label}_${i}`} className={`btn ${opt.primary ? "btn-primary" : ""}`} onClick={()=>applyDecisionOption(opt)} style={{ fontSize:"0.56rem" }}>
              {opt.label}
            </button>
          ))}
        </div>
      </div>

      <div className="card card-soft">
        <div className="sect-title" style={{ color:"#94a3b8", marginBottom:"0.2rem" }}>WHAT I AM WATCHING</div>
        <div style={{ fontSize:"0.58rem", color:"#a7b4c6" }}>{coachDecision.watch}</div>
      </div>

      <div style={{ fontSize:"0.54rem", color:"#94a3b8", letterSpacing:"0.06em" }}>ASK FOR A QUICK CALL</div>
      <div style={{ display:"flex", gap:"0.35rem", overflowX:"auto", paddingBottom:"0.2rem" }}>
        {quickPrompts.slice(0, 6).map(q => (
          <button key={q} className="btn" onClick={()=>send(q)} style={{ whiteSpace:"nowrap", fontSize:"0.55rem" }}>{q}</button>
        ))}
      </div>

      <div style={{ display:"flex", gap:"0.5rem" }}>
        <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask coach for a decision" style={{ flex:1 }} disabled={loading} />
        <button className="btn btn-primary" onClick={()=>send()} disabled={loading} style={{ opacity:loading?0.5:1 }}>Send</button>
      </div>

      {/* ── SETTINGS (collapsed) ── */}
      <details style={{ marginTop:"0.75rem" }}>
        <summary style={{ cursor:"pointer", fontSize:"0.72rem", color:"#475569", padding:"0.5rem 0" }}>Coach settings & memory</summary>
        <div style={{ padding:"0.75rem 0", display:"grid", gap:"0.4rem" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.35rem" }}>
            <select value={coachMode} onChange={e=>setCoachMode(e.target.value)} style={{ fontSize:"0.78rem" }}>
              <option value="auto">Auto mode</option><option value="deterministic">Deterministic</option>
            </select>
            <input value={apiKey} onChange={e=>{ setApiKey(e.target.value); if (typeof window !== "undefined") localStorage.setItem("coach_api_key", e.target.value); }} placeholder="Anthropic key (optional)" style={{ fontSize:"0.75rem" }} />
          </div>
          <input value={memoryDraft.failurePatterns} onChange={e=>setMemoryDraft({ ...memoryDraft, failurePatterns:e.target.value })} placeholder="Failure patterns" style={{ fontSize:"0.78rem" }} />
          <input value={memoryDraft.commonBarriers} onChange={e=>setMemoryDraft({ ...memoryDraft, commonBarriers:e.target.value })} placeholder="Common barriers" style={{ fontSize:"0.78rem" }} />
          <input value={memoryDraft.preferredFoodPatterns} onChange={e=>setMemoryDraft({ ...memoryDraft, preferredFoodPatterns:e.target.value })} placeholder="Food patterns" style={{ fontSize:"0.78rem" }} />
          <button className="btn" onClick={async ()=>{
            const updated = mergePersonalization(personalization, { coachMemory: { ...personalization.coachMemory, failurePatterns: memoryDraft.failurePatterns.split(",").map(x=>x.trim()).filter(Boolean), commonBarriers: memoryDraft.commonBarriers.split(",").map(x=>x.trim()).filter(Boolean), preferredFoodPatterns: memoryDraft.preferredFoodPatterns.split(",").map(x=>x.trim()).filter(Boolean), simplicityVsVariety: memoryDraft.simplicityVsVariety } });
            setPersonalization(updated);
            await onPersist(updated, coachActions, coachPlanAdjustments, weekNotes, planAlerts);
          }} style={{ color:C.green, borderColor:C.green+"35" }}>Save memory</button>
        </div>
      </details>

      <style>{`@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
    </div>
  );
}

function CoachSection({ title, items, color }) {
  return (
    <div style={{ background:"#0f172a", borderRadius:8, padding:"8px 12px", border:`1px solid ${color}20` }}>
      <div style={{ fontSize:"0.7rem", color, fontWeight:600, marginBottom:"0.25rem" }}>{title}</div>
      {(items?.length ? items : ["No issues detected."]).map((item, idx) => (
        <div key={idx} style={{ fontSize:"0.78rem", color:"#cbd5e1", lineHeight:1.6 }}>• {item}</div>
      ))}
    </div>
  );
}
