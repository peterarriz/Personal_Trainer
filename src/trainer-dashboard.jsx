import { useState, useEffect, useRef } from "react";

// ── PROFILE ──────────────────────────────────────────────────────────────────
const PROFILE = {
  name: "Athlete", height: "6'1\"", weight: 190, age: 30,
  goalRace: "July 19, 2026", goalTime: "1:45:00", goalPace: "8:01/mi",
  startDate: new Date("2026-03-23"),
  tdee: 3100,
  pushUpMax: 33,
};

// ── NUTRITION TARGETS ─────────────────────────────────────────────────────────
const NUTRITION = {
  longRun:   { cal: 2900, p: 190, c: 320, f: 70, label: "Long Run Day" },
  hardRun:   { cal: 2700, p: 190, c: 280, f: 68, label: "Hard Run Day" },
  easyRun:   { cal: 2600, p: 190, c: 255, f: 68, label: "Easy Run Day" },
  otf:       { cal: 2650, p: 190, c: 265, f: 68, label: "OTF Day" },
  strength:  { cal: 2500, p: 190, c: 220, f: 72, label: "Strength Only Day" },
  rest:      { cal: 2350, p: 185, c: 195, f: 72, label: "Rest Day" },
  travelRun: { cal: 2650, p: 185, c: 270, f: 68, label: "Travel + Run Day" },
  travelRest:{ cal: 2300, p: 180, c: 190, f: 70, label: "Travel Rest Day" },
};

const MEAL_PLANS = {
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
  return Math.min(Math.max(1, Math.ceil(diff)), 18);
};

const getDayOfWeek = () => {
  return new Date().getDay(); // 0=Sun,1=Mon,...,6=Sat
};

const getTodayWorkout = (weekNum, dayNum) => {
  const week = WEEKS[weekNum - 1];
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

const COACH_TOOL_ACTIONS = {
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
const AFFECTED_AREAS = ["Achilles", "calf", "knee", "shin", "hip", "general fatigue"];
const inferPainLevel = (msg) => {
  const x = msg.toLowerCase();
  if (/sharp|stabbing|stop/.test(x)) return "sharp_pain_stop";
  if (/moderate|painful|hurts/.test(x)) return "moderate_pain";
  if (/tight|mild|stiff/.test(x)) return "mild_tightness";
  return "none";
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

const buildAdaptiveWeek = (week, signals, personalization) => {
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
  return { adjusted, changed };
};

const DEFAULT_MULTI_GOALS = [
  { id: "g_run_half", name: "Half marathon 1:45", category: "running", priority: 1, targetDate: "2026-07-19", measurableTarget: "1:45:00", active: true },
  { id: "g_abs", name: "Visible abs by summer", category: "body_comp", priority: 2, targetDate: "2026-06-15", measurableTarget: "Waist down + body fat trend", active: true },
  { id: "g_bench", name: "Bench 225 lbs", category: "strength", priority: 3, targetDate: "2026-09-01", measurableTarget: "225 x 1", active: true },
  { id: "g_injury", name: "Avoid injury flare-ups", category: "injury_prevention", priority: 1, targetDate: "", measurableTarget: "No flare-up weeks", active: true },
];

const getGoalContext = (goals) => {
  const active = (goals || []).filter(g => g.active).sort((a,b) => a.priority - b.priority);
  const primary = active[0] || null;
  const secondary = active.slice(1,3);
  const maintenance = active.slice(3);
  const tradeoffs = [];
  if (primary?.category === "running" && secondary.find(g => g.category === "strength")) tradeoffs.push("Strength volume stays focused (2 sessions) to protect run quality.");
  if (secondary.find(g => g.category === "body_comp")) tradeoffs.push("Body comp progress uses nutrition precision, not extra fatigue-heavy cardio.");
  if (active.find(g => g.category === "injury_prevention")) tradeoffs.push("Injury prevention can downgrade intensity before it removes consistency.");
  return { primary, secondary, maintenance, tradeoffs };
};

const applyGoalNutritionTargets = (targets, dayType, goalContext) => {
  if (!goalContext?.primary) return targets;
  let t = { ...targets };
  if (goalContext.secondary.find(g => g.category === "body_comp") && !["longRun","hardRun","travelRun"].includes(dayType)) {
    t.cal = Math.max(2100, t.cal - 120);
    t.c = Math.max(140, t.c - 20);
  }
  if (goalContext.secondary.find(g => g.category === "strength")) {
    t.p = Math.max(t.p, 200);
  }
  return t;
};

const mapWorkoutToNutritionDayType = (todayWorkout, environmentMode) => {
  const wt = (todayWorkout?.type || "").toLowerCase();
  if (environmentMode === "travel" || environmentMode === "no equipment") return wt === "rest" ? "travelRest" : "travelRun";
  if (wt === "long-run" || todayWorkout?.run?.t === "Long") return "longRun";
  if (wt === "hard-run" || ["Tempo", "Intervals"].includes(todayWorkout?.run?.t)) return "hardRun";
  if (wt === "run+strength") return "otf";
  if (wt === "strength+prehab" || wt.includes("strength")) return "strength";
  if (wt === "rest") return "rest";
  return "easyRun";
};

const deriveAdaptiveNutrition = ({ todayWorkout, goals, momentum, personalization, bodyweights, learningLayer, nutritionFeedback, coachPlanAdjustments, salvageLayer }) => {
  const goalContext = getGoalContext(goals);
  const environmentMode = personalization.travelState.environmentMode || personalization.travelState.access || "home";
  const dayType = mapWorkoutToNutritionDayType(todayWorkout, environmentMode);
  let target = applyGoalNutritionTargets(NUTRITION[dayType] || NUTRITION.easyRun, dayType, goalContext);
  const feedback = Object.values(nutritionFeedback || {}).slice(-10);
  const offTrackCount = feedback.filter(f => f.status === "off_track").length;
  const hungerHits = feedback.filter(f => f.issue === "hunger").length;
  const convenienceHits = feedback.filter(f => f.issue === "convenience").length;
  const trend14 = (bodyweights || []).slice(-14);
  const bwDelta14 = trend14.length >= 2 ? trend14[trend14.length - 1].w - trend14[0].w : 0;
  const fatLossActive = [goalContext.primary, ...(goalContext.secondary || [])].filter(Boolean).some(g => g.category === "body_comp");
  const strengthActive = [goalContext.primary, ...(goalContext.secondary || [])].filter(Boolean).some(g => g.category === "strength");
  const endurancePrimary = goalContext.primary?.category === "running";

  let deficitMode = "none";
  if (fatLossActive && !["longRun","hardRun"].includes(dayType)) deficitMode = "moderate";
  if (["drifting","falling off"].includes(momentum.momentumState) || learningLayer?.adjustmentBias === "simplify") deficitMode = "minimal";
  if (bwDelta14 <= -2.2) deficitMode = "none";
  if (hungerHits >= 2) deficitMode = "minimal";

  if (deficitMode === "moderate") target = { ...target, cal: Math.max(2100, target.cal - 170), c: Math.max(150, target.c - 20) };
  if (deficitMode === "minimal") target = { ...target, cal: Math.max(2200, target.cal - 70) };
  if (bwDelta14 <= -2.2) target = { ...target, cal: target.cal + 140, c: target.c + 20 };
  const extra = coachPlanAdjustments?.extra || {};
  if (extra.nutritionCalorieDelta) target = { ...target, cal: target.cal + extra.nutritionCalorieDelta };
  if (extra.nutritionDeficitReduction) target = { ...target, cal: target.cal + extra.nutritionDeficitReduction };
  if (extra.carbShift?.pre || extra.carbShift?.post) target = { ...target, c: target.c + Math.round(((extra.carbShift.pre || 0) + (extra.carbShift.post || 0)) * 0.4) };
  if (strengthActive && environmentMode === "no equipment") target = { ...target, p: Math.max(target.p, 195), c: Math.max(target.c, 210) };
  if (endurancePrimary && ["longRun","hardRun","travelRun"].includes(dayType)) target = { ...target, c: target.c + 15 };
  if (hungerHits >= 2) target = { ...target, f: Math.max(target.f, 72) };

  const uncertaintyHigh = offTrackCount >= 3 || ["drifting","falling off"].includes(momentum.momentumState) || convenienceHits >= 2;
  const calRange = uncertaintyHigh ? `${Math.max(2000, target.cal - 120)}-${target.cal + 120}` : `${target.cal - 60}-${target.cal + 60}`;
  const proteinTarget = `${target.p}-${target.p + 10}g`;
  const carbGuidance = ["longRun","hardRun","travelRun"].includes(dayType)
    ? "High carbs around key run (pre + post)."
    : dayType === "strength"
    ? "Moderate carbs around lifting window."
    : "Balanced carbs; emphasize produce + easy starches.";
  const fatGuidance = `Fat floor ${Math.max(60, target.f - 6)}g; keep fats lower pre-run and distribute later meals.`;
  const hydration = environmentMode === "travel" ? "Hydration target: 100-120 oz + electrolytes while traveling." : "Hydration target: 90-110 oz + electrolytes on training days.";
  const fueling = ["longRun","hardRun","travelRun"].includes(dayType)
    ? "Pre: 30-60g carbs 60-90 min before. Post: 30-40g protein + 60-90g carbs."
    : dayType === "strength" || dayType === "otf"
    ? "Pre: light carb + protein snack. Post: 30-40g protein + carb meal."
    : "Prioritize protein at each meal; no special workout fueling needed.";
  const mealStructure = salvageLayer?.active || extra.mealSimplicityMode || extra.defaultMealStructureDays > 0 || environmentMode === "travel" || convenienceHits >= 2
    ? ["3 simple meals + 1 protein snack", "Use one saved safe default meal", "Anchor breakfast + protein-forward dinner"]
    : dayType === "longRun"
    ? ["Lighter pre-run meal", "Bigger post-run lunch", "Higher-carb dinner"]
    : dayType === "rest"
    ? ["3 meals + 1 protein snack", "Lower-energy-dense carbs", "Veg + protein at lunch/dinner"]
    : ["3 meals + 1 protein snack", "Carb focus around training window", "Protein at every meal"];

  const tradeoff = fatLossActive && endurancePrimary
    ? "Tradeoff: moderate deficit while protecting run fueling quality."
    : fatLossActive && strengthActive
    ? "Tradeoff: fat loss pace is moderated to keep strength output stable."
    : learningLayer?.adjustmentBias === "simplify"
    ? "Tradeoff: simplicity beats precision this week to protect adherence."
    : "Tradeoff: balanced fueling supports mixed-goal progress.";

  return {
    dayType,
    targets: target,
    calRange,
    proteinTarget,
    carbGuidance,
    fatGuidance,
    hydration,
    fueling,
    mealStructure,
    tradeoff,
    why: `Day type ${dayType}, momentum ${momentum.momentumState}, environment ${environmentMode}, BW trend ${bwDelta14.toFixed(1)} lbs/14d.`,
  };
};

const arbitrateGoals = ({ goals, momentum, personalization }) => {
  const active = (goals || []).filter(g => g.active).sort((a,b)=>a.priority-b.priority);
  const primary = active[0] || null;
  const secondary = active.slice(1,3);
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
  const explanation = `Primary: ${priorityStack.primary}. We push ${pushes[0] || "consistency"}, maintain ${maintains[0] || "secondary goals"}, and deprioritize ${reduces[0] || "non-essential load"} this week.`;
  const todayLine = `Goal arbitration: push ${pushes[0] || "consistency"}; maintain ${maintains[0] || "secondary goals"}; reduce ${reduces[0] || "non-essential load"}.`;
  const coachSummary = `${shiftReason} Decision links: ${decisionLinks.join(" ")}`;
  return { primary, secondary, maintenance, deprioritized, conflicts, pushes, maintains, reduces, explanation, priorityStack, shiftReason, decisionLinks, todayLine, coachSummary };
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

const buildProactiveTriggers = ({ momentum, personalization, goals, learning, nutritionFeedback }) => {
  const triggers = [];
  if (momentum.momentumState === "drifting") triggers.push({ id:"drift", msg:"Drift detected — want a simplified version of this week?", actionLabel:"Simplify week", actionType:"REDUCE_WEEKLY_VOLUME", payload:{ pct: 12 }, priority:85 });
  if (momentum.momentumState === "falling off") triggers.push({ id:"reset", msg:"You’ve missed key momentum signals — reset with a compressed week?", actionLabel:"Activate reset", actionType:"ACTIVATE_SALVAGE", payload:{}, priority:95 });
  if (momentum.score >= 80) triggers.push({ id:"progress", msg:"Consistency streak is strong — progress slightly this week?", actionLabel:"Progress slightly", actionType:"PROGRESS_STRENGTH_EMPHASIS", payload:{ weeks: 1 }, priority:70 });
  if (personalization.travelState.isTravelWeek) triggers.push({ id:"env", msg:"Environment changed — switch to travel/home assumptions?", actionLabel:"Switch travel mode", actionType:"SWITCH_TRAVEL_MODE", payload:{ mode:"travel" }, priority:72 });
  if (goals?.find(g=>g.category==="body_comp" && g.active) && momentum.logGapDays >= 3) triggers.push({ id:"nutrition", msg:"Nutrition drift risk is rising — simplify meals for a few days?", actionLabel:"Simplify meals", actionType:"SIMPLIFY_MEALS_THIS_WEEK", payload:{ days: 3 }, priority:78 });
  if (momentum.logGapDays >= 3) triggers.push({ id:"nolog", msg:"No logs in 3 days — apply low-friction reset plan?", actionLabel:"Low-friction reset", actionType:"ACTIVATE_SALVAGE", payload:{}, priority:88 });
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
    arbitrationLine: arbitration.todayLine,
    warning,
    success: todayWorkout?.minDay ? (todayWorkout?.success || "Today = minimum viable day and momentum preserved.") : salvage?.active ? salvage.compressedPlan.success : todayWorkout?.type === "rest" ? "Log recovery, mobility, and tomorrow plan." : "Complete the planned session and log how it felt.",
    optionalAdjustment,
    patternNote: learning?.topObservations?.[0]?.msg || patterns[0] || "No dominant negative pattern detected this week."
  };
};

const generateWeeklyCoachReview = ({ momentum, arbitration, signals, personalization, patterns, learning, nutritionFeedback, expectations }) => ({
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
  expectationMotivation: expectations?.motivationLine || "Progress compounds with consistency."
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
  const isSuccess = (c) => c?.status === "completed_as_planned" || c?.status === "completed_modified" || c?.passiveAssumed;
  const isMinViable = (c) => c?.status === "completed_modified" || /min(imum)?\s?(day|dose)/i.test(c?.note || "");

  let consistencyStreak = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isSuccess(entries[i][1])) consistencyStreak += 1;
    else break;
  }
  let minViableStreak = 0;
  for (let i = entries.length - 1; i >= 0; i--) {
    if (isMinViable(entries[i][1])) minViableStreak += 1;
    else break;
  }

  const latest = entries[entries.length - 1]?.[1] || null;
  const resolution = !latest
    ? "New streak starts with one completed day."
    : latest.status === "completed_as_planned"
    ? "Good day — you hit what mattered."
    : latest.status === "completed_modified"
    ? "Not perfect, but you kept momentum."
    : latest.status === "skipped"
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

const DEFAULT_DAILY_CHECKIN = {
  status: "completed_as_planned",
  sessionFeel: "about_right",
  blocker: "",
  note: "",
  bodyweight: "",
};

const CHECKIN_STATUS_OPTIONS = [
  { key: "completed_as_planned", label: "completed as planned" },
  { key: "completed_modified", label: "completed modified" },
  { key: "skipped", label: "skipped" },
];
const CHECKIN_FEEL_OPTIONS = [
  { key: "easier_than_expected", label: "easier than expected" },
  { key: "about_right", label: "about right" },
  { key: "harder_than_expected", label: "harder than expected" },
];
const CHECKIN_BLOCKER_OPTIONS = [
  { key: "time", label: "time" },
  { key: "motivation", label: "motivation" },
  { key: "soreness_fatigue", label: "soreness/fatigue" },
  { key: "pain_injury", label: "pain/injury" },
  { key: "no_equipment", label: "no equipment" },
  { key: "schedule_travel", label: "schedule/travel" },
  { key: "other", label: "other" },
];

const parseMicroCheckin = (text) => {
  const x = (text || "").toLowerCase().trim();
  if (!x) return null;
  const out = { note: text };
  if (/miss|skip|couldn.?t|didn.?t/.test(x)) out.status = "skipped";
  else if (/modified|shortened|partial/.test(x)) out.status = "completed_modified";
  else if (/good|done|completed|solid/.test(x)) out.status = "completed_as_planned";
  if (/hard|rough|tough/.test(x)) out.sessionFeel = "harder_than_expected";
  if (/easy|easier|smooth/.test(x)) out.sessionFeel = "easier_than_expected";
  if (/busy|time|no time/.test(x)) out.blocker = "time";
  if (/travel|schedule/.test(x)) out.blocker = "schedule_travel";
  if (/pain|injury/.test(x)) out.blocker = "pain_injury";
  if (/motivation|unmotivated/.test(x)) out.blocker = "motivation";
  return out;
};

const deriveLearningLayer = ({ dailyCheckins, logs, weeklyCheckins, momentum, personalization }) => {
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
  };
  const adjustmentBias = harder >= 3 || skipped >= 3 || lowConfidenceWeeks >= 2
    ? "simplify"
    : easier >= 4 && modified <= 1 && skipped <= 1
    ? "progress"
    : "hold";
  const explanation = topObservations.length
    ? `Based on ${last28.length} recent check-ins: ${topObservations.map(o => o.msg).join(" ")}`
    : "Learning layer needs a few more quick check-ins before giving strong guidance.";

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

const detectCoachSignals = (input) => {
  const msg = input.toLowerCase();
  return {
    achillesPain: /achilles|heel|tendon|tight|pain/.test(msg),
    fatigue: /fatigue|tired|exhaust|sleep badly|not recovering|drained/.test(msg),
    soreness: /sore|stiff|heavy legs/.test(msg),
    travel: /travel|hotel|airport/.test(msg),
    missed: /missed|skip|couldn.?t do yesterday/.test(msg),
    push: /push harder|feel amazing|go harder/.test(msg),
    plateau: /plateau|stalled|not losing weight|scale stuck/.test(msg),
    anxiety: /anxious|nervous|race prep anxiety|worried/.test(msg),
    foodNear: /food near|near me|restaurant/.test(msg),
    busyDay: /busy|chaotic|no time|packed day/.test(msg),
    socialDay: /social|event|party|dinner out/.test(msg),
    lowEnergyDay: /low energy|drained|flat today/.test(msg),
  };
};

const inferCoachVoiceMode = (momentum) => {
  if (momentum?.coachMode === "protect mode") return "protect";
  if (momentum?.coachMode === "push mode") return "push";
  if (momentum?.coachMode === "reset mode") return "reset";
  if (momentum?.coachMode === "simplify mode") return "simplify";
  return "rebuild";
};

const withConfidenceTone = (message, confidence = "moderate", voiceMode = "rebuild") => {
  const lead = confidence === "high"
    ? "We should"
    : confidence === "moderate"
    ? "I’d recommend"
    : "We could try";
  const modePrefix = voiceMode === "protect"
    ? "Protect mode:"
    : voiceMode === "push"
    ? "Push mode:"
    : voiceMode === "simplify"
    ? "Simplify mode:"
    : voiceMode === "reset"
    ? "Reset mode:"
    : "Rebuild mode:";
  return `${modePrefix} ${lead} ${message}`;
};

const deterministicCoachPacket = ({ input, todayWorkout, currentWeek, logs, bodyweights, personalization, learning, salvage, momentum, strengthLayer, nutritionLayer, arbitration, expectations }) => {
  const s = detectCoachSignals(input);
  const voiceMode = inferCoachVoiceMode(momentum);
  const painLevel = inferPainLevel(input);
  const area = /knee/.test(input.toLowerCase()) ? "knee" : /shin/.test(input.toLowerCase()) ? "shin" : /hip/.test(input.toLowerCase()) ? "hip" : /calf/.test(input.toLowerCase()) ? "calf" : "Achilles";
  const notices = [];
  const recommendations = [];
  const effects = [];
  const actions = [];
  const last7 = Object.keys(logs).filter(d => ((Date.now() - new Date(d + "T12:00:00").getTime()) / (1000*60*60*24)) <= 7).length;
  const latestBW = bodyweights.length ? bodyweights[bodyweights.length - 1].w : PROFILE.weight;
  if (s.achillesPain) {
    notices.push("You flagged Achilles discomfort, which is your highest injury-risk signal.");
    addRecommendation("shift today to recovery and keep aerobic work low-impact.", "high");
    effects.push("Today becomes recovery + protocol, and pain tracking intensity is reduced.");
    actions.push(
      { type: COACH_TOOL_ACTIONS.SET_PAIN_STATE, payload: { level: painLevel === "none" ? "mild_tightness" : painLevel, area } },
      { type: COACH_TOOL_ACTIONS.SWAP_TODAY_RECOVERY, payload: { reason: "Achilles tightness detected" } },
      { type: COACH_TOOL_ACTIONS.ADD_ACHILLES_BLOCK, payload: { block: "extra_achilles_8min" } }
    );
  }
  if (s.travel) {
    notices.push("You indicated travel context.");
    addRecommendation("use travel meals and simplify training complexity.", "moderate");
    effects.push("Nutrition switches to travel mode and training defaults to hotel-friendly options.");
    actions.push(
      { type: COACH_TOOL_ACTIONS.SWITCH_TRAVEL_MEALS, payload: { enabled: true } },
      { type: COACH_TOOL_ACTIONS.CHANGE_NUTRITION_DAY, payload: { dayType: "travelRun" } }
    );
  }
  if (s.fatigue || s.soreness || s.missed) {
    notices.push(`Recovery signal detected (${s.missed ? "missed session + " : ""}${s.fatigue ? "fatigue" : "soreness"}).`);
    addRecommendation("reduce this week’s volume by ~15% and replace speed with easy aerobic work.", "high");
    effects.push("Hard sessions are down-shifted; consistency is prioritized over intensity.");
    actions.push(
      { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 15 } },
      { type: COACH_TOOL_ACTIONS.REPLACE_SPEED_EASY, payload: { week: currentWeek } }
    );
  }
  if (s.push) {
    notices.push("You reported high readiness and motivation.");
    addRecommendation("push with control: increase carb support before long run instead of random intensity.", "moderate");
    effects.push("Fueling improves for quality output while preserving recovery structure.");
    actions.push({ type: COACH_TOOL_ACTIONS.INCREASE_PRELONGRUN_CARBS, payload: { grams: 40 } });
  }
  if (s.plateau) {
    notices.push(`Bodyweight trend appears sticky around ${latestBW} lbs.`);
    addRecommendation("tighten nutrition day type and avoid under-recovery.", "moderate");
    effects.push("Carb timing is sharpened and adherence gets easier with clear day targets.");
    actions.push({ type: COACH_TOOL_ACTIONS.CHANGE_NUTRITION_DAY, payload: { dayType: todayWorkout?.type === "rest" ? "rest" : "easyRun" } });
  }
  if (s.foodNear) {
    notices.push("You asked for immediate food options.");
    addRecommendation(`use your local quick options: ${personalization.localFoodContext.quickOptions.join(", ")}.`, "high");
    effects.push("You can hit macros quickly without overthinking.");
  }
  if (s.anxiety) {
    notices.push("Race prep anxiety detected.");
    addRecommendation("insert a deload week to improve confidence and freshness.", "moderate");
    effects.push("Next week volume is reduced and intensity capped.");
    actions.push({ type: COACH_TOOL_ACTIONS.INSERT_DELOAD_WEEK, payload: { week: Math.min(18, currentWeek + 1) } });
  }
  if (s.busyDay || s.socialDay || s.lowEnergyDay) {
    notices.push("Life-constraint signal detected (busy/energy/social).");
    addRecommendation("use a minimum viable day: 10–20 minutes + protein anchor. No guilt.", "high");
    effects.push("Success criteria shifts from perfect execution to momentum preservation.");
  }
  if (learning?.adjustmentBias === "simplify") {
    notices.push("Check-ins show repeated friction (time/stress/hard sessions).");
    addRecommendation("simplify the next 7 days with minimum-dose sessions and lower aggressiveness.", "high");
    effects.push("Plan friction is lowered to protect adherence.");
    actions.push({ type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 10 } });
  }
  if (learning?.adjustmentBias === "progress" && /status|update|ready|push/i.test(input.toLowerCase())) {
    notices.push("Recent check-ins suggest sessions are manageable.");
    addRecommendation("progress modestly instead of changing everything.", "moderate");
    effects.push("Small progression with guardrails is applied.");
    actions.push({ type: COACH_TOOL_ACTIONS.PROGRESS_STRENGTH_EMPHASIS, payload: { weeks: 1 } });
  }
  const confidentPattern = (learning?.topObservations || []).find(o => ["medium","high"].includes(o.confidence));
  if (confidentPattern) {
    notices.push(`Pattern reference (${confidentPattern.confidence} confidence): ${confidentPattern.msg}`);
    if (learning?.adaptation?.reduceDensity) addRecommendation("keep this week simpler because you usually drift when schedule density rises.", confidentPattern.confidence === "high" ? "high" : "moderate");
    if (learning?.adaptation?.pushSlightly) addRecommendation("you’ve handled this level well before, so slight progression is reasonable.", confidentPattern.confidence === "high" ? "high" : "moderate");
  }
  if (/progress strength emphasis/i.test(input)) {
    notices.push("You asked to emphasize strength progression.");
    addRecommendation("shift one session toward pressing progression while keeping run quality protected.", "moderate");
    effects.push("Strength stimulus increases with controlled fatigue cost.");
    actions.push({ type: COACH_TOOL_ACTIONS.PROGRESS_STRENGTH_EMPHASIS, payload: { weeks: 2 } });
  }
  if (/reduce long-run aggressiveness/i.test(input)) {
    notices.push("You asked to reduce long-run aggressiveness.");
    addRecommendation("dial back long run load slightly to protect consistency and recovery.", "high");
    effects.push("Long run distance/effort is trimmed next week.");
    actions.push({ type: COACH_TOOL_ACTIONS.REDUCE_LONG_RUN_AGGRESSIVENESS, payload: { pct: 10 } });
  }
  if (/increase calories|too hungry|energy too low/i.test(input)) {
    notices.push("You flagged under-fueling / low energy risk.");
    addRecommendation("increase intake slightly and bias carbs near training.", "high");
    effects.push("Recovery and session quality should improve with minimal body-comp downside.");
    actions.push({ type: COACH_TOOL_ACTIONS.INCREASE_CALORIES_SLIGHTLY, payload: { kcal: 120 } });
  }
  if (/reduce deficit|diet too aggressive/i.test(input)) {
    notices.push("Current deficit may be too aggressive for mixed-goal training.");
    addRecommendation("reduce deficit aggressiveness while keeping protein high.", "moderate");
    effects.push("Adherence and performance should stabilize.");
    actions.push({ type: COACH_TOOL_ACTIONS.REDUCE_DEFICIT_AGGRESSIVENESS, payload: { kcal: 100 } });
  }
  if (/shift carbs|fuel around workout/i.test(input)) {
    notices.push("Fuel timing can be improved around workout windows.");
    addRecommendation("move more carbs pre/post training and keep non-training meals tighter.", "moderate");
    effects.push("Performance support increases without full-day calorie inflation.");
    actions.push({ type: COACH_TOOL_ACTIONS.SHIFT_CARBS_AROUND_WORKOUT, payload: { pre: 30, post: 40 } });
  }
  if (/simplify meals/i.test(input)) {
    notices.push("You asked to reduce nutrition complexity.");
    addRecommendation("use simple repeatable meals this week.", "high");
    effects.push("Food friction drops and consistency should improve.");
    actions.push({ type: COACH_TOOL_ACTIONS.SIMPLIFY_MEALS_THIS_WEEK, payload: { days: 7 } });
  }
  if (/travel nutrition|switch to travel mode/i.test(input)) {
    notices.push("Travel nutrition mode requested.");
    addRecommendation("switch to travel-friendly defaults and convenience-safe options.", "high");
    effects.push("Nutrition plan becomes resilient with limited prep.");
    actions.push({ type: COACH_TOOL_ACTIONS.SWITCH_TRAVEL_NUTRITION_MODE, payload: { enabled: true } });
  }
  if (/default meal structure|3 days/i.test(input)) {
    notices.push("You requested default meal structure support.");
    addRecommendation("run 3 days of default meal templates.", "moderate");
    effects.push("Decision fatigue drops; adherence usually improves quickly.");
    actions.push({ type: COACH_TOOL_ACTIONS.USE_DEFAULT_MEAL_STRUCTURE_3_DAYS, payload: { days: 3 } });
  }
  if (salvage?.active) {
    notices.push(`This week is off-track: ${salvage.triggerReasons.join(", ")}.`);
    addRecommendation("compress this week to essentials: 1 key run/long run + 1 strength + 1 optional recovery.", "high");
    effects.push("Plan complexity is reduced so consistency can recover.");
    effects.push("If you hit 2 core sessions this week, we rebuild back to normal next week.");
    actions.push(
      { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 20 } },
      { type: COACH_TOOL_ACTIONS.SIMPLIFY_MEALS_THIS_WEEK, payload: { days: 7 } }
    );
  }
  if (!notices.length) {
    notices.push(`You logged ${last7} sessions in the last 7 days with ${personalization.trainingState.loadStatus} load.`);
    addRecommendation("stay on plan and execute today as prescribed.", "moderate");
    effects.push("No plan mutation needed right now.");
  }
  if (arbitration?.shiftReason) {
    notices.unshift(`Goal arbitration: ${arbitration.shiftReason}`);
  }
  if (strengthLayer?.focus && nutritionLayer?.tradeoff) {
    effects.unshift(`Point of view: ${strengthLayer.focus === "push" ? "Running quality stays primary; strength progression is controlled." : "Consistency stays primary; progression is intentionally restrained."}`);
    effects.unshift(`Tradeoff: ${nutritionLayer.tradeoff} Ignore perfection this week.`);
  }
  if (arbitration?.decisionLinks?.length) {
    effects.unshift(`Why these decisions: ${arbitration.decisionLinks.join(" ")}`);
  }
  if (/status|update|forecast|expect|what happens|next/i.test(input.toLowerCase()) && expectations?.coachLine) {
    notices.unshift(expectations.coachLine);
    effects.unshift(`Expectation snapshot: ${expectations.weightExpectation} ${expectations.runExpectation}`);
  }
  return { notices, recommendations, effects, actions: actions.slice(0, 3) };
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
  const DEBUG_MODE = typeof window !== "undefined" && localStorage.getItem("trainer_debug") === "1";
  const logDiag = (...args) => { if (DEBUG_MODE) console.log("[trainer-debug]", ...args); };

  const today = new Date();
  const currentWeek = getCurrentWeek();
  const dayOfWeek = getDayOfWeek();
  const baseTodayWorkout = getTodayWorkout(currentWeek, dayOfWeek);
  const todayKey = new Date().toISOString().split("T")[0];
  const dayOverride = coachPlanAdjustments.dayOverrides?.[todayKey];
  const nutritionOverride = coachPlanAdjustments.nutritionOverrides?.[todayKey];
  const todayWorkoutBase = dayOverride ? { ...baseTodayWorkout, ...dayOverride, coachOverride: true, nutri: nutritionOverride || dayOverride.nutri || baseTodayWorkout?.week?.nutri } : { ...baseTodayWorkout, nutri: nutritionOverride || baseTodayWorkout?.week?.nutri };
  const injuryRule = buildInjuryRuleResult(todayWorkoutBase, personalization.injuryPainState);
  const todayWorkout = injuryRule.workout;
  const momentum = getMomentumEngineState({ logs, bodyweights, personalization });
  const patterns = detectBehaviorPatterns({ logs, bodyweights, personalization });
  const learningLayer = deriveLearningLayer({ dailyCheckins, logs, weeklyCheckins, momentum, personalization });
  const salvageLayer = deriveSalvageLayer({ logs, momentum, dailyCheckins, weeklyCheckins, personalization, learningLayer });
  const arbitration = arbitrateGoals({ goals, momentum, personalization });
  const strengthLayer = deriveStrengthLayer({ goals, momentum, personalization, logs });
  const progressEngine = deriveProgressEngine({ logs, bodyweights, momentum, strengthLayer });
  const expectations = deriveExpectationEngine({ progress: progressEngine, momentum, arbitration });
  const behaviorLoop = deriveBehaviorLoop({ dailyCheckins, logs, momentum, salvageLayer });
  const nutritionLayer = deriveAdaptiveNutrition({ todayWorkout, goals, momentum, personalization, bodyweights, learningLayer, nutritionFeedback, coachPlanAdjustments, salvageLayer });
  const dailyBrief = generateDailyCoachBrief({ momentum, todayWorkout, arbitration, injuryState: personalization.injuryPainState, patterns, learning: learningLayer, salvage: salvageLayer });
  const dailyStory = buildUnifiedDailyStory({ todayWorkout, dailyBrief, progress: progressEngine, arbitration, expectations, salvage: salvageLayer, momentum });
  const weeklyReview = generateWeeklyCoachReview({ momentum, arbitration, signals: computeAdaptiveSignals({ logs, bodyweights, personalization }), personalization, patterns, learning: learningLayer, nutritionFeedback, expectations });
  const proactiveTriggers = buildProactiveTriggers({ momentum, personalization, goals, learning: learningLayer, nutritionFeedback }).filter(t => !dismissedTriggers.includes(t.id));

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
  const setEnvironmentMode = async (environmentMode) => {
    const updated = mergePersonalization(personalization, {
      travelState: {
        ...personalization.travelState,
        environmentMode,
        access: environmentMode.includes("gym") ? "hotel" : environmentMode,
      }
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
  const SB_URL = "https://wtntlpfzfetixfzawxn.supabase.co";
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0bnRubHBmemZldGl4Znphd3huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDQ1NDUsImV4cCI6MjA5MDcyMDU0NX0.iio486vj_x11WuRxOLV7JwmoZPuyov32x3nPbJ_oqdg";
  const SB_ROW = "trainer_v1";
  const LOCAL_CACHE_KEY = "trainer_local_cache_v4";
  const sbH = { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY };
  const localLoad = () => {
    try {
      const raw = localStorage.getItem(LOCAL_CACHE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  };

  const localSave = (payload) => {
    try { localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify(payload)); } catch {}
  };

  const sbLoad = async () => {
    const res = await safeFetchWithTimeout(SB_URL + "/rest/v1/trainer_data?id=eq." + SB_ROW, { headers: sbH });
    if (!res.ok) throw new Error("Load failed " + res.status + ": " + await res.text());
    const rows = await res.json();
    if (rows && rows.length > 0 && rows[0].data) {
      const d = rows[0].data;
      if (d.logs) setLogs(d.logs);
      if (d.bw) setBodyweights(d.bw);
      if (d.paceOverrides) setPaceOverrides(d.paceOverrides);
      if (d.weekNotes) setWeekNotes(d.weekNotes);
      if (d.planAlerts) setPlanAlerts(d.planAlerts);
      if (d.personalization) setPersonalization(mergePersonalization(DEFAULT_PERSONALIZATION, d.personalization));
      if (d.goals) setGoals(d.goals);
      if (d.coachActions) setCoachActions(d.coachActions);
      if (d.coachPlanAdjustments) setCoachPlanAdjustments(d.coachPlanAdjustments);
      if (d.dailyCheckins) setDailyCheckins(d.dailyCheckins);
      if (d.weeklyCheckins) setWeeklyCheckins(d.weeklyCheckins);
      if (d.nutritionFavorites) setNutritionFavorites(d.nutritionFavorites);
      if (d.nutritionFeedback) setNutritionFeedback(d.nutritionFeedback);
    }
  };

  const sbSave = async (payload) => {
    const res = await safeFetchWithTimeout(SB_URL + "/rest/v1/trainer_data", {
      method: "POST",
      headers: { ...sbH, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ id: SB_ROW, data: payload, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error("Save failed " + res.status + ": " + await res.text());
  };

  const persistAll = async (newLogs, newBW, newOvr, newNotes, newAlerts, newPersonalization = personalization, newCoachActions = coachActions, newCoachPlanAdjustments = coachPlanAdjustments, newGoals = goals, newDailyCheckins = dailyCheckins, newWeeklyCheckins = weeklyCheckins, newNutritionFavorites = nutritionFavorites, newNutritionFeedback = nutritionFeedback) => {
    const payload = { logs: newLogs, bw: newBW, paceOverrides: newOvr, weekNotes: newNotes, planAlerts: newAlerts, personalization: newPersonalization, goals: newGoals, coachActions: newCoachActions, coachPlanAdjustments: newCoachPlanAdjustments, dailyCheckins: newDailyCheckins, weeklyCheckins: newWeeklyCheckins, nutritionFavorites: newNutritionFavorites, nutritionFeedback: newNutritionFeedback, v: 6, ts: Date.now() };
    localSave(payload);
    try {
      await sbSave(payload);
      setStorageStatus({ mode: "cloud", label: "SYNCED" });
    } catch (e) {
      logDiag("Cloud save failed, local fallback active:", e.message);
      setStorageStatus({ mode: "local", label: "LOCAL MODE" });
    }
  };

  useEffect(() => {
    (async () => {
      try {
        await sbLoad();
        setStorageStatus({ mode: "cloud", label: "SYNCED" });
      } catch(e) {
        logDiag("Cloud load failed:", e.message);
        const cache = localLoad();
        if (cache) {
          await importData(btoa(unescape(encodeURIComponent(JSON.stringify(cache)))));
        }
        setStorageStatus({ mode: "local", label: "LOCAL MODE" });
      }
      setLoading(false);
    })();
  }, []);

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
    const nextCoachActions = [{ id:`nudge_${Date.now()}`, ts: Date.now(), type: trigger.actionType, payload: trigger.payload || {}, source: "proactive_nudge" }, ...coachActions].slice(0, 80);
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

      const currentWeekData = WEEKS[currentWeek - 1];
      const currentZones = getZones(currentWeekData?.phase || "BASE");

      const systemPrompt = `You are an AI running coach analyzing an athlete's training log to dynamically adjust their plan. Respond ONLY with valid JSON, no other text.

ATHLETE: 30yo, 6'1", 190lbs, half marathon goal 1:45 (8:01/mi) on July 19 2026.
CURRENT WEEK: ${currentWeek}/18, Phase: ${currentWeekData?.phase}
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

  const TABS = ["TODAY", "PLAN", "LOG", "NUTRITION", "COACH"];

  if (loading) return (
    <div style={{ background:"#0a0a0f", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'DM Mono',monospace", color:"#334155", fontSize:"0.7rem", letterSpacing:"0.2em" }}>
      LOADING...
    </div>
  );

  return (
    <div style={{ fontFamily:"'DM Mono','Courier New',monospace", background:"#0a0a0f", minHeight:"100vh", color:"#e2e8f0", padding:"1.25rem 1rem" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Mono:wght@300;400;500&family=Bebas+Neue&display=swap');
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar{width:4px} ::-webkit-scrollbar-track{background:#0a0a0f} ::-webkit-scrollbar-thumb{background:#1e293b;border-radius:2px}
        .hov{transition:all 0.15s;cursor:pointer} .hov:hover{background:rgba(255,255,255,0.04)!important}
        .btn{background:none;border:1px solid #1e293b;border-radius:6px;font-family:'DM Mono',monospace;font-size:0.6rem;letter-spacing:0.1em;cursor:pointer;padding:5px 10px;transition:all 0.15s;color:#475569}
        .btn:hover{border-color:#334155;color:#94a3b8}
        .btn-primary{background:#4ade80!important;border-color:#4ade80!important;color:#0a0a0f!important;font-weight:500}
        .btn-primary:hover{filter:brightness(1.1)}
        input,textarea,select{background:#0f172a;border:1px solid #1e293b;border-radius:6px;color:#e2e8f0;font-family:'DM Mono',monospace;font-size:0.68rem;padding:6px 10px;outline:none;width:100%}
        input:focus,textarea:focus,select:focus{border-color:#334155}
        @keyframes fi{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        .fi{animation:fi 0.2s ease forwards}
        .tag{font-size:0.56rem;padding:2px 6px;border-radius:3px;letter-spacing:0.06em;white-space:nowrap}
        .card{background:#0d1117;border:1px solid #1e293b;border-radius:10px;padding:1rem}
        .sect-title{font-family:'Bebas Neue',sans-serif;font-size:0.95rem;letter-spacing:0.15em}
      `}</style>

      <div style={{ maxWidth:820, margin:"0 auto" }}>

        {/* ── HEADER BAR ── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.25rem", flexWrap:"wrap", gap:"0.5rem" }}>
          <div>
            <h1 style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.8rem", letterSpacing:"0.08em", background:"linear-gradient(135deg,#fff 40%,#f87171)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", lineHeight:1 }}>
              PERSONAL TRAINER
            </h1>
            <div style={{ fontSize:"0.58rem", color:"#334155", letterSpacing:"0.12em", marginTop:2 }}>
              {fmtDate(today).toUpperCase()} · WEEK {currentWeek} OF 18 · GOAL 1:45:00 · RACE {PROFILE.goalRace.toUpperCase()}
            </div>
          </div>
          <div style={{ display:"flex", gap:"0.5rem", alignItems:"center" }}>
            <div style={{ textAlign:"right" }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.4rem", color:C.red, letterSpacing:"0.05em" }}>
                {Math.max(0, Math.ceil((new Date("2026-07-19") - today) / (1000*60*60*24)))}
              </div>
              <div style={{ fontSize:"0.55rem", color:"#334155", letterSpacing:"0.1em" }}>DAYS TO RACE</div>
              <div style={{ marginTop:3, fontSize:"0.5rem", letterSpacing:"0.08em",
                color: storageStatus.mode === "cloud" ? "#4ade80" : storageStatus.mode === "local" ? "#f59e0b" : "#334155" }}>
                {storageStatus.mode === "cloud" ? (lastSaved ? "● SAVED " + lastSaved : "● " + storageStatus.label) : storageStatus.mode === "local" ? "● OFFLINE SAFE MODE" : "● " + storageStatus.label}
              </div>
            </div>
          </div>
        </div>

        {/* ── TABS ── */}
        <div style={{ display:"flex", gap:"0.25rem", marginBottom:"1.25rem", background:"#0d1117", padding:"0.3rem", borderRadius:10, border:"1px solid #1e293b", overflowX:"auto" }}>
          {TABS.map((t,i) => (
            <button key={t} className="btn" onClick={()=>setTab(i)}
              style={{ color:tab===i?"#0a0a0f":"#475569", background:tab===i?"#e2e8f0":"transparent", borderColor:tab===i?"#e2e8f0":"transparent", fontWeight:tab===i?500:300, flexShrink:0 }}>
              {t}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════
            TAB 0 — TODAY
        ══════════════════════════════════════════════════════════ */}
        {tab === 0 && <TodayTab todayWorkout={todayWorkout} currentWeek={currentWeek} logs={logs} bodyweights={bodyweights} planAlerts={planAlerts} setPlanAlerts={setPlanAlerts} analyzing={analyzing} getZones={getZones} personalization={personalization} goals={goals} momentum={momentum} strengthLayer={strengthLayer} dailyStory={dailyStory} behaviorLoop={behaviorLoop} proactiveTriggers={proactiveTriggers} onDismissTrigger={(id)=>setDismissedTriggers(prev=>[...prev,id])} onApplyTrigger={applyProactiveNudge} applyDayContextOverride={applyDayContextOverride} shiftTodayWorkout={shiftTodayWorkout} setEnvironmentMode={setEnvironmentMode} injuryRule={injuryRule} setInjuryState={setInjuryState} dailyCheckins={dailyCheckins} saveDailyCheckin={saveDailyCheckin} learningLayer={learningLayer} salvageLayer={salvageLayer} saveBodyweights={saveBodyweights} />}

        {/* ══════════════════════════════════════════════════════════
            TAB 1 — PLAN
        ══════════════════════════════════════════════════════════ */}
        {tab === 1 && <PlanTab currentWeek={currentWeek} logs={logs} bodyweights={bodyweights} personalization={personalization} goals={goals} setGoals={setGoals} momentum={momentum} strengthLayer={strengthLayer} weeklyReview={weeklyReview} expectations={expectations} patterns={patterns} getZones={getZones} weekNotes={weekNotes} paceOverrides={paceOverrides} setPaceOverrides={setPaceOverrides} learningLayer={learningLayer} salvageLayer={salvageLayer} weeklyCheckins={weeklyCheckins} saveWeeklyCheckin={saveWeeklyCheckin} />}

        {/* ══════════════════════════════════════════════════════════
            TAB 2 — LOG
        ══════════════════════════════════════════════════════════ */}
        {tab === 2 && <LogTab logs={logs} saveLogs={saveLogs} bodyweights={bodyweights} saveBodyweights={saveBodyweights} currentWeek={currentWeek} todayWorkout={todayWorkout} exportData={exportData} importData={importData} />}

        {/* ══════════════════════════════════════════════════════════
            TAB 3 — NUTRITION
        ══════════════════════════════════════════════════════════ */}
        {tab === 3 && <NutritionTab todayWorkout={todayWorkout} personalization={personalization} goals={goals} momentum={momentum} bodyweights={bodyweights} learningLayer={learningLayer} nutritionLayer={nutritionLayer} nutritionFavorites={nutritionFavorites} saveNutritionFavorites={saveNutritionFavorites} nutritionFeedback={nutritionFeedback} saveNutritionFeedback={saveNutritionFeedback} />}

        {/* ══════════════════════════════════════════════════════════
            TAB 4 — COACH
        ══════════════════════════════════════════════════════════ */}
        {tab === 4 && <CoachTab logs={logs} currentWeek={currentWeek} todayWorkout={todayWorkout} bodyweights={bodyweights} personalization={personalization} momentum={momentum} arbitration={arbitration} expectations={expectations} strengthLayer={strengthLayer} patterns={patterns} proactiveTriggers={proactiveTriggers} onApplyTrigger={applyProactiveNudge} learningLayer={learningLayer} salvageLayer={salvageLayer} nutritionLayer={nutritionLayer} nutritionFeedback={nutritionFeedback} setPersonalization={setPersonalization} coachActions={coachActions} setCoachActions={setCoachActions} coachPlanAdjustments={coachPlanAdjustments} setCoachPlanAdjustments={setCoachPlanAdjustments} weekNotes={weekNotes} setWeekNotes={setWeekNotes} planAlerts={planAlerts} setPlanAlerts={setPlanAlerts} onPersist={async (nextPersonalization, nextCoachActions, nextCoachPlanAdjustments = coachPlanAdjustments, nextWeekNotes = weekNotes, nextPlanAlerts = planAlerts) => {
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
function TodayTab({ todayWorkout, currentWeek, logs, bodyweights, planAlerts, setPlanAlerts, analyzing, getZones, personalization, goals, momentum, strengthLayer, dailyStory, behaviorLoop, proactiveTriggers, onDismissTrigger, onApplyTrigger, applyDayContextOverride, shiftTodayWorkout, setEnvironmentMode, injuryRule, setInjuryState, dailyCheckins, saveDailyCheckin, learningLayer, salvageLayer, saveBodyweights }) {
  const week = todayWorkout?.week;
  const zones = todayWorkout?.zones;
  const phaseName = week ? week.phase : "BASE";
  const phaseColor = PHASE_ZONES[phaseName]?.color || C.green;
  const todayKey = new Date().toISOString().split("T")[0];
  const todayLog = logs[todayKey];
  const latestBW = bodyweights.length > 0 ? bodyweights[bodyweights.length-1] : null;

  const dayColor = todayWorkout ? (dayColors[todayWorkout.type] || C.green) : C.slate;
  const arbitration = arbitrateGoals({ goals, momentum, personalization });
  const [injuryArea, setInjuryArea] = useState(personalization.injuryPainState.area || "Achilles");
  const defaultCheckin = dailyCheckins?.[todayKey] || (todayLog?.checkin || DEFAULT_DAILY_CHECKIN);
  const [checkin, setCheckin] = useState(defaultCheckin);
  const [checkinAck, setCheckinAck] = useState("");
  const contextReason = todayWorkout?.reason || "";
  useEffect(() => { setCheckin(defaultCheckin); }, [todayKey, dailyCheckins?.[todayKey], todayLog?.checkin?.ts]);
  useEffect(() => {
    if (!dailyCheckins?.[todayKey]) {
      const t = setTimeout(() => {
        saveDailyCheckin(todayKey, { ...DEFAULT_DAILY_CHECKIN, passiveAssumed: true, note: "Auto-assumed complete unless corrected." });
      }, 1800);
      return () => clearTimeout(t);
    }
  }, [todayKey, dailyCheckins?.[todayKey]]);

  return (
    <div className="fi">
      {/* Today's main card */}
      <div style={{ border:`1px solid ${dayColor}40`, borderRadius:12, overflow:"hidden", background:`${dayColor}06`, marginBottom:"1rem" }}>
        <div style={{ padding:"1rem 1.1rem", borderBottom:`1px solid ${dayColor}20`, display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"0.5rem", flexWrap:"wrap" }}>
          <div>
            <div style={{ fontSize:"0.58rem", color:dayColor, letterSpacing:"0.2em", textTransform:"uppercase", marginBottom:4 }}>
              {["Sunday","Monday","Tuesday","Wednesday","Thursday","Friday","Saturday"][new Date().getDay()]} · Week {currentWeek} · {week?.label}
            </div>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.6rem", color:"#e2e8f0", letterSpacing:"0.05em", lineHeight:1 }}>
              {todayWorkout?.label || "Rest Day"}
            </div>
          </div>
          {todayLog && (
            <div style={{ background:`${C.green}15`, border:`1px solid ${C.green}30`, borderRadius:6, padding:"4px 10px", fontSize:"0.6rem", color:C.green, letterSpacing:"0.08em" }}>
              ✓ LOGGED
            </div>
          )}
          {todayWorkout?.injuryAdjusted && (
            <div style={{ background:`${C.red}15`, border:`1px solid ${C.red}30`, borderRadius:6, padding:"4px 10px", fontSize:"0.6rem", color:C.red, letterSpacing:"0.08em" }}>
              INJURY-ADJUSTED
            </div>
          )}
        </div>

        <div style={{ padding:"1rem 1.1rem", display:"grid", gap:"0.6rem" }}>
          {/* Run details */}
          {todayWorkout?.run && (
            <WorkoutBlock
              title={`${todayWorkout.run.t} Run — ${todayWorkout.run.d}`}
              color={todayWorkout.run.t === "Intervals" ? C.amber : todayWorkout.run.t === "Long" ? C.red : C.green}
              items={[
                { label:"DISTANCE", val:todayWorkout.run.d },
                { label:"PACE", val: todayWorkout.run.t === "Intervals" ? zones?.int+"/mi" : todayWorkout.run.t === "Long" ? zones?.long+"/mi" : todayWorkout.run.t === "Tempo" ? zones?.tempo+"/mi" : zones?.easy+"/mi" },
                { label:"TYPE", val:todayWorkout.run.t },
              ]}
            />
          )}

          {/* Strength */}
          {(todayWorkout?.type === "run+strength" || todayWorkout?.type === "strength+prehab") && (
            <div>
              <div style={{ fontSize:"0.6rem", color:C.blue, letterSpacing:"0.12em", marginBottom:"0.5rem" }}>
                STRENGTH SESSION {todayWorkout.strSess || "A"} — {todayWorkout.type === "run+strength" ? "after easy run" : "standalone"}
              </div>
              <div style={{ display:"grid", gap:3 }}>
                {(STRENGTH[todayWorkout.strSess || "A"]?.home || []).map((ex,i) => (
                  <div key={i} style={{ display:"flex", gap:"0.6rem", padding:"5px 8px", background:"#0f172a", borderRadius:6, fontSize:"0.65rem" }}>
                    <span style={{ color:C.blue, minWidth:20, fontFamily:"'Bebas Neue',sans-serif", fontSize:"0.9rem" }}>{String(i+1).padStart(2,"0")}</span>
                    <div>
                      <span style={{ color:"#e2e8f0" }}>{ex.ex}</span>
                      <span style={{ color:C.blue, marginLeft:"0.5rem" }}>{ex.sets}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* OTF */}
          {todayWorkout?.type === "otf" && (
            <div style={{ fontSize:"0.68rem", color:"#64748b", lineHeight:1.8 }}>
              <span style={{ color:"#f59e0b" }}>Orange Theory Hybrid — </span>
              This is a real training day. Treadmill blocks carry significant running load on your Achilles and cardiovascular system. Give it full effort. Don't add extra running on top.
            </div>
          )}

          {/* Rest */}
          {todayWorkout?.type === "rest" && (
            <div style={{ fontSize:"0.68rem", color:"#64748b", lineHeight:1.8 }}>
              <span style={{ color:C.slate }}>Full Rest — </span>
              Walk if you want. Do your 5-minute Achilles protocol. Eat at your rest-day targets. Sleep 8 hours.
            </div>
          )}

          {/* Achilles always */}
          <div style={{ background:"#120a1a", border:`1px solid ${C.purple}25`, borderRadius:8, padding:"0.7rem" }}>
            <div style={{ fontSize:"0.6rem", color:C.purple, letterSpacing:"0.12em", marginBottom:"0.5rem" }}>ACHILLES PROTOCOL — DAILY (5 min)</div>
            <div style={{ display:"grid", gap:3 }}>
              {ACHILLES.map((ex,i) => (
                <div key={i} style={{ fontSize:"0.6rem", color:"#475569" }}>
                  <span style={{ color:C.purple }}>→ </span>{ex.ex} <span style={{ color:"#334155" }}>· {ex.sets}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Analyzing indicator */}
      {analyzing && (
        <div style={{ display:"flex", alignItems:"center", gap:"0.5rem", padding:"0.6rem 0.85rem", background:"#0d1117", border:"1px solid #1e293b", borderRadius:8, marginBottom:"0.75rem", fontSize:"0.62rem", color:C.amber }}>
          <div style={{ width:6, height:6, borderRadius:"50%", background:C.amber, animation:"pulse 1s infinite" }} />
          Analyzing your training logs and adjusting plan...
        </div>
      )}

      <div className="card" style={{ marginBottom:"0.75rem" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.45rem" }}>REAL-LIFE DAY OVERRIDES</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"0.25rem", marginBottom:"0.35rem" }}>
          {[["busy_day","Busy"],["low_energy_day","Low energy"],["travel_day","Travel"],["social_event_day","Social"],["minimum_viable_day","Min day"]].map(([k,label]) => (
            <button key={k} className="btn" onClick={()=>applyDayContextOverride(k)} style={{ fontSize:"0.5rem" }}>{label}</button>
          ))}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.25rem" }}>
          <button className="btn" onClick={()=>shiftTodayWorkout(1)} style={{ fontSize:"0.52rem", color:C.green, borderColor:C.green+"30" }}>Shift to tomorrow</button>
          <button className="btn" onClick={()=>shiftTodayWorkout(2)} style={{ fontSize:"0.52rem", color:C.green, borderColor:C.green+"30" }}>Shift +2 days</button>
        </div>
        {todayWorkout?.minDay && (
          <div style={{ marginTop:"0.4rem", fontSize:"0.56rem", color:C.amber }}>
            Success redefined: {todayWorkout?.success || "Today = minimum effective day. Keep momentum alive."}
          </div>
        )}
        {contextReason && <div style={{ marginTop:"0.2rem", fontSize:"0.54rem", color:"#64748b" }}>Current override: {contextReason.replaceAll("_"," ")}</div>}
      </div>

      {salvageLayer.active && (
        <div className="card" style={{ marginBottom:"0.75rem", borderColor:C.amber+"55", background:"#1a1304" }}>
          <div className="sect-title" style={{ color:C.amber, marginBottom:"0.45rem" }}>SALVAGE MODE ACTIVE — WEEK COMPRESSED</div>
          <div style={{ fontSize:"0.58rem", color:"#f1f5f9", lineHeight:1.6, marginBottom:"0.35rem" }}>
            This week has been compressed so execution stays realistic.
          </div>
          <div style={{ fontSize:"0.56rem", color:"#94a3b8", marginBottom:"0.25rem" }}>What remains important: {salvageLayer.compressedPlan.keep.join(" · ")}</div>
          <div style={{ fontSize:"0.56rem", color:"#64748b", marginBottom:"0.25rem" }}>What was removed: {salvageLayer.compressedPlan.remove.join(" · ")}</div>
          <div style={{ fontSize:"0.56rem", color:C.green }}>Success this week: {salvageLayer.compressedPlan.success}</div>
        </div>
      )}

      {/* Plan alerts */}
      {planAlerts.length > 0 && (
        <div style={{ marginBottom:"0.75rem", display:"grid", gap:"0.4rem" }}>
          {planAlerts.slice(0, 1).map(alert => (
            <div key={alert.id} style={{
              display:"flex", alignItems:"flex-start", gap:"0.6rem",
              padding:"0.65rem 0.85rem",
              background: alert.type === "upgrade" ? "#0a1a0a" : alert.type === "warning" ? "#1a0e00" : "#0a0a14",
              border: `1px solid ${alert.type === "upgrade" ? C.green+"50" : alert.type === "warning" ? C.amber+"50" : C.blue+"40"}`,
              borderRadius:8, fontSize:"0.65rem", lineHeight:1.6
            }}>
              <div style={{ fontSize:"0.85rem", flexShrink:0 }}>
                {alert.type === "upgrade" ? "⬆" : alert.type === "warning" ? "⚠" : alert.type === "makeup" ? "↩" : "ℹ"}
              </div>
              <div style={{ flex:1, color: alert.type === "upgrade" ? C.green : alert.type === "warning" ? C.amber : "#94a3b8" }}>
                {alert.msg}
              </div>
              <button onClick={() => setPlanAlerts(prev => prev.filter(a => a.id !== alert.id))}
                style={{ background:"none", border:"none", color:"#334155", cursor:"pointer", fontSize:"0.7rem", flexShrink:0, padding:0 }}>✕</button>
            </div>
          ))}
        </div>
      )}

      {/* Quick stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(130px,1fr))", gap:"0.5rem", marginBottom:"1rem" }}>
        {[
          { label:"Current Weight", val: latestBW ? `${latestBW.w} lbs` : `${PROFILE.weight} lbs`, sub: latestBW ? `↓ ${(PROFILE.weight - latestBW.w).toFixed(1)} lbs from start` : "Starting weight", color:C.green },
          { label:"Workouts Logged", val: Object.keys(logs).length, sub:"Total sessions", color:C.blue },
          { label:"Today's Nutrition", val: todayWorkout ? NUTRITION[todayWorkout.nutri || "easyRun"]?.cal : NUTRITION.rest.cal, sub:"Target calories", color:C.amber },
          { label:"Phase", val: phaseName, sub:`Week ${currentWeek} of 18`, color:phaseColor },
        ].map(s => (
          <div key={s.label} style={{ border:`1px solid #1e293b`, borderRadius:8, padding:"0.65rem 0.85rem", background:"#0d1117" }}>
            <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.3rem", color:s.color, letterSpacing:"0.04em", lineHeight:1 }}>{s.val}</div>
            <div style={{ fontSize:"0.58rem", color:"#334155", letterSpacing:"0.08em", marginTop:3, textTransform:"uppercase" }}>{s.label}</div>
            <div style={{ fontSize:"0.56rem", color:"#1e293b", marginTop:1 }}>{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="card" style={{ marginBottom:"1rem" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.6rem" }}>15-SECOND CHECK-IN</div>
        <div style={{ display:"grid", gap:"0.4rem" }}>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.35rem" }}>
            <select value={checkin.status || "completed_as_planned"} onChange={e=>setCheckin(c=>({ ...c, status: e.target.value }))} style={{ fontSize:"0.56rem" }}>
              {CHECKIN_STATUS_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
            </select>
            <select value={checkin.sessionFeel || "about_right"} onChange={e=>setCheckin(c=>({ ...c, sessionFeel: e.target.value }))} style={{ fontSize:"0.56rem" }}>
              {CHECKIN_FEEL_OPTIONS.map(opt => <option key={opt.key} value={opt.key}>{opt.label}</option>)}
            </select>
          </div>
          {(checkin.status === "completed_modified" || checkin.status === "skipped") && (
            <select value={checkin.blocker || ""} onChange={e=>setCheckin(c=>({ ...c, blocker: e.target.value }))} style={{ fontSize:"0.56rem" }}>
              <option value="">Main blocker (if any)</option>
              {CHECKIN_BLOCKER_OPTIONS.map(b => <option key={b.key} value={b.key}>{b.label}</option>)}
            </select>
          )}
          <div style={{ display:"grid", gridTemplateColumns:"1fr 120px auto", gap:"0.35rem" }}>
            <input value={checkin.note || ""} onChange={e=>setCheckin(c=>({ ...c, note: e.target.value }))} placeholder='Micro input: "missed — busy", "felt hard", "good session"' />
            <input type="number" step="0.1" value={checkin.bodyweight || ""} onChange={e=>setCheckin(c=>({ ...c, bodyweight: e.target.value }))} placeholder="BW (opt)" />
            <button className="btn btn-primary" onClick={async ()=>{
              const parsed = parseMicroCheckin(checkin.note || "");
              const payload = parsed ? { ...checkin, ...parsed, passiveAssumed: false } : { ...checkin, passiveAssumed: false };
              await saveDailyCheckin(todayKey, payload);
              const ack = payload.status === "completed_as_planned"
                ? "Saved — good day, you hit what mattered."
                : payload.status === "completed_modified"
                ? "Saved — not perfect, but momentum stayed alive."
                : payload.status === "skipped"
                ? "Saved — recovery noted. Tomorrow is a fresh restart."
                : "Saved — check-in captured.";
              setCheckinAck(ack);
              if (checkin.bodyweight && !Number.isNaN(parseFloat(checkin.bodyweight))) {
                const entry = { date: todayKey, w: parseFloat(checkin.bodyweight) };
                const nextBW = [...bodyweights.filter(b => b.date !== todayKey), entry].sort((a,b) => a.date.localeCompare(b.date));
                await saveBodyweights(nextBW);
              }
            }} style={{ fontSize:"0.55rem" }}>SAVE CHECK-IN</button>
          </div>
          {checkinAck && <div style={{ fontSize:"0.54rem", color:C.green }}>{checkinAck}</div>}
          <div style={{ fontSize:"0.53rem", color:"#475569" }}>If you do nothing, today is auto-assumed completed as planned. Tap only to correct.</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom:"1rem", borderColor:C.amber+"40", background:"#15120a" }}>
        <div className="sect-title" style={{ color:C.amber, marginBottom:"0.55rem" }}>DAILY BRIEF</div>
        <div style={{ fontSize:"0.6rem", color:"#e2e8f0", lineHeight:1.75, marginBottom:"0.4rem" }}>
          {dailyStory.brief}
        </div>
        <div style={{ fontSize:"0.56rem", color:C.green, lineHeight:1.7 }}>
          <span style={{ color:"#94a3b8" }}>Success today:</span> {dailyStory.success}
        </div>
        <div style={{ marginTop:"0.25rem", fontSize:"0.53rem", color:"#64748b" }}>
          Priority mode: {dailyStory.priority} · {arbitration.shiftReason}
        </div>
        {proactiveTriggers[0] && (
          <div style={{ marginTop:"0.3rem", fontSize:"0.54rem", color:"#94a3b8" }}>
            Nudge: {proactiveTriggers[0].msg}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom:"1rem" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.55rem" }}>MOMENTUM LOOP</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,1fr)", gap:"0.4rem", marginBottom:"0.4rem" }}>
          <div style={{ background:"#0f172a", border:`1px solid ${C.green}30`, borderRadius:7, padding:"0.45rem" }}>
            <div style={{ fontSize:"0.5rem", color:"#334155" }}>CONSISTENCY STREAK</div>
            <div style={{ fontSize:"0.68rem", color:C.green }}>{behaviorLoop.consistencyStreak} days</div>
          </div>
          <div style={{ background:"#0f172a", border:`1px solid ${C.blue}30`, borderRadius:7, padding:"0.45rem" }}>
            <div style={{ fontSize:"0.5rem", color:"#334155" }}>MIN DAY STREAK</div>
            <div style={{ fontSize:"0.68rem", color:C.blue }}>{behaviorLoop.minViableStreak} days</div>
          </div>
        </div>
        <div style={{ fontSize:"0.57rem", color:"#94a3b8", lineHeight:1.7, marginBottom:"0.2rem" }}>{behaviorLoop.resolution}</div>
        <div style={{ fontSize:"0.56rem", color:behaviorLoop.recoveryTone ? C.amber : C.green }}>{behaviorLoop.identity}</div>
      </div>

      {(todayWorkout?.type?.includes("strength") || todayWorkout?.label?.toLowerCase().includes("strength")) && (
        <div className="card" style={{ marginBottom:"1rem" }}>
          <div className="sect-title" style={{ color:C.purple, marginBottom:"0.5rem" }}>STRENGTH FOCUS TODAY</div>
          <div style={{ fontSize:"0.58rem", color:"#94a3b8", lineHeight:1.7 }}>
            Focus: <span style={{ color:"#e2e8f0" }}>{strengthLayer.focus}</span> · Bench est {strengthLayer.benchEstimate} · conservative TM {strengthLayer.trainingMax}.
          </div>
          <div style={{ marginTop:"0.35rem", fontSize:"0.56rem", color:"#64748b" }}>Session: {strengthLayer.progression[0]}</div>
          <div style={{ marginTop:"0.25rem", fontSize:"0.55rem", color:"#475569" }}>{strengthLayer.tradeoff}</div>
        </div>
      )}

      <div style={{ marginBottom:"0.7rem", display:"grid", gridTemplateColumns:"1fr auto auto", gap:"0.35rem", alignItems:"center" }}>
        <select value={personalization.travelState.environmentMode || "home"} onChange={e=>setEnvironmentMode(e.target.value)} style={{ fontSize:"0.58rem" }}>
          {["full gym","limited gym","home","travel","outdoors only","no equipment"].map(m => <option key={m} value={m}>{m}</option>)}
        </select>
        {proactiveTriggers[0] && <button className="btn" onClick={()=>onApplyTrigger(proactiveTriggers[0])} style={{ fontSize:"0.52rem", color:C.green, borderColor:C.green+"30" }}>{proactiveTriggers[0].actionLabel || "Apply nudge"}</button>}
        {proactiveTriggers[0] && <button className="btn" onClick={()=>onDismissTrigger(proactiveTriggers[0].id)} style={{ fontSize:"0.52rem" }}>Dismiss</button>}
      </div>

      <div className="card" style={{ marginBottom:"1rem", borderColor: personalization.injuryPainState.level === "none" ? "#1e293b" : C.red + "50" }}>
        <div className="sect-title" style={{ color: personalization.injuryPainState.level === "none" ? C.slate : C.red, marginBottom:"0.6rem" }}>
          INJURY / PAIN STATUS
        </div>
        <div style={{ fontSize:"0.62rem", color:"#94a3b8", marginBottom:"0.45rem" }}>
          Status: <span style={{ color:"#e2e8f0" }}>{personalization.injuryPainState.level.replaceAll("_", " ")}</span> · Area: <span style={{ color:"#e2e8f0" }}>{personalization.injuryPainState.area}</span>
        </div>
        <div style={{ fontSize:"0.6rem", color:C.amber, lineHeight:1.7, marginBottom:"0.45rem" }}>
          Active modifications: {injuryRule.mods.length ? injuryRule.mods.join(" · ") : "None"}
        </div>
        <div style={{ fontSize:"0.58rem", color:"#64748b", marginBottom:"0.55rem" }}>
          Why this changed: {injuryRule.why}
        </div>
        <div style={{ marginBottom:"0.45rem" }}>
          <select value={injuryArea} onChange={e=>setInjuryArea(e.target.value)} style={{ fontSize:"0.58rem" }}>
            {AFFECTED_AREAS.map(a => <option key={a} value={a}>{a}</option>)}
          </select>
        </div>
        <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
          <button className="btn" onClick={()=>setInjuryState("none", injuryArea)} style={{ color:C.green, borderColor:C.green+"35" }}>CLEAR</button>
          <button className="btn" onClick={()=>setInjuryState("mild_tightness", injuryArea)} style={{ color:C.blue, borderColor:C.blue+"35" }}>MILD</button>
          <button className="btn" onClick={()=>setInjuryState("moderate_pain", injuryArea)} style={{ color:C.amber, borderColor:C.amber+"35" }}>MODERATE</button>
          <button className="btn" onClick={()=>setInjuryState("sharp_pain_stop", injuryArea)} style={{ color:C.red, borderColor:C.red+"35" }}>SHARP / STOP</button>
        </div>
        <div style={{ marginTop:"0.5rem", fontSize:"0.55rem", color:"#475569" }}>
          Training adjustment logic only. Not medical diagnosis.
        </div>
      </div>

      {/* Recent logs preview */}
      {Object.keys(logs).length > 0 && (
        <div className="card">
          <div className="sect-title" style={{ color:C.green, marginBottom:"0.75rem" }}>RECENT ACTIVITY</div>
          <div style={{ display:"grid", gap:"0.4rem" }}>
            {Object.entries(logs).slice(-4).reverse().map(([date, log]) => (
              <div key={date} style={{ display:"flex", gap:"0.75rem", fontSize:"0.65rem", padding:"6px 8px", background:"#0f172a", borderRadius:6, alignItems:"center" }}>
                <span style={{ color:"#334155", minWidth:80 }}>{new Date(date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</span>
                <span style={{ color:"#e2e8f0", flex:1 }}>{log.type}</span>
                {log.miles && <span style={{ color:C.green }}>{log.miles} mi</span>}
                {log.pace && <span style={{ color:C.blue }}>{log.pace}/mi</span>}
                {log.pushups && <span style={{ color:C.amber }}>{log.pushups} push-ups</span>}
                {log.feel && <span style={{ color:["#334155","#f87171","#f59e0b","#60a5fa","#4ade80"][log.feel-1]||"#475569" }}>{"●".repeat(log.feel)}</span>}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function WorkoutBlock({ title, color, items }) {
  return (
    <div style={{ background:"#0f172a", borderRadius:8, padding:"0.75rem", border:`1px solid ${color}20` }}>
      <div style={{ fontSize:"0.65rem", color, marginBottom:"0.5rem", letterSpacing:"0.08em" }}>{title}</div>
      <div style={{ display:"flex", gap:"1rem", flexWrap:"wrap" }}>
        {items.map(item => (
          <div key={item.label}>
            <div style={{ fontSize:"0.58rem", color:"#334155", letterSpacing:"0.1em", textTransform:"uppercase" }}>{item.label}</div>
            <div style={{ fontSize:"0.78rem", color:color, fontFamily:"'Bebas Neue',sans-serif", letterSpacing:"0.05em" }}>{item.val}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── PLAN TAB ──────────────────────────────────────────────────────────────────
function PlanTab({ currentWeek, logs, bodyweights, personalization, goals, setGoals, momentum, strengthLayer, weeklyReview, expectations, patterns, getZones, weekNotes, paceOverrides, setPaceOverrides, learningLayer, salvageLayer, weeklyCheckins, saveWeeklyCheckin }) {
  const [openWeek, setOpenWeek] = useState(null);
  const [newGoal, setNewGoal] = useState({ name:"", category:"running", priority:2, targetDate:"", measurableTarget:"", active:true });
  const weeklyDraft = weeklyCheckins?.[String(currentWeek)] || { energy: 3, stress: 3, confidence: 3 };
  const [miniWeekly, setMiniWeekly] = useState(weeklyDraft);
  useEffect(() => { setMiniWeekly(weeklyDraft); }, [currentWeek, weeklyCheckins?.[String(currentWeek)]?.ts]);
  const goalContext = getGoalContext(goals);
  const arbitration = arbitrateGoals({ goals, momentum, personalization });
  const signals = computeAdaptiveSignals({ logs, bodyweights, personalization });
  const adjustedWeekMap = {};
  WEEKS.forEach((w, idx) => {
    if (w.w === currentWeek + 1 || w.w === currentWeek + 2) {
      const baseAdaptive = buildAdaptiveWeek(w, signals, personalization);
      if (learningLayer.adaptation?.reduceDensity) {
        baseAdaptive.adjusted.mon.d = scaleMilesString(baseAdaptive.adjusted.mon.d, 0.88);
        baseAdaptive.adjusted.fri.d = scaleMilesString(baseAdaptive.adjusted.fri.d, 0.88);
        baseAdaptive.changed.push("Adjusting based on your pattern: you tend to fall off when weeks are too dense.");
      }
      if (learningLayer.adaptation?.lowerAggressiveness) {
        baseAdaptive.changed.push("Pattern-informed adjustment: progression aggressiveness reduced this block.");
      }
      if (learningLayer.adaptation?.environmentFastSwitch) {
        baseAdaptive.changed.push("Pattern-informed adjustment: environment substitutions are applied earlier.");
      }
      if (arbitration.primary?.category === "strength" && arbitration.secondary.find(g=>g.category==="running")) {
        baseAdaptive.adjusted.mon.d = scaleMilesString(baseAdaptive.adjusted.mon.d, 0.95);
        baseAdaptive.changed.push("Running volume trimmed slightly to protect strength progression.");
      }
      adjustedWeekMap[w.w] = baseAdaptive;
    }
  });

  return (
    <div className="fi">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem", flexWrap:"wrap", gap:"0.5rem" }}>
        <div style={{ fontSize:"0.65rem", color:"#334155", lineHeight:1.7 }}>
          Multi-goal weekly planner. Race structure stays intact while week details adjust by execution + recovery.
        </div>
        {Object.keys(paceOverrides).length > 0 && (
          <button className="btn" onClick={() => setPaceOverrides({})}
            style={{ fontSize:"0.58rem", color:C.amber, borderColor:C.amber+"30", whiteSpace:"nowrap" }}>
            RESET PACE ADJUSTMENTS
          </button>
        )}
      </div>

      {salvageLayer.active && (
        <div className="card" style={{ marginBottom:"0.75rem", borderColor:C.amber+"55", background:"#1a1304" }}>
          <div className="sect-title" style={{ color:C.amber, marginBottom:"0.45rem" }}>PLAN COMPRESSION THIS WEEK</div>
          <div style={{ fontSize:"0.57rem", color:"#94a3b8", marginBottom:"0.25rem" }}>Why: {salvageLayer.triggerReasons.join(" · ")}</div>
          {salvageLayer.compressedPlan.keep.map((k,i)=><div key={i} style={{ fontSize:"0.57rem", color:"#e2e8f0", marginBottom:"0.15rem" }}>• Keep: {k}</div>)}
          {salvageLayer.compressedPlan.remove.map((r,i)=><div key={i} style={{ fontSize:"0.55rem", color:"#64748b", marginBottom:"0.1rem" }}>• Removed: {r}</div>)}
          <div style={{ fontSize:"0.56rem", color:C.green, marginTop:"0.2rem" }}>Success = {salvageLayer.compressedPlan.success}</div>
        </div>
      )}

      <div className="card" style={{ marginBottom:"0.75rem" }}>
        <div className="sect-title" style={{ color:C.amber, marginBottom:"0.5rem" }}>WEEKLY MINI CHECK-IN (UNDER 10 SECONDS)</div>
        <div style={{ display:"grid", gap:"0.4rem", fontSize:"0.57rem" }}>
          {[
            ["energy", "Energy this week?"],
            ["stress", "Stress / chaos this week?"],
            ["confidence", "Confidence for next week?"],
          ].map(([k, label]) => (
            <div key={k} style={{ display:"grid", gridTemplateColumns:"170px 1fr", alignItems:"center", gap:"0.5rem" }}>
              <div style={{ color:"#94a3b8" }}>{label}</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"0.25rem" }}>
                {[1,2,3,4,5].map(n => (
                  <button key={n} className="btn" onClick={()=>setMiniWeekly(prev=>({ ...prev, [k]: n }))}
                    style={{ fontSize:"0.53rem", padding:"3px 0", borderColor: Number(miniWeekly[k])===n ? C.amber : "#1e293b", color: Number(miniWeekly[k])===n ? C.amber : "#64748b" }}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          ))}
          <div>
            <button className="btn btn-primary" onClick={()=>saveWeeklyCheckin(currentWeek, miniWeekly)} style={{ fontSize:"0.55rem" }}>SAVE WEEKLY CHECK-IN</button>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom:"0.75rem" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.45rem" }}>LEARNING SUMMARY</div>
        <div style={{ fontSize:"0.56rem", color:"#64748b", marginBottom:"0.3rem" }}>
          Bias this week: <span style={{ color:"#e2e8f0" }}>{learningLayer.adjustmentBias}</span> · Check-ins used: {learningLayer.stats.total}.
        </div>
        {learningLayer.adaptation?.active && (
          <div style={{ fontSize:"0.56rem", color:C.amber, marginBottom:"0.2rem" }}>
            Auto-adjusting week structure from medium/high-confidence patterns.
          </div>
        )}
        {(learningLayer.topObservations || []).slice(0,3).map(o => (
          <div key={o.key} style={{ fontSize:"0.57rem", color:"#94a3b8", marginBottom:"0.2rem" }}>• {o.msg}</div>
        ))}
      </div>
      {Object.keys(paceOverrides).length > 0 && (
        <div style={{ marginBottom:"0.85rem", padding:"0.65rem 0.85rem", background:"#0d1117", border:`1px solid ${C.amber}30`, borderRadius:8, fontSize:"0.62rem", color:C.amber, lineHeight:1.7 }}>
          ⬆ Plan paces have been adjusted based on your training logs. Weeks marked ADJUSTED show your updated targets.
        </div>
      )}
      <div className="card" style={{ marginBottom:"0.75rem" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.5rem" }}>GOAL STACK</div>
        <div style={{ fontSize:"0.6rem", color:"#94a3b8", marginBottom:"0.35rem" }}>Primary: <span style={{ color:"#e2e8f0" }}>{arbitration.primary?.name || "None"}</span></div>
        <div style={{ fontSize:"0.56rem", color:"#475569", marginBottom:"0.35rem" }}>Current coach mode: {momentum.coachMode} · consistency first.</div>
        <div style={{ fontSize:"0.58rem", color:"#64748b", marginBottom:"0.35rem" }}>Secondary: {(arbitration.secondary || []).map(g => g.name).join(" · ") || "None"}</div>
        <div style={{ fontSize:"0.56rem", color:"#475569", marginBottom:"0.35rem" }}>Maintained: {(arbitration.maintenance || []).map(g => g.name).join(" · ") || "None"}</div>
        <div style={{ fontSize:"0.55rem", color:"#475569", marginBottom:"0.45rem" }}>Deprioritized now: {(arbitration.deprioritized || []).join(" · ") || "None"}</div>
        <div style={{ fontSize:"0.56rem", color:"#94a3b8", marginBottom:"0.35rem" }}>
          Current priority stack: primary <span style={{ color:"#e2e8f0" }}>{arbitration.priorityStack.primary}</span> · secondary <span style={{ color:"#e2e8f0" }}>{arbitration.priorityStack.secondary}</span> · maintained <span style={{ color:"#e2e8f0" }}>{arbitration.priorityStack.maintained}</span>.
        </div>
        <div style={{ fontSize:"0.56rem", color:"#64748b", marginBottom:"0.35rem" }}>{arbitration.shiftReason}</div>
        <div style={{ display:"grid", gap:"0.2rem", marginBottom:"0.45rem" }}>
          {(arbitration.conflicts || []).map((t,i)=><div key={i} style={{ fontSize:"0.55rem", color:C.amber }}>Tradeoff: {t}</div>)}
          <div style={{ fontSize:"0.55rem", color:"#94a3b8" }}>Pushed: {(arbitration.pushes || []).join(" · ") || "None"}.</div>
          <div style={{ fontSize:"0.55rem", color:"#94a3b8" }}>Maintained: {(arbitration.maintains || []).join(" · ") || "None"}.</div>
          <div style={{ fontSize:"0.55rem", color:"#64748b" }}>Reduced: {(arbitration.reduces || []).join(" · ") || "None"}.</div>
          {(arbitration.decisionLinks || []).map((line, i) => (
            <div key={`decision_${i}`} style={{ fontSize:"0.55rem", color:"#64748b" }}>Decision link: {line}</div>
          ))}
        </div>
        <div style={{ display:"grid", gap:"0.3rem" }}>
          {goals.map((g,idx)=>(
            <div key={g.id} style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:"0.35rem", alignItems:"center", background:"#0f172a", borderRadius:6, padding:"5px 7px" }}>
              <div>
                <div style={{ fontSize:"0.57rem", color:"#cbd5e1" }}>{g.name}</div>
                <div style={{ fontSize:"0.5rem", color:"#475569" }}>{g.category} {g.targetDate ? `· ${g.targetDate}` : ""} {g.measurableTarget ? `· ${g.measurableTarget}` : ""}</div>
              </div>
              <select value={g.priority} onChange={e=>setGoals(goals.map(x=>x.id===g.id?{...x,priority:parseInt(e.target.value)}:x))} style={{ fontSize:"0.54rem", padding:"2px 4px" }}>
                {[1,2,3,4].map(n=><option key={n} value={n}>P{n}</option>)}
              </select>
              <button className="btn" onClick={()=>setGoals(goals.map(x=>x.id===g.id?{...x,active:!x.active}:x))} style={{ fontSize:"0.5rem", color:g.active?C.green:"#64748b" }}>{g.active?"ON":"OFF"}</button>
            </div>
          ))}
        </div>
        <div style={{ marginTop:"0.5rem", borderTop:"1px solid #1e293b", paddingTop:"0.5rem", display:"grid", gap:"0.35rem" }}>
          <input value={newGoal.name} onChange={e=>setNewGoal({ ...newGoal, name:e.target.value })} placeholder="Add goal (e.g., bench 225 lbs)" />
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"0.3rem" }}>
            <select value={newGoal.category} onChange={e=>setNewGoal({ ...newGoal, category:e.target.value })}>
              {["running","body_comp","strength","injury_prevention","recovery"].map(c=><option key={c}>{c}</option>)}
            </select>
            <input type="date" value={newGoal.targetDate} onChange={e=>setNewGoal({ ...newGoal, targetDate:e.target.value })} />
            <input placeholder="Measurable target" value={newGoal.measurableTarget} onChange={e=>setNewGoal({ ...newGoal, measurableTarget:e.target.value })} />
          </div>
          <button className="btn" onClick={() => {
            if (!newGoal.name.trim()) return;
            setGoals([{ ...newGoal, id:`g_${Date.now()}` }, ...goals]);
            setNewGoal({ name:"", category:"running", priority:2, targetDate:"", measurableTarget:"", active:true });
          }} style={{ color:C.green, borderColor:C.green+"35" }}>
            ADD GOAL
          </button>
        </div>
      </div>
      <div className="card" style={{ marginBottom:"0.75rem" }}>
        <div className="sect-title" style={{ color:C.purple, marginBottom:"0.5rem" }}>STRENGTH PROGRESSION LAYER</div>
        <div style={{ fontSize:"0.58rem", color:"#94a3b8", lineHeight:1.7 }}>
          Current mode: <span style={{ color:"#e2e8f0" }}>{strengthLayer.focus}</span> · Bench estimate {strengthLayer.benchEstimate} (TM {strengthLayer.trainingMax}) · Recent bench logs {strengthLayer.recentBenchHits}.
        </div>
        <div style={{ marginTop:"0.35rem", fontSize:"0.56rem", color:"#64748b" }}>Pressing progression: {strengthLayer.progression.join(" · ")}</div>
        <div style={{ marginTop:"0.25rem", fontSize:"0.56rem", color:"#64748b" }}>Lower-body balance: {strengthLayer.lowerBody.join(" · ")}</div>
        <div style={{ marginTop:"0.25rem", fontSize:"0.56rem", color:"#64748b" }}>Environment substitutions: {strengthLayer.substitutions.join(" · ")}</div>
        <div style={{ marginTop:"0.25rem", fontSize:"0.55rem", color:C.amber }}>Tradeoff: {strengthLayer.tradeoff}</div>
      </div>
      <div className="card" style={{ marginBottom:"0.75rem" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.5rem" }}>WEEKLY COACH REVIEW</div>
        <div style={{ fontSize:"0.58rem", color:"#94a3b8", lineHeight:1.7 }}>
          <div><span style={{ color:C.blue }}>Went well:</span> {weeklyReview.wentWell}</div>
          <div><span style={{ color:C.blue }}>Drifted:</span> {weeklyReview.drifted}</div>
          <div><span style={{ color:C.blue }}>Learned:</span> {weeklyReview.learned}</div>
          <div><span style={{ color:C.blue }}>Changes next week:</span> {weeklyReview.changesNextWeek}</div>
          <div><span style={{ color:C.blue }}>Priority shift:</span> {weeklyReview.arbitrationShift}</div>
          <div><span style={{ color:C.blue }}>Current tradeoff:</span> {weeklyReview.tradeoff}</div>
          <div><span style={{ color:C.blue }}>Expectation:</span> {weeklyReview.expectation}</div>
          <div><span style={{ color:C.blue }}>Condition:</span> {weeklyReview.expectationCondition}</div>
          <div><span style={{ color:C.blue }}>Motivation:</span> {weeklyReview.expectationMotivation}</div>
        </div>
        {patterns.length > 0 && <div style={{ marginTop:"0.35rem", fontSize:"0.55rem", color:"#64748b" }}>Pattern signals: {patterns.join(" · ")}</div>}
      </div>
      <div className="card" style={{ marginBottom:"0.75rem" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.5rem" }}>EXPECTATION ENGINE (SHORT-TERM)</div>
        <div style={{ fontSize:"0.57rem", color:"#94a3b8", lineHeight:1.7 }}>
          <div>• {expectations.weightExpectation}</div>
          <div>• {expectations.runExpectation}</div>
          <div>• {expectations.strengthExpectation}</div>
        </div>
      </div>
      <div style={{ marginBottom:"0.75rem", background:"#0d1117", border:"1px solid #1e293b", borderRadius:8, padding:"0.6rem 0.75rem", display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"0.35rem" }}>
        {[["Adherence",(signals.adherenceScore*100).toFixed(0)+"%",C.green],["Fatigue",signals.fatigueFlag?"High":"Managed",signals.fatigueFlag?C.red:C.blue],["Momentum",signals.momentumFlag?"Up":"Neutral",signals.momentumFlag?C.green:"#64748b"],["Readiness",signals.readiness.toUpperCase(),C.amber]].map(([l,v,col])=>(
          <div key={l}>
            <div style={{ fontSize:"0.52rem", color:"#334155" }}>{l}</div>
            <div style={{ fontSize:"0.68rem", color:col }}>{v}</div>
          </div>
        ))}
      </div>
      {WEEKS.map(week => {
        const zones = getZones(week.phase);
        const adaptive = adjustedWeekMap[week.w];
        const effectiveWeek = adaptive?.adjusted || week;
        const isAdjusted = !!(adaptive?.changed?.length);
        const isOverridden = paceOverrides[week.phase] && Object.keys(paceOverrides[week.phase]).length > 0;
        const isCurrentWeek = week.w === currentWeek;
        const isOpen = openWeek === week.w;
        const phaseColor = zones.color;
        const startDate = new Date(PROFILE.startDate);
        startDate.setDate(startDate.getDate() + (week.w - 1) * 7);
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + 6);
        const weekDateStr = `${fmtDate(startDate)} – ${fmtDate(endDate)}`;

        return (
          <div key={week.w} style={{ border:`1px solid ${isCurrentWeek ? phaseColor+"60" : week.race ? phaseColor+"40" : "#1e293b"}`, borderRadius:10, marginBottom:"0.4rem", overflow:"hidden", background: isCurrentWeek ? `${phaseColor}08` : "#0d1117" }}>
            <div className="hov" onClick={() => setOpenWeek(isOpen ? null : week.w)}
              style={{ display:"flex", alignItems:"center", padding:"0.75rem 1rem", gap:"0.75rem", background: isOpen?"rgba(255,255,255,0.025)":"transparent" }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.2rem", color: isCurrentWeek ? phaseColor : "#2d3748", minWidth:32 }}>
                {week.race ? "🏁" : `W${week.w}`}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:"0.68rem", color:"#e2e8f0" }}>{week.label}</div>
                <div style={{ fontSize:"0.56rem", color:"#334155", marginTop:1 }}>{weekDateStr}</div>
                {weekNotes[week.w] && (
                  <div style={{ fontSize:"0.55rem", color:C.amber, marginTop:2 }}>↩ {weekNotes[week.w]}</div>
                )}
                {isAdjusted && <div style={{ fontSize:"0.55rem", color:C.blue, marginTop:2 }}>Coach adjusted: {adaptive.changed[0]}</div>}
              </div>
              {isCurrentWeek && <div className="tag" style={{ background:`${phaseColor}20`, border:`1px solid ${phaseColor}40`, color:phaseColor }}>NOW</div>}
              {isOverridden && <div className="tag" style={{ background:`${C.amber}15`, border:`1px solid ${C.amber}30`, color:C.amber }}>ADJUSTED</div>}
              {isAdjusted && <div className="tag" style={{ background:`${C.blue}15`, border:`1px solid ${C.blue}30`, color:C.blue }}>COACH ADJUSTED</div>}
              <div className="tag" style={{ background:`${phaseColor}12`, border:`1px solid ${phaseColor}25`, color:phaseColor }}>{week.phase}</div>
              <div style={{ display:"flex", gap:3 }}>
                {["M","T","W","T","F","S","S"].map((d,i) => (
                  <div key={i} title={d} style={{ width:6, height:6, borderRadius:"50%", background:[C.green,C.amber,C.blue,C.red,C.lime,C.red,"#1e293b"][i], opacity:0.8 }} />
                ))}
              </div>
              <div style={{ color:"#2d3748", fontSize:"0.65rem" }}>{isOpen?"▲":"▼"}</div>
            </div>

            {isOpen && (
              <div className="fi" style={{ padding:"0 0.85rem 0.85rem" }}>
                <div style={{ display:"grid", gap:"0.35rem" }}>
                  {[
                    { day:"MON", color:C.green,  content:`Easy Run ${effectiveWeek.mon.d} @ ${zones.easy}/mi`, baseline: week.mon.d, tags:["EASY RUN","STR "+( week.str||"A")] },
                    { day:"TUE", color:C.amber,  content:"Orange Theory — Hybrid", tags:["OTF"] },
                    { day:"WED", color:C.blue,   content:"Strength B + Achilles Prehab", tags:["STRENGTH","PREHAB"] },
                    { day:"THU", color:C.red,    content:`${effectiveWeek.thu.t}: ${effectiveWeek.thu.d} @ ${effectiveWeek.thu.t==="Intervals"?zones.int:zones.tempo}/mi`, baseline: `${week.thu.t}: ${week.thu.d}`, tags:[effectiveWeek.thu.t.toUpperCase()] },
                    { day:"FRI", color:C.lime,   content:`Easy Run ${effectiveWeek.fri.d} @ ${zones.easy}/mi`, baseline: week.fri.d, tags:["EASY RUN"] },
                    { day:"SAT", color:C.red,    content:`Long Run ${effectiveWeek.sat.d} @ ${zones.long}/mi`, baseline: week.sat.d, tags:["LONG RUN"] },
                    { day:"SUN", color:C.slate,  content:"Full Rest + Achilles Prehab", tags:["REST"] },
                  ].map(d => (
                    <div key={d.day} style={{ display:"flex", gap:"0.6rem", alignItems:"center", padding:"6px 8px", background:"#0f172a", borderRadius:7 }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.1rem", color:d.color, minWidth:32 }}>{d.day}</div>
                      <div style={{ flex:1, fontSize:"0.65rem", color:"#cbd5e1" }}>
                        {d.content}
                        {isAdjusted && d.baseline && d.baseline !== d.content && <div style={{ fontSize:"0.53rem", color:"#475569" }}>baseline: {d.baseline}</div>}
                      </div>
                      <div style={{ display:"flex", gap:3, flexWrap:"wrap" }}>
                        {d.tags.map(t => <div key={t} className="tag" style={{ background:`${d.color}12`, border:`1px solid ${d.color}25`, color:d.color }}>{t}</div>)}
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ display:"flex", gap:"0.5rem", marginTop:"0.5rem", flexWrap:"wrap" }}>
                  {[["EASY",zones.easy,C.green],["TEMPO",zones.tempo,C.blue],["INT",zones.int,C.amber],["LONG",zones.long,C.red]].map(([l,v,c]) => (
                    <div key={l} className="tag" style={{ background:`${c}12`, border:`1px solid ${c}25`, color:c }}>{l}: {v}/mi</div>
                  ))}
                </div>
                {isAdjusted && (
                  <div style={{ marginTop:"0.45rem", fontSize:"0.58rem", color:"#94a3b8", lineHeight:1.6 }}>
                    Why this changed: {adaptive.changed.join(" · ")}.
                    {signals.bwDropFast && <span style={{ color:C.amber }}> Bodyweight trend is dropping quickly — recovery fuel warning active.</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── LOG TAB ───────────────────────────────────────────────────────────────────
function LogTab({ logs, saveLogs, bodyweights, saveBodyweights, currentWeek, todayWorkout, exportData, importData }) {
  const today = new Date().toISOString().split("T")[0];
  const [form, setForm] = useState({ date:today, type: todayWorkout?.label||"", miles:"", pace:"", runTime:"", pushups:"", weight:"", notes:"", feel:"3", location:"home" });
  const [saved, setSaved] = useState(false);
  const [bwInput, setBwInput] = useState("");
  const [backupStr, setBackupStr] = useState("");
  const [backupMsg, setBackupMsg] = useState("");
  const [showBackup, setShowBackup] = useState(false);
  const [copied, setCopied] = useState(false);

  // Auto-calculate pace from miles + time (mm:ss or h:mm:ss)
  const calcPace = (miles, timeStr) => {
    if (!miles || !timeStr) return "";
    const parts = timeStr.trim().split(":").map(Number);
    let totalMins = 0;
    if (parts.length === 2) totalMins = parts[0] + parts[1] / 60;
    else if (parts.length === 3) totalMins = parts[0] * 60 + parts[1] + parts[2] / 60;
    else return "";
    if (isNaN(totalMins) || totalMins <= 0 || parseFloat(miles) <= 0) return "";
    const paceDecimal = totalMins / parseFloat(miles);
    const mins = Math.floor(paceDecimal);
    const secs = Math.round((paceDecimal - mins) * 60);
    return mins + ":" + String(secs).padStart(2, "0");
  };

  const handleTimeChange = (val) => {
    const newPace = calcPace(form.miles, val);
    setForm({ ...form, runTime: val, pace: newPace || form.pace });
  };

  const handleMilesChange = (val) => {
    const newPace = calcPace(val, form.runTime);
    setForm({ ...form, miles: val, pace: newPace || form.pace });
  };

  const handleSave = async () => {
    if (!form.date) return;
    const newLogs = { ...logs, [form.date]: { ...form, ts: Date.now() } };
    await saveLogs(newLogs);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const handleBW = async () => {
    if (!bwInput) return;
    const entry = { date: today, w: parseFloat(bwInput) };
    const newArr = [...bodyweights.filter(b => b.date !== today), entry].sort((a,b) => a.date.localeCompare(b.date));
    await saveBodyweights(newArr);
    setBwInput("");
  };

  const delLog = async (date) => {
    const newLogs = { ...logs };
    delete newLogs[date];
    await saveLogs(newLogs);
  };

  return (
    <div className="fi">
      {/* Log form */}
      <div className="card" style={{ marginBottom:"1rem" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.85rem" }}>LOG WORKOUT</div>
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.5rem", marginBottom:"0.5rem" }}>
          <div>
            <div style={{ fontSize:"0.58rem", color:"#475569", marginBottom:4, letterSpacing:"0.1em" }}>DATE</div>
            <input type="date" value={form.date} onChange={e=>setForm({...form,date:e.target.value})} />
          </div>
          <div>
            <div style={{ fontSize:"0.58rem", color:"#475569", marginBottom:4, letterSpacing:"0.1em" }}>WORKOUT TYPE</div>
            <select value={form.type} onChange={e=>setForm({...form,type:e.target.value})}>
              <option value="">— select —</option>
              <optgroup label="Running">
                <option>Easy Run</option>
                <option>Tempo Run</option>
                <option>Interval Run</option>
                <option>Long Run</option>
                <option>Race Pace Tune-up</option>
                <option>Shakeout Run</option>
              </optgroup>
              <optgroup label="Training">
                <option>Orange Theory (OTF)</option>
                <option>Travel Hybrid (Cardio + Strength)</option>
                <option>Strength A — Home</option>
                <option>Strength B — Home</option>
                <option>Strength A — Hotel</option>
                <option>Strength B — Hotel</option>
              </optgroup>
              <optgroup label="Recovery">
                <option>Achilles Prehab</option>
                <option>Rest + Mobility</option>
                <option>Walk</option>
              </optgroup>
              <optgroup label="Other">
                <option>Race</option>
                <option>Other</option>
              </optgroup>
            </select>
          </div>
          <div>
            <div style={{ fontSize:"0.58rem", color:"#475569", marginBottom:4, letterSpacing:"0.1em" }}>MILES RUN</div>
            <input type="number" step="0.1" value={form.miles} onChange={e=>handleMilesChange(e.target.value)} placeholder="e.g. 5.2" />
          </div>
          <div>
            <div style={{ fontSize:"0.58rem", color:"#475569", marginBottom:4, letterSpacing:"0.1em" }}>TOTAL TIME</div>
            <input value={form.runTime} onChange={e=>handleTimeChange(e.target.value)} placeholder="e.g. 48:30 or 1:05:00" />
          </div>
          <div style={{ gridColumn:"1 / -1" }}>
            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:4 }}>
              <div style={{ fontSize:"0.58rem", color:"#475569", letterSpacing:"0.1em" }}>PACE (min/mi)</div>
              {form.miles && form.runTime && calcPace(form.miles, form.runTime) && (
                <div style={{ fontSize:"0.56rem", color:C.green }}>
                  ✓ auto-calculated from time + miles
                </div>
              )}
            </div>
            <input
              value={form.pace}
              onChange={e=>setForm({...form,pace:e.target.value})}
              placeholder="Auto-fills from time + miles, or type manually"
              style={{ borderColor: form.miles && form.runTime && calcPace(form.miles, form.runTime) ? C.green + "60" : "#1e293b" }}
            />
          </div>
          <div>
            <div style={{ fontSize:"0.58rem", color:"#475569", marginBottom:4, letterSpacing:"0.1em" }}>MAX PUSH-UPS (set)</div>
            <input type="number" value={form.pushups} onChange={e=>setForm({...form,pushups:e.target.value})} placeholder="e.g. 35" />
          </div>
          <div>
            <div style={{ fontSize:"0.58rem", color:"#475569", marginBottom:4, letterSpacing:"0.1em" }}>LOCATION</div>
            <select value={form.location} onChange={e=>setForm({...form,location:e.target.value})}>
              <option value="home">Home</option>
              <option value="hotel">Hotel / Travel</option>
              <option value="otf">Orange Theory</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom:"0.5rem" }}>
          <div style={{ fontSize:"0.58rem", color:"#475569", marginBottom:4, letterSpacing:"0.1em" }}>HOW DID IT FEEL? (1–5)</div>
          <div style={{ display:"flex", gap:"0.4rem" }}>
            {[1,2,3,4,5].map(n => (
              <button key={n} className="btn" onClick={()=>setForm({...form,feel:String(n)})}
                style={{ flex:1, color:[C.red,C.amber,C.blue,C.green,C.green][n-1], borderColor: form.feel===String(n) ? [C.red,C.amber,C.blue,C.green,C.green][n-1] : "#1e293b", background: form.feel===String(n) ? `${[C.red,C.amber,C.blue,C.green,C.green][n-1]}15` : "transparent" }}>
                {n}
              </button>
            ))}
          </div>
          <div style={{ display:"flex", gap:"1rem", marginTop:4, fontSize:"0.55rem", color:"#334155" }}>
            <span>1 = rough</span><span>3 = solid</span><span>5 = crushed it</span>
          </div>
        </div>
        <div style={{ marginBottom:"0.75rem" }}>
          <div style={{ fontSize:"0.58rem", color:"#475569", marginBottom:4, letterSpacing:"0.1em" }}>NOTES (optional)</div>
          <textarea rows={2} value={form.notes} onChange={e=>setForm({...form,notes:e.target.value})} placeholder="How were the intervals? Any aches? PR'd on push-ups?" style={{ resize:"vertical" }} />
        </div>
        <button className="btn btn-primary" onClick={handleSave} style={{ width:"100%" }}>
          {saved ? "✓ SAVED" : "SAVE WORKOUT"}
        </button>
        <BackupRestore
          exportData={exportData} importData={importData}
          logs={logs} bodyweights={bodyweights}
          backupStr={backupStr} setBackupStr={setBackupStr}
          backupMsg={backupMsg} setBackupMsg={setBackupMsg}
          showBackup={showBackup} setShowBackup={setShowBackup}
          copied={copied} setCopied={setCopied}
        />
      </div>

      {/* Bodyweight log */}
      <div className="card" style={{ marginBottom:"1rem" }}>
        <div className="sect-title" style={{ color:C.amber, marginBottom:"0.75rem" }}>LOG BODYWEIGHT</div>
        <div style={{ display:"flex", gap:"0.5rem" }}>
          <input type="number" step="0.1" value={bwInput} onChange={e=>setBwInput(e.target.value)} placeholder={`Today's weight (lbs) — start: ${PROFILE.weight}`} />
          <button className="btn btn-primary" onClick={handleBW} style={{ whiteSpace:"nowrap", flexShrink:0 }}>SAVE</button>
        </div>
        {bodyweights.length > 1 && (
          <div style={{ marginTop:"0.75rem" }}>
            <div style={{ fontSize:"0.58rem", color:"#475569", marginBottom:"0.4rem", letterSpacing:"0.1em" }}>WEIGHT TREND</div>
            <MiniChart data={bodyweights.map(b=>b.w)} color={C.green} baseline={PROFILE.weight} />
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.58rem", color:"#334155", marginTop:4 }}>
              <span>Start: {PROFILE.weight} lbs</span>
              <span>Latest: {bodyweights[bodyweights.length-1].w} lbs</span>
              <span style={{ color: bodyweights[bodyweights.length-1].w < PROFILE.weight ? C.green : C.red }}>
                {bodyweights[bodyweights.length-1].w < PROFILE.weight ? "↓" : "↑"} {Math.abs(PROFILE.weight - bodyweights[bodyweights.length-1].w).toFixed(1)} lbs
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Past logs */}
      {Object.keys(logs).length > 0 && (
        <div className="card">
          <div className="sect-title" style={{ color:C.blue, marginBottom:"0.75rem" }}>WORKOUT HISTORY ({Object.keys(logs).length} sessions)</div>
          <div style={{ display:"grid", gap:"0.35rem" }}>
            {Object.entries(logs).sort((a,b)=>b[0].localeCompare(a[0])).map(([date,log]) => (
              <div key={date} style={{ display:"flex", gap:"0.5rem", alignItems:"flex-start", padding:"8px 10px", background:"#0f172a", borderRadius:7 }}>
                <div style={{ fontSize:"0.6rem", color:"#334155", minWidth:72, marginTop:2 }}>
                  {new Date(date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:"0.68rem", color:"#e2e8f0" }}>{log.type}</div>
                  <div style={{ display:"flex", gap:"0.5rem", marginTop:3, flexWrap:"wrap" }}>
                    {log.miles && <span style={{ fontSize:"0.58rem", color:C.green }}>{log.miles} mi</span>}
                    {log.pace && <span style={{ fontSize:"0.58rem", color:C.blue }}>{log.pace}/mi</span>}
                    {log.pushups && <span style={{ fontSize:"0.58rem", color:C.amber }}>{log.pushups} push-ups</span>}
                    {log.location && log.location !== "home" && <span style={{ fontSize:"0.58rem", color:C.purple }}>{log.location}</span>}
                    {log.notes && <span style={{ fontSize:"0.58rem", color:"#334155" }}>{log.notes.substring(0,50)}{log.notes.length>50?"...":""}</span>}
                  </div>
                </div>
                {log.feel && (
                  <div style={{ fontSize:"0.7rem", color:[C.red,C.amber,C.blue,C.green,C.green][log.feel-1]||"#475569", minWidth:14 }}>
                    {"●".repeat(parseInt(log.feel))}
                  </div>
                )}
                <button className="btn" onClick={()=>delLog(date)} style={{ fontSize:"0.55rem", color:"#334155", padding:"2px 6px", flexShrink:0 }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── STORAGE DEBUG ────────────────────────────────────────────────────────────
function BackupRestore({ exportData, importData, logs, bodyweights, backupStr, setBackupStr, backupMsg, setBackupMsg, showBackup, setShowBackup, copied, setCopied }) {
  const logCount = Object.keys(logs).length;
  const bwCount = bodyweights.length;

  const handleCopy = () => {
    const str = exportData();
    navigator.clipboard.writeText(str).then(() => {
      setCopied(true);
      setBackupMsg("Copied! Paste into your Notes app to save.");
      setTimeout(() => { setCopied(false); setBackupMsg(""); }, 3000);
    }).catch(() => {
      // Fallback: show the string for manual copy
      setBackupStr(exportData());
      setBackupMsg("Long-press the text below and copy it:");
    });
  };

  const handleRestore = async () => {
    if (!backupStr.trim()) { setBackupMsg("Paste your backup code above first."); return; }
    setBackupMsg("Restoring and syncing to cloud...");
    const ok = await importData(backupStr);
    if (ok) {
      setBackupMsg("✓ Restored and saved to cloud!");
      setBackupStr("");
      setTimeout(() => setBackupMsg(""), 3000);
    } else {
      setBackupMsg("Invalid backup code or sync failed. Check your connection.");
    }
  };

  return (
    <div style={{ marginTop:"0.75rem", border:"1px solid #1e293b", borderRadius:8, overflow:"hidden" }}>
      <div className="hov" onClick={() => setShowBackup(!showBackup)}
        style={{ padding:"0.65rem 0.85rem", display:"flex", justifyContent:"space-between", alignItems:"center", cursor:"pointer" }}>
        <div>
          <div style={{ fontSize:"0.62rem", color:C.amber, letterSpacing:"0.1em" }}>BACKUP & RESTORE</div>
          <div style={{ fontSize:"0.56rem", color:"#334155", marginTop:2 }}>
            {logCount > 0 ? logCount + " workouts in memory" : "No workouts logged yet"}
            {bwCount > 0 ? " · " + bwCount + " weight entries" : ""}
          </div>
        </div>
        <div style={{ fontSize:"0.65rem", color:"#334155" }}>{showBackup ? "▲" : "▼"}</div>
      </div>

      {showBackup && (
        <div className="fi" style={{ padding:"0.75rem", borderTop:"1px solid #1e293b", background:"#09090f" }}>
          {/* How it works */}
          <div style={{ fontSize:"0.62rem", color:"#475569", lineHeight:1.7, marginBottom:"0.75rem", background:"#0f172a", borderRadius:6, padding:"0.6rem" }}>
            <span style={{ color:C.amber }}>How to keep your data: </span>
            After logging, tap <span style={{ color:"#e2e8f0" }}>COPY BACKUP</span> and paste it into your Notes app. Next time you open this dashboard, paste it into the restore box and tap <span style={{ color:"#e2e8f0" }}>RESTORE</span>. Takes 5 seconds.
          </div>

          {/* Copy backup */}
          <button
            onClick={handleCopy}
            disabled={logCount === 0}
            style={{ width:"100%", background: logCount > 0 ? C.amber : "#1e293b", border:"none", borderRadius:7, padding:"0.7rem", fontFamily:"'DM Mono',monospace", fontSize:"0.68rem", color: logCount > 0 ? "#0a0a0f" : "#334155", cursor: logCount > 0 ? "pointer" : "default", marginBottom:"0.5rem", fontWeight:500, letterSpacing:"0.08em" }}>
            {copied ? "✓ COPIED TO CLIPBOARD" : "COPY BACKUP (" + logCount + " workouts)"}
          </button>

          {/* Fallback display for manual copy */}
          {backupStr && backupMsg.includes("Long-press") && (
            <textarea
              readOnly
              value={backupStr}
              style={{ marginBottom:"0.5rem", fontSize:"0.5rem", height:60, resize:"none", color:"#475569" }}
            />
          )}

          {/* Restore input */}
          <div style={{ fontSize:"0.58rem", color:"#475569", marginBottom:"0.3rem", letterSpacing:"0.08em" }}>PASTE BACKUP CODE TO RESTORE</div>
          <textarea
            value={backupStr}
            onChange={e => setBackupStr(e.target.value)}
            placeholder="Paste your backup code here..."
            style={{ marginBottom:"0.5rem", fontSize:"0.58rem", height:55, resize:"none" }}
          />
          <button
            onClick={handleRestore}
            style={{ width:"100%", background:"transparent", border:"1px solid " + C.green + "50", borderRadius:7, padding:"0.6rem", fontFamily:"'DM Mono',monospace", fontSize:"0.65rem", color:C.green, cursor:"pointer", letterSpacing:"0.08em" }}>
            RESTORE FROM BACKUP
          </button>

          {backupMsg && (
            <div style={{ marginTop:"0.5rem", fontSize:"0.62rem", color: backupMsg.includes("success") || backupMsg.includes("Copied") ? C.green : backupMsg.includes("Invalid") ? C.red : C.amber, lineHeight:1.6 }}>
              {backupMsg}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── MINI CHART ────────────────────────────────────────────────────────────────
function MiniChart({ data, color, baseline }) {
  if (data.length < 2) return null;
  const min = Math.min(...data, baseline) - 2;
  const max = Math.max(...data, baseline) + 2;
  const w = 300, h = 50;
  const pts = data.map((v,i) => {
    const x = (i / (data.length-1)) * w;
    const y = h - ((v - min) / (max - min)) * h;
    return `${x},${y}`;
  });
  const baselineY = h - ((baseline - min) / (max - min)) * h;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} style={{ width:"100%", height:50 }}>
      <line x1={0} y1={baselineY} x2={w} y2={baselineY} stroke="#1e293b" strokeWidth={1} strokeDasharray="4,4" />
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={2} />
      {data.map((v,i) => {
        const x = (i/(data.length-1))*w;
        const y = h - ((v-min)/(max-min))*h;
        return <circle key={i} cx={x} cy={y} r={3} fill={color} />;
      })}
    </svg>
  );
}

const LOCAL_PLACE_TEMPLATES = {
  Chicago: {
    fastCasual: [
      { name: "Chipotle", meal: "Double chicken bowl, white rice, fajita veg, pico", tag: "high protein + carb control" },
      { name: "Sweetgreen", meal: "Protein plate + roasted sweet potato + greens", tag: "lean protein + fiber" },
      { name: "CAVA", meal: "Greens + rice + double chicken + hummus", tag: "balanced carbs/fat/protein" },
      { name: "Roti", meal: "Chicken plate, rice, roasted veg, tahini on side", tag: "repeatable performance meal" },
      { name: "Nando's", meal: "Quarter chicken + peri rice + side greens", tag: "simple dinner fallback" },
    ],
    groceries: {
      "Trader Joe's": ["Pre-cooked grilled chicken", "Microwave jasmine rice", "Greek yogurt cups", "Frozen berries", "Bagged salad kits", "Egg white cartons"],
      "Whole Foods": ["365 rotisserie chicken", "Prepared quinoa bowls", "Salmon portions", "Skyr yogurt", "Ready-cut fruit", "Overnight oats"],
      "Jewel": ["Deli turkey breast", "Microwave potatoes", "Fairlife shakes", "Steam-in-bag veggies", "Oikos triple zero", "Bananas"],
      "Target": ["Good & Gather chicken strips", "Kodiak oatmeal cups", "Core Power shakes", "Frozen veggie blend", "Avocado cups", "Protein bars"],
    },
    convenience: ["Starbucks egg bites + protein box", "7-Eleven Greek yogurt + nuts + fruit", "Airport: salad + double protein"],
  }
};

const explainMacroShift = (dayType) => {
  if (["longRun", "hardRun", "travelRun"].includes(dayType)) return "Higher carbs support quality run output and glycogen restoration. Fat stays moderate to keep digestion smooth around sessions.";
  if (["rest", "travelRest"].includes(dayType)) return "Carbs come down on lower-output days while protein stays high to protect recovery and body composition.";
  return "Balanced carbs and fats support consistent training energy without overcomplicating daily choices.";
};

const getPlaceRecommendations = ({ city, dayType, favorites, mode, query }) => {
  const cityData = LOCAL_PLACE_TEMPLATES[city] || LOCAL_PLACE_TEMPLATES.Chicago;
  const base = mode === "nearby" ? cityData.fastCasual : cityData.fastCasual;
  const filtered = query ? base.filter(p => (p.name + " " + p.meal).toLowerCase().includes(query.toLowerCase())) : base;
  const favoriteBoost = [...(favorites.restaurants || []), ...(favorites.safeMeals || [])].slice(0, 2).map(f => ({ name: f.name || f, meal: f.meal || "Saved default meal", tag: "favorite" }));
  return [...favoriteBoost, ...filtered].slice(0, 6).map((p, idx) => ({ ...p, id: `${p.name}_${idx}_${dayType}` }));
};

const buildGroceryBasket = ({ store, city, days, dayType }) => {
  const cityData = LOCAL_PLACE_TEMPLATES[city] || LOCAL_PLACE_TEMPLATES.Chicago;
  const items = cityData.groceries[store] || cityData.groceries["Trader Joe's"];
  return {
    title: `${store} ${days}-day basket`,
    items: items.slice(0, 6),
    note: dayType === "longRun" || dayType === "hardRun" ? "Include extra quick carbs (fruit + rice + oats)." : "Prioritize protein + produce + simple carbs.",
  };
};

// ── NUTRITION TAB ─────────────────────────────────────────────────────────────
function NutritionTab({ todayWorkout, personalization, goals, momentum, bodyweights, learningLayer, nutritionLayer, nutritionFavorites, saveNutritionFavorites, nutritionFeedback, saveNutritionFeedback }) {
  const [mode, setMode] = useState("home");
  const [dayType, setDayType] = useState(nutritionLayer.dayType || todayWorkout?.nutri || "easyRun");
  const [query, setQuery] = useState("");
  const [store, setStore] = useState(personalization.localFoodContext.groceryOptions?.[0] || "Trader Joe's");
  const [liveNearby, setLiveNearby] = useState([]);
  const [placesStatus, setPlacesStatus] = useState("template");
  const favorites = nutritionFavorites || { restaurants: [], groceries: [], safeMeals: [], travelMeals: [], defaultMeals: [] };
  const [nutritionCheck, setNutritionCheck] = useState({ status: "on_track", issue: "", note: "" });
  const [lastKey, setLastKey] = useState("");
  const goalContext = getGoalContext(goals);
  const arbitration = arbitrateGoals({ goals, momentum, personalization });
  const adaptiveForSelected = deriveAdaptiveNutrition({ todayWorkout: { ...todayWorkout, type: dayType === "rest" ? "rest" : todayWorkout?.type }, goals, momentum, personalization, bodyweights, learningLayer, nutritionFeedback, coachPlanAdjustments: { extra: {} }, salvageLayer: { active: false } });
  const targets = dayType === nutritionLayer.dayType ? nutritionLayer.targets : adaptiveForSelected.targets;
  const calRange = dayType === nutritionLayer.dayType ? nutritionLayer.calRange : adaptiveForSelected.calRange;
  const proteinTarget = dayType === nutritionLayer.dayType ? nutritionLayer.proteinTarget : `${targets.p}-${targets.p + 10}g`;
  const carbGuidance = dayType === nutritionLayer.dayType ? nutritionLayer.carbGuidance : adaptiveForSelected.carbGuidance;
  const fatGuidance = dayType === nutritionLayer.dayType ? nutritionLayer.fatGuidance : adaptiveForSelected.fatGuidance;
  const hydration = dayType === nutritionLayer.dayType ? nutritionLayer.hydration : adaptiveForSelected.hydration;
  const fueling = dayType === nutritionLayer.dayType ? nutritionLayer.fueling : adaptiveForSelected.fueling;
  const mealStructure = dayType === nutritionLayer.dayType ? nutritionLayer.mealStructure : adaptiveForSelected.mealStructure;
  const tradeoff = dayType === nutritionLayer.dayType ? nutritionLayer.tradeoff : adaptiveForSelected.tradeoff;
  const whyLine = dayType === nutritionLayer.dayType ? nutritionLayer.why : adaptiveForSelected.why;
  const macroWhy = explainMacroShift(dayType);
  const city = personalization.localFoodContext.city || "Chicago";
  const nearbyTemplate = getPlaceRecommendations({ city, dayType, favorites, mode: "nearby", query }).filter(x => x.id !== lastKey);
  const nearby = liveNearby.length ? liveNearby : nearbyTemplate;
  const basket = buildGroceryBasket({ store, city, days: 3, dayType });
  const fastest = nearby[0] || { name: "Saved default", meal: "Protein shake + fruit + sandwich", tag: "fallback" };
  const travelBreakfast = ["Starbucks: egg bites + oatmeal + banana", "Hotel breakfast: eggs + Greek yogurt + fruit", "Airport: wrap + extra protein + water"];

  const todayKey = new Date().toISOString().split("T")[0];
  const feedbackToday = nutritionFeedback?.[todayKey];
  useEffect(() => { if (feedbackToday) setNutritionCheck(feedbackToday); }, [feedbackToday?.ts]);

  useEffect(() => {
    let active = true;
    (async () => {
      const api = typeof window !== "undefined" ? window.__TRAINER_CONFIG?.placesApi : null;
      if (!api || mode !== "nearby") { setLiveNearby([]); setPlacesStatus("template"); return; }
      try {
        const res = await safeFetchWithTimeout(`${api}?q=${encodeURIComponent(query || "healthy high protein meals")}&city=${encodeURIComponent(city)}`, {}, 4500);
        if (!res.ok) throw new Error("places unavailable");
        const data = await res.json();
        if (!active) return;
        setLiveNearby((data?.results || []).slice(0, 6).map((r, i) => ({ id:`live_${i}_${r.name}`, name:r.name, meal:r.reco || "Lean protein + carb-balanced bowl", tag:"live nearby" })));
        setPlacesStatus("live");
      } catch {
        if (!active) return;
        setLiveNearby([]);
        setPlacesStatus("template");
      }
    })();
    return () => { active = false; };
  }, [mode, query, city]);

  return (
    <div className="fi">
      <div style={{ display:"flex", gap:"0.35rem", marginBottom:"0.8rem", flexWrap:"wrap" }}>
        {["home","travel","grocery","nearby"].map(m => (
          <button key={m} className="btn" onClick={()=>setMode(m)}
            style={{ color:mode===m?"#0a0a0f":C.amber, background:mode===m?C.amber:"transparent", borderColor:mode===m?C.amber:"#1e293b", fontSize:"0.58rem" }}>
            {m.toUpperCase()} MODE
          </button>
        ))}
      </div>

      <div style={{ display:"flex", gap:"0.3rem", marginBottom:"0.8rem", flexWrap:"wrap" }}>
        {Object.entries(NUTRITION).map(([k,v]) => (
          <button key={k} className="btn" onClick={()=>setDayType(k)}
            style={{ color:dayType===k?"#0a0a0f":C.green, background:dayType===k?C.green:"transparent", borderColor:dayType===k?C.green:"#1e293b", fontSize:"0.55rem" }}>
            {v.label}
          </button>
        ))}
      </div>

      <div className="card" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.55rem" }}>TODAY'S NUTRITION TARGET</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"0.4rem" }}>
          {[["CAL",calRange,C.amber],["P",targets.p+"g",C.red],["C",targets.c+"g",C.green],["F",targets.f+"g",C.blue]].map(([l,v,col])=>(
            <div key={l} style={{ background:"#0f172a", border:`1px solid ${col}30`, borderRadius:8, textAlign:"center", padding:"0.55rem 0.45rem" }}>
              <div style={{ fontFamily:"'Bebas Neue',sans-serif", color:col, fontSize:"1.2rem" }}>{v}</div>
              <div style={{ fontSize:"0.53rem", color:"#334155" }}>{l}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:"0.55rem", fontSize:"0.59rem", color:"#94a3b8", lineHeight:1.7 }}>
          Why today's macros changed: {macroWhy}
        </div>
        <div style={{ marginTop:"0.35rem", fontSize:"0.58rem", color:"#94a3b8" }}>Protein target: {proteinTarget}</div>
        <div style={{ marginTop:"0.2rem", fontSize:"0.56rem", color:"#64748b" }}>{carbGuidance}</div>
        <div style={{ marginTop:"0.2rem", fontSize:"0.56rem", color:"#64748b" }}>{fatGuidance}</div>
        <div style={{ marginTop:"0.2rem", fontSize:"0.56rem", color:"#64748b" }}>{hydration}</div>
        <div style={{ marginTop:"0.2rem", fontSize:"0.56rem", color:"#64748b" }}>{fueling}</div>
        <div style={{ marginTop:"0.35rem", fontSize:"0.55rem", color:"#64748b" }}>
          Goal balance: primary {goalContext.primary?.name || "none"}; supporting {(goalContext.secondary||[]).map(g=>g.name).join(" · ") || "none"}.
        </div>
        <div style={{ marginTop:"0.2rem", fontSize:"0.54rem", color:"#475569" }}>
          Tradeoff this week: {tradeoff || arbitration.conflicts[0] || "No major conflicts"}.
        </div>
        <div style={{ marginTop:"0.2rem", fontSize:"0.54rem", color:"#475569" }}>
          Why this target: {whyLine}
        </div>
      </div>

      <div className="card" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.amber, marginBottom:"0.5rem" }}>SIMPLE MEAL STRUCTURE FOR TODAY</div>
        {mealStructure.map((x, i) => <div key={i} style={{ fontSize:"0.58rem", color:"#94a3b8", lineHeight:1.6 }}>• {x}</div>)}
      </div>

      <div className="card" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.55rem" }}>BEST NEARBY OPTIONS</div>
        <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Try: best nearby lunch options / high-protein dinner near me" style={{ marginBottom:"0.5rem" }} />
        <div style={{ fontSize:"0.54rem", color: placesStatus === "live" ? C.green : "#475569", marginBottom:"0.35rem" }}>
          Source: {placesStatus === "live" ? "Live places service" : "Saved favorites + local templates fallback"}
        </div>
        <div style={{ display:"grid", gap:"0.35rem" }}>
          {nearby.length ? nearby.map(p => (
            <div key={p.id} style={{ background:"#0f172a", borderRadius:7, padding:"7px 9px", display:"flex", justifyContent:"space-between", gap:"0.6rem" }}>
              <div>
                <div style={{ fontSize:"0.63rem", color:"#e2e8f0" }}>{p.name}</div>
                <div style={{ fontSize:"0.58rem", color:"#94a3b8", marginTop:2 }}>{p.meal}</div>
                <div style={{ fontSize:"0.54rem", color:"#475569" }}>{p.tag}</div>
              </div>
              <button className="btn" onClick={()=>{ setLastKey(p.id); saveNutritionFavorites({ ...favorites, restaurants: [{ name: p.name, meal: p.meal }, ...favorites.restaurants].slice(0, 8) }); }} style={{ color:C.green, borderColor:C.green+"30", fontSize:"0.52rem" }}>
                SAVE
              </button>
            </div>
          )) : <div style={{ fontSize:"0.6rem", color:"#475569" }}>No direct matches. Using saved defaults and curated local options.</div>}
        </div>
      </div>

      <div style={{ display:"grid", gap:"0.8rem", gridTemplateColumns:"1fr 1fr" }}>
        <div className="card">
          <div className="sect-title" style={{ color:C.purple, marginBottom:"0.5rem" }}>GROCERY FALLBACK</div>
          <select value={store} onChange={e=>setStore(e.target.value)} style={{ marginBottom:"0.45rem" }}>
            {[...new Set([...personalization.localFoodContext.groceryOptions, ...Object.keys(LOCAL_PLACE_TEMPLATES[city]?.groceries || {})])].map(s => <option key={s}>{s}</option>)}
          </select>
          <button className="btn" onClick={()=>saveNutritionFavorites({ ...favorites, groceries: [store, ...favorites.groceries.filter(g=>g!==store)].slice(0,6) })} style={{ fontSize:"0.52rem", color:C.green, borderColor:C.green+"35", marginBottom:"0.45rem" }}>
            SAVE STORE
          </button>
          <div style={{ fontSize:"0.58rem", color:"#94a3b8", marginBottom:"0.35rem" }}>{basket.title}</div>
          {basket.items.map((it,i)=><div key={i} style={{ fontSize:"0.58rem", color:"#64748b", lineHeight:1.6 }}>• {it}</div>)}
          <div style={{ marginTop:"0.35rem", fontSize:"0.55rem", color:"#475569" }}>{basket.note}</div>
        </div>

        <div className="card">
          <div className="sect-title" style={{ color:C.amber, marginBottom:"0.5rem" }}>TRAVEL FALLBACK</div>
          {travelBreakfast.map((t,i)=><div key={i} style={{ fontSize:"0.58rem", color:"#94a3b8", lineHeight:1.65 }}>• {t}</div>)}
          <button className="btn" onClick={()=>saveNutritionFavorites({ ...favorites, travelMeals: [...new Set([travelBreakfast[0], ...(favorites.travelMeals || [])])].slice(0, 8) })} style={{ marginTop:"0.4rem", fontSize:"0.52rem", color:C.green, borderColor:C.green+"35" }}>
            SAVE TRAVEL FALLBACK
          </button>
          <div style={{ marginTop:"0.45rem", fontSize:"0.58rem", color:"#64748b" }}>
            Travel breakfast near hotel: use nearest coffee chain + eggs/protein + fruit. Keep it repeatable.
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.5rem" }}>FASTEST GOOD OPTION</div>
        <div style={{ fontSize:"0.64rem", color:"#e2e8f0" }}>{fastest.name}</div>
        <div style={{ fontSize:"0.6rem", color:"#94a3b8", marginTop:2 }}>{fastest.meal}</div>
        <button className="btn" onClick={()=>saveNutritionFavorites({ ...favorites, safeMeals: [{ name: fastest.name, meal: fastest.meal }, ...favorites.safeMeals].slice(0,8) })} style={{ marginTop:"0.4rem", fontSize:"0.52rem", color:C.green, borderColor:C.green+"35" }}>
          SAVE SAFE DEFAULT MEAL
        </button>
        <div style={{ marginTop:"0.45rem", fontSize:"0.55rem", color:"#475569" }}>
          Practical rule: staple breakfast + varied lunch/dinner + one emergency default meal.
        </div>
      </div>
      <div className="card" style={{ marginTop:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.5rem" }}>NUTRITION FEEDBACK (OPTIONAL)</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.3rem", marginBottom:"0.35rem" }}>
          {[["on_track","on track"],["decent","decent"],["off_track","off track"]].map(([k,lab]) => (
            <button key={k} className="btn" onClick={()=>setNutritionCheck(prev=>({ ...prev, status:k }))}
              style={{ fontSize:"0.55rem", borderColor:nutritionCheck.status===k?C.blue:"#1e293b", color:nutritionCheck.status===k?C.blue:"#64748b" }}>{lab}</button>
          ))}
        </div>
        <select value={nutritionCheck.issue || ""} onChange={e=>setNutritionCheck(prev=>({ ...prev, issue:e.target.value }))} style={{ marginBottom:"0.35rem", fontSize:"0.56rem" }}>
          <option value="">Biggest issue (optional)</option>
          {["hunger","convenience","cravings","travel","social_eating","underprepared","low_appetite"].map(i => <option key={i} value={i}>{i.replaceAll("_"," ")}</option>)}
        </select>
        <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"0.35rem" }}>
          <input value={nutritionCheck.note || ""} onChange={e=>setNutritionCheck(prev=>({ ...prev, note:e.target.value }))} placeholder="Quick note (optional)" />
          <button className="btn btn-primary" onClick={()=>saveNutritionFeedback(todayKey, nutritionCheck)} style={{ fontSize:"0.55rem" }}>SAVE</button>
        </div>
      </div>
    </div>
  );
}

// ── COACH TAB ─────────────────────────────────────────────────────────────────
function CoachTab({ logs, currentWeek, todayWorkout, bodyweights, personalization, momentum, arbitration, expectations, strengthLayer, patterns, proactiveTriggers, onApplyTrigger, learningLayer, salvageLayer, nutritionLayer, nutritionFeedback, setPersonalization, coachActions, setCoachActions, coachPlanAdjustments, setCoachPlanAdjustments, weekNotes, setWeekNotes, planAlerts, setPlanAlerts, onPersist }) {
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
  const bottomRef = useRef(null);

  useEffect(() => {
    setMessages([{
      role:"assistant",
      packet: deterministicCoachPacket({ input: "status", todayWorkout, currentWeek, logs, bodyweights, personalization, learning: learningLayer, salvage: salvageLayer, momentum, strengthLayer, nutritionLayer, arbitration, expectations }),
      source: "deterministic"
    }]);
  }, []);

  const applyCoachAction = (action, runtime) => {
    const dateKey = new Date().toISOString().split("T")[0];
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

  const commitAction = async (action) => {
    const runtime = { adjustments: coachPlanAdjustments, weekNotes, planAlerts, personalization };
    const mutation = applyCoachAction(action, runtime);
    const nextActions = [{ ...action, id:`coach_act_${Date.now()}`, ts: Date.now(), source: "coach_confirmed" }, ...coachActions].slice(0, 60);
    setCoachActions(nextActions);
    setCoachPlanAdjustments(mutation.adjustments);
    setWeekNotes(mutation.weekNotes);
    setPlanAlerts(mutation.planAlerts);
    setPersonalization(mutation.personalization);
    await onPersist(mutation.personalization, nextActions, mutation.adjustments, mutation.weekNotes, mutation.planAlerts);
  };

  const getCoachResponse = async (userMsg) => {
    const deterministic = deterministicCoachPacket({ input: userMsg, todayWorkout, currentWeek, logs, bodyweights, personalization, learning: learningLayer, salvage: salvageLayer, momentum, strengthLayer, nutritionLayer, arbitration, expectations });
    if (coachMode === "deterministic" || !apiKey) return { ...deterministic, source: "deterministic" };
    try {
      const res = await safeFetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01"
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 700,
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
    "My Achilles feels tight",
    "I missed yesterday",
    "I’m traveling today",
    "I feel amazing this week",
    "I slept badly",
    "I want to push harder",
    "I’m not recovering well",
    "I need food near me",
    "Progress strength emphasis",
    "Reduce long-run aggressiveness",
    "Increase calories slightly",
    "Reduce deficit aggressiveness",
    "Shift carbs around workout",
    "Simplify meals this week",
    "Switch to travel nutrition mode",
    "Use default meal structure for 3 days",
  ];

  return (
    <div className="fi" style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 200px)", minHeight:400 }}>
      <div style={{ marginBottom:"0.55rem", display:"grid", gridTemplateColumns:"1fr auto auto", gap:"0.4rem", alignItems:"center" }}>
        <div style={{ fontSize:"0.58rem", color:"#64748b" }}>Coach mode ({momentum.coachMode})</div>
        <select value={coachMode} onChange={e=>setCoachMode(e.target.value)} style={{ fontSize:"0.58rem", padding:"4px 6px" }}>
          <option value="auto">AUTO</option>
          <option value="deterministic">DETERMINISTIC</option>
        </select>
        <input value={apiKey} onChange={e=>{ setApiKey(e.target.value); if (typeof window !== "undefined") localStorage.setItem("coach_api_key", e.target.value); }} placeholder="Anthropic key (optional)" style={{ fontSize:"0.56rem", padding:"4px 6px" }} />
      </div>

      <div style={{ marginBottom:"0.5rem", background:"#0d1117", border:"1px solid #1e293b", borderRadius:8, padding:"0.55rem 0.7rem" }}>
        <div style={{ fontSize:"0.56rem", color:C.blue, marginBottom:"0.3rem" }}>COACH MEMORY (EDITABLE)</div>
        <div style={{ display:"grid", gap:"0.3rem" }}>
          <input value={memoryDraft.failurePatterns} onChange={e=>setMemoryDraft({ ...memoryDraft, failurePatterns:e.target.value })} placeholder="Failure patterns" />
          <input value={memoryDraft.commonBarriers} onChange={e=>setMemoryDraft({ ...memoryDraft, commonBarriers:e.target.value })} placeholder="Common barriers/excuses" />
          <input value={memoryDraft.preferredFoodPatterns} onChange={e=>setMemoryDraft({ ...memoryDraft, preferredFoodPatterns:e.target.value })} placeholder="Preferred food patterns" />
          <input value={memoryDraft.simplicityVsVariety} onChange={e=>setMemoryDraft({ ...memoryDraft, simplicityVsVariety:e.target.value })} placeholder="Simplicity vs variety" />
          <button className="btn" onClick={async ()=>{
            const updated = mergePersonalization(personalization, { coachMemory: { ...personalization.coachMemory, failurePatterns: memoryDraft.failurePatterns.split(",").map(x=>x.trim()).filter(Boolean), commonBarriers: memoryDraft.commonBarriers.split(",").map(x=>x.trim()).filter(Boolean), preferredFoodPatterns: memoryDraft.preferredFoodPatterns.split(",").map(x=>x.trim()).filter(Boolean), simplicityVsVariety: memoryDraft.simplicityVsVariety } });
            setPersonalization(updated);
            await onPersist(updated, coachActions, coachPlanAdjustments, weekNotes, planAlerts);
          }} style={{ color:C.green, borderColor:C.green+"35" }}>
            SAVE MEMORY
          </button>
        </div>
        {patterns.length > 0 && <div style={{ marginTop:"0.35rem", fontSize:"0.55rem", color:"#64748b" }}>Detected patterns: {patterns.join(" · ")}</div>}
      </div>

      {/* Chat messages */}
      {proactiveTriggers.length > 0 && (
        <div style={{ marginBottom:"0.5rem", background:"#0d1117", border:"1px solid #1e293b", borderRadius:8, padding:"0.55rem 0.7rem" }}>
          <div style={{ fontSize:"0.56rem", color:C.amber, marginBottom:"0.3rem" }}>PROACTIVE COACH OUTREACH</div>
          {proactiveTriggers.map(t => (
            <div key={t.id} style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:"0.4rem", marginBottom:"0.2rem" }}>
              <div style={{ fontSize:"0.58rem", color:"#94a3b8", lineHeight:1.6 }}>• {t.msg}</div>
              <button className="btn" onClick={()=>onApplyTrigger(t)} style={{ fontSize:"0.5rem", color:C.green, borderColor:C.green+"30" }}>{t.actionLabel || "Apply"}</button>
            </div>
          ))}
        </div>
      )}
      <div style={{ marginBottom:"0.45rem", fontSize:"0.56rem", color:"#64748b", background:"#0d1117", border:"1px solid #1e293b", borderRadius:8, padding:"0.45rem 0.65rem" }}>
        Strength mode: {strengthLayer.focus} · Bench TM {strengthLayer.trainingMax} · {strengthLayer.tradeoff}
      </div>
      <div style={{ marginBottom:"0.45rem", fontSize:"0.56rem", color:"#94a3b8", background:"#0d1117", border:"1px solid #1e293b", borderRadius:8, padding:"0.45rem 0.65rem", lineHeight:1.7 }}>
        Goal arbitration: primary {arbitration.priorityStack.primary} · secondary {arbitration.priorityStack.secondary} · maintained {arbitration.priorityStack.maintained}. {arbitration.shiftReason}
      </div>
      <div style={{ marginBottom:"0.45rem", fontSize:"0.56rem", color:"#94a3b8", background:"#0d1117", border:"1px solid #1e293b", borderRadius:8, padding:"0.45rem 0.65rem", lineHeight:1.7 }}>
        Expectation outlook: {expectations.nextWindow} {expectations.conditionLine}
      </div>
      <div style={{ marginBottom:"0.45rem", fontSize:"0.56rem", color:"#64748b", background:"#0d1117", border:"1px solid #1e293b", borderRadius:8, padding:"0.45rem 0.65rem" }}>
        Learning bias: {learningLayer.adjustmentBias} · {(learningLayer.topObservations || []).slice(0,2).map(o => o.msg).join(" · ") || "Collecting check-ins."}
      </div>
      <div style={{ marginBottom:"0.45rem", fontSize:"0.56rem", color:"#64748b", background:"#0d1117", border:"1px solid #1e293b", borderRadius:8, padding:"0.45rem 0.65rem" }}>
        Nutrition strategy: {nutritionLayer.calRange} cal · {nutritionLayer.carbGuidance} · {nutritionLayer.tradeoff}
      </div>
      <div style={{ marginBottom:"0.45rem", fontSize:"0.56rem", color:salvageLayer.active ? C.amber : "#64748b", background:"#0d1117", border:`1px solid ${salvageLayer.active ? C.amber+"40" : "#1e293b"}`, borderRadius:8, padding:"0.45rem 0.65rem" }}>
        Salvage mode: {salvageLayer.active ? `ON — ${salvageLayer.triggerReasons.join(" · ")}` : "OFF"}.
      </div>
      <div style={{ flex:1, overflowY:"auto", display:"flex", flexDirection:"column", gap:"0.6rem", paddingBottom:"0.75rem", paddingRight:"0.25rem" }}>
        {messages.map((msg, i) => (
          <div key={i} style={{ display:"flex", justifyContent:msg.role==="user"?"flex-end":"flex-start" }}>
            <div style={{
              maxWidth:"82%",
              padding:"0.7rem 0.9rem",
              borderRadius:msg.role==="user"?"10px 10px 3px 10px":"10px 10px 10px 3px",
              background:msg.role==="user"?"#0f2a1a":  "#0d1117",
              border:`1px solid ${msg.role==="user"?C.green+"40":"#1e293b"}`,
              fontSize:"0.68rem",
              color:msg.role==="user"?"#e2e8f0":"#cbd5e1",
              lineHeight:1.75,
            }}>
              {msg.role==="assistant" && <div style={{ fontSize:"0.55rem", color:C.green, letterSpacing:"0.12em", marginBottom:"0.35rem" }}>COACH · {msg.source || "deterministic"}</div>}
              {msg.role === "assistant" ? (
                <div style={{ display:"grid", gap:"0.4rem" }}>
                  <CoachSection title="WHAT I NOTICED" items={msg.packet?.notices || []} color={C.blue} />
                  <CoachSection title="WHAT I RECOMMEND" items={msg.packet?.recommendations || []} color={C.green} />
                  <CoachSection title="WHAT CHANGES IF APPLIED" items={msg.packet?.effects || []} color={C.amber} />
                </div>
              ) : msg.text}
            </div>
          </div>
        ))}
        {loading && (
          <div style={{ display:"flex", gap:4, padding:"0.7rem 0.9rem", background:"#0d1117", border:"1px solid #1e293b", borderRadius:"10px 10px 10px 3px", width:"fit-content" }}>
            {[0,1,2].map(i=>(
              <div key={i} style={{ width:6, height:6, borderRadius:"50%", background:C.green, opacity:0.6, animation:`pulse 1.2s ${i*0.2}s infinite`, }} />
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {pendingActions.length > 0 && (
        <div style={{ marginBottom:"0.55rem", background:"#0d1117", border:"1px solid #1e293b", borderRadius:8, padding:"0.65rem" }}>
          <div style={{ fontSize:"0.58rem", color:C.amber, letterSpacing:"0.08em", marginBottom:"0.4rem" }}>CONFIRM PLAN CHANGES</div>
          <div style={{ display:"grid", gap:"0.35rem" }}>
            {pendingActions.map((a, idx) => (
              <div key={idx} style={{ display:"flex", gap:"0.4rem", alignItems:"center", justifyContent:"space-between", background:"#0f172a", borderRadius:6, padding:"6px 8px" }}>
                <div style={{ fontSize:"0.6rem", color:"#cbd5e1" }}>{a.type} {a.payload ? `· ${Object.entries(a.payload).map(([k,v])=>`${k}:${v}`).join(" ")}` : ""}</div>
                <div style={{ display:"flex", gap:"0.35rem" }}>
                  <button className="btn" onClick={async ()=>{ await commitAction(a); setPendingActions(p => p.filter((_,i)=>i!==idx)); }} style={{ color:C.green, borderColor:C.green+"40" }}>APPLY</button>
                  <button className="btn" onClick={()=>setPendingActions(p => p.filter((_,i)=>i!==idx))} style={{ color:"#64748b" }}>NOT NOW</button>
                  <button className="btn" onClick={()=>setMessages(m => [...m, { role:"assistant", packet:{ notices:["You asked why."], recommendations:[`Action ${a.type} is proposed because it improves adherence and protects recovery.`], effects:["If applied, plan load and nutrition targets adjust for sustainability."], actions:[] }, source:"deterministic" }])} style={{ color:C.blue, borderColor:C.blue+"30" }}>ASK WHY</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick prompts */}
      <div style={{ display:"flex", gap:"0.3rem", overflowX:"auto", paddingBottom:"0.4rem", marginBottom:"0.4rem" }}>
        {quickPrompts.map(q => (
          <button key={q} className="btn" onClick={()=>send(q)} style={{ whiteSpace:"nowrap", fontSize:"0.58rem", flexShrink:0, color:C.blue, borderColor:`${C.blue}30` }}>
            {q}
          </button>
        ))}
      </div>

      {/* Input */}
      <div style={{ display:"flex", gap:"0.5rem" }}>
        <input
          value={input}
          onChange={e=>setInput(e.target.value)}
          onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()}
          placeholder="Ask your coach anything..."
          style={{ flex:1 }}
          disabled={loading}
        />
        <button className="btn btn-primary" onClick={()=>send()} disabled={loading} style={{ flexShrink:0, opacity:loading?0.5:1 }}>
          SEND
        </button>
      </div>
      <div style={{ marginTop:"0.55rem", fontSize:"0.56rem", color:"#475569", lineHeight:1.7 }}>
        Control tower context: Week {currentWeek} · Today {todayWorkout?.label || "Rest"} · Logs {Object.keys(logs).length} · Weight entries {bodyweights.length} · Last coach action {coachActions[0]?.type || "none"}.
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
    </div>
  );
}

function CoachSection({ title, items, color }) {
  return (
    <div style={{ background:"#0f172a", borderRadius:6, padding:"6px 8px", border:`1px solid ${color}25` }}>
      <div style={{ fontSize:"0.55rem", color, letterSpacing:"0.1em", marginBottom:"0.2rem" }}>{title}</div>
      {(items?.length ? items : ["No issues detected."]).map((item, idx) => (
        <div key={idx} style={{ fontSize:"0.61rem", color:"#cbd5e1", lineHeight:1.55 }}>• {item}</div>
      ))}
    </div>
  );
}
  const addRecommendation = (msg, confidence = "moderate") => recommendations.push(withConfidenceTone(msg, confidence, voiceMode));
