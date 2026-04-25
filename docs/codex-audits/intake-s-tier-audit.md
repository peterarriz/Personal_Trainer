# FORMA Intake S-Tier Audit

Date: 2026-04-25

## Verdict

The intake was visually premium, but it behaved like a form with too many equal-weight decisions. The S-tier version should feel like a short guided capture:

1. Pick one goal.
2. Save it visibly.
3. Build with sensible defaults unless the user wants to tune details.

## Friction Found

- **Saved state was not unmistakable.** A pending goal and a saved goal both lived near the same visual weight, so users could not confidently tell whether the goal was locked into the draft.
- **The footer action did not match the user state.** When a goal was in progress, the bottom CTA still behaved like a blocked build action instead of becoming the obvious save action.
- **Required and optional inputs looked equally mandatory.** Available days, injury notes, and coaching tone were visually competing with core setup decisions.
- **The app overused blocking requirements.** Defaults already exist for several planning fields, but the UI still forced the user to touch the form before proceeding.

## S-Tier Direction Shipped

- **State machine clarity:** pending goals now say `UNSAVED GOAL`, show how many required details remain, and the footer switches to `Save goal`.
- **Saved proof:** saved goals now live under `SAVED GOALS`, each saved item is tagged, and the interface briefly confirms the saved goal by name.
- **Smart default path:** once at least one goal is saved, missing reality essentials can default to beginner, 3 days, 30 minutes, and gym. The footer becomes `Build with defaults` instead of trapping the user behind a disabled button.
- **Decluttered reality section:** optional tuning is collapsed under one section so the first screen is about goal, experience, training days, session length, and location.
- **Regression coverage:** browser tests now verify readable save state, exact date stability, smart-default build, and freeze protection.

## Product Bar

The intake should now pass the confused-user test: a user can pick a goal, see it saved, and continue without understanding every training variable. Advanced users still have control, but the default path no longer asks them to become a product designer before getting a plan.
