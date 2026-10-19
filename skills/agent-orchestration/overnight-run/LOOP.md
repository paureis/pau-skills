# Waking an overnight run

A run is a series of iterations. Something has to start each one. Pick the way that fits where the run lives and
what the machine will do overnight, and write it into `RUN.md`. Never assume a tool exists: look at this session's
tool list before naming one.

Checked on Claude Code 2.1.303 in October 2026, with headless runs. Flags, modes and tools move between versions;
check `claude --help` when the version changes.

## In a session that stays open, or with the built-in /loop

When the user leaves a session open (over lunch, a loop at the desk), the simplest wake is none: keep iterating in
the current turn until a stop. For a run that should check back at intervals instead, the built-in `/loop` command
re-runs a prompt on an interval, and a session can schedule its own prompts.

What they need, and where they end:
- `/loop` and the session's scheduled prompts live inside this Claude process. They end when it exits, and
  recurring ones expire after a few days. They never wake a `claude -p` that has exited.
- The machine must stay awake (a laptop lid closing suspends the run).
- The session's permission mode decides what the run can do. A permission prompt waits until morning, and
  `acceptEdits`, `auto`, `bypassPermissions` or a broad allow rule lets a turn delete or rewrite the log and the
  control folder. Start the session for the night from the worktree with `claude --permission-mode dontAsk` and the
  `ALLOW` and `DENY` lists from the script below, and test one iteration with them.

## The outer shell loop around claude -p

For a run that must outlive this session, a shell script starts one headless turn after another. Between turns the
script checks the off switch, the fingerprint of the predicate, that the tree is clean, the predicate itself and the
budget. Those checks run outside the turns, and the turns cannot write the control folder that holds the script,
the predicate and the contract. That is as far as it goes: the turns run code they can edit (the tests, the build,
commit hooks), so read "What protects the repository" in the skill before trusting it with push credentials.

Write this to `<control>/loop.sh` and fill in the values. It starts a new session each time it is started, so a
rehearsal and the night are separate conversations:

```bash
#!/usr/bin/env bash
# The outer loop of an overnight run. It lives in the control folder, which no turn can write.
# Fill in the values when the run starts, never while it runs.
set -u
CTL='/abs/path/run/control'        # RUN.md, done.sh, predicate.sha, log.mjs, AUDIT.md, this script; STOP when made
STATE='/abs/path/run/state'        # decisions.tsv, resume.md, summary.md, and this script's own output
WT='/abs/path/worktree'
PRED_FILES=('tests/test_parse.py') # at least one file in the worktree that defines the predicate; frozen with done.sh
TEST='pytest -q'                   # the exact test command; its allow rule matches exactly this
MODEL='<the model the user chose, or the one this session runs on>'
MAX_TURNS="${MAX_TURNS:-10}"       # with PER_TURN, at most 20 iterations: the skill's default budget
PER_TURN=2
TURN_USD=2                         # --max-budget-usd per turn; the night costs at most (MAX_TURNS + 2) x this
DEADLINE='2026-10-19T07:00'        # no new turn after this local time (a budget, not a finish)

ALLOW=('Skill(overnight-run)' 'Agent' "Read(/$CTL/**)" "Read(/$STATE/**)" "Edit(/$WT/**)"
  "Edit(/$STATE/resume.md)" "Edit(/$STATE/summary.md)"
  "Bash(node $CTL/log.mjs *)" "Bash(bash $CTL/done.sh)" "Bash($TEST)" "Bash(ls $CTL)"
  "Bash(git -C $WT status *)" "Bash(git -C $WT diff *)" "Bash(git -C $WT log *)" "Bash(git -C $WT show *)"
  "Bash(git -C $WT add *)" "Bash(git -C $WT commit *)" "Bash(git -C $WT restore *)" "Bash(git -C $WT clean -f -- *)"
  "Bash(git -C $WT hash-object *)")
DENY=("Edit(/$CTL/**)" 'Bash(git push *)' "Bash(git -C $WT push *)")

# A child that inherits this session's CLAUDE* variables reuses its session id. Keep only the login and the provider.
KEEP='^(CLAUDE_CONFIG_DIR|CLAUDE_CODE_OAUTH_TOKEN|CLAUDE_CODE_USE_BEDROCK|CLAUDE_CODE_USE_VERTEX)$'
for v in $(compgen -e | grep '^CLAUDE'); do [[ "$v" =~ $KEEP ]] || unset "$v"; done
# A layer, not a boundary: git rewrites every push address to a path that does not exist.
NOPUSH='url.file:///nonexistent/push-disabled/.pushInsteadOf'
export GIT_CONFIG_COUNT=4 GIT_CONFIG_KEY_0="$NOPUSH" GIT_CONFIG_VALUE_0=/ GIT_CONFIG_KEY_1="$NOPUSH" \
  GIT_CONFIG_VALUE_1=https:// GIT_CONFIG_KEY_2="$NOPUSH" GIT_CONFIG_VALUE_2=git@ GIT_CONFIG_KEY_3="$NOPUSH" \
  GIT_CONFIG_VALUE_3=ssh://

fingerprint() { git -C "$WT" hash-object "$CTL/done.sh" "${PRED_FILES[@]/#/$WT/}"; }
clean() { [ -z "$(git -C "$WT" status --porcelain)" ]; }
why_stop() {   # prints the reason to stop, or nothing
  if [ -e "$CTL/STOP" ]; then echo 'off switch'
  elif [ "$(fingerprint)" != "$(cat "$CTL/predicate.sha")" ]; then echo 'predicate changed'
  elif clean && bash "$CTL/done.sh" > "$STATE/done.out" 2>&1; then echo 'predicate met'
  elif [[ "$(date +%Y-%m-%dT%H:%M)" > "$DEADLINE" ]]; then echo 'budget: time'
  fi
}

cd "$WT" || exit 1
case "${1:-run}" in
  fingerprint) fingerprint; exit ;;
  check)
    if claude auth status > /dev/null 2>&1; then echo 'login: ok'; else echo 'login: missing'; exit 1; fi
    if git -C "$WT" push --dry-run origin HEAD > /dev/null 2>&1; then echo 'push guard: a push would go through'; exit 1; fi
    echo 'push guard: a push is refused'; exit 0 ;;
  run) ;;
  *) echo 'usage: loop.sh [run | check | fingerprint]'; exit 2 ;;
esac

SID=$(node -e 'console.log(require("node:crypto").randomUUID())')
echo "$SID" >> "$STATE/sessions.txt"
echo $$ > "$STATE/loop.pid"
child=''
on_signal() {  # stop the running turn too, so no claude process is left behind
  if [ -n "$child" ]; then pkill -TERM -P "$child" 2>/dev/null; kill "$child" 2>/dev/null; wait "$child" 2>/dev/null; fi
  echo "$(date -u +%FT%TZ) loop stopped by a signal; the running turn was stopped too" >> "$STATE/loop.out"
  rm -f "$STATE/loop.pid" "$STATE/turn.pid"; exit 143
}
trap on_signal TERM INT HUP

started=0      # 1 once a turn has saved the session, so the next one resumes it
turn() {       # turn <capture name> <prompt> [more allow rules]
  local name=$1 prompt=$2; shift 2
  local session=(--session-id "$SID"); [ "$started" = 1 ] && session=(--resume "$SID")
  claude -p "$prompt" "${session[@]}" --model "$MODEL" --permission-mode dontAsk --strict-mcp-config \
    --max-budget-usd "$TURN_USD" --output-format stream-json --verbose \
    --allowedTools "${ALLOW[@]}" "$@" --disallowedTools "${DENY[@]}" \
    > "$STATE/$SID-$name.jsonl" 2> "$STATE/$SID-$name.err" < /dev/null &
  child=$!; echo "$child" > "$STATE/turn.pid"
  wait "$child"; local rc=$?; child=''
  grep -q '"type":"result"' "$STATE/$SID-$name.jsonl" && started=1
  echo "$(date -u +%FT%TZ) $name exit $rc" >> "$STATE/loop.out"
}

reason=''
for i in $(seq 1 "$MAX_TURNS"); do
  reason=$(why_stop); [ -n "$reason" ] && break
  turn "turn-$i" "Overnight run, turn $i of at most $MAX_TURNS. Read $CTL/RUN.md and follow it (with the overnight-run skill, step 5, if it is available). Do at most $PER_TURN iterations, then end the turn."
done
[ -n "$reason" ] || reason=$(why_stop)
[ -n "$reason" ] || reason='budget: turns'
echo "$(date -u +%FT%TZ) loop ended: $reason" >> "$STATE/loop.out"
FINAL="The overnight loop ended: $reason. This turn does no work on the task. Follow steps 6 to 8 of the overnight-run skill (or RUN.md): the stop row, the morning audit by a fresh subagent given the prompt in $CTL/AUDIT.md with the turn captures $STATE/$SID-*.jsonl as the transcripts, and the summary in $STATE/summary.md. Log every row without --run, so it carries this session's id."
turn final "$FINAL"
if ! grep -q '"type":"result"' "$STATE/$SID-final.jsonl"; then started=$((1 - started)); turn final-retry "$FINAL"; fi
rm -f "$STATE/loop.pid" "$STATE/turn.pid"
```

Notes on the script:
- `--permission-mode dontAsk` refuses everything the allow rules do not name, without asking. The checks behind
  that are in the skill's "What protects the repository". Add one rule per command the task needs, written the way
  the turn will type it: `Bash(pytest -q)` covers exactly that command, and `Bash(pytest *)` covers it with any
  arguments (any arguments to a test runner can run any code, so prefer the exact form). A rule covers one command,
  so `a && b` or `a; echo $?` needs a rule for each part.
- No `--add-dir`: the absolute `Edit`, `Write` and `Read` rules reach the state and control files without it. Never
  pass `--add-dir` for the parent folder: it opens the main checkout and every repository beside it.
- The turns use the real HOME, so the login and the installed skills apply. The skill name in `Skill(...)` is the
  name in the `/` menu; a skill uploaded to claude.ai shows up as `anthropic-skills:overnight-run`. The prompt points
  at `RUN.md` first, so a turn that cannot load the skill still has the contract.
- `--strict-mcp-config` with no `--mcp-config` gives the turns no MCP server, which removes every mail, chat and
  tracker tool in one step (and any `send_later`-style tool with them).
- Each turn's capture is `<state>/<session id>-turn-<n>.jsonl`, and `loop.out` logs each turn's exit code. The
  final turn starts the session itself when the loop stopped before any turn saved one (the off switch was already
  there, the predicate already passed, the first turn failed).

Before starting, attended:
1. `bash <control>/loop.sh fingerprint > <control>/predicate.sha`, then `bash <control>/loop.sh check`: it must print
   `login: ok` and `push guard: a push is refused`.
2. A rehearsal: `MAX_TURNS=1 bash <control>/loop.sh` while the user watches, then read its captures with
   `node <control>/log.mjs calls <capture>`. A turn blocked by a missing allow rule shows refused calls there, and
   would block every turn of the night. The rehearsal is a session of its own, and its rows stay in the log.

Start it so it outlives this session:

```bash
nohup bash <control>/loop.sh > <state>/loop.nohup 2>&1 < /dev/null &
```

The script writes its own process id to `<state>/loop.pid` (`$$`, the real one; `$!` after `cd dir && cmd &` is the
id of a subshell) and the running turn's to `<state>/turn.pid`. Check it with
`kill -0 "$(cat <state>/loop.pid)" && tail -n 3 <state>/loop.out`.
- To stop it gently, `touch <control>/STOP`: the loop stops before the next turn, or reports the off switch after
  the last one, and the final turn writes the stop row, the audit and the summary. The final turn always runs and
  does no work on the task.
- To stop it at once, `kill "$(cat <state>/loop.pid)"`: the script stops the running turn too. Then run steps 6 to
  8 by hand. If the script was killed with `kill -9`, also `kill "$(cat <state>/turn.pid)"`.

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
  drop rows. The fingerprint is checked against the `predicate.sha` in the first commit of the run branch, which a
  later firing cannot rewrite without a force push.
- There is no control folder a firing cannot write: the clone is all it has. The cloud run is weaker on that point
  than the outer loop; say so in `RUN.md`, and have the morning audit diff the copied files against that first
  commit.
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
