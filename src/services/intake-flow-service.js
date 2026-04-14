import { sanitizeDisplayCopy } from "./text-format-service.js";

export const sanitizeIntakeText = (text = "") => sanitizeDisplayCopy(text);

const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

export const INTAKE_INJURY_IMPACT_OPTIONS = Object.freeze([
  "Minor / manageable",
  "Limits running",
  "Limits lifting",
  "Not sure",
]);

export const normalizeIntakeInjuryImpact = (value = "") => {
  const clean = sanitizeText(value, 80).toLowerCase();
  return INTAKE_INJURY_IMPACT_OPTIONS.find((option) => option.toLowerCase() === clean) || "";
};

export const buildIntakeInjuryConstraintContext = ({
  injuryText = "",
  injuryImpact = "",
} = {}) => {
  const cleanInjuryText = sanitizeText(injuryText, 180);
  const normalizedImpact = normalizeIntakeInjuryImpact(injuryImpact);
  const hasCurrentIssue = Boolean(
    cleanInjuryText
    && !/^(none|nothing current|none currently|nope|healthy)$/i.test(cleanInjuryText)
  );
  const summarizedInjuryText = hasCurrentIssue && normalizedImpact
    ? `${cleanInjuryText} (${normalizedImpact})`
    : cleanInjuryText;

  return {
    hasCurrentIssue,
    injuryText: summarizedInjuryText,
    rawInjuryText: cleanInjuryText,
    injuryImpact: normalizedImpact,
    constraints: hasCurrentIssue && summarizedInjuryText ? [summarizedInjuryText] : [],
  };
};

export const normalizeHomeEquipmentResponse = ({
  selection = [],
  otherText = "",
} = {}) => {
  const trimmedOther = String(otherText || "").trim();
  const normalized = [
    ...(Array.isArray(selection) ? selection : []).filter((item) => item && item !== "Other"),
    ...((Array.isArray(selection) ? selection : []).includes("Other") && trimmedOther ? [trimmedOther] : []),
  ];

  return {
    normalized,
    display: normalized.join(" / "),
    otherText: trimmedOther,
  };
};
