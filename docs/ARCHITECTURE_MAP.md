# Architecture Map

This repo is no longer a single-file dashboard. `src/trainer-dashboard.jsx` is still the composition root and screen host, but user-facing behavior is now spread across explicit domain boundaries, service modules, and older runtime engines.

## Current Shape

| Layer | What lives there | Notes |
| --- | --- | --- |
| `src/trainer-dashboard.jsx` | App shell, tab routing, auth/onboarding orchestration, and screen state owners | Composition root only. New domain logic should not start here. |
| `src/domains/*` | Public module boundaries for user-facing domains | New imports should go through these boundaries first. |
| `src/services/*` | Domain logic, adapters, view models, persistence helpers, and contracts | Internal implementation behind the public boundaries. |
| `src/modules-*.js` | Older planning, auth, nutrition, and coach engines | Still part of runtime. Treat as legacy engines, not as the pattern for new work. |
| `api/*` | Serverless auth and integration endpoints | Runtime boundary for cloud concerns. |
| `tests/*` | Node contract and unit suites | Primary deterministic test entrypoints. |
| `e2e/*` | Playwright UX and trust flows | Proves product behavior, not just helper output. |

## Boundary Manifest

The enforced manifest lives in [`docs/architecture-boundaries.json`](./architecture-boundaries.json).

| Domain | Public boundary | State owner | Primary test entrypoint | Internal services behind it |
| --- | --- | --- | --- | --- |
| Intake | `src/domains/intake/index.js` | `TrainerDashboard` | `tests/intake-entry-service.test.js` | `intake-entry-service`, `intake-machine-service`, `intake-goal-flow-service`, `intake-flow-service`, `goal-template-catalog-service` |
| Program | `src/domains/program/index.js` | `PlanTab` | `tests/program-live-planning-service.test.js` | goal resolution/review/progress, `plan-day-service`, `plan-week-service`, `program-live-planning-service`, `metrics-baselines-service`, `support-tier-service` |
| Today | `src/domains/today/index.js` | `TodayTab` | `tests/plan-day-surface-service.test.js` | `day-prescription-display-service`, `plan-day-surface-service`, `training-context-service` |
| Log | `src/domains/log/index.js` | `LogTab` | `tests/workout-log-form-service.test.js` | `workout-log-form-service`, `day-review-service`, `history-audit-service`, `performance-record-service`, `prescribed-day-history-service` |
| Nutrition | `src/domains/nutrition/index.js` | `NutritionTab` | `tests/weekly-nutrition-review.test.js` | `nutrition-day-taxonomy-service`, `weekly-nutrition-review-service`, `recovery-supplement-service` |
| Coach | `src/domains/coach/index.js` | `CoachTab` | `tests/coach-surface-service.test.js` | `coach-surface-service`, `ai-runtime-service` |
| Settings | `src/domains/settings/index.js` | `SettingsTab` | `tests/auth-entry-service.test.js` | auth, sync, appearance, baseline, and persistence services |

## State Ownership Rule

State ownership is screen-first right now:

- `TrainerDashboard` owns app-level session, persistence, onboarding, and cross-tab coordination.
- `SettingsTab`, `TodayTab`, `PlanTab`, `LogTab`, `NutritionTab`, and `CoachTab` each own one primary user job.
- Shared read models are derived from canonical app state and should stay reproducible and disposable.

For new work:

1. Add behavior behind the matching `src/domains/*` public boundary.
2. Keep one screen component as the state owner for that user-facing job.
3. Add or update that domain's primary deterministic test entrypoint before expanding e2e coverage.

## Service Audit

`src/services/` is large, but the dominant risk is not dozens of tiny wrappers. The biggest files are already domain-heavy:

- `intake-machine-service.js`
- `intake-goal-flow-service.js`
- `intake-completeness-service.js`
- `goal-feasibility-service.js`
- `brand-theme-service.js`
- `goal-management-service.js`
- `goal-resolution-service.js`
- `goal-progress-service.js`

The immediate cleanup here is boundary clarity, not a risky mega-merge. The stricter consolidation rule from this point forward is:

- No new root-level service file unless it expands an existing domain boundary or replaces multiple existing wrappers.
- Prefer growing a domain boundary or an existing domain service over adding another cross-cutting helper.
- If a new service is added, update the boundary manifest and the README architecture section in the same change.

## Source Vs Output

- Source lives in `src/`, `api/`, `scripts/`, `docs/`, `tests/`, and `e2e/`.
- Build output lives in `dist/`.
- Root-level generated bundles, backup patches, and one-off debris are blocked by repo hygiene checks.
