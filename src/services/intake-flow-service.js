import { sanitizeDisplayCopy } from "./text-format-service.js";
import {
  buildInjuryCapabilityProfile,
  inferInjuryAreaFromText,
  normalizeInjuryArea,
  normalizeInjuryLimitations,
  normalizeInjurySide,
} from "./injury-planning-service.js";

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
  injuryArea = "",
  injurySide = "",
  injuryLimitations = [],
} = {}) => {
  const cleanInjuryText = sanitizeText(injuryText, 180);
  const normalizedImpact = normalizeIntakeInjuryImpact(injuryImpact);
  const normalizedArea = normalizeInjuryArea(injuryArea) || "";
  const inferredArea = inferInjuryAreaFromText(cleanInjuryText) || "";
  const resolvedArea = normalizedArea || inferredArea;
  const normalizedSide = normalizeInjurySide(injurySide);
  const normalizedLimitations = normalizeInjuryLimitations(injuryLimitations);
  const hasCurrentIssue = Boolean(
    (
      cleanInjuryText
      || resolvedArea
      || normalizedLimitations.length
    )
    && !/^(none|nothing current|none currently|nope|healthy)$/i.test(cleanInjuryText)
  );
  const structuredSummary = hasCurrentIssue
    ? [
        resolvedArea || "",
        normalizedSide !== "unspecified" && normalizedSide !== "center"
          ? `(${normalizedSide})`
          : "",
        normalizedLimitations.length
          ? `limits ${normalizedLimitations.map((item) => item.replaceAll("_", " ")).join(", ")}`
          : "",
      ].filter(Boolean).join(" ")
    : "";
  const baseIssueText = cleanInjuryText || structuredSummary;
  const summarizedInjuryText = hasCurrentIssue && normalizedImpact && baseIssueText
    ? `${baseIssueText} (${normalizedImpact})`
    : baseIssueText;
  const capabilityProfile = hasCurrentIssue
    ? buildInjuryCapabilityProfile({
        level: "mild_tightness",
        area: resolvedArea,
        side: normalizedSide,
        notes: cleanInjuryText,
        injuryImpact: normalizedImpact,
        limitations: normalizedLimitations,
        preserveForPlanning: true,
      })
    : null;

  return {
    hasCurrentIssue,
    injuryText: summarizedInjuryText,
    rawInjuryText: cleanInjuryText,
    injuryImpact: normalizedImpact,
    injuryArea: resolvedArea,
    injurySide: normalizedSide,
    injuryLimitations: normalizedLimitations,
    capabilityProfile,
    movementSummary: capabilityProfile?.summaryLine || "",
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
