export const dedupeStrings = (values = []) => (
  Array.from(new Set((values || []).map((value) => String(value || "").trim()).filter(Boolean)))
);
