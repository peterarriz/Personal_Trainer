# Design Direction Execution

## Chosen direction

FORMA now follows a single launch direction: `Minimalist Elite Coach`.

This means:

- calm authority over dashboard noise
- one strong action above the fold
- editorial restraint instead of dense explanation stacks
- warm neutral surfaces with controlled accent color
- strong numerics and session labels where performance matters
- no gamified badges or operator-console tone on consumer surfaces

## Design principles

### One hero per screen

Today, Program, Log, Intake, and Coach now open with one dominant hero region that answers the main question for that surface.

- Today: what do I do now
- Program: what week am I in and what matters
- Log: what am I saving
- Intake: what setup step am I on
- Coach: what call is being made

### One primary action

Each major screen now exposes a clear primary action above the fold.

- Today: `Log recovery` or `Update log`
- Program: `Review this week`
- Log: `Save` / top save action
- Intake: `Continue` or `Build plan`
- Coach: `Accept change` or `Ask`

### Quieter support layer

Supporting copy is still present, but it is visibly quieter than the session label, weekly label, or action layer. Save state, source labels, and sync status live in quiet panels instead of competing with the hero headline.

### Shared card language

The redesign does not add a new framework. It extracts a lightweight surface system from the current app and reuses the existing token layer.

## Component hierarchy

Shared primitives now live in:

- [src/components/SurfaceSystem.jsx](</C:/Users/Peter/Documents/Personal_Trainer/src/components/SurfaceSystem.jsx>)

Primary primitives:

- `SurfaceHero`
- `SurfaceHeroHeader`
- `SurfaceHeroCopy`
- `SurfaceHeading`
- `SurfaceCard`
- `SurfaceQuietPanel`
- `SurfaceMetaRow`
- `SurfaceActions`
- `SurfacePill`
- `SurfaceDisclosure`
- `SurfaceRecommendationCard`

Shared surface styling is defined inside the existing global dashboard style layer in:

- [src/trainer-dashboard.jsx](</C:/Users/Peter/Documents/Personal_Trainer/src/trainer-dashboard.jsx>)

This keeps the current architecture intact while giving the product one reusable hierarchy system.

## What changed

### Today

- Hero rebuilt with shared primitives.
- Session label, next step, duration, status, and save state now read as one composed surface.
- Quick log card now uses the shared card language.
- Quick log no longer collapses just because the session label recomputed after save.

### Program

- Hero rebuilt with shared primitives.
- Program now has an explicit above-the-fold primary action: `Review this week`.
- `Manage plan` is surfaced as the quieter secondary action.
- Trust and update chips now live in a consistent meta row.

### Log

- Log now has a real hero instead of a generic top card.
- The planned session label and save state moved into the hero layer.
- A top save action now exists above the fold, while the sticky save bar remains for long-form editing.

### Intake

- Intake shell now uses the shared hero language.
- Stage headers now use the shared heading primitive.
- The main stage container now uses the shared surface card shell.

### Coach

- Coach hero rebuilt with the shared hero system.
- Recommendation cards now use `SurfaceRecommendationCard` so Today/Week/Ask recommendations all share the same four-part structure and visual weight.
- Coach panels now match the same action card language used elsewhere.

## Before vs after

### Before

- too many top cards looked equally important
- bespoke shell code was repeated across Today, Log, and Coach
- Program read more like a control center than a premium weekly surface
- Intake looked like a separate product
- save state and quiet metadata competed with headlines

### After

- each core screen has one dominant hero
- action hierarchy is clearer
- supporting copy is calmer and visibly secondary
- Today, Program, Log, Intake, and Coach now feel related
- the surface system is extracted into reusable primitives instead of more inline sprawl

## What remains for later

- Deeper extraction from [src/trainer-dashboard.jsx](</C:/Users/Peter/Documents/Personal_Trainer/src/trainer-dashboard.jsx>) into domain-owned presentational components.
- A second pass on Nutrition and Settings so the same primitives cover more of the product family.
- Removal of older unreachable surface code that still exists in the large dashboard file.
- A broader light-mode polish pass once launch-critical surface consistency is locked.

## Notes

- This pass intentionally did not touch planner, sync, or security architecture.
- The design system is intentionally small. It is meant to reduce sprawl, not create another abstraction layer for its own sake.
