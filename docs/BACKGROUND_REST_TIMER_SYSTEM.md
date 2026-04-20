# Background Rest-Timer System

Visual review lives in [docs/codex-audits/background-rest-timer-system.html](./codex-audits/background-rest-timer-system.html).

## Intent

The rest timer should behave like a serious lifting tool, not a fragile in-screen widget.

It needs to:

- stay alive when the phone locks
- warn the athlete at `T-10s`
- call the set at `T=0`
- respect silence, focus, and skipped permissions without becoming annoying

## Core behavior

- Start from the exercise card with `Rest 90s`, `Rest 120s`, or the saved rest preset.
- Show one active rest timer at a time.
- Keep the timer visible in Log while the app is open.
- Mirror that same timer on the lock screen when background alerts are allowed.
- Fire a light haptic at `T-10s`.
- Fire a stronger completion haptic at `T=0`.
- Offer an optional spoken cue at `T=0`.
- Fall back silently when alerts, sound, or speech are unavailable.

## Consent moment

Ask during onboarding, not on first timer use.

### Placement

Show the permission card after the plan is built and before the user lands in the main app shell.

Reason:

- the user has enough context to understand why it matters
- the ask does not interrupt a live set in the gym
- the timer can be configured once, calmly, during setup

### Onboarding card

- Headline: `Stay with your sets`
- Supporting line: `FORMA can keep your rest timer alive on the lock screen, give you a countdown cue, and stay quiet when you want it quiet.`
- Controls:
  - `Enable lock-screen timer alerts`
  - `Use haptic countdown`
  - `Speak the last cue`
- Primary action: `Enable timer cues`
- Secondary action: `Not now`

### Defaults

- Lock-screen timer alerts: off until permission is granted
- Haptic countdown: on
- Spoken cue: off
- Silent fallback: always on, no extra setting

## Lock-screen notification layout

The lock-screen card should feel like a compact lifting tool, not a generic push reminder.

- Top label: `Rest timer`
- Main line: exercise name, example `Front squat`
- Large countdown line: `0:10`
- Supporting line while running: `Set 4 follows`
- Supporting line at completion: `Time for the next set`
- Quick actions:
  - `+30 sec`
  - `Pause`
  - `Clear`

## In-app running state

The in-app state should stay inside Log as a persistent strip, not a modal takeover.

- Show:
  - exercise name
  - countdown
  - progress state: `Resting now`, `10 seconds`, `Ready`
- Controls:
  - `+30 sec`
  - `Pause`
  - `Clear`
- At `T=0`, the strip changes to `Ready for the next set`
- If spoken cue is enabled, the app says the exercise name plus a short call, for example: `Front squat. Next set.`

## Silent fallback

Silent fallback is not an error state. It is the graceful default when a louder cue is unavailable.

Use silent fallback when:

- notification permission was skipped
- the user disabled lock-screen timer alerts
- the device is in a mode where spoken cue should not fire
- speech playback fails

Silent fallback behavior:

- keep the in-app timer running normally
- keep haptics if the device allows them
- never force a second permission prompt
- when the app returns to foreground after expiry, show `Rest finished while you were away`

## Edge cases

### Timer paused when session is paused

- If the user pauses the session, the timer pauses too.
- The lock-screen card changes from countdown to `Rest paused`.
- Resume restores the exact remaining time.

### Timer cleared on log-set

- If the user logs a set while a rest timer is active, clear the timer immediately.
- Reason: logging a set means the athlete resumed work.
- If they want another rest interval, they can start a new one explicitly.

### New timer started while one is already running

- The new timer replaces the old one.
- The strip and lock-screen card update to the new exercise and duration.

### App backgrounded with permission granted

- The timer keeps counting down.
- The lock-screen card stays current.
- Haptic warning and completion cues still fire if allowed.

### App backgrounded with permission denied

- The timer keeps counting locally if the app stays alive.
- No lock-screen card is shown.
- On return, the app resolves to either the live remaining time or `Rest finished while you were away`.

### Timer finishes while the phone is locked

- Show the completion notification state.
- Trigger completion haptic.
- Trigger spoken cue only if speech is enabled and allowed.

### Session changed or log draft reloaded

- Clear any active timer.
- Reason: rest timers belong to the live set context, not to stale draft state.

## System rule

This feature is a workout-time utility, not a general reminder system.

- Do not bury it under weekly reminder settings.
- Do not prompt for permission on first use.
- Do not use gamified language, streaks, or celebration when a timer completes.
- The best version feels invisible until it matters.
