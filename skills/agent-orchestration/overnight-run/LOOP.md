# Waking an overnight run

A run is a series of iterations. Something has to start each one. Pick the way that fits where the run lives and
what the machine will do overnight, and write it into `RUN.md`. Never assume a tool exists: look at this session's
tool list before naming one.

Checked on Claude Code 2.1.303 in October 2026. Flags and tools move between versions; check `claude --help` when
the version changes.

## In this turn, or with the built-in /loop

When the user leaves the session open (over lunch, a loop at the desk), the simplest wake is none: keep iterating
in the current turn until a stop. For a run that should check back at intervals instead, the built-in `/loop`
command re-runs a prompt on an interval, and a session can schedule its own prompts.

What they need, and where they end:
- `/loop` and the session's scheduled prompts live inside this Claude process. They end when it exits, and
  recurring ones expire after a few days. They never wake a `claude -p` that has exited.
- The machine must stay awake (a laptop lid closing suspends the run).
- A permission prompt waits until morning. Put the allow and deny rules in `.claude/settings.local.json` before the
  user leaves, and test one iteration with them.

## The outer shell loop around claude -p

For a run that must outlive this session, a shell script starts one headless turn after another. Between turns
the script, not the agent, checks the off switch, the predicate's hash, the predicate itself and the budget, so a
turn that goes wrong cannot talk its way past them. Every turn resumes the same conversation, so it remembers the
earlier turns, and its transcript stays in one file.

Write this to `<state>/loop.sh`, fill in the values, and keep it outside the work tree:

```bash
#!/usr/bin/env bash
# The outer loop of an overnight run. Values are filled in when the run starts; do not change them during it.
set -u
STATE='/abs/path/to/state'                  # the state folder
WT='/abs/path/to/worktree'                  # the worktree
LOG_MJS='/abs/path/to/log.mjs'              # the skill's log.mjs
MAX_TURNS=10                                # the iteration budget is MAX_TURNS times the iterations per turn
PER_TURN=3                                  # iterations per turn
TURN_USD=2                                  # --max-budget-usd for each turn
DEADLINE='2026-10-19T07:00'                 # no new turn after this local time (a budget, not a finish)
HASH='<git hash-object of done.sh>'
SID='<a new uuid>'                          # uuidgen, or: node -e "console.log(crypto.randomUUID())"
ALLOW=('Skill(overnight-run)' "Bash(bash $STATE/done.sh)" "Bash(node $LOG_MJS *)"
       'Bash(git add *)' 'Bash(git commit *)' 'Bash(git restore *)' 'Bash(git status *)' 'Bash(git diff *)'
       'Bash(git log *)' 'Bash(git hash-object *)' 'Bash(git clean -f -- *)' 'Bash(<the test command> *)')
DENY=('Bash(git push *)' 'Bash(git push)' 'Bash(rm -rf *)' 'Bash(gh *)' 'WebFetch' 'WebSearch')
KEEP='CLAUDE_CODE_OAUTH_TOKEN'              # a login variable to keep, if the login lives in one

# A child that inherits this session's CLAUDE* variables reuses its session id. Drop them all but the login.
for v in $(compgen -e | grep '^CLAUDE'); do [ "$v" = "$KEEP" ] || unset "$v"; done
cd "$WT" || exit 1
if [ "${1:-}" = check ]; then claude auth status; exit $?; fi
echo $$ > "$STATE/loop.pid"
reason='budget: turns'
for turn in $(seq 1 "$MAX_TURNS"); do
  if [ -e "$STATE/STOP" ]; then reason='off switch'; break; fi
  if [[ "$(date +%Y-%m-%dT%H:%M)" > "$DEADLINE" ]]; then reason='budget: time'; break; fi
  if [ "$(git hash-object "$STATE/done.sh")" != "$HASH" ]; then reason='predicate changed'; break; fi
  if bash "$STATE/done.sh" > "$STATE/done.out" 2>&1; then reason='predicate met'; break; fi
  if [ "$turn" = 1 ]; then session=(--session-id "$SID"); else session=(--resume "$SID"); fi
  claude -p "${session[@]}" --permission-mode acceptEdits --strict-mcp-config --add-dir "$STATE" \
    --allowedTools "${ALLOW[@]}" --disallowedTools "${DENY[@]}" \
    --max-budget-usd "$TURN_USD" --output-format stream-json --verbose \
    "Overnight run, turn $turn. Read $STATE/RUN.md and follow it (with the overnight-run skill, step 5, if it is available). Do at most $PER_TURN iterations, then end the turn." \
    > "$STATE/turn-$turn.jsonl" 2> "$STATE/turn-$turn.err"
  echo "$(date -u +%FT%TZ) turn $turn exit $?" >> "$STATE/loop.out"
done
echo "$(date -u +%FT%TZ) loop ended: $reason" >> "$STATE/loop.out"
claude -p --resume "$SID" --permission-mode acceptEdits --strict-mcp-config --add-dir "$STATE" \
  --allowedTools "${ALLOW[@]}" 'Agent' --disallowedTools "${DENY[@]}" \
  --max-budget-usd "$TURN_USD" --output-format stream-json --verbose \
  "The overnight loop ended: $reason. Follow steps 6 to 8 of the overnight-run skill (stop, morning audit, summary), and write $STATE/summary.md." \
  > "$STATE/final.jsonl" 2> "$STATE/final.err"
rm -f "$STATE/loop.pid"
```

Notes on the script:
- The allow rules: one per command the run needs. A rule covers one command, so `a && b` needs both allowed. Add
  the bare form too (`'Bash(pytest)'` beside `'Bash(pytest *)'`) when the command runs with no arguments. Deny rules
  win over allow rules. Add the project's own deploy, release and data commands to `DENY`.
- `--add-dir "$STATE"` lets the file tools read and write `RUN.md`, `resume.md` and `summary.md`, which sit outside
  the worktree. Without it, a turn's writes there are refused.
- `--strict-mcp-config` with no `--mcp-config` gives the turns no MCP server, which removes every mail, chat and
  tracker tool in one step (and any `send_later`-style tool with them). Leave it off only for a server the task
  needs, and deny that server's sending tools.
- `--max-budget-usd` limits one `claude -p` call. The money budget of the night is at most `MAX_TURNS + 1` times
  `TURN_USD`.
- The skill name in `Skill(...)` is the name in the `/` menu: a skill uploaded to claude.ai shows up as
  `anthropic-skills:overnight-run`. The prompt points at `RUN.md` first, so a turn that cannot load the skill still
  has the contract.
- The turns use the user's real HOME, so the login, the installed skills and `~/.claude/CLAUDE.md` apply. Run
  `bash <state>/loop.sh check` first: it prints the login status in the cleaned environment.

Start it so it outlives this session, and record where it is:

```bash
nohup bash <state>/loop.sh > <state>/loop.nohup 2>&1 < /dev/null &
```

The script writes its own process id to `<state>/loop.pid` (`$$`), which is the real one even when a wrapper starts
it; `$!` after `cd dir && cmd &` is the id of a subshell, not of the loop. Check it with
`kill -0 "$(cat <state>/loop.pid)" && tail -n 3 <state>/loop.out`. To stop it gently, `touch <state>/STOP`: the
loop stops before the next turn and the final turn writes the summary. To stop it at once, `kill` that id; then run
steps 6 to 8 by hand.

Before leaving, run one turn with `MAX_TURNS=1` while the user watches, and read its `turn-1.jsonl`: a turn blocked
by a missing allow rule shows up there as refused tool calls, and would block every turn of the night.

## A cloud scheduled task

When the user's machine will be off, a cloud scheduled task (the `/schedule` command, where the account has it)
starts a fresh session on a schedule. Each firing begins from a new clone of the repository and sees only what was
pushed. So:
- It needs the run branch pushed at the end of every firing: allow exactly `git push origin overnight/<label>` and
  deny every other push. Only the user can allow that, before leaving. Without that yes, use the outer loop on a
  machine that stays on.
- **Where the log goes.** Nothing outside the clone survives between firings, so the run branch carries the state:
  `.overnight/<label>/` on the run branch holds `RUN.md`, `done.sh`, `decisions.tsv` and `resume.md`. A firing
  copies that folder out of the clone first (to `$HOME/overnight/<label>/`), appends to the copy outside the work
  tree with `LOG`, as usual, and at its end copies the folder back into the clone and commits it with its work.
  Before appending, check that the copy still starts with the bytes the branch held (`cmp -n`), so a firing cannot
  drop rows. The predicate's hash is checked against the `RUN.md` in the first commit of the run branch, which a
  later firing cannot rewrite without a force push.
- The transcripts of a cloud session stay in the cloud. The morning audit reads them in the session list of the
  account, or, if the firings cannot be read, says in Attention that the audit had the log and the commits only.

## Waking on an event

To wait for something outside (CI on a pushed branch, a long build, a file appearing), a session that stays open can
use the Monitor tool or a Bash command started in the background, where this session has them: each wakes the
session when its condition is met or its command exits. Give each a time limit, and fall back to a long fixed
interval when no event comes. Neither survives the session.

## A self check-in

Some cloud sessions have a tool that delivers a message back into the same session at a set time (a
`send_later`-style tool). Use it only when it is in this session's tool list. `--strict-mcp-config` removes it, and a
local session usually does not have one. Without it, use one of the ways above.
