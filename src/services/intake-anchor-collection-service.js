import { INTAKE_MACHINE_STATES } from "./intake-machine-service.js";

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

const clampVisibleCount = (value = 3) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 3;
  return Math.max(1, Math.min(3, Math.round(parsed)));
};

export const buildAnchorCollectionViewModel = ({
  machineState = null,
  maxVisibleCards = 3,
} = {}) => {
  const stage = sanitizeText(machineState?.stage || "", 80);
  const safeMaxVisibleCards = clampVisibleCount(maxVisibleCards);
  const missingAnchors = toArray(machineState?.draft?.missingAnchorsEngine?.missingAnchors)
    .filter(Boolean);
  const currentAnchor = machineState?.draft?.missingAnchorsEngine?.currentAnchor || missingAnchors[0] || null;
  const totalRemaining = missingAnchors.length;
  const goalSummary = sanitizeText(machineState?.draft?.reviewModel?.primarySummary || "", 160);
  const isVisible = stage === INTAKE_MACHINE_STATES.ANCHOR_COLLECTION && Boolean(currentAnchor?.field_id);

  return {
    isVisible,
    stage,
    heading: totalRemaining > 1
      ? "A few quick anchors before I lock this in."
      : "One quick anchor before I lock this in.",
    progressLabel: totalRemaining > 0
      ? `${totalRemaining} required ${totalRemaining === 1 ? "anchor" : "anchors"} left`
      : "All required anchors are covered.",
    helperText: totalRemaining > 1
      ? "We'll handle these one at a time. Lower cards are only there so you can see what comes next."
      : "This is the last required detail before review.",
    goalSummary,
    activeFieldId: sanitizeText(currentAnchor?.field_id || "", 80),
    totalRemaining,
    visibleCards: missingAnchors.slice(0, safeMaxVisibleCards).map((anchor, index) => ({
      ...anchor,
      stack_position: index + 1,
      is_active: index === 0,
      status_label: index === 0 ? "ACTIVE FIELD" : "UP NEXT",
    })),
  };
};
