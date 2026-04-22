# Habit Adaptation Contract

## Goal
Teach the planner from repeated behavior without turning one-off misses or swaps into permanent rewrites.

## Source Data
- `plannedDayRecords`
- `logs`
- historical prescribed-vs-actual comparisons from `comparePlannedDayToActual(...)`
- structured exercise actuals from `getExercisePerformanceRecordsForLog(...)`

## Signals

### Weekday reliability
- Count only historical prescribed days before `todayKey`
- Track `expectedCount`, `completedCount`, `skippedCount`, `modifiedCount`
- Mark a `chronicMissDayKey` only when a weekday has:
  - at least `3` expected sessions
  - at least `2` skips
  - skip rate `>= 0.67`

### Exercise preference
- Only learn from strength-like prescribed days with explicit `prescribedExercises`
- Only learn accessory patterns, not direct goal drivers
- Mark a preference as dominant only when:
  - the user added the same replacement exercise at least `2` times
  - the prescribed pattern was omitted at least `2` times

### Cardio modality preference
- Learn completed `easy_aerobic`, `conditioning`, and `long_session` behavior from historical logs
- Only count completed outcomes:
  - `as_prescribed`
  - `modified`
  - `custom_session`
- Mark a dominant cardio mode only when:
  - the same mode appears at least `2` times
  - it beats the next-most-common mode by at least `1`
- Track a `preferredLongSessionDayKey` when long sessions are actually completed on the same weekday at least `2` times
- Mark `lowImpactBias` when easy-aerobic or conditioning history repeatedly lands on low-impact modes such as `bike`, `elliptical`, `incline walk`, `rower`, or `swim`

### Recurring add-ons
- Learn accessory exercises the user keeps adding even when they were not prescribed
- Only count accessory/support patterns, not direct drivers
- Mark a recurring add-on when the same exercise appears at least `2` times in a compatible support pattern

### Accessory patterns to stop forcing
- Learn accessory patterns that are repeatedly prescribed and repeatedly omitted
- Only count accessory/support patterns without direct-driver ownership
- Mark a pattern as avoidable when:
  - it is omitted at least `3` times
  - there is no learned replacement already covering that pattern

## Planner behavior

### Schedule reliability shift
- Runs only when a real `chronicMissDayKey` exists
- Only moves important work:
  - `keySession === true`
  - or `planningPriority <= 1`
  - or a high `resolveSessionPriorityScore(...)`
- Prefers moving key work onto:
  - a recovery slot
  - otherwise a lower-priority easy/conditioning slot
- Replaces the chronic miss day with recovery or the displaced lower-priority work
- Never overrides explicit weekday availability with a habit-based shift

### Preferred long-session day
- Runs after explicit weekday availability
- Moves a long session onto the weekday where long sessions are actually completed most often
- Only runs when:
  - the preferred day has at least `2` completed long sessions of evidence
  - the target day is not blocked by explicit weekday availability
  - the target day is not already carrying another protected long session
  - the target day is not occupied by another very high-priority session

### Cardio preference overlay
- Runs after explicit weekday availability and schedule reliability shifts
- Lets conditioning and supportive aerobic sessions lean into the cardio mode the user actually keeps choosing
- Can bias non-key support cardio toward low-impact modes when the evidence is strong
- Does not casually replace key running sessions with a different modality when a real running goal is active

### Exercise preference substitution
- Runs after support exercise selection
- Replaces accessory rows by learned preferred exercises for the same transfer pattern
- Never replaces rows with `directDriverIds`

### Add-on preservation and avoid-pattern trimming
- Can append one recurring add-on accessory to a compatible support packet when space exists
- Can remove repeatedly skipped accessory patterns when they are not direct drivers
- Never trims a row with `directDriverIds`

## Non-goals
- No one-off miss learning
- No hidden randomization
- No replacement of main lifts from accessory preferences
- No silent overrides of exact explicit weekday availability
- No schema migration in this pass

## Main code paths
- Analyzer: `src/services/habit-adaptation-service.js`
- Planner integration: `src/modules-planning.js`
- Coverage: `tests/habit-adaptation-service.test.js`, `tests/hybrid-planning-engine.test.js`, `tests/dynamic-plan-engine.test.js`
