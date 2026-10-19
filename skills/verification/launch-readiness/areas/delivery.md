# Area: delivery

Load when the app is deployed (a server, a hosted site, a mobile app, a published package). For a CLI or library,
keep DEL-01, DEL-02, DEL-03 and DEL-14, and write the rest as one row `DEL-NA` (n/a, "not deployed as a service").
CI rows: offer to run `ci-cost-and-cadence` if it is installed when CI is missing or too slow to run on each change;
otherwise write what CI should run in the fix.

**DEL-01 CI runs the tests on every change** (1, must-fix). Applies: any project. Check: a CI workflow (GitHub
Actions, GitLab CI, CircleCI, Buildkite) that installs from the lockfile and runs the tests and the build on every
pull request, and that main is protected so a red run blocks the merge. Pass: `file:line` of the workflow. Fix:
small.

**DEL-02 Reproducible builds** (1, must-fix). Applies: any project. Check: a lockfile committed (`package-lock.json`,
`pnpm-lock.yaml`, `poetry.lock`, `uv.lock`, `Cargo.lock`, `go.sum`, `Gemfile.lock`), a pinned runtime version
(`.nvmrc`, `.python-version`, `engines`, `requires-python`, a Docker base image with a tag), and CI installing from
it. A project with no third-party dependencies passes on the runtime pin alone.

**DEL-03 Releases are versioned and can be rolled back** (2, must-fix). Applies: any deploy or published package.
Check: each release is a known version or commit; going back to the previous one is one command or one click, and
the database migrations allow it (expand and contract). Pass: `file:line` or an `answer` row with the last time a
rollback was done.

**DEL-04 Separate environments** (1, must-fix). Applies: a deployed service. Check: production has its own
database, keys and settings; previews and staging never point at production data. Pass: config `file:line`.

**DEL-05 Infrastructure as code** (3, can-wait). Applies: cloud resources beyond one platform service. Check:
Terraform, Pulumi, CDK, Bicep or the platform's config file holds the setup, so it can be rebuilt.

**DEL-06 Secrets in a manager, not in files** (1, must-fix). Applies: a deployed service. Check: production secrets
in the platform's secret store or a vault; `.env` files ignored by git (`.gitignore`), and none committed. Pass:
`file:line` of the ignore rule and the grep of history (SEC-02).

**DEL-07 Zero-downtime deploys and health checks** (2, can-wait). Applies: a server with users. Check: a health
endpoint the platform checks before sending traffic, rolling or blue-green deploys, graceful shutdown on SIGTERM.

**DEL-08 Feature flags for risky changes** (3, can-wait). Applies: a team shipping often to paying users.

**DEL-09 Scaling and limits** (2, can-wait). Applies: a server. Check: what happens at ten times today's traffic:
autoscaling or a known ceiling, timeouts on outgoing calls, limits on the database pool (SCH-06).

**DEL-10 DNS, certificates and email sender** (2, must-fix). Applies: a public domain or sent email. Check:
certificates renew automatically; the domain auto-renews in a company account (CMP-10); sent email has SPF, DKIM
and DMARC on the sending domain. Pass: `dig TXT` output as a `command` row (expiry 90 days).

**DEL-11 Background jobs: retries, dead letters, single runs** (2, must-fix). Applies: queues, workers or cron.
Check: retries with backoff and a cap, a dead-letter queue or failed-jobs table someone looks at, jobs safe to run
twice (COR-04), and a scheduled job that runs once even with several servers (a lock or the platform's scheduler).

**DEL-12 Caching that cannot leak or go stale forever** (2, must-fix). Applies: a cache or CDN in front of user
data. Check: per-user responses are `private` or not cached; cache keys include the user or tenant (ACC-02); a way
to purge.

**DEL-13 Cost alerts** (2, must-fix). Applies: any paid cloud account. Check: a budget alert at the provider and
someone who receives it. Questionnaire item `cost-alerts`. See also SEC-15.

**DEL-14 Disaster recovery plan** (3, must-fix). Applies: paying customers depend on it. Check: written steps to
rebuild in a new region or account, the recovery time and data-loss targets, and when it was last rehearsed.
Questionnaire item `disaster-recovery`.
