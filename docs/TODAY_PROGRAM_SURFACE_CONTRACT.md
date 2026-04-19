# Today And Program Surface Contract

Updated: 2026-04-19

## Purpose

Today and Program must describe the same current day without feeling like duplicate screens.

- Today answers: `What do I do right now?`
- Program answers: `Where is this week going and what is coming next?`

The planner stays the source of truth. This contract is only about framing.

## Shared Source Of Truth

Both surfaces now read from one shared current-session summary model:

- canonical session title
- canonical current-day rationale line
- shared day-kind treatment
- shared hybrid and recovery language

Files:

- [`src/services/session-summary-surface-service.js`](../src/services/session-summary-surface-service.js)
- [`src/components/SessionSummaryBlock.jsx`](../src/components/SessionSummaryBlock.jsx)

This keeps Today and Program aligned on the same day label and same underlying reason line while letting each tab present that information differently.

## Today Contract

Today is a command center for one session.

Above the fold it should show:

- session title
- key metadata
- one rationale line
- one primary CTA
- one secondary action only if it helps the current moment

Everything else should be quieter or behind disclosure:

- session plan
- deeper why-this-changed explanation
- detailed plan card
- environment and shift controls

## Program Contract

Program is a trajectory view for the week and block.

Above the fold it should show:

- current week / block label
- one short week-level change line
- a trajectory header:
  - current chapter
  - next milestone
  - plan arc
- one primary reading CTA

Program should not show a second Today-style hero tile.

The current day still belongs in Program, but only as quiet context inside the `This week` reading flow.

## Hybrid And Recovery Treatment

Hybrid days:

- must read like one intentional combined touchpoint
- should not read like stacked chores
- both surfaces should acknowledge that run and strength belong to the same day, but Today should stay execution-first and Program should stay week-first

Recovery days:

- must read like a real planned slot
- should not feel empty or like a missing workout
- Program should frame recovery as part of the block, not as a gap

## What Changed In This Pass

- extracted a shared current-session summary model
- removed the loud duplicate `TODAY` tile from Program
- added a trajectory header to Program
- moved Today's session plan out of the hero and behind disclosure
- kept the current day visible in Program as quiet week context instead of a competing hero block

## Guardrails

- Today and Program must keep the same canonical session title.
- Today and Program must keep the same canonical rationale line.
- Program may mention the current day, but it cannot promote it to a duplicate hero tile.
- Settings and plan management should stay out of the Program reading flow.

## Verification

Key coverage:

- [`tests/plan-day-surface-service.test.js`](../tests/plan-day-surface-service.test.js)
- [`tests/session-summary-surface-service.test.js`](../tests/session-summary-surface-service.test.js)
- [`tests/program-roadmap-service.test.js`](../tests/program-roadmap-service.test.js)
- [`e2e/program.spec.js`](../e2e/program.spec.js)
- [`e2e/mobile-surfaces.spec.js`](../e2e/mobile-surfaces.spec.js)
