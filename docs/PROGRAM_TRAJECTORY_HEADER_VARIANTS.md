# Program Trajectory Header Variants

Visual review lives in [docs/codex-audits/program-trajectory-header-variants.html](./codex-audits/program-trajectory-header-variants.html).

## Goal

Replace the current `Current chapter / Next milestone / Plan arc` trio with one trajectory header that shows:

- where this week sits inside the 12-week arc
- what earned the athlete this position
- what earns the next phase

The header should orient the block. The roadmap below it still carries the fuller week-by-week detail.

## Variant 1: Density graph

Show a compact 12-week density graph with the current week highlighted, cutback dips visible, and a short gate panel below it.

- Best at: making weekly load rhythm legible at a glance
- Risk: can feel too analytical, and it overlaps with the roadmap that already shows week-by-week shape
- What earned it: shown as a short proof line under the graph
- What earns next: shown as the next gate line beside the upcoming phase marker

## Variant 2: Phase ladder

Show the block as a horizontal ladder of named phases with one current rung, a short proof line for why the athlete is here, and a next-gate line for what moves them forward.

- Best at: combining orientation, progress, and gate logic without duplicating the roadmap
- Risk: needs disciplined copy or it becomes too abstract
- What earned it: sits directly under the current rung
- What earns next: sits directly under the next rung

## Variant 3: Narrative chapters

Show the block as editorial chapters with progress marks across the top and short narrative labels such as `Base`, `Build`, `Sharpen`, `Absorb`.

- Best at: feeling premium and authored
- Risk: least precise of the three, and easiest to make vague
- What earned it: shown as a sentence under the current chapter card
- What earns next: shown as a small next-chapter note

## Recommendation

Pick `Phase ladder`.

Why:

- The roadmap below already covers week-by-week structure, so the header should not spend its limited space on another mini-roadmap.
- The ladder makes the current position and next gate obvious in one scan.
- It can absorb adaptations cleanly without pretending the whole arc changed every time one workout moves.
- It gives Program a stronger sense of authored coaching than the current label trio, while staying clearer than narrative chapters.

## Adaptation update rule

The header should update by block state, not by every small workout adjustment.

### What changes the header immediately

- A week rollover that moves the athlete into a new roadmap row
- A regenerated roadmap that changes the active phase, cutback placement, or next phase window
- A goal-priority change that materially changes the visible arc

### What does not move the header

- One-off day swaps
- A shortened workout
- A single reduced-load day
- Small coach adjustments that do not change the roadmap row or phase structure

### How the chosen ladder updates

- `Current rung` is keyed to the active roadmap phase, not to a single session result.
- `Current week marker` advances only when the committed week changes or the roadmap is regenerated.
- `What earned this` is refreshed from the trailing evidence window:
  - last 1 to 2 closed weeks of completion reliability
  - goal-specific proof that the current phase is holding
  - protective evidence when the current week is a cutback or absorb week
- `What earns next` is always tied to the next visible phase gate:
  - finish this week's main build cleanly
  - hold the required support lane
  - avoid recovery drift that would force another protect week

### Protective adaptation behavior

If adaptation inserts or preserves a lighter week:

- keep the athlete on the same ladder position unless the regenerated roadmap truly moves the phase boundary
- relabel the current rung as an absorb or protect moment
- change the proof line to explain why the lighter week belongs in the arc
- only push the next gate if the roadmap itself pushes it

### Copy rule

The header must talk like a coach, not a planner.

- `What earned this`: should read like evidence, not scorekeeping
- `What earns next`: should read like the next coaching standard, not a software unlock
