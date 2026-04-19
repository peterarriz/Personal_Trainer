const TOTAL_PERSONAS = 1000;
const TOTAL_SIMULATION_WEEKS = 260;

export const LAUNCH_SIMULATION_PERSONA_COUNT = TOTAL_PERSONAS;
export const LAUNCH_SIMULATION_WEEKS = TOTAL_SIMULATION_WEEKS;

export const LAUNCH_REVIEW_LENS_TARGET_COUNTS = Object.freeze({
  artistic_design_sensitive: 120,
  consistency_focused: 140,
  technical_data_heavy: 120,
  low_tech_literal: 120,
  feature_hungry: 140,
  skeptical_hostile: 100,
  accessibility_focused: 80,
  expert_athlete_coach: 80,
  busy_pragmatist: 100,
  privacy_sync_anxious: 100,
});

export const LAUNCH_DOMINANT_REVIEW_LENS_COUNTS = Object.freeze({
  artistic_design_sensitive: 109,
  consistency_focused: 127,
  technical_data_heavy: 109,
  low_tech_literal: 109,
  feature_hungry: 127,
  skeptical_hostile: 91,
  accessibility_focused: 73,
  expert_athlete_coach: 73,
  busy_pragmatist: 91,
  privacy_sync_anxious: 91,
});

const REVIEW_LENS_LABELS = Object.freeze({
  artistic_design_sensitive: "Artistic / design-sensitive",
  consistency_focused: "Consistency-focused",
  technical_data_heavy: "Technical / data-heavy",
  low_tech_literal: "Low-tech / literal",
  feature_hungry: "Expanded-feature hunter",
  skeptical_hostile: "Skeptical / hostile",
  accessibility_focused: "Accessibility-focused",
  expert_athlete_coach: "Expert athlete / coach",
  busy_pragmatist: "Busy pragmatist",
  privacy_sync_anxious: "Privacy / sync-anxious",
  emotionally_coachable: "Emotionally coachable",
});

export const LAUNCH_INTAKE_QUOTA_COUNTS = Object.freeze({
  edits_goal_before_confirm: 400,
  removes_and_replaces_goal: 250,
  custom_goal_entry: 200,
  vague_or_ambiguous_goal: 200,
  highly_specific_goal: 150,
  reprioritizes_goal_order: 150,
  conflicting_goals: 100,
  unrealistic_timeline: 100,
  changes_schedule_or_session_length: 100,
  equipment_or_location_contradiction: 100,
  typo_heavy_or_conversational: 75,
  asks_for_expanded_feature: 75,
  almost_abandons_then_recovers: 50,
  local_only_then_tests_sync: 50,
});

export const LAUNCH_FEATURE_CAPABILITIES = Object.freeze({
  wearable_sync_multi_device: { label: "Wearable sync", supported: "partial" },
  nutrition_quick_log: { label: "Nutrition quick log", supported: "supported" },
  coach_plan_preview: { label: "Coach plan preview", supported: "supported" },
  goal_history_and_export: { label: "Goal history / export", supported: "partial" },
  meal_photo_recognition: { label: "Meal photo recognition", supported: "unsupported" },
  exact_race_calculator: { label: "Exact race calculator", supported: "unsupported" },
  calendar_import: { label: "Calendar import", supported: "unsupported" },
  social_training_features: { label: "Social training features", supported: "unsupported" },
  persistent_coach_memory_controls: { label: "Coach memory controls", supported: "unsupported" },
  workout_demo_video_library: { label: "Workout demo video library", supported: "unsupported" },
  native_watch_app: { label: "Native watch app", supported: "unsupported" },
  meal_plan_templates: { label: "Meal plan templates", supported: "partial" },
});

const FIRST_NAMES = Object.freeze([
  "Ava", "Maya", "Lena", "Nina", "Sofia", "Elena", "Priya", "Jordan", "Chris", "Marcus",
  "Ryan", "Alicia", "Barbara", "Leo", "Jenna", "Nate", "Sam", "Taylor", "Morgan", "Casey",
  "Riley", "Harper", "Noah", "Liam", "Isla", "Camila", "Zoe", "Mila", "Ivy", "Aria",
  "Theo", "Owen", "Evan", "Avery", "Quinn", "Blake", "Micah", "Kira", "Talia", "Diego",
]);

const LAST_NAMES = Object.freeze([
  "Adams", "Bennett", "Carter", "Diaz", "Ellis", "Foster", "Garcia", "Hayes", "Irwin", "Johnson",
  "Kim", "Lopez", "Mitchell", "Nguyen", "Owens", "Patel", "Quincy", "Ramirez", "Singh", "Turner",
  "Usher", "Vasquez", "Walker", "Xu", "Young", "Zimmerman", "Brooks", "Coleman", "Davis", "Evans",
]);

const AGE_RANGES = Object.freeze([
  "18-24", "25-34", "35-44", "45-54", "55-64", "65-74",
]);

const PERSONALITY_TRAIT_PAIRS = Object.freeze([
  ["disciplined", "anxious"],
  ["curious", "skeptical"],
  ["hopeful", "literal"],
  ["busy", "pragmatic"],
  ["driven", "detail-oriented"],
  ["sensitive", "coachable"],
  ["independent", "guarded"],
  ["creative", "taste-driven"],
  ["analytical", "demanding"],
  ["resilient", "overreaching"],
]);

const GOAL_ARCHETYPES = Object.freeze([
  {
    id: "brand_new_beginner",
    category: "general_fitness",
    primaryGoal: "Build a repeatable beginner routine",
    specificGoal: "Train three days each week for the next 12 weeks without missing more than one week",
    vagueGoal: "Get healthier and stop feeling out of shape",
    unrealisticGoal: "Lose 40 pounds and get fit in six weeks",
    secondaryGoals: ["Lose body fat"],
    tertiaryGoals: ["Move with less stiffness"],
    scheduleReality: "Three short weekday sessions with limited routine memory",
    equipmentReality: "Apartment gym, treadmill, and a few dumbbells",
    equipmentAccess: "mixed",
    environmentMode: "Home",
    sessionLength: "30",
    preferredIntensity: "Conservative",
    trainingAgeYears: 0,
    bodyCompContext: "Deconditioned beginner with low confidence and high urgency",
    strengthContext: "Learning basic movement patterns",
    enduranceContext: "Walking only",
    injuryContext: "No formal injury, but knees and hips feel vulnerable",
    nutritionBehavior: "Weekdays are decent, weekends unravel",
    loggingBehavior: "Logs only if the path stays very simple",
    coachInteractionBehavior: "Needs reassurance and plain language",
    syncDeviceBehavior: "One phone, poor password habits, worried about losing progress",
    reviewLensAffinities: ["low_tech_literal", "busy_pragmatist", "emotionally_coachable"],
    featureExpectations: ["meal_plan_templates", "workout_demo_video_library"],
    likelyFailureModes: ["all-or-nothing dropout", "fear of soreness", "misreading a goal card"],
    cohortTags: ["brand_new_beginners", "deconditioned_beginners", "general_fitness", "no_equipment_users"],
    baselineMetrics: { bodyweight: 246, waist: 46, startingCapacity: "10_easy_minutes" },
  },
  {
    id: "obese_beginner_recovery",
    category: "body_comp",
    primaryGoal: "Lose fat safely while rebuilding basic capacity",
    specificGoal: "Lose 25 pounds over nine months while keeping knee pain under control",
    vagueGoal: "Lose weight without getting hurt again",
    unrealisticGoal: "Lose 60 pounds by midsummer",
    secondaryGoals: ["Walk without knee pain"],
    tertiaryGoals: ["Feel less embarrassed in the gym"],
    scheduleReality: "Three short sessions plus daily steps",
    equipmentReality: "Apartment gym, pool access, and rehab band work",
    equipmentAccess: "mixed",
    environmentMode: "Home",
    sessionLength: "30",
    preferredIntensity: "Conservative",
    trainingAgeYears: 0,
    bodyCompContext: "Morbid obesity history with high drop-off risk",
    strengthContext: "No lifting confidence",
    enduranceContext: "Walking and water work only",
    injuryContext: "Knee pain and low back fear",
    nutritionBehavior: "Emotional eating spikes during stress weeks",
    loggingBehavior: "Honest when supported, silent when ashamed",
    coachInteractionBehavior: "Very tone-sensitive and needs safe defaults",
    syncDeviceBehavior: "Single device, nervous about cloud and account flows",
    reviewLensAffinities: ["emotionally_coachable", "privacy_sync_anxious", "low_tech_literal"],
    featureExpectations: ["meal_plan_templates", "workout_demo_video_library"],
    likelyFailureModes: ["shame spiral after misses", "unsafe intensity jump", "confusion about progress"],
    cohortTags: ["obese_or_deconditioned_beginners", "fat_loss_body_recomp", "general_fitness"],
    baselineMetrics: { bodyweight: 294, waist: 54, startingCapacity: "8_easy_minutes" },
  },
  {
    id: "general_fitness_parent",
    category: "general_fitness",
    primaryGoal: "Stay generally fit with a chaotic family schedule",
    specificGoal: "Keep four training touchpoints each week while working around childcare",
    vagueGoal: "Feel like myself again",
    unrealisticGoal: "Get my old college body back in eight weeks",
    secondaryGoals: ["Have more energy for parenting"],
    tertiaryGoals: ["Keep back pain down"],
    scheduleReality: "Three reliable mornings and one unpredictable weekend window",
    equipmentReality: "Garage gym and stroller walks",
    equipmentAccess: "mixed",
    environmentMode: "Home",
    sessionLength: "30",
    preferredIntensity: "Standard",
    trainingAgeYears: 3,
    bodyCompContext: "Maintenance with some recomposition interest",
    strengthContext: "Former recreational lifter",
    enduranceContext: "Walks and occasional easy runs",
    injuryContext: "Back gets cranky during sleep-debt weeks",
    nutritionBehavior: "Grab-and-go with decent instincts",
    loggingBehavior: "Fast check-ins only",
    coachInteractionBehavior: "Wants concise help, not essays",
    syncDeviceBehavior: "Phone and laptop, expects state to match",
    reviewLensAffinities: ["busy_pragmatist", "consistency_focused"],
    featureExpectations: ["calendar_import", "wearable_sync_multi_device"],
    likelyFailureModes: ["plan feels too brittle for family life", "missed-session guilt"],
    cohortTags: ["general_fitness", "inconsistent_schedules", "home_gym_users"],
    baselineMetrics: { bodyweight: 188 },
  },
  {
    id: "fat_loss_recomp_professional",
    category: "body_comp",
    primaryGoal: "Lose fat while keeping visible strength progress",
    specificGoal: "Drop 12 pounds and keep bench numbers moving over 16 weeks",
    vagueGoal: "Look leaner but still athletic",
    unrealisticGoal: "Get shredded in one month without changing my life",
    secondaryGoals: ["Keep strength in the plan"],
    tertiaryGoals: ["Improve weekday energy"],
    scheduleReality: "Four early sessions, heavy work travel every six weeks",
    equipmentReality: "Commercial gym plus hotel gyms",
    equipmentAccess: "full_gym",
    environmentMode: "Gym",
    sessionLength: "45",
    preferredIntensity: "Standard",
    trainingAgeYears: 4,
    bodyCompContext: "Appearance-first with moderate data tolerance",
    strengthContext: "Comfortable with barbells and machines",
    enduranceContext: "Conditioning tolerated when dose is clear",
    injuryContext: "No major injury, moderate fatigue sensitivity",
    nutritionBehavior: "Good weekdays, looser dinners and travel weeks",
    loggingBehavior: "Logs if it feels fast",
    coachInteractionBehavior: "Wants useful tweaks, not motivational fluff",
    syncDeviceBehavior: "Phone, laptop, and occasional tablet use",
    reviewLensAffinities: ["busy_pragmatist", "artistic_design_sensitive", "consistency_focused"],
    featureExpectations: ["meal_photo_recognition", "calendar_import", "nutrition_quick_log"],
    likelyFailureModes: ["weekend drift", "trust break if strength vanishes during a cut"],
    cohortTags: ["fat_loss_body_recomp", "travel_heavy_users", "full_gym_users"],
    baselineMetrics: { bodyweight: 164, waist: 31, lift: { exercise: "Bench Press", weight: 145, reps: 5 } },
  },
  {
    id: "strength_general",
    category: "strength",
    primaryGoal: "Get stronger at the main lifts",
    specificGoal: "Add 20 pounds to squat and 10 pounds to bench over 20 weeks",
    vagueGoal: "Get stronger and more capable",
    unrealisticGoal: "Add 100 pounds to every lift by summer",
    secondaryGoals: ["Keep conditioning in a support lane"],
    tertiaryGoals: ["Stay consistent through work stress"],
    scheduleReality: "Four sessions per week with decent consistency",
    equipmentReality: "Full gym or strong garage-gym access",
    equipmentAccess: "full_gym",
    environmentMode: "Gym",
    sessionLength: "45",
    preferredIntensity: "Standard",
    trainingAgeYears: 5,
    bodyCompContext: "Performance-first with mild body-comp concern",
    strengthContext: "Intermediate lifter",
    enduranceContext: "Low conditioning interest",
    injuryContext: "Shoulders complain when pressing volume jumps too fast",
    nutritionBehavior: "Adequate calories, inconsistent protein timing",
    loggingBehavior: "Consistent for main lifts, weaker on accessories",
    coachInteractionBehavior: "Likes straightforward load advice",
    syncDeviceBehavior: "Expected on phone and laptop, wants export sanity",
    reviewLensAffinities: ["technical_data_heavy", "consistency_focused", "expert_athlete_coach"],
    featureExpectations: ["goal_history_and_export", "wearable_sync_multi_device"],
    likelyFailureModes: ["ego jumps", "conditioning leaked into a strength-first plan"],
    cohortTags: ["strength_focused", "full_gym_users", "high_training_age"],
    baselineMetrics: { bodyweight: 191, lift: { exercise: "Back Squat", weight: 295, reps: 5 } },
  },
  {
    id: "hypertrophy_bodybuilding",
    category: "hypertrophy",
    primaryGoal: "Add muscle in a way that feels like a real bodybuilding split",
    specificGoal: "Add visible size to shoulders, chest, and back over 24 weeks",
    vagueGoal: "Look more muscular",
    unrealisticGoal: "Gain 15 pounds of muscle in eight weeks",
    secondaryGoals: ["Stay reasonably lean"],
    tertiaryGoals: ["Keep pumps and exercise selection interesting"],
    scheduleReality: "Five sessions per week and high adherence when the plan looks premium",
    equipmentReality: "Full gym with machines",
    equipmentAccess: "full_gym",
    environmentMode: "Gym",
    sessionLength: "60+",
    preferredIntensity: "Aggressive",
    trainingAgeYears: 6,
    bodyCompContext: "Physique-first",
    strengthContext: "Advanced machine and hypertrophy work",
    enduranceContext: "Minimal conditioning interest",
    injuryContext: "Elbows flare with too much pressing density",
    nutritionBehavior: "Strong weekday compliance, treat meals on weekends",
    loggingBehavior: "Detailed on main accessories and bodyweight",
    coachInteractionBehavior: "Wants concise, premium-feeling guidance",
    syncDeviceBehavior: "Phone and laptop, expects visual polish everywhere",
    reviewLensAffinities: ["artistic_design_sensitive", "feature_hungry", "consistency_focused"],
    featureExpectations: ["workout_demo_video_library", "meal_photo_recognition", "social_training_features"],
    likelyFailureModes: ["plan looks generic", "copy sounds clinical instead of premium"],
    cohortTags: ["hypertrophy_bodybuilding", "full_gym_users"],
    baselineMetrics: { bodyweight: 176, waist: 32 },
  },
  {
    id: "powerlifting_meet",
    category: "powerlifting",
    primaryGoal: "Peak for a powerlifting-style meet",
    specificGoal: "Hit a 1,350 total at the end of this meet block",
    vagueGoal: "Peak my strength properly",
    unrealisticGoal: "Add 150 pounds to my total in twelve weeks",
    secondaryGoals: ["Keep weight class stable"],
    tertiaryGoals: ["Trust the taper"],
    scheduleReality: "Four to five sessions per week with high specificity",
    equipmentReality: "Barbell-centric powerlifting gym",
    equipmentAccess: "full_gym",
    environmentMode: "Gym",
    sessionLength: "60+",
    preferredIntensity: "Aggressive",
    trainingAgeYears: 8,
    bodyCompContext: "Performance and weight-class management",
    strengthContext: "Advanced powerlifting specificity",
    enduranceContext: "No cardio unless it clearly supports recovery",
    injuryContext: "Hip and adductor management is always in play",
    nutritionBehavior: "Very intentional around bodyweight and training days",
    loggingBehavior: "High detail and expects deterministic history",
    coachInteractionBehavior: "Low tolerance for hand-wavy progression",
    syncDeviceBehavior: "Wants exports, history, and exact diffs",
    reviewLensAffinities: ["expert_athlete_coach", "technical_data_heavy", "skeptical_hostile"],
    featureExpectations: ["goal_history_and_export", "calendar_import"],
    likelyFailureModes: ["taper feels fake", "non-lifting conditioning leaks into the peak"],
    cohortTags: ["powerlifting_style", "high_training_age", "elite_edge_cases"],
    baselineMetrics: {
      bodyweight: 205,
      lift: { exercise: "Competition Back Squat", weight: 405, reps: 3 },
    },
  },
  {
    id: "first_5k_runner",
    category: "running",
    primaryGoal: "Run a first 5K without blowing up",
    specificGoal: "Finish a first 5K in three months",
    vagueGoal: "Become someone who can run",
    unrealisticGoal: "Go from zero to a 22-minute 5K in six weeks",
    secondaryGoals: ["Stay pain-free"],
    tertiaryGoals: ["Build confidence with structured sessions"],
    scheduleReality: "Three runs and one optional strength touch each week",
    equipmentReality: "Shoes, sidewalk, and bodyweight access",
    equipmentAccess: "minimal",
    environmentMode: "Outdoor",
    sessionLength: "30",
    preferredIntensity: "Conservative",
    trainingAgeYears: 0,
    bodyCompContext: "Weight loss is a side effect, not the main ask",
    strengthContext: "Little structured lifting",
    enduranceContext: "Run-walk base only",
    injuryContext: "Shin and calf fear, no diagnosed injury",
    nutritionBehavior: "Does not want a complex nutrition system",
    loggingBehavior: "Will quick-log if it's obvious",
    coachInteractionBehavior: "Needs encouragement and simple rationale",
    syncDeviceBehavior: "Phone-first, may check laptop at work",
    reviewLensAffinities: ["emotionally_coachable", "low_tech_literal", "busy_pragmatist"],
    featureExpectations: ["native_watch_app", "exact_race_calculator"],
    likelyFailureModes: ["too much intensity too soon", "run copy feels jargony"],
    cohortTags: ["runners", "brand_new_beginners"],
    baselineMetrics: { bodyweight: 173, startingCapacity: "run_walk_20" },
  },
  {
    id: "half_marathon_runner",
    category: "running",
    primaryGoal: "Run a faster half marathon",
    specificGoal: "Run a 1:45 half marathon this season",
    vagueGoal: "Get better at distance running",
    unrealisticGoal: "Drop fifteen minutes off my half in eight weeks",
    secondaryGoals: ["Keep strength in twice per week"],
    tertiaryGoals: ["Fuel long runs better"],
    scheduleReality: "Five running touches and two strength touches most weeks",
    equipmentReality: "Road running and full gym access",
    equipmentAccess: "full_gym",
    environmentMode: "Outdoor",
    sessionLength: "45",
    preferredIntensity: "Standard",
    trainingAgeYears: 4,
    bodyCompContext: "Performance-first with mild lean-out interest",
    strengthContext: "Support-lift comfort only",
    enduranceContext: "Experienced recreational runner",
    injuryContext: "Achilles gets grumpy under speed spikes",
    nutritionBehavior: "Okay day to day, weak on long-run fuel planning",
    loggingBehavior: "Logs key sessions, not always easy days",
    coachInteractionBehavior: "Wants concise adjustments and race-specific trust",
    syncDeviceBehavior: "Phone plus watch expectations",
    reviewLensAffinities: ["consistency_focused", "technical_data_heavy", "busy_pragmatist"],
    featureExpectations: ["exact_race_calculator", "wearable_sync_multi_device", "calendar_import"],
    likelyFailureModes: ["strength disappears from supporting plan", "roadmap feels provisional"],
    cohortTags: ["runners", "half_marathon", "high_training_age"],
    baselineMetrics: { bodyweight: 158, pace: "8:20/mi", longestRun: "10 mi" },
  },
  {
    id: "marathon_runner",
    category: "running",
    primaryGoal: "Build toward a credible marathon",
    specificGoal: "Run a sub-4-hour marathon this fall",
    vagueGoal: "Train seriously for my marathon",
    unrealisticGoal: "Go sub-3 from a casual base in one block",
    secondaryGoals: ["Keep injury risk low"],
    tertiaryGoals: ["Build trust in long-run progression"],
    scheduleReality: "Five runs plus mobility or strength support",
    equipmentReality: "Road, treadmill, and occasional gym",
    equipmentAccess: "mixed",
    environmentMode: "Outdoor",
    sessionLength: "60+",
    preferredIntensity: "Standard",
    trainingAgeYears: 5,
    bodyCompContext: "Performance-first",
    strengthContext: "Support work only",
    enduranceContext: "Experienced endurance user",
    injuryContext: "Calves and feet flare if volume ramps too fast",
    nutritionBehavior: "Interested in fueling, not meal policing",
    loggingBehavior: "Logs key workouts and long runs reliably",
    coachInteractionBehavior: "Skeptical until the marathon logic looks real",
    syncDeviceBehavior: "Wants cloud trust, long history, and phone/laptop parity",
    reviewLensAffinities: ["consistency_focused", "skeptical_hostile", "technical_data_heavy"],
    featureExpectations: ["exact_race_calculator", "wearable_sync_multi_device"],
    likelyFailureModes: ["long-run progression nonsense", "current week hides future build"],
    cohortTags: ["runners", "marathon", "high_training_age"],
    baselineMetrics: { bodyweight: 166, pace: "8:50/mi", longestRun: "12 mi" },
  },
  {
    id: "return_to_running",
    category: "running",
    primaryGoal: "Return to running safely after a layoff",
    specificGoal: "Rebuild to four pain-free runs each week over 16 weeks",
    vagueGoal: "Run again without setting myself back",
    unrealisticGoal: "Jump right back to pre-injury mileage in a month",
    secondaryGoals: ["Keep lower-body strength"],
    tertiaryGoals: ["Reduce fear around pain signals"],
    scheduleReality: "Three to four sessions, heavily adaptation-sensitive",
    equipmentReality: "Road, treadmill, basic home strength setup",
    equipmentAccess: "mixed",
    environmentMode: "Home",
    sessionLength: "30",
    preferredIntensity: "Conservative",
    trainingAgeYears: 6,
    bodyCompContext: "Performance secondary to safe return",
    strengthContext: "Knows basics, cautious under fatigue",
    enduranceContext: "Former runner rebuilding",
    injuryContext: "Post-PT or recurrent Achilles / knee concern",
    nutritionBehavior: "Reasonable, not detail-oriented",
    loggingBehavior: "Will log pain if asked clearly",
    coachInteractionBehavior: "Needs careful substitutions and escalation boundaries",
    syncDeviceBehavior: "Mostly phone, wants plan safety to survive refreshes",
    reviewLensAffinities: ["privacy_sync_anxious", "emotionally_coachable", "skeptical_hostile"],
    featureExpectations: ["wearable_sync_multi_device", "persistent_coach_memory_controls"],
    likelyFailureModes: ["unsafe return progression", "medical overreach perception"],
    cohortTags: ["return_to_running", "injured_or_pain_sensitive_users"],
    baselineMetrics: { bodyweight: 171, startingCapacity: "run_walk_25" },
  },
  {
    id: "speed_goal_runner",
    category: "running",
    primaryGoal: "Get faster over the 5K or 10K",
    specificGoal: "Run a 21-minute 5K within this cycle",
    vagueGoal: "Get quicker again",
    unrealisticGoal: "PR every distance at once in one block",
    secondaryGoals: ["Keep strength support visible"],
    tertiaryGoals: ["Understand what is building"],
    scheduleReality: "Five run days and two support sessions",
    equipmentReality: "Track, road, gym",
    equipmentAccess: "full_gym",
    environmentMode: "Outdoor",
    sessionLength: "45",
    preferredIntensity: "Standard",
    trainingAgeYears: 5,
    bodyCompContext: "Performance-first",
    strengthContext: "Comfortable with support lifting",
    enduranceContext: "Experienced sub-elite recreational runner",
    injuryContext: "Hamstrings and calves are rate limiters",
    nutritionBehavior: "Not interested in body-comp noise",
    loggingBehavior: "Moderately detailed",
    coachInteractionBehavior: "Notices if workout taxonomy gets sloppy",
    syncDeviceBehavior: "Watch sync expectations are high",
    reviewLensAffinities: ["expert_athlete_coach", "consistency_focused", "technical_data_heavy"],
    featureExpectations: ["exact_race_calculator", "wearable_sync_multi_device"],
    likelyFailureModes: ["speed work mislabeled", "strength support hidden"],
    cohortTags: ["runners", "speed_goals", "high_training_age"],
    baselineMetrics: { pace: "6:58/mi", longestRun: "8 mi" },
  },
  {
    id: "recreational_swimmer",
    category: "swimming",
    primaryGoal: "Swim a faster mile",
    specificGoal: "Swim a sub-30-minute mile by the end of summer",
    vagueGoal: "Get better in the pool",
    unrealisticGoal: "Drop ten minutes off my mile in six weeks",
    secondaryGoals: ["Keep basic strength twice per week"],
    tertiaryGoals: ["Make sets feel less random"],
    scheduleReality: "Three pool sessions and one dryland day",
    equipmentReality: "Pool access and light dryland tools",
    equipmentAccess: "mixed",
    environmentMode: "Pool",
    sessionLength: "45",
    preferredIntensity: "Standard",
    trainingAgeYears: 3,
    bodyCompContext: "Neutral",
    strengthContext: "Dryland support only",
    enduranceContext: "Pool base but limited benchmarks",
    injuryContext: "Shoulders get irritated if volume is clumsy",
    nutritionBehavior: "Barely thinks about fueling",
    loggingBehavior: "Will log if swim terms make sense",
    coachInteractionBehavior: "Suspicious of run-centric defaults",
    syncDeviceBehavior: "Phone and laptop, expects swim credibility",
    reviewLensAffinities: ["consistency_focused", "skeptical_hostile", "expert_athlete_coach"],
    featureExpectations: ["wearable_sync_multi_device", "workout_demo_video_library"],
    likelyFailureModes: ["swim gets mapped to running logic", "anchors feel unsupported"],
    cohortTags: ["swimmers", "technique_focused_swimmers"],
    baselineMetrics: { recentSwimAnchor: "1000 yd in 22:30" },
  },
  {
    id: "masters_swimmer",
    category: "swimming",
    primaryGoal: "Peak toward a masters swim meet",
    specificGoal: "Drop time across 100 and 200 free for masters competition",
    vagueGoal: "Get sharper in the water",
    unrealisticGoal: "Swim collegiate-level times by next month",
    secondaryGoals: ["Keep shoulders resilient"],
    tertiaryGoals: ["Preserve some lifting"],
    scheduleReality: "Four pool sessions and two lift touches",
    equipmentReality: "Masters pool schedule and full gym",
    equipmentAccess: "full_gym",
    environmentMode: "Pool",
    sessionLength: "60+",
    preferredIntensity: "Aggressive",
    trainingAgeYears: 9,
    bodyCompContext: "Performance-first",
    strengthContext: "Supportive power work",
    enduranceContext: "Experienced swim training age",
    injuryContext: "Shoulders and neck need smart load variation",
    nutritionBehavior: "Performance-focused but low patience for fluffy nutrition copy",
    loggingBehavior: "Wants meaningful set detail available",
    coachInteractionBehavior: "Expert and skeptical",
    syncDeviceBehavior: "High expectations for data integrity and exports",
    reviewLensAffinities: ["expert_athlete_coach", "technical_data_heavy", "skeptical_hostile"],
    featureExpectations: ["goal_history_and_export", "wearable_sync_multi_device"],
    likelyFailureModes: ["swim taxonomy too shallow", "lack of meet-specific credibility"],
    cohortTags: ["swimmers", "masters_swimmers", "high_training_age"],
    baselineMetrics: { recentSwimAnchor: "1650 yd in 31:10" },
  },
  {
    id: "open_water_swimmer",
    category: "swimming",
    primaryGoal: "Prepare for open-water swim confidence and endurance",
    specificGoal: "Handle a confident open-water mile this season",
    vagueGoal: "Feel less panicked in open water",
    unrealisticGoal: "Go from pool-only to a 10K swim immediately",
    secondaryGoals: ["Maintain general strength"],
    tertiaryGoals: ["Keep open-water fear from taking over"],
    scheduleReality: "Two pool sessions, one open-water session when weather allows",
    equipmentReality: "Pool plus occasional lake access",
    equipmentAccess: "mixed",
    environmentMode: "Pool",
    sessionLength: "45",
    preferredIntensity: "Conservative",
    trainingAgeYears: 2,
    bodyCompContext: "Neutral",
    strengthContext: "General support work",
    enduranceContext: "Pool technique ahead of open-water confidence",
    injuryContext: "No major injury, high fear response",
    nutritionBehavior: "Simple and practical",
    loggingBehavior: "Short notes, not detailed metrics",
    coachInteractionBehavior: "Needs calm confidence, not hype",
    syncDeviceBehavior: "Phone-first",
    reviewLensAffinities: ["emotionally_coachable", "accessibility_focused", "low_tech_literal"],
    featureExpectations: ["wearable_sync_multi_device", "workout_demo_video_library"],
    likelyFailureModes: ["open-water confidence not reflected", "too much jargon"],
    cohortTags: ["swimmers", "open_water_swimmers"],
    baselineMetrics: { recentSwimAnchor: "1500 yd in 33:00" },
  },
  {
    id: "cycling_peloton",
    category: "cycling",
    primaryGoal: "Build better cycling fitness without overthinking the stack",
    specificGoal: "Raise cycling durability and threshold over 20 weeks",
    vagueGoal: "Get fitter on the bike",
    unrealisticGoal: "Ride like a Cat 2 from casual Peloton work in a month",
    secondaryGoals: ["Keep some strength support"],
    tertiaryGoals: ["Use workouts that fit workdays"],
    scheduleReality: "Four bike sessions, one strength touch",
    equipmentReality: "Bike trainer, Peloton, or spin setup at home",
    equipmentAccess: "mixed",
    environmentMode: "Home",
    sessionLength: "45",
    preferredIntensity: "Standard",
    trainingAgeYears: 3,
    bodyCompContext: "Neutral to recomp",
    strengthContext: "Support work only",
    enduranceContext: "Cycling-first",
    injuryContext: "Low back and hip stiffness from desk work",
    nutritionBehavior: "Needs practical fueling help, not bodybuilding copy",
    loggingBehavior: "Quick logs mostly",
    coachInteractionBehavior: "Wants bike-specific credibility and simple rationale",
    syncDeviceBehavior: "Device integration expectations are high",
    reviewLensAffinities: ["feature_hungry", "technical_data_heavy", "busy_pragmatist"],
    featureExpectations: ["wearable_sync_multi_device", "calendar_import", "native_watch_app"],
    likelyFailureModes: ["bike taxonomy too generic", "too much run-first language"],
    cohortTags: ["cyclists_or_peloton_users", "home_gym_users"],
    baselineMetrics: { bodyweight: 179 },
  },
  {
    id: "hybrid_athlete",
    category: "hybrid",
    primaryGoal: "Build a believable hybrid plan that respects the real priority",
    specificGoal: "Run a 1:50 half while bringing bench to 225 this year",
    vagueGoal: "Get strong and fit at the same time",
    unrealisticGoal: "PR every lift and race in one short block",
    secondaryGoals: ["Keep body composition stable"],
    tertiaryGoals: ["Understand what is primary and what is support"],
    scheduleReality: "Five to six sessions mixing run and lift days",
    equipmentReality: "Full gym plus road running access",
    equipmentAccess: "full_gym",
    environmentMode: "Gym",
    sessionLength: "45",
    preferredIntensity: "Standard",
    trainingAgeYears: 5,
    bodyCompContext: "Performance-first",
    strengthContext: "Intermediate lifter",
    enduranceContext: "Intermediate runner",
    injuryContext: "Hamstring and shoulder management matter",
    nutritionBehavior: "Needs day-type fueling to match training demand",
    loggingBehavior: "Quick logs on easy days, detail on key sessions",
    coachInteractionBehavior: "Notices if the app defaults to the wrong domain",
    syncDeviceBehavior: "Wants every tab to tell the same story",
    reviewLensAffinities: ["consistency_focused", "technical_data_heavy", "busy_pragmatist"],
    featureExpectations: ["calendar_import", "wearable_sync_multi_device", "goal_history_and_export"],
    likelyFailureModes: ["run plan takes over when strength is primary", "secondary goal hidden"],
    cohortTags: ["hybrid_athletes", "strength_focused", "runners"],
    baselineMetrics: { bodyweight: 186, lift: { exercise: "Bench Press", weight: 205, reps: 3 }, pace: "8:15/mi" },
  },
  {
    id: "team_sport_soccer",
    category: "team_sport",
    primaryGoal: "Stay fit and resilient for soccer or court sport play",
    specificGoal: "Be ready for weekly league play without late-game drop-off",
    vagueGoal: "Play better and stop feeling gassed",
    unrealisticGoal: "Train like a pro academy schedule instantly",
    secondaryGoals: ["Keep hamstrings and ankles safe"],
    tertiaryGoals: ["Fit training around game nights"],
    scheduleReality: "Two focused sessions, one game, one optional conditioning day",
    equipmentReality: "Gym plus field or court access",
    equipmentAccess: "mixed",
    environmentMode: "Outdoor",
    sessionLength: "45",
    preferredIntensity: "Standard",
    trainingAgeYears: 4,
    bodyCompContext: "Performance-first",
    strengthContext: "Athletic support lifting",
    enduranceContext: "Field-sport conditioning",
    injuryContext: "Ankle and hamstring sensitivity",
    nutritionBehavior: "Practical, game-day focused",
    loggingBehavior: "Will log if the form respects sport reality",
    coachInteractionBehavior: "Wants sport-specific clarity",
    syncDeviceBehavior: "Phone-first, expects consistency",
    reviewLensAffinities: ["feature_hungry", "consistency_focused", "busy_pragmatist"],
    featureExpectations: ["calendar_import", "wearable_sync_multi_device"],
    likelyFailureModes: ["sport taxonomy mismatch", "generic running templates"],
    cohortTags: ["team_or_court_sport_athletes"],
    baselineMetrics: { bodyweight: 177 },
  },
  {
    id: "tactical_firefighter",
    category: "tactical",
    primaryGoal: "Train for tactical job demands without sloppy mixed-domain programming",
    specificGoal: "Be ready for firefighter physical demands over the next six months",
    vagueGoal: "Get ready for the job",
    unrealisticGoal: "Pass every tactical test with no build-up",
    secondaryGoals: ["Stay strong and durable"],
    tertiaryGoals: ["Fit shift-life recovery limits"],
    scheduleReality: "Rotating schedule with compressed recovery windows",
    equipmentReality: "Station equipment, bodyweight, full gym when available",
    equipmentAccess: "mixed",
    environmentMode: "Mixed",
    sessionLength: "45",
    preferredIntensity: "Standard",
    trainingAgeYears: 4,
    bodyCompContext: "Performance and work readiness",
    strengthContext: "Functional strength base",
    enduranceContext: "Mixed durability and work-capacity needs",
    injuryContext: "Back and shoulder load matter",
    nutritionBehavior: "Shift-work friction and sleep debt complicate fueling",
    loggingBehavior: "Needs fast mobile flow",
    coachInteractionBehavior: "Wants practical readiness logic, not aesthetic fluff",
    syncDeviceBehavior: "Expects recovery after bad connectivity",
    reviewLensAffinities: ["busy_pragmatist", "privacy_sync_anxious", "skeptical_hostile"],
    featureExpectations: ["calendar_import", "wearable_sync_multi_device"],
    likelyFailureModes: ["mixed-domain nonsense", "shift-work reality ignored"],
    cohortTags: ["tactical_or_occupational_users", "shift_workers", "inconsistent_schedules"],
    baselineMetrics: { bodyweight: 198 },
  },
  {
    id: "nurse_shift_worker",
    category: "occupational",
    primaryGoal: "Keep a sane training rhythm around rotating shifts",
    specificGoal: "Train three times each week without crashing during shift blocks",
    vagueGoal: "Stay healthy through shift work",
    unrealisticGoal: "Train hard every day regardless of schedule",
    secondaryGoals: ["Improve sleep and recovery consistency"],
    tertiaryGoals: ["Avoid guilt when weeks get messy"],
    scheduleReality: "Night shifts, rotating blocks, and missed meal timing",
    equipmentReality: "Home dumbbells, hospital gym, and neighborhood walks",
    equipmentAccess: "mixed",
    environmentMode: "Home",
    sessionLength: "30",
    preferredIntensity: "Conservative",
    trainingAgeYears: 2,
    bodyCompContext: "General health first",
    strengthContext: "Beginner to intermediate",
    enduranceContext: "Walking and occasional treadmill",
    injuryContext: "Sleep debt and plantar foot soreness",
    nutritionBehavior: "Shift-work snacking and convenience meals",
    loggingBehavior: "Needs sub-60-second logging",
    coachInteractionBehavior: "Needs empathy and practical simplification",
    syncDeviceBehavior: "Phone-only, worried about losing data between bad signal zones",
    reviewLensAffinities: ["busy_pragmatist", "privacy_sync_anxious", "emotionally_coachable"],
    featureExpectations: ["calendar_import", "meal_photo_recognition"],
    likelyFailureModes: ["plan too rigid for shifts", "logging takes too long"],
    cohortTags: ["shift_workers", "older_adults_longevity_users", "inconsistent_schedules"],
    baselineMetrics: { bodyweight: 171 },
  },
  {
    id: "older_longevity",
    category: "longevity",
    primaryGoal: "Train for strength, balance, and longevity",
    specificGoal: "Keep strength and aerobic health moving over the next year",
    vagueGoal: "Age better and stay independent",
    unrealisticGoal: "Undo decades of detraining immediately",
    secondaryGoals: ["Improve bone and balance confidence"],
    tertiaryGoals: ["Keep soreness low enough to stay consistent"],
    scheduleReality: "Three short sessions and daily walking",
    equipmentReality: "Home dumbbells, bands, and local gym access",
    equipmentAccess: "mixed",
    environmentMode: "Home",
    sessionLength: "30",
    preferredIntensity: "Conservative",
    trainingAgeYears: 1,
    bodyCompContext: "Health-span first",
    strengthContext: "Light-to-moderate resistance",
    enduranceContext: "Walking and low-intensity aerobic base",
    injuryContext: "Hip stiffness and caution with impact",
    nutritionBehavior: "Consistent, low drama",
    loggingBehavior: "Will use it if text stays small and clear",
    coachInteractionBehavior: "Needs calm, respectful explanation",
    syncDeviceBehavior: "Laptop and phone, low tolerance for confusing settings",
    reviewLensAffinities: ["accessibility_focused", "low_tech_literal", "artistic_design_sensitive"],
    featureExpectations: ["workout_demo_video_library", "goal_history_and_export"],
    likelyFailureModes: ["text density too high", "tap targets too small"],
    cohortTags: ["older_adults_longevity_users", "general_fitness"],
    baselineMetrics: { bodyweight: 169 },
  },
  {
    id: "travel_heavy_consultant",
    category: "travel",
    primaryGoal: "Keep training coherent while living on the road",
    specificGoal: "Maintain strength and conditioning through a heavy travel season",
    vagueGoal: "Stay in shape while traveling",
    unrealisticGoal: "Make perfect progress with zero routine",
    secondaryGoals: ["Keep nutrition practical on travel days"],
    tertiaryGoals: ["Trust cross-device state"],
    scheduleReality: "Hotel weeks, airport days, and erratic session windows",
    equipmentReality: "Hotel gyms, bands, and bodyweight only half the time",
    equipmentAccess: "minimal",
    environmentMode: "Travel",
    sessionLength: "30",
    preferredIntensity: "Standard",
    trainingAgeYears: 4,
    bodyCompContext: "Maintenance or recomp",
    strengthContext: "Intermediate but resource-constrained",
    enduranceContext: "Walking, treadmills, and occasional spin bikes",
    injuryContext: "Travel stiffness and sleep disruption",
    nutritionBehavior: "Restaurant-heavy and convenience-based",
    loggingBehavior: "Needs obvious quick save flows",
    coachInteractionBehavior: "Wants realistic swaps and no drama",
    syncDeviceBehavior: "Phone and laptop, very sensitive to stale cloud state",
    reviewLensAffinities: ["privacy_sync_anxious", "busy_pragmatist", "technical_data_heavy"],
    featureExpectations: ["calendar_import", "wearable_sync_multi_device", "meal_photo_recognition"],
    likelyFailureModes: ["travel taxonomy not reflected", "cross-device mismatch breaks trust"],
    cohortTags: ["travel_heavy_users", "inconsistent_schedules", "minimal_equipment_users"],
    baselineMetrics: { bodyweight: 184 },
  },
  {
    id: "home_gym_strength",
    category: "strength",
    primaryGoal: "Get stronger at home without gym leakage in the programming",
    specificGoal: "Push bench and squat up with a garage-gym setup",
    vagueGoal: "Get stronger at home",
    unrealisticGoal: "Peak like a powerlifting gym with no constraints",
    secondaryGoals: ["Keep a little conditioning"],
    tertiaryGoals: ["Avoid equipment mismatch suggestions"],
    scheduleReality: "Four early-morning sessions",
    equipmentReality: "Garage gym with rack, bench, barbell, and limited accessories",
    equipmentAccess: "mixed",
    environmentMode: "Home",
    sessionLength: "45",
    preferredIntensity: "Standard",
    trainingAgeYears: 7,
    bodyCompContext: "Strength-first",
    strengthContext: "Experienced home lifter",
    enduranceContext: "Minimal",
    injuryContext: "Elbows and low back when fatigue piles up",
    nutritionBehavior: "Solid, not obsessive",
    loggingBehavior: "Consistent",
    coachInteractionBehavior: "Wants equipment realism and low nonsense",
    syncDeviceBehavior: "Laptop during planning, phone during training",
    reviewLensAffinities: ["technical_data_heavy", "consistency_focused", "expert_athlete_coach"],
    featureExpectations: ["goal_history_and_export", "workout_demo_video_library"],
    likelyFailureModes: ["gym-only accessories appear", "support work missing context"],
    cohortTags: ["home_gym_users", "strength_focused"],
    baselineMetrics: { bodyweight: 201, lift: { exercise: "Bench Press", weight: 225, reps: 3 } },
  },
  {
    id: "no_equipment_minimalist",
    category: "minimal_equipment",
    primaryGoal: "Stay fit with bodyweight and minimal equipment",
    specificGoal: "Build a repeatable no-equipment routine that still feels progressive",
    vagueGoal: "Stay fit anywhere",
    unrealisticGoal: "Get elite physique results with zero equipment instantly",
    secondaryGoals: ["Keep sessions short"],
    tertiaryGoals: ["Avoid the app asking for unavailable gear"],
    scheduleReality: "Four short sessions with inconsistent timing",
    equipmentReality: "Bands, floor space, and stairs",
    equipmentAccess: "minimal",
    environmentMode: "Home",
    sessionLength: "20",
    preferredIntensity: "Conservative",
    trainingAgeYears: 1,
    bodyCompContext: "General fitness or lean-out interest",
    strengthContext: "Beginner",
    enduranceContext: "Walking, stairs, and short circuits",
    injuryContext: "None diagnosed, low tolerance for complexity",
    nutritionBehavior: "Basic and inconsistent",
    loggingBehavior: "Needs one-button completion",
    coachInteractionBehavior: "Wants practical swaps that actually fit",
    syncDeviceBehavior: "Single phone user",
    reviewLensAffinities: ["busy_pragmatist", "low_tech_literal", "feature_hungry"],
    featureExpectations: ["workout_demo_video_library", "native_watch_app"],
    likelyFailureModes: ["equipment mismatch", "too many required fields"],
    cohortTags: ["no_equipment_users", "general_fitness"],
    baselineMetrics: { bodyweight: 176 },
  },
  {
    id: "elite_edge_case",
    category: "elite",
    primaryGoal: "Use the product for a semi-elite, highly specific block",
    specificGoal: "Train toward a sharp event-specific performance outcome with exact metrics",
    vagueGoal: "Get sharper for competition",
    unrealisticGoal: "Have the app replace a full human coach stack instantly",
    secondaryGoals: ["Keep support work and taper logic trustworthy"],
    tertiaryGoals: ["Preserve deterministic explanation"],
    scheduleReality: "High compliance, high expectations, little patience",
    equipmentReality: "Full performance environment",
    equipmentAccess: "full_gym",
    environmentMode: "Gym",
    sessionLength: "60+",
    preferredIntensity: "Aggressive",
    trainingAgeYears: 10,
    bodyCompContext: "Performance only",
    strengthContext: "Advanced",
    enduranceContext: "Advanced",
    injuryContext: "Tiny details matter and overreach is visible",
    nutritionBehavior: "Performance-specific and data-heavy",
    loggingBehavior: "Full detail and expects export quality",
    coachInteractionBehavior: "Hostile until proven precise",
    syncDeviceBehavior: "Expects reliability and provenance everywhere",
    reviewLensAffinities: ["skeptical_hostile", "technical_data_heavy", "expert_athlete_coach"],
    featureExpectations: ["goal_history_and_export", "calendar_import", "wearable_sync_multi_device"],
    likelyFailureModes: ["periodization feels generic", "unsupported specificity silently faked"],
    cohortTags: ["elite_or_semi_elite_edge_cases", "high_training_age"],
    baselineMetrics: { bodyweight: 182 },
  },
  {
    id: "medical_precision_expecter",
    category: "medical",
    primaryGoal: "Get training help that feels medically precise after pain or rehab",
    specificGoal: "Return to activity while respecting rehab boundaries",
    vagueGoal: "Train safely after rehab",
    unrealisticGoal: "Have the app behave like a licensed rehab specialist",
    secondaryGoals: ["Understand when the app is not enough"],
    tertiaryGoals: ["Keep pain flare guidance calm and actionable"],
    scheduleReality: "Three cautious sessions each week",
    equipmentReality: "PT tools, bands, and light gym work",
    equipmentAccess: "minimal",
    environmentMode: "Home",
    sessionLength: "30",
    preferredIntensity: "Conservative",
    trainingAgeYears: 2,
    bodyCompContext: "Safety first",
    strengthContext: "Rebuild after layoff",
    enduranceContext: "Low",
    injuryContext: "Rehab expectations and medical nuance",
    nutritionBehavior: "Simple",
    loggingBehavior: "Will log pain and substitutions if asked well",
    coachInteractionBehavior: "Needs clear escalation boundaries",
    syncDeviceBehavior: "Trust-sensitive, worries about wrong advice carrying over",
    reviewLensAffinities: ["privacy_sync_anxious", "skeptical_hostile", "accessibility_focused"],
    featureExpectations: ["persistent_coach_memory_controls", "wearable_sync_multi_device"],
    likelyFailureModes: ["medical overreach", "unsafe substitution confidence"],
    cohortTags: ["people_expecting_medical_precision", "injured_or_pain_sensitive_users"],
    baselineMetrics: { bodyweight: 168 },
  },
  {
    id: "unsupported_feature_seeker",
    category: "feature_gap",
    primaryGoal: "Use FORMA as a broad lifestyle training hub",
    specificGoal: "Organize training, food, wearable data, and calendar from one place",
    vagueGoal: "Have one app for everything",
    unrealisticGoal: "Expect every missing feature to already exist",
    secondaryGoals: ["Keep coach memory and accountability high"],
    tertiaryGoals: ["Have rich exports and social proof"],
    scheduleReality: "Four sessions per week but lots of app expectations",
    equipmentReality: "Mixed home and gym setup",
    equipmentAccess: "mixed",
    environmentMode: "Mixed",
    sessionLength: "45",
    preferredIntensity: "Standard",
    trainingAgeYears: 3,
    bodyCompContext: "Mixed",
    strengthContext: "General",
    enduranceContext: "General",
    injuryContext: "No major injury",
    nutritionBehavior: "Wants scanning and automation",
    loggingBehavior: "Wants near-zero manual effort",
    coachInteractionBehavior: "Turns feature requests into product judgement fast",
    syncDeviceBehavior: "Expects polished multi-device state and exports",
    reviewLensAffinities: ["feature_hungry", "artistic_design_sensitive", "technical_data_heavy"],
    featureExpectations: [
      "meal_photo_recognition",
      "calendar_import",
      "social_training_features",
      "persistent_coach_memory_controls",
      "native_watch_app",
    ],
    likelyFailureModes: ["feature gaps feel like broken promises", "product feels unfinished"],
    cohortTags: ["people_expecting_unsupported_features", "general_fitness"],
    baselineMetrics: { bodyweight: 174 },
  },
]);

const GOAL_DOMAIN_LABELS = Object.freeze({
  general_fitness: "General fitness",
  body_comp: "Fat loss / body recomposition",
  strength: "Strength",
  hypertrophy: "Hypertrophy / bodybuilding",
  powerlifting: "Powerlifting",
  running: "Running",
  swimming: "Swimming",
  cycling: "Cycling",
  hybrid: "Hybrid",
  team_sport: "Team / court sport",
  tactical: "Tactical / occupational",
  occupational: "Occupational",
  longevity: "Longevity",
  travel: "Travel-heavy",
  minimal_equipment: "Minimal equipment",
  elite: "Elite edge case",
  medical: "Medical / rehab precision expectation",
  feature_gap: "Unsupported-feature expectation",
});

const QUOTA_STRATEGY = Object.freeze({
  edits_goal_before_confirm: { offset: 7, step: 37 },
  removes_and_replaces_goal: { offset: 13, step: 39 },
  custom_goal_entry: { offset: 19, step: 41 },
  vague_or_ambiguous_goal: { offset: 23, step: 43 },
  highly_specific_goal: { offset: 29, step: 47 },
  reprioritizes_goal_order: { offset: 31, step: 49 },
  conflicting_goals: { offset: 37, step: 51 },
  unrealistic_timeline: { offset: 41, step: 53 },
  changes_schedule_or_session_length: { offset: 43, step: 57 },
  equipment_or_location_contradiction: { offset: 47, step: 59 },
  typo_heavy_or_conversational: { offset: 53, step: 61 },
  asks_for_expanded_feature: { offset: 59, step: 63 },
  almost_abandons_then_recovers: { offset: 61, step: 67 },
  local_only_then_tests_sync: { offset: 67, step: 69 },
});

const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const toCamelCase = (value = "") => String(value || "").replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());
const sanitizeIdFragment = (value = "") => String(value || "")
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "_")
  .replace(/^_+|_+$/g, "")
  .slice(0, 64);

const createSeededRandom = (seed = 20260418) => {
  let state = Number(seed) >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const seededShuffle = (items = [], seed = 20260418) => {
  const nextRandom = createSeededRandom(seed);
  const list = items.slice();
  for (let index = list.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(nextRandom() * (index + 1));
    [list[index], list[swapIndex]] = [list[swapIndex], list[index]];
  }
  return list;
};

const buildQuotaSet = ({
  count = 0,
  total = TOTAL_PERSONAS,
  offset = 0,
  step = 37,
} = {}) => {
  const hits = new Set();
  let cursor = Number(offset || 0) % total;
  while (hits.size < Math.max(0, Math.min(count, total))) {
    hits.add((cursor + total) % total);
    cursor += step;
  }
  return hits;
};

const buildQuotaSets = () => Object.fromEntries(
  Object.entries(LAUNCH_INTAKE_QUOTA_COUNTS).map(([key, count]) => ([
    key,
    buildQuotaSet({
      count,
      total: TOTAL_PERSONAS,
      offset: QUOTA_STRATEGY[key]?.offset || 0,
      step: QUOTA_STRATEGY[key]?.step || 37,
    }),
  ]))
);

const normalizeGoalText = (value = "") => String(value || "").replace(/\s+/g, " ").trim();

const typoify = (value = "") => normalizeGoalText(value)
  .replace(/\bfor\b/gi, "fr")
  .replace(/\band\b/gi, "&")
  .replace(/\bto\b/gi, "2")
  .replace(/\bwith\b/gi, "w/")
  .replace(/ing\b/gi, "in")
  .replace(/\bmy\b/gi, "myy");

const withConversationNoise = (value = "") => `Honestly I just want to ${normalizeGoalText(value).replace(/^[a-z]/, (letter) => letter.toLowerCase())} and not overcomplicate it`;

const buildGoalSpecificityProfile = ({
  archetype = {},
  flags = {},
} = {}) => {
  if (flags.conflicting_goals) return { level: "conflicting", tags: ["conflicting", "multi_goal"] };
  if (archetype.id === "unsupported_feature_seeker" || archetype.id === "medical_precision_expecter") {
    return { level: "unsupported", tags: ["unsupported"] };
  }
  if (flags.unrealistic_timeline) return { level: "unrealistic", tags: ["unrealistic"] };
  if (flags.highly_specific_goal) return { level: "highly specific", tags: ["highly_specific"] };
  if (flags.custom_goal_entry) return { level: "custom", tags: ["custom"] };
  if (flags.vague_or_ambiguous_goal) return { level: "vague", tags: ["vague"] };
  return { level: "semi-specific", tags: ["semi_specific"] };
};

const buildGoalText = ({
  archetype = {},
  specificity = {},
  flags = {},
} = {}) => {
  let text = archetype.primaryGoal || "Build a believable plan";
  if (specificity.level === "vague") text = archetype.vagueGoal || archetype.primaryGoal || text;
  if (specificity.level === "highly specific") text = archetype.specificGoal || archetype.primaryGoal || text;
  if (specificity.level === "unrealistic") text = archetype.unrealisticGoal || archetype.specificGoal || text;
  if (specificity.level === "unsupported") text = archetype.primaryGoal || text;
  if (flags.custom_goal_entry) {
    text = withConversationNoise(archetype.specificGoal || archetype.primaryGoal || text);
  }
  if (flags.typo_heavy_or_conversational) {
    text = typoify(text);
  }
  return normalizeGoalText(text);
};

const buildSecondaryGoals = ({
  archetype = {},
  flags = {},
} = {}) => {
  const goals = [];
  toArray(archetype.secondaryGoals || []).forEach((goal) => goals.push(normalizeGoalText(goal)));
  if (flags.conflicting_goals) {
    if (/running|swimming|cycling|hybrid|team_sport|tactical/i.test(archetype.category || "")) {
      goals.push("Add noticeable muscle without sacrificing my event goal");
    } else if (/strength|hypertrophy|powerlifting/i.test(archetype.category || "")) {
      goals.push("Cut hard and improve race fitness at the same time");
    } else {
      goals.push("Train for performance and look leaner at the same time");
    }
  }
  return [...new Set(goals)].slice(0, 3);
};

const buildTertiaryGoals = ({
  archetype = {},
  flags = {},
} = {}) => {
  const goals = [...new Set(toArray(archetype.tertiaryGoals || []).map((goal) => normalizeGoalText(goal)))];
  if (flags.asks_for_expanded_feature) goals.push("Get planning help that connects with the other apps I already use");
  return goals.slice(0, 2);
};

const buildFeatureExpectations = ({
  archetype = {},
  dominantLens = "",
  flags = {},
  index = 0,
} = {}) => {
  const lensDriven = {
    feature_hungry: ["meal_photo_recognition", "calendar_import", "social_training_features", "persistent_coach_memory_controls"],
    technical_data_heavy: ["goal_history_and_export", "wearable_sync_multi_device", "calendar_import"],
    privacy_sync_anxious: ["goal_history_and_export", "persistent_coach_memory_controls"],
    artistic_design_sensitive: ["workout_demo_video_library", "social_training_features"],
    busy_pragmatist: ["calendar_import", "native_watch_app"],
    accessibility_focused: ["workout_demo_video_library"],
  };
  const pool = [
    ...toArray(archetype.featureExpectations || []),
    ...toArray(lensDriven[dominantLens] || []),
  ];
  if (flags.asks_for_expanded_feature) {
    pool.push(index % 2 === 0 ? "meal_photo_recognition" : "calendar_import");
  }
  return [...new Set(pool)].slice(0, 5);
};

const buildReviewLensNarrative = (lensId = "") => {
  const label = REVIEW_LENS_LABELS[lensId] || lensId;
  if (lensId === "artistic_design_sensitive") return `${label} reviewer who notices layout rhythm, spacing, brand feel, and whether the app reads as premium.`;
  if (lensId === "consistency_focused") return `${label} reviewer who compares Today, Program, Log, Nutrition, Coach, and Settings for story drift.`;
  if (lensId === "technical_data_heavy") return `${label} reviewer who pressure-tests sync, exports, determinism, history, and explainability.`;
  if (lensId === "low_tech_literal") return `${label} reviewer who taps the wrong thing, reads copy literally, and needs obvious recovery paths.`;
  if (lensId === "feature_hungry") return `${label} reviewer who assumes expanded capabilities like calendar import or meal scanning should already exist.`;
  if (lensId === "skeptical_hostile") return `${label} reviewer who assumes the AI is wrong until the product proves otherwise.`;
  if (lensId === "accessibility_focused") return `${label} reviewer who checks contrast, tap targets, density, and clarity under strain.`;
  if (lensId === "expert_athlete_coach") return `${label} reviewer who spots progression nonsense and sport-domain errors quickly.`;
  if (lensId === "busy_pragmatist") return `${label} reviewer who only cares whether the product saves time and stays decisive.`;
  if (lensId === "privacy_sync_anxious") return `${label} reviewer who cares about account safety, local recovery, and deletion controls.`;
  return `${label} reviewer.`;
};

const buildIntakeFlagsForIndex = ({
  index = 0,
  quotaSets = {},
} = {}) => Object.fromEntries(
  Object.keys(LAUNCH_INTAKE_QUOTA_COUNTS).map((key) => [key, quotaSets[key]?.has(index) === true])
);

const buildLensPools = () => {
  const dominantPool = Object.entries(LAUNCH_DOMINANT_REVIEW_LENS_COUNTS).flatMap(([lensId, count]) => (
    Array.from({ length: count }, () => lensId)
  ));
  return seededShuffle(dominantPool, 20260418);
};

const addSecondaryLensCoverage = (personas = []) => {
  const results = personas.map((persona) => ({
    ...persona,
    secondaryReviewLenses: toArray(persona.secondaryReviewLenses || []).slice(),
    lensTags: [persona.reviewLens],
  }));

  const counts = {};
  results.forEach((persona) => {
    counts[persona.reviewLens] = (counts[persona.reviewLens] || 0) + 1;
  });

  Object.entries(LAUNCH_REVIEW_LENS_TARGET_COUNTS).forEach(([lensId, targetCount], lensIndex) => {
    let deficit = Math.max(0, targetCount - Number(counts[lensId] || 0));
    if (deficit <= 0) return;
    const candidateOrder = seededShuffle(
      results.map((persona, index) => ({ index, persona })),
      20260418 + lensIndex * 17 + 3
    );
    candidateOrder.forEach(({ index, persona }) => {
      if (deficit <= 0) return;
      if (persona.reviewLens === lensId) return;
      if (persona.secondaryReviewLenses.includes(lensId)) return;
      persona.secondaryReviewLenses.push(lensId);
      persona.lensTags = [persona.reviewLens, ...persona.secondaryReviewLenses];
      deficit -= 1;
    });
  });

  return results.map((persona) => ({
    ...persona,
    lensTags: [persona.reviewLens, ...persona.secondaryReviewLenses],
  }));
};

const resolveScheduleReality = ({ archetype = {}, flags = {} } = {}) => {
  if (flags.changes_schedule_or_session_length) {
    return `${archetype.scheduleReality}. During intake this user changes days per week or session length after seeing the first version.`;
  }
  return archetype.scheduleReality;
};

const resolveEquipmentReality = ({ archetype = {}, flags = {} } = {}) => {
  if (flags.equipment_or_location_contradiction) {
    return `${archetype.equipmentReality}. During intake they contradict themselves about where they train or what gear they really have.`;
  }
  return archetype.equipmentReality;
};

const buildLifecycleEvents = ({
  archetype = {},
  flags = {},
  dominantLens = "",
  featureExpectations = [],
  index = 0,
} = {}) => {
  const events = [
    { week: 1, kind: "onboarding", label: "Creates the account and finishes the first intake build." },
    { week: 3, kind: "logging_pattern", label: "Settles into a real logging rhythm and starts skipping low-value fields." },
    { week: 8, kind: "plateau", label: "Feels a plateau and judges whether Program still looks believable." },
    { week: 14, kind: "schedule_shift", label: "A life or work schedule change forces a preference update." },
    { week: 20, kind: "goal_review", label: "Reconsiders whether the primary goal is still right." },
    { week: 28, kind: "feature_request", label: "Asks for a missing feature and judges whether FORMA feels complete enough." },
  ];

  const yearlyEvents = [
    { offset: 34, kind: "travel_block", label: "Runs a travel-heavy month and stress-tests quick swaps, nutrition, and sync." },
    { offset: 43, kind: "pain_event", label: "Hits a pain flare or recovery scare and looks for substitutions plus honest boundaries." },
    { offset: 52, kind: "goal_change", label: "Completes, abandons, or reshapes a goal at the end of the training year." },
  ];

  for (let year = 0; year < 5; year += 1) {
    const baseWeek = year * 52;
    yearlyEvents.forEach((event) => {
      events.push({
        week: baseWeek + event.offset,
        kind: event.kind,
        label: `${event.label} Year ${year + 1}.`,
      });
    });
    if (year < 4) {
      events.push({
        week: baseWeek + 60,
        kind: "return_after_gap",
        label: `Comes back after a motivation or lifestyle gap in year ${year + 2}.`,
      });
    }
  }

  if (/travel/i.test(archetype.id || "")) {
    events.push({ week: 76, kind: "travel_block", label: "A long client-travel season exposes whether the product really adapts to hotel life." });
  }
  if (/medical|return_to_running|obese_beginner_recovery/i.test(archetype.id || "")) {
    events.push({ week: 96, kind: "pain_event", label: "A recurrence scare forces the user to test substitutions and safety clarity." });
  }
  if (/elite|powerlifting|masters_swimmer|speed_goal_runner/i.test(archetype.id || "")) {
    events.push({ week: 118, kind: "competition_block", label: "A high-specificity block reveals whether the planner can still look credible to an expert." });
  }
  if (flags.local_only_then_tests_sync || dominantLens === "privacy_sync_anxious") {
    events.push({ week: 66, kind: "sync_recovery", label: "Tests local recovery, refresh, and sign-in trust after relying on one device for a while." });
  }
  if (featureExpectations.some((id) => LAUNCH_FEATURE_CAPABILITIES[id]?.supported === "unsupported")) {
    events.push({ week: 88, kind: "feature_request", label: "Feature expectations rise and the user pressures the product on missing capability breadth." });
  }
  if (flags.almost_abandons_then_recovers) {
    events.push({ week: 110, kind: "retention_risk", label: "Nearly abandons the product, then recovers only if the next steps feel easy and credible." });
  }
  if ((index % 17) === 0) {
    events.push({ week: 244, kind: "account_deletion", label: "Attempts account deletion or long-term reset and judges whether lifecycle controls feel trustworthy." });
  }

  return events
    .filter((event) => event.week >= 1 && event.week <= TOTAL_SIMULATION_WEEKS)
    .sort((left, right) => left.week - right.week || left.kind.localeCompare(right.kind));
};

const buildTechnicalComfort = ({ reviewLens = "", index = 0 } = {}) => {
  if (reviewLens === "technical_data_heavy") return "high";
  if (reviewLens === "low_tech_literal") return "low";
  if (reviewLens === "privacy_sync_anxious") return index % 2 === 0 ? "medium" : "low";
  return index % 3 === 0 ? "high" : "medium";
};

const buildSyncBehavior = ({ archetype = {}, reviewLens = "", flags = {} } = {}) => {
  if (flags.local_only_then_tests_sync) return "Starts on one device, then later tests sign-in, refresh, and cloud trust after relying on local state.";
  if (reviewLens === "privacy_sync_anxious") return "Checks whether local, cloud, delete, sign-out, and recovery messaging all make sense before trusting the product.";
  if (reviewLens === "technical_data_heavy") return "Uses multiple devices and expects exact cloud parity plus useful diagnostics when something fails.";
  return archetype.syncDeviceBehavior || "Mostly one phone, with occasional laptop review.";
};

const buildLikelyFailureModes = ({
  archetype = {},
  dominantLens = "",
  flags = {},
} = {}) => {
  const failures = [...new Set(toArray(archetype.likelyFailureModes || []))];
  if (dominantLens === "artistic_design_sensitive") failures.push("visual polish feels unfinished");
  if (dominantLens === "consistency_focused") failures.push("different tabs tell different stories");
  if (dominantLens === "technical_data_heavy") failures.push("history or sync state feels opaque");
  if (dominantLens === "low_tech_literal") failures.push("misses an affordance and gets stuck");
  if (dominantLens === "feature_hungry") failures.push("missing feature reads like a broken promise");
  if (dominantLens === "skeptical_hostile") failures.push("drops trust after one incoherent recommendation");
  if (dominantLens === "accessibility_focused") failures.push("small targets or dense copy slow usage");
  if (dominantLens === "busy_pragmatist") failures.push("logging or adjustments take too many taps");
  if (dominantLens === "privacy_sync_anxious") failures.push("cloud or delete messaging feels imprecise");
  if (flags.conflicting_goals) failures.push("conflicting goals are not acknowledged clearly");
  if (flags.unrealistic_timeline) failures.push("timeline honesty is too soft");
  if (flags.equipment_or_location_contradiction) failures.push("equipment reality is handled too late");
  return failures.slice(0, 6);
};

const buildPersonalityProfile = ({ dominantLens = "", index = 0 } = {}) => {
  const [traitA, traitB] = PERSONALITY_TRAIT_PAIRS[index % PERSONALITY_TRAIT_PAIRS.length];
  return {
    dominantLens,
    dominantLensLabel: REVIEW_LENS_LABELS[dominantLens] || dominantLens,
    summary: buildReviewLensNarrative(dominantLens),
    traits: [traitA, traitB],
  };
};

const buildHarnessGoalIntents = ({
  primaryGoal = "",
  secondaryGoals = [],
  tertiaryGoals = [],
} = {}) => [
  normalizeGoalText(primaryGoal),
  ...secondaryGoals.map((goal) => normalizeGoalText(goal)),
  ...tertiaryGoals.map((goal) => normalizeGoalText(goal)),
].filter(Boolean).slice(0, 4);

const buildBasePersonas = () => {
  const dominantLensPool = buildLensPools();
  const quotaSets = buildQuotaSets();
  const archetypePool = seededShuffle(
    Array.from({ length: TOTAL_PERSONAS }, (_, index) => GOAL_ARCHETYPES[index % GOAL_ARCHETYPES.length]),
    20260419
  );

  return Array.from({ length: TOTAL_PERSONAS }, (_, index) => {
    const dominantLens = dominantLensPool[index];
    const archetype = archetypePool[index];
    const flags = buildIntakeFlagsForIndex({ index, quotaSets });
    const specificity = buildGoalSpecificityProfile({ archetype, flags });
    const primaryGoal = buildGoalText({ archetype, specificity, flags });
    const secondaryGoals = buildSecondaryGoals({ archetype, flags });
    const tertiaryGoals = buildTertiaryGoals({ archetype, flags });
    const featureExpectations = buildFeatureExpectations({
      archetype,
      dominantLens,
      flags,
      index,
    });
    const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
    const lastName = LAST_NAMES[Math.floor(index / FIRST_NAMES.length) % LAST_NAMES.length];
    const ageRange = AGE_RANGES[(index + GOAL_ARCHETYPES.indexOf(archetype)) % AGE_RANGES.length];
    const trainingAgeYears = Math.max(0, Number(archetype.trainingAgeYears || 0) + ((index % 3) === 0 ? 1 : 0) - ((index % 7) === 0 ? 1 : 0));
    const lifecycleEvents = buildLifecycleEvents({
      archetype,
      flags,
      dominantLens,
      featureExpectations,
      index,
    });

    return {
      id: `launch_${String(index + 1).padStart(4, "0")}_${sanitizeIdFragment(archetype.id)}`,
      stableId: `launch_${String(index + 1).padStart(4, "0")}_${sanitizeIdFragment(archetype.id)}`,
      name: `${firstName} ${lastName}`,
      ageRange,
      trainingAgeYears,
      trainingAgeBand: trainingAgeYears <= 1 ? "beginner" : trainingAgeYears <= 4 ? "intermediate" : trainingAgeYears <= 8 ? "experienced" : "advanced",
      reviewLens: dominantLens,
      reviewLensLabel: REVIEW_LENS_LABELS[dominantLens] || dominantLens,
      secondaryReviewLenses: [],
      personalityProfile: buildPersonalityProfile({ dominantLens, index }),
      technicalComfortLevel: buildTechnicalComfort({ reviewLens: dominantLens, index }),
      primaryGoal,
      secondaryGoals,
      tertiaryGoals,
      goalSpecificityLevel: specificity.level,
      goalSpecificityTags: specificity.tags,
      intakeBehavior: {
        editsGoalBeforeConfirm: flags.edits_goal_before_confirm,
        removesAndReplacesGoal: flags.removes_and_replaces_goal,
        customGoalEntry: flags.custom_goal_entry,
        vagueOrAmbiguousGoal: flags.vague_or_ambiguous_goal,
        highlySpecificGoal: flags.highly_specific_goal,
        reprioritizesGoalOrder: flags.reprioritizes_goal_order,
        conflictingGoals: flags.conflicting_goals,
        unrealisticTimeline: flags.unrealistic_timeline,
        changesScheduleOrSessionLength: flags.changes_schedule_or_session_length,
        equipmentOrLocationContradiction: flags.equipment_or_location_contradiction,
        typoHeavyOrConversational: flags.typo_heavy_or_conversational,
        asksForExpandedFeature: flags.asks_for_expanded_feature,
        almostAbandonsThenRecovers: flags.almost_abandons_then_recovers,
        localOnlyThenTestsSync: flags.local_only_then_tests_sync,
        indecision: flags.vague_or_ambiguous_goal || flags.almost_abandons_then_recovers,
        overSpecificAnchors: flags.highly_specific_goal,
        underSpecificAnchors: flags.vague_or_ambiguous_goal,
      },
      scheduleReality: resolveScheduleReality({ archetype, flags }),
      equipmentReality: resolveEquipmentReality({ archetype, flags }),
      injuryOrRecoveryConstraints: archetype.injuryContext,
      nutritionBehavior: archetype.nutritionBehavior,
      loggingBehavior: archetype.loggingBehavior,
      coachInteractionBehavior: archetype.coachInteractionBehavior,
      syncDeviceBehavior: buildSyncBehavior({ archetype, reviewLens: dominantLens, flags }),
      featureExpectations,
      likelyFailureModes: buildLikelyFailureModes({ archetype, dominantLens, flags }),
      fiveYearLifecycleEvents: lifecycleEvents,
      longTermUsageBehavior: "Uses Today daily during good stretches, reviews Program when trust is high, and touches Settings whenever life changes.",
      archetypeId: archetype.id,
      goalCategory: archetype.category,
      goalCategoryLabel: GOAL_DOMAIN_LABELS[archetype.category] || archetype.category,
      cohortTags: archetype.cohortTags || [],
      desiredFeaturesThatDoNotExist: featureExpectations.filter((id) => LAUNCH_FEATURE_CAPABILITIES[id]?.supported === "unsupported"),
      units: "imperial",
      timezone: "America/Chicago",
      environmentMode: archetype.environmentMode,
      equipmentAccess: archetype.equipmentAccess,
      sessionLength: archetype.sessionLength,
      preferredIntensity: archetype.preferredIntensity,
      goalIntents: buildHarnessGoalIntents({ primaryGoal, secondaryGoals, tertiaryGoals }),
      supportTierExpectation: /swimming|elite|medical|tactical/i.test(archetype.category || "") ? "tier_2" : "tier_1",
      bodyCompContext: archetype.bodyCompContext,
      strengthContext: archetype.strengthContext,
      enduranceContext: archetype.enduranceContext,
      injuryContext: archetype.injuryContext,
      travelLikelihood: /travel/i.test(archetype.id || "") ? "high" : /travel/i.test(resolveScheduleReality({ archetype, flags })) ? "medium" : "low",
      baselineMetrics: archetype.baselineMetrics || {},
    };
  });
};

export const generateLaunchSimulationPersonas = ({
  count = TOTAL_PERSONAS,
} = {}) => addSecondaryLensCoverage(buildBasePersonas())
  .slice(0, Math.max(1, Math.min(Number(count || TOTAL_PERSONAS) || TOTAL_PERSONAS, TOTAL_PERSONAS)))
  .map((persona, index) => ({
    ...persona,
    lensTags: [persona.reviewLens, ...persona.secondaryReviewLenses],
    ordinal: index + 1,
  }));

const countBy = (items = [], pickKey = () => "") => items.reduce((acc, item) => {
  const rawKey = pickKey(item);
  const keys = Array.isArray(rawKey) ? rawKey : [rawKey];
  keys.forEach((key) => {
    const normalized = String(key || "").trim();
    if (!normalized) return;
    acc[normalized] = (acc[normalized] || 0) + 1;
  });
  return acc;
}, {});

export const buildLaunchPersonaCoverage = (personas = []) => {
  const list = personas.slice();
  const frictionCounts = countBy(list, (persona) => Object.entries(persona.intakeBehavior || {})
    .filter(([, enabled]) => enabled)
    .map(([key]) => key));
  const lensTagCounts = countBy(list, (persona) => persona.lensTags || []);
  return {
    personaCount: list.length,
    dominantLensCounts: countBy(list, (persona) => persona.reviewLens),
    lensTagCounts,
    goalCategoryCounts: countBy(list, (persona) => persona.goalCategory),
    archetypeCounts: countBy(list, (persona) => persona.archetypeId),
    cohortCounts: countBy(list, (persona) => persona.cohortTags || []),
    technicalComfortCounts: countBy(list, (persona) => persona.technicalComfortLevel),
    equipmentAccessCounts: countBy(list, (persona) => persona.equipmentAccess),
    environmentModeCounts: countBy(list, (persona) => persona.environmentMode),
    goalSpecificityCounts: countBy(list, (persona) => persona.goalSpecificityLevel),
    frictionCounts,
    featureExpectationCounts: countBy(list, (persona) => persona.featureExpectations || []),
    unsupportedFeatureDemandCounts: countBy(
      list,
      (persona) => (persona.featureExpectations || []).filter((featureId) => LAUNCH_FEATURE_CAPABILITIES[featureId]?.supported === "unsupported")
    ),
    lifecycleEventCounts: countBy(list, (persona) => (persona.fiveYearLifecycleEvents || []).map((event) => event.kind)),
    quotaChecks: Object.fromEntries(
      Object.entries(LAUNCH_INTAKE_QUOTA_COUNTS).map(([key, minimum]) => [
        key,
        {
          minimum,
          actual: Number(frictionCounts[toCamelCase(key)] || frictionCounts[key] || 0),
          meetsMinimum: Number(frictionCounts[toCamelCase(key)] || frictionCounts[key] || 0) >= minimum,
        },
      ])
    ),
    lensTargetChecks: Object.fromEntries(
      Object.entries(LAUNCH_REVIEW_LENS_TARGET_COUNTS).map(([key, minimum]) => [
        key,
        {
          minimum,
          actual: Number(lensTagCounts[key] || 0),
          meetsMinimum: Number(lensTagCounts[key] || 0) >= minimum,
        },
      ])
    ),
  };
};
