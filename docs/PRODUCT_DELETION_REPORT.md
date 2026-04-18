# FORMA Product Deletion Report

## Goal
Delete default-visible UI that does not help the user decide what to do on the current screen.

Decision labels:

- `keep`: core value, already focused
- `simplify`: keep the block, but reduce copy or controls
- `move`: keep the function, but move it lower or behind a reveal
- `merge`: combine with another visible block
- `delete`: remove from the default product surface

First-pass implementation status:

- `done`: removed or simplified in code in this pass
- `next`: identified, not yet changed in this pass

## Today

| Element | Type | Decision | Why | First pass |
| --- | --- | --- | --- | --- |
| Post-intake ready card | Card | simplify | Valuable for first run, but still large | next |
| Today hero session card | Card | keep | Core answer to what to do today | existing |
| Main CTA | Control | keep | Core action for the screen | existing |
| Secondary CTA | Control | keep | Useful secondary action without clutter | existing |
| Quiet status row | Secondary block | keep | Needed when save or sync state matters | existing |
| Adaptation note | Card | keep | Answers what changed | existing |
| Quick log launcher | Control | keep | Fast path into logging | existing |
| Quick log body | Secondary block | keep | Hidden by default and action-oriented | existing |
| Why this changed drawer | Secondary block | simplify | Useful, but it repeated plan basis and support narration | done |
| Plan basis line inside Why this changed | Paragraph | delete | Internal logic narration | done |
| Support lines inside Why this changed | Paragraph group | delete | Too much secondary explanation | done |
| Tomorrow line inside Why this changed | Paragraph | keep | Lightweight and useful | existing |
| Full session details drawer | Secondary block | keep | Useful on demand | existing |
| Adjust today drawer | Secondary block | keep | Real utility, already collapsed | existing |
| Older "Why this setup" plan basis line | Paragraph | delete | Duplicate rationale | done |

## Program

| Element | Type | Decision | Why | First pass |
| --- | --- | --- | --- | --- |
| Program hero | Card | keep | Sets current week and trust quickly | existing |
| Current week tile | Card | keep | Core orientation | existing |
| Current day tile | Card | keep | Core orientation | existing |
| Building over time tile | Card | keep | Core long-view summary | existing |
| Sync chip | Chip | keep | Quiet until it matters | existing |
| On track / updated chip | Chip | keep | Useful high-level state | existing |
| Trust strip | Secondary block | delete | Repeated what the rest of the hero already said | done |
| Edit goals and plan button | Control | delete | Generic management CTA that distracted from reading the plan | done |
| Fix plan inputs here button | Control | keep | Inline repair solves a blocker on this screen | existing |
| Tighten goal details button | Control | keep | Inline repair solves a blocker on this screen | existing |
| Inline repair panel | Card | keep | Valuable when something is missing | existing |
| 15-week roadmap | Card | keep | Core planning value | existing |
| Roadmap intro line | Paragraph | simplify | Useful but should stay short | existing |
| Roadmap goal highlights | Card row | delete | Duplicated goal tracking and roadmap meaning | done |
| Phase strip | Card row | keep | Good at-a-glance structure | existing |
| Roadmap week cards | Card grid | keep | Core long-view plan | existing |
| This week section | Card | keep | Serious users need visible current-week structure | existing |
| Future weeks section | Card | keep | Serious users need visible upcoming weeks | existing |
| Week review card | Card | delete | Read like recap theater instead of planning value | done |
| Goal tracking section | Card | simplify | High-value, but still verbose | next |

## Log

| Element | Type | Decision | Why | First pass |
| --- | --- | --- | --- | --- |
| Confirm today card | Card | keep | Fastest path into logging | existing |
| Planned session block | Card | keep | Needed to confirm against the plan | existing |
| Detailed entry form | Card | keep | Core logging surface | existing |
| Full session details drawer | Secondary block | keep | Good on demand | existing |
| Exercise actuals expansion | Secondary block | keep | Valuable without forcing all users through it | existing |
| Notes, feel, and context drawer | Secondary block | keep | Useful but not default-visible | existing |
| Add quick extras | Secondary block | keep | Advanced action at the bottom is correct | existing |
| Sticky save footer | Control | keep | Critical mobile utility | existing |
| Saved day review | Secondary block | keep | Meaningful history tied to the logged day | existing |
| Recent history | Secondary block | keep | Useful lightweight recall | existing |
| Saved week stories | Secondary block | delete | History layer with low daily value and repeated narrative | done |

## Nutrition

| Element | Type | Decision | Why | First pass |
| --- | --- | --- | --- | --- |
| Daily targets card | Card | keep | Core top-layer value | existing |
| Day lane chip | Chip | keep | Clear training context | existing |
| Hero title | Paragraph | keep | Good headline | existing |
| Hero supporting line | Paragraph | keep | Short and useful | existing |
| Canonical session label | Paragraph | keep | Helps align nutrition to training day | existing |
| Target change summary | Paragraph | delete | Secondary explanation that cluttered the hero | done |
| Canonical reason line | Paragraph | delete | Too much rationale in the top layer | done |
| Save banner | Secondary block | keep | Useful when visible | existing |
| Quiet sync chip | Chip | keep | Quiet state handling | existing |
| Macro target boxes | Card row | keep | Core daily guidance | existing |
| Target bias line | Paragraph | simplify | Useful, but should stay extremely short | next |
| Comparison pill | Chip | simplify | Useful only when it adds a clear change signal | next |
| Compliance line | Paragraph | move | Better lower on the page | next |
| Meal strategy | Card | keep | Core action layer | existing |
| Quick log | Card | keep | Core action layer | existing |
| Hydration | Card | keep | Core action layer | existing |
| Key adjustments | Card | keep | High-value coaching layer | existing |
| Fueling details | Secondary block | keep | Properly collapsed | existing |
| Week-ahead support | Secondary block | delete | Useful ideas, but too secondary for default Nutrition | done |
| Meal anchors | Secondary block | keep | Useful lower in the surface | existing |
| Supplement plan | Secondary block | keep | Useful lower in the surface | existing |

## Coach

| Element | Type | Decision | Why | First pass |
| --- | --- | --- | --- | --- |
| Coach hero | Card | keep | Good entry point if concise | existing |
| Hero title line | Paragraph | keep | Premium and short | existing |
| Canonical session label | Paragraph | keep | Useful context | existing |
| Canonical reason line | Paragraph | keep | One short reason is enough | existing |
| Extra plan line | Paragraph | delete | Repeated the recommendation context | done |
| "Nothing changes until you accept it" line | Paragraph | delete | Redundant once the interaction pattern is clear | done |
| Coach mode chip | Chip | delete | Internal-feeling meta label | done |
| Coach trust chip | Chip | delete | Internal confidence framing | done |
| Live fidelity chip | Chip | delete | Planning-engine narration | done |
| Quiet sync chip | Chip | keep | Quiet state handling | existing |
| Mode switcher | Control group | keep | Clear navigation across Today, Week, and Ask Coach | existing |
| Recommendation cards | Card | keep | Core Coach value | existing |
| More detail drawer | Secondary block | keep | Good place for deeper rationale | existing |
| Last accepted action card | Secondary block | delete | History clutter, not needed in the main Coach view | done |

## Intake

| Element | Type | Decision | Why | First pass |
| --- | --- | --- | --- | --- |
| Intake shell title and subtitle | Header | keep | Clear orientation | existing |
| "How setup works" helper | Secondary block | delete | Extra explanation before action | done |
| Stage pills | Chip row | keep | Useful progress orientation | existing |
| Structured goal stage content | Card | keep | Core intake value | existing |
| Featured goal examples | Card row | keep | Fast selection path | existing |
| Goal stack | Card stack | keep | Core priority setting | existing |
| Goal lock card | Card | keep | Important confirmation | existing |
| Goal library | Card | keep | Needed when featured examples miss | existing |
| Intake summary rail | Secondary rail | delete | Side narration duplicated what the structured screen already showed | done |
| Sticky footer bar | Control bar | keep | Clear continue or build action | existing |

## Settings

| Element | Type | Decision | Why | First pass |
| --- | --- | --- | --- | --- |
| Surface nav buttons | Control group | simplify | Good navigation, but helper copy made it feel like a control panel | done |
| Surface nav helper line | Paragraph | delete | Duplicated label meaning | done |
| Goals management panel | Card | keep | Core settings function | existing |
| Goals impact preview | Card | keep | Useful before save | existing |
| Goals lifecycle panel | Card | move | Useful, but not a top-level default block | done |
| Goals recent changes | Secondary block | keep | Fine as a disclosure | existing |
| Account and sync header | Card header | keep | Clear account state | existing |
| Lifecycle summary cards | Card row | delete | Meta account status repeated by the section and sync banner | done |
| Account action cards | Card row | keep | Core account actions | existing |
| Sync diagnostics | Secondary block | move | Keep behind the explicit internal gate only | existing |

## First-pass deletions implemented

- Intake summary rail
- Intake helper explainer
- Today plan-basis and support narration in the main "Why this changed" layer
- Program trust strip
- Program generic management CTA
- Program roadmap goal-highlights row
- Program week-review card
- Log saved week stories
- Nutrition target-change and extra reason lines in the hero
- Nutrition week-ahead support
- Coach meta pills and extra hero narration
- Coach last-accepted history card
- Settings nav helper copy
- Settings lifecycle summary cards
- Settings goals lifecycle moved behind a disclosure

## Highest-value next deletions

- Trim the post-intake success state so it behaves more like a short launch card than a mini onboarding recap.
- Compress Program goal tracking into fewer lines per goal card.
- Trim Nutrition target bias and compliance lines so the hero stays purely action-oriented.
- Review Settings advanced and programs surfaces for any remaining internal-facing explainer copy.
