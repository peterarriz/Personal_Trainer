# Log Surface Execution

## Direction

Log is now FORMA's execution tool, not a history-first screen.

The default surface should work when someone is:

- walking between sets
- finishing a run and saving quickly
- checking whether today's session is logged

The tone follows the consumer copy guide:

- short
- calm
- specific
- no operator-console language

## Surface contract

### What Log answers first

- What session am I logging?
- What numbers do I need right now?
- Did my save go through?

### What stays above the fold

- one session hero
- one planned-session reference
- fast run and/or lift execution controls
- one quiet save rail

### What stays quieter or collapsed

- notes and context
- extra movement
- saved day review
- recent history

## Shared rules

- Keep exactly one planned-session card in the default logging path.
- Keep planned and actual separate.
- Show save state in one calm place instead of interruptive banners.
- Make the primary buttons and number controls big enough to use one-handed.
- Let strength days behave like set tracking, not a blank form.

## What changed

### Before

- quick logging competed with review and history
- small numeric fields made gym logging fiddly
- strength detail felt buried
- save state was easy to miss
- the surface still read too much like a form stack

### After

- the hero frames the session and save state quickly
- run logging uses large stepper controls
- strength logging uses default-visible execution cards with set, rep, and weight controls
- feel capture is a one-tap strip
- a local rest timer supports between-set use without taking over the screen
- advanced details and audit/history stay collapsed by default

## Fast-path behavior

### Run days

- adjust time and distance with large controls
- pace stays available but quieter
- save stays pinned and obvious

### Strength days

- each prescribed movement gets an execution card
- set, rep, and weight inputs are large and thumb-friendly
- one-tap `+1 set` and `Rest 90s` actions are always visible

### Hybrid days

- run and lift inputs share one screen
- the copy explicitly says both parts can be logged from the same place
- the planned session still appears once, not as duplicate current-session content

## Save trust

The save path now reads live control values before persisting. That protects the common gym behavior where someone types the last rep and taps save immediately.

This keeps the surface fast without weakening planned-vs-actual integrity.

## Before vs after reasoning

The old risk was not missing data. The old risk was making the user fight the UI before they could record the data. The redesign keeps the same structured capture model, but moves the experience closer to a workout tool:

- less reading
- larger controls
- one planned source of truth
- quieter audit layers

## Remaining limitations

- The rest timer is local to the surface. It is useful, but it is not yet a background timer with notifications.
- Numeric entry is materially better, but not a full keypad overlay system.
- History and review are demoted, not redesigned from scratch in this pass.
