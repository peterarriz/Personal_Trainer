# App Persistence Loop Audit

## Scope

This pass focused on app-wide interaction reliability under signed-in cloud failure, not just intake.

Audited areas:

- signed-in intake before onboarding completion
- post-onboarding workout logging
- post-onboarding nutrition logging
- passive navigation across `Today`, `Program`, `Nutrition`, `Coach`, and `Settings`
- storage dedupe, retry, and reload behavior in `modules-auth-storage`
- sync-state copy for setup-local and retrying states

## What Was Actually Wrong

Three separate persistence seams were contributing to the "sections stop working / clicks feel broken" report:

1. Unfinished onboarding was still treated like cloud-syncable state.
2. Payload dedupe treated top-level `ts` churn as a meaningful cloud change.
3. When cloud writes were failing, the app had no generic transient-save cooldown or same-user serialization, so one interaction could fan out into multiple `trainer_data` POST attempts.

That third issue was the broadest one. It meant a flaky Supabase window could amplify normal state churn anywhere in the app.

## Fixes Landed

Code paths:

- [src/modules-auth-storage.js](<C:/Users/Peter/Documents/Personal_Trainer/src/modules-auth-storage.js>)
- [src/trainer-dashboard.jsx](<C:/Users/Peter/Documents/Personal_Trainer/src/trainer-dashboard.jsx>)
- [src/services/sync-state-service.js](<C:/Users/Peter/Documents/Personal_Trainer/src/services/sync-state-service.js>)

Changes:

- signed-in onboarding now stays local-first until `onboardingComplete === true`
- timestamp-only payload churn no longer invalidates cloud dedupe
- transient cloud-save failures now start a retry cooldown
- same-user cloud persists are serialized so overlapping calls do not hammer `trainer_data`
- successful manual cloud reload clears the transient-save cooldown so recovery can actually settle
- sync UI now has an explicit setup-local state instead of pretending setup is actively syncing

## Deterministic Proof

Unit/service proof:

- [tests/goals-sync-contract.test.js](<C:/Users/Peter/Documents/Personal_Trainer/tests/goals-sync-contract.test.js>)
  - setup stays local during onboarding
  - timestamp-only churn does not create extra cloud saves
  - transient failures back off instead of repeatedly posting
  - cloud saves retry again after the cooldown expires
- [tests/auth-storage-local-authority.test.js](<C:/Users/Peter/Documents/Personal_Trainer/tests/auth-storage-local-authority.test.js>)
  - unfinished onboarding drafts reopen locally without premature cloud replay
- [tests/sync-state-service.test.js](<C:/Users/Peter/Documents/Personal_Trainer/tests/sync-state-service.test.js>)
  - setup-local mode is rendered explicitly as a device-only state

Browser proof:

- [e2e/intake-reliability.spec.js](<C:/Users/Peter/Documents/Personal_Trainer/e2e/intake-reliability.spec.js>)
  - signed-in intake can select goals, switch families, and continue to clarify without cloud writes before onboarding finishes
- [e2e/signed-in-adaptation-trust.spec.js](<C:/Users/Peter/Documents/Personal_Trainer/e2e/signed-in-adaptation-trust.spec.js>)
  - transient cloud-save cooldown prevents request storms across passive navigation and successive signed-in mutations
  - retry/reload trust-path tests still pass after the broader storage changes

## What Is Now Proven

- Signed-in intake no longer depends on cloud writes before onboarding finishes.
- A transient trainer-data failure no longer turns one signed-in mutation plus passive tab navigation into a request storm.
- Signed-in retry/reload trust-path tests still hold after the broader storage changes.

## Still Not Proven

- Every post-onboarding interaction surface in the app has now been browser-proven against this failure class.
- Populated-cloud merge remains unproven.
- Signed-in degraded-sync reopen still has explicit known gaps in some trust paths and remains documented separately.

## Bottom Line

The user-reported issue was real and broader than intake. The repo now has an app-wide containment fix for the cloud-failure amplification path, plus deterministic proof that the signed-in intake and signed-in post-onboarding mutation flows are materially more stable than before.
