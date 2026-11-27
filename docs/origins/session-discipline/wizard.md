# wizard (Adapted from [`wizard`](https://github.com/mattpocock/skills/tree/6f7f7831a625f040a8e06a0e7954826b87ce775a/skills/engineering/wizard))

Back to the [origins index](../../ORIGINS.md).

Closest upstream: mattpocock/skills `skills/engineering/wizard/` (`SKILL.md` and `template.sh`) at 6f7f783 (MIT,
copyright 2026 Matt Pocock), read 2026-11-26; the folder last changed in 49dd158. `git diff --no-index --shortstat` of
upstream `SKILL.md` (44 lines) against ours (103 lines): 81 insertions, 22 deletions. The only identical non-blank
lines are the frontmatter fences and `name: wizard`, so well under 5 percent of the text is shared. `template.sh` (223
lines) against `wizard.mjs` (402 lines): 402 insertions, 223 deletions, one identical non-blank line (a closing
brace): no shared code. The four-step process (scope, map each step, write, hand off) and the runner's behaviour
(one step per screen, progress, a gate before an irreversible step, a closing list of what is left) are kept and
rewritten. `example-steps.json` is original.

**Problem.** An agent that reaches a step only a person can do (create an API key, set a secret, click through a
dashboard, approve an app) stops with a paragraph of instructions in the chat, and the person loses the thread.

**What this version changes.**
- The agent writes a data file (JSON steps), not a program. One fixed runner, `wizard.mjs` (Node, standard library
  only), reads it, so there is no library to keep from editing, and `check` validates the file without running it.
- Secrets are never captured. Upstream reads them with `read -s` and writes `.env` and `gh secret`; here the person
  puts each value in place and the runner only checks that it is there (`file`, `env`, `envFile`, `url` and `command`
  checks). No value is printed: an unknown key is never named, a URL with credentials or a query or fragment
  parameter that may carry a secret is refused without being printed, a URL's body is never read, a command check
  runs with no shell, no output and no terminal. A test plants a value in five places and checks every output and
  the folder.
- `status` lets the agent confirm the result afterwards, with an exit code and a summary line; upstream has no check
  after the run.
- Resume by checks: a step whose checks pass when `run` starts is passed over, instead of upstream's `.env` defaults.
- A failed check offers retry, skip or quit; the closing list names the steps skipped and not reached.
- Opening the browser: `rundll32` on Windows (no shell, so `&` survives), `wslview` on WSL, `open`, `xdg-open`.
  Nothing is opened when stdout is not a terminal or with `--no-open`.
- Scoping reads env examples, framework config and CI files across ecosystems (GitLab, CircleCI, Azure Pipelines,
  Bitbucket, Jenkins), not only GitHub workflows, and asks for the facts a check needs before the person approves
  the list. An approved step is never dropped from the file without saying so.
- Model-invoked with a trigger-list description, as upstream now is. Migration and cutover use cases are left out:
  it is scoped to setup.
- New rules: never ask for a secret in the chat (rotate it if pasted), never put a value in the steps file, do every
  part that needs no value yourself, hand over the full absolute path, fall back to steps in the chat without Node 20.
