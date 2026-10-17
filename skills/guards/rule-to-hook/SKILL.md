---
name: rule-to-hook
description: Turn a written rule that keeps getting broken (in CLAUDE.md, AGENTS.md, a style guide, or a correction the user keeps repeating) into an enforced mechanism at the highest layer that holds it (architecture, types, a lint or CI check with a ratchet when the pattern is already common, a test) or a Claude Code hook when the rule is about what the agent does; pins the rule down with real violations and near-misses, writes a small tested check whose error names what to use instead, proves it fails on a mutation and on a real past mistake, registers it, and records it in a rule table with expiring, approved exceptions. Use when the user says "this rule keeps getting broken", "I keep telling Claude not to", "make this a hook", "enforce this rule", "turn this into a guard", "block this command", "stop the agent from doing X", "why does it ignore CLAUDE.md", or when the same correction has come up three times.
disable-model-invocation: true
argument-hint: "[the rule, or where it is written, e.g. 'CLAUDE.md: never git add -A']"
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/correct
---

# Rule to hook

A written rule that gets broken three times stops being a rule and becomes a script, a hook or a gate. This skill
does that conversion in a fixed order, so the result lives at the highest layer that can hold it, blocks the real
violation, leaves the near-misses alone, and has a test that has been seen to fail.

This skill implements one rule. To find which rules a project needs, from its review comments, fix commits and
transcripts, suggest the user run `/agent-friendly-audit` (or `/planning:agent-friendly-audit` from a plugin) if it
is installed; it uses the same fix order and the same exception format. Without it, start from the rule the user
names.

The rule, or where to find it: $ARGUMENTS

Bundled files, open them when you reach their step:
- `${CLAUDE_SKILL_DIR}/HOOK-EVENTS.md`: every hook event, its input, and how it blocks or informs
- `${CLAUDE_SKILL_DIR}/templates/pretooluse-guard.mjs`: Bash-command guard skeleton (Node.js)
- `${CLAUDE_SKILL_DIR}/templates/pretooluse-guard.py`: the same skeleton in Python
- `${CLAUDE_SKILL_DIR}/templates/guard.test.mjs`: test skeleton with DENY and PASS tables
- `${CLAUDE_SKILL_DIR}/templates/settings-snippet.json`: the registration block
- `${CLAUDE_SKILL_DIR}/templates/ratchet.mjs`: a count-against-a-baseline check for a pattern that is already common,
  with expiring exceptions (Node.js, scans files of any language)

The templates above are enough to build a guard. For worked examples, read the guards in `hooks/guards/` of the
pau-skills repository (no-verify, merge, destructive, secret and inline-backtick guards), with their tests in its
`tests/` folder. With the pau-skills plugin installed they are at `${CLAUDE_PLUGIN_ROOT}/hooks/guards/`; otherwise
they are at https://github.com/paureis/pau-skills/tree/main/hooks/guards. Each has a pure decision function, a
fail-open main block, and a table of commands to deny and to pass.

## 1. Pin the rule down

A vague rule produces a guard that blocks the wrong things. Before writing code, write the rule as one sentence that
a script could check, and collect evidence.

- [ ] Find the rule's current text and location (CLAUDE.md, AGENTS.md, CONTRIBUTING, a style guide, memory files).
      Quote it exactly.
- [ ] Collect **violations**: real commands, edits or replies that broke it. Search the session transcript, past
      transcripts if the user can point you to them, `git log -p`, review comments, and the repository itself
      (`grep -rn` for the forbidden pattern). Ask the user for the cases they remember. For each violation that a
      later commit fixed, note the commit and the file: step 4 runs the new check on the version before the fix.
- [ ] Count the **live instances**: the places in the current code that break the rule today. A handful can be
      fixed in the same change; many mean the check needs a ratchet (step 2).
- [ ] Collect **near-misses**: things that look like the violation and must stay allowed. A quoted mention in a
      commit message, a flag with the same letter on another program, the safe form of the same command. These are
      what turn a guard from useful into something people switch off.
- [ ] Write the precise rule: what is denied, what is allowed, and why (one line). Confirm it with the user if any
      example was ambiguous.
- [ ] Look for the rule in the project's rule table (step 5). If it is already there and nothing enforces it, it is
      a repeat: enforce it in this change.

Done when you have the precise rule, at least three violations and at least three near-misses, all concrete, and
the count of live instances.

## 2. Decide whether and how to mechanize it

Some rules cannot be checked by a script ("write clear names", "think before editing"). Say so, and leave those as
text. For the rest, try each layer in this order and stop at the first one that can hold the rule. Write down why
each layer above the chosen one did not work; the report asks for it.

1. **Architecture: make the rule unnecessary.** One supported way to do each task (keep one, move the callers,
   delete the others and any dead code an agent would copy); internals that cannot be imported, so the wrong import
   fails the build; one source of truth instead of a hand-synced list, or a build that fails when copies disagree.
2. **Types: make the bad state impossible to write.** A distinct type for a validated value, a closed set instead of
   a string, a required field instead of an optional one that is always set.
3. **A lint or CI check whose error names what to use instead.** If the pattern is already common, make it a
   ratchet. Both are described after the table.
4. **A test of the behaviour.** The rule is really a requirement.
5. **Prose, last, and only for judgment calls.** Nothing fails when an agent skips it.

Where a Claude Code hook fits: it is the right layer for a rule about what the agent does, such as the commands it
runs, the files it writes, when it may stop, or the context it keeps forgetting. It is the wrong layer for a rule
about the code itself (a banned call, a forbidden import, a naming rule): that belongs in the code's own types, lint
or tests, so humans, other tools and CI meet it too. Such a rule can get a hook as a second layer that stops the
agent earlier, never as the only one.

Once you know the layer, pick the cheapest mechanism in it that sees the violation **before** it does damage.

| The rule is about | Mechanism | Why |
|---|---|---|
| A shell command the agent must not run | Claude Code `PreToolUse` hook, matcher `Bash` (add `PowerShell` for Windows users) | Sees the exact command before it runs; the agent reads the reason and adapts |
| Content the agent must not write into files | `PreToolUse` on `Write\|Edit\|MultiEdit` | Blocks before the file changes |
| Files must be in some state after edits (formatted, generated, valid) | `PostToolUse` on edits, returning the problem to Claude | The edit already happened; the hook makes the agent fix it now |
| What the agent must do before it says done | `Stop` hook with `{"decision":"block","reason"}`, honouring `stop_hook_active` | The only point where "finished" can be refused |
| Context the agent keeps forgetting | `SessionStart` or `UserPromptSubmit` with `additionalContext` | Informs; does not block |
| Commits by anyone, human or agent | git pre-commit or pre-push hook (pre-commit framework, husky, lefthook, or a plain `.git/hooks` script) | Applies outside Claude Code too, but can be skipped with `--no-verify` |
| A code pattern in the source | Linter rule: ESLint `no-restricted-syntax`/`no-restricted-imports`, Ruff or a flake8 plugin, golangci-lint `forbidigo`, Clippy `disallowed_methods`, Checkstyle or ArchUnit, RuboCop, PHPStan, .NET BannedApiAnalyzers, or Semgrep for any language | Runs in the editor and in CI; the strongest home for code rules |
| Something that must hold on every merge | CI check that is required by branch protection | Nobody can merge around it |
| Behaviour of the program | A test | The rule is really a requirement |

Choosing between hook outputs (details in `HOOK-EVENTS.md`):
- **Deny with exit 2** when the violation is unambiguous and a false positive costs little (the agent rephrases).
- **`permissionDecision: "ask"`** when the action is sometimes right, so the user decides case by case.
- **`additionalContext`** when you can only remind, not judge.

Often the answer is two layers: a hook that stops the agent early and a CI check that catches everyone else. Say
which layer covers what.

**Every message names what to use instead.** A hook reason, a lint message or a CI error says what was found and
which file, function or command to use: "use `config.load()` from `app/config`, not `os.environ` (rule
no-env-read, see CLAUDE.md)", not "forbidden call". An agent that reads only "denied" tries variations until one gets
through. Linters take the message in the rule's configuration: ESLint `no-restricted-syntax` and
`no-restricted-imports` take a `message` per entry, Ruff's `lint.flake8-tidy-imports.banned-api` a `msg`, Clippy's
`disallowed-methods` in `clippy.toml` a `reason` and a `replacement`, golangci-lint `forbidigo` a `msg` per pattern. A grep step in
CI prints the replacement itself.

**A ratchet, for a pattern that is already common.** When the live count from step 1 is too large to fix in this
change, the check counts the instances against a committed baseline and fails only when a change adds more. When
the count drops, it asks for the baseline to be lowered in the same change, so the count cannot climb back. The
baseline is a number per rule (or per file and rule), not a list of exceptions. Use the project's tool when it has
one:
- ESLint: `eslint --suppress-rule <rule>` (or `--suppress-all`) writes the current counts per file and rule to
  `eslint-suppressions.json` (moved with `--suppressions-location`); later runs fail when a file goes over its
  count, and fail when a count drops until `--prune-suppressions` lowers it. `--max-warnings <n>` is a cruder ratchet
  on the warning total.
- Ruff: `ruff check --add-noqa="<reason>"` writes a `noqa` comment with the reason on every current violation, so
  only new lines fail. It records each line, not a count; the `RUF100` rule reports `noqa` comments that no longer
  match anything.
- golangci-lint: `--new-from-merge-base <branch>`, `--new-from-rev <rev>` or `--new-from-patch <file>` report only
  issues in code the change touched. This is a diff ratchet, not a count: an old instance moved into a touched line
  reappears.
- Anything else, in any language: `${CLAUDE_SKILL_DIR}/templates/ratchet.mjs` counts the lines matching a regular
  expression in the files chosen by git globs and compares the count with a baseline file. Copy it into the project
  (for example `scripts/ratchet.mjs`), run it once with `--update` to write the baseline, commit both, then run the
  same command locally and in CI. Its usage is at the top of the file, and its error names the replacement you pass
  with `--instead`.

**Exceptions go on the offending line**, with a reason, an expiry date and who approved it:
`<comment marker> <check id>: allowed until <date>, <reason>, approved by <role or handle>`, for example
`# no-env-read: allowed until 2026-12-31, read before the config loader exists, approved by @org/platform-owners`.
Record the approver the way the project records approvals (a code owner team, a reviewer handle), never a person's
name. An agent may propose an exception; a human approves it. The check reads the date and fails on an expired or
incomplete exception (`ratchet.mjs` does). When the tool has its own suppression comment, put the same fields in the
text it allows after the codes (`# noqa: T201 <fields>`, `// eslint-disable-next-line <rule> -- <fields>`), and add
a small CI step that fails on an expired date.

Done when you have named the layer and why the layers above it did not work, the mechanism, the event and matcher
(for a hook), the output style, whether it needs a ratchet, and the reason.

## 3. Write the guard and its test table

For an architecture or type fix, make the change and keep one of the step 1 violations as a small case that must
now fail to build (or, for an interpreted language, fail to load or run). For a lint rule, CI check or test, the
discipline below still holds: the decision in one place, every violation from step 1 as a case that must fail,
every near-miss as a case that must pass, using the tool's own rule tester where it has one, and a message that
names what to use instead. The rest of this step is written for a hook.

Copy the template that matches the project's language (Node.js or Python; both use only the standard library), into
`.claude/hooks/<rule-id>.mjs` or `.py` for a project hook. Then:

- [ ] Replace the example rule with yours. Keep the decision in a **pure function** (command or tool input in,
      reason or null out, no I/O), so the test table can call it directly.
- [ ] **Fail open** on input it does not understand: not JSON, another tool, a missing field, an exception inside the
      decision. Exit 0. A guard that crashes closed blocks every command in the session. Fail closed only when that
      is the point (a secret about to be written), and say so in the file header.
- [ ] Parse the command, do not just search it. `echo "git add ."` and `git commit -m "never git add -A"` contain the
      text but are not violations. The template's splitter handles quotes, `&&`, `;`, pipes and `bash -c`.
- [ ] Write the reason for the agent: what was blocked, the rule, and what to do instead. A bare "denied" makes the
      agent try variations until one gets through.
- [ ] Copy `guard.test.mjs` (or write the pytest equivalent) and fill **DENY** with every violation from step 1 plus
      obvious variants (flag order, env prefixes, wrappers), and **PASS** with every near-miss plus a few unrelated
      commands. Keep the subprocess tests: one deny, one pass, and garbage stdin that must exit 0.
- [ ] Run the tests. All green before going on.

How strict to be: lean toward denying too much only when a false positive is cheap (the agent rephrases, or `ask` lets
the user wave it through) and a miss is expensive (secrets, data loss, a push to a shared branch). When false
positives would interrupt common work, narrow the pattern and accept a few misses; a guard people disable protects
nothing. Write the choice in the file header.

Done when the guard file and its test exist and every test passes.

## 4. Prove the test can fail

A test you have never seen fail proves nothing. Break the decision function on purpose and watch the suite go red,
then run the check on a real past mistake.

1. **Commit** the guard and its test first (or, if the user does not want a commit yet, copy the guard to a scratch
   file to restore from). Restoring with `git checkout --` erases uncommitted work, and does nothing on an untracked
   file, so a mutation applied to an uncommitted file can silently stick.
2. **Apply one mutation and assert it applied**, by reading the content, not by trusting the edit command: for
   example change `return why` to `return null` in `check()`, then `grep -n "return null" <guard>` to see it.
3. **Run the tests and expect red.** Every DENY case should fail. If the suite stays green, the test does not exercise
   the decision function; fix the test, not the mutation.
4. **Restore and assert clean**: `git checkout -- <guard>` (or copy the scratch file back), then
   `git diff --exit-code -- <guard>` must print nothing, and the tests must be green again.

These steps work by hand. If the `mutation-test` skill is also installed, its `mutate.sh` automates them, with each
step checked by the script; its usage is at the top of the file. With any pau-skills plugin the path is
`${CLAUDE_PLUGIN_ROOT}/skills/verification/mutation-test/mutate.sh` (every plugin ships the whole repository); with
the skill installed on its own, it is in that skill's folder.

Then the real past mistake, when step 1 found a commit that fixed a violation: get the version before the fix, either
the file (`git show <sha>^:<path>` into a scratch folder) or the whole tree
(`git archive <sha>^ | tar -x -C <tmp>`), run the new check on it, and see it fail with its message naming what to
use instead. Run it on the current code and see it pass. For a ratchet, also see it pass at the baseline count, fail
with one more instance added to a scratch copy, and fail on an exception whose date has passed. With no fixed
violation in history, say "no past mistake" in the report; the mutation is then the only proof.

Done when you have seen the suite fail on the mutation and pass again after the restore, and the check fail on the
past mistake (or noted that there is none).

## 5. Register it, test it live, record the rule

- [ ] Register it. For one project, merge `templates/settings-snippet.json` into `.claude/settings.json` (edit the
      file in place, keep its other keys, and use `$CLAUDE_PROJECT_DIR` in the command so it works from any
      subdirectory). For a plugin, add it to the plugin's `hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}`. For a git
      hook, linter or CI check, wire it the way the project already does (find the existing config first).
- [ ] Test it live once. For a hook, in a new session or after reviewing it in `/hooks`: run a **harmless** command
      that matches the rule (the template's example denies `git add --all --dry-run`, which changes nothing even if
      it got through) and confirm the block and the reason. Then run one near-miss and confirm it passes. If the live
      run disagrees with the tests, the registration is wrong (matcher, path, interpreter name), not the tests. For a
      lint rule, CI check or test, run the same command locally and in CI, and see the violation fail in CI too (a
      throwaway branch or pull request that adds one violation). A check that runs only on one machine enforces
      nothing.
- [ ] Update the original rule text. Add a line such as
      `Enforced by: .claude/hooks/no-blanket-git-add.mjs (PreToolUse, Bash)`, so the next reader knows the rule is
      mechanical and where to change it. Keep the sentence while an enforcer exists: it explains why. Drop the
      sentence and its table row only when architecture or types make the mistake impossible, so there is nothing
      left to enforce.
- [ ] Add or update the rule's row in the project's **rule table**: one row per enforced rule, with the rule, its
      enforcer (file and layer) and its exceptions. The "Enforced by" lines stay where they are; the table collects
      them, so a rule with no enforcer stands out as a repeat. Keep it where the project keeps its rules: a
      "Rule table" section in `CLAUDE.md` or `AGENTS.md`, or a file next to it that the instruction file links to.
      If the project has none, suggest one and create it on the user's yes.

      | Rule | Enforced by (file, layer) | Exceptions |
      |---|---|---|
      | Never `git add -A` or `git add .` | `.claude/hooks/no-blanket-git-add.mjs`, hook (PreToolUse, Bash) | none |
      | Read configuration through `config.load()` | `scripts/ratchet.mjs --id no-env-read`, CI check (ratchet, baseline 14) | on the line, expiring |

Done when the check is registered, one live deny and one live pass were observed (or the CI failure, for a check),
the rule text points at it, and the rule table has its row.

## Do not

- Do not write the guard before you have near-misses. Without them you cannot tell a guard from a tripwire.
- Do not match on raw substrings of the whole command when the rule is about a program's arguments.
- Do not let a guard grant permission (`permissionDecision: "allow"`); it bypasses the user's own permission rules.
- Do not make a `Stop` hook that ignores `stop_hook_active`; it can keep the agent working forever.
- Do not add network calls, package dependencies, or slow processes to a hook that runs on every tool call.
- Do not report "enforced" on the strength of green tests alone. The live test and the mutation are the evidence.
- Do not put a rule about the code only in a Claude Code hook. Humans and CI never meet it there.
- Do not accept an exception without a reason, an expiry date and a human's approval, and do not let an agent
  approve its own.
- Do not delete the written rule while an enforcer exists; drop it only when the mistake can no longer happen.

## Report

```
Rule:        <precise one-sentence rule>   (from <file:line>)
Layer:       <architecture | types | lint or CI check | test | hook | prose>
             Higher layers: <why each layer above did not work, one line each>
Mechanism:   <hook event + matcher | git hook | linter rule | CI check | test>, output <exit 2 | ask | context>
             Ratchet: <none | baseline n in <file>>   Why: <one line>
Files:       <guard path>, <test path>, <settings or config path>
Tests:       <n> DENY, <n> PASS, subprocess checks; all green
Mutation:    <what you broke> -> <n> tests red; restored, clean diff, green again
Past mistake: <sha>^: fails with "<message>" | no past mistake in history
Live check:  denied: <harmless command> | passed: <near-miss> | CI: <run that failed on the violation>
Rule text:   updated with "Enforced by: ..." at <file:line>; rule table row at <file:line>
Not covered: <variants the guard knowingly misses, and why; or "none known">
```
