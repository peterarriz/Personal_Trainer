# Intake AI Boundary

## Purpose

This document defines the typed AI boundary for onboarding and intake interpretation.

The goal is to make intake AI follow the same architecture already used by coach chat and plan analysis:

- typed packet in
- proposal-only AI output
- no direct canonical mutation
- deterministic application state remains the source of truth

## Audit Summary

Before this change, intake AI lived in ad hoc prompt paths inside [`trainer-dashboard.jsx`](c:/Users/Peter/Documents/Personal_Trainer/src/trainer-dashboard.jsx):

- `OnboardingCoach`
  - direct Anthropic request for timeline assessment copy
- `OnboardingCoachLegacy`
  - direct Anthropic request for timeline assessment copy
- `OnboardingCoachLegacyFallback`
  - direct Anthropic request for timeline assessment copy

These paths built prompt text inline, sent loosely structured intake data, and consumed returned freeform text directly for interpretation copy.

They were still interpretation-only, but they sat outside the app’s typed AI runtime boundary.

## New Boundary

Intake now extends the existing AI packet system instead of creating a separate intake-only runtime.

Shared runtime pieces:

- `buildAiStatePacket(...)`
- `AI_PACKET_INTENTS`
- `requestAiText(...)`
- packet-scoped system prompts
- structured proposal parsing
- provenance on runtime results

New intake-specific pieces:

- `AI_PACKET_INTENTS.intakeInterpretation`
- intake packet payload under `statePacket.intake`
- `buildIntakeInterpretationAiSystemPrompt(...)`
- `runIntakeInterpretationRuntime(...)`
- `sanitizeIntakeInterpretationProposal(...)`

## Typed Intake Packet

The intake packet is carried through the same `buildAiStatePacket(...)` contract used by the rest of the AI runtime.

Shape:

```js
{
  version: "2026-04-v1",
  intent: "intake_interpretation",
  scope: {
    input: "Interpret this onboarding intake without writing canonical goal state."
  },
  intake: {
    rawGoalText: string,
    baselineContext: {
      primaryGoalKey: string,
      primaryGoalLabel: string,
      experienceLevel: string,
      fitnessLevel: string,
      startingFresh: boolean,
      currentBaseline: string,
      priorMemory: string[]
    },
    scheduleReality: {
      trainingDaysPerWeek: number,
      sessionLength: string,
      trainingLocation: string,
      scheduleNotes: string
    },
    equipmentAccessContext: {
      trainingLocation: string,
      equipment: string[],
      accessNotes: string
    },
    injuryConstraintContext: {
      injuryText: string,
      constraints: string[]
    },
    userProvidedConstraints: {
      timingConstraints: string[],
      appearanceConstraints: string[],
      additionalContext: string
    }
  },
  boundaries: {
    sourceOfTruth: "canonical_app_state",
    mutationPolicy: "acceptance_only",
    aiMay: ["explain", "summarize", "propose"],
    aiMayNot: ["directly_mutate_plan", "directly_mutate_logs", "be_source_of_truth"]
  }
}
```

This satisfies the intake-specific requirements while staying inside the same packet envelope as the rest of the runtime.

## Proposal-Only Intake Output

The intake runtime asks AI for JSON only.

Returned proposal shape:

```js
{
  interpretedGoalType: "performance|strength|body_comp|appearance|hybrid|general_fitness|re_entry",
  measurabilityTier: "fully_measurable|proxy_measurable|exploratory_fuzzy",
  suggestedMetrics: [
    { key: "metric_key", label: "Metric label", unit: "lb", kind: "primary|proxy" }
  ],
  timelineRealism: {
    status: "realistic|aggressive|unclear",
    summary: "short timeline realism assessment",
    suggestedHorizonWeeks: 12
  },
  detectedConflicts: ["short tradeoff"],
  missingClarifyingQuestions: ["short question"],
  coachSummary: "short interpretation-only intake summary"
}
```

The app sanitizes this proposal before using it for UI copy.

Important rule:

- the proposal is not canonical goal truth
- it is not allowed to write `goals`, `goalState`, or any other planning entity directly
- final goal state still comes from user-confirmed onboarding completion and deterministic mapping

## Runtime Flow

1. Onboarding collects typed answers.
2. The app builds `intakeContext` from those answers.
3. `runIntakeInterpretationRuntime(...)` sends the typed packet through the shared AI runtime.
4. AI returns JSON only.
5. The app sanitizes that JSON into a bounded intake proposal.
6. The UI renders interpretation copy from that proposal.
7. Onboarding completion still writes canonical state through the normal deterministic app path.

## What Changed In The UI

These onboarding flows now use the typed intake runtime:

- `OnboardingCoach`
- `OnboardingCoachLegacy`
- `OnboardingCoachLegacyFallback`

The old inline Anthropic intake calls and inline timeline prompt construction were removed from those flows.

## What Intake AI Now Shares With The Core AI Runtime

- one shared packet builder
- one shared intent/version envelope
- one shared proposal-only mutation policy
- one shared request layer
- one shared JSON parsing step
- one shared provenance model
- one shared rule that AI may interpret but may not become canonical truth

## Interpretation-Only Text Paths Still Outside The Typed Boundary

These still remain outside the shared typed packet runtime:

- strength adjustment notification copy in [`trainer-dashboard.jsx`](c:/Users/Peter/Documents/Personal_Trainer/src/trainer-dashboard.jsx)
- deterministic strength alert explanation helpers in [`trainer-dashboard.jsx`](c:/Users/Peter/Documents/Personal_Trainer/src/trainer-dashboard.jsx)
- nutrition assistant / meal-generation copy in [`trainer-dashboard.jsx`](c:/Users/Peter/Documents/Personal_Trainer/src/trainer-dashboard.jsx)

These are interpretation-only paths, but they do not yet run through the packet-scoped AI runtime.

## Boundary Rule

Intake AI may:

- interpret vague goal language
- classify measurability
- suggest metrics and proxies
- assess timeline realism
- surface tradeoffs
- suggest clarifying questions
- generate interpretation-only onboarding copy

Intake AI may not:

- write canonical goal state
- resolve a goal as true without user confirmation
- mutate planner inputs directly
- invent constraints not present in the typed packet
