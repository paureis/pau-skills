# Build mode

`RULES.md` is the short form; this file says what each rule means in practice. Apply it to the change the user asked
for.

## The ladder

Go down the rungs in order and stop at the first one that does the whole job. The whole job is what the user asked
for, including its error cases, not a demo of it.

1. **It does not need to exist.** This rung applies to every part of the request that nobody asked for: an option
   "for later", a second output format, a setting with one value in use. Ask whether the user would miss the part. If
   not, leave it out and say so in one line ("Left out: the PDF export; say if you want it."). A vague request ("build
   me X") gets the smallest version that does the core job, and the reply names what it left out. Before you move
   on, check that what is left is really needed.
2. **This codebase already does it.** Search for a helper, component, service or pattern that does the job: by name,
   by the words in its messages, in the module the feature belongs to. Use it the way the code around it does. A
   house component beats a native widget, because it carries the project's styles, translations and fixes. Before
   you move on, make sure you searched and found nothing that fits without bending it.
3. **The standard library or the platform does it.** The language's standard library, the browser, the database,
   the operating system or the framework already in use. Use it, unless the project has its own way (then rung 2
   wins). Before you move on, check that the version the project runs on has the feature.
4. **An installed dependency does it.** Read the dependency list and its lock file (`package.json`,
   `pyproject.toml` or `requirements.txt`, `go.mod`, `Cargo.toml`, `Gemfile`, `pom.xml` or `build.gradle`,
   `composer.json`, a `.csproj`). Use what is there, configured the way the project configures it. Never add a
   dependency for a few lines: each one is code nobody here read, with its own updates, license and supply chain.
   When a new dependency really is the least code, ask first, and name it, its size and its license.
5. **One line that a reader understands at a glance.** Short means short to read. A one-liner that needs decoding
   (nested conditions, a chain of five calls, a clever regex) is not short; three plain lines are.
6. **Otherwise, the least code that works.** Plain code, in the style of the file it goes in, with no extra layer.

## Finish the change

Be lazy about the solution, never about the change.

- Before you edit, read the code the change touches and list every place it must reach: callers, tests, fixtures,
  config, exports, and the docs that show how it is used. That list is the scope; extra features are not.
- Look for what the change could break for users: data destroyed or exposed, callers that stop working.
- The shortest working diff wins once you know everything it must touch. A diff that needs decoding is not short.
- Keep values in the form the platform gives you, except money (whole minor units or a decimal type, never a binary
  float) and times (keep the zone). Do not convert a value to a string and back, or wrap it in a type of your own,
  without a reason. Keep the codebase's layers and conventions: a new handler goes where the others are, written
  like them.
- Code you move or merge keeps its validation and error handling.
- Between options of equal size, take the one that is correct on edge cases: empty input, zero, the last item, a
  time zone change.
- Never hand-roll crypto, sanitizing, auth or a parser for a quoted format; use the platform or a well-known library,
  and ask before adding one.
- A comment says only the why the code cannot show, in one line.
- On a bug fix, search for every caller of the function before you edit. A fix in one caller leaves the others broken
  and hides the cause; fix it once, in the shared code.
- Add no layer, wrapper, option or config that nobody asked for: an interface with one implementation, a wrapper that
  only passes calls through, a config key no caller sets. When the change leaves code unused, delete it in the same
  change, after searching the whole tree for it, tests, fixtures, config and string references included. An exported
  API, a command-line flag or a config key may have callers outside the repository: leave a public interface alone
  unless the user asks to remove it.
- A new file needs a reason: a new responsibility, a public interface, or a file the language or the project's layout
  requires (a test file where the runner looks, a handler where the others are). Size alone is not one. Extend the
  nearest existing file first, and keep code that changes together in one place. When a file nears a size limit the
  project sets (a lint rule, a CI check, a hook) and has no real boundary to split along, ask the user to raise the
  limit for that file rather than moving code into a file that exists only to stay under it. A file you do split keeps
  one line that says where each part went.
- The ladder never removes a guard. Checks on input that crosses a trust boundary (a request, an upload, a file, a
  message from another service), error handling that keeps data from being lost, security, accessibility, the
  calibration real hardware needs, and every part the user asked for all stay, even when they are most of the code.

Use `engineering-principles` if it is installed: its principle "Subtract before you add" covers changes in an area
that is already tangled. Without it, remove what the change makes unused before you add.

## Tests

Logic that is not trivial leaves one small test, or an assert-based self-check where the project has no test setup:
a branch, a loop, a parser, money, security, or a whole new script. Every bug fix leaves a regression test that fails
before the fix and passes after it. The test covers the edge cases the change turns on, not only the easy case: a
date fix is tested on both sides of the daylight saving change, a limit at the limit and one past it. A trivial change
(a label, a constant, a config value) needs none. This is not about coverage.

For a parser, money or a data write, a property test finds the edge cases people miss: one rule checked on many
generated inputs (a round trip, an invariant such as totals kept, applying twice equals once, or the same result as a
slow obvious version). Use the project's property library if it has one; without one, a seeded loop with the standard
library (or a small seeded generator of a few lines where it has none), and ask before adding a library. Print the
seed so a failure can be replayed, and keep the smallest failing case as an example test. Use `tdd`'s PROPERTIES.md
for the details if `tdd` is installed; without it, these lines are the rule.

## Shortcut comments

A known limit gets a comment, in the language's own comment syntax, that names the limit and when to upgrade:

- `# shortcut: loads the whole file into memory, stream it when files pass 100 MB` (Python, Ruby, shell, YAML)
- `// shortcut: one worker, add a queue when jobs wait more than a minute` (Go, Rust, Java, C#, Kotlin, TypeScript)
- `-- shortcut: no index on email, add one when the table passes a million rows` (SQL, Lua, Haskell)
- `<!-- shortcut: English only, translate when a second locale ships -->` (HTML, Markdown, XML)

Without the part after the comma, nobody knows when to come back to it. The debt mode tags those rows
`[no-trigger]`, and the reader goes through them first.

## The reply

End with what you skipped or did not check, and any risk, in one or two lines. For example: "Left out: retries on
timeout. Not checked: the Windows path. Risk: none known."

Worked pairs, one per rung and one guard kept, are in `EXAMPLES.md`.
