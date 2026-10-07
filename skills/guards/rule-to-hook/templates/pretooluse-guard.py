#!/usr/bin/env python3
"""Template: a PreToolUse guard for shell commands, from the rule-to-hook skill (Python 3.8+, standard library only).

Same example rule and contract as pretooluse-guard.mjs: deny blanket staging (git add . / -A / --all / :/).
Copy it, then replace RULE, RULE_ID and is_violation() with your own rule.

  stdin:  JSON with tool_name, tool_input.command, cwd, hook_event_name, transcript_path, session_id.
  block:  exit 2 with the reason on stderr.
  allow:  exit 0, no output.
  Anything it does not understand: exit 0 (fail open).

Register it with "command": "python3 \"$CLAUDE_PROJECT_DIR/.claude/hooks/pretooluse-guard.py\"" (use "python" or
"py -3" where python3 is not on PATH, which is common on Windows). Test it with a table of DENY and PASS cases that
call check() directly, plus one subprocess run that feeds hook JSON on stdin, as guard.test.mjs does.
Current reference: https://code.claude.com/docs/en/hooks
"""
import json
import os
import shlex
import sys

RULE_ID = "no-blanket-git-add"
RULE = "Stage files by name; blanket staging (git add . / -A / --all / :/) pulls in files nobody reviewed."
SHELLS = {"bash", "sh", "zsh", "dash", "ksh"}
SEPARATORS = {";", "&", "|", "&&", "||", "(", ")", ";;", "|&"}


def split_commands(line):
    """Split a command line into simple commands (lists of words), honouring quotes. Raises ValueError on bad quoting."""
    lexer = shlex.shlex(line.replace("\n", ";"), posix=True, punctuation_chars=True)
    lexer.whitespace_split = True
    commands, words = [], []
    for token in lexer:
        if token in SEPARATORS or set(token) <= set(";&|()"):
            if words:
                commands.append(words)
            words = []
        else:
            words.append(token)
    if words:
        commands.append(words)
    return commands


def is_violation(program, args):
    """The example rule. Replace with your own and keep it pure (no I/O)."""
    if program != "git":
        return None
    i = 0
    while i < len(args) and args[i].startswith("-"):
        i += 2 if args[i] in ("-C", "-c", "--git-dir", "--work-tree") else 1
    if i >= len(args) or args[i] != "add":
        return None
    for a in args[i + 1:]:
        if a in (".", "-A", "--all", ":/", "*"):
            return "git add %s stages everything in the tree" % a
    return None


def check(command, depth=0):
    """Pure decision for one command line: the reason it breaks the rule, or None."""
    if not isinstance(command, str) or depth > 3:
        return None
    try:
        commands = split_commands(command)
    except ValueError:
        return None  # unbalanced quotes: not something this guard understands
    for words in commands:
        i = 0
        while i < len(words) and "=" in words[i] and words[i].split("=", 1)[0].isidentifier():
            i += 1
        if i >= len(words):
            continue
        program, args = os.path.basename(words[i]), words[i + 1:]
        if program in SHELLS and "-c" in args:
            j = args.index("-c")
            inner = check(args[j + 1], depth + 1) if j + 1 < len(args) else None
            if inner:
                return inner
            continue
        why = is_violation(program, args)
        if why:
            return why
    return None


def main():
    try:
        data = json.loads(sys.stdin.read())
        command = data.get("tool_input", {}).get("command") if data.get("tool_name") == "Bash" else None
        why = check(command)
    except Exception:
        return 0  # fail open
    if why:
        sys.stderr.write("[%s] Blocked: %s. Rule: %s Stage the files you changed by name instead.\n" % (RULE_ID, why, RULE))
        return 2
    return 0


if __name__ == "__main__":
    sys.exit(main())
