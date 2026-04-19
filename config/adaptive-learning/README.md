# Adaptive Learning Config

This directory is the operator-managed home for reviewed adaptive policy artifacts.

Files:

- `adaptive-policy-evidence.json`
  The current reviewed evidence snapshot.
- `adaptive-learning-config.shadow.json`
  The last generated shadow candidate config.
- `adaptive-learning-config.active.json`
  The last generated active candidate config.
- `adaptive-learning-config.applied.json`
  The currently applied operator config.
- `applied-bundle-manifest.json`
  Metadata about the last applied bundle.
- `applied-bundle-report.md`
  Human-readable summary of the applied bundle.

The safe rollout flow is:

1. Generate a promotion bundle.
2. Apply it here in `shadow` mode.
3. Run staging shadow evaluation and launch-readiness against real data.
4. Only consider `active` if the gate is green and harmful cohorts stay clear.
