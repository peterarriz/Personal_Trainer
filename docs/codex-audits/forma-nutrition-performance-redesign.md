# FORMA Nutrition Performance Redesign

## Audit lens 1: tech-forward consumer fitness product

Before this pass, FORMA Nutrition was decent at low-friction compliance:

- daily macro targets changed by day type and goal
- meal templates were practical
- saved meal anchors and fallback meals reduced friction

But it still felt closer to "macro guidance with meal ideas" than a real nutrition layer:

- quality and long-run days did not visibly explain day-before, day-of, during, and recovery fueling
- hydration support was partly visible in the UI but not durable in the prescription layer
- sodium logic was not first-class
- bodyweight trend and phase changes were mostly hidden
- the main Nutrition surface still looked like meal planning first and performance support second

For a consumer product, that meant the section was usable but skippable.

## Audit lens 2: serious goal-driven athlete

From a harder running or hybrid athlete lens, the old state was not strong enough:

- a quality day should say how to fuel the session, not just show higher carbs
- a long run should say when breakfast stops being enough and during-run carbs become required
- hybrid days should explicitly protect both run fuel and strength recovery
- recovery days should simplify intake without pretending they need the same script as a quality day
- a fast bodyweight drop should visibly soften the deficit around key work

That gap is where trust usually breaks. Serious athletes do not just want the target - they want the reason, timing, and tradeoff.

## Redesign shipped

The current repo now adds a deterministic performance layer on top of the existing low-friction meal system.

### Core engine

Implemented in `src/modules-nutrition.js`:

- session-specific fueling scripts for:
  - quality endurance
  - long endurance
  - strength support
  - hybrid support
  - recovery
  - balanced days
- explicit day-before, day-of, during, and recovery guidance
- explicit hydration targets in ounces, saved in the nutrition prescription
- explicit sodium targets and guidance
- bodyweight-trend classification:
  - `dropping_fast`
  - `dropping_steady`
  - `flat`
  - `rising`
- phase-aware nutrition guidance:
  - cut with performance guardrails
  - maintenance
  - performance support / peak

### Adaptive logic

The nutrition layer now changes not just by day type, but by:

- primary goal bias
- hybrid goal stack support
- recent under-fueling or hunger
- repeated hard-than-expected sessions
- bodyweight trend
- current phase

Important behavior changes:

- fast bodyweight loss now softens the deficit on harder running or hybrid days instead of quietly pushing the cut harder
- hard and long-run days now carry explicit hydration targets in the prescription layer
- quality, long-run, strength, and hybrid days each have distinct fueling language instead of collapsing into generic meal advice

### Nutrition UI

Implemented in `src/trainer-dashboard.jsx`:

- the lead card now reads `TODAY'S NUTRITION PLAN`
- a new `PERFORMANCE FUELING` card exposes:
  - day before
  - day of
  - during
  - recovery
  - hydration
  - sodium
- a new `ADAPTIVE CONTEXT` card explains:
  - phase
  - bodyweight trend
  - why today's targets changed
- the low-friction meal system remains in place below that performance layer

This keeps the easy execution layer, but stops meal templates from being the only thing users see.

## What is now proven

Deterministic proof:

- `tests/nutrition-engine-variation.test.js`
  - quality-day fueling, hydration, sodium, and phase context
  - fast-drop trend guardrail behavior
  - hybrid day performance support
- `tests/nutrition-compatibility-audit-service.test.js`
  - Peter audit now reflects explicit hydration targets
  - common target failures still fail deterministically
  - under-fueling before quality work still raises audit risk
- `tests/nutrition-review.test.js`
  - actual-vs-prescribed nutrition history remains separated

Reviewer artifact:

- `docs/codex-audits/peter-nutrition-target-audit.md`

## What is still not fully first-class

The redesign is materially better, but it is still not a full sports-nutrition platform.

Still weaker than best-in-class:

- maintenance and weekly deficit are now first-class, but the maintenance estimate can still be heuristic if the user has not saved one
- preferred cuisines now steer meal suggestions from Settings without changing the macro logic
- no individualized sweat-rate model
- sodium is heuristic, not personalized from sweat testing
- no event-distance-specific carb-loading protocol beyond the current day-type logic
- no GI-tolerance or race-day product preference model

So the honest claim is:

- FORMA Nutrition is no longer just macro-and-meal-template guidance
- it now behaves like a real performance-support layer for hard run, long run, strength, hybrid, and recovery days
- it is not yet a fully individualized endurance nutrition system because sweat rate, GI tolerance, race product preference, and event-specific carb-loading are still not first-class
