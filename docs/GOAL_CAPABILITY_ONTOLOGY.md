# Goal Capability Ontology

## Purpose

The planner supports messy goal phrasing through a finite capability ontology, not through one planner per sentence pattern.

## Capability Families

- `maximal_strength`
- `hypertrophy`
- `body_composition`
- `aerobic_base`
- `threshold_endurance`
- `endurance_event_preparation`
- `power_explosiveness`
- `elasticity_reactive_ability`
- `skill_technique`
- `durability_prehab`
- `mobility_movement_quality`
- `consistency_habit_restoration`

## GoalCapabilityPacket Shape

```js
{
  goalId,
  rawUserIntent,
  normalizedSummary,
  goalFamily,
  planningCategory,
  primaryDomain,
  secondaryDomains,
  capabilityMix,
  primaryMetric,
  proxyMetrics,
  targetHorizonWeeks,
  targetEventContext,
  hardConstraints,
  equipmentAssumptions,
  scheduleAssumptions,
  confidence,
  missingAnchors,
  candidateDomainAdapters,
  fallbackPlanningMode,
  goalRole
}
```

## Domain Mapping Rules

- running / race goals -> `running_endurance`
- swim goals -> `swimming_endurance_technique`
- strength / hypertrophy goals -> `strength_hypertrophy`
- vertical / jump / dunk goals -> `power_vertical_plyometric`
- body comp / lean-out / recomp goals -> `body_composition_recomposition`
- rebuild / pain-aware / return goals -> `durability_rebuild`
- mixed or hybrid goals -> `hybrid_multi_domain`
- unknown or underspecified goals -> `general_foundation`

## Example Mappings

- `Bench 225`
  - primary domain: strength
  - capability mix: maximal strength + hypertrophy + durability

- `Run a 1:45 half marathon`
  - primary domain: running
  - capability mix: event prep + threshold endurance + aerobic base

- `Swim a faster mile`
  - primary domain: swimming
  - capability mix: event prep + technique + aerobic base + durability

- `Improve vertical jump`
  - primary domain: power
  - capability mix: explosiveness + elasticity + maximal strength + tissue tolerance

- `Lose fat but keep strength`
  - primary domain: body composition
  - support domain: strength
  - capability mix: body comp + hypertrophy support + aerobic base + consistency

- `Improve obstacle course fitness`
  - primary domain: foundation until more anchors are known
  - fallback mode: `foundation_then_specialize`

## Confidence Rules

- `high`: direct metric plus credible horizon
- `medium`: strong domain match with workable proxies
- `low`: vague phrasing, uncommon domain, or key anchors still missing

Confidence is about planning confidence, not model confidence theater.

## Fallback Rules

When support is weak:

- prefer the nearest safe domain
- surface the top missing anchor
- keep the fallback mode explicit
- avoid sport-specific claims the system cannot defend

## Current v1 Missing Anchor Patterns

- swimming: pool/open-water reality, recent benchmark
- power / vertical: jump anchor, landing/tendon history
- body comp: proxy anchor
- durability / rebuild: active issue context
- foundation fallback: weekly schedule reality
