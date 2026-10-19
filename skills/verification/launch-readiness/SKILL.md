---
name: launch-readiness
description: "Give an honest go or no-go for the stage an app is entering (beta, paying customers, enterprise, regulated data), backed by evidence and probes, in a READINESS.md ledger that rechecks what changed. Use when the user says 'is this ready for paying customers', 'check launch readiness', 'can we launch'. Not for a package CVE or the current diff."
argument-hint: "[stage: beta | paying | enterprise | regulated] [the app's folder, when the repository has several]"
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
---

# Launch readiness

An app built mostly by agents often works in a demo and still has a route that skips its ownership check. This
skill says whether the app is ready for the stage it is entering, with evidence for every row, sized to what the app
is: a CLI gets no CORS row and a beta gets no SOC 2 row. It closes gaps on the user's yes, and on later runs looks
only at rows whose evidence changed.

Arguments: $ARGUMENTS

Bundled files, read when you reach their step:
- `${CLAUDE_SKILL_DIR}/areas/`: one file per area, with each check's id, first stage, severity, the stack it
  applies to, and the evidence that passes it
- `${CLAUDE_SKILL_DIR}/PROBES.md`: how to confirm a security suspect with a test in the project's own framework
- `${CLAUDE_SKILL_DIR}/QUESTIONNAIRE.md`: what code cannot show, with how long each answer holds
- `${CLAUDE_SKILL_DIR}/ledger.mjs` and `${CLAUDE_SKILL_DIR}/READINESS-TEMPLATE.md`: the ledger and its shape

## Do not

- Do not write a file, install anything, or run the app or its tests before the user confirms the profile (step 1).
  Reading files and `git log` are fine.
- Do not grade from a name. "Uses Auth0" or "uses an ORM" passes nothing; the setting or the line does.
- Do not add probe tests, or change product code, without a yes for that change. Do not commit: READINESS.md and any
  added test are left for the user to review and commit.
- Do not probe production or an environment other people use.
- Do not give a single score. Twenty small passes would hide one missing permission check.

## 1. Profile, confirmed first

Read the project, read-only: manifests and lockfiles (`package.json`, `pyproject.toml`, `requirements*.txt`,
`go.mod`, `Cargo.toml`, `Gemfile`, `composer.json`, `pom.xml`, `build.gradle`, `*.csproj`), framework and deploy
config, the schema or migrations, the routes, `.env.example`, CI files, the README. Run
`node ${CLAUDE_SKILL_DIR}/ledger.mjs find`; if a ledger exists, read its profile block and run
`node ${CLAUDE_SKILL_DIR}/ledger.mjs refresh --dry-run`, which writes nothing, to see which rows are stale.

Then send the profile and stop. It is the first thing that waits for the user:

```
Profile (read from <the files>):
- Stack: <languages, frameworks, runtime>      - Surface: <web UI, API, mobile, CLI, library>
- Data: <personal, health, card, children's, or none seen>
- Auth: <how users sign in, or none>           - Payments: <processor, or none>
- AI features: <provider and use, or none>     - Tenants: <single users, organizations>
- Deploy target: <platform, or not deployed>
- Stage entering: <1 private beta | 2 paying customers | 3 enterprise buyers>; regulated data added: <yes or no>
Areas I will check: <list>. Left out: <areas, and why>.
<On a later run: what changed since <date>, and the rows that are stale.>

A yes starts the checks: I will run the app and its tests, may install its dependencies, and write READINESS.md at
<path>, which I will not commit. Correct anything above, or say yes.
```

A wrong profile is the likeliest failure, so ask about anything you guessed. If the user gave no stage, ask for it.

## 2. Stages

| Stage | Means | Typical checks |
| --- | --- | --- |
| 1 private beta | invited users, no money | secrets, auth and ownership on every route, backups |
| 2 paying customers | stages 1 and 2 | billing, rate limits, restore tested, on-call, deletion |
| 3 enterprise buyers | stages 1 to 3 | SSO, SCIM, audit trail, SOC 2, questionnaires |
| 4 regulated data | added to the stage the app is at | HIPAA and BAAs, PCI scope, residency, retention |

Each check is tagged with the first stage that needs it. A check with two tags, such as "(2, can-wait; 3,
must-fix)", gets the strictest tag that applies to the stage being entered. Stage 4 does not require stage 3.

## 3. Areas, loaded only when they apply

Read an area file only when the profile says it applies:

| Area | File | Prefix | Load when |
| --- | --- | --- | --- |
| data and schema | `areas/data-and-schema.md` | SCH | a database |
| identity and sessions | `areas/identity-and-sessions.md` | IDN | sign-in |
| access control and tenancy | `areas/access-control.md` | ACC | accounts or per-user data |
| data safety | `areas/data-safety.md` | SAFE | stored user data |
| correctness | `areas/correctness.md` | COR | always |
| security | `areas/security.md` | SEC | any network surface (a CLI keeps three rows) |
| compliance | `areas/compliance.md` | CMP | personal data from stage 2, or stage 3 or 4 |
| delivery | `areas/delivery.md` | DEL | deployed or published |
| observability and on-call | `areas/observability.md` | OBS | runs as a service |
| testing | `areas/testing.md` | TST | always |
| billing | `areas/billing.md` | BIL | takes money |
| APIs and webhooks | `areas/apis-and-webhooks.md` | API | an API for others, or webhooks |
| AI features | `areas/ai-features.md` | AI | calls a model |
| UX and accessibility | `areas/ux-and-accessibility.md` | UX | a user interface |
| code health and ownership | `areas/code-health.md` | CODE | always |

Each area left out gets its own row, `<prefix>-NA` (such as `BIL-NA`), status `n/a`, with the profile reason. Inside a loaded area, a check
whose "Applies" condition is false gets an `n/a` row with the reason. When the manifests change, the n/a rows go
back to recheck, so a new payments package brings billing back.

## 4. Evidence or silence

Run the project's test suite once (see `areas/testing.md` for how to find the runner). Then go through each loaded
check and grade it:

- `pass`: with `file:line` for code, or the command and its output. Nothing else passes a row.
- `fail`: with the `file:line` or the output that shows the gap.
- `likely`: a security suspect from reading the code, not yet confirmed by a probe.
- `unknown`: not shown either way, with how to check it (a command, a file to read, a person to ask).
- `n/a`: with the profile reason.
- `recheck`: set by the ledger when the evidence changed; grade it again.

Cite only the files that prove the row, so editing one file sends one row back to recheck. An `answer` row and
an `n/a` row cite no files: the expiry and the profile recheck bring them back. For package
vulnerabilities (SEC-13), use `dependency-security-audit` if it is installed; otherwise run the ecosystem's audit
command. For pending migrations, use `migration-review` if it is installed; otherwise check locks and data loss by
hand. Claude Code's built-in `/security-review` covers only the current branch's changes, not the whole app, so it
does not replace this step.

## 5. Probes for security

Every security or access-control row that names a probe needs one to pass or fail; without a probe it is at most
`likely`. Follow `PROBES.md`: if the project has a skill under `.claude/skills/verify-*/`, use it directly to start
and drive the app; otherwise use the project's own test harness. If neither can start the app, offer to run
`verify-app` if it is installed (it writes a project verification skill and asks before it does); otherwise probe
with `curl` against the app started locally.

Write each probe as a test in the project's own framework that states the safe behavior, so it fails while the gap
is there. Then send one message and stop: the findings so far, each probe in full with the file it goes in, and the
questionnaire (step 6). Add and run the probes only on a yes. If the user declines, the suspects stay `likely` and
the verdict says probes were skipped. Write the ledger (step 7) after the probes have run or been declined, so each
row is written once with its final grade.

## 6. Questionnaire

Ask the items in `QUESTIONNAIRE.md` whose rows apply to the profile and the stage, in the same message as the
probes. Store each answer as an `answer` row with the date and an expiry from the table (a tested restore holds 12
months, an access review a quarter). Skipped or "don't know" is `unknown`. Never answer for the user.

## 7. Ledger

READINESS.md, in `docs/` when the project has that folder, else at the root. `ledger.mjs` finds an existing one in
either place before it creates one. Paths in rows are from the repository root.

Claude Code refuses a command that carries JSON on its command line or in a heredoc, and a write outside the
project. So write each input with your file-writing tool to `.readiness-input.json` at the repository root, then
pass it with `--consume`, which deletes it once it is applied (a refused input is kept for you to fix):

```bash
node ${CLAUDE_SKILL_DIR}/ledger.mjs profile .readiness-input.json --consume
node ${CLAUDE_SKILL_DIR}/ledger.mjs apply .readiness-input.json --consume
node ${CLAUDE_SKILL_DIR}/ledger.mjs status
node ${CLAUDE_SKILL_DIR}/ledger.mjs stamp
```

The profile input is `{"profile": {"stack": "...", "surface": "...", ...}, "stage": 2, "regulated": false,
"files": ["package.json"]}`. The rows input is a list such as `[{"id": "SEC-08", "area": "security", "stage": 2,
"severity": "must-fix", "status": "fail", "source": "code", "evidence": "src/cors.js:3 sets
Access-Control-Allow-Origin: *", "files": ["src/cors.js"]}]`.

- `profile` stores the confirmed profile with a hash of each file it came from (the manifests).
- `apply` adds or replaces rows by id and hashes each cited file. `source` is `code`, `command` (a test, a probe,
  an audit: it lists its input files and carries an `expires`) or `answer` (carries an `expires`). It refuses a row
  that breaks the evidence rules and writes nothing.
- `status` prints readiness per stage, the open must-fix rows and the counts per grade. Ready for stage N means
  every must-fix row for stages 1 to N, plus the stage 4 rows when regulated data is added, is pass or n/a and not
  expired. A must-fix security row that is only `likely` blocks go.
- `stamp` records the commit of this run, so the next run can list changed files that no row cites.

Write the verdict into the file's Verdict section, and the roles into "Needs a person". Leave the rest of the prose
as the user wrote it.

## 8. Verdict

```
Stage <N> (<name>)<, with regulated data>: GO | NO-GO
Must fix (<count>, at most 10 shown, most severe first):
  <ID> <title>: <status>. <file:line or output>. Fix: <one line>, <small | bigger>
Can wait: <ID title, one line each>
Needs a person: <role: why> (senior engineer, backend engineer, DevOps, on-call, security and compliance, QA,
  tech lead)
Unknown: <ID: how to check>
Probes: <run: n, failing: n> | skipped, so <n> security rows are only "likely"
Counts: pass n, fail n, likely n, unknown n, n/a n, recheck n
Ledger: <path>, not committed
```

No single score. Say plainly when probes were skipped. Then ask which fixes to make.

## 9. Fix on a yes

A fix that fits in one sitting (a header, a cookie flag, one ownership check, a limiter) is made here: its failing
probe or test first, then the fix, then the probe passing, then `apply` the row again. Anything bigger (MFA, SSO,
backups, a schema change) becomes a brief with the failing probe or check as its done condition: hand it to the
`eng-lead` or `builder` agent if one is installed; otherwise offer to run `to-issues` if it is installed to file it;
otherwise give it as a plain list. CI gaps: offer to run `ci-cost-and-cadence` if it is installed.

## Later runs

Step 1 again, with the stored profile shown for confirmation. After the yes, run `refresh`: it sends to `recheck`
every row whose cited file changed, moved or is missing, every answer or command past its expiry, and every n/a row
when the manifests changed, and lists the files changed since the last run that no row cites (a new route). Grade
only the recheck rows and look at the uncited files for new checks; leave every other row as it is. Report what
changed since the last verdict, then the verdict, then `stamp`.
