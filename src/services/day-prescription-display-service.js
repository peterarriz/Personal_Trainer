import { sanitizeDisplayCopy } from "./text-format-service.js";
import { getMovementExplanation } from "./movement-explanation-service.js";

const sanitizeText = (value = "", maxLength = 240) => sanitizeDisplayCopy(String(value || "").replace(/\s+/g, " ").trim()).slice(0, maxLength);
const normalizeDisplayNumber = (value = "") => sanitizeText(value, 40);

const TYPE_LABELS = {
  "easy-run": "Easy run",
  "hard-run": "Quality run",
  "long-run": "Long run",
  "run+strength": "Run + strength",
  "strength+prehab": "Strength",
  "swim-technique": "Technique swim",
  "swim-aerobic": "Aerobic swim",
  "swim-threshold": "Threshold swim",
  "swim-endurance": "Endurance swim",
  "power-skill": "Power session",
  "reactive-plyo": "Reactive plyometrics",
  "sprint-support": "Sprint support",
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
  "swim-technique": "Build technique, rhythm, and clean swim mechanics.",
  "swim-aerobic": "Build aerobic swim durability without turning the day into a race effort.",
  "swim-threshold": "Build threshold pacing while protecting technique quality.",
  "swim-endurance": "Build sustained swim endurance and pacing control.",
  "power-skill": "Build explosive intent without sloppy fatigue.",
  "reactive-plyo": "Build reactive ability and clean elastic contacts.",
  "sprint-support": "Keep sprint and approach rhythm connected to the week.",
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
  { pattern: /^technique swim$/i, label: "Technique swim" },
  { pattern: /^aerobic swim$/i, label: "Aerobic swim" },
  { pattern: /^threshold swim$/i, label: "Threshold swim" },
  { pattern: /^long aerobic swim$/i, label: "Long aerobic swim" },
  { pattern: /^jump technique \+ power$/i, label: "Jump technique + power" },
  { pattern: /^reactive plyometrics$/i, label: "Reactive plyometrics" },
  { pattern: /^sprint \/ approach support$/i, label: "Sprint / approach support" },
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
  const explanation = getMovementExplanation(sessionLabel || training?.label || training?.type || "");
  if (explanation?.found && explanation.whatItIs) return explanation.whatItIs;

  const rawLabel = sanitizeText(training?.label || "", 120);
  const safeLabel = sanitizeText(sessionLabel || rawLabel, 120);
  if (!safeLabel) return "";
  if (/push\/pull/i.test(rawLabel) || /push\/pull/i.test(safeLabel)) return "Push/pull means you alternate pressing and rowing or pull-down work in the same session.";
  return "";
};

const PURPOSE_LABEL_RULES = [
  { pattern: /full-body strength/i, purpose: "Build full-body strength with repeatable main lifts and accessories." },
  { pattern: /upper-body push\/pull/i, purpose: "Build upper-body strength without asking much from your legs." },
  { pattern: /strength circuit/i, purpose: "Keep strength work dense enough to support body-comp or work-capacity goals." },
  { pattern: /strength finish/i, purpose: "Get the main run done, then add a short strength touchpoint." },
  { pattern: /conditioning intervals/i, purpose: "Build work capacity without turning the day into a full run session." },
  { pattern: /easy conditioning run|easy run\/walk/i, purpose: "Add low-stress aerobic work without stealing recovery from bigger sessions." },
  { pattern: /technique swim/i, purpose: "Groove technique and aerobic rhythm without turning the day into a grind." },
  { pattern: /threshold swim/i, purpose: "Build threshold swim pacing while keeping stroke quality honest." },
  { pattern: /jump technique \+ power|reactive plyometrics/i, purpose: "Build explosive quality while protecting tendon freshness." },
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

const resolvePrescribedExercises = ({ training = {}, prescribedExercises = [] } = {}) => {
  if (Array.isArray(prescribedExercises) && prescribedExercises.length > 0) return prescribedExercises;
  const candidates = [
    ...(Array.isArray(training?.prescribedExercises) ? training.prescribedExercises : []),
    ...(Array.isArray(training?.exerciseRows) ? training.exerciseRows : []),
    ...(Array.isArray(training?.strengthExercises) ? training.strengthExercises : []),
    ...(Array.isArray(training?.exercises) ? training.exercises : []),
    ...(Array.isArray(training?.strength?.rows) ? training.strength.rows : []),
  ];
  return candidates.filter(Boolean);
};

const parseExerciseStructure = (entry = {}) => {
  const sets = normalizeDisplayNumber(entry?.sets || "");
  const reps = normalizeDisplayNumber(entry?.reps || "");
  if (sets && reps) return sanitizeText(`${sets} x ${reps}`, 80);
  if (sets) return sanitizeText(sets, 80);
  if (reps) return sanitizeText(reps, 80);
  return "";
};

const buildPlanRow = ({
  title = "",
  detail = "",
  note = "",
} = {}) => ({
  title: sanitizeText(title, 120) || "Planned block",
  detail: sanitizeText(detail, 140),
  note: sanitizeText(note, 180),
});

const buildRunPlanRows = (training = {}) => {
  const run = training?.run || null;
  if (!run) return [];
  const focus = sanitizeText(run?.t || training?.label || "Run", 80);
  if (/interval/i.test(focus)) {
    return [
      buildPlanRow({
        title: "Warm-up jog",
        detail: "10-15 min easy + drills",
        note: "Stay relaxed and gradually raise cadence.",
      }),
      buildPlanRow({
        title: "Main interval set",
        detail: run?.d || "As prescribed",
        note: "Recoveries are built into the set. Keep form tall.",
      }),
      buildPlanRow({
        title: "Cool-down",
        detail: "8-12 min easy jog or walk",
        note: "Bring effort down gradually before you stop.",
      }),
    ];
  }
  if (/tempo|steady/i.test(focus)) {
    return [
      buildPlanRow({
        title: "Warm-up",
        detail: "10-15 min easy + strides",
        note: "Prime mechanics before the harder work starts.",
      }),
      buildPlanRow({
        title: "Tempo segment",
        detail: run?.d || "As prescribed",
        note: "Controlled discomfort with even pacing.",
      }),
      buildPlanRow({
        title: "Cool-down",
        detail: "8-12 min easy",
        note: "Finish smooth and conversational.",
      }),
    ];
  }
  if (/long/i.test(focus)) {
    return [
      buildPlanRow({
        title: "Long aerobic run",
        detail: run?.d || "As prescribed",
        note: "Stay easy enough to keep the whole session repeatable.",
      }),
      buildPlanRow({
        title: "Fuel and hydration",
        detail: "Water + carbs as needed",
        note: "Start fueling before you feel depleted.",
      }),
      buildPlanRow({
        title: "Post-run reset",
        detail: "5-10 min walk + calf/hip mobility",
        note: "Downshift gradually to support recovery.",
      }),
    ];
  }
  return [
    buildPlanRow({
      title: "Easy aerobic run",
      detail: run?.d || "As prescribed",
      note: "Keep the pace conversational and smooth.",
    }),
    buildPlanRow({
      title: "Strides (optional)",
      detail: "4-6 x 15-20 sec",
      note: "Quick feet, relaxed upper body.",
    }),
    buildPlanRow({
      title: "Cool-down walk",
      detail: "5 min",
      note: "Finish calm and controlled.",
    }),
  ];
};

const buildSwimPlanRows = (training = {}) => {
  const swim = training?.swim || null;
  if (!swim) return [];
  const primaryLine = sanitizeText(swim?.setLine || swim?.d || "", 140);
  return [
    buildPlanRow({
      title: sanitizeText(swim?.focus || training?.label || "Swim set", 120),
      detail: primaryLine || "As prescribed",
      note: sanitizeText(swim?.note || "Keep the stroke quality cleaner than the fatigue.", 180),
    }),
  ];
};

const buildPowerPlanRows = (training = {}) => {
  const power = training?.power || null;
  if (!power && !training?.optionalSecondary && !training?.strengthDose) return [];
  return [
    buildPlanRow({
      title: sanitizeText(power?.focus || training?.label || "Power block", 120),
      detail: sanitizeText(power?.support || power?.dose || training?.strengthDose || training?.fallback || "As prescribed", 140),
      note: sanitizeText(training?.intensityGuidance || power?.note || "Keep the quality explosive without dragging into fatigue.", 180),
    }),
  ];
};

const buildSupportPlanRows = (training = {}) => {
  const supportBlocks = Array.isArray(training?.supportBlocks) ? training.supportBlocks : [];
  const explicitBlocks = supportBlocks
    .map((block = {}) => buildPlanRow({
      title: block?.title || "Support work",
      detail: block?.detail || block?.dose || block?.summary || "",
      note: block?.note || training?.supportSummary || "",
    }))
    .filter((row) => row.detail || row.note);
  if (explicitBlocks.length > 0) return explicitBlocks;

  const optionalSecondary = sanitizeText(training?.optionalSecondary || "", 160);
  if (!optionalSecondary) return [];
  return [
    buildPlanRow({
      title: "Support work",
      detail: optionalSecondary,
      note: sanitizeText(training?.supportSummary || training?.environmentNote || "", 180),
    }),
  ];
};

const buildStrengthPlanRows = ({ training = {}, prescribedExercises = [] } = {}) => {
  const rawType = sanitizeText(training?.type || "", 40).toLowerCase();
  const isStrengthSession = ["strength", "strength+prehab", "run+strength"].includes(rawType) || Boolean(training?.strSess);
  if (!isStrengthSession) return [];

  const rows = resolvePrescribedExercises({ training, prescribedExercises })
    .map((entry = {}) => {
      const exercise = sanitizeText(entry?.ex || entry?.exercise || entry?.exercise_name || "", 120);
      if (!exercise) return null;
      const structure = parseExerciseStructure(entry);
      const movementNote = sanitizeText(
        getMovementExplanation(exercise)?.whatItIs || entry?.cue || entry?.note || "",
        140
      );
      return buildPlanRow({
        title: exercise,
        detail: structure,
        note: movementNote,
      });
    })
    .filter(Boolean);
  return rows;
};

const buildSessionPlanPreview = ({ training = {}, prescribedExercises = [] } = {}) => {
  const safeTraining = training && typeof training === "object" ? training : {};
  const rawType = sanitizeText(safeTraining?.type || "", 40).toLowerCase();
  const sections = [];

  const runRows = buildRunPlanRows(safeTraining);
  if (runRows.length) {
    sections.push({
      key: "run",
      title: sanitizeText(safeTraining?.run?.t || "Run block", 80),
      rows: runRows,
    });
  }

  const strengthRows = buildStrengthPlanRows({ training: safeTraining, prescribedExercises });
  if (strengthRows.length) {
    sections.push({
      key: "strength",
      title: sanitizeText(
        safeTraining?.strSess
          ? `Strength ${safeTraining.strSess}`
          : ["run+strength", "strength+prehab", "strength"].includes(rawType)
          ? "Strength block"
          : "Session plan",
        80
      ),
      rows: strengthRows,
    });
  }

  const swimRows = buildSwimPlanRows(safeTraining);
  if (swimRows.length) {
    sections.push({
      key: "swim",
      title: "Swim block",
      rows: swimRows,
    });
  }

  const powerRows = buildPowerPlanRows(safeTraining);
  if (powerRows.length && !sections.some((section) => section.key === "strength")) {
    sections.push({
      key: "support",
      title: "Support block",
      rows: powerRows,
    });
  }

  const supportRows = buildSupportPlanRows(safeTraining);
  if (supportRows.length) {
    sections.push({
      key: "support_work",
      title: "Support work",
      rows: supportRows,
    });
  }

  const rows = sections.flatMap((section) => section.rows || []);
  const summaryOnly = rows.length === 0 && Boolean(safeTraining?.label || safeTraining?.type);
  return {
    available: rows.length > 0,
    rows,
    sections,
    summaryOnly,
    note: summaryOnly ? "This stored workout is still summary-level right now." : "",
  };
};

const buildStructure = (training = {}) => {
  if (training?.run?.d) {
    return sanitizeText(`${training.run.t ? `${training.run.t}: ` : ""}${training.run.d}`, 180);
  }
  if (training?.swim?.d || training?.swim?.setLine) {
    return sanitizeText([
      training?.swim?.focus ? `${training.swim.focus}:` : "",
      training?.swim?.setLine || training?.swim?.d || "",
    ].filter(Boolean).join(" "), 180);
  }
  if (training?.power?.dose || training?.power?.support) {
    return sanitizeText([
      training?.power?.focus || "",
      training?.power?.support || training?.power?.dose || "",
    ].filter(Boolean).join(" - "), 180);
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
  prescribedExercises = [],
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
  const sessionPlan = buildSessionPlanPreview({
    training: safeTraining,
    prescribedExercises,
  });
  const exercisePreview = {
    available: sessionPlan.available,
    rows: (sessionPlan.rows || []).map((row) => ({
      exercise: row.title,
      structure: row.detail,
      movementNote: row.note,
    })),
    sections: sessionPlan.sections,
    summaryOnly: sessionPlan.summaryOnly,
    note: sessionPlan.note,
  };

  return {
    sessionLabel,
    sessionType,
    purpose,
    structure,
    expectedDuration,
    movementNote,
    sessionPlan,
    exercisePreview,
    why,
  };
};
