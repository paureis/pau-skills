# Things that bit the twenty-third batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit Q37, reframe and sharpen from pstack:
- The planned verbatim test checked the frontmatter for the presence of each line, which let an extra key and a
  leftover upstream line through, and its splitter tests had no body that held its own `---`. A plan check that builds
  the slice and tries its own mutants found both before the builder started. Test the whole frontmatter, and give a
  splitter a fixture that holds the delimiter.
- `mutate.sh` prints `RESULT: CAUGHT` (exit 0), not KILLED. Briefs that name the verdict should quote the harness.
- When a slice cannot pass its own suite without a line in a shared file (here the typed-skill lists in README and
  which-skill), a narrow exception for those exact lines is better than known failures: the mutation controls need a
  green suite.
- A cold run in the cloud container cannot open most web pages: the proxy refused every fetch. A skill that must
  confirm links needs its cold run on a machine with open network, or the link step stays unproven.
- README.md was 149 bytes under its 20,000-byte limit before the batch. Two new bullets and a credits line pushed it
  over; check `wc -c README.md` before adding to it. It is now 7 bytes under.
- A typed-only skill body with no `$ARGUMENTS` still gets the text typed after `/name`: Claude Code appends it as
  `ARGUMENTS: <text>` (seen in the 2.1.332 code and in the cold run).
- `cd` into a builder's worktree in one Bash call moved the session's working folder there; use absolute paths or a
  subshell for checks in a worktree.
