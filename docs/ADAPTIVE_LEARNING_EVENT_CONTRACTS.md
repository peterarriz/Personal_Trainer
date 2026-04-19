# Adaptive Learning Event Contracts

## Purpose

This pass adds observability for adaptive workout learning without changing the live planner.

The planner, nutrition logic, and coach action system remain deterministic. These events exist so later learning systems can answer five questions with a strict audit trail:

- what the app knew
- what it recommended
- what the user did
- what happened after
- whether that recommendation should later be treated as helpful or harmful

## Scope

Primary implementation:

- `src/services/adaptive-learning-event-service.js`
- `src/services/adaptive-learning-store-service.js`
- `src/services/adaptive-learning-domain-service.js`
- `src/modules-auth-storage.js`
- `src/services/persistence-adapter-service.js`
- `src/services/persistence-contract-service.js`

The app records adaptive-learning events at:

- intake completion
- plan generation
- weekly plan refresh
- daily prescription resolution
- workout adjustment
- workout logging and skipped days
- nutrition recommendation generation
- nutrition log submission
- coach recommendation display
- coach recommendation accept or ignore
- goal edits and goal abandonment
- auth lifecycle transitions
- sync lifecycle transitions
- local/cloud merge decisions

## Event Model

Every event has:

- `eventName`: stable catalog name
- `version`: per-event payload version
- `schemaVersion`: global event-contract version
- `eventId`: deterministic identity for replay and dedupe
- `actorId`: user id when signed in, otherwise stable local actor id
- `userId`: cloud user id when available
- `localActorId`: stable device actor id
- `occurredAt`: event timestamp
- `dedupeKey`: logical replay identity when the caller can provide one
- `payload`: validated event-specific body

Current event names:

- `adaptive_learning.recommendation_generated`
- `adaptive_learning.recommendation_outcome_recorded`
- `adaptive_learning.cohort_snapshot_captured`
- `adaptive_learning.user_state_snapshot_captured`
- `adaptive_learning.goal_changed`
- `adaptive_learning.weekly_evaluation_completed`
- `adaptive_learning.auth_lifecycle_changed`
- `adaptive_learning.sync_lifecycle_changed`

## Required Schemas

### Recommendation event

Used for deterministic prescriptions and surfaced recommendations.

Required fields:

- `recommendationKind`
- `recommendationJoinKey`
- `decisionId`
- `goalStack`
- `planStage`
- `contextualInputs`
- `candidateOptionsConsidered`
- `chosenOption`
- `whyChosen`
- `provenance`
- `sourceSurface`
- `owner`

### Recommendation outcome event

Used to tie later execution back to a recommendation.

Required fields:

- `outcomeKind`
- `recommendationJoinKey`
- `decisionId`
- `adherenceOutcome`
- `completionPercentage`
- `userModifications`
- `painFlag`
- `shortHorizonResultWindow`
- `actualSummary`
- `sourceSurface`
- `owner`

### Cohort snapshot event

Compact segment snapshot for later offline analysis.

Fields include:

- `cohortKey`
- `planArchetypeId`
- `primaryGoalCategory`
- `secondaryGoalCategories`
- `experienceLevel`
- `trainingDaysPerWeek`
- `environmentMode`
- `equipmentAccess`
- `nutritionBias`
- `coachTone`

### User state snapshot event

State of the athlete at a moment in the journey.

Fields include:

- `snapshotKind`
- `goalStack`
- `planArchetypeId`
- `planStage`
- `onboardingComplete`
- `syncMode`
- `pendingLocalWrites`
- `currentMomentumState`
- `recentPainState`
- `environmentMode`
- `latestCompletionRate`
- `details`

### Goal change event

Tracks edits, reprioritization, and abandonment.

Fields include:

- `changeKind`
- `changeMode`
- `effectiveDate`
- `rawGoalIntent`
- `previousGoals`
- `nextGoals`
- `abandonedGoals`
- `archivedPlanId`
- `rationale`

### Weekly evaluation event

Compact weekly scorecard for later retrospective learning.

Fields include:

- `evaluationWeekNumber`
- `phase`
- `adherenceRate`
- `completedSessions`
- `modifiedSessions`
- `skippedSessions`
- `missedSessions`
- `painFlags`
- `nutritionCompliance`
- `coachChangesAccepted`
- `goalProgressSignal`
- `verdict`
- `linkedRecommendationJoinKeys`

## Join Keys And Provenance

### Recommendation join key

`recommendationJoinKey` is the primary link between a recommendation and later outcomes.

It is stable across retries and derived from deterministic plan context such as:

- recommendation kind
- plan week id
- plan day id
- date
- chosen option

### Decision id

`decisionId` is the recommendation-level identifier for later analysis. It is generated from the recommendation kind, recommendation join key, actor context, and stable fallback seed.

### Provenance

Every recommendation event carries provenance fields that explain where it came from. In this pass that should remain deterministic and explicit, such as:

- `deterministic_planner`
- `plan_day_resolution`
- `nutrition_resolution`
- `coach_adjust_week`

No event in this pass authorizes silent planner mutation.

## Storage, Buffering, And Replay

Adaptive-learning history is stored in its own local snapshot:

- storage key: `trainer_adaptive_learning_v1`
- model: `adaptive_learning_store_v1`

The store keeps:

- validated `events`
- `pendingEventIds` for replay
- `pendingServerEventIds` for the dedicated adaptive event sink
- `lastLocalWriteAt`
- `lastCloudReadAt`
- `lastCloudWriteAt`
- `lastReplayAt`
- `lastServerIngestAt`
- `lastServerIngestErrorAt`
- `lastServerIngestErrorCode`

Replay rules:

- events are written locally first
- cloud issues must not drop events
- pending events remain buffered until a cloud-backed write succeeds
- dedicated sink replay is tracked separately from trainer-payload replay
- cloud imports merge with local history
- merge dedupe uses `eventName + dedupeKey` when available, otherwise `eventId`
- cloud-synced events clear matching pending local events during replay
- dedicated sink success clears matching `pendingServerEventIds`

This keeps local-only mode usable while also making signed-in replay deterministic.

## Persistence Boundary

Adaptive-learning snapshots now move through the same persistence boundary as the rest of trainer state:

- `buildPersistedTrainerPayload(...)`
- `sanitizeTrainerDataPayloadForRest(...)`

This means:

- local cache saves include adaptive-learning history
- Supabase trainer payloads can carry adaptive-learning history
- replay survives refreshes, sign-in, and local/cloud merge

## Dedicated Event Sink

There is now an optional authenticated sink at:

- `POST /api/adaptive-learning/events`
- `GET /api/adaptive-learning/events`

Current intent:

- keep the existing trainer-payload path as a fallback
- mirror adaptive events into a dedicated append-only table when configured
- support signed-in export without making consumer UI depend on internal analytics state

Server-side config:

- `ENABLE_ADAPTIVE_EVENT_SINK=true`
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- optional `SUPABASE_ADAPTIVE_EVENTS_TABLE`

## How Future Learning Systems Should Use This

Future learning systems should read these events offline or in a separate analysis pipeline.

Allowed next-step uses:

- cluster prescriptions by cohort and outcome
- measure adherence and pain patterns by recommendation kind
- compare deterministic choices against short-horizon outcomes
- identify recommendation classes that underperform for specific cohorts

Not allowed in this pass:

- direct model-based planner rewrites
- hidden AI mutations of Today, Program, Log, Nutrition, or Coach
- dropping provenance or explainability

Any future adaptive behavior layer should consume these contracts first, then surface explicit, reviewable changes back through the existing planning boundaries.

## Testing

Current coverage includes:

- schema validation for every event family
- domain-builder tests for recommendation and outcome payloads
- local buffering and restart durability
- retry dedupe
- cross-device merge dedupe
- persistence-boundary preservation of recommendation/outcome joins

Recommended future additions:

- stronger staging validation against the dedicated adaptive-learning sink
- analytics export tests against real sink data
- staged replay tests with multiple signed-in devices over longer histories
