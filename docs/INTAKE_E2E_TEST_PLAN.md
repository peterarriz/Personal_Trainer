# Intake E2E Test Plan

## Framework

This repo now uses Playwright for browser-level intake verification.

Why Playwright:
- it is the lightest credible browser harness for this static-build app
- it can run against the real built `index.html`
- it supports deterministic request interception for `/api/ai/intake`
- it provides traces, screenshots, and videos on failure without extra infrastructure

## Deterministic AI Strategy

The browser suite does not call live AI services.

Instead, each test intercepts `/api/ai/intake` and returns fixed responses:
- `goal_interpretation`: usually forced unavailable so intake uses the deterministic fallback path
- `missing_field_extraction`: mocked with bounded field-scoped candidates for natural-answer tests
- `clarifying_question_generation`: usually forced unavailable, except for the late-response test

This keeps the suite stable while still exercising the real browser flow.

## Runtime Testability Hooks

The suite uses narrowly scoped, production-safe hooks instead of a parallel test-only intake path:
- stable `data-testid` markers on intake controls, review gates, and post-onboarding surfaces
- stable `data-*` stage markers on the intake root for current phase, stage, field, anchor, and confirmation status
- a browser event, `trainer:intake-commit`, emitted on commit `start`, `success`, and `failure`

These hooks are intentionally small. They exist to make real browser behavior assertable without changing the intake machine contract.

## Golden Flows Covered

- simple running goal with natural anchor answers
- simple strength goal with structured top-set capture
- appearance goal with explicit proxy selection
- multi-goal review with role lanes and tradeoffs
- goal edit midstream
- reload mid-intake restore
- AI unavailable fallback
- confirm/build idempotency

## Adversarial Flows Covered

- duplicate transcript key prevention
- early secondary-goal prevention
- extra-info contamination on a bound field
- natural timeline phrases like `next year` and `by summer`
- late coach-voice response safety
- abandon/no-goal safety

## Planner Handoff Assertions

After successful confirm/build, the suite asserts:
- onboarding completes in the visible app shell
- the Today surface renders
- persisted local cache shows `onboardingComplete: true`
- intake session storage is cleared so stale intake does not revive
- the browser sees exactly one `trainer:intake-commit` start and one matching success event, even under rapid repeated confirm clicks

## Running Locally

Install the browser once:

```bash
npm run e2e:install
```

Run the intake browser suite:

```bash
npm run e2e
```

Run headed:

```bash
npm run e2e:headed
```

Debug interactively:

```bash
npm run e2e:debug
```

## Debugging Failures

Playwright is configured to keep failure artifacts:
- `playwright-report/`
- `test-results/`
- retained traces
- retained screenshots
- retained videos

Use the trace viewer first for sequencing or timing failures.

The helper layer in `e2e/intake-test-utils.js` also centralizes:
- deterministic AI interception for `/api/ai/intake`
- local-mode entry and reload-safe restore handling
- confirmation behavior that respects `warn` acknowledgement
- transcript key reads and planner-handoff assertions

## Remaining Blind Spots

- the suite still runs in local-mode onboarding, not signed-in cloud sync mode
- it asserts visible planner handoff and local persistence, not Supabase writes
- it does not yet cover full cross-browser matrices beyond Chromium
