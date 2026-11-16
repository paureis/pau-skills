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
// Reads only the files git lists (tracked, plus untracked files no ignore rule matches) and only regular files inside
// the folder: no symlink, submodule folder, deleted path, file reached through a symlinked parent folder, or file with
// a NUL byte (so UTF-16 files are skipped too). A file over MAX_BYTES (64 MiB) is skipped with one warning on stderr.
// Line breaks are \n, \r\n or a lone \r. Control characters in a printed path or text are escaped (\n, \t, \x1b), so a
// file name cannot forge a row. Writes nothing and uses no network. Node 20+, standard library only.
//
// A marker is the lowercase word with its colon, right after a comment opener: //, #, /*, --, ;, %, <!--, {-, (* or
// rem in any case, and longer forms such as ///, ##, /**, ;; and ---. Punctuation may come before the opener ({/*,
// <%#, {{!--, @rem), but no letter, digit, quote or backtick, so prose, inline code and most string literals that
// only mention the convention stay out. A lone * as the first thing on a line counts too (inside a block comment).
// In Markdown, reStructuredText and AsciiDoc files only an HTML comment counts. A closer (*/, -->, ]], %> and the
// rest) is cut from the text only when it belongs to the opener the marker used.
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, realpathSync } from 'node:fs';
import { extname, isAbsolute, join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const MAX_BYTES = 64 * 1024 * 1024;
const MARK = 'shortcut:';
const MAX_WORD = 16;
const OPENERS = ['//', '//!', '#', '#=', '#!', '/*', '/**', '/*!', '--', '--[[', ';', '%', '<!--', '{-', '(*', 'rem'];
const PROSE_OPENERS = ['<!--'];
const PROSE = new Set(['.md', '.markdown', '.mdx', '.rst', '.adoc']);
// Printable ASCII punctuation without the quotes and the backtick: the only characters allowed before an opener.
const PUNCT = '!#$%&()*+,-./:;<=>?@[\\]^_{|}~';
// The closer that belongs to each opening word, by how the word ends. A closer is cut only after its own opener, so
// "arr[i[j]]" after # or "50%>" after % keep their text.
const CLOSERS = [['--[[', ']]'], ['{{!--', '--}}'], ['<!--', '-->'], ['<%#', '%>'], ['{#', '#}'], ['#=', '=#'],
  ['{-', '-}'], ['(*', '*)'], ['/*', '*/'], ['/**', '*/'], ['/*!', '*/']];
const ESCAPES = new Map([['\n', '\\n'], ['\r', '\\r'], ['\t', '\\t']]);

const isBlank = (c) => c === ' ' || c === '\t';
const isDigit = (c) => c !== undefined && c >= '0' && c <= '9';

function opens(word, openers) {
  const lower = word.toLowerCase();
  return openers.some((o) => lower.endsWith(o) && [...lower.slice(0, -o.length)].every((c) => PUNCT.includes(c)));
}

function markerText(rest, closer) {
  const cut = closer ? rest.indexOf(closer) : -1;
  return (cut < 0 ? rest : rest.slice(0, cut)).trim();
}

/** Control characters (0x00 to 0x1f and 0x7f) written as escapes, so printed text cannot forge a row or color it. */
export function escapeControl(text) {
  return text.replace(/[\x00-\x1f\x7f]/g, (c) => ESCAPES.get(c) || `\\x${c.charCodeAt(0).toString(16).padStart(2, '0')}`);
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
    const rest = line.slice(at + MARK.length);
    if (!prose && word === '*' && start === indent) return markerText(rest, '*/');
    if (opens(word, openers)) {
      const lower = word.toLowerCase();
      return markerText(rest, CLOSERS.find(([o]) => lower.endsWith(o))?.[1]);
    }
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
  body.split(/\r\n|\r|\n/).forEach((raw, i) => {
    if (!raw.includes(MARK)) return;
    const found = findMarker(raw, prose);
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

const inside = (root, path) => {
  const rel = relative(root, path);
  return rel !== '' && rel !== '..' && !rel.startsWith('..' + sep) && !isAbsolute(rel);
};

/**
 * Every marker under the folder as { file, line, text, trigger }, and a warning per regular file it skipped because
 * it is over maxBytes or could not be read. A file whose real path leaves the folder (a parent folder that became a
 * symlink) is skipped.
 */
export function ledger(folder, files = listFiles(folder), { maxBytes = MAX_BYTES } = {}) {
  const rows = [];
  const warnings = [];
  const root = realpathSync.native(folder);
  for (const file of files) {
    const full = join(folder, file);
    let size;
    try {
      const st = lstatSync(full);
      if (!st.isFile() || !inside(root, realpathSync.native(full))) continue;
      size = st.size;
    } catch {
      continue; // listed but gone from disk
    }
    if (size > maxBytes) {
      warnings.push(`debt.mjs: ${escapeControl(file)} is over ${maxBytes} bytes, skipped.`);
      continue;
    }
    let buf;
    try {
      buf = readFileSync(full);
    } catch (e) {
      warnings.push(`debt.mjs: could not read ${escapeControl(file)} (${e.code || e.message}), skipped.`);
      continue;
    }
    if (buf.includes(0)) continue;
    for (const r of scanText(buf.toString('utf8'), file)) rows.push({ file, ...r, trigger: hasTrigger(r.text) });
  }
  return { rows, warnings };
}

/** The report text: one row per marker, then the summary line. */
export function format(rows) {
  const out = rows.map((r) => `${escapeControl(r.file)}:${r.line}:${r.text ? ` ${escapeControl(r.text)}` : ''}` +
    (r.trigger ? '' : ' [no-trigger]'));
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
