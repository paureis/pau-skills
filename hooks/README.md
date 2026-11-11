# Hooks and how to configure them

Every hook in this marketplace is on as soon as its plugin is installed, and every one of them can be turned off on
its own. Hooks run as Node.js scripts (Node 20 or later, no packages) and read one optional configuration file.

Each folder here holds one plugin's hook scripts and its `hooks.json`, which registers them. `lib/` holds the code
they share: `config.mjs` (the configuration below) and `shell.mjs` (splits a shell command into simple commands). The
tests for every hook are in the repository's `tests/` folder.

## Turning hooks off, and setting options

Two files, both optional. The project file wins over the user file, key by key:

| File | Applies to |
|---|---|
| `~/.claude/pau-skills.json` | every project on your machine |
| `<project>/.claude/pau-skills.json` | this project (commit it to share the choice with your team) |

```json
{
  "hooks": {
    "verify-before-done": false,
    "branch-context": false
  },
  "destructive-guard": {
    "protectedBranches": ["main", "release/*"],
    "allowCommands": ["^terraform destroy -target="]
  },
  "secret-guard": {
    "allowPaths": ["tests/fixtures/**"]
  }
}
```

`"hooks"` maps a hook name to `false` to turn it off. Any other top-level key is the options object of the hook with
that name. A missing or malformed file is treated as empty, so a typo never breaks a session.

For a single session, use an environment variable instead (comma-separated names, or `all`):

```bash
PAU_SKILLS_DISABLE=verify-before-done,test-tamper-guard claude
```

To remove every hook from one plugin, disable the plugin: `claude plugin disable guards@pau-skills`.

## The hooks

| Hook | Plugin | Event | What it does | Blocks? |
|---|---|---|---|---|
| [`secret-guard`](guards/secret-guard.mjs) | guards | PreToolUse (Write, Edit, MultiEdit, NotebookEdit) | Denies writing a credential into a file: known token formats, private keys, passwords in URLs, random-looking literals assigned to secret names | Denies |
| [`file-size-guard`](guards/file-size-guard.mjs) | guards | PreToolUse (Write, Edit, MultiEdit) | Denies a change that leaves a file in the project over 5,000 tokens (bytes / 4) and larger than it was, with a split recipe for the file's kind | Denies |
| [`destructive-guard`](guards/destructive-guard.mjs) | guards | PreToolUse (Bash, PowerShell) | Denies `rm -r` on the root, home, `..` or outside the project; force pushes to protected branches; `reset --hard`, `checkout .` or `stash clear` over uncommitted work; `git clean -f`; `DROP DATABASE`, `terraform destroy`, `kubectl delete ns` and similar | Denies |
| [`no-verify-guard`](guards/no-verify-guard.mjs) | guards | PreToolUse (Bash, PowerShell) | Denies `--no-verify`, `commit -n`, `core.hooksPath` overrides, `HUSKY=0`, `SKIP=`, and skipped commit signing | Denies |
| [`merge-guard`](guards/merge-guard.mjs) | guards | PreToolUse (Bash, PowerShell) | Denies a raw `gh pr merge`, and `gh pr close` with branch deletion, which close stacked PRs | Denies |
| [`inline-backtick-guard`](guards/block-inline-backtick-payload.mjs) | guards | PreToolUse (Bash) | Denies `node -e`, `python -c` and similar when a backtick in the payload would be run by bash | Denies |
| [`test-tamper-guard`](verification/test-tamper-guard.mjs) | verification | PreToolUse (Write, Edit, MultiEdit) | Asks before an edit to a test file adds a skip or focus marker or removes assertions, in 11 languages | Asks |
| [`suppression-reason`](verification/suppression-reason.mjs) | verification | PreToolUse (Write, Edit, MultiEdit) | Tells the agent when an edit to a code file adds a lint or type-check suppression (`eslint-disable`, `@ts-ignore`, `# noqa`, `//nolint`, `#[allow(` and others) with no reason next to it | No |
| [`verify-before-done`](verification/verify-before-done.mjs) | verification | Stop | Sends the agent back once when it edited code in the project since your last message and ran no test, build, lint or type check after the last edit; a check script, a Lua tool check or a check listed in `.claude/review-rules.json` counts | Once |
| [`roadmap`](session-discipline/roadmap.mjs) | session-discipline | SessionStart | Prints the current, next and blocked roadmap items and open questions | No |
| [`branch-context`](session-discipline/branch-context.mjs) | session-discipline | SessionStart | Prints branch, ahead/behind, uncommitted files, stashes, an unfinished merge or rebase, and a warning on a protected branch | No |
| [`compact-snapshot`](session-discipline/compact-snapshot.mjs) | session-discipline | PreCompact, SessionStart (compact) | Saves your last messages, edited files, recent commands and the todo list before a compaction, and prints them after | No |
| [`skill-usage`](session-discipline/skill-usage.mjs) | session-discipline | PreToolUse (Skill), UserPromptSubmit | Records each skill start (time, name, typed or by the agent) for which-skill's usage report, and never the prompt | No |
| [`no-idle`](agent-orchestration/no-idle.mjs) | agent-orchestration | SubagentStart; PreToolUse (Agent, Task) only with `rewritePrompt` | Adds "never end your turn waiting" to every subagent as start-up context | No |

## Options per hook

### secret-guard

| Option | Default | Meaning |
|---|---|---|
| `allowPaths` | `[]` | Globs (relative to the project) where secrets are allowed. `.env`, `.env.local` and other `.env*` files are always allowed, except `.env.example`, `.env.sample`, `.env.template`, `.env.dist` and `.env.defaults`. |

Placeholders never count: values containing `example`, `test`, `changeme`, `your-`, `xxxx`, `${...}`, or an
environment lookup such as `process.env` or `os.environ`.

### file-size-guard

| Option | Default | Meaning |
|---|---|---|
| `maxTokens` | `5000` | The limit in tokens (UTF-8 bytes / 4) for every file. Exactly the limit is not over it. |
| `pathLimits` | `{}` | Globs (relative to the project, or a file name alone) mapped to a limit in tokens for the files that must be big, such as `{ "docs/api.md": 8000 }`. The first matching glob wins. |
| `ignorePaths` | `[]` | Globs of files never checked. |

A value that is not a positive number falls back to the default. It refuses a Write, Edit or MultiEdit when the file
would be over its limit after the change and larger than before (a new file counts as 0 before), so a change that
keeps an old big file the same size or smaller passes. Only files inside the project count. Always skipped: lockfiles
(`package-lock.json`, `yarn.lock`, `Cargo.lock`, `poetry.lock`, `go.sum` and others), notebooks, `*.min.*`, binaries,
files with `@generated` or `DO NOT EDIT` in their first 5 lines, paths marked `linguist-generated` or
`linguist-vendored` in `.gitattributes`, and git-ignored paths. The two git rules run only for a change that would
be refused; without git they do not apply. An edit the tool itself would refuse passes: an `old_string` that is not in
the file, or is in it more than once without `replace_all`. Claude Code's Edit may match after turning CRLF line
endings into LF; such an edit is not measured and passes. The message gives a recipe for the file's kind (code, test
file, long document, log, SKILL.md, data file), worded for a new file or for one that grows, and asks the agent to
tell you, instead of starting a large refactor, when splitting is not part of your task. It also gives the
`pathLimits` entry and the off switch as whole JSON files. A `pathLimits` glob without a `/` matches that file name
in every folder, so a limit for the root `README.md` covers every `README.md`.

It sees only the Write, Edit and MultiEdit tools. A file written by a Bash command (a heredoc, a redirect, or a
generator script) is not checked; a check in CI, like this repository's `tests/file-size.test.mjs`, catches those.

### destructive-guard

| Option | Default | Meaning |
|---|---|---|
| `protectedBranches` | `main`, `master`, `develop`, `trunk`, `production`, `prod`, `staging`, `release`, `release/*`, `stable` | Branches that may never be force-pushed, deleted remotely or deleted with `branch -D`. The list replaces the default. |
| `allowCommands` | `[]` | Regular expressions. A command that matches one is never denied. |
| `allowPaths` | `[]` | Absolute directories under which `rm -r` is always allowed. The OS temp directory, `/tmp` and `/var/tmp` are always allowed. |

It runs `git` read-only (status and the current branch) only when a command needs it.

### no-verify-guard

| Option | Default | Meaning |
|---|---|---|
| `allowSigningBypass` | `false` | Allow `--no-gpg-sign` and `-c commit.gpgsign=false`, for projects that do not require signed commits. |

### test-tamper-guard

| Option | Default | Meaning |
|---|---|---|
| `mode` | `"ask"` | `"ask"` shows you a permission prompt; `"deny"` refuses outright. |
| `extraTestPaths` | `[]` | Globs that also count as test files, in addition to the usual `test/`, `tests/`, `spec/`, `__tests__/`, `*.test.*`, `*.spec.*`, `*_test.*`, `test_*.py`, `*Test.java` and similar. |

### suppression-reason

| Option | Default | Meaning |
|---|---|---|
| `ignorePaths` | `[]` | Globs (relative to the project) of files never checked. Always skipped: `node_modules/`, `vendor/`, `third_party/` and `generated/` folders anywhere, `dist/`, `build/`, `out/`, `target/`, `coverage/` and `gen/` at the project root, `*.min.*` and protobuf output. |

It only adds a note to the agent's context; it never asks, denies or approves. A directive counts only where the tool
honours it: at the start of a comment, outside string literals, or as the attribute or annotation itself. "No reason"
is this hook's own criterion: a reason is free text in the tool's own syntax (`-- why` for eslint, rubocop and phpcs,
text after `@ts-expect-error` or `@ts-ignore`, text after the codes for `# noqa`, `# type: ignore`, `pylint: disable`,
`//nolint`, `NOLINT` and `#pragma warning disable`, Rust `reason = "..."` anywhere in the attribute), a trailing
comment after an attribute or annotation, or a plain comment on the line just above (a doc comment, license header,
shebang or encoding line does not count). Rule and error codes alone (`TS2322`, `E501`, `no-console`) are not a
reason. Formatter directives such as `prettier-ignore` are not counted. Only an increase is reported, so existing
suppressions stay quiet until someone adds another. Edits over 1 MB are skipped.

### verify-before-done

| Option | Default | Meaning |
|---|---|---|
| `testCommands` | `[]` | Extra regular expressions for commands that count as verification, such as `"^bin/gate"`. |
| `ignorePaths` | `[]` | Globs of edited files that never need verification. Markdown, text and image files are always ignored. |

It blocks at most once per stop: if the agent stops again right after being sent back, it is allowed to. After it has
sent the agent back once, it judges only the edits made after that, so a later notification does not send the agent
back again for the same edit.

Only edits inside the project count: `$CLAUDE_PROJECT_DIR`, else the hook input's working folder. A relative path
resolves against that folder, and an edit is inside if the path as written or its real path is inside, so a linked
project and macOS `/var` against `/private/var` both work; a path it cannot place still counts. A check counts when it
runs through Bash, PowerShell or the `command` of a Monitor call, and `npm`, `pnpm`, `yarn` and `bun` may carry
`--prefix`, `--cwd`, `--filter`, `--workspace`, `-C` or `-w` with a value before the script, as in
`npm --prefix web test`. A check that ran inside a subagent does not count: the main session reruns the checks itself.
A check started in the background counts.

The checks a project lists for other skills in `.claude/review-rules.json` count too, for example
`{"checks": ["bin/gate --full"]}`. The file is read from the project folder. A missing or broken file, a value that is
not an object, or a `checks` that is not a list counts as no checks; an entry that is not a string or is blank is
skipped, and a leading byte order mark is ignored. A declared check counts as a whole command: literal and
case-sensitive, runs of spaces and tabs count as one space, and it is followed by the end, white space or
`; & | ) < >`.

A check script counts too: `bash`, `sh`, `zsh`, `pwsh`, `powershell`, `node`, `python`, `python3` (or `python3.11` and
the like) or `py`, in any case and optionally with `.exe`, then any flags (only `-ExecutionPolicy`, `-exec`, `-ep` and
`-ex` take a value), then a script path; or a path run directly, `./x` or `.\x`. A flag for inline code or a module
means there is no script: `-c` for bash, sh, zsh and python, `-m` for python, `-e`, `-p`, `--eval` and `--print` for
node, and `-c`, `-Command` and `-EncodedCommand` for PowerShell. The file name is split into words at every character
that is not a letter, between a lowercase letter and a capital, and before the last capital of a run followed by a
lowercase letter (`APITests` is `API` + `Tests`). It is a check when a word starts with `check`, `test`, `verify` or
`lint`, or is `ci`: `tools/check.sh`, `run_tests.py`, `RunTests.ps1` and `run-ci.sh` count, while `latest.py` and
`bash tests/run.sh` do not. The Lua tools count too: `lune run` on a path with such a word, `luau-lsp analyze`,
`selene` and `stylua --check`. Scripts, Lua tools and declared checks count at the start of the command or after `;`,
`&`, `|`, `(` or a new line, and after a `timeout` prefix such as `timeout -k 5 600`. Text inside quotes is not
parsed, so `echo "a; bash tools/check.sh"` counts.

When it blocks, its message says how to name a check it missed (`testCommands`, or `checks` in
`.claude/review-rules.json`). A message that the harness or another agent sends (origin kind `task-notification`,
`peer`, `auto-continuation` or `channel`), such as a task notification that arrives while the session is idle, is not
your message, so the edits made before it still need a check.

### branch-context

| Option | Default | Meaning |
|---|---|---|
| `protectedBranches` | `main`, `master`, `develop`, `trunk`, `production`, `release` | Branches that trigger the "create a working branch first" note. |

### compact-snapshot

| Option | Default | Meaning |
|---|---|---|
| `dir` | `.claude/pau-skills/snapshots` | Where snapshots go, relative to the project. The folder gets its own `.gitignore`. |
| `keep` | `10` | How many snapshots to keep. |

### skill-usage

No options besides the switch. Turn it off with `"hooks": { "skill-usage": false }` in either config file, or with
`PAU_SKILLS_DISABLE=skill-usage` for one session.

It appends one line per skill start to `~/.claude/pau-skills/skill-usage.tsv`, outside every repository. When
`PAU_SKILLS_HOME` is set, that folder takes the place of your home folder, as it does for the config file. Each line
is tab-separated: the time (ISO 8601, UTC), the skill name as given, and `agent` or `typed`. It never writes the
prompt or its arguments, the folder, the session or the transcript. Past 1,000,000 bytes the log keeps the newest
whole lines that fit in 500,000 bytes, written to a temporary file next to it and renamed over it.

A start by the agent (the Skill tool) is always recorded. A typed `/name` is recorded only when the prompt starts with
it, followed by a space or the end, and a `SKILL.md` exists for the bare name (the part after the last colon) in one
of four folders: `~/.claude/skills/<name>/`, `~/.claude/skills/synced/<any>/<name>/`, the project's
`.claude/skills/<name>/`, or this marketplace's own plugin skills. A built-in or custom command (`/clear`, a
`.claude/commands` file) has no `SKILL.md` and is not recorded. A skill typed with another marketplace's prefix, such
as `/other:name`, is recorded when its bare name is a skill in one of the four folders, or when the synced plugin
folder of that prefix holds it (`~/.claude/plugins/synced/<any>/<prefix>/skills/<name>/`); the synced folder of every
account on the machine is read. Any other skill from another marketplace's plugin is not recorded. A prompt that does
not start with `/` returns at once.

`usage-report.mjs` in the `which-skill` skill reads the log: starts per skill, typed and by the agent, and the skills
never started in the last 30 days.

### no-idle

| Option | Default | Meaning |
|---|---|---|
| `rewritePrompt` | `false` | Also append the rule to the prompt of every `Agent` or `Task` call (PreToolUse), returning the whole tool input with only the prompt changed. Only `true` turns it on. It is skipped for a call whose `permission_mode` is `"auto"`: auto mode can refuse a call whose input a hook changed after review. |

By default the rule arrives only as start-up context (SubagentStart), which reaches launches in the foreground, in the
background, in a worktree and as a fork. `NO_IDLE_RULE` replaces the rule text; see
[agent-orchestration](../skills/agent-orchestration/README.md).

### roadmap, merge-guard, inline-backtick-guard

These keep their existing configuration: [session-discipline](../skills/session-discipline/README.md) (roadmap file
and format) and [guards](../skills/guards/README.md) (safe-merge settings). All of them honour the `"hooks"` switch
and `PAU_SKILLS_DISABLE`.

## Writing your own

The `rule-to-hook` skill in the guards plugin walks through turning a rule that keeps being broken into a hook like
these, with tests that prove it can fail.
