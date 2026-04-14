const test = require("node:test");
const assert = require("node:assert/strict");

const {
  AI_PACKET_VERSION,
  AI_PACKET_INTENTS,
  buildAiStatePacket,
  parseAiJsonObjectFromText,
  acceptAiPlanAnalysisProposal,
  sanitizeIntakeInterpretationProposal,
} = require("../src/modules-ai-state.js");
const {
  buildPlanAnalysisRuntimeInput,
  runPlanAnalysisRuntime,
  buildCoachChatRuntimeInput,
  buildIntakeCoachVoiceRuntimeInput,
  buildIntakeFieldExtractionRuntimeInput,
  buildIntakeInterpretationRuntimeInput,
  runIntakeCoachVoiceRuntime,
  runIntakeFieldExtractionRuntime,
  runIntakeInterpretationRuntime,
  runCoachChatRuntime,
  coordinateCoachActionCommit,
} = require("../src/services/ai-runtime-service.js");
const {
  COACH_TOOL_ACTIONS,
  acceptCoachActionProposal,
} = require("../src/modules-coach-engine.js");

const withMockedNow = async (isoString, run) => {
  const originalNow = Date.now;
  Date.now = () => new Date(isoString).getTime();
  try {
    await run();
  } finally {
    Date.now = originalNow;
  }
};

const createAiPacketArgs = () => ({
  input: "Need a confidence check on next week after a rough long run. ".repeat(12),
  dateKey: "2026-04-09",
  currentWeek: 6,
  canonicalGoalState: {
    primaryGoal: "Half marathon",
    deadline: "2026-08-01",
    planStartDate: "2026-03-01",
  },
  canonicalUserProfile: {
    name: "Peter",
    fitnessLevel: "intermediate",
    equipmentAccess: ["bodyweight", "basic gym"],
    constraints: ["travel logistics"],
    preferences: { coachingStyle: "direct" },
  },
  goals: [
    { id: "goal_1", active: true, name: "Break 1:50", category: "running", priority: 1, horizon: "season", target: "1:49:59", deadline: "2026-08-01", status: "active" },
  ],
  planWeek: {
    id: "week_6",
    weekNumber: 6,
    absoluteWeek: 6,
    phase: "BUILDING",
    label: "Sharpening",
    status: "active",
    adjusted: false,
    summary: "Steady build",
    constraints: ["protect Achilles"],
    weeklyIntent: { primary: "consistency" },
    sessionsByDay: {
      thu: { label: "Tempo", type: "run", run: { d: "35 min" } },
    },
  },
  planDay: {
    id: "plan_day_2026-04-09",
    dateKey: "2026-04-09",
    dayOfWeek: 4,
    decision: { mode: "as_planned" },
    flags: { key: "value" },
    week: {
      currentWeek: 6,
      phase: "BUILDING",
      label: "Sharpening",
      status: "active",
      adjusted: false,
      summary: "Steady build",
      constraints: ["protect Achilles"],
      successDefinition: "Finish strong",
      weeklyIntent: { primary: "consistency" },
    },
    base: {
      training: { label: "Tempo Run", type: "run", run: { d: "35 min" }, recoveryRecommendation: "hydrate" },
      nutrition: { prescription: { dayType: "hardRun" } },
      recovery: { state: "ready" },
      supplements: null,
      logging: null,
    },
    resolved: {
      training: { label: "Tempo Run", type: "run", run: { d: "35 min" }, recoveryRecommendation: "hydrate" },
      nutrition: { comparison: { hasActual: true, deviationKind: "under_fueled" } },
      recovery: { state: "ready" },
      supplements: null,
      logging: null,
    },
    provenance: { summary: "Protected recovery", keyDrivers: ["Achilles"], events: [] },
  },
  logs: {
    "2026-04-06": {
      type: "Long Run",
      actualSession: { status: "completed_modified" },
      feel: 2,
      miles: 8.5,
      pace: "9:45/mi",
      notes: "Achilles was tight late.",
    },
  },
  dailyCheckins: {
    "2026-04-08": {
      status: "completed_modified",
      sessionFeel: "harder_than_expected",
      blocker: "recovery",
      readiness: { energy: 2 },
    },
  },
  nutritionActualLogs: {
    "2026-04-08": {
      quickStatus: "off_track",
      adherence: "low",
      deviationKind: "under_fueled",
      issue: "missed dinner",
      note: "Very under-fueled after travel.",
      hydration: { pct: 55 },
    },
  },
  bodyweights: [
    { date: "2026-04-01", weight: 191 },
    { date: "2026-04-08", weight: 189.5 },
  ],
  momentum: { momentumState: "drifting", completionRate: 0.61, score: 58, inconsistencyRisk: "high", logGapDays: 1 },
  expectations: { coachLine: "Keep it controlled.", rationale: "Recovery first." },
  strengthLayer: { focus: "maintenance", planFocus: "running" },
  optimizationLayer: { adjustmentBias: "protect", experimentation: { canExperiment: false, pendingExperiment: "" } },
  failureMode: { mode: "normal", isLowEngagement: false, isReEntry: false },
  readiness: { state: "watchful", soreness: "moderate" },
  nutritionComparison: { hasActual: true, deviationKind: "under_fueled", matters: "high" },
  arbitration: { primary: { category: "running" }, todayLine: "Protect the run build without forcing pace." },
  memoryInsights: [{ key: "achilles_watch", msg: "Tendon flares after stacked hard days.", confidence: "high" }],
  coachMemoryContext: {
    preferredMotivationStyle: "direct",
    injuryHistory: ["Achilles flare after overload"],
    recurringBreakdowns: [{ week: 4, why: "travel fatigue" }],
  },
  weekNotes: { "6": "Stay controlled." },
  paceOverrides: {
    BUILDING: { easy: "10:00-10:15", tempo: "8:40-8:50", int: "7:55-8:05", long: "10:00-10:15" },
  },
  planAlerts: [{ id: "existing_alert", type: "warning", msg: "Existing alert" }],
});

const createIntakePacketArgs = () => ({
  input: "Interpret this onboarding intake without writing canonical goal state.",
  intakeContext: {
    rawGoalText: "I want to look athletic again and maybe run a 10k this fall.",
    baselineContext: {
      primaryGoalKey: "general_fitness",
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
      injuryText: "Mild Achilles tightness if volume ramps too fast.",
      constraints: ["Mild Achilles tightness if volume ramps too fast."],
    },
    userProvidedConstraints: {
      timingConstraints: ["this fall"],
      appearanceConstraints: ["look athletic again"],
      additionalContext: "Find the balance",
    },
  },
});

const createPlanAnalysisResponse = (text) => async () => ({
  ok: true,
  json: async () => ({ content: [{ text }] }),
});

const createIntakeGatewayResponse = (payload, status = 200) => async () => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => payload,
});

const createStreamFetch = (chunks) => async () => {
  const encoder = new TextEncoder();
  let index = 0;
  return {
    ok: true,
    body: {
      getReader() {
        return {
          async read() {
            if (index >= chunks.length) return { done: true, value: undefined };
            const value = encoder.encode(chunks[index]);
            index += 1;
            return { done: false, value };
          },
        };
      },
    },
  };
};

test("typed AI packet generation produces a bounded proposal-only packet", async () => {
  await withMockedNow("2026-04-09T12:00:00Z", async () => {
    const packetArgs = createAiPacketArgs();
    const packet = buildAiStatePacket({
      intent: AI_PACKET_INTENTS.planAnalysis,
      ...packetArgs,
    });

    assert.equal(packet.version, AI_PACKET_VERSION);
    assert.equal(packet.intent, AI_PACKET_INTENTS.planAnalysis);
    assert.match(packet.generatedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    assert.equal(packet.scope.currentWeek, 6);
    assert.equal(packet.scope.dateKey, "2026-04-09");
    assert.ok(packet.scope.input.length <= 280);
    assert.deepEqual(packet.boundaries.aiMay, ["explain", "summarize", "propose"]);
    assert.deepEqual(packet.boundaries.aiMayNot, ["directly_mutate_plan", "directly_mutate_logs", "be_source_of_truth"]);
    assert.deepEqual(packet.planningContext.availablePacePhases, ["BUILDING"]);
    assert.equal(packet.canonical.planWeek.phase, "BUILDING");
    assert.equal(packet.actuals.recentSessions[0].note, "Achilles was tight late.");
    assert.equal(packetArgs.planWeek.phase, "BUILDING");
    assert.equal(packetArgs.logs["2026-04-06"].notes, "Achilles was tight late.");
  });
});

test("typed intake AI packet includes bounded intake context and keeps the same proposal-only boundary", async () => {
  await withMockedNow("2026-04-09T12:02:00Z", async () => {
    const packet = buildAiStatePacket({
      intent: AI_PACKET_INTENTS.intakeInterpretation,
      ...createIntakePacketArgs(),
    });

    assert.equal(packet.version, AI_PACKET_VERSION);
    assert.equal(packet.intent, AI_PACKET_INTENTS.intakeInterpretation);
    assert.equal(packet.intake.rawGoalText, "I want to look athletic again and maybe run a 10k this fall.");
    assert.equal(packet.intake.baselineContext.experienceLevel, "Intermediate");
    assert.equal(packet.intake.scheduleReality.trainingDaysPerWeek, 4);
    assert.deepEqual(packet.intake.equipmentAccessContext.equipment, ["Dumbbells", "Pull-up bar"]);
    assert.equal(packet.intake.injuryConstraintContext.injuryText, "Mild Achilles tightness if volume ramps too fast.");
    assert.deepEqual(packet.intake.userProvidedConstraints.appearanceConstraints, ["look athletic again"]);
    assert.deepEqual(packet.boundaries.aiMay, ["explain", "summarize", "propose"]);
    assert.deepEqual(packet.boundaries.aiMayNot, ["directly_mutate_plan", "directly_mutate_logs", "be_source_of_truth"]);
  });
});

test("plan-analysis parsing accepts only in-scope changes and rejects malformed or out-of-scope proposals", async () => {
  await withMockedNow("2026-04-09T12:05:00Z", async () => {
    const { statePacket } = buildPlanAnalysisRuntimeInput(createAiPacketArgs());

    const acceptance = acceptAiPlanAnalysisProposal({
      statePacket,
      proposal: {
        paceAdjustments: {
          BUILDING: {
            easy: "10:05-10:20<script>",
            tempo: "8:38-8:48",
            int: "7:52-8:02",
            long: "10:00-10:15",
          },
          PEAK: {
            easy: "9:40-9:55",
          },
        },
        weekNotes: {
          6: "Reduce density after Achilles tightness.",
          11: "Far future note should be rejected.",
        },
        alerts: [
          { id: " Mobility Warning ", type: "warning", msg: "Shorten intensity if Achilles pain rises." },
          { id: "bad_type", type: "critical", msg: "Should be rejected." },
          { id: "long_note", type: "info", msg: "  Keep the long run honest and protect recovery.  " },
          { id: "overflow", type: "upgrade", msg: "Ignored by max-three cap." },
        ],
      },
    });

    assert.equal(acceptance.hasChanges, true);
    assert.deepEqual(acceptance.accepted.paceAdjustments, {
      BUILDING: {
        tempo: "8:38-8:48",
        int: "7:52-8:02",
        long: "10:00-10:15",
      },
    });
    assert.deepEqual(acceptance.accepted.weekNotes, {
      "6": "Reduce density after Achilles tightness.",
    });
    assert.equal(acceptance.accepted.alerts.length, 2);
    assert.deepEqual(
      acceptance.accepted.alerts.map((alert) => ({ id: alert.id, type: alert.type, msg: alert.msg })),
      [
        {
          id: "ai_plan_mobility_warning",
          type: "warning",
          msg: "Shorten intensity if Achilles pain rises.",
        },
        {
          id: "ai_plan_long_note",
          type: "info",
          msg: "Keep the long run honest and protect recovery.",
        },
      ]
    );
    assert.deepEqual(acceptance.rejected, [
      "pace_phase_rejected:PEAK",
      "week_note_rejected:11",
      "alert_rejected:critical",
    ]);

    assert.equal(parseAiJsonObjectFromText("```json\n{\"noChange\":true}\n```").noChange, true);
    assert.equal(parseAiJsonObjectFromText("not json at all"), null);
  });
});

test("runPlanAnalysisRuntime rejects malformed JSON safely and never accepts changes", async () => {
  await withMockedNow("2026-04-09T12:10:00Z", async () => {
    const result = await runPlanAnalysisRuntime({
      apiKey: "test-key",
      safeFetchWithTimeout: createPlanAnalysisResponse("```json\n{\"paceAdjustments\":\n```"),
      packetArgs: createAiPacketArgs(),
    });

    assert.equal(result.ok, false);
    assert.equal(result.status, "invalid_json");
    assert.equal(result.accepted, null);
    assert.equal(result.hasChanges, false);
    assert.deepEqual(result.rejected, ["proposal_invalid_json"]);
    assert.equal(result.proposal, null);
    assert.equal(result.error, "invalid_json");
    assert.equal(result.provenance.actor, "fallback");
  });
});

test("runPlanAnalysisRuntime applies deterministic acceptance and strips out-of-scope proposal data", async () => {
  await withMockedNow("2026-04-09T12:15:00Z", async () => {
    const result = await runPlanAnalysisRuntime({
      apiKey: "test-key",
      safeFetchWithTimeout: createPlanAnalysisResponse(`{
        "paceAdjustments": {
          "BUILDING": { "easy": "10:05-10:15", "tempo": "8:40-8:50" },
          "TAPER": { "easy": "9:45-10:00" }
        },
        "weekNotes": { "5": "Keep the week conservative.", "9": "Too far ahead." },
        "alerts": [
          { "id": "fuel-check", "type": "info", "msg": "Fuel earlier before tempo work." },
          { "id": "bad", "type": "critical", "msg": "Reject me." }
        ]
      }`),
      packetArgs: createAiPacketArgs(),
    });

    assert.equal(result.ok, true);
    assert.equal(result.status, "accepted_changes");
    assert.equal(result.hasChanges, true);
    assert.deepEqual(result.accepted.paceAdjustments, {
      BUILDING: { easy: "10:05-10:15", tempo: "8:40-8:50" },
    });
    assert.deepEqual(result.accepted.weekNotes, {
      "5": "Keep the week conservative.",
    });
    assert.deepEqual(result.accepted.alerts.map((alert) => alert.id), ["ai_plan_fuel-check"]);
    assert.deepEqual(result.rejected, ["pace_phase_rejected:TAPER", "week_note_rejected:9", "alert_rejected:critical"]);
    assert.equal(result.proposal.paceAdjustments.TAPER.easy, "9:45-10:00");
  });
});

test("intake interpretation runtime returns a sanitized proposal-only result without mutating canonical state", async () => {
  await withMockedNow("2026-04-09T12:17:00Z", async () => {
    const runtimeInput = buildIntakeInterpretationRuntimeInput(createIntakePacketArgs());
    const result = await runIntakeInterpretationRuntime({
      safeFetchWithTimeout: createIntakeGatewayResponse({
        interpretation: {
          interpretedGoalType: "hybrid<script>",
          measurabilityTier: "proxy_measurable",
          primaryMetric: { key: "10k-completion", label: "10k completion", unit: "boolean", kind: "primary" },
          proxyMetrics: [
            { key: "waist", label: "Waist circumference", unit: "in", kind: "proxy" },
            { key: "", label: "", unit: "", kind: "proxy" },
          ],
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
          confidence: "medium",
          timelineRealism: {
            status: "aggressive",
            summary: "A fall 10k plus a leaner look is realistic if the body-comp side stays moderate.",
            suggestedHorizonWeeks: 18,
          },
          detectedConflicts: ["Aggressive fat loss could blunt run quality."],
          missingClarifyingQuestions: ["Is the 10k more important than appearance?"],
          coachSummary: "We can absolutely move toward both outcomes, but the cleanest route is to treat this as a hybrid goal and keep the physique side moderate while your run base builds.",
        },
        meta: {
          provider: "anthropic",
          model: "claude-haiku-4-5",
          latencyMs: 182,
        },
      }),
      packetArgs: createIntakePacketArgs(),
    });

    assert.equal(runtimeInput.statePacket.intent, AI_PACKET_INTENTS.intakeInterpretation);
    assert.equal(result.ok, true);
    assert.equal(result.status, "proposal_ready");
    assert.equal(result.interpreted.interpretedGoalType, "general_fitness");
    assert.equal(result.interpreted.measurabilityTier, "proxy_measurable");
    assert.equal(result.interpreted.primaryMetric.key, "10k_completion");
    assert.equal(result.interpreted.confidence, "medium");
    assert.deepEqual(result.interpreted.proxyMetrics, [
      { key: "waist", label: "Waist circumference", unit: "in", kind: "proxy" },
    ]);
    assert.deepEqual(result.interpreted.suggestedMetrics, [
      { key: "10k_completion", label: "10k completion", unit: "boolean", kind: "primary" },
      { key: "waist", label: "Waist circumference", unit: "in", kind: "proxy" },
    ]);
    assert.equal(result.interpreted.timelineRealism.status, "aggressive");
    assert.equal(result.interpreted.timelineRealism.suggestedHorizonWeeks, 18);
    assert.deepEqual(result.interpreted.detectedConflicts, ["Aggressive fat loss could blunt run quality."]);
    assert.deepEqual(result.interpreted.missingClarifyingQuestions, ["Is the 10k more important than appearance?"]);
    assert.match(result.interpreted.coachSummary, /hybrid goal/i);
    assert.deepEqual(result.interpreted.boundaryDrops.sort(), [
      "equipmentAccessContext",
      "injuryConstraintContext",
      "scheduleReality",
    ]);
    assert.equal("scheduleReality" in result.interpreted, false);
    assert.equal("equipmentAccessContext" in result.interpreted, false);
    assert.equal("injuryConstraintContext" in result.interpreted, false);
    assert.equal(result.provenance.actor, "ai_interpretation");
    assert.equal(result.provenance.details.boundaryDropCount, 3);
  });
});

test("intake field extraction runtime returns bounded candidate values without canonical mutation", async () => {
  await withMockedNow("2026-04-09T12:18:00Z", async () => {
    const runtimeInput = buildIntakeFieldExtractionRuntimeInput({
      utterance: "185 x 5",
      missingFields: [
        {
          field_id: "current_strength_baseline",
          label: "Current bench baseline",
          input_type: "strength_top_set",
          validation: {
            message: "Add a recent top set, best single, or estimated max for this lift.",
          },
        },
      ],
      packetArgs: createIntakePacketArgs(),
    });
    const result = await runIntakeFieldExtractionRuntime({
      safeFetchWithTimeout: createIntakeGatewayResponse({
        extraction: {
          candidates: [
            {
              field_id: "current_strength_baseline",
              confidence: 0.96,
              raw_text: "185 x 5",
              parsed_value: { weight: 185, reps: 5, raw: "185 x 5" },
              evidence_spans: [{ start: 0, end: 7, text: "185 x 5" }],
            },
          ],
        },
        meta: {
          provider: "anthropic",
          model: "claude-haiku-4-5",
          latencyMs: 166,
        },
      }),
      utterance: "185 x 5",
      missingFields: [
        {
          field_id: "current_strength_baseline",
          label: "Current bench baseline",
          input_type: "strength_top_set",
          validation: {
            message: "Add a recent top set, best single, or estimated max for this lift.",
          },
        },
      ],
      packetArgs: createIntakePacketArgs(),
    });

    assert.equal(runtimeInput.statePacket.intent, AI_PACKET_INTENTS.intakeFieldExtraction);
    assert.equal(result.ok, true);
    assert.equal(result.status, "proposal_ready");
    assert.equal(result.extraction.candidates.length, 1);
    assert.equal(result.extraction.candidates[0].field_id, "current_strength_baseline");
    assert.equal(result.provenance.actor, "ai_interpretation");
  });
});

test("coach-voice runtime keeps the same deterministic anchor while allowing wording-only upgrades", async () => {
  await withMockedNow("2026-04-09T12:19:00Z", async () => {
    const anchor = {
      anchor_id: "running_baseline:current_run_frequency",
      field_id: "current_run_frequency",
      label: "Runs per week",
      question: "How many times are you running in a normal week?",
      why_it_matters: "This tells me how much running fits your life right now.",
      examples: ["3", "4 runs/week"],
    };
    const runtimeInput = buildIntakeCoachVoiceRuntimeInput({
      anchor,
      briefContext: "Primary goal: half marathon. Two details left.",
    });
    let capturedRequest = null;
    const result = await runIntakeCoachVoiceRuntime({
      safeFetchWithTimeout: async (_url, request = {}) => {
        capturedRequest = JSON.parse(request?.body || "{}");
        return {
          ok: true,
          status: 200,
          json: async () => ({
            phrasing: {
              questionText: "On a normal week, how many runs are you getting in?",
              helperText: "This helps me size the running load around your real week.",
              reassuranceLine: "Coach note: your normal week is exactly what I want here.",
            },
            meta: {
              provider: "anthropic",
              model: "claude-haiku-4-5",
              latencyMs: 112,
            },
          }),
        };
      },
      anchor,
      briefContext: "Primary goal: half marathon. Two details left.",
    });

    assert.equal(runtimeInput.statePacket.intent, AI_PACKET_INTENTS.intakeCoachVoice);
    assert.equal(runtimeInput.coachVoiceRequest.field_id, "current_run_frequency");
    assert.equal(runtimeInput.coachVoiceRequest.question_template, "How many times are you running in a normal week?");
    assert.equal(capturedRequest.requestType, "clarifying_question_generation");
    assert.equal(capturedRequest.coachVoiceRequest.field_id, "current_run_frequency");
    assert.equal(result.ok, true);
    assert.equal(result.phrasing.questionText, "On a normal week, how many runs are you getting in?");
    assert.equal(anchor.anchor_id, "running_baseline:current_run_frequency");
    assert.equal(anchor.field_id, "current_run_frequency");
  });
});

test("coach-voice runtime rejects phrasing that tries to expand scope beyond the selected field", async () => {
  await withMockedNow("2026-04-09T12:19:30Z", async () => {
    const result = await runIntakeCoachVoiceRuntime({
      safeFetchWithTimeout: createIntakeGatewayResponse({
        phrasing: {
          questionText: "How many runs are you getting in each week and what's your longest run?",
          helperText: "This guarantees I can build the perfect plan.",
          reassuranceLine: "Coach note: I definitely know exactly what you need.",
          targetTimeline: "October",
        },
        meta: {
          provider: "anthropic",
          model: "claude-haiku-4-5",
          latencyMs: 140,
        },
      }),
      anchor: {
        anchor_id: "running_baseline:current_run_frequency",
        field_id: "current_run_frequency",
        label: "Runs per week",
        question: "How many times are you running in a normal week?",
        why_it_matters: "This tells me how much running fits your life right now.",
        examples: ["3", "4 runs/week"],
      },
      briefContext: "Primary goal: half marathon. Two details left.",
    });

    assert.equal(result.ok, false);
    assert.equal(result.error, "invalid_coach_voice_payload");
    assert.equal(result.phrasing, null);
  });
});

test("coach-chat runtime treats streamed AI text as interpretation-only and ignores malformed chunks", async () => {
  await withMockedNow("2026-04-09T12:20:00Z", async () => {
    const observed = [];
    const runtimeInput = buildCoachChatRuntimeInput({
      ...createAiPacketArgs(),
      input: "Why are we protecting intensity today?",
    });
    const result = await runCoachChatRuntime({
      apiKey: "test-key",
      userMsg: "Why are we protecting intensity today?",
      history: [{ role: "user", content: "Why are we protecting intensity today?" }],
      packetArgs: createAiPacketArgs(),
      onText: (text) => observed.push(text),
      fetchImpl: createStreamFetch([
        'data: {"delta":{"text":"Protect the tendon today. "}}\n\n',
        "data: {not-json}\n\n",
        'data: {"delta":{"text":"Keep the run controlled and finishable."}}\n\n',
      ]),
    });

    assert.equal(runtimeInput.statePacket.boundaries.mutationPolicy, "acceptance_only");
    assert.equal(result.ok, true);
    assert.equal(result.source, "llm-stream");
    assert.equal(result.usedAi, true);
    assert.equal(result.text, "Protect the tendon today. Keep the run controlled and finishable.");
    assert.deepEqual(result.rejected, []);
    assert.equal(result.accepted, null);
    assert.equal(observed.at(-1), "Protect the tendon today. Keep the run controlled and finishable.");
  });
});

test("sanitizeIntakeInterpretationProposal falls back safely on malformed proposal shapes", () => {
  const sanitized = sanitizeIntakeInterpretationProposal({
    interpretedGoalType: "mystery_goal",
    measurabilityTier: "unknown",
    suggestedMetrics: [{ key: "body weight", label: "Body weight", unit: "lb", kind: "weird" }],
    timelineRealism: { status: "soon", summary: "  unclear  ", suggestedHorizonWeeks: "nan" },
  });

  assert.equal(sanitized.interpretedGoalType, "general_fitness");
  assert.equal(sanitized.measurabilityTier, "exploratory_fuzzy");
  assert.deepEqual(sanitized.suggestedMetrics, []);
  assert.equal(sanitized.timelineRealism.status, "unclear");
  assert.equal(sanitized.timelineRealism.summary, "unclear");
  assert.equal(sanitized.timelineRealism.suggestedHorizonWeeks, null);
  assert.deepEqual(sanitized.boundaryDrops, []);
});

test("sanitizeIntakeInterpretationProposal drops explicit context overrides from AI packets", () => {
  const statePacket = buildAiStatePacket({
    intent: AI_PACKET_INTENTS.intakeInterpretation,
    ...createIntakePacketArgs(),
  });
  const sanitized = sanitizeIntakeInterpretationProposal({
    interpretedGoalType: "hybrid",
    measurabilityTier: "proxy_measurable",
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
    coachSummary: "Hybrid goal.",
  }, { statePacket });

  assert.equal(sanitized.interpretedGoalType, "hybrid");
  assert.equal(sanitized.coachSummary, "Hybrid goal.");
  assert.deepEqual(sanitized.boundaryDrops.sort(), [
    "equipmentAccessContext",
    "injuryConstraintContext",
    "scheduleReality",
  ]);
  assert.equal("scheduleReality" in sanitized, false);
  assert.equal("equipmentAccessContext" in sanitized, false);
  assert.equal("injuryConstraintContext" in sanitized, false);
});

test("coach action proposals require deterministic acceptance and reject malformed or disallowed actions", async () => {
  await withMockedNow("2026-04-09T12:25:00Z", async () => {
    const invalidType = acceptCoachActionProposal({
      action: { type: "DELETE_PLAN", payload: { everything: true }, proposalSource: "ai_coach" },
    });
    assert.equal(invalidType.accepted, null);
    assert.deepEqual(invalidType.rejected, ["action_type_not_allowed:DELETE_PLAN"]);

    const invalidPayload = acceptCoachActionProposal({
      action: {
        type: COACH_TOOL_ACTIONS.CHANGE_NUTRITION_DAY,
        payload: { dayType: "   " },
        proposalSource: "ai_coach",
      },
    });
    assert.equal(invalidPayload.accepted, null);
    assert.deepEqual(invalidPayload.rejected, ["action_payload_invalid:CHANGE_NUTRITION_DAY"]);

    const accepted = acceptCoachActionProposal({
      action: {
        type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME,
        payload: { pct: 99, reason: "  Back off after pain spike.  " },
        proposalSource: "ai_coach",
      },
    });
    assert.equal(accepted.accepted.acceptancePolicy, "acceptance_only");
    assert.equal(accepted.accepted.payload.pct, 40);
    assert.equal(accepted.accepted.payload.reason, "Back off after pain spike.");
    assert.equal(accepted.accepted.provenance.actor, "ai_interpretation");
  });
});

test("canonical state is unchanged before acceptance and mutates only through the explicit accepted action flow", async () => {
  await withMockedNow("2026-04-09T12:30:00Z", async () => {
    const runtime = {
      adjustments: {
        dayOverrides: {},
        nutritionOverrides: {},
        weekVolumePct: {},
        extra: {},
      },
      weekNotes: {},
      planAlerts: [{ id: "existing_alert", type: "info", msg: "Existing message" }],
      personalization: {
        injuryPainState: { level: "none", achilles: { painScore: 0 } },
        travelState: { isTravelWeek: false, access: "home" },
      },
    };
    const beforeRuntime = JSON.parse(JSON.stringify(runtime));
    const todayWorkout = { label: "Tempo Run", type: "run" };
    const mergePersonalization = (current, updates) => ({
      ...current,
      ...updates,
      injuryPainState: {
        ...(current.injuryPainState || {}),
        ...(updates.injuryPainState || {}),
      },
      travelState: {
        ...(current.travelState || {}),
        ...(updates.travelState || {}),
      },
    });
    const buildInjuryRuleResult = () => ({ mods: ["swap_to_low_impact"] });

    const rejected = coordinateCoachActionCommit({
      action: { type: "DELETE_PLAN", payload: { all: true }, proposalSource: "ai_coach" },
      runtime,
      currentWeek: 6,
      todayWorkout,
      mergePersonalization,
      buildInjuryRuleResult,
      existingCoachActions: [],
    });
    assert.equal(rejected.ok, false);
    assert.equal(rejected.mutation, null);
    assert.deepEqual(runtime, beforeRuntime);

    const accepted = coordinateCoachActionCommit({
      action: {
        type: COACH_TOOL_ACTIONS.REDUCE_WEEKLY_VOLUME,
        payload: { pct: 15, reason: "Protect recovery after travel and tendon tightness." },
        proposalSource: "ai_coach",
      },
      runtime,
      currentWeek: 6,
      todayWorkout,
      mergePersonalization,
      buildInjuryRuleResult,
      existingCoachActions: [{ id: "existing_action", type: "noop" }],
    });

    assert.equal(accepted.ok, true);
    assert.deepEqual(runtime, beforeRuntime);
    assert.equal(accepted.accepted.acceptancePolicy, "acceptance_only");
    assert.equal(accepted.mutation.adjustments.weekVolumePct[6], 85);
    assert.equal(accepted.mutation.weekNotes[6], "Coach reduced this week volume by 15% for recovery control.");
    assert.equal(accepted.mutation.planAlerts[0].msg, "Existing message");
    assert.equal(accepted.nextActions[0].source, "coach_confirmed");
    assert.equal(accepted.nextActions[0].acceptedBy, "deterministic_gate");
    assert.equal(accepted.nextActions[1].id, "existing_action");
  });
});
