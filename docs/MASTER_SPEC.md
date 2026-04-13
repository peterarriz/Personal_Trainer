# Master Spec

This document is the single source of truth for product architecture. When implementation details conflict with this spec, update the code or explicitly revise this document.

## Product Definition

The app is a stateful fitness operating system for a hybrid athlete. Its purpose is to decide what to do today across training, nutrition, supplements, and recovery, explain why, capture what actually happened, and adapt future decisions accordingly. AI should be used selectively for synthesis, interpretation, and coaching language, but not as the system of record.

## Core User Promise

For any given day, the athlete should be able to open the app and get:

- one clear recommendation for what to do today
- a short explanation of why that recommendation fits current goals and constraints
- a simple way to record what actually happened
- visible carry-forward into tomorrow, this week, and the larger plan

## Architecture Principles

- Deterministic state first. Core decisions must come from structured application state, not UI heuristics or freeform AI output.
- One shared model, many screens. Today, Program, Coach, Nutrition, and Logging are different views over the same product state.
- One obvious job per screen. Reading, logging, coaching, and management should not be mixed by default.
- Planned state and actual state stay separate. Prescription is not evidence.
- Derived state must be reproducible. If a value can be recalculated from canonical state, it should not become a hidden source of truth.
- Explicit provenance beats implicit behavior. Users should be able to tell where a recommendation came from.
- AI may interpret and explain, but it must not silently mutate canonical records.
- Scope should stay narrow per change. New work should strengthen existing seams instead of creating parallel systems.
- Mobile-first hierarchy wins. Default views should be concise, scannable, and action-first, with deeper detail behind progressive disclosure.

## Canonical Entities

- `UserProfile`: stable athlete attributes, preferences, constraints, equipment access, schedule realities.
- `Goal`: normalized goal objects with category, priority, horizon, status, and measurable target.
- `WeeklyIntent`: the declared purpose of a week or block, including emphasis, constraints, and success definition.
- `ProgramBlock`: the higher-order training/nutrition phase that frames several weeks.
- `PlanWeek`: the prescribed structure for a given week.
- `PlanDay`: the prescribed daily decision for a date, including training, nutrition, supplements, and recovery intent.
- `SessionPrescription`: the structured training prescription for the day.
- `NutritionPrescription`: the structured daily nutrition target and meal strategy.
- `RecoveryPrescription`: sleep, mobility, pain-management, and recovery directives.
- `SupplementPlan`: planned supplement actions and timing.
- `DailyCheckin`: readiness, blockers, and subjective context captured before or around execution.
- `ActualSessionLog`: what training was actually done, including modification and completion status.
- `ActualNutritionLog`: what nutrition actually happened, including compliance, hydration, and friction.
- `ActualRecoveryLog`: what recovery actions actually occurred and how recovery felt.
- `PerformanceRecord`: exercise- or session-level outputs used for adaptation over time.
- `CoachAction`: explicit suggested or accepted plan adjustments, with timestamp and rationale.

## Derived State

Derived state should be computed from canonical entities and never treated as independent truth.

- active goal stack and primary goal
- current block intent and plan horizon
- today's recommendation package
- readiness state and decision modifiers
- momentum, adherence, and consistency signals
- nutrition day type and macro targets
- performance trends and progression suggestions
- coach memory summaries and weekly review summaries
- trust and provenance labels shown in the UI

Rules:

- Derived state can be cached for performance, but must remain disposable.
- Manual edits must land on canonical entities, not only on derived views.
- If a derived value is user-editable, it probably needs to be promoted to a canonical entity.

## Plan Hierarchy

The plan model should resolve top-down in this order:

1. Product mission and user profile
2. Goal stack
3. Program block
4. Weekly intent
5. Plan week
6. Plan day
7. Domain prescriptions
8. Actual logs and outcomes
9. Future adaptations

Interpretation:

- `ProgramBlock` defines the phase-level purpose.
- `WeeklyIntent` defines what this specific week is trying to accomplish.
- `PlanDay` is the single daily operating decision.
- Domain prescriptions are children of the day, not separate competing plans.
- Actual outcomes influence future plan generation, never rewrite history.

## Daily Decision Engine Responsibilities

The daily decision engine is responsible for:

- reading profile, goals, current program context, weekly intent, recent actuals, and readiness inputs
- resolving the single recommended day state across training, nutrition, supplements, and recovery
- producing a structured explanation for why today looks this way
- flagging what was preserved, what was modified, and what tradeoff was made
- honoring explicit constraints such as travel, time, pain, fatigue, and equipment
- emitting a stable output contract that all screens can read
- storing enough provenance for later audit and adaptation

The engine is not responsible for:

- conversational coaching style
- freeform memory generation as a source of truth
- mutating historical actual logs

## Logging Architecture

Logging must be modeled as actual observed behavior, not as plan storage.

- `PlanDay` stores what was prescribed.
- `DailyCheckin` stores subjective context and readiness.
- `ActualSessionLog` stores what training happened.
- `ActualNutritionLog` stores what nutrition happened.
- `ActualRecoveryLog` stores what recovery happened.
- `PerformanceRecord` stores exercise-level or session-level performance outcomes.

Logging rules:

- Actual logs must support partial completion, modification, skip, and unknown states.
- A user can complete a check-in without completing a session.
- A user can log actuals after the fact without mutating the original prescription.
- Adaptation logic should compare prescribed vs actual, not assume they are the same.

## Screen Responsibilities

### Today

- Present the single recommended `PlanDay`.
- Make today's session the first thing visible.
- Capture today's check-in and actual outcome with minimal friction.
- Keep rationale short by default and expandable on demand.

### Program

- Show the current week clearly and the next few weeks clearly.
- Keep the surface mostly read-oriented, not override-oriented.
- Make plan continuity and major changes visible without long essays.
- Push plan-management actions into Settings.

### Coach

- Translate structured state into coaching guidance, options, and rationale.
- Help the user make decisions or understand adjustments.
- Keep configuration and provider controls out of the default conversation flow.
- Never become an untracked hidden writer of canonical state.

### Nutrition

- Present today's nutrition prescription first.
- Capture nutrition reality separately from training completion.
- Make daily logging quick; keep support content secondary and collapsible.

### Logging

- Act as the audit layer for what actually happened.
- Make quick capture the primary action.
- Preserve the distinction between prescribed, modified, skipped, and completed behavior.
- Keep review/history detail secondary so logging stays fast.

### Settings

- Own profile, preferences, theme, plan management, and advanced controls.
- Own Program/Style activation and goal-management actions that should not live in Program.
- Hide unfinished integrations and advanced/debug controls by default.

## AI Boundaries

AI is allowed to:

- synthesize structured state into short explanations
- summarize patterns and tradeoffs
- generate coaching tone and user-facing language
- suggest options based on a typed input packet

AI is not allowed to:

- be the only source of a plan, log, or adjustment record
- silently write canonical state
- replace deterministic calculations for readiness, prescriptions, or provenance
- infer actual completion without an explicit user log or trusted device record

## Rules For Planned State Vs Actual State

- Planned state is forward-looking and answers: "What should happen?"
- Actual state is historical and answers: "What did happen?"
- A changed workout creates an adjustment record and possibly a new plan snapshot, not a retroactive overwrite of the old plan.
- A modified completion is an actual result, not proof that the plan was wrong.
- Future planning may learn from actual state, but past planned state remains historically true for that date.
- UI components must never blur these two concepts for convenience.

## Provenance And Trust Principles

- Every recommendation should point back to the state that produced it.
- Every adjustment should record who or what initiated it: user, deterministic engine, or AI interpretation.
- Every AI-generated explanation should be anchored to a structured packet.
- Manual user input outranks inferred interpretation.
- Deterministic application state outranks AI-generated wording.
- When certainty is low, the system should say so explicitly instead of sounding authoritative.
- Trust is earned by traceability, stable contracts, and faithful separation of plan from reality.
- Default trust copy should stay short: basis, change, and save state first; deeper explanation only when requested.
