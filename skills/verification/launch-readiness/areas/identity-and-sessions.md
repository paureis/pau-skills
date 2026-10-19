# Area: identity and sessions

Load when the app has sign-in. For an app with no accounts, write one row `IDN-NA` (n/a, "no sign-in"). Password
storage (SEC-10), cookie flags (SEC-09) and login rate limits (SEC-05) are in `security.md`.

A hosted auth provider covers some of these by design; name it and check its settings (MFA on, sign-up rules,
session length), since a default left off is still a gap. A provider's name alone passes nothing.

**IDN-01 Sessions expire and can be revoked** (1, must-fix). Applies: any sign-in. Check: an idle and an absolute
timeout; sign-out deletes the session on the server (a JWT with no server-side list cannot be revoked before it
expires, so its lifetime must be short, with a refresh token that can be revoked). Pass: `file:line` of the expiry
and the sign-out. Fix: small.

**IDN-02 Password reset is safe** (1, must-fix, probe). Applies: password sign-in. Check: a random single-use token
with a short expiry (an hour or less), stored hashed; the same response whether the email exists or not; all
sessions end after a reset. Probe: use a reset link twice. Fix: small.

**IDN-03 Email verified before it is trusted** (2, must-fix). Applies: email sign-up, or email used for invites,
billing or SSO matching. Check: the account's email is marked verified before it can join an organization by
domain or receive invites meant for that address. Fix: small.

**IDN-04 Multi-factor sign-in** (2, can-wait; 3, must-fix). Applies: any sign-in; at stage 3 enterprise buyers ask
for it, and admins should have it at stage 2. Check: TOTP or passkeys, recovery codes, and an admin who can require
it. Fix: bigger unless the provider has it (then a setting).

**IDN-05 Session fixation and rotation** (1, must-fix). Applies: cookie sessions. Check: a new session id after
sign-in and after a privilege change. Pass: `file:line`.

**IDN-06 Account deletion** (2, must-fix). Applies: any accounts. Check: a user can delete their account (or ask
for it, with a stated time), and it removes or anonymizes their data (see CMP-04). Fix: medium.

**IDN-07 OAuth and social sign-in settings** (1, must-fix). Applies: "Sign in with" providers. Check: the `state`
parameter (or PKCE) is checked, redirect URIs are exact, and accounts are linked by a verified email only. Pass:
`file:line` or the provider settings as an `answer` row.

**IDN-08 Sign-up abuse** (2, can-wait). Applies: open sign-up. Check: a captcha or rate limit on sign-up,
disposable email handling if trials are free, and a way to disable an account.
