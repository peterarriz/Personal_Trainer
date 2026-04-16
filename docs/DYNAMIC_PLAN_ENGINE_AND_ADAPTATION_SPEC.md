# Dynamic Plan Engine And Adaptation Spec

## Purpose

This spec defines the deterministic closed-loop planning engine that powers FORMA outside intake.

For the contributor-facing summary of this contract, read `docs/PLANNING_SOURCE_OF_TRUTH_OVERVIEW.md` first.

The planning hierarchy is:

`profile -> resolved goal stack -> GoalCapabilityPacket -> domain adapter -> ProgramBlock -> WeeklyIntent -> PlanWeek -> PlanDay -> prescriptions -> actuals -> future adaptations`

AI may interpret goals and help explain plan changes, but AI does not write canonical prescriptions.

## Current Failure Audit And Dead-Input Register

Pre-remediation failures reproduced in the repo:

| ID | Severity | Failure | Layer swallowing the effect | Fix |
| --- | --- | --- | --- | --- |
| `ENGINE-001` | blocker | Changing Conservative / Standard / Aggressive could leave Program and Today unchanged | `SettingsTab` updated `settings.trainingPreferences`, while the planner still preferred `trainingContext.intensityPosture` | Settings now writes the canonical intensity posture and the planner surfaces the change summary |
| `ENGINE-002` | high | Workout logs updated actual history but not a credible same-week adjustment | planning consumed logs for adherence context, but had weak carry-forward / strain actions | deterministic adaptation now carries missed key work forward and caps the next exposure after repeated strain |
| `ENGINE-003` | high | Nutrition logs affected review copy more than future planning | weekly nutrition review stayed mostly informational | under-fueling and hydration modes now feed adaptation on explicit horizons |
| `ENGINE-004` | high | Swim goals degraded into generic planning language | goal resolution and planning lacked a swim-specific adapter | capability resolution and domain adapters now route swim goals through one shared hierarchy |
| `ENGINE-005` | high | Vertical / jump goals felt hacked-on | no explicit power adapter or week-shape contract | power / vertical goals now resolve into a shared power adapter with deterministic session families |
| `ENGINE-006` | high | Plan change provenance was too implicit on Today and Program | change state existed in internals more than in UI | deterministic `changeSummary` now reaches Program and Today |
| `ENGINE-007` | medium | transient cloud failures kept showing a repeated “fell back to local data” banner | network and timeout failures were classified too coarsely | transient sync errors now classify as retrying, and repeated status updates are deduped in the UI |

## Canonical Semantics

- `Goal`: a user-confirmed resolved planning objective. Raw phrasing is preserved, but planning runs on the confirmed resolved goal.
- `GoalCapabilityPacket`: the finite planning packet derived from raw goal language. It declares the dominant domain, capability mix, confidence, and fallback mode.
- `Program`: a concrete multi-week backbone with week-shape consequences, progression expectations, and fidelity rules.
- `Style`: a soft overlay that changes feel, emphasis, and flavor without becoming the full weekly backbone.
- `Training Preference`: a planning-policy modifier. It changes progression tolerance, fatigue ceiling, density, and catch-up posture.
- `Actuals`: observed outcomes. They never rewrite planned history.
- `Visible horizon`: the next 12 weeks of projected work. It is a planning preview window, not the full goal deadline.

## Architecture

### Goal Resolution

- `src/services/goal-resolution-service.js` resolves the user-confirmed goal.
- `src/services/goal-capability-resolution-service.js` converts resolved goals into finite capability packets.

### Domain Selection

- `src/services/domain-adapter-service.js` chooses one dominant adapter and optional support domains.
- Adapters currently cover:
  - `general_foundation`
  - `strength_hypertrophy`
  - `running_endurance`
  - `swimming_endurance_technique`
  - `power_vertical_plyometric`
  - `body_composition_recomposition`
  - `durability_rebuild`
  - `hybrid_multi_domain`

### Shared Plan Hierarchy

- `src/modules-planning.js` remains the source-of-truth composer.
- `composeGoalNativePlan(...)` now:
  - resolves the training preference policy
  - gives the highest-priority goal first claim on architecture and fatigue budget
  - selects the domain adapter
  - builds domain-specific day templates
  - layers Program / Style basis
  - layers preference policy
  - applies closed-loop adaptation
  - emits a deterministic `changeSummary`

### Adaptation Engine

- `src/services/dynamic-adaptation-service.js` consumes logs, check-ins, nutrition review, coach actions, planned day records, and the active adapter.
- The adaptation engine changes future templates only when rules justify it.

### UI Trust Layer

- `src/trainer-dashboard.jsx` surfaces `changeSummary` on Today and Program.
- `src/services/day-prescription-display-service.js` now labels swim and power sessions in plain English.

## Planning Effect Matrix

| Input | Can change | Must not change | Horizon | Visible surfaces |
| --- | --- | --- | --- | --- |
| training preference | volume cap, progression step, density, load-jump tolerance, fatigue ceiling | goals, actual history | medium | Today, Program, Coach |
| workout outcome | carry-forward, next-session difficulty, weekly aggression posture, near-term progression posture | committed history, goal semantics | immediate to short | Today, Program, Log, Coach |
| performance records | progression posture, quality-session hold/progress decisions | the records themselves, program compatibility truth | short to medium | Today, Program, Coach |
| nutrition actuals | same-day nutrition support, next-day fueling posture, intensity caps when repeated under-fueling matters | the whole week from one miss, workout history | same day to medium | Nutrition, Today, Program, Coach |
| readiness / pain / travel | same-day intensity, substitution, protection rules | goal stack, committed history | immediate | Today, Program, Coach |
| Program activation | week skeleton, fidelity mode, plan basis | goal ownership, safety constraints | immediate | Program, Today, Coach, Settings |
| Style activation | emphasis flavor, exercise bias, conditioning slant | week ownership, hard backbone rules | immediate | Program, Today, Coach, Settings |
| coach-accepted action | next exposure, weekly simplification, progression emphasis | historical actuals | short | Coach, Today, Program |

## Adaptation Horizons

- `workout logs`: immediate and short-horizon
- `readiness / pain / travel / equipment`: immediate
- `training preference`: medium-horizon policy plus live density tolerance
- `nutrition misses`: same-day nutrition support first
- `nutrition trends / under-fueling`: short-to-medium training protection when the signal repeats
- `Program / Style activation`: immediate basis change
- `goal changes`: canonical re-resolution and re-planning

The important rule is that adaptation changes future work, not historical committed truth.

Historical preservation lives in:

- `src/services/prescribed-day-history-service.js`
- `src/services/plan-week-persistence-service.js`

## Unknown-Goal Fallback

When a goal is vague, uncommon, or unsupported:

1. map it to the nearest capability family
2. choose the safest adapter candidate
3. surface missing anchors
4. keep confidence honest
5. use a foundation-first fallback mode instead of pretending exact sport mastery

This same rule applies to timing:

- exact dates matter when the calendar truly matters
- target horizons are valid when only a time window is known
- open-ended goals remain first-class and still build a real plan

The planner should not invent fake deadline precision.

## Visible Horizon And Historical Truth

The live product keeps three different concepts separate:

- goal deadline or target horizon
- the visible 12-week planning window
- committed historical week/day truth

Current rules:

- `DEFAULT_PLANNING_HORIZON_WEEKS` is `12`
- the UI describes that as `next 3 months`
- projected future weeks stay projected until they become current
- committed week snapshots and prescribed-day revisions remain auditable history

Examples:

- `jump higher for basketball` -> power + elasticity + strength support
- `swim a faster mile` -> swimming endurance / technique
- `get lean like a fighter` -> body composition + conditioning flavor
- `improve obstacle course fitness` -> foundation-first fallback until the domain gets clearer

## Visible Change Summary Contract

Every meaningful replan should emit:

- `headline`: what changed
- `detail`: why it changed
- `preserved`: what stayed stable
- `surfaceLine`: short combined line for Today / Program
- `inputType` and `horizon`: what kind of signal caused it

Examples:

- `Tempo Run was carried forward after the earlier skip.`
- `Volume was capped after recent harder-than-expected training.`
- `Intensity was capped until fueling stabilizes.`
- `Aggressive preference changed the week shape.`
- `Today stays as planned. Recent logs support progression.`

## Manual Smoke Checklist

- Change training preference in Settings and verify Program and Today both update.
- Log a skipped key run session and verify the week carries it forward.
- Log repeated harder-than-expected sessions and verify the next exposure is capped.
- Create an under-fueling trend and verify training only changes when the review mode says it should.
- Select a compatible Program and verify the week skeleton visibly changes.
- Apply a Style and verify the week feel changes without replacing the backbone.
- Confirm a swim goal produces swim sessions.
- Confirm a vertical-jump goal produces power / plyometric sessions.
- Verify Today and Program both show a short change summary instead of silent adaptation.
- Verify transient sync failures show retrying language instead of permanent fallback language.
