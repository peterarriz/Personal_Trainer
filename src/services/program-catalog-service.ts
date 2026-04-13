import { PROGRAM_CATALOG, PROGRAM_CATEGORY_LABELS } from "../data/program-catalog.ts";
import { STYLE_CATALOG, STYLE_CATEGORY_LABELS } from "../data/style-catalog.ts";

export const PROGRAM_FIDELITY_MODES = Object.freeze({
  runAsWritten: "run_as_written",
  adaptToMe: "adapt_to_me",
  useAsStyle: "use_as_style",
});

export const PROGRAM_SELECTION_MODES = Object.freeze({
  program: "program",
  programAsStyle: "program_as_style",
});

export const PROGRAM_SOURCE_BASIS_LABELS = Object.freeze({
  evidence_informed_default: "Evidence-informed default",
  coach_published_public_template: "Coach-published public template",
  public_named_methodology: "Public methodology",
  multi_source_public_reconstruction: "Public reconstruction",
  cultural_inspiration: "Inspired by a public training archetype",
});

export const SOURCE_CONFIDENCE_LABELS = Object.freeze({
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
});

const cloneValue = (value = null) => {
  if (value == null) return value;
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return value;
  }
};

const sortByDisplayName = (items = []) => [...items].sort((a, b) => String(a?.displayName || "").localeCompare(String(b?.displayName || "")));

export const createDefaultProgramSelectionState = () => ({
  activeProgramInstance: null,
  activeStyleSelection: null,
  lastCompatibilityAssessment: null,
  planBasisExplanation: null,
  selectionHistory: [],
});

export const normalizeProgramsSelectionState = (state = {}) => ({
  ...createDefaultProgramSelectionState(),
  ...(state || {}),
  activeProgramInstance: state?.activeProgramInstance || null,
  activeStyleSelection: state?.activeStyleSelection || null,
  lastCompatibilityAssessment: state?.lastCompatibilityAssessment || null,
  planBasisExplanation: state?.planBasisExplanation || null,
  selectionHistory: Array.isArray(state?.selectionHistory) ? [...state.selectionHistory] : [],
});

export const listProgramDefinitions = ({ includeDeprecated = false } = {}) => sortByDisplayName(
  (PROGRAM_CATALOG || [])
    .filter((program) => includeDeprecated || program?.status !== "deprecated")
    .map((program) => cloneValue(program))
);

export const listStyleDefinitions = ({ includeDeprecated = false } = {}) => sortByDisplayName(
  (STYLE_CATALOG || [])
    .filter((style) => includeDeprecated || String(style?.status || "active") !== "deprecated")
    .map((style) => cloneValue(style))
);

export const getProgramDefinitionById = (id = "") => {
  const match = (PROGRAM_CATALOG || []).find((program) => program?.id === id || program?.slug === id);
  return match ? cloneValue(match) : null;
};

export const getStyleDefinitionById = (id = "") => {
  const match = (STYLE_CATALOG || []).find((style) => style?.id === id || style?.slug === id);
  return match ? cloneValue(match) : null;
};

const buildProgramCardModel = ({
  program = null,
  activeProgramId = "",
} = {}) => {
  if (!program) return null;
  const supportedModes = Object.entries(program?.fidelityModeSupport || {})
    .filter(([, enabled]) => Boolean(enabled))
    .map(([mode]) => mode);
  return {
    id: program.id,
    displayName: program.displayName,
    summary: program.summary,
    categoryLabel: PROGRAM_CATEGORY_LABELS[program.category] || "Program",
    sourceBasisLabel: PROGRAM_SOURCE_BASIS_LABELS[program.sourceBasis] || "Source-backed",
    sourceConfidenceLabel: SOURCE_CONFIDENCE_LABELS[program.sourceConfidence] || "Confidence set",
    commitmentLine: `${program.typicalSessionsPerWeek.typical} sessions/week for about ${program.typicalDurationWeeks} weeks`,
    sessionTypes: [...(program.sessionTypes || [])],
    tags: [...(program.tags || [])],
    goalsOptional: Boolean(program.goalsOptional),
    supportedModes,
    isActive: activeProgramId === program.id,
  };
};

const buildStyleCardModel = ({
  style = null,
  activeStyleId = "",
} = {}) => {
  if (!style) return null;
  return {
    id: style.id,
    displayName: style.displayName,
    summary: style.summary,
    categoryLabel: STYLE_CATEGORY_LABELS[style.category] || "Style",
    sourceBasisLabel: PROGRAM_SOURCE_BASIS_LABELS[style.sourceBasis] || "Source-backed",
    sourceConfidenceLabel: SOURCE_CONFIDENCE_LABELS[style.sourceConfidence] || "Confidence set",
    emphasisLine: [style.volumeBias, style.intensityBias, style.cardioBias].filter(Boolean).join(" • "),
    tags: [...(style.tags || [])],
    isActive: activeStyleId === style.id,
  };
};

const buildGroupedSections = ({
  items = [],
  labelMap = {},
  modelBuilder = null,
  activeId = "",
} = {}) => {
  const grouped = new Map();
  (items || []).forEach((item) => {
    const key = item?.category || "other";
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key).push(item);
  });
  return Array.from(grouped.entries()).map(([key, groupItems]) => ({
    key,
    title: labelMap[key] || "Other",
    items: sortByDisplayName(groupItems).map((item) => modelBuilder({ [item?.styleBiases ? "style" : "program"]: item, [item?.styleBiases ? "activeStyleId" : "activeProgramId"]: activeId })).filter(Boolean),
  }));
};

export const buildProgramCatalogViewModel = ({
  activeProgramInstance = null,
  activeStyleSelection = null,
} = {}) => ({
  programSections: buildGroupedSections({
    items: listProgramDefinitions(),
    labelMap: PROGRAM_CATEGORY_LABELS,
    modelBuilder: buildProgramCardModel,
    activeId: activeProgramInstance?.programDefinitionId || "",
  }),
  styleSections: buildGroupedSections({
    items: listStyleDefinitions(),
    labelMap: STYLE_CATEGORY_LABELS,
    modelBuilder: buildStyleCardModel,
    activeId: activeStyleSelection?.styleDefinitionId || "",
  }),
});

export const createProgramInstance = ({
  programDefinition = null,
  userId = "local",
  fidelityMode = PROGRAM_FIDELITY_MODES.adaptToMe,
  compatibilityAssessment = null,
  athleteProfile = null,
  activationDate = new Date().toISOString(),
} = {}) => {
  if (!programDefinition?.id) return null;
  return {
    userId,
    programDefinitionId: programDefinition.id,
    frozenVersion: programDefinition.version || "1.0.0",
    activationDate,
    selectedMode: fidelityMode === PROGRAM_FIDELITY_MODES.useAsStyle
      ? PROGRAM_SELECTION_MODES.programAsStyle
      : PROGRAM_SELECTION_MODES.program,
    fidelityMode,
    adaptationInputs: {
      activeGoalIds: Array.isArray(athleteProfile?.goals) ? athleteProfile.goals.filter((goal) => goal?.active).map((goal) => goal.id) : [],
      daysPerWeek: athleteProfile?.userProfile?.daysPerWeek || null,
      sessionLength: athleteProfile?.userProfile?.sessionLength || "",
      equipmentAccess: athleteProfile?.trainingContext?.equipmentAccess?.items || [],
      environment: athleteProfile?.trainingContext?.environment?.value || "",
    },
    compatibilitySnapshot: cloneValue(compatibilityAssessment || null),
    weeklyPlanSnapshotLinks: [],
    status: "active",
    archivedAt: null,
  };
};

export const createStyleSelection = ({
  styleDefinition = null,
  userId = "local",
  compatibleWithCurrentPlan = true,
  influenceLevel = "standard",
  activationDate = new Date().toISOString(),
} = {}) => {
  if (!styleDefinition?.id) return null;
  return {
    userId,
    styleDefinitionId: styleDefinition.id,
    activationDate,
    compatibleWithCurrentPlan: Boolean(compatibleWithCurrentPlan),
    influenceLevel,
    status: "active",
  };
};

export const buildProgramSelectionHistoryEntry = ({
  action = "updated",
  programDefinition = null,
  styleDefinition = null,
  fidelityMode = "",
  reason = "",
  createdAt = new Date().toISOString(),
} = {}) => ({
  action,
  createdAt,
  programId: programDefinition?.id || "",
  programName: programDefinition?.displayName || "",
  styleId: styleDefinition?.id || "",
  styleName: styleDefinition?.displayName || "",
  fidelityMode: fidelityMode || "",
  reason: String(reason || "").trim(),
});

export const buildActiveBasisSnapshot = ({
  programsState = {},
} = {}) => {
  const normalized = normalizeProgramsSelectionState(programsState);
  return {
    activeProgramDefinition: getProgramDefinitionById(normalized?.activeProgramInstance?.programDefinitionId || ""),
    activeStyleDefinition: getStyleDefinitionById(normalized?.activeStyleSelection?.styleDefinitionId || ""),
  };
};
