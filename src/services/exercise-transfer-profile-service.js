const EXERCISE_TRANSFER_PROFILE_VERSION = "2026-04-exercise-transfer-v1";

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const uniqueStrings = (items = []) => [...new Set((Array.isArray(items) ? items : []).map((item) => sanitizeText(item, 80).toLowerCase()).filter(Boolean))];

const buildProfile = ({
  exerciseName = "",
  primaryPattern = "",
  directDriverIds = [],
  supportDriverIds = [],
  protectiveDriverIds = [],
} = {}) => {
  const cleanExerciseName = sanitizeText(exerciseName, 120);
  if (!cleanExerciseName) return null;
  return {
    version: EXERCISE_TRANSFER_PROFILE_VERSION,
    exerciseName: cleanExerciseName,
    exerciseKey: cleanExerciseName.toLowerCase(),
    primaryPattern: sanitizeText(primaryPattern, 60).toLowerCase(),
    directDriverIds: uniqueStrings(directDriverIds),
    supportDriverIds: uniqueStrings(supportDriverIds),
    protectiveDriverIds: uniqueStrings(protectiveDriverIds),
  };
};

export const normalizeExerciseTransferProfile = (profile = null) => {
  if (!profile || typeof profile !== "object") return null;
  return buildProfile({
    exerciseName: profile?.exerciseName || profile?.exercise || "",
    primaryPattern: profile?.primaryPattern || "",
    directDriverIds: profile?.directDriverIds || [],
    supportDriverIds: profile?.supportDriverIds || [],
    protectiveDriverIds: profile?.protectiveDriverIds || [],
  });
};

export const buildExerciseTransferProfile = ({
  exerciseName = "",
  note = "",
} = {}) => {
  const text = sanitizeText(`${exerciseName} ${note}`, 240).toLowerCase();
  const cleanExerciseName = sanitizeText(exerciseName, 120);
  if (!cleanExerciseName) return null;

  if (/bench press|barbell bench|db bench|dumbbell bench|floor press|push[-\s]?up|push up|chest press/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "upper_press",
      directDriverIds: /bench/.test(text) ? ["horizontal_press_strength", "bench_specific_exposure"] : ["horizontal_press_strength"],
      supportDriverIds: ["triceps_strength", "upper_back_stability", "trunk_bracing"],
      protectiveDriverIds: ["shoulder_tolerance", "elbow_tolerance"],
    });
  }

  if (/incline/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "upper_press_support",
      supportDriverIds: ["horizontal_press_strength", "anterior_delt_strength", "pressing_hypertrophy"],
      protectiveDriverIds: ["shoulder_tolerance"],
    });
  }

  if (/overhead press|shoulder press|\bohp\b/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "vertical_press",
      directDriverIds: ["vertical_press_strength"],
      supportDriverIds: ["triceps_strength", "scapular_control", "trunk_bracing"],
      protectiveDriverIds: ["shoulder_tolerance", "elbow_tolerance"],
    });
  }

  if (/lateral raise|front raise/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "shoulder_isolation",
      supportDriverIds: ["anterior_delt_strength"],
      protectiveDriverIds: ["shoulder_tolerance"],
    });
  }

  if (/rear delt|face pull|pull[-\s]?apart|band pull[-\s]?apart|band pull apart/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "scap_support",
      supportDriverIds: ["upper_back_stability", "scapular_control"],
      protectiveDriverIds: ["shoulder_tolerance", "neck_upper_back_tolerance"],
    });
  }

  if (/tricep|pressdown|skull crusher|dip/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "triceps_support",
      supportDriverIds: ["triceps_strength"],
      protectiveDriverIds: ["elbow_tolerance", "shoulder_tolerance"],
    });
  }

  if (/pull[-\s]?up|pull up|chin[-\s]?up|chin up|pull-down|pulldown|lat pull|lat row|row|seal row|chest-supported row|chest supported row|one-arm row|one arm row/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "upper_pull",
      supportDriverIds: ["upper_back_stability", "scapular_control", "lat_strength"],
      protectiveDriverIds: ["neck_upper_back_tolerance", "shoulder_tolerance"],
    });
  }

  if (/external rotation|cuff|wall slide|serratus|scap/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "shoulder_tolerance",
      supportDriverIds: ["scapular_control", "shoulder_rotation_endurance"],
      protectiveDriverIds: ["shoulder_tolerance"],
    });
  }

  if (/carry|plank|dead bug|bird dog|ab wheel|hollow|leg raise|crunch|pallof|trunk|core/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "trunk",
      supportDriverIds: ["trunk_bracing", "trunk_stiffness"],
      protectiveDriverIds: ["back_tolerance"],
    });
  }

  if (/calf|heel drop/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "lower_leg_support",
      supportDriverIds: ["calf_soleus_capacity", "ankle_stiffness"],
      protectiveDriverIds: ["lower_leg_tolerance", "tendon_tolerance"],
    });
  }

  if (/split squat|lunge|step[-\s]?up|step up|single[-\s]?leg|single leg/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "single_leg",
      supportDriverIds: ["single_leg_control", "hip_stability"],
      protectiveDriverIds: ["knee_tolerance", "hip_tolerance"],
    });
  }

  if (/squat|leg press|hack squat|goblet squat|front squat|back squat/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "squat",
      directDriverIds: ["squat_pattern_strength", "lower_body_max_strength"],
      supportDriverIds: ["trunk_bracing", "ankle_stiffness", "calf_soleus_capacity"],
      protectiveDriverIds: ["knee_tolerance", "back_tolerance"],
    });
  }

  if (/deadlift|trap[-\s]?bar|trap bar|rdl|romanian deadlift|hinge/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "hinge",
      directDriverIds: ["hinge_strength"],
      supportDriverIds: ["posterior_chain_strength", "lat_bracing", "trunk_bracing", "hamstring_durability"],
      protectiveDriverIds: ["back_tolerance", "hamstring_tolerance"],
    });
  }

  if (/hamstring curl|glute bridge|hip thrust/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "posterior_chain_support",
      supportDriverIds: ["posterior_chain_strength", "hamstring_durability", "hip_extension_support"],
      protectiveDriverIds: ["hamstring_tolerance"],
    });
  }

  if (/swim cord|cord pull|straight-arm pull|straight arm pull|pullover/.test(text)) {
    return buildProfile({
      exerciseName: cleanExerciseName,
      primaryPattern: "swim_dryland",
      supportDriverIds: ["lat_strength", "triceps_strength", "scapular_control", "shoulder_rotation_endurance"],
      protectiveDriverIds: ["shoulder_tolerance"],
    });
  }

  return buildProfile({
    exerciseName: cleanExerciseName,
    primaryPattern: "general_strength",
    directDriverIds: [],
    supportDriverIds: [],
    protectiveDriverIds: [],
  });
};

export { EXERCISE_TRANSFER_PROFILE_VERSION };
