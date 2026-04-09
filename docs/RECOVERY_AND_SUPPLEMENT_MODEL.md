# Recovery And Supplement Model

Recovery and supplements now live inside `PlanDay` as canonical domain children rather than as scattered UI hints.

## Hierarchy

The daily operating model remains:

`user profile -> goals -> ProgramBlock -> WeeklyIntent -> PlanWeek -> PlanDay -> domain prescriptions -> actuals`

Recovery and supplements are part of the `PlanDay` decision, not separate planners.

## Canonical Structures

### `RecoveryPrescription`

`PlanDay.base.recovery.prescription` and `PlanDay.resolved.recovery.prescription`

```js
{
  model: "recovery_prescription_v1",
  dateKey,
  emphasis,               // restore | protect | absorb_training | maintain
  sleepTargetHours,
  mobilityMinutes,
  tissueWorkMinutes,
  painManagementProtocol: {
    area,
    level,
    steps,
    summary,
  } | null,
  hydrationSupport: {
    targetOz,
    electrolyteSupport,
    timing,
    summary,
  },
  actions: [
    { id, type, label, target, timing, required }
  ],
  summary,
  successCriteria,
}
```

### `SupplementPlan`

`PlanDay.base.supplements.plan` and `PlanDay.resolved.supplements.plan`

```js
{
  model: "supplement_plan_v1",
  dateKey,
  strategy,               // performance_support | recovery_support | daily_consistency
  items: [
    {
      id,
      name,
      category,
      dose,
      timing,
      priority,
      purpose,
      withHydration,
      conditional,
    }
  ],
  summary,
  adherenceRule,
}
```

### `ActualRecoveryLog`

`PlanDay.resolved.recovery.actual`

This is normalized from actual user logging, not copied from the prescription.

```js
{
  model: "actual_recovery_log_v1",
  dateKey,
  status,
  sessionFeel,
  blocker,
  note,
  bodyweight,
  readiness,
  sleepHours,
  mobilityMinutes,
  tissueWorkMinutes,
  painProtocolCompleted,
  painArea,
  painLevel,
  hydrationSupport: {
    targetOz,
    actualOz,
    pct,
    followed,
    summary,
  },
  supplementAdherence: {
    adherence,
    expectedCount,
    matchedCount,
    takenNames,
    summary,
  },
  anchorsCompleted,
  summary,
  loggedAt,
}
```

## Separation Rules

- Prescription stays in `PlanDay.base.*` and `PlanDay.resolved.*.prescription`.
- Actual recovery stays in `PlanDay.resolved.recovery.actual`.
- Supplement adherence is derived from actual nutrition logging and remains separate from the planned supplement stack.
- Actuals inform future adaptation, but do not rewrite the original prescription.

## Product Intent

This model supports the app promise of training + nutrition + supplements + recovery without creating a bloated wellness product.

It focuses on a short list of practical daily anchors:

- sleep target
- mobility / tissue work
- pain-management protocol when needed
- hydration support
- a small supplement stack with timing and adherence

It intentionally avoids:

- large supplement catalogs
- speculative biohacker protocols
- recovery scores presented as a separate system of truth
