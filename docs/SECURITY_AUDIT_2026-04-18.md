# Security Audit

Date: April 18, 2026

Verdict: `P0 - immediate action required`

## Confirmed findings

1. Tracked local env file in committed history

- Severity: `P0`
- Evidence:
  - `.env.local` was tracked by git
  - `git cat-file -e HEAD:.env.local` succeeded
  - `git rev-list --count HEAD -- .env.local` returned `1`
  - local `main` was aligned with `origin/main`
- Impact:
  - a real Supabase service-role credential was present in the committed local env file
  - if `origin/main` was pushed with that commit, the key must be treated as exposed

2. Tracked Supabase CLI temp files

- Severity: `P2`
- Evidence:
  - `supabase/.temp/*` was tracked
  - files included linked project metadata and pooler details
- Impact:
  - not equivalent to a service-role credential leak
  - still environment-specific state that should not live in version control

## What I did not find

- No client-side code path injecting `SUPABASE_SERVICE_ROLE_KEY` into the browser bundle
- No service-role token in `src/`, `api/`, `tests/`, `e2e/`, or `docs/` outside the tracked `.env.local`
- The browser build still only exposes Supabase URL plus anon key through [scripts/build.js](../scripts/build.js)

## Repo changes applied

- Added `.env.local`, `.env.*.local`, and `supabase/.temp/` to [.gitignore](../.gitignore)
- Hardened [scripts/check-repo-hygiene.cjs](../scripts/check-repo-hygiene.cjs) to:
  - block tracked local env files
  - block tracked `supabase/.temp/`
  - flag tracked Supabase service-role JWTs
- Added guard coverage in [tests/repo-hygiene-security.test.js](../tests/repo-hygiene-security.test.js)

## Required operator actions

1. Rotate the Supabase service-role key now.
   Do this in the Supabase dashboard for the affected project.

2. Remove the committed `.env.local` from git history if it reached GitHub.
   A normal future commit that deletes the file is not enough if the repo is public or the commit is already accessible.

3. Verify GitHub secret scanning or push protection is enabled.

4. Review any deployments or local tooling that may have copied the same key into other env stores.

## Minimum closure criteria

- `.env.local` is no longer tracked
- `supabase/.temp/` is no longer tracked
- repo hygiene passes
- the Supabase service-role key has been rotated
- if GitHub history was exposed, the old credential is confirmed dead
