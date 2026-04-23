import { dedupeStrings } from "../utils/collection-utils.js";
import { BASELINE_METRIC_KEYS } from "./intake-baseline-service.js";
import { describeProvenanceRecord } from "./provenance-service.js";
import { buildSupportTierModel, SUPPORT_TIER_LEVELS } from "./support-tier-service.js";

const sanitizeText = (value = "", maxLength = 180) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const toNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clonePlainValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const isDistancePrescription = (value = "") => /\b(mi|mile|miles|km|kilometer|kilometers|k)\b/i.test(String(value || ""));

const getLatestDateValue = (rows = []) => [...(Array.isArray(rows) ? rows : [])]
  .filter((row) => String(row?.date || "").trim())
  .sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")))[0] || null;

const toDateLabel = (value = "") => {
  const raw = sanitizeText(value, 24);
  if (!raw) return "";
  const parsed = new Date(`${raw}T12:00:00`);
  return Number.isNaN(parsed.getTime())
    ? raw
    : parsed.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
};

const getDateSortValue = (value = "") => {
  const raw = sanitizeText(value, 24);
  if (!raw) return "";
  return raw;
};

const pickLatestRow = (...rows) => (
  rows
    .flat()
    .filter(Boolean)
    .sort((left, right) => (
      getDateSortValue(right?.date || "").localeCompare(getDateSortValue(left?.date || ""))
      || (normalizeSource(right?.source || "") === "user_override" ? 1 : 0) - (normalizeSource(left?.source || "") === "user_override" ? 1 : 0)
    ))[0] || null
);

const buildProfileWeightFallbackRow = (personalization = {}) => {
  const weight = toNumber(personalization?.profile?.weight, null);
  if (!Number.isFinite(weight) || weight <= 0) return null;
  return {
    date: "",
    value: weight,
    unit: sanitizeText(personalization?.settings?.units?.weight || "lb", 12) || "lb",
    source: personalization?.profile?.profileSetupComplete ? "user_override" : "intake_derived",
    provenance: null,
    note: "",
  };
};

const buildLogBodyweightRow = (bodyweights = []) => {
  const latest = Array.isArray(bodyweights) && bodyweights.length ? bodyweights[bodyweights.length - 1] : null;
  const value = toNumber(latest?.w ?? latest?.weight, null);
  if (!latest?.date || !Number.isFinite(value) || value <= 0) return null;
  return {
    date: sanitizeText(latest.date, 24),
    value,
    unit: "lb",
    source: "log_inferred",
    provenance: null,
    note: "",
  };
};

const buildProvenanceSummary = ({
  row = null,
  source = "placeholder",
  fallback = "",
} = {}) => {
  if (row?.provenance) return describeProvenanceRecord(row.provenance, fallback);
  const normalizedSource = normalizeSource(source);
  if (normalizedSource === "log_inferred") return fallback || "Built from recent logs.";
  if (normalizedSource === "user_override") return fallback || "Saved by you.";
  if (normalizedSource === "intake_derived") return fallback || "Brought over from setup.";
  return fallback || "Can improve accuracy later.";
};

const detectGoalSignals = (goals = []) => {
  const activeGoals = (Array.isArray(goals) ? goals : []).filter((goal) => goal?.active !== false);
  const text = activeGoals.map((goal) => sanitizeText(goal?.resolvedGoal?.summary || goal?.name || "", 180).toLowerCase()).join(" ");
  return {
    activeGoals,
    text,
    hasStrength: activeGoals.some((goal) => goal?.category === "strength") || /\b(bench|squat|deadlift|strength|stronger)\b/.test(text),
    hasRunning: activeGoals.some((goal) => goal?.category === "running") || /\b(run|marathon|half marathon|5k|10k)\b/.test(text),
    hasBodyComp: activeGoals.some((goal) => goal?.category === "body_comp") || /\b(fat loss|recomp|lean|waist|physique|look athletic)\b/.test(text),
    hasSwim: /\b(swim|swimming|pool|open water)\b/.test(text),
    hasPower: activeGoals.some((goal) => goal?.resolvedGoal?.goalFamily === "athletic_power") || /\b(vertical|jump|dunk|explosive|power)\b/.test(text),
    hasReEntry: activeGoals.some((goal) => goal?.resolvedGoal?.goalFamily === "re_entry") || /\b(back in shape|again|return to training|rebuild|starting over)\b/.test(text),
  };
};

const inferLiftBenchmarkFromLogs = (logs = {}) => {
  const rows = Object.entries(logs || {})
    .sort((a, b) => String(b?.[0] || "").localeCompare(String(a?.[0] || "")))
    .flatMap(([dateKey, entry]) => {
      const strengthRows = Array.isArray(entry?.strengthPerformance) ? entry.strengthPerformance : [];
      return strengthRows.map((row) => ({
        date: dateKey,
        exercise: sanitizeText(row?.exercise || ""),
        weight: toNumber(row?.actualWeight ?? row?.weightUsed, null),
        reps: toNumber(row?.actualReps ?? row?.repsCompleted, null),
        sets: toNumber(row?.actualSets, null),
        source: "log_inferred",
      }));
    })
    .filter((row) => row.exercise && row.weight && row.reps);
  return rows[0] || null;
};

const inferRunBenchmarkFromLogs = (logs = {}) => {
  const rows = Object.entries(logs || {})
    .sort((a, b) => String(b?.[0] || "").localeCompare(String(a?.[0] || "")))
    .map(([dateKey, entry]) => ({
      date: dateKey,
      distanceMiles: toNumber(entry?.miles, null),
      durationMinutes: sanitizeText(entry?.runTime || "", 40),
      paceText: sanitizeText(entry?.pace || "", 40),
      source: "log_inferred",
    }))
    .filter((row) => row.distanceMiles || row.durationMinutes || row.paceText);
  return rows[0] || null;
};

const normalizeSource = (value = "") => {
  const source = String(value || "").trim().toLowerCase();
  if (!source) return "placeholder";
  if (source === "user_override" || source === "manual_editor" || source === "explicit_user_input") return "user_override";
  if (source === "log_inferred" || source === "logged") return "log_inferred";
  if (source === "intake_derived" || source === "intake" || source === "legacypersonalization" || source === "legacy_personalization") return "intake_derived";
  return source;
};

const describeSource = (value = "") => {
  const source = normalizeSource(value);
  if (source === "user_override") return "Saved by you";
  if (source === "log_inferred") return "From recent logs";
  if (source === "intake_derived") return "From setup";
  return "Can improve accuracy later";
};

const buildMetricCard = ({
  id = "",
  label = "",
  value = "",
  detail = "",
  source = "placeholder",
  planningImpact = "",
  missing = false,
  requiredNow = false,
  whyItMatters = "",
  missingImpact = "",
  provenanceSummary = "",
  lastUpdatedLabel = "",
} = {}) => ({
  id,
  label,
  value,
  detail,
  source: normalizeSource(source),
  sourceLabel: describeSource(source),
  planningImpact,
  missing: Boolean(missing),
  requiredNow: Boolean(requiredNow),
  whyItMatters: sanitizeText(whyItMatters, 220),
  missingImpact: sanitizeText(missingImpact, 220),
  provenanceSummary: sanitizeText(provenanceSummary, 220),
  lastUpdatedLabel: sanitizeText(lastUpdatedLabel, 80),
});

export const buildMetricsBaselinesModel = ({
  athleteProfile = {},
  personalization = {},
  bodyweights = [],
  logs = {},
} = {}) => {
  const goals = athleteProfile?.goals || [];
  const goalSignals = detectGoalSignals(goals);
  const manualInputs = personalization?.manualProgressInputs || {};
  const trainingContext = athleteProfile?.trainingContext || personalization?.trainingContext || {};
  const supportTier = buildSupportTierModel({
    goals,
    domainAdapterId: athleteProfile?.primaryGoal?.resolvedGoal?.primaryDomain || athleteProfile?.goalCapabilityStack?.primary?.primaryDomain || "",
    goalCapabilityStack: athleteProfile?.goalCapabilityStack || null,
    manualProgressInputs: manualInputs,
  });
  const latestBodyweight = pickLatestRow(
    buildLogBodyweightRow(bodyweights),
    getLatestDateValue(manualInputs?.measurements?.[BASELINE_METRIC_KEYS.bodyweightBaseline] || []),
    buildProfileWeightFallbackRow(personalization)
  );
  const latestWaist = getLatestDateValue(manualInputs?.measurements?.waist_circumference || []);
  const latestLiftBenchmark = getLatestDateValue(manualInputs?.benchmarks?.lift_results || []) || inferLiftBenchmarkFromLogs(logs);
  const latestRunBenchmark = getLatestDateValue(manualInputs?.benchmarks?.run_results || []) || inferRunBenchmarkFromLogs(logs);
  const latestSwimBenchmark = getLatestDateValue(manualInputs?.metrics?.swim_benchmark || []);
  const latestSwimReality = getLatestDateValue(manualInputs?.metrics?.[BASELINE_METRIC_KEYS.swimAccessReality] || []);
  const latestStartingCapacity = getLatestDateValue(manualInputs?.metrics?.[BASELINE_METRIC_KEYS.startingCapacity] || []);
  const latestJumpBenchmark = getLatestDateValue(manualInputs?.metrics?.vertical_jump || []);
  const cards = [];
  const requiredNowCopy = supportTier.id === SUPPORT_TIER_LEVELS.tier3
    ? "Needed to keep the first block safe and repeatable."
    : supportTier.id === SUPPORT_TIER_LEVELS.tier2
    ? "Needed to keep the first block credible."
    : "Needed for a tighter first plan.";

  cards.push(buildMetricCard({
    id: "bodyweight",
    label: "Current bodyweight",
    value: Number.isFinite(latestBodyweight?.value)
      ? `${Number(latestBodyweight.value).toFixed(1)} ${latestBodyweight?.unit || personalization?.settings?.units?.weight || "lb"}`
      : "Missing",
    detail: latestBodyweight?.date
      ? `Last captured ${toDateLabel(latestBodyweight.date)}`
      : "Add a current bodyweight so nutrition and body-composition guidance stay grounded.",
    source: latestBodyweight?.source || "placeholder",
    planningImpact: "Can shift nutrition targets and body-composition pacing.",
    missing: !Number.isFinite(latestBodyweight?.value),
    requiredNow: goalSignals.hasBodyComp && !goalSignals.activeGoals.some((goal) => goal?.resolvedGoal?.goalFamily === "appearance"),
    whyItMatters: "Bodyweight gives the planner a concrete starting point for pacing, recovery cost, and body-composition expectations.",
    missingImpact: goalSignals.hasBodyComp
      ? "Without it, body-composition pacing stays more conservative and less specific."
      : "Without it, nutrition guidance leans on broader defaults.",
    provenanceSummary: buildProvenanceSummary({
      row: latestBodyweight,
      source: latestBodyweight?.source || "placeholder",
      fallback: latestBodyweight?.source === "log_inferred"
        ? "Pulled from recent bodyweight logs."
        : latestBodyweight?.source === "intake_derived"
        ? "Captured during intake."
        : latestBodyweight?.source === "user_override"
        ? "Saved explicitly by you."
        : "No current bodyweight baseline is saved yet.",
    }),
    lastUpdatedLabel: latestBodyweight?.date ? toDateLabel(latestBodyweight.date) : "",
  }));

  if (goalSignals.hasBodyComp) {
    cards.push(buildMetricCard({
      id: "waist",
      label: "Waist proxy",
      value: latestWaist?.value ? `${Number(latestWaist.value).toFixed(1)} in` : "Missing",
      detail: latestWaist?.date ? `Last captured ${toDateLabel(latestWaist.date)}` : "Useful when appearance goals need a non-scale proxy.",
      source: latestWaist?.source || (latestWaist?.value ? "user_override" : "placeholder"),
      planningImpact: "Improves body-composition progress tracking without restarting intake.",
      missing: !latestWaist?.value,
      requiredNow: false,
      whyItMatters: "Waist is a stable visual-change proxy when scale weight is noisy or misleading.",
      missingImpact: "Without it, visual progress depends more on bodyweight trend and check-ins.",
      provenanceSummary: buildProvenanceSummary({
        row: latestWaist,
        source: latestWaist?.source || "placeholder",
        fallback: latestWaist?.value ? "Saved explicitly by you." : "No waist proxy is saved yet.",
      }),
      lastUpdatedLabel: latestWaist?.date ? toDateLabel(latestWaist.date) : "",
    }));
  }

  if (goalSignals.hasStrength) {
    cards.push(buildMetricCard({
      id: "lift_benchmark",
      label: "Current lift benchmark",
      value: latestLiftBenchmark?.weight
        ? dedupeStrings([
            sanitizeText(latestLiftBenchmark.exercise || ""),
            `${latestLiftBenchmark.weight} x ${latestLiftBenchmark.reps || 1}`,
            latestLiftBenchmark.sets ? `${latestLiftBenchmark.sets} sets` : "",
          ]).join(" • ")
        : "Missing",
      detail: latestLiftBenchmark?.date
        ? `Last captured ${toDateLabel(latestLiftBenchmark.date)}`
        : "Add one recent top set so strength work is sized to a real baseline instead of a generic foundation posture.",
      source: latestLiftBenchmark?.source || (latestLiftBenchmark?.weight ? "log_inferred" : "placeholder"),
      planningImpact: "Can change strength session labels, dose, and loading posture.",
      missing: !latestLiftBenchmark?.weight,
      requiredNow: true,
      whyItMatters: "A real top set or recent lift benchmark is what lets the planner progress strength instead of hedging.",
      missingImpact: "Without it, strength work stays technique-first and more conservative.",
      provenanceSummary: buildProvenanceSummary({
        row: latestLiftBenchmark,
        source: latestLiftBenchmark?.source || "placeholder",
        fallback: latestLiftBenchmark?.weight
          ? latestLiftBenchmark?.source === "log_inferred"
            ? "Inferred from recent strength logs."
            : "Saved explicitly by you."
          : "No current lift benchmark is saved yet.",
      }),
      lastUpdatedLabel: latestLiftBenchmark?.date ? toDateLabel(latestLiftBenchmark.date) : "",
    }));
  }

  if (goalSignals.hasRunning) {
    cards.push(buildMetricCard({
      id: "run_benchmark",
      label: "Recent running anchor",
      value: latestRunBenchmark
        ? dedupeStrings([
            latestRunBenchmark.distanceMiles ? `${latestRunBenchmark.distanceMiles} mi` : "",
            latestRunBenchmark.durationMinutes ? `${latestRunBenchmark.durationMinutes} min` : "",
            latestRunBenchmark.paceText || "",
          ]).join(" • ") || "Recent running anchor"
        : "Missing",
      detail: latestRunBenchmark?.date
        ? `Last captured ${toDateLabel(latestRunBenchmark.date)}`
        : "Add a recent run result or pace anchor so long-run sizing stops leaning on generic defaults.",
      source: latestRunBenchmark?.source || (latestRunBenchmark ? "log_inferred" : "placeholder"),
      planningImpact: "Can change easy-run and long-run sizing.",
      missing: !latestRunBenchmark,
      requiredNow: true,
      whyItMatters: "A recent run anchor tells the planner what your aerobic engine actually looks like right now.",
      missingImpact: "Without it, run volume stays on broader foundation defaults.",
      provenanceSummary: buildProvenanceSummary({
        row: latestRunBenchmark,
        source: latestRunBenchmark?.source || "placeholder",
        fallback: latestRunBenchmark
          ? latestRunBenchmark?.source === "log_inferred"
            ? "Inferred from recent running logs."
            : "Saved explicitly by you."
          : "No recent run anchor is saved yet.",
      }),
      lastUpdatedLabel: latestRunBenchmark?.date ? toDateLabel(latestRunBenchmark.date) : "",
    }));
  }

  if (goalSignals.hasSwim) {
    cards.push(buildMetricCard({
      id: "swim_benchmark",
      label: "Recent swim anchor",
      value: latestSwimBenchmark
        ? dedupeStrings([
            latestSwimBenchmark.distance ? `${latestSwimBenchmark.distance} ${latestSwimBenchmark.distanceUnit || "yd"}` : "",
            latestSwimBenchmark.duration ? `${latestSwimBenchmark.duration}` : "",
            latestSwimBenchmark.note || "",
          ]).join(" • ") || "Recent swim anchor"
        : "Missing",
      detail: latestSwimBenchmark?.date
        ? `Last captured ${toDateLabel(latestSwimBenchmark.date)}`
        : "Add one swim distance or time anchor so swim volume stays honest.",
      source: latestSwimBenchmark?.source || (latestSwimBenchmark ? "user_override" : "placeholder"),
      planningImpact: "Can change swim session volume and technique-vs-conditioning bias.",
      missing: !latestSwimBenchmark,
      requiredNow: true,
      whyItMatters: "A recent swim anchor keeps the swim block from pretending you are either fresher or fitter than you are.",
      missingImpact: "Without it, swim work stays more conservative and technique-biased.",
      provenanceSummary: buildProvenanceSummary({
        row: latestSwimBenchmark,
        source: latestSwimBenchmark?.source || "placeholder",
        fallback: latestSwimBenchmark ? "Saved as your current swim anchor." : "No current swim anchor is saved yet.",
      }),
      lastUpdatedLabel: latestSwimBenchmark?.date ? toDateLabel(latestSwimBenchmark.date) : "",
    }));
    cards.push(buildMetricCard({
      id: "swim_access_reality",
      label: "Pool / open-water reality",
      value: latestSwimReality?.label || latestSwimReality?.value?.replaceAll("_", " ") || "Missing",
      detail: latestSwimReality?.date
        ? `Last captured ${toDateLabel(latestSwimReality.date)}`
        : "Tell us whether the goal is mostly pool, open water, or both right now.",
      source: latestSwimReality?.source || (latestSwimReality?.value ? "user_override" : "placeholder"),
      planningImpact: "Can change session structure, technique emphasis, and realism of the first swim block.",
      missing: !latestSwimReality?.value,
      requiredNow: true,
      whyItMatters: "Pool structure and open-water reality create very different early swim plans.",
      missingImpact: "Without it, the swim block assumes the broadest safe setup and stays less specific.",
      provenanceSummary: buildProvenanceSummary({
        row: latestSwimReality,
        source: latestSwimReality?.source || "placeholder",
        fallback: latestSwimReality?.value ? "Saved as your current swim environment reality." : "No swim environment reality is saved yet.",
      }),
      lastUpdatedLabel: latestSwimReality?.date ? toDateLabel(latestSwimReality.date) : "",
    }));
  }

  if (goalSignals.hasReEntry) {
    cards.push(buildMetricCard({
      id: "starting_capacity",
      label: "Safe starting capacity",
      value: latestStartingCapacity?.label || latestStartingCapacity?.value?.replaceAll("_", " ") || "Missing",
      detail: latestStartingCapacity?.date
        ? `Last captured ${toDateLabel(latestStartingCapacity.date)}`
        : "Save what feels repeatable right now so the first block starts where you actually are.",
      source: latestStartingCapacity?.source || (latestStartingCapacity?.value ? "user_override" : "placeholder"),
      planningImpact: "Sets how short, steady, or ambitious the opening block can be.",
      missing: !latestStartingCapacity?.value,
      requiredNow: true,
      whyItMatters: "For re-entry goals, safe repeatable capacity matters more than advanced performance metrics.",
      missingImpact: "Without it, the first block stays shorter and more cautious on purpose.",
      provenanceSummary: buildProvenanceSummary({
        row: latestStartingCapacity,
        source: latestStartingCapacity?.source || "placeholder",
        fallback: latestStartingCapacity?.value ? "Saved as your current safe starting capacity." : "No safe starting capacity is saved yet.",
      }),
      lastUpdatedLabel: latestStartingCapacity?.date ? toDateLabel(latestStartingCapacity.date) : "",
    }));
  }

  if (goalSignals.hasPower) {
    cards.push(buildMetricCard({
      id: "power_benchmark",
      label: "Jump / power anchor",
      value: latestJumpBenchmark
        ? dedupeStrings([
            latestJumpBenchmark.value ? `${latestJumpBenchmark.value} ${latestJumpBenchmark.unit || "in"}` : "",
            latestJumpBenchmark.note || "",
          ]).join(" • ") || "Jump anchor"
        : "Missing",
      detail: latestJumpBenchmark?.date
        ? `Last captured ${toDateLabel(latestJumpBenchmark.date)}`
        : "Add one jump, rim-touch, or dunk anchor so plyometric dosing stays believable.",
      source: latestJumpBenchmark?.source || (latestJumpBenchmark ? "user_override" : "placeholder"),
      planningImpact: "Can change power-session dose and progression posture.",
      missing: !latestJumpBenchmark,
      requiredNow: false,
      whyItMatters: "A jump anchor helps the planner scale power work to your actual starting point.",
      missingImpact: "Without it, power work stays more conservative.",
      provenanceSummary: buildProvenanceSummary({
        row: latestJumpBenchmark,
        source: latestJumpBenchmark?.source || "placeholder",
        fallback: latestJumpBenchmark ? "Saved as your current jump anchor." : "No jump anchor is saved yet.",
      }),
      lastUpdatedLabel: latestJumpBenchmark?.date ? toDateLabel(latestJumpBenchmark.date) : "",
    }));
  }

  cards.push(buildMetricCard({
    id: "environment",
    label: "Environment and equipment",
    value: dedupeStrings([
      sanitizeText(trainingContext?.environment?.value || "", 60).replace(/_/g, " "),
      sanitizeText(trainingContext?.equipmentAccess?.value || "", 60).replace(/_/g, " "),
      sanitizeText(trainingContext?.sessionDuration?.value || "", 40),
    ]).join(" • ") || "Unknown",
    detail: Array.isArray(trainingContext?.equipmentAccess?.items) && trainingContext.equipmentAccess.items.length
      ? trainingContext.equipmentAccess.items.join(", ")
      : "Update environment and equipment if the plan is assuming the wrong setup.",
    source: trainingContext?.environment?.source || trainingContext?.equipmentAccess?.source || "placeholder",
    planningImpact: "Can swap session families and shorten or expand prescriptions safely.",
    missing: !trainingContext?.environment?.confirmed || !trainingContext?.equipmentAccess?.confirmed,
    requiredNow: false,
    whyItMatters: "Environment and equipment reality determine which session shapes are actually usable this week.",
    missingImpact: "Without it, the plan leans on broader substitutions.",
    provenanceSummary: trainingContext?.environment?.confirmed || trainingContext?.equipmentAccess?.confirmed
      ? "Saved from your training setup."
      : "Can improve accuracy later.",
  }));

  return {
    cards,
    missingCards: cards.filter((card) => card.missing),
    lowConfidenceCount: cards.filter((card) => card.source === "placeholder" || (card.missing && card.requiredNow)).length,
    supportTier,
    requiredNowCopy,
  };
};

export const buildPlanningBaselineInfluence = ({
  goals = [],
  personalization = {},
  bodyweights = [],
  logs = {},
} = {}) => {
  const signals = detectGoalSignals(goals);
  const model = buildMetricsBaselinesModel({
    athleteProfile: { goals, trainingContext: personalization?.trainingContext || null },
    personalization,
    bodyweights,
    logs,
  });
  const cardsById = Object.fromEntries((model.cards || []).map((card) => [card.id, card]));
  const liftRow = getLatestDateValue(personalization?.manualProgressInputs?.benchmarks?.lift_results || []) || inferLiftBenchmarkFromLogs(logs);
  const runRow = getLatestDateValue(personalization?.manualProgressInputs?.benchmarks?.run_results || []) || inferRunBenchmarkFromLogs(logs);
  const swimRow = getLatestDateValue(personalization?.manualProgressInputs?.metrics?.swim_benchmark || []);
  const swimRealityRow = getLatestDateValue(personalization?.manualProgressInputs?.metrics?.[BASELINE_METRIC_KEYS.swimAccessReality] || []);
  const startingCapacityRow = getLatestDateValue(personalization?.manualProgressInputs?.metrics?.[BASELINE_METRIC_KEYS.startingCapacity] || []);
  const jumpRow = getLatestDateValue(personalization?.manualProgressInputs?.metrics?.vertical_jump || []);
  const strengthLevel = !signals.hasStrength
    ? ""
    : !liftRow?.weight
    ? "foundation"
    : Number(liftRow.weight) >= 225
    ? "top_set"
    : Number(liftRow.weight) >= 135
    ? "progression"
    : "foundation";

  const runningLevel = !signals.hasRunning
    ? ""
    : !runRow
    ? "foundation"
    : Number(runRow.distanceMiles || 0) >= 8
    ? "established"
    : Number(runRow.distanceMiles || 0) >= 4
    ? "build"
    : "foundation";

  const swimLevel = !signals.hasSwim
    ? ""
    : !swimRow
    ? "foundation"
    : Number(swimRow.distance || 0) >= 1500
    ? "endurance_build"
    : "technique_base";

  const powerLevel = !signals.hasPower
    ? ""
    : !jumpRow
    ? "foundation"
    : Number(jumpRow.value || 0) >= 24
    ? "progression"
    : "foundation";
  const safeStartLevel = !signals.hasReEntry
    ? ""
    : sanitizeText(startingCapacityRow?.value || "", 80).toLowerCase();
  const lowConfidenceMessages = dedupeStrings([
    cardsById.lift_benchmark?.missing && cardsById.lift_benchmark?.requiredNow
      ? "Strength work is staying technique-first until you add a recent lift anchor."
      : "",
    cardsById.run_benchmark?.missing && cardsById.run_benchmark?.requiredNow
      ? "Run volume is staying conservative until you add a recent run anchor."
      : "",
    cardsById.swim_benchmark?.missing && cardsById.swim_benchmark?.requiredNow
      ? "Swim work is staying conservative until you add a recent swim anchor."
      : "",
    cardsById.swim_access_reality?.missing && cardsById.swim_access_reality?.requiredNow
      ? "Swim structure is staying broad until you confirm whether this is mostly pool, open water, or both."
      : "",
    cardsById.starting_capacity?.missing && cardsById.starting_capacity?.requiredNow
      ? "The first block stays shorter and more cautious until you confirm what feels repeatable right now."
      : "",
    cardsById.bodyweight?.missing && cardsById.bodyweight?.requiredNow
      ? "Body-composition pacing is staying conservative until you add a current bodyweight."
      : "",
  ]);

  return {
    model,
    summaryLines: dedupeStrings([
      strengthLevel && cardsById.lift_benchmark && !cardsById.lift_benchmark.missing
        ? `${cardsById.lift_benchmark.value} is anchoring strength dosing.`
        : "",
      runningLevel && cardsById.run_benchmark && !cardsById.run_benchmark.missing
        ? `${cardsById.run_benchmark.value} is anchoring run volume.`
        : "",
      swimLevel && cardsById.swim_benchmark && !cardsById.swim_benchmark.missing
        ? `${cardsById.swim_benchmark.value} is anchoring swim volume.`
        : "",
      swimRealityRow?.value && !cardsById.swim_access_reality?.missing
        ? `${cardsById.swim_access_reality?.value || swimRealityRow?.label || swimRealityRow?.value} is shaping swim structure.`
        : "",
      safeStartLevel && !cardsById.starting_capacity?.missing
        ? `${cardsById.starting_capacity.value} is shaping the starting block.`
        : "",
      powerLevel && cardsById.power_benchmark && !cardsById.power_benchmark.missing
        ? `${cardsById.power_benchmark.value} is anchoring jump exposure.`
        : "",
    ]),
    lowConfidenceMessages,
    strength: {
      level: strengthLevel,
      benchmark: clonePlainValue(liftRow),
    },
    running: {
      level: runningLevel,
      benchmark: clonePlainValue(runRow),
    },
    swimming: {
      level: swimLevel,
      benchmark: clonePlainValue(swimRow),
      reality: clonePlainValue(swimRealityRow),
    },
    power: {
      level: powerLevel,
      benchmark: clonePlainValue(jumpRow),
    },
    safeStart: {
      level: safeStartLevel,
      anchor: clonePlainValue(startingCapacityRow),
    },
  };
};

export const applyPlanningBaselineInfluence = ({
  dayTemplates = {},
  influence = null,
} = {}) => {
  const next = clonePlainValue(dayTemplates || {});
  const summaryLines = [];

  Object.values(next).forEach((session) => {
    if (!session || typeof session !== "object") return;

    if (String(session?.type || "").toLowerCase() === "strength+prehab" && influence?.strength?.level) {
      if (influence.strength.level === "foundation") {
        session.label = /foundation/i.test(String(session.label || "")) ? session.label : `Foundation ${session.label || "Strength"}`;
        session.strengthDose = "30-40 min base strength";
        session.intensityGuidance = "Own clean reps and leave room in reserve until the baseline sharpens.";
      } else if (influence.strength.level === "progression") {
        session.label = /progression|top-set/i.test(String(session.label || "")) ? session.label : `Progression ${session.label || "Strength"}`;
        session.strengthDose = "35-50 min main lift + backoff work";
        session.intensityGuidance = "Push the main lift, then keep backoff work crisp.";
      } else if (influence.strength.level === "top_set") {
        session.label = /top-set/i.test(String(session.label || "")) ? session.label : `Top-Set ${session.label || "Strength"}`;
        session.strengthDose = "45-60 min top set + backoff strength";
        session.intensityGuidance = "A top set can lead the day as long as bar speed stays honest.";
      }
    }

    if (String(session?.type || "").toLowerCase() === "easy-run" && influence?.running?.level) {
      if (influence.running.level === "foundation") {
        session.label = /run\/walk/i.test(String(session.label || "")) ? session.label : "Easy Run / Walk";
        session.run = { ...(session.run || {}), d: isDistancePrescription(session.run?.d) ? session.run?.d : "20-30 min", t: session.run?.t || "Easy" };
      } else if (influence.running.level === "build") {
        session.run = { ...(session.run || {}), d: isDistancePrescription(session.run?.d) ? session.run?.d : "25-35 min", t: session.run?.t || "Easy" };
      } else if (influence.running.level === "established") {
        session.run = { ...(session.run || {}), d: isDistancePrescription(session.run?.d) ? session.run?.d : "35-45 min", t: session.run?.t || "Easy" };
      }
    }

    if (String(session?.type || "").toLowerCase() === "long-run" && influence?.running?.level) {
      if (influence.running.level === "foundation") {
        session.label = "Long Run Build";
        session.run = { ...(session.run || {}), d: isDistancePrescription(session.run?.d) ? session.run?.d : "35-45 min", t: "Long easy" };
      } else if (influence.running.level === "build") {
        session.run = { ...(session.run || {}), d: isDistancePrescription(session.run?.d) ? session.run?.d : "45-60 min", t: session.run?.t || "Long" };
      } else if (influence.running.level === "established") {
        session.run = { ...(session.run || {}), d: isDistancePrescription(session.run?.d) ? session.run?.d : "60-80 min", t: session.run?.t || "Long" };
      }
    }

    if (/^swim-/.test(String(session?.type || "").toLowerCase()) && influence?.swimming?.level) {
      if (influence.swimming.level === "foundation") {
        session.swim = { ...(session.swim || {}), d: "30-40 min", focus: session.swim?.focus || "Technique + aerobic rhythm" };
      } else if (influence.swimming.level === "technique_base") {
        session.swim = { ...(session.swim || {}), d: "35-45 min" };
      } else if (influence.swimming.level === "endurance_build") {
        session.swim = { ...(session.swim || {}), d: "45-60 min" };
      }
      if (influence?.swimming?.reality?.value === "open_water") {
        session.swim = { ...(session.swim || {}), focus: session.swim?.focus || "Open-water rhythm + pacing" };
      } else if (influence?.swimming?.reality?.value === "pool") {
        session.swim = { ...(session.swim || {}), focus: session.swim?.focus || "Pool structure + repeatable pacing" };
      }
    }

    if (influence?.safeStart?.level && ["conditioning", "easy-run", "aerobic-base", "walk", "general_aerobic"].includes(String(session?.type || "").toLowerCase())) {
      if (influence.safeStart.level === "walk_only") {
        session.label = /walk/i.test(String(session.label || "")) ? session.label : `Walk ${session.label || "Session"}`;
        session.intensityGuidance = "Keep this easy enough to repeat without strain.";
      } else if (influence.safeStart.level === "10_easy_minutes") {
        session.intensityGuidance = "Keep this in a short, easy, repeatable range.";
      }
    }

    if (["power-skill", "reactive-plyo", "sprint-support"].includes(String(session?.type || "").toLowerCase()) && influence?.power?.level) {
      if (influence.power.level === "foundation") {
        session.power = { ...(session.power || {}), dose: "15-20 min", support: "Low-dose contacts and landings first." };
      } else if (influence.power.level === "progression") {
        session.power = { ...(session.power || {}), dose: "20-30 min", support: "Progression contacts with clean rest and landing quality." };
      }
    }
  });

  if (influence?.summaryLines?.length) summaryLines.push(...influence.summaryLines);
  return {
    dayTemplates: next,
    summaryLines: dedupeStrings(summaryLines).slice(0, 4),
  };
};
