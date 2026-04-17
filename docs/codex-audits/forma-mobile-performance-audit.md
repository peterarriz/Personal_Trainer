# FORMA Mobile Performance Audit

Date: 2026-04-17

## Question

Should FORMA keep the current custom single-file inline build, or move to a cacheable modern asset build?

## Verdict

Do not keep the single-file inline build as the production architecture.

Ship the new split cacheable build now. It materially improves warm load, repeat visit, and service-worker-assisted return behavior. It does **not** materially improve cold interactive time yet, because the app still ships one very large `app.bundle.js`.

That means the honest architecture recommendation is:

1. Keep the new split asset build as the immediate production path.
2. Plan a later migration toward a truly chunked modern pipeline if cold-start parse and execute time must improve.

## Measured Harness

- Device profile: Pixel 5 emulation
- CPU slowdown: 4x
- Network: 150 ms RTT, 1600 kbps down, 720 kbps up
- Browser: Playwright Chromium
- Baseline: legacy inline build
- Candidate: split cacheable build with service-worker registration
- Artifact source: [mobile-performance-summary.md](</C:/Users/Peter/Documents/Personal_Trainer/artifacts/performance/mobile-profile/20260417-145852/mobile-performance-summary.md>)

## Before / After

| Scenario | Inline | Split |
| --- | ---: | ---: |
| `index.html` size | 4591.3 KB | 2.3 KB |
| Cold interactive | 6708 ms | 6702 ms |
| Cold load event | 5935 ms | 5597 ms |
| Warm interactive | not primary win | 1205 ms |
| Repeat visit interactive | 2464 ms in baseline measurement | 1839 ms |
| SW-assisted offline repeat interactive | unsupported | 714 ms |

## Findings

- The old build forced every cold visit through one 4.6 MB HTML document containing React, ReactDOM, Supabase, and app code inline.
- The new build makes the HTML shell tiny and cacheable, with dedicated JS assets and a real registered service worker.
- Cold interactive time is still poor in both modes because the app still parses and executes one very large application bundle.
- The new build wins where mobile users actually feel return-visit speed:
  - split warm reload interactive: `1205 ms`
  - split repeat visit interactive: `1839 ms`
  - split SW-assisted offline repeat interactive: `714 ms`
- The service worker story was effectively absent before this pass. The file existed, but the app did not register it.

## Code Changes

- Build pipeline moved from inline HTML-only output to a split cacheable asset build in [scripts/build.js](</C:/Users/Peter/Documents/Personal_Trainer/scripts/build.js>).
- App-shell service worker is now generated from [service-worker.js](</C:/Users/Peter/Documents/Personal_Trainer/service-worker.js>).
- Boot interactivity metrics now record when the app becomes usable in [src/trainer-dashboard.jsx](</C:/Users/Peter/Documents/Personal_Trainer/src/trainer-dashboard.jsx>).
- Mobile profiling harness added in [scripts/profile-mobile-performance.cjs](</C:/Users/Peter/Documents/Personal_Trainer/scripts/profile-mobile-performance.cjs>).
- Cached/service-worker browser proof added in [e2e/service-worker-cache.spec.js](</C:/Users/Peter/Documents/Personal_Trainer/e2e/service-worker-cache.spec.js>).
- Playwright now supports opt-in service-worker-enabled runs in [playwright.config.js](</C:/Users/Peter/Documents/Personal_Trainer/playwright.config.js>).

## What Is Proven

- The split build is safe across the sampled consumer surfaces and sync surface tests.
- Service workers are no longer globally impossible in browser proofs.
- A repeat visit becomes service-worker controlled and caches the auth shell.
- Warm and repeat mobile visits are materially faster on the split build.

## What Is Still Not Solved

- Cold first-interactive is still around `6.7s` under the mid-tier profile.
- The app bundle is still about `4.27 MB` uncompressed, so parse and execute remain the dominant cold-start cost.
- This pass does not yet introduce true code-splitting by route or surface.

## Acceptance Snapshot

- `node scripts/build.js`
- `cmd /c npx playwright test e2e/auth-entry-ui.spec.js e2e/program.spec.js e2e/service-worker-cache.spec.js --reporter=line`
- `cmd /c npx playwright test e2e/sync-state.spec.js --reporter=line`
- `node scripts/profile-mobile-performance.cjs`
