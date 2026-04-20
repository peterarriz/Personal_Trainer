# Plan Tab Architecture Recommendation

Visual review lives in [docs/codex-audits/plan-tab-architecture-recommendation.html](./codex-audits/plan-tab-architecture-recommendation.html).

## Question

Should FORMA add a new `Plan` tab alongside `Today / Program / Log / Nutrition / Coach` that owns:

- program activation
- style overlay
- goal changes
- baseline repair

And if it does, should `Program` still exist, or should `Plan` absorb it?

## Current split

Right now the ownership is fragmented:

- `Program` owns the week and block reading surface
- `Settings > Plan style` owns program activation and style overlay
- `Settings > Goals` owns goal changes
- `Program` has an inline repair panel for some baseline fixes
- `Settings > Baselines` still owns deeper metric repair and provenance

That means the user has to hold one mental model while the product stores it in at least three places.

## Design goal

Create one home for `how the plan is being shaped`.

That home should answer:

- What block am I in?
- What plan basis is active?
- What style is layered on top?
- What goals are currently shaping the block?
- What inputs are broken enough to deserve repair?

## Option A: Keep Program, add Plan

### Top navigation

- `Today`
- `Program`
- `Plan`
- `Log`
- `Nutrition`
- `Coach`

### Ownership

`Program` keeps:

- current week / block trajectory
- roadmap
- current-week reading

`Plan` gets:

- program activation
- fidelity mode
- style overlay
- goal stack management
- baseline repair
- plan history / change review

### IA

- `Program`
  - trajectory header
  - current block
  - roadmap / coming weeks
- `Plan`
  - live basis
  - style overlay
  - goals shaping this block
  - repair queue
  - recent plan changes

### Plan landing screen

The new Plan tab would open with:

1. `Your live basis`
   - active plan + style + top goal
2. `What shapes the plan`
   - basis, style, top goal, repair status
3. `Actions`
   - change basis, update goals, repair inputs, review history
4. `Recent changes`
   - last activated program, last style change, last goal edit

### Pros

- clean separation between reading the block and editing the plan
- least disruptive migration from current architecture
- preserves the current Today/Program contract

### Risks

- six primary tabs is too many for the main consumer shell
- `Program` and `Plan` sound overlapping even if the IA is clean on paper
- the user still has to choose between "read the block" and "change the block" in two adjacent places
- high risk that goal and baseline edits still feel hidden if users do not discover the new tab

## Option B: Plan absorbs Program

### Top navigation

- `Today`
- `Plan`
- `Log`
- `Nutrition`
- `Coach`

### Ownership

`Plan` becomes the single home for:

- trajectory and current block meaning
- program activation
- style overlay
- goal changes
- baseline repair
- plan change previews and history

### IA

- `Overview`
  - live plan hero
  - trajectory
  - what is shaping it now
  - repair status
- `Basis`
  - built-for-you vs named plan activation
  - fidelity
  - style overlay
- `Goals`
  - reorder, edit, archive, preview impact
- `Repair`
  - baseline fixes
  - environment mismatches
  - stale carryover flags
- `History`
  - basis, style, goal, and repair actions

### Plan landing screen

The landing screen should feel like a plan editorial surface, not a settings page.

Above the fold:

1. `Your live plan`
   - current block meaning
   - active basis and style
   - one repair / conflict chip if needed
2. `Trajectory`
   - current rung
   - next gate
   - visible arc
3. `What is shaping it now`
   - built-for-you or active named plan
   - active style overlay
   - top goal stack summary
4. `Change or repair`
   - `Change plan basis`
   - `Update goals`
   - `Repair inputs`

Below the fold:

5. `Current block`
   - roadmap and week reading
6. `Plan basis`
   - activate program
   - change fidelity
   - apply / clear style overlay
7. `Goals shaping this block`
   - reorder, edit, archive, preview changes
8. `Repair inputs`
   - baseline repair cards
   - environment mismatches
   - stale carryover flags
9. `Recent plan changes`
   - history of basis, style, goal, and repair actions

### Pros

- one clear home for plan ownership
- five tabs is still manageable
- no duplicated language between Program and Plan
- goal and baseline changes become easier to discover because they live where the block is already explained
- stronger user mental model: `Today tells me what to do; Plan tells me why the plan looks like this`

### Risks

- requires a bigger migration than Option A
- Program's current clean contract has to be rewritten into the new Plan contract
- implementation has to resist turning Plan into a giant settings dump

## Recommendation

`Plan should absorb Program.`

## Decision

Selected direction: `Plan B`.

That means `Plan` becomes the single home for:

- trajectory and current block meaning
- program activation
- style overlay
- goal changes
- baseline repair
- plan change previews and history

Why:

- The main shell does not want six top-level tabs.
- `Program` and `Plan` are too semantically close for most users.
- The current fragmentation is exactly a plan-ownership problem, not just a settings discoverability problem.
- If the product is going to create a new home for activation, style, goals, and repairs, it should also become the home for block meaning. Otherwise the user still has two plan tabs.

In plain language:

- `Today` = do the work
- `Plan` = understand and shape the work
- `Log` = record the work
- `Nutrition` = fuel the work
- `Coach` = get a bounded call on the work

That model is clean.

## Landing screen recommendation

The recommended `Plan` landing screen should open in this order:

1. `Your live plan`
2. `Trajectory`
3. `What is shaping it now`
4. `Anything broken enough to repair`
5. `Current block`

That keeps the top of the screen editorial and explanatory, not control-heavy.

The editable controls should exist, but they should sit below the orientation layer.

## Migration path from Settings > Plan Management

Treat `Settings > Plan style`, `Settings > Goals`, and `Settings > Baselines` as the current Plan Management cluster. The migration should collapse that cluster into Plan instead of preserving three separate long-term homes.

### Phase 1: Introduce Plan as the new owner

- Add `Plan` tab.
- Keep `Program` route alive temporarily as an alias that opens `Plan` on the `Current block` anchor.
- Add migration notes in:
  - `Settings > Plan style`
  - `Settings > Goals`
  - `Settings > Baselines`

Suggested copy:

- `Plan controls live in Plan now.`
- `Goal changes live in Plan now.`
- `Repair inputs live in Plan now.`

### Phase 2: Move the editing workflows

- Move `SettingsProgramsSection` into Plan under `Plan basis`.
- Move goal stack management into Plan under `Goals shaping this block`.
- Move plan-relevant baseline repair cards into Plan under `Repair inputs`.
- Keep full provenance-heavy baseline history in Settings only if it still serves an expert audit job.

### Phase 3: Retire Program as a top-level tab

- Replace `Program` tab with `Plan`.
- Deep links to `Program` redirect to `Plan#current-block`.
- Any old `Manage plan` CTA becomes `Open Plan`.

### Phase 4: Shrink Settings back to true settings

Settings should keep:

- account
- profile
- preferences
- devices / advanced

Settings should stop being the primary home for live plan ownership.

## Guardrails

- Plan cannot become a generic settings dump.
- Trajectory still needs to lead the landing screen.
- Goal edits and baseline repair should preview impact before save.
- The same current-day story still has to stay aligned between Today and Plan.

## Final answer

`Does Program still exist, or does Plan absorb it?`

`Plan absorbs it.`

That is the cleaner IA, the better shell, and the easier story for users to hold.
