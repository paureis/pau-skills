# Things that bit the thirteenth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the thirteenth batch (Q16, trigger tests and a skill usage log):
- A writer kept blind to the descriptions still had routes to them: the body of `which-skill` quotes other skills'
  trigger phrases, `~/.claude/skills/synced/` holds every SKILL.md, and the session transcripts and the plan checks'
  clones sit under the scratchpad. The plan check found all three. Name the folders the writer may read, and nothing
  else.
- A writer that paraphrases request 1 lands on the description's other quoted phrases, which are paraphrases of it.
  A checker that compares SHA-256 hashes of every whole-word run against hashes of the hidden phrases told the writer
  which request to reword without showing the phrase; it agreed with the repository test on 592 seeded cases.
- Substring matching flagged "land it" inside "island items". The copied-wording rule matches whole words only.
- A cost cap that reserves the price per run still passes the cap when runs run in parallel and one costs more than
  the price: the review's fake ended at 1.76 US dollars of a 1.00 cap. The cap now reserves each running run's hard
  stop, and the first run runs alone until a real cost is known.
- A run whose setup threw made the whole round fail with no summary and no record of the money already spent, and the
  round deleted its root while another run was still going. A failed run is now one failed entry, and the round waits
  for every run before it cleans up.
- The plan check of the hook found that tests which set only `PAU_SKILLS_HOME` let a hook that ignores it write to the
  real `~/.claude`. Every child also gets HOME and USERPROFILE set to an empty test folder, and the tests assert it
  stays empty.
- A trim test whose line length divides the cut point never tests the partial-line drop; the review found two more
  boundary mutations that survived until a test put a longer line exactly at the cut.
- A reviewer reading the lists as data, with the descriptions in hand, found 7 requests whose expected skill was
  ambiguous and 3 near misses that tested nothing. Fixing them before the paid round cost one fix round of minutes.
- The first transcripts of the paid round settled the facts the trigger mode rested on at no extra cost: a project
  skill comes back as `{"skill":"<name>"}`, `--max-turns 1` still prints the call, and a skill with `allowed-tools`
  is refused in `-p` but its call is still printed.
- `eng-lead` handed back at once with the builders' agent IDs, as told, and every builder report came to the main
  session; the main session started the reviewers and sent the fix rounds, as in batches 7 to 12. Splitting the list
  slice in two (a blind writer and a test writer) kept the fix round on the lists blind.
- Builders and a reviewer still wrote `2>/dev/null` against the standing order; `/dev/null` stayed a character device.
