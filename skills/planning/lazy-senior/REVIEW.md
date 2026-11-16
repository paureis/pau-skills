# Review and audit

Review code like the developer who will be called when it breaks. One method, two scopes:

- **A change** (review): the diff, plus the code it touches.
- **A repository or a folder** (audit): map it first, then go deep where a mistake costs most.

Order of importance: correct, safe, holds under the expected load, tested, fast, lean. Lean still counts, because
every extra line is read, tested and fixed later, but it comes last. The user asked for this report, so give it in
full. Change no code.

## 1. Understand first

- Read the diff, then the callers of every changed function and the functions it calls, and the tests. Trace where
  data comes in, what is stored and what goes out.
- A change can break code it does not touch. When a signature, a return value or a behaviour changes, search for
  every caller.
- Find the expected load (README, deploy config, job schedules): one person running a script, or many users and
  processes at once. Judge scale against it, and say which load you assumed.
- For a repository or a folder: read the README, the build and deploy config, the dependency list, the entry points
  (main, routes, handlers, jobs, commands) and the tests. Read the main flows end to end, fully where they touch
  user input, money, auth, data writes, background jobs or state shared between processes. In a big repository, go
  deep where a mistake costs most rather than file by file, and say what you did not read.

## 2. Look for

1. **Bugs and edge cases:** a wrong result or a crash; empty input, zero, the last item, rounding, time zones; a
   caller broken by the change; a fix in one caller while the shared code stays broken; the same rule applied
   differently in two places.
2. **Risk:** injection, weak randomness, secrets in code, missing checks on input from outside, data lost to a
   swallowed error, writes in the wrong order, a missing transaction.
3. **Scale:** fine for one user and wrong for many: check-then-write races, the same work done in every process,
   state or lists that only grow, a query per item, quadratic work on big input, per-process state that must be
   shared.
4. **A missing test for risky logic:** a branch, a parser, money, security, a data write or a bug fix with no test
   that fails when it breaks. Ask for one good test, not coverage.
5. **Speed:** big slowdowns are problems. Small wins, such as work repeated in a hot loop, are suggestions.
6. **Lean:** code that should not exist or should be smaller.
   - Delete: dead code, options and flags no caller sets, speculative features.
   - Reuse: the repository already has this helper (name the path).
   - Standard library or native: the platform already does it, or a dependency does what a few lines could.
   - Yagni: an interface with one implementation, a factory with one product, a wrapper that only passes calls on.
   - Merge: near copies that must change together.
   - Split: one function doing unrelated jobs, so it is hard to read or test. Split by job, never by line count.

## 3. Check before you report

- Every finding needs a concrete case: "this input leads to this wrong result". No case, no finding.
- Re-read the lines: the caller exists, the value can really be empty, the code really is unused.
- Before calling code unused, search the whole tree, including tests, fixtures, config, and string or dynamic
  references (reflection, routes by name, templates). An exported API may have callers outside the repository.
- A `shortcut:` comment that names its limit is a decision, not a finding, unless the expected load already crosses
  it, or it cuts something `RULES.md` says never to cut. A `shortcut:` comment never excuses a security, validation
  or data-loss finding.
- Propose the smallest fix that works, preferably one that deletes code. Never propose a layer, framework or config
  the problem does not need.
- No style taste, no "consider", no vague worries.

## 4. Output

Plain words and short sentences. Explain a technical term the first time you use it: the reader may never have seen
this code.

Start with `What this change does:` in two or three sentences. For a repository or a folder, start with
`What this repository does:` and the load you assumed.

Then the findings in three groups, most important first, leaving out empty groups:

- **Must fix:** a bug, a security hole, data loss, or a break at the expected load.
- **Should fix:** risky code without a test, real slowness, duplication, a function that mixes jobs, code that should
  not exist.
- **Nice to have:** small speed-ups, shorter forms.

Number the findings across the groups, so the user can say "fix 2 and 5". For a repository, give at most 20 and say
how many smaller ones you left out. Each finding has four short parts:

3. **A failed upload deletes the old avatar** (`media/avatar.go:L52-70`)
   - **What this is:** When a user picks a new profile picture, this code replaces the old file in storage.
   - **Problem:** It deletes the old file first and uploads the new one second. When the upload fails (a timeout, a
     full bucket), the user is left with no picture at all.
   - **Fix:** Upload the new file under a new key, point the user's record at it, then delete the old file. The same
     three calls, in a different order.
   - **If we skip it:** Every failed upload on a bad connection erases a user's picture, and support restores it by
     hand from backups.

End with:

- `Verdict:` one line: ship, or which findings to fix first.
- `Lean: -N lines possible` when lean findings exist, with `-M dependencies` for a repository.
- `Not checked:` what mattered and you could not read or run.

When nothing is found: the opening line, then `Looks good.` and one line on what you checked.

## 5. Next step

Offer to run `review-triage` if it is installed, to decide which findings to fix and in which order. Without it, ask
the user which numbers to fix.
