# reframe (Adapted from [pstack `reframe`](https://github.com/cursor/plugins/tree/41e400932eca14f289e7db717a70455256b6d388/pstack/skills/reframe))

Back to the [origins index](../../ORIGINS.md).

Closest upstream: `pstack/skills/reframe/SKILL.md` at 41e4009. The body is upstream's, byte for byte (100% shared
text); `tests/pstack-verbatim.test.mjs` checks it against the copy in `tests/fixtures/pstack-upstream/reframe/`.

**Problem.** People describe what they are building in their own words, and the agent builds from those words.
Without the field's terms, the request misses what experts already know, and the agent cannot be asked for it by name.

**What this version changes.** Only the frontmatter:
- The description drops "with them" and "Use for /reframe.", so it is one sentence of at most 160 characters with no
  "Use for" opener (the typed-only rule in `tests/description-rules.test.mjs` and `tests/context-budget.test.mjs`).
- `license` and `metadata.upstream` lines are added.

The diff against upstream (`git diff --no-index`):

```diff
--- a/tests/fixtures/pstack-upstream/reframe/SKILL.md
+++ b/skills/planning/reframe/SKILL.md
@@ -1,7 +1,10 @@
 ---
 name: reframe
-description: "Teach the expert words for what the operator is building, borrow words from neighboring fields that solved the same problem, then rewrite their description with them. Use for /reframe."
+description: "Teach the expert words for what the operator is building, borrow words from neighboring fields that solved the same problem, then rewrite their description."
 disable-model-invocation: true
+license: MIT (adapted from cursor/plugins pstack; see NOTICE)
+metadata:
+  upstream: https://github.com/cursor/plugins/tree/41e400932eca14f289e7db717a70455256b6d388/pstack/skills/reframe
 ---
 
 Teach the operator the expert words for what they are building. Start from their own files, code and description, not a summary.
```

**Why.** Decision 33: the owner finds it effective as written and has nothing that does the same job, so it is
published here close to unmodified. It is typed only, as upstream has it.
