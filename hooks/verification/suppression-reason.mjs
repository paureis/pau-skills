#!/usr/bin/env node
// PreToolUse reporter for Write, Edit and MultiEdit on code files: tells the model when an edit adds a lint or
// type-check suppression that carries no reason.
//
// Why: when a linter or type checker complains, the cheapest edit is to silence it (`eslint-disable`, `@ts-ignore`,
// `# noqa`, `//nolint`). Sometimes that is right, and then the reason belongs next to it, so the next reader knows why
// the warning does not apply. A bare suppression hides the warning and the thinking behind it. This hook never blocks
// or approves: it adds a short note to the model's context and lets the edit go ahead.
//
// Checked: code files by extension, skipping vendored and generated paths (node_modules, vendor, third_party, dist,
// build, target, minified and protobuf output, generated folders). The edit is reported when the number of
// suppressions without a reason goes up; removing one or leaving an old one alone is silent.
//
// Suppressions: eslint-disable (all forms), @ts-ignore, @ts-expect-error, # noqa, # type: ignore, pylint: disable,
// //nolint, NOLINT (and NOLINTNEXTLINE, NOLINTBEGIN), #[allow( and #![allow(, @SuppressWarnings, @Suppress,
// rubocop:disable, #pragma warning disable, phpcs:ignore. Formatter directives (prettier-ignore, fmt: off,
// clang-format off) are not suppressions.
//
// A reason is free text in the tool's own syntax (`-- why` for eslint, rubocop and phpcs; text after @ts-expect-error
// or @ts-ignore; text after the codes for noqa, type: ignore, pylint, nolint, NOLINT and #pragma; Rust
// `reason = "..."`), a trailing comment after an attribute or annotation, or a comment on the line just above. A rule
// code alone is not a reason. This criterion is this hook's own.
//
// Edit and MultiEdit are judged on their old and new strings, so a comment above an edit that the edit does not
// include is not seen; Write is judged against the file on disk.
//
// Option in .claude/pau-skills.json: { "suppression-reason": { "ignorePaths": ["legacy/**"] } } skips more paths.
//
// Writes hookSpecificOutput.additionalContext as JSON on stdout, nothing else. Exits 0 always; silent on input it
// does not understand.
import { readFileSync, realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, hookOptions, projectDir, readStdin, parseInput } from '../lib/config.mjs';

export const NAME = 'suppression-reason';

const CODE_EXT = new Set([
  'js', 'jsx', 'mjs', 'cjs', 'ts', 'tsx', 'mts', 'cts', 'vue', 'svelte', 'astro',
  'py', 'pyi', 'go', 'rs', 'java', 'kt', 'kts', 'scala', 'groovy', 'cs', 'fs', 'vb', 'swift', 'm', 'mm',
  'c', 'h', 'cc', 'cpp', 'cxx', 'hpp', 'hh', 'hxx', 'rb', 'rake', 'php', 'dart',
]);

const SKIP_PATH = [
  /(^|\/)(node_modules|vendor|third[_-]party|bower_components|Pods|\.venv|venv|site-packages|__pycache__)\//,
  /(^|\/)(dist|build|out|target|coverage|\.next|\.nuxt|\.svelte-kit)\//,
  /(^|\/)(generated|__generated__|gen)\//,
  /\.min\.[a-z]+$/i,
  /\.(generated|gen|g|pb|pb\.gw)\.[a-z]+$/i,
  /_pb2(_grpc)?\.pyi?$/,
  /\.designer\.cs$/i,
];

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

/** True for a code file this hook checks: a code extension, not vendored or generated, not in ignorePaths. */
export function isCodeFile(path, ignore = []) {
  if (typeof path !== 'string' || !path) return false;
  const p = path.replace(/\\/g, '/');
  const ext = /\.([A-Za-z0-9]+)$/.exec(p)?.[1].toLowerCase();
  if (!ext || !CODE_EXT.has(ext)) return false;
  if (SKIP_PATH.some((re) => re.test(p))) return false;
  return !ignore.some((g) => typeof g === 'string' && (globToRegExp(g).test(p) || globToRegExp(g).test(basename(p))));
}

// What is left after the codes and comment punctuation, if it holds a word, is a reason.
const hasText = (rest) => /[A-Za-z]{2,}/.test(rest.replace(/\*\/|-->/g, ''));
const afterCodes = (codes) => (rest) => hasText(rest.replace(codes, ''));
const trailingComment = (rest) => /[\])]\s*(\/\/|\/\*|#)\s*\S/.test(rest) && hasText(rest.replace(/^[^\])]*[\])]/, ''));

// [label, marker regex, does the rest of the line after the marker hold a reason?]
export const SUPPRESSIONS = [
  ['eslint-disable', /\beslint-disable(?:-next-line|-line)?(?![\w-])/g, (rest) => /--\s*[^\s*/-]/.test(rest)],
  ['@ts-ignore', /@ts-ignore\b/g, (rest) => hasText(rest)],
  ['@ts-expect-error', /@ts-expect-error\b/g, (rest) => hasText(rest)],
  ['# noqa', /#\s*noqa\b/gi, afterCodes(/^\s*:?\s*(?:[A-Z]+[0-9]+[\s,]*)*/)],
  ['# type: ignore', /#\s*type:\s*ignore\b/g, afterCodes(/^\[[^\]]*\]/)],
  ['pylint: disable', /\bpylint:\s*disable(?:-next)?\s*=/g, afterCodes(/^\s*[\w-]+(?:\s*,\s*[\w-]+)*/)],
  ['//nolint', /\/\/\s*nolint\b/g, afterCodes(/^:[\w-]+(?:,[\w-]+)*/)],
  ['NOLINT', /\bNOLINT(?:NEXTLINE|BEGIN)?\b/g, afterCodes(/^\([^)]*\)/)],
  ['#[allow(', /#!?\[allow\(/g, (rest) => /\breason\s*=\s*"[^"]*[A-Za-z]{2,}/.test(rest) || trailingComment(rest)],
  ['@SuppressWarnings', /@SuppressWarnings\s*\(/g, trailingComment],
  ['@Suppress', /@(?:file:)?Suppress\s*\(/g, trailingComment],
  ['rubocop:disable', /\brubocop:disable\b/g, afterCodes(/^\s*[\w/]+(?:\s*,\s*[\w/]+)*/)],
  ['#pragma warning disable', /#\s*pragma\s+warning\s+disable\b/g, afterCodes(/^\s*\w+(?:\s*,\s*\w+)*/)],
  ['phpcs:ignore', /\bphpcs:ignore(?:File)?\b/g, afterCodes(/^\s*[\w.]+(?:\s*,\s*[\w.]+)*/)],
];

const HASH_COMMENTS = new Set(['py', 'pyi', 'rb', 'rake', 'php']);
const isSuppression = (line) => SUPPRESSIONS.some(([, re]) => new RegExp(re.source, re.flags).test(line));

// A comment line with words in it, which is not itself a suppression, explains the line below it.
function explains(line, ext) {
  const t = (line || '').trim();
  const comment = /^(\/\/|\/\*|\*)/.test(t) || (HASH_COMMENTS.has(ext) && /^#(?![[!])/.test(t));
  return comment && !isSuppression(t) && hasText(t.replace(/^(\/\/+|\/\*+|\*+|#+)/, ''));
}

/** The suppressions in `text` that carry no reason, as { label, line } entries. */
export function unexplained(text, path = '') {
  const ext = /\.([A-Za-z0-9]+)$/.exec(String(path))?.[1].toLowerCase() || '';
  const lines = String(text).split(/\r?\n/);
  const out = [];
  lines.forEach((line, i) => {
    const found = [];
    for (const [label, marker, reasoned] of SUPPRESSIONS) {
      for (const m of line.matchAll(new RegExp(marker.source, marker.flags))) found.push({ label, reasoned, start: m.index, end: m.index + m[0].length });
    }
    found.sort((a, b) => a.start - b.start);
    found.forEach((f, k) => {
      // The rest of the line stops at the next suppression, so "# type: ignore # noqa" is two bare suppressions.
      const rest = line.slice(f.end, k + 1 < found.length ? found[k + 1].start : line.length);
      if (!f.reasoned(rest) && !explains(lines[i - 1], ext)) out.push({ label: f.label, line: line.trim() });
    });
  });
  return out;
}

/** The before and after text of the edit, or null for a tool this hook does not check. */
export function beforeAfter(toolName, input, readFile) {
  if (!input || typeof input !== 'object') return null;
  if (toolName === 'Edit' && typeof input.old_string === 'string' && typeof input.new_string === 'string') {
    return { before: input.old_string, after: input.new_string };
  }
  if (toolName === 'MultiEdit' && Array.isArray(input.edits)) {
    return { before: input.edits.map((e) => e?.old_string || '').join('\n'), after: input.edits.map((e) => e?.new_string || '').join('\n') };
  }
  if (toolName === 'Write' && typeof input.content === 'string') {
    return { before: readFile(input.file_path) ?? '', after: input.content };
  }
  return null;
}

/** Pure decision: the hook output object, or null. */
export function decide(input, { root = process.cwd(), options = {}, readFile = () => null } = {}) {
  if (!input || typeof input !== 'object') return null;
  const path = input.tool_input?.file_path;
  if (!isCodeFile(path, Array.isArray(options.ignorePaths) ? options.ignorePaths : [])) return null;
  const ba = beforeAfter(input.tool_name, input.tool_input, (p) => readFile(resolve(root, p)));
  if (!ba) return null;
  const before = unexplained(ba.before, path);
  const after = unexplained(ba.after, path);
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
