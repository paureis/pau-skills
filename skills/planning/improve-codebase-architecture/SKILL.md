---
name: improve-codebase-architecture
description: "Find deepening opportunities in existing code: refactors that turn shallow modules into deep ones, easier to test and to navigate, then talk the chosen one through. Use when the user says 'improve architecture', 'find refactoring opportunities', 'architecture review' or 'zoom out on the codebase', or when the code is getting messy or hard to test."
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from mattpocock/skills and cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/mattpocock/skills/tree/main/skills/engineering/improve-codebase-architecture
  upstream-pstack: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/architect/references/design-red-flags.md
---

# Improve Codebase Architecture

Surface architectural friction and propose **deepening opportunities**: refactors that turn shallow modules into deep ones. The aim is testability and AI-navigability.

## Glossary

Use these terms exactly in every suggestion. Consistent language is the point. Don't drift into "component," "service," "API," or "boundary." Full definitions in LANGUAGE.md in this skill's directory.

- **Module**: anything with an interface and an implementation (function, class, package, slice)
- **Interface**: everything a caller must know to use the module: types, invariants, error modes, ordering, config. Not just the type signature.
- **Implementation**: the code inside
- **Depth**: leverage at the interface: a lot of behaviour behind a small interface. **Deep** = high leverage. **Shallow** = interface nearly as complex as the implementation.
- **Seam**: where an interface lives; a place behaviour can be altered without editing in place
- **Adapter**: a concrete thing satisfying an interface at a seam
- **Leverage**: what callers get from depth
- **Locality**: what maintainers get from depth: change, bugs, knowledge concentrated in one place

Key principles:

- **Deletion test**: imagine deleting the module. If complexity vanishes, it was a pass-through. If complexity reappears across N callers, it was earning its keep.
- **The interface is the test surface.** Callers and tests cross the same seam.
- **One adapter = hypothetical seam. Two adapters = real seam.** Don't introduce a seam unless something actually varies across it.

This skill is informed by the project's domain model. If a `CONTEXT.md` exists, the domain language gives names to good seams. If `docs/adr/` exists, ADRs record decisions this skill should not re-litigate.

## Process

### 1. Explore

Read the project's domain glossary and any ADRs in the area you're touching first.

Then walk the codebase organically and note where you experience friction:

- Where does understanding one concept require bouncing between many small modules?
- Where are modules **shallow** (interface nearly as complex as the implementation)?
- Where have pure functions been extracted just for testability, but the real bugs hide in how they're called (no **locality**)?
- Where do tightly-coupled modules leak across their seams?
- Which parts of the codebase are untested, or hard to test through their current interface?

Apply the **deletion test** to anything you suspect is shallow: would deleting it concentrate complexity, or just move it?

Assume the next contributor is an agent that sees only the files it opened, copies the nearest example, and takes the shortest path that compiles. Each of these red flags lets a change that looks right from one file be wrong for the repository, so each is a candidate:

- **Hand-synced list**: two or more places list the same items, and adding one means editing every list. One list should be the source; derive the others, or make a test fail when they disagree.
- **Two ways to do one task**: the agent copies whichever it finds first, so both keep gaining callers. Keep one, move its callers, delete the other.
- **Importable internals**: callers reach past the interface into the implementation, so internals become interface without anyone deciding so. Make them unreachable from outside the module.
- **Split ownership**: more than one module writes the same state, or keeps its own copy; the rules drift apart and there is no locality.
- **Information leakage**: modules on both sides of a seam depend on one internal decision (a representation, a wire or storage format), so changing it needs coordinated edits.
- **Pass-through module**: forwards calls of the same shape and adds no policy; it fails the deletion test.
- **Temporal decomposition**: modules follow the order things run (load, validate, transform, save) instead of the knowledge they own, so one rule repeats in every stage.

Look for the domain structure the code is missing. The signs: an if/else or switch chain on a kind or type field that grows one branch per new case, often repeated in several modules (a lookup table, a registry, or one adapter per variant behind one interface would hold it); a second boolean that must stay in sync with the first (a single state field or a state machine); and temporal decomposition, above. Do not force an abstraction. Prefer boring code when the current shape is already clear, local and unlikely to grow.

Run the **reader-load test** on each area you suspect: can a new reader answer "where does X come from?" and "what can change X?" in under 30 seconds? On the way, count the two things that make it slow: the layers they must trace between the question and the answer, and the state they must hold in their head (mutable fields, module state, globals, flags). Either one fails the test alone; a flat file with fifty globals is as hard to read as six thin layers. A good candidate lowers the total: a layer or a piece of state it adds must save at least as much elsewhere.

### 2. Present candidates

Present a numbered list of deepening opportunities. For each candidate:

- **Files**: which files/modules are involved
- **Problem**: why the current architecture is causing friction
- **Solution**: plain English description of what would change, and what it removes: branches, duplicated rules, invalid states, a layer, reachable internals. An abstraction that adds indirection and removes none of these is not a candidate.
- **Benefits**: explained in terms of locality and leverage, in how tests would improve, and in what the reader-load test would gain (layers or state removed)

Use `CONTEXT.md` vocabulary for the domain, and LANGUAGE.md vocabulary for the architecture.

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly.

Do NOT propose interfaces yet. Ask the user: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, drop into a grilling conversation. Walk the design tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Side effects happen inline as decisions crystallize:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md`. Create the file lazily if it doesn't exist.
- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md` right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR so future reviews don't re-suggest it.
- **Want to explore alternative interfaces?** Use the INTERFACE-DESIGN.md process in this skill's directory: write multiple radically different interface designs and compare by depth, locality, and seam placement.

### 4. Execution

Start this step only when the user, or the brief you are working from, asks in so many words to implement the chosen candidate. Picking a candidate, or agreeing on its shape in the grilling loop, is not that ask: end the loop with the decision, ask whether to implement it, and wait. Execution edits code and commits each step; it never pushes.

Then follow `${CLAUDE_SKILL_DIR}/EXECUTION.md`: on a clean tree and a branch of its own, pin current behaviour with a characterization test and prove the pin can fail before any structure moves, move in small steps that each end on green, migrate every caller and delete the old path in one wave, and check the result with the reader-load test.

## Rules

- **No code before step 4.** Steps 1 to 3 produce recommendations, `CONTEXT.md` and ADRs only.
- **Domain language first.** If `CONTEXT.md` defines "Order," talk about "the Order intake module," not "the FooBarHandler."
- **Respect ADRs.** Don't re-litigate documented decisions unless the friction is genuinely severe.
- **Be opinionated.** The user wants a strong read on their architecture, not a menu of equally weighted options.
