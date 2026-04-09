import { normalizeStructuredProvenance } from "./services/provenance-service.js";

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

const clonePlainValueCheckins = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const normalizeSessionText = (value = "") => String(value || "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, " ")
  .trim();

const inferSessionFamily = ({ type = "", label = "", run = null, strengthPerformance = [] } = {}) => {
  const raw = `${type} ${label} ${run?.t || ""}`.toLowerCase();
  if (!raw.trim() && Array.isArray(strengthPerformance) && strengthPerformance.length > 0) return "strength";
  if (/rest|recovery|mobility|walk/.test(raw)) return "recovery";
  if (/run|tempo|interval|easy|long|aerobic|cardio|stride/.test(raw)) return "run";
  if (/strength|push|pull|bench|squat|deadlift|press|row|lift|prehab/.test(raw) || (Array.isArray(strengthPerformance) && strengthPerformance.length > 0)) return "strength";
  if (/condition|otf|hybrid/.test(raw)) return "hybrid";
  return raw ? "custom" : "unknown";
};

const getPlannedTraining = (plannedDayRecord = null) => (
  plannedDayRecord?.resolved?.training
  || plannedDayRecord?.plan?.resolved?.training
  || plannedDayRecord?.training
  || null
);

export const resolveActualStatus = ({ dateKey, dailyCheckin = {}, logEntry = {} } = {}) => {
  const explicitCheckinStatus = dailyCheckin?.status && dailyCheckin.status !== "not_logged"
    ? dailyCheckin.status
    : "";
  const status = logEntry?.actualSession?.status
    || explicitCheckinStatus
    || logEntry?.checkin?.status
    || dailyCheckin?.status
    || "not_logged";
  return resolveEffectiveStatus({ status }, dateKey);
};

export const buildPlannedDayRecord = (planDay = null) => {
  if (!planDay?.dateKey) return null;
  return {
    id: planDay?.id || `plan_day_${planDay.dateKey}`,
    dateKey: planDay.dateKey,
    source: "daily_decision_engine",
    week: clonePlainValueCheckins(planDay?.week || {}),
    base: clonePlainValueCheckins({
      training: planDay?.base?.training || null,
      nutrition: planDay?.base?.nutrition || null,
      recovery: planDay?.base?.recovery || null,
      supplements: planDay?.base?.supplements || null,
    }),
    resolved: clonePlainValueCheckins({
      training: planDay?.resolved?.training || null,
      nutrition: planDay?.resolved?.nutrition || null,
      recovery: planDay?.resolved?.recovery || null,
      supplements: planDay?.resolved?.supplements || null,
    }),
    decision: clonePlainValueCheckins(planDay?.decision || {}),
    provenance: clonePlainValueCheckins(normalizeStructuredProvenance(planDay?.provenance || null)),
    flags: clonePlainValueCheckins(planDay?.flags || {}),
  };
};

export const comparePlannedDayToActual = ({ plannedDayRecord = null, actualLog = {}, dailyCheckin = {}, dateKey = "" } = {}) => {
  const plannedTraining = getPlannedTraining(plannedDayRecord);
  const plannedType = String(plannedTraining?.type || "");
  const plannedLabel = String(plannedTraining?.label || "");
  const plannedFamily = inferSessionFamily({ type: plannedType, label: plannedLabel, run: plannedTraining?.run });
  const expectedSession = Boolean(plannedTraining && !["rest", "recovery"].includes(plannedType.toLowerCase()));

  const actualSession = actualLog?.actualSession || {};
  const actualType = String(actualSession?.sessionType || actualLog?.type || actualLog?.label || "");
  const actualLabel = String(actualSession?.sessionLabel || actualLog?.type || actualLog?.label || "");
  const actualFamily = inferSessionFamily({
    type: actualType,
    label: actualLabel,
    strengthPerformance: actualLog?.strengthPerformance || [],
  });
  const status = resolveActualStatus({ dateKey, dailyCheckin, logEntry: actualLog });
  const hasStructuredActual = Boolean(
    actualType
    || Number(actualLog?.miles || 0) > 0
    || Number(actualLog?.runTime || 0) > 0
    || (Array.isArray(actualLog?.strengthPerformance) && actualLog.strengthPerformance.length > 0)
    || ["completed_as_planned", "completed_modified", "partial_completed", "skipped"].includes(status)
  );

  let completionKind = "unknown";
  let differenceKind = "unknown";
  let severity = "none";
  let matters = false;
  let summary = "Awaiting actual outcome.";

  if (!plannedDayRecord) {
    if (hasStructuredActual) {
      completionKind = "custom_session";
      differenceKind = "custom_session";
      severity = "minor";
      matters = true;
      summary = "Custom session logged without a stored prescribed day.";
    } else if (status === "not_logged_expired") {
      differenceKind = "unknown_plan";
      severity = "minor";
      matters = false;
      summary = "No stored prescribed day or actual session record is available.";
    }
    return {
      status,
      completionKind,
      differenceKind,
      severity,
      matters,
      summary,
      hasPlannedDay: false,
      expectedSession: false,
      plannedLabel: "",
      plannedType: "",
      actualLabel,
      actualType,
      customSession: completionKind === "custom_session",
    };
  }

  if (!expectedSession) {
    if (hasStructuredActual && actualFamily !== "unknown" && actualFamily !== "recovery") {
      completionKind = "custom_session";
      differenceKind = "custom_session";
      severity = "material";
      matters = true;
      summary = `A session was logged on a planned recovery/rest day (${plannedLabel || "recovery"}).`;
    } else {
      completionKind = "recovery_day";
      differenceKind = "none";
      severity = "none";
      matters = false;
      summary = plannedLabel ? `${plannedLabel} was the prescribed day.` : "Recovery day was prescribed.";
    }
    return {
      status,
      completionKind,
      differenceKind,
      severity,
      matters,
      summary,
      hasPlannedDay: true,
      expectedSession,
      plannedLabel,
      plannedType,
      actualLabel,
      actualType,
      customSession: completionKind === "custom_session",
    };
  }

  if (status === "completed_as_planned") {
    completionKind = "as_prescribed";
    differenceKind = "none";
    severity = "none";
    matters = false;
    summary = plannedLabel ? `Completed as prescribed: ${plannedLabel}.` : "Completed as prescribed.";
  } else if (status === "completed_modified" || status === "partial_completed") {
    completionKind = "modified";
    differenceKind = "modified";
    severity = actualFamily === plannedFamily || actualFamily === "unknown" ? "minor" : "material";
    matters = true;
    summary = actualLabel
      ? `Modified from plan: prescribed ${plannedLabel || plannedType}, actual ${actualLabel}.`
      : `Modified from plan: ${plannedLabel || plannedType}.`;
  } else if (status === "skipped") {
    completionKind = "skipped";
    differenceKind = "skipped";
    severity = "material";
    matters = true;
    summary = plannedLabel ? `Skipped planned session: ${plannedLabel}.` : "Skipped planned session.";
  } else if (status === "not_logged_expired") {
    completionKind = "unknown";
    differenceKind = "not_logged_over_48h";
    severity = "material";
    matters = true;
    summary = plannedLabel
      ? `No actual outcome logged for prescribed session ${plannedLabel} after 48 hours.`
      : "No actual outcome logged for the prescribed session after 48 hours.";
  } else if (hasStructuredActual) {
    completionKind = "custom_session";
    differenceKind = "custom_session";
    severity = actualFamily === plannedFamily ? "minor" : "material";
    matters = true;
    summary = actualLabel
      ? `Custom session logged against prescribed ${plannedLabel || plannedType}: ${actualLabel}.`
      : `Custom session logged against prescribed ${plannedLabel || plannedType}.`;
  } else if (status === "not_logged_grace") {
    completionKind = "pending";
    differenceKind = "pending";
    severity = "none";
    matters = false;
    summary = plannedLabel
      ? `Prescribed ${plannedLabel}; still inside the logging grace period.`
      : "Prescribed session is still inside the logging grace period.";
  }

  return {
    status,
    completionKind,
    differenceKind,
    severity,
    matters,
    summary,
    hasPlannedDay: true,
    expectedSession,
    plannedLabel,
    plannedType,
    actualLabel,
    actualType,
    customSession: completionKind === "custom_session",
    sameSessionFamily: actualFamily === plannedFamily,
  };
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
  const dateKeys = Array.from(new Set([...(Object.keys(dailyCheckins || {})), ...(Object.keys(logs || {}))])).filter((date) => {
    const t = new Date(`${date}T12:00:00`).getTime();
    return t >= startTs && t <= endTs;
  });
  const checkins = dateKeys.map((date) => ({ date, ...(dailyCheckins?.[date] || {}) }));
  const logRows = Object.entries(logs || {}).filter(([date]) => {
    const t = new Date(`${date}T12:00:00`).getTime();
    return t >= startTs && t <= endTs;
  }).map(([, l]) => l || {});
  const completed = dateKeys.filter((date) => {
    const status = resolveActualStatus({ dateKey: date, dailyCheckin: dailyCheckins?.[date] || {}, logEntry: logs?.[date] || {} });
    return ["completed_as_planned", "completed_modified", "partial_completed"].includes(status);
  }).length;
  const countable = dateKeys.filter((date) => {
    const status = resolveActualStatus({ dateKey: date, dailyCheckin: dailyCheckins?.[date] || {}, logEntry: logs?.[date] || {} });
    return status !== "not_logged" && status !== "not_logged_grace";
  }).length;
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
