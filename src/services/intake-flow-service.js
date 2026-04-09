import { sanitizeDisplayCopy } from "./text-format-service.js";

export const sanitizeIntakeText = (text = "") => sanitizeDisplayCopy(text);

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
