const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const field = (value, raw = value) => ({ value, raw: raw == null ? value : raw });

const uniqueStrings = (items = []) => {
  const seen = new Set();
  return toArray(items)
    .map((item) => sanitizeText(item, 220))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const mergeFields = (...fieldSets) => Object.assign({}, ...fieldSets.map((entry) => entry || {}));

const clone = (value) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const PROFILE_PRESETS = Object.freeze({
  run_novice: {
    experience: "beginner",
    schedule: 3,
    sessionLength: "45 min",
    environment: "Outdoor",
    equipment: ["Running shoes"],
    baselineSummary: "Newer runner with a few recent jogs and room to train three days per week.",
    fields: {
      current_run_frequency: field("2", "2"),
      training_age: field("beginner", "Beginner"),
      target_timeline: field("12 weeks", "12 weeks"),
      longest_recent_endurance_session: field("35 min", "35 min"),
    },
    tags: ["protective"],
  },
  run_intermediate: {
    experience: "intermediate",
    schedule: 5,
    sessionLength: "60 min",
    environment: "Outdoor",
    equipment: ["Running shoes", "Gym access"],
    baselineSummary: "Intermediate runner with steady weekly mileage and room for four to five sessions.",
    fields: {
      current_run_frequency: field("4", "4"),
      training_age: field("intermediate", "Intermediate"),
      target_timeline: field("16 weeks", "16 weeks"),
      recent_pace_baseline: field("10K in 53:00", "10K in 53:00"),
      longest_recent_endurance_session: field("80 min", "80 min"),
    },
  },
  run_partial: {
    experience: "returning",
    schedule: 3,
    sessionLength: "30 min",
    environment: "Outdoor",
    equipment: ["Running shoes"],
    baselineSummary: "Returning runner with inconsistent recent training and only partial baseline detail.",
    fields: {
      current_run_frequency: field("1", "1"),
      training_age: field("returning", "Returning"),
      target_timeline: field("fall", "fall"),
      progression_posture: field("protective", "Protective"),
    },
    tags: ["protective", "partial"],
  },
  swim_pool: {
    experience: "intermediate",
    schedule: 4,
    sessionLength: "45 min",
    environment: "Pool",
    equipment: ["Pool"],
    baselineSummary: "Regular pool access with a recent swim benchmark and room for multiple weekly swims.",
    fields: {
      recent_swim_anchor: field("1000 yd in 22:00", "1000 yd in 22:00"),
      swim_access_reality: field("pool", "Pool"),
    },
  },
  swim_returning: {
    experience: "returning",
    schedule: 3,
    sessionLength: "45 min",
    environment: "Pool",
    equipment: ["Pool"],
    baselineSummary: "Former swimmer returning after time away with modest current tolerance.",
    fields: {
      recent_swim_anchor: field("800 yd in 20:30", "800 yd in 20:30"),
      swim_access_reality: field("pool", "Pool"),
      progression_posture: field("protective", "Protective"),
    },
    tags: ["protective"],
  },
  cycling_road: {
    experience: "intermediate",
    schedule: 4,
    sessionLength: "60 min",
    environment: "Road",
    equipment: ["Bike", "Trainer"],
    baselineSummary: "Rides semi-regularly and can train four days each week with road or trainer access.",
    fields: {
      primary_modality: field("cycling", "Cycling"),
      current_endurance_anchor: field("20 mile ride", "20 mile ride"),
      longest_recent_endurance_session: field("90 min", "90 min"),
    },
  },
  cycling_partial: {
    experience: "returning",
    schedule: 3,
    sessionLength: "45 min",
    environment: "Road",
    equipment: ["Bike"],
    baselineSummary: "Has bike access but inconsistent recent riding and weaker benchmark detail.",
    fields: {
      current_endurance_anchor: field("45 min easy ride", "45 min easy ride"),
      progression_posture: field("standard", "Standard"),
    },
    tags: ["partial"],
  },
  tri_beginner: {
    experience: "beginner",
    schedule: 5,
    sessionLength: "60 min",
    environment: "Mixed",
    equipment: ["Pool", "Bike", "Running shoes"],
    baselineSummary: "Can train across swim-bike-run but is still early in structured multisport training.",
    fields: {
      event_distance: field("sprint_triathlon", "Sprint triathlon"),
      hybrid_priority: field("balanced", "Balanced"),
      starting_capacity_anchor: field("20_easy_minutes", "20 easy minutes"),
    },
  },
  tri_partial: {
    experience: "returning",
    schedule: 4,
    sessionLength: "45 min",
    environment: "Mixed",
    equipment: ["Pool", "Bike", "Running shoes"],
    baselineSummary: "Wants triathlon structure but feels like they are starting over and baseline detail is incomplete.",
    fields: {
      starting_capacity_anchor: field("10_easy_minutes", "10 easy minutes"),
      progression_posture: field("protective", "Protective"),
    },
    tags: ["protective", "partial"],
  },
  strength_gym: {
    experience: "intermediate",
    schedule: 4,
    sessionLength: "45 min",
    environment: "Gym",
    equipment: ["Barbell", "Dumbbells", "Bench"],
    baselineSummary: "Gym access with a stable lifting base and room for four weekly training days.",
    fields: {
      training_age: field("intermediate", "Intermediate"),
      equipment_profile: field("full_gym", "Full gym"),
      current_strength_baseline: field("Bench 185 x 5", "Bench 185 x 5"),
    },
  },
  strength_beginner: {
    experience: "beginner",
    schedule: 3,
    sessionLength: "45 min",
    environment: "Gym",
    equipment: ["Dumbbells", "Machines", "Bench"],
    baselineSummary: "Newer lifter with basic gym access and three realistic weekly sessions.",
    fields: {
      training_age: field("beginner", "Beginner"),
      equipment_profile: field("basic_gym", "Basic gym"),
    },
  },
  limited_home: {
    experience: "returning",
    schedule: 3,
    sessionLength: "30 min",
    environment: "Home",
    equipment: ["Dumbbells", "Bands", "Bodyweight"],
    baselineSummary: "Mostly trains at home with limited tools and short sessions.",
    fields: {
      equipment_profile: field("limited_home", "Limited home setup"),
      progression_posture: field("standard", "Standard"),
    },
    tags: ["limited_equipment", "dumbbell_only", "busy"],
  },
  physique_standard: {
    experience: "intermediate",
    schedule: 4,
    sessionLength: "45 min",
    environment: "Mixed",
    equipment: ["Dumbbells", "Gym access"],
    baselineSummary: "Can train consistently and wants body-composition progress without wrecking recovery.",
    fields: {
      current_bodyweight: field("185", "185"),
      muscle_retention_priority: field("high", "High"),
      cardio_preference: field("low_impact", "Low impact"),
    },
  },
  physique_busy: {
    experience: "returning",
    schedule: 3,
    sessionLength: "30 min",
    environment: "Travel",
    equipment: ["Dumbbells", "Bodyweight"],
    baselineSummary: "Travel-heavy schedule with limited time and a need for low-friction body-comp structure.",
    fields: {
      current_bodyweight: field("198", "198"),
      body_comp_tempo: field("busy_life", "Busy life"),
      cardio_preference: field("low_impact", "Low impact"),
      muscle_retention_priority: field("medium", "Medium"),
    },
    tags: ["busy"],
  },
  general_reset: {
    experience: "returning",
    schedule: 3,
    sessionLength: "45 min",
    environment: "Mixed",
    equipment: ["Dumbbells", "Bodyweight"],
    baselineSummary: "Has trained before but needs a clean, believable restart rather than a specialist split.",
    fields: {
      starting_capacity_anchor: field("20_easy_minutes", "20 easy minutes"),
    },
  },
  consistency_busy: {
    experience: "unknown",
    schedule: 2,
    sessionLength: "30 min",
    environment: "Home",
    equipment: ["Bodyweight", "Bands"],
    baselineSummary: "Low schedule capacity and needs a plan that survives busy weeks.",
    fields: {
      starting_capacity_anchor: field("15_easy_minutes", "15 easy minutes"),
    },
    tags: ["busy", "partial"],
  },
  reentry_protected: {
    experience: "returning",
    schedule: 2,
    sessionLength: "30 min",
    environment: "Home",
    equipment: ["Bodyweight", "Bands", "Dumbbells"],
    baselineSummary: "Coming back cautiously after time off and needs a low-drama protected restart.",
    fields: {
      starting_capacity_anchor: field("10_easy_minutes", "10 easy minutes"),
      progression_posture: field("protective", "Protective"),
    },
    tags: ["protective", "re_entry"],
  },
  reentry_low_impact: {
    experience: "returning",
    schedule: 3,
    sessionLength: "30 min",
    environment: "Home",
    equipment: ["Bike", "Bands", "Bodyweight"],
    baselineSummary: "Needs a lower-impact re-entry because joints or tolerance are still sensitive.",
    fields: {
      starting_capacity_anchor: field("15_easy_minutes", "15 easy minutes"),
      progression_posture: field("protective", "Protective"),
    },
    tags: ["protective", "re_entry"],
  },
  hybrid_running: {
    experience: "intermediate",
    schedule: 5,
    sessionLength: "45 min",
    environment: "Mixed",
    equipment: ["Barbell", "Dumbbells", "Running shoes"],
    baselineSummary: "Has enough room to run and lift, but running clearly leads the current block.",
    fields: {
      hybrid_priority: field("running", "Running"),
      current_run_frequency: field("4", "4"),
      equipment_profile: field("full_gym", "Full gym"),
      longest_recent_endurance_session: field("75 min", "75 min"),
    },
    tags: ["hybrid", "run_priority"],
  },
  hybrid_strength: {
    experience: "intermediate",
    schedule: 5,
    sessionLength: "45 min",
    environment: "Gym",
    equipment: ["Barbell", "Dumbbells", "Running shoes"],
    baselineSummary: "Wants hybrid training, but strength should get the cleaner recovery windows right now.",
    fields: {
      hybrid_priority: field("strength", "Strength"),
      equipment_profile: field("full_gym", "Full gym"),
      current_strength_baseline: field("Bench 205 x 5", "Bench 205 x 5"),
      current_run_frequency: field("2", "2"),
    },
    tags: ["hybrid", "strength_priority"],
  },
  sport_support: {
    experience: "intermediate",
    schedule: 4,
    sessionLength: "60 min",
    environment: "Mixed",
    equipment: ["Gym access", "Field space"],
    baselineSummary: "Needs field/court/tactical support that blends strength and conditioning honestly.",
    fields: {
      goal_focus: field("field_sport", "Field sport"),
      hybrid_priority: field("balanced", "Balanced"),
      starting_capacity_anchor: field("20_easy_minutes", "20 easy minutes"),
    },
    tags: ["hybrid"],
  },
});

const makePhrase = (text, options = {}) => ({
  text: sanitizeText(text, 220),
  allowLegacyMultiGoalCapture: Boolean(options.allowLegacyMultiGoalCapture),
  tags: uniqueStrings(options.tags || []),
});

const MAINSTREAM_SEEDS = [
  {
    id: "run_5k_beginner",
    templateId: "train_for_run_race",
    expectedFamily: "endurance",
    expectedIntentId: "train_for_run_race",
    expectedArchetypeIds: ["run_5k_completion_novice"],
    profileIds: ["run_novice", "run_partial", "consistency_busy"],
    fieldOverrides: { event_distance: field("5k", "5K") },
    specificityDefaults: { event_distance: "5k" },
    tags: ["endurance", "run_race", "needs_long_session"],
    phrases: [
      makePhrase("train for a 5k"),
      makePhrase("I want to finish my first 5K"),
      makePhrase("help me get ready for a local 5k"),
    ],
  },
  {
    id: "run_10k_improvement",
    templateId: "train_for_run_race",
    expectedFamily: "endurance",
    expectedIntentId: "train_for_run_race",
    expectedArchetypeIds: ["run_10k_completion_builder"],
    profileIds: ["run_intermediate", "run_partial", "run_novice"],
    fieldOverrides: { event_distance: field("10k", "10K") },
    specificityDefaults: { event_distance: "10k" },
    tags: ["endurance", "run_race", "needs_long_session", "improvement"],
    phrases: [
      makePhrase("improve my 10k time"),
      makePhrase("I want to get faster at the 10K"),
      makePhrase("train for a better 10k"),
    ],
  },
  {
    id: "run_half_completion",
    templateId: "half_marathon",
    expectedFamily: "endurance",
    expectedIntentId: "train_for_run_race",
    expectedArchetypeIds: ["run_half_completion_builder"],
    profileIds: ["run_novice", "run_intermediate", "run_partial"],
    fieldOverrides: { event_distance: field("half_marathon", "Half marathon") },
    specificityDefaults: { event_distance: "half_marathon" },
    tags: ["endurance", "run_race", "needs_long_session"],
    phrases: [
      makePhrase("train for a half marathon"),
      makePhrase("I want to finish a half marathon"),
      makePhrase("help me get ready for my first half marathon"),
    ],
  },
  {
    id: "run_half_improvement",
    templateId: "half_marathon",
    expectedFamily: "endurance",
    expectedIntentId: "train_for_run_race",
    expectedArchetypeIds: ["run_half_improvement_intermediate"],
    profileIds: ["run_intermediate", "run_intermediate", "run_partial"],
    fieldOverrides: { event_distance: field("half_marathon", "Half marathon") },
    specificityDefaults: { event_distance: "half_marathon" },
    tags: ["endurance", "run_race", "needs_long_session", "improvement"],
    phrases: [
      makePhrase("run a faster half marathon"),
      makePhrase("improve my half marathon time"),
      makePhrase("I want to get quicker for the half"),
    ],
  },
  {
    id: "run_marathon_completion",
    templateId: "marathon",
    expectedFamily: "endurance",
    expectedIntentId: "train_for_run_race",
    expectedArchetypeIds: ["run_marathon_completion_novice"],
    profileIds: ["run_intermediate", "run_partial", "run_novice"],
    fieldOverrides: { event_distance: field("marathon", "Marathon") },
    specificityDefaults: { event_distance: "marathon" },
    tags: ["endurance", "run_race", "needs_long_session"],
    phrases: [
      makePhrase("train for a marathon"),
      makePhrase("I want to finish a marathon"),
      makePhrase("help me get ready for my first marathon"),
    ],
  },
  {
    id: "run_marathon_improvement",
    templateId: "marathon",
    expectedFamily: "endurance",
    expectedIntentId: "train_for_run_race",
    expectedArchetypeIds: ["run_marathon_improvement_intermediate"],
    profileIds: ["run_intermediate", "run_intermediate", "run_partial"],
    fieldOverrides: { event_distance: field("marathon", "Marathon") },
    specificityDefaults: { event_distance: "marathon" },
    tags: ["endurance", "run_race", "needs_long_session", "improvement"],
    phrases: [
      makePhrase("run a better marathon"),
      makePhrase("improve my marathon time"),
      makePhrase("I want to race a stronger marathon"),
    ],
  },
  {
    id: "return_to_running",
    templateId: "return_to_running",
    expectedFamily: "endurance",
    expectedIntentId: "return_to_running",
    expectedArchetypeIds: ["run_return_conservative"],
    profileIds: ["run_partial", "reentry_protected", "consistency_busy"],
    tags: ["endurance", "run_race", "protective"],
    phrases: [
      makePhrase("return to running"),
      makePhrase("get back to running without overdoing it"),
      makePhrase("start running again after time off"),
    ],
  },
  {
    id: "swim_fitness",
    templateId: "swim_better",
    expectedFamily: "endurance",
    expectedIntentId: "swim_better",
    expectedArchetypeIds: ["swim_fitness_base"],
    profileIds: ["swim_pool", "swim_returning", "consistency_busy"],
    tags: ["endurance", "swim"],
    phrases: [
      makePhrase("swim for fitness"),
      makePhrase("build swim endurance"),
      makePhrase("I want my swimming to feel stronger again"),
    ],
  },
  {
    id: "swim_endurance",
    templateId: "swim_faster_mile",
    expectedFamily: "endurance",
    expectedIntentId: "swim_better",
    expectedArchetypeIds: ["swim_endurance_improvement"],
    profileIds: ["swim_pool", "swim_returning", "run_partial"],
    tags: ["endurance", "swim", "improvement"],
    phrases: [
      makePhrase("improve my swim endurance and technique"),
      makePhrase("swim a faster mile"),
      makePhrase("get better at longer swims"),
    ],
  },
  {
    id: "cycling_fitness",
    templateId: "ride_stronger",
    expectedFamily: "endurance",
    expectedIntentId: "ride_stronger",
    expectedArchetypeIds: ["cycling_endurance_base"],
    profileIds: ["cycling_road", "cycling_partial", "consistency_busy"],
    tags: ["endurance", "cycling"],
    phrases: [
      makePhrase("build cycling fitness"),
      makePhrase("ride stronger"),
      makePhrase("get better on the bike"),
    ],
  },
  {
    id: "triathlon_beginner",
    templateId: "triathlon_multisport",
    expectedFamily: "endurance",
    expectedIntentId: "triathlon_multisport",
    expectedArchetypeIds: ["triathlon_sprint_beginner"],
    profileIds: ["tri_beginner", "tri_partial", "swim_returning"],
    tags: ["endurance", "triathlon", "hybrid"],
    phrases: [
      makePhrase("train for a triathlon"),
      makePhrase("I want to do a sprint triathlon"),
      makePhrase("I want to do a triathlon but I’m basically starting over"),
    ],
  },
  {
    id: "get_stronger",
    templateId: "get_stronger",
    expectedFamily: "strength",
    expectedIntentId: "get_stronger",
    expectedArchetypeIds: ["strength_full_body_beginner", "strength_busy_three_day"],
    profileIds: ["strength_beginner", "strength_gym", "consistency_busy"],
    tags: ["strength"],
    phrases: [
      makePhrase("get stronger"),
      makePhrase("I want to get stronger in the gym"),
      makePhrase("build more general strength"),
    ],
  },
  {
    id: "build_muscle",
    templateId: "build_muscle",
    expectedFamily: "strength",
    expectedIntentId: "build_muscle",
    expectedArchetypeIds: ["hypertrophy_upper_lower", "hypertrophy_dumbbell_full_body"],
    profileIds: ["strength_gym", "limited_home", "strength_beginner"],
    tags: ["strength", "hypertrophy"],
    phrases: [
      makePhrase("build muscle"),
      makePhrase("gain muscle"),
      makePhrase("put on some size"),
    ],
  },
  {
    id: "bench_focus",
    templateId: "improve_big_lifts",
    expectedFamily: "strength",
    expectedIntentId: "improve_big_lifts",
    expectedArchetypeIds: ["lift_focus_bench"],
    profileIds: ["strength_gym", "strength_beginner", "consistency_busy"],
    fieldOverrides: { lift_focus: field("bench", "Bench") },
    specificityDefaults: { lift_focus: "bench" },
    tags: ["strength", "bench_focus"],
    phrases: [
      makePhrase("improve my bench press"),
      makePhrase("bench 225"),
      makePhrase("get stronger at bench"),
    ],
  },
  {
    id: "limited_equipment_strength",
    templateId: "train_with_limited_equipment",
    expectedFamily: "strength",
    expectedIntentId: "train_with_limited_equipment",
    expectedArchetypeIds: ["limited_equipment_strength", "hypertrophy_dumbbell_full_body"],
    profileIds: ["limited_home", "consistency_busy", "strength_beginner"],
    tags: ["strength", "limited_equipment", "dumbbell_only"],
    phrases: [
      makePhrase("train with limited equipment"),
      makePhrase("I only have dumbbells"),
      makePhrase("get stronger at home with minimal gear"),
    ],
  },
  {
    id: "strength_maintenance",
    templateId: "maintain_strength",
    expectedFamily: "strength",
    expectedIntentId: "maintain_strength",
    expectedArchetypeIds: ["strength_maintenance_minimal"],
    profileIds: ["strength_gym", "limited_home", "consistency_busy"],
    tags: ["strength", "maintenance_strength"],
    phrases: [
      makePhrase("maintain strength"),
      makePhrase("keep my strength while life is busy"),
      makePhrase("hold onto my strength for now"),
    ],
  },
  {
    id: "lose_body_fat",
    templateId: "lose_body_fat",
    expectedFamily: "physique",
    expectedIntentId: "lose_body_fat",
    expectedArchetypeIds: ["fat_loss_strength_retention", "fat_loss_busy_life"],
    profileIds: ["physique_standard", "physique_busy", "consistency_busy"],
    tags: ["physique", "fat_loss"],
    phrases: [
      makePhrase("lose body fat"),
      makePhrase("lose weight"),
      makePhrase("drop some fat without doing anything extreme"),
    ],
  },
  {
    id: "get_leaner",
    templateId: "get_leaner",
    expectedFamily: "physique",
    expectedIntentId: "get_leaner",
    expectedArchetypeIds: ["leaner_general"],
    profileIds: ["physique_standard", "physique_busy", "general_reset"],
    tags: ["physique", "leaner"],
    phrases: [
      makePhrase("get leaner"),
      makePhrase("look athletic again"),
      makePhrase("tone up"),
    ],
  },
  {
    id: "recomp",
    templateId: "recomp",
    expectedFamily: "physique",
    expectedIntentId: "recomp",
    expectedArchetypeIds: ["recomp_moderate_cardio"],
    profileIds: ["physique_standard", "strength_gym", "physique_busy"],
    tags: ["physique", "recomp"],
    phrases: [
      makePhrase("recomp"),
      makePhrase("lose fat and gain muscle"),
      makePhrase("change my body composition without a crash diet"),
    ],
  },
  {
    id: "event_cut",
    templateId: "cut_for_event",
    expectedFamily: "physique",
    expectedIntentId: "cut_for_event",
    expectedArchetypeIds: ["event_cut_structured"],
    profileIds: ["physique_standard", "physique_busy", "general_reset"],
    fieldOverrides: { target_timeline: field("8 weeks", "8 weeks") },
    tags: ["physique", "fat_loss", "event_cut"],
    phrases: [
      makePhrase("cut for an event"),
      makePhrase("lean out for a wedding"),
      makePhrase("get leaner for a trip in two months"),
    ],
  },
  {
    id: "keep_strength_while_cutting",
    templateId: "keep_strength_while_cutting",
    expectedFamily: "physique",
    expectedIntentId: "keep_strength_while_cutting",
    expectedArchetypeIds: ["fat_loss_strength_retention"],
    profileIds: ["physique_standard", "strength_gym", "physique_busy"],
    tags: ["physique", "fat_loss", "strength", "maintenance_strength"],
    phrases: [
      makePhrase("keep strength while cutting"),
      makePhrase("lose fat but not get weak", { allowLegacyMultiGoalCapture: true, tags: ["hybrid"] }),
      makePhrase("maintain strength while losing fat"),
    ],
  },
  {
    id: "busy_life_body_comp",
    templateId: "busy_life_body_comp",
    expectedFamily: "physique",
    expectedIntentId: "busy_life_body_comp",
    expectedArchetypeIds: ["fat_loss_busy_life"],
    profileIds: ["physique_busy", "consistency_busy", "limited_home"],
    tags: ["physique", "fat_loss", "busy"],
    phrases: [
      makePhrase("busy-life body composition"),
      makePhrase("I travel a lot and still want to lean out"),
      makePhrase("improve my body composition with short sessions"),
    ],
  },
  {
    id: "get_back_in_shape",
    templateId: "get_back_in_shape",
    expectedFamily: "general_fitness",
    expectedIntentId: "get_back_in_shape",
    expectedArchetypeIds: ["rebuild_after_time_off", "general_fitness_consistency"],
    profileIds: ["general_reset", "reentry_protected", "consistency_busy"],
    tags: ["general_fitness"],
    phrases: [
      makePhrase("get back in shape"),
      makePhrase("I used to work out and now I’m out of shape"),
      makePhrase("get back to where I was"),
    ],
  },
  {
    id: "build_consistency",
    templateId: "build_consistency",
    expectedFamily: "general_fitness",
    expectedIntentId: "build_consistency",
    expectedArchetypeIds: ["healthy_routine_busy", "general_fitness_consistency"],
    profileIds: ["consistency_busy", "general_reset", "limited_home"],
    tags: ["general_fitness", "consistency", "busy"],
    phrases: [
      makePhrase("build consistency"),
      makePhrase("I just need a healthy routine again"),
      makePhrase("make workouts something I can actually stick to"),
    ],
  },
  {
    id: "feel_more_athletic",
    templateId: "feel_more_athletic",
    expectedFamily: "general_fitness",
    expectedIntentId: "feel_more_athletic",
    expectedArchetypeIds: ["athleticism_work_capacity"],
    profileIds: ["general_reset", "strength_gym", "consistency_busy"],
    tags: ["general_fitness"],
    phrases: [
      makePhrase("feel more athletic"),
      makePhrase("move better and feel fitter"),
      makePhrase("improve my conditioning and athleticism"),
    ],
  },
  {
    id: "healthy_routine_fitness",
    templateId: "healthy_routine_fitness",
    expectedFamily: "general_fitness",
    expectedIntentId: "healthy_routine_fitness",
    expectedArchetypeIds: ["healthy_routine_busy"],
    profileIds: ["consistency_busy", "general_reset", "limited_home"],
    tags: ["general_fitness", "busy", "consistency"],
    phrases: [
      makePhrase("healthier routine fitness"),
      makePhrase("I want a simple healthy routine"),
      makePhrase("stay fit while busy and traveling"),
    ],
  },
  {
    id: "restart_safely",
    templateId: "restart_safely",
    expectedFamily: "re_entry",
    expectedIntentId: "restart_safely",
    expectedArchetypeIds: ["protected_restart_low_capacity"],
    profileIds: ["reentry_protected", "consistency_busy", "general_reset"],
    tags: ["re_entry", "protective"],
    phrases: [
      makePhrase("restart safely"),
      makePhrase("ease back into training safely"),
      makePhrase("follow a conservative protected return"),
    ],
  },
  {
    id: "rebuild_routine",
    templateId: "rebuild_routine",
    expectedFamily: "re_entry",
    expectedIntentId: "rebuild_routine",
    expectedArchetypeIds: ["rebuild_after_time_off"],
    profileIds: ["general_reset", "reentry_protected", "consistency_busy"],
    tags: ["re_entry"],
    phrases: [
      makePhrase("rebuild routine"),
      makePhrase("rebuild after time off"),
      makePhrase("start training again without pretending I’m where I used to be"),
    ],
  },
  {
    id: "low_impact_restart",
    templateId: "low_impact_restart",
    expectedFamily: "re_entry",
    expectedIntentId: "low_impact_restart",
    expectedArchetypeIds: ["low_impact_restart"],
    profileIds: ["reentry_low_impact", "reentry_protected", "consistency_busy"],
    tags: ["re_entry", "protective"],
    phrases: [
      makePhrase("low-impact restart"),
      makePhrase("start back with lower-impact training"),
      makePhrase("I need to rebuild with joint-friendly sessions"),
    ],
  },
  {
    id: "run_lift_running_priority",
    templateId: "run_and_lift",
    expectedFamily: "hybrid",
    expectedIntentId: "run_and_lift",
    expectedArchetypeIds: ["run_lift_running_priority"],
    profileIds: ["hybrid_running", "run_intermediate", "consistency_busy"],
    fieldOverrides: { hybrid_priority: field("running", "Running") },
    specificityDefaults: { hybrid_priority: "running" },
    tags: ["hybrid", "run_priority"],
    phrases: [
      makePhrase("run and lift"),
      makePhrase("I want to run and lift at the same time"),
      makePhrase("lift while training for a half marathon", { allowLegacyMultiGoalCapture: true, tags: ["hybrid"] }),
    ],
  },
  {
    id: "run_lift_strength_priority",
    templateId: "run_and_lift",
    expectedFamily: "hybrid",
    expectedIntentId: "run_and_lift",
    expectedArchetypeIds: ["run_lift_strength_priority"],
    profileIds: ["hybrid_strength", "strength_gym", "consistency_busy"],
    fieldOverrides: { hybrid_priority: field("strength", "Strength") },
    specificityDefaults: { hybrid_priority: "strength" },
    tags: ["hybrid", "strength_priority"],
    phrases: [
      makePhrase("run and lift with strength priority"),
      makePhrase("keep running but get stronger"),
      makePhrase("stronger first, but I still want a bit of running"),
    ],
  },
  {
    id: "stronger_and_fitter",
    templateId: "stronger_and_fitter",
    expectedFamily: "hybrid",
    expectedIntentId: "stronger_and_fitter",
    expectedArchetypeIds: ["strength_conditioning_balanced"],
    profileIds: ["hybrid_running", "hybrid_strength", "consistency_busy"],
    tags: ["hybrid"],
    phrases: [
      makePhrase("stronger and fitter"),
      makePhrase("strength and conditioning together"),
      makePhrase("get stronger and improve conditioning"),
    ],
  },
  {
    id: "aesthetic_plus_endurance",
    templateId: "aesthetic_plus_endurance",
    expectedFamily: "hybrid",
    expectedIntentId: "aesthetic_plus_endurance",
    expectedArchetypeIds: ["aesthetic_endurance_blend"],
    profileIds: ["physique_standard", "hybrid_running", "physique_busy"],
    tags: ["hybrid", "fat_loss", "leaner"],
    phrases: [
      makePhrase("aesthetic plus endurance"),
      makePhrase("look athletic and keep my endurance"),
      makePhrase("lose fat while preserving my running"),
    ],
  },
  {
    id: "sport_support",
    templateId: "sport_support",
    expectedFamily: "hybrid",
    expectedIntentId: "sport_support",
    expectedArchetypeIds: ["sport_support_field_court"],
    profileIds: ["sport_support", "strength_gym", "consistency_busy"],
    tags: ["hybrid"],
    phrases: [
      makePhrase("sport support"),
      makePhrase("get fit for soccer season"),
      makePhrase("train for tactical fitness"),
    ],
  },
];

const EDGE_CUSTOM_SEEDS = [
  {
    id: "ultramarathon_completion",
    templateId: "train_for_run_race",
    expectedFamily: "endurance",
    profileIds: ["run_intermediate"],
    shouldRequireCustom: true,
    flows: ["goal_switch"],
    tags: ["endurance"],
    phrases: [makePhrase("train for a 100 mile ultramarathon"), makePhrase("finish an ultramarathon")],
  },
  {
    id: "beer_mile",
    templateId: "train_for_run_race",
    expectedFamily: "endurance",
    profileIds: ["run_novice"],
    shouldRequireCustom: true,
    flows: ["goal_switch"],
    tags: ["endurance"],
    phrases: [makePhrase("train for a beer mile"), makePhrase("I want to win a beer mile")],
  },
  {
    id: "acl_rehab_return",
    templateId: "restart_safely",
    expectedFamily: "re_entry",
    profileIds: ["reentry_protected"],
    shouldRequireCustom: true,
    flows: ["goal_switch"],
    tags: ["re_entry"],
    phrases: [makePhrase("come back from ACL surgery rehab"), makePhrase("return to sport after ACL reconstruction")],
  },
  {
    id: "bodybuilding_plus_ironman",
    templateId: "run_and_lift",
    expectedFamily: "hybrid",
    profileIds: ["hybrid_running"],
    shouldRequireCustom: true,
    flows: ["goal_switch"],
    tags: ["hybrid"],
    phrases: [makePhrase("do a bodybuilding show and an Ironman this season"), makePhrase("prep for a physique show while training for a full Ironman")],
  },
];

const mergeProfile = ({ profileId = "", seed = {}, phrase = null } = {}) => {
  const baseProfile = clone(PROFILE_PRESETS[profileId] || {});
  const mergedFields = mergeFields(
    baseProfile.fields || {},
    seed.fieldOverrides || {},
    phrase?.fieldOverrides || {}
  );
  return {
    ...baseProfile,
    fields: mergedFields,
    tags: uniqueStrings([...(baseProfile.tags || []), ...(seed.profileTags || []), ...(phrase?.tags || [])]),
  };
};

const expandSeed = (seed = {}) => {
  const flows = seed.flows || ["structured_intake", "goal_switch"];
  return toArray(seed.profileIds).flatMap((profileId) => (
    toArray(seed.phrases).flatMap((phraseEntry, phraseIndex) => {
      const phrase = typeof phraseEntry === "string" ? makePhrase(phraseEntry) : phraseEntry;
      return flows.map((flow) => {
        const profile = mergeProfile({ profileId, seed, phrase });
        return {
          id: `${seed.id}_${profileId}_${flow}_${phraseIndex + 1}`,
          flow,
          templateId: seed.templateId,
          goalText: phrase.text,
          rawGoalText: phrase.text,
          profile,
          expectedFamily: seed.expectedFamily,
          expectedIntentId: seed.expectedIntentId || "",
          expectedArchetypeIds: clone(seed.expectedArchetypeIds || []),
          specificityDefaults: clone(seed.specificityDefaults || {}),
          allowLegacyMultiGoalCapture: Boolean(seed.allowLegacyMultiGoalCapture || phrase.allowLegacyMultiGoalCapture),
          shouldRequireCustom: Boolean(seed.shouldRequireCustom),
          tags: uniqueStrings([
            ...(seed.tags || []),
            ...(profile.tags || []),
            ...(phrase.tags || []),
          ]),
        };
      });
    })
  ));
};

const GOAL_BENCHMARK_CASES = [
  ...MAINSTREAM_SEEDS.flatMap((seed) => expandSeed(seed)),
  ...EDGE_CUSTOM_SEEDS.flatMap((seed) => expandSeed(seed)),
];

module.exports = {
  GOAL_BENCHMARK_CASES,
  MAINSTREAM_SEEDS,
  EDGE_CUSTOM_SEEDS,
};
