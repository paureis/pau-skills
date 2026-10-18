---
name: engineering-principles
description: "Named engineering principles to steer a design or code decision by: build the lever, model the domain, subtract before you add and more. Use when the user says 'apply build the lever' or 'which principle applies here', or before choosing a data shape, a new flag or type, or how to change many files. Not a code review or a design sketch."
argument-hint: "[a principle name, or the decision to steer]"
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/poteto-mode
---

# Engineering principles

Asked for: $ARGUMENTS

Eleven named rules for design and code decisions. This file is the index. `${CLAUDE_SKILL_DIR}/PRINCIPLES.md` holds
each principle in full, under a heading with the same name. The names are a shared vocabulary: the user steers with
one ("apply build the lever"), and you check the index before a decision one of them covers.

This skill gives the rules a decision is made by; it reviews no code and sketches nothing. To review existing code,
offer to run `improve-codebase-architecture` if it is installed. To sketch new code before building it, offer to run
`architect` if it is installed.

## How to use it

1. **The user names a principle.** Match the name loosely (case, hyphens, a missing "the"). Read its section in
   PRINCIPLES.md, then apply it to the work in front of you. A name that is not in the index is not a principle here:
   say so, and work from the plain meaning of the words without citing anything.
2. **You reach a decision yourself.** Before you pick a data shape, a type, a module split, the order of a change, or
   how to make one edit in many places, read the "When it applies" lines below. For each one that matches, read its
   section, then decide. When none matches, decide without them; do not stretch a principle to fit.
3. **Citing a principle.** When you cite one, in a reply, a plan or a review, name the decision it changed: "model
   the domain: one `status` field instead of a second boolean". Cite only a principle whose section in PRINCIPLES.md
   you read in this session; the index line alone is not enough. A citation with no decision behind it is name
   dropping, so leave it out.
4. **Two principles pull apart.** Each section says where it meets the others. The common case: subtract before you
   add asks for the smallest change, and redesign from first principles asks you to rebuild around the new
   requirement. Think the whole redesign through, then deliver it in steps, each the smallest change that moves the
   code toward that shape.

Debugging is not in this index. For a bug, offer to run `bug-fix` if it is installed. Without it: reproduce the bug
first, and fix the first place the system went wrong, not the place it surfaced. After two fixes that rest on the same
premise have failed, write the premise down and test it before a third fix.

## Index

### Build the lever
- **When it applies:** Any work that is not trivial: one edit across many files, a migration, an analysis, a check
  you will repeat.
- **Rule:** Build the tool that does or proves the work (a script, a codemod, a generator, a rerunnable check)
  instead of doing it by hand; the lever belongs in the change, and stays out of any delegate's write scope.
- **Sign you skipped it:** You cite it and the diff holds no script, codemod or generator, or forty files changed by
  hand.

### Explain the number
- **When it applies:** Before you trust, report or act on a number you measured: a speedup, a regression, a latency,
  a size, an eval score.
- **Rule:** Name what limits the number, and rule out with evidence that it measured something other than the work.
- **Sign you skipped it:** The number has no run count, no spread or no named limiter, or the time saved is larger
  than the time the changed piece took.

### Make operations idempotent
- **When it applies:** Designing a command, a setup or lifecycle step, a migration or a processing loop that can
  crash, restart or be retried.
- **Rule:** Read the state that exists, compare it with the goal and apply only the difference, so any number of
  runs, from wherever the last one stopped, ends in the same state.
- **Sign you skipped it:** A rerun after a crash fails, does the work twice, or needs a person to delete a lock or a
  half-written file first.

### Type system discipline
- **When it applies:** Designing a type or a function signature, or writing the code where outside data (a request,
  a file, a row, an environment variable) comes in, in any language.
- **Rule:** Make illegal states unrepresentable, parse outside data into the model at the seam where it enters and
  trust it inside, and keep the simplest type that keeps every operation total.
- **Sign you skipped it:** A cast or a non-null assertion with no check behind it, optional fields with a comment on
  which combinations are valid, a hand-written guard where the project has a schema library, or the same field
  checked again deep inside.

### Model the domain
- **When it applies:** Writing stateful logic, or code that branches on a kind of thing or repeats one shape across
  files.
- **Rule:** Put the domain in one structure (a state field or state machine, a typed model, a lookup table or
  registry, a union of variants) instead of conditionals spread through the code.
- **Sign you skipped it:** A new case grows an if/else chain by one branch, or a second boolean must stay in sync with
  the first.

### Minimize reader load
- **When it applies:** Shaping or reviewing code that is hard to follow, or before you add a layer or a piece of
  state.
- **Rule:** Keep down the layers a reader traces between a question and its answer and the state they must hold in
  their head; add either only when it saves at least as much elsewhere.
- **Sign you skipped it:** A new reader cannot answer "where does X come from?" and "what can change X?" in under 30
  seconds.

### Separate before serializing shared state
- **When it applies:** Two or more agents, processes or workers might write the same file, branch, key, port,
  database or cache.
- **Rule:** First give each writer its own target; only when one shared target is a real invariant, serialize with a
  mechanism (a lock, a sequence, a single writer), because instructions and conventions are not concurrency control.
- **Sign you skipped it:** The only protection is a line saying "do not touch X", or "we need a lock" was the first
  answer.

### Subtract before you add
- **When it applies:** Sequencing an addition, a refactor or a rewrite, or judging the size of a diff.
- **Rule:** Remove dead code, redundant checks and stubs first, then make the smallest change that reaches the target
  shape.
- **Sign you skipped it:** The change adds a layer, an option or a check beside code it left unused, or the diff is
  larger than the problem.

### Migrate callers then delete
- **When it applies:** Replacing an internal interface while old callers exist, and every caller can be changed in
  this change.
- **Rule:** List the callers, move every one to the new interface and delete the old one in the same change, with no
  compatibility layer.
- **Sign you skipped it:** Two ways to do one task survive the change, or an adapter kept "for now" has no date to go.

### Redesign from first principles
- **When it applies:** Fitting a new requirement into an existing design.
- **Rule:** Design as if the requirement had been known from the start, within the decisions the project has
  recorded, then deliver that design in steps.
- **Sign you skipped it:** The requirement lives in a flag, a branch or an adapter beside the old design, and the
  docs and examples still describe the design without it.

### Experience first
- **When it applies:** Implementation convenience competes with what the people using the work get: the scope of a
  feature, an option, an error message, an interface.
- **Rule:** Choose the experience of whoever consumes the work; the next maintainer is a user too.
- **Sign you skipped it:** An option exists because adding it was easier than deciding, or an error says what failed
  but not what to do.
