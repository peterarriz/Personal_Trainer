import { sanitizeDisplayCopy } from "./text-format-service.js";

const normalizeNumericToken = (value = "") => sanitizeDisplayCopy(String(value || "").trim()).slice(0, 24);

const findIndexedMatch = (pattern = null, raw = "") => {
  if (!pattern) return null;
  const match = pattern.exec(raw);
  if (!match) return null;
  return {
    index: Number(match.index || 0),
    match,
  };
};

const resolveEarliestMatch = (matches = []) => {
  const indexedMatches = matches.filter(Boolean);
  if (!indexedMatches.length) return null;
  return indexedMatches.sort((left, right) => left.index - right.index)[0];
};

export const formatRunTarget = (value = "") => {
  const raw = sanitizeDisplayCopy(String(value || "").trim());
  if (!raw) return "";

  const minuteRange = findIndexedMatch(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:min|mins|minutes?)\b/i, raw);
  const mileRange = findIndexedMatch(/(\d+(?:\.\d+)?)\s*(?:-|to)\s*(\d+(?:\.\d+)?)\s*(?:miles?|mi)\b/i, raw);
  const minuteExact = findIndexedMatch(/(\d+(?:\.\d+)?)\s*(?:min|mins|minutes?)\b/i, raw);
  const mileExact = findIndexedMatch(/(\d+(?:\.\d+)?)\s*(?:miles?|mi)\b/i, raw);

  const earliest = resolveEarliestMatch([minuteRange, mileRange, minuteExact, mileExact]);
  if (!earliest) return raw;

  const [startValue, endValue] = earliest.match.slice(1, 3).map((token) => normalizeNumericToken(token || ""));
  const isMinuteMatch = earliest === minuteRange || earliest === minuteExact;
  const suffix = isMinuteMatch ? "min" : "mi";

  if (earliest === minuteRange || earliest === mileRange) {
    return `${startValue}-${endValue} ${suffix}`.trim();
  }
  return `${startValue} ${suffix}`.trim();
};

export default formatRunTarget;
