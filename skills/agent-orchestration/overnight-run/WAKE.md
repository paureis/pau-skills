# How the run wakes

Names and `${CLAUDE_SKILL_DIR}` mean what SKILL.md says: `${CLAUDE_SKILL_DIR}` is this folder.

| The situation | Use | It needs |
|---|---|---|
| The session stays open (lunch, a long loop at the desk) | a session started for it in `dontAsk` mode, iterating in its turn, or the built-in `/loop` | the machine awake and the session open |
| The run must outlive this session | the outer shell loop around `claude -p` in LOOP.md | a machine that stays on; the login and the skill reachable by a headless run |
| The machine will be off | a cloud scheduled task (`/schedule`) | the run branch pushed, which only the user can allow in advance |
| Waiting on an event (CI, a long build) | Monitor or a background Bash command | the session open, and the tool in this session |
| A self check-in at a time | a `send_later`-style tool | the tool in this session's tool list |
