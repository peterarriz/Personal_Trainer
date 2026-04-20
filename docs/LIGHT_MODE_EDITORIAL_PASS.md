# Light Mode Editorial Pass

Visual review lives in [docs/codex-audits/light-mode-editorial-pass.html](./codex-audits/light-mode-editorial-pass.html).

## Goal

Produce a real light-mode direction for `Today`, `Program`, `Log`, `Intake`, and `Coach` that feels authored and premium.

This is not a palette inversion.

The light pass should establish:

- paper-white canvas, not browser white
- ink-black type, not gray mush
- disciplined accent handling
- intentional photography treatment
- lighter but still premium card weight
- a clear relationship to the shipped dark direction

## Shared light-mode direction

### Canvas

- Base canvas: warm paper white
- Suggested family: `#f7f3eb` to `#fbf8f2`
- Use soft tonal shifts and subtle paper warmth instead of flat white slabs

### Type

- Main text: near-black ink, not desaturated navy
- Suggested family: `#17181a` for headlines, `#2d2a26` for body
- Serif display moments earn their keep more in light mode than in dark mode

### Accent handling

- One accent family per screen state
- Accent is for:
  - current status
  - primary action
  - one high-value chip or callout
- Accent is not for:
  - full-screen washes
  - multiple competing panels
  - decorative gradients behind whole surfaces

### Photography treatment

- Use monochrome or duotone athlete photography, not literal stock gym imagery
- Crops should feel editorial:
  - shoulder, hands, bar knurling, stride detail, face partially obscured
- Let photography sit behind or beside the hero, never behind the entire screen
- Add soft paper fade and grain so the image feels printed into the surface rather than pasted on top
- Today and Coach earn photography most often
- Program and Log stay mostly type-led
- Intake should use photography sparingly, if at all

### Card weight

- In dark mode, cards carry hierarchy through glow and depth
- In light mode, cards carry hierarchy through border, spacing, and paper layering
- Primary cards:
  - 1px warm border
  - soft 10 to 18px shadow
  - visible internal padding
- Secondary cards:
  - almost flat
  - rely on subtle background shift more than shadow

## Surface pass

### Today

Dark direction:

- punchier athletic focus
- sharp session contrast
- stronger action chip and status-led feel

Light editorial pass:

- treat Today like a morning sheet from a premium trainer
- hero gets one cropped monochrome training image
- session instructions sit on cream stock with strong black type
- accent appears once in the current-session chip and primary CTA

### Program

Dark direction:

- technical block view
- stronger sense of control room

Light editorial pass:

- treat Program like a printed training block review
- trajectory ladder reads like annotated periodization, not software chrome
- low saturation, strong type, almost no glow

### Log

Dark direction:

- operational and efficient
- high-contrast execution surface

Light editorial pass:

- treat Log like an elite training ledger
- actuals feel tabular and calm
- mono numerics become more important than saturated fills
- save action should feel deliberate, not glossy

### Intake

Dark direction:

- premium draft builder
- summary rail reads like a confident floating console

Light editorial pass:

- treat Intake like an editorial intake folio
- forms feel quieter and more human
- the plan-shape preview becomes pinned paper, not a dark status module
- exact users see a cleaner runway; fuzzy users see a calmer promise

### Coach

Dark direction:

- decision tool
- bounded adjustment system

Light editorial pass:

- treat Coach like a private coaching memo
- recommendation and preview cards feel like marked-up plan notes
- photography can show up as a restrained editorial plate beside the hero
- commit surfaces should feel serious and irreversible, not flashy

## Side-by-side reading

The dark direction should continue to feel:

- athletic
- controlled
- more execution-forward

The light direction should feel:

- editorial
- calmer
- more legible for longer reads
- more premium in planning and explanation-heavy moments

## Decision

`FORMA is theme-dual.`

Not because it should act like two different brands, but because the product genuinely benefits from two different reading conditions:

- dark mode is stronger for execution-time surfaces like `Today` and `Log`
- light mode is stronger for reading-heavy surfaces like `Program`, `Intake`, and `Coach`

The stance is:

- dark remains the launch-default signature
- light becomes a first-class editorial counterpart
- both modes must share the same hierarchy, typography, and restraint
- the difference should be material, but never feel like two separate products

If FORMA had to choose only one direction, the better single stance would still be dark for launch identity. But after this pass, light is too credible to remain a fallback or accessibility-only mode.

## What must stay consistent across both modes

- one dominant hero per screen
- one clear primary action
- restrained accent usage
- no gamified visual language
- no dashboard clutter
- the same coach voice and card hierarchy

## Verification

- Visual review artifact rendered from `docs/codex-audits/light-mode-editorial-pass.html`
