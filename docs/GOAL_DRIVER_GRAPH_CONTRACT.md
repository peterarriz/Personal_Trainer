# Goal Driver Graph Contract

## Purpose

FORMA now carries a compact transfer model through the existing goal pipeline so the app can reason about more than direct headline metrics.

This lets the product represent coaching truths like:

- shoulder work can support a bench goal
- calf and lower-leg work can support a run goal
- dryland pulling and scap work can support a swim goal

The goal is not fake precision. The goal is to make support work visible, structured, and reusable by planning, logging, progress, and trust surfaces.

## Core Model

Each resolved goal can now carry `driverProfile`:

- `primaryDomain`
- `primaryOutcomeId`
- `primaryOutcomeLabel`
- `focusLabel`
- `directDrivers[]`
- `supportDrivers[]`
- `protectiveDrivers[]`
- `transferNotes[]`

Driver ids are the stable contract. Labels and notes are human-facing helpers.

## Where It Lives

- Goal graph generation: [src/services/goal-driver-graph-service.js](C:/Users/Peter/Documents/Personal_Trainer/src/services/goal-driver-graph-service.js)
- Goal capability packet enrichment: [src/services/goal-capability-resolution-service.js](C:/Users/Peter/Documents/Personal_Trainer/src/services/goal-capability-resolution-service.js)
- Resolved goal attachment: [src/services/goal-resolution-service.js](C:/Users/Peter/Documents/Personal_Trainer/src/services/goal-resolution-service.js)
- Exercise transfer mapping: [src/services/exercise-transfer-profile-service.js](C:/Users/Peter/Documents/Personal_Trainer/src/services/exercise-transfer-profile-service.js)
- Performance-record attachment: [src/services/performance-record-service.js](C:/Users/Peter/Documents/Personal_Trainer/src/services/performance-record-service.js)
- Support contribution scoring: [src/services/goal-contribution-scoring-service.js](C:/Users/Peter/Documents/Personal_Trainer/src/services/goal-contribution-scoring-service.js)
- Goal progress rendering: [src/services/goal-progress-service.js](C:/Users/Peter/Documents/Personal_Trainer/src/services/goal-progress-service.js)
- Persistence sanitizer: [src/services/persistence-contract-service.js](C:/Users/Peter/Documents/Personal_Trainer/src/services/persistence-contract-service.js)

## Current Behavior

### Goal resolution

Both structured/template-first goals and legacy mixed-goal goals are enriched with the same capability packet and `driverProfile`.

That means `resolvedGoal` is now the canonical place to look for transfer/support metadata.

### Performance records

Normalized exercise records can now carry `transferProfile`:

- `supportDriverIds[]`
- `protectiveDriverIds[]`
- `directDriverIds[]`

This is derived from the logged exercise name and note, not a second logging system.

### Goal progress

Goal progress can now surface support evidence as a first-class tracked item.

Examples:

- strength goals: `Support work`
- running goals: `Support capacity`
- swim goals: `Dryland support`

For strength goals, direct primary-lift records are intentionally excluded from the support item so the app does not pretend bench sets are “bench support work.”

### Planning

The weekly planner now reads a compact support-planning context derived from:

- active resolved goals
- each goal's `driverProfile`
- recent logged exercise evidence

This does not replace the main week architecture. It refines support and dryland exercise choice inside planner-generated strength sessions.

Current planner behavior:

- run-led + bench-maintained weeks can bias upper-body support toward the next bench support gaps
- run-led durability sessions can bias calves, single-leg control, trunk, and tendon work when those drivers are undercovered
- swim-led weeks now populate dryland sessions with actual support rows instead of empty placeholders

Strict program backbones are intentionally left alone in this slice.

## What This Is Not

The current slice does **not** yet:

- compute exact causal contribution from accessory work to a goal
- surface full driver graphs directly in consumer UI
- rebalance the entire week around support gaps instead of only refining support-session exercise choice

## Next Recommended Slice

Extend the current planner-side support selection so unmet support or protective drivers can influence:

- accessory exercise choice
- support day emphasis
- stall-response adjustments
- sport-support gym work for swim, run, and hybrid goals

That should happen inside the existing planning engine, not in a separate planner.
