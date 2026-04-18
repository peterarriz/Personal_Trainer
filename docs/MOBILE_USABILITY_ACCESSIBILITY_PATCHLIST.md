# FORMA Mobile Usability And Accessibility Patch List

## Priority 0

- Shared mobile shell resilience: add safe-area aware outer padding, scroll padding for sticky actions, 44px disclosure/tap target minimums, larger mobile control heights, and 16px minimum form text to prevent iOS zoom-on-focus.
- Motion accessibility: honor `prefers-reduced-motion` in the main app shell so entry fades, hover lifts, and pulse effects stop when the device asks for less motion.
- Light-mode readability on high-frequency surfaces: remove dark-mode-only treatment from Today, Log, and saved history panels so live copy keeps readable contrast in both light and dark themes.
- Screen-reader repair on primary logging flows: give Log and quick-log inputs explicit accessible names instead of relying on placeholders.

## Priority 1

- Thumb reach and navigation: the top tab strip is now easier to tap, but it still lives high in the shell. A future pass should test whether a bottom-safe primary nav or per-surface jump bar improves one-handed reach.
- Token coverage outside core daily flows: Nutrition, Coach, and some deeper Settings disclosures still use more hard-coded color values than ideal. They should move onto the same consumer surface tokens used in Today, Log, and history.
- Dynamic type scaling beyond the shell: the current pass improves control sizing and text scaling on small phones, but some legacy microcopy still uses tiny literal `rem` values that should be normalized onto shared type tokens.

## Fixed In This Pass

- Safe areas and sticky-save clearance.
- Tap target sizing for buttons, tabs, and disclosure rows.
- Mobile input font sizing and focus scroll clearance.
- Reduced-motion handling in the main shell.
- Today and Log light-mode contrast.
- Saved day review and saved week story contrast.
- Accessible names for the most common logging and restore fields.

