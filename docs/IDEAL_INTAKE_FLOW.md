# Ideal Intake Flow

## 1. Product Objective

### What intake is supposed to accomplish

Intake exists to turn messy human intent into a believable, confirmed planning brief.

By the end of intake, the app should have:

- the user's raw goal intent in their own words
- a clear interpreted primary goal
- the minimum required anchors needed to build a credible first plan
- realism guidance for the stated target
- an explicit answer on whether anything should be maintained in the background
- a confirmed resolved goal object and canonical planner input

### What intake is not supposed to do

Intake is not supposed to:

- feel like a giant settings form
- force users into rigid canned goal categories before they can explain themselves
- expose internal schema or planner vocabulary
- fake certainty when the app lacks enough information
- quietly invent secondary goals, training context, or realism assumptions
- become a general chat experience

### What "good" feels like for a user

Good intake feels like a short trainer interview:

- the user can start vague or exact
- the app quickly reflects back what it thinks the goal means
- the app asks only the next necessary question
- the user can see what will be tracked and what still needs clarification
- the app clearly says when the goal is workable, aggressive, or not realistic yet
- confirmation feels trustworthy because the app is explicit about what it knows and what it is planning around

## 2. Guiding Principles

- The user can start vague.
- The app asks only what is necessary to build the first credible block.
- AI may interpret, but the user confirms.
- Only confirmed structured goal state becomes canonical planner input.
- The UI should use plain English, not internal schema language.
- No fake precision.
- No silent assumptions.
- No hidden secondary goals.
- No stale interpretation after the goal changes.
- One answer should only satisfy the field it was asked for.
- If the app is blocked, it must say why.
- If the app is uncertain, it must sound appropriately uncertain.

## 3. End-to-End Ideal Flow

### Step 1: Opening question

The app opens with one simple prompt:

`What do you want from this plan? Exact or vague both work.`

The user can answer with:

- `Run a 1:45 half marathon`
- `Bench 225`
- `Lose 20 lb`
- `Look athletic again`
- `Get abs by summer`
- `Be a hybrid athlete`

The app then asks a small number of general planning-context questions:

- training background
- days per week
- session window
- training environment
- coaching style

These questions should stay lightweight and should not pretend to resolve the goal yet.

### Step 2: Interpretation step

After the base intake answers are in, the app shows a short interpretation card:

- what the app thinks the goal is
- what kind of goal it is
- what it plans to track first

This is not final confirmation yet. It is a checkpoint.

### Step 3: Required follow-up step(s)

The app computes the minimum required anchors for the interpreted goal.

It then asks only the next missing required question, one at a time.

Examples:

- `What's your current bench baseline right now?`
- `What's the race date or target month?`
- `What's your current running baseline: runs per week, plus either your longest recent run or a recent pace/race result?`
- `What's your current bodyweight, and roughly how much are you trying to lose?`
- `What's one proxy we can track for this right now: current bodyweight or waist?`

After every answer:

- the field is bound and saved
- completeness recomputes immediately
- the same question is not asked again unless the answer was still incomplete

### Step 4: Realism check

Once the minimum anchors exist, the app evaluates realism.

It does not merely say "ready" or "not ready." It classifies the target as:

- workable
- aggressive but plausible
- underconstrained
- unrealistic
- conflicted because the goal stack pulls in different directions

The realism step should sound like coaching guidance, not a validator message.

### Step 5: Optional secondary-goal step

After the primary goal and required anchors are stable, the app asks one optional question:

`Anything else you want to maintain while chasing this?`

This is where the app makes multi-goal support explicit.

The user can:

- skip it
- keep a common maintained goal
- enter a custom maintained goal

The app should not ask this before the core primary goal is stable.

### Step 6: Final confirmation

The app shows a concise confirmation surface that answers:

- what the lead goal is
- what, if anything, is being maintained
- what will be tracked
- what tradeoff the plan will respect
- whether the plan is good to build now

The user can:

- confirm and build the plan
- edit the interpretation
- revise the target if realism blocks it

### Step 7: Handoff into plan generation

Only after explicit confirmation does the app:

- finalize resolved goals
- finalize goal-stack ordering
- write canonical goal state
- hand off the confirmed result into planning

No provider output or preview object should write canonical state directly.

## 4. User-Facing Screen/Message Structure

### Opening intake

What the user sees:

- one chat-style opening prompt
- one answer box
- lightweight follow-up buttons for planning context

What the app says:

- `What do you want from this plan? Exact or vague both work.`

Actions/buttons:

- normal answer submission
- standard button choices for context questions

Hidden/collapsed:

- any internal labels like goal family, measurability, confirmation gate

Plain-English labels:

- `Training background`
- `Training days`
- `Session length`
- `Where you train`
- `How hard you want to be pushed`

### Interpretation checkpoint

What the user sees:

- one concise summary block
- one tracking block
- one missing-info block if needed

What the app says:

- `Here's what I'm hearing`
- `Here's what I'll track first`

Actions/buttons:

- `That looks right`
- `I want to change something`

Hidden/collapsed:

- confidence internals
- schema terms like `fully measurable` unless translated

Plain-English labels:

- `Goal`
- `What we'll track`
- `Still needed`

### Required follow-up

What the user sees:

- one targeted follow-up prompt
- a short status line if needed

What the app says:

- targeted question first
- status/explanation second

Actions/buttons:

- submit answer
- optional skip only when the question is genuinely optional

Hidden/collapsed:

- broader review card while the app is still blocked

Plain-English labels:

- avoid labels entirely where possible
- show just the question and a small helper example

### Realism step

What the user sees:

- one concise realism card
- one suggested revision if needed

What the app says:

- realistic: `This looks buildable from where you are now.`
- warning: `This is possible, but the timeline is tight.`
- blocked: `That target is not realistic yet as written.`

Actions/buttons:

- `Keep this target`
- `Revise the target`
- `Use the suggested first block`

Hidden/collapsed:

- internal scoring rationale

Plain-English labels:

- `Looks buildable`
- `Needs a more realistic first target`
- `Still need one more anchor`

### Optional secondary-goal step

What the user sees:

- one short question
- a few tappable options
- one custom input if needed

What the app says:

- `Anything else you want to maintain while chasing this?`

Actions/buttons:

- `Keep strength`
- `Keep upper body`
- `Maintain conditioning`
- `Avoid slowing down`
- `No, just this goal`
- `Something else`

Hidden/collapsed:

- the full goal-stack model
- background priority internals unless there is a meaningful conflict

Plain-English labels:

- `Primary goal`
- `Maintained goal`

### Final confirmation

What the user sees:

- lead goal
- maintained goal if present
- what the app will track
- a short tradeoff statement if relevant
- one clear build CTA

What the app says:

- `This is the plan direction I'm going to build from.`

Actions/buttons:

- `Confirm and build my plan`
- `Adjust the goal`
- `Revise the target`

Hidden/collapsed:

- low-value implementation detail
- AI/provider provenance

Plain-English labels:

- `Lead goal`
- `Maintain while chasing it`
- `What we'll measure`
- `Main tradeoff`

## 5. Goal-Family-Specific Required Anchors

### Strength goals

Required to build:

- current baseline for the lift or movement that matters
- timing only if the goal clearly implies a target date or compressed horizon

Helpful but optional:

- recent top set trend
- training history for the lift
- current bodyweight

Can be deferred until later review:

- exact estimated one-rep max
- accessory lift details

### Running/event goals

Required to build:

- race date or target month
- current run frequency
- either longest recent run or recent pace/race result

Helpful but optional:

- recent weekly mileage
- preferred race terrain
- injury sensitivity around running volume

Can be deferred until later review:

- exact training zones
- shoe rotation
- race logistics

### Body-comp / weight-loss goals

Required to build:

- current bodyweight
- desired change if the goal text did not already supply it
- rough timeline

Helpful but optional:

- waist measurement
- current nutrition friction
- recent adherence pattern

Can be deferred until later review:

- detailed nutrition preferences
- photo-based review

### Appearance/proxy goals

Required to build:

- one real proxy anchor the app can actually use now
  - current bodyweight
  - waist measurement
- timeline only if the user clearly implies one

Helpful but optional:

- second proxy anchor
- clothing-fit marker
- subjective look/feel success marker

Can be deferred until later review:

- manual photo review
- more detailed physique preferences

### Hybrid/mixed goals

Required to build:

- one explicit lead goal
- one explicit maintained goal if a second lane matters
- required anchors for the lead goal
- enough baseline to avoid nonsense tradeoffs

Helpful but optional:

- clearer preference on what gets sacrificed first
- preferred weekly emphasis

Can be deferred until later review:

- exact weekly ratio between the two lanes

## 6. Realism/Feasibility Behavior

### Realistic goals

Behavior:

- show as buildable
- allow direct confirmation
- do not over-dramatize

User-facing behavior:

- status: `Looks buildable`
- CTA: enabled

### Aggressive but plausible goals

Behavior:

- allow confirmation
- surface the risk plainly
- show the tradeoff the plan will respect

User-facing behavior:

- status: `Possible, but tight`
- CTA: enabled
- short caution note under the CTA

### Impossible goals

Behavior:

- block confirmation
- explain why
- suggest a more realistic first target or phased path

User-facing behavior:

- status: `Needs a more realistic first target`
- CTA: disabled
- show `Revise target` path

### Underconstrained goals

Behavior:

- treat as incomplete, not realistic
- ask the next required anchor

User-facing behavior:

- status: `Still need one more anchor`
- CTA: disabled
- targeted next question shown

### Mixed-goal conflicts

Behavior:

- make the tradeoff explicit
- require the app or user to identify the lead goal
- do not hide the maintained lane

User-facing behavior:

- status: `We can do both, but one should lead`
- CTA: enabled only when the stack is explicit enough

### Proceed / warn / block definitions

Proceed:

- completeness satisfied
- realism acceptable
- goal stack explicit enough

Warn:

- completeness satisfied
- realism aggressive but plausible, or mixed-goal tension is meaningful

Block and revise:

- goal is impossible as written
- goal is too underspecified to build safely
- target conflicts are too unresolved to plan around honestly

## 7. Secondary-Goal Design

### When to ask

Ask only after:

- the primary goal interpretation is stable
- required anchors for the primary goal are satisfied
- the app is no longer looping on basic clarification

### How to phrase it

Preferred wording:

- `Anything else you want to maintain while chasing this?`

Acceptable helper text:

- `Optional. If not, we can keep this plan focused on the primary goal.`

### How to present tradeoffs

Only show tradeoffs when a second lane is actually present.

Good examples:

- `Fat loss will lead, so strength is being protected rather than pushed.`
- `The race goal leads, so lifting stays supportive.`

Bad examples:

- exposing `rolesByGoalId`
- exposing `background priority` by default

### How much of the underlying goal-stack model should be visible

Visible to user:

- lead goal
- maintained goal
- one short tradeoff sentence

Hidden:

- role enums
- planner internals
- resilience/background machinery unless it changes behavior in a user-meaningful way

## 8. User-Facing Language Guide

The UI should hide internal system vocabulary unless translated into plain English.

Before -> after:

- `exploratory` -> `Starting with a 30-day baseline`
- `confirmation gate` -> `Ready to build`
- `keep protected` -> `Keep recovery protected`
- `add back as maintained` -> `Keep as a maintained goal`
- `build aerobic base for hybrid training` -> `Build half-marathon endurance while strength stays supportive`
- `fully measurable` -> `Has a clear measurable target`
- `proxy measurable` -> `We'll track progress with a few practical markers`
- `resolved goal` -> `Confirmed goal`
- `current running baseline` -> `Where your running is right now`
- `goal family` -> never shown directly
- `background priority` -> `Protect recovery` or hide it entirely
- `blocked by realism` -> `This target needs a more realistic first step`
- `incomplete details` -> `Still need one more anchor`

Language rules:

- prefer trainer language over planner language
- prefer "right now," "first block," and "while chasing this" over internal taxonomy
- never imply certainty that the app does not have

## 9. Failure Modes and Anti-Patterns

The app must not:

- repeat the same clarification after a valid answer
- let one answer contaminate another field
- show stale interpretation after a goal change
- confirm impossible goals
- imply progress-photo support if upload or review flow does not exist
- sound more certain than the data supports
- silently invent a maintained strength lane for a plain running goal
- silently assume home/gym/equipment context when unknown
- allow the CTA to look active when the state is still blocked
- show the user one interpretation while writing a different canonical goal state
- stream messages out of order
- surface internal implementation terms as if they are product copy

## 10. Implementation Mapping

### AI interpretation layer

Responsibility:

- interpret messy raw goal language
- propose goal family, metrics, open questions, and conflicts

Must not:

- write canonical state
- invent confirmed secondary goals
- overrule explicit user confirmation

### Deterministic completeness layer

Responsibility:

- compute required anchors by goal family
- bind answers to exact fields
- decide whether the app has enough to build

Must not:

- infer completion from vague prose when the required field is still missing

### Feasibility gate

Responsibility:

- classify realistic / warn / block
- explain the realism state in user-facing terms
- propose a smaller first target when needed

Must not:

- silently pass impossible goals through

### Confirmation layer

Responsibility:

- show the interpreted lead goal
- show maintained goal if present
- show what will be tracked
- show tradeoff and realism status
- gate the final build CTA correctly

Must not:

- expose raw schema terms
- show an enabled CTA when the state is not actually confirmable

### Canonical write

Responsibility:

- take only confirmed resolved goal state
- write canonical goal stack and planner-facing goal state

Must not:

- reuse stale preview state after a goal change
- write from unconfirmed AI proposal data

### Handoff into ProgramBlock / planning

Responsibility:

- treat the confirmed lead goal as the primary planning driver
- include maintained goals only when explicitly confirmed
- keep Program, Today, and current-week shape aligned to the same stack

Must not:

- default plain running goals into hybrid plans
- inject unsupported environment or issue context

## 11. Definition Of Done

Intake is good enough to move on when all of the following are true:

- A vague user can finish intake without feeling forced into a giant form.
- A precise user can move quickly without redundant questions.
- Every required clarification is field-scoped.
- Valid answers clear the required state immediately.
- Goal changes fully reset stale interpretation and stale follow-up state.
- The app can clearly distinguish incomplete, warn, and block.
- The final CTA is enabled only when the state is actually confirmable.
- The user can explicitly add or decline a maintained secondary goal.
- The confirmation screen shows the actual goal stack that will be written.
- Canonical planner input matches the latest confirmed review state.
- Plain running goals stay plain running goals.
- Appearance goals rely only on real current proxies.
- Transcript/message ordering is stable and readable.
- The flow feels like a short trainer interview, not a schema debugger.

## Top 5 Implementation Priorities From This Spec

1. Make the confirmation screen the single source of truth for whether intake is proceed, warn, block, or incomplete.
2. Tighten field-scoped completeness binding so valid answers always clear the right required question immediately.
3. Remove remaining internal language from the live intake UI and replace it with trainer-style plain English.
4. Keep goal-family interpretation and summary generation specific, especially for plain running/event goals versus explicit mixed-goal stacks.
5. Make the optional secondary-goal step consistently visible after required anchors clear, with simple choices and clean canonical goal-stack handoff.

## What Can Wait Until Later

- richer profile/settings editing outside intake
- photo upload or structured physique check-in support
- broader AI chat infrastructure beyond intake interpretation
- advanced explanation detail for why the planner made a given block choice
- more nuanced weekly emphasis controls for hybrid users
- richer post-intake goal review workflows after the first plan is live
