# Synthetic Athlete Release Gate Spec

## Purpose

The synthetic-athlete lab is a release gate, not a demo script. The default repo command now runs the full long-horizon gate across 100 personas and 26 weeks each.

It is only one layer of the full release decision. The product is not release-ready on the synthetic lab alone. The broader contract lives in [ADVERSARIAL_USER_TEST_MATRIX_AND_RELEASE_GATE.md](</c:/Users/Peter/Documents/Personal_Trainer/docs/ADVERSARIAL_USER_TEST_MATRIX_AND_RELEASE_GATE.md:1>).

## Safety Rule

- Run the lab only through local/test harness paths.
- Do not connect the lab to production Supabase.
- The main entrypoint is `npm run lab:synthetic`.
- The CLI refuses production-looking `SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_URL` / `VITE_SUPABASE_URL` values unless `FORMA_ALLOW_UNSAFE_SYNTHETIC_LAB=1` is set deliberately.

## Release Dimensions

Every run must score and report:

- coherence
- progression realism
- safety
- adaptation quality
- cross-surface conformity

These dimensions are deterministic and derived from clustered failures, not model-written narrative.

## Required Cohorts

The release gate must keep minimum catalog coverage for:

- beginners: 10
- older adults: 6
- obese beginners: 1
- highly trained athletes: 8
- swimmers: 5
- runners: 10
- lifters: 12
- shift workers: 3
- postpartum users: 1
- injury-return users: 6
- low-equipment users: 8
- travel-heavy users: 5
- neurodivergent users: 2
- time-crunched professionals: 6
- adaptive athletes: 1

Optional:

- youth athletes: 0 minimum, only if in scope

## Threshold Proposal

The current proposed release threshold is:

- minimum persona count: 100
- minimum simulation horizon: 26 weeks
- minimum average overall score: 85
- minimum average release-dimension score: 85
- maximum severe blockers: 0
- maximum medium issues: 0
- maximum cohort average score gap from global mean: 8
- maximum cohort release-dimension gap from global mean: 8

## Operator Checklist

1. Run `npm run lab:synthetic`.
2. Confirm `releaseGate.passed` is `true`.
3. Review `releaseGate.failingChecks` if the gate fails.
4. Review `clusters` / `rootCauseClusters` for repeated contradictions or safety issues.
5. Review `cohortCoverage.requiredMissing` and `fairnessSignals` before signoff.
6. Use `npm run lab:synthetic:quick` only for fast local iteration, not release signoff.

## Interpretation Rules

- A single clean average score is not enough for release approval.
- Cohort blind spots count as release blockers even when averages look good.
- Cross-surface contradictions and safety regressions outrank cosmetic wins.
- Output must remain reproducible and diffable so changes in failures, cohorts, and thresholds are reviewable in code review.
- Synthetic coverage complements, but does not replace, adversarial e2e, auth/account lifecycle validation, and the full manual browser/device/export pass.
