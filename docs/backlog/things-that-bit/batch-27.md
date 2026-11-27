# Things that bit the twenty-seventh batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit Q40, Q41 and Q42:
- The init event's agents list is the cheapest probe: one `claude -p "reply ok"` at about 0.2 US dollars answers a
  dozen loading questions at once. Probe again during triage when a finding turns on an unprobed case.
- Claude Code's agent loader reads subfolders at any depth, follows links, reads hidden and git-ignored entries and
  `.git`, and drops a file with no or an empty description (`""`, `''`, `~`, `null`, a comment, `|` with no body).
  An unclosed `tools: [Read, Grep` loads as a comma list, so `[Read` names no tool. `.MD` is not loaded.
- A rule that skips files (no description) can silently weaken an old test whose control file lacks the field. The
  Q42 review found two (AP4, A16). When a skip rule is added, mutate the rule each old test guards, not only the new
  ones.
- The help text of a hook event is not the whole truth: ConfigChange says exit 2 blocks, and the code lets a
  `policy_settings` change through. Grep the code around `hook_event_name:"<Event>"` too.
- Builders cannot run git against a folder outside their worktree (the harness guard), so a brief that points at a
  scratch clone's commit must paste the draft instead. `git archive` into the scratchpad works for a throwaway copy.
- A depth-first walk with a visited set gives answers that depend on name order; breadth first does not.
- Builders committed on the harness branch this time, as told (no branch named in the brief).
- A loose-object `.git` passes 200 folders after about 110 commits; any folder limit needs to skip it.
