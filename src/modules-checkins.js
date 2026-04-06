export const DEFAULT_DAILY_CHECKIN = {
  status: "not_logged",
  sessionFeel: "",
  blocker: "",
  note: "",
  bodyweight: "",
  readiness: {
    sleep: "",
    soreness: "",
    stress: "",
  },
};

export const CHECKIN_STATUS_OPTIONS = [
  { key: "completed_as_planned", label: "completed as planned" },
  { key: "completed_modified", label: "completed modified" },
  { key: "skipped", label: "skipped" },
];

// 48-hour grace period: not_logged entries under 48h are excluded from
// consistency calculations entirely. After 48h they count as skipped
// in the denominator only, never as completed.
const GRACE_PERIOD_MS = 48 * 60 * 60 * 1000;

export const isWithinGracePeriod = (dateKey) => {
  const entryTime = new Date(`${dateKey}T23:59:59`).getTime();
  return (Date.now() - entryTime) < GRACE_PERIOD_MS;
};

export const resolveEffectiveStatus = (checkin, dateKey) => {
  const status = checkin?.status || "not_logged";
  if (status !== "not_logged") return status;
  if (isWithinGracePeriod(dateKey)) return "not_logged_grace";
  return "not_logged_expired";
};

export const CHECKIN_FEEL_OPTIONS = [
  { key: "easier_than_expected", label: "easier than expected" },
  { key: "about_right", label: "about right" },
  { key: "harder_than_expected", label: "harder than expected" },
];

export const CHECKIN_BLOCKER_OPTIONS = [
  { key: "time", label: "time" },
  { key: "motivation", label: "motivation" },
  { key: "soreness_fatigue", label: "soreness/fatigue" },
  { key: "pain_injury", label: "pain/injury" },
  { key: "no_equipment", label: "no equipment" },
  { key: "schedule_travel", label: "schedule/travel" },
  { key: "other", label: "other" },
];

export const parseMicroCheckin = (text) => {
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

const CLOSED_LOOP_TRACKED_ACTIONS = {
  REDUCE_WEEKLY_VOLUME: { strategy: "simplify_density", label: "reduced weekly density" },
  ACTIVATE_SALVAGE: { strategy: "salvage_mode", label: "activated salvage mode" },
  INCREASE_CALORIES_SLIGHTLY: { strategy: "increase_calories", label: "increased calories slightly" },
  REDUCE_DEFICIT_AGGRESSIVENESS: { strategy: "reduce_deficit", label: "reduced deficit aggressiveness" },
  SIMPLIFY_MEALS_THIS_WEEK: { strategy: "simplify_meals", label: "simplified meal structure" },
  PROGRESS_STRENGTH_EMPHASIS: { strategy: "aggressive_progression", label: "increased strength aggressiveness" },
};

const getDateKeyFromTs = (ts) => {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString().split("T")[0];
};

const getWindowMetrics = ({ logs, dailyCheckins, startTs, endTs }) => {
  const checkins = Object.entries(dailyCheckins || {}).filter(([date]) => {
    const t = new Date(`${date}T12:00:00`).getTime();
    return t >= startTs && t <= endTs;
  }).map(([, c]) => c || {});
  const logRows = Object.entries(logs || {}).filter(([date]) => {
    const t = new Date(`${date}T12:00:00`).getTime();
    return t >= startTs && t <= endTs;
  }).map(([, l]) => l || {});
  const completed = checkins.filter(c => ["completed_as_planned", "completed_modified"].includes(c.status)).length;
  const countable = checkins.filter(c => c.status !== "not_logged" && c.status !== "not_logged_grace").length;
  const adherence = countable ? completed / countable : 0;
  const avgFeel = logRows.length ? (logRows.reduce((s, l) => s + Number(l.feel || 3), 0) / logRows.length) : 3;
  const progressHits = logRows.filter(l => /progress|solid|better|good|strong/i.test((l.notes || "").toLowerCase())).length;
  return { adherence, avgFeel, progressHits, sample: checkins.length + logRows.length };
};

const classifyClosedLoopImpact = ({ baseline, outcome }) => {
  if (!outcome || outcome.sample < 3) return { impact: "pending", score: 0, why: "Not enough 3–7 day evidence yet." };
  const adherenceDelta = outcome.adherence - baseline.adherence;
  const momentumDelta = outcome.avgFeel - baseline.avgFeel;
  const progressDelta = outcome.progressHits - baseline.progressHits;
  const score = (adherenceDelta * 1.3) + (momentumDelta * 0.35) + (progressDelta * 0.15);
  if (score >= 0.35) return { impact: "positive", score, why: "Adherence/momentum improved after this adjustment." };
  if (score <= -0.2) return { impact: "negative", score, why: "Execution quality declined after this adjustment." };
  return { impact: "neutral", score, why: "No strong directional effect detected." };
};

export const deriveClosedLoopValidationLayer = ({ coachActions, logs, dailyCheckins }) => {
  const now = Date.now();
  const tracked = (coachActions || [])
    .filter(a => CLOSED_LOOP_TRACKED_ACTIONS[a.type])
    .slice(0, 40);
  const records = tracked.map((action) => {
    const actionTs = Number(action.ts || now);
    const actionType = CLOSED_LOOP_TRACKED_ACTIONS[action.type];
    const baseline = getWindowMetrics({ logs, dailyCheckins, startTs: actionTs - (7 * 86400000), endTs: actionTs - 1 });
    const outcome = getWindowMetrics({ logs, dailyCheckins, startTs: actionTs + (3 * 86400000), endTs: actionTs + (7 * 86400000) });
    const cls = classifyClosedLoopImpact({ baseline, outcome });
    return {
      id: action.id || `act_${actionTs}`,
      strategy: actionType.strategy,
      actionType: action.type,
      changed: actionType.label,
      reason: action.reason || action.triggerReason || action.payload?.reason || "adaptive trigger",
      actionDate: getDateKeyFromTs(actionTs),
      baseline,
      outcome,
      ...cls,
    };
  });
  const resolved = records.filter(r => r.impact !== "pending");
  const strategyStats = resolved.reduce((acc, r) => {
    const cur = acc[r.strategy] || { total: 0, positive: 0, neutral: 0, negative: 0, score: 0 };
    cur.total += 1;
    cur[r.impact] += 1;
    cur.score += r.score;
    acc[r.strategy] = cur;
    return acc;
  }, {});
  const strategyAdjustments = Object.entries(strategyStats).reduce((acc, [strategy, s]) => {
    const avg = s.total ? s.score / s.total : 0;
    acc[strategy] = avg >= 0.25 ? "strengthen" : avg <= -0.15 ? "reduce" : "hold";
    return acc;
  }, {});
  const topPositive = resolved.find(r => r.impact === "positive");
  const topNegative = resolved.find(r => r.impact === "negative");
  const coachNudges = [
    topPositive ? `Simplifying your weeks has improved consistency recently.` : null,
    topNegative ? `More aggressive weeks tend to reduce adherence right now.` : null,
  ].filter(Boolean);
  return {
    records,
    recentResolved: resolved.slice(0, 8),
    strategyStats,
    strategyAdjustments,
    coachNudge: coachNudges[0] || "",
    summary: resolved.length ? `Validated ${resolved.length} recent adjustments with 3–7 day outcomes.` : "Collecting validation data from recent adjustments.",
  };
};
