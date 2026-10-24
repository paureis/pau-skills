---
name: agent-friendly-audit
description: "Mine a project's history (reviews, fix commits, transcripts, instruction files) for mistakes agents repeat, and propose a check or design fix for each, backed by counts. Use when the user says 'make this repo agent friendly', 'find what agents keep breaking' or 'mine our history for agent mistakes', or when agents keep making the same mistake and review has to catch it."
argument-hint: "[focus: a module, a mistake you keep correcting, or a time range]"
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/correct
---

# Agent-friendly audit

Focus: $ARGUMENTS

Find the mistakes agents keep making in this project, from its own history, and propose how to make each one
impossible or loud. Assume every contributor is an agent that sees only the files it opened, copies the nearest
example, and takes the shortest path that builds and runs. So make the easy thing the right thing.

Spend effort in this order: most on the code itself (architecture, types, boundaries), then on checks that run
without judgment (lint, CI, tests), then on prose (instruction files, skills, comments), which works only when an
agent reads it and agrees. Human review is not a layer: a reviewer who must catch the same mistake on every pull
request is the problem this skill fixes.

The output is a plan backed by counts. **Nothing in the project is written until the user says yes**, except the
scratch folder of step 6, where prototypes and proofs run, ignored by git and removed before the plan.

If you started this skill on your own, without the user typing its name or asking for what it does, first say in one
or two lines what it will do and what it will cost, and wait for a yes. A remark or a question that only matches its
description is not asking for it. If the user asked for it, or the brief you are working from does, go ahead.

Bundled files:
- `${CLAUDE_SKILL_DIR}/mine.mjs`: read-only helper (Node 20+, no dependencies). `commits` lists fix, revert and
  fixup commits with the files they touched; `transcripts` prints only what the user typed in this repository's
  transcripts; `folders` finds this repository's transcript folders. It hides emails, common secret shapes and the
  home folder.
- `${CLAUDE_SKILL_DIR}/SLICE-BRIEF.md`: the brief for each mining subagent, with one section per slice.
- `${CLAUDE_SKILL_DIR}/PLAN-TEMPLATE.md`: the plan you hand the user.

Related skills, all optional: `retrospective` learns from one session, this from the whole history;
`instructions-audit` reviews the instruction files for cost and drift; `rule-to-hook` implements one rule as a hook
or check, this finds which rules are needed. None of them runs before the user's yes. After it, use `rule-to-hook`
in step 8 if it is installed, and offer `retrospective` and `instructions-audit` as next steps if they are
installed; without them, this skill covers what it needs inline.

## Privacy, for every step

Transcripts and review comments can hold secrets, tokens, personal data and other people's words.
- Refer to evidence by pointer: a commit hash, a pull request number and comment id, a transcript file and line, a
  `file:line`. Describe it in a few words of your own.
- Quote only the few words a finding needs, never a secret, an email, a person's name or a machine path. Nothing
  raw goes into the plan, a commit message, a code comment, a test fixture, or anything posted (a pull request
  comment, an issue).
- A test or check that proves a fix reproduces the mistake with synthetic input, never pasted transcript text.
- Read only this project's transcript folders, never a glob across every project.
- `mine.mjs` redacts what it can recognise. It is a net, not a guarantee.

## 1. Confirm the prompt

Before mining, restate the audit in a few lines and confirm it with the user (AskUserQuestion, or a plain question):
- the goal in your own words, and the problem behind it (the mistakes the user is tired of correcting);
- the focus from the arguments, or the whole repository;
- the done check: a plan in which every proposed class has two or more instances, a layer, and a proof or the
  reason it has none;
- the sources you will read, from step 2, and any you cannot reach;
- constraints that change the work ("only the code we own", "no new tooling", "report only").

Leave out how to fix things and any guess at the cause; the evidence decides those. If `sharpen` is installed, you
can run it on the audit prompt first; it does this check in more depth. Ask nothing else up front: an open design
question is answered later with a prototype (step 6).

**No one to answer** (a headless `claude -p` run, a scheduled job): do not assume a yes. If the prompt that started
the run already says what to audit and to go ahead, write the restatement as the assumption you work under and
continue; steps 2 to 7 change nothing in the project but the scratch folder of step 6. Otherwise stop here and
report the restatement and the question.

## 2. Find the sources

Check what this session can reach, and write one line per source: where it is, how much is there, and "skipped,
because ..." when it cannot be read.

- **Review comments.** Use the GitHub MCP tools if the session has them, otherwise `gh api` REST routes:
  `gh api --paginate repos/<owner>/<repo>/pulls/comments` (inline review comments, every pull request),
  `gh api --paginate repos/<owner>/<repo>/issues/comments` (conversation comments on pull requests and issues),
  `gh api --paginate "repos/<owner>/<repo>/pulls?state=all"` (the pull request numbers), then
  `gh api repos/<owner>/<repo>/pulls/<n>/reviews` for each one's review summaries. `gh pr list` and `gh pr view` use
  GraphQL and can fail where REST works, so try REST before giving up. On another host use its CLI or API
  (`glab api` for GitLab). With none of these, skip the slice and say so in the plan.
- **Commit history.** Mine the default branch, where merged work lands: `node ${CLAUDE_SKILL_DIR}/mine.mjs commits
  --rev <default branch>` (add `--since <date>` for a time range). Find the default branch with
  `git symbolic-ref --short refs/remotes/origin/HEAD`, or `git remote show origin` when that ref is not set. A local
  copy of it can be stale: compare `git rev-parse <branch>` with `git ls-remote origin <branch>`, and if they differ
  mine the checked-out branch instead and say so. Open branches are not history yet; leave them out unless the user
  asks. A shallow clone hides history: check `git rev-parse --is-shallow-repository` and say so if it prints `true`.
  The plan names the branch and commit that were mined.
- **Transcripts and memory.** `node ${CLAUDE_SKILL_DIR}/mine.mjs folders --repo <checkout>` lists the transcript
  folders of a checkout and its git worktrees, under `$CLAUDE_CONFIG_DIR/projects` or `~/.claude/projects` (the
  default checkout is the current folder). Each folder is named after the checkout's absolute path with every
  character that is not a letter or digit replaced by `-`; it holds `<session>.jsonl` files, and
  `<session>/subagents/agent-*.jsonl` for subagents. A `memory/` folder in it may not exist. Folders are matched by
  path, so a fresh clone, or a checkout at another path, finds none: pass `--repo` with the checkout where the work
  was done, if it still exists; otherwise skip the slice and say so. `transcripts --repo <checkout>` reads exactly
  those folders and refuses any other project's.
  The session running this audit is not evidence (it holds the audit prompt): `transcripts` leaves out the newest
  session when it changed in the last 10 minutes; if the running session is another one, pass
  `--skip <its session id>`.
- **Instruction files.** `CLAUDE.md` at every level, `CLAUDE.local.md`, `.claude/rules/`, `AGENTS.md`,
  `.cursor/rules/`, `.cursorrules`, `.github/copilot-instructions.md`, `.windsurfrules`, `GEMINI.md`, and the files
  they import or tell the reader to follow. A file that is a link to another (`AGENTS.md` to `CLAUDE.md`) is one
  file. Also the enforcement that already exists: lint configuration, CI workflows, git hooks, Claude Code hooks.

## 3. Mine the slices in parallel

Launch one read-only subagent per reachable slice, all in one message with the Agent tool. Use a read-only agent
type (such as `Explore`) when the session has one. Give each the common part of `SLICE-BRIEF.md`, its own slice
section, the focus, and the source line from step 2, with `<skill folder>` replaced by the real path of this
skill's folder (a subagent does not have `${CLAUDE_SKILL_DIR}`). Each returns candidate classes with instances as
pointers, no raw excerpts.

Without the Agent tool, run each slice yourself, one after the other, with the same brief, and write its result in
the brief's format before starting the next.

If the instruction-file slice is small, you can read it yourself instead of giving it to a subagent.

## 4. Group into classes and count

Merge the candidates across slices. A class is one kind of mistake with one fix, for example "reads configuration
from the environment instead of the config loader", not "config problems".

- **A class counts once it has happened twice.** Count instances per source. An instance is one place where the
  mistake was made: a commit that corrects it in three skills is three instances in one source. A written rule
  counts as one instance in the instruction files (it was written because the mistake happened at least once).
- **Live instances.** Search the current code for the mistake. Copies still there count toward the class's total,
  and the fix must cover them, but they are not a source for confidence: they show where the mistake sits, not that
  agents keep making it. A written rule plus one live copy is not a class when the history shows the rule is
  followed (no correction after the rule was written); list it under "Seen once".
- **Not a class**: a habit of the process itself. A commit named "review fixes" or "fixes from the dry run" holds
  several corrections; split it and count each one in its own class.
- **Already enforced.** If a check already catches the class and no instance came after the check was added, list
  the class as enforced, add its row to the rule table, and propose nothing for it.
- **High confidence**: seen in two or more sources (a review comment and a fix commit, a transcript correction and
  an instruction rule). **Medium**: two or more instances in one source. A single instance is dropped; list it under
  "Seen once" so the user can see what was left out.
- **Bots.** Ignore bot comments (a login ending in `[bot]` or a `Bot` user type) unless they repeat a class seen
  elsewhere; then count them, marked as bot.
- **An empty or bot-only slice** is reported as such, and it lowers the confidence of the whole plan: say which
  source was missing.
- **Not enough evidence.** If no class reaches two instances, say so, list what was seen once, and propose nothing.
  Do not stretch thin evidence into a plan.

Order the classes by count.

## 5. Pick the highest layer for each class

Try each layer in this order and stop at the first one that can hold the fix. For each class, say why the layers
above the chosen one did not work.

1. **Architecture: make the mistake impossible.** Give each piece of state one owner and each task one supported
   way. Typical shapes: two ways to do one task (keep one, move callers, delete the other); internals a caller can
   import (make them unreachable so the wrong import fails the build); a hand-synced list (keep one list and derive
   the rest, or fail the build when they disagree); several modules writing the same state; dead code or an old way
   an agent would copy (delete it). When the fix is a new boundary, propose `architect` for it if it is installed.
2. **Types: make the bad state impossible to write.** A distinct type for a validated value, a closed set instead of
   a string, a required field instead of an optional one that is always set.
3. **A lint or CI check whose error names what to use instead**: "use `config.load()` from `app/config`, not
   `os.environ`", not "forbidden call". Use the project's own tooling (ESLint, Ruff, golangci-lint, Clippy, Semgrep,
   ast-grep, a grep step in CI) before adding a new tool. If the pattern is already common, add a ratchet: count the
   current occurrences, store the number, and fail only when a change adds more. The same command runs locally and in
   CI.
4. **A test of the behavior.** Fix or delete a test that still passes when the behavior it checks breaks, or that
   fails when only the internals change.
5. **Prose, last, and only for judgment calls**: a line in the instruction file, a comment at the spot, a skill.
   Nothing fails when an agent skips it.

Exceptions to a check go on the offending line, with a reason, an expiry date, and who approved it, recorded the
way the project records approvals (a role or a handle, such as a code owner team), not a person's name. A proposed
check that allows exceptions reads the expiry and fails once the date has passed; step 6 proves that too.

## 6. Prove each check, and prototype the open questions

Prove every proposed check (layers 2 to 4) in the scratch folder `.agent-audit-scratch/` at the project root: inside
the project, where acceptEdits writes without asking (a headless run refuses a path outside it), and not under
`.claude/`, where every write asks first.
- **A leftover.** If the folder exists at the start, an earlier run left it: list its files and ask whether to
  remove it. On a yes, run `rm -r .agent-audit-scratch` from the project root. If the user wants it kept, or no one
  can answer, do not use it: mark each proof "unproven: a scratch folder from an earlier run is in the way" and go
  on to step 7.
- **Make it.** First write `.agent-audit-scratch/.gitignore` holding the one line `*`, so git never shows or stages
  the folder.
- **Copies.** Each copy goes in its own subfolder `.agent-audit-scratch/<name>/`, not at the top level, where `*`
  hides it and a saved `.gitignore` replaces the folder's own. Remove a copy before making it again
  (`rm -r .agent-audit-scratch/<name>`). Make the subfolder, run
  `git archive <commit> | tar -x -C .agent-audit-scratch/<name>`, and copy in the paths it leaves out (marked
  `export-ignore` in `.gitattributes`) that the check needs. Then add the check's own files (a rule or its
  configuration, a ratchet and its count, a test, a prototype) at their project paths: they cannot enter the project
  before the user's yes.
- **Each copy is its own repository.** A check that lists files through git, or skips ignored files, sees nothing in
  the folder and passes for the wrong reason. Inside the copy's subfolder, never in the scratch folder itself, run
  `git init -q` and `git add -A`; run `git add -A` again after adding a file, and never commit there (the project
  could stage a committed copy as a gitlink). Run the check from inside the copy, the way CI and local runs will, or
  use its option to read ignored files. Confirm from the output that it read the copy: a file count, or the expected
  error. A tool that searches parent folders for its configuration still finds the project's own; take a whole
  checkout when the check needs that commit's.
- **Refused.** If a write or a command in the folder is refused, name it, mark the proof "unproven: <command> was
  refused", and never move the work outside the project.

For each check:
1. Copy the commit before a fix, `<sha>^`, or only the file (`git show <sha>^:<path>` saved as
   `.agent-audit-scratch/<name>/<path>`), with the check's files added.
2. Run the check on it and see it fail, with the error naming what to use instead.
3. Remove the old copies, make the copy `now` from HEAD, and see the check pass in it. A class with live copies
   fails on the current code too: propose it as a ratchet (step 5, layer 3) set to the current count, and show it
   passes at that count and fails with one more copy added to `now`.
4. If the check allows exceptions, take any extra copy out of `now`, add an exception with an expiry date in the
   past, and see the check fail with an error that names it.

Never edit a tracked file for a proof. A check that is one command with nothing to add (a grep, a lint rule given
whole on the command line) may run from the project root once the folder is removed.

Remove the folder before any run on the current code from the project root (the project's own tests, lint or build,
or a command over the whole project), and before step 7: run `rm -r .agent-audit-scratch` there, so no tool that
reads ignored files sees an old copy. If a later class needs the folder, make it again, `.gitignore` first.

Record the command and the results. A check with no past instance to fail on is marked "unproven", with the
reason. For an architecture or type fix, the proof is a small prototype in the scratch folder (the new type, the
narrowed module) that builds, or for an interpreted language loads and runs, and rejects the old code.

When a question comes up that the evidence does not answer ("would a closed type break the plugin callers?"),
answer it with a small prototype instead of asking. Ask the user only what only they can decide: ownership,
priorities, whether a breaking change is acceptable.

## 7. Write the plan and ask

Fill in `PLAN-TEMPLATE.md` and show it in your reply: the sources and what each gave, the classes with counts,
confidence, layer and proof, the rule table (each rule paired with what enforces it), the exceptions format, what
was seen once, and what was skipped. Do not write it into the project unless the user asks. End the reply with the
summary under "Report" below; the plan is what the user reads, the summary is what an agent that started you reads.

Then ask which classes to implement (AskUserQuestion with one option per class, several allowed). Until the user
answers, nothing in the project changes. With no one to answer, stop here: the plan, the summary and the question
are the result.

## 8. On the user's yes

For each chosen class, in count order, one commit each:
- make the fix at the chosen layer and re-run the proof inside the project as in step 6, with `now` made from the
  uncommitted fix: archive the commit `git stash create` prints (it changes nothing; HEAD if it prints nothing),
  then add the untracked files. Then run `rm -r .agent-audit-scratch` from the project root, and only then run the
  check on the current code and the project's tests and lint;
- add or update the row in the instruction file's rule table. A rule that was already written and that nothing
  enforced is a repeat: fix it at the highest layer in the same commit. Drop a rule once its mistake cannot happen.

If `rule-to-hook` is installed and a class is best enforced as a Claude Code hook, use `rule-to-hook` with that
rule; without it, write the check as a CI step or lint rule as above. Do not push unless the user asks.

## Report

The closing summary of the reply, after the plan:

```
Agent-friendly audit: <focus or whole repository>
Sources: <source: n items | skipped, because ...> (one per source; commits: <branch> at <sha>)
Classes: <n proposed>, <n seen once>; confidence of the plan: <high | medium | low, because ...>
<class>: <instances per source> | <confidence> | <layer> | proof: <command: fails on <sha>, passes now | unproven, why>
Not enough evidence: <none | what was seen once>
Waiting for: <the user's choice of classes | done: commits ...>
```
