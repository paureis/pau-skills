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

Only the verify skill's own folder: its `SKILL.md`, `features/`, and the helper scripts it owns. Never product code,
and a skeleton is product code: a skeleton that does not match the loaded screen is a product gap, reported with its
numbers and never resized here. Besides the skill's folder, the pass writes only what the skill's own commands write
during the live pass (its run folder, its evidence folder, its scratch files) and its run notes and helper files in
`.verify-app-notes/`, which are never committed and are removed at the end.
One exception, and only on the user's yes: when the evidence folder is not ignored by git, or has tracked files in
it, the fix is outside that folder (a line in `.gitignore`, or `git rm --cached` on the tracked files). Show the exact
change and ask; with a yes it goes in the same commit, without one it is a finding in the report. A
behaviour the map describes that the app no longer has is either doc drift (fix the map) or a product regression
(report it; never change the map to describe broken behaviour).

## The pass

0. **Find the target.** The `.claude/skills/verify-*/` folder, or another project skill with launch and drive
   sections and a feature map. Several: ask which. None: stop and offer create mode instead of inventing one. Then
   start the run notes (see the end of this section).

1. **Index hygiene.** Run `node "${CLAUDE_SKILL_DIR}/check-map.mjs" <skill folder>`. Fix every problem it prints:
   missing, extra, duplicate or dead index entries, missing headings, leftover markers. An evidence folder git does
   not ignore falls under the exception in "What you may edit".
   A map made before the States heading was required fails with `missing heading "## States"` in each feature file.
   Add the section after `Gotchas`, in the shape of `${CLAUDE_SKILL_DIR}/templates/feature.md`: for a feature with a
   screen, how to force its loading, empty and error states and what each should look like, written from the source
   in step 2; for one with no screen, one line that says so. When the skill has no "States and skeletons" section,
   add it from `${CLAUDE_SKILL_DIR}/templates/verify-skill.md`, filled in for this harness, and for an app with a
   screen copy `${CLAUDE_SKILL_DIR}/templates/measure-boxes.js` into the skill's folder.

2. **Source wave.** One read-only subagent per feature file, all started in one message so they run at the same time
   (the Agent tool; a read-only type such as Explore where the session has one). Each brief names the feature file
   and asks: "How does this user-facing feature work, from the source? Do not run the app and do not edit any file.
   Return: a short summary; the source entry points as file:line; claims in the feature file the source contradicts,
   each with a citation, or none; how the screen shows loading, empty and error (the request, the component, the
   skeleton and its markers), or that it has no screen; one recipe to verify it live."
   Read the sources yourself instead, one feature at a time, only when the map has at most two feature files or the
   session cannot start subagents (no Agent tool, or nesting is off). The report then says the wave was done inline
   and why. Otherwise the subagents run, however small the app looks.

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

   For each feature with a screen, force every state its `States` section lists, check that it still renders as
   described, and keep a screenshot of each. Where the section names a skeleton, measure it with the skill's "States
   and skeletons" recipe at its viewports and keep the report. A state that renders differently from the map is doc
   drift or a product gap, sorted as in step 5. A skeleton mismatch is always a product gap: report it with its
   numbers.

   A doctor failure caused by a wrong instruction in the skill is drift: fix it within the edit scope and try once
   more, restarting only what the fix affects, before calling the pass blocked. A feature you cannot reach is
   "unreachable" only with the concrete missing prerequisite (sign-in, entitlement, operating system, external state)
   and the route you tried; if the map does not mention that prerequisite, that is drift too. Drive every harness fix
   live again before keeping it. The final cleanup comes after the last drive of the pass, including those re-drives.

   When a write to the skill's run folder (`$RUN`) is refused, the outcome is blocked: name the folder, ask the user
   to allow writes there and run the pass again, and never move the run into the project. This holds even when the
   skill's Run folders section does not say it. Remove the notes folder as at any other end.

5. **Sort the findings.**
   - Doc drift: the map describes the user's view wrongly or not at all. Fix it.
   - Harness gap: the app works but the skill cannot drive it. Fix the harness, with the helper rule from create mode
     (the script runs as written and its invocation is in the skill).
   - Product gap: the app is broken. Report it to the user with the evidence. Keep it out of the commit. A loading,
     empty or error state that is missing or broken, and a skeleton that does not match, are product gaps.

6. **Keep or stop.** For changed: re-read every changed file, run check-map again, and commit only the skill folder
   (plus the `.gitignore` change, if the user said yes to it). For clean or blocked: no commit; report the outcome
   and the coverage as they are.

Keep short run notes (features covered, unreachable prerequisites, drift found, outcome), and any other scratch file
the pass makes for itself (such as a helper script), in `.verify-app-notes/` at the project root. The skill's own run
files still go in its run folder. The notes folder is inside the project, where acceptEdits writes without asking (a
path outside the project is refused); it is not under `.claude/`, where every write asks, and it is not the evidence
folder, which is kept. Start it once step 0 has found the target:

- If `.verify-app-notes/` is already there, an earlier pass stopped before its end. List its files and ask whether
  to remove it. On a yes, run `rm -r .verify-app-notes` from the project root. On a no, stop: this pass would mix
  its notes with the earlier pass's.
- Before any note, write `.verify-app-notes/.gitignore` holding the one line `*`, so git never shows the folder and
  the skill's Cleanup check still finds the repository unchanged. Then write the notes in the same folder.

Never commit the notes. At the end of the pass, in every outcome (clean, changed or blocked), draft the report from
the notes, then run `rm -r .verify-app-notes` from the project root, then send the final message.

## Report

```
Verify skill maintenance: <skill folder>
Outcome: clean | changed | blocked (<what blocked it>)
Features: <n> covered from source, <n> driven live, <n> unreachable (<prerequisite and route tried>)
Source wave: <n> subagents | inline (<at most two feature files | no subagents in this session>)
States: <n> features with a screen, every state forced and kept at <path>; States added to <n> files, or none
Doc drift fixed: <list, or none>
Harness gaps fixed: <list, or none>
Product gaps for the user: <each with the evidence path, or none>
Missing from the map: <surfaces with a source path, or none>
Commit: <sha and subject, or none>
```
