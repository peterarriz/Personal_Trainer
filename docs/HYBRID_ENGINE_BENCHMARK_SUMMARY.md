# Hybrid Engine Benchmark Summary

Date: 2026-04-21

This artifact captures the current deterministic hybrid-planning benchmark after the engine upgrade in `src/modules-planning.js`.

Current verification status:
- Focused hybrid-planning unit and contract suites: passing
- Benchmark suites (`goal-coverage`, `plan-quality`, `archetype-differentiation`): passing
- Production build: passing

## What improved

- Run-led hybrid weeks now preserve real long-run progression instead of flattening every week to the same canned duration.
- Bench-focused secondary goals now stay visible as explicit bench / upper-body sessions instead of collapsing into anonymous short-strength support.
- Three-day hybrid weeks now preserve both lanes instead of deleting strength and backfilling a generic touchpoint later.
- Home / limited-equipment hybrids stay equipment-honest and still generate prescribed exercises.
- Lower-body fatigue guards now bias the next strength touch away from lower-body loading when recent logs show leg soreness or low recovery.
- Single-goal race plans no longer lose run exposures to generic support lifting when the schedule is tight.
- Pure hypertrophy / limited-home weeks now keep actual hypertrophy structure instead of getting flattened into generic hybrid support templates.
- Hybrid priority archetypes now stay differentiated under schedule pressure instead of converging into the same mixed week.
- Triathlon schedule trimming now preserves swim, bike, and run visibility instead of counting a brick as a full replacement for the standalone run lane.

## Benchmark snapshots

### 1. Run-led hybrid

Goal stack:
- Primary: half marathon performance
- Maintained: bench progression
- Support: visible abs

Typical week shape:
- Easy run + strength finish
- Recovery / mobility
- Easy support run
- Tempo run
- Upper-body maintenance
- Long run

What this proves:
- The run lane keeps the clean fatigue windows.
- Bench work stays alive without obvious lower-body interference.
- Body-comp support changes dosage and finishers instead of hijacking the week.

### 2. Strength-led hybrid

Goal stack:
- Primary: bench progression
- Maintained: running performance

Typical week shape:
- Upper-body strength
- Tempo run
- Recovery
- Lower-body support + pulling
- Easy run
- Long aerobic + strength finish

What this proves:
- Strength can lead without deleting endurance.
- The endurance lane stays alive, but it no longer reads like race prep.
- Lower-body strength is not stacked directly beside hard run anchors.

### 3. Body-comp-led hybrid

Goal stack:
- Primary: fat loss / physique
- Maintained: endurance support

Typical week shape:
- Easy run + strength finish
- Recovery
- Tempo run
- Upper-body maintenance

What this proves:
- Body comp is handled as a real planning mode, not generic "do cardio."
- Strength protection survives even in compressed weeks.
- The engine now trims decorative long work before it trims muscle-protective strength.

## Before / after snapshots

### Strength-priority hybrid on a 2-day week

Before:
- tempo run
- long aerobic + strength finish

Problem:
- only one real lifting touch survived schedule trimming
- the week still read more run-led than strength-led

After:
- upper-body strength
- long aerobic + strength finish

What changed:
- schedule trimming now respects lane priority, not just "keep both lanes somehow"
- the compressed week still keeps endurance alive, but strength now actually leads

### Busy aesthetic + endurance hybrid

Before:
- easy run + strength finish
- tempo run
- long run

Problem:
- only one strength touch survived
- the long run stayed in a busy physique-led week even when it crowded out muscle-retention work

After:
- easy run + strength finish
- tempo run
- upper-body maintenance

What changed:
- body-comp-led hybrids now protect the second strength exposure before they protect a decorative long run
- compressed weeks read like a believable hybrid cut, not accidental race prep

### Triathlon beginner on a 3-day schedule

Before:
- technique swim
- brick / long bike
- support strength

Problem:
- the explicit run lane disappeared after schedule trimming

After:
- technique swim
- easy run
- brick / long bike

What changed:
- triathlon trimming now preserves swim-bike-run visibility on compressed weeks
- the brick remains, but it no longer erases the standalone run anchor

## Peter audit snapshot

Current 12-week run-led hybrid audit:
- Weekly run frequency: `3` every week
- Long-run progression: `4, 5, 5, 4, 6, 7, 7, 5, 8, 9, 9, 5`
- Explicit bench exposure count: `12`
- Nutrition day types now include: `run_easy`, `run_quality`, `run_long`, `hybrid_support`

Resolved from the previous engine:
- `long_run_progression_flat`
- `bench_specificity_missing`

Remaining residual tradeoffs:
- `strength_exposure_sparse`
- `body_comp_lane_not_explicit`

## Current takeaway

The engine is now materially better at hybrid honesty:
- it keeps both lanes alive,
- it preserves progression signals,
- it stops obvious lower-body / hard-run conflicts,
- and it no longer lets schedule trimming quietly collapse archetypes into the wrong priority mix.

The next pass should go after only two remaining gaps:
- denser strength exposure in run-led three-day weeks
- more explicit body-comp emphasis when running still leads the block
