# The contract

Names and `${CLAUDE_SKILL_DIR}` mean what SKILL.md says: `${CLAUDE_SKILL_DIR}` is this folder.

```
# Overnight run: <goal>
Goal:        <one or two sentences, in the user's words>
Base:        <branch or commit>      Branch: overnight/<label>      Worktree: <absolute path>
Control:     <control> (never written by the run)      State: <state>
Predicate:   bash <control>/done.sh   frozen with: <files that define it>   At start: <its last line>
Tests:       <the exact test command>
Budget:      <n> iterations; $<x> per headless turn; no new iteration after <time>
Dead end:    <n> approaches with no progress, or no untried idea left
Mode:        dontAsk     Allowed: <the allow rules>     Denied: <the deny rules>
Wake:        <the way from step 4>
Off switch:  touch <control>/STOP
Log:         node <control>/log.mjs append <state>/decisions.tsv ...      Run ids: <session ids, as they start>

Each wake: check <control>/STOP on its own (ls <control>) and act on the answer before anything else: if it exists,
pause (resume.md, a stop row, end). Read this file and the last ten log rows (node <control>/log.mjs show
<state>/decisions.tsv --last 10). Run the predicate: exit 0 on a clean tree means finished. Otherwise make one small
change, run the tests and the predicate, commit it if the predicate moved and no test that passed before fails,
revert it if not, and log one row. Never push, deploy, delete data or message anyone.
```

Log the contract as the first row:

```bash
LOG append <state>/decisions.tsv --phase contract --decision "overnight run: <goal>" \
  --reason "the user asked for it; trust items 1 to 6 hold" --evidence "<control>/RUN.md, predicate.sha" \
  --result "<the predicate's last line>"
```
