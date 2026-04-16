import {
  applyIntakeCompletenessAnswer,
  buildIntakeCompletenessDraft,
  INTAKE_COMPLETENESS_FIELDS,
  INTAKE_COMPLETENESS_QUESTION_KEYS,
  INTAKE_COMPLETENESS_VALUE_TYPES,
  validateIntakeCompletenessAnswer,
} from "./intake-completeness-service.js";
import {
  findGoalTemplateById,
} from "./goal-template-catalog-service.js";

const sanitizeText = (value = "", maxLength = 160) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

export const INTAKE_STAGE_CONTRACT = Object.freeze([
  Object.freeze({
    key: "goal_setup",
    label: "Goals",
    helper: "Choose the goal path and the realities that shape week one.",
  }),
  Object.freeze({
    key: "needed_details",
    label: "Details",
    helper: "Add only the details that still change the first plan.",
  }),
  Object.freeze({
    key: "review",
    label: "Confirm",
    helper: "Check the resolved priority order before build.",
  }),
  Object.freeze({
    key: "build",
    label: "Build",
    helper: "Create the first plan from the confirmed setup.",
  }),
]);

export const INTAKE_COPY_DECK = Object.freeze({
  shell: Object.freeze({
    title: "Setup",
    progressSuffix: "Draft until you confirm.",
    helper: "Set priorities fast. Add detail only where it changes the first plan.",
  }),
  summaryRail: Object.freeze({
    eyebrow: "Current draft",
    title: "What the plan will use",
    helper: "Draft only until you confirm the stack.",
  }),
  goals: Object.freeze({
    heroEyebrow: "DIRECT SETUP",
    heroBody: "Choose a goal type, select the mapped path, then add only the inputs that sharpen week one.",
    goalTypeHelper: "Start with the goal type, then pick a mapped goal instead of writing a full brief.",
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
    helper: "Add only the details that still change the first plan.",
    stackEyebrow: "CURRENT DRAFT",
    baselineNote: "Saved to your baselines so you can edit it later in Settings.",
    structuredToggle: "Structured",
    naturalToggle: "Free text",
    naturalPlaceholder: "Add the detail in your own words.",
    genericPlaceholder: "Add the detail.",
  }),
  confirm: Object.freeze({
    helper: "Confirm the priority order before we build.",
  }),
  adjust: Object.freeze({
    title: "Adjust",
    helper: "Describe what should change.",
    placeholder: "Describe the change.",
  }),
  build: Object.freeze({
    helper: "Turning the confirmed priorities into the first plan.",
    status: "Building the first plan...",
  }),
  footer: Object.freeze({
    goals: "Choose the goal path, then add only the details that shape week one.",
    interpretation: "Check the draft before adding more detail.",
    clarify: "Add only the remaining details that still change planning.",
    confirm: "Confirm the priority order so the first plan starts from the right stack.",
    building: "Building the first plan now.",
    adjust: "Describe the change, then continue.",
  }),
});

export const INTAKE_STARTER_GOAL_TYPES = Object.freeze([
  Object.freeze({
    id: "running",
    label: "Running",
    eyebrow: "Goal type",
    helper: "5K to marathon, return-to-run, or simple cardio consistency.",
    categoryId: "running",
    featuredTemplateIds: ["run_first_5k", "run_faster_5k", "half_marathon", "marathon", "return_to_running"],
  }),
  Object.freeze({
    id: "strength",
    label: "Strength",
    eyebrow: "Goal type",
    helper: "Exact lift targets, muscle gain, or getting stronger overall.",
    categoryId: "strength",
    featuredTemplateIds: ["bench_225", "get_stronger", "gain_muscle", "upper_body_size", "maintain_strength"],
  }),
  Object.freeze({
    id: "fat_loss",
    label: "Fat loss",
    eyebrow: "Goal type",
    helper: "Weight loss, leaning out, or looking athletic again.",
    categoryId: "physique",
    featuredTemplateIds: ["lose_10_lb", "get_leaner", "look_athletic_again", "recomp", "wedding_leaner"],
  }),
  Object.freeze({
    id: "swim",
    label: "Swimming",
    eyebrow: "Goal type",
    helper: "Pool benchmarks, open-water goals, and swim durability.",
    categoryId: "swim",
    featuredTemplateIds: ["swim_faster_mile", "swim_speed_standard_distance", "open_water_swim", "swim_endurance", "swim_shoulder_friendly"],
  }),
  Object.freeze({
    id: "general_fitness",
    label: "General fitness",
    eyebrow: "Goal type",
    helper: "Get back in shape, move better, feel better, and stay consistent.",
    categoryId: "health",
    featuredTemplateIds: ["get_back_in_shape", "build_energy", "capability_longevity", "learn_safely", "low_impact_start"],
  }),
  Object.freeze({
    id: "custom",
    label: "Custom",
    eyebrow: "Custom",
    helper: "Write your own goal when the library does not fit.",
    categoryId: "all",
    featuredTemplateIds: [],
  }),
]);

const STARTER_TYPE_BY_ID = new Map(INTAKE_STARTER_GOAL_TYPES.map((item) => [item.id, item]));

const STARTER_TYPE_BY_CATEGORY_ID = Object.freeze({
  running: "running",
  strength: "strength",
  physique: "fat_loss",
  swim: "swim",
  health: "general_fitness",
});

const STARTER_TYPE_BY_PLANNING_CATEGORY = Object.freeze({
  running: "running",
  strength: "strength",
  body_comp: "fat_loss",
  general_fitness: "general_fitness",
});

const SWIM_REALITY_OPTIONS = Object.freeze([
  Object.freeze({ value: "pool", label: "Pool" }),
  Object.freeze({ value: "open_water", label: "Open water" }),
  Object.freeze({ value: "both", label: "Both" }),
]);

const STARTING_CAPACITY_OPTIONS = Object.freeze([
  Object.freeze({ value: "walk_only", label: "Walk only" }),
  Object.freeze({ value: "10_easy_minutes", label: "10 easy min" }),
  Object.freeze({ value: "20_to_30_minutes", label: "20 to 30 min" }),
  Object.freeze({ value: "30_plus_minutes", label: "30+ min" }),
]);

const APPEARANCE_PROXY_OPTIONS = Object.freeze([
  Object.freeze({ value: "skip_for_now", label: "Skip for now" }),
]);

const createQuestion = ({
  key = "",
  title = "",
  helper = "",
  fieldKeys = [],
  inputFields = [],
  expectedValueType = "",
  validation = null,
} = {}) => ({
  key,
  source: "completeness",
  title,
  helper,
  prompt: title,
  label: title,
  fieldKeys,
  inputFields,
  expectedValueType,
  validation,
});

const buildTimelineQuestion = ({
  title = "Target date or time window",
  helper = "Optional now, but useful when the first block needs a clearer horizon.",
} = {}) => createQuestion({
  key: INTAKE_COMPLETENESS_QUESTION_KEYS.runningTiming,
  title,
  helper,
  fieldKeys: [INTAKE_COMPLETENESS_FIELDS.targetTimeline],
  expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.targetTimeline,
  validation: {
    kind: "target_timeline",
    message: "Enter a target date, month, season, or rough time window.",
  },
  inputFields: [
    {
      key: INTAKE_COMPLETENESS_FIELDS.targetTimeline,
      label: "Target date or time window",
      inputType: "text",
      placeholder: "October 12, late summer, or open-ended",
      helperText: helper,
      required: false,
      expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.targetTimeline,
    },
  ],
});

const buildRunningBaselineQuestion = () => createQuestion({
  key: INTAKE_COMPLETENESS_QUESTION_KEYS.runningBaseline,
  title: "Current running baseline",
  helper: "If you know these, the first plan starts more precisely. If not, you can keep moving and we will ask only what is still needed.",
  fieldKeys: [
    INTAKE_COMPLETENESS_FIELDS.currentRunFrequency,
    INTAKE_COMPLETENESS_FIELDS.longestRecentRun,
    INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline,
  ],
  expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.runningBaseline,
  validation: {
    kind: "running_baseline",
    message: "Add runs per week plus either a longest run or a recent pace/race result.",
  },
  inputFields: [
    {
      key: INTAKE_COMPLETENESS_FIELDS.currentRunFrequency,
      label: "Runs per week",
      inputType: "number",
      placeholder: "3",
      helperText: "How many times are you running in a normal week?",
      required: false,
      min: 1,
      max: 14,
    },
    {
      key: INTAKE_COMPLETENESS_FIELDS.longestRecentRun,
      label: "Longest recent run",
      inputType: "text",
      placeholder: "6 miles or 75 minutes",
      helperText: "Distance or duration is fine.",
      required: false,
    },
    {
      key: INTAKE_COMPLETENESS_FIELDS.recentPaceBaseline,
      label: "Recent pace or race result",
      inputType: "text",
      placeholder: "29:30 5K or 9:15 easy pace",
      helperText: "Optional if the longest run already tells the story.",
      required: false,
    },
  ],
});

const buildStrengthBaselineQuestion = ({ title = "Current strength anchor" } = {}) => createQuestion({
  key: INTAKE_COMPLETENESS_QUESTION_KEYS.strengthBaseline,
  title,
  helper: "A recent top set or estimated max helps us size the first block honestly.",
  fieldKeys: [INTAKE_COMPLETENESS_FIELDS.currentStrengthBaseline],
  expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.strengthBaseline,
  validation: {
    kind: "strength_baseline",
    message: "Add a recent weight for this lift. Reps are optional if you only know the load.",
  },
  inputFields: [
    {
      key: "current_strength_baseline_weight",
      label: "Current weight",
      inputType: "number",
      placeholder: "185",
      helperText: "Use a recent top set, best single, or estimated max.",
      required: false,
      min: 1,
      max: 2000,
      unit: "lb",
    },
    {
      key: "current_strength_baseline_reps",
      label: "Reps",
      inputType: "number",
      placeholder: "3",
      helperText: "Leave blank if you only know the load.",
      required: false,
      min: 1,
      max: 30,
    },
  ],
});

const buildSwimBaselineQuestion = () => createQuestion({
  key: INTAKE_COMPLETENESS_QUESTION_KEYS.swimBaseline,
  title: "Recent swim anchor",
  helper: "One recent swim plus your water reality keeps the first block honest.",
  fieldKeys: [
    INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor,
    INTAKE_COMPLETENESS_FIELDS.swimAccessReality,
  ],
  expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.swimBaseline,
  validation: {
    kind: "swim_baseline",
    message: "Add one recent swim anchor and whether it is pool, open water, or both.",
  },
  inputFields: [
    {
      key: INTAKE_COMPLETENESS_FIELDS.recentSwimAnchor,
      label: "Recent swim anchor",
      inputType: "text",
      placeholder: "1000 yd in 22:30",
      helperText: "One recent distance or benchmark is enough.",
      required: false,
    },
    {
      key: INTAKE_COMPLETENESS_FIELDS.swimAccessReality,
      label: "Water reality",
      inputType: "choice_chips",
      helperText: "Choose where you actually swim right now.",
      required: false,
      choiceOptions: SWIM_REALITY_OPTIONS,
    },
  ],
});

const buildBodyCompAnchorQuestion = ({
  includeTargetChange = false,
  title = "Current bodyweight",
  helper = "Optional now. If you know it, your first plan starts from something real.",
} = {}) => createQuestion({
  key: INTAKE_COMPLETENESS_QUESTION_KEYS.bodyCompAnchor,
  title,
  helper,
  fieldKeys: [
    INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
    ...(includeTargetChange ? [INTAKE_COMPLETENESS_FIELDS.targetWeightChange] : []),
  ],
  expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.bodyCompAnchor,
  validation: {
    kind: "body_comp_anchor",
    message: "Enter your current bodyweight and, if you want, the change you are aiming for.",
  },
  inputFields: [
    {
      key: INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
      label: "Current bodyweight",
      inputType: "number",
      placeholder: "205",
      helperText: helper,
      required: false,
      min: 1,
      max: 1000,
      unit: "lb",
    },
    ...(includeTargetChange
      ? [{
          key: INTAKE_COMPLETENESS_FIELDS.targetWeightChange,
          label: "Target change",
          inputType: "number",
          placeholder: "12",
          helperText: "Use pounds to lose. We will store this as a loss target.",
          required: false,
          min: 1,
          max: 300,
          unit: "lb",
          direction: "loss",
        }]
      : []),
  ],
});

const buildAppearanceProxyQuestion = ({ includeTimeline = false } = {}) => createQuestion({
  key: INTAKE_COMPLETENESS_QUESTION_KEYS.appearanceProxyAnchor,
  title: "Optional progress proxy",
  helper: "Bodyweight or waist both work. If you do not want to track either yet, skip it for now.",
  fieldKeys: [
    INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
    INTAKE_COMPLETENESS_FIELDS.currentWaist,
    INTAKE_COMPLETENESS_FIELDS.appearanceProxyPlan,
    ...(includeTimeline ? [INTAKE_COMPLETENESS_FIELDS.targetTimeline] : []),
  ],
  expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.appearanceProxyAnchor,
  validation: {
    kind: "appearance_proxy_anchor",
    message: "Add bodyweight, waist, or skip the proxy for now.",
  },
  inputFields: [
    {
      key: INTAKE_COMPLETENESS_FIELDS.currentBodyweight,
      label: "Current bodyweight",
      inputType: "number",
      placeholder: "185",
      helperText: "Optional if waist is the cleaner proxy for you.",
      required: false,
      min: 1,
      max: 1000,
      unit: "lb",
    },
    {
      key: INTAKE_COMPLETENESS_FIELDS.currentWaist,
      label: "Current waist",
      inputType: "number",
      placeholder: "34",
      helperText: "Optional if bodyweight is the better signal.",
      required: false,
      min: 1,
      max: 100,
      unit: "in",
    },
    {
      key: INTAKE_COMPLETENESS_FIELDS.appearanceProxyPlan,
      label: "Proxy choice",
      inputType: "choice_chips",
      helperText: "Only one of these is needed right now.",
      required: false,
      choiceOptions: APPEARANCE_PROXY_OPTIONS,
    },
    ...(includeTimeline
      ? [{
          key: INTAKE_COMPLETENESS_FIELDS.targetTimeline,
          label: "Event date or time window",
          inputType: "text",
          placeholder: "June wedding or early July",
          helperText: "Optional, but helpful when the goal is tied to an event.",
          required: false,
          expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.targetTimeline,
        }]
      : []),
  ],
});

const buildStartingCapacityQuestion = () => createQuestion({
  key: INTAKE_COMPLETENESS_QUESTION_KEYS.startingCapacity,
  title: "What feels repeatable today?",
  helper: "This keeps the first week honest without forcing a long questionnaire.",
  fieldKeys: [INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor],
  expectedValueType: INTAKE_COMPLETENESS_VALUE_TYPES.startingCapacity,
  validation: {
    kind: "starting_capacity",
    message: "Choose the starting capacity that feels most repeatable right now.",
  },
  inputFields: [
    {
      key: INTAKE_COMPLETENESS_FIELDS.startingCapacityAnchor,
      label: "Repeatable starting capacity",
      inputType: "choice_chips",
      helperText: "Pick the one that feels most honest right now.",
      required: false,
      choiceOptions: STARTING_CAPACITY_OPTIONS,
    },
  ],
});

const questionNeedsTimeline = (selection = null) => {
  const templateId = sanitizeText(selection?.templateId || "", 80);
  return [
    "run_first_5k",
    "run_faster_5k",
    "run_10k",
    "half_marathon",
    "marathon",
    "bench_225",
    "wedding_leaner",
  ].includes(templateId);
};

export const buildIntakeStarterGoalTypes = () => INTAKE_STARTER_GOAL_TYPES.map((item) => ({ ...item }));

export const getDefaultGoalLibraryCategoryForStarterType = (goalTypeId = "") => (
  STARTER_TYPE_BY_ID.get(sanitizeText(goalTypeId, 40))?.categoryId || "all"
);

export const listFeaturedIntakeGoalTemplates = ({ goalTypeId = "" } = {}) => (
  toArray(STARTER_TYPE_BY_ID.get(sanitizeText(goalTypeId, 40))?.featuredTemplateIds)
    .map((templateId) => findGoalTemplateById(templateId))
    .filter(Boolean)
);

export const inferIntakeStarterGoalTypeId = ({
  selection = null,
  answers = {},
} = {}) => {
  const cleanPrimaryGoal = sanitizeText(answers?.goal_intent || "", 220);
  if (!selection?.templateId) {
    return cleanPrimaryGoal ? "custom" : "running";
  }
  const template = findGoalTemplateById(selection.templateId) || selection;
  const categoryId = sanitizeText(template?.categoryId || template?.templateCategoryId || "", 40).toLowerCase();
  if (STARTER_TYPE_BY_CATEGORY_ID[categoryId]) return STARTER_TYPE_BY_CATEGORY_ID[categoryId];
  const planningCategory = sanitizeText(template?.planningCategory || "", 40).toLowerCase();
  if (STARTER_TYPE_BY_PLANNING_CATEGORY[planningCategory]) return STARTER_TYPE_BY_PLANNING_CATEGORY[planningCategory];
  return "general_fitness";
};

export const buildIntakeStarterMetricQuestions = ({
  goalTypeId = "",
  selection = null,
} = {}) => {
  const cleanGoalTypeId = sanitizeText(goalTypeId, 40);
  switch (cleanGoalTypeId) {
    case "running":
      return [
        ...(questionNeedsTimeline(selection) ? [buildTimelineQuestion({ title: "Race date or target month", helper: "Helpful if this goal is tied to a race or deadline." })] : []),
        buildRunningBaselineQuestion(),
      ];
    case "strength":
      return [
        buildStrengthBaselineQuestion({
          title: selection?.templateId === "bench_225" ? "Current bench baseline" : "Current strength anchor",
        }),
        ...(questionNeedsTimeline(selection) ? [buildTimelineQuestion({ title: "Target date or time window" })] : []),
      ];
    case "swim":
      return [buildSwimBaselineQuestion()];
    case "fat_loss":
      if (selection?.goalFamily === "appearance" || ["look_athletic_again", "tone_up", "six_pack", "wedding_leaner"].includes(sanitizeText(selection?.templateId || "", 80))) {
        return [buildAppearanceProxyQuestion({ includeTimeline: questionNeedsTimeline(selection) })];
      }
      return [
        buildBodyCompAnchorQuestion({
          includeTargetChange: !selection?.primaryMetric?.targetValue,
        }),
      ];
    case "general_fitness":
      return [buildStartingCapacityQuestion()];
    case "custom":
    default:
      return [];
  }
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

export const buildIntakeClickCountReport = () => ([
  { goal: "Run a 5K", path: "running", before: 9, after: 6 },
  { goal: "Run a faster 5K", path: "running", before: 9, after: 6 },
  { goal: "Half marathon", path: "running", before: 9, after: 6 },
  { goal: "Bench 225", path: "strength", before: 9, after: 6 },
  { goal: "Gain muscle", path: "strength", before: 9, after: 6 },
  { goal: "Lose 10 lb", path: "fat_loss", before: 9, after: 6 },
  { goal: "Look athletic again", path: "fat_loss", before: 9, after: 6 },
  { goal: "Swim a faster mile", path: "swim", before: 9, after: 6 },
  { goal: "Get back in shape", path: "general_fitness", before: 9, after: 6 },
  { goal: "Custom goal", path: "custom", before: 8, after: 5 },
]).map((entry) => ({
  ...entry,
  reduction: Math.max(0, entry.before - entry.after),
}));
