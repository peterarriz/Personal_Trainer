export const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];

export const sanitizeText = (value = "", maxLength = 240) => String(value || "").replace(/\s+/g, " ").trim().slice(0, maxLength);

export const sanitizeSlug = (value = "", maxLength = 80) => sanitizeText(value, maxLength)
  .toLowerCase()
  .replace(/[^a-z0-9._:-]+/g, "_")
  .replace(/^_+|_+$/g, "");

export const toFiniteNumber = (value, fallback = null) => {
  if (value === "" || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const toFiniteInteger = (value, fallback = null) => {
  const parsed = toFiniteNumber(value, fallback);
  return parsed === null ? fallback : Math.round(parsed);
};

export const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, Number.isFinite(Number(value)) ? Number(value) : min));

export const roundTo = (value, digits = 4) => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  const factor = 10 ** digits;
  return Math.round(parsed * factor) / factor;
};

export const average = (values = []) => {
  const list = toArray(values)
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value));
  if (!list.length) return null;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
};

export const hashString = (value = "") => {
  const text = String(value || "");
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash) + text.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
};

export const stableSortValue = (value = null) => {
  if (Array.isArray(value)) return value.map((item) => stableSortValue(item));
  if (value && typeof value === "object") {
    return Object.keys(value).sort().reduce((acc, key) => {
      acc[key] = stableSortValue(value[key]);
      return acc;
    }, {});
  }
  return value;
};

export const stableStringify = (value = null) => JSON.stringify(stableSortValue(value), null, 2);

export const tokenizeLabel = (value = "") => sanitizeText(value, 120).replace(/[_-]+/g, " ");

export const humanizeEnum = (value = "") => {
  const text = tokenizeLabel(value).toLowerCase();
  if (!text) return "";
  return text.replace(/\b\w/g, (char) => char.toUpperCase());
};

export const pickFirstDefined = (...values) => {
  for (const value of values) {
    if (value !== undefined && value !== null && value !== "") return value;
  }
  return null;
};

export const bandNumber = (value, bands = []) => {
  const safeValue = toFiniteNumber(value, null);
  if (safeValue === null) return "";
  for (const band of toArray(bands)) {
    if (safeValue >= Number(band.min ?? Number.NEGATIVE_INFINITY) && safeValue < Number(band.max ?? Number.POSITIVE_INFINITY)) {
      return String(band.label || "").trim();
    }
  }
  return "";
};

export const daysToMs = (days = 0) => Math.max(0, Number(days) || 0) * 24 * 60 * 60 * 1000;

export const sortByScoreThenSample = (items = [], {
  scoreKey = "score",
  sampleKey = "sampleSize",
} = {}) => (
  [...toArray(items)].sort((left, right) => {
    const rightScore = Number(right?.[scoreKey] || 0);
    const leftScore = Number(left?.[scoreKey] || 0);
    if (rightScore !== leftScore) return rightScore - leftScore;
    const rightSample = Number(right?.[sampleKey] || 0);
    const leftSample = Number(left?.[sampleKey] || 0);
    if (rightSample !== leftSample) return rightSample - leftSample;
    return String(left?.id || left?.label || "").localeCompare(String(right?.id || right?.label || ""));
  })
);
