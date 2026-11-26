# sharpen (Adapted from [pstack `sharpen`](https://github.com/cursor/plugins/tree/41e400932eca14f289e7db717a70455256b6d388/pstack/skills/sharpen))

Back to the [origins index](../../ORIGINS.md).

Closest upstream: `pstack/skills/sharpen/SKILL.md` at 41e4009. The body is upstream's, byte for byte (100% shared
text); `tests/pstack-verbatim.test.mjs` checks it against the copy in `tests/fixtures/pstack-upstream/sharpen/`.

**Problem.** A task gets bigger when it should get deeper: the agent works from digested material, with no named
methods and no check of the result from outside the conversation.

**What this version changes.** Only the frontmatter:
- The description drops "Use for /sharpen.", so it has no "Use for" opener (the typed-only rule).
- `license` and `metadata.upstream` lines are added.

The diff against upstream (`git diff --no-index`):

```diff
--- a/tests/fixtures/pstack-upstream/sharpen/SKILL.md
+++ b/skills/planning/sharpen/SKILL.md
@@ -1,7 +1,10 @@
 ---
 name: sharpen
-description: "Make a task deeper, not bigger, then rewrite the prompt. Use for /sharpen."
+description: "Make a task deeper, not bigger, then rewrite the prompt."
 disable-model-invocation: true
+license: MIT (adapted from cursor/plugins pstack; see NOTICE)
+metadata:
+  upstream: https://github.com/cursor/plugins/tree/41e400932eca14f289e7db717a70455256b6d388/pstack/skills/sharpen
 ---
 
 I want a deeper version of this task, not a bigger one. Before rewriting it, do four things:
```

**Why it replaced the earlier version.** The earlier `sharpen` was adapted from an older pstack sharpen (09d06eb). It
restated the task, confirmed it in six lines, then worked, and it was never started in the owner's last 30 days. The
owner chose upstream's newer version as written (decision 33). It is typed only, which overrides decision 32's rule
that a skill another skill starts stays model-invoked, for `sharpen` only: `agent-friendly-audit` and `which-skill`
now say the user can type `/sharpen`.
