#!/usr/bin/env node
/**
 * The decision log of an overnight run: one TSV row per decision, appended and never rewritten.
 *
 *   node log.mjs append <log> --phase <text> --decision <text> --reason <text> --evidence <text> --result <text>
 *        [--run <session id or run label>] [--supersedes <row id>]
 *       Appends one row, creating the file and its folder with the header when the file is missing or empty.
 *       Columns: id, time, run, phase, decision, reason, evidence, result, supersedes. The id is one more than the
 *       highest id so far (the first is 1). The time is the machine clock, in UTC, in ISO 8601; there is no option
 *       to set it. --run defaults to $CLAUDE_CODE_SESSION_ID when that is set, so the audit can find the transcript
 *       of each row. --supersedes names an earlier row this one corrects; that row stays as it was.
 *
 *   node log.mjs show <log> [--last <n>]
 *       Prints the rows (or the last n) as a Markdown table, with a column naming the row that supersedes each one,
 *       then a count of rows, superseded rows and runs.
 *
 *   node log.mjs calls <transcript.jsonl>
 *       Lists the tool calls and the failed tool results of a Claude Code transcript (a session file under
 *       ~/.claude/projects/, or a --output-format stream-json capture), one per line: the line number in the file,
 *       the time when the event has one, the message id (calls with the same id were sent together, in one message),
 *       the tool and its input cut to 300 characters; or ERROR, the id of the call it answers, and the result. The
 *       morning reviewer cites <file>:<line> from it. Read only; lines that are not JSON are skipped.
 *
 * Every free text field (run, phase, decision, reason, evidence, result) is cleaned, as upstream log.sh does, in this
 * order: tabs, carriage returns, newlines and other control or line separator characters become spaces, so a row
 * stays one line with the right number of fields; then a value a spreadsheet would read as a formula gets a single
 * quote in front. That is a value matching FORMULA: =, +, - or @ first, after any spaces and after one double quote
 * (a quote-aware TSV reader strips the quotes from "=1+1"). Guarding after flattening means no control character in
 * front can hide the sign.
 *
 * append refuses, and writes nothing, when: a required field is missing or empty after flattening; --supersedes names
 * no row in the log; the log is inside a git work tree (a .git folder or file at or above the path, its resolved
 * folder, or where a link leads), where git reset --hard or git clean -fdx could erase it; the file's first line is
 * not the header, its last line has no newline, or a row has the wrong number of fields.
 *
 * Earlier rows are never rewritten: the file is only ever opened for appending, with one append call per row, so a
 * row another writer appends between this call's read and its write survives.
 * Two writers at once (the run and the morning reviewer) can read the same highest id and both write the next one.
 * That risk is accepted: the two rows still both land, and a duplicate id is visible in show. Let one writer at a
 * time append.
 *
 * Exit codes: 0 done; 1 refused or a file error; 2 usage (unknown command or option, a missing or bad value).
 * Node 20+, standard library only.
 */
import { appendFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const HEADER = ['id', 'time', 'run', 'phase', 'decision', 'reason', 'evidence', 'result', 'supersedes'];
export const REQUIRED = ['run', 'phase', 'decision', 'reason', 'evidence', 'result'];
const OPTIONS = [...REQUIRED, 'supersedes'];

class Refusal extends Error {}
class Usage extends Error {}
const at = (row, name) => row[HEADER.indexOf(name)];

// ---------------------------------------------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------------------------------------------

/** A value a spreadsheet would run as a formula, once flattened: a sign first, after spaces and one double quote. */
export const FORMULA = /^\s*"?\s*[=+\-@]/;

/** A single quote in front of a value a spreadsheet would run as a formula. The check reads the value flattened. */
export function guardCell(value) {
  const v = String(value);
  return FORMULA.test(flatten(v)) ? `'${v}` : v;
}

/** Tabs, carriage returns, newlines and other control or line separator characters become spaces. */
export function flatten(value) {
  return String(value).replace(/[\u0000-\u001f\u007f\u0085\u2028\u2029]/g, ' ');
}

/** What append writes for a free text field: flattened first, so no control character can hide a formula, then guarded. */
export function cleanCell(value) {
  return guardCell(flatten(value));
}

/**
 * The folder holding a .git entry at or above the path, or null. Checks the path as given, its folder as resolved,
 * and, when the path is a link, the file the link leads to (or would create, for a link to nothing).
 */
export function insideGitTree(path) {
  const walk = (start) => {
    for (let dir = start; ; dir = dirname(dir)) {
      if (existsSync(join(dir, '.git'))) return dir;
      if (dirname(dir) === dir) return null;
    }
  };
  const walkResolved = (file) => {
    let existing = dirname(file);
    while (!existsSync(existing) && dirname(existing) !== existing) existing = dirname(existing);
    try { return walk(realpathSync(existing)); } catch { return null; }
  };
  const abs = resolve(path);
  let target = abs;
  try {
    if (existsSync(abs)) target = realpathSync(abs);
    else if (lstatSync(abs).isSymbolicLink()) target = resolve(dirname(abs), readlinkSync(abs));
  } catch { /* no such file: nothing to follow */ }
  return walk(dirname(abs)) ?? walkResolved(abs) ?? walk(dirname(target)) ?? walkResolved(target);
}

/** ISO 8601 in UTC, to the second. */
const stamp = (now) => now.toISOString().replace(/\.\d{3}Z$/, 'Z');

// ---------------------------------------------------------------------------------------------------------------
// The file
// ---------------------------------------------------------------------------------------------------------------

/** Read and check an existing log: its rows as arrays of fields (no header); [] when the file is missing or empty. */
export function readLog(log) {
  return parseLog(log, existsSync(log) ? readFileSync(log, 'utf8') : '');
}

/** Check the text of a log and return its rows. */
function parseLog(log, text) {
  if (text === '') return [];
  if (!text.endsWith('\n')) throw new Refusal(`${log} does not end with a newline; the last row was cut or edited by hand, so appending would join two rows`);
  const lines = text.slice(0, -1).split('\n');
  if (lines[0] !== HEADER.join('\t')) throw new Refusal(`${log} does not start with the header (${HEADER.join(', ')}); it is not an overnight decision log`);
  return lines.slice(1).map((line, i) => {
    const f = line.split('\t');
    if (f.length !== HEADER.length) throw new Refusal(`row ${i + 1} of ${log} has ${f.length} fields, not ${HEADER.length}; the file was edited by hand`);
    return f;
  });
}

/**
 * Append one row. fields holds the free text fields and an optional supersedes id (a string of digits). now is the
 * clock; only a caller in code can pass another one. beforeWrite, for tests, runs between the read and the write.
 * Returns { id, row }.
 */
export function appendRow(log, fields, now = new Date(), { beforeWrite } = {}) {
  const cells = {};
  for (const name of REQUIRED) {
    const value = cleanCell(fields[name] ?? '');
    if (!flatten(fields[name] ?? '').trim()) throw new Refusal(`--${name} is missing or empty; every row needs ${REQUIRED.map((n) => `--${n}`).join(', ')}`);
    cells[name] = value;
  }
  const repo = insideGitTree(log);
  if (repo) throw new Refusal(`${resolve(log)} is inside the git work tree at ${repo}; git reset --hard or git clean -fdx could erase it. Put the log in a folder outside any git repository`);
  const text = existsSync(log) ? readFileSync(log, 'utf8') : '';
  const rows = parseLog(log, text);
  const ids = rows.map((r) => Number(at(r, 'id'))).filter(Number.isInteger);
  const supersedes = fields.supersedes ?? '';
  if (supersedes && !rows.some((r) => at(r, 'id') === supersedes)) {
    throw new Refusal(`--supersedes ${supersedes}: there is no row ${supersedes} in ${log}; name the id of the row this one corrects`);
  }
  const id = Math.max(0, ...ids) + 1;
  const row = [String(id), stamp(now), cells.run, cells.phase, cells.decision, cells.reason, cells.evidence, cells.result, supersedes];
  const fresh = text === '';
  mkdirSync(dirname(resolve(log)), { recursive: true });
  beforeWrite?.();
  appendFileSync(log, (fresh ? HEADER.join('\t') + '\n' : '') + row.join('\t') + '\n');
  return { id, row };
}

// ---------------------------------------------------------------------------------------------------------------
// Command line
// ---------------------------------------------------------------------------------------------------------------

const USAGE = 'usage: log.mjs append <log> --phase <p> --decision <d> --reason <r> --evidence <e> --result <r> [--run <id>] [--supersedes <row id>]\n       log.mjs show <log> [--last <n>]\n       log.mjs calls <transcript.jsonl>';

export function parseArgs(argv) {
  const [cmd, log, ...opts] = argv;
  if (!['append', 'show', 'calls'].includes(cmd)) throw new Usage(cmd ? `unknown command ${cmd}` : 'no command');
  if (!log || log.startsWith('--')) throw new Usage(`${cmd} needs the path of the ${cmd === 'calls' ? 'transcript' : 'decision log'}`);
  const allowed = cmd === 'append' ? OPTIONS : cmd === 'show' ? ['last'] : [];
  const fields = {};
  for (let i = 0; i < opts.length; i += 2) {
    const name = opts[i].replace(/^--/, '');
    if (!opts[i].startsWith('--') || !allowed.includes(name)) throw new Usage(`unknown option ${opts[i]} for ${cmd}`);
    if (i + 1 >= opts.length) throw new Usage(`${opts[i]} needs a value`);
    if (name in fields) throw new Usage(`${opts[i]} given twice`);
    fields[name] = opts[i + 1];
  }
  if ('supersedes' in fields && !/^[1-9]\d*$/.test(fields.supersedes)) throw new Usage(`--supersedes must be a row id (a whole number from 1), not ${JSON.stringify(fields.supersedes)}`);
  if ('last' in fields && !/^[1-9]\d*$/.test(fields.last)) throw new Usage(`--last must be a whole number from 1, not ${JSON.stringify(fields.last)}`);
  return { cmd, log, fields };
}

function show(log, last, out) {
  if (!existsSync(log)) throw new Refusal(`${log} does not exist`);
  const rows = readLog(log);
  const by = new Map();
  for (const r of rows) if (at(r, 'supersedes')) by.set(at(r, 'supersedes'), [...(by.get(at(r, 'supersedes')) ?? []), at(r, 'id')]);
  const cell = (s) => s.replace(/\|/g, '\\|');
  out(`| ${HEADER.join(' | ')} | superseded by |`);
  out(`|${[...HEADER, ''].map(() => '---').join('|')}|`);
  for (const r of last ? rows.slice(-last) : rows) out(`| ${[...r, (by.get(at(r, 'id')) ?? []).join(', ')].map(cell).join(' | ')} |`);
  out('');
  const runs = [...new Set(rows.map((r) => at(r, 'run')))];
  out(`${rows.length} rows, ${rows.filter((r) => by.has(at(r, 'id'))).length} superseded; runs: ${runs.join(', ') || 'none'}`);
  return 0;
}

function calls(file, out) {
  if (!existsSync(file)) throw new Refusal(`${file} does not exist`);
  const cut = (v) => JSON.stringify(v ?? '').slice(0, 300);
  readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
    let e;
    try { e = JSON.parse(line); } catch { return; }
    const content = e?.message?.content;
    if (!Array.isArray(content)) return;
    for (const c of content) {
      if (c?.type === 'tool_use') out([i + 1, e.timestamp, e.message.id, c.name, cut(c.input)].filter((x) => x !== undefined && x !== '').join(' '));
      else if (c?.type === 'tool_result' && c.is_error) out([i + 1, 'ERROR', c.tool_use_id, cut(c.content)].filter((x) => x !== undefined && x !== '').join(' '));
    }
  });
  return 0;
}

export function main(argv, out = console.log, err = console.error, env = process.env) {
  let opts;
  try { opts = parseArgs(argv); } catch (e) { err(`${e.message}\n${USAGE}`); return 2; }
  try {
    if (opts.cmd === 'calls') return calls(opts.log, out);
    if (opts.cmd === 'show') return show(opts.log, opts.fields.last ? Number(opts.fields.last) : 0, out);
    const fields = { ...opts.fields };
    if (fields.run === undefined && env.CLAUDE_CODE_SESSION_ID) fields.run = env.CLAUDE_CODE_SESSION_ID;
    const { id } = appendRow(opts.log, fields);
    out(`appended row ${id}${fields.supersedes ? ` (supersedes row ${fields.supersedes})` : ''} to ${resolve(opts.log)}`);
    return 0;
  } catch (e) {
    err(e instanceof Refusal ? `refused: ${e.message}` : `failed: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exit(main(process.argv.slice(2)));
}
