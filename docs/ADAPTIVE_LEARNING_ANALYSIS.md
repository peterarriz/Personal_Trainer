# Adaptive Learning Analysis

## Purpose

This pipeline studies historical adaptive-learning events offline. It does not change live prescriptions.

The goal is to help a product or fitness operator answer questions like:

- which recommendation patterns are associated with better adherence
- which cohorts struggle with specific progression styles
- which substitutions preserve consistency
- which nutrition styles are ignored
- which coach prompt types lead to follow-through

## Inputs

The analysis reads structured adaptive-learning events from any of these shapes:

- an adaptive snapshot with `adaptiveLearning.events`
- a persisted trainer payload with `data.adaptiveLearning.events`
- an event bundle with top-level `events`
- an array or directory of JSON files containing those structures

The extractor anonymizes actors into analysis-only ids before writing artifacts.

## Commands

Run against a built-in synthetic fixture pack:

```bash
npm run qa:adaptive-learning:analyze:fixture
```

Run against exported JSON input:

```bash
npm run qa:adaptive-learning:analyze -- --input path/to/export-or-directory
```

Optional flags:

```bash
--output artifacts/adaptive-learning-analysis/custom-run
--label april_sync_review
--min-sample-size 4
--min-policy-sample-size 6
```

Export real adaptive events from Supabase first:

```bash
npm run qa:adaptive-learning:export -- --source auto
```

## Artifact Outputs

Artifacts are written to:

```text
artifacts/adaptive-learning-analysis/
```

Files:

- `normalized-events.json`
- `analysis-rows.json`
- `results.json`
- `candidate-policy-suggestions.json`
- `failure-clusters.json`
- `cohort-summaries.json`
- `analysis-report.md`

The export utility writes:

- `artifacts/adaptive-learning-export/summary.json`
- `artifacts/adaptive-learning-export/normalized-events.json`
- `artifacts/adaptive-learning-export/report.md`

Fixture mode also writes:

- `fixture-metadata.json`

## Analysis Flow

### 1. Extraction

`src/services/adaptive-learning-analysis/extraction.js`

- validates adaptive-learning events
- normalizes supported input envelopes
- anonymizes actors for offline analysis
- records discarded invalid events

### 2. Feature Engineering

`src/services/adaptive-learning-analysis/feature-engineering.js`

Builds one analysis row per recommendation event and attaches:

- prior cohort snapshot
- prior user-state snapshot
- linked immediate outcome
- short-term weekly evaluation window
- medium-term weekly evaluation window
- derived cohort and recommendation features
- composite success score

### 3. Insight Mining

`src/services/adaptive-learning-analysis/insight-mining.js`

Generates:

- cohort summaries
- recommendation success rates
- question-family summaries
- common success traits
- common failure traits
- failure clusters
- candidate policy suggestions

## Question Families

The current pipeline produces targeted summaries for:

- run-ramp tolerance
- hybrid load combinations
- travel substitution styles
- deload timing
- nutrition styles
- coach prompt types

If a required feature is missing from the events, the relevant family output will be sparse instead of inventing a conclusion.

## Confidence Model

Candidate policy suggestions use a simple confidence model:

- sample size
- effect size
- horizon coverage

This is meant to prevent tiny cohorts from producing fake certainty. Findings are split into:

- high confidence
- medium confidence
- low confidence

## Important Limits

- This is not live personalization.
- It does not mutate the planner.
- It only uses fields present in the recorded events.
- Missing data stays missing.
- Results are associative, not causal.

## Fixture Regression

The synthetic fixture pack includes scenario families for:

- fast ramp versus capped ramp hybrid plans
- travel-heavy users with and without substitutions
- late versus on-time deload timing
- heavy versus simple nutrition styles
- verbose versus direct coach prompts

That fixture exists to keep the report format and rule generation stable as the event model evolves.
