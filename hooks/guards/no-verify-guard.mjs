#!/usr/bin/env node
// PreToolUse guard for Bash and PowerShell: deny skipping the repository's git hooks.
//
// Why: pre-commit and pre-push hooks are the checks a team agreed every change must pass (format, lint, secrets scan,
// tests). When a hook fails, the shortest path to "committed" is --no-verify, and agents take it, then report the
// commit as done. The hook failure was the useful signal. This guard makes the agent fix the cause instead.
//
// Denied:
//   - git commit with --no-verify or -n (alone or in a short group such as -an),
//   - git push / git merge / git am / git rebase with --no-verify,
//   - git -c core.hooksPath=... (pointing hooks somewhere else for one command),
//   - git commit --no-gpg-sign or -c commit.gpgsign=false (skipping required signing),
//   - setting HUSKY=0, SKIP=... (pre-commit), LEFTHOOK=0, or PRE_COMMIT_ALLOW_NO_CONFIG=1 in front of a git command.
//
// Allowed: everything else, including `git commit -m "mention --no-verify in a message"` (quotes are understood) and
// `git commit -mn` (the n is part of the message). `git commit -nm "msg"` is -n plus -m, and is denied.
//
// Option in .claude/pau-skills.json: { "no-verify-guard": { "allowSigningBypass": true } } stops it denying
// --no-gpg-sign, for projects that do not require signed commits.
//
// Denies with exit code 2 and the reason on stderr. Exits 0 on input it does not understand. No network, no processes.
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, hookOptions, projectDir, readStdin, parseInput } from '../lib/config.mjs';
import { commands, gitSubcommand, shortHas } from '../lib/shell.mjs';

export const NAME = 'no-verify-guard';

const HOOK_ENV = { HUSKY: (v) => v === '0' || v === 'false', LEFTHOOK: (v) => v === '0' || v === 'false', SKIP: (v) => v.length > 0, PRE_COMMIT_ALLOW_NO_CONFIG: (v) => v === '1' };

/** Short option groups of `git commit` that take a value: everything after one of these letters is that value. */
const COMMIT_VALUE_LETTERS = 'mFcCt';

const COMMIT_VALUE_LONG = new Set(['--message', '--file', '--author', '--date', '--template', '--reuse-message', '--reedit-message', '--fixup', '--squash', '--cleanup', '--trailer', '--pathspec-from-file']);

function commitHasN(args) {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') return false;
    if (COMMIT_VALUE_LONG.has(a)) { i++; continue; }
    if (!/^-[A-Za-z]+$/.test(a)) continue;
    const letters = a.slice(1);
    for (let k = 0; k < letters.length; k++) {
      if (letters[k] === 'n') return true;
      if (COMMIT_VALUE_LETTERS.includes(letters[k])) { if (k === letters.length - 1) i++; break; }
    }
  }
  return false;
}

/** Pure decision for a command line: the deny reason, or null. */
export function check(command, options = {}) {
  for (const { program, args, env } of commands(command)) {
    if (program !== 'git') continue;
    for (const [name, bad] of Object.entries(HOOK_ENV)) {
      if (name in env && bad(env[name])) return `${name}=${env[name]} turns the git hooks off`;
    }
    const { sub, rest, config } = gitSubcommand(args);
    if (config.some((c) => /^core\.hookspath=/i.test(c))) return 'git -c core.hooksPath points the hooks somewhere else for this command';
    if (!options.allowSigningBypass && config.some((c) => /^commit\.gpgsign=(false|0|no|off)$/i.test(c))) return 'git -c commit.gpgsign=false skips commit signing';
    if (['commit', 'push', 'merge', 'am', 'rebase', 'cherry-pick', 'revert'].includes(sub) && rest.includes('--no-verify')) return `git ${sub} --no-verify skips the hooks`;
    if (sub === 'commit' && commitHasN(rest)) return 'git commit -n is --no-verify and skips the hooks';
    if (sub === 'commit' && !options.allowSigningBypass && rest.includes('--no-gpg-sign')) return 'git commit --no-gpg-sign skips commit signing';
  }
  return null;
}

export const reason = (why) =>
  `[no-verify-guard] Blocked: ${why}. A failing hook is the check doing its job. Run the hook's command, fix what it ` +
  'reports, and commit again. If the hook itself is broken, tell the user what fails and let them decide.';

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  const input = parseInput(await readStdin());
  const command = input && (input.tool_name === 'Bash' || input.tool_name === 'PowerShell') ? input.tool_input?.command : null;
  if (typeof command === 'string') {
    const config = loadConfig({ project: projectDir(input) });
    if (hookEnabled(NAME, config)) {
      const why = check(command, hookOptions(NAME, config));
      if (why) { process.stderr.write(reason(why) + '\n'); process.exit(2); }
    }
  }
  process.exit(0);
}
