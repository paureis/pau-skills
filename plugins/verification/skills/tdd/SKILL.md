---
name: tdd
description: "Test-driven development with a red-green-refactor loop. Use when user wants to build features or fix bugs using TDD, says 'test first', 'red green refactor', 'write tests', 'TDD', 'test-driven', 'build this with tests', or wants integration tests. Also use when the user asks to add test coverage to existing code, or says 'make sure this is tested'."
license: MIT (adapted from mattpocock/skills; see NOTICE)
metadata:
  upstream: https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd
---

# Test-Driven Development

## Philosophy

**Core principle**: Tests should verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

**Good tests** are integration-style: they exercise real code paths through public APIs. They describe *what* the system does, not *how* it does it. A good test reads like a specification — "user can checkout with valid cart" tells you exactly what capability exists. These tests survive refactors because they don't care about internal structure.

**Bad tests** are coupled to implementation. They mock internal collaborators, test private methods, or verify through external means (like querying a database directly instead of using the interface). The warning sign: your test breaks when you refactor, but behavior hasn't changed.

See tests.md for examples and mocking.md for mocking guidelines.

## Anti-Pattern: Horizontal Slices

**DO NOT write all tests first, then all implementation.** This is "horizontal slicing" — treating RED as a batch phase and GREEN as a batch phase. It causes tests to verify imagined behavior rather than real behavior.

**DO use vertical slices.** Each slice is one RED-GREEN-REFACTOR cycle:

1. **RED** — Write ONE test that describes the next behavior. Run it. Watch it fail. The failure message should be clear and specific.
2. **GREEN** — Write the minimum code to make that ONE test pass. Nothing more. Don't anticipate future tests.
3. **REFACTOR** — Clean up only if something smells. Both test and implementation are fair game. Run the test again to verify.

Then loop. Pick the next behavior, write the next test.

## Before You Start

1. **Find the test runner.** Check package.json scripts, Makefile, or equivalent. Run the existing tests to make sure they pass. If there are no tests, set up the simplest possible test infrastructure (don't over-engineer it).

2. **Check for existing test patterns.** Look at how other tests in the codebase are structured — file location, naming convention, test utilities, fixture patterns. Match them.

3. **Identify the public interface.** What module, function, or endpoint are you testing? That's your test surface. Don't go deeper.

## During Development

### Each vertical slice follows this sequence:

**Write the test FIRST.** Name it after the behavior: `"user can add item to empty cart"`, not `"test addItem function"`. The test should use the public interface only.

**Run it and watch it fail.** If it passes immediately, either the behavior already exists (skip this slice) or the test isn't testing what you think.

**Write the minimum implementation.** Just enough to make the test pass. Hardcode if that's the minimum. The next test will force you to generalize.

**Run all tests.** Not just the new one — all of them. If an earlier test breaks, your implementation changed existing behavior. Fix it or reconsider.

**Refactor if needed.** Only if the code smells. Both the test and the implementation are candidates. Run tests after refactoring to verify nothing changed.

### What to test

- **Test behavior, not implementation.** "When I do X, Y happens" — not "function Z calls function W."
- **Test edge cases through the same interface.** Empty inputs, error conditions, boundary values — all through the public API.
- **Test error paths.** What happens when the input is invalid? When the dependency is unavailable? These are behaviors too.

### What NOT to test

- **Private methods.** If you need to test them, the module is probably the wrong shape. Extract a new module with its own interface.
- **Implementation details.** Call counts, internal state, execution order — unless those ARE the behavior (e.g., "this endpoint must be called exactly once" is a real requirement).
- **Framework behavior.** Don't test that React renders components or that Express routes requests. Test YOUR code.

## Mocking Guidelines

**Mock at seams, not at internals.** A seam is where your module meets an external system — a database, an HTTP API, a file system. Mock the external system, not internal collaborators.

**One adapter = don't mock it.** If there's only one implementation of an interface, you probably don't need a mock. Use the real thing.

**Two adapters = real seam.** If you have a real implementation AND a test double, the seam is earning its keep. The mock should be simple and dumb — don't reimplement the real thing.

**Never mock what you own.** If you control both sides of the interface, use the real code. Mocking your own code creates tests that pass when the code is wrong.

## Refactoring

Refactoring happens ONLY when tests are green. The rule: **change structure, not behavior.** If a test breaks during refactoring, you changed behavior — undo and try again.

Good refactoring targets:
- Duplicate code across the implementation
- Long functions that do multiple things
- Unclear names
- Deep nesting

Bad refactoring targets (during TDD):
- "I might need this later" abstractions
- Performance optimization (unless tests prove it's needed)
- Rewriting tests to match new implementation (if you need to, the test was testing implementation)

## Rules

- **One slice at a time.** Never write test 2 before test 1's implementation is green.
- **No test is too small.** If you're unsure whether a behavior works, write a test. Delete it later if it's redundant.
- **Tests are documentation.** A new developer should be able to read the test names and understand what the module does.
- **Green bar before moving on.** Never leave a failing test to "come back to later."
- **Match the project's patterns.** Use the same test framework, file structure, and utilities as the rest of the codebase.
