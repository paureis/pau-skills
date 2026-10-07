#!/usr/bin/env node
// PreToolUse guard for Bash: refuse an inline-interpreter call whose payload contains a backtick.
//
// WHY THIS EXISTS AS CODE AND NOT AS A SENTENCE IN CLAUDE.md.
// The rule "never put a backtick inside a double-quoted bash string handed to node -e / python -c" was written down,
// at length, with five documented instances. It was broken a SIXTH time while writing a retrospective ABOUT following
// rules. Bash executed the backticked words ("ORACLE-ALL: command not found", ...) and spliced their empty output into
// the payload.
//
// That time it died on a syntax error and corrupted nothing. Four of the times before, it did not: it printed a
// success line and left a file quietly wrong. The rule about rules says the third time you break one you have already
// written down, stop rewriting it and mechanize it. This is the mechanization.
//
// SCOPE, kept narrow on purpose so it does not cry wolf:
//   - only Bash commands invoking an inline interpreter (node -e, python -c, perl -e, ruby -e, php -r, deno eval),
//     NOT heredocs, NOT script files, NOT ordinary backtick use in a shell command, NOT --eval of a file path.
//   - only when a BACKTICK appears after the -e/-c flag, outside single quotes.
// Anything else passes untouched. The fix is always the same and is stated in the message: write the script to a
// file and run the file.

import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, projectDir } from './config.mjs';

const INLINE = /(^|[\n;&|(){}]|&&|\|\||\$\()\s*(node|nodejs|python|python3|py|perl|ruby|php|deno)\s+(-e|--eval|-c|-r|eval)\s/;

/** The matched interpreter invocation (for example "node -e") if the command must be blocked, else null. */
export function findBacktickPayload(raw) {
  if (!raw || raw.indexOf('`') === -1) return null;

  // STEP 1: blank out SINGLE-quoted spans. Bash performs no substitution inside them, so node -e '...`x`...' is
  // genuinely safe (it is the documented form when you must inline). Blanking rather than deleting keeps offsets.
  // This also removes the false positive that caught this hook's own commit: a printf '...' whose PROSE mentioned
  // "node -e" and contained backticks, executing nothing.
  // A single quote INSIDE a double-quoted span is a literal character and protects nothing: node -e "...'`x`'..."
  // still runs x. That exact shape once slipped through, so the scan tracks both quote kinds.
  let cmd = '';
  let inSingle = false;
  let inDouble = false;
  let prev = '';
  for (const ch of raw) {
    if (ch === "'" && !inDouble) { inSingle = !inSingle; cmd += ch; prev = ch; continue; }
    if (ch === '"' && !inSingle && prev !== '\\') { inDouble = !inDouble; cmd += ch; prev = ch; continue; }
    cmd += inSingle && ch !== '\n' ? ' ' : ch;
    prev = ch;
  }
  if (cmd.indexOf('`') === -1) return null;

  // STEP 2: the interpreter must be INVOKED, i.e. sit at a command position: start of input, or after a shell
  // operator / newline / subshell open. Matching it anywhere let the words "node -e" inside an argument trigger it.
  const m = INLINE.exec(cmd);
  if (!m) return null;

  // STEP 3: only a backtick in the PAYLOAD counts, i.e. after the flag.
  const after = cmd.slice(m.index + m[0].length);
  if (after.indexOf('`') === -1) return null;
  return m[0].trim();
}

export function reasonFor(detected) {
  return [
    'BLOCKED: inline interpreter payload contains a backtick.',
    '',
    'Backticks inside a double-quoted bash string are COMMAND SUBSTITUTION. Bash will execute the',
    'backticked words and splice their output into your payload. Four of the six recorded instances',
    'corrupted a file while printing a success line and exiting 0.',
    '',
    'Fix: write the script (or the prose payload) to a file and run the file.',
    '  Write  ->  <scratchpad>/thing.mjs      then   node <scratchpad>/thing.mjs',
    '  Prose  ->  <scratchpad>/thing.md       then   read it from the script with readFileSync',
    '  Commit ->  git commit -F <file>        never  git commit -m "...`...`..."',
    '',
    'Then VERIFY THE WRITTEN CONTENT, not the exit code.',
    '',
    'Detected in: ' + detected,
  ].join('\n');
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (d) => (input += d));
  process.stdin.on('end', () => {
    let payload;
    try { payload = JSON.parse(input || '{}'); } catch { process.exit(0); } // never block on our own parse failure
    const tool = payload.tool_name || payload.toolName || '';
    if (!hookEnabled('inline-backtick-guard', loadConfig({ project: projectDir(payload) }))) process.exit(0);
    if (tool !== 'Bash') process.exit(0);
    const raw = (payload.tool_input && payload.tool_input.command) || '';
    const detected = typeof raw === 'string' ? findBacktickPayload(raw) : null;
    if (!detected) process.exit(0);
    // Exit 2 = block the call and feed the reason back to the model.
    process.stderr.write(reasonFor(detected) + '\n');
    process.exit(2);
  });
}
