# FORMA Private Friends-And-Family Beta Plan

## Scope

This beta is not a broad product beta.

It exists to answer only three questions:

1. Can people trust the current plan enough to follow it?
2. Can they log the prescribed workout quickly?
3. Can they keep their data across devices without confusion or loss?

Anything outside that core loop is out of scope for this beta.

## Beta Rule

Do not broaden the test surface beyond:

- onboarding
- first plan
- Today
- Program
- Log
- Nutrition
- Coach as explanation only
- same-account multi-device sync

Do not recruit people whose success depends on not-yet-real features like:

- push reminders
- Apple Health as a must-have
- Garmin as a must-have
- advanced exports or reviewer tools

## Known Trust Boundary Going In

This beta should be designed around what the repo actually proves today:

- local-first logging on the same device is proven
- blank-cloud sign-in on that same device is proven
- fresh second-device restore plus hard refresh is proven

This beta should explicitly avoid relying on what is still not proven:

- signing into an already-populated cloud account and merging safely
- degraded signed-in retry recovery without risk of losing unsynced detail
- cloud-only restore after the original device-local cache is gone

## Tester Profile

## Target cohort size

- Wave 1: `8` testers
- Wave 2: expand to `15` testers only if Wave 1 exits cleanly

## Required tester shape

Each tester should:

- own one phone they actually train with
- have access to a second device later in the week
  - laptop, tablet, or second phone
- be willing to train at least `3` times in `7` days
- be comfortable reporting bugs with screenshots
- use a fresh FORMA account created for this beta

## Recommended goal mix

- `3` run-focused testers
- `3` hybrid run-plus-strength testers
- `2` strength-focused testers

Wave 2 can add:

- `2` more run-focused testers
- `2` hybrid testers
- `1` strength tester
- `2` lower-tech or less app-confident testers

## Exclusion criteria

Do not use this beta for people who:

- already have meaningful data in a FORMA cloud account
- require Apple Health or Garmin to believe the product works
- expect reminders or background notifications to be live
- are likely to test only edge integrations instead of the core loop

## Gate Order

## Gate 0 - Beta Candidate Lock

This must be true before any friends-and-family invite is sent.

- [ ] Current build passes the repo trust proof relevant to the beta:
  - `e2e/workout-adaptation-persistence.spec.js`
  - `e2e/nutrition-underfueled-persistence.spec.js`
  - `e2e/local-sync-trust.spec.js`
  - `e2e/signed-in-adaptation-trust.spec.js`
- [ ] The build has no visible reviewer, staff, debug, or audit surfaces.
- [ ] The build has no visible simulated Apple Health, manual JSON import, or reminder-preview paths.
- [ ] Intake can be completed or skipped without trapping the tester.
- [ ] A fresh account can sign in on a phone and later sign in on a second device.
- [ ] Support contact, privacy link, and basic beta instructions exist.
- [ ] All testers are told to start with a fresh account.

Fail Gate 0 if any of the above is false.

## Gate 1 - Staff Dogfood

Run this for `3-5` internal users before any outside invite.

- [ ] Every dogfood user completes onboarding and builds a plan.
- [ ] Every dogfood user logs at least one workout and one nutrition entry.
- [ ] Every dogfood user signs in on a second device and verifies parity.
- [ ] No blocker bug appears in:
  - onboarding
  - workout save
  - nutrition save
  - second-device restore
- [ ] No one is left in indefinite generic retry without a visible reason path.

Exit Gate 1 only after at least `5` clean end-to-end core-loop runs.

## Gate 2 - Wave 1 Friends-And-Family

Invite only `8` testers.

Goal of this wave:

- prove people can get through the first week
- find trust breaks early
- learn whether workout logging is actually fast enough
- verify multi-device parity outside the team

Wave 1 is complete only if:

- [ ] at least `6/8` testers complete all first-7 jobs
- [ ] no blocker data-loss bug appears
- [ ] no cross-surface contradiction becomes a repeated pattern
- [ ] no more than `1/8` testers need live human rescue to finish onboarding

## Gate 3 - Wave 2 Friends-And-Family Expansion

Expand only after Wave 1 is clean enough to deserve more exposure.

- [ ] Wave 1 blocker bugs are fixed or explicitly scoped out
- [ ] success metrics are at or above threshold
- [ ] same-account multi-device parity still holds in the latest build
- [ ] any high-friction onboarding or logging issue from Wave 1 has an owner and target fix date

Wave 2 goal:

- confirm the same signals hold with a slightly broader tester mix
- check whether trust and logging speed are resilient beyond highly motivated early users

## Gate 4 - Beta Exit Decision

Exit this private beta only if the core loop is trustworthy enough to broaden.

- [ ] plan trust scores are consistently strong
- [ ] workout logging is consistently fast
- [ ] second-device parity is consistently clean
- [ ] support burden is manageable
- [ ] no unresolved blocker remains in onboarding, saving, or cross-device parity

If any of those are false, do not broaden.

## Exact Onboarding Instructions For Testers

Send these exact instructions to every tester.

## Before you start

1. Use a fresh FORMA account for this beta.
2. Start on your phone, not your laptop.
3. Do not rely on Apple Health, Garmin, or reminders for this test.
4. If you already used FORMA before, do not reuse that account.

## Day 0 setup

1. Open FORMA on your phone.
2. Create an account or sign in with the fresh beta account you were given.
3. Complete intake if it feels reasonable, or use the skip/foundation path if you prefer.
4. Build your first plan.
5. Open `Today` and `Program` and compare them.
6. If the plan feels obviously wrong, stop and file a bug before training.

## During the week

1. Use FORMA as your source of truth for the planned session.
2. Log the workout from the `Log` tab immediately after training.
3. Log nutrition honestly on at least `3` days.
4. Later in the week, sign into the same account on a second device and check whether your plan and logs match.

## If something breaks

1. Do not keep tapping randomly.
2. Take a screenshot.
3. Copy the exact text on screen.
4. If sync looks stuck, note whether the app says `Retrying cloud sync`, `Device-only`, or anything more specific.
5. Submit the bug report template the same day.

## The First 7 Jobs Each Tester Should Attempt

These are mandatory.

1. Create a fresh account, finish or skip intake, and build the first plan on a phone.
2. Read `Today` and `Program` for the same day and answer: "Would you actually do this workout?"
3. Complete or simulate one prescribed workout and save it through `Log` in under `60` seconds if possible.
4. Reopen the app and confirm that workout log is still there.
5. Log nutrition on `3` separate days, including at least one day that was not perfect.
6. Sign into the same account on a second device and verify:
   - current plan matches
   - workout log matches
   - nutrition entries match
7. Refresh or reopen the second device and confirm the same state is still there.

## Bug Report Template

Every tester gets this exact template.

```md
# FORMA Beta Bug Report

## Summary
- Short title:

## Severity
- Blocker / Major / Minor / Note

## Tester context
- Goal type: run / hybrid / strength
- Device 1:
- Device 2, if used:
- Signed in or local-only:
- Fresh beta account: yes / no

## Exact screen
- Today / Program / Log / Nutrition / Coach / Settings / Auth / Intake

## What I expected
- 

## What actually happened
- 

## Exact steps
1. 
2. 
3. 

## Data impact
- No data loss
- Temporary confusion only
- Log disappeared
- Plan changed unexpectedly
- Cross-device mismatch
- Could not tell whether save worked

## Sync state shown on screen
- Normal
- Retrying cloud sync
- Device-only
- Other text:

## Attachments
- Screenshot or video:
- Optional console/network note:
```

## Success Metrics

These are the only metrics that matter for this beta.

## Plan trust

- `>= 75%` of testers answer `yes` or `mostly yes` to:
  - "Would you actually follow this week's plan?"
- `>= 70%` of testers report that `Today` and `Program` felt consistent
- `< 10%` of sessions trigger "this plan looks obviously wrong for me today"

## Logging speed

- Median time from opening `Log` to saving a prescribed workout: `<= 60 seconds`
- `>= 80%` of testers say workout logging felt `fast` or `acceptable`
- `>= 85%` of workout logs save on the first clear attempt, without user doubt about whether the save happened

## Cross-device data trust

- `>= 85%` of testers successfully see matching plan plus logs on the second device
- `>= 90%` of same-device reopen checks preserve the saved workout and nutrition state
- `0` confirmed data-loss incidents are allowed

## Support load

- Fewer than `1` live rescue intervention per `4` testers
- Fewer than `2` blocker bugs total in any `7` day beta wave

## Kill Criteria

Stop the beta immediately if any of these happen:

- any confirmed workout log or nutrition log disappears after the user believed it was saved
- any tester is trapped in onboarding and cannot build a plan without developer intervention
- the app repeatedly shows generic retry copy with no actionable or machine-readable reason path
- cross-device parity fails for more than `2` testers in the same wave
- Today, Program, and Log contradict each other in a way that changes what the user thinks they are supposed to do
- a privacy, account, or auth issue exposes the wrong user's data or breaks sign-in trust

Pause new invites, but continue triage, if any of these happen:

- more than `25%` of testers say they do not trust the plan
- median workout logging time rises above `90` seconds
- more than `2` testers need help understanding whether their data actually saved

## Weekly Triage Rhythm

Use the same rhythm every week of the beta.

## Monday

- Export all bug reports from the prior `7` days.
- Cluster by:
  - plan trust
  - onboarding friction
  - workout logging friction
  - nutrition logging friction
  - sync and cross-device parity
- Recompute the core beta metrics.

## Tuesday

- Reproduce every blocker and major issue.
- Mark each item as:
  - fixed this week
  - watched this week
  - deferred because out of scope
- Assign one owner per blocker.

## Wednesday

- Ship only the smallest fixes that directly support the core loop.
- Do not add new beta scope.
- Re-run the relevant deterministic browser tests before cutting a new beta build.

## Thursday

- Push the updated build to internal team first.
- Verify one fresh account, one workout log, one nutrition log, and one second-device parity pass.
- If that pass fails, do not send the build to testers.

## Friday

- Send a short tester check-in:
  - what changed
  - what to retry
  - what is still out of scope
- Review whether the wave advances, pauses, or rolls back.

## Decision Rules

- Advance the wave only if blocker count is `0`.
- Pause invites if a kill criterion is hit.
- Roll back the build if a regression touches:
  - workout save
  - nutrition save
  - onboarding completion
  - second-device parity

## Recommended Beta Artifacts To Review Each Week

- `docs/codex-audits/peter-persistence-adaptation-proof.md`
- `docs/codex-audits/local-first-vs-signed-in-guarantees.md`
- `docs/codex-audits/sync-degradation-recovery-proof.md`
- `docs/codex-audits/cloud-sync-launch-blocker-audit.md`
- `docs/MANUAL_QA_RELEASE_PACK.md`
- `docs/ADVERSARIAL_USER_TEST_MATRIX_AND_RELEASE_GATE.md`

## Bottom Line

An honest friends-and-family beta for FORMA is possible now only if it is narrow.

It should be:

- fresh-account
- phone-first
- core-loop-only
- explicit about what is in scope
- explicit about what is not yet trustworthy enough to claim

It should not be used to imply that all sync, restore, merge, reminders, or device integrations are already production-ready.
