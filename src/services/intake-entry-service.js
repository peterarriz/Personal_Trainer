import {
  applyIntakeCompletenessAnswer,
  buildIntakeCompletenessDraft,
  validateIntakeCompletenessAnswer,
} from "./intake-completeness-service.js";
import {
  findGoalTemplateById,
} from "./goal-template-catalog-service.js";

const sanitizeText = (value = "", maxLength = 160) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

export const INTAKE_STAGE_CONTRACT = Object.freeze([
  Object.freeze({ key: "setup", label: "Setup", helper: "Choose what you want and the constraints that shape week one." }),
  Object.freeze({ key: "details", label: "Details", helper: "Add only the details that still change the first plan, then continue." }),
  Object.freeze({ key: "build", label: "Build", helper: "Create the first plan from the intake you just finished." }),
]);

export const INTAKE_COPY_DECK = Object.freeze({
  shell: Object.freeze({
    title: "Intake",
    progressSuffix: "Autosaves as you go.",
    helper: "Pick a goal path, answer the few details that really change week one, and keep moving.",
  }),
  summaryRail: Object.freeze({
    eyebrow: "Live summary",
    title: "What week one will use",
    helper: "This updates as you choose goals, constraints, and key anchors.",
  }),
  goals: Object.freeze({
    heroEyebrow: "START HERE",
    heroBody: "Choose the goal family that fits, then sharpen it with a few real-world details.",
    goalTypeHelper: "Start broad, then let the next card sharpen the plan.",
  }),
  interpretation: Object.freeze({
    title: "Draft",
    readyHelper: "Review the draft before adding more detail.",
    assessingHelper: "Resolving your priority order...",
    bannerEyebrow: "DRAFT ONLY",
    bannerHelper: "Nothing becomes final until you confirm.",
    emptyState: "Your resolved priorities will appear here once the draft is ready.",
  }),
  clarify: Object.freeze({
    helper: "Answer the details that still change week one, then continue from this same screen.",
    stackEyebrow: "CURRENT PRIORITIES",
    baselineNote: "Saved to your baselines so you can edit it later in Settings.",
    structuredToggle: "Structured",
    naturalToggle: "Free text",
    naturalPlaceholder: "Add the detail in your own words.",
    genericPlaceholder: "Add the detail.",
  }),
  confirm: Object.freeze({
    helper: "Review the intake details and continue when the stack looks right.",
  }),
  adjust: Object.freeze({
    title: "Adjust",
    helper: "Describe what should change.",
    placeholder: "Describe the change.",
  }),
  build: Object.freeze({
    helper: "Turning your intake into the first plan.",
    status: "Building the first plan...",
  }),
  footer: Object.freeze({
    goals: "Choose what you want and the real constraints around it.",
    interpretation: "Check the draft before adding more detail.",
    clarify: "Add any remaining details, review the stack here, and continue when it looks right.",
    confirm: "Review the stack and continue when it looks right.",
    building: "Building the first plan now.",
    adjust: "Describe the change, then continue.",
  }),
});

const STARTER_TYPES = Object.freeze([
  Object.freeze({
    id: "endurance",
    label: "Endurance",
    eyebrow: "Family",
    helper: "Race prep, aerobic base, swim, cycling, and multisport.",
    categoryId: "endurance",
    featuredTemplateIds: ["train_for_run_race", "build_endurance", "return_to_running", "swim_better", "ride_stronger"],
  }),
  Object.freeze({
    id: "strength",
    label: "Strength",
    eyebrow: "Family",
    helper: "Get stronger, build muscle, improve lifts, or train at home.",
    categoryId: "strength",
    featuredTemplateIds: ["get_stronger", "build_muscle", "improve_big_lifts", "train_with_limited_equipment", "maintain_strength"],
  }),
  Object.freeze({
    id: "physique",
    label: "Physique",
    eyebrow: "Family",
    helper: "Lose fat, get leaner, recomp, or cut without losing muscle.",
    categoryId: "physique",
    featuredTemplateIds: ["lose_body_fat", "get_leaner", "recomp", "cut_for_event", "keep_strength_while_cutting"],
  }),
  Object.freeze({
    id: "general_fitness",
    label: "General fitness",
    eyebrow: "Family",
    helper: "Get back in shape, build consistency, and feel more athletic.",
    categoryId: "general_fitness",
    featuredTemplateIds: ["get_back_in_shape", "build_consistency", "feel_more_athletic", "improve_work_capacity", "healthy_routine_fitness"],
  }),
  Object.freeze({
    id: "re_entry",
    label: "Re-entry",
    eyebrow: "Family",
    helper: "Restart safely, rebuild capacity, or return with a protected block.",
    categoryId: "re_entry",
    featuredTemplateIds: ["restart_safely", "ease_back_in", "rebuild_routine", "conservative_return", "low_impact_restart"],
  }),
  Object.freeze({
    id: "hybrid",
    label: "Hybrid",
    eyebrow: "Family",
    helper: "Run and lift, get stronger and fitter, or support a sport.",
    categoryId: "hybrid",
    featuredTemplateIds: ["run_and_lift", "stronger_and_fitter", "aesthetic_plus_endurance", "sport_support", "tactical_fitness"],
  }),
  Object.freeze({
    id: "custom",
    label: "Custom",
    eyebrow: "Custom",
    helper: "Use only when the structured paths truly miss the goal.",
    categoryId: "all",
    featuredTemplateIds: [],
  }),
]);

export const INTAKE_STARTER_GOAL_TYPES = STARTER_TYPES;

const STARTER_TYPE_BY_ID = new Map(STARTER_TYPES.map((item) => [item.id, item]));

const STARTER_TYPE_ALIASES = Object.freeze({
  running: "endurance",
  run: "endurance",
  swim: "endurance",
  swimming: "endurance",
  cycling: "endurance",
  cardio: "endurance",
  fat_loss: "physique",
  body_comp: "physique",
  physique: "physique",
  fitness: "general_fitness",
  restart: "re_entry",
});

const normalizeStarterTypeId = (goalTypeId = "") => {
  const normalized = sanitizeText(goalTypeId, 40).toLowerCase();
  return STARTER_TYPE_ALIASES[normalized] || normalized;
};

const choice = (value, label) => Object.freeze({ value, label });

const createQuestion = ({
  key = "",
  title = "",
  helper = "",
  fieldKeys = [],
  inputFields = [],
} = {}) => ({
  key,
  source: "completeness",
  title,
  helper,
  prompt: title,
  label: title,
  fieldKeys,
  inputFields,
});

const choiceField = (key, label, helperText, choiceOptions = [], required = false) => ({
  key,
  label,
  inputType: "choice_chips",
  helperText,
  required,
  choiceOptions,
});

const textField = (key, label, placeholder, helperText, required = false) => ({
  key,
  label,
  inputType: "text",
  placeholder,
  helperText,
  required,
});

const numberField = (key, label, placeholder, helperText, required = false, unit = "") => ({
  key,
  label,
  inputType: "number",
  placeholder,
  helperText,
  required,
  ...(unit ? { unit } : {}),
});

const RISK_OPTIONS = Object.freeze([
  choice("protective", "Protective"),
  choice("standard", "Standard"),
  choice("progressive", "Progressive"),
]);

const ENDURANCE_MODALITY_OPTIONS = Object.freeze([
  choice("running", "Running"),
  choice("cycling", "Cycling"),
  choice("conditioning", "Conditioning"),
]);

const EVENT_DISTANCE_OPTIONS = Object.freeze([
  choice("5k", "5K"),
  choice("10k", "10K"),
  choice("half_marathon", "Half marathon"),
  choice("marathon", "Marathon"),
]);

const SWIM_FOCUS_OPTIONS = Object.freeze([
  choice("fitness", "Fitness"),
  choice("endurance", "Endurance"),
  choice("technique", "Technique"),
  choice("open_water", "Open water"),
]);

const SWIM_ACCESS_OPTIONS = Object.freeze([
  choice("pool", "Pool"),
  choice("open_water", "Open water"),
  choice("both", "Both"),
]);

const EQUIPMENT_OPTIONS = Object.freeze([
  choice("full_gym", "Full gym"),
  choice("basic_gym", "Basic gym"),
  choice("dumbbells_only", "Dumbbells only"),
  choice("bands_bodyweight", "Bands/bodyweight"),
  choice("limited_home", "Limited home"),
  choice("travel", "Travel / hotel"),
]);

const TRAINING_AGE_OPTIONS = Object.freeze([
  choice("new_to_it", "New to it"),
  choice("returning", "Returning"),
  choice("intermediate", "Intermediate"),
  choice("advanced", "Advanced"),
]);

const LIFT_FOCUS_OPTIONS = Object.freeze([
  choice("bench", "Bench"),
  choice("squat", "Squat"),
  choice("deadlift", "Deadlift"),
  choice("ohp", "Overhead press"),
  choice("pull_up", "Pull-up"),
]);

const BODY_COMP_TEMPO_OPTIONS = Object.freeze([
  choice("steady", "Steady"),
  choice("event_cut", "Event cut"),
  choice("busy_life", "Busy life"),
  choice("recomp", "Recomp"),
]);

const MUSCLE_RETENTION_OPTIONS = Object.freeze([
  choice("high", "High"),
  choice("medium", "Medium"),
  choice("low", "Low"),
]);

const CARDIO_PREFERENCE_OPTIONS = Object.freeze([
  choice("low_impact", "Low impact"),
  choice("moderate", "Moderate"),
  choice("higher", "Higher"),
  choice("walks", "Mostly walks"),
]);

const STARTING_CAPACITY_OPTIONS = Object.freeze([
  choice("walk_only", "Walk only"),
  choice("10_easy_minutes", "10 easy min"),
  choice("20_to_30_minutes", "20 to 30 min"),
  choice("30_plus_minutes", "30+ min"),
]);

const HYBRID_PRIORITY_OPTIONS = Object.freeze([
  choice("running", "Running"),
  choice("strength", "Strength"),
  choice("balanced", "Balanced"),
]);

const GOAL_FOCUS_OPTIONS = Object.freeze([
  choice("consistency", "Consistency"),
  choice("athleticism", "Athleticism"),
  choice("work_capacity", "Work capacity"),
  choice("strength", "Strength"),
  choice("endurance", "Endurance"),
]);

const buildQuestionsForIntent = (selection = null) => {
  const intentId = sanitizeText(selection?.intentId || selection?.templateId || "", 80).toLowerCase();
  switch (intentId) {
    case "train_for_run_race":
      return [
        createQuestion({
          key: "endurance_race_profile",
          title: "Race setup",
          helper: "Choose the race distance and add the time window if you have it.",
          fieldKeys: ["event_distance", "target_timeline"],
          inputFields: [
            choiceField("event_distance", "Race distance", "Pick the race you want to train for.", EVENT_DISTANCE_OPTIONS, true),
            textField("target_timeline", "Race date or target month", "October 12 or early October", "A target month is enough to keep moving."),
          ],
        }),
        createQuestion({
          key: "running_baseline_profile",
          title: "Current running baseline",
          helper: "A few real running details sharpen the first block.",
          fieldKeys: ["current_run_frequency", "longest_recent_run", "recent_pace_baseline"],
          inputFields: [
            numberField("current_run_frequency", "Runs per week", "3", "How many times are you running in a normal week?", true),
            textField("longest_recent_run", "Longest recent run", "6 miles or 75 minutes", "Distance or duration is enough."),
            textField("recent_pace_baseline", "Recent pace or race result", "29:30 5K or 9:15 easy pace", "Optional if the long run already tells the story."),
          ],
        }),
      ];
    case "build_endurance":
    case "conditioning_builder":
      return [
        createQuestion({
          key: "endurance_base_profile",
          title: "Endurance setup",
          helper: "Pick the main mode and one recent anchor.",
          fieldKeys: ["primary_modality", "current_endurance_anchor", "longest_recent_endurance_session"],
          inputFields: [
            choiceField("primary_modality", "Main mode", "Choose the mode you most want the plan to lean on.", ENDURANCE_MODALITY_OPTIONS, true),
            textField("current_endurance_anchor", "Recent endurance anchor", "20 min ride, 2-mile run, or similar", "One recent anchor is enough."),
            textField("longest_recent_endurance_session", "Longest recent session", "45 min ride or 3-mile run", "Optional if the recent anchor already covers it."),
          ],
        }),
      ];
    case "return_to_running":
      return [
        createQuestion({
          key: "return_to_run_profile",
          title: "Return-to-run setup",
          helper: "Start where running is actually repeatable right now.",
          fieldKeys: ["starting_capacity_anchor", "progression_posture"],
          inputFields: [
            choiceField("starting_capacity_anchor", "Current repeatable capacity", "Pick the most honest starting point.", STARTING_CAPACITY_OPTIONS, true),
            choiceField("progression_posture", "Progression posture", "Protective keeps the first block more conservative.", RISK_OPTIONS, true),
          ],
        }),
      ];
    case "swim_better":
      return [
        createQuestion({
          key: "swim_profile",
          title: "Swim setup",
          helper: "Capture your water reality and the type of swim progress you want.",
          fieldKeys: ["recent_swim_anchor", "swim_access_reality", "goal_focus"],
          inputFields: [
            textField("recent_swim_anchor", "Recent swim anchor", "1000 yd in 22:30", "One recent distance or time is enough.", true),
            choiceField("swim_access_reality", "Water reality", "Choose where you actually swim right now.", SWIM_ACCESS_OPTIONS, true),
            choiceField("goal_focus", "Swim focus", "Fitness, endurance, technique, or open water.", SWIM_FOCUS_OPTIONS, false),
          ],
        }),
      ];
    case "ride_stronger":
      return [
        createQuestion({
          key: "cycling_profile",
          title: "Ride setup",
          helper: "Add one recent ride anchor so the plan can size week one honestly.",
          fieldKeys: ["primary_modality", "current_endurance_anchor", "longest_recent_endurance_session"],
          inputFields: [
            choiceField("primary_modality", "Mode", "This lane stays cycling-first.", [choice("cycling", "Cycling")], true),
            textField("current_endurance_anchor", "Recent ride anchor", "45 min ride or 15 miles", "One recent ride is enough.", true),
            textField("longest_recent_endurance_session", "Longest recent ride", "90 min ride", "Optional if the recent anchor already covers it."),
          ],
        }),
      ];
    case "triathlon_multisport":
      return [
        createQuestion({
          key: "triathlon_profile",
          title: "Triathlon setup",
          helper: "Pick the event flavor and the lane that needs the cleanest recovery.",
          fieldKeys: ["event_distance", "hybrid_priority", "recent_swim_anchor"],
          inputFields: [
            choiceField("event_distance", "Race format", "Sprint is the safest default if you are unsure.", [choice("sprint_triathlon", "Sprint"), choice("olympic_triathlon", "Olympic"), choice("70_3", "70.3")], true),
            choiceField("hybrid_priority", "Priority lane", "This lane gets the cleanest recovery in the plan.", [choice("swim", "Swim"), choice("bike", "Bike"), choice("run", "Run"), choice("balanced", "Balanced")], true),
            textField("recent_swim_anchor", "Recent swim anchor", "400 yd in 10:00", "One recent swim anchor keeps the first block honest."),
          ],
        }),
      ];
    case "get_stronger":
    case "build_muscle":
    case "train_with_limited_equipment":
    case "maintain_strength":
      return [
        createQuestion({
          key: "strength_setup_profile",
          title: "Strength setup",
          helper: "Pick the equipment, training age, and progression posture that match real life.",
          fieldKeys: ["equipment_profile", "training_age", "progression_posture"],
          inputFields: [
            choiceField("equipment_profile", "Equipment reality", "Choose the setup you actually have most weeks.", EQUIPMENT_OPTIONS, true),
            choiceField("training_age", "Training age", "How experienced are you in this lane?", TRAINING_AGE_OPTIONS, true),
            choiceField("progression_posture", "Progression posture", "Protective starts more conservatively.", RISK_OPTIONS, true),
          ],
        }),
      ];
    case "improve_big_lifts":
      return [
        createQuestion({
          key: "lift_focus_profile",
          title: "Lift focus",
          helper: "Choose the lift that matters and add one recent top set.",
          fieldKeys: ["lift_focus", "current_strength_baseline", "target_timeline"],
          inputFields: [
            choiceField("lift_focus", "Lift focus", "Pick the lift you want the plan to emphasize.", LIFT_FOCUS_OPTIONS, true),
            textField("current_strength_baseline", "Current top set", "185 x 5 or 225 single", "A recent top set or estimated max is enough.", true),
            textField("target_timeline", "Target date or window", "July or in 12 weeks", "Optional, but useful if the goal has a clear horizon."),
          ],
        }),
      ];
    case "lose_body_fat":
    case "get_leaner":
    case "recomp":
    case "cut_for_event":
    case "keep_strength_while_cutting":
    case "busy_life_body_comp":
      return [
        createQuestion({
          key: "body_comp_profile",
          title: "Body-composition setup",
          helper: "These choices decide whether the first block should bias retention, urgency, or simplicity.",
          fieldKeys: ["current_bodyweight", "body_comp_tempo", "muscle_retention_priority", "cardio_preference", "target_timeline"],
          inputFields: [
            numberField("current_bodyweight", "Current bodyweight", "185", "Closest recent scale weight is fine.", false, "lb"),
            choiceField("body_comp_tempo", "Tempo", "Steady is the default unless there is a real event deadline.", BODY_COMP_TEMPO_OPTIONS, true),
            choiceField("muscle_retention_priority", "Keep muscle / strength", "Higher keeps more lifting in the week.", MUSCLE_RETENTION_OPTIONS, true),
            choiceField("cardio_preference", "Cardio preference", "Choose the cardio dose you can actually recover from.", CARDIO_PREFERENCE_OPTIONS, true),
            textField("target_timeline", "Event date or window", "June wedding or in 10 weeks", "Only needed when this goal has a real deadline."),
          ],
        }),
      ];
    case "get_back_in_shape":
    case "build_consistency":
    case "feel_more_athletic":
    case "improve_work_capacity":
    case "healthy_routine_fitness":
      return [
        createQuestion({
          key: "general_fitness_profile",
          title: "General fitness setup",
          helper: "Keep the first block honest by choosing current capacity and the main quality you want to feel improve.",
          fieldKeys: ["starting_capacity_anchor", "goal_focus"],
          inputFields: [
            choiceField("starting_capacity_anchor", "Current repeatable capacity", "Pick the most honest starting point.", STARTING_CAPACITY_OPTIONS, true),
            choiceField("goal_focus", "Main quality", "This helps shape whether the first block feels more athletic, more routine-driven, or more work-capacity focused.", GOAL_FOCUS_OPTIONS, true),
          ],
        }),
      ];
    case "restart_safely":
    case "ease_back_in":
    case "rebuild_routine":
    case "conservative_return":
    case "low_impact_restart":
      return [
        createQuestion({
          key: "re_entry_profile",
          title: "Restart setup",
          helper: "Choose the current capacity and how conservative the first block should feel.",
          fieldKeys: ["starting_capacity_anchor", "progression_posture"],
          inputFields: [
            choiceField("starting_capacity_anchor", "Current repeatable capacity", "Pick the most honest starting point.", STARTING_CAPACITY_OPTIONS, true),
            choiceField("progression_posture", "Progression posture", "Protective keeps the week calmer and easier to repeat.", RISK_OPTIONS, true),
          ],
        }),
      ];
    case "run_and_lift":
    case "stronger_and_fitter":
    case "aesthetic_plus_endurance":
    case "sport_support":
    case "tactical_fitness":
      return [
        createQuestion({
          key: "hybrid_profile",
          title: "Hybrid setup",
          helper: "Pick the lane that gets the cleanest recovery so the plan does not pretend both goals can peak at once.",
          fieldKeys: ["hybrid_priority", "equipment_profile", "goal_focus"],
          inputFields: [
            choiceField("hybrid_priority", "Priority lane", "This lane gets the cleanest recovery and progression.", HYBRID_PRIORITY_OPTIONS, true),
            choiceField("equipment_profile", "Equipment reality", "Pick the setup you can actually count on.", EQUIPMENT_OPTIONS, true),
            choiceField("goal_focus", "Main support quality", "Use this when the hybrid goal leans athletic, tactical, or sport-support.", GOAL_FOCUS_OPTIONS, true),
          ],
        }),
      ];
    default:
      return [];
  }
};

export const buildIntakeStarterGoalTypes = () => STARTER_TYPES.map((item) => ({ ...item }));

export const getDefaultGoalLibraryCategoryForStarterType = (goalTypeId = "") => (
  STARTER_TYPE_BY_ID.get(normalizeStarterTypeId(goalTypeId))?.categoryId || "all"
);

export const listFeaturedIntakeGoalTemplates = ({ goalTypeId = "" } = {}) => (
  toArray(STARTER_TYPE_BY_ID.get(normalizeStarterTypeId(goalTypeId))?.featuredTemplateIds)
    .map((templateId) => findGoalTemplateById(templateId))
    .filter(Boolean)
);

export const inferIntakeStarterGoalTypeId = ({
  selection = null,
  answers = {},
} = {}) => {
  const cleanPrimaryGoal = sanitizeText(answers?.goal_intent || "", 220);
  if (!selection?.templateId) return cleanPrimaryGoal ? "custom" : "endurance";
  return sanitizeText(selection?.familyId || selection?.templateCategoryId || "", 40).toLowerCase() || "general_fitness";
};

export const buildIntakeStarterMetricQuestions = ({
  goalTypeId = "",
  selection = null,
} = {}) => {
  if (normalizeStarterTypeId(goalTypeId) === "custom") return [];
  return buildQuestionsForIntent(selection);
};

export const buildIntakeStarterMetricDraft = ({
  goalTypeId = "",
  selection = null,
  answers = {},
} = {}) => {
  const draft = {};
  buildIntakeStarterMetricQuestions({ goalTypeId, selection })
    .forEach((question) => {
      Object.assign(draft, buildIntakeCompletenessDraft({ question, answers }));
    });
  return draft;
};

const extractQuestionValues = (question = null, values = {}) => Object.fromEntries(
  toArray(question?.inputFields)
    .map((field) => sanitizeText(field?.key, 80))
    .filter(Boolean)
    .map((fieldKey) => [fieldKey, values?.[fieldKey] ?? ""])
);

const hasMeaningfulQuestionValue = (question = null, values = {}) => Object.values(extractQuestionValues(question, values))
  .some((value) => sanitizeText(value, 120));

export const applyIntakeStarterMetrics = ({
  answers = {},
  goalTypeId = "",
  selection = null,
  values = {},
} = {}) => {
  const questions = buildIntakeStarterMetricQuestions({ goalTypeId, selection });
  let nextAnswers = answers;
  const fieldErrors = {};
  const formErrors = [];
  const appliedQuestionKeys = [];

  questions.forEach((question) => {
    if (!hasMeaningfulQuestionValue(question, values)) return;
    const answerValues = extractQuestionValues(question, values);
    const validation = validateIntakeCompletenessAnswer({
      question,
      answerValues,
    });
    if (!validation.isValid) {
      Object.assign(fieldErrors, validation.fieldErrors || {});
      if (validation.formError) formErrors.push(validation.formError);
      return;
    }
    const applied = applyIntakeCompletenessAnswer({
      answers: nextAnswers,
      question,
      answerValues,
    });
    nextAnswers = applied.answers;
    appliedQuestionKeys.push(question.key);
  });

  return {
    answers: nextAnswers,
    fieldErrors,
    formErrors,
    appliedQuestionKeys,
    isValid: Object.keys(fieldErrors).length === 0 && formErrors.length === 0,
  };
};
