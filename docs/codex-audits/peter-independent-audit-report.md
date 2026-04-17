# Peter Independent Audit Report

Date: 2026-04-17

Scope: determine whether the current repo can credibly support this exact outcome stack by the end of 2026:

1. Bench press 225 lb
2. Run a half marathon in 1:45
3. Lose 15 lb
4. Reach visible abs / six-pack-level leanness

## Fixture and honesty boundary

This audit uses the deterministic Peter fixture in `src/services/audits/peter-audit-fixture.js`.

Key encoded assumptions:

- current bench anchor: `185 x 5`
- running anchor: `3 runs/week`, longest recent run `7 mi`, recent pace `8:55`
- current bodyweight: `185 lb`
- current waist proxy: `34 in`
- availability: `4 days/week`, `45 min`, gym access
- recovery: no active injury reported
- nutrition compliance: moderate, not perfect

These assumptions are explicit because the app cannot make honest year-end claims without them.

## Per-goal year-end verdicts

These verdicts come from the current plan-aware scorecard path:

- `src/services/audits/goal-pace-scorecard-service.js`
- `tests/goal-pace-scorecard-service.test.js`
- `src/services/audits/peter-plan-audit-service.js`
- `tests/peter-plan-audit-service.test.js`
- `docs/GOAL_PACE_SCORECARD_MODEL.md`

They are still estimates, not proof of attainment. The difference is that the scorecard now downgrades anchor-only optimism when the live 12-week block contradicts the required work.

| Goal | Verdict | Confidence | Major limiting factor |
| --- | --- | --- | --- |
| Bench press `225 lb` | `off_pace` | `medium` | The current 12-week block never surfaces a bench-specific session, so the planner is not dosing the work this target needs. |
| Half marathon `1:45:00` | `off_pace` | `medium` | The current 12-week block keeps the long run flat at `45-60 min` instead of progressing it toward race-supportive half-marathon volume. |
| Lose `15 lb` | `on_pace` | `low` | The requested loss rate is moderate, but the current 12-week block does not expose body composition as a visible planning lane. |
| Visible abs / six-pack leanness | `unknown` | `low` | The app lacks a direct physique verifier, and the current 12-week block does not expose an appearance-specific planning lane. |

## Answers

1. Does the app create a credible 12-week plan for Peter's goals?

No for the full four-goal stack.

Evidence:

- `docs/codex-audits/peter-12-week-plan-audit.md`
- `src/services/audits/peter-plan-audit-service.js`
- `tests/peter-plan-audit-service.test.js`

Why:

- the generated 12-week block keeps run frequency at 3 and quality density at 1, but the surfaced long run stays flat at `45-60 min`
- explicit bench-specific exposure count is `0`
- generic strength support appears only once per week
- the body-comp path exists mostly as implied nutrition/proxy support, not a hard operational lane

The audit artifact now flags `long_run_progression_flat`, `bench_specificity_missing`, `strength_exposure_sparse`, `lower_body_fatigue_conflict_unresolved`, and `body_comp_lane_not_explicit`. That is not strong enough to call the concurrent block credible for all four goals.

2. Does the app prove Peter is on pace for year-end goals, or only estimate that?

It only estimates pace, and the estimate is now plan-aware instead of anchor-only.

Evidence:

- `src/services/audits/goal-pace-scorecard-service.js`
- `tests/goal-pace-scorecard-service.test.js`
- `docs/GOAL_PACE_SCORECARD_MODEL.md`
- `src/services/audits/peter-plan-audit-service.js`
- `tests/peter-plan-audit-service.test.js`

Current scorecard behavior:

- bench: the anchor math alone looks plausible, but the current plan-aware verdict is `off_pace`
- half marathon: the anchors alone look plausible, but the current plan-aware verdict is `off_pace`
- lose 15 lb: the current plan-aware verdict is `on_pace` with low confidence
- visible abs: the current plan-aware verdict is `unknown`

That is the honest posture. The app can estimate year-end pace from anchors plus the current 12-week plan reality check, but it still does not prove the full year path.

3. What is the honest per-goal judgment today?

Bench `225 lb`: `off_pace` with `medium` confidence.
Evidence: `docs/codex-audits/peter-12-week-plan-audit.md`, `tests/goal-pace-scorecard-service.test.js`.
Why: the anchor gap is small enough to look plausible in isolation, but the live 12-week block never surfaces an explicit bench-specific session. One generic strength-support slot per week is not enough evidence to call this on pace under the current planner.

Half marathon `1:45:00`: `off_pace` with `medium` confidence.
Evidence: `docs/codex-audits/peter-12-week-plan-audit.md`, `tests/goal-pace-scorecard-service.test.js`.
Why: the current pace and 7-mile anchor create runway on paper, but the active 12-week block keeps the long run flat at `45-60 min`. That contradiction is too large to let the app honestly say the user is on pace.

Lose `15 lb`: `on_pace` with `low` confidence.
Evidence: `tests/goal-pace-scorecard-service.test.js`, `docs/codex-audits/peter-12-week-plan-audit.md`.
Why: `15 lb` over `37` weeks is only about `0.4 lb/week`, which is moderate, and the repo has first-class support for numeric weight-loss tracking and nutrition adaptation. Confidence stays low because the current block does not make body composition a visible planning emphasis and the run/strength goals still compete for recovery and adherence.

Visible abs / six-pack leanness: `unknown` with `low` confidence.
Evidence: `src/services/audits/goal-support-honesty-service.js`, `tests/goal-support-honesty-service.test.js`, `tests/goal-pace-scorecard-service.test.js`.
Why: this goal remains `loosely_approximated`. The app tracks proxies like waist and bodyweight, not a direct physique verifier, and the current plan does not expose an appearance-specific lane.

4. Do workout logs save reliably?

Partially.

Proven:

- local reload/reopen persistence and adaptation in `e2e/workout-adaptation-persistence.spec.js`
- blank-cloud sign-in promotion in `e2e/local-sync-trust.spec.js`

Not proven / currently limited:

- later sign-in to a populated cloud account does not perform a deterministic local-vs-cloud merge; the browser characterization in `e2e/local-sync-trust.spec.js` shows local-only workout logs are not merged into an existing cloud account

5. Do nutrition logs save reliably?

Partially.

Proven:

- local reload persistence plus future adaptation in `e2e/nutrition-underfueled-persistence.spec.js`
- blank-cloud sign-in promotion in `e2e/local-sync-trust.spec.js`

Disproven for one trust-critical path:

- `e2e/local-sync-trust.spec.js` now characterizes a signed-in degraded-sync reload gap: the pending-cloud marker survives, but the unsynced nutrition notes disappear after reload

That means the app cannot currently claim nutrition-log reliability across all reload/sync states.

6. Do saved logs materially adapt future planning?

Yes in the proven local/reload flows. Not across every sync boundary.

Evidence:

- workout adaptation proof in `e2e/workout-adaptation-persistence.spec.js`
- nutrition adaptation proof in `e2e/nutrition-underfueled-persistence.spec.js`
- weekly nutrition review logic in `src/services/weekly-nutrition-review-service.js`

What is proven:

- skipped key workouts can be carried forward
- repeated harder-than-expected sessions can cap the next exposure
- repeated under-fueled days can soften the next quality session

What is not fully proven:

- adaptation trust across degraded signed-in reloads, because the nutrition actual detail currently drops in that path

7. Are Today, Program, Log, Nutrition, and Coach consistent after those adaptations?

Yes in the proven local/reload scenarios. Not fully proven for the degraded-sync gap.

Evidence:

- `e2e/workout-adaptation-persistence.spec.js` checks Today, Program, Log, Nutrition, and Coach for workout-driven adaptations
- `e2e/nutrition-underfueled-persistence.spec.js` checks Today, Program, Nutrition, and Coach for nutrition-driven adaptations

These surfaces stay consistent when the underlying actuals survive. The degraded signed-in retry path remains a gap because one source of truth is currently lost on reload.

8. What is still unproven?

- the current 12-week planner is not concurrently credible for Peter's exact four-goal stack
- visible abs / six-pack support is only loosely approximated, not first-class operationalized support
- later sign-in to an already-populated cloud account does not have a deterministic merge policy for local-only workout data
- signed-in degraded-sync reload still has a nutrition-detail loss gap
- the year-end scorecard is an estimate model, not proof of attainment

## Support-tier honesty

Per-goal support honesty is now explicit in:

- `src/services/audits/goal-support-honesty-service.js`
- `tests/goal-support-honesty-service.test.js`

Current support classification for Peter:

- half marathon 1:45: `first_class_supported`
- bench 225: `first_class_supported`
- lose 15 lb: `first_class_supported`
- visible abs / six-pack leanness: `loosely_approximated`

That last classification is important. The repo should not market the appearance goal as equally operationalized with the performance and scale-weight goals.

## Exportable history artifact

The smallest user-facing audit export now lives in:

- `src/services/audits/plan-evolution-export-service.js`
- `tests/plan-evolution-export-service.test.js`
- `docs/PLAN_EVOLUTION_EXPORT_MODEL.md`

It is exposed from `Settings > Account & sync > Advanced recovery and destructive actions > Reviewer report`.

It renders saved day reviews and week reviews into a markdown report with:

- original prescription
- latest prescription
- actual log
- revision count
- week summaries
- why the plan changed
- inferred change drivers

This is useful for verifying that the app is showing plan evolution instead of rewriting history.

## Bottom line

The repo can now make a more honest claim than it could before this audit:

- it can estimate year-end pace from explicit anchors plus the current 12-week plan reality check
- it should currently judge `225 bench` as `off_pace`
- it should currently judge `1:45 half marathon` as `off_pace`
- it can currently judge `lose 15 lb` as `on_pace` but only with low confidence
- it should keep `visible abs` at `unknown`
- it can prove workout and nutrition adaptation in local/reload flows
- it can prove blank-cloud sign-in promotion
- it cannot honestly claim a concurrently credible 12-week Peter block yet
- it cannot honestly claim full trust across populated-cloud sign-in or degraded signed-in nutrition reloads

That is the current evidence-backed boundary.
