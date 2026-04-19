const test = require("node:test");
const assert = require("node:assert/strict");

const {
  GOAL_MEASURABILITY_TIERS,
  resolveGoalTranslation,
  applyResolvedGoalsToGoalSlots,
} = require("../src/services/goal-resolution-service.js");
const {
  normalizeGoals,
} = require("../src/services/canonical-athlete-service.js");
const {
  buildGoalTemplateSelection,
} = require("../src/services/goal-template-catalog-service.js");

const DEFAULT_GOAL_SLOTS = [
  { id: "g_primary", name: "Primary goal", type: "ongoing", category: "running", priority: 1, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "progress_tracker" } },
  { id: "g_secondary_1", name: "Secondary goal 1", type: "ongoing", category: "body_comp", priority: 2, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "weekly_checkin", unit: "lb" } },
  { id: "g_secondary_2", name: "Secondary goal 2", type: "ongoing", category: "strength", priority: 3, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "logged_lifts", unit: "lb" } },
  { id: "g_resilience", name: "Resilience", type: "ongoing", category: "injury_prevention", priority: 4, targetDate: "", measurableTarget: "", active: true, tracking: { mode: "progress_tracker" } },
];

const buildIntakePacket = ({
  rawGoalText,
  timingConstraints = [],
  appearanceConstraints = [],
  additionalContext = "",
  injuryText = "",
} = {}) => ({
  version: "2026-04-v1",
  intent: "intake_interpretation",
  intake: {
    rawGoalText,
    baselineContext: {
      primaryGoalLabel: "General Fitness",
      currentBaseline: "Intermediate training background; 4 training days per week available",
    },
    scheduleReality: {
      trainingDaysPerWeek: 4,
      sessionLength: "45 min",
      trainingLocation: "Both",
    },
    equipmentAccessContext: {
      trainingLocation: "Both",
      equipment: ["Dumbbells", "Pull-up bar"],
    },
    injuryConstraintContext: {
      injuryText,
      constraints: injuryText ? [injuryText] : [],
    },
    userProvidedConstraints: {
      timingConstraints,
      appearanceConstraints,
      additionalContext: additionalContext || "Find the balance",
    },
  },
});

test("resolves a fully measurable running goal into a canonical running planning object", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "run a 1:45 half marathon" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-09",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "performance");
  assert.equal(result.resolvedGoals[0].planningCategory, "running");
  assert.equal(result.resolvedGoals[0].measurabilityTier, GOAL_MEASURABILITY_TIERS.fullyMeasurable);
  assert.equal(result.resolvedGoals[0].primaryMetric.key, "half_marathon_time");
  assert.equal(result.resolvedGoals[0].primaryMetric.targetValue, "1:45:00");
  assert.equal(result.planningGoals[0].category, "running");
  assert.match(result.planningGoals[0].measurableTarget, /Half marathon time 1:45:00/i);
});

test("marathon goals resolve to running/event interpretation instead of generic hybrid phrasing", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "I want to run a marathon",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "I want to run a marathon" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "performance");
  assert.equal(result.resolvedGoals[0].planningCategory, "running");
  assert.equal(result.resolvedGoals[0].summary, "Run a marathon");
  assert.ok(result.resolvedGoals[0].proxyMetrics.some((metric) => /run frequency|long run|quality session/i.test(metric.label)));
  assert.doesNotMatch(result.resolvedGoals[0].summary, /hybrid/i);
});

test("half-marathon goals keep a specific event summary instead of generic running wording", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "I want to run a half marathon",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "I want to run a half marathon" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals[0].planningCategory, "running");
  assert.equal(result.resolvedGoals[0].summary, "Run a half marathon");
  assert.doesNotMatch(result.resolvedGoals[0].summary, /hybrid|aerobic base/i);
});

test("swim goals keep swim-specific summaries and domain adapter hints", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "swim a faster mile",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "swim a faster mile" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "performance");
  assert.equal(result.resolvedGoals[0].summary, "Swim a faster mile");
  assert.equal(result.resolvedGoals[0].primaryDomain, "swimming_endurance_technique");
  assert.ok(result.resolvedGoals[0].candidateDomainAdapters.includes("swimming_endurance_technique"));
  assert.ok(result.unresolvedGaps.some((gap) => /pool|swim/i.test(gap)));
});

test("canonical swim-improvement phrasing stays on the structured swim path even with rich swim context", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "improve my swim endurance and technique",
    typedIntakePacket: {
      ...buildIntakePacket({
        rawGoalText: "improve my swim endurance and technique",
        additionalContext: "regular pool access with a recent swim benchmark and room for multiple weekly swims",
      }),
      intake: {
        ...buildIntakePacket({
          rawGoalText: "improve my swim endurance and technique",
          additionalContext: "regular pool access with a recent swim benchmark and room for multiple weekly swims",
        }).intake,
        goalCompletenessContext: {
          fields: {
            recent_swim_anchor: { value: "1000 yd in 22:00", raw: "1000 yd in 22:00" },
            swim_access_reality: { value: "pool", raw: "Pool" },
          },
        },
      },
    },
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-18",
  });

  assert.equal(result.resolvedGoals[0].structuredIntentId, "swim_better");
  assert.equal(result.resolvedGoals[0].planArchetypeId, "swim_endurance_improvement");
  assert.equal(result.resolvedGoals[0].primaryDomain, "swimming_endurance_technique");
});

test("template-first swim goals keep the swim benchmark metric instead of falling back to generic text capture", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "improve my swim speed",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "improve my swim speed",
      additionalContext: "pool access only",
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-14",
  });
  assert.notEqual(result.resolvedGoals[0].primaryMetric?.key, "swim_mile_time");

  const templatedResult = resolveGoalTranslation({
    rawUserGoalIntent: "improve my swim speed",
    typedIntakePacket: {
      ...buildIntakePacket({
        rawGoalText: "improve my swim speed",
        additionalContext: "pool access only",
      }),
      intake: {
        ...buildIntakePacket({
          rawGoalText: "improve my swim speed",
          additionalContext: "pool access only",
        }).intake,
        goalTemplateSelection: buildGoalTemplateSelection({ templateId: "swim_faster_mile" }),
      },
    },
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-14",
  });

  assert.equal(templatedResult.resolvedGoals[0].summary, "Swim a faster mile");
  assert.equal(templatedResult.resolvedGoals[0].primaryMetric?.key, "swim_mile_time");
  assert.equal(templatedResult.resolvedGoals[0].goalTemplateId, "swim_faster_mile");
});

test("canonical recomp phrasing stays structured even when the intake context mentions strength retention", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "lose fat and gain muscle",
    typedIntakePacket: {
      ...buildIntakePacket({
        rawGoalText: "lose fat and gain muscle",
        additionalContext: "Can train consistently and wants body-composition progress without wrecking recovery.",
      }),
      intake: {
        ...buildIntakePacket({
          rawGoalText: "lose fat and gain muscle",
          additionalContext: "Can train consistently and wants body-composition progress without wrecking recovery.",
        }).intake,
        goalCompletenessContext: {
          fields: {
            current_bodyweight: { value: "185", raw: "185" },
            muscle_retention_priority: { value: "high", raw: "High" },
            cardio_preference: { value: "low_impact", raw: "Low impact" },
          },
        },
      },
    },
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-18",
  });

  assert.equal(result.resolvedGoals[0].structuredIntentId, "recomp");
  assert.equal(result.resolvedGoals[0].goalFamily, "body_comp");
  assert.equal(result.resolvedGoals[0].planArchetypeId, "recomp_moderate_cardio");
});

test("canonical hybrid phrasing stays structured even when context mentions both run and lift lanes", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "stronger and fitter",
    typedIntakePacket: {
      ...buildIntakePacket({
        rawGoalText: "stronger and fitter",
        additionalContext: "Has enough room to run and lift, but running clearly leads the current block.",
      }),
      intake: {
        ...buildIntakePacket({
          rawGoalText: "stronger and fitter",
          additionalContext: "Has enough room to run and lift, but running clearly leads the current block.",
        }).intake,
        goalCompletenessContext: {
          fields: {
            hybrid_priority: { value: "running", raw: "Running" },
            current_run_frequency: { value: "4", raw: "4" },
          },
        },
      },
    },
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-18",
  });

  assert.equal(result.resolvedGoals[0].structuredIntentId, "stronger_and_fitter");
  assert.equal(result.resolvedGoals[0].goalFamily, "hybrid");
  assert.equal(result.resolvedGoals[0].planArchetypeId, "strength_conditioning_balanced");
  assert.match(result.resolvedGoals[0].tradeoffs[0] || "", /recovery|lane/i);
});

test("swim goals no longer collapse into running planning categories", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "love swim training again",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "love swim training again",
      additionalContext: "former competitive swimmer returning from burnout. pool access only.",
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-14",
  });

  assert.equal(result.resolvedGoals[0].goalFamily, "performance");
  assert.equal(result.resolvedGoals[0].planningCategory, "general_fitness");
  assert.equal(result.planningGoals[0].category, "general_fitness");
  assert.equal(result.resolvedGoals[0].primaryDomain, "swimming_endurance_technique");
});

test("jiu-jitsu wording does not false-trigger swim parsing from collapse-style substrings", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "cut weight slowly",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "cut weight slowly",
      additionalContext: "slow cut without performance collapse. grappling gym and basic weights.",
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-14",
  });

  assert.equal(result.resolvedGoals[0].goalFamily, "body_comp");
  assert.equal(result.resolvedGoals[0].planningCategory, "body_comp");
  assert.notEqual(result.resolvedGoals[0].primaryDomain, "swimming_endurance_technique");
});

test("pure running goals do not become hybrid even if provider interpretation drifts", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "run a 1:45 half marathon" }),
    aiInterpretationProposal: {
      interpretedGoalType: "hybrid",
      measurabilityTier: "exploratory_fuzzy",
      coachSummary: "Build aerobic base for hybrid training",
    },
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "performance");
  assert.equal(result.resolvedGoals[0].planningCategory, "running");
  assert.equal(result.resolvedGoals[0].summary, "Run a half marathon in 1:45:00");
  assert.doesNotMatch(result.resolvedGoals[0].summary, /hybrid/i);
});

test("measurable event goals infer a usable horizon from season language", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon this fall",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "run a 1:45 half marathon this fall",
      timingConstraints: ["fall"],
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-09",
  });

  assert.equal(result.resolvedGoals[0].planningCategory, "running");
  assert.equal(result.resolvedGoals[0].primaryMetric.key, "half_marathon_time");
  assert.ok(Number.isFinite(result.resolvedGoals[0].targetHorizonWeeks));
  assert.ok(result.resolvedGoals[0].targetHorizonWeeks >= 1);
  assert.ok(!result.unresolvedGaps.some((gap) => /target race date or horizon/i.test(gap)));
});

test("strength goals preserve relative week timelines from raw user wording", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "bench 225 in 6 weeks",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "bench 225 in 6 weeks" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals[0].planningCategory, "strength");
  assert.equal(result.resolvedGoals[0].targetDate, "");
  assert.equal(result.resolvedGoals[0].targetHorizonWeeks, 6);
});

test("explicit open-ended confirmation clears timing without forcing a date or horizon", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "get leaner",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "get leaner" }),
    explicitUserConfirmation: {
      confirmed: true,
      acceptedProposal: true,
      source: "intake_machine",
      edits: {
        openEnded: true,
        targetDate: "open_ended",
      },
    },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals[0].targetDate, "");
  assert.equal(result.resolvedGoals[0].targetHorizonWeeks, null);
});

test("goal-change preview keeps a structured physique resolution when baseline copy mentions recovery", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "lose body fat",
    typedIntakePacket: {
      version: "2026-04-v1",
      intent: "goal_change_preview",
      intake: {
        rawGoalText: "lose body fat",
        baselineContext: {
          primaryGoalLabel: "General Fitness",
          currentBaseline: "Can train consistently and wants body-composition progress without wrecking recovery.",
        },
        scheduleReality: {
          trainingDaysPerWeek: 4,
          sessionLength: "45 min",
          trainingLocation: "Mixed",
        },
        equipmentAccessContext: {
          trainingLocation: "Mixed",
          equipment: ["Dumbbells", "Gym access"],
        },
        injuryConstraintContext: {
          injuryText: "",
          constraints: [],
        },
        userProvidedConstraints: {
          timingConstraints: [],
          appearanceConstraints: [],
          additionalContext: "",
        },
        goalCompletenessContext: {
          fields: {
            current_bodyweight: { value: "185", raw: "185" },
            muscle_retention_priority: { value: "high", raw: "High" },
            cardio_preference: { value: "low_impact", raw: "Low impact" },
          },
        },
      },
    },
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true, source: "goal_change_preview" },
    now: "2026-04-16",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].structuredIntentId, "lose_body_fat");
  assert.match(result.resolvedGoals[0].planArchetypeId || "", /^fat_loss_/);
});

test("resolves a fully measurable strength goal into logged-lift planning input", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "bench 225",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "bench 225" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-09",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "strength");
  assert.equal(result.resolvedGoals[0].planningCategory, "strength");
  assert.equal(result.resolvedGoals[0].measurabilityTier, GOAL_MEASURABILITY_TIERS.fullyMeasurable);
  assert.equal(result.resolvedGoals[0].primaryMetric.key, "bench_press_weight");
  assert.equal(result.planningGoals[0].tracking.mode, "logged_lifts");
  assert.match(result.planningGoals[0].measurableTarget, /225 lb/i);
});

test("muscle-gain goals resolve into strength planning instead of generic consistency fallback", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "gain muscle and build confidence",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "gain muscle and build confidence" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-14",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "strength");
  assert.equal(result.resolvedGoals[0].planningCategory, "strength");
  assert.equal(result.resolvedGoals[0].summary, "Gain muscle with repeatable training");
  assert.equal(result.planningGoals[0].category, "strength");
});

test("strength goal parsing preserves four-digit lift targets for downstream realism checks", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "bench press 2200 lbs",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "bench press 2200 lbs" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals[0].primaryMetric.key, "bench_press_weight");
  assert.equal(result.resolvedGoals[0].primaryMetric.targetValue, "2200");
  assert.match(result.planningGoals[0].measurableTarget, /2200 lb/i);
});

test("marathon time language in minutes stays attached to the marathon goal instead of collapsing to a generic event", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "run a 30 minute marathon",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "run a 30 minute marathon" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.rawIntent, "run a 30 minute marathon");
  assert.equal(result.resolvedGoals[0].primaryMetric.key, "marathon_time");
  assert.equal(result.resolvedGoals[0].primaryMetric.targetValue, "0:30:00");
  assert.equal(result.resolvedGoals[0].summary, "Run a marathon in 0:30:00");
});

test("strength parsing prefers the intended benchmark when smaller accessory weights are also mentioned", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "bench press 225 lbs, not 45 lb dumbbells",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "bench press 225 lbs, not 45 lb dumbbells" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals[0].primaryMetric.key, "bench_press_weight");
  assert.equal(result.resolvedGoals[0].primaryMetric.targetValue, "225");
  assert.match(result.planningGoals[0].measurableTarget, /225 lb/i);
});

test("appearance goals stay proxy-measurable and use a time horizon when timing is approximate", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "have six pack by August",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "have six pack by August",
      timingConstraints: ["August"],
      appearanceConstraints: ["six pack"],
    }),
    aiInterpretationProposal: {
      interpretedGoalType: "appearance",
      measurabilityTier: "proxy_measurable",
      suggestedMetrics: [
        { key: "waist", label: "Waist circumference", unit: "in", kind: "proxy" },
      ],
      timelineRealism: { status: "aggressive", summary: "Possible if the deficit is controlled.", suggestedHorizonWeeks: 16 },
    },
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-09",
  });

  assert.equal(result.resolvedGoals[0].goalFamily, "appearance");
  assert.equal(result.resolvedGoals[0].planningCategory, "body_comp");
  assert.equal(result.resolvedGoals[0].measurabilityTier, GOAL_MEASURABILITY_TIERS.proxyMeasurable);
  assert.equal(result.resolvedGoals[0].targetDate, "");
  assert.equal(result.resolvedGoals[0].targetHorizonWeeks, 16);
  assert.ok(result.resolvedGoals[0].proxyMetrics.some((metric) => metric.key === "waist_circumference"));
  assert.match(
    result.resolvedGoals[0].unresolvedGaps.join(" "),
    /proxy|bodyweight|waist/i
  );
});

test("lean-for-summer goals preserve raw intent and resolve into proxy-tracked body-comp planning input", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "get lean for summer",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "get lean for summer",
      timingConstraints: ["summer"],
      appearanceConstraints: ["leaner"],
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-10",
  });

  assert.equal(result.rawIntent, "get lean for summer");
  assert.equal(result.resolvedGoals[0].rawIntent.text, "get lean for summer");
  assert.equal(result.resolvedGoals[0].planningCategory, "body_comp");
  assert.equal(result.resolvedGoals[0].measurabilityTier, GOAL_MEASURABILITY_TIERS.proxyMeasurable);
  assert.equal(result.resolvedGoals[0].summary, "Get leaner within the current time window");
  assert.equal(result.resolvedGoals[0].targetDate, "");
  assert.ok(Number.isFinite(result.resolvedGoals[0].targetHorizonWeeks));
  assert.ok(result.resolvedGoals[0].proxyMetrics.some((metric) => metric.key === "waist_circumference"));
});

test("hybrid athlete goals become two exploratory planning goals with a first 30-day success definition", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "be a hybrid athlete",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "be a hybrid athlete" }),
    aiInterpretationProposal: {
      interpretedGoalType: "hybrid",
      measurabilityTier: "exploratory_fuzzy",
      suggestedMetrics: [
        { key: "weekly_run_frequency", label: "Weekly run frequency", unit: "sessions", kind: "proxy" },
        { key: "weekly_strength_frequency", label: "Weekly strength frequency", unit: "sessions", kind: "proxy" },
      ],
      timelineRealism: { status: "unclear", summary: "Start with a 30-day structure first.", suggestedHorizonWeeks: 4 },
    },
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-09",
  });

  assert.equal(result.resolvedGoals.length, 2);
  assert.deepEqual(result.planningGoals.map((goal) => goal.category), ["running", "strength"]);
  assert.ok(result.resolvedGoals.every((goal) => goal.measurabilityTier === GOAL_MEASURABILITY_TIERS.exploratoryFuzzy));
  assert.match(result.resolvedGoals[0].first30DaySuccessDefinition, /8 aerobic sessions/i);
  assert.ok(result.unresolvedGaps.some((gap) => /balance between endurance and strength/i.test(gap)));
});

test("get-back-in-shape goals stay exploratory and ask for a starting-capacity anchor before getting sharper", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "get back in shape",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "get back in shape" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-10",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "general_fitness");
  assert.equal(result.resolvedGoals[0].measurabilityTier, GOAL_MEASURABILITY_TIERS.exploratoryFuzzy);
  assert.equal(result.resolvedGoals[0].primaryMetric, null);
  assert.match(result.resolvedGoals[0].first30DaySuccessDefinition, /30 days/i);
  assert.equal(result.planningGoals[0].measurableTarget, result.resolvedGoals[0].first30DaySuccessDefinition);
  assert.ok(result.unresolvedGaps.some((gap) => /starting capacity/i.test(gap)));
});

test("safe rebuild language with postpartum context resolves into re-entry instead of generic strength", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "rebuild strength and energy safely",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "rebuild strength and energy safely",
      additionalContext: "postpartum return with limited sleep and pelvic floor caution",
      injuryText: "pelvic floor caution and sleep disruption",
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-14",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "re_entry");
  assert.equal(result.resolvedGoals[0].planningCategory, "general_fitness");
  assert.equal(result.resolvedGoals[0].primaryDomain, "durability_rebuild");
});

test("mixed lose-fat-but-keep-strength intent resolves into body-comp plus strength-maintenance goals with tradeoffs", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "lose fat but keep strength",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "lose fat but keep strength" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-09",
  });

  assert.equal(result.resolvedGoals.length, 2);
  assert.deepEqual(result.planningGoals.map((goal) => goal.category), ["body_comp", "strength"]);
  assert.equal(result.resolvedGoals[0].summary, "Lose fat while keeping strength");
  assert.equal(result.resolvedGoals[1].summary, "Keep strength in the plan while another priority leads");
  assert.ok(result.tradeoffs.some((item) => /fat loss may limit strength/i.test(item)));
  assert.equal(result.planningGoals[1].tracking.mode, "logged_lifts");
});

test("explicit strength plus leaning-out phrasing resolves into separate goals in mention order", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "Bench 225 and get leaner by summer",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "Bench 225 and get leaner by summer",
      timingConstraints: ["summer"],
      appearanceConstraints: ["leaner"],
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals.length, 2);
  assert.equal(result.resolvedGoals[0].planningCategory, "strength");
  assert.equal(result.resolvedGoals[0].primaryMetric.key, "bench_press_weight");
  assert.equal(result.resolvedGoals[1].planningCategory, "body_comp");
  assert.match(result.resolvedGoals[1].summary, /lean/i);
  assert.ok(result.tradeoffs.some((item) => /fat loss may limit strength/i.test(item)));
});

test("strength plus aesthetics phrasing keeps the exact lift goal and an explicit appearance goal", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "bench 225 and visible upper-body aesthetics",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "bench 225 and visible upper-body aesthetics",
      appearanceConstraints: ["visible upper-body aesthetics"],
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-14",
  });

  assert.equal(result.resolvedGoals.length, 2);
  assert.equal(result.resolvedGoals[0].summary, "Bench press 225 lb");
  assert.equal(result.resolvedGoals[1].goalFamily, "appearance");
  assert.equal(result.resolvedGoals[1].planningCategory, "body_comp");
  assert.equal(result.resolvedGoals[1].summary, "Improve upper-body aesthetics");
});

test("running plus maintained strength stays run-led and event-specific when explicitly expressed", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon but keep strength",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "run a 1:45 half marathon but keep strength" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals.length, 2);
  assert.equal(result.resolvedGoals[0].goalFamily, "performance");
  assert.equal(result.resolvedGoals[0].planningCategory, "running");
  assert.equal(result.resolvedGoals[0].summary, "Run a half marathon in 1:45:00");
  assert.equal(result.resolvedGoals[1].goalFamily, "strength");
  assert.equal(result.resolvedGoals[1].summary, "Keep strength in the plan while another priority leads");
  assert.doesNotMatch(result.resolvedGoals[0].summary, /hybrid/i);
});

test("running plus numeric weight loss stays run-led with an explicit body-comp secondary goal", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon and lose 15 pounds",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "run a 1:45 half marathon and lose 15 pounds" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-16",
  });

  assert.equal(result.resolvedGoals.length, 2);
  assert.equal(result.resolvedGoals[0].goalFamily, "performance");
  assert.equal(result.resolvedGoals[0].planningCategory, "running");
  assert.equal(result.resolvedGoals[0].summary, "Run a half marathon in 1:45:00");
  assert.equal(result.resolvedGoals[1].goalFamily, "body_comp");
  assert.equal(result.resolvedGoals[1].planningCategory, "body_comp");
  assert.equal(result.resolvedGoals[1].primaryMetric?.key, "bodyweight_change");
  assert.equal(result.resolvedGoals[1].primaryMetric?.targetValue, "-15");
});

test("running plus visible-abs language stays run-led with an appearance secondary goal", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon and get visible abs",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "run a 1:45 half marathon and get visible abs",
      appearanceConstraints: ["visible abs"],
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-16",
  });

  assert.equal(result.resolvedGoals.length, 2);
  assert.equal(result.resolvedGoals[0].goalFamily, "performance");
  assert.equal(result.resolvedGoals[0].planningCategory, "running");
  assert.equal(result.resolvedGoals[0].summary, "Run a half marathon in 1:45:00");
  assert.equal(result.resolvedGoals[1].goalFamily, "appearance");
  assert.equal(result.resolvedGoals[1].planningCategory, "body_comp");
  assert.match(result.resolvedGoals[1].summary, /midsection definition|visible abs/i);
});

test("body-fat percentage language stays proxy-based instead of pretending the app has a direct verifier", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "body fat under 12%",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "body fat under 12%" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-17",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "appearance");
  assert.equal(result.resolvedGoals[0].planningCategory, "body_comp");
  assert.equal(result.resolvedGoals[0].measurabilityTier, GOAL_MEASURABILITY_TIERS.proxyMeasurable);
  assert.equal(result.resolvedGoals[0].primaryMetric, null);
  assert.match(result.resolvedGoals[0].summary, /body-fat range|lean out/i);
  assert.ok(result.resolvedGoals[0].proxyMetrics.some((metric) => metric.key === "waist_circumference"));
  assert.ok(result.resolvedGoals[0].proxyMetrics.some((metric) => metric.key === "bodyweight_trend"));
  assert.match(
    result.resolvedGoals[0].unresolvedGaps.join(" "),
    /waist|bodyweight|body-fat measurement method|reliable/i
  );
});

test("body-fat percentage language no longer corrupts an accompanying bench target", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "body fat under 10% and bench 225",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "body fat under 10% and bench 225" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-17",
  });

  assert.equal(result.resolvedGoals.length, 2);
  const strengthGoal = result.resolvedGoals.find((goal) => goal.goalFamily === "strength");
  const appearanceGoal = result.resolvedGoals.find((goal) => goal.goalFamily === "appearance");

  assert.ok(strengthGoal);
  assert.equal(strengthGoal.primaryMetric?.key, "bench_press_weight");
  assert.equal(strengthGoal.primaryMetric?.targetValue, "225");
  assert.match(strengthGoal.summary, /strength/i);
  assert.ok(result.planningGoals.some((goal) => goal.category === "strength" && /225 lb/i.test(goal.measurableTarget)));
  assert.ok(appearanceGoal);
  assert.equal(appearanceGoal.planningCategory, "body_comp");
  assert.equal(appearanceGoal.primaryMetric, null);
  assert.ok(appearanceGoal.proxyMetrics.some((metric) => metric.key === "waist_circumference"));
});

test("visible-abs timing language resolves to an honest appearance summary instead of raw copied text", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "visible abs by August",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "visible abs by August",
      timingConstraints: ["by August"],
      appearanceConstraints: ["visible abs"],
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-17",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "appearance");
  assert.match(result.resolvedGoals[0].summary, /midsection definition/i);
  assert.ok(result.resolvedGoals[0].targetHorizonWeeks > 0);
});

test("three-domain stacks keep running, strength, weight, and appearance outcomes visible", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "run a 1:45 half marathon and bench 225 and lose 15 pounds and get visible abs",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "run a 1:45 half marathon and bench 225 and lose 15 pounds and get visible abs",
      appearanceConstraints: ["visible abs"],
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-16",
  });

  assert.equal(result.resolvedGoals.length, 4);
  assert.equal(result.resolvedGoals[0].summary, "Run a half marathon in 1:45:00");
  assert.equal(result.resolvedGoals[1].summary, "Bench press 225 lb");
  assert.equal(result.resolvedGoals[2].primaryMetric?.key, "bodyweight_change");
  assert.equal(result.resolvedGoals[2].primaryMetric?.targetValue, "-15");
  assert.equal(result.resolvedGoals[3].goalFamily, "appearance");
});

test("dunk goals map into the athletic-power family without breaking the planning model", () => {
  const result = resolveGoalTranslation({
    rawUserGoalIntent: "dunk a basketball",
    typedIntakePacket: buildIntakePacket({ rawGoalText: "dunk a basketball" }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-11",
  });

  assert.equal(result.resolvedGoals.length, 1);
  assert.equal(result.resolvedGoals[0].goalFamily, "athletic_power");
  assert.equal(result.resolvedGoals[0].planningCategory, "strength");
  assert.equal(result.resolvedGoals[0].measurabilityTier, GOAL_MEASURABILITY_TIERS.proxyMeasurable);
  assert.equal(result.resolvedGoals[0].summary, "Dunk a basketball");
  assert.match(result.resolvedGoals[0].first30DaySuccessDefinition, /lower-body power sessions/i);
  assert.equal(result.planningGoals[0].tracking.mode, "progress_tracker");
});

test("resolved goals populate canonical goal slots so planner-facing normalization reads resolved objects", () => {
  const resolution = resolveGoalTranslation({
    rawUserGoalIntent: "look athletic again",
    typedIntakePacket: buildIntakePacket({
      rawGoalText: "look athletic again",
      appearanceConstraints: ["look athletic again"],
    }),
    explicitUserConfirmation: { confirmed: true, acceptedProposal: true },
    now: "2026-04-09",
  });

  const slottedGoals = applyResolvedGoalsToGoalSlots({
    resolvedGoals: resolution.resolvedGoals,
    goalSlots: DEFAULT_GOAL_SLOTS,
  });
  const normalized = normalizeGoals(slottedGoals);

  assert.equal(normalized[0].category, "body_comp");
  assert.equal(normalized[0].resolvedGoal.summary, resolution.resolvedGoals[0].summary);
  assert.match(normalized[0].measurableTarget, /Waist circumference|30 days/i);
  assert.equal(normalized[3].category, "injury_prevention");
  assert.equal(normalized[3].active, true);
});

test("resolved goals can overflow past the legacy slot count while keeping resilience at the end", () => {
  const overflowResolvedGoals = [
    {
      id: "goal_strength_main",
      summary: "Bench press 225 lb",
      planningCategory: "strength",
      goalFamily: "strength",
      planningPriority: 1,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.fullyMeasurable,
      primaryMetric: { key: "bench_press_1rm", label: "Bench 1RM", targetValue: "225", unit: "lb" },
      targetDate: "",
      targetHorizonWeeks: 12,
      confidence: "medium",
      tradeoffs: [],
      unresolvedGaps: [],
      first30DaySuccessDefinition: "Complete 8 bench sessions in 30 days.",
      reviewCadence: "weekly",
      refinementTrigger: "30_day_resolution_review",
      confirmedByUser: true,
    },
    {
      id: "goal_body_comp",
      summary: "Get leaner by summer",
      planningCategory: "body_comp",
      goalFamily: "body_comp",
      planningPriority: 2,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.proxyMeasurable,
      proxyMetrics: [{ key: "waist", label: "Waist trend", unit: "in" }],
      targetDate: "",
      targetHorizonWeeks: 12,
      confidence: "medium",
      tradeoffs: [],
      unresolvedGaps: [],
      first30DaySuccessDefinition: "Log waist and bodyweight for 30 days.",
      reviewCadence: "weekly",
      refinementTrigger: "30_day_resolution_review",
      confirmedByUser: true,
    },
    {
      id: "goal_running",
      summary: "Run a half marathon",
      planningCategory: "running",
      goalFamily: "performance",
      planningPriority: 3,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.proxyMeasurable,
      proxyMetrics: [{ key: "weekly_run_frequency", label: "Weekly run frequency", unit: "sessions" }],
      targetDate: "",
      targetHorizonWeeks: 16,
      confidence: "medium",
      tradeoffs: [],
      unresolvedGaps: [],
      first30DaySuccessDefinition: "Complete 8 aerobic sessions in 30 days.",
      reviewCadence: "weekly",
      refinementTrigger: "30_day_resolution_review",
      confirmedByUser: true,
    },
    {
      id: "goal_extra_power",
      summary: "Jump higher again",
      planningCategory: "strength",
      goalFamily: "athletic_power",
      planningPriority: 4,
      measurabilityTier: GOAL_MEASURABILITY_TIERS.proxyMeasurable,
      proxyMetrics: [{ key: "jump_height", label: "Vertical jump", unit: "in" }],
      targetDate: "",
      targetHorizonWeeks: 10,
      confidence: "medium",
      tradeoffs: [],
      unresolvedGaps: [],
      first30DaySuccessDefinition: "Complete 8 lower-body power sessions in 30 days.",
      reviewCadence: "weekly",
      refinementTrigger: "30_day_resolution_review",
      confirmedByUser: true,
    },
  ];

  const slottedGoals = applyResolvedGoalsToGoalSlots({
    resolvedGoals: overflowResolvedGoals,
    goalSlots: DEFAULT_GOAL_SLOTS,
  });
  const normalized = normalizeGoals(slottedGoals);

  assert.equal(normalized.filter((goal) => goal.active && goal.category !== "injury_prevention").length, 4);
  assert.equal(normalized[3].name, "Jump higher again");
  assert.equal(normalized[3].priority, 4);
  assert.equal(normalized[4].id, "g_resilience");
  assert.equal(normalized[4].priority, 5);
});
