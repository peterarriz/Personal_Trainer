import { INTAKE_MACHINE_STATES } from "./intake-machine-service.js";
import { sanitizeDisplayCopy } from "./text-format-service.js";

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const sanitizeDisplayLine = (value = "", maxLength = 240) => sanitizeDisplayCopy(sanitizeText(value, maxLength));

const sanitizeVisibleAnchorCard = (anchor = {}, index = 0) => ({
  ...anchor,
  question: sanitizeDisplayLine(anchor?.question || "", 220),
  label: sanitizeDisplayLine(anchor?.label || "", 160),
  placeholder: sanitizeDisplayLine(anchor?.placeholder || "", 120),
  helper_text: sanitizeDisplayLine(anchor?.helper_text || "", 180),
  examples: toArray(anchor?.examples).map((item) => sanitizeDisplayLine(item, 120)).filter(Boolean),
  why_it_matters: sanitizeDisplayLine(anchor?.why_it_matters || "", 220),
  coach_voice_line: sanitizeDisplayLine(anchor?.coach_voice_line || "", 220),
  validation: anchor?.validation
    ? {
        ...anchor.validation,
        message: sanitizeDisplayLine(anchor?.validation?.message || "", 220),
      }
    : anchor?.validation,
  unit_options: toArray(anchor?.unit_options).map((item) => ({
    ...item,
    label: sanitizeDisplayLine(item?.label || item?.value || "", 60),
  })),
  options: toArray(anchor?.options).map((item) => ({
    ...item,
    label: sanitizeDisplayLine(item?.label || item?.value || "", 120),
    description: sanitizeDisplayLine(item?.description || "", 180),
  })),
  status_label: sanitizeDisplayLine(anchor?.status_label || (index === 0 ? "NOW" : "NEXT"), 20),
});

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
    heading: sanitizeDisplayLine(totalRemaining > 1
      ? "A few quick details before I lock this in."
      : "One quick detail before I lock this in.", 160),
    progressLabel: sanitizeDisplayLine(totalRemaining > 0
      ? `${totalRemaining} required ${totalRemaining === 1 ? "detail" : "details"} left`
      : "All required details are covered.", 120),
    helperText: sanitizeDisplayLine(totalRemaining > 1
      ? "We'll handle these one at a time. Lower cards are only there so you can see what comes next."
      : "This is the last required detail before review.", 220),
    goalSummary: sanitizeDisplayLine(goalSummary, 160),
    activeFieldId: sanitizeText(currentAnchor?.field_id || "", 80),
    totalRemaining,
    visibleCards: missingAnchors.slice(0, safeMaxVisibleCards).map((anchor, index) => sanitizeVisibleAnchorCard({
      ...anchor,
      stack_position: index + 1,
      is_active: index === 0,
      status_label: index === 0 ? "NOW" : "NEXT",
    }, index)),
  };
};
