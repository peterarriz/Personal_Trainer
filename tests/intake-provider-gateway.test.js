const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildAiStatePacket,
  AI_PACKET_INTENTS,
} = require("../src/modules-ai-state.js");
const {
  runIntakeInterpretationRuntime,
} = require("../src/services/ai-runtime-service.js");
const {
  applyResolvedGoalsToGoalSlots,
  resolveGoalTranslation,
} = require("../src/services/goal-resolution-service.js");
const {
  runIntakeProviderGateway,
} = require("../api/_lib/ai-provider-gateway.js");

const DEFAULT_GOAL_SLOTS = [
  { id: "g_primary", name: "Primary goal", type: "ongoing", category: "running", priority: 1, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "progress_tracker" } },
  { id: "g_secondary_1", name: "Secondary goal 1", type: "ongoing", category: "body_comp", priority: 2, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "weekly_checkin", unit: "lb" } },
  { id: "g_secondary_2", name: "Secondary goal 2", type: "ongoing", category: "strength", priority: 3, targetDate: "", measurableTarget: "", active: false, tracking: { mode: "logged_lifts", unit: "lb" } },
  { id: "g_resilience", name: "Resilience", type: "ongoing", category: "injury_prevention", priority: 4, targetDate: "", measurableTarget: "", active: true, tracking: { mode: "progress_tracker" } },
];

const createIntakePacketArgs = (rawGoalText, extras = {}) => ({
  input: "Interpret this onboarding intake without writing canonical goal state.",
  intakeContext: {
    rawGoalText,
    baselineContext: {
      primaryGoalKey: "",
      primaryGoalLabel: "General Fitness",
      experienceLevel: "Intermediate",
      fitnessLevel: "Intermediate",
      startingFresh: true,
      currentBaseline: "Intermediate training background; 4 training days per week available; 45 min sessions",
      priorMemory: ["Previous plan drifted during travel."],
    },
    scheduleReality: {
      trainingDaysPerWeek: 4,
      sessionLength: "45 min",
      trainingLocation: "Both",
      scheduleNotes: "4 days per week, 45 min sessions",
    },
    equipmentAccessContext: {
      trainingLocation: "Both",
      equipment: ["Dumbbells", "Pull-up bar"],
      accessNotes: "",
    },
    injuryConstraintContext: {
      injuryText: "",
      constraints: [],
    },
    userProvidedConstraints: {
      timingConstraints: [],
      appearanceConstraints: [],
      additionalContext: "Find the balance",
    },
    ...extras,
  },
});

const createAnthropicFetch = ({ text = "", usage = {}, status = 200, error = {} } = {}) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => (
    status >= 200 && status < 300
      ? {
          content: [{ text }],
          usage,
        }
      : {
          error,
        }
  ),
});

const createOpenAiFetch = ({ text = "", usage = {}, status = 200, error = {} } = {}) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => (
    status >= 200 && status < 300
      ? {
          choices: [{ message: { content: text } }],
          usage,
        }
      : {
          error,
        }
  ),
});

const createGatewayFailureResponse = (code = "provider_gateway_failed", status = 502) => async () => ({
  ok: false,
  status,
  json: async () => ({
    code,
    message: "Server-side intake interpretation failed.",
  }),
});

const withMockedEnv = async (overrides, run) => {
  const original = {};
  Object.keys(overrides).forEach((key) => {
    original[key] = process.env[key];
    if (overrides[key] == null) delete process.env[key];
    else process.env[key] = overrides[key];
  });
  try {
    await run();
  } finally {
    Object.keys(overrides).forEach((key) => {
      if (original[key] == null) delete process.env[key];
      else process.env[key] = original[key];
    });
  }
};

test("exact measurable goal through provider returns a normalized intake interpretation", async () => {
  const statePacket = buildAiStatePacket({
    intent: AI_PACKET_INTENTS.intakeInterpretation,
    ...createIntakePacketArgs("run a 1:45 half marathon"),
  });

  await withMockedEnv({
    ANTHROPIC_API_KEY: "server-secret",
    OPENAI_API_KEY: null,
    AI_INTAKE_PROVIDER: "anthropic",
    AI_INTAKE_MODEL_ANTHROPIC: "claude-haiku-4-5",
  }, async () => {
    const result = await runIntakeProviderGateway({
      statePacket,
      fetchImpl: createAnthropicFetch({
        text: JSON.stringify({
          interpretedGoalType: "performance",
          measurabilityTier: "fully_measurable",
          primaryMetric: { key: "half_marathon_time", label: "Half marathon time", unit: "time", kind: "primary", targetValue: "1:45:00" },
          proxyMetrics: [
            { key: "weekly_run_frequency", label: "Weekly run frequency", unit: "sessions", kind: "proxy" },
          ],
          confidence: "high",
          timelineRealism: { status: "unclear", summary: "Need the race date to time the block precisely.", suggestedHorizonWeeks: null },
          missingClarifyingQuestions: ["What's the race date or target month?"],
          detectedConflicts: [],
          coachSummary: "This reads like a clear race-performance goal.",
        }),
        usage: { input_tokens: 123, output_tokens: 49 },
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.meta.provider, "anthropic");
    assert.equal(result.meta.model, "claude-haiku-4-5");
    assert.equal(result.meta.usage.inputTokens, 123);
    assert.equal(result.interpretation.interpretedGoalType, "performance");
    assert.equal(result.interpretation.primaryMetric.key, "half_marathon_time");
    assert.equal(result.interpretation.confidence, "high");
    assert.equal(result.interpretation.proxyMetrics[0].key, "weekly_run_frequency");
  });
});

test("vague aesthetic goal through provider returns proxy-measurable interpretation", async () => {
  const statePacket = buildAiStatePacket({
    intent: AI_PACKET_INTENTS.intakeInterpretation,
    ...createIntakePacketArgs("look athletic again", {
      userProvidedConstraints: {
        timingConstraints: ["by summer"],
        appearanceConstraints: ["look athletic again"],
        additionalContext: "Find the balance",
      },
    }),
  });

  await withMockedEnv({
    ANTHROPIC_API_KEY: null,
    OPENAI_API_KEY: "openai-secret",
    AI_INTAKE_PROVIDER: "openai",
    AI_INTAKE_MODEL_OPENAI: "gpt-4.1-mini",
  }, async () => {
    const result = await runIntakeProviderGateway({
      statePacket,
      fetchImpl: createOpenAiFetch({
        text: JSON.stringify({
          interpretedGoalType: "appearance",
          measurabilityTier: "proxy_measurable",
          proxyMetrics: [
            { key: "waist_circumference", label: "Waist circumference", unit: "in", kind: "proxy" },
          ],
          confidence: "medium",
          timelineRealism: { status: "aggressive", summary: "Summer is workable if expectations stay visual and proxy-based.", suggestedHorizonWeeks: 16 },
          missingClarifyingQuestions: ["What would make this feel visibly successful in the next 30 days?"],
          detectedConflicts: ["Appearance-focused leanness pushes can reduce training quality if recovery drifts."],
          coachSummary: "This is a physique-oriented goal that should be tracked with proxies, not fake exact precision.",
        }),
        usage: { prompt_tokens: 111, completion_tokens: 37, total_tokens: 148 },
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.meta.provider, "openai");
    assert.equal(result.meta.usage.totalTokens, 148);
    assert.equal(result.interpretation.interpretedGoalType, "appearance");
    assert.equal(result.interpretation.measurabilityTier, "proxy_measurable");
    assert.equal(result.interpretation.primaryMetric, null);
    assert.equal(result.interpretation.proxyMetrics.length, 1);
    assert.equal(result.interpretation.confidence, "medium");
  });
});

test("multi-goal hybrid interpretation through provider stays normalized and provider-agnostic", async () => {
  const statePacket = buildAiStatePacket({
    intent: AI_PACKET_INTENTS.intakeInterpretation,
    ...createIntakePacketArgs("become a hybrid athlete"),
  });

  await withMockedEnv({
    ANTHROPIC_API_KEY: "server-secret",
    OPENAI_API_KEY: null,
    AI_INTAKE_PROVIDER: "anthropic",
  }, async () => {
    const result = await runIntakeProviderGateway({
      statePacket,
      fetchImpl: createAnthropicFetch({
        text: JSON.stringify({
          interpretedGoalType: "hybrid",
          measurabilityTier: "exploratory_fuzzy",
          proxyMetrics: [
            { key: "weekly_run_frequency", label: "Weekly run frequency", unit: "sessions", kind: "proxy" },
            { key: "weekly_strength_frequency", label: "Weekly strength frequency", unit: "sessions", kind: "proxy" },
          ],
          confidence: "medium",
          timelineRealism: { status: "unclear", summary: "Start with a 30-day structure first.", suggestedHorizonWeeks: 4 },
          missingClarifyingQuestions: ["Which lane should lead first: running or strength?"],
          detectedConflicts: ["Strength progression must stay compatible with the aerobic workload in the same week."],
          coachSummary: "This reads like a hybrid goal with two lanes that need a clear lead and a maintained lane.",
        }),
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.interpretation.interpretedGoalType, "hybrid");
    assert.equal(result.interpretation.proxyMetrics.length, 2);
    assert.equal(result.interpretation.timelineRealism.suggestedHorizonWeeks, 4);
    assert.match(result.interpretation.detectedConflicts[0], /aerobic workload/i);
  });
});

test("provider gateway drops AI context suggestions that conflict with explicit intake constraints", async () => {
  const statePacket = buildAiStatePacket({
    intent: AI_PACKET_INTENTS.intakeInterpretation,
    ...createIntakePacketArgs("run a 1:45 half marathon", {
      injuryConstraintContext: {
        injuryText: "Mild Achilles tightness if volume ramps too fast.",
        constraints: ["Mild Achilles tightness if volume ramps too fast."],
      },
    }),
  });

  await withMockedEnv({
    ANTHROPIC_API_KEY: "server-secret",
    OPENAI_API_KEY: null,
    AI_INTAKE_PROVIDER: "anthropic",
  }, async () => {
    const result = await runIntakeProviderGateway({
      statePacket,
      fetchImpl: createAnthropicFetch({
        text: JSON.stringify({
          interpretedGoalType: "performance",
          measurabilityTier: "fully_measurable",
          primaryMetric: { key: "half_marathon_time", label: "Half marathon time", unit: "time", kind: "primary", targetValue: "1:45:00" },
          scheduleReality: {
            trainingDaysPerWeek: 6,
            sessionLength: "90 min",
            trainingLocation: "Gym",
          },
          equipmentAccessContext: {
            equipment: ["Barbell", "Rack"],
          },
          injuryConstraintContext: {
            injuryText: "No injuries",
            constraints: ["No injuries"],
          },
          confidence: "high",
          timelineRealism: { status: "unclear", summary: "Need a date.", suggestedHorizonWeeks: null },
          coachSummary: "Clear race goal.",
        }),
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.interpretation.interpretedGoalType, "performance");
    assert.deepEqual(result.interpretation.boundaryDrops.sort(), [
      "equipmentAccessContext",
      "injuryConstraintContext",
      "scheduleReality",
    ]);
    assert.equal("scheduleReality" in result.interpretation, false);
    assert.equal("equipmentAccessContext" in result.interpretation, false);
    assert.equal("injuryConstraintContext" in result.interpretation, false);
  });
});

test("missing-field extraction through provider stays bounded to the allowed field ids", async () => {
  const statePacket = buildAiStatePacket({
    intent: AI_PACKET_INTENTS.intakeFieldExtraction,
    ...createIntakePacketArgs("run a 2-hour half marathon"),
  });

  await withMockedEnv({
    ANTHROPIC_API_KEY: "server-secret",
    OPENAI_API_KEY: null,
    AI_INTAKE_PROVIDER: "anthropic",
  }, async () => {
    const result = await runIntakeProviderGateway({
      statePacket,
      requestType: "missing_field_extraction",
      extractionRequest: {
        utterance: "my bench is around 185 x 5 and maybe October 12",
        missingFields: [
          {
            field_id: "current_strength_baseline",
            label: "Current bench baseline",
            input_type: "strength_top_set",
            validation: {
              message: "Add a recent top set, best single, or estimated max for this lift.",
            },
            examples: ["185x5"],
          },
        ],
      },
      fetchImpl: createAnthropicFetch({
        text: JSON.stringify({
          candidates: [
            {
              field_id: "current_strength_baseline",
              confidence: 0.96,
              raw_text: "185 x 5",
              parsed_value: { weight: 185, reps: 5, raw: "185 x 5" },
              evidence_spans: [{ start: 19, end: 26, text: "185 x 5" }],
            },
            {
              field_id: "target_timeline",
              confidence: 0.9,
              raw_text: "October 12",
              parsed_value: { mode: "month", value: "2026-10", raw: "October 12" },
              evidence_spans: [{ start: 38, end: 48, text: "October 12" }],
            },
          ],
        }),
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.meta.requestType, "missing_field_extraction");
    assert.equal(result.extraction.candidates.length, 1);
    assert.equal(result.extraction.candidates[0].field_id, "current_strength_baseline");
    assert.equal(result.extraction.candidates[0].raw_text, "185 x 5");
  });
});

test("coach-voice phrasing through provider returns wording only for the known field", async () => {
  const statePacket = buildAiStatePacket({
    intent: AI_PACKET_INTENTS.intakeCoachVoice,
    ...createIntakePacketArgs("run a 2-hour half marathon"),
  });

  await withMockedEnv({
    ANTHROPIC_API_KEY: "server-secret",
    OPENAI_API_KEY: null,
    AI_INTAKE_PROVIDER: "anthropic",
  }, async () => {
    const result = await runIntakeProviderGateway({
      statePacket,
      requestType: "clarifying_question_generation",
      coachVoiceRequest: {
        field_id: "current_run_frequency",
        label: "Runs per week",
        question_template: "How many times are you running in a normal week?",
        why_it_matters: "This tells me how much running fits your life right now.",
        examples: ["3", "4 runs/week"],
        tone: "supportive_trainer",
      },
      fetchImpl: createAnthropicFetch({
        text: JSON.stringify({
          questionText: "On a normal week, how many runs are you getting in?",
          helperText: "This helps me size the running load around your real week.",
          reassuranceLine: "Coach note: your normal week is exactly what I want here.",
        }),
      }),
    });

    assert.equal(result.ok, true);
    assert.equal(result.meta.requestType, "clarifying_question_generation");
    assert.deepEqual(Object.keys(result.phrasing).sort(), ["helperText", "questionText", "reassuranceLine"]);
    assert.equal(result.phrasing.questionText, "On a normal week, how many runs are you getting in?");
    assert.equal(result.interpretation, null);
    assert.equal(result.extraction, null);
  });
});

test("coach-voice phrasing through provider rejects scope-creep payloads", async () => {
  const statePacket = buildAiStatePacket({
    intent: AI_PACKET_INTENTS.intakeCoachVoice,
    ...createIntakePacketArgs("run a 2-hour half marathon"),
  });

  await withMockedEnv({
    ANTHROPIC_API_KEY: "server-secret",
    OPENAI_API_KEY: null,
    AI_INTAKE_PROVIDER: "anthropic",
  }, async () => {
    const result = await runIntakeProviderGateway({
      statePacket,
      requestType: "clarifying_question_generation",
      coachVoiceRequest: {
        field_id: "current_run_frequency",
        label: "Runs per week",
        question_template: "How many times are you running in a normal week?",
        why_it_matters: "This tells me how much running fits your life right now.",
        examples: ["3", "4 runs/week"],
        tone: "supportive_trainer",
      },
      fetchImpl: createAnthropicFetch({
        text: JSON.stringify({
          questionText: "How many runs are you getting in each week and what's your longest run?",
          helperText: "This guarantees I can build the perfect plan.",
          reassuranceLine: "Coach note: I definitely know exactly what you need.",
          extraField: "target_timeline",
        }),
      }),
    });

    assert.equal(result.ok, false);
    assert.equal(result.meta.requestType, "clarifying_question_generation");
    assert.equal(result.meta.failureReason, "invalid_provider_json");
    assert.equal(result.phrasing, null);
  });
});

test("provider failure falls back cleanly to deterministic/local goal resolution", async () => {
  const packetArgs = createIntakePacketArgs("look athletic again");
  const runtime = await runIntakeInterpretationRuntime({
    safeFetchWithTimeout: createGatewayFailureResponse("provider_gateway_failed"),
    packetArgs,
  });

  assert.equal(runtime.ok, false);
  assert.equal(runtime.error, "provider_gateway_failed");
  assert.equal(runtime.statePacket.intent, AI_PACKET_INTENTS.intakeInterpretation);

  const fallbackResolution = resolveGoalTranslation({
    rawUserGoalIntent: runtime.statePacket.intake.rawGoalText,
    typedIntakePacket: runtime.statePacket,
    explicitUserConfirmation: { confirmed: false, acceptedProposal: false, source: "deterministic_fallback" },
    now: "2026-04-11",
  });

  assert.equal(fallbackResolution.resolvedGoals[0].planningCategory, "body_comp");
  assert.equal(fallbackResolution.resolvedGoals[0].confirmedByUser, false);
});

test("confirmed canonical state writes only after explicit user confirmation", async () => {
  const statePacket = buildAiStatePacket({
    intent: AI_PACKET_INTENTS.intakeInterpretation,
    ...createIntakePacketArgs("run a 1:45 half marathon"),
  });

  await withMockedEnv({
    ANTHROPIC_API_KEY: "server-secret",
    OPENAI_API_KEY: null,
    AI_INTAKE_PROVIDER: "anthropic",
  }, async () => {
    const gateway = await runIntakeProviderGateway({
      statePacket,
      fetchImpl: createAnthropicFetch({
        text: JSON.stringify({
          interpretedGoalType: "performance",
          measurabilityTier: "fully_measurable",
          primaryMetric: { key: "half_marathon_time", label: "Half marathon time", unit: "time", kind: "primary", targetValue: "1:45:00" },
          confidence: "high",
          timelineRealism: { status: "unclear", summary: "Need the race date to time the block precisely.", suggestedHorizonWeeks: null },
          missingClarifyingQuestions: ["What's the race date or target month?"],
          detectedConflicts: [],
          coachSummary: "This is a clear race goal.",
        }),
      }),
    });

    const previewResolution = resolveGoalTranslation({
      rawUserGoalIntent: statePacket.intake.rawGoalText,
      typedIntakePacket: statePacket,
      aiInterpretationProposal: gateway.interpretation,
      explicitUserConfirmation: { confirmed: false, acceptedProposal: true, source: "intake_preview" },
      now: "2026-04-11",
    });
    const confirmedResolution = resolveGoalTranslation({
      rawUserGoalIntent: statePacket.intake.rawGoalText,
      typedIntakePacket: statePacket,
      aiInterpretationProposal: gateway.interpretation,
      explicitUserConfirmation: { confirmed: true, acceptedProposal: true, source: "onboarding_complete" },
      now: "2026-04-11",
    });
    const confirmedSlots = applyResolvedGoalsToGoalSlots({
      resolvedGoals: confirmedResolution.resolvedGoals,
      goalSlots: DEFAULT_GOAL_SLOTS,
    });

    assert.equal(previewResolution.resolvedGoals[0].confirmedByUser, false);
    assert.equal(confirmedResolution.resolvedGoals[0].confirmedByUser, true);
    assert.equal(confirmedSlots[0].active, true);
    assert.equal(confirmedSlots[0].category, "running");
  });
});
