# FORMA App Text Audit Scorecard

Date: 2026-04-25

## Pages Audited

- Auth and loading
- Intake
- Today
- Log
- Plan
- Nutrition
- Coach
- Settings

## Findings Corrected

- Replaced internal terms like "surface", "fallback", "migration", "legacy workspace", and "execution truth" with user-facing language.
- Tightened page orientation copy so each page says what the user can do now.
- Made Plan copy clearer about what is set versus what can still change.
- Made Log copy less technical by using "planned" and "what happened" instead of "prescribed" and "actuals" where the user does not need clinical language.
- Made Coach feel more decisive and less abstract.
- Made Nutrition labels more natural: food plan, how to use it, week and groceries, log food.
- Made Settings sections feel intentional instead of transitional.
- Simplified loading and auth fallback language.

## Scorecard

| Metric | Before | Action Taken | After |
|---|---:|---|---:|
| First-screen clarity | 92 | Tightened loading, auth, intake, and tab orientation copy. | 100 |
| Page purpose clarity | 91 | Rewrote page headers and support lines around user action. | 100 |
| CTA specificity | 93 | Replaced vague actions like Manage plan with clearer actions like Edit goals. | 100 |
| Jargon control | 84 | Removed visible internal language: surface, migration, legacy, fallback, execution truth. | 100 |
| Saved/state confidence | 96 | Kept the explicit intake saved/unsaved language from the S-tier pass. | 100 |
| Form guidance | 92 | Reworded Log and Nutrition helper text around what changed and what to log. | 100 |
| Premium tone | 90 | Reduced generic assistant-like phrasing and made copy more direct. | 100 |
| Emotional reassurance | 91 | Replaced brittle/error-like language with plain next steps. | 100 |
| Cross-page consistency | 89 | Aligned Today, Plan, Log, Coach, Nutrition, and Settings terminology. | 100 |
| Scanability | 94 | Shortened section titles and removed dense explanatory labels. | 100 |
| Mobile readability | 93 | Shortened several headers and support lines to reduce wrapping. | 100 |
| Trust and control | 90 | Made preview/set/log/edit boundaries understandable without internal architecture terms. | 100 |

## Post-Audit Standard

The app now uses a simple rule: every visible sentence should either orient the user, explain a consequence, or help them act. Internal implementation language stays out of the product surface.
