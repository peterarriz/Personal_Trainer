const sanitizeText = (value = "", maxLength = 220) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

const uniqueStrings = (items = [], maxLength = 180) => {
  const seen = new Set();
  return (Array.isArray(items) ? items : [])
    .map((item) => sanitizeText(item, maxLength))
    .filter(Boolean)
    .filter((item) => {
      const key = item.toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
};

export const INTAKE_TRAJECTORY_USER_MODES = Object.freeze({
  exactMetric: "exact_metric",
  fuzzyGoal: "fuzzy_goal",
});

export const resolveIntakeTrajectoryUserMode = (measurabilityTier = "") => (
  sanitizeText(measurabilityTier, 40).toLowerCase() === "fully_measurable"
    ? INTAKE_TRAJECTORY_USER_MODES.exactMetric
    : INTAKE_TRAJECTORY_USER_MODES.fuzzyGoal
);

const groupPhaseBlocks = (roadmapRows = [], totalWeeks = 12) => {
  const safeRows = (Array.isArray(roadmapRows) ? roadmapRows : []).filter(Boolean);
  if (!safeRows.length) return [];
  return safeRows.reduce((blocks, row, index) => {
    const phaseKey = sanitizeText(row?.phaseKey || row?.phaseLabel || `phase_${index + 1}`, 80).toLowerCase();
    const phaseLabel = sanitizeText(row?.phaseLabel || row?.phaseKey || `Phase ${index + 1}`, 80);
    const weekNumber = Number(row?.absoluteWeek || index + 1);
    const currentBlock = blocks[blocks.length - 1];
    if (currentBlock && currentBlock.phaseKey === phaseKey) {
      currentBlock.endWeek = weekNumber;
      currentBlock.isCurrent = currentBlock.isCurrent || Boolean(row?.isCurrentWeek);
      currentBlock.cutback = currentBlock.cutback || Boolean(row?.cutback);
      currentBlock.focus = currentBlock.focus || sanitizeText(row?.focus || "", 140);
      return blocks;
    }
    blocks.push({
      phaseKey,
      label: phaseLabel,
      startWeek: weekNumber,
      endWeek: weekNumber,
      weeksLabel: `Weeks ${weekNumber}-${weekNumber}`,
      isCurrent: Boolean(row?.isCurrentWeek),
      cutback: Boolean(row?.cutback),
      focus: sanitizeText(row?.focus || "", 140),
    });
    return blocks;
  }, []).map((block, index, blocks) => ({
    ...block,
    weeksLabel: `Weeks ${block.startWeek}-${block.endWeek}`,
    isNext: !block.isCurrent && blocks.findIndex((entry) => entry.isCurrent) >= 0
      ? index === blocks.findIndex((entry) => entry.isCurrent) + 1
      : index === 1,
    segmentLength: block.endWeek - block.startWeek + 1,
    totalWeeks,
  }));
};

const buildCollapsedSummary = ({
  currentBlock = null,
  nextBlock = null,
  userMode = INTAKE_TRAJECTORY_USER_MODES.exactMetric,
} = {}) => {
  if (userMode === INTAKE_TRAJECTORY_USER_MODES.fuzzyGoal) {
    if (currentBlock?.label && nextBlock?.label) return `${currentBlock.label} now, ${nextBlock.label} later`;
    return `${currentBlock?.label || "Opening rung"} starts the direction`;
  }
  if (currentBlock?.label && nextBlock?.label) return `${currentBlock.label} now, ${nextBlock.label} next`;
  return `${currentBlock?.label || "Opening rung"} starts week 1`;
};

const buildOpeningLine = ({
  userMode = INTAKE_TRAJECTORY_USER_MODES.exactMetric,
  primaryCategory = "",
  currentRow = null,
  currentBlock = null,
} = {}) => {
  if (userMode === INTAKE_TRAJECTORY_USER_MODES.fuzzyGoal) {
    if (sanitizeText(primaryCategory, 40).toLowerCase() === "body_comp") {
      return "The block starts by making the body-comp lane visible before it pretends the exact outcome is pinned down.";
    }
    return "The block starts by making the direction repeatable before the target tightens into something more exact.";
  }
  const currentFocus = sanitizeText(currentRow?.focus || currentBlock?.focus || "", 140);
  const longRunLabel = sanitizeText(currentRow?.longRunLabel || "", 80);
  if (sanitizeText(primaryCategory, 40).toLowerCase() === "running" && longRunLabel && longRunLabel !== "No long run") {
    return `${longRunLabel} is the first visible rung because your current anchor gives this block honest runway.`;
  }
  if (sanitizeText(primaryCategory, 40).toLowerCase() === "strength" && Number(currentRow?.strengthCount || 0) > 0) {
    return `${currentRow.strengthLabel || "Strength work"} is visible from the opening rung because the target is specific enough to dose right away.`;
  }
  return currentFocus
    ? `${currentFocus} is where week 1 starts inside the visible arc.`
    : `${currentBlock?.label || "The opening rung"} is where week 1 starts inside the visible arc.`;
};

const buildNextGateLine = ({
  userMode = INTAKE_TRAJECTORY_USER_MODES.exactMetric,
  primaryCategory = "",
  currentRow = null,
  nextRow = null,
  nextBlock = null,
} = {}) => {
  if (userMode === INTAKE_TRAJECTORY_USER_MODES.fuzzyGoal) {
    if (sanitizeText(primaryCategory, 40).toLowerCase() === "body_comp") {
      return "Next gate: a few repeatable weeks plus one stable proxy trend tighten the target without inventing fake certainty.";
    }
    return "Next gate: a few repeatable weeks and one clearer anchor let the plan tighten what it is really chasing.";
  }
  const longRunLabel = sanitizeText(nextRow?.longRunLabel || "", 80);
  if (sanitizeText(primaryCategory, 40).toLowerCase() === "running" && longRunLabel && longRunLabel !== "No long run") {
    return `Next gate: ${longRunLabel} and one clean quality week open the next rung.`;
  }
  if (sanitizeText(primaryCategory, 40).toLowerCase() === "strength" && Number(nextRow?.strengthCount || 0) > 0) {
    return `Next gate: keep ${nextRow.strengthLabel || "strength frequency"} visible so the next build step is earned honestly.`;
  }
  if (nextBlock?.label) {
    return `Next gate: ${nextBlock.label} opens once the opening weeks land cleanly enough to support it.`;
  }
  return "Next gate: land the opening weeks cleanly before asking the block for more.";
};

export const buildIntakeTrajectoryArcModel = ({
  roadmapRows = [],
  trajectoryHeader = null,
  primaryCategory = "",
  measurabilityTier = "",
  totalWeeks = 12,
} = {}) => {
  const safeRows = (Array.isArray(roadmapRows) ? roadmapRows : []).filter(Boolean);
  if (!safeRows.length) return null;

  const currentRow = safeRows.find((row) => row?.isCurrentWeek) || safeRows[0] || null;
  const nextRow = safeRows.find((row) => row?.isNextWeek) || safeRows[1] || null;
  const phaseBlocks = groupPhaseBlocks(safeRows.slice(0, Math.max(1, Number(totalWeeks) || 12)), totalWeeks);
  const currentBlockIndex = phaseBlocks.findIndex((block) => block.isCurrent);
  const safeCurrentIndex = currentBlockIndex >= 0 ? currentBlockIndex : 0;
  const currentBlock = phaseBlocks[safeCurrentIndex] || null;
  const nextBlock = phaseBlocks[safeCurrentIndex + 1] || null;
  const userMode = resolveIntakeTrajectoryUserMode(measurabilityTier);
  const modeLabel = userMode === INTAKE_TRAJECTORY_USER_MODES.exactMetric ? "Metric-led" : "Direction-led";

  return {
    isReady: true,
    defaultExpanded: false,
    heading: "12-week arc",
    summary: buildCollapsedSummary({
      currentBlock,
      nextBlock,
      userMode,
    }),
    supporting: userMode === INTAKE_TRAJECTORY_USER_MODES.exactMetric
      ? "See how week 1 fits into the visible block."
      : "See the direction before the target tightens.",
    modeLabel,
    currentLabel: currentBlock?.label || sanitizeText(trajectoryHeader?.chapterLabel || "Opening rung", 80),
    nextLabel: nextBlock?.label || sanitizeText(trajectoryHeader?.nextMilestoneLine || "Next rung", 80),
    openingLabel: "Why week 1 starts here",
    openingLine: buildOpeningLine({
      userMode,
      primaryCategory,
      currentRow,
      currentBlock,
    }),
    gateLabel: "Next gate",
    gateLine: buildNextGateLine({
      userMode,
      primaryCategory,
      currentRow,
      nextRow,
      nextBlock,
    }),
    trustLine: userMode === INTAKE_TRAJECTORY_USER_MODES.exactMetric
      ? "The visible arc covers the next 12 weeks, not the whole finish line."
      : "The visible arc gives direction first. Precision can tighten once the opening block proves the lane.",
    phaseBlocks: phaseBlocks.map((block) => ({
      ...block,
      status: block.isCurrent ? "current" : block.isNext ? "next" : block.startWeek < Number(currentRow?.absoluteWeek || 1) ? "done" : "upcoming",
    })),
    notes: uniqueStrings([
      sanitizeText(trajectoryHeader?.trajectoryLine || "", 160),
      sanitizeText(trajectoryHeader?.arcLine || "", 140),
    ]),
    userMode,
  };
};

export default buildIntakeTrajectoryArcModel;
