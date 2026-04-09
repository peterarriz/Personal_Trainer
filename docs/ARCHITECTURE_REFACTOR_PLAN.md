# Architecture Refactor Plan

## Purpose

`src/trainer-dashboard.jsx` is currently acting as:

1. Application shell and tab router.
2. Canonical state owner for training, nutrition, goals, check-ins, personalization, plan history, auth, and sync metadata.
3. Deterministic planning/runtime assembler for `PlanWeek`, `PlanDay`, readiness, momentum, nutrition, and coaching layers.
4. Persistence coordinator for local cache, Supabase auth, Supabase sync, realtime reconciliation, import/export, and reset flows.
5. Mutation command handler for plan overrides, environment changes, injury state, logging, onboarding, nutrition feedback, and coach actions.
6. AI boundary host for typed state packet construction, prompt assembly, external model calls, acceptance gating, and accepted mutation application.
7. Debug/runtime inspection surface.
8. UI layer for onboarding, settings, and all major tabs.

At ~10k lines, that concentration makes state ownership hard to reason about and increases the risk of desynchronization between prescribed state, actual state, persisted payloads, and accepted AI mutations.

## Current Top-Level Responsibilities In `src/trainer-dashboard.jsx`

## 1. Static domain catalogs and helper logic

Current examples:

- `PROFILE`, `PHASE_ZONES`, `WEEKS`, `STRENGTH`, `ACHILLES`, environment presets.
- Strength progression helpers.
- Readiness, momentum, behavior, recovery, environment, and fallback helpers.
- Prescribed-day history normalization and legacy plan snapshot helpers.

Issue:

- Many helpers are deterministic domain services, but they live beside React state and UI rendering.

## 2. Canonical state assembly

Current state roots managed directly in the component include:

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
- `nutritionFeedback`
- `storageStatus`
- auth/session state

Current derived canonical state assembled in-place includes:

- canonical goal/profile state
- current plan week
- today plan
- rolling horizon
- effective training day
- nutrition prescription and actual comparison
- readiness state
- plan-day canonical object
- long-term memory / compounding memory / optimization / salvage / failure-mode layers

Issue:

- The component both owns source state and recomputes almost every major read model.

## 3. Persistence and sync orchestration

Current responsibilities:

- `persistAll`
- `sbLoad`
- Supabase boot/auth restoration
- realtime client and resync scheduling
- local cache fallback
- session shadow-row sync
- import/export
- start-fresh / undo reset
- session storage writes for dismissed UI state

Issue:

- Persistence policy is mixed into domain mutation handlers and UI concerns.

## 4. Plan history and compatibility backfill

Current responsibilities:

- durable `plannedDayRecords`
- same-day prescribed revision capture
- legacy snapshot reconstruction
- fallback reconstruction from historical schedule helpers

Issue:

- Compatibility logic is valuable, but it currently sits in the hot path of dashboard orchestration and hides which records are canonical vs fallback.

## 5. Mutation handling

Current responsibilities:

- injury updates
- environment selection and schedule changes
- day override / workout shift / restore
- log saving
- weekly/daily check-in persistence
- nutrition feedback/favorites writes
- onboarding completion
- accepted coach action application

Issue:

- Mutations are stateful, async, and usually coupled to persistence in the same function.

## 6. AI coordination

Current responsibilities:

- state packet building
- prompt building
- outbound Anthropic call
- plan-analysis accept/reject gating
- coach action accept/reject gating
- accepted mutation persistence

Issue:

- Acceptance-only boundaries exist conceptually, but the orchestration is still embedded in the main component, which makes the boundary harder to enforce and test.

## Target Architecture

The target should stay service-oriented and incremental. Avoid adding framework-heavy abstractions.

## A. App shell stays thin

Keep `src/trainer-dashboard.jsx` as the composition root only:

- tab selection
- high-level providers/hooks wiring
- passing already-shaped view models into tab components
- rendering auth/loading shell

Target responsibility:

- no business rules
- no multi-store persistence policy
- no AI mutation acceptance logic
- no prescribed-day backfill logic

## B. Move deterministic domain logic into services

Recommended target modules:

- `src/services/planning/planning-catalogs.js`
  - `PROFILE`, `PHASE_ZONES`, `WEEKS`, `STRENGTH`, `ACHILLES`, environment presets.
- `src/services/planning/strength-progression-service.js`
  - set/rep parsing, overload buckets, progression adjustments, strength history shaping.
- `src/services/planning/readiness-service.js`
  - readiness derivation, device-readiness shaping, recovery-mode decisions.
- `src/services/planning/environment-service.js`
  - mode preset resolution, environment application, schedule resolution.
- `src/services/planning/plan-runtime-service.js`
  - current week/day lookup, base workout resolution, day naming, runtime plan derivation.
- `src/services/planning/plan-history-service.js`
  - prescribed-day revision logic, normalize/upsert helpers, legacy snapshot conversion.
- `src/services/insights/athlete-insight-service.js`
  - momentum, patterns, optimization, learning, salvage, failure mode, progress, expectations, memory, recalibration.

## C. Centralize canonical state ownership in one app-state hook

Recommended hook:

- `src/hooks/useTrainerAppState.js`

Responsibilities:

- own raw persisted state
- expose typed mutation commands
- expose a normalized state snapshot
- keep React `useState` and setter wiring in one place

Important rule:

- raw persisted state should be produced here
- canonical derived state should not be individually re-owned by tab components

## D. Split derived read-model assembly into a dedicated hook

Recommended hook:

- `src/hooks/useTrainerRuntime.js`

Responsibilities:

- consume raw app state
- compute canonical goal/profile state
- compute plan composer, plan week, plan day, rolling horizon
- compute nutrition/readiness/progress/read models
- return view-ready runtime snapshot

Important rule:

- `useTrainerRuntime` produces canonical read models
- tabs consume them only; tabs do not rebuild them

## E. Isolate persistence into one persistence gateway

Recommended modules:

- `src/services/persistence/trainer-persistence-gateway.js`
- `src/services/persistence/trainer-realtime-service.js`
- continue using `src/modules-auth-storage.js` initially, then wrap it behind the gateway

Responsibilities:

- local payload load/save
- cloud load/save
- auth session lifecycle
- realtime subscriptions
- retry / resync policy
- import/export serialization

Important rule:

- domain mutation handlers should call a persistence command API, not hand-build the persisted payload everywhere

## F. Isolate mutation commands

Recommended modules:

- `src/services/mutations/training-mutation-service.js`
- `src/services/mutations/nutrition-mutation-service.js`
- `src/services/mutations/profile-mutation-service.js`
- `src/services/mutations/plan-adjustment-mutation-service.js`

Responsibilities:

- pure or mostly-pure next-state calculators
- no direct UI rendering
- persistence invoked by `useTrainerAppState` after mutation result is produced

Important rule:

- mutations return the next state patch
- persistence is coordinated after state mutation, not mixed into every rule function

## G. Isolate AI boundaries

Recommended modules:

- `src/services/ai/ai-client.js`
- `src/services/ai/plan-analysis-service.js`
- `src/services/ai/coach-action-service.js`

Responsibilities:

- packet creation delegation to `modules-ai-state.js`
- prompt assembly
- external call
- parse proposal
- acceptance gate
- return accepted patch set only

Important rule:

- AI services can propose
- acceptance gates can sanitize/reject
- only accepted, typed patches can reach mutation services

## H. Keep UI split by feature surface

Recommended component moves:

- `src/features/today/TodayTab.jsx`
- `src/features/plan/PlanTab.jsx`
- `src/features/logging/LogTab.jsx`
- `src/features/nutrition/NutritionTab.jsx`
- `src/features/coach/CoachTab.jsx`
- `src/features/settings/SettingsTab.jsx`
- `src/features/onboarding/OnboardingCoach.jsx`
- `src/features/debug/RuntimeInspector.jsx`

This is mostly a relocation/ownership cleanup, not a behavior redesign.

## Proposed Ownership Boundaries

## Canonical state producers

- `useTrainerAppState`
  - persisted raw source-of-truth state.
- `useTrainerRuntime`
  - canonical derived runtime state.
- `plan-history-service`
  - canonical prescribed-day revision records.
- `modules-ai-state.js` + AI services
  - typed AI state packet only, never direct app state mutation.

## Canonical state consumers

- feature tabs
- onboarding/settings surfaces
- runtime inspector
- AI services
- persistence gateway export/import layer

## Persistence boundaries

Persisted raw state:

- logs
- bodyweights
- pace overrides
- week notes
- plan alerts
- personalization
- goals
- coach actions
- coach plan adjustments
- daily check-ins
- planned day records
- weekly check-ins
- nutrition favorites
- nutrition feedback
- auth session cache

Do not persist as independent sources of truth:

- `planDay`
- `currentPlanWeek`
- `rollingHorizon`
- momentum / expectations / readiness / optimization / failure-mode read models
- AI packets

## AI boundaries

Allowed AI responsibilities:

- analyze typed packet
- return typed proposal
- suggest pace/week-note/alert or coach-action proposals

Not allowed:

- mutate raw app state directly
- bypass acceptance gates
- write to persistence directly
- own canonical plan state

## Legacy fallback paths that must be removed later

1. Legacy prescribed snapshot reconstruction from log entries.
2. Fallback prescribed-day reconstruction from historical schedule helper.
3. Dual handling of `todayWorkout`/legacy workout objects beside canonical `planDay`.
4. Local-storage Anthropic key flow embedded in UI component logic.
5. Persist-all payload assembly duplicated across many handlers.

These are acceptable short-term compatibility bridges, but they should end behind clearly marked compatibility services and then be deleted.

## Current Risks Of Desynchronization

1. `persistAll` is called from many places with long positional argument lists, which makes omission or stale-closure bugs likely.
2. `plannedDayRecords` can be created from canonical runtime output, legacy snapshots, or schedule fallback, which means historical provenance quality is uneven.
3. `personalization` is mutated both directly and indirectly through memory effects, increasing accidental overwrite risk.
4. Derived runtime state is recomputed in the shell, while tabs still receive both canonical and legacy props.
5. Realtime updates can change subsets of state while local mutation effects are still persisting.
6. AI acceptance logic is safe conceptually, but orchestration still lives near UI state and could accidentally drift.
7. Import/export and reset flows manually reconstruct large payloads and can miss new state fields.

## Concrete Refactor Plan

## Phase 1: Safe To Do Now

These changes should be low-risk because they mostly extract pure logic or move code without changing behavior.

1. Create `src/services/planning/planning-catalogs.js`.
   - Move static catalogs and constants out of `trainer-dashboard.jsx`.
2. Create `src/services/planning/plan-history-service.js`.
   - Move prescribed-day history helpers and legacy backfill helpers.
3. Create `src/services/planning/environment-service.js`.
   - Move preset resolution and workout environment application helpers.
4. Create `src/services/planning/strength-progression-service.js`.
   - Move strength parsing/progression helpers.
5. Create `src/services/insights/athlete-insight-service.js`.
   - Move momentum/progress/memory/failure helpers that are already pure.
6. Move tab/onboarding/settings/runtime-inspector components into `src/features/*`.
   - Keep props stable initially.
7. Introduce `src/hooks/useTrainerRuntime.js`.
   - First version can still consume state from the dashboard component, but it should own all derived read-model assembly.

## Phase 2: Still Safe, But Requires Careful Validation

1. Introduce `src/hooks/useTrainerAppState.js`.
   - Move all persisted raw state and command handlers into one hook.
2. Replace positional `persistAll(...)` calls with object-shaped commands.
   - Example: `persistSnapshot({ logs, bodyweights, personalization, ... })`.
3. Introduce `trainer-persistence-gateway.js`.
   - Wrap `modules-auth-storage.js` instead of calling it directly from the shell.
4. Convert mutation handlers to patch-based services.
   - `applyDayContextOverride`
   - `shiftTodayWorkout`
   - `setEnvironmentMode`
   - `setInjuryState`
   - check-in/log/nutrition saves

## Phase 3: After Tests / Validation

1. Introduce `src/services/ai/plan-analysis-service.js` and `src/services/ai/coach-action-service.js`.
   - Move external AI orchestration out of the UI layer.
2. Move realtime subscription setup into `trainer-realtime-service.js`.
3. Remove legacy `todayWorkout` prop paths from tabs.
4. Remove legacy prescribed snapshot backfill once historical records are durable enough.
5. Delete schedule-derived prescribed-day fallback once migration coverage is complete.

## Recommended Migration Order

1. Extract pure constants/catalogs.
2. Extract prescribed-day history/legacy compatibility helpers.
3. Extract environment and strength progression helpers.
4. Extract insight/read-model derivation into services.
5. Add `useTrainerRuntime` and make `trainer-dashboard.jsx` consume it.
6. Move feature components into `src/features/*`.
7. Add `useTrainerAppState`.
8. Introduce persistence gateway with object-shaped snapshot persistence.
9. Move mutation handlers to service modules.
10. Move AI orchestration to dedicated AI services.
11. Remove legacy fallback paths once parity is verified.

## Suggested File Layout

```text
src/
  features/
    coach/CoachTab.jsx
    debug/RuntimeInspector.jsx
    logging/LogTab.jsx
    nutrition/NutritionTab.jsx
    onboarding/OnboardingCoach.jsx
    plan/PlanTab.jsx
    settings/SettingsTab.jsx
    today/TodayTab.jsx
  hooks/
    useTrainerAppState.js
    useTrainerRuntime.js
  services/
    ai/
      ai-client.js
      coach-action-service.js
      plan-analysis-service.js
    insights/
      athlete-insight-service.js
    mutations/
      nutrition-mutation-service.js
      plan-adjustment-mutation-service.js
      profile-mutation-service.js
      training-mutation-service.js
    persistence/
      trainer-persistence-gateway.js
      trainer-realtime-service.js
    planning/
      environment-service.js
      plan-history-service.js
      plan-runtime-service.js
      planning-catalogs.js
      readiness-service.js
      strength-progression-service.js
```

## Definition Of Done

The refactor is done when:

1. `src/trainer-dashboard.jsx` is primarily composition and rendering glue, not domain orchestration.
2. Raw persisted state has one clear owner.
3. Canonical derived runtime state has one clear producer.
4. Persistence flows go through one gateway with object-shaped payloads.
5. AI proposals are handled only through dedicated AI services plus acceptance gates.
6. Tabs consume canonical `planDay` / `planWeek` models and no longer rely on legacy workout fallbacks.
7. Legacy prescribed-day fallback paths are either removed or isolated behind a clearly temporary compatibility boundary.
