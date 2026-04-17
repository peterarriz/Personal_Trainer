# Goal Pace Scorecard Model

This scorecard is a deterministic honesty layer for long-horizon goals. It is intentionally small.

## What It Can Say

For each goal, the scorecard returns:

- `on_pace`
- `off_pace`
- `unknown`

Each verdict also includes:

- confidence
- key anchors used
- major limiting factor
- short reason text

## What It Uses

- Bench goals: a recent bench top set and the remaining weeks to the deadline
- Half-marathon goals: a recent pace anchor, longest recent run, weekly run frequency, and the remaining weeks
- Numeric weight-loss goals: current bodyweight, target loss, and the remaining weeks
- Appearance goals: waist/bodyweight only as context, not as a direct proof of the look outcome
- Optional plan reality check: the current 12-week audit can downgrade anchor-only optimism when the live planner is not surfacing the work the goal needs

## Current Plan Reality Check

When a current 12-week audit is available, the scorecard prefers honesty over isolated anchor math:

- Bench goals are downgraded when the block never surfaces explicit bench work.
- Half-marathon goals are downgraded when the block keeps the long run flat instead of progressing it.
- Numeric weight-loss goals can stay `on_pace`, but confidence drops when the block does not expose body composition as a visible planning lane.
- Appearance goals stay `unknown`, and the reason becomes more explicit when the block lacks any appearance-specific lane.

## Deliberate Limits

- This is not a physiological simulator.
- It does not claim that a 12-week planner proves the full year.
- It does not let anchor math overrule an obviously contradictory live block.
- It treats visible-abs / six-pack goals as proxy-tracked and usually `unknown`, because the app does not have a direct physique verifier.
- When anchor data is missing, it stays `unknown` instead of bluffing.

## Intended Use

Use the scorecard to answer a trust question:

`Can the app honestly say this goal is on pace with the anchors it actually has today?`

It is not intended to replace feasibility checks, weekly adaptation logic, or coach judgment.
