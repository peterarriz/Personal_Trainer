# Settings Decomposition Spec

## Goal

Settings remains the management home, but it no longer behaves like one long mixed admin page.

## Surface Map

- `Account`
  - signed-in identity
  - logout
  - delete account
  - export / backup / restore / reset
- `Profile`
  - display name
  - timezone
  - birth year
  - height / weight
  - units
  - years of consistent training
- `Plan Management`
  - current basis
  - programs and styles
  - goal changes
  - metrics / baselines
- `Preferences`
  - default environment
  - weekly check-in day
  - training preference
  - appearance
  - notifications
- `Advanced`
  - coach memory/setup
  - provider key
  - integrations
  - manual imports

## Behavior Rules

- Settings opens on `Account` by default unless another surface is explicitly deep-linked.
- Program deep-links:
  - `plan` -> opens `Plan Management`
  - `metrics` -> opens `Plan Management` with metrics expanded
- Dangerous actions stay in `Account`, not mixed with plan-management controls.
- Advanced/provider setup stays off the main Coach surface.

## UX Intent

- Program remains read-first.
- Settings owns management tasks that would otherwise clutter Program.
- Discoverability of Programs/Styles and Metrics/Baselines must not depend on scrolling through unrelated account or integration controls.

## Implemented In

- `src/trainer-dashboard.jsx`
- `e2e/mobile-surfaces.spec.js`
- `docs/MASTER_SPEC.md`
