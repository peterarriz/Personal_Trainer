# FORMA

FORMA is a fitness operating system for intake, planning, Today guidance, logging, nutrition, coach support, devices, sync, and settings.

## Current App Scope

- Onboarding and auth with local-mode recovery
- Goal-first intake and plan creation
- Today, Program, Log, Nutrition, Coach, and Settings surfaces
- Appearance, sync, baseline, and device integrations
- Node contract tests plus Playwright UX and trust flows

## Architecture

The app is no longer a single-file dashboard.

- `src/trainer-dashboard.jsx` is the React composition root and the host for the main screen state owners.
- `src/domains/*` contains the public module boundaries for intake, program, today, log, nutrition, coach, and settings.
- `src/services/*` contains most domain logic, adapters, persistence helpers, and screen view-model builders.
- `src/modules-*.js` contains older runtime engines that are still active in production.
- `api/` contains Vercel serverless endpoints for auth, AI, and device integrations.
- `tests/` contains Node-based unit and contract suites.
- `e2e/` contains Playwright product flows and UX-quality gates.
- `docs/ARCHITECTURE_MAP.md` documents domain boundaries, state ownership, and test entrypoints.

`src/trainer-dashboard.jsx` is still large, but it is not the source of truth for all behavior. Treat it as the composition root. New user-facing behavior should go through the matching `src/domains/*` boundary, stay owned by one screen state owner, and update that domain's primary deterministic test entrypoint.

## Setup And Commands

```bash
npm install
npm run build
npm run build:verified
npm run dev
npm test
npm run test:repo-hygiene
npm run test:architecture
npm run test:quality:unit
npm run test:ux:e2e
npm run test:quality:e2e
npm run e2e
```

What those commands do today:

- `npm run build` builds the deployable app into `dist/`.
- `npm run build:verified` runs repo hygiene first, then builds the deployable app into `dist/`.
- `npm run dev` builds once, then serves `dist/` on port `3000`. It is a preview server, not a hot-reload dev server.
- `npm test` runs the full Node test suite in `tests/`.
- `npm run test:repo-hygiene` blocks stray root debris, generated output, and accidental backup files.
- `npm run test:architecture` checks the domain-boundary manifest and UX copy and surface budgets.
- `npm run test:quality:unit` runs the focused unit and contract pack that backs the repo quality gate.
- `npm run test:ux:e2e` runs focused Playwright tap-budget gates for common jobs.
- `npm run test:quality:e2e` runs the focused Playwright quality pack for intake, sync, and tap budgets.
- `npm run e2e` runs the broader Playwright suite.

## Source Vs Output

- Source lives in `src/`, `api/`, `scripts/`, `docs/`, `tests/`, and `e2e/`.
- Generated output lives in `dist/`.
- Local artifacts belong in `artifacts/`, `playwright-report/`, and `test-results/`.
- Root-level build output, backup patches, and one-off junk files are intentionally blocked by repo hygiene checks.

## Deployment

Vercel is configured to build with `npm run build` and serve `dist/`.
