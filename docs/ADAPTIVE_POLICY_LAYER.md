# Adaptive Policy Layer

## Purpose

The adaptive policy layer is a bounded reranker, not an autonomous planner.

FORMA still builds plans with the deterministic planner in `src/modules-planning.js`.
The adaptive layer may only rerank a small set of pre-approved safe options at specific decision points.
If evidence is weak, safety exclusions are active, or the layer is disabled, FORMA keeps the deterministic default.

## Modes

- `deterministic_only`
  The planner ignores adaptive evidence and keeps the deterministic default everywhere.
- `shadow`
  The planner scores adaptive options and records traces, but still keeps the deterministic default.
- `active`
  The planner may choose a higher-ranked safe option when confidence and safety thresholds are met.

## Decision Points

### 1. `progression_aggressiveness_band`

Allowed actions:
- `default_band`
- `conservative_band`
- `progressive_band`

What it can change:
- weekly aggression posture
- recovery bias
- volume bias
- performance bias

What it cannot change:
- plan archetype
- domain adapter
- injury or medical guidance
- out-of-bounds week structures

### 2. `deload_timing_window`

Allowed actions:
- `keep_current_window`
- `pull_forward_deload`

What it can change:
- current-week recovery posture
- current-week volume bias

What it cannot change:
- remove an existing safety-driven cutback
- postpone a cutback when safety rails are active

### 3. `time_crunched_session_format_choice`

Allowed actions:
- `default_structure`
- `stacked_mixed_sessions`
- `short_separate_sessions`

What it can change:
- how existing safe sessions are packaged for low-bandwidth weeks

What it cannot change:
- invent new session families
- exceed the allowed session menu for the current plan

### 4. `travel_substitution_set`

Allowed actions:
- `default_substitutions`
- `hotel_gym_substitutions`
- `outdoor_endurance_substitutions`
- `minimal_equipment_substitutions`

What it can change:
- which pre-approved travel or environment substitutions are used

What it cannot change:
- generate arbitrary workouts
- override safety exclusions

### 5. `hybrid_run_lift_balance_template`

Allowed actions:
- `balanced_hybrid`
- `run_supportive_hybrid`
- `strength_supportive_hybrid`

What it can change:
- the emphasis inside the existing hybrid template

What it cannot change:
- convert a non-hybrid plan into a hybrid one
- erase required strength or endurance support lanes

## Safety Rails

Safety always wins.

Examples:
- `progressive_band` is excluded during re-entry, chaotic weeks, cutbacks, or protective recovery states.
- `pull_forward_deload` is excluded if the week is already in a protective or reduced state.
- hybrid balance actions are excluded unless the plan is truly hybrid and both run and strength lanes are active.
- travel substitution actions are excluded unless the environment actually supports them.

The planner also still runs existing contract enforcement after adaptive template decisions:
- plan archetype contract enforcement
- schedule reality limiting
- strength-first run-lane protection
- dynamic adaptation

## Evidence Format

The scorer expects a reviewed evidence snapshot. The recommended path is:

1. Run the offline adaptive-learning analysis pipeline.
2. Review the candidate rules.
3. Promote only approved rules into an evidence snapshot.
4. Feed that snapshot into the planner config.

Minimal rule shape:

```js
{
  decisionPointId: "progression_aggressiveness_band",
  actionId: "conservative_band",
  confidenceScore: 88,
  effectSize: 0.16,
  sampleSize: 14,
  summary: "Controlled progression improved adherence for this cohort.",
  matchers: {
    primaryGoalCategories: ["running"],
    scheduleReliabilities: ["variable"]
  }
}
```

## Config

Planner entrypoints accept:

- `adaptivePolicyConfig`
- `adaptivePolicyEvidence`

They can also be provided through personalization settings:

```js
personalization.settings.adaptivePolicy = {
  mode: "shadow",
  thresholds: {
    minConfidenceScore: 65,
    minScoreLift: 0.035,
    minSampleSize: 6
  },
  decisionPoints: {
    progression_aggressiveness_band: true,
    deload_timing_window: true
  },
  evidenceSnapshot: { version: 1, rules: [] }
}
```

## Trace Output

The planner records candidate scoring and resolution traces in:

- `composeGoalNativePlan(...).adaptivePolicyTraces`
- `composeGoalNativePlan(...).programContext.adaptivePolicyTraces`
- `buildPlanWeek(...).adaptivePolicyTraces`
- `buildPlanWeek(...).adaptivePolicySummary`

Each trace includes:

- decision point id
- mode
- default action
- chosen action
- shadow top action when relevant
- fallback reason
- candidate scores
- matched rule ids
- matched evidence summaries
- a human-readable explanation

## Current Scope

This layer does not:

- generate freeform workouts
- rewrite full weekly structures
- change injury or medical guidance
- bypass existing deterministic safety rules

It is intentionally narrow so every adaptive choice is inspectable, explainable, and easy to turn off.
