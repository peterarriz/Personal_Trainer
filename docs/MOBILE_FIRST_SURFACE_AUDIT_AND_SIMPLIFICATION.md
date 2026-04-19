# Mobile-First Surface Audit And Simplification

## Purpose

This document records the adversarial review and simplification pass for the major non-intake product surfaces in FORMA.

Scope:

- Today
- Program
- Coach
- Log
- Nutrition
- Settings

Goal:

- make each tab do one obvious job
- reduce default cognitive load
- make the mobile default scannable under time pressure
- move management and unfinished controls out of the main execution flow
- preserve trust without forcing the user to read essays

## Live Architecture Summary

- `src/trainer-dashboard.jsx` still owns the shipped surface composition for Today, Program, Coach, Log, Nutrition, and Settings.
- `src/modules-planning.js` remains the primary source for plan generation, weekly structure, and daily session derivation.
- `src/modules-coach-engine.js` remains the deterministic coach reasoning layer.
- Nutrition actuals and prescription comparison continue to flow through `src/modules-nutrition.js` plus the existing nutrition services.
- Save and persistence behavior still runs through the existing persistence and local-cache paths; this pass changed surface behavior, not the underlying planning model.

## Adversarial Issue Register Summary

| ID | Severity | Surface | Category | Problem | Files / Components | Fix |
| --- | --- | --- | --- | --- | --- | --- |
| SURFACE-001 | high | Today | mobile overload | Today stacked explanation, context, readiness, and logging detail before the user could simply see the workout. | `src/trainer-dashboard.jsx` / `TodayTab` | Rebuilt Today around one hero session card, one quick log card, and collapsed rationale/adjustments. |
| SURFACE-002 | high | Today | state clarity | Workout logging feedback was easy to miss and did not clearly explain whether the day or week changed. | `src/trainer-dashboard.jsx` / `TodayTab` | Added stronger saved state, timestamped language, and plain-English post-save change feedback. |
| SURFACE-003 | blocker | Program | information architecture | Program mixed weekly reading, goal management, Programs/Styles browsing, and heavy rationale into one screen. | `src/trainer-dashboard.jsx` / `PlanTab` | Made Program read-oriented: current week, week list, future weeks, optional details/history only. |
| SURFACE-004 | blocker | Program | misplaced action | Programs + Styles selection lived in the weekly plan reading surface. | `src/trainer-dashboard.jsx` / legacy `PlanTab` controls | Moved Program/Style activation and clearing into Settings > Plan Management. |
| SURFACE-005 | blocker | Program | misplaced action | Goal refinement and goal-arc controls lived on Program. | `src/trainer-dashboard.jsx` / legacy `PlanTab` controls | Moved goal preview/apply controls into Settings > Plan Management. |
| SURFACE-006 | high | Coach | information architecture | Coach mixed conversation, quick prompts, summaries, memory controls, environment presets, and provider setup in the main view. | `src/trainer-dashboard.jsx` / `CoachTab` | Reframed Coach as conversation + decision support, with advanced setup moved behind Settings. |
| SURFACE-007 | medium | Coach | trust | Quick prompts were present but not clearly tied to useful action. | `src/trainer-dashboard.jsx` / `CoachTab` | Reduced the prompt set to a smaller, contextual set tied to real decision scenarios. |
| SURFACE-008 | high | Log | logging | Log save success was not visually strong enough for gym use and the path competed with review/history detail. | `src/trainer-dashboard.jsx` / `LogTab` | Moved quick logging to the top, added a strong save-status line, pushed detail/history behind disclosure. |
| SURFACE-009 | high | Nutrition | mobile overload | Nutrition defaulted to a support manual: target, long rationale, grocery help, supplements, hydration, and review in one stack. | `src/trainer-dashboard.jsx` / `NutritionTab` | Rebuilt around today's target and quick actual logging, with support content collapsed. |
| SURFACE-010 | medium | Nutrition | state clarity | Nutrition saves were easy to miss and did not provide a simple completion signal. | `src/trainer-dashboard.jsx` / `NutritionTab` | Added a persistent save acknowledgment for quick nutrition actions. |
| SURFACE-011 | high | Settings | unfinished feature exposure | Settings exposed too much unfinished or low-value integration surface and too much design-system copy. | `src/trainer-dashboard.jsx` / `SettingsTab` | Hid integrations inside disclosure, de-emphasized unfinished items, and simplified appearance copy. |
| SURFACE-012 | high | Settings | misplaced ownership | Plan-management actions were spread across Program and Coach instead of living in one deliberate management surface. | `src/trainer-dashboard.jsx` / `SettingsTab`, `PlanTab`, `CoachTab` | Consolidated plan management into Settings. |
| SURFACE-013 | medium | cross-cutting | copy | Internal or implementation-flavored phrasing leaked into normal UI. | `src/trainer-dashboard.jsx` across surfaces | Replaced with short plain-English basis, change, and save summaries. |
| SURFACE-014 | medium | cross-cutting | duplication | Multiple tabs tried to explain planning rationale at full length by default. | `src/trainer-dashboard.jsx` across surfaces | Standardized on compact default copy plus optional disclosures. |

## Tab Responsibility Model

### Today

Primary job:

- tell me exactly what to do today

Secondary job:

- let me log it quickly

Tertiary job:

- let me open a short explanation only if I need it

### Program

Primary job:

- show this week and the next few weeks clearly

Secondary job:

- show whether the week is normal or adjusted

Tertiary job:

- show rationale and history only on demand

### Coach

Primary job:

- help me make a decision and understand adjustments

Secondary job:

- let me ask for clarification or apply a recommendation

Tertiary job:

- hold deeper reasoning, not configuration clutter

### Log

Primary job:

- capture what actually happened quickly and clearly during or right after the session

Secondary job:

- let me inspect planned vs actual if I want it, without duplicating the current session card

Tertiary job:

- keep notes, review, and history detail collapsed by default

### Nutrition

Primary job:

- show today's target and let me log today's reality quickly

Secondary job:

- give short practical guidance

Tertiary job:

- keep grocery, supplement, and review detail optional

### Settings

Primary job:

- manage profile, preferences, appearance, plan management, and advanced controls

Secondary job:

- own Programs/Styles and goal-change actions

Tertiary job:

- hide unfinished integrations and advanced setup until deliberately opened

## Before / After Structure

### Today

Before:

- large explanation stack
- readiness/system copy mixed into the main action path
- logging controls diluted by context

After:

- session hero card above the fold
- one-line purpose and one-line plan basis
- quick log card with a strong save path
- `Why today?` and `Adjust today` moved behind disclosure

### Program

Before:

- mixed plan reading, goal management, Programs/Styles browsing, and planning essays

After:

- compact current-plan header
- this-week list
- future-weeks preview
- optional rationale/history disclosures
- management controls removed from the reading flow

### Coach

Before:

- conversation mixed with memory editor, presets, and provider/admin controls

After:

- compact coach summary
- focused conversation entry
- small set of context-specific prompts
- accepted actions and history collapsed
- advanced setup routed to Settings

### Log

Before:

- quick logging competed with detailed review/history and small-field data entry

After:

- one planned-session reference
- large run/lift execution controls
- strong quiet save state
- notes, comparison, and history behind disclosure

### Nutrition

Before:

- daily target buried under support content and review sections

After:

- target card first
- quick actual logging second
- hydration still visible but lighter
- support, supplements, and review tucked into optional sections

### Settings

Before:

- unfinished integrations and philosophy copy competed with useful controls
- ownership of plan management was unclear

After:

- profile and preferences first
- dedicated Plan Management section
- curated appearance controls
- coach setup and integrations collapsed
- unfinished integrations hidden by default

## What Moved Where

- Program/Style activation moved from Program to Settings > Plan Management.
- Program/Style clearing moved from Program to Settings > Plan Management.
- Goal preview/apply actions moved from Program to Settings > Plan Management.
- Coach advanced setup moved out of the main Coach surface into Settings.
- Integration surfaces were pushed into collapsed Settings disclosures.
- Deep rationale moved out of default Today, Program, Log, and Nutrition stacks into disclosures.

## Trust And Copy Principles

- Default copy should usually be one or two lines.
- Use a short basis line, a short change line, and a short save line before any deeper explanation.
- Keep planned state and actual state visibly separate.
- Never use internal engine terms, reason codes, or schema labels in the normal product UI.
- If the plan changed after a log or accepted action, say it plainly.
- If the plan did not change, say that plainly too.
- Deeper reasoning belongs in an expandable details area or in Coach.

Examples of the target voice:

- `Adjusted after your workout log.`
- `Saved. Tomorrow is unchanged.`
- `Based on your current program, adapted to your schedule.`

## Mobile-First Rules Enforced

- Above the fold must answer the tab's primary job.
- Default mobile state must be scannable in seconds.
- Large essays are collapsed or removed.
- Advanced controls do not live in casual reading flows.
- Save status is visible without scrolling to a secondary card.
- Important cards are visually prioritized; not every card gets equal weight.

## Verification Coverage

Automated coverage added or updated for:

- mobile Today hierarchy
- mobile Program hierarchy
- Settings ownership of plan/program management
- removal of Program-side management controls
- workout log save clarity
- nutrition log save clarity
- Coach cleanup of configuration clutter
- first-load surface clarity budgets and duplicate-card guardrails for Today, Program, Log, and Coach

See `e2e/mobile-surfaces.spec.js` and `e2e/surface-clarity-guard.spec.js`.

## Manual Smoke Checklist

1. Open the app at a narrow mobile viewport.
2. Open `Today` and confirm the workout title, session metadata, plan basis, and quick log card are visible above the fold.
3. Save a Today quick log and confirm the save line is immediate, obvious, and plain English.
4. Open `Program` and confirm current week and future weeks are visible without any Program/Style picker or goal-refine controls.
5. Open `Coach` and confirm conversation is the main focus and advanced controls are not visible by default.
6. Open `Log`, save a workout outcome, and confirm the save state is unmistakable.
7. Open `Nutrition`, save a quick daily actual, and confirm the save state is unmistakable.
8. Open `Settings` and confirm Plan Management owns Programs/Styles plus goal-change actions.
9. Confirm unfinished integrations are hidden or collapsed and do not dominate Settings.
10. Refresh and confirm the saved workout and nutrition states persist.

## Remaining Risks

- The surface simplification is still implemented inside the large existing `src/trainer-dashboard.jsx` file, so future UI work can regress if ownership drifts again.
- Some legacy unreachable JSX remains in place behind dead branches; it no longer ships, but it should eventually be deleted in a cleanup pass.
- The layout is materially better on mobile, but the codebase would still benefit from component extraction to make responsibility boundaries harder to violate.
