#!/usr/bin/env node
// PreToolUse guard for Bash and PowerShell: deny every raw `gh pr merge`, and `gh pr close` with branch deletion.
//
// Why: with stacked pull requests (B is based on A's branch, not on the trunk), deleting A's branch when A merges makes
// GitHub close B, because its base no longer exists. `gh pr merge -d` does exactly that, and it closed two stacked PRs
// in one project before this guard existed. Merging goes through safe-merge.mjs instead, which merges without deleting
// and deletes the head branch afterwards only if no open PR uses it as its base. That script calls gh through
// execFile, so it never passes through this hook.
//
// Reads the hook JSON on stdin (tool_name Bash or PowerShell, tool_input.command). Denies with exit code 2 and the
// reason on stderr. On input it does not understand it exits 0: a guard that failed closed would leave every session
// without a shell. No network, no processes: it runs before every shell command.
//
// Invariant: it may deny too much, never too little. No shell tokenizer, no quoting or segments: a command that
// contains `pr merge` is denied whole, with or without deletion; with `pr close`, it is denied if a branch deletion
// appears anywhere after it.

import { realpathSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, projectDir } from './config.mjs';

// Flags with a value allowed between `pr` and the subcommand (gh pr -R owner/repo merge).
const between = String.raw`(?:-\S+\s+(?:[^-\s]\S*\s+)?)*`;
const PR_MERGE = new RegExp(String.raw`\bpr\s+${between}merge\b`, 'i');
const PR_CLOSE = new RegExp(String.raw`\bpr\s+${between}close\b`, 'i');
// --delete-branch (with or without =value), or a short flag group containing d (-d, -cd, -dc).
const DELETION = /(?<![\w-])(?:--delete-branch(?![\w-])|-[A-Za-z]*d[A-Za-z]*(?![\w-]))/;

/** True if the command would run gh pr merge, or gh pr close with branch deletion (or looks like it). */
export function denies(command) {
  // Line continuations: backslash (bash) or backtick (PowerShell) before the newline.
  const text = command.replace(/\\\r?\n/g, ' ').replace(/`\r?\n/g, ' ');
  if (PR_MERGE.test(text)) return true;
  const close = PR_CLOSE.exec(text);
  return close !== null && DELETION.test(text.slice(close.index + close[0].length));
}

export function reason(safeMergePath) {
  return (
    'Stacked-PR rule: no gh pr merge is run by hand. gh pr merge with branch deletion (-d, --delete-branch) closes ' +
    'every open PR stacked on the deleted branch, and gh pr close with deletion does the same. Merge with: node "' +
    safeMergePath + '" <number> (--dry-run only reads; it deletes the branch only if no open PR uses it as its base). ' +
    'The guard denies too much on purpose: if the command only mentioned it, remove that text.'
  );
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
  const input = await readStdin();
  let command = null;
  try {
    const json = JSON.parse(input);
    if (json && (json.tool_name === 'Bash' || json.tool_name === 'PowerShell') && typeof json.tool_input?.command === 'string') {
      command = json.tool_input.command;
    }
  } catch {
    command = null;
  }
  if (command !== null && denies(command) && hookEnabled('merge-guard', loadConfig({ project: projectDir(JSON.parse(input)) }))) {
    process.stderr.write(reason(join(dirname(fileURLToPath(import.meta.url)), 'safe-merge.mjs').replace(/\\/g, '/')) + '\n');
    process.exit(2);
  }
  process.exit(0);
}
