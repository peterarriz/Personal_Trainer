# State Ownership Map

## Goal

This map defines what should be considered canonical, who produces it, who consumes it, where it persists, and where the current dashboard still has ownership collisions.

## Ownership Summary

| State / Model | Current Producer | Current Consumers | Persistence Boundary | Notes / Risks |
| --- | --- | --- | --- | --- |
| `goals` | `TrainerDashboard` raw state + `normalizeGoals` | planning, nutrition, AI packet, onboarding, plan/coach tabs | persisted in full payload | canonical persisted source, but normalized repeatedly in many places |
| canonical goal/profile state | `deriveCanonicalGoalProfileState` in dashboard | planning, AI, onboarding, tabs | should not persist separately | canonical derived read model |
| `personalization` | `TrainerDashboard` raw state | environment, injury, memory, settings, AI, nutrition, planning | persisted in full payload | high collision risk because many effects and handlers patch it |
| `logs` | `TrainerDashboard` raw state + realtime merge | log tab, progress, momentum, AI, prescribed-vs-actual comparison | persisted in full payload and shadow-row sync | canonical actual training source |
| `dailyCheckins` | `TrainerDashboard` raw state | readiness, comparison, today/log tabs, AI | persisted in full payload | canonical actual daily subjective source |
| `weeklyCheckins` | `TrainerDashboard` raw state | weekly intent, reviews, learning | persisted in full payload | should stay raw persisted state |
| `nutritionActualLogs` | `TrainerDashboard` raw state | nutrition comparison, AI, coach, log tab | persisted in full payload | canonical actual nutrition source |
| `nutritionFeedback` | compatibility normalization only | legacy load migration | should not persist as new truth | deprecated compatibility input for older saves |
| `bodyweights` | `TrainerDashboard` raw state | momentum, progress, nutrition, AI | persisted in full payload | canonical actual bodyweight source |
| `coachPlanAdjustments` | `TrainerDashboard` raw state | plan assembly, overrides, AI, today/plan tabs | persisted in full payload | canonical accepted plan-mutation source |
| `coachActions` | `TrainerDashboard` raw state | validation layer, optimization, inspector, coach tab | persisted in full payload | accepted action log; should stay append-only-ish |
| `paceOverrides` | `TrainerDashboard` raw state | zone display, AI plan analysis | persisted in full payload | accepted AI/manual plan adjustment |
| `weekNotes` | `TrainerDashboard` raw state | plan tab, AI packet | persisted in full payload | accepted plan commentary, not canonical plan structure |
| `planAlerts` | `TrainerDashboard` raw state | today/plan tabs, inspector | persisted in full payload | accepted alert feed |
| `plannedDayRecords` | dashboard effect + prescribed-day helper set | log tab, inspector, prescribed-vs-actual compare | persisted in full payload | canonical prescribed-day history, but currently backfilled from multiple quality levels |
| `currentPlanWeek` | dashboard `useMemo` | plan day assembly, tabs, AI packet | should not persist separately | canonical derived week read model |
| `planDay` | `buildCanonicalPlanDay(...)` in dashboard | today/log/coach tabs, AI packet, inspector | should not persist directly; history is persisted via `plannedDayRecords` | canonical derived day read model |
| `rollingHorizon` | dashboard `useMemo` | today/plan tabs | should not persist separately | derived planning read model |
| readiness / momentum / learning / salvage / failure / expectations | dashboard derivation pipeline | today/plan/coach tabs, AI packet, inspector | should not persist separately except memory snapshots intentionally written into personalization | read models; currently assembled in shell |
| auth session | auth storage module + dashboard | auth shell, persistence gateway | persisted in auth cache | should be owned by persistence/auth boundary only |
| storage status | dashboard + auth storage classification | shell, settings, today tab, inspector | session-only | UI state, not business state |

## Canonical State Producers

## Raw canonical producers

Recommended future owner: `useTrainerAppState`

- `goals`
- `personalization`
- `logs`
- `bodyweights`
- `dailyCheckins`
- `weeklyCheckins`
- `nutritionActualLogs`
- `nutritionFavorites`
- `coachPlanAdjustments`
- `coachActions`
- `paceOverrides`
- `weekNotes`
- `planAlerts`
- `plannedDayRecords`

## Derived canonical producers

Recommended future owner: `useTrainerRuntime`

- canonical goal/profile state
- plan composer
- current `PlanWeek`
- current `PlanDay`
- rolling horizon
- effective readiness state
- nutrition prescription/reality/comparison
- momentum / learning / salvage / failure mode
- progress / expectations / recalibration
- runtime debug snapshot

## Compatibility/legacy producers

Recommended future owner: `plan-history-service`

- legacy prescribed snapshot conversion
- fallback prescribed-day generation from old schedule helpers

These should be isolated and later removed.

## Canonical State Consumers

Primary consumers:

- `TodayTab`
- `PlanTab`
- `LogTab`
- `NutritionTab`
- `CoachTab`
- `SettingsTab`
- `RuntimeInspector`
- onboarding flow
- AI packet builders / AI prompt services

Consumer rule:

- feature components should receive canonical read models, not re-derive them.

## Persistence Boundaries

## Persisted durable boundary

Persist as one snapshot through a persistence gateway:

- `logs`
- `bodyweights`
- `paceOverrides`
- `weekNotes`
- `planAlerts`
- `personalization`
- `goals`
- `coachActions`
- `coachPlanAdjustments`
- `dailyCheckins`
- `plannedDayRecords`
- `weeklyCheckins`
- `nutritionFavorites`
- legacy `nutritionFeedback` compatibility payloads

## Persisted but boundary-specific

- auth session cache
- local cache payload
- realtime shadow rows for session logs
- session-storage UI dismissal flags

## Non-persisted derived boundary

Do not create separate persisted sources for:

- `planDay`
- `planWeek`
- `rollingHorizon`
- readiness layers
- AI state packets
- debug snapshot

## AI Boundaries

## Inputs AI may consume

- typed AI state packet from canonical read models
- recent logs/check-ins/nutrition actuals/bodyweights
- canonical goals/profile/plan week/plan day

## Outputs AI may produce

- typed plan-analysis proposal
- typed coach-action proposal
- text-only guidance for coach surface

## Acceptance-only boundary

Accepted outputs only:

- sanitized pace override changes
- sanitized week note additions
- sanitized alerts
- sanitized coach actions

Rejected outputs:

- direct mutation of raw stores
- direct persistence writes
- untyped plan structure rewrites
- changes outside accepted areas

## Legacy Fallback Paths To Remove Later

1. `buildLegacyPlanSnapshot(...)`
2. `buildLegacyPlannedDayRecordFromSnapshot(...)`
3. `buildLegacyPlannedDayRecordFromWorkout(...)`
4. legacy `todayWorkout` props passed beside canonical `planDay`
5. local-storage API key and AI wiring inside UI component code

## Current Risks Of Desynchronization

## High-risk collisions

1. `personalization` is updated from multiple unrelated concerns:
   - onboarding
   - injury state
   - environment state
   - memory effects
   - reset/undo flows

2. `plannedDayRecords` has multiple producers:
   - current plan-day capture
   - legacy snapshot backfill
   - schedule-derived fallback

3. `persistAll(...)` uses long positional arguments:
   - easy to omit newly added state
   - easy to persist stale values after partial updates

4. Realtime and local mutation flows can overlap:
   - local state may be mid-write while realtime resync patches subsets

5. Tabs still accept legacy and canonical forms:
   - increases branch complexity
   - encourages duplicate derivation

## Medium-risk collisions

1. Older saved payloads may still arrive with `nutritionFeedback`, but runtime truth now lives in `nutritionActualLogs`.
2. memory layers are derived and then pushed back into `personalization`, which can blur raw vs derived state.
3. reset/import/export flows manually rebuild snapshots and may miss future fields.

## Recommended Future Ownership

## `useTrainerAppState`

Owns:

- raw persisted state
- mutation command API
- persistence gateway calls
- auth/session state

Should not own:

- `planDay`
- `planWeek`
- readiness/progress/read-model assembly

## `useTrainerRuntime`

Owns:

- canonical derived runtime state
- canonical state packet input assembly for AI
- debug snapshot assembly

Should not own:

- persistence
- auth
- direct side-effecting mutations

## `trainer-persistence-gateway`

Owns:

- snapshot persistence
- load/import/export
- cloud/local fallback policy
- realtime subscription lifecycle

Should not own:

- planning rules
- UI logic
- AI acceptance rules

## `plan-history-service`

Owns:

- prescribed-day revision capture
- legacy backfill compatibility
- plan-reference building

Should not own:

- UI rendering
- persistence transport

## Safe To Do Now

1. Move pure helper families into services.
2. Move prescribed-day history logic into a dedicated service.
3. Add `useTrainerRuntime` as the only producer for canonical read models.
4. Make tabs consume canonical read models first, even if legacy props remain temporarily.

## After Tests / Validation

1. Replace positional persistence with object-shaped snapshot persistence.
2. Centralize all raw store mutation handlers into `useTrainerAppState`.
3. Move AI orchestration into dedicated AI services.
4. Delete legacy fallback plan reconstruction after historical coverage is validated.

## Definition Of Done

State ownership is clean when:

1. each durable raw state slice has exactly one owner,
2. each derived canonical read model has exactly one producer,
3. persistence has one gateway,
4. AI can only return accepted patches,
5. feature components no longer mix legacy and canonical state inputs.
