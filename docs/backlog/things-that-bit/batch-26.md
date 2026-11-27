# Things that bit the twenty-sixth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit Q34, Q36 and Q39:
- Builders again committed on the brief's branch name (`claude/q34-hook-events` and so on) while the harness branch
  stayed at the base. Merging the brief's branch worked; check both names with `git log <base>..<branch>` first.
- The installed binary is the best source for a hook event's facts: `strings /opt/claude-code/bin/claude` shows the
  full event list (34 events in 2.1.332), the input schema, the matcher field and the help text for each exit code.
- Claude Code's agent loader drops one BOM, then needs `^---\s*\n`, a closing `---` line, a `name` and a
  `description`. Its YAML parser accepts an unclosed flow list (`tools: [Read, Grep`) that ours rejects. A probe of
  only the opening line missed that; the cold run found it.
- SubagentStop deletes the watchdog's state file for the agent, so a cold run has to copy the state folder during
  the session (at SubagentStart) to read `ro` afterwards.
- The "empty HOME" of a cloud cold run is not empty after start-up: the environment writes `.claude.json` and syncs
  plugins into it. No plugin agent showed up, but check the init event's agents list before trusting a count.
- A mutant that adds an early `return null` survived because no test had a newer unreadable file with a session
  given, though the brief asked for that case. Read the brief's test list against the test file before the review.
- Roster tests compare each marker with COVENANT.md, so setting every marker back at once passes (Q41).
- The release notes check wants a real "Tests: <n>" line; a placeholder fails `npm test`.
