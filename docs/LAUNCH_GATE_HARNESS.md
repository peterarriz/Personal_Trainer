# Launch Gate Harness

## Purpose

This harness gives FORMA a repeatable pre-launch answer to:

`Is this build materially closer to launch, and where is it still weak?`

It does that by orchestrating deterministic unit tests, benchmark suites, and Playwright flows that already exist in the repo, then writing a human-readable scorecard artifact.

It is intentionally not a replacement for the existing launch dashboard or manual QA pack. It is the automated layer that sits underneath them.

## Command

```bash
npm run qa:launch-gate
```

## Output

Each run writes:

- `artifacts/launch-gate/<timestamp>/results.json`
- `artifacts/launch-gate/<timestamp>/launch-gate-scorecard.md`
- `artifacts/launch-gate/<timestamp>/logs/*.log`
- `artifacts/launch-gate/<timestamp>/manual-qa-pack/manual-qa-run.md`

The latest run is also copied to:

- `artifacts/launch-gate/latest/results.json`
- `artifacts/launch-gate/latest/launch-gate-scorecard.md`

## Evaluation dimensions

The scorecard evaluates these product dimensions:

1. `Today clarity`
2. `Log usability`
3. `Plan coherence`
4. `Intake quality`
5. `Hybrid goal realism`
6. `Trust and provenance clarity`
7. `Sync and auth reliability`
8. `Design and craft proxy checks`
9. `Key journey stability`

## What is deterministic

The harness runs deterministic checks only:

- build and repo-hygiene via `npm run build`
- unit and contract tests for Today, Log, Plan, Intake, Trust, Sync, and hybrid planning
- benchmark suites for plan quality and archetype differentiation
- Playwright flows for Today, Log, Plan, Intake, account lifecycle, sync-state failure handling, CTA/tap-budget checks, and theme intent

If a deterministic check fails, the harness returns a failing exit code.

## What still requires manual review

Some launch decisions cannot be honestly automated in a local repo-only run. The scorecard keeps them explicit as `WARN` items instead of pretending they are solved:

- real two-device staging sync against live Supabase
- premium visual review across dark/light themes and real phone hardware
- any deployment/vendor validation that depends on external configuration

The harness generates a companion manual review worksheet each run so those checks stay attached to the same artifact set.

## Scoring model

Each evaluation category gets:

- `PASS` = deterministic checks passed and no manual warning is attached
- `WARN` = deterministic checks passed, but a real manual/external gate still remains
- `FAIL` = one or more deterministic checks failed

The score is a simple proxy:

- `PASS` = 100
- `WARN` = 70
- `FAIL` = 0

Overall readiness score = average category score.

This score is intentionally simple. The scorecard text matters more than the number.

## Interpretation

- `PASS` overall: deterministic checks are green and no manual launch gate is still attached
- `WARN` overall: the local build is strong, but a real launch-signoff item still remains
- `FAIL` overall: at least one deterministic product check failed

## Current design choice

This harness reuses existing suites rather than inventing a second hidden standard. If a dimension matters for launch, it should point back to real tests or real flows already in the repo.
