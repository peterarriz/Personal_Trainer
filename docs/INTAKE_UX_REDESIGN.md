# Intake UX Redesign

## Purpose

This document defines a cleaner onboarding and intake UX for goal setup.

The redesign should feel:

- lighter than a giant form
- more structured than open-ended AI chat
- explicit about what AI inferred
- deterministic once the user confirms the resolved goal

It should plug into the existing typed intake boundary and goal-resolution service instead of creating a separate onboarding architecture.

## Core Problem

The current intake feels too scripted because it asks a fixed sequence of generic questions before the product has shown the user any meaningful understanding of their goal.

That creates three UX issues:

- vague users feel pushed into preset buckets too early
- exact-metric users feel slowed down by unnecessary questions
- AI interpretation appears as copy, but not as a visible, reviewable proposal

The redesign should make goal understanding the center of onboarding, not a side effect of a questionnaire.

## UX Principles

- Start with the user's own words.
- Show interpretation early.
- Ask only questions that change planning.
- Keep AI proposals visible and reviewable.
- Require explicit confirmation before canonical goal creation.
- Be honest about fuzziness instead of inventing precision.
- Prefer compact choice cards over long free-text prompts.

## Recommended Structure

Replace the current "coach asks everything in sequence" flow with a compact five-step goal-first flow:

1. `Say It`
2. `Interpret`
3. `Clarify`
4. `Confirm`
5. `Build`

This should be a staged card flow, not a fake chat transcript.

Recommended shell:

- one primary content card for the current action
- one persistent summary rail showing the evolving goal interpretation
- mobile stacks the summary rail below the main card

The summary rail should always show:

- `Your words`
- `What we'll track`
- `What's still fuzzy`
- `Tradeoffs to watch`

That gives the user a stable sense of progress without turning intake into a wizard with many screens.

## Step 1: Say It

The first screen should ask one direct question:

`What do you want to work toward?`

Primary interaction:

- one plain-English text field
- optional quick-start chips such as `Run a race`, `Get stronger`, `Lean out`, `Get back in shape`

The chips should only help people start. They should not become the canonical goal on their own.

Optional reveal for exact-goal users:

- `I already know my target`

If expanded, allow compact structured hints:

- target metric
- target date
- event name

This helps users who know exact numbers move faster without forcing vague users into a form.

## Step 2: Interpret

As soon as the user submits their goal text, the app should generate an interpretation proposal using:

- raw goal text
- any known memory or profile context
- lightweight baseline context if already known

The app then shows an explicit `AI interpretation` card.

That card should contain:

- `Goal summary`
- `Goal type`
- `Measurability`
- `Suggested tracking`
- `Timeline read`
- `Possible tradeoffs`

Example:

- `You said:` "look athletic again"
- `We think this means:` improve body composition and rebuild training consistency
- `We'd likely track:` waist trend, bodyweight trend, weekly training completion
- `Still fuzzy:` exact timeline and what "athletic" means for you

Important rule:

- this is clearly labeled as a proposal
- nothing in this state is canonical yet

Primary actions:

- `Looks right`
- `Edit interpretation`
- `Start over`

## Step 3: Clarify

After the interpretation preview, the app should ask only the missing questions needed to make planning practical.

This is where schedule reality, equipment, constraints, and timing details come in.

Question selection rule:

- ask a question only if the answer changes planning, tracking, or tradeoff handling

Question limit rule:

- ask at most 3 questions in a round

Question style:

- mostly multiple choice, segmented controls, date pickers, and short text
- avoid open-ended follow-ups unless the user is correcting the interpretation

Priority order for clarification:

1. missing goal-defining information
2. schedule reality
3. equipment/access constraints
4. injury or movement constraints
5. appearance or timing preferences

Examples of valid clarification questions:

- `What matters more first: looking leaner or performing better?`
- `Do you have a date in mind, or is this open-ended?`
- `How many days can you realistically train most weeks?`
- `Where will most training happen?`
- `Anything we need to avoid because of pain or injury?`

Examples of questions to avoid:

- questions asked only because they exist in a template
- broad motivational prompts
- free-text autobiography

## Clarification Logic By Goal Type

### Exact metric users

If the user says `run a 1:45 half marathon` or `bench 225`, the flow should skip most goal-definition questions and only ask for missing planning constraints:

- target date if absent
- current baseline if materially unclear
- training schedule reality
- injury or equipment constraints

### Appearance or lifestyle users

If the user says `get lean for summer`, `have six pack by August`, or `look athletic again`, the flow should not pretend a perfect direct metric exists.

The app should:

- classify the goal as `proxy_measurable` or `exploratory_fuzzy`
- propose proxy metrics
- ask for one concrete success signal
- ask for any timing expectation

Good clarification prompt:

`Which would make this feel like it's working in the first month?`

Suggested answer chips:

- clothes fit better
- waist comes down
- scale trends down
- visible ab definition
- more consistent training

### Mixed or hybrid users

If the user says `be a hybrid athlete` or `lose fat but keep strength`, the app should explicitly show the goal stack rather than collapsing everything into one label.

The clarification step should ask:

- which goal is primary
- what must be preserved
- which tradeoff is unacceptable

Example:

- `Primary:` lose fat
- `Preserve:` barbell strength
- `Track:` bodyweight trend, waist, top set strength stability

## Step 4: Confirm

Before plan generation, the app should show a `Resolved goal` card.

This is the first canonical-looking object the user sees, and it must be explicitly confirmed.

The confirmation card should show:

- `Resolved goal`
- `Primary metric or proxies`
- `Target date or horizon`
- `Confidence`
- `What we'll track`
- `What's still fuzzy`
- `Tradeoffs`
- `Review trigger`

For fuzzy goals, the card must also include:

- `First 30-day win`

Example:

- `Resolved goal:` look leaner and more athletic again
- `Track:` waist trend, bodyweight trend, 3 training sessions per week
- `Still fuzzy:` exact appearance endpoint
- `First 30-day win:` complete 10 of the next 12 planned sessions and reduce waist by 0.5 to 1.0 inches

Primary actions:

- `Confirm goal`
- `Edit details`

Rule:

- `Confirm goal` is the moment the app may create canonical resolved goal objects
- before this click, all AI output remains proposal-only

## Step 5: Build

Only after confirmation should plan generation proceed.

The planner should consume:

- resolved goal object
- typed intake packet
- confirmed schedule and constraint inputs

The planner should not consume raw free text by itself when a resolved goal exists.

The build screen should briefly reflect the confirmed structure:

- `Building for: Half marathon performance`
- `Tracking: race pace, long-run progression`
- `Constraints: 3 days/week, home + gym`

This reassures the user that plan generation is using the goal they approved.

## What The App Must Surface

Each intake should make four things explicit before confirmation:

- what the app thinks the goal is
- what the app will track
- what is still fuzzy
- what tradeoffs the plan will respect

These should not be hidden in long paragraphs. They should be displayed as compact labeled rows or pills.

## Handling Fuzzy Goals Without Fake Precision

Fuzzy goals still need usable planning inputs.

The app should resolve them by creating:

- a goal family
- a measurability tier
- a small proxy metric set
- a first 30-day success definition
- a review cadence

This gives planning enough structure to act without pretending the user gave a precise endpoint they never actually gave.

For example:

- `look athletic again` becomes a proxy-tracked body-composition plus consistency goal
- `get back in shape` becomes a re-entry goal with training frequency, energy, and baseline capacity proxies
- `be a hybrid athlete` becomes a mixed goal with one strength marker and one endurance marker, plus a priority order

## Tone And Interaction Rules

- Use direct labels, not conversational filler.
- Keep coach-style language secondary to structure.
- Show one clear next action per step.
- Prefer short explanation text with visible data rows.
- Use AI only for interpretation, not for theatrics.

Good microcopy:

- `Here's how I understood your goal.`
- `I need 2 details to make this plan realistic.`
- `This is what we'll track at the start.`
- `This part is still fuzzy, and that's okay.`

Bad microcopy:

- long motivational speeches
- fake human-like small talk
- vague reassurance without concrete meaning

## Why This Is Better Than The Current Flow

The redesigned flow improves usability because it lets people begin naturally, then narrows only where necessary.

It improves trust because:

- AI interpretation is visible instead of hidden in generated copy
- the user sees what the app inferred before it affects planning
- fuzzy areas are named instead of glossed over
- tradeoffs are surfaced before the plan is built
- confirmation is the explicit handoff from proposal to canonical planning state

It improves speed because:

- exact-goal users can move quickly
- vague users are not forced into a giant form
- question count drops to only what materially changes planning

## Mapping To Existing Architecture

This UX should map directly to the current architecture:

- Step 1 produces `rawGoalIntent`
- Step 2 uses the typed intake AI boundary for proposal generation
- Step 3 fills missing fields in the typed intake packet and goal-resolution inputs
- Step 4 calls the deterministic goal-resolution service and writes confirmed resolved goals
- Step 5 hands resolved goals to the planner

This keeps the final system deterministic while still making the intake feel adaptive and human-readable.

## New Intake UX Structure

- one plain-English goal entry
- one explicit interpretation preview
- one short round of only the missing clarification questions
- one resolved-goal confirmation step
- one plan build step based on confirmed structured goal data

## Trust And Usability Summary

The redesign builds trust by making AI interpretation reviewable, non-canonical, and easy to correct before anything is committed.

It improves usability by replacing the current scripted intake with a compact goal-first flow that adapts to both exact and vague users, surfaces what will actually be tracked, and turns fuzzy intent into a practical confirmed planning setup.
