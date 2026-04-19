# Launch Simulation

## Purpose

The launch simulation is a stricter release gate built on top of the existing synthetic-athlete lab.

It combines:

- a deterministic 1,000-persona, five-year simulation using compressed checkpoint weeks
- machine-readable issue clustering
- browser verification hooks for local and deployed app probes
- a resumable browser chunk runner for persona-slice verification
- durable artifacts under `artifacts/launch-simulation/`

Primary implementation:

- `src/services/synthetic-athlete-lab/launch-persona-generator.js`
- `src/services/synthetic-athlete-lab/launch-simulation-service.js`
- `scripts/run-launch-simulation.js`
- `e2e/launch-simulation-smoke.spec.js`

## Commands

Quick smoke:

```bash
npm run qa:launch-simulation:quick
```

Full deterministic launch simulation:

```bash
npm run qa:launch-simulation
```

Deployed-app mode with Playwright reachability probes:

```bash
npm run qa:launch-simulation:deployed
```

Chunked browser runner against the local app shell:

```bash
npm run qa:launch-simulation:browser:chunk -- --start 0 --count 25
```

Report-only regeneration from the latest saved results:

```bash
npm run qa:launch-simulation:report
```

## Outputs

Artifacts are written to:

```text
artifacts/launch-simulation/
```

Required files:

- `personas.json`
- `persona-coverage.json`
- `results.json`
- `issue-clusters.json`
- `launch-report.md`
- `top-persona-narratives.md`
- `fix-plan.md`

Deployed screenshots land in:

```text
artifacts/launch-simulation/screenshots/
```

## How the Simulation Works

### Deterministic layer

`qa:launch-simulation` generates 1,000 personas with:

- stable ids
- dominant and secondary review lenses
- intake friction profiles
- goal specificity patterns
- equipment and schedule realities
- feature expectations
- likely failure modes
- five-year lifecycle events

Those personas are then passed into the existing synthetic-athlete harness for a compressed 260-week simulation.

### Browser layer

The browser layer is intentionally separate from the deterministic layer.

Current modes:

- `quick` and `full`: deterministic launch simulation only
- `deployed`: reuses the latest deterministic results, then layers in Playwright reachability probes against the configured deployed URL
- `browser:chunk`: runs a resumable local browser slice through the initial journey and writes per-persona results to `artifacts/launch-simulation/browser-chunks/`

If browser verification does not attempt the full requested 1,000 personas, the report marks the browser gate as incomplete instead of silently passing it.

## Deployed-App Mode

By default the deployed mode uses:

```text
https://personal-trainer-snowy-tau.vercel.app
```

Override with:

```bash
npm run qa:launch-simulation:deployed -- --base-url https://your-deployment.example.com
```

The current deployed mode is intentionally conservative:

- it verifies reachability and auth-surface behavior with Playwright
- it writes screenshots for desktop and mobile auth entry
- it reuses the latest full deterministic run instead of re-running the whole 1,000-persona simulation
- it does not pretend to have completed full 1,000-persona real-account browser verification if it has not

## Browser Chunk Runner

The browser chunk runner is for the initial journey only. It is designed to be resumable and safe to rerun.

Example:

```bash
npm run qa:launch-simulation:browser:chunk -- --start 100 --count 50
```

Optional flags:

- `--base-url https://your-deployment.example.com`
- `--output-dir artifacts/launch-simulation/browser-chunks`
- `--output-file artifacts/launch-simulation/browser-chunks/custom.json`
- `--resume 1`
- `--fail-on-error 1`

Each chunk writes a JSON artifact with attempted, passed, failed, and screenshot references so you can continue from the next slice instead of restarting from zero.

## Extending Persona Archetypes

Add or edit archetypes in:

```text
src/services/synthetic-athlete-lab/launch-persona-generator.js
```

Each archetype should define:

- goal domain and core goal language
- schedule and equipment reality
- injury or recovery context where relevant
- nutrition and logging behavior
- coach and sync expectations
- likely failure modes
- baseline metrics

After updating the archetypes, re-run:

```bash
npm run test:quality:unit
npm run qa:launch-simulation:quick
```

## Interpreting the Reports

`results.json` contains the compact machine-readable run.

It keeps the per-persona outcomes, top failures, checkpoint highlights, gate metrics, and ranked issue clusters without re-embedding every raw weekly object.

`issue-clusters.json` is the ranked issue list used for triage and fix planning.

`launch-report.md` separates findings into:

- browser-verified findings
- deterministic simulation findings
- inferred product risks
- unverified hypotheses

`top-persona-narratives.md` is for human product review across representative cohorts and review lenses.

## Release-Gate Thresholds

The current proposal blocks launch when any of these fail:

- intake completion rate below 97%
- post-intake plan creation rate below 98%
- cross-surface contradiction rate above 8%
- any severe safety issue
- any blocker cluster
- any high-severity trust-break cluster
- average satisfaction below 78
- simulation completion below 100%
- browser gate incomplete or browser pass rate below 95%
- accessibility smoke pass rate below 100% when browser accessibility checks were attempted

Final verdicts are:

- `LAUNCH READY`
- `LAUNCH READY WITH KNOWN RISKS`
- `NOT LAUNCH READY`

The gate is intentionally strict. A single systemic planning, safety, or trust failure should block launch.
