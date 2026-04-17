import { dedupeStrings } from "../utils/collection-utils.js";
import {
  GOAL_DISCOVERY_FAMILIES,
  findGoalDiscoveryFamilyById,
} from "../data/goal-families/index.js";
import {
  findStructuredGoalIntentById,
  listStructuredGoalIntents,
  resolveStructuredGoalIntentId,
} from "../data/goal-intents/index.js";

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

const createTemplateFromIntent = (intent = null) => {
  if (!intent) return null;
  return {
    id: intent.id,
    intentId: intent.id,
    familyId: intent.familyId,
    categoryId: intent.familyId,
    title: sanitizeText(intent.title, 120),
    helper: sanitizeText(intent.helper, 220),
    goalText: sanitizeText(intent.goalText || intent.summary || intent.title, 220),
    summary: sanitizeText(intent.summary || intent.title, 160),
    planningCategory: sanitizeText(intent.planningCategory || "general_fitness", 40).toLowerCase() || "general_fitness",
    goalFamily: sanitizeText(intent.goalFamily || "general_fitness", 40).toLowerCase() || "general_fitness",
    primaryMetric: normalizeMetric(intent.primaryMetric, "primary"),
    proxyMetrics: normalizeProxyMetrics(intent.proxyMetrics || []),
    keywords: dedupeStrings([
      intent.title,
      intent.summary,
      intent.goalText,
      intent.helper,
      ...(intent.keywords || []),
    ].filter(Boolean)),
    specificityProfile: cloneValue(intent.specificityProfile || {}),
  };
};

const LEGACY_PRESET_DEFAULTS = Object.freeze({
  bench_225: {
    templateId: "improve_big_lifts",
    summary: "Bench 225",
    goalText: "Bench 225",
    primaryMetric: { key: "bench_press_weight", label: "Bench press", unit: "lb", targetValue: "225", kind: "primary" },
    specificityDefaults: { lift_focus: "bench", progression_posture: "standard" },
  },
  run_first_5k: {
    templateId: "train_for_run_race",
    summary: "Run a 5K",
    goalText: "Train for a 5K",
    specificityDefaults: { event_distance: "5k" },
  },
  run_faster_5k: {
    templateId: "train_for_run_race",
    summary: "Run a faster 5K",
    goalText: "Run a faster 5K",
    specificityDefaults: { event_distance: "5k" },
  },
  run_10k: {
    templateId: "train_for_run_race",
    summary: "Run a 10K",
    goalText: "Train for a 10K",
    specificityDefaults: { event_distance: "10k" },
  },
  half_marathon: {
    templateId: "train_for_run_race",
    summary: "Run a half marathon",
    goalText: "Train for a half marathon",
    specificityDefaults: { event_distance: "half_marathon" },
  },
  marathon: {
    templateId: "train_for_run_race",
    summary: "Run a marathon",
    goalText: "Train for a marathon",
    specificityDefaults: { event_distance: "marathon" },
  },
  lose_10_lb: {
    templateId: "lose_body_fat",
    summary: "Lose 10 lb",
    goalText: "Lose 10 pounds",
    primaryMetric: { key: "bodyweight_trend", label: "Bodyweight trend", unit: "lb", targetValue: "-10", kind: "primary" },
  },
  lose_20_lb: {
    templateId: "lose_body_fat",
    summary: "Lose 20 lb",
    goalText: "Lose 20 pounds",
    primaryMetric: { key: "bodyweight_trend", label: "Bodyweight trend", unit: "lb", targetValue: "-20", kind: "primary" },
  },
  swim_faster_mile: {
    templateId: "swim_better",
    summary: "Swim a faster mile",
    goalText: "Swim a faster mile",
    primaryMetric: { key: "swim_mile_time", label: "Swim mile time", unit: "time", targetValue: "", kind: "primary" },
    specificityDefaults: { goal_focus: "endurance" },
  },
  open_water_swim: {
    templateId: "swim_better",
    summary: "Swim stronger in open water",
    goalText: "Swim stronger in open water",
    specificityDefaults: { goal_focus: "open_water" },
  },
});

const LEGACY_CATEGORY_ALIASES = Object.freeze({
  running: "endurance",
  swim: "endurance",
  sport: "hybrid",
  health: "general_fitness",
  physique: "physique",
  strength: "strength",
  endurance: "endurance",
  re_entry: "re_entry",
  hybrid: "hybrid",
  general_fitness: "general_fitness",
});

export const GOAL_TEMPLATE_ENTRY_MODES = Object.freeze({
  preset: "preset",
  custom: "custom",
});

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

const resolveTemplate = (templateId = "") => {
  const requestedId = sanitizeText(templateId, 80).toLowerCase();
  if (!requestedId) return null;
  const preset = LEGACY_PRESET_DEFAULTS[requestedId] || null;
  const canonicalId = resolveStructuredGoalIntentId(preset?.templateId || requestedId);
  const intent = findStructuredGoalIntentById(canonicalId);
  if (!intent) return null;
  const baseTemplate = createTemplateFromIntent(intent);
  return {
    ...baseTemplate,
    id: baseTemplate.id,
    requestedTemplateId: requestedId,
    legacyTemplateId: requestedId !== baseTemplate.id ? requestedId : "",
    summary: sanitizeText(preset?.summary || baseTemplate.summary, 160),
    goalText: sanitizeText(preset?.goalText || baseTemplate.goalText, 220),
    primaryMetric: normalizeMetric(preset?.primaryMetric || baseTemplate.primaryMetric, "primary"),
    specificityDefaults: {
      ...(preset?.specificityDefaults || {}),
    },
  };
};

export const listGoalTemplateCategories = () => GOAL_DISCOVERY_FAMILIES.map((family) => ({
  id: family.id,
  label: family.label,
  helper: family.helper,
}));

export const listGoalTemplates = ({
  categoryId = "",
  query = "",
} = {}) => {
  const normalizedCategoryId = LEGACY_CATEGORY_ALIASES[sanitizeText(categoryId, 40).toLowerCase()] || sanitizeText(categoryId, 40).toLowerCase();
  const cleanQuery = sanitizeText(query, 80).toLowerCase();
  return listStructuredGoalIntents({ familyId: normalizedCategoryId || "all" })
    .map((intent) => createTemplateFromIntent(intent))
    .filter(Boolean)
    .filter((template) => {
      if (!cleanQuery) return true;
      return (template.keywords || []).some((keyword) => String(keyword || "").toLowerCase().includes(cleanQuery));
    })
    .map((template) => cloneValue(template));
};

export const findGoalTemplateById = (templateId = "") => cloneValue(resolveTemplate(templateId) || null);

export const buildGoalTemplateSelection = ({
  templateId = "",
  customGoalText = "",
  customSummary = "",
  specificityDefaults = {},
} = {}) => {
  const template = resolveTemplate(templateId);
  if (template) {
    return {
      id: buildSelectionId({ templateId: template.id, goalText: template.goalText }),
      entryMode: GOAL_TEMPLATE_ENTRY_MODES.preset,
      templateId: template.id,
      legacyTemplateId: template.legacyTemplateId || "",
      intentId: template.intentId || template.id,
      familyId: template.familyId || template.categoryId,
      templateCategoryId: template.categoryId,
      templateTitle: template.title,
      goalText: template.goalText,
      summary: template.summary,
      planningCategory: template.planningCategory,
      goalFamily: template.goalFamily,
      primaryMetric: cloneValue(template.primaryMetric),
      proxyMetrics: cloneValue(template.proxyMetrics),
      helper: template.helper,
      specificityDefaults: {
        ...(template.specificityDefaults || {}),
        ...(specificityDefaults || {}),
      },
    };
  }
  const goalText = sanitizeText(customGoalText, 220);
  if (!goalText) return null;
  return {
    id: buildSelectionId({ entryMode: GOAL_TEMPLATE_ENTRY_MODES.custom, goalText }),
    entryMode: GOAL_TEMPLATE_ENTRY_MODES.custom,
    templateId: "",
    legacyTemplateId: "",
    intentId: "",
    familyId: "all",
    templateCategoryId: "custom",
    templateTitle: "Custom goal",
    goalText,
    summary: sanitizeText(customSummary || goalText, 160),
    planningCategory: "general_fitness",
    goalFamily: "general_fitness",
    primaryMetric: null,
    proxyMetrics: [],
    helper: "Custom goal text",
    specificityDefaults: {},
  };
};

export const normalizeGoalTemplateSelection = (selection = null) => {
  if (!selection || typeof selection !== "object") return null;
  const entryMode = normalizeEntryMode(selection?.entryMode);
  if (entryMode === GOAL_TEMPLATE_ENTRY_MODES.custom) {
    return buildGoalTemplateSelection({
      customGoalText: selection?.goalText || selection?.summary || "",
      customSummary: selection?.summary || selection?.goalText || "",
    });
  }
  return buildGoalTemplateSelection({
    templateId: selection?.legacyTemplateId || selection?.templateId || selection?.intentId || "",
    specificityDefaults: selection?.specificityDefaults || {},
  });
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
  return {
    ...(draft || {}),
    entryMode: normalizedSelection.entryMode,
    templateId: normalizedSelection.templateId || "",
    intentId: normalizedSelection.intentId || "",
    legacyTemplateId: normalizedSelection.legacyTemplateId || "",
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
    specificityDefaults: cloneValue(normalizedSelection.specificityDefaults || {}),
    timingMode: draft?.timingMode || "open_ended",
  };
};

export const inferGoalTemplateSelectionFromGoal = ({
  goal = null,
} = {}) => {
  if (!goal) return null;
  const resolvedGoal = goal?.resolvedGoal || {};
  const templateId = sanitizeText(resolvedGoal?.structuredIntentId || resolvedGoal?.goalTemplateId || "", 80).toLowerCase();
  if (templateId) {
    return buildGoalTemplateSelection({
      templateId,
      specificityDefaults: resolvedGoal?.specificityInputs || {},
    });
  }
  return null;
};
