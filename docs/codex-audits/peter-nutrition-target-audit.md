# Nutrition Compatibility Audit
Reference: Peter nutrition target audit
Reference date: 2026-04-16
- Plan coverage inspected: 12 hard-run days, 12 long-run days, 12 strength days, 36 recovery days

## Summary

Representative hard-run, long-run, strength, and recovery targets are internally compatible with a moderate cut and performance retention.

## Representative Targets

| Lane | Day type | Calories | Carbs | Protein | Fat | Hydration | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hard run | Quality Run Day (`run_quality`) | 2700 kcal | 305g | 190g | 65g | 117 oz explicit | running priority protects carbs on harder sessions |
| Long run | Long Run Day (`run_long`) | 2900 kcal | 345g | 190g | 67g | 125 oz explicit | running priority protects carbs on harder sessions |
| Strength | Strength Support Day (`strength_support`) | 2513 kcal | 225g | 200g | 69g | 109 oz explicit | heavy lift work kept calories closer to maintenance; explicit maintenance and weekly deficit model protected this day |
| Recovery | Recovery Day (`recovery`) | 2319 kcal | 190g | 185g | 75g | 99 oz explicit | easier training load allowed a modest deficit; explicit maintenance and weekly deficit model protected this day |

## Risk Table

| ID | Severity | Area | Finding | Evidence |
| --- | --- | --- | --- | --- |
| none_detected | low | audit | No deterministic compatibility risks were detected in the current representative targets. | Targets and execution checks passed the current thresholds. |

## Bottom Line

The current nutrition targets are directionally coherent for a moderate cut while retaining hard-run, long-run, strength, and recovery support.

What is now explicitly proven:

- hydration targets are stored in the prescription layer for representative hard, long, strength, and recovery days
- harder endurance days separate carbs and calories from recovery days
- long-run days step above hard-run days

What is now stronger than before:

- the nutrition layer stores an explicit maintenance estimate plus weekly cut target, so moderate-cut intent is no longer only inferred from relative day spacing
- users can save preferred cuisines in Settings to steer meal suggestions toward food patterns they are more likely to repeat

What is still only partially proven:

- the maintenance estimate can still be heuristic if the user has not saved one manually
- endurance nutrition is still not fully individualized around sweat rate, GI tolerance, or race product preference
