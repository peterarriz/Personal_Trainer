# Master Spec

This document is the single source of truth for product architecture. When implementation details conflict with this spec, update the code or explicitly revise this document.

For the contributor-facing planning contract, read `docs/PLANNING_SOURCE_OF_TRUTH_OVERVIEW.md` alongside this spec.

## Product Definition

The app is a stateful fitness operating system for a hybrid athlete. Its purpose is to decide what to do today across training, nutrition, supplements, and recovery, explain why, capture what actually happened, and adapt future decisions accordingly. AI should be used selectively for synthesis, interpretation, and coaching language, but not as the system of record.

## Contributor Reading Order

When touching planning, intake, adaptation, or trust-sensitive UI:

1. `docs/PLANNING_SOURCE_OF_TRUTH_OVERVIEW.md`
2. `docs/MASTER_SPEC.md`
3. `docs/DYNAMIC_PLAN_ENGINE_AND_ADAPTATION_SPEC.md`
4. `docs/INTAKE_AI_BOUNDARY.md`
5. `docs/PLAN_WEEK_PERSISTENCE_MODEL.md`
6. `docs/WORKOUT_SOURCE_OF_TRUTH_CONTRACT.md`

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
- Quiet degraded mode wins over noisy failure UI. Transient cloud problems should preserve local coherency and stay secondary to execution surfaces.

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
- support-tier labeling for the active planning lane
- metrics / baseline confidence and planning influence

Rules:

- Derived state can be cached for performance, but must remain disposable.
- Manual edits must land on canonical entities, not only on derived views.
- If a derived value is user-editable, it probably needs to be promoted to a canonical entity.

## Plan Hierarchy

The plan model should resolve top-down in this order:

1. Product mission and user profile
2. Goal stack
3. Goal capability packet and domain adapter
4. Program block
5. Weekly intent
6. Plan week
7. Plan day
8. Domain prescriptions
9. Actual logs and outcomes
10. Future adaptations

Interpretation:

- `ProgramBlock` defines the phase-level purpose.
- `GoalCapabilityPacket` and the domain adapter map broad user intent into one finite planning substrate.
- `WeeklyIntent` defines what this specific week is trying to accomplish.
- `PlanDay` is the single daily operating decision.
- Domain prescriptions are children of the day, not separate competing plans.
- Actual outcomes influence future plan generation, never rewrite history.
- The visible 12-week horizon is a preview window, not a promise that every goal finishes inside that window.

## Dynamic Planning Engine

- Goal phrasing is normalized into a finite capability ontology.
- One dominant domain adapter shapes the week without creating a second planner.
- Training preference is a planning-policy input, not decorative copy.
- Programs are backbones; Styles are overlays.
- The engine must emit a short visible change summary whenever the plan materially changes.

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

## Account And Reliability

- Auth identity, local runtime state, and cloud persistence must be treated as separate concerns with explicit handoff points.
- Signup captures minimal account identity; profile setup completes the minimum athlete identity before intake.
- Logout pauses cloud sync but does not imply account deletion.
- Delete account must remove the auth identity and clear local caches on the current device.
- Transient cloud failures should degrade to local-first `SYNC RETRYING` behavior without UI thrash.

## Metrics And Editability

- Goal-relevant baselines must be inspectable and editable after intake.
- The product should show whether a metric is user-provided, intake-derived, log-inferred, or placeholder.
- Editing a baseline may change future planning but must not rewrite historical actuals.

## Support Tiers

- Tier 1: first-class deterministic support with stronger domain rules and clearer metrics.
- Tier 2: bounded but meaningful support through narrower adapters and more guardrails.
- Tier 3: exploratory fallback through the nearest safe shared mode with explicit uncertainty.

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
- suggest timing interpretation or target horizons during intake

AI is not allowed to:

- be the only source of a plan, log, or adjustment record
- silently write canonical state
- replace deterministic calculations for readiness, prescriptions, or provenance
- infer actual completion without an explicit user log or trusted device record
- force a hard end date when the goal is genuinely open-ended

## Rules For Planned State Vs Actual State

- Planned state is forward-looking and answers: "What should happen?"
- Actual state is historical and answers: "What did happen?"
- A changed workout creates an adjustment record and possibly a new plan snapshot, not a retroactive overwrite of the old plan.
- A modified completion is an actual result, not proof that the plan was wrong.
- Future planning may learn from actual state, but past planned state remains historically true for that date.
- UI components must never blur these two concepts for convenience.
- Durable week snapshots and prescribed-day revisions preserve historical truth, while projected future weeks stay preview-only until they become current.

## Provenance And Trust Principles

- Every recommendation should point back to the state that produced it.
- Every adjustment should record who or what initiated it: user, deterministic engine, or AI interpretation.
- Every AI-generated explanation should be anchored to a structured packet.
- Manual user input outranks inferred interpretation.
- Deterministic application state outranks AI-generated wording.
- When certainty is low, the system should say so explicitly instead of sounding authoritative.
- Trust is earned by traceability, stable contracts, and faithful separation of plan from reality.
- Default trust copy should stay short: basis, change, and save state first; deeper explanation only when requested.

## 2026-04-13 Hardening Update

- Today, Program, and Log now share one live-day session display contract via `buildDayPrescriptionDisplay(...)`, and Log detailed capture is seeded from that same planned session.
- Settings now separates Account, Profile, Plan Management, Preferences, and Advanced surfaces instead of one long mixed management page.
- Coach primary rendering now uses a compact deterministic summary (`headline`, `action`, `why`, `watch`) so common prompts diverge without repeating the same blob.
- Profile editing in Settings is explicit-save to avoid repeated cloud writes during typing.
- Missing Program metrics now route directly to Settings → Metrics / Baselines.
- Daily nutrition logging uses one outcome model based on actual deviation plus friction, while weekly planning stays visible as a separate execution layer.
- Coach explanation remains helpful, but accepted deterministic actions still own canonical state changes.
