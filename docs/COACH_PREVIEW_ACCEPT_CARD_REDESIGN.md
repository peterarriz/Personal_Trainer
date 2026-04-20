# Coach Preview Commit Card Redesign

Component lives in [src/components/CoachPreviewCommitCard.jsx](../src/components/CoachPreviewCommitCard.jsx).  
Rules live in [src/services/coach-preview-commit-card-spec.js](../src/services/coach-preview-commit-card-spec.js).  
Visual review lives in [docs/codex-audits/coach-preview-accept-card.html](./codex-audits/coach-preview-accept-card.html).

## Goal

Redesign the shared Coach `Preview -> Accept` card so it no longer reads like:

- `Recommendation`
- `Why`
- `Consequence`
- `Accept`

The new hierarchy should feel like a real commit surface:

1. headline
2. consequence lead
3. quiet why support
4. commit zone

## What changes

### Old weight

- recommendation headline carries the whole card
- why and consequence feel visually equivalent
- accept reads like a generic approval action

### New weight

- recommendation still names the move, but it is not the analytical center of the card
- consequence leads the body with concrete impact, preferably numeric plus preserved anchor
- why moves into a quieter supporting register
- accept becomes a commit decision with scope-aware language

## Component anatomy

### Header

- Eyebrow: `Preview`
- Recommendation headline
- Source line such as `Adjust today`, `Adjust this week`, or `Ask coach`

### Consequence lead

- Label: `What changes`
- One lead line in the form:
  - `Volume -12%, long run stays`
  - `Duration -15 min, impact lower`
  - `Bench +1 top set, run quality stays`
- Optional short support line under the lead
- Optional compact chips for scope or preserved anchors:
  - `Week 6 only`
  - `Tomorrow unchanged`
  - `Recovery unchanged`

### Why support

- Label: `Why this is the call`
- One calm sentence
- Smaller and quieter than the consequence lead

### Commit zone

- Label: `Commit`
- Scope line:
  - `This replaces the live plan for today only.`
  - `This replaces the live plan for the current week only.`
  - `This makes the suggested change live for the next planned stretch.`
- Trust line:
  - `Nothing changes until you commit this version.`
- Primary CTA:
  - `Commit today's change`
  - `Commit weekly change`
  - `Commit suggested change`
- Secondary CTA:
  - `Keep current plan`

## Three job mocks

### Adjust today

- Headline: `Swap the full session for a recovery-first version`
- Consequence lead: `Duration -15 min, impact lower`
- Support: `Warm-up stays, sharp work comes out, and tomorrow holds as written.`
- Chips: `Today only`, `Tomorrow unchanged`
- Why: `Sleep and soreness are suppressing quality more than the extra volume would help.`
- Commit CTA: `Commit today's change`

### Adjust this week

- Headline: `Reduce this week's volume`
- Consequence lead: `Volume -12%, long run stays`
- Support: `The week gets smaller without changing the direction of the block.`
- Chips: `Week 6 only`, `Strength stays`
- Why: `The cleanest win right now is protecting completions instead of forcing the full load.`
- Commit CTA: `Commit weekly change`

### Ask coach

- Headline: `Add one small strength progression next week`
- Consequence lead: `Bench +1 top set, run quality stays`
- Support: `The suggested change nudges the strength lane without asking the endurance side to pay for it.`
- Chips: `Next 2 weeks`, `Recovery unchanged`
- Why: `The last stretch supports a nudge, but the endurance lane still has to stay clean.`
- Commit CTA: `Commit suggested change`

## When consequence is optional

Consequence should be present by default. It is the main value of a deterministic preview.

Consequence is optional only when all three conditions are true:

1. There is no honest numeric delta to show.
2. There is no preserved anchor worth surfacing, such as `long run stays` or `tomorrow unchanged`.
3. The outcome is already fully legible in the headline, so adding a consequence block would only restate the same thing in thinner words.

Examples where omission can be acceptable:

- `Switch to travel nutrition mode` when no calories, carbs, or schedule shifts can be stated honestly yet.
- `Move long run to Sunday` when the headline already contains the only real change and no other preserved anchor is meaningful.

Even in those cases, consequence should only disappear if inventing specificity would be faker than leaving it out.

## Copy rules

- Prefer numeric delta first, preserved anchor second.
- Use commas instead of explanatory paragraphs in the consequence lead.
- Keep why to one sentence.
- Avoid `Accept change`. Use `Commit` language.
- The secondary action should defend the current plan:
  - `Keep current plan`
- Keep trust copy close to the commit CTA, not buried in a disclosure.

## What this fixes

- Preview cards stop reading like a form field stack.
- Weekly changes become legible in one scan because the impact leads.
- `Ask coach` previews stop feeling like dressed-up chat answers.
- The final action reads like a real plan mutation, not a vague acknowledgment.
