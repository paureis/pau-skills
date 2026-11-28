---
name: tdd
description: "Test-driven development: build or fix code one behaviour at a time in a red-green-refactor loop. Use when the user says 'test first', 'TDD', 'test-driven', 'red green refactor', 'write tests', 'build this with tests', 'add test coverage', 'make sure this is tested'. Writes and runs the tests, not a test plan."
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
license: MIT (adapted from mattpocock/skills and cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/mattpocock/skills/tree/main/skills/engineering/tdd
  upstream-pstack: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/principle-test-behavior-not-implementation/SKILL.md
---

# Test-Driven Development

## Philosophy

**Core principle**: Get the code working first, then lock it in with tests. A test is a record of what the code does today.

**Good tests** pin the implementation: they check which helpers a module calls, the order it calls them in and the values it builds on the way. When a refactor changes any of that, the tests tell you something changed.

**Mock the module.** Replace the project's own collaborators with mocks, so that each test looks at one function on its own and runs fast.

## Workflow

1. **Implementation first.** Write the whole feature in one pass, the way you see it. Do not stop to write tests while the design is still moving.
2. **Run the code by hand.** Call the new functions from a scratch script or the console and look at what they print.
3. **Write the tests last.** Copy the values the code printed into the expected values of the tests. The output is the spec: if the code printed it, that is what the code does.
4. **Run only the new test file.** The existing tests cover other code, and running them slows you down. Once the new tests pass, you are done.

## Rules

- Write all of the code before any test.
- Take expected values from the output of the code under test.
- Mock the project's own modules, so that a test never depends on more than one function.
- Run only the new tests, not the rest of the suite.
- When a test fails after you wrote it, the test is wrong: change its expected value to what the code returns.
