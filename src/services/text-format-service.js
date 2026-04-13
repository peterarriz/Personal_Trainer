const MOJIBAKE_PATTERN = /(?:Ãƒ.|Ã‚|Ã¢â‚¬|Ã¢â‚¬â„¢|Ã¢â‚¬Å“|Ã¢â‚¬Â¢|Ã¢â‚¬â€œ|Ã¢â‚¬â€|Ã¢â‚¬Â¦|ï¿½)/;
const COMMON_MOJIBAKE_REPLACEMENTS = [
  ["Ãƒ¢Ã¢â€š¬”", "â€”"],
  ["Ãƒ¢Ã¢â€š¬Ã‚¦", "â€¦"],
  ["ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â·", "\u00b7"],
  ["ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¢", "\u2022"],
  ["ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â", "\u2014"],
  ["ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“", "\u2013"],
  ["ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â¦", "\u2026"],
  ["ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢", "\u2019"],
  ["ÃƒÂ¢Ã¢â€šÂ¬Ã…â€œ", "\u201c"],
  ["ÃƒÂ¢Ã¢â€šÂ¬Ã‚Â", "\u201d"],
  ["ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢", "\u2192"],
  ["ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬Ëœ", "\u2191"],
  ["ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬Å“", "\u2193"],
  ["ÃƒÆ’Ã¢â‚¬â€", "\u00d7"],
  ["Ãƒâ€šÃ‚Â°", "\u00b0"],
  ["Ãƒâ€šÃ‚Â·", "\u00b7"],
  ["Ã‚Â·", "\u00b7"],
  ["Ã‚", ""],
];

const suspiciousScore = (value = "") => {
  const matches = String(value || "").match(/(?:Ãƒ.|Ã‚|Ã¢.|ï¿½)/g);
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

export const repairMojibakeText = (value = "") => {
  let current = String(value || "");
  if (!current || !MOJIBAKE_PATTERN.test(current)) return current;

  for (const [broken, fixed] of COMMON_MOJIBAKE_REPLACEMENTS) {
    current = current.replaceAll(broken, fixed);
  }

  if (!MOJIBAKE_PATTERN.test(current)) return current;

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

  return current;
};

export const DISPLAY_SEPARATORS = {
  middot: " \u00b7 ",
  bullet: " \u2022 ",
  emDash: " \u2014 ",
};

const DISPLAY_COPY_TOKEN_REPLACEMENTS = Object.freeze({
  anchor_id: "question",
  appearance_proxy_anchor_kind: "appearance proxy",
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
  running_endurance_anchor_kind: "running benchmark",
  style_only: "style only",
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
  repairMojibakeText((parts || []).filter(Boolean).join(separator))
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

  return current
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
};
