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

## 2026-04-17 Intake Reliability And Signed-In Setup Local-First Pass

### Assumptions

- The user-reported intake freeze is most plausibly tied to signed-in persistence churn, not a broken click handler, because the goal-family buttons themselves are simple local state setters.
- The smallest safe fix is to stop treating unfinished onboarding as cloud-syncable runtime state.
- Unfinished intake must remain resumable locally on the same device even while cloud writes are deferred.

### Files Read

- `src/trainer-dashboard.jsx`
- `src/modules-auth-storage.js`
- `src/services/sync-state-service.js`
- `tests/goals-sync-contract.test.js`
- `tests/auth-storage-local-authority.test.js`
- `tests/sync-state-service.test.js`
- `e2e/intake-reliability.spec.js`
- `e2e/auth-runtime-test-helpers.js`

### Commands Run

- `rg -n "persistAll\\s*\\(|footerPrimaryDisabled|reviewStatePending|goalStackConfirmationNeedsSync|anchorCollectionGap|goalsStageCanContinue|openGoalLibraryCategory|selectStarterGoalType" src/modules-auth-storage.js src/trainer-dashboard.jsx`
- `Get-Content src/modules-auth-storage.js | Select-Object -Skip 1040 -First 220`
- `Get-Content src/trainer-dashboard.jsx | Select-Object -Skip 6470 -First 140`
- `Get-Content src/trainer-dashboard.jsx | Select-Object -Skip 7090 -First 120`
- `Get-Content src/trainer-dashboard.jsx | Select-Object -Skip 13650 -First 40`
- `Get-Content e2e/intake-reliability.spec.js | Select-Object -First 260`
- `node -r sucrase/register --test tests/goals-sync-contract.test.js`
- `node -r sucrase/register --test tests/goals-sync-contract.test.js tests/auth-storage-local-authority.test.js tests/sync-state-service.test.js`
- `cmd /c npx playwright test e2e/intake-reliability.spec.js --reporter=line`
- `cmd /c npm run build`

### Failing Tests

- Initial characterization failure:
  - `cmd /c npx playwright test e2e/intake-reliability.spec.js --reporter=line`
  - The signed-in intake path still reached clarify, but it emitted `204` failed `trainer_data` POST attempts before onboarding finished.
- Initial storage characterization failure:
  - `node -r sucrase/register --test tests/goals-sync-contract.test.js`
  - Added timestamp-only churn coverage and confirmed the old fingerprint treated timestamp updates as meaningful cloud state.

### Passing Tests

- `node -r sucrase/register --test tests/goals-sync-contract.test.js tests/auth-storage-local-authority.test.js tests/sync-state-service.test.js`
- `cmd /c npx playwright test e2e/intake-reliability.spec.js --reporter=line`
- `cmd /c npm run build`

### Evidence Gathered

- Local/mobile goal-family switching itself was reproducible and healthy in browser tests.
- The signed-in intake path had a real cloud write storm before the fix:
  - `trainer_data` POST attempts climbed into the hundreds before onboarding finished.
  - That gave the user a real cloud-adjacent failure mode even though intake answers themselves are session-backed.
- Two concrete seams were identified:
  - payload dedupe was incorrectly sensitive to top-level `ts`
  - unfinished onboarding was still being treated like cloud-syncable state
- The fix now does three explicit things:
  - timestamp-only payload churn no longer counts as a meaningful cloud change
  - signed-in onboarding defers cloud writes until `personalization.profile.onboardingComplete === true`
  - `sbLoad()` keeps a newer pending onboarding draft local on reopen instead of replaying it into cloud immediately
- Browser proof after the fix:
  - signed-in intake can select a first goal
  - switch goal families and add another goal
  - fill required setup fields
  - continue into clarify
  - all while `trainer_data` POST count stays at `0` before onboarding completes
- Sync copy is now explicit for this mode:
  - signed-in but unfinished setup resolves to a local/device-only sync state instead of pretending cloud sync is actively progressing

### Open Risks

- This pass hardens unfinished onboarding specifically. It does not prove there are no other signed-in save storms elsewhere in the app after onboarding completes.
- If there are separate post-onboarding mutation loops, they still need their own characterization instead of assuming this fix solved every cloud reliability issue.
- The current browser proof covers reload-safe intake progression indirectly through the storage seam, but it does not yet include a full signed-in intake reload-and-resume browser test.

### Next Smallest Step

- If intake trust work continues, add one browser proof that starts signed in, fills part of intake, reloads, and verifies the unfinished intake draft resumes locally without any cloud replay before onboarding completion.

## 2026-04-17 App-Wide Persistence Loop Audit

### Assumptions

- The user report likely reflects a broader failure mode than intake because the same repo already had multiple signed-in mutation paths that write `trainer_data`.
- The smallest safe app-wide fix is not a broad refactor of `trainer-dashboard.jsx`; it is to harden the shared storage boundary so cloud failure cannot amplify ordinary state churn.
- If browser proof is too brittle for every surface, the correct fallback is targeted service coverage plus an explicit audit artifact, not pretending the whole app is now fully proven.

### Files Read

- `src/trainer-dashboard.jsx`
- `src/modules-auth-storage.js`
- `src/services/sync-state-service.js`
- `tests/goals-sync-contract.test.js`
- `tests/auth-storage-local-authority.test.js`
- `tests/sync-state-service.test.js`
- `e2e/intake-reliability.spec.js`
- `e2e/signed-in-adaptation-trust.spec.js`
- `docs/codex-audits/app-persistence-loop-audit.md`

### Commands Run

- `rg -n "persistAll\\(|setPersonalization\\(|setGoals\\(|setLogs\\(|Date\\.now\\(" src/trainer-dashboard.jsx src/modules-auth-storage.js src/services`
- `Get-Content src/trainer-dashboard.jsx | Select-Object -Skip 5888 -First 70`
- `Get-Content src/trainer-dashboard.jsx | Select-Object -Skip 6750 -First 160`
- `Get-Content src/trainer-dashboard.jsx | Select-Object -Skip 7128 -First 70`
- `Get-Content src/modules-auth-storage.js | Select-Object -Skip 1128 -First 180`
- `node -r sucrase/register --test tests/goals-sync-contract.test.js tests/auth-storage-local-authority.test.js tests/sync-state-service.test.js`
- `cmd /c npx playwright test e2e/intake-reliability.spec.js e2e/signed-in-adaptation-trust.spec.js --reporter=line`
- `cmd /c npm run build`

### Evidence Gathered

- The user-reported problem was not just a single intake bug.
- The storage layer had two broad amplification seams:
  - timestamp-only payload churn counted as a new cloud payload
  - transient cloud failures had no generic cooldown or same-user serialization, so one signed-in interaction could fan out into several `trainer_data` attempts
- Auditing `trainer-dashboard.jsx` showed several auto-persist paths that are legitimate individually but dangerous when cloud is flaky:
  - derived `coachMemory` sync effects
  - plan-week and planned-day history auto-upserts
  - goals-change persistence
  - logging flows that update logs plus derived personalization
- The smallest shared fix was to harden `modules-auth-storage.js`, not to rip through every UI handler:
  - defer unfinished onboarding from cloud
  - ignore top-level timestamp churn for payload fingerprints
  - serialize same-user cloud persists
  - apply a transient retry cooldown after failed cloud saves
  - clear that cooldown after successful manual reload/replay
- Browser proof now confirms a signed-in mutation can fail cloud once, preserve local state, avoid extra storming during passive navigation, and keep the retry/reload trust-path tests green.

### Passing Tests

- `node -r sucrase/register --test tests/goals-sync-contract.test.js tests/auth-storage-local-authority.test.js tests/sync-state-service.test.js`
- `cmd /c npx playwright test e2e/intake-reliability.spec.js e2e/signed-in-adaptation-trust.spec.js --reporter=line`
- `cmd /c npm run build`

### Open Risks

- This is a broad containment fix, not a formal proof that every post-onboarding UI surface is now browser-covered for this failure class.
- Some known signed-in degraded-sync gaps remain documented separately and were not fully eliminated by this pass.
- `trainer-dashboard.jsx` still contains many persistence call sites, so future changes can reintroduce this class of bug if they bypass the hardened storage boundary or add new ephemeral state to persisted payloads.

### Next Smallest Step

- If this audit continues, add one more adversarial browser pass that seeds a signed-in onboarded app, edits a few Settings fields, and proves passive tab navigation plus one settings mutation also stay bounded to a single failed cloud write during retry mode.

## 2026-04-17 Cloud Sync Launch-Blocker Instrumentation Pass

### Assumptions

- The launch blocker is now less about generic retry copy and more about not being able to identify the exact failing seam on real devices.
- The smallest safe improvement is instrumentation and proof at the shared auth/storage boundary, not a broad sync refactor.
- A deterministic two-device browser proof can credibly cover cloud handoff and hard refresh, but it is not a substitute for live deployment access.

### Files Read

- `src/modules-auth-storage.js`
- `src/services/sync-state-service.js`
- `src/trainer-dashboard.jsx`
- `src/domains/settings/SettingsAccountSection.jsx`
- `scripts/build.js`
- `docs/AUTH_AND_SUPABASE_RELIABILITY_SPEC.md`
- `e2e/sync-state.spec.js`
- `e2e/local-sync-trust.spec.js`
- `e2e/signed-in-adaptation-trust.spec.js`
- `tests/auth-storage-local-authority.test.js`
- `tests/sync-state-service.test.js`
- `playwright.config.js`

### Commands Run

- `Get-Content src/modules-auth-storage.js -TotalCount 420`
- `Get-Content src/services/sync-state-service.js -TotalCount 360`
- `Get-Content e2e/sync-state.spec.js -TotalCount 420`
- `Get-Content e2e/local-sync-trust.spec.js -TotalCount 420`
- `rg -n "syncRuntime|cloudSync|realtime|SUPABASE|trainer_data|diagnostic" src/trainer-dashboard.jsx src/services`
- `Get-Content scripts/build.js -TotalCount 220`
- `Get-Content docs/AUTH_AND_SUPABASE_RELIABILITY_SPEC.md -TotalCount 260`
- `node -r sucrase/register --test tests/sync-diagnostics-service.test.js tests/auth-storage-local-authority.test.js tests/sync-state-service.test.js`
- `node -r sucrase/register --test tests/goals-sync-contract.test.js tests/auth-storage-local-authority.test.js tests/sync-state-service.test.js tests/sync-diagnostics-service.test.js`
- `cmd /c npx playwright test e2e/sync-state.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/local-sync-trust.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/local-sync-trust.spec.js -g "profile, goals, workout logs, and nutrition logs sync across two signed-in devices and survive hard refresh" --reporter=line`
- `cmd /c npx playwright test e2e/sync-state.spec.js e2e/local-sync-trust.spec.js e2e/signed-in-adaptation-trust.spec.js --reporter=line`
- `cmd /c npm run build`
- `Get-ChildItem Env: | Where-Object { $_.Name -match 'SUPABASE|VERCEL' }`

### Failing Tests

- Pre-patch browser failures in current sync coverage:
  - `e2e/sync-state.spec.js` could hang on normal tab clicks while in retry state.
  - `e2e/local-sync-trust.spec.js` could hang on the nutrition quick-save button during retry characterization.
- First two-device proof attempt failed for a useful reason:
  - a pre-opened stale second device did not independently prove refresh-to-cloud reconciliation.
  - I kept that limitation explicit and changed the acceptance proof to a fresh signed-in second-device restore plus hard refresh, which is what the new artifact claims.

### Passing Tests

- `node -r sucrase/register --test tests/sync-diagnostics-service.test.js tests/auth-storage-local-authority.test.js tests/sync-state-service.test.js`
- `node -r sucrase/register --test tests/goals-sync-contract.test.js tests/auth-storage-local-authority.test.js tests/sync-state-service.test.js tests/sync-diagnostics-service.test.js`
- `cmd /c npx playwright test e2e/sync-state.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/local-sync-trust.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/sync-state.spec.js e2e/local-sync-trust.spec.js e2e/signed-in-adaptation-trust.spec.js --reporter=line`
- `cmd /c npm run build`

### Evidence Gathered

- The client build injects `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` into `window.__SUPABASE_URL` / `window.__SUPABASE_ANON_KEY`.
- If deployment env is missing or malformed, the app now clearly falls into provider-unavailable local mode, but live deployment verification was blocked because:
  - the Vercel connector token is expired
  - there are no live Supabase env credentials in this repo session
- Before this pass, the app did not preserve enough visible evidence to tell whether a real-device sync problem came from:
  - `trainer_data` save
  - `trainer_data` load
  - auth refresh
  - realtime reconnect/resync
  - local-cache arbitration
- Added a deterministic sync diagnostics reducer and wired it into:
  - `trainer_data` save/load attempts and failures
  - auth refresh
  - realtime auth/status/resync
  - local pending writes and cache authority decisions
- Added a developer-only diagnostics panel in Settings that now shows:
  - last sync attempt time
  - last endpoint + method
  - last failing endpoint
  - HTTP status
  - Supabase error code
  - retry eligibility
  - pending local writes
  - auth refresh status
  - realtime reconnect/resync status
  - local-cache authority reason
- Browser proof now covers a fresh second signed-in device loading profile, goals, workout logs, and nutrition logs from cloud and keeping them after hard refresh.

### Open Risks

- Live deployment / live Supabase project verification is still blocked by access, so the incident artifact stays honest about that gap.
- The new cross-device proof is for a fresh second device plus hard refresh. It does not claim already-open stale second-device reconciliation without explicit reload.
- Existing degraded-sync artifacts still document one known signed-in recovery gap where unsynced detail can be dropped after retry/outage recovery.

### Next Smallest Step

- If launch hardening continues, the next highest-value step is to get valid Vercel access or deployment credentials and run one live smoke test against the actual project so the repo proof can be compared against production behavior instead of only the deterministic harness.

## 2026-04-17 Real Supabase Staging Sync Harness

### Assumptions

- The highest-value next proof is a real Supabase staging run, not another mocked-route sync spec.
- This repo session still does not have staging credentials, so the right move is to leave behind a runnable real-network harness plus an explicit plan artifact instead of pretending the live run happened.
- The smallest safe seam is Playwright base-URL/env support plus a real REST seed/reset helper; broad sync logic changes are not needed for this request.

### Files Read

- `scripts/test-supabase-rls.mjs`
- `docs/AUTH_AND_SUPABASE_RELIABILITY_SPEC.md`
- `docs/MANUAL_QA_RELEASE_PACK.md`
- `docs/ADVERSARIAL_USER_TEST_MATRIX_AND_RELEASE_GATE.md`
- `docs/SUPABASE_LIVE_VERIFICATION_AND_PERF_CHECKLIST.md`
- `e2e/auth-runtime-test-helpers.js`
- `e2e/sync-state.spec.js`
- `e2e/local-sync-trust.spec.js`
- `e2e/signed-in-adaptation-trust.spec.js`
- `src/modules-auth-storage.js`
- `src/services/sync-state-service.js`
- `src/services/sync-diagnostics-service.js`
- `src/domains/settings/SettingsGoalsSection.jsx`
- `src/domains/settings/SettingsProfileSection.jsx`
- `src/trainer-dashboard.jsx`
- `playwright.config.js`
- `package.json`

### Commands Run

- `Get-ChildItem -Recurse docs,scripts,e2e,src,tests -File | Select-String -Pattern 'SUPABASE|staging|manual pack|release gate|sync-state|local-sync-trust|trainer_data|test-supabase-rls' | Select-Object -First 200 | ForEach-Object { \"$($_.Path):$($_.LineNumber): $($_.Line.Trim())\" }`
- `Get-Content scripts/test-supabase-rls.mjs -TotalCount 260`
- `Get-Content e2e/sync-state.spec.js -TotalCount 260`
- `Get-Content e2e/local-sync-trust.spec.js -TotalCount 320`
- `Get-Content docs/AUTH_AND_SUPABASE_RELIABILITY_SPEC.md -TotalCount 260`
- `Get-Content docs/MANUAL_QA_RELEASE_PACK.md -TotalCount 240`
- `Get-Content docs/ADVERSARIAL_USER_TEST_MATRIX_AND_RELEASE_GATE.md -TotalCount 220`
- `Get-Content e2e/auth-runtime-test-helpers.js -TotalCount 320`
- `Get-Content src/services/sync-state-service.js -TotalCount 360`
- `Get-Content src/modules-auth-storage.js -TotalCount 420`
- `Get-Content playwright.config.js -TotalCount 260`
- `Get-Content package.json -TotalCount 260`
- `Get-Content docs/SUPABASE_LIVE_VERIFICATION_AND_PERF_CHECKLIST.md -TotalCount 220`
- `rg -n \"saveProfileName|addSwimGoal|saveTodayQuickLog|logUnderFueledDay|profile, goals, workout logs, and nutrition logs sync across two signed-in devices and survive hard refresh\" e2e/local-sync-trust.spec.js e2e/signed-in-adaptation-trust.spec.js`
- `rg -n \"settings-goal-editor|settings-goals-|goal-editor|goal-preview|Save profile|settings-profile-section|Display name|today-save-status|nutrition-save-status\" src/trainer-dashboard.jsx src/domains/settings -S`
- `Get-ChildItem Env: | Where-Object { $_.Name -match 'SUPABASE|VERCEL|FORMA' } | Sort-Object Name | ForEach-Object { \"$($_.Name)=$($_.Value)\" }`
- `node -r sucrase/register --test tests/real-sync-staging-helpers.test.js`
- `cmd /c npx playwright test e2e/real-sync-staging.spec.js --reporter=line`

### Passing Tests

- `node -r sucrase/register --test tests/real-sync-staging-helpers.test.js`
- `cmd /c npx playwright test e2e/real-sync-staging.spec.js --reporter=line` -> skipped cleanly because staging env vars are absent in this repo session

### Evidence Gathered

- `scripts/test-supabase-rls.mjs` already establishes the repo convention for real Supabase auth via `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_TEST_EMAIL`, and `SUPABASE_TEST_PASSWORD`.
- Existing cross-device trust proof in `e2e/local-sync-trust.spec.js` is useful, but it is fully route-mocked and therefore not enough for staging verification.
- The app already exposes the machine-readable sync diagnostics needed for a real-network retry rule through `window.__TRAINER_SYNC_TEST_HELPERS.snapshot()` and the developer diagnostics panel in `Settings > Account`.
- Added a real-network staging harness:
  - `e2e/real-sync-staging.spec.js`
  - `e2e/real-sync-staging-helpers.js`
- Added a concise operator artifact with exact steps, exact test data, and exact pass/fail assertions:
  - `docs/codex-audits/real-supabase-sync-verification-plan.md`
- Added Playwright support for running against a real staging app URL via `FORMA_E2E_BASE_URL` without starting the local fake-env web server.

### Open Risks

- This repo session still has no staging credentials, so the real browser harness was not executed here.
- The harness resets only `trainer_data`, `goals`, and `coach_memory` for the test account. That is enough for current app truth, but it is not a full-table cleanup doctrine.
- The final proof still depends on a staging deployment whose client env matches the same Supabase project supplied through the direct REST helper.

### Next Smallest Step

- Run `npm run e2e:sync:staging` with real staging env vars and capture the first pass/fail artifact before changing any more sync logic.

## 2026-04-17 Text Encoding Cleanup And Guardrail

### Assumptions

- The highest-value guardrail is the existing repo hygiene script, because it already maps to release/build discipline.
- One explicit exclusion is acceptable for `src/services/text-format-service.js`, since that file intentionally contains mojibake repair patterns as source data.
- The target scope for hard failure is `src/`, `api/`, and `tests/` where user-facing strings or string snapshots live.

### Files Read

- `scripts/check-repo-hygiene.cjs`
- `scripts/build.js`
- `src/services/text-format-service.js`
- `src/services/workout-log-form-service.js`
- `src/data/goal-intents/index.js`
- `src/modules-coach-engine.js`
- `src/trainer-dashboard.jsx`
- `tests/text-format-service.test.js`
- `tests/intake-flow-service.test.js`
- `tests/day-prescription-display-service.test.js`

### Commands Run

- `rg -n "[—âÂÃ]" src api tests -g '!src/services/text-format-service.js'`
- `Get-Content src/services/text-format-service.js -TotalCount 220`
- `Get-Content src/services/workout-log-form-service.js -TotalCount 80`
- `Get-Content src/data/goal-intents/index.js | Select-Object -Skip 632 -First 8`
- `Get-Content src/modules-coach-engine.js | Select-Object -Skip 196 -First 16`
- `node -r sucrase/register --test tests/text-format-service.test.js tests/intake-flow-service.test.js tests/day-prescription-display-service.test.js`
- `node scripts/check-repo-hygiene.cjs`
- `node scripts/build.js`
- `rg -n "[—âÂÃ]" . -g '!node_modules' -g '!dist' -g '!artifacts' -g '!playwright-report' -g '!test-results' -g '!src/services/text-format-service.js'`

### Passing Tests

- `node -r sucrase/register --test tests/text-format-service.test.js tests/intake-flow-service.test.js tests/day-prescription-display-service.test.js`
- `node scripts/check-repo-hygiene.cjs`
- `node scripts/build.js`

### Evidence Gathered

- User-facing copy in `src/`, `api/`, and `tests/` is clean of the targeted mojibake patterns and raw em dash characters after the cleanup sweep.
- `src/services/text-format-service.js` now normalizes common single-pass mojibake like `Â·`, `â€“`, `â€¦`, and `Ã—` into plain ASCII display output.
- `src/services/workout-log-form-service.js` no longer carries raw mojibake or raw em dash characters in parser regexes or quick-summary separators.
- `src/data/goal-intents/index.js` no longer carries mojibake in the restart-intent regex.
- `scripts/check-repo-hygiene.cjs` now fails on banned text sequences in tracked `src/`, `api/`, and `tests/` files, excluding only the dedicated mojibake repair map.
- `scripts/build.js` now runs repo hygiene first, so banned text regressions fail the build instead of slipping through until manual review.

### Open Risks

- The repair map in `src/services/text-format-service.js` is intentionally excluded from the hard scanner because it stores broken-text patterns by design.
- The cleanup intentionally targeted app/user-facing text scope, not every historical markdown artifact under `docs/codex-audits/`.

### Next Smallest Step

- If text hygiene broadens further, convert the repair map to escaped literals or generated fixtures so the scanner can eventually cover `src/services/text-format-service.js` too.

## 2026-04-17 Nutrition Performance Layer Audit And Redesign

### Assumptions

- FORMA should keep the current low-friction meal anchor system instead of replacing it.
- The highest-value redesign seam is the shared nutrition engine plus the main Nutrition surface, because that is where macro-only guidance becomes visible product behavior.
- It is better to make hydration and sodium deterministic now than to wait for a fully individualized sweat-rate model.

### Files Read

- `src/modules-nutrition.js`
- `src/trainer-dashboard.jsx`
- `src/services/audits/nutrition-compatibility-audit-service.js`
- `tests/nutrition-engine-variation.test.js`
- `tests/nutrition-compatibility-audit-service.test.js`
- `tests/nutrition-review.test.js`

### Files Changed

- `src/modules-nutrition.js`
- `src/trainer-dashboard.jsx`
- `tests/nutrition-engine-variation.test.js`
- `tests/nutrition-compatibility-audit-service.test.js`
- `docs/codex-audits/peter-nutrition-target-audit.md`
- `docs/codex-audits/forma-nutrition-performance-redesign.md`

### Commands Run

- `rg -n "performanceGuidance|adaptiveContext|supplementPrescriptionLine|nutrition-daily-target|nutrition-meal-strategy" src/trainer-dashboard.jsx src/modules-nutrition.js tests -S`
- `Get-Content src/modules-nutrition.js | Select-Object -Skip 720 -First 640`
- `Get-Content src/trainer-dashboard.jsx | Select-Object -Skip 22670 -First 520`
- `Get-Content tests/nutrition-engine-variation.test.js`
- `Get-Content tests/nutrition-compatibility-audit-service.test.js`
- `node -r sucrase/register --test tests/nutrition-engine-variation.test.js tests/nutrition-compatibility-audit-service.test.js tests/nutrition-review.test.js`
- `node scripts/check-repo-hygiene.cjs`
- `node scripts/build.js`

### Failing Tests

- Initial pass:
  - `tests/nutrition-compatibility-audit-service.test.js`
    - stale expectation that hydration was still not explicit
  - `tests/nutrition-engine-variation.test.js`
    - hybrid phase guidance assertion needed to accept the real peak-week wording

### Passing Tests

- `node -r sucrase/register --test tests/nutrition-engine-variation.test.js tests/nutrition-compatibility-audit-service.test.js tests/nutrition-review.test.js`
- `node scripts/build.js`

### Evidence Gathered

- `deriveAdaptiveNutrition(...)` now stores explicit `hydrationTargetOz` and `sodiumTargetMg` in the prescription layer.
- The nutrition engine now produces deterministic `performanceGuidance` with:
  - day before
  - day of
  - during
  - recovery
  - hydration
  - sodium
- The nutrition engine now produces deterministic `adaptiveContext` with:
  - phase guidance
  - bodyweight trend guidance
  - explicit target-change explanation
- The Nutrition surface now exposes those layers through:
  - `data-testid="nutrition-performance-guidance"`
  - `data-testid="nutrition-adaptive-context"`
- Peter's nutrition audit no longer honestly carries the old hydration-proof gap. Hard, long, strength, and recovery representative days now store explicit hydration targets.
- The remaining Peter nutrition proof gap is still real: the app infers a moderate cut from relative calorie separation, but does not yet store an explicit maintenance or weekly-deficit model.

### Open Risks

- This is now a real performance-support layer, but it is still not a fully individualized endurance nutrition system.
- Sodium and hydration are deterministic heuristics, not sweat-rate-personalized prescriptions.
- The app still lacks a first-class maintenance-calorie and deficit model, so "moderate cut" remains partly inferred rather than directly modeled.

### Next Smallest Step

- If nutrition trust needs to go deeper, add a first-class maintenance estimate and weekly deficit target so the app can stop inferring cut intent from relative day separation alone.

## 2026-04-17 Coach Mode Consumer Refactor

### Assumptions

- Coach should stay a decision surface, not a planner or settings console.
- The right consumer framing is exactly three jobs:
  - adjust today
  - adjust this week
  - ask coach
- The deterministic acceptance boundary is non-negotiable.
- If `Ask coach` already has a deterministic fallback, the main surface should not expose a dead `AI advisory is off` state.

### Files Read

- `src/trainer-dashboard.jsx`
- `src/services/coach-surface-service.js`
- `src/modules-coach-engine.js`
- `tests/coach-surface-service.test.js`
- `e2e/coach.spec.js`
- `e2e/trust-cleanup-integration.spec.js`
- `e2e/mobile-surfaces.spec.js`
- `e2e/friction-analytics.spec.js`
- `e2e/synthetic-athlete-lab.spec.js`
- `docs/COACH_USEFULNESS_AND_ACTION_TRUST_SPEC.md`

### Files Changed

- `src/trainer-dashboard.jsx`
- `src/services/coach-surface-service.js`
- `tests/coach-surface-service.test.js`
- `e2e/coach.spec.js`
- `e2e/trust-cleanup-integration.spec.js`
- `e2e/mobile-surfaces.spec.js`
- `e2e/friction-analytics.spec.js`
- `e2e/synthetic-athlete-lab.spec.js`
- `docs/COACH_MODE_CONSUMER_IA.md`

### Commands Run

- `rg -n "data-testid=\"coach|coach-tab|Ask coach|Change my plan|quickActions|advisoryOnly|canMutatePlan|AI advisory|advisory" src/trainer-dashboard.jsx src/services tests/e2e tests -S`
- `Get-Content src/services/coach-surface-service.js`
- `Get-Content e2e/coach.spec.js`
- `Get-Content src/trainer-dashboard.jsx | Select-Object -Skip 24840 -First 260`
- `node -r sucrase/register --test tests/coach-surface-service.test.js`
- `cmd /c npx playwright test e2e/coach.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/mobile-surfaces.spec.js -g "coach stays focused on conversation and decisions, not configuration" --reporter=line`
- `cmd /c npx playwright test e2e/trust-cleanup-integration.spec.js -g "Coach keeps only applied-action surfaces visible" --reporter=line`
- `cmd /c npx playwright test e2e/friction-analytics.spec.js -g "coach preview emits the deterministic preview event once" --reporter=line`
- `cmd /c npx playwright test e2e/synthetic-athlete-lab.spec.js -g "coach ask-anything stays advisory-only|exact strength plus aesthetics flow keeps both goals visible and coach ask-anything stays non-mutating" --reporter=line`
- `node scripts/build.js`

### Failing Tests

- First mobile pass failed because `Adjust today` was surfacing the preview action label (`Reduce this week's volume`) instead of the scenario-specific day call. That was a real UX bug, not a flaky test.

### Passing Tests

- `node -r sucrase/register --test tests/coach-surface-service.test.js`
- `cmd /c npx playwright test e2e/coach.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/mobile-surfaces.spec.js -g "coach stays focused on conversation and decisions, not configuration" --reporter=line`
- `cmd /c npx playwright test e2e/trust-cleanup-integration.spec.js -g "Coach keeps only applied-action surfaces visible" --reporter=line`
- `cmd /c npx playwright test e2e/friction-analytics.spec.js -g "coach preview emits the deterministic preview event once" --reporter=line`
- `cmd /c npx playwright test e2e/synthetic-athlete-lab.spec.js -g "coach ask-anything stays advisory-only|exact strength plus aesthetics flow keeps both goals visible and coach ask-anything stays non-mutating" --reporter=line`
- `node scripts/build.js`

### Evidence Gathered

- Coach is now framed around exactly three consumer jobs in the shipped UI:
  - `Adjust today`
  - `Adjust this week`
  - `Ask coach`
- `Ask coach` no longer exposes a dead or half-live `AI advisory is off` state in the main experience.
- `Ask coach` already had a deterministic runtime fallback, so the removal of the dead-state branch is honest, not cosmetic.
- The main decision cards now lead with:
  - one recommendation
  - one why
  - one consequence
  - one preview path
- Preview and acceptance are now shared across the surface, so previewing a today or ask-coach recommendation does not bounce the user into a different job tab.
- The acceptance gate remains explicit and browser-proven: no coach mutation lands until `Accept change`.
- Added a consumer IA and premium copy artifact at `docs/COACH_MODE_CONSUMER_IA.md`.

### Open Risks

- `Ask coach` is still strongest as an interpretation and decision-support layer, not as a deep conversational coaching system.
- The surface is materially cleaner, but there is still older coach logic inside `src/trainer-dashboard.jsx` that would benefit from future extraction rather than more feature layering.

### Next Smallest Step

- If Coach needs another pass, extract the current shipped Coach tab into a dedicated feature module so future copy and IA changes stop requiring large-file edits in `trainer-dashboard.jsx`.

## Settings Surface Cleanup Audit - 2026-04-17

### Assumptions

- Reminder delivery should not be treated as live unless the repo can prove a real push or background delivery path.
- A clear `Forgot password` flow can be scoped to the reset-link request path if the repo does not yet ship a branded in-app reset completion screen.
- Theme coverage work should focus on the visible consumer path and explicit proof across tabs instead of a broad color refactor of unrelated legacy styles.

### Files Read

- `src/domains/settings/settings-surface-model.js`
- `src/domains/settings/SettingsSurfaceNav.jsx`
- `src/domains/settings/SettingsPreferencesSection.jsx`
- `src/domains/settings/SettingsAccountSection.jsx`
- `src/domains/settings/SettingsAdvancedSection.jsx`
- `src/domains/settings/SettingsProfileSection.jsx`
- `src/services/brand-theme-service.js`
- `src/services/auth-entry-service.js`
- `src/modules-auth-storage.js`
- `src/services/sync-state-service.js`
- `src/trainer-dashboard.jsx`
- `e2e/settings-surfaces.spec.js`
- `e2e/theme-preferences.spec.js`
- `e2e/auth-and-management.spec.js`
- `e2e/account-lifecycle.spec.js`
- `e2e/auth-runtime-test-helpers.js`
- `tests/settings-domain-boundary.test.js`
- `tests/auth-entry-service.test.js`
- `tests/brand-theme-service.test.js`
- `docs/SETTINGS_DECOMPOSITION_SPEC.md`
- `docs/AUTH_AND_SUPABASE_RELIABILITY_SPEC.md`

### Files Changed

- `src/modules-auth-storage.js`
- `src/services/auth-entry-service.js`
- `src/domains/settings/settings-surface-model.js`
- `src/domains/settings/SettingsSurfaceNav.jsx`
- `src/domains/settings/SettingsPreferencesSection.jsx`
- `src/domains/settings/SettingsAccountSection.jsx`
- `src/domains/settings/SettingsProfileSection.jsx`
- `src/trainer-dashboard.jsx`
- `e2e/auth-runtime-test-helpers.js`
- `e2e/settings-surfaces.spec.js`
- `e2e/password-reset.spec.js`
- `e2e/theme-surface-coverage.spec.js`
- `tests/settings-domain-boundary.test.js`
- `docs/codex-audits/settings-capability-matrix.md`

### Commands Run

- `rg -n "Notifications|notification|reminder|push reminder|push|theme|Burnt Orange|Punch Pink|forgot password|reset password|Preferences" src tests docs e2e -S`
- `Get-Content src/domains/settings/SettingsAccountSection.jsx`
- `Get-Content src/trainer-dashboard.jsx | Select-Object -Skip 25850 -First 900`
- `Get-Content src/domains/settings/SettingsPreferencesSection.jsx`
- `Get-Content src/domains/settings/settings-surface-model.js`
- `Get-Content src/services/brand-theme-service.js`
- `rg -n "weeklyReminderOn|weeklyReminderTime|proactiveNudgeOn|allOff|Notification\\(|requestPermission|serviceWorker|pushManager|push_subscriptions|showNotification|resetPasswordForEmail|forgot password|Forgot Password|reset password|recover" src e2e tests docs -S`
- `Get-Content docs/SETTINGS_DECOMPOSITION_SPEC.md`
- `Get-Content docs/AUTH_AND_SUPABASE_RELIABILITY_SPEC.md`
- `Get-Content e2e/settings-surfaces.spec.js`
- `Get-Content e2e/theme-preferences.spec.js`
- `Get-Content e2e/auth-and-management.spec.js`
- `node -r sucrase/register --test tests/settings-domain-boundary.test.js tests/auth-entry-service.test.js tests/brand-theme-service.test.js tests/sync-state-service.test.js`
- `cmd /c npx playwright test e2e/settings-surfaces.spec.js e2e/password-reset.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/theme-surface-coverage.spec.js --reporter=line`
- `node scripts/build.js`

### Failing Tests

- First browser pass failed with a real runtime bug: `SettingsTab` referenced `authPasswordResetBusy` from the outer component instead of receiving it as a prop. That crashed the signed-in Settings render.

### Passing Tests

- `node -r sucrase/register --test tests/settings-domain-boundary.test.js tests/auth-entry-service.test.js tests/brand-theme-service.test.js tests/sync-state-service.test.js`
- `cmd /c npx playwright test e2e/settings-surfaces.spec.js e2e/password-reset.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/theme-surface-coverage.spec.js --reporter=line`
- `node scripts/build.js`

### Evidence Gathered

- The Settings nav was still labeling the preferences surface as `Notifications` even though the repo could not prove a production push system.
- Reminder delivery was not production-ready:
  - no push subscription UI
  - no service worker delivery path
  - no end-to-end reminder proof
  - one opportunistic `Notification` preview inside `trainer-dashboard.jsx`
- The old reminder preview path is now debug-only behind `?reminder_preview=1`, so normal users are no longer exposed to half-live reminder behavior.
- `Forgot password` did not exist before this pass. The repo now has a real reset-link request path in both the auth gate and `Settings > Account & sync`.
- Burnt Orange and Punch Pink are now browser-proven across Today, Program, Log, Nutrition, Coach, Settings, and the auth gate.
- The repo now has a dedicated Settings capability matrix at `docs/codex-audits/settings-capability-matrix.md` that distinguishes live, planned, and deployment-conditional capabilities.

### Open Risks

- The app still does not ship a dedicated branded in-app reset completion screen after the emailed recovery link.
- Reminder delivery remains planned. The UI is now honest about that, but the feature itself is still absent.
- Some deeper legacy settings/admin surfaces still use fixed semantic colors. The user-visible core cleanup is in, but a full theme-token sweep of every legacy settings subsection would still be future polish rather than launch-critical honesty work.

### Next Smallest Step

- If password recovery should be fully self-contained inside FORMA, add a dedicated recovery-link landing and `choose new password` completion screen instead of stopping at the reset-email request.

## Mobile Build Performance Audit - 2026-04-17

### Assumptions

- A realistic launch audit needs a throttled mobile harness, not desktop localhost vibes.
- Warm, repeat, and service-worker-assisted return visits matter separately from cold first load.
- The current build should only be kept if it wins on actual interactive time or simplicity strongly enough to justify its caching drawbacks.

### Files Read

- `package.json`
- `scripts/build.js`
- `scripts/bundlesize-lite.js`
- `playwright.config.js`
- `service-worker.js`
- `src/trainer-dashboard.jsx`
- `docs/BUILD_BACKLOG.md`
- `docs/SUPABASE_LIVE_VERIFICATION_AND_PERF_CHECKLIST.md`
- `e2e/auth-entry-ui.spec.js`
- `e2e/program.spec.js`
- `e2e/sync-state.spec.js`

### Files Changed

- `scripts/build.js`
- `service-worker.js`
- `src/trainer-dashboard.jsx`
- `playwright.config.js`
- `package.json`
- `scripts/profile-mobile-performance.cjs`
- `e2e/service-worker-cache.spec.js`
- `docs/codex-audits/forma-mobile-performance-audit.md`

### Commands Run

- `Get-Content package.json`
- `Get-Content scripts/build.js`
- `Get-Content playwright.config.js`
- `Get-Content service-worker.js`
- `rg -n "navigator\\.serviceWorker|serviceWorker\\.register|service-worker\\.js|service worker" src tests e2e scripts`
- `Get-Content docs/BUILD_BACKLOG.md`
- `Get-Content docs/SUPABASE_LIVE_VERIFICATION_AND_PERF_CHECKLIST.md`
- `node scripts/build.js`
- `node scripts/build.js --mode=inline`
- `cmd /c npx playwright test e2e/auth-entry-ui.spec.js e2e/program.spec.js e2e/service-worker-cache.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/sync-state.spec.js --reporter=line`
- `node scripts/profile-mobile-performance.cjs`

### Failing Tests

- First service-worker browser pass tried to prove a fully offline top-level navigation with `goto()` / `reload()` under Playwright and failed with `net::ERR_FAILED`. I narrowed the browser proof to the deterministic CI-safe seam: repeat visit is service-worker controlled and the app shell is cached. Offline repeat timing remains covered by the dedicated profiling harness artifact instead.

### Passing Tests

- `node scripts/build.js`
- `node scripts/build.js --mode=inline`
- `cmd /c npx playwright test e2e/auth-entry-ui.spec.js e2e/program.spec.js e2e/service-worker-cache.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/sync-state.spec.js --reporter=line`
- `node scripts/profile-mobile-performance.cjs`

### Evidence Gathered

- The old production path was a single inline `dist/index.html` around `4.59 MB`.
- The app had a `service-worker.js` file but did not register it, so service-worker-assisted return behavior was effectively absent.
- The new split build shrinks `index.html` to about `2.3 KB` and moves framework and app code into cacheable assets.
- Cold interactive time is still poor and basically unchanged under the throttled mobile harness:
  - inline cold interactive: `6708 ms`
  - split cold interactive: `6702 ms`
- Warm and return visits are materially better on the split build:
  - split warm interactive: `1205 ms`
  - split repeat visit interactive: `1839 ms`
  - split service-worker-assisted offline repeat interactive: `714 ms`
- Conclusion: the inline build should not remain the production architecture, but the split build is an intermediate win rather than the final cold-start solution.

### Open Risks

- The main app bundle is still about `4.27 MB` uncompressed, so cold-start parse and execute time remain the dominant mobile problem.
- This pass does not introduce route-level or surface-level code splitting yet.
- The browser suite now allows service-worker-specific scenarios, but offline navigation itself is still better characterized by the dedicated profiler harness than by a broad Playwright regression matrix.

### Next Smallest Step

- If cold-start mobile performance becomes a launch gate, migrate from the split asset build to a genuinely chunked pipeline and start by lazily splitting the heaviest non-startup surfaces out of `src/trainer-dashboard.jsx`.

## Security Hardening Review - 2026-04-17

### Assumptions

- This pass is repo-grounded and private-beta-focused, not a live production penetration test.
- Supabase RLS claims are only proven at the migration level unless a live project is queried directly.
- Consumer-facing UI is considered unsafe if internal tools can be revealed by localStorage or query-string tricks alone.

### Files Read

- `src/modules-auth-storage.js`
- `src/services/ai-runtime-service.js`
- `src/services/sync-state-service.js`
- `src/domains/settings/settings-surface-model.js`
- `src/domains/settings/useSettingsScreenState.js`
- `src/domains/settings/useSettingsDeleteDiagnostics.js`
- `src/domains/settings/SettingsAccountSection.jsx`
- `src/domains/settings/SettingsAdvancedSection.jsx`
- `src/trainer-dashboard.jsx`
- `api/auth/delete-account.js`
- `api/ai/intake.js`
- `api/ai/coach.js`
- `api/_lib/garmin.js`
- `vercel.json`
- `supabase/migrations/20260414000100_audit_supabase_data_model.sql`
- `supabase/migrations/20260413000100_policy_perf_hardening.sql`
- `supabase/migrations/20260413000200_policy_perf_followup.sql`
- `tests/delete-account-api.test.js`
- `tests/goals-sync-contract.test.js`
- `tests/settings-surface-model.test.js`
- `e2e/settings-surfaces.spec.js`
- `e2e/password-reset.spec.js`
- `e2e/reviewer-report.spec.js`
- `e2e/coach.spec.js`
- `e2e/account-lifecycle.spec.js`

### Files Changed

- `src/services/internal-access-policy-service.js`
- `src/services/ai-runtime-service.js`
- `src/domains/settings/settings-surface-model.js`
- `src/domains/settings/useSettingsScreenState.js`
- `src/domains/settings/useSettingsDeleteDiagnostics.js`
- `src/domains/settings/SettingsAccountSection.jsx`
- `src/trainer-dashboard.jsx`
- `api/_lib/security.js`
- `api/auth/delete-account.js`
- `api/auth/forgot-password.js`
- `vercel.json`
- `tests/internal-access-policy-service.test.js`
- `tests/settings-surface-model.test.js`
- `tests/delete-account-api.test.js`
- `tests/forgot-password-api.test.js`
- `tests/goals-sync-contract.test.js`
- `e2e/auth-runtime-test-helpers.js`
- `e2e/password-reset.spec.js`
- `e2e/settings-surfaces.spec.js`
- `e2e/reviewer-report.spec.js`
- `e2e/coach.spec.js`
- `docs/PLAN_EVOLUTION_EXPORT_MODEL.md`
- `docs/codex-audits/settings-capability-matrix.md`
- `docs/codex-audits/private-beta-security-hardening-review.md`

### Commands Run

- `rg -n "reviewer report|settings-reviewer-report|showProtectedDiagnostics|showInternalSettingsTools|trainer_staff_diagnostics|delete-account|forgot password|password reset|coach_api_key|Anthropic key|developer sync diagnostics" src tests e2e api docs -S`
- `rg -n "enable row level security|create policy|alter table .* enable row level security|trainer_data|nutrition_logs|push_subscriptions|app_events|auth.uid" supabase/migrations -S`
- `rg -n "SERVICE_ROLE|ANTHROPIC_API_KEY|coach_api_key|anthropic_api_key|VITE_SUPABASE|SUPABASE_SERVICE_ROLE_KEY|__SUPABASE" src api scripts docs tests e2e -S`
- `node -r sucrase/register --test tests/internal-access-policy-service.test.js tests/settings-surface-model.test.js tests/delete-account-api.test.js tests/forgot-password-api.test.js tests/goals-sync-contract.test.js`
- `cmd /c npx playwright test e2e/coach.spec.js e2e/settings-surfaces.spec.js e2e/password-reset.spec.js e2e/reviewer-report.spec.js --reporter=line`
- `node scripts/build.js`
- `cmd /c npx playwright test e2e/account-lifecycle.spec.js --reporter=line`

### Failing Tests

- `cmd /c npx playwright test e2e/account-lifecycle.spec.js --reporter=line`
  - `device reset clears this browser and removes the local resume path`
  - This broader lifecycle failure appears unrelated to the security hardening diffs and was not fixed in this pass.

### Passing Tests

- `node -r sucrase/register --test tests/internal-access-policy-service.test.js tests/settings-surface-model.test.js tests/delete-account-api.test.js tests/forgot-password-api.test.js tests/goals-sync-contract.test.js`
- `cmd /c npx playwright test e2e/coach.spec.js e2e/settings-surfaces.spec.js e2e/password-reset.spec.js e2e/reviewer-report.spec.js --reporter=line`
- `node scripts/build.js`

### Evidence Gathered

- Consumer Settings previously exposed a reviewer report card directly in the app.
- Internal diagnostics visibility previously depended on client debug flags and a query/localStorage switch, not a real trust boundary.
- `GET /api/auth/delete-account` previously returned deployment diagnostics publicly and leaked env-name hints like `SUPABASE_SERVICE_ROLE_KEY`.
- Password reset previously used a direct client-to-Supabase auth recovery path with no server-side rate limiting.
- The consumer Coach surface still had a client-supplied provider-key path before this pass.
- Repo migrations show broad user-owned RLS coverage for the major app tables, but live-project verification is still unproven here.
- `vercel.json` previously had no CSP or baseline security headers.

### Open Risks

- `api/ai/intake.js` remains a public pre-auth route and is still an abuse surface until it is throttled.
- The new CSP still allows `'unsafe-inline'` because the current custom build depends on inline assets.
- Live Supabase RLS and grants are not independently verified by this repo-only pass.
- Historical docs and older audit notes may still mention reviewer tooling as user-facing; the current code rule now forbids that in the consumer app.

### Next Smallest Step

- Add server-side throttling to `api/ai/intake.js`, then run a live staging verification pass against the actual Supabase project to prove the repo-side hardening matches deployment reality.

## App Store Readiness Plan - 2026-04-17

### Assumptions

- This pass is a repo-grounded launch-plan audit, not a live App Store Connect or Play Console submission.
- Current Apple and Google store requirements are temporally unstable, so official platform docs were checked directly for this pass.
- The user explicitly asked to assume the current web app is not ready for public store submission.

### Files Read

- `docs/codex-audits/forma-mobile-performance-audit.md`
- `docs/codex-audits/settings-capability-matrix.md`
- `docs/ACCOUNT_LIFECYCLE_AND_PROFILE_BOOTSTRAP_SPEC.md`
- `docs/AUTH_AND_SUPABASE_RELIABILITY_SPEC.md`
- `docs/FINAL_PRODUCT_HARDENING_AND_RELEASE_GATE.md`
- `docs/MANUAL_QA_RELEASE_PACK.md`
- `package.json`
- `vercel.json`
- `src/trainer-dashboard.jsx`
- `src/domains/settings/SettingsAdvancedSection.jsx`
- `src/domains/settings/SettingsPreferencesSection.jsx`
- `src/modules-auth-storage.js`
- `api/auth/delete-account.js`
- `api/auth/forgot-password.js`

### Files Changed

- `docs/codex-audits/app-store-readiness-plan.md`

### Commands Run

- `rg -n "TestFlight|App Store|Play Store|Play testing|Capacitor|React Native|native|HealthKit|Apple Health|push|notification|privacy|account deletion|delete account|support URL|privacy policy|Terms|service worker|mobile" docs src package.json e2e tests -S`
- `Get-Content docs/codex-audits/forma-mobile-performance-audit.md`
- `Get-Content docs/codex-audits/settings-capability-matrix.md`
- `Get-Content docs/ACCOUNT_LIFECYCLE_AND_PROFILE_BOOTSTRAP_SPEC.md`
- `Get-Content docs/AUTH_AND_SUPABASE_RELIABILITY_SPEC.md`
- `Get-Content docs/FINAL_PRODUCT_HARDENING_AND_RELEASE_GATE.md -TotalCount 220`
- `Get-Content docs/MANUAL_QA_RELEASE_PACK.md -TotalCount 260`
- `rg -n "privacy policy|support email|support url|support@|contact us|terms of service|terms|delete my account|account deletion|delete account|data safety|privacy label|app store|play store|testflight|internal testing" docs src api public package.json -S`
- `rg -n "capacitor|cordova|react-native|webview|webkit.messageHandlers|HealthKit|Apple Health|Health Connect|push notification|Notification\\(|reminder|garmin" docs src api package.json -S`
- `Get-ChildItem -Recurse -File docs,src,api | Where-Object { $_.Name -match 'privacy|support|terms|delete|account' } | Select-Object -ExpandProperty FullName`
- `Get-Content vercel.json -TotalCount 260`

### Official Sources Checked

- `https://developer.apple.com/app-store/review/guidelines/`
- `https://developer.apple.com/support/offering-account-deletion-in-your-app/`
- `https://developer.apple.com/testflight/`
- `https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information`
- `https://support.google.com/googleplay/android-developer/answer/9845334`
- `https://support.google.com/googleplay/android-developer/answer/9859152`
- `https://support.google.com/googleplay/android-developer/answer/10787469`
- `https://support.google.com/googleplay/android-developer/answer/10144311`
- `https://support.google.com/googleplay/android-developer/answer/13327111`

### Failing Tests

- None run in this pass. This was a launch-plan and documentation pass only.

### Passing Tests

- None run in this pass. This was a launch-plan and documentation pass only.

### Evidence Gathered

- The repo does not currently contain a native iOS or Android client or wrapper project.
- The repo's own mobile performance audit still shows a slow cold-start mobile path, even after the split-build improvement.
- The current Settings capability matrix still marks reminder delivery as planned, Apple Health as partial, Garmin as conditional, and delete-account as deployment-dependent.
- The repo search did not surface a public privacy policy page, public support page, or public account deletion help page.
- The repo already has a real staging sync harness in `e2e/real-sync-staging.spec.js`, which should become a store-readiness gate rather than just a test artifact.
- Apple and Google both have explicit privacy, account deletion, and beta/distribution metadata expectations that FORMA cannot honestly meet yet with the current repo state.

### Open Risks

- A thin wrapped-web submission would likely expose too many not-yet-real capabilities unless store-build gating becomes much stricter.
- Public-store submission remains blocked on public privacy/support/deletion assets, not just code readiness.
- Apple Health and Garmin copy currently appear in consumer flows in ways that should be hard-hidden for store builds unless the native path is truly live.
- Internal-only policy leniency on Google Play could hide launch risk if FORMA mistakes "allowed to upload" for "ready for testers."

### Next Smallest Step

- Scaffold the native wrapper path, then publish the public privacy/support/account-deletion pages and use the existing real-sync staging harness as a hard gate before any internal mobile distribution.

## Private Friends-And-Family Beta Plan - 2026-04-17

### Assumptions

- The user asked for a private beta plan, not a broader launch plan or product expansion.
- The beta should optimize only for the current core loop:
  - trust the plan
  - log workouts quickly
  - keep data across devices
- The beta should be designed around the current proven trust boundary, not the future ideal product boundary.

### Files Read

- `docs/codex-audits/app-store-readiness-plan.md`
- `docs/MANUAL_QA_RELEASE_PACK.md`
- `docs/ADVERSARIAL_USER_TEST_MATRIX_AND_RELEASE_GATE.md`
- `docs/codex-audits/peter-persistence-adaptation-proof.md`
- `docs/codex-audits/local-first-vs-signed-in-guarantees.md`
- `docs/codex-audits/sync-degradation-recovery-proof.md`
- `docs/codex-audits/cloud-sync-launch-blocker-audit.md`

### Files Changed

- `docs/codex-audits/private-friends-family-beta-plan.md`

### Commands Run

- `Get-Content docs/codex-audits/app-store-readiness-plan.md -TotalCount 260`
- `Get-Content docs/MANUAL_QA_RELEASE_PACK.md -TotalCount 220`
- `Get-Content docs/ADVERSARIAL_USER_TEST_MATRIX_AND_RELEASE_GATE.md -TotalCount 240`
- `Get-Content docs/codex-audits/peter-persistence-adaptation-proof.md -TotalCount 220`
- `Get-Content docs/codex-audits/local-first-vs-signed-in-guarantees.md -TotalCount 220`
- `Get-Content docs/codex-audits/sync-degradation-recovery-proof.md -TotalCount 220`
- `Get-Content docs/codex-audits/cloud-sync-launch-blocker-audit.md -TotalCount 220`

### Failing Tests

- None run in this pass. This was a beta-plan and documentation pass only.

### Passing Tests

- None run in this pass. This was a beta-plan and documentation pass only.

### Evidence Gathered

- The repo already has release-gate and manual-QA docs, but they are broader than a friends-and-family beta and needed a narrower core-loop-only plan.
- Current deterministic evidence supports a narrow beta using:
  - fresh accounts
  - phone-first setup
  - local-first plus later second-device verification
- Current deterministic evidence does not support using this beta to imply:
  - populated-cloud merge safety
  - degraded signed-in sync recovery without risk
  - broad integration readiness
- The private beta plan therefore intentionally excludes reminder, Apple Health, Garmin, and other not-yet-real or not-yet-proven capabilities from the tester mission.

### Open Risks

- If operators ignore the fresh-account rule, testers may fall into currently unproven merge paths and report failures that the beta was supposed to avoid.
- If the beta brief is vague, testers will naturally wander into out-of-scope surfaces and create noisy feedback about features that are intentionally not part of this trust pass.
- The current plan is operationally honest, but it still depends on the team actually enforcing the gate order and kill criteria rather than treating the beta as a soft launch.

### Next Smallest Step

- Turn this plan into the actual tester invite packet and release worksheet, then require every beta build to attach current core-loop test results before invites go out.

## Launch Positioning Options - 2026-04-17

### Assumptions

- The user asked for positioning work, not runtime code changes.
- Running Genie is a live market comparator, so official current sources were checked instead of relying on memory.
- The positioning recommendation should follow repo truth, not aspirational product breadth.

### Files Read

- `docs/MASTER_SPEC.md`
- `docs/codex-audits/app-store-readiness-plan.md`
- `docs/codex-audits/private-friends-family-beta-plan.md`
- `docs/codex-audits/settings-capability-matrix.md`
- `docs/codex-audits/peter-independent-audit-report.md`

### Files Changed

- `docs/codex-audits/launch-positioning-options.md`

### Commands Run

- `rg -n "hero|tagline|subtitle|positioning|brand promise|launch positioning|everyday athlete|hybrid|run\\+strength|visible performance|serious everyday athletes|adaptive coach|running coach" docs src package.json -S`
- `Get-Content docs/MASTER_SPEC.md -TotalCount 80`
- `Get-Content docs/codex-audits/app-store-readiness-plan.md -TotalCount 220`
- `Get-Content docs/codex-audits/private-friends-family-beta-plan.md -TotalCount 180`
- `Get-Content docs/codex-audits/settings-capability-matrix.md -TotalCount 120`
- `Get-Content docs/codex-audits/peter-independent-audit-report.md -TotalCount 260`

### Official Sources Checked

- `https://therunninggenie.com/`
- `https://apps.apple.com/in/app/running-genie-ai-coach/id6742008915`

### Failing Tests

- None run in this pass. This was a positioning and documentation pass only.

### Passing Tests

- None run in this pass. This was a positioning and documentation pass only.

### Evidence Gathered

- The repo's internal product language already leans toward "fitness operating system," but that is broader than the current public-proof boundary.
- The strongest repo-backed public wedge is hybrid run-plus-strength planning:
  - hybrid architecture is first-class in planning
  - nutrition and recovery already support hybrid days explicitly
  - the app has significant trust work around one plan across Today, Program, Log, Nutrition, and Coach
- Running Genie appears to own a narrow running-only story around AI running coaching, Strava-linked adaptation, and race-plan support.
- That makes FORMA's best contrast not "better running AI," but "one adaptive system for people who want the run and the lift to stay real at the same time."
- The "goal-based fitness operating system" framing is strong internally but too broad for launch.
- The "visible performance target" framing is viable, but it drifts too close to appearance or physique territory that the repo still marks as only loosely approximated.

### Open Risks

- If public positioning gets too broad too early, it will invite scrutiny on reminders, device integrations, and other not-yet-ready surfaces.
- If positioning leans too hard into visible-abs or physique outcomes, it will outrun the current support-tier honesty work.
- If positioning tries to compete head-on with running-only apps using running-only language, FORMA will sound less differentiated instead of more.

### Next Smallest Step

- Use the recommended hybrid wedge to rewrite the homepage and app-store copy, then pressure-test it against the current beta scope so public language and current product truth still match.

## Nutrition Individualization Closure - 2026-04-17

### Assumptions

- The user wanted the remaining nutrition honesty gap solved in product terms, not just restated in docs.
- The most important unresolved limit was the lack of a first-class maintenance and weekly-deficit model, not just meal variety.
- Cuisine preferences only add value if they steer meal examples while leaving macro and fueling logic intact.

### Files Read

- `src/modules-nutrition.js`
- `src/trainer-dashboard.jsx`
- `src/domains/settings/SettingsPreferencesSection.jsx`
- `src/services/canonical-athlete-service.js`
- `src/services/audits/nutrition-compatibility-audit-service.js`
- `tests/nutrition-engine-variation.test.js`
- `tests/nutrition-compatibility-audit-service.test.js`
- `tests/canonical-athlete-service.test.js`
- `docs/codex-audits/forma-nutrition-performance-redesign.md`
- `docs/codex-audits/peter-nutrition-target-audit.md`

### Files Changed

- `src/modules-nutrition.js`
- `src/trainer-dashboard.jsx`
- `src/domains/settings/SettingsPreferencesSection.jsx`
- `src/services/canonical-athlete-service.js`
- `src/services/audits/nutrition-compatibility-audit-service.js`
- `tests/nutrition-engine-variation.test.js`
- `tests/nutrition-compatibility-audit-service.test.js`
- `tests/canonical-athlete-service.test.js`
- `docs/codex-audits/forma-nutrition-performance-redesign.md`
- `docs/codex-audits/peter-nutrition-target-audit.md`

### Commands Run

- `rg -n "nutritionPreferenceState|preferredCuisines|energyModel|explicitModelActive|cuisinePreferenceLine|patchNutritionPreferences|adaptiveContext\\.energy" src tests -S`
- `Get-Content src/modules-nutrition.js | Select-Object -Skip 500 -First 220`
- `Get-Content src/modules-nutrition.js | Select-Object -Skip 1240 -First 420`
- `Get-Content src/domains/settings/SettingsPreferencesSection.jsx | Select-Object -First 260`
- `Get-Content src/services/audits/nutrition-compatibility-audit-service.js | Select-Object -First 620`
- `node -r sucrase/register --test tests/nutrition-engine-variation.test.js tests/nutrition-compatibility-audit-service.test.js tests/canonical-athlete-service.test.js`
- `node -r sucrase/register --test tests/settings-domain-boundary.test.js tests/settings-surface-model.test.js`
- `@' ... buildPeterNutritionCompatibilityAudit() ... '@ | node -r sucrase/register -`
- `@' ... deriveAdaptiveNutrition() / deriveRealWorldNutritionEngine() ... '@ | node -r sucrase/register -`
- `node -r sucrase/register --test tests/nutrition-engine-variation.test.js tests/nutrition-compatibility-audit-service.test.js tests/canonical-athlete-service.test.js`
- `node scripts/build.js`

### Failing Tests

- First nutrition pass failed 2 targeted assertions:
  - `tests/nutrition-compatibility-audit-service.test.js`
    - Peter recovery calories rose from the old inferred-cut expectation to `2319` because the new explicit energy model now protects even recovery days from carrying too much weekly deficit.
  - `tests/nutrition-engine-variation.test.js`
    - Cuisine preferences were not part of the top-3 daily bullets by design, so the assertion was moved to the meal-slot and rationale surfaces where cuisine steering actually appears.

### Passing Tests

- `node -r sucrase/register --test tests/nutrition-engine-variation.test.js tests/nutrition-compatibility-audit-service.test.js tests/canonical-athlete-service.test.js`
  - `14` tests passed
- `node -r sucrase/register --test tests/settings-domain-boundary.test.js tests/settings-surface-model.test.js`
  - `7` tests passed
- `node scripts/build.js`
  - passed

### Evidence Gathered

- The nutrition layer now stores a first-class `energyModel` with:
  - maintenance estimate
  - maintenance estimate source
  - weekly deficit target
  - weekly deficit source
  - per-day deficit budget
  - minimum allowed calories
  - guardrail status
- Peter's nutrition audit is now `compatible` instead of `compatible_with_gaps`, and the old `moderate_cut_is_relative_not_first_class` risk no longer appears.
- Recovery and strength days can still carry a deficit, but the saved weekly target now caps how much of that deficit those days are allowed to absorb.
- Settings now expose:
  - maintenance estimate
  - weekly cut target
  - preferred cuisines
- Preferred cuisines steer meal-slot examples and rationale lines without altering macro targets or fueling logic.
- Canonical athlete state now carries preferred cuisines so the preference is part of saved user intent instead of being an isolated UI toggle.

### Open Risks

- This still is not a fully individualized endurance nutrition system:
  - sweat-rate is not individualized
  - sodium remains heuristic
  - GI tolerance is not modeled
  - race-day product preference is not modeled
  - event-specific carb-loading remains day-type based, not protocol based
- The maintenance estimate can still be heuristic when the user has not saved one manually.
- Cuisine preferences improve adherence and realism, but they do not solve physiology-level personalization on their own.

### Next Smallest Step

- Add individualized sweat-rate and GI-tolerance inputs only if we are ready to use them deterministically in the fueling and hydration layer, rather than collecting extra settings that do not materially change prescriptions.

## 2026-04-17 Signed-In Degraded Sync Recovery Closure

### Assumptions

- The highest-value next trust ticket was the signed-in degraded-sync path because the repo still said retry/outage recovery could drop user-visible workout and nutrition detail.
- The smallest safe fix was to harden local-vs-cloud authority during recovery, not to invent a merge system.
- Same-device recovery can be fixed independently without pretending populated-cloud conflict handling is solved.

### Files Read

- `src/modules-auth-storage.js`
- `e2e/signed-in-adaptation-trust.spec.js`
- `e2e/local-sync-trust.spec.js`
- `tests/auth-storage-local-authority.test.js`
- `docs/codex-audits/sync-degradation-recovery-proof.md`
- `docs/codex-audits/local-first-vs-signed-in-guarantees.md`
- `docs/codex-audits/peter-persistence-adaptation-proof.md`

### Files Changed

- `src/modules-auth-storage.js`
- `tests/auth-storage-local-authority.test.js`
- `e2e/signed-in-adaptation-trust.spec.js`
- `e2e/local-sync-trust.spec.js`
- `docs/codex-audits/sync-degradation-recovery-proof.md`
- `docs/codex-audits/local-first-vs-signed-in-guarantees.md`
- `docs/codex-audits/peter-persistence-adaptation-proof.md`

### Commands Run

- `Get-Content docs/codex-audits/sync-degradation-recovery-proof.md -TotalCount 260`
- `Get-Content e2e/signed-in-adaptation-trust.spec.js -TotalCount 920`
- `Get-Content tests/auth-storage-local-authority.test.js -TotalCount 460`
- `rg -n "Reload cloud data|pendingCloudWrite|sbLoad\\(|syncMeta|reload cloud data|Cloud data could not be reloaded right now|local authority" src -S`
- `Get-Content src/modules-auth-storage.js | Select-Object -First 240`
- `Get-Content src/modules-auth-storage.js | Select-Object -Skip 980 -First 420`
- `Get-Content src/trainer-dashboard.jsx | Select-Object -Skip 6660 -First 120`
- `node -r sucrase/register --test tests/auth-storage-local-authority.test.js`
- `cmd /c npx playwright test e2e/signed-in-adaptation-trust.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/local-sync-trust.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/local-sync-trust.spec.js -g "reload during retry keeps the pending marker and preserves the unsynced nutrition detail" --reporter=line`
- `node scripts/build.js`

### Failing Tests

- `cmd /c npx playwright test e2e/local-sync-trust.spec.js --reporter=line`
  - 1 unrelated existing failure remained in `profile, goals, workout logs, and nutrition logs sync across two signed-in devices and survive hard refresh`
  - the failure was a missing `today-session-card` on device two after boot and was not in the degraded-sync path changed here

### Passing Tests

- `node -r sucrase/register --test tests/auth-storage-local-authority.test.js`
  - `9` tests passed
- `cmd /c npx playwright test e2e/signed-in-adaptation-trust.spec.js --reporter=line`
  - `9` tests passed
- `cmd /c npx playwright test e2e/local-sync-trust.spec.js -g "reload during retry keeps the pending marker and preserves the unsynced nutrition detail" --reporter=line`
  - `1` test passed
- `node scripts/build.js`
  - passed

### Evidence Gathered

- The storage seam bug was concrete: pending local cache could lose authority during recovery if the payload differed from cloud but top-level timestamps did not clearly outrank cloud.
- `shouldPreferPendingLocalCache` now treats differing pending local payloads as authoritative during same-device recovery, even when timestamp comparison alone is not enough.
- Browser proof now shows:
  - explicit `Reload cloud data` recovery preserves workout detail after retry
  - explicit `Reload cloud data` recovery preserves nutrition detail after retry
  - signed-in reopen during retry preserves pending workout detail
  - signed-in reopen during retry preserves pending nutrition detail
  - reload during retry preserves pending nutrition detail
- The old degraded-sync trust docs were outdated after the fix and were updated to reflect the new browser-proof boundary.

### Open Risks

- This still does not prove safe merge if another device changed the same cloud row during the unsynced window.
- It still does not prove that degraded-sync recovery can never trigger duplicate future adaptations end-to-end in the browser.
- One unrelated two-device sync test in `e2e/local-sync-trust.spec.js` is still failing and needs its own pass.

### Next Smallest Step

- Add one browser proof that a recovered retry/outage path updates the future plan exactly once, so duplicate-adaptation avoidance is proven above the storage seam as well.
