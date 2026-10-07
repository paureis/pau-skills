#!/usr/bin/env node
// Template: a PreToolUse guard for shell commands, from the rule-to-hook skill. Copy it, rename it, then replace
// RULE, RULE_ID and isViolation() with your own rule. Node.js 20+, standard library only, no dependencies.
//
// The example rule it ships with: "Stage files by name. Never `git add .`, `git add -A`, `git add --all` or
// `git add :/`." (Blanket staging is how build output, local config and secrets end up in commits.)
//   Denied: git add .   git add -A   git add --all   git add :/   git add *   git -C sub add .   FOO=1 git add -A
//           bash -c "git add ."   git add --all --dry-run (denied on purpose: it makes a harmless live probe)
//   Allowed: git add src/app.ts   git add ./src   git add -p   git add .gitignore   git status
//            echo "git add ."   git commit -m "do not git add ."
//
// Contract (see https://code.claude.com/docs/en/hooks for the current reference):
//   stdin:  JSON with tool_name, tool_input.command, cwd, hook_event_name, transcript_path, session_id.
//   block:  MODE 'deny'  -> exit 2, reason on stderr (Claude sees the reason and the command does not run).
//           MODE 'ask'   -> exit 0, JSON hookSpecificOutput.permissionDecision "ask" on stdout (the user decides).
//   allow:  exit 0, no output. The normal permission flow continues; this script never grants permission.
//   Anything it does not understand (not JSON, another tool, no command): exit 0. It fails open on purpose, because
//   a guard that crashes closed blocks every command in the session.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const RULE_ID = 'no-blanket-git-add';
export const RULE = 'Stage files by name; blanket staging (git add . / -A / --all / :/) pulls in files nobody reviewed.';
export const MODE = 'deny'; // 'deny' or 'ask'

const SHELLS = new Set(['bash', 'sh', 'zsh', 'dash', 'ksh']);

/**
 * Split a command line into simple commands, each an array of words, honouring single quotes, double quotes and
 * backslashes, and breaking on ; & | && || newlines and parentheses outside quotes. It is a small approximation of
 * shell parsing, good enough to tell `echo "git add ."` (one quoted word) from `git add .` (a real invocation).
 */
export function splitCommands(line) {
  const out = [];
  let words = [];
  let word = '';
  let inWord = false;
  let quote = null;
  const endWord = () => { if (inWord) words.push(word); word = ''; inWord = false; };
  const endCommand = () => { endWord(); if (words.length) out.push(words); words = []; };
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quote === "'") { if (c === "'") quote = null; else word += c; continue; }
    if (quote === '"') {
      if (c === '"') quote = null;
      else if (c === '\\' && i + 1 < line.length && '"\\$`'.includes(line[i + 1])) word += line[++i];
      else word += c;
      continue;
    }
    if (c === "'" || c === '"') { quote = c; inWord = true; continue; }
    if (c === '\\' && i + 1 < line.length) { word += line[++i]; inWord = true; continue; }
    if (c === ' ' || c === '\t') { endWord(); continue; }
    if (';&|\n()'.includes(c)) { endCommand(); continue; }
    word += c;
    inWord = true;
  }
  endCommand();
  return out;
}

/** Strip leading VAR=value assignments; return the program and its arguments. */
function programOf(words) {
  let i = 0;
  while (i < words.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(words[i])) i++;
  return { program: (words[i] || '').replace(/^.*[\\/]/, ''), args: words.slice(i + 1) };
}

/** The example rule. Replace this function with your own; keep it pure (no I/O) so the tests can call it directly. */
function isViolation(program, args) {
  if (program !== 'git') return null;
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) i += ['-C', '-c', '--git-dir', '--work-tree'].includes(args[i]) ? 2 : 1;
  if (args[i] !== 'add') return null;
  const rest = args.slice(i + 1);
  const blanket = rest.find((a) => ['.', '-A', '--all', ':/', '*'].includes(a));
  return blanket ? `git add ${blanket} stages everything in the tree` : null;
}

/** Pure decision for one command line: the reason it breaks the rule, or null when it is allowed. */
export function check(command, depth = 0) {
  if (typeof command !== 'string' || depth > 3) return null;
  for (const words of splitCommands(command)) {
    const { program, args } = programOf(words);
    if (SHELLS.has(program)) {
      const c = args.indexOf('-c');
      if (c !== -1 && typeof args[c + 1] === 'string') {
        const inner = check(args[c + 1], depth + 1);
        if (inner) return inner;
      }
      continue;
    }
    const why = isViolation(program, args);
    if (why) return why;
  }
  return null;
}

/** Pure mapping from hook input to what the process should do: { code, stdout, stderr }. */
export function decide(input, mode = MODE) {
  const pass = { code: 0, stdout: '', stderr: '' };
  if (!input || typeof input !== 'object' || input.tool_name !== 'Bash') return pass;
  const why = check(input.tool_input?.command);
  if (!why) return pass;
  const reason = `[${RULE_ID}] Blocked: ${why}. Rule: ${RULE} Stage the files you changed by name instead.`;
  if (mode === 'ask') {
    const out = { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: reason } };
    return { code: 0, stdout: JSON.stringify(out) + '\n', stderr: '' };
  }
  return { code: 2, stdout: '', stderr: reason + '\n' };
}

function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (data += d));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  let input = null;
  try { input = JSON.parse(await readStdin()); } catch { input = null; }
  let result = { code: 0, stdout: '', stderr: '' };
  try { result = decide(input); } catch { /* fail open: a bug in the guard must not block the session */ }
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.code);
}
