# Synthetic Athlete Release Gate Spec

## Purpose
The synthetic-athlete lab is a deterministic release gate, not a demo script.

## Safety Rule
- Run the lab only through local/test harness paths.
- Do not connect the lab to production Supabase.
- The current entrypoint is `npm run lab:synthetic`.
- The CLI now refuses production-looking `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` / `VITE_SUPABASE_URL` values unless `FORMA_ALLOW_UNSAFE_SYNTHETIC_LAB=1` is set deliberately.

## Coverage Expectations
The persona catalog must keep strong coverage for:
- novice obese beginner
- detrained returner
- busy recomp user
- bench-225 user
- bodybuilder prep user
- half-marathon user without exact date
- marathon/event runner
- recreational and higher-level swimmers
- vertical/power athletes
- hybrid athletes
- travel-heavy users
- injury-prone users
- older general-health users
- physique-first users

## Gate Criteria
- Persona count and clustering stay deterministic.
- Failures cluster into actionable subsystems instead of anecdotal noise.
- Reports must pressure-test signup/profile, intake fidelity, planning, Today, Program, Log, nutrition, coach, metrics, cloud calm behavior, support-tier honesty, and readability.

## Operator Checklist
1. Run `npm run lab:synthetic`.
2. Review summary, top clusters, and subsystem heatmap.
3. Do not release if a blocker cluster repeats across personas in the same subsystem.
