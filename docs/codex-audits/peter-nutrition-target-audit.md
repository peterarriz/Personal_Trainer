# Nutrition Compatibility Audit

Reference: Peter nutrition target audit
Reference date: 2026-04-16
- Fixture: `src/services/audits/peter-audit-fixture.js`
- Plan coverage inspected: 12 hard-run days, 12 long-run days, 12 strength days, 36 recovery days

## Summary

Representative targets are directionally compatible, but there are meaningful proof gaps or execution risks.

## Representative Targets

| Lane | Day type | Calories | Carbs | Protein | Fat | Hydration | Notes |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Hard run | Quality Run Day (`run_quality`) | 2700 kcal | 305g | 190g | 65g | not explicit; Nutrition tab would suggest ~123 oz | running priority protects carbs on harder sessions |
| Long run | Long Run Day (`run_long`) | 2900 kcal | 345g | 190g | 67g | not explicit; Nutrition tab would suggest ~123 oz | running priority protects carbs on harder sessions |
| Strength | Strength Support Day (`strength_support`) | 2500 kcal | 225g | 200g | 69g | not explicit; Nutrition tab would suggest ~111 oz | heavy lift work kept calories closer to maintenance |
| Recovery | Recovery Day (`recovery`) | 2210 kcal | 175g | 185g | 69g | not explicit; Nutrition tab would suggest ~101 oz | easier training load allowed a modest deficit |

## Risk Table

| ID | Severity | Area | Finding | Evidence |
| --- | --- | --- | --- | --- |
| `high_demand_hydration_targets_not_explicit` | medium | hydration | Hard and long-run hydration support is not stored explicitly in the nutrition prescription layer; the UI can infer a suggestion later, but the saved target is not durable enough for audit-grade proof. | Hard run: not explicit; Nutrition tab would suggest ~123 oz; Long run: not explicit; Nutrition tab would suggest ~123 oz |
| `moderate_cut_is_relative_not_first_class` | low | calories | The audit can infer a moderate cut from day-to-day calorie separation, but the nutrition model does not store an explicit maintenance estimate or weekly deficit target. `Moderate cut` is still a relative judgment, not a first-class proven mode. | Recovery 2210 kcal, Hard run 2700 kcal, Long run 2900 kcal |

## Bottom Line

The current nutrition targets are internally coherent enough to support performance retention across hard-run, long-run, strength, and recovery days. The main gaps are proof and durability, not obvious macro math failure:

- high-demand hydration is suggested later in the UI instead of being stored in the prescription itself
- the cut is visible only through day-to-day calorie separation, not through an explicit maintenance/deficit model

So the honest repo-grounded claim today is:

- the macro targets look directionally compatible with a moderate cut plus performance retention
- hydration and cut-intent proof are still only partially operationalized
