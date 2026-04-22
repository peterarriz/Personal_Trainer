# Compact Trust Contract

## Product goal

Trust should answer four small questions without turning the app into an explanation engine:
- what is prescribed
- what influenced it
- what changed
- what the app will use later

The UI contract is compact by default:
- one sentence for `Why today`
- short trust chips only
- no default explanation drawers
- no repeated rationale cards

## Data model decisions

No persistence schema changed.

The trust layer is a derived view-model only:
- `Today`: `todayPrescriptionModel.trustModel`
- `Plan`: `planModel.weekTrustModel` and `day.trustModel`
- `Log`: `buildLogTrustModel(...)` from the live draft state

Each trust chip carries:
- `label`
- `sourceKind`

`sourceKind` is for deterministic styling and meaning, not consumer-facing jargon:
- `explicit`: direct user input or user-selected context
- `inferred`: app inference from recent training or recovery signal
- `plan`: stable plan logic or goal balance
- `status`: committed / adjusted / completed state
- `forecast`: preview-only or can-change state

## Surface contract

### Today

Show:
- one `Why today` sentence
- one compact trust row under it

Typical chips:
- `Recent workouts`
- `Time cap`
- `Sore legs`
- `Home setup`
- `Goal balance`
- `Your priorities`

Do not show:
- a second rationale card
- long provenance text
- raw operator language

### Plan

Show:
- committed versus preview state in the hero
- one compact trust row for the week
- one compact trust row in the selected day detail

Typical chips:
- `Adaptive today`
- `Fixed week`
- `Committed`
- `Adaptive day`
- `Preview`
- `Can change`
- `Adjusted`

Plan keeps orientation and status trust. It does not re-render the full Today prescription.

### Log

Show:
- prescribed summary card
- actual entry controls
- one compact trust row in the hero

Typical chips:
- `Prescribed loaded`
- `Actual session`
- `Partial session`
- `Skipped day`
- `Cardio substitute`
- `Recovery signal`
- `Used later`

Log explains downstream use in one small cue instead of repeating Today’s rationale.

## Internal only

These stay debug-only and should not leak into consumer UI:
- raw `provenance.events`
- `adaptivePolicyTraces`
- confidence scores and sample sizes
- audit snapshots
- operator/debug categories and fallback reasons

Consumer UI can use their mapped result, not the raw internals.

