# Canonical Metrics And Baselines Spec

## Purpose

The planner must expose the key metrics it is using, show where they came from, and let the user override them without restarting intake.

Location:

- `Settings -> Plan Management -> Metrics / Baselines`

Primary implementation:

- `src/services/metrics-baselines-service.js`
- `src/modules-planning.js`
- `src/trainer-dashboard.jsx`

## Provenance States

Every metric card carries a plain-English provenance label.

- `Explicit user input`
- `Derived from intake`
- `Inferred from logs`
- `Low-confidence placeholder`

This is used both for trust and for planning urgency.

## Supported Metric Families

### Universal

- bodyweight
- environment and equipment reality

### Body composition

- waist proxy

### Strength

- current lift benchmark
- top set / working weight context

### Running

- recent running anchor
- long-run sizing anchor
- pace anchor when available

### Swimming

- recent swim anchor

### Power / vertical

- jump or power anchor

## Planner Consumption

`buildMetricsBaselinesModel(...)` produces the user-facing card model.

`buildPlanningBaselineInfluence(...)` summarizes the planning consequences of the current metrics state.

`applyPlanningBaselineInfluence(...)` feeds those consequences back into plan generation so missing or improved anchors can change:

- session dose
- easy / long-run sizing
- strength posture
- swim volume honesty
- jump-power dosing
- environment substitutions

## Save Contract

- Editing a baseline updates canonical personalization state.
- Baseline edits do not rewrite history.
- The UI explicitly states that a saved change can adapt the plan.

## Support-Tier Interaction

Baseline urgency depends on the support tier:

- Tier 1: missing anchors should be surfaced clearly because the planner can use them directly.
- Tier 2: anchors improve specificity, but the app stays more conservative.
- Tier 3: the app asks for only the minimum anchors needed to stay safe and useful.

## Verification

- `tests/metrics-baselines-service.test.js`
- `tests/support-tier-service.test.js`
- `e2e/mobile-surfaces.spec.js`
