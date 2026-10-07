---
name: rule-to-hook
description: Turn a written rule that keeps getting broken (in CLAUDE.md, AGENTS.md, a style guide, or a correction the user keeps repeating) into an enforced mechanism, usually a Claude Code hook, otherwise a git hook, linter rule, CI check or test; pins the rule down with real violations and near-misses, picks the mechanism, writes a small tested guard, proves the test can fail, registers it and marks the rule as enforced. Use when the user says "this rule keeps getting broken", "I keep telling Claude not to", "make this a hook", "enforce this rule", "turn this into a guard", "block this command", "stop the agent from doing X", "why does it ignore CLAUDE.md", or when the same correction has come up three times.
argument-hint: "[the rule, or where it is written, e.g. 'CLAUDE.md: never git add -A']"
---

# Rule to hook

A written rule that gets broken three times stops being a rule and becomes a script, a hook or a gate. This skill
does that conversion in a fixed order, so the result blocks the real violation, leaves the near-misses alone, and has
a test that has been seen to fail.

The rule, or where to find it: $ARGUMENTS

Bundled files, open them when you reach their step:
- `${CLAUDE_PLUGIN_ROOT}/skills/rule-to-hook/HOOK-EVENTS.md`: every hook event, its input, and how it blocks or informs
- `${CLAUDE_PLUGIN_ROOT}/skills/rule-to-hook/templates/pretooluse-guard.mjs`: Bash-command guard skeleton (Node.js)
- `${CLAUDE_PLUGIN_ROOT}/skills/rule-to-hook/templates/pretooluse-guard.py`: the same skeleton in Python
- `${CLAUDE_PLUGIN_ROOT}/skills/rule-to-hook/templates/guard.test.mjs`: test skeleton with DENY and PASS tables
- `${CLAUDE_PLUGIN_ROOT}/skills/rule-to-hook/templates/settings-snippet.json`: the registration block

Worked examples to read before writing your own: the guards in `${CLAUDE_PLUGIN_ROOT}/scripts/*.mjs` (no-verify,
merge, destructive, secret and inline-backtick guards), with their tests in the `tests/` folder of the pau-skills
repository. Each has a pure decision function, a fail-open main block, and a table of commands to deny and to pass.

## 1. Pin the rule down

A vague rule produces a guard that blocks the wrong things. Before writing code, write the rule as one sentence that
a script could check, and collect evidence.

- [ ] Find the rule's current text and location (CLAUDE.md, AGENTS.md, CONTRIBUTING, a style guide, memory files).
      Quote it exactly.
- [ ] Collect **violations**: real commands, edits or replies that broke it. Search the session transcript, past
      transcripts if the user can point you to them, `git log -p`, review comments, and the repository itself
      (`grep -rn` for the forbidden pattern). Ask the user for the cases they remember.
- [ ] Collect **near-misses**: things that look like the violation and must stay allowed. A quoted mention in a
      commit message, a flag with the same letter on another program, the safe form of the same command. These are
      what turn a guard from useful into something people switch off.
- [ ] Write the precise rule: what is denied, what is allowed, and why (one line). Confirm it with the user if any
      example was ambiguous.

Done when you have the precise rule, at least three violations and at least three near-misses, all concrete.

## 2. Decide whether and how to mechanize it

Some rules cannot be checked by a script ("write clear names", "think before editing"). Say so, and leave those as
text. For the rest, pick the cheapest mechanism that sees the violation **before** it does damage.

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

Done when you have named the mechanism, the event and matcher (for a hook), the output style, and the reason.

## 3. Write the guard and its test table

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

A test you have never seen fail proves nothing. Break the decision function on purpose and watch the suite go red.

1. **Commit** the guard and its test first (or, if the user does not want a commit yet, copy the guard to a scratch
   file to restore from). Restoring with `git checkout --` erases uncommitted work, and does nothing on an untracked
   file, so a mutation applied to an uncommitted file can silently stick.
2. **Apply one mutation and assert it applied**, by reading the content, not by trusting the edit command: for
   example change `return why` to `return null` in `check()`, then `grep -n "return null" <guard>` to see it.
3. **Run the tests and expect red.** Every DENY case should fail. If the suite stays green, the test does not exercise
   the decision function; fix the test, not the mutation.
4. **Restore and assert clean**: `git checkout -- <guard>` (or copy the scratch file back), then
   `git diff --exit-code -- <guard>` must print nothing, and the tests must be green again.

If the `verification` plugin from this marketplace is installed, its `mutate.sh` automates these steps. Run it from
that plugin's own install folder; do not reach for it through `${CLAUDE_PLUGIN_ROOT}/..`, because plugins are
installed separately and that path is not reliable.

Done when you have seen the suite fail on the mutation and pass again after the restore.

## 5. Register it, test it live, update the rule

- [ ] Register it. For one project, merge `templates/settings-snippet.json` into `.claude/settings.json` (edit the
      file in place, keep its other keys, and use `$CLAUDE_PROJECT_DIR` in the command so it works from any
      subdirectory). For a plugin, add it to the plugin's `hooks/hooks.json` with `${CLAUDE_PLUGIN_ROOT}`. For a git
      hook, linter or CI check, wire it the way the project already does (find the existing config first).
- [ ] Test it live once, in a new session or after reviewing it in `/hooks`: run a **harmless** command that matches
      the rule (the template's example denies `git add --all --dry-run`, which changes nothing even if it got
      through) and confirm the block and the reason. Then run one near-miss and confirm it passes. If the live run
      disagrees with the tests, the registration is wrong (matcher, path, interpreter name), not the tests.
- [ ] Update the original rule text. Do not delete it: the sentence still explains why. Add a line such as
      `Enforced by: .claude/hooks/no-blanket-git-add.mjs (PreToolUse, Bash)`, so the next reader knows the rule is
      mechanical and where to change it.

Done when the hook is registered, one live deny and one live pass were observed, and the rule text points at it.

## Do not

- Do not write the guard before you have near-misses. Without them you cannot tell a guard from a tripwire.
- Do not match on raw substrings of the whole command when the rule is about a program's arguments.
- Do not let a guard grant permission (`permissionDecision: "allow"`); it bypasses the user's own permission rules.
- Do not make a `Stop` hook that ignores `stop_hook_active`; it can keep the agent working forever.
- Do not add network calls, package dependencies, or slow processes to a hook that runs on every tool call.
- Do not report "enforced" on the strength of green tests alone. The live test and the mutation are the evidence.
- Do not delete the written rule once it is enforced.

## Report

```
Rule:        <precise one-sentence rule>   (from <file:line>)
Mechanism:   <hook event + matcher | git hook | linter rule | CI check | test>, output <exit 2 | ask | context>
             Why: <one line>
Files:       <guard path>, <test path>, <settings or config path>
Tests:       <n> DENY, <n> PASS, subprocess checks; all green
Mutation:    <what you broke> -> <n> tests red; restored, clean diff, green again
Live check:  denied: <harmless command> | passed: <near-miss>
Rule text:   updated with "Enforced by: ..." at <file:line>
Not covered: <variants the guard knowingly misses, and why; or "none known">
```
