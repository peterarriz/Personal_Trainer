# Hybrid Adaptive Vertical Slice

This is the first bounded adaptive prescription slice in FORMA.

It only applies to users with a meaningful running lane plus a meaningful strength or physique lane. The goal is to prove adaptive value in the highest-friction mixed-demand cohort before widening the surface area.

## Why Hybrid First

Hybrid users are where small planning tradeoffs matter fast:

- too many hard days can collapse adherence
- lower-body lifting can blunt key run quality
- split sessions can become too complex for busy schedules
- mixed sessions can either simplify the week or create too much fatigue
- deload timing matters more when both run and lift peaks are present

The slice stays intentionally narrow so we can observe those tradeoffs without turning the planner into a black box.

## Scope Definition

A user enters this slice when the goal stack and current plan reflect both:

- a meaningful running lane
- a meaningful strength or physique lane

In practice this includes:

- classic run-plus-strength hybrids
- run-plus-physique hybrids
- body-composition users whose plan still preserves real running work

Non-hybrid users keep the existing deterministic behavior.

## Hybrid Cohorts

The current reporting groups hybrid rows into one dominant cohort:

- `beginner_hybrid`
- `fat_loss_hybrid`
- `performance_hybrid`
- `travel_heavy_hybrid`
- `inconsistent_schedule_hybrid`

These are meant for operator review, not direct user display.

## Decision Points

This slice currently uses three bounded decision points:

1. `hybrid_session_format_choice`
   Safe actions:
   - `keep_current_structure`
   - `favor_mixed_sessions`
   - `favor_short_split_sessions`

2. `hybrid_run_lift_balance_template`
   Safe actions:
   - `balanced_hybrid`
   - `run_supportive_hybrid`
   - `strength_supportive_hybrid`

3. `hybrid_deload_timing_window`
   Safe actions:
   - `keep_current_window`
   - `pull_forward_hybrid_deload`

The planner still owns the week. The adaptive layer only reranks among those approved variants.

## Context Features

The hybrid slice records and scores against hybrid-specific context such as:

- `hybridCohort`
- `hybridHardDayBand`
- `hybridMixedSessionBand`
- `hybridRunBuildPhase`
- `hybridRecoveryRisk`
- `hybridLowerBodyGuardNeeded`

Those fields are logged into adaptive-learning recommendation events and adaptive-policy shadow traces so later offline analysis can explain what the policy saw.

## Outcome Labels

The current offline analysis produces hybrid-specific outcome labels such as:

- `hybrid_consistency_preserved`
- `hybrid_mixed_session_success`
- `hybrid_split_session_success`
- `hybrid_early_deload_success`
- `hybrid_overload_failure`
- `hybrid_lower_body_run_conflict`
- `hybrid_schedule_overflow_failure`

These are operator-facing labels for report clustering, not direct user copy.

## User-Facing Explanation Standard

When a hybrid-aware adaptive choice is active, the user sees a short coaching-style explanation, for example:

- shorter separate blocks on busy hybrid weeks
- lighter lower-body loading around key run days
- an easier week arriving sooner so both peaks do not stack together

The UI does not expose policy ids, score traces, confidence numbers, or raw internal fields.

## Shadow Reporting

Run the existing shadow evaluator to review the hybrid slice:

```bash
node -r sucrase/register scripts/run-adaptive-policy-shadow-evaluation.js --fixture --use-fixture-policy
```

The runner now writes hybrid-specific artifacts alongside the main report:

- `artifacts/adaptive-policy-shadow-evaluation/hybrid-decision-point-summaries.json`
- `artifacts/adaptive-policy-shadow-evaluation/hybrid-cohort-summaries.json`
- `artifacts/adaptive-policy-shadow-evaluation/hybrid-outcome-label-summaries.json`

The markdown report also includes a dedicated `Hybrid Vertical Slice` section.

## What Stays Out Of Scope

This slice does not:

- generate arbitrary workouts
- change injury or medical guidance
- rewrite the whole week structure freely
- generalize adaptive behavior to non-hybrid users yet
- bypass the deterministic planner

## Recommended Next Steps

1. Keep all three hybrid decision points in `shadow` until real-history coverage is broader.
2. Review the hybrid cohort tables first, especially `performance_hybrid` and `inconsistent_schedule_hybrid`.
3. Promote one decision point at a time.
4. Only expand beyond hybrid after the slice shows clear benefit without harmful cohorts.
