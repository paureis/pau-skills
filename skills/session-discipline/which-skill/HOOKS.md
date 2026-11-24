# What runs without asking

Hooks act on every session where their plugin is installed. Each can be turned off in `.claude/pau-skills.json`
(see hooks/README.md in the repository).

| Hook | When it acts |
|---|---|
| `roadmap`, `branch-context` | Session start: roadmap position, git branch and working-tree state |
| `compact-snapshot` | Before and after a compaction: keeps your last messages, edited files and todos |
| `skill-usage` | Each skill start, typed or by the agent: logs the time and name (never the prompt) for the usage report below |
| `secret-guard` | Blocks a credential being written into a file |
| `file-size-guard` | Blocks a change that leaves a file over 5,000 tokens and larger than before, with a split recipe |
| `destructive-guard` | Blocks commands that destroy work or data for good |
| `no-verify-guard` | Blocks skipping git hooks or commit signing |
| `merge-guard`, `inline-backtick-guard` | Block a raw `gh pr merge` and backticks in inline interpreter payloads |
| `test-tamper-guard` | Asks before a test is skipped, focused or loses assertions |
| `suppression-reason` | Tells the agent when an edit adds a lint or type-check suppression with no reason |
| `verify-before-done` | Sends the agent back once if it changed code and ran no checks |
| `no-idle` | Tells every subagent never to end its turn waiting |
| `subagent-watchdog` | Notes, then asks, when a subagent reruns a command or goes long with no edit; lists stuck subagents in the main session |
| `lazy-senior` | Adds the smallest-complete-change rules to every session and subagent |
