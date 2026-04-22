# Intake Goal Capture Contract

## Product shape

The intake goal stage is structured first:

1. Choose a goal category.
2. Choose a mapped template.
3. Add goal details only when they help.
4. Save the goal.
5. Repeat for additional goals.
6. Fill weekly reality once.
7. Build from the same screen.

Custom goals are a fallback path, not the dominant path. The custom composer should stay collapsed until the user asks for it, and custom goals should still go through the same `pending -> save goal` flow as templates.

## Surface responsibilities

The live goal stage owns:

- category chips
- featured templates
- one pending goal detail card
- saved goal priority stack
- optional saved-goal metric edits
- weekly reality inputs

It should not own:

- a second full goal-library browser
- parser-first freeform capture as the default entry path
- a separate goal-lock concept
- extra wizard chrome that repeats the same instructions

## Data contract

Structured goals save through `goal_template_stack` using `buildGoalTemplateSelection(...)`.

Template-backed goals should preserve:

- `templateId`
- `intentId`
- `familyId`
- `summary`
- `goalText`
- any structured starter metric answers stored in `answers.intake_completeness`

Custom goals also save into the same stack, but with `entryMode: "custom"`.

## Fuzzy-goal rule

Exact metrics are optional during goal capture.

- If a user leaves a metric block blank, intake should still allow the goal to be saved.
- If a user starts filling a metric block, validation should still protect obviously incomplete structured entries.
- Missing exact targets can be clarified later by the review / clarification flow.

## Build behavior

The primary intake action on the goal stage should attempt to build immediately once:

- at least one goal is saved
- weekly reality is filled enough to shape week one
- no goal is left half-saved in the pending state

If more detail is required, the flow can route into clarification. The user should not have to understand an extra "lock goals first" concept.
