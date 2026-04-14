import { normalizeActualNutritionLog, compareNutritionPrescriptionToActual } from "../modules-nutrition.js";
import { getCurrentPrescribedDayRecord } from "./prescribed-day-history-service.js";

export const WEEKLY_NUTRITION_REVIEW_MODEL = "weekly_nutrition_review";
export const WEEKLY_NUTRITION_REVIEW_VERSION = 1;

const cloneWeeklyNutritionValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const toDateKey = (value = new Date()) => {
  if (typeof value === "string" && value) return value;
  const next = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(next.getTime()) ? "" : next.toISOString().split("T")[0];
};

const buildRollingDateKeys = ({ anchorDateKey = "", windowDays = 7 } = {}) => {
  const safeAnchor = toDateKey(anchorDateKey || new Date());
  const anchor = new Date(`${safeAnchor}T12:00:00`);
  const span = Math.max(1, Number(windowDays || 7));
  return Array.from({ length: span }, (_, index) => {
    const next = new Date(anchor);
    next.setDate(anchor.getDate() - (span - 1 - index));
    return next.toISOString().split("T")[0];
  });
};

const clampPct = (value = 0) => Math.max(0, Math.min(100, Math.round(Number(value || 0))));

const scoreAdherence = (adherence = "") => {
  if (adherence === "high") return 2;
  if (adherence === "partial") return 1;
  if (adherence === "low") return 0;
  return null;
};

const summarizeScoreWindow = (days = []) => {
  const scores = (days || []).map((day) => scoreAdherence(day?.comparison?.adherence || "")).filter((value) => value != null);
  if (!scores.length) return null;
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
};

const incrementCounter = (accumulator = {}, key = "") => {
  const normalized = String(key || "").trim();
  if (!normalized) return accumulator;
  return {
    ...accumulator,
    [normalized]: Number(accumulator?.[normalized] || 0) + 1,
  };
};

const listTopCounts = (counts = {}, limit = 3) => (
  Object.entries(counts || {})
    .sort((a, b) => Number(b?.[1] || 0) - Number(a?.[1] || 0) || String(a?.[0] || "").localeCompare(String(b?.[0] || "")))
    .slice(0, Math.max(1, limit))
    .map(([key, count]) => ({ key, count }))
);

const humanizeFrictionKey = (value = "") => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "";
  if (normalized === "hunger") return "hunger";
  if (normalized === "convenience") return "convenience";
  if (normalized === "travel") return "travel";
  if (normalized === "time_pressure") return "time pressure";
  if (normalized === "social") return "social eating";
  if (normalized === "late_day") return "late-day drift";
  return normalized.replace(/_/g, " ");
};

const inferNoteFrictions = (note = "") => {
  const text = String(note || "").toLowerCase();
  const inferred = [];
  if (/late|night|evening|snack/.test(text)) inferred.push("late_day");
  if (/time|busy|rush|work|meetings|schedule/.test(text)) inferred.push("time_pressure");
  if (/social|restaurant|party|drinks|alcohol|family/.test(text)) inferred.push("social");
  if (/travel|airport|hotel/.test(text)) inferred.push("travel");
  if (/convenien|grabbed|quick|takeout|drive.?thru/.test(text)) inferred.push("convenience");
  if (/hungry|hunger|ravenous|craving/.test(text)) inferred.push("hunger");
  return inferred;
};

const normalizeSupplementPlanNames = (plan = null) => {
  const items = Array.isArray(plan)
    ? plan
    : Array.isArray(plan?.items)
    ? plan.items
    : [];
  return items
    .map((item) => {
      if (typeof item === "string") return item.trim();
      return String(item?.name || item?.label || "").trim();
    })
    .filter(Boolean);
};

const normalizeSupplementNameSet = (names = []) => new Set(
  (names || []).map((name) => String(name || "").trim().toLowerCase()).filter(Boolean)
);

const resolveDaySource = ({ dateKey = "", planDay = null, plannedDayRecords = {} } = {}) => {
  if (planDay?.dateKey === dateKey) return planDay;
  const historyEntry = plannedDayRecords?.[dateKey] || null;
  return getCurrentPrescribedDayRecord(historyEntry) || historyEntry || null;
};

const extractNutritionPrescription = (daySource = null) => (
  daySource?.resolved?.nutrition?.prescription
  || daySource?.base?.nutrition?.prescription
  || null
);

const extractSupplementPlan = (daySource = null) => (
  daySource?.resolved?.supplements?.plan
  || daySource?.base?.supplements?.plan
  || []
);

const pickDominantDeviation = (counts = {}) => {
  const preferred = ["under_fueled", "deviated", "over_indulged", "partial"];
  const ordered = Object.entries(counts || {})
    .sort((a, b) => Number(b?.[1] || 0) - Number(a?.[1] || 0) || preferred.indexOf(a?.[0]) - preferred.indexOf(b?.[0]));
  return ordered[0]?.[0] || "";
};

const buildAdherenceTrend = (days = []) => {
  const scoredDays = (days || []).filter((day) => scoreAdherence(day?.comparison?.adherence || "") != null);
  if (scoredDays.length < 3) {
    return {
      label: "limited",
      delta: 0,
      summary: "Weekly adherence signal is still limited.",
    };
  }
  const midpoint = Math.max(1, Math.floor(scoredDays.length / 2));
  const early = summarizeScoreWindow(scoredDays.slice(0, midpoint));
  const late = summarizeScoreWindow(scoredDays.slice(-midpoint));
  const delta = Number(((late || 0) - (early || 0)).toFixed(2));
  const label = delta >= 0.5 ? "improving" : delta <= -0.5 ? "slipping" : "steady";
  const summary = label === "improving"
    ? "Adherence improved across the week."
    : label === "slipping"
    ? "Adherence drifted later in the week."
    : "Adherence stayed fairly steady across the week.";
  return { label, delta, summary };
};

export const deriveWeeklyNutritionAdaptation = ({ summary = null } = {}) => {
  if (!summary?.actual?.loggedDays) {
    return {
      mode: "hold",
      shouldAdapt: false,
      summary: "Keep current nutrition structure until more actual logs are available.",
      support: "The weekly layer stays descriptive until there is enough actual intake data to trust a change.",
      reasons: ["limited_actual_logging"],
      actions: ["Keep logging hydration and meal-plan adherence this week."],
    };
  }

  const lowAdherenceDays = Number(summary?.adherence?.lowDays || 0);
  const underFueledDays = Number(summary?.deviationPattern?.counts?.under_fueled || 0);
  const hydrationBelowDays = Number(summary?.hydration?.belowTargetDays || 0);
  const supplementMissDays = Number(summary?.supplements?.missedDays || 0);
  const dominantFriction = summary?.friction?.topCauses?.[0]?.key || "";
  const hardPrescriptionDays = Number(summary?.prescribed?.hardTrainingDays || 0);

  if (underFueledDays >= 2 && hardPrescriptionDays >= 1) {
    return {
      mode: "protect_key_session_fueling",
      shouldAdapt: true,
      summary: "Protect fueling before and after key sessions next week.",
      support: "Repeated under-fueling showed up against performance-relevant days, so the safest deterministic move is to bias consistency around those sessions.",
      reasons: ["repeated_under_fueling", "hard_training_days_present"],
      actions: [
        "Anchor one pre-session carb and one post-session protein default on quality days.",
        "Do not tighten calories further on hard or long-session days.",
      ],
    };
  }

  if (hydrationBelowDays >= 3) {
    return {
      mode: "reinforce_hydration",
      shouldAdapt: true,
      summary: "Reinforce hydration defaults before making bigger nutrition changes.",
      support: "Hydration missed target on multiple days, so the cleanest near-term adaptation is a hydration anchor rather than a broader prescription rewrite.",
      reasons: ["hydration_inconsistency"],
      actions: [
        "Front-load one bottle before midday and one around training.",
        "Keep the rest of the plan stable while hydration consistency recovers.",
      ],
    };
  }

  if (lowAdherenceDays >= 3 || ["convenience", "travel", "time_pressure", "late_day"].includes(dominantFriction)) {
    return {
      mode: "simplify_defaults",
      shouldAdapt: true,
      summary: "Simplify next week's nutrition defaults to reduce friction.",
      support: "The weekly signal points to execution friction more than target mismatch, so a simpler structure is more credible than adding more rules.",
      reasons: ["execution_friction", dominantFriction || "low_adherence"],
      actions: [
        "Repeat 2 reliable meals and one protein-forward snack most days.",
        "Use one saved fallback meal when schedule pressure hits.",
      ],
    };
  }

  if (supplementMissDays >= 3 && Number(summary?.supplements?.expectedDays || 0) >= 3) {
    return {
      mode: "anchor_supplements",
      shouldAdapt: true,
      summary: "Anchor supplements to one consistent daily routine.",
      support: "Supplement misses are showing up more as routine friction than as a product problem, so timing consistency is the deterministic fix.",
      reasons: ["supplement_routine_drift"],
      actions: [
        "Attach core supplements to breakfast or dinner instead of training timing.",
      ],
    };
  }

  return {
    mode: "hold",
    shouldAdapt: false,
    summary: "Hold the current weekly nutrition structure.",
    support: "The current signal does not justify a deterministic nutrition change beyond reinforcing existing habits.",
    reasons: ["stable_signal"],
    actions: ["Keep the same structure and continue logging planned-vs-actual intake."],
  };
};

export const buildWeeklyNutritionReview = ({
  anchorDateKey = "",
  windowDays = 7,
  planDay = null,
  plannedDayRecords = {},
  nutritionActualLogs = {},
} = {}) => {
  const dateKeys = buildRollingDateKeys({ anchorDateKey, windowDays });
  const days = dateKeys.map((dateKey) => {
    const actual = normalizeActualNutritionLog({
      dateKey,
      feedback: nutritionActualLogs?.[dateKey] || {},
    });
    const daySource = resolveDaySource({ dateKey, planDay, plannedDayRecords });
    const nutritionPrescription = cloneWeeklyNutritionValue(extractNutritionPrescription(daySource));
    const supplementPlanNames = normalizeSupplementPlanNames(extractSupplementPlan(daySource));
    const comparison = compareNutritionPrescriptionToActual({
      nutritionPrescription,
      actualNutritionLog: actual,
    });
    return {
      dateKey,
      actual,
      comparison,
      prescription: {
        hasPrescription: Boolean(nutritionPrescription),
        dayType: nutritionPrescription?.dayType || "",
        targets: cloneWeeklyNutritionValue(nutritionPrescription?.targets || null),
        source: daySource?.id || daySource?.dateKey || "",
      },
      supplements: {
        expectedNames: supplementPlanNames,
        expectedCount: supplementPlanNames.length,
      },
    };
  });

  const actualDays = days.filter((day) => Boolean(day?.comparison?.hasActual));
  const prescribedDays = days.filter((day) => Boolean(day?.comparison?.hasPrescription));
  const adherenceCounts = actualDays.reduce((accumulator, day) => (
    incrementCounter(accumulator, day?.comparison?.adherence || "unknown")
  ), {});
  const deviationCounts = actualDays.reduce((accumulator, day) => {
    const deviationKind = day?.comparison?.deviationKind || "";
    if (!deviationKind || deviationKind === "followed" || deviationKind === "unknown") return accumulator;
    return incrementCounter(accumulator, deviationKind);
  }, {});
  const frictionCounts = actualDays.reduce((accumulator, day) => {
    const issue = String(day?.actual?.issue || "").trim().toLowerCase();
    let nextAccumulator = accumulator;
    if (issue) nextAccumulator = incrementCounter(nextAccumulator, issue);
    inferNoteFrictions(day?.actual?.note || "").forEach((frictionKey) => {
      nextAccumulator = incrementCounter(nextAccumulator, frictionKey);
    });
    return nextAccumulator;
  }, {});

  const hydrationEligibleDays = actualDays.filter((day) => Number(day?.actual?.hydration?.targetOz || 0) > 0);
  const hydrationOnTargetDays = hydrationEligibleDays.filter((day) => Number(day?.actual?.hydration?.pct || 0) >= 85);
  const hydrationAveragePct = hydrationEligibleDays.length
    ? clampPct(hydrationEligibleDays.reduce((sum, day) => sum + Number(day?.actual?.hydration?.pct || 0), 0) / hydrationEligibleDays.length)
    : null;
  const hydrationLabel = !hydrationEligibleDays.length
    ? "limited"
    : hydrationOnTargetDays.length >= Math.ceil(hydrationEligibleDays.length * 0.75)
    ? "consistent"
    : hydrationOnTargetDays.length >= Math.ceil(hydrationEligibleDays.length * 0.4)
    ? "mixed"
    : "inconsistent";

  const supplementExpectedDays = days.filter((day) => Number(day?.supplements?.expectedCount || 0) > 0);
  const supplementRollup = supplementExpectedDays.reduce((accumulator, day) => {
    const expected = normalizeSupplementNameSet(day?.supplements?.expectedNames || []);
    const taken = normalizeSupplementNameSet(day?.actual?.supplements?.takenNames || []);
    const matchedCount = [...expected].filter((name) => taken.has(name)).length;
    if (!expected.size) return accumulator;
    if (matchedCount === expected.size) return { ...accumulator, fullDays: accumulator.fullDays + 1 };
    if (matchedCount > 0) return { ...accumulator, partialDays: accumulator.partialDays + 1 };
    return { ...accumulator, missedDays: accumulator.missedDays + 1 };
  }, { fullDays: 0, partialDays: 0, missedDays: 0 });

  const adherenceTrend = buildAdherenceTrend(days);
  const topFrictionCauses = listTopCounts(frictionCounts, 3).map(({ key, count }) => ({
    key,
    label: humanizeFrictionKey(key),
    count,
  }));
  const dominantDeviation = pickDominantDeviation(deviationCounts);
  const prescribedHardTrainingDays = prescribedDays.filter((day) => (
    ["hardrun", "longrun", "travelrun", "otf"].includes(String(day?.prescription?.dayType || "").toLowerCase())
  ));

  const summary = {
    model: WEEKLY_NUTRITION_REVIEW_MODEL,
    version: WEEKLY_NUTRITION_REVIEW_VERSION,
    window: {
      days: dateKeys.length,
      startDate: dateKeys[0] || "",
      endDate: dateKeys[dateKeys.length - 1] || "",
      anchorDateKey: dateKeys[dateKeys.length - 1] || "",
      dateKeys,
    },
    days,
    prescribed: {
      daysWithPrescription: prescribedDays.length,
      hardTrainingDays: prescribedHardTrainingDays.length,
      coverageLine: `${prescribedDays.length}/${dateKeys.length} days had stored or generated nutrition guidance.`,
    },
    actual: {
      loggedDays: actualDays.length,
      unloggedDays: Math.max(0, dateKeys.length - actualDays.length),
      coverageLine: `${actualDays.length}/${dateKeys.length} days had logged actual nutrition.`,
    },
    adherence: {
      highDays: Number(adherenceCounts.high || 0),
      partialDays: Number(adherenceCounts.partial || 0),
      lowDays: Number(adherenceCounts.low || 0),
      unknownDays: Number(adherenceCounts.unknown || 0),
      onPlanDays: Number(adherenceCounts.high || 0) + Number(adherenceCounts.partial || 0),
      adherenceRate: actualDays.length
        ? clampPct(((Number(adherenceCounts.high || 0) + Number(adherenceCounts.partial || 0)) / actualDays.length) * 100)
        : null,
      trend: adherenceTrend,
      summary: actualDays.length
        ? `${Number(adherenceCounts.high || 0) + Number(adherenceCounts.partial || 0)} of ${actualDays.length} logged days stayed on plan or close to it.`
        : "No actual nutrition logs yet this week.",
    },
    deviationPattern: {
      counts: deviationCounts,
      dominant: dominantDeviation,
      summary: dominantDeviation === "under_fueled"
        ? "Under-fueling was the main deviation pattern."
        : dominantDeviation === "over_indulged"
        ? "Overshooting the plan was the main deviation pattern."
        : dominantDeviation === "deviated"
        ? "Most deviation came from getting off the intended structure."
        : Object.keys(deviationCounts).length
        ? "Deviation patterns were mixed."
        : "No strong deviation pattern showed up.",
    },
    hydration: {
      daysLogged: hydrationEligibleDays.length,
      onTargetDays: hydrationOnTargetDays.length,
      belowTargetDays: Math.max(0, hydrationEligibleDays.length - hydrationOnTargetDays.length),
      avgPct: hydrationAveragePct,
      consistency: hydrationLabel,
      summary: !hydrationEligibleDays.length
        ? "Hydration logging was limited."
        : `${hydrationOnTargetDays.length} of ${hydrationEligibleDays.length} logged days hit at least 85% of hydration target.`,
    },
    supplements: {
      expectedDays: supplementExpectedDays.length,
      fullyTakenDays: supplementRollup.fullDays,
      partialDays: supplementRollup.partialDays,
      missedDays: supplementRollup.missedDays,
      adherenceRate: supplementExpectedDays.length
        ? clampPct((supplementRollup.fullDays / supplementExpectedDays.length) * 100)
        : null,
      expectedNames: Array.from(new Set(supplementExpectedDays.flatMap((day) => day?.supplements?.expectedNames || []))),
      summary: !supplementExpectedDays.length
        ? "No explicit supplement plan was stored for this review window."
        : `${supplementRollup.fullDays} of ${supplementExpectedDays.length} planned supplement days were fully completed.`,
    },
    friction: {
      counts: frictionCounts,
      topCauses: topFrictionCauses,
      summary: topFrictionCauses.length
        ? `Most common friction: ${topFrictionCauses.map((cause) => `${cause.label} (${cause.count})`).join(", ")}.`
        : "No recurring friction cause stood out.",
    },
  };

  const adaptation = deriveWeeklyNutritionAdaptation({ summary });
  return {
    ...summary,
    adaptation,
    coaching: {
      headline: summary.actual.loggedDays
        ? `${summary.adherence.summary} ${summary.hydration.summary}`
        : "Nutrition review is waiting on more actual logs this week.",
      coachLine: adaptation.shouldAdapt
        ? `${adaptation.summary} ${summary.friction.summary}`
        : `${summary.deviationPattern.summary} ${summary.friction.summary}`,
      plannedVsActualLine: `${summary.prescribed.coverageLine} ${summary.actual.coverageLine}`,
    },
  };
};
