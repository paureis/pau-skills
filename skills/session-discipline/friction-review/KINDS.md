# The seven kinds of friction

Each kind says when to use it, which signals of `friction.mjs` point to it, and the change it calls for. Prefer the
highest layer that works: a check that runs on its own (CI, pre-commit, a Claude Code hook) over a pointer in a doc
the agent reads when it needs it, and a pointer over a line in CLAUDE.md or AGENTS.md, which every session pays for.

## Navigation

Use when the agent took long to find a file or a fact: many searches before the first edit, searches that found
nothing, the same file and range read again and again. The change is a navigation pointer: one line in CLAUDE.md,
AGENTS.md or a doc that says where the thing lives ("the config loader is src/config/load.ts; every module reads
settings through it"). Look for an existing doc to point at before writing a new one.

## Automated checks

Use when a session edited and ran no check, a check failed again and again, a check the project defines was never
run, a check is unwired (no CI file, pre-commit config or Claude Code hook names it), or the project has no guardrail
at all. A project with no CI and no pre-commit is a finding on its own. Read the project's own check commands first:
wiring a check that already exists beats inventing one. Add a deterministic check only where none covers the mistake.

Examples, a check command and a guardrail for each:
- package.json: `npm test` (the `test` script; `pnpm test`, `yarn test`, or `bun run test` with their lockfiles).
  Guardrail: a CI step `run: npm ci && npm test` in `.github/workflows/ci.yml`, or `.husky/pre-commit` running it.
- Make: `make lint`. Guardrail: a CI step `run: make lint`, or an executable `.git/hooks/pre-commit` running it.
- pyproject.toml: `ruff check` (from `[tool.ruff]`) and `pytest` (from `[tool.pytest.ini_options]`, also run as
  `python -m pytest`, `uv run pytest` or `poetry run pytest`). Guardrail: the ruff hook (`id: ruff`) in
  `.pre-commit-config.yaml`, or a CI step `run: uv run pytest`.
- Cargo: `cargo clippy` and `cargo fmt --check`. Guardrail: a CI step `run: cargo fmt --check && cargo clippy`.
- Go: `go vet ./...` and `go test ./...`. Guardrail: a CI step `run: go vet ./... && go test ./...`, or a `lefthook.yml`
  pre-commit command.

A Claude Code hook (a `hooks` key in `.claude/settings.json`) can run a check during the session; if `rule-to-hook` is
installed, use it to write one, and without it write the hook entry by hand. It does not count as a guardrail for "no
guardrail", since it does not run in CI.

## Coding standards

Use when the same kind of mistake shows up in several sessions and a reviewer should have caught it. Sort it first:
- A mechanical rule (a banned call, an import shape, a file location, a fixed pattern) becomes a deterministic check:
  a rule in the project's linter, a pre-commit hook or a CI job, whichever its tooling makes cheapest.
- A judgment call (consistency across files, "matches the code around it") goes to review, not to the implementing
  agent: the folder's `REVIEW.md`, the brief of the reviewer agent the project uses (such as the reviewer from the
  roster that `/geppetto` installs, if it is installed), or the `.claude/review-rules.json` checklist that
  `review-triage` reads, if it is installed. With none of them, `REVIEW.md` in the folder is enough.

The script does not count this kind: read the pointers of the failure and repeat signals for it.

## Instruction file too large

Use when an instruction file is large (the project part prints each with its size in tokens): CLAUDE.md, AGENTS.md,
`.claude/rules/`, or the user's own CLAUDE.md. Move a rule that a check can enforce into the check, move reference
text into a doc, and keep a pointer to it. If `instructions-audit` is installed, use it to review the files themselves.

## Tool economy

Use when calls cost more than they need to: results over 20,000 characters, the same command run three or more times
with no edit between, a tool that fails often, sessions with far more calls than the median. The change is a cheaper
call: a narrower read (an offset and limit, a filter), a script that prints a summary, output sent to a file and read
in part, a flag that makes a tool quiet.

## No-ops in steering files

Use when an instruction file holds lines that change nothing the agent does: a rule it follows anyway, a duplicate,
a rule for a tool the project no longer uses. Delete them. The script does not count this kind: read the files.

## Information access

Use when calls fail because something is missing: a command or file not found, a refused call (a permission rule, a
hook, the user), a network failure. The change gives access the safe way: dev server logs teed to a file the agent can
read, read-only access to a service, a documented command for the task, a permission rule for a safe command. Never
widen access to secrets or to writing outside the project.
