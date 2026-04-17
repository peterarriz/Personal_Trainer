# FORMA Private Beta Security Hardening Review

Date: 2026-04-17

## Scope

This review treats FORMA like a vibecoded app that is unsafe until proven otherwise. The focus was:

- broken access control
- leaked admin, reviewer, or audit affordances
- Supabase RLS coverage in repo migrations
- server-side auth enforcement
- rate limiting for recovery and destructive actions
- CSP and security headers on Vercel
- secret exposure risk

## Threat Model

### Primary attackers

- normal users clicking through hidden or half-live UI affordances
- curious users toggling localStorage or query-string debug flags
- abusive clients hammering recovery or destructive endpoints
- signed-in users trying to access cross-account data through weak RLS or server routes
- anyone inspecting the shipped client for leaked secrets or admin-only tooling

### High-risk assets

- `trainer_data` and other user-scoped Supabase rows
- auth identity lifecycle actions
- workout, nutrition, profile, and goal history
- internal QA and reviewer artifacts
- AI provider credentials

## Root Findings

### Fixed in this pass

- Internal and staff tooling visibility was previously tied to client debug flags alone. It is now restricted to trusted local debug contexts only.
- The consumer Settings surface previously exposed a `Reviewer report` card. That card is now hidden from the consumer app.
- Password reset previously went straight from client to Supabase auth with no server-side throttle. It now uses `/api/auth/forgot-password` with server-side rate limiting.
- `GET /api/auth/delete-account` previously exposed deployment configuration diagnostics publicly. It now requires auth, is rate limited, and returns generic availability messaging instead of env-name leakage.
- `POST /api/auth/delete-account` now has server-side rate limiting.
- Vercel security headers are now declared in `vercel.json`.
- Consumer AI key entry is no longer a normal product path. Client-supplied provider keys are restricted to trusted local debug use.

### Still not fully proven

- Repo migrations show broad Supabase RLS coverage, but live-project RLS was not independently verified in this pass.
- `api/ai/intake.js` remains a public pre-auth route. It is still an abuse surface until it is throttled or otherwise protected.
- The current CSP still includes `'unsafe-inline'` for scripts and styles because the custom build output still depends on inline assets. This is better than no CSP, but not a strict CSP.
- Other historical docs and audit notes may still mention earlier reviewer-export behavior. The current code rule is authoritative.

## Repo Evidence

### Consumer app rule

No admin, reviewer, or audit surface may appear in the consumer app.

Enforced by:

- `src/services/internal-access-policy-service.js`
- `src/domains/settings/SettingsAccountSection.jsx`
- `src/domains/settings/settings-surface-model.js`
- `src/trainer-dashboard.jsx`

### Server-side auth and abuse controls

- `api/auth/delete-account.js`
- `api/auth/forgot-password.js`
- `api/_lib/security.js`

### Secret-handling boundary

- `src/services/ai-runtime-service.js`
- `src/trainer-dashboard.jsx`

### RLS coverage in repo

Repo migrations indicate ownership RLS for:

- `trainer_data`
- `goals`
- `plans`
- `sessions`
- `session_logs`
- `daily_checkins`
- `garmin_data`
- `nutrition_logs`
- `my_places`
- `coach_memory`
- `injury_flags`
- `exercise_performance`
- `push_subscriptions`
- `app_events`

Primary migration evidence:

- `supabase/migrations/20260414000100_audit_supabase_data_model.sql`
- `supabase/migrations/20260413000100_policy_perf_hardening.sql`
- `supabase/migrations/20260413000200_policy_perf_followup.sql`

## Concrete Fix List

### Must keep before private beta

1. Keep internal tooling hidden behind trusted local debug gating only.
2. Keep reviewer and audit tooling out of the consumer app.
3. Keep password reset and delete-account routes server-mediated and rate limited.
4. Keep delete-account diagnostics generic. Do not leak missing env names to the UI.
5. Keep client-supplied AI provider keys out of the consumer product path.
6. Keep Vercel security headers enabled on every route.

### Next hardening steps

1. Add rate limiting to `api/ai/intake.js`.
2. Verify live Supabase RLS and table grants in the staging project, not just migrations.
3. Replace inline build dependencies so CSP can drop `'unsafe-inline'`.
4. Add a dedicated internal operator shell if QA and reviewer workflows still need in-product tools.

## Acceptance Criteria

- A signed-in consumer cannot see reviewer, audit, staff, or developer surfaces in normal Settings.
- A non-local hostname plus debug flags still does not reveal internal tools.
- Password reset requests are server-side and rate limited.
- Delete-account diagnostics require auth and do not reveal env names.
- Delete-account submit is rate limited.
- Client builds do not invite the user to paste AI provider keys into the normal product.

