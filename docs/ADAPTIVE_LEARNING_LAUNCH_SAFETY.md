# Adaptive Learning Launch Safety

## Purpose

This is the launch-safe scaffold for adaptive prescription in FORMA.

It does not turn adaptive prescription on by default.
It does make the codebase structurally ready for:

- bounded adaptive decision points
- shadow-mode logging
- offline evaluation
- replay against historical events
- future promotion from shadow to active after review

Primary implementation:

- `src/services/adaptive-learning-scaffolding-service.js`
- `src/services/adaptive-learning-event-service.js`
- `src/services/adaptive-learning-store-service.js`
- `src/services/adaptive-policy-service.js`
- `src/services/adaptive-policy-shadow-evaluation-service.js`
- `src/services/adaptive-learning-analysis-service.js`
- `src/services/adaptive-policy-config-service.js`

## Launch-Safe Defaults

Default launch posture:

- adaptive learning global enable: `false`
- policy mode: `deterministic_only`
- internal diagnostics: `false`
- decision points: bounded and registered, but off unless explicitly enabled

The planner still stays deterministic unless one of these is true:

1. an explicit `adaptivePolicyConfig` override is passed for tests, replay, or operator evaluation
2. `personalization.settings.adaptiveLearning` explicitly enables adaptive behavior
3. legacy `personalization.settings.adaptivePolicy` is still used for backward-compatible non-launch paths

Operator-managed reviewed config now lives under:

```text
config/adaptive-learning/
```

That path is updated by:

```bash
npm run qa:adaptive-policy:apply-bundle -- --bundle artifacts/adaptive-policy-promotion --mode shadow
```

## Feature Flags

The new launch-safe flag root is:

```js
personalization.settings.adaptiveLearning = {
  globalEnable: false,
  mode: "deterministic_only",
  internalDiagnostics: false,
  thresholds: {
    minConfidenceScore: 65,
    minScoreLift: 0.035,
    minSampleSize: 6,
  },
  decisionPoints: {
    progression_aggressiveness_band: {
      enabled: true,
      rolloutMode: "inherit",
      stage: "shadow_ready",
    },
  },
}
```

Supported behavior:

- `globalEnable`
  Master switch for live adaptive behavior.
- `mode`
  One of `deterministic_only`, `shadow`, or `active`.
- `internalDiagnostics`
  Internal-only flag. This must still pass a trusted local debug gate before any diagnostics surface should render.
- `decisionPoints[*].enabled`
  Per-decision-point gate.
- `decisionPoints[*].rolloutMode`
  One of `inherit`, `deterministic_only`, `shadow`, or `active`.

## Decision-Point Registry

The registry is generated from the bounded policy layer and lives in:

- `resolveAdaptiveLearningScaffolding(...).decisionPointRegistry`
- `buildAdaptiveScaffoldingManifest(...)`

Each registry entry includes:

- decision point id
- owner
- allowed actions
- fallback action
- required context inputs
- safe lever type
- forbidden moves
- rollout mode
- lifecycle stage

This keeps new adaptive work bounded to approved seams rather than letting it drift into arbitrary planner mutation.

## What Counts As A Safe Adaptive Lever

Safe:

- reranking a small approved candidate set
- choosing among pre-approved progression bands
- choosing among pre-approved deload timing windows
- choosing among pre-approved session packaging variants
- choosing among pre-approved travel substitutions
- choosing among pre-approved hybrid balance templates

Not safe:

- freeform workout generation
- injury or medical prescription
- dynamic weekly structure invention
- unsupported sport logic
- direct coach-driven program rewrites
- hidden plan mutation without provenance

## Event, Storage, And Replay Scaffolding

Already in place:

- strict adaptive-learning event names and payload schemas
- local-first event buffering
- replay-safe dedupe
- cloud merge hooks
- offline extraction and feature generation
- shadow-mode evaluation

Storage contract:

- key: `trainer_adaptive_learning_v1`
- model: `adaptive_learning_store_v1`

## Evaluation Skeletons

Offline analysis:

```bash
npm run qa:adaptive-learning:analyze
npm run qa:adaptive-learning:analyze:fixture
```

Shadow evaluation:

```bash
npm run qa:adaptive-policy:shadow-eval
npm run qa:adaptive-policy:shadow-eval:fixture
```

Adaptive rollout gate:

```bash
npm run qa:adaptive-policy:launch-readiness
npm run qa:adaptive-policy:launch-readiness:fixture
```

Promotion bundle:

```bash
npm run qa:adaptive-policy:promote
npm run qa:adaptive-policy:promote:fixture
```

Bundle application and real staging evaluation:

```bash
npm run qa:adaptive-policy:apply-bundle -- --bundle artifacts/adaptive-policy-promotion --mode shadow
npm run qa:adaptive-policy:staging-eval
```

Outputs:

- `artifacts/adaptive-learning-analysis/*`
- `artifacts/adaptive-policy-shadow-evaluation/*`

These are the required gates before any adaptive decision point moves from shadow toward active.

## How A New Adaptive Policy Should Be Proposed

Use `buildAdaptivePolicyProposalTemplate(...)` as the starting structure.

A proposal should include:

1. decision point id and owner
2. bounded allowed actions
3. required context inputs
4. explicit safety exclusions
5. fallback default
6. evidence plan
7. shadow evaluation plan
8. required tests

Minimum required tests:

- out-of-bounds protection
- safety exclusion priority
- shadow-mode logging
- low-confidence fallback
- deterministic behavior when disabled
- cross-surface explanation consistency

## Promotion Path

Promotion should be:

1. `deterministic_only`
2. `shadow`
3. operator review of artifacts
4. cohort harm review
5. holdout review
6. limited `active` rollout

A decision point should not move to `active` until:

- row count is large enough
- holdout rows are large enough
- estimated benefit clears threshold
- potential harm stays below threshold
- average confidence is strong enough
- harmful cohorts are zero
- underpowered key cohorts are resolved or explicitly accepted

## Internal Diagnostics Rule

Adaptive diagnostics must not appear in consumer mode.

Even if `internalDiagnostics` is true, diagnostics should only render when:

- the caller passes a trusted local debug signal
- the surface is explicitly internal
- `personalization.settings.adaptiveLearning.internalDiagnostics` is true

Do not expose:

- raw policy ids
- confidence scores
- sample sizes
- shadow-only choices
- evaluation internals

unless the surface is intentionally internal and gated.

## Intentionally Unimplemented

This scaffold does not yet do the following by default:

- turn any adaptive lever on in production
- add a new consumer-facing adaptive settings surface
- promote analysis output automatically into live policy evidence
- create a dedicated server-side analytics warehouse
- let adaptive logic touch injury or medical guidance

## Follow-Up Backlog

- Expand the trusted-local diagnostics surface once real staging shadow data exists, so it can show rollout evidence instead of fixture-only readiness.
- Live-verify the new server-side ingestion and export path so adaptive events can eventually stop depending on client payload persistence.
- Add live staging adaptive rollout evidence to the launch dashboard once real shadow coverage exists.
