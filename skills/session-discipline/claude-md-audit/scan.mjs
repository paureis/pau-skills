#!/usr/bin/env node
/**
 * Instruction-file scanner for the claude-md-audit skill. Node 20+ standard library only.
 *
 *   node scan.mjs [root]                 text report for the project at [root] (default: the current directory)
 *   node scan.mjs [root] --json          the same data as JSON
 *   node scan.mjs --threshold 0.5        near-duplicate floor (bigram overlap coefficient, default 0.6)
 *   node scan.mjs --min-bigrams 4        ignore units with fewer content bigrams than this (default 4)
 *   node scan.mjs --max-depth 6          how deep to look for nested instruction files (default 6)
 *   node scan.mjs --home <dir>           read user-level files from <dir>/.claude instead of the real home (tests)
 *   node scan.mjs --no-ancestors         skip CLAUDE.md files in directories above the root
 *   node scan.mjs --global-refs          also check path references in user-level files (off: they cite many projects)
 *
 * What it does mechanically, so the agent does not have to do it by eye:
 *   - finds the instruction files an agent reads (Claude Code, plus AGENTS.md, Cursor, Copilot, Windsurf, Cline,
 *     Gemini), follows @imports one level deep, and reports bytes, lines and estimated tokens (~4 characters each);
 *   - splits every file into rule units (bullets, paragraphs, table rows) and lists near-duplicate pairs, within
 *     and across files, scored by the overlap coefficient of content-word bigrams;
 *   - lists backticked or path-like references, @imports and npm/make/just commands that do not resolve;
 *   - lists lines that look like secrets or personal data (previews are masked);
 *   - lists vague-rule candidates and heavily emphasised rules (a common sign of a rule that keeps being broken).
 * Judgment (contradictions, relevance, what is missing) stays with the agent. Exit code is 0 unless usage is wrong.
 */
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from 'node:fs';
import { join, dirname, resolve, relative, sep, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------------------------------------------
// Size

/** Rough token estimate: about four characters per token for English prose and code. */
export const estimateTokens = (text) => Math.ceil(text.length / 4);

export function fileStats(text) {
  const lines = text === '' ? 0 : text.split(/\r?\n/).length - (/\r?\n$/.test(text) ? 1 : 0);
  return { bytes: Buffer.byteLength(text, 'utf8'), lines, tokens: estimateTokens(text) };
}

/** Sections by heading with their sizes, so the agent can see which blocks cost the most every session. */
export function sectionsOf(text) {
  const out = [];
  let cur = { heading: '(before first heading)', line: 1, chars: 0 };
  let inFence = false;
  text.split(/\r?\n/).forEach((line, i) => {
    if (/^\s*(```|~~~)/.test(line)) inFence = !inFence;
    const h = !inFence && /^#{1,6}\s+(.*)/.exec(line);
    if (h) { if (cur.chars) out.push(cur); cur = { heading: h[1].trim(), line: i + 1, chars: 0 }; }
    cur.chars += line.length + 1;
  });
  if (cur.chars) out.push(cur);
  return out.map((s) => ({ heading: s.heading, line: s.line, tokens: Math.ceil(s.chars / 4) }));
}

// ---------------------------------------------------------------------------------------------------------------
// Rule units and overlap

const STOP = new Set(('the a an and or of to in on for with is are was were be been it its this that these those as at by ' +
  'from into not no if then than so we you i he she they our your their do does did done have has had will would can ' +
  'could should may might must never always every any some one also only just very more most such which who what when ' +
  'where how why here there use using make sure').split(' '));

/** Content words: lower case, punctuation dropped, stopwords dropped. Code spans are kept: `npm test` and
 *  `cargo test` must not read as the same rule. */
export const tokenize = (s) => s.toLowerCase().replace(/[^a-z0-9_]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w));

export function bigrams(s) {
  const t = tokenize(s); const out = new Set();
  for (let i = 0; i + 1 < t.length; i++) out.add(t[i] + ' ' + t[i + 1]);
  return out;
}

/** Overlap coefficient: |A and B| / min(|A|, |B|). A short rule restated inside a long one scores high. */
export function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0; for (const x of small) if (big.has(x)) inter++;
  return inter / small.size;
}

const FENCE = /^\s*(```|~~~)/;
const HEADING = /^#{1,6}\s+(.*)/;
const BULLET = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)/;

/** Strip YAML frontmatter, keeping line numbers stable (replaced by blank lines). */
export function stripFrontmatter(text) {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text);
  return m ? m[0].replace(/[^\n]/g, '') + text.slice(m[0].length) : text;
}

/** Split an instruction file into rule units: each bullet (with its indented continuation lines), each paragraph
 *  and each table row. Code blocks and headings are not units; the heading becomes the unit's context. */
export function splitUnits(text) {
  const units = [];
  let heading = '';
  let cur = null; // { line, heading, text, indent, kind }
  let inFence = false;
  const flush = () => { if (cur) { cur.text = cur.text.trim(); if (cur.text) units.push({ line: cur.line, heading: cur.heading, kind: cur.kind, text: cur.text }); } cur = null; };
  stripFrontmatter(text).split(/\r?\n/).forEach((line, i) => {
    if (FENCE.test(line)) { flush(); inFence = !inFence; return; }
    if (inFence) return;
    const h = HEADING.exec(line);
    if (h) { flush(); heading = h[1].trim(); return; }
    if (!line.trim()) { flush(); return; }
    if (/^\s*\|/.test(line)) {
      flush();
      if (!/^\s*\|[\s:|-]+\|?\s*$/.test(line)) units.push({ line: i + 1, heading, kind: 'row', text: line.trim() });
      return;
    }
    const b = BULLET.exec(line);
    if (b) { flush(); cur = { line: i + 1, heading, text: b[2], indent: b[1].length, kind: 'bullet' }; return; }
    if (cur && cur.kind === 'bullet' && /^\s/.test(line)) { cur.text += ' ' + line.trim(); return; }
    if (cur && cur.kind === 'paragraph') { cur.text += ' ' + line.trim(); return; }
    flush();
    cur = { line: i + 1, heading, text: line.trim(), indent: 0, kind: 'paragraph' };
  });
  flush();
  return units;
}

/** Near-duplicate pairs among units that carry { file, line, text }. */
export function findDuplicates(units, { threshold = 0.6, minBigrams = 4 } = {}) {
  const prepared = units.map((u) => ({ u, bg: bigrams(u.text), norm: tokenize(u.text).join(' ') })).filter((p) => p.bg.size >= minBigrams);
  const pairs = [];
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i]; const b = prepared[j];
      const score = overlap(a.bg, b.bg);
      if (score >= threshold) {
        pairs.push({ score: Math.round(score * 1000) / 1000, exact: a.norm === b.norm, sameFile: a.u.file === b.u.file, a: brief(a.u), b: brief(b.u) });
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}
const brief = (u) => ({ file: u.file, line: u.line, text: u.text.length > 160 ? u.text.slice(0, 157) + '...' : u.text });

// ---------------------------------------------------------------------------------------------------------------
// References: @imports, paths, commands

const KNOWN_EXT = new Set(('md mdx mdc txt rst adoc json jsonc json5 yaml yml toml ini cfg conf lock xml csv ' +
  'js mjs cjs jsx ts tsx mts cts vue svelte astro html css scss sass less ' +
  'py pyi ipynb rb erb go mod rs java kt kts scala groovy gradle swift m mm c h cc cpp cxx hpp hh cs fs fsx vb csproj sln ' +
  'php ex exs erl hs ml clj dart lua pl r jl zig nim ' +
  'sh bash zsh fish ps1 psm1 bat cmd sql prisma graphql gql proto tf tfvars hcl nix dockerfile tmpl').split(' '));
const KNOWN_NAMES = new Set(['Dockerfile', 'Makefile', 'GNUmakefile', 'Justfile', 'justfile', 'Gemfile', 'Rakefile', 'Procfile', 'Containerfile', 'Vagrantfile', 'Brewfile', 'Pipfile']);

/** Lines inside code fences, as a Set of 1-based line numbers. */
function fencedLines(lines) {
  const s = new Set(); let inFence = false;
  lines.forEach((l, i) => { if (FENCE.test(l)) { inFence = !inFence; s.add(i + 1); return; } if (inFence) s.add(i + 1); });
  return s;
}

const trimRef = (r) => r.replace(/[.,;:!?)\]'"]+$/, '');

/** @imports in Claude Code syntax: "@path" at line start or after whitespace, outside code spans and blocks.
 *  Only path-shaped targets count (a known extension or an explicit ./ ../ ~/ / prefix), so "@types/node" and
 *  "@someone" are not imports. */
export function extractImports(text) {
  const lines = text.split(/\r?\n/); const fenced = fencedLines(lines); const out = [];
  lines.forEach((raw, i) => {
    if (fenced.has(i + 1)) return;
    const line = raw.replace(/`[^`]*`/g, ' ');
    for (const m of line.matchAll(/(?:^|\s)@((?:~\/|\.{1,2}\/|\/)?[\w.\-/~]+)/g)) {
      const ref = trimRef(m[1]);
      const last = ref.split('/').pop();
      const ext = last.includes('.') ? last.split('.').pop().toLowerCase() : '';
      if (/^(~\/|\.{1,2}\/|\/)/.test(ref) || KNOWN_EXT.has(ext) || KNOWN_NAMES.has(last)) out.push({ line: i + 1, ref });
    }
  });
  return out;
}

const COMMANDS = [
  [/^(?:npm|pnpm|yarn|bun)\s+run\s+([\w:.@/-]+)/, 'script'],
  [/^npm\s+(test|start)\b/, 'script'],
  [/^make\s+(?:-\S+\s+)*([A-Za-z0-9_.-]+)/, 'make'],
  [/^just\s+([A-Za-z_][\w-]*)/, 'just'],
];

function commandRef(s) {
  for (const [re, kind] of COMMANDS) { const m = re.exec(s); if (m) return { kind, ref: m[1] }; }
  return null;
}

/** Classify a code-span or bare token as a path reference worth checking, or null. */
export function pathCandidate(s) {
  let p = trimRef(s.trim());
  if (!p || /\s/.test(p) || /:\/\//.test(p) || /^[-@#$%]/.test(p) || /[*?<>{}$|=,;"'`()]/.test(p)) return null;
  if (p.startsWith('/') ) return null; // routes (/api/users) and machine paths; neither is checkable here
  if (/^[A-Za-z]:[\\/]/.test(p)) return null;
  p = p.replace(/^\.\//, '');
  const last = p.replace(/\/$/, '').split('/').pop();
  const ext = last.includes('.') ? last.split('.').pop().toLowerCase() : '';
  const hasExt = (KNOWN_EXT.has(ext) && !/^\d+$/.test(last.split('.')[0])) || KNOWN_NAMES.has(last);
  if (p.includes('/')) {
    if (!p.split('/').filter(Boolean).every((seg) => /^[\w.@\-[\]~]+$/.test(seg))) return null;
    return { ref: p.replace(/\/$/, ''), strong: hasExt || p.startsWith('~/') || p.startsWith('../') };
  }
  if (hasExt && !last.startsWith('.')) return { ref: p, strong: true, bare: true };
  return null;
}

/** Every reference in a file: { line, kind: 'path'|'script'|'make'|'just', ref, strong? }. Code spans are checked
 *  for paths and commands; fenced blocks for commands only (shell examples and output are too noisy for paths);
 *  plain prose for slash paths with a known extension. */
export function extractReferences(text) {
  const lines = stripFrontmatter(text).split(/\r?\n/); const fenced = fencedLines(lines); const out = [];
  const seen = new Set();
  const push = (r) => { const k = r.kind + ':' + r.ref; if (!seen.has(k)) { seen.add(k); out.push(r); } };
  lines.forEach((line, i) => {
    const n = i + 1;
    if (fenced.has(n)) {
      const c = commandRef(line.trim().replace(/^\$\s+/, ''));
      if (c) push({ line: n, ...c });
      return;
    }
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      const span = m[1].trim();
      const c = commandRef(span);
      if (c) { push({ line: n, ...c }); continue; }
      const p = pathCandidate(span);
      if (p) push({ line: n, kind: 'path', ...p });
    }
    const prose = line.replace(/`[^`]*`/g, ' ').replace(/\b[\w+.-]+:\/\/\S+/g, ' ').replace(/\[[^\]]*\]\(([^)\s]+)\)/g, ' $1 ');
    for (const m of prose.matchAll(/(?:^|[\s(])((?:\.{1,2}\/)?[\w.@-]+\/[\w.@/-]*[\w-]\.[A-Za-z][\w]{0,9})(?=[\s),.;:!?]|$)/g)) {
      const p = pathCandidate(m[1]);
      if (p && p.strong) push({ line: n, kind: 'path', ...p });
    }
  });
  return out;
}

/** Targets declared in a Makefile or justfile (enough to catch a renamed or removed target). */
export function parseTargets(text, kind) {
  const out = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (kind === 'make') {
      const m = /^([A-Za-z0-9_.\-/ ]+?)\s*::?(?!=)/.exec(line);
      if (m && !line.startsWith('\t')) for (const t of m[1].split(/\s+/)) if (t && !t.startsWith('.')) out.add(t);
      const phony = /^\.PHONY\s*:\s*(.*)/.exec(line);
      if (phony) for (const t of phony[1].split(/\s+/)) if (t) out.add(t);
    } else {
      const m = /^@?([A-Za-z_][\w-]*)(?:\s+[^:=\n]*)?\s*:(?!=)/.exec(line);
      if (m) out.add(m[1]);
    }
  }
  return out;
}

const readMaybe = (f) => { try { return readFileSync(f, 'utf8'); } catch { return null; } };

/** Project tooling the command references are checked against, read from a directory. */
export function readTooling(dir) {
  let scripts = null;
  const pkg = readMaybe(join(dir, 'package.json'));
  if (pkg != null) { try { scripts = JSON.parse(pkg).scripts || {}; } catch { scripts = {}; } }
  const mk = ['Makefile', 'makefile', 'GNUmakefile'].map((f) => readMaybe(join(dir, f))).find((t) => t != null);
  const jf = ['justfile', 'Justfile', '.justfile'].map((f) => readMaybe(join(dir, f))).find((t) => t != null);
  return { scripts, make: mk == null ? null : parseTargets(mk, 'make'), just: jf == null ? null : parseTargets(jf, 'just') };
}

/** Which references do not resolve. A path resolves against the citing file's directory, then the project root
 *  (and the home directory for ~/). A bare file name (`audit.mjs`) also resolves if a file of that name exists
 *  anywhere in the project (`names`, from fileNames()), since prose often names a file without its folder. A weak path (a slash path with no file extension, which may be a branch,
 *  a package or a route) is reported only when its first segment exists, so `src/old-module` is caught but
 *  `origin/main` is not. Commands are checked against the nearest package.json, Makefile or justfile. */
export function checkReferences(refs, { fileDir, root, home, tooling = [], names = null, exists = existsSync }) {
  const missing = [];
  const bases = [...new Set([fileDir, root].filter(Boolean))];
  const tool = (key) => tooling.find((t) => t[key] != null)?.[key] ?? null;
  for (const r of refs) {
    if (r.kind === 'path') {
      if (r.ref.startsWith('~/')) { if (home && !exists(join(home, r.ref.slice(2)))) missing.push({ ...r, why: 'not found under the home directory' }); continue; }
      const found = bases.some((b) => exists(resolve(b, r.ref)));
      if (found) continue;
      if (r.bare && names && names.has(r.ref)) continue;
      if (!r.strong) {
        const first = r.ref.split('/')[0];
        if (!bases.some((b) => exists(resolve(b, first)))) continue;
      }
      missing.push({ ...r, why: 'no such file or directory' });
    } else if (r.kind === 'script') {
      const s = tool('scripts');
      if (s == null) missing.push({ ...r, why: 'no package.json found' });
      else if (!(r.ref in s)) missing.push({ ...r, why: 'no such script in package.json' });
    } else if (r.kind === 'make' || r.kind === 'just') {
      const t = tool(r.kind);
      if (t == null) missing.push({ ...r, why: r.kind === 'make' ? 'no Makefile found' : 'no justfile found' });
      else if (!t.has(r.ref)) missing.push({ ...r, why: `no such ${r.kind} target` });
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------------------------------------------
// Secrets and personal data

const PLACEHOLDER = /^(x+|\*+|\.+|<[^>]*>|\$\{?[A-Z_]+\}?|your[_-].*|changeme|example.*|placeholder|redacted|dummy|test|none|null|true|false|\.\.\.)$/i;
export const SECRET_PATTERNS = [
  ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['GitLab token', /\bglpat-[A-Za-z0-9_-]{20,}\b/],
  ['Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/],
  ['Stripe live key', /\b[sr]k_live_[A-Za-z0-9]{16,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['LLM provider key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}\b/],
  ['JSON web token', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ['credentials in URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:([^\s/@]{3,})@/i],
];
// The name may carry a prefix or suffix joined by "_" (DB_PASSWORD, SECRET_KEY), which \b alone would miss.
const ASSIGN = /(?:^|[^A-Za-z0-9])(?:[A-Za-z0-9]+_)*(password|passwd|pwd|secret|client[_-]?secret|token|auth[_-]?token|api[_-]?key|access[_-]?key|private[_-]?key)(?:_[A-Za-z0-9]+)*\s*[:=]\s*["']?([^\s"'`,;]{8,})/i;
const EMAIL = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g;
const SAFE_EMAIL_DOMAIN = /@(?:[\w-]+\.)*(example\.(com|org|net)|users\.noreply\.github\.com|noreply\.[\w.]+|anthropic\.com|localhost)$/i;
const PHONE = /(?:^|[^\w])(\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4})(?!\w)/;

/** Show enough to locate a value, never enough to use it. */
export const mask = (s) => (s.length <= 8 ? '*'.repeat(s.length) : s.slice(0, 4) + '*'.repeat(Math.min(12, s.length - 6)) + s.slice(-2));

export function findSecrets(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const n = i + 1;
    for (const [kind, re] of SECRET_PATTERNS) {
      const m = re.exec(line);
      if (m) { out.push({ line: n, kind, preview: mask(m[1] || m[0]) }); return; }
    }
    const a = ASSIGN.exec(line);
    if (a && !PLACEHOLDER.test(a[2]) && !/^\$|^process\.env|^os\.environ|^env\(|^\{\{/.test(a[2]) && /[0-9]/.test(a[2]) && /[A-Za-z]/.test(a[2])) {
      out.push({ line: n, kind: `assigned ${a[1].toLowerCase()}`, preview: mask(a[2]) });
      return;
    }
    for (const m of line.matchAll(EMAIL)) {
      if (!SAFE_EMAIL_DOMAIN.test(m[0])) { out.push({ line: n, kind: 'email address', preview: mask(m[0]) }); return; }
    }
    const p = PHONE.exec(line);
    if (p) out.push({ line: n, kind: 'phone number', preview: mask(p[1].replace(/\s+/g, '')) });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Vague and emphasised rules

export const VAGUE_PHRASES = [
  'clean code', 'best practice', 'best practices', 'good code', 'high quality', 'high-quality', 'readable code',
  'maintainable', 'be careful', 'carefully', 'properly', 'as needed', 'when appropriate', 'where appropriate',
  'if appropriate', 'if necessary', 'when necessary', 'when possible', 'where possible', 'as much as possible',
  'common sense', 'be thorough', 'think hard', 'keep it simple', 'keep things simple', 'be consistent', 'consistent style',
  'follow conventions', 'follow the conventions', 'follow existing patterns', 'idiomatic', 'elegant', 'robust',
  'production-ready', 'production ready', 'avoid unnecessary', 'try to', 'reasonable', 'sensible', 'good judgment',
  'good judgement', 'clean up', 'well-structured', 'well structured', 'efficient',
];

/** A unit counts as concrete if it names something checkable: a code span, a number, a path or a quoted string. */
const isConcrete = (t) => /`[^`]+`|\d|[\w-]+\/[\w.-]+|\.[a-z]{2,4}\b|"[^"]{3,}"/.test(t);

export function findVague(units) {
  const out = [];
  for (const u of units) {
    const low = u.text.toLowerCase();
    const hits = VAGUE_PHRASES.filter((p) => new RegExp(`(^|[^a-z])${p.replace(/[-]/g, '\\-')}([^a-z]|$)`).test(low));
    if (hits.length && !isConcrete(u.text)) out.push({ ...brief(u), phrases: hits });
  }
  return out;
}

const EMPHASIS = /\b(IMPORTANT|CRITICAL|NEVER|ALWAYS|MUST|DO NOT|DON'T|NOT NEGOTIABLE|MANDATORY|REQUIRED|WARNING)\b|!!|\b(again|keep forgetting|stop doing|for the last time|i said)\b|\breminder:/;

/** Units written in capitals or with "again"-style wording: often a rule that has been broken before, and a
 *  candidate for a hook instead of more emphasis. */
export function findEmphasis(units) {
  return units.filter((u) => EMPHASIS.test(u.text)).map((u) => ({ ...brief(u), marker: (EMPHASIS.exec(u.text) || [''])[0] }));
}

// ---------------------------------------------------------------------------------------------------------------
// Discovery

const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', 'vendor', 'dist', 'build', 'out', 'target', 'bin', 'obj',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', 'coverage', '.venv', 'venv', 'env', '__pycache__', '.tox',
  '.mypy_cache', '.pytest_cache', '.gradle', '.idea', '.vscode', 'Pods', 'DerivedData', '.terraform', 'tmp', '.yarn', '.pnpm-store']);
const NESTED_NAMES = ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md'];

/** Root-level instruction files: [relative path or directory, scope, loads]. "loads" is when Claude Code reads it:
 *  every-session, conditional (path-scoped rules), in-subtree (nested), other-tool (read by a different agent). */
const ROOT_FILES = [
  ['CLAUDE.md', 'project', 'every-session'],
  ['.claude/CLAUDE.md', 'project', 'every-session'],
  ['CLAUDE.local.md', 'local', 'every-session'],
  ['AGENTS.md', 'agents', 'other-tool'],
  ['AGENT.md', 'agents', 'other-tool'],
  ['GEMINI.md', 'agents', 'other-tool'],
  ['.cursorrules', 'cursor', 'other-tool'],
  ['.windsurfrules', 'windsurf', 'other-tool'],
  ['.clinerules', 'cline', 'other-tool'],
  ['.github/copilot-instructions.md', 'copilot', 'other-tool'],
];
const ROOT_DIRS = [
  ['.claude/rules', 'rules', 'every-session', /\.md$/i],
  ['.cursor/rules', 'cursor', 'other-tool', /\.(mdc|md)$/i],
  ['.github/instructions', 'copilot', 'other-tool', /\.instructions\.md$/i],
  ['.clinerules', 'cline', 'other-tool', /\.md$/i],
  ['.windsurf/rules', 'windsurf', 'other-tool', /\.md$/i],
];

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const real = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };

function walkFiles(dir, re, depth = 0, out = []) {
  if (depth > 4 || !isDir(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, re, depth + 1, out);
    else if (re.test(e.name)) out.push(p);
  }
  return out.sort();
}

/** A rules file with a `paths:` (or `globs:` / `applyTo:`) frontmatter key loads only for matching files. */
export const isPathScoped = (text) => { const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text); return !!m && /^(paths|globs|applyTo)\s*:/m.test(m[1]); };

/** Find the instruction files for a project. Returns [{ path, scope, loads }], deduplicated by real path. */
export function discoverFiles(root, { home = homedir(), maxDepth = 6, ancestors = true, maxDirs = 20000 } = {}) {
  root = resolve(root);
  const found = []; const seen = new Set();
  const add = (path, scope, loads) => { if (!isFile(path)) return; const r = real(path); if (seen.has(r)) return; seen.add(r); found.push({ path, scope, loads }); };

  if (home) {
    add(join(home, '.claude', 'CLAUDE.md'), 'global', 'every-session');
    for (const f of walkFiles(join(home, '.claude', 'rules'), /\.md$/i)) add(f, 'global', isPathScoped(readMaybe(f) || '') ? 'conditional' : 'every-session');
  }
  if (ancestors) {
    let d = dirname(root);
    const chain = [];
    while (d && d !== dirname(d)) { chain.push(d); d = dirname(d); }
    for (const a of chain.reverse()) for (const n of ['CLAUDE.md', 'CLAUDE.local.md']) add(join(a, n), 'ancestor', 'every-session');
  }
  for (const [rel, scope, loads] of ROOT_FILES) add(join(root, rel), scope, loads);
  for (const [rel, scope, loads, re] of ROOT_DIRS) {
    for (const f of walkFiles(join(root, rel), re)) {
      const l = loads === 'every-session' && isPathScoped(readMaybe(f) || '') ? 'conditional' : loads;
      add(f, scope, l);
    }
  }
  // Nested files, breadth-first and bounded.
  let visited = 0;
  const queue = [[root, 0]];
  while (queue.length && visited < maxDirs) {
    const [dir, depth] = queue.shift(); visited++;
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < maxDepth && !SKIP_DIRS.has(e.name) && (!e.name.startsWith('.') || e.name === '.claude' || e.name === '.github')) queue.push([p, depth + 1]);
      } else if (dir !== root && NESTED_NAMES.includes(e.name) && !p.includes(`${sep}.claude${sep}`)) {
        add(p, 'nested', e.name === 'AGENTS.md' ? 'other-tool' : 'in-subtree');
      }
    }
  }
  return found;
}

/** Every file name in the project (bounded walk, same skipped folders), for resolving bare file names. */
export function fileNames(root, { maxDirs = 20000 } = {}) {
  const names = new Set(); const queue = [root]; let visited = 0;
  while (queue.length && visited < maxDirs) {
    const dir = queue.shift(); visited++;
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) queue.push(join(dir, e.name)); }
      else names.add(e.name);
    }
  }
  return names;
}

// ---------------------------------------------------------------------------------------------------------------
// Scan

const LOAD_RANK = { 'every-session': 0, 'in-subtree': 1, conditional: 2, 'other-tool': 3 };

export function scan(root, { home = homedir(), threshold = 0.6, minBigrams = 4, maxDepth = 6, ancestors = true, globalRefs = false, maxImports = 50 } = {}) {
  root = resolve(root);
  const display = (p) => {
    const rel = relative(root, p);
    if (!rel.startsWith('..') && !isAbsolute(rel)) return rel.split(sep).join('/');
    if (home) { const h = relative(home, p); if (!h.startsWith('..') && !isAbsolute(h)) return '~/' + h.split(sep).join('/'); }
    return p.split(sep).join('/');
  };
  const files = discoverFiles(root, { home, maxDepth, ancestors }).map((f) => ({ ...f, text: readMaybe(f.path) ?? '', importedBy: [] }));
  const byReal = new Map(files.map((f) => [real(f.path), f]));
  const notes = [];
  const brokenImports = [];

  // Follow @imports one level deep: imports of discovered files are read; imports inside imported files are listed
  // in notes but not followed (Claude Code follows deeper, so the true load can be larger than reported).
  let followed = 0;
  for (const f of [...files]) {
    for (const imp of extractImports(f.text)) {
      const target = imp.ref.startsWith('~/') ? join(home || homedir(), imp.ref.slice(2)) : resolve(dirname(f.path), imp.ref);
      if (!isFile(target)) { brokenImports.push({ file: display(f.path), line: imp.line, kind: 'import', ref: imp.ref, why: 'imported file does not exist' }); continue; }
      const r = real(target);
      const existing = byReal.get(r);
      if (existing) {
        existing.importedBy.push(display(f.path));
        if (LOAD_RANK[f.loads] < LOAD_RANK[existing.loads]) existing.loads = f.loads;
        continue;
      }
      if (followed >= maxImports) { notes.push(`import limit (${maxImports}) reached; ${imp.ref} in ${display(f.path)} not read`); continue; }
      followed++;
      const nf = { path: target, scope: f.scope === 'global' ? 'global' : 'import', loads: f.loads, text: readMaybe(target) ?? '', importedBy: [display(f.path)] };
      files.push(nf); byReal.set(r, nf);
      for (const deeper of extractImports(nf.text)) notes.push(`${display(target)}:${deeper.line} imports ${deeper.ref} (second level, not followed)`);
    }
  }

  const rootTooling = readTooling(root);
  const names = fileNames(root);
  const out = { root: root.split(sep).join('/'), files: [], totals: {}, duplicates: [], missingReferences: [...brokenImports], secrets: [], vague: [], emphasis: [], largestSections: [], notes };
  const allUnits = [];
  const sections = [];
  for (const f of files) {
    const name = display(f.path);
    out.files.push({ path: name, scope: f.scope, loads: f.loads, importedBy: f.importedBy, ...fileStats(f.text) });
    const units = splitUnits(f.text).map((u) => ({ ...u, file: name }));
    allUnits.push(...units);
    for (const s of sectionsOf(stripFrontmatter(f.text))) sections.push({ file: name, ...s });
    if (f.scope !== 'global' || globalRefs) {
      const fileDir = dirname(f.path);
      const tooling = fileDir === root ? [rootTooling] : [readTooling(fileDir), rootTooling];
      for (const m of checkReferences(extractReferences(f.text), { fileDir, root, home, tooling, names })) {
        out.missingReferences.push({ file: name, line: m.line, kind: m.kind, ref: m.ref, why: m.why });
      }
    }
    for (const s of findSecrets(f.text)) out.secrets.push({ file: name, ...s });
  }
  for (const f of out.files) {
    out.totals[f.loads] ??= { files: 0, bytes: 0, tokens: 0 };
    out.totals[f.loads].files++; out.totals[f.loads].bytes += f.bytes; out.totals[f.loads].tokens += f.tokens;
  }
  out.duplicates = findDuplicates(allUnits, { threshold, minBigrams });
  out.vague = findVague(allUnits);
  out.emphasis = findEmphasis(allUnits);
  out.largestSections = sections.sort((a, b) => b.tokens - a.tokens).slice(0, 12);
  out.unitCount = allUnits.length;
  out.threshold = threshold;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Text output

export function formatText(r) {
  const L = [];
  const pad = (v, n) => String(v).padStart(n);
  L.push(`== Instruction files under ${r.root} ==`);
  if (!r.files.length) L.push('  none found');
  for (const f of r.files) {
    const imp = f.importedBy.length ? `  (imported by ${f.importedBy.join(', ')})` : '';
    L.push(`  ${pad(f.bytes, 7)} B ${pad(f.lines, 5)} lines ~${pad(f.tokens, 6)} tok  ${f.loads.padEnd(13)} ${f.path}${imp}`);
  }
  L.push('');
  L.push('== Estimated tokens by when they load ==');
  for (const k of Object.keys(LOAD_RANK)) if (r.totals[k]) L.push(`  ${k.padEnd(13)} ~${pad(r.totals[k].tokens, 6)} tok in ${r.totals[k].files} file(s)`);
  L.push('');
  L.push('== Largest sections ==');
  for (const s of r.largestSections) L.push(`  ~${pad(s.tokens, 5)} tok  ${s.file}:${s.line}  ${s.heading}`);
  L.push('');
  L.push(`== Near-duplicate rule pairs (overlap >= ${r.threshold}) ==`);
  if (!r.duplicates.length) L.push('  none');
  for (const d of r.duplicates) {
    L.push(`  ${d.score.toFixed(2)}${d.exact ? ' exact' : ''}  ${d.a.file}:${d.a.line}  "${d.a.text}"`);
    L.push(`        <-> ${d.b.file}:${d.b.line}  "${d.b.text}"`);
  }
  L.push('');
  L.push('== References that do not resolve ==');
  if (!r.missingReferences.length) L.push('  none');
  for (const m of r.missingReferences) L.push(`  ${m.file}:${m.line}  ${m.kind.padEnd(6)} ${m.ref}  (${m.why})`);
  L.push('');
  L.push('== Possible secrets or personal data (masked) ==');
  if (!r.secrets.length) L.push('  none');
  for (const s of r.secrets) L.push(`  ${s.file}:${s.line}  ${s.kind}  ${s.preview}`);
  L.push('');
  L.push('== Vague-rule candidates (no concrete anchor) ==');
  if (!r.vague.length) L.push('  none');
  for (const v of r.vague) L.push(`  ${v.file}:${v.line}  [${v.phrases.join(', ')}]  "${v.text}"`);
  L.push('');
  L.push('== Emphasised rules (check whether they keep being broken) ==');
  if (!r.emphasis.length) L.push('  none');
  for (const e of r.emphasis) L.push(`  ${e.file}:${e.line}  [${e.marker}]  "${e.text}"`);
  if (r.notes.length) { L.push(''); L.push('== Notes =='); for (const n of r.notes) L.push(`  ${n}`); }
  L.push('');
  L.push(`${r.files.length} file(s), ${r.unitCount} rule unit(s), ${r.duplicates.length} near-duplicate pair(s), ${r.missingReferences.length} unresolved reference(s), ${r.secrets.length} possible secret(s).`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// CLI

export function parseArgs(args) {
  const o = { root: process.cwd(), json: false, threshold: 0.6, minBigrams: 4, maxDepth: 6, home: homedir(), ancestors: true, globalRefs: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const num = () => { const v = Number(args[++i]); if (!Number.isFinite(v)) throw new Error(`${a} needs a number`); return v; };
    if (a === '--json') o.json = true;
    else if (a === '--threshold') o.threshold = num();
    else if (a === '--min-bigrams') o.minBigrams = num();
    else if (a === '--max-depth') o.maxDepth = num();
    else if (a === '--home') { o.home = args[++i]; if (!o.home) throw new Error('--home needs a directory'); }
    else if (a === '--no-ancestors') o.ancestors = false;
    else if (a === '--global-refs') o.globalRefs = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else o.root = a;
  }
  return o;
}

function main(args) {
  let o;
  try { o = parseArgs(args); } catch (e) { process.stderr.write(`scan.mjs: ${e.message}\n`); return 1; }
  if (o.help) { process.stdout.write('usage: node scan.mjs [root] [--json] [--threshold 0.6] [--min-bigrams 4] [--max-depth 6] [--home dir] [--no-ancestors] [--global-refs]\n'); return 0; }
  if (!isDir(o.root)) { process.stderr.write(`scan.mjs: not a directory: ${o.root}\n`); return 1; }
  const r = scan(o.root, o);
  process.stdout.write((o.json ? JSON.stringify(r, null, 2) : formatText(r)) + '\n');
  return 0;
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) process.exit(main(process.argv.slice(2)));
