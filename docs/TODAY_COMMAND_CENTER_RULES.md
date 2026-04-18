# Today Command Center Rules

## Goal
Today should answer three questions on first load:

- What is today’s workout
- What changed
- What should I do next

The first screen stays limited to one hero session card, one compact adaptation note, one primary action, one secondary action, and a quiet status area. Deep rationale and long prescription detail stay behind optional reveals.

## Behavior By Day Type

### Strength-only
- Lead with the strength session title and a single strength-first session stack.
- Keep support work inside the same hero stack instead of splitting it into extra cards.
- Use the adaptation note only for real load, schedule, or setup changes.
- Primary action opens inline logging. Secondary action opens the week view.

### Run-only
- Lead with the planned run and the short session stack.
- Keep visible copy to the workout, one short next-step line, and one change note.
- Put deeper rationale behind `Why this changed`.
- Primary action opens inline logging. Secondary action opens the week view.

### Hybrid
- Show one hero card with both run and strength in a single stacked plan.
- Do not split the day into separate run and strength cards.
- Use one combined change note for the day instead of lane-by-lane narration.
- Primary action opens inline logging. Secondary action opens the week view.

### Rest
- Present the day as recovery, not as an empty or missing workout.
- Keep the hero reassuring and light.
- Swap the main action to recovery logging language.
- Keep the week view available as the secondary action.

### Reduced-load
- Preserve the underlying session so the user can still see what the day is.
- Add a quiet reduced-load signal in the status area.
- Explain the lighter version in one plain-language adaptation note.
- Keep the deeper rationale behind `Why this changed`.

## Copy And Layout Guardrails

- The hero card owns the workout, next step, status, and actions.
- The adaptation note gets one sentence by default.
- Sync stays quiet unless the state is not healthy.
- Logging stays hidden until the user opens it from the main CTA.
- `Why this changed` and `Full session details` are optional reveals, not default reading.
