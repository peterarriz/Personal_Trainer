# Manual QA Release Pack

Use this before release candidates and before any staging signoff. This is the brutal, repeatable manual pass for layout, readability, export weirdness, and device-specific regressions that automation often misses.

Use `docs/MANUAL_SMOKE_TEST_CHECKLIST.md` only for fast between-wave smoke checks. This pack is the slower pre-release gate.

For export coverage, treat both product backup/export flows and browser-native `Print` / `Save as PDF` previews as release-signoff surfaces.

Run this pack together with [ADVERSARIAL_USER_TEST_MATRIX_AND_RELEASE_GATE.md](</c:/Users/Peter/Documents/Personal_Trainer/docs/ADVERSARIAL_USER_TEST_MATRIX_AND_RELEASE_GATE.md:1>). The worksheet generator now includes both the normal release cases and the 50-scenario adversarial matrix so the pre-release pass cannot ignore them.

## Quick Start

1. Run `npm run build`.
2. Launch the app locally with `npm run dev` or pick the staging URL you want to certify.
3. Generate a worksheet with `npm run qa:manual-pack -- --env local --url http://localhost:3000`.
4. Store screenshots, PDFs, and notes in the generated artifact folder.
5. Mark every case as `Pass`, `Pass with notes`, `Fail`, `Blocked`, or `N/A`.

## Pass / Fail Rubric

### Case status

| Status | Meaning |
| --- | --- |
| `Pass` | The flow worked cleanly with no trust issue, layout issue, or export problem. |
| `Pass with notes` | The flow worked, but there is a minor polish issue that does not block release. |
| `Fail` | The flow completed incorrectly, looked unprofessional, or created user doubt. |
| `Blocked` | The flow could not be executed because the environment, account state, or device setup was not ready. |
| `N/A` | Not applicable for this environment or release slice. |

### Bug severity

| Severity | Release meaning |
| --- | --- |
| `Blocker` | Data loss, dead end, unreadable primary action, auth trap, export/restore failure, delete-account failure in a supported environment, or catastrophic layout overlap/clipping on a supported device. |
| `Major` | Contradictory state, broken hierarchy, missing key content in print/PDF, inaccessible contrast, or a supported device/browser layout that looks obviously unprofessional. |
| `Minor` | Awkward spacing, copy roughness, or small visual defects that do not block understanding or task completion. |
| `Note` | Worth tracking, but not a defect. |

### Artifact rule

Every `Fail` or `Blocked` result must include:

- screenshot or screen recording
- device + browser + theme + viewport
- exact page or tab
- exact action taken
- expected vs actual
- console/network note if relevant
- PDF or print-preview capture if the issue involves export or printing

## Device Matrix

| Device class | Target viewport | Required focus |
| --- | --- | --- |
| Desktop | `1440 x 900` or larger | Appearance, Program week review, Settings density, print preview, export/restore, delete-account flow |
| Laptop | `1280 x 800` or `1366 x 768` | Auth, intake, Today, Program, Coach, Log, Nutrition, Settings, export and backup copy readability |
| Tablet portrait | `820 x 1180` | Program inline detail, Settings sections, theme preview cards, nutrition weekly view, coach readability |
| Tablet landscape | `1180 x 820` | Split-pane or adjacent detail surfaces, week review, settings layout density |
| Phone portrait | `390 x 844` or `393 x 852` | Auth, local continue, intake, Today, Log, Coach, Nutrition, Settings account and appearance sections |

Minimum release signoff:

- laptop and phone on every release
- desktop for export/print-preview checks
- tablet on any release that touches Program, Settings, or theme/layout code

## Browser Matrix

| Browser | Priority | Required use |
| --- | --- | --- |
| Chrome stable | Required | Full pack, print preview, Save as PDF, export/restore, theme switching |
| Edge stable | Required on Windows | Appearance, auth, Settings, export/print preview |
| Safari / WebKit | Required when certifying iPhone or iPad layouts | Auth, intake, Today, Program, Settings, theme switching |
| Firefox stable | Recommended release-candidate pass | Layout sanity, theme switching, print-preview spot check |

Minimum release signoff:

- one Chromium browser
- one Microsoft browser on Windows
- one WebKit browser for mobile/tablet certification

## Theme Matrix

Run these checks at minimum:

- `Dark`
- `Light`
- `System`
- at least three distinct curated themes, including one light-leaning and one high-contrast or high-energy theme

Theme pass criteria:

- no unreadable primary, secondary, or tertiary action
- no washed-out `Continue with local data` or backup/export controls
- no overlap or clipping in Appearance preview cards
- no invisible focus ring, selected state, or disabled state

## Test Data Prep

Prepare these before the full run:

- one fresh email account for signup
- one existing signed-in account with a built plan
- one account or environment where delete-account is configured
- one intentionally unconfigured delete-account environment if you want to validate diagnostics
- one backup code generated from `Settings`
- one logged workout day and one nutrition actual entry

## Adversarial Matrix Rule

In addition to the standard release cases below, the full release pass must cover the adversarial user matrix in [ADVERSARIAL_USER_TEST_MATRIX_AND_RELEASE_GATE.md](</c:/Users/Peter/Documents/Personal_Trainer/docs/ADVERSARIAL_USER_TEST_MATRIX_AND_RELEASE_GATE.md:1>).

Every matrix scenario must pass through:

1. account access
2. intake
3. first week
4. logging
5. at least one plan change
6. at least one degraded state

Do not mark the release ready if the matrix is skipped or partially sampled without explicit signoff.

## Release Cases

### QA-00 Preflight And Shell

Run on: laptop, Chrome, Dark and Light

- Open the app from a hard refresh.
- Confirm no blank screen, crash loop, or infinite loading state.
- Confirm the main shell, tabs, and initial sync state settle quickly.
- Open devtools console and note any repeated errors before interacting.

Pass if:

- the app boots cleanly
- there is no layout jump that hides the main navigation
- the initial sync/account state reads calmly rather than noisily

### QA-01 Appearance And Theme Distinctness

Run on: desktop, laptop, tablet; Chrome and Edge; Dark, Light, System; at least three themes

- Open `Settings > Appearance`.
- Cycle through at least three visually distinct themes.
- Switch `Dark`, `Light`, and `System`.
- Check preview cards for overlap, clipping, unreadable labels, or truncated theme names.
- Confirm theme switching is fast and visually complete across cards, headers, panels, and buttons.
- Confirm the Appearance layout does not collapse awkwardly on tablet width.

Pass if:

- themes feel materially different, not just accent swaps
- preview cards remain fully readable
- no controls overlap or clip

### QA-02 Auth Entry, Sign In, And Local Continue

Run on: phone and laptop; Chrome plus one WebKit browser; Dark and Light

- Open the auth screen in a signed-out state.
- Check both `Sign in` and `Create account` modes.
- Confirm the auth hierarchy is strong and the screen feels like the rest of the app.
- Confirm `Continue with local data` is readable, obviously secondary, and clearly explained.
- Create a fresh account if the environment supports it.
- Sign out and sign back in.
- Confirm the local-only path still works and does not look like a broken fallback.

Pass if:

- no unreadable buttons or labels appear
- sign-in and create-account look equally intentional
- local/cloud choice is understandable at a glance

### QA-03 Account Lifecycle, Sign Out, And Delete

Run on: laptop and desktop; Chrome and Edge; Dark and Light

- Open `Settings > Account`.
- Confirm `Reload cloud data`, `Sign out`, `Reset this device`, and `Delete account` read as distinct actions.
- Trigger `Sign out` and confirm the app returns to auth quickly and predictably.
- In a configured environment, run the full delete-account flow.
- In an intentionally unconfigured environment, confirm the UI surfaces admin-grade diagnostics before a dead end.
- Confirm the delete flow still offers `Export first, then continue`.

Pass if:

- sign-out is fast and obvious
- supported delete works end to end
- unsupported delete fails early with a clear explanation

### QA-04 Intake And First Plan

Run on: phone and laptop; Chrome plus one WebKit browser; Dark and Light

- Start from a fresh user or reset state.
- Confirm intake starts with goal type selection, not faux-chat filler.
- Run one common-goal flow such as running, strength, fat loss, swimming, or general fitness.
- Run one custom-goal flow.
- Skip optional metrics once and confirm the first plan still builds cleanly.
- Confirm the number of `Continue` clicks feels low and the flow stays on one coherent screen where expected.

Pass if:

- copy is sharp, minimal, and informative
- the flow does not feel like a fake assistant transcript
- the first plan builds without optional metrics

### QA-05 Today, Program, And Plan Review

Run on: laptop, tablet, and desktop; Chrome and Edge; Dark and Light

- Open `Today` and note the prescribed session title, purpose, and reason.
- Open `Program` for the same date and confirm the same day prescription and rationale appear.
- Click multiple week days and confirm details stay inline or in the adjacent anchored panel, not elsewhere on the page.
- Open review surfaces and confirm the story is `what was planned`, `what happened`, `what changes next`, and `why that matters`.
- Confirm raw revision count language is hidden from the main path.

Pass if:

- selected day details remain spatially anchored
- Today and Program describe the same day
- review language feels stable, not frantic

### QA-06 Coach

Run on: phone and laptop; Chrome; Dark and Light

- Open `Coach`.
- Trigger at least two different prompts or quick actions.
- Confirm responses are readable and visually contained on smaller screens.
- Confirm any action proposal is explicit and does not silently mutate plan or settings before acceptance.
- Confirm coach guidance matches the current prescribed day and current goal priorities.

Pass if:

- coach reads as useful guidance, not a settings console
- no contradictions appear versus Today or Program

### QA-07 Logging

Run on: phone and laptop; Chrome plus one secondary browser; Dark and Light

- Open `Log` on a day with a prescription.
- Confirm the planned session and the actual logging surface match.
- Use quick logging and a fuller logging path if available.
- Save a log and reload the page.
- Confirm the log, review state, and any change summary remain consistent after reload.

Pass if:

- logging is fast and obvious
- planned versus actual language stays clear
- nothing disappears on reload

### QA-08 Nutrition

Run on: phone, tablet, and laptop; Chrome; Dark and Light

- Open `Nutrition`.
- Confirm today's targets are readable and distinct from actuals.
- Save or edit a nutrition actual.
- Open weekly nutrition planning and grocery support.
- Confirm the weekly view remains visible and readable on tablet.
- Confirm nutrition messaging matches the same day type shown elsewhere in the app.

Pass if:

- prescription and actual stay separate
- weekly planning or grocery surfaces do not vanish
- no theme makes targets or buttons unreadable

### QA-09 Settings: Goals, Baselines, Programs, Styles, And Advanced

Run on: laptop and tablet; Chrome and Edge; Dark and Light

- Open `Settings`.
- Confirm the hierarchy is clear: `Goals`, `Baselines`, `Programs & styles`, `Appearance`, `Advanced`.
- Add or edit a goal, reorder priorities, and confirm the preview/apply flow is intelligible.
- Check that baseline editing is separate from goal editing.
- Confirm plain-English experimental or advanced inputs are demoted away from the main path.
- Open `Advanced` and confirm diagnostics feel admin-grade rather than user-hostile.

Pass if:

- there is one authoritative goals surface
- settings do not feel cluttered or duplicated
- dense sections remain readable at tablet width

### QA-10 Sync And Local Resilience

Run on: laptop; Chrome; Dark and Light

- Simulate offline or transient-failure conditions if possible.
- Confirm sync states read as `synced`, `syncing`, `retrying`, `offline-local`, `stale-cloud`, `conflict-needs-resolution`, or `fatal error`.
- Confirm banners or chips appear only when action is needed.
- Confirm the app still feels intentional while local-only.
- Confirm auth and settings copy match the current sync state.

Pass if:

- sync language is calm and consistent
- no contradictory cloud/local messages appear across surfaces

### QA-11 Export, Backup, Restore, And Destructive Safety

Run on: desktop and laptop; Chrome and Edge; Light and Dark

- Open `Settings > Account`.
- Use `Export my data`.
- Use `Copy backup` and confirm the backup code is complete and readable.
- Paste the backup code into the restore area and confirm validation messaging is clear.
- If safe in the environment, complete a restore round-trip.
- Confirm the delete-account flow still offers an export-first path before the destructive action.
- Spot-check any manual device-import areas for textarea clipping or unreadable helper text.

Pass if:

- export is easy to find and clearly separate from delete/reset
- backup/restore controls stay readable on laptop width
- destructive paths do not trap the user before export

### QA-12 Print Preview And PDF

Run on: desktop or laptop; Chrome plus one second desktop browser

Use browser `Print` or `Save as PDF` for the following:

- `Today`
- `Program` with a week day selected and details expanded
- `Log` or day review
- `Nutrition` weekly planning or grocery view
- `Settings > Account` after export/backup controls are visible

Check each preview for:

- clipped cards
- overlapping text or buttons
- missing selected-day detail
- washed-out text on light surfaces
- page breaks that split a workout or review block into nonsense fragments
- missing headings, missing rationale, or missing action labels

Pass if:

- the content remains readable in print preview
- the PDF can be saved without obvious corruption or missing content

## Exit Criteria

The pack is release-ready only if:

- every required case is `Pass` or `Pass with notes`
- no `Blocker` or `Major` issue remains open without explicit signoff
- export/restore and print-preview checks are complete on at least one supported desktop browser
- phone and laptop runs are complete
- theme checks cover Dark, Light, System, and at least three curated themes

## Suggested Artifacts Folder

Keep these per run:

- `screenshots/`
- `videos/`
- `pdf/`
- `notes.md`

Use a stable naming pattern such as:

- `QA-02-auth-phone-dark-chrome.png`
- `QA-11-export-laptop-light-edge.png`
- `QA-12-program-print-preview-chrome.pdf`
