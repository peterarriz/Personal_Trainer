import { sanitizeDisplayCopy } from "./text-format-service.js";

const sanitizeText = (value = "", maxLength = 240) => sanitizeDisplayCopy(String(value || "").replace(/\s+/g, " ").trim()).slice(0, maxLength);

const TYPE_LABELS = {
  "easy-run": "Easy run",
  "hard-run": "Quality run",
  "long-run": "Long run",
  "run+strength": "Run + strength",
  "strength+prehab": "Strength",
  conditioning: "Conditioning",
  strength: "Strength",
  recovery: "Recovery",
  rest: "Recovery",
};

const PURPOSE_BY_TYPE = {
  "easy-run": "Build aerobic work without burning recovery.",
  "hard-run": "Drive quality and race-supporting speed.",
  "long-run": "Build endurance and resilience.",
  "run+strength": "Pair run quality with a strength touchpoint.",
  "strength+prehab": "Build or maintain strength while supporting durability.",
  conditioning: "Keep conditioning support in the week without a full run focus.",
  strength: "Build or maintain strength.",
  recovery: "Absorb work and protect the next productive session.",
  rest: "Absorb work and protect the next productive session.",
};

const estimateRunDuration = (detail = "", fallbackType = "") => {
  const text = sanitizeText(detail, 180).toLowerCase();
  if (!text) return fallbackType === "long-run" ? "45-75 min" : "25-45 min";
  const explicitMinutes = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*min\b/g)).reduce((sum, match) => sum + Number(match[1] || 0), 0);
  const miles = Array.from(text.matchAll(/(\d+(?:\.\d+)?)\s*(?:mi|mile|miles)\b/g)).reduce((sum, match) => sum + Number(match[1] || 0), 0);
  if (explicitMinutes > 0 && miles > 0) {
    const estimated = Math.round(explicitMinutes + (miles * 10));
    return `${estimated}-${estimated + 10} min`;
  }
  if (explicitMinutes > 0) return `${Math.round(explicitMinutes)} min`;
  if (miles > 0) {
    const estimated = Math.round(miles * 10.5);
    return `${estimated}-${estimated + 10} min`;
  }
  return fallbackType === "long-run" ? "45-75 min" : "25-45 min";
};

const estimateStrengthDuration = (training = {}) => (
  sanitizeText(training?.strengthDuration || training?.strengthDose || "", 80)
  || "20-35 min"
);

const buildStructure = (training = {}) => {
  if (training?.run?.d) {
    return sanitizeText(`${training.run.t ? `${training.run.t}: ` : ""}${training.run.d}`, 180);
  }
  if (training?.strengthDose) return sanitizeText(training.strengthDose, 180);
  if (training?.strengthDuration) {
    const strengthLane = training?.strSess ? `Strength ${training.strSess}` : "Strength work";
    return sanitizeText(`${strengthLane} for ${training.strengthDuration}`, 180);
  }
  if (training?.fallback) return sanitizeText(training.fallback, 180);
  return sanitizeText(training?.label || training?.type || "Planned session", 180);
};

const buildWhySummary = ({ training = {}, week = {}, provenance = null } = {}) => {
  return sanitizeText(
    training?.explanation
    || training?.todayPlan?.reason
    || provenance?.summary
    || week?.weeklyIntent?.focus
    || week?.summary
    || week?.programBlock?.summary
    || "",
    180
  );
};

export const buildDayPrescriptionDisplay = ({
  training = null,
  week = {},
  provenance = null,
  includeWhy = true,
} = {}) => {
  const safeTraining = training && typeof training === "object" ? training : {};
  const rawType = sanitizeText(safeTraining?.type || "", 40).toLowerCase();
  const sessionType = TYPE_LABELS[rawType] || sanitizeText(rawType.replaceAll("-", " "), 60) || "Session";
  const structure = buildStructure(safeTraining);
  const expectedDuration = safeTraining?.run
    ? estimateRunDuration(safeTraining?.run?.d || structure, rawType)
    : estimateStrengthDuration(safeTraining);
  const purpose = sanitizeText(
    safeTraining?.success
    || PURPOSE_BY_TYPE[rawType]
    || week?.successDefinition
    || week?.programBlock?.successCriteria?.[0]
    || "Execute the planned session cleanly.",
    180
  );
  const why = includeWhy ? buildWhySummary({ training: safeTraining, week, provenance }) : "";

  return {
    sessionType,
    purpose,
    structure,
    expectedDuration,
    why,
  };
};
