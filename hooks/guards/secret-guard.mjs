#!/usr/bin/env node
// PreToolUse guard for Write, Edit, MultiEdit and NotebookEdit: deny writing a credential into a file.
//
// Why: an agent that is handed a key to "get it working" pastes it where it is used, in source, a config file, a test
// or a README. From there it reaches a commit, and a pushed key has to be rotated even if the commit is reverted. The
// rule "never hard-code secrets" is in every style guide and still gets broken, because the agent is optimising for a
// working run. This guard checks the text being written, not the file afterwards.
//
// What counts: well-known token formats (cloud keys, provider API keys, private key blocks, tokens embedded in URLs),
// plus an assignment to a secret-sounding name (password, api_key, token, secret...) of a long literal that looks
// random. Placeholders such as "changeme", "your-api-key", "xxxx", "${VAR}" or "<token>" never count.
//
// Where it does not look: files where secrets belong. Any basename starting with ".env" is allowed except the shared
// templates (.env.example, .env.sample, .env.template, .env.dist). Add your own with "allowPaths" (globs, matched
// against the path relative to the project root):
//
//   { "secret-guard": { "allowPaths": ["tests/fixtures/**", "*.pem.test"] } }
//
// Denies with exit code 2 and the reason on stderr; the reason shows only the first characters of what it found.
// Exits 0 on input it does not understand. No network, no processes.
import { realpathSync } from 'node:fs';
import { basename, relative, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, hookOptions, projectDir, readStdin, parseInput } from '../lib/config.mjs';

export const NAME = 'secret-guard';

// [label, regex]. Every regex has one capture group or none; the whole match is what gets reported.
export const PATTERNS = [
  ['private key block', /-----BEGIN (?:RSA |EC |DSA |OPENSSH |PGP |ENCRYPTED )?PRIVATE KEY(?: BLOCK)?-----/],
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['GitLab token', /\bglpat-[A-Za-z0-9_-]{20,}\b/],
  ['Slack token', /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/],
  ['Slack webhook', /https:\/\/hooks\.slack\.com\/services\/T[A-Z0-9]+\/B[A-Z0-9]+\/[A-Za-z0-9]{20,}/],
  ['Stripe live key', /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['Anthropic API key', /\bsk-ant-[A-Za-z0-9_-]{20,}/],
  ['OpenAI API key', /\bsk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{20,}T3BlbkFJ[A-Za-z0-9_-]{20,}/],
  ['OpenAI API key', /\bsk-proj-[A-Za-z0-9_-]{40,}/],
  ['npm token', /\bnpm_[A-Za-z0-9]{36}\b/],
  ['PyPI token', /\bpypi-AgEIcHlwaS5vcmc[A-Za-z0-9_-]{50,}/],
  ['SendGrid key', /\bSG\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{43}\b/],
  ['Twilio key', /\bSK[0-9a-f]{32}\b/],
  ['password in a URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s:/@'"]+:([^\s:/@'"$<{]{6,})@[^\s'"]+/i],
];

const SECRET_NAME = /(?:pass(?:word|wd)?|secret|api[_-]?key|apikey|access[_-]?key|auth[_-]?token|token|private[_-]?key|client[_-]?secret|credentials?)/i;
// name = "value", name: 'value', NAME=value, "name": "value"
const ASSIGNMENT = /["']?([A-Za-z_][A-Za-z0-9_.-]*)["']?\s*(?::=|=>|[:=])\s*["'`]?([^\s"'`,;)}\]]{16,})["'`]?/g;
const PLACEHOLDER = /(?:example|sample|placeholder|changeme|change[_-]me|your[_-]|my[_-]|dummy|fake|test|xxxx|\*\*\*\*|\.\.\.|<|>|\$\{|\$\(|\{\{|%\(|process\.env|os\.environ|getenv|env\[|ENV\[|secrets\.)/i;

/** Shannon entropy in bits per character. */
export function entropy(s) {
  const counts = {};
  for (const ch of s) counts[ch] = (counts[ch] || 0) + 1;
  let h = 0;
  for (const n of Object.values(counts)) { const p = n / s.length; h -= p * Math.log2(p); }
  return h;
}

/** The first credential found in text, as { label, match }, or null. */
export function findSecret(text) {
  if (typeof text !== 'string' || text.length === 0) return null;
  for (const [label, re] of PATTERNS) {
    const m = re.exec(text);
    if (m && !PLACEHOLDER.test(m[1] || m[0])) return { label, match: m[0] };
  }
  for (const m of text.matchAll(ASSIGNMENT)) {
    const [, name, value] = m;
    if (!SECRET_NAME.test(name) || PLACEHOLDER.test(value)) continue;
    if (/^[a-z]+(?:[._-][a-z]+)*$/i.test(value)) continue; // words: a variable or a setting name, not a secret
    if (/[A-Za-z]/.test(value) && /\d/.test(value) && entropy(value) >= 3.5) return { label: `literal assigned to "${name}"`, match: value };
  }
  return null;
}

/** Minimal glob: ** any path, * any run without a slash, ? one character. */
export function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else if (c === '?') re += '[^/]';
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('^' + re + '$');
}

const ENV_TEMPLATE = /^\.env\.(?:example|sample|template|dist|defaults)$/i;

/** True when the file is a place secrets are meant to live. */
export function allowedPath(filePath, root, allowPaths = []) {
  if (typeof filePath !== 'string' || !filePath) return false;
  const base = basename(filePath);
  if (base.toLowerCase().startsWith('.env') && !ENV_TEMPLATE.test(base)) return true;
  const rel = (isAbsolute(filePath) ? relative(root, filePath) : filePath).replace(/\\/g, '/');
  return allowPaths.some((g) => globToRegExp(g).test(rel) || globToRegExp(g).test(base));
}

/** The text a tool call would write, or null for a tool this guard does not check. */
export function writtenText(toolName, input) {
  if (!input || typeof input !== 'object') return null;
  if (toolName === 'Write') return typeof input.content === 'string' ? input.content : null;
  if (toolName === 'Edit') return typeof input.new_string === 'string' ? input.new_string : null;
  if (toolName === 'MultiEdit') return Array.isArray(input.edits) ? input.edits.map((e) => (e && e.new_string) || '').join('\n') : null;
  if (toolName === 'NotebookEdit') return typeof input.new_source === 'string' ? input.new_source : null;
  return null;
}

export const redact = (s) => (s.length <= 8 ? s.slice(0, 2) : s.slice(0, 6)) + '...';

/** Pure decision: the deny reason, or null to allow. */
export function decide(input, { root = process.cwd(), options = {} } = {}) {
  if (!input || typeof input !== 'object') return null;
  const text = writtenText(input.tool_name, input.tool_input);
  if (text === null) return null;
  const filePath = input.tool_input.file_path || input.tool_input.notebook_path || '';
  if (allowedPath(filePath, root, Array.isArray(options.allowPaths) ? options.allowPaths : [])) return null;
  // An Edit that keeps a secret already in the file is not a new leak: only flag what the edit adds.
  if (input.tool_name === 'Edit' && typeof input.tool_input.old_string === 'string') {
    const before = findSecret(input.tool_input.old_string);
    const after = findSecret(text);
    if (!after || (before && before.match === after.match)) return null;
  }
  const hit = findSecret(text);
  if (!hit) return null;
  return (
    `[secret-guard] Blocked writing what looks like a ${hit.label} (${redact(hit.match)}) into ${filePath || 'a file'}. ` +
    'Read it from the environment or a secrets manager instead, and put the real value in an ignored .env file. ' +
    'If the value is a fake for a test, make it obviously fake (for example include "example" or "test"), or add ' +
    'the path to "secret-guard": { "allowPaths": [...] } in .claude/pau-skills.json.'
  );
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  const input = parseInput(await readStdin());
  if (input) {
    const root = projectDir(input);
    const config = loadConfig({ project: root });
    if (hookEnabled(NAME, config)) {
      const reason = decide(input, { root, options: hookOptions(NAME, config) });
      if (reason) { process.stderr.write(reason + '\n'); process.exit(2); }
    }
  }
  process.exit(0);
}
