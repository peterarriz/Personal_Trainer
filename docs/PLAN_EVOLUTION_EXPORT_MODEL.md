# Plan Evolution Export Model

## Purpose

Give QA or a skeptical reviewer one compact export that makes plan evolution inspectable without pretending the app never changed its mind.

## Current Artifact

`src/services/audits/plan-evolution-export-service.js` builds the deterministic markdown report.

It is exposed in the product from:

- `Settings`
- `Account & sync`
- `Advanced recovery and destructive actions`
- `Reviewer report`

Each exported day includes:

- original prescription
- latest prescription
- actual log
- revision count
- why the plan changed
- inferred change drivers

Each exported week summary includes:

- week label and window
- planned summary
- actual summary
- what mattered
- what changes next
- source label when the week came from an archived plan

## Driver Labels

The current export infers these causes when enough deterministic evidence exists in the saved review:

- `workout_log`
- `nutrition_log`
- `baseline_edit`
- `preferences`

If the saved review does not contain enough evidence, the export leaves the driver list incomplete instead of inventing a cause.

## Intended Use

- Reviewers can generate a markdown report directly in the UI instead of opening internal dev tools.
- QA can compare the original prescription against the latest prescription and check whether actual logs stayed visible beside them.
- Week summaries give a compact view of what the app planned, what happened, and what changed next across current and archived plan arcs.
- The artifact is meant to expose history, not to overwrite it or summarize it away.

## Current Limit

This export is only as strong as the saved day reviews, week reviews, and provenance events it receives. If a mutation path does not stamp enough provenance, the report will surface that uncertainty instead of faking precision.
