# Hooks and how to configure them

Every hook in this marketplace is on as soon as its plugin is installed, and every one of them can be turned off on
its own. Hooks run as Node.js scripts (Node 20 or later, no packages) and read one optional configuration file.

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
| `secret-guard` | guards | PreToolUse (Write, Edit, MultiEdit, NotebookEdit) | Denies writing a credential into a file: known token formats, private keys, passwords in URLs, random-looking literals assigned to secret names | Denies |
| `destructive-guard` | guards | PreToolUse (Bash, PowerShell) | Denies `rm -r` on the root, home, `..` or outside the project; force pushes to protected branches; `reset --hard`, `checkout .` or `stash clear` over uncommitted work; `git clean -f`; `DROP DATABASE`, `terraform destroy`, `kubectl delete ns` and similar | Denies |
| `no-verify-guard` | guards | PreToolUse (Bash, PowerShell) | Denies `--no-verify`, `commit -n`, `core.hooksPath` overrides, `HUSKY=0`, `SKIP=`, and skipped commit signing | Denies |
| `merge-guard` | guards | PreToolUse (Bash, PowerShell) | Denies a raw `gh pr merge`, and `gh pr close` with branch deletion, which close stacked PRs | Denies |
| `inline-backtick-guard` | guards | PreToolUse (Bash) | Denies `node -e`, `python -c` and similar when a backtick in the payload would be run by bash | Denies |
| `test-tamper-guard` | verification | PreToolUse (Write, Edit, MultiEdit) | Asks before an edit to a test file adds a skip or focus marker or removes assertions, in 11 languages | Asks |
| `verify-before-done` | verification | Stop | Sends the agent back once when it edited code since your last message and ran no test, build, lint or type check after the last edit | Once |
| `roadmap` | session-discipline | SessionStart | Prints the current, next and blocked roadmap items and open questions | No |
| `branch-context` | session-discipline | SessionStart | Prints branch, ahead/behind, uncommitted files, stashes, an unfinished merge or rebase, and a warning on a protected branch | No |
| `compact-snapshot` | session-discipline | PreCompact, SessionStart (compact) | Saves your last messages, edited files, recent commands and the todo list before a compaction, and prints them after | No |
| `no-idle` | agent-orchestration | PreToolUse (Agent, Task), SubagentStart | Adds "never end your turn waiting" to every subagent launch | No |

## Options per hook

### secret-guard

| Option | Default | Meaning |
|---|---|---|
| `allowPaths` | `[]` | Globs (relative to the project) where secrets are allowed. `.env`, `.env.local` and other `.env*` files are always allowed, except `.env.example`, `.env.sample`, `.env.template`, `.env.dist` and `.env.defaults`. |

Placeholders never count: values containing `example`, `test`, `changeme`, `your-`, `xxxx`, `${...}`, or an
environment lookup such as `process.env` or `os.environ`.

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

### verify-before-done

| Option | Default | Meaning |
|---|---|---|
| `testCommands` | `[]` | Extra regular expressions for commands that count as verification, such as `"^./scripts/check"`. |
| `ignorePaths` | `[]` | Globs of edited files that never need verification. Markdown, text and image files are always ignored. |

It blocks at most once per stop: if the agent stops again right after being sent back, it is allowed to.

### branch-context

| Option | Default | Meaning |
|---|---|---|
| `protectedBranches` | `main`, `master`, `develop`, `trunk`, `production`, `release` | Branches that trigger the "create a working branch first" note. |

### compact-snapshot

| Option | Default | Meaning |
|---|---|---|
| `dir` | `.claude/pau-skills/snapshots` | Where snapshots go, relative to the project. The folder gets its own `.gitignore`. |
| `keep` | `10` | How many snapshots to keep. |

### roadmap, merge-guard, inline-backtick-guard, no-idle

These keep their existing configuration: [session-discipline](../plugins/session-discipline/README.md) (roadmap file
and format), [guards](../plugins/guards/README.md) (safe-merge settings), and
[agent-orchestration](../plugins/agent-orchestration/README.md) (`NO_IDLE_RULE`). All of them honour the `"hooks"`
switch and `PAU_SKILLS_DISABLE`.

## Writing your own

The `rule-to-hook` skill in the guards plugin walks through turning a rule that keeps being broken into a hook like
these, with tests that prove it can fail.
