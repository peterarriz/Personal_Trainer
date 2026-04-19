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
  Object.freeze({ key: "setup", label: "Start", helper: "Pick your goal and week-one setup." }),
  Object.freeze({ key: "details", label: "Details", helper: "Add the details that still shape week one and your starting point." }),
  Object.freeze({ key: "build", label: "Your plan", helper: "Build your first week." }),
]);

export const INTAKE_COPY_DECK = Object.freeze({
  shell: Object.freeze({
    title: "Getting started",
    progressSuffix: "Saves as you go.",
    helper: "Pick your goal, add the details that shape your first week, and build when it looks right.",
  }),
  summaryRail: Object.freeze({
    eyebrow: "Live summary",
    title: "What your first week is built on",
    helper: "Updates as you choose goals and key details.",
  }),
  goals: Object.freeze({
    heroEyebrow: "START HERE",
    heroBody: "Choose the goal path that fits, add the numbers that matter, and build from this screen.",
    goalTypeHelper: "Start broad, then tighten it up.",
  }),
  interpretation: Object.freeze({
    title: "Draft",
    readyHelper: "Check the draft before you add more detail.",
    assessingHelper: "Lining up your priorities...",
    bannerEyebrow: "DRAFT",
    bannerHelper: "You can still change this before you continue.",
    emptyState: "Your first draft will show up here.",
  }),
  clarify: Object.freeze({
    helper: "Answer the details that still shape week one and your starting point.",
    stackEyebrow: "CURRENT PRIORITIES",
    baselineNote: "Saved in Settings so you can change it later.",
    structuredToggle: "Quick picks",
    naturalToggle: "Write it myself",
    naturalPlaceholder: "Add the detail in your own words.",
    genericPlaceholder: "Add the detail.",
  }),
  confirm: Object.freeze({
    helper: "Give it one last look, then continue.",
  }),
  adjust: Object.freeze({
    title: "Make a change",
    helper: "Describe the change.",
    placeholder: "Describe the change.",
  }),
  build: Object.freeze({
    helper: "Building your first week.",
    status: "Creating your first plan...",
  }),
  footer: Object.freeze({
    goals: "Choose your goal, add the key details, and build from here when it looks right.",
    interpretation: "Check the draft before you add more detail.",
    clarify: "Add anything that still shapes week one or your current baseline.",
    confirm: "One last look before you build.",
    building: "Building week one now.",
    adjust: "Describe the change, then continue.",
  }),
});

const STARTER_TYPES = Object.freeze([
  Object.freeze({
    id: "endurance",
    label: "Endurance",
    eyebrow: "Family",
    helper: "Race prep, base, swim, bike, and multisport.",
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
    helper: "Lose fat, get leaner, or recomp.",
    categoryId: "physique",
    featuredTemplateIds: ["lose_body_fat", "get_leaner", "recomp", "cut_for_event", "keep_strength_while_cutting"],
  }),
  Object.freeze({
    id: "general_fitness",
    label: "General fitness",
    eyebrow: "Family",
    helper: "Build consistency and feel more athletic.",
    categoryId: "general_fitness",
    featuredTemplateIds: ["get_back_in_shape", "build_consistency", "feel_more_athletic", "improve_work_capacity", "healthy_routine_fitness"],
  }),
  Object.freeze({
    id: "re_entry",
    label: "Re-entry",
    eyebrow: "Family",
    helper: "Restart safely and rebuild capacity.",
    categoryId: "re_entry",
    featuredTemplateIds: ["restart_safely", "ease_back_in", "rebuild_routine", "conservative_return", "low_impact_restart"],
  }),
  Object.freeze({
    id: "hybrid",
    label: "Hybrid",
    eyebrow: "Family",
    helper: "Run and lift, or get stronger and fitter.",
    categoryId: "hybrid",
    featuredTemplateIds: ["run_and_lift", "stronger_and_fitter", "aesthetic_plus_endurance", "sport_support", "tactical_fitness"],
  }),
  Object.freeze({
    id: "custom",
    label: "Custom",
    eyebrow: "Custom",
    helper: "Use this if the preset paths miss.",
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
  answerValueTransform = null,
  draftValueTransform = null,
  fieldErrorMap = {},
} = {}) => ({
  key,
  source: "completeness",
  title,
  helper,
  prompt: title,
  label: title,
  fieldKeys,
  inputFields,
  answerValueTransform: typeof answerValueTransform === "function" ? answerValueTransform : null,
  draftValueTransform: typeof draftValueTransform === "function" ? draftValueTransform : null,
  fieldErrorMap: fieldErrorMap && typeof fieldErrorMap === "object" ? { ...fieldErrorMap } : {},
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

const parseDistanceOrDurationDraft = (value = "") => {
  const raw = sanitizeText(value, 160);
  if (!raw) return { value: "", unit: "" };
  const milesMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/i);
  if (milesMatch?.[1]) {
    return {
      value: String(milesMatch[1]).trim(),
      unit: "miles",
    };
  }
  const minutesMatch = raw.match(/(\d+(?:\.\d+)?)\s*(?:min|mins|minute|minutes)\b/i);
  if (minutesMatch?.[1]) {
    return {
      value: String(minutesMatch[1]).trim(),
      unit: "minutes",
    };
  }
  return { value: "", unit: "" };
};

const buildDistanceOrDurationRaw = ({ value = "", unit = "" } = {}) => {
  const cleanValue = sanitizeText(value, 40);
  const cleanUnit = sanitizeText(unit, 40).toLowerCase();
  if (!cleanValue || !cleanUnit) return "";
  if (cleanUnit === "miles") return `${cleanValue} miles`;
  if (cleanUnit === "minutes") return `${cleanValue} minutes`;
  return "";
};

const parseSwimAnchorDraft = (value = "") => {
  const raw = sanitizeText(value, 160);
  if (!raw) {
    return {
      distanceValue: "",
      distanceUnit: "yd",
      minutes: "",
      seconds: "",
    };
  }
  const distanceMatch = raw.match(/(\d+(?:\.\d+)?)\s*(yd|yard|yards|m|meter|meters|metre|metres)\b/i);
  const timeMatch = raw.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\b/);
  return {
    distanceValue: distanceMatch?.[1] ? String(distanceMatch[1]).trim() : "",
    distanceUnit: distanceMatch?.[2] && /yd|yard/i.test(distanceMatch[2]) ? "yd" : "m",
    minutes: timeMatch?.[1] ? String(Number(timeMatch[1])) : "",
    seconds: timeMatch?.[2] ? String(timeMatch[2]).padStart(2, "0") : "",
  };
};

const buildSwimAnchorRaw = ({
  distanceValue = "",
  distanceUnit = "",
  minutes = "",
  seconds = "",
} = {}) => {
  const cleanDistance = sanitizeText(distanceValue, 40);
  const cleanUnit = sanitizeText(distanceUnit, 20).toLowerCase();
  const cleanMinutes = sanitizeText(minutes, 20);
  const cleanSeconds = sanitizeText(seconds, 20);
  if (!cleanDistance || !cleanUnit || cleanMinutes === "" || cleanSeconds === "") return "";
  const parsedSeconds = Number(cleanSeconds);
  if (!Number.isFinite(parsedSeconds) || parsedSeconds < 0 || parsedSeconds > 59) return "";
  const paddedSeconds = String(Math.round(parsedSeconds)).padStart(2, "0");
  return `${cleanDistance} ${cleanUnit} in ${cleanMinutes}:${paddedSeconds}`;
};

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

const RUN_BASELINE_UNIT_OPTIONS = Object.freeze([
  choice("miles", "Miles"),
  choice("minutes", "Minutes"),
]);

const SWIM_DISTANCE_UNIT_OPTIONS = Object.freeze([
  choice("yd", "Yards"),
  choice("m", "Meters"),
]);

const GOAL_FOCUS_OPTIONS = Object.freeze([
  choice("consistency", "Consistency"),
  choice("athleticism", "Athleticism"),
  choice("work_capacity", "Work capacity"),
  choice("strength", "Strength"),
  choice("endurance", "Endurance"),
]);

const resolveStarterPresetValues = (selection = null) => {
  const intentId = sanitizeText(selection?.intentId || selection?.templateId || "", 80).toLowerCase();
  const specificityDefaults = selection?.specificityDefaults && typeof selection.specificityDefaults === "object"
    ? selection.specificityDefaults
    : {};
  const nextValues = {};
  if (intentId === "train_for_run_race" && specificityDefaults?.event_distance) {
    nextValues.event_distance = sanitizeText(specificityDefaults.event_distance, 40);
  }
  if (intentId === "improve_big_lifts") {
    if (specificityDefaults?.lift_focus) {
      nextValues.lift_focus = sanitizeText(specificityDefaults.lift_focus, 40);
    }
    if (selection?.primaryMetric?.targetValue) {
      nextValues.lift_target_weight = sanitizeText(selection.primaryMetric.targetValue, 40);
    }
  }
  if (intentId === "swim_better" && specificityDefaults?.goal_focus) {
    nextValues.goal_focus = sanitizeText(specificityDefaults.goal_focus, 40);
  }
  return nextValues;
};

const applyStarterPresetVisibility = (question = null, presetValues = {}) => {
  return question;
};

const buildQuestionsForIntent = (selection = null) => {
  const intentId = sanitizeText(selection?.intentId || selection?.templateId || "", 80).toLowerCase();
  const presetValues = resolveStarterPresetValues(selection);
  switch (intentId) {
    case "train_for_run_race":
      return [
        applyStarterPresetVisibility(createQuestion({
          key: "endurance_race_profile",
          title: "Race setup",
          helper: "Pick the distance and timing.",
          fieldKeys: ["event_distance", "target_timeline"],
          inputFields: [
            choiceField("event_distance", "Race distance", "Pick the race you want to train for.", EVENT_DISTANCE_OPTIONS, true),
            textField("target_timeline", "Race date or target month", "October 12 or early October", "A target month is enough to keep moving."),
          ],
        }), presetValues),
        createQuestion({
          key: "running_baseline",
          title: "Current running baseline",
          helper: "Use the weekly run count plus one recent long-run anchor.",
          fieldKeys: ["current_run_frequency", "longest_recent_run", "recent_pace_baseline"],
          inputFields: [
            numberField("current_run_frequency", "Runs per week", "3", "How many times are you running in a normal week?", true),
            numberField("longest_recent_run_value", "Longest recent run", "7", "Use the longest repeatable run you have done recently.", true),
            choiceField("longest_recent_run_unit", "Unit", "Choose miles or minutes.", RUN_BASELINE_UNIT_OPTIONS, true),
            textField("recent_pace_baseline", "Recent pace or race result", "Optional", "Only add this if you already know it."),
          ],
          answerValueTransform: (values = {}) => ({
            current_run_frequency: values.current_run_frequency || "",
            longest_recent_run: buildDistanceOrDurationRaw({
              value: values.longest_recent_run_value,
              unit: values.longest_recent_run_unit,
            }),
            recent_pace_baseline: values.recent_pace_baseline || "",
          }),
          draftValueTransform: ({ answers = {} } = {}) => {
            const longestRunDraft = parseDistanceOrDurationDraft(
              answers?.intake_completeness?.fields?.longest_recent_run?.raw
              || answers?.intake_completeness?.fields?.longest_recent_run?.value
              || ""
            );
            return {
              current_run_frequency: answers?.intake_completeness?.fields?.current_run_frequency?.value ?? "",
              longest_recent_run_value: longestRunDraft.value,
              longest_recent_run_unit: longestRunDraft.unit,
              recent_pace_baseline: answers?.intake_completeness?.fields?.recent_pace_baseline?.raw || "",
            };
          },
          fieldErrorMap: {
            longest_recent_run: "longest_recent_run_value",
          },
        }),
      ];
    case "build_endurance":
    case "conditioning_builder":
      return [
        createQuestion({
          key: "endurance_base_profile",
          title: "Endurance setup",
          helper: "Pick the mode and one recent anchor.",
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
          helper: "Start where running is repeatable right now.",
          fieldKeys: ["starting_capacity_anchor", "progression_posture"],
          inputFields: [
            choiceField("starting_capacity_anchor", "Current repeatable capacity", "Pick the most honest starting point.", STARTING_CAPACITY_OPTIONS, true),
            choiceField("progression_posture", "Progression feel", "Protective keeps your first week more conservative.", RISK_OPTIONS, true),
          ],
        }),
      ];
    case "swim_better":
      return [
        applyStarterPresetVisibility(createQuestion({
          key: "swim_baseline",
          title: "Swim setup",
          helper: "Add one recent swim anchor and where you actually swim right now.",
          fieldKeys: ["recent_swim_anchor", "swim_access_reality", "goal_focus"],
          inputFields: [
            numberField("recent_swim_distance_value", "Recent swim distance", "1000", "Use one recent repeatable distance.", true),
            choiceField("recent_swim_distance_unit", "Distance unit", "Choose yards or meters.", SWIM_DISTANCE_UNIT_OPTIONS, true),
            numberField("recent_swim_time_minutes", "Minutes", "22", "Use the time for that recent swim anchor.", true),
            numberField("recent_swim_time_seconds", "Seconds", "30", "Seconds for the swim anchor.", true),
            choiceField("swim_access_reality", "Water reality", "Choose where you actually swim right now.", SWIM_ACCESS_OPTIONS, true),
            choiceField("goal_focus", "Swim focus", "Fitness, endurance, technique, or open water.", SWIM_FOCUS_OPTIONS, false),
          ],
          answerValueTransform: (values = {}) => ({
            recent_swim_anchor: buildSwimAnchorRaw({
              distanceValue: values.recent_swim_distance_value,
              distanceUnit: values.recent_swim_distance_unit,
              minutes: values.recent_swim_time_minutes,
              seconds: values.recent_swim_time_seconds,
            }),
            swim_access_reality: values.swim_access_reality || "",
            goal_focus: values.goal_focus || "",
          }),
          draftValueTransform: ({ answers = {} } = {}) => {
            const swimDraft = parseSwimAnchorDraft(
              answers?.intake_completeness?.fields?.recent_swim_anchor?.raw
              || answers?.intake_completeness?.fields?.recent_swim_anchor?.value
              || ""
            );
            return {
              recent_swim_distance_value: swimDraft.distanceValue,
              recent_swim_distance_unit: swimDraft.distanceUnit,
              recent_swim_time_minutes: swimDraft.minutes,
              recent_swim_time_seconds: swimDraft.seconds,
              swim_access_reality: answers?.intake_completeness?.fields?.swim_access_reality?.value || "",
              goal_focus: answers?.intake_completeness?.fields?.goal_focus?.value || "",
            };
          },
          fieldErrorMap: {
            recent_swim_anchor: "recent_swim_distance_value",
          },
        }), presetValues),
      ];
    case "ride_stronger":
      return [
        createQuestion({
          key: "cycling_profile",
          title: "Ride setup",
          helper: "Add one recent ride anchor.",
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
          helper: "Pick the race and priority lane.",
          fieldKeys: ["event_distance", "hybrid_priority", "recent_swim_anchor"],
          inputFields: [
            choiceField("event_distance", "Race format", "Sprint is the safest default if you are unsure.", [choice("sprint_triathlon", "Sprint"), choice("olympic_triathlon", "Olympic"), choice("70_3", "70.3")], true),
            choiceField("hybrid_priority", "Priority lane", "This lane gets the cleanest recovery in the plan.", [choice("swim", "Swim"), choice("bike", "Bike"), choice("run", "Run"), choice("balanced", "Balanced")], true),
            textField("recent_swim_anchor", "Recent swim anchor", "400 yd in 10:00", "One recent swim anchor keeps your first week realistic."),
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
          helper: "Pick your setup and training age.",
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
        applyStarterPresetVisibility(createQuestion({
          key: "lift_focus_profile",
          title: "Lift focus",
          helper: "Pick the lift, the target load, and the time horizon.",
          fieldKeys: ["lift_focus", "lift_target_weight", "lift_target_reps", "target_timeline"],
          inputFields: [
            choiceField("lift_focus", "Lift focus", "Pick the lift you want the plan to emphasize.", LIFT_FOCUS_OPTIONS, true),
            numberField("lift_target_weight", "Target load", "Type your target load", "Enter your own number here. Example: 225 lb.", true, "lb"),
            numberField("lift_target_reps", "Target reps", "Type target reps", "Enter your own rep target here. Example: 1 or 5. Leave it blank only if the target is truly a single.", false),
            textField("target_timeline", "Time horizon", "July or in 12 weeks", "A rough horizon is enough.", true),
          ],
        }), presetValues),
        createQuestion({
          key: "strength_baseline",
          title: "Current lift baseline",
          helper: "Add the most honest recent number you have for this lift.",
          fieldKeys: ["current_strength_baseline"],
          inputFields: [
            numberField("current_strength_baseline_weight", "Current load", "185", "Use a recent top set or estimated max.", true, "lb"),
            numberField("current_strength_baseline_reps", "Current reps", "5", "Optional if you only know the load.", false),
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
          helper: "These choices shape how aggressive week one should feel.",
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
          helper: "Pick your current capacity and focus.",
          fieldKeys: ["starting_capacity_anchor", "goal_focus"],
          inputFields: [
            choiceField("starting_capacity_anchor", "Current repeatable capacity", "Pick the most honest starting point.", STARTING_CAPACITY_OPTIONS, true),
            choiceField("goal_focus", "Main quality", "This helps shape whether your first week feels more athletic, more routine-driven, or more work-capacity focused.", GOAL_FOCUS_OPTIONS, true),
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
          helper: "Pick your current capacity and starting pace.",
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
          helper: "Pick the lane that leads and add the minimum details that keep the split believable.",
          fieldKeys: ["hybrid_priority", "equipment_profile", "current_run_frequency", "goal_focus"],
          inputFields: [
            choiceField("hybrid_priority", "Priority lane", "This lane gets the cleanest recovery and progression.", HYBRID_PRIORITY_OPTIONS, true),
            choiceField("equipment_profile", "Equipment reality", "Pick the setup you can actually count on.", EQUIPMENT_OPTIONS, true),
            numberField("current_run_frequency", "Run sessions per week", "2", "Set this to the number of runs you can actually support right now.", true),
            choiceField("goal_focus", "Main support quality", "Use this when the hybrid goal leans athletic, tactical, or sport-support.", GOAL_FOCUS_OPTIONS, true),
          ],
        }),
        createQuestion({
          key: "strength_baseline",
          title: "Strength baseline",
          helper: "Add a recent top set or estimated max so the lift side of the split starts from something real.",
          fieldKeys: ["current_strength_baseline"],
          inputFields: [
            numberField("current_strength_baseline_weight", "Current load", "185", "Use the best recent number you trust for the lift side.", true, "lb"),
            numberField("current_strength_baseline_reps", "Current reps", "5", "Optional if you only know the load.", false),
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

export const buildIntakeStarterFieldSchema = ({
  goalTypeId = "",
  selection = null,
} = {}) => (
  buildIntakeStarterMetricQuestions({ goalTypeId, selection }).map((question) => ({
    key: question.key,
    title: question.title,
    helper: question.helper,
    fieldKeys: [...(question.fieldKeys || [])],
    fields: (Array.isArray(question.inputFields) ? question.inputFields : []).map((field) => ({
      ...field,
    })),
  }))
);

export const buildIntakeStarterMetricDraft = ({
  goalTypeId = "",
  selection = null,
  answers = {},
} = {}) => {
  const draft = {};
  const presetValues = resolveStarterPresetValues(selection);
  buildIntakeStarterMetricQuestions({ goalTypeId, selection })
    .forEach((question) => {
      if (typeof question?.draftValueTransform === "function") {
        Object.assign(draft, question.draftValueTransform({ answers }));
      } else {
        Object.assign(draft, buildIntakeCompletenessDraft({ question, answers }));
      }
    });
  Object.entries(presetValues).forEach(([fieldKey, fieldValue]) => {
    if (!sanitizeText(draft?.[fieldKey], 80)) {
      draft[fieldKey] = fieldValue;
    }
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
  const presetValues = resolveStarterPresetValues(selection);
  let nextAnswers = answers;
  const fieldErrors = {};
  const formErrors = [];
  const appliedQuestionKeys = [];

  questions.forEach((question) => {
    const rawAnswerValues = {
      ...Object.fromEntries(
        toArray(question?.fieldKeys)
          .map((fieldKey) => sanitizeText(fieldKey, 80))
          .filter(Boolean)
          .map((fieldKey) => [fieldKey, presetValues?.[fieldKey] ?? ""])
      ),
      ...extractQuestionValues(question, values),
    };
    if (!Object.values(rawAnswerValues).some((value) => sanitizeText(value, 120))) return;
    const answerValues = typeof question?.answerValueTransform === "function"
      ? question.answerValueTransform(rawAnswerValues)
      : rawAnswerValues;
    const validation = validateIntakeCompletenessAnswer({
      question,
      answerValues,
    });
    if (!validation.isValid) {
      Object.entries(validation.fieldErrors || {}).forEach(([fieldKey, message]) => {
        const mappedFieldKey = question?.fieldErrorMap?.[fieldKey] || fieldKey;
        fieldErrors[mappedFieldKey] = message;
      });
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
