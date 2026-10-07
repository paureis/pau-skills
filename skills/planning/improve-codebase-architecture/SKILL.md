---
name: improve-codebase-architecture
description: "Find deepening opportunities in a codebase: refactors that turn shallow modules into deep ones for better testability and AI-navigability. Use when the user wants to improve architecture, find refactoring opportunities, consolidate tightly-coupled modules, reduce complexity, make the codebase more testable, or says 'improve architecture', 'find refactoring opportunities', 'the code is getting messy', 'architecture review', 'zoom out on the codebase'. Recommended to run every few days on active codebases."
license: MIT (adapted from mattpocock/skills; see NOTICE)
metadata:
  upstream: https://github.com/mattpocock/skills/tree/main/skills/engineering/improve-codebase-architecture
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

### 2. Present candidates

Present a numbered list of deepening opportunities. For each candidate:

- **Files**: which files/modules are involved
- **Problem**: why the current architecture is causing friction
- **Solution**: plain English description of what would change
- **Benefits**: explained in terms of locality and leverage, and also in how tests would improve

Use `CONTEXT.md` vocabulary for the domain, and LANGUAGE.md vocabulary for the architecture.

**ADR conflicts**: if a candidate contradicts an existing ADR, only surface it when the friction is real enough to warrant revisiting the ADR. Mark it clearly.

Do NOT propose interfaces yet. Ask the user: "Which of these would you like to explore?"

### 3. Grilling loop

Once the user picks a candidate, drop into a grilling conversation. Walk the design tree with them: constraints, dependencies, the shape of the deepened module, what sits behind the seam, what tests survive.

Side effects happen inline as decisions crystallize:

- **Naming a deepened module after a concept not in `CONTEXT.md`?** Add the term to `CONTEXT.md`. Create the file lazily if it doesn't exist.
- **Sharpening a fuzzy term during the conversation?** Update `CONTEXT.md` right there.
- **User rejects the candidate with a load-bearing reason?** Offer an ADR so future reviews don't re-suggest it.
- **Want to explore alternative interfaces?** Use the INTERFACE-DESIGN.md process in this skill's directory: spawn multiple radically different interface designs and compare by depth, locality, and seam placement.

## Rules

- **No code in this phase.** This skill produces architectural recommendations, not pull requests. Implementation comes after decisions are made.
- **Domain language first.** If `CONTEXT.md` defines "Order," talk about "the Order intake module," not "the FooBarHandler."
- **Respect ADRs.** Don't re-litigate documented decisions unless the friction is genuinely severe.
- **Be opinionated.** The user wants a strong read on their architecture, not a menu of equally weighted options.
