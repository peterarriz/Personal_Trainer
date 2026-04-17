const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

export const INJURY_LEVELS = Object.freeze(["none", "mild_tightness", "moderate_pain", "sharp_pain_stop"]);

export const AFFECTED_AREAS = Object.freeze([
  "Achilles",
  "Ankle",
  "Foot",
  "Calf",
  "Shin",
  "Knee",
  "Hamstring",
  "Hip",
  "Low back",
  "Shoulder",
  "Elbow",
  "Wrist",
  "Neck",
  "General fatigue",
]);

export const INJURY_SIDE_OPTIONS = Object.freeze([
  { value: "unspecified", label: "Unspecified" },
  { value: "left", label: "Left" },
  { value: "right", label: "Right" },
  { value: "both", label: "Both" },
  { value: "center", label: "Center / general" },
]);

export const INJURY_LIMITATION_OPTIONS = Object.freeze([
  { value: "running", label: "Running" },
  { value: "impact", label: "Jumping / impact" },
  { value: "lower_body_loading", label: "Lower-body lifting" },
  { value: "upper_body_push", label: "Bench / pressing" },
  { value: "upper_body_pull", label: "Rows / pulling" },
  { value: "overhead", label: "Overhead work" },
  { value: "carries", label: "Carries / grip" },
  { value: "trunk_loading", label: "Bracing / trunk loading" },
]);

const AREA_ALIASES = Object.freeze({
  achilles: "Achilles",
  ankle: "Ankle",
  foot: "Foot",
  feet: "Foot",
  calf: "Calf",
  shin: "Shin",
  knee: "Knee",
  hamstring: "Hamstring",
  hip: "Hip",
  "low back": "Low back",
  back: "Low back",
  shoulder: "Shoulder",
  elbow: "Elbow",
  wrist: "Wrist",
  neck: "Neck",
  fatigue: "General fatigue",
  tired: "General fatigue",
  sore: "General fatigue",
});

const MOVEMENT_STATUS_ORDER = Object.freeze({
  allow: 0,
  caution: 1,
  avoid: 2,
});

const MOVEMENT_LABELS = Object.freeze({
  run: "running",
  jump: "impact and plyometrics",
  squat: "squatting",
  hinge: "hinging",
  lunge: "single-leg loading",
  carry: "loaded carries",
  horizontalPress: "horizontal pressing",
  verticalPress: "overhead pressing",
  horizontalPull: "rowing",
  verticalPull: "vertical pulling",
  rotation: "rotation and bracing",
  trunk: "trunk loading",
});

const SIDE_VALUES = INJURY_SIDE_OPTIONS.map((option) => option.value);
const LIMITATION_VALUE_SET = new Set(INJURY_LIMITATION_OPTIONS.map((option) => option.value));
const LIMITATION_LABELS = Object.fromEntries(INJURY_LIMITATION_OPTIONS.map((option) => [option.value, option.label]));
const LIMITATION_PATTERN_MAP = Object.freeze({
  running: ["run"],
  impact: ["jump", "run", "lunge"],
  lower_body_loading: ["squat", "hinge", "lunge", "carry"],
  upper_body_push: ["horizontalPress", "verticalPress"],
  upper_body_pull: ["horizontalPull", "verticalPull"],
  overhead: ["verticalPress"],
  carries: ["carry"],
  trunk_loading: ["rotation", "trunk", "carry", "squat", "hinge"],
});

const createMovementMatrix = () => ({
  run: "allow",
  jump: "allow",
  squat: "allow",
  hinge: "allow",
  lunge: "allow",
  carry: "allow",
  horizontalPress: "allow",
  verticalPress: "allow",
  horizontalPull: "allow",
  verticalPull: "allow",
  rotation: "allow",
  trunk: "allow",
});

const elevateMovementStatus = (current = "allow", next = "allow") => (
  MOVEMENT_STATUS_ORDER[next] > MOVEMENT_STATUS_ORDER[current] ? next : current
);

const setMovementStatus = (matrix = {}, patterns = [], next = "allow") => {
  (patterns || []).forEach((pattern) => {
    if (!pattern || !Object.prototype.hasOwnProperty.call(matrix, pattern)) return;
    matrix[pattern] = elevateMovementStatus(matrix[pattern], next);
  });
};

const normalizeLevel = (value = "") => {
  const clean = sanitizeText(value, 40).toLowerCase();
  return INJURY_LEVELS.includes(clean) ? clean : "none";
};

const findCanonicalAreaFromText = (text = "") => {
  const lower = sanitizeText(text, 240).toLowerCase();
  if (!lower) return "";
  const orderedAliases = Object.keys(AREA_ALIASES).sort((left, right) => right.length - left.length);
  const matched = orderedAliases.find((alias) => lower.includes(alias));
  return matched ? AREA_ALIASES[matched] : "";
};

export const normalizeInjuryArea = (value = "") => {
  const direct = sanitizeText(value, 80);
  if (!direct) return "";
  const matched = AFFECTED_AREAS.find((area) => area.toLowerCase() === direct.toLowerCase());
  if (matched) return matched;
  return findCanonicalAreaFromText(direct);
};

export const inferInjuryAreaFromText = (text = "") => findCanonicalAreaFromText(text);

const normalizeImpact = (value = "") => sanitizeText(value, 80).toLowerCase();

export const normalizeInjurySide = (value = "") => {
  const clean = sanitizeText(value, 40).toLowerCase();
  return SIDE_VALUES.includes(clean) ? clean : "unspecified";
};

export const normalizeInjuryLimitations = (value = []) => {
  const rawValues = Array.isArray(value) ? value : [value];
  return Array.from(new Set(rawValues
    .map((item) => sanitizeText(item, 60).toLowerCase().replace(/\s+/g, "_"))
    .filter((item) => LIMITATION_VALUE_SET.has(item))));
};

const formatAreaWithSide = ({ area = "", side = "unspecified" } = {}) => {
  if (!area) return "";
  if (side === "left") return `Left ${area}`;
  if (side === "right") return `Right ${area}`;
  if (side === "both") return `Both ${area}`;
  if (side === "center" && area !== "General fatigue") return `${area} (central)`;
  return area;
};

const resolveAreaGroup = (area = "") => {
  if (["Achilles", "Ankle", "Foot", "Calf", "Shin"].includes(area)) return "lower_distal";
  if (["Knee", "Hamstring", "Hip"].includes(area)) return "lower_proximal";
  if (area === "Shoulder") return "shoulder";
  if (["Elbow", "Wrist"].includes(area)) return "arm";
  if (["Low back", "Neck"].includes(area)) return "trunk";
  if (area === "General fatigue") return "systemic";
  return "general";
};

const isModerateOrHigher = (level = "none") => ["moderate_pain", "sharp_pain_stop"].includes(level);
const isSharp = (level = "none") => level === "sharp_pain_stop";
const isMild = (level = "none") => level === "mild_tightness";

const applyAreaRestrictions = ({ matrix, areaGroup, level }) => {
  if (level === "none") return;

  if (areaGroup === "lower_distal") {
    setMovementStatus(matrix, ["jump"], "avoid");
    setMovementStatus(matrix, ["run", "lunge", "carry", "squat"], isMild(level) ? "caution" : "avoid");
    setMovementStatus(matrix, ["hinge"], isMild(level) ? "caution" : isModerateOrHigher(level) ? "avoid" : "allow");
    return;
  }

  if (areaGroup === "lower_proximal") {
    setMovementStatus(matrix, ["jump"], "avoid");
    setMovementStatus(matrix, ["run", "lunge"], isMild(level) ? "caution" : "avoid");
    setMovementStatus(matrix, ["squat", "hinge", "carry"], isMild(level) ? "caution" : isSharp(level) ? "avoid" : "caution");
    return;
  }

  if (areaGroup === "shoulder") {
    setMovementStatus(matrix, ["horizontalPress", "verticalPress"], isMild(level) ? "caution" : "avoid");
    setMovementStatus(matrix, ["horizontalPull", "verticalPull", "carry"], isSharp(level) ? "avoid" : "caution");
    setMovementStatus(matrix, ["rotation"], isModerateOrHigher(level) ? "caution" : "allow");
    return;
  }

  if (areaGroup === "arm") {
    setMovementStatus(matrix, ["horizontalPress", "verticalPress", "horizontalPull", "verticalPull", "carry"], isMild(level) ? "caution" : "avoid");
    return;
  }

  if (areaGroup === "trunk") {
    setMovementStatus(matrix, ["jump"], "avoid");
    setMovementStatus(matrix, ["rotation", "trunk", "carry"], isMild(level) ? "caution" : "avoid");
    setMovementStatus(matrix, ["squat", "hinge", "run", "verticalPress"], isMild(level) ? "caution" : isSharp(level) ? "avoid" : "caution");
    return;
  }

  if (areaGroup === "systemic") {
    setMovementStatus(matrix, ["jump"], "avoid");
    setMovementStatus(matrix, ["run", "squat", "hinge", "lunge", "carry", "horizontalPress", "verticalPress", "horizontalPull", "verticalPull"], isSharp(level) ? "avoid" : "caution");
  }
};

const applyImpactHints = ({ matrix, impact = "", notes = "" }) => {
  const combined = `${normalizeImpact(impact)} ${sanitizeText(notes, 240).toLowerCase()}`.trim();
  if (!combined) return;
  if (/limits running|run|impact|jump|sprint|plyo|cutting/.test(combined)) {
    setMovementStatus(matrix, ["run", "jump", "lunge"], "avoid");
  }
  if (/limits lifting|squat|deadlift|hinge|lower body|leg day/.test(combined)) {
    setMovementStatus(matrix, ["squat", "hinge", "lunge", "carry"], "caution");
  }
  if (/bench|push-up|press|overhead/.test(combined)) {
    setMovementStatus(matrix, ["horizontalPress", "verticalPress"], "avoid");
  }
  if (/row|pull|chin|grip|hang/.test(combined)) {
    setMovementStatus(matrix, ["horizontalPull", "verticalPull", "carry"], "caution");
  }
};

const applyExplicitLimitations = ({ matrix, limitations = [] }) => {
  normalizeInjuryLimitations(limitations).forEach((limitation) => {
    setMovementStatus(matrix, LIMITATION_PATTERN_MAP[limitation] || [], "avoid");
  });
};

const deriveCapabilityFlags = ({ matrix, areaGroup, level }) => {
  const runningRestricted = matrix.run === "avoid";
  const impactRestricted = matrix.jump === "avoid" || matrix.run === "avoid";
  const lowerBodyLoadingRestricted = ["squat", "hinge", "lunge", "carry"].some((pattern) => matrix[pattern] === "avoid");
  const upperBodyPushRestricted = ["horizontalPress", "verticalPress"].some((pattern) => matrix[pattern] === "avoid");
  const upperBodyPullRestricted = ["horizontalPull", "verticalPull"].some((pattern) => matrix[pattern] === "avoid");
  const overheadRestricted = matrix.verticalPress === "avoid";
  const axialLoadRestricted = ["carry", "trunk", "squat", "hinge"].some((pattern) => matrix[pattern] === "avoid") && areaGroup === "trunk";
  const singleLegRestricted = matrix.lunge === "avoid" || (runningRestricted && ["lower_distal", "lower_proximal"].includes(areaGroup));
  const conditioningRestricted = areaGroup === "systemic" && isModerateOrHigher(level);
  const lowerBodyLimited = runningRestricted || lowerBodyLoadingRestricted || impactRestricted;
  const upperBodyLimited = upperBodyPushRestricted || upperBodyPullRestricted || overheadRestricted;

  return {
    runningRestricted,
    impactRestricted,
    lowerBodyLoadingRestricted,
    upperBodyPushRestricted,
    upperBodyPullRestricted,
    overheadRestricted,
    axialLoadRestricted,
    singleLegRestricted,
    conditioningRestricted,
    lowerBodyLimited,
    upperBodyLimited,
    preserveUpperBody: lowerBodyLimited && !upperBodyLimited,
    preserveLowerBody: upperBodyLimited && !lowerBodyLimited,
    canDoLowImpactCardio: !upperBodyLimited || lowerBodyLimited || areaGroup === "systemic",
  };
};

const resolveProtectedLine = ({ areaGroup, flags }) => {
  if (flags.lowerBodyLimited && !flags.upperBodyLimited) return "running, impact, and lower-body loading";
  if (flags.upperBodyLimited && !flags.lowerBodyLimited) return "pressing, pulling, and grip-heavy upper-body work";
  if (areaGroup === "trunk") return "axial loading, hinging, and loaded carries";
  if (areaGroup === "systemic") return "high intensity and total training load";
  return "the irritated movement patterns";
};

const resolvePreservedLine = ({ areaGroup, flags }) => {
  if (flags.preserveUpperBody) return "benching, supported rows, pulldowns, and seated upper-body work";
  if (flags.preserveLowerBody) return "running, bike work, and lower-body training that stays symptom-calm";
  if (areaGroup === "trunk") return "easy cardio and supported upper-body work";
  if (areaGroup === "systemic") return "easy aerobic work and light technique practice";
  return "only the movements that stay calm";
};

const describeMovementList = (matrix = {}, desiredStatus = "avoid") => Object.keys(matrix)
  .filter((pattern) => matrix[pattern] === desiredStatus)
  .map((pattern) => MOVEMENT_LABELS[pattern] || pattern)
  .slice(0, 4);

export const buildInjuryCapabilityProfile = ({
  level = "none",
  area = "",
  side = "unspecified",
  notes = "",
  impact = "",
  injuryImpact = "",
  limitations = [],
  preserveForPlanning = false,
} = {}) => {
  const normalizedLevel = normalizeLevel(level);
  const active = normalizedLevel !== "none" || Boolean(preserveForPlanning);
  const normalizedArea = normalizeInjuryArea(area) || inferInjuryAreaFromText(notes) || (active ? "General fatigue" : "Achilles");
  const normalizedSide = normalizeInjurySide(side);
  const normalizedLimitations = normalizeInjuryLimitations(limitations);
  const safeNotes = sanitizeText(notes, 220);
  const normalizedImpact = sanitizeText(impact || injuryImpact, 80);
  const areaGroup = resolveAreaGroup(normalizedArea);
  const movementMatrix = createMovementMatrix();
  applyAreaRestrictions({ matrix: movementMatrix, areaGroup, level: normalizedLevel });
  applyImpactHints({ matrix: movementMatrix, impact: normalizedImpact, notes: safeNotes });
  applyExplicitLimitations({ matrix: movementMatrix, limitations: normalizedLimitations });

  const capabilityFlags = deriveCapabilityFlags({
    matrix: movementMatrix,
    areaGroup,
    level: normalizedLevel,
  });
  const displayArea = formatAreaWithSide({ area: normalizedArea, side: normalizedSide }) || normalizedArea;
  const protectedLine = resolveProtectedLine({ areaGroup, flags: capabilityFlags });
  const preservedLine = resolvePreservedLine({ areaGroup, flags: capabilityFlags });
  const blockedPatterns = describeMovementList(movementMatrix, "avoid");
  const cautionPatterns = describeMovementList(movementMatrix, "caution");
  const summaryLine = active
    ? `${displayArea} ${normalizedLevel.replaceAll("_", " ")}: protect ${protectedLine} while preserving ${preservedLine}.`
    : "No active injury modifiers.";
  const constraintLines = active
    ? [
        summaryLine,
        normalizedLimitations.length ? `User-marked limits: ${normalizedLimitations.map((item) => LIMITATION_LABELS[item] || item).join(", ")}.` : "",
        blockedPatterns.length ? `Avoid today: ${blockedPatterns.join(", ")}.` : "",
        capabilityFlags.preserveUpperBody ? "Still available: upper-body maintenance work if it stays pain-free." : "",
        capabilityFlags.preserveLowerBody ? "Still available: lower-body and aerobic work that stays symptom-calm." : "",
        safeNotes ? `Context note: ${safeNotes}` : "",
      ].filter(Boolean)
    : [];

  return {
    active,
    level: active ? normalizedLevel : "none",
    area: active ? normalizedArea : normalizedArea,
    side: normalizedSide,
    displayArea,
    limitations: normalizedLimitations,
    areaGroup,
    notes: safeNotes,
    impact: normalizedImpact,
    movementMatrix,
    blockedPatterns,
    cautionPatterns,
    protectedLine,
    preservedLine,
    summaryLine,
    constraintLines,
    capabilities: capabilityFlags,
    ...capabilityFlags,
  };
};

export const buildInjuryConstraintLines = (injuryState = {}) => {
  const profile = buildInjuryCapabilityProfile(injuryState || {});
  return profile.constraintLines || [];
};

const inferExercisePatterns = (exercise = "") => {
  const lower = sanitizeText(exercise, 160).toLowerCase();
  if (!lower) return [];
  const patterns = new Set();
  if (/run|jog|sprint|tempo|interval|stride/.test(lower)) patterns.add("run");
  if (/jump|plyo|hop|bound|box jump/.test(lower)) patterns.add("jump");
  if (/squat|leg press|belt squat|step-up|step up/.test(lower)) patterns.add("squat");
  if (/deadlift|rdl|romanian|good morning|hinge|hip thrust|glute bridge/.test(lower)) patterns.add("hinge");
  if (/lunge|split squat|bulgarian|single-leg|single leg/.test(lower)) patterns.add("lunge");
  if (/carry|farmer|suitcase|yoke/.test(lower)) patterns.add("carry");
  if (/bench|push-up|push up|chest press|floor press|dip|incline press|fly/.test(lower)) patterns.add("horizontalPress");
  if (/overhead|shoulder press|push press|landmine press|arnold press/.test(lower)) patterns.add("verticalPress");
  if (/row|seal row|face pull|rear delt/.test(lower)) patterns.add("horizontalPull");
  if (/pull-up|pull up|chin-up|chin up|pulldown|lat pull/.test(lower)) patterns.add("verticalPull");
  if (/rotation|pallof|twist/.test(lower)) patterns.add("rotation");
  if (/plank|dead bug|bird dog|hollow|trunk|core|ab wheel/.test(lower)) patterns.add("trunk");
  return Array.from(patterns);
};

const resolveWorkoutExercises = (workout = {}) => [
  ...(Array.isArray(workout?.prescribedExercises) ? workout.prescribedExercises : []),
  ...(Array.isArray(workout?.exerciseRows) ? workout.exerciseRows : []),
  ...(Array.isArray(workout?.strengthExercises) ? workout.strengthExercises : []),
  ...(Array.isArray(workout?.exercises) ? workout.exercises : []),
  ...(Array.isArray(workout?.strength?.rows) ? workout.strength.rows : []),
].filter(Boolean);

const cloneExercise = (entry = {}) => ({ ...entry });

export const filterPrescribedExercisesForInjury = ({
  workout = {},
  injuryState = {},
} = {}) => {
  const profile = buildInjuryCapabilityProfile(injuryState || {});
  const source = resolveWorkoutExercises(workout);
  const allowed = [];
  const removed = [];

  source.forEach((entry = {}) => {
    const exerciseName = sanitizeText(entry?.ex || entry?.exercise || entry?.exercise_name || "", 120);
    const patterns = inferExercisePatterns(exerciseName);
    const shouldRemove = patterns.some((pattern) => profile.movementMatrix?.[pattern] === "avoid");
    const cloned = cloneExercise(entry);
    if (shouldRemove) removed.push(cloned);
    else allowed.push(cloned);
  });

  return {
    profile,
    source,
    allowed,
    removed,
  };
};

const buildUpperBodyMaintenanceExercises = () => ([
  { ex: "Bench Press or DB Bench", sets: "4", reps: "6-8", rest: "90 sec", cue: "Stable setup and stop shy of painful reps." },
  { ex: "Chest-Supported Row", sets: "4", reps: "8-10", rest: "75 sec", cue: "Support the torso so lower-body balance is not the limiter." },
  { ex: "Lat Pulldown or Assisted Pull-Up", sets: "3", reps: "8-10", rest: "75 sec", cue: "Smooth full range without forcing the shoulders." },
  { ex: "Seated Curl + Triceps Pressdown", sets: "2-3", reps: "10-15", rest: "45 sec", cue: "Easy accessories only if the irritated area stays calm." },
]);

const buildLowImpactSupportBlocks = (profile = {}) => {
  if (profile.areaGroup === "lower_distal" || profile.areaGroup === "lower_proximal") {
    return [
      { title: "Low-impact aerobic swap", detail: "10-20 min bike, pool work, or upper-body erg only if symptoms stay calm", note: "Skip impact and stop if mechanics change." },
      { title: "Mobility reset", detail: "5-10 min ankle, calf, or hip-friendly mobility", note: "Stay in the pain-free range." },
    ];
  }
  if (profile.areaGroup === "trunk") {
    return [
      { title: "Aerobic swap", detail: "10-20 min easy bike or walk with calm posture", note: "Avoid loaded carries and hard hinging." },
      { title: "Reset", detail: "5-8 min breathing, bracing, and gentle mobility", note: "The goal is symptom control, not extra fatigue." },
    ];
  }
  return [
    { title: "Recovery block", detail: "10-20 min easy conditioning only if symptoms stay calm", note: "Protect the irritated lane first." },
  ];
};

const isStrengthLikeWorkout = (workout = {}) => {
  const type = sanitizeText(workout?.type || "", 60).toLowerCase();
  const label = sanitizeText(workout?.label || "", 120).toLowerCase();
  return Boolean(
    resolveWorkoutExercises(workout).length
    || workout?.strSess
    || /strength|bench|press|pull|hypertrophy|lift/.test(type)
    || /strength|bench|press|pull|hypertrophy|lift/.test(label)
  );
};

const isRunLikeWorkout = (workout = {}) => {
  const type = sanitizeText(workout?.type || "", 60).toLowerCase();
  const label = sanitizeText(workout?.label || "", 120).toLowerCase();
  return Boolean(
    workout?.run
    || /run/.test(type)
    || /run|tempo|interval|long/.test(label)
  );
};

const buildProtectedStrengthWorkout = ({ baseWorkout = {}, profile, allowedExercises = [] } = {}) => {
  const rows = allowedExercises.length > 0 ? allowedExercises : buildUpperBodyMaintenanceExercises();
  const carrySecondary = profile.runningRestricted || profile.lowerBodyLoadingRestricted
    ? "Optional: short mobility and easy bike cooldown only if symptoms stay calm."
    : "Optional: easy mobility cooldown.";
  return {
    ...baseWorkout,
    label: "Upper-Body Maintenance",
    type: "strength+prehab",
    injuryAdjusted: true,
    run: null,
    strSess: baseWorkout?.strSess || "B",
    prescribedExercises: rows,
    optionalSecondary: carrySecondary,
    supportBlocks: buildLowImpactSupportBlocks(profile),
    environmentNote: [baseWorkout?.environmentNote, "Lower-body stress is removed today while upper-body lifting stays available."].filter(Boolean).join(" ").trim(),
  };
};

const buildLowImpactConditioningWorkout = ({ baseWorkout = {}, profile, label = "Low-Impact Conditioning + Recovery" } = {}) => ({
  ...baseWorkout,
  label,
  type: "conditioning",
  injuryAdjusted: true,
  run: null,
  prescribedExercises: [],
  supportBlocks: buildLowImpactSupportBlocks(profile),
  optionalSecondary: "Keep the session short and stop if symptoms climb.",
  environmentNote: [baseWorkout?.environmentNote, "Running and impact are removed today; use a symptom-calm low-impact option instead."].filter(Boolean).join(" ").trim(),
  nutri: baseWorkout?.nutri || "recovery",
});

export const buildInjuryRuleResult = (todayWorkout = null, injuryState = {}) => {
  const profile = buildInjuryCapabilityProfile(injuryState || {});
  if (!profile.active || profile.level === "none") {
    return {
      workout: todayWorkout,
      mods: [],
      why: "No active injury modifiers.",
      caution: null,
      profile,
    };
  }

  const baseWorkout = { ...(todayWorkout || { label: "Recovery Mode", type: "rest" }) };
  const runLike = isRunLikeWorkout(baseWorkout);
  const strengthLike = isStrengthLikeWorkout(baseWorkout);
  const { allowed, removed } = filterPrescribedExercisesForInjury({ workout: baseWorkout, injuryState: profile });
  const lowerBodyLimited = profile.lowerBodyLimited;
  const upperBodyLimited = profile.upperBodyLimited;
  const canPreserveUpperBody = profile.preserveUpperBody;
  const replaceRun = runLike && (profile.runningRestricted || profile.impactRestricted || (profile.areaGroup === "trunk" && profile.level !== "mild_tightness"));

  if (profile.level === "mild_tightness") {
    const mildWorkout = {
      ...baseWorkout,
      injuryAdjusted: true,
      prescribedExercises: allowed.length ? allowed : baseWorkout?.prescribedExercises,
      environmentNote: [baseWorkout?.environmentNote, "Keep today submaximal and stop if symptoms sharpen."].filter(Boolean).join(" ").trim(),
    };
    if (replaceRun) mildWorkout.run = null;
    return {
      workout: replaceRun && !strengthLike
        ? buildLowImpactConditioningWorkout({ baseWorkout: mildWorkout, profile, label: "Reduced-Impact Conditioning" })
        : mildWorkout,
      mods: [
        "Reduce intensity by about 10-15%.",
        `Protect ${profile.protectedLine}.`,
        `Preserve ${profile.preservedLine}.`,
      ],
      why: profile.summaryLine,
      caution: "Training adjustment logic only, not medical advice.",
      profile,
    };
  }

  if (profile.level === "moderate_pain") {
    if ((strengthLike && canPreserveUpperBody) || (replaceRun && allowed.length > 0 && canPreserveUpperBody)) {
      return {
        workout: buildProtectedStrengthWorkout({ baseWorkout, profile, allowedExercises: allowed }),
        mods: [
          `Remove ${profile.protectedLine}.`,
          "Keep supported upper-body work only.",
          "Use low-impact aerobic support only if symptoms stay calm.",
        ],
        why: profile.summaryLine,
        caution: "If symptoms persist or worsen, stop and get professional guidance.",
        profile,
      };
    }
    if (replaceRun || lowerBodyLimited || profile.conditioningRestricted) {
      return {
        workout: buildLowImpactConditioningWorkout({ baseWorkout, profile }),
        mods: [
          `Remove ${profile.protectedLine}.`,
          "Swap the main session for low-impact conditioning or recovery work.",
          `Preserve ${profile.preservedLine}.`,
        ],
        why: profile.summaryLine,
        caution: "If symptoms persist or worsen, stop and get professional guidance.",
        profile,
      };
    }
    if (strengthLike && allowed.length > 0) {
      return {
        workout: {
          ...baseWorkout,
          injuryAdjusted: true,
          prescribedExercises: allowed,
          optionalSecondary: "Cut any movement that reproduces symptoms.",
          environmentNote: [baseWorkout?.environmentNote, "Only the unaffected lifts stay in today."].filter(Boolean).join(" ").trim(),
        },
        mods: [
          `Remove ${profile.protectedLine}.`,
          "Keep only symptom-calm lifts.",
          `Preserve ${profile.preservedLine}.`,
        ],
        why: profile.summaryLine,
        caution: "If symptoms persist or worsen, stop and get professional guidance.",
        profile,
      };
    }
  }

  if (profile.level === "sharp_pain_stop" && canPreserveUpperBody && (strengthLike || runLike)) {
    return {
      workout: buildProtectedStrengthWorkout({ baseWorkout, profile, allowedExercises: allowed }),
      mods: [
        `Stop ${profile.protectedLine}.`,
        "Only supported upper-body work is still on the table, and only if it stays completely calm.",
        "End the session immediately if pain spreads or mechanics change.",
      ],
      why: profile.summaryLine,
      caution: "Stop training and get medical guidance if symptoms are sharp or escalating.",
      profile,
    };
  }

  return {
    workout: {
      ...baseWorkout,
      label: "Stop / Recovery Only",
      type: "rest",
      injuryAdjusted: true,
      run: null,
      prescribedExercises: [],
      supportBlocks: buildLowImpactSupportBlocks(profile),
      nutri: "rest",
    },
    mods: [
      `Stop ${profile.protectedLine}.`,
      "Switch to recovery mode only.",
      "Use stop-language and monitor symptoms closely.",
    ],
    why: profile.summaryLine,
    caution: "Stop training and get medical guidance if symptoms are sharp or escalating.",
    profile,
  };
};
