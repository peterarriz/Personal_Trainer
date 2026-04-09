# Canonical Goal/Profile Migration

## Purpose

This refactor establishes one runtime read model for athlete identity and goal truth:

- `canonicalAthlete.goals`
- `canonicalAthlete.userProfile`
- `canonicalAthlete.goalState`

Everything else is now treated as migration input or persistence compatibility output.

## Canonical Runtime Shape

The canonical runtime object is produced by `deriveCanonicalAthleteState(...)` in `src/services/canonical-athlete-service.js`.

```js
{
  version: "2026-04-athlete-v1",
  goals: [NormalizedGoal],
  goalBuckets: {
    normalized: [NormalizedGoal],
    active: [NormalizedGoal],
    timeBound: [NormalizedGoal],
    ongoing: [NormalizedGoal],
  },
  activeTimeBoundGoal: NormalizedGoal | null,
  primaryGoal: NormalizedGoal | null,
  userProfile: {
    name: string,
    primaryGoalKey: "fat_loss" | "muscle_gain" | "endurance" | "general_fitness",
    experienceLevel: string,
    fitnessLevel: string,
    daysPerWeek: number,
    sessionLength: string,
    equipmentAccess: string[],
    constraints: string[],
    scheduleConstraints: string[],
    preferences: {
      coachingTone: string,
      trainingStyle: string,
      goalMix: string,
      preferredEnvironments: string[],
      defaultEnvironment: string,
      intensityPreference: string,
      nutritionStyle: string,
      preferredMeals: string[],
    },
  },
  goalState: {
    primaryGoal: string,
    primaryGoalCategory: string,
    priority: string,
    priorityOrder: string,
    deadline: string,
    planStartDate: string,
    milestones: object | null,
    confidence: number,
  },
}
```

## Canonical Producers

- `deriveCanonicalAthleteState(...)`
  - Normalizes raw `goals`
  - Reads legacy compatibility fields from `personalization.userGoalProfile`
  - Reads legacy compatibility fields from `personalization.goalState`
  - Produces the only runtime object downstream modules should consume

- `withLegacyGoalProfileCompatibility(...)`
  - Emits legacy `personalization.userGoalProfile` and `personalization.goalState`
  - Used only to keep persistence/backward compatibility aligned

## Canonical Consumers

These runtime consumers now read canonical goal/profile truth instead of directly reading legacy goal/profile fields:

- Dashboard planning assembly
  - `composeGoalNativePlan(...)`
  - `assemblePlanWeekRuntime(...)`
  - `assembleCanonicalPlanDay(...)`
  - `generateTodayPlan(...)`

- Tab consumers
  - `TodayTab` via `athleteProfile`
  - `PlanTab` via `athleteProfile`
  - `NutritionTab` via `athleteProfile`
  - `CoachTab` via `athleteProfile`

- AI packet/runtime
  - `buildAiStatePacket(...)`
  - `runPlanAnalysisRuntime(...)`
  - `runCoachChatRuntime(...)`

- Logging shell boundary
  - `LogTab` receives `planStartDate` from canonical goal state rather than reading `personalization.goalState` directly

## Legacy Compatibility Inputs

These fields still exist, but they are no longer supposed to be read directly by downstream planning/coach/nutrition/logging consumers:

- `goals`
  - Raw persisted goal rows
  - Canonical runtime should use `canonicalAthlete.goals`

- `personalization.userGoalProfile`
  - Deprecated runtime input
  - Still used to ingest old saves

- `personalization.goalState`
  - Deprecated runtime input
  - Still used to ingest old saves

## Compatibility Output Boundary

Persistence format is intentionally unchanged in this step.

Compatibility output is isolated in two places:

- `persistAll(...)` in `src/trainer-dashboard.jsx`
  - Calls `buildPersistedPersonalization(...)`
  - Re-emits legacy `userGoalProfile` / `goalState` before save

- Explicit compatibility-producing write paths
  - `finishOnboarding(...)`
  - `startFreshPlan(...)`

## Deprecated Field Notes

`DEFAULT_PERSONALIZATION.userGoalProfile` and `DEFAULT_PERSONALIZATION.goalState` are now documented in code as deprecated runtime inputs. They remain in the saved payload only so old local/cloud data and older import/export snapshots continue to load.

## Old Field Paths That Still Exist Only For Backward Compatibility

- `goals`
- `personalization.userGoalProfile`
- `personalization.goalState`

## Remaining Write Paths To Convert Later

These still author or mutate legacy goal/profile compatibility fields and should be moved behind a dedicated canonical-athlete mutation boundary later:

- `derivePersonalization(...)`
  - Still updates `personalization.goalState.confidence`

- `DEFAULT_PERSONALIZATION`
  - Still seeds `userGoalProfile` and `goalState` for compatibility

- Import/restore/load paths
  - Snapshot restore still hydrates raw `personalization` and `goals`
  - Auth load still hydrates raw `personalization` and `goals`

- Persistence/export paths
  - Export payload still includes raw `goals` and legacy `personalization.*Goal*` fields
  - Auth/local save still writes those fields

## Current Boundary Rule

Runtime code should treat:

- `canonicalAthlete.goals` as the only goal list
- `canonicalAthlete.userProfile` as the only athlete profile/preferences/constraints object
- `canonicalAthlete.goalState` as the only goal-state read model

Legacy fields should only be touched when:

- ingesting old data
- emitting compatibility payloads
- performing explicitly marked migration/backward-compatible writes
