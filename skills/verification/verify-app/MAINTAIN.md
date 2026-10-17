# Maintain mode

A feature map starts to drift the day the app changes. This pass keeps a project's verify skill true: every feature
file gets read against the source, and every feature gets driven live. The unit of care is the feature, not the
sentence: cover every feature, without turning every bullet into a command.

## Outcome

End with exactly one, and say which:

- **clean**: every feature had source and live coverage, and nothing needed changing. No commit.
- **changed**: proven corrections to the verify skill, in one commit (or one pull request, if the project works that
  way and the user agrees).
- **blocked**: coverage could not finish, or a proven fix could not be kept safely. Say exactly what blocked it.

## What you may edit

Only the verify skill's own folder: its `SKILL.md`, `features/`, and the helper scripts it owns. Never product code. A
behaviour the map describes that the app no longer has is either doc drift (fix the map) or a product regression
(report it; never change the map to describe broken behaviour).

## The pass

0. **Find the target.** The `.claude/skills/verify-*/` folder, or another project skill with launch and drive
   sections and a feature map. Several: ask which. None: stop and offer create mode instead of inventing one.

1. **Index hygiene.** Run `node "${CLAUDE_SKILL_DIR}/check-map.mjs" <skill folder>`. Fix every problem it prints:
   missing, extra, duplicate or dead index entries, missing headings, an evidence folder git does not ignore.

2. **Source wave.** One read-only subagent per feature file, all started in one message so they run at the same time
   (the Agent tool; a read-only type such as Explore where the session has one). Each brief names the feature file
   and asks: "How does this user-facing feature work, from the source? Do not run the app and do not edit any file.
   Return: a short summary; the source entry points as file:line; claims in the feature file the source contradicts,
   each with a citation, or none; one recipe to verify it live." Without subagents, read each feature's source
   yourself, one feature at a time.

3. **Reconcile.** Every feature file has a returned summary. Spot-check the cited drift; do not re-prove claims that
   came back clean. Merge the recipes into as few app states as you can. Then look at recent changes for user-facing
   surfaces the map lacks (new routes, commands, screens; `git log --since=<last pass> --stat` is a start). Call a
   surface missing only with a concrete source path.

4. **Live pass.** Required even when the source looks clean. You drive; subagents never do. Follow the skill's own
   launch model: one long-lived instance driven one feature after another for a server or UI, or a fresh isolated
   session per drive for a short-lived CLI. Drive every feature at least once, and hold three rules for the whole
   pass, whatever fails:
   1. Never drive an instance that has not passed the doctor since it last surprised you: doctor before the first
      drive, on every fresh session where sessions are the unit, and after every failed drive. Where the doctor cannot
      see the failure (a stuck screen on a healthy process), reset to a known state or relaunch.
   2. The evidence captured so far survives every cleanup. Check it at its folder; do not assume it.
   3. Nothing a drive started outlives that drive's use. Clean up after a failed attempt too, whether the session is
      stuck, exited or shared; for a shared instance, clean up what the drive left, not the instance.

   A doctor failure caused by a wrong instruction in the skill is drift: fix it within the edit scope and try once
   more, restarting only what the fix affects, before calling the pass blocked. A feature you cannot reach is
   "unreachable" only with the concrete missing prerequisite (sign-in, entitlement, operating system, external state)
   and the route you tried; if the map does not mention that prerequisite, that is drift too. Drive every harness fix
   live again before keeping it. The final cleanup comes after the last drive of the pass, including those re-drives.

5. **Sort the findings.**
   - Doc drift: the map describes the user's view wrongly or not at all. Fix it.
   - Harness gap: the app works but the skill cannot drive it. Fix the harness, with the helper rule from create mode
     (the script runs as written and its invocation is in the skill).
   - Product gap: the app is broken. Report it to the user with the evidence. Keep it out of the commit.

6. **Keep or stop.** For changed: re-read every changed file, run check-map again, and commit only the skill folder.
   For clean or blocked: no commit; report the outcome and the coverage as they are.

Keep short run notes (features covered, unreachable prerequisites, drift found, outcome) in a scratch folder outside
the repository. Do not commit them.

## Report

```
Verify skill maintenance: <skill folder>
Outcome: clean | changed | blocked (<what blocked it>)
Features: <n> covered from source, <n> driven live, <n> unreachable (<prerequisite and route tried>)
Doc drift fixed: <list, or none>
Harness gaps fixed: <list, or none>
Product gaps for the user: <each with the evidence path, or none>
Missing from the map: <surfaces with a source path, or none>
Commit: <sha and subject, or none>
```
