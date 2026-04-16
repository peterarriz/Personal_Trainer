import { sanitizeDisplayCopy } from "./text-format-service.js";

const normalizeText = (value = "") => String(value || "").replace(/\s+/g, " ").trim();
const sanitizeText = (value = "", maxLength = 240) => normalizeText(value).slice(0, maxLength);
const toArray = (value) => Array.isArray(value) ? value : value == null ? [] : [value];
const sanitizeDisplayLine = (value = "", maxLength = 220) => sanitizeDisplayCopy(sanitizeText(value, maxLength));
const stripLegacyCoachPrefix = (value = "") => normalizeText(value).replace(/^coach note:\s*/i, "");
const sanitizeSupportLine = (value = "", maxLength = 180) => sanitizeDisplayLine(stripLegacyCoachPrefix(value), maxLength);

const ALLOWED_PHRASING_KEYS = new Set(["questionText", "helperText", "reassuranceLine"]);
const SCHEMA_WORD_PATTERN = /\b(field_id|anchor|schema|canonical|validation|goal_id|required field|transition_id)\b/i;
const CLAIM_PATTERN = /\b(guarantee|guaranteed|promise|promised|definitely|certainly|for sure|always|never|i know|i can tell|you will definitely|this will absolutely)\b/i;

const sanitizeCoachVoiceLine = (value = "", maxLength = 220) => sanitizeText(value, maxLength);
const validateCoachVoiceLine = (value = "", maxLength = 220) => {
  const normalized = normalizeText(value);
  if (!normalized || normalized.length > maxLength) return "";
  return normalized;
};

export const buildDeterministicCoachVoiceCopy = (anchor = null) => ({
  questionText: sanitizeDisplayLine(anchor?.question || anchor?.label || "", 220),
  helperText: sanitizeDisplayLine(anchor?.why_it_matters || anchor?.helper_text || "", 220),
  reassuranceLine: sanitizeSupportLine(anchor?.coach_voice_line || "", 180),
});

export const buildCoachVoicePrompt = ({
  field_id = "",
  label = "",
  question_template = "",
  why_it_matters = "",
  examples = [],
  tone = "supportive_trainer",
} = {}) => {
  const safeFieldId = sanitizeText(field_id, 80);
  const safeLabel = sanitizeText(label, 140);
  const safeQuestion = sanitizeText(question_template, 220);
  const safeWhy = sanitizeText(why_it_matters, 220);
  const safeTone = sanitizeText(tone, 60) || "supportive_trainer";
  const safeExamples = toArray(examples).map((item) => sanitizeText(item, 120)).filter(Boolean).slice(0, 4);

  return `You are writing intake phrasing for a fitness app. Respond ONLY with valid JSON, no other text.

You are rephrasing one already-chosen intake field. You may not introduce new questions, new required details, goal changes, or coaching claims.

KNOWN_FIELD:
- field_id: ${safeFieldId}
- label: ${safeLabel}
- question_template: ${safeQuestion}
- why_it_matters: ${safeWhy}
- examples: ${safeExamples.length ? safeExamples.join(" | ") : "none"}
- tone: ${safeTone}

Return JSON in this exact format:
{
  "questionText": "single friendly question for the same field only",
  "helperText": "one short sentence explaining why this helps",
  "reassuranceLine": "one short reassuring coach note"
}

RULES:
- Keep the same meaning as question_template.
- Do not ask for any additional information beyond this one field.
- Do not mention field_id, anchors, schemas, validation, canonical state, or goal changes.
- Do not make promises, medical claims, or certainty claims.
- questionText must be one question only.
- helperText and reassuranceLine must be statements, not questions.
- Keep questionText <= 160 chars, helperText <= 170 chars, reassuranceLine <= 170 chars.`;
};

export const sanitizeCoachVoiceVariant = ({
  phrasing = null,
} = {}) => {
  if (!phrasing || typeof phrasing !== "object" || Array.isArray(phrasing)) return null;
  const keys = Object.keys(phrasing || {});
  if (!keys.length || keys.some((key) => !ALLOWED_PHRASING_KEYS.has(key))) return null;

  const questionText = validateCoachVoiceLine(phrasing?.questionText || "", 220);
  const helperText = validateCoachVoiceLine(phrasing?.helperText || "", 220);
  const reassuranceLine = validateCoachVoiceLine(phrasing?.reassuranceLine || "", 180);
  if (!questionText || !helperText || !reassuranceLine) return null;

  const allLines = [questionText, helperText, reassuranceLine];
  if (allLines.some((line) => SCHEMA_WORD_PATTERN.test(line) || CLAIM_PATTERN.test(line))) return null;
  if ((questionText.match(/\?/g) || []).length !== 1) return null;
  if (/\?/.test(helperText) || /\?/.test(reassuranceLine)) return null;

  return {
    questionText: sanitizeDisplayLine(questionText, 220),
    helperText: sanitizeDisplayLine(helperText, 220),
    reassuranceLine: sanitizeSupportLine(reassuranceLine, 180),
  };
};

export const resolveCoachVoiceDisplayCopy = ({
  anchor = null,
  phrasing = null,
} = {}) => {
  const fallback = buildDeterministicCoachVoiceCopy(anchor);
  const sanitized = sanitizeCoachVoiceVariant({ phrasing });
  return sanitized || fallback;
};
