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

const SESSION_LABEL_RULES = [
  { pattern: /^strength ([ab])$/i, build: (match) => `Full-body strength ${String(match?.[1] || "").toUpperCase()}` },
  { pattern: /^strength priority ([ab])$/i, build: (match) => `Full-body strength ${String(match?.[1] || "").toUpperCase()}` },
  { pattern: /^metabolic strength ([ab])$/i, build: (match) => `Strength circuit ${String(match?.[1] || "").toUpperCase()}` },
  { pattern: /^upper push\/pull strength$/i, label: "Upper-body push/pull strength" },
  { pattern: /^quality run \+ strength$/i, label: "Quality run + strength finish" },
  { pattern: /^run \+ strength$/i, label: "Easy run + strength finish" },
  { pattern: /^conditioning \/ otf$/i, label: "Conditioning intervals" },
  { pattern: /^conditioning \(low-friction\)$/i, label: "Low-friction conditioning" },
  { pattern: /^supportive conditioning run$/i, label: "Easy conditioning run" },
  { pattern: /^supportive run\/walk$/i, label: "Easy run/walk" },
  { pattern: /^strength focus$/i, label: "Full-body strength focus" },
  { pattern: /^short version strength$/i, label: "Short full-body strength A" },
  { pattern: /^short version strength ([ab])$/i, build: (match) => `Short full-body strength ${String(match?.[1] || "").toUpperCase()}` },
];

const resolveSessionLabel = (training = {}) => {
  const rawLabel = sanitizeText(training?.label || "", 120);
  if (!rawLabel) {
    const rawType = sanitizeText(training?.type || "", 60).toLowerCase();
    return TYPE_LABELS[rawType] || "Planned session";
  }
  const matchedRule = SESSION_LABEL_RULES.find((rule) => rule.pattern.test(rawLabel));
  if (matchedRule) {
    const match = rawLabel.match(matchedRule.pattern);
    return sanitizeText(matchedRule.build ? matchedRule.build(match, training) : matchedRule.label, 120);
  }
  return rawLabel;
};

const buildMovementNote = (training = {}, sessionLabel = "") => {
  const rawLabel = sanitizeText(training?.label || "", 120);
  const safeLabel = sanitizeText(sessionLabel || rawLabel, 120);
  if (!safeLabel) return "";
  if (/complex/i.test(rawLabel)) return "A complex strings a few movements together before you rest.";
  if (/push\/pull/i.test(rawLabel) || /push\/pull/i.test(safeLabel)) return "Push/pull means you alternate pressing and rowing or pull-down work in the same session.";
  if (/durability/i.test(rawLabel) || /durability/i.test(safeLabel)) return "Durability work is lighter accessory or mobility work that keeps tissues and joints happy.";
  if (/strength (?:priority )?[ab]\b/i.test(rawLabel) || /^full-body strength [ab]\b/i.test(safeLabel.toLowerCase())) {
    return "A/B labels mean alternating lift templates so you hit the same patterns without repeating the exact same order.";
  }
  if (/circuit/i.test(safeLabel)) return "Circuit means you move through paired lifts with shorter rests to keep the session moving.";
  if (/otf|interval/i.test(rawLabel) || /interval/i.test(safeLabel)) return "Intervals are controlled hard efforts with easy recoveries between them.";
  return "";
};

const PURPOSE_LABEL_RULES = [
  { pattern: /full-body strength/i, purpose: "Build full-body strength with repeatable main lifts and accessories." },
  { pattern: /upper-body push\/pull/i, purpose: "Build upper-body strength without asking much from your legs." },
  { pattern: /strength circuit/i, purpose: "Keep strength work dense enough to support body-comp or work-capacity goals." },
  { pattern: /strength finish/i, purpose: "Get the main run done, then add a short strength touchpoint." },
  { pattern: /conditioning intervals/i, purpose: "Build work capacity without turning the day into a full run session." },
  { pattern: /easy conditioning run|easy run\/walk/i, purpose: "Add low-stress aerobic work without stealing recovery from bigger sessions." },
];

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
  const sessionLabel = resolveSessionLabel(safeTraining);
  const sessionType = TYPE_LABELS[rawType] || sanitizeText(rawType.replaceAll("-", " "), 60) || "Session";
  const structure = buildStructure(safeTraining);
  const expectedDuration = safeTraining?.run
    ? estimateRunDuration(safeTraining?.run?.d || structure, rawType)
    : estimateStrengthDuration(safeTraining);
  const labelDrivenPurpose = PURPOSE_LABEL_RULES.find((rule) => rule.pattern.test(sessionLabel))?.purpose || "";
  const purpose = sanitizeText(
    safeTraining?.success
    || labelDrivenPurpose
    || PURPOSE_BY_TYPE[rawType]
    || week?.successDefinition
    || week?.programBlock?.successCriteria?.[0]
    || "Execute the planned session cleanly.",
    180
  );
  const why = includeWhy ? buildWhySummary({ training: safeTraining, week, provenance }) : "";
  const movementNote = buildMovementNote(safeTraining, sessionLabel);

  return {
    sessionLabel,
    sessionType,
    purpose,
    structure,
    expectedDuration,
    movementNote,
    why,
  };
};
