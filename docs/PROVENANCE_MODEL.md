# Provenance Model

## Goal
Replace freeform "reason" text as the only explanation path with small, durable structured metadata that can survive persistence, review, and future UI reuse.

## Core Shape

### Provenance event

```js
{
  version: 1,
  actor: "user" | "deterministic_engine" | "ai_interpretation" | "migration" | "fallback",
  trigger: "string",
  mutationType: "string",
  revisionReason: "short human-readable reason",
  sourceInputs: ["stable_input_key"],
  confidence: "low" | "medium" | "high" | null,
  timestamp: 1710000000000,
  details: { ...small structured context }
}
```

### Structured provenance container

```js
{
  version: 1,
  summary: "Derived UI-ready explanation",
  keyDrivers: ["driver one", "driver two"],
  events: [provenanceEvent],
  updatedAt: 1710000000000
}
```

### Deterministic change summary

Weekly and daily planning surfaces also carry a short deterministic `changeSummary` alongside richer provenance:

```js
{
  didChange: true,
  inputType: "workout_log",
  horizon: "immediate_to_short",
  headline: "Tempo Run was carried forward after the earlier skip.",
  detail: "The next lower-priority slot was replaced so the week's backbone stays intact.",
  preserved: "The longer endurance backbone stays preserved.",
  surfaceLine: "Tempo Run was carried forward after the earlier skip. The longer endurance backbone stays preserved."
}
```

This is not a replacement for provenance events. It is the short user-facing explanation contract for Today and Program.

## Actor Rules

- `user`: direct user-applied overrides, quick prompts, manual context changes
- `deterministic_engine`: app-owned deterministic planning and coaching logic
- `ai_interpretation`: AI proposals or AI-originated responses that still require deterministic acceptance
- `migration`: compatibility recovery from legacy durable data
- `fallback`: reconstruction from non-canonical helpers or degraded runtime paths

## Durable Records Using Structured Provenance

- `PlanDay.provenance`
- `plannedDayRecords[dateKey].provenance`
- `plannedDayRecords[dateKey].revisions[].provenance`
- `coachActions[].provenance`
- accepted AI plan-analysis proposal payloads and accepted AI alerts
- AI runtime result objects returned by `ai-runtime-service`
- `coachPlanAdjustments.dayOverrides[dateKey].provenance`
- `coachPlanAdjustments.nutritionOverrides[dateKey].provenance`
- `coachPlanAdjustments.extra.readinessSignals[dateKey].provenance`
- `weeklyCheckins[week].provenance`
- `coachPlanAdjustments.extra.provenance.weekVolumeByWeek[week]`

## Compatibility Rules

- Keep existing `reason`, `summary`, `sourceType`, and `durability` fields where legacy UI or storage still reads them.
- Derive display text from structured provenance when available.
- Allow legacy records to normalize into the new event/container shape on read.
- Do not require immediate migration of old saved payloads before loading.

## Prescribed-Day Revision Policy

- Same-day prescribed history keeps the existing revision structure, but durable revisions are only appended for material prescription changes.
- A new revision is created when one of these materially changes:
- session type
- session label or identity
- run structure, with thresholds of `>= 5` minutes or `>= 0.5` miles
- readiness or decision state
- nutrition day type or nutrition targets, with thresholds of `>= 100` kcal, `>= 15g` macro, or `>= 12 oz` hydration target
- recovery prescription/state
- explicit user-approved adjustment provenance
- Equivalent recomputations, render churn, and metadata-only changes do not create a new durable revision.

## What Is Still Coarse Or Text-Only

- many `planAlerts` outside accepted AI alerts still rely on `msg`
- `weekNotes` remain plain text summaries
- strength progression notifications and explanations still rely on `note` and `explanation`
- some coach adjustment detail copy is generated ad hoc for the UI
- import/auth/storage diagnostics still use coarse status reasons rather than provenance events
- fallback schedule reconstruction still carries limited detail beyond the fallback provenance event

## Implementation Notes

- Prefer one event per mutation or acceptance decision.
- Use `details` for machine-usable context, not long prose.
- Use `summary` as a derived convenience field, not the source of truth.
- New durable adjustment records should include either inline `provenance` or a sidecar provenance map when the stored value is primitive-like.
