# Intake Full Audit And Remediation

## Scope

This pass audited the live intake runtime in:

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
- `tests/intake-*.test.js`

The goal of this pass was not to redesign intake. It was to verify the real runtime, find structural defects, and harden the flow where real bugs still existed.

## Architecture Summary

### Real flow ownership

- `OnboardingCoach` in `src/trainer-dashboard.jsx` owns the live onboarding UI state and dispatches machine events.
- `intakeReducer(...)` in `src/services/intake-machine-service.js` is the deterministic traffic cop for stage transitions, anchor binding, completeness recompute, confirmation state, and commit request generation.
- `buildDeterministicIntakeDraft(...)` in `src/services/intake-machine-service.js` is the canonical recompute boundary for goal resolution, completeness, feasibility, arbitration, review, and confirmation.
- AI interpretation and coach voice are runtime helpers only. They feed proposal/display state through `src/services/ai-runtime-service.js` and do not write canonical plan state directly.
- Transcript queueing is handled by `src/services/intake-transcript-service.js`; committed machine outbox messages are drained by `OnboardingCoach`.
- Canonical commit is gated in the machine and consumed by `OnboardingCoach`, which hands the validated snapshot to the normal onboarding persistence path.

### State ownership

- Temporary UI state: `OnboardingCoach` local React state.
- Canonical intake draft state: `intakeMachine.draft`.
- Proposal / preview state: `assessmentBoundary`, `assessmentPreview`, optional coach voice phrasing.
- Transcript state: rendered `messages` plus transcript/message-key refs.
- Commit state: `intakeMachine.draft.commitRequested` and `intakeMachine.draft.commitRequest`.
- Persisted onboarding completion: existing app persistence via `onComplete(...)` and `persistence-adapter-service`.
- New in this pass: mid-intake recovery snapshot in browser `sessionStorage`.

## Spec Match Summary

### Runtime matches spec

- Deterministic stage machine drives progression.
- One answer only clears the field it was asked for.
- AI remains proposal-only and late AI summaries are dropped when transitions advance.
- Confirmation remains the single gate before canonical commit.
- Commit is snapshot-based and idempotent.
- Goal edits reset stale derived state before re-interpretation.

### Runtime diverged or was underspecified

- `docs/IDEAL_INTAKE_FLOW.md` described a more explicit interpretation confirmation step than the runtime exposed. The live correction surface is now the heard-goals review plus edit/remove actions.
- The docs did not previously describe partial-intake restore behavior because the runtime did not have one. This pass added restore and updated the spec note.
- Review-stage system-note identity was under-specified. The machine outbox was keyed correctly, but ad hoc UI system notes still needed distinct topics.

## Issue Register

### INTAKE-AUDIT-01

- Severity: `high`
- Category: `state`
- Title: Removing the current heard-goal row did not always remove the effective lead goal
- Files: `src/services/intake-goal-flow-service.js`
- Reproduction: Enter multiple goals, remove the first/lead goal from the heard-goals review, continue to review.
- Why it happened: `buildIntakeGoalStackConfirmation(...)` chose the fallback primary from `orderedGoals`, not `activeGoals`.
- User impact: The app could keep building around a goal the user had just removed.
- Fix: Primary fallback now resolves only from `activeGoals`.
- Tests: `tests/intake-goal-flow-service.test.js`
- Doc update: covered in this audit doc.

### INTAKE-AUDIT-02

- Severity: `blocker`
- Category: `persistence`
- Title: Partial intake state was lost on reload
- Files: `src/trainer-dashboard.jsx`, `src/services/intake-session-service.js`
- Reproduction: Answer part of intake, refresh the browser, re-open onboarding.
- Why it happened: Intake state lived entirely in component memory and was never persisted safely before final commit.
- User impact: Users could lose completed anchors, review decisions, and transcript context mid-intake.
- Fix: Added a restore-safe session snapshot. It persists the live intake state to `sessionStorage`, restores it on mount, strips unsafe pending commit/outbox state, and clears itself after successful final commit.
- Tests: `tests/intake-session-service.test.js`
- Doc update: `docs/IDEAL_INTAKE_FLOW.md`, this audit doc.

### INTAKE-AUDIT-03

- Severity: `high`
- Category: `transcript`
- Title: Review-stage system notes could collide or duplicate
- Files: `src/trainer-dashboard.jsx`, `src/services/intake-transcript-service.js`
- Reproduction: Reach review, trigger the optional secondary-goal prompt, then click confirm while still blocked or missing acknowledgement.
- Why it happened: The transcript service defaulted system-note keys to `${stage}:system:${transition_id}`, but some UI-generated notes were also appended without stable keys. That created two failure modes: duplicate blocked notes on repeated clicks, or suppression collisions between different review notes in the same transition.
- User impact: The transcript could look broken or could suppress the wrong coach note.
- Fix: Added topic-aware system-note keys and changed blocked confirm notes plus the live secondary-goal prompt to use distinct keyed messages.
- Tests: `tests/intake-transcript-service.test.js`
- Doc update: this audit doc.

### INTAKE-AUDIT-04

- Severity: `medium`
- Category: `spec mismatch`
- Title: The ideal-flow doc overstated a separate interpretation acceptance step
- Files: `docs/IDEAL_INTAKE_FLOW.md`
- Reproduction: Compare the documented ideal flow to the live review/clarify runtime.
- Why it happened: The codebase evolved toward deterministic goal review and heard-goal removal without the doc being updated.
- User impact: Internal readers could believe the runtime had a separate accept/revise checkpoint when it did not.
- Fix: Added a runtime note to the ideal-flow doc.
- Tests: not required
- Doc update: `docs/IDEAL_INTAKE_FLOW.md`

### INTAKE-AUDIT-05

- Severity: `medium`
- Category: `test gap`
- Title: No regression coverage existed for mid-intake restore semantics
- Files: `tests/intake-session-service.test.js`
- Reproduction: Existing intake suites covered reducer replay, transcript dedupe, commit gating, and AI boundary behavior, but not reload safety.
- Why it happened: Restore logic did not exist.
- User impact: Reload regressions would have gone uncaught.
- Fix: Added focused restore tests for active-anchor recovery, commit/building normalization, and starting mode mismatch.
- Tests: `tests/intake-session-service.test.js`
- Doc update: this audit doc.

## Fixes Implemented

- Fixed lead-goal removal so removing the current lead from the heard-goals review truly removes it from the active stack.
- Added `src/services/intake-session-service.js` and wired it into `OnboardingCoach` so partial intake can survive reloads safely.
- Added topic-aware transcript message identity for review-stage system notes.
- Keyed the blocked-confirmation coach note so repeated clicks do not duplicate transcript output.
- Keyed the live secondary-goal prompt separately from other review notes in the same transition.
- Updated the intake spec note to describe the real runtime correction surface and restore behavior.

## Invariants Enforced

- Intake progression is still machine-driven; restore does not bypass the reducer.
- Reload never restores a live pending commit request.
- Reload never restores machine outbox messages for replay.
- Current anchor binding remains field-scoped after restore.
- One answer still only clears the expected field for the active anchor.
- Review-stage UI notes are keyed and stage-safe.
- Confirmation remains blocked when incomplete or blocked, even after reload.
- Canonical commit still only happens from a validated confirmation snapshot.

## Verification

### Focused test runs

- `node -r sucrase/register --test tests/intake-session-service.test.js tests/intake-transcript-service.test.js tests/intake-goal-flow-service.test.js`
- `node scripts/build.js`

### What those checks now prove

- Active-anchor sessions restore into a safe clarify state.
- Commit/building sessions restore into review instead of replaying a stale commit.
- Restore ignores snapshots created under the wrong onboarding mode.
- Review-stage system notes can coexist in the same transition without dedupe collisions.
- Repeated blocked confirm attempts do not enqueue duplicate transcript notes.
- Removing a parsed goal before anchors continue now updates the effective lead goal correctly.

## Manual Smoke Checklist

- Start intake with a running goal, answer one anchor, refresh, and confirm the same anchor is still active.
- Start intake with a strength goal, reach review, click confirm while incomplete, and confirm the blocked coach note only appears once.
- Start intake with multiple goals, remove the first heard goal, and confirm the next live goal becomes the lead.
- Reach the optional secondary-goal step, refresh, and confirm it restores without replaying earlier transcript notes.
- Complete intake, confirm and build the plan, and confirm the session snapshot is cleared after success.
- Trigger a warning-state review, do not acknowledge it, click confirm twice, and confirm the transcript does not duplicate the warning note.

## Remaining Risks

- Mid-intake restore is browser-session scoped. It is not yet a durable cross-device or cross-browser save/resume system.
- The restore snapshot intentionally does not persist cosmetic AI coach-voice phrasing; that display copy is regenerated or falls back deterministically.
- Verification is still test-heavy and manual-flow based. There is not yet a browser-level end-to-end test harness for intake.
- The ideal-flow doc remains aspirational in places beyond the runtime notes; future intake redesign work should keep the doc and runtime aligned as they evolve.
