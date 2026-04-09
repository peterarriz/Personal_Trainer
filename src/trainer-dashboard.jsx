import { useState, useEffect, useRef, useMemo } from "react";
import { DEFAULT_PLANNING_HORIZON_WEEKS, composeGoalNativePlan, normalizeGoals, getGoalBuckets, getActiveTimeBoundGoal, generateTodayPlan } from "./modules-planning.js";
import { createAuthStorageModule, buildStorageStatus, classifyStorageError, STORAGE_STATUS_REASONS } from "./modules-auth-storage.js";
import { getGoalContext, normalizeActualNutritionLog, normalizeActualNutritionLogCollection, compareNutritionPrescriptionToActual, LOCAL_PLACE_TEMPLATES, getPlaceRecommendations, buildGroceryBasket, mergeActualNutritionLogUpdate } from "./modules-nutrition.js";
import { DEFAULT_DAILY_CHECKIN, CHECKIN_STATUS_OPTIONS, CHECKIN_FEEL_OPTIONS, CHECKIN_BLOCKER_OPTIONS, parseMicroCheckin, deriveClosedLoopValidationLayer, isWithinGracePeriod, resolveEffectiveStatus, resolveActualStatus, buildPlannedDayRecord, comparePlannedDayToActual } from "./modules-checkins.js";
import { COACH_TOOL_ACTIONS, AFFECTED_AREAS, withConfidenceTone, deterministicCoachPacket } from "./modules-coach-engine.js";
import { buildWorkoutAdjustmentCoachNote, buildCheckinReadSummary, buildWeeklyPlanningCoachBrief, buildNutritionCoachBrief, buildCoachChatSystemPrompt, buildPlanAnalysisSystemPrompt, buildTodayWhyNowSentence, buildMacroShiftLine, buildEasierSessionsObservation, buildSkippedQualityDecision, buildLoadSpikeInlineWarning, buildWeeklyConsistencyAnchor, buildStreakSignalResponse, buildBadWeekTriageResponse, buildDiscomfortProtocolResponse, buildCompressedSessionPrescription, buildMinimumEffectiveTravelSession } from "./prompts/coach-text.js";
import { SettingsIcon } from "./icons.js";
import { assembleCanonicalPlanDay, resolvePlanDayStateInputs, resolvePlanDayTimeOfDay } from "./services/plan-day-service.js";
import { assemblePlanWeekRuntime, resolveCurrentPlanWeekNumber, resolvePlanWeekNumberForDateKey, resolveProgramDisplayHorizon } from "./services/plan-week-service.js";
import { buildDayReview, buildDayReviewComparison, classifyDayReviewStatus } from "./services/day-review-service.js";
import { coordinateCoachActionCommit, resolveStoredAiApiKey, runCoachChatRuntime, runPlanAnalysisRuntime } from "./services/ai-runtime-service.js";
import { deriveCanonicalAthleteState, withLegacyGoalProfileCompatibility } from "./services/canonical-athlete-service.js";
import {
  applyCanonicalRuntimeStateSetters,
  buildCanonicalRuntimeState,
  buildCanonicalRuntimeStateFromStorage,
  buildPersistedTrainerPayload,
  DEFAULT_COACH_PLAN_ADJUSTMENTS,
  DEFAULT_NUTRITION_FAVORITES,
  exportRuntimeStateAsBase64,
  importRuntimeStateFromBase64,
} from "./services/persistence-adapter-service.js";
import {
  buildExercisePerformanceRowsFromRecords,
  getExercisePerformanceRecordsForLog,
  getSessionPerformanceRecordsForLog,
  normalizeLogPerformanceState,
  normalizePerformanceExerciseKey,
} from "./services/performance-record-service.js";
import {
  buildPlanReference,
  createPrescribedDayHistoryEntry,
  getCurrentPrescribedDayRecord,
  getCurrentPrescribedDayRevision,
  getStableCaptureAtForDate,
  normalizePrescribedDayHistoryEntry,
  PRESCRIBED_DAY_DURABILITY,
  upsertPrescribedDayHistoryEntry,
} from "./services/prescribed-day-history-service.js";
import { appendProvenanceSidecar, buildLegacyProvenanceAdjustmentView, buildProvenanceEvent, buildStructuredProvenance, describeProvenanceRecord, normalizeProvenanceEvent, normalizeStructuredProvenance, PROVENANCE_ACTORS } from "./services/provenance-service.js";

// Ã¢â€â‚¬Ã¢â€â‚¬ PROFILE Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const PROFILE = {
  name: "Athlete", height: "6'1\"", weight: 190, age: 30,
  goalRace: "TBD", goalTime: "TBD", goalPace: "TBD",
  startDate: new Date(),
  tdee: 3100,
  pushUpMax: 33,
};

// Ã¢â€â‚¬Ã¢â€â‚¬ PLAN DATA Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const PHASE_ZONES = {
  "BASE":     { easy:"10:15Ã¢â‚¬â€œ10:30", tempo:"8:45Ã¢â‚¬â€œ8:55", int:"8:00Ã¢â‚¬â€œ8:10", long:"10:15Ã¢â‚¬â€œ10:30", color:"#4ade80" },
  "BUILDING": { easy:"10:00Ã¢â‚¬â€œ10:15", tempo:"8:38Ã¢â‚¬â€œ8:48", int:"7:55Ã¢â‚¬â€œ8:05", long:"10:00Ã¢â‚¬â€œ10:15", color:"#60a5fa" },
  "PEAKBUILD":{ easy:"9:50Ã¢â‚¬â€œ10:05",  tempo:"8:30Ã¢â‚¬â€œ8:40", int:"7:50Ã¢â‚¬â€œ8:00", long:"9:50Ã¢â‚¬â€œ10:05",  color:"#f59e0b" },
  "PEAK":     { easy:"9:45Ã¢â‚¬â€œ10:00",  tempo:"8:28Ã¢â‚¬â€œ8:35", int:"7:45Ã¢â‚¬â€œ7:55", long:"9:45Ã¢â‚¬â€œ10:00",  color:"#f87171" },
  "TAPER":    { easy:"9:45Ã¢â‚¬â€œ10:00",  tempo:"8:28Ã¢â‚¬â€œ8:01Ã°Å¸Å½Â¯",int:"7:45Ã¢â‚¬â€œ7:55",long:"9:45Ã¢â‚¬â€œ10:00",  color:"#c084fc" },
};

const WEEKS = [
  { w:1,  phase:"BASE",     label:"Getting legs back",        mon:{t:"Easy",d:"3 mi"},     thu:{t:"Tempo",d:"2mi WU+20min+1mi CD"},    fri:{t:"Easy",d:"4 mi"},   sat:{t:"Long",d:"4 mi"},   str:"A", nutri:"easyRun" },
  { w:2,  phase:"BASE",     label:"Building rhythm",          mon:{t:"Easy",d:"3 mi"},     thu:{t:"Tempo",d:"2mi WU+25min+1mi CD"},    fri:{t:"Easy",d:"4 mi"},   sat:{t:"Long",d:"5 mi"},   str:"A", nutri:"easyRun" },
  { w:3,  phase:"BASE",     label:"First intervals",          mon:{t:"Easy",d:"3.5 mi"},   thu:{t:"Intervals",d:"1mi+3Ãƒâ€”8min/3min+1mi"},fri:{t:"Easy",d:"4.5 mi"}, sat:{t:"Long",d:"5 mi"},   str:"A", nutri:"hardRun" },
  { w:4,  phase:"BASE",     label:"Ã¢Â¬â€¡ Cutback",  cutback:true, mon:{t:"Easy",d:"3 mi"},     thu:{t:"Tempo",d:"1mi WU+20min easy+1mi"},  fri:{t:"Easy",d:"3 mi"},   sat:{t:"Long",d:"4 mi"},   str:"A", nutri:"easyRun" },
  { w:5,  phase:"BUILDING", label:"New territory",            mon:{t:"Easy",d:"3.5 mi"},   thu:{t:"Tempo",d:"2mi WU+30min+1mi CD"},    fri:{t:"Easy",d:"5 mi"},   sat:{t:"Long",d:"6 mi"},   str:"B", nutri:"easyRun" },
  { w:6,  phase:"BUILDING", label:"Speed sharpening",         mon:{t:"Easy",d:"4 mi"},     thu:{t:"Intervals",d:"1mi+4Ãƒâ€”6min/2min+1mi"},fri:{t:"Easy",d:"5 mi"},   sat:{t:"Long",d:"7 mi"},   str:"B", nutri:"hardRun" },
  { w:7,  phase:"BUILDING", label:"Dialing in",               mon:{t:"Easy",d:"4 mi"},     thu:{t:"Tempo",d:"2mi WU+35min+1mi CD"},    fri:{t:"Easy",d:"5.5 mi"}, sat:{t:"Long",d:"7 mi"},   str:"B", nutri:"easyRun" },
  { w:8,  phase:"BUILDING", label:"Ã¢Â¬â€¡ Cutback",  cutback:true, mon:{t:"Easy",d:"3 mi"},     thu:{t:"Tempo",d:"1mi WU+20min+1mi"},       fri:{t:"Easy",d:"4 mi"},   sat:{t:"Long",d:"5 mi"},   str:"B", nutri:"easyRun" },
  { w:9,  phase:"PEAKBUILD",label:"Double digits incoming",   mon:{t:"Easy",d:"4 mi"},     thu:{t:"Intervals",d:"1mi+4Ãƒâ€”8min/3min+1mi"},fri:{t:"Easy",d:"6 mi"},   sat:{t:"Long",d:"8 mi"},   str:"A", nutri:"hardRun" },
  { w:10, phase:"PEAKBUILD",label:"Pushing toward 9",         mon:{t:"Easy",d:"4.5 mi"},   thu:{t:"Tempo",d:"2mi WU+40min+1mi CD"},    fri:{t:"Easy",d:"6 mi"},   sat:{t:"Long",d:"9 mi"},   str:"A", nutri:"easyRun" },
  { w:11, phase:"PEAKBUILD",label:"Holding strong",           mon:{t:"Easy",d:"4.5 mi"},   thu:{t:"Intervals",d:"1mi+5Ãƒâ€”6min/2min+1mi"},fri:{t:"Easy",d:"6.5 mi"}, sat:{t:"Long",d:"9 mi"},   str:"A", nutri:"hardRun" },
  { w:12, phase:"PEAKBUILD",label:"Ã¢Â¬â€¡ Cutback",  cutback:true, mon:{t:"Easy",d:"3.5 mi"},   thu:{t:"Tempo",d:"1mi WU+25min+1mi"},       fri:{t:"Easy",d:"4 mi"},   sat:{t:"Long",d:"5 mi"},   str:"A", nutri:"easyRun" },
  { w:13, phase:"PEAK",     label:"Double digits",            mon:{t:"Easy",d:"5 mi"},     thu:{t:"Tempo",d:"2mi WU+45min+1mi CD"},    fri:{t:"Easy",d:"7 mi"},   sat:{t:"Long",d:"10 mi"},  str:"B", nutri:"easyRun" },
  { w:14, phase:"PEAK",     label:"Biggest week",             mon:{t:"Easy",d:"5 mi"},     thu:{t:"Intervals",d:"1mi+5Ãƒâ€”8min/3min+1mi"},fri:{t:"Easy",d:"7 mi"},   sat:{t:"Long",d:"11 mi"},  str:"B", nutri:"hardRun" },
  { w:15, phase:"PEAK",     label:"Peak complete",            mon:{t:"Easy",d:"5 mi"},     thu:{t:"Tempo",d:"2mi WU+45min+1mi CD"},    fri:{t:"Easy",d:"7 mi"},   sat:{t:"Long",d:"12 mi"},  str:"B", nutri:"easyRun" },
  { w:16, phase:"TAPER",    label:"Back off",                 mon:{t:"Easy",d:"4 mi"},     thu:{t:"Tempo",d:"1mi WU+30min+1mi"},       fri:{t:"Easy",d:"5 mi"},   sat:{t:"Long",d:"9 mi"},   str:"A", nutri:"easyRun" },
  { w:17, phase:"TAPER",    label:"Final sharpening",         mon:{t:"Easy",d:"3 mi"},     thu:{t:"Tempo",d:"1mi WU+20min@8:01+1mi"},  fri:{t:"Easy",d:"4 mi"},   sat:{t:"Long",d:"6 mi"},   str:"A", nutri:"easyRun" },
  { w:18, phase:"TAPER",    label:"Ã°Å¸ÂÂ Race Week", race:true,   mon:{t:"Easy",d:"3 mi shakeout"},thu:{t:"Easy",d:"2mi+strides"},        fri:{t:"Easy",d:"Rest/walk"},sat:{t:"Long",d:"Ã°Å¸ÂÂ 13.1 mi"},str:null, nutri:"longRun" },
];

const STRENGTH = {
  A: {
    home: [
      { ex:"Wide Push-up", sets:"4Ãƒâ€”20", note:"Slow 3-count down. Outer chest." },
      { ex:"Standard Push-up", sets:"4Ãƒâ€”20", note:"Perfect form. 2 down, 1 up." },
      { ex:"Diamond Push-up", sets:"4Ãƒâ€”15", note:"Triceps. Rest 45 sec between sets." },
      { ex:"Decline Push-up (feet elevated)", sets:"3Ãƒâ€”15", note:"Upper chest emphasis." },
      { ex:"Band Chest Fly", sets:"4Ãƒâ€”15", note:"2-sec hold at center squeeze." },
      { ex:"Band Bicep Curl (slow)", sets:"4Ãƒâ€”15", note:"3-sec lower. No swinging." },
      { ex:"Band Tricep Overhead Extension", sets:"4Ãƒâ€”15", note:"Full lockout each rep." },
      { ex:"Plank to Push-up", sets:"3Ãƒâ€”10 each", note:"Core stability + chest combo." },
      { ex:"Dead Bug", sets:"3Ãƒâ€”12 each side", note:"Low back glued to floor." },
    ],
    hotel: [
      { ex:"Barbell Bench Press", sets:"5Ãƒâ€”5 Ã¢â€ â€™ 4Ãƒâ€”8", note:"Start at ~135 lbs. Progressive overload weekly." },
      { ex:"Incline DB Press", sets:"4Ãƒâ€”10", note:"30-45Ã‚Â° angle. Full stretch at bottom." },
      { ex:"Cable Chest Fly", sets:"4Ãƒâ€”12", note:"Slight forward lean. Squeeze hard at center." },
      { ex:"EZ Bar Curl", sets:"4Ãƒâ€”10", note:"Strict form. No body english." },
      { ex:"Hammer Curl", sets:"3Ãƒâ€”12 each", note:"Brachialis hit. Control the lower." },
      { ex:"Tricep Pushdown (cable)", sets:"4Ãƒâ€”12", note:"Elbows pinned to sides." },
      { ex:"Overhead Tricep Extension (cable)", sets:"3Ãƒâ€”12", note:"Full stretch overhead." },
      { ex:"Ab Wheel / Cable Crunch", sets:"4Ãƒâ€”15", note:"Slow. Feel the abs, not the hip flexors." },
    ]
  },
  B: {
    home: [
      { ex:"Push-up Complex (3 rounds)", sets:"WideÃƒâ€”15 Ã¢â€ â€™ StdÃƒâ€”15 Ã¢â€ â€™ DiamondÃƒâ€”12", note:"No rest within round. 90 sec between rounds. This is the abs killer too." },
      { ex:"Band Chest Press (one arm)", sets:"3Ãƒâ€”12 each", note:"Unilateral press challenges core stability." },
      { ex:"Band Bent-over Row", sets:"4Ãƒâ€”15", note:"Row to chest. Posture for racing." },
      { ex:"Band Overhead Press", sets:"4Ãƒâ€”12", note:"Stand on band. Full extension." },
      { ex:"Band Pull-Apart", sets:"4Ãƒâ€”20", note:"Straight arms. Rear delts + posture." },
      { ex:"Band Lateral Raise", sets:"3Ãƒâ€”12", note:"Slow lower. Don't shrug." },
      { ex:"Hollow Body Hold", sets:"4Ãƒâ€”30 sec", note:"THE abs exercise. Lower back pressed down, legs low." },
      { ex:"Bicycle Crunch", sets:"3Ãƒâ€”20 each side", note:"Controlled. Don't yank the neck." },
      { ex:"Leg Raise", sets:"4Ãƒâ€”15", note:"Lower abs. Slow lower, don't let them crash." },
    ],
    hotel: [
      { ex:"Incline Barbell Press", sets:"4Ãƒâ€”8", note:"Upper chest. Control the eccentric." },
      { ex:"DB Fly (flat)", sets:"4Ãƒâ€”12", note:"Wide arc. Deep stretch." },
      { ex:"Cable Row (seated)", sets:"4Ãƒâ€”12", note:"Full retraction at top." },
      { ex:"Face Pull", sets:"4Ãƒâ€”15", note:"External rotation. Protects shoulders for runners." },
      { ex:"Dips (weighted if possible)", sets:"4Ãƒâ€”10", note:"Lean slightly forward for chest emphasis." },
      { ex:"Cable Crunch", sets:"4Ãƒâ€”15", note:"Round the spine. Abs only." },
      { ex:"Hanging Leg Raise", sets:"4Ãƒâ€”12", note:"Full hang. Legs to 90Ã‚Â°. Core only." },
      { ex:"Plank Variations", sets:"3Ãƒâ€”60 sec each", note:"Standard, side L, side R. Squeeze everything." },
    ]
  }
};

const ACHILLES = [
  { ex:"Eccentric Heel Drop (bilateral wks 1-4, single-leg wks 5+)", sets:"3Ãƒâ€”15 each leg", note:"The #1 exercise. 4-sec lower. Do EVERY day." },
  { ex:"Calf Stretch (straight leg)", sets:"2Ãƒâ€”60 sec each", note:"Deep stretch. Hold it." },
  { ex:"Calf Stretch (bent knee)", sets:"2Ãƒâ€”60 sec each", note:"Targets soleus Ã¢â€ â€™ Achilles directly." },
  { ex:"Ankle Circles + Alphabet", sets:"1Ãƒâ€” each ankle", note:"Full mobility." },
  { ex:"Glute Bridge", sets:"3Ãƒâ€”15", note:"Strong glutes = less Achilles compensation." },
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
  const normalized = String(setsText || "").trim().replace("Ãƒâ€”", "x");
  const m = normalized.match(/^(\d+)\s*x\s*(.+)$/i);
  if (m) return { sets: m[1], reps: m[2] };
  return { sets: "As prescribed", reps: normalized || "As prescribed" };
};

const safeStorageGet = (storageLike, key, fallback = "") => {
  try {
    if (!storageLike?.getItem) return fallback;
    const value = storageLike.getItem(key);
    return value ?? fallback;
  } catch {
    return fallback;
  }
};

const safeStorageSet = (storageLike, key, value) => {
  try {
    if (!storageLike?.setItem) return false;
    storageLike.setItem(key, value);
    return true;
  } catch {
    return false;
  }
};

const normalizeStrengthExercise = (entry = {}) => {
  const { sets, reps } = parseSetPrescription(entry.sets || "");
  const cue = entry.cue || entry.note || "Controlled reps with full range and stable form.";
  const rest = entry.rest || (/rest/i.test(entry.note || "") ? (entry.note.match(/rest\s*[^.]+/i)?.[0] || "45-60s") : "45-75s");
  return { ex: entry.ex || "Exercise", sets, reps: entry.reps || reps, rest, cue };
};

const PROGRESSIVE_OVERLOAD_SET_CAPS = {
  compound: 6,
  lower_body: 6,
  upper_isolation: 5,
  default: 5,
};

const inferExerciseBucket = (exerciseName = "") => {
  const ex = String(exerciseName || "").toLowerCase();
  if (/squat|deadlift|hinge|rdl|lunge|split squat|step[-\s]?up|leg press|calf/.test(ex)) return "lower_body";
  if (/curl|tricep|lateral raise|fly|pull[-\s]?apart|face pull/.test(ex)) return "upper_isolation";
  if (/bench|press|row|dip|overhead|ohp|push[-\s]?up|chin[-\s]?up|pull[-\s]?up/.test(ex)) return "compound";
  return "default";
};
const inferLiftKey = (exerciseName = "") => {
  const ex = String(exerciseName || "").toLowerCase();
  if (/bench|chest press|incline/.test(ex)) return "bench";
  if (/squat|leg press|split squat|lunge/.test(ex)) return "squat";
  if (/deadlift|rdl|hinge/.test(ex)) return "deadlift";
  if (/overhead|ohp|shoulder press/.test(ex)) return "ohp";
  return "";
};

const getWeightIncrementByBucket = (bucket = "default") => {
  if (bucket === "upper_isolation") return 2.5;
  if (bucket === "compound" || bucket === "lower_body") return 5;
  return 5;
};

const parseRepTarget = (repsText = "") => {
  const text = String(repsText || "").toLowerCase();
  const range = text.match(/(\d+)\s*[-Ã¢â‚¬â€œ]\s*(\d+)/);
  if (range) return Number(range[2]);
  const simple = text.match(/(\d+)/);
  return simple ? Number(simple[1]) : 8;
};

const parseSetCount = (setsText = "") => {
  const match = String(setsText || "").match(/(\d+)/);
  return match ? Number(match[1]) : 3;
};

const mapSessionFeelToScore = (sessionFeel = "about_right") => (
  sessionFeel === "easier_than_expected" ? 4 : sessionFeel === "harder_than_expected" ? 2 : 3
);
const resolvePhaseMode = ({ currentPhase = "BASE", goals = [] }) => {
  const raw = String(currentPhase || "").toUpperCase();
  if (raw.includes("CUT")) return "cut";
  if (raw.includes("BUILD")) return "build";
  const fatLossGoal = (goals || []).some((g) => g?.active && g?.category === "body_comp" && /lose|cut|fat/i.test(`${g?.name || ""} ${g?.measurableTarget || ""}`));
  if (fatLossGoal) return "cut";
  return "maintain";
};

const toDateKey = (v) => {
  const d = new Date(v || Date.now());
  if (Number.isNaN(d.getTime())) return new Date().toISOString().split("T")[0];
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split("T")[0];
};

const parseLiftGoalWeights = (goals = []) => {
  const tracked = {};
  const lookups = [
    { key: "bench", regex: /bench[^0-9]*(\d{2,3})/i },
    { key: "squat", regex: /squat[^0-9]*(\d{2,3})/i },
    { key: "deadlift", regex: /deadlift[^0-9]*(\d{2,3})/i },
    { key: "ohp", regex: /(ohp|overhead press)[^0-9]*(\d{2,3})/i },
  ];
  const pool = (goals || [])
    .filter((g) => g?.active && g?.category === "strength")
    .map((g) => `${g?.name || ""} ${g?.measurableTarget || ""}`);
  for (const text of pool) {
    for (const lookup of lookups) {
      if (tracked[lookup.key]) continue;
      const m = String(text || "").match(lookup.regex);
      if (m) tracked[lookup.key] = Number(m[m.length - 1]);
    }
  }
  return tracked;
};

const deriveProgressiveOverloadAdjustments = ({ logs = {}, todayWorkout = {}, checkin = {}, personalization = {}, currentPhase = "BASE", goals = [], goalState = {} }) => {
  const dated = Object.entries(logs || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const historyByExercise = {};
  dated.forEach(([date, entry]) => {
    (entry?.strengthPerformance || []).forEach((p) => {
      if (!p?.exercise) return;
      const key = String(p.exercise).toLowerCase();
      historyByExercise[key] = historyByExercise[key] || [];
      historyByExercise[key].push({ ...p, date, sessionFeelScore: Number(p.sessionFeelScore || 3) });
    });
  });

  const phaseMode = resolvePhaseMode({ currentPhase, goals });
  const isCut = phaseMode === "cut";
  const isBuild = phaseMode === "build";
  const injuryActive = (personalization?.injuryPainState?.level || "none") !== "none";
  const activeTimedGoal = getActiveTimeBoundGoal(goals);
  const deadlineDate = activeTimedGoal?.targetDate || goalState?.deadline || "";
  const daysToGoal = deadlineDate
    ? Math.max(0, Math.ceil((new Date(deadlineDate).getTime() - Date.now()) / 86400000))
    : null;
  const goalWeights = parseLiftGoalWeights(goals);
  const prior = personalization?.strengthProgression || {};
  const fitnessLevel = personalization?.fitnessSignals?.fitnessLevel || "intermediate";
  const incrementMultiplier = fitnessLevel === "developing" ? 0.5 : fitnessLevel === "advanced" ? 1.15 : 1;
  const prevPrescriptions = prior?.prescriptions || {};
  const nextPrescriptions = { ...prevPrescriptions };
  const updates = [];
  const todayPerformance = checkin?.strengthPerformance || [];

  todayPerformance.forEach((perf) => {
    const exercise = perf?.exercise || "";
    const exKey = String(exercise).toLowerCase();
    const liftKey = inferLiftKey(exercise) || exKey;
    if (!exercise) return;
    const bucket = perf?.bucket || inferExerciseBucket(exercise);
    const increment = Math.max(2.5, Number((getWeightIncrementByBucket(bucket) * incrementMultiplier).toFixed(1)));
    const maxSets = PROGRESSIVE_OVERLOAD_SET_CAPS[bucket] || PROGRESSIVE_OVERLOAD_SET_CAPS.default;
    const sessions = (historyByExercise[exKey] || []).slice(-3);
    const last = sessions[sessions.length - 1];
    const prev = sessions[sessions.length - 2];
    const repsRatioLast = Number(last?.completionRatio || 0);
    const repsRatioPrev = Number(prev?.completionRatio || 0);
    const hadTwoClean = repsRatioLast >= 1 && repsRatioPrev >= 1 && Number(last?.sessionFeelScore || 0) >= 3 && Number(prev?.sessionFeelScore || 0) >= 3;
    const harderAndUnder = checkin?.sessionFeel === "harder_than_expected" && repsRatioLast < 0.85;
    const shouldIncrease = hadTwoClean && !injuryActive;
    const shouldDecrease = injuryActive || repsRatioLast < 0.8 || harderAndUnder;
    const shouldHold = !shouldIncrease && !shouldDecrease && (repsRatioLast >= 0.8 || checkin?.sessionFeel === "harder_than_expected");
    const preset = prevPrescriptions[exKey] || prevPrescriptions[liftKey] || { workingWeight: Number(perf?.weightUsed || 0), sets: Number(perf?.prescribedSets || parseSetCount(perf?.prescribedSetsText || "")) || 3 };
    let nextWeight = Number(preset.workingWeight || perf?.weightUsed || 0);
    let nextSets = Number(preset.sets || perf?.prescribedSets || 3);
    let ruleTriggered = "hold";
    if (shouldIncrease) {
      nextWeight += increment;
      ruleTriggered = "increase_weight";
    } else if (shouldDecrease) {
      nextWeight = Math.max(increment, nextWeight - increment);
      ruleTriggered = injuryActive ? "decrease_weight_injury" : "decrease_weight_underperformance";
    } else if (shouldHold) {
      ruleTriggered = "hold_weight";
    }
    const cleanThreeAtSameWeight = sessions.length >= 3
      && sessions.slice(-3).every((s) => Number(s?.completionRatio || 0) >= 1 && Math.abs(Number(s?.weightUsed || 0) - Number(preset.workingWeight || 0)) < 0.01);
    if (cleanThreeAtSameWeight && isBuild && nextSets < maxSets) {
      nextSets += 1;
      ruleTriggered = "add_set_build_phase";
    }
    const avgFeel3 = sessions.length ? sessions.reduce((acc, s) => acc + Number(s?.sessionFeelScore || 3), 0) / sessions.length : 3;
    if ((isCut && nextSets > Math.max(3, maxSets - 1)) || avgFeel3 < 2.5) {
      nextSets = Math.max(2, nextSets - 1);
      ruleTriggered = isCut ? "remove_set_cut_volume_cap" : "remove_set_low_feel";
    }
    nextPrescriptions[exKey] = {
      exercise,
      bucket,
      workingWeight: nextWeight,
      sets: nextSets,
      increment,
      updatedAt: Date.now(),
      liftKey,
    };
    updates.push({
      exercise,
      exKey,
      liftKey,
      oldWeight: Number(preset.workingWeight || perf?.weightUsed || 0),
      newWeight: nextWeight,
      oldSets: Number(preset.sets || perf?.prescribedSets || 3),
      newSets: nextSets,
      ruleTriggered,
      increment,
      daysToGoal,
      phase: currentPhase,
      injuryActive,
    });
  });

  const nextTracking = { ...(prior?.tracking || {}) };
  Object.entries(nextPrescriptions).forEach(([key, p]) => {
    const sessions = (historyByExercise[key] || []).slice(-8);
    const canonicalKey = p?.liftKey || inferLiftKey(p?.exercise || "") || key;
    const recent4 = sessions.slice(-4);
    const first = recent4[0];
    const last = recent4[recent4.length - 1];
    const weeks = Math.max(1, recent4.length - 1);
    const rate = recent4.length >= 2 ? (Number(last?.weightUsed || p.workingWeight || 0) - Number(first?.weightUsed || p.workingWeight || 0)) / weeks : 0;
    const goalWeight = goalWeights[canonicalKey] || goalWeights[key] || nextTracking[canonicalKey]?.goalWeight || null;
    const currentWorkingWeight = Number(p.workingWeight || 0);
    const weeksToGoal = goalWeight && rate > 0 ? Math.max(0, (goalWeight - currentWorkingWeight) / rate) : null;
    const projectedDate = weeksToGoal !== null ? new Date(Date.now() + (weeksToGoal * 7 * 86400000)).toISOString().split("T")[0] : "";
    nextTracking[canonicalKey] = {
      ...(nextTracking[canonicalKey] || {}),
      exercise: p.exercise,
      currentWorkingWeight,
      goalWeight: goalWeight || nextTracking[canonicalKey]?.goalWeight || null,
      progressionRateLbsPerWeek: Number.isFinite(rate) ? Number(rate.toFixed(2)) : 0,
      projectedDateToGoal: projectedDate,
      updatedAt: Date.now(),
    };
  });

  return { updates, nextPrescriptions, nextTracking };
};

const BAND_TENSION_LEVELS = [
  "Light",
  "Medium",
  "Heavy",
  "Extra Heavy",
  "Extra Heavy + Light",
  "Two Heavy Bands",
];

const PROGRESSIVE_OVERLOAD_SET_CAPS_V2 = {
  compound: 5,
  lower_body: 5,
  upper_isolation: 4,
  core: 4,
  default: 4,
};

const toFiniteNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizeExerciseKey = (exerciseName = "") => normalizePerformanceExerciseKey(exerciseName);

const inferExerciseMode = (exerciseName = "", explicitMode = "") => {
  const forced = String(explicitMode || "").toLowerCase();
  if (["weighted", "band", "bodyweight"].includes(forced)) return forced;
  const ex = normalizeExerciseKey(exerciseName);
  if (/band/.test(ex)) return "band";
  if (/push[-\s]?up|pull[-\s]?up|chin[-\s]?up|plank|dead bug|bird dog|leg raise|crunch|heel drop|stretch|alphabet|bridge|dip/.test(ex)) return "bodyweight";
  return "weighted";
};

const inferExerciseBucketV2 = (exerciseName = "") => {
  const ex = normalizeExerciseKey(exerciseName);
  if (/plank|dead bug|bird dog|leg raise|crunch|heel drop|hollow|carry/.test(ex)) return "core";
  return inferExerciseBucket(exerciseName);
};

const getWeightIncrementByBucketV2 = (bucket = "default") => (bucket === "lower_body" ? 5 : 2.5);

const getPlanWeekForDateKey = (dateKey = "", planStartDate = "") => {
  const anchor = planStartDate ? new Date(`${planStartDate}T12:00:00`) : PROFILE.startDate;
  const dateObj = new Date(`${dateKey}T12:00:00`);
  if (Number.isNaN(anchor.getTime()) || Number.isNaN(dateObj.getTime())) return 1;
  const diffWeeks = Math.ceil((dateObj - anchor) / (1000 * 60 * 60 * 24 * 7));
  return Math.max(1, diffWeeks || 1);
};

const getPhaseForDateKey = (dateKey = "", planStartDate = "") => {
  const week = getPlanWeekForDateKey(dateKey, planStartDate);
  return WEEKS[Math.max(0, Math.min(week - 1, WEEKS.length - 1))]?.phase || "BASE";
};

const shiftBandTension = (bandTension = "", direction = 0) => {
  const normalized = String(bandTension || "").trim();
  const currentIndex = BAND_TENSION_LEVELS.findIndex((level) => level.toLowerCase() === normalized.toLowerCase());
  const safeIndex = currentIndex >= 0 ? currentIndex : 0;
  const nextIndex = Math.max(0, Math.min(BAND_TENSION_LEVELS.length - 1, safeIndex + direction));
  return BAND_TENSION_LEVELS[nextIndex];
};

const extractGoalWeightFromText = (text = "") => {
  const matches = String(text || "").match(/(\d{2,3}(?:\.\d+)?)/g);
  if (!matches?.length) return null;
  return Number(matches[matches.length - 1]);
};

const parseExerciseGoalTargets = ({ goals = [], exercises = [] }) => {
  const liftTargets = parseLiftGoalWeights(goals);
  const pool = (goals || [])
    .filter((g) => g?.active && g?.category === "strength")
    .map((g) => `${g?.name || ""} ${g?.measurableTarget || ""}`.toLowerCase());
  const targets = {};
  (exercises || []).forEach((exercise) => {
    const exKey = normalizeExerciseKey(exercise);
    if (!exKey || targets[exKey]) return;
    const liftKey = inferLiftKey(exercise);
    if (liftKey && liftTargets[liftKey]) {
      targets[exKey] = { goalWeight: liftTargets[liftKey], liftKey };
      return;
    }
    const tokens = exKey.split(" ").filter((token) => token.length > 2);
    const match = pool.find((text) => text.includes(exKey) || tokens.filter((token) => text.includes(token)).length >= Math.min(2, tokens.length || 1));
    const goalWeight = extractGoalWeightFromText(match || "");
    if (goalWeight) targets[exKey] = { goalWeight, liftKey };
  });
  return targets;
};

const buildStrengthHistoryByExercise = (logs = {}) => {
  const historyByExercise = {};
  Object.entries(logs || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([dateKey, entry]) => {
      getExercisePerformanceRecordsForLog(entry || {}, { dateKey }).forEach((record) => {
        if (!record?.exerciseKey) return;
        historyByExercise[record.exerciseKey] = historyByExercise[record.exerciseKey] || [];
        historyByExercise[record.exerciseKey].push(record);
      });
    });
  return historyByExercise;
};

const getRecordActualWeight = (record = {}) => toFiniteNumber(record?.actual?.weight ?? record?.actualWeight, null);
const getRecordPrescribedWeight = (record = {}) => toFiniteNumber(record?.prescribed?.weight ?? record?.prescribedWeight, null);
const getRecordActualReps = (record = {}) => Number(record?.actual?.reps ?? record?.actualReps || 0);
const getRecordPrescribedReps = (record = {}) => Number(record?.prescribed?.reps ?? record?.prescribedReps || 0);
const getRecordActualSets = (record = {}) => Number(record?.actual?.sets ?? record?.actualSets || 0);
const getRecordPrescribedSets = (record = {}) => Number(record?.prescribed?.sets ?? record?.prescribedSets || 0);
const getRecordBandTension = (record = {}) => String(record?.prescribed?.bandTension || record?.bandTension || "").trim();
const getRecordBodyweightOnly = (record = {}) => Boolean(record?.prescribed?.bodyweightOnly ?? record?.bodyweightOnly);
const getRecordFeelScore = (record = {}) => Number(record?.metrics?.feelScore ?? record?.feelThisSession ?? 3);
const getRecordCompletionRatio = (record = {}) => Number(record?.metrics?.completionRatio ?? record?.completionRatio || 0);

const isFullExerciseCompletion = (record = {}) => getRecordActualReps(record) >= getRecordPrescribedReps(record) && getRecordActualSets(record) >= getRecordPrescribedSets(record);
const isHoldSignal = (record = {}) => getRecordActualReps(record) < (getRecordPrescribedReps(record) * 0.8) || getRecordActualSets(record) < getRecordPrescribedSets(record) || getRecordFeelScore(record) <= 2;
const isPoorSignal = (record = {}) => getRecordActualReps(record) < (getRecordPrescribedReps(record) * 0.7) && getRecordFeelScore(record) <= 2;

const getResistanceSignature = (record = {}, prescription = {}) => {
  if (getRecordBodyweightOnly(record) || prescription?.mode === "bodyweight") return "bodyweight";
  if (getRecordBandTension(record) || prescription?.bandTension) return `band:${getRecordBandTension(record) || prescription?.bandTension}`;
  const weight = toFiniteNumber(getRecordActualWeight(record) ?? getRecordPrescribedWeight(record) ?? prescription?.workingWeight, null);
  return weight !== null ? `weight:${weight}` : "weight:0";
};

const formatPrescriptionChangeValue = ({ mode = "weighted", weight = null, bandTension = "", sets = 0, reps = 0 }) => {
  if (mode === "bodyweight") return `${sets}x${reps}`;
  if (mode === "band") return bandTension || "Band";
  return weight !== null && weight !== undefined ? `${weight} lb` : `${sets} sets`;
};

const buildExercisePerformanceRowsForStorage = (dateKey = "", performance = []) => (
  buildExercisePerformanceRowsFromRecords(
    Array.isArray(performance) && performance.some((record) => record?.scope === "exercise")
      ? performance
      : getExercisePerformanceRecordsForLog({ strengthPerformance: performance || [] }, { dateKey })
  )
);

const deriveProgressiveOverloadAdjustmentsV2 = ({ logs = {}, performance = [], personalization = {}, currentPhase = "BASE", goals = [], goalState = {}, sessionDateKey = "" }) => {
  const historyByExercise = buildStrengthHistoryByExercise(logs);
  const phaseMode = resolvePhaseMode({ currentPhase, goals });
  const allowSetAddition = phaseMode === "build" || phaseMode === "maintain";
  const prior = personalization?.strengthProgression || {};
  const prevPrescriptions = prior?.prescriptions || {};
  const nextPrescriptions = { ...prevPrescriptions };
  const performanceRecords = Array.isArray(performance) && performance.some((record) => record?.scope === "exercise")
    ? performance.filter((record) => record?.scope === "exercise")
    : getExercisePerformanceRecordsForLog({ strengthPerformance: performance || [] }, { dateKey: sessionDateKey });
  const allExercises = Array.from(new Set([
    ...Object.keys(historyByExercise),
    ...performanceRecords.map((record) => normalizeExerciseKey(record?.exercise || "")),
    ...Object.values(prevPrescriptions || {}).map((record) => normalizeExerciseKey(record?.exercise || "")),
  ].filter(Boolean)));
  const goalTargets = parseExerciseGoalTargets({ goals, exercises: allExercises });
  const updates = [];

  performanceRecords.forEach((record) => {
    const exKey = record.exerciseKey;
    const exerciseHistory = historyByExercise[exKey] || [];
    const lastTwo = exerciseHistory.slice(-2);
    const existing = prevPrescriptions[exKey] || prevPrescriptions[record.liftKey] || {};
    const bucket = record.bucket || inferExerciseBucketV2(record.exercise);
    const maxSets = PROGRESSIVE_OVERLOAD_SET_CAPS_V2[bucket] || PROGRESSIVE_OVERLOAD_SET_CAPS_V2.default;
    const mode = record.mode || inferExerciseMode(record.exercise);
    const baseReps = Math.max(1, Number(existing?.baselineReps || getRecordPrescribedReps(record) || 1));
    let nextSets = Math.max(1, Number(existing?.sets || getRecordPrescribedSets(record) || 1));
    let nextReps = Math.max(1, Number(existing?.reps || getRecordPrescribedReps(record) || 1));
    let nextWeight = mode === "weighted" ? toFiniteNumber(existing?.workingWeight ?? getRecordPrescribedWeight(record) ?? getRecordActualWeight(record), null) : null;
    let nextBandTension = mode === "band" ? String(existing?.bandTension || getRecordBandTension(record) || BAND_TENSION_LEVELS[0]) : "";
    const oldSets = nextSets;
    const oldReps = nextReps;
    const oldWeight = nextWeight;
    const oldBandTension = nextBandTension;
    const bothSolid = lastTwo.length === 2 && lastTwo.every((item) => isFullExerciseCompletion(item) && getRecordFeelScore(item) >= 3);
    const bothPoor = lastTwo.length === 2 && lastTwo.every((item) => isPoorSignal(item));
    const resistanceSignature = getResistanceSignature(record, existing);
    let consecutiveSameResistance = 0;
    for (let idx = exerciseHistory.length - 1; idx >= 0; idx -= 1) {
      const item = exerciseHistory[idx];
      if (!isFullExerciseCompletion(item)) break;
      if (getResistanceSignature(item, existing) !== resistanceSignature) break;
      consecutiveSameResistance += 1;
    }
    let ruleTriggered = "hold";

    if (mode === "bodyweight") {
      if (bothPoor) {
        if (nextReps > baseReps) nextReps -= 1;
        else if (nextSets > 2) nextSets -= 1;
        ruleTriggered = "decrease_bodyweight_target";
      } else if (bothSolid) {
        if (nextReps < baseReps + 5) {
          nextReps += 1;
          ruleTriggered = "increase_bodyweight_reps";
        } else if (nextSets < maxSets) {
          nextSets += 1;
          nextReps = baseReps;
          ruleTriggered = "add_bodyweight_set";
        }
      } else if (lastTwo.some((item) => isHoldSignal(item))) {
        ruleTriggered = "hold_bodyweight_target";
      }
    } else {
      const addSetTriggered = allowSetAddition && consecutiveSameResistance >= 4 && nextSets < maxSets;
      if (addSetTriggered) {
        nextSets += 1;
        ruleTriggered = "add_set_after_four_full_sessions";
      } else if (bothPoor) {
        if (mode === "band") nextBandTension = shiftBandTension(nextBandTension, -1);
        else if (nextWeight !== null) nextWeight = Math.max(getWeightIncrementByBucketV2(bucket), Number((nextWeight - getWeightIncrementByBucketV2(bucket)).toFixed(1)));
        ruleTriggered = mode === "band" ? "decrease_band_tension" : "decrease_weight";
      } else if (bothSolid) {
        if (mode === "band") nextBandTension = shiftBandTension(nextBandTension, 1);
        else if (nextWeight !== null) nextWeight = Number((nextWeight + getWeightIncrementByBucketV2(bucket)).toFixed(1));
        ruleTriggered = mode === "band" ? "increase_band_tension" : "increase_weight";
      } else if (lastTwo.some((item) => isHoldSignal(item))) {
        ruleTriggered = mode === "band" ? "hold_band_tension" : "hold_weight";
      }
    }

    nextPrescriptions[exKey] = {
      exercise: record.exercise,
      bucket,
      mode,
      workingWeight: nextWeight,
      bandTension: nextBandTension || null,
      sets: nextSets,
      reps: nextReps,
      baselineReps: baseReps,
      liftKey: record.liftKey,
      updatedAt: Date.now(),
    };

    const oldValue = formatPrescriptionChangeValue({ mode, weight: oldWeight, bandTension: oldBandTension, sets: oldSets, reps: oldReps });
    const newValue = formatPrescriptionChangeValue({ mode, weight: nextWeight, bandTension: nextBandTension, sets: nextSets, reps: nextReps });
    if (oldValue !== newValue) {
      updates.push({
        exercise: record.exercise,
        exKey,
        liftKey: record.liftKey || exKey,
        mode,
        bucket,
        ruleTriggered,
        oldWeight,
        newWeight: nextWeight,
        oldBandTension,
        newBandTension: nextBandTension,
        oldSets,
        newSets: nextSets,
        oldReps,
        newReps: nextReps,
        oldValue,
        newValue,
      });
    }
  });

  const nextTracking = { ...(prior?.tracking || {}) };
  allExercises.forEach((exerciseKey) => {
    const history = historyByExercise[exerciseKey] || [];
    const prescription = nextPrescriptions[exerciseKey] || prevPrescriptions[exerciseKey] || {};
    const exerciseName = prescription?.exercise || history[history.length - 1]?.exercise || exerciseKey;
    const liftKey = prescription?.liftKey || inferLiftKey(exerciseName);
    const target = goalTargets[exerciseKey] || goalTargets[liftKey] || {};
    const weightedHistory = history.filter((record) => toFiniteNumber(getRecordActualWeight(record) ?? getRecordPrescribedWeight(record), null) !== null).slice(-4);
    const first = weightedHistory[0];
    const last = weightedHistory[weightedHistory.length - 1];
    const firstWeight = toFiniteNumber(getRecordActualWeight(first) ?? getRecordPrescribedWeight(first), null);
    const lastWeight = toFiniteNumber(getRecordActualWeight(last) ?? getRecordPrescribedWeight(last) ?? prescription?.workingWeight, null);
    const elapsedDays = first?.date && last?.date ? Math.max(1, (new Date(`${last.date}T12:00:00`) - new Date(`${first.date}T12:00:00`)) / 86400000) : 0;
    const elapsedWeeks = elapsedDays > 0 ? elapsedDays / 7 : 0;
    const progressionRate = weightedHistory.length >= 2 && firstWeight !== null && lastWeight !== null && elapsedWeeks > 0
      ? Number(((lastWeight - firstWeight) / elapsedWeeks).toFixed(2))
      : 0;
    const currentWorkingWeight = toFiniteNumber(prescription?.workingWeight ?? lastWeight, null);
    const goalWeight = toFiniteNumber(target?.goalWeight ?? nextTracking[exerciseKey]?.goalWeight, null);
    const weeksToGoal = goalWeight !== null && currentWorkingWeight !== null
      ? goalWeight <= currentWorkingWeight
        ? 0
        : progressionRate > 0
        ? Number(((goalWeight - currentWorkingWeight) / progressionRate).toFixed(1))
        : null
      : null;
    const projectedDate = weeksToGoal !== null ? toDateKey(Date.now() + (weeksToGoal * 7 * 86400000)) : "";
    const activeTimedGoal = getActiveTimeBoundGoal(goals);
    const deadlineDate = String(activeTimedGoal?.targetDate || goalState?.deadline || "").trim();
    const deadlineConflict = Boolean(projectedDate && deadlineDate && projectedDate > deadlineDate);
    const trackingKey = liftKey || exerciseKey;
    nextTracking[trackingKey] = {
      ...(nextTracking[trackingKey] || {}),
      exercise: exerciseName,
      exerciseKey,
      currentWorkingWeight,
      goalWeight,
      progressionRateLbsPerWeek: progressionRate,
      projectedWeeksToGoal: weeksToGoal,
      projectedDateToGoal: projectedDate,
      deadlineDate,
      deadlineConflict,
      deadlineMessage: deadlineConflict ? `Projected goal date ${projectedDate} is after your deadline ${deadlineDate}.` : "",
      updatedAt: Date.now(),
    };
  });

  return { updates, nextPrescriptions, nextTracking };
};

const HEALTHKIT_PERMISSIONS = [
  "Heart Rate (read)",
  "Resting Heart Rate (read)",
  "VO2 Max (read)",
  "Active Energy Burned (read)",
  "Workout sessions (read)",
  "Body Mass (read/write)",
  "Sleep Analysis (read)",
];

const clamp = (n, min, max) => Math.max(min, Math.min(max, n));

const deriveRunHealthMetrics = ({ workout = {}, log = {} }) => {
  const avgHr = Number(workout?.avgHr || workout?.averageHeartRate || 0);
  const maxHr = Number(workout?.maxHr || workout?.maxHeartRate || 0);
  const calories = Number(workout?.calories || workout?.activeEnergy || 0);
  const paceSeconds = (() => {
    const pace = String(log?.pace || "");
    const m = pace.match(/(\d+):(\d+)/);
    if (m) return (Number(m[1]) * 60) + Number(m[2]);
    return Number(workout?.paceSeconds || 0);
  })();
  const hrPaceRatio = (avgHr > 0 && paceSeconds > 0) ? Number((avgHr / paceSeconds).toFixed(3)) : null;
  const startHr = Number(workout?.startHr || avgHr || 0);
  const endHr = Number(workout?.endHr || avgHr || 0);
  const hrDrift = (startHr > 0 && endHr > 0) ? Number((((endHr - startHr) / startHr) * 100).toFixed(2)) : null;
  const recoveryHr = workout?.recoveryHr60 !== undefined && workout?.recoveryHr60 !== null
    ? Number(workout?.recoveryHr60)
    : (maxHr > 0 && Number(workout?.hrAfter60 || 0) > 0 ? Number(maxHr - Number(workout?.hrAfter60 || 0)) : null);
  return { avgHr, maxHr, calories, hrPaceRatio, hrDrift, recoveryHr };
};

const classifyRunFitnessLevel = ({ sessions = [], age = 30, actualMaxHr = null }) => {
  if (sessions.length < 5) return "unknown";
  const estimatedMax = Number(actualMaxHr || (220 - Number(age || 30)));
  const easyRuns = sessions.filter((s) => /easy|recovery/.test(String(s?.type || "").toLowerCase()) && Number(s?.avgHr || 0) > 0);
  if (!easyRuns.length || estimatedMax <= 0) return "unknown";
  const ratios = easyRuns.map((s) => Number(s.avgHr) / estimatedMax).filter((v) => Number.isFinite(v) && v > 0);
  if (!ratios.length) return "unknown";
  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;
  if (avg > 0.75) return "developing";
  if (avg >= 0.65) return "intermediate";
  return "advanced";
};

const deriveFitnessLayer = ({ logs = {}, personalization = {} }) => {
  const appleWorkouts = personalization?.connectedDevices?.appleHealth?.workouts || {};
  const dated = Object.entries(logs || {}).sort((a, b) => a[0].localeCompare(b[0]));
  const runSessions = dated
    .map(([date, log]) => {
      const sessionRecord = getSessionPerformanceRecordsForLog(log || {}, { dateKey: date })
        .find((record) => record?.sessionFamily === "run" || record?.domain === "endurance");
      const looksLikeRun = sessionRecord || /run/.test(String(log?.type || "").toLowerCase());
      if (!looksLikeRun) return null;
      const workout = appleWorkouts?.[date] || {};
      const metrics = deriveRunHealthMetrics({ workout, log });
      return {
        date,
        type: sessionRecord?.sessionType || log?.type || "",
        avgHr: sessionRecord?.actual?.avgHr ?? metrics.avgHr,
        maxHr: sessionRecord?.actual?.maxHr ?? metrics.maxHr,
        calories: sessionRecord?.actual?.calories ?? metrics.calories,
        hrPaceRatio: sessionRecord?.actual?.hrPaceRatio ?? metrics.hrPaceRatio,
        hrDrift: sessionRecord?.actual?.hrDrift ?? metrics.hrDrift,
        recoveryHr: sessionRecord?.actual?.recoveryHr ?? metrics.recoveryHr,
      };
    })
    .filter(Boolean)
    .filter((s) => Number(s?.avgHr || 0) > 0);
  const last5WithHr = runSessions.slice(-5);
  const fitnessLevel = classifyRunFitnessLevel({
    sessions: last5WithHr,
    age: personalization?.profile?.age || PROFILE.age,
    actualMaxHr: personalization?.profile?.actualMaxHr || null,
  });
  const targetMid = 0.7;
  const recentEasy = runSessions.slice(-8).filter((s) => /easy|recovery/.test(String(s?.type || "").toLowerCase()));
  const easyAvgPct = (() => {
    const maxHr = Number(personalization?.profile?.actualMaxHr || (220 - Number(personalization?.profile?.age || PROFILE.age)));
    if (!recentEasy.length || maxHr <= 0) return null;
    return recentEasy.reduce((acc, s) => acc + (Number(s.avgHr || 0) / maxHr), 0) / recentEasy.length;
  })();
  const paceOffsetSec = easyAvgPct === null ? 0 : easyAvgPct > targetMid + 0.05 ? 18 : easyAvgPct < targetMid - 0.07 ? -12 : 0;
  const strengthSamples = dated
    .flatMap(([dateKey, l]) => getExercisePerformanceRecordsForLog(l || {}, { dateKey }).map((record) => Number(getRecordCompletionRatio(record))))
    .filter((n) => Number.isFinite(n) && n > 0)
    .slice(-15);
  const strengthRirEstimate = strengthSamples.length ? Number((strengthSamples.reduce((a, b) => a + b, 0) / strengthSamples.length).toFixed(2)) : null;
  const strengthLevel = strengthRirEstimate === null ? "unknown" : strengthRirEstimate < 0.85 ? "developing" : strengthRirEstimate < 0.98 ? "intermediate" : "advanced";
  const mergedFitness = fitnessLevel === "unknown" ? strengthLevel : fitnessLevel;
  return {
    fitnessLevel: mergedFitness,
    runSignals: runSessions,
    paceOffsetSec,
    strengthLevel,
    strengthRirEstimate,
    updatedAt: Date.now(),
  };
};

const deriveGarminReadiness = (personalization = {}, todayKey = new Date().toISOString().split("T")[0]) => {
  const garmin = personalization?.connectedDevices?.garmin || {};
  const summary = garmin?.dailySummaries?.[todayKey] || {};
  const score = Number(summary?.trainingReadinessScore ?? garmin?.trainingReadinessScore ?? 0);
  if (!Number.isFinite(score) || score <= 0) return { score: null, mode: null, source: "none" };
  if (score >= 75) return { score, mode: "locked_in", source: "garmin" };
  if (score >= 50) return { score, mode: "standard", source: "garmin" };
  if (score >= 25) return { score, mode: "reduced_load", source: "garmin" };
  return { score, mode: "recovery", source: "garmin" };
};

const deriveDeviceSyncAudit = (personalization = {}, todayKey = new Date().toISOString().split("T")[0]) => {
  const appleWorkouts = personalization?.connectedDevices?.appleHealth?.workouts || {};
  const garminActivities = personalization?.connectedDevices?.garmin?.activities || [];
  const garminSummary = personalization?.connectedDevices?.garmin?.dailySummaries?.[todayKey] || {};
  const recentCutoff = Date.now() - (7 * 86400000);
  const appleRecent = Object.entries(appleWorkouts).filter(([date]) => new Date(`${date}T12:00:00`).getTime() >= recentCutoff);
  const garminRecent = (garminActivities || []).filter((a) => {
    const t = new Date(a?.startTime || a?.date || "").getTime();
    return Number.isFinite(t) && t >= recentCutoff;
  });
  const readiness = Number(garminSummary?.trainingReadinessScore ?? personalization?.connectedDevices?.garmin?.trainingReadinessScore ?? 0);
  const sleep = Number(garminSummary?.sleepScore ?? 0);
  const stress = Number(garminSummary?.stressScore ?? 0);
  const utilization = [
    appleRecent.length > 0 ? `Apple Health workouts (7d): ${appleRecent.length}` : "Apple Health workouts (7d): none",
    garminRecent.length > 0 ? `Garmin activities (7d): ${garminRecent.length}` : "Garmin activities (7d): none",
    readiness > 0 ? `Garmin readiness: ${readiness}` : "Garmin readiness: unavailable",
    sleep > 0 ? `Sleep score: ${sleep}` : "Sleep score: unavailable",
  ];
  let planMode = "normal";
  let reason = "";
  if (readiness > 0 && readiness <= 30) {
    planMode = "recovery";
    reason = "Low Garmin readiness";
  } else if ((sleep > 0 && sleep < 45) || stress >= 80) {
    planMode = "reduced_load";
    reason = sleep > 0 && sleep < 45 ? "Low sleep score" : "High stress score";
  }
  return { appleRecentCount: appleRecent.length, garminRecentCount: garminRecent.length, readiness, sleep, stress, planMode, reason, utilization };
};

const matchGarminRunActivity = ({ garminActivities = [], dateKey = "", log = {} }) => {
  const logTime = new Date(`${dateKey}T12:00:00`).getTime();
  const maxDiff = 2 * 60 * 60 * 1000;
  return (garminActivities || [])
    .filter((a) => /run/i.test(String(a?.type || a?.sport || "")))
    .map((a) => {
      const startTs = Number(a?.startTs || new Date(a?.startTime || `${dateKey}T12:00:00`).getTime());
      return { ...a, diff: Math.abs(startTs - logTime) };
    })
    .filter((a) => a.diff <= maxDiff)
    .sort((a, b) => a.diff - b.diff)[0] || null;
};

const buildRunRoutine = (todayWorkout) => {
  const run = todayWorkout?.run;
  if (!run) return [];
  const focus = run.t || "Run";
  if (focus === "Intervals") {
    return [
      { ex: "Warm-up jog", sets: "1", reps: "10-15 min easy + drills", rest: "Ã¢â‚¬â€", cue: "Stay relaxed and progressively raise cadence." },
      { ex: "Main interval set", sets: "1", reps: run.d || "As prescribed", rest: "Recoveries built in", cue: "Hit quality effort; keep form tall." },
      { ex: "Cool-down", sets: "1", reps: "8-12 min easy jog/walk", rest: "Ã¢â‚¬â€", cue: "Lower HR gradually; finish with light mobility." },
    ];
  }
  if (focus === "Tempo") {
    return [
      { ex: "Warm-up", sets: "1", reps: "10-15 min easy + strides", rest: "Ã¢â‚¬â€", cue: "Prime mechanics before threshold work." },
      { ex: "Tempo segment", sets: "1", reps: run.d || "As prescribed", rest: "Steady", cue: "Controlled discomfort, even pacing." },
      { ex: "Cool-down", sets: "1", reps: "8-12 min easy", rest: "Ã¢â‚¬â€", cue: "Finish smooth and conversational." },
    ];
  }
  if (focus === "Long") {
    return [
      { ex: "Long aerobic run", sets: "1", reps: run.d || "As prescribed", rest: "Continuous", cue: "Easy effort, nose-breathing test early." },
      { ex: "Fuel & hydration", sets: "Every 30-40 min", reps: "Water + carbs as needed", rest: "Ã¢â‚¬â€", cue: "Start fueling before you feel depleted." },
      { ex: "Post-run reset", sets: "1", reps: "5-10 min walk + calf/hip mobility", rest: "Ã¢â‚¬â€", cue: "Downshift gradually to aid recovery." },
    ];
  }
  return [
    { ex: "Easy aerobic run", sets: "1", reps: run.d || "As prescribed", rest: "Continuous", cue: "Conversational pace, smooth cadence." },
    { ex: "Strides (optional)", sets: "4-6", reps: "15-20s", rest: "40-60s walk", cue: "Quick feet, relaxed upper body." },
    { ex: "Cool-down walk", sets: "1", reps: "5 min", rest: "Ã¢â‚¬â€", cue: "Finish breathing calm and controlled." },
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
const stripInternalTags = (text = "") => String(text || "").replace(/\[.*?\]/g, "").replace(/\s{2,}/g, " ").trim();
const normalizePendingStrengthAdjustments = (value) => {
  if (Array.isArray(value)) return value.filter(Boolean);
  return value ? [value] : [];
};
const sanitizeDisplayText = (text = "") => stripInternalTags(
  String(text || "")
    .replace(/Auto-assumed complete unless corrected\.?/gi, "")
    .replace(/\btravelRun\b/gi, "run")
    .replace(/\bhybridRun\b/gi, "run + strength")
).trim();
const joinHumanList = (items = []) => {
  const filtered = (items || []).filter(Boolean);
  if (!filtered.length) return "";
  if (filtered.length === 1) return filtered[0];
  if (filtered.length === 2) return `${filtered[0]} and ${filtered[1]}`;
  return `${filtered.slice(0, -1).join(", ")}, and ${filtered[filtered.length - 1]}`;
};
const buildProvenanceText = ({ inputs = [], limitation = "" }) => {
  const joined = joinHumanList(inputs);
  if (!joined) return limitation || "";
  return limitation ? `Based on ${joined}. ${limitation}` : `Based on ${joined}.`;
};
const CANONICAL_INVARIANTS_ENABLED = (() => {
  if (typeof window === "undefined") return false;
  try {
    const host = String(window.location?.hostname || "").toLowerCase();
    const storedDebug = localStorage?.getItem ? (localStorage.getItem("trainer_debug") || "0") : "0";
    return ["localhost", "127.0.0.1"].includes(host) || storedDebug === "1";
  } catch {
    return false;
  }
})();
const warnCanonicalInvariant = (entity = "CanonicalState", message = "", context = null) => {
  if (!CANONICAL_INVARIANTS_ENABLED) return false;
  try {
    console.warn(`[canonical-invariant] ${entity}: ${message}`, context || {});
  } catch {}
  return false;
};
const assertCanonicalInvariant = (condition, entity = "CanonicalState", message = "", context = null) => (
  condition ? true : warnCanonicalInvariant(entity, message, context)
);
const validateActualNutritionLogInvariant = (actualNutritionLog = null, expectedDateKey = "", origin = "unknown") => {
  if (!actualNutritionLog) return true;
  const ok =
    assertCanonicalInvariant(typeof actualNutritionLog === "object", "ActualNutritionLog", "value should be an object", { origin, actualNutritionLog })
    && assertCanonicalInvariant(String(actualNutritionLog?.model || "") === "actual_nutrition_log_v1", "ActualNutritionLog", "unexpected model", { origin, model: actualNutritionLog?.model })
    && assertCanonicalInvariant(Boolean(String(actualNutritionLog?.dateKey || "").trim()), "ActualNutritionLog", "dateKey is required", { origin, actualNutritionLog })
    && assertCanonicalInvariant(!expectedDateKey || actualNutritionLog?.dateKey === expectedDateKey, "ActualNutritionLog", "dateKey does not match expected key", { origin, expectedDateKey, actualDateKey: actualNutritionLog?.dateKey })
    && assertCanonicalInvariant(typeof actualNutritionLog?.adherence === "string", "ActualNutritionLog", "adherence should be a string", { origin, adherence: actualNutritionLog?.adherence })
    && assertCanonicalInvariant(typeof actualNutritionLog?.deviationKind === "string", "ActualNutritionLog", "deviationKind should be a string", { origin, deviationKind: actualNutritionLog?.deviationKind });
  return ok;
};
const validatePlanWeekInvariant = (planWeek = null, origin = "unknown") => {
  if (!planWeek) return true;
  const sessionsByDay = planWeek?.sessionsByDay;
  const ok =
    assertCanonicalInvariant(typeof planWeek === "object", "PlanWeek", "value should be an object", { origin, planWeek })
    && assertCanonicalInvariant(Boolean(String(planWeek?.id || "").trim()), "PlanWeek", "id is required", { origin, planWeek })
    && assertCanonicalInvariant(Number.isFinite(Number(planWeek?.absoluteWeek || planWeek?.weekNumber || 0)), "PlanWeek", "absoluteWeek/weekNumber should be numeric", { origin, absoluteWeek: planWeek?.absoluteWeek, weekNumber: planWeek?.weekNumber })
    && assertCanonicalInvariant(Boolean(planWeek?.weeklyIntent && typeof planWeek.weeklyIntent === "object"), "PlanWeek", "weeklyIntent should be present", { origin, weeklyIntent: planWeek?.weeklyIntent })
    && assertCanonicalInvariant(Boolean(sessionsByDay && typeof sessionsByDay === "object" && !Array.isArray(sessionsByDay)), "PlanWeek", "sessionsByDay should be an object map", { origin, sessionsByDay });
  return ok;
};
const validatePlanDayInvariant = (planDay = null, origin = "unknown") => {
  if (!planDay) return true;
  const nutritionActual = planDay?.resolved?.nutrition?.actual || null;
  const ok =
    assertCanonicalInvariant(typeof planDay === "object", "PlanDay", "value should be an object", { origin, planDay })
    && assertCanonicalInvariant(Boolean(String(planDay?.dateKey || "").trim()), "PlanDay", "dateKey is required", { origin, dateKey: planDay?.dateKey })
    && assertCanonicalInvariant(Boolean(planDay?.base && typeof planDay.base === "object"), "PlanDay", "base branch is required", { origin, base: planDay?.base })
    && assertCanonicalInvariant(Boolean(planDay?.resolved && typeof planDay.resolved === "object"), "PlanDay", "resolved branch is required", { origin, resolved: planDay?.resolved })
    && assertCanonicalInvariant(Boolean(planDay?.resolved?.training || planDay?.base?.training), "PlanDay", "training payload is missing", { origin, planDay })
    && assertCanonicalInvariant(Boolean(planDay?.decision && typeof planDay.decision === "object"), "PlanDay", "decision block is required", { origin, decision: planDay?.decision });
  if (nutritionActual) validateActualNutritionLogInvariant(nutritionActual, planDay?.dateKey || "", `${origin}:resolved.nutrition.actual`);
  return ok;
};
const validatePrescribedDayHistoryInvariant = (entry = null, expectedDateKey = "", origin = "unknown") => {
  if (!entry) return true;
  const revisions = Array.isArray(entry?.revisions) ? entry.revisions : [];
  const currentRevision = revisions.find((revision) => revision?.revisionId === entry?.currentRevisionId) || null;
  const ok =
    assertCanonicalInvariant(Boolean(String(entry?.dateKey || expectedDateKey || "").trim()), "PrescribedDayHistory", "dateKey is required", { origin, entry })
    && assertCanonicalInvariant(!expectedDateKey || entry?.dateKey === expectedDateKey, "PrescribedDayHistory", "history envelope dateKey mismatch", { origin, expectedDateKey, actualDateKey: entry?.dateKey })
    && assertCanonicalInvariant(Array.isArray(entry?.revisions) && revisions.length > 0, "PrescribedDayHistory", "revisions are required", { origin, revisions })
    && assertCanonicalInvariant(Boolean(entry?.currentRevisionId), "PrescribedDayHistory", "currentRevisionId is required", { origin, currentRevisionId: entry?.currentRevisionId })
    && assertCanonicalInvariant(Boolean(currentRevision), "PrescribedDayHistory", "currentRevisionId must resolve to a revision", { origin, currentRevisionId: entry?.currentRevisionId, revisionIds: revisions.map((revision) => revision?.revisionId) });
  revisions.forEach((revision, index) => {
    assertCanonicalInvariant(Number(revision?.revisionNumber || 0) === index + 1 || Number(revision?.revisionNumber || 0) > 0, "PrescribedDayHistory", "revisionNumber should be positive and ordered", { origin, revisionNumber: revision?.revisionNumber, index });
    assertCanonicalInvariant(revision?.record?.dateKey === (entry?.dateKey || expectedDateKey), "PrescribedDayHistory", "revision record dateKey mismatch", { origin, revisionDateKey: revision?.record?.dateKey, envelopeDateKey: entry?.dateKey || expectedDateKey });
  });
  return ok;
};
const validateAiPacketInvariant = (packetArgs = {}, origin = "unknown") => {
  const ok =
    assertCanonicalInvariant(Boolean(packetArgs && typeof packetArgs === "object"), "AIPacket", "packetArgs should be an object", { origin, packetArgs })
    && assertCanonicalInvariant(Boolean(String(packetArgs?.dateKey || "").trim()), "AIPacket", "dateKey is required", { origin, dateKey: packetArgs?.dateKey })
    && assertCanonicalInvariant(Number.isFinite(Number(packetArgs?.currentWeek || 0)), "AIPacket", "currentWeek should be numeric", { origin, currentWeek: packetArgs?.currentWeek })
    && assertCanonicalInvariant(Boolean(packetArgs?.canonicalGoalState && typeof packetArgs.canonicalGoalState === "object"), "AIPacket", "canonicalGoalState is required", { origin })
    && assertCanonicalInvariant(Boolean(packetArgs?.canonicalUserProfile && typeof packetArgs.canonicalUserProfile === "object"), "AIPacket", "canonicalUserProfile is required", { origin })
    && assertCanonicalInvariant(Boolean(packetArgs?.planDay && typeof packetArgs.planDay === "object"), "AIPacket", "planDay is required", { origin })
    && assertCanonicalInvariant(Boolean(packetArgs?.logs && typeof packetArgs.logs === "object"), "AIPacket", "logs should be an object map", { origin })
    && assertCanonicalInvariant(Boolean(Array.isArray(packetArgs?.bodyweights)), "AIPacket", "bodyweights should be an array", { origin, bodyweights: packetArgs?.bodyweights });
  validatePlanDayInvariant(packetArgs?.planDay || null, `${origin}:packet.planDay`);
  validatePlanWeekInvariant(packetArgs?.planWeek || null, `${origin}:packet.planWeek`);
  return ok;
};
const validateDeterministicCoachPacketInvariant = (packet = null, origin = "unknown") => {
  if (!packet) return warnCanonicalInvariant("CoachPacket", "deterministic packet is missing", { origin, packet });
  return (
    assertCanonicalInvariant(typeof packet === "object", "CoachPacket", "packet should be an object", { origin, packet })
    && assertCanonicalInvariant(
      Boolean(String(packet?.coachBrief || "").trim()) || Array.isArray(packet?.recommendations) || Array.isArray(packet?.notices),
      "CoachPacket",
      "expected coachBrief, recommendations, or notices",
      { origin, packet }
    )
  );
};
const validateCanonicalRuntimeStateInvariant = (runtimeState = null, origin = "unknown") => {
  if (!runtimeState || typeof runtimeState !== "object") return warnCanonicalInvariant("RuntimeState", "runtimeState should be an object", { origin, runtimeState });
  assertCanonicalInvariant(Boolean(runtimeState?.logs && typeof runtimeState.logs === "object"), "RuntimeState", "logs should be an object map", { origin });
  assertCanonicalInvariant(Array.isArray(runtimeState?.bodyweights), "RuntimeState", "bodyweights should be an array", { origin, bodyweights: runtimeState?.bodyweights });
  assertCanonicalInvariant(Boolean(runtimeState?.plannedDayRecords && typeof runtimeState.plannedDayRecords === "object"), "RuntimeState", "plannedDayRecords should be an object map", { origin });
  Object.entries(runtimeState?.nutritionActualLogs || {}).slice(0, 40).forEach(([dateKey, actualNutritionLog]) => {
    validateActualNutritionLogInvariant(actualNutritionLog, dateKey, `${origin}:runtime.nutritionActualLogs`);
  });
  Object.entries(runtimeState?.plannedDayRecords || {}).slice(0, 40).forEach(([dateKey, entry]) => {
    validatePrescribedDayHistoryInvariant(entry, dateKey, `${origin}:runtime.plannedDayRecords`);
  });
  return true;
};
const buildTrustSummary = ({
  explicitUserInput = false,
  loggedActuals = false,
  deviceData = false,
  inferredHeuristics = false,
  limitation = "",
  stale = false,
} = {}) => {
  const level = (explicitUserInput || loggedActuals) && (deviceData || inferredHeuristics)
    ? "grounded"
    : (explicitUserInput || loggedActuals || deviceData)
    ? "partial"
    : "limited";
  const sources = [
    explicitUserInput ? "explicit user input" : null,
    loggedActuals ? "logged actuals" : null,
    deviceData ? "device data" : null,
    inferredHeuristics ? "inferred heuristics" : null,
  ].filter(Boolean);
  let summary = sources.length ? `Using ${joinHumanList(sources)}.` : "Using limited data.";
  if (!explicitUserInput && !loggedActuals && !deviceData) {
    summary = inferredHeuristics
      ? "Using inferred heuristics because no explicit input, actual log, or device data is available."
      : "No explicit input, actual log, or device data is available yet.";
  } else if (!explicitUserInput && !loggedActuals) {
    summary = `Using ${joinHumanList(sources)}. No explicit input or actual log is available yet.`;
  } else if (!deviceData && inferredHeuristics) {
    summary = `Using ${joinHumanList(sources)}. No device data is contributing here.`;
  }
  if (stale) summary += " Some supporting data is stale.";
  if (limitation) summary += ` ${limitation}`;
  return {
    level,
    label: level === "grounded" ? "Grounded" : level === "partial" ? "Partial data" : "Limited data",
    summary,
    sourceLine: sources.length ? joinHumanList(sources) : "limited inputs",
  };
};

// Ã¢â€â‚¬Ã¢â€â‚¬ HELPERS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const READINESS_SUCCESS_STATUSES = new Set(["completed_as_planned", "completed_modified", "partial_completed"]);
const toReadinessNumber = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const hasReadinessInputs = (checkin = {}) => {
  const sleep = toReadinessNumber(checkin?.readiness?.sleep);
  const stress = toReadinessNumber(checkin?.readiness?.stress);
  const soreness = toReadinessNumber(checkin?.readiness?.soreness);
  const feel = String(checkin?.sessionFeel || "").trim();
  return sleep > 0 || stress > 0 || soreness > 0 || Boolean(feel);
};
const classifySessionDemand = (session = {}) => {
  const text = `${session?.type || ""} ${session?.label || ""} ${session?.run?.t || ""}`.toLowerCase();
  if (/rest|recovery|mobility|walk/.test(text)) return "recovery";
  if (/interval|tempo|long|hard|race|conditioning|otf|hiit|quality/.test(text)) return "high";
  if (/strength|run\+strength|strength\+prehab|hybrid|upper|lower|full.body|metabolic/.test(text)) return "moderate";
  if (/easy|steady|zone-2|zone 2/.test(text)) return "low";
  return "moderate";
};
const appendWorkoutQualifier = (label = "", qualifier = "") => {
  const base = String(label || "Session").trim() || "Session";
  if (!qualifier) return base;
  return base.toLowerCase().includes(String(qualifier).toLowerCase()) ? base : `${base} (${qualifier})`;
};
const scaleSessionDescriptor = (text = "", fallback = "20-30 min controlled", ratio = 0.72) => {
  const input = String(text || "").trim();
  if (!input) return fallback;
  const scaled = input.replace(/(\d+(\.\d+)?)/g, (match) => {
    const num = Number(match);
    if (!Number.isFinite(num)) return match;
    return String(Math.max(1, Math.round(num * ratio * 10) / 10));
  });
  return scaled === input ? fallback : scaled;
};
const getCurrentWeek = (planStartDate = "") => {
  const now = new Date();
  const anchor = planStartDate ? new Date(`${planStartDate}T12:00:00`) : PROFILE.startDate;
  const diff = (now - anchor) / (1000 * 60 * 60 * 24 * 7);
  return Math.max(1, Math.ceil(diff));
};

const getDayOfWeek = () => {
  return new Date().getDay(); // 0=Sun,1=Mon,...,6=Sat
};

const deriveTodayReadinessInfluence = ({ todayKey = new Date().toISOString().split("T")[0], checkin = {}, promptSignal = null, workout = null, logs = {}, dailyCheckins = {}, personalization = {}, momentum = {}, userProfile = {} }) => {
  const promptState = String(promptSignal?.state || "").toLowerCase();
  const baseWorkout = { ...(workout || {}), run: workout?.run ? { ...workout.run } : workout?.run };
  if (!Object.keys(baseWorkout).length) return null;

  const isNegativeRecovery = (candidate = {}) => {
    const sleep = toReadinessNumber(candidate?.readiness?.sleep);
    const stress = toReadinessNumber(candidate?.readiness?.stress);
    const soreness = toReadinessNumber(candidate?.readiness?.soreness);
    const feel = String(candidate?.sessionFeel || "").toLowerCase();
    return feel === "harder_than_expected" || (sleep > 0 && sleep <= 2) || stress >= 4 || soreness >= 4;
  };
  const isPositiveRecovery = (candidate = {}) => {
    const sleep = toReadinessNumber(candidate?.readiness?.sleep);
    const stress = toReadinessNumber(candidate?.readiness?.stress);
    const soreness = toReadinessNumber(candidate?.readiness?.soreness);
    const feel = String(candidate?.sessionFeel || "").toLowerCase();
    return feel === "easier_than_expected" || (sleep >= 4 && stress > 0 && stress <= 2 && soreness > 0 && soreness <= 2);
  };

  const todayTs = new Date(`${todayKey}T12:00:00`).getTime();
  const targetDays = Math.max(2, Number(userProfile?.daysPerWeek || userProfile?.days_per_week) || 3);
  const allDates = Array.from(new Set([...(Object.keys(logs || {})), ...(Object.keys(dailyCheckins || {}))]));
  const recentRows = allDates
    .filter((dateKey) => {
      const t = new Date(`${dateKey}T12:00:00`).getTime();
      const diff = (todayTs - t) / 86400000;
      return diff > 0 && diff <= 10;
    })
    .sort((a, b) => b.localeCompare(a))
    .map((dateKey) => {
      const t = new Date(`${dateKey}T12:00:00`).getTime();
      const daysBack = Math.max(0, Math.round(((todayTs - t) / 86400000) * 10) / 10);
      const log = logs?.[dateKey] || {};
      const mergedCheckin = { ...(log?.checkin || {}), ...(dailyCheckins?.[dateKey] || {}) };
      return {
        date: dateKey,
        daysBack,
        log,
        checkin: mergedCheckin,
        status: resolveEffectiveStatus(mergedCheckin, dateKey),
        demand: classifySessionDemand({ type: log?.type, label: log?.label, run: { t: log?.type } }),
      };
    });
  const recent7 = recentRows.filter((row) => row.daysBack <= 7);
  const completedCount = recent7.filter((row) => READINESS_SUCCESS_STATUSES.has(row.status)).length;
  const skippedCount = recent7.filter((row) => row.status === "skipped" || row.status === "not_logged_expired").length;
  const modifiedCount = recent7.filter((row) => row.status === "completed_modified" || row.status === "partial_completed").length;
  const consistencyRatio = Math.min(1.25, completedCount / Math.max(1, targetDays));
  const hardSessions72h = recentRows.filter((row) => row.daysBack <= 3 && row.demand === "high").length;
  const hardSessions7d = recent7.filter((row) => row.demand === "high").length;
  const recentSupportiveCount = recentRows.slice(0, 3).filter((row) => isPositiveRecovery(row.checkin)).length;
  const recentStrainedCount = recentRows.slice(0, 3).filter((row) => isNegativeRecovery(row.checkin)).length;
  const latestRecoveryRow = recentRows.find((row) => hasReadinessInputs(row.checkin)) || null;
  const activeCheckin = hasReadinessInputs(checkin) ? checkin : (latestRecoveryRow?.checkin || {});
  const sleep = toReadinessNumber(activeCheckin?.readiness?.sleep);
  const stress = toReadinessNumber(activeCheckin?.readiness?.stress);
  const soreness = toReadinessNumber(activeCheckin?.readiness?.soreness);
  const feel = String(activeCheckin?.sessionFeel || "").toLowerCase();
  const inputDriven = hasReadinessInputs(checkin) || Boolean(promptState);
  const explicitDeviceBias = String(baseWorkout?.readinessBias || "").toLowerCase();
  const planBias = explicitDeviceBias
    || (baseWorkout?.type === "rest" && /recovery mode/i.test(String(baseWorkout?.label || "")) ? "recover" : "")
    || (baseWorkout?.minDay ? "reduce" : "");

  let protectScore = 0;
  let progressScore = 0;
  const protectReasons = [];
  const progressReasons = [];

  if (planBias === "recover") {
    protectScore += 4;
    protectReasons.push(explicitDeviceBias === "recover" ? "device readiness is low" : "the current plan is already protecting recovery");
  } else if (planBias === "reduce") {
    protectScore += 2;
    protectReasons.push(explicitDeviceBias === "reduce" ? "device readiness is cautious" : "the current plan is already reduced");
  }
  if (String(personalization?.injuryPainState?.level || "none") !== "none") {
    protectScore += 2;
    protectReasons.push("injury status still needs protection");
  }
  if (promptState === "recover") {
    protectScore += 2;
    protectReasons.push("you flagged low readiness");
  }
  if ((sleep > 0 && sleep <= 1) || stress >= 5 || soreness >= 5) {
    protectScore += 4;
    protectReasons.push("today's recovery input is clearly strained");
  } else if (isNegativeRecovery(activeCheckin)) {
    protectScore += 3;
    protectReasons.push("today's recovery input is strained");
  } else if (recentStrainedCount >= 2) {
    protectScore += 1;
    protectReasons.push("recent recovery signals have been trending heavy");
  }
  if (hardSessions72h >= 2) {
    protectScore += 2;
    protectReasons.push("recent intensity stacked up");
  } else if (hardSessions72h === 1 && (isNegativeRecovery(activeCheckin) || recentStrainedCount >= 1)) {
    protectScore += 1;
    protectReasons.push("a recent hard session is still hanging around");
  }
  if (consistencyRatio < 0.45) {
    protectScore += 2;
    protectReasons.push("recent schedule consistency is low");
  } else if (consistencyRatio < 0.6 || skippedCount >= 2) {
    protectScore += 1;
    protectReasons.push("consistency is better served by a finishable day");
  }
  if (modifiedCount >= 2) {
    protectScore += 1;
    protectReasons.push("recent sessions have needed modification");
  }

  if (promptState === "push") {
    progressScore += 1;
    progressReasons.push("you flagged high readiness");
  }
  if (isPositiveRecovery(activeCheckin)) {
    progressScore += 3;
    progressReasons.push("today's recovery input is supportive");
  } else if (recentSupportiveCount >= 2) {
    progressScore += 1;
    progressReasons.push("recent recovery inputs have been steady");
  }
  if (consistencyRatio >= 0.85 && skippedCount === 0) {
    progressScore += 1;
    progressReasons.push("recent completion has been consistent");
  }
  if (hardSessions72h === 0 && hardSessions7d <= 2) {
    progressScore += 1;
    progressReasons.push("recent intensity is under control");
  }
  if (momentum?.momentumState === "building momentum") {
    progressScore += 1;
    progressReasons.push("training momentum is building");
  }

  const state = protectScore >= 6 || (protectScore >= 4 && (hardSessions72h >= 1 || planBias === "recover"))
    ? "recovery"
    : protectScore >= 3
    ? "reduced_load"
    : progressScore >= 4 && protectScore === 0
    ? "progression"
    : "steady";

  const adjustedWorkout = { ...baseWorkout, run: baseWorkout?.run ? { ...baseWorkout.run } : baseWorkout?.run };
  const baseDemand = classifySessionDemand(baseWorkout);
  const reasonText = joinHumanList((state === "progression" ? progressReasons : protectReasons).slice(0, 3));
  const baseExplanation = String(baseWorkout?.explanation || "").trim();
  const appendEnvironmentNote = (note = "") => {
    adjustedWorkout.environmentNote = [baseWorkout?.environmentNote, note].filter(Boolean).join(" ").trim();
  };

  let badge = "";
  let coachLine = "";
  let recoveryLine = "";
  let userVisibleLine = "";

  if (state === "recovery") {
    badge = "Recovery focus";
    if (adjustedWorkout?.run) {
      adjustedWorkout.run.t = "Recovery Aerobic";
      adjustedWorkout.run.d = baseDemand === "high" ? "20-30 min easy aerobic" : "15-25 min walk or easy spin";
    }
    adjustedWorkout.type = adjustedWorkout?.run ? "recovery" : "rest";
    adjustedWorkout.label = appendWorkoutQualifier(baseWorkout?.label, "Recovery focus");
    adjustedWorkout.minDay = true;
    adjustedWorkout.nutri = "rest";
    adjustedWorkout.success = "Keep effort easy, do the mobility work, and finish fresher than you started.";
    adjustedWorkout.recoveryRecommendation = "Walk or easy spin + 8-10 min mobility.";
    adjustedWorkout.intensityGuidance = "low";
    adjustedWorkout.optionalSecondary = "8-10 min mobility reset";
    if (adjustedWorkout?.strSess) adjustedWorkout.strengthDuration = "12-15 min mobility + activation";
    appendEnvironmentNote("Recovery focus today: walking, easy aerobic work, and mobility only.");
    coachLine = "Recovery focus today: remove intensity, keep movement easy, and protect the next 48 hours.";
    recoveryLine = "Recovery recommendation: walk or easy spin, then 8-10 minutes of mobility.";
    userVisibleLine = "Your recovery inputs and recent load shifted today toward recovery work.";
    adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness state is recovery focus based on ${reasonText || "strained recovery and recent load"}. Today's call is easy movement, mobility, and no hard effort.`;
  } else if (state === "reduced_load") {
    badge = "Reduced-load";
    if (adjustedWorkout?.run) {
      adjustedWorkout.run.t = baseDemand === "high" ? "Easy Aerobic" : (adjustedWorkout.run.t || "Controlled Aerobic");
      adjustedWorkout.run.d = baseDemand === "high" ? "20-30 min easy aerobic" : scaleSessionDescriptor(adjustedWorkout.run.d || "", "20-30 min controlled");
    }
    adjustedWorkout.label = appendWorkoutQualifier(baseWorkout?.label, "Reduced-load");
    adjustedWorkout.minDay = true;
    adjustedWorkout.nutri = adjustedWorkout?.run ? "easyRun" : (baseWorkout?.nutri || "strength");
    adjustedWorkout.success = "Keep intensity capped, finish the first useful block, and stop there.";
    adjustedWorkout.recoveryRecommendation = "Finish with 5-8 min mobility and keep the rest of the day easy.";
    adjustedWorkout.intensityGuidance = "controlled";
    adjustedWorkout.optionalSecondary = "5-8 min mobility or tissue work";
    if (adjustedWorkout?.strSess) adjustedWorkout.strengthDuration = "15-25 min";
    appendEnvironmentNote("Reduced-load today: cap intensity, shorten the session, and use mobility as the finish.");
    coachLine = "Reduced-load today: keep the session, lower the strain, and finish before fatigue starts to drift.";
    recoveryLine = "Recovery recommendation: cap intensity, finish with mobility, and skip extra volume.";
    userVisibleLine = "Your recovery and recent training pattern trimmed today's load.";
    adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness state is reduced-load based on ${reasonText || "recent strain and consistency signals"}. Keep the stimulus, but lower the intensity and total load.`;
  } else if (state === "progression") {
    badge = "Progression-ready";
    if (adjustedWorkout?.run && /easy/i.test(String(adjustedWorkout?.run?.t || ""))) adjustedWorkout.run.t = "Easy + strides";
    adjustedWorkout.label = appendWorkoutQualifier(baseWorkout?.label, "Progression-ready");
    adjustedWorkout.success = "Keep the planned session and add only one controlled progression if it stays smooth.";
    adjustedWorkout.recoveryRecommendation = "Keep your normal fueling and recovery; no extra hero volume after the session.";
    adjustedWorkout.intensityGuidance = "steady with one small progression";
    adjustedWorkout.extendedFinisher = adjustedWorkout?.extendedFinisher || (adjustedWorkout?.run ? "Optional: 4 Ãƒâ€” 20s strides if the session stays smooth." : "Optional: add one final quality set if form stays crisp.");
    appendEnvironmentNote("Progression-ready today: one small progression is available if execution stays controlled.");
    coachLine = "Progression is available today: keep the plan intact and add only one small progression if it stays smooth.";
    recoveryLine = "Recovery recommendation: normal fueling, normal mobility, and no extra bonus work after the progression.";
    userVisibleLine = "Your recovery and recent consistency allow a small progression today.";
    adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness state is progression-ready based on ${reasonText || "supportive recovery and stable recent training"}. Keep the plan intact and progress only if the first half feels controlled.`;
  } else {
    adjustedWorkout.recoveryRecommendation = "Normal recovery: finish the session, refuel, and do your usual mobility.";
    adjustedWorkout.intensityGuidance = "planned";
    appendEnvironmentNote("Readiness is steady today: run the planned session with clean control.");
    coachLine = "Readiness is steady today: execute the planned session cleanly and keep the effort controlled.";
    recoveryLine = "Recovery recommendation: follow your normal fueling and mobility routine after the session.";
    userVisibleLine = "Your recent recovery and training load support the planned session.";
    adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness looks steady based on ${reasonText || "recent completion, recovery, and training load"}. Run the planned session as written and keep recovery normal.`;
  }

  adjustedWorkout.readinessState = state;
  adjustedWorkout.readinessInputs = {
    completedCount,
    skippedCount,
    modifiedCount,
    consistencyRatio,
    hardSessions72h,
    hardSessions7d,
    sleep,
    stress,
    soreness,
    feel,
  };

  return {
    state,
    source: promptSignal?.label || (hasReadinessInputs(checkin) ? "check-in" : "readiness engine"),
    badge,
    coachLine,
    recoveryLine,
    userVisibleLine,
    inputDriven,
    factors: state === "progression" ? progressReasons : protectReasons,
    adjustedWorkout,
  };
};

const deriveDeterministicReadinessState = ({ todayKey = new Date().toISOString().split("T")[0], checkin = {}, promptSignal = null, workout = null, logs = {}, dailyCheckins = {}, personalization = {}, momentum = {}, userProfile = {} }) => {
  const promptState = String(promptSignal?.state || "").toLowerCase();
  const promptLabel = String(promptSignal?.label || "").trim();
  const baseWorkout = { ...(workout || {}), run: workout?.run ? { ...workout.run } : workout?.run };
  if (!Object.keys(baseWorkout).length) return null;

  const demandLoad = (demand = "") => demand === "high" ? 2 : demand === "moderate" ? 1 : 0;
  const isNegativeRecovery = (candidate = {}) => {
    const sleep = toReadinessNumber(candidate?.readiness?.sleep);
    const stress = toReadinessNumber(candidate?.readiness?.stress);
    const soreness = toReadinessNumber(candidate?.readiness?.soreness);
    const feel = String(candidate?.sessionFeel || "").toLowerCase();
    return feel === "harder_than_expected" || (sleep > 0 && sleep <= 2) || stress >= 4 || soreness >= 4;
  };
  const isPositiveRecovery = (candidate = {}) => {
    const sleep = toReadinessNumber(candidate?.readiness?.sleep);
    const stress = toReadinessNumber(candidate?.readiness?.stress);
    const soreness = toReadinessNumber(candidate?.readiness?.soreness);
    const feel = String(candidate?.sessionFeel || "").toLowerCase();
    return feel === "easier_than_expected" || (sleep >= 4 && stress > 0 && stress <= 2 && soreness > 0 && soreness <= 2);
  };

  const todayTs = new Date(`${todayKey}T12:00:00`).getTime();
  const targetDays = Math.max(2, Number(userProfile?.daysPerWeek || userProfile?.days_per_week || 3) || 3);
  const allDates = Array.from(new Set([...(Object.keys(logs || {})), ...(Object.keys(dailyCheckins || {}))]))
    .filter(Boolean)
    .sort((a, b) => b.localeCompare(a));
  const recentRows = allDates
    .map((dateKey) => {
      const t = new Date(`${dateKey}T12:00:00`).getTime();
      const daysBack = Math.max(0, Math.round(((todayTs - t) / 86400000) * 10) / 10);
      const log = logs?.[dateKey] || {};
      const mergedCheckin = { ...(log?.checkin || {}), ...(dailyCheckins?.[dateKey] || {}) };
      return {
        date: dateKey,
        daysBack,
        log,
        checkin: mergedCheckin,
        status: resolveEffectiveStatus(mergedCheckin, dateKey),
        demand: classifySessionDemand({ type: log?.type, label: log?.label, run: log?.run || { t: log?.type } }),
      };
    })
    .filter((row) => row.daysBack > 0 && row.daysBack <= 10);
  const recent7 = recentRows.filter((row) => row.daysBack <= 7);
  const recentCountableRows = recent7.filter((row) => row.status !== "not_logged" && row.status !== "not_logged_grace");
  const completedRows = recentCountableRows.filter((row) => READINESS_SUCCESS_STATUSES.has(row.status));
  const skippedRows = recent7.filter((row) => row.status === "skipped" || row.status === "not_logged_expired");
  const modifiedRows = recent7.filter((row) => row.status === "completed_modified" || row.status === "partial_completed");
  const highDemand72h = recentRows.filter((row) => row.daysBack <= 3 && row.demand === "high" && READINESS_SUCCESS_STATUSES.has(row.status));
  const highDemand7d = recent7.filter((row) => row.demand === "high" && READINESS_SUCCESS_STATUSES.has(row.status));
  const trainingLoad72h = recentRows
    .filter((row) => row.daysBack <= 3 && READINESS_SUCCESS_STATUSES.has(row.status))
    .reduce((sum, row) => sum + demandLoad(row.demand), 0);
  const trainingLoad7d = recent7
    .filter((row) => READINESS_SUCCESS_STATUSES.has(row.status))
    .reduce((sum, row) => sum + demandLoad(row.demand), 0);
  const recentSupportiveRows = recentRows.slice(0, 3).filter((row) => isPositiveRecovery(row.checkin));
  const recentStrainedRows = recentRows.slice(0, 3).filter((row) => isNegativeRecovery(row.checkin));
  const latestRecoveryRow = recentRows.find((row) => hasReadinessInputs(row.checkin)) || null;
  const hasTodayRecoveryInput = hasReadinessInputs(checkin);
  const activeCheckin = hasTodayRecoveryInput ? checkin : (latestRecoveryRow?.checkin || {});
  const sleep = toReadinessNumber(activeCheckin?.readiness?.sleep);
  const stress = toReadinessNumber(activeCheckin?.readiness?.stress);
  const soreness = toReadinessNumber(activeCheckin?.readiness?.soreness);
  const feel = String(activeCheckin?.sessionFeel || "").toLowerCase();
  const inputDriven = hasTodayRecoveryInput || Boolean(promptState);
  const completionRatio = completedRows.length / Math.max(1, targetDays);
  const adherenceRatio = recentCountableRows.length ? (completedRows.length / recentCountableRows.length) : 0;
  const consistencyRatio = Math.min(1.25, completionRatio);
  const lowScheduleConsistency = completionRatio < 0.6 || adherenceRatio < 0.6 || skippedRows.length >= 2;
  const veryLowScheduleConsistency = completionRatio < 0.4 || adherenceRatio < 0.5 || skippedRows.length >= 3;
  const severeNegativeCheckin = (sleep > 0 && sleep <= 1) || stress >= 5 || soreness >= 5;
  const strongNegativeCheckin = promptState === "recover" || feel === "harder_than_expected" || (sleep > 0 && sleep <= 2) || stress >= 4 || soreness >= 4;
  const strongPositiveCheckin = promptState === "push" || feel === "easier_than_expected" || (sleep >= 4 && stress > 0 && stress <= 2 && soreness > 0 && soreness <= 2 && feel !== "harder_than_expected");
  const injuryNeedsProtection = String(personalization?.injuryPainState?.level || "none") !== "none";
  const explicitDeviceBias = String(baseWorkout?.readinessBias || "").toLowerCase();
  const planBias = explicitDeviceBias
    || (baseWorkout?.type === "rest" && /recovery mode/i.test(String(baseWorkout?.label || "")) ? "recover" : "")
    || (baseWorkout?.minDay ? "reduce" : "");

  let protectScore = 0;
  let progressScore = 0;
  const protectReasons = [];
  const progressReasons = [];

  if (planBias === "recover") {
    protectScore += 4;
    protectReasons.push(explicitDeviceBias === "recover" ? "device readiness is already low" : "the current plan is already in recovery mode");
  } else if (planBias === "reduce") {
    protectScore += 2;
    protectReasons.push(explicitDeviceBias === "reduce" ? "device readiness is already cautious" : "the current plan is already reduced");
  }
  if (injuryNeedsProtection) {
    protectScore += 2;
    protectReasons.push("injury status still needs protection");
  }
  if (promptState === "recover") {
    protectScore += 3;
    protectReasons.push("you flagged low readiness");
  }
  if (severeNegativeCheckin) {
    protectScore += 4;
    protectReasons.push("the latest recovery check-in is clearly strained");
  } else if (strongNegativeCheckin) {
    protectScore += 3;
    protectReasons.push("the latest recovery check-in is strained");
  } else if (recentStrainedRows.length >= 2) {
    protectScore += 2;
    protectReasons.push("recent recovery signals have been trending heavy");
  }
  if (trainingLoad72h >= 3 || highDemand72h.length >= 2) {
    protectScore += 2;
    protectReasons.push("recent intensity stacked up");
  } else if (highDemand72h.length === 1 && (strongNegativeCheckin || recentStrainedRows.length >= 1)) {
    protectScore += 1;
    protectReasons.push("a recent hard session still needs to be absorbed");
  }
  if (veryLowScheduleConsistency) {
    protectScore += 2;
    protectReasons.push("schedule consistency has broken down recently");
  } else if (lowScheduleConsistency) {
    protectScore += 1;
    protectReasons.push("recent schedule consistency is uneven");
  }
  if (modifiedRows.length >= 2) {
    protectScore += 1;
    protectReasons.push("recent sessions have needed modification");
  }
  if ((momentum?.logGapDays || 0) >= 4) {
    protectScore += 1;
    protectReasons.push("recent logging gaps suggest rhythm is off");
  }

  if (promptState === "push") {
    progressScore += 2;
    progressReasons.push("you flagged high readiness");
  }
  if (strongPositiveCheckin) {
    progressScore += 3;
    progressReasons.push("the latest recovery check-in is supportive");
  } else if (recentSupportiveRows.length >= 2) {
    progressScore += 1;
    progressReasons.push("recent recovery inputs have stayed steady");
  }
  if (adherenceRatio >= 0.8 && skippedRows.length === 0) {
    progressScore += 2;
    progressReasons.push("recent workout completion has been reliable");
  } else if (completionRatio >= 0.85 && skippedRows.length <= 1) {
    progressScore += 1;
    progressReasons.push("recent schedule consistency has been solid");
  }
  if (trainingLoad72h <= 2 && highDemand7d.length <= 2) {
    progressScore += 1;
    progressReasons.push("recent intensity is under control");
  }
  if (momentum?.momentumState === "building momentum" || (momentum?.score || 0) >= 70) {
    progressScore += 1;
    progressReasons.push("training momentum is building");
  }

  let state = "steady";
  if (planBias === "recover" || protectScore >= 7 || (strongNegativeCheckin && (trainingLoad72h >= 2 || recentStrainedRows.length >= 2 || injuryNeedsProtection))) {
    state = "recovery";
  } else if (protectScore >= 4 || strongNegativeCheckin || veryLowScheduleConsistency) {
    state = "reduced_load";
  } else if (progressScore >= 5 && protectScore <= 1 && highDemand72h.length === 0 && adherenceRatio >= 0.75) {
    state = "progression";
  }

  const adjustedWorkout = { ...baseWorkout, run: baseWorkout?.run ? { ...baseWorkout.run } : baseWorkout?.run };
  const baseDemand = classifySessionDemand(baseWorkout);
  const factors = state === "progression"
    ? progressReasons
    : state === "steady"
    ? (protectReasons.length ? protectReasons : progressReasons)
    : protectReasons;
  const reasonText = joinHumanList(factors.slice(0, 3));
  const baseExplanation = String(baseWorkout?.explanation || "").trim();
  const appendEnvironmentNote = (note = "") => {
    adjustedWorkout.environmentNote = [baseWorkout?.environmentNote, note].filter(Boolean).join(" ").trim();
  };

  let badge = "Steady";
  let coachLine = "";
  let recoveryLine = "";
  let userVisibleLine = "";

  if (state === "recovery") {
    badge = "Recovery focus";
    if (adjustedWorkout?.run) {
      adjustedWorkout.run.t = "Recovery Aerobic";
      adjustedWorkout.run.d = baseDemand === "high" ? "20-30 min easy aerobic" : "15-25 min walk or easy spin";
    }
    adjustedWorkout.type = adjustedWorkout?.run ? "recovery" : "rest";
    adjustedWorkout.label = appendWorkoutQualifier(baseWorkout?.label, "Recovery focus");
    adjustedWorkout.minDay = true;
    adjustedWorkout.nutri = "rest";
    adjustedWorkout.success = "Keep effort easy, do the mobility work, and finish fresher than you started.";
    adjustedWorkout.recoveryRecommendation = "Walk or easy spin + 8-10 min mobility.";
    adjustedWorkout.intensityGuidance = "recovery only";
    adjustedWorkout.optionalSecondary = "8-10 min mobility reset";
    if (adjustedWorkout?.strSess) adjustedWorkout.strengthDuration = "12-15 min mobility + activation";
    appendEnvironmentNote("Recovery focus today: walking, easy aerobic work, and mobility only.");
    coachLine = "Recovery focus today: remove intensity, keep movement easy, and protect the next 48 hours.";
    recoveryLine = "Recovery recommendation: walk or easy spin, then 8-10 minutes of mobility.";
    userVisibleLine = "Recent completion, recovery input, and intensity stacking all point to recovery work today.";
    adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness state is recovery focus based on ${reasonText || "strained recovery and recent load"}. Today's call is easy movement, mobility, and no hard effort.`;
  } else if (state === "reduced_load") {
    badge = "Reduced-load";
    if (adjustedWorkout?.run) {
      adjustedWorkout.run.t = baseDemand === "high" ? "Easy Aerobic" : (adjustedWorkout.run.t || "Controlled Aerobic");
      adjustedWorkout.run.d = baseDemand === "high" ? "20-30 min easy aerobic" : scaleSessionDescriptor(adjustedWorkout.run.d || "", "20-30 min controlled");
      if (["hard-run", "long-run"].includes(baseWorkout?.type || "")) adjustedWorkout.type = "easy-run";
    }
    adjustedWorkout.label = appendWorkoutQualifier(baseWorkout?.label, "Reduced-load");
    adjustedWorkout.minDay = true;
    adjustedWorkout.nutri = adjustedWorkout?.run ? "easyRun" : (baseWorkout?.nutri || "strength");
    adjustedWorkout.success = "Keep intensity capped, finish the first useful block, and stop there.";
    adjustedWorkout.recoveryRecommendation = "Finish with 5-8 min mobility and keep the rest of the day easy.";
    adjustedWorkout.intensityGuidance = "controlled";
    adjustedWorkout.optionalSecondary = "5-8 min mobility or tissue work";
    if (adjustedWorkout?.strSess) adjustedWorkout.strengthDuration = "15-25 min";
    appendEnvironmentNote("Reduced-load today: cap intensity, shorten the session, and use mobility as the finish.");
    coachLine = "Reduced-load today: keep the session, lower the strain, and finish before fatigue starts to drift.";
    recoveryLine = "Recovery recommendation: cap intensity, finish with mobility, and skip extra volume.";
    userVisibleLine = "Your recovery signals or recent consistency trimmed today's load.";
    adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness state is reduced-load based on ${reasonText || "recent strain and consistency signals"}. Keep the stimulus, but lower the intensity and total load.`;
  } else if (state === "progression") {
    badge = "Progression-ready";
    if (adjustedWorkout?.run && /easy/i.test(String(adjustedWorkout?.run?.t || ""))) adjustedWorkout.run.t = "Easy + strides";
    adjustedWorkout.label = appendWorkoutQualifier(baseWorkout?.label, "Progression-ready");
    adjustedWorkout.success = "Keep the planned session and add only one controlled progression if it stays smooth.";
    adjustedWorkout.recoveryRecommendation = "Keep your normal fueling and recovery; no extra hero volume after the session.";
    adjustedWorkout.intensityGuidance = "planned plus one small progression";
    adjustedWorkout.extendedFinisher = adjustedWorkout?.extendedFinisher || (adjustedWorkout?.run ? "Optional: 4 x 20s strides if the session stays smooth." : "Optional: add one final quality set if form stays crisp.");
    appendEnvironmentNote("Progression-ready today: one small progression is available if execution stays controlled.");
    coachLine = "Progression is available today: keep the plan intact and add only one small progression if it stays smooth.";
    recoveryLine = "Recovery recommendation: normal fueling, normal mobility, and no extra bonus work after the progression.";
    userVisibleLine = "Supportive recovery and reliable recent completion allow a small progression today.";
    adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness state is progression-ready based on ${reasonText || "supportive recovery and stable recent training"}. Keep the plan intact and progress only if the first half feels controlled.`;
  } else {
    adjustedWorkout.recoveryRecommendation = "Normal recovery: finish the session, refuel, and do your usual mobility.";
    adjustedWorkout.intensityGuidance = "planned";
    appendEnvironmentNote("Readiness is steady today: run the planned session with clean control.");
    coachLine = "Readiness is steady today: execute the planned session cleanly and keep the effort controlled.";
    recoveryLine = "Recovery recommendation: follow your normal fueling and mobility routine after the session.";
    userVisibleLine = "Recent completion, recovery, and load support the planned session.";
    adjustedWorkout.explanation = `${baseExplanation ? `${baseExplanation} ` : ""}Readiness looks steady based on ${reasonText || "recent completion, recovery, and training load"}. Run the planned session as written and keep recovery normal.`;
  }

  adjustedWorkout.readinessState = state;
  adjustedWorkout.readinessStateLabel = badge;
  adjustedWorkout.readinessInputs = {
    completedCount: completedRows.length,
    countableCount: recentCountableRows.length,
    skippedCount: skippedRows.length,
    modifiedCount: modifiedRows.length,
    consistencyRatio: Number(consistencyRatio.toFixed(2)),
    adherenceRatio: Number(adherenceRatio.toFixed(2)),
    hardSessions72h: highDemand72h.length,
    hardSessions7d: highDemand7d.length,
    trainingLoad72h,
    trainingLoad7d,
    recentSupportiveCount: recentSupportiveRows.length,
    recentStrainedCount: recentStrainedRows.length,
    sleep,
    stress,
    soreness,
    feel,
    targetDays,
    latestRecoveryDate: latestRecoveryRow?.date || "",
    hasTodayRecoveryInput,
    hasRecoveryHistory: Boolean(latestRecoveryRow),
    promptState,
  };

  return {
    state,
    stateLabel: badge,
    source: promptLabel || (hasTodayRecoveryInput ? "today's check-in" : latestRecoveryRow?.date ? `recovery inputs from ${latestRecoveryRow.date}` : planBias ? "device recovery signals" : "recent training pattern"),
    badge,
    coachLine,
    recoveryLine,
    userVisibleLine,
    inputDriven,
    factors,
    metrics: adjustedWorkout.readinessInputs,
    adjustedWorkout,
  };
};

const getTodayWorkout = (weekNum, dayNum) => {
  const week = WEEKS[(weekNum - 1) % WEEKS.length];
  if (!week) return null;
  const zones = PHASE_ZONES[week.phase];
  const dayMap = {
    1: { type: "run+strength", run: week.mon, strSess: week.str, label: "Easy Run + Strength A" },
    2: { type: "otf", label: "Orange Theory Ã¢â‚¬â€ Hybrid Day" },
    3: { type: "strength+prehab", strSess: week.str === "A" ? "B" : "A", label: "Strength B + Achilles Prehab" },
    4: { type: "hard-run", run: week.thu, label: `${week.thu?.t} Run` },
    5: { type: "easy-run", run: week.fri, label: "Easy Run" },
    6: { type: "long-run", run: week.sat, label: "Long Run" },
    0: { type: "rest", label: "Rest Day", isRecoverySlot: true },
  };
  return { ...dayMap[dayNum], week, zones };
};

const dayColors = { "run+strength":"#3c91e6", otf:"#c97a2b", "strength+prehab":"#6e63d9", "hard-run":"#d85d78", "easy-run":"#2da772", "long-run":"#c94f6d", rest:"#536479" };
const C = { green:"#2da772", blue:"#3c91e6", amber:"#c97a2b", red:"#d85d78", purple:"#6e63d9", lime:"#b5d43a", slate:"#5f6f85" };
const WORKOUT_TYPE_ICON = { "run+strength":"run_strength", otf:"otf", "strength+prehab":"strength_prehab", "hard-run":"hard_run", "easy-run":"easy_run", "long-run":"long_run", rest:"rest" };
const RUN_TYPE_ICON = { Easy:"easy_run", Tempo:"tempo_run", Intervals:"interval_run", Long:"long_run", Recovery:"rest" };
const NUTRITION_ICON = { Protein:"protein", Carbs:"carbs", Calories:"calories", Breakfast:"breakfast", Lunch:"lunch", Dinner:"dinner", "Optional snack":"snack", "Travel backup":"travel", "Grocery reset":"grocery" };
function InlineGlyph({ name = "easy_run", color = "#cbd5e1", size = 14 }) {
  const stroke = { fill: "none", stroke: color, strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round" };
  let body = <circle cx="12" cy="12" r="6" {...stroke} />;

  switch (name) {
    case "tempo_run":
      body = (
        <>
          <path d="M5 16 L10 11 L13 14 L19 8" {...stroke} />
          <path d="M16 8 H19 V11" {...stroke} />
        </>
      );
      break;
    case "interval_run":
      body = (
        <>
          <path d="M6 18 V14" {...stroke} />
          <path d="M12 18 V10" {...stroke} />
          <path d="M18 18 V6" {...stroke} />
        </>
      );
      break;
    case "long_run":
      body = (
        <>
          <path d="M5 14 C8 9, 12 9, 16 14" {...stroke} />
          <path d="M16 14 L19 11" {...stroke} />
          <path d="M16 14 L19 17" {...stroke} />
        </>
      );
      break;
    case "hard_run":
      body = <path d="M12 4 L7 13 H11 L9 20 L17 10 H13 L15 4 Z" {...stroke} />;
      break;
    case "run_strength":
      body = (
        <>
          <path d="M4 12 H8" {...stroke} />
          <path d="M16 12 H20" {...stroke} />
          <path d="M8 10 V14" {...stroke} />
          <path d="M16 10 V14" {...stroke} />
          <path d="M8 12 H16" {...stroke} />
          <path d="M6 18 C9 15, 12 15, 16 16" {...stroke} />
        </>
      );
      break;
    case "strength_prehab":
      body = (
        <>
          <path d="M6 10 H9" {...stroke} />
          <path d="M15 10 H18" {...stroke} />
          <path d="M9 8 V12" {...stroke} />
          <path d="M15 8 V12" {...stroke} />
          <path d="M9 10 H15" {...stroke} />
          <path d="M12 13 V18" {...stroke} />
          <path d="M9.5 18 H14.5" {...stroke} />
        </>
      );
      break;
    case "otf":
      body = (
        <>
          <circle cx="12" cy="12" r="3.2" {...stroke} />
          <path d="M12 4 V6.5" {...stroke} />
          <path d="M12 17.5 V20" {...stroke} />
          <path d="M4 12 H6.5" {...stroke} />
          <path d="M17.5 12 H20" {...stroke} />
          <path d="M6.3 6.3 L8 8" {...stroke} />
          <path d="M16 16 L17.7 17.7" {...stroke} />
        </>
      );
      break;
    case "rest":
      body = <path d="M14.5 5.5 A6.5 6.5 0 1 0 18 17 A5.2 5.2 0 1 1 14.5 5.5 Z" fill={color} stroke="none" />;
      break;
    case "easy_run":
    default:
      body = (
        <>
          <path d="M5 15 C8 11, 12 11, 16 15" {...stroke} />
          <path d="M16 15 L19 12" {...stroke} />
        </>
      );
      break;
  }

  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} style={{ display:"inline-block", flex:"0 0 auto" }}>
      {body}
    </svg>
  );
}
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
const SESSION_NAMING = {
  EASY_RUN: "Easy Run",
  RECOVERY_MOBILITY: "Active Recovery",
  LOW_IMPACT: "Low-Impact Cardio",
  HYBRID_PREFIX: "Easy Run + Strength",
  WALK_MOBILITY: "Walk + Mobility",
  ACHILLES_BADGE: "Modified for Achilles",
};
const isRunTarget = (value = "") => /(\d+(\.\d+)?\s*mi|\d+\s*(min|minutes?))/i.test(String(value || ""));
const formatRunTarget = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const miles = raw.match(/(\d+(\.\d+)?)\s*mi/i);
  if (miles) return `${miles[1]} mi`;
  const mins = raw.match(/(\d+)\s*(min|minutes?)/i);
  if (mins) return `${mins[1]} min`;
  return raw;
};
const formatRunTargetFromLogEntry = (entry = {}) => {
  const miles = Number(entry?.miles || 0);
  if (Number.isFinite(miles) && miles > 0) return `${miles} mi`;
  const runTime = String(entry?.runTime || "").trim();
  if (!runTime) return "";
  const mins = runTime.match(/(\d+)\s*(min|minutes?)/i);
  if (mins) return `${mins[1]} min`;
  const numeric = Number(runTime);
  if (Number.isFinite(numeric) && numeric > 0) return `${numeric} min`;
  return runTime;
};
const applySessionNamingRules = (session = {}, injuryState = {}) => {
  const next = { ...(session || {}) };
  const type = String(next?.type || "").toLowerCase();
  const runDescriptor = next?.run?.d || "";
  const runType = String(next?.run?.t || "").toLowerCase();
  const hasRunningPrescription = !!next?.run && (type.includes("run") || isRunTarget(runDescriptor) || /(easy|tempo|interval|long)/i.test(runType));
  const walkModified = injuryState?.area === "Achilles" && injuryState?.level !== "none" && /(walk)/i.test(`${runType} ${runDescriptor} ${next?.environmentNote || ""}`);
  if (walkModified) {
    next.label = SESSION_NAMING.WALK_MOBILITY;
    next.modifierBadge = SESSION_NAMING.ACHILLES_BADGE;
    return next;
  }
  if (hasRunningPrescription) {
    const runTarget = formatRunTarget(runDescriptor);
    if (type === "run+strength") {
      next.label = `${SESSION_NAMING.HYBRID_PREFIX} ${next?.strSess || "A"}`;
      return next;
    }
    if (type === "long-run") {
      next.label = runTarget ? `Long Run Ã‚Â· ${runTarget}` : "Long Run";
      return next;
    }
    if (type === "hard-run" && !/easy/i.test(runType)) {
      next.label = runTarget ? `${next?.run?.t || "Quality"} Run Ã‚Â· ${runTarget}` : `${next?.run?.t || "Quality"} Run`;
      return next;
    }
    next.label = runTarget ? `${SESSION_NAMING.EASY_RUN} Ã‚Â· ${runTarget}` : SESSION_NAMING.EASY_RUN;
    return next;
  }
  const lowImpactOnly = /(bike|elliptical|pool|incline walk|low-impact)/i.test(`${next?.label || ""} ${next?.environmentNote || ""}`);
  next.label = lowImpactOnly ? SESSION_NAMING.LOW_IMPACT : SESSION_NAMING.RECOVERY_MOBILITY;
  return next;
};
const relabelRecentLogs = (logs = {}) => {
  const now = Date.now();
  let changed = 0;
  const nextLogs = { ...(logs || {}) };
  Object.entries(nextLogs).forEach(([dateKey, entry]) => {
    const ageDays = (now - new Date(`${dateKey}T12:00:00`).getTime()) / 86400000;
    if (ageDays > 30 || !entry) return;
    const typeText = String(entry.type || "");
    const notesText = String(entry.notes || "");
    const runTarget = formatRunTargetFromLogEntry(entry);
    const containsRunSignal = !!runTarget || /(easy run|tempo run|interval|long run|\brun\b)/i.test(`${typeText} ${notesText}`);
    const containsRecoveryLabel = /(recovery|low-impact)/i.test(typeText);
    if (containsRunSignal && containsRecoveryLabel) {
      const nextType = runTarget ? `${SESSION_NAMING.EASY_RUN} Ã‚Â· ${runTarget}` : SESSION_NAMING.EASY_RUN;
      if (nextType !== typeText) {
        nextLogs[dateKey] = { ...entry, type: nextType };
        changed += 1;
      }
    }
  });
  return { nextLogs, changed };
};
const DAY_CONTEXT_OVERRIDES = {
  busy_day: {
    label: "Busy Day Override",
    type: "rest",
    nutri: "easyRun",
    fallback: "10Ã¢â‚¬â€œ15 min brisk walk + mobility",
    success: "Today = just show up for 10Ã¢â‚¬â€œ20 minutes and hit protein target.",
  },
  low_energy_day: {
    label: "Low Energy Override",
    type: "easy-run",
    nutri: "rest",
    fallback: "15Ã¢â‚¬â€œ20 min zone-2 easy movement",
    success: "Today = 20 minutes + recovery nutrition + early sleep.",
  },
  travel_day: {
    label: "Travel Day Override",
    type: "rest",
    nutri: "travelRun",
    fallback: "Hotel circuit 12 min (push-up, squat, plank)",
    success: "Today = keep momentum alive with short version.",
  },
  social_event_day: {
    label: "Social/Event Day Override",
    type: "rest",
    nutri: "rest",
    fallback: "10 min walk before event + hydration",
    success: "Today = donÃ¢â‚¬â„¢t break the streak: minimum session + simple meal anchor.",
  },
  minimum_viable_day: {
    label: "Short Version Day",
    type: "rest",
    nutri: "easyRun",
    fallback: "10Ã¢â‚¬â€œ20 min fallback: 5 min mobility + 10 min easy cardio + 2 sets push/pull/core",
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

const PRIMARY_GOAL_OPTIONS = ["fat_loss", "muscle_gain", "endurance", "general_fitness"];
const PRIMARY_GOAL_LABELS = { fat_loss: "Fat Loss", muscle_gain: "Muscle Gain", endurance: "Endurance", general_fitness: "General Fitness" };
const EXPERIENCE_LEVEL_OPTIONS = ["beginner", "intermediate", "advanced"];
const EXPERIENCE_LEVEL_LABELS = { beginner: "Beginner", intermediate: "Intermediate", advanced: "Advanced" };
const SESSION_LENGTH_OPTIONS = ["20", "30", "45", "60+"];
const SESSION_LENGTH_LABELS = { "20": "20 min", "30": "30 min", "45": "45 min", "60+": "60+ min" };

const DEFAULT_USER_GOAL_PROFILE = {
  primary_goal: "",
  experience_level: "",
  days_per_week: 3,
  session_length: "30",
  equipment_access: [],
  constraints: [],
};

const DEFAULT_PERSONALIZATION = {
  // Deprecated runtime input. Canonical athlete state is derived in canonical-athlete-service.js.
  userGoalProfile: { ...DEFAULT_USER_GOAL_PROFILE },
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
  // Deprecated runtime input. Persisted for backward compatibility until canonical goal-state persistence exists.
  goalState: {
    primaryGoal: "",
    priority: "undecided",
    confidence: 0,
    planStartDate: "",
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
    locationPermissionGranted: false,
    locationStatus: "unknown",
    locationLabel: "",
    lastKnownLat: null,
    lastKnownLng: null,
    lastUpdatedAt: 0,
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
  },
  strengthProgression: {
    prescriptions: {},
    pendingByDate: {},
    notifications: {},
    explanations: {},
    tracking: {},
  },
  connectedDevices: {
    appleHealth: {
      status: "not_connected",
      permissionRequestedAt: 0,
      permissionsGranted: [],
      skipped: false,
      workouts: {},
      samples: { restingHr: null, vo2max: null, sleepHours: null, activeEnergy: null },
      lastConnectionCheck: null,
      lastSyncStatus: "unknown",
    },
    garmin: {
      status: "not_connected",
      deviceName: "",
      oauthTokenRef: "",
      permissionsGranted: [],
      connectedAt: 0,
      activities: [],
      dailySummaries: {},
      trainingReadinessScore: null,
      lastSyncAt: 0,
      lastApiErrorAt: 0,
      lastApiStatus: "ok",
      lastErrorMessage: "",
      lastErrorFix: "",
    },
  },
  fitnessSignals: {
    fitnessLevel: "unknown",
    paceOffsetSec: 0,
    runSignals: [],
    updatedAt: 0,
  },
  settings: {
    units: { weight: "lbs", distance: "miles", height: "ft_in" },
    trainingPreferences: {
      defaultEnvironment: "Home",
      weeklyCheckinDay: "Sun",
      intensityPreference: "Standard",
    },
    appearance: {
      theme: "System",
      palette: "Green",
    },
    notifications: {
      allOff: false,
      weeklyReminderOn: true,
      weeklyReminderTime: "18:00",
      proactiveNudgeOn: true,
    },
  },
  planArchives: [],
  planResetUndo: null,
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
  userGoalProfile: { ...(base.userGoalProfile || DEFAULT_PERSONALIZATION.userGoalProfile), ...(patch?.userGoalProfile || {}) },
  goalState: { ...(base.goalState || DEFAULT_PERSONALIZATION.goalState), ...(patch?.goalState || {}) },
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
      workout: { ...base, label: `${base.label || "Session"}`, injuryAdjusted: true },
      mods: ["Reduce intensity by ~10%", "Add 10-15 min warm-up", "Preserve easy aerobic work only"],
      why: `${area} mild tightness is active, so we keep movement but reduce risk.`,
      caution: "Training adjustment logic only Ã¢â‚¬â€ not medical advice."
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
    next.label = next.todayPlan?.label || "Active Recovery Ã¢â‚¬â€ Walk + Mobility";
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
  { id: "g_primary", name: "Primary goal (set in onboarding)", type: "time_bound", category: "running", priority: 1, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "deadline" } },
  { id: "g_secondary_1", name: "Secondary goal 1", type: "ongoing", category: "body_comp", priority: 2, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "weekly_checkin", unit: "lb" } },
  { id: "g_secondary_2", name: "Secondary goal 2", type: "ongoing", category: "strength", priority: 3, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "logged_lifts", unit: "lb" } },
  { id: "g_resilience", name: "Resilience & injury prevention", type: "ongoing", category: "injury_prevention", priority: 4, targetDate: "", measurableTarget: "", active: true, tracking: { mode: "progress_tracker" } },
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
    pushes.push("1Ã¢â‚¬â€œ2 meaningful strength sessions");
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
    sessionsPerWeek: strengthSessionsTarget === 2 ? "1Ã¢â‚¬â€œ2" : "1",
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

const buildProactiveTriggers = ({ momentum, personalization, goals, learning, nutritionActualLogs, longTermMemory }) => {
  const triggers = [];
  const actualNutritionLogs = Object.values(nutritionActualLogs || {});
  const dropFast = (longTermMemory || []).some(m => m.key === "drops_after_3_4_days" && m.confidence === "high");
  if (momentum.momentumState === "drifting") triggers.push({ id:"drift", msg:"Drift detected Ã¢â‚¬â€ want a simplified version of this week?", actionLabel:"Simplify week", actionType:"REDUCE_WEEKLY_VOLUME", payload:{ pct: 12 }, priority:85 });
  if (momentum.momentumState === "falling off") triggers.push({ id:"reset", msg:"Momentum has dipped Ã¢â‚¬â€ want a compressed reset week to make execution easier?", actionLabel:"Activate reset", actionType:"ACTIVATE_SALVAGE", payload:{}, priority:95 });
  if (momentum.score >= 80) triggers.push({ id:"progress", msg:"Consistency streak is strong Ã¢â‚¬â€ progress slightly this week?", actionLabel:"Progress slightly", actionType:"PROGRESS_STRENGTH_EMPHASIS", payload:{ weeks: 1 }, priority:70 });
  if (personalization.travelState.isTravelWeek) triggers.push({ id:"env", msg:"Environment changed Ã¢â‚¬â€ switch to travel/home assumptions?", actionLabel:"Switch travel mode", actionType:"SWITCH_TRAVEL_MODE", payload:{ mode:"travel" }, priority:72 });
  if (goals?.find(g=>g.category==="body_comp" && g.active) && momentum.logGapDays >= 3) triggers.push({ id:"nutrition", msg:"Nutrition drift risk is rising Ã¢â‚¬â€ simplify meals for a few days?", actionLabel:"Simplify meals", actionType:"SIMPLIFY_MEALS_THIS_WEEK", payload:{ days: 3 }, priority:78 });
  if (momentum.logGapDays >= (dropFast ? 2 : 3)) triggers.push({ id:"nolog", msg:"No logs recently Ã¢â‚¬â€ apply low-friction reset plan?", actionLabel:"Low-friction reset", actionType:"ACTIVATE_SALVAGE", payload:{}, priority:88 });
  if (learning?.stats?.timeBlockers >= 2) triggers.push({ id:"time_friction", msg:"Time blockers keep repeating Ã¢â‚¬â€ cap sessions and reduce density?", actionLabel:"Reduce density", actionType:"REDUCE_WEEKLY_VOLUME", payload:{ pct: 15 }, priority:84 });
  if (learning?.stats?.harder >= 3) triggers.push({ id:"too_hard", msg:"Sessions are repeatedly harder than expected Ã¢â‚¬â€ lower aggressiveness?", actionLabel:"Lower aggressiveness", actionType:"REDUCE_WEEKLY_VOLUME", payload:{ pct: 10 }, priority:80 });
  if ((learning?.stats?.equipBlockers || 0) + (learning?.stats?.travelBlockers || 0) >= 2) triggers.push({ id:"env_fast", msg:"Gym access pattern changed Ã¢â‚¬â€ switch environment assumptions faster?", actionLabel:"Use no-equipment mode", actionType:"SWITCH_ENV_MODE", payload:{ mode:"no equipment" }, priority:74 });
  const recentNutri = actualNutritionLogs.slice(-7);
  if (recentNutri.filter(n => n.adherence === "low").length >= 2) triggers.push({ id:"nutri_simplify", msg:"Nutrition has been off-track Ã¢â‚¬â€ simplify meal structure for 3 days?", actionLabel:"Apply meal defaults", actionType:"SIMPLIFY_MEALS_THIS_WEEK", payload:{ days: 3 }, priority:82 });
  if (recentNutri.filter(n => n.issue === "travel" || n.issue === "convenience" || n.deviationKind === "deviated").length >= 2) triggers.push({ id:"nutri_travel", msg:"Travel/convenience is derailing nutrition Ã¢â‚¬â€ switch to travel nutrition mode?", actionLabel:"Enable travel nutrition", actionType:"SWITCH_TRAVEL_NUTRITION_MODE", payload:{ enabled:true }, priority:79 });
  if ((momentum.momentumState === "drifting" || momentum.momentumState === "falling off") && learning?.stats?.skipped >= 2) triggers.push({ id:"salvage_mode", msg:"YouÃ¢â‚¬â„¢ve missed 2+ sessions Ã¢â‚¬â€ switch to a 3-day salvage plan?", actionLabel:"Activate salvage", actionType:"ACTIVATE_SALVAGE", payload:{}, priority:92 });
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
  if (streakThenMiss) patterns.push("You often miss after 2Ã¢â‚¬â€œ3 strong days.");
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
    success: todayWorkout?.minDay ? (todayWorkout?.success || "Today = short version and momentum preserved.") : salvage?.active ? salvage.compressedPlan.success : todayWorkout?.type === "rest" ? "Log recovery, mobility, and tomorrow plan." : "Complete the planned session and log how it felt.",
    optionalAdjustment,
    patternNote: learning?.topObservations?.[0]?.msg || patterns[0] || "No dominant negative pattern detected this week."
  };
};

const generateWeeklyCoachReview = ({ momentum, arbitration, signals, personalization, patterns, learning, nutritionActualLogs, expectations, recalibration }) => ({
  ...(() => {
    const recentNutri = Object.values(nutritionActualLogs || {}).slice(-7);
    const offTrack = recentNutri.filter(n => n.adherence === "low").length;
    const underFueled = recentNutri.filter(n => n.deviationKind === "under_fueled").length;
    const nutritionLearned = underFueled >= 2
      ? "Nutrition came in under plan multiple times; protect fueling on key days."
      : offTrack >= 2
      ? "Nutrition consistency dropped; simplify meals and defaults."
      : null;
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
      brief: `YouÃ¢â‚¬â„¢re trending in the right direction (${progressSentence}), so today stays focused on high-value execution. ${arbitrationSentence}`,
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
    ? "Good day Ã¢â‚¬â€ you hit what mattered."
    : latestStatus === "completed_modified"
    ? "Not perfect, but you kept momentum."
    : latestStatus === "skipped"
    ? "Recovery day logged Ã¢â‚¬â€ next action is to restart with a minimum day."
    : "Day logged Ã¢â‚¬â€ momentum stays alive.";

  const identity = salvageLayer?.active
    ? "YouÃ¢â‚¬â„¢re handling setbacks like an athlete who stays in the game."
    : consistencyStreak >= 5
    ? "YouÃ¢â‚¬â„¢re building consistency identity."
    : ["drifting","falling off"].includes(momentum?.momentumState)
    ? "YouÃ¢â‚¬â„¢re back on track by showing up today."
    : "YouÃ¢â‚¬â„¢re reinforcing a reliable training rhythm.";

  return {
    consistencyStreak,
    minViableStreak,
    resolution,
    identity,
    recoveryTone: latest?.status === "skipped" || consistencyStreak === 0
  };
};

const deriveLongTermMemoryLayer = ({ logs, dailyCheckins, weeklyCheckins, nutritionActualLogs, validationLayer, previousMemory = [] }) => {
  const entries = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0]));
  const checkins = Object.entries(dailyCheckins || {}).sort((a,b)=>a[0].localeCompare(b[0]));
  const weekly = Object.values(weeklyCheckins || {});
  const nutrition = Object.values(nutritionActualLogs || {});
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
    makeMemory("nutrition_simple_meals","nutrition","adherence is better with simpler repeatable meals", nutrition.filter(n => n.adherence === "low" && ["convenience","travel"].includes(n.issue)).length >= 2 ? 3 : nutrition.filter(n => ["partial", "high"].includes(n.adherence)).length),
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
    ? "WeÃ¢â‚¬â„¢re recalibrating your plan to keep progress aligned with current reality."
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
    ? [`Bench 4Ãƒâ€”6 @ ~${Math.round(trainingMax*0.72)} lbs`, "If bar speed is solid, add 5 lbs next week", "Incline DB 3Ãƒâ€”10 + row 3Ãƒâ€”10 + triceps 3Ãƒâ€”12"]
    : focus === "maintain"
    ? [`Bench 2Ãƒâ€”5 @ ~${Math.round(trainingMax*0.65)} lbs`, "Keep 1 short upper hypertrophy block", "No grind reps while run load is high"]
    : ["Minimal dose: push-up ladder 3 rounds", "DB or band press 3Ãƒâ€”12", "One pull movement + shoulder health work"];

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
      .flatMap(([date, log]) => {
        const canonicalSessions = getExercisePerformanceRecordsForLog(log || {}, { dateKey: date })
          .filter((record) => record?.liftKey === lift.key || lift.keywords.test(record?.exercise || ""))
          .map((record) => ({
            date,
            load: getRecordActualWeight(record) ?? getRecordPrescribedWeight(record),
            note: record?.exercise || log?.notes || log?.type || "Strength session",
          }));
        if (canonicalSessions.length > 0) return canonicalSessions;
        if (!lift.keywords.test(`${log?.type || ""} ${log?.notes || ""}`)) return [];
        const text = `${log?.type || ""} ${log?.notes || ""}`;
        const load = parseInt((text.match(/(\d{2,3})\s?(lb|lbs)?/i) || [])[1] || "0", 10) || null;
        return [{ date, load, note: log?.notes || log?.type || "Strength session" }];
      })
      .filter((session) => session?.load || session?.note)
      .slice(-4);
    const current = sessions[sessions.length - 1]?.load || lift.baseCurrent;
    const goal = Math.max(lift.goal, current + 5);
    const delta = Math.max(0, goal - current);
    const projectedWeeks = Math.max(2, Math.ceil(delta / 5));
    return {
      ...lift,
      current,
      goal,
      projected: `${projectedWeeks}Ã¢â‚¬â€œ${projectedWeeks + 2} weeks`,
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
    ? `At this pace, youÃ¢â‚¬â„¢ll likely drop ~${Math.round(monthWeight)}Ã¢â‚¬â€œ${Math.round(monthWeight + 1)} lbs over the next month if consistency holds.`
    : progress?.weightSignal?.includes("steady")
    ? "Scale trend should stay relatively stable over the next month if intake and execution stay similar."
    : "Bodyweight trend may drift up if this pattern continues; tightening consistency should correct it.";
  const runExpectation = progress?.runSignal?.includes("improving")
    ? "Running capacity should improve steadily over the next few weeks if we keep this structure."
    : progress?.runSignal?.includes("holding steady")
    ? "Running performance should keep inching forward if consistency holds."
    : progress?.runSignal?.includes("down")
    ? "Running performance may stay flat or dip short-term unless we simplify load and recover better."
    : "Running forecast is still forming; 2Ã¢â‚¬â€œ3 consistent weeks will make direction clearer.";
  const strengthExpectation = progress?.strengthSignal?.includes("pushing")
    ? "YouÃ¢â‚¬â„¢re on track to rebuild strength over the next few weeks if we maintain current structure."
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
    ? "This is still worth continuing Ã¢â‚¬â€ even small consistent weeks re-accelerate progress."
    : "This is worth continuing Ã¢â‚¬â€ current habits are creating real momentum.";
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

const derivePersonalOptimizationLayer = ({ logs, dailyCheckins, nutritionActualLogs, coachActions, validationLayer }) => {
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

  const recentNutrition = Object.values(nutritionActualLogs || {}).slice(-21);
  const hunger = recentNutrition.filter(n => n.deviationKind === "under_fueled" || n.issue === "hunger").length;
  const offTrack = recentNutrition.filter(n => n.adherence === "low").length;
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
  if (easier >= 2 && skipped <= 1) observations.push({ key:"ready", count: easier, msg:"YouÃ¢â‚¬â„¢ve handled this workload well before; modest progression is usually tolerated.", confidence: toConfidence(easier), impact: "modest_progress" });
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
    ? "Week has been compressed to preserve momentum. WeÃ¢â‚¬â„¢re prioritizing consistency over perfection."
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
      ? "Welcome back Ã¢â‚¬â€ we reset from today and rebuild momentum with a re-entry week."
      : chaotic
      ? "Keeping this week simple to protect your streak."
      : isLowEngagement
      ? "Low engagement detected Ã¢â‚¬â€ only essentials for now; keep it light and achievable."
      : "Standard coaching mode.",
  };
  return { mode, engagementGapDays, planningHorizonDays, uncertainty, staleData, chaotic, isLowEngagement, isReEntry, minimumViableStructure, coachBehavior };
};

// Ã¢â€â‚¬Ã¢â€â‚¬ MAIN APP Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
const cloneStructuredValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};


const buildLegacyPlanSnapshot = (plannedDayEntry = null) => {
  const plannedDayRecord = getCurrentPrescribedDayRecord(plannedDayEntry) || plannedDayEntry;
  if (!plannedDayRecord?.dateKey) return null;
  return {
    dateKey: plannedDayRecord.dateKey,
    baseLabel: plannedDayRecord?.base?.training?.label || "",
    resolvedLabel: plannedDayRecord?.resolved?.training?.label || "",
    mode: plannedDayRecord?.decision?.mode || "",
    modeLabel: plannedDayRecord?.decision?.modeLabel || "",
    modifiedFromBase: Boolean(plannedDayRecord?.decision?.modifiedFromBase),
  };
};

const buildLegacyPlannedDayRecordFromSnapshot = ({ dateKey = "", snapshot = null } = {}) => {
  if (!dateKey || !snapshot) return null;
  const baseLabel = String(snapshot?.baseLabel || snapshot?.resolvedLabel || "Planned session").trim();
  const resolvedLabel = String(snapshot?.resolvedLabel || snapshot?.baseLabel || baseLabel).trim();
  return {
    id: `legacy_snapshot_${dateKey}`,
    dateKey,
    source: "legacy_log_snapshot",
    week: {},
    base: {
      training: baseLabel ? { label: baseLabel, type: "planned_session" } : null,
      nutrition: null,
      recovery: null,
      supplements: null,
    },
    resolved: {
      training: resolvedLabel ? { label: resolvedLabel, type: snapshot?.modifiedFromBase ? "modified_session" : "planned_session" } : null,
      nutrition: null,
      recovery: null,
      supplements: null,
    },
    decision: {
      mode: String(snapshot?.mode || "legacy_snapshot"),
      modeLabel: String(snapshot?.modeLabel || ""),
      modifiedFromBase: Boolean(snapshot?.modifiedFromBase),
    },
    durability: PRESCRIBED_DAY_DURABILITY.legacyBackfill,
    provenance: {
      ...buildStructuredProvenance({
        keyDrivers: ["legacy prescribed snapshot"],
        events: [
          buildProvenanceEvent({
            actor: PROVENANCE_ACTORS.migration,
            trigger: "legacy_log_snapshot",
            mutationType: "migration_backfill",
            revisionReason: "Recovered from legacy prescribed snapshot.",
            sourceInputs: ["logs.prescribedPlanSnapshot"],
            confidence: "medium",
            timestamp: getStableCaptureAtForDate(dateKey),
          }),
        ],
        summary: "Recovered from legacy prescribed snapshot.",
      }),
      adjustments: [],
    },
    flags: {
      isModified: Boolean(snapshot?.modifiedFromBase),
    },
  };
};

const buildLegacyPlannedDayRecordFromWorkout = ({ dateKey = "", weekNumber = 0, workout = null } = {}) => {
  if (!dateKey || !workout) return null;
  return {
    id: `legacy_schedule_${dateKey}`,
    dateKey,
    source: "legacy_schedule_helper",
    week: {
      number: weekNumber,
      phase: workout?.week?.phase || workout?.phase || "",
    },
    base: {
      training: cloneStructuredValue(workout),
      nutrition: workout?.nutri ? { dayType: workout.nutri } : null,
      recovery: null,
      supplements: null,
    },
    resolved: {
      training: cloneStructuredValue(workout),
      nutrition: workout?.nutri ? { dayType: workout.nutri } : null,
      recovery: null,
      supplements: null,
    },
    decision: {
      mode: "static_schedule",
      modeLabel: "Static schedule fallback",
      modifiedFromBase: false,
    },
    durability: PRESCRIBED_DAY_DURABILITY.fallbackDerived,
    provenance: {
      ...buildStructuredProvenance({
        keyDrivers: ["legacy schedule fallback"],
        events: [
          buildProvenanceEvent({
            actor: PROVENANCE_ACTORS.fallback,
            trigger: "legacy_schedule_helper",
            mutationType: "fallback_reconstruction",
            revisionReason: "Recovered from legacy week-template fallback.",
            sourceInputs: ["week_templates", "getTodayWorkout"],
            confidence: "low",
            timestamp: getStableCaptureAtForDate(dateKey),
            details: {
              weekNumber,
            },
          }),
        ],
        summary: "Recovered from legacy week-template fallback.",
      }),
      adjustments: [],
    },
    flags: {
      isModified: false,
      restDay: workout?.type === "rest",
    },
  };
};

const getNutritionOverrideDayType = (override = null) => String(override?.dayType || override || "").trim();

const buildAdjustmentProvenance = ({
  actor = PROVENANCE_ACTORS.user,
  trigger = "manual_override",
  mutationType = "state_update",
  revisionReason = "",
  sourceInputs = [],
  confidence = "high",
  timestamp = Date.now(),
  details = {},
} = {}) => buildProvenanceEvent({
  actor,
  trigger,
  mutationType,
  revisionReason,
  sourceInputs,
  confidence,
  timestamp,
  details,
});

export default function TrainerDashboard() {
  const [tab, setTab] = useState(() => {
    if (typeof window === "undefined") return 0;
    const requestedTab = new URLSearchParams(window.location.search).get("tab");
    return requestedTab === "settings" ? 5 : 0;
  });
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
  const [coachPlanAdjustments, setCoachPlanAdjustments] = useState(DEFAULT_COACH_PLAN_ADJUSTMENTS);
  const [dailyCheckins, setDailyCheckins] = useState({});
  const [plannedDayRecords, setPlannedDayRecords] = useState({});
  const [weeklyCheckins, setWeeklyCheckins] = useState({});
  const [nutritionFavorites, setNutritionFavorites] = useState(DEFAULT_NUTRITION_FAVORITES);
  const [nutritionActualLogs, setNutritionActualLogs] = useState({});
  const [analyzing, setAnalyzing] = useState(false);
  const [storageStatus, setStorageStatus] = useState(() => buildStorageStatus({ mode: "syncing", label: "SYNCING", reason: STORAGE_STATUS_REASONS.unknown, detail: "Cloud sync is initializing." }));
  const [lastSaved, setLastSaved] = useState(null);
  const [dismissedTriggers, setDismissedTriggers] = useState([]);
  const [authSession, setAuthSession] = useState(null);
  const [authMode, setAuthMode] = useState("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authError, setAuthError] = useState("");
  const [authInitializing, setAuthInitializing] = useState(true);
  const realtimeClientRef = useRef(null);
  const realtimeChannelRef = useRef(null);
  const realtimeResyncTimerRef = useRef(null);
  const realtimeInterruptedRef = useRef(false);
  const lastLocalMutationAtRef = useRef(0);
  const skipNextGoalsPersistRef = useRef(false);
  const authSessionRef = useRef(null);
  const sbLoadRef = useRef(null);
  const logDiagRef = useRef(null);
  const historyRelabelAppliedRef = useRef(false);
  const [startFreshConfirmOpen, setStartFreshConfirmOpen] = useState(false);
  const [showAppleHealthFirstLaunch, setShowAppleHealthFirstLaunch] = useState(false);
  const DEBUG_MODE = typeof window !== "undefined" && safeStorageGet(localStorage, "trainer_debug", "0") === "1";
  const logDiag = (...args) => { if (DEBUG_MODE) console.log("[trainer-debug]", ...args); };
  const canonicalAthlete = useMemo(
    () => deriveCanonicalAthleteState({ goals, personalization, profileDefaults: PROFILE }),
    [goals, personalization]
  );
  const goalsModel = canonicalAthlete.goals;
  const goalBuckets = canonicalAthlete.goalBuckets;
  const activeTimeBoundGoal = canonicalAthlete.activeTimeBoundGoal;
  const canonicalUserProfile = canonicalAthlete.userProfile;
  const canonicalGoalState = canonicalAthlete.goalState;

  const today = new Date();
  const currentWeek = resolveCurrentPlanWeekNumber({
    planStartDate: canonicalGoalState?.planStartDate || "",
    fallbackStartDate: PROFILE.startDate,
    now: today,
  });
  const dayOfWeek = getDayOfWeek();
  const baseTodayWorkout = getTodayWorkout(currentWeek, dayOfWeek);
  const baseWeek = WEEKS[(currentWeek - 1) % WEEKS.length] || WEEKS[0];
  const todayKey = new Date().toISOString().split("T")[0];
  const dismissedTriggerStorageKey = `dismissed_triggers_${todayKey}`;
  const dayOverride = coachPlanAdjustments.dayOverrides?.[todayKey];
  const nutritionOverride = coachPlanAdjustments.nutritionOverrides?.[todayKey];
  const environmentSelection = resolveEnvironmentSelection({ personalization, todayKey, currentWeek });
  const momentum = getMomentumEngineState({ logs, bodyweights, personalization });
  const patterns = detectBehaviorPatterns({ logs, bodyweights, personalization });
  const validationLayer = deriveClosedLoopValidationLayer({ coachActions, logs, dailyCheckins });
  const optimizationLayer = derivePersonalOptimizationLayer({ logs, dailyCheckins, nutritionActualLogs, coachActions, validationLayer });
  const learningLayer = deriveLearningLayer({ dailyCheckins, logs, weeklyCheckins, momentum, personalization, validationLayer, optimizationLayer });
  const salvageLayer = deriveSalvageLayer({ logs, momentum, dailyCheckins, weeklyCheckins, personalization, learningLayer });
  const failureMode = deriveFailureModeHardening({ logs, dailyCheckins, bodyweights, coachPlanAdjustments, coachActions, salvageLayer });
  const planComposer = composeGoalNativePlan({ goals: goalsModel, personalization, momentum, learningLayer, currentWeek, baseWeek });
  const planWeekRuntime = useMemo(() => {
    const runtime = assemblePlanWeekRuntime({
      todayKey,
      currentWeek,
      dayOfWeek,
      goals: goalsModel,
      baseWeek,
      weekTemplates: WEEKS,
      planComposer,
      momentum,
      learningLayer,
      weeklyCheckins,
      coachPlanAdjustments,
      failureMode,
      environmentSelection,
      horizonWeeks: DEFAULT_PLANNING_HORIZON_WEEKS,
    });
    validatePlanWeekInvariant(runtime?.currentPlanWeek || null, "assemblePlanWeekRuntime.currentPlanWeek");
    return runtime;
  }, [
    todayKey,
    currentWeek,
    dayOfWeek,
    goalsModel,
    baseWeek,
    planComposer,
    momentum,
    learningLayer,
    weeklyCheckins,
    coachPlanAdjustments,
    failureMode,
    environmentSelection,
  ]);
  const currentWeeklyCheckin = planWeekRuntime.currentWeeklyCheckin;
  const currentPlanWeek = planWeekRuntime.currentPlanWeek;
  const currentPlanSession = planWeekRuntime.currentPlanSession;
  const todayPlan = generateTodayPlan(
    canonicalUserProfile,
    { logs, todayKey },
    {
      fatigueScore: personalization.trainingState?.fatigueScore ?? 2,
      trend: personalization.trainingState?.trend || "stable",
      momentum: momentum.momentumState,
      injuryLevel: personalization.injuryPainState?.level || "none",
    },
    {
      weeklyIntent: currentPlanWeek?.weeklyIntent || null,
      planWeek: currentPlanWeek,
      plannedSession: currentPlanSession,
    }
  );
  const rollingHorizon = planWeekRuntime.rollingHorizon;
  const horizonAnchor = planWeekRuntime.horizonAnchor;
  const hasStructuredProfile = Boolean(canonicalUserProfile?.primaryGoalKey);
  const goalNativeBase = currentPlanSession
    ? {
        ...baseTodayWorkout,
        ...currentPlanSession,
        week: {
          ...baseWeek,
          planWeekId: currentPlanWeek?.id || "",
          status: currentPlanWeek?.status || "planned",
          adjusted: Boolean(currentPlanWeek?.adjusted),
          weeklyIntent: currentPlanWeek?.weeklyIntent || null,
        },
        zones: baseTodayWorkout?.zones,
      }
    : baseTodayWorkout;
  const goalNativeWorkout = hasStructuredProfile
    ? todayPlan.type === "recovery"
      ? { ...goalNativeBase, type: "rest", label: todayPlan.label, nutri: "rest", run: null, strSess: null, todayPlan }
      : { ...goalNativeBase, label: todayPlan.label, planIntensity: todayPlan.intensity, planDuration: todayPlan.duration, todayPlan }
    : goalNativeBase;
  const todayWorkoutBase = dayOverride ? { ...goalNativeWorkout, ...dayOverride, coachOverride: true, nutri: nutritionOverride || dayOverride.nutri || goalNativeWorkout?.week?.nutri } : { ...goalNativeWorkout, nutri: nutritionOverride || goalNativeWorkout?.week?.nutri };
  const weekState = failureMode?.mode === "chaotic" ? "chaotic" : momentum?.fatigueNotes >= 2 ? "fatigued" : "normal";
  const todayWorkoutEnvironment = applyEnvironmentToWorkout(todayWorkoutBase, environmentSelection, { weekState, injuryFlag: personalization?.injuryPainState?.level || "none" });
  const injuryRule = buildInjuryRuleResult(todayWorkoutEnvironment, personalization.injuryPainState);
  const todayWorkout = applySessionNamingRules(injuryRule.workout, personalization.injuryPainState);
  const garminReadiness = deriveGarminReadiness(personalization, todayKey);
  const deviceSyncAudit = deriveDeviceSyncAudit(personalization, todayKey);
  const arbitration = arbitrateGoals({ goals: goalsModel, momentum, personalization });
  const strengthLayer = deriveStrengthLayer({ goals: goalsModel, momentum, personalization, logs });
  const progressEngine = deriveProgressEngine({ logs, bodyweights, momentum, strengthLayer });
  const expectations = deriveExpectationEngine({ progress: progressEngine, momentum, arbitration });
  const behaviorLoop = deriveBehaviorLoop({ dailyCheckins, logs, momentum, salvageLayer });
  const longTermMemory = useMemo(
    () => deriveLongTermMemoryLayer({
      logs,
      dailyCheckins,
      weeklyCheckins,
      nutritionActualLogs,
      validationLayer,
      previousMemory: personalization?.coachMemory?.longTermMemory || []
    }),
    [logs, dailyCheckins, weeklyCheckins, nutritionActualLogs, validationLayer]
  );
  const memoryInsights = longTermMemory.filter(m => m.confidence === "high").slice(0, 4);
  const compoundingCoachMemory = deriveCompoundingCoachMemory({ dailyCheckins, weeklyCheckins, personalization, momentum });
  const recalibration = deriveRecalibrationEngine({ currentWeek, progress: progressEngine, momentum, learningLayer, memoryInsights, arbitration });
  const todayWorkoutHardenedBase = failureMode.isReEntry
    ? { ...todayWorkout, label: `Re-entry day: ${todayWorkout?.label || "short version"}`, minDay: true, success: "Re-entry week: complete one essential session and log it. Momentum first.", explanation: `You haven't trained in a while, so today is a re-entry session. The goal is to rebuild rhythm with one manageable session Ã¢â‚¬â€ not to catch up.` }
    : (failureMode.mode === "chaotic" || failureMode.isLowEngagement)
    ? { ...todayWorkout, minDay: true, success: "Complete the short version only.", explanation: `Life has been chaotic recently, so today is the short version. Completing something small protects your momentum better than skipping entirely.` }
    : todayWorkout;
  const todayWorkoutHardened = garminReadiness?.mode === "recovery"
    ? { ...todayWorkoutHardenedBase, type: "rest", label: "Recovery Mode (Garmin readiness)", run: null, strSess: null, nutri: "rest", success: "Walk + mobility only today. Resume loading when readiness improves.", explanation: `Garmin readiness is coming in low today, so the app is treating device data as a caution signal rather than a guarantee. Recovery today protects the rest of the week.` }
    : garminReadiness?.mode === "reduced_load"
    ? { ...todayWorkoutHardenedBase, minDay: true, label: `${todayWorkoutHardenedBase?.label || "Session"} (Reduced-load)`, explanation: `Garmin readiness is pointing to partial recovery, so today's session is reduced as a caution move rather than a hard stop.` }
    : deviceSyncAudit?.planMode === "recovery"
    ? { ...todayWorkoutHardenedBase, type: "rest", label: "Recovery Mode (Device signals)", run: null, strSess: null, nutri: "rest", success: "Device data points toward a recovery day.", explanation: `Connected device data is leaning recovery today. The app is using that signal cautiously because device context is supportive, not definitive, on its own.` }
    : deviceSyncAudit?.planMode === "reduced_load"
    ? { ...todayWorkoutHardenedBase, minDay: true, label: `${todayWorkoutHardenedBase?.label || "Session"} (Device-adjusted)`, explanation: `Device signals suggest slightly reducing today's load to stay within productive training ranges.` }
    : todayWorkoutHardenedBase;
  if (!todayWorkoutHardened.explanation && todayWorkoutHardened.todayPlan?.reason) {
    todayWorkoutHardened.explanation = todayWorkoutHardened.todayPlan.reason;
  }
  const cadenceRuns = (personalization?.connectedDevices?.garmin?.activities || []).filter((a) => /run/i.test(String(a?.type || a?.sport || "")) && Number(a?.cadence || 0) > 0);
  const avgCadence = cadenceRuns.length ? (cadenceRuns.reduce((acc, a) => acc + Number(a?.cadence || 0), 0) / cadenceRuns.length) : null;
  if (todayWorkoutHardened?.run?.t === "Easy" && cadenceRuns.length >= 10) {
    if (avgCadence < 170) todayWorkoutHardened.environmentNote = `${todayWorkoutHardened.environmentNote ? `${todayWorkoutHardened.environmentNote} ` : ""}Target 170+ spm Ã¢â‚¬â€ shorter, quicker steps.`;
    else if (avgCadence > 180 && (currentWeek % 2 === 0)) todayWorkoutHardened.environmentNote = `${todayWorkoutHardened.environmentNote ? `${todayWorkoutHardened.environmentNote} ` : ""}Cadence is efficient Ã¢â‚¬â€ keep that quick, relaxed turnover.`;
  }
  const todaySummary = personalization?.connectedDevices?.garmin?.dailySummaries?.[todayKey] || {};
  if (todayWorkoutHardened?.type === "rest" && Number(todaySummary?.steps || 0) > 0) {
    todayWorkoutHardened.environmentNote = `${todayWorkoutHardened.environmentNote ? `${todayWorkoutHardened.environmentNote} ` : ""}Today steps: ${todaySummary.steps}. Keep rest day movement easy.`;
  }
  const planDayTimeOfDay = resolvePlanDayTimeOfDay({ hours: today.getHours() });
  const planDayStateInputs = useMemo(() => resolvePlanDayStateInputs({
    dateKey: todayKey,
    logs,
    dailyCheckins,
    nutritionActualLogs,
    coachPlanAdjustments,
  }), [todayKey, logs, dailyCheckins, nutritionActualLogs, coachPlanAdjustments]);
  const savedTodayCheckin = planDayStateInputs.dailyCheckin;
  const savedReadinessPromptSignal = planDayStateInputs.readinessPromptSignal;
  const sharedReadinessInfluence = deriveDeterministicReadinessState({
    todayKey,
    checkin: savedTodayCheckin,
    promptSignal: savedReadinessPromptSignal,
    workout: todayWorkoutHardened,
    logs,
    dailyCheckins,
    personalization,
    momentum,
    userProfile: canonicalUserProfile,
  });
  const planDayBundle = useMemo(() => {
    const bundle = assembleCanonicalPlanDay({
      dateKey: todayKey,
      dayOfWeek,
      currentWeek,
      baseWeek,
      basePlannedDay: goalNativeWorkout,
      resolvedTrainingCandidate: todayWorkoutHardened,
      todayPlan,
      readinessInfluence: sharedReadinessInfluence,
      goals: goalsModel,
      momentum,
      personalization,
      bodyweights,
      learningLayer,
      nutritionActualLogs,
      coachPlanAdjustments,
      salvageLayer,
      failureMode,
      nutritionFavorites,
      currentPlanWeek: {
        ...currentPlanWeek,
        architecture: planComposer?.architecture || "",
        blockIntent: planComposer?.blockIntent || null,
      },
      dayOverride,
      nutritionOverride,
      environmentSelection,
      injuryRule,
      garminReadiness,
      deviceSyncAudit,
      logs,
      dailyCheckins,
      stateInputs: planDayStateInputs,
      timeOfDay: planDayTimeOfDay,
    });
    validatePlanDayInvariant(bundle?.planDay || null, "assembleCanonicalPlanDay.planDay");
    validateActualNutritionLogInvariant(bundle?.planDay?.resolved?.nutrition?.actual || null, todayKey, "assembleCanonicalPlanDay.actualNutrition");
    return bundle;
  }, [
    todayKey,
    dayOfWeek,
    currentWeek,
    baseWeek,
    goalNativeWorkout,
    todayWorkoutHardened,
    todayPlan,
    sharedReadinessInfluence,
    goalsModel,
    momentum,
    personalization,
    bodyweights,
    learningLayer,
    nutritionActualLogs,
    coachPlanAdjustments,
    salvageLayer,
    failureMode,
    nutritionFavorites,
    dayOverride,
    nutritionOverride,
    environmentSelection,
    injuryRule,
    garminReadiness,
    deviceSyncAudit,
    planComposer,
    currentPlanWeek,
    logs,
    dailyCheckins,
    planDayStateInputs,
    planDayTimeOfDay,
  ]);
  const planDay = planDayBundle.planDay;
  const effectiveTodayWorkout = planDayBundle.effectiveTraining;
  const nutritionLayer = planDayBundle.nutritionLayer;
  const realWorldNutrition = planDayBundle.realWorldNutrition;
  const nutritionComparison = planDayBundle.nutritionComparison;
  const todayPlannedDayRecord = useMemo(() => buildPlannedDayRecord(planDay), [planDay]);
  const runtimeDebugSnapshot = useMemo(() => {
    const weekIntent = currentPlanWeek?.weeklyIntent || {};
    const readiness = planDay?.resolved?.recovery || {};
    const nutritionActual = planDay?.resolved?.nutrition?.actual || null;
    const nutritionComparisonSummary = planDay?.resolved?.nutrition?.comparison || {};
    const latestAcceptedCoachAction = (coachActions || []).find((action) => action?.acceptedBy);
    const latestAiPlanAlert = (planAlerts || []).find((alert) => alert?.source === "ai_proposal_accepted");
    const latestPlanRevision = plannedDayRecords?.[todayKey]?.revisions?.slice?.(-1)?.[0] || null;
    const plannedHistory = plannedDayRecords?.[todayKey] || null;
    const loggingState = planDay?.resolved?.logging || {};
    return {
      generatedAt: new Date().toISOString(),
      storage: {
        mode: storageStatus?.mode || "unknown",
        label: storageStatus?.label || "UNKNOWN",
        authError: authError || "",
      },
      planDay: {
        dateKey: planDay?.dateKey || todayKey,
        label: planDay?.resolved?.training?.label || planDay?.base?.training?.label || "No day loaded",
        type: planDay?.resolved?.training?.type || "unknown",
        decisionMode: planDay?.decision?.mode || "unknown",
        confidence: planDay?.decision?.confidence || "unknown",
        modifiedFromBase: Boolean(planDay?.decision?.modifiedFromBase || planDay?.flags?.isModified),
        provenanceSummary: planDay?.provenance?.summary || "",
        keyDrivers: Array.isArray(planDay?.provenance?.keyDrivers) ? planDay.provenance.keyDrivers.slice(0, 5) : [],
      },
      planWeek: {
        id: currentPlanWeek?.id || "",
        weekNumber: currentPlanWeek?.weekNumber || currentWeek,
        label: currentPlanWeek?.label || "",
        phase: currentPlanWeek?.phase || baseWeek?.phase || "",
        status: currentPlanWeek?.status || "planned",
        adjusted: Boolean(currentPlanWeek?.adjusted),
        focus: weekIntent?.focus || "",
        aggressionLevel: weekIntent?.aggressionLevel || "",
        recoveryBias: weekIntent?.recoveryBias || "",
        volumeBias: weekIntent?.volumeBias || "",
        performanceBias: weekIntent?.performanceBias || "",
        nutritionEmphasis: weekIntent?.nutritionEmphasis || "",
        constraints: Array.isArray(currentPlanWeek?.constraints) ? currentPlanWeek.constraints.slice(0, 5) : [],
      },
      readiness: {
        state: readiness?.state || "unknown",
        stateLabel: readiness?.stateLabel || "",
        source: readiness?.source || "",
        inputDriven: Boolean(readiness?.inputDriven),
        userVisibleLine: readiness?.userVisibleLine || readiness?.recoveryLine || "",
        factors: Array.isArray(readiness?.factors) ? readiness.factors.slice(0, 5) : [],
      },
      nutrition: {
        dayType: planDay?.resolved?.nutrition?.dayType || planDay?.resolved?.nutrition?.prescription?.dayType || "",
        actualLogged: Boolean(nutritionActual),
        compliance: nutritionActual?.compliance || "",
        deviationKind: nutritionActual?.deviationKind || nutritionComparisonSummary?.deviationKind || "",
        comparisonStatus: nutritionComparisonSummary?.status || "",
        comparisonImpact: nutritionComparisonSummary?.impact || "",
        comparisonSummary: nutritionComparisonSummary?.summary || "",
      },
      logging: {
        checkinStatus: loggingState?.dailyCheckin?.status || "",
        sessionStatus: loggingState?.status || "",
        hasCheckin: Boolean(loggingState?.hasCheckin),
        hasSessionLog: Boolean(loggingState?.hasSessionLog),
        hasNutritionLog: Boolean(loggingState?.hasNutritionLog),
      },
      prescribedHistory: {
        durability: latestPlanRevision?.durability || "none",
        sourceType: latestPlanRevision?.sourceType || "",
        revisionNumber: latestPlanRevision?.revisionNumber || 0,
        revisionCount: Array.isArray(plannedHistory?.revisions) ? plannedHistory.revisions.length : 0,
        currentRevisionId: plannedHistory?.currentRevisionId || "",
      },
      ai: {
        analyzing,
        latestAcceptedPlanProposal: latestAiPlanAlert
          ? {
              id: latestAiPlanAlert.id || "",
              type: latestAiPlanAlert.type || "",
              message: latestAiPlanAlert.msg || "",
              acceptedBy: latestAiPlanAlert.acceptedBy || "",
              packetIntent: latestAiPlanAlert.packetIntent || "",
              packetVersion: latestAiPlanAlert.packetVersion || "",
            }
          : null,
        latestAcceptedCoachAction: latestAcceptedCoachAction
          ? {
              type: latestAcceptedCoachAction.type || "",
              source: latestAcceptedCoachAction.source || "",
              proposalSource: latestAcceptedCoachAction.proposalSource || "",
              acceptedBy: latestAcceptedCoachAction.acceptedBy || "",
              acceptancePolicy: latestAcceptedCoachAction.acceptancePolicy || "",
              reason: latestAcceptedCoachAction.reason || latestAcceptedCoachAction.rationale || "",
            }
          : null,
      },
    };
  }, [
    currentPlanWeek,
    currentWeek,
    baseWeek,
    planDay,
    coachActions,
    planAlerts,
    plannedDayRecords,
    todayKey,
    storageStatus,
    authError,
    analyzing,
  ]);
  const dailyBrief = generateDailyCoachBrief({ momentum, todayWorkout: effectiveTodayWorkout, arbitration, injuryState: personalization.injuryPainState, patterns, learning: learningLayer, salvage: salvageLayer });
  const dailyStory = buildUnifiedDailyStory({ todayWorkout: effectiveTodayWorkout, dailyBrief, progress: progressEngine, arbitration, expectations, salvage: salvageLayer, momentum });
  const weeklyReview = generateWeeklyCoachReview({ momentum, arbitration, signals: computeAdaptiveSignals({ logs, bodyweights, personalization }), personalization, patterns, learning: learningLayer, nutritionActualLogs, expectations, recalibration });
  const baseProactiveTriggers = buildProactiveTriggers({ momentum, personalization, goals: goalsModel, learning: learningLayer, nutritionActualLogs, longTermMemory }).filter(t => !dismissedTriggers.includes(t.id));
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
    try {
      const raw = sessionStorage.getItem(dismissedTriggerStorageKey);
      const parsed = raw ? JSON.parse(raw) : [];
      setDismissedTriggers(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDismissedTriggers([]);
    }
  }, [dismissedTriggerStorageKey]);

  useEffect(() => {
    try { sessionStorage.setItem(dismissedTriggerStorageKey, JSON.stringify(dismissedTriggers || [])); } catch {}
  }, [dismissedTriggerStorageKey, dismissedTriggers]);

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    window.__trainerRuntime = runtimeDebugSnapshot;
    return () => {
      if (window.__trainerRuntime === runtimeDebugSnapshot) delete window.__trainerRuntime;
    };
  }, [runtimeDebugSnapshot]);

  const dismissTriggerForToday = (id) => {
    if (!id) return;
    setDismissedTriggers(prev => Array.from(new Set([...(prev || []), id])));
  };

  useEffect(() => {
    if (loading) return;
    const prev = JSON.stringify(personalization?.coachMemory?.longTermMemory || []);
    const next = JSON.stringify(longTermMemory || []);
    if (prev === next) return;
    const updated = mergePersonalization(personalization, { coachMemory: { ...personalization.coachMemory, longTermMemory } });
    setPersonalization(updated);
    persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
  }, [longTermMemory]);

  useEffect(() => {
    if (loading) return;
    const prev = JSON.stringify(personalization?.coachMemory?.compounding || {});
    const next = JSON.stringify(compoundingCoachMemory || {});
    if (prev === next) return;
    const updated = mergePersonalization(personalization, { coachMemory: { ...personalization.coachMemory, compounding: compoundingCoachMemory } });
    setPersonalization(updated);
    persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
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
  const setEnvironmentMode = async ({ equipment, time, mode, scope = "base", clearTodayOverride = false }) => {
    const presets = personalization.environmentConfig?.presets || {};
    const baseMode = personalization.environmentConfig?.defaultMode || "Home";
    const fromMode = mode ? resolveModePreset(mode, presets) : null;
    const baseConfig = personalization.environmentConfig?.base || resolveModePreset(baseMode, presets);
    const selected = { equipment: equipment || fromMode?.equipment || baseConfig.equipment, time: time || fromMode?.time || baseConfig.time, mode: mode || baseMode };
    const nextEnvironmentConfig = {
      ...(personalization.environmentConfig || {}),
      defaultMode: scope === "base" ? selected.mode : (personalization.environmentConfig?.defaultMode || selected.mode),
      base: scope === "base" ? selected : baseConfig,
      todayOverride: clearTodayOverride ? null : (scope === "today" ? { ...selected, date: todayKey } : (scope === "base" ? null : personalization.environmentConfig?.todayOverride || null)),
      weekOverride: scope === "week" ? { ...selected, week: currentWeek } : (scope === "base" ? null : personalization.environmentConfig?.weekOverride || null),
    };
    const draftPersonalization = mergePersonalization(personalization, { environmentConfig: nextEnvironmentConfig });
    const resolvedSelection = resolveEnvironmentSelection({ personalization: draftPersonalization, todayKey, currentWeek });
    const effectiveEquipment = resolvedSelection?.equipment || selected.equipment;
    const environmentMode = effectiveEquipment === "full_gym"
      ? "full gym"
      : effectiveEquipment === "basic_gym"
      ? "limited gym"
      : effectiveEquipment === "none"
      ? "home"
      : "limited gym";
    const updated = mergePersonalization(draftPersonalization, {
      travelState: {
        ...draftPersonalization.travelState,
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
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
  };

  const applyDayContextOverride = async (contextKey) => {
    const cfg = DAY_CONTEXT_OVERRIDES[contextKey];
    if (!cfg) return;
    const appliedAt = Date.now();
    const overrideReason = String(contextKey || "day_context_override").replaceAll("_", " ");
    const dayOverrideProvenance = buildAdjustmentProvenance({
      actor: PROVENANCE_ACTORS.user,
      trigger: "day_context_override",
      mutationType: "daily_override",
      revisionReason: overrideReason,
      sourceInputs: ["TodayTab", "DAY_CONTEXT_OVERRIDES"],
      timestamp: appliedAt,
      details: {
        dateKey: todayKey,
        contextKey,
        trainingType: cfg.type || "",
      },
    });
    const nutritionOverrideProvenance = buildAdjustmentProvenance({
      actor: PROVENANCE_ACTORS.user,
      trigger: "day_context_override",
      mutationType: "nutrition_override",
      revisionReason: `nutrition set to ${String(cfg.nutri || "").replaceAll("_", " ")}`,
      sourceInputs: ["TodayTab", "DAY_CONTEXT_OVERRIDES"],
      timestamp: appliedAt,
      details: {
        dateKey: todayKey,
        contextKey,
        dayType: cfg.nutri || "",
      },
    });
    const nextAdjustments = {
      ...coachPlanAdjustments,
      dayOverrides: { ...(coachPlanAdjustments.dayOverrides || {}), [todayKey]: { label: cfg.label, type: cfg.type, reason: contextKey, minDay: true, fallback: cfg.fallback, success: cfg.success, injuryAdjusted: false, provenance: dayOverrideProvenance } },
      nutritionOverrides: { ...(coachPlanAdjustments.nutritionOverrides || {}), [todayKey]: { dayType: cfg.nutri, reason: contextKey, provenance: nutritionOverrideProvenance } },
      extra: { ...(coachPlanAdjustments.extra || {}), dayContext: { ...((coachPlanAdjustments.extra || {}).dayContext || {}), [todayKey]: contextKey } }
    };
    const nextNotes = { ...weekNotes, [currentWeek]: `Day override applied (${contextKey.replaceAll("_"," ")}).` };
    setCoachPlanAdjustments(nextAdjustments);
    setWeekNotes(nextNotes);
    await persistAll(logs, bodyweights, paceOverrides, nextNotes, planAlerts, personalization, coachActions, nextAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
  };

  const shiftTodayWorkout = async ({ daysForward = 1, mode = "replace" } = {}) => {
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + Math.max(1, Math.min(6, daysForward)));
    const toKey = targetDate.toISOString().split("T")[0];
    const previousAdjustments = coachPlanAdjustments;
    const previousNotes = weekNotes;
    const existingTomorrow = coachPlanAdjustments?.dayOverrides?.[toKey];
    const shiftedAt = Date.now();
    const shiftedSessionProvenance = buildAdjustmentProvenance({
      actor: PROVENANCE_ACTORS.user,
      trigger: "schedule_shift",
      mutationType: "daily_override",
      revisionReason: `Session shifted from ${todayKey} to ${toKey}.`,
      sourceInputs: ["TodayTab", "shiftTodayWorkout"],
      timestamp: shiftedAt,
      details: {
        fromDateKey: todayKey,
        toDateKey: toKey,
        mode,
      },
    });
    const shiftedSession = { ...todayWorkoutBase, label: `${todayWorkoutBase?.label || "Session"} (Shifted)`, shiftedFrom: todayKey, coachOverride: true, provenance: shiftedSessionProvenance };
    const tomorrowPayload = mode === "add_second" && existingTomorrow
      ? { ...existingTomorrow, secondSession: shiftedSession, label: `${existingTomorrow.label || "Session"} + 2nd session`, provenance: normalizeProvenanceEvent(existingTomorrow?.provenance || shiftedSessionProvenance, { trigger: "schedule_shift" }) }
      : shiftedSession;
    const recoveryOverrideProvenance = buildAdjustmentProvenance({
      actor: PROVENANCE_ACTORS.user,
      trigger: "schedule_shift",
      mutationType: "daily_override",
      revisionReason: `Recovery day inserted after shifting session to ${toKey}.`,
      sourceInputs: ["TodayTab", "shiftTodayWorkout"],
      timestamp: shiftedAt,
      details: {
        fromDateKey: todayKey,
        toDateKey: toKey,
        mode,
      },
    });
    const nutritionOverrideProvenance = buildAdjustmentProvenance({
      actor: PROVENANCE_ACTORS.user,
      trigger: "schedule_shift",
      mutationType: "nutrition_override",
      revisionReason: "Nutrition day downgraded to easy run after schedule shift.",
      sourceInputs: ["TodayTab", "shiftTodayWorkout"],
      timestamp: shiftedAt,
      details: {
        dateKey: todayKey,
        dayType: "easyRun",
      },
    });
    const nextAdjustments = {
      ...coachPlanAdjustments,
      dayOverrides: {
        ...(coachPlanAdjustments.dayOverrides || {}),
        [toKey]: tomorrowPayload,
        [todayKey]: { label: `${todayWorkoutBase?.label || "Session"} moved to ${toKey}`, type: "rest", reason: "schedule_shift", minDay: true, fallback: `${todayWorkoutBase?.label || "Session"} moved to tomorrow`, success: "Session moved. Recovery day auto-inserted.", provenance: recoveryOverrideProvenance }
      },
      nutritionOverrides: { ...(coachPlanAdjustments.nutritionOverrides || {}), [todayKey]: { dayType: "easyRun", reason: "schedule_shift", provenance: nutritionOverrideProvenance } },
      extra: { ...(coachPlanAdjustments.extra || {}), scheduleFlex: true }
    };
    const nextNotes = { ...weekNotes, [currentWeek]: `Workout shifted from ${todayKey} to ${toKey}${mode === "add_second" ? " as second session" : ""}.` };
    setCoachPlanAdjustments(nextAdjustments);
    setWeekNotes(nextNotes);
    await persistAll(logs, bodyweights, paceOverrides, nextNotes, planAlerts, personalization, coachActions, nextAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
    return { previousAdjustments, previousNotes };
  };

  const restoreShiftTodayWorkout = async ({ previousAdjustments, previousNotes }) => {
    if (!previousAdjustments || !previousNotes) return;
    setCoachPlanAdjustments(previousAdjustments);
    setWeekNotes(previousNotes);
    await persistAll(logs, bodyweights, paceOverrides, previousNotes, planAlerts, personalization, coachActions, previousAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬ SUPABASE STORAGE Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  const authStorage = useMemo(() => createAuthStorageModule({
    safeFetchWithTimeout,
    logDiag,
    mergePersonalization,
    normalizeGoals,
    DEFAULT_PERSONALIZATION,
    DEFAULT_MULTI_GOALS,
  }), []);

  const { SB_URL, SB_KEY, SB_CONFIG_ERROR, localLoad } = authStorage;

  const handleSignIn = async () => {
    await authStorage.handleSignIn({ authEmail, authPassword, setAuthError, setAuthSession });
  };

  const handleSignUp = async () => {
    await authStorage.handleSignUp({ authEmail, authPassword, setAuthError, setAuthSession });
  };

  const handleSignOut = async () => {
    await authStorage.handleSignOut({ authSession, setAuthSession, setStorageStatus });
  };

  const buildPersistedPersonalization = (draftPersonalization = personalization, draftGoals = goals) => {
    const canonicalForPersist = deriveCanonicalAthleteState({
      goals: draftGoals,
      personalization: draftPersonalization,
      profileDefaults: PROFILE,
    });
    return withLegacyGoalProfileCompatibility({
      personalization: draftPersonalization,
      canonicalAthlete: canonicalForPersist,
    });
  };

  const applyCanonicalRuntimeState = (runtimeState) => {
    applyCanonicalRuntimeStateSetters({
      runtimeState,
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
        setPlannedDayRecords,
        setWeeklyCheckins,
        setNutritionFavorites,
        setNutritionActualLogs,
      },
    });
  };

  const persistAll = async (newLogs, newBW, newOvr, newNotes, newAlerts, newPersonalization = personalization, newCoachActions = coachActions, newCoachPlanAdjustments = coachPlanAdjustments, newGoals = goals, newDailyCheckins = dailyCheckins, newWeeklyCheckins = weeklyCheckins, newNutritionFavorites = nutritionFavorites, newNutritionActualLogs = nutritionActualLogs, newPlannedDayRecords = plannedDayRecords) => {
    const normalizedGoalPayload = normalizeGoals(newGoals || []);
    const runtimeState = buildCanonicalRuntimeState({
      logs: newLogs,
      bodyweights: newBW,
      paceOverrides: newOvr,
      weekNotes: newNotes,
      planAlerts: newAlerts,
      personalization: newPersonalization,
      goals: normalizedGoalPayload,
      coachActions: newCoachActions,
      coachPlanAdjustments: newCoachPlanAdjustments,
      dailyCheckins: newDailyCheckins,
      plannedDayRecords: newPlannedDayRecords,
      weeklyCheckins: newWeeklyCheckins,
      nutritionFavorites: newNutritionFavorites,
      nutritionActualLogs: newNutritionActualLogs,
    });
    validateCanonicalRuntimeStateInvariant(runtimeState, "persistAll.buildCanonicalRuntimeState");
    const payload = buildPersistedTrainerPayload({
      runtimeState,
      transformPersonalization: (draftPersonalization) => buildPersistedPersonalization(draftPersonalization, normalizedGoalPayload),
    });
    if (authSession?.user?.id) markLocalMutation();
    await authStorage.persistAll({ payload, authSession, setStorageStatus, setAuthSession });
  };

  const sbLoad = async () => {
    await authStorage.sbLoad({
      authSession,
      setAuthSession,
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
        setPlannedDayRecords,
        setWeeklyCheckins,
        setNutritionFavorites,
        setNutritionActualLogs,
      },
      persistAll,
    });
  };

  const markLocalMutation = () => {
    lastLocalMutationAtRef.current = Date.now();
  };

  const isRecentLocalMutation = () => (Date.now() - Number(lastLocalMutationAtRef.current || 0)) < 1800;

  const scheduleRealtimeResync = (reason = "realtime_change") => {
    if (authInitializing || !authSessionRef.current?.user?.id) return;
    if (realtimeResyncTimerRef.current) clearTimeout(realtimeResyncTimerRef.current);
    realtimeResyncTimerRef.current = setTimeout(async () => {
      try {
        skipNextGoalsPersistRef.current = true;
        await (sbLoadRef.current?.() || Promise.resolve());
        setStorageStatus(buildStorageStatus({ mode: "cloud", label: "SYNCED", reason: STORAGE_STATUS_REASONS.synced, detail: "Cloud sync is working normally." }));
        logDiagRef.current?.("realtime.resync.ok", reason);
      } catch (e) {
        skipNextGoalsPersistRef.current = false;
        logDiagRef.current?.("realtime.resync.failed", reason, e?.message || "unknown");
      }
    }, 250);
  };

  const getPlannedDayHistoryForDate = (dateKey, logEntry = null) => {
    if (!dateKey) return null;
    const existingEntry = normalizePrescribedDayHistoryEntry(dateKey, plannedDayRecords?.[dateKey] || null);
    if (existingEntry) return existingEntry;
    if (dateKey === todayKey && todayPlannedDayRecord) {
      return createPrescribedDayHistoryEntry({
        plannedDayRecord: todayPlannedDayRecord,
        capturedAt: getStableCaptureAtForDate(dateKey),
        sourceType: "plan_day_engine",
        durability: PRESCRIBED_DAY_DURABILITY.durable,
        reason: "today_plan_capture",
        validateInvariant: validatePrescribedDayHistoryInvariant,
      });
    }
    const legacySnapshot = buildLegacyPlannedDayRecordFromSnapshot({ dateKey, snapshot: logEntry?.prescribedPlanSnapshot || null });
    if (legacySnapshot) {
      return createPrescribedDayHistoryEntry({
        plannedDayRecord: legacySnapshot,
        capturedAt: logEntry?.ts || getStableCaptureAtForDate(dateKey),
        sourceType: "legacy_log_snapshot",
        durability: PRESCRIBED_DAY_DURABILITY.legacyBackfill,
        reason: "legacy_snapshot_backfill",
        validateInvariant: validatePrescribedDayHistoryInvariant,
      });
    }
    const hasHistoricalNeed = Boolean(
      logEntry
      || dailyCheckins?.[dateKey]
      || nutritionActualLogs?.[dateKey]
    );
    if (!hasHistoricalNeed) return null;
    const dateObj = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(dateObj.getTime())) return null;
    const week = resolvePlanWeekNumberForDateKey({
      dateKey,
      planStartDate: canonicalGoalState?.planStartDate || "",
      fallbackStartDate: PROFILE.startDate,
    });
    const workout = getTodayWorkout(week, dateObj.getDay());
    const fallbackRecord = buildLegacyPlannedDayRecordFromWorkout({ dateKey, weekNumber: week, workout });
    if (!fallbackRecord) return null;
    return createPrescribedDayHistoryEntry({
      plannedDayRecord: fallbackRecord,
      capturedAt: getStableCaptureAtForDate(dateKey),
      sourceType: "legacy_schedule_helper",
      durability: PRESCRIBED_DAY_DURABILITY.fallbackDerived,
      reason: "schedule_backfill",
      validateInvariant: validatePrescribedDayHistoryInvariant,
    });
  };

  const getPlannedDayRecordForDate = (dateKey, logEntry = null) => getCurrentPrescribedDayRecord(
    getPlannedDayHistoryForDate(dateKey, logEntry)
  );

  const decorateLogEntryWithPlanContext = ({ dateKey, entry = null, dailyCheckin = {} } = {}) => {
    if (!dateKey || !entry) return entry;
    const exercisePerformance = getExercisePerformanceRecordsForLog(entry || {}, { dateKey });
    const plannedDayHistory = getPlannedDayHistoryForDate(dateKey, entry);
    const plannedDayRecord = getCurrentPrescribedDayRecord(plannedDayHistory);
    const shouldIgnoreDailyOutcome = !entry?.actualSession?.status && !entry?.checkin?.status && (
      Number(entry?.miles || 0) > 0
      || Number(entry?.runTime || 0) > 0
      || exercisePerformance.length > 0
      || Boolean(String(entry?.type || "").trim())
    );
    const comparisonDailyCheckin = shouldIgnoreDailyOutcome
      ? { ...(dailyCheckin || {}), status: "not_logged" }
      : dailyCheckin;
    const comparison = comparePlannedDayToActual({
      plannedDayRecord,
      actualLog: entry,
      dailyCheckin: comparisonDailyCheckin,
      dateKey,
    });
    const legacyStatus = comparison.completionKind === "as_prescribed"
      ? "completed_as_planned"
      : comparison.completionKind === "modified" || comparison.completionKind === "custom_session"
      ? "completed_modified"
      : comparison.completionKind === "skipped"
      ? "skipped"
      : (entry?.checkin?.status || "");
    const actualStatus = legacyStatus || comparison.status;
    const sessionType = String(entry?.actualSession?.sessionType || entry?.type || "").trim();
    const sessionLabel = String(entry?.actualSession?.sessionLabel || entry?.type || entry?.label || sessionType || "Session").trim();
    return normalizeLogPerformanceState({
      dateKey,
      logEntry: {
      ...entry,
      planDayId: entry?.planDayId || plannedDayRecord?.id || "",
      planReference: buildPlanReference(plannedDayHistory || plannedDayRecord) || entry?.planReference || null,
      prescribedPlanSnapshot: entry?.prescribedPlanSnapshot || buildLegacyPlanSnapshot(plannedDayHistory || plannedDayRecord),
      actualSession: {
        ...(entry?.actualSession || {}),
        status: actualStatus,
        completionKind: comparison.completionKind,
        sessionType,
        sessionLabel,
        customSession: Boolean(comparison.customSession),
        modifiedFromPlan: comparison.differenceKind !== "none" && comparison.differenceKind !== "pending" && comparison.differenceKind !== "unknown",
        loggedAt: entry?.actualSession?.loggedAt || entry?.editedAt || entry?.ts || Date.now(),
      },
      comparison,
      checkin: {
        ...(entry?.checkin || {}),
        ...(legacyStatus ? { status: legacyStatus } : {}),
        ...(dailyCheckin?.sessionFeel ? { sessionFeel: dailyCheckin.sessionFeel } : {}),
        ...(dailyCheckin?.blocker ? { blocker: dailyCheckin.blocker } : {}),
        ...(dailyCheckin?.note ? { note: dailyCheckin.note } : {}),
        ...(entry?.feel ? { feelRating: String(entry.feel) } : {}),
        ts: Date.now(),
      },
      ts: Date.now(),
      },
    });
  };

  const buildRealtimeLogEntry = (row = {}, existing = {}) => {
    const dateKey = String(row?.date || existing?.date || "").split("T")[0];
    const exercises = Array.isArray(row?.exercises) ? row.exercises : (existing?.strengthPerformance || []);
    const feelRating = row?.feel_rating ?? existing?.feel ?? existing?.checkin?.feelRating ?? "3";
    const inferredType = existing?.type
      || exercises?.[0]?.exercise
      || (Number(row?.distance_mi || 0) > 0 ? "Run" : "")
      || "Logged session";
    const completionStatus = row?.completion_status || existing?.actualSession?.status || existing?.checkin?.status || "";
    return normalizeLogPerformanceState({
      dateKey,
      logEntry: {
      ...existing,
      date: dateKey,
      type: inferredType,
      miles: row?.distance_mi ?? existing?.miles ?? "",
      runTime: row?.duration_min ?? existing?.runTime ?? "",
      feel: String(feelRating || "3"),
      notes: row?.note ?? existing?.notes ?? "",
      strengthPerformance: exercises,
      healthMetrics: row?.avg_hr ? { ...(existing?.healthMetrics || {}), avgHr: Number(row.avg_hr) } : (existing?.healthMetrics || null),
      actualSession: {
        ...(existing?.actualSession || {}),
        ...(completionStatus ? { status: completionStatus } : {}),
        sessionType: existing?.actualSession?.sessionType || inferredType,
        sessionLabel: existing?.actualSession?.sessionLabel || inferredType,
        loggedAt: existing?.actualSession?.loggedAt || Date.now(),
      },
      checkin: {
        ...(existing?.checkin || {}),
        ...(completionStatus ? { status: completionStatus } : {}),
        ts: Date.now(),
      },
      ts: Date.now(),
      syncedFromRealtime: true,
      },
    });
  };

  useEffect(() => {
    if (loading) return;
    const relevantDateKeys = Array.from(new Set([
      todayKey,
      ...Object.keys(logs || {}),
      ...Object.keys(dailyCheckins || {}),
      ...Object.keys(nutritionActualLogs || {}),
      ...Object.keys(plannedDayRecords || {}),
    ].filter(Boolean))).sort((a, b) => a.localeCompare(b));
    let changed = false;
    const nextPlannedDayRecords = { ...(plannedDayRecords || {}) };

    relevantDateKeys.forEach((dateKey) => {
      const existingEntry = nextPlannedDayRecords?.[dateKey] || null;
      const normalizedExisting = normalizePrescribedDayHistoryEntry(dateKey, existingEntry);
      const hadExisting = Boolean(existingEntry);
      if (normalizedExisting && JSON.stringify(normalizedExisting) !== JSON.stringify(existingEntry || null)) {
        nextPlannedDayRecords[dateKey] = normalizedExisting;
        changed = true;
      }
      if (dateKey === todayKey && todayPlannedDayRecord) {
        const currentHistoryEntry = nextPlannedDayRecords?.[dateKey] || normalizedExisting;
        const { nextEntry, changed: revisionChanged } = upsertPrescribedDayHistoryEntry({
          dateKey,
          existingEntry: currentHistoryEntry,
          plannedDayRecord: todayPlannedDayRecord,
          capturedAt: currentHistoryEntry ? Date.now() : getStableCaptureAtForDate(dateKey),
          sourceType: "plan_day_engine",
          durability: PRESCRIBED_DAY_DURABILITY.durable,
          reason: currentHistoryEntry
            ? (todayPlannedDayRecord?.decision?.modifiedFromBase ? "same_day_adjustment" : "daily_decision_refresh")
            : "daily_decision_capture",
          validateInvariant: validatePrescribedDayHistoryInvariant,
        });
        if (nextEntry && JSON.stringify(nextEntry) !== JSON.stringify(nextPlannedDayRecords?.[dateKey] || null)) {
          nextPlannedDayRecords[dateKey] = nextEntry;
          changed = true;
        } else if (revisionChanged && !hadExisting) {
          changed = true;
        }
        return;
      }
      if (nextPlannedDayRecords?.[dateKey]) return;
      const backfilledEntry = getPlannedDayHistoryForDate(dateKey, logs?.[dateKey] || null);
      if (backfilledEntry) {
        nextPlannedDayRecords[dateKey] = backfilledEntry;
        changed = true;
      }
    });

    if (!changed) return;
    setPlannedDayRecords(nextPlannedDayRecords);
    persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs, nextPlannedDayRecords);
  }, [
    loading,
    todayKey,
    todayPlannedDayRecord,
    plannedDayRecords,
    logs,
    dailyCheckins,
    nutritionActualLogs,
    bodyweights,
    paceOverrides,
    weekNotes,
    planAlerts,
    personalization,
    coachActions,
    coachPlanAdjustments,
    goals,
    weeklyCheckins,
    nutritionFavorites,
  ]);

  const syncSessionLogShadowRow = async (dateKey, entry = null) => {
    if (!authSession?.user?.id || !dateKey) return;
    try {
      await authStorage.syncSessionLogForDate({ dateKey, entry, authSession, setAuthSession });
    } catch (e) {
      logDiag("session_logs sync failed", e?.message || "unknown");
    }
  };

  useEffect(() => {
    authSessionRef.current = authSession;
  }, [authSession]);

  useEffect(() => {
    sbLoadRef.current = sbLoad;
  }, [sbLoad]);

  useEffect(() => {
    logDiagRef.current = logDiag;
  }, [logDiag]);

  useEffect(() => {
    console.log("[supabase] resolved URL:", SB_URL || "(missing)");
    if (SB_CONFIG_ERROR) {
      setAuthError(`Cloud sync provider unavailable: ${SB_CONFIG_ERROR}`);
      setStorageStatus(buildStorageStatus({
        mode: "local",
        label: "PROVIDER ERROR",
        reason: STORAGE_STATUS_REASONS.providerUnavailable,
        detail: "Cloud sync provider is unavailable or misconfigured.",
      }));
      setAuthInitializing(false);
      setLoading(false);
      return;
    }
    (async () => {
      const restored = authStorage.loadAuthSession();
      if (restored) {
        const ensured = await authStorage.ensureValidSession(restored, { reason: "app_boot" });
        if (ensured?.session?.user?.id) {
          setAuthSession(ensured.session);
          authStorage.saveAuthSession(ensured.session);
          logDiag("auth.boot.restored", ensured.status);
        } else if (ensured?.status === "refresh_failed" || ensured?.status === "refresh_missing" || ensured?.status === "missing") {
          setAuthSession(null);
          authStorage.saveAuthSession(null);
          setAuthError("Session expired. Please sign in again.");
          logDiag("auth.boot.expired", ensured?.status);
        } else {
          logDiag("auth.boot.transient_or_unknown", ensured?.status);
        }
      }
      setAuthInitializing(false);
      setLoading(false);
    })();
  }, [SB_URL, SB_CONFIG_ERROR, authStorage]);

  useEffect(() => {
    if (authInitializing || !authSession?.user?.id) return;
    (async () => {
      setLoading(true);
      try {
        await sbLoad();
        setAuthError("");
        setStorageStatus(buildStorageStatus({ mode: "cloud", label: "SYNCED", reason: STORAGE_STATUS_REASONS.synced, detail: "Cloud sync is working normally." }));
      } catch(e) {
        logDiag("Cloud load failed:", e.message);
        const nextStatus = classifyStorageError(e);
        if (e?.message === "AUTH_REQUIRED") {
          setAuthError("Session expired. Please sign in again.");
          setAuthSession(null);
          authStorage.saveAuthSession(null);
        } else {
          setAuthError("");
        }
        const cache = localLoad();
        if (cache) {
          try {
            const cachedRuntimeState = buildCanonicalRuntimeStateFromStorage({
              storedPayload: cache,
              mergePersonalization,
              DEFAULT_PERSONALIZATION,
              normalizeGoals,
              DEFAULT_MULTI_GOALS,
            });
            validateCanonicalRuntimeStateInvariant(cachedRuntimeState, "buildCanonicalRuntimeStateFromStorage.cache");
            applyCanonicalRuntimeState(cachedRuntimeState);
          } catch (cacheErr) {
            logDiag("local cache import fallback failed", cacheErr?.message || "unknown");
          }
        }
        setStorageStatus(nextStatus);
      }
      setLoading(false);
    })();
  }, [authSession?.user?.id, authInitializing]);

  useEffect(() => {
    if (authInitializing || !authSession?.user?.id) return;
    let cancelled = false;
    const heartbeat = async () => {
      const ensured = await authStorage.ensureValidSession(authSession, { reason: "heartbeat" });
      if (cancelled) return;
      if (ensured?.session?.access_token && ensured.session.access_token !== authSession?.access_token) {
        setAuthSession(ensured.session);
        authStorage.saveAuthSession(ensured.session);
      }
      // Never force logout from heartbeat checks. Safari pinch/text zoom can trigger
      // transient focus/visibility churn, so auth expiration should only be enforced
      // from explicit auth-required API failures.
      if (!ensured?.session && (ensured?.status === "refresh_failed" || ensured?.status === "refresh_missing")) {
        logDiag("auth.heartbeat.refresh_unavailable", ensured?.status);
      }
    };
    const id = setInterval(heartbeat, 60000);
    return () => { cancelled = true; clearInterval(id); };
  }, [authInitializing, authSession?.user?.id, authSession?.access_token, authSession?.refresh_token]);

  useEffect(() => {
    if (!authSession?.access_token) return;
    authStorage.saveAuthSession(authSession);
  }, [authSession?.access_token, authSession?.refresh_token, authSession?.user?.id]);

  useEffect(() => {
    if (authInitializing || !authSession?.user?.id || !authSession?.access_token || !SB_URL || !SB_KEY || typeof createClient !== "function") return;
    const userId = authSession.user.id;
    const client = createClient(SB_URL, SB_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
    realtimeClientRef.current = client;
    try {
      client.realtime.setAuth(authSession.access_token);
    } catch (e) {
      logDiag("realtime.auth.failed", e?.message || "unknown");
    }

    const handleSessionLogChange = (payload) => {
      const row = payload?.eventType === "DELETE" ? payload?.old : payload?.new;
      const dateKey = String(row?.date || "").split("T")[0];
      if (!dateKey) {
        scheduleRealtimeResync("session_logs_missing_date");
        return;
      }
      setLogs((prev) => {
        const next = { ...(prev || {}) };
        if (payload?.eventType === "DELETE") {
          delete next[dateKey];
          return next;
        }
        next[dateKey] = buildRealtimeLogEntry(row, next[dateKey] || {});
        return next;
      });
    };

    const handleGoalChange = () => {
      if (isRecentLocalMutation()) return;
      scheduleRealtimeResync("goals_change");
    };

    const handleCoachMemoryChange = () => {
      if (isRecentLocalMutation()) return;
      scheduleRealtimeResync("coach_memory_change");
    };

    const handleTrainerDataChange = () => {
      if (isRecentLocalMutation()) return;
      scheduleRealtimeResync("trainer_data_change");
    };

    const channel = client.channel(`user-data:${userId}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "session_logs",
        filter: `user_id=eq.${userId}`,
      }, handleSessionLogChange)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "goals",
        filter: `user_id=eq.${userId}`,
      }, handleGoalChange)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "coach_memory",
        filter: `user_id=eq.${userId}`,
      }, handleCoachMemoryChange)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "trainer_data",
        filter: `user_id=eq.${userId}`,
      }, handleTrainerDataChange);

    realtimeChannelRef.current = channel;
    channel.subscribe((status) => {
      logDiag("realtime.status", status);
      if (status === "SUBSCRIBED") {
        if (realtimeInterruptedRef.current) {
          realtimeInterruptedRef.current = false;
          scheduleRealtimeResync("realtime_reconnected");
        }
        return;
      }
      if (["CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(status)) {
        realtimeInterruptedRef.current = true;
      }
    });

    const handleOnline = () => {
      if (!authSessionRef.current?.user?.id) return;
      scheduleRealtimeResync("browser_online");
    };
    window.addEventListener("online", handleOnline);

    return () => {
      window.removeEventListener("online", handleOnline);
      if (realtimeResyncTimerRef.current) clearTimeout(realtimeResyncTimerRef.current);
      realtimeInterruptedRef.current = false;
      try { channel.unsubscribe(); } catch {}
      try { client.removeChannel(channel); } catch {}
      if (realtimeChannelRef.current === channel) realtimeChannelRef.current = null;
      if (realtimeClientRef.current === client) realtimeClientRef.current = null;
    };
  }, [authInitializing, authSession?.user?.id, authSession?.access_token, SB_URL, SB_KEY]);

  useEffect(() => {
    if (loading || historyRelabelAppliedRef.current) return;
    const { nextLogs, changed } = relabelRecentLogs(logs);
    historyRelabelAppliedRef.current = true;
    if (changed <= 0) return;
    setLogs(nextLogs);
    persistAll(nextLogs, bodyweights, paceOverrides, weekNotes, planAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
  }, [loading, logs]);

  useEffect(() => {
    if (skipNextGoalsPersistRef.current) {
      skipNextGoalsPersistRef.current = false;
      return;
    }
    if (!loading) persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
  }, [goals]);

  useEffect(() => {
    if (loading || typeof window === "undefined" || typeof Notification === "undefined") return;
    const now = new Date();
    const checkinDayMap = { Sun: 0, Mon: 1, Sat: 6 };
    const targetDow = checkinDayMap[personalization?.settings?.trainingPreferences?.weeklyCheckinDay || "Sun"] ?? 0;
    if (now.getDay() !== targetDow) return;
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
      await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, updated, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
    })();
  }, [loading, currentWeek, personalization?.coachMemory?.lastSundayPushWeek]);

  const saveLogs = async (newLogs, options = {}) => {
    const changedDateKey = String(options?.changedDateKey || "").trim();
    const nextLogs = { ...(newLogs || {}) };
    if (changedDateKey && nextLogs?.[changedDateKey]) {
      nextLogs[changedDateKey] = normalizeLogPerformanceState({
        dateKey: changedDateKey,
        logEntry: decorateLogEntryWithPlanContext({
          dateKey: changedDateKey,
          entry: nextLogs[changedDateKey],
          dailyCheckin: dailyCheckins?.[changedDateKey] || {},
        }),
      });
    }
    setLogs(nextLogs);
    const derivedBase = derivePersonalization(nextLogs, bodyweights, personalization);
    const m = getMomentumEngineState({ logs: nextLogs, bodyweights, personalization: derivedBase });
    let derived = mergePersonalization(derivedBase, { profile: { ...derivedBase.profile, inconsistencyRisk: m.inconsistencyRisk, currentMomentumState: m.momentumState, likelyAdherencePattern: m.likelyAdherencePattern } });
    const changedLog = changedDateKey ? nextLogs?.[changedDateKey] : null;
    const changedExerciseRecords = changedDateKey ? getExercisePerformanceRecordsForLog(changedLog || {}, { dateKey: changedDateKey }) : [];
    if (changedDateKey) await syncExercisePerformanceRows(changedDateKey, changedLog || null);
    if (changedDateKey && changedExerciseRecords.length > 0) {
      const currentPhase = getPhaseForDateKey(changedDateKey, canonicalGoalState?.planStartDate || "");
      derived = await applyStrengthProgressionForLog({
        dateKey: changedDateKey,
        nextLogs,
        linkedLog: changedLog,
        basePersonalization: derived,
        currentPhase,
        shouldSync: false,
      });
    }
    setPersonalization(derived);
    try {
      await persistAll(nextLogs, bodyweights, paceOverrides, weekNotes, planAlerts, derived, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
      if (changedDateKey) await syncSessionLogShadowRow(changedDateKey, changedLog || null);
      setLastSaved(new Date().toLocaleTimeString());
    } catch(e) { logDiag("saveLogs fallback", e.message); setStorageStatus(classifyStorageError(e)); }
    analyzePlan(nextLogs);
  };

  const saveBodyweights = async (arr) => {
    setBodyweights(arr);
    const derivedBase = derivePersonalization(logs, arr, personalization);
    const m = getMomentumEngineState({ logs, bodyweights: arr, personalization: derivedBase });
    const derived = mergePersonalization(derivedBase, { profile: { ...derivedBase.profile, inconsistencyRisk: m.inconsistencyRisk, currentMomentumState: m.momentumState, likelyAdherencePattern: m.likelyAdherencePattern } });
    setPersonalization(derived);
    try {
      await persistAll(logs, arr, paceOverrides, weekNotes, planAlerts, derived, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
      setLastSaved(new Date().toLocaleTimeString());
    } catch(e) { logDiag("saveBodyweights fallback", e.message); setStorageStatus(classifyStorageError(e)); }
  };

  const savePlanState = async (newOvr, newNotes, newAlerts) => {
    try { await persistAll(logs, bodyweights, newOvr, newNotes, newAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs); } catch(e) {}
  };

  const syncExercisePerformanceRows = async (dateKey, logEntryOrPerformance = null) => {
    const exerciseRecords = Array.isArray(logEntryOrPerformance) && logEntryOrPerformance.some((record) => record?.scope === "exercise")
      ? logEntryOrPerformance.filter((record) => record?.scope === "exercise")
      : Array.isArray(logEntryOrPerformance)
      ? getExercisePerformanceRecordsForLog({ strengthPerformance: logEntryOrPerformance || [] }, { dateKey })
      : getExercisePerformanceRecordsForLog(logEntryOrPerformance || {}, { dateKey });
    const rows = buildExercisePerformanceRowsForStorage(dateKey, exerciseRecords);
    if (!authSession?.user?.id) return rows;
    try {
      await authStorage.syncExercisePerformanceForDate({ dateKey, rows, authSession, setAuthSession });
    } catch (e) {
      logDiag("exercise_performance sync failed", e?.message || "unknown");
    }
    return rows;
  };

  const buildStrengthAdjustmentNotification = async (update, tomorrowKey, currentPhase) => {
    const isUp = /increase|add/.test(String(update?.ruleTriggered || ""));
    const isDown = /decrease/.test(String(update?.ruleTriggered || ""));
    const icon = isUp ? "Ã¢â€ â€˜" : isDown ? "Ã¢â€ â€œ" : "Ã¢â€ â€™";
    const summary = `${icon} ${update.exercise}: ${update.oldValue} Ã¢â€ â€™ ${update.newValue} today`;
    const coachPrompt = `Exercise: ${update.exercise}
Change: ${update.oldValue} -> ${update.newValue}
Reason: ${String(update.ruleTriggered || "progressive_overload").replaceAll("_", " ")}
Write one sentence a coach would say. Under 12 words. Specific. No praise language.`;
    const explainPrompt = `Explain this strength adjustment in 2-3 sentences.
Exercise: ${update.exercise}
Change: ${update.oldValue} -> ${update.newValue}
Rule: ${String(update.ruleTriggered || "progressive_overload").replaceAll("_", " ")}
Phase: ${currentPhase}
Keep it plain and specific.`;
    const coachLineRaw = await callAnthropic({ system: "You write concise training adjustment lines.", user: coachPrompt, maxTokens: 60 });
    const explanationRaw = await callAnthropic({ system: "You explain deterministic strength progression decisions clearly.", user: explainPrompt, maxTokens: 140 });
    const oldProxy = update.mode === "band"
      ? BAND_TENSION_LEVELS.findIndex((level) => level === update.oldBandTension)
      : update.mode === "bodyweight"
      ? ((Number(update.oldSets || 0) * 100) + Number(update.oldReps || 0))
      : update.oldWeight;
    const newProxy = update.mode === "band"
      ? BAND_TENSION_LEVELS.findIndex((level) => level === update.newBandTension)
      : update.mode === "bodyweight"
      ? ((Number(update.newSets || 0) * 100) + Number(update.newReps || 0))
      : update.newWeight;
    return {
      id: `strength_${tomorrowKey}_${update.exKey}_${Date.now()}`,
      exercise: update.exercise,
      icon,
      summary,
      inlineNote: summary,
      note: `${update.exercise}: ${update.oldValue} Ã¢â€ â€™ ${update.newValue} today`,
      coachLine: (coachLineRaw || "").trim().split("\n")[0] || `${update.exercise} moves ${update.oldValue} to ${update.newValue}.`,
      explanation: (explanationRaw || "").trim() || `${update.exercise} changed from ${update.oldValue} to ${update.newValue} because the last two sessions matched the engine rule ${String(update.ruleTriggered || "progressive_overload").replaceAll("_", " ")}.`,
      reason: update.ruleTriggered,
      oldValue: update.oldValue,
      newValue: update.newValue,
      oldWeight: oldProxy,
      newWeight: newProxy,
      oldBandTension: update.oldBandTension,
      newBandTension: update.newBandTension,
      oldSets: update.oldSets,
      newSets: update.newSets,
      oldReps: update.oldReps,
      newReps: update.newReps,
      mode: update.mode,
    };
  };

  const applyStrengthProgressionForLog = async ({ dateKey, nextLogs, linkedLog, basePersonalization, currentPhase, shouldSync = true }) => {
    const performanceRecords = getExercisePerformanceRecordsForLog(linkedLog || {}, { dateKey });
    if (shouldSync) await syncExercisePerformanceRows(dateKey, linkedLog || null);
    if (performanceRecords.length === 0) return basePersonalization;

    const { updates, nextPrescriptions, nextTracking } = deriveProgressiveOverloadAdjustmentsV2({
      logs: nextLogs,
      performance: performanceRecords,
      personalization: basePersonalization,
      currentPhase,
      goals,
      goalState: canonicalGoalState,
      sessionDateKey: dateKey,
    });

    const tomorrow = new Date(`${dateKey}T12:00:00`);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowKey = toDateKey(tomorrow);
    const existingQueue = normalizePendingStrengthAdjustments(basePersonalization?.strengthProgression?.pendingByDate?.[tomorrowKey]);
    const builtQueue = [];
    for (const update of updates) {
      builtQueue.push(await buildStrengthAdjustmentNotification(update, tomorrowKey, currentPhase));
    }

    const nextStrengthProgression = {
      ...(basePersonalization?.strengthProgression || {}),
      prescriptions: nextPrescriptions,
      tracking: nextTracking,
      pendingByDate: {
        ...(basePersonalization?.strengthProgression?.pendingByDate || {}),
        [tomorrowKey]: [...builtQueue, ...existingQueue.filter((item) => !builtQueue.some((nextItem) => nextItem?.exercise === item?.exercise))].slice(0, 12),
      },
    };

    return mergePersonalization(basePersonalization, { strengthProgression: nextStrengthProgression });
  };

  const saveDailyCheckin = async (dateKey, checkin) => {
    const merged = { ...DEFAULT_DAILY_CHECKIN, ...(checkin || {}) };
    const plannedDayHistory = getPlannedDayHistoryForDate(dateKey, logs?.[dateKey] || null);
    const plannedDayRecord = getCurrentPrescribedDayRecord(plannedDayHistory);
    const nextDailyEntry = {
      ...merged,
      planReference: buildPlanReference(plannedDayHistory || plannedDayRecord),
      actualRecovery: {
        status: merged.status || "not_logged",
        sessionFeel: merged.sessionFeel || "",
        blocker: merged.blocker || "",
        note: merged.note || "",
        bodyweight: merged.bodyweight || "",
        readiness: cloneStructuredValue(merged.readiness || {}),
        loggedAt: Date.now(),
      },
      ts: Date.now(),
    };
    const nextDaily = { ...dailyCheckins, [dateKey]: nextDailyEntry };
    const feelMap = { easier_than_expected: "4", about_right: "3", harder_than_expected: "2" };
    const plannedTraining = plannedDayRecord?.resolved?.training || todayWorkout || {};
    const existingLog = logs[dateKey] || null;
    const baseLog = existingLog || {
      date: dateKey,
      type: plannedTraining?.label || plannedTraining?.type || "Planned Session",
      location: personalization.travelState.environmentMode === "travel" ? "hotel" : "home",
      miles: "",
      pace: "",
      pushups: "",
      notes: "",
    };
    const matchedGarminRun = matchGarminRunActivity({
      garminActivities: personalization?.connectedDevices?.garmin?.activities || [],
      dateKey,
      log: baseLog,
    });
    const hasStrengthPerformance = Array.isArray(merged?.strengthPerformance) && merged.strengthPerformance.length > 0;
    const actualOutcomeLogged = Boolean(merged?.status && merged.status !== "not_logged");
    const shouldMaterializeLog = Boolean(existingLog || actualOutcomeLogged || hasStrengthPerformance);
    let linkedLog = existingLog;
    let nextLogs = logs;
    if (shouldMaterializeLog) {
      linkedLog = normalizeLogPerformanceState({
        dateKey,
        logEntry: decorateLogEntryWithPlanContext({
          dateKey,
          entry: {
            ...baseLog,
            miles: matchedGarminRun?.distanceMiles ? String(Number(matchedGarminRun.distanceMiles).toFixed(2)) : (baseLog?.miles || ""),
            pace: matchedGarminRun?.pace ? String(matchedGarminRun.pace) : (baseLog?.pace || ""),
            runTime: matchedGarminRun?.durationMin ? String(Math.round(Number(matchedGarminRun.durationMin))) : (baseLog?.runTime || ""),
            feel: baseLog.feel || feelMap[merged.sessionFeel] || "3",
            notes: merged.note ? (baseLog.notes ? `${baseLog.notes} | ${merged.note}` : merged.note) : baseLog.notes,
            strengthPerformance: hasStrengthPerformance ? merged.strengthPerformance : (baseLog?.strengthPerformance || []),
            healthMetrics: (() => {
              const workout = matchedGarminRun
                ? { avgHr: matchedGarminRun?.avgHr, maxHr: matchedGarminRun?.maxHr, calories: matchedGarminRun?.calories, paceSeconds: matchedGarminRun?.paceSeconds, source: "garmin" }
                : (personalization?.connectedDevices?.appleHealth?.workouts?.[dateKey] || {});
              const isRun = /run/.test(String(baseLog?.type || plannedTraining?.type || "").toLowerCase());
              if (!isRun) return baseLog?.healthMetrics || null;
              return deriveRunHealthMetrics({ workout, log: baseLog });
            })(),
            actualSession: {
              ...(baseLog?.actualSession || {}),
              ...(actualOutcomeLogged ? { status: merged.status } : {}),
              sessionType: baseLog?.actualSession?.sessionType || baseLog?.type || plannedTraining?.label || "Logged session",
              sessionLabel: baseLog?.actualSession?.sessionLabel || baseLog?.type || plannedTraining?.label || "Logged session",
            },
            ts: Date.now(),
          },
          dailyCheckin: nextDailyEntry,
        }),
      });
      nextLogs = { ...logs, [dateKey]: linkedLog };
    }
    let nextPersonalization = personalization;
    const strengthPerformanceRecords = getExercisePerformanceRecordsForLog(linkedLog || {}, { dateKey });
    const isStrengthDay = ["run+strength", "strength+prehab"].includes(plannedTraining?.type || "") || strengthPerformanceRecords.length > 0;
    if (isStrengthDay && strengthPerformanceRecords.length > 0) {
      const currentPhase = plannedTraining?.week?.phase || todayWorkout?.week?.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
      nextPersonalization = await applyStrengthProgressionForLog({
        dateKey,
        nextLogs,
        linkedLog,
        basePersonalization: personalization,
        currentPhase,
      });
      if (false) {
      const { updates, nextPrescriptions, nextTracking } = deriveProgressiveOverloadAdjustments({
        logs: nextLogs,
        todayWorkout,
        checkin: merged,
        personalization,
        currentPhase,
        goals,
        goalState: canonicalGoalState,
      });
      if (updates.length > 0) {
        const tomorrow = new Date(`${dateKey}T12:00:00`);
        tomorrow.setDate(tomorrow.getDate() + 1);
        const tomorrowKey = toDateKey(tomorrow);
        const primary = updates[0];
        let oneLine = `${primary.exercise} adjusts ${primary.oldWeight}Ã¢â€ â€™${primary.newWeight} lbs tomorrow due to ${String(primary.ruleTriggered || "rule").replaceAll("_"," ")}.`;
        const aiPrompt = `The rules engine has determined this adjustment for tomorrow: ${primary.exercise} moves from ${primary.oldWeight} to ${primary.newWeight} because ${primary.ruleTriggered}. Write one sentence a coach would say mid-workout about this change. Under 15 words. Include specific numbers only. No encouragement language. No "great job." No "you've earned." Sound like you're standing next to them.`;
        const aiLine = await callAnthropic({ system: "You are a concise strength coach notification writer.", user: aiPrompt, maxTokens: 60 });
        if (aiLine) oneLine = aiLine.trim().split("\n")[0];
        let explain = `Rule trigger: ${primary.ruleTriggered.replaceAll("_"," ")}. Weight ${primary.oldWeight}Ã¢â€ â€™${primary.newWeight} lbs; sets ${primary.oldSets}Ã¢â€ â€™${primary.newSets}.`;
        const explainPrompt = `Explain in one short paragraph why ${primary.exercise} changed from ${primary.oldWeight} to ${primary.newWeight} lbs and sets ${primary.oldSets} to ${primary.newSets}. Include reps completion trend, feel trend, injury flag (${personalization?.injuryPainState?.level || "none"}), phase (${currentPhase}), and days to goal (${primary.daysToGoal ?? "unknown"}).`;
        const aiExplain = await callAnthropic({ system: "You explain deterministic training-rule outcomes in plain language.", user: explainPrompt, maxTokens: 150 });
        if (aiExplain) explain = aiExplain.trim();
        const nextStrengthProgression = {
          ...(personalization?.strengthProgression || {}),
          prescriptions: nextPrescriptions,
          tracking: nextTracking,
          pendingByDate: {
            ...(personalization?.strengthProgression?.pendingByDate || {}),
            [tomorrowKey]: {
              exercise: primary.exercise,
              inlineNote: `${primary.newWeight > primary.oldWeight ? "Ã¢â€ â€˜" : primary.newWeight < primary.oldWeight ? "Ã¢â€ â€œ" : "Ã¢â€ â€™"} ${primary.exercise}: ${primary.oldWeight} Ã¢â€ â€™ ${primary.newWeight} lbs today`,
              reason: primary.ruleTriggered,
              note: oneLine,
              explanation: explain,
              oldWeight: primary.oldWeight,
              newWeight: primary.newWeight,
            },
          },
          notifications: {
            ...(personalization?.strengthProgression?.notifications || {}),
            [tomorrowKey]: oneLine,
          },
          explanations: {
            ...(personalization?.strengthProgression?.explanations || {}),
            [tomorrowKey]: explain,
          },
        };
        nextPersonalization = mergePersonalization(personalization, { strengthProgression: nextStrengthProgression });
      }
      }
    }
    const nextFitnessSignals = deriveFitnessLayer({ logs: nextLogs, personalization: nextPersonalization });
    nextPersonalization = mergePersonalization(nextPersonalization, { fitnessSignals: nextFitnessSignals, profile: { ...nextPersonalization.profile, fitnessLevel: nextFitnessSignals.fitnessLevel } });
    const phaseNow = todayWorkout?.week?.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
    if (Number(nextFitnessSignals?.paceOffsetSec || 0) !== 0) {
      const parsePaceToSec = (p = "") => {
        const m = String(p || "").match(/(\d+):(\d+)/);
        return m ? (Number(m[1]) * 60) + Number(m[2]) : null;
      };
      const secToPace = (s = 0) => {
        const mm = Math.floor(s / 60);
        const ss = Math.round(s % 60);
        return `${mm}:${String(ss).padStart(2, "0")}`;
      };
      const baseEasy = getZones(phaseNow)?.easy || "";
      const easyStart = baseEasy.split("Ã¢â‚¬â€œ")[0] || baseEasy;
      const easySec = parsePaceToSec(easyStart);
      if (easySec) {
        const shifted = secToPace(clamp(easySec + Number(nextFitnessSignals.paceOffsetSec || 0), 360, 900));
        const nextOverrides = {
          ...paceOverrides,
          [phaseNow]: { ...(paceOverrides?.[phaseNow] || {}), easy: shifted },
        };
        setPaceOverrides(nextOverrides);
      }
    }
    setDailyCheckins(nextDaily);
    setLogs(nextLogs);
    setPersonalization(nextPersonalization);
    await persistAll(nextLogs, bodyweights, paceOverrides, weekNotes, planAlerts, nextPersonalization, coachActions, coachPlanAdjustments, goals, nextDaily, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
    if (linkedLog) await syncSessionLogShadowRow(dateKey, linkedLog);
  };

  const saveWeeklyCheckin = async (weekNum, checkin) => {
    const nextWeekly = { ...weeklyCheckins, [String(weekNum)]: { ...(checkin || {}), ts: Date.now() } };
    const nextAlerts = [{ id:`weekly_${Date.now()}`, type:"info", msg:"Weekly reflection saved Ã¢â‚¬â€ nice follow-through." }, ...planAlerts].slice(0, 12);
    setWeeklyCheckins(nextWeekly);
    setPlanAlerts(nextAlerts);
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, nextAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, nextWeekly, nutritionFavorites, nutritionActualLogs);
  };

  const saveNutritionFavorites = async (nextFavorites) => {
    setNutritionFavorites(nextFavorites);
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nextFavorites, nutritionActualLogs);
  };

  const saveNutritionActualLog = async (dateKey, feedback) => {
    const plannedDayHistory = getPlannedDayHistoryForDate(dateKey, logs?.[dateKey] || null);
    const plannedDayRecord = getCurrentPrescribedDayRecord(plannedDayHistory);
    const planReference = buildPlanReference(plannedDayHistory || plannedDayRecord);
    const actualNutrition = mergeActualNutritionLogUpdate({
      dateKey,
      previousLog: nutritionActualLogs?.[dateKey] || null,
      feedback,
      planReference,
    });
    validateActualNutritionLogInvariant(actualNutrition, dateKey, "saveNutritionActualLog.mergeActualNutritionLogUpdate");
    const nextActualLogs = {
      ...nutritionActualLogs,
      [dateKey]: actualNutrition,
    };
    setNutritionActualLogs(nextActualLogs);
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, personalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nextActualLogs);
  };

  useEffect(() => {
    if (loading || authInitializing) return;
    if (!personalization?.profile?.onboardingComplete) return;
    const apple = personalization?.connectedDevices?.appleHealth || {};
    if (apple?.permissionRequestedAt || apple?.skipped) return;
    setShowAppleHealthFirstLaunch(true);
  }, [loading, authInitializing, personalization?.profile?.onboardingComplete, personalization?.connectedDevices?.appleHealth?.permissionRequestedAt, personalization?.connectedDevices?.appleHealth?.skipped]);

  const updateAppleHealthState = async (patch = {}) => {
    const nextPersonalization = mergePersonalization(personalization, {
      connectedDevices: {
        ...(personalization?.connectedDevices || {}),
        appleHealth: { ...(personalization?.connectedDevices?.appleHealth || {}), ...(patch || {}) },
      },
    });
    setPersonalization(nextPersonalization);
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, nextPersonalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
  };

  const requestAppleHealthPermissions = async () => {
    let status = "connected";
    try {
      const handler = window?.webkit?.messageHandlers?.healthkit;
      if (handler?.postMessage) handler.postMessage({ type: "request_permissions", permissions: HEALTHKIT_PERMISSIONS });
      else status = "simulated_web";
    } catch {
      status = "simulated_web";
    }
    await updateAppleHealthState({
      status,
      permissionRequestedAt: Date.now(),
      permissionsGranted: [...HEALTHKIT_PERMISSIONS],
      skipped: false,
    });
    setShowAppleHealthFirstLaunch(false);
  };

  const applySundayPushAdjustments = async ({ energy = 3, stress = 3, blocker = "none" }) => {
    const clampedEnergy = Math.max(1, Math.min(5, Number(energy) || 3));
    const clampedStress = Math.max(1, Math.min(5, Number(stress) || 3));
    const cleanBlocker = String(blocker || "none").toLowerCase().trim() || "none";
    const confidence = Math.max(1, Math.min(5, Math.round((clampedEnergy + (6 - clampedStress)) / 2)));
    const appliedAt = Date.now();
    const nextWeekly = {
      ...weeklyCheckins,
      [String(currentWeek)]: {
        energy: clampedEnergy,
        stress: clampedStress,
        confidence,
        blocker: cleanBlocker,
        source: "sunday_push",
        ts: appliedAt,
        provenance: buildAdjustmentProvenance({
          actor: PROVENANCE_ACTORS.user,
          trigger: "sunday_push_checkin",
          mutationType: "weekly_checkin",
          revisionReason: `Sunday push check-in saved with blocker ${cleanBlocker}.`,
          sourceInputs: ["SundayPush", "weeklyCheckins"],
          timestamp: appliedAt,
          details: {
            week: currentWeek,
            blocker: cleanBlocker,
            energy: clampedEnergy,
            stress: clampedStress,
          },
        }),
      }
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
          extra: appendProvenanceSidecar(
            { ...(coachPlanAdjustments.extra || {}), sundayPushAppliedAt: appliedAt, sundayPushBlocker: cleanBlocker },
            "weekVolumeByWeek",
            String(currentWeek + 1),
            buildAdjustmentProvenance({
              actor: PROVENANCE_ACTORS.deterministicEngine,
              trigger: "sunday_push_checkin",
              mutationType: "weekly_volume_adjustment",
              revisionReason: "Next week volume capped from Sunday push recovery risk.",
              sourceInputs: ["weeklyCheckins", "SundayPush"],
              timestamp: appliedAt,
              details: {
                week: currentWeek + 1,
                blocker: cleanBlocker,
              },
            })
          ),
        }
      : coachPlanAdjustments;
    const nextAlerts = [{ id:`sunday_push_${Date.now()}`, type:"info", msg:"Weekly coach push check-in received. Plan updated silently." }, ...planAlerts].slice(0, 12);
    setWeeklyCheckins(nextWeekly);
    setPlanAlerts(nextAlerts);
    if (requiresDeload) setCoachPlanAdjustments(nextAdjustments);
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, nextAlerts, personalization, coachActions, nextAdjustments, goals, dailyCheckins, nextWeekly, nutritionFavorites, nutritionActualLogs);
  };

  const applyProactiveNudge = async (trigger) => {
    const dateKey = new Date().toISOString().split("T")[0];
    const appliedAt = Date.now();
    const nudgeProvenance = buildAdjustmentProvenance({
      actor: PROVENANCE_ACTORS.deterministicEngine,
      trigger: trigger?.id || trigger?.actionType || "proactive_nudge",
      mutationType: "proactive_adjustment",
      revisionReason: trigger?.msg || String(trigger?.actionType || "proactive_nudge").replaceAll("_", " "),
      sourceInputs: [
        "proactiveTriggers",
        trigger?.source || "coach_engine",
      ],
      confidence: trigger?.score >= 80 ? "high" : "medium",
      timestamp: appliedAt,
      details: {
        actionType: trigger?.actionType || "",
        score: Number(trigger?.score || 0) || null,
      },
    });
    let nextAdjustments = { ...coachPlanAdjustments, dayOverrides: { ...(coachPlanAdjustments.dayOverrides || {}) }, nutritionOverrides: { ...(coachPlanAdjustments.nutritionOverrides || {}) }, weekVolumePct: { ...(coachPlanAdjustments.weekVolumePct || {}) }, extra: { ...(coachPlanAdjustments.extra || {}) } };
    let nextPersonalization = personalization;
    let nextWeekNotes = { ...weekNotes };
    if (trigger.actionType === "REDUCE_WEEKLY_VOLUME") {
      nextAdjustments.weekVolumePct[currentWeek] = 100 - (trigger.payload?.pct || 10);
      nextAdjustments.extra = appendProvenanceSidecar(nextAdjustments.extra, "weekVolumeByWeek", currentWeek, nudgeProvenance);
      nextWeekNotes[currentWeek] = `Proactive nudge applied: week volume reduced by ${trigger.payload?.pct || 10}%.`;
    }
    if (trigger.actionType === "PROGRESS_STRENGTH_EMPHASIS") nextAdjustments.extra.strengthEmphasisWeeks = trigger.payload?.weeks || 1;
    if (trigger.actionType === "SWITCH_TRAVEL_MODE") {
      nextPersonalization = mergePersonalization(nextPersonalization, { travelState: { ...nextPersonalization.travelState, environmentMode: trigger.payload?.mode || "travel", isTravelWeek: true } });
    }
    if (trigger.actionType === "SIMPLIFY_MEALS_THIS_WEEK") nextAdjustments.extra.defaultMealStructureDays = trigger.payload?.days || 3;
    if (trigger.actionType === "SWITCH_TRAVEL_NUTRITION_MODE") {
      nextAdjustments.extra.travelNutritionMode = true;
      nextAdjustments.nutritionOverrides[dateKey] = { dayType: "travelRun", reason: trigger?.msg || "travel_nutrition_mode", provenance: nudgeProvenance };
    }
    if (trigger.actionType === "SWITCH_ENV_MODE") {
      nextPersonalization = mergePersonalization(nextPersonalization, { travelState: { ...nextPersonalization.travelState, environmentMode: trigger.payload?.mode || "home" } });
    }
    if (trigger.actionType === "ACTIVATE_SALVAGE") {
      nextAdjustments.weekVolumePct[currentWeek] = 80;
      nextAdjustments.extra = appendProvenanceSidecar(nextAdjustments.extra, "weekVolumeByWeek", currentWeek, nudgeProvenance);
      nextAdjustments.extra.mealSimplicityMode = true;
      nextWeekNotes[currentWeek] = "Proactive nudge applied: salvage compression (core sessions only).";
    }
    const nextCoachActions = [{
      id:`nudge_${appliedAt}`,
      ts: appliedAt,
      type: trigger.actionType,
      payload: trigger.payload || {},
      source: trigger.source === "optimization" ? "optimization_experiment" : "proactive_nudge",
      reason: trigger.msg || "proactive trigger",
      triggerReason: trigger.id || "trigger",
      provenance: nudgeProvenance,
    }, ...coachActions].slice(0, 80);
    setCoachActions(nextCoachActions);
    setCoachPlanAdjustments(nextAdjustments);
    setPersonalization(nextPersonalization);
    setWeekNotes(nextWeekNotes);
    setDismissedTriggers(prev => [...prev, trigger.id]);
    await persistAll(logs, bodyweights, paceOverrides, nextWeekNotes, planAlerts, nextPersonalization, nextCoachActions, nextAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
  };

  const exportData = () => {
    const normalizedGoalPayload = normalizeGoals(goals || []);
    return exportRuntimeStateAsBase64({
      runtimeState: buildCanonicalRuntimeState({
        logs,
        bodyweights,
        paceOverrides,
        weekNotes,
        planAlerts,
        personalization,
        goals: normalizedGoalPayload,
        coachActions,
        coachPlanAdjustments,
        dailyCheckins,
        plannedDayRecords,
        weeklyCheckins,
        nutritionFavorites,
        nutritionActualLogs,
      }),
      transformPersonalization: (draftPersonalization) => buildPersistedPersonalization(draftPersonalization, normalizedGoalPayload),
    });
  };

  const importData = async (str) => {
    try {
      const runtimeState = importRuntimeStateFromBase64({
        encoded: str,
        mergePersonalization,
        DEFAULT_PERSONALIZATION,
        normalizeGoals,
        DEFAULT_MULTI_GOALS,
      });
      applyCanonicalRuntimeState(runtimeState);
      // Push restored data to Supabase immediately
      await persistAll(
        runtimeState.logs,
        runtimeState.bodyweights,
        runtimeState.paceOverrides,
        runtimeState.weekNotes,
        runtimeState.planAlerts,
        runtimeState.personalization,
        runtimeState.coachActions,
        runtimeState.coachPlanAdjustments,
        runtimeState.goals,
        runtimeState.dailyCheckins,
        runtimeState.weeklyCheckins,
        runtimeState.nutritionFavorites,
        runtimeState.nutritionActualLogs,
        runtimeState.plannedDayRecords
      );
      setLastSaved("restored + synced");
      setStorageStatus(buildStorageStatus({ mode: "cloud", label: "SYNCED", reason: STORAGE_STATUS_REASONS.synced, detail: "Cloud sync is working normally." }));
      return true;
    } catch(e) {
      logDiag("import failed", e.message);
      setStorageStatus(buildStorageStatus({
        mode: "local",
        label: "RESTORE FAILED",
        reason: STORAGE_STATUS_REASONS.dataIncompatible,
        detail: "The restore payload could not be applied safely.",
      }));
      return false;
    }
  };

  const startFreshPlan = async () => {
    const todayIso = new Date().toISOString().split("T")[0];
    const undoExpiresAt = Date.now() + (7 * 24 * 60 * 60 * 1000);
    const planArcLabel = `${canonicalGoalState?.planStartDate || "Unknown start"} Ã¢â€ â€™ ${todayIso}`;
    const archiveEntry = {
      id: `archive_${Date.now()}`,
      archivedAt: new Date().toISOString(),
      planArcLabel,
      goalsSnapshot: goalsModel,
      prescribedDayHistory: cloneStructuredValue(plannedDayRecords || {}),
      logEntries: Object.entries(logs || {}).sort((a, b) => a[0].localeCompare(b[0])).map(([date, entry]) => ({ date, ...entry })),
    };
    const undoSnapshot = {
      logs,
      bodyweights,
      paceOverrides,
      weekNotes,
      planAlerts,
      goals: goalsModel,
      dailyCheckins,
      plannedDayRecords,
      weeklyCheckins,
      nutritionFavorites,
      nutritionActualLogs,
      coachActions,
      coachPlanAdjustments,
      personalization,
    };
    const nextPersonalizationBase = mergePersonalization(personalization, {
      profile: { ...personalization.profile, onboardingComplete: false },
      planArchives: [archiveEntry, ...(personalization?.planArchives || [])].slice(0, 12),
      planResetUndo: { startedAt: Date.now(), startedDate: todayIso, expiresAt: undoExpiresAt, snapshot: undoSnapshot },
    });
    const nextPersonalization = withLegacyGoalProfileCompatibility({
      personalization: nextPersonalizationBase,
      canonicalAthlete,
      goalStateOverrides: { planStartDate: todayIso },
    });
    const clearedLogs = {};
    const clearedBodyweights = [];
    const clearedPaceOverrides = {};
    const clearedWeekNotes = {};
    const resetAlerts = [{ id:`fresh_${Date.now()}`, type:"info", msg:`New plan started ${todayIso}.`, ts: Date.now() }];
    const resetDaily = {};
    const resetPlannedDayRecords = {};
    const resetWeekly = {};
    setLogs(clearedLogs);
    setBodyweights(clearedBodyweights);
    setPaceOverrides(clearedPaceOverrides);
    setWeekNotes(clearedWeekNotes);
    setPlanAlerts(resetAlerts);
    setDailyCheckins(resetDaily);
    setPlannedDayRecords(resetPlannedDayRecords);
    setWeeklyCheckins(resetWeekly);
    setPersonalization(nextPersonalization);
    setStartFreshConfirmOpen(false);
    await persistAll(clearedLogs, clearedBodyweights, clearedPaceOverrides, clearedWeekNotes, resetAlerts, nextPersonalization, coachActions, coachPlanAdjustments, goalsModel, resetDaily, resetWeekly, nutritionFavorites, nutritionActualLogs, resetPlannedDayRecords);
  };

  const undoStartFresh = async () => {
    const undo = personalization?.planResetUndo;
    if (!undo || Date.now() > Number(undo?.expiresAt || 0) || !undo?.snapshot) return;
    const snap = undo.snapshot;
    const restoredNutritionActualLogs = snap.nutritionActualLogs || normalizeActualNutritionLogCollection(snap.nutritionFeedback || {});
    const restoredPersonalization = mergePersonalization(snap.personalization || personalization, { planResetUndo: null });
    setLogs(snap.logs || {});
    setBodyweights(snap.bodyweights || []);
    setPaceOverrides(snap.paceOverrides || {});
    setWeekNotes(snap.weekNotes || {});
    setPlanAlerts(snap.planAlerts || []);
    setGoals(normalizeGoals(snap.goals || goalsModel));
    setDailyCheckins(snap.dailyCheckins || {});
    setPlannedDayRecords(snap.plannedDayRecords || {});
    setWeeklyCheckins(snap.weeklyCheckins || {});
    setNutritionFavorites(snap.nutritionFavorites || nutritionFavorites);
    setNutritionActualLogs(restoredNutritionActualLogs);
    setCoachActions(snap.coachActions || coachActions);
    setCoachPlanAdjustments(snap.coachPlanAdjustments || coachPlanAdjustments);
    setPersonalization(restoredPersonalization);
    await persistAll(snap.logs || {}, snap.bodyweights || [], snap.paceOverrides || {}, snap.weekNotes || {}, snap.planAlerts || [], restoredPersonalization, snap.coachActions || coachActions, snap.coachPlanAdjustments || coachPlanAdjustments, normalizeGoals(snap.goals || goalsModel), snap.dailyCheckins || {}, snap.weeklyCheckins || {}, snap.nutritionFavorites || nutritionFavorites, restoredNutritionActualLogs, snap.plannedDayRecords || {});
  };

  const undoBanner = (() => {
    const undo = personalization?.planResetUndo;
    if (!undo) return null;
    if (Date.now() > Number(undo?.expiresAt || 0)) return null;
    return { startedDate: undo.startedDate, expiresAt: undo.expiresAt };
  })();
  // Merge default zones with any AI-generated overrides
  const getZones = (phaseName) => {
    const defaults = PHASE_ZONES[phaseName] || PHASE_ZONES["BASE"];
    const overrides = paceOverrides[phaseName] || {};
    return { ...defaults, ...overrides };
  };

  // Ã¢â€â‚¬Ã¢â€â‚¬ AI PLAN ANALYSIS Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  // Fires after every log save. Compares actual vs prescribed, detects patterns,
  // returns JSON modifications to apply to the plan.
  // TODO(ai-runtime): Remaining ad hoc AI payload paths are tracked in
  // `AI_RUNTIME_TODO_PATHS` and still use this thin text helper until unified.
  const getAnthropicKey = () => (typeof window !== "undefined"
    ? resolveStoredAiApiKey({ safeStorageGet, storageLike: localStorage })
    : "");
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
      const analysisPacketArgs = {
        dateKey: todayKey,
        currentWeek,
        canonicalGoalState,
        canonicalUserProfile,
        goals: goalsModel,
        planDay,
        planWeek: currentPlanWeek,
        logs: newLogs,
        dailyCheckins,
        nutritionActualLogs,
        bodyweights,
        momentum,
        expectations,
        strengthLayer,
        optimizationLayer,
        failureMode,
        readiness: sharedReadinessInfluence,
        nutritionComparison,
        arbitration,
        memoryInsights,
        weekNotes,
        paceOverrides,
        planAlerts,
      };
      validateAiPacketInvariant(analysisPacketArgs, "runPlanAnalysisRuntime");
      const analysisResult = await runPlanAnalysisRuntime({
        apiKey: getAnthropicKey(),
        safeFetchWithTimeout,
        packetArgs: analysisPacketArgs,
      });
      if (!analysisResult.ok && analysisResult.status === "invalid_json") {
        logDiag("Plan analysis degraded: invalid JSON proposal");
        setAnalyzing(false);
        return;
      }
      if (!analysisResult.ok) {
        setAnalyzing(false);
        return;
      }
      if (analysisResult.rejected.length > 0) {
        logDiag("AI plan proposal rejected parts:", analysisResult.rejected.join("; "));
      }
      const result = analysisResult.accepted;

      if (!analysisResult.hasChanges || result?.noChange) {
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
      // Silent fail Ã¢â‚¬â€ analysis is best-effort, never blocks logging
      logDiag("Plan analysis degraded:", e.message);
    }
    setAnalyzing(false);
  };

  const TABS = ["Today", "Program", "Log", "Nutrition", "Coach"];

  if (authInitializing || loading) return (
    <div style={{ background:"linear-gradient(180deg,#0d1520 0%, #111b28 48%, #162131 100%)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',sans-serif", color:"#7f90a8", fontSize:"0.7rem", letterSpacing:"0.14em" }}>
      LOADING...
    </div>
  );

  if (!authSession?.user?.id) return (
    <div style={{ background:"linear-gradient(180deg,#0d1520 0%, #111b28 48%, #162131 100%)", minHeight:"100vh", display:"flex", alignItems:"center", justifyContent:"center", fontFamily:"'Inter',sans-serif", color:"#e7edf7", padding:"1rem" }}>
      <div style={{ width:"100%", maxWidth:380, border:"1px solid rgba(114,138,173,0.24)", borderRadius:16, padding:"1rem", background:"#162131", boxShadow:"0 14px 28px rgba(5,10,18,0.28)" }}>
        <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:"1.08rem", fontWeight:700, letterSpacing:"0.05em", color:"#f6f8fc", marginBottom:"0.5rem" }}>ACCOUNT ACCESS</div>
        <div style={{ fontSize:"0.58rem", color:"#8da0bb", marginBottom:"0.5rem" }}>Sign in to load your private training state.</div>
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


  const activeTargetDate = activeTimeBoundGoal?.targetDate || canonicalGoalState?.deadline || null;
  const daysToRace = activeTargetDate ? Math.max(0, Math.ceil((new Date(activeTargetDate) - today) / (1000*60*60*24))) : null;
  const activePhase = (rollingHorizon || []).find(h => h.absoluteWeek === currentWeek)?.template?.phase || todayWorkoutHardened?.week?.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
  const currentPhaseWeekLabel = (rollingHorizon || []).find(h => h.absoluteWeek === currentWeek)?.weekLabel || `${activePhase} Ã‚Â· Week ${currentWeek}`;
  const PHASE_THEME = {
    BASE: { accent: "#27f59a", accentSoft: "rgba(39,245,154,0.2)", accentGlow: "rgba(39,245,154,0.34)" },
    BUILDING: { accent: "#00c2ff", accentSoft: "rgba(0,194,255,0.22)", accentGlow: "rgba(0,194,255,0.34)" },
    PEAKBUILD: { accent: "#7c5cff", accentSoft: "rgba(124,92,255,0.24)", accentGlow: "rgba(124,92,255,0.35)" },
    PEAK: { accent: "#ff3d81", accentSoft: "rgba(255,61,129,0.24)", accentGlow: "rgba(255,61,129,0.36)" },
    TAPER: { accent: "#9aa6ff", accentSoft: "rgba(154,166,255,0.22)", accentGlow: "rgba(154,166,255,0.32)" },
  };
  const phaseTheme = PHASE_THEME[activePhase] || PHASE_THEME.BASE;
  const PALETTE_THEME = {
    Green: "#27f59a",
    Blue: "#00c2ff",
    Orange: "#ff8a00",
    Red: "#ff3d81",
    Purple: "#7c5cff",
    Neutral: "#94a3b8",
  };
  const selectedPalette = personalization?.settings?.appearance?.palette || "Green";
  const userAccent = PALETTE_THEME[selectedPalette] || phaseTheme.accent;
  const selectedThemeMode = personalization?.settings?.appearance?.theme || "System";
  const themeTokens = selectedThemeMode === "Light"
    ? {
        "--bg": "#edf3fb",
        "--panel": "rgba(255,255,255,0.92)",
        "--panel-2": "rgba(247,250,254,0.98)",
        "--panel-3": "rgba(239,244,251,0.98)",
        "--border": "rgba(111,129,160,0.26)",
        "--muted": "#5d6d86",
        "--text": "#142033",
        "--text-strong": "#0d1728",
        "--text-soft": "#6b7d97",
        "--card-border": "rgba(111,129,160,0.22)",
        "--card-shadow": "0 8px 18px rgba(81,99,126,0.08)",
        "--card-shadow-hover": "0 12px 24px rgba(81,99,126,0.12)",
        "--card-strong-shadow": "0 10px 22px rgba(81,99,126,0.1)",
        "--card-soft-border": "rgba(111,129,160,0.24)",
        "--card-soft-shadow": "0 8px 18px rgba(81,99,126,0.07)",
        "--shell-overlay": "radial-gradient(120% 90% at 50% -10%, rgba(61,114,181,0.08), transparent 60%)",
        "--tab-strip-bg": "rgba(255,255,255,0.76)",
        "--tab-strip-border": "rgba(111,129,160,0.22)",
        "--tab-text": "#53657f",
        "--heading-start": "#142033",
        "--surface-1": "#ffffff",
        "--surface-2": "#f7fafe",
        "--surface-3": "#eef3f9",
        "--shadow-1": "0 6px 14px rgba(81,99,126,0.08)",
        "--shadow-2": "0 10px 24px rgba(81,99,126,0.12)",
        "--shadow-3": "0 16px 34px rgba(81,99,126,0.14)",
      }
    : {
        "--bg": "#0f1724",
        "--panel": "#162131",
        "--panel-2": "#1a2738",
        "--panel-3": "#213247",
        "--border": "rgba(114,138,173,0.26)",
        "--muted": "#8da0bb",
        "--text": "#e7edf7",
        "--text-strong": "#f6f8fc",
        "--text-soft": "#9aacc4",
        "--card-border": "rgba(114,138,173,0.22)",
        "--card-shadow": "0 10px 22px rgba(5,10,18,0.24)",
        "--card-shadow-hover": "0 14px 28px rgba(5,10,18,0.3)",
        "--card-strong-shadow": "0 12px 26px rgba(5,10,18,0.28)",
        "--card-soft-border": "rgba(114,138,173,0.22)",
        "--card-soft-shadow": "0 10px 20px rgba(5,10,18,0.22)",
        "--shell-overlay": "radial-gradient(120% 90% at 50% -10%, rgba(61,114,181,0.12), transparent 58%)",
        "--tab-strip-bg": "rgba(18,29,44,0.92)",
        "--tab-strip-border": "rgba(114,138,173,0.24)",
        "--tab-text": "#95a8c2",
        "--heading-start": "#f2f6fb",
        "--surface-1": "#162131",
        "--surface-2": "#1a2738",
        "--surface-3": "#213247",
        "--shadow-1": "0 8px 18px rgba(5,10,18,0.22)",
        "--shadow-2": "0 12px 26px rgba(5,10,18,0.28)",
        "--shadow-3": "0 18px 36px rgba(5,10,18,0.34)",
      };
  const appBackground = selectedThemeMode === "Light"
    ? "linear-gradient(180deg,#f5f8fc 0%, #ecf2f8 100%)"
    : "linear-gradient(180deg,#0d1520 0%, #111b28 48%, #162131 100%)";
  const onboardingComplete = personalization?.profile?.onboardingComplete;
  const finishOnboarding = async (answers) => {
    const todayKey = new Date().toISOString().split("T")[0];
    const GOAL_TO_CATEGORY = { fat_loss: "body_comp", muscle_gain: "strength", endurance: "running", general_fitness: "running" };
    const primaryGoalKey = answers.primary_goal || "general_fitness";
    const primaryCategory = GOAL_TO_CATEGORY[primaryGoalKey] || "running";
    const primaryGoalLabel = PRIMARY_GOAL_LABELS[primaryGoalKey] || "General Fitness";
    const primaryGoal = primaryGoalLabel;
    const experienceLevel = answers.experience_level || "beginner";
    const sessionLength = answers.session_length || "30";
    const coachingStyle = String(answers.coaching_style || "Find the balance").trim();
    const trainingDaysLabel = String(answers.training_days || "3").trim();
    const trainingDays = trainingDaysLabel === "6+" ? 6 : Math.max(2, Number(trainingDaysLabel) || 3);
    const trainingLocation = String(answers.training_location || "Home").trim();
    const injuryText = String(answers.injury_text || "").trim();
    const homeEquipment = Array.isArray(answers.home_equipment) ? answers.home_equipment.filter(Boolean) : [];
    const homeEquipmentOther = String(answers.home_equipment_other || "").trim();
    const normalizedEquipment = [
      ...homeEquipment.filter((item) => item !== "Other"),
      ...(homeEquipment.includes("Other") && homeEquipmentOther ? [homeEquipmentOther] : []),
    ];
    if (["Home", "Both"].includes(trainingLocation) && normalizedEquipment.length === 0) {
      normalizedEquipment.push("Bodyweight only");
    }
    const constraints = [];
    if (injuryText && !/nothing current|none|nope|healthy/i.test(injuryText)) {
      constraints.push(injuryText);
    }
    const compatibilityUserProfile = {
      primary_goal: primaryGoalKey,
      experience_level: experienceLevel,
      days_per_week: trainingDays,
      session_length: sessionLength,
      equipment_access: normalizedEquipment,
      constraints,
    };
    const refreshedGoals = normalizeGoals((goalsModel || DEFAULT_MULTI_GOALS).map((goal, index) => {
      if (index === 0) {
        return {
          ...goal,
          name: primaryGoalLabel,
          category: primaryCategory,
          type: "ongoing",
          targetDate: "",
          active: true,
          priority: 1,
        };
      }
      return { ...goal, active: goal.id === "g_resilience" };
    }));
    const nextPresets = {
      ...(DEFAULT_PERSONALIZATION.environmentConfig?.presets || {}),
      ...(personalization.environmentConfig?.presets || {}),
      Home: {
        equipment: normalizedEquipment.length ? normalizedEquipment : (personalization.environmentConfig?.presets?.Home?.equipment || ["Bodyweight only"]),
        time: sessionLength,
      },
      Gym: {
        equipment: personalization.environmentConfig?.presets?.Gym?.equipment || ["full rack", "barbell", "cable stack"],
        time: trainingDays >= 5 ? "45+" : sessionLength,
      },
      Travel: {
        equipment: ["Bodyweight only"],
        time: "20",
      },
    };
    const defaultMode = trainingLocation === "Gym" ? "Gym" : "Home";
    const baseSelection = resolveModePreset(defaultMode, nextPresets);
    const intensityPreference = coachingStyle === "Push me hard"
      ? "Aggressive"
      : coachingStyle === "Keep it simple"
      ? "Conservative"
      : "Standard";
    const goalMix = primaryGoalLabel;
    const onboardingMemory = [
      answers.timeline_assessment ? `Timeline assessment: ${answers.timeline_assessment}` : null,
      answers.timeline_adjustment ? `Timeline adjustment requested: ${answers.timeline_adjustment}` : null,
      `Primary goal: ${primaryGoalLabel}`,
      `Experience level: ${EXPERIENCE_LEVEL_LABELS[experienceLevel] || experienceLevel}`,
      `Session length: ${SESSION_LENGTH_LABELS[sessionLength] || sessionLength}`,
      constraints.length ? `Constraints: ${constraints.join(", ")}` : "Constraints: None",
      `Training availability: ${trainingDaysLabel} days per week`,
      `Primary environment: ${trainingLocation}`,
      normalizedEquipment.length ? `Equipment: ${normalizedEquipment.join(", ")}` : null,
      `Coaching preference: ${coachingStyle}`,
    ].filter(Boolean);
    const onboardingGoalState = {
      primaryGoal,
      priority: primaryCategory,
      priorityOrder: primaryGoalLabel,
      deadline: "",
      planStartDate: todayKey,
      milestones: {
        day30: "Lock in a repeatable week and establish a truthful baseline.",
        day60: "Build workload around recovery and show measurable progress.",
        day90: "Push the prioritized goal with enough momentum to matter.",
      },
    };
    const nextPersonalizationBase = mergePersonalization(personalization, {
      profile: {
        ...personalization.profile,
        onboardingComplete: true,
        preferredTrainingStyle: coachingStyle,
        goalMix,
        estimatedFitnessLevel: experienceLevel,
      },
      settings: {
        ...(personalization.settings || DEFAULT_PERSONALIZATION.settings),
        trainingPreferences: {
          ...(personalization.settings?.trainingPreferences || DEFAULT_PERSONALIZATION.settings.trainingPreferences),
          defaultEnvironment: trainingLocation,
          intensityPreference,
        },
      },
      injuryPainState: {
        ...personalization.injuryPainState,
        level: constraints.length === 0 ? "none" : "mild_tightness",
        notes: constraints.length === 0 ? "" : `Onboarding note: ${constraints.join("; ")}`,
      },
      environmentConfig: {
        ...personalization.environmentConfig,
        defaultMode,
        presets: nextPresets,
        base: {
          equipment: baseSelection.equipment,
          time: baseSelection.time,
        },
      },
      nutritionPreferenceState: {
        ...(personalization.nutritionPreferenceState || DEFAULT_PERSONALIZATION.nutritionPreferenceState),
        style: primaryCategory === "body_comp" ? "high-protein fat-loss support" : "high-protein performance",
      },
      coachMemory: {
        ...personalization.coachMemory,
        constraints: [
          `${trainingDaysLabel} day reality`,
          trainingLocation === "Varies a lot" ? "training location varies week to week" : `${trainingLocation} training setup`,
        ],
        commonBarriers: [
          `${trainingDaysLabel} day reality`,
          trainingLocation === "Varies a lot" ? "environment changes often" : "recovery consistency",
        ],
        scheduleConstraints: [`Available ${trainingDaysLabel} days per week`, `Session length: ${SESSION_LENGTH_LABELS[sessionLength] || sessionLength}`],
        pushResponse: coachingStyle === "Push me hard" ? "Responds well to direct, demanding coaching." : personalization.coachMemory?.pushResponse || "",
        protectResponse: coachingStyle === "Find the balance" ? "Wants a balance between push and protection." : coachingStyle === "Keep it simple" ? "Prefers simple, sustainable prescriptions over aggressive progressions." : personalization.coachMemory?.protectResponse || "",
        preferredFoodPatterns: [
          primaryCategory === "body_comp" ? "high-protein fat-loss support" : "high-protein performance",
        ],
        simplicityVsVariety: coachingStyle === "Keep it simple" ? "simplicity" : coachingStyle === "Let the data decide" ? "balanced" : "variety",
        lastAdjustment: `Onboarding complete ${todayKey}.`,
        longTermMemory: [
          ...(personalization.coachMemory?.longTermMemory || []),
          ...(answers.starting_fresh ? ["Started a new plan from today while preserving past history and coach memory."] : []),
          ...onboardingMemory,
        ].slice(-40),
      },
    });
    const nextPersonalization = withLegacyGoalProfileCompatibility({
      personalization: nextPersonalizationBase,
      canonicalAthlete: deriveCanonicalAthleteState({
        goals: refreshedGoals,
        personalization: nextPersonalizationBase,
        profileDefaults: PROFILE,
      }),
      userProfileOverrides: compatibilityUserProfile,
      goalStateOverrides: onboardingGoalState,
    });
    setPersonalization(nextPersonalization);
    setGoals(refreshedGoals);
    setTab(0);
    await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, nextPersonalization, coachActions, coachPlanAdjustments, refreshedGoals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
  };

  return (
    <div style={{ "--phase-accent": userAccent, "--phase-accent-soft": phaseTheme.accentSoft, "--phase-accent-glow": phaseTheme.accentGlow, ...themeTokens, fontFamily:"'Inter',sans-serif", background:appBackground, minHeight:"100vh", color:"var(--text)", padding:onboardingComplete ? "1.65rem 1.2rem" : 0 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&family=Space+Grotesk:wght@500;700&display=swap');
        :root{
          --accent:var(--phase-accent);
          --accent-2:#7c5cff;
          --hot:#ff3d81;
          --signal:#27f59a;
          --space-1:0.25rem;
          --space-2:0.5rem;
          --space-3:0.75rem;
          --space-4:1rem;
          --space-5:1.5rem;
          --radius-sm:10px;
          --radius-md:14px;
          --radius-lg:18px;
          --type-label:0.48rem;
          --type-meta:0.54rem;
          --type-body:0.6rem;
          --type-title:0.95rem;
          --state-success:${C.green};
          --state-info:${C.blue};
          --state-warning:${C.amber};
          --state-danger:${C.red};
        }
        * { box-sizing:border-box; margin:0; padding:0; }
        ::-webkit-scrollbar{width:8px} ::-webkit-scrollbar-track{background:transparent} ::-webkit-scrollbar-thumb{background:rgba(111,129,160,0.38);border-radius:999px}
        .fi{animation:fi 0.22s ease forwards}
        .hov{transition:background 0.18s ease,border-color 0.18s ease;cursor:pointer} .hov:hover{background:rgba(60,145,230,0.06)!important}
        .btn{
          background:var(--surface-2);
          border:1px solid var(--border);
          border-radius:var(--radius-sm);
          font-family:'Inter',sans-serif;
          font-size:var(--type-meta);
          font-weight:600;
          letter-spacing:0.04em;
          cursor:pointer;
          padding:8px 12px;
          transition:background 0.18s ease, border-color 0.18s ease, color 0.18s ease, transform 0.18s ease, box-shadow 0.18s ease;
          color:var(--text);
          box-shadow:none;
        }
        .btn:hover{border-color:rgba(60,145,230,0.34);color:var(--text-strong);background:var(--surface-1);transform:translateY(-1px);box-shadow:var(--shadow-1)}
        .btn:active{transform:translateY(0) scale(0.985)}
        .btn-primary{
          background:var(--phase-accent)!important;
          border-color:rgba(0,0,0,0)!important;
          color:#f8fbff!important;
          font-weight:700;
          box-shadow:var(--shadow-2);
        }
        .btn-primary:hover{filter:none;box-shadow:var(--shadow-3)}
        input,textarea,select{background:var(--surface-2);border:1px solid var(--border);border-radius:var(--radius-sm);color:var(--text);font-family:'Inter',sans-serif;font-size:0.7rem;padding:9px 11px;outline:none;width:100%;transition:border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease}
        input:focus,textarea:focus,select:focus{border-color:rgba(60,145,230,0.5);box-shadow:0 0 0 3px rgba(60,145,230,0.14);background:var(--surface-1)}
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
        .tag{font-size:var(--type-meta);padding:4px 8px;border-radius:999px;letter-spacing:0.02em;white-space:nowrap;background:var(--surface-2);color:var(--text-soft);border:1px solid var(--border)}
        .card{
          position:relative;
          overflow:hidden;
          background:var(--panel);
          border:1px solid var(--card-border);
          border-radius:var(--radius-md);
          padding:var(--space-4);
          box-shadow:var(--card-shadow);
          transition:transform 0.18s ease, box-shadow 0.18s ease, border-color 0.18s ease, background 0.18s ease
        }
        .card::before{
          content:"";
          position:absolute;
          inset:-1px -1px auto -1px;
          height:22%;
          pointer-events:none;
          background:linear-gradient(180deg, rgba(255,255,255,0.06), rgba(255,255,255,0));
          opacity:0.3;
        }
        .card::after{
          content:none;
        }
        .card:hover{transform:translateY(-1px); box-shadow:var(--card-shadow-hover); border-color:rgba(60,145,230,0.24)}
        .card-strong{
          background:var(--panel-2);
          border-color:rgba(60,145,230,0.26);
          box-shadow:var(--card-strong-shadow);
        }
        .card-soft{
          background:var(--panel);
          border-color:var(--card-soft-border);
          box-shadow:var(--card-soft-shadow);
        }
        .sect-title{font-family:'Space Grotesk',sans-serif;font-size:var(--type-title);font-weight:700;letter-spacing:0.015em;text-transform:none;color:var(--text-strong)}
        .mono{font-family:'JetBrains Mono',monospace; letter-spacing:0.01em}
        .coach-copy{font-family:'Inter',sans-serif; color:var(--text); line-height:1.65}
        .completion-pop{animation:completePop 0.35s ease-out}
        .pulse-ring{animation:ringPulse 1.35s ease-in-out infinite; border-radius:999px}
        .coach-fade{animation:coachFadeIn 0.28s ease-out both}
        .card-hero{
          border-color:rgba(60,145,230,0.34)!important;
          box-shadow:var(--shadow-2);
        }
        .card-hero::after{
          content:none;
        }
        .card-action{
          border-color:rgba(60,145,230,0.24)!important;
          box-shadow:var(--shadow-2);
        }
        .card-subtle{
          opacity:1;
          box-shadow:var(--shadow-1);
        }
        details > summary{list-style:none}
        details > summary::-webkit-details-marker{display:none}
        details[open]{animation:fi 0.18s ease}
      `}</style>

      {!onboardingComplete ? (
        <OnboardingCoach onComplete={finishOnboarding} startingFresh={Boolean(personalization?.planResetUndo?.startedAt)} existingMemory={personalization?.coachMemory?.longTermMemory || []} />
      ) : (
      <div style={{ maxWidth:900, margin:"0 auto", background:"var(--shell-overlay)", color:"var(--text)" }}>

        {/* Ã¢â€â‚¬Ã¢â€â‚¬ HEADER BAR Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", marginBottom:"1.25rem", gap:"0.75rem" }}>
          <div>
            <h1 style={{ fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, fontSize:"1.84rem", letterSpacing:"0.025em", color:"var(--heading-start)", lineHeight:1.02 }}>
              PERSONAL TRAINER
            </h1>
            <div style={{ fontFamily:"'Inter',sans-serif", fontSize:"0.56rem", color:"var(--muted)", letterSpacing:"0.08em", marginTop:4 }}>
              {fmtDate(today).toUpperCase()} Ã‚Â· WEEK {currentWeek}
            </div>
          </div>
          <button className="btn" onClick={()=>setTab(5)} aria-label="Open settings" title="Settings" style={{ width:40, height:40, padding:0, display:"inline-flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
            <SettingsIcon size={18} />
          </button>
        </div>
        {undoBanner && (
          <div className="card card-soft" style={{ marginBottom:"0.75rem", borderColor:C.amber+"35", display:"flex", alignItems:"center", justifyContent:"space-between", gap:"0.5rem", padding:"0.45rem 0.55rem" }}>
            <div style={{ fontSize:"0.56rem", color:"#dbe7f6" }}>New plan started {undoBanner.startedDate}. <button className="btn" onClick={undoStartFresh} style={{ marginLeft:"0.2rem", fontSize:"0.52rem", color:C.amber, borderColor:C.amber+"45" }}>Undo</button></div>
          </div>
        )}
        {/* Ã¢â€â‚¬Ã¢â€â‚¬ TABS Ã¢â€â‚¬Ã¢â€â‚¬ */}
        <div style={{ display:"flex", gap:"0.3rem", marginBottom:"1.25rem", background:"var(--tab-strip-bg)", padding:"0.32rem", borderRadius:14, border:"1px solid var(--tab-strip-border)", overflowX:"auto", boxShadow:"var(--shadow-1)" }}>
          {TABS.map((t,i) => (
            <button key={t} className="btn" onClick={()=>setTab(i)}
              style={{ color:tab===i?"#f8fbff":"var(--tab-text)", background:tab===i?"var(--phase-accent)":"transparent", borderColor:tab===i?"transparent":"var(--border)", fontWeight:tab===i?700:500, flexShrink:0 }}>
              {t}
            </button>
          ))}
        </div>

        {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
            TODAY
        Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
        {tab === 0 && <TodayTab planDay={planDay} todayWorkout={planDay?.resolved?.training} plannedWorkout={planDay?.base?.training} currentWeek={currentWeek} rollingHorizon={rollingHorizon} logs={logs} bodyweights={bodyweights} planAlerts={planAlerts} setPlanAlerts={setPlanAlerts} analyzing={analyzing} getZones={getZones} personalization={personalization} athleteProfile={canonicalAthlete} momentum={momentum} strengthLayer={strengthLayer} dailyStory={dailyStory} behaviorLoop={behaviorLoop} proactiveTriggers={proactiveTriggers} onDismissTrigger={dismissTriggerForToday} onApplyTrigger={applyProactiveNudge} applyDayContextOverride={applyDayContextOverride} shiftTodayWorkout={shiftTodayWorkout} restoreShiftTodayWorkout={restoreShiftTodayWorkout} setEnvironmentMode={setEnvironmentMode} environmentSelection={environmentSelection} injuryRule={injuryRule} setInjuryState={setInjuryState} dailyCheckins={dailyCheckins} saveDailyCheckin={saveDailyCheckin} learningLayer={learningLayer} salvageLayer={salvageLayer} validationLayer={validationLayer} optimizationLayer={optimizationLayer} failureMode={failureMode} planComposer={planComposer} saveBodyweights={saveBodyweights} coachPlanAdjustments={coachPlanAdjustments} onGoProgram={()=>setTab(1)} loading={loading} storageStatus={storageStatus} authError={authError} />}

        {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
            PROGRAM
        Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
        {tab === 1 && (
          <ProgramTabErrorBoundary>
            <PlanTab planDay={planDay} currentPlanWeek={currentPlanWeek} currentWeek={currentWeek} logs={logs} bodyweights={bodyweights} personalization={personalization} athleteProfile={canonicalAthlete} setGoals={setGoals} momentum={momentum} strengthLayer={strengthLayer} weeklyReview={weeklyReview} expectations={expectations} memoryInsights={memoryInsights} recalibration={recalibration} patterns={patterns} getZones={getZones} weekNotes={weekNotes} paceOverrides={paceOverrides} setPaceOverrides={setPaceOverrides} learningLayer={learningLayer} salvageLayer={salvageLayer} failureMode={failureMode} planComposer={planComposer} rollingHorizon={rollingHorizon} horizonAnchor={horizonAnchor} weeklyCheckins={weeklyCheckins} saveWeeklyCheckin={saveWeeklyCheckin} environmentSelection={environmentSelection} setEnvironmentMode={setEnvironmentMode} saveEnvironmentSchedule={saveEnvironmentSchedule} deviceSyncAudit={deviceSyncAudit} todayWorkout={planDay?.resolved?.training} />
          </ProgramTabErrorBoundary>
        )}

        {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
            LOG
        Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
        {tab === 2 && <LogTab planDay={planDay} logs={logs} dailyCheckins={dailyCheckins} plannedDayRecords={plannedDayRecords} nutritionActualLogs={nutritionActualLogs} saveLogs={saveLogs} bodyweights={bodyweights} saveBodyweights={saveBodyweights} currentWeek={currentWeek} todayWorkout={planDay?.resolved?.training} planArchives={personalization?.planArchives || []} planStartDate={canonicalGoalState?.planStartDate || ""} />}

        {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
            NUTRITION
        Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
        {tab === 3 && <NutritionTab planDay={planDay} todayWorkout={planDay?.resolved?.training} currentWeek={currentWeek} logs={logs} personalization={personalization} athleteProfile={canonicalAthlete} momentum={momentum} bodyweights={bodyweights} learningLayer={learningLayer} nutritionLayer={planDay?.resolved?.nutrition?.prescription} realWorldNutrition={planDay?.resolved?.nutrition?.reality} nutritionActualLogs={nutritionActualLogs} nutritionFavorites={nutritionFavorites} saveNutritionFavorites={saveNutritionFavorites} saveNutritionActualLog={saveNutritionActualLog} />}

        {/* Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â
            COACH
        Ã¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢ÂÃ¢â€¢Â */}
        {tab === 4 && <CoachTab planDay={planDay} logs={logs} dailyCheckins={dailyCheckins} currentWeek={currentWeek} todayWorkout={planDay?.resolved?.training} bodyweights={bodyweights} personalization={personalization} athleteProfile={canonicalAthlete} momentum={momentum} arbitration={arbitration} expectations={expectations} memoryInsights={memoryInsights} compoundingCoachMemory={compoundingCoachMemory} recalibration={recalibration} strengthLayer={strengthLayer} patterns={patterns} proactiveTriggers={proactiveTriggers} onApplyTrigger={applyProactiveNudge} learningLayer={learningLayer} salvageLayer={salvageLayer} validationLayer={validationLayer} optimizationLayer={optimizationLayer} failureMode={failureMode} planComposer={planComposer} nutritionLayer={planDay?.resolved?.nutrition?.prescription} realWorldNutrition={planDay?.resolved?.nutrition?.reality} nutritionActualLogs={nutritionActualLogs} setPersonalization={setPersonalization} coachActions={coachActions} setCoachActions={setCoachActions} coachPlanAdjustments={coachPlanAdjustments} setCoachPlanAdjustments={setCoachPlanAdjustments} weekNotes={weekNotes} setWeekNotes={setWeekNotes} planAlerts={planAlerts} setPlanAlerts={setPlanAlerts} onPersist={async (nextPersonalization, nextCoachActions, nextCoachPlanAdjustments = coachPlanAdjustments, nextWeekNotes = weekNotes, nextPlanAlerts = planAlerts) => {
          setPersonalization(nextPersonalization);
          setCoachActions(nextCoachActions);
          setCoachPlanAdjustments(nextCoachPlanAdjustments);
          setWeekNotes(nextWeekNotes);
          setPlanAlerts(nextPlanAlerts);
          await persistAll(logs, bodyweights, paceOverrides, nextWeekNotes, nextPlanAlerts, nextPersonalization, nextCoachActions, nextCoachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
        }} />}

        {tab === 5 && <SettingsTab onStartFresh={()=>setStartFreshConfirmOpen(true)} personalization={personalization} setPersonalization={setPersonalization} exportData={exportData} importData={importData} authSession={authSession} onReloadCloudData={sbLoad} deviceSyncAudit={deviceSyncAudit} onDeleteAccount={async ()=>{
          const clearedLogs = {};
          const clearedBodyweights = [];
          const clearedDaily = {};
          const clearedPlannedDayRecords = {};
          const clearedWeekly = {};
          const clearedGoals = normalizeGoals(DEFAULT_MULTI_GOALS);
          const resetPersonalization = mergePersonalization(DEFAULT_PERSONALIZATION, { profile: { ...DEFAULT_PERSONALIZATION.profile, onboardingComplete: false } });
          setLogs(clearedLogs);
          setBodyweights(clearedBodyweights);
          setDailyCheckins(clearedDaily);
          setPlannedDayRecords(clearedPlannedDayRecords);
          setWeeklyCheckins(clearedWeekly);
          setGoals(clearedGoals);
          setPersonalization(resetPersonalization);
          setCoachActions([]);
          setCoachPlanAdjustments(DEFAULT_COACH_PLAN_ADJUSTMENTS);
          setNutritionFavorites(DEFAULT_NUTRITION_FAVORITES);
          setNutritionActualLogs({});
          await persistAll(clearedLogs, clearedBodyweights, {}, {}, [], resetPersonalization, [], DEFAULT_COACH_PLAN_ADJUSTMENTS, clearedGoals, clearedDaily, clearedWeekly, DEFAULT_NUTRITION_FAVORITES, {}, clearedPlannedDayRecords);
        }} onPersist={async (nextPersonalization) => {
          setPersonalization(nextPersonalization);
          await persistAll(logs, bodyweights, paceOverrides, weekNotes, planAlerts, nextPersonalization, coachActions, coachPlanAdjustments, goals, dailyCheckins, weeklyCheckins, nutritionFavorites, nutritionActualLogs);
        }} />}
        {showAppleHealthFirstLaunch && (
          <div style={{ position:"fixed", inset:0, background:"rgba(2,6,14,0.74)", display:"grid", placeItems:"center", zIndex:56, padding:"1rem" }}>
            <div className="card card-soft" style={{ width:"100%", maxWidth:520, borderColor:"var(--border)", background:"var(--panel)", padding:"0.9rem" }}>
              <div style={{ fontSize:"0.62rem", color:"var(--text)", lineHeight:1.7, marginBottom:"0.6rem" }}>
                Personal Trainer can read Apple Health workouts and device context that some recommendations use. We never share this data. You can revoke access anytime in iOS Settings.
              </div>
              <button className="btn btn-primary" onClick={requestAppleHealthPermissions} style={{ width:"100%", marginBottom:"0.45rem" }}>Connect Apple Health</button>
              <button className="btn" onClick={async ()=>{ await updateAppleHealthState({ skipped: true }); setShowAppleHealthFirstLaunch(false); }} style={{ width:"100%", fontSize:"0.52rem", color:"var(--muted)", borderColor:"var(--border)" }}>
                Skip for now
              </button>
            </div>
          </div>
        )}
        {startFreshConfirmOpen && (
          <div style={{ position:"fixed", inset:0, background:"rgba(2,6,14,0.74)", display:"grid", placeItems:"center", zIndex:50, padding:"1rem" }}>
            <div className="card card-soft" style={{ width:"100%", maxWidth:520, borderColor:"var(--border)", background:"var(--panel)", padding:"0.9rem" }}>
              <div style={{ fontSize:"0.62rem", color:"var(--text)", lineHeight:1.7, marginBottom:"0.6rem" }}>
                This will archive your current plan and start a new intake from today. Your history stays saved, your coach memory carries forward, and you can rebuild around new priorities. This cannot be reversed automatically Ã¢â‚¬â€ but you have 7 days to undo it.
              </div>
              <div style={{ display:"flex", justifyContent:"flex-end", gap:"0.45rem" }}>
                <button className="btn btn-primary" onClick={()=>setStartFreshConfirmOpen(false)} style={{ fontSize:"0.56rem" }}>Cancel</button>
                <button className="btn" onClick={startFreshPlan} style={{ fontSize:"0.56rem", color:"var(--muted)", borderColor:"var(--border)", background:"transparent" }}>Yes, start fresh</button>
              </div>
            </div>
          </div>
        )}
        {DEBUG_MODE && <RuntimeInspector snapshot={runtimeDebugSnapshot} />}
      </div>
      )}
    </div>
  );
}

function RuntimeInspector({ snapshot }) {
  const copySnapshot = async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      }
    } catch {}
  };
  const line = (label, value, tone = "var(--muted)") => (
    <div style={{ fontSize:"0.52rem", color:tone, lineHeight:1.6 }}>
      <span style={{ color:"var(--text)" }}>{label}:</span> {value || "none"}
    </div>
  );
  const compactList = (items) => (Array.isArray(items) && items.length ? items.join(" Ã¢â‚¬Â¢ ") : "none");
  return (
    <details style={{ position:"fixed", right:14, bottom:14, width:"min(420px, calc(100vw - 28px))", zIndex:70 }}>
      <summary className="btn" style={{ width:"100%", justifyContent:"space-between", background:"rgba(5,10,18,0.92)", borderColor:"rgba(0,194,255,0.35)", color:"var(--text)", fontSize:"0.56rem" }}>
        Runtime Inspector
        <span style={{ color:"var(--muted)", fontSize:"0.5rem" }}>{snapshot?.storage?.label || "UNKNOWN"}</span>
      </summary>
      <div className="card card-soft" style={{ marginTop:"0.35rem", background:"rgba(4,9,18,0.96)", borderColor:"rgba(0,194,255,0.2)", backdropFilter:"blur(12px)", maxHeight:"70vh", overflowY:"auto" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.45rem", gap:"0.45rem" }}>
          <div style={{ fontSize:"0.48rem", color:"var(--muted)" }}>Canonical runtime snapshot</div>
          <button className="btn" onClick={copySnapshot} style={{ fontSize:"0.48rem", padding:"0.24rem 0.5rem", minHeight:0 }}>Copy JSON</button>
        </div>
        <div style={{ display:"grid", gap:"0.6rem" }}>
          <div>
            <div className="sect-title" style={{ fontSize:"0.62rem", marginBottom:"0.25rem" }}>PlanDay</div>
            {line("Date", snapshot?.planDay?.dateKey)}
            {line("Session", snapshot?.planDay?.label)}
            {line("Decision", `${snapshot?.planDay?.decisionMode || "unknown"} / ${snapshot?.planDay?.confidence || "unknown"}`)}
            {line("Modified", snapshot?.planDay?.modifiedFromBase ? "yes" : "no", snapshot?.planDay?.modifiedFromBase ? C.amber : "var(--muted)")}
            {line("Why", snapshot?.planDay?.provenanceSummary)}
            {line("Drivers", compactList(snapshot?.planDay?.keyDrivers))}
          </div>
          <div>
            <div className="sect-title" style={{ fontSize:"0.62rem", marginBottom:"0.25rem" }}>PlanWeek</div>
            {line("Week", `${snapshot?.planWeek?.weekNumber || "?"} Ã¢â‚¬Â¢ ${snapshot?.planWeek?.label || snapshot?.planWeek?.phase || "unlabeled"}`)}
            {line("Focus", snapshot?.planWeek?.focus)}
            {line("Biases", [snapshot?.planWeek?.aggressionLevel, snapshot?.planWeek?.recoveryBias, snapshot?.planWeek?.volumeBias, snapshot?.planWeek?.performanceBias].filter(Boolean).join(" Ã¢â‚¬Â¢ "))}
            {line("Nutrition", snapshot?.planWeek?.nutritionEmphasis)}
            {line("Constraints", compactList(snapshot?.planWeek?.constraints))}
            {line("Status", `${snapshot?.planWeek?.status || "planned"}${snapshot?.planWeek?.adjusted ? " Ã¢â‚¬Â¢ adjusted" : ""}`)}
          </div>
          <div>
            <div className="sect-title" style={{ fontSize:"0.62rem", marginBottom:"0.25rem" }}>Readiness</div>
            {line("State", snapshot?.readiness?.stateLabel || snapshot?.readiness?.state)}
            {line("Source", `${snapshot?.readiness?.source || "unknown"}${snapshot?.readiness?.inputDriven ? " Ã¢â‚¬Â¢ input-driven" : ""}`)}
            {line("Summary", snapshot?.readiness?.userVisibleLine)}
            {line("Factors", compactList(snapshot?.readiness?.factors))}
          </div>
          <div>
            <div className="sect-title" style={{ fontSize:"0.62rem", marginBottom:"0.25rem" }}>Nutrition</div>
            {line("Day type", snapshot?.nutrition?.dayType)}
            {line("Actual logged", snapshot?.nutrition?.actualLogged ? "yes" : "no", snapshot?.nutrition?.actualLogged ? C.green : "var(--muted)")}
            {line("Compliance", snapshot?.nutrition?.compliance)}
            {line("Deviation", snapshot?.nutrition?.deviationKind)}
            {line("Comparison", `${snapshot?.nutrition?.comparisonStatus || "unknown"}${snapshot?.nutrition?.comparisonImpact ? ` Ã¢â‚¬Â¢ ${snapshot.nutrition.comparisonImpact}` : ""}`)}
            {line("Summary", snapshot?.nutrition?.comparisonSummary)}
          </div>
          <div>
            <div className="sect-title" style={{ fontSize:"0.62rem", marginBottom:"0.25rem" }}>Logging And History</div>
            {line("Session status", snapshot?.logging?.sessionStatus)}
            {line("Check-in", `${snapshot?.logging?.checkinStatus || "none"}${snapshot?.logging?.hasCheckin ? " Ã¢â‚¬Â¢ saved" : ""}`)}
            {line("Nutrition log", snapshot?.logging?.hasNutritionLog ? "saved" : "missing")}
            {line("Plan history", `rev ${snapshot?.prescribedHistory?.revisionNumber || 0} of ${snapshot?.prescribedHistory?.revisionCount || 0}`)}
            {line("Snapshot source", `${snapshot?.prescribedHistory?.sourceType || "none"}${snapshot?.prescribedHistory?.durability ? ` Ã¢â‚¬Â¢ ${snapshot.prescribedHistory.durability}` : ""}`)}
          </div>
          <div>
            <div className="sect-title" style={{ fontSize:"0.62rem", marginBottom:"0.25rem" }}>AI Boundary</div>
            {line("Analyzing", snapshot?.ai?.analyzing ? "yes" : "no", snapshot?.ai?.analyzing ? C.amber : "var(--muted)")}
            {line("Plan proposal", snapshot?.ai?.latestAcceptedPlanProposal ? `${snapshot.ai.latestAcceptedPlanProposal.type || "accepted"} Ã¢â‚¬Â¢ ${snapshot.ai.latestAcceptedPlanProposal.acceptedBy || "gate"}` : "none accepted")}
            {line("Plan packet", snapshot?.ai?.latestAcceptedPlanProposal ? `${snapshot.ai.latestAcceptedPlanProposal.packetIntent || "unknown"} Ã¢â‚¬Â¢ ${snapshot.ai.latestAcceptedPlanProposal.packetVersion || ""}` : "none")}
            {line("Coach action", snapshot?.ai?.latestAcceptedCoachAction ? `${snapshot.ai.latestAcceptedCoachAction.type || "accepted"} Ã¢â‚¬Â¢ ${snapshot.ai.latestAcceptedCoachAction.acceptedBy || "gate"}` : "none accepted")}
            {line("Coach source", snapshot?.ai?.latestAcceptedCoachAction ? `${snapshot.ai.latestAcceptedCoachAction.proposalSource || "unknown"} Ã¢â‚¬Â¢ ${snapshot.ai.latestAcceptedCoachAction.acceptancePolicy || "unknown"}` : "none")}
          </div>
        </div>
      </div>
    </details>
  );
}

function OnboardingCoach({ onComplete, startingFresh = false, existingMemory = [] }) {
  const initialPrompt = startingFresh
    ? "Starting fresh. I still remember everything from before Ã¢â‚¬â€ I'm just building a new plan from today. What's the primary goal this time?"
    : "Hey. I'm going to ask you a few questions before I build your plan. No right answers Ã¢â‚¬â€ just pick what fits best. What's your primary goal?";
  const BUILD_STAGES = [
    "Mapping your training blocks...",
    "Calibrating intensity to your baseline...",
    "Setting up your nutrition targets...",
    "Almost ready...",
  ];
  const messagesRef = useRef([]);
  const scrollRef = useRef(null);
  const composerRef = useRef(null);
  const nextMessageIdRef = useRef(1);
  const startedRef = useRef(false);
  const [messages, setMessages] = useState([]);
  const [answers, setAnswers] = useState({});
  const [stepIndex, setStepIndex] = useState(0);
  const [draft, setDraft] = useState("");
  const [equipmentSelection, setEquipmentSelection] = useState([]);
  const [equipmentOther, setEquipmentOther] = useState("");
  const [phase, setPhase] = useState("questions");
  const [assessmentText, setAssessmentText] = useState("");
  const [assessing, setAssessing] = useState(false);
  const [streamTargetId, setStreamTargetId] = useState(null);
  const [buildingStageIndex, setBuildingStageIndex] = useState(0);

  const flow = useMemo(() => ([
    { key: "primary_goal", type: "buttons", message: initialPrompt, options: PRIMARY_GOAL_OPTIONS.map(k => PRIMARY_GOAL_LABELS[k]), valueMap: Object.fromEntries(PRIMARY_GOAL_OPTIONS.map(k => [PRIMARY_GOAL_LABELS[k], k])) },
    { key: "experience_level", type: "buttons", message: "Got it. How long have you been training consistently?", options: EXPERIENCE_LEVEL_OPTIONS.map(k => EXPERIENCE_LEVEL_LABELS[k]), valueMap: Object.fromEntries(EXPERIENCE_LEVEL_OPTIONS.map(k => [EXPERIENCE_LEVEL_LABELS[k], k])) },
    { key: "training_days", type: "buttons", message: "How many days a week can you realistically train? Think about your average week Ã¢â‚¬â€ not your best one.", options: ["2", "3", "4", "5", "6+"] },
    { key: "session_length", type: "buttons", message: "How much time do you have per session?", options: SESSION_LENGTH_OPTIONS.map(k => SESSION_LENGTH_LABELS[k]), valueMap: Object.fromEntries(SESSION_LENGTH_OPTIONS.map(k => [SESSION_LENGTH_LABELS[k], k])) },
    { key: "training_location", type: "buttons", message: "Where do you usually work out?", options: ["Home", "Gym", "Both", "Varies a lot"] },
    ...(["Home", "Both"].includes(answers.training_location || "") ? [{
      key: "home_equipment",
      type: "multiselect",
      message: "What do you have available at home?",
      options: ["Dumbbells", "Resistance bands", "Pull-up bar", "Bodyweight only", "Other"],
    }] : []),
    { key: "injury_text", type: "text_optional", message: "Do you have any injuries or physical limitations I need to plan around?", placeholder: "Anything current?", skipLabel: "Nothing current", skipValue: "Nothing current" },
    { key: "coaching_style", type: "buttons", message: "Last one Ã¢â‚¬â€ how do you want to be coached?", options: ["Push me hard", "Find the balance", "Keep it simple", "Let the data decide"] },
  ]), [answers.training_location, initialPrompt]);
  const currentPrompt = flow[stepIndex] || null;
  const isCoachStreaming = Boolean(streamTargetId);

  useEffect(() => {
    messagesRef.current = messages;
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    const id = nextMessageIdRef.current++;
    setMessages([{ id, role: "coach", text: initialPrompt, displayedText: "" }]);
    setStreamTargetId(id);
  }, [initialPrompt]);

  useEffect(() => {
    if (streamTargetId || phase === "building") return;
    const nextStream = messagesRef.current.find((message) => message.role === "coach" && message.displayedText !== message.text);
    if (nextStream) setStreamTargetId(nextStream.id);
  }, [messages, streamTargetId, phase]);

  useEffect(() => {
    if (!streamTargetId) return;
    const target = messagesRef.current.find((message) => message.id === streamTargetId);
    if (!target) {
      setStreamTargetId(null);
      return;
    }
    const tokens = target.text.match(/\S+\s*/g) || [target.text];
    let index = 0;
    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      index += 1;
      const nextText = tokens.slice(0, index).join("");
      setMessages((prev) => prev.map((message) => (
        message.id === streamTargetId ? { ...message, displayedText: nextText } : message
      )));
      if (index < tokens.length) {
        setTimeout(tick, index < 10 ? 55 : 28);
      } else {
        setStreamTargetId(null);
      }
    };
    const timer = setTimeout(tick, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [streamTargetId]);

  useEffect(() => {
    if (currentPrompt?.key === "home_equipment") {
      setEquipmentSelection(Array.isArray(answers.home_equipment) ? answers.home_equipment : []);
      setEquipmentOther(String(answers.home_equipment_other || ""));
    } else {
      setEquipmentSelection([]);
      setEquipmentOther("");
    }
  }, [currentPrompt?.key]);

  useEffect(() => {
    if (phase !== "building") return undefined;
    setBuildingStageIndex(0);
    const interval = setInterval(() => {
      setBuildingStageIndex((prev) => (prev + 1) % BUILD_STAGES.length);
    }, 900);
    return () => clearInterval(interval);
  }, [phase]);

  useEffect(() => {
    if (!isCoachStreaming && composerRef.current) composerRef.current.focus();
  }, [isCoachStreaming, currentPrompt?.key, phase]);

  const appendCoachMessage = (text) => {
    const id = nextMessageIdRef.current++;
    setMessages((prev) => [...prev, { id, role: "coach", text, displayedText: "" }]);
    if (!streamTargetId) setStreamTargetId(id);
    return id;
  };
  const appendUserMessage = (text) => {
    const clean = String(text || "").trim();
    if (!clean) return;
    const id = nextMessageIdRef.current++;
    setMessages((prev) => [...prev, { id, role: "user", text: clean, displayedText: clean }]);
  };
  const callAnthropicIntake = async (prompt) => {
    const key = safeStorageGet(localStorage, "coach_api_key", "") || safeStorageGet(localStorage, "anthropic_api_key", "");
    if (!key) return null;
    try {
      const res = await safeFetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": key,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-latest",
          max_tokens: 280,
          messages: [{ role: "user", content: prompt }],
        }),
      }, 10000);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.content?.[0]?.text || null;
    } catch {
      return null;
    }
  };
  const buildTimelineFallback = (payload) => {
    const goalLabel = PRIMARY_GOAL_LABELS[payload.primary_goal] || "your main goal";
    const days = String(payload.training_days || "3");
    const sessionLen = SESSION_LENGTH_LABELS[payload.session_length] || "30 min";
    const expLevel = EXPERIENCE_LEVEL_LABELS[payload.experience_level] || "your level";
    const injuryNote = payload.injury_text && !/nothing current|none|nope|healthy/i.test(payload.injury_text)
      ? ` I'll work around ${payload.injury_text.toLowerCase()}.`
      : "";
    return `With ${goalLabel.toLowerCase()} as the focus, ${days} days a week at ${sessionLen} per session is a solid setup for someone at the ${expLevel.toLowerCase()} level. The next 30 days are about locking in a repeatable rhythm. By 60 days you should see measurable progress, and by 90 days the results compound if consistency stays real.${injuryNote} Here's what I'm prioritizing in your plan: ${goalLabel.toLowerCase()} first.`;
  };
  const buildTimelineAssessment = async (payload) => {
    const prompt = `User intake data: ${JSON.stringify({
      primary_goal: payload.primary_goal,
      experience_level: payload.experience_level,
      training_days: payload.training_days,
      session_length: payload.session_length,
      training_location: payload.training_location,
      equipment: payload.home_equipment || [],
      injuries: payload.injury_text || "None",
      previous_coach_memory: (existingMemory || []).slice(-8),
    }, null, 2)}

Generate a realistic assessment for this goal profile.
- What is achievable in 30, 60, 90 days given their experience and availability
- Note any constraints from injuries or equipment
- Lead with what IS possible, not what isn't
- End with: here's what I'm prioritizing in your plan
Maximum 150 words total.
Conversational. No bullet points.
Sound like a coach who has done this a hundred times.`;
    const ai = await callAnthropicIntake(prompt);
    if (ai) return ai.replace(/\s+/g, " ").trim();
    return buildTimelineFallback(payload);
  };
  const advanceConversation = async (updatedAnswers) => {
    const nextIndex = stepIndex + 1;
    setAnswers(updatedAnswers);
    setDraft("");
    const nextFlow = [
      { key: "primary_goal", type: "buttons", message: initialPrompt, options: PRIMARY_GOAL_OPTIONS.map(k => PRIMARY_GOAL_LABELS[k]), valueMap: Object.fromEntries(PRIMARY_GOAL_OPTIONS.map(k => [PRIMARY_GOAL_LABELS[k], k])) },
      { key: "experience_level", type: "buttons", message: "Got it. How long have you been training consistently?", options: EXPERIENCE_LEVEL_OPTIONS.map(k => EXPERIENCE_LEVEL_LABELS[k]), valueMap: Object.fromEntries(EXPERIENCE_LEVEL_OPTIONS.map(k => [EXPERIENCE_LEVEL_LABELS[k], k])) },
      { key: "training_days", type: "buttons", message: "How many days a week can you realistically train? Think about your average week Ã¢â‚¬â€ not your best one.", options: ["2", "3", "4", "5", "6+"] },
      { key: "session_length", type: "buttons", message: "How much time do you have per session?", options: SESSION_LENGTH_OPTIONS.map(k => SESSION_LENGTH_LABELS[k]), valueMap: Object.fromEntries(SESSION_LENGTH_OPTIONS.map(k => [SESSION_LENGTH_LABELS[k], k])) },
      { key: "training_location", type: "buttons", message: "Where do you usually work out?", options: ["Home", "Gym", "Both", "Varies a lot"] },
      ...(["Home", "Both"].includes(updatedAnswers.training_location || "") ? [{
        key: "home_equipment",
        type: "multiselect",
        message: "What do you have available at home?",
        options: ["Dumbbells", "Resistance bands", "Pull-up bar", "Bodyweight only", "Other"],
      }] : []),
      { key: "injury_text", type: "text_optional", message: "Do you have any injuries or physical limitations I need to plan around?", placeholder: "Anything current?", skipLabel: "Nothing current", skipValue: "Nothing current" },
      { key: "coaching_style", type: "buttons", message: "Last one Ã¢â‚¬â€ how do you want to be coached?", options: ["Push me hard", "Find the balance", "Keep it simple", "Let the data decide"] },
    ];
    if (nextIndex < nextFlow.length) {
      setStepIndex(nextIndex);
      appendCoachMessage(nextFlow[nextIndex].message);
      return;
    }
    setAssessing(true);
    setPhase("assessment");
    const timeline = await buildTimelineAssessment(updatedAnswers);
    setAssessmentText(timeline);
    appendCoachMessage(timeline);
    setAssessing(false);
    setPhase("review");
  };
  const submitCurrentAnswer = async (value, explicitKey = currentPrompt?.key) => {
    const clean = String(value || "").trim();
    if (!explicitKey) return;
    if (!clean && currentPrompt?.type === "text") return;
    appendUserMessage(clean);
    const storedValue = currentPrompt?.valueMap?.[clean] ?? clean;
    await advanceConversation({ ...answers, [explicitKey]: storedValue });
  };
  const submitEquipmentAnswer = async () => {
    const normalized = [
      ...equipmentSelection.filter((item) => item !== "Other"),
      ...(equipmentSelection.includes("Other") && equipmentOther.trim() ? ["Other"] : []),
    ];
    if (normalized.length === 0 && !equipmentOther.trim()) return;
    const display = [
      ...equipmentSelection.filter((item) => item !== "Other"),
      ...(equipmentSelection.includes("Other") && equipmentOther.trim() ? [equipmentOther.trim()] : []),
    ].join(" / ");
    appendUserMessage(display);
    await advanceConversation({
      ...answers,
      home_equipment: equipmentSelection,
      home_equipment_other: equipmentOther.trim(),
    });
  };
  const requestAdjustment = () => {
    appendUserMessage("I want to adjust something");
    setPhase("adjust");
    setDraft("");
    appendCoachMessage("Tell me what you want to change and I'll recalibrate it before I build.");
  };
  const submitAdjustment = async () => {
    const clean = String(draft || "").trim();
    if (!clean) return;
    appendUserMessage(clean);
    setDraft("");
    setAssessing(true);
    setPhase("assessment");
    const updatedAnswers = { ...answers, timeline_adjustment: clean };
    setAnswers(updatedAnswers);
    const timeline = await buildTimelineAssessment(updatedAnswers);
    setAssessmentText(timeline);
    appendCoachMessage(timeline);
    setAssessing(false);
    setPhase("review");
  };
  const finalizePlan = async () => {
    appendUserMessage("Looks good, build my plan");
    setPhase("building");
    const payload = {
      ...answers,
      timeline_assessment: assessmentText,
      starting_fresh: startingFresh,
    };
    await new Promise((resolve) => setTimeout(resolve, 3200));
    await onComplete(payload);
  };

  return (
    <div style={{ minHeight:"100vh", display:"flex", justifyContent:"center", background:"radial-gradient(120% 120% at 10% 0%, rgba(0,194,255,0.12), transparent 36%), radial-gradient(110% 110% at 100% 0%, rgba(124,92,255,0.18), transparent 40%), linear-gradient(180deg,#05080f 0%, #0a1322 55%, #0d182b 100%)", padding:"1.25rem 1rem 1.5rem" }}>
      <div style={{ width:"100%", maxWidth:860, display:"grid", gridTemplateRows:"auto 1fr", gap:"1rem" }}>
        <div style={{ display:"flex", alignItems:"center", gap:"0.75rem", color:"#dbe7f6" }}>
          <div style={{ width:42, height:42, borderRadius:999, display:"grid", placeItems:"center", background:"linear-gradient(135deg,#13243a 0%, #1a3553 100%)", border:"1px solid rgba(111,148,198,0.28)", fontFamily:"'Space Grotesk',sans-serif", fontWeight:700, letterSpacing:"0.08em" }}>
            PT
          </div>
          <div>
            <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:"0.98rem", letterSpacing:"0.04em", color:"#f8fbff" }}>Coach</div>
            <div style={{ fontSize:"0.54rem", color:"#8fa5c8", letterSpacing:"0.06em" }}>INTAKE CHAT</div>
          </div>
        </div>
        <div style={{ border:"1px solid rgba(111,148,198,0.18)", borderRadius:24, background:"rgba(8,14,25,0.82)", boxShadow:"0 24px 54px rgba(0,0,0,0.36)", minHeight:0, overflow:"hidden", display:"grid", gridTemplateRows:"1fr auto" }}>
          <div ref={scrollRef} style={{ padding:"1.1rem 1rem 0.8rem", overflowY:"auto", display:"grid", gap:"0.7rem", alignContent:"start" }}>
            {messages.map((message) => (
              <div key={message.id} style={{ justifySelf:message.role === "user" ? "end" : "start", maxWidth:"min(78ch, 88%)" }}>
                <div style={{
                  background:message.role === "user" ? "linear-gradient(135deg, rgba(0,194,255,0.22), rgba(0,194,255,0.08))" : "linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))",
                  border:message.role === "user" ? "1px solid rgba(0,194,255,0.28)" : "1px solid rgba(111,148,198,0.18)",
                  borderRadius:message.role === "user" ? "18px 18px 6px 18px" : "18px 18px 18px 6px",
                  padding:"0.78rem 0.9rem",
                  fontSize:"0.96rem",
                  lineHeight:1.75,
                  color:message.role === "user" ? "#e8f8ff" : "#dbe7f6",
                  whiteSpace:"pre-wrap",
                  boxShadow:message.role === "user" ? "0 10px 24px rgba(0,194,255,0.08)" : "none",
                }}>
                  {message.displayedText}
                  {message.role === "coach" && message.displayedText !== message.text && <span style={{ opacity:0.7 }}>|</span>}
                </div>
              </div>
            ))}
            {assessing && (
              <div style={{ justifySelf:"start", maxWidth:"88%" }}>
                <div style={{ background:"linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02))", border:"1px solid rgba(111,148,198,0.18)", borderRadius:"18px 18px 18px 6px", padding:"0.72rem 0.88rem", fontSize:"0.84rem", color:"#8fa5c8" }}>
                  Coach is sizing up the timeline...
                </div>
              </div>
            )}
          </div>
          <div style={{ borderTop:"1px solid rgba(111,148,198,0.14)", padding:"0.9rem 1rem 1rem", background:"rgba(7,12,21,0.92)" }}>
            {phase === "questions" && currentPrompt && !isCoachStreaming && (
              <div style={{ display:"grid", gap:"0.6rem" }}>
                {currentPrompt.type === "buttons" && (
                  <div style={{ display:"grid", gridTemplateColumns:`repeat(${Math.min(currentPrompt.options.length, 4)}, minmax(0,1fr))`, gap:"0.45rem" }}>
                    {currentPrompt.options.map((option) => (
                      <button key={option} className="btn" onClick={() => submitCurrentAnswer(option)} style={{ minHeight:46, fontSize:"0.68rem", color:"#dbe7f6", borderColor:"#324961" }}>
                        {option}
                      </button>
                    ))}
                  </div>
                )}
                {currentPrompt.type === "multiselect" && (
                  <div style={{ display:"grid", gap:"0.55rem" }}>
                    <div style={{ display:"flex", gap:"0.45rem", flexWrap:"wrap" }}>
                      {currentPrompt.options.map((option) => {
                        const selected = equipmentSelection.includes(option);
                        return (
                          <button
                            key={option}
                            className="btn"
                            onClick={() => setEquipmentSelection((prev) => selected ? prev.filter((item) => item !== option) : [...prev, option])}
                            style={{ fontSize:"0.64rem", color:selected ? C.green : "#c4d4ec", borderColor:selected ? C.green+"45" : "#324961", background:selected ? "rgba(39,245,154,0.09)" : undefined }}
                          >
                            {option}
                          </button>
                        );
                      })}
                    </div>
                    {equipmentSelection.includes("Other") && (
                      <input ref={composerRef} value={equipmentOther} onChange={(e) => setEquipmentOther(e.target.value)} placeholder="Other home setup" />
                    )}
                    <button className="btn btn-primary" onClick={submitEquipmentAnswer} disabled={equipmentSelection.length === 0 || (equipmentSelection.includes("Other") && !equipmentOther.trim())}>
                      Continue
                    </button>
                  </div>
                )}
                {(currentPrompt.type === "text" || currentPrompt.type === "text_optional") && (
                  <div style={{ display:"grid", gap:"0.5rem" }}>
                    <textarea
                      ref={composerRef}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder={currentPrompt.placeholder || "Type your response..."}
                      rows={3}
                      style={{ minHeight:96, resize:"vertical", fontSize:"0.9rem", lineHeight:1.55 }}
                    />
                    <div style={{ display:"flex", gap:"0.5rem", flexWrap:"wrap" }}>
                      <button className="btn btn-primary" onClick={() => submitCurrentAnswer(draft)} disabled={!draft.trim()}>
                        Send
                      </button>
                      {currentPrompt.type === "text_optional" && (
                        <button className="btn" onClick={() => submitCurrentAnswer(currentPrompt.skipValue || currentPrompt.skipLabel)} style={{ color:"#9fb4d3", borderColor:"#324961" }}>
                          {currentPrompt.skipLabel}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {phase === "review" && !isCoachStreaming && (
              <div style={{ display:"grid", gap:"0.55rem" }}>
                <div style={{ fontSize:"0.72rem", color:"#9fb4d3", letterSpacing:"0.05em" }}>Does this feel right?</div>
                <div style={{ display:"flex", gap:"0.5rem", flexWrap:"wrap" }}>
                  <button className="btn btn-primary" onClick={finalizePlan}>
                    Looks good, build my plan
                  </button>
                  <button className="btn" onClick={requestAdjustment} style={{ color:"#dbe7f6", borderColor:"#324961" }}>
                    I want to adjust something
                  </button>
                </div>
              </div>
            )}

            {phase === "adjust" && !isCoachStreaming && (
              <div style={{ display:"grid", gap:"0.5rem" }}>
                <textarea
                  ref={composerRef}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Tell me what you want to change..."
                  rows={3}
                  style={{ minHeight:96, resize:"vertical", fontSize:"0.9rem", lineHeight:1.55 }}
                />
                <button className="btn btn-primary" onClick={submitAdjustment} disabled={!draft.trim()}>
                  Update the assessment
                </button>
              </div>
            )}

            {phase === "building" && (
              <div style={{ display:"grid", gap:"0.4rem" }}>
                <div style={{ fontFamily:"'Space Grotesk',sans-serif", fontSize:"1rem", color:"#f8fbff" }}>Building your plan...</div>
                <div style={{ fontSize:"0.84rem", color:"#9fb4d3" }}>{BUILD_STAGES[buildingStageIndex]}</div>
                <div style={{ width:"100%", height:6, borderRadius:999, background:"rgba(111,148,198,0.14)", overflow:"hidden" }}>
                  <div style={{ width:`${((buildingStageIndex + 1) / BUILD_STAGES.length) * 100}%`, height:"100%", borderRadius:999, background:"linear-gradient(90deg, #00c2ff, #27f59a)", transition:"width 0.45s ease" }} />
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SettingsTab({ onStartFresh, personalization, setPersonalization, onPersist, exportData, importData, authSession, onReloadCloudData, onDeleteAccount, deviceSyncAudit }) {
  const appleHealth = personalization?.connectedDevices?.appleHealth || {};
  const garmin = personalization?.connectedDevices?.garmin || {};
  const [connectOpen, setConnectOpen] = useState(false);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState("");
  const [garminMsg, setGarminMsg] = useState("");
  const [garminFix, setGarminFix] = useState("");
  const [garminBusy, setGarminBusy] = useState("");
  const [settingsSaveMsg, setSettingsSaveMsg] = useState("");
  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteStep, setDeleteStep] = useState(1);
  const [backupCode, setBackupCode] = useState("");
  const [backupMsg, setBackupMsg] = useState("");
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [pendingRestoreCode, setPendingRestoreCode] = useState("");
  const [appleImportText, setAppleImportText] = useState("");
  const [garminImportText, setGarminImportText] = useState("");
  const [importMsg, setImportMsg] = useState("");
  const [locationMsg, setLocationMsg] = useState("");
  const settings = personalization?.settings || DEFAULT_PERSONALIZATION.settings;
  const profile = personalization?.profile || DEFAULT_PERSONALIZATION.profile;
  const unitSettings = settings?.units || DEFAULT_PERSONALIZATION.settings.units;
  const trainingPrefs = settings?.trainingPreferences || DEFAULT_PERSONALIZATION.settings.trainingPreferences;
  const appearance = settings?.appearance || DEFAULT_PERSONALIZATION.settings.appearance;
  const notif = settings?.notifications || DEFAULT_PERSONALIZATION.settings.notifications;

  const patchSettings = async (patch = {}) => {
    const next = mergePersonalization(personalization, {
      settings: {
        ...(settings || {}),
        ...(patch || {}),
        units: { ...(settings?.units || {}), ...(patch?.units || {}) },
        trainingPreferences: { ...(settings?.trainingPreferences || {}), ...(patch?.trainingPreferences || {}) },
        appearance: { ...(settings?.appearance || {}), ...(patch?.appearance || {}) },
        notifications: { ...(settings?.notifications || {}), ...(patch?.notifications || {}) },
      },
    });
    setPersonalization(next);
    await onPersist(next);
    setSettingsSaveMsg(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  };

  const patchProfile = async (patch = {}) => {
    const next = mergePersonalization(personalization, { profile: { ...(profile || {}), ...(patch || {}) } });
    setPersonalization(next);
    await onPersist(next);
    setSettingsSaveMsg(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  };

  const persistAppleHealth = async (patch = {}) => {
    const next = mergePersonalization(personalization, {
      connectedDevices: {
        ...(personalization?.connectedDevices || {}),
        appleHealth: { ...appleHealth, ...(patch || {}) },
      },
    });
    setPersonalization(next);
    await onPersist(next);
    setSettingsSaveMsg(`Saved ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`);
  };
  const requestAppleHealth = async () => {
    const now = Date.now();
    let status = "connected";
    try {
      const handler = window?.webkit?.messageHandlers?.healthkit;
      if (handler?.postMessage) {
        handler.postMessage({ type: "request_permissions", permissions: HEALTHKIT_PERMISSIONS });
      } else {
        status = "simulated_web";
      }
    } catch {
      status = "simulated_web";
    }
    await persistAppleHealth({
      status,
      connectionMode: status === "simulated_web" ? "simulated" : "live",
      permissionRequestedAt: now,
      permissionsGranted: [...HEALTHKIT_PERMISSIONS],
      skipped: false,
    });
    setConnectOpen(false);
  };
  const callGarminApi = async (path, { method = "POST", body } = {}) => {
    if (!authSession?.access_token) {
      setGarminMsg("You must be signed in before using Garmin Connect.");
      setGarminFix("Sign in again, then retry from Settings.");
      return null;
    }
    const res = await fetch(path, {
      method,
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${authSession.access_token}`,
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setGarminMsg(data?.message || `Garmin request failed (${res.status}).`);
      setGarminFix(data?.fix || "");
      return null;
    }
    setGarminMsg(data?.message || "");
    setGarminFix(data?.fix || "");
    return data;
  };
  const connectGarmin = async () => {
    setGarminBusy("connect");
    setGarminMsg("Preparing Garmin authorization...");
    setGarminFix("");
    try {
      const data = await callGarminApi("/api/auth/garmin", { method: "POST" });
      if (data?.authorizeUrl) {
        window.location.assign(data.authorizeUrl);
        return;
      }
    } catch (e) {
      setGarminMsg(`Garmin setup failed: ${e?.message || "unknown error"}`);
      setGarminFix("Confirm the Garmin developer settings and Vercel env vars, then retry.");
    }
    setGarminBusy("");
  };
  const syncGarminNow = async () => {
    setGarminBusy("sync");
    setGarminMsg("Syncing Garmin now...");
    setGarminFix("");
    try {
      const data = await callGarminApi("/api/auth/garmin/sync", { method: "POST" });
      if (data) await onReloadCloudData?.();
    } finally {
      setGarminBusy("");
    }
  };
  const disconnectGarmin = async () => {
    setGarminBusy("disconnect");
    setGarminFix("");
    try {
      const data = await callGarminApi("/api/auth/garmin/disconnect", { method: "POST" });
      if (data) await onReloadCloudData?.();
    } finally {
      setGarminBusy("");
    }
  };
  const activeAppleTypes = appleHealth?.permissionsGranted?.length ? appleHealth.permissionsGranted.join(", ") : "None";
  const lastGarminActivity = (garmin?.activities || []).slice(-1)[0];
  const profileWeightVal = profile?.weight ?? profile?.bodyweight ?? "";
  const profileHeightVal = profile?.height ?? "";
  const garminLastSyncLabel = garmin?.lastSyncAt ? new Date(garmin.lastSyncAt).toLocaleString() : "never";
  const formatIntegrationTimestamp = (value) => value ? new Date(value).toLocaleString() : "never";
  const integrationStateTone = (state = "idle") => {
    if (state === "operational") return { color: C.green, bg: `${C.green}14` };
    if (state === "pending") return { color: C.blue, bg: `${C.blue}14` };
    if (state === "manual") return { color: C.amber, bg: `${C.amber}14` };
    if (state === "simulated") return { color: C.purple, bg: `${C.purple}14` };
    return { color: "#8fa5c8", bg: "rgba(143,165,200,0.12)" };
  };
  const integrationDevVisible = useMemo(() => {
    if (typeof window === "undefined") return appleHealth?.status === "simulated_web";
    try {
      const params = new URLSearchParams(window.location.search);
      return params.get("devtools") === "1"
        || ["localhost", "127.0.0.1"].includes(window.location.hostname)
        || appleHealth?.status === "simulated_web";
    } catch {
      return appleHealth?.status === "simulated_web";
    }
  }, [appleHealth?.status]);
  const appleMode = appleHealth?.connectionMode
    || (appleHealth?.status === "simulated_web" ? "simulated" : appleHealth?.status === "manual_import" ? "manual_import" : appleHealth?.status === "connected" ? "live" : "unavailable");
  const appleIntegration = (() => {
    if (appleMode === "live" && appleHealth?.lastSyncStatus === "garmin_detected") {
      return {
        state: "operational",
        label: "Operational",
        summary: "Apple Health is live and recent Garmin-origin workouts were verified.",
        detail: `Last verified check: ${formatIntegrationTimestamp(appleHealth?.lastConnectionCheck)}.`,
      };
    }
    if (appleMode === "live") {
      return {
        state: "pending",
        label: "Connected, awaiting verification",
        summary: appleHealth?.lastSyncStatus === "health_only"
          ? "Apple Health is connected, but Garmin-origin workouts have not been verified yet."
          : "Apple Health permissions were requested, but a recent live workout verification has not happened yet.",
        detail: `Last check: ${formatIntegrationTimestamp(appleHealth?.lastConnectionCheck)}.`,
      };
    }
    if (appleMode === "manual_import") {
      return {
        state: "manual",
        label: "Manual import only",
        summary: "Apple Health data exists from a manual JSON import, not from a live device permission flow.",
        detail: `Imported: ${formatIntegrationTimestamp(appleHealth?.importedAt)}.`,
      };
    }
    if (appleMode === "simulated") {
      return {
        state: "simulated",
        label: "Simulated on web",
        summary: "Apple Health cannot be authorized in this web environment, so the app is using a simulated placeholder state.",
        detail: "Use an iPhone-capable environment for a real Apple Health permission flow.",
      };
    }
    if (appleHealth?.skipped) {
      return {
        state: "unavailable",
        label: "Not enabled",
        summary: "Apple Health has been skipped or not enabled yet.",
        detail: "Connect it when you want live workout/device context.",
      };
    }
    return {
      state: "unavailable",
      label: "Not configured",
      summary: "Apple Health is not connected.",
      detail: "No live permission flow or manual import is active.",
    };
  })();
  const garminMode = garmin?.connectionMode || (garmin?.status === "manual_import" ? "manual_import" : garmin?.status === "connected" ? "live" : "unavailable");
  const garminIntegration = (() => {
    if (garminMode === "live" && garmin?.lastSyncAt && (garmin?.activities || []).length > 0) {
      return {
        state: "operational",
        label: "Operational",
        summary: "Garmin Connect is live and recent activities have synced through the server integration.",
        detail: `Last sync: ${garminLastSyncLabel}.`,
      };
    }
    if (garminMode === "live") {
      return {
        state: "pending",
        label: "Connected, never synced",
        summary: "Garmin authorization exists, but no completed sync has been recorded yet.",
        detail: `Last sync: ${garminLastSyncLabel}.`,
      };
    }
    if (garminMode === "manual_import") {
      return {
        state: "manual",
        label: "Manual import only",
        summary: "Garmin activity data exists from a manual import, not from the live server-side integration.",
        detail: `Imported: ${formatIntegrationTimestamp(garmin?.importedAt)}.`,
      };
    }
    return {
      state: "unavailable",
      label: "Not configured",
      summary: "Garmin Connect is not configured.",
      detail: "No live authorization or manual import is active.",
    };
  })();
  const locationIntegration = (() => {
    const status = personalization?.localFoodContext?.locationStatus || personalization?.connectedDevices?.location?.status || "unknown";
    if (status === "granted") {
      return {
        state: "operational",
        label: "Available",
        summary: "Location access is available for travel context and local nutrition guidance.",
      };
    }
    if (status === "denied") {
      return {
        state: "unavailable",
        label: "Permission denied",
        summary: "Location access was denied, so travel/location context stays manual.",
      };
    }
    if (status === "unavailable") {
      return {
        state: "unavailable",
        label: "Unavailable here",
        summary: "Location services are unavailable in this environment.",
      };
    }
    return {
      state: "unavailable",
      label: "Not enabled",
      summary: "Location access is not enabled.",
    };
  })();

  const checkConnection = async () => {
    setChecking(true);
    try {
      if (appleMode === "manual_import") {
        setCheckMsg("Manual Apple Health imports do not verify a live Apple Health connection.");
        return;
      }
      const workouts = appleHealth?.workouts || {};
      const cutoff = Date.now() - (7 * 86400000);
      const recent = Object.entries(workouts).filter(([date]) => new Date(`${date}T12:00:00`).getTime() >= cutoff);
      const hasGarmin = recent.some(([, w]) => /garmin/i.test(String(w?.source || w?.device || "")));
      const msg = recent.length === 0
        ? "No Apple Health workouts found in last 7 days."
        : hasGarmin
        ? `Connected: ${recent.length} workouts found, Garmin sessions detected.`
        : `Apple Health connected: ${recent.length} workouts found, but Garmin source not detected yet.`;
      setCheckMsg(msg);
      await persistAppleHealth({ lastConnectionCheck: Date.now(), lastSyncStatus: hasGarmin ? "garmin_detected" : "health_only" });
    } finally {
      setChecking(false);
    }
  };
  const importDeviceData = async (provider = "apple") => {
    try {
      const raw = provider === "apple" ? appleImportText : garminImportText;
      const parsed = JSON.parse(raw || "{}");
      if (provider === "apple") {
        const workouts = Array.isArray(parsed)
          ? Object.fromEntries(parsed.map((w, idx) => [w?.date || w?.startDate || `${new Date().toISOString().split("T")[0]}_${idx}`, w]))
          : (parsed?.workouts || {});
        await persistAppleHealth({
          status: "manual_import",
          connectionMode: "manual_import",
          workouts,
          importedAt: Date.now(),
          lastSyncStatus: Object.keys(workouts || {}).length > 0 ? "health_only" : (appleHealth?.lastSyncStatus || "connected"),
        });
        setImportMsg(`Imported ${Object.keys(workouts || {}).length} Apple Health workout entries.`);
      } else {
        const activities = Array.isArray(parsed) ? parsed : (parsed?.activities || []);
        const dailySummaries = parsed?.dailySummaries || garmin?.dailySummaries || {};
        const nextGarmin = {
          ...garmin,
          status: "manual_import",
          connectionMode: "manual_import",
          activities,
          dailySummaries,
          trainingReadinessScore: Number(parsed?.trainingReadinessScore ?? garmin?.trainingReadinessScore ?? 0) || garmin?.trainingReadinessScore || null,
          importedAt: Date.now(),
          lastApiStatus: "ok",
        };
        const next = mergePersonalization(personalization, { connectedDevices: { ...(personalization?.connectedDevices || {}), garmin: nextGarmin } });
        setPersonalization(next);
        await onPersist(next);
        setImportMsg(`Imported ${activities.length} Garmin activities.`);
      }
    } catch (e) {
      setImportMsg(`Import failed: ${e?.message || "invalid JSON"}`);
    }
  };
  const requestLocationAccess = async () => {
    if (!(typeof navigator !== "undefined" && navigator?.geolocation?.getCurrentPosition)) {
      const next = mergePersonalization(personalization, {
        localFoodContext: {
          ...(personalization?.localFoodContext || {}),
          locationPermissionGranted: false,
          locationStatus: "unavailable",
          locationLabel: personalization?.localFoodContext?.locationLabel || personalization?.localFoodContext?.city || "Saved city only",
          lastUpdatedAt: Date.now(),
        },
      });
      setPersonalization(next);
      await onPersist(next);
      setLocationMsg("Location services are unavailable in this browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(async (position) => {
      const fallbackLocationLabel = personalization?.localFoodContext?.city || personalization?.localFoodContext?.locationLabel || "Nearby area";
      const next = mergePersonalization(personalization, {
        connectedDevices: {
          ...(personalization?.connectedDevices || {}),
          location: {
            status: "granted",
            lat: Number(position?.coords?.latitude || 0),
            lng: Number(position?.coords?.longitude || 0),
            accuracyM: Number(position?.coords?.accuracy || 0),
            updatedAt: Date.now(),
            source: "ios_geolocation",
          },
        },
        localFoodContext: {
          ...(personalization?.localFoodContext || {}),
          city: personalization?.localFoodContext?.city || fallbackLocationLabel,
          locationPermissionGranted: true,
          locationStatus: "granted",
          locationLabel: fallbackLocationLabel,
          lastKnownLat: Number(position?.coords?.latitude || 0),
          lastKnownLng: Number(position?.coords?.longitude || 0),
          lastUpdatedAt: Date.now(),
        },
      });
      setPersonalization(next);
      await onPersist(next);
      setLocationMsg("Location permission granted and saved.");
    }, async (err) => {
      const next = mergePersonalization(personalization, {
        connectedDevices: {
          ...(personalization?.connectedDevices || {}),
          location: { status: "denied", error: err?.message || "permission_denied", updatedAt: Date.now() },
        },
        localFoodContext: {
          ...(personalization?.localFoodContext || {}),
          locationPermissionGranted: false,
          locationStatus: "denied",
          locationLabel: personalization?.localFoodContext?.locationLabel || personalization?.localFoodContext?.city || "",
          lastUpdatedAt: Date.now(),
        },
      });
      setPersonalization(next);
      await onPersist(next);
      setLocationMsg("Location permission denied. Enable it in iPhone Settings Ã¢â€ â€™ Privacy & Security Ã¢â€ â€™ Location Services.");
    }, { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 });
  };
  const handleCopyBackup = async () => {
    const payload = exportData();
    try {
      await navigator.clipboard.writeText(payload);
      setBackupMsg("Copied");
      setTimeout(() => setBackupMsg(""), 2000);
    } catch {
      setBackupCode(payload);
      setBackupMsg("Unable to copy automatically");
    }
  };
  const handleRestoreRequest = () => {
    const raw = String(backupCode || "").trim();
    if (!raw) {
      setBackupMsg("Invalid backup code");
      return;
    }
    try {
      JSON.parse(decodeURIComponent(escape(atob(raw))));
      setPendingRestoreCode(raw);
      setBackupMsg("");
      setShowRestoreConfirm(true);
    } catch {
      setBackupMsg("Invalid backup code");
    }
  };
  const confirmRestore = async () => {
    const ok = await importData(pendingRestoreCode);
    if (!ok) {
      setBackupMsg("Invalid backup code");
      setShowRestoreConfirm(false);
      setPendingRestoreCode("");
      return;
    }
    setBackupCode("");
    setBackupMsg("");
    setPendingRestoreCode("");
    setShowRestoreConfirm(false);
  };
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("garmin_status");
    const message = params.get("garmin_message");
    const fix = params.get("garmin_fix");
    if (!status && !message && !fix) return;
    setGarminMsg(message || (status === "connected" ? "Garmin connected." : "Garmin returned with a status update."));
    setGarminFix(fix || "");
    params.delete("garmin_status");
    params.delete("garmin_message");
    params.delete("garmin_fix");
    params.delete("tab");
    const nextUrl = `${window.location.pathname}${params.toString() ? `?${params.toString()}` : ""}${window.location.hash || ""}`;
    window.history.replaceState({}, "", nextUrl);
  }, []);
  return (
    <div className="fi">
      <div className="card card-subtle">
        <div className="sect-title" style={{ color:"#9fb2d2", marginBottom:"0.5rem" }}>SETTINGS</div>
        {!!settingsSaveMsg && <div style={{ fontSize:"0.5rem", color:C.green, marginBottom:"0.32rem" }}>{settingsSaveMsg}</div>}
        <div style={{ fontSize:"0.56rem", color:"#8ea4c7", lineHeight:1.7, marginBottom:"1rem" }}>
          Manage profile, devices, preferences, appearance, notifications, and privacy in one place.
        </div>
        <div style={{ borderTop:"1px solid #233851", marginTop:"0.4rem", paddingTop:"0.75rem" }}>
          <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>PROFILE</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 110px", gap:"0.35rem", marginBottom:"0.35rem" }}>
            <input value={profile?.name || ""} onChange={e=>patchProfile({ name: e.target.value })} placeholder="Name" />
            <input type="number" value={profile?.age || ""} onChange={e=>patchProfile({ age: Number(e.target.value) || "" })} placeholder="Age" />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.35rem", marginBottom:"0.35rem" }}>
            <input
              type="number"
              step="0.1"
              value={profileWeightVal}
              onChange={e=>patchProfile({ weight: e.target.value === "" ? "" : Number(e.target.value), bodyweight: e.target.value === "" ? "" : Number(e.target.value) })}
              placeholder={`Weight (${unitSettings?.weight || "lbs"})`}
            />
            {unitSettings?.height === "cm" ? (
              <input
                type="number"
                value={profileHeightVal}
                onChange={e=>patchProfile({ height: e.target.value === "" ? "" : Number(e.target.value) })}
                placeholder="Height (cm)"
              />
            ) : (
              <input
                value={profileHeightVal}
                onChange={e=>patchProfile({ height: e.target.value })}
                placeholder={`Height (${unitSettings?.height === "ft_in" ? "e.g., 6'1\"" : "value"})`}
              />
            )}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.35rem", marginBottom:"0.35rem" }}>
            <select value={unitSettings?.weight || "lbs"} onChange={e=>patchSettings({ units: { ...unitSettings, weight: e.target.value } })}>
              <option value="lbs">Weight: lbs</option>
              <option value="kg">Weight: kg</option>
            </select>
            <select value={unitSettings?.height || "ft_in"} onChange={e=>patchSettings({ units: { ...unitSettings, height: e.target.value } })}>
              <option value="ft_in">Height: ft-in</option>
              <option value="cm">Height: cm</option>
            </select>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.35rem" }}>
            <input type="number" value={profile?.restingHeartRate || ""} onChange={e=>patchProfile({ restingHeartRate: Number(e.target.value) || "" })} placeholder="Resting HR (optional)" />
            <input type="number" value={profile?.actualMaxHr || ""} onChange={e=>patchProfile({ actualMaxHr: Number(e.target.value) || "" })} placeholder="Max HR (optional)" />
          </div>
        </div>

        <div style={{ borderTop:"1px solid #233851", marginTop:"0.75rem", paddingTop:"0.75rem" }}>
          <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>INTEGRATIONS</div>
          <div style={{ fontSize:"0.55rem", color:"#8ea4c7", lineHeight:1.6, marginBottom:"0.5rem" }}>
            Live integrations, manual imports, simulated states, and unavailable services are shown separately so device status is easier to trust.
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(210px,1fr))", gap:"0.4rem", marginBottom:"0.55rem" }}>
            {[
              ["Apple Health", appleIntegration],
              ["Garmin Connect", garminIntegration],
              ["Location", locationIntegration],
            ].map(([label, state]) => {
              const tone = integrationStateTone(state.state);
              return (
                <div key={label} style={{ border:"1px solid #243752", borderRadius:10, background:"#0f172a", padding:"0.5rem 0.55rem" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", gap:"0.3rem", alignItems:"center", flexWrap:"wrap" }}>
                    <div style={{ fontSize:"0.5rem", color:"#dbe7f6" }}>{label}</div>
                    <span style={{ fontSize:"0.46rem", color:tone.color, background:tone.bg, padding:"0.14rem 0.38rem", borderRadius:999 }}>{state.label}</span>
                  </div>
                  <div style={{ fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5, marginTop:"0.16rem" }}>{state.summary}</div>
                </div>
              );
            })}
          </div>
          <div style={{ fontSize:"0.5rem", color:"#94a3b8", lineHeight:1.5, marginBottom:"0.55rem" }}>
            Current data use: {(deviceSyncAudit?.utilization || ["No live device utilization signals are available yet."]).slice(0, 3).join(" ")}
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(260px,1fr))", gap:"0.6rem" }}>
            <div style={{ border:"1px solid #243752", borderRadius:12, background:"#0f172a", padding:"0.6rem" }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"center", flexWrap:"wrap", marginBottom:"0.26rem" }}>
                <div className="sect-title" style={{ color:C.blue, marginBottom:0 }}>APPLE HEALTH</div>
                <span style={{ fontSize:"0.46rem", color:integrationStateTone(appleIntegration.state).color, background:integrationStateTone(appleIntegration.state).bg, padding:"0.14rem 0.38rem", borderRadius:999 }}>{appleIntegration.label}</span>
              </div>
              <div style={{ fontSize:"0.53rem", color:"#dbe7f6", lineHeight:1.55 }}>{appleIntegration.summary}</div>
              <div style={{ fontSize:"0.49rem", color:"#8fa5c8", marginTop:"0.14rem", lineHeight:1.5 }}>{appleIntegration.detail}</div>
              <div style={{ fontSize:"0.48rem", color:"#6f85a7", marginTop:"0.18rem", lineHeight:1.5 }}>
                Permission requested: {formatIntegrationTimestamp(appleHealth?.permissionRequestedAt)} · Last check: {formatIntegrationTimestamp(appleHealth?.lastConnectionCheck)}
              </div>
              <div style={{ fontSize:"0.48rem", color:"#6f85a7", marginTop:"0.12rem", lineHeight:1.5 }}>Active data types: {activeAppleTypes}</div>
              <div style={{ marginTop:"0.35rem", display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
                <button className="btn" onClick={()=>setConnectOpen(true)} style={{ fontSize:"0.52rem", color:C.green, borderColor:C.green+"40" }}>
                  {appleMode === "live" || appleMode === "simulated" ? "Reconnect Apple Health" : "Connect Apple Health"}
                </button>
                <button className="btn" onClick={checkConnection} disabled={checking || appleMode === "manual_import"} style={{ fontSize:"0.52rem", color:C.blue, borderColor:C.blue+"35" }}>
                  {checking ? "Checking..." : "Verify sync"}
                </button>
                <button className="btn" onClick={()=>persistAppleHealth({ permissionConfirmedAt: Date.now(), lastSyncStatus: "permissions_confirmed" })} style={{ fontSize:"0.52rem", color:C.amber, borderColor:C.amber+"35" }}>
                  I enabled permissions
                </button>
              </div>
              <div style={{ marginTop:"0.22rem", fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.6 }}>
                iPhone path: Settings Ã¢â€ â€™ Privacy &amp; Security Ã¢â€ â€™ Health Ã¢â€ â€™ Personal Trainer Ã¢â€ â€™ Allow all categories.
              </div>
              {checkMsg && <div style={{ marginTop:"0.22rem", fontSize:"0.51rem", color:"#cbd5e1" }}>{checkMsg}</div>}
            </div>

            <div style={{ border:"1px solid #243752", borderRadius:12, background:"#0f172a", padding:"0.6rem" }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"center", flexWrap:"wrap", marginBottom:"0.26rem" }}>
                <div className="sect-title" style={{ color:C.green, marginBottom:0 }}>GARMIN CONNECT</div>
                <span style={{ fontSize:"0.46rem", color:integrationStateTone(garminIntegration.state).color, background:integrationStateTone(garminIntegration.state).bg, padding:"0.14rem 0.38rem", borderRadius:999 }}>{garminIntegration.label}</span>
              </div>
              <div style={{ fontSize:"0.53rem", color:"#dbe7f6", lineHeight:1.55 }}>{garminIntegration.summary}</div>
              <div style={{ fontSize:"0.49rem", color:"#8fa5c8", marginTop:"0.14rem", lineHeight:1.5 }}>{garminIntegration.detail}</div>
              <div style={{ fontSize:"0.48rem", color:"#6f85a7", marginTop:"0.18rem", lineHeight:1.5 }}>
                Last activity: {lastGarminActivity?.startTime || "none"} · {lastGarminActivity?.type || "no synced activity"}
              </div>
              {(garmin?.lastErrorMessage || garmin?.lastErrorFix) && (
                <div style={{ marginTop:"0.18rem", fontSize:"0.49rem", color:C.amber, lineHeight:1.55 }}>
                  {garmin?.lastErrorMessage || "Garmin needs attention."}
                  {garmin?.lastErrorFix ? ` ${garmin.lastErrorFix}` : ""}
                </div>
              )}
              {!!garminMsg && <div style={{ marginTop:"0.18rem", fontSize:"0.5rem", color:"#cbd5e1" }}>{garminMsg}</div>}
              {!!garminFix && integrationDevVisible && <div style={{ marginTop:"0.12rem", fontSize:"0.48rem", color:C.amber }}>{garminFix}</div>}
              <div style={{ marginTop:"0.35rem", display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
                <button className="btn" onClick={connectGarmin} disabled={garminBusy !== ""} style={{ fontSize:"0.52rem", color:C.green, borderColor:C.green+"35" }}>
                  {garminBusy === "connect" ? "Connecting..." : garminMode === "live" ? "Reconnect Garmin" : "Connect Garmin"}
                </button>
                <button className="btn" onClick={syncGarminNow} disabled={garminBusy !== "" || garminMode !== "live"} style={{ fontSize:"0.52rem", color:C.blue, borderColor:C.blue+"35" }}>
                  {garminBusy === "sync" ? "Syncing..." : "Sync now"}
                </button>
                <button className="btn" onClick={disconnectGarmin} disabled={garminBusy !== "" || garminMode !== "live"} style={{ fontSize:"0.52rem", color:C.red, borderColor:C.red+"35" }}>
                  {garminBusy === "disconnect" ? "Disconnecting..." : "Disconnect"}
                </button>
              </div>
            </div>
          </div>

          <div style={{ marginTop:"0.6rem", border:"1px solid #243752", borderRadius:12, background:"#0f172a", padding:"0.6rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"center", flexWrap:"wrap", marginBottom:"0.22rem" }}>
              <div className="sect-title" style={{ color:C.amber, marginBottom:0 }}>LOCATION SERVICES</div>
              <span style={{ fontSize:"0.46rem", color:integrationStateTone(locationIntegration.state).color, background:integrationStateTone(locationIntegration.state).bg, padding:"0.14rem 0.38rem", borderRadius:999 }}>{locationIntegration.label}</span>
            </div>
            <div style={{ fontSize:"0.52rem", color:"#9fb2d2", lineHeight:1.6 }}>{locationIntegration.summary}</div>
            <button className="btn" onClick={requestLocationAccess} style={{ marginTop:"0.35rem", fontSize:"0.52rem", color:C.amber, borderColor:C.amber+"35" }}>Enable location permission</button>
            <div style={{ marginTop:"0.2rem", fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.6 }}>
              iPhone path: Settings Ã¢â€ â€™ Privacy &amp; Security Ã¢â€ â€™ Location Services Ã¢â€ â€™ Personal Trainer Ã¢â€ â€™ While Using App.
            </div>
            {!!locationMsg && <div style={{ marginTop:"0.18rem", fontSize:"0.5rem", color:"#cbd5e1" }}>{locationMsg}</div>}
          </div>

          <details style={{ marginTop:"0.6rem" }}>
            <summary style={{ cursor:"pointer", fontSize:"0.55rem", color:"#8fa5c8" }}>Manual imports</summary>
            <div style={{ marginTop:"0.38rem", display:"grid", gap:"0.5rem" }}>
              <div style={{ border:"1px solid #243752", borderRadius:10, background:"#0f172a", padding:"0.5rem 0.55rem", display:"grid", gap:"0.28rem" }}>
                <div style={{ fontSize:"0.5rem", color:"#dbe7f6" }}>Apple Health JSON import</div>
                <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.5 }}>Use this only when you are restoring or testing data without a live Apple Health link.</div>
                <textarea value={appleImportText} onChange={e=>setAppleImportText(e.target.value)} placeholder='{"workouts":{"2026-04-07":{"distanceMiles":3.2,"avgHr":148}}}' style={{ minHeight:62, fontSize:"0.5rem" }} />
                <button className="btn" onClick={()=>importDeviceData("apple")} style={{ width:"fit-content", fontSize:"0.5rem", color:C.blue, borderColor:C.blue+"35" }}>Import Apple JSON</button>
              </div>
              <div style={{ border:"1px solid #243752", borderRadius:10, background:"#0f172a", padding:"0.5rem 0.55rem", display:"grid", gap:"0.28rem" }}>
                <div style={{ fontSize:"0.5rem", color:"#dbe7f6" }}>Garmin JSON import</div>
                <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.5 }}>Use this only when you need Garmin activity data without the live server-side connection.</div>
                <textarea value={garminImportText} onChange={e=>setGarminImportText(e.target.value)} placeholder='{"activities":[{"startTime":"2026-04-07T07:30:00Z","type":"Run","distanceMiles":4.1}]}' style={{ minHeight:62, fontSize:"0.5rem" }} />
                <button className="btn" onClick={()=>importDeviceData("garmin")} style={{ width:"fit-content", fontSize:"0.5rem", color:C.green, borderColor:C.green+"35" }}>Import Garmin JSON</button>
              </div>
              {!!importMsg && <div style={{ fontSize:"0.51rem", color:"#cbd5e1" }}>{importMsg}</div>}
            </div>
          </details>

          {(integrationDevVisible || appleMode === "simulated" || !!garminFix) && (
            <details style={{ marginTop:"0.55rem" }}>
              <summary style={{ cursor:"pointer", fontSize:"0.55rem", color:"#8fa5c8" }}>Developer / simulated states</summary>
              <div style={{ marginTop:"0.35rem", display:"grid", gap:"0.35rem" }}>
                {appleMode === "simulated" && (
                  <div style={{ fontSize:"0.5rem", color:"#9fb2d2", lineHeight:1.6 }}>
                    Apple Health is currently marked `simulated_web`, which is a web-only placeholder and should not be treated like a live connection.
                  </div>
                )}
                <div style={{ fontSize:"0.5rem", color:"#9fb2d2", lineHeight:1.6 }}>
                  Direct Garmin integration runs server-side so secrets and token exchange stay off the client.
                </div>
                {integrationDevVisible && (
                  <div style={{ fontSize:"0.48rem", color:"#8fa5c8", lineHeight:1.6 }}>
                    Developer setup: register the app at `developer.garmin.com`, use callback path `/auth/garmin/callback`, and configure the Garmin env vars before connecting.
                  </div>
                )}
              </div>
            </details>
          )}
        </div>

        <div style={{ borderTop:"1px solid #233851", marginTop:"0.75rem", paddingTop:"0.75rem" }}>
          <div className="sect-title" style={{ color:C.purple, marginBottom:"0.35rem" }}>TRAINING PREFERENCES</div>
          <div style={{ display:"grid", gap:"0.3rem" }}>
            <button className="btn" onClick={()=>setShowEnvEditor(v=>!v)} style={{ justifyContent:"space-between", fontSize:"0.54rem", color:"#dbe7f6" }}>
              Default environment: {trainingPrefs?.defaultEnvironment || "Home"} <span>{showEnvEditor ? "Hide" : "Edit"}</span>
            </button>
            {showEnvEditor && (
              <div style={{ display:"grid", gap:"0.3rem", border:"1px solid #243752", borderRadius:9, padding:"0.45rem" }}>
                <select value={trainingPrefs?.defaultEnvironment || "Home"} onChange={e=>patchSettings({ trainingPreferences: { ...trainingPrefs, defaultEnvironment: e.target.value } })}>
                  {["Home","Gym","Travel"].map((m)=><option key={m} value={m}>{m}</option>)}
                </select>
                <div style={{ fontSize:"0.5rem", color:"#8fa5c8" }}>Use the Environment editor in Today/Program to update equipment list and session duration presets.</div>
              </div>
            )}
            <select value={trainingPrefs?.weeklyCheckinDay || "Sun"} onChange={e=>patchSettings({ trainingPreferences: { ...trainingPrefs, weeklyCheckinDay: e.target.value } })}>
              {["Sun","Mon","Sat"].map((d)=><option key={d} value={d}>Weekly check-in day: {d}</option>)}
            </select>
            <select value={unitSettings?.distance || "miles"} onChange={e=>patchSettings({ units: { ...unitSettings, distance: e.target.value } })}>
              <option value="miles">Units: Miles</option>
              <option value="kilometers">Units: Kilometers</option>
            </select>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.28rem" }}>
              {[
                ["Conservative","Protect consistency, never overtrain"],
                ["Standard","Balanced load and progression"],
                ["Aggressive","Push harder, accept more risk"],
              ].map(([mode, desc]) => (
                <button key={mode} className="btn" onClick={()=>patchSettings({ trainingPreferences: { ...trainingPrefs, intensityPreference: mode } })} style={{ fontSize:"0.51rem", color:trainingPrefs?.intensityPreference===mode?C.green:"#9fb2d2", borderColor:trainingPrefs?.intensityPreference===mode?C.green+"35":"#324961", textAlign:"left" }}>
                  <div>{mode}</div><div style={{ fontSize:"0.45rem", color:"#7f94b3", marginTop:"0.12rem" }}>{desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ borderTop:"1px solid #233851", marginTop:"0.75rem", paddingTop:"0.75rem" }}>
          <div className="sect-title" style={{ color:C.amber, marginBottom:"0.35rem" }}>APPEARANCE</div>
          <div style={{ display:"grid", gap:"0.3rem" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.25rem" }}>
              {["System","Light","Dark"].map((t) => (
                <button key={t} className="btn" onClick={()=>patchSettings({ appearance: { ...appearance, theme: t } })} style={{ fontSize:"0.52rem", color:appearance?.theme===t?C.green:"#9fb2d2", borderColor:appearance?.theme===t?C.green+"35":"#324961" }}>{t}</button>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:"0.28rem" }}>
              {[["Green","#27f59a"],["Blue","#00c2ff"],["Orange","#ff8a00"],["Red","#ff3d81"],["Purple","#7c5cff"],["Neutral","#94a3b8"]].map(([name,color]) => (
                <button key={name} onClick={()=>patchSettings({ appearance: { ...appearance, palette: name } })} style={{ height:24, borderRadius:7, border:appearance?.palette===name?`2px solid ${color}`:"1px solid #324961", background:color, cursor:"pointer" }} title={name} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ borderTop:"1px solid #233851", marginTop:"0.75rem", paddingTop:"0.75rem" }}>
          <div className="sect-title" style={{ color:C.green, marginBottom:"0.35rem" }}>NOTIFICATIONS</div>
          <div style={{ display:"grid", gap:"0.3rem" }}>
            <label style={{ fontSize:"0.53rem", color:"#cbd5e1" }}><input type="checkbox" checked={Boolean(notif?.allOff)} onChange={e=>patchSettings({ notifications: { ...notif, allOff: e.target.checked } })} /> All notifications off</label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 110px", gap:"0.35rem" }}>
              <label style={{ fontSize:"0.53rem", color:"#cbd5e1" }}><input type="checkbox" checked={Boolean(notif?.weeklyReminderOn)} disabled={notif?.allOff} onChange={e=>patchSettings({ notifications: { ...notif, weeklyReminderOn: e.target.checked } })} /> Weekly check-in reminder</label>
              <input type="time" value={notif?.weeklyReminderTime || "18:00"} disabled={notif?.allOff || !notif?.weeklyReminderOn} onChange={e=>patchSettings({ notifications: { ...notif, weeklyReminderTime: e.target.value } })} />
            </div>
            <label style={{ fontSize:"0.53rem", color:"#cbd5e1" }}><input type="checkbox" checked={Boolean(notif?.proactiveNudgeOn)} disabled={notif?.allOff} onChange={e=>patchSettings({ notifications: { ...notif, proactiveNudgeOn: e.target.checked } })} /> Coach proactive nudge</label>
            <div style={{ fontSize:"0.49rem", color:"#7f94b3" }}>One message if you&apos;ve been away 3+ days</div>
          </div>
        </div>

        <div style={{ borderTop:"1px solid #233851", marginTop:"0.75rem", paddingTop:"0.75rem" }}>
          <div className="sect-title" style={{ color:C.red, marginBottom:"0.35rem" }}>DATA & PRIVACY</div>
          <div style={{ display:"grid", gap:"0.3rem" }}>
            <div style={{ border:"1px solid #243752", borderRadius:10, padding:"0.55rem 0.6rem", display:"grid", gap:"0.45rem", background:"#0d1320" }}>
              <div className="sect-title" style={{ color:C.blue, marginBottom:"0.05rem" }}>Backup & Restore</div>
              <button className="btn" onClick={handleCopyBackup} style={{ fontSize:"0.52rem", color:C.blue, borderColor:C.blue+"35", width:"fit-content" }}>Copy backup</button>
              <textarea value={backupCode} onChange={e=>{ setBackupCode(e.target.value); if (backupMsg) setBackupMsg(""); }} placeholder="Paste backup code" style={{ minHeight:72, fontSize:"0.58rem", resize:"vertical" }} />
              <button className="btn" onClick={handleRestoreRequest} style={{ fontSize:"0.52rem", color:"#94a3b8", borderColor:"#324961", width:"fit-content" }}>Restore</button>
              {!!backupMsg && <div style={{ fontSize:"0.54rem", color:backupMsg === "Copied" ? C.green : C.amber }}>{backupMsg}</div>}
            </div>
            <button className="btn" onClick={()=>{ setDeleteOpen(v=>!v); setDeleteStep(1); setDeleteConfirm(""); }} style={{ fontSize:"0.52rem", color:C.red, borderColor:C.red+"35" }}>Delete account</button>
            {deleteOpen && (
              <div style={{ border:"1px solid #3b2a39", borderRadius:8, padding:"0.45rem", display:"grid", gap:"0.3rem" }}>
                {deleteStep === 1 ? (
                  <>
                    <div style={{ fontSize:"0.52rem", color:"#f1d4dd" }}>This deletes logs, goals, check-ins, device links, and personalization. Export first if needed.</div>
                    <button className="btn" onClick={()=>{ exportData(); setDeleteStep(2); }} style={{ fontSize:"0.5rem" }}>Export first, then continue</button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:"0.52rem", color:"#f1d4dd" }}>Type <b>DELETE</b> to confirm.</div>
                    <input value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value)} placeholder="DELETE" />
                    <button className="btn" disabled={deleteConfirm !== "DELETE"} onClick={onDeleteAccount} style={{ fontSize:"0.5rem", color:C.red, borderColor:C.red+"35" }}>Confirm delete account</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ borderTop:"1px solid #233851", marginTop:"1.2rem", paddingTop:"1rem" }}>
          <div className="sect-title" style={{ color:"#8fa5c8", marginBottom:"0.3rem" }}>PLAN MANAGEMENT</div>
          <button className="btn" onClick={onStartFresh} style={{ fontSize:"0.52rem", color:"#7f94b3", borderColor:"#2d405b", background:"transparent", padding:"0.22rem 0.5rem" }}>
            Start a new plan
          </button>
        </div>
      </div>
      {connectOpen && (
        <div onClick={()=>setConnectOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(2,6,14,0.72)", display:"grid", placeItems:"center", zIndex:60, padding:"1rem" }}>
          <div onClick={e=>e.stopPropagation()} className="card card-soft" style={{ width:"100%", maxWidth:520, borderColor:"#30455f" }}>
            <div style={{ fontSize:"0.62rem", color:"#dbe7f6", lineHeight:1.7, marginBottom:"0.6rem" }}>
              Personal Trainer can read Apple Health workouts and device context that some recommendations use. We never share this data. You can revoke access anytime in iOS Settings.
            </div>
            <button className="btn btn-primary" onClick={requestAppleHealth} style={{ width:"100%", marginBottom:"0.45rem" }}>Connect Apple Health</button>
            <button className="btn" onClick={async ()=>{ await persistAppleHealth({ skipped: true }); setConnectOpen(false); }} style={{ width:"100%", fontSize:"0.52rem", color:"#93a8c8", borderColor:"#324761" }}>
              Skip for now
            </button>
          </div>
        </div>
      )}
      {showRestoreConfirm && (
        <div onClick={()=>setShowRestoreConfirm(false)} style={{ position:"fixed", inset:0, background:"rgba(2,6,14,0.72)", display:"grid", placeItems:"center", zIndex:65, padding:"1rem" }}>
          <div onClick={e=>e.stopPropagation()} className="card card-soft" style={{ width:"100%", maxWidth:420, borderColor:"#30455f" }}>
            <div style={{ fontSize:"0.6rem", color:"#dbe7f6", lineHeight:1.7, marginBottom:"0.75rem" }}>
              This will replace all current data with the backup. This cannot be undone. Continue?
            </div>
            <div style={{ display:"flex", gap:"0.4rem", justifyContent:"flex-end" }}>
              <button className="btn btn-primary" onClick={()=>setShowRestoreConfirm(false)} style={{ fontSize:"0.52rem" }}>Cancel</button>
              <button className="btn" onClick={confirmRestore} style={{ fontSize:"0.52rem", color:"#94a3b8", borderColor:"#324961" }}>Restore</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function OnboardingCoachLegacy({ onComplete }) {
  const SCRIPT = [
    { key: "primary_goal", text: "What's your primary goal?", type: "buttons", options: Object.values(PRIMARY_GOAL_LABELS), valueMap: Object.fromEntries(PRIMARY_GOAL_OPTIONS.map(k => [PRIMARY_GOAL_LABELS[k], k])) },
    { key: "experience_level", text: "How long have you been training consistently?", type: "buttons", options: Object.values(EXPERIENCE_LEVEL_LABELS), valueMap: Object.fromEntries(EXPERIENCE_LEVEL_OPTIONS.map(k => [EXPERIENCE_LEVEL_LABELS[k], k])) },
    { key: "training_days", text: "How many days per week can you realistically train? Not your best week Ã¢â‚¬â€ your average week when life is happening.", type: "buttons", options: ["2","3","4","5","6"] },
    { key: "session_length", text: "How much time do you have per session?", type: "buttons", options: Object.values(SESSION_LENGTH_LABELS), valueMap: Object.fromEntries(SESSION_LENGTH_OPTIONS.map(k => [SESSION_LENGTH_LABELS[k], k])) },
    { key: "injury_text", text: "Do you have any injuries or physical limitations I need to plan around?", type: "text", placeholder: "None currently" },
    { key: "training_location", text: "Where do you usually train?", type: "buttons", options: ["Home","Gym","Both","Varies"] },
  ];
  const [messages, setMessages] = useState([{ role: "coach", text: SCRIPT[0].text }]);
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState("");
  const [awaitingTimeline, setAwaitingTimeline] = useState(false);
  const [awaitingAdjustConfirm, setAwaitingAdjustConfirm] = useState(false);
  const [building, setBuilding] = useState(false);
  const current = SCRIPT[step];
  const needsEquipment = Boolean(answers.__needs_equipment);

  const callAnthropicIntake = async (prompt) => {
    const key = safeStorageGet(localStorage, "coach_api_key", "") || safeStorageGet(localStorage, "anthropic_api_key", "");
    if (!key) return null;
    try {
      const res = await safeFetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-3-5-haiku-latest", max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
      }, 9000);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.content?.[0]?.text || null;
    } catch { return null; }
  };

  const buildTimelineAssessment = async (payload) => {
    const prompt = `The user has provided the following goals and baseline:\n${JSON.stringify(payload, null, 2)}\n\nAssess each goal against the baseline and days available. For each goal:\n1. State whether it is realistic within the user's primary deadline (if one exists)\n2. If not realistic within that deadline: state what IS realistic by that date and when the full goal could be reached\n3. Identify any goal conflicts (e.g. aggressive cut + peak strength simultaneously)\n\nRules:\n- Be honest but not discouraging\n- Lead with what IS achievable, not what isn't\n- Never say a goal is impossible Ã¢â‚¬â€ say what's needed to make it possible and how long it realistically takes\n- If goals are fully compatible: say so and move on\n- Maximum 3 sentences per goal\n- End with: 'Here's what I'm going to prioritize in your plan Ã¢â‚¬â€ tell me if you want to adjust anything.'`;
    const ai = await callAnthropicIntake(prompt);
    if (ai) return ai.trim();
    return "Given your baseline and schedule, we'll prioritize one primary outcome and sequence secondary goals so recovery stays intact. By your deadline, we'll target measurable progress toward the main outcome while keeping competing goals in maintenance range, then progress them in the next block. Here's what I'm going to prioritize in your plan Ã¢â‚¬â€ tell me if you want to adjust anything.";
  };

  const askNext = (nextStep) => {
    if (nextStep >= SCRIPT.length) return;
    setMessages((prev) => [...prev, { role: "coach", text: SCRIPT[nextStep].text }]);
    setStep(nextStep);
    setDraft("");
  };

  const submitAnswer = async (value) => {
    const clean = String(value || "").trim();
    if (!clean && current?.type === "text") return;
    const answerText = clean || "None currently";
    setMessages((prev) => [...prev, { role: "user", text: answerText }]);

    if (answers.__needs_equipment) {
      const patched = { ...answers, equipment_text: answerText, __needs_equipment: false };
      setAnswers(patched);
      setAwaitingTimeline(true);
      const timeline = await buildTimelineAssessment(patched);
      setMessages((prev) => [...prev, { role: "coach", text: timeline }]);
      setAwaitingTimeline(false);
      setAwaitingAdjustConfirm(true);
      return;
    }

    const nextAnswers = { ...answers, [current.key]: answerText };
    setAnswers(nextAnswers);
    if (current.key === "training_location" && ["Home", "Varies"].includes(answerText)) {
      setAnswers({ ...nextAnswers, __needs_equipment: true });
      setMessages((prev) => [...prev, { role: "coach", text: "What equipment is available where you train?" }]);
      setDraft("");
      return;
    }
    if (step < SCRIPT.length - 1) {
      askNext(step + 1);
      return;
    }
    setAwaitingTimeline(true);
    const timeline = await buildTimelineAssessment(nextAnswers);
    setMessages((prev) => [...prev, { role: "coach", text: timeline }]);
    setAwaitingTimeline(false);
    setAwaitingAdjustConfirm(true);
  };

  const finalize = async (adjust = "") => {
    if (adjust.trim()) setMessages((prev) => [...prev, { role: "user", text: adjust.trim() }]);
    setBuilding(true);
    setMessages((prev) => [...prev, { role: "coach", text: "Building your plan..." }]);
    await onComplete({
      ...answers,
      training_days: answers.training_days || "3",
      secondary_goals: answers.other_goals || "",
      primary_goal_detail: answers.primary_goal_text || "",
      timeline_feedback: adjust.trim(),
      timeline_assessment: messages.filter((m) => m.role === "coach").slice(-1)[0]?.text || "",
    });
    setBuilding(false);
  };
  const activeAppleTypes = appleHealth?.permissionsGranted?.length ? appleHealth.permissionsGranted.join(", ") : "None";
  const lastGarminActivity = (garmin?.activities || []).slice(-1)[0];
  const profileWeightVal = profile?.weight ?? profile?.bodyweight ?? "";
  const profileHeightVal = profile?.height ?? "";

  const checkConnection = async () => {
    setChecking(true);
    try {
      const workouts = appleHealth?.workouts || {};
      const cutoff = Date.now() - (7 * 86400000);
      const recent = Object.entries(workouts).filter(([date]) => new Date(`${date}T12:00:00`).getTime() >= cutoff);
      const hasGarmin = recent.some(([, w]) => /garmin/i.test(String(w?.source || w?.device || "")));
      const msg = recent.length === 0
        ? "No Apple Health workouts found in last 7 days."
        : hasGarmin
        ? `Connected: ${recent.length} workouts found, Garmin sessions detected.`
        : `Apple Health connected: ${recent.length} workouts found, but Garmin source not detected yet.`;
      setCheckMsg(msg);
      await persistAppleHealth({ lastConnectionCheck: Date.now(), lastSyncStatus: hasGarmin ? "garmin_detected" : "health_only" });
    } finally {
      setChecking(false);
    }
  };
  return (
    <div className="fi">
      <div className="card card-subtle">
        <div className="sect-title" style={{ color:"#9fb2d2", marginBottom:"0.5rem" }}>SETTINGS</div>
        {!!settingsSaveMsg && <div style={{ fontSize:"0.5rem", color:C.green, marginBottom:"0.32rem" }}>{settingsSaveMsg}</div>}
        <div style={{ fontSize:"0.56rem", color:"#8ea4c7", lineHeight:1.7, marginBottom:"1rem" }}>
          Manage profile, devices, preferences, appearance, notifications, and privacy in one place.
        </div>
        <div style={{ borderTop:"1px solid #233851", marginTop:"0.4rem", paddingTop:"0.75rem" }}>
          <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>PROFILE</div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 110px", gap:"0.35rem", marginBottom:"0.35rem" }}>
            <input value={profile?.name || ""} onChange={e=>patchProfile({ name: e.target.value })} placeholder="Name" />
            <input type="number" value={profile?.age || ""} onChange={e=>patchProfile({ age: Number(e.target.value) || "" })} placeholder="Age" />
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.35rem", marginBottom:"0.35rem" }}>
            <input
              type="number"
              step="0.1"
              value={profileWeightVal}
              onChange={e=>patchProfile({ weight: e.target.value === "" ? "" : Number(e.target.value), bodyweight: e.target.value === "" ? "" : Number(e.target.value) })}
              placeholder={`Weight (${unitSettings?.weight || "lbs"})`}
            />
            {unitSettings?.height === "cm" ? (
              <input
                type="number"
                value={profileHeightVal}
                onChange={e=>patchProfile({ height: e.target.value === "" ? "" : Number(e.target.value) })}
                placeholder="Height (cm)"
              />
            ) : (
              <input
                value={profileHeightVal}
                onChange={e=>patchProfile({ height: e.target.value })}
                placeholder={`Height (${unitSettings?.height === "ft_in" ? "e.g., 6'1\"" : "value"})`}
              />
            )}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.35rem", marginBottom:"0.35rem" }}>
            <select value={unitSettings?.weight || "lbs"} onChange={e=>patchSettings({ units: { ...unitSettings, weight: e.target.value } })}>
              <option value="lbs">Weight: lbs</option>
              <option value="kg">Weight: kg</option>
            </select>
            <select value={unitSettings?.height || "ft_in"} onChange={e=>patchSettings({ units: { ...unitSettings, height: e.target.value } })}>
              <option value="ft_in">Height: ft-in</option>
              <option value="cm">Height: cm</option>
            </select>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.35rem" }}>
            <input type="number" value={profile?.restingHeartRate || ""} onChange={e=>patchProfile({ restingHeartRate: Number(e.target.value) || "" })} placeholder="Resting HR (optional)" />
            <input type="number" value={profile?.actualMaxHr || ""} onChange={e=>patchProfile({ actualMaxHr: Number(e.target.value) || "" })} placeholder="Max HR (optional)" />
          </div>
        </div>

        <div style={{ borderTop:"1px solid #233851", marginTop:"0.75rem", paddingTop:"0.75rem" }}>
          <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>CONNECTED DEVICES</div>
          <div style={{ fontSize:"0.54rem", color:"#8ea4c7", lineHeight:1.6, marginBottom:"0.35rem" }}>
            Your Garmin data will appear in Apple Health automatically once connected. Here&apos;s how:
          </div>
          <div style={{ fontSize:"0.53rem", color:"#9fb2d2", lineHeight:1.7 }}>
            Step 1: Open Garmin Connect app<br />
            Step 2: Tap your profile photo Ã¢â€ â€™ Settings Ã¢â€ â€™ Connected Apps Ã¢â€ â€™ Apple Health Ã¢â€ â€™ Enable All<br />
            Step 3: Come back here and tap &quot;Check Connection&quot;
          </div>
          <div style={{ marginTop:"0.45rem", display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
            <button className="btn" onClick={()=>setConnectOpen(true)} style={{ fontSize:"0.52rem", color:C.green, borderColor:C.green+"40" }}>
              {appleHealth?.status === "connected" || appleHealth?.status === "simulated_web" ? "Reconnect Apple Health" : "Connect Apple Health"}
            </button>
            <button className="btn" onClick={checkConnection} disabled={checking} style={{ fontSize:"0.52rem", color:C.blue, borderColor:C.blue+"35" }}>
              {checking ? "Checking..." : "Check Connection"}
            </button>
            <button className="btn" onClick={()=>persistAppleHealth({ permissionConfirmedAt: Date.now(), lastSyncStatus: "permissions_confirmed" })} style={{ fontSize:"0.52rem", color:C.amber, borderColor:C.amber+"35" }}>
              I enabled Health permissions
            </button>
          </div>
          <div style={{ marginTop:"0.28rem", fontSize:"0.5rem", color:"#6f85a7" }}>
            Status: {appleHealth?.status || "not_connected"} Ã‚Â· Last check: {appleHealth?.lastConnectionCheck ? new Date(appleHealth.lastConnectionCheck).toLocaleString() : "never"}
          </div>
          <div style={{ marginTop:"0.2rem", fontSize:"0.5rem", color:"#6f85a7" }}>
            Permission confirmed: {appleHealth?.permissionConfirmedAt ? new Date(appleHealth.permissionConfirmedAt).toLocaleString() : "not confirmed"}
          </div>
          <div style={{ marginTop:"0.2rem", fontSize:"0.52rem", color:appleHealth?.lastSyncStatus === "garmin_detected" ? C.green : appleHealth?.status === "connected" || appleHealth?.status === "simulated_web" ? C.blue : "#8fa5c8" }}>
            {appleHealth?.lastSyncStatus === "garmin_detected"
              ? "Sync verified: Garmin activity detected in Apple Health."
              : appleHealth?.lastSyncStatus === "permissions_confirmed"
              ? "Permissions confirmed. Complete one Health workout, then tap Check Connection."
              : appleHealth?.lastSyncStatus === "health_only"
              ? "Connected, but Garmin source not detected yet."
              : appleHealth?.status === "connected" || appleHealth?.status === "simulated_web"
              ? "Connected. Run one workout, then tap Check Connection."
              : "Not connected yet."}
          </div>
          <div style={{ marginTop:"0.24rem", fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.7 }}>
            iPhone permission path: Settings Ã¢â€ â€™ Privacy &amp; Security Ã¢â€ â€™ Health Ã¢â€ â€™ Personal Trainer (or browser app) Ã¢â€ â€™ Allow all categories.
          </div>
          <div style={{ marginTop:"0.2rem", fontSize:"0.5rem", color:"#6f85a7" }}>Active data types: {activeAppleTypes}</div>
          {checkMsg && <div style={{ marginTop:"0.25rem", fontSize:"0.53rem", color:"#cbd5e1" }}>{checkMsg}</div>}
        </div>
        <div style={{ borderTop:"1px solid #233851", marginTop:"0.75rem", paddingTop:"0.75rem" }}>
          <div className="sect-title" style={{ color:C.green, marginBottom:"0.35rem" }}>GARMIN CONNECT</div>
          <div style={{ fontSize:"0.53rem", color:"#8ea4c7", lineHeight:1.6, marginBottom:"0.35rem" }}>
            Secondary data layer over Apple Health. OAuth 1.0a is used for Garmin authorization.
          </div>
          <button className="btn" onClick={connectGarmin} style={{ fontSize:"0.52rem", color:C.green, borderColor:C.green+"35" }}>
            Connect Garmin
          </button>
          <div style={{ marginTop:"0.25rem", fontSize:"0.52rem", color:garmin?.status === "connected" ? C.green : "#8fa5c8" }}>
            {garmin?.status === "connected" ? `Garmin connected Ã‚Â· ${garmin?.deviceName || "device"}` : "Garmin not connected"}
          </div>
          <div style={{ marginTop:"0.18rem", fontSize:"0.5rem", color:"#6f85a7" }}>
            Last activity synced: {lastGarminActivity?.startTime || "none"} Ã‚Â· {lastGarminActivity?.type || ""}
          </div>
          <a href="#" onClick={(e)=>{ e.preventDefault(); setConnectOpen(true); }} style={{ display:"inline-block", marginTop:"0.18rem", fontSize:"0.5rem", color:C.blue }}>How to sync Garmin Ã¢â€ â€™ Apple Health</a>
          {!!garminMsg && <div style={{ marginTop:"0.2rem", fontSize:"0.52rem", color:"#cbd5e1" }}>{garminMsg}</div>}
        </div>

        <div style={{ borderTop:"1px solid #233851", marginTop:"0.75rem", paddingTop:"0.75rem" }}>
          <div className="sect-title" style={{ color:C.purple, marginBottom:"0.35rem" }}>TRAINING PREFERENCES</div>
          <div style={{ display:"grid", gap:"0.3rem" }}>
            <button className="btn" onClick={()=>setShowEnvEditor(v=>!v)} style={{ justifyContent:"space-between", fontSize:"0.54rem", color:"#dbe7f6" }}>
              Default environment: {trainingPrefs?.defaultEnvironment || "Home"} <span>{showEnvEditor ? "Hide" : "Edit"}</span>
            </button>
            {showEnvEditor && (
              <div style={{ display:"grid", gap:"0.3rem", border:"1px solid #243752", borderRadius:9, padding:"0.45rem" }}>
                <select value={trainingPrefs?.defaultEnvironment || "Home"} onChange={e=>patchSettings({ trainingPreferences: { ...trainingPrefs, defaultEnvironment: e.target.value } })}>
                  {["Home","Gym","Travel"].map((m)=><option key={m} value={m}>{m}</option>)}
                </select>
                <div style={{ fontSize:"0.5rem", color:"#8fa5c8" }}>Use the Environment editor in Today/Program to update equipment list and session duration presets.</div>
              </div>
            )}
            <select value={trainingPrefs?.weeklyCheckinDay || "Sun"} onChange={e=>patchSettings({ trainingPreferences: { ...trainingPrefs, weeklyCheckinDay: e.target.value } })}>
              {["Sun","Mon","Sat"].map((d)=><option key={d} value={d}>Weekly check-in day: {d}</option>)}
            </select>
            <select value={unitSettings?.distance || "miles"} onChange={e=>patchSettings({ units: { ...unitSettings, distance: e.target.value } })}>
              <option value="miles">Units: Miles</option>
              <option value="kilometers">Units: Kilometers</option>
            </select>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.28rem" }}>
              {[
                ["Conservative","Protect consistency, never overtrain"],
                ["Standard","Balanced load and progression"],
                ["Aggressive","Push harder, accept more risk"],
              ].map(([mode, desc]) => (
                <button key={mode} className="btn" onClick={()=>patchSettings({ trainingPreferences: { ...trainingPrefs, intensityPreference: mode } })} style={{ fontSize:"0.51rem", color:trainingPrefs?.intensityPreference===mode?C.green:"#9fb2d2", borderColor:trainingPrefs?.intensityPreference===mode?C.green+"35":"#324961", textAlign:"left" }}>
                  <div>{mode}</div><div style={{ fontSize:"0.45rem", color:"#7f94b3", marginTop:"0.12rem" }}>{desc}</div>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div style={{ borderTop:"1px solid #233851", marginTop:"0.75rem", paddingTop:"0.75rem" }}>
          <div className="sect-title" style={{ color:C.amber, marginBottom:"0.35rem" }}>APPEARANCE</div>
          <div style={{ display:"grid", gap:"0.3rem" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.25rem" }}>
              {["System","Light","Dark"].map((t) => (
                <button key={t} className="btn" onClick={()=>patchSettings({ appearance: { ...appearance, theme: t } })} style={{ fontSize:"0.52rem", color:appearance?.theme===t?C.green:"#9fb2d2", borderColor:appearance?.theme===t?C.green+"35":"#324961" }}>{t}</button>
              ))}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(6,1fr)", gap:"0.28rem" }}>
              {[["Green","#27f59a"],["Blue","#00c2ff"],["Orange","#ff8a00"],["Red","#ff3d81"],["Purple","#7c5cff"],["Neutral","#94a3b8"]].map(([name,color]) => (
                <button key={name} onClick={()=>patchSettings({ appearance: { ...appearance, palette: name } })} style={{ height:24, borderRadius:7, border:appearance?.palette===name?`2px solid ${color}`:"1px solid #324961", background:color, cursor:"pointer" }} title={name} />
              ))}
            </div>
          </div>
        </div>

        <div style={{ borderTop:"1px solid #233851", marginTop:"0.75rem", paddingTop:"0.75rem" }}>
          <div className="sect-title" style={{ color:C.green, marginBottom:"0.35rem" }}>NOTIFICATIONS</div>
          <div style={{ display:"grid", gap:"0.3rem" }}>
            <label style={{ fontSize:"0.53rem", color:"#cbd5e1" }}><input type="checkbox" checked={Boolean(notif?.allOff)} onChange={e=>patchSettings({ notifications: { ...notif, allOff: e.target.checked } })} /> All notifications off</label>
            <div style={{ display:"grid", gridTemplateColumns:"1fr 110px", gap:"0.35rem" }}>
              <label style={{ fontSize:"0.53rem", color:"#cbd5e1" }}><input type="checkbox" checked={Boolean(notif?.weeklyReminderOn)} disabled={notif?.allOff} onChange={e=>patchSettings({ notifications: { ...notif, weeklyReminderOn: e.target.checked } })} /> Weekly check-in reminder</label>
              <input type="time" value={notif?.weeklyReminderTime || "18:00"} disabled={notif?.allOff || !notif?.weeklyReminderOn} onChange={e=>patchSettings({ notifications: { ...notif, weeklyReminderTime: e.target.value } })} />
            </div>
            <label style={{ fontSize:"0.53rem", color:"#cbd5e1" }}><input type="checkbox" checked={Boolean(notif?.proactiveNudgeOn)} disabled={notif?.allOff} onChange={e=>patchSettings({ notifications: { ...notif, proactiveNudgeOn: e.target.checked } })} /> Coach proactive nudge</label>
            <div style={{ fontSize:"0.49rem", color:"#7f94b3" }}>One message if you&apos;ve been away 3+ days</div>
          </div>
        </div>

        <div style={{ borderTop:"1px solid #233851", marginTop:"0.75rem", paddingTop:"0.75rem" }}>
          <div className="sect-title" style={{ color:C.red, marginBottom:"0.35rem" }}>DATA & PRIVACY</div>
          <div style={{ display:"grid", gap:"0.3rem" }}>
            <button className="btn" onClick={exportData} style={{ fontSize:"0.52rem", color:C.blue, borderColor:C.blue+"35" }}>Export my data</button>
            <button className="btn" onClick={()=>{ setDeleteOpen(v=>!v); setDeleteStep(1); setDeleteConfirm(""); }} style={{ fontSize:"0.52rem", color:C.red, borderColor:C.red+"35" }}>Delete account</button>
            {deleteOpen && (
              <div style={{ border:"1px solid #3b2a39", borderRadius:8, padding:"0.45rem", display:"grid", gap:"0.3rem" }}>
                {deleteStep === 1 ? (
                  <>
                    <div style={{ fontSize:"0.52rem", color:"#f1d4dd" }}>This deletes logs, goals, check-ins, device links, and personalization. Export first if needed.</div>
                    <button className="btn" onClick={()=>{ exportData(); setDeleteStep(2); }} style={{ fontSize:"0.5rem" }}>Export first, then continue</button>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:"0.52rem", color:"#f1d4dd" }}>Type <b>DELETE</b> to confirm.</div>
                    <input value={deleteConfirm} onChange={e=>setDeleteConfirm(e.target.value)} placeholder="DELETE" />
                    <button className="btn" disabled={deleteConfirm !== "DELETE"} onClick={onDeleteAccount} style={{ fontSize:"0.5rem", color:C.red, borderColor:C.red+"35" }}>Confirm delete account</button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        <div style={{ borderTop:"1px solid #233851", marginTop:"1.2rem", paddingTop:"1rem" }}>
          <div className="sect-title" style={{ color:"#8fa5c8", marginBottom:"0.3rem" }}>PLAN MANAGEMENT</div>
          <button className="btn" onClick={onStartFresh} style={{ fontSize:"0.52rem", color:"#7f94b3", borderColor:"#2d405b", background:"transparent", padding:"0.22rem 0.5rem" }}>
            Start a new plan
          </button>
        </div>
      </div>
      {connectOpen && (
        <div onClick={()=>setConnectOpen(false)} style={{ position:"fixed", inset:0, background:"rgba(2,6,14,0.72)", display:"grid", placeItems:"center", zIndex:60, padding:"1rem" }}>
          <div onClick={e=>e.stopPropagation()} className="card card-soft" style={{ width:"100%", maxWidth:520, borderColor:"#30455f" }}>
            <div style={{ fontSize:"0.62rem", color:"#dbe7f6", lineHeight:1.7, marginBottom:"0.6rem" }}>
              Personal Trainer can read Apple Health workouts and device context that some recommendations use. We never share this data. You can revoke access anytime in iOS Settings.
            </div>
            <button className="btn btn-primary" onClick={requestAppleHealth} style={{ width:"100%", marginBottom:"0.45rem" }}>Connect Apple Health</button>
            <button className="btn" onClick={async ()=>{ await persistAppleHealth({ skipped: true }); setConnectOpen(false); }} style={{ width:"100%", fontSize:"0.52rem", color:"#93a8c8", borderColor:"#324761" }}>
              Skip for now
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function OnboardingCoachLegacyFallback({ onComplete }) {
  const SCRIPT = [
    { key: "primary_goal", text: "What's your primary goal?", type: "buttons", options: Object.values(PRIMARY_GOAL_LABELS), valueMap: Object.fromEntries(PRIMARY_GOAL_OPTIONS.map(k => [PRIMARY_GOAL_LABELS[k], k])) },
    { key: "experience_level", text: "How long have you been training consistently?", type: "buttons", options: Object.values(EXPERIENCE_LEVEL_LABELS), valueMap: Object.fromEntries(EXPERIENCE_LEVEL_OPTIONS.map(k => [EXPERIENCE_LEVEL_LABELS[k], k])) },
    { key: "training_days", text: "How many days per week can you realistically train? Not your best week Ã¢â‚¬â€ your average week when life is happening.", type: "buttons", options: ["2","3","4","5","6"] },
    { key: "session_length", text: "How much time do you have per session?", type: "buttons", options: Object.values(SESSION_LENGTH_LABELS), valueMap: Object.fromEntries(SESSION_LENGTH_OPTIONS.map(k => [SESSION_LENGTH_LABELS[k], k])) },
    { key: "injury_text", text: "Do you have any injuries or physical limitations I need to plan around?", type: "text", placeholder: "None currently" },
    { key: "training_location", text: "Where do you usually train?", type: "buttons", options: ["Home","Gym","Both","Varies"] },
  ];
  const [messages, setMessages] = useState([{ role: "coach", text: SCRIPT[0].text }]);
  const [answers, setAnswers] = useState({});
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState("");
  const [awaitingTimeline, setAwaitingTimeline] = useState(false);
  const [awaitingAdjustConfirm, setAwaitingAdjustConfirm] = useState(false);
  const [building, setBuilding] = useState(false);
  const current = SCRIPT[step];
  const needsEquipment = Boolean(answers.__needs_equipment);

  const callAnthropicIntake = async (prompt) => {
    const key = safeStorageGet(localStorage, "coach_api_key", "") || safeStorageGet(localStorage, "anthropic_api_key", "");
    if (!key) return null;
    try {
      const res = await safeFetchWithTimeout("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-key": key, "anthropic-version": "2023-06-01" },
        body: JSON.stringify({ model: "claude-3-5-haiku-latest", max_tokens: 600, messages: [{ role: "user", content: prompt }] }),
      }, 9000);
      if (!res.ok) return null;
      const data = await res.json();
      return data?.content?.[0]?.text || null;
    } catch { return null; }
  };

  const buildTimelineAssessment = async (payload) => {
    const prompt = `The user has provided the following goals and baseline:\n${JSON.stringify(payload, null, 2)}\n\nAssess each goal against the baseline and days available. For each goal:\n1. State whether it is realistic within the user's primary deadline (if one exists)\n2. If not realistic within that deadline: state what IS realistic by that date and when the full goal could be reached\n3. Identify any goal conflicts (e.g. aggressive cut + peak strength simultaneously)\n\nRules:\n- Be honest but not discouraging\n- Lead with what IS achievable, not what isn't\n- Never say a goal is impossible Ã¢â‚¬â€ say what's needed to make it possible and how long it realistically takes\n- If goals are fully compatible: say so and move on\n- Maximum 3 sentences per goal\n- End with: 'Here's what I'm going to prioritize in your plan Ã¢â‚¬â€ tell me if you want to adjust anything.'`;
    const ai = await callAnthropicIntake(prompt);
    if (ai) return ai.trim();
    return "Given your baseline and schedule, we'll prioritize one primary outcome and sequence secondary goals so recovery stays intact. By your deadline, we'll target measurable progress toward the main outcome while keeping competing goals in maintenance range, then progress them in the next block. Here's what I'm going to prioritize in your plan Ã¢â‚¬â€ tell me if you want to adjust anything.";
  };

  const askNext = (nextStep) => {
    if (nextStep >= SCRIPT.length) return;
    setMessages((prev) => [...prev, { role: "coach", text: SCRIPT[nextStep].text }]);
    setStep(nextStep);
    setDraft("");
  };

  const submitAnswer = async (value) => {
    const clean = String(value || "").trim();
    if (!clean && current?.type === "text") return;
    const answerText = clean || "None currently";
    setMessages((prev) => [...prev, { role: "user", text: answerText }]);

    if (answers.__needs_equipment) {
      const patched = { ...answers, equipment_text: answerText, __needs_equipment: false };
      setAnswers(patched);
      setAwaitingTimeline(true);
      const timeline = await buildTimelineAssessment(patched);
      setMessages((prev) => [...prev, { role: "coach", text: timeline }]);
      setAwaitingTimeline(false);
      setAwaitingAdjustConfirm(true);
      return;
    }

    const storedVal = current?.valueMap?.[answerText] ?? answerText;
    const nextAnswers = { ...answers, [current.key]: storedVal };
    setAnswers(nextAnswers);
    if (current.key === "training_location" && ["Home", "Varies"].includes(answerText)) {
      setAnswers({ ...nextAnswers, __needs_equipment: true });
      setMessages((prev) => [...prev, { role: "coach", text: "What equipment is available where you train?" }]);
      setDraft("");
      return;
    }
    if (step < SCRIPT.length - 1) {
      askNext(step + 1);
      return;
    }
    setAwaitingTimeline(true);
    const timeline = await buildTimelineAssessment(nextAnswers);
    setMessages((prev) => [...prev, { role: "coach", text: timeline }]);
    setAwaitingTimeline(false);
    setAwaitingAdjustConfirm(true);
  };

  const finalize = async (adjust = "") => {
    if (adjust.trim()) setMessages((prev) => [...prev, { role: "user", text: adjust.trim() }]);
    setBuilding(true);
    setMessages((prev) => [...prev, { role: "coach", text: "Building your plan..." }]);
    await onComplete({
      ...answers,
      training_days: answers.training_days || "3",
      timeline_feedback: adjust.trim(),
      timeline_assessment: messages.filter((m) => m.role === "coach").slice(-1)[0]?.text || "",
    });
    setBuilding(false);
  };

  return (
    <div style={{ maxWidth:860, margin:"0 auto" }}>
      <div className="card card-action" style={{ padding:"1rem" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.45rem" }}>COACH INTAKE</div>
        <div style={{ display:"grid", gap:"0.35rem", maxHeight:"58vh", overflowY:"auto", marginBottom:"0.55rem" }}>
          {messages.map((m, i) => (
            <div key={i} style={{ justifySelf:m.role === "user" ? "end" : "start", maxWidth:"92%", background:m.role === "user" ? "#16324b" : "#0f172a", border:"1px solid #22364f", borderRadius:10, padding:"0.45rem 0.55rem", fontSize:"0.58rem", lineHeight:1.65, color:"#dbe7f6" }}>
              {m.text}
            </div>
          ))}
          {awaitingTimeline && <div style={{ fontSize:"0.54rem", color:"#8fa5c8" }}>Coach is assessing your timelineÃ¢â‚¬Â¦</div>}
        </div>

        {!awaitingAdjustConfirm && !building && (
          <div style={{ display:"grid", gap:"0.35rem" }}>
            {!needsEquipment && current?.type === "buttons" ? (
              <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"0.3rem" }}>
                {current.options.map((opt) => <button key={opt} className="btn" onClick={()=>submitAnswer(opt)} style={{ fontSize:"0.56rem", color:C.green, borderColor:C.green+"35" }}>{opt}</button>)}
              </div>
            ) : (
              <>
                <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder={needsEquipment ? "Example: dumbbells, pull-up bar, treadmill" : (current?.placeholder || "Type your response...")} />
                <button className="btn btn-primary" onClick={()=>submitAnswer(draft)}>Send</button>
              </>
            )}
          </div>
        )}

        {awaitingAdjustConfirm && !building && (
          <div style={{ display:"grid", gap:"0.35rem" }}>
            <input value={draft} onChange={e=>setDraft(e.target.value)} placeholder="Anything to adjust before I generate the plan?" />
            <div style={{ display:"flex", gap:"0.35rem" }}>
              <button className="btn btn-primary" onClick={()=>finalize(draft)} style={{ flex:1 }}>Confirm & Build Plan</button>
              <button className="btn" onClick={()=>finalize("")} style={{ flex:1, color:C.green, borderColor:C.green+"35" }}>No changes</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ TODAY TAB Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function TodayTab({ planDay = null, todayWorkout: legacyTodayWorkout, currentWeek, rollingHorizon = [], logs, bodyweights, planAlerts, setPlanAlerts, analyzing, getZones, personalization, athleteProfile = null, momentum, strengthLayer, dailyStory, behaviorLoop, proactiveTriggers, onDismissTrigger, onApplyTrigger, applyDayContextOverride, shiftTodayWorkout, restoreShiftTodayWorkout, setEnvironmentMode, environmentSelection, injuryRule, setInjuryState, dailyCheckins, saveDailyCheckin, learningLayer, salvageLayer, validationLayer, optimizationLayer, failureMode, planComposer, saveBodyweights, coachPlanAdjustments, loading, storageStatus, authError }) {
  const todayWorkout = planDay?.resolved?.training || legacyTodayWorkout;
  const userProfile = athleteProfile?.userProfile || {};
  const planDayRecovery = planDay?.resolved?.recovery || null;
  const planDayLogging = planDay?.resolved?.logging || null;
  const planDayWeek = planDay?.week || null;
  const currentPlanWeek = planDayWeek?.planWeek || null;
  const safeRollingHorizon = Array.isArray(rollingHorizon) ? rollingHorizon : [];
  const zones = todayWorkout?.zones;
  const todayKey = new Date().toISOString().split("T")[0];
  const todayLog = logs[todayKey];
  const savedPlanDayCheckin = planDayLogging?.dailyCheckin || dailyCheckins?.[todayKey] || todayLog?.checkin || {};
  const [injuryArea, setInjuryArea] = useState(personalization.injuryPainState.area || "Achilles");
  const defaultCheckin = {
    ...DEFAULT_DAILY_CHECKIN,
    ...(savedPlanDayCheckin || {}),
    readiness: {
      ...(DEFAULT_DAILY_CHECKIN.readiness || {}),
      ...((savedPlanDayCheckin || {}).readiness || {}),
    },
  };
  const [checkin, setCheckin] = useState(defaultCheckin);
  const [checkinAck, setCheckinAck] = useState("");
  const [postSaveInsight, setPostSaveInsight] = useState("");
  const [todayDataError, setTodayDataError] = useState("");
  const [checkinSaving, setCheckinSaving] = useState(false);
  const [sessionVariant, setSessionVariant] = useState("standard");
  const [shiftChoiceOpen, setShiftChoiceOpen] = useState(false);
  const [shiftUndo, setShiftUndo] = useState(null);
  const [showEnvEditor, setShowEnvEditor] = useState(false);
  const [envDraft, setEnvDraft] = useState({ equipment: environmentSelection?.equipment || "dumbbells", time: environmentSelection?.time || "30", scope: "today" });
  const [cardExpanded, setCardExpanded] = useState(() => {
    try { return sessionStorage.getItem("card_" + todayKey) === "1"; } catch { return false; }
  });
  const [showInjuryPanel, setShowInjuryPanel] = useState(false);
  const [strengthInputs, setStrengthInputs] = useState({});
  const [showMoreAdjustments, setShowMoreAdjustments] = useState(false);
  const [dismissedAdjustmentIds, setDismissedAdjustmentIds] = useState([]);
  const [activeCoachAdjustment, setActiveCoachAdjustment] = useState(null);
  const [coachAdjustmentDetail, setCoachAdjustmentDetail] = useState("");
  const [coachAdjustmentLoading, setCoachAdjustmentLoading] = useState(false);
  useEffect(() => { setSessionVariant("standard"); }, [todayKey, todayWorkout?.label, todayWorkout?.type]);
  useEffect(() => {
    setEnvDraft({
      equipment: environmentSelection?.equipment || "dumbbells",
      time: environmentSelection?.time || "30",
      mode: environmentSelection?.mode || "Home",
      scope: "today",
    });
  }, [environmentSelection?.equipment, environmentSelection?.time, environmentSelection?.mode]);
  useEffect(() => {
    if (!shiftUndo?.expiresAt) return;
    const timer = setTimeout(() => setShiftUndo(null), Math.max(0, shiftUndo.expiresAt - Date.now()));
    return () => clearTimeout(timer);
  }, [shiftUndo?.expiresAt]);
  const reduceRunDescriptor = (text = "", ratio = 0.55) => String(text || "").replace(/(\d+(\.\d+)?)/g, (m) => {
    const n = Number(m);
    if (!Number.isFinite(n)) return m;
    const reduced = Math.max(1, Math.round(n * ratio * 10) / 10);
    return String(reduced);
  });
  const activeWorkout = useMemo(() => {
    const base = { ...(todayWorkout || {}) };
    if (sessionVariant === "standard") return { ...base, variantBadge: "" };
    if (sessionVariant === "short") {
      const canCompress = ["hard-run", "easy-run", "long-run", "run+strength", "strength+prehab", "conditioning"].includes(base?.type || "");
      if (!canCompress) {
        return { ...base, label: "20-min stimulus swap", fallback: "Could not preserve todayÃ¢â‚¬â„¢s structure under 20 min. Swapped to: 12-min tempo + 8-min strength finisher.", variantBadge: "20-min version active" };
      }
      return {
        ...base,
        label: `${base.label || "Session"} (20-min version)`,
        run: base.run ? { ...base.run, d: reduceRunDescriptor(base.run.d || "20 min", 0.55) } : base.run,
        strengthDuration: "12-15 min",
        strengthTrack: base.strengthTrack,
        compressed: true,
        variantBadge: "20-min version active",
        compressionWhy: base.run?.t ? `Primary stimulus preserved (${base.run.t}); total volume reduced by ~45%.` : "Volume reduced to preserve primary stimulus in a 20-minute window.",
      };
    }
    return {
      ...base,
      label: `${base.label || "Session"} (Extended)`,
      run: base.run ? { ...base.run, d: reduceRunDescriptor(base.run.d || "20 min", 1.25) } : base.run,
      strengthDuration: "45-55 min",
      extendedFinisher: base.run?.t
        ? "Extended finisher: 4 Ãƒâ€” 20s strides with 40s walk."
        : "Extended finisher: 2 rounds Ã¢â‚¬â€ 12 DB goblet squats, 10 push-ups, 30s plank.",
      variantBadge: "Extended",
    };
  }, [todayWorkout, sessionVariant]);
  const primaryTrigger = proactiveTriggers?.[0] || null;
  const isTravelModeSuggestion = primaryTrigger?.actionType === "SWITCH_TRAVEL_MODE";
  const isTodayTravelOverride = environmentSelection?.scope === "today" && String(environmentSelection?.mode || "").toLowerCase() === "travel";
  const toggleTravelModeForToday = async () => {
    if (isTodayTravelOverride) {
      await setEnvironmentMode({ scope: "today", clearTodayOverride: true });
      setEnvDraft(prev => ({ ...prev, scope: "today" }));
      return;
    }
    await setEnvironmentMode({ mode: "Travel", scope: "today" });
    setEnvDraft({ equipment: "none", time: "20", mode: "Travel", scope: "today" });
  };
  const conciseFocus = (dailyStory?.focus || dailyStory?.brief || "Execute todayÃ¢â‚¬â„¢s session cleanly.")
    .replace(/^execute\s*/i, "")
    .split(".")[0];
  const conciseSuccess = (dailyStory?.success || "Complete the session and log it.").split(".")[0];
  const phase = planDayWeek?.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
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
  const readinessPromptSignal = coachPlanAdjustments?.extra?.readinessSignals?.[todayKey] || null;
  const readinessInfluence = planDayRecovery || deriveDeterministicReadinessState({
    todayKey,
    checkin,
    promptSignal: readinessPromptSignal,
    workout: activeWorkout,
    logs,
    dailyCheckins,
    personalization,
    momentum,
    userProfile: userProfile || {},
  });
  const readinessMetrics = readinessInfluence?.metrics || {};
  const displayWorkout = planDay
    ? (sessionVariant === "standard" ? todayWorkout : activeWorkout)
    : (readinessInfluence?.adjustedWorkout || activeWorkout);
  const readinessState = readinessInfluence?.state || displayWorkout?.readinessState || "steady";
  const readinessTone = ["recovery", "reduced_load"].includes(readinessState) ? C.amber : readinessState === "progression" ? C.green : "#cbd5e1";
  const cardColor = dayColors[displayWorkout?.type] || (["recovery", "reduced_load"].includes(readinessState) ? C.amber : C.green);
  const todayUsesDeviceRecovery = Boolean(planDay?.flags?.deviceModified) || /garmin readiness|device signals/i.test(`${todayWorkout?.label || ""} ${todayWorkout?.explanation || ""}`);
  const todayProvenance = planDay?.provenance?.summary || buildProvenanceText({
    inputs: [
      "your active goals",
      historicalLogs.length ? "recent training momentum" : "today's planned session",
      environmentSelection?.mode ? `today's ${String(environmentSelection.mode || "training").toLowerCase()} setup` : "today's setup",
      readinessMetrics?.countableCount ? "recent workout completion" : null,
      readinessMetrics?.hardSessions7d ? "recent intensity load" : null,
      readinessMetrics?.hasTodayRecoveryInput
        ? "today's readiness check-in"
        : readinessMetrics?.hasRecoveryHistory
        ? "recent recovery check-ins"
        : todayUsesDeviceRecovery
        ? "device recovery signals"
        : null,
    ],
    limitation: !historicalLogs.length ? "Recent training history is still limited." : "",
  });
  const strTrack = displayWorkout?.strengthTrack || todayWorkout?.strengthTrack || "home";
  const strSess = displayWorkout?.strSess || todayWorkout?.strSess || "A";
  const strExercises = STRENGTH[strSess]?.[strTrack] || [];
  const hasStrength = displayWorkout?.type === "run+strength" || displayWorkout?.type === "strength+prehab";
  const hasPrehab = displayWorkout?.type === "strength+prehab";
  const runColor = displayWorkout?.run?.t === "Intervals" ? C.amber : displayWorkout?.run?.t === "Long" ? C.red : displayWorkout?.run?.t === "Tempo" ? C.amber : readinessTone;
  const runPace = displayWorkout?.run ? (displayWorkout.run.t === "Intervals" ? zones?.int : displayWorkout.run.t === "Long" ? zones?.long : displayWorkout.run.t === "Tempo" ? zones?.tempo : zones?.easy) : null;
  const tomorrowDate = new Date(`${todayKey}T12:00:00`);
  tomorrowDate.setDate(tomorrowDate.getDate() + 1);
  const tomorrowDayOfWeek = tomorrowDate.getDay();
  const tomorrowWeek = new Date().getDay() === 0 ? currentWeek + 1 : currentWeek;
  const tomorrowPlanWeek = tomorrowWeek === currentWeek
    ? currentPlanWeek
    : safeRollingHorizon.find((row) => row?.kind === "plan" && row?.absoluteWeek === tomorrowWeek)?.planWeek || null;
  const tomorrowWorkout = tomorrowPlanWeek?.sessionsByDay?.[tomorrowDayOfWeek] || getTodayWorkout(tomorrowWeek, tomorrowDayOfWeek);
  const tomorrowHasSession = !!tomorrowWorkout?.label && tomorrowWorkout?.type !== "rest";
  const activeStrengthAdjustments = normalizePendingStrengthAdjustments(personalization?.strengthProgression?.pendingByDate?.[todayKey]);
  const activeStrengthAdjustment = activeStrengthAdjustments[0] || null;
  const activeDayOverride = coachPlanAdjustments?.dayOverrides?.[todayKey] || null;
  const activeNutritionOverride = coachPlanAdjustments?.nutritionOverrides?.[todayKey] || null;
  const fitnessLevel = personalization?.fitnessSignals?.fitnessLevel || "unknown";
  const garminSummary = personalization?.connectedDevices?.garmin?.dailySummaries?.[todayKey] || {};
  const garminReadinessScore = Number(garminSummary?.trainingReadinessScore ?? personalization?.connectedDevices?.garmin?.trainingReadinessScore ?? 0) || null;
  const garminConnected = (personalization?.connectedDevices?.garmin?.status || "").includes("connected");
  const garminApiStaleError = garminConnected
    && personalization?.connectedDevices?.garmin?.lastApiStatus === "rate_limited"
    && ((Date.now() - Number(personalization?.connectedDevices?.garmin?.lastApiErrorAt || 0)) > (48 * 60 * 60 * 1000));
  const consistent21 = Object.entries(logs || {}).filter(([date, l]) => {
    const dd = (Date.now() - new Date(`${date}T12:00:00`).getTime()) / 86400000;
    return dd <= 21 && ["completed_as_planned","completed_modified","partial_completed"].includes(l?.checkin?.status);
  }).length >= 9;
  const advancedVolumeFinisher = fitnessLevel === "advanced" && currentWeek >= 2 ? "Optional finisher: +1 aerobic cooldown set or +1 accessory set." : "";
  const developingVolumeGuardrail = fitnessLevel === "developing" && !consistent21 ? "Volume guardrail: hold current volume until 3 consistent weeks complete." : "";

  useEffect(() => { setCheckin(defaultCheckin); }, [todayKey, savedPlanDayCheckin?.ts]);
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`dismissed_coach_adjustments_${todayKey}`);
      const parsed = raw ? JSON.parse(raw) : [];
      setDismissedAdjustmentIds(Array.isArray(parsed) ? parsed : []);
    } catch {
      setDismissedAdjustmentIds([]);
    }
    setShowMoreAdjustments(false);
    setActiveCoachAdjustment(null);
    setCoachAdjustmentDetail("");
    setCoachAdjustmentLoading(false);
  }, [todayKey]);
  useEffect(() => {
    if (!hasStrength) return;
    const initial = {};
    strExercises.forEach((ex) => {
      const key = normalizeExerciseKey(ex?.ex || "");
      const normalized = normalizeStrengthExercise(ex || {});
      const mode = inferExerciseMode(ex?.ex || "");
      const prescription = personalization?.strengthProgression?.prescriptions?.[key] || {};
      initial[key] = {
        exercise: ex?.ex || "Exercise",
        weightUsed: prescription?.workingWeight ?? "",
        actualWeight: prescription?.workingWeight ?? "",
        repsCompleted: "",
        actualReps: "",
        actualSets: parseSetCount(normalized.sets),
        prescribedSets: parseSetCount(normalized.sets),
        prescribedReps: Number(prescription?.reps || parseRepTarget(normalized.reps)),
        prescribedSetsText: normalized.sets,
        prescribedRepsText: normalized.reps,
        prescribedWeight: prescription?.workingWeight ?? null,
        bandTension: prescription?.bandTension || "",
        bodyweightOnly: mode === "bodyweight",
        mode,
        bucket: inferExerciseBucketV2(ex?.ex || ""),
      };
    });
    setStrengthInputs(initial);
  }, [hasStrength, strSess, strTrack, todayKey, personalization?.strengthProgression?.prescriptions]);

  const normalizeCoachOneLine = (line = "") => {
    const trimmed = String(line || "").replace(/\s+/g, " ").trim();
    if (!trimmed) return "";
    const firstSentence = trimmed.split(/[.!?]/)[0].trim();
    return firstSentence.length > 100 ? `${firstSentence.slice(0, 99).trim()}Ã¢â‚¬Â¦` : firstSentence;
  };

  const adjustmentCards = useMemo(() => {
    const cards = [];
    if (activeStrengthAdjustment) {
      const oldW = Number(activeStrengthAdjustment?.oldWeight || 0);
      const newW = Number(activeStrengthAdjustment?.newWeight || 0);
      const icon = newW > oldW ? "Ã¢â€ â€˜" : newW < oldW ? "Ã¢â€ â€œ" : "Ã¢Å¡Â¡";
      cards.push({
        id: activeStrengthAdjustment?.id || `strength_${todayKey}_${activeStrengthAdjustment?.exercise || "session"}`,
        icon,
        type: newW > oldW ? "weight_up" : newW < oldW ? "weight_down" : "session_mod",
        impact: newW !== oldW ? 100 : 80,
        summary: normalizeCoachOneLine(activeStrengthAdjustment?.note || activeStrengthAdjustment?.inlineNote || `${icon} Load adjusted for today.`),
        detail: activeStrengthAdjustment?.explanation || "",
        reason: String(activeStrengthAdjustment?.reason || "progressive_overload").replaceAll("_", " "),
        coachLine: activeStrengthAdjustment?.coachLine || "",
      });
    }
    if (activeDayOverride) {
      const reason = String(activeDayOverride?.reason || "session adjustment").toLowerCase();
      const provenanceReason = describeProvenanceRecord(activeDayOverride?.provenance || null, reason.replaceAll("_", " "));
      const isSwap = /shift|move|swap/.test(reason) || /moved/.test(String(activeDayOverride?.label || "").toLowerCase());
      cards.push({
        id: `day_override_${todayKey}_${reason}`,
        icon: isSwap ? "Ã°Å¸â€Â" : "Ã¢Å¡Â¡",
        type: isSwap ? "session_swap" : "session_mod",
        impact: isSwap ? 75 : 90,
        summary: normalizeCoachOneLine(activeDayOverride?.coachOneLine || activeDayOverride?.fallback || `${isSwap ? "Session moved in schedule today" : "Session structure adjusted today"} - ${provenanceReason}.`),
        detail: activeDayOverride?.explain || "",
        reason: provenanceReason,
      });
    }
    if (activeNutritionOverride) {
      const nutritionDayType = getNutritionOverrideDayType(activeNutritionOverride);
      const nutritionReason = describeProvenanceRecord(activeNutritionOverride?.provenance || null, String(activeNutritionOverride?.reason || nutritionDayType || "nutrition override").replaceAll("_", " "));
      cards.push({
        id: `nutrition_${todayKey}_${nutritionDayType || "override"}`,
        icon: "Ã°Å¸â€™Â§",
        type: "nutrition_mod",
        impact: 60,
        summary: normalizeCoachOneLine(`Nutrition target set to ${String(nutritionDayType || "custom").replaceAll("_", " ")} today.`),
        detail: "",
        reason: nutritionReason,
      });
    }
    return cards
      .filter((card) => card.summary)
      .filter((card, idx, arr) => arr.findIndex(c => c.id === card.id) === idx)
      .sort((a, b) => Number(b.impact || 0) - Number(a.impact || 0));
  }, [activeStrengthAdjustment, activeDayOverride, activeNutritionOverride, todayKey]);

  const visibleAdjustmentCards = adjustmentCards.filter(card => !dismissedAdjustmentIds.includes(card.id));
  const primaryAdjustment = visibleAdjustmentCards[0] || null;
  const secondaryAdjustments = [];

  const dismissAdjustment = (id) => {
    const next = Array.from(new Set([...(dismissedAdjustmentIds || []), id]));
    setDismissedAdjustmentIds(next);
    try { sessionStorage.setItem(`dismissed_coach_adjustments_${todayKey}`, JSON.stringify(next)); } catch {}
  };

  const openAdjustmentDetail = async (card) => {
    setActiveCoachAdjustment(card);
    if (card?.detail) {
      setCoachAdjustmentDetail(card?.coachLine ? `${card.coachLine}\n\n${card.detail}` : card.detail);
      setCoachAdjustmentLoading(false);
      return;
    }
    setCoachAdjustmentDetail("");
    setCoachAdjustmentLoading(true);
    try {
      const generated = await callAnthropic({
        system: "You are a concise running and strength coach. Explain plan changes plainly.",
        user: `Write 3-5 conversational sentences explaining this training adjustment.\nAdjustment type: ${card?.type || "session_mod"}\nOne-line notification: ${card?.summary || ""}\nReason: ${card?.reason || "coach adjustment"}\nTone: specific, direct, no pep talk fluff.`,
        maxTokens: 180,
      });
      const detail = (generated || "").trim() || "This change keeps load progression controlled while preserving session intent.";
      setCoachAdjustmentDetail(card?.coachLine ? `${card.coachLine}\n\n${detail}` : detail);
    } catch {
      setCoachAdjustmentDetail("This change keeps load progression controlled while preserving session intent.");
    } finally {
      setCoachAdjustmentLoading(false);
    }
  };

  const toggleCard = () => {
    const next = !cardExpanded;
    setCardExpanded(next);
    try { sessionStorage.setItem("card_" + todayKey, next ? "1" : "0"); } catch {}
  };

  // Coach context lines (formerly in "More context" dropdown)
  const contextLines = [
    salvageLayer.active ? salvageLayer.compressedPlan.success : null,
    validationLayer?.coachNudge || null,
  ].filter(Boolean);
  const readinessBadgeLabel = readinessInfluence?.stateLabel || displayWorkout?.variantBadge || readinessInfluence?.badge || "On plan";
  const readinessSourceLabel = readinessInfluence?.source || (todayUsesDeviceRecovery ? "device" : "plan");
  const shortProvenance = normalizeCoachOneLine(todayProvenance || "");
  const todayTrust = buildTrustSummary({
    explicitUserInput: Boolean(readinessMetrics?.hasTodayRecoveryInput),
    loggedActuals: Boolean(historicalLogs.length || readinessMetrics?.countableCount),
    deviceData: Boolean(todayUsesDeviceRecovery || garminReadinessScore),
    inferredHeuristics: true,
    limitation: !historicalLogs.length ? "Recent training history is still limited." : "",
    stale: Boolean(garminApiStaleError),
  });
  const todayTrustTone = buildReviewBadgeTone(
    todayTrust.level === "grounded" ? "match" : todayTrust.level === "partial" ? "changed" : "recovery"
  );
  const rationaleHeadline = normalizeCoachOneLine(primaryAdjustment?.summary || readinessInfluence?.coachLine || conciseFocus);
  const rationaleSupport = normalizeCoachOneLine(primaryAdjustment?.reason || readinessInfluence?.userVisibleLine || shortProvenance);
  const successHeadline = normalizeCoachOneLine(displayWorkout?.success || conciseSuccess || "Complete the session and log it.");
  const successSupport = normalizeCoachOneLine(
    displayWorkout?.intensityGuidance
      ? `Keep intensity at ${displayWorkout.intensityGuidance}.`
      : readinessInfluence?.recoveryLine
      ? readinessInfluence.recoveryLine
      : displayWorkout?.recoveryRecommendation
      ? displayWorkout.recoveryRecommendation
      : displayWorkout?.compressionWhy
      ? displayWorkout.compressionWhy
      : displayWorkout?.extendedFinisher
      ? displayWorkout.extendedFinisher
      : ""
  );
  const tomorrowPreviewText = `${tomorrowWorkout?.label || "Rest"}${tomorrowWorkout?.run ? ` - ${tomorrowWorkout.run.d}` : ""}`;
  const primaryActionSummary = sessionVariant === "short"
    ? "Short version active"
    : sessionVariant === "extended"
    ? "Extended version active"
    : "Primary actions";
  const storageBannerCopy = (() => {
    const reason = storageStatus?.reason || "";
    if (reason === STORAGE_STATUS_REASONS.transient) {
      return storageStatus?.detail || "Cloud sync failed temporarily. Using local data safely for now.";
    }
    if (reason === STORAGE_STATUS_REASONS.dataIncompatible) {
      return storageStatus?.detail || "Cloud data could not be read safely. Using local data instead.";
    }
    if (reason === STORAGE_STATUS_REASONS.providerUnavailable) {
      return storageStatus?.detail || "Cloud sync provider is unavailable or misconfigured.";
    }
    if (reason === STORAGE_STATUS_REASONS.notSignedIn || reason === STORAGE_STATUS_REASONS.signedOut) {
      return storageStatus?.detail || "You are not signed in, so the app is using local data only.";
    }
    return storageStatus?.detail || "Cloud sync unavailable right now. Using local data safely.";
  })();

  return (
    <div className="fi">
      {loading && (
        <div className="card card-soft" style={{ marginBottom:"0.7rem", borderColor:"#2a3b56", fontSize:"0.56rem", color:"#9fb2d2" }}>
          Loading todayÃ¢â‚¬â„¢s training stateÃ¢â‚¬Â¦
        </div>
      )}
      {!loading && authError && (
        <div className="card card-soft" style={{ marginBottom:"0.7rem", borderColor:C.amber+"35", fontSize:"0.56rem", color:C.amber }}>
          {authError}
        </div>
      )}
      {!loading && !authError && storageStatus?.mode === "local" && (
        <div className="card card-soft" style={{ marginBottom:"0.7rem", borderColor:"#2a3b56", fontSize:"0.56rem", color:"#8fa5c8" }}>
          {storageBannerCopy}
        </div>
      )}
      {garminApiStaleError && (
        <div className="card card-soft" style={{ marginBottom:"0.7rem", borderColor:C.amber+"35", fontSize:"0.56rem", color:C.amber }}>
          Garmin data has been unavailable for over 48 hours. Using Apple Health fallback.
        </div>
      )}

      <div style={{ marginBottom:"0.85rem", display:"grid", gap:"0.65rem" }}>
        <div className="card card-soft" style={{ borderColor:readinessTone+"26", background:"#0d1420" }}>
          <div style={{ display:"flex", justifyContent:"space-between", gap:"0.35rem", alignItems:"center", flexWrap:"wrap", marginBottom:"0.38rem" }}>
            <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.14em" }}>WHY TODAY</div>
            <span style={{ fontSize:"0.46rem", color:todayTrustTone.color, background:todayTrustTone.bg, padding:"0.14rem 0.4rem", borderRadius:999 }}>{todayTrust.label}</span>
          </div>
          <div style={{ fontSize:"0.62rem", color:"#e2e8f0", lineHeight:1.55 }}>{rationaleHeadline}</div>
          {!!rationaleSupport && <div style={{ marginTop:"0.28rem", fontSize:"0.53rem", color:"#8fa5c8", lineHeight:1.5 }}>{rationaleSupport}</div>}
          <div style={{ marginTop:"0.3rem", fontSize:"0.48rem", color:"#64748b" }}>Source: {readinessSourceLabel}{shortProvenance ? ` - ${shortProvenance}` : ""}</div>
          <div style={{ marginTop:"0.16rem", fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5 }}>{todayTrust.summary}</div>
        </div>
        <div className="card card-soft" style={{ borderColor:C.green+"26", background:"#0d1711" }}>
          <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.14em", marginBottom:"0.38rem" }}>SUCCESS TODAY</div>
          <div style={{ fontSize:"0.62rem", color:"#e2e8f0", lineHeight:1.55 }}>{successHeadline}</div>
          {!!successSupport && <div style={{ marginTop:"0.28rem", fontSize:"0.53rem", color:"#8fa5c8", lineHeight:1.5 }}>{successSupport}</div>}
        </div>
        {primaryAdjustment && (
          <div className="card card-soft" style={{ borderColor:C.blue+"28", background:"#0d1420" }}>
            <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:"0.45rem", marginBottom:"0.28rem" }}>
              <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.14em" }}>WHAT CHANGED</div>
              <button className="btn" onClick={() => dismissAdjustment(primaryAdjustment.id)} style={{ border:"none", background:"none", padding:0, fontSize:"0.62rem", color:"#64748b", minWidth:18 }} aria-label="Dismiss coach adjustment notification">x</button>
            </div>
            <button className="btn" onClick={() => openAdjustmentDetail(primaryAdjustment)} style={{ border:"none", background:"none", padding:0, fontSize:"0.58rem", color:"#dbe7f6", textAlign:"left", justifyContent:"flex-start" }}>
              {primaryAdjustment.icon} {primaryAdjustment.summary}
            </button>
            {primaryAdjustment.reason && <div style={{ marginTop:"0.24rem", fontSize:"0.52rem", color:"#8fa5c8", lineHeight:1.5 }}>{primaryAdjustment.reason}</div>}
          </div>
        )}
        <div className="card card-soft" style={{ borderColor:"#2b3f5e", background:"#0d1420" }}>
          <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.14em", marginBottom:"0.38rem" }}>NEXT</div>
          <div style={{ fontSize:"0.62rem", color:"#e2e8f0", lineHeight:1.55 }}>Tomorrow: {tomorrowPreviewText}</div>
          <div style={{ marginTop:"0.28rem", fontSize:"0.52rem", color:"#8fa5c8" }}>{primaryActionSummary}</div>
        </div>
      </div>

      <div
        onClick={toggleCard}
        style={{ marginBottom:"0.75rem", background:"#0f172a", border:`1px solid ${cardColor}22`, boxShadow:`0 18px 42px ${cardColor}10`, borderRadius:16, padding:"1rem 1.05rem", cursor:"pointer", transition:"border-color 0.15s", userSelect:"none" }}
      >
        <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between", gap:"0.6rem", marginBottom:"0.7rem" }}>
          <div style={{ display:"grid", gap:"0.22rem", minWidth:0 }}>
            <div style={{ fontSize:"1.32rem", color:"#f8fafc", fontWeight:650, lineHeight:1.15 }}>{displayWorkout?.label || "Rest Day"}</div>
            <div style={{ fontSize:"0.56rem", color:"#8fa5c8", lineHeight:1.55 }}>
              {displayWorkout?.run?.t || (hasStrength ? `Strength ${strSess}` : displayWorkout?.type?.replaceAll("-", " ") || "Session")}
              {displayWorkout?.strengthDuration ? ` - ${displayWorkout.strengthDuration}` : ""}
              {displayWorkout?.run?.d ? ` - ${displayWorkout.run.d}` : ""}
            </div>
          </div>
          <span style={{ fontSize:"0.72rem", color:"#475569", transform: cardExpanded ? "rotate(180deg)" : "rotate(0deg)", transition:"transform 0.2s", paddingTop:"0.15rem" }}>v</span>
        </div>
        <div style={{ display:"flex", alignItems:"center", gap:"0.4rem", marginBottom:"0.7rem", flexWrap:"wrap" }}>
          <span style={{ fontSize:"0.48rem", color:cardColor, background:cardColor+"15", padding:"0.15rem 0.45rem", borderRadius:6, fontWeight:500, letterSpacing:"0.04em" }}>
            {displayWorkout?.type?.replace(/[+-]/g," + ").toUpperCase() || "REST"}
          </span>
          <span style={{ fontSize:"0.48rem", color:readinessTone, background:readinessTone+"15", padding:"0.15rem 0.45rem", borderRadius:6, fontWeight:600, letterSpacing:"0.04em" }}>
            {readinessBadgeLabel}
          </span>
          <span onClick={e=>{ e.stopPropagation(); setEnvDraft({ equipment: environmentSelection?.equipment || "dumbbells", time: environmentSelection?.time || "30", scope: "today" }); setShowEnvEditor(true); }} style={{ fontSize:"0.48rem", color:"#94a3b8", background:"#1e293b", padding:"0.15rem 0.45rem", borderRadius:6, cursor:"pointer" }}>
            {equipmentLabel} - {timeLabel}
          </span>
          {injuryBadge && (
            <span onClick={e=>{ e.stopPropagation(); setShowInjuryPanel(p=>!p); }} style={{ fontSize:"0.48rem", color:injuryBadge.color, background:injuryBadge.color+"15", padding:"0.15rem 0.45rem", borderRadius:6, cursor:"pointer" }}>
              {injuryBadge.label}
            </span>
          )}
          {displayWorkout?.modifierBadge && (
            <span style={{ fontSize:"0.48rem", color:C.amber, background:C.amber+"15", padding:"0.15rem 0.45rem", borderRadius:6 }}>
              {displayWorkout.modifierBadge}
            </span>
          )}
          {displayWorkout?.variantBadge && (
            <span style={{ fontSize:"0.48rem", color:C.green, background:C.green+"15", padding:"0.15rem 0.45rem", borderRadius:6 }}>
              {displayWorkout?.variantBadge}
            </span>
          )}
        </div>
        {displayWorkout?.run && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:"0.6rem", marginBottom: hasStrength ? "0.35rem" : 0 }}>
            <div>
              <div style={{ fontSize:"0.49rem", color:"#64748b", letterSpacing:"0.08em" }}>WHAT</div>
              <div className="mono" style={{ fontSize:"0.82rem", color:runColor, fontWeight:600 }}>{displayWorkout.run.d}</div>
            </div>
            <div>
              <div style={{ fontSize:"0.49rem", color:"#64748b", letterSpacing:"0.08em" }}>HOW HARD</div>
              <div className="mono" style={{ fontSize:"0.82rem", color:runColor, fontWeight:600 }}>{runPace}/mi</div>
            </div>
            <div>
              <div style={{ fontSize:"0.49rem", color:"#64748b", letterSpacing:"0.08em" }}>SESSION</div>
              <div style={{ fontSize:"0.82rem", color:runColor, fontWeight:600 }}>{displayWorkout.run.t}</div>
            </div>
          </div>
        )}
        {hasStrength && !displayWorkout?.run && (
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,minmax(0,1fr))", gap:"0.6rem" }}>
            <div>
              <div style={{ fontSize:"0.49rem", color:"#64748b", letterSpacing:"0.08em" }}>WHAT</div>
              <div style={{ fontSize:"0.82rem", color:C.blue, fontWeight:600 }}>Strength {strSess}</div>
            </div>
            <div>
              <div style={{ fontSize:"0.49rem", color:"#64748b", letterSpacing:"0.08em" }}>HOW HARD</div>
              <div style={{ fontSize:"0.82rem", color:C.blue, fontWeight:600 }}>{displayWorkout?.intensityGuidance || "Controlled"}</div>
            </div>
            <div>
              <div style={{ fontSize:"0.49rem", color:"#64748b", letterSpacing:"0.08em" }}>SETUP</div>
              <div className="mono" style={{ fontSize:"0.82rem", color:C.blue, fontWeight:600 }}>{strTrack === "hotel" ? "Gym" : "Home"}</div>
            </div>
          </div>
        )}
        {hasStrength && displayWorkout?.run && (
          <div style={{ fontSize:"0.56rem", color:"#94a3b8", marginTop:"0.45rem" }}>
            + Strength {strSess} ({strTrack === "hotel" ? "Gym" : "Home"}) - {displayWorkout?.strengthDuration || "20-30 min"}
          </div>
        )}

        {cardExpanded && (
          <div style={{ marginTop:"0.75rem", borderTop:"1px solid #1e293b", paddingTop:"0.75rem" }} onClick={e => e.stopPropagation()}>
            {displayWorkout?.run && (
              <div style={{ marginBottom: hasStrength ? "0.85rem" : 0 }}>
                <div style={{ fontSize:"0.52rem", color:"#64748b", letterSpacing:"0.1em", marginBottom:"0.4rem" }}>RUN</div>
                <div style={{ fontSize:"0.62rem", color:"#cbd5e1", lineHeight:1.65 }}>
                  {displayWorkout.run.t} - {displayWorkout.run.d} at {runPace}/mi
                </div>
                {displayWorkout?.environmentNote && <div style={{ fontSize:"0.54rem", color:"#94a3b8", marginTop:"0.2rem" }}>{displayWorkout.environmentNote}</div>}
                {readinessInfluence?.recoveryLine && <div style={{ fontSize:"0.54rem", color:readinessTone, marginTop:"0.2rem" }}>{readinessInfluence.recoveryLine}</div>}
              </div>
            )}

            {hasStrength && (
              <div style={{ marginBottom: hasPrehab ? "0.85rem" : 0 }}>
                <div style={{ fontSize:"0.52rem", color:"#64748b", letterSpacing:"0.1em", marginBottom:"0.4rem" }}>STRENGTH {strSess} - {strTrack === "hotel" ? "GYM" : "HOME"}</div>
                <div style={{ display:"grid", gap:"0.3rem" }}>
                  {strExercises.map((ex, i) => (
                    <div key={i} style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"0.5rem", padding:"0.35rem 0", borderBottom: i < strExercises.length - 1 ? "1px solid #1e293b20" : "none" }}>
                      {(() => {
                        const key = normalizeExerciseKey(ex?.ex || "");
                        const prescription = personalization?.strengthProgression?.prescriptions?.[key] || {};
                        const mode = prescription?.mode || inferExerciseMode(ex?.ex || "");
                        const prescriptionBadge = mode === "bodyweight"
                          ? `${prescription?.sets || parseSetCount(ex?.sets)}x${prescription?.reps || parseRepTarget(ex?.sets)}`
                          : mode === "band" && prescription?.bandTension
                          ? `${prescription.bandTension} - ${prescription?.sets || parseSetCount(ex?.sets)} sets`
                          : prescription?.workingWeight
                          ? `${prescription?.workingWeight} lb - ${prescription?.sets || parseSetCount(ex?.sets)} sets`
                          : ex.sets;
                        return (
                          <>
                            <div>
                              <div style={{ fontSize:"0.6rem", color:"#e2e8f0", fontWeight:500 }}>{ex.ex}</div>
                              <div style={{ fontSize:"0.5rem", color:"#64748b", marginTop:"0.1rem" }}>{ex.note}</div>
                            </div>
                            <div className="mono" style={{ fontSize:"0.58rem", color:C.blue, fontWeight:500, whiteSpace:"nowrap", alignSelf:"center" }}>{prescriptionBadge}</div>
                          </>
                        );
                      })()}
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

            {displayWorkout?.recoveryRecommendation && !readinessInfluence?.recoveryLine && (
              <div style={{ marginTop:"0.55rem", fontSize:"0.54rem", color:readinessTone }}>
                Recovery recommendation: {displayWorkout.recoveryRecommendation}
              </div>
            )}

            {/* Optional secondary */}
            {(displayWorkout?.optionalSecondary || planComposer?.aestheticAllocation?.active) && (
              <div style={{ marginTop:"0.6rem", fontSize:"0.56rem", color:"#cbd5e1" }}>
                + {displayWorkout?.optionalSecondary || "Optional: 10 min core"}
              </div>
            )}
            {!!advancedVolumeFinisher && <div style={{ marginTop:"0.45rem", fontSize:"0.54rem", color:C.green }}>{advancedVolumeFinisher}</div>}
            {!!developingVolumeGuardrail && <div style={{ marginTop:"0.45rem", fontSize:"0.54rem", color:C.amber }}>{developingVolumeGuardrail}</div>}
            {displayWorkout?.compressionWhy && <div style={{ marginTop:"0.55rem", fontSize:"0.54rem", color:C.green }}>{displayWorkout.compressionWhy}</div>}
            {displayWorkout?.extendedFinisher && <div style={{ marginTop:"0.55rem", fontSize:"0.54rem", color:C.blue }}>{displayWorkout.extendedFinisher}</div>}
          </div>
        )}
      </div>


      <div style={{ fontSize:"0.5rem", color:"#475569", letterSpacing:"0.14em", marginBottom:"0.45rem", marginTop:"0.1rem" }}>PRIMARY ACTIONS</div>

      {/* Session modify buttons */}
      <div style={{ marginBottom:"0.75rem", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.4rem", background:"#0f141d", borderRadius:10, padding:"0.7rem 0.85rem" }}>
        <button className="btn" onClick={()=>setSessionVariant(v=>v === "short" ? "standard" : "short")} style={{ fontSize:"0.5rem", color: sessionVariant === "short" ? "#0f172a" : C.green, background: sessionVariant === "short" ? C.green : "transparent", borderColor:C.green+"30", fontWeight: sessionVariant === "short" ? 600 : 400 }}>{sessionVariant === "short" ? "Ã¢Å“â€œ Shortened to 20 min" : "Shorten to 20 min"}</button>
        <button className="btn" onClick={()=>setSessionVariant(v=>v === "extended" ? "standard" : "extended")} style={{ fontSize:"0.5rem", color: sessionVariant === "extended" ? "#0f172a" : C.amber, background: sessionVariant === "extended" ? C.amber : "transparent", borderColor:C.amber+"35", fontWeight: sessionVariant === "extended" ? 600 : 400 }}>{sessionVariant === "extended" ? "Ã¢Å“â€œ Extended (+15 min)" : "Extend session (+15 min)"}</button>
        <button className="btn" onClick={async ()=>{
          if (tomorrowHasSession) { setShiftChoiceOpen(true); return; }
          const undo = await shiftTodayWorkout({ daysForward: 1, mode: "replace" });
          setShiftUndo({ ...undo, expiresAt: Date.now() + 60000 });
        }} style={{ fontSize:"0.5rem", color:C.blue, borderColor:C.blue+"30" }}>Move to tomorrow</button>
        <button className="btn" onClick={()=>setSessionVariant("standard")} style={{ fontSize:"0.5rem", color:"#64748b", borderColor:"#334155", opacity: sessionVariant === "standard" ? 0.35 : 1 }} disabled={sessionVariant === "standard"}>Reset to default</button>
      </div>
      {sessionVariant !== "standard" && (
        <div style={{ marginTop:"-0.4rem", marginBottom:"0.65rem", fontSize:"0.5rem", color: sessionVariant === "short" ? C.green : C.amber, paddingLeft:"0.15rem" }}>
          Session modified: {sessionVariant === "short" ? "shortened to ~20 min" : "extended by ~15 min"}. Tap card above to see updated plan.
        </div>
      )}
      {shiftChoiceOpen && (
        <div className="card card-soft" style={{ marginTop:"-0.3rem", marginBottom:"0.65rem", borderColor:"#314560", display:"grid", gap:"0.35rem" }}>
          <div style={{ fontSize:"0.54rem", color:"#cbd5e1" }}>Tomorrow already has a session. How should this move work?</div>
          <div style={{ display:"flex", gap:"0.35rem", flexWrap:"wrap" }}>
            <button className="btn" onClick={async ()=>{
              const undo = await shiftTodayWorkout({ daysForward: 1, mode: "replace" });
              setShiftUndo({ ...undo, expiresAt: Date.now() + 60000 });
              setShiftChoiceOpen(false);
            }} style={{ fontSize:"0.52rem", color:C.blue, borderColor:C.blue+"35" }}>Replace tomorrow session</button>
            <button className="btn" onClick={async ()=>{
              const undo = await shiftTodayWorkout({ daysForward: 1, mode: "add_second" });
              setShiftUndo({ ...undo, expiresAt: Date.now() + 60000 });
              setShiftChoiceOpen(false);
            }} style={{ fontSize:"0.52rem", color:C.green, borderColor:C.green+"35" }}>Add as second session</button>
            <button className="btn" onClick={()=>setShiftChoiceOpen(false)} style={{ fontSize:"0.52rem" }}>Cancel</button>
          </div>
        </div>
      )}
      {shiftUndo && (
        <div className="card card-soft" style={{ marginTop:"-0.3rem", marginBottom:"0.65rem", borderColor:C.amber+"35", display:"flex", justifyContent:"space-between", gap:"0.4rem", alignItems:"center" }}>
          <div style={{ fontSize:"0.54rem", color:"#dbe7f6" }}>Session moved. Undo available for 60s.</div>
          <button className="btn" onClick={async ()=>{ await restoreShiftTodayWorkout(shiftUndo); setShiftUndo(null); }} style={{ fontSize:"0.52rem", color:C.amber, borderColor:C.amber+"35" }}>Undo</button>
        </div>
      )}

      {/* Proactive nudge */}
      {primaryTrigger && (
        <div style={{ marginBottom:"0.65rem", display:"grid", gap:"0.3rem" }}>
          <div style={{ fontSize:"0.54rem", color:"#94a3b8", lineHeight:1.55 }}>{primaryTrigger.msg}</div>
          <div style={{ display:"flex", gap:"0.35rem", alignItems:"center" }}>
            <button
              className="btn"
              onClick={() => isTravelModeSuggestion ? toggleTravelModeForToday() : onApplyTrigger(primaryTrigger)}
              style={{ fontSize:"0.52rem", color:C.green, borderColor:C.green+"30" }}
            >
              {isTravelModeSuggestion ? (isTodayTravelOverride ? "Exit travel mode" : "Switch travel mode") : (primaryTrigger.actionLabel || "Apply")}
            </button>
            <button className="btn" onClick={()=>onDismissTrigger(primaryTrigger.id)} style={{ fontSize:"0.52rem" }}>Dismiss</button>
          </div>
        </div>
      )}

      {/* Injury panel (shown when injury badge tapped) */}
      {showInjuryPanel && (
        <div className="card card-soft" style={{ marginBottom:"0.75rem" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.35rem" }}>
            <div className="sect-title" style={{ color:C.amber }}>INJURY STATUS</div>
            <button onClick={()=>setShowInjuryPanel(false)} style={{ background:"none", border:"none", color:"#64748b", cursor:"pointer", fontSize:"0.7rem" }}>Ãƒâ€”</button>
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
          <div style={{ marginTop:"0.35rem", fontSize:"0.54rem", color:"#64748b" }}>{injuryLevel.replaceAll("_"," ")} Ã‚Â· {injuryRule.why}</div>
        </div>
      )}

      <div className="card card-soft" style={{ marginBottom:"0.75rem", borderColor:C.green+"25", background:"#0d1410" }}>
        <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", gap:"0.5rem", marginBottom:"0.45rem" }}>
          <div className="sect-title" style={{ color:C.green, marginBottom:0 }}>LOG TODAY</div>
          <div style={{ fontSize:"0.49rem", color:"#64748b", letterSpacing:"0.08em" }}>compact check-in</div>
        </div>
        {garminConnected && garminReadinessScore !== null && (
          <div style={{ fontSize:"0.53rem", color:"#8fa5c8", marginBottom:"0.35rem" }}>
            Garmin readiness {garminReadinessScore}/100 is primary today. Sliders are optional confirmation.
          </div>
        )}
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
            <button className="btn btn-primary" disabled={checkin.status === "not_logged" || checkinSaving} onClick={async ()=>{
              if (checkin.status === "not_logged" || checkinSaving) return;
              setCheckinSaving(true);
              setCheckinAck("");
              try {
                setTodayDataError("");
                const parsed = parseMicroCheckin(checkin.note || "");
                const basePayload = parsed ? { ...checkin, ...parsed } : { ...checkin };
                const readinessUpdate = deriveReadinessAdjustedCheckin(basePayload);
                const strengthPerformance = hasStrength
                  ? Object.values(strengthInputs || {})
                      .map((row) => ({
                        ...row,
                        weightUsed: row?.bodyweightOnly || row?.bandTension ? null : toFiniteNumber(row?.weightUsed ?? row?.actualWeight, null),
                        actualWeight: row?.bodyweightOnly || row?.bandTension ? null : toFiniteNumber(row?.actualWeight ?? row?.weightUsed, null),
                        repsCompleted: Number(row?.repsCompleted || row?.actualReps || 0),
                        actualReps: Number(row?.actualReps || row?.repsCompleted || 0),
                        actualSets: Number(row?.actualSets || row?.prescribedSets || 0),
                        prescribedWeight: row?.bodyweightOnly || row?.bandTension ? null : toFiniteNumber(row?.prescribedWeight ?? row?.weightUsed, null),
                      }))
                      .filter((row) => row.exercise && Number(row.actualReps || 0) > 0 && Number(row.actualSets || 0) > 0 && (row.bodyweightOnly || row.bandTension || row.actualWeight !== null))
                      .map((row) => {
                        const denominator = Math.max(1, Number(row.prescribedSets || 1) * Number(row.prescribedReps || 1));
                        return {
                          ...row,
                          completionRatio: Number((((Number(row.actualReps || 0) * Number(row.actualSets || 0)) / denominator)).toFixed(2)),
                          sessionFeelScore: mapSessionFeelToScore(basePayload?.sessionFeel || "about_right"),
                          feelThisSession: mapSessionFeelToScore(basePayload?.sessionFeel || "about_right"),
                        };
                      })
                  : [];
                const payload = {
                  ...basePayload,
                  ...(readinessUpdate.adjusted || {}),
                  readiness: readinessUpdate.readiness || basePayload.readiness || DEFAULT_DAILY_CHECKIN.readiness,
                  strengthPerformance,
                };
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
              } catch (e) {
                setCheckinAck("");
                setTodayDataError("Save did not finish. Try again. If it still fails, refresh once and retry; your local data stays available.");
              } finally {
                setCheckinSaving(false);
              }
            }} style={{ fontSize:"0.55rem", opacity: (checkin.status === "not_logged" || checkinSaving) ? 0.4 : 1 }}>{checkinSaving ? "SAVING..." : "SAVE"}</button>
          </div>
          {checkinAck && <div role="status" style={{ fontSize:"0.54rem", color:C.green }}>{checkinAck}</div>}
          {hasStrength && (
            <div style={{ display:"grid", gap:"0.3rem", marginTop:"0.2rem", borderTop:"1px solid #1e293b", paddingTop:"0.35rem" }}>
              <div style={{ fontSize:"0.52rem", color:"#8fa5c8" }}>Strength performance (for automatic load adjustment)</div>
              {strExercises.slice(0, 6).map((ex) => {
                const key = normalizeExerciseKey(ex?.ex || "");
                const row = strengthInputs?.[key] || {};
                const mode = row?.mode || inferExerciseMode(ex?.ex || "");
                return (
                  <div key={key} style={{ display:"grid", gridTemplateColumns:"1fr 78px 62px 74px", gap:"0.3rem", alignItems:"center" }}>
                    <div style={{ fontSize:"0.5rem", color:"#cbd5e1", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{ex.ex}</div>
                    {mode === "band" ? (
                      <select value={row.bandTension || ""} onChange={e=>setStrengthInputs(prev => ({ ...prev, [key]: { ...prev[key], bandTension: e.target.value } }))}>
                        <option value="">Band</option>
                        {BAND_TENSION_LEVELS.map((level) => <option key={level} value={level}>{level}</option>)}
                      </select>
                    ) : mode === "bodyweight" ? (
                      <div style={{ fontSize:"0.5rem", color:"#8fa5c8", textAlign:"center" }}>BW</div>
                    ) : (
                      <input type="number" step="2.5" placeholder="lb" value={row.weightUsed || ""} onChange={e=>setStrengthInputs(prev => ({ ...prev, [key]: { ...prev[key], weightUsed: e.target.value, actualWeight: e.target.value } }))} />
                    )}
                    <input type="number" placeholder="sets" value={row.actualSets || ""} onChange={e=>setStrengthInputs(prev => ({ ...prev, [key]: { ...prev[key], actualSets: e.target.value } }))} />
                    <input type="number" placeholder="reps" value={row.repsCompleted || ""} onChange={e=>setStrengthInputs(prev => ({ ...prev, [key]: { ...prev[key], repsCompleted: e.target.value, actualReps: e.target.value } }))} />
                  </div>
                );
              })}
            </div>
          )}
          {todayDataError && <div role="alert" style={{ fontSize:"0.54rem", color:C.amber }}>{todayDataError}</div>}
          {postSaveInsight && <div style={{ fontSize:"0.54rem", color:C.amber, whiteSpace:"pre-wrap", lineHeight:1.6 }}>{postSaveInsight}</div>}
        </div>
      </div>

      {/* Ã¢â€â‚¬Ã¢â€â‚¬ CONTEXT Ã¢â€â‚¬Ã¢â€â‚¬ */}
      <div style={{ display:"none" }}>CONTEXT</div>

      {/* Coach adjustments */}
      {false && primaryAdjustment && (
        <div style={{ marginBottom:"0.65rem", padding:"0.15rem 0.05rem 0.1rem 0.15rem" }}>
          <div style={{ display:"grid", gap:"0.25rem" }}>
            <div style={{ display:"grid", gridTemplateColumns:"1fr auto", alignItems:"center", gap:"0.35rem" }}>
              <button
                className="btn"
                onClick={() => openAdjustmentDetail(primaryAdjustment)}
                style={{ border:"none", background:"none", padding:0, fontSize:"0.56rem", color:"#cbd5e1", textAlign:"left", justifyContent:"flex-start" }}
              >
                <span style={{ color:"#dbe7f6" }}>{primaryAdjustment.icon} {primaryAdjustment.summary}</span>
              </button>
              <button
                className="btn"
                onClick={() => dismissAdjustment(primaryAdjustment.id)}
                style={{ border:"none", background:"none", padding:0, fontSize:"0.62rem", color:"#64748b", minWidth:18 }}
                aria-label="Dismiss coach adjustment notification"
              >
                Ãƒâ€”
              </button>
            </div>
            {primaryAdjustment.reason && (
              <div style={{ fontSize:"0.5rem", color:"#7f92aa", lineHeight:1.5, paddingLeft:"0.15rem" }}>
                Why: {primaryAdjustment.reason}
              </div>
            )}
            {secondaryAdjustments.length > 0 && (
              <button
                className="btn"
                onClick={() => setShowMoreAdjustments(v => !v)}
                style={{ border:"none", background:"none", padding:0, fontSize:"0.52rem", color:"#8fa5c8", justifyContent:"flex-start" }}
              >
                {showMoreAdjustments ? "Hide extra adjustments" : `+ ${secondaryAdjustments.length} more adjustments`}
              </button>
            )}
            {showMoreAdjustments && secondaryAdjustments.map((card) => (
              <div key={card.id} style={{ display:"grid", gap:"0.2rem", paddingLeft:"0.15rem" }}>
                <div style={{ display:"grid", gridTemplateColumns:"1fr auto", alignItems:"center", gap:"0.35rem" }}>
                  <button
                    className="btn"
                    onClick={() => openAdjustmentDetail(card)}
                    style={{ border:"none", background:"none", padding:0, fontSize:"0.54rem", color:"#9fb2d2", textAlign:"left", justifyContent:"flex-start" }}
                  >
                    {card.icon} {card.summary}
                  </button>
                  <button
                    className="btn"
                    onClick={() => dismissAdjustment(card.id)}
                    style={{ border:"none", background:"none", padding:0, fontSize:"0.6rem", color:"#64748b" }}
                    aria-label="Dismiss coach adjustment notification"
                  >
                    Ãƒâ€”
                  </button>
                </div>
                {card.reason && (
                  <div style={{ fontSize:"0.48rem", color:"#7f92aa", lineHeight:1.5 }}>
                    Why: {card.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Coach context */}
      {false && contextLines.length > 0 && (
        <div style={{ marginBottom:"0.65rem", padding:"0.55rem 0.7rem", background:"#0d1117", borderRadius:8, display:"grid", gap:"0.25rem" }}>
          {contextLines.map((line, i) => (
            <div key={i} style={{ fontSize:"0.54rem", color: i === 0 ? C.amber : i === 1 ? C.green : C.blue }}>{line}</div>
          ))}
        </div>
      )}

      {/* Tomorrow preview */}
      <div style={{ display:"none" }}>
        Tomorrow: {tomorrowWorkout?.label || "Rest"}{tomorrowWorkout?.run ? ` Ã¢â‚¬â€ ${tomorrowWorkout.run.d}` : ""}
      </div>

      {activeCoachAdjustment && (
        <div onClick={()=>setActiveCoachAdjustment(null)} style={{ position:"fixed", inset:0, background:"rgba(0,0,0,0.45)", display:"flex", alignItems:"flex-end", zIndex:52 }}>
          <div onClick={e=>e.stopPropagation()} className="card card-strong" style={{ width:"100%", borderRadius:"14px 14px 0 0", padding:"0.95rem 0.95rem 1.05rem", maxHeight:"78vh", overflowY:"auto" }}>
            <div className="sect-title" style={{ color:C.blue, marginBottom:"0.28rem" }}>Coach adjustment</div>
            <div style={{ fontSize:"0.58rem", color:"#e2e8f0", marginBottom:"0.38rem" }}>{activeCoachAdjustment.icon} {activeCoachAdjustment.summary}</div>
            <div style={{ fontSize:"0.56rem", color:"#cbd5e1", lineHeight:1.7 }}>
              {coachAdjustmentLoading ? "Loading coach reasoning..." : (coachAdjustmentDetail || "This adjustment keeps training load targeted for today.")}
            </div>
            <button className="btn" onClick={()=>setActiveCoachAdjustment(null)} style={{ marginTop:"0.65rem", fontSize:"0.52rem" }}>Close</button>
          </div>
        </div>
      )}

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
        <InlineGlyph name={icon || "easy_run"} color={color} size={14} />
        <span>{title}</span>
      </div>
      <div style={{ display:"flex", gap:"1.25rem", flexWrap:"wrap" }}>
        {(items ?? []).map(item => (
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
              {(routine ?? []).map((step, idx) => (
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

// Ã¢â€â‚¬Ã¢â€â‚¬ PLAN TAB Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
class ProgramTabErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, nonce: 0 };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error) {
    try { console.error("[program-tab] render crash", error); } catch {}
  }
  retry = () => this.setState((s) => ({ hasError: false, nonce: s.nonce + 1 }));
  render() {
    if (this.state.hasError) {
      return <div className="card card-soft" onClick={this.retry} style={{ cursor:"pointer", fontSize:"0.58rem", color:"#cbd5e1" }}>Program unavailable. Tap to retry.</div>;
    }
    return <div key={this.state.nonce}>{this.props.children}</div>;
  }
}

function PlanTab({ planDay = null, currentPlanWeek = null, currentWeek, logs, bodyweights, personalization, athleteProfile = null, setGoals, momentum, strengthLayer, weeklyReview, expectations, memoryInsights, recalibration, patterns, getZones, weekNotes, paceOverrides, setPaceOverrides, learningLayer, salvageLayer, failureMode, planComposer, rollingHorizon, horizonAnchor, weeklyCheckins, saveWeeklyCheckin, environmentSelection, setEnvironmentMode, saveEnvironmentSchedule, deviceSyncAudit, todayWorkout: legacyTodayWorkout }) {
  const todayWorkout = planDay?.resolved?.training || legacyTodayWorkout;
  const goals = athleteProfile?.goals || [];
  const goalBuckets = athleteProfile?.goalBuckets || {};
  const activeTimeBoundGoal = athleteProfile?.activeTimeBoundGoal || null;
  const goalState = athleteProfile?.goalState || {};
  const planDayWeek = planDay?.week || null;
  const [openWeek, setOpenWeek] = useState(currentWeek);
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
  const safeRollingHorizon = Array.isArray(rollingHorizon) ? rollingHorizon : [];
  const displayHorizon = useMemo(() => resolveProgramDisplayHorizon({
    rollingHorizon,
    currentWeek,
    currentPlanWeek: currentPlanWeek || planDayWeek?.planWeek || null,
    weekTemplates: WEEKS,
    goals,
    planComposer,
    momentum,
    learningLayer,
    weeklyCheckins,
    failureMode,
    environmentSelection,
    previewLength: 4,
  }), [rollingHorizon, currentWeek, currentPlanWeek, planDayWeek, goals, planComposer, momentum, learningLayer, weeklyCheckins, failureMode, environmentSelection]);
  /* legacy fallback moved to plan-week-service
  const fallbackProgramWeeks = useMemo(() => {
    return Array.from({ length: 4 }).map((_, idx) => {
      const absoluteWeek = currentWeek + idx;
      const template = WEEKS[Math.max(0, Math.min(absoluteWeek - 1, WEEKS.length - 1))] || WEEKS[0];
      const planWeek = buildPlanWeek({
        weekNumber: absoluteWeek,
        template,
        referenceTemplate: fallbackReferenceTemplate,
        label: `${template?.phase || "BASE"} Ã‚Â· Week ${absoluteWeek}`,
        specificity: idx <= 1 ? "high" : idx <= 5 ? "medium" : "directional",
        kind: "plan",
        goals,
        architecture: planComposer?.architecture || "hybrid_performance",
        blockIntent: planComposer?.blockIntent || null,
        split: planComposer?.split || null,
        sessionsByDay: planComposer?.dayTemplates || null,
        momentum,
        learningLayer,
        weeklyCheckin: weeklyCheckins?.[String(absoluteWeek)] || {},
        failureMode: absoluteWeek === currentWeek ? failureMode : {},
        environmentSelection: absoluteWeek === currentWeek ? environmentSelection : null,
        constraints: planComposer?.constraints || [],
      });
      return {
        kind: "plan",
        slot: idx + 1,
        absoluteWeek,
        planWeek,
        template,
        weekLabel: planWeek?.label || `${template?.phase || "BASE"} Ã‚Â· Week ${absoluteWeek}`,
      };
    });
  }, [currentPlanWeek, currentWeek, fallbackReferenceTemplate, goals, planComposer, momentum, learningLayer, weeklyCheckins, failureMode, environmentSelection]);
  */
  const currentWeekModel = currentPlanWeek || planDayWeek?.planWeek || (displayHorizon || []).find((h) => h?.absoluteWeek === currentWeek)?.planWeek || null;
  const runningGoalActive = Boolean(
    activeTimeBoundGoal?.category === "running" ||
    (goals || []).some((goal) => goal?.active && goal?.category === "running")
  );
  const availableProgramWeeks = useMemo(
    () => (displayHorizon || []).map((h) => h?.absoluteWeek).filter((week) => Number.isFinite(week)),
    [displayHorizon]
  );
  useEffect(() => {
    if (!availableProgramWeeks.length) {
      setOpenWeek(null);
      return;
    }
    setOpenWeek((prev) => (availableProgramWeeks.includes(prev) ? prev : availableProgramWeeks[0]));
  }, [availableProgramWeeks]);
  const adjustedWeekMap = {};
  if (runningGoalActive) {
    (displayHorizon || []).forEach((h) => {
      const hasCanonicalSessions = Object.values(h?.planWeek?.sessionsByDay || {}).some(Boolean);
      if (hasCanonicalSessions) return;
      const w = h?.template;
      if (h?.slot >= 1 && w?.mon && w?.thu && w?.fri && w?.sat) {
        const baseAdaptive = buildAdaptiveWeek(w, signals, personalization, memoryInsights);
        adjustedWeekMap[h.absoluteWeek] = baseAdaptive;
      }
    });
  }
  const dayLabels = { 1: "Mon", 2: "Tue", 3: "Wed", 4: "Thu", 5: "Fri", 6: "Sat", 0: "Sun" };
  const dayOrder = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
  const liveTodaySession = (() => {
    if (!todayWorkout) return null;
    const dayLabel = dayLabels[new Date().getDay()] || "Sun";
    const title = todayWorkout?.label || String(todayWorkout?.type || "Session").replaceAll("-", " ");
    const detail = todayWorkout?.run?.d || todayWorkout?.strengthDuration || todayWorkout?.success || todayWorkout?.fallback || "Adjusted session";
    const icon = todayWorkout?.run ? (RUN_TYPE_ICON[todayWorkout?.run?.t] || RUN_TYPE_ICON[todayWorkout?.type] || "easy_run") : null;
    return { day: dayLabel, title, detail, icon, live: true };
  })();
  const overlayLiveTodaySession = (sessions = [], absoluteWeek) => {
    if (!liveTodaySession || absoluteWeek !== currentWeek) return sessions;
    const next = [...sessions];
    const existingIndex = next.findIndex((session) => session.day === liveTodaySession.day);
    if (existingIndex >= 0) next[existingIndex] = { ...next[existingIndex], ...liveTodaySession };
    else if (todayWorkout?.type !== "rest") next.push(liveTodaySession);
    return next.sort((a, b) => (dayOrder[a?.day] || 99) - (dayOrder[b?.day] || 99));
  };
  const mapSessionsByDayToProgramWeekSessions = (sessionsByDay = {}) => ([1, 2, 3, 4, 5, 6, 0]
    .map((dayKey) => {
      const session = sessionsByDay?.[dayKey];
      if (!session || session.type === "rest") return null;
      return {
        day: dayLabels[dayKey],
        title: session?.label || String(session?.type || "Session").replaceAll("-", " "),
        detail: session?.run?.d || session?.strengthDose || session?.strengthDuration || session?.success || session?.nutri || "Planned session",
        icon: session?.run ? (RUN_TYPE_ICON[session?.run?.t] || RUN_TYPE_ICON[session?.type] || "easy_run") : null,
      };
    })
    .filter(Boolean));
  const getProgramWeekSessions = (absoluteWeek, weekRow = null) => {
    const planWeekForRow = weekRow?.planWeek || (absoluteWeek === currentWeek ? currentWeekModel : null);
    const planWeekSessions = mapSessionsByDayToProgramWeekSessions(planWeekForRow?.sessionsByDay || {});
    if (planWeekSessions.length > 0) {
      return overlayLiveTodaySession(planWeekSessions, absoluteWeek);
    }
    if (runningGoalActive) {
      const adaptive = adjustedWeekMap[absoluteWeek] || { adjusted: weekRow?.template || {}, changed: [] };
      const adjusted = adaptive?.adjusted || {};
      return overlayLiveTodaySession([
        { day: "Mon", title: adjusted?.mon?.t || "Easy", detail: adjusted?.mon?.d || "30 min", icon: RUN_TYPE_ICON[adjusted?.mon?.t] || "easy_run" },
        { day: "Thu", title: adjusted?.thu?.t || "Steady", detail: adjusted?.thu?.d || "30 min", icon: RUN_TYPE_ICON[adjusted?.thu?.t] || "easy_run" },
        { day: "Fri", title: adjusted?.fri?.t || "Easy", detail: adjusted?.fri?.d || "30 min", icon: RUN_TYPE_ICON[adjusted?.fri?.t] || "easy_run" },
        { day: "Sat", title: adjusted?.sat?.t || "Long", detail: adjusted?.sat?.d || "40 min", icon: RUN_TYPE_ICON[adjusted?.sat?.t] || "long_run" },
      ], absoluteWeek);
    }
    const dayTemplates = planComposer?.dayTemplates || {};
    return overlayLiveTodaySession(mapSessionsByDayToProgramWeekSessions(dayTemplates), absoluteWeek);
  };
  const phaseNarrative = buildNamedPhaseArc({ rollingHorizon: displayHorizon, goals });
  const primaryCategory = goals.find(g => g.active)?.category || "running";
  const phaseLabels = PHASE_ARC_LABELS[primaryCategory] || PHASE_ARC_LABELS.running;
  const currentTemplate = currentWeekModel?.template || (displayHorizon || []).find(h => h.absoluteWeek === currentWeek)?.template || {};
  const currentPhase = planDayWeek?.phase || currentWeekModel?.phase || currentTemplate.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
  const currentWeeklyIntent = planDayWeek?.weeklyIntent || currentWeekModel?.weeklyIntent || (currentWeekModel ? {
    focus: currentWeekModel.focus,
    aggressionLevel: currentWeekModel.aggressionLevel,
    recoveryBias: currentWeekModel.recoveryBias,
    volumePct: currentWeekModel?.weeklyIntent?.volumePct,
    nutritionEmphasis: currentWeekModel.nutritionEmphasis,
  } : null);
  const currentPhaseMeta = phaseLabels[currentPhase] || { name: currentPhase, objective: "Execute core plan priorities." };
  const nextPhaseBlock = phaseNarrative.find(b => b.startWeek > currentWeek);
  const dayOfWeek = new Date().getDay();
  const daysLeftInWeek = dayOfWeek === 0 ? 0 : 7 - dayOfWeek;
  const daysToShift = nextPhaseBlock ? Math.max(1, ((nextPhaseBlock.startWeek - currentWeek - 1) * 7) + daysLeftInWeek) : null;
  const phaseShortMeaning = currentWeeklyIntent?.focus || (primaryCategory === "body_comp"
    ? "Deficit week"
    : primaryCategory === "strength"
    ? "Strength progression"
    : "Endurance progression");
  const phaseBanner = `${String(currentPhaseMeta?.name || currentPhase).replace(" Phase", "")} Ã‚Â· ${phaseShortMeaning} Ã‚Â· ${daysToShift ? `transitions in ${daysToShift} days.` : "current block active."}`;
  const strengthProgress = deriveStrengthProgressTracker({ logs, goals, strengthLayer });
  const strengthGoalTracking = personalization?.strengthProgression?.tracking || {};
  const displayedStrengthProgress = useMemo(() => {
    const base = Array.isArray(strengthProgress) ? strengthProgress : [];
    const seen = new Set(base.map((lift) => lift.key));
    const extras = Object.entries(strengthGoalTracking || {})
      .filter(([key, tracked]) => tracked?.goalWeight && !seen.has(key))
      .map(([key, tracked]) => ({
        key,
        label: tracked?.exercise || key,
        current: tracked?.currentWorkingWeight || null,
        goal: tracked?.goalWeight || null,
        projected: tracked?.projectedDateToGoal || "TBD",
        sessions: [],
      }));
    return [...base, ...extras];
  }, [strengthProgress, strengthGoalTracking]);
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
  const hasWeeklyCheckinInput = Boolean(weeklyCheckins?.[String(currentWeek)]?.ts);
  const showingLiveTodayInProgram = Boolean(todayWorkout?.label && availableProgramWeeks.includes(currentWeek));
  const programProvenance = buildProvenanceText({
    inputs: [
      "your active goals",
      "recent completion trend",
      environmentSelection?.mode ? `your ${String(environmentSelection.mode || "training").toLowerCase()} environment` : "your training environment",
      hasWeeklyCheckinInput ? "this week's check-in" : null,
      currentWeeklyIntent?.focus ? "this week's explicit intent" : null,
      showingLiveTodayInProgram ? "today's live adjustment" : null,
    ],
    limitation: hasWeeklyCheckinInput ? "" : "Weekly check-in input is limited.",
  });
  const programTrust = buildTrustSummary({
    explicitUserInput: hasWeeklyCheckinInput,
    loggedActuals: Boolean(Object.keys(logs || {}).length),
    deviceData: Boolean((deviceSyncAudit?.utilization || []).some((line) => !/none|unavailable/i.test(String(line || "")))),
    inferredHeuristics: true,
    limitation: hasWeeklyCheckinInput ? "" : "Weekly check-in input is limited.",
    stale: Boolean(deviceSyncAudit?.readiness <= 0 && deviceSyncAudit?.garminRecentCount === 0 && deviceSyncAudit?.appleRecentCount === 0),
  });
  const programTrustTone = buildReviewBadgeTone(
    programTrust.level === "grounded" ? "match" : programTrust.level === "partial" ? "changed" : "recovery"
  );
  const plannedSessionsThisWeek = getProgramWeekSessions(currentWeek, (displayHorizon || []).find((h) => h?.absoluteWeek === currentWeek) || null).length;
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
    try {
      return { start: start.toISOString().split("T")[0], end: end.toISOString().split("T")[0] };
    } catch {
      return { start: "", end: "" };
    }
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
    const vals = (weekEntries(0) ?? []).map(([, l]) => Number(l?.feel)).filter((n) => Number.isFinite(n) && n > 0);
    return vals.length ? (vals.reduce((a, b) => a + b, 0) / vals.length) : 3;
  })();
  const completionRateLast3weeks = (() => {
    const rates = ([-1, -2, -3] ?? []).map((offset) => {
      const entries = weekEntries(offset);
      if (!entries.length) return 0;
      const completed = completedCountForEntries(entries);
      const planned = Math.max(1, plannedSessionsThisWeek);
      return Math.min(1, completed / planned);
    });
    return rates.reduce((a, b) => a + b, 0) / rates.length;
  })();
  const completionRateLast4weeks = (() => {
    const rates = ([-1, -2, -3, -4] ?? []).map((offset) => {
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
  const currentWeekRow = (displayHorizon || []).find((h) => h?.absoluteWeek === currentWeek) || null;
  const currentWeekSessions = getProgramWeekSessions(currentWeek, currentWeekRow);
  const futureWeekRows = (displayHorizon || []).filter((h) => Number(h?.absoluteWeek || 0) > currentWeek);
  const activeGoalsList = (goals || []).filter((goal) => goal?.active);
  const currentWeekLabel = currentWeekRow?.weekLabel || currentWeekModel?.label || `Week ${currentWeek}`;
  const blockSummaryLine = currentWeekModel?.summary || planComposer?.blockIntent?.narrative || arbitration.allocationNarrative;
  const hierarchyIntentBits = [
    currentWeeklyIntent?.aggressionLevel ? String(currentWeeklyIntent.aggressionLevel).replaceAll("_", " ") : null,
    currentWeeklyIntent?.recoveryBias ? `recovery ${String(currentWeeklyIntent.recoveryBias).replaceAll("_", " ")}` : null,
    currentWeeklyIntent?.volumePct ? `volume ${currentWeeklyIntent.volumePct}%` : null,
    currentWeeklyIntent?.nutritionEmphasis || null,
  ].filter(Boolean);

  return (
    <div className="fi">
      <div style={{ display:"grid", gap:"0.85rem" }}>
        <section className="card card-strong card-hero" style={{ borderColor:C.blue+"30" }}>
          <div style={{ fontSize:"0.5rem", color:"#64748b", letterSpacing:"0.14em", marginBottom:"0.35rem" }}>PLAN HIERARCHY</div>
          <div style={{ display:"grid", gap:"0.8rem" }}>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.6rem" }}>
              <div style={{ border:"1px solid #20314a", borderRadius:12, background:"#0f172a", padding:"0.75rem 0.8rem" }}>
                <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.12em", marginBottom:"0.25rem" }}>ACTIVE GOALS</div>
                <div style={{ display:"grid", gap:"0.22rem" }}>
                  {activeGoalsList.length > 0 ? activeGoalsList.map((goal) => (
                    <div key={goal.id || goal.name} style={{ fontSize:"0.58rem", color:"#e2e8f0", lineHeight:1.45 }}>{goal.name}</div>
                  )) : (
                    <div style={{ fontSize:"0.56rem", color:"#94a3b8" }}>No active goals configured.</div>
                  )}
                </div>
              </div>
              <div style={{ border:"1px solid #20314a", borderRadius:12, background:"#0f172a", padding:"0.75rem 0.8rem" }}>
                <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.12em", marginBottom:"0.25rem" }}>CURRENT BLOCK</div>
                <div style={{ fontSize:"0.72rem", color:C.blue, fontWeight:600, lineHeight:1.2 }}>{currentPhaseMeta.name}</div>
                <div style={{ fontSize:"0.55rem", color:"#cbd5e1", marginTop:"0.18rem", lineHeight:1.55 }}>{currentPhaseMeta.objective}</div>
                <div style={{ fontSize:"0.52rem", color:"#8fa5c8", marginTop:"0.24rem" }}>{daysToShift ? `Transition expected in about ${daysToShift} days.` : "Current block remains active in the visible horizon."}</div>
              </div>
              <div style={{ border:"1px solid #20314a", borderRadius:12, background:"#0f172a", padding:"0.75rem 0.8rem" }}>
                <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.12em", marginBottom:"0.25rem" }}>CURRENT WEEKLY INTENT</div>
                <div style={{ fontSize:"0.64rem", color:"#e2e8f0", lineHeight:1.45 }}>{currentWeeklyIntent?.focus || currentWeekLabel}</div>
                {!!hierarchyIntentBits.length && <div style={{ fontSize:"0.52rem", color:"#8fa5c8", marginTop:"0.18rem", lineHeight:1.5 }}>{hierarchyIntentBits.join(" - ")}</div>}
                {currentWeekModel?.adjusted && <div style={{ fontSize:"0.5rem", color:C.green, marginTop:"0.22rem" }}>Current week has active plan adjustments.</div>}
              </div>
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"1.15fr 0.85fr", gap:"0.7rem" }}>
              <div style={{ border:"1px solid #20314a", borderRadius:12, background:"#0f172a", padding:"0.75rem 0.8rem" }}>
                <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.12em", marginBottom:"0.24rem" }}>PLAN SUMMARY</div>
                <div style={{ fontSize:"0.58rem", color:"#dbe7f6", lineHeight:1.65 }}>{blockSummaryLine}</div>
                <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.55, marginTop:"0.28rem" }}>{programProvenance}</div>
              </div>
              <div style={{ border:"1px solid #20314a", borderRadius:12, background:"#0f172a", padding:"0.75rem 0.8rem" }}>
                <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.12em", marginBottom:"0.24rem" }}>GOAL ALLOCATION</div>
                <div style={{ fontSize:"0.56rem", color:"#dbe7f6", lineHeight:1.55 }}>Prioritized: {planComposer?.blockIntent?.prioritized || arbitration.goalAllocation.primary}</div>
                <div style={{ fontSize:"0.54rem", color:"#94a3b8", marginTop:"0.16rem", lineHeight:1.5 }}>Maintained: {(planComposer?.blockIntent?.maintained || arbitration.goalAllocation.maintained || []).join(" - ") || "None"}</div>
                <div style={{ fontSize:"0.54rem", color:C.amber, marginTop:"0.16rem", lineHeight:1.5 }}>Minimized: {planComposer?.blockIntent?.minimized || arbitration.goalAllocation.minimized || "None"}</div>
                <div style={{ fontSize:"0.52rem", color:"#8fa5c8", marginTop:"0.22rem", lineHeight:1.5 }}>Tradeoff: {arbitration.coachTradeoffLine || arbitration.conflicts?.[0] || strengthLayer.tradeoff}</div>
              </div>
            </div>
            <button className="btn" onClick={()=>setPhaseExpanded(v=>!v)} style={{ width:"100%", justifyContent:"space-between", fontSize:"0.55rem", color:"#dbe7f6", borderColor:"#2b3f5e", background:"rgba(9,16,30,0.45)" }}>
              <span>{phaseBanner}</span>
              <span>{phaseExpanded ? "Hide" : "View block arc"}</span>
            </button>
            {phaseExpanded && (
              <div style={{ display:"grid", gap:"0.28rem", border:"1px solid #243752", borderRadius:12, padding:"0.7rem 0.8rem", background:"rgba(8,14,26,0.75)" }}>
                {((phaseNarrative ?? []).slice(0, 5)).map((block, idx) => (
                  <div key={`${block.phase}-${idx}`} style={{ display:"grid", gridTemplateColumns:"90px 1fr", gap:"0.45rem", alignItems:"start" }}>
                    <div className="mono" style={{ fontSize:"0.5rem", color:"#8fa5c8" }}>{`W${block.startWeek}-W${block.endWeek}`}</div>
                    <div>
                      <div style={{ fontSize:"0.58rem", color:"#e2e8f0" }}>{block.name}</div>
                      <div style={{ fontSize:"0.52rem", color:"#94a3b8", marginTop:"0.08rem" }}>{block.objective}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="card card-action" style={{ borderColor:C.green+"38", background:"#0d1510" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:"0.6rem", flexWrap:"wrap", marginBottom:"0.7rem" }}>
            <div>
              <div style={{ fontSize:"0.5rem", color:"#64748b", letterSpacing:"0.14em", marginBottom:"0.22rem" }}>CURRENT WEEK DETAIL</div>
              <div style={{ fontSize:"1rem", color:"#f8fafc", fontWeight:650 }}>{currentWeekLabel}</div>
              <div style={{ fontSize:"0.55rem", color:"#8fa5c8", marginTop:"0.12rem" }}>Current committed plan week. Today can still reflect live PlanDay adjustments.</div>
              <div style={{ fontSize:"0.5rem", color:"#94a3b8", marginTop:"0.16rem", lineHeight:1.5 }}>{programTrust.summary}</div>
            </div>
            <div style={{ display:"flex", gap:"0.28rem", flexWrap:"wrap", justifyContent:"flex-end" }}>
              <div style={{ fontSize:"0.5rem", color:C.green, background:C.green+"14", padding:"0.18rem 0.5rem", borderRadius:999, letterSpacing:"0.08em" }}>CURRENT</div>
              <div style={{ fontSize:"0.48rem", color:programTrustTone.color, background:programTrustTone.bg, padding:"0.18rem 0.5rem", borderRadius:999 }}>{programTrust.label}</div>
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1.1fr 0.9fr", gap:"0.8rem", marginBottom:"0.75rem" }}>
            <div style={{ display:"grid", gap:"0.45rem" }}>
              <div style={{ fontSize:"0.6rem", color:"#dbe7f6", lineHeight:1.55 }}>{currentWeeklyIntent?.focus || "Current week plan"}</div>
              <div style={{ fontSize:"0.54rem", color:"#94a3b8", lineHeight:1.55 }}>{weeklyCoachBrief}</div>
              <div style={{ fontSize:"0.53rem", color:"#8fa5c8", lineHeight:1.55 }}>{weeklyConsistencyAnchor}</div>
              {!!badWeekTriage && <div style={{ fontSize:"0.52rem", color:C.amber, lineHeight:1.55 }}>{badWeekTriage}</div>}
              {Array.isArray(currentWeekModel?.constraints) && currentWeekModel.constraints.length > 0 && (
                <div style={{ fontSize:"0.52rem", color:"#8fa5c8", lineHeight:1.55 }}>Constraints: {currentWeekModel.constraints.slice(0, 4).join(" - ")}</div>
              )}
            </div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(2,minmax(0,1fr))", gap:"0.45rem" }}>
              <div style={{ border:"1px solid #1f3026", borderRadius:10, background:"#0f172a", padding:"0.55rem 0.6rem" }}>
                <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>STATUS</div>
                <div style={{ fontSize:"0.6rem", color:"#e2e8f0", marginTop:"0.16rem" }}>{String(currentWeekModel?.status || "planned").replaceAll("_", " ")}</div>
              </div>
              <div style={{ border:"1px solid #1f3026", borderRadius:10, background:"#0f172a", padding:"0.55rem 0.6rem" }}>
                <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>COMPLETION</div>
                <div style={{ fontSize:"0.6rem", color:"#e2e8f0", marginTop:"0.16rem" }}>{sessionsCompletedThisWeek}/{Math.max(1, plannedSessionsThisWeek)}</div>
              </div>
              <div style={{ border:"1px solid #1f3026", borderRadius:10, background:"#0f172a", padding:"0.55rem 0.6rem" }}>
                <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>WEEK TYPE</div>
                <div style={{ fontSize:"0.6rem", color:"#e2e8f0", marginTop:"0.16rem" }}>{nextWeekType}</div>
              </div>
              <div style={{ border:"1px solid #1f3026", borderRadius:10, background:"#0f172a", padding:"0.55rem 0.6rem" }}>
                <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>PLAN MODE</div>
                <div style={{ fontSize:"0.6rem", color:"#e2e8f0", marginTop:"0.16rem" }}>{deviceSyncAudit?.planMode || "normal"}</div>
              </div>
            </div>
          </div>

          <div style={{ marginBottom:"0.7rem" }}>
            <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.14em", marginBottom:"0.32rem" }}>THIS WEEK PLAN</div>
            <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(150px,1fr))", gap:"0.45rem" }}>
              {(currentWeekSessions ?? []).map((session) => (
                <div key={`current_${session.day}_${session.title}`} style={{ border:"1px solid #1f3026", borderRadius:10, background:"#0f172a", padding:"0.55rem 0.6rem" }}>
                  <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>{session.day}</div>
                  <div style={{ fontSize:"0.6rem", color:"#e2e8f0", marginTop:"0.12rem", display:"flex", alignItems:"center", gap:"0.28rem" }}>
                    {session.icon && <InlineGlyph name={session.icon} color={C.green} size={12} />}
                    <span>{session.title}</span>
                  </div>
                  <div style={{ fontSize:"0.54rem", color:"#8fa5c8", marginTop:"0.12rem", lineHeight:1.5 }}>{session.detail || "Planned session"}</div>
                  {session.live && <div style={{ fontSize:"0.48rem", color:C.green, marginTop:"0.18rem" }}>Live PlanDay view</div>}
                </div>
              ))}
            </div>
          </div>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.7rem" }}>
            <div style={{ borderTop:"1px solid #1f3026", paddingTop:"0.6rem" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"0.35rem" }}>
                <div className="sect-title" style={{ color:C.green, marginBottom:0 }}>WEEK CHECK-IN</div>
                <div className={weeklyGoalHit ? "pulse-ring" : ""} style={{ width:38, height:38, borderRadius:999, display:"grid", placeItems:"center", background:`conic-gradient(${C.green} ${weeklyProgress * 3.6}deg, #25334a 0deg)`, padding:3 }}>
                  <div className="mono" style={{ width:"100%", height:"100%", borderRadius:999, display:"grid", placeItems:"center", background:"#0f172a", fontSize:"0.5rem", color:weeklyGoalHit ? C.green : "#94a3b8" }}>{weeklyProgress}%</div>
                </div>
              </div>
              <div style={{ display:"grid", gap:"0.32rem" }}>
                {([["energy", "Energy"], ["stress", "Stress"], ["confidence", "Confidence"]] ?? []).map(([k, label]) => (
                  <div key={k} style={{ display:"grid", gridTemplateColumns:"110px 1fr", alignItems:"center", gap:"0.45rem" }}>
                    <div style={{ fontSize:"0.53rem", color:"#94a3b8" }}>{label}</div>
                    <div style={{ display:"grid", gridTemplateColumns:"repeat(5,1fr)", gap:"0.22rem" }}>
                      {([1,2,3,4,5] ?? []).map((n) => (
                        <button key={n} className="btn" onClick={()=>setMiniWeekly(prev=>({ ...prev, [k]: n }))} style={{ fontSize:"0.5rem", padding:"3px 0", borderColor:Number(miniWeekly[k])===n ? C.green : "#1e293b", color:Number(miniWeekly[k])===n ? C.green : "#64748b" }}>{n}</button>
                      ))}
                    </div>
                  </div>
                ))}
                <button className="btn btn-primary" onClick={()=>saveWeeklyCheckin(currentWeek, miniWeekly)} style={{ width:"fit-content", fontSize:"0.54rem" }}>Save weekly check-in</button>
              </div>
            </div>

            <div style={{ borderTop:"1px solid #1f3026", paddingTop:"0.6rem", display:"grid", gap:"0.45rem" }}>
              <div className="sect-title" style={{ color:C.blue, marginBottom:0 }}>WEEK SETTINGS</div>
              <div style={{ display:"grid", gridTemplateColumns:"1fr auto auto", gap:"0.3rem", alignItems:"center" }}>
                <select value={environmentSelection?.mode || personalization?.environmentConfig?.defaultMode || "Home"} onChange={e=>setEnvironmentMode({ mode:e.target.value, scope: "week" })} style={{ fontSize:"0.55rem" }}>
                  {(["Home","Gym","Travel"] ?? []).map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <button className="btn" onClick={()=>setEnvironmentMode({ mode: environmentSelection?.mode || "Home", scope: "week" })} style={{ fontSize:"0.5rem" }}>This week</button>
                <button className="btn" onClick={()=>setEnvironmentMode({ mode: environmentSelection?.mode || "Home", scope: "base" })} style={{ fontSize:"0.5rem" }}>Default</button>
              </div>
              <div style={{ fontSize:"0.51rem", color:"#8fa5c8", lineHeight:1.55 }}>
                Device input: {(deviceSyncAudit?.utilization || ["No device signals available yet."]).slice(0, 2).join(" ")}
              </div>
              <div style={{ fontSize:"0.49rem", color:"#94a3b8", lineHeight:1.5 }}>
                Data use: {programTrust.sourceLine}
              </div>
              {scheduleEntries.length > 0 && (
                <div style={{ fontSize:"0.51rem", color:"#8fa5c8", lineHeight:1.55 }}>
                  Upcoming environment schedule: {scheduleEntries.slice(0, 2).map((slot) => `${slot.startDate} to ${slot.endDate} ${slot.mode}`).join(" - ")}
                </div>
              )}
            </div>
          </div>
        </section>

        <section className="card card-subtle" style={{ borderColor:C.blue+"26" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:"0.6rem", flexWrap:"wrap", marginBottom:"0.7rem" }}>
            <div>
              <div style={{ fontSize:"0.5rem", color:"#64748b", letterSpacing:"0.14em", marginBottom:"0.22rem" }}>FUTURE WEEK PREVIEW</div>
              <div style={{ fontSize:"0.58rem", color:"#8fa5c8", lineHeight:1.55 }}>Projected structure only. Future weeks are planning previews, not committed day-level prescriptions.</div>
            </div>
            <div style={{ fontSize:"0.5rem", color:"#8fa5c8", background:"#1e293b", padding:"0.18rem 0.5rem", borderRadius:999, letterSpacing:"0.08em" }}>PROJECTED</div>
          </div>

          <div style={{ display:"grid", gap:"0.55rem" }}>
            {futureWeekRows.map((h) => {
              const w = h?.template || null;
              const adaptive = adjustedWeekMap[h.absoluteWeek] || { adjusted: w, changed: [] };
              const weekSessions = getProgramWeekSessions(h.absoluteWeek, h);
              const weekIntent = h?.planWeek?.weeklyIntent || (h?.planWeek ? {
                focus: h.planWeek.focus,
                aggressionLevel: h.planWeek.aggressionLevel,
                recoveryBias: h.planWeek.recoveryBias,
                nutritionEmphasis: h.planWeek.nutritionEmphasis,
              } : null);
              const isExpanded = openWeek === h.absoluteWeek;
              const hasCanonicalSessions = Object.values(h?.planWeek?.sessionsByDay || {}).some(Boolean);
              const projectionLabel = h.kind === "recovery"
                ? "Recovery placeholder"
                : h.kind === "next_goal_prompt"
                ? "Next-goal placeholder"
                : hasCanonicalSessions
                ? "Projected week"
                : "Directional preview";
              const previewTone = hasCanonicalSessions ? C.blue : C.amber;
              const collapsedSummary = weekSessions.length > 0
                ? weekSessions.slice(0, 3).map((session) => `${session.day} ${session.title}`).join(" - ")
                : (h?.focus || "Preview unavailable");
              return (
                <div key={h.absoluteWeek} className="card card-subtle" style={{ borderColor:"#22324a", background:"#0d1117" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"0.6rem", flexWrap:"wrap" }}>
                    <div>
                      <div style={{ fontSize:"0.74rem", color:"#f8fafc", fontWeight:600 }}>{h.weekLabel || `${w?.phase || "Plan"} - Week ${h.absoluteWeek}`}</div>
                      <div style={{ fontSize:"0.5rem", color:previewTone, marginTop:"0.12rem", letterSpacing:"0.08em" }}>{projectionLabel}</div>
                      {weekIntent?.focus && <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.18rem" }}>{weekIntent.focus}</div>}
                      <div style={{ fontSize:"0.53rem", color:"#8fa5c8", marginTop:"0.14rem", lineHeight:1.55 }}>
                        {hasCanonicalSessions ? "Built from PlanWeek structure. Day details may still change when that week becomes current." : "Direction derived from templates and current planning inputs. Day detail is not final yet."}
                      </div>
                    </div>
                    <button className="btn" onClick={()=>setOpenWeek(openWeek===h.absoluteWeek ? null : h.absoluteWeek)} style={{ fontSize:"0.5rem" }}>{isExpanded ? "Hide" : "View"}</button>
                  </div>

                  {!isExpanded && <div style={{ fontSize:"0.55rem", color:"#94a3b8", marginTop:"0.35rem", lineHeight:1.6 }}>{collapsedSummary}</div>}

                  {isExpanded && (
                    <div style={{ marginTop:"0.45rem", display:"grid", gap:"0.4rem" }}>
                      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))", gap:"0.4rem" }}>
                        {(weekSessions ?? []).map((session) => (
                          <div key={`${h.absoluteWeek}_${session.day}_${session.title}`} style={{ border:"1px solid #1e293b", borderRadius:9, background:"#0f172a", padding:"0.45rem 0.5rem" }}>
                            <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>{session.day}</div>
                            <div style={{ fontSize:"0.57rem", color:"#e2e8f0", marginTop:"0.12rem", display:"flex", alignItems:"center", gap:"0.25rem" }}>
                              {session.icon && <InlineGlyph name={session.icon} color={previewTone} size={12} />}
                              <span>{session.title}</span>
                            </div>
                            <div style={{ fontSize:"0.52rem", color:"#8fa5c8", marginTop:"0.12rem", lineHeight:1.5 }}>{session.detail || "Planned session"}</div>
                          </div>
                        ))}
                      </div>
                      {adaptive.changed?.length > 0 && (
                        <div style={{ fontSize:"0.52rem", color:"#8fa5c8", lineHeight:1.55 }}>
                          {adaptive.changed.slice(0,3).map((line, idx) => <div key={idx}>- {line}</div>)}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </div>
      {Object.keys(paceOverrides || {}).length > 0 && (
        <div style={{ marginTop:"0.75rem", padding:"0.6rem 0.8rem", background:"#0d1117", border:`1px solid ${C.amber}30`, borderRadius:8, fontSize:"0.58rem", color:C.amber }}>
          Paces were adjusted from recent execution. <button className="btn" onClick={() => setPaceOverrides({})} style={{ marginLeft:"0.4rem", fontSize:"0.5rem", color:C.amber, borderColor:C.amber+"30" }}>Reset</button>
        </div>
      )}
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ LOG TAB (POLISHED) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function LogTab({ planDay = null, logs, dailyCheckins = {}, plannedDayRecords = {}, nutritionActualLogs = {}, saveLogs, bodyweights, saveBodyweights, currentWeek, todayWorkout: legacyTodayWorkout, planArchives = [], planStartDate = "" }) {
  const todayWorkout = planDay?.resolved?.training || legacyTodayWorkout;
  const plannedWorkout = planDay?.base?.training || legacyTodayWorkout;
  const todayPlannedDayRecord = useMemo(() => buildPlannedDayRecord(planDay), [planDay]);
  const FEEL_LABELS = {
    "1": { title: "Rough", tip: "Rest, eat, sleep. Tomorrow is a new session." },
    "2": { title: "Tired", tip: "Manageable. Log it and move on." },
    "3": { title: "Solid", tip: "Standard execution. Building as planned." },
    "4": { title: "Strong", tip: "Good day. Note it Ã¢â‚¬â€ the coach will." },
    "5": { title: "Best", tip: "Flag this. Worth knowing when these happen." },
  };
  const today = new Date().toISOString().split("T")[0];
  const [quick, setQuick] = useState({ status:"", feel:"3", note:"", bodyweight:"" });
  const [detailed, setDetailed] = useState({ date:today, type: todayWorkout?.label || plannedWorkout?.label || "", miles:"", pace:"", runTime:"", reps:"", weight:"", notes:"", feel:"3", location:"home" });
  const [saved, setSaved] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [feelTooltip, setFeelTooltip] = useState("");
  const [detailedOpen, setDetailedOpen] = useState(false);
  const [pendingDeleteDate, setPendingDeleteDate] = useState("");
  const [selectedReviewDate, setSelectedReviewDate] = useState(today);
  const feelTooltipTimerRef = useRef(null);

  const history = Object.entries(logs || {})
    .filter(([date]) => date <= today)
    .sort((a,b)=>b[0].localeCompare(a[0]));
  const recent14 = history.slice(0,14);
  const reviewDateKeys = useMemo(
    () => Array.from(new Set([
      ...Object.keys(logs || {}),
      ...Object.keys(dailyCheckins || {}),
      ...Object.keys(plannedDayRecords || {}),
      ...Object.keys(nutritionActualLogs || {}),
      today,
    ])).filter((dateKey) => dateKey && dateKey <= today).sort((a, b) => b.localeCompare(a)),
    [logs, dailyCheckins, plannedDayRecords, nutritionActualLogs, today]
  );
  const toDateKey = (d) => new Date(d.getTime() - (d.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
  const getPlannedHistoryForDate = (dateKey, entry = null) => {
    if (!dateKey) return null;
    const existingEntry = normalizePrescribedDayHistoryEntry(dateKey, plannedDayRecords?.[dateKey] || null);
    if (existingEntry) return existingEntry;
    if (dateKey === today && todayPlannedDayRecord) {
      return createPrescribedDayHistoryEntry({
        plannedDayRecord: todayPlannedDayRecord,
        capturedAt: getStableCaptureAtForDate(dateKey),
        sourceType: "plan_day_engine",
        durability: PRESCRIBED_DAY_DURABILITY.durable,
        reason: "today_plan_capture",
        validateInvariant: validatePrescribedDayHistoryInvariant,
      });
    }
    const legacySnapshotRecord = buildLegacyPlannedDayRecordFromSnapshot({ dateKey, snapshot: entry?.prescribedPlanSnapshot || null });
    if (legacySnapshotRecord) {
      return createPrescribedDayHistoryEntry({
        plannedDayRecord: legacySnapshotRecord,
        capturedAt: entry?.ts || getStableCaptureAtForDate(dateKey),
        sourceType: "legacy_log_snapshot",
        durability: PRESCRIBED_DAY_DURABILITY.legacyBackfill,
        reason: "legacy_snapshot_backfill",
        validateInvariant: validatePrescribedDayHistoryInvariant,
      });
    }
    const dateObj = new Date(`${dateKey}T12:00:00`);
    if (Number.isNaN(dateObj.getTime())) return null;
    const week = resolvePlanWeekNumberForDateKey({
      dateKey,
      planStartDate,
      fallbackStartDate: PROFILE.startDate,
    });
    const workout = getTodayWorkout(week, dateObj.getDay());
    const fallbackRecord = buildLegacyPlannedDayRecordFromWorkout({ dateKey, weekNumber: week, workout });
    if (!fallbackRecord) return null;
    return createPrescribedDayHistoryEntry({
      plannedDayRecord: fallbackRecord,
      capturedAt: getStableCaptureAtForDate(dateKey),
      sourceType: "legacy_schedule_helper",
      durability: PRESCRIBED_DAY_DURABILITY.fallbackDerived,
      reason: "schedule_backfill",
      validateInvariant: validatePrescribedDayHistoryInvariant,
    });
  };
  const getPlanComparison = (dateKey, entry = null) => {
    if (entry?.comparison?.completionKind) return entry.comparison;
    return buildDayReviewComparison({
      dateKey,
      actualLog: entry || {},
      actualCheckin: dailyCheckins?.[dateKey] || {},
      plannedDayRecord: getCurrentPrescribedDayRecord(getPlannedHistoryForDate(dateKey, entry)),
    });
  };
  const classifyStatus = (dateKey, entry) => {
    return classifyDayReviewStatus(getPlanComparison(dateKey, entry));
  };
  const formatReviewTimestamp = (value) => {
    if (!value) return "unknown";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "unknown" : date.toLocaleString();
  };
  const buildSessionSummary = (training = null) => {
    if (!training) return { label: "No prescribed session", detail: "", type: "" };
    return {
      label: sanitizeDisplayText(training?.label || training?.run?.t || training?.type || "Session"),
      detail: sanitizeDisplayText(training?.run?.d || training?.strengthDose || training?.strengthDuration || training?.fallback || training?.success || ""),
      type: sanitizeDisplayText(String(training?.type || "").replaceAll("-", " ")),
    };
  };
  const buildNutritionActualSummary = (actualNutrition = null) => {
    if (!actualNutrition?.loggedAt) {
      return { label: "Not logged", detail: "Actual nutrition has not been logged.", status: "missing" };
    }
    return {
      label: sanitizeDisplayText(actualNutrition?.quickStatus || actualNutrition?.adherence || "logged"),
      detail: sanitizeDisplayText(actualNutrition?.note || actualNutrition?.issue || actualNutrition?.deviationKind || "Nutrition log saved."),
      status: actualNutrition?.deviationKind || "",
    };
  };
  const selectedDayReview = useMemo(
    () => buildDayReview({
      dateKey: selectedReviewDate,
      logs,
      dailyCheckins,
      nutritionActualLogs,
      resolvePrescribedHistory: getPlannedHistoryForDate,
      getCurrentPrescribedDayRevision,
      getCurrentPrescribedDayRecord,
    }),
    [selectedReviewDate, logs, dailyCheckins, plannedDayRecords, nutritionActualLogs, todayPlannedDayRecord]
  );
  const buildReviewBadgeTone = (kind = "") => {
    const value = String(kind || "").toLowerCase();
    if (/match|completed_as_planned|on_track|followed|high/.test(value)) return { color: C.green, bg: C.green+"14" };
    if (/modified|partial|changed|deviated|minor/.test(value)) return { color: C.blue, bg: C.blue+"14" };
    if (/skip|miss|unknown|missing|material|low|not_logged/.test(value)) return { color: C.amber, bg: C.amber+"14" };
    return { color: "#94a3b8", bg: "#1e293b" };
  };
  const sanitizeStatusLabel = (value = "", fallback = "Unknown") => {
    const textValue = String(value || "").replaceAll("_", " ").trim();
    return sanitizeDisplayText(textValue || fallback);
  };
  const summarizeExecutionDelta = (comparison = {}) => {
    if (!comparison?.hasPlannedDay) return "No planned day available for comparison.";
    return `${sanitizeStatusLabel(comparison?.completionKind)} - ${sanitizeStatusLabel(comparison?.differenceKind)}`;
  };  useEffect(() => {
    if (!reviewDateKeys.length) return;
    if (!reviewDateKeys.includes(selectedReviewDate)) setSelectedReviewDate(reviewDateKeys[0]);
  }, [reviewDateKeys, selectedReviewDate]);
  const buildConsistencyWindow = (daysBackStart, daysBackEnd) => {
    const todayBase = new Date();
    todayBase.setHours(0, 0, 0, 0);
    const start = new Date(todayBase);
    start.setDate(start.getDate() - daysBackStart);
    const end = new Date(todayBase);
    end.setDate(end.getDate() - daysBackEnd);
    const counts = { completed: 0, modified: 0, custom: 0, skipped: 0, notLoggedOver48h: 0 };
    for (const cursor = new Date(start); cursor <= end; cursor.setDate(cursor.getDate() + 1)) {
      const dateKey = toDateKey(cursor);
      const comparison = getPlanComparison(dateKey, logs?.[dateKey]);
      if (!comparison?.hasPlannedDay || !comparison?.expectedSession) continue;
      const status = classifyStatus(dateKey, logs?.[dateKey]);
      if (status === "completed_as_planned") counts.completed += 1;
      else if (status === "completed_modified") counts.modified += 1;
      else if (status === "custom_session") counts.custom += 1;
      else if (status === "skipped") counts.skipped += 1;
      else if (status === "not_logged_over_48h") counts.notLoggedOver48h += 1;
    }
    const numerator = counts.completed + counts.modified;
    const denominator = numerator + counts.custom + counts.skipped + counts.notLoggedOver48h;
    const pct = denominator > 0 ? Math.round((numerator / denominator) * 100) : null;
    return { ...counts, numerator, denominator, pct };
  };
  const consistencyCurrent = buildConsistencyWindow(13, 0);
  const consistencyPrior2Weeks = buildConsistencyWindow(27, 14);
  const consistencyDelta = (consistencyCurrent?.pct ?? 0) - (consistencyPrior2Weeks?.pct ?? 0);
  const consistencyTrend = consistencyCurrent?.pct === null || consistencyPrior2Weeks?.pct === null
    ? "flat"
    : consistencyDelta > 3
    ? "up"
    : consistencyDelta < -3
    ? "down"
    : "flat";
  const consistencyTrendArrow = consistencyTrend === "up" ? "Ã¢â€ â€˜" : consistencyTrend === "down" ? "Ã¢â€ â€œ" : "Ã¢â€ â€™";
  const lifetimeLoggedCount = history.filter(([dateKey, l]) => {
    const status = resolveActualStatus({ dateKey, dailyCheckin: dailyCheckins?.[dateKey] || {}, logEntry: l || {} });
    return ["completed_as_planned", "completed_modified", "skipped", "partial_completed"].includes(status) || Number(l?.miles || 0) > 0 || String(l?.type || "").length > 0;
  }).length;
  const consistencyLabel = consistencyCurrent.denominator > 0 ? `${consistencyCurrent.numerator} of ${consistencyCurrent.denominator} sessions` : "0 of 0 sessions";
  const avgFeel = recent14.length ? (recent14.reduce((s,[,l]) => s + Number(l.feel || 3), 0) / recent14.length).toFixed(1) : "-";
  const weeklyFeelSeries = Array.from({ length: 4 }).map((_, idx) => {
    const rangeStart = 7 * (3 - idx);
    const rangeEnd = rangeStart + 6;
    const window = history.filter(([dateKey]) => {
      const ageDays = (Date.now() - new Date(`${dateKey}T12:00:00`).getTime()) / (1000 * 60 * 60 * 24);
      return ageDays >= rangeStart && ageDays <= rangeEnd;
    });
    const vals = window.map(([, l]) => Number(l?.feel)).filter(n => Number.isFinite(n) && n > 0);
    return vals.length ? Number((vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(2)) : 3;
  });
  const consistencyStateLine = lifetimeLoggedCount < 3
    ? "Log a few more sessions to surface patterns."
    : (consistencyCurrent.pct || 0) > 80
    ? "Strong execution this period."
    : (consistencyCurrent.pct || 0) >= 50
    ? "Workable. Key sessions are what matter most."
    : "Execution is the current limiter. Simplified week is active.";
  const cleanHistorySessionName = (value = "") => sanitizeDisplayText(String(value || "Session").replace(/\s*\([^)]*\)/g, "").replace(/\s{2,}/g, " ").trim() || "Session");
  const openHistoryEntry = (date, log = {}) => {
    const firstExerciseRecord = getExercisePerformanceRecordsForLog(log || {}, { dateKey: date })[0] || null;
    setSelectedReviewDate(date);
    setDetailed({
      date,
      type: cleanHistorySessionName(log?.type || todayWorkout?.label || plannedWorkout?.label || "Session"),
      miles: log?.miles ?? "",
      pace: log?.pace ?? "",
      runTime: log?.runTime ?? "",
      reps: log?.reps ?? log?.pushups ?? firstExerciseRecord?.actual?.reps ?? log?.strengthPerformance?.[0]?.repsCompleted ?? "",
      weight: log?.weight ?? firstExerciseRecord?.actual?.weight ?? firstExerciseRecord?.prescribed?.weight ?? log?.strengthPerformance?.[0]?.weightUsed ?? "",
      notes: log?.notes ?? "",
      feel: String(log?.feel || "3"),
      location: log?.location || "home",
    });
    setDetailedOpen(true);
    setPendingDeleteDate("");
  };
  const buildRetroStrengthPerformance = (entry = {}) => {
    if (Array.isArray(entry?.strengthPerformance) && entry.strengthPerformance.length > 0) return entry.strengthPerformance;
    const weightUsed = Number(entry?.weight || 0);
    const repsCompleted = Number(entry?.reps || entry?.pushups || 0);
    const typeText = String(entry?.type || "").toLowerCase();
    const looksLikeStrength = /strength|bench|squat|deadlift|press|pull|row|lift|push/.test(typeText);
    const mode = inferExerciseMode(typeText);
    if (!looksLikeStrength || !(repsCompleted > 0) || (mode === "weighted" && !(weightUsed > 0))) return [];
    return [{
      exercise: cleanHistorySessionName(entry.type || "Strength session"),
      weightUsed: mode === "weighted" ? weightUsed : null,
      actualWeight: mode === "weighted" ? weightUsed : null,
      prescribedWeight: mode === "weighted" ? weightUsed : null,
      repsCompleted,
      actualReps: repsCompleted,
      actualSets: Number(entry?.sets || 3) || 3,
      prescribedSets: Number(entry?.sets || 3) || 3,
      prescribedReps: repsCompleted,
      bodyweightOnly: mode === "bodyweight",
      bandTension: mode === "band" ? (entry?.bandTension || "Light") : null,
      completionRatio: 1,
      feelThisSession: Number(entry?.feel || 3),
      sessionFeelScore: Number(entry?.feel || 3),
    }];
  };

  const savePrescribed = async () => {
    // one-tap completion path
    const entry = {
      date: today,
      type: cleanHistorySessionName(todayWorkout?.label || plannedWorkout?.label || "Prescribed workout"),
      notes: "Marked prescribed workout complete.",
      feel: "3",
      planDayId: planDay?.id || "",
      prescribedPlanSnapshot: planDay ? {
        dateKey: planDay?.dateKey || today,
        baseLabel: planDay?.base?.training?.label || "",
        resolvedLabel: planDay?.resolved?.training?.label || "",
        mode: planDay?.decision?.mode || "",
        modeLabel: planDay?.decision?.modeLabel || "",
        modifiedFromBase: Boolean(planDay?.decision?.modifiedFromBase),
      } : null,
      ts: Date.now(),
      checkin: { status: "completed_as_planned", sessionFeel: "about_right", note: "", ts: Date.now() }
    };
    await saveLogs({ ...logs, [today]: entry }, { changedDateKey: today });
    setSaved(true);
    setSavedMsg("Prescribed workout completed.");
    setTimeout(()=>setSaved(false), 1800);
  };

  const saveDetailed = async () => {
    if (!detailed.date) return;
    const existing = logs?.[detailed.date] || {};
    const nextEntry = {
      ...existing,
      ...detailed,
      type: cleanHistorySessionName(detailed.type || existing.type || todayWorkout?.label || plannedWorkout?.label || "Session"),
      pushups: detailed.reps || existing.pushups || "",
      reps: detailed.reps || existing.reps || "",
      editedAt: Date.now(),
      retroEdited: detailed.date < today,
      strengthPerformance: buildRetroStrengthPerformance({ ...existing, ...detailed }),
      ts: Date.now(),
    };
    await saveLogs({ ...logs, [detailed.date]: nextEntry }, { changedDateKey: detailed.date });
    setSaved(true);
    setSavedMsg(detailed.date < today ? "Custom workout saved. Edited." : "Custom workout saved.");
    setTimeout(()=>setSaved(false), 1800);
  };

  const delLog = async (date) => {
    const next = { ...logs };
    delete next[date];
    await saveLogs(next, { changedDateKey: date });
    setPendingDeleteDate("");
  };
  const showFeelTooltip = (feelValue) => {
    const tip = FEEL_LABELS[String(feelValue)]?.tip || "";
    setFeelTooltip(tip);
    if (feelTooltipTimerRef.current) clearTimeout(feelTooltipTimerRef.current);
    feelTooltipTimerRef.current = setTimeout(() => setFeelTooltip(""), 3000);
  };
  useEffect(() => () => {
    if (feelTooltipTimerRef.current) clearTimeout(feelTooltipTimerRef.current);
  }, []);

  return (
    <div className="fi">
      <div className="card card-action" style={{ marginBottom:"0.8rem", borderColor:C.green+"40", background:"#0d1711" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.35rem" }}>LOG WORKOUT</div>
        <div style={{ fontSize:"0.58rem", color:"#94a3b8", marginBottom:"0.45rem" }}>Pick the fast path, or add details if you need them.</div>
        <div style={{ display:"grid", gap:"0.4rem" }}>
          <button className="btn btn-primary" onClick={savePrescribed} style={{ fontSize:"0.55rem" }}>Mark Prescribed Workout Complete</button>
          {saved && <div className="completion-pop" style={{ fontSize:"0.57rem", color:C.green, display:"inline-flex", alignItems:"center", gap:"0.3rem", background:"rgba(39,245,154,0.1)", border:"1px solid rgba(39,245,154,0.38)", borderRadius:999, padding:"0.18rem 0.5rem" }}><span className="mono">Ã¢Å“â€œ</span> {savedMsg}</div>}
        </div>
      </div>

      <details className="card" style={{ marginBottom:"0.8rem" }} open={detailedOpen} onToggle={e=>setDetailedOpen(e.currentTarget.open)}>
        <summary style={{ cursor:"pointer", fontSize:"0.58rem", color:C.blue, letterSpacing:"0.08em" }}>Log Custom Workout Details</summary>
        <div style={{ marginTop:"0.55rem", display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.45rem" }}>
          <input type="date" value={detailed.date} onChange={e=>setDetailed({ ...detailed, date:e.target.value })} />
          <input value={detailed.type} onChange={e=>setDetailed({ ...detailed, type:e.target.value })} placeholder="Workout type" />
          <input type="number" step="0.1" value={detailed.miles} onChange={e=>setDetailed({ ...detailed, miles:e.target.value })} placeholder="Miles" />
          <input value={detailed.pace} onChange={e=>setDetailed({ ...detailed, pace:e.target.value })} placeholder="Pace" />
          <input value={detailed.runTime} onChange={e=>setDetailed({ ...detailed, runTime:e.target.value })} placeholder="Run time" />
          <input value={detailed.reps} onChange={e=>setDetailed({ ...detailed, reps:e.target.value })} placeholder="Reps" />
          <input value={detailed.weight} onChange={e=>setDetailed({ ...detailed, weight:e.target.value })} placeholder="Weight" />
          <select value={detailed.feel} onChange={e=>setDetailed({ ...detailed, feel:e.target.value })}>{[1,2,3,4,5].map(n=><option key={n} value={String(n)}>{`${n} Ã‚Â· ${FEEL_LABELS[String(n)]?.title}`}</option>)}</select>
          <input style={{ gridColumn:"1 / -1" }} value={detailed.notes} onChange={e=>setDetailed({ ...detailed, notes:e.target.value })} placeholder="Notes" />
          <button className="btn btn-primary" onClick={saveDetailed} style={{ width:"fit-content", fontSize:"0.55rem" }}>Save custom workout</button>
        </div>
      </details>

      <div className="card" style={{ marginBottom:"0.8rem", borderColor:C.blue+"35" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>TREND SNAPSHOT</div>
        <div style={{ display:"grid", gridTemplateColumns:"1.4fr 1fr", gap:"0.4rem" }}>
          <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:8, padding:"0.45rem" }}>
            <div style={{ fontSize:"0.5rem", color:"#64748b" }}>Consistency</div>
            {lifetimeLoggedCount < 3 ? (
              <div style={{ marginTop:"0.18rem", fontSize:"0.58rem", color:"#94a3b8" }}>Log 3+ sessions to see trends.</div>
            ) : (
              <div style={{ marginTop:"0.16rem", display:"flex", alignItems:"center", gap:"0.3rem" }}>
                <div style={{ fontSize:"0.66rem", color:C.green }}>{consistencyLabel}</div>
                <div style={{ fontSize:"0.62rem", color:consistencyTrend === "up" ? C.green : consistencyTrend === "down" ? C.red : "#94a3b8" }}>
                  {consistencyTrendArrow} {consistencyCurrent.pct}%
                </div>
              </div>
            )}
          </div>
          <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:8, padding:"0.45rem" }}>
            <div style={{ fontSize:"0.5rem", color:"#64748b" }}>Avg feel</div>
            <div style={{ fontSize:"0.72rem", color:C.blue }}>{avgFeel}</div>
            <div style={{ marginTop:"0.18rem" }}>
              <MiniChart data={weeklyFeelSeries} color={C.blue} baseline={3} />
            </div>
          </div>
        </div>
        <div style={{ marginTop:"0.35rem", fontSize:"0.56rem", color:"#94a3b8" }}>{consistencyStateLine}</div>
        <div style={{ marginTop:"0.2rem", fontSize:"0.55rem", color:"#64748b" }}>What changed: plan intensity and nutrition guidance adapt directly from this logging pattern.</div>
      </div>

      <div className="card card-soft" style={{ marginBottom:"0.8rem", borderColor:C.blue+"30" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", gap:"0.5rem", marginBottom:"0.4rem", flexWrap:"wrap" }}>
          <div>
            <div className="sect-title" style={{ color:C.blue, marginBottom:"0.12rem" }}>DAY REVIEW</div>
            <div style={{ fontSize:"0.54rem", color:"#94a3b8" }}>Inspect prescription revisions against actual outcome for one day.</div>
          </div>
          <select value={selectedReviewDate} onChange={(e)=>setSelectedReviewDate(e.target.value)} style={{ fontSize:"0.54rem", minWidth:150 }}>
            {(reviewDateKeys || []).slice(0, 60).map((dateKey) => (
              <option key={dateKey} value={dateKey}>{dateKey}</option>
            ))}
          </select>
        </div>
        {selectedDayReview && (
          <div style={{ display:"grid", gap:"0.55rem" }}>
            {(() => {
              const comparisonTone = buildReviewBadgeTone(selectedDayReview?.comparison?.completionKind || selectedDayReview?.comparison?.differenceKind);
              const revisionTone = buildReviewBadgeTone((selectedDayReview?.revisions?.length || 0) > 1 ? "changed" : "match");
              const nutritionTone = buildReviewBadgeTone(selectedDayReview?.actualNutrition?.adherence || selectedDayReview?.actualNutrition?.deviationKind);
              const planChanged = (selectedDayReview?.revisions?.length || 0) > 1;
              const executedDifferently = !["completed_as_planned", "matched", "followed"].includes(String(selectedDayReview?.comparison?.completionKind || "").toLowerCase()) || !["matched", "followed", "none"].includes(String(selectedDayReview?.comparison?.differenceKind || "").toLowerCase());
              return (
                <>
                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"0.45rem" }}>
                    <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.5rem" }}>
                      <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>REVIEW STATUS</div>
                      <div style={{ display:"flex", flexWrap:"wrap", gap:"0.28rem", marginTop:"0.18rem" }}>
                        <span style={{ fontSize:"0.48rem", color:comparisonTone.color, background:comparisonTone.bg, padding:"0.14rem 0.4rem", borderRadius:999 }}>{summarizeExecutionDelta(selectedDayReview?.comparison)}</span>
                        <span style={{ fontSize:"0.48rem", color:revisionTone.color, background:revisionTone.bg, padding:"0.14rem 0.4rem", borderRadius:999 }}>{planChanged ? "Plan changed" : "Plan stable"}</span>
                        <span style={{ fontSize:"0.48rem", color:executedDifferently ? C.amber : C.green, background:(executedDifferently ? C.amber : C.green)+"14", padding:"0.14rem 0.4rem", borderRadius:999 }}>{executedDifferently ? "Executed differently" : "Executed as prescribed"}</span>
                      </div>
                      <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.22rem", lineHeight:1.55 }}>{sanitizeDisplayText(selectedDayReview?.comparison?.summary || "Comparison unavailable.")}</div>
                    </div>
                    <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.5rem" }}>
                      <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>PRESCRIPTION STATE</div>
                      <div style={{ fontSize:"0.6rem", color:"#e2e8f0", marginTop:"0.16rem" }}>Rev {selectedDayReview?.currentRevision?.revisionNumber || 0} of {selectedDayReview?.revisions?.length || 0}</div>
                      <div style={{ fontSize:"0.51rem", color:"#8fa5c8", marginTop:"0.14rem", lineHeight:1.5 }}>Source: {sanitizeStatusLabel(selectedDayReview?.currentRevision?.sourceType, "unknown")} - {sanitizeStatusLabel(selectedDayReview?.currentRevision?.durability, "unknown")}</div>
                    </div>
                    <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.5rem" }}>
                      <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>NUTRITION STATUS</div>
                      <div style={{ display:"inline-flex", fontSize:"0.48rem", color:nutritionTone.color, background:nutritionTone.bg, padding:"0.14rem 0.4rem", borderRadius:999, marginTop:"0.18rem" }}>{sanitizeStatusLabel(selectedDayReview?.actualNutrition?.adherence || selectedDayReview?.actualNutrition?.deviationKind, "Not logged")}</div>
                      <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.22rem", lineHeight:1.55 }}>{sanitizeDisplayText(selectedDayReview?.nutritionComparison?.summary || "Nutrition comparison unavailable.")}</div>
                    </div>
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:"0.45rem" }}>
                    <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.55rem" }}>
                      <div style={{ fontSize:"0.49rem", color:"#64748b", letterSpacing:"0.08em", marginBottom:"0.22rem" }}>ORIGINAL PRESCRIPTION</div>
                      {(() => {
                        const summary = buildSessionSummary(selectedDayReview?.originalRecord?.resolved?.training || selectedDayReview?.originalRecord?.base?.training || null);
                        return (
                          <>
                            <div style={{ fontSize:"0.6rem", color:"#e2e8f0" }}>{summary.label}</div>
                            <div style={{ fontSize:"0.53rem", color:"#8fa5c8", marginTop:"0.12rem" }}>{summary.detail || summary.type || "No detail saved."}</div>
                            <div style={{ fontSize:"0.5rem", color:"#64748b", marginTop:"0.18rem", lineHeight:1.5 }}>{selectedDayReview?.originalRevision ? `${formatReviewTimestamp(selectedDayReview.originalRevision.capturedAt)} - ${sanitizeDisplayText(describeProvenanceRecord(selectedDayReview.originalRevision.provenance || null, selectedDayReview.originalRevision.reason || "initial_capture"))}` : "No original revision available."}</div>
                          </>
                        );
                      })()}
                    </div>
                    <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.55rem" }}>
                      <div style={{ fontSize:"0.49rem", color:"#64748b", letterSpacing:"0.08em", marginBottom:"0.22rem" }}>LATEST PRESCRIPTION</div>
                      {(() => {
                        const summary = buildSessionSummary(selectedDayReview?.currentRecord?.resolved?.training || selectedDayReview?.currentRecord?.base?.training || null);
                        return (
                          <>
                            <div style={{ fontSize:"0.6rem", color:"#e2e8f0" }}>{summary.label}</div>
                            <div style={{ fontSize:"0.53rem", color:"#8fa5c8", marginTop:"0.12rem" }}>{summary.detail || summary.type || "No detail saved."}</div>
                            <div style={{ fontSize:"0.5rem", color:"#64748b", marginTop:"0.18rem", lineHeight:1.5 }}>{selectedDayReview?.currentRevision ? `${formatReviewTimestamp(selectedDayReview.currentRevision.capturedAt)} - ${sanitizeDisplayText(describeProvenanceRecord(selectedDayReview.currentRevision.provenance || null, selectedDayReview.currentRevision.reason || "latest_revision"))}` : "No current revision available."}</div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))", gap:"0.45rem" }}>
                    <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.55rem" }}>
                      <div style={{ fontSize:"0.49rem", color:"#64748b", letterSpacing:"0.08em", marginBottom:"0.22rem" }}>ACTUAL OUTCOME</div>
                      <div style={{ fontSize:"0.6rem", color:"#e2e8f0" }}>{sanitizeDisplayText(cleanHistorySessionName(selectedDayReview?.actualLog?.type || selectedDayReview?.comparison?.actualSession?.label || "No workout log"))}</div>
                      <div style={{ fontSize:"0.53rem", color:"#8fa5c8", marginTop:"0.12rem" }}>{sanitizeDisplayText(selectedDayReview?.actualLog?.notes || selectedDayReview?.comparison?.actualSession?.detail || selectedDayReview?.comparison?.status || "No session detail logged.")}</div>
                      <div style={{ fontSize:"0.5rem", color:"#64748b", marginTop:"0.18rem" }}>Executed: {sanitizeStatusLabel(selectedDayReview?.comparison?.completionKind, "unknown")} - {sanitizeStatusLabel(selectedDayReview?.comparison?.differenceKind, "unknown")}</div>
                    </div>
                    <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.55rem" }}>
                      <div style={{ fontSize:"0.49rem", color:"#64748b", letterSpacing:"0.08em", marginBottom:"0.18rem" }}>ACTUAL CHECK-IN</div>
                      <div style={{ fontSize:"0.56rem", color:"#e2e8f0" }}>{sanitizeDisplayText(selectedDayReview?.actualCheckin?.status || "No check-in saved")}</div>
                      <div style={{ fontSize:"0.51rem", color:"#8fa5c8", marginTop:"0.12rem" }}>{sanitizeDisplayText(selectedDayReview?.actualCheckin?.note || selectedDayReview?.actualCheckin?.blocker || selectedDayReview?.actualCheckin?.sessionFeel || "No additional context saved.")}</div>
                    </div>
                    <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.55rem" }}>
                      <div style={{ fontSize:"0.49rem", color:"#64748b", letterSpacing:"0.08em", marginBottom:"0.18rem" }}>ACTUAL NUTRITION</div>
                      {(() => {
                        const nutritionSummary = buildNutritionActualSummary(selectedDayReview?.actualNutrition);
                        return (
                          <>
                            <div style={{ fontSize:"0.56rem", color:"#e2e8f0" }}>{sanitizeDisplayText(nutritionSummary.label)}</div>
                            <div style={{ fontSize:"0.51rem", color:"#8fa5c8", marginTop:"0.12rem" }}>{sanitizeDisplayText(nutritionSummary.detail)}</div>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  <details style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.5rem 0.55rem" }} open={selectedDayReview?.revisions?.length > 1}>
                    <summary style={{ cursor:"pointer", fontSize:"0.55rem", color:"#dbe7f6" }}>Revision timeline ({selectedDayReview?.revisions?.length || 0})</summary>
                    <div style={{ marginTop:"0.35rem", display:"grid", gap:"0.32rem" }}>
                      {(selectedDayReview?.revisions || []).map((revision) => {
                        const summary = buildSessionSummary(revision?.record?.resolved?.training || revision?.record?.base?.training || null);
                        const isOriginal = revision?.revisionNumber === selectedDayReview?.originalRevision?.revisionNumber;
                        const isCurrent = revision?.revisionNumber === selectedDayReview?.currentRevision?.revisionNumber;
                        return (
                          <div key={revision?.revisionId || `${selectedDayReview?.dateKey}_${revision?.revisionNumber}`} style={{ border:"1px solid #182335", borderRadius:8, background:"rgba(8,12,20,0.65)", padding:"0.4rem 0.45rem" }}>
                            <div style={{ display:"flex", justifyContent:"space-between", gap:"0.4rem", flexWrap:"wrap", alignItems:"center" }}>
                              <div style={{ fontSize:"0.56rem", color:"#e2e8f0" }}>Rev {revision?.revisionNumber || 0}: {summary.label}</div>
                              <div style={{ display:"flex", gap:"0.24rem", flexWrap:"wrap", alignItems:"center" }}>
                                {isOriginal && <span style={{ fontSize:"0.46rem", color:C.blue, background:C.blue+"14", padding:"0.12rem 0.35rem", borderRadius:999 }}>original</span>}
                                {isCurrent && <span style={{ fontSize:"0.46rem", color:C.green, background:C.green+"14", padding:"0.12rem 0.35rem", borderRadius:999 }}>latest</span>}
                                <div style={{ fontSize:"0.48rem", color:"#64748b" }}>{formatReviewTimestamp(revision?.capturedAt)}</div>
                              </div>
                            </div>
                            <div style={{ fontSize:"0.5rem", color:"#8fa5c8", marginTop:"0.1rem" }}>{summary.detail || summary.type || "No session detail saved."}</div>
                            <div style={{ fontSize:"0.49rem", color:"#94a3b8", marginTop:"0.14rem", lineHeight:1.5 }}>Plan changed because: {sanitizeDisplayText(revision?.provenanceSummary || revision?.reason || "unknown")} - {sanitizeDisplayText(revision?.sourceType || "unknown")} - {sanitizeDisplayText(revision?.durability || "unknown")}</div>
                          </div>
                        );
                      })}
                    </div>
                  </details>
                </>
              );
            })()}
          </div>
        )}
      </div>

      <div className="card" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.45rem" }}>HISTORY</div>
        <div style={{ display:"grid", gridTemplateColumns:"95px 1fr 90px auto", gap:"0.5rem", padding:"0 8px 0.28rem", fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>
          <div>DATE</div>
          <div>SESSION</div>
          <div>FEEL</div>
          <div>ACTION</div>
        </div>
        <div style={{ display:"grid", gap:"0.35rem" }}>
          {history.slice(0, 20).map(([date, log]) => {
            const displayName = cleanHistorySessionName(log?.type || "Session");
            const feelDisplay = String(log?.feel || "").trim() ? `Feel ${log.feel}` : "Ã¢â‚¬â€";
            const showEditedBadge = Boolean(log?.retroEdited || (log?.editedAt && date < today));
            const comparison = getPlanComparison(date, log);
            const comparisonTone = comparison?.severity === "material" ? C.amber : comparison?.severity === "minor" ? C.blue : "#64748b";
            const selected = selectedReviewDate === date;
            return (
              <div key={date} style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"0.5rem", alignItems:"center", background:"#0f172a", border:`1px solid ${selected ? C.blue+"55" : "#1e293b"}`, borderRadius:8, padding:"6px 8px" }}>
                <button
                  className="btn"
                  onClick={()=>{
                    setSelectedReviewDate(date);
                    openHistoryEntry(date, log);
                  }}
                  style={{
                    display:"grid",
                    gridTemplateColumns:"95px 1fr 90px",
                    gap:"0.5rem",
                    alignItems:"center",
                    border:"none",
                    background:"transparent",
                    padding:0,
                    textAlign:"left",
                    minWidth:0,
                  }}
                >
                  <div style={{ fontSize:"0.55rem", color:"#64748b" }}>{new Date(date+"T12:00:00").toLocaleDateString("en-US",{month:"short",day:"numeric"})}</div>
                  <div style={{ display:"grid", gap:"0.08rem", minWidth:0 }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"0.35rem", minWidth:0 }}>
                      <div style={{ fontSize:"0.58rem", color:"#e2e8f0", whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>{displayName}</div>
                      {showEditedBadge && <span style={{ fontSize:"0.45rem", color:C.amber, border:`1px solid ${C.amber}35`, borderRadius:999, padding:"0.05rem 0.35rem", flexShrink:0 }}>Edited</span>}
                    </div>
                    {comparison?.summary && (
                      <div style={{ fontSize:"0.48rem", color:comparisonTone, whiteSpace:"nowrap", overflow:"hidden", textOverflow:"ellipsis" }}>
                        {comparison.summary}
                      </div>
                    )}
                  </div>
                  <div style={{ fontSize:"0.55rem", color:feelDisplay === "Ã¢â‚¬â€" ? "#64748b" : C.blue }}>{feelDisplay}</div>
                </button>
                <div style={{ justifySelf:"end" }}>
                  {pendingDeleteDate === date ? (
                    <div style={{ display:"flex", alignItems:"center", gap:"0.35rem", fontSize:"0.5rem", color:"#cbd5e1", whiteSpace:"nowrap" }}>
                      <span>Delete this entry?</span>
                      <button className="btn" onClick={()=>delLog(date)} style={{ fontSize:"0.48rem", color:C.red, borderColor:C.red+"30", padding:"0.1rem 0.35rem" }}>Yes</button>
                      <button className="btn" onClick={()=>setPendingDeleteDate("")} style={{ fontSize:"0.48rem", padding:"0.1rem 0.35rem" }}>Cancel</button>
                    </div>
                  ) : (
                    <button className="btn" onClick={()=>setPendingDeleteDate(date)} style={{ fontSize:"0.5rem", color:C.red, borderColor:C.red+"30" }}>DEL</button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <details className="card" style={{ marginBottom:"0.8rem" }}>
        <summary style={{ cursor:"pointer", fontSize:"0.58rem", color:"#94a3b8", letterSpacing:"0.06em" }}>PREVIOUS PLANS</summary>
        <div style={{ marginTop:"0.45rem", display:"grid", gap:"0.4rem" }}>
          {planArchives.length === 0 && (
            <div style={{ fontSize:"0.55rem", color:"#64748b" }}>No archived plans yet.</div>
          )}
          {planArchives.map((arc) => (
            <div key={arc.id || arc.archivedAt} style={{ border:"1px solid #20314a", borderRadius:8, background:"#0f172a", padding:"0.45rem 0.5rem" }}>
              <div style={{ fontSize:"0.56rem", color:"#dbe7f6" }}>{arc.planArcLabel || "Previous plan arc"}</div>
              <div style={{ fontSize:"0.5rem", color:"#7f94b3", marginTop:"0.1rem" }}>Archived {arc.archivedAt ? new Date(arc.archivedAt).toLocaleString() : "unknown"}</div>
              {Object.keys(arc?.prescribedDayHistory || {}).length > 0 && (
                <div style={{ fontSize:"0.49rem", color:"#8fa5c8", marginTop:"0.1rem" }}>
                  {Object.keys(arc.prescribedDayHistory || {}).length} prescribed-day snapshots archived.
                </div>
              )}
              <div style={{ marginTop:"0.2rem", display:"grid", gap:"0.18rem" }}>
                {(() => {
                  const archivedHistory = arc?.prescribedDayHistory || {};
                  const logPreview = (arc.logEntries || []).slice(0, 80).map((entry, idx) => {
                    const historyEntry = normalizePrescribedDayHistoryEntry(entry?.date || "", archivedHistory?.[entry?.date] || null);
                    const plannedRecord = getCurrentPrescribedDayRecord(historyEntry) || buildLegacyPlannedDayRecordFromSnapshot({ dateKey: entry?.date || "", snapshot: entry?.prescribedPlanSnapshot || null });
                    const plannedLabel = plannedRecord?.resolved?.training?.label || plannedRecord?.base?.training?.label || "";
                    const revisionCount = Array.isArray(historyEntry?.revisions) ? historyEntry.revisions.length : 0;
                    return (
                      <div key={`${arc.id || "arc"}_history_${entry.date || idx}`} style={{ fontSize:"0.52rem", color:"#9fb2d2" }}>
                        ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ {entry.date}: {plannedLabel ? `planned ${sanitizeDisplayText(plannedLabel)} ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ ` : ""}{sanitizeDisplayText(entry.type || "Session")}{entry.notes ? ` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â ${sanitizeDisplayText(entry.notes)}` : ""}{revisionCount > 1 ? ` (${revisionCount} revisions)` : ""}
                      </div>
                    );
                  });
                  if (logPreview.length > 0) return logPreview;
                  return Object.entries(archivedHistory || {}).slice(0, 40).map(([dateKey, historyEntry]) => {
                    const normalized = normalizePrescribedDayHistoryEntry(dateKey, historyEntry);
                    const plannedRecord = getCurrentPrescribedDayRecord(normalized);
                    const plannedLabel = plannedRecord?.resolved?.training?.label || plannedRecord?.base?.training?.label || "Planned session";
                    const revisionCount = Array.isArray(normalized?.revisions) ? normalized.revisions.length : 0;
                    return (
                      <div key={`${arc.id || "arc"}_history_${dateKey}`} style={{ fontSize:"0.52rem", color:"#9fb2d2" }}>
                        ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢ {dateKey}: planned {sanitizeDisplayText(plannedLabel)}{revisionCount > 1 ? ` (${revisionCount} revisions)` : ""}
                      </div>
                    );
                  });
                })()}
                {false && (arc.logEntries || []).slice(0, 80).map((entry, idx) => (
                  <div key={`${arc.id || "arc"}_${entry.date || idx}`} style={{ fontSize:"0.52rem", color:"#9fb2d2" }}>
                    Ã¢â‚¬Â¢ {entry.date}: {sanitizeDisplayText(entry.type || "Session")} {entry.notes ? `Ã¢â‚¬â€ ${sanitizeDisplayText(entry.notes)}` : ""}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ MINI CHART (kept) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
    title: `Sunday list for ${store} Ã‚Â· next week (${phaseMode.toUpperCase()})`,
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

// Ã¢â€â‚¬Ã¢â€â‚¬ NUTRITION TAB (REDESIGNED) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function NutritionTab({ planDay = null, todayWorkout: legacyTodayWorkout, currentWeek, logs, personalization, athleteProfile = null, momentum, bodyweights, learningLayer, nutritionLayer: legacyNutritionLayer, realWorldNutrition: legacyRealWorldNutrition, nutritionActualLogs = {}, nutritionFavorites, saveNutritionFavorites, saveNutritionActualLog }) {
  const todayWorkout = planDay?.resolved?.training || legacyTodayWorkout;
  const goals = athleteProfile?.goals || [];
  const nutritionLayer = planDay?.resolved?.nutrition?.prescription || legacyNutritionLayer;
  const realWorldNutrition = planDay?.resolved?.nutrition?.reality || legacyRealWorldNutrition;
  const planDayWeek = planDay?.week || null;
  const localFoodContext = personalization?.localFoodContext || { city: "Chicago", groceryOptions: ["Trader Joe's"] };
  const savedLocation = personalization?.connectedDevices?.location || {};
  const resolvedLocationLabel = localFoodContext.city || localFoodContext.locationLabel || (savedLocation?.status === "granted" ? "Nearby area" : "Chicago");
  const [store, setStore] = useState(localFoodContext.groceryOptions?.[0] || "Trader Joe's");
  const favorites = nutritionFavorites || DEFAULT_NUTRITION_FAVORITES;
  const [nutritionCheck, setNutritionCheck] = useState({ status: "on_track", deviationKind: "followed", issue: "", note: "" });
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
  const [supplementTaken, setSupplementTaken] = useState({});
  const [openSupplementInfo, setOpenSupplementInfo] = useState("");
  const [newSupplementName, setNewSupplementName] = useState("");
  const [newSupplementTiming, setNewSupplementTiming] = useState("");
  const goalContext = getGoalContext(goals) || { primary: null, secondary: [] };
  const dayType = nutritionLayer?.dayType || todayWorkout?.nutri || "easyRun";
  const city = resolvedLocationLabel;
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
  const currentPhase = planDayWeek?.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
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
  const breakfast = realWorldNutrition?.mealStructure?.breakfast || "Greek yogurt + fruit + granola";
  const lunch = realWorldNutrition?.mealStructure?.lunch || "Protein bowl with rice/potatoes + veggies";
  const dinner = realWorldNutrition?.mealStructure?.dinner || "Lean protein + carb + vegetable";
  const snack = realWorldNutrition?.mealStructure?.snack || (hardDay ? "Banana + protein shake" : "Apple + string cheese");
  const dailyRecommendations = Array.isArray(realWorldNutrition?.dailyRecommendations) ? realWorldNutrition.dailyRecommendations : [];
  const whyThisToday = realWorldNutrition?.whyToday || macroShiftLine;
  const groceryHooks = realWorldNutrition?.groceryHooks || null;
  const customSupplementStack = Array.isArray(favorites?.supplementStack) ? favorites.supplementStack : [];
  const phaseModeLower = String(nutritionLayer?.phaseMode || "maintain").toLowerCase();
  const sessionKind = String(todayWorkout?.type || dayType || "rest");
  const sessionIntensity = /hard|long|interval|tempo/.test(sessionKind) ? "hard" : /strength|otf|hybrid/.test(sessionKind) ? "moderate" : "easy";
  const nowHour = new Date().getHours();
  const inferredSessionTime = todayWorkout?.sessionTime || todayWorkout?.scheduledTime || (nowHour < 12 ? "morning" : nowHour < 18 ? "afternoon" : "evening");
  const isTravelNoSession = Boolean(nutritionLayer?.travelMode && (recoveryDay || sessionKind === "rest"));
  const directiveSentence = isTravelNoSession
    ? "Travel day with no session Ã¢â‚¬â€ keep it simple and hit your recovery anchors."
    : hardDay
    ? "Hard session today Ã¢â‚¬â€ lead with carbs, close with protein."
    : strengthDay
    ? "Strength session today Ã¢â‚¬â€ prioritize protein timing and steady carbs."
    : recoveryDay
    ? "Recovery day Ã¢â‚¬â€ keep protein high and appetite decisions simple."
    : "Steady day Ã¢â‚¬â€ balanced meals and consistency win.";
  const locationPermissionGranted = Boolean(localFoodContext?.locationPermissionGranted || savedLocation?.status === "granted");
  const locationUnavailable = !locationPermissionGranted && ["denied", "unavailable"].includes(String(localFoodContext?.locationStatus || savedLocation?.status || "").toLowerCase());
  const showNearbySection = locationPermissionGranted;
  const shoppingDay = Number(favorites?.shoppingDay ?? 0);
  const todayDow = new Date().getDay();
  const showSundayGrocerySection = todayDow === shoppingDay || todayDow === ((shoppingDay + 6) % 7);
  const weeklyNutritionScore = (() => {
    const days = Array.from({ length: 7 }).map((_, idx) => {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - idx);
      return d.toISOString().split("T")[0];
    });
    const onPlan = days.filter((k) => ["high", "partial"].includes(nutritionActualLogs?.[k]?.adherence || "")).length;
    return `${onPlan} of 7 days on plan`;
  })();
  const defaultSupplements = [
    { key: "Creatine", name: "Creatine", defaultTiming: "with breakfast", defaultDose: "5g", product: "Thorne Creatine Monohydrate" },
    { key: "Protein", name: "Protein", defaultTiming: "post-workout", defaultDose: "1 scoop", product: "Transparent Labs 100% Grass-Fed Whey" },
    { key: "Electrolytes", name: "Electrolytes", defaultTiming: "30 min pre-run", defaultDose: "1 serving", product: "LMNT Electrolyte Drink Mix" },
    { key: "Omega-3", name: "Omega-3", defaultTiming: "with lunch", defaultDose: "2 caps", product: "Nordic Naturals Ultimate Omega" },
    { key: "Magnesium", name: "Magnesium", defaultTiming: "before bed", defaultDose: "400mg", product: "DoctorÃ¢â‚¬â„¢s Best High Absorption Magnesium" },
    { key: "Vitamin D3", name: "Vitamin D3", defaultTiming: "with first meal", defaultDose: "1 cap", product: "NOW Vitamin D3 2000 IU" },
  ];
  const allSupplements = [
    ...defaultSupplements,
    ...customSupplementStack.map((s, idx) => ({
      key: `custom_${idx}_${String(s?.name || "supplement").toLowerCase().replace(/\s+/g, "_")}`,
      name: s?.name || "Custom Supplement",
      defaultTiming: s?.timing || "with a meal",
      defaultDose: "1 serving",
      product: s?.product || `${s?.name || "Brand"} (user-selected brand)`,
    })),
  ];
  const dedupSupplements = allSupplements.filter((supp, idx, arr) => idx === arr.findIndex(x => String(x.name).toLowerCase() === String(supp.name).toLowerCase()));
  const supplementRows = dedupSupplements
    .map((supp) => {
      const lower = String(supp.name).toLowerCase();
      if (isTravelNoSession && !["creatine", "magnesium"].some(k => lower.includes(k))) return null;
      if (lower.includes("protein")) {
        if (recoveryDay) return { ...supp, instruction: "1 scoop with dinner only if you're under on food today" };
        if (sessionIntensity === "hard" || strengthDay) return { ...supp, instruction: "2 scoops post-workout if food protein is low" };
        return { ...supp, instruction: "1 scoop post-workout (if needed)" };
      }
      if (lower.includes("electrolyte")) {
        if (sessionIntensity === "hard") return { ...supp, instruction: "1 serving 30 min pre-run and 1 serving post" };
        if (recoveryDay || isTravelNoSession) return null;
        return { ...supp, instruction: "1 serving 30 min pre-run" };
      }
      if (lower.includes("creatine")) return { ...supp, instruction: `5g ${phaseModeLower === "cut" ? "with breakfast to support muscle retention" : "with breakfast"}` };
      if (lower.includes("omega")) return { ...supp, instruction: "2 caps with lunch" };
      if (lower.includes("magnesium")) return { ...supp, instruction: "400mg before bed" };
      if (lower.includes("vitamin d")) return { ...supp, instruction: "1 cap with first meal" };
      return { ...supp, instruction: `${supp.defaultDose} ${supp.defaultTiming}`.trim() };
    })
    .filter(Boolean);
  const supplementInfoByName = Object.fromEntries(supplementRows.map((supp) => [
    supp.name,
    {
      plain: supp.name.toLowerCase().includes("creatine")
        ? "Creatine helps your muscles produce quick energy and recover between hard efforts."
        : supp.name.toLowerCase().includes("protein")
        ? "Protein powder is a convenient way to close protein gaps when meals fall short."
        : supp.name.toLowerCase().includes("electrolyte")
        ? "Electrolytes replace sodium and minerals lost in sweat so pacing and energy stay steadier."
        : supp.name.toLowerCase().includes("omega")
        ? "Omega-3s support general recovery and joint comfort when training load builds."
        : supp.name.toLowerCase().includes("magnesium")
        ? "Magnesium supports relaxation and sleep quality, which improves recovery."
        : supp.name.toLowerCase().includes("vitamin d")
        ? "Vitamin D3 supports immune and bone function, especially if sun exposure is inconsistent."
        : `${supp.name} supports consistency when food/training constraints are high.`,
      why: `Included for your active goals: ${(goals || []).filter(g => g.active).map(g => g.name).slice(0, 2).join(" + ") || "performance consistency"}.`,
      stop: "Reduce or pause if your clinician advises, if labs indicate no need, or if GI side effects persist for more than a week.",
      product: `${supp.product} Ã¢â‚¬â€ Amazon or brand direct.`,
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

  const todayKey = new Date().toISOString().split("T")[0];
  const actualNutritionToday = planDay?.resolved?.nutrition?.actual || nutritionActualLogs?.[todayKey] || normalizeActualNutritionLog({ dateKey: todayKey, feedback: {} });
  const nutritionComparison = planDay?.resolved?.nutrition?.comparison || compareNutritionPrescriptionToActual({
    nutritionPrescription: nutritionLayer,
    actualNutritionLog: actualNutritionToday,
  });
  const nutritionGoalName = goalContext?.primary?.name || "current goal";
  const nutritionProvenance = buildProvenanceText({
    inputs: [
      "today's training demand",
      `your ${nutritionGoalName}`,
      "time of day",
      actualNutritionToday?.loggedAt ? "your logged nutrition today" : null,
    ],
    limitation: actualNutritionToday?.loggedAt ? "" : "Today's intake log is limited.",
  });
  useEffect(() => {
    if (!actualNutritionToday?.loggedAt) return;
    setNutritionCheck({
      status: actualNutritionToday?.quickStatus || "on_track",
      deviationKind: actualNutritionToday?.deviationKind || "followed",
      issue: actualNutritionToday?.issue || "",
      note: actualNutritionToday?.note || "",
    });
    setHydrationOz(Number(actualNutritionToday?.hydration?.oz || 0));
    setHydrationNudgedAt(actualNutritionToday?.hydration?.nudgedAt || null);
    setSupplementTaken(actualNutritionToday?.supplements?.takenMap || {});
  }, [actualNutritionToday?.loggedAt]);
  useEffect(() => {
    const hour = new Date().getHours();
    if (hour < 15 || hydrationPct >= 50 || hydrationNudgedAt || showHydrationNudge) return;
    setShowHydrationNudge(true);
    const nudgedAt = Date.now();
    setHydrationNudgedAt(nudgedAt);
    saveNutritionActualLog(todayKey, { ...nutritionCheck, hydrationOz, hydrationTargetOz, hydrationNudgedAt: nudgedAt });
  }, [hydrationPct, hydrationNudgedAt, showHydrationNudge, todayKey]);
  const requestFridgeMeal = () => {
    const reply = deriveFridgeCoachMealSuggestion({ fridgeInput, dayType });
    setFridgeCoachReply(reply.coachLine || "");
  };
  const logHydration = async (oz = 12) => {
    const nextOz = Math.min(hydrationTargetOz, (hydrationOz || 0) + oz);
    setHydrationOz(nextOz);
    await saveNutritionActualLog(todayKey, { ...nutritionCheck, hydrationOz: nextOz, hydrationTargetOz, hydrationNudgedAt });
  };
  const toggleSupplementTaken = async (name) => {
    const nextTaken = { ...supplementTaken, [name]: !supplementTaken?.[name] };
    setSupplementTaken(nextTaken);
    await saveNutritionActualLog(todayKey, { ...nutritionCheck, hydrationOz, hydrationTargetOz, hydrationNudgedAt, supplementTaken: nextTaken });
  };
  const addCustomSupplement = async () => {
    if (!newSupplementName.trim() || !newSupplementTiming.trim()) return;
    const nextStack = [
      ...(favorites?.supplementStack || []),
      { name: newSupplementName.trim(), timing: newSupplementTiming.trim() },
    ];
    await saveNutritionFavorites({ ...favorites, supplementStack: nextStack });
    setNewSupplementName("");
    setNewSupplementTiming("");
  };
  const removeCustomSupplement = async (name) => {
    const nextStack = (favorites?.supplementStack || []).filter((x) => String(x?.name || "").toLowerCase() !== String(name || "").toLowerCase());
    await saveNutritionFavorites({ ...favorites, supplementStack: nextStack });
  };

  const nutritionTone = buildReviewBadgeTone(nutritionComparison?.adherence || nutritionComparison?.deviationKind);
  const targetTone = buildReviewBadgeTone(sessionIntensity === "hard" ? "progression" : recoveryDay ? "recovery" : "match");
  const comparisonLabel = actualNutritionToday?.loggedAt
    ? `${sanitizeStatusLabel(nutritionComparison?.adherence, "logged")} - ${sanitizeStatusLabel(nutritionComparison?.deviationKind, "matched")}`
    : "Not logged yet";
  const complianceLine = actualNutritionToday?.loggedAt
    ? sanitizeDisplayText(nutritionComparison?.summary || "Nutrition logged.")
    : "Log a quick outcome once the day settles so today's prescription and actual intake stay separated.";
  const fastFallback = locationAwareOrder || (showNearbySection
    ? `${fastest.name}: ${fastest.meal}`
    : nutritionLayer?.travelMode
    ? travelBreakfast[0]
    : "Use your default: protein + carb + fruit + water.");

  return (
    <div className="fi">
      <div className="card card-soft card-action" style={{ marginBottom:"0.8rem", borderColor:C.blue+"28" }}>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", gap:"0.45rem", flexWrap:"wrap", marginBottom:"0.45rem" }}>
          <div>
            <div className="sect-title" style={{ color:C.blue, marginBottom:"0.14rem" }}>TODAY'S NUTRITION TARGET</div>
            <div style={{ fontSize:"0.6rem", color:"#e2e8f0", lineHeight:1.5 }}>{directiveSentence}</div>
          </div>
          <div style={{ display:"flex", gap:"0.28rem", flexWrap:"wrap", justifyContent:"flex-end" }}>
            <span style={{ fontSize:"0.48rem", color:targetTone.color, background:targetTone.bg, padding:"0.16rem 0.42rem", borderRadius:999 }}>{sanitizeStatusLabel(dayType, "today")}</span>
            <span style={{ fontSize:"0.48rem", color:nutritionTone.color, background:nutritionTone.bg, padding:"0.16rem 0.42rem", borderRadius:999 }}>{comparisonLabel}</span>
            <span style={{ fontSize:"0.48rem", color:"#8fa5c8", background:"#0f172a", padding:"0.16rem 0.42rem", borderRadius:999 }}>{phaseMode}</span>
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
              <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.14rem", lineHeight:1.5 }}>{sanitizeDisplayText(todayWorkout?.type || dayType || "session")}</div>
              <div style={{ fontSize:"0.5rem", color:"#8fa5c8", marginTop:"0.12rem", lineHeight:1.5 }}>{macroShiftLine}</div>
            </div>
            <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.45rem 0.5rem" }}>
              <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>PRESCRIPTION BASIS</div>
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
        <div className="sect-title" style={{ color:C.amber, marginBottom:"0.35rem" }}>PRACTICAL MEAL STRUCTURE</div>
        <div style={{ display:"grid", gap:"0.38rem" }}>
          {mealMacroRows.map((meal) => (
            <div key={meal.key} style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.46rem 0.52rem" }}>
              <div style={{ display:"flex", justifyContent:"space-between", gap:"0.4rem", alignItems:"center", flexWrap:"wrap" }}>
                <div style={{ fontSize:"0.58rem", color:"#e2e8f0" }}>{meal.label}</div>
                <div style={{ fontSize:"0.48rem", color:"#8fa5c8" }}>{meal.p}g protein • {meal.c}g carbs • {meal.f}g fat</div>
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
                  : `${store}: ${(groceryHooks?.priorityItems || basket?.items || []).slice(0, 4).join(", ") || "lean protein, fruit, easy carbs, hydration"}`}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom:"0.8rem" }}>
        <div className="sect-title" style={{ color:C.blue, marginBottom:"0.35rem" }}>HYDRATION / SUPPLEMENTS</div>
        <div style={{ display:"grid", gap:"0.42rem" }}>
          <button className="btn" onClick={()=>logHydration(12)} style={{ width:"100%", display:"block", textAlign:"left", borderColor:"#2a3b56", padding:"0.42rem 0.46rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", fontSize:"0.56rem", color:"#dbe7f6", marginBottom:"0.22rem" }}>
              <span>{Math.round(hydrationOz)} oz logged</span>
              <span style={{ color:"#8fa5c8" }}>Target {hydrationTargetOz} oz</span>
            </div>
            <div style={{ width:"100%", height:10, borderRadius:999, background:"#0f172a", border:"1px solid #243752", overflow:"hidden" }}>
              <div style={{ width:`${hydrationPct}%`, height:"100%", background: hydrationPct >= 100 ? C.green : C.blue, transition:"width 180ms ease" }} />
            </div>
            <div style={{ marginTop:"0.2rem", fontSize:"0.5rem", color:"#8fa5c8" }}>Tap to add 12 oz</div>
          </button>
          {supplementRows.length > 0 && (
            <div style={{ display:"grid", gap:"0.3rem" }}>
              {supplementRows.map((supp, i) => (
                <div key={`${supp.name}_${i}`} style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.42rem 0.48rem" }}>
                  <div style={{ display:"grid", gridTemplateColumns:"auto 1fr auto", gap:"0.35rem", alignItems:"center" }}>
                    <button className="btn" onClick={()=>toggleSupplementTaken(supp.name)} style={{ width:24, minWidth:24, height:24, padding:0, borderColor:"#2d435f", color:supplementTaken?.[supp.name] ? C.green : "#64748b", background:"transparent", fontSize:"0.62rem" }}>
                      {supplementTaken?.[supp.name] ? "✓" : ""}
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

      <div className="card" style={{ marginBottom:"0.8rem", borderColor:C.green+"24" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.35rem" }}>QUICK ACTUAL LOGGING</div>
        <div style={{ display:"grid", gap:"0.4rem" }}>
          <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.48rem 0.52rem" }}>
            <div style={{ display:"flex", justifyContent:"space-between", gap:"0.4rem", flexWrap:"wrap", alignItems:"center" }}>
              <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>PRESCRIPTION VS ACTUAL</div>
              <span style={{ fontSize:"0.48rem", color:nutritionTone.color, background:nutritionTone.bg, padding:"0.16rem 0.42rem", borderRadius:999 }}>{comparisonLabel}</span>
            </div>
            <div style={{ fontSize:"0.55rem", color:"#dbe7f6", marginTop:"0.18rem", lineHeight:1.55 }}>{complianceLine}</div>
            {actualNutritionToday?.loggedAt && (
              <div style={{ fontSize:"0.49rem", color:"#8fa5c8", marginTop:"0.16rem", lineHeight:1.5 }}>
                Logged status: {sanitizeStatusLabel(actualNutritionToday?.quickStatus, "unknown")} • Issue: {sanitizeStatusLabel(actualNutritionToday?.issue, "none")}
              </div>
            )}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.3rem" }}>
            {[["on_track","on track"],["decent","decent"],["off_track","off track"]].map(([k,lab]) => (
              <button key={k} className="btn" onClick={()=>setNutritionCheck(prev=>({ ...prev, status:k }))}
                style={{ fontSize:"0.68rem", borderColor:nutritionCheck.status===k?C.blue:"#1e293b", color:nutritionCheck.status===k?C.blue:"#64748b", background:nutritionCheck.status===k?`${C.blue}12`:"transparent" }}>{lab}</button>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"0.3rem" }}>
            {[["followed","followed"],["under_fueled","under"],["over_indulged","over"],["deviated","deviated"]].map(([k,lab]) => (
              <button key={k} className="btn" onClick={()=>setNutritionCheck(prev=>({
                ...prev,
                deviationKind: k,
                status: k === "followed" ? "on_track" : k === "deviated" ? "decent" : "off_track",
                issue: k === "followed" ? "" : k === "under_fueled" ? "hunger" : k === "over_indulged" ? "overate" : prev.issue,
              }))}
                style={{ fontSize:"0.58rem", borderColor:nutritionCheck.deviationKind===k?C.green:"#1e293b", color:nutritionCheck.deviationKind===k?C.green:"#64748b", background:nutritionCheck.deviationKind===k?`${C.green}12`:"transparent" }}>{lab}</button>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"0.3rem" }}>
            {[["","none"],["hunger","hunger"],["convenience","convenience"],["travel","travel"]].map(([k,lab]) => (
              <button key={lab} className="btn" onClick={()=>setNutritionCheck(prev=>({ ...prev, issue:k }))}
                style={{ fontSize:"0.56rem", borderColor:(nutritionCheck.issue||"")===k?C.amber:"#1e293b", color:(nutritionCheck.issue||"")===k?C.amber:"#64748b", background:(nutritionCheck.issue||"")===k?`${C.amber}12`:"transparent" }}>{lab}</button>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr auto", gap:"0.35rem" }}>
            <input value={nutritionCheck.note || ""} onChange={e=>setNutritionCheck(prev=>({ ...prev, note:e.target.value }))} placeholder="Quick note (optional)" />
            <button className="btn btn-primary" onClick={()=>saveNutritionActualLog(todayKey, { ...nutritionCheck, hydrationOz, hydrationTargetOz, hydrationNudgedAt })} style={{ fontSize:"0.55rem" }}>SAVE</button>
          </div>
          <div style={{ fontSize:"0.52rem", color:"#8fa5c8" }}>Weekly compliance: {weeklyNutritionScore}</div>
        </div>
      </div>
    </div>
  );
}

// Ã¢â€â‚¬Ã¢â€â‚¬ COACH TAB (REDESIGNED) Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
function CoachTab({ planDay = null, logs, dailyCheckins, currentWeek, todayWorkout: legacyTodayWorkout, bodyweights, personalization, athleteProfile = null, momentum, arbitration, expectations, memoryInsights, compoundingCoachMemory, recalibration, strengthLayer, patterns, proactiveTriggers, onApplyTrigger, learningLayer, salvageLayer, validationLayer, optimizationLayer, failureMode, planComposer, nutritionLayer: legacyNutritionLayer, realWorldNutrition: legacyRealWorldNutrition, nutritionActualLogs = {}, setPersonalization, coachActions, setCoachActions, coachPlanAdjustments, setCoachPlanAdjustments, weekNotes, setWeekNotes, planAlerts, setPlanAlerts, onPersist }) {
  const todayWorkout = planDay?.resolved?.training || legacyTodayWorkout;
  const goals = athleteProfile?.goals || [];
  const goalState = athleteProfile?.goalState || {};
  const userProfile = athleteProfile?.userProfile || {};
  const nutritionLayer = planDay?.resolved?.nutrition?.prescription || legacyNutritionLayer;
  const realWorldNutrition = planDay?.resolved?.nutrition?.reality || legacyRealWorldNutrition;
  const planDayWeek = planDay?.week || null;
  const canonicalCoachRecovery = planDay?.resolved?.recovery || null;
  const todayKey = new Date().toISOString().split("T")[0];
  const nutritionActual = planDay?.resolved?.nutrition?.actual || nutritionActualLogs?.[todayKey] || normalizeActualNutritionLog({ dateKey: todayKey, feedback: {} });
  const nutritionComparison = planDay?.resolved?.nutrition?.comparison || compareNutritionPrescriptionToActual({
    nutritionPrescription: nutritionLayer,
    actualNutritionLog: nutritionActual,
  });
  const coachPhase = planDayWeek?.phase || todayWorkout?.week?.phase || WEEKS[(currentWeek - 1) % WEEKS.length]?.phase || "BASE";
  const coachWeekFocus = planDayWeek?.weeklyIntent?.focus || planDayWeek?.planWeek?.weeklyIntent?.focus || "";
  const coachWeekSummary = planDayWeek?.summary || planDayWeek?.planWeek?.summary || "";
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingCursor, setStreamingCursor] = useState(false);
  const [pendingActions, setPendingActions] = useState([]);
  const [memoryDraft, setMemoryDraft] = useState({
    failurePatterns: (personalization.coachMemory.failurePatterns || []).join(", "),
    commonBarriers: (personalization.coachMemory.commonBarriers || []).join(", "),
    simplicityVsVariety: personalization.coachMemory.simplicityVsVariety || "",
    preferredFoodPatterns: (personalization.coachMemory.preferredFoodPatterns || []).join(", "),
  });
  const [apiKey, setApiKey] = useState(typeof window !== "undefined"
    ? resolveStoredAiApiKey({ safeStorageGet, storageLike: localStorage })
    : "");
  const [coachMode, setCoachMode] = useState("auto");
  const [feedbackLog, setFeedbackLog] = useState(() => {
    try { return JSON.parse(safeStorageGet(localStorage, "coach_feedback_log", "[]") || "[]"); } catch { return []; }
  });
  const [presetDraft, setPresetDraft] = useState({
    Home: { equipment: (personalization?.environmentConfig?.presets?.Home?.equipment || []).join(", "), time: personalization?.environmentConfig?.presets?.Home?.time || "30" },
    Gym: { equipment: (personalization?.environmentConfig?.presets?.Gym?.equipment || []).join(", "), time: personalization?.environmentConfig?.presets?.Gym?.time || "45+" },
    Travel: { equipment: (personalization?.environmentConfig?.presets?.Travel?.equipment || []).join(", "), time: personalization?.environmentConfig?.presets?.Travel?.time || "20" },
  });
  const bottomRef = useRef(null);
  useEffect(() => {
    safeStorageSet(localStorage, "coach_feedback_log", JSON.stringify(feedbackLog.slice(0, 100)));
  }, [feedbackLog]);

  useEffect(() => {
    const packet = deterministicCoachPacket({ input: "status", todayWorkout, currentWeek, logs, bodyweights, personalization, learning: learningLayer, salvage: salvageLayer, planComposer, optimizationLayer, failureMode, momentum, strengthLayer, nutritionLayer, nutritionActual, nutritionComparison, arbitration, expectations, memoryInsights, coachMemoryContext: compoundingCoachMemory, realWorldNutrition, recalibration });
    validateDeterministicCoachPacketInvariant(packet, "deterministicCoachPacket.status");
    setMessages([{
      role:"assistant",
      text: packet?.coachBrief || packet?.recommendations?.[0] || packet?.notices?.[0] || "Coach ready.",
      source: "deterministic",
      ts: Date.now(),
      helpful: null,
    }]);
  }, []);

  const commitAction = async (action) => {
    const commitResult = coordinateCoachActionCommit({
      action,
      runtime: { adjustments: coachPlanAdjustments, weekNotes, planAlerts, personalization },
      currentWeek,
      todayWorkout,
      mergePersonalization,
      buildInjuryRuleResult,
      existingCoachActions: coachActions,
    });
    if (!commitResult.ok) {
      setMessages((prev) => [...prev, {
        role: "assistant",
        text: commitResult.ui.message,
        source: "deterministic",
        ts: Date.now(),
        helpful: null,
      }].slice(-20));
      return;
    }
    const mutation = commitResult.mutation;
    const nextActions = commitResult.nextActions;
    setCoachActions(nextActions);
    setCoachPlanAdjustments(mutation.adjustments);
    setWeekNotes(mutation.weekNotes);
    setPlanAlerts(mutation.planAlerts);
    setPersonalization(mutation.personalization);
    await onPersist(mutation.personalization, nextActions, mutation.adjustments, mutation.weekNotes, mutation.planAlerts);
  };

  const getSessionContextPrompt = () => {
    const activeGoals = (arbitration?.priorityStack?.ordered || []).filter(Boolean);
    const primaryGoal = activeGoals[0] || goalState?.primaryGoal || "Consistency";
    const secondaryGoals = activeGoals.slice(1, 4).join(", ") || "None listed";
    const deadline = goalState?.deadline || "";
    const daysRemaining = deadline ? Math.max(0, Math.ceil((new Date(deadline) - new Date()) / 86400000)) : "N/A";
    const todayDetails = todayWorkout?.run
      ? `${todayWorkout.run.t || "Run"} Ã‚Â· ${todayWorkout.run.d || "target pending"}`
      : `${todayWorkout?.type || "session"} Ã‚Â· ${todayWorkout?.strengthDuration || todayWorkout?.fallback || "as prescribed"}`;
    const injury = `${personalization?.injuryPainState?.level || "none"} (${personalization?.injuryPainState?.area || "Achilles"})`;
    const last5 = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0])).slice(-5).map(([,l]) => `${l?.type || "session"} Ã‚Â· feel ${l?.feel || 3} Ã‚Â· ${l?.checkin?.status || "not_logged"}`).join(" | ") || "No recent sessions";
    const last14 = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0])).slice(-14);
    const done14 = last14.filter(([,l]) => ["completed_as_planned","completed_modified","partial_completed"].includes(l?.checkin?.status)).length;
    const consistency = `${done14} of ${Math.max(1, last14.length)} sessions`;
    const bw = (bodyweights || []).slice(-6).map(x => Number(x?.w)).filter(Number.isFinite);
    const weightTrend = bw.length < 2 ? "stable" : bw[bw.length - 1] > bw[0] + 0.3 ? "trending up" : bw[bw.length - 1] < bw[0] - 0.3 ? "trending down" : "stable";
    const env = resolveEnvironmentSelection({ personalization, todayKey: new Date().toISOString().split("T")[0], currentWeek });
    const envMode = String(env?.mode || "Home").toLowerCase();
    const fitnessLevel = personalization?.fitnessSignals?.fitnessLevel || personalization?.profile?.fitnessLevel || "unknown";
    const garminToday = personalization?.connectedDevices?.garmin?.dailySummaries?.[new Date().toISOString().split("T")[0]] || {};
    const garminReadiness = Number(garminToday?.trainingReadinessScore ?? personalization?.connectedDevices?.garmin?.trainingReadinessScore ?? 0) || "N/A";
    const garminStress = garminToday?.stressScore ?? "N/A";
    const garminSleep = garminToday?.sleepScore ?? "N/A";
    const memoryLine = [
      (personalization?.coachMemory?.failurePatterns || []).slice(0, 1).join(", "),
      (personalization?.coachMemory?.commonBarriers || []).slice(0, 1).join(", "),
      personalization?.coachMemory?.simplicityVsVariety || ""
    ].filter(Boolean).join(" | ") || "No memory fields yet";
    const currentMode = personalization?.injuryPainState?.level !== "none" ? "recovery" : failureMode?.mode === "chaotic" ? "reduced_load" : "locked_in";
    return `You are a personal coach inside a fitness app. You are direct, specific, and never generic. You do not motivate Ã¢â‚¬â€ you decide and explain. You speak like a coach who knows this person well, not like a customer service bot.

Current user state:
- Goals: ${primaryGoal} | ${secondaryGoals}
- Phase: ${coachPhase} Ã‚Â· Week ${currentWeek}
- Weekly intent: ${coachWeekFocus || coachWeekSummary || "Current week plan"}
- Days to race/deadline: ${daysRemaining}
- Today's prescription: ${todayWorkout?.label || "Session"} Ã‚Â· ${todayDetails}
- Achilles status: ${injury}
- Last 5 sessions: ${last5}
- Consistency last 2 weeks: ${consistency}
- Current weight trend: ${weightTrend}
- Environment today: ${envMode}
- Fitness level: ${fitnessLevel}
- Garmin readiness: ${garminReadiness}
- Garmin stress/sleep: ${garminStress}/${garminSleep}
- Coach memory: ${memoryLine}
- Current mode: ${currentMode}

Rules for every response:
- Maximum 4 sentences unless the question requires more
- Never use bullet points in conversational responses
- Never say "great question," "I understand," "based on your data," or "it sounds like"
- Always end with one specific action or decision
- If the question is about injury: give a protocol, not a referral
- If the question is about missing a session: give a forward direction, not reassurance
- Reference specific session names, dates, and numbers from context Ã¢â‚¬â€ never speak in generalities`;
  };

  const buildQuickPromptMessage = (label) => {
    const dated = Object.entries(logs || {}).sort((a,b)=>a[0].localeCompare(b[0]));
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const yKey = yesterday.toISOString().split("T")[0];
    const y = logs?.[yKey];
    const last3 = dated.slice(-3).map(([d,l]) => `${d}: ${l?.type || "session"} feel ${l?.feel || 3}`).join(" | ");
    const completion14 = dated.slice(-14).filter(([,l]) => ["completed_as_planned","completed_modified","partial_completed"].includes(l?.checkin?.status)).length;
    const total14 = Math.max(1, dated.slice(-14).length);
    const map = {
      "My Achilles feels tight": `${label}. Include today's session type (${todayWorkout?.type || "unknown"}) and injury history (${(compoundingCoachMemory?.injuryHistory || []).slice(0,2).join("; ") || "none"}).`,
      "I missed yesterday": `${label}. Yesterday was ${y?.type || "unknown"} on ${yKey}. Current week completion: ${completion14}/${total14}.`,
      "I'm traveling today": `${label}. Travel preset is active when needed. Today's prescription: ${todayWorkout?.label || "session"}.`,
      "I feel amazing this week": `${label}. Last 3 sessions: ${last3 || "none"}. Current phase: ${coachPhase}.`,
      "I slept badly": `${label}. Today's session type: ${todayWorkout?.type || "unknown"}. Readiness context: energy ${personalization?.trainingState?.fatigueScore || "n/a"}.`,
      "I want to push harder": `${label}. Phase ${coachPhase}, days to goal ${goalState?.deadline ? Math.max(0, Math.ceil((new Date(goalState.deadline) - new Date()) / 86400000)) : "N/A"}, last feels ${(dated.slice(-5).map(([,l]) => l?.feel || 3).join(", ") || "none")}.`,
    };
    return map[label] || label;
  };

  const streamCoachResponse = async ({ userMsg, history }) => {
    const deterministic = deterministicCoachPacket({ input: userMsg, todayWorkout, currentWeek, logs, bodyweights, personalization, learning: learningLayer, salvage: salvageLayer, planComposer, optimizationLayer, failureMode, momentum, strengthLayer, nutritionLayer, nutritionActual, nutritionComparison, arbitration, expectations, memoryInsights, coachMemoryContext: compoundingCoachMemory, realWorldNutrition, recalibration });
    validateDeterministicCoachPacketInvariant(deterministic, "deterministicCoachPacket.chat");
    const coachPacketArgs = {
      dateKey: todayKey,
      currentWeek,
      canonicalGoalState: goalState,
      canonicalUserProfile: userProfile,
      goals,
      planDay,
      planWeek: planDayWeek?.planWeek || null,
      logs,
      dailyCheckins,
      nutritionActualLogs,
      bodyweights,
      momentum,
      expectations,
      strengthLayer,
      optimizationLayer,
      failureMode,
      readiness: canonicalCoachRecovery,
      nutritionComparison,
      arbitration,
      memoryInsights,
      coachMemoryContext: compoundingCoachMemory,
      weekNotes,
      planAlerts,
    };
    validateAiPacketInvariant(coachPacketArgs, "runCoachChatRuntime");
    return runCoachChatRuntime({
      apiKey,
      coachMode,
      userMsg,
      history,
      deterministicText: deterministic?.coachBrief || deterministic?.recommendations?.[0] || deterministic?.notices?.[0] || "Coach update ready.",
      packetArgs: coachPacketArgs,
      fetchImpl: fetch,
      onText: (text) => setStreamingText(text),
    });
  };

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages, pendingActions, loading]);

  const persistReadinessPromptSignal = async (label) => {
    const updatedAt = Date.now();
    const signalMap = {
      "I feel amazing this week": { state: "push", label, source: "coach_quick_prompt", updatedAt },
      "I want to push harder": { state: "push", label, source: "coach_quick_prompt", updatedAt },
      "I slept badly": { state: "recover", label, source: "coach_quick_prompt", updatedAt },
    };
    const nextSignal = signalMap[label];
    if (!nextSignal) return;
    const signalProvenance = buildAdjustmentProvenance({
      actor: PROVENANCE_ACTORS.user,
      trigger: "coach_quick_prompt",
      mutationType: "readiness_signal",
      revisionReason: label,
      sourceInputs: ["CoachTab", "quick_readiness_prompt"],
      timestamp: updatedAt,
      details: {
        dateKey: todayKey,
        state: nextSignal.state,
      },
    });
    const nextAdjustments = {
      ...coachPlanAdjustments,
      extra: {
        ...(coachPlanAdjustments?.extra || {}),
        readinessSignals: {
          ...(coachPlanAdjustments?.extra?.readinessSignals || {}),
          [todayKey]: {
            ...nextSignal,
            provenance: signalProvenance,
          },
        },
      },
    };
    setCoachPlanAdjustments(nextAdjustments);
    await onPersist(personalization, coachActions, nextAdjustments, weekNotes, planAlerts);
  };

  const send = async (preset) => {
    const prepared = preset ? buildQuickPromptMessage(preset) : input;
    const userMsg = (prepared || "").trim();
    if (!userMsg || loading) return;
    setInput("");
    setLoading(true);
    setStreamingText("");
    setStreamingCursor(true);
    if (preset) await persistReadinessPromptSignal(preset);
    const ts = Date.now();
    const nextHistory = [...messages, { role:"user", text:userMsg, ts }].slice(-20);
    setMessages(nextHistory);
    const historyForModel = nextHistory.filter(m => m.role === "user" || m.role === "assistant").slice(-20).map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text || m.response || "" }));
    const streamed = await streamCoachResponse({ userMsg, history: historyForModel });
    setMessages(m => [...m, { role:"assistant", text: streamed.text, source: streamed.source, ts: Date.now(), helpful: null }].slice(-20));
    setLoading(false);
    setStreamingCursor(false);
    setStreamingText("");
  };

  const quickPrompts = ["My Achilles feels tight", "I missed yesterday", "I'm traveling today", "I feel amazing this week", "I slept badly", "I want to push harder"];

  const sundayArchive = personalization?.coachMemory?.sundayReviews || [];
  const readinessPromptSignal = coachPlanAdjustments?.extra?.readinessSignals?.[todayKey] || null;
  const coachReadiness = canonicalCoachRecovery || deriveDeterministicReadinessState({
    todayKey,
    checkin: dailyCheckins?.[todayKey] || logs?.[todayKey]?.checkin || {},
    promptSignal: readinessPromptSignal,
    workout: todayWorkout,
    logs,
    dailyCheckins,
    personalization,
    momentum,
    userProfile: userProfile || {},
  });
  const readinessMetrics = coachReadiness?.metrics || {};
  const env = resolveEnvironmentSelection({ personalization, todayKey, currentWeek });
  const dayTypeMap = { "long-run":"long", long:"long", "hard-run":"tempo", hard:"tempo", "easy-run":"easy", easy:"easy", "strength+prehab":"strength", strength:"strength", "run+strength":"hybrid", conditioning:"hybrid", otf:"hybrid", recovery:"recovery", rest:"recovery" };
  const dayType = dayTypeMap[todayWorkout?.type] || "hybrid";
  const weekState = failureMode?.mode === "chaotic" ? "chaotic" : momentum?.fatigueNotes >= 2 ? "fatigued" : "normal";
  const adherenceTrend = momentum?.completionRate >= 0.72 ? "stable" : momentum?.completionRate >= 0.5 ? "mixed" : "slipping";
  const fatigueSignal = (personalization?.trainingState?.fatigueScore || 1) >= 4 || momentum?.fatigueNotes >= 2;
  const injuryFlag = personalization?.injuryPainState?.level || "none";
  const recoveryAdjustedToday = coachReadiness?.state === "recovery" || todayWorkout?.type === "rest" || todayWorkout?.type === "recovery" || /recovery/i.test(String(todayWorkout?.label || ""));
  const reducedLoadToday = coachReadiness?.state === "reduced_load" || Boolean(todayWorkout?.minDay);
  const progressionReadyToday = coachReadiness?.state === "progression" || /progression-ready/i.test(String(todayWorkout?.label || ""));
  const goalPriority = arbitration?.priorityStack?.primary || "Consistency";
  const recentEntries = Array.from(new Set([...(Object.keys(logs || {})), ...(Object.keys(dailyCheckins || {}))]))
    .sort((a, b) => a.localeCompare(b))
    .slice(-7)
    .map((dateKey) => {
      const log = logs?.[dateKey] || {};
      return [dateKey, { ...log, checkin: { ...(log?.checkin || {}), ...(dailyCheckins?.[dateKey] || {}) } }];
    });
  const recentLogCount = recentEntries.length;
  const completedStatuses = new Set(["completed_as_planned", "completed_modified", "partial_completed"]);
  const recentSessionLabels = recentEntries
    .map(([, entry]) => entry?.type || entry?.label || "")
    .filter(Boolean)
    .slice(-3);
  const recentCountableStatuses = recentEntries
    .map(([dateKey, entry]) => resolveEffectiveStatus(entry?.checkin, dateKey))
    .filter((status) => status !== "not_logged" && status !== "not_logged_grace");
  const recentCompletedCount = recentCountableStatuses.filter((status) => completedStatuses.has(status)).length;
  const recentSkippedCount = recentCountableStatuses.filter((status) => status === "skipped").length;
  const recentModifiedCount = recentCountableStatuses.filter((status) => status === "completed_modified" || status === "partial_completed").length;
  const recentAdherence = readinessMetrics.countableCount
    ? (Number(readinessMetrics.completedCount || 0) / Math.max(1, Number(readinessMetrics.countableCount || 0)))
    : recentCountableStatuses.length
    ? (recentCompletedCount / recentCountableStatuses.length)
    : 0;
  const latestCompletedEntry = [...recentEntries].reverse().find(([dateKey, entry]) => completedStatuses.has(resolveEffectiveStatus(entry?.checkin, dateKey)));
  const latestCheckinEntry = [...recentEntries].reverse().find(([, entry]) => hasReadinessInputs(entry?.checkin) || entry?.checkin?.status && entry?.checkin?.status !== "not_logged");
  const latestCheckin = latestCheckinEntry?.[1]?.checkin || {};
  const latestFeel = String(latestCheckin?.sessionFeel || latestCheckinEntry?.[1]?.feel || "").toLowerCase();
  const latestSleep = Number(latestCheckin?.readiness?.sleep || 0);
  const latestStress = Number(latestCheckin?.readiness?.stress || 0);
  const latestSoreness = Number(latestCheckin?.readiness?.soreness || 0);
  const lowRecoverySignal = (latestSleep > 0 && latestSleep <= 2) || latestStress >= 4 || latestSoreness >= 4 || latestFeel === "harder_than_expected";
  const highRecoverySignal = latestSleep >= 4 && latestStress > 0 && latestStress <= 2 && latestSoreness > 0 && latestSoreness <= 2 && latestFeel !== "harder_than_expected";
  const latestCompletedLabel = latestCompletedEntry?.[1]?.type || latestCompletedEntry?.[1]?.label || "recent session";
  const todaySessionLabel = todayWorkout?.label || todayWorkout?.type || "today's session";
  const readinessEvidence = joinHumanList((coachReadiness?.factors || []).slice(0, 2));
  const veryLowConsistency = (Number(readinessMetrics.consistencyRatio || 0) > 0 && Number(readinessMetrics.consistencyRatio || 0) < 0.45) || recentSkippedCount >= 3;
  const feelDescriptor = latestFeel === "easier_than_expected"
    ? "easier than expected"
    : latestFeel === "harder_than_expected"
    ? "harder than expected"
    : latestFeel
    ? "steady"
    : "not recently logged";

  const coachDecisionMode = (() => {
    if (coachReadiness?.state === "recovery" || recoveryAdjustedToday) return "Protect";
    if (injuryFlag !== "none" || fatigueSignal) return "Protect";
    if (coachReadiness?.state === "reduced_load" || reducedLoadToday) return veryLowConsistency ? "Rebuild" : "Simplify";
    if (weekState === "chaotic" || env.time === "20" || adherenceTrend === "slipping") return "Simplify";
    if (momentum?.logGapDays >= 4 || recentLogCount <= 2 || recentAdherence < 0.55) return "Rebuild";
    if (coachReadiness?.state === "progression" || (progressionReadyToday && (momentum?.score || 0) >= 60 && weekState === "normal" && env.time !== "20")) return "Push";
    if ((momentum?.score || 0) >= 74 && weekState === "normal" && env.time !== "20") return "Push";
    return "Hold";
  })();

  const coachDecision = (() => {
    const dayLabel = dayType === "tempo" ? "quality run" : dayType === "long" ? "long-run" : dayType === "easy" ? "easy run" : dayType === "strength" ? "strength" : dayType === "recovery" ? "recovery" : "hybrid";
    if (coachDecisionMode === "Protect") return {
      stance: `Do the condensed ${dayLabel} version today and keep intensity controlled.`,
      why: `Recovery signals are elevated${readinessEvidence ? ` because ${readinessEvidence}` : ""}, so we protect consistency while keeping ${goalPriority} on track.`,
      watch: "I am watching pain and session feel after this workout.",
      options: [
        { label: "Do condensed version", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 10, reason: "protect_mode" } }, primary: true },
        { label: "Move to tomorrow", action: { type: COACH_TOOL_ACTIONS.MOVE_LONG_RUN, payload: { days: 1, reason: "protect_shift" } } }
      ]
    };
    if (coachDecisionMode === "Simplify") return {
      stance: `Keep this simple: complete the short ${dayLabel} version.`,
      why: coachReadiness?.state === "reduced_load"
        ? `Readiness says control the day${readinessEvidence ? ` because ${readinessEvidence}` : ""}.`
        : `Time and adherence say simplify now, then rebuild consistency.`,
      watch: "I am watching completion rate over the next 3 days.",
      options: [
        { label: "Do condensed version", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 12, reason: "simplify_mode" } }, primary: true },
        { label: "Simplify week", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 15, reason: "simplify_week" } } }
      ]
    };
    if (coachDecisionMode === "Rebuild") return {
      stance: `Take the short version of the ${dayLabel} session and rebuild rhythm first.`,
      why: `Recent execution dipped, so we rebuild frequency before adding load${readinessEvidence ? ` while respecting ${readinessEvidence}` : ""}.`,
      watch: "I am watching whether you can stack 2-3 clean sessions.",
      options: [
        { label: "Do condensed version", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 15, reason: "rebuild_mode" } }, primary: true },
        { label: "Simplify week", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 18, reason: "rebuild_week" } } }
      ]
    };
    if (coachDecisionMode === "Push") return {
      stance: `Keep the full ${dayLabel} session and add one small progression.`,
      why: `Stability is strong enough to push while still protecting recovery${readinessEvidence ? ` because ${readinessEvidence}` : ""}.`,
      watch: "I am watching session quality and next-day fatigue.",
      options: [
        { label: "Keep full session", action: null, primary: true },
        { label: "Push slightly", action: { type: COACH_TOOL_ACTIONS.PROGRESS_STRENGTH_EMPHASIS, payload: { weeks: 1, reason: "push_mode" } } }
      ]
    };
    return {
      stance: `Keep the full ${dayLabel} session as written.`,
      why: `Current signals support staying steady and executing cleanly${readinessEvidence ? ` because ${readinessEvidence}` : ""}.`,
      watch: "I am watching consistency and workout quality this week.",
      options: [
        { label: "Keep full session", action: null, primary: true },
        { label: "Do condensed version", action: { type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME, payload: { pct: 8, reason: "hold_condense" } } }
      ]
    };
  })();
  const coachSnapshot = (() => {
    const recentNames = recentSessionLabels.length ? recentSessionLabels.join(", ") : "no recent workouts logged";
    const adherenceLine = recentCountableStatuses.length
      ? `${recentCompletedCount}/${recentCountableStatuses.length} recent logged sessions were completed`
      : "recent adherence data is limited";
    const recoveryLine = coachReadiness?.recoveryLine
      ? coachReadiness.recoveryLine.replace(/^Recovery recommendation:\s*/i, "").trim()
      : lowRecoverySignal
      ? `latest recovery check-in is strained (sleep ${latestSleep || "-"}, stress ${latestStress || "-"}, soreness ${latestSoreness || "-"})`
      : highRecoverySignal
      ? `latest recovery check-in is supportive (sleep ${latestSleep || "-"}, stress ${latestStress || "-"}, soreness ${latestSoreness || "-"})`
      : `latest session felt ${feelDescriptor}`;

    let watching = "";
    let doToday = "";
    let noticed = "";

    if (coachDecisionMode === "Protect") {
      watching = `Watching recovery after ${latestCompletedLabel}: ${recoveryLine}.`;
      doToday = `Do the shortest controlled version of ${todaySessionLabel}; stop the moment pain or session feel worsens.`;
      noticed = coachReadiness?.userVisibleLine || (recentModifiedCount > 0
        ? `You kept training alive with ${recentModifiedCount} modified session${recentModifiedCount > 1 ? "s" : ""}, but recovery is the limiter right now.`
        : `Recent work (${recentNames}) stacked stress faster than recovery caught up.`);
    } else if (coachDecisionMode === "Simplify") {
      watching = `Watching whether the next 72 hours turn ${adherenceLine} into a cleaner rhythm.`;
      doToday = `Strip ${todaySessionLabel} down to the first meaningful block and log it immediately when finished.`;
      noticed = coachReadiness?.userVisibleLine || (recentSkippedCount > 0
        ? `You skipped ${recentSkippedCount} recent session${recentSkippedCount > 1 ? "s" : ""}; simplicity is more useful than adding load.`
        : `Execution has been mixed, so reducing friction matters more than perfect programming this week.`);
    } else if (coachDecisionMode === "Rebuild") {
      watching = `Watching whether you can stack the next 2 sessions after ${recentNames}.`;
      doToday = `Treat ${todaySessionLabel} as a rebuild rep: show up, finish the first block, and bank momentum.`;
      noticed = `Recent adherence is ${Math.round(recentAdherence * 100)}%, so the priority is rebuilding frequency before intensity.`;
    } else if (coachDecisionMode === "Push") {
      watching = `Watching whether today's quality stays smooth and tomorrow's recovery still looks normal after ${latestCompletedLabel}.`;
      doToday = `Keep the full ${todaySessionLabel} and add one small progression only if the first half feels controlled.`;
      noticed = coachReadiness?.userVisibleLine || `You are coming in off ${adherenceLine}, and the last session felt ${feelDescriptor}.`;
    } else {
      watching = `Watching for stable recovery and clean execution across ${recentNames}.`;
      doToday = `Run ${todaySessionLabel} as written and keep the effort boringly consistent.`;
      noticed = coachReadiness?.userVisibleLine || (lowRecoverySignal
        ? `You are still carrying some recovery drag, but not enough to force a full pullback.`
        : `This week looks steady: ${adherenceLine}, with no strong signal to either push or cut back.`);
    }

    return { watch: watching, doToday, noticed };
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
      setMessages(m => [...m, { role:"assistant", text:"Staying with the full plan. Execute cleanly and log it.", source:"deterministic", ts: Date.now(), helpful: null }].slice(-20));
      setPendingActions([]);
      return;
    }
    await commitAction({ ...opt.action, reason: opt.action.payload?.reason || "coach_decision" });
    setPendingActions([]);
    setMessages(m => [...m, { role:"assistant", text:"Decision applied. Execute this version today.", source:"deterministic", ts: Date.now(), helpful: null }].slice(-20));
  };
  const weeklyNotice = sundayArchive[0]?.paragraph
    || patterns?.observations?.[0]?.msg
    || (momentum?.completionRate >= 0.72 ? "Consistency is trending up this week." : "Execution has been mixed this week.");
  const coachProvenance = buildProvenanceText({
    inputs: [
      goalPriority ? "your current goal priority" : null,
      recentEntries.length ? "recent workout logs" : null,
      recentCountableStatuses.length ? "adherence trend" : null,
      readinessMetrics?.hardSessions7d ? "recent intensity load" : null,
      latestCheckinEntry ? "latest recovery check-in" : null,
    ],
    limitation: latestCheckinEntry ? "" : "Recovery input is limited right now.",
  });
  const formatCoachResponseSource = (source = "") => {
    const normalized = String(source || "").toLowerCase();
    if (normalized === "deterministic") return "Coach engine";
    if (normalized === "deterministic-fallback") return "Coach engine fallback";
    if (normalized === "llm-stream") return "AI draft from app context";
    return normalized ? normalized.replace(/_/g, " ") : "";
  };
  const latestAssistantMessage = [...messages].reverse().find((message) => message.role === "assistant") || null;
  const coachTrust = buildTrustSummary({
    explicitUserInput: Boolean(latestCheckinEntry || readinessPromptSignal),
    loggedActuals: Boolean(recentCountableStatuses.length || Object.keys(nutritionActualLogs || {}).length),
    deviceData: Boolean((Number(latestSleep) > 0) || (Number(personalization?.connectedDevices?.garmin?.trainingReadinessScore || 0) > 0)),
    inferredHeuristics: true,
    limitation: latestCheckinEntry ? "" : "Recovery input is limited right now.",
    stale: Boolean(!latestCheckinEntry && recentCountableStatuses.length === 0),
  });
  const decisionTone = buildReviewBadgeTone(
    coachDecisionMode === "Protect"
      ? "recovery"
      : coachDecisionMode === "Simplify" || coachDecisionMode === "Rebuild"
      ? "changed"
      : coachDecisionMode === "Push"
      ? "progression"
      : "match"
  );
  const coachTrustTone = buildReviewBadgeTone(
    coachTrust.level === "grounded" ? "match" : coachTrust.level === "partial" ? "changed" : "recovery"
  );
  const boundaryLine = "Coach can recommend and prepare accepted actions, but state only changes when you explicitly apply a recommendation.";
  const recentAcceptedAction = (coachActions || []).find((action) => action?.acceptedBy) || null;

  return (
    <div className="fi" style={{ display:"grid", gap:"0.75rem" }}>
      <div className="card card-strong card-hero" style={{ borderColor:C.blue+"38" }}>
        <div style={{ display:"flex", justifyContent:"space-between", gap:"0.45rem", flexWrap:"wrap", alignItems:"flex-start", marginBottom:"0.35rem" }}>
          <div>
            <div className="sect-title" style={{ color:C.blue, marginBottom:"0.16rem" }}>COACH SUMMARY</div>
            <div style={{ fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.55 }}>{coachProvenance}</div>
          </div>
          <div style={{ display:"flex", gap:"0.28rem", flexWrap:"wrap", justifyContent:"flex-end" }}>
            <span style={{ fontSize:"0.48rem", color:decisionTone.color, background:decisionTone.bg, padding:"0.16rem 0.42rem", borderRadius:999 }}>{coachDecisionMode}</span>
            <span style={{ fontSize:"0.48rem", color:"#8fa5c8", background:"#0f172a", padding:"0.16rem 0.42rem", borderRadius:999 }}>{coachReadiness?.state ? sanitizeStatusLabel(coachReadiness.state, "steady") : "steady"}</span>
            <span style={{ fontSize:"0.48rem", color:coachTrustTone.color, background:coachTrustTone.bg, padding:"0.16rem 0.42rem", borderRadius:999 }}>{coachTrust.label}</span>
          </div>
        </div>
        <div className="coach-copy" style={{ display:"grid", gap:"0.22rem", fontSize:"0.61rem", lineHeight:1.65 }}>
          <div><span style={{ color:"#94a3b8" }}>Watching:</span> {coachSnapshot.watch}</div>
          <div><span style={{ color:"#94a3b8" }}>Recommendation:</span> {coachDecision.stance}</div>
          <div><span style={{ color:"#94a3b8" }}>Why:</span> {coachDecision.why}</div>
          <div><span style={{ color:"#94a3b8" }}>Next:</span> {coachSnapshot.doToday}</div>
        </div>
        <div style={{ marginTop:"0.22rem", fontSize:"0.49rem", color:"#8fa5c8", lineHeight:1.5 }}>{coachTrust.summary}</div>
        <div style={{ marginTop:"0.38rem", fontSize:"0.5rem", color:"#8fa5c8", lineHeight:1.55 }}>{boundaryLine}</div>
      </div>

      <div className="card card-action" style={{ borderColor:C.green+"30" }}>
        <div className="sect-title" style={{ color:C.green, marginBottom:"0.32rem" }}>SUGGESTED ACTIONS</div>
        <div style={{ display:"grid", gap:"0.38rem" }}>
          <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.46rem 0.5rem" }}>
            <div style={{ fontSize:"0.58rem", color:"#e2e8f0", lineHeight:1.55 }}>{coachDecision.stance}</div>
            <div style={{ fontSize:"0.52rem", color:"#8fa5c8", marginTop:"0.12rem", lineHeight:1.5 }}>{coachDecision.watch}</div>
          </div>
          <div style={{ display:"flex", gap:"0.45rem", flexWrap:"wrap" }}>
            {coachDecision.options.slice(0, 2).map((opt, i) => (
              <button key={`${opt.label}_${i}`} className={`btn ${opt.primary ? "btn-primary" : ""}`} onClick={()=>applyDecisionOption(opt)} style={{ fontSize:"0.56rem" }}>
                {opt.label}
              </button>
            ))}
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))", gap:"0.38rem" }}>
            <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.44rem 0.48rem" }}>
              <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>LATEST COACH OUTPUT</div>
              <div style={{ fontSize:"0.54rem", color:"#dbe7f6", marginTop:"0.14rem", lineHeight:1.55 }}>{latestAssistantMessage?.text || "Coach update ready."}</div>
              {latestAssistantMessage?.source && <div style={{ fontSize:"0.47rem", color:"#8fa5c8", marginTop:"0.14rem" }}>Source: {formatCoachResponseSource(latestAssistantMessage.source)}</div>}
            </div>
            <div style={{ background:"#0f172a", border:"1px solid #1e293b", borderRadius:10, padding:"0.44rem 0.48rem" }}>
              <div style={{ fontSize:"0.48rem", color:"#64748b", letterSpacing:"0.08em" }}>LAST ACCEPTED CHANGE</div>
              <div style={{ fontSize:"0.54rem", color:"#dbe7f6", marginTop:"0.14rem", lineHeight:1.55 }}>
                {recentAcceptedAction ? `${sanitizeStatusLabel(recentAcceptedAction.type, "accepted")} by ${sanitizeDisplayText(recentAcceptedAction.acceptedBy || "gate")}` : "No accepted coach action yet."}
              </div>
              <div style={{ fontSize:"0.47rem", color:"#8fa5c8", marginTop:"0.14rem", lineHeight:1.5 }}>
                {recentAcceptedAction ? sanitizeDisplayText(recentAcceptedAction.reason || recentAcceptedAction.rationale || "Accepted action saved.") : boundaryLine}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="card" style={{ marginBottom:"0.05rem" }}>
        <div className="sect-title" style={{ color:C.amber, marginBottom:"0.32rem" }}>COACH INPUT</div>
        <div style={{ display:"grid", gap:"0.38rem" }}>
          <div style={{ fontSize:"0.52rem", color:"#8fa5c8" }}>Ask for a recommendation or use a quick decision prompt.</div>
          <div style={{ display:"flex", gap:"0.35rem", overflowX:"auto", paddingBottom:"0.2rem" }}>
            {quickPrompts.slice(0, 6).map(q => (
              <button key={q} className="btn" onClick={()=>send(q)} style={{ whiteSpace:"nowrap", fontSize:"0.55rem" }}>{q}</button>
            ))}
          </div>
          <div style={{ display:"flex", gap:"0.5rem" }}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&send()} placeholder="Ask coach for a decision" style={{ flex:1 }} disabled={loading} />
            <button className="btn btn-primary" onClick={()=>send()} disabled={loading} style={{ opacity:loading?0.5:1 }}>Send</button>
          </div>
          <details>
            <summary style={{ cursor:"pointer", fontSize:"0.54rem", color:"#8fa5c8" }}>Conversation history</summary>
            <div style={{ display:"grid", gap:"0.35rem", marginTop:"0.38rem" }}>
              {messages.slice(-20).map((m, idx) => (
                <div key={`${idx}_${m.role}`} className={m.role === "assistant" ? "coach-fade" : ""} style={{ justifySelf:m.role==="user"?"end":"start", maxWidth:"92%", background:m.role==="user"?"#15263f":"#101b2d", border:m.role==="user"?"1px solid #325178":"1px solid #2a3f5f", borderRadius:10, padding:"0.45rem 0.55rem" }}>
                  {m.role === "assistant" ? (
                    <div>
                      <div className="coach-copy" style={{ fontSize:"0.56rem", whiteSpace:"pre-wrap" }}>
                        {m.text || "Coach update ready."}
                      </div>
                      <div style={{ marginTop:"0.25rem", display:"flex", justifyContent:"space-between", alignItems:"center", gap:"0.4rem" }}>
                        <div style={{ display:"grid", gap:"0.08rem" }}>
                          <div style={{ fontSize:"0.48rem", color:"#64748b" }}>{m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</div>
                          {m.source && <div style={{ fontSize:"0.44rem", color:"#8fa5c8" }}>Source: {formatCoachResponseSource(m.source)}</div>}
                        </div>
                        <div style={{ display:"flex", alignItems:"center", gap:"0.25rem" }}>
                          <span style={{ fontSize:"0.46rem", color:"#8fa5c8" }}>Helpful?</span>
                          <button className="btn" onClick={()=>setMessages(prev => prev.map((x, i) => i === idx ? { ...x, helpful: true } : x))} style={{ fontSize:"0.46rem", padding:"0.12rem 0.3rem", borderColor:m.helpful===true?C.green+"35":"#2a3f5f", color:m.helpful===true?C.green:"#8fa5c8" }}>Yes</button>
                          <button className="btn" onClick={()=>{
                            setMessages(prev => prev.map((x, i) => i === idx ? { ...x, helpful: false } : x));
                            setFeedbackLog(prev => [{ ts: Date.now(), response: m.text || "" }, ...prev].slice(0, 100));
                          }} style={{ fontSize:"0.46rem", padding:"0.12rem 0.3rem", borderColor:m.helpful===false?C.red+"35":"#2a3f5f", color:m.helpful===false?C.red:"#8fa5c8" }}>No</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <div style={{ fontSize:"0.56rem", color:"#a9bddc" }}>{m.text}</div>
                      <div style={{ marginTop:"0.2rem", fontSize:"0.48rem", color:"#64748b" }}>{m.ts ? new Date(m.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : ""}</div>
                    </div>
                  )}
                </div>
              ))}
              {loading && (
                <div className="coach-fade" style={{ justifySelf:"start", maxWidth:"92%", background:"#101b2d", border:"1px solid #2a3f5f", borderRadius:10, padding:"0.45rem 0.55rem" }}>
                  <div className="coach-copy" style={{ fontSize:"0.56rem", whiteSpace:"pre-wrap" }}>
                    Coach is drafting a response...
                  </div>
                </div>
              )}
            </div>
          </details>
        </div>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(280px,1fr))", gap:"0.75rem" }}>
        <details className="card card-subtle" open>
          <summary style={{ cursor:"pointer", fontSize:"0.62rem", color:C.blue }}>MEMORY / SETTINGS</summary>
          <div style={{ paddingTop:"0.55rem", display:"grid", gap:"0.45rem" }}>
            <div style={{ fontSize:"0.53rem", color:"#8fa5c8", lineHeight:1.55 }}>Coach memory and environment presets shape recommendations, but they do not mutate plan state until you accept an action.</div>
            <div style={{ background:"#0f172a", border:"1px solid #20314a", borderRadius:9, padding:"0.45rem 0.5rem" }}>
              <div className="sect-title" style={{ color:C.blue, marginBottom:"0.24rem" }}>ENVIRONMENT PRESETS</div>
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
              <select value={coachMode} onChange={e=>setCoachMode(e.target.value)} style={{ fontSize:"0.7rem" }}>
                <option value="auto">Let coach decide</option><option value="deterministic">Deterministic</option>
              </select>
              <input value={apiKey} onChange={e=>{ setApiKey(e.target.value); if (typeof window !== "undefined") safeStorageSet(localStorage, "coach_api_key", e.target.value); }} placeholder="Anthropic key (optional)" style={{ fontSize:"0.68rem" }} />
            </div>
            <input value={memoryDraft.failurePatterns} onChange={e=>setMemoryDraft({ ...memoryDraft, failurePatterns:e.target.value })} placeholder="Failure patterns" style={{ fontSize:"0.68rem" }} />
            <input value={memoryDraft.commonBarriers} onChange={e=>setMemoryDraft({ ...memoryDraft, commonBarriers:e.target.value })} placeholder="Common barriers" style={{ fontSize:"0.68rem" }} />
            <input value={memoryDraft.preferredFoodPatterns} onChange={e=>setMemoryDraft({ ...memoryDraft, preferredFoodPatterns:e.target.value })} placeholder="Food patterns" style={{ fontSize:"0.68rem" }} />
            <button className="btn" onClick={async ()=>{
              const updated = mergePersonalization(personalization, { coachMemory: { ...personalization.coachMemory, failurePatterns: memoryDraft.failurePatterns.split(",").map(x=>x.trim()).filter(Boolean), commonBarriers: memoryDraft.commonBarriers.split(",").map(x=>x.trim()).filter(Boolean), preferredFoodPatterns: memoryDraft.preferredFoodPatterns.split(",").map(x=>x.trim()).filter(Boolean), simplicityVsVariety: memoryDraft.simplicityVsVariety } });
              setPersonalization(updated);
              await onPersist(updated, coachActions, coachPlanAdjustments, weekNotes, planAlerts);
            }} style={{ color:C.green, borderColor:C.green+"35" }}>Save memory</button>
          </div>
        </details>

        <details className="card card-subtle" open>
          <summary style={{ cursor:"pointer", fontSize:"0.62rem", color:C.purple }}>WEEKLY REVIEW / REFLECTION</summary>
          <div style={{ paddingTop:"0.55rem", display:"grid", gap:"0.38rem" }}>
            <div style={{ fontSize:"0.56rem", color:"#dbe7f6", lineHeight:1.6 }}>
              {sundayArchive[0]?.paragraph || "This section auto-generates on Sundays and archives each weekly review."}
            </div>
            <div style={{ fontSize:"0.52rem", color:"#8fa5c8", lineHeight:1.55 }}>{weeklyNotice}</div>
            {sundayArchive.length > 0 && (
              <div style={{ maxHeight:170, overflowY:"auto", border:"1px solid #23344e", borderRadius:9, padding:"0.35rem 0.45rem", display:"grid", gap:"0.28rem", background:"#0f172a" }}>
                {sundayArchive.map((r, idx) => (
                  <div key={`${r.date}_${idx}`} style={{ fontSize:"0.54rem", color:"#9fb2d2", lineHeight:1.55 }}>
                    <span className="mono" style={{ color:"#64748b" }}>{r.date}</span> - {r.paragraph}
                  </div>
                ))}
              </div>
            )}
          </div>
        </details>
      </div>

      <style>{`@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
    </div>
  );
}

function CoachSection({ title, items, color }) {
  return (
    <div style={{ background:"#0f172a", borderRadius:8, padding:"8px 12px", border:`1px solid ${color}20` }}>
      <div style={{ fontSize:"0.7rem", color, fontWeight:600, marginBottom:"0.25rem" }}>{title}</div>
      {(items?.length ? items : ["No issues detected."]).map((item, idx) => (
        <div key={idx} style={{ fontSize:"0.78rem", color:"#cbd5e1", lineHeight:1.6 }}>Ã¢â‚¬Â¢ {item}</div>
      ))}
    </div>
  );
}


