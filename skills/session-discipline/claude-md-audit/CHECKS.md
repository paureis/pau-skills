# CLAUDE.md audit: checks, file map and report template

Reference for Phases 2 and 3 of `SKILL.md`.

## Which files are read, and when

The scan finds these. Knowing when each is loaded tells you what it costs.

| File | Read by | When |
|---|---|---|
| `~/.claude/CLAUDE.md` | Claude Code | Every session, every project on the machine |
| `CLAUDE.md` or `.claude/CLAUDE.md` at the root | Claude Code | Every session in this project |
| `CLAUDE.md` in a parent directory | Claude Code | Every session started below it |
| `CLAUDE.local.md` | Claude Code | Every session; personal, should be gitignored |
| `CLAUDE.md` in a subfolder | Claude Code | When work touches files in that folder |
| `.claude/rules/*.md` | Claude Code | Every session, or only for matching files if the frontmatter has `paths:` |
| `@path/to/file` inside any of the above | Claude Code | Same as the file that imports it (imports can nest) |
| `AGENTS.md` | Codex, Cursor, Copilot, several others | Their sessions; Claude Code reads it only if imported |
| `.cursorrules`, `.cursor/rules/*.mdc` | Cursor | Always, or by glob in `.mdc` frontmatter |
| `.github/copilot-instructions.md`, `.github/instructions/*.instructions.md` | GitHub Copilot | Always, or by `applyTo:` |
| `.windsurfrules`, `.windsurf/rules/` | Windsurf | Its sessions |
| `.clinerules` (file or folder) | Cline | Its sessions |
| `GEMINI.md` | Gemini CLI | Its sessions |

Tools change these rules. If a finding depends on exact loading behaviour, check the tool's current documentation
rather than trusting this table.

When a repository has both `CLAUDE.md` and `AGENTS.md` with overlapping content, a common fix is to keep one source
and have the other import or point to it (`@AGENTS.md` in CLAUDE.md, for example), so the two cannot drift.

## Detect the project's real tooling first

Before calling a command stale or missing, find out what the project actually uses. Read manifests and lockfiles;
do not assume a stack.

| Signal in the repository | Ecosystem | Where the commands are defined |
|---|---|---|
| `package.json` plus `package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` / `bun.lockb` | JS/TS | `scripts` in package.json; the lockfile says which package manager |
| `pyproject.toml`, `uv.lock`, `poetry.lock`, `requirements*.txt`, `tox.ini`, `noxfile.py` | Python | `[project.scripts]`, `[tool.poe.tasks]`, tox/nox sessions, `Makefile` |
| `go.mod` | Go | `go test ./...`, `Makefile`, `magefile.go` |
| `Cargo.toml` | Rust | `cargo` subcommands, `[alias]` in `.cargo/config.toml`, `justfile` |
| `pom.xml`, `build.gradle(.kts)`, `gradlew` | Java/Kotlin | Maven phases, Gradle tasks (`./gradlew tasks`) |
| `Gemfile`, `Rakefile` | Ruby | `rake -T`, `bin/` scripts |
| `composer.json` | PHP | `scripts` in composer.json |
| `*.sln`, `*.csproj` | .NET | `dotnet build`, `dotnet test` |
| `mix.exs` | Elixir | `mix help`, aliases in mix.exs |
| `Makefile`, `justfile`, `Taskfile.yml` | Any | Targets, recipes, tasks |
| `.github/workflows/`, `.gitlab-ci.yml`, other CI config | Any | What CI really runs: the most reliable answer to "how are tests run" |

The scan checks `npm`-family scripts, `make` targets and `just` recipes. For everything else, compare the commands
in the instruction files against these sources by reading. Prefer read-only checks (`./gradlew tasks`,
`rake -T`, `cargo --list`, `just --list`) over running a build.

## Judgment checklist, with examples

### Contradictions
Look across every file the same session loads (user-level, ancestors, project, local, imports) and across files for
different tools in the same repository.
- Package manager or runner disagreements: "use pnpm" vs a fenced `npm install`.
- Workflow disagreements: "always ask before committing" vs "commit after every task".
- Style disagreements with the formatter config: "use tabs" while `.editorconfig` or the formatter says spaces.
- Scope disagreements: the user-level file says "never write tests unless asked", the project says "every change
  needs a test". Say which one wins today (the more specific file usually does, but the agent sees both) and propose
  removing the losing one or scoping it.
Severity: high, or critical when one side is about destructive or irreversible actions.

### Relevance and cost
For each section in the scan's "largest sections" list, ask: in what fraction of sessions in this repository does
the agent need this? Long architecture essays, API tables, onboarding history and changelogs are common culprits.
Options, cheapest first: delete it; replace it with a one-line pointer to the doc ("Deployment: see
`docs/deploy.md`"), which the agent reads only when needed; move it to a nested `CLAUDE.md` or a path-scoped rules
file; turn a procedure into a skill. Note that an `@import` does not save tokens: it loads the file every time.

### Obvious or redundant with the code
Rules that a linter, formatter, type checker or test already enforce ("use semicolons", "no unused imports"),
rules that any agent follows by default ("read the file before editing it"), and descriptions of the folder tree
that the agent can see with one listing. Propose deletion, unless the rule records a non-obvious reason or an
exception the tooling does not encode.

### Vague rules
A rule is vague if you cannot tell, after the fact, whether it was followed. Rewrite it with a checkable condition or
delete it. Examples of rewrites:
- "Write clean code" becomes nothing (delete) or a specific rule the project needs ("functions over 60 lines need a
  reason in review").
- "Test properly" becomes "every bug fix adds a test that fails without the fix; run `<test command>` before
  reporting done".
- "Be careful with the database" becomes "never run migrations against any environment except local; production
  migrations go through CI".

### Rules that keep being broken
Signals: the scan's emphasised rules (capitals, "again", "NEVER"); the same rule reworded several times in
`git log -p -- CLAUDE.md`; the user saying "it keeps doing X". A rule that has been broken more than twice while
written down should become a mechanism: a PreToolUse hook, a pre-commit check, a CI step or a test. Describe the
hook (its event, what it matches, what it blocks), point the user to the `rule-to-hook` skill if it is installed, and
propose shortening the rule to one line that names the hook once it exists.

### Missing essentials
An agent should be able to find, from the always-loaded files or one pointer away:
- [ ] install or setup command
- [ ] build command
- [ ] full test command and how to run a single test or file
- [ ] lint, format and type-check commands
- [ ] where the main source, tests and configuration live (only if not obvious from the tree)
- [ ] files or folders that must not be edited (generated code, vendored code, migrations already applied)
- [ ] anything with real-world side effects (deploys, emails, paid APIs) and how to avoid triggering it
Each one you propose adding must be verified against the repository (manifest, CI config, Makefile). An invented
command is worse than a missing one.

### Secrets and personal data
API keys, tokens, passwords, connection strings with credentials, private keys, personal emails and phone numbers,
internal hostnames that should not be public. For each: propose removal, recommend rotation (git history keeps the
old value), and suggest where it belongs instead (an environment variable, a secret manager, a gitignored local file).

### Layering
- Personal preferences ("I like terse answers") in the shared project file: move to `CLAUDE.local.md` or the
  user-level file.
- `CLAUDE.local.md` not listed in `.gitignore`: propose adding it.
- Project-specific paths or commands in the user-level file: they apply to every project; move them.

## Report template

```
# Instruction file audit: <repository name>

Scanned <date>. <n> files; ~<N> tokens load every session.
If every proposed edit is accepted: ~<M> tokens every session (<delta>).

## Files
| File | Loads | Lines | ~Tokens | Notes |

## Findings

### C1. <short title>   [critical]
File: <path>:<line>
Evidence: <quoted line, masked if secret; scan output; what was checked>
Proposed edit:
    --- a/CLAUDE.md
    +++ b/CLAUDE.md
    @@ ... @@
    -<old>
    +<new>
Token effect: -<n>
Why: <one or two sentences>

### H1. ...   [high]
### M1. ...   [medium]
### L1. ...   [low]

## Hook candidates
<rule, how often broken, suggested mechanism: event, what it matches, what it blocks>

## Decisions needed from you
<contradictions where either side could win; content whose relevance only the user can judge>
```

Number findings by severity letter (C, H, M, L) so the user can approve them as "C1, H1-H3, M2".
