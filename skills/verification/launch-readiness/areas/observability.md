# Area: observability and on-call

Load when the app runs as a service. For a CLI or library, write one row `OBS-NA` (n/a, "does not run as a
service") and keep OBS-06.

**OBS-01 Errors are reported somewhere a person sees** (1, must-fix). Applies: a service. Check: an error tracker
(Sentry, Rollbar, Bugsnag, Honeybadger, the platform's own) or alerts on error logs, wired in on the server and the
client. Pass: `file:line` of the setup. Fix: small.

**OBS-02 Structured logs with a request id** (2, can-wait). Applies: a service. Check: logs as JSON or key-value,
with a request id passed through to outgoing calls, kept long enough to look back a week. Secrets out of logs is
SEC-21.

**OBS-03 Uptime check from outside** (2, must-fix). Applies: a public service. Check: an external check (a status
service, the cloud's synthetic check) on the main page and one API route, alerting a person. Questionnaire item
`uptime-check` if it is not in code.

**OBS-04 Alerts that reach someone, and on-call** (2, must-fix). Applies: paying customers. Check: who gets paged,
how, in which hours, and who covers when they are away. Questionnaire item `on-call`, expiry 3 months. A single
founder with phone alerts is an answer; nobody is not.

**OBS-05 Metrics for the main flows** (3, can-wait). Applies: a service. Check: request rate, error rate and
latency per route, queue depth, and a business number (sign-ups, orders) on a dashboard.

**OBS-06 Usable error messages** (1, can-wait). Applies: any app. Check: errors a user sees say what went wrong and
what to do, with no internals (SEC-12); a CLI exits non-zero with the message on stderr.

**OBS-07 A status page or way to tell customers** (3, can-wait). Applies: paying business customers.
