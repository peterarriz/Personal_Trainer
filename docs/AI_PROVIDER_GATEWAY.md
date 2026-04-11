# AI Provider Gateway

## Purpose

This repo now has a narrow backend AI gateway for intake interpretation.

The gateway exists so intake can benefit from provider nuance without letting:

- provider keys leak into the browser
- provider output become canonical truth
- onboarding break when the provider fails

## Scope

First scope only:

- intake goal interpretation
- intake clarifying-question generation

This is intentionally not a general chat backend.

## Backend Structure

Files:

- [api/ai/intake.js](c:/Users/Peter/Documents/Personal_Trainer/api/ai/intake.js)
- [api/_lib/ai-provider-gateway.js](c:/Users/Peter/Documents/Personal_Trainer/api/_lib/ai-provider-gateway.js)

Responsibilities:

- `api/ai/intake.js`
  - POST-only server route
  - validates the typed intake packet
  - calls the shared provider gateway
  - returns a normalized interpretation contract

- `api/_lib/ai-provider-gateway.js`
  - chooses the configured provider
  - builds the intake interpretation prompt
  - calls Anthropic or OpenAI behind one contract
  - normalizes provider output into the repo's internal intake interpretation shape
  - logs lightweight observability metadata

## Provider Contract

The gateway supports a provider-agnostic normalized result:

```js
{
  interpretedGoalType: "performance|strength|body_comp|appearance|hybrid|general_fitness|re_entry",
  measurabilityTier: "fully_measurable|proxy_measurable|exploratory_fuzzy",
  primaryMetric: {
    key: "half_marathon_time",
    label: "Half marathon time",
    unit: "time",
    kind: "primary",
    targetValue: "1:45:00"
  } | null,
  proxyMetrics: [
    { key: "weekly_run_frequency", label: "Weekly run frequency", unit: "sessions", kind: "proxy" }
  ],
  suggestedMetrics: [
    // compatibility superset of primary + proxy metrics
  ],
  confidence: "low|medium|high",
  timelineRealism: {
    status: "realistic|aggressive|unclear",
    summary: "short timeline realism assessment",
    suggestedHorizonWeeks: 12
  },
  detectedConflicts: ["short tradeoff"],
  missingClarifyingQuestions: ["short question"],
  coachSummary: "interpretation-only summary"
}
```

This is still a proposal-only object.

## Provider Selection

Server env vars:

- `AI_INTAKE_PROVIDER`
- `AI_INTAKE_MODEL_ANTHROPIC`
- `AI_INTAKE_MODEL_OPENAI`
- `ANTHROPIC_API_KEY`
- `OPENAI_API_KEY`

Selection rules:

1. Use `AI_INTAKE_PROVIDER` if configured and that provider key exists.
2. Otherwise prefer Anthropic if configured.
3. Otherwise use OpenAI if configured.
4. If neither provider is configured, the route fails cleanly and the client falls back to deterministic/local interpretation.

## Observability

The gateway logs one structured event per intake request with:

- `requestType`
- `provider`
- `model`
- `latencyMs`
- `usage`
- `failureReason`
- `status`

This is intentionally lightweight and server-side only.

## Failure Behavior

If the gateway fails because of:

- missing provider config
- upstream provider failure
- invalid provider JSON
- network failure

the client runtime returns a non-OK intake interpretation result and onboarding falls back to the deterministic/local resolution path.

That means:

- onboarding still completes
- the user can still confirm/edit a resolved goal
- no canonical goal state is written from a failed provider response

## Security Boundary

Provider keys are server-only and live in API-route env vars.

The browser sends:

- the typed intake state packet

The browser never sends:

- provider secrets

The browser receives:

- a normalized proposal-only interpretation
- lightweight non-secret metadata

## Non-Goals

This first gateway does not yet cover:

- coach chat
- plan analysis
- nutrition assistant generation
- generic prompt routing

Those paths can migrate later behind the same backend style if needed.
