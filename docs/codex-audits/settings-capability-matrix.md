# Settings Capability Matrix

## Scope

This matrix reflects what the current repo can honestly support on the Settings and auth-entry path after the Settings cleanup patch on April 17, 2026.

## Matrix

| Capability | Status | Reality | Evidence |
| --- | --- | --- | --- |
| Profile editing | Production-ready | Name, timezone, units, body metrics, and training age save through Settings and persist locally/cloud through the normal persistence path. | `e2e/settings-surfaces.spec.js` |
| Goal and plan-management surfaces | Production-ready | The consumer Settings IA is live and navigable by surface. | `e2e/settings-surfaces.spec.js` |
| Appearance themes in Settings | Production-ready | Theme selection persists and the Settings surface now uses brand tokens instead of the old fixed blue/purple headings for the core cleaned-up sections. | `e2e/settings-surfaces.spec.js`, `e2e/theme-preferences.spec.js`, `tests/brand-theme-service.test.js` |
| Burnt Orange coverage | Production-ready | `Ember / Burnt Orange` stays active across Today, Program, Log, Nutrition, Coach, Settings, and the auth gate. | `e2e/theme-surface-coverage.spec.js` |
| Punch Pink coverage | Production-ready | `Pulse / Punch Pink` stays active across Today, Program, Log, Nutrition, Coach, Settings, and the auth gate. | `e2e/theme-surface-coverage.spec.js` |
| Reminder preference visibility | Planned but honestly labeled | The app still stores reminder-like preference fields, but the surface now calls them draft preferences and marks delivery as not live. | `src/domains/settings/SettingsPreferencesSection.jsx`, `e2e/settings-surfaces.spec.js` |
| Reminder delivery | Planned | There is no production push subscription flow, no service worker delivery path, and no verified background reminder system. The old browser `Notification` preview path is now debug-only behind `?reminder_preview=1`. | `src/trainer-dashboard.jsx` |
| Forgot password email request from auth gate | Production-ready | Signed-out users can request a password reset email directly from the auth gate. | `e2e/password-reset.spec.js` |
| Password reset email request from Settings | Production-ready | Signed-in users can request a password reset link from `Settings > Account & sync`. | `e2e/password-reset.spec.js` |
| Custom in-app password reset completion screen | Planned | This repo now supports the reset-link request path, but it does not ship a dedicated branded in-app `choose new password` completion screen. | `src/modules-auth-storage.js`, `src/trainer-dashboard.jsx` |
| Sign out to local mode | Production-ready | Sign-out keeps the device usable locally and does not silently wipe local state. | `e2e/account-lifecycle.spec.js`, `e2e/auth-and-management.spec.js` |
| Reload cloud data | Production-ready | Signed-in users can explicitly re-pull the cloud record onto the device. | `e2e/account-lifecycle.spec.js`, `e2e/sync-state.spec.js` |
| Reset this device | Production-ready | The local-only reset path is user-visible, destructive, and confirmed. | `e2e/account-lifecycle.spec.js` |
| Delete account | Conditional / deployment-dependent | The UI is live, but permanent delete depends on deployment diagnostics and server-side Supabase configuration. | `e2e/account-lifecycle.spec.js`, `docs/AUTH_AND_SUPABASE_RELIABILITY_SPEC.md` |
| Reviewer report export | Internal-only | The markdown reviewer report still exists as an internal QA artifact, but it is no longer allowed to appear in the consumer app. | `e2e/reviewer-report.spec.js`, `tests/plan-evolution-export-service.test.js` |
| Apple Health connect | Partial | The Settings path exists, but on plain web it falls back to a simulated state unless a native WebKit bridge is present. | `src/trainer-dashboard.jsx` |
| Garmin connect | Conditional / deployment-dependent | The connect path is real, but it depends on server routes and deployment env configuration. | `src/trainer-dashboard.jsx`, `api/auth/garmin/callback.js` |
| Location permission request | Production-ready on supported browsers | The browser permission request path exists and is user-triggered. | `src/trainer-dashboard.jsx` |

## Bottom line

- What is truly live now: profile and appearance management, Burnt Orange and Punch Pink coverage across the core consumer surfaces, and password reset email requests.
- What is not live and should not be presented as live: reminder delivery.
- What is still conditional: permanent delete, Garmin, and Apple Health outside a supported native bridge.
