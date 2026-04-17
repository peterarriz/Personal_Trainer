const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

export const GOAL_PACE_VERDICTS = Object.freeze({
  onPace: "on_pace",
  offPace: "off_pace",
  unknown: "unknown",
});

export const GOAL_PACE_CONFIDENCE = Object.freeze({
  low: "low",
  medium: "medium",
  high: "high",
});

const asDate = (value = null) => {
  if (!value) return new Date();
  if (value instanceof Date) return new Date(value.getTime());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const weeksUntil = ({ now = new Date(), deadline = "" } = {}) => {
  const safeNow = asDate(now);
  const safeDeadline = asDate(deadline);
  const diffMs = safeDeadline.getTime() - safeNow.getTime();
  if (!Number.isFinite(diffMs) || diffMs <= 0) return 0;
  return Math.max(0, Math.round(diffMs / (7 * 86400000)));
};

const parsePaceSeconds = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return null;
  const match = text.match(/(\d{1,2}):(\d{2})/);
  if (!match?.[1]) return null;
  return (Number(match[1]) * 60) + Number(match[2]);
};

const parseDurationMinutes = (value = "") => {
  const text = String(value || "").trim();
  if (!text) return null;
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match?.[1]) return null;
  if (match[3]) return (Number(match[1]) * 60) + Number(match[2]) + (Number(match[3]) / 60);
  return Number(match[1]) + (Number(match[2]) / 60);
};

const parseTimeTargetSeconds = (value = "") => {
  const text = String(value || "").trim();
  const match = text.match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match?.[1]) return null;
  if (match[3]) return (Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3]);
  return (Number(match[1]) * 60) + Number(match[2]);
};

const estimateOneRepMax = ({ weight = null, reps = null } = {}) => {
  const safeWeight = Number(weight);
  const safeReps = Number(reps);
  if (!Number.isFinite(safeWeight) || !Number.isFinite(safeReps) || safeWeight <= 0 || safeReps <= 0) return null;
  return safeWeight * (1 + (safeReps / 30));
};

const round1 = (value = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.round(parsed * 10) / 10 : null;
};

const formatBenchAnchor = (anchor = {}) => {
  if (!Number.isFinite(Number(anchor?.weight)) || !Number.isFinite(Number(anchor?.reps))) return "";
  return `${anchor.weight} x ${anchor.reps}`;
};

const formatPace = (paceSeconds = null) => {
  const parsed = Number(paceSeconds);
  if (!Number.isFinite(parsed) || parsed <= 0) return "";
  const minutes = Math.floor(parsed / 60);
  const seconds = Math.round(parsed % 60);
  return `${minutes}:${String(seconds).padStart(2, "0")}/mi`;
};

const buildVerdict = ({
  goalId = "",
  summary = "",
  verdict = GOAL_PACE_VERDICTS.unknown,
  confidence = GOAL_PACE_CONFIDENCE.low,
  keyAnchors = [],
  majorLimitingFactor = "",
  reason = "",
} = {}) => ({
  goalId: sanitizeText(goalId, 120),
  summary: sanitizeText(summary, 180),
  verdict,
  confidence,
  keyAnchors: toArray(keyAnchors).map((item) => sanitizeText(item, 140)).filter(Boolean),
  majorLimitingFactor: sanitizeText(majorLimitingFactor, 180),
  reason: sanitizeText(reason, 320),
});

const normalizeGoal = (goal = {}) => ({
  id: sanitizeText(goal?.id || "", 120),
  summary: sanitizeText(goal?.resolvedGoal?.summary || goal?.summary || goal?.name || "", 180),
  goalFamily: sanitizeText(goal?.resolvedGoal?.goalFamily || goal?.goalFamily || "", 40).toLowerCase(),
  planningCategory: sanitizeText(goal?.resolvedGoal?.planningCategory || goal?.planningCategory || goal?.category || "", 40).toLowerCase(),
  primaryMetric: goal?.resolvedGoal?.primaryMetric || goal?.primaryMetric || null,
});

const downgradeConfidence = (value = GOAL_PACE_CONFIDENCE.low) => {
  if (value === GOAL_PACE_CONFIDENCE.high) return GOAL_PACE_CONFIDENCE.medium;
  return GOAL_PACE_CONFIDENCE.low;
};

const getPlanRiskKeys = (planAudit = {}) => new Set(
  toArray(planAudit?.riskFlags)
    .map((flag) => sanitizeText(flag?.key || "", 80))
    .filter(Boolean)
);

const appendAnchors = (existing = [], next = []) => [
  ...toArray(existing),
  ...toArray(next),
].map((item) => sanitizeText(item, 140)).filter(Boolean);

const buildBenchVerdict = ({ goal = {}, anchors = {}, now, deadline, activeGoals = [] } = {}) => {
  const currentAnchor = anchors?.benchTopSet || null;
  const estimatedOneRepMax = estimateOneRepMax({ weight: currentAnchor?.weight, reps: currentAnchor?.reps });
  const targetWeight = Number(goal?.primaryMetric?.targetValue || 0);
  const weeksLeft = weeksUntil({ now, deadline });
  const concurrentInterference = activeGoals.filter((entry) => ["running", "body_comp", "appearance"].includes(entry.goalFamily)).length;

  if (!Number.isFinite(estimatedOneRepMax) || !Number.isFinite(targetWeight) || targetWeight <= 0 || weeksLeft <= 0) {
    return buildVerdict({
      goalId: goal.id,
      summary: goal.summary,
      verdict: GOAL_PACE_VERDICTS.unknown,
      confidence: GOAL_PACE_CONFIDENCE.low,
      keyAnchors: [formatBenchAnchor(currentAnchor)].filter(Boolean),
      majorLimitingFactor: "No recent bench anchor is available.",
      reason: "A recent top set is required before the app can say whether the bench target is on pace.",
    });
  }

  const gap = Math.max(0, targetWeight - estimatedOneRepMax);
  const requiredWeeklyGain = gap / Math.max(1, weeksLeft);
  const threshold = concurrentInterference >= 2 ? 0.45 : 0.6;
  const verdict = gap === 0 || requiredWeeklyGain <= threshold
    ? GOAL_PACE_VERDICTS.onPace
    : GOAL_PACE_VERDICTS.offPace;

  return buildVerdict({
    goalId: goal.id,
    summary: goal.summary,
    verdict,
    confidence: gap <= 15 ? GOAL_PACE_CONFIDENCE.medium : GOAL_PACE_CONFIDENCE.low,
    keyAnchors: [
      `Bench top set ${formatBenchAnchor(currentAnchor)}`,
      `Estimated 1RM ${round1(estimatedOneRepMax)} lb`,
      `${weeksLeft} weeks to deadline`,
    ],
    majorLimitingFactor: concurrentInterference >= 2
      ? "Running volume and fat-loss pressure shrink the margin for bench-specific progression."
      : "Bench progress still depends on keeping regular upper-body exposures.",
    reason: verdict === GOAL_PACE_VERDICTS.onPace
      ? `Estimated 1RM is about ${round1(estimatedOneRepMax)} lb, leaving roughly ${round1(gap)} lb over ${weeksLeft} weeks. That is a manageable rate if bench work stays consistent.`
      : `Estimated 1RM is about ${round1(estimatedOneRepMax)} lb, which leaves roughly ${round1(gap)} lb over ${weeksLeft} weeks. That is a steep rate once the concurrent run and cut goals are counted.`,
  });
};

const buildRunningVerdict = ({ goal = {}, anchors = {}, now, deadline } = {}) => {
  const runAnchor = anchors?.running || {};
  const goalSeconds = parseTimeTargetSeconds(goal?.primaryMetric?.targetValue || "");
  const goalPaceSeconds = Number.isFinite(goalSeconds) ? goalSeconds / 13.1094 : null;
  const currentPaceSeconds = parsePaceSeconds(runAnchor?.recentPaceText || "") || (
    Number.isFinite(Number(runAnchor?.distanceMiles)) && parseDurationMinutes(runAnchor?.durationMinutes || "") != null
      ? (parseDurationMinutes(runAnchor.durationMinutes) * 60) / Number(runAnchor.distanceMiles)
      : null
  );
  const longestRecentRunMiles = Number(runAnchor?.longestRecentRunMiles || runAnchor?.distanceMiles || 0);
  const weeklyFrequency = Number(runAnchor?.weeklyFrequency || 0);
  const weeksLeft = weeksUntil({ now, deadline });

  if (!Number.isFinite(goalPaceSeconds) || !Number.isFinite(currentPaceSeconds) || longestRecentRunMiles <= 0 || weeksLeft <= 0) {
    return buildVerdict({
      goalId: goal.id,
      summary: goal.summary,
      verdict: GOAL_PACE_VERDICTS.unknown,
      confidence: GOAL_PACE_CONFIDENCE.low,
      keyAnchors: [
        runAnchor?.recentPaceText ? `Recent pace ${runAnchor.recentPaceText}/mi` : "",
        longestRecentRunMiles ? `Longest recent run ${longestRecentRunMiles} mi` : "",
      ].filter(Boolean),
      majorLimitingFactor: "A recent pace and long-run anchor are both required.",
      reason: "Without a recent pace anchor and a longest-run anchor, the app should not pretend to know whether the half-marathon target is on pace.",
    });
  }

  const paceGapSeconds = Math.max(0, currentPaceSeconds - goalPaceSeconds);
  const verdict = (
    weeksLeft >= 20
    && paceGapSeconds <= 75
    && longestRecentRunMiles >= 6
    && weeklyFrequency >= 3
  ) || paceGapSeconds <= 20
    ? GOAL_PACE_VERDICTS.onPace
    : GOAL_PACE_VERDICTS.offPace;

  return buildVerdict({
    goalId: goal.id,
    summary: goal.summary,
    verdict,
    confidence: weeklyFrequency >= 3 && longestRecentRunMiles >= 7 ? GOAL_PACE_CONFIDENCE.medium : GOAL_PACE_CONFIDENCE.low,
    keyAnchors: [
      `Recent pace ${formatPace(currentPaceSeconds)}`,
      `Goal pace ${formatPace(goalPaceSeconds)}`,
      `Longest recent run ${longestRecentRunMiles} mi`,
      weeklyFrequency ? `${weeklyFrequency} runs per week` : "",
    ].filter(Boolean),
    majorLimitingFactor: longestRecentRunMiles < 8
      ? "The long-run anchor is still short relative to a confident half-marathon build."
      : weeklyFrequency < 3
      ? "Run frequency is below the usual floor for a confident half-marathon build."
      : "The current pace still needs to move closer to goal pace.",
    reason: verdict === GOAL_PACE_VERDICTS.onPace
      ? `Current pace is about ${formatPace(currentPaceSeconds)} against a goal pace near ${formatPace(goalPaceSeconds)}, with ${weeksLeft} weeks left and enough long-run runway to make the target plausible.`
      : `Current pace is about ${formatPace(currentPaceSeconds)} versus a goal pace near ${formatPace(goalPaceSeconds)}. The pace gap, long-run anchor, or run frequency is still too soft to call this on pace honestly.`,
  });
};

const buildWeightVerdict = ({ goal = {}, anchors = {}, now, deadline } = {}) => {
  const currentBodyweight = Number(anchors?.bodyweight?.value || anchors?.bodyweight || 0);
  const targetChange = Math.abs(Number(goal?.primaryMetric?.targetValue || 0));
  const weeksLeft = weeksUntil({ now, deadline });

  if (!Number.isFinite(currentBodyweight) || currentBodyweight <= 0 || !Number.isFinite(targetChange) || targetChange <= 0 || weeksLeft <= 0) {
    return buildVerdict({
      goalId: goal.id,
      summary: goal.summary,
      verdict: GOAL_PACE_VERDICTS.unknown,
      confidence: GOAL_PACE_CONFIDENCE.low,
      keyAnchors: [],
      majorLimitingFactor: "A current bodyweight anchor is missing.",
      reason: "A current bodyweight anchor is required before the app can classify a numeric weight-loss target as on pace or off pace.",
    });
  }

  const requiredWeeklyLoss = targetChange / Math.max(1, weeksLeft);
  const requiredBodyweightPct = (requiredWeeklyLoss / currentBodyweight) * 100;
  const verdict = requiredBodyweightPct <= 0.75
    ? GOAL_PACE_VERDICTS.onPace
    : requiredBodyweightPct <= 1.0
    ? GOAL_PACE_VERDICTS.offPace
    : GOAL_PACE_VERDICTS.offPace;

  return buildVerdict({
    goalId: goal.id,
    summary: goal.summary,
    verdict,
    confidence: GOAL_PACE_CONFIDENCE.medium,
    keyAnchors: [
      `Current bodyweight ${round1(currentBodyweight)} lb`,
      `Target loss ${round1(targetChange)} lb`,
      `${weeksLeft} weeks to deadline`,
    ],
    majorLimitingFactor: requiredBodyweightPct > 0.75
      ? "The requested weekly loss rate is too aggressive for a credible cut while performance goals stay active."
      : "Execution quality, not timeline math, is the main limiter here.",
    reason: verdict === GOAL_PACE_VERDICTS.onPace
      ? `Losing about ${round1(targetChange)} lb over ${weeksLeft} weeks requires roughly ${round1(requiredWeeklyLoss)} lb per week, which is a moderate rate from the current anchor.`
      : `Losing about ${round1(targetChange)} lb over ${weeksLeft} weeks requires roughly ${round1(requiredWeeklyLoss)} lb per week, which is too aggressive once recovery and performance are protected honestly.`,
  });
};

const buildAppearanceVerdict = ({ goal = {}, anchors = {} } = {}) => buildVerdict({
  goalId: goal.id,
  summary: goal.summary,
  verdict: GOAL_PACE_VERDICTS.unknown,
  confidence: anchors?.waist?.value && anchors?.bodyweight?.value
    ? GOAL_PACE_CONFIDENCE.medium
    : GOAL_PACE_CONFIDENCE.low,
  keyAnchors: [
    anchors?.bodyweight?.value ? `Bodyweight ${round1(anchors.bodyweight.value)} lb` : "",
    anchors?.waist?.value ? `Waist ${round1(anchors.waist.value)} in` : "",
  ].filter(Boolean),
  majorLimitingFactor: "The app does not have a direct physique or body-fat verifier for six-pack-level leanness.",
  reason: "The app can track waist and bodyweight direction, but it cannot deterministically prove a specific visual outcome like visible abs on a calendar.",
});

const applyPlanRealityAdjustments = ({
  goal = {},
  verdictEntry = null,
  planAudit = {},
} = {}) => {
  if (!verdictEntry) return verdictEntry;

  const riskKeys = getPlanRiskKeys(planAudit);
  if (!riskKeys.size) return verdictEntry;

  if (
    goal.goalFamily === "strength"
    && goal.primaryMetric?.key === "bench_press_weight"
    && (riskKeys.has("bench_specificity_missing") || riskKeys.has("strength_exposure_sparse"))
  ) {
    const explicitBenchExposureCount = Number(planAudit?.summary?.explicitBenchExposureCount || 0);
    return buildVerdict({
      ...verdictEntry,
      verdict: GOAL_PACE_VERDICTS.offPace,
      confidence: GOAL_PACE_CONFIDENCE.medium,
      keyAnchors: appendAnchors(verdictEntry.keyAnchors, [
        `12-week explicit bench sessions ${explicitBenchExposureCount}`,
      ]),
      majorLimitingFactor: "The current 12-week block never surfaces a bench-specific session, so the planner is not dosing the work this target needs.",
      reason: "The anchor math leaves enough calendar runway, but the active 12-week plan never surfaces explicit bench work. The app cannot honestly call 225 on pace while the plan stays run-led and generic-strength-led.",
    });
  }

  if (
    goal.goalFamily === "performance"
    && /half_marathon_time/i.test(goal.primaryMetric?.key || "")
    && riskKeys.has("long_run_progression_flat")
  ) {
    const representativeLongRun = toArray(planAudit?.summary?.longRunDetails).find(Boolean) || "45-60 min";
    return buildVerdict({
      ...verdictEntry,
      verdict: GOAL_PACE_VERDICTS.offPace,
      confidence: GOAL_PACE_CONFIDENCE.medium,
      keyAnchors: appendAnchors(verdictEntry.keyAnchors, [
        `12-week long run ${representativeLongRun}`,
      ]),
      majorLimitingFactor: "The current 12-week block keeps the long run flat instead of progressing it toward race-supportive half-marathon volume.",
      reason: "The anchors make 1:45 look plausible on paper, but the active 12-week plan holds the long run at 45-60 min instead of progressing it. The app should not call the half-marathon goal on pace while that contradiction remains.",
    });
  }

  if (goal.goalFamily === "body_comp" && goal.primaryMetric?.key === "bodyweight_change" && riskKeys.has("body_comp_lane_not_explicit")) {
    return buildVerdict({
      ...verdictEntry,
      confidence: downgradeConfidence(verdictEntry.confidence),
      keyAnchors: appendAnchors(verdictEntry.keyAnchors, [
        "12-week visible body-comp emphasis absent",
      ]),
      majorLimitingFactor: "The requested loss rate is moderate, but the current 12-week block does not expose body composition as a visible planning lane.",
      reason: `${verdictEntry.reason} The timeline math is still reasonable, but the current block is running-led and only lightly operationalizes the cut.`,
    });
  }

  if (goal.goalFamily === "appearance") {
    const majorLimitingFactor = riskKeys.has("body_comp_lane_not_explicit")
      ? "The app lacks a direct physique verifier, and the current 12-week block does not expose an appearance-specific planning lane."
      : verdictEntry.majorLimitingFactor;
    const reason = riskKeys.has("body_comp_lane_not_explicit")
      ? "The app can track waist and bodyweight direction, but it cannot deterministically prove visible abs, and the current 12-week plan does not operationalize a distinct appearance lane."
      : verdictEntry.reason;
    return buildVerdict({
      ...verdictEntry,
      confidence: downgradeConfidence(verdictEntry.confidence),
      keyAnchors: appendAnchors(verdictEntry.keyAnchors, [
        riskKeys.has("body_comp_lane_not_explicit") ? "12-week appearance lane not explicit" : "",
      ]),
      majorLimitingFactor,
      reason,
    });
  }

  return verdictEntry;
};

export const buildGoalPaceScorecard = ({
  goals = [],
  anchors = {},
  now = new Date(),
  deadline = "",
  planAudit = null,
} = {}) => {
  const normalizedGoals = toArray(goals).map((goal) => normalizeGoal(goal)).filter((goal) => goal.summary);
  const activeGoals = normalizedGoals.map((goal) => ({
    goalFamily: goal.goalFamily,
    planningCategory: goal.planningCategory,
  }));

  return normalizedGoals.map((goal) => {
    let verdictEntry = null;
    if (goal.goalFamily === "strength" && goal.primaryMetric?.key === "bench_press_weight") {
      verdictEntry = buildBenchVerdict({ goal, anchors, now, deadline, activeGoals });
      return applyPlanRealityAdjustments({ goal, verdictEntry, planAudit });
    }
    if (goal.goalFamily === "performance" && /half_marathon_time/i.test(goal.primaryMetric?.key || "")) {
      verdictEntry = buildRunningVerdict({ goal, anchors, now, deadline });
      return applyPlanRealityAdjustments({ goal, verdictEntry, planAudit });
    }
    if (goal.goalFamily === "body_comp" && goal.primaryMetric?.key === "bodyweight_change") {
      verdictEntry = buildWeightVerdict({ goal, anchors, now, deadline });
      return applyPlanRealityAdjustments({ goal, verdictEntry, planAudit });
    }
    if (goal.goalFamily === "appearance") {
      verdictEntry = buildAppearanceVerdict({ goal, anchors });
      return applyPlanRealityAdjustments({ goal, verdictEntry, planAudit });
    }
    verdictEntry = buildVerdict({
      goalId: goal.id,
      summary: goal.summary,
      verdict: GOAL_PACE_VERDICTS.unknown,
      confidence: GOAL_PACE_CONFIDENCE.low,
      keyAnchors: [],
      majorLimitingFactor: "This goal does not have a dedicated pace model yet.",
      reason: "The scorecard intentionally stays unknown when the repo does not have a goal-specific pace model.",
    });
    return applyPlanRealityAdjustments({ goal, verdictEntry, planAudit });
  });
};
