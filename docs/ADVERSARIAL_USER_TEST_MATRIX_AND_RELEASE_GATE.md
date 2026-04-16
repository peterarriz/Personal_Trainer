# Adversarial User Test Matrix And Release Gate

This is the product-level release contract for adversarial user coverage. The machine-readable source of truth lives in [release-gate-contract.js](</c:/Users/Peter/Documents/Personal_Trainer/src/services/release-gate-contract.js:1>).

Use this alongside:

- [MANUAL_QA_RELEASE_PACK.md](</c:/Users/Peter/Documents/Personal_Trainer/docs/MANUAL_QA_RELEASE_PACK.md:1>)
- [SYNTHETIC_ATHLETE_RELEASE_GATE_SPEC.md](</c:/Users/Peter/Documents/Personal_Trainer/docs/SYNTHETIC_ATHLETE_RELEASE_GATE_SPEC.md:1>)
- `npm run qa:manual-pack -- --env staging --url https://your-staging-url`

## Required Flow Per Scenario

Every adversarial user story must be exercised through:

1. account access
2. intake
3. first week
4. logging
5. plan change
6. degraded state

## Scenario Matrix

| ID | Scenario |
| --- | --- |
| `AU-01` | Former athlete returning after 10 years off. |
| `AU-02` | Morbidly obese beginner afraid of gyms. |
| `AU-03` | Competitive swimmer with limited strength experience. |
| `AU-04` | Recreational runner who needs strength support. |
| `AU-05` | Busy parent with 20-minute windows. |
| `AU-06` | Traveling consultant with hotel gyms only. |
| `AU-07` | Home-gym user with bands and dumbbells only. |
| `AU-08` | Lifters wanting aesthetic improvement and bench progress. |
| `AU-09` | Marathon trainee who also wants to lose 15 pounds. |
| `AU-10` | User with recurring Achilles pain. |
| `AU-11` | User training around poor sleep and shift work. |
| `AU-12` | User who hates calorie tracking. |
| `AU-13` | User who wants general health but no hard target date. |
| `AU-14` | User with three correlated goals and one conflicting goal. |
| `AU-15` | User who signs in on phone, then laptop, then tablet. |
| `AU-16` | User who deletes account and recreates it. |
| `AU-17` | User who continues with local data, then later signs in. |
| `AU-18` | User whose cloud sync times out for three sessions. |
| `AU-19` | User who misses an entire week. |
| `AU-20` | User who logs partial workouts only. |
| `AU-21` | User who changes priorities mid-block. |
| `AU-22` | User who adds a swim goal after a running plan already exists. |
| `AU-23` | User who wants a custom goal the library does not cover. |
| `AU-24` | User who never enters optional metrics. |
| `AU-25` | User who enters wildly inconsistent metrics and needs correction. |
| `AU-26` | User who trains only outdoors. |
| `AU-27` | User with no pool access half the week. |
| `AU-28` | User who wants strength and mobility but no bodybuilding language. |
| `AU-29` | User who wants bodybuilding and hates endurance work. |
| `AU-30` | User who wants aesthetics plus cardiovascular health. |
| `AU-31` | User who only trains twice per week. |
| `AU-32` | User who trains six days per week. |
| `AU-33` | User who changes available equipment frequently. |
| `AU-34` | User who cares deeply about theme and aesthetics. |
| `AU-35` | User on light mode all the time. |
| `AU-36` | User on dark mode all the time. |
| `AU-37` | User with color-vision deficiency. |
| `AU-38` | User on a low-end laptop with slow network. |
| `AU-39` | User with intermittent mobile connectivity. |
| `AU-40` | User who wants all data local-first. |
| `AU-41` | User who wants coach help but never allows plan mutation. |
| `AU-42` | User who frequently asks open-ended fitness questions. |
| `AU-43` | User who accepts many coach plan changes. |
| `AU-44` | User who distrusts AI and uses only guided options. |
| `AU-45` | User who loves AI and writes everything in custom text. |
| `AU-46` | User who wants goals without end dates. |
| `AU-47` | User in injury-return rebuild mode. |
| `AU-48` | User who starts conservative, then flips aggressive. |
| `AU-49` | User who prints or exports screens regularly. |
| `AU-50` | User who compares Today, Program, Log, and Coach for contradictions. |
| `AU-51` | Hostile trainer who thinks the app is trying to replace him and uses it to ridicule the logic and prescribed workouts to clients. |

## Release Gate

Do not call the app ready after only unit tests or only the synthetic-athlete lab.

Release requires all of these to be clean:

- clean auth lifecycle behavior
- accessible account access screens
- reduced intake click count
- working delete-account behavior or honest environment-gated messaging
- no cross-surface plan contradictions
- no domain label leakage
- coherent goals management and auditability
- stable degraded-state handling
- adversarial e2e pass
- expanded persona-lab pass
- manual browser/device/export pass

## Operator Rule

The manual worksheet produced by `qa:manual-pack` must include:

- the standard release cases
- the full adversarial user matrix
- the release gate checklist above

If any gate row is `Fail` or `Blocked`, the product is not release-ready.
