// The session part of friction.mjs, counting: each signal of friction that repeats, per kind, with a few pointers
// (<folder>/<file>:<line>) to where it happened. A count is a lead, not evidence.
import nodePath from 'node:path';
import {
  READ_REPEAT_MIN, SHELL_REPEAT_MIN, POINTERS_PER_SIGNAL, BIG_RESULT_CHARS, FAILURE_CHARS, TARGETED, show, plural,
} from './friction-show.mjs';

const EDITS = new Set(['Edit', 'Write', 'MultiEdit', 'NotebookEdit']);
const SEARCHES = new Set(['grep', 'rg', 'find', 'fd', 'ag', 'ls']);
// What Grep and Glob return when nothing matched, and what a Bash search that found nothing leaves.
const EMPTY_TOOL = new Set(['No matches found', 'No files found']);
const EMPTY_BASH = new Set(['(Bash completed with no output)', '0']);
// How a Write that made a new file starts its result; a Write over a file says "The file ... has been updated".
const CREATED = 'File created successfully at:';
// Words in front of the command that do not change which command it is.
const RUNNERS = [['npx'], ['python', '-m'], ['python3', '-m'], ['uv', 'run'], ['poetry', 'run'], ['pnpm', 'exec'], ['time']];

/** The words of each part of a shell command: split on &&, ||, ;, | and newlines, a leading cd and runners stripped. */
export function commandParts(command) {
  return String(command ?? '').split(/&&|\|\||;|\||\n/).map((part) => {
    let w = part.trim().split(/\s+/).filter(Boolean);
    for (let again = true; again && w.length;) {
      again = true;
      const runner = RUNNERS.find((r) => r.every((t, i) => w[i] === t));
      if (w[0] === 'cd') w = w.slice(2);
      else if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(w[0])) w = w.slice(1);
      else if (runner) w = w.slice(runner.length);
      else again = false;
    }
    return w;
  }).filter((w) => w.length);
}

const isSearch = (words) => SEARCHES.has(words[0]);
const READERS = new Set(['cat', 'head', 'tail', 'nl']);
// A heredoc's body is text, not commands: only its first line is kept.
const HEREDOC = /(<<-?\s*(['"]?)([A-Za-z_]\w*)\2[^\n]*)\n(?:[\s\S]*?\n)?[ \t]*\3[ \t]*(?=\n|$)/g;
// A command that writes a file: a heredoc, or an output redirection once quotes, 2>&1, >&2 and stderr-only ones are gone.
const writes = (text) => /<<|>/.test(text.replace(/'[^']*'|"[^"]*"/g, '').replace(/\d*>&\d+|(^|\s)2>>?\s*\S+/g, ''));
/**
 * Whether a shell command reads or searches: the first command of some | chain is a search, a reader or sed -n, and
 * does not write a file. So "npm test 2>&1 | tail -5", "cat > notes.md <<'EOF'" and "sed -i -n ..." are not reads.
 * The searches-before-the-first-edit signal keeps its own rule.
 */
const readsOrSearches = (command) => String(command ?? '').replace(HEREDOC, '$1').split(/&&|\|\||;|\n/).some((piece) => {
  const first = piece.split('|')[0];
  const w = commandParts(first)[0] || [];
  if (writes(first)) return false;
  return isSearch(w) || READERS.has(w[0]) || (w[0] === 'sed' && w.includes('-n') && !w.some((x) => /^-[A-Za-z]*i|^--in-place/.test(x)));
});
/** Whether a part runs the check: it starts with one of the check's spellings, and holds the word the check needs. */
export const runsCheck = (words, c) => c.spellings.some((sp) => sp.every((t, i) => words[i] === t)) && (!c.need || words.includes(c.need));

// Failure classes, matched on the full result text in this order. The refusal shapes: the one seen in this
// repository's own transcripts is the worktree guard of Claude Code ("This agent is isolated in the worktree ...
// Refusing to run it"); the user's rejection ("doesn't want to proceed", "tool use was rejected"), a permission rule
// ("Permission to use ... has been denied", "haven't granted it yet") and a hook that blocks a call are the other
// shapes Claude Code writes. A hook that fails or blocks a call starts its result with the event and "hook error:"
// ("PreToolUse:Bash hook error: ..."), or says "hook blocking error"; the user's rejection can also read "doesn't want
// to take this action". A refusal is printed as its class only.
const REFUSED = [
  /Permission denied|EACCES|doesn't want to (proceed|take this action)|tool use was rejected|Permission to use .{1,200}denied|haven't granted|permission rule/i,
  /^[A-Z][A-Za-z]+(:\S+)? hook error:|hook blocking error|\bhook\b.{0,80}\b(denied|blocked|refused)|blocked by .{0,40}hook/im,
  /is isolated in the worktree|Refusing to run it/,
];
const CLASSES = [
  ['refused', { test: (text) => REFUSED.some((re) => re.test(text)) }],
  ['network', /Could not resolve host|ECONNREFUSED|ETIMEDOUT|getaddrinfo|\bHTTP(\/[\d.]+)?\s*(error\s*)?(401|403|407)\b|status code (401|403|407)\b|returned error:?\s*(401|403|407)\b|\b(401|403|407) (Unauthorized|Forbidden|Proxy)/i],
  // "File does not exist" is how Read reports a missing file.
  ['not found', /command not found|No such file or directory|ENOENT|not recognized|File does not exist/i],
];
export const CLASS_NAMES = [...CLASSES.map(([name]) => name), 'other'];
export const classOf = (text) => (CLASSES.find(([, re]) => re.test(text)) || ['other'])[0];

/** The first line of a failure that is not "Exit code N", redacted, then cut. */
export function failureLine(text) {
  const line = String(text).replace(/<\/?tool_use_error>/g, '').split(/\r?\n/).find((l) => l.trim() && !/^\s*Exit code \d+\s*$/.test(l)) ?? '';
  return show(line.slice(0, 4096), FAILURE_CHARS);
}

const signal = () => ({ n: 0, sessions: new Set(), pointers: [] });

const fold = (p, platform = process.platform) => (platform === 'win32' ? p.toLowerCase() : p);
/**
 * A path resolved against the repository (roots[0]), or null when it is not inside one of the roots. Every root is
 * resolved with the same path API first: Git for Windows prints a root with forward slashes. A test passes path.win32.
 */
export function inProject(roots, path, api = nodePath, platform = process.platform) {
  if (typeof path !== 'string' || !path) return null;
  const full = api.resolve(roots[0], path);
  const f = fold(full, platform);
  return roots.some((r) => {
    const root = fold(api.resolve(r), platform);
    return f === root || f.startsWith(root.endsWith(api.sep) ? root : root + api.sep);
  }) ? full : null;
}

/** Every signal over the sessions read (readSession) and the check commands the project defines (readProject). */
export function countSignals(sessions, checks, roots) {
  const s = {
    N: sessions.length, searchFirst: signal(), emptySearch: signal(), readRepeat: signal(), pieces: signal(), created: signal(), hops: [], noCheck: signal(), big: signal(), shellRepeat: signal(),
    classes: new Map(CLASS_NAMES.map((c) => [c, signal()])), runs: new Map(checks.map((c) => [c, { ...signal(), failed: 0 }])),
    failedByTool: new Map(), calls: [],
  };
  const hit = (sig, key, p) => {
    sig.n++;
    sig.sessions.add(key);
    if (sig.pointers.length < POINTERS_PER_SIGNAL) sig.pointers.push(p);
  };
  for (const session of sessions) {
    const key = session.key;
    let calls = 0;
    let firstEdit = null;
    let ranCheck = false;
    for (const t of session.transcripts) {
      const editAt = t.calls.findIndex((c) => EDITS.has(c.tool));
      const reads = new Map();
      const repeats = new Map();
      const ranges = new Map();
      const folders = new Set();
      let looked = 0;
      t.calls.forEach((c, i) => {
        calls++;
        const at = (line, note = '') => ({ where: t.where, line, tool: c.tool, target: c.target, agent: t.agent, note });
        const parts = c.tool === 'Bash' ? commandParts(c.input.command) : [];
        const text = c.result ? c.result.text.trim() : null;
        if ((c.tool === 'Grep' || c.tool === 'Glob' || parts.some(isSearch)) && i < editAt) hit(s.searchFirst, key, at(c.line));
        if (text !== null && (((c.tool === 'Grep' || c.tool === 'Glob') && EMPTY_TOOL.has(text)) || (parts.some(isSearch) && EMPTY_BASH.has(text)))) {
          hit(s.emptySearch, key, at(c.result.line));
        }
        if (c.tool === 'Read') {
          const k = [c.input.file_path, c.input.offset ?? '', c.input.limit ?? ''].join('\0');
          reads.set(k, (reads.get(k) || 0) + 1);
          if (reads.get(k) === READ_REPEAT_MIN) hit(s.readRepeat, key, at(c.line));
          const file = inProject(roots, c.input.file_path);
          if (file && (c.input.offset != null || c.input.limit != null)) {
            const seen = ranges.get(file) || new Set();
            ranges.set(file, seen.add(`${c.input.offset ?? ''}\0${c.input.limit ?? ''}`));
            if (seen.size === 2) hit(s.pieces, key, at(c.line));
          }
        }
        if (c.tool === 'Read' || c.tool === 'Grep' || c.tool === 'Glob' || (c.tool === 'Bash' && readsOrSearches(c.input.command))) looked++;
        // An edit of the project, whatever its result: the first one in a folder records the reads and searches before
        // it, and every one starts the count again. An edit outside the project (a scratch file) does neither.
        const edited = EDITS.has(c.tool) && inProject(roots, c.tool === 'NotebookEdit' ? c.input.notebook_path : c.input.file_path);
        if (edited) {
          const folder = fold(nodePath.dirname(edited));
          if (!folders.has(folder)) s.hops.push({ key, n: looked, p: at(c.line, `(reads and searches before it: ${looked})`) });
          folders.add(folder);
          looked = 0;
        }
        // A subagent line has no toolUseResult when a Write succeeds, so the result text decides.
        if (c.tool === 'Write' && text?.startsWith(CREATED) && inProject(roots, c.input.file_path)) hit(s.created, key, at(c.line));
        if (EDITS.has(c.tool)) {
          firstEdit ||= at(c.line);
          repeats.clear();
        }
        if (c.tool === 'Bash') {
          const full = String(c.input.command ?? '').replace(/\s+/g, ' ').trim();
          repeats.set(full, (repeats.get(full) || 0) + 1);
          if (repeats.get(full) === SHELL_REPEAT_MIN) hit(s.shellRepeat, key, at(c.line));
          for (const [check, sig] of s.runs) {
            if (!parts.some((w) => runsCheck(w, check))) continue;
            ranCheck = true;
            hit(sig, key, at(c.line));
            if (c.result?.isError) sig.failed++;
          }
        }
        if (c.result && c.result.size > BIG_RESULT_CHARS) hit(s.big, key, at(c.result.line, `(${c.result.size} characters)`));
        if (c.result?.isError) {
          s.failedByTool.set(c.tool, (s.failedByTool.get(c.tool) || 0) + 1);
          const cls = classOf(c.result.text);
          hit(s.classes.get(cls), key, at(c.result.line, cls === 'refused' ? 'refused' : `failed: ${failureLine(c.result.text)}`));
        }
      });
    }
    if (firstEdit && !ranCheck) hit(s.noCheck, key, firstEdit);
    s.calls.push({ key, where: `${session.session.folder}/${session.session.id}.jsonl`, n: calls });
  }
  return s;
}

const tag = (p) => (p.agent ? ` (subagent: ${show(p.agent, 40)})` : '');

/** A pointer: <folder>/<file>:<line>, the tool, its target for the tools in TARGETED, a note, and the subagent tag. */
export function pointerLine(p) {
  const target = TARGETED.has(p.tool) && p.target ? ` ${show(p.target)}` : '';
  return `  ${show(p.where, 200)}:${p.line} ${show(p.tool, 60)}${target}${p.note ? ` ${p.note}` : ''}${tag(p)}`;
}

function median(ns) {
  if (!ns.length) return 0;
  const v = [...ns].sort((a, b) => a - b);
  const m = Math.floor(v.length / 2);
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

/** commits: { from, to, n } with n from newFilesInCommits (friction-project.mjs), or null when no session was read. */
export function printSignals(s, project, out, commits) {
  const count = (label, sig, extra = '') => {
    out(`${label}: ${sig.n} in ${sig.sessions.size} of ${plural(s.N, 'session')}${extra}`);
    for (const p of sig.pointers) out(pointerLine(p));
  };
  out('## navigation');
  count('searches before the first edit, in transcripts that edit', s.searchFirst);
  count('searches that found nothing', s.emptySearch);
  count(`same file and range read ${READ_REPEAT_MIN} or more times in one transcript`, s.readRepeat);
  count('files read in pieces (2 or more Read ranges of one file, in one transcript)', s.pieces);
  count('new files made with Write, inside the project', s.created);
  if (!commits) out('new files in commits: not counted (no session read)');
  else if (commits.n === null) out('new files in commits: not counted (git log failed)');
  else out(`new files in commits from ${show(commits.from, 10)} to ${show(commits.to, 10)} (git log --diff-filter=A, without merges, renames and root commits): ${commits.n}`);
  const hops = 'reads and searches before the first edit in each folder, in transcripts that edit the project';
  if (!s.hops.length) out(`${hops}: none`);
  else {
    const ns = s.hops.map((h) => h.n);
    out(`${hops}: median ${median(ns)}, maximum ${ns.reduce((a, b) => Math.max(a, b))}, over ${plural(ns.length, 'folder')} in ${new Set(s.hops.map((h) => h.key)).size} of ${plural(s.N, 'session')}`);
    // Most first; sort is stable, so ties stay in file order.
    for (const h of [...s.hops].sort((a, b) => b.n - a.n).slice(0, POINTERS_PER_SIGNAL)) out(pointerLine(h.p));
  }
  out('## automated checks');
  if (!s.runs.size) out('runs of checks: the project defines no check command this script knows');
  for (const [check, sig] of s.runs) count(`runs of ${check.cmd}`, sig, `; failed: at least ${sig.failed} (a lower bound: only is_error counts, and a pipe hides the exit code)`);
  if (s.runs.size) count('sessions that edited and ran no check', s.noCheck);
  else out('sessions that edited and ran no check: not counted (no known check command)');
  const never = [...s.runs].filter(([, sig]) => !sig.n).map(([c]) => c.cmd);
  out(`checks no session ran: ${never.length ? never.join(', ') : 'none'}`);
  const unwired = project.checks.filter((c) => !c.wired.length).map((c) => c.cmd);
  out(`unwired checks (no CI file, pre-commit config or Claude Code hook names them): ${unwired.length ? unwired.join(', ') : 'none'}`);
  out('## tool economy');
  count(`results over ${BIG_RESULT_CHARS} characters`, s.big);
  count(`same command ${SHELL_REPEAT_MIN} or more times with no edit between, in one transcript`, s.shellRepeat);
  const failed = [...s.failedByTool].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([t, n]) => `${show(t, 60)} ${n}`);
  out(`failed calls per tool: ${failed.length ? failed.join(', ') : 'none'}`);
  const most = s.calls.reduce((a, b) => (b.n > (a?.n ?? -1) ? b : a), null);
  out(`calls per session: median ${median(s.calls.map((c) => c.n))}, maximum ${most ? `${most.n} (${show(most.where, 200)})` : 0}`);
  out('## information access');
  for (const [cls, sig] of s.classes) count(`failed calls, ${cls}`, sig);
}
