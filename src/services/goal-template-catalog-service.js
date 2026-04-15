import { dedupeStrings } from "../utils/collection-utils.js";

const sanitizeText = (value = "", maxLength = 200) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const cloneValue = (value = null) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const slugify = (value = "", fallback = "goal") => {
  const cleaned = sanitizeText(value, 120)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return cleaned || fallback;
};

const normalizeMetric = (metric = null, fallbackKind = "primary") => {
  if (!metric || typeof metric !== "object") return null;
  const label = sanitizeText(metric?.label || metric?.name || "", 120);
  if (!label) return null;
  return {
    key: sanitizeText(metric?.key || slugify(label, fallbackKind), 80).toLowerCase(),
    label,
    unit: sanitizeText(metric?.unit || "", 24),
    targetValue: sanitizeText(metric?.targetValue || metric?.value || "", 80),
    kind: sanitizeText(metric?.kind || fallbackKind, 20).toLowerCase() || fallbackKind,
  };
};

const normalizeProxyMetrics = (metrics = []) => {
  const seen = new Set();
  return toArray(metrics)
    .map((metric) => normalizeMetric(metric, "proxy"))
    .filter((metric) => {
      if (!metric?.label) return false;
      const key = metric.key || metric.label.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

const createTemplate = ({
  id,
  categoryId,
  title,
  helper,
  goalText,
  summary,
  planningCategory,
  goalFamily,
  primaryMetric = null,
  proxyMetrics = [],
  keywords = [],
} = {}) => Object.freeze({
  id: sanitizeText(id, 80),
  categoryId: sanitizeText(categoryId, 40),
  title: sanitizeText(title, 120),
  helper: sanitizeText(helper, 220),
  goalText: sanitizeText(goalText || summary || title, 220),
  summary: sanitizeText(summary || title, 160),
  planningCategory: sanitizeText(planningCategory || "general_fitness", 40).toLowerCase() || "general_fitness",
  goalFamily: sanitizeText(goalFamily || "general_fitness", 40).toLowerCase() || "general_fitness",
  primaryMetric: normalizeMetric(primaryMetric, "primary"),
  proxyMetrics: normalizeProxyMetrics(proxyMetrics),
  keywords: dedupeStrings([
    sanitizeText(title, 120),
    sanitizeText(summary, 160),
    sanitizeText(goalText, 220),
    sanitizeText(helper, 220),
    ...toArray(keywords).map((keyword) => sanitizeText(keyword, 80)),
  ].filter(Boolean)),
});

export const GOAL_TEMPLATE_ENTRY_MODES = Object.freeze({
  preset: "preset",
  custom: "custom",
});

export const GOAL_TEMPLATE_CATEGORIES = Object.freeze([
  Object.freeze({
    id: "all",
    label: "All goals",
    helper: "Browse the full goal library first, then narrow down if needed.",
  }),
  Object.freeze({
    id: "strength",
    label: "Strength",
    helper: "Lift numbers, muscle gain, and strength maintenance.",
  }),
  Object.freeze({
    id: "physique",
    label: "Fat loss & physique",
    helper: "Leaner, lighter, more defined, or more athletic-looking goals.",
  }),
  Object.freeze({
    id: "running",
    label: "Running & cardio",
    helper: "Event goals, pace work, and cardio consistency.",
  }),
  Object.freeze({
    id: "swim",
    label: "Swimming",
    helper: "Pool speed, open-water goals, and swim durability.",
  }),
  Object.freeze({
    id: "sport",
    label: "Sport & hybrid",
    helper: "Performance, resilience, and mixed-domain goals.",
  }),
  Object.freeze({
    id: "health",
    label: "Health & re-entry",
    helper: "Safe rebuilds, pain-aware starts, energy, and capability.",
  }),
]);

const DEFAULT_STRENGTH_PROXIES = [
  { key: "compound_lift_consistency", label: "Compound lift consistency", unit: "sessions" },
  { key: "top_set_load", label: "Top set load", unit: "lb" },
  { key: "weekly_strength_frequency", label: "Weekly strength frequency", unit: "sessions" },
];

const DEFAULT_BODY_COMP_PROXIES = [
  { key: "waist_circumference", label: "Waist circumference", unit: "in" },
  { key: "bodyweight_trend", label: "Bodyweight trend", unit: "lb" },
];

const DEFAULT_RUN_PROXIES = [
  { key: "weekly_run_frequency", label: "Weekly run frequency", unit: "sessions" },
  { key: "long_run_duration", label: "Long run duration", unit: "min" },
  { key: "quality_session_completion", label: "Quality session completion", unit: "sessions" },
];

const DEFAULT_SWIM_PROXIES = [
  { key: "swim_benchmark_retest", label: "Swim benchmark retest", unit: "benchmark" },
  { key: "weekly_swim_frequency", label: "Weekly swim frequency", unit: "sessions" },
  { key: "swim_access_reality", label: "Swim access reality", unit: "" },
];

const DEFAULT_GENERAL_PROXIES = [
  { key: "weekly_training_frequency", label: "Weekly training frequency", unit: "sessions" },
  { key: "checkin_consistency", label: "Check-in consistency", unit: "checkins" },
  { key: "thirty_day_adherence", label: "30-day adherence", unit: "sessions" },
];

const GOAL_TEMPLATES = Object.freeze([
  createTemplate({
    id: "bench_225",
    categoryId: "strength",
    title: "Bench 225",
    helper: "Exact bench target with a clear strength anchor.",
    goalText: "Bench 225",
    summary: "Bench press 225 lb",
    planningCategory: "strength",
    goalFamily: "strength",
    primaryMetric: { key: "bench_press_weight", label: "Bench press", unit: "lb", targetValue: "225" },
    proxyMetrics: DEFAULT_STRENGTH_PROXIES,
    keywords: ["bench press", "225", "strength number"],
  }),
  createTemplate({
    id: "get_stronger",
    categoryId: "strength",
    title: "Get stronger overall",
    helper: "General strength progression without one exact lift target.",
    goalText: "Get stronger",
    summary: "Get stronger with repeatable training",
    planningCategory: "strength",
    goalFamily: "strength",
    proxyMetrics: DEFAULT_STRENGTH_PROXIES,
  }),
  createTemplate({
    id: "gain_muscle",
    categoryId: "strength",
    title: "Gain muscle",
    helper: "Build more size with repeatable strength training.",
    goalText: "Gain muscle",
    summary: "Gain muscle with repeatable training",
    planningCategory: "strength",
    goalFamily: "strength",
    proxyMetrics: DEFAULT_STRENGTH_PROXIES,
    keywords: ["hypertrophy", "size", "muscle gain"],
  }),
  createTemplate({
    id: "upper_body_size",
    categoryId: "strength",
    title: "Build chest and shoulders",
    helper: "Upper-body size and visible shape.",
    goalText: "Look bigger through my chest and shoulders",
    summary: "Build upper-body size",
    planningCategory: "strength",
    goalFamily: "strength",
    proxyMetrics: DEFAULT_STRENGTH_PROXIES,
    keywords: ["upper body", "chest", "shoulders", "aesthetics"],
  }),
  createTemplate({
    id: "dumbbell_muscle",
    categoryId: "strength",
    title: "Gain muscle with dumbbells",
    helper: "Apartment or home setup with limited equipment.",
    goalText: "Gain muscle with apartment dumbbells",
    summary: "Gain muscle with dumbbells at home",
    planningCategory: "strength",
    goalFamily: "strength",
    proxyMetrics: DEFAULT_STRENGTH_PROXIES,
    keywords: ["home workouts", "apartment dumbbells"],
  }),
  createTemplate({
    id: "maintain_strength",
    categoryId: "strength",
    title: "Maintain strength",
    helper: "Keep strength in the plan while life, travel, or another priority gets more weight.",
    goalText: "Maintain strength",
    summary: "Maintain strength with repeatable exposures",
    planningCategory: "strength",
    goalFamily: "strength",
    proxyMetrics: DEFAULT_STRENGTH_PROXIES,
    keywords: ["keep strength", "hold strength"],
  }),
  createTemplate({
    id: "lose_10_lb",
    categoryId: "physique",
    title: "Lose 10 lb",
    helper: "Clear bodyweight target with honest proxy tracking.",
    goalText: "Lose 10 pounds",
    summary: "Lose 10 lb",
    planningCategory: "body_comp",
    goalFamily: "body_comp",
    primaryMetric: { key: "bodyweight_change", label: "Bodyweight change", unit: "lb", targetValue: "-10" },
    proxyMetrics: DEFAULT_BODY_COMP_PROXIES,
  }),
  createTemplate({
    id: "lose_20_lb",
    categoryId: "physique",
    title: "Lose 20 lb",
    helper: "Longer cut with bodyweight and waist proxies.",
    goalText: "Lose 20 pounds",
    summary: "Lose 20 lb",
    planningCategory: "body_comp",
    goalFamily: "body_comp",
    primaryMetric: { key: "bodyweight_change", label: "Bodyweight change", unit: "lb", targetValue: "-20" },
    proxyMetrics: DEFAULT_BODY_COMP_PROXIES,
  }),
  createTemplate({
    id: "get_leaner",
    categoryId: "physique",
    title: "Get leaner",
    helper: "Cleaner body-composition push without forcing a fake deadline.",
    goalText: "Get leaner",
    summary: "Get leaner",
    planningCategory: "body_comp",
    goalFamily: "body_comp",
    proxyMetrics: DEFAULT_BODY_COMP_PROXIES,
  }),
  createTemplate({
    id: "look_athletic_again",
    categoryId: "physique",
    title: "Look athletic again",
    helper: "Appearance-focused goal with realistic early proxies.",
    goalText: "I want to look athletic again",
    summary: "Look athletic again with repeatable training",
    planningCategory: "body_comp",
    goalFamily: "appearance",
    proxyMetrics: DEFAULT_BODY_COMP_PROXIES,
  }),
  createTemplate({
    id: "tone_up",
    categoryId: "physique",
    title: "Tone up",
    helper: "Appearance and consistency without harsh diet language.",
    goalText: "Tone up",
    summary: "Tone up with repeatable training",
    planningCategory: "body_comp",
    goalFamily: "appearance",
    proxyMetrics: DEFAULT_BODY_COMP_PROXIES,
  }),
  createTemplate({
    id: "six_pack",
    categoryId: "physique",
    title: "Improve midsection definition",
    helper: "Abs-focused physique goal without pretending the mirror is a metric.",
    goalText: "Get a six pack",
    summary: "Improve midsection definition",
    planningCategory: "body_comp",
    goalFamily: "appearance",
    proxyMetrics: DEFAULT_BODY_COMP_PROXIES,
    keywords: ["abs", "six pack", "midsection"],
  }),
  createTemplate({
    id: "wedding_leaner",
    categoryId: "physique",
    title: "Look leaner for an event",
    helper: "Date-based appearance goal like a wedding, trip, or photo shoot.",
    goalText: "Look leaner for an event",
    summary: "Look leaner for an event",
    planningCategory: "body_comp",
    goalFamily: "appearance",
    proxyMetrics: DEFAULT_BODY_COMP_PROXIES,
    keywords: ["wedding", "vacation", "event"],
  }),
  createTemplate({
    id: "recomp",
    categoryId: "physique",
    title: "Lose fat while keeping strength",
    helper: "Body-composition lead with strength retention visible.",
    goalText: "Lose fat while keeping strength",
    summary: "Lose fat while keeping strength",
    planningCategory: "body_comp",
    goalFamily: "body_comp",
    proxyMetrics: [
      ...DEFAULT_BODY_COMP_PROXIES,
      { key: "weekly_strength_frequency", label: "Weekly strength frequency", unit: "sessions" },
    ],
    keywords: ["body recomposition", "cut and keep strength"],
  }),
  createTemplate({
    id: "run_first_5k",
    categoryId: "running",
    title: "Run a 5k",
    helper: "Clear beginner event goal with straightforward structure.",
    goalText: "Run a 5k",
    summary: "Run a 5k",
    planningCategory: "running",
    goalFamily: "performance",
    proxyMetrics: DEFAULT_RUN_PROXIES,
  }),
  createTemplate({
    id: "run_faster_5k",
    categoryId: "running",
    title: "Run a faster 5k",
    helper: "Speed-focused 5k progression.",
    goalText: "Run a faster 5k",
    summary: "Run a faster 5k",
    planningCategory: "running",
    goalFamily: "performance",
    proxyMetrics: DEFAULT_RUN_PROXIES,
  }),
  createTemplate({
    id: "run_10k",
    categoryId: "running",
    title: "Run a 10k",
    helper: "10k event block with a clear endurance anchor.",
    goalText: "Run a 10k",
    summary: "Run a 10k",
    planningCategory: "running",
    goalFamily: "performance",
    proxyMetrics: DEFAULT_RUN_PROXIES,
  }),
  createTemplate({
    id: "half_marathon",
    categoryId: "running",
    title: "Run a half marathon",
    helper: "Date-based or horizon-based event goal.",
    goalText: "Run a half marathon",
    summary: "Run a half marathon",
    planningCategory: "running",
    goalFamily: "performance",
    proxyMetrics: DEFAULT_RUN_PROXIES,
  }),
  createTemplate({
    id: "marathon",
    categoryId: "running",
    title: "Run a marathon",
    helper: "Longer event arc with explicit timeline needs.",
    goalText: "Run a marathon",
    summary: "Run a marathon",
    planningCategory: "running",
    goalFamily: "performance",
    proxyMetrics: DEFAULT_RUN_PROXIES,
  }),
  createTemplate({
    id: "return_to_running",
    categoryId: "running",
    title: "Get back to running",
    helper: "Re-entry path for runners coming back after time off or injury.",
    goalText: "Get back to running consistently",
    summary: "Get back to running consistently",
    planningCategory: "running",
    goalFamily: "re_entry",
    proxyMetrics: DEFAULT_RUN_PROXIES,
  }),
  createTemplate({
    id: "cardio_consistency",
    categoryId: "running",
    title: "Build cardio consistency",
    helper: "General aerobic base without a race deadline.",
    goalText: "Build cardio consistency",
    summary: "Build cardio consistency",
    planningCategory: "general_fitness",
    goalFamily: "general_fitness",
    proxyMetrics: DEFAULT_GENERAL_PROXIES,
    keywords: ["conditioning", "aerobic base"],
  }),
  createTemplate({
    id: "swim_faster_mile",
    categoryId: "swim",
    title: "Swim a faster mile",
    helper: "Pool speed/endurance goal with a benchmark before build.",
    goalText: "Swim a faster mile",
    summary: "Swim a faster mile",
    planningCategory: "general_fitness",
    goalFamily: "performance",
    primaryMetric: { key: "swim_mile_time", label: "Swim mile time", unit: "time" },
    proxyMetrics: DEFAULT_SWIM_PROXIES,
  }),
  createTemplate({
    id: "swim_speed_standard_distance",
    categoryId: "swim",
    title: "Improve swim speed",
    helper: "Standard-distance swim speed without forcing you to type the whole problem.",
    goalText: "Improve my swim speed",
    summary: "Improve swim speed over a standard distance",
    planningCategory: "general_fitness",
    goalFamily: "performance",
    primaryMetric: { key: "swim_benchmark_time", label: "Swim benchmark time", unit: "time" },
    proxyMetrics: DEFAULT_SWIM_PROXIES,
    keywords: ["swim faster", "swim speed", "laps"],
  }),
  createTemplate({
    id: "open_water_swim",
    categoryId: "swim",
    title: "Prepare for open-water swim",
    helper: "Open-water reality stays explicit from intake onward.",
    goalText: "Swim a mile in open water",
    summary: "Prepare for an open-water swim",
    planningCategory: "general_fitness",
    goalFamily: "performance",
    proxyMetrics: DEFAULT_SWIM_PROXIES,
    keywords: ["open water", "lake swim", "ocean"],
  }),
  createTemplate({
    id: "swim_shoulder_friendly",
    categoryId: "swim",
    title: "Swim without shoulder flare-ups",
    helper: "Durability-aware swim fitness.",
    goalText: "Build swim fitness without beating up my shoulders",
    summary: "Build swim fitness without shoulder flare-ups",
    planningCategory: "general_fitness",
    goalFamily: "performance",
    proxyMetrics: DEFAULT_SWIM_PROXIES,
    keywords: ["shoulder-friendly swim", "durability"],
  }),
  createTemplate({
    id: "swim_endurance",
    categoryId: "swim",
    title: "Build swim endurance",
    helper: "Endurance and technique before sharper speed targets.",
    goalText: "Build swim endurance and technique",
    summary: "Build swim endurance and technique",
    planningCategory: "general_fitness",
    goalFamily: "performance",
    proxyMetrics: DEFAULT_SWIM_PROXIES,
  }),
  createTemplate({
    id: "hybrid_athlete",
    categoryId: "sport",
    title: "Be more hybrid",
    helper: "Mix strength and endurance without lane theater.",
    goalText: "Be more hybrid",
    summary: "Build hybrid endurance while strength stays in the week",
    planningCategory: "running",
    goalFamily: "hybrid",
    proxyMetrics: [
      { key: "weekly_run_frequency", label: "Weekly run frequency", unit: "sessions" },
      { key: "weekly_strength_frequency", label: "Weekly strength frequency", unit: "sessions" },
    ],
    keywords: ["hybrid athlete", "strength and endurance"],
  }),
  createTemplate({
    id: "jump_higher",
    categoryId: "sport",
    title: "Jump higher",
    helper: "Athletic-power goal for basketball or general explosiveness.",
    goalText: "Jump higher",
    summary: "Improve jump power and vertical pop",
    planningCategory: "strength",
    goalFamily: "athletic_power",
    proxyMetrics: [
      { key: "vertical_jump_touchpoint", label: "Jump touch point", unit: "checkins" },
      { key: "lower_body_power_sessions", label: "Lower-body power sessions", unit: "sessions" },
      { key: "approach_jump_quality", label: "Approach jump quality", unit: "checkins" },
    ],
  }),
  createTemplate({
    id: "fighter_shape",
    categoryId: "sport",
    title: "Get into fighter shape",
    helper: "Conditioning plus aesthetics without vague blob text.",
    goalText: "Get into fighter shape",
    summary: "Build fighter-style conditioning and body composition",
    planningCategory: "running",
    goalFamily: "hybrid",
    proxyMetrics: [
      { key: "weekly_run_frequency", label: "Weekly conditioning frequency", unit: "sessions" },
      { key: "weekly_strength_frequency", label: "Weekly strength frequency", unit: "sessions" },
      { key: "bodyweight_trend", label: "Bodyweight trend", unit: "lb" },
    ],
  }),
  createTemplate({
    id: "soccer_resilience",
    categoryId: "sport",
    title: "Stay resilient for field sports",
    helper: "Conditioning and lower-body resilience for soccer or rec sports.",
    goalText: "Stay resilient for soccer and field sports",
    summary: "Build conditioning and lower-body resilience for sport",
    planningCategory: "general_fitness",
    goalFamily: "general_fitness",
    proxyMetrics: DEFAULT_GENERAL_PROXIES,
    keywords: ["soccer", "field sport", "injury resilience"],
  }),
  createTemplate({
    id: "travel_strength_cut",
    categoryId: "sport",
    title: "Maintain strength while traveling",
    helper: "Travel-heavy life with hotel-gym reality.",
    goalText: "Maintain strength while traveling and lose weight",
    summary: "Maintain strength while traveling",
    planningCategory: "strength",
    goalFamily: "hybrid",
    proxyMetrics: [
      { key: "weekly_strength_frequency", label: "Weekly strength frequency", unit: "sessions" },
      { key: "bodyweight_trend", label: "Bodyweight trend", unit: "lb" },
      { key: "checkin_consistency", label: "Check-in consistency", unit: "checkins" },
    ],
    keywords: ["hotel gym", "travel"],
  }),
  createTemplate({
    id: "cut_keep_performance",
    categoryId: "sport",
    title: "Lose fat while keeping performance",
    helper: "Performance-sensitive cut for sport or tactical users.",
    goalText: "Lose fat while keeping performance",
    summary: "Lose fat while keeping performance",
    planningCategory: "body_comp",
    goalFamily: "body_comp",
    proxyMetrics: [
      { key: "bodyweight_trend", label: "Bodyweight trend", unit: "lb" },
      { key: "weekly_strength_frequency", label: "Weekly strength frequency", unit: "sessions" },
      { key: "weekly_training_frequency", label: "Weekly training frequency", unit: "sessions" },
    ],
  }),
  createTemplate({
    id: "learn_safely",
    categoryId: "health",
    title: "Learn to work out safely",
    helper: "Best for deconditioned or intimidated beginners.",
    goalText: "Learn how to work out without getting hurt",
    summary: "Learn how to work out safely",
    planningCategory: "general_fitness",
    goalFamily: "re_entry",
    proxyMetrics: DEFAULT_GENERAL_PROXIES,
    keywords: ["beginner", "without getting hurt"],
  }),
  createTemplate({
    id: "get_back_in_shape",
    categoryId: "health",
    title: "Get back in shape",
    helper: "Simple re-entry path when you want a real restart.",
    goalText: "Get back in shape",
    summary: "Get back into consistent training shape",
    planningCategory: "general_fitness",
    goalFamily: "re_entry",
    proxyMetrics: DEFAULT_GENERAL_PROXIES,
  }),
  createTemplate({
    id: "stop_hurting_after_work",
    categoryId: "health",
    title: "Stop hurting after work",
    helper: "Pain-aware path for desk workers and manual workers alike.",
    goalText: "Stop hurting after work and get back in shape",
    summary: "Reduce daily pain and rebuild fitness",
    planningCategory: "general_fitness",
    goalFamily: "re_entry",
    proxyMetrics: DEFAULT_GENERAL_PROXIES,
    keywords: ["back tightness", "desk worker", "pain-aware"],
  }),
  createTemplate({
    id: "postpartum_rebuild",
    categoryId: "health",
    title: "Rebuild safely after having a baby",
    helper: "Strength and energy rebuild with schedule reality respected.",
    goalText: "Rebuild strength and energy safely after having a baby",
    summary: "Rebuild strength and energy safely",
    planningCategory: "general_fitness",
    goalFamily: "re_entry",
    proxyMetrics: DEFAULT_GENERAL_PROXIES,
    keywords: ["postpartum", "after baby"],
  }),
  createTemplate({
    id: "capability_longevity",
    categoryId: "health",
    title: "Stay capable and mobile",
    helper: "Long-term capability and healthspan without deadline pressure.",
    goalText: "Stay capable and maintain mobility",
    summary: "Stay capable and maintain mobility",
    planningCategory: "general_fitness",
    goalFamily: "general_fitness",
    proxyMetrics: DEFAULT_GENERAL_PROXIES,
    keywords: ["longevity", "healthspan", "mobility"],
  }),
  createTemplate({
    id: "low_impact_start",
    categoryId: "health",
    title: "Start with low-impact training",
    helper: "Joint-sensitive or higher-bodyweight users who need a safe start.",
    goalText: "Start exercising without impact-heavy plans",
    summary: "Start exercising with low-impact training",
    planningCategory: "general_fitness",
    goalFamily: "re_entry",
    proxyMetrics: DEFAULT_GENERAL_PROXIES,
    keywords: ["joint-sensitive", "low impact", "bad knees"],
  }),
  createTemplate({
    id: "build_energy",
    categoryId: "health",
    title: "Build energy and consistency",
    helper: "Useful when energy is the main felt problem.",
    goalText: "Build energy and consistency",
    summary: "Build energy and consistency",
    planningCategory: "general_fitness",
    goalFamily: "general_fitness",
    proxyMetrics: DEFAULT_GENERAL_PROXIES,
  }),
  createTemplate({
    id: "safe_weight_loss_beginner",
    categoryId: "health",
    title: "Lose weight safely",
    helper: "Beginner-friendly fat-loss path without aggressive language.",
    goalText: "Lose weight safely and consistently",
    summary: "Lose weight safely and consistently",
    planningCategory: "body_comp",
    goalFamily: "body_comp",
    proxyMetrics: DEFAULT_BODY_COMP_PROXIES,
    keywords: ["safe fat loss", "beginner weight loss"],
  }),
]);

const GOAL_TEMPLATE_MAP = new Map(GOAL_TEMPLATES.map((template) => [template.id, template]));

const buildSelectionId = ({ entryMode = GOAL_TEMPLATE_ENTRY_MODES.preset, templateId = "", goalText = "" } = {}) => (
  sanitizeText(
    entryMode === GOAL_TEMPLATE_ENTRY_MODES.preset
      ? `preset:${templateId}`
      : `custom:${slugify(goalText, "goal")}`,
    140
  )
);

const normalizeEntryMode = (value = "") => {
  const clean = sanitizeText(value, 20).toLowerCase();
  return clean === GOAL_TEMPLATE_ENTRY_MODES.custom ? GOAL_TEMPLATE_ENTRY_MODES.custom : GOAL_TEMPLATE_ENTRY_MODES.preset;
};

export const listGoalTemplateCategories = () => GOAL_TEMPLATE_CATEGORIES.map((category) => cloneValue(category));

export const listGoalTemplates = ({
  categoryId = "",
  query = "",
} = {}) => {
  const cleanCategoryId = sanitizeText(categoryId, 40).toLowerCase();
  const cleanQuery = sanitizeText(query, 80).toLowerCase();
  return GOAL_TEMPLATES
    .filter((template) => !cleanCategoryId || cleanCategoryId === "all" || template.categoryId === cleanCategoryId)
    .filter((template) => {
      if (!cleanQuery) return true;
      return template.keywords.some((keyword) => keyword.toLowerCase().includes(cleanQuery));
    })
    .map((template) => cloneValue(template));
};

export const findGoalTemplateById = (templateId = "") => cloneValue(
  GOAL_TEMPLATE_MAP.get(sanitizeText(templateId, 80))
  || null
);

export const buildGoalTemplateSelection = ({
  templateId = "",
  customGoalText = "",
  customSummary = "",
} = {}) => {
  const template = findGoalTemplateById(templateId);
  if (template) {
    return {
      id: buildSelectionId({ templateId: template.id, goalText: template.goalText }),
      entryMode: GOAL_TEMPLATE_ENTRY_MODES.preset,
      templateId: template.id,
      templateCategoryId: template.categoryId,
      templateTitle: template.title,
      goalText: template.goalText,
      summary: template.summary,
      planningCategory: template.planningCategory,
      goalFamily: template.goalFamily,
      primaryMetric: cloneValue(template.primaryMetric),
      proxyMetrics: cloneValue(template.proxyMetrics),
      helper: template.helper,
    };
  }
  const goalText = sanitizeText(customGoalText, 220);
  if (!goalText) return null;
  return {
    id: buildSelectionId({ entryMode: GOAL_TEMPLATE_ENTRY_MODES.custom, goalText }),
    entryMode: GOAL_TEMPLATE_ENTRY_MODES.custom,
    templateId: "",
    templateCategoryId: "custom",
    templateTitle: "Custom goal",
    goalText,
    summary: sanitizeText(customSummary || goalText, 160),
    planningCategory: "general_fitness",
    goalFamily: "general_fitness",
    primaryMetric: null,
    proxyMetrics: [],
    helper: "Custom goal text",
  };
};

export const normalizeGoalTemplateSelection = (selection = null) => {
  if (!selection || typeof selection !== "object") return null;
  const entryMode = normalizeEntryMode(selection?.entryMode);
  const template = entryMode === GOAL_TEMPLATE_ENTRY_MODES.preset
    ? findGoalTemplateById(selection?.templateId || "")
    : null;
  if (template) {
    return {
      ...cloneValue(template),
      id: buildSelectionId({ templateId: template.id, goalText: selection?.goalText || template.goalText }),
      entryMode,
      templateId: template.id,
      templateCategoryId: template.categoryId,
      templateTitle: template.title,
      goalText: sanitizeText(selection?.goalText || template.goalText, 220) || template.goalText,
      summary: sanitizeText(selection?.summary || template.summary, 160) || template.summary,
      planningCategory: sanitizeText(selection?.planningCategory || template.planningCategory, 40).toLowerCase() || template.planningCategory,
      goalFamily: sanitizeText(selection?.goalFamily || template.goalFamily, 40).toLowerCase() || template.goalFamily,
      primaryMetric: normalizeMetric(selection?.primaryMetric || template.primaryMetric, "primary"),
      proxyMetrics: normalizeProxyMetrics((selection?.proxyMetrics || []).length ? selection.proxyMetrics : template.proxyMetrics),
      helper: sanitizeText(selection?.helper || template.helper, 220) || template.helper,
    };
  }
  const goalText = sanitizeText(selection?.goalText || selection?.summary || "", 220);
  if (!goalText) return null;
  return {
    id: buildSelectionId({ entryMode: GOAL_TEMPLATE_ENTRY_MODES.custom, goalText }),
    entryMode: GOAL_TEMPLATE_ENTRY_MODES.custom,
    templateId: "",
    templateCategoryId: "custom",
    templateTitle: "Custom goal",
    goalText,
    summary: sanitizeText(selection?.summary || goalText, 160),
    planningCategory: sanitizeText(selection?.planningCategory || "general_fitness", 40).toLowerCase() || "general_fitness",
    goalFamily: sanitizeText(selection?.goalFamily || "general_fitness", 40).toLowerCase() || "general_fitness",
    primaryMetric: normalizeMetric(selection?.primaryMetric || null, "primary"),
    proxyMetrics: normalizeProxyMetrics(selection?.proxyMetrics || []),
    helper: sanitizeText(selection?.helper || "Custom goal text", 220),
  };
};

export const buildGoalTemplateSelectionsFromAnswers = ({
  answers = {},
} = {}) => {
  const storedSelections = toArray(answers?.goal_template_stack)
    .map((selection) => normalizeGoalTemplateSelection(selection))
    .filter(Boolean);
  if (storedSelections.length) return storedSelections;
  const textEntries = dedupeStrings([
    sanitizeText(answers?.goal_intent || "", 220),
    ...toArray(answers?.additional_goals_list || []).map((item) => sanitizeText(item, 220)),
  ].filter(Boolean));
  return textEntries
    .map((goalText) => buildGoalTemplateSelection({ customGoalText: goalText }))
    .filter(Boolean);
};

const normalizedGoalTextMatches = (left = "", right = "") => (
  sanitizeText(left, 200).toLowerCase() === sanitizeText(right, 200).toLowerCase()
);

export const findGoalTemplateSelectionForGoalText = ({
  answers = {},
  goalText = "",
  index = 0,
} = {}) => {
  const selections = buildGoalTemplateSelectionsFromAnswers({ answers });
  if (!selections.length) return null;
  const cleanGoalText = sanitizeText(goalText, 220);
  if (cleanGoalText) {
    const matchedSelection = selections.find((selection) => (
      normalizedGoalTextMatches(selection?.goalText || "", cleanGoalText)
      || normalizedGoalTextMatches(selection?.summary || "", cleanGoalText)
    ));
    if (matchedSelection) return matchedSelection;
  }
  return selections[index] || null;
};

export const applyGoalTemplateSelectionToDraft = ({
  draft = {},
  selection = null,
} = {}) => {
  const normalizedSelection = normalizeGoalTemplateSelection(selection);
  if (!normalizedSelection) return draft;
  const nextDraft = {
    ...(draft || {}),
    entryMode: normalizedSelection.entryMode,
    templateId: normalizedSelection.templateId || "",
    templateCategoryId: normalizedSelection.templateCategoryId || "",
    templateTitle: normalizedSelection.templateTitle || "",
    selectionGoalText: normalizedSelection.goalText || "",
    summary: normalizedSelection.summary || draft?.summary || "",
    planningCategory: normalizedSelection.planningCategory || draft?.planningCategory || "general_fitness",
    primaryMetricKey: normalizedSelection.primaryMetric?.key || draft?.primaryMetricKey || "",
    primaryMetricLabel: normalizedSelection.primaryMetric?.label || draft?.primaryMetricLabel || "",
    primaryMetricTargetValue: normalizedSelection.primaryMetric?.targetValue || draft?.primaryMetricTargetValue || "",
    primaryMetricUnit: normalizedSelection.primaryMetric?.unit || draft?.primaryMetricUnit || "",
    proxyMetrics: cloneValue(normalizedSelection.proxyMetrics || []),
  };
  if (!nextDraft.timingMode) nextDraft.timingMode = "open_ended";
  return nextDraft;
};

export const inferGoalTemplateSelectionFromGoal = ({
  goal = null,
} = {}) => {
  if (!goal) return null;
  const summary = sanitizeText(goal?.resolvedGoal?.summary || goal?.name || "", 160);
  const planningCategory = sanitizeText(goal?.resolvedGoal?.planningCategory || goal?.category || "", 40).toLowerCase();
  const goalFamily = sanitizeText(goal?.resolvedGoal?.goalFamily || goal?.goalFamily || "", 40).toLowerCase();
  const primaryMetric = normalizeMetric(goal?.resolvedGoal?.primaryMetric || goal?.primaryMetric || null, "primary");
  const match = GOAL_TEMPLATES.find((template) => {
    if (primaryMetric?.key && template.primaryMetric?.key && primaryMetric.key === template.primaryMetric.key) {
      const templateTarget = sanitizeText(template.primaryMetric?.targetValue || "", 80);
      const metricTarget = sanitizeText(primaryMetric?.targetValue || "", 80);
      return !templateTarget || !metricTarget || templateTarget === metricTarget;
    }
    if (normalizedGoalTextMatches(summary, template.summary) || normalizedGoalTextMatches(summary, template.goalText)) {
      return true;
    }
    if (planningCategory && goalFamily && planningCategory === template.planningCategory && goalFamily === template.goalFamily) {
      return template.keywords.some((keyword) => summary.toLowerCase().includes(keyword.toLowerCase()));
    }
    return false;
  }) || null;
  return match ? buildGoalTemplateSelection({ templateId: match.id }) : null;
};
