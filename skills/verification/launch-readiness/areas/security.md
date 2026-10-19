# Area: security

Load when the app has any network surface: a web or mobile client, an HTTP API, a bot, a webhook receiver. For a
CLI or a library with none, write one row `SEC-NA` (n/a, "no network surface") and keep only SEC-01, SEC-02 and
SEC-13, which apply to any code that ships.

Every row here that names a probe needs one before it can pass (SKILL.md step 5). Without a probe the row is at most
`likely`. SEC-01 to SEC-15 are the security prompt's items, each with the condition under which it applies. Access
rules (who may read which record) are in `access-control.md`.

Each check: id, title, (first stage, severity). Applies: the stack condition. Check: how to find it. Pass: the
evidence that closes it. Fix: what the fix is, and whether it fits in one sitting.

**SEC-01 No secret in client code** (1, must-fix). Applies: any code that runs on the user's machine (browser
bundle, mobile app, desktop app, a public CLI). Check: grep the client folders and the built bundle for key-like
names (`KEY`, `SECRET`, `TOKEN`, `PASSWORD`, `PRIVATE`) and long literal strings; check which env variables the
bundler exposes (`NEXT_PUBLIC_`, `VITE_`, `REACT_APP_`, `EXPO_PUBLIC_`, `PUBLIC_`). A publishable key meant for
browsers (a Stripe `pk_` key, a Supabase anon key with row-level security on, a Firebase web config) is not a
secret; any other key is, whatever its value looks like, since a placeholder in code is replaced by a real one
later. Pass: `file:line` of where the client gets only public values, and the grep with no hits. Fix: move the call
to the server, read the key from the server's environment; small. Then SEC-02.

**SEC-02 Rotate any key that was ever committed** (1, must-fix). Applies: a git repository. Check:
`git log -p -S <key name>` and a scan of history (`gitleaks detect`, `trufflehog git file://.` if installed). A key
that reached a remote is burned, even if the commit was removed. Pass: the scan's output with no live key, or the
owner's answer that each found key was rotated (an `answer` row). Fix: rotate at the provider, then remove; small
per key.

**SEC-03 Row-level security on every exposed table** (1, must-fix, probe). Applies: only Postgres reached directly
from the client (Supabase, PostgREST, Hasura with a public role). Skip it for an app whose server holds the only
database connection. Check: `select relname, relrowsecurity from pg_class` for the public schema, or the
migrations' `enable row level security` and each `create policy`. Probe: with user A's client token, select user B's
rows. Pass: the probe's output. Fix: a policy per table; small each.

**SEC-04 Server-side auth on every route** (1, must-fix, probe). Applies: an HTTP API or server-rendered pages.
Check: list every route from the router (or the framework's route listing: `rails routes`, `php artisan
route:list`, `flask routes`, Django `show_urls` if installed) and find where each checks the session. Middleware
that guards "all but a list" is safer than a check in each handler. Probe: each route that is not meant to be
public, called with no session, returns 401 or a redirect. Pass: the probe's output. Fix: one guard; small.

**SEC-05 Rate limits on auth and costly routes** (2, must-fix, probe). Applies: login, sign-up, password reset,
one-time codes, invites, and any route that sends email or SMS or calls a paid API. Check: find a limiter
(middleware, a gateway or CDN rule, the auth provider's built-in limit). A hosted auth provider counts when its
limit is on. Probe: 20 bad logins in a row; the later ones get 429 or a lockout. Pass: the probe's output, or
`file:line` of the gateway rule plus its config. Fix: a limiter keyed by account and by IP; small.

**SEC-06 Server-side validation of every input** (1, must-fix). Applies: any server that takes input. Check: each
handler parses its body against a schema (zod, pydantic, a Rails strong-params list, Bean Validation) or checks
types, lengths and ranges; client-side checks do not count. Pass: `file:line` of the schema for each write route.
Fix: small per route.

**SEC-07 Parameterized queries only** (1, must-fix, probe). Applies: SQL or NoSQL queries built in the app. Check:
grep for queries built with string concatenation or interpolation (`"... WHERE id = " +`, f-strings or template
strings inside `query(`, `raw(`, `execute(`, `$where`). An ORM's normal calls are parameterized; its raw-SQL calls
are not. Probe: a quote in a search field; the response is normal, not a 500. Pass: the grep with no hits, plus the
probe. Fix: small per query.

**SEC-08 CORS locked to known origins** (2, must-fix, probe). Applies: an API called from a browser. Check: the
CORS setup. `Access-Control-Allow-Origin: *` is fine only for a public, read-only API with no cookies or tokens; an
origin echoed back from the request with credentials allowed is worse than `*`. Probe: a request with `Origin:
https://evil.example.com`; the response does not allow it. Pass: `file:line` of the allowlist and the probe. Fix:
an allowlist from config; small.

**SEC-09 Session cookies HttpOnly, Secure and SameSite** (1, must-fix, probe). Applies: only cookie sessions. For
bearer tokens, check instead that they are not kept in `localStorage` when an XSS would expose them, and that they
expire. Check: every `Set-Cookie` for the session. Probe: read the `Set-Cookie` header from a login. Pass: the
header. Fix: three flags; small.

**SEC-10 Passwords hashed with argon2, bcrypt or scrypt** (1, must-fix). Applies: only when the app stores
passwords itself. A hosted auth provider (Auth0, Clerk, Cognito, Firebase Auth, Supabase Auth) passes this by
design; write which one. Check: the hash call and its cost settings; MD5, SHA-1 or a plain SHA-256 is a fail.
Pass: `file:line`. Fix: rehash on next login; small to medium.

**SEC-11 Never trust a client-sent user ID** (1, must-fix, probe). Applies: any route that acts for a user. Check:
handlers that read `userId`, `ownerId`, `accountId`, `role` or `isAdmin` from the body, query or a header instead
of the session. Probe: send another user's id in the body; the action applies to the caller or is refused. Pass:
`file:line` showing the id comes from the session, and the probe. Fix: small.

**SEC-12 No stack traces or internals in production responses** (1, must-fix, probe). Applies: any server. Check:
the error handler; debug modes (`DEBUG=True`, `app.debug`, `NODE_ENV` not `production`, Rails
`consider_all_requests_local`) in production config. Probe: a request that throws; the body has no trace, file
path or SQL. Pass: `file:line` of the handler and the probe. Fix: small.

**SEC-13 Dependency scanning on a schedule** (2, must-fix). Applies: any project with third-party packages. Check:
an audit in CI or a bot (Dependabot, Renovate, `npm audit`, `pip-audit`, `bundle audit`, `cargo audit`,
`govulncheck`, OSV-Scanner) and that its alerts are read. For the scan itself, use `dependency-security-audit` if it
is installed; otherwise run the ecosystem's audit command. Pass: a `command` row citing the lockfile, with the
command, its output and an expiry of 30 days, plus `file:line` of the CI job. Fix: add the job; small.

**SEC-14 Security headers** (2, can-wait; 3, must-fix). Applies: a server that serves HTML. Check: HSTS,
`Content-Security-Policy`, `X-Content-Type-Options: nosniff`, `frame-ancestors` or `X-Frame-Options`,
`Referrer-Policy`, from the framework's helper (helmet, `django.middleware.security`, `secure_headers`) or the CDN.
Probe: read the headers of the home page. Pass: the headers. Fix: small.

**SEC-15 Spending limits on paid APIs** (1, must-fix). Applies: any paid API key the app holds (AI models, SMS,
email, maps, cloud functions). Check: a hard cap or budget alert at each provider, and a per-user limit in the app
for anything a user can trigger. Pass: an `answer` row per provider (caps live in dashboards), expiry 6 months. Fix:
small per provider.

## Beyond the prompt (OWASP Top 10 and ASVS level 1 and 2)

**SEC-16 Output encoding against XSS** (1, must-fix, probe). Applies: HTML rendered from user input. Check: raw HTML
sinks (`dangerouslySetInnerHTML`, `v-html`, `innerHTML =`, `|safe`, `html_safe`, `{!! !!}`, Markdown rendered
without a sanitizer). Probe: save `<img src=x onerror=alert(1)>` and view it. Fix: small.

**SEC-17 CSRF protection** (1, must-fix). Applies: only cookie sessions with state-changing routes. `SameSite=Lax`
or `Strict` blocks most of it; a token is still needed for any state-changing GET. Pass: `file:line`.

**SEC-18 File uploads** (2, must-fix, probe). Applies: user uploads. Check: size limit, type checked by content not
name, stored outside the web root or in object storage with private access, served with `Content-Disposition` or
from another domain, no path from the user's file name. Probe: upload an HTML file and open its URL.

**SEC-19 Server-side request forgery** (2, must-fix, probe). Applies: the server fetches a URL a user gave
(webhooks out, link previews, imports by URL). Check: an allowlist, or blocking private, loopback and metadata
addresses (`169.254.169.254`) after DNS resolution. Probe: point it at `http://127.0.0.1`.

**SEC-20 Encryption in transit and at rest** (1, must-fix; at rest, 3, must-fix). Applies: any deployed app; at
rest from stage 3, as two rows `SEC-20` and `SEC-20R`. Check: HTTPS only with a redirect, TLS to the database;
at rest, the provider's disk or column encryption.
Pass: the HSTS header and the provider setting (an `answer` row for the console setting).

**SEC-21 Logs without secrets or personal data** (2, must-fix). Applies: any app that logs. Check: grep the log
calls for passwords, tokens, full card numbers, request bodies of auth routes, `Authorization` headers. Pass: the
grep, and `file:line` of a redaction rule if the logger has one.

**SEC-22 Admin and internal tools** (2, must-fix, probe). Applies: an admin panel, a debug route, a seed or reset
endpoint. Check: each needs a role check and is not reachable in production unless meant to be. Probe: call it as
a normal user.

**SEC-23 Open redirects** (2, can-wait). Applies: a `next`, `redirect` or `returnTo` parameter. Check: only
relative paths or an allowlist.

**SEC-24 Unsafe deserialization and eval** (1, must-fix). Applies: `pickle`, `yaml.load` without a safe loader,
Java or .NET object deserialization, PHP `unserialize`, `eval` or `Function` on input. Pass: the grep with no hits.

**SEC-25 A way to report a vulnerability** (3, must-fix). A `security.txt` or a published address, and who reads
it. Questionnaire item `disclosure`.
