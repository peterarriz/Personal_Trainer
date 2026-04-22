import { buildGoalDriverProfile, normalizeGoalDriverProfile } from "./goal-driver-graph-service.js";
import { buildExerciseTransferProfile, normalizeExerciseTransferProfile } from "./exercise-transfer-profile-service.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const GOAL_PROGRESS_STATUSES = {
  onTrack: "on_track",
  building: "building",
  reviewBased: "review_based",
  needsData: "needs_data",
};

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const uniqueStrings = (items = []) => [...new Set((Array.isArray(items) ? items : []).map((item) => sanitizeText(item, 120)).filter(Boolean))];

const asDate = (value = null) => {
  if (!value) return new Date();
  if (value instanceof Date) return new Date(value.getTime());
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const isWithinAgeWindow = ({ dateKey = "", now = new Date(), minDays = 0, maxDays = 21 } = {}) => {
  const parsed = new Date(`${sanitizeText(dateKey, 24)}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return false;
  const ageDays = Math.max(0, Math.floor((asDate(now).getTime() - parsed.getTime()) / ONE_DAY_MS));
  return ageDays >= minDays && ageDays <= maxDays;
};

const resolveStrengthLiftKey = (goal = {}) => {
  const primaryMetricKey = sanitizeText(goal?.primaryMetric?.key || goal?.resolvedGoal?.primaryMetric?.key || "", 80).toLowerCase();
  const text = sanitizeText([
    goal?.summary,
    goal?.resolvedGoal?.summary,
    goal?.primaryMetric?.label,
    goal?.resolvedGoal?.primaryMetric?.label,
  ].filter(Boolean).join(" "), 240).toLowerCase();
  if (/bench/.test(primaryMetricKey) || /\bbench\b/.test(text)) return "bench";
  if (/squat/.test(primaryMetricKey) || /\bsquat\b/.test(text)) return "squat";
  if (/deadlift/.test(primaryMetricKey) || /\bdeadlift|hinge\b/.test(text)) return "deadlift";
  if (/ohp|overhead/.test(primaryMetricKey) || /\bohp|overhead press|shoulder press\b/.test(text)) return "ohp";
  return "";
};

const isDirectStrengthMatch = ({ goal = {}, record = {} } = {}) => {
  const goalLiftKey = resolveStrengthLiftKey(goal);
  if (!goalLiftKey) return false;
  return sanitizeText(record?.liftKey || "", 40).toLowerCase() === goalLiftKey;
};

const createTrackedItem = ({
  key = "",
  label = "",
  kind = "proxy",
  metricRefs = [],
  status = GOAL_PROGRESS_STATUSES.building,
  currentDisplay = "",
  targetDisplay = "",
  trendDisplay = "",
  why = "",
} = {}) => ({
  key: sanitizeText(key, 60).toLowerCase(),
  label: sanitizeText(label, 80),
  kind: sanitizeText(kind, 20).toLowerCase() || "proxy",
  metricRefs: uniqueStrings(metricRefs.map((item) => sanitizeText(item, 60).toLowerCase())).slice(0, 6),
  status,
  currentDisplay: sanitizeText(currentDisplay, 180),
  targetDisplay: sanitizeText(targetDisplay, 160),
  trendDisplay: sanitizeText(trendDisplay, 180),
  why: sanitizeText(why, 220),
});

const getContributionCopy = (profile = null) => {
  const domain = sanitizeText(profile?.primaryDomain || "", 80).toLowerCase();
  if (domain === "strength_hypertrophy") {
    return {
      key: "support_work_coverage",
      label: "Support work",
      why: "Support work does not replace the main lift, but it can explain why direct progress is moving or stuck.",
    };
  }
  if (domain === "running_endurance") {
    return {
      key: "support_capacity_work",
      label: "Support capacity",
      why: "Gym support work can improve durability and economy, but it never replaces running itself.",
    };
  }
  if (domain === "swimming_endurance_technique") {
    return {
      key: "dryland_support",
      label: "Dryland support",
      why: "Dryland work can reinforce the muscles and positions that keep swim pace repeatable, even though it does not replace pool time.",
    };
  }
  if (domain === "hybrid_multi_domain") {
    return {
      key: "hybrid_support_work",
      label: "Support work",
      why: "Support work should reinforce the lead goal lane without quietly undercutting the other one.",
    };
  }
  return {
    key: "support_driver_coverage",
    label: "Support drivers",
    why: "Support work can matter even when it is not the headline metric for the goal.",
  };
};

const summarizeContributionWindow = ({
  records = [],
  goal = {},
  profile = null,
  excludeDirectStrengthMatches = false,
} = {}) => {
  const supportDriverIds = new Set((profile?.supportDrivers || []).map((driver) => driver?.id).filter(Boolean));
  const protectiveDriverIds = new Set((profile?.protectiveDrivers || []).map((driver) => driver?.id).filter(Boolean));
  const matchedSupportIds = new Set();
  const matchedProtectiveIds = new Set();
  const matchedExercises = [];

  (Array.isArray(records) ? records : []).forEach((record) => {
    if (excludeDirectStrengthMatches && isDirectStrengthMatch({ goal, record })) return;
    const transferProfile = normalizeExerciseTransferProfile(record?.transferProfile)
      || buildExerciseTransferProfile({ exerciseName: record?.exercise || "", note: record?.note || "" });
    if (!transferProfile) return;
    let matched = false;
    (transferProfile?.supportDriverIds || []).forEach((driverId) => {
      if (supportDriverIds.has(driverId)) {
        matchedSupportIds.add(driverId);
        matched = true;
      }
    });
    (transferProfile?.protectiveDriverIds || []).forEach((driverId) => {
      if (protectiveDriverIds.has(driverId)) {
        matchedProtectiveIds.add(driverId);
        matched = true;
      }
    });
    if (matched) matchedExercises.push(record?.exercise || "");
  });

  return {
    matchedSupportIds,
    matchedProtectiveIds,
    matchedExercises: uniqueStrings(matchedExercises).slice(0, 4),
  };
};

export const buildGoalSupportContributionItem = ({
  goal = {},
  exerciseRecords = [],
  now = new Date(),
} = {}) => {
  const profile = normalizeGoalDriverProfile(goal?.driverProfile || goal?.resolvedGoal?.driverProfile || null)
    || buildGoalDriverProfile({ goal });
  if (!profile?.supportDrivers?.length && !profile?.protectiveDrivers?.length) return null;

  const recentRecords = (Array.isArray(exerciseRecords) ? exerciseRecords : []).filter((record) => (
    isWithinAgeWindow({ dateKey: record?.date || "", now, minDays: 0, maxDays: 21 })
  ));
  const priorRecords = (Array.isArray(exerciseRecords) ? exerciseRecords : []).filter((record) => (
    isWithinAgeWindow({ dateKey: record?.date || "", now, minDays: 22, maxDays: 42 })
  ));
  const excludeDirectStrengthMatches = sanitizeText(profile?.primaryDomain || "", 80).toLowerCase() === "strength_hypertrophy";
  const recent = summarizeContributionWindow({ records: recentRecords, goal, profile, excludeDirectStrengthMatches });
  const prior = summarizeContributionWindow({ records: priorRecords, goal, profile, excludeDirectStrengthMatches });
  const supportTotal = Math.max(1, (profile?.supportDrivers || []).length);
  const protectiveTotal = Math.max(0, (profile?.protectiveDrivers || []).length);
  const supportCount = recent.matchedSupportIds.size;
  const protectiveCount = recent.matchedProtectiveIds.size;

  if (supportCount === 0 && protectiveCount === 0 && prior.matchedSupportIds.size === 0 && prior.matchedProtectiveIds.size === 0) {
    return null;
  }

  const copy = getContributionCopy(profile);
  const coverageRatio = supportCount / supportTotal;
  const currentDisplay = protectiveTotal > 0
    ? `${supportCount}/${supportTotal} support drivers and ${protectiveCount}/${protectiveTotal} protective drivers touched in the last 21 days`
    : `${supportCount}/${supportTotal} support drivers touched in the last 21 days`;
  const exerciseLine = recent.matchedExercises.length
    ? `Recent evidence: ${recent.matchedExercises.join(", ")}`
    : "";
  const supportDelta = supportCount - prior.matchedSupportIds.size;
  const protectiveDelta = protectiveCount - prior.matchedProtectiveIds.size;
  const deltaParts = [];
  if (prior.matchedSupportIds.size > 0 || supportDelta !== 0) {
    deltaParts.push(`${supportDelta > 0 ? "+" : ""}${supportDelta} support drivers vs the prior 21 days`);
  }
  if (protectiveTotal > 0 && (prior.matchedProtectiveIds.size > 0 || protectiveDelta !== 0)) {
    deltaParts.push(`${protectiveDelta > 0 ? "+" : ""}${protectiveDelta} protective drivers vs the prior 21 days`);
  }
  const trendDisplay = uniqueStrings([...deltaParts, exerciseLine]).join(" - ");
  const status = coverageRatio >= 0.5 || protectiveCount >= Math.max(1, Math.ceil(protectiveTotal / 2))
    ? GOAL_PROGRESS_STATUSES.onTrack
    : (supportCount > 0 || protectiveCount > 0)
    ? GOAL_PROGRESS_STATUSES.building
    : GOAL_PROGRESS_STATUSES.needsData;

  return createTrackedItem({
    key: copy.key,
    label: copy.label,
    kind: "proxy",
    metricRefs: [
      "support_driver_coverage",
      ...(profile?.supportDrivers || []).map((driver) => driver?.id),
      ...(profile?.protectiveDrivers || []).map((driver) => driver?.id),
    ],
    status,
    currentDisplay,
    targetDisplay: "Support work should reinforce the main goal, not replace it.",
    trendDisplay,
    why: copy.why,
  });
};
