---
name: agent-friendly-audit
description: "Mine a project's history for the mistakes agents keep making there: pull request review comments, fix and revert commits, this project's Claude Code transcripts and memory, and its instruction files, in parallel read-only slices. Group repeats into classes (a class counts once it has happened twice), and propose for each class a fix at the highest layer it can live in: architecture, then types, then a lint or CI check whose error names what to use instead, then a test, then prose. Prove each proposed check fails on a real past instance and back the plan with counts. Writes nothing without the user's yes. Use when the user types /agent-friendly-audit or says 'why do agents keep getting this wrong', 'make this repo agent friendly', 'find what agents keep breaking', 'mine our history for agent mistakes', or 'what should we enforce instead of review'."
argument-hint: "[focus: a module, a mistake you keep correcting, or a time range]"
disable-model-invocation: true
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/correct
---

# Agent-friendly audit

Focus: $ARGUMENTS

Find the mistakes agents keep making in this project, from its own history, and propose how to make each one
impossible or loud. Assume every contributor is an agent that sees only the files it opened, copies the nearest
example, and takes the shortest path that compiles. So make the easy thing the right thing.

Spend effort in this order: most on the code itself (architecture, types, boundaries), then on checks that run
without judgment (lint, CI, tests), then on prose (instruction files, skills, comments), which works only when an
agent reads it and agrees. Human review is not a layer: a reviewer who must catch the same mistake on every pull
request is the problem this skill fixes.

The output is a plan backed by counts. **Nothing in the project is written until the user says yes.** Prototypes and
proofs run in a scratch folder outside the working tree.

Bundled files:
- `${CLAUDE_SKILL_DIR}/mine.mjs`: read-only helper (Node 20+, no dependencies). `commits` lists fix, revert and
  fixup commits with the files they touched; `transcripts` prints only what the user typed in one project's
  transcripts; `folders` finds this project's transcript folders. It hides emails, common secret shapes and the home
  folder.
- `${CLAUDE_SKILL_DIR}/SLICE-BRIEF.md`: the brief for each mining subagent, with one section per slice.
- `${CLAUDE_SKILL_DIR}/PLAN-TEMPLATE.md`: the plan you hand the user.

Related skills, all optional: `retrospective` learns from one session, this from the whole history;
`instructions-audit` reviews the instruction files for cost and drift; `rule-to-hook` implements one rule as a hook
or check, this finds which rules are needed. Each is typed, so suggest the user run `/retrospective`,
`/instructions-audit` or `/rule-to-hook` if it is installed; without them, this skill covers what it needs inline.

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

Leave out how to fix things and any guess at the cause; the evidence decides those. If `sharpen` is installed, the
user can run `/sharpen` on the audit prompt first; it does this check in more depth. Ask nothing else up front: an
open design question is answered later with a prototype (step 6).

## 2. Find the sources

Check what this session can reach, and write one line per source: where it is, how much is there, and "skipped,
because ..." when it cannot be read.

- **Review comments.** Use the GitHub MCP tools if the session has them, otherwise `gh api` REST routes:
  `gh api --paginate repos/<owner>/<repo>/pulls/comments` (inline review comments),
  `gh api --paginate repos/<owner>/<repo>/issues/comments` (conversation comments on pull requests), and
  `gh api repos/<owner>/<repo>/pulls/<n>/reviews` for one pull request's reviews. `gh pr list` and `gh pr view` use
  GraphQL and can fail where REST works, so try REST before giving up. On another host use its CLI or API
  (`glab api` for GitLab). With none of these, skip the slice and say so in the plan.
- **Commit history.** `node ${CLAUDE_SKILL_DIR}/mine.mjs commits` (add `--since <date>` for a time range). A shallow
  clone hides history: check `git rev-parse --is-shallow-repository` and say so if it prints `true`.
- **Transcripts and memory.** `node ${CLAUDE_SKILL_DIR}/mine.mjs folders` lists the transcript folders of this
  repository and its worktrees, under `$CLAUDE_CONFIG_DIR/projects` or `~/.claude/projects`. Each folder is named
  after the project's absolute path with every character that is not a letter or digit replaced by `-`; it holds
  `<session>.jsonl` files, and `<session>/subagents/agent-*.jsonl` for subagents. Find the folder by listing, not by
  building the name yourself: a long path can be shortened. A `memory/` folder in it may not exist.
- **Instruction files.** `CLAUDE.md` at every level, `CLAUDE.local.md`, `.claude/rules/`, `AGENTS.md`,
  `.cursor/rules/`, `.cursorrules`, `.github/copilot-instructions.md`, `.windsurfrules`, `GEMINI.md`, and what they
  import. Also the enforcement that already exists: lint configuration, CI workflows, git hooks, Claude Code hooks.

## 3. Mine the slices in parallel

Launch one read-only subagent per reachable slice, all in one message with the Agent tool. Use a read-only agent
type (such as `Explore`) when the session has one. Give each the common part of `SLICE-BRIEF.md`, its own slice
section, the focus, and the source line from step 2, with `<skill folder>` replaced by the real path of this
skill's folder (a subagent does not have `${CLAUDE_SKILL_DIR}`). Each returns candidate classes with instances as pointers, no
raw excerpts.

While they run, read the instruction files yourself if that slice is small: every rule there was written because a
mistake happened at least once.

## 4. Group into classes and count

Merge the candidates across slices. A class is one kind of mistake with one fix, for example "reads configuration
from the environment instead of the config loader", not "config problems".

- **A class counts once it has happened twice.** Count instances per source.
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
   an agent would copy (delete it). If `architect` is installed, suggest the user run `/architect` when the fix is a
   new boundary.
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

Exceptions to a check go on the offending line, with a reason, an expiry date and the name of the person who
approved it.

## 6. Prove each check, and prototype the open questions

For every proposed check (layers 2 to 4), prove it in a scratch folder outside the working tree:
1. Get a real past instance: the file as it was before the fix commit (`git show <sha>^:<path>`), or a checkout of
   that commit in a temporary folder (`git archive <sha>^ | tar -x -C <tmp>`).
2. Run the check on it and see it fail, with the error naming what to use instead.
3. Run it on the current code and see it pass (or, for a ratchet, stay at the stored count).

Record the command and both results. A check with no past instance to fail on is marked "unproven", with the
reason. For an architecture or type fix, a small prototype in the scratch folder (the new type, the narrowed
module) that compiles and rejects the old code is the proof.

When a question comes up that the evidence does not answer ("would a closed type break the plugin callers?"),
answer it with a small prototype instead of asking. Ask the user only what only they can decide: ownership,
priorities, whether a breaking change is acceptable.

## 7. Write the plan and ask

Fill in `PLAN-TEMPLATE.md` and show it in your reply: the sources and what each gave, the classes with counts,
confidence, layer and proof, the rule table (each rule paired with what enforces it), the exceptions format, what
was seen once, and what was skipped. Do not write it into the project unless the user asks.

Then ask which classes to implement (AskUserQuestion with one option per class, several allowed). Until the user
answers, nothing in the project changes.

## 8. On the user's yes

For each chosen class, in count order, one commit each:
- make the fix at the chosen layer, re-run the proof inside the project, and run the project's tests and lint;
- add or update the row in the instruction file's rule table. A rule that was already written and that nothing
  enforced is a repeat: fix it at the highest layer in the same commit. Drop a rule once its mistake cannot happen.

If `rule-to-hook` is installed and a class is best enforced as a Claude Code hook, suggest the user run
`/rule-to-hook` with that rule; without it, write the check as a CI step or lint rule as above. Do not push unless
the user asks.

## Report

```
Agent-friendly audit: <focus or whole repository>
Sources: <source: n items | skipped, because ...> (one per source)
Classes: <n proposed>, <n seen once>; confidence of the plan: <high | medium | low, because ...>
<class>: <instances per source> | <confidence> | <layer> | proof: <command: fails on <sha>, passes now | unproven, why>
Not enough evidence: <none | what was seen once>
Waiting for: <the user's choice of classes | done: commits ...>
```
