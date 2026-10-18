#!/usr/bin/env node
// PreToolUse reporter for Write, Edit and MultiEdit on code files: tells the model when an edit adds a lint or
// type-check suppression that carries no reason.
//
// Why: when a linter or type checker complains, the cheapest edit is to silence it (`eslint-disable`, `@ts-ignore`,
// `# noqa`, `//nolint`). Sometimes that is right, and then the reason belongs next to it, so the next reader knows why
// the warning does not apply. A bare suppression hides the warning and the thinking behind it. This hook never blocks
// or approves: it adds a short note to the model's context and lets the edit go ahead.
//
// Checked: code files by extension, skipping vendored and generated paths, judged relative to the project root
// (node_modules, vendor, third_party and generated folders anywhere; dist, build, out, target, coverage and gen only
// at the root; minified and protobuf output). The edit is reported when the number of suppressions without a reason
// goes up; removing one or leaving an old one alone is silent. Inputs over 1 MB are skipped.
//
// Suppressions, counted only where the tool honours them: at the start of a comment (after `//`, `#`, `/*` or `<!--`,
// as the language has them, outside string literals) for eslint-disable (all forms), @ts-ignore, @ts-expect-error,
// noqa, type: ignore, pylint: disable, nolint, NOLINT (and NOLINTNEXTLINE, NOLINTBEGIN), rubocop:disable and
// phpcs:ignore; as the attribute or annotation itself for #[allow( and #![allow(, @SuppressWarnings, @Suppress and
// #pragma warning disable. Formatter directives (prettier-ignore, fmt: off, clang-format off) are not suppressions.
//
// A reason is free text in the tool's own syntax (`-- why` for eslint, rubocop and phpcs; text after @ts-expect-error
// or @ts-ignore; text after the codes for noqa, type: ignore, pylint, nolint, NOLINT and #pragma; Rust
// `reason = "..."`, also on a later line of the attribute), a trailing comment after an attribute or annotation, or a
// plain comment on the line just above (not a doc comment, a license header, a shebang or an encoding line). Rule and
// error codes alone (`TS2322`, `E501`, `no-console`) are not a reason. This criterion is this hook's own.
//
// Edit and each MultiEdit edit are judged on their own old and new strings, so a comment above an edit that the edit
// does not include is not seen; Write is judged against the file on disk.
//
// Option in .claude/pau-skills.json: { "suppression-reason": { "ignorePaths": ["legacy/**"] } } skips more paths.
//
// Writes hookSpecificOutput.additionalContext as JSON on stdout, nothing else. Exits 0 always; silent on input it
// does not understand.
import { readFileSync, realpathSync } from 'node:fs';
import { basename, isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, hookOptions, projectDir, readStdin, parseInput } from '../lib/config.mjs';

export const NAME = 'suppression-reason';
const MAX_CHARS = 1_000_000;

const CODE_EXT = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'vue', 'svelte', 'astro',
  'py', 'pyi', 'go', 'rs', 'java', 'kt', 'kts', 'scala', 'groovy', 'cs', 'fs', 'vb', 'swift', 'm', 'mm',
  'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'hxx', 'rb', 'rake', 'php', 'dart',
]);

// Folder rules that mean "vendored or generated" wherever they appear, and build output that is only output at the
// project root (a src/build/ or lib/gen/ folder is source).
const SKIP_ANYWHERE = /(^|\/)(node_modules|vendor|third[_-]party|bower_components|Pods|\.venv|venv|site-packages|__pycache__|generated|__generated__|\.next|\.nuxt|\.svelte-kit)\//;
const SKIP_AT_ROOT = /^(dist|build|out|target|coverage|gen)\//;
const SKIP_FILE = [/\.min\.[a-z]+$/i, /\.(generated|gen|g|pb|pb\.gw)\.[a-z]+$/i, /_pb2(_grpc)?\.pyi?$/, /\.designer\.cs$/i];

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('(^|/)' + re + '$');
}

/** True for a code file this hook checks. `path` is relative to the project root when it lies inside it. */
export function isCodeFile(path, ignore = []) {
  if (typeof path !== 'string' || !path) return false;
  const p = path.replace(/\\/g, '/');
  const ext = /\.([A-Za-z0-9]+)$/.exec(p)?.[1].toLowerCase();
  if (!ext || !CODE_EXT.has(ext)) return false;
  if (SKIP_ANYWHERE.test(p) || SKIP_AT_ROOT.test(p) || SKIP_FILE.some((re) => re.test(p))) return false;
  return !ignore.some((g) => typeof g === 'string' && (globToRegExp(g).test(p) || globToRegExp(g).test(basename(p))));
}

/** The path relative to the project root, or the path itself when it lies outside the root. */
function projectPath(path, root) {
  const rel = relative(resolve(root), resolve(root, path));
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? rel.replace(/\\/g, '/') : path.replace(/\\/g, '/');
}

// Rule and error codes are not words of a reason: TS2322, E501, CS0618, no-console, dead_code, Metrics/MethodLength,
// Generic.Files.LineLength.
const CODE_TOKEN = /\b[A-Z]{1,6}\d{2,6}\b|[@\w.-]*\/[\w/.-]+|\b[a-z]+(?:[-_][a-z0-9]+)+\b|\b[A-Z]+(?:_[A-Z0-9]+)+\b|\b\w+(?:\.\w+){2,}\b/g;
const hasText = (text) => /[A-Za-z]{2,}/.test(text.replace(CODE_TOKEN, ' '));
const afterCodes = (codes) => (rest) => hasText(rest.replace(codes, ''));
const afterDashes = (rest) => { const k = rest.indexOf('--'); return k !== -1 && hasText(rest.slice(k + 2)); };

// Directives that count only at the start of a comment: [label, regex anchored at the comment's start, reason test].
const COMMENT_MARKERS = [
  ['eslint-disable', /^eslint-disable(?:-next-line|-line)?(?![\w-])/, afterDashes],
  ['@ts-ignore', /^@ts-ignore\b/, afterCodes(/^\s*:?\s*(?:TS\d+[\s,:]*)*/)],
  ['@ts-expect-error', /^@ts-expect-error\b/, afterCodes(/^\s*:?\s*(?:TS\d+[\s,:]*)*/)],
  ['# noqa', /^noqa\b/i, afterCodes(/^\s*:?\s*(?:[A-Z]+[0-9]+[\s,]*)*/)],
  ['# type: ignore', /^type:\s*ignore\b/, afterCodes(/^\[[^\]]*\]/)],
  ['pylint: disable', /^pylint:\s*disable(?:-next)?\s*=/, afterCodes(/^\s*[\w-]+(?:\s*,\s*[\w-]+)*/)],
  ['//nolint', /^nolint\b/, afterCodes(/^:[\w-]+(?:,[\w-]+)*/)],
  ['NOLINT', /^NOLINT(?:NEXTLINE|BEGIN)?\b/, afterCodes(/^\([^)]*\)/)],
  ['rubocop:disable', /^rubocop:disable\b/, afterCodes(/^\s*[\w/]+(?:\s*,\s*[\w/]+)*/)],
  ['phpcs:ignore', /^phpcs:ignore(?:File)?\b/, afterCodes(/^\s*[\w.]+(?:\s*,\s*[\w.]+)*/)],
];
// Attributes and annotations, found in the code with strings blanked: [label, regex, true when it must start the line].
const ATTRIBUTE_MARKERS = [
  ['#[allow(', /#!?\[allow\(/g, true],
  ['@SuppressWarnings', /@SuppressWarnings\s*\(/g, false],
  ['@Suppress', /@(?:file:)?Suppress\s*\(/g, false],
  ['#pragma warning disable', /#\s*pragma\s+warning\s+disable\b/g, true],
];

const HASH_ONLY = new Set(['py', 'pyi', 'rb', 'rake']);
const HTML_COMMENTS = new Set(['vue', 'svelte', 'astro']);

function syntaxOf(path) {
  const ext = /\.([A-Za-z0-9]+)$/.exec(String(path))?.[1].toLowerCase() || '';
  return { hash: HASH_ONLY.has(ext) || ext === 'php', php: ext === 'php', slash: !HASH_ONLY.has(ext), html: HTML_COMMENTS.has(ext) };
}

// One line split into code (string literals blanked, comments removed) and its comments. A block comment may run on
// from the previous line; `state` carries that between lines.
function scanLine(line, syn, state) {
  let code = '';
  const comments = [];
  let i = 0;
  const n = line.length;
  const closeBlock = (from, opener, doc, closer) => {
    const e = line.indexOf(closer, from);
    comments.push({ opener, doc, text: line.slice(from, e === -1 ? n : e) });
    if (e === -1) { state.block = { opener, doc, closer }; return n; }
    state.block = null;
    return e + closer.length;
  };
  if (state.block) i = closeBlock(0, state.block.opener, state.block.doc, state.block.closer);
  while (i < n) {
    const c = line[i];
    if (c === '"' || c === '`' || (c === "'" && line.indexOf("'", i + 1) !== -1)) {
      let j = i + 1;
      while (j < n && line[j] !== c) j += line[j] === '\\' ? 2 : 1;
      code += ' '.repeat(Math.min(j, n - 1) - i + 1);
      i = j + 1;
      continue;
    }
    if (syn.slash && c === '/' && line[i + 1] === '/') {
      comments.push({ opener: '//', doc: line[i + 2] === '/' || line[i + 2] === '!', text: line.slice(i + 2) });
      break;
    }
    if (syn.slash && c === '/' && line[i + 1] === '*') {
      const doc = (line[i + 2] === '*' && line[i + 3] !== '/') || line[i + 2] === '!';
      i = closeBlock(i + 2, '/*', doc, '*/');
      continue;
    }
    if (syn.html && line.startsWith('<!--', i)) { i = closeBlock(i + 4, '<!--', false, '-->'); continue; }
    if (syn.hash && c === '#' && !(syn.php && line[i + 1] === '[')) { // PHP 8 attributes start with #[
      comments.push({ opener: '#', doc: i === 0 && line[1] === '!', text: line.slice(i + 1) });
      break;
    }
    code += c;
    i++;
  }
  return { code, comments };
}

// The directives in one comment: each must start the comment or a nested `//` or `#` part of it. Its reason text runs
// to the next part that is itself a directive.
function commentDirectives(comment) {
  const sep = comment.opener === '//' ? '//' : comment.opener === '#' ? '#' : null;
  const parts = sep ? comment.text.split(sep) : [comment.text];
  const marks = parts.map((part) => {
    const t = part.replace(/^[\s*]*/, '');
    for (const [label, re, reasoned] of COMMENT_MARKERS) {
      const m = re.exec(t);
      if (m) return { label, reasoned, rest: t.slice(m[0].length) };
    }
    return null;
  });
  const out = [];
  marks.forEach((mark, k) => {
    if (!mark) return;
    let rest = mark.rest;
    for (let j = k + 1; j < parts.length && !marks[j]; j++) rest += ` ${sep} ${parts[j]}`;
    out.push({ label: mark.label, reasoned: mark.reasoned(rest) });
  });
  return out;
}

const NOT_A_REASON = /SPDX-License-Identifier|copyright|licen[cs]e|coding[:=]|^\s*!/i;

// A line that is only a plain comment with words in it, and no directive, explains the line below it.
function explains(scanned) {
  if (!scanned || scanned.code.trim() || !scanned.comments.length) return false;
  return scanned.comments.every((c) => !c.doc && !NOT_A_REASON.test(c.text) && !commentDirectives(c).length) &&
    scanned.comments.some((c) => hasText(c.text));
}

/** The suppressions in `text` that carry no reason, as { label, line } entries. */
export function unexplained(text, path = '') {
  const syn = syntaxOf(path);
  const lines = String(text).split(/\r?\n/);
  const state = { block: null };
  const scanned = lines.map((line) => scanLine(line, syn, state));
  const explained = [];
  const above = (i) => (explained[i] ??= explains(scanned[i - 1]));
  const out = [];
  scanned.forEach(({ code, comments }, i) => {
    for (const c of comments) {
      for (const d of commentDirectives(c)) if (!d.reasoned && !above(i)) out.push({ label: d.label, line: lines[i].trim() });
    }
    for (const [label, re, atStart] of ATTRIBUTE_MARKERS) {
      for (const m of code.matchAll(new RegExp(re.source, re.flags))) {
        if (atStart && code.slice(0, m.index).trim()) continue;
        if (!attributeReasoned(lines, scanned, i, m.index + m[0].length, label) && !above(i)) out.push({ label, line: lines[i].trim() });
      }
    }
  });
  return out;
}

// An attribute's reason: Rust `reason = "..."` anywhere up to its closing bracket (which may be lines further down),
// or a comment with words on the line where it closes. A #pragma takes the comment on its own line.
function attributeReasoned(lines, scanned, i, from, label) {
  if (label === '#pragma warning disable') return scanned[i].comments.some((c) => hasText(c.text));
  let depth = 1;
  let text = '';
  for (let k = i; k < lines.length && k < i + 30; k++) {
    const code = scanned[k].code;
    for (let j = k === i ? from : 0; j < code.length; j++) {
      if (code[j] === '(' || code[j] === '{' || code[j] === '[') depth++;
      else if (code[j] === ')' || code[j] === '}' || code[j] === ']') depth--;
      if (depth === 0) {
        text += lines[k].slice(k === i ? from : 0, j);
        if (label === '#[allow(' && /\breason\s*=\s*"[^"]*[A-Za-z]{2,}/.test(text)) return true;
        return scanned[k].comments.some((c) => !c.doc && hasText(c.text));
      }
    }
    text += lines[k].slice(k === i ? from : 0) + '\n';
  }
  return false;
}

/** The before and after texts of the edit, as pairs judged one by one, or null for a tool this hook does not check. */
export function beforeAfter(toolName, input, readFile) {
  if (!input || typeof input !== 'object') return null;
  if (toolName === 'Edit' && typeof input.old_string === 'string' && typeof input.new_string === 'string') {
    return [{ before: input.old_string, after: input.new_string }];
  }
  if (toolName === 'MultiEdit' && Array.isArray(input.edits)) {
    return input.edits.map((e) => ({ before: typeof e?.old_string === 'string' ? e.old_string : '', after: typeof e?.new_string === 'string' ? e.new_string : '' }));
  }
  if (toolName === 'Write' && typeof input.content === 'string') {
    return [{ before: readFile(input.file_path) ?? '', after: input.content }];
  }
  return null;
}

/** Pure decision: the hook output object, or null. */
export function decide(input, { root = process.cwd(), options = {}, readFile = () => null } = {}) {
  if (!input || typeof input !== 'object') return null;
  const path = input.tool_input?.file_path;
  if (typeof path !== 'string' || !path) return null;
  if (!isCodeFile(projectPath(path, root), Array.isArray(options.ignorePaths) ? options.ignorePaths : [])) return null;
  const pairs = beforeAfter(input.tool_name, input.tool_input, (p) => readFile(resolve(root, p)));
  if (!pairs) return null;
  let size = 0;
  for (const { before, after } of pairs) size = Math.max(size, before.length, after.length);
  if (size > MAX_CHARS) return null;
  const before = pairs.flatMap((p) => unexplained(p.before, path));
  const after = pairs.flatMap((p) => unexplained(p.after, path));
  const added = after.length - before.length;
  if (added <= 0) return null;
  const old = before.map((s) => s.line);
  const fresh = after.filter((s) => { const k = old.indexOf(s.line); if (k === -1) return true; old.splice(k, 1); return false; });
  const shown = fresh.slice(0, 3).map((s) => `\`${s.line.length > 120 ? s.line.slice(0, 117) + '...' : s.line}\``).join(', ');
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      additionalContext:
        `[suppression-reason] This edit to ${path} adds ${added} lint or type-check suppression${added > 1 ? 's' : ''} ` +
        `with no reason${shown ? `: ${shown}` : ''}. If the warning is real, fix the code instead. If the suppression is ` +
        'right, say why next to it, in the tool\'s own syntax (eslint `-- why`, text after `@ts-expect-error`, ' +
        '`//nolint:x // why`, Rust `reason = "..."`) or in a comment on the line above. A rule code alone is not a reason.',
    },
  };
}

const readFileOrNull = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  try {
    const input = parseInput(await readStdin());
    if (input) {
      const root = projectDir(input);
      const config = loadConfig({ project: root });
      if (hookEnabled(NAME, config)) {
        const out = decide(input, { root, options: hookOptions(NAME, config), readFile: readFileOrNull });
        if (out) process.stdout.write(JSON.stringify(out) + '\n');
      }
    }
  } catch { /* a reporter never breaks a session */ }
  process.exit(0);
}
