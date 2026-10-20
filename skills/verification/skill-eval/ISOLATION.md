# Skill eval: what a run sees, and how it is kept clean

Names such as `setup`, `run` and `actions`, and `${CLAUDE_SKILL_DIR}`, mean what SKILL.md says (this folder).

Checked on Claude Code 2.1.302 in October 2026. Check again with one run when the version changes: the first line
of every transcript lists the skills, plugins and MCP servers the run got, and `actions` prints the skills.

- A headless `claude -p` with your real HOME loads every user skill under `~/.claude/skills/`, skills synced from
  claude.ai included (`~/.claude/skills/synced/`), your plugins, your MCP servers and `~/.claude/CLAUDE.md`. On the
  machine checked that was 213 skills, 21 plugins and 78 MCP servers, a second copy of the skill under test among
  them. A comparison run like that is not clean.
- `run` starts every session with HOME set to an empty folder of its own, `--setting-sources project` (only the
  project's settings and skills), `--strict-mcp-config` (no MCP server) and an environment built from an allowlist:
  the search path, the shell, the locale, the temporary folder, and the proxy and certificate variables a container
  needs (the list is `ALLOWED_ENV` in the script), plus any name you pass with `--pass-env`. Everything else stays
  out: this session's identity (`CLAUDECODE`, `CLAUDE_CODE_SESSION_ID`, `CLAUDE_CODE_REMOTE_SESSION_ID`; with them a
  nested run reuses this session's id), `CLAUDE_ADDITIONAL_DIRECTORIES` (extra folders), `CLAUDE_CONFIG_DIR` (which
  would undo the empty HOME), `ANTHROPIC_*`, IDE variables, `PWD` and the rest. The run then sees the one variant in
  its project's `.claude/skills/` plus Claude Code's built-in skills and plugins.
- **The login.** Before the runs, `run` checks `claude auth status` under an empty HOME. On the container checked,
  the login reached a run with the allowlist alone. On a laptop the login usually lives in `~/.claude` or the system
  keychain, so the check fails. Then either pass the variable that holds a login with `--pass-env` (for example
  `ANTHROPIC_API_KEY`), or use `--real-home` (on `judge` too): the runs use your HOME with `--setting-sources project
  --strict-mcp-config`, which on the machine checked also hid your user and synced skills. What `--real-home` loses:
  the runs can read your home folder, and your `~/.claude/CLAUDE.md`, auto memory and plugins were not checked with
  it; look at the skills list in one transcript, and name `--real-home` in the report as a weaker isolation.
- Built-in skills always remain: `verify`, `debug`, `code-review`, `simplify`, `run`, `deep-research`, `design`,
  `loop`, `batch` and a few more (the full list is in each transcript). When the skill under test does the same job
  as one of them, a run may pick the built-in one: name that confound in the report.
- Do not use `--bare` (it accepts only an `ANTHROPIC_API_KEY`, not a normal login) or `--disable-slash-commands` (it
  turns off every skill, the variant too).
- Windows is refused: there `claude` starts through `cmd.exe`, which splits the prompt and drops the empty `--tools`
  value the reviewer needs. Run the skill under WSL, Linux or macOS.
- Claude Code reads `CLAUDE.md`, `CLAUDE.local.md`, `AGENTS.md` and `.claude/` from the working folder and every
  folder above it, so `setup` refuses a root that has any of them in it or above it. A folder under your home folder
  has `~/.claude` above it; use `mktemp -d`.
- Keep the root path short and plain. In a dry run under a long path with a part starting with `-`
  (`/tmp/x/-home-user-project/...`), a run mistyped its own working folder, its read was refused as outside the
  project, and it gave up: the run measured the path, not the skill. `setup` warns about such a path.
- A run sees its working folder's path in its system prompt, which is why `setup` refuses a meta word in any part
  of it. In the dry run the Read tool refused a path outside the run's folder. Shell commands that only read were
  not checked against outside paths, so a run that went looking could perhaps list other folders. The lab folder is
  apart from the root and no run is told it exists; run folders sit side by side under the root as
  `tmp.XXXXXX/<project>`. Look for any step that leaves the project folder when you read the actions, and note it.
- A subagent started with the Agent tool is not used for the runs: it inherits this session's skills (including any
  installed copy of the skill under test), CLAUDE.md files and MCP servers, and returns only its last message, not a
  transcript. A prompt only change runs headless too, with `--variant <name>=none`.
- **One turn only.** `claude -p` runs the prompt as one turn: the run ends at its first reply. A skill that talks
  with the user over several turns (an interview, a plan agreed step by step) shows only its first move: the files it
  read, the first question or the first draft. Measure what the change does before the run needs an answer, and say
  in the report that later turns were not seen.
