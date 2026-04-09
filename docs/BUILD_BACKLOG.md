# Build Backlog

This backlog tracks architecture-first work in priority order. It was updated after auditing the current app against `docs/MASTER_SPEC.md`. Keep tasks small and move them only when the underlying state contract is ready.

## Ranked Implementation Order

1. Normalize goal and profile state into one shared contract used by planning, nutrition, coach, and logging.
2. Formalize a single `PlanDay` output contract for the daily decision engine and make all screens read it.
3. Separate planned state from actual state in storage and UI so prescriptions, check-ins, and actual logs stop overlapping.
4. Introduce explicit `ProgramBlock`, `WeeklyIntent`, and `PlanWeek` state instead of inferring week purpose from mixed helpers and UI text.
5. Rebuild Logging around prescribed-vs-actual comparison so consistency, adherence, and review use real plan snapshots rather than static schedule assumptions.
6. Promote exercise-level `PerformanceRecord` into a stable cross-screen model and unify strength progression around it.
7. Expand nutrition into explicit `NutritionPrescription` and `ActualNutritionLog` models, including hydration, supplements, and execution friction.
8. Define a typed AI state packet and move all model access behind interpretation-only boundaries.
9. Add provenance and mutation audit trails for daily overrides, coach actions, and AI suggestions.
10. Break top-level orchestration out of `src/trainer-dashboard.jsx` after the contracts above are stable.

## Now

- Normalize goals and profile state.
  Progress: added a derived canonical goal/profile contract and switched the main planning, coach, and logging consumers onto it for primary goal, deadline, plan start, and user-profile reads.
  Current gap: goal truth is split across `goals`, `personalization.userGoalProfile`, and `personalization.goalState`, which lets planning and coaching read different versions of the athlete.
- Formalize the daily decision engine contract.
  Progress: added a canonical `PlanDay` contract with `base`, `resolved`, `decision`, `provenance`, and `flags`, routed Today, Program, Coach, Nutrition, and Log entry points onto that shared daily object, and completed a screen-level consumption sweep so Today/Program/Coach/Nutrition now prefer `PlanDay` / `PlanDay.week` for phase, recovery, current-week meaning, and current-day preview context.
  Remaining gap: logging consistency windows, future-week previews, and some UI-only day variants still rely on legacy helpers instead of durable `PlanDay` snapshots.
- Separate planned state from actual state.
  Progress: added persisted `plannedDayRecords`, made `dailyCheckins` the canonical check-in/recovery record, updated session logs to carry `actualSession`, `planReference`, and `comparison` metadata against the prescribed day, and promoted prescribed-day storage into a per-date history envelope with revisions.
  Remaining gap: a thin legacy `log.checkin` mirror still exists for backward compatibility, and historical backfills may still be derived from legacy snapshots or static schedule templates when no real stored `PlanDay` existed.
- Rebuild Logging around prescribed-vs-actual comparison.
  Progress: Log consistency, history, and archived plan review now prefer stored prescribed-day history first, including archived prescribed-day snapshots captured during plan resets, and Logging now has a lightweight day-review surface that shows original prescription, later revisions, actual workout/check-in/nutrition outcome, and compact comparison summaries for a selected date.
  Remaining gap: older dates that predate durable snapshots still rely on explicit legacy backfill records, some archive entries created before this change do not have prescribed-day history attached, and archive review still exposes summaries rather than the full selected-day revision inspector.
- Introduce explicit `WeeklyIntent` and `PlanWeek` state.
  Progress: added first-class `WeeklyIntent` / `PlanWeek` contracts, threaded the current week into `PlanDay` generation, expanded horizon `PlanWeek` rows so future weeks now project sessions from the canonical week pattern instead of generic template reconstruction, and made Program plus Today's tomorrow preview prefer those future `PlanWeek` records.
  Remaining gap: future weeks are now canonical in-memory projections, but they are not yet persisted as durable week records, and special recovery / next-goal rows plus empty-horizon fallback still retain small helper-based boundaries.
- Improve nutrition reality logging.
  Progress: added a normalized `ActualNutritionLog` model over the nutrition store, attached prescribed-vs-actual nutrition comparison to `PlanDay`, and updated Nutrition, Coach, and review helpers to prefer the normalized actual log.
  Remaining gap: nutrition actuals still persist inside the legacy `nutritionFeedback` map for backward compatibility, and historical/weekly review UI is still lighter than training review.
- Align core screen consumption to canonical state.
  Progress: Today now uses `PlanDay.week` for current phase and `PlanWeek.sessionsByDay` for tomorrow preview when available, Program uses `PlanDay.week` as a current-week anchor, Nutrition reads current phase from `PlanDay.week` and keeps legacy nutrition feedback only as a boundary fallback, and Coach now uses canonical week/recovery context for prompt construction and decision framing.
  Remaining gap: Logging already prefers prescribed-day history and actual logs, but custom entry labels still fall back to legacy workout labels when no prescribed snapshot exists, and future-week Program previews still mix canonical week data with helper-derived adaptive/template rows.
- Define the AI state packet and acceptance-only mutation boundary.
  Progress: added a typed AI state packet built from canonical goal/profile state, `PlanDay`, `PlanWeek`, recent actuals, nutrition actuals, readiness/adherence/provenance summaries, routed the Coach LLM path, plan-analysis path, and onboarding/intake interpretation path through that packet family, and added deterministic acceptance/sanitization gates so proposal payloads are bounded before any state mutation or UI reuse.
  Remaining gap: deterministic-strength explanation copy and nutrition assistant content generation still sit outside the packet-scoped runtime.

## Next

- Expand `PlanWeek` beyond current-week scaffolding.
  Current gap: future-week previews now come from canonical projected `PlanWeek` rows, but historical weekly review and long-horizon storage still do not use durable persisted week records.
- Improve plan visibility across Today, Program, Coach, and Nutrition.
  Current gap: cross-screen coherence is mostly reconstructed ad hoc from shared helpers, not from one persisted plan hierarchy.
- Strengthen exercise-level performance tracking.
  Current gap: strong logic exists for lift progression, but performance records still live partly in logs, partly in personalization, and partly in storage shadow tables.
- Add weekly nutrition review and adaptation.
  Current gap: daily nutrition actuals are now explicit, but weekly review, archived review, and trend surfaces do not yet expose first-class nutrition adherence and deviation summaries.

## Later

- Define the AI state packet.
  Current gap: Coach, plan-analysis, and onboarding/intake now share the typed packet boundary, but some explanatory copy paths still construct prompts or AI text outside that runtime.
- Expand recovery and supplement prescriptions into first-class children of the daily decision.
  Current gap: recovery and supplements are partly present in UI behavior, but not modeled as canonical prescribed state.
- Add plan and decision audit views.
  Current gap: provenance text exists in the UI, but mutation history and trust trails are not first-class reviewable artifacts.

## Deferred

- Deep device integration as a primary source of adaptation beyond explicit user logging.
- Advanced conversational memory beyond explicit structured coach memory artifacts.
- Automatic optimization layers that cannot explain their decisions deterministically.

## Specific Architecture Gaps

- A canonical `PlanDay` now persists as versioned prescribed-day history per date, but older historical dates may still be represented by legacy-backfilled or fallback-derived revisions rather than original engine output.
- Goal and profile state are duplicated across onboarding/profile structures and normalized goals.
- `ProgramBlock` is only partially represented through phase and block-intent helpers.
- `WeeklyIntent` / `PlanWeek` now exist for the current week and rolling-horizon rows, but future-week sessions still partly come from template and adaptive helper logic rather than durable week state.
- `WeeklyIntent` / `PlanWeek` now exist for the current week and rolling-horizon rows, and future-week sessions now project from the canonical week pattern, but week history is still not persisted as a first-class record set.
- Logging now separates prescribed-day history from actual session/check-in/nutrition records, but legacy compatibility fields and legacy-derived revisions still exist.
- Logging now supports selected-day prescription-revision versus actual inspection for live history, but archived plans and oldest legacy dates still depend on normalized fallback-derived snapshots.
- Program consistency calculations outside Logging still depend on static schedule helpers instead of plan snapshots that include live overrides.
- Nutrition prescription is derived well, and actual nutrition is now normalized into `ActualNutritionLog`, but persistence still rides through the legacy `nutritionFeedback` map instead of a dedicated store/table.
- Exercise performance tracking is meaningful but fragmented across `logs`, `personalization.strengthProgression`, and `exercise_performance` storage rows.
- AI is mostly used as an interpretation layer, but one path still applies AI-generated plan mutations directly.
- AI proposal handling now routes core coach/plan-analysis mutations through deterministic acceptance gates, but not every interpretation-only AI text path has moved onto the typed packet yet.
- Provenance is visible as explanatory text, but not yet attached to every durable adjustment as structured metadata.

## Technical Debt Notes

- `src/trainer-dashboard.jsx` concentrates product state, orchestration, screen logic, progression logic, storage wiring, and AI integrations in one large file.
- State is persisted both as a large `trainer_data` blob and as selective shadow tables, which increases drift risk without stronger contracts.
- The current codebase contains overlapping legacy and newer logic paths for planning and strength progression.
- Readiness and daily decision logic are computed both centrally and inside screen flows, which makes Today-versus-other-screen behavior easier to desynchronize.
- `PlanDay` now centralizes the current-day contract, but future-day previews and logging consistency still depend on static week helpers rather than day snapshots.
- `PlanWeek` now anchors the current week and horizon scaffolding, but future-week previews still mix canonical week models with legacy adaptive/template helper paths.
- `PlanWeek` now anchors the current week and future horizon previews through projected canonical week models, but archive-era week review and empty-horizon fallback still lack durable persisted week records.
- `ActualNutritionLog` is now the working nutrition actual model, but storage remains backward-compatible through `nutritionFeedback`, so old and new nutrition fields coexist for now.
- Core screens now prefer canonical day/week state for current-day rendering, but some labels and archive-era fallbacks still depend on legacy helper data when durable snapshots do not exist.
- Logging now prefers durable prescribed-day history, but historical fallback still relies on legacy snapshots and explicit schedule-derived backfills for dates that lack original stored plan snapshots.
- Logging now includes a compact selected-day revision-vs-actual review surface, but archived-plan inspection and old fallback-derived dates still need a shared reusable review component if deeper audit trails become necessary.
- Same-day prescribed history is versioned, but revision reasons are still coarse and the app does not yet expose a first-class revision timeline UI.
- Archive entries created before prescribed-day history was added still only contain legacy log snapshots unless they are re-exported or recreated.
- AI entry points are spread across onboarding, plan analysis, strength explanation, and coach chat rather than sitting behind one typed boundary.
- A typed AI packet now exists for Coach, plan-analysis, and onboarding/intake, but deterministic explanation copy and nutrition assistant content generation still sit outside that shared packet boundary.

## 7-Day Usage Findings

Use this section during the live test instead of scattering notes across architecture tasks.

- Trust breaks to capture:
  incorrect `PlanDay`, unclear `PlanWeek` intent, readiness mismatch, nutrition comparison mismatch, AI explanation mismatch, plan-vs-actual mismatch, or stale prescribed history.
- Logging friction to capture:
  when a prescribed day exists but logging feels slow, confusing, or ambiguous between completed / modified / skipped / custom.
- Nutrition friction to capture:
  when the quick nutrition log is too coarse to describe what actually happened, or when Coach/Nutrition disagree about the day.
- Reliability issues to capture:
  storage mode confusion, auth/sync drift, missing snapshots, or missing actual logs after actions appear to save.
- Suggested live-test habit:
  record the date, screen, expected behavior, actual behavior, and whether canonical inspector state matched what the UI showed.
