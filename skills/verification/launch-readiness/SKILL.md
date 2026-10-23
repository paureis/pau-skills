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

Bundled files. Step 1 reads the ones this run needs, before the profile; the scripts are run, not read:
- `${CLAUDE_SKILL_DIR}/areas/`: one file per area, with each check's id, first stage, severity, the stack it
  applies to, and the evidence that passes it
- `${CLAUDE_SKILL_DIR}/PROBES.md`: how to confirm a security suspect with a test in the project's own framework
- `${CLAUDE_SKILL_DIR}/QUESTIONNAIRE.md`: what code cannot show, with how long each answer holds
- `${CLAUDE_SKILL_DIR}/ledger.mjs` (with `table.mjs` and `rules.mjs`) and `${CLAUDE_SKILL_DIR}/READINESS-TEMPLATE.md`,
  which `ledger.mjs` reads itself: the ledger and its shape
- `${CLAUDE_SKILL_DIR}/PRODUCTION-RULES.md`: five rules for a project's CLAUDE.md, with the check ids each prevents

## Do not

- Do not write a file, install anything, or run the app or its tests before the user confirms the profile (step 1).
  Reading files and `git log` are fine.
- Do not grade from a name. "Uses Auth0" or "uses an ORM" passes nothing; the setting or the line does.
- Do not add probe tests, or change product code, without a yes for that change. Do not commit: READINESS.md and any
  added test are left for the user to review and commit.
- Do not probe production or an environment other people use.
- Do not give a single score. Twenty small passes would hide one missing permission check.
- Never copy a secret value into the chat, the evidence or READINESS.md, which is meant to be committed. Cite its
  `file:line` and show at most the first 4 characters followed by "...". The ledger refuses evidence that looks
  like a key.
- Put any scratch file in a git-ignored folder inside the project, or in a `mktemp -d` folder you remove at the end;
  never anywhere else.
- Do not start agents (see step 9) on the profile's yes alone.
- Never grade an area from memory. When a read of a bundled file is refused (an area a corrected profile added),
  name the file's full path, ask the user to allow the read, carry on with the other areas, and grade that area only
  once the read works. Until then it has one row, `<prefix>-NA`: stage 1, must-fix, status `unknown`, source `code`,
  evidence 'areas/<file> not read: allow the read and run again', so it blocks GO. Once the area is graded, apply
  its `<prefix>-NA` row again as `n/a` with evidence such as 'area graded: see its rows'.
- When a ledger command is refused, show it and ask the user to allow it; never write the ledger's profile block or
  rows by hand.

## 1. Profile, confirmed first

Read the project, read-only: manifests and lockfiles (`package.json`, `pyproject.toml`, `requirements*.txt`,
`go.mod`, `Cargo.toml`, `Gemfile`, `composer.json`, `pom.xml`, `build.gradle`, `*.csproj`), framework and deploy
config, the schema or migrations, the routes, `.env.example`, CI files, the README. Run
`node "${CLAUDE_SKILL_DIR}/ledger.mjs" find`; if a ledger exists, read its profile block and run
`node "${CLAUDE_SKILL_DIR}/ledger.mjs" refresh --dry-run`, which writes nothing, to see which rows are stale.

A repository with several apps gets one READINESS.md per app: pass `--root <app folder>` to every ledger command,
and cite paths from that folder. Say in the profile which app it covers.

In the same turn, before the profile, read the bundled files the later steps need: the file in
`${CLAUDE_SKILL_DIR}/areas/` of every area the draft profile will check (step 3) and of every area it leaves out on a
guess, `areas/compliance.md` whenever the stage is not known, then `${CLAUDE_SKILL_DIR}/PROBES.md`,
`${CLAUDE_SKILL_DIR}/QUESTIONNAIRE.md` and `${CLAUDE_SKILL_DIR}/PRODUCTION-RULES.md`. A headless session resumed
with `--resume` loses the skill's `allowed-tools` read grant, so a read in a later turn can be refused. A file read
earlier in this session counts as read: do not read it again. If its text is no longer in the conversation (after a
compaction), read it again; a refusal then falls under the refused-read rule in "Do not".

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

Grade an area only when the confirmed profile says it applies, from its file as step 1 read it. An area the
corrected profile added is read now, under the refused-read rule in "Do not":

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

Each area left out gets its own row, `<prefix>-NA` (such as `BIL-NA`): stage 1, must-fix, status `n/a`, with the
profile reason. It is must-fix so that an area which comes back blocks GO until it is graded; once it is graded,
apply its `<prefix>-NA` row again as `n/a` with evidence such as 'area graded: see its rows'. Inside a loaded area,
a check whose "Applies" condition is false gets an `n/a` row with the reason. When the manifests change, the n/a
rows go back to recheck, so a new payments package brings billing back.

## 4. Evidence or silence

Run the project's test suite once (`areas/testing.md`, read in step 1, says how to find the runner). Then go
through each loaded check and grade it:

- `pass`: with `file:line` for code, or the command and its output. Nothing else passes a row. A row tagged probe
  in its area file passes only on a probe run (source `probe`).
- `fail`: with the `file:line` or the output that shows the gap.
- `likely`: a security suspect from reading the code, not yet confirmed by a probe.
- `unknown`: not shown either way, with how to check it (a command, a file to read, a person to ask).
- `n/a`: with the profile reason.
- `recheck`: set by the ledger when the evidence changed; grade it again.

Cite only the files that prove the row, so editing one file sends one row back to recheck. An `answer` row and
an `n/a` row cite no files: the expiry and the profile recheck bring them back. A row about something missing (no
CI, no LICENSE) cites no file either: it stays open and is graded again on every run. Never cite an unrelated file
to give a row one. For package
vulnerabilities (SEC-13), use `dependency-security-audit` if it is installed; otherwise run the ecosystem's audit
command. For pending migrations, use `migration-review` if it is installed; otherwise check locks and data loss by
hand. Claude Code's built-in `/security-review` covers only the current branch's changes, not the whole app, so it
does not replace this step.

## 5. Probes for security

Every security or access-control row that names a probe needs one to pass or fail; without a probe it is at most
`likely`. Follow `PROBES.md` as step 1 read it: if the project has a skill under `.claude/skills/verify-*/`, use it
directly to start and drive the app; otherwise use the project's own test harness. If neither can start the app,
offer to run `verify-app` if it is installed (it writes a project verification skill and asks before it does);
otherwise probe with `curl` against the app started locally.

Write each probe as a test in the project's own framework that states the safe behavior, so it fails while the gap
is open. Before writing them, ask how a probe whose gap is open should run, with two answers:

1. Recommended: the framework's expected-failure form, so CI stays green while the row is open: node:test
   `{ todo: true }`, Jest or Vitest `test.failing`, pytest `@pytest.mark.xfail(strict=True)`, unittest
   `@unittest.expectedFailure`, RSpec `pending`, Go `t.Skip` with the row id, or a separate probe command outside the
   default suite.
2. A plain test that stays failing in the suite until the gap is fixed.

Then send one message and stop: the findings so far, each probe in full with the file it goes in, that question with
the recommended answer first, and the questionnaire (step 6). Add and run the probes only on a yes, in the form the
user picked; record each as a `probe` row. If the user declines, the suspects stay `likely` and the verdict says
probes were skipped. Write the ledger (step 7) after the probes have run or been declined, so each row is written
once with its final grade.

## 6. Questionnaire

Ask the items in `QUESTIONNAIRE.md`, read in step 1, whose rows apply to the profile and the stage, in the same
message as the probes. Store each answer as an `answer` row with the date and an expiry from the table (a tested
restore holds 12 months, an access review a quarter). Skipped or "don't know" is `unknown`. Never answer for the
user.

## 7. Ledger

READINESS.md, in `docs/` when the project has that folder, else at the root. `ledger.mjs` finds an existing one in
either place before it creates one. Paths in rows are from the repository root (or the `--root` app folder); a path
outside it is refused.

Claude Code refuses a command that carries JSON on its command line or in a heredoc, and a write outside the
project. So write each input with your file-writing tool to `.readiness-input.json` at the repository root, then
pass it with `--consume`, which deletes it once it is applied (a refused input is kept for you to fix). In this
order:

```bash
node "${CLAUDE_SKILL_DIR}/ledger.mjs" refresh       # on a later run, always before profile
node "${CLAUDE_SKILL_DIR}/ledger.mjs" profile .readiness-input.json --consume
node "${CLAUDE_SKILL_DIR}/ledger.mjs" apply .readiness-input.json --consume
node "${CLAUDE_SKILL_DIR}/ledger.mjs" stamp
node "${CLAUDE_SKILL_DIR}/ledger.mjs" status
```

The profile input is `{"profile": {"stack": "...", "surface": "...", ...}, "stage": 2, "regulated": false,
"files": ["package.json"]}`. The rows input is a list such as `[{"id": "SEC-08", "area": "security", "stage": 2,
"severity": "must-fix", "status": "likely", "source": "code", "evidence": "src/cors.js:3 sets
Access-Control-Allow-Origin: *", "files": ["src/cors.js"]}]`.

- `profile` stores the confirmed profile with a hash of each file it came from (the manifests). If those files
  changed it first sends the n/a rows to recheck. If the stage rose or regulated data was added, it sends the n/a
  and can-wait rows to recheck: grade the new stage's checks from the area files read in step 1, and write their
  rows.
- `apply` adds or replaces rows by id and hashes each cited file. `source` is `code`, `command` (a test or an
  audit), `probe` (a probe run) or `answer`; `command` and `probe` list their input files, and all three carry an
  `expires`. It refuses a row that breaks the evidence rules and writes nothing.
- `stamp` records the commit (HEAD) and the stage this run assessed. Rows are tied to file hashes, not to commits:
  a row stays closed while its cited files keep their content, committed or not. Only the list of uncited changed
  files compares against the stamped commit, so a changed file that no row cites shows there again until it is
  committed or cited. With no commit yet, `stamp` refuses: say that the next run cannot list uncited changes until
  the first commit.
- `status` prints readiness per stage, the open must-fix rows and the counts per grade. Ready for stage N means
  every must-fix row for stages 1 to N, plus the stage 4 rows when regulated data is added, is pass or n/a and not
  expired, and each of those stages has graded rows and was assessed by a stamped run; otherwise it says "not
  assessed". A must-fix security row that is only `likely` blocks go.

Write the verdict into the file's Verdict section, and the roles into "Needs a person". Leave the rest of the prose
as the user wrote it.

## 8. Verdict

```
Stage <N> (<name>)<, with regulated data>: GO | NO-GO
Must fix (<count>; at most 10 lines, most severe first):
  <ID> <title>: <status>. <file:line or output>. Fix: <one line>, <small | bigger>
  (one row per line, never several ids on one line; the rest are in the ledger)
Can wait: <ID title, one line each>
Needs a person: <role: why, or "none"> (only these roles: senior engineer, backend engineer, DevOps, on-call,
  security and compliance, QA, tech lead)
Unknown: <ID: how to check>
Probes: <run: n, failing: n> | skipped, so <n> security rows are only "likely"
Counts: pass n, fail n, likely n, unknown n, n/a n, recheck n
Ledger: <path>, not committed
```

No single score. Always show the needs-a-person list in the chat verdict. Say plainly when probes were skipped.
Then ask which fixes to make.

## 9. Fix on a yes

A fix that fits in one sitting (a header, a cookie flag, one ownership check, a limiter) is made here: its failing
probe or test first, then the fix, then the probe passing, then `apply` the row again. Anything bigger (MFA, SSO,
backups, a schema change) becomes a brief with the failing probe or check as its done condition. If the `eng-lead`
or `builder` agent is installed, offer to start it with the brief and wait for a yes: the profile's yes did not
cover agent runs. Otherwise offer to run `to-issues` if it is installed to file it; otherwise give it as a plain
list. CI gaps: offer to run `ci-cost-and-cadence` if it is installed. When a closed gap's id is in the Prevents
column of `PRODUCTION-RULES.md`, read in step 1, offer to add that rule to the project's CLAUDE.md so the gap does
not come back: show the lines, and write them on a yes.

## Later runs

Step 1 again, with the stored profile shown for confirmation. After the yes, run `refresh` before `profile`: it
sends to `recheck` every row whose cited file changed, moved or is missing, every answer, command or probe past its
expiry, and every n/a row when the manifests changed. It lists the open rows (fail, unknown, likely) and the files
changed since the last run that no row cites (a new route). Then store the profile; if its stage changed, grade the
new stage's rows (step 7). Grade the recheck rows and every open row again, and look at the uncited files for new
checks; leave every other row as it is. Then `stamp`, `status`, and report what changed since the last verdict,
then the verdict.
