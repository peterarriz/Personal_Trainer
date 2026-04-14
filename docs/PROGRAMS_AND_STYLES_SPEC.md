# Programs And Styles Spec

## Purpose

Programs and Styles are now part of the live planner, not just catalog metadata.

The system has one job:

- let a user activate a concrete Program or a lighter Style
- make the real week change in a visible, trustworthy way
- keep safety, equipment, schedule, and goal reality above template literalism

This spec documents the current live integration in the existing Personal_Trainer architecture.

## Live Integration Map

### Real entry points

- `src/trainer-dashboard.jsx`
  - persists `personalization.programs`
  - activates and clears Program and Style selections
  - passes program state into the real planner and Today logic
  - renders active basis, fidelity, adherence, and trust copy in Settings, Program, Today, and Coach surfaces
- `src/modules-planning.js`
  - `composeGoalNativePlan(...)` is the main week-shaping integration point
  - `buildPlanWeek(...)` carries planning basis into the runtime week
  - `buildCanonicalPlanDay(...)` carries basis into day-level explanation
  - `generateTodayPlan(...)` explains the live basis in plain English
- `src/modules-coach-engine.js`
  - `deterministicCoachPacket(...)` and `buildCoachBrief(...)` explain what the plan is based on and how closely the user is still following it
- `src/services/program-live-planning-service.js`
  - single source of truth for precedence, fidelity handling, compatibility response, live backbone generation, style overlays, and adherence/drift

### Reused support systems

- Goal stack and resolved goals:
  - `src/services/goal-resolution-service.js`
  - `src/services/goal-arbitration-service.js`
  - intake-derived goal state in existing `personalization`
- Catalog and source data:
  - `src/data/program-catalog.ts`
  - `src/data/style-catalog.ts`
  - `src/services/program-catalog-service.ts`
- Compatibility:
  - `src/services/program-compatibility-service.ts`
- Trust copy:
  - `src/services/program-explanation-service.ts`
  - existing provenance and trust helpers in `src/trainer-dashboard.jsx`

## Deterministic Precedence

The live planner now uses this precedence order from one place:

`PLANNING_PRECEDENCE_STACK` in `src/services/program-live-planning-service.js`

1. hard safety, injury, and contraindications
2. hard equipment constraints
3. hard schedule reality
4. active program hard rules
5. explicit goal stack
6. active program soft rules
7. active style biases
8. default house planning logic
9. low-importance preferences

### Hard Program rules

These are rules that can suspend or downgrade the template:

- minimum viable session count
- non-negotiable equipment requirements
- minimum baseline or experience floor
- key session structure that defines the program backbone

### Soft Program rules

These shape the week when they do not conflict with higher priorities:

- accessory emphasis
- preferred session ordering
- progression feel
- supportive conditioning or maintenance work

### Style influence boundaries

Styles may influence:

- exercise selection flavor
- accessory and conditioning emphasis
- session naming and weekly feel
- density, hypertrophy, or endurance bias

Styles may not:

- override safety
- override confirmed equipment or schedule reality
- replace the goal stack when goals exist
- silently turn an incompatible Program into something else

## Fidelity Model

The live planner supports three runtime fidelity modes.

### `strict`

- preserve the Program backbone as closely as possible
- only adapt for hard constraints or safety
- if strict becomes impossible because of drift or hard incompatibility, the system does not hide it

### `adapted`

- preserve intended outcome and weekly shape
- allow stronger changes for schedule, equipment, experience, and current baseline

### `style_only`

- do not run the full concrete template
- borrow directional influence from the Program
- keep the normal goal-driven planner in charge

### Fidelity status

The planner also exposes:

- `as_requested`
- `downgraded_for_constraints`
- `downgraded_for_drift`
- `suspended`

These show up in runtime explanation objects and UI summaries.

## Live Week Generation

`deriveLiveProgramPlanningBasis(...)` is responsible for turning a Program or Style selection into real week-shaping behavior.

### Program backbones currently shape

- session count expectations
- session type mix
- key-session preservation
- architecture override for the week
- exercise selection for structured strength sessions
- cardio versus strength balance

### Examples of live changes

- `Half Marathon Base`
  - drives a run-heavy week with easy, quality, and long-run structure
- `Powerbuilding Builder`
  - drives separate lower/upper strength and hypertrophy sessions
- `Hotel Gym Travel Build`
  - swaps the week toward compact travel-appropriate strength and conditioning

### Style overlays currently shape

- `Fight-Camp Lean`
  - changes conditioning naming and biases strength toward shorter density work
- `Golden-Era Hypertrophy`
  - pushes shape-work and higher-rep hypertrophy feel
- `Marathoner Bias`
  - keeps strength supportive and increases aerobic emphasis

## Today Surface Integration

Today now explains the real planning basis in plain English.

The Today view can show:

- whether the session is Program-led, Style-influenced, goal-driven, or fallback logic
- whether the active mode is strict, adapted, or style-led
- what was personalized
- what compromise was made because of current constraints

This comes from `planningBasis.todayLine`, `planningBasis.compromiseLine`, and `planningBasis.planBasisExplanation`.

The Today surface should stay concise:

- one basis line by default
- one change/tradeoff line if needed
- deeper detail only inside the optional rationale disclosure

## Program Surface Integration

Program is now the read-oriented weekly view, not the management surface.

Program should show:

- current week summary
- current week sessions
- near-term future weeks
- whether the week is adjusted or normal

Program should not be the default place to:

- browse Programs or Styles
- activate or clear Programs or Styles
- refine or reprioritize goals

Those controls now live in `Settings > Plan Management`.

## Coach Integration

Coach now receives the live planning basis through `deterministicCoachPacket(...)`.

Coach can explain:

- what the current week is based on
- whether a Program backbone is active
- whether a Style is only shaping the feel
- how closely the user is still following the selected Program
- what changed because of equipment, schedule, or recovery reality

Coach is not allowed to pretend:

- a weakly sourced inspiration is an exact routine
- strict fidelity still applies after material drift
- the current week is literal when the planner has already suspended the template

Coach should explain the active basis when asked, but advanced setup does not belong in the main Coach conversation surface.

## Adherence And Drift

`deriveProgramAdherenceState(...)` tracks whether the user is still meaningfully following the selected Program.

### Inputs

- committed plan week records
- prescribed day history
- completed workout logs

### Outputs

- `forming`
- `aligned`
- `drifting`
- `off_program`

### Current behavior

- strict mode can downgrade to adapted when execution drifts too far from the backbone
- the app keeps key-session misses and modified completion in the explanation layer
- adherence summaries appear in Program and Coach surfaces

Strict mode therefore means something operationally, not just cosmetically.

## Goal-Optional Behavior

Programs and Styles work without explicit goals.

### Program only

- the Program becomes the live backbone if compatibility is good enough
- no fake goal inference is required

### Style only

- the normal house planner still leads
- the Style changes the feel of the week

### Missing profile data

- the planner keeps moving when possible
- incompatibility is surfaced honestly
- hard blocks only happen when the template would be unsafe or nonsensical

## Midstream Switching And Conflicts

Current deterministic behavior:

- switching Programs mid-week:
  - the next recompute immediately re-bases the live week on the new Program
- adding a goal while a Program is active:
  - goals enter at precedence level 5 and can reshape soft parts of the week
- removing a goal while a Style is active:
  - the week falls back to default logic plus the active Style
- activating an incompatible Style with a Program:
  - the Program stays active, and the incompatible Style is treated as non-applied
- losing equipment access:
  - strict mode may downgrade or suspend based on compatibility rules
- travel while on a strict Program:
  - strict can visibly downgrade; the app does not hide the shift
- advanced template selected by a novice:
  - compatibility can block or suspend literal execution

## Runtime Explanation Contract

Every active Program or Style should expose:

- basis summary
- personalization summary
- source basis label
- source confidence label
- requested fidelity
- effective fidelity
- fidelity status
- caveats
- adherence summary

The live explanation object is attached at:

- `planComposer.planningBasis.planBasisExplanation`
- `planWeek.planningBasis`
- day-level week context for Today

## Tests

Focused tests cover:

- precedence ordering
- goal-optional Program activation
- strict Program week shaping
- style-driven week shaping
- Today explanation basis
- strict drift downgrade
- schedule-driven suspension
- style-only Program behavior
- midstream Program switching

See:

- `tests/program-live-planning-service.test.js`
- `tests/program-compatibility-service.test.js`
- `tests/program-explanation-service.test.js`
- `tests/style-overlay-service.test.js`

## What Is Still Deferred

These items are intentionally not treated as complete:

- deeper planner progression logic tied to long-term Program phases
- automatic acknowledgement UI for strict-to-adapted downgrades
- richer adherence measurement from exercise-level substitutions
- analytics instrumentation
- content authoring workflow beyond typed seed data

## Manual Smoke Checklist

1. Activate `Half Marathon Base` in adapted mode for a 4-day user and confirm the week becomes run-led with a visible long run.
2. Activate `Powerbuilding Builder` in strict mode for a gym-equipped 4-day user and confirm the week becomes lift-led with separate lower and upper emphases.
3. Activate `Fight-Camp Lean` without a Program and confirm the week keeps goal-driven structure but shifts conditioning and density language.
4. Drop available days or equipment so a strict Program no longer fits and confirm the UI shows the visible downgrade or suspension explanation.
5. Open Today and Coach after each change and confirm both explain the active basis in plain English.
6. Open Program and confirm the week view changes, but the activation controls stay in Settings rather than Program.

## 2026-04-13 Hardening Notes

- Program remains a read-first surface.
- Program activation, style changes, goal changes, and baseline repair live in Settings → Plan Management.
- Program should deep-link missing metrics into Metrics / Baselines instead of duplicating management controls inline.
