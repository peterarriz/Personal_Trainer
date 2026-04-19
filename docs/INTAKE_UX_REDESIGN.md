# Intake UX Redesign

## Purpose

This document records the shipped intake redesign direction.

The visible experience now aims to feel:

- lighter than a wizard
- more premium than a settings checklist
- faster for exact-goal users
- calmer and more trustable for fuzzy-goal users
- explicitly deterministic at the final confirmation boundary

## Chosen Direction

The intake surface now follows a living-card model instead of a parade of separate chores.

The shell is:

- one primary action card
- one stable summary region
- one footer action layer

The main card changes as the user moves from goal selection to clarify. The summary region stays anchored and updates in place.

## Shipped Surface Contract

### Main action card

The main card should do one job at a time:

- choose a goal path
- tighten the few week-one realities
- answer the active missing anchor
- confirm and build

### Stable summary region

The summary region should always answer:

- `What you said`
- `What we'll optimize first`
- `What we'll track`
- `What's still open`

### Plan-shape preview

Before final build, the summary region should show:

- a trajectory line
- the next milestone
- a credible first two weeks

This gives the user payoff before the final handoff.

## What Shipped

### 1. Featured-first opening

The first load now emphasizes:

- featured goal families
- featured goal paths
- optional custom goal entry

The full goal library still exists, but it is now a secondary tool for edge cases and added priorities.

### 2. Reality collection stays inline

Experience level, training days, session length, environment, equipment, and issue constraints stay on the same living surface instead of feeling like a second workflow.

### 3. Interpretation, clarify, and confirm now feel tighter

The deterministic confirmation boundary still exists under the hood, but the visible experience is no longer a stop-and-start wizard.

The user sees one evolving draft instead of several equally loud screens.

### 4. Plan shape is visible before build

The first two weeks now appear before final build so the user can judge whether the direction looks believable.

### 5. Summary stays stable

The stable summary region is now the trust anchor for both exact and fuzzy users. It reduces re-reading and makes the flow feel shorter.

## Fast Paths

### Exact-goal path

The exact-goal path should feel like:

1. pick the closest path or enter the target directly
2. answer only the anchors that materially change week one
3. see the preview
4. confirm and build

### Fuzzy-goal path

The fuzzy-goal path should feel like:

1. pick the closest family or write the broad goal
2. see the interpreted direction through the summary and preview
3. answer only the missing anchors needed for a credible first plan
4. confirm and build

## What Stayed The Same On Purpose

The redesign did not change:

- the planner
- the deterministic goal-resolution boundary
- the explicit confirmation requirement
- the structured-first field contract
- the no-fake-chat-theater rule

This was a product-surface redesign, not a planning rewrite.

## Input Rules

The intake should still prefer structured controls when the field changes planning materially.

Examples:

- chips for training days and session length
- structured baseline controls
- environment and equipment selectors
- limited free text only where it helps the user say something the structured path cannot capture

## Trust Rules

The intake should:

- show payoff early
- keep the current understanding visible
- be explicit about what is still open
- keep the final handoff explicit

The intake should not:

- pretend uncertainty is resolved when it is not
- hide key state in a transcript
- over-explain the engine
- make the user browse taxonomy before they see value

## Why This Direction Works Better

This direction helps because it:

- reduces visible step changes
- reduces browse friction
- gives the user a stable mental model
- lets exact-goal users move quickly
- gives fuzzy-goal users clarity without fake precision
- shows plan payoff before asking for final commitment

## Verification

Shipped-flow coverage now lives primarily in:

- `tests/intake-entry-service.test.js`
- `tests/intake-machine-service.test.js`
- `tests/intake-plan-preview-service.test.js`
- `e2e/intake.spec.js`
- `e2e/intake-one-screen.spec.js`
- `e2e/mobile-surfaces.spec.js`
