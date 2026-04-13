# ProgramBlock Model

`ProgramBlock` is the canonical higher-order planning entity that frames several weeks without creating a separate planner beside the existing system.

Hierarchy:

`UserProfile -> Goals -> ProgramBlock -> WeeklyIntent -> PlanWeek -> PlanDay -> prescriptions -> actuals`

## Purpose

`ProgramBlock` answers the question, "What are these next several weeks fundamentally trying to do, and what tradeoffs are we accepting while we do it?"

It is the phase-level planning contract that:

- turns goal mix plus current planning posture into one deterministic block model
- feeds `WeeklyIntent` instead of making weekly purpose emerge from scattered helpers
- gives Program and Today a trustworthy description of the current block
- preserves one planning stack instead of adding a separate hybrid-planning system

## Canonical Shape

```js
{
  version: 1,
  id: "program_block_BUILDING_3_4_race_prep_dominant",
  label: "BUILDING - Run-dominant + strength-maintenance",
  architecture: "race_prep_dominant",
  phase: "BUILDING",
  window: {
    startWeek: 3,
    endWeek: 4,
    weekIndexInBlock: 2,
    totalWeeks: 2,
    weeksRemaining: 0
  },
  dominantEmphasis: {
    category: "running",
    label: "Sub-1:50 half marathon",
    objective: "Run quality and endurance progression get first claim on fatigue and recovery this block.",
    role: "dominant"
  },
  secondaryEmphasis: {
    category: "strength",
    label: "Keep two strength touches",
    objective: "Strength stays in maintenance range so it supports running instead of competing with it.",
    role: "secondary"
  },
  recoveryPosture: {
    level: "balanced",
    summary: "Recovery is biased toward protecting the key run sessions and long-run quality."
  },
  nutritionPosture: {
    mode: "performance_support",
    summary: "Fuel key run sessions, protect tendon recovery, and replenish enough to keep quality work credible."
  },
  successCriteria: [
    "Land the key run sessions for the block without stacking recovery debt.",
    "Keep 1-2 strength touches in maintenance range.",
    "Arrive at the next phase with run durability intact."
  ],
  constraints: [
    "Running kept supportive/maintenance until running priority or race proximity increases."
  ],
  tradeoffs: [
    "Strength volume stays capped while running receives the cleanest recovery windows."
  ],
  goalAllocation: {
    prioritized: "Sub-1:50 half marathon",
    maintained: ["Keep two strength touches"],
    minimized: "non-primary volume"
  },
  drivers: ["Sub-1:50 half marathon", "Keep two strength touches", "BUILDING"],
  summary: "Run quality and endurance progression get first claim on fatigue and recovery this block. Strength stays in maintenance range so it supports running instead of competing with it."
}
```

## Required Fields

Every canonical `ProgramBlock` should express:

- dominant training emphasis
- secondary emphasis
- recovery posture
- nutrition posture
- success criteria
- constraints
- tradeoffs
- block window across several weeks

## Hybrid Planning Modes

The model is designed to support hybrid planning through one hierarchy:

- `run-dominant + strength-maintenance`
- `body-comp + strength-retention`
- `strength-dominant + conditioning-maintenance`
- `balanced hybrid rebuild`

The block does not create a new planner for each mode. Instead:

1. goals and current planning context choose one deterministic architecture
2. that architecture produces one `ProgramBlock`
3. `WeeklyIntent` specializes the block for the current week
4. `PlanWeek` and `PlanDay` inherit that same block context

## Compatibility

`blockIntent` still exists as a compatibility view for older consumers, but it is now derived from `ProgramBlock` rather than acting as an independent planning model.

Compatibility shape:

```js
{
  prioritized,
  maintained,
  minimized,
  narrative
}
```

This should be treated as transitional. New planning work should prefer `programBlock`.

## Current Flow

- `composeGoalNativePlan(...)` produces the current `ProgramBlock`, plus a compatibility `blockIntent`
- `buildPlanWeek(...)` carries `programBlock` and derives `WeeklyIntent` from it
- `buildCanonicalPlanDay(...)` stores `programBlock` under `planDay.week`
- Program and Today read `programBlock` directly for block explanation and trust

## Domain Adapter Influence

`ProgramBlock` is now downstream of the selected domain adapter.

That means:

- running goals and swim goals can share the same hierarchy while producing different block semantics
- power / vertical goals can remain in the same planner while receiving a different weekly shape
- fallback domains can still produce a safe `ProgramBlock` without pretending niche expertise

## Program And Style Interaction

- Program selection can change the block backbone and week skeleton.
- Style selection can bias the block feel and session flavor.
- Neither Program nor Style replaces the goal stack.

## Near-Term Follow-Up

- Let `WeeklyIntent` carry richer explicit child links to block-level success criteria instead of only inheriting summary text
- Persist historical `PlanWeek` records if archive-era weekly review needs durable week snapshots
- Expand future-week surfaces to describe `ProgramBlock.window` more directly, not only phase transitions

## 2026-04-13 Hardening Notes

- Program reading surfaces now need to stay aligned with the canonical `PlanDay.resolved.training` contract used by Today and Log.
- Missing metrics are now treated as a plan-management trust issue and deep-link into Metrics / Baselines from Program.
- User-facing copy should avoid internal phrases like `top-up` when describing optional extra work.
