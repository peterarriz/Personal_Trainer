# Weekly Nutrition Review Model

`WeeklyNutritionReview` is a deterministic weekly summary built from canonical nutrition state.

It exists to answer one narrow question:

What happened this week relative to the nutrition plan, and is there enough signal to justify a small deterministic adaptation later?

## Inputs

- `ActualNutritionLog` records from `nutritionActualLogs`
- stored prescribed nutrition from `plannedDayRecords`
- the live current-day `planDay` when today's prescription exists but has not been durably captured yet

## Boundary

- Planned nutrition stays separate from actual nutrition.
- The weekly review is descriptive first.
- Any adaptation output is recommendation-only.
- The review does not directly mutate nutrition prescriptions or canonical state.

## Shape

```js
{
  model: "weekly_nutrition_review",
  version: 1,
  window: {
    days,
    startDate,
    endDate,
    anchorDateKey,
    dateKeys,
  },
  days: [
    {
      dateKey,
      prescription: {
        hasPrescription,
        dayType,
        targets,
        source,
      },
      actual,
      comparison,
      supplements: {
        expectedNames,
        expectedCount,
      },
    }
  ],
  prescribed: {
    daysWithPrescription,
    hardTrainingDays,
    coverageLine,
  },
  actual: {
    loggedDays,
    unloggedDays,
    coverageLine,
  },
  adherence: {
    highDays,
    partialDays,
    lowDays,
    unknownDays,
    onPlanDays,
    adherenceRate,
    trend: {
      label,   // limited | steady | improving | slipping
      delta,
      summary,
    },
    summary,
  },
  deviationPattern: {
    counts,
    dominant,
    summary,
  },
  hydration: {
    daysLogged,
    onTargetDays,
    belowTargetDays,
    avgPct,
    consistency, // limited | consistent | mixed | inconsistent
    summary,
  },
  supplements: {
    expectedDays,
    fullyTakenDays,
    partialDays,
    missedDays,
    adherenceRate,
    expectedNames,
    summary,
  },
  friction: {
    counts,
    topCauses,
    summary,
  },
  adaptation: {
    mode,
    shouldAdapt,
    summary,
    support,
    reasons,
    actions,
  },
  coaching: {
    headline,
    coachLine,
    plannedVsActualLine,
  },
}
```

## Current Deterministic Adaptation Modes

- `hold`
- `protect_key_session_fueling`
- `reinforce_hydration`
- `simplify_defaults`
- `anchor_supplements`

These are lightweight weekly posture recommendations, not a second nutrition planner.

## Product Intent

This review is meant to support coaching and future deterministic nutrition adjustments without turning the nutrition surface into a calorie dashboard.

It emphasizes:

- adherence trend
- deviation pattern
- hydration consistency
- supplement adherence
- recurring friction causes

It avoids:

- dense macro analytics
- speculative calorie math
- AI-authored prescription changes
