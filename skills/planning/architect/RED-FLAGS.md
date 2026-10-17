# Design red flags

Screen every sketch against this list before choosing one. A red flag is a reason to revise the shape or reject it.

Assume the next contributor is an agent that sees only the files it opened, copies the nearest example, and takes
the shortest path that compiles. A design passes when a change that looks right from one file is right for the whole
repository.

## Terms

- **Module**: anything with an interface and an implementation, at any size: a function, a class, a package.
- **Interface**: everything a caller must know to use the module correctly: types and signatures, but also
  invariants, ordering, error modes, configuration and performance.
- **Depth**: how much behaviour a caller gets per unit of interface it has to learn. A deep module hides a lot
  behind a small interface; a shallow one has an interface nearly as complex as its implementation.
- **Seam**: the place where an interface lives, where behaviour can change without editing the callers.
- **Adapter**: a concrete thing that satisfies an interface at a seam. One adapter is a hypothetical seam; two
  adapters make it real.
- **Leverage** is what callers get from depth; **locality** is what maintainers get: a change, a bug or a rule lives
  in one place.

## Shallow module

The interface is large and hides little. Signs: a caller calls several methods in a fixed order to finish one
operation; public options expose internal stages or choices; learning the interface does not save the caller from
learning the implementation. Fix: pull the coordination into the module and shrink the interface to the operations
callers actually want.

A deep module is not a deep call chain. A chain of thin layers spreads understanding across files; a deep module
concentrates it behind one interface.

## Information leakage

Two or more modules depend on the same internal decision: a representation, a policy, a wire format. Changing it
needs coordinated edits, and an agent that edits one place does not know about the others. A transport or storage
type on the public interface is leakage. Fix: parse outside data into the module's own types at the seam, and keep
schemas, framework objects and protocol details private.

## Temporal decomposition

Modules follow the order things happen (load, validate, transform, save) instead of the knowledge they own, so one
representation and its rules repeat across every stage. Fix: group code by what it knows. Steps that run at
different times belong in one module when they protect the same decision.

## Pass-through method

A method forwards its arguments to another method of the same shape and adds nothing. Fix: remove it, or move the
responsibility to the module that can finish the job. Keep a forwarding layer only when it adds a policy, an
adaptation or a real abstraction.

## Split ownership

More than one module writes the same state, or keeps its own copy. An agent that changes one writer cannot see the
others, so their rules drift apart. Fix: one owner per piece of state; everything else reads it or asks the owner to
change it.

## Two ways to do one task

The design offers more than one way to do the same thing. An agent copies whichever it finds first, so every way
keeps gaining callers. Fix: keep one way, move the callers off the others and delete them in the same change.

## Importable internals

A caller can import the module's internals. An agent takes the shortest path that compiles, so it imports them, and
they become part of the interface without anyone deciding so. Fix: make the internals unreachable, so an import from
outside fails the build. Most languages have a way: `internal/` packages in Go, `pub(crate)` in Rust, `internal` in
C# and Kotlin, package-private classes or `module-info` exports in Java, the `exports` map of a JavaScript package,
a leading underscore plus an import-linter contract in Python.

## Hand-synced list

Two or more places list the same items, and adding an item means editing every list. An agent that sees one list
updates only that one. Fix: keep one list and derive the others from it. When a list cannot be derived, make the
build or a test fail when the lists disagree.
