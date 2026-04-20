# Intake 12-Week Arc Extension

Implementation lives in:

- [src/services/intake-plan-preview-service.js](../src/services/intake-plan-preview-service.js)
- [src/services/intake-trajectory-arc-service.js](../src/services/intake-trajectory-arc-service.js)
- [src/components/IntakeSummaryRail.jsx](../src/components/IntakeSummaryRail.jsx)
- [src/components/IntakeTrajectoryArcDisclosure.jsx](../src/components/IntakeTrajectoryArcDisclosure.jsx)

Visual review lives in [docs/codex-audits/intake-12-week-arc-extension.html](./codex-audits/intake-12-week-arc-extension.html).

## Goal

Extend the living-card intake preview so it still shows the immediate week-one shape, but now also carries a collapsed 12-week arc directly underneath it.

The new arc should:

- default to collapsed
- expand on tap
- reuse the same `phase ladder` visual language chosen for Program trajectory treatment
- make Intake and Program feel like the same product promise at two different moments

## Shared visual language with Program

The intake arc now borrows the same `phase ladder` grammar recommended for Program:

- named phase blocks across the visible 12-week window
- one current rung
- one next rung
- one short opening explanation
- one short next gate

The difference is semantic, not visual:

- Program says where the athlete currently sits and what earned that spot
- Intake says why week 1 starts there and what would tighten the next rung

That keeps the visual language shared without pretending the intake user has already earned anything inside the block.

## Default interaction

- The new `12-week arc` module sits inside the plan-shape panel below the visible week preview.
- It is collapsed by default.
- The summary row shows:
  - `12-week arc`
  - mode label
  - current rung
  - next rung
- Expanded state shows:
  - the 12-week phase ladder
  - `Why week 1 starts here`
  - `Next gate`
  - a trust line about what the arc does and does not promise

## Exact-metric users

Exact-metric users are `fully_measurable`.

Examples:

- `Run a 1:45 half marathon`
- `Bench 225`

What changes for them:

- mode label becomes `Metric-led`
- the collapsed summary reads like a true phase handoff:
  - `Build now, Sharpen next`
- the opening line uses the current anchor honestly:
  - `8 mi long run is the first visible rung because your current anchor gives this block honest runway.`
- the next gate prefers concrete work:
  - `Next gate: 10 mi long run and one clean quality week open the next rung.`

This gives exact users visible structure without pretending the 12-week arc proves the whole finish line.

## Fuzzy-goal users

Fuzzy-goal users are `proxy_measurable` or `exploratory_fuzzy`.

Examples:

- `Look leaner and move better`
- `Get back in shape`
- appearance goals that still depend on proxy tracking

What changes for them:

- mode label becomes `Direction-led`
- the collapsed summary stays calmer:
  - `Base now, Build later`
- the opening line explains direction instead of fake precision:
  - `The block starts by making the direction repeatable before the target tightens into something more exact.`
- the next gate uses credibility, not fantasy metrics:
  - `Next gate: a few repeatable weeks and one clearer anchor let the plan tighten what it is really chasing.`
- the trust line explicitly says the arc is giving direction first, not pretending the target is already pinned down

This keeps fuzzy-goal users from feeling punished for not having exact metrics while still giving them the same premium structure exact users get.

## Why this is better

- Intake still pays off fast through week one.
- The 12-week promise is visible before final build.
- Program no longer introduces a second visual language later.
- Fuzzy users get direction without fake certainty.
- Exact users get a more tangible runway signal before commit.

## Verification

- `node -r sucrase/register --test tests/intake-plan-preview-service.test.js`
- `npm.cmd run build`
