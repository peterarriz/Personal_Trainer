const sanitizeCopy = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const metric = (key, label, unit = "", targetValue = "", kind = "primary") => ({
  key,
  label,
  unit,
  targetValue,
  kind,
});

const createIntent = ({
  id,
  familyId,
  categoryId,
  title,
  helper,
  goalText,
  summary,
  planningCategory,
  goalFamily,
  keywords = [],
  primaryMetric = null,
  proxyMetrics = [],
  legacyAliases = [],
  hidden = false,
  specificityProfile = {},
} = {}) => Object.freeze({
  id,
  familyId,
  categoryId: categoryId || familyId,
  title: sanitizeCopy(title, 48),
  helper: sanitizeCopy(helper, 140),
  goalText: sanitizeCopy(goalText || title, 220),
  summary: sanitizeCopy(summary || title, 160),
  planningCategory,
  goalFamily,
  keywords: [...keywords],
  primaryMetric,
  proxyMetrics: [...proxyMetrics],
  legacyAliases: [...legacyAliases],
  hidden: Boolean(hidden),
  specificityProfile: {
    id: specificityProfile?.id || id,
    summary: sanitizeCopy(specificityProfile?.summary || "", 160),
    questions: Array.isArray(specificityProfile?.questions) ? [...specificityProfile.questions] : [],
  },
});

const escapeRegex = (value = "") => String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const keywordToPattern = (keyword = "") => {
  const normalized = sanitizeCopy(keyword, 80).toLowerCase();
  if (!normalized) return null;
  const expression = escapeRegex(normalized).replace(/\s+/g, "\\s+");
  return new RegExp(`(^|\\b)${expression}(?=\\b|$)`, "i");
};

const STRENGTH_PROXIES = [
  metric("compound_lift_consistency", "Compound lift consistency", "sessions", "", "proxy"),
  metric("top_set_load", "Top set load", "lb", "", "proxy"),
  metric("weekly_strength_frequency", "Weekly strength frequency", "sessions", "", "proxy"),
];

const BODY_COMP_PROXIES = [
  metric("bodyweight_trend", "Bodyweight trend", "lb", "", "proxy"),
  metric("waist_circumference", "Waist circumference", "in", "", "proxy"),
  metric("training_adherence", "Training adherence", "sessions", "", "proxy"),
];

const RUN_PROXIES = [
  metric("weekly_run_frequency", "Weekly run frequency", "sessions", "", "proxy"),
  metric("long_run_duration", "Longest recent run", "min", "", "proxy"),
  metric("quality_session_completion", "Quality session completion", "sessions", "", "proxy"),
];

const SWIM_PROXIES = [
  metric("swim_benchmark_retest", "Swim benchmark retest", "benchmark", "", "proxy"),
  metric("weekly_swim_frequency", "Weekly swim frequency", "sessions", "", "proxy"),
  metric("swim_access_reality", "Swim access reality", "", "", "proxy"),
];

const CYCLING_PROXIES = [
  metric("ride_frequency", "Ride frequency", "sessions", "", "proxy"),
  metric("long_ride_duration", "Longest recent ride", "min", "", "proxy"),
  metric("tempo_ride_completion", "Tempo ride completion", "sessions", "", "proxy"),
];

const GENERAL_PROXIES = [
  metric("weekly_training_frequency", "Weekly training frequency", "sessions", "", "proxy"),
  metric("consistency_streak", "Consistency streak", "days", "", "proxy"),
  metric("thirty_day_adherence", "30-day adherence", "sessions", "", "proxy"),
];

export const STRUCTURED_GOAL_INTENTS = Object.freeze([
  createIntent({
    id: "train_for_run_race",
    familyId: "endurance",
    title: "Train for a race",
    helper: "Choose 5K, 10K, half, or marathon and get a real run-specific plan.",
    goalText: "Train for a running race",
    summary: "Train for a running race",
    planningCategory: "running",
    goalFamily: "performance",
    keywords: ["5k", "10k", "half marathon", "marathon", "race", "running race"],
    primaryMetric: metric("run_race_target", "Race target", "", ""),
    proxyMetrics: RUN_PROXIES,
    legacyAliases: ["run_first_5k", "run_faster_5k", "run_10k", "half_marathon", "marathon"],
    specificityProfile: { summary: "Capture race distance, current run reality, and a usable timeline.", questions: ["endurance_race_profile"] },
  }),
  createIntent({
    id: "build_endurance",
    familyId: "endurance",
    title: "Build endurance",
    helper: "Aerobic base, cardio consistency, or better work capacity without a race deadline.",
    goalText: "Build endurance",
    summary: "Build aerobic endurance",
    planningCategory: "general_fitness",
    goalFamily: "performance",
    keywords: ["endurance", "aerobic base", "conditioning", "cardio", "work capacity"],
    proxyMetrics: [...RUN_PROXIES, ...CYCLING_PROXIES],
    specificityProfile: { summary: "Capture the main conditioning mode plus one recent anchor.", questions: ["endurance_base_profile"] },
  }),
  createIntent({
    id: "return_to_running",
    familyId: "endurance",
    title: "Return to running",
    helper: "Come back conservatively with realistic run/walk progressions.",
    goalText: "Return to running",
    summary: "Return to running",
    planningCategory: "running",
    goalFamily: "re_entry",
    keywords: ["return to running", "back to running", "run again", "restart running"],
    proxyMetrics: RUN_PROXIES,
    legacyAliases: ["return_to_running"],
    specificityProfile: { summary: "Capture current tolerance so the plan starts where running is repeatable.", questions: ["return_to_run_profile"] },
  }),
  createIntent({
    id: "swim_better",
    familyId: "endurance",
    title: "Swim better",
    helper: "Swim for fitness, endurance, open water, or a faster benchmark.",
    goalText: "Improve swim fitness",
    summary: "Improve swim fitness",
    planningCategory: "general_fitness",
    goalFamily: "performance",
    keywords: ["swim", "swimming", "open water", "pool", "mile swim", "swim endurance"],
    proxyMetrics: SWIM_PROXIES,
    legacyAliases: ["swim_faster_mile", "swim_speed_standard_distance", "open_water_swim", "swim_endurance", "swim_shoulder_friendly"],
    specificityProfile: { summary: "Capture one recent swim anchor plus where you can actually swim.", questions: ["swim_profile"] },
  }),
  createIntent({
    id: "ride_stronger",
    familyId: "endurance",
    title: "Ride stronger",
    helper: "Build cycling fitness, aerobic base, or a steadier weekly ride rhythm.",
    goalText: "Improve cycling fitness",
    summary: "Improve cycling fitness",
    planningCategory: "general_fitness",
    goalFamily: "performance",
    keywords: ["cycling", "bike", "ride", "riding", "cycling fitness"],
    proxyMetrics: CYCLING_PROXIES,
    specificityProfile: { summary: "Capture ride reality, recent duration, and weekly availability.", questions: ["cycling_profile"] },
  }),
  createIntent({
    id: "triathlon_multisport",
    familyId: "endurance",
    title: "Triathlon / multisport",
    helper: "Structured swim-bike-run support without a Custom-only path.",
    goalText: "Train for triathlon or multisport",
    summary: "Train for triathlon or multisport",
    planningCategory: "running",
    goalFamily: "hybrid",
    keywords: ["triathlon", "tri", "multisport", "sprint tri", "olympic tri"],
    proxyMetrics: [
      metric("swim_consistency", "Swim consistency", "sessions", "", "proxy"),
      metric("ride_consistency", "Ride consistency", "sessions", "", "proxy"),
      metric("run_consistency", "Run consistency", "sessions", "", "proxy"),
    ],
    specificityProfile: { summary: "Capture race format, current strongest lane, and the lane you can’t sacrifice.", questions: ["triathlon_profile"] },
  }),
  createIntent({
    id: "conditioning_builder",
    familyId: "endurance",
    title: "Improve conditioning",
    helper: "General cardio or conditioning when the goal is broader than one sport.",
    goalText: "Improve conditioning",
    summary: "Improve conditioning",
    planningCategory: "general_fitness",
    goalFamily: "general_fitness",
    keywords: ["conditioning", "cardio", "gas tank", "work capacity", "fitter"],
    proxyMetrics: GENERAL_PROXIES,
    specificityProfile: { summary: "Capture the preferred mode and current capacity without overcomplicating it.", questions: ["conditioning_profile"] },
  }),
  createIntent({
    id: "get_stronger",
    familyId: "strength",
    title: "Get stronger",
    helper: "General strength progression with sane volume and realistic loading.",
    goalText: "Get stronger",
    summary: "Get stronger with repeatable lifting",
    planningCategory: "strength",
    goalFamily: "strength",
    keywords: ["get stronger", "strength", "lifting", "general strength"],
    proxyMetrics: STRENGTH_PROXIES,
    legacyAliases: ["get_stronger"],
    specificityProfile: { summary: "Capture equipment, baseline, and weekly frequency so the first block fits real life.", questions: ["general_strength_profile"] },
  }),
  createIntent({
    id: "build_muscle",
    familyId: "strength",
    title: "Build muscle",
    helper: "Hypertrophy-first training with enough structure to progress credibly.",
    goalText: "Build muscle",
    summary: "Build muscle",
    planningCategory: "strength",
    goalFamily: "strength",
    keywords: ["build muscle", "gain muscle", "hypertrophy", "size"],
    proxyMetrics: STRENGTH_PROXIES,
    legacyAliases: ["gain_muscle", "upper_body_size"],
    specificityProfile: { summary: "Capture equipment, training age, and weekly frequency for the right split.", questions: ["muscle_gain_profile"] },
  }),
  createIntent({
    id: "improve_big_lifts",
    familyId: "strength",
    title: "Improve big lifts",
    helper: "Bench, squat, deadlift, overhead press, or pull-up focus without making it a novelty card.",
    goalText: "Improve a big lift",
    summary: "Improve a big lift",
    planningCategory: "strength",
    goalFamily: "strength",
    keywords: ["bench", "squat", "deadlift", "ohp", "overhead press", "pull up", "pull-up"],
    proxyMetrics: STRENGTH_PROXIES,
    legacyAliases: ["bench_225"],
    specificityProfile: { summary: "Capture the lift focus plus a recent top set so progression can be believable.", questions: ["lift_focus_profile"] },
  }),
  createIntent({
    id: "train_with_limited_equipment",
    familyId: "strength",
    title: "Train with limited equipment",
    helper: "Dumbbells, bands, bodyweight, or home setups without pretending you have a full gym.",
    goalText: "Get stronger with limited equipment",
    summary: "Get stronger with limited equipment",
    planningCategory: "strength",
    goalFamily: "strength",
    keywords: ["dumbbells only", "home gym", "limited equipment", "bodyweight", "bands"],
    proxyMetrics: STRENGTH_PROXIES,
    legacyAliases: ["dumbbell_muscle"],
    specificityProfile: { summary: "Capture what equipment is actually available so the plan doesn’t bluff.", questions: ["limited_equipment_profile"] },
  }),
  createIntent({
    id: "maintain_strength",
    familyId: "strength",
    title: "Maintain strength",
    helper: "Keep strength alive while another goal or a busy season takes the lead.",
    goalText: "Maintain strength",
    summary: "Maintain strength",
    planningCategory: "strength",
    goalFamily: "strength",
    keywords: ["maintain strength", "keep strength", "hold strength"],
    proxyMetrics: STRENGTH_PROXIES,
    legacyAliases: ["maintain_strength"],
    specificityProfile: { summary: "Capture the minimum equipment and schedule you can actually protect.", questions: ["strength_maintenance_profile"] },
  }),
  createIntent({
    id: "lose_body_fat",
    familyId: "physique",
    title: "Lose body fat",
    helper: "Fat-loss planning that protects recovery and doesn’t collapse into generic cardio spam.",
    goalText: "Lose body fat",
    summary: "Lose body fat",
    planningCategory: "body_comp",
    goalFamily: "body_comp",
    keywords: ["fat loss", "lose fat", "lose weight", "drop weight"],
    proxyMetrics: BODY_COMP_PROXIES,
    legacyAliases: ["lose_10_lb", "lose_20_lb", "safe_weight_loss_beginner"],
    specificityProfile: { summary: "Capture current bodyweight plus how aggressive the cut really needs to be.", questions: ["fat_loss_profile"] },
  }),
  createIntent({
    id: "get_leaner",
    familyId: "physique",
    title: "Get leaner",
    helper: "Leaner and more defined without forcing a fake exact-weight target.",
    goalText: "Get leaner",
    summary: "Get leaner",
    planningCategory: "body_comp",
    goalFamily: "appearance",
    keywords: ["leaner", "lean", "defined", "look better", "tone up", "look athletic", "look athletic again", "lean out", "more defined", "aesthetic"],
    proxyMetrics: BODY_COMP_PROXIES,
    legacyAliases: ["get_leaner", "tone_up", "look_athletic_again"],
    specificityProfile: { summary: "Capture one useful proxy and whether this is open-ended or tied to a date.", questions: ["leaner_profile"] },
  }),
  createIntent({
    id: "recomp",
    familyId: "physique",
    title: "Recomp",
    helper: "Body-composition change with enough training support to preserve or add muscle.",
    goalText: "Recomp",
    summary: "Recomp",
    planningCategory: "body_comp",
    goalFamily: "body_comp",
    keywords: ["recomp", "recomposition", "lose fat and gain muscle"],
    proxyMetrics: BODY_COMP_PROXIES,
    legacyAliases: ["recomp"],
    specificityProfile: { summary: "Capture current bodyweight and training availability so the plan chooses the right posture.", questions: ["recomp_profile"] },
  }),
  createIntent({
    id: "cut_for_event",
    familyId: "physique",
    title: "Cut for an event",
    helper: "Time-bound leaning out for a date, trip, wedding, or photo-heavy stretch.",
    goalText: "Cut for an event",
    summary: "Cut for an event",
    planningCategory: "body_comp",
    goalFamily: "appearance",
    keywords: ["cut for event", "cut for trip", "lean out for", "wedding", "photo shoot"],
    proxyMetrics: BODY_COMP_PROXIES,
    legacyAliases: ["wedding_leaner"],
    specificityProfile: { summary: "Capture the date pressure so the plan stays honest about pace and recovery.", questions: ["event_cut_profile"] },
  }),
  createIntent({
    id: "keep_strength_while_cutting",
    familyId: "physique",
    title: "Keep strength while cutting",
    helper: "Cut without pretending performance and recovery stay untouched.",
    goalText: "Maintain strength while losing fat",
    summary: "Maintain strength while losing fat",
    planningCategory: "body_comp",
    goalFamily: "hybrid",
    keywords: ["maintain strength while cutting", "keep strength while losing fat", "cut but keep strength"],
    proxyMetrics: BODY_COMP_PROXIES,
    specificityProfile: { summary: "Capture how much lifting you need to keep so the cut posture stays realistic.", questions: ["strength_retention_cut_profile"] },
  }),
  createIntent({
    id: "busy_life_body_comp",
    familyId: "physique",
    title: "Busy-life body composition",
    helper: "Body-composition progress when schedule realism matters more than a perfect split.",
    goalText: "Improve body composition on a busy schedule",
    summary: "Improve body composition on a busy schedule",
    planningCategory: "body_comp",
    goalFamily: "general_fitness",
    keywords: ["busy", "travel", "work schedule", "body composition"],
    proxyMetrics: BODY_COMP_PROXIES,
    specificityProfile: { summary: "Capture the realistic number of sessions so the plan does not overpromise.", questions: ["busy_body_comp_profile"] },
  }),
  createIntent({
    id: "get_back_in_shape",
    familyId: "general_fitness",
    title: "Get back in shape",
    helper: "A clean restart when you want real training again but not a specialty plan yet.",
    goalText: "Get back in shape",
    summary: "Get back in shape",
    planningCategory: "general_fitness",
    goalFamily: "general_fitness",
    keywords: ["back in shape", "get fit again", "restart fitness"],
    proxyMetrics: GENERAL_PROXIES,
    legacyAliases: ["get_back_in_shape"],
    specificityProfile: { summary: "Capture current capacity so the first block starts finishable, not aspirational.", questions: ["back_in_shape_profile"] },
  }),
  createIntent({
    id: "build_consistency",
    familyId: "general_fitness",
    title: "Build consistency",
    helper: "A repeatable training rhythm when adherence is the real bottleneck.",
    goalText: "Build consistency",
    summary: "Build consistency",
    planningCategory: "general_fitness",
    goalFamily: "general_fitness",
    keywords: ["consistency", "routine", "habit", "stick with it"],
    proxyMetrics: GENERAL_PROXIES,
    legacyAliases: ["build_energy"],
    specificityProfile: { summary: "Capture the honest weekly capacity instead of pretending motivation solves volume.", questions: ["consistency_profile"] },
  }),
  createIntent({
    id: "feel_more_athletic",
    familyId: "general_fitness",
    title: "Feel more athletic",
    helper: "General athleticism, movement confidence, and work-capacity without niche sport language.",
    goalText: "Feel more athletic",
    summary: "Feel more athletic",
    planningCategory: "general_fitness",
    goalFamily: "general_fitness",
    keywords: ["athletic", "move better", "athleticism", "feel fit"],
    proxyMetrics: GENERAL_PROXIES,
    specificityProfile: { summary: "Capture whether strength, conditioning, or athletic movement should lead the mix.", questions: ["athleticism_profile"] },
  }),
  createIntent({
    id: "improve_work_capacity",
    familyId: "general_fitness",
    title: "Improve work capacity",
    helper: "Better engine, better tolerance for training, and fewer dead sessions.",
    goalText: "Improve work capacity",
    summary: "Improve work capacity",
    planningCategory: "general_fitness",
    goalFamily: "general_fitness",
    keywords: ["work capacity", "conditioning", "engine", "not gassed"],
    proxyMetrics: GENERAL_PROXIES,
    specificityProfile: { summary: "Capture whether the work-capacity push should lean cardio, mixed circuits, or balanced training.", questions: ["work_capacity_profile"] },
  }),
  createIntent({
    id: "healthy_routine_fitness",
    familyId: "general_fitness",
    title: "Healthy routine fitness",
    helper: "A sustainable health-first routine when you want structure without over-specializing.",
    goalText: "Build a healthy routine",
    summary: "Build a healthy routine",
    planningCategory: "general_fitness",
    goalFamily: "general_fitness",
    keywords: ["healthy routine", "general health", "health", "longevity", "capable"],
    proxyMetrics: GENERAL_PROXIES,
    legacyAliases: ["capability_longevity"],
    specificityProfile: { summary: "Capture realistic time and equipment so the routine is durable.", questions: ["healthy_routine_profile"] },
  }),
  createIntent({
    id: "restart_safely",
    familyId: "re_entry",
    title: "Restart safely",
    helper: "A lower-friction restart when confidence or capacity is low.",
    goalText: "Restart safely",
    summary: "Restart safely",
    planningCategory: "general_fitness",
    goalFamily: "re_entry",
    keywords: ["restart safely", "safe restart", "start over", "ease in"],
    proxyMetrics: GENERAL_PROXIES,
    legacyAliases: ["learn_safely", "low_impact_start"],
    specificityProfile: { summary: "Capture what is repeatable right now so the plan protects momentum.", questions: ["safe_restart_profile"] },
  }),
  createIntent({
    id: "ease_back_in",
    familyId: "re_entry",
    title: "Ease back in",
    helper: "Return after time off without pretending the old baseline is still current.",
    goalText: "Ease back in",
    summary: "Ease back in",
    planningCategory: "general_fitness",
    goalFamily: "re_entry",
    keywords: ["ease back in", "time off", "return after time off"],
    proxyMetrics: GENERAL_PROXIES,
    specificityProfile: { summary: "Capture current tolerance and the main mode you want to bring back first.", questions: ["ease_back_in_profile"] },
  }),
  createIntent({
    id: "rebuild_routine",
    familyId: "re_entry",
    title: "Rebuild routine",
    helper: "Low-capacity consistency before the app asks for aggressive training.",
    goalText: "Rebuild routine",
    summary: "Rebuild routine",
    planningCategory: "general_fitness",
    goalFamily: "re_entry",
    keywords: ["rebuild routine", "routine rebuild", "consistency rebuild"],
    proxyMetrics: GENERAL_PROXIES,
    specificityProfile: { summary: "Capture how much routine you can protect each week right now.", questions: ["routine_rebuild_profile"] },
  }),
  createIntent({
    id: "conservative_return",
    familyId: "re_entry",
    title: "Conservative return",
    helper: "Protected return posture when the app should bias safer choices.",
    goalText: "Take a conservative return",
    summary: "Take a conservative return",
    planningCategory: "general_fitness",
    goalFamily: "re_entry",
    keywords: ["conservative return", "protected return", "careful return"],
    proxyMetrics: GENERAL_PROXIES,
    specificityProfile: { summary: "Capture the main lane you want back without overshooting capacity.", questions: ["conservative_return_profile"] },
  }),
  createIntent({
    id: "low_impact_restart",
    familyId: "re_entry",
    title: "Low-impact restart",
    helper: "Joint-sensitive or high-fatigue restarts that need lower-impact work first.",
    goalText: "Restart with low-impact training",
    summary: "Restart with low-impact training",
    planningCategory: "general_fitness",
    goalFamily: "re_entry",
    keywords: ["low impact", "joint friendly", "walk first", "low capacity"],
    proxyMetrics: GENERAL_PROXIES,
    specificityProfile: { summary: "Capture current repeatable capacity and preferred low-impact options.", questions: ["low_impact_restart_profile"] },
  }),
  createIntent({
    id: "run_and_lift",
    familyId: "hybrid",
    title: "Run and lift",
    helper: "A real hybrid path with clear priority tradeoffs and believable interference management.",
    goalText: "Run and lift at the same time",
    summary: "Run and lift at the same time",
    planningCategory: "running",
    goalFamily: "hybrid",
    keywords: ["run and lift", "hybrid athlete", "running and strength"],
    proxyMetrics: [...RUN_PROXIES, ...STRENGTH_PROXIES],
    specificityProfile: { summary: "Capture which lane leads, which lane is protected, and how many days are really available.", questions: ["run_lift_profile"] },
  }),
  createIntent({
    id: "stronger_and_fitter",
    familyId: "hybrid",
    title: "Stronger + fitter",
    helper: "Balanced strength and conditioning when neither lane is a pure side quest.",
    goalText: "Get stronger and fitter",
    summary: "Get stronger and fitter",
    planningCategory: "strength",
    goalFamily: "hybrid",
    keywords: ["stronger and fitter", "strength and conditioning", "hybrid fitness"],
    proxyMetrics: [...STRENGTH_PROXIES, ...GENERAL_PROXIES],
    specificityProfile: { summary: "Capture whether strength, conditioning, or balance should lead the week.", questions: ["stronger_fitter_profile"] },
  }),
  createIntent({
    id: "aesthetic_plus_endurance",
    familyId: "hybrid",
    title: "Aesthetic + endurance",
    helper: "Physique and endurance together with honest interference management.",
    goalText: "Build a leaner, more enduring profile",
    summary: "Build a leaner, more enduring profile",
    planningCategory: "body_comp",
    goalFamily: "hybrid",
    keywords: ["look athletic and run", "lean and endurance", "aesthetic plus endurance"],
    proxyMetrics: BODY_COMP_PROXIES,
    specificityProfile: { summary: "Capture which outcome gets first claim on recovery and how much running needs to stay present.", questions: ["aesthetic_endurance_profile"] },
  }),
  createIntent({
    id: "sport_support",
    familyId: "hybrid",
    title: "Sport support",
    helper: "Off-season or in-season support for field, court, or seasonal sports.",
    goalText: "Get fit for sport",
    summary: "Get fit for sport",
    planningCategory: "general_fitness",
    goalFamily: "hybrid",
    keywords: ["sport", "seasonal sport", "court sport", "field sport", "soccer", "basketball"],
    proxyMetrics: GENERAL_PROXIES,
    specificityProfile: { summary: "Capture the sport demand and the training qualities you can’t afford to lose.", questions: ["sport_support_profile"] },
  }),
  createIntent({
    id: "tactical_fitness",
    familyId: "hybrid",
    title: "Tactical fitness",
    helper: "Occupational fitness with strength, work capacity, and durability in the same plan.",
    goalText: "Train for tactical or occupational fitness",
    summary: "Train for tactical or occupational fitness",
    planningCategory: "general_fitness",
    goalFamily: "hybrid",
    keywords: ["tactical", "firefighter", "military", "occupational fitness", "academy"],
    proxyMetrics: GENERAL_PROXIES,
    specificityProfile: { summary: "Capture which quality matters most right now: strength, work capacity, or endurance.", questions: ["tactical_profile"] },
  }),
  createIntent({
    id: "seasonal_sport_support",
    familyId: "hybrid",
    title: "Seasonal sport support",
    helper: "Support a seasonal sport while protecting the main physical qualities that matter.",
    goalText: "Build fitness for a seasonal sport",
    summary: "Build fitness for a seasonal sport",
    planningCategory: "general_fitness",
    goalFamily: "hybrid",
    keywords: ["ski season", "seasonal sport", "hiking season", "sport prep"],
    proxyMetrics: GENERAL_PROXIES,
    specificityProfile: { summary: "Capture the season demand and the main quality that needs to improve first.", questions: ["seasonal_sport_profile"] },
  }),
]);

const INTENT_MAP = new Map(STRUCTURED_GOAL_INTENTS.map((intent) => [intent.id, intent]));
const LEGACY_INTENT_ALIAS_MAP = new Map(
  STRUCTURED_GOAL_INTENTS.flatMap((intent) => (intent.legacyAliases || []).map((alias) => [alias, intent.id]))
);

export const listStructuredGoalIntents = ({ familyId = "", includeHidden = false } = {}) => {
  const normalizedFamilyId = String(familyId || "").trim().toLowerCase();
  return STRUCTURED_GOAL_INTENTS
    .filter((intent) => includeHidden || !intent.hidden)
    .filter((intent) => !normalizedFamilyId || normalizedFamilyId === "all" || intent.familyId === normalizedFamilyId)
    .map((intent) => ({
      ...intent,
      keywords: [...intent.keywords],
      proxyMetrics: [...intent.proxyMetrics],
      legacyAliases: [...intent.legacyAliases],
      specificityProfile: {
        ...intent.specificityProfile,
        questions: [...(intent.specificityProfile?.questions || [])],
      },
    }));
};

export const findStructuredGoalIntentById = (intentId = "") => {
  const normalized = String(intentId || "").trim().toLowerCase();
  const canonicalId = LEGACY_INTENT_ALIAS_MAP.get(normalized) || normalized;
  const intent = INTENT_MAP.get(canonicalId);
  return intent
    ? {
        ...intent,
        keywords: [...intent.keywords],
        proxyMetrics: [...intent.proxyMetrics],
        legacyAliases: [...intent.legacyAliases],
        specificityProfile: {
          ...intent.specificityProfile,
          questions: [...(intent.specificityProfile?.questions || [])],
        },
      }
    : null;
};

export const resolveStructuredGoalIntentId = (intentId = "") => {
  const normalized = String(intentId || "").trim().toLowerCase();
  return LEGACY_INTENT_ALIAS_MAP.get(normalized) || (INTENT_MAP.has(normalized) ? normalized : "");
};

export const inferStructuredGoalIntentFromText = (text = "") => {
  const corpus = sanitizeCopy(text, 320).toLowerCase();
  if (!corpus) return null;
  if (/\bhybrid athlete\b|\brun and lift\b|\blift while training for (?:a )?(5k|10k|half marathon|marathon)\b|\bkeep running but get stronger\b|\bstronger first,? but i still want (?:a bit of )?running\b/i.test(corpus)) {
    return findStructuredGoalIntentById("run_and_lift");
  }
  if (/\b(stronger and fitter|strength and conditioning together|get stronger and improve conditioning)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("stronger_and_fitter");
  }
  if (/\b(aesthetic plus endurance|look athletic and keep my endurance|lose fat while preserving my running)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("aesthetic_plus_endurance");
  }
  if (/\b(get fit for soccer season|tactical fitness|sport support|field sport|court sport)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("sport_support");
  }
  if (/\b(improve my bench press|bench 225|get stronger at bench)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("improve_big_lifts");
  }
  if (/\b(i only have dumbbells|only have dumbbells|get stronger at home with minimal gear|minimal gear|limited equipment)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("train_with_limited_equipment");
  }
  if (/\b(cut for an event|lean out for a wedding|get leaner for a trip|lean out for a trip)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("cut_for_event");
  }
  if (/\b(travel a lot and still want to lean out|busy[- ]life body composition|short sessions.*body composition)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("busy_life_body_comp");
  }
  if (/\b(change my body composition without a crash diet)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("recomp");
  }
  if (/\b(ease back into training safely)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("restart_safely");
  }
  if (/\b(start training again without pretending i(?:['’]|â€™)?m where i used to be)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("rebuild_routine");
  }
  if (/\b(low-impact restart|start back with lower-impact training|joint-friendly sessions)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("low_impact_restart");
  }
  if (/\b(improve my conditioning and athleticism)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("feel_more_athletic");
  }
  if (/\b(5k|10k|half marathon|marathon|first 5k|first half|first marathon|race a stronger marathon|run a better marathon|faster half marathon|improve my half marathon time|get quicker for the half|quicker for the half|better marathon time|stronger marathon)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("train_for_run_race");
  }
  if (/\b(return to running|back to running|run again|start running again|get back to running)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("return_to_running");
  }
  if (/\b(swim for fitness|build swim endurance|swim endurance|swim a faster mile|swim faster|improve swim|better at longer swims|swimming to feel stronger|swim faster with repeatable technique|swim better)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("swim_better");
  }
  if (/\b(ride stronger|build cycling fitness|cycling fitness|get better on the bike|bike fitness|cycling base)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("ride_stronger");
  }
  if (/\b(triathlon|sprint tri|multisport)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("triathlon_multisport");
  }
  if (/\blook athletic again\b|\blook athletic\b|\btone up\b|\blean out\b|\bmore defined\b|\bvisible upper[- ]body aesthetics\b/i.test(corpus)) {
    return findStructuredGoalIntentById("get_leaner");
  }
  if (/\blose fat and gain muscle\b|\blose fat while gaining muscle\b|\brecomposition\b/i.test(corpus)) {
    return findStructuredGoalIntentById("recomp");
  }
  if (/\b(lose body fat|drop some fat|drop body fat)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("lose_body_fat");
  }
  if (/\b(keep strength while cutting|maintain strength while losing fat|lose fat but not get weak|cut but keep strength)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("keep_strength_while_cutting");
  }
  if (/\b(maintain strength(?! while losing fat)|keep my strength while life is busy|hold onto my strength for now)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("maintain_strength");
  }
  if (/\b(put on some size|add some size|gain some size)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("build_muscle");
  }
  if (/\b(get back to where i was|used to work out and now i['’]?m out of shape)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("get_back_in_shape");
  }
  if (/\b(simple healthy routine|healthy routine|stay fit while busy and traveling)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("healthy_routine_fitness");
  }
  if (/\b(actually stick to|build consistency)\b/i.test(corpus)) {
    return findStructuredGoalIntentById("build_consistency");
  }
  let bestIntent = null;
  let bestScore = 0;
  STRUCTURED_GOAL_INTENTS.forEach((intent) => {
    const score = (intent.keywords || []).reduce((sum, keyword) => {
      const pattern = keywordToPattern(keyword);
      return pattern?.test(corpus)
        ? sum + Math.max(1, Math.min(8, String(keyword || "").length))
        : sum;
    }, 0);
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent;
    }
  });
  return bestScore >= 6 ? findStructuredGoalIntentById(bestIntent?.id || "") : null;
};
