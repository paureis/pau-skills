# Rules for agents that edit files with scripts

These are the working rules I keep in my global `CLAUDE.md`. Each one was written after a failure, and most were
broken again after being written down, which is why several now ship next to a hook, a script or a test that
enforces them. They are general: nothing here depends on a particular project or stack.

The rule that produced the rest:

> **The third time you break a written rule, stop rewriting it and mechanize it** (a gate, a script, a test).

## Write the file, run the file, read the seam

Apply these mechanically, never case by case: each was broken repeatedly while already written down, and every break
reported success.

- **No string payload inline, ever.** `node -e`, `python -c`, unquoted heredocs and `git commit -m` never carry prose,
  backticks, `$` or quotes. A quoted heredoc (`<<'EOF'`) expands nothing and is safe. Write the script or message to a
  scratch file and run it (`node file.mjs`, `git commit -F file`), or use the editor tool. Bash executes backticks
  inside double quotes and splices their empty output in; an inner quote ends the string and runs the rest as
  commands, and the file or commit comes out silently wrong. Once, a commit never happened and the branch was pushed
  without it.
  *Enforced by:* the `guards` plugin's inline-backtick hook.
- **Never pass a string as the replacement to `String.replace`** inside such a script: `$$` collapses to `$` and
  backslashes in template literals vanish (SQL dollar-quoting and regexes break). Use `split(old).join(new)` or a
  function replacer.
- **No backtick inside any JS/TS template literal, comments included** (SQL tagged templates, CSS inside a build
  script). It closes the literal and surfaces as an unrelated parse error somewhere else. Typecheck after editing such
  a file.
- **Verify the artifact, never the exit code.** After any edit you did not type by hand (scripted, regex-anchored,
  line-numbered, merge-driven), read the seam back: grep the line, `git diff --stat`, `git log --oneline -1`. Known
  silent failures and their fixes:
  - a multi-line replace does nothing on CRLF files;
  - resolve conflicts with the editor or `--ours`/`--theirs`, never by deleting lines by number;
  - anchor an insert on the `/**` of a JSDoc, not on the function under it;
  - edit a hand-authored JSON file in place, never by parse-and-reserialize;
  - key an idempotency guard on a sentinel unique to the inserted block.
- **Mutation testing has three assertions, not one.** Commit any file you have touched first (`git checkout --`
  erases uncommitted edits silently and does nothing on untracked files, so mutations stack). Assert the mutation
  applied, by content and not by `git status` (`sed -i` rewrites CRLF line endings even when nothing matched). Assert
  the restore. A green run after a mutation means "the mutation failed" as often as "the test is weak", and "applied"
  is not "changed behaviour": a sed that only appended `and true` to a SQL join read as SURVIVED. Read the changed
  lines before believing a SURVIVED.
  *Enforced by:* the `verification` plugin's `mutate.sh`, which prints the changed lines on SURVIVED.
- **Every background wait has a bounded loop that prints its last observed state on expiry.** An unbounded `until` on
  a condition that could never become true (a health check on a preview deployment that lacked a required key) left
  the person waiting an hour without news while everything else was ready.
  *Enforced, for subagents, by:* the `agent-orchestration` plugin's no-idle hook.
- **Every ad-hoc check needs a control and ordered anchors.** A byte-offset "is X under section Live" check matched
  the navigation menu first and was confidently wrong for three items. Assert that the anchors are unique and ordered
  (`live < building < exploring`) and include items that must come out the other way. A check with no control is a
  check that cannot fail.
- **`A && B` hides which step failed**: A's failure reads as B's. Run a build and its verification as separate calls,
  or print a marker between them.

## Scope every destructive filter to the repository path

A process or file filter that can kill or delete is constrained by the working-directory path, never by a tool name,
and its target list is printed before it is acted on. When several projects run on one machine, matching node
processes on `next` once killed a production build in an unrelated project. The same applies to `pkill`,
`find -delete`, and any glob that could reach outside the repository.

## Verify the account before any cloud command

Before any cloud-provider CLI or API call that could read or change real resources, check that the active account,
tenant, subscription or team scope matches the target project. These tools silently default to whichever one is
currently active. Cross-check against IDs recorded in the project's own docs; if nothing is recorded yet, confirm once
with the owner and record it.

## Secret hygiene in commands

- Never let a live secret appear literally in a command's visible text or in the agent's own reply once it has been
  obtained. Stage it in a scratch file, reference it with command substitution (`$(cat file)`, `--body @file`) or an
  environment variable read from that file, and delete the scratch file right after use.
- Byte-check every staged secret before use, whatever wrote it: length, no leading UTF-8 BOM (`EF BB BF`), ASCII only,
  the expected prefix, and the tail (a masked value can pass the length and prefix checks and still end in dots).
  Then prove it once against its real endpoint before storing it. Print byte counts and the hex of the first and last
  bytes only, never a prefix of a random secret.

## Dependencies

- Install packages through a supply-chain scanner where one is available (for example `socket npm install`, which
  needs Socket's CLI); install from a lockfile with `npm ci`.
- When the scanner blocks on a **transitive** dependency's CVE that has a patched version, add an npm `overrides`
  entry pinning that dependency to the lowest patched version (a caret range is fine), then check the tree resolves to
  one clean version (`npm ls <dep>`). This removes the CVE instead of suppressing it. Do it only when the patched
  version is semver-compatible with what the dependents expect.
  *Related:* the `guards` plugin's `dependency-security-audit` skill.

## Do not trust pixels for load-bearing claims

Screenshot and UI text can render misleadingly: truncation, kerning, compressed columns that silently drop characters.
When an environment variable name, an ID or an exact value matters, verify it with a direct CLI or API read before
reporting pass or fail.

## Rule stores stay short

Before adding any rule or memory, score the proposed text against what is already written. A duplicate means the
existing rule failed as a rule: make it enforceable instead of restating it. A new rule is allowed only if it will
recur and fits in a few lines. A session's net growth of the rule stores should be zero or negative.
*Enforced by:* the `session-discipline` plugin's `retrospective` skill and its `audit.mjs`.

## Worktree hygiene

A worktree whose work is merged, landed or abandoned is removed in the same session, with its build outputs and
`node_modules`. Run `git worktree list` and `git worktree prune`, then look for folders git no longer tracks, because
pruning leaves them behind. Before deleting one, confirm `git -C <dir> status --short` is empty and look at its size
and contents. Remove it from the repository root: a shell inside it makes `git worktree remove` fail.

## Windows notes

- **Git Bash rewrites `/tmp/x` into a Windows path before passing it to native programs such as `docker`.** A
  container restore once read a file that did not exist and reported one error and zero tables. Prefix such commands
  with `MSYS_NO_PATHCONV=1`, and a command that pipes stdin from a file must actually have the `< file`.
- **Windows PowerShell 5.1 has no safe way to write a secret file for bash.** Its default redirect writes UTF-16LE,
  and `-Encoding utf8` prepends a BOM that bash `$(cat file)` keeps and the consumer rejects confusingly. Use bash `>`
  or PowerShell 7 with `-Encoding utf8NoBOM`.
