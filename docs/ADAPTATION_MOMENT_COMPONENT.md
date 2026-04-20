# Adaptation Moment Component

Component lives in [src/components/AdaptationMoment.jsx](../src/components/AdaptationMoment.jsx).  
Rules and placement specs live in [src/services/adaptation-moment-spec.js](../src/services/adaptation-moment-spec.js).  
Visual review lives in [docs/codex-audits/adaptation-moment-component.html](./codex-audits/adaptation-moment-component.html).

## Goal

Replace fragmented adaptation language with one reusable component that can carry the same coaching story across Today, Program, Log, and Coach.

It replaces seams such as:

- `Why this changed`
- `Reduced load`
- drift downgrade summaries
- `Latest change` accepted-action pills

The component should feel like one authored coaching note, not a stack of system fragments.

## Component shape

Collapsed state:

- inline rounded pill with a left icon
- optional short source label
- one sentence for why the plan changed
- one-tap `Why` affordance on the right

Expanded state:

- the same pill stays in place
- the body opens directly underneath it
- body copy explains:
  - what changed
  - why now
  - what stays protected or what earns the next step

## Interaction rules

- One adaptation moment per surface context.
- Default to collapsed unless the change affects the whole week or block.
- The visible sentence must stay readable without expansion.
- Expansion is additive, not a second story.
- The body should top out at three short lines.
- Never render raw decision ids, action ids, or diagnostic labels.

## Copy guardrails

- The collapsed line is always one sentence.
- Explain the coaching decision, not the internal mechanism.
- Name what stayed intact whenever possible.
- Avoid blame when recent execution drifted.
- Avoid hype when the change is a progression.
- Accepted Coach changes should read like a chosen plan call, not an audit record.

## Adaptation kinds

| Kind | Use when | Collapsed copy rule | Expanded copy rule | Example visible line |
|---|---|---|---|---|
| `reduced_load` | The session stays, but the dose comes down. | Name what stayed, what came down, and why that protects the week. | Explain the lighter prescription, the signal behind it, and what part of the week stays intact. | `The session stays in place, but the load comes down so you can keep the week moving without forcing it.` |
| `protect` | Recovery, pain, or fatigue needs active protection. | Treat protection as an intentional coaching call, not damage control. | Name the signal being respected, the risk being avoided, and what work this protects next. | `Today is lighter because recovery needs to catch up before the next meaningful push.` |
| `drift_downgrade` | The next week or block must simplify because recent execution drifted. | Describe the simplification calmly and honestly. | Cover what drifted, how the plan simplified, and what standard earns a tighter fit again. | `The next stretch gets simpler because recent execution moved too far from the written version to keep pretending it still fits cleanly.` |
| `coach_accepted` | The user accepted a Coach recommendation that materially changed the plan. | Acknowledge the choice and the live effect in one sentence. | Explain the accepted move, why it was the better call, and how long it lasts. | `You accepted a cleaner change, so the plan now follows that call instead of the original version.` |
| `user_edit` | A direct user edit changed availability, equipment, or goal setup. | Treat the shift as user-led and factual. | Name the user change, the direct plan effect, and what stayed stable. | `The plan shifted because you changed the setup it has to work inside.` |
| `carry_forward` | Missed key work moves forward instead of being chased immediately. | Name what moved and why it moved. | Explain what moved, what was not doubled up, and where the work lands next. | `The missed key work moves forward instead of getting piled on top of everything else.` |
| `progression` | Recent consistency earned a small progression. | Frame the progression as earned and measured. | Identify the evidence, the exact push, and the guardrail that keeps it honest. | `Recent work has held well enough to earn a slightly stronger push here.` |

## Placement spec

### Today

- Place directly under the Today hero support and above the visible session breakdown.
- Default collapsed.
- Replace the current `Why this changed` disclosure plus the extra reduced-load detail fragments.
- If multiple reasons exist, summarize to the strongest coaching reason and keep the rest in the expanded body.

### Program

- Place inside the Program hero, directly below the current-week headline and above the trajectory header.
- Default expanded when the whole week or block changed. Otherwise collapsed.
- Replace the standalone `program-change-summary`.
- Only use it for changes that affect the week or block. One-off day swaps stay in Today or Log.

### Log

- Place immediately below the planned-session summary and above the editable actuals.
- Default collapsed.
- Mirror the same visible sentence the athlete saw in Today.
- Use the expanded state for logging-specific context only if it clarifies what should be logged against the changed prescription.

### Coach

- Place in the top quiet panel under the canonical session label, before the mode cards.
- Default collapsed during preview. Expand after acceptance when the user needs the rationale for the live plan state.
- Replace the separate `Latest change` pill and accepted-change detail line.
- Coach recommendation cards can still explain the preview, but the adaptation moment becomes the single live-state explanation once accepted.

## Recommended source label behavior

- `Plan rule`: deterministic block logic, structure, or carry-forward rules
- `Based on your recent training`: recent execution, recovery, or drift signal
- `You changed this`: direct user edit or accepted Coach action
- `Recovery-first change`: pain, fatigue, or recovery protection

## What this fixes

- Today stops stitching four different explanation fragments into one disclosure.
- Program stops carrying drift copy as a standalone sentence outside the rest of the adaptation system.
- Log gets the same plan-state explanation instead of a second wording pass.
- Coach stops treating accepted changes like a separate history pill instead of part of the live plan context.
