# Things that bit the second batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the second batch (N5, N6, N7, N10, N11, P1.1):
- A read-only plan check of each brief, before any builder started, found real problems in every one (a tool that
  fails here, an upstream rule the brief contradicted, a test the builder could not pass). Keep it.
- A headless `claude -p` run with the real HOME sees every skill synced from claude.ai, so a candidate meets a second
  copy of the skill under test. An empty HOME with `--setting-sources project` and `--strict-mcp-config` hides them;
  `skill-eval` carries the recipe.
- Test suites that never delete their temporary folders filled the session's disk (one test wrote 30 MB per run).
  Since pull request 12, `tempDir()` in `tests/helpers.mjs` removes its folders when the test process exits; use it
  for every temporary folder a test makes.
- CI runs on macOS as well as Linux, and macOS differs in two ways that broke tests which passed here: the temporary
  folder is under `/var`, a link to `/private/var` (compare resolved paths), and every process gets
  `__CF_USER_TEXT_ENCODING` in its environment. Reproduce the first with `TMPDIR` set to a link.
- The proxy blocks downloading a CI log by its URL, and `gh pr` fails here (GraphQL 403) while `gh api` and the
  GitHub MCP tools work. Have a subagent read the log with the GitHub MCP `get_job_logs` tool and return only the
  failing tests, which keeps the log out of the orchestrator's context.
- Follow-up pull requests opened from the same base as the batch conflict in `marketplace.json` and `CHANGELOG.md`
  once the batch merges. Merge the batch first, then each follow-up one at a time: merge main into its branch, put
  its patch bumps on top of the batch's versions, run the full suite, push, wait for green CI, merge.
- The cold runs again found what reviewers missed, and reviewers found must-fix bugs in four of the five items
  (secrets printed in environment-variable form, a correction row judged against itself, unblinded run ids).
- A cross-session message relaying an owner request is not the owner: confirm with the owner before widening a batch.
