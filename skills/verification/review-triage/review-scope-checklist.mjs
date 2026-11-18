// The checklist part of review-scope.mjs: the added lines of a diff, and which checklist entries a change triggers.
// It runs no git and reads no file. A trigger regex is the project's own text, so it runs in node:vm with a time limit,
// and an entry whose regex runs out of time counts as triggered: it is never skipped.
import vm from 'node:vm';
import { CONFIG_FILE, REGEX_TIMEOUT_MS, anyMatch } from './review-scope-rules.mjs';

export { REGEX_TIMEOUT_MS };

/** Split text into lines on \n; each loses one trailing \r, and a final newline adds no empty last line. */
export function splitLines(text) {
  const lines = String(text).split('\n');
  if (lines[lines.length - 1] === '') lines.pop();
  return lines.map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
}

const ESCAPES = new Map([['a', 7], ['b', 8], ['t', 9], ['n', 10], ['v', 11], ['f', 12], ['r', 13], ['"', 34], ['\\', 92]]);

/** Undo git's C quoting of a path: `"caf\303\251 \"q\""` becomes `café "q"`. Octal escapes are UTF-8 bytes, and a raw
 * character (core.quotePath=false) is encoded as UTF-8. A path that is not quoted comes back as it is. */
export function unquotePath(s) {
  if (s.length < 2 || s[0] !== '"' || !s.endsWith('"')) return s;
  const enc = new TextEncoder();
  const chars = [...s.slice(1, -1)];
  const bytes = [];
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] !== '\\' || i + 1 === chars.length) { bytes.push(...enc.encode(chars[i])); continue; }
    const oct = chars.slice(i + 1, i + 4).join('');
    if (/^[0-7]{3}$/.test(oct)) { bytes.push(parseInt(oct, 8) & 255); i += 3; continue; }
    const c = chars[++i];
    if (ESCAPES.has(c)) bytes.push(ESCAPES.get(c)); else bytes.push(...enc.encode(c));
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

/** The path of a `+++ ` line: one trailing tab dropped (git adds it when the path holds a space), unquoted, and the
 * `b/` prefix removed. A deleted file (`/dev/null`) or a path without the prefix has none. */
function targetPath(raw) {
  const p = unquotePath(raw.endsWith('\t') ? raw.slice(0, -1) : raw);
  return p.startsWith('b/') ? p.slice(2) : null;
}

const HUNK = /^@@ -\d+(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** Parse `git diff -U0 --src-prefix=a/ --dst-prefix=b/` output into a Map from path to [{ line, text }]: the added
 * lines, numbered in the new file. Each hunk is read for as many lines as its header counts, so a content line that
 * reads like a header (an added `++ b/x`, a removed SQL comment `-- x`) stays content. */
export function parseAddedLines(diffText) {
  const out = new Map();
  let path = null;
  let oldLeft = 0;
  let newLeft = 0;
  let n = 0;
  for (const line of splitLines(diffText)) {
    if (oldLeft > 0 || newLeft > 0) {
      if (line[0] === '+') {
        if (path !== null) { if (!out.has(path)) out.set(path, []); out.get(path).push({ line: n, text: line.slice(1) }); }
        n++; newLeft--;
      } else if (line[0] === '-') oldLeft--;
      else if (line[0] === ' ') { n++; oldLeft--; newLeft--; }
      // Anything else, such as "\ No newline at end of file", is not content and counts on neither side.
      continue;
    }
    if (line.startsWith('--- ')) path = null;
    else if (line.startsWith('+++ ')) path = targetPath(line.slice(4));
    else {
      const h = HUNK.exec(line);
      if (h) { oldLeft = h[1] === undefined ? 1 : Number(h[1]); n = Number(h[2]); newLeft = h[3] === undefined ? 1 : Number(h[3]); }
    }
  }
  return out;
}

// Runs inside the vm context. `source`, `flags` and `texts` are data put into the context; no project text is code.
const FIND_FIRST = `(() => {
  const re = new RegExp(source, flags);
  for (let i = 0; i < texts.length; i++) if (re.test(texts[i])) return i;
  return -1;
})()`;

/** The index of the first text the regex matches, or -1. Throws ERR_SCRIPT_EXECUTION_TIMEOUT past the time limit. */
function findFirst(source, flags, texts) {
  return vm.runInContext(FIND_FIRST, vm.createContext({ source, flags, texts }), { timeout: REGEX_TIMEOUT_MS });
}

/** The checklist entries a change triggers, in configuration order, as { entry, check, why, by, timedOut }.
 * `files` are the changed files ({ path, ... }, in path order) and `added` the Map from parseAddedLines. A path trigger
 * matches any changed file, a deleted one too; a regex is tested on the added lines, only of the files the globs
 * match when there are globs. `by` lists the matched paths for a path trigger, or `<path>:<line>` of the first match
 * (files in order, then lines in order) for a regex. The rules file itself never triggers an entry. */
export function matchChecklist(entries, files, added) {
  const paths = files.filter((f) => f.path !== CONFIG_FILE).map((f) => f.path);
  return entries.flatMap((e, i) => {
    const t = e.trigger;
    const hit = (by, timedOut = false) => [{ entry: i + 1, check: e.check, why: e.why, by, timedOut }];
    const inGlobs = t.paths ? paths.filter(anyMatch(t.paths)) : paths;
    if (!t.added) return inGlobs.length ? hit(inGlobs) : [];
    const where = [];
    const texts = [];
    for (const p of inGlobs) for (const { line, text } of added.get(p) || []) { where.push(`${p}:${line}`); texts.push(text); }
    if (texts.length === 0) return [];
    try {
      const at = findFirst(t.added, t.flags === 'i' ? 'i' : '', texts);
      return at < 0 ? [] : hit([where[at]]);
    } catch (err) {
      if (err.code !== 'ERR_SCRIPT_EXECUTION_TIMEOUT') throw err;
      return hit([], true);
    }
  });
}
