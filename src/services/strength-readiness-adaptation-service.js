const clonePlainValue = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const parseSetPrescription = (setsText = "", repsText = "") => {
  const normalizedSets = sanitizeText(setsText, 80);
  const normalizedReps = sanitizeText(repsText, 80);
  const matched = normalizedSets.match(/^(\d+)\s*x\s*(.+)$/i);
  if (matched) {
    return {
      setsText: matched[1],
      repsText: normalizedReps || matched[2],
    };
  }
  return {
    setsText: normalizedSets,
    repsText: normalizedReps,
  };
};

const parseSetCount = (setsText = "") => {
  const normalized = sanitizeText(setsText, 80).replace(/[x\u00d7]/gi, "x");
  const simpleMultiplier = normalized.match(/^(\d+)\s*x\s*\d+/i);
  if (simpleMultiplier) return Math.max(1, Number(simpleMultiplier[1]));
  const values = Array.from(normalized.matchAll(/(\d+)/g)).map((match) => Number(match[1]));
  if (!values.length) return 3;
  return Math.max(1, ...values);
};

const inferExerciseBucket = (exerciseName = "", note = "") => {
  const text = `${exerciseName} ${note}`.toLowerCase();
  if (/plank|dead bug|bird dog|hollow|crunch|leg raise|carry|hold|trunk|core|ab wheel/.test(text)) return "trunk";
  if (/row|pull|face pull|pull-down|pull down|chin|lat/.test(text)) return "pull";
  if (/bench|press|push-up|push up|dip|fly|lateral raise|tricep|curl/.test(text)) return "upper";
  if (/squat|deadlift|hinge|rdl|split squat|lunge|step-up|step up|leg press|calf|bridge/.test(text)) return "lower";
  return "other";
};

const inferRepTarget = (row = {}, mode = "steady") => {
  const text = `${row?.reps || ""} ${row?.sets || ""} ${row?.note || ""}`.toLowerCase();
  const bucket = inferExerciseBucket(row?.ex || "", row?.note || "");
  const unilateral = /side|each/.test(text);
  const timed = /sec|min|round/.test(text) || bucket === "trunk";
  if (timed) {
    return mode === "recovery" ? "20-30 sec" : "25-40 sec";
  }
  if (bucket === "lower") {
    if (mode === "recovery") return unilateral ? "5-6/side" : "5-6 reps";
    return unilateral ? "6-8/side" : "6-8 reps";
  }
  if (bucket === "upper" || bucket === "pull") {
    if (mode === "recovery") return unilateral ? "6-8/side" : "6-8 reps";
    return unilateral ? "8-10/side" : "8-10 reps";
  }
  return mode === "recovery" ? "6-8 reps" : "8-10 reps";
};

const buildVariantRow = ({ row = {}, index = 0, mode = "steady" } = {}) => {
  const safeRow = clonePlainValue(row || {});
  if (mode === "steady") return safeRow;
  const parsed = parseSetPrescription(safeRow?.sets || "", safeRow?.reps || "");
  const bucket = inferExerciseBucket(safeRow?.ex || "", safeRow?.note || "");
  const setsCount = mode === "recovery"
    ? (index === 0 && bucket !== "trunk" ? 2 : 1)
    : (index === 0 && bucket !== "trunk" ? Math.min(3, Math.max(2, parseSetCount(parsed.setsText))) : 2);
  const notePrefix = mode === "recovery"
    ? "Recovery version: technique and blood flow only."
    : "Reduced-load version: controlled work only.";
  const effortSuffix = mode === "recovery"
    ? "Stop with 3-4 reps in reserve."
    : "Stop with 2-3 reps in reserve.";
  return {
    ...safeRow,
    sets: `${setsCount} sets`,
    reps: inferRepTarget(safeRow, mode),
    rest: mode === "recovery" ? "75-120s" : "60-90s",
    note: sanitizeText([notePrefix, effortSuffix].join(" "), 160),
    cue: sanitizeText(
      mode === "recovery"
        ? "Move crisply, keep bar speed easy, and shut it down before any grind."
        : "Keep positions clean and leave enough in the tank for tomorrow.",
      160
    ),
  };
};

const chooseReducedLoadRows = (rows = []) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (safeRows.length <= 3) return safeRows;
  return safeRows.slice(0, 3);
};

const chooseRecoveryRows = (rows = []) => {
  const safeRows = Array.isArray(rows) ? rows : [];
  if (safeRows.length <= 2) return safeRows;
  const first = safeRows[0];
  const firstBucket = inferExerciseBucket(first?.ex || "", first?.note || "");
  const companion = safeRows.slice(1).find((row) => {
    const bucket = inferExerciseBucket(row?.ex || "", row?.note || "");
    if (bucket === "trunk" || bucket === "pull") return true;
    return bucket !== firstBucket;
  }) || safeRows[1];
  return [first, companion].filter(Boolean);
};

const buildVariantConfig = ({ workout = {}, state = "steady" } = {}) => {
  const existingDuration = sanitizeText(workout?.strengthDuration || workout?.strengthDose || "", 80);
  if (state === "recovery") {
    return {
      strengthDuration: "12-18 min recovery strength",
      strengthDose: "12-18 min recovery strength",
      optionalSecondary: "Skip the secondary work. Finish with 8-10 min mobility and activation only.",
      intensityGuidance: "Recovery strength only",
      densityGuidance: "Very low density. Take full recovery between sets.",
      effortGuidance: "Technique-only loading. Leave 3-4 reps in reserve.",
      strengthPrescriptionMode: "recovery",
      successLine: "Touch the main patterns, keep every set crisp, and stop before fatigue climbs.",
      fallbackDuration: existingDuration || "12-18 min recovery strength",
    };
  }
  if (state === "reduced_load") {
    return {
      strengthDuration: "20-30 min reduced-load strength",
      strengthDose: "20-30 min reduced-load strength",
      optionalSecondary: "Skip the optional finisher. If anything, do 5-8 min mobility only.",
      intensityGuidance: "Controlled strength only",
      densityGuidance: "Lower density than planned. Use normal rest and no finishers.",
      effortGuidance: "Leave 2-3 reps in reserve and avoid any grinding reps.",
      strengthPrescriptionMode: "reduced_load",
      successLine: "Complete the main work cleanly, keep the total dose modest, and leave feeling better than you started.",
      fallbackDuration: existingDuration || "20-30 min reduced-load strength",
    };
  }
  return {
    strengthDuration: existingDuration,
    strengthDose: sanitizeText(workout?.strengthDose || workout?.strengthDuration || "", 80),
    optionalSecondary: sanitizeText(workout?.optionalSecondary || "", 160),
    intensityGuidance: sanitizeText(workout?.intensityGuidance || "Planned strength work", 160),
    densityGuidance: "Normal session density with the planned rest periods.",
    effortGuidance: "Work at the planned effort and leave 1-2 reps in reserve on the main lifts.",
    strengthPrescriptionMode: "steady",
    successLine: sanitizeText(workout?.success || "", 180),
    fallbackDuration: existingDuration,
  };
};

export const isStrengthWorkoutCandidate = (workout = null) => {
  const type = String(workout?.type || "").toLowerCase();
  return Boolean(
    workout?.strSess
    || (Array.isArray(workout?.prescribedExercises) && workout.prescribedExercises.length)
    || /strength/.test(type)
  );
};

export const adaptStrengthRowsForState = ({ rows = [], state = "steady" } = {}) => {
  const safeRows = Array.isArray(rows) ? rows.map((row) => clonePlainValue(row)) : [];
  const mode = ["recovery", "reduced_load"].includes(String(state || "").toLowerCase()) ? String(state).toLowerCase() : "steady";
  if (mode === "steady") {
    return {
      mode,
      rows: safeRows,
    };
  }
  const selectedRows = mode === "recovery" ? chooseRecoveryRows(safeRows) : chooseReducedLoadRows(safeRows);
  return {
    mode,
    rows: selectedRows.map((row, index) => buildVariantRow({ row, index, mode })),
  };
};

export const adaptStrengthWorkoutForState = ({ workout = null, state = "steady", fallbackRows = [] } = {}) => {
  if (!isStrengthWorkoutCandidate(workout)) return clonePlainValue(workout);
  const nextWorkout = clonePlainValue(workout || {});
  const baseRows = Array.isArray(nextWorkout?.prescribedExercises) && nextWorkout.prescribedExercises.length
    ? nextWorkout.prescribedExercises
    : (Array.isArray(fallbackRows) ? fallbackRows : []);
  const config = buildVariantConfig({ workout: nextWorkout, state });
  const rowVariant = adaptStrengthRowsForState({ rows: baseRows, state });
  if (rowVariant.rows.length) {
    nextWorkout.prescribedExercises = rowVariant.rows;
  }
  nextWorkout.strengthPrescriptionMode = config.strengthPrescriptionMode;
  nextWorkout.strengthDuration = config.strengthDuration || config.fallbackDuration;
  nextWorkout.strengthDose = config.strengthDose || config.fallbackDuration;
  nextWorkout.optionalSecondary = config.optionalSecondary;
  nextWorkout.intensityGuidance = config.intensityGuidance;
  nextWorkout.densityGuidance = config.densityGuidance;
  nextWorkout.effortGuidance = config.effortGuidance;
  if (config.successLine) nextWorkout.success = config.successLine;
  return nextWorkout;
};
