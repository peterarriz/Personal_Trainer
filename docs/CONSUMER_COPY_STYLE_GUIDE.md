# FORMA Consumer Copy Style Guide

## Core standard

FORMA should sound like a premium coach speaking to one person.

- Write to `you`.
- Lead with what the person should do or expect.
- Explain the benefit in plain language.
- Prefer warmth and clarity over system precision.
- Never sound like the app is narrating its own planning engine.

## Banned language

Do not ship user-facing copy that uses internal or technical framing such as:

- `audit`, `reviewer`, `goal-driven default logic`, `needed now`
- `foundation week`, `bias`, `deterministic`, `canonical`, `provenance`
- `prescription` when `plan` or `session` says the same thing more naturally
- `actuals` when `what you did`, `results`, or `details` is clearer

## CTA verbs

Use short, direct verbs that sound confident and consumer-friendly.

- Prefer: `Save`, `Continue`, `Use`, `Edit`, `Change`, `Review`, `Start`, `Ask`, `See`
- Avoid: `Commit`, `Activate`, `Confirm change` unless legal or destructive
- For previews, prefer `See change` or `See what changes`
- For irreversible actions, say exactly what happens: `Delete account`, `Reset this device`
- Keep one primary verb per surface. Do not mix `Activate`, `Apply`, and `Confirm` for the same kind of action.

## Headings

- Use short sentence-case headings.
- Prefer a plain noun or a 2 to 5 word phrase over a full sentence.
- Avoid all-caps labels unless they are small supporting eyebrow text.
- A heading should tell the person where they are, not how the system thinks.

## Punctuation

- Ban em dashes everywhere.
- Use sentence case for buttons, labels, and helper copy.
- Keep exclamation points out unless there is a rare celebratory moment.
- Use colons only for short labels, not for dramatic emphasis.
- Prefer commas or short second sentences over stacked punctuation.

## Tone

- Calm, capable, and human.
- Speak like a coach, not an operator console.
- Be specific without sounding clinical.
- If the app is asking for detail, explain why it matters in everyday language.

## Explanation length

- Headlines: 2 to 6 words.
- CTA labels: 1 to 3 words.
- Helper lines: usually 1 sentence, occasionally 2.
- Body copy: say the main point first, then one useful consequence.
- If a sentence can lose 5 words without losing meaning, cut it.
- Default to one short sentence per block on first load.

## Microcopy

- Prefer everyday workout words like `what you did`, `details`, `plan`, and `session`.
- Avoid meta language like `actuals`, `prescription`, `deterministic`, or `canonical` in consumer UI.
- If a hint does not help the person choose or act right now, move it behind a reveal.

## Sync language

- Say `saved on this device`, `saved to your account`, `up to date`, or `needs attention`.
- Do not surface provider, cache, or transport language in normal product copy.
- Explain recovery states with reassurance first, mechanics second.

## Adaptation language

When the plan changes, explain it in this order:

1. What changed.
2. Why it changed.
3. What stays the same.

Preferred pattern:

- `Today shifts to a shorter session because recovery looks low. Your bigger goal stays the same.`

Avoid patterns like:

- `Deterministic preview accepted through gate.`
- `Adaptive bias was applied to the canonical plan.`

## Screen-level guardrails

- Today: orient the person quickly and keep action obvious.
- Program: explain the direction of the plan, not the machinery behind it.
- Log: describe what to record in everyday workout language.
- Nutrition: make food guidance sound usable, not analytical.
- Coach: keep recommendations clear, optional, and non-technical.
- Intake: explain setup in first-time-user language with no jargon.
- Settings: sound helpful and trustworthy, especially around sync and account actions.
