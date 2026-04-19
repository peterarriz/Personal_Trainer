# Adaptive Learning Enablement Checklist

Updated: 2026-04-18

Use this as the operational gate before enabling shadow mode or active mode.

## Shadow Mode Gate

All of these should be true before shadow mode is enabled outside fixtures:

- [ ] Real staging sync passes across refresh and two devices.
- [ ] Adaptive event validation discard rate is measured and stays below `0.5%`.
- [ ] Duplicate-event rate is measured and stays below `1%`.
- [ ] Recommendation impression events exist for Today, Program, Nutrition, and Coach.
- [ ] The originally served `recommendationJoinKey` and `decisionId` persist into later log and review flows.
- [ ] Recommendation-to-outcome join coverage is at least:
  - [ ] `90%` for workout recommendations
  - [ ] `80%` for nutrition recommendations
  - [ ] `80%` for coach recommendations
- [ ] No-log / missed-session events exist without relying on weekly text summaries.
- [ ] Real shadow artifacts can be generated from staging or production-like data, not fixtures only.
- [ ] Trusted-local diagnostics surface shows real shadow data, not fixture-only data.
- [ ] Shadow mode does not change any user-facing prescription.
- [ ] Consumer UI does not mention adaptive learning when the layer is only in shadow.

## Active Mode Gate

All shadow-mode criteria must already be green, plus:

- [ ] At least one decision point has at least `300` real shadow rows.
- [ ] At least one decision point has at least `50` real holdout rows.
- [ ] Harmful cohort count is `0` for the promoted decision point.
- [ ] Estimated benefit is at least `0.01`.
- [ ] Potential harm is at most `0.005`.
- [ ] Average confidence is at least `55`.
- [ ] Divergence rate is acceptable for the chosen lever and explicitly reviewed.
- [ ] The dedicated adaptive event sink is configured, replaying successfully, and trusted enough to stop depending on `trainer_data` as the long-term fallback.
- [ ] Global kill switch works.
- [ ] Per-decision-point kill switch works.
- [ ] Human operator review signed off on the exact evidence snapshot being promoted.
- [ ] Rollout starts limited and reversible.

## Priority Backlog

### P0

- [ ] Separate adaptive event durability from `trainer_data`.
- [ ] Persist served `recommendationJoinKey` on rendered plan records and actual logs.
- [ ] Add recommendation impression events.
- [ ] Add first-class no-log / missed-session events.
- [ ] Close the remaining real sync launch blocker before using cloud history for learning.
- [ ] Generate non-fixture shadow artifacts and attach them to the launch dashboard.

### P1

- [ ] Replace text-derived weekly progress heuristics with more objective progress signals where available.
- [ ] Add dashboard metrics for join rate, duplicate rate, replay lag, and pruned-event count.
- [ ] Remove mutable UI copy from recommendation dedupe semantics.
- [ ] Add staging shadow-data artifacts to the launch dashboard.
- [ ] Harden the new append-only sink and export path until it is trusted in staging and real shadow runs.

### P2

- [ ] Reduce client payload growth from adaptive event persistence.
- [ ] Move more emitter logic out of `trainer-dashboard.jsx` into narrower domain services.
- [ ] Add automatic operator checks for shadow eligibility in CI.

## Test TODO Checklist

- [ ] `tests/adaptive-learning-impression-linkage.test.js`
  Verify generated vs viewed semantics stay separate.
- [ ] `tests/adaptive-learning-served-id-persistence.test.js`
  Verify served recommendation ids survive refresh and later outcomes.
- [ ] `tests/adaptive-learning-no-log-events.test.js`
  Verify no-log events can be emitted without weekly review text.
- [ ] `tests/adaptive-learning-pruning-diagnostics.test.js`
  Verify event pruning is visible to diagnostics and not silent.
- [ ] `e2e/adaptive-shadow-staging.spec.js`
  Verify real shadow mode remains invisible to consumer users while recording real data.

## Explicit Non-Goals

- [ ] Do not enable freeform workout generation.
- [ ] Do not enable injury or medical adaptive guidance.
- [ ] Do not enable unsupported sport-domain rewrites.
- [ ] Do not expose raw adaptive diagnostics in consumer mode.
