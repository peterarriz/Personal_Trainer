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

const fmtDate = (d) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

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
  const [analyzing, setAnalyzing] = useState(false);
  const [storageStatus, setStorageStatus] = useState("ok");
  const [lastSaved, setLastSaved] = useState(null);

  const today = new Date();
  const currentWeek = getCurrentWeek();
  const dayOfWeek = getDayOfWeek();
  const todayWorkout = getTodayWorkout(currentWeek, dayOfWeek);

  // ── SUPABASE STORAGE ─────────────────────────────────────────────────────
  const SB_URL = "https://wtntlpfzfetixfzawxn.supabase.co";
  const SB_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Ind0bnRubHBmemZldGl4Znphd3huIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUxNDQ1NDUsImV4cCI6MjA5MDcyMDU0NX0.iio486vj_x11WuRxOLV7JwmoZPuyov32x3nPbJ_oqdg";
  const SB_ROW = "trainer_v1";
  const sbH = { "Content-Type": "application/json", "apikey": SB_KEY, "Authorization": "Bearer " + SB_KEY };

  const sbLoad = async () => {
    const res = await fetch(SB_URL + "/rest/v1/trainer_data?id=eq." + SB_ROW, { headers: sbH });
    if (!res.ok) throw new Error("Load failed " + res.status + ": " + await res.text());
    const rows = await res.json();
    if (rows && rows.length > 0 && rows[0].data) {
      const d = rows[0].data;
      if (d.logs) setLogs(d.logs);
      if (d.bw) setBodyweights(d.bw);
      if (d.paceOverrides) setPaceOverrides(d.paceOverrides);
      if (d.weekNotes) setWeekNotes(d.weekNotes);
      if (d.planAlerts) setPlanAlerts(d.planAlerts);
    }
  };

  const sbSave = async (payload) => {
    const res = await fetch(SB_URL + "/rest/v1/trainer_data", {
      method: "POST",
      headers: { ...sbH, "Prefer": "resolution=merge-duplicates" },
      body: JSON.stringify({ id: SB_ROW, data: payload, updated_at: new Date().toISOString() }),
    });
    if (!res.ok) throw new Error("Save failed " + res.status + ": " + await res.text());
  };

  const persistAll = async (newLogs, newBW, newOvr, newNotes, newAlerts) => {
    await sbSave({ logs: newLogs, bw: newBW, paceOverrides: newOvr, weekNotes: newNotes, planAlerts: newAlerts, v: 2, ts: Date.now() });
  };

  useEffect(() => {
    (async () => {
      try { await sbLoad(); setStorageStatus("ok"); }
      catch(e) { setStorageStatus("err: " + e.message); }
      setLoading(false);
    })();
  }, []);

  const saveLogs = async (newLogs) => {
    setLogs(newLogs);
    try {
      await persistAll(newLogs, bodyweights, paceOverrides, weekNotes, planAlerts);
      setLastSaved(new Date().toLocaleTimeString());
      setStorageStatus("ok");
    } catch(e) { setStorageStatus("err: " + e.message); }
    analyzePlan(newLogs);
  };

  const saveBodyweights = async (arr) => {
    setBodyweights(arr);
    try {
      await persistAll(logs, arr, paceOverrides, weekNotes, planAlerts);
      setLastSaved(new Date().toLocaleTimeString());
      setStorageStatus("ok");
    } catch(e) { setStorageStatus("err: " + e.message); }
  };

  const savePlanState = async (newOvr, newNotes, newAlerts) => {
    try { await persistAll(logs, bodyweights, newOvr, newNotes, newAlerts); } catch(e) {}
  };

  const exportData = () => {
    const payload = { logs, bw: bodyweights, paceOverrides, weekNotes, planAlerts, v: 2, ts: Date.now() };
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
      setLogs(newLogs);
      setBodyweights(newBW);
      setPaceOverrides(newOvr);
      setWeekNotes(newNotes);
      setPlanAlerts(newAlerts);
      // Push restored data to Supabase immediately
      await persistAll(newLogs, newBW, newOvr, newNotes, newAlerts);
      setLastSaved("restored + synced");
      setStorageStatus("ok");
      return true;
    } catch(e) {
      setStorageStatus("err: " + e.message);
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

      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json", "anthropic-dangerous-direct-browser-access": "true" },
        body: JSON.stringify({
          model: "claude-haiku-4-5-20251001",
          max_tokens: 800,
          system: systemPrompt,
          messages: [{ role: "user", content: "Analyze my training logs and return plan adjustments." }]
        })
      });
      const raw = await res.text();
      const data = JSON.parse(raw);
      const text = data?.content?.[0]?.text || "{}";

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
      console.log("Plan analysis error:", e.message);
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
                color: storageStatus === "ok" ? "#4ade80" : storageStatus.startsWith("err") ? "#f87171" : "#334155" }}>
                {storageStatus === "ok" ? (lastSaved ? "● SAVED " + lastSaved : "● SYNCED") : storageStatus === "loading" ? "● LOADING..." : "● " + storageStatus}
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
        {tab === 0 && <TodayTab todayWorkout={todayWorkout} currentWeek={currentWeek} logs={logs} bodyweights={bodyweights} planAlerts={planAlerts} setPlanAlerts={setPlanAlerts} analyzing={analyzing} getZones={getZones} />}

        {/* ══════════════════════════════════════════════════════════
            TAB 1 — PLAN
        ══════════════════════════════════════════════════════════ */}
        {tab === 1 && <PlanTab currentWeek={currentWeek} logs={logs} getZones={getZones} weekNotes={weekNotes} paceOverrides={paceOverrides} setPaceOverrides={setPaceOverrides} />}

        {/* ══════════════════════════════════════════════════════════
            TAB 2 — LOG
        ══════════════════════════════════════════════════════════ */}
        {tab === 2 && <LogTab logs={logs} saveLogs={saveLogs} bodyweights={bodyweights} saveBodyweights={saveBodyweights} currentWeek={currentWeek} todayWorkout={todayWorkout} exportData={exportData} importData={importData} />}

        {/* ══════════════════════════════════════════════════════════
            TAB 3 — NUTRITION
        ══════════════════════════════════════════════════════════ */}
        {tab === 3 && <NutritionTab todayWorkout={todayWorkout} />}

        {/* ══════════════════════════════════════════════════════════
            TAB 4 — COACH
        ══════════════════════════════════════════════════════════ */}
        {tab === 4 && <CoachTab logs={logs} currentWeek={currentWeek} todayWorkout={todayWorkout} bodyweights={bodyweights} />}

      </div>
    </div>
  );
}

// ── TODAY TAB ─────────────────────────────────────────────────────────────────
function TodayTab({ todayWorkout, currentWeek, logs, bodyweights, planAlerts, setPlanAlerts, analyzing, getZones }) {
  const week = todayWorkout?.week;
  const zones = todayWorkout?.zones;
  const phaseName = week ? week.phase : "BASE";
  const phaseColor = PHASE_ZONES[phaseName]?.color || C.green;
  const todayKey = new Date().toISOString().split("T")[0];
  const todayLog = logs[todayKey];
  const latestBW = bodyweights.length > 0 ? bodyweights[bodyweights.length-1] : null;

  const dayColor = todayWorkout ? (dayColors[todayWorkout.type] || C.green) : C.slate;

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

      {/* Plan alerts */}
      {planAlerts.length > 0 && (
        <div style={{ marginBottom:"0.75rem", display:"grid", gap:"0.4rem" }}>
          {planAlerts.slice(0, 3).map(alert => (
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
function PlanTab({ currentWeek, logs, getZones, weekNotes, paceOverrides, setPaceOverrides }) {
  const [openWeek, setOpenWeek] = useState(null);

  return (
    <div className="fi">
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1rem", flexWrap:"wrap", gap:"0.5rem" }}>
        <div style={{ fontSize:"0.65rem", color:"#334155", lineHeight:1.7 }}>
          Full 18-week plan. Paces update automatically based on your logged performance.
        </div>
        {Object.keys(paceOverrides).length > 0 && (
          <button className="btn" onClick={() => setPaceOverrides({})}
            style={{ fontSize:"0.58rem", color:C.amber, borderColor:C.amber+"30", whiteSpace:"nowrap" }}>
            RESET PACE ADJUSTMENTS
          </button>
        )}
      </div>
      {Object.keys(paceOverrides).length > 0 && (
        <div style={{ marginBottom:"0.85rem", padding:"0.65rem 0.85rem", background:"#0d1117", border:`1px solid ${C.amber}30`, borderRadius:8, fontSize:"0.62rem", color:C.amber, lineHeight:1.7 }}>
          ⬆ Plan paces have been adjusted based on your training logs. Weeks marked ADJUSTED show your updated targets.
        </div>
      )}
      {WEEKS.map(week => {
        const zones = getZones(week.phase);
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
              </div>
              {isCurrentWeek && <div className="tag" style={{ background:`${phaseColor}20`, border:`1px solid ${phaseColor}40`, color:phaseColor }}>NOW</div>}
              {isOverridden && <div className="tag" style={{ background:`${C.amber}15`, border:`1px solid ${C.amber}30`, color:C.amber }}>ADJUSTED</div>}
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
                    { day:"MON", color:C.green,  content:`Easy Run ${week.mon.d} @ ${zones.easy}/mi`, tags:["EASY RUN","STR "+( week.str||"A")] },
                    { day:"TUE", color:C.amber,  content:"Orange Theory — Hybrid", tags:["OTF"] },
                    { day:"WED", color:C.blue,   content:"Strength B + Achilles Prehab", tags:["STRENGTH","PREHAB"] },
                    { day:"THU", color:C.red,    content:`${week.thu.t}: ${week.thu.d} @ ${week.thu.t==="Intervals"?zones.int:zones.tempo}/mi`, tags:[week.thu.t.toUpperCase()] },
                    { day:"FRI", color:C.lime,   content:`Easy Run ${week.fri.d} @ ${zones.easy}/mi`, tags:["EASY RUN"] },
                    { day:"SAT", color:C.red,    content:`Long Run ${week.sat.d} @ ${zones.long}/mi`, tags:["LONG RUN"] },
                    { day:"SUN", color:C.slate,  content:"Full Rest + Achilles Prehab", tags:["REST"] },
                  ].map(d => (
                    <div key={d.day} style={{ display:"flex", gap:"0.6rem", alignItems:"center", padding:"6px 8px", background:"#0f172a", borderRadius:7 }}>
                      <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.1rem", color:d.color, minWidth:32 }}>{d.day}</div>
                      <div style={{ flex:1, fontSize:"0.65rem", color:"#cbd5e1" }}>{d.content}</div>
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

// ── NUTRITION TAB ─────────────────────────────────────────────────────────────
function NutritionTab({ todayWorkout }) {
  const [mode, setMode] = useState("home");
  const [dayType, setDayType] = useState(todayWorkout?.nutri || "easyRun");
  const [hotelSection, setHotelSection] = useState("tips");
  const targets = NUTRITION[dayType] || NUTRITION.easyRun;

  return (
    <div className="fi">
      {/* Mode toggle */}
      <div style={{ display:"flex", gap:"0.35rem", marginBottom:"1rem" }}>
        {["home","travel"].map(m => (
          <button key={m} className="btn" onClick={()=>setMode(m)}
            style={{ color:mode===m?"#0a0a0f":C.amber, background:mode===m?C.amber:"transparent", borderColor:mode===m?C.amber:"#1e293b", flex:1, fontWeight:mode===m?500:300 }}>
            {m === "home" ? "🏠 HOME" : "✈️ TRAVEL"}
          </button>
        ))}
      </div>

      {mode === "home" && (
        <>
          {/* Day type selector */}
          <div style={{ display:"flex", gap:"0.3rem", marginBottom:"1rem", flexWrap:"wrap" }}>
            {Object.entries(NUTRITION).filter(([k])=>!k.startsWith("travel")).map(([k,v]) => (
              <button key={k} className="btn" onClick={()=>setDayType(k)}
                style={{ color:dayType===k?"#0a0a0f":C.green, background:dayType===k?C.green:"transparent", borderColor:dayType===k?C.green:"#1e293b", fontSize:"0.58rem" }}>
                {v.label}
              </button>
            ))}
          </div>

          {/* Macro targets */}
          <div style={{ display:"grid", gridTemplateColumns:"repeat(4,1fr)", gap:"0.5rem", marginBottom:"1rem" }}>
            {[
              { label:"CALORIES", val:targets.cal, color:C.amber },
              { label:"PROTEIN", val:`${targets.p}g`, color:C.red },
              { label:"CARBS", val:`${targets.c}g`, color:C.green },
              { label:"FAT", val:`${targets.f}g`, color:C.blue },
            ].map(m => (
              <div key={m.label} style={{ background:"#0d1117", border:`1px solid ${m.color}30`, borderRadius:8, padding:"0.65rem 0.5rem", textAlign:"center" }}>
                <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.4rem", color:m.color }}>{m.val}</div>
                <div style={{ fontSize:"0.55rem", color:"#334155", letterSpacing:"0.1em", marginTop:1 }}>{m.label}</div>
              </div>
            ))}
          </div>

          {/* Macro ratio bar */}
          <div style={{ marginBottom:"1rem", background:"#0d1117", borderRadius:8, padding:"0.75rem", border:"1px solid #1e293b" }}>
            <div style={{ fontSize:"0.58rem", color:"#475569", letterSpacing:"0.1em", marginBottom:"0.4rem" }}>MACRO SPLIT</div>
            <div style={{ display:"flex", height:12, borderRadius:6, overflow:"hidden" }}>
              {[
                { cal:targets.p*4, color:C.red },
                { cal:targets.c*4, color:C.green },
                { cal:targets.f*9, color:C.blue },
              ].map((m,i) => (
                <div key={i} style={{ width:`${(m.cal/targets.cal*100).toFixed(0)}%`, background:m.color, opacity:0.8 }} />
              ))}
            </div>
            <div style={{ display:"flex", gap:"1rem", marginTop:"0.4rem" }}>
              {[["Protein",targets.p*4,C.red],["Carbs",targets.c*4,C.green],["Fat",targets.f*9,C.blue]].map(([l,c,col])=>(
                <div key={l} style={{ fontSize:"0.58rem" }}>
                  <span style={{ color:col }}>{l}: </span>
                  <span style={{ color:"#475569" }}>{(c/targets.cal*100).toFixed(0)}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Meal plan */}
          <div className="card">
            <div className="sect-title" style={{ color:C.amber, marginBottom:"0.75rem" }}>SAMPLE MEAL PLAN — {targets.label.toUpperCase()}</div>
            <div style={{ display:"grid", gap:"0.6rem" }}>
              {(MEAL_PLANS.home[dayType === "longRun" ? "longRun" : dayType === "rest" ? "rest" : "training"] || MEAL_PLANS.home.training).map((meal,i) => (
                <div key={i} style={{ background:"#0f172a", borderRadius:8, padding:"0.7rem" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", marginBottom:"0.35rem" }}>
                    <div style={{ fontSize:"0.65rem", color:C.amber }}>{meal.meal}</div>
                    <div style={{ fontSize:"0.58rem", color:"#475569" }}>{meal.cal} cal · {meal.p}P · {meal.c}C · {meal.f}F</div>
                  </div>
                  <div style={{ display:"flex", gap:"0.5rem", flexWrap:"wrap" }}>
                    {meal.foods.map((f,j) => (
                      <div key={j} style={{ fontSize:"0.62rem", color:"#94a3b8" }}>
                        {j > 0 && <span style={{ color:"#1e293b", marginRight:"0.5rem" }}>·</span>}
                        {f}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div style={{ marginTop:"0.75rem", fontSize:"0.62rem", color:"#334155", lineHeight:1.7 }}>
              → <span style={{ color:"#e2e8f0" }}>190g protein every single day</span> regardless of training. On long run / hard run days, carbs go up. On rest days, carbs come down. Fat stays roughly consistent.
            </div>
          </div>
        </>
      )}

      {mode === "travel" && (
        <>
          <div style={{ display:"flex", gap:"0.35rem", marginBottom:"1rem", flexWrap:"wrap" }}>
            {[["tips","Eating Tips"],["hybrid","Travel Hybrid Day"],["chest","Hotel: Chest"],["back","Hotel: Back"],["arms","Hotel: Arms"],["full","Hotel: Full Body"]].map(([k,l])=>(
              <button key={k} className="btn" onClick={()=>setHotelSection(k)}
                style={{ color:hotelSection===k?"#0a0a0f":C.purple, background:hotelSection===k?C.purple:"transparent", borderColor:hotelSection===k?C.purple:"#1e293b", fontSize:"0.58rem" }}>
                {l}
              </button>
            ))}
          </div>

          {hotelSection === "tips" && (
            <div className="card">
              <div className="sect-title" style={{ color:C.purple, marginBottom:"0.75rem" }}>NUTRITION ON THE ROAD</div>
              <div style={{ display:"grid", gridTemplateColumns:"repeat(3,1fr)", gap:"0.5rem", marginBottom:"1rem" }}>
                {[["TRAVEL TRAINING",NUTRITION.travelRun.cal,C.amber],["TRAVEL REST",NUTRITION.travelRest.cal,C.slate],["PROTEIN GOAL","185–190g",C.red]].map(([l,v,c])=>(
                  <div key={l} style={{ background:"#0f172a", border:`1px solid ${c}25`, borderRadius:8, padding:"0.65rem 0.5rem", textAlign:"center" }}>
                    <div style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"1.3rem", color:c }}>{v}</div>
                    <div style={{ fontSize:"0.52rem", color:"#334155", letterSpacing:"0.08em", marginTop:1 }}>{l}</div>
                  </div>
                ))}
              </div>
              <div style={{ display:"grid", gap:"0.5rem" }}>
                {MEAL_PLANS.travel.tips.map((tip,i) => (
                  <div key={i} style={{ display:"flex", gap:"0.6rem", fontSize:"0.65rem", lineHeight:1.6, padding:"6px 8px", background:"#0f172a", borderRadius:6 }}>
                    <span style={{ color:C.purple, flexShrink:0 }}>→</span>
                    <span style={{ color:"#94a3b8" }}>{tip}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {hotelSection === "hybrid" && (
            <div className="card">
              <div className="sect-title" style={{ color:C.purple, marginBottom:"0.75rem" }}>TRAVEL HYBRID DAY — OTF REPLACEMENT</div>
              <div style={{ background:"#0a0a14", border:`1px solid ${C.amber}30`, borderRadius:8, padding:"0.85rem", marginBottom:"1rem", fontSize:"0.65rem", color:"#94a3b8", lineHeight:1.8 }}>
                <span style={{ color:C.amber }}>When you're traveling and can't make OTF, </span>
                Tuesday is still a hybrid day — cardio + upper body together. Don't just skip it and don't replace it with a pure run. The goal is to replicate the mixed stimulus OTF provides: elevated heart rate sustained for 45–60 min with some resistance work layered in.
              </div>
              <div style={{ display:"grid", gap:"0.75rem" }}>
                {[
                  { phase:"Base & Building (Wks 1–8)", color:C.green,
                    cardio:"20–25 min treadmill — start at easy pace (10:15–10:30/mi), build to tempo effort (8:45–8:55) for last 10 min",
                    strength:["DB Bench Press 3×12","DB Row 3×12","DB Shoulder Press 3×10","Cable Bicep Curl 3×12","Tricep Pushdown 3×12","Plank 3×45 sec"],
                    note:"Keep rest short — 45 sec between sets. This should feel like a circuit, not a slow gym session." },
                  { phase:"Peak Build & Peak (Wks 9–15)", color:C.amber,
                    cardio:"30 min treadmill — 10 min easy, 15 min at tempo (8:30–8:40/mi), 5 min easy cooldown",
                    strength:["Barbell Bench Press 4×10","Incline DB Press 3×10","Cable Fly 3×12","EZ Bar Curl 4×10","Tricep Pushdown 4×12","Cable Crunch 3×15"],
                    note:"The cardio block is longer now — your fitness is higher. The 15-min tempo chunk is real running work." },
                  { phase:"Taper (Wks 16–18)", color:C.purple,
                    cardio:"20 min easy treadmill — no tempo. Just keep the legs moving.",
                    strength:["DB Bench 3×10","DB Row 3×10","DB Curl 3×10","Tricep Pushdown 3×10"],
                    note:"Reduced volume. The goal is maintenance, not stimulus. Don't add extra sets." },
                ].map((block, i) => (
                  <div key={i} style={{ background:"#0f172a", borderRadius:8, padding:"0.85rem", border:`1px solid ${block.color}20` }}>
                    <div style={{ fontSize:"0.62rem", color:block.color, letterSpacing:"0.1em", marginBottom:"0.6rem" }}>{block.phase}</div>
                    <div style={{ fontSize:"0.6rem", color:"#475569", marginBottom:"0.5rem" }}>
                      <span style={{ color:"#e2e8f0" }}>Cardio: </span>{block.cardio}
                    </div>
                    <div style={{ fontSize:"0.6rem", color:"#475569", marginBottom:"0.5rem" }}>
                      <span style={{ color:"#e2e8f0" }}>Strength: </span>{block.strength.join(" · ")}
                    </div>
                    <div style={{ fontSize:"0.58rem", color:"#334155", lineHeight:1.6 }}>→ {block.note}</div>
                  </div>
                ))}
              </div>
              <div style={{ marginTop:"1rem", background:"#0a0a14", borderRadius:8, padding:"0.75rem", fontSize:"0.62rem", color:"#475569", lineHeight:1.8 }}>
                <span style={{ color:C.red }}>Important: </span>
                Don't do a full hard run AND this workout on the same day. The hybrid IS Tuesday's workout — full stop. Thursday's hard run still happens as planned regardless of travel.
              </div>
            </div>
          )}

          {["chest","back","arms","full"].includes(hotelSection) && (
            <div className="card">
              <div className="sect-title" style={{ color:C.purple, marginBottom:"0.75rem" }}>HOTEL GYM — {hotelSection.toUpperCase()}</div>
              <div style={{ marginBottom:"0.6rem", fontSize:"0.62rem", color:"#475569", lineHeight:1.6 }}>
                You have access to full commercial equipment. Progressive overload: increase weight when the last set feels easy. Log your weights in the workout log.
              </div>
              <div style={{ display:"grid", gap:"0.4rem" }}>
                {MEAL_PLANS.travel.gym[hotelSection].map((ex,i) => (
                  <div key={i} style={{ display:"flex", gap:"0.6rem", padding:"7px 10px", background:"#0f172a", borderRadius:6 }}>
                    <span style={{ fontFamily:"'Bebas Neue',sans-serif", fontSize:"0.9rem", color:"#1e293b", minWidth:22 }}>{String(i+1).padStart(2,"0")}</span>
                    <span style={{ fontSize:"0.68rem", color:"#e2e8f0" }}>{ex}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── COACH TAB ─────────────────────────────────────────────────────────────────
function CoachTab({ logs, currentWeek, todayWorkout, bodyweights }) {
  const [messages, setMessages] = useState([
    { role:"assistant", text:`Hey — I'm your personal trainer. Week ${currentWeek} of 18, goal is 1:45 at the half on July 19. I can see your workout logs, your bodyweight trend, and exactly where you are in the plan. Ask me anything — pacing questions, how you're progressing, if you should push or back off, what to eat today, how the Achilles is holding up, anything.` }
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef(null);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior:"smooth" }); }, [messages]);

  const send = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(m => [...m, { role:"user", text:userMsg }]);
    setLoading(true);

    // Build context for AI
    const recentLogs = Object.entries(logs).sort((a,b)=>b[0].localeCompare(a[0])).slice(0,10)
      .map(([date,log]) => `${date}: ${log.type}${log.miles?" | "+log.miles+"mi":""}${log.pace?" @ "+log.pace+"/mi":""}${log.pushups?" | "+log.pushups+" push-ups":""}${log.feel?" | feel:"+log.feel+"/5":""}${log.notes?" | "+log.notes:""}`)
      .join("\n");

    const latestBW = bodyweights.length > 0 ? bodyweights[bodyweights.length-1] : null;
    const bwChange = latestBW ? (PROFILE.weight - latestBW.w).toFixed(1) : null;

    const systemPrompt = `You are an expert personal trainer and running coach. You are direct, motivating, and knowledgeable. You speak in short, punchy sentences — not bullet point lists. You know your athlete extremely well.

ATHLETE PROFILE:
- 30 years old, 6'1", started at 190 lbs${latestBW ? `, now ${latestBW.w} lbs (${bwChange > 0 ? "down" : "up"} ${Math.abs(bwChange)} lbs)` : ""}
- Half marathon PR: 1:54. Goal: 1:45 by July 19, 2026. Goal pace: 8:01/mi
- Chicago Marathon finisher (had Achilles tendonitis during that training)
- Currently: Week ${currentWeek} of 18. Phase: ${todayWorkout?.week?.phase || "BASE"}
- Fitness: 3 sets × 33 push-ups comfortably. Goals: body recomp, abs, chest/arms, half marathon
- Equipment: resistance bands at home. Has full gym access when traveling.
- Goes to Orange Theory 1x/week (treated as hybrid run/strength day, NOT cross-training)
- Current phase paces: Easy ${PHASE_ZONES[todayWorkout?.week?.phase||"BASE"]?.easy}/mi, Tempo ${PHASE_ZONES[todayWorkout?.week?.phase||"BASE"]?.tempo}/mi, Intervals ${PHASE_ZONES[todayWorkout?.week?.phase||"BASE"]?.int}/mi

TODAY: ${todayWorkout?.label || "Rest Day"}

RECENT WORKOUT LOGS (last 10):
${recentLogs || "No logs yet — athlete just started."}

TOTAL SESSIONS LOGGED: ${Object.keys(logs).length}

Your job: be a real coach. Analyze their logs, notice patterns, push them when they're backing off, protect them when they're overdoing it. Reference specific logged workouts when relevant. Keep responses concise and direct — 3-6 sentences max unless they ask for something detailed. Never use bullet points.`;

    try {
      const history = messages.slice(-8).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text }));
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{
          "Content-Type":"application/json",
          "anthropic-dangerous-direct-browser-access":"true",
        },
        body:JSON.stringify({
          model:"claude-haiku-4-5-20251001",
          max_tokens:1000,
          system:systemPrompt,
          messages:[...history, { role:"user", content:userMsg }]
        })
      });
      const rawText = await res.text();
      let data;
      try {
        data = JSON.parse(rawText);
      } catch(parseErr) {
        setMessages(m => [...m, { role:"assistant", text:"Parse error: " + rawText.substring(0, 400) }]);
        setLoading(false);
        return;
      }
      if (!res.ok) {
        const errMsg = (data && data.error && data.error.message) || ("HTTP " + res.status + ": " + JSON.stringify(data).substring(0,200));
        setMessages(m => [...m, { role:"assistant", text:"API Error: " + errMsg }]);
        setLoading(false);
        return;
      }
      const reply =
        (data && data.content && data.content[0] && data.content[0].text) ||
        (data && data.completion) ||
        ("Unexpected shape: " + JSON.stringify(data).substring(0,300));
      setMessages(m => [...m, { role:"assistant", text:reply }]);
    } catch(e) {
      setMessages(m => [...m, { role:"assistant", text:"Fetch failed: " + e.message }]);
    }
    setLoading(false);
  };

  const quickPrompts = [
    "How am I progressing?",
    "Should I push harder this week?",
    "What should I eat today?",
    "My Achilles feels tight",
    "I'm traveling this week",
    "How are my push-ups progressing?",
  ];

  return (
    <div className="fi" style={{ display:"flex", flexDirection:"column", height:"calc(100vh - 200px)", minHeight:400 }}>
      {/* Chat messages */}
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
              {msg.role==="assistant" && <div style={{ fontSize:"0.55rem", color:C.green, letterSpacing:"0.12em", marginBottom:"0.35rem" }}>COACH</div>}
              {msg.text}
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

      {/* Quick prompts */}
      <div style={{ display:"flex", gap:"0.3rem", overflowX:"auto", paddingBottom:"0.4rem", marginBottom:"0.4rem" }}>
        {quickPrompts.map(q => (
          <button key={q} className="btn" onClick={()=>{ setInput(q); }} style={{ whiteSpace:"nowrap", fontSize:"0.58rem", flexShrink:0, color:C.blue, borderColor:`${C.blue}30` }}>
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
        <button className="btn btn-primary" onClick={send} disabled={loading} style={{ flexShrink:0, opacity:loading?0.5:1 }}>
          SEND
        </button>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:0.3}50%{opacity:1}}`}</style>
    </div>
  );
}
