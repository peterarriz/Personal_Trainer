# Adaptive Policy Shadow Evaluation

This layer lets FORMA score adaptive policy choices without changing what the user sees.

The deterministic planner stays in control. Shadow mode only records:

- the deterministic baseline action
- the adaptive top choice
- candidate scores
- confidence and sample size
- the explanation for why the adaptive layer leaned that way

Then the offline evaluator compares those logged shadow choices against actual historical outcomes and optional replayed policies.

## What Shadow Mode Does

Shadow mode keeps the live prescription deterministic while still logging:

- `baselineActionId`
- `shadowTopActionId`
- `candidateScores`
- `fallbackReason`
- `contextSnapshot`
- `explanation`

This gives us a safe record of what the adaptive layer would have done before we ever let it affect a user.

## Evaluation Modes

The evaluator supports two modes:

1. Logged shadow evaluation
   Uses the `adaptivePolicyShadow` payload already recorded on recommendation events.

2. Replay candidate policy evaluation
   Re-scores the logged decision contexts with a supplied adaptive policy config and evidence snapshot, then compares the replayed choice to the deterministic baseline and the actual observed outcomes.

## How To Run

Fixture smoke with logged shadow output:

```bash
npm run qa:adaptive-policy:shadow-eval:fixture
```

Fixture replay with the bundled reviewed policy snapshot:

```bash
node -r sucrase/register scripts/run-adaptive-policy-shadow-evaluation.js --fixture --use-fixture-policy
```

Run against exported event JSON:

```bash
npm run qa:adaptive-policy:shadow-eval -- --input path/to/export-or-directory
```

Generate the adaptive rollout gate from the latest shadow evaluation:

```bash
npm run qa:adaptive-policy:launch-readiness
```

Generate a reviewed promotion bundle from offline analysis plus shadow artifacts:

```bash
npm run qa:adaptive-policy:promote
```

Run replay mode against exported data plus a candidate policy:

```bash
npm run qa:adaptive-policy:shadow-eval -- --input path/to/export-or-directory --config path/to/adaptive-policy-config.json --evidence path/to/adaptive-policy-evidence.json
```

Useful flags:

```bash
--output artifacts/adaptive-policy-shadow-evaluation/custom-run
--label april_shadow_review
--holdout-percentage 20
--min-cohort-sample-size 5
--min-rows 20
--min-holdout-rows 8
```

## Artifacts

The runner writes:

- `artifacts/adaptive-policy-shadow-evaluation/results.json`
- `artifacts/adaptive-policy-shadow-evaluation/decision-rows.json`
- `artifacts/adaptive-policy-shadow-evaluation/decision-point-summaries.json`
- `artifacts/adaptive-policy-shadow-evaluation/cohort-summaries.json`
- `artifacts/adaptive-policy-shadow-evaluation/hybrid-decision-point-summaries.json`
- `artifacts/adaptive-policy-shadow-evaluation/hybrid-cohort-summaries.json`
- `artifacts/adaptive-policy-shadow-evaluation/hybrid-outcome-label-summaries.json`
- `artifacts/adaptive-policy-shadow-evaluation/harmful-cohorts.json`
- `artifacts/adaptive-policy-shadow-evaluation/underpowered-cohorts.json`
- `artifacts/adaptive-policy-shadow-evaluation/confidence-band-summaries.json`
- `artifacts/adaptive-policy-shadow-evaluation/promotion-checklist.json`
- `artifacts/adaptive-policy-shadow-evaluation/shadow-evaluation-report.md`

## Metrics Included

The report focuses on operator-readable safety signals:

- action agreement rate
- divergence rate
- average confidence
- estimated benefit
- potential harm
- uncertainty
- actual composite success
- actual pain rate
- actual frustration rate

Breakdowns are shown by:

- decision point
- cohort
- hybrid decision point
- hybrid cohort
- hybrid outcome label
- confidence band
- harmful cohort list
- underpowered cohort list

## Promotion Checklist

A decision point should stay in shadow unless all of these pass:

1. Enough rows were observed.
2. Holdout coverage is large enough.
3. Estimated benefit clears the minimum threshold.
4. Potential harm stays below the maximum threshold.
5. Average confidence is high enough.
6. Divergence rate stays bounded.
7. No harmful cohorts are flagged.
8. No key cohorts are still underpowered.

If any of those fail, the decision point stays in shadow.

## Recommended Rollout Workflow

1. Keep the new decision point in `shadow`.
2. Let it collect real recommendation and outcome history.
3. Run the shadow evaluator on the exported event set.
4. Run the adaptive launch-readiness gate.
5. Review the harmful and underpowered cohort lists first.
6. Review the promotion checklist for the specific decision point.
7. Generate a promotion bundle only for points that stay eligible.
8. Only move that point to `active` if the checklist is green and the operator agrees with the explanation quality.

## Notes

- This is a safety gate, not a personalization engine.
- The evaluator is associative, not causal.
- Small or low-confidence cohorts are intentionally blocked from promotion.
- If the data is missing or malformed, the evaluator drops those rows instead of crashing the whole run.
