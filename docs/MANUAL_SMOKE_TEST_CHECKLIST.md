# Manual Smoke Test Checklist

Use this after each architecture wave. Keep it fast: the goal is to catch obvious regressions in core flows, not to exhaustively QA the app.

## 1. App Boot

- Open the app from a clean refresh.
- Confirm the app loads without a blank screen, render crash, or repeated console errors.
- Confirm the main tabs render and navigation works.

## 2. Today Screen

- Open `Today`.
- Confirm the screen renders fully: session card, recovery/nutrition guidance, and coach/context blocks appear.
- Confirm the session shown is plausible for the current phase/week and not obviously empty or contradictory.
- Log a quick outcome.
- Confirm the save succeeds and the visible logged state updates immediately.
- Refresh the page and confirm the logged state still matches what you entered.

## 3. Program Screen

- Open `Program`.
- Confirm the hierarchy makes sense: ProgramBlock -> PlanWeek -> PlanDay.
- Confirm current week, phase labels, and projections look sensible rather than blank, duplicated, or contradictory.
- Confirm active goals and goal allocation are plausible for the current plan.

## 4. Logging Review / History

- Open `Log` or the review/history area for a day with a saved plan and an actual log.
- Confirm review surfaces show:
  - original prescription
  - latest prescription
  - actual outcome
- If the plan was revised, confirm the revision timeline shows more than one revision and labels remain readable.
- Confirm badges/status chips render without runtime errors.

## 5. Nutrition Prescription vs Actual

- Save or update a nutrition actual for today.
- Confirm the nutrition actual appears in the current day view and review/history view.
- Refresh the page.
- Confirm prescription and actual still appear separately and stay in sync after reload.

## 6. Coach Actions Safety

- Open coach/chat/recommendation surfaces.
- Trigger or inspect a recommended action.
- Confirm recommended actions do not silently mutate plan/state before explicit acceptance.
- Accept one safe action if available and confirm the resulting state change is visible and intentional.

## 7. Intake / Onboarding

- Run through intake from a fresh or reset state.
- Confirm prompts render cleanly and choices/text inputs behave normally.
- Confirm optional text fields can be skipped without breaking flow.
- Confirm multiselect responses save the expected values.
- Complete intake and confirm a usable plan is generated.

## 8. Save / Reload / Import / Restore

- Make one or two small changes: log entry, nutrition actual, or personalization/goal update.
- Refresh the page and confirm those changes persist.
- If import/export or backup/restore is available, perform one round-trip.
- Confirm the restored state is broadly consistent and does not obviously drift in goals, logs, or plan history.

## 9. Goals / Supabase Sync

- Update a goal or complete intake with goal changes while signed in.
- Watch for failed `/rest/v1/goals` requests or repeated 400 errors.
- Confirm no obvious cloud-sync error banner appears after save.
- Refresh and confirm goals still look correct.

## 10. Final Sanity Pass

- Scan the console for new runtime errors.
- Confirm no screen shows mojibake, placeholder text, or obviously stale helper behavior.
- If any smoke check fails, capture:
  - screen
  - action taken
  - expected vs actual
  - console/network error if present
