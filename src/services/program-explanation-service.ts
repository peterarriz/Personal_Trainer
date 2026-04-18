import {
  PROGRAM_FIDELITY_MODES,
  PROGRAM_SOURCE_BASIS_LABELS,
  SOURCE_CONFIDENCE_LABELS,
} from "./program-catalog-service.ts";
import { buildCompatibilityHeadline, COMPATIBILITY_OUTCOMES } from "./program-compatibility-service.ts";
import { resolveStyleOverlayImpact } from "./style-overlay-service.ts";

const formatModeLabel = (mode = "") => (
  mode === PROGRAM_FIDELITY_MODES.runAsWritten ? "Follow closely"
  : mode === PROGRAM_FIDELITY_MODES.useAsStyle ? "Use for feel"
  : "Fit it to me"
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
  const equipmentLine = Array.isArray(equipment) && equipment.length ? `Equipment on hand: ${equipment.join(", ")}.` : "Equipment is still fairly open.";
  const scheduleLine = daysPerWeek ? `Right now, your week looks like about ${daysPerWeek} sessions.` : "Your weekly schedule still has some room to settle in.";

  if (!activeProgramInstance && !activeStyleSelection) {
    return {
      basisType: "default_goal_driven",
      basisSummary: goals.length
        ? "Your plan is built around your goals, schedule, and available equipment."
        : "Your plan is built around your current routine and available equipment.",
      personalizationSummary: joinBits([
        goals.length ? `Main focus: ${goals.map((goal) => goal?.name).filter(Boolean).slice(0, 2).join(" and ")}.` : "You do not need a formal goal to get a useful plan.",
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
      basisSummary: `${programDefinition.displayName} is the main plan, with ${styleDefinition.displayName} shaping the feel.`,
      personalizationSummary: joinBits([
        `${formatModeLabel(activeProgramInstance?.fidelityMode)} is on for the plan.`,
        scheduleLine,
        equipmentLine,
        overlay?.biasSummary || "",
      ]),
      sourceConfidence: programDefinition?.sourceConfidence || styleDefinition?.sourceConfidence || "medium",
      caveats: [
        compatibilityAssessment?.outcome === COMPATIBILITY_OUTCOMES.caution ? "This style fits, but it still needs to match your real week." : "",
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
        ? `${programDefinition.displayName} is your main plan right now.`
        : fidelityMode === PROGRAM_FIDELITY_MODES.useAsStyle
        ? `${programDefinition.displayName} is shaping the feel of your plan instead of setting it day by day.`
        : `${programDefinition.displayName} is your main plan, adjusted to fit your current routine.`;

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
        compatibilityAssessment?.outcome === COMPATIBILITY_OUTCOMES.caution ? "This plan needs a few adjustments to fit your current setup." : "",
        "Safety, schedule, equipment, and injuries still come first.",
      ]),
      lastUpdatedAt: new Date().toISOString(),
    };
  }

  return {
    basisType: "goal_driven_with_style",
    basisSummary: `${styleDefinition?.displayName || "Selected style"} is shaping the feel of your current plan.`,
    personalizationSummary: joinBits([
      styleDefinition?.summary || "",
      scheduleLine,
      equipmentLine,
    ]),
    sourceConfidence: styleDefinition?.sourceConfidence || "medium",
    caveats: ["Style can guide the feel, but it never overrides safety or your main goal."],
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
    basisLine: PROGRAM_SOURCE_BASIS_LABELS[programDefinition.sourceBasis] || "Built for your goals",
    confidenceLine: SOURCE_CONFIDENCE_LABELS[programDefinition.sourceConfidence] || "Fit noted",
    commitmentLine: `${programDefinition.typicalSessionsPerWeek.typical} sessions a week, about ${programDefinition.typicalDurationWeeks} weeks`,
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
    basisLine: PROGRAM_SOURCE_BASIS_LABELS[styleDefinition.sourceBasis] || "Built for your goals",
    confidenceLine: SOURCE_CONFIDENCE_LABELS[styleDefinition.sourceConfidence] || "Fit noted",
    emphasisLine: `${styleDefinition.volumeBias} volume, ${styleDefinition.intensityBias} intensity, ${styleDefinition.cardioBias} cardio`,
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
        `${programDefinition.displayName} is ready in ${formatModeLabel(fidelityMode).toLowerCase()} mode.`,
        compatibilityAssessment?.reasons?.[0] || "",
      ]),
      detail: programDefinition.explanationTemplate?.activationSummary || "",
    };
  }
  if (styleDefinition?.id) {
    return {
      headline: buildCompatibilityHeadline(compatibilityAssessment),
      body: joinBits([
        `${styleDefinition.displayName} is ready to shape your current plan.`,
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
    currentBlockLabel ? `The week on screen is still shaped by ${currentBlockLabel.toLowerCase()}.` : "",
  ]));
};
