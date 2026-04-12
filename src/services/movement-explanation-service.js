import { sanitizeDisplayCopy } from "./text-format-service.js";

const sanitizeText = (value = "", maxLength = 240) => sanitizeDisplayCopy(String(value || "").replace(/\s+/g, " ").trim()).slice(0, maxLength);

const normalizeLookupLabel = (value = "") => sanitizeText(value, 160).toLowerCase();

const createExplanation = ({
  canonicalLabel = "",
  matchedLabel = "",
  whatItIs = "",
  howToDoIt = "",
  repCountsAs = "",
  commonSubstitutions = [],
  cautionNotes = "",
  setupNotes = "",
} = {}) => ({
  canonicalLabel: sanitizeText(canonicalLabel, 120),
  matchedLabel: sanitizeText(matchedLabel || canonicalLabel, 120),
  whatItIs: sanitizeText(whatItIs, 220),
  howToDoIt: sanitizeText(howToDoIt, 220),
  repCountsAs: sanitizeText(repCountsAs, 180),
  commonSubstitutions: (Array.isArray(commonSubstitutions) ? commonSubstitutions : [])
    .map((option) => sanitizeText(option, 80))
    .filter(Boolean)
    .slice(0, 4),
  cautionNotes: sanitizeText(cautionNotes, 180),
  setupNotes: sanitizeText(setupNotes, 180),
});

const MOVEMENT_EXPLANATIONS = [
  {
    key: "push-up-complex",
    patterns: [/^push-up complex$/i, /^pushup complex$/i, /^push up complex$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Push-Up Complex",
      matchedLabel: label,
      whatItIs: "A push-up variation cluster done back-to-back before you rest.",
      howToDoIt: "Move through the listed push-up variations in order and keep the body rigid the whole set.",
      repCountsAs: "One full pass through the listed variations usually counts as one rep or one round.",
      commonSubstitutions: ["Incline push-up series", "Knee push-up series", "DB floor press"],
      cautionNotes: "Stop if your lower back sags or your shoulders lose position.",
      setupNotes: "Know the order before you start so the set stays continuous.",
    }),
  },
  {
    key: "strength-a",
    patterns: [/^strength a$/i, /^full-body strength a$/i, /^short full-body strength a$/i, /^strength priority a$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Strength A",
      matchedLabel: label,
      whatItIs: "The first full-body strength template in an A/B rotation.",
      howToDoIt: "Run the main lifts and accessories in the written order with controlled working sets.",
      repCountsAs: "A rep is one clean lift; finish all prescribed reps before moving on.",
      commonSubstitutions: ["Goblet squat for barbell squat", "DB bench for barbell bench", "DB RDL for barbell hinge"],
      cautionNotes: "Use loads you can move with full range and repeatable form.",
      setupNotes: "Expect a squat, press, pull, and hinge emphasis in some mix.",
    }),
  },
  {
    key: "strength-b",
    patterns: [/^strength b$/i, /^full-body strength b$/i, /^short full-body strength b$/i, /^strength priority b$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Strength B",
      matchedLabel: label,
      whatItIs: "The second full-body strength template in an A/B rotation.",
      howToDoIt: "Run the alternate lift order or movement pairings so you train the same patterns without repeating the exact same session.",
      repCountsAs: "A rep is one clean lift; finish all prescribed reps before moving on.",
      commonSubstitutions: ["Front squat for back squat", "Landmine press for overhead press", "Chest-supported row for barbell row"],
      cautionNotes: "Keep the session crisp instead of turning every set into a max effort.",
      setupNotes: "B days usually shift the main lifts, angles, or loading from A day.",
    }),
  },
  {
    key: "circuit",
    patterns: [/^circuit$/i, /(^| )circuit($| )/i, /^hiit circuit$/i, /^strength circuit [ab]$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Circuit",
      matchedLabel: label,
      whatItIs: "A sequence of exercises done with short transitions and limited rest.",
      howToDoIt: "Move station to station at the written pace, then rest after the full round.",
      repCountsAs: "One completed round through every station counts as one circuit.",
      commonSubstitutions: ["Pair lifts as supersets", "Reduce stations", "Swap cardio tool or implement"],
      cautionNotes: "Do not rush form just to keep the clock moving.",
      setupNotes: "Set up all stations first if space or equipment is limited.",
    }),
  },
  {
    key: "tempo-run",
    patterns: [/^tempo run$/i, /^tempo$/i, /^threshold run$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Tempo Run",
      matchedLabel: label,
      whatItIs: "A sustained comfortably-hard run near threshold effort.",
      howToDoIt: "Settle into a pace you can hold steadily while breathing hard but staying in control.",
      repCountsAs: "The full continuous tempo block or each written tempo segment counts as the work.",
      commonSubstitutions: ["Cruise intervals", "Hill tempo", "Bike or row threshold intervals"],
      cautionNotes: "If pace falls apart early, back off slightly instead of forcing it.",
      setupNotes: "Warm up first and know whether the workout is continuous or broken into segments.",
    }),
  },
  {
    key: "intervals",
    patterns: [/^intervals$/i, /^interval session$/i, /^conditioning intervals$/i, /^tempo intervals$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Intervals",
      matchedLabel: label,
      whatItIs: "Repeated hard efforts separated by easy recoveries.",
      howToDoIt: "Hit the target effort on each work segment, then actually ease off during recovery so quality stays consistent.",
      repCountsAs: "One hard segment plus its recovery is one interval unless the template says otherwise.",
      commonSubstitutions: ["Time-based repeats", "Track repeats", "Bike, rower, or incline treadmill repeats"],
      cautionNotes: "Keep the early reps under control so the last reps still look the same.",
      setupNotes: "Know the work and recovery durations before you start.",
    }),
  },
  {
    key: "prehab",
    patterns: [/^prehab$/i, /(^| )prehab($| )/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Prehab",
      matchedLabel: label,
      whatItIs: "Low-load accessory work meant to keep common problem areas moving and tolerating load.",
      howToDoIt: "Use smooth, controlled reps and stop before pain or compensation takes over.",
      repCountsAs: "A rep is one slow controlled repetition or one completed hold if the drill is timed.",
      commonSubstitutions: ["Band work", "Bodyweight control drills", "Single-leg balance or calf work"],
      cautionNotes: "Treat this as quality tissue work, not a conditioning test.",
      setupNotes: "Pick the issue-specific drills that match the written focus area.",
    }),
  },
  {
    key: "durability-work",
    patterns: [/^durability work$/i, /(^| )durability($| )/i, /^strength \+ durability$/i],
    build: ({ label }) => createExplanation({
      canonicalLabel: "Durability Work",
      matchedLabel: label,
      whatItIs: "Accessory strength and mobility work that helps joints and tissues tolerate the main training load.",
      howToDoIt: "Use light to moderate loading, clean range of motion, and controlled tempo.",
      repCountsAs: "A rep is one smooth controlled repetition; timed carries or holds count by distance or time.",
      commonSubstitutions: ["Single-leg accessory work", "Carries", "Mobility plus stability drills"],
      cautionNotes: "This should leave you feeling better, not cooked.",
      setupNotes: "Good for weak links like calves, hips, trunk, shoulders, and feet.",
    }),
  },
];

const FALLBACK_EXPLANATIONS = [
  {
    pattern: /complex/i,
    build: ({ label }) => createExplanation({
      canonicalLabel: label || "Complex",
      matchedLabel: label,
      whatItIs: "A complex links multiple movements together before you rest.",
      howToDoIt: "Keep moving through the listed sequence without dropping the flow unless the template tells you to reset.",
      repCountsAs: "One full sequence counts as one rep or one round.",
      commonSubstitutions: ["Simplify to fewer moves", "Use lighter load", "Swap to a similar pattern"],
      cautionNotes: "Choose a load you can control through the hardest step.",
    }),
  },
  {
    pattern: /interval/i,
    build: ({ label }) => createExplanation({
      canonicalLabel: label || "Intervals",
      matchedLabel: label,
      whatItIs: "Intervals alternate work and recovery blocks.",
      howToDoIt: "Match the target effort on the work and truly recover between repeats.",
      repCountsAs: "One work block plus one recovery block is usually one rep.",
      commonSubstitutions: ["Time-based repeats", "Bike or rower repeats"],
      setupNotes: "Check work and recovery times before you start.",
    }),
  },
];

const resolveLabelFromInput = (input = "") => {
  if (typeof input === "string") return sanitizeText(input, 160);
  if (input && typeof input === "object") {
    return sanitizeText(
      input.label
      || input.sessionLabel
      || input.name
      || input.title
      || input.type
      || "",
      160
    );
  }
  return "";
};

export const getMovementExplanation = (input = "") => {
  const label = resolveLabelFromInput(input);
  const normalizedLabel = normalizeLookupLabel(label);

  if (!normalizedLabel) {
    return {
      found: false,
      label: "",
      canonicalLabel: "",
      matchedLabel: "",
      whatItIs: "",
      howToDoIt: "",
      repCountsAs: "",
      commonSubstitutions: [],
      cautionNotes: "",
      setupNotes: "",
    };
  }

  const directMatch = MOVEMENT_EXPLANATIONS.find((entry) => entry.patterns.some((pattern) => pattern.test(label)));
  const explanation = directMatch?.build({ label })
    || FALLBACK_EXPLANATIONS.find((entry) => entry.pattern.test(label))?.build({ label });

  if (!explanation) {
    return {
      found: false,
      label,
      canonicalLabel: "",
      matchedLabel: label,
      whatItIs: "",
      howToDoIt: "",
      repCountsAs: "",
      commonSubstitutions: [],
      cautionNotes: "",
      setupNotes: "",
    };
  }

  return {
    found: true,
    label,
    ...explanation,
  };
};

