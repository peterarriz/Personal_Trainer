# FORMA Intake Stage 2 Redesign

## Goal

Redesign intake Stage 2 so required planning details live on one structured screen with:

- inline validation
- inline save
- one clear continue/build CTA
- no dependence on free text for required planning fields
- explicit numeric lift target support
- clearer goal locking
- inline fill for missing lift baselines

This proposal is grounded in the current intake code:

- `src/trainer-dashboard.jsx`
- `src/services/intake-completeness-service.js`
- `src/services/intake-entry-service.js`
- `src/services/intake-anchor-collection-service.js`
- `tests/intake-completeness-service.test.js`

## Current Problems

The repo already has good structured validation for many required anchors, but the Stage 2 UX still behaves like a progressive clarify flow instead of a single planning form.

Current issues:

- Required data is split between starter metric cards, completeness prompts, and machine anchor cards.
- Stage 2 still supports a `Structured / Free text` toggle for fields that should be deterministic.
- The UI can block with `Go to the next detail`, which makes required planning data feel hidden and brittle.
- Numeric strength baselines already exist in validation, but the user experience still exposes some strength inputs as free text like `185 x 5 or 225 single`.
- Goal edits and goal confirmation are not visually separated from required planning details, so users do not know what is already locked versus what still needs input.

## New IA

Stage contract stays three steps, but Stage 2 changes meaning:

1. `Setup`
2. `Planning details`
3. `Build`

Stage 2 becomes one structured screen with five zones.

### 1. Locked Goal Summary Rail

Purpose:

- show exactly what the plan is being built for
- make goal changes explicit instead of implicit
- prevent silent reinterpretation while the user is filling anchors

Contents:

- primary goal card
- secondary goal cards
- goal family chip
- explicit benchmark chip when present
- target timeline chip when already known
- `Edit goals` secondary action that sends the user back to Stage 1

Rules:

- goals are locked for Stage 2 by default
- the user can still edit them, but only through the explicit `Edit goals` action
- Stage 2 never silently reparses a required field as a goal change

### 2. Required Planning Details

Purpose:

- hold every required field for week-one planning on one screen
- remove dependence on one-question-at-a-time flow

Layout:

- grouped cards by planning lane
- all required fields visible at once
- missing fields marked inline
- valid fields saved inline

Suggested sections:

- `Performance target`
- `Current baseline`
- `Deadline / timing`
- `Body-composition anchor`
- `Custom goal translation` when needed

### 3. Missing Baselines Panel

Purpose:

- surface required missing baselines without making the user chase them
- especially fix the current lift-baseline gap

Behavior:

- if an explicit lift goal exists and the current lift baseline is missing, show a dedicated inline panel:
  - `We have the lift target. We still need your current baseline to size the first block honestly.`
- if a running goal exists and timing or running baseline is missing, show those same fields in the main form, not as a next-step question
- panel disappears once the required field validates and saves

### 4. Optional Context

Purpose:

- preserve flexibility without making required planning depend on text entry

Allowed here:

- custom notes
- travel or schedule nuance
- coaching preference nuance
- context for unusual equipment or event constraints

Not allowed here:

- required lift baseline
- required running baseline
- required target deadline
- required appearance proxy anchor

### 5. Sticky Footer

Purpose:

- one clear completion path
- no `Go to the next detail`

Contents:

- autosave state
- required-field completion summary
- single primary CTA

CTA behavior:

- if all required fields are valid: `Build my plan`
- if required fields remain: disabled CTA with missing count, for example `Add 2 required details`

## Field Contract

Stage 2 should render a structured field set derived from resolved goals plus current answers.

### Global Display Rules

- show all required fields at once
- show optional fields collapsed below required sections
- never require free text for a required field if a structured alternative exists
- allow free text only for optional context or unresolved custom-goal description

### Strength / Lift Goals

Applies when:

- strength goal family is primary or maintained
- explicit lift benchmark appears in the resolved goal, such as `bench 225`

Required fields:

- `lift_focus`
  - choice
  - values: `bench`, `squat`, `deadlift`, `ohp`, `pull_up`
  - required when the goal implies a specific lift but the parser did not lock it cleanly
- `target_lift_weight`
  - number
  - unit: `lb`
  - required when the goal is an explicit numeric lift target or when the user chooses a lift benchmark mode for a custom goal
- `target_lift_reps`
  - integer
  - optional default `1`
  - required only if the user chooses a rep-based target mode
- `current_strength_baseline_weight`
  - number
  - unit: `lb`
  - required for explicit lift targets
- `current_strength_baseline_reps`
  - integer
  - optional, but shown inline beside current baseline weight
- `target_timeline`
  - text or structured date/month input
  - optional unless the planner already requires timing for the goal

Inline fill behavior:

- if the goal contains an explicit target like `225 bench` but the current baseline is missing, Stage 2 shows the target prefilled and highlights only the missing baseline fields
- if the current baseline exists but the target is ambiguous, Stage 2 asks for the missing target weight explicitly

### Running / Race Goals

Required fields:

- `target_timeline`
- `current_run_frequency`
- either `longest_recent_run` or `recent_pace_baseline`

Optional fields:

- both longest run and recent pace if the user has both

### Body-Composition / Fat-Loss Goals

Required fields:

- `current_bodyweight`
- `target_weight_change` when the goal is numeric

Conditionally required:

- `target_timeline` when the goal carries a deadline

Optional but visible:

- `current_waist`

### Visible Abs / Six-Pack / Body-Fat-Under-X Goals

These are not first-class direct verifiers and should not pretend to be.

Required fields:

- `current_bodyweight`
- `current_waist`

Conditionally required:

- `target_timeline` if the user gave a deadline

Display copy:

- `This goal is tracked through repeatable bodyweight and waist proxies, not a guaranteed visual outcome.`

### Swim Goals

Required fields:

- `recent_swim_anchor`
- `swim_access_reality`

### Re-entry / General Fitness

Required fields:

- `starting_capacity_anchor`

### Hybrid Goals

Required fields depend on the primary lane, but Stage 2 should show them in one combined form:

- `hybrid_priority`
- strength baseline if a lift benchmark is explicit
- running baseline and timing if a race benchmark is explicit
- bodyweight anchor if fat loss is explicit

## Validation Rules

Validation should reuse the current `validateIntakeCompletenessAnswer()` rules wherever possible, but Stage 2 needs a single-screen contract.

### General Rules

- validate each field inline on blur and on CTA attempt
- save valid field groups immediately
- preserve invalid draft text locally without marking the answer as saved
- never advance to a new pseudo-step inside Stage 2

### Strength Rules

- `target_lift_weight`
  - must be a finite number greater than `0`
  - suggested max guardrail: `2000`
- `target_lift_reps`
  - whole number greater than `0`
  - default to `1` if omitted for explicit benchmark goals
- `current_strength_baseline_weight`
  - must be a finite number greater than `0`
- `current_strength_baseline_reps`
  - blank allowed
  - if present, must be a whole number greater than `0`
- if `target_lift_weight` is present and `current_strength_baseline_weight` is missing:
  - Stage 2 remains incomplete
  - inline error: `Enter a recent baseline for this lift so the first block can be sized honestly.`

### Running Rules

- `target_timeline`
  - must resolve to a valid date, month, or rough window already supported by the timeline parser
- `current_run_frequency`
  - finite number greater than `0`
- at least one of:
  - parsable `longest_recent_run`
  - parsable `recent_pace_baseline`

### Body-Comp Rules

- `current_bodyweight`
  - finite number greater than `0`
- `target_weight_change`
  - finite number, direction normalized by goal
- `current_waist`
  - finite number greater than `0` when required for appearance-proxy goals

### Custom Goal Rules

Custom goals remain flexible, but Stage 2 must not depend on fragile text for required planning details.

If the custom goal is not confidently mapped, require:

- `custom_goal_family`
  - choice: `endurance`, `strength`, `physique`, `hybrid`, `general_fitness`, `re_entry`
- `custom_goal_mode`
  - choice based on family, for example `race`, `lift benchmark`, `fat loss`, `general performance`

After that selection, render the same structured anchors used by the mapped family.

Free text for custom goals remains:

- optional summary
- optional context notes

## Goal Locking

Stage 2 should make locking explicit.

Rules:

- once the user enters Stage 2, the resolved goal stack is treated as the planning contract
- required fields fill in the planning contract
- they do not rewrite the contract
- if the user wants to change the contract, they use `Edit goals`

Visible states:

- `Locked for planning`
- `Needs one more anchor`
- `Ready to build`

Examples:

- `Bench press 225 - locked for planning`
- `Half marathon in 1:45 - locked for planning`
- `Visible abs - tracked by bodyweight + waist proxy`

## Inline Save Model

Use the existing local-first intake persistence model.

Behavior:

- every valid field group writes into `answers`
- the existing intake session snapshot continues to persist to `INTAKE_SESSION_STORAGE_KEY`
- while onboarding is incomplete, inline saves stay local-first
- Stage 2 shows field-level save state:
  - `Saved`
  - `Needs attention`
  - `Not saved yet`

Required-field groups should save as groups, not isolated fragments:

- running baseline group
- strength baseline group
- appearance proxy group
- timing group

## Implementation Plan

This is the smallest safe implementation path that fits the current repo.

### 1. Replace progressive Stage 2 framing

Files:

- `src/services/intake-entry-service.js`
- `src/trainer-dashboard.jsx`

Changes:

- change Stage 2 copy from `Details` clarify flow to `Planning details`
- remove `Structured / Free text` as the primary affordance for required fields
- remove `Go to the next detail` from required-path UX
- change footer CTA logic to one clear build action

### 2. Build a single Stage 2 form view model

Recommended new file:

- `src/services/intake-stage-two-form-service.js`

Responsibilities:

- read resolved goals, completeness state, starter metric questions, and current answers
- emit one structured form model with sections, fields, save state, and missing count
- merge:
  - starter metric questions from `buildIntakeStarterMetricQuestions()`
  - completeness questions from `deriveIntakeCompletenessState()`
  - explicit lift target fields for benchmark strength goals

Why a new service:

- keeps `trainer-dashboard.jsx` thinner
- avoids overloading `intake-anchor-collection-service.js`, which represents the old progressive card model

### 3. Add explicit numeric lift target support

Files:

- `src/services/intake-entry-service.js`
- `src/services/intake-completeness-service.js`
- goal-resolution helpers if needed for resolved lift benchmark metadata

Changes:

- replace free-text starter field `current_strength_baseline` for `improve_big_lifts` with:
  - `lift_focus`
  - `target_lift_weight`
  - `target_lift_reps`
  - `current_strength_baseline_weight`
  - `current_strength_baseline_reps`
  - `target_timeline`
- persist target lift fields in structured intake answers
- if resolved goal already includes numeric target, prefill `target_lift_weight` and `target_lift_reps`

### 4. Reuse existing validators instead of inventing new parsing

Files:

- `src/services/intake-completeness-service.js`

Changes:

- add a Stage 2 section validator that validates grouped fields using existing question validators
- keep the current stored field shapes for:
  - `current_strength_baseline`
  - `target_timeline`
  - running baseline fields
  - body-comp fields
- add new stored field shape for target lift benchmark if not already present

### 5. Update Stage 2 UI rendering

Files:

- `src/trainer-dashboard.jsx`

Changes:

- replace current `renderClarifyStage()` main body with:
  - goal lock rail
  - structured required sections
  - missing baseline panel
  - optional context section
  - sticky footer with build CTA
- keep free text only under optional context and custom-goal notes
- show inline save markers and field-level validation

### 6. Demote the old anchor-collection path

Files:

- `src/services/intake-anchor-collection-service.js`
- `src/trainer-dashboard.jsx`

Changes:

- stop using anchor-collection cards as the primary Stage 2 UX
- keep machine anchor logic only as a fallback for genuinely unsupported edge cases
- if fallback is used, surface it inside the same Stage 2 screen under `Need one more custom detail`, not as a next-step workflow

### 7. Add deterministic tests

Files:

- `tests/intake-completeness-service.test.js`
- new `tests/intake-stage-two-form-service.test.js`
- `e2e/intake.spec.js`

Must-cover cases:

- `bench 225` shows explicit target weight plus required current baseline fields on one screen
- missing current lift baseline blocks build inline without a next-detail flow
- `run a 1:45 half` shows timing plus running baseline fields together
- `visible abs` shows bodyweight and waist proxy fields and honesty copy
- custom goal path requires a structured family selection before build
- Stage 2 has one clear CTA and no required-field dependence on free-text entry

## Acceptance Criteria

- A user with `bench 225` can see the lift target, current baseline fields, and build state on one screen.
- A user with `run a 1:45 half` can fill race timing and running baseline on one screen.
- A user with `visible abs` sees bodyweight and waist proxy anchors, not fake body-fat certainty.
- Required planning data is fully completable without using free text.
- Invalid required values fail inline and do not require a `Go to the next detail` step.
- The primary CTA is singular and obvious.
- Changing goals requires an explicit `Edit goals` action.
- Valid entries save inline and survive refresh through the existing intake session persistence.

## Recommended Rollout Order

1. Add the Stage 2 form service and tests.
2. Add explicit numeric lift target fields and storage.
3. Swap the Stage 2 UI to the new structured screen.
4. Keep anchor collection only as a fallback seam.
5. Add browser proof for the major goal types.
