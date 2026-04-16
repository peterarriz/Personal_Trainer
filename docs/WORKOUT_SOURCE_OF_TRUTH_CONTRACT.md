# Workout Source Of Truth Contract

For the broader planning and history model, read `docs/PLANNING_SOURCE_OF_TRUTH_OVERVIEW.md` alongside this contract.

## Canonical Source
The canonical prescribed session for the day is `PlanDay.resolved.training`, with prescribed exercise rows attached where available.

## Surface Rules
### Today
- Must show the full workout in-place.
- Large sessions may be grouped, but the user should not need Program just to execute today.
- Temporary environment overrides for `Home`, `Gym`, and `Travel` are allowed for today only.

### Program
- Day drill-in must show the actual planned session detail, not a generic placeholder when structure exists.
- If only summary-level structure was stored, say that honestly.
- Missing metrics must route cleanly into Settings → Metrics / Baselines.

### Log
- Logging prepopulation comes from the same canonical prescription.
- Quick logging remains available.
- Detailed logging uses planned versus actual language.
- Prescribed structure must remain visible even when actual entries differ or substitutions occur.

## Copy Rules
- Avoid engine language.
- Use `actual` for what happened and `planned` for what was prescribed.
- Avoid ambiguous labels like `Full detail capture`.
