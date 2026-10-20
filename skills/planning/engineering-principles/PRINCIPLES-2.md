# Principles in full, part 2

One section per principle, in the order of the index in SKILL.md, under the same name. Each section gives the rule
and why it holds, how to apply it, the sign you skipped it, and, where it matters, how it meets the other principles.
Read the whole section of a principle before you cite it.

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
- Subtract within the code the change touches, not across the repository. A wider cleanup is its own change, offered
  to the user, not slipped into this one.
- A bug fix carries no unrelated deletions: the fix changes the fault and nothing else. Offer to run `bug-fix` if it
  is installed; its fix step removes every hunk that does not trace to the cause. Without it, keep the diff to the
  fault and list the cleanups you saw for later.
- Check before calling code dead. An exported function, class or endpoint with no callers in the repository may have
  callers outside it (a published library, a public API), or be named in stored data or a job queue; the exceptions
  under migrate callers then delete apply. Code is dead when nothing inside or outside can reach it.
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
- Keep to the size of the request. When the redesign goes beyond what the user asked for (a request to add one field
  that would restructure a module), propose it with what it changes and what it costs, and wait for the user's yes
  before you start it. If the answer is no, make the requested change in the current design, and say what the
  redesign would have changed.
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
- Every feature, control and option must justify itself. A setting in the product hands a design decision to every
  person who uses it; settle that decision in the design when you can, instead of adding a setting. This is about the
  people who use the product, not about the person you are working with: a choice that is theirs to make, you still
  ask them.
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
