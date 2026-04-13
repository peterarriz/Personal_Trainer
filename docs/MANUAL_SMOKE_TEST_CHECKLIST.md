# Manual Smoke Test Checklist

Use this after each architecture wave. Keep it fast: the goal is to catch obvious regressions in core flows, not to exhaustively QA the app.

## 1. App Boot

- Open the app from a clean refresh.
- Confirm the app loads without a blank screen, render crash, or repeated console errors.
- Confirm the main tabs render and navigation works.
- If cloud is intentionally degraded, confirm the app settles into a quiet retrying/local state instead of flashing repeated sync failures.

## 1A. Auth And Account Lifecycle

- Sign up with a fresh email.
- Confirm the product routes through profile setup before dropping you into intake or the main app.
- Sign out and confirm the auth gate returns cleanly.
- Sign back in and confirm the prior account still works.
- Delete the account from Settings.
- Confirm the auth gate returns and both `trainer_auth_session_v1` and `trainer_local_cache_v4` are cleared.
- Confirm the same email now needs a new signup flow rather than silently reusing the deleted identity.

## 2. Today Screen

- Open `Today`.
- Confirm the primary session card is visible above the fold.
- Confirm the session shown is plausible for the current phase/week and not obviously empty or contradictory.
- Confirm the full prescribed workout is available on Today without leaving for Program.
- Confirm the quick log path is visible without opening secondary sections.
- Log a quick outcome.
- Confirm the save succeeds and the visible logged state updates immediately in plain English.
- Refresh the page and confirm the logged state still matches what you entered.

## 3. Program Screen

- Open `Program`.
- Confirm current week is the center of the screen and is easy to scan.
- Confirm future weeks preview is visible without wading through management controls.
- Confirm the week, phase labels, and projections look sensible rather than blank, duplicated, or contradictory.
- Confirm Program/Style selection and goal-management controls are not present here.

## 4. Coach Screen

- Open `Coach`.
- Confirm the tab reads as a conversation and decision surface, not a settings console.
- Confirm advanced/provider controls are not visible by default.
- Trigger a recommendation or prompt and confirm the resulting response is visible and readable.

## 5. Logging Review / History

- Open `Log` or the review/history area for a day with a saved plan and an actual log.
- Confirm the quick log path appears before review/history detail.
- Save a log and confirm the save state is unmistakable.
- Confirm review surfaces show:
  - original prescription
  - latest prescription
  - actual outcome
- If the plan was revised, confirm the revision timeline shows more than one revision and labels remain readable.
- Confirm badges/status chips render without runtime errors.

## 6. Nutrition Prescription vs Actual

- Open `Nutrition`.
- Confirm today's target is visible near the top.
- Confirm the quick actual logging path is visible before optional support sections.
- Save or update a nutrition actual for today.
- Confirm the nutrition actual appears in the current day view and review/history view.
- Open weekly nutrition planning and confirm grocery/provisioning support is still visible even if today is not the normal shopping day.
- Refresh the page.
- Confirm prescription and actual still appear separately and stay in sync after reload.

## 7. Settings Ownership And Surface Hygiene

- Open `Settings`.
- Confirm Program/Style management lives here.
- Confirm goal-change or plan-management actions live here rather than on Program.
- Confirm Metrics / Baselines is reachable from Settings and that editing a metric is clearly allowed.
- Confirm Logout is visible.
- Confirm unfinished integrations are hidden or collapsed by default.
- Confirm Settings does not feel essay-like or overloaded with design/philosophy text.

## 7A. Themes

- Switch between at least three themes.
- Confirm both accent and background/surface tokens visibly change.
- Confirm light mode remains comfortable and readable.

## 8. Coach Actions Safety

- Open coach/chat/recommendation surfaces.
- Trigger or inspect a recommended action.
- Confirm recommended actions do not silently mutate plan/state before explicit acceptance.
- Accept one safe action if available and confirm the resulting state change is visible and intentional.

## 9. Intake / Onboarding

- Run through intake from a fresh or reset state.
- Confirm prompts render cleanly and choices/text inputs behave normally.
- Confirm optional text fields can be skipped without breaking flow.
- Confirm multiselect responses save the expected values.
- Complete intake and confirm a usable plan is generated.

## 10. Save / Reload / Import / Restore

- Make one or two small changes: log entry, nutrition actual, or personalization/goal update.
- Refresh the page and confirm those changes persist.
- If import/export or backup/restore is available, perform one round-trip.
- Confirm the restored state is broadly consistent and does not obviously drift in goals, logs, or plan history.

## 11. Goals / Supabase Sync

- Update a goal or complete intake with goal changes while signed in.
- Watch for failed `/rest/v1/goals` requests or repeated 400 errors.
- Confirm no obvious cloud-sync error banner appears after save.
- Refresh and confirm goals still look correct.

## 12. Final Sanity Pass

- Scan the console for new runtime errors.
- Confirm no screen shows mojibake, placeholder text, or obviously stale helper behavior.
- If any smoke check fails, capture:
  - screen
  - action taken
  - expected vs actual
  - console/network error if present
