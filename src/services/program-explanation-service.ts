import {
  PROGRAM_FIDELITY_MODES,
  PROGRAM_SOURCE_BASIS_LABELS,
  SOURCE_CONFIDENCE_LABELS,
} from "./program-catalog-service.ts";
import { buildCompatibilityHeadline, COMPATIBILITY_OUTCOMES } from "./program-compatibility-service.ts";
import { resolveStyleOverlayImpact } from "./style-overlay-service.ts";

const formatModeLabel = (mode = "") => (
  mode === PROGRAM_FIDELITY_MODES.runAsWritten ? "Run mostly as written"
  : mode === PROGRAM_FIDELITY_MODES.useAsStyle ? "Use as a style"
  : "Adapt to me"
);

const toSentence = (value = "") => {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  if (!text) return "";
  return /[.!?]$/.test(text) ? text : `${text}.`;
};

const joinBits = (bits = []) => bits.filter(Boolean).join(" ");
const uniqueCaveats = (items = []) => Array.from(new Set(items.filter(Boolean)));

export const buildPlanBasisExplanation = ({
  athleteProfile = null,
  activeProgramInstance = null,
  activeStyleSelection = null,
  programDefinition = null,
  styleDefinition = null,
  compatibilityAssessment = null,
} = {}) => {
  const goals = Array.isArray(athleteProfile?.goals) ? athleteProfile.goals.filter((goal) => goal?.active) : [];
  const daysPerWeek = athleteProfile?.userProfile?.daysPerWeek || 0;
  const equipment = athleteProfile?.trainingContext?.equipmentAccess?.items || athleteProfile?.userProfile?.equipmentAccess || [];
  const equipmentLine = Array.isArray(equipment) && equipment.length ? `Current equipment: ${equipment.join(", ")}.` : "Equipment is still fairly general.";
  const scheduleLine = daysPerWeek ? `Current schedule reality looks like about ${daysPerWeek} sessions per week.` : "Weekly availability still needs to be pinned down more clearly.";

  if (!activeProgramInstance && !activeStyleSelection) {
    return {
      basisType: "default_goal_driven",
      basisSummary: goals.length
        ? "Your plan is currently coming from FORMA's goal-driven default logic."
        : "Your plan is currently coming from FORMA's default foundation logic.",
      personalizationSummary: joinBits([
        goals.length ? `Active goals: ${goals.map((goal) => goal?.name).filter(Boolean).slice(0, 2).join(" and ")}.` : "No formal goal is required to keep planning useful.",
        scheduleLine,
        equipmentLine,
      ]),
      sourceConfidence: "high",
      caveats: [],
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  if (activeProgramInstance && activeStyleSelection && programDefinition && styleDefinition) {
    const overlay = resolveStyleOverlayImpact({ styleDefinition, influenceLevel: activeStyleSelection?.influenceLevel, programDefinition });
    return {
      basisType: "program_plus_style",
      basisSummary: `${programDefinition.displayName} is the backbone, with ${styleDefinition.displayName} layered on top as a style influence.`,
      personalizationSummary: joinBits([
        `${formatModeLabel(activeProgramInstance?.fidelityMode)} is active for the program layer.`,
        scheduleLine,
        equipmentLine,
        overlay?.biasSummary || "",
      ]),
      sourceConfidence: programDefinition?.sourceConfidence || styleDefinition?.sourceConfidence || "medium",
      caveats: [
        compatibilityAssessment?.outcome === COMPATIBILITY_OUTCOMES.caution ? "The style layer is allowed, but adaptation matters." : "",
      ].filter(Boolean),
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  if (activeProgramInstance && programDefinition) {
    const fidelityMode = activeProgramInstance?.fidelityMode || PROGRAM_FIDELITY_MODES.adaptToMe;
    const basisType =
      fidelityMode === PROGRAM_FIDELITY_MODES.runAsWritten ? "program_run_as_written"
      : fidelityMode === PROGRAM_FIDELITY_MODES.useAsStyle ? "program_used_as_style"
      : "program_adapted";
    const summary =
      fidelityMode === PROGRAM_FIDELITY_MODES.runAsWritten
        ? `${programDefinition.displayName} is your active program backbone.`
        : fidelityMode === PROGRAM_FIDELITY_MODES.useAsStyle
        ? `${programDefinition.displayName} is influencing the plan as a style rather than a literal template.`
        : `${programDefinition.displayName} is the backbone, but it is being adapted to your current reality.`;

    return {
      basisType,
      basisSummary: summary,
      personalizationSummary: joinBits([
        `${formatModeLabel(fidelityMode)} is active.`,
        scheduleLine,
        equipmentLine,
        compatibilityAssessment?.reasons?.[0] || "",
      ]),
      sourceConfidence: programDefinition?.sourceConfidence || "medium",
      caveats: uniqueCaveats([
        compatibilityAssessment?.outcome === COMPATIBILITY_OUTCOMES.caution ? "This program needs visible adaptation to stay honest." : "",
        "Safety, schedule, equipment, and injury rules still outrank the template.",
      ]),
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  return {
    basisType: "goal_driven_with_style",
    basisSummary: `${styleDefinition?.displayName || "Selected style"} is biasing the current goal-driven plan.`,
    personalizationSummary: joinBits([
      styleDefinition?.summary || "",
      scheduleLine,
      equipmentLine,
    ]),
    sourceConfidence: styleDefinition?.sourceConfidence || "medium",
    caveats: ["The style layer nudges the plan, but it does not override safety or core goal logic."],
    lastUpdatedAt: new Date().toISOString(),
  };
};

export const buildProgramCardExplanation = ({
  programDefinition = null,
} = {}) => {
  if (!programDefinition?.id) return null;
  return {
    title: programDefinition.displayName,
    summary: programDefinition.explanationTemplate?.cardSummary || programDefinition.summary,
    basisLine: PROGRAM_SOURCE_BASIS_LABELS[programDefinition.sourceBasis] || "Source-backed basis",
    confidenceLine: SOURCE_CONFIDENCE_LABELS[programDefinition.sourceConfidence] || "Confidence noted",
    commitmentLine: `${programDefinition.typicalSessionsPerWeek.typical} sessions/week • about ${programDefinition.typicalDurationWeeks} weeks`,
    cautionLine: programDefinition?.contraindications?.[0] || "",
  };
};

export const buildStyleCardExplanation = ({
  styleDefinition = null,
} = {}) => {
  if (!styleDefinition?.id) return null;
  return {
    title: styleDefinition.displayName,
    summary: styleDefinition.explanationTemplate?.cardSummary || styleDefinition.summary,
    basisLine: PROGRAM_SOURCE_BASIS_LABELS[styleDefinition.sourceBasis] || "Source-backed basis",
    confidenceLine: SOURCE_CONFIDENCE_LABELS[styleDefinition.sourceConfidence] || "Confidence noted",
    emphasisLine: `${styleDefinition.volumeBias} volume • ${styleDefinition.intensityBias} intensity • ${styleDefinition.cardioBias} cardio`,
  };
};

export const buildActivationConfirmationCopy = ({
  programDefinition = null,
  styleDefinition = null,
  fidelityMode = PROGRAM_FIDELITY_MODES.adaptToMe,
  compatibilityAssessment = null,
} = {}) => {
  if (programDefinition?.id) {
    return {
      headline: buildCompatibilityHeadline(compatibilityAssessment),
      body: joinBits([
        `${programDefinition.displayName} is ready to activate in ${formatModeLabel(fidelityMode).toLowerCase()} mode.`,
        compatibilityAssessment?.reasons?.[0] || "",
      ]),
      detail: programDefinition.explanationTemplate?.activationSummary || "",
    };
  }
  if (styleDefinition?.id) {
    return {
      headline: buildCompatibilityHeadline(compatibilityAssessment),
      body: joinBits([
        `${styleDefinition.displayName} is ready to bias the current plan.`,
        compatibilityAssessment?.reasons?.[0] || "",
      ]),
      detail: styleDefinition.explanationTemplate?.overlaySummary || "",
    };
  }
  return null;
};

export const buildCompatibilityWarningCopy = ({
  compatibilityAssessment = null,
} = {}) => {
  if (!compatibilityAssessment) return null;
  return {
    headline: buildCompatibilityHeadline(compatibilityAssessment),
    body: compatibilityAssessment?.reasons?.[0] || "",
    details: compatibilityAssessment?.requiredChanges || [],
  };
};

export const buildTodayBasisExplanation = ({
  basisExplanation = null,
} = {}) => {
  if (!basisExplanation) return "";
  return toSentence(`${basisExplanation.basisSummary} ${basisExplanation.personalizationSummary}`);
};

export const buildProgramWeekExplanation = ({
  basisExplanation = null,
  currentBlockLabel = "",
} = {}) => {
  if (!basisExplanation) return "";
  return toSentence(joinBits([
    basisExplanation.basisSummary,
    currentBlockLabel ? `The visible week is still filtered through ${currentBlockLabel.toLowerCase()}.` : "",
  ]));
};
