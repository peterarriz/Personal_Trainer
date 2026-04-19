# Adaptive Learning Backlog

Updated: 2026-04-18

This backlog translates the adversarial audit into the minimum engineering work required before adaptive prescription should influence live users.

## P0: Must Happen Before Real Shadow Data Matters

- [ ] Add recommendation impression events for Today, Program, Nutrition, and Coach.
  Owner area:
  `src/trainer-dashboard.jsx`, `src/services/adaptive-learning-domain-service.js`
  Why:
  We cannot learn from recommendations the user never actually saw.

- [ ] Persist the originally served `recommendationJoinKey` and `decisionId` through later execution flows.
  Owner area:
  `src/trainer-dashboard.jsx`, `src/services/persistence-adapter-service.js`, `src/services/persistence-contract-service.js`
  Why:
  Recomputing linkage at log time creates training-serving skew.

- [ ] Add first-class no-log and missed-session events.
  Owner area:
  `src/services/adaptive-learning-domain-service.js`, `src/trainer-dashboard.jsx`
  Why:
  Right now negative labels are too dependent on weekly summaries.

- [ ] Close the real cross-device sync blocker before using cloud history for learning.
  Owner area:
  `e2e/real-sync-staging.spec.js`, `docs/CLOUD_SYNC_ROOT_CAUSE_AND_VERIFICATION.md`
  Why:
  Adaptive data cannot be more trustworthy than the underlying product sync path.

## P1: Must Happen Before Any Active Adaptive Lever

- [ ] Harden the new dedicated adaptive event sink until it can replace the main `trainer_data` payload as the long-term event ledger.
  Owner area:
  `src/modules-auth-storage.js`, `src/services/adaptive-learning-store-service.js`
  Why:
  Learning history needs a durable append-only path, not a truncating client payload.

- [ ] Remove mutable copy from recommendation dedupe semantics.
  Owner area:
  `src/trainer-dashboard.jsx`, `src/services/adaptive-learning-event-service.js`
  Why:
  Copy edits should not create fake new recommendations in the data.

- [ ] Strengthen medium-horizon labels with more objective signals.
  Owner area:
  `src/services/adaptive-learning-analysis/feature-engineering.js`, `src/services/adaptive-learning-domain-service.js`
  Why:
  Text-derived progress heuristics are acceptable for exploration, not promotion.

- [ ] Generate non-fixture shadow artifacts and publish them in the launch dashboard.
  Owner area:
  `scripts/run-adaptive-policy-shadow-evaluation.js`, `scripts/run-adaptive-policy-launch-readiness.js`, `docs/LAUNCH_READINESS_DASHBOARD.md`
  Why:
  Fixture-only safety signals are useful, but not enough to justify rollout.

## P2: Quality And Sustainability

- [ ] Move more adaptive emitters out of `trainer-dashboard.jsx` into narrower domain services.
- [ ] Add diagnostics for join rate, duplicate rate, pruning, and replay lag.
- [ ] Add CI gates for adaptive shadow evaluation and launch-readiness.
- [ ] Reduce client payload growth from adaptive persistence.

## Test Backlog

- [ ] `tests/adaptive-learning-impression-linkage.test.js`
  Confirms generated, viewed, and acted-on semantics stay distinct.

- [ ] `tests/adaptive-learning-served-id-persistence.test.js`
  Confirms served recommendation lineage survives refresh and later outcome capture.

- [ ] `tests/adaptive-learning-no-log-events.test.js`
  Confirms non-engagement can be labeled without weekly text summaries.

- [ ] `tests/adaptive-learning-pruning-diagnostics.test.js`
  Confirms pruning is visible and measurable.

- [ ] `e2e/adaptive-shadow-staging.spec.js`
  Confirms shadow data is recorded in real environments without altering the user-facing product.

## Safe First Candidates After The P0 Work

Only consider these first, and only in shadow mode:

- `travel_substitution_set`
- `time_crunched_session_format_choice`
- `hybrid_session_format_choice`

Do not start with:

- `progression_aggressiveness_band`
- injury-sensitive logic
- freeform plan generation
- coach-driven hidden rewrites
