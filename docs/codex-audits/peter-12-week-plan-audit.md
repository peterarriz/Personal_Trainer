# Peter 12-Week Plan Audit

Reference date: 2026-04-16
Deadline used for the broader outcome stack: 2026-12-31
Fixture: `src/services/audits/peter-audit-fixture.js`
Planner path: `composeGoalNativePlan` using a snapshot of the current app week templates mirrored from `src/trainer-dashboard.jsx`

## Fixture Assumptions

- Bench anchor: `185 x 5`
- Running anchor: `3 runs/week`, longest recent run `7 mi`, recent pace `8:55/mi`
- Bodyweight: `185 lb`
- Waist proxy: `34 in`
- Availability: `4 days/week`, `45 min`, gym access
- Recovery constraint: no active injury reported
- Nutrition compliance: moderate, with hard-day under-fueling risk

## Aggregate Findings

- Weekly run frequency: `3` every week
- Quality-session density: `1` hard run every week
- Explicit bench-specific exposure frequency: `0` over the full 12-week block
- Generic strength exposure frequency: `1` per week
- Recovery density: `3` recovery/rest days every week
- Deload/cutback cadence: weeks `4`, `8`, and `12`
- Nutrition day-type alignment present: `run_easy`, `run_quality`, `run_long`, `strength_support`, `recovery`

## Week Pattern

| Week | Phase | Run Sessions | Quality | Strength | Long Run | Strength Surface |
| --- | --- | --- | --- | --- | --- | --- |
| 1 | BASE | 3 | 1 | 1 | 45-60 min | Progression Support strength (Short Strength) |
| 2 | BASE | 3 | 1 | 1 | 45-60 min | Progression Support strength (Short Strength) |
| 3 | BASE | 3 | 1 | 1 | 45-60 min | Progression Support strength (Short Strength) |
| 4 | BASE cutback | 3 | 1 | 1 | 45-60 min | Progression Support strength (Short Strength) |
| 5 | BUILDING | 3 | 1 | 1 | 45-60 min | Progression Support strength (Short Strength) |
| 6 | BUILDING | 3 | 1 | 1 | 45-60 min | Progression Support strength (Short Strength) |
| 7 | BUILDING | 3 | 1 | 1 | 45-60 min | Progression Support strength (Short Strength) |
| 8 | BUILDING cutback | 3 | 1 | 1 | 45-60 min | Progression Support strength (Short Strength) |
| 9 | PEAKBUILD | 3 | 1 | 1 | 45-60 min | Progression Support strength (Short Strength) |
| 10 | PEAKBUILD | 3 | 1 | 1 | 45-60 min | Progression Support strength (Short Strength) |
| 11 | PEAKBUILD | 3 | 1 | 1 | 45-60 min | Progression Support strength (Short Strength) |
| 12 | PEAKBUILD cutback | 3 | 1 | 1 | 45-60 min | Progression Support strength (Short Strength) |

## Credibility Answers

- Is the running progression consistent with a 1:45 half trajectory?
No. The visible week-template snapshot behind the app escalates long-run distance from `4 mi` toward `9 mi` by week 10, but the generated live plan stays flat at `45-60 min` for the long run in every audited week. That is a high-confidence contradiction.

- Is the bench progression supportive of meaningful strength improvement while concurrent endurance and fat loss are active?
Not proven. The generated block never surfaces an explicit bench session. It only shows one generic short strength-support slot per week, which is too weak a signal to call a `225 lb` bench push credible.

- Is the fat-loss pace aggressive, moderate, or incoherent relative to the performance goals?
The year-end math is moderate, but the 12-week block does not operationalize the body-comp lane strongly. Nutrition day types exist, yet the weekly structure is still overwhelmingly run-led and generic-strength-led rather than clearly concurrent-performance-plus-cut planning.

- Is the body-comp / visible-abs path merely implied or actually operationalized?
Mostly implied. Weight loss is a first-class measurable goal in the repo, but the exact visible-abs outcome remains proxy-tracked. In this 12-week block, the appearance lane does not show up as a distinctive planning mechanism beyond the general body-comp context.

## Risk Flags

- `long_run_progression_flat` (high): the generated long-run prescription stays flat at `45-60 min` across the entire 12-week block even while the underlying week templates escalate.
- `bench_specificity_missing` (high): the generated block never surfaces an explicit bench-specific session, only a generic short strength support slot.
- `strength_exposure_sparse` (medium): strength exposure lands at roughly one generic session per week, which is a weak signal for pushing a `225` bench while the run goal leads.
- `lower_body_fatigue_conflict_unresolved` (medium): the support strength day is not explicitly upper-body biased, so the planner does not clearly prove that lower-body fatigue stays subordinate to the run lane.
- `body_comp_lane_not_explicit` (medium): the generated block stays running-led with strength support and never exposes body composition as a visible planning emphasis despite active weight-loss and appearance goals.

## Bottom Line

The current planner can generate a stable 12-week run-led block for Peter, but this exact concurrent stack is **not yet proven credible** as a unified block. The strongest reasons are the flat long-run prescription, the absence of explicit bench-specific work, and the lack of a visible body-composition lane. The block is usable as a conservative running-first plan with generic strength support, not as hard evidence that the app can jointly drive `1:45 HM + 225 bench + 15 lb loss + visible abs` with confidence.
