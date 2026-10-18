---
name: architect
description: "Sketch new code in the repository before building it: types, signatures and module boundaries in the project's language, two different shapes compared, then implement the deeper one test first. Use when the user says 'architect this', 'design this first', 'sketch the types', or before non-trivial code whose shape is still open."
argument-hint: "[what to design] [with checkpoint]"
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/architect
---

# Architect

What to design: $ARGUMENTS

Sketch the shape of new code (types, signatures, module boundaries, with bodies left unimplemented) before writing
it, compare at least two different shapes, then fill in the code against the one you chose. The sketch is cheap to
throw away; the same shape found halfway through implementation is not.

If you started this skill on your own, without the user typing its name or asking for what it does, first say in one
or two lines what it will do and what it will cost, and wait for a yes. A remark or a question that only matches its
description is not asking for it. If the user asked for it, or the brief you are working from does, go ahead.

Bundled files, open them when you reach their phase:
- `${CLAUDE_SKILL_DIR}/SKETCH-BRIEF.md`: how to write one sketch, and the brief for a subagent that writes one
- `${CLAUDE_SKILL_DIR}/RED-FLAGS.md`: the screen every sketch goes through, and the terms used here
- `${CLAUDE_SKILL_DIR}/RATIONALE-TEMPLATE.md`: the one page that ships with the sketch

The terms (module, interface, depth, seam, adapter, leverage, locality) are defined in `RED-FLAGS.md`. They are the
same terms `improve-codebase-architecture` uses, if it is installed, so a design from here and a review from there
read the same way.

Make a task list with one entry per phase (Ground, Sketch, Screen, Agree, Implement) before starting. Scrap is not
on the list; it is what you do when Implement shows the sketch is wrong.

## Phase 1: Ground

Build a real picture of every module the new code touches: its interface, its callers, its tests, and who owns its
state. Trace one real call through it from input to output. Naming a file is not grounding; being able to explain
what happens to the data is.

If `codebase-oracle` is installed, use it on the parts of the codebase you do not know yet. If it is not, read those
parts yourself, starting from the entry point a user or caller hits, and follow the calls.

Write down:
- the constraints any design must honour: types to interoperate with, callers that cannot break, invariants that
  cross the seam, limits on performance or dependencies;
- what already exists that does part of the job. Subtract before you add: a design that extends an existing module
  usually beats a new one next to it.

Skip this phase only for code with no surrounding system to fit into.

**Done when** you can write the Problem section of the rationale from what you read.

## Phase 2: Sketch

Follow `SKETCH-BRIEF.md` for each sketch. In short: write the caller's usage first and derive the types from it;
leave every body unimplemented in the project's own language; state intent and invariants in comments; run the
compiler or type checker on the sketch if there is one.

| Language | Body of a sketched function |
|---|---|
| Python | `raise NotImplementedError` |
| Rust | `todo!()` |
| Go | `panic("todo")` |
| TypeScript, JavaScript | `throw new Error("not implemented")` |
| Java | `throw new UnsupportedOperationException("not implemented");` |
| Kotlin | `TODO()` |
| C# | `throw new NotImplementedException();` |
| Ruby | `raise NotImplementedError` |
| Swift | `fatalError("not implemented")` |
| PHP | `throw new \LogicException('not implemented');` |
| C, C++ | `abort(); /* not implemented */` |
| Elixir | `raise "not implemented"` |
| Haskell | `error "not implemented"` |

For another language, use its standard "not implemented" error, so a call to an unfilled body fails loudly.

Where the sketch goes: one file of new types and signatures for a small change; a module map plus type files for a
larger one. Write it in the repository on a branch, so it type-checks against the real code, or in a scratch folder
when it cannot compile yet.

**Make at least two sketches that differ in shape**, even when the first looks good enough. Different shape means a
different seam, a different owner for the state, or a different core data structure; a renamed function or a moved
parameter is the same shape. Give each sketch one direction to follow fully, for example: the smallest interface (one
to three entry points); the most common caller made trivial; designed around the dependencies that cross the seam
(ports and adapters); built on what the codebase already has.

How to get them:
- **By default, write them yourself, one after the other.** Screen steps 2 and 3 then compare them. Before starting
  the second, write one sentence saying how its shape must differ from the first. If you cannot, pick another
  direction.
- **For a larger design, or to get sketches that did not see each other:** if `arena` is installed, run it with
  the sketch task, `SKETCH-BRIEF.md` as the core of each candidate's brief, and your grounding notes. It runs the
  sketches in parallel, has a blind judge score them, picks a base and grafts the others into it, and returns one
  synthesized sketch with a synthesis note; continue here at Screen with that result. If it is not installed, you can
  brief two subagents with `SKETCH-BRIEF.md` in one message, one direction each, and compare the results yourself.

**Done when** at least two sketches of different shape exist, each with its usage example; or an arena run has
returned one synthesized sketch and a synthesis note that compared at least two.

## Phase 3: Screen

With your own two sketches, do all four steps. With an arena result, the comparison and the grafts are already done:
check the synthesized sketch against step 1, skip steps 2 and 3, and put the arena's synthesis note in the
rationale's "How the candidates were compared" section.

1. Check every sketch against `RED-FLAGS.md`. A red flag means revise the sketch or drop it. Keep the contributor in
   mind: an agent that sees only the files it opened, copies the nearest example and takes the shortest path that
   compiles. Prefer the design where a change that looks right from one file is right for the whole repository.
2. Compare the survivors on depth: prefer the one that hides more behind a smaller interface. Apply the deletion
   test: if deleting a module would make its complexity vanish, it was a pass-through; if the complexity would
   reappear in every caller, it earns its place.
3. Pick a base. Take one or two good ideas from the other sketch and fold them in by hand, in the base's terms.
4. Write the rationale from `RATIONALE-TEMPLATE.md`: usage, shape, how the candidates were compared, tradeoffs,
   alternatives, open questions. Save it where the project keeps design documents, if it has a place (an ADR folder,
   `docs/design/`), as `<name>-rationale.md`; otherwise as `RATIONALE.md` next to the sketch files. It is committed
   with the sketch, and the report gives its path.

**Done when** one sketch is chosen (or the arena's sketch has passed step 1), it raises no red flag you have not
accepted in writing under "Tradeoffs accepted", and the rationale is written.

## Phase 4: Agree (optional)

By default, go straight to Implement. Stop and show the user the usage, the sketch and the rationale first when:
- the user asked for a checkpoint ("with checkpoint", "show me before you build");
- an open question can only be answered by the user (ask it with AskUserQuestion);
- the sketch changes an interface that other people or teams own.

If the user pushes back on the shape, here or later, treat it as new grounding: go back to Ground, then sketch again
before writing more code. The sketch can be committed on its own, before any implementation.

## Phase 5: Implement against the sketch

Replace the unimplemented bodies one behaviour at a time, test first, through the interface the sketch defines. If
`tdd` is installed, use it for this phase. If it is not: write one test through the public interface that fails for
the expected reason, write the smallest code that makes it pass, tidy up with the tests green, commit, and move to
the next behaviour.

The sketch is the contract. A deviation (a parameter the sketch did not have, a type that has to change, an extra
module) is a signal to raise, not friction to absorb quietly. When one appears, stop and decide which was wrong: the
sketch, the requirement, or the implementation reaching for more than it needs. Record it under "Deviations" in the
rationale, change the sketch first if the sketch was wrong, then the code. Tell the user about any deviation that
changes the interface.

**Done when** no unimplemented body is left, the project's tests, type check and lint pass, and every deviation is in
the rationale.

## Scrap: when the shape is wrong

Throw the sketch away when implementation keeps producing friction the sketch cannot absorb. The signal is a
pattern, not one awkward case. Signs:
- two or more independent deviations of the same shape;
- the same workaround appearing in unrelated places;
- unrelated edge cases that each need their own special branch;
- types that need escape hatches to compile (casts, `any`, optional fields that are always set);
- the reflex "we need a lock" when the sketch said the state was not shared;
- callers that must know the module's internal rules to use it.

One edge case does not condemn a design, and complexity in the data is not complexity in the design. When you
scrap:
1. Ground again, on what has been built so far.
2. Redesign as if the new constraints had been known on day one; do not patch the old sketch.
3. Subtract first: the new sketch is smaller than the old one before it grows.
4. Go back to Sketch, with two candidates again. Keep the tests that pin behaviour; they still describe what the
   code must do.

## Do not

- Do not write implementation code before two sketches of different shape exist.
- Do not count a renamed or slightly rearranged sketch as a second candidate.
- Do not absorb a deviation without recording it.
- Do not bolt fixes onto a design that the scrap signs condemn.

## Output and report

The output is the usage (written first), the sketch, and the one-page rationale, then the implementation.

```
Architect: <what was designed>
Grounding: <modules read; constraints found>
Sketches: <direction and shape of each>; base <which>, because <...>
Red flags: <none | which, and how resolved or accepted>
Checkpoint: <skipped | shown to the user: outcome>
Implementation: <commits>; tests <command: PASS | FAIL>
Deviations: <none | each, and what changed>   Scrapped: <no | yes, why, and the new sketch>
Rationale: <path, from Screen step 4>
```
