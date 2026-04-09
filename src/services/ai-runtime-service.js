import {
  AI_PACKET_INTENTS,
  buildAiStatePacket,
  parseAiJsonObjectFromText,
  acceptAiPlanAnalysisProposal,
  buildCoachAiSystemPrompt,
  buildPlanAnalysisAiSystemPrompt,
  buildIntakeInterpretationAiSystemPrompt,
  sanitizeIntakeInterpretationProposal,
} from "../modules-ai-state.js";
import { acceptCoachActionProposal, applyCoachActionMutation } from "../modules-coach-engine.js";
import { buildProvenanceEvent, PROVENANCE_ACTORS } from "./provenance-service.js";

const DEFAULT_MODEL = "claude-3-5-haiku-latest";
const DEFAULT_API_URL = "https://api.anthropic.com/v1/messages";

export const AI_RUNTIME_TODO_PATHS = [
  {
    area: "strength_adjustment_copy",
    location: "trainer-dashboard.jsx / buildStrengthAdjustmentNotification",
    note: "Uses ad hoc prompt text without a typed AI state packet.",
  },
  {
    area: "deterministic_explanation_copy",
    location: "trainer-dashboard.jsx / strength alert explanation helpers",
    note: "Uses short-form copy generation outside the unified coordinator.",
  },
  {
    area: "meal_generation_copy",
    location: "trainer-dashboard.jsx / nutrition assistant prompt path",
    note: "Uses ad hoc content generation rather than packet-scoped AI runtime.",
  },
];

export const resolveStoredAiApiKey = ({ safeStorageGet, storageLike } = {}) => {
  if (!safeStorageGet || !storageLike) return "";
  return safeStorageGet(storageLike, "coach_api_key", "") || safeStorageGet(storageLike, "anthropic_api_key", "");
};

export const requestAiText = async ({
  apiKey = "",
  safeFetchWithTimeout,
  system = "",
  user = "",
  maxTokens = 800,
  model = DEFAULT_MODEL,
  timeoutMs = 9000,
} = {}) => {
  if (!apiKey || typeof safeFetchWithTimeout !== "function") {
    return { ok: false, text: "", error: "missing_api_key_or_fetcher" };
  }
  try {
    const res = await safeFetchWithTimeout(DEFAULT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        system,
        messages: [{ role: "user", content: user }],
      }),
    }, timeoutMs);
    if (!res.ok) {
      return { ok: false, text: "", error: `http_${res.status}` };
    }
    const data = await res.json();
    return { ok: true, text: data?.content?.[0]?.text || "", error: "" };
  } catch (error) {
    return { ok: false, text: "", error: error?.message || "request_failed" };
  }
};

export const streamAiText = async ({
  apiKey = "",
  fetchImpl = null,
  system = "",
  history = [],
  onText = null,
  model = DEFAULT_MODEL,
  maxTokens = 450,
  firstChunkTimeoutMs = 1000,
} = {}) => {
  if (!apiKey || typeof fetchImpl !== "function") {
    return { ok: false, text: "", error: "missing_api_key_or_fetcher" };
  }

  const payload = {
    model,
    max_tokens: maxTokens,
    stream: true,
    system,
    messages: history,
  };

  const ctrl = new AbortController();
  let firstChunk = false;
  const firstWordTimer = setTimeout(() => {
    if (!firstChunk) ctrl.abort();
  }, firstChunkTimeoutMs);

  try {
    const res = await fetchImpl(DEFAULT_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(payload),
      signal: ctrl.signal,
    });
    if (!res.ok || !res.body) {
      throw new Error("stream_unavailable");
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let fullText = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() || "";

      for (const evt of events) {
        const dataLine = evt.split("\n").find((line) => line.startsWith("data: "));
        if (!dataLine) continue;
        const data = dataLine.slice(6).trim();
        if (data === "[DONE]") continue;
        try {
          const parsed = JSON.parse(data);
          const delta = parsed?.delta?.text || parsed?.content_block?.text || "";
          if (!delta) continue;
          firstChunk = true;
          clearTimeout(firstWordTimer);
          fullText += delta;
          if (typeof onText === "function") onText(fullText);
        } catch {
          // Ignore malformed stream chunks and continue reading.
        }
      }
    }

    clearTimeout(firstWordTimer);
    return { ok: true, text: fullText.trim(), error: "" };
  } catch (error) {
    clearTimeout(firstWordTimer);
    return { ok: false, text: "", error: error?.message || "stream_failed" };
  }
};

export const buildPlanAnalysisRuntimeInput = ({
  input = "Analyze recent prescribed-vs-actual training and propose plan adjustments.",
  ...packetArgs
} = {}) => {
  const statePacket = buildAiStatePacket({
    intent: AI_PACKET_INTENTS.planAnalysis,
    input,
    ...packetArgs,
  });
  const systemPrompt = buildPlanAnalysisAiSystemPrompt({ statePacket });
  return { statePacket, systemPrompt };
};

export const runPlanAnalysisRuntime = async ({
  apiKey = "",
  safeFetchWithTimeout,
  packetArgs = {},
  model = DEFAULT_MODEL,
} = {}) => {
  const runtimeInput = buildPlanAnalysisRuntimeInput(packetArgs);
  const requestedAt = Date.now();
  const response = await requestAiText({
    apiKey,
    safeFetchWithTimeout,
    system: runtimeInput.systemPrompt,
    user: "Analyze the typed AI state packet and return a JSON proposal only.",
    maxTokens: 800,
    model,
  });

  if (!response.ok || !response.text) {
    return {
      ok: false,
      status: "no_response",
      statePacket: runtimeInput.statePacket,
      systemPrompt: runtimeInput.systemPrompt,
      proposal: null,
      accepted: null,
      rejected: [],
      hasChanges: false,
      rawText: response.text || "",
      error: response.error || "no_response",
      provenance: buildProvenanceEvent({
        actor: PROVENANCE_ACTORS.fallback,
        trigger: "plan_analysis_runtime",
        mutationType: "ai_runtime_failure",
        revisionReason: "AI plan analysis returned no response.",
        sourceInputs: ["typed_ai_state_packet", runtimeInput.statePacket?.intent || AI_PACKET_INTENTS.planAnalysis],
        confidence: "low",
        timestamp: requestedAt,
        details: {
          error: response.error || "no_response",
        },
      }),
      ui: {
        message: "No AI plan-analysis response was returned.",
      },
    };
  }

  const proposal = parseAiJsonObjectFromText(response.text);
  if (!proposal) {
    return {
      ok: false,
      status: "invalid_json",
      statePacket: runtimeInput.statePacket,
      systemPrompt: runtimeInput.systemPrompt,
      proposal: null,
      accepted: null,
      rejected: ["proposal_invalid_json"],
      hasChanges: false,
      rawText: response.text,
      error: "invalid_json",
      provenance: buildProvenanceEvent({
        actor: PROVENANCE_ACTORS.fallback,
        trigger: "plan_analysis_runtime",
        mutationType: "ai_runtime_failure",
        revisionReason: "AI returned invalid JSON for plan analysis.",
        sourceInputs: ["typed_ai_state_packet", runtimeInput.statePacket?.intent || AI_PACKET_INTENTS.planAnalysis],
        confidence: "low",
        timestamp: requestedAt,
        details: {
          error: "invalid_json",
        },
      }),
      ui: {
        message: "AI returned an invalid plan-analysis payload.",
      },
    };
  }

  const acceptance = acceptAiPlanAnalysisProposal({
    proposal,
    statePacket: runtimeInput.statePacket,
  });
  const accepted = acceptance.accepted;
  const hasChanges = Boolean(acceptance.hasChanges && !accepted?.noChange);

  return {
    ok: true,
    status: hasChanges ? "accepted_changes" : "no_change",
    statePacket: runtimeInput.statePacket,
    systemPrompt: runtimeInput.systemPrompt,
    proposal,
    accepted,
    rejected: acceptance.rejected || [],
    hasChanges,
    rawText: response.text,
    error: "",
    provenance: buildProvenanceEvent({
      actor: PROVENANCE_ACTORS.aiInterpretation,
      trigger: "plan_analysis_runtime",
      mutationType: "ai_runtime_result",
      revisionReason: hasChanges ? "AI plan-analysis proposal accepted through deterministic gates." : "AI plan-analysis produced no accepted changes.",
      sourceInputs: ["typed_ai_state_packet", runtimeInput.statePacket?.intent || AI_PACKET_INTENTS.planAnalysis],
      confidence: hasChanges ? "medium" : "low",
      timestamp: requestedAt,
      details: {
        hasChanges,
        rejectedCount: (acceptance.rejected || []).length,
      },
    }),
    ui: {
      message: hasChanges ? "AI plan-analysis proposal accepted through deterministic gates." : "AI plan-analysis produced no accepted changes.",
    },
  };
};

export const buildCoachChatRuntimeInput = ({
  input = "",
  ...packetArgs
} = {}) => {
  const statePacket = buildAiStatePacket({
    intent: AI_PACKET_INTENTS.coachChat,
    input,
    ...packetArgs,
  });
  const systemPrompt = buildCoachAiSystemPrompt({ statePacket });
  return { statePacket, systemPrompt };
};

export const buildIntakeInterpretationRuntimeInput = ({
  input = "Interpret the intake packet and return a proposal-only goal assessment.",
  ...packetArgs
} = {}) => {
  const statePacket = buildAiStatePacket({
    intent: AI_PACKET_INTENTS.intakeInterpretation,
    input,
    ...packetArgs,
  });
  const systemPrompt = buildIntakeInterpretationAiSystemPrompt({ statePacket });
  return { statePacket, systemPrompt };
};

export const runIntakeInterpretationRuntime = async ({
  apiKey = "",
  safeFetchWithTimeout,
  packetArgs = {},
  model = DEFAULT_MODEL,
} = {}) => {
  const runtimeInput = buildIntakeInterpretationRuntimeInput(packetArgs);
  const requestedAt = Date.now();
  const response = await requestAiText({
    apiKey,
    safeFetchWithTimeout,
    system: runtimeInput.systemPrompt,
    user: "Interpret the typed intake packet and return a JSON proposal only.",
    maxTokens: 500,
    model,
  });

  if (!response.ok || !response.text) {
    return {
      ok: false,
      status: "no_response",
      statePacket: runtimeInput.statePacket,
      systemPrompt: runtimeInput.systemPrompt,
      proposal: null,
      interpreted: null,
      rawText: response.text || "",
      error: response.error || "no_response",
      provenance: buildProvenanceEvent({
        actor: PROVENANCE_ACTORS.fallback,
        trigger: "intake_interpretation_runtime",
        mutationType: "ai_runtime_failure",
        revisionReason: "AI intake interpretation returned no response.",
        sourceInputs: ["typed_ai_state_packet", runtimeInput.statePacket?.intent || AI_PACKET_INTENTS.intakeInterpretation],
        confidence: "low",
        timestamp: requestedAt,
        details: {
          error: response.error || "no_response",
        },
      }),
      ui: {
        message: "No AI intake interpretation response was returned.",
      },
    };
  }

  const proposal = parseAiJsonObjectFromText(response.text);
  if (!proposal) {
    return {
      ok: false,
      status: "invalid_json",
      statePacket: runtimeInput.statePacket,
      systemPrompt: runtimeInput.systemPrompt,
      proposal: null,
      interpreted: null,
      rawText: response.text,
      error: "invalid_json",
      provenance: buildProvenanceEvent({
        actor: PROVENANCE_ACTORS.fallback,
        trigger: "intake_interpretation_runtime",
        mutationType: "ai_runtime_failure",
        revisionReason: "AI returned invalid JSON for intake interpretation.",
        sourceInputs: ["typed_ai_state_packet", runtimeInput.statePacket?.intent || AI_PACKET_INTENTS.intakeInterpretation],
        confidence: "low",
        timestamp: requestedAt,
        details: {
          error: "invalid_json",
        },
      }),
      ui: {
        message: "AI returned an invalid intake interpretation payload.",
      },
    };
  }

  const interpreted = sanitizeIntakeInterpretationProposal(proposal);

  return {
    ok: true,
    status: "proposal_ready",
    statePacket: runtimeInput.statePacket,
    systemPrompt: runtimeInput.systemPrompt,
    proposal,
    interpreted,
    rawText: response.text,
    error: "",
    provenance: buildProvenanceEvent({
      actor: PROVENANCE_ACTORS.aiInterpretation,
      trigger: "intake_interpretation_runtime",
      mutationType: "ai_runtime_result",
      revisionReason: "AI intake interpretation returned a proposal-only packet-scoped assessment.",
      sourceInputs: ["typed_ai_state_packet", runtimeInput.statePacket?.intent || AI_PACKET_INTENTS.intakeInterpretation],
      confidence: "medium",
      timestamp: requestedAt,
      details: {
        metricCount: interpreted?.suggestedMetrics?.length || 0,
        questionCount: interpreted?.missingClarifyingQuestions?.length || 0,
      },
    }),
    ui: {
      message: "AI intake interpretation returned a proposal-only assessment.",
    },
  };
};

export const runCoachChatRuntime = async ({
  apiKey = "",
  coachMode = "auto",
  userMsg = "",
  history = [],
  deterministicText = "Coach update ready.",
  packetArgs = {},
  fetchImpl = null,
  onText = null,
  model = DEFAULT_MODEL,
} = {}) => {
  const runtimeInput = buildCoachChatRuntimeInput({
    ...packetArgs,
    input: userMsg,
  });
  const requestedAt = Date.now();
  if (coachMode === "deterministic" || !apiKey) {
    return {
      ok: true,
      source: "deterministic",
      text: deterministicText,
      statePacket: runtimeInput.statePacket,
      systemPrompt: runtimeInput.systemPrompt,
      rejected: [],
      accepted: null,
      usedAi: false,
      provenance: buildProvenanceEvent({
        actor: PROVENANCE_ACTORS.deterministicEngine,
        trigger: "coach_chat_runtime",
        mutationType: "coach_response",
        revisionReason: "Coach response came from the deterministic engine.",
        sourceInputs: ["typed_ai_state_packet", coachMode === "deterministic" ? "deterministic_mode" : "missing_api_key"],
        confidence: "high",
        timestamp: requestedAt,
      }),
      ui: {
        message: "Coach response came from the deterministic engine.",
      },
    };
  }

  const streamed = await streamAiText({
    apiKey,
    fetchImpl,
    system: runtimeInput.systemPrompt,
    history,
    onText,
    model,
  });

  if (!streamed.ok || !streamed.text) {
    return {
      ok: true,
      source: "deterministic-fallback",
      text: deterministicText,
      statePacket: runtimeInput.statePacket,
      systemPrompt: runtimeInput.systemPrompt,
      rejected: [streamed.error || "stream_failed"],
      accepted: null,
      usedAi: false,
      provenance: buildProvenanceEvent({
        actor: PROVENANCE_ACTORS.fallback,
        trigger: "coach_chat_runtime",
        mutationType: "coach_response_fallback",
        revisionReason: "Coach response fell back to the deterministic engine after AI streaming failed.",
        sourceInputs: ["typed_ai_state_packet", "llm_stream_failure"],
        confidence: "low",
        timestamp: requestedAt,
        details: {
          error: streamed.error || "stream_failed",
        },
      }),
      ui: {
        message: "Coach response fell back to the deterministic engine after AI streaming failed.",
      },
    };
  }

  return {
    ok: true,
    source: "llm-stream",
    text: streamed.text,
    statePacket: runtimeInput.statePacket,
    systemPrompt: runtimeInput.systemPrompt,
    rejected: [],
    accepted: null,
    usedAi: true,
    provenance: buildProvenanceEvent({
      actor: PROVENANCE_ACTORS.aiInterpretation,
      trigger: "coach_chat_runtime",
      mutationType: "coach_response",
      revisionReason: "Coach response streamed from packet-scoped AI context.",
      sourceInputs: ["typed_ai_state_packet", runtimeInput.statePacket?.intent || AI_PACKET_INTENTS.coachChat],
      confidence: "medium",
      timestamp: requestedAt,
    }),
    ui: {
      message: "Coach response streamed from packet-scoped AI context.",
    },
  };
};

export const coordinateCoachActionCommit = ({
  action = null,
  runtime = {},
  currentWeek = 1,
  todayWorkout = null,
  mergePersonalization,
  buildInjuryRuleResult,
  existingCoachActions = [],
} = {}) => {
  const committedAt = Date.now();
  const acceptedProposal = acceptCoachActionProposal({
    action,
    proposalSource: action?.proposalSource || action?.source || "coach_surface",
  });

  if (!acceptedProposal?.accepted) {
    return {
      ok: false,
      accepted: null,
      rejected: acceptedProposal?.rejected || ["action_rejected"],
      mutation: null,
      nextActions: existingCoachActions,
      provenance: buildProvenanceEvent({
        actor: PROVENANCE_ACTORS.fallback,
        trigger: "coach_action_commit",
        mutationType: "coach_action_rejection",
        revisionReason: "Coach action was rejected by the deterministic gate.",
        sourceInputs: ["coach_action_proposal", action?.type || "unknown"],
        confidence: "high",
        timestamp: committedAt,
      }),
      ui: {
        message: "That suggestion was rejected by the deterministic acceptance gate, so no plan state changed.",
      },
    };
  }

  const acceptedAction = acceptedProposal.accepted;
  const mutation = applyCoachActionMutation({
    action: acceptedAction,
    runtime,
    currentWeek,
    todayWorkout,
    mergePersonalization,
    buildInjuryRuleResult,
  });
  const nextActions = [{
    ...acceptedAction,
    id: `coach_act_${Date.now()}`,
    ts: Date.now(),
    source: "coach_confirmed",
    proposalSource: acceptedAction.proposalSource || "coach_surface",
    acceptedBy: acceptedAction.acceptedBy || "deterministic_gate",
    acceptancePolicy: acceptedAction.acceptancePolicy || "acceptance_only",
    reason: acceptedAction.rationale || acceptedAction.payload?.reason || "coach-confirmed",
    provenance: acceptedAction.provenance || buildProvenanceEvent({
      actor: PROVENANCE_ACTORS.deterministicEngine,
      trigger: acceptedAction.proposalSource || "coach_surface",
      mutationType: "coach_action_acceptance",
      revisionReason: acceptedAction.rationale || acceptedAction.payload?.reason || acceptedAction.type || "coach-confirmed",
      sourceInputs: ["coach_action_proposal", acceptedAction.type || "unknown"],
      confidence: "medium",
      timestamp: committedAt,
    }),
  }, ...(existingCoachActions || [])].slice(0, 60);

  return {
    ok: true,
    accepted: acceptedAction,
    rejected: [],
    mutation,
    nextActions,
    provenance: acceptedAction.provenance || null,
    ui: {
      message: "Coach action accepted through the deterministic gate.",
    },
  };
};
