#!/usr/bin/env node
// The shortcut ledger: every comment that marks a known limit with the word shortcut and a colon, one row each.
//
//   node debt.mjs [folder]     (default: the current folder)
//
// Prints `<file>:<line>: <text>` per marker, sorted by path and line, with ` [no-trigger]` when the comment names no
// upgrade trigger (no second part after its first comma or semicolon), then `<N> markers, <M> with no trigger.` or
// `No shortcut markers.`, and exits 0. Outside a git work tree, or when git fails, it prints one line on stderr and
// exits 2.
//
// Reads only the files git lists (tracked, plus untracked files no ignore rule matches) and only regular files: no
// symlink, submodule folder, deleted path or file with a NUL byte. Writes nothing and uses no network. Node 20+,
// standard library only.
//
// A marker is the lowercase word with its colon, right after a comment opener: //, #, /*, --, ;, %, <!--, {-, (* or
// rem in any case, and longer forms such as ///, ##, /**, ;; and ---. Punctuation may come before the opener ({/*,
// <%#, {{!--, @rem), but no letter, digit, quote or backtick, so prose, inline code and most string literals that
// only mention the convention stay out. A lone * as the first thing on a line counts too (inside a block comment).
// In Markdown, reStructuredText, AsciiDoc and plain text files only an HTML comment counts.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { extname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

const MARK = 'shortcut:';
const MAX_WORD = 16;
const OPENERS = ['//', '//!', '#', '#=', '#!', '/*', '/**', '/*!', '--', '--[[', ';', '%', '<!--', '{-', '(*', 'rem'];
const PROSE_OPENERS = ['<!--'];
const PROSE = new Set(['.md', '.markdown', '.mdx', '.rst', '.txt', '.adoc']);
// Printable ASCII punctuation without the quotes and the backtick: the only characters allowed before an opener.
const PUNCT = '!#$%&()*+,-./:;<=>?@[\\]^_{|}~';
// --}} is in the list so a Handlebars comment loses its whole closer, not all but one dash of it.
const CLOSERS = ['*/', '-->', '--}}', '-}', '*)', ']]', '#}', '%>', '=#'];

const isBlank = (c) => c === ' ' || c === '\t';
const isDigit = (c) => c !== undefined && c >= '0' && c <= '9';

function opens(word, openers) {
  const lower = word.toLowerCase();
  return openers.some((o) => lower.endsWith(o) && [...lower.slice(0, -o.length)].every((c) => PUNCT.includes(c)));
}

function markerText(rest) {
  let cut = rest.length;
  for (const c of CLOSERS) {
    const i = rest.indexOf(c);
    if (i >= 0 && i < cut) cut = i;
  }
  return rest.slice(0, cut).trim();
}

/** The text of the first marker on a line that passes the opener rule, or null. prose: only <!-- counts. */
export function findMarker(line, prose = false) {
  let at = line.indexOf(MARK);
  if (at < 0) return null;
  let indent = 0;
  while (isBlank(line[indent])) indent++;
  const openers = prose ? PROSE_OPENERS : OPENERS;
  for (; at >= 0; at = line.indexOf(MARK, at + 1)) {
    let end = at;
    while (end > 0 && isBlank(line[end - 1])) end--;
    let start = end;
    while (start > 0 && !isBlank(line[start - 1]) && end - start <= MAX_WORD) start--;
    const word = line.slice(start, end);
    if (word.length > MAX_WORD) continue;
    if (opens(word, openers) || (!prose && word === '*' && start === indent)) return markerText(line.slice(at + MARK.length));
  }
  return null;
}

/** True when the text has a second part, with a letter or digit, after its first comma or semicolon. */
export function hasTrigger(text) {
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c !== ',' && c !== ';') continue;
    if (c === ',' && isDigit(text[i - 1]) && isDigit(text[i + 1])) continue; // 1,000 is a number, not two parts
    return /[\p{L}\p{N}]/u.test(text.slice(i + 1));
  }
  return false;
}

/** The markers in a file's text as { line, text }. The path decides whether it is a prose file. */
export function scanText(text, path = '') {
  const body = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const prose = PROSE.has(extname(path).toLowerCase());
  const rows = [];
  body.split('\n').forEach((raw, i) => {
    if (!raw.includes(MARK)) return;
    const found = findMarker(raw.endsWith('\r') ? raw.slice(0, -1) : raw, prose);
    if (found !== null) rows.push({ line: i + 1, text: found });
  });
  return rows;
}

/** The paths git lists in the folder, each once (a conflicted file is listed once per stage), sorted. Throws on error. */
export function listFiles(folder) {
  const out = execFileSync('git', ['-C', folder, 'ls-files', '-co', '--exclude-standard', '-z'],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return [...new Set(out.split('\0').filter(Boolean))].sort();
}

/** Every marker under the folder as { file, line, text, trigger }, and a warning per regular file it could not read. */
export function ledger(folder, files = listFiles(folder)) {
  const rows = [];
  const warnings = [];
  for (const file of files) {
    const full = join(folder, file);
    try {
      if (!lstatSync(full).isFile()) continue;
    } catch {
      continue; // listed but gone from disk
    }
    let buf;
    try {
      buf = readFileSync(full);
    } catch (e) {
      warnings.push(`debt.mjs: could not read ${file} (${e.code || e.message}), skipped.`);
      continue;
    }
    if (buf.includes(0)) continue;
    for (const r of scanText(buf.toString('utf8'), file)) rows.push({ file, ...r, trigger: hasTrigger(r.text) });
  }
  return { rows, warnings };
}

/** The report text: one row per marker, then the summary line. */
export function format(rows) {
  const out = rows.map((r) => `${r.file}:${r.line}:${r.text ? ` ${r.text}` : ''}${r.trigger ? '' : ' [no-trigger]'}`);
  const open = rows.filter((r) => !r.trigger).length;
  out.push(rows.length ? `${rows.length} marker${rows.length === 1 ? '' : 's'}, ${open} with no trigger.` : 'No shortcut markers.');
  return out.join('\n') + '\n';
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  const folder = process.argv[2] || '.';
  let files;
  try {
    files = listFiles(folder);
  } catch (e) {
    const why = String(e.stderr || e.message || e).split('\n').map((l) => l.trim()).find(Boolean) || 'unknown error';
    process.stderr.write(/not a git repository/i.test(why)
      ? `debt.mjs: ${folder} is not inside a git work tree.\n`
      : `debt.mjs: git ls-files failed in ${folder}: ${why}\n`);
    process.exit(2);
  }
  const { rows, warnings } = ledger(folder, files);
  for (const w of warnings) process.stderr.write(w + '\n');
  process.stdout.write(format(rows));
}
