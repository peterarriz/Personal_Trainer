# Adaptive Explanation Standards

## Goal
Adaptive prescription changes should feel stable, intentional, and coach-like.

The app should explain:
- what changed
- why it changed
- where the change came from

The app should not expose:
- raw decision point ids
- action ids
- confidence scores
- sample sizes
- internal rule ids
- internal fallback reasons

## User-Facing Source Labels

Use these short labels in consumer surfaces:
- `Plan rule`
- `Based on your recent training`
- `You changed this`
- `Recovery-first change`

These labels should stay short and stable across Today, Program, Log, Nutrition, Coach, and saved day reviews.

## Copy Rules

- Keep the main explanation to one sentence.
- Use plain language about completion, recovery, time, travel, and session structure.
- Avoid AI or ML wording.
- Avoid certainty when the signal is weak.
- If confidence is still early, use soft follow-up copy such as:
  - `We will keep watching completion and recovery before making bigger shifts.`
  - `Still an early read, so the plan stays ready to settle back down if the signal changes.`

## Category Rules

### Plan rule
Use when the prescription is still following deterministic block logic, priorities, or current plan structure.

### Based on your recent training
Use when a recommendation is shaped by actual recent outcomes, adaptive policy choice, or recent log-driven pattern.

### You changed this
Use when the user changed training setup, goals, or other plan-driving preferences directly.

### Recovery-first change
Use when the main reason is protecting recovery, controlling load, or responding to pain-sensitive signals.

## Surface Standards

### Today
- Show one short source label above the `What changed` note when helpful.
- Keep the visible note concise.
- Put extra detail in `Why this changed`.

### Program
- Keep one short source label near the current-week change summary.
- Use the same explanation line that Today and Log use for the same day when possible.

### Log
- Show the same source label and core reason near the planned session summary.
- Do not repeat the explanation in multiple paragraphs.

### Nutrition
- Keep the source label subtle near the session reason.
- The nutrition hero should still lead with fuel guidance, not provenance.

### Coach
- Use the shared source label for the current plan context.
- Coach recommendations can add their own `Why`, but should not contradict the shared plan explanation.

### Saved Day Review
- Show the source label and one short explanation above the review story.
- Treat skipped, modified, and pain-limited days differently.

### Goal Changes
- Explicitly frame goal changes as user-controlled.
- The plan should only change after the user confirms.

## Internal Payload

The internal explanation payload may include:
- category
- selected adaptive decision point
- selected action id
- confidence band
- provenance actor
- change input type

This payload is for debugging and diagnostics only. It should not be rendered directly in consumer mode.

## Promotion Guidance

Before enabling active adaptive behavior for a decision point:
- keep the user-facing explanation template ready
- confirm the explanation matches the real chosen action
- confirm shadow mode logs and user-facing copy do not drift
- confirm cross-surface wording stays aligned
