# Things that bit the ninth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit the ninth batch (Q11, what batch 8 left):
- The auto-mode permission check refused `eng-lead`'s Agent call for one of four builders, with no reason given; the
  other three started from the same call shape. The orchestrator did not retry it as a way around the refusal: it
  asked the owner, and on a yes started that builder itself.
- `eng-lead` handed back at once with the builders' agent IDs, as told, and the main session started the reviewers
  from one contract file and sent the fix rounds. This worked again; keep telling it up front.
- The plan checks found a real problem in every brief again: a missed caller that would have run every eval scenario
  in an empty folder, a re-read of a file read in turn 1 that is also refused after `--resume`, a lookup clause that
  let `sku in CATALOG` pass `constructor`, a draft folder `git add -A` would stage, and a persona that listed every
  seeded gap. Every reviewer still found something, and the cold runs found what the reviews could not: the scan
  moved after the answer lost project-setup's bundled reads in a resumed turn.
- After `--resume` in a headless run, the skill's `allowed-tools` grant is gone even for a file read in the first
  turn. Read every bundled file a later turn needs in the first turn, and say not to read it again.
- In a headless run, Bash `cat` of a file outside the working folder is blocked, but `cd <skill folder> && grep -n ""
  <files>` was allowed and read the area files; a skill's own files can arrive through Bash as well as Read.
- A rule tested by a cold run needs a control and more than two runs: with two runs per side the base rules closed
  the gap once in two, so four per side were needed before the difference meant anything.
- An eval scenario at the 30-turn limit costs about 28 US dollars; the three scenarios cost 55, against an estimate
  of 30. The introduction stop adds one turn to every run.
- `node` and `claude` sit in the same folder here, so emptying PATH to keep `claude` out of a test also drops `node`;
  run node by its absolute path.
- The worktree guard also refused `node -e '<program>'` (it can start a REPL), `bash $D/x.sh` with a variable path,
  and a python heredoc whose text names `.gitignore`. Put the program in a file and use literal paths.
- A sed mutation anchored on a regex tail (`(?![\p{L}])/iu;`) hit two regexes that end the same way. Anchor a
  mutation on text unique to its line.
