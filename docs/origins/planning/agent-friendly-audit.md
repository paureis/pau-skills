# agent-friendly-audit and `mine.mjs` (Adapted from [pstack `correct`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/correct))

Back to the [origins index](../../ORIGINS.md).

Closest upstream: `skills/correct/SKILL.md`, with ideas from `skills/automate-me/SKILL.md` (parallel slices, no glob
across projects), `docs/guide/09-make-it-yours.md`, `skills/architect/references/design-red-flags.md`, and the
author's post on X from mid-October 2026 (an inverse pyramid of effort: the codebase first, then static analysis, then
prose, and least of all human review). `SKILL.md` shares about 3% of its word 6-grams with them; the structure is
`correct`'s (the fix order, proving each check, exceptions with a reason, an expiry and an approver, the rule table, "a
class counts once it has happened twice", and the sentence about agent contributors). `SLICE-BRIEF.md`,
`PLAN-TEMPLATE.md` and `mine.mjs` are mine.

**Problem.** The same agent mistakes get corrected again and again in review and in chat, and each fix lands as one
more sentence in an instruction file that nothing enforces.

**What this version changes.**
- `correct` fixes the top classes at once, one commit each. Here that is a proposal: a plan backed by counts, and
  nothing is written until the user says yes.
- Evidence comes in four named slices (review comments through the GitHub MCP tools or `gh api` REST, commit history
  on the default branch, this project's Claude Code transcripts and memory, the instruction files), mined by read-only
  subagents with a bundled brief, or in turn without them.
- Confidence levels are new: two or more sources make a class high confidence (upstream `automate-me`'s "2+ slices"
  means time slices of transcripts). Live copies count toward a class but not toward confidence. Rules for empty or
  bot-only slices, for too little evidence (propose nothing), and for classes already enforced.
- Each proposed check is proven in a scratch folder against `git show <sha>^`; a pattern with live copies becomes a
  ratchet; a check that allows exceptions must fail on an expired one. Open questions are answered with a prototype.
  The prompt is confirmed first, with `/sharpen` as an optional extra.
- Privacy rules are new: pointers instead of raw excerpts, synthetic inputs for proofs, approvals recorded by role or
  handle, never a person's name.
- `mine.mjs` is new and read only: `commits` lists fix and revert commits with their files; `transcripts` prints only
  what the user typed, reads only this repository's transcript folders, leaves out the live session, and redacts
  emails, tokens, keys and URL credentials; `folders` finds the folders and shows home paths as `~`.

**Why.** The backlog item and the post's recipe: put the effort where it holds without agent judgment, back it with
data, and keep secrets out of what gets written. The review round found that secrets in environment-variable form
(`GITHUB_TOKEN=...`) printed unredacted and that `transcripts` would read any project's folder; both are covered by
tests now. The cold run on this repository found live instances of two classes in existing code.
