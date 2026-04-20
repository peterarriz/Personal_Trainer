# Rest-Day Today Screen

Visual mock lives in [docs/codex-audits/rest-day-today-screen.html](./codex-audits/rest-day-today-screen.html).

## Intent

Rest day should feel planned, warm, and coach-led. It cannot read like a hole in the calendar or a sneaky productivity prompt.

## Screen shape

- Lead with a soft recovery hero, not an empty-state card.
- Use one sentence to explain why today is rest.
- Keep the recovery-log action available, but quiet and clearly optional.
- Show a short glimpse of tomorrow so the user understands what this day is protecting.
- Keep the entire screen free of streaks, scores, rings, or completion framing.

## Proposed surface

- Eyebrow: `Recovery day`
- Headline: `Take the day light`
- Reason line: one sentence only. Example: `Today is rest because the last two sessions carried the load, and tomorrow lands better if you show up fresh.`
- Recovery shape card: a small warm card that frames rest as active care, not absence. Example anchors: easy walk if it helps, a few minutes of mobility, normal meals and earlier sleep.
- Optional CTA: `Log recovery`
  - Present as a quiet text button or low-emphasis pill.
  - Support line: `Only if something is worth noting today.`
  - Opening state should feel like a small coach notebook, not a form stack.
- Tomorrow glimpse:
  - Label: `Tomorrow`
  - Keep it to one short sentence plus one compact metadata line.
  - Example: `Lower-body strength, 45 min. Crisp work, no junk volume.`

## Brand signature

Use a recurring serif micro-treatment above the headline.

- Name: `Morning line`
- Typography direction: editorial serif, italic or soft roman, clearly distinct from the normal product voice
- Purpose: make recovery feel authored and premium without turning into inspirational wallpaper
- Placement: above the hero headline, same place every time
- Length: 3 to 7 words
- Source: curated in-product line set, never attributed quotes

Examples:

- `Quiet work still counts.`
- `Absorb the block.`
- `Fresh legs are earned.`
- `Let the work settle.`

## Guardrails

- Do not congratulate the user for resting.
- Do not show streaks, percentages, flames, trophies, or recovery scores in the hero.
- Do not make `Log recovery` the loudest element on the screen.
- Do not turn tomorrow into a second hero. It is a glimpse, not the main event.
