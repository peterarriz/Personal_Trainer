# Account Lifecycle And Profile Bootstrap Spec

## Account Semantics
- `Logout` clears runtime auth state, local auth cache, and returns the user to the auth gate.
- `Delete account` is defined as deleting the Supabase auth identity through `/api/auth/delete-account`, not merely deleting app rows.
- After delete-account succeeds, local auth/session caches are cleared and the next same-email flow should be signup again, not silent sign-in reuse.
- Local-only mode must stay honest: account controls exist only when a signed-in auth session exists.

## Profile Bootstrap
Profile setup is intentionally separate from intake. It establishes the person and training defaults the planner is allowed to trust before goal interpretation begins.

### Required bootstrap fields
- Display name
- Timezone
- Units
- Birth year
- Height
- Current bodyweight
- Usual environment
- Equipment access
- Usual session length
- Years of consistent training

### Copy rules
- Do not use unexplained jargon like `Training age`.
- Explain why the fields matter in planner terms, not admin terms.
- Keep layout grouped by real-world meaning instead of a single flat form.

## Settings Save Semantics
- Account/profile editing in Settings is an explicit save action.
- This prevents per-keystroke cloud writes and makes profile edits easier to reason about during degraded cloud conditions.
