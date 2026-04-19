# Adaptive Policy Promotion Workflow

## Purpose

This workflow turns adaptive analysis and shadow evaluation outputs into a reviewable promotion bundle, then lets an operator apply that bundle into the canonical config path without manual file copying.

Primary implementation:

- `src/services/adaptive-policy-operator-service.js`
- `src/services/adaptive-policy-config-service.js`
- `scripts/run-adaptive-policy-promotion.js`
- `scripts/run-adaptive-policy-apply-bundle.js`
- `scripts/run-adaptive-policy-launch-readiness.js`

## Commands

Generate a promotion bundle from the current artifact directories:

```bash
npm run qa:adaptive-policy:promote
```

Apply the generated bundle into the operator-managed config path:

```bash
npm run qa:adaptive-policy:apply-bundle -- --bundle artifacts/adaptive-policy-promotion --mode shadow
```

Run the launch-readiness gate against current shadow-eval artifacts:

```bash
npm run qa:adaptive-policy:launch-readiness
```

Fixture smoke:

```bash
npm run qa:adaptive-policy:promote:fixture
npm run qa:adaptive-policy:launch-readiness:fixture
```

Promote specific decision points only:

```bash
npm run qa:adaptive-policy:promote -- --decision-point travel_substitution_set --decision-point hybrid_session_format_choice
```

Include medium-confidence analysis rules in the candidate bundle:

```bash
npm run qa:adaptive-policy:promote -- --include-medium-confidence
```

## Promotion Rules

A decision point is promotable only when both of these are true:

1. The shadow evaluator marks it `eligible_for_active_rollout`.
2. The offline analysis still has a matching reviewed rule candidate for that same decision point.

If either is missing, the bundle blocks that decision point and records the reason.

## Output Artifacts

Promotion bundle:

- `artifacts/adaptive-policy-promotion/promotion-results.json`
- `artifacts/adaptive-policy-promotion/adaptive-policy-evidence.json`
- `artifacts/adaptive-policy-promotion/adaptive-learning-config.shadow.json`
- `artifacts/adaptive-policy-promotion/adaptive-learning-config.active.json`
- `artifacts/adaptive-policy-promotion/promotion-report.md`

Launch-readiness gate:

- `artifacts/adaptive-launch-readiness/results.json`
- `artifacts/adaptive-launch-readiness/launch-readiness-report.md`

Applied operator config path:

- `config/adaptive-learning/adaptive-policy-evidence.json`
- `config/adaptive-learning/adaptive-learning-config.shadow.json`
- `config/adaptive-learning/adaptive-learning-config.active.json`
- `config/adaptive-learning/adaptive-learning-config.applied.json`
- `config/adaptive-learning/applied-bundle-manifest.json`
- `config/adaptive-learning/applied-bundle-report.md`

## Safe Rollout Path

Recommended path:

1. Keep the app in deterministic mode by default.
2. Turn on trusted-local diagnostics only when debugging.
3. Run offline analysis.
4. Run shadow evaluation.
5. Run adaptive launch readiness.
6. Generate a promotion bundle.
7. Review harmful cohorts and blocked reasons.
8. If a point is still eligible, apply the bundle into the canonical config path in `shadow` mode first.
9. Run the real staging evaluation workflow against exported data.
10. Only after another review pass should an operator consider re-applying that same bundle in `active` mode.

## What This Does Not Do

- It does not auto-apply evidence to production.
- It does not skip harmful-cohort checks.
- It does not turn on adaptive mode in the consumer app.
- It does not bypass the trusted-local diagnostics gate.
