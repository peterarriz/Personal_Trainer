import { buildTodayTrustModel } from "./compact-trust-service.js";

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const normalizeText = (value = "") => sanitizeText(value, 220).toLowerCase();

const singleSentence = (value = "", fallback = "") => {
  const normalized = sanitizeText(value || fallback, 220);
  if (!normalized) return "";
  const [firstSentence] = normalized.split(/(?<=[.!?])\s+/);
  return sanitizeText(firstSentence || normalized, 220);
};

const isGenericWhyLine = (value = "") => (
  /stays? on plan|execute the planned session cleanly|complete the session and log it|main session for today/.test(normalizeText(value))
);

const formatDateLabel = (dateKey = "") => {
  const safeDate = String(dateKey || "").trim();
  if (!safeDate) return "Today";
  const parsed = new Date(`${safeDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return "Today";
  return parsed.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
};

const inferDayFamily = ({ training = null, prescribedExercises = [] } = {}) => {
  const rawType = normalizeText(training?.type || "");
  const hasRun = Boolean(training?.run) || /run|conditioning/.test(rawType);
  const hasExplicitStrengthTrack = Boolean(training?.strSess) || Boolean(training?.strengthDuration) || /strength/.test(rawType);
  const hasStrength = hasExplicitStrengthTrack || (hasRun ? false : Boolean((Array.isArray(prescribedExercises) ? prescribedExercises : []).length));
  if (rawType === "rest" || rawType === "recovery") return "recovery";
  if (hasRun && hasStrength) return "hybrid";
  if (hasStrength) return "strength";
  if (hasRun) return "run";
  if (/swim/.test(rawType)) return "swim";
  return "generic";
};

const compressDetail = (value = "", ratio = 0.6) => sanitizeText(
  String(value || "").replace(/(\d+(?:\.\d+)?)/g, (match) => {
    const numeric = Number(match);
    if (!Number.isFinite(numeric)) return match;
    const nextValue = Math.max(1, Math.round(numeric * ratio * 10) / 10);
    return String(nextValue);
  }),
  180
);

const formatExerciseStructure = (row = {}) => {
  const sets = sanitizeText(row?.sets || "", 40);
  const reps = sanitizeText(row?.reps || "", 60);
  if (sets && reps) return `${sets} x ${reps}`;
  return sets || reps || "As prescribed";
};

const formatExercisePrescription = (row = {}) => {
  const directPrescription = sanitizeText(row?.prescription || "", 140);
  if (
    directPrescription
    && !sanitizeText(row?.sets || "", 40)
    && !sanitizeText(row?.reps || "", 60)
    && !sanitizeText(row?.weight || row?.prescribedWeight || "", 40)
  ) {
    return directPrescription;
  }
  const structure = formatExerciseStructure(row);
  const load = sanitizeText(row?.weight || row?.prescribedWeight || "", 40);
  if (load && structure && structure !== "As prescribed") return `${structure}, ${load} lb`;
  if (load) return `${load} lb`;
  return structure;
};

const cleanSessionLabel = (value = "") => sanitizeText(
  String(value || "")
    .replace(/\(\s*reduced-load\s*\)/gi, "")
    .replace(/\(\s*extended\s*\)/gi, "")
    .replace(/\(\s*20-min version\s*\)/gi, "")
    .replace(/\s*\bReduced-load\b/gi, "")
    .replace(/\s*\bExtended\b/gi, "")
    .replace(/\s{2,}/g, " "),
  120
);

const isUpperExercise = (name = "") => /bench|press|push|pull|row|shoulder|chin|pull-up|dip|lat/i.test(String(name || ""));
const isLowerExercise = (name = "") => /squat|deadlift|lunge|hinge|step-up|hamstring|glute|leg|calf/i.test(String(name || ""));

const formatExerciseList = (rows = [], maxItems = 2) => (
  (Array.isArray(rows) ? rows : [])
    .filter(Boolean)
    .slice(0, maxItems)
    .map((row) => {
      const exercise = sanitizeText(row?.ex || row?.exercise || row?.title || "", 120);
      if (!exercise) return "";
      return `${exercise} (${formatExerciseStructure(row)})`;
    })
    .filter(Boolean)
    .join("; ")
);

const formatExercisePrescriptionList = (rows = [], maxItems = 3) => (
  (Array.isArray(rows) ? rows : [])
    .filter(Boolean)
    .slice(0, maxItems)
    .map((row) => {
      const exercise = sanitizeText(row?.ex || row?.exercise || row?.title || "", 120);
      if (!exercise) return "";
      return `${exercise} (${formatExercisePrescription(row)})`;
    })
    .filter(Boolean)
    .join("; ")
);

const resolveMobilityLine = ({ family = "generic", soreness = "none", training = null } = {}) => {
  if (soreness === "legs") return "6-8 min ankle, calf, hip, and hamstring reset";
  if (soreness === "upper") return "6-8 min T-spine, pec, lat, and shoulder reset";
  if (family === "strength") return "6-8 min hips, T-spine, and shoulder prep";
  if (family === "hybrid") return "6-8 min ankles, hips, and T-spine reset between lanes";
  if (family === "recovery") return "8-10 min easy tissue-quality and range-of-motion work";
  if (/swim/.test(normalizeText(training?.type || ""))) return "6-8 min shoulders, T-spine, and ankles";
  return "5-8 min hips, calves, and trunk reset";
};

const resolveCoreLine = ({ family = "generic", shortOnTime = false, lowEnergy = false, prescribedExercises = [], soreness = "none", swapExercises = false } = {}) => {
  const rounds = shortOnTime || lowEnergy ? 2 : 3;
  const safeExercises = (Array.isArray(prescribedExercises) ? prescribedExercises : []).filter(Boolean);
  const accessoryRows = safeExercises.slice(2, 5);
  if (swapExercises) {
    return `${rounds} rounds of the nearest dumbbell, machine, or bodyweight versions`;
  }
  if (soreness === "upper") {
    return `${rounds} rounds: split squat, dead bug, side plank`;
  }
  if (soreness === "legs") {
    return `${rounds} rounds: plank, side plank, band pull-apart`;
  }
  if (accessoryRows.length > 0) {
    const accessoryLine = formatExerciseList(accessoryRows, 3);
    if (accessoryLine) return accessoryLine;
  }
  if (family === "strength" || family === "hybrid") {
    return `${rounds} rounds: plank, dead bug, and one controlled accessory superset`;
  }
  return `${rounds} rounds: plank, side plank, and dead bug`;
};

const resolveFinisherLine = ({ family = "generic", training = null, shortOnTime = false, lowEnergy = false, lowImpact = false, cardioSwap = "as_planned", extended = false } = {}) => {
  if (shortOnTime || lowEnergy) return "";
  if (sanitizeText(training?.extendedFinisher || "", 180)) return sanitizeText(training.extendedFinisher, 180);
  if (family === "strength") return extended ? "5-8 min easy bike, row, or carry finisher" : "Optional: 4-6 min easy flush";
  if (lowImpact || ["bike", "elliptical", "treadmill"].includes(cardioSwap)) return "Optional: 4-6 min easy cooldown only";
  if (family === "hybrid" || family === "run") return extended ? "4 x 20 sec strides with full walk-back recovery" : "Optional: 4 x 15-20 sec relaxed strides";
  if (family === "recovery") return "Optional: 3-5 min nasal-breathing walk";
  return "";
};

const resolveCardioSwapLine = ({ swap = "as_planned", shortOnTime = false, extended = false, lowEnergy = false, lowImpact = false } = {}) => {
  const duration = shortOnTime ? "12-20 min" : extended ? "35-45 min" : "20-35 min";
  if (swap === "bike") return `${duration} easy bike at steady zone-2 effort`;
  if (swap === "elliptical") return `${duration} easy elliptical with smooth cadence`;
  if (swap === "treadmill") return lowImpact ? `${duration} incline treadmill walk` : `${duration} treadmill version at controlled effort`;
  if (lowImpact) return `${duration} incline walk, bike, or elliptical at easy effort`;
  if (lowEnergy) return `${duration} controlled aerobic work at talk-test effort`;
  return "";
};

const resolveFocusLine = ({ family = "generic", training = null, lowEnergy = false, soreness = "none", lowImpact = false } = {}) => {
  if (lowEnergy) return "Controlled work, recovery protection, and clean movement";
  if (soreness === "legs") return "Recovery protection, upper support, and trunk control";
  if (soreness === "upper") return "Aerobic work, lower support, and trunk control";
  if (lowImpact) return "Low-impact aerobic work, recovery protection, and control";
  if (family === "recovery") return "Recovery, tissue quality, and easy movement";
  if (family === "hybrid") return "Aerobic work, strength touchpoint, and trunk control";
  if (family === "strength") return "Strength, durability, and clean positions";
  if (family === "swim") return "Swim rhythm, aerobic support, and trunk control";
  const runType = normalizeText(training?.run?.t || "");
  if (/tempo|interval|long/.test(runType)) return "Primary running work, durability, and clean mechanics";
  return "Recovery, aerobic base, and core";
};

const resolveSessionLabel = ({ family = "generic", training = null, summary = null, prescribedExercises = [] } = {}) => {
  const summaryLabel = cleanSessionLabel(summary?.sessionLabel || "");
  const trainingLabel = cleanSessionLabel(training?.label || "");
  const runType = sanitizeText(training?.run?.t || "", 40);
  const hasStrengthRows = Array.isArray(prescribedExercises) && prescribedExercises.length > 0;
  if (family === "strength") {
    if (/strength|lift|bench|squat|deadlift|press|pull/i.test(summaryLabel)) return summaryLabel;
    if (/strength|lift|bench|squat|deadlift|press|pull/i.test(trainingLabel)) return trainingLabel;
    return "Strength session";
  }
  if (family === "hybrid") {
    if (summaryLabel && !/reduced-load/i.test(summary?.sessionLabel || "")) return summaryLabel;
    if (runType && hasStrengthRows) return `${runType} run + strength`;
    return "Run + strength";
  }
  return summaryLabel || trainingLabel || "Planned session";
};

const resolveWhyLine = ({
  family = "generic",
  changeSummaryLine = "",
  canonicalReasonLine = "",
  whyNowLine = "",
  summaryWhy = "",
  lowEnergy = false,
  soreness = "none",
  lowImpact = false,
  cardioSwap = "as_planned",
  shortOnTime = false,
  extended = false,
} = {}) => {
  if (shortOnTime) return "Time is tight today, so the plan keeps the main stimulus and cuts everything non-essential.";
  if (lowEnergy) return "Recovery looks softer today, so the plan keeps the session moving while trimming the dose.";
  if (soreness === "legs") return "Your legs are carrying fatigue, so today keeps the week moving without stacking more lower-body cost.";
  if (soreness === "upper") return "Your upper body is carrying fatigue, so today protects pressing and pulling while keeping the day productive.";
  if (lowImpact || cardioSwap !== "as_planned") return "Impact is not the win today, so the session keeps the aerobic intent and swaps the mode.";
  if (extended) return "Current signals look supportive enough for one small progression, not a second full workload.";
  const candidates = [
    changeSummaryLine,
    whyNowLine,
    canonicalReasonLine,
    summaryWhy,
  ].map((line) => singleSentence(line)).filter(Boolean);
  const selected = candidates.find((line) => !isGenericWhyLine(line)) || candidates[0] || "";
  if (selected) return selected;
  if (family === "recovery") return "Today is a planned recovery day so the next real session lands better.";
  if (family === "hybrid") return "Today keeps both lanes alive without letting either one create avoidable fatigue.";
  if (family === "strength") return "Today is for clean strength work, not grinding volume for its own sake.";
  return "Today moves the week forward without adding unnecessary fatigue.";
};

const buildPrimaryBlock = ({
  family = "generic",
  training = null,
  summary = null,
  prescribedExercises = [],
  shortOnTime = false,
  lowEnergy = false,
  soreness = "none",
  lowImpact = false,
  cardioSwap = "as_planned",
  swapExercises = false,
} = {}) => {
  const rawType = normalizeText(training?.type || "");
  const strengthRows = Array.isArray(prescribedExercises) ? prescribedExercises : [];
  const cardioSwapLine = resolveCardioSwapLine({ swap: cardioSwap, shortOnTime, lowEnergy, lowImpact });
  const strengthPrimaryRows = strengthRows.slice(0, 2);

  if (family === "recovery") {
    return {
      key: "primary",
      title: "Easy aerobic work",
      prescription: cardioSwapLine || sanitizeText(training?.fallback || training?.run?.d || summary?.structure || "20-30 min easy walk, bike, or easy movement", 180),
      effort: "Easy / conversational",
      variant: "Stay easy enough that you feel better when you finish.",
      guidanceSource: sanitizeText(training?.label || training?.type || "Recovery walk", 120),
    };
  }

  if (family === "hybrid") {
    return {
      key: "primary",
      title: "Session arc",
      prescription: cardioSwapLine || sanitizeText([
        training?.run?.d || summary?.expectedDuration || "20-35 min run",
        training?.strengthDuration ? `then ${training.strengthDuration} of strength support` : "then 12-20 min of strength support",
      ].filter(Boolean).join(", "), 200),
      effort: lowEnergy ? "Easy to steady" : "Controlled / clean",
      variant: soreness === "legs"
        ? "Keep the run easy and make the strength lane upper- or trunk-led."
        : soreness === "upper"
        ? "Keep the run normal and trim heavy pressing or pulling."
        : "Run first. Keep the strength work supportive, not exhaustive.",
      guidanceSource: sanitizeText(training?.label || training?.type || "Run + strength", 120),
    };
  }

  if (family === "strength") {
    const strengthPrescription = formatExerciseList(strengthPrimaryRows, 2)
      || sanitizeText(training?.strengthDuration || summary?.structure || "Main lifts and support work", 180);
    return {
      key: "primary",
      title: "Primary lifts",
      prescription: swapExercises
        ? "Use the nearest stable dumbbell, machine, or bodyweight versions for the main work"
        : strengthPrescription,
      effort: lowEnergy ? "Leave 2-3 reps in reserve" : "Leave 1-2 reps in reserve",
      variant: soreness === "upper"
        ? "Trim heavy pressing and use the most stable upper-body variations available."
        : soreness === "legs"
        ? "Keep lower-body loading honest and shift the support work toward upper body or trunk."
        : "",
      guidanceSource: sanitizeText(training?.label || training?.type || "Strength", 120),
    };
  }

  if (family === "swim") {
    return {
      key: "primary",
      title: "Primary swim",
      prescription: sanitizeText(training?.swim?.setLine || training?.swim?.d || summary?.structure || "Main swim set as prescribed", 180),
      effort: lowEnergy ? "Smooth aerobic" : "Controlled quality",
      variant: lowEnergy ? "Stay one step calmer than planned if stroke quality starts to slide." : "",
      guidanceSource: sanitizeText(training?.label || training?.swim?.focus || training?.type || "Swim", 120),
    };
  }

  if (family === "run") {
    const runType = normalizeText(training?.run?.t || "");
    const title = cardioSwapLine
      ? cardioSwap === "bike"
        ? "Bike substitution"
        : cardioSwap === "elliptical"
        ? "Elliptical substitution"
        : cardioSwap === "treadmill"
        ? "Treadmill substitution"
        : "Low-impact aerobic work"
      : /tempo|interval/.test(runType)
      ? "Primary run"
      : /long/.test(runType)
      ? "Primary run"
      : "Easy aerobic work";
    return {
      key: "primary",
      title,
      prescription: cardioSwapLine || sanitizeText(training?.run?.d || summary?.structure || training?.fallback || "20-35 min easy aerobic work", 180),
      effort: lowEnergy || lowImpact || cardioSwapLine ? "Easy / zone 2" : /tempo|interval/.test(runType) ? "Controlled quality" : "Easy / conversational",
      variant: soreness === "legs"
        ? "Keep cadence smooth and leave the day feeling fresher than you started."
        : /tempo|interval/.test(runType)
        ? "Do not chase pace if mechanics are not clean today."
        : "",
      guidanceSource: sanitizeText(training?.label || training?.run?.t || training?.type || title, 120),
    };
  }

  return {
    key: "primary",
    title: "Primary work",
    prescription: sanitizeText(summary?.structure || training?.fallback || training?.label || "Main work as prescribed", 180),
    effort: lowEnergy ? "Controlled" : "As prescribed",
    variant: "",
    guidanceSource: sanitizeText(training?.label || training?.type || "Primary work", 120),
  };
};

const buildStrengthExerciseBlocks = ({
  prescribedExercises = [],
  lowEnergy = false,
  soreness = "none",
  swapExercises = false,
} = {}) => (
  (Array.isArray(prescribedExercises) ? prescribedExercises : [])
    .filter(Boolean)
    .map((row, index) => {
      const exerciseName = sanitizeText(row?.ex || row?.exercise || `Exercise ${index + 1}`, 120) || `Exercise ${index + 1}`;
      const cue = sanitizeText(row?.cue || row?.note || "", 140);
      let variant = cue;
      if (swapExercises) {
        variant = "Use the nearest stable version you can load cleanly today.";
      } else if (soreness === "upper" && isUpperExercise(exerciseName)) {
        variant = "Use the most stable version available and keep a rep or two in reserve.";
      } else if (soreness === "legs" && isLowerExercise(exerciseName)) {
        variant = "Keep the load honest and stop before the quality drops.";
      }
      return {
        key: `strength_${index}`,
        title: exerciseName,
        prescription: formatExercisePrescription(row),
        effort: lowEnergy ? "Leave 2-3 reps in reserve" : "Leave 1-2 reps in reserve",
        variant,
        guidanceSource: exerciseName,
      };
    })
);

const buildGroupedStrengthBlocks = ({
  prescribedExercises = [],
  lowEnergy = false,
  soreness = "none",
  swapExercises = false,
} = {}) => {
  const rows = buildStrengthExerciseBlocks({
    prescribedExercises,
    lowEnergy,
    soreness,
    swapExercises,
  });
  if (!rows.length) return [];

  const mainOne = rows[0] ? [rows[0]] : [];
  const mainTwo = rows[1] ? [rows[1]] : [];
  const accessoryRows = rows.slice(2);
  const blocks = [];

  if (mainOne.length) {
    blocks.push({
      key: "strength_main_1",
      title: mainOne[0].title,
      prescription: mainOne[0].prescription,
      effort: mainOne[0].effort,
      variant: mainOne[0].variant,
      guidanceSource: mainOne[0].guidanceSource,
    });
  }

  if (mainTwo.length) {
    blocks.push({
      key: "strength_main_2",
      title: mainTwo[0].title,
      prescription: mainTwo[0].prescription,
      effort: mainTwo[0].effort,
      variant: mainTwo[0].variant,
      guidanceSource: mainTwo[0].guidanceSource,
    });
  }

  if (accessoryRows.length) {
    blocks.push({
      key: "strength_accessory_group",
      title: "Accessory / core",
      prescription: formatExercisePrescriptionList(accessoryRows, 3) || "Accessory work as prescribed",
      effort: lowEnergy ? "Leave 2-3 reps in reserve" : "Controlled / clean",
      variant: swapExercises
        ? "Use the nearest stable versions and keep the transitions simple."
        : soreness === "legs"
        ? "Keep the lower-body accessory work honest and stop before it drags."
        : soreness === "upper"
        ? "Trim pressing or pulling volume if shoulder or elbow quality slides."
        : "",
    });
  }

  return blocks;
};

const buildRules = ({
  family = "generic",
  training = null,
  shortOnTime = false,
  lowEnergy = false,
  soreness = "none",
  lowImpact = false,
  cardioSwap = "as_planned",
  extended = false,
} = {}) => {
  const rules = [];
  if (family === "strength" || family === "hybrid") {
    rules.push(lowEnergy ? "Stop every set with clean reps left in reserve." : "No grinding today. Leave 1-2 clean reps in reserve.");
  }
  if (family === "run" || family === "hybrid" || family === "recovery") {
    if (lowImpact || cardioSwap !== "as_planned") {
      rules.push("No hard impact today.");
    } else if (/tempo|interval/i.test(String(training?.run?.t || ""))) {
      rules.push("Do not turn warm-up or recoveries into extra work.");
    } else {
      rules.push("Keep the effort conversational unless the block explicitly says otherwise.");
    }
  }
  if (soreness === "legs") rules.push("No heavy lower-body loading or hard downhill work.");
  if (soreness === "upper") rules.push("No heavy pressing or long upper-body accessory work.");
  if (shortOnTime || lowEnergy) rules.push("If time or energy gets worse, cut the accessory block before the main work.");
  if (extended) rules.push("Add only one step up today, not extra volume everywhere.");
  rules.push(family === "strength" ? "Finish crisp, not cooked." : "Finish feeling better than you started.");
  return Array.from(new Set(rules.map((rule) => sanitizeText(rule, 160)).filter(Boolean))).slice(0, 4);
};

const buildWorkoutBlocks = ({
  family = "generic",
  training = null,
  summary = null,
  prescribedExercises = [],
  adjustments = {},
} = {}) => {
  const shortOnTime = adjustments?.time === "short";
  const extended = adjustments?.time === "extended";
  const lowEnergy = adjustments?.recovery === "low_energy";
  const soreness = adjustments?.soreness || "none";
  const lowImpact = adjustments?.impact === "low_impact";
  const cardioSwap = adjustments?.cardioSwap || "as_planned";
  const swapExercises = Boolean(adjustments?.swapExercises);
  const groupedStrengthBlocks = buildGroupedStrengthBlocks({
    prescribedExercises,
    lowEnergy,
    soreness,
    swapExercises,
  });

  if (family === "strength" && groupedStrengthBlocks.length > 0) {
    const blocks = [
      {
        key: "mobility",
        title: "Warm-up",
        prescription: resolveMobilityLine({ family, soreness, training }),
        effort: "Easy / smooth",
        variant: lowEnergy ? "Keep the prep short and clean." : "",
      },
      ...groupedStrengthBlocks,
    ];
    const finisherLine = resolveFinisherLine({
      family,
      training,
      shortOnTime,
      lowEnergy,
      lowImpact,
      cardioSwap,
      extended,
    });
    if (finisherLine) {
      blocks.push({
        key: "finisher",
        title: "Optional finisher",
        prescription: finisherLine,
        effort: extended ? "Controlled quality" : "Optional",
        variant: "Skip it if the main lifts already did the job.",
      });
    }
    return blocks;
  }

  if (family === "hybrid" && groupedStrengthBlocks.length > 0) {
    const primary = buildPrimaryBlock({
      family,
      training,
      summary,
      prescribedExercises,
      shortOnTime,
      lowEnergy,
      soreness,
      lowImpact,
      cardioSwap,
      swapExercises,
    });
    const strengthTouchpointBlock = {
      key: "hybrid_strength_touchpoint",
      title: "Strength touchpoint",
      prescription: formatExercisePrescriptionList(
        (Array.isArray(prescribedExercises) ? prescribedExercises : []).slice(0, 2),
        2
      ) || training?.strengthDuration || "Support strength work as prescribed",
      effort: lowEnergy ? "Leave 2-3 reps in reserve" : "Controlled / clean",
      variant: soreness === "legs"
        ? "Bias the strength touchpoint toward upper body or trunk if the legs are still carrying fatigue."
        : soreness === "upper"
        ? "Keep the run normal and simplify the upper-body loading."
        : "Keep this supportive. The day should still read as one session, not two full ones.",
    };
    const accessoryGroup = groupedStrengthBlocks.find((block) => block.key === "strength_accessory_group");
    const blocks = [primary, strengthTouchpointBlock];
    if (accessoryGroup) {
      blocks.push({
        ...accessoryGroup,
        key: "hybrid_accessory_group",
        title: "Core / accessory",
      });
    }
    const mobility = {
      key: "mobility",
      title: "Mobility",
      prescription: resolveMobilityLine({ family, soreness, training }),
      effort: "Easy / smooth",
      variant: lowEnergy ? "Stay easy. This is there to help the session feel better, not harder." : "",
    };
    blocks.push(mobility);
    const finisherLine = resolveFinisherLine({
      family,
      training,
      shortOnTime,
      lowEnergy,
      lowImpact,
      cardioSwap,
      extended,
    });
    if (finisherLine) {
      blocks.push({
        key: "finisher",
        title: "Optional finisher",
        prescription: finisherLine,
        effort: extended ? "Controlled quality" : "Optional",
        variant: "Skip it if the main work already did its job.",
      });
    }
    return blocks.slice(0, 5);
  }

  const primary = buildPrimaryBlock({
    family,
    training,
    summary,
    prescribedExercises,
    shortOnTime,
    lowEnergy,
    soreness,
    lowImpact,
    cardioSwap,
    swapExercises,
  });
  const mobility = {
    key: "mobility",
    title: "Mobility",
    prescription: resolveMobilityLine({ family, soreness, training }),
    effort: "Easy / smooth",
    variant: lowEnergy ? "Stay easy. This is there to help the session feel better, not harder." : "",
  };
  const accessory = {
    key: "accessory",
    title: family === "strength" ? "Accessory / core" : "Core / accessory",
    prescription: resolveCoreLine({
      family,
      shortOnTime,
      lowEnergy,
      prescribedExercises,
      soreness,
      swapExercises,
    }),
    effort: "Controlled",
    variant: shortOnTime || lowEnergy ? "Two clean rounds are enough today." : "",
  };
  const finisherLine = resolveFinisherLine({
    family,
    training,
    shortOnTime,
    lowEnergy,
    lowImpact,
    cardioSwap,
    extended,
  });
  const blocks = [primary, mobility, accessory];
  if (finisherLine) {
    blocks.push({
      key: "finisher",
      title: "Optional finisher",
      prescription: finisherLine,
      effort: extended ? "Controlled quality" : "Optional",
      variant: "Skip it if the main work already did its job.",
    });
  }
  return blocks;
};

const buildAdjustmentSummary = ({ adjustments = {}, environmentSelection = null } = {}) => {
  const labels = [];
  if (adjustments?.time === "short") labels.push("Short on time");
  if (adjustments?.time === "extended") labels.push("Push a little harder");
  if (adjustments?.recovery === "low_energy") labels.push("Low energy");
  if (adjustments?.soreness === "legs") labels.push("Legs sore");
  if (adjustments?.soreness === "upper") labels.push("Upper body sore");
  if (adjustments?.impact === "low_impact") labels.push("Low impact");
  if (adjustments?.cardioSwap === "bike") labels.push("Bike swap");
  if (adjustments?.cardioSwap === "elliptical") labels.push("Elliptical swap");
  if (adjustments?.cardioSwap === "treadmill") labels.push("Treadmill swap");
  if (adjustments?.swapExercises) labels.push("Exercise swap");
  if (environmentSelection?.scope === "today" && sanitizeText(environmentSelection?.mode || "")) {
    labels.push(`${sanitizeText(environmentSelection.mode, 40)} setup`);
  }
  return labels;
};

export const TODAY_PRESCRIPTION_ADJUSTMENT_DEFAULTS = Object.freeze({
  time: "standard",
  recovery: "standard",
  soreness: "none",
  impact: "normal",
  cardioSwap: "as_planned",
  swapExercises: false,
});

export const buildTodayPrescriptionSurfaceModel = ({
  dateKey = "",
  training = null,
  summary = null,
  surfaceModel = null,
  whyNowLine = "",
  prescribedExercises = [],
  adjustments = TODAY_PRESCRIPTION_ADJUSTMENT_DEFAULTS,
  environmentSelection = null,
} = {}) => {
  const family = inferDayFamily({ training, prescribedExercises });
  const normalizedAdjustments = {
    ...TODAY_PRESCRIPTION_ADJUSTMENT_DEFAULTS,
    ...(adjustments || {}),
  };
  const focusLine = resolveFocusLine({
    family,
    training,
    lowEnergy: normalizedAdjustments.recovery === "low_energy",
    soreness: normalizedAdjustments.soreness,
    lowImpact: normalizedAdjustments.impact === "low_impact" || normalizedAdjustments.cardioSwap !== "as_planned",
  });
  const whyLine = resolveWhyLine({
    family,
    changeSummaryLine: surfaceModel?.changeSummaryLine || surfaceModel?.preferenceAndAdaptationLine || "",
    canonicalReasonLine: surfaceModel?.canonicalReasonLine || "",
    whyNowLine,
    summaryWhy: summary?.why || "",
    lowEnergy: normalizedAdjustments.recovery === "low_energy",
    soreness: normalizedAdjustments.soreness,
    lowImpact: normalizedAdjustments.impact === "low_impact",
    cardioSwap: normalizedAdjustments.cardioSwap,
    shortOnTime: normalizedAdjustments.time === "short",
    extended: normalizedAdjustments.time === "extended",
  });
  const blocks = buildWorkoutBlocks({
    family,
    training,
    summary,
    prescribedExercises,
    adjustments: normalizedAdjustments,
  }).map((block, index) => ({
    ...block,
    number: index + 1,
  }));
  const rules = buildRules({
    family,
    training,
    shortOnTime: normalizedAdjustments.time === "short",
    lowEnergy: normalizedAdjustments.recovery === "low_energy",
    soreness: normalizedAdjustments.soreness,
    lowImpact: normalizedAdjustments.impact === "low_impact",
    cardioSwap: normalizedAdjustments.cardioSwap,
    extended: normalizedAdjustments.time === "extended",
  });
  const adjustmentSummary = buildAdjustmentSummary({
    adjustments: normalizedAdjustments,
    environmentSelection,
  });
  const trustModel = buildTodayTrustModel({
    surfaceModel,
    adjustments: normalizedAdjustments,
    environmentSelection,
    family,
  });

  return {
    headerTitle: "Today's Plan",
    dateLabel: formatDateLabel(dateKey),
    sessionLabel: resolveSessionLabel({ family, training, summary, prescribedExercises }),
    focusLine,
    whyLine,
    canonicalReasonLine: singleSentence(surfaceModel?.canonicalReasonLine || ""),
    blocks,
    rules,
    adjustmentSummary,
    trustModel,
    family,
  };
};
