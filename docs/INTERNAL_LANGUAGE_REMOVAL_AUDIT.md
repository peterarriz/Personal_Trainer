# Internal Language Removal Audit

This pass removes or hides internal-feeling product language from normal consumer flows.

## Removed Or Replaced

- `Limited data` -> `Needs a little more input`
- `Partial data` -> `Good signal`
- `Grounded` -> `Strong signal`
- `limited inputs` -> `your early setup`
- `Data use` -> `Built from`
- `Device input` -> `Recovery signal`
- `Compromise` -> `Adjustment`
- `Support basis` -> `Support signals`
- `CURRENT BASIS` -> `PLAN OVERVIEW`
- `ACTIVE LAYERS` -> `WHAT'S ACTIVE`
- `Clear active basis` -> `Remove plan layer`
- `Adapt to me` -> `Fit it to me`
- `Use as a style` -> `Use for feel`
- `style-led` -> `use for feel`
- `adapted` / `Adaptive plan` -> `fit to you` / `Fit to you`
- `reviewer report` tooling remains hidden in consumer mode
- `Developer diagnostics` -> `Internal details`
- `Developer sync diagnostics` -> `Internal sync details`
- `Staff diagnostics` -> `Internal diagnostics`
- `Staff goal request tools` -> `Internal goal request tools`
- `Staff coach setup` -> `Internal coach setup`

## Hidden Behind Developer-Only Gating

- Runtime inspector overlay
- Reminder preview debug path
- Settings history export tooling
- Sync diagnostics surfaces
- Protected diagnostics and goal-request tools

These now require the existing trusted-local developer gate instead of a plain debug flag, so they cannot appear in normal consumer mode on production hosts.

## Consumer Copy Rewrites

- Program trust and adherence copy now talks about how well recent training matches the plan instead of using `backbone`, `strict mode`, or `adapted week`.
- Plan-input support copy now explains clarity and confidence in plain language instead of talking about adapters, deterministic logic, or support tiers.
- Program catalog and program preview copy now use phrases like `main plan`, `follow closely`, and `built for your goals` instead of internal plan-architecture wording.
- History surfaces now use `How it matched`, `Source`, `Version`, and `Why` instead of audit-flavored labels.
