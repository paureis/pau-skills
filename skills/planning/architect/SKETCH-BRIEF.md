# Sketch brief

The discipline for producing one design sketch. Follow it when you write a sketch yourself. When a subagent writes
one (two subagents briefed in one message, or the candidates of an arena run), send it this file's text below the
line, with the four fields filled in and the rationale template pasted where it says so.

---

You are producing one candidate design sketch: types, signatures and a module map with bodies that are not
implemented yet. Another sketch of the same task is being made under a different direction. Differences between the
sketches are what the comparison uses to choose; do not drift toward a safe middle shape.

- **Task**: <what is being designed, and for which callers>
- **Grounding**: <the files to read, the constraints that hold whatever the design>
- **Direction**: <the one constraint this sketch follows fully, for example "at most three entry points" or "design
  around the dependencies that cross the seam">
- **Where you write**: <a folder, or a branch in a worktree; nothing outside it>

## How to sketch

1. **Usage first.** Before any type, write the code a caller writes: a short README-style example and two or three
   realistic call sites. Then derive the types from them. Usage and types must agree; when they do not, change the
   types, not the usage.
2. **Data structures first.** Get the core types right and the code follows. Trace each main access pattern through
   them. If the answer is "we will add an index or a cache later", the structure is wrong.
3. **Depth.** Prefer a small interface that pulls complexity into the module, even when that makes the
   implementation harder. No transport, storage or framework type on the public interface; parse into your own
   types at the seam.
4. **Shared state.** If two actors could write the same thing, ask what happens. If the answer is not "nothing",
   give each actor its own state and merge where it is read, or give the state one owner.
5. **Visible boundaries.** Bodies are not implemented, in the project's language (`raise NotImplementedError`,
   `todo!()`, `panic("todo")`, `throw new Error("not implemented")`, and so on); tricky logic is pseudocode in
   comments; every public item has a comment stating its intent and its invariants. A reader should be able to trace
   data from input to output from the types and signatures alone.
6. **Invariants in types** where the language allows: a type that cannot hold a bad value beats a runtime check,
   which beats a comment. Validate at the seam and trust the types inside. Keep the logic in pure functions and the
   shell around them thin.
7. **One source of truth** per fact: derive, do not copy and sync.
8. **Repeatable operations.** Ask what happens if an operation runs twice or stops halfway, and shape it so the
   answer is "nothing bad".
9. **Short paths.** If following one call needs more than three files, flatten the layers.
10. **Prove it compiles.** If the project has a compiler or type checker, run it on the sketch; signatures that do
    not agree with each other show up now instead of during implementation.

## What to return

- the usage example and call sites;
- the sketch files (one file for a small change; a module map plus type files for a larger one);
- a one-page rationale shaped by the rationale template: <paste RATIONALE-TEMPLATE.md here when briefing a
  subagent>;
- the checks you ran on the sketch, and what you were unsure about.
