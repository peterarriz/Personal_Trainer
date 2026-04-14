# Theme System And Curated Identities Spec

## Goal

The app exposes 10 curated themes. They must be materially distinct, accessible, and believable as product identities rather than duplicate labels on nearly identical palettes.

Primary implementation:

- `src/services/brand-theme-service.js`
- `tests/brand-theme-service.test.js`

## Curated Theme Set

- Atlas
- Maison
- Circuit
- Harbor
- Ember
- Solstice
- Fieldhouse
- Slate
- Redwood
- Pulse

## Product Rules

- `System` must not collapse into raw dark mode.
- Light mode must feel premium and comfortable, not pure white.
- Accent, background, surface, border, focus, and CTA tokens must all change with the theme.
- Theme differences must remain visible in both dark and light variants.
- Duplicate-feeling options should be removed rather than padded.

## Required Token Coverage

Every theme defines:

- app background
- layered surfaces
- text hierarchy
- accent and accent hover
- CTA background and border
- focus ring
- badge colors
- card borders and shadows
- input background states
- tab states
- brand mark treatment

## Verification

Automated checks enforce:

- 10 theme ids exist
- 10 distinct dark token signatures exist
- 10 distinct light token signatures exist
- Atlas and Circuit remain materially distinct

See:

- `tests/brand-theme-service.test.js`
