export const sanitizeIntakeText = (text = "") => String(text || "")
  .replaceAll("Ã¢â‚¬â€", "-")
  .replaceAll("Ã¢â‚¬â€œ", "-")
  .replaceAll("Ã¢â‚¬Â¢", " • ")
  .replaceAll("Ã¢â‚¬Â¦", "...")
  .replaceAll("Ã¢â‚¬â„¢", "'")
  .replaceAll("Ã‚Â·", " - ")
  .replaceAll("Ã‚Â", "");

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
