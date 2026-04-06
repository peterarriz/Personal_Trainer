import { useState, useEffect, useRef, useMemo } from "react";
import { DEFAULT_PLANNING_HORIZON_WEEKS, composeGoalNativePlan, getHorizonAnchor, buildRollingHorizonWeeks } from "./modules-planning.js";
import { createAuthStorageModule } from "./modules-auth-storage.js";
import { getGoalContext, deriveAdaptiveNutrition, deriveRealWorldNutritionEngine, LOCAL_PLACE_TEMPLATES, getPlaceRecommendations, buildGroceryBasket } from "./modules-nutrition.js";
import { DEFAULT_DAILY_CHECKIN, CHECKIN_STATUS_OPTIONS, CHECKIN_FEEL_OPTIONS, CHECKIN_BLOCKER_OPTIONS, parseMicroCheckin, deriveClosedLoopValidationLayer, isWithinGracePeriod, resolveEffectiveStatus } from "./modules-checkins.js";
import { COACH_TOOL_ACTIONS, AFFECTED_AREAS, withConfidenceTone, deterministicCoachPacket, applyCoachActionMutation } from "./modules-coach-engine.js";
import { buildWorkoutAdjustmentCoachNote, buildCheckinReadSummary, buildWeeklyPlanningCoachBrief, buildNutritionCoachBrief, buildSupplementCoachBrief, buildCoachChatSystemPrompt, buildPlanAnalysisSystemPrompt, buildTodayWhyNowSentence, buildMacroShiftLine, buildTodaySupplementTimingLines, buildEasierSessionsObservation, buildSkippedQualityDecision, buildLoadSpikeInlineWarning, buildWeeklyConsistencyAnchor, buildStreakSignalResponse, buildBadWeekTriageResponse, buildDiscomfortProtocolResponse, buildCompressedSessionPrescription, buildMinimumEffectiveTravelSession } from "./prompts/coach-text.js";

// ── PROFILE ──────────────────────────────────────────────────────────────────
const PROFILE = {
  name: "Athlete", height: "6'1\"", weight: 190, age: 30,
  goalRace: "TBD", goalTime: "TBD", goalPace: "TBD",
  startDate: new Date(),
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
const ENV_MODE_PRESETS = {
  Home: { equipment: "none", time: "30" },
  Gym: { equipment: "full_gym", time: "45+" },
  Travel: { equipment: "basic_gym", time: "30" },
};
const inferEquipmentFromPreset = (preset = {}, mode = "Home") => {
  const equipmentList = Array.isArray(preset?.equipment) ? preset.equipment.join(" ").toLowerCase() : String(preset?.equipment || "").toLowerCase();
  if (/full rack|barbell|cable|full gym/.test(equipmentList)) return "full_gym";
  if (/machine|hotel gym|db|dumbbell|basic gym/.test(equipmentList)) return "basic_gym";
  if (/bodyweight|none|no equipment/.test(equipmentList)) return "none";
  return ENV_MODE_PRESETS[mode]?.equipment || "dumbbells";
};
const resolveModePreset = (mode = "Home", presets = {}) => {
  const fallback = ENV_MODE_PRESETS[mode] || ENV_MODE_PRESETS.Home;
  const preset = presets?.[mode] || {};
  return {
    mode,
    equipment: inferEquipmentFromPreset(preset, mode),
    time: preset?.time || fallback.time,
  };
};
const CORE_FINISHER = [
  { ex: "Dead Bug", sets: "3", reps: "15/side", rest: "30s", cue: "Ribs down, low back pressed into floor." },
  { ex: "Plank", sets: "3", reps: "30s", rest: "30s", cue: "Glutes tight, neutral neck, no low-back sag." },
  { ex: "Bird Dog", sets: "3", reps: "12/side", rest: "30s", cue: "Move slow, keep hips level and square." },
];

const parseSetPrescription = (setsText = "") => {
  const normalized = String(setsText || "").trim().replace("×", "x");
  const m = normalized.match(/^(\d+)\s*x\s*(.+)$/i);
  if (m) return { sets: m[1], reps: m[2] };
  return { sets: "As prescribed", reps: normalized || "As prescribed" };
};

const normalizeStrengthExercise = (entry = {}) => {
  const { sets, reps } = parseSetPrescription(entry.sets || "");
  const cue = entry.cue || entry.note || "Controlled reps with full range and stable form.";
  const rest = entry.rest || (/rest/i.test(entry.note || "") ? (entry.note.match(/rest\s*[^.]+/i)?.[0] || "45-60s") : "45-75s");
  return { ex: entry.ex || "Exercise", sets, reps: entry.reps || reps, rest, cue };
};

const buildRunRoutine = (todayWorkout) => {
  const run = todayWorkout?.run;
  if (!run) return [];
  const focus = run.t || "Run";
  if (focus === "Intervals") {
    return [
      { ex: "Warm-up jog", sets: "1", reps: "10-15 min easy + drills", rest: "—", cue: "Stay relaxed and progressively raise cadence." },
      { ex: "Main interval set", sets: "1", reps: run.d || "As prescribed", rest: "Recoveries built in", cue: "Hit quality effort; keep form tall." },
      { ex: "Cool-down", sets: "1", reps: "8-12 min easy jog/walk", rest: "—", cue: "Lower HR gradually; finish with light mobility." },
    ];
  }
  if (focus === "Tempo") {
    return [
      { ex: "Warm-up", sets: "1", reps: "10-15 min easy + strides", rest: "—", cue: "Prime mechanics before threshold work." },
      { ex: "Tempo segment", sets: "1", reps: run.d || "As prescribed", rest: "Steady", cue: "Controlled discomfort, even pacing." },
      { ex: "Cool-down", sets: "1", reps: "8-12 min easy", rest: "—", cue: "Finish smooth and conversational." },
    ];
  }
  if (focus === "Long") {
    return [
      { ex: "Long aerobic run", sets: "1", reps: run.d || "As prescribed", rest: "Continuous", cue: "Easy effort, nose-breathing test early." },
      { ex: "Fuel & hydration", sets: "Every 30-40 min", reps: "Water + carbs as needed", rest: "—", cue: "Start fueling before you feel depleted." },
      { ex: "Post-run reset", sets: "1", reps: "5-10 min walk + calf/hip mobility", rest: "—", cue: "Downshift gradually to aid recovery." },
    ];
  }
  return [
    { ex: "Easy aerobic run", sets: "1", reps: run.d || "As prescribed", rest: "Continuous", cue: "Conversational pace, smooth cadence." },
    { ex: "Strides (optional)", sets: "4-6", reps: "15-20s", rest: "40-60s walk", cue: "Quick feet, relaxed upper body." },
    { ex: "Cool-down walk", sets: "1", reps: "5 min", rest: "—", cue: "Finish breathing calm and controlled." },
  ];
};

const deriveReadinessAdjustedCheckin = (checkin = {}) => {
  const readiness = checkin.readiness || {};
  const toNum = (v) => (v === "" || v === null || v === undefined ? null : Number(v));
  const sleep = toNum(readiness.sleep);
  const soreness = toNum(readiness.soreness);
  const stress = toNum(readiness.stress);
  const readinessFilled = [sleep, soreness, stress].some(v => typeof v === "number" && !Number.isNaN(v) && v > 0);
  if (!readinessFilled) return { readinessFilled: false, readiness: null, adjusted: {} };

  const adjusted = {};
  const lowReadiness = (sleep !== null && sleep <= 2) || (soreness !== null && soreness >= 4) || (stress !== null && stress >= 4);
  const highReadiness = (sleep !== null && sleep >= 4) && (soreness !== null && soreness <= 2) && (stress !== null && stress <= 2);
  if (lowReadiness) {
    adjusted.sessionFeel = "harder_than_expected";
    if (checkin.status === "completed_as_planned") adjusted.status = "completed_modified";
  } else if (highReadiness && checkin.sessionFeel !== "harder_than_expected") {
    adjusted.sessionFeel = "easier_than_expected";
  }
  const marker = `[readiness s${sleep || "-"} so${soreness || "-"} st${stress || "-"}]`;
  const cleanedNote = String(checkin.note || "").replace(/\s*\[readiness s.*?\]\s*$/i, "").trim();
  adjusted.note = cleanedNote ? `${cleanedNote} ${marker}` : marker;
  return { readinessFilled: true, readiness: { sleep, soreness, stress }, adjusted };
};

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

const dayColors = { "run+strength":"#00f0ff", otf:"#ff8a00", "strength+prehab":"#7c5cff", "hard-run":"#ff3d81", "easy-run":"#27f59a", "long-run":"#ff3d81", rest:"#3f4f64" };
const C = { green:"#27f59a", blue:"#00c2ff", amber:"#ff8a00", red:"#ff3d81", purple:"#7c5cff", lime:"#d8ff3e", slate:"#5f6f85" };
const WORKOUT_TYPE_ICON = { "run+strength":"run_strength", otf:"otf", "strength+prehab":"strength_prehab", "hard-run":"hard_run", "easy-run":"easy_run", "long-run":"long_run", rest:"rest" };
const RUN_TYPE_ICON = { Easy:"easy_run", Tempo:"tempo_run", Intervals:"interval_run", Long:"long_run", Recovery:"rest" };
const NUTRITION_ICON = { Protein:"protein", Carbs:"carbs", Calories:"calories", Breakfast:"breakfast", Lunch:"lunch", Dinner:"dinner", "Optional snack":"snack", "Travel backup":"travel", "Grocery reset":"grocery" };
const SUPPLEMENT_ICONS = { Creatine:"creatine", Electrolytes:"electrolytes", Magnesium:"magnesium", "Omega-3":"omega3", "Vitamin D3":"vitamin_d" };
const PHASE_ARC_LABELS = {
  running: {
    BASE: { name: "Aerobic Engine Base", objective: "Rebuild aerobic durability and movement economy." },
    BUILDING: { name: "Strength Reintroduction", objective: "Layer controlled intensity while preserving consistency." },
    PEAKBUILD: { name: "Race-Specific Build", objective: "Convert fitness into goal-pace tolerance." },
    PEAK: { name: "Peak Block", objective: "Sharpen race execution and confidence under load." },
    TAPER: { name: "Sharpen & Freshen", objective: "Absorb adaptation and arrive race-ready." },
  },
  body_comp: {
    BASE: { name: "Cut & Base Phase", objective: "Establish calorie control while protecting training rhythm." },
    BUILDING: { name: "Lean Strength Rebuild", objective: "Keep recomposition momentum and rebuild force output." },
    PEAKBUILD: { name: "Performance Cut Block", objective: "Hold deficit discipline while maintaining quality work." },
    PEAK: { name: "Peak Composition Block", objective: "Finalize body comp with performance preserved." },
    TAPER: { name: "Consolidation Taper", objective: "Stabilize outcomes and lock habits." },
  },
  strength: {
    BASE: { name: "Movement Foundation", objective: "Restore technique quality and repeatable volume." },
    BUILDING: { name: "Strength Reintroduction", objective: "Progress core lifts with controlled fatigue." },
    PEAKBUILD: { name: "Intensification Block", objective: "Push load progression and neural readiness." },
    PEAK: { name: "Peak Strength Block", objective: "Express top-end strength with focused intent." },
    TAPER: { name: "Deload & Test", objective: "Recover and realize strength expression." },
  },
};
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
const buildNamedPhaseArc = ({ rollingHorizon = [], goals = [] }) => {
  const primaryCategory = goals.find(g => g.active)?.category || "running";
  const labelSet = PHASE_ARC_LABELS[primaryCategory] || PHASE_ARC_LABELS.running;
  const blocks = [];
  for (const h of rollingHorizon) {
    const phase = h?.template?.phase;
    if (!phase) continue;
    const meta = labelSet[phase] || { name: `${phase} Block`, objective: "Execute core plan priorities." };
    const last = blocks[blocks.length - 1];
    if (last && last.phase === phase) {
      last.endWeek = h.absoluteWeek;
    } else {
      blocks.push({ phase, startWeek: h.absoluteWeek, endWeek: h.absoluteWeek, name: meta.name, objective: meta.objective });
    }
  }
  return blocks;
};
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
    onboardingComplete: false,
    trainingAgeYears: 0,
    preferredCoachingTone: "adaptive",
    preferredTrainingStyle: "",
    goalMix: "",
    estimatedFitnessLevel: "unknown",
    preferredEnvironments: [],
    inconsistencyRisk: "unknown",
    currentMomentumState: "unknown",
    likelyAdherencePattern: "unknown",
    injurySensitivity: "",
  },
  goalState: {
    primaryGoal: "",
    priority: "undecided",
    confidence: 0,
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
    defaultMode: "Home",
    todayOverride: null,
    weekOverride: null,
    schedule: [],
    presets: {
      Home: { equipment: ["dumbbells", "pull-up bar"], time: "30" },
      Travel: { equipment: ["bodyweight only"], time: "20" },
      Gym: { equipment: ["full rack", "barbell", "cable stack"], time: "45+" },
    },
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
    city: "",
    groceryOptions: [],
    quickOptions: [],
  },
  coachMemory: {
    wins: [],
    constraints: [],
    failurePatterns: [],
    pushResponse: "",
    protectResponse: "",
    commonBarriers: [],
    preferredFoodPatterns: [],
    scheduleConstraints: [],
    simplicityVsVariety: "",
    lastAdjustment: "Onboarding pending.",
    longTermMemory: [],
    sundayReviews: [],
    lastSundayPushWeek: "",
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
  const presets = personalization?.environmentConfig?.presets || {};
  const defaultMode = personalization?.environmentConfig?.defaultMode || "Home";
  const presetBase = resolveModePreset(defaultMode, presets);
  const base = { ...(personalization?.environmentConfig?.base || { equipment: "dumbbells", time: "30" }), equipment: presetBase.equipment, time: presetBase.time, mode: defaultMode };
  const todayOverride = personalization?.environmentConfig?.todayOverride;
  const weekOverride = personalization?.environmentConfig?.weekOverride;
  const schedule = personalization?.environmentConfig?.schedule || [];
  const scheduledWindow = schedule.find((slot) => slot?.startDate && slot?.endDate && todayKey >= slot.startDate && todayKey <= slot.endDate);
  if (todayOverride?.date === todayKey) return { ...base, ...todayOverride, scope: "today" };
  if (scheduledWindow) {
    const modePreset = resolveModePreset(scheduledWindow.mode || "Travel", presets);
    return { ...base, ...modePreset, ...scheduledWindow, scope: "calendar" };
  }
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
  { id: "g_primary", name: "Primary goal (set in onboarding)", category: "running", priority: 1, targetDate: "", measurableTarget: "", active: false },
  { id: "g_secondary_1", name: "Secondary goal 1", category: "body_comp", priority: 2, targetDate: "", measurableTarget: "", active: false },
  { id: "g_secondary_2", name: "Secondary goal 2", category: "strength", priority: 3, targetDate: "", measurableTarget: "", active: false },
  { id: "g_resilience", name: "Resilience & injury prevention", category: "injury_prevention", priority: 4, targetDate: "", measurableTarget: "", active: true },
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

const deriveCompoundingCoachMemory = ({ dailyCheckins, weeklyCheckins, personalization, momentum }) => {
  const checkins = Object.values(dailyCheckins || {});
  const weekly = Object.entries(weeklyCheckins || {});
  const injuryHistory = checkins
    .filter(c => (c?.painLevel || "none") !== "none")
    .slice(-8)
    .map(c => `${c?.painLevel || "pain"} (${c?.painArea || personalization?.injuryPainState?.area || "Achilles"})`);
  const recurringBreakdowns = weekly
    .filter(([, w]) => Number(w?.energy || 3) <= 2 || Number(w?.stress || 3) >= 4)
    .slice(-6)
    .map(([weekKey, w]) => ({
      week: weekKey,
      why: Number(w?.stress || 3) >= 4 ? "high stress" : Number(w?.energy || 3) <= 2 ? "low energy" : (w?.blocker || "execution friction"),
    }));
  const preferredMotivationStyle = momentum?.inconsistencyRisk === "high" || momentum?.momentumState === "drifting"
    ? "supportive + minimum-viable action prompts"
    : momentum?.momentumState === "building momentum"
    ? "performance-focused progression cues"
    : "balanced direct coaching";
  const summaryLine = recurringBreakdowns[0]
    ? `Recent breakdown pattern: week ${recurringBreakdowns[0].week} driven by ${recurringBreakdowns[0].why}.`
    : "No major weekly breakdown pattern recently.";
  return {
    injuryHistory: [...new Set(injuryHistory)].slice(0, 5),
    preferredMotivationStyle,
    recurringBreakdowns,
    summaryLine,
    updatedAt: Date.now(),
  };
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

const buildSundayWeekInReview = ({ logs = {}, momentum, patterns = [], recalibration, currentWeek }) => {
  const recent = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0])).slice(-7);
  const consistency = momentum?.completionRate >= 0.75
    ? "Consistency held strong this week."
    : momentum?.completionRate >= 0.55
    ? "Consistency was mixed but serviceable."
    : "Consistency dipped and needs a reset next week.";
  const winLog = recent.find(([, l]) => /progress|strong|solid|better|completed/i.test(`${l?.notes || ""} ${l?.type || ""}`));
  const win = winLog
    ? `Win: ${winLog[1]?.type || "a key session"} on ${winLog[0]}.`
    : `Win: you still logged ${recent.length} training touchpoint${recent.length === 1 ? "" : "s"} this week.`;
  const watch = `Watch: ${patterns?.[0] || "recovery drift when stress rises."}`;
  const nextChange = `Next week change: ${(recalibration?.changes || [])[0] || "keep structure simple and protect key sessions."}`;
  return {
    date: new Date().toISOString().split("T")[0],
    week: currentWeek,
    paragraph: `${consistency} ${win} ${watch} ${nextChange}`,
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

const deriveStrengthProgressTracker = ({ logs = {}, goals = [], strengthLayer = {} }) => {
  const entries = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0]));
  const activeStrengthGoal = (goals || []).find(g => g.active && g.category === "strength");
  const targetFromGoal = parseInt((activeStrengthGoal?.measurableTarget || "").match(/\d+/)?.[0] || "0", 10) || 0;
  const liftDefs = [
    { key: "bench", label: "Bench Press", keywords: /bench|press/i, baseCurrent: strengthLayer.trainingMax || 165, goal: targetFromGoal || Math.round((strengthLayer.trainingMax || 165) + 25) },
    { key: "squat", label: "Squat", keywords: /squat/i, baseCurrent: Math.round((strengthLayer.trainingMax || 165) * 1.35), goal: Math.round((strengthLayer.trainingMax || 165) * 1.5) },
    { key: "deadlift", label: "Deadlift", keywords: /deadlift|hinge/i, baseCurrent: Math.round((strengthLayer.trainingMax || 165) * 1.65), goal: Math.round((strengthLayer.trainingMax || 165) * 1.85) },
    { key: "ohp", label: "Overhead Press", keywords: /overhead|ohp|shoulder press/i, baseCurrent: Math.round((strengthLayer.trainingMax || 165) * 0.6), goal: Math.round((strengthLayer.trainingMax || 165) * 0.72) },
  ];
  return liftDefs.map((lift) => {
    const sessions = entries
      .filter(([, l]) => lift.keywords.test(`${l?.type || ""} ${l?.notes || ""}`))
      .slice(-4)
      .map(([date, l]) => {
        const text = `${l?.type || ""} ${l?.notes || ""}`;
        const load = parseInt((text.match(/(\d{2,3})\s?(lb|lbs)?/i) || [])[1] || "0", 10) || null;
        return { date, load, note: l?.notes || l?.type || "Strength session" };
      });
    const current = sessions[sessions.length - 1]?.load || lift.baseCurrent;
    const goal = Math.max(lift.goal, current + 5);
    const delta = Math.max(0, goal - current);
    const projectedWeeks = Math.max(2, Math.ceil(delta / 5));
    return {
      ...lift,
      current,
      goal,
      projected: `${projectedWeeks}–${projectedWeeks + 2} weeks`,
      sessions,
    };
  });
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
  const compoundingCoachMemory = deriveCompoundingCoachMemory({ dailyCheckins, weeklyCheckins, personalization, momentum });
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

  useEffect(() => {
    if (loading) return;
    const prev = JSON.stringify(personalization?.coachMemory?.compounding || {});
    const next = JSON.stringify(compoundingCoachMemory || {});
    if (prev === next) return;
    const updated = mergePersonalization(personalization, { coachMemory: { ...personalization.coachMemory, compounding: compoundingCoachMemory } });
    setPersonalization(updated);
    persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback);
  }, [compoundingCoachMemory?.summaryLine, compoundingCoachMemory?.preferredMotivationStyle, compoundingCoachMemory?.injuryHistory?.join("|"), compoundingCoachMemory?.recurringBreakdowns?.map(r => `${r.week}:${r.why}`).join("|")]);

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
  const setEnvironmentMode = async ({ equipment, time, mode, scope = "base" }) => {
    const presets = personalization.environmentConfig?.presets || {};
    const baseMode = personalization.environmentConfig?.defaultMode || "Home";
    const fromMode = mode ? resolveModePreset(mode, presets) : null;
    const baseConfig = personalization.environmentConfig?.base || resolveModePreset(baseMode, presets);
    const selected = { equipment: equipment || fromMode?.equipment || baseConfig.equipment, time: time || fromMode?.time || baseConfig.time, mode: mode || baseMode };
    const nextEnvironmentConfig = {
      ...(personalization.environmentConfig || {}),
      defaultMode: scope === "base" ? selected.mode : (personalization.environmentConfig?.defaultMode || selected.mode),
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
  const saveEnvironmentSchedule = async (schedule = []) => {
    const cleaned = (schedule || [])
      .filter(s => s?.startDate && s?.endDate && s.startDate <= s.endDate)
      .slice(0, 20);
    const updated = mergePersonalization(personalization, {
      environmentConfig: {
        ...personalization.environmentConfig,
        schedule: cleaned,
      },
    });
    setPersonalization(updated);
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback);
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

  useEffect(() => {
    if (loading || typeof window === "undefined" || typeof Notification === "undefined") return;
    const now = new Date();
    if (now.getDay() !== 0) return; // Sunday only
    const weekTag = `${now.getUTCFullYear()}_W${currentWeek}`;
    const lastPushWeek = personalization?.coachMemory?.lastSundayPushWeek || "";
    if (lastPushWeek === weekTag) return;

    (async () => {
      if (Notification.permission === "default") {
        try { await Notification.requestPermission(); } catch { return; }
      }
      if (Notification.permission !== "granted") return;
      const note = new Notification("Weekly coach check-in", {
        body: "3 quick questions. Tap to update your next week automatically.",
      });
      note.onclick = async () => {
        try { window.focus(); } catch {}
        const energy = Number(window.prompt("Coach check-in (1/3): Energy this week? (1-5)", "3") || "3");
        const stress = Number(window.prompt("Coach check-in (2/3): Stress this week? (1-5)", "3") || "3");
        const blocker = String(window.prompt("Coach check-in (3/3): Biggest blocker? (time/travel/recovery/none)", "none") || "none");
        await applySundayPushAdjustments({ energy, stress, blocker });
      };
      const updated = mergePersonalization(personalization, { coachMemory: { ...personalization.coachMemory, lastSundayPushWeek: weekTag } });
      setPersonalization(updated);
      await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback);
    })();
  }, [loading, currentWeek, personalization?.coachMemory?.lastSundayPushWeek]);

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

  const applySundayPushAdjustments = async ({ energy = 3, stress = 3, blocker = "none" }) => {
    const clampedEnergy = Math.max(1, Math.min(5, Number(energy) || 3));
    const clampedStress = Math.max(1, Math.min(5, Number(stress) || 3));
    const cleanBlocker = String(blocker || "none").toLowerCase().trim() || "none";
    const confidence = Math.max(1, Math.min(5, Math.round((clampedEnergy + (6 - clampedStress)) / 2)));
    const nextWeekly = {
      ...weeklyCheckins,
      [String(currentWeek)]: { energy: clampedEnergy, stress: clampedStress, confidence, blocker: cleanBlocker, source: "sunday_push", ts: Date.now() }
    };
    const requiresDeload = clampedEnergy <= 2 || clampedStress >= 4 || ["time", "travel", "recovery"].includes(cleanBlocker);
    const nextAdjustments = requiresDeload
      ? {
          ...coachPlanAdjustments,
          dayOverrides: { ...(coachPlanAdjustments.dayOverrides || {}) },
          nutritionOverrides: { ...(coachPlanAdjustments.nutritionOverrides || {}) },
          weekVolumePct: {
            ...(coachPlanAdjustments.weekVolumePct || {}),
            [String(currentWeek + 1)]: Math.min(Number(coachPlanAdjustments?.weekVolumePct?.[String(currentWeek + 1)] || 100), 88),
          },
          extra: { ...(coachPlanAdjustments.extra || {}), sundayPushAppliedAt: Date.now(), sundayPushBlocker: cleanBlocker },
        }
      : coachPlanAdjustments;
    const nextAlerts = [{ id:`sunday_push_${Date.now()}`, type:"info", msg:"Weekly coach push check-in received. Plan updated silently." }, ...planAlerts].slice(0, 12);
    setWeeklyCheckins(nextWeekly);
    setPlanAlerts(nextAlerts);
    if (requiresDeload) setCoachPlanAdjustments(nextAdjustments);
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, nextAlerts, personalization, coachActions, nextAdjustments, goals, dailyCheckins, nextWeekly, nutritionFavorites, nutritionFeedback);
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
      const systemPrompt = buildPlanAnalysisSystemPrompt({ currentWeek, currentWeekData, currentZones, logEntries, paceOverrides, weekNotes });

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
    <div style={{ background:"radial-gradient(110% 110% at 85% -5%, rgba(124,92,255,0.32), transparent 48%), radial-gradient(120% 120% at -10% 0%, rgba(0,194,255,0.2), transparent 42%), linear-gradient(175deg,#06080f 0%, #0b1220 45%, #10192d 100%)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',sans-serif", color:"#6b7c99", fontSize:"0.7rem", letterSpacing:"0.2em" }}>
      LOADING...
    </div>
  );

  if (!authSession?.user?.id) return (
    <div style={{ background:"radial-gradient(110% 110% at 85% -5%, rgba(124,92,255,0.32), transparent 48%), radial-gradient(120% 120% at -10% 0%, rgba(0,194,255,0.2), transparent 42%), linear-gradient(175deg,#06080f 0%, #0b1220 45%, #10192d 100%)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',sans-serif", color:"#e2e8f0", padding:"1rem" }}>
      <div style={{ width:"100%", maxWidth:380, border:"1px solid rgba(0,194,255,0.26)", borderRadius:14, padding:"1rem", background:"rgba(14,23,41,0.88)", boxShadow:"0 14px 38px rgba(0,0,0,0.45)" }}>
        <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:"1.2rem", fontWeight:700, letterSpacing:"0.08em", color:"#ff3d81", marginBottom:"0.5rem" }}>ACCOUNT ACCESS</div>
        <div style={{ fontSize:"0.58rem", color:"#8fa2bf", marginBottom:"0.5rem" }}>Sign in to load your private training state.</div>
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


  const activeTargetDate = goals?.find(g => g.active && g.targetDate)?.targetDate || personalization?.goalState?.deadline || null;
  const daysToRace = activeTargetDate ? Math.max(0, Math.ceil((new Date(activeTargetDate) - today) / (1000*60*60*24))) : 0;
  const activePhase = todayWorkoutHardened?.week?.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
  const PHASE_THEME = {
    BASE: { accent: "#27f59a", accentSoft: "rgba(39,245,154,0.2)", accentGlow: "rgba(39,245,154,0.34)" },
    BUILDING: { accent: "#00c2ff", accentSoft: "rgba(0,194,255,0.22)", accentGlow: "rgba(0,194,255,0.34)" },
    PEAKBUILD: { accent: "#7c5cff", accentSoft: "rgba(124,92,255,0.24)", accentGlow: "rgba(124,92,255,0.35)" },
    PEAK: { accent: "#ff3d81", accentSoft: "rgba(255,61,129,0.24)", accentGlow: "rgba(255,61,129,0.36)" },
    TAPER: { accent: "#9aa6ff", accentSoft: "rgba(154,166,255,0.22)", accentGlow: "rgba(154,166,255,0.32)" },
  };
  const phaseTheme = PHASE_THEME[activePhase] || PHASE_THEME.BASE;
  const onboardingComplete = personalization?.profile?.onboardingComplete;
  const finishOnboarding = async (answers) => {
    const primaryGoalType = answers.primary_goal_type || "race";
    const primaryGoalDetail = answers.primary_goal_detail || "Defined in onboarding";
    const primaryGoal = `${primaryGoalType === "race" ? "Race" : primaryGoalType === "weight_loss" ? "Weight Loss" : primaryGoalType === "strength" ? "Strength Milestone" : "Aesthetics"}: ${primaryGoalDetail}`;
    const mappedCategory = primaryGoalType === "strength" ? "strength" : (primaryGoalType === "weight_loss" || primaryGoalType === "aesthetics") ? "body_comp" : "running";
    const secondary = (answers.secondary_goals || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 3);
    const secondaryCategoryFor = (text) => /strength|bench|deadlift|squat|press/i.test(text) ? "strength" : /weight|fat|lean|abs|aesthetic/i.test(text) ? "body_comp" : /race|run|pace|marathon|5k|10k|half/i.test(text) ? "running" : "injury_prevention";
    let refreshedGoals = (goals || []).map((g, i) => {
      if (i === 0) return { ...g, name: primaryGoal, category: mappedCategory, targetDate: answers.hard_deadline || g.targetDate, active: true };
      const sec = secondary[i - 1];
      if (!sec) return { ...g, active: false };
      return { ...g, name: sec, category: secondaryCategoryFor(sec), targetDate: answers.hard_deadline || g.targetDate, active: true };
    });
    if (answers.priority_order) {
      const ordered = answers.priority_order.split(">").map(s => s.trim()).filter(Boolean);
      refreshedGoals = refreshedGoals.map((g, i) => {
        const pick = ordered[i];
        if (!pick) return { ...g, active: false };
        return { ...g, name: pick, category: secondaryCategoryFor(pick), targetDate: answers.hard_deadline || g.targetDate, active: true };
      });
    }
    const nextPersonalization = mergePersonalization(personalization, {
      profile: {
        ...personalization.profile,
        onboardingComplete: true,
        preferredTrainingStyle: answers.training_style || personalization.profile.preferredTrainingStyle || "hybrid",
        goalMix: `${primaryGoal}${secondary.length ? ` + ${secondary.join(" / ")}` : ""}`,
      },
      goalState: {
        ...personalization.goalState,
        primaryGoal,
        priority: mappedCategory,
        priorityOrder: answers.priority_order || `${primaryGoal}${secondary.length ? ` > ${secondary.join(" > ")}` : ""}`,
        deadline: answers.hard_deadline || "",
        milestones: {
          day30: answers.success_30 || "Establish consistency and baseline metrics.",
          day60: answers.success_60 || "Progress workload and tighten execution.",
          day90: answers.success_90 || "Hit the primary target trajectory.",
        },
      },
      injuryPainState: {
        ...personalization.injuryPainState,
        level: answers.injury_status === "none" ? "none" : "mild_tightness",
        notes: answers.injury_status === "none" ? "" : `Onboarding note: ${answers.injury_status}`,
      },
      environmentConfig: {
        ...personalization.environmentConfig,
        presets: answers.environment_presets || personalization.environmentConfig?.presets || DEFAULT_PERSONALIZATION.environmentConfig.presets,
        base: {
          equipment: (() => {
            const presetName = answers.preferred_environment || "Home";
            const fromPreset = answers.environment_presets?.[presetName]?.equipment?.[0];
            return fromPreset || answers.equipment_access || personalization.environmentConfig?.base?.equipment || "dumbbells";
          })(),
          time: (() => {
            const presetName = answers.preferred_environment || "Home";
            return answers.environment_presets?.[presetName]?.time || answers.session_time || personalization.environmentConfig?.base?.time || "30";
          })(),
        },
      },
      coachMemory: {
        ...personalization.coachMemory,
        commonBarriers: [answers.schedule_constraint || "variable schedule", answers.lifestyle_factor || "recovery inconsistency"].filter(Boolean),
        preferredFoodPatterns: [answers.nutrition_style || "high-protein performance"],
        longTermMemory: [
          ...(personalization.coachMemory?.longTermMemory || []),
          answers.conflict_summary ? `Conflict surfaced: ${answers.conflict_summary}` : null,
          answers.priority_order ? `Priority order chosen: ${answers.priority_order}` : null,
          `Primary goal: ${primaryGoal}`,
          `30-day success: ${answers.success_30 || "consistency baseline"}`,
          `60-day success: ${answers.success_60 || "progressive build"}`,
          `90-day success: ${answers.success_90 || "target outcome achieved"}`,
        ].filter(Boolean).slice(-30),
      },
    });
    setPersonalization(nextPersonalization);
    setGoals(refreshedGoals);
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, nextPersonalization, coachActions, coachPlanAdjustments, refreshedGoals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback);
  };

  return (
    <div style={{ "--phase-accent": phaseTheme.accent, "--phase-accent-soft": phaseTheme.accentSoft, "--phase-accent-glow": phaseTheme.accentGlow, fontFamily:"'Inter',sans-serif", background:"radial-gradient(110% 110% at 85% -5%, var(--phase-accent-glow), transparent 48%), radial-gradient(120% 120% at -10% 0%, rgba(0,194,255,0.2), transparent 42%), linear-gradient(175deg,#06080f 0%, #0b1220 45%, #10192d 100%)", minHeight:"100vh", color:"#e8eefc", padding:"1.65rem 1.2rem" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@500;700&display=swap');
        :root{
          --bg:#0b1220;
          --panel:#121d33;
          --panel-2:#172742;
          --panel-3:#203253;
          --border:#324767;
          --muted:#8ea2c4;
          --text:#e8eefc;
          --accent:var(--phase-accent);
          --accent-2:#7c5cff;
          --hot:#ff3d81;
          --signal:#27f59a;
        }
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar{width:6px} ::-webkit-scrollbar-track{background:#0c1424} ::-webkit-scrollbar-thumb{background:#2f4365;border-radius:999px}
        .fi{animation:fi 0.22s ease forwards}
        .hov{transition:all 0.2s ease;cursor:pointer} .hov:hover{background:rgba(0,194,255,0.08)!important}
        .btn{
          background:linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0)), #182742;
          border:1px solid #395177;
          border-radius:10px;
          font-family:'Inter',sans-serif;
          font-size:0.62rem;
          font-weight:600;
          letter-spacing:0.07em;
          cursor:pointer;
          padding:7px 11px;
          transition:all 0.2s ease;
          color:#d5e5ff;
        }
        .btn:hover{border-color:var(--phase-accent);color:#ffffff;transform:translateY(-1px);box-shadow:0 0 0 1px var(--phase-accent-soft), 0 8px 16px var(--phase-accent-soft)}
        .btn:active{transform:translateY(0) scale(0.985)}
        .btn-primary{
          background:linear-gradient(130deg, var(--phase-accent), #27f59a)!important;
          border-color:transparent!important;
          color:#081321!important;
          font-weight:700;
          box-shadow:0 7px 24px var(--phase-accent-soft);
        }
        .btn-primary:hover{filter:brightness(1.05);box-shadow:0 10px 26px var(--phase-accent-glow)}
        input,textarea,select{background:#15233d;border:1px solid var(--border);border-radius:10px;color:var(--text);font-family:'Inter',sans-serif;font-size:0.7rem;padding:8px 10px;outline:none;width:100%;transition:border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease}
        input:focus,textarea:focus,select:focus{border-color:#00c2ff;box-shadow:0 0 0 3px rgba(0,194,255,0.16);transform:translateY(-1px)}
        @keyframes fi{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
        @keyframes pulseGlow{0%,100%{box-shadow:0 0 0 0 rgba(124,92,255,0)}50%{box-shadow:0 0 0 10px rgba(124,92,255,0.14)}}
        @keyframes heroShift{
          0%{background-position:0% 50%}
          50%{background-position:100% 50%}
          100%{background-position:0% 50%}
        }
        @keyframes completePop{
          0%{transform:scale(0.96); opacity:0}
          65%{transform:scale(1.04); opacity:1}
          100%{transform:scale(1); opacity:1}
        }
        @keyframes ringPulse{
          0%,100%{box-shadow:0 0 0 0 rgba(39,245,154,0)}
          50%{box-shadow:0 0 0 10px rgba(39,245,154,0.16)}
        }
        @keyframes coachFadeIn{
          from{opacity:0; transform:translateY(6px)}
          to{opacity:1; transform:translateY(0)}
        }
        .tag{font-size:0.56rem;padding:3px 7px;border-radius:999px;letter-spacing:0.03em;white-space:nowrap;background:#1b2638}
        .card{
          position:relative;
          overflow:hidden;
          background:linear-gradient(180deg, var(--phase-accent-soft), rgba(255,255,255,0)) , var(--panel);
          border:1px solid rgba(111,148,198,0.22);
          border-radius:14px;
          padding:1.05rem;
          box-shadow:0 8px 20px rgba(4,8,14,0.34), inset 0 1px 0 rgba(255,255,255,0.03), inset 0 -14px 24px rgba(0,0,0,0.2);
          transition:transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease, filter 0.2s ease
        }
        .card::before{
          content:"";
          position:absolute;
          inset:-1px -1px auto -1px;
          height:42%;
          pointer-events:none;
          background:linear-gradient(180deg, rgba(255,255,255,0.13), rgba(255,255,255,0));
          opacity:0.45;
        }
        .card::after{
          content:"";
          position:absolute;
          width:180px;
          height:180px;
          right:-80px;
          top:-80px;
          border-radius:999px;
          background:radial-gradient(circle, rgba(124,92,255,0.2), transparent 70%);
          pointer-events:none;
          opacity:0.75;
        }
        .card:hover{transform:translateY(-1px); box-shadow:0 16px 34px rgba(4,8,14,0.52); border-color:var(--phase-accent); filter:saturate(1.08)}
        .card-strong{
          background:linear-gradient(180deg, var(--phase-accent-soft), rgba(0,194,255,0.03)), var(--panel-2);
          border-color:var(--phase-accent-soft);
          box-shadow:0 14px 32px rgba(6,12,22,0.52), 0 0 0 1px var(--phase-accent-soft);
        }
        .card-soft{
          background:linear-gradient(180deg, rgba(255,61,129,0.07), rgba(255,255,255,0)), var(--panel);
          border-color:rgba(255,61,129,0.22);
          box-shadow:0 6px 14px rgba(4,8,14,0.3);
        }
        .sect-title{font-family:'Space Grotesk',sans-serif;font-size:1.02rem;font-weight:700;letter-spacing:0.03em;text-transform:none;color:#f1f6ff}
        .mono{font-family:'JetBrains Mono',monospace; letter-spacing:0.01em}
        .coach-copy{font-family:'Inter',sans-serif; color:#d8e3f8; line-height:1.7}
        .completion-pop{animation:completePop 0.35s ease-out}
        .pulse-ring{animation:ringPulse 1.35s ease-in-out infinite; border-radius:999px}
        .coach-fade{animation:coachFadeIn 0.28s ease-out both}
        .card-hero{
          border-color:var(--phase-accent)!important;
          box-shadow:0 20px 44px rgba(6,12,22,0.58), 0 0 0 1px var(--phase-accent-soft), 0 0 34px var(--phase-accent-soft);
        }
        .card-hero::after{
          background:radial-gradient(circle, var(--phase-accent-glow), transparent 70%);
        }
        .card-action{
          border-color:rgba(0,194,255,0.48)!important;
          box-shadow:0 16px 36px rgba(6,12,22,0.5), 0 0 0 1px rgba(0,194,255,0.15), 0 0 26px rgba(0,194,255,0.17);
        }
        .card-subtle{
          opacity:0.95;
          box-shadow:0 8px 18px rgba(6,12,22,0.38);
        }
        details > summary{list-style:none}
        details > summary::-webkit-details-marker{display:none}
        details[open]{animation:fi 0.18s ease}
      `}</style>

      {!onboardingComplete ? (
        <OnboardingCoach onComplete={finishOnboarding} />
      ) : (
      <div style={{ maxWidth:860, margin:"0 auto", background:"radial-gradient(140% 100% at 50% -5%, var(--phase-accent-soft), transparent 58%)" }}>

        {/* ── HEADER BAR ── */}
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", marginBottom:"1.25rem", flexWrap:"wrap", gap:"0.5rem" }}>
          <div>
            <h1 style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:"1.95rem", letterSpacing:"0.04em", background:"linear-gradient(120deg,#dff6ff 15%,var(--phase-accent) 58%,#ff3d81 95%)", WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", lineHeight:1 }}>
              PERSONAL TRAINER
            </h1>
            <div style={{ fontFamily:"'Inter',sans-serif", fontSize:"0.58rem", color:"#8ca2c6", letterSpacing:"0.12em", marginTop:2 }}>
              {fmtDate(today).toUpperCase()} · WEEK {currentWeek} · {activePhase}
            </div>
          </div>
          <div style={{ textAlign:"right" }}>
            <div className="mono" style={{ fontSize:"1.75rem", color:daysToRace <= 30 ? C.red : "#89a0c2", fontWeight:500, lineHeight:1, animation:daysToRace <= 30 ? "pulseGlow 1.8s ease-in-out infinite" : "none", borderRadius:10 }}>{daysToRace}</div>
            <div style={{ fontSize:"0.7rem", color:"#7f95b7", marginTop:2 }}>days to race</div>
            <div style={{ marginTop:6, display:"flex", gap:"0.75rem", alignItems:"center", justifyContent:"flex-end" }}>
              <div style={{ fontSize:"0.65rem", color: storageStatus.mode === "cloud" ? "#27f59a" : "#ff8a00" }}>{storageStatus.mode === "cloud" ? "Synced" : "Offline"}</div>
              <button className="btn" onClick={handleSignOut} style={{ fontSize:"0.65rem", padding:"4px 10px" }}>Sign out</button>
            </div>
          </div>
        </div>
        {/* ── TABS ── */}
        <div style={{ display:"flex", gap:"0.3rem", marginBottom:"1.25rem", background:"rgba(17,29,50,0.9)", padding:"0.35rem", borderRadius:12, border:"1px solid rgba(90,126,179,0.4)", overflowX:"auto", boxShadow:"inset 0 1px 0 rgba(255,255,255,0.05)" }}>
          {TABS.map((t,i) => (
            <button key={t} className="btn" onClick={()=>setTab(i)}
              style={{ color:tab===i?"#041220":"#95abd0", background:tab===i?"linear-gradient(130deg,var(--phase-accent),#27f59a)":"transparent", borderColor:tab===i?"transparent":"rgba(84,113,158,0.5)", fontWeight:tab===i?700:500, flexShrink:0 }}>
              {t}
            </button>
          ))}
        </div>

        {/* ══════════════════════════════════════════════════════════
            TODAY
        ══════════════════════════════════════════════════════════ */}
        {tab === 0 && <TodayTab todayWorkout={todayWorkoutHardened} plannedWorkout={goalNativeWorkout} currentWeek={currentWeek} logs={logs} bodyweights={bodyweights} planAlerts={planAlerts} setPlanAlerts={setPlanAlerts} analyzing={analyzing} getZones={getZones} personalization={personalization} goals={goals} momentum={momentum} strengthLayer={strengthLayer} dailyStory={dailyStory} behaviorLoop={behaviorLoop} proactiveTriggers={proactiveTriggers} onDismissTrigger={(id)=>setDismissedTriggers(prev=>[...prev,id])} onApplyTrigger={applyProactiveNudge} applyDayContextOverride={applyDayContextOverride} shiftTodayWorkout={shiftTodayWorkout} setEnvironmentMode={setEnvironmentMode} environmentSelection={environmentSelection} injuryRule={injuryRule} setInjuryState={setInjuryState} dailyCheckins={dailyCheckins} saveDailyCheckin={saveDailyCheckin} learningLayer={learningLayer} salvageLayer={salvageLayer} validationLayer={validationLayer} optimizationLayer={optimizationLayer} failureMode={failureMode} planComposer={planComposer} saveBodyweights={saveBodyweights} onGoProgram={()=>setTab(1)} />}

        {/* ══════════════════════════════════════════════════════════
            PROGRAM
        ══════════════════════════════════════════════════════════ */}
        {tab === 1 && <PlanTab currentWeek={currentWeek} logs={logs} bodyweights={bodyweights} personalization={personalization} goals={goals} setGoals={setGoals} momentum={momentum} strengthLayer={strengthLayer} weeklyReview={weeklyReview} expectations={expectations} memoryInsights={memoryInsights} recalibration={recalibration} patterns={patterns} getZones={getZones} weekNotes={weekNotes} paceOverrides={paceOverrides} setPaceOverrides={setPaceOverrides} learningLayer={learningLayer} salvageLayer={salvageLayer} failureMode={failureMode} planComposer={planComposer} rollingHorizon={rollingHorizon} horizonAnchor={horizonAnchor} weeklyCheckins={weeklyCheckins} saveWeeklyCheckin={saveWeeklyCheckin} environmentSelection={environmentSelection} setEnvironmentMode={setEnvironmentMode} saveEnvironmentSchedule={saveEnvironmentSchedule} />}

        {/* ══════════════════════════════════════════════════════════
            LOG
        ══════════════════════════════════════════════════════════ */}
        {tab === 2 && <LogTab logs={logs} saveLogs={saveLogs} bodyweights={bodyweights} saveBodyweights={saveBodyweights} currentWeek={currentWeek} todayWorkout={todayWorkout} exportData={exportData} importData={importData} />}

        {/* ══════════════════════════════════════════════════════════
            NUTRITION
        ══════════════════════════════════════════════════════════ */}
        {tab === 3 && <NutritionTab todayWorkout={todayWorkoutHardened} currentWeek={currentWeek} logs={logs} personalization={personalization} goals={goals} momentum={momentum} bodyweights={bodyweights} learningLayer={learningLayer} nutritionLayer={nutritionLayer} realWorldNutrition={realWorldNutrition} nutritionFavorites={nutritionFavorites} saveNutritionFavorites={saveNutritionFavorites} nutritionFeedback={nutritionFeedback} saveNutritionFeedback={saveNutritionFeedback} />}

        {/* ══════════════════════════════════════════════════════════
            COACH
        ══════════════════════════════════════════════════════════ */}
        {tab === 4 && <CoachTab logs={logs} currentWeek={currentWeek} todayWorkout={todayWorkoutHardened} bodyweights={bodyweights} personalization={personalization} momentum={momentum} arbitration={arbitration} expectations={expectations} memoryInsights={memoryInsights} compoundingCoachMemory={compoundingCoachMemory} recalibration={recalibration} strengthLayer={strengthLayer} patterns={patterns} proactiveTriggers={proactiveTriggers} onApplyTrigger={applyProactiveNudge} learningLayer={learningLayer} salvageLayer={salvageLayer} validationLayer={validationLayer} optimizationLayer={optimizationLayer} failureMode={failureMode} planComposer={planComposer} nutritionLayer={nutritionLayer} realWorldNutrition={realWorldNutrition} nutritionFeedback={nutritionFeedback} setPersonalization={setPersonalization} coachActions={coachActions} setCoachActions={setCoachActions} coachPlanAdjustments={coachPlanAdjustments} setCoachPlanAdjustments={setCoachPlanAdjustments} weekNotes={weekNotes} setWeekNotes={setWeekNotes} planAlerts={planAlerts} setPlanAlerts={setPlanAlerts} onPersist={async (nextPersonalization, nextCoachActions, nextCoachPlanAdjustments = coachPlanAdjustments, nextWeekNotes = weekNotes, nextPlanAlerts = planAlerts) => {
          setPersonalization(nextPersonalization);
          setCoachActions(nextCoachActions);
          setCoachPlanAdjustments(nextCoachPlanAdjustments);
          setWeekNotes(nextWeekNotes);
          setPlanAlerts(nextPlanAlerts);
          await persistAll(logs, bodyweights, paceOverrides, nextWeekNotes, nextPlanAlerts, nextPersonalization, nextCoachActions, nextCoachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionFeedback);
        }} />}
      </div>
      )}
    </div>
  );
}

function OnboardingCoach({ onComplete }) {
  const QUESTIONS = [
    { key:"primary_goal_type", prompt:"Coach: What is your primary goal type?", options:[["race","Race performance"],["weight_loss","Weight loss"],["strength","Strength milestone"],["aesthetics","Aesthetics / physique"]] },
    { key:"primary_goal_detail", prompt:"Coach: Define the exact primary target (time/weight/lift/physique).", placeholder:"Example: Sub-1:45 half, -12 lbs, 225 bench, visible abs" },
    { key:"secondary_goals", prompt:"Coach: List up to 3 secondary goals (comma-separated).", placeholder:"Example: Keep Achilles calm, maintain strength, improve sleep" },
    { key:"hard_deadline", prompt:"Coach: What is the hard deadline for this block?", placeholder:"YYYY-MM-DD" },
    { key:"success_30", prompt:"Coach: What does success look like in the next 30 days?", placeholder:"Behavior + measurable early signal" },
    { key:"success_60", prompt:"Coach: What does success look like by 60 days?", placeholder:"Mid-block milestone" },
    { key:"success_90", prompt:"Coach: What does success look like by 90 days?", placeholder:"End-state milestone" },
    { key:"equipment_access", prompt:"Coach: What equipment do you reliably have?", options:["none","dumbbells","basic_gym","full_gym"] },
    { key:"session_time", prompt:"Coach: Typical session window?", options:["20","30","45+"] },
    { key:"schedule_constraint", prompt:"Coach: Biggest schedule constraint this season?", options:["Travel","Work stress","Family logistics","Inconsistent sleep"] },
    { key:"injury_status", prompt:"Coach: Any injury history I should plan around?", options:["none","Achilles sensitivity","Knee flare risk","Lower-back tightness"] },
    { key:"nutrition_style", prompt:"Coach: Nutrition preference for this phase?", options:["High-protein performance","Simple repeatable meals","Body-composition focused","Flexible but structured"] },
    { key:"preferred_environment", prompt:"Coach: Which environment is your default foundation?", options:["Home","Travel","Gym"] },
  ];
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState({});
  const [draft, setDraft] = useState("");
  const [presetDraft, setPresetDraft] = useState({
    Home: { equipment: "dumbbells, pull-up bar", time: "30" },
    Travel: { equipment: "bodyweight only", time: "20" },
    Gym: { equipment: "full rack, barbell, cable stack", time: "45+" },
  });
  const [conflictSummary, setConflictSummary] = useState(null);
  const [priorityRank, setPriorityRank] = useState({});
  const q = QUESTIONS[step];
  const detectConflict = (nextAnswers) => {
    const secondary = (nextAnswers.secondary_goals || "").toLowerCase();
    const hasRace = nextAnswers.primary_goal_type === "race" || /half|marathon|5k|10k|run|race|pace/.test(secondary);
    const hasWeight = nextAnswers.primary_goal_type === "weight_loss" || /weight|fat|lean|cut|lbs|abs/.test(secondary) || /weight|fat|lean|cut|lbs|abs/.test((nextAnswers.primary_goal_detail || "").toLowerCase());
    const hasStrength = nextAnswers.primary_goal_type === "strength" || /strength|bench|squat|deadlift|press|225/.test(secondary) || /strength|bench|squat|deadlift|press|225/.test((nextAnswers.primary_goal_detail || "").toLowerCase());
    const lbs = Number(((nextAnswers.primary_goal_detail || "").match(/(\d+)\s?lb/i) || [])[1] || 0);
    const deadlineDays = nextAnswers.hard_deadline ? Math.round((new Date(nextAnswers.hard_deadline) - new Date()) / (1000 * 60 * 60 * 24)) : null;
    const aggressiveCut = hasWeight && lbs >= 15 && deadlineDays !== null && deadlineDays <= 120;
    if ((hasRace && hasWeight && hasStrength) || aggressiveCut) {
      const priorities = [nextAnswers.primary_goal_detail || "Primary outcome", ...((nextAnswers.secondary_goals || "").split(",").map(s => s.trim()).filter(Boolean).slice(0, 3))].slice(0, 4);
      return {
        summary: aggressiveCut
          ? "Your target implies a rapid bodyweight cut while also asking for performance. Recovery debt will spike."
          : "These goals compete for the same adaptation budget: endurance peak, recomposition, and maximal strength progression.",
        tradeoffs: [
          "Race performance focus reduces peak strength progression speed.",
          "Aggressive fat loss can suppress quality run output and recovery.",
          "Strength PR focus often requires higher energy availability."
        ],
        priorities
      };
    }
    return null;
  };
  const submit = async (value) => {
    const next = { ...answers, [q.key]: value };
    setAnswers(next);
    setDraft("");
    if (step === QUESTIONS.length - 1) {
      const conflict = detectConflict(next);
      if (conflict) {
        setConflictSummary(conflict);
        setPriorityRank(Object.fromEntries(conflict.priorities.map((p, i) => [p, i + 1])));
        return;
      }
      await onComplete({
        ...next,
        environment_presets: Object.fromEntries(Object.entries(presetDraft).map(([k,v]) => [k, { equipment: v.equipment.split(",").map(x => x.trim()).filter(Boolean), time: v.time || "30" }]))
      });
    }
    else setStep(step + 1);
  };
  const finalizeConflict = async () => {
    const ranked = Object.entries(priorityRank).sort((a,b) => Number(a[1]) - Number(b[1])).map(([k]) => k);
    await onComplete({
      ...answers,
      conflict_summary: conflictSummary?.summary || "",
      priority_order: ranked.join(" > "),
      environment_presets: Object.fromEntries(Object.entries(presetDraft).map(([k,v]) => [k, { equipment: v.equipment.split(",").map(x => x.trim()).filter(Boolean), time: v.time || "30" }]))
    });
  };

  return (
    <div style={{ maxWidth:860, margin:"0 auto", display:"grid", gap:"0.75rem" }}>
      <div className="card card-hero" style={{ padding:"1.15rem" }}>
        <div className="sect-title" style={{ color:"var(--phase-accent)", marginBottom:"0.35rem" }}>COACH ONBOARDING</div>
        <div className="coach-copy" style={{ fontSize:"0.63rem" }}>Before I generate your plan, I want to understand you like a real coach. 13 quick questions + environment inventory.</div>
        <div style={{ marginTop:"0.45rem", height:8, background:"#1c2840", borderRadius:999, border:"1px solid #2d4062", overflow:"hidden" }}>
          <div style={{ width:`${Math.round((step / QUESTIONS.length) * 100)}%`, height:"100%", background:"linear-gradient(90deg,var(--phase-accent),#27f59a)" }} />
        </div>
      </div>

      <div className="card card-action" style={{ padding:"1rem" }}>
        {!conflictSummary ? (
          <>
            <div className="coach-copy" style={{ fontSize:"0.66rem", marginBottom:"0.6rem" }}>{q.prompt}</div>
            {q.options ? (
              <div style={{ display:"grid", gap:"0.35rem" }}>
                {q.options.map(opt => {
                  const value = Array.isArray(opt) ? opt[0] : opt;
                  const label = Array.isArray(opt) ? opt[1] : opt;
                  return <button key={value} className="btn" onClick={()=>submit(value)} style={{ justifyContent:"flex-start", textAlign:"left", fontSize:"0.58rem" }}>{label}</button>;
                })}
              </div>
            ) : (
              <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"0.35rem" }}>
                <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder={q.placeholder || "Type your answer"} />
                <button className="btn btn-primary" onClick={()=>submit(draft || "unspecified")}>Next</button>
              </div>
            )}
          </>
        ) : (
          <div style={{ display:"grid", gap:"0.45rem" }}>
            <div className="sect-title" style={{ color:C.amber }}>COACH CONFLICT CHECK</div>
            <div className="coach-copy" style={{ fontSize:"0.6rem" }}>{conflictSummary.summary}</div>
            <div style={{ display:"grid", gap:"0.2rem" }}>
              {conflictSummary.tradeoffs.map((t, i) => <div key={i} style={{ fontSize:"0.56rem", color:"#9fb2cf" }}>• {t}</div>)}
            </div>
            <div style={{ fontSize:"0.55rem", color:"#dbe7f6", letterSpacing:"0.04em" }}>Choose priority order before we build your plan:</div>
            {conflictSummary.priorities.map((p) => (
              <div key={p} style={{ display:"grid", gridTemplateColumns:"1fr 70px", gap:"0.35rem", alignItems:"center" }}>
                <div style={{ fontSize:"0.57rem", color:"#d5e3fb" }}>{p}</div>
                <select value={priorityRank[p] || 1} onChange={e=>setPriorityRank(prev=>({ ...prev, [p]: Number(e.target.value) }))} style={{ fontSize:"0.55rem" }}>
                  {conflictSummary.priorities.map((_, idx) => <option key={idx+1} value={idx+1}>#{idx+1}</option>)}
                </select>
              </div>
            ))}
            <button className="btn btn-primary" onClick={finalizeConflict}>Lock priorities + build plan</button>
          </div>
        )}
      </div>

      <div className="card card-subtle" style={{ padding:"0.9rem" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>ENVIRONMENT PRESETS</div>
        <div className="coach-copy" style={{ fontSize:"0.55rem", marginBottom:"0.35rem" }}>Edit your equipment inventory presets. These become the foundation for workout prescription.</div>
        {["Home","Travel","Gym"].map((env) => (
          <div key={env} style={{ display:"grid", gridTemplateColumns:"90px 1fr 70px", gap:"0.3rem", alignItems:"center", marginBottom:"0.3rem" }}>
            <div className="mono" style={{ fontSize:"0.52rem", color:"#9db4d4" }}>{env}</div>
            <input value={presetDraft[env].equipment} onChange={e=>setPresetDraft(prev=>({ ...prev, [env]: { ...prev[env], equipment: e.target.value } }))} placeholder="equipment list" />
            <select value={presetDraft[env].time} onChange={e=>setPresetDraft(prev=>({ ...prev, [env]: { ...prev[env], time: e.target.value } }))} style={{ fontSize:"0.56rem" }}>
              {["20","30","45+"].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
        ))}
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
  const defaultCheckin = {
    ...DEFAULT_DAILY_CHECKIN,
    ...(dailyCheckins?.[todayKey] || todayLog?.checkin || {}),
    readiness: {
      ...(DEFAULT_DAILY_CHECKIN.readiness || {}),
      ...((dailyCheckins?.[todayKey] || todayLog?.checkin || {}).readiness || {}),
    },
  };
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
  const phase = WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
  const datedLogs = Object.entries(logs || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
  const todayIso = todayDate.toISOString().split("T")[0];
  const historicalLogs = datedLogs.filter(([date]) => date < todayIso);
  const latestHistoricalLog = historicalLogs[historicalLogs.length - 1]?.[1] || null;
  const yesterday = new Date(todayDate);
  yesterday.setDate(todayDate.getDate() - 1);
  const yesterdayKey = yesterday.toISOString().split("T")[0];
  const yesterdayLog = logs?.[yesterdayKey] || null;
  const hardSessionRegex = /(interval|tempo|long|hard|race)/i;
  const hadHardSessionYesterday = hardSessionRegex.test(String(yesterdayLog?.type || ""));
  const lastSessionType = latestHistoricalLog?.type || "recent session";
  const lastSessionFeel = latestHistoricalLog?.checkin?.sessionFeel || latestHistoricalLog?.feel || "about_right";
  const weeklyIntensityLoad = historicalLogs
    .slice(-7)
    .filter(([, entry]) => hardSessionRegex.test(String(entry?.type || ""))).length;
  const raceDate = new Date("2026-07-19T00:00:00");
  raceDate.setHours(0, 0, 0, 0);
  const daysToRace = Math.max(0, Math.ceil((raceDate.getTime() - todayDate.getTime()) / (1000 * 60 * 60 * 24)));
  const isScheduledEasyDay = todayWorkout?.type === "easy-run" || todayWorkout?.type === "rest" || todayWorkout?.run?.t === "Easy";
  const todayWhyNow = buildTodayWhyNowSentence({
    phase,
    lastSessionType,
    lastSessionFeel,
    daysToRace,
    weeklyIntensityLoad,
    isScheduledEasyDay,
    hadHardSessionYesterday,
  });
  const recentSessionRows = historicalLogs.slice(-5).map(([, entry]) => entry || {});
  const feelToScore = (entry = {}) => {
    const numeric = Number(entry?.feel);
    if (Number.isFinite(numeric) && numeric > 0) return numeric;
    const feelTag = String(entry?.checkin?.sessionFeel || "").toLowerCase();
    if (feelTag === "easier_than_expected") return 4;
    if (feelTag === "harder_than_expected") return 2;
    return 3;
  };
  const easierSessionsObservation = buildEasierSessionsObservation({
    feelRatingsLast5: recentSessionRows.map(feelToScore),
    sessionTypes: recentSessionRows.map((r) => r?.type || r?.label || "session"),
    currentPaceTargets: { easy: zones?.easy, tempo: zones?.tempo, int: zones?.int, long: zones?.long },
    phase,
    weeksToRace: Math.max(0, Math.ceil(daysToRace / 7)),
  });
  const currentHour = new Date().getHours();
  const timePalette = currentHour < 11
    ? { label: "Morning ramp", tint: "rgba(255,164,77,0.24)", base: "rgba(255,122,89,0.16)" }
    : currentHour < 17
    ? { label: "Midday drive", tint: "rgba(0,194,255,0.22)", base: "rgba(124,92,255,0.16)" }
    : { label: "Evening focus", tint: "rgba(79,140,255,0.24)", base: "rgba(79,90,255,0.16)" };
  const intensityLevel = todayWorkout?.type === "hard-run" || todayWorkout?.run?.t === "Intervals"
    ? "high"
    : todayWorkout?.type === "long-run" || todayWorkout?.run?.t === "Tempo"
    ? "build"
    : todayWorkout?.type === "rest"
    ? "reset"
    : "steady";
  const intensityPalette = intensityLevel === "high"
    ? { glow: "rgba(255,61,129,0.36)", streak: "rgba(255,138,0,0.28)" }
    : intensityLevel === "build"
    ? { glow: "rgba(124,92,255,0.33)", streak: "rgba(0,194,255,0.26)" }
    : intensityLevel === "reset"
    ? { glow: "rgba(86,112,153,0.28)", streak: "rgba(72,97,133,0.2)" }
    : { glow: "rgba(39,245,154,0.28)", streak: "rgba(0,194,255,0.22)" };
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
              setCheckinAck(readinessUpdate.readinessFilled ? "Saved. Readiness captured for quiet coach adjustment." : "Saved.");
              const daysToRaceNow = Math.max(0, Math.ceil((new Date("2026-07-19T00:00:00").getTime() - new Date().setHours(0, 0, 0, 0)) / (1000 * 60 * 60 * 24)));
              const skipDecision = (payload.status === "skipped" && todayIsQuality)
                ? buildSkippedQualityDecision({
                    skippedSessionType: todayWorkout?.run?.t || todayWorkout?.label || todayWorkout?.type || "quality session",
                    dayOfWeek: todayDay,
                    remainingSessions: remainingQualitySessions,
                    daysToRace: daysToRaceNow,
                    weekType: phase,
                    tomorrowSessionType: tomorrowWorkout?.run?.t || tomorrowWorkout?.label || tomorrowWorkout?.type || "",
                  })
                : null;
              setPostSaveInsight(skipDecision || buildCheckinReadSummary({
                checkin: payload,
                todayWorkout,
                environmentSelection,
                momentum,
                recentWorkoutCount: completed7,
              }));
              if (checkin.bodyweight && !Number.isNaN(parseFloat(checkin.bodyweight))) {
                const entry = { date: todayKey, w: parseFloat(checkin.bodyweight) };
                const nextBW = [...bodyweights.filter(b => b.date !== todayKey), entry].sort((a,b) => a.date.localeCompare(b.date));
                await saveBodyweights(nextBW);
              }
            }} style={{ fontSize:"0.55rem", opacity: checkin.status === "not_logged" ? 0.4 : 1 }}>SAVE</button>
          </div>
          {checkinAck && <div style={{ fontSize:"0.54rem", color:C.green }}>{checkinAck}</div>}
          {postSaveInsight && <div style={{ fontSize:"0.54rem", color:C.amber, whiteSpace:"pre-wrap", lineHeight:1.6 }}>{postSaveInsight}</div>}
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

function WorkoutBlock({ title, color, items, icon, routine = [], defaultOpen = false }) {
  const [expanded, setExpanded] = useState(defaultOpen);
  return (
    <div style={{ background:"#0f172a", borderRadius:10, padding:"1rem", border:`1px solid ${color}15` }}>
      <div style={{ fontSize:"0.78rem", color, marginBottom:"0.6rem", fontWeight:500, display:"flex", alignItems:"center", gap:"0.38rem" }}>
        <Glyph name={icon || "easy_run"} color={color} size={14} />
        <span>{title}</span>
      </div>
      <div style={{ display:"flex", gap:"1.25rem", flexWrap:"wrap" }}>
        {items.map(item => (
          <div key={item.label}>
            <div style={{ fontSize:"0.7rem", color:"#475569", marginBottom:"0.15rem" }}>{item.label}</div>
            <div className="mono" style={{ fontSize:"0.95rem", color, fontWeight:500 }}>{item.val}</div>
          </div>
        ))}
      </div>
      {routine.length > 0 && (
        <div style={{ marginTop:"0.65rem", borderTop:"1px solid rgba(148,163,184,0.18)", paddingTop:"0.5rem" }}>
          <button className="btn" onClick={()=>setExpanded(v => !v)} style={{ fontSize:"0.52rem", color, borderColor:`${color}35`, padding:"0.28rem 0.5rem" }}>
            {expanded ? "Hide prescribed routine" : "Show full prescribed routine"}
          </button>
          {expanded && (
            <div style={{ marginTop:"0.5rem", display:"grid", gap:"0.35rem" }}>
              {routine.map((step, idx) => (
                <div key={`${step.ex}-${idx}`} style={{ background:"#0b1220", border:"1px solid rgba(148,163,184,0.2)", borderRadius:9, padding:"0.5rem 0.55rem" }}>
                  <div style={{ fontSize:"0.58rem", color:"#f1f5f9", marginBottom:"0.2rem" }}>{idx + 1}. {step.ex}</div>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(4,minmax(0,1fr))", gap:"0.35rem", marginBottom:"0.2rem" }}>
                    <div><div style={{ fontSize:"0.45rem", color:"#64748b" }}>SETS</div><div className="mono" style={{ fontSize:"0.53rem", color:"#cbd5e1" }}>{step.sets}</div></div>
                    <div><div style={{ fontSize:"0.45rem", color:"#64748b" }}>REPS/TIME</div><div className="mono" style={{ fontSize:"0.53rem", color:"#cbd5e1" }}>{step.reps}</div></div>
                    <div><div style={{ fontSize:"0.45rem", color:"#64748b" }}>REST</div><div className="mono" style={{ fontSize:"0.53rem", color:"#cbd5e1" }}>{step.rest}</div></div>
                    <div><div style={{ fontSize:"0.45rem", color:"#64748b" }}>CUE</div><div style={{ fontSize:"0.53rem", color:"#cbd5e1" }}>{step.cue}</div></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── PLAN TAB ──────────────────────────────────────────────────────────────────
function PlanTab({ currentWeek, logs, bodyweights, personalization, goals, setGoals, momentum, strengthLayer, weeklyReview, expectations, memoryInsights, recalibration, patterns, getZones, weekNotes, paceOverrides, setPaceOverrides, learningLayer, salvageLayer, failureMode, planComposer, rollingHorizon, horizonAnchor, weeklyCheckins, saveWeeklyCheckin, environmentSelection, setEnvironmentMode, saveEnvironmentSchedule }) {
  const [openWeek, setOpenWeek] = useState(null);
  const weeklyDraft = weeklyCheckins?.[String(currentWeek)] || { energy: 3, stress: 3, confidence: 3 };
  const [miniWeekly, setMiniWeekly] = useState(weeklyDraft);
  const [scheduleDraft, setScheduleDraft] = useState({ startDate: "", endDate: "", mode: "Travel" });
  const [phaseExpanded, setPhaseExpanded] = useState(false);
  const [strengthTrackerOpen, setStrengthTrackerOpen] = useState(false);
  const [openLiftKey, setOpenLiftKey] = useState("");
  const scheduleEntries = personalization?.environmentConfig?.schedule || [];
  const weeklyProgress = Math.max(0, Math.min(100, Math.round((((Number(miniWeekly.energy) || 0) + (Number(miniWeekly.confidence) || 0) + (6 - (Number(miniWeekly.stress) || 0))) / 15) * 100)));
  const weeklyGoalHit = (Number(miniWeekly.energy) || 0) >= 4 && (Number(miniWeekly.confidence) || 0) >= 4 && (Number(miniWeekly.stress) || 0) <= 3;
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
  const phaseNarrative = buildNamedPhaseArc({ rollingHorizon, goals });
  const primaryCategory = goals.find(g => g.active)?.category || "running";
  const phaseLabels = PHASE_ARC_LABELS[primaryCategory] || PHASE_ARC_LABELS.running;
  const currentTemplate = (rollingHorizon || []).find(h => h.absoluteWeek === currentWeek)?.template || {};
  const currentPhase = currentTemplate.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
  const currentPhaseMeta = phaseLabels[currentPhase] || { name: currentPhase, objective: "Execute core plan priorities." };
  const nextPhaseBlock = phaseNarrative.find(b => b.startWeek > currentWeek);
  const dayOfWeek = new Date().getDay();
  const daysLeftInWeek = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const daysToShift = nextPhaseBlock ? Math.max(1, ((nextPhaseBlock.startWeek - currentWeek - 1) * 7) + daysLeftInWeek) : null;
  const phaseShortMeaning = primaryCategory === "body_comp"
    ? "Deficit week"
    : primaryCategory === "strength"
    ? "Strength progression"
    : "Endurance progression";
  const phaseBanner = `${currentPhaseMeta.name.replace(" Phase", "")} · ${phaseShortMeaning} · ${daysToShift ? `transitions in ${daysToShift} days.` : "current block active."}`;
  const strengthProgress = deriveStrengthProgressTracker({ logs, goals, strengthLayer });
  const weeklyCoachBrief = buildWeeklyPlanningCoachBrief({
    goals,
    momentum,
    learningLayer,
    failureMode,
    salvageLayer,
    weeklyCheckin: miniWeekly,
    environmentSelection,
    patterns,
  });
  const plannedSessionsThisWeek = [1, 2, 3, 4, 5, 6]
    .map((d) => getTodayWorkout(currentWeek, d))
    .filter((w) => w && w.type !== "rest").length;
  const currentWeekStart = new Date();
  currentWeekStart.setHours(0, 0, 0, 0);
  const currentWeekDay = currentWeekStart.getDay();
  const mondayShift = currentWeekDay === 0 ? -6 : 1 - currentWeekDay;
  currentWeekStart.setDate(currentWeekStart.getDate() + mondayShift);
  const weekBounds = (offset = 0) => {
    const start = new Date(currentWeekStart);
    start.setDate(start.getDate() + (offset * 7));
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
  };
  const completionStatuses = new Set(["completed_as_planned", "completed_modified", "partial_completed"]);
  const weekEntries = (offset = 0) => {
    const { start, end } = weekBounds(offset);
    return Object.entries(logs || {}).filter(([date]) => date >= start && date <= end);
  };
  const completedCountForEntries = (entries = []) => entries.filter(([, l]) => {
    const status = l?.checkin?.status;
    return completionStatuses.has(status) || Number(l?.miles || 0) > 0 || String(l?.type || "").length > 0;
  }).length;
  const sessionsCompletedThisWeek = completedCountForEntries(weekEntries(0));
  const feelAvgThisWeek = (() => {
    const vals = weekEntries(0).map(([, l]) => Number(l?.feel)).filter((n) => Number.isFinite(n) && n > 0);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 3;
  })();
  const completionRateLast3weeks = (() => {
    const rates = [-1, -2, -3].map((offset) => {
      const entries = weekEntries(offset);
      if (!entries.length) return 0;
      const completed = completedCountForEntries(entries);
      const planned = Math.max(1, plannedSessionsThisWeek);
      return Math.min(1, completed / planned);
    });
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  })();
  const completionRateLast4weeks = (() => {
    const rates = [-1, -2, -3, -4].map((offset) => {
      const entries = weekEntries(offset);
      if (!entries.length) return 0;
      const completed = completedCountForEntries(entries);
      const planned = Math.max(1, plannedSessionsThisWeek);
      return Math.min(1, completed / planned);
    });
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  })();
  const completionRateThisWeek = Math.min(1, sessionsCompletedThisWeek / Math.max(1, plannedSessionsThisWeek));
  const nextWeekType = (() => {
    const lowEnergy = Number(miniWeekly?.energy || 3) <= 2;
    const highStress = Number(miniWeekly?.stress || 3) >= 4;
    const lowConfidence = Number(miniWeekly?.confidence || 3) <= 2;
    const chaotic = failureMode?.mode === "chaotic" || salvageLayer?.active;
    const slipping = ["drifting", "falling off"].includes(momentum?.momentumState) || momentum?.inconsistencyRisk === "high";
    const lockedIn = momentum?.momentumState === "building momentum" && !slipping && !chaotic;
    if (chaotic || lowEnergy || highStress) return "reduced-load week";
    if (slipping || lowConfidence) return "rebuild week";
    if (lockedIn) return "progression week";
    return "consistency week";
  })();
  const weeklyConsistencyAnchor = buildWeeklyConsistencyAnchor({
    sessionsCompleted: sessionsCompletedThisWeek,
    sessionsPlanned: plannedSessionsThisWeek,
    feelAvg: feelAvgThisWeek,
    completionRateLast3weeks,
    nextWeekType,
  });
  const badWeekTriage = completionRateThisWeek < 0.6
    ? buildBadWeekTriageResponse({
        completionRateThisWeek,
        completionRateLast4weeks,
        feelAvg: feelAvgThisWeek,
        checkInStress: miniWeekly?.stress,
        nextWeekPlan: nextWeekType,
      })
    : "";

  return (
    <div className="fi">
      <div className="card card-soft" style={{ marginBottom:"0.85rem", borderColor:C.green+"2f" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.35rem" }}>WEEKLY COACH BRIEF</div>
        <div className="coach-copy" style={{ fontSize:"0.56rem", whiteSpace:"pre-wrap", lineHeight:1.65 }}>{weeklyCoachBrief}</div>
      </div>
      <div className="card card-soft" style={{ marginBottom:"0.85rem", borderColor:C.blue+"35" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>WEEKLY CONSISTENCY ANCHOR</div>
        <div className="coach-copy" style={{ fontSize:"0.56rem", lineHeight:1.62 }}>{weeklyConsistencyAnchor}</div>
      </div>
      {!!badWeekTriage && (
        <div className="card card-soft" style={{ marginBottom:"0.85rem", borderColor:C.amber+"35" }}>
          <div className="sect-title" style={{ color:C.amber, marginBottom:"0.35rem" }}>WEEKLY TRIAGE DECISION</div>
          <div className="coach-copy" style={{ fontSize:"0.56rem", lineHeight:1.62 }}>{badWeekTriage}</div>
        </div>
      )}
      <div className="card card-strong card-hero" style={{ marginBottom:"0.85rem", borderColor:C.blue+"30" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>YOUR PROGRAM</div>
        <button className="btn" onClick={()=>setPhaseExpanded(v=>!v)} style={{ width:"100%", justifyContent:"flex-start", textAlign:"left", fontSize:"0.56rem", color:"#dbe7f6", borderColor:"#2b3f5e", background:"rgba(9,16,30,0.45)", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis", marginBottom:"0.35rem" }}>
          {phaseBanner}
        </button>
        {phaseExpanded && (
          <div style={{ maxHeight:"50vh", overflowY:"auto", border:"1px solid #243752", borderRadius:10, padding:"0.55rem 0.6rem", background:"rgba(8,14,26,0.75)", marginBottom:"0.45rem" }}>
            <div style={{ fontSize:"0.66rem", color:"#f1f5f9", marginBottom:"0.25rem" }}>{currentPhaseMeta.name}</div>
            <div style={{ fontSize:"0.56rem", color:"#b8cae6", lineHeight:1.6, marginBottom:"0.3rem" }}>{currentPhaseMeta.objective}</div>
            <div style={{ fontSize:"0.54rem", color:"#8fa5c8", marginBottom:"0.2rem" }}>{daysToShift ? `Expected transition in ~${daysToShift} days.` : "No transition currently scheduled in horizon."}</div>
            <div style={{ display:"grid", gap:"0.18rem", fontSize:"0.53rem", color:"#9fb2d2" }}>
              {phaseNarrative.slice(0, 5).map((block, idx) => (
                <div key={`${block.phase}-${idx}`}>• W{block.startWeek}–W{block.endWeek}: {block.name}</div>
              ))}
            </div>
          </div>
        )}
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
        {personalization?.goalState?.milestones && (
          <div style={{ marginTop:"0.3rem", fontSize:"0.55rem", color:"#9eb2cf", lineHeight:1.6 }}>
            30d: {personalization.goalState.milestones.day30} · 60d: {personalization.goalState.milestones.day60} · 90d: {personalization.goalState.milestones.day90}
          </div>
        )}
        <div style={{ marginTop:"0.45rem", display:"grid", gridTemplateColumns:"1fr auto auto", gap:"0.3rem", alignItems:"center" }}>
          <select value={environmentSelection?.mode || personalization?.environmentConfig?.defaultMode || "Home"} onChange={e=>setEnvironmentMode({ mode:e.target.value, scope: "week" })} style={{ fontSize:"0.55rem" }}>
            {["Home","Gym","Travel"].map(m => <option key={m} value={m}>{m}</option>)}
          </select>
          <button className="btn" onClick={()=>setEnvironmentMode({ mode: environmentSelection?.mode || "Home", scope: "week" })} style={{ fontSize:"0.5rem" }}>This week</button>
          <button className="btn" onClick={()=>setEnvironmentMode({ mode: environmentSelection?.mode || "Home", scope: "base" })} style={{ fontSize:"0.5rem" }}>Set default</button>
        </div>
        <div style={{ marginTop:"0.45rem", borderTop:"1px solid #203047", paddingTop:"0.42rem" }}>
          <div style={{ fontSize:"0.5rem", color:"#8fa5c8", marginBottom:"0.28rem", letterSpacing:"0.08em" }}>CALENDAR ENVIRONMENT SCHEDULE</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 90px auto", gap:"0.28rem", alignItems:"center" }}>
            <input type="date" value={scheduleDraft.startDate} onChange={e=>setScheduleDraft(prev=>({ ...prev, startDate:e.target.value }))} />
            <input type="date" value={scheduleDraft.endDate} onChange={e=>setScheduleDraft(prev=>({ ...prev, endDate:e.target.value }))} />
            <select value={scheduleDraft.mode} onChange={e=>setScheduleDraft(prev=>({ ...prev, mode:e.target.value }))} style={{ fontSize:"0.54rem" }}>
              {["Travel","Home","Gym"].map(m => <option key={m} value={m}>{m}</option>)}
            </select>
            <button className="btn" onClick={()=>{
              if (!scheduleDraft.startDate || !scheduleDraft.endDate) return;
              const next = [
                ...scheduleEntries,
                { id:`env_${Date.now()}`, startDate:scheduleDraft.startDate, endDate:scheduleDraft.endDate, mode:scheduleDraft.mode }
              ].sort((a,b) => String(a.startDate).localeCompare(String(b.startDate)));
              saveEnvironmentSchedule(next);
              setScheduleDraft({ startDate:"", endDate:"", mode:"Travel" });
            }} style={{ fontSize:"0.52rem" }}>Add</button>
          </div>
          <div style={{ marginTop:"0.24rem", fontSize:"0.51rem", color:"#7085a8" }}>Example: Apr 10–14 set to Travel once; Today auto-switches silently on those dates.</div>
          {scheduleEntries.length > 0 && (
            <div style={{ marginTop:"0.35rem", display:"grid", gap:"0.22rem" }}>
              {scheduleEntries.slice(0, 6).map((slot) => (
                <div key={slot.id || `${slot.startDate}-${slot.endDate}-${slot.mode}`} style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"0.25rem", alignItems:"center", fontSize:"0.53rem", color:"#dbe6f7" }}>
                  <div>{slot.startDate} → {slot.endDate}: {slot.mode}</div>
                  <button className="btn" onClick={()=>saveEnvironmentSchedule(scheduleEntries.filter(x => (x.id || `${x.startDate}-${x.endDate}-${x.mode}`) !== (slot.id || `${slot.startDate}-${slot.endDate}-${slot.mode}`)))} style={{ fontSize:"0.49rem", padding:"0.12rem 0.35rem" }}>remove</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card card-soft card-action" style={{ marginBottom:"0.85rem" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.45rem" }}>
          <div className="sect-title" style={{ color:C.green }}>THIS WEEK CHECK-IN</div>
          <div className={weeklyGoalHit ? "pulse-ring" : ""} style={{ width:40, height:40, borderRadius:999, display:"grid", placeItems:"center", background:`conic-gradient(${C.green} ${weeklyProgress * 3.6}deg, #25334a 0deg)`, padding:3 }}>
            <div className="mono" style={{ width:"100%", height:"100%", borderRadius:999, display:"grid", placeItems:"center", background:"#0f172a", fontSize:"0.52rem", color:weeklyGoalHit ? C.green : "#94a3b8" }}>{weeklyProgress}%</div>
          </div>
        </div>
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

      <div className="card card-subtle" style={{ marginBottom:"0.85rem" }}>
        <div className="sect-title" style={{ color:C.purple, marginBottom:"0.38rem" }}>PLAN ARC NARRATIVE</div>
        <div style={{ display:"grid", gap:"0.35rem" }}>
          {phaseNarrative.map((b, i) => (
            <div key={`${b.phase}_${i}`} style={{ display:"grid", gridTemplateColumns:"88px 1fr", gap:"0.45rem", alignItems:"start", background:"#0f172a", border:"1px solid #20314a", borderRadius:9, padding:"0.45rem 0.5rem" }}>
              <div className="mono" style={{ fontSize:"0.5rem", color:"#9db2d2" }}>W{b.startWeek}–W{b.endWeek}</div>
              <div>
                <div style={{ fontSize:"0.6rem", color:"#e6efff" }}>{b.name}</div>
                <div style={{ fontSize:"0.54rem", color:"#8fa3c2", marginTop:"0.1rem" }}>{b.objective}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="card card-subtle" style={{ marginBottom:"0.85rem" }}>
        <button className="btn" onClick={()=>setStrengthTrackerOpen(v=>!v)} style={{ width:"100%", justifyContent:"space-between", fontSize:"0.56rem", color:C.blue, borderColor:C.blue+"30" }}>
          <span>STRENGTH PROGRESSION TRACKER</span>
          <span>{strengthTrackerOpen ? "Hide" : "View"}</span>
        </button>
        {strengthTrackerOpen && (
          <div style={{ marginTop:"0.4rem", display:"grid", gap:"0.3rem" }}>
            {strengthProgress.map((lift) => (
              <div key={lift.key} style={{ border:"1px solid #20314a", borderRadius:9, background:"#0f172a", padding:"0.4rem 0.45rem" }}>
                <button className="btn" onClick={()=>setOpenLiftKey(prev => prev === lift.key ? "" : lift.key)} style={{ width:"100%", justifyContent:"space-between", fontSize:"0.55rem", color:"#dbe7f6", borderColor:"transparent", padding:"0.1rem 0" }}>
                  <span style={{ whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{lift.label}: {lift.current} → {lift.goal} → {lift.projected}</span>
                </button>
                {openLiftKey === lift.key && (
                  <div style={{ marginTop:"0.25rem", fontSize:"0.53rem", color:"#9fb2d2", display:"grid", gap:"0.15rem" }}>
                    {(lift.sessions.length ? lift.sessions : [{ date: new Date().toISOString().split("T")[0], note: "No recent logged sessions yet.", load: null }]).map((s, idx) => (
                      <div key={`${lift.key}_${idx}`}>• {s.date}: {s.load ? `${s.load} lb` : "Logged"} {s.note ? `— ${s.note}` : ""}</div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
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
            <div key={h.absoluteWeek} className={`card ${isCurrent ? "card-action" : "card-subtle"}`} style={{ borderColor:isCurrent ? C.green+"55" : "#1e293b", background:isCurrent ? "#0a160f" : "#0d1117" }}>
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
                      <div style={{ fontSize:"0.58rem", color:"#e2e8f0", marginTop:"0.1rem", display:"flex", alignItems:"center", gap:"0.28rem" }}>
                        <Glyph name={RUN_TYPE_ICON[val.t] || "easy_run"} color={boxTone} size={12} />
                        <span>{val.t}</span>
                      </div>
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
      <div className="card card-action" style={{ marginBottom:"0.8rem", borderColor:C.green+"40", background:"#0d1711" }}>
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
          {saved && <div className="completion-pop" style={{ fontSize:"0.57rem", color:C.green, display:"inline-flex", alignItems:"center", gap:"0.3rem", background:"rgba(39,245,154,0.1)", border:"1px solid rgba(39,245,154,0.38)", borderRadius:999, padding:"0.18rem 0.5rem" }}><span className="mono">✓</span> {savedMsg}</div>}
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

const buildSundayStoreGroceryList = ({ store, nutritionLayer, realWorldNutrition }) => {
  const phaseMode = (nutritionLayer?.phaseMode || "maintain").toLowerCase();
  const mealText = `${realWorldNutrition?.mealStructure?.breakfast || ""} ${realWorldNutrition?.mealStructure?.lunch || ""} ${realWorldNutrition?.mealStructure?.dinner || ""}`.toLowerCase();
  const hasRice = /rice/.test(mealText) || phaseMode === "build";
  const hasOats = /oat/.test(mealText) || phaseMode !== "cut";
  const hasYogurt = /yogurt/.test(mealText) || true;
  const sections = [
    { name: "Produce", items: ["bananas", "berries", "mixed salad greens", "broccoli", "sweet potatoes"] },
    { name: "Protein", items: ["chicken breast", "lean ground turkey", "eggs", hasYogurt ? "Greek yogurt" : null].filter(Boolean) },
    { name: "Carbs", items: [hasRice ? "jasmine rice" : null, hasOats ? "rolled oats" : null, "whole-grain wraps", "fruit"].filter(Boolean) },
    { name: "Fats", items: ["avocado", "olive oil", "mixed nuts"] },
    { name: "Pantry/Hydration", items: ["electrolytes", "sparkling water", "salsa/hot sauce"] },
  ];
  const filteredSections = sections.map(sec => ({ ...sec, items: sec.items.filter(Boolean) })).filter(sec => sec.items.length > 0);
  return {
    title: `Sunday list for ${store} · next week (${phaseMode.toUpperCase()})`,
    sections: filteredSections,
    text: filteredSections.map(sec => `${sec.name}: ${sec.items.join(", ")}`).join("\n"),
  };
};

const buildLocationAwareOrderSuggestion = ({ nearby = [] }) => {
  const nameList = (nearby || []).map(n => String(n?.name || "").toLowerCase());
  if (nameList.some(n => n.includes("chipotle"))) {
    return "You're near Chipotle: double chicken, fajita veggies, black beans, no sour cream = 54g protein, on plan.";
  }
  if (nameList.some(n => n.includes("cava"))) {
    return "You're near CAVA: greens + grains, double chicken, hummus on side = ~48g protein, on plan.";
  }
  if (nameList.some(n => n.includes("panera"))) {
    return "You're near Panera: teriyaki chicken bowl + Greek yogurt = ~42g protein, on plan.";
  }
  return null;
};

// ── NUTRITION TAB (REDESIGNED) ──────────────────────────────────────────────
function NutritionTab({ todayWorkout, currentWeek, logs, personalization, goals, momentum, bodyweights, learningLayer, nutritionLayer, realWorldNutrition, nutritionFavorites, saveNutritionFavorites, nutritionFeedback, saveNutritionFeedback }) {
  const localFoodContext = personalization?.localFoodContext || { city: "Chicago", groceryOptions: ["Trader Joe's"] };
  const [store, setStore] = useState(localFoodContext.groceryOptions?.[0] || "Trader Joe's");
  const favorites = nutritionFavorites || { restaurants: [], groceries: [], safeMeals: [], travelMeals: [], defaultMeals: [] };
  const [nutritionCheck, setNutritionCheck] = useState({ status: "on_track", issue: "", note: "" });
  const [lastKey, setLastKey] = useState("");
  const [showNutritionWhy, setShowNutritionWhy] = useState(false);
  const [openMealKey, setOpenMealKey] = useState("");
  const [sundayGrocery, setSundayGrocery] = useState(null);
  const [groceryShareAck, setGroceryShareAck] = useState("");
  const [fridgeInput, setFridgeInput] = useState("");
  const [fridgeCoachReply, setFridgeCoachReply] = useState("");
  const [hydrationOz, setHydrationOz] = useState(0);
  const [hydrationNudgedAt, setHydrationNudgedAt] = useState(null);
  const [showHydrationNudge, setShowHydrationNudge] = useState(false);
  const goalContext = getGoalContext(goals) || { primary: null, secondary: [] };
  const dayType = nutritionLayer?.dayType || todayWorkout?.nutri || "easyRun";
  const city = localFoodContext.city || "Chicago";
  const nearby = (getPlaceRecommendations({ city, dayType, favorites, mode: "nearby", query: "" }) || [])
    .map((x, i) => ({ id: x?.id || `nearby_${i}_${x?.name || "option"}`, name: x?.name || "Nearby option", meal: x?.meal || "Protein + carbs + produce" }))
    .filter(x => x.id !== lastKey)
    .slice(0, 2);
  const locationAwareOrder = buildLocationAwareOrderSuggestion({ nearby });
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
  const resolvedTargets = nutritionLayer?.targets || { cal: 2500, p: 190, c: 240, f: 70 };
  const phaseMode = (nutritionLayer?.phaseMode || "maintain").toUpperCase();
  const currentPhase = WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
  const todayDate = new Date();
  todayDate.setHours(0, 0, 0, 0);
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
  const intensityBonus = (["hard", "long"].includes(workoutType) || ["hardRun", "longRun", "travelRun"].includes(dayType))
    ? 30
    : (["easy", "otf", "strength"].includes(workoutType) || ["easyRun", "otf", "strength"].includes(dayType))
    ? 18
    : 8;
  const hydrationTargetOz = Math.max(80, Math.round((latestWeight * 0.5) + intensityBonus));
  const hydrationPct = Math.max(0, Math.min(100, Math.round(((hydrationOz || 0) / hydrationTargetOz) * 100)));

  const proteinLevel = `${Math.round(resolvedTargets.p)}g`;
  const carbLevel = `${Math.round(resolvedTargets.c)}g`;
  const calorieLevel = `${Math.round(resolvedTargets.cal)} kcal`;
  const nutritionCoachBrief = buildNutritionCoachBrief({
    primaryGoal: goalContext?.primary?.name,
    dayType,
    targets: resolvedTargets,
    momentum,
    travelMode: nutritionLayer?.travelMode,
    simplifiedWeek,
    constraints: realWorldNutrition?.constraints || [],
  });
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
  const supplementPlan = realWorldNutrition?.supplements?.length
    ? realWorldNutrition.supplements
    : ["Creatine", "Electrolytes", "Magnesium", "Omega-3", "Vitamin D3"];
  const nowHour = new Date().getHours();
  const sessionTime = nowHour < 12 ? "afternoon" : nowHour < 17 ? "evening" : "tomorrow morning";
  const supplementTimingLines = buildTodaySupplementTimingLines({
    sessionTime,
    sessionType: dayType || todayWorkout?.type || "session",
    phase: `${phaseMode}/${currentPhase}`,
    supplementStack: supplementPlan,
  });
  const supplementCoachBrief = buildSupplementCoachBrief({
    primaryGoal: goalContext?.primary?.name,
    trainingStyle: todayWorkout?.type || dayType,
    adherenceNotes: simplifiedWeek ? "consistency has been mixed, so keep supplements simple and repeatable" : "adherence is stable, so maintain a minimal core stack",
    recoveryNotes: recoveryDay ? "recovery is currently a priority" : hardDay ? "higher training load raises hydration/recovery demand" : "steady recovery habits are the priority",
    detailed: (personalization?.coachMemory?.simplicityVsVariety || "").toLowerCase().includes("variety"),
  });
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

  const todayKey = new Date().toISOString().split("T")[0];
  const feedbackToday = nutritionFeedback?.[todayKey];
  useEffect(() => {
    if (!feedbackToday) return;
    setNutritionCheck(feedbackToday);
    setHydrationOz(Number(feedbackToday?.hydrationOz || 0));
    setHydrationNudgedAt(feedbackToday?.hydrationNudgedAt || null);
  }, [feedbackToday?.ts]);
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 15 || hydrationPct >= 50 || hydrationNudgedAt || showHydrationNudge) return;
    setShowHydrationNudge(true);
    const nudgedAt = Date.now();
    setHydrationNudgedAt(nudgedAt);
    saveNutritionFeedback(todayKey, { ...nutritionCheck, hydrationOz, hydrationTargetOz, hydrationNudgedAt: nudgedAt });
  }, [hydrationPct, hydrationNudgedAt, showHydrationNudge, todayKey]);
  const requestFridgeMeal = () => {
    const reply = deriveFridgeCoachMealSuggestion({ fridgeInput, dayType });
    setFridgeCoachReply(reply.coachLine || "");
  };
  const logHydration = async (oz = 12) => {
    const nextOz = Math.min(hydrationTargetOz, (hydrationOz || 0) + oz);
    setHydrationOz(nextOz);
    await saveNutritionFeedback(todayKey, { ...nutritionCheck, hydrationOz: nextOz, hydrationTargetOz, hydrationNudgedAt });
  };

  return (
    <div className="fi">
      <div className="card card-strong card-hero" style={{ marginBottom:"0.8rem", borderColor:C.green+"28" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.45rem" }}>TODAY'S DIRECTION</div>
        <div style={{ fontSize:"0.66rem", color:"#e2e8f0", lineHeight:1.65 }}>{topGuidance}</div>
        <div style={{ fontSize:"0.58rem", color:"#cbd5e1", lineHeight:1.65, marginTop:"0.2rem" }}>{secondGuidance}</div>
        <div style={{ fontSize:"0.56rem", color:"#94a3b8", lineHeight:1.65, marginTop:"0.2rem" }}>{thirdGuidance}</div>
      </div>
      <div className="card card-soft" style={{ marginBottom:"0.8rem", borderColor:C.green+"2f" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.35rem" }}>NUTRITION COACH BRIEF</div>
        <div className="coach-copy" style={{ fontSize:"0.56rem", whiteSpace:"pre-wrap", lineHeight:1.65 }}>{nutritionCoachBrief}</div>
      </div>
      {nutritionLayer?.travelMode && (
        <div className="card card-soft" style={{ marginBottom:"0.8rem", borderColor:C.blue+"30" }}>
          <div className="sect-title" style={{ color:C.blue, marginBottom:"0.4rem" }}>TRAVEL NUTRITION MODE</div>
          <div style={{ fontSize:"0.57rem", color:"#dbe7f6", lineHeight:1.6, marginBottom:"0.3rem" }}>
            Airport options: Chipotle double-protein bowl, CAVA double chicken bowl, or a sandwich + Greek yogurt combo.
          </div>
          <div style={{ fontSize:"0.56rem", color:"#9fb2d2", lineHeight:1.6, marginBottom:"0.2rem" }}>
            Hotel breakfast strategy: eggs + Greek yogurt + fruit, skip pastries, hydrate early.
          </div>
          <div style={{ fontSize:"0.56rem", color:"#9fb2d2", lineHeight:1.6 }}>
            No kitchen protein plan: shakes, jerky, tuna packets, deli turkey wraps, and ready-to-drink protein.
          </div>
        </div>
      )}

      <div className="card card-soft card-action" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.45rem" }}>SIMPLE TARGETS</div>
        <div style={{ fontSize:"0.53rem", color:"#8fa5c8", marginBottom:"0.3rem", letterSpacing:"0.06em" }}>
          Mode: {phaseMode} · {dayType}
        </div>
        <div style={{ fontSize:"0.56rem", color:"#cbd5e1", marginBottom:"0.42rem", lineHeight:1.55 }}>
          Shift reason: {macroShiftLine}
        </div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.4rem" }}>
          {[["Protein", proteinLevel, C.red], ["Carbs", carbLevel, C.green], ["Calories", calorieLevel, C.amber]].map(([label, value, col]) => (
            <div key={label} style={{ background:"#0f172a", border:`1px solid ${col}30`, borderRadius:8, padding:"0.55rem 0.45rem", textAlign:"center" }}>
              <div style={{ fontSize:"0.53rem", color:"#64748b", letterSpacing:"0.06em", display:"flex", alignItems:"center", justifyContent:"center", gap:"0.25rem" }}>
                <Glyph name={NUTRITION_ICON[label] || "protein"} color={col} size={11} />
                <span>{label}</span>
              </div>
              <div className="mono" style={{ color:col, fontSize:"0.92rem", marginTop:"0.12rem", fontWeight:600 }}>{value}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:"0.45rem", fontSize:"0.56rem", color:"#94a3b8", lineHeight:1.65 }}>
          Focus today: {simplifiedWeek ? "simplified meals and consistency" : hardDay ? "hard training fuel" : recoveryDay ? "recovery and appetite control" : strengthDay ? "protein-led recovery" : "steady intake and consistency"}.
        </div>
        <div style={{ marginTop:"0.15rem", fontSize:"0.55rem", color:"#64748b" }}>
          Goals covered: {goalContext.primary?.name || "general fitness"}{goalContext.secondary?.length ? ` + ${(goalContext.secondary || []).map(g=>g?.name).filter(Boolean).join(" · ")}` : ""}.
        </div>
        {nutritionLayer?.phaseAwareAdjustment?.active && (
          <div style={{ marginTop:"0.25rem", display:"grid", gap:"0.2rem" }}>
            <button className="btn" onClick={()=>setShowNutritionWhy(v=>!v)} style={{ width:"fit-content", fontSize:"0.5rem", color:C.blue, borderColor:C.blue+"35" }}>
              {showNutritionWhy ? "Hide why" : "Why this balance?"}
            </button>
            {showNutritionWhy && (
              <div style={{ fontSize:"0.54rem", color:"#94a3b8", lineHeight:1.6 }}>
                {nutritionLayer.phaseAwareAdjustment.summary} {nutritionLayer.phaseAwareAdjustment.why}
              </div>
            )}
          </div>
        )}
      </div>
      <div className="card card-subtle" style={{ marginBottom:"0.8rem", borderColor:C.blue+"25" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>HYDRATION</div>
        <button className="btn" onClick={()=>logHydration(12)} style={{ width:"100%", display:"block", textAlign:"left", borderColor:"#2a3b56", padding:"0.35rem" }}>
          <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.56rem", color:"#dbe7f6", marginBottom:"0.2rem" }}>
            <span>{Math.round(hydrationOz)} oz</span>
            <span style={{ color:"#8fa5c8" }}>Target {hydrationTargetOz} oz</span>
          </div>
          <div style={{ width:"100%", height:9, borderRadius:999, background:"#0f172a", border:"1px solid #243752", overflow:"hidden" }}>
            <div style={{ width:`${hydrationPct}%`, height:"100%", background: hydrationPct >= 100 ? C.green : C.blue, transition:"width 180ms ease" }} />
          </div>
          <div style={{ marginTop:"0.25rem", fontSize:"0.52rem", color:"#8fa5c8" }}>Tap to log +12 oz · {hydrationPct}% complete</div>
        </button>
        {showHydrationNudge && hydrationPct < 50 && (
          <div style={{ marginTop:"0.3rem", fontSize:"0.54rem", color:C.amber }}>
            Mid-afternoon nudge: you're under 50%. Add one glass now.
          </div>
        )}
      </div>

      <div className="card card-soft" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.amber, marginBottom:"0.5rem" }}>WHAT THIS LOOKS LIKE</div>
        <div style={{ fontSize:"0.58rem", color:"#cbd5e1", lineHeight:1.7, display:"grid", gap:"0.22rem" }}>
          {mealMacroRows.map((meal) => (
            <div key={meal.key} style={{ border:"1px solid #243752", borderRadius:8, background:"#0f172a", padding:"0.3rem 0.35rem" }}>
              <button className="btn" onClick={()=>setOpenMealKey(prev => prev === meal.key ? "" : meal.key)} style={{ width:"100%", justifyContent:"flex-start", fontSize:"0.56rem", color:"#dbe7f6", borderColor:"transparent", padding:"0.08rem 0" }}>
                <span style={{ display:"flex", alignItems:"center", gap:"0.35rem" }}>
                  <Glyph name={NUTRITION_ICON[meal.label] || "protein"} color={C.amber} size={12} />
                  <span><span style={{ color:C.amber }}>{meal.label}:</span> {meal.text}</span>
                </span>
              </button>
              {openMealKey === meal.key && (
                <div style={{ marginTop:"0.22rem", fontSize:"0.53rem", color:"#9fb2d2", lineHeight:1.55 }}>
                  P/C/F: {meal.p}g / {meal.c}g / {meal.f}g · Running total: {meal.running.p}g P, {meal.running.c}g C, {meal.running.f}g F
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      <div className="card card-subtle" style={{ marginBottom:"0.8rem", borderColor:"#2a3b56" }}>
        <div className="sect-title" style={{ color:"#93c5fd", marginBottom:"0.35rem" }}>SECONDARY · WHAT'S IN MY FRIDGE?</div>
        <div style={{ fontSize:"0.53rem", color:"#8fa5c8", marginBottom:"0.35rem" }}>
          Optional: paste what you have and Coach will return one compliant meal.
        </div>
        <div style={{ display:"flex", gap:"0.3rem", alignItems:"center" }}>
          <input
            value={fridgeInput}
            onChange={e=>setFridgeInput(e.target.value)}
            onKeyDown={e=>e.key==="Enter" && requestFridgeMeal()}
            placeholder="eggs, rice, spinach, Greek yogurt"
            style={{ flex:1 }}
          />
          <button className="btn" onClick={requestFridgeMeal} style={{ fontSize:"0.52rem", color:C.blue, borderColor:C.blue+"35" }}>
            Ask Coach
          </button>
        </div>
        {fridgeCoachReply && (
          <div style={{ marginTop:"0.35rem", fontSize:"0.55rem", color:"#dbe7f6", lineHeight:1.6 }}>
            {fridgeCoachReply}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.55rem" }}>REAL-LIFE BACKUPS</div>
        {locationAwareOrder && (
          <div style={{ fontSize:"0.56rem", color:C.green, marginBottom:"0.45rem", lineHeight:1.55 }}>
            {locationAwareOrder}
          </div>
        )}
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
          <div style={{ display:"flex", alignItems:"center", gap:"0.35rem" }}><Glyph name={NUTRITION_ICON["Travel backup"]} color={C.blue} size={12} /><span><span style={{ color:C.blue }}>Travel backup:</span> {travelBreakfast[0]}</span></div>
          <div style={{ display:"flex", alignItems:"center", gap:"0.35rem" }}><Glyph name={NUTRITION_ICON["Grocery reset"]} color={C.blue} size={12} /><span><span style={{ color:C.blue }}>Grocery reset:</span> {basket.items?.[0] || "pre-cooked protein + fruit + easy carbs"}</span></div>
        </div>
      </div>

      <div className="card card-subtle" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.lime, marginBottom:"0.45rem" }}>SUPPLEMENT STACK</div>
        <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:"0.35rem" }}>
          {supplementPlan.map((s, i) => (
            <div key={`${s}_${i}`} style={{ display:"flex", alignItems:"center", gap:"0.35rem", background:"#0f172a", border:"1px solid #20314a", borderRadius:9, padding:"0.4rem 0.45rem" }}>
              <Glyph name={SUPPLEMENT_ICONS[s] || "vitamin_d"} color={C.lime} size={13} />
              <div style={{ fontSize:"0.56rem", color:"#d7e4fb" }}>{s}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:"0.45rem", display:"grid", gap:"0.24rem" }}>
          <div style={{ fontSize:"0.52rem", color:"#94a3b8", letterSpacing:"0.06em" }}>TODAY TIMING</div>
          {supplementTimingLines.map((line, idx) => (
            <div key={`supp_timing_${idx}`} style={{ fontSize:"0.54rem", color:"#dbe7f6", lineHeight:1.55 }}>{line}</div>
          ))}
        </div>
        <div style={{ marginTop:"0.4rem", fontSize:"0.54rem", color:"#b8cae6", lineHeight:1.6, whiteSpace:"pre-wrap" }}>{supplementCoachBrief}</div>
      </div>

      <div className="card" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.purple, marginBottom:"0.5rem" }}>SUNDAY GROCERY LIST</div>
        <select value={store} onChange={e=>setStore(e.target.value)} style={{ marginBottom:"0.35rem" }}>
          {[...new Set([...(localFoodContext.groceryOptions || []), ...Object.keys(LOCAL_PLACE_TEMPLATES[city]?.groceries || {})])].map(s => <option key={s}>{s}</option>)}
        </select>
        <div style={{ display:"flex", gap:"0.3rem", marginBottom:"0.35rem" }}>
          <button className="btn" onClick={()=>{ setSundayGrocery(buildSundayStoreGroceryList({ store, nutritionLayer, realWorldNutrition })); setGroceryShareAck(""); }} style={{ fontSize:"0.53rem", color:C.green, borderColor:C.green+"35" }}>Generate</button>
          <button className="btn" onClick={async ()=>{
            if (!sundayGrocery?.text) return;
            const payload = `${sundayGrocery.title}\n${sundayGrocery.text}`;
            if (navigator.share) {
              try { await navigator.share({ title: "Sunday Grocery List", text: payload }); setGroceryShareAck("Shared."); return; } catch {}
            }
            try { await navigator.clipboard.writeText(payload); setGroceryShareAck("Copied."); } catch { setGroceryShareAck("Unable to copy."); }
          }} style={{ fontSize:"0.53rem", color:C.blue, borderColor:C.blue+"35" }}>Copy / Share</button>
        </div>
        {sundayGrocery && (
          <div style={{ fontSize:"0.55rem", color:"#94a3b8", lineHeight:1.6 }}>
            <div style={{ marginBottom:"0.2rem", color:"#dbe7f6" }}>{sundayGrocery.title}</div>
            {sundayGrocery.sections.map((sec) => (
              <div key={sec.name}><span style={{ color:C.purple }}>{sec.name}:</span> {sec.items.join(", ")}</div>
            ))}
          </div>
        )}
        {groceryShareAck && <div style={{ marginTop:"0.2rem", fontSize:"0.53rem", color:C.green }}>{groceryShareAck}</div>}
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
          <button className="btn btn-primary" onClick={()=>saveNutritionFeedback(todayKey, { ...nutritionCheck, hydrationOz, hydrationTargetOz, hydrationNudgedAt })} style={{ fontSize:"0.55rem" }}>SAVE</button>
        </div>
      </div>
    </div>
  );
}

// ── COACH TAB (REDESIGNED) ──────────────────────────────────────────────────
function CoachTab({ logs, currentWeek, todayWorkout, bodyweights, personalization, momentum, arbitration, expectations, memoryInsights, compoundingCoachMemory, recalibration, strengthLayer, patterns, proactiveTriggers, onApplyTrigger, learningLayer, salvageLayer, validationLayer, optimizationLayer, failureMode, planComposer, nutritionLayer, realWorldNutrition, nutritionFeedback, setPersonalization, coachActions, setCoachActions, coachPlanAdjustments, setCoachPlanAdjustments, weekNotes, setWeekNotes, planAlerts, setPlanAlerts, onPersist }) {
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
  const [presetDraft, setPresetDraft] = useState({
    Home: { equipment: (personalization?.environmentConfig?.presets?.Home?.equipment || []).join(", "), time: personalization?.environmentConfig?.presets?.Home?.time || "30" },
    Gym: { equipment: (personalization?.environmentConfig?.presets?.Gym?.equipment || []).join(", "), time: personalization?.environmentConfig?.presets?.Gym?.time || "45+" },
    Travel: { equipment: (personalization?.environmentConfig?.presets?.Travel?.equipment || []).join(", "), time: personalization?.environmentConfig?.presets?.Travel?.time || "20" },
  });
  const bottomRef = useRef(null);

  useEffect(() => {
    setMessages([{
      role:"assistant",
      packet: deterministicCoachPacket({ input: "status", todayWorkout, currentWeek, logs, bodyweights, personalization, learning: learningLayer, salvage: salvageLayer, planComposer, optimizationLayer, failureMode, momentum, strengthLayer, nutritionLayer, arbitration, expectations, memoryInsights, coachMemoryContext: compoundingCoachMemory, realWorldNutrition, recalibration }),
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
    const deterministic = deterministicCoachPacket({ input: userMsg, todayWorkout, currentWeek, logs, bodyweights, personalization, learning: learningLayer, salvage: salvageLayer, planComposer, optimizationLayer, failureMode, momentum, strengthLayer, nutritionLayer, arbitration, expectations, memoryInsights, coachMemoryContext: compoundingCoachMemory, realWorldNutrition, recalibration });
    if (coachMode === "deterministic" || !apiKey) return { ...deterministic, source: "deterministic" };
    try {
      const res = await safeFetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest", max_tokens: 700,
          system: buildCoachChatSystemPrompt({ allowedActions: Object.values(COACH_TOOL_ACTIONS) }),
          messages: [{ role: "user", content: `Week ${currentWeek}, today ${todayWorkout?.label}. Memory context: ${JSON.stringify(compoundingCoachMemory || {})}. User said: "${userMsg}".` }]
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
  const sundayArchive = personalization?.coachMemory?.sundayReviews || [];
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

  useEffect(() => {
    const isSunday = new Date().getDay() === 0;
    if (!isSunday) return;
    if (sundayArchive.some(r => r?.date === todayKey)) return;
    const review = buildSundayWeekInReview({ logs, momentum, patterns, recalibration, currentWeek });
    const nextReviews = [review, ...sundayArchive].slice(0, 26);
    const updated = mergePersonalization(personalization, { coachMemory: { ...personalization.coachMemory, sundayReviews: nextReviews } });
    setPersonalization(updated);
    onPersist(updated, coachActions, coachPlanAdjustments, weekNotes, planAlerts);
  }, [todayKey, currentWeek]);

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
  const weeklyNotice = sundayArchive[0]?.paragraph
    || patterns?.observations?.[0]?.msg
    || (momentum?.completionRate >= 0.72 ? "Consistency is trending up this week." : "Execution has been mixed this week.");

  return (
    <div className="fi" style={{ display:"grid", gap:"0.75rem" }}>
      <div className="card card-strong card-hero" style={{ borderColor:C.blue+"38" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>COACH SNAPSHOT</div>
        <div className="coach-copy" style={{ fontSize:"0.62rem", lineHeight:1.7 }}>
          <div><span style={{ color:"#94a3b8" }}>Watching:</span> {coachDecision.watch}</div>
          <div><span style={{ color:"#94a3b8" }}>Do today:</span> {coachDecision.stance}</div>
          <div><span style={{ color:"#94a3b8" }}>Noticed this week:</span> {weeklyNotice}</div>
        </div>
      </div>

      <details>
        <summary style={{ cursor:"pointer", fontSize:"0.62rem", color:"#93c5fd", letterSpacing:"0.04em" }}>Go deeper</summary>
        <div style={{ display:"grid", gap:"0.75rem", marginTop:"0.5rem" }}>
          <div className="card card-action">
            <div className="sect-title" style={{ color:C.amber, marginBottom:"0.35rem" }}>CHOOSE</div>
            <div style={{ display:"flex", gap:"0.45rem", flexWrap:"wrap" }}>
              {coachDecision.options.slice(0, 2).map((opt, i) => (
                <button key={`${opt.label}_${i}`} className={`btn ${opt.primary ? "btn-primary" : ""}`} onClick={()=>applyDecisionOption(opt)} style={{ fontSize:"0.56rem" }}>
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div className="card card-subtle">
            <div className="sect-title" style={{ color:C.purple, marginBottom:"0.3rem" }}>SUNDAY WEEK-IN-REVIEW</div>
            <div style={{ fontSize:"0.58rem", color:"#dbe7f6", lineHeight:1.7, marginBottom:"0.35rem" }}>
              {sundayArchive[0]?.paragraph || "This section auto-generates on Sundays and archives each weekly review."}
            </div>
            {sundayArchive.length > 0 && (
              <div style={{ maxHeight:160, overflowY:"auto", border:"1px solid #23344e", borderRadius:9, padding:"0.35rem 0.45rem", display:"grid", gap:"0.28rem", background:"#0f172a" }}>
                {sundayArchive.map((r, idx) => (
                  <div key={`${r.date}_${idx}`} style={{ fontSize:"0.54rem", color:"#9fb2d2", lineHeight:1.55 }}>
                    <span className="mono" style={{ color:"#64748b" }}>{r.date}</span> — {r.paragraph}
                  </div>
                ))}
              </div>
            )}
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

          <div style={{ display:"grid", gap:"0.35rem" }}>
            {messages.slice(-6).map((m, idx) => (
              <div key={`${idx}_${m.role}`} className={m.role === "assistant" ? "coach-fade" : ""} style={{ justifySelf:m.role==="user"?"end":"start", maxWidth:"92%", background:m.role==="user"?"#15263f":"#101b2d", border:m.role==="user"?"1px solid #325178":"1px solid #2a3f5f", borderRadius:10, padding:"0.45rem 0.55rem" }}>
                {m.role === "assistant" ? (
                  <div className="coach-copy" style={{ fontSize:"0.56rem", whiteSpace:"pre-wrap" }}>
                    {(m.packet?.coachBrief || m.packet?.recommendations?.[0] || m.packet?.notices?.[0] || "Coach update ready.")}
                  </div>
                ) : (
                  <div style={{ fontSize:"0.56rem", color:"#a9bddc" }}>{m.text}</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </details>

      {/* ── SETTINGS (collapsed) ── */}
      <details style={{ marginTop:"0.75rem" }}>
        <summary style={{ cursor:"pointer", fontSize:"0.72rem", color:"#475569", padding:"0.5rem 0" }}>Coach settings & memory</summary>
        <div style={{ padding:"0.75rem 0", display:"grid", gap:"0.4rem" }}>
          <div className="card card-subtle" style={{ padding:"0.55rem" }}>
            <div className="sect-title" style={{ color:C.blue, marginBottom:"0.25rem" }}>ENVIRONMENT PRESETS (GLOBAL)</div>
            <div style={{ fontSize:"0.53rem", color:"#8fa5c8", marginBottom:"0.3rem" }}>Define Home/Gym/Travel once. All workout prescriptions derive from these presets.</div>
            {["Home","Gym","Travel"].map((mode) => (
              <div key={mode} style={{ display:"grid", gridTemplateColumns:"58px 1fr 74px", gap:"0.3rem", alignItems:"center", marginBottom:"0.25rem" }}>
                <div className="mono" style={{ fontSize:"0.52rem", color:"#9fb2d2" }}>{mode}</div>
                <input value={presetDraft[mode].equipment} onChange={e=>setPresetDraft(prev=>({ ...prev, [mode]: { ...prev[mode], equipment:e.target.value } }))} placeholder="equipment list" />
                <select value={presetDraft[mode].time} onChange={e=>setPresetDraft(prev=>({ ...prev, [mode]: { ...prev[mode], time:e.target.value } }))} style={{ fontSize:"0.55rem" }}>
                  {["20","30","45+"].map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>
            ))}
            <button className="btn" onClick={async ()=>{
              const nextPresets = Object.fromEntries(["Home","Gym","Travel"].map((mode) => [mode, {
                equipment: presetDraft[mode].equipment.split(",").map(x => x.trim()).filter(Boolean),
                time: presetDraft[mode].time || "30",
              }]));
              const updated = mergePersonalization(personalization, { environmentConfig: { ...personalization.environmentConfig, presets: nextPresets } });
              setPersonalization(updated);
              await onPersist(updated, coachActions, coachPlanAdjustments, weekNotes, planAlerts);
            }} style={{ fontSize:"0.53rem", color:C.green, borderColor:C.green+"35" }}>Save presets</button>
          </div>
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
