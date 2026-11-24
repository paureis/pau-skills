// The thresholds of friction.mjs and the one way it prints text: every string is redacted first (mine-redact.mjs), the
// encoded home folder is shown as ~, and only then is it made one line and cut.
import { homedir } from 'node:os';
import { realpathSync } from 'node:fs';
import { redact, oneLine, cut } from './mine-redact.mjs';
import { encodeProjectPath } from './mine-transcripts.mjs';

export const READ_REPEAT_MIN = 3; // the same file and range read this many times in one transcript
export const SHELL_REPEAT_MIN = 3; // the same shell command run this many times with no edit between
export const POINTERS_PER_SIGNAL = 3; // pointers printed under each signal
export const BIG_RESULT_CHARS = 20000; // a tool result over this many characters is costly
export const DEFAULT_LAST = 30; // sessions read without --last
export const TARGET_CHARS = 80;
export const FAILURE_CHARS = 120;

// The tools whose target is printed: the input field named in targetOf (skill-eval-core.mjs) is a path, a command, a
// pattern, a URL or a query. Any other tool's input can hold a whole message or report, so only its name is printed.
export const TARGETED = new Set(['Read', 'Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Grep', 'Glob', 'WebFetch', 'WebSearch']);

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const realOrSelf = (p) => { try { return realpathSync(p); } catch { return p; } };

/** The home folder in the dash form of a project folder name ("-home-ana-src" or this machine's own) shown as ~. */
export function hideEncodedHome(text, home = homedir()) {
  let out = String(text);
  for (const h of new Set([home, realOrSelf(home)])) {
    const enc = encodeProjectPath(h);
    if (enc.length > 1) out = out.replace(new RegExp(`(?<![A-Za-z0-9])${escapeRe(enc)}(?![A-Za-z0-9])`, 'g'), '~');
  }
  return out.replace(/(?<![A-Za-z0-9])-(home|Users)-[A-Za-z0-9]+(?![A-Za-z0-9])/g, '~');
}

/** Any string about to be printed: redacted, the encoded home hidden, then one line, cut to max. */
export const show = (text, max = TARGET_CHARS) => cut(oneLine(hideEncodedHome(redact(String(text ?? '')))), max);

export const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
