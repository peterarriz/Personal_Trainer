export const STYLE_INFLUENCE_LEVELS = Object.freeze({
  light: "light",
  standard: "standard",
  high: "high",
});

const normalizeList = (items = []) => (Array.isArray(items) ? items : []).map((item) => String(item || "").trim()).filter(Boolean);

export const resolveStyleOverlayImpact = ({
  styleDefinition = null,
  influenceLevel = STYLE_INFLUENCE_LEVELS.standard,
  programDefinition = null,
} = {}) => {
  if (!styleDefinition?.id) return null;
  const intensity =
    influenceLevel === STYLE_INFLUENCE_LEVELS.high ? "The overlay has permission to visibly shape weekly feel and exercise menu."
    : influenceLevel === STYLE_INFLUENCE_LEVELS.light ? "The overlay is a nudge, not a takeover."
    : "The overlay should be felt clearly, but it should never break the core plan.";

  const lockedRules = [
    programDefinition?.displayName ? `Keep the core structure of ${programDefinition.displayName}.` : "",
    "Hard safety, injury, schedule, and equipment rules still win first.",
  ].filter(Boolean);

  const adaptableElements = [
    `${styleDefinition.displayName} can bias exercise selection.`,
    `${styleDefinition.displayName} can bias weekly feel and progression tone.`,
    styleDefinition?.cardioBias ? `Cardio posture shifts toward ${String(styleDefinition.cardioBias).replaceAll("_", " ")}.` : "",
  ].filter(Boolean);

  return {
    styleId: styleDefinition.id,
    influenceLevel,
    biasSummary: `${styleDefinition.displayName} biases the plan toward ${styleDefinition.styleBiases?.weeklyFeel || "its intended training feel"}. ${intensity}`,
    lockedRules,
    adaptableElements,
    caveats: normalizeList(styleDefinition?.incompatiblePrograms || []).length && programDefinition?.id && normalizeList(styleDefinition.incompatiblePrograms).includes(programDefinition.id)
      ? [`${styleDefinition.displayName} is not meant to layer onto ${programDefinition.displayName}.`]
      : [],
  };
};

export const isStyleCompatibleWithProgram = ({
  styleDefinition = null,
  programDefinition = null,
} = {}) => {
  if (!styleDefinition?.id || !programDefinition?.id) return true;
  const incompatible = normalizeList(styleDefinition?.incompatiblePrograms || []);
  if (incompatible.includes(programDefinition.id)) return false;
  const compatible = normalizeList(styleDefinition?.compatiblePrograms || []);
  if (!compatible.length) return true;
  return compatible.includes(programDefinition.id);
};

export const buildStyleOverlayPreview = ({
  styleDefinition = null,
  influenceLevel = STYLE_INFLUENCE_LEVELS.standard,
  programDefinition = null,
} = {}) => {
  const overlay = resolveStyleOverlayImpact({
    styleDefinition,
    influenceLevel,
    programDefinition,
  });
  if (!overlay) return null;
  return {
    title: styleDefinition.displayName,
    summary: styleDefinition.summary,
    biasSummary: overlay.biasSummary,
    emphasisBits: [
      styleDefinition?.volumeBias ? `Volume: ${String(styleDefinition.volumeBias).replaceAll("_", " ")}` : "",
      styleDefinition?.intensityBias ? `Intensity: ${String(styleDefinition.intensityBias).replaceAll("_", " ")}` : "",
      styleDefinition?.cardioBias ? `Cardio: ${String(styleDefinition.cardioBias).replaceAll("_", " ")}` : "",
      styleDefinition?.aestheticsBias ? `Aesthetic bias: ${String(styleDefinition.aestheticsBias).replaceAll("_", " ")}` : "",
    ].filter(Boolean),
    lockedRules: overlay.lockedRules,
    adaptableElements: overlay.adaptableElements,
    caveats: overlay.caveats,
  };
};
