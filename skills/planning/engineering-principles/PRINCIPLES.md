# Principles in full

One section per principle, in the order of the index in SKILL.md, under the same name. Each section gives the rule
and why it holds, how to apply it, the sign you skipped it, and, where it matters, how it meets the other principles.
Read the whole section of a principle before you cite it.

## Build the lever

When the work is not trivial, build the tool that does it instead of doing it by hand. A codemod, a generator or a
script does the work the same way every time and reruns for free. It is one thing a reviewer can read and rerun to
check the work; a change made by hand can only be checked by doing it again. A deterministic script turns "trust me"
into "run this".

The bar is triviality, not repetition: skip the lever only for a couple of obvious edits you can see at a glance. A
one-off still earns a lever when the lever is what makes the work checkable.

**How to apply it.**
- Do the first unit by hand to learn the recipe, then build the tool. Prove it by running it on that unit and
  diffing the result against your hand-made version.
- Pick the kind of lever by the work: a codemod or script for edits, a generator for repetitive files, a query over
  the data (loaded into SQLite, say) for an analysis, a rerunnable check for verification.
- Write it in the project's own language or with a tool the project already uses. For edits, prefer a tool that
  understands the syntax over a text substitution when names can also appear in strings or comments: the language
  server's rename, `gofmt -r` or `gopls rename` for Go, `ast-grep` or `comby` for many languages, LibCST for Python,
  OpenRewrite for Java, `jscodeshift` for JavaScript. Plain `sed` is fine when a search shows every hit is the name.
- Make the lever safe to rerun (see make operations idempotent): a second run finds nothing left to do.
- A deterministic lever beats fanning out. If the tool can process every unit in one pass, run it yourself; do not
  hand delegates the job of applying by hand what a script can do.
- When you do hand work to subagents, write the lever as a file they all read: the recipe, how each result is
  checked, and the files they must not touch. Keep it outside their write scope, so none of them can quietly edit the
  contract.
- The lever belongs in the change: put the script in the diff next to the work it did, where a reviewer can read it
  and rerun it. Whether it stays in the repository after review is the user's call.
- Build the smallest script that does or proves the job, never a framework (see subtract before you add).

**Sign you skipped it.** Applying this principle produces a file. If you cited it and the diff holds no codemod,
script, generator or delegate brief, you did not apply it. Forty files edited by hand, or subagents each editing a
share of them, are the usual form.

## Explain the number

Before you trust, report or act on a number you measured, find what limits it, and rule out that it measured
something other than the work you think.

**How to apply it.**
- **Ask "why not double?"** Name the resource or code path that bounds the result: a core, a lock, the disk, the
  network, the load generator itself. Get it from a profile or from system counters taken during a run, then map it
  to the source. A guess from reading the code is not a limiter. If you cannot say why the number is not twice as
  good, you do not know what you measured.
- **List what else the number could be measuring, and rule out each with evidence.** The usual suspects: errors,
  skipped or cached work, code that never ran, one side left on default settings while the other was tuned, noise,
  and a piece too small to matter end to end.
- **Keep the evidence with the number.** Put the run count, the spread and the limiter next to it, in the notes or
  the report.
- For an eval result, ask the same of the trials: did every run do the task, does the gap hold across trials and
  models, and does the scenario matter.

For a performance number, see the benchmark checklist in `hillclimb` if it is installed: it turns this into
questions you answer from real runs. For a number from runs of a skill or a prompt, see `skill-eval` if it is
installed.

**Sign you skipped it.** The number has no run count, no spread or no named limiter, or the time saved is larger
than the time the changed piece took in the first place.

## Make operations idempotent

Design operations so they reach the correct state however many times they run and wherever the previous run stopped.
Commands, setup and lifecycle steps, migrations and processing loops run where crashes, restarts and retries are
normal. If partial state changes what the next run does, every restart becomes a debugging session.

Derive each step from the state that exists, not from what the previous run meant to do: read the current state,
compare it with the goal, and apply only the difference. A step written this way is safe to repeat, because a repeat
finds nothing left to do.

**How to apply it.**
- Anything a run leaves behind (a lock, a temporary file, a half-written record, a claimed job) must be recognizable
  as stale by the next run. Judge staleness by evidence that stays true wherever the previous run could have stopped,
  not only in the common case. A lock file alone says nothing after a crash. A process id written into it is not
  enough either: on storage shared by two hosts or containers, the other host sees no such process and takes a live
  lock, and after a restart the id can belong to a new process, so a stale lock looks alive. Prefer a lock the
  operating system drops when the process dies (`flock` or `fcntl` locks on Unix, `LockFileEx` on Windows, or the
  database's own advisory lock); if the lock must be a file, record the process id, its start time and the host, and
  check all three. A marker the next run cannot judge turns every crash into manual cleanup.
- Write to a temporary file in the same folder as the target, then rename it into place, so a reader never sees half
  a file. The rename is atomic only within one filesystem: from another folder, such as the system temporary folder,
  it fails or becomes a copy that a reader can see half done. Compare artifacts by content, not by creation order or
  timestamp.
- Prefer the forms that converge: create if missing (`mkdir -p`), insert or update on a key instead of a blind
  insert, set a value instead of appending to it. Existence is not the goal, though. `CREATE TABLE IF NOT EXISTS`
  checks only that a table of that name exists: a table in an older shape passes, and the step "succeeds" with the
  wrong schema. The convergent form compares the shape with the goal (the columns, types and indexes, or the version
  a migration tool records) and applies the difference.
- Ask the three questions: what happens if this runs twice in a row? What happens if the previous run crashed at
  each possible point? Does running it again reach the same end state? If any answer is "it depends on what was left
  behind", the operation needs a step that reconciles the current state with the goal.

For a schema or data migration, offer to run `migration-review` if it is installed: it asks whether the migration
fails cleanly or half-applies when re-run, including on databases where each DDL statement commits on its own.

**Sign you skipped it.** A rerun after a crash fails, does the work twice, or needs a person to delete a lock or a
half-written file first.

## Type system discipline

Make the compiler, or in a dynamic language the parser at the edge, reject impossible states, mixed-up values and
unhandled cases. Prefer designing errors and special cases out of existence over adding handlers for them. This holds
in any typed language; in a dynamic one, each rule becomes a rule about the model you parse data into.

**How to apply it.**
- **Make illegal states unrepresentable.** Model variants as a sum type (a discriminated union in TypeScript, an enum
  with data in Rust or Swift, a sealed class in Kotlin or Java, a variant type in OCaml or Haskell), not as a bag of
  optional fields where contradictory combinations still compile. `{ completed: boolean; completedAt?: Date }` admits
  `completed: true` with no date. Derive the boolean from `completedAt`, or model the two variants. If you can write
  a comment explaining when a combination of fields is valid, split it into a sum type. Match on it exhaustively, so
  adding a variant breaks the build at every place that must handle it (a `never` check in TypeScript, a `match`
  without a catch-all in Rust, `when` on a sealed class in Kotlin, `assert_never` with a type checker in Python).
- **Brand values that share a primitive.** A user id and an order id are both strings underneath but must not be
  interchangeable. Give each its own type (a newtype in Rust or Haskell, a value class in Kotlin, a defined type in
  Go, `NewType` in Python, a branded type in TypeScript). Check once at creation, trust the type afterwards.
- **Parse outside data at the seam where it enters.** Request bodies, JSON, messages, command-line arguments, config
  files, environment variables and database rows are untyped until parsed. At each place they enter, one parse
  function turns them into the typed model or returns an error. Inside, trust the model: no second check of the same
  field deep in a call chain. Do not pass the transport, storage or framework type through to the rest of the code;
  expose the model instead.
- **Derive types from the schema that owns the shape.** When a protocol buffer file, an OpenAPI spec, a GraphQL
  schema, a database migration or another file defines a shape, generate or derive the type from it instead of
  writing a parallel one by hand.
- **Do not lie to the type system.** Casts, unsafe coercions and assertions that bypass the checker are runtime
  crashes waiting to happen. If the checker cannot prove a fact, prove it (parse, narrow, refine the model) or treat
  the cast as a hazard and trace it back to the seam where the data came in.

Three rules for everyday code, each in its static and its dynamic form:

| Rule | Typed language | Dynamic language |
|---|---|---|
| **Keep the simplest total type.** | Keep the plain type (a list) while every operation on it stays total. Strengthen it (a non-empty list) only where the loose type forces a non-null assertion, a cast or a "should never happen" throw. `sum` of an empty list is 0, so it takes the plain list; `first` of an empty list has no answer, so it takes the non-empty one. | Same test with runtime checks: a guard or a "cannot happen" raise deep inside marks where the parsed model is too loose. Tighten the model at the edge, not with checks at each use. |
| **Schemas before guards.** | Before hand-writing a property-by-property type guard, use the project's schema library and derive the type from the schema (`z.infer` with Zod, serde derives in Rust, `encoding/json` into a struct plus a validator in Go, kotlinx.serialization). | Parse into a model with the project's schema library (Pydantic, attrs with cattrs or marshmallow in Python, dry-schema in Ruby, Ecto changesets in Elixir, Zod or a JSON Schema validator in JavaScript) instead of nested `isinstance` or `respond_to?` checks. |
| **A type guard checks what its name says.** | A function that tells the checker "this is an X" (a TypeScript `x is X` guard, a Kotlin contract, a Python `TypeGuard` or `TypeIs`) must verify every part of the claim. A lying guard is worse than a cast, because the bug hides behind a name that says it is safe. | An `is_x` or `valid_x?` function checks everything its name promises, or gets a narrower name. Callers stop checking once it says yes, so a partial check moves the crash somewhere far away. |

These three come from a list of TypeScript rules in pstack; they are the ones that hold in any language. The rest of
that list is TypeScript syntax or already covered above.

**Where it meets the others.** Model the domain chooses the structure; this principle makes the type system enforce
it. Subtract before you add says no speculative validators: parsing once at the seam is the check the spec demands,
and a second check of the same field inside is the speculative one.

**Sign you skipped it.** A cast, a non-null assertion or a `type: ignore` with no check behind it; optional fields
with a comment on which combinations are valid; a hand-written guard where the project has a schema library; the
same field checked again deep inside; two parameters of the same primitive type that callers mix up.

## Model the domain

Encode the real domain in a data structure instead of scattering it across conditionals. A structure that matches
the domain makes invalid states unrepresentable and deletes branches. Choosing it while writing is cheap; recovering
it later reads as a refactor and gets put off.

**How to apply it.** Reach for:
- one state field or a state machine instead of several booleans, phases or lifecycle checks;
- a typed model instead of loose parameters or the same shape assumed in several files;
- a lookup table, a registry, a map or a union of variants instead of branching spread across files;
- a reducer, or commands and events, instead of state changed ad hoc from many places;
- a module organized around one body of domain knowledge, not around the order things run (load, validate,
  transform, save); execution order is not ownership;
- a queue, cache, index, tree or graph where the access pattern calls for it.

When none fits, write down what the code must never allow and how the data is read, then find the structure that
encodes exactly that.

Do not force an abstraction. Prefer boring code when the current shape is already clear, local and unlikely to grow.
Distrust an abstraction that adds indirection without removing branches, duplicated rules, invalid states or
lifecycle risk.

To find the missing structure in existing code, offer to run `improve-codebase-architecture` if it is installed; for
new code, offer to run `architect` if it is installed. Both use the same terms (module, interface, seam, depth,
locality), so a design and a review read the same way.

**Sign you skipped it.** A new feature grows an existing if/else or switch chain by one more branch, or a second
boolean must stay in sync with the first (`isPaid` and then `isRefunded`, where refunded but never paid means
nothing). Modules named after phases that repeat the same domain rules are the third sign.

## Minimize reader load

Maintainability is the work a reader must do to understand the code. Track two things: the layers to trace (the
indirections between a question and its answer) and the state to hold (hidden or mutable context the reader must keep
in their head). Line counts and complexity scores are stand-ins for these. The two are independent: a flat file with
fifty globals can be as hard to follow as six thin layers, so guard both.

**How to apply it.**
- Collapse layers that cost more than they save: a wrapper with one caller, an adapter with no second
  implementation, indirection added for a need that never came.
- A layer must change the abstraction. One that repeats the same methods and arguments as the layer below adds
  reading and hides nothing.
- Prefer a small interface that hides a real decision over a broad one that hides little, which makes the reader
  learn both the interface and the implementation.
- Shrink the scope of state: return values over mutation, locals over fields, fields over module state, module
  state over globals. Derive a value instead of keeping two copies in sync.
- State an invariant once, where data enters a module, not in every consumer.
- Before adding a layer or a piece of state, ask whether it saves the reader at least as much somewhere else.

**The test.** Can a new reader answer "where does X come from?" and "what can change X?" in under 30 seconds? If not,
cut layers or cut state. For a review of existing code by this test, offer to run `improve-codebase-architecture` if
it is installed; for new code, `architect` if it is installed.

**Sign you skipped it.** A question about one value takes a trip through several files, or the answer depends on
flags set somewhere else.

## Separate before serializing shared state

When concurrent actors might share mutable state, first ask whether they need the same mutable thing at all. If not,
remove the sharing. When the sharing is real, enforce the order with a mechanism: a lock, sequential phases, a single
writer, an atomic compare-and-swap. Instructions and conventions are not concurrency control. Writes that race fail
now and then, are hard to reproduce, and cost the most to debug.

**How to apply it.**
1. **List the shared mutable state**: files two actors read and write, branches both push to, a database, a port, a
   cache, a queue.
2. **By default, remove the shared write target.** Do the actors need one canonical object, or are they each
   publishing their own facts? Give each one its own file, key, branch, port, database or folder, and combine the
   results only where they are read. Two workers each writing their own field into one `state.json` still share it;
   `indexer-state.json` and `metrics-state.json` do not.
3. **Only when one shared target is a real invariant, serialize access with a mechanism.** Treat "we need a lock" as
   a design smell to check, not as the first answer.

Files edited by several agents are the one place where an owner per file is enough, provided each agent works on its
own branch or worktree and every branch is read when it is merged: the merge shows any edit outside the owner's
files. State outside the files leaves no such trace. A database, a port or a cache is separated (one per agent) or
locked. The integration branch, remotes and tags get a single writer, the one coordinating the work, who checks them
after each agent reports. None of these is protected by a line in a brief.

For agents working in parallel, see `parallel-worktrees` if it is installed: it gives each agent its own worktree,
port and database.

**Sign you skipped it.** The only protection is a line saying "do not touch X"; two workers write one file, key or
branch; or "we need a lock" was the first answer.

## Subtract before you add

When changing a system, remove complexity first, then build. Adding to a complex system compounds the complexity.
Removing first leaves less code, shows the structure that matters, and often makes the next design obvious. Aim for
the most result with the least code, and leave the design a little simpler than you found it, behind the same or a
smaller interface.

**How to apply it.**
- Sequence removal before construction: delete dead code, collapse one-caller wrappers, drop redundant checks and
  remove references to nothing before you introduce the new shape.
- Cut before you polish: get to the minimum before you spend effort on quality.
- Design for the usage you have seen, not for edge cases you imagine. Add no validator, parser or guard beyond what
  the spec demands.
- Prefer deletion when asked to refactor or improve something: look for what can go before what can come.
- Make one decision in one place. Do not repeat the same choice in several places; put it behind one source of truth
  and pass the result along.
- Make the smallest change that reaches the target shape. Fewer lines beat elegant boilerplate.
- If a task asks you to thread a new value through several layers (types, schemas, pipelines), stop and look for a
  more direct path first.
- The same goes for prompts and instructions: remove repeated instructions and oversized templates, and delete a
  reference that adds nothing instead of leaving a stub.

**Where it meets the others.** The smallest change is measured against the target shape, not against today's code:
when redesign from first principles has named a new shape, the smallest change is the one that reaches it, delivered
in steps. A lever is still worth building when it is the smallest way to make the work checkable.

When sketching new code, see `architect` if it is installed: its grounding step looks for what already does part of
the job before anything new is designed.

**Sign you skipped it.** The change adds a layer, an option or a check next to code it has made unused; the diff is
larger than the problem; or the same choice is made in two places.

## Migrate callers then delete

When a new interface is the right design, move the callers and remove the old interface in the same change, instead
of keeping a compatibility layer. Keeping both creates two paths to maintain, slows the cleanup, and makes the code
feel append only.

**When it applies.**
- No user outside the change depends on the old interface.
- The project can take a coordinated breaking change.
- The new interface is part of a simplification or a refactor.

**How to apply it.**
- Do not keep an old path only because internal callers still use it.
- List every caller and move it. Search for the old names in code, strings, configuration, docs and tests, not only
  in imports. Then delete the old interface.
- Treat a temporary adapter as an exception with an end date, not as architecture.
- Update the tests to check the new interface. A test that only pins the old internals goes once what it checks
  that nothing else does has moved onto the surviving interface. To decide which tests to keep, offer to run `tdd`
  if it is installed, for its two-edit check. Without it, keep a test only when it fails if the behaviour breaks and
  still passes when only the internals change.

**When it does not apply.** Some callers cannot be reached in one change: callers outside the repository (a published
library or a public API), a name stored in data (a serialized class name, a type column, a message or event type), a
job queued by name, a format an older version still reads during a rolling deploy. For those, add the new path, say
which callers remain, and leave the transition (a deprecation, a release, a data migration) to the user. For a stored
name or a schema change, offer to run `migration-review` if it is installed.

For a refactor that does this step by step on a pinned behaviour, offer to run `improve-codebase-architecture` if it
is installed.

**Sign you skipped it.** Two ways to do one task survive the change, both gaining callers; or an adapter kept "for
now" has no date to go.

## Redesign from first principles

When fitting a change into an existing design, do not bolt it on. Design as if the requirement had been a foundation
from the start.

**How to apply it.**
- Read every affected file and understand the current design first.
- Ask: if we were writing this from scratch with the new requirement, what would we build?
- Work within the decisions the project has recorded (architecture decision records, a `docs/adr/` folder, a design
  document). Do not reopen one unless the new requirement makes it wrong; when it does, say so and let the user
  decide.
- Carry the change through every reference: types, docs, examples, comments that explain the design.
- Think through the whole redesign, then deliver it in steps. Each step is the smallest change that moves the code
  toward the target shape and leaves it working.

This keeps the design open to the next requirement, instead of adding one more special case to it each time.

**Where it meets the others.** Subtract before you add sizes each step; this principle chooses where the steps go.
When the redesign replaces an interface, migrate callers then delete says how to finish it.

**Sign you skipped it.** The new requirement lives in a flag, a branch or an adapter beside the old design, and the
docs and examples still describe the design without it.

## Experience first

When implementation convenience conflicts with the experience of the people who use the work, choose the experience.

**How to apply it.**
- Every feature, control and option must justify itself. An option is a decision handed to the user; make it
  yourself when you can.
- Ship less and finish it: three polished features beat ten rough ones.
- Try a design cheaply before you commit to it. A throwaway prototype costs less than the same decision changed in
  production code.
- Get the details right: feedback, error states, messages that say what to do next.
- Keep the core workflow tight: every feature serves it or gets out of its way.

The user is whoever consumes the work. For an interface people click, it is the end user. For a library, a command
line tool or an internal API, it is the colleague who calls it. The next maintainer is a user too: weigh their
experience the same way, and explain an impact from the point of view of the person who will notice it.

**Where it meets the others.** This principle sets the target; the others decide how to build toward it. Minimize
reader load is this principle applied to the maintainer.

**Sign you skipped it.** An option exists because adding it was easier than deciding; an error says what failed but
not what to do; or the change is explained in terms of its implementation instead of what someone using it will
notice.
