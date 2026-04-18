# FORMA Visual System Checklist

Use the Goals screen as the reference bar for clarity, spacing, and component rhythm.

## Core Tokens

- Spacing scale: `--space-1` through `--space-6`
- Radius scale: `--radius-sm`, `--radius-md`, `--radius-lg`
- Control heights: `--control-height`, `--control-height-sm`
- Pill height: `--pill-height`
- Divider weight: `--divider-weight`
- Type scale: `--type-label`, `--type-meta`, `--type-body`, `--type-title`

## Cards

- Default panel uses one border weight and one radius family.
- Major surfaces use `var(--radius-md)`.
- Subpanels use `var(--radius-sm)`.
- Cards should group a single job, not stack decorative wrappers.
- Hero cards can feel stronger, but standard utility panels should stay quieter.

## Badges, Chips, And Pills

- Use pills only for short status or classification labels.
- Pills should be vertically centered with a fixed minimum height.
- Use neutral pills for context, stronger pills for state, and avoid free-floating decorative bubbles.
- Uppercase only for compact system labels like `Current`, `Planned`, or `Priority 1`.
- If a pill does not help a person decide or understand, remove it.

## Buttons And CTA Hierarchy

- `btn-primary` is reserved for the main commit action on a surface.
- `btn-selected` is for chosen states, tabs, toggles, and filters.
- Standard `btn` is for secondary actions and reversible utility actions.
- Never use the primary style just to show selection.
- Keep one clear primary CTA per panel when possible.

## Inputs And Toggles

- Inputs, selects, and textareas share one border weight, radius, focus ring, and height family.
- Checkboxes and radios should align to the text baseline and use the accent color.
- Helper text should stay short and sit directly under the field label.
- Toggle groups should wrap cleanly and keep the same selected treatment as other choice controls.

## Dividers, Headers, And Spacing Rhythm

- Section shells should use one top divider and consistent padding above the section.
- Interior dividers should separate jobs, not every line item.
- Headers follow one rhythm: title, short explanation, then content.
- Use tighter spacing inside cards and larger spacing between cards.
- Avoid one-off padding numbers unless the surface has a strong reason.

## Consumer Guardrails

- Status language should read like a product, not a monitoring console.
- Remove decorative state bubbles that add style but no meaning.
- Keep visual emphasis on what the user should do next.
- Match selected, warning, success, and neutral treatments across Today, Program, Log, Nutrition, Coach, Intake, and Settings.
