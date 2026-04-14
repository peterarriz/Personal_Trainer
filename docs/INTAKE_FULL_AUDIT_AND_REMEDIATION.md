# Intake Full Audit And Remediation

## Scope

This pass audited the live intake runtime, not prior summaries, across:

- `docs/IDEAL_INTAKE_FLOW.md`
- `docs/INTAKE_AI_BOUNDARY.md`
- `src/trainer-dashboard.jsx`
- `src/services/intake-machine-service.js`
- `src/services/intake-goal-flow-service.js`
- `src/services/intake-completeness-service.js`
- `src/services/goal-feasibility-service.js`
- `src/services/goal-arbitration-service.js`
- `src/services/ai-runtime-service.js`
- `src/services/persistence-adapter-service.js`
- `src/services/intake-transcript-service.js`
- `src/services/intake-session-service.js`
- `tests/intake-*.test.js`
- `tests/goal-arbitration-service.test.js`
- `tests/goal-feasibility-service.test.js`
- `tests/ai-boundary-regression.test.js`
- `e2e/intake.spec.js`

The goal was adversarial stabilization. No new intake features were added.

## Architecture Summary

### Real flow

1. `OnboardingCoach` gathers raw goal intent plus training context in `src/trainer-dashboard.jsx`.
2. `runIntakeInterpretationRuntime(...)` may return an AI proposal, but the canonical recompute boundary is still deterministic.
3. `intakeReducer(...)` in `src/services/intake-machine-service.js` owns stage transitions.
4. `buildDeterministicIntakeDraft(...)` rebuilds:
   - goal resolution
   - intake completeness
   - feasibility
   - arbitration
   - review model
   - confirmation state
   - missing-anchor engine
5. `missingAnchorsEngine.currentAnchor` drives field-scoped clarification one anchor at a time.
6. Review state is built from the active goal stack only. Deferred and background goals stay visible, but they are not allowed to silently block confirmation.
7. `USER_CONFIRMED` creates a validated commit snapshot. `OnboardingCoach` consumes that snapshot exactly once and hands it to the existing onboarding persistence path.

### State ownership

- Temporary UI state: local React state in `OnboardingCoach`
- Canonical intake draft: `intakeMachine.draft`
- Transcript state: `messages` plus transcript/message-key refs
- Binding contract: `missingAnchorsEngine.currentAnchor`, `ui.currentBindingTarget`, `anchorBindingsByFieldId`
- Preview/proposal state: `assessmentBoundary`, `assessmentPreview`, coach-voice phrasing
- Commit gate: `draft.commitRequested` and `draft.commitRequest`
- Reload persistence: `sessionStorage` via `src/services/intake-session-service.js`
- Canonical app persistence after confirmation: existing `finishOnboarding(...)` path

### AI boundary

- AI interpretation, missing-field extraction, and coach-voice phrasing remain proposal-only.
- AI never writes canonical intake answers, goal stack truth, or planner state directly.
- Late AI transcript summaries are dropped when transitions advance.
- Deterministic validation still owns field binding and canonical writes.

## Spec Match Summary

### Runtime matches spec

- The machine is the traffic cop for stage progression.
- One answer clears only the currently bound field unless an explicit safe multi-bind mode exists.
- Confirmation is still the single canonical write gate.
- Commit requests are snapshot-based and idempotent.
- Goal edits clear stale derived state before the next interpretation pass.
- Session restore strips pending commit/outbox state instead of replaying stale writes.

### Runtime diverged before this pass

- Silent review recomputes were emitting fresh AI summaries and anchor prompts into the transcript.
- Review-lane edits were changing local review controls without immediately re-running the machine.
- Arbitration/finalization and feasibility were leaking missing-required state from deferred goals into the active confirmation gate.
- Raw-intent plus explicit-secondary-goal inputs could render the same appearance lane twice with slightly different summaries.

### Docs that were stale or underspecified

- `docs/IDEAL_INTAKE_FLOW.md` did not say that review-lane edits silently re-run the machine.
- The same doc did not make the active-stack gating rule explicit enough.

## Issue Register

### INTAKE-2026-04-01

- Severity: `high`
- Category: `transcript`
- Title: Silent review recomputes duplicated AI summaries and anchor prompts
- Files / functions:
  - `src/trainer-dashboard.jsx`
  - `src/services/intake-machine-service.js`
  - `refreshReviewMachineState(...)`
  - `INTAKE_MACHINE_EVENTS.INTERPRETATION_READY`
- Reproduction:
  1. Reach review or bounce back to clarify from review controls.
  2. Trigger any internal recompute such as goal removal, reprioritization, or confirm-time refresh.
  3. Watch identical AI summary / anchor copy re-enter the transcript.
- Why it happened:
  - Review refreshes reused `INTERPRETATION_READY`, and the reducer always emitted transcript messages for that transition.
- User impact:
  - Transcript looked chatbot-y and broken even when the underlying state change was internal only.
- Fix:
  - Added `suppress_transcript` handling to `INTERPRETATION_READY`.
  - Dashboard review refreshes now use that silent mode.
- Test:
  - `tests/intake-machine-service.test.js`
  - `e2e/intake.spec.js`
- Doc update: yes

### INTAKE-2026-04-02

- Severity: `blocker`
- Category: `state`
- Title: Review-lane edits could leave confirmation state stale until the user clicked confirm
- Files / functions:
  - `src/trainer-dashboard.jsx`
  - `setLeadingGoal(...)`
  - `updateSecondaryGoalMode(...)`
  - `toggleBackgroundPriority(...)`
- Reproduction:
  1. Reach review.
  2. Reprioritize a goal from the lane controls.
  3. Observe that local review cards moved immediately, but the machine-backed confirmation state did not necessarily refresh.
- Why it happened:
  - Those handlers only updated local `goalStackConfirmation`. They did not re-run the machine immediately.
- User impact:
  - The UI could imply that confirmation was still valid for an outdated active stack.
  - Newly promoted goals could delay missing-anchor reroutes until a later confirm attempt.
- Fix:
  - Added a shared review update path that:
    - clears transient review UI state
    - re-runs the machine silently
    - routes directly to `clarify`, `secondary_goal`, or `review` from the new machine state
- Test:
  - `tests/intake-goal-flow-service.test.js`
  - `e2e/intake.spec.js`
- Doc update: yes

### INTAKE-2026-04-03

- Severity: `blocker`
- Category: `confirmation gating`
- Title: Deferred or background goals could still block confirmation through pre-arbitration completeness leakage
- Files / functions:
  - `src/services/intake-machine-service.js`
  - `src/services/goal-arbitration-service.js`
  - `src/trainer-dashboard.jsx`
  - `buildDeterministicIntakeDraft(...)`
  - `buildGoalArbitrationStack(...)`
  - `buildPreviewGoalResolutionBundle(...)`
- Reproduction:
  1. Start with a clean primary goal.
  2. Add an extra secondary goal that arbitration defers.
  3. Reach review and observe the app blocked on a missing anchor for the deferred goal.
- Why it happened:
  - Pre-arbitration completeness and feasibility were computed across the full goal set.
  - Arbitration finalization and the review gate were still reading those broader missing-required signals.
- User impact:
  - Users could get stuck on anchors for goals the stack had already deferred.
  - Confirmation truthfulness broke, because the active review stack and the actual gate disagreed.
- Fix:
  - Recomputed post-arbitration completeness and feasibility against the active stack only.
  - Arbitration finalization now uses active-stack completeness when answers are available.
  - Preview/runtime builders now follow the same contract.
- Test:
  - `tests/goal-arbitration-service.test.js`
  - `e2e/intake.spec.js`
- Doc update: yes

### INTAKE-2026-04-04

- Severity: `high`
- Category: `goal stack`
- Title: The same appearance lane could render twice when it came from both raw intent and explicit secondary-goal input
- Files / functions:
  - `src/services/goal-arbitration-service.js`
  - `buildGoalCandidateKey(...)`
  - `dedupeGoalCandidates(...)`
- Reproduction:
  1. Start with a running goal.
  2. Add an appearance goal later through the secondary-goal step.
  3. Review the deferred/background lanes.
- Why it happened:
  - Candidate dedupe keyed too literally on generated summaries.
  - Near-identical summaries such as `Improve midsection definition` and `Improve midsection definition by the target window` were treated as separate lanes.
- User impact:
  - Review lanes could contradict themselves and look untrustworthy.
- Fix:
  - Normalized generated summary variants in arbitration candidate keys before dedupe.
- Test:
  - `tests/goal-arbitration-service.test.js`
  - `e2e/intake.spec.js`
- Doc update: covered here

### INTAKE-2026-04-05

- Severity: `medium`
- Category: `transcript`
- Title: Blocked review notes deduped only per transition instead of per blocked state
- Files / functions:
  - `src/trainer-dashboard.jsx`
  - `finalizePlan(...)`
  - `src/services/intake-transcript-service.js`
- Reproduction:
  1. Re-enter the same blocked review state through repeated review recomputes.
  2. Emit the same blocked note again with a new transition id.
- Why it happened:
  - The message key was transition-scoped rather than blocked-state scoped.
- User impact:
  - The same review warning could accumulate in the transcript.
- Fix:
  - Blocked review notes now use stable `review_note:*` keys.
- Test:
  - `tests/intake-transcript-service.test.js`
- Doc update: covered here

### INTAKE-2026-04-06

- Severity: `medium`
- Category: `spec mismatch`
- Title: Ideal-flow docs did not describe active-stack gating or silent review refreshes clearly enough
- Files:
  - `docs/IDEAL_INTAKE_FLOW.md`
- Reproduction:
  - Compare the live review refresh behavior and confirmation gate to the doc text.
- Why it happened:
  - Runtime hardening outpaced the spec note.
- User impact:
  - Internal readers could reason from the wrong invariants.
- Fix:
  - Updated runtime notes in `docs/IDEAL_INTAKE_FLOW.md`.
- Test:
  - not required
- Doc update: yes

## Fixes Implemented

- Added transcript-silent review recomputes.
- Forced review-lane edits to re-run the machine immediately instead of waiting for confirm-time refresh.
- Recomputed confirmation gating from the active stack only after arbitration.
- Recomputed arbitration finalization against active-stack completeness when answers are available.
- Normalized arbitration candidate fingerprints so duplicated appearance lanes collapse correctly.
- Stabilized blocked review note keys across silent recomputes.
- Updated the ideal-flow doc to match the runtime contract.

## Invariants Enforced

- The machine remains the only stage authority.
- Silent review recomputes do not create transcript noise.
- One bound answer still writes only to the field(s) explicitly allowed by the active anchor.
- Deferred/background goals can stay visible in review without blocking confirmation.
- Promoting a deferred/background goal back into the active stack immediately reopens its required anchors.
- Confirmation CTA state now follows the same active-stack contract the machine will actually commit.
- Commit requests still come only from validated confirmation snapshots.
- Commit consumption remains exactly-once.

## Verification

### Test verification

- `cmd /c npm test`
  - Result: `309 passed`
- `cmd /c npx playwright test e2e/intake.spec.js`
  - Result: `12 passed`
- `cmd /c npm run build`
  - Result: success

### Runtime verification covered by Playwright

- simple running goal
- simple strength goal
- appearance goal
- multi-goal stack with tradeoffs
- background-goal promotion back into the active stack
- goal change midstream
- reload mid-intake
- AI slow/unavailable fallback
- confirm/build idempotency
- natural-language contamination resistance
- abandoned/no-goal path

### What the verification now proves

- No duplicate anchor prompt or AI summary is emitted when review refreshes silently.
- Secondary-goal additions no longer block confirmation just because a deferred lane lacks anchors.
- Reprioritizing a deferred/background goal routes back to the right anchor immediately.
- Confirmation never enables off stale preview state after a lane change.
- Commit still fires once.
- Reload still strips pending commit state.
- Planner handoff still follows the confirmed snapshot path exercised by the existing E2E suite.

## Manual Smoke Checklist

- Reach review, change priority on a deferred/background goal, and confirm the app routes straight back to the next required anchor.
- Add a secondary appearance goal to a running intake and confirm it stays visible without blocking confirmation until promoted.
- Recompute review repeatedly and confirm the transcript does not gain duplicate AI summary or anchor messages.
- Confirm that repeated blocked review notes do not stack up in the transcript.
- Complete intake, double-trigger confirm/build, and confirm only one commit fires.
- Refresh mid-intake and confirm the current anchor is restored without replaying stale commit/outbox state.

## Remaining Risks

- The dormant non-machine `pendingClarifyingQuestion` compatibility path still exists in `src/trainer-dashboard.jsx`, even though the current runtime no longer drives normal intake through it.
- Session restore is browser-session scoped only. It is not a durable cross-device resume path.
- This pass validated intake aggressively through reducer/unit/E2E coverage, but it did not add a second independent end-to-end planner suite beyond the existing onboarding handoff checks.
