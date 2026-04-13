# Synthetic Athlete Lab Spec

## Purpose

The synthetic-athlete lab is a deterministic adversarial harness that pressure-tests the product across many realistic user types without creating a second planner or a fake app.

Primary implementation:

- `src/services/synthetic-athlete-lab/persona-catalog.js`
- `src/services/synthetic-athlete-lab/runner.js`
- `scripts/run-synthetic-athlete-lab.js`

## Current Scope

- persona count: 61
- deterministic pass/fail scoring
- clustered failure reporting
- subsystem heatmap

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

## Scenario Coverage

The runner evaluates:

- signup/profile sufficiency
- intake completion
- plan coherence
- adaptation visibility
- Today usefulness
- Program readability
- logging usefulness
- daily nutrition usefulness
- weekly grocery usefulness
- metrics / baselines clarity
- support-tier honesty
- cloud degradation handling
- auth lifecycle expectations

## Deterministic Outputs

The runner emits:

- `summary`
- `globalChecks`
- `personaResults`
- `clusters`
- `failsForWho`
- `subsystemHeatmap`

Latest verified run:

- `personaCount`: 61
- `passedCount`: 61
- `failedCount`: 0
- `averageScore`: 0.94

Top repeated clusters from the latest run:

- `workout_adaptation`: 36 personas
- `support_tiers`: 25 personas

## How To Run

```bash
npm run lab:synthetic
```

## Interpretation Rules

- Canonical evaluation is deterministic.
- Optional narrative or coach-style explanation must never replace deterministic pass/fail logic.
- A passing lab run does not replace browser or device testing.
