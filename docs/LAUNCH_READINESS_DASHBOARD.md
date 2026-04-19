# FORMA Launch Readiness Dashboard

Updated: 2026-04-18

## Current Recommendation

Current recommendation: `NO-GO`

Launch is now blocked by two remaining P0 themes:

1. Cross-device sync still needs a real staging pass.
   - Local reducers, diagnostics, and copy are in much better shape.
   - The true launch promise is cross-device reliability, and that still needs a green real Supabase staging run before launch.

2. Secret hygiene has a live blocker.
   - A tracked `.env.local` contained a real-looking Supabase service-role credential.
   - Until that credential is rotated and the tracked leak is removed from git history, this is a hard launch blocker.

Adaptive rollout now has its own shadow gate, but it is not a separate consumer-launch blocker while the adaptive layer remains off by default.

## Status Key

- `PASS`: category currently meets its gate with fresh evidence.
- `AT RISK`: category has meaningful coverage and recent progress, but still has a gap that should be closed before calling it fully ready.
- `FAIL`: category has a current blocker or a failing gate.

## Dashboard

| Category | Priority | Pass / fail criteria | Current status | Latest evidence | Linked tests and docs |
| --- | --- | --- | --- | --- | --- |
| Sync and persistence | `P0` | Signed-in users can save and reload plan state, goals, logs, and nutrition across refreshes and across two devices. Sync copy must be calm and precise, not vague `device-only` or generic retry language when a better state is available. | `AT RISK` | Reducer and copy layers are green, but the real staging two-device run was not re-verified in this session. | [`tests/sync-state-service.test.js`](../tests/sync-state-service.test.js), [`tests/save-feedback-service.test.js`](../tests/save-feedback-service.test.js), [`docs/CLOUD_SYNC_ROOT_CAUSE_AND_VERIFICATION.md`](./CLOUD_SYNC_ROOT_CAUSE_AND_VERIFICATION.md), [`e2e/real-sync-staging.spec.js`](../e2e/real-sync-staging.spec.js) |
| Planning correctness | `P0` | Planner must respect the archetype contract for strength-only, endurance-only, physique-first, re-entry, and hybrid plans. Forbidden session types must never appear, required tracking metrics must exist, nutrition bias must match the archetype, and Today / Program must render coherently. | `PASS` | New archetype contract pack is green. The known `strength plans receiving runs` failure mode is now directly guarded by contract tests. | [`tests/plan-archetype-contract.test.js`](../tests/plan-archetype-contract.test.js), [`tests/goal-progress-service.test.js`](../tests/goal-progress-service.test.js), [`src/services/plan-archetype-contract-service.js`](../src/services/plan-archetype-contract-service.js) |
| Mobile usability and accessibility | `P0` | Signed-in app shell must load on a small phone, touch targets and labels must remain usable, reduced motion must disable decorative motion, light mode must remain readable, and slow mobile boot must still land on a usable first screen. | `PASS` | `e2e/mobile-accessibility.spec.js` passed `4/4` after the signed-in boot race fix stopped onboarding from overwriting a valid seeded shell state. | [`e2e/mobile-accessibility.spec.js`](../e2e/mobile-accessibility.spec.js), [`docs/MOBILE_USABILITY_ACCESSIBILITY_PATCHLIST.md`](./MOBILE_USABILITY_ACCESSIBILITY_PATCHLIST.md) |
| Logging speed and clarity | `P1` | Default logging path must be sub-60-second on mobile, show one planned workout surface, avoid duplicate workout cards, prefill planned details, and keep advanced actuals behind expansion. | `PASS` | All three prescribed logging flows passed. The known `duplicated log content` issue is currently closed by regression coverage. | [`e2e/log-prescribed-workflow.spec.js`](../e2e/log-prescribed-workflow.spec.js), [`tests/workout-log-form-service.test.js`](../tests/workout-log-form-service.test.js) |
| Copy quality and consumer tone | `P1` | Default screens should be highlights-first, internal language must not appear in normal user flows, and secondary rationale should be collapsed instead of filling the top layer. | `AT RISK` | Internal-language guard passed, and reduction audits are in place, but there is still no automated visible-text budget per screen. Manual premium-read review is still needed after the bootstrap blocker is fixed. | [`e2e/consumer-copy-guard.spec.js`](../e2e/consumer-copy-guard.spec.js), [`docs/CONTENT_REDUCTION_INVENTORY.md`](./CONTENT_REDUCTION_INVENTORY.md), [`docs/INTERNAL_LANGUAGE_REMOVAL_AUDIT.md`](./INTERNAL_LANGUAGE_REMOVAL_AUDIT.md), [`docs/PRODUCT_DELETION_REPORT.md`](./PRODUCT_DELETION_REPORT.md) |
| Adaptive rollout safety | `P2` | Adaptive must stay deterministic by default or remain shadow-only until shadow coverage is large enough, harmful cohorts are zero, and at least one decision point is eligible for a limited rollout. | `AT RISK` | The fixture gate still blocks activation, and the first non-fixture staging run now also confirms there is no live adaptive dataset yet: `0` exported events, `0` shadow rows, fallback to `trainer_data`, and the dedicated `adaptive_learning_events` sink table is still missing in Supabase. CI now enforces the fixture gate, and the operator path has canonical apply and staging-eval commands, but live adaptive prescription is still blocked on exposure logging, stable join keys, a real sink table, and enough real history to evaluate. | [`npm run qa:adaptive-policy:launch-readiness`](../package.json), [`npm run qa:adaptive-policy:apply-bundle`](../package.json), [`npm run qa:adaptive-policy:staging-eval`](../package.json), [`artifacts/adaptive-launch-readiness/results.json`](../artifacts/adaptive-launch-readiness/results.json), [`artifacts/adaptive-policy-staging-evaluation/20260419-023431/results.json`](../artifacts/adaptive-policy-staging-evaluation/20260419-023431/results.json), [`docs/ADAPTIVE_POLICY_PROMOTION_WORKFLOW.md`](./ADAPTIVE_POLICY_PROMOTION_WORKFLOW.md), [`docs/ADAPTIVE_LEARNING_LAUNCH_SAFETY.md`](./ADAPTIVE_LEARNING_LAUNCH_SAFETY.md), [`docs/ADAPTIVE_LEARNING_ADVERSARIAL_AUDIT.md`](./ADAPTIVE_LEARNING_ADVERSARIAL_AUDIT.md), [`docs/ADAPTIVE_LEARNING_ENABLEMENT_CHECKLIST.md`](./ADAPTIVE_LEARNING_ENABLEMENT_CHECKLIST.md), [`docs/ADAPTIVE_LEARNING_BACKLOG.md`](./ADAPTIVE_LEARNING_BACKLOG.md) |
| Performance | `P2` | Production build must pass. Split build must remain the shipping path. Mobile perf should stay within launch guardrails: cold interactive under 6.5s on the scripted Pixel 5 profile, warm reload under 1s, offline repeat under 500ms. | `PASS` | Build passed. Mobile perf script passed with cold interactive `6003 ms`, warm reload `708 ms`, and offline repeat `441 ms`. Watch item remains: `app.bundle` is still about `4516.6 KB`. | [`cmd /c npm run build`](../package.json), [`cmd /c npm run perf:mobile`](../package.json), [`artifacts/performance/mobile-profile/20260418-055531/mobile-profile-results.json`](../artifacts/performance/mobile-profile/20260418-055531/mobile-profile-results.json) |
| Security and account recovery | `P0` | Password reset must work from the auth gate, through the in-app recovery link, and from signed-in Settings. Auth flows must not accidentally dump signed-in users into onboarding or local-only fallback when account actions are triggered. No real secrets may be tracked in git, and any exposed service-role credential must be rotated before launch. | `FAIL` | Auth recovery flows are green, but the repo audit confirmed a tracked `.env.local` in `HEAD` with a real-looking Supabase service-role credential. The file must be removed from tracking and the key must be rotated before launch. | [`e2e/password-reset.spec.js`](../e2e/password-reset.spec.js), [`e2e/auth-and-management.spec.js`](../e2e/auth-and-management.spec.js), [`e2e/account-lifecycle.spec.js`](../e2e/account-lifecycle.spec.js), [`docs/AUTH_AND_SUPABASE_RELIABILITY_SPEC.md`](./AUTH_AND_SUPABASE_RELIABILITY_SPEC.md), [`docs/SECURITY_AUDIT_2026-04-18.md`](./SECURITY_AUDIT_2026-04-18.md) |

## Issue Register

### P0

| ID | Issue | Category | Current status | Evidence | Launch impact |
| --- | --- | --- | --- | --- | --- |
| `LR-001` | Signed-in seeded bootstrap intermittently lands in onboarding instead of the app shell. | Mobile usability, security, settings, signed-in smoke paths | `CLOSED` | Fixed the boot race that let default empty state persist before signed-in hydration. `e2e/mobile-accessibility.spec.js` now passed `4/4`, and `e2e/password-reset.spec.js` now passed `3/3`. | Closed. This is no longer a launch blocker. |
| `LR-002` | Real cross-device sync and reload reliability still need a fresh real Supabase staging pass. | Sync | `OPEN` | Local reducer and diagnostics tests are green, but the real staging run in [`e2e/real-sync-staging.spec.js`](../e2e/real-sync-staging.spec.js) was not re-run in this session. | Hard launch blocker for a product that promises reliable multi-device continuity. |
| `LR-003` | A tracked `.env.local` exposed a real-looking Supabase service-role credential. | Security | `OPEN` | The security audit confirmed `.env.local` was present in `HEAD`, local `main` matched `origin/main`, and the file contained a service-role token. See [`docs/SECURITY_AUDIT_2026-04-18.md`](./SECURITY_AUDIT_2026-04-18.md). | Hard launch blocker until the credential is rotated and the tracked leak is removed from git history. |

### P1

| ID | Issue | Category | Current status | Evidence | Can launch wait? |
| --- | --- | --- | --- | --- | --- |
| `LR-101` | Screen density still needs a final manual premium-read pass after the bootstrap blocker is fixed. | Copy quality, mobile usability | `OPEN` | Reduction audits are strong, but there is no CI gate for visible first-load word count or default-scroll depth. | Yes, if the final manual pass is completed before public launch. |
| `LR-102` | Overlong screens are reduced, but not yet protected by automated per-screen text budgets. | Copy quality | `OPEN` | [`docs/CONTENT_REDUCTION_INVENTORY.md`](./CONTENT_REDUCTION_INVENTORY.md) shows major cuts, but there is no regression guard for future word creep. | Yes. Add after launch gate if manual review is clean. |
| `LR-103` | Device-only and retry language are much better, but the real environment still needs proof that signed-in users never get shoved into the wrong state under transient failures. | Sync | `OPEN` | Unit coverage is green; real staging verification is still outstanding. | No for public launch. Covered by `LR-002`. |
| `LR-104` | Settings account flows depend on the same signed-in bootstrap path as other mobile tests. | Security, account UX | `CLOSED` | Signed-in password reset, explicit local-mode logout, and slow remote logout fallback all passed once the bootstrap race was fixed. | Closed. |

### P2

| ID | Issue | Category | Current status | Evidence | Can wait? |
| --- | --- | --- | --- | --- | --- |
| `LR-201` | JS payload is still large even though repeat-visit performance is acceptable. | Performance | `OPEN` | `app.bundle` is still about `4516.6 KB` in the split build. | Yes. This should become a post-launch cold-start improvement project. |
| `LR-202` | Test output still emits module-type warnings under Node. | Developer quality | `OPEN` | Fresh unit test runs emit `MODULE_TYPELESS_PACKAGE_JSON` warnings. | Yes. Not user-facing. |
| `LR-203` | Adaptive rollout is structurally ready, but no decision point is currently eligible for activation and the first real staging run still produced no adaptive history to evaluate. | Adaptive rollout safety | `OPEN` | `npm run qa:adaptive-policy:launch-readiness:fixture` produced `144` shadow rows, `1` harmful cohort, and `0` eligible decision points. The first non-fixture staging run at [`artifacts/adaptive-policy-staging-evaluation/20260419-023431/results.json`](../artifacts/adaptive-policy-staging-evaluation/20260419-023431/results.json) exported `0` events and yielded `0` shadow rows. | Yes, as long as adaptive remains off or shadow-only. |
| `LR-204` | Adaptive prescription learning is still missing key data-truth requirements: surface impression logging, stable served recommendation ids, and a proven dedicated event sink that is trusted beyond the fallback `trainer_data` payload. | Adaptive rollout safety | `OPEN` | See the explicit blocker list in [`docs/ADAPTIVE_LEARNING_ADVERSARIAL_AUDIT.md`](./ADAPTIVE_LEARNING_ADVERSARIAL_AUDIT.md), the gate checklist in [`docs/ADAPTIVE_LEARNING_ENABLEMENT_CHECKLIST.md`](./ADAPTIVE_LEARNING_ENABLEMENT_CHECKLIST.md), the sink/export notes in [`docs/ADAPTIVE_EVENT_SINK_AND_EXPORT.md`](./ADAPTIVE_EVENT_SINK_AND_EXPORT.md), and the execution backlog in [`docs/ADAPTIVE_LEARNING_BACKLOG.md`](./ADAPTIVE_LEARNING_BACKLOG.md). | Yes, as long as adaptive remains off or shadow-only. |

## Known Issues Seeded Into The Dashboard

This dashboard intentionally starts with the high-signal issues that have already shown up in the product and repo work:

- `strength plans receiving runs`
  - Current status: `CLOSED`
  - Guardrail: [`tests/plan-archetype-contract.test.js`](../tests/plan-archetype-contract.test.js)
- `device-only mode and vague retrying language`
  - Current status: `AT RISK`
  - Guardrails: [`tests/sync-state-service.test.js`](../tests/sync-state-service.test.js), [`tests/save-feedback-service.test.js`](../tests/save-feedback-service.test.js)
  - Remaining gap: real staging verification
- `overlong screens`
  - Current status: `AT RISK`
  - Evidence: [`docs/CONTENT_REDUCTION_INVENTORY.md`](./CONTENT_REDUCTION_INVENTORY.md), [`docs/PRODUCT_DELETION_REPORT.md`](./PRODUCT_DELETION_REPORT.md)
- `duplicated log content`
  - Current status: `CLOSED`
  - Guardrail: [`e2e/log-prescribed-workflow.spec.js`](../e2e/log-prescribed-workflow.spec.js)
- `internal language leakage`
  - Current status: `CLOSED`
  - Guardrail: [`e2e/consumer-copy-guard.spec.js`](../e2e/consumer-copy-guard.spec.js)

## Launch Test Checklist

### Automated Release Gate

| Check | Command | Expected result | Current status |
| --- | --- | --- | --- |
| Build | `cmd /c npm run build` | Must pass with repo hygiene check green. | `PASS` |
| Planning contract pack | `node --test tests/plan-archetype-contract.test.js tests/goal-progress-service.test.js` | All archetype contract and tracking checks pass. | `PASS` |
| Sync state and save copy | `node --test tests/sync-state-service.test.js tests/save-feedback-service.test.js` | Unified save/sync states pass without vague fallback copy. | `PASS` |
| Log speed and duplicate-content guard | `cmd /c npx playwright test e2e/log-prescribed-workflow.spec.js` | Quick log, full detail log, and modified log pass. | `PASS` |
| Consumer copy guard | `cmd /c npx playwright test e2e/consumer-copy-guard.spec.js` | Internal-facing language does not appear in normal consumer flows. | `PASS` |
| Adaptive rollout safety gate | `cmd /c npm run qa:adaptive-policy:launch-readiness -- --shadow artifacts/adaptive-policy-shadow-evaluation` | If adaptive stays off, the gate may still recommend `keep_in_shadow`. Any activation plan requires enough shadow coverage, zero harmful cohorts, and at least one eligible decision point. | `PASS` |
| Mobile accessibility pack | `cmd /c npx playwright test e2e/mobile-accessibility.spec.js` | Small-phone, light-mode, reduced-motion, and slow-boot checks pass. | `PASS` |
| Password reset pack | `cmd /c npx playwright test e2e/password-reset.spec.js` | Auth-gate, recovery-link, and signed-in Settings reset flows all pass. | `PASS` |
| Real staging sync pack | `cmd /c npm run e2e:sync:staging` | Two-device real Supabase sync passes end to end. | `NOT RUN` |
| Mobile perf audit | `cmd /c npm run perf:mobile` | Split build stays inside mobile perf guardrails. | `PASS` |

### Manual Release Gate

| Check | Pass criteria | Current status |
| --- | --- | --- |
| Signed-in shell smoke on small phone | Seeded signed-in user always lands in the app shell, not onboarding. | `PASS` |
| Today / Program / Log / Nutrition premium-read pass | Default scroll answers the core question fast and does not bury the main action under paragraphs. | `PENDING` |
| Settings account smoke | Signed-in user can reach Account, request password reset, sign out, and return without shell confusion. | `PASS` |
| Cross-device smoke on staging | Create or modify a goal, log a day, refresh, then confirm the same state on a second device. | `PENDING` |
| Sync-problem smoke | Go offline, save locally, restore connection, and confirm the product describes state calmly and correctly. | `PENDING` |

## What Blocks Launch

- Run and pass `LR-002`: real Supabase staging sync across refresh and two devices.
- Close `LR-003`: rotate the exposed Supabase service-role key and remove the tracked `.env.local` leak from git history.
- Re-run the real offline and transient-failure sync smoke against staging once `LR-002` is available.

## What Can Wait

- Additional automation for visible-text budget and scroll-depth regression.
- Cold-start bundle-size reduction beyond the current split-build architecture.
- Node module-type warning cleanup.
- Adaptive activation. The new gate and promotion workflow exist, but real rollout should wait for stronger shadow coverage and a clean harmful-cohort pass.

## Suggested Operating Rhythm

Use this file as the overnight handoff artifact.

Every overnight pass should update four things here:

1. The category row that changed.
2. The issue register item that moved.
3. The exact command and result in the checklist.
4. The launch recommendation at the top.

That keeps overnight work visible, comparable, and hard to confuse with random patching.
