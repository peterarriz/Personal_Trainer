# Coach Mode Consumer IA

## Goal

Coach should do exactly three consumer jobs:

1. `Adjust today`
2. `Adjust this week`
3. `Ask coach`

Coach is not the planner of record. It is a decision surface with explicit acceptance.

## Core rules

- Nothing changes until the user accepts it.
- Chat never mutates plan state directly.
- The main surface should not show dead states like `AI advisory is off`.
- Each job should lead with one recommendation, one why, one consequence preview, and one clear next action.

## Revised information architecture

### Header

- `COACH`
- hero line: `Three jobs, one clear boundary.`
- supporting line: `Adjust today, adjust this week, or ask coach.`
- current canonical session label and reason
- latest accepted change, if any
- three-card job rail:
  - `Adjust today`
  - `Adjust this week`
  - `Ask coach`

### Job 1: Adjust today

Purpose:

- make the safest, clearest call for the current day

Content:

- context chips:
  - `Normal day`
  - `Missed yesterday`
  - `Travel today`
  - `Slept badly`
  - `Pain flare`
  - `Can I push?`
- one recommendation card:
  - `Recommendation`
  - `Why`
  - `Consequence`
- one button:
  - `Preview today's change`

### Job 2: Adjust this week

Purpose:

- make one deliberate weekly adjustment without rewriting the whole plan

Content:

- one primary recommendation card:
  - `Recommendation`
  - `Why`
  - `Consequence`
- one button:
  - `Preview weekly change`
- optional collapsed area:
  - `More weekly options`

### Job 3: Ask coach

Purpose:

- ask for interpretation, tradeoffs, and next-step guidance

Content:

- short boundary line:
  - `Answers only`
  - `Ask for a call, a tradeoff, or a next step. Chat never changes your plan - preview a change before you accept it.`
- example prompts
- input + ask CTA
- latest answer card:
  - `Recommendation`
  - `Why`
  - `Consequence`
- optional button when the answer implies a deterministic action:
  - `Preview suggested change`
- collapsed recent questions

### Shared preview card

Shown only after the user requests a preview from any of the three jobs.

Content:

- `Recommendation`
- `Why`
- `Consequence`
- audit / trust line
- `Accept change`
- `Cancel`

## Shipped notes

- The top-level tabs are still the three jobs, but the surface now uses a stronger card-style job rail rather than plain small buttons.
- `Ask coach` remains available on first load, but it is visually secondary to `Adjust today` and `Adjust this week`.
- Recent questions stay collapsed by default so the surface does not become a transcript wall.

## Example copy set

### Header

- `COACH`
- `Three jobs: adjust today, adjust this week, ask coach.`

### Adjust today

- `ADJUST TODAY`
- `Pick the situation. FORMA gives one recommended move, why it matters, and what changes if you accept it.`

Example recommendation:

- `Recommendation: Make today a recovery day`
- `Why: Sleep and soreness are suppressing quality more than volume would help.`
- `Consequence: Today's intensity drops, and the next 48 hours stay easier to recover from.`
- CTA: `Preview today's change`

### Adjust this week

- `ADJUST THIS WEEK`
- `FORMA recommends one weekly change first. Everything stays preview-only until you accept it.`

Example recommendation:

- `Recommendation: Reduce this week's volume`
- `Why: The cleanest win is preserving completions, not forcing full load.`
- `Consequence: Week 6 volume target becomes 88% of normal.`
- CTA: `Preview weekly change`

### Ask coach

- `ASK COACH`
- `Answers only`
- `Ask for a call, a tradeoff, or a next step. Chat never changes your plan - preview a change before you accept it.`

Example prompts:

- `Should I protect today or keep it?`
- `What is the smartest call for this week?`
- `What matters most for recovery tonight?`

Example answer:

- `Recommendation: Keep the full session and add one small progression only if the first half feels controlled.`
- `Why: Momentum supports a nudge, but the week should not jump because one day feels great.`
- `Consequence: If you push too early, tomorrow's recovery quality is the first thing to slip.`
- CTA when available: `Preview suggested change`

### Shared preview

- `PREVIEW`
- `Recommendation: Reduce this week's volume`
- `Why: This trims load without changing the direction of the block.`
- `Consequence: Week 6 volume target becomes 88% of normal.`
- `Nothing changes until you explicitly accept this deterministic preview.`
- CTAs:
  - `Accept change`
  - `Cancel`

## Copy principles

- short sentence first
- no filler reassurance
- no hidden system state in the main surface
- no vague `helpful` language
- no wording that implies a change already happened before acceptance
- premium tone means calm, specific, and restrained
