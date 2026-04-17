const MOJIBAKE_PATTERN = /(?:ÃƒÆ’.|Ãƒâ€š|ÃƒÂ¢Ã¢â€šÂ¬|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢|ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ|ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“|ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â|ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦|Ã¯Â¿Â½)/;

const COMMON_MOJIBAKE_REPLACEMENTS = [
  ["ÃƒÆ’Â¢ÃƒÂ¢Ã¢â‚¬Å¡Â¬â€", "Ã¢â‚¬â€"],
  ["ÃƒÆ’Â¢ÃƒÂ¢Ã¢â‚¬Å¡Â¬Ãƒâ€šÂ¦", "Ã¢â‚¬Â¦"],
  ["ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·", "\u00b7"],
  ["ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¢", "\u2022"],
  ["ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â", "\u2014"],
  ["ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ", "\u2013"],
  ["ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â¦", "\u2026"],
  ["ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬ÃƒÂ¢Ã¢â‚¬Å¾Ã‚Â¢", "\u2019"],
  ["ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€¦Ã¢â‚¬Å“", "\u201c"],
  ["ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â", "\u201d"],
  ["ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢", "\u2192"],
  ["ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã‹Å“", "\u2191"],
  ["ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ", "\u2193"],
  ["ÃƒÆ’Ã†â€™ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â", "\u00d7"],
  ["ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â°", "\u00b0"],
  ["ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·", "\u00b7"],
  ["Ãƒâ€šÃ‚Â·", "\u00b7"],
  ["Ãƒâ€š", ""],
];

const SIMPLE_MOJIBAKE_NORMALIZATIONS = Object.freeze([
  ["\u00c2\u00b7", " - "],
  ["\u00e2\u20ac\u00a2", " - "],
  ["\u00e2\u20ac\u201c", " - "],
  ["\u00e2\u20ac\u201d", " - "],
  ["\u00e2\u20ac\u00a6", "..."],
  ["\u00e2\u20ac\u0153", "\""],
  ["\u00e2\u20ac\u009d", "\""],
  ["\u00e2\u20ac\u2122", "'"],
  ["\u00c3\u00d7", "x"],
  ["\u00c2\u00b0", " deg"],
]);

const suspiciousScore = (value = "") => {
  const matches = String(value || "").match(/(?:ÃƒÆ’.|Ãƒâ€š|ÃƒÂ¢.|Ã¯Â¿Â½)/g);
  return matches ? matches.length : 0;
};

const decodeLatin1AsUtf8 = (value = "") => {
  const input = String(value || "");
  const bytes = Uint8Array.from(Array.from(input).map((char) => char.charCodeAt(0) & 0xff));
  if (typeof TextDecoder !== "undefined") {
    return new TextDecoder("utf-8", { fatal: false }).decode(bytes);
  }
  const percentEncoded = Array.from(bytes).map((byte) => `%${byte.toString(16).padStart(2, "0")}`).join("");
  try {
    return decodeURIComponent(percentEncoded);
  } catch {
    return input;
  }
};

const normalizeSimpleMojibake = (value = "") => {
  let current = String(value || "");
  SIMPLE_MOJIBAKE_NORMALIZATIONS.forEach(([broken, fixed]) => {
    current = current.replaceAll(broken, fixed);
  });
  return current;
};

const normalizeSpacing = (value = "") => String(value || "")
  .replace(/\s+-\s+-\s+/g, " - ")
  .replace(/\s{2,}/g, " ")
  .trim();

export const repairMojibakeText = (value = "") => {
  let current = String(value || "");
  if (!current || !MOJIBAKE_PATTERN.test(current)) return normalizeSpacing(normalizeSimpleMojibake(current));

  for (const [broken, fixed] of COMMON_MOJIBAKE_REPLACEMENTS) {
    current = current.replaceAll(broken, fixed);
  }

  if (!MOJIBAKE_PATTERN.test(current)) return normalizeSpacing(normalizeSimpleMojibake(current));

  for (let i = 0; i < 2; i += 1) {
    const decoded = decodeLatin1AsUtf8(current);
    if (!decoded || decoded === current) break;
    if (suspiciousScore(decoded) > suspiciousScore(current)) break;
    current = decoded;
    if (!MOJIBAKE_PATTERN.test(current)) break;
  }

  for (const [broken, fixed] of COMMON_MOJIBAKE_REPLACEMENTS) {
    current = current.replaceAll(broken, fixed);
  }

  return normalizeSpacing(normalizeSimpleMojibake(current));
};

export const DISPLAY_SEPARATORS = {
  middot: " - ",
  bullet: " - ",
  emDash: " - ",
};

const normalizePlainTextPunctuation = (value = "") => normalizeSimpleMojibake(String(value || ""))
  .replace(/[\u2013\u2014]/g, " - ")
  .replace(/\u2026/g, "...")
  .replace(/[\u201c\u201d]/g, "\"")
  .replace(/\u2019/g, "'")
  .replace(/\u00d7/g, "x")
  .replace(/\u00b0/g, " deg")
  .replace(/\s+-\s+-\s+/g, " - ")
  .replace(/\s{2,}/g, " ")
  .trim();

const DISPLAY_COPY_TOKEN_REPLACEMENTS = Object.freeze({
  anchor_id: "question",
  appearance_proxy_anchor_kind: "appearance proxy",
  appearance_proxy_plan: "appearance proxy plan",
  body_comp: "body composition",
  canonical_writes: "saved details",
  confirmation_snapshot_id: "confirmation",
  current_bodyweight: "current bodyweight",
  current_run_frequency: "runs per week",
  current_strength_baseline: "current strength baseline",
  current_waist: "current waist",
  field_id: "field",
  general_fitness: "general fitness",
  goal_id: "goal",
  goal_stack_confirmation: "goal order",
  intake_completeness: "intake details",
  longest_recent_run: "longest recent run",
  missing_required_context: "missing context",
  multi_bind_mode: "multi-answer mode",
  recent_pace_baseline: "recent race result or pace",
  recent_swim_anchor: "recent swim anchor",
  running_endurance_anchor_kind: "running benchmark",
  starting_capacity_anchor: "safe starting capacity",
  style_only: "style only",
  swim_access_reality: "swim reality",
  target_timeline: "target timing",
  target_weight_change: "target weight change",
  transition_id: "step",
});

const DISPLAY_COPY_CAMEL_REPLACEMENTS = Object.freeze({
  canonicalwrites: "saved details",
  confirmationsnapshotid: "confirmation",
  currentanchor: "current question",
  fieldid: "field",
  goalstackconfirmation: "goal order",
  missingrequired: "missing details",
  nextrequiredfieldid: "next detail",
  reviewmodel: "review",
  transitionid: "step",
});

const DISPLAY_COPY_PHRASE_REPLACEMENTS = [
  [/\bprogram_suspended_fallback\b/gi, "safer fallback"],
  [/\bgoal_driven_with_style\b/gi, "goal-driven with style"],
  [/\bprogram_used_as_style\b/gi, "program used as a style"],
  [/\bprogram_backbone\b/gi, "program-led structure"],
];

const preserveReplacementCase = (source = "", replacement = "") => {
  if (!source) return replacement;
  if (source.toUpperCase() === source) return replacement.toUpperCase();
  if (source[0] === source[0]?.toUpperCase()) {
    return `${replacement.charAt(0).toUpperCase()}${replacement.slice(1)}`;
  }
  return replacement;
};

const humanizeTechnicalToken = (token = "") => {
  const normalized = String(token || "").trim();
  if (!normalized) return "";
  const replacement = DISPLAY_COPY_TOKEN_REPLACEMENTS[normalized.toLowerCase()]
    || normalized.replaceAll("_", " ");
  return preserveReplacementCase(normalized, replacement);
};

export const joinDisplayParts = (parts = [], separator = DISPLAY_SEPARATORS.middot) => (
  normalizePlainTextPunctuation(repairMojibakeText((parts || []).filter(Boolean).join(separator)))
);

export const sanitizeDisplayCopy = (value = "") => {
  let current = repairMojibakeText(String(value || ""));
  if (!current) return "";

  current = current.replace(/`+/g, "");
  DISPLAY_COPY_PHRASE_REPLACEMENTS.forEach(([pattern, replacement]) => {
    current = current.replace(pattern, (match) => preserveReplacementCase(match, replacement));
  });
  current = current.replace(/\b[a-z]+(?:_[a-z0-9]+)+\b/g, (token) => humanizeTechnicalToken(token));
  current = current.replace(/\b[a-z]+(?:[A-Z][a-z0-9]+)+\b/g, (token) => {
    const replacement = DISPLAY_COPY_CAMEL_REPLACEMENTS[token.toLowerCase()];
    return replacement ? preserveReplacementCase(token, replacement) : token;
  });

  current = normalizeSimpleMojibake(current);
  return current
    .replace(/[\u2013\u2014]/g, " - ")
    .replace(/\u2026/g, "...")
    .replace(/[\u201c\u201d]/g, "\"")
    .replace(/\u2019/g, "'")
    .replace(/\u00d7/g, "x")
    .replace(/\u00b0/g, " deg")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+-\s+-\s+/g, " - ")
    .trim();
};
