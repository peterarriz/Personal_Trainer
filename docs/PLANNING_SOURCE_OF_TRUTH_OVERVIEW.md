# Planning Source Of Truth Overview

This is the contributor-facing overview for how planning, intake, adaptation, and history fit together in the live app.

Use this document when you need the shortest accurate answer to:

- how the planner builds a plan
- how goal priority affects the plan
- how logs change future plans
- how historical truth is preserved
- what the visible 12-week horizon means
- why some goals stay open-ended

Read this alongside:

- `docs/MASTER_SPEC.md`
- `docs/DYNAMIC_PLAN_ENGINE_AND_ADAPTATION_SPEC.md`
- `docs/INTAKE_AI_BOUNDARY.md`
- `docs/PLAN_WEEK_PERSISTENCE_MODEL.md`
- `docs/WORKOUT_SOURCE_OF_TRUTH_CONTRACT.md`

## One Story

The product is built around one deterministic planning pipeline:

`profile -> ordered goals -> capability packet -> dominant domain adapter -> program/style basis -> ProgramBlock -> WeeklyIntent -> PlanWeek -> PlanDay -> prescriptions -> actuals -> future adaptations`

The planner is deterministic. AI may help interpret, summarize, or propose, but it is not allowed to become the source of truth for plan state.

## Canonical Inputs

The planner reads structured state, not freeform UI copy:

- athlete profile and training context
- ordered active goals with numeric priority
- program and style selections
- committed week history
- prescribed day history
- workout logs, check-ins, nutrition actuals, and performance records
- accepted coach actions

Key implementation files:

- `src/modules-planning.js`
- `src/services/program-live-planning-service.js`
- `src/services/plan-week-service.js`
- `src/services/plan-week-persistence-service.js`
- `src/services/prescribed-day-history-service.js`

## How Intake Hands Off To Planning

Intake is a guided setup, not a chat transcript and not a hidden planner.

The live handoff is:

1. The user picks a goal type or writes a custom goal.
2. Intake collects only the smallest set of anchors that materially change the first plan.
3. AI may propose interpretation or missing structure.
4. The user confirms or edits the proposed goal stack.
5. Only confirmed resolved goals become canonical planner input.

Important rule:

- raw goal text is preserved for audit
- AI interpretation is proposal-only
- confirmed resolved goals are the planning truth

Key implementation files:

- `src/services/intake-goal-flow-service.js`
- `src/services/goal-resolution-service.js`
- `src/services/goal-capability-resolution-service.js`
- `src/services/intake-entry-service.js`

## How The Planner Builds A Plan

At runtime, `composeGoalNativePlan(...)` in `src/modules-planning.js` does the core composition work.

In plain English, it:

1. normalizes the active ordered goal stack
2. identifies the highest-priority active goal
3. derives the training context and explicit constraints
4. selects the dominant domain adapter plus support domains
5. resolves any active Program or Style basis through `deriveLiveProgramPlanningBasis(...)`
6. builds the week shape and day templates
7. applies deterministic adaptation from actual behavior and other bounded signals
8. emits change summary and planning basis metadata for surfaces

The app then turns that planner output into:

- the current committed week
- the visible projected horizon
- the current canonical day model
- the shared surface models used by Today, Program, Log, Coach, and Nutrition

## How Primary Goal Priority Affects Planning

Priority order matters because the first active goal gets first claim on:

- architecture
- fatigue budget
- session ordering
- progression posture
- tradeoff handling

Lower-priority goals still matter, but they are shaped as support unless the user explicitly reprioritizes them.

That means:

- `Priority 1: running`, `Priority 2: strength` usually produces a run-dominant block with deliberate strength support
- `Priority 1: strength`, `Priority 2: running` can produce a strength-dominant block with conditioning support
- changing priority order is a planning change, not a cosmetic label change

Internal arbitration terms like `background` or `deferred` may still exist in services, but user-facing surfaces should talk about ordered priorities instead of lane jargon.

## How Logging Changes Future Plans

Logs do not rewrite what was prescribed. They change what happens next.

The planner compares planned versus actual behavior and uses bounded horizons:

- workout outcomes can carry work forward, cap the next exposure, or simplify the week
- repeated harder-than-expected sessions can reduce near-term aggression
- nutrition misses can change same-day support first, then short-to-medium training protection if the pattern repeats
- readiness, pain, travel, and equipment can change the same day immediately
- accepted coach actions can influence future sessions only through explicit deterministic gates

This is why the planning stack ends with:

`prescriptions -> actuals -> future adaptations`

not:

`prescriptions -> actuals overwrite prescriptions`

## How Historical Truth Is Preserved

Historical truth is preserved in two different layers.

### Day truth

`prescribedDayHistory` stores durable day revisions.

- a new material prescription creates a new revision
- cosmetic wording drift does not create a fake revision
- the current record is visible, but older revisions remain audit history

### Week truth

`planWeekRecords` stores durable committed week snapshots.

- committed weeks become durable history
- projected future weeks do not become durable history
- archived plan arcs can preserve older committed week history separately from live projected weeks

This separation is what lets the app say both of these things truthfully:

- `This is what was planned at the time`
- `This is what changed later`

## What The 12-Week Visible Horizon Means

The visible planning horizon is currently `12` weeks.

Source:

- `DEFAULT_PLANNING_HORIZON_WEEKS = 12` in `src/modules-planning.js`
- `DEFAULT_VISIBLE_GOAL_HORIZON_WEEKS = 12` in `src/services/goal-timing-service.js`

In the UI this is described as `next 3 months`.

Important distinction:

- the visible horizon is a planning preview window
- it is not the same thing as the full goal deadline
- it is not a guarantee that the whole goal resolves inside those 12 weeks

Examples:

- a race 20 weeks away can still be the active target while Program only shows the next 12 weeks
- an open-ended general-fitness goal can still build a real plan with no hard finish line
- projected weeks outside the current committed week remain projected until they become current

## Why Not All Goals Need Hard End Dates

The app supports three timing shapes:

- exact date
- target horizon
- open-ended

Not every goal needs a hard calendar deadline.

Use an exact date when the calendar truly matters, such as:

- a race
- an event
- a fixed deadline the user actually cares about

Use a target horizon when the goal is real but date precision is unnecessary, such as:

- `about 20 weeks`
- `this summer`

Use open-ended when the goal is ongoing, such as:

- getting generally fitter
- building strength steadily
- staying durable while life is chaotic

The key rule is:

- the planner should not invent fake precision

## AI Boundary In One Paragraph

AI can:

- interpret messy intake language
- propose structure
- summarize tradeoffs
- explain plan changes

AI cannot:

- write canonical goals
- write `PlanWeek`
- write `PlanDay`
- rewrite logs
- bypass explicit acceptance

If AI fails, intake and planning still fall back to deterministic local behavior.

## Surface Contract

All main surfaces should read from the same canonical planning truth:

- Today
- Program
- Log
- Coach
- Nutrition

Today and Program are not allowed to describe a different prescribed session for the same date.

Log is not allowed to seed itself from a different workout than the canonical planned day.

Coach and Nutrition are not allowed to invent a different reason for the same day than the shared surface model.

## Contributor Guardrails

When changing planning behavior:

- update code first or alongside docs, never docs alone
- keep projected preview separate from committed history
- treat actual logs as evidence, not as retroactive plan edits
- preserve the proposal-only AI boundary
- prefer updating the shared planning or surface model instead of patching one screen in isolation

## Contract Tests

The most important assumptions are backed by tests:

- `tests/planning-source-of-truth-contract.test.js`
- `tests/dynamic-plan-engine.test.js`
- `tests/goal-timing-service.test.js`
- `tests/persistence-history.test.js`
- `tests/plan-week-persistence.test.js`
- `tests/ai-boundary-regression.test.js`
