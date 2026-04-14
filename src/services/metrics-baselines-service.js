import { dedupeStrings } from "../utils/collection-utils.js";

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

const getLatestDateValue = (rows = []) => [...(Array.isArray(rows) ? rows : [])]
  .filter((row) => String(row?.date || "").trim())
  .sort((a, b) => String(b?.date || "").localeCompare(String(a?.date || "")))[0] || null;

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
  if (source === "user_override") return "Explicit user input";
  if (source === "log_inferred") return "Inferred from logs";
  if (source === "intake_derived") return "Derived from intake";
  return "Low-confidence placeholder";
};

const buildMetricCard = ({
  id = "",
  label = "",
  value = "",
  detail = "",
  source = "placeholder",
  planningImpact = "",
  missing = false,
} = {}) => ({
  id,
  label,
  value,
  detail,
  source: normalizeSource(source),
  sourceLabel: describeSource(source),
  planningImpact,
  missing: Boolean(missing),
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
  const latestBodyweight = bodyweights?.length
    ? bodyweights[bodyweights.length - 1]
    : null;
  const latestWaist = getLatestDateValue(manualInputs?.measurements?.waist_circumference || []);
  const latestLiftBenchmark = getLatestDateValue(manualInputs?.benchmarks?.lift_results || []) || inferLiftBenchmarkFromLogs(logs);
  const latestRunBenchmark = getLatestDateValue(manualInputs?.benchmarks?.run_results || []) || inferRunBenchmarkFromLogs(logs);
  const latestSwimBenchmark = getLatestDateValue(manualInputs?.metrics?.swim_benchmark || []);
  const latestJumpBenchmark = getLatestDateValue(manualInputs?.metrics?.vertical_jump || []);
  const cards = [];

  cards.push(buildMetricCard({
    id: "bodyweight",
    label: "Current bodyweight",
    value: latestBodyweight?.w ? `${Number(latestBodyweight.w).toFixed(1)} lb` : personalization?.profile?.weight ? `${Number(personalization.profile.weight).toFixed(1)} ${personalization?.settings?.units?.weight || "lb"}` : "Missing",
    detail: latestBodyweight?.date ? `Last captured ${latestBodyweight.date}` : "Add a current bodyweight so nutrition and body-composition guidance stay grounded.",
    source: latestBodyweight?.w ? "log_inferred" : personalization?.profile?.weight ? (personalization?.profile?.profileSetupComplete ? "user_override" : "intake_derived") : "placeholder",
    planningImpact: "Can shift nutrition targets and body-composition pacing.",
    missing: !(latestBodyweight?.w || personalization?.profile?.weight),
  }));

  if (goalSignals.hasBodyComp) {
    cards.push(buildMetricCard({
      id: "waist",
      label: "Waist proxy",
      value: latestWaist?.value ? `${Number(latestWaist.value).toFixed(1)} in` : "Missing",
      detail: latestWaist?.date ? `Last captured ${latestWaist.date}` : "Useful when appearance goals need a non-scale proxy.",
      source: latestWaist?.source || (latestWaist?.value ? "user_override" : "placeholder"),
      planningImpact: "Improves body-composition progress tracking without restarting intake.",
      missing: !latestWaist?.value,
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
        ? `Last captured ${latestLiftBenchmark.date}`
        : "Add one recent top set so strength work is sized to a real baseline instead of a generic foundation posture.",
      source: latestLiftBenchmark?.source || (latestLiftBenchmark?.weight ? "log_inferred" : "placeholder"),
      planningImpact: "Can change strength session labels, dose, and loading posture.",
      missing: !latestLiftBenchmark?.weight,
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
        ? `Last captured ${latestRunBenchmark.date}`
        : "Add a recent run result or pace anchor so long-run sizing stops leaning on generic defaults.",
      source: latestRunBenchmark?.source || (latestRunBenchmark ? "log_inferred" : "placeholder"),
      planningImpact: "Can change easy-run and long-run sizing.",
      missing: !latestRunBenchmark,
    }));
  }

  if (goalSignals.hasSwim) {
    cards.push(buildMetricCard({
      id: "swim_benchmark",
      label: "Recent swim anchor",
      value: latestSwimBenchmark
        ? dedupeStrings([
            latestSwimBenchmark.distance ? `${latestSwimBenchmark.distance} yd` : "",
            latestSwimBenchmark.duration ? `${latestSwimBenchmark.duration}` : "",
            latestSwimBenchmark.note || "",
          ]).join(" • ") || "Recent swim anchor"
        : "Missing",
      detail: latestSwimBenchmark?.date
        ? `Last captured ${latestSwimBenchmark.date}`
        : "Add one swim distance or time anchor so swim volume stays honest.",
      source: latestSwimBenchmark?.source || (latestSwimBenchmark ? "user_override" : "placeholder"),
      planningImpact: "Can change swim session volume and technique-vs-conditioning bias.",
      missing: !latestSwimBenchmark,
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
        ? `Last captured ${latestJumpBenchmark.date}`
        : "Add one jump, rim-touch, or dunk anchor so plyometric dosing stays believable.",
      source: latestJumpBenchmark?.source || (latestJumpBenchmark ? "user_override" : "placeholder"),
      planningImpact: "Can change power-session dose and progression posture.",
      missing: !latestJumpBenchmark,
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
  }));

  return {
    cards,
    missingCards: cards.filter((card) => card.missing),
    lowConfidenceCount: cards.filter((card) => card.source === "placeholder").length,
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
      powerLevel && cardsById.power_benchmark && !cardsById.power_benchmark.missing
        ? `${cardsById.power_benchmark.value} is anchoring jump exposure.`
        : "",
    ]),
    lowConfidenceMessages: [],
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
    },
    power: {
      level: powerLevel,
      benchmark: clonePlainValue(jumpRow),
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
        session.strengthDose = "30-40 min repeatable technique-first strength";
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
        session.run = { ...(session.run || {}), d: "20-30 min", t: session.run?.t || "Easy" };
      } else if (influence.running.level === "build") {
        session.run = { ...(session.run || {}), d: "25-35 min", t: session.run?.t || "Easy" };
      } else if (influence.running.level === "established") {
        session.run = { ...(session.run || {}), d: "35-45 min", t: session.run?.t || "Easy" };
      }
    }

    if (String(session?.type || "").toLowerCase() === "long-run" && influence?.running?.level) {
      if (influence.running.level === "foundation") {
        session.label = "Long Run Build";
        session.run = { ...(session.run || {}), d: "35-45 min", t: "Long easy" };
      } else if (influence.running.level === "build") {
        session.run = { ...(session.run || {}), d: "45-60 min", t: session.run?.t || "Long" };
      } else if (influence.running.level === "established") {
        session.run = { ...(session.run || {}), d: "60-80 min", t: session.run?.t || "Long" };
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
