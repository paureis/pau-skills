# Area: APIs and webhooks

Load when the app offers an API to other developers, sends or receives webhooks, or a mobile app calls it. For an
app with no API beyond its own web pages, write one row `API-NA` (n/a, "no public API or webhooks"). Auth, rate
limits and validation on each route are in `security.md`; this file covers what outside callers depend on.

**API-01 API keys or tokens scoped and revocable** (2, must-fix). Applies: callers authenticate with keys. Check:
keys are stored hashed, shown once, can be revoked, carry scopes, and are tied to an account; a leaked key can be
found by its prefix. Fix: medium.

**API-02 Incoming webhooks verified** (1, must-fix, probe). Applies: the app receives webhooks (payments, GitHub,
Slack, email providers). Check: the signature or shared secret is checked on the raw body, with a timestamp
tolerance against replays; the handler is idempotent (COR-04) and answers fast, doing slow work in a job. Probe: an
unsigned request is refused.

**API-03 Outgoing webhooks signed and retried** (2, must-fix). Applies: the app sends webhooks. Check: a signature
the receiver can check, retries with backoff, a log the customer can see, and SSRF protection on the target URL
(SEC-19).

**API-04 Versioning and deprecation** (2, can-wait; 3, must-fix). Applies: an API used by others or by a mobile app
that users do not update at once. Check: a version in the path or header, and a written rule for how long an old
version lives.

**API-05 Errors in one shape** (2, can-wait). Applies: a public API. Check: one error format with a stable code and
a message, the right HTTP status, and no internals (SEC-12).

**API-06 Pagination and limits documented** (2, can-wait). Applies: a public API. Check: list endpoints paginate
(COR-05), and rate limits are returned in headers and documented.

**API-07 Docs that match the code** (3, can-wait). Applies: a public API. Check: an OpenAPI file or docs generated
from the code, checked in CI.
