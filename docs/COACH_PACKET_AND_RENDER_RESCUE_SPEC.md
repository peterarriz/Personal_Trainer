# Coach Packet And Render Rescue Spec

## Goal

Coach should feel materially different across common prompts without becoming the canonical planner.

## Deterministic Ownership

- Canonical plan state still belongs to deterministic planning and explicit accepted actions.
- Coach packets may summarize, explain, and recommend.
- No coach suggestion mutates state until the user accepts a deterministic action.

## Packet Shape

- `deterministicCoachPacket(...)` now produces:
  - `notices`
  - `recommendations`
  - `effects`
  - `actions`
  - `summary`
- `summary` is the render-first contract:
  - `headline`
  - `recommendedAction`
  - `whyNow`
  - `watchFor`
  - `promptKind`

## Prompt-Divergence Expectations

- `I'm traveling today`
  - travel-friction framing
  - travel-ready session and meal guidance
- `I slept badly`
  - recovery-limiter framing
  - condensed or reduced-load recommendation
- `I missed yesterday`
  - anti-makeup-volume framing
  - do not stack missed work on top of today
- `I want to push harder`
  - controlled progression framing
  - one-notch progression instead of load creep

## Render Rules

- Primary Coach rendering uses the compact `summary` contract instead of the older deterministic blob.
- Visible structure is:
  - headline
  - action
  - why
  - watch
  - available deterministic action
- Recent conversation stays compact and no longer needs configuration controls mixed into it.

## Test Hooks

- Coach message wrappers expose `data-testid="coach-message"` and `data-message-role` so browser tests can target the latest assistant reply without brittle text selection.

## Implemented In

- `src/modules-coach-engine.js`
- `src/trainer-dashboard.jsx`
- `tests/program-live-planning-service.test.js`
- `e2e/mobile-surfaces.spec.js`
