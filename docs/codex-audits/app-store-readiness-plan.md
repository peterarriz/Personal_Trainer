# FORMA App Store Readiness Plan

## Scope

This plan assumes the current FORMA web app is not ready for public App Store or Google Play submission.

The goal is to define the smallest honest path from today's repo state to:

1. internal mobile testing
2. external beta testing
3. public App Store and Google Play submission

This is intentionally launch-gate ordered. A later gate is not eligible until the earlier gate is fully green.

## Current Repo Reality

### What the repo already supports

- Web-first product with a working auth, planning, logging, nutrition, and sync stack.
- Split cacheable build and service worker support already exist.
- Password reset email request exists from the auth gate and Settings.
- Delete-account flow exists, but is deployment-dependent.
- Real staging sync harness already exists in `e2e/real-sync-staging.spec.js`.

### What is still not store-ready

- There is no native iOS or Android client or wrapper project in this repo today.
- Cold mobile load is still slow enough to be a consumer trust risk. The current audit recorded about `6700 ms` cold interactive on the profiled mid-tier device path.
- Reminder delivery is not live.
- Apple Health is only partial and falls back to simulated or bridge-dependent behavior outside a supported native environment.
- Garmin is conditional on deployment env and server configuration.
- Permanent account deletion is conditional on deployment configuration.
- I did not find a public privacy policy page, public support site, or public account deletion help page in the repo.

## Recommended Mobile Path

### Recommended: Capacitor-style native wrapper first

This is the most pragmatic path for FORMA.

Why this path fits the repo:

- The current product is already one large web app with no native client codebase to extend.
- The current device integrations are bridge-shaped, not fully native-product-shaped.
- A wrapper gets FORMA into real on-device testing faster without forcing a rewrite of planning, sync, logging, and nutrition surfaces before beta.
- It leaves room to add only the native features that are actually real: app icons, splash screens, deep links, secure token storage, native share, push later, HealthKit later.

### Not recommended before beta

- Full React Native rewrite
- Full native iOS plus Android rebuild
- Public store submission of a thin wrapped website that still exposes simulated, conditional, or debug-only features

### When to revisit a fuller native client

Only revisit after beta if one or more of these become core product requirements:

- real push delivery
- reliable background sync
- first-class Apple Health / HealthKit product value
- first-class Garmin or Health Connect product value
- materially better cold-start performance than the current web shell can deliver

## Launch Gates

## Gate 0 - Truth Lock And Scope Freeze

Nothing enters a store build until the product truth is locked.

- [ ] Choose the mobile path: Capacitor wrapper, not public web shell submission.
- [ ] Remove all consumer-visible references to features that are not production-real.
- [ ] Keep all admin, reviewer, audit, synthetic-lab, and debug surfaces out of the consumer app.
- [ ] Make store-build feature flags deterministic. No query param or localStorage trick should reveal staff or test tooling.
- [ ] Publish a real privacy policy URL that matches current actual data flows.
- [ ] Publish a real support URL and support email.
- [ ] Publish a real account deletion help URL for Android store compliance.
- [ ] Prove deployed delete-account works end to end on the intended staging or production-like environment.
- [ ] Prove real two-device cloud sync parity with the staging harness.
- [ ] Fail any build that can sit in a generic `Retrying cloud sync` state without a machine-readable reason.

### Current status

Not ready.

The repo still has conditional device integrations, deployment-dependent account deletion, and no repo-evidenced public privacy/support/account-deletion pages.

## Gate 1 - Native Shell Readiness

This gate exists before any TestFlight or Play testing build is shared.

- [ ] Create iOS and Android native wrapper projects.
- [ ] Use stable bundle IDs / app IDs, signing, and environment separation for staging vs production.
- [ ] Wire deep links for auth flows, password reset links, and any OAuth callback path that will remain live on mobile.
- [ ] Decide token persistence strategy for native shells. Do not assume browser-only storage behavior is sufficient.
- [ ] Ensure the app can cold boot, background, foreground, and survive app kill without corrupting auth or sync state.
- [ ] Ensure core sync does not depend on service worker behavior inside the native shell.
- [ ] Add native app icon, splash, launch screen, and app name assets.
- [ ] Add native permission strings only for capabilities that are truly being shipped.
- [ ] Run smoke tests on at least one real iPhone and one real Android phone.

### Current status

Not ready.

There is no native wrapper project in the repo today.

## Gate 2 - Internal Device Testing Readiness

This is the minimum gate before internal TestFlight or internal Play testing.

- [ ] Sign in works on device from a fresh install.
- [ ] User can skip goals and still build a usable foundation plan.
- [ ] User can edit profile, edit goals, log workout, log nutrition, refresh, and reopen without data loss.
- [ ] Today, Program, Log, Nutrition, Coach, and Settings render correctly on phone-sized screens.
- [ ] Logout, password reset request, local-mode resume, reload-cloud-data, reset-device, and delete-account all behave honestly.
- [ ] Real sync parity is proven across two devices for profile, goals, workout logs, and nutrition logs.
- [ ] Offline or degraded sync preserves user data and surfaces a machine-readable reason when cloud sync is failing.
- [ ] The build contains no simulated Apple Health state, no manual device JSON import UI, no reminder preview UI, and no internal diagnostics in normal consumer flow.
- [ ] A real feedback channel exists for testers.

### Apple-specific note

For external TestFlight distribution, Apple requires beta app test information and a support email. Even if internal testers can technically start with less, FORMA should treat support and beta test info as required before sharing any TestFlight build beyond the immediate team.

### Google-specific note

Google allows internal testing to start before an app is fully configured, and internal-only tracks are exempt from inclusion in the Data safety section. That is lenient platform behavior, not a quality bar. FORMA should still treat support, privacy, and sync truth as required before inviting real testers.

### Current status

Not ready.

The repo has a real staging sync harness, but no native shell and no public-facing support/privacy assets yet.

## Gate 3 - External Beta Readiness

This gate is for external TestFlight and any Play track that exposes the app more broadly than an internal-only tester list.

- [ ] Store listing copy is honest and matches the actual shipped feature set.
- [ ] Screenshots and preview assets reflect the real mobile product, not web dev screens or hidden tooling.
- [ ] Support URL and support email are live and staffed.
- [ ] Privacy policy URL is live, public, and matches actual collection, sharing, retention, and deletion behavior.
- [ ] Account deletion path is live in-app and documented on the web where required.
- [ ] Data collection answers are complete and accurate for the actual shipped binary, including any third-party SDKs.
- [ ] Review/test notes are ready, including demo account credentials if review requires sign-in.
- [ ] Backend services needed for review are live during review windows.
- [ ] Real device testing proves no auth trap, no sync loop, no infinite loading, and no cross-surface contradictions.
- [ ] Beta testers can submit feedback through a real channel.

### Current status

Not ready.

FORMA does not yet have a native consumer beta surface that can honestly expose external testers to only production-real capabilities.

## Gate 4 - Public App Store And Google Play Submission

This is the public launch gate.

- [ ] Public store build includes only production-real features.
- [ ] Delete-account flow is live, user-triggered, and policy-compliant on both platforms.
- [ ] Public privacy policy is linked both in-store and in-app.
- [ ] Public support destination is linked in-store and can actually handle user support.
- [ ] Metadata is complete: app name, subtitle or short description, long description, category, age rating or content rating, screenshots, icon, and preview assets.
- [ ] Review information is complete: contact name, email, phone, review notes, and stable demo credentials if login is required.
- [ ] Data collection disclosures are complete and accurate:
  - Apple App Privacy answers
  - Google Data safety form
  - Google Data deletion answers
- [ ] Any shipped health-data integration has platform-compliant disclosure, permission language, and actual production behavior.
- [ ] Sync and persistence pass on two real devices and survive hard refresh, sign-out/sign-in, reinstall, and staged outage recovery.
- [ ] Crash, blank-screen, and auth dead-end rates are low enough to justify public release.
- [ ] Manual QA pack is rerun on real devices using the release candidate binary, not just localhost web.

### Current status

Not ready.

The repo does not yet prove public-store-safe mobile packaging, public privacy assets, public support assets, or a fully production-real mobile feature set.

## Features That Must Stay Hidden Until Production-Real

These should not appear in store builds until they are fully real, tested, and supportable.

- Push reminders or any notification delivery controls beyond true saved preferences
- Apple Health connection on unsupported web or wrapper builds without a real native bridge
- Any `simulated_web`, manual import, or test-only Apple Health states in normal consumer flow
- Garmin connect unless staging and production envs are configured and verified
- Manual JSON device import flows
- Developer sync diagnostics in consumer-visible flows
- Reviewer report export
- Synthetic athlete lab
- Manual QA pack or adversarial tooling
- Any staff, reviewer, internal, or audit surface
- Any wording that implies background delivery, native sync, or device integration is live when it is not

## Required Assets Before Store Submission

## Consumer-facing assets

- [ ] Privacy policy page on a public, stable URL
- [ ] Support page on a public, stable URL
- [ ] Support email inbox
- [ ] Account deletion help page on a public, stable URL
- [ ] Terms of service page
- [ ] Password reset help copy
- [ ] Account deletion confirmation and retention-language copy that matches actual backend behavior

## Store metadata assets

- [ ] App name
- [ ] Subtitle or short description
- [ ] Full description
- [ ] App icon
- [ ] Screenshots for required device classes
- [ ] Optional preview video, if used
- [ ] Category and tags
- [ ] Age rating / content rating answers
- [ ] Review notes
- [ ] Demo account credentials or a full demo mode

## Privacy and compliance assets

- [ ] Apple App Privacy answers
- [ ] Google Data safety form
- [ ] Google Data deletion answers
- [ ] Permission rationale copy for any shipped sensitive permission
- [ ] Health-data disclosure copy if Apple Health, HealthKit, Garmin, or Health Connect is actually shipped

## Public-Submission-Safe Feature Scope For FORMA

If FORMA wanted the smallest honest first public mobile scope, it should be:

- auth
- profile
- goals
- plan view
- workout logging
- nutrition logging
- sync
- password reset request
- delete account

It should not initially include:

- push reminders
- Apple Health marketing unless the native bridge is real
- Garmin marketing unless the live mobile path is real
- any internal or reviewer tooling
- any simulated device or sync behavior

## Platform Notes That Matter For FORMA

## Apple

- Apps with account creation must allow in-app account deletion.
- Apple requires a privacy policy link in App Store Connect metadata and inside the app.
- Apple requires a support URL in app metadata, and that URL must contain real contact information.
- If review needs sign-in, Apple expects working demo credentials and review notes.
- External TestFlight requires beta description and beta review information.
- Health and fitness data are treated as especially sensitive and cannot be used like normal marketing data.

## Google Play

- Internal testing is more lenient and can start before the app is fully configured.
- Closed, open, and production tracks require accurate Data safety completion.
- Google requires a privacy policy link, and it must be a public web page, not a PDF.
- If the app allows account creation, Google requires both an in-app deletion path and a web link where users can request deletion.
- Support email is required in store settings, and a website is strongly recommended.
- Health data and Health Connect data are treated as personal and sensitive user data.

## Recommended Next Steps

1. Create the native wrapper projects and define staging vs production build targets.
2. Publish the public privacy policy, support, terms, and account deletion help pages.
3. Hard-hide all partial, simulated, reviewer, and debug features in store builds.
4. Run the real staging sync parity harness on two physical devices.
5. Build the first internal-only mobile binary and gate it with the existing manual QA pack plus sync truth checks.
6. Only after that, prepare external beta metadata and disclosure assets.

## Sources

### Official Apple sources

- App Review Guidelines: https://developer.apple.com/app-store/review/guidelines/
- Offering account deletion in your app: https://developer.apple.com/support/offering-account-deletion-in-your-app/
- TestFlight: https://developer.apple.com/testflight/
- App Store Connect app information reference: https://developer.apple.com/help/app-store-connect/reference/app-information/platform-version-information

### Official Google sources

- Set up an open, closed, or internal test: https://support.google.com/googleplay/android-developer/answer/9845334
- Create and set up your app: https://support.google.com/googleplay/android-developer/answer/9859152
- Provide information for Google Play's Data safety section: https://support.google.com/googleplay/android-developer/answer/10787469
- User Data policy: https://support.google.com/googleplay/android-developer/answer/10144311
- Understanding Google Play's app account deletion requirements: https://support.google.com/googleplay/android-developer/answer/13327111

## Repo Evidence Used

- `docs/codex-audits/forma-mobile-performance-audit.md`
- `docs/codex-audits/settings-capability-matrix.md`
- `docs/ACCOUNT_LIFECYCLE_AND_PROFILE_BOOTSTRAP_SPEC.md`
- `docs/AUTH_AND_SUPABASE_RELIABILITY_SPEC.md`
- `docs/FINAL_PRODUCT_HARDENING_AND_RELEASE_GATE.md`
- `docs/MANUAL_QA_RELEASE_PACK.md`
- `e2e/real-sync-staging.spec.js`
- `src/trainer-dashboard.jsx`
- `src/domains/settings/SettingsAdvancedSection.jsx`
- `src/domains/settings/SettingsPreferencesSection.jsx`
- `src/modules-auth-storage.js`
- `api/auth/delete-account.js`
- `api/auth/forgot-password.js`
- `vercel.json`
