# Adaptive Learning Adversarial Audit

Updated: 2026-04-18

## Executive Verdict

Verdict: `NOT READY FOR LIVE ADAPTIVE PRESCRIPTION`

Short version:

- The codebase is structurally ready for adaptive scaffolding, shadow-mode plumbing, and offline evaluation.
- The codebase is not yet reliable enough to let adaptive logic influence live prescriptions.
- The main blockers are not model cleverness. They are data integrity, event semantics, linkage quality, and sync trust.

The honest read is:

- Safe now: bounded scaffolding, internal diagnostics, offline analysis, fixture-driven shadow evaluation, and very limited shadow-data collection if it stays invisible to users.
- Not safe now: any adaptive logic that changes live prescriptions for normal users.

If adaptive were turned on too early, the app would learn from a mix of:

- recommendations the user never actually saw
- outcomes linked back to recomputed ids instead of the originally served recommendation
- weak medium-horizon labels derived from text heuristics
- a still-optional dedicated sink that is newer than the payload-backed path and not yet proven as the primary source of truth

That would create product debt faster than it creates useful intelligence.

## Direct Answers To The Hard Questions

### Is the current app state reliable enough to support learning from outcomes?

Not for live adaptive prescription. It is reliable enough for:

- schema scaffolding
- offline analysis
- bounded shadow-mode plumbing
- operator review workflows

It is not yet reliable enough for live policy influence because the app still has unresolved truth problems around recommendation exposure, recommendation-to-outcome lineage, and event durability.

### Where would training-serving skew happen?

The biggest skew points today are:

- recommendation events are often emitted when a recommendation is computed, not when a user actually sees it
- recommendation join keys are rebuilt from current plan state during later logging and weekly review flows
- weekly and medium-horizon labels still lean on heuristic text summaries
- adaptive history persists through the same sync path that is still the remaining consumer-launch blocker

### Which current features produce noisy or misleading signals?

Most noisy today:

- Today, Program, and Nutrition recommendation events that can exist without proven user impression
- partial workout logs where the user confirms only part of a mixed session
- weekly summary text and note fields used as progress proxies
- copy-driven change summaries that are currently part of some dedupe semantics
- local-only or degraded-sync sessions where the event history may be delayed, merged, or truncated later

### Which surfaces contradict each other in ways that would poison the learning loop?

The UI copy is more aligned than before, but the event semantics are not yet aligned enough:

- Coach has stronger shown, accepted, and ignored semantics than Today, Program, and Nutrition.
- Log records actual execution, but Today and Program currently do not prove that the same recommendation version was the one the user saw before logging.
- Program and Today can both reference the same plan change, but the learning layer still treats those more like computed artifacts than view-verified exposures.

### What critical instrumentation is missing?

Still missing:

- recommendation viewed or impression events for Today, Program, and Nutrition
- durable served recommendation ids carried into later logs and reviews
- first-class missed-session and no-log events
- a proven, configured append-only cloud ingestion path outside the main `trainer_data` payload
- operator metrics for join failure, duplicate rate, pruning, and replay lag in real environments

### What minimum bar must be met before adaptive logic touches live prescriptions?

At minimum:

- real staging two-device sync is green
- recommendation impression logging exists for major recommendation surfaces
- recommendation-to-outcome join coverage is high and measured
- missed-session events exist without relying on weekly text summaries
- adaptive events have a durable cloud path outside the main synced state payload
- at least one lever has real shadow evidence with zero harmful cohorts

### What low-risk learning levers exist today?

Only bounded, packaging-oriented levers:

- `travel_substitution_set`
- `time_crunched_session_format_choice`
- `hybrid_session_format_choice`

Even those should remain shadow-only until the data truth issues are fixed.

### What should be explicitly out of scope?

- freeform workout generation
- injury, rehab, or medical adaptive guidance
- hidden coach-driven program rewrites
- unsupported sport expansion
- dynamic weekly structure invention outside approved candidate sets
- user-facing claims that the system "learned" something when confidence is weak

## Ranked Blockers

| Rank | Blocker | Severity | Why it blocks adaptive learning | Primary files |
| --- | --- | --- | --- | --- |
| `B1` | Recommendation exposure is logged on compute, not on actual user impression. | `P0` | The system often records that a recommendation existed before we know whether the user actually saw it. That poisons any future "ignored vs followed" learning loop. | `src/trainer-dashboard.jsx`, `src/services/adaptive-learning-domain-service.js` |
| `B2` | Outcome linkage is recomputed at log time instead of persisted from the served recommendation. | `P0` | Workout and weekly outcomes rebuild `recommendationJoinKey` from current plan state. If the plan shifts, labels change, or the day is adjusted before logging, the outcome can attach to the wrong recommendation. | `src/trainer-dashboard.jsx`, `src/services/adaptive-learning-event-service.js` |
| `B3` | Adaptive history rides inside the same `trainer_data` payload as the product state. | `P0` | Sync reliability is still an open launch blocker, and adaptive events are currently downstream of that same path. Missing or stale cloud sync means missing or skewed learning data. | `src/modules-auth-storage.js`, `src/services/adaptive-learning-store-service.js`, `docs/CLOUD_SYNC_ROOT_CAUSE_AND_VERIFICATION.md` |
| `B4` | A dedicated server-side sink now exists, but it is optional, unproven, and not yet the primary source of truth. | `P0` | Events can now replay to a dedicated endpoint, but the product still depends on the main synced payload as fallback history. That is better than before, but not yet the durability bar for live adaptive prescription. | `src/services/adaptive-learning-store-service.js`, `src/services/adaptive-learning-sink-service.js`, `api/adaptive-learning/events.js`, `scripts/run-adaptive-learning-export.js` |
| `B5` | Medium-horizon labels are weak and text-derived. | `P1` | Weekly progress is partly inferred from text like `summary`, `note`, and `goalProgressSignal`, plus heuristic scoring. That is too noisy for promotion decisions. | `src/services/adaptive-learning-analysis/feature-engineering.js`, `src/services/adaptive-learning-domain-service.js` |
| `B6` | Missing first-class negative labels for non-engagement. | `P1` | The app has strong logging for accepted actions and workout logs, but it still lacks a clean "served, seen, and not acted on" path for most recommendations outside Coach. | `src/trainer-dashboard.jsx`, `src/services/adaptive-learning-domain-service.js` |
| `B7` | Dedupe keys are partly built from mutable copy and summaries. | `P1` | Some recommendation event dedupe keys include labels, summaries, or change headlines. Copy changes can create fake new recommendations in the data. | `src/trainer-dashboard.jsx` |
| `B8` | Client performance and payload growth are already tight. | `P1` | The split build still ships a large client bundle, and adaptive history is posted with ordinary state saves. More client-side adaptive work will add latency before the sink is separated. | `src/trainer-dashboard.jsx`, `src/modules-auth-storage.js`, `scripts/build.js` |
| `B9` | Event emission lives in high-churn UI/runtime code. | `P2` | Critical recommendation events are emitted from `useEffect` blocks in `trainer-dashboard.jsx`. That makes them vulnerable to UI dependency drift and duplicate semantics. | `src/trainer-dashboard.jsx` |
| `B10` | The current promotion evidence is still fixture-heavy. | `P2` | The shadow gate is useful, but the current "harmful cohort" evidence is still synthetic. It is a safety signal, not proof of production behavior. | `artifacts/adaptive-launch-readiness/results.json`, `artifacts/adaptive-policy-shadow-evaluation/results.json` |

## Why These Blockers Matter By Audit Area

### 1. Data Integrity

The schema layer is solid. The data source is not.

What is good:

- strict event names and schema versions
- validation before persistence
- dedupe support
- bounded candidate-action contracts

What is risky:

- event history is client-owned
- event history is truncated locally
- event durability depends on the same product sync path that is still not fully closed for launch
- the new dedicated sink is not yet proven or authoritative enough to replace the payload-backed fallback

### 2. Cloud / Sync Reliability

This is the biggest non-adaptive blocker that still matters for adaptive learning.

The launch dashboard still calls real cross-device sync an open `P0`. That alone means adaptive learning should not drive live behavior yet. If product sync is not fully verified across refresh and devices, adaptive data will be incomplete, duplicated, or stale in exactly the hardest-to-debug cases.

### 3. Recommendation-Outcome Linkage

This is the highest-risk technical flaw in the current design.

The app has a `recommendationJoinKey`, but it is not treated as the canonical served recommendation id all the way through execution. In several places it is rebuilt from current plan state instead of carried forward from the originally served prescription.

That creates classic training-serving skew:

- training data says the user was served recommendation `A`
- execution is logged against recomputed recommendation `B`
- the learner thinks `B` succeeded or failed when the user actually saw `A`

### 4. Cross-Surface Consistency

Consumer surfaces are better than before, but the learning loop still lacks surface-specific exposure truth.

Today, Program, Nutrition, Coach, and Log are increasingly aligned in UI copy, yet the adaptive event model still does not distinguish:

- computed recommendation
- surfaced recommendation
- viewed recommendation
- acted-on recommendation

That means cross-surface contradictions would be hard to detect from learning data alone.

### 5. Logging Completeness

Workout logs are the strongest signal today.

Still missing or weak:

- explicit "user saw the plan but skipped logging" event
- explicit no-log cutoff event per recommendation
- clear structured reason for many misses beyond weekly review summaries
- stronger session-level actuals for mixed or modified days

### 6. Missing Labels / Weak Labels

Current labels are good enough for exploration, not for policy activation.

Weak spots:

- weekly progress uses text token heuristics
- nutrition success is coarse
- coach ignore and accept semantics are better than the rest, but still partly timestamp-deduped
- recommendation impressions are not first-class for most surfaces

### 7. User Trust / Explainability Gaps

The explanation layer is good enough for future adaptive trust, but only if the underlying decision lineage becomes cleaner.

Right now the bigger trust risk is not creepy copy. It is incorrect or unstable attribution:

- "we shortened this because that works better for you"
- but the event trail cannot cleanly prove what version of the recommendation the user actually saw and followed

### 8. Safety Risk

The bounded decision-point model is the right architecture. That is a real strength.

Still unsafe for live activation:

- progression aggressiveness already shows a harmful cohort in the fixture gate
- there is no real-world harmful-cohort burn-in on staging or production shadow data
- no injury or medical guidance should ever be in scope for adaptive mutation

### 9. Performance Cost

Adaptive scaffolding is cheap enough now. Full client-resident adaptive history is not a good long-term cost model.

Current cost concerns:

- split build app bundle is still large
- adaptive snapshot is bundled into ordinary cloud saves
- every extra event increases payload size, replay work, and merge complexity

### 10. Architectural Fit

This is the most encouraging part of the audit.

Good fit:

- bounded decision registry
- explicit safe levers
- shadow and active modes
- policy promotion workflow
- trusted-local diagnostics

Bad fit:

- critical emitters still live in `trainer-dashboard.jsx`
- persistence still uses product state payloads instead of a dedicated learning stream

### 11. Testing Gaps

The current test suite is strong on schemas and fixture evaluation, but thin on real semantic integrity.

Missing high-value tests:

- recommendation generated vs recommendation actually viewed
- served join key surviving refresh, edit, and cross-device handoff
- silent truncation alerts once event volume crosses thresholds
- real no-log and miss labeling
- shadow-mode metrics from non-fixture staging data

### 12. Rollout Risk

Current rollout risk is high if anyone is tempted to skip straight from scaffold to active mode.

Why:

- the shadow gate already says `keep_in_shadow`
- harmful cohort count is non-zero
- no decision point is currently eligible
- the product still has one open `P0` in core sync

## Features Most Likely To Poison A Learning Loop Today

Ranked by how much misleading signal they could generate:

1. Plan-generation and day-prescription emits that occur before user view confirmation
2. Recomputed `recommendationJoinKey` values during workout logging and weekly evaluation
3. Weekly evaluation summaries that derive progress sentiment from free text
4. Mutable change headlines and labels used inside dedupe semantics
5. Local-only or degraded-sync sessions that later merge into cloud history without a separate immutable sink

## Cross-Surface Contradictions That Still Matter For Learning

These do not necessarily break the product UI today, but they would distort adaptive learning:

- Coach has explicit accept and ignore semantics, while Today and Program are still mostly compute-time emits.
- Today can show a recommendation that later changes before the user logs, but the later outcome path may rebuild linkage from the new state.
- Nutrition recommendations are logged, but follow-through is still much coarser than workout execution, so nutrition outcomes are easier to over-trust than the data deserves.
- Log is the strongest execution surface, but it can still capture modified or partial completion without preserving the exact served recommendation lineage well enough.

## Safe Starting Points

These are the only adaptive levers I would consider "safe to start here," and even these should start in shadow-only mode.

| Rank | Lever | Why it is relatively safe | Current status |
| --- | --- | --- | --- |
| `S1` | `travel_substitution_set` | It is bounded, user-visible, low-medical-risk, and primarily changes fallback packaging rather than core load. | Good shadow candidate |
| `S2` | `time_crunched_session_format_choice` | It optimizes adherence-friendly packaging without inventing new training domains. | Good shadow candidate |
| `S3` | `hybrid_session_format_choice` | It is the most promising hybrid slice for adherence learning if hybrid cohort labels are strengthened. | Shadow only for now |
| `S4` | `hybrid_run_lift_balance_template` | Valuable, but riskier because it touches interference tradeoffs. Needs stronger labels first. | Shadow only |
| `S5` | `deload_timing_window` | Potentially useful, but should stay conservative until miss and pain labels improve. | Shadow only |

Current explicit non-starter:

- `progression_aggressiveness_band`
  The current fixture gate already surfaces a harmful cohort, and this lever touches training strain more directly than the packaging-oriented options above.

Not safe to start:

- anything injury-sensitive
- anything freeform
- anything that changes weekly structure beyond the approved candidate set

## Minimum Viable Adaptive-Learning Roadmap

### Phase 0: Data Truth Before Learning

Do this first.

1. Add recommendation impression events for:
   - Today
   - Program
   - Nutrition
   - Coach
2. Persist the originally served `recommendationJoinKey` and `decisionId` on:
   - rendered plan day and week records
   - workout log drafts and saved logs
   - nutrition log drafts and saved logs
3. Add a first-class no-log and missed-session event instead of relying mainly on weekly summaries.
4. Add monitoring for:
   - validation discard rate
   - duplicate event rate
   - join success rate
   - pruned event count
   - replay lag

### Phase 1: Separate Durability From Product State

1. Add a server-side append-only sink or export path for adaptive events.
2. Stop treating `trainer_data` as the long-term learning ledger.
3. Keep local buffering, but make cloud ingestion independent of full trainer payload sync.

### Phase 2: Shadow Mode With Real Data

1. Enable bounded shadow mode only.
2. Run it on staging and then limited internal production cohorts.
3. Collect real shadow data before any policy promotion.
4. Review harmful cohorts manually.

### Phase 3: One Narrow Active Lever

Only after the prior phases are complete:

1. Promote a single low-risk lever.
2. Prefer `travel_substitution_set` or `time_crunched_session_format_choice`.
3. Keep global kill switch and per-decision-point kill switch verified.

## Suggested Implementation Order

1. Fix recommendation impression vs compute logging.
   - `src/trainer-dashboard.jsx`
   - `src/services/adaptive-learning-domain-service.js`
2. Persist served recommendation ids through execution.
   - `src/trainer-dashboard.jsx`
   - `src/services/persistence-adapter-service.js`
   - `src/services/persistence-contract-service.js`
3. Add first-class missed-workout and no-log events.
   - `src/services/adaptive-learning-domain-service.js`
   - `src/trainer-dashboard.jsx`
4. Move adaptive event durability off `trainer_data`.
   - `src/modules-auth-storage.js`
   - `src/services/adaptive-learning-store-service.js`
   - `src/services/adaptive-learning-sink-service.js`
   - `api/adaptive-learning/events.js`
5. Strengthen weekly labels with more objective signals.
   - `src/services/adaptive-learning-analysis/feature-engineering.js`
   - `src/services/adaptive-learning-domain-service.js`
6. Only then expand real shadow mode collection and promotion review.

## Minimum Bar Before Adaptive Logic Touches Live Prescriptions

At minimum, all of these must be true:

- real staging two-device sync is green
- recommendation impression logging exists
- recommendation-to-outcome join coverage is high and measured
- duplicate-event rate is low and measured
- no-log and skipped-day events exist
- adaptive events have verified cloud ingestion outside the main product payload
- at least one lever has real shadow evidence with no harmful cohort

Without that bar, active adaptive prescription is not smart product work. It is optimism debt.

## Suggested Shadow-Mode Acceptance Criteria

Treat shadow mode as blocked until all of these are true:

- recommendation impression logging exists for Today, Program, Nutrition, and Coach
- at least `90%` of workout recommendation outcomes join back to the originally served recommendation
- at least `80%` of nutrition and coach outcomes join back cleanly
- duplicate-event rate is below `1%`
- validation discard rate is below `0.5%`
- pruned-event count is visible in diagnostics and not silently hidden
- real staging sync is green across refresh and two devices
- shadow data is collected without surfacing any adaptive messaging in consumer mode

## Suggested Active-Mode Acceptance Criteria

Treat active mode as blocked until all shadow criteria are green, plus:

- at least one decision point has `300+` real shadow rows
- at least one decision point has `50+` real holdout rows
- harmful cohort count is `0` for the exact decision point being promoted
- estimated benefit is at least `0.01`
- potential harm is at most `0.005`
- average confidence is at least `55`
- global kill switch and per-decision-point kill switch are both verified in staging
- operator review signs off on the exact evidence snapshot and cohort breakdown

## Explicitly Out Of Scope

Keep these out of scope for the next phase:

- freeform workout generation
- injury, rehab, or medical prescription
- coach-authored plan rewrites
- unsupported sport-domain invention
- dynamic weekly structure generation beyond approved candidate sets
- user-facing "AI learned this" claims

## Test TODOs

- Add a test that `recommendation_generated` and `recommendation_viewed` are separate events with separate semantics.
- Add a test that a served `recommendationJoinKey` survives refresh, later logging, and cross-device sync.
- Add a test that copy-only changes do not produce a new logical recommendation id.
- Add a test that no-log and missed-session events fire without needing a weekly review summary.
- Add a test that adaptive event history pruning emits diagnostics instead of silently hiding overflow.
- Add a real-data shadow-eval regression pack that is not fixture-only.
