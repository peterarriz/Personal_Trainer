# Synthetic Athlete Lab Spec

## Purpose

The synthetic-athlete lab is a deterministic long-horizon release gate. It pressure-tests intake, planning, adaptation, logging, goals, coach, sync calmness, and cross-surface trust without inventing a second planner or a fake app shell.

Primary implementation:

- `src/services/synthetic-athlete-lab/persona-catalog.js`
- `src/services/synthetic-athlete-lab/adversarial-harness.js`
- `src/services/synthetic-athlete-lab/runner.js`
- `scripts/run-synthetic-athlete-lab.js`

## Current Scope

- persona count: 100
- default simulation horizon: 26 weeks per persona
- deterministic pass/fail scoring
- root-cause clustering
- cohort coverage and fairness signals
- release-dimension scoring for coherence, progression realism, safety, adaptation quality, and cross-surface conformity

## Persona Shape

Each persona includes:

- identifier
- age range
- training age
- goals
- expected support tier
- body composition / strength / endurance context
- equipment reality
- schedule reality
- durability context
- logging behavior
- nutrition behavior
- coach interaction style
- travel likelihood
- likely failure modes
- important baseline metrics

## Coverage Expectations

The catalog and release report must cover:

- beginners
- older adults
- obese beginners
- highly trained athletes
- swimmers
- runners
- lifters
- shift workers
- postpartum users
- injury-return users
- low-equipment users
- travel-heavy users
- neurodivergent users
- time-crunched professionals
- adaptive athletes

`youth athletes` remain optional and should only be used if the product scope explicitly supports them.

## Scenario Coverage

The runner evaluates:

- intake completion and click drag
- goal resolution and ordered-goal coherence
- plan realism across six months
- adaptation visibility and honesty
- Today / Program / Log / Nutrition / Coach conformity
- logging usefulness
- weekly review confidence
- support-tier honesty
- cloud degradation handling
- auth lifecycle expectations
- theme and accessibility sanity probes

It also simulates realistic misses and drift:

- missed workouts
- travel-heavy weeks
- pain flare weeks
- schedule compression
- coach overuse / underuse
- adherence drift and rebound

## Deterministic Outputs

The runner emits diffable JSON with:

- `schemaVersion`
- `summary`
- `globalChecks`
- `personaResults`
- `releaseDimensionSummary`
- `cohortCoverage`
- `fairnessSignals`
- `releaseGate`
- `clusters`
- `failsForWho`
- `subsystemHeatmap`

The default release command is intentionally the full gate:

```bash
npm run lab:synthetic
```

Supporting commands:

```bash
npm run lab:synthetic:quick
npm run lab:synthetic:matrix
```

`lab:synthetic:quick` is a fast local smoke run. `lab:synthetic:matrix` is the smaller archetype slice plus the quick probe matrix.

## Interpretation Rules

- Canonical evaluation is deterministic.
- Optional narrative or coach-style explanation must never replace deterministic pass/fail logic.
- A passing synthetic lab run does not replace browser or device testing.
- Release decisions should key off `releaseGate.passed`, failing release checks, recurring clusters, and cohort/fairness gaps instead of a single average score.
