# Appearance-Language Support Audit

Date: 2026-04-17
Repo: `Personal_Trainer`
Scope: phrases like `six pack`, `visible abs`, and `body fat under X%`

## Bottom Line

These phrases are not first-class outcomes in the current app.

They are now handled more honestly by translating into the appearance / body-composition lane, attaching proxy metrics, and asking for better anchors when those proxies are still missing.

## Current Resolution Behavior

### `six pack`

- Resolves to `goalFamily: appearance`
- Resolves to `planningCategory: body_comp`
- Summary becomes `Improve midsection definition` or `Improve midsection definition by the target window`
- Proxy metrics are `bodyweight_trend`, `waist_circumference`, and `training_adherence`
- If no current bodyweight or waist anchor is saved, the goal now carries:
  - `Need a repeatable body-composition proxy like current bodyweight or waist if the appearance goal should guide planning.`

### `visible abs`

- Resolves to the same appearance / body-comp lane as `six pack`
- Uses the same midsection-definition summary
- Uses the same proxy metrics
- If no current bodyweight or waist anchor is saved, the same missing-proxy gap is surfaced

### `body fat under X%`

- Resolves to `goalFamily: appearance`
- Resolves to `planningCategory: body_comp`
- Summary becomes `Lean out toward the target body-fat range`
- No direct body-fat verifier is claimed
- Proxy metrics are still `bodyweight_trend`, `waist_circumference`, and `training_adherence`
- If no current bodyweight or waist anchor is saved, the goal now carries:
  - `Need a waist or bodyweight proxy, or a reliable body-fat measurement method, if the percentage target should guide planning.`

## Support-Tier Honesty

- Appearance-only physique goals remain below first-class support
- `six pack`, `visible abs`, and `body fat under X%` are treated as proxy-tracked outcomes, not direct verifiable benchmarks
- Numeric weight-loss goals remain stronger support than these appearance phrases because the app can directly track scale-weight change

## Clarification Behavior

- Intake completeness now asks for a repeatable proxy instead of pretending the app already has a direct body-fat benchmark
- For body-fat percentage phrasing, the prompt explicitly asks for `current bodyweight or waist`
- Structured resolution no longer returns `high` confidence for these phrases when no proxy anchor exists

## Benchmark Coverage

Benchmark coverage now explicitly includes:

- `get a six pack`
- `get visible abs`
- `body fat under 12%`

These cases are covered so the app stays on the proxy-based leaner path instead of silently drifting into first-class fat-loss or generic-fitness wording.

## Proven By

- `tests/goal-resolution-service.test.js`
- `tests/intake-completeness-service.test.js`
- `tests/support-tier-service.test.js`
- `tests/goal-support-honesty-service.test.js`
- `tests/benchmarks/plan-quality-benchmark.test.js`

## Still Not Proven

- The app still does not have a first-class direct verifier for visible abs or a true body-fat percentage target
- The app mentions a reliable body-fat method in unresolved gaps, but that method is not yet a first-class saved field
- Mixed physique-plus-strength phrasing preserves the lift metric, but the secondary strength summary can still read as generic maintenance language
