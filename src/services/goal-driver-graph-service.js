const DRIVER_GRAPH_VERSION = "2026-04-goal-driver-graph-v1";

const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const clampWeight = (value, fallback = 0.25) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(0.05, Math.min(1, Number(parsed.toFixed(2))));
};
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const buildDriver = ({
  id = "",
  label = "",
  weight = 0.25,
  rationale = "",
} = {}) => {
  const cleanId = sanitizeText(id, 80).toLowerCase();
  const cleanLabel = sanitizeText(label, 120);
  if (!cleanId || !cleanLabel) return null;
  return {
    id: cleanId,
    label: cleanLabel,
    weight: clampWeight(weight),
    rationale: sanitizeText(rationale, 180),
  };
};

const normalizeDriverEntries = (drivers = []) => (
  toArray(drivers)
    .map((driver) => buildDriver(driver))
    .filter(Boolean)
);

export const normalizeGoalDriverProfile = (profile = null) => {
  if (!profile || typeof profile !== "object") return null;
  const directDrivers = normalizeDriverEntries(profile?.directDrivers || []);
  const supportDrivers = normalizeDriverEntries(profile?.supportDrivers || []);
  const protectiveDrivers = normalizeDriverEntries(profile?.protectiveDrivers || []);
  if (!directDrivers.length && !supportDrivers.length && !protectiveDrivers.length) return null;
  return {
    version: sanitizeText(profile?.version || DRIVER_GRAPH_VERSION, 40) || DRIVER_GRAPH_VERSION,
    primaryDomain: sanitizeText(profile?.primaryDomain || "", 80).toLowerCase(),
    primaryOutcomeId: sanitizeText(profile?.primaryOutcomeId || "", 80).toLowerCase(),
    primaryOutcomeLabel: sanitizeText(profile?.primaryOutcomeLabel || "", 120),
    focusLabel: sanitizeText(profile?.focusLabel || "", 120),
    directDrivers,
    supportDrivers,
    protectiveDrivers,
    transferNotes: toArray(profile?.transferNotes).map((note) => sanitizeText(note, 180)).filter(Boolean).slice(0, 6),
  };
};

const buildDriverProfile = ({
  primaryDomain = "",
  primaryOutcomeId = "",
  primaryOutcomeLabel = "",
  focusLabel = "",
  directDrivers = [],
  supportDrivers = [],
  protectiveDrivers = [],
  transferNotes = [],
} = {}) => normalizeGoalDriverProfile({
  version: DRIVER_GRAPH_VERSION,
  primaryDomain,
  primaryOutcomeId,
  primaryOutcomeLabel,
  focusLabel,
  directDrivers,
  supportDrivers,
  protectiveDrivers,
  transferNotes,
});

const buildBenchDriverProfile = () => buildDriverProfile({
  primaryDomain: "strength_hypertrophy",
  primaryOutcomeId: "bench_press_strength",
  primaryOutcomeLabel: "Bench press strength",
  focusLabel: "Bench support graph",
  directDrivers: [
    { id: "horizontal_press_strength", label: "Horizontal pressing strength", weight: 0.42, rationale: "Heavy pressing still has to move." },
    { id: "bench_specific_exposure", label: "Bench-specific exposure", weight: 0.34, rationale: "Regular bench practice keeps the skill honest." },
  ],
  supportDrivers: [
    { id: "anterior_delt_strength", label: "Shoulder pressing support", weight: 0.18, rationale: "Shoulders often unlock stuck pressing." },
    { id: "triceps_strength", label: "Triceps strength", weight: 0.18, rationale: "Lockout strength still matters." },
    { id: "upper_back_stability", label: "Upper-back stability", weight: 0.14, rationale: "Stable pressing positions depend on the back." },
    { id: "scapular_control", label: "Scapular control", weight: 0.12, rationale: "The shoulder blade has to stay organized." },
    { id: "trunk_bracing", label: "Trunk bracing", weight: 0.1, rationale: "Pressing quality drops when the trunk leaks tension." },
    { id: "pressing_hypertrophy", label: "Pressing hypertrophy support", weight: 0.1, rationale: "Extra size can support the main lift over time." },
  ],
  protectiveDrivers: [
    { id: "shoulder_tolerance", label: "Shoulder tolerance", weight: 0.16, rationale: "A beat-up shoulder stops the whole lane." },
    { id: "elbow_tolerance", label: "Elbow tolerance", weight: 0.1, rationale: "Volume only matters if the joints tolerate it." },
  ],
  transferNotes: [
    "Shoulders, triceps, upper back, and trunk support can move bench even when bench itself is temporarily flat.",
  ],
});

const buildSquatDriverProfile = () => buildDriverProfile({
  primaryDomain: "strength_hypertrophy",
  primaryOutcomeId: "squat_strength",
  primaryOutcomeLabel: "Squat strength",
  focusLabel: "Squat support graph",
  directDrivers: [
    { id: "squat_pattern_strength", label: "Squat pattern strength", weight: 0.4, rationale: "The main pattern still needs real loading." },
    { id: "lower_body_max_strength", label: "Lower-body max strength", weight: 0.3, rationale: "The legs have to be able to express force." },
  ],
  supportDrivers: [
    { id: "ankle_stiffness", label: "Ankle stiffness", weight: 0.14, rationale: "Better force transfer can improve squat positions." },
    { id: "calf_soleus_capacity", label: "Calf and soleus support", weight: 0.1, rationale: "The lower leg helps stable knee travel and force transfer." },
    { id: "posterior_chain_strength", label: "Posterior-chain strength", weight: 0.12, rationale: "The squat is not just quads." },
    { id: "single_leg_control", label: "Single-leg control", weight: 0.1, rationale: "Asymmetries show up fast under the bar." },
    { id: "upper_back_stability", label: "Upper-back stability", weight: 0.1, rationale: "Bar position needs a stable shelf." },
    { id: "trunk_bracing", label: "Trunk bracing", weight: 0.14, rationale: "Squat strength leaks through the trunk first." },
  ],
  protectiveDrivers: [
    { id: "knee_tolerance", label: "Knee tolerance", weight: 0.14, rationale: "Knee irritation can flatten the whole build." },
    { id: "hip_tolerance", label: "Hip tolerance", weight: 0.1, rationale: "Hip tolerance shapes the usable squat dose." },
    { id: "back_tolerance", label: "Back tolerance", weight: 0.1, rationale: "The spine has to tolerate the loading pattern." },
  ],
});

const buildDeadliftDriverProfile = () => buildDriverProfile({
  primaryDomain: "strength_hypertrophy",
  primaryOutcomeId: "deadlift_strength",
  primaryOutcomeLabel: "Deadlift strength",
  focusLabel: "Deadlift support graph",
  directDrivers: [
    { id: "hinge_strength", label: "Hinge strength", weight: 0.44, rationale: "The pull still has to move from the floor or hinge." },
    { id: "deadlift_specific_exposure", label: "Deadlift-specific exposure", weight: 0.26, rationale: "Specificity still matters." },
  ],
  supportDrivers: [
    { id: "posterior_chain_strength", label: "Posterior-chain strength", weight: 0.16, rationale: "The hinge depends on glutes and hamstrings." },
    { id: "lat_bracing", label: "Lat bracing", weight: 0.12, rationale: "Lats keep the bar path and torso honest." },
    { id: "trunk_bracing", label: "Trunk bracing", weight: 0.14, rationale: "A soft trunk kills the pull." },
    { id: "grip_strength", label: "Grip strength", weight: 0.08, rationale: "Grip can become the limiter before the posterior chain." },
    { id: "single_leg_control", label: "Single-leg control", weight: 0.08, rationale: "The hinge still benefits from balance and asymmetry control." },
  ],
  protectiveDrivers: [
    { id: "back_tolerance", label: "Back tolerance", weight: 0.16, rationale: "The back often sets the ceiling." },
    { id: "hamstring_tolerance", label: "Hamstring tolerance", weight: 0.1, rationale: "Hamstrings need to tolerate the build." },
  ],
});

const buildOhpDriverProfile = () => buildDriverProfile({
  primaryDomain: "strength_hypertrophy",
  primaryOutcomeId: "overhead_press_strength",
  primaryOutcomeLabel: "Overhead press strength",
  focusLabel: "Overhead press support graph",
  directDrivers: [
    { id: "vertical_press_strength", label: "Vertical pressing strength", weight: 0.42, rationale: "The vertical press still needs dedicated loading." },
    { id: "overhead_press_exposure", label: "Overhead-specific exposure", weight: 0.3, rationale: "Specific press practice matters." },
  ],
  supportDrivers: [
    { id: "anterior_delt_strength", label: "Shoulder pressing support", weight: 0.18, rationale: "Shoulders are part of the main limiter." },
    { id: "triceps_strength", label: "Triceps strength", weight: 0.16, rationale: "Triceps still close the press." },
    { id: "upper_back_stability", label: "Upper-back stability", weight: 0.1, rationale: "You need a stable shelf overhead too." },
    { id: "scapular_control", label: "Scapular control", weight: 0.14, rationale: "Scaps need to upwardly rotate and stay organized." },
    { id: "trunk_bracing", label: "Trunk bracing", weight: 0.12, rationale: "Vertical pressing exposes trunk leaks fast." },
  ],
  protectiveDrivers: [
    { id: "shoulder_tolerance", label: "Shoulder tolerance", weight: 0.16, rationale: "Shoulders can cap overhead progress quickly." },
    { id: "elbow_tolerance", label: "Elbow tolerance", weight: 0.08, rationale: "Pain-free pressing matters." },
  ],
});

const buildGenericStrengthProfile = () => buildDriverProfile({
  primaryDomain: "strength_hypertrophy",
  primaryOutcomeId: "compound_strength_progression",
  primaryOutcomeLabel: "Compound strength progression",
  focusLabel: "Strength support graph",
  directDrivers: [
    { id: "compound_strength_progression", label: "Compound strength progression", weight: 0.42, rationale: "The big lifts still need to move." },
  ],
  supportDrivers: [
    { id: "upper_back_stability", label: "Upper-back stability", weight: 0.16, rationale: "The back supports almost every lift." },
    { id: "trunk_bracing", label: "Trunk bracing", weight: 0.16, rationale: "Bracing underpins almost every heavy pattern." },
    { id: "single_leg_control", label: "Single-leg control", weight: 0.12, rationale: "Better symmetry often supports better loading." },
    { id: "posterior_chain_strength", label: "Posterior-chain strength", weight: 0.14, rationale: "A weak backside shows up across lifts." },
    { id: "hypertrophy_support", label: "Hypertrophy support", weight: 0.12, rationale: "Extra tissue can support long-term strength." },
  ],
  protectiveDrivers: [
    { id: "joint_tolerance", label: "Joint tolerance", weight: 0.16, rationale: "Progress is only real if the joints tolerate the work." },
  ],
});

const buildRunningDriverProfile = () => buildDriverProfile({
  primaryDomain: "running_endurance",
  primaryOutcomeId: "running_performance",
  primaryOutcomeLabel: "Running performance",
  focusLabel: "Running support graph",
  directDrivers: [
    { id: "aerobic_base", label: "Aerobic base", weight: 0.32, rationale: "The run lane still starts with aerobic work." },
    { id: "threshold_endurance", label: "Threshold endurance", weight: 0.24, rationale: "Race pace lives around threshold tolerance." },
    { id: "long_run_durability", label: "Long-run durability", weight: 0.24, rationale: "The event build still depends on long-run repeatability." },
  ],
  supportDrivers: [
    { id: "calf_soleus_capacity", label: "Calf and soleus capacity", weight: 0.12, rationale: "Lower-leg capacity supports economy and durability." },
    { id: "ankle_stiffness", label: "Ankle stiffness", weight: 0.1, rationale: "Force transfer and economy depend on the ankle." },
    { id: "single_leg_control", label: "Single-leg control", weight: 0.1, rationale: "Running is repeated single-leg work." },
    { id: "hip_stability", label: "Hip stability", weight: 0.1, rationale: "Hip control supports stride quality and durability." },
    { id: "trunk_stiffness", label: "Trunk stiffness", weight: 0.08, rationale: "A stable trunk supports better force transfer." },
    { id: "hamstring_durability", label: "Hamstring durability", weight: 0.08, rationale: "Hamstrings often set the ceiling on quality work." },
  ],
  protectiveDrivers: [
    { id: "lower_leg_tolerance", label: "Lower-leg tolerance", weight: 0.12, rationale: "The lower leg often decides what volume is repeatable." },
    { id: "tendon_tolerance", label: "Tendon tolerance", weight: 0.1, rationale: "The tendon layer often needs more care than the lungs." },
    { id: "impact_tolerance", label: "Impact tolerance", weight: 0.08, rationale: "The body has to tolerate the pounding." },
  ],
  transferNotes: [
    "Support lifting can improve durability and economy, but it never replaces run-specific work.",
  ],
});

const buildSwimmingDriverProfile = () => buildDriverProfile({
  primaryDomain: "swimming_endurance_technique",
  primaryOutcomeId: "swimming_performance",
  primaryOutcomeLabel: "Swimming performance",
  focusLabel: "Swimming support graph",
  directDrivers: [
    { id: "swim_technique", label: "Swim technique", weight: 0.34, rationale: "Technique is still the main bottleneck in the water." },
    { id: "swim_aerobic_endurance", label: "Swim aerobic endurance", weight: 0.24, rationale: "The aerobic lane still matters." },
    { id: "swim_threshold_tolerance", label: "Swim threshold tolerance", weight: 0.18, rationale: "Faster swimming needs threshold tolerance too." },
  ],
  supportDrivers: [
    { id: "lat_strength", label: "Lat strength", weight: 0.12, rationale: "The pull still depends on the lats." },
    { id: "triceps_strength", label: "Triceps strength", weight: 0.08, rationale: "The finish of the stroke still needs triceps." },
    { id: "scapular_control", label: "Scapular control", weight: 0.1, rationale: "Shoulder blade control supports better stroke positions." },
    { id: "trunk_stiffness", label: "Trunk stiffness", weight: 0.08, rationale: "A stable trunk helps keep force connected." },
    { id: "shoulder_rotation_endurance", label: "Shoulder rotation endurance", weight: 0.08, rationale: "Shoulder endurance matters for repeatable stroke quality." },
    { id: "hip_extension_support", label: "Hip extension support", weight: 0.06, rationale: "Hips still matter for line and kick support." },
  ],
  protectiveDrivers: [
    { id: "shoulder_tolerance", label: "Shoulder tolerance", weight: 0.12, rationale: "The shoulder often caps swim volume first." },
    { id: "neck_upper_back_tolerance", label: "Neck and upper-back tolerance", weight: 0.08, rationale: "Position tolerance matters for repeatable swim work." },
  ],
  transferNotes: [
    "Dryland support can improve the muscles and positions that keep swim pace repeatable, but it never replaces pool time.",
  ],
});

const buildCyclingDriverProfile = () => buildDriverProfile({
  primaryDomain: "cycling_endurance",
  primaryOutcomeId: "cycling_performance",
  primaryOutcomeLabel: "Cycling performance",
  focusLabel: "Cycling support graph",
  directDrivers: [
    { id: "aerobic_base", label: "Aerobic base", weight: 0.34, rationale: "The ride lane is still aerobic first." },
    { id: "sustainable_power", label: "Sustainable power", weight: 0.24, rationale: "Bike performance still comes down to repeatable power." },
  ],
  supportDrivers: [
    { id: "glute_strength", label: "Glute strength", weight: 0.12, rationale: "Hip force still matters on the bike." },
    { id: "single_leg_control", label: "Single-leg control", weight: 0.08, rationale: "Pedaling is repeated unilateral work." },
    { id: "trunk_stiffness", label: "Trunk stiffness", weight: 0.08, rationale: "A stable trunk helps hold position." },
  ],
  protectiveDrivers: [
    { id: "knee_tolerance", label: "Knee tolerance", weight: 0.1, rationale: "Knees often gate cycling volume." },
    { id: "hip_tolerance", label: "Hip tolerance", weight: 0.08, rationale: "Position tolerance matters for repeatable riding." },
  ],
});

const buildBodyCompDriverProfile = () => buildDriverProfile({
  primaryDomain: "body_composition_recomposition",
  primaryOutcomeId: "body_composition_progress",
  primaryOutcomeLabel: "Body-composition progress",
  focusLabel: "Body-composition support graph",
  directDrivers: [
    { id: "nutrition_adherence", label: "Nutrition adherence", weight: 0.38, rationale: "Body-composition goals still start with adherence." },
    { id: "energy_balance_control", label: "Energy-balance control", weight: 0.22, rationale: "The weekly energy picture still matters." },
  ],
  supportDrivers: [
    { id: "resistance_training_consistency", label: "Resistance-training consistency", weight: 0.16, rationale: "Muscle retention needs repeatable lifting." },
    { id: "protein_adherence", label: "Protein adherence", weight: 0.14, rationale: "Protein helps body-composition progress stay athletic." },
    { id: "aerobic_support", label: "Aerobic support", weight: 0.1, rationale: "Aerobic work can support the body-comp lane when it is dosed well." },
  ],
  protectiveDrivers: [
    { id: "recovery_adherence", label: "Recovery adherence", weight: 0.12, rationale: "Too much fatigue usually breaks adherence first." },
  ],
});

const buildHybridDriverProfile = ({ text = "" } = {}) => {
  const lowerText = sanitizeText(text, 420).toLowerCase();
  const leaningBench = /\bbench|press|upper body\b/.test(lowerText);
  const strengthProfile = leaningBench ? buildBenchDriverProfile() : buildGenericStrengthProfile();
  const runningProfile = buildRunningDriverProfile();
  const mergedDirect = [
    ...toArray(runningProfile?.directDrivers),
    ...toArray(strengthProfile?.directDrivers).slice(0, 1),
  ];
  const mergedSupport = [
    ...toArray(runningProfile?.supportDrivers),
    ...toArray(strengthProfile?.supportDrivers).slice(0, 4),
  ];
  const mergedProtective = [
    ...toArray(runningProfile?.protectiveDrivers),
    ...toArray(strengthProfile?.protectiveDrivers),
  ];
  return buildDriverProfile({
    primaryDomain: "hybrid_multi_domain",
    primaryOutcomeId: "hybrid_performance",
    primaryOutcomeLabel: "Hybrid performance",
    focusLabel: "Hybrid support graph",
    directDrivers: mergedDirect,
    supportDrivers: mergedSupport,
    protectiveDrivers: mergedProtective,
    transferNotes: [
      "Support work has to help the lead lane without quietly wrecking the other lane.",
    ],
  });
};

const getGoalSourceText = (goal = {}) => sanitizeText([
  goal?.name,
  goal?.summary,
  goal?.resolvedGoal?.summary,
  goal?.resolvedGoal?.rawIntent?.text,
  goal?.primaryMetric?.label,
  goal?.resolvedGoal?.primaryMetric?.label,
].filter(Boolean).join(". "), 420).toLowerCase();

const detectStrengthFocus = ({ text = "", metricKey = "" } = {}) => {
  const corpus = `${sanitizeText(metricKey, 80).toLowerCase()} ${sanitizeText(text, 420).toLowerCase()}`;
  if (/\bbench|bench_press|chest press\b/.test(corpus)) return "bench";
  if (/\bsquat\b/.test(corpus)) return "squat";
  if (/\bdeadlift|hinge\b/.test(corpus)) return "deadlift";
  if (/\bohp|overhead press|shoulder press\b/.test(corpus)) return "ohp";
  return "generic";
};

export const buildGoalDriverProfile = ({ goal = {} } = {}) => {
  const existingProfile = normalizeGoalDriverProfile(goal?.driverProfile || goal?.resolvedGoal?.driverProfile || null);
  if (existingProfile) return existingProfile;

  const resolvedGoal = goal?.resolvedGoal || {};
  const primaryDomain = sanitizeText(resolvedGoal?.primaryDomain || goal?.primaryDomain || "", 80).toLowerCase();
  const planningCategory = sanitizeText(resolvedGoal?.planningCategory || goal?.planningCategory || goal?.category || "", 40).toLowerCase();
  const goalFamily = sanitizeText(resolvedGoal?.goalFamily || goal?.goalFamily || "", 40).toLowerCase();
  const primaryMetricKey = sanitizeText(resolvedGoal?.primaryMetric?.key || goal?.primaryMetric?.key || "", 80).toLowerCase();
  const text = getGoalSourceText(goal);

  if (primaryDomain === "swimming_endurance_technique" || /\bswim|swimming|pool|open water\b/.test(text)) {
    return buildSwimmingDriverProfile();
  }
  if (primaryDomain === "running_endurance" || planningCategory === "running" || /\brun|half marathon|marathon|10k|5k|race\b/.test(text)) {
    return buildRunningDriverProfile();
  }
  if (primaryDomain === "cycling_endurance" || /\bbike|cycling|ride|trainer|peloton\b/.test(text)) {
    return buildCyclingDriverProfile();
  }
  if (primaryDomain === "hybrid_multi_domain" || goalFamily === "hybrid" || /\bhybrid\b/.test(text)) {
    return buildHybridDriverProfile({ text });
  }
  if (primaryDomain === "body_composition_recomposition" || planningCategory === "body_comp" || goalFamily === "body_comp" || goalFamily === "appearance") {
    return buildBodyCompDriverProfile();
  }
  if (primaryDomain === "strength_hypertrophy" || planningCategory === "strength" || goalFamily === "strength") {
    const focus = detectStrengthFocus({ text, metricKey: primaryMetricKey });
    if (focus === "bench") return buildBenchDriverProfile();
    if (focus === "squat") return buildSquatDriverProfile();
    if (focus === "deadlift") return buildDeadliftDriverProfile();
    if (focus === "ohp") return buildOhpDriverProfile();
    return buildGenericStrengthProfile();
  }
  return buildDriverProfile({
    primaryDomain: primaryDomain || planningCategory || "general_foundation",
    primaryOutcomeId: "general_training_progress",
    primaryOutcomeLabel: "General training progress",
    focusLabel: "General support graph",
    directDrivers: [
      { id: "consistency_habit_restoration", label: "Consistency and repeatability", weight: 0.38, rationale: "The first limiter is often simple consistency." },
    ],
    supportDrivers: [
      { id: "durability_prehab", label: "Durability support", weight: 0.18, rationale: "The plan still needs to be repeatable." },
      { id: "mobility_movement_quality", label: "Movement quality", weight: 0.12, rationale: "Better movement quality supports better repetition." },
    ],
    protectiveDrivers: [
      { id: "joint_tolerance", label: "Joint tolerance", weight: 0.12, rationale: "A boring, repeatable build still needs tolerance." },
    ],
  });
};
