---
name: tdd
description: "Test-driven development: build or fix code one behaviour at a time in a red-green-refactor loop. Use when the user says 'test first', 'TDD', 'test-driven', 'red green refactor', 'write tests', 'build this with tests', 'add test coverage', 'make sure this is tested'. Writes and runs the tests, not a test plan."
license: MIT (adapted from mattpocock/skills and cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd
  upstream-pstack: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/principle-test-behavior-not-implementation/SKILL.md
---

# Test-Driven Development

## Philosophy

**Core principle**: Tests should verify behavior through public interfaces, not implementation details. Code can change entirely; tests shouldn't.

**Good tests** are integration-style: they exercise real code paths through public APIs. They describe *what* the system does, not *how* it does it. A good test reads like a specification: "user can checkout with valid cart" tells you exactly what capability exists. These tests survive refactors because they don't care about internal structure.

**Bad tests** are coupled to implementation. They mock internal collaborators, test private methods, or peek at what no caller can see (a private field, an intermediate value, which helper did the work). The warning sign: your test breaks when you refactor, but behavior hasn't changed.

State a caller can read back is behavior, not implementation. When the promise is "saving an order stores it", reading the stored row back (through the interface, or straight from the database when that row is what other code reads) checks the promise. What makes a check bad is depending on what nobody outside the code relies on, not where the check looks.

See tests.md for examples and mocking.md for mocking guidelines.

## Anti-Pattern: Horizontal Slices

**DO NOT write all tests first, then all implementation.** This is "horizontal slicing": treating RED as a batch phase and GREEN as a batch phase. It causes tests to verify imagined behavior rather than real behavior.

**DO use vertical slices.** Each slice is one RED-GREEN-REFACTOR cycle:

1. **RED**: Write ONE test that describes the next behavior. Run it. Watch it fail. The failure message should be clear and specific.
2. **GREEN**: Write the minimum code to make that ONE test pass. Nothing more. Don't anticipate future tests.
3. **REFACTOR**: Clean up only if something smells. Both test and implementation are fair game. Run the test again to verify.

Then loop. Pick the next behavior, write the next test.

## Before You Start

1. **Find the test runner.** Check package.json scripts, Makefile, or equivalent. Run the existing tests to make sure they pass. If there are no tests and you are building a feature test first, set up the simplest possible test infrastructure (don't over-engineer it). For a small fix in a project with no test path, do not build one from scratch only to satisfy this workflow: prove the fix another way and say what evidence replaces the test (see "When no new test is better" below).

2. **Check for existing test patterns.** Look at how other tests in the codebase are structured: file location, naming convention, test utilities, fixture patterns. Match them.

3. **Identify the public interface.** What module, function, or endpoint are you testing? That's your test surface. Don't go deeper.

## During Development

### Each vertical slice follows this sequence:

**Write the test FIRST.** Name it after the behavior: `"user can add item to empty cart"`, not `"test addItem function"`. The test should use the public interface only.

**Run it and watch it fail.** If it passes immediately, either the behavior already exists (skip this slice) or the test isn't testing what you think. For a bug fix, commit the failing test on your branch before the fix, so anyone can replay red then green from the history.

**Write the minimum implementation.** Just enough to make the test pass. Hardcode if that's the minimum. The next test will force you to generalize.

**Run all tests.** Not just the new one, all of them. If an earlier test breaks, your implementation changed existing behavior. Fix it or reconsider.

**Check the new test with the two edits** (below) before you keep it.

**Refactor if needed.** Only if the code smells. Both the test and the implementation are candidates. Run tests after refactoring to verify nothing changed.

### What to test

- **Test behavior, not implementation.** "When I do X, Y happens," not "function Z calls function W."
- **Test edge cases through the same interface.** Empty inputs, error conditions, boundary values: all through the public API.
- **Test error paths.** What happens when the input is invalid? When the dependency is unavailable? These are behaviors too.
- **Take the expected value from the requirement**, not from a run of the code. An expected value copied from the output of the code under test passes whether that output is right or wrong.
- **Assert what callers rely on.** An exact error message pins wording no caller reads; assert the error type or code callers branch on, unless the message itself is the promise (text shown to a user, for example).

### What NOT to test

- **Private methods.** If you need to test them, the module is probably the wrong shape. Extract a new module with its own interface.
- **Implementation details.** Call counts, internal state, execution order, unless those ARE the behavior (e.g., "this endpoint must be called exactly once" is a real requirement).
- **Framework behavior.** Don't test that React renders components or that Express routes requests. Test YOUR code.

### The two-edit check

Keep a test only when it passes both of these edits:

1. **Break the behavior.** Make the code return a wrong value, skip an effect, or do it twice. The test must fail. If it still passes, it proves nothing: the usual causes are an assertion looser than the promise, an expected value computed by the code under test, or an assertion on data the test built itself.
2. **Change only the internals.** Restructure the code underneath (rename a private helper, inline a variable, reorder independent steps) while every observable result stays the same. The test must still pass. If it fails, it is pinned to the implementation: it will need a rewrite on every refactor and still catches no bug.

Rewrite or delete a test that fails either edit. If the `mutation-test` skill is installed, run the first edit through its harness, and the second through its refactor mode; for a bug fix, the fix commit reversed is a ready-made first edit. The harness needs the test and the code committed first, changes one file per edit, and takes the file path relative to the repository root (run it, and any `git show -R` that feeds it, from the root; the test command runs there too). If it is not installed, or the edit spans several files, do both by hand: commit first, make the edit, run the test, look at the result, then restore with `git checkout -- <file>` and confirm `git status` is clean.

For the second edit, run all the tests that cover the code, not only the new one. Read any failure before blaming the test: a build error, a syntax error or a missing import means the refactor was wrong, not the test.

## Mocking Guidelines

**Mock at seams, not at internals.** A seam is where your module meets an external system: a database, an HTTP API, a file system. Mock the external system, not internal collaborators.

**One adapter = don't mock it.** If there's only one implementation of an interface, you probably don't need a mock. Use the real thing.

**Two adapters = real seam.** If you have a real implementation AND a test double, the seam is earning its keep. The mock should be simple and dumb. Don't reimplement the real thing.

**Never mock what you own.** If you control both sides of the interface, use the real code. Mocking your own code creates tests that pass when the code is wrong.

## Refactoring

Refactoring happens ONLY when tests are green. The rule: **change structure, not behavior.** If a test breaks during refactoring, either you changed behavior (undo and try again) or the test is pinned to the implementation (it fails the second edit of the two-edit check: rewrite it against the public interface).

Good refactoring targets:
- Duplicate code across the implementation
- Long functions that do multiple things
- Unclear names
- Deep nesting

Bad refactoring targets (during TDD):
- "I might need this later" abstractions
- Performance optimization (unless tests prove it's needed)
- Rewriting tests to match new implementation (if you need to, the test was testing implementation)

## When no new test is better

**Prefer no new test over a bad test.** Do not add a test that:

- mostly tests mocks;
- encodes the current implementation details;
- depends on timing or on unrelated global state;
- needs expensive infrastructure (a broad harness, a slow end-to-end setup, production-only state) for a small fix;
- would be deleted right after proving the fix.

For a fix or a small change where a test like that is the only one on offer, prove the change with the closest executable check instead: a targeted script, a reproduction command, browser automation, a log assertion or a focused integration run. Show it failing before the change and passing after, and say in your report which check replaced the test and why there is no new test.

A feature built test first still starts every slice with a failing test. This rule decides which tests are worth keeping, not whether RED comes first.

## Rules

- **One slice at a time.** Never write test 2 before test 1's implementation is green.
- **Prefer no new test over a bad test.** Keep a test only when it passes the two-edit check. A redundant or brittle test is a cost, not a safety net.
- **Tests are documentation.** A new developer should be able to read the test names and understand what the module does.
- **Green bar before moving on.** Never leave a failing test to "come back to later."
- **Match the project's patterns.** Use the same test framework, file structure, and utilities as the rest of the codebase.
