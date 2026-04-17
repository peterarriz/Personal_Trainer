# Peter Overnight Audit Notebook

Date: 2026-04-16
Last updated: 2026-04-17
Repo: `Personal_Trainer`
Scope: adversarial product audit and proof pass for one explicit outcome stack by end of 2026:

1. Bench press 225 lb
2. Run a half marathon in 1:45
3. Lose 15 lb
4. Reach visible abs / six-pack-level leanness

## Assumptions

- The user wants a repo-grounded audit, not optimistic product messaging.
- Work must stay inside this repository.
- The visible planner horizon is 12 weeks unless a separate deterministic model proves a longer horizon.
- Full-year attainment must not be inferred from the 12-week planner alone.
- Appearance outcomes must not be treated as equally precise with race times or scale-weight targets.

### Canonical Peter fixture assumptions

- Current bench anchor: `185 x 5`
- Running anchor: `3 runs/week`, longest recent run `7 mi`, recent pace `8:55`
- Current bodyweight: `185 lb`
- Current waist proxy: `34 in`
- Availability: `4 days/week`, `45 min`, gym access
- Recovery: no active injury reported
- Nutrition compliance: moderate

Fixture source:

- `src/services/audits/peter-audit-fixture.js`

## System Map

### Goal interpretation

- `src/services/goal-resolution-service.js`
- `src/services/goal-capability-resolution-service.js`
- `src/services/goal-arbitration-service.js`
- `src/services/canonical-athlete-service.js`

### Feasibility / support honesty / year-end pace

- `src/services/goal-feasibility-service.js`
- `src/services/support-tier-service.js`
- `src/services/goal-progress-service.js`
- `src/services/audits/goal-support-honesty-service.js`
- `src/services/audits/goal-pace-scorecard-service.js`

### 12-week planning / adaptation

- `src/modules-planning.js`
- `src/services/program-live-planning-service.js`
- `src/services/dynamic-adaptation-service.js`
- `src/services/audits/peter-plan-audit-service.js`
- `docs/DYNAMIC_PLAN_ENGINE_AND_ADAPTATION_SPEC.md`

### Workout logging / history / export

- `src/services/workout-log-form-service.js`
- `src/services/history-audit-service.js`
- `src/services/day-review-service.js`
- `src/services/prescribed-day-history-service.js`
- `src/services/audits/plan-evolution-export-service.js`

### Nutrition logging / review / adaptation

- `src/services/weekly-nutrition-review-service.js`
- `src/services/nutrition-day-taxonomy-service.js`
- `src/modules-nutrition.js`

### Persistence / sync / local-first trust

- `src/modules-auth-storage.js`
- `src/services/persistence-adapter-service.js`
- `src/services/persistence-contract-service.js`
- `src/services/sync-state-service.js`
- `src/trainer-dashboard.jsx`

### Cross-surface rendering / consistency

- `src/trainer-dashboard.jsx`
- `e2e/workout-adaptation-persistence.spec.js`
- `e2e/nutrition-underfueled-persistence.spec.js`
- `e2e/local-sync-trust.spec.js`

## Trusted / Partially Trusted / Unproven Matrix

| Claim | Status | Current evidence | Current gap |
| --- | --- | --- | --- |
| Goal interpretation is deterministic for Peter's stack | Partially trusted | `tests/goal-resolution-service.test.js` now protects Peter-style running + strength + body-comp + appearance mixes | Still depends on explicit fixture assumptions |
| Per-goal support honesty exists | Trusted | `tests/goal-support-honesty-service.test.js` keeps visible abs out of first-class support | Does not make the underlying appearance path stronger |
| Year-end pace can be answered honestly | Partially trusted | `tests/goal-pace-scorecard-service.test.js` now proves a plan-aware scorecard that downgrades bench and half-marathon optimism when the live 12-week block contradicts the required work | Still an estimate model, not proof of attainment |
| 12-week planner exists | Trusted | existing planner/adaptation tests plus `tests/peter-plan-audit-service.test.js` | Peter audit says the concurrent block is not credible enough yet |
| Workout logs persist across local reload/reopen | Trusted | `e2e/workout-adaptation-persistence.spec.js` | Populated-cloud sign-in merge is still not supported |
| Nutrition logs persist across local reload/reopen | Trusted | `e2e/nutrition-underfueled-persistence.spec.js` | Signed-in degraded-sync reload still loses unsynced nutrition detail |
| Saved logs materially adapt future planning | Partially trusted | local workout + nutrition browser proofs plus same-device blank-cloud sign-in proofs | Trust boundary weak once signed-in degraded sync or cloud-only restore enters the path |
| History is inspectable instead of silently rewritten | Partially trusted | history review services + `tests/plan-evolution-export-service.test.js` + `docs/PLAN_EVOLUTION_EXPORT_MODEL.md` | Export depends on provenance quality already being present |
| Visible abs / six-pack support is first-class | Unproven | honesty audit explicitly downgrades it | currently only loosely approximated |

## Persistence / Adaptation Trust Matrix

| Claim | Status | Independent evidence | Current gap |
| --- | --- | --- | --- |
| Workout logs persist across local reload/reopen | Proven | `e2e/workout-adaptation-persistence.spec.js` | Does not cover populated-cloud merge |
| Nutrition logs persist across local reload/reopen | Proven | `e2e/nutrition-underfueled-persistence.spec.js` | Does not cover signed-in degraded retry |
| Workout logs materially adapt future planning after local reload/reopen | Proven | `e2e/workout-adaptation-persistence.spec.js` | Signed-in degraded recovery still not proven |
| Nutrition logs materially adapt future planning after local reload/reopen | Proven | `e2e/nutrition-underfueled-persistence.spec.js` | Signed-in degraded retry still not proven |
| Today / Program / Log / Nutrition / Coach stay consistent after local workout adaptation | Proven | `e2e/workout-adaptation-persistence.spec.js` | None in local path |
| Today / Program / Log / Nutrition / Coach stay consistent after local nutrition adaptation | Proven | `e2e/nutrition-underfueled-persistence.spec.js` | None in local path |
| Blank-cloud sign-in preserves workout adaptation on a same-device signed-in reopen | Proven | `e2e/signed-in-adaptation-trust.spec.js` | Uses device cache on reopen, not cloud-only restore |
| Blank-cloud sign-in preserves nutrition adaptation on a same-device signed-in reopen | Proven | `e2e/signed-in-adaptation-trust.spec.js` | Uses device cache on reopen, not cloud-only restore |
| Blank-cloud sign-in promotes local workout and nutrition logs into an empty cloud account | Proven | `e2e/local-sync-trust.spec.js` | Does not prove later auth-only restore without the device cache |
| Blank-cloud sign-in enables a cloud-only reopen without the device cache | Not proven | `e2e/signed-in-adaptation-trust.spec.js` characterizes current behavior | Current browser flow lands in intake instead of proving cloud-backed restore |
| Populated-cloud sign-in merges local-only workout logs safely | Not proven | `e2e/local-sync-trust.spec.js` characterizes no-merge behavior | No deterministic merge policy exists yet |
| Signed-in degraded-sync reload preserves unsynced nutrition detail | Not proven | `e2e/local-sync-trust.spec.js` characterizes note loss while pending marker survives | Browser/runtime gap remains |
| Signed-in degraded-sync reopen preserves unsynced workout detail | Not proven | `e2e/signed-in-adaptation-trust.spec.js` characterizes workout-note loss while pending marker survives | Browser/runtime gap remains |
| Degraded sync recovery avoids duplicate adaptation after data survives | Unproven | auth-storage replay tests prove the storage seam only | Browser path still loses user-visible detail before this can be proven end-to-end |
| Auth storage can replay newer pending local workout/nutrition data into stale cloud rows | Proven at service seam | `tests/auth-storage-local-authority.test.js` | Browser/runtime still has higher-level gaps |

## Files Read

- `docs/DYNAMIC_PLAN_ENGINE_AND_ADAPTATION_SPEC.md`
- `docs/PERSISTENCE_CONTRACT.md`
- `docs/WORKOUT_SOURCE_OF_TRUTH_CONTRACT.md`
- `docs/PLANNING_SOURCE_OF_TRUTH_OVERVIEW.md`
- `docs/NUTRITION_DAILY_AND_WEEKLY_EXECUTION_FINAL_SPEC.md`
- `docs/WEEKLY_NUTRITION_REVIEW_MODEL.md`
- `docs/PROVENANCE_MODEL.md`
- `docs/PLAN_WEEK_PERSISTENCE_MODEL.md`
- `docs/ADVERSARIAL_USER_TEST_MATRIX_AND_RELEASE_GATE.md`
- `docs/SYNTHETIC_ATHLETE_LAB_SPEC.md`
- `docs/CANONICAL_METRICS_AND_BASELINES_SPEC.md`
- `docs/ARCHITECTURE_MAP.md`
- `docs/AUTH_AND_SUPABASE_RELIABILITY_SPEC.md`
- `tests/goal-feasibility-service.test.js`
- `tests/support-tier-service.test.js`
- `tests/goal-progress-service.test.js`
- `tests/goal-resolution-service.test.js`
- `tests/history-audit-service.test.js`
- `tests/goals-sync-contract.test.js`
- `tests/sync-state-service.test.js`
- `e2e/workout-adaptation-persistence.spec.js`
- `e2e/nutrition-underfueled-persistence.spec.js`
- `e2e/local-sync-trust.spec.js`
- `e2e/signed-in-adaptation-trust.spec.js`
- `e2e/sync-state.spec.js`
- `e2e/auth-and-management.spec.js`
- `e2e/auth-runtime-test-helpers.js`
- `tests/auth-storage-local-authority.test.js`
- `src/modules-auth-storage.js`
- `src/trainer-dashboard.jsx`
- `src/services/history-audit-service.js`
- `src/services/day-review-service.js`
- `src/services/persistence-adapter-service.js`
- `src/services/goal-resolution-service.js`
- `src/services/audits/peter-audit-fixture.js`
- `src/services/audits/goal-support-honesty-service.js`
- `src/services/audits/goal-pace-scorecard-service.js`
- `src/services/audits/peter-plan-audit-service.js`
- `src/services/audits/nutrition-compatibility-audit-service.js`
- `src/services/goal-resolution/structured-goal-resolution-service.js`
- `src/services/intake-completeness-service.js`
- `src/services/intake-machine-service.js`
- `src/data/goal-intents/index.js`
- `src/data/plan-archetypes/physique.js`
- `docs/codex-audits/peter-independent-audit-report.md`
- `docs/codex-audits/peter-12-week-plan-audit.md`
- `docs/GOAL_PACE_SCORECARD_MODEL.md`
- `tests/goal-pace-scorecard-service.test.js`
- `tests/peter-plan-audit-service.test.js`
- `tests/nutrition-compatibility-audit-service.test.js`
- `tests/intake-completeness-service.test.js`
- `tests/benchmarks/plan-quality-benchmark.test.js`

## Commands Run

- `Get-ChildItem -Recurse docs,tests,e2e,src\\services,src | Select-Object FullName`
- `Get-Content docs\\DYNAMIC_PLAN_ENGINE_AND_ADAPTATION_SPEC.md -TotalCount 260`
- `Get-Content docs\\PERSISTENCE_CONTRACT.md -TotalCount 260`
- `Get-Content docs\\WORKOUT_SOURCE_OF_TRUTH_CONTRACT.md -TotalCount 260`
- `Get-Content docs\\PLANNING_SOURCE_OF_TRUTH_OVERVIEW.md -TotalCount 260`
- `Get-Content docs\\NUTRITION_DAILY_AND_WEEKLY_EXECUTION_FINAL_SPEC.md -TotalCount 260`
- `Get-Content docs\\WEEKLY_NUTRITION_REVIEW_MODEL.md -TotalCount 260`
- `Get-Content docs\\PROVENANCE_MODEL.md -TotalCount 260`
- `Get-Content docs\\PLAN_WEEK_PERSISTENCE_MODEL.md -TotalCount 260`
- `Get-Content docs\\ADVERSARIAL_USER_TEST_MATRIX_AND_RELEASE_GATE.md -TotalCount 260`
- `Get-Content docs\\SYNTHETIC_ATHLETE_LAB_SPEC.md -TotalCount 260`
- `Get-Content docs\\CANONICAL_METRICS_AND_BASELINES_SPEC.md -TotalCount 260`
- `Get-Content docs\\ARCHITECTURE_MAP.md -TotalCount 220`
- `Get-Content docs\\AUTH_AND_SUPABASE_RELIABILITY_SPEC.md -TotalCount 220`
- `rg -n "visible abs|six pack|six-pack|body comp|appearance|support tier|pace verdict|deadline" docs tests src e2e`
- `rg -n "trainer_local_cache_v4|trainer_auth_session_v1|merge|sign in later|reload|retrying|local copy" src e2e tests docs`
- `Get-Content src\\modules-auth-storage.js -TotalCount 360`
- `Get-Content src\\modules-auth-storage.js | Select-Object -Skip 320 -First 520`
- `Get-Content src\\modules-auth-storage.js | Select-Object -Skip 900 -First 180`
- `Get-Content src\\trainer-dashboard.jsx | Select-Object -Skip 6460 -First 460`
- inline `node` probes for combined goal resolution and 12-week Peter plan generation
- `node -r sucrase/register --test tests/goal-resolution-service.test.js`
- `node -r sucrase/register --test tests/goal-support-honesty-service.test.js`
- `node -r sucrase/register --test tests/goal-pace-scorecard-service.test.js`
- `node -r sucrase/register --test tests/peter-plan-audit-service.test.js`
- `node -r sucrase/register --test tests/auth-storage-local-authority.test.js`
- `node -r sucrase/register --test tests/auth-storage-local-authority.test.js`
- `Get-Content docs\\codex-audits\\peter-overnight-audit.md -TotalCount 400`
- `Get-Content e2e\\signed-in-adaptation-trust.spec.js -TotalCount 400`
- `Get-Content e2e\\nutrition-underfueled-persistence.spec.js -TotalCount 260`
- `Get-Content tests\\auth-storage-local-authority.test.js -TotalCount 260`
- `rg -n "test\\(" e2e\\signed-in-adaptation-trust.spec.js e2e\\workout-adaptation-persistence.spec.js e2e\\nutrition-underfueled-persistence.spec.js e2e\\local-sync-trust.spec.js`
- `rg -n "test\\(" tests\\auth-storage-local-authority.test.js`
- `node -r sucrase/register --test tests/plan-evolution-export-service.test.js tests/auth-storage-local-authority.test.js tests/goal-resolution-service.test.js tests/goal-support-honesty-service.test.js tests/goal-pace-scorecard-service.test.js tests/peter-plan-audit-service.test.js`
- `cmd /c npx playwright test e2e/local-sync-trust.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/workout-adaptation-persistence.spec.js e2e/nutrition-underfueled-persistence.spec.js e2e/local-sync-trust.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/signed-in-adaptation-trust.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/signed-in-adaptation-trust.spec.js e2e/nutrition-underfueled-persistence.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/workout-adaptation-persistence.spec.js e2e/nutrition-underfueled-persistence.spec.js e2e/local-sync-trust.spec.js e2e/signed-in-adaptation-trust.spec.js --reporter=line`
- `Get-Content docs\\codex-audits\\peter-independent-audit-report.md -TotalCount 400`
- `Get-Content docs\\codex-audits\\peter-12-week-plan-audit.md -TotalCount 400`
- `Get-Content src\\services\\audits\\goal-pace-scorecard-service.js -TotalCount 400`
- `Get-Content tests\\goal-pace-scorecard-service.test.js -TotalCount 400`
- `Get-Content src\\services\\audits\\peter-plan-audit-service.js -TotalCount 420`
- `Get-Content tests\\peter-plan-audit-service.test.js -TotalCount 320`
- `Get-Content src\\services\\audits\\peter-audit-fixture.js -TotalCount 320`
- `Get-Content docs\\GOAL_PACE_SCORECARD_MODEL.md -TotalCount 260`
- `node -r sucrase/register --test tests/peter-plan-audit-service.test.js tests/goal-pace-scorecard-service.test.js`
- inline `node -r sucrase/register` probe for Peter plan risks and plan-aware year-end verdicts
- `rg -n "get_leaner|lose_body_fat|requiredAnchors|body fat" src/data src/services tests`
- `Get-Content src\\services\\goal-resolution\\structured-goal-resolution-service.js`
- `Get-Content src\\data\\goal-intents\\index.js`
- `Get-Content src\\data\\plan-archetypes\\physique.js | Select-Object -Skip 200 -First 60`
- `Get-Content src\\services\\intake-completeness-service.js | Select-Object -Skip 1 -First 260`
- `Get-Content src\\services\\intake-machine-service.js | Select-Object -Skip 760 -First 200`
- `Get-Content tests\\goal-resolution-service.test.js`
- `Get-Content tests\\benchmarks\\plan-quality-benchmark.test.js`
- `Get-Content src\\modules-nutrition.js`
- `Get-Content src\\services\\weekly-nutrition-review-service.js`
- `Get-Content src\\services\\nutrition-day-taxonomy-service.js`
- `Get-Content docs\\NUTRITION_DAILY_AND_WEEKLY_EXECUTION_FINAL_SPEC.md`
- `Get-Content src\\services\\audits\\peter-plan-audit-service.js`
- `Get-Content tests\\peter-plan-audit-service.test.js`
- `Get-Content src\\services\\audits\\peter-audit-fixture.js`
- `Get-Content tests\\nutrition-review.test.js`
- `Get-Content src\\services\\plan-day-service.js`
- `Get-Content src\\services\\prescribed-day-history-service.js`
- `node -r sucrase/register --test tests/goal-resolution-service.test.js tests/intake-completeness-service.test.js tests/support-tier-service.test.js tests/goal-support-honesty-service.test.js tests/benchmarks/plan-quality-benchmark.test.js`
- inline `node -r sucrase/register` probes for `have six pack by August`, `visible abs by August`, and `body fat under 12%`
- `rg -n "nutrition|hydration|calorie|carb|protein|fat|hardSession|strengthSession|recoverySession|run_quality|run_long|nutrition audit|weekly review" src tests docs`
- `rg -n "applyGoalNutritionTargets|hydrationTargetOz|targetChangeSummary|reason line|nutritionLayer|nutrition prescription" src/modules-nutrition.js src/trainer-dashboard.jsx src/modules-planning.js`
- inline `node -r sucrase/register` probe of `composeGoalNativePlan` day templates for Peter week 1
- inline `node -r sucrase/register` probe of `deriveAdaptiveNutrition` for Peter recovery / strength / hard-run / long-run targets
- `node -r sucrase/register --test tests/nutrition-compatibility-audit-service.test.js tests/weekly-nutrition-review.test.js tests/nutrition-review.test.js`
- inline `node -r sucrase/register` render probe for `buildPeterNutritionCompatibilityAudit()`
- Final narrow rerun status:
  - `node -r sucrase/register --test tests/auth-storage-local-authority.test.js` -> 3 passing tests
  - `cmd /c npx playwright test e2e/workout-adaptation-persistence.spec.js e2e/nutrition-underfueled-persistence.spec.js e2e/local-sync-trust.spec.js e2e/signed-in-adaptation-trust.spec.js --reporter=line` -> 10 passing tests
  - `node -r sucrase/register --test tests/goal-resolution-service.test.js tests/intake-completeness-service.test.js tests/support-tier-service.test.js tests/goal-support-honesty-service.test.js tests/benchmarks/plan-quality-benchmark.test.js` -> 75 passing tests
  - `node -r sucrase/register --test tests/nutrition-compatibility-audit-service.test.js tests/weekly-nutrition-review.test.js tests/nutrition-review.test.js` -> 11 passing tests

## Failing Tests Observed During Audit

- Initial exploratory runs of `e2e/local-sync-trust.spec.js` exposed a real degraded-sync trust gap:
  - blank-cloud and populated-cloud sign-in cases were fixable/testable
  - signed-in reload during retry kept a pending-sync marker but lost unsynced nutrition detail
- That gap is now kept as an explicit characterization in `e2e/local-sync-trust.spec.js` instead of a hidden manual note
- Initial exploratory runs of `e2e/signed-in-adaptation-trust.spec.js` showed cloud-only reopen and signed-in degraded workout reopen could not be honestly proven.
- Those paths are now explicit characterization tests instead of silent assumptions.

## Passing Tests

- `node -r sucrase/register --test tests/goal-resolution-service.test.js`
- `node -r sucrase/register --test tests/goal-support-honesty-service.test.js`
- `node -r sucrase/register --test tests/goal-pace-scorecard-service.test.js`
- `node -r sucrase/register --test tests/peter-plan-audit-service.test.js`
- `node -r sucrase/register --test tests/auth-storage-local-authority.test.js`
- `node -r sucrase/register --test tests/plan-evolution-export-service.test.js tests/auth-storage-local-authority.test.js tests/goal-resolution-service.test.js tests/goal-support-honesty-service.test.js tests/goal-pace-scorecard-service.test.js tests/peter-plan-audit-service.test.js`
- `cmd /c npx playwright test e2e/workout-adaptation-persistence.spec.js e2e/nutrition-underfueled-persistence.spec.js e2e/local-sync-trust.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/signed-in-adaptation-trust.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/workout-adaptation-persistence.spec.js e2e/nutrition-underfueled-persistence.spec.js e2e/local-sync-trust.spec.js e2e/signed-in-adaptation-trust.spec.js --reporter=line`
- `node -r sucrase/register --test tests/peter-plan-audit-service.test.js tests/goal-pace-scorecard-service.test.js`

## Evidence Gathered

- Combined mixed-goal resolution needed tightening. The repo now has deterministic coverage that keeps running, strength, weight, and appearance goals visible together.
- Peter now has an explicit deterministic fixture instead of an implied persona.
- Support honesty is explicit per goal:
  - half marathon: first-class
  - bench 225: first-class
  - lose 15 lb: first-class
  - visible abs: loosely approximated
- Year-end pace scoring exists now, but it is an estimate model, not proof. Visible abs stays `unknown`.
- Year-end pace scoring is now stricter:
  - anchor math alone no longer gets the final word when the current 12-week block contradicts the required work
  - Peter's current plan-aware verdicts are `off_pace` for `225 bench`, `off_pace` for `1:45 half marathon`, `on_pace` with low confidence for `lose 15 lb`, and `unknown` for `visible abs`
- The Peter 12-week audit does not support a confident yes:
  - long run progression is effectively flat in the surfaced plan
  - explicit bench exposures are missing
  - strength frequency is too sparse for a strong concurrent claim
- The 12-week audit now makes the body-comp weakness explicit too:
  - `body_comp_lane_not_explicit` captures that the block stays running-led with strength support instead of exposing a visible body-composition lane
- Workout adaptation and nutrition adaptation are proven across local reload/reopen flows and remain cross-surface consistent there.
- Workout adaptation and nutrition adaptation are now also proven across blank-cloud sign-in when the same device reopens with its signed-in local cache.
- The local-to-signed-in trust picture is now split cleanly into:
  - proven blank-cloud promotion into cloud
  - proven same-device signed-in reopen using the signed-in local cache
  - not-proven cloud-only restore without the device cache
- Blank-cloud sign-in promotion is proven:
  - local workout and nutrition logs survive later sign-in when the cloud account is empty
- Blank-cloud sign-in cloud-only reopen is not independently proven:
  - auth-only reopen currently falls back to intake instead of proving cloud-backed restore
- Populated-cloud sign-in merge is not supported:
  - local-only workout logs are not deterministically merged into an already-populated cloud account
- Signed-in degraded-sync reload still has a real trust gap:
  - the pending-cloud marker remains
  - unsynced nutrition detail drops on reload
- Signed-in degraded-sync workout reopen has a similar trust gap:
  - the pending-cloud marker remains
  - the unsynced workout note disappears on reopen
- Service-level replay protection is stronger than the browser/runtime path:
  - `tests/auth-storage-local-authority.test.js` proves pending local workout and nutrition data can be replayed into stale cloud rows at the auth-storage seam
- Local nutrition adaptation proof now explicitly checks the Log surface too:
  - Today / Program / Log / Nutrition / Coach show the same reason line after under-fueling adaptation
- A QA-facing plan-evolution export now exists so reviewers can inspect original vs revised prescription instead of trusting surface summaries.
- A concise persistence/adaptation proof sheet now exists:
  - `docs/codex-audits/peter-persistence-adaptation-proof.md` separates browser-proven claims, service-seam-only claims, and explicitly unproven trust paths
- Appearance-language honesty is tighter now:
  - `six pack` and `visible abs` resolve into the appearance/body-comp lane with proxy metrics, but they no longer get `high` confidence without a saved bodyweight or waist anchor
  - `body fat under X%` stays in the appearance/body-comp lane and now explicitly asks for a repeatable proxy or a reliable body-fat method instead of acting like a direct verifier exists
- Mixed physique-plus-strength phrasing is better characterized now:
  - `body fat under 10% and bench 225` keeps the bench metric and 225-lb planning target intact instead of corrupting the lift benchmark
- Benchmark coverage now explicitly includes:
  - `get a six pack`
  - `get visible abs`
  - `body fat under 12%`
- A concise phrase-handling artifact now exists:
  - `docs/codex-audits/appearance-language-support-audit.md`
- A deterministic nutrition-target audit now exists:
  - `docs/codex-audits/peter-nutrition-target-audit.md`
  - `src/services/audits/nutrition-compatibility-audit-service.js`
- The current Peter nutrition targets are mostly internally coherent on macro ordering:
  - hard run `2700 / 305c / 190p / 65f`
  - long run `2900 / 345c / 190p / 67f`
  - strength `2500 / 225c / 200p / 69f`
  - recovery `2210 / 175c / 185p / 69f`
- The nutrition audit does not find a hard macro contradiction for moderate cut + performance retention in those representative days.
- The main nutrition proof gaps are now explicit:
  - high-demand hydration is not stored in the prescription layer and is only inferred later in the Nutrition tab
  - `moderate cut` is still inferred from day-to-day calorie separation rather than persisted as a first-class maintenance / deficit model
- The audit also now has deterministic execution-pattern coverage for:
  - repeated under-fueling on the day before hard or long runs

## Open Risks

- The current 12-week Peter block is not concurrently credible enough to support a strong yes for the full goal stack.
- Visible abs / six-pack support is still only loosely approximated.
- Weight loss is still the only goal in the stack that looks on-pace today, and even that is low-confidence because the block does not expose body composition as a visible planning emphasis.
- Populated-cloud sign-in still lacks a deterministic local-vs-cloud merge contract for local-only workout data.
- Signed-in degraded-sync reload still loses unsynced nutrition detail.
- Signed-in degraded-sync reopen still loses the unsynced workout note.
- Cloud-only reopen after blank-cloud sign-in is still not independently proven.
- Duplicate-adaptation protection after a degraded signed-in recovery is still only proven at the auth-storage seam, not through the full browser path.
- The year-end scorecard is honest, but it should not be mistaken for proof of goal attainment.
- Visible-abs and body-fat percentage support is still proxy-based:
  - the app can now ask for better anchors more honestly, but it still cannot directly verify a six-pack or a true body-fat percentage target
- Mixed physique-plus-strength summaries still lean generic on the secondary strength goal:
  - the 225-lb bench target is preserved in metrics and planning text, but the visible summary still uses maintenance phrasing rather than echoing the exact lift target
- Nutrition hydration proof is still weaker than macro proof:
  - the audit can show what the UI would suggest for hydration, but the saved prescription still does not persist a hard-day hydration target
- Nutrition cut-mode proof is still relative:
  - the audit can show recovery calories drop below hard and long-run calories, but it still cannot point to a persisted maintenance estimate or weekly deficit target

## Next Smallest Step

- If product work continues past this audit, the highest-value trust fixes are:
- prove cloud-only restore after blank-cloud sign-in
- stop signed-in degraded reopen from dropping unsynced workout/nutrition detail
- define an explicit merge policy for local-only data when signing into a populated cloud account
- once degraded signed-in reload preserves the mutation detail, add one browser proof for retry recovery without duplicate adaptation
- if planner work continues, the highest-value realism fixes are explicit bench exposures, long-run progression that actually surfaces in the generated block, and a visible body-comp lane for concurrent run-plus-cut users
- if physique-language work continues, the next smallest honesty improvements are:
- add a first-class saved body-fat-method field instead of only mentioning it in unresolved gaps
- surface the exact chosen proxy anchor more explicitly in the visible goal summary once the user has saved it
- if nutrition-proof work continues, the next smallest trust improvements are:
- persist explicit hydration targets into the nutrition prescription layer for hard and long-run days
- store a first-class maintenance estimate or weekly deficit posture so `moderate cut` is proven instead of inferred

## 2026-04-17 Planner Tradeoff Honesty Pass

### Assumptions

- The critical concurrent stack for honesty is `running + strength + body_comp`, represented here by `Run a 1:45 half marathon`, `Bench 225`, and `Lose 15 lb`.
- The smallest safe place to harden explanation text is the shared `ProgramBlock -> WeeklyIntent` planner chain, because Program surfaces already read from those objects.
- A small Program-surface addition is acceptable if it only reveals planner state that already exists and does not redesign the page.

### Files Read

- `src/modules-planning.js`
- `src/trainer-dashboard.jsx`
- `tests/program-block-model.test.js`
- `tests/dynamic-plan-engine.test.js`

### Commands Run

- `rg -n "priorit|held back|tradeoff|maintain|maintenance|subordinate|supportive|interference|coachSummary|planFocus|weeklyIntent|focusSummary|explanation" src/modules-planning.js src/services tests`
- `Get-Content tests/program-block-model.test.js | Select-Object -First 340`
- `Get-Content tests/dynamic-plan-engine.test.js | Select-Object -First 360`
- inline `node -r sucrase/register` probes against `composeGoalNativePlan()` and `buildPlanWeek()` for the exact `running + bench + cut` stack
- `node -r sucrase/register --test tests/program-block-model.test.js tests/dynamic-plan-engine.test.js`
- `node -r sucrase/register --test tests/peter-plan-audit-service.test.js tests/goal-pace-scorecard-service.test.js`
- `cmd /c npm run build`

### Passing Tests

- `node -r sucrase/register --test tests/program-block-model.test.js tests/dynamic-plan-engine.test.js`
- `node -r sucrase/register --test tests/peter-plan-audit-service.test.js tests/goal-pace-scorecard-service.test.js`
- `cmd /c npm run build`

### Evidence Gathered

- Before the patch, the planner exposed `prioritized`, `maintained`, and `tradeoffs`, but the visible summary still let the concurrent `half marathon + bench + cut` block read as generic maintenance language.
- The shared planner now emits an explicit deterministic contract for this stack:
  - `Prioritized: Race prep gets the cleanest fatigue and scheduling windows.`
  - `Held back: Bench 225 stays in maintenance territory, not a maximal bench-progression push. Lose 15 lb stays moderate and recovery-compatible, not an aggressive cut.`
  - `Why: the app cannot honestly promise maximal bench progress, maximal race improvement, and maximal fat loss in the same block.`
- That contract now flows through:
  - `programBlock.summary`
  - `blockIntent`
  - `weeklyIntent.rationale`
  - the Program surface goal-allocation card via new `Held back` and `Why` lines
- The new coverage proves the app no longer leaves this exact three-goal stack to implication alone.

### Open Risks

- This improves explanation honesty; it does not fix the underlying realism gaps already documented for Peter's 12-week block.
- The current block is still not concurrently credible enough to call `225 bench + 1:45 HM + visible abs` proven.
- The exact visible explanation is strongest on the Program/planner path; other surfaces may still summarize the same state more compactly rather than repeating the full contract verbatim.

### Next Smallest Step

- If planner realism work continues, connect the new honesty contract to the underlying allocation more tightly by:
  - surfacing explicit bench-specific exposures when bench is active but held back
  - surfacing an explicit moderate-cut lane when fat loss is active but constrained by race prep

## 2026-04-17 Local-First To Signed-In Integrity Pass

### Assumptions

- The strongest fully browser-provable trust path is still the same-device path with a blank cloud account at sign-in time.
- The new proof should compare exact user mutations, not just banners or summary text.
- The exact fields worth protecting here are:
  - workout note
  - workout status
  - nutrition note
  - nutrition deviation kind
  - nutrition issue

### Files Read

- `e2e/local-sync-trust.spec.js`
- `e2e/signed-in-adaptation-trust.spec.js`
- `docs/codex-audits/peter-persistence-adaptation-proof.md`

### Commands Run

- `Get-Content e2e/local-sync-trust.spec.js | Select-Object -First 340`
- `Get-Content e2e/signed-in-adaptation-trust.spec.js | Select-Object -First 360`
- `Get-Content docs/codex-audits/peter-persistence-adaptation-proof.md | Select-Object -First 260`
- `cmd /c npx playwright test e2e/signed-in-adaptation-trust.spec.js -g "blank-cloud sign-in preserves exact local workout and nutrition logs without loss, duplication, or reinterpretation" --reporter=line`
- `cmd /c npx playwright test e2e/signed-in-adaptation-trust.spec.js --reporter=line`

### Passing Tests

- `cmd /c npx playwright test e2e/signed-in-adaptation-trust.spec.js -g "blank-cloud sign-in preserves exact local workout and nutrition logs without loss, duplication, or reinterpretation" --reporter=line`
- `cmd /c npx playwright test e2e/signed-in-adaptation-trust.spec.js --reporter=line`

### Evidence Gathered

- There is now one combined same-device browser proof that starts signed out, logs both workout and nutrition mutations, signs in later, and then reopens signed in.
- The new proof compares exact mutation snapshots before sign-in, after cloud promotion, and after signed-in reopen.
- The proven exact-preservation set is:
  - workout date `2026-04-16`
  - workout note preserved exactly
  - workout status stays `skipped`
  - nutrition dates `2026-04-13`, `2026-04-14`, `2026-04-15`
  - nutrition notes preserved exactly
  - nutrition deviation kind stays `under_fueled`
  - nutrition issue stays `hunger`
- The new browser proof is stronger than the older blank-cloud promotion check because it verifies:
  - no loss
  - no reinterpretation of the saved mutation fields
  - no duplicate relevant nutrition entries inside the persisted user data object
- A focused guarantee artifact now exists:
  - `docs/codex-audits/local-first-vs-signed-in-guarantees.md`

### Open Risks

- This still does not prove cloud-only restore after sign-in.
- This still does not prove populated-cloud merge.
- This still does not close the degraded-sync gaps already characterized elsewhere in the notebook.

### Next Smallest Step

- If trust work continues, the next highest-value proof is still:
  - a real cloud-only restore pass after blank-cloud sign-in
  - then a deterministic merge contract for populated-cloud sign-in

## 2026-04-17 Sync Degradation Recovery Pass

### Assumptions

- The product currently exposes one explicit signed-in recovery action, `Reload cloud data`, and there is no separate browser-proven autonomous retry completion path.
- If the browser/runtime layer still loses data during explicit recovery, that gap should be characterized plainly instead of being papered over with storage-seam success.
- The highest-signal recovery seam to test deterministically is `sbLoad()` with a newer pending local cache.

### Files Read

- `src/modules-auth-storage.js`
- `src/services/persistence-adapter-service.js`
- `e2e/signed-in-adaptation-trust.spec.js`
- `docs/codex-audits/local-first-vs-signed-in-guarantees.md`

### Commands Run

- `rg -n "pendingCloudWrite|syncMeta|sbLoad|pending local|replay|reconcile|retry|outage|degraded|trainer_data|persistAll|cloud write|sync" src tests e2e docs/codex-audits`
- `Get-Content src/modules-auth-storage.js | Select-Object -First 420`
- `Get-Content src/modules-auth-storage.js | Select-Object -Skip 900 -First 160`
- `Get-Content src/services/persistence-adapter-service.js | Select-Object -First 320`
- `Get-Content e2e/signed-in-adaptation-trust.spec.js | Select-Object -First 360`
- `cmd /c npx playwright test e2e/signed-in-adaptation-trust.spec.js -g "retrying .*" --reporter=line`
- `node -r sucrase/register --test tests/auth-storage-local-authority.test.js`
- `cmd /c npx playwright test e2e/signed-in-adaptation-trust.spec.js --reporter=line`

### Passing Tests

- `cmd /c npx playwright test e2e/signed-in-adaptation-trust.spec.js -g "retrying .*" --reporter=line`
- `node -r sucrase/register --test tests/auth-storage-local-authority.test.js`
- `cmd /c npx playwright test e2e/signed-in-adaptation-trust.spec.js --reporter=line`

### Evidence Gathered

- The signed-in degraded-sync browser layer now has stronger characterization than a status-banner check:
  - workout logs created during retry/outage are present in the local cache before recovery
  - nutrition logs created during retry/outage are present in the local cache before recovery
  - after the explicit recovery action `Reload cloud data`, the pending marker clears
  - but the unsynced workout and nutrition detail still disappears in the browser/runtime path
- This means the explicit recovery control is not yet a trustworthy product-level reconciliation path for these logs, even though the sync banner can turn healthy again.
- The storage seam is stronger than the browser layer:
  - `sbLoad()` can keep a newer pending local cache through one failed replay
  - once the cloud path recovers, the next `sbLoad()` can replay that cache
  - a second identical `sbLoad()` does not replay the same payload again
- A dedicated recovery artifact now exists:
  - `docs/codex-audits/sync-degradation-recovery-proof.md`

### Open Risks

- Browser/runtime recovery after retry/outage is still not trustworthy for workout or nutrition detail.
- Because the user-visible detail is lost in that browser path, duplicate future adaptation after degraded signed-in recovery is still not proven end-to-end.
- The product copy still suggests background retry behavior that is not independently browser-proven as a clean reconciliation path.

### Next Smallest Step

- If sync trust work continues, the next high-value fix is to make `Reload cloud data` preserve pending workout and nutrition detail before clearing the pending marker.
- After that, add one browser proof that:
  - recovery preserves the logs
  - adapted future sessions remain unchanged except once
  - a second recovery action does not duplicate the adaptation

## 2026-04-17 User-Facing Plan History Report Pass

### Assumptions

- The existing day-review and week-review models are the right source of truth for a skeptical reviewer because they already preserve original versus latest prescription and actual outcome separately.
- The smallest safe product change is to expose a markdown report generator in Settings rather than inventing a second storage model or a large new history screen.
- If nutrition was not actually logged, the report should not present a placeholder comparison sentence as if it were a real nutrition log.

### Files Read

- `src/services/audits/plan-evolution-export-service.js`
- `tests/plan-evolution-export-service.test.js`
- `docs/PLAN_EVOLUTION_EXPORT_MODEL.md`
- `src/trainer-dashboard.jsx`
- `src/domains/settings/SettingsAccountSection.jsx`
- `e2e/reviewer-report.spec.js`

### Commands Run

- `rg -n "plan-evolution|export report|week summaries|history audit" src tests docs`
- `Get-Content src/services/audits/plan-evolution-export-service.js | Select-Object -First 260`
- `Get-Content tests/plan-evolution-export-service.test.js | Select-Object -First 260`
- `Get-Content docs/PLAN_EVOLUTION_EXPORT_MODEL.md | Select-Object -First 220`
- `Get-Content src/domains/settings/SettingsAccountSection.jsx | Select-Object -First 320`
- `node -r sucrase/register --test tests/plan-evolution-export-service.test.js`
- `cmd /c npx playwright test e2e/reviewer-report.spec.js --reporter=line`
- `cmd /c npm run build`

### Passing Tests

- `node -r sucrase/register --test tests/plan-evolution-export-service.test.js`
- `cmd /c npx playwright test e2e/reviewer-report.spec.js --reporter=line`
- `cmd /c npm run build`

### Evidence Gathered

- A user-facing reviewer report now exists in:
  - `Settings`
  - `Account & sync`
  - `Advanced recovery and destructive actions`
  - `Reviewer report`
- The report is deterministic markdown built from saved day reviews and week reviews, not from ad-hoc UI scraping.
- The report now includes:
  - original prescription
  - latest prescription
  - actual log
  - revision count
  - week summaries
  - why the plan changed
  - inferred change drivers
- The browser proof confirms a non-dev user can:
  - log a workout
  - open Settings
  - generate the markdown report
  - inspect the week-summary and day-evolution sections directly in the app
- The first browser pass exposed a useful honesty bug:
  - missing nutrition was being rendered as if it were an actual nutrition log
  - the export now suppresses that and only includes nutrition in `Actual log` when a real nutrition entry exists

### Open Risks

- The report is only as complete as the saved review and provenance records it receives.
- If a mutation path still fails to stamp enough provenance, the report will stay incomplete rather than inventing a cause.
- The report is currently copyable/generatable in-app, but there is still no dedicated markdown file download action.

### Next Smallest Step

- If reviewer tooling continues, the next smallest improvement is a dedicated download action for the markdown report so a user can save it without copying from the textarea.
