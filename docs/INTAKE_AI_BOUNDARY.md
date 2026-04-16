# Intake AI Boundary

## Purpose

This document defines the intake AI boundary after moving provider access behind a backend gateway.

For the current end-to-end setup contract, also read `docs/PLANNING_SOURCE_OF_TRUTH_OVERVIEW.md` and `docs/IDEAL_INTAKE_FLOW.md`.

The architecture rule is unchanged:

1. user gives raw intent
2. AI proposes interpretation
3. user confirms or edits
4. only confirmed structured goal state becomes canonical planner input

The live intake is structured-first and goal-type-first. AI participates after the app has enough typed context to ask for a proposal.

## Boundary Summary

Intake AI is now split into two layers:

- client/runtime layer
  - builds the typed intake packet
  - sends the packet to the backend intake gateway
  - re-sanitizes the returned proposal
  - falls back to deterministic/local interpretation if the gateway fails

- backend/provider layer
  - owns provider credentials
  - chooses Anthropic or OpenAI behind one contract
  - converts provider output into a normalized interpretation shape
  - returns proposal-only output

## Files

Client/runtime:

- [src/services/ai-runtime-service.js](c:/Users/Peter/Documents/Personal_Trainer/src/services/ai-runtime-service.js)
- [src/modules-ai-state.js](c:/Users/Peter/Documents/Personal_Trainer/src/modules-ai-state.js)
- [src/services/goal-resolution-service.js](c:/Users/Peter/Documents/Personal_Trainer/src/services/goal-resolution-service.js)
- [src/trainer-dashboard.jsx](c:/Users/Peter/Documents/Personal_Trainer/src/trainer-dashboard.jsx)

Backend:

- [api/ai/intake.js](c:/Users/Peter/Documents/Personal_Trainer/api/ai/intake.js)
- [api/_lib/ai-provider-gateway.js](c:/Users/Peter/Documents/Personal_Trainer/api/_lib/ai-provider-gateway.js)

## Typed Packet In

The browser still constructs the typed intake packet with the existing AI packet system:

```js
{
  version: "2026-04-v1",
  intent: "intake_interpretation",
  intake: {
    rawGoalText: string,
    baselineContext: { ... },
    scheduleReality: { ... },
    equipmentAccessContext: { ... },
    injuryConstraintContext: { ... },
    userProvidedConstraints: { ... }
  },
  boundaries: {
    sourceOfTruth: "canonical_app_state",
    mutationPolicy: "acceptance_only",
    aiMay: ["explain", "summarize", "propose"],
    aiMayNot: ["directly_mutate_plan", "directly_mutate_logs", "be_source_of_truth"]
  }
}
```

The browser sends that packet to `POST /api/ai/intake`.

## Normalized Proposal Out

The backend returns a normalized proposal-only interpretation:

```js
{
  interpretation: {
    interpretedGoalType: "...",
    measurabilityTier: "...",
    primaryMetric: null | { ... },
    proxyMetrics: [ ... ],
    suggestedMetrics: [ ... ],
    confidence: "low|medium|high",
    timelineRealism: {
      status: "realistic|aggressive|unclear",
      summary: "...",
      suggestedHorizonWeeks: 12
    },
    detectedConflicts: [ ... ],
    missingClarifyingQuestions: [ ... ],
    coachSummary: "..."
  },
  meta: {
    requestType: "goal_interpretation",
    provider: "anthropic|openai",
    model: "provider-model",
    latencyMs: 123,
    usage: {
      inputTokens: 100,
      outputTokens: 40,
      totalTokens: 140
    }
  }
}
```

The client then re-sanitizes `interpretation` before it is shown or passed downstream.

## Canonical Safety Rule

The provider proposal is not canonical state.

It may:

- interpret messy goal language
- propose metrics
- suggest clarifying questions
- surface tradeoffs
- suggest a horizon
- suggest whether the goal looks open-ended, horizon-based, or date-based

It may not:

- write `goals`
- write `goalState`
- write `planDay`
- write `planWeek`
- bypass explicit user confirmation
- force an exact target date when the user only has a loose horizon or an ongoing goal

Canonical planning state still comes from:

- `resolveGoalTranslation(...)`
- `applyResolvedGoalsToGoalSlots(...)`
- `buildGoalStateFromResolvedGoals(...)`

after explicit user confirmation.

## Runtime Flow

1. Intake answers are collected.
2. The app builds a typed intake packet.
3. `runIntakeInterpretationRuntime(...)` posts that packet to `/api/ai/intake`.
4. The backend provider gateway calls the configured provider.
5. The backend normalizes the provider output into the internal interpretation shape.
6. The client re-sanitizes the interpretation.
7. The review UI shows the interpretation and goal stack proposal.
8. If the user confirms, deterministic goal-resolution code writes canonical planner-facing state.

That means:

- AI can help turn messy intent into a proposal
- the user still confirms the ordered priority stack
- exact date vs target horizon vs open-ended timing is still a deterministic app decision after confirmation

## Failure Flow

If the backend gateway fails:

- missing provider config
- network failure
- provider error
- invalid provider JSON

then:

1. `runIntakeInterpretationRuntime(...)` returns a non-OK result
2. intake review falls back to the deterministic/local preview bundle
3. onboarding still works
4. no partial canonical state is written

## Security Boundary

Server-only:

- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`
- provider/model routing

Client-visible:

- typed intake packet
- normalized proposal-only output
- non-secret metadata like provider/model/latency

Intake no longer depends on browser-stored provider keys.

## What This Change Does Not Do

This intake gateway does not yet migrate:

- coach chat
- plan analysis
- nutrition copy paths
- other legacy direct-provider surfaces

Those remain separate work.
