# Manual QA Run

## Run Info

- Date: 2026-04-16T01:18:32.829Z
- Environment: staging
- URL: https://staging.example
- Tester: [fill in tester]
- Release / branch: [fill in release or branch]
- QA pack: C:\Users\Peter\Documents\Personal_Trainer\docs\MANUAL_QA_RELEASE_PACK.md
- Artifact folder: C:\Users\Peter\Documents\Personal_Trainer\tmp\manual-qa-pack-release-gate\20260415-2018-staging

## Summary

- Overall result: [Pass / Pass with notes / Fail / Blocked]
- Blockers:
- Major issues:
- Minor issues:
- Notes:

## Device Matrix

| Device | Viewport | Status | Notes |
| --- | --- | --- | --- |
| Desktop | 1440 x 900 or larger |  |  |
| Laptop | 1280 x 800 or 1366 x 768 |  |  |
| Tablet portrait | 820 x 1180 |  |  |
| Tablet landscape | 1180 x 820 |  |  |
| Phone portrait | 390 x 844 or 393 x 852 |  |  |

## Browser Matrix

| Browser | Status | Notes |
| --- | --- | --- |
| Chrome stable |  |  |
| Edge stable |  |  |
| Safari / WebKit |  |  |
| Firefox stable |  |  |

## Theme Matrix

| Theme or mode | Status | Notes |
| --- | --- | --- |
| Dark |  |  |
| Light |  |  |
| System |  |  |
| Theme A |  |  |
| Theme B |  |  |
| Theme C |  |  |

## Adversarial User Matrix

Every matrix scenario must be exercised through:

1. account access
2. intake
3. first week
4. logging
5. plan change
6. degraded state

| Scenario | User story | Status | Artifacts | Notes |
| --- | --- | --- | --- | --- |
| AU-01 | Former athlete returning after 10 years off. |  |  |  |
| AU-02 | Morbidly obese beginner afraid of gyms. |  |  |  |
| AU-03 | Competitive swimmer with limited strength experience. |  |  |  |
| AU-04 | Recreational runner who needs strength support. |  |  |  |
| AU-05 | Busy parent with 20-minute windows. |  |  |  |
| AU-06 | Traveling consultant with hotel gyms only. |  |  |  |
| AU-07 | Home-gym user with bands and dumbbells only. |  |  |  |
| AU-08 | Lifters wanting aesthetic improvement and bench progress. |  |  |  |
| AU-09 | Marathon trainee who also wants to lose 15 pounds. |  |  |  |
| AU-10 | User with recurring Achilles pain. |  |  |  |
| AU-11 | User training around poor sleep and shift work. |  |  |  |
| AU-12 | User who hates calorie tracking. |  |  |  |
| AU-13 | User who wants general health but no hard target date. |  |  |  |
| AU-14 | User with three correlated goals and one conflicting goal. |  |  |  |
| AU-15 | User who signs in on phone, then laptop, then tablet. |  |  |  |
| AU-16 | User who deletes account and recreates it. |  |  |  |
| AU-17 | User who continues with local data, then later signs in. |  |  |  |
| AU-18 | User whose cloud sync times out for three sessions. |  |  |  |
| AU-19 | User who misses an entire week. |  |  |  |
| AU-20 | User who logs partial workouts only. |  |  |  |
| AU-21 | User who changes priorities mid-block. |  |  |  |
| AU-22 | User who adds a swim goal after a running plan already exists. |  |  |  |
| AU-23 | User who wants a custom goal the library does not cover. |  |  |  |
| AU-24 | User who never enters optional metrics. |  |  |  |
| AU-25 | User who enters wildly inconsistent metrics and needs correction. |  |  |  |
| AU-26 | User who trains only outdoors. |  |  |  |
| AU-27 | User with no pool access half the week. |  |  |  |
| AU-28 | User who wants strength and mobility but no bodybuilding language. |  |  |  |
| AU-29 | User who wants bodybuilding and hates endurance work. |  |  |  |
| AU-30 | User who wants aesthetics plus cardiovascular health. |  |  |  |
| AU-31 | User who only trains twice per week. |  |  |  |
| AU-32 | User who trains six days per week. |  |  |  |
| AU-33 | User who changes available equipment frequently. |  |  |  |
| AU-34 | User who cares deeply about theme and aesthetics. |  |  |  |
| AU-35 | User on light mode all the time. |  |  |  |
| AU-36 | User on dark mode all the time. |  |  |  |
| AU-37 | User with color-vision deficiency. |  |  |  |
| AU-38 | User on a low-end laptop with slow network. |  |  |  |
| AU-39 | User with intermittent mobile connectivity. |  |  |  |
| AU-40 | User who wants all data local-first. |  |  |  |
| AU-41 | User who wants coach help but never allows plan mutation. |  |  |  |
| AU-42 | User who frequently asks open-ended fitness questions. |  |  |  |
| AU-43 | User who accepts many coach plan changes. |  |  |  |
| AU-44 | User who distrusts AI and uses only guided options. |  |  |  |
| AU-45 | User who loves AI and writes everything in custom text. |  |  |  |
| AU-46 | User who wants goals without end dates. |  |  |  |
| AU-47 | User in injury-return rebuild mode. |  |  |  |
| AU-48 | User who starts conservative, then flips aggressive. |  |  |  |
| AU-49 | User who prints or exports screens regularly. |  |  |  |
| AU-50 | User who compares Today, Program, Log, and Coach for contradictions. |  |  |  |

## Release Gate

- Policy: Do not call the app release-ready on unit tests alone or on the synthetic lab alone.
- Scenario count required in the matrix: 50

| Gate | Requirement | Evidence type | Status | Notes |
| --- | --- | --- | --- | --- |
| RG-01 | clean auth lifecycle behavior | manual + automated |  |  |
| RG-02 | accessible account access screens | manual + automated |  |  |
| RG-03 | reduced intake click count | manual + automated |  |  |
| RG-04 | working delete-account behavior or honest environment-gated messaging | manual + automated |  |  |
| RG-05 | no cross-surface plan contradictions | manual + automated |  |  |
| RG-06 | no domain label leakage | manual + automated |  |  |
| RG-07 | coherent goals management and auditability | manual + automated |  |  |
| RG-08 | stable degraded-state handling | manual + automated |  |  |
| RG-09 | adversarial e2e pass | automated |  |  |
| RG-10 | expanded persona-lab pass | automated |  |  |
| RG-11 | manual browser/device/export pass | manual |  |  |

## Case Results

| Case | Area | Status | Severity | Artifacts | Notes |
| --- | --- | --- | --- | --- | --- |
| QA-00 | Preflight and shell |  |  |  |  |
| QA-01 | Appearance and theme distinctness |  |  |  |  |
| QA-02 | Auth entry, sign in, and local continue |  |  |  |  |
| QA-03 | Account lifecycle, sign out, and delete |  |  |  |  |
| QA-04 | Intake and first plan |  |  |  |  |
| QA-05 | Today, Program, and plan review |  |  |  |  |
| QA-06 | Coach |  |  |  |  |
| QA-07 | Logging |  |  |  |  |
| QA-08 | Nutrition |  |  |  |  |
| QA-09 | Settings: goals, baselines, programs, styles, and advanced |  |  |  |  |
| QA-10 | Sync and local resilience |  |  |  |  |
| QA-11 | Export, backup, restore, and destructive safety |  |  |  |  |
| QA-12 | Print preview and PDF |  |  |  |  |

## Export / PDF Files

| Artifact | Saved | Notes |
| --- | --- | --- |
| Today print preview PDF |  |  |
| Program print preview PDF |  |  |
| Log or review print preview PDF |  |  |
| Nutrition print preview PDF |  |  |
| Settings account print preview PDF |  |  |
| Backup export code capture |  |  |

## Defects

List every failure here with:

- case ID
- device + browser + theme
- exact steps
- expected vs actual
- artifact filename
- console or network notes
