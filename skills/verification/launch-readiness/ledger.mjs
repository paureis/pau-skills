#!/usr/bin/env node
/**
 * The READINESS.md ledger of the launch-readiness skill. Node standard library only. Run "help" for the commands.
 * Every command takes --root <dir> (default: the git top level of the current folder) and --now <ISO date>.
 *
 * Profile input: {"profile": {...}, "stage": 1|2|3, "regulated": bool, "files": [the manifests it was read from]}.
 * Row input: a JSON array of {id, area, stage (1 to 4, the first stage that needs the check), severity (must-fix |
 * can-wait), status, source (code | command | answer), evidence, files: [paths], expires (YYYY-MM-DD), date}. A row
 * whose id is in the ledger replaces it; nothing is written when any row breaks a rule.
 *
 * Statuses: pass, fail, likely (a security suspect with no probe), unknown, n/a, recheck. Closed: pass or n/a, with
 * any expiry not passed. Ready for stage N: every must-fix row for stages 1 to N, plus the stage 4 rows when
 * regulated data is added, is closed. The ledger is the first table whose header is COLUMNS plus the fenced block
 * opened by "```json launch-readiness"; the rest of the file, and every row line not changed, stays byte for byte.
 */
import { readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const COLUMNS = ['id', 'area', 'stage', 'severity', 'status', 'source', 'evidence', 'files', 'date', 'expires'];
export const STATUSES = ['pass', 'fail', 'likely', 'unknown', 'n/a', 'recheck'];
export const SEVERITIES = ['must-fix', 'can-wait'];
export const SOURCES = ['code', 'command', 'answer'];
export const STAGE_NAMES = { 1: 'private beta', 2: 'paying customers', 3: 'enterprise buyers', 4: 'regulated data' };
const META_OPEN = '```json launch-readiness';
const HERE = dirname(fileURLToPath(import.meta.url));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

const today = (now) => now.toISOString().slice(0, 10);

// Cells: backslash, pipe, carriage return and newline are escaped; any other backslash reads as itself.
export function escapeCell(s) {
  return String(s).replace(/[\\|\r\n]/g, (c) => ({ '\\': '\\\\', '|': '\\|', '\r': '\\r', '\n': '\\n' })[c]);
}

export function unescapeCell(s) {
  return s.replace(/\\([\\|rn])/g, (_, c) => ({ '\\': '\\', '|': '|', r: '\r', n: '\n' })[c]);
}

/** The cells of a table line, split on pipes that are not escaped, unescaped and trimmed. */
export function splitRow(line) {
  const cells = [];
  let cur = '';
  const body = line.trim().replace(/^\|/, '');
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\' && i + 1 < body.length) { cur += body[i] + body[i + 1]; i++; continue; }
    if (body[i] === '|') { cells.push(cur); cur = ''; continue; }
    cur += body[i];
  }
  if (cur.trim()) cells.push(cur); // a line without a closing pipe
  return cells.map((c) => unescapeCell(c.trim()));
}

const isHeader = (line) => {
  if (!line.trim().startsWith('|')) return false;
  const cells = splitRow(line).map((c) => c.toLowerCase());
  return cells.length === COLUMNS.length && cells.every((c, i) => c === COLUMNS[i]);
};

function parseFiles(cell, where) {
  if (!cell) return [];
  return cell.split(', ').map((entry) => {
    const at = entry.lastIndexOf('@');
    const hash = entry.slice(at + 1);
    if (at < 1 || !/^[0-9a-f]{16}$/.test(hash)) throw new Error(`${where}: files entry "${entry}" is not path@hash`);
    return { path: entry.slice(0, at), hash };
  });
}

function rowFromCells(cells, where) {
  if (cells.length !== COLUMNS.length) throw new Error(`${where}: a row needs ${COLUMNS.length} cells, found ${cells.length}`);
  const r = Object.fromEntries(COLUMNS.map((c, i) => [c, cells[i]]));
  r.stage = Number(r.stage);
  r.files = parseFiles(r.files, where);
  checkShape(r, where);
  return r;
}

function checkShape(r, where) {
  if (!r.id) throw new Error(`${where}: a row needs an id`);
  if (![1, 2, 3, 4].includes(r.stage)) throw new Error(`${where} (${r.id}): stage must be 1, 2, 3 or 4`);
  if (!SEVERITIES.includes(r.severity)) throw new Error(`${where} (${r.id}): severity "${r.severity}" is not ${SEVERITIES.join(' or ')}`);
  if (!STATUSES.includes(r.status)) throw new Error(`${where} (${r.id}): status "${r.status}" is not one of ${STATUSES.join(', ')}`);
  if (!SOURCES.includes(r.source)) throw new Error(`${where} (${r.id}): source "${r.source}" is not one of ${SOURCES.join(', ')}`);
  for (const k of ['date', 'expires']) {
    if (r[k] && !DATE.test(r[k])) throw new Error(`${where} (${r.id}): ${k} "${r[k]}" is not YYYY-MM-DD`);
  }
}

export function formatRow(r) {
  const files = r.files.map((f) => `${f.path}@${f.hash}`).join(', ');
  const cells = COLUMNS.map((c) => escapeCell(c === 'files' ? files : String(r[c] ?? '')));
  return `| ${cells.join(' | ')} |`;
}

/** Parse a READINESS.md text. Throws on a missing table, a malformed row or a profile block that is not JSON. */
export function parseLedger(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(eol);
  const h = lines.findIndex(isHeader);
  if (h < 0) throw new Error(`no ledger table (a header row: | ${COLUMNS.join(' | ')} |)`);
  if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[h + 1] || '')) throw new Error('the ledger table has no separator line under its header');
  let end = h + 2;
  const rows = [];
  const raw = [];
  for (; end < lines.length && lines[end].trim().startsWith('|'); end++) {
    const r = rowFromCells(splitRow(lines[end]), `line ${end + 1}`);
    if (rows.some((x) => x.id === r.id)) throw new Error(`line ${end + 1}: id ${r.id} appears twice`);
    rows.push(r);
    raw.push(lines[end]);
  }
  let meta = null;
  let metaAt = null;
  const m = lines.findIndex((l) => l.trim() === META_OPEN);
  if (m >= 0) {
    const close = lines.findIndex((l, i) => i > m && l.trim() === '```');
    if (close < 0) throw new Error('the profile block is never closed');
    try { meta = JSON.parse(lines.slice(m + 1, close).join('\n')); } catch (e) { throw new Error(`the profile block is not JSON: ${e.message}`); }
    metaAt = [m, close];
  }
  return { lines, eol, table: [h, end], rows, raw, meta: meta || emptyMeta(), metaAt, metaRaw: meta ? JSON.stringify(meta) : null };
}

const emptyMeta = () => ({ version: 1, stage: null, regulated: false, profile: {}, profileFiles: {}, lastRun: null });
const clone = (l) => ({ ...l, rows: l.rows.map((r) => ({ ...r, files: r.files.map((f) => ({ ...f })) })), meta: structuredClone(l.meta) });

/** Write a parsed ledger back: prose, untouched rows and an unchanged profile block come out byte for byte. */
export function formatLedger(l) {
  const [h, end] = l.table;
  const rowLines = l.rows.map((r, i) => {
    const old = l.raw[i] !== undefined ? rowFromCells(splitRow(l.raw[i]), 'raw') : null;
    return old && JSON.stringify(old) === JSON.stringify(r) ? l.raw[i] : formatRow(r);
  });
  let out = [...l.lines.slice(0, h + 2), ...rowLines, ...l.lines.slice(end)];
  const metaText = JSON.stringify(l.meta, null, 2).split('\n');
  if (l.metaAt && l.metaRaw !== JSON.stringify(l.meta)) {
    const [m, close] = l.metaAt;
    const shift = m > h ? rowLines.length - (end - h - 2) : 0;
    out.splice(m + 1 + shift, close - m - 1, ...metaText);
  } else if (!l.metaAt) {
    out.splice(h, 0, META_OPEN, ...metaText, '```', '');
  }
  return out.join(l.eol);
}

/** sha256 of the whole file, first 16 hex characters: a moved line changes it too. */
export function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
}

const cleanPath = (p) => p.split(sep).join('/').replace(/^\.\//, '');

function evidenceRules(r) {
  const why = [];
  const has = (s) => s && String(s).trim();
  if (r.status === 'pass' && r.source === 'code' && !/[^\s:]+:\d+/.test(r.evidence)) why.push('a code pass needs file:line in its evidence');
  if (r.status === 'pass' && r.source === 'code' && !r.files.length) why.push('a code pass cites the file it read');
  if (r.source === 'command' && !r.files.length) why.push('a command row lists its input files (a dependency audit cites the lockfile)');
  if ((r.source === 'command' || r.source === 'answer') && !r.expires) why.push(`a ${r.source} row carries an expiry`);
  if (['pass', 'fail', 'likely'].includes(r.status) && !has(r.evidence)) why.push(`a ${r.status} row needs its evidence`);
  if (r.status === 'unknown' && !has(r.evidence)) why.push('an unknown row says how to check it');
  if (r.status === 'n/a' && !has(r.evidence)) why.push('an n/a row gives the profile reason');
  return why;
}

/** Add or replace rows. Returns a new ledger; throws, changing nothing, when any row breaks a rule. */
export function applyRows(ledger, inputs, { root, now = new Date() }) {
  const l = clone(ledger);
  const errors = [];
  for (const input of inputs) {
    const r = {};
    for (const c of COLUMNS) r[c] = typeof input[c] === 'string' ? input[c].trim() : input[c] ?? '';
    r.stage = Number(r.stage);
    r.date = r.date || today(now);
    const where = `row ${r.id || '(no id)'}`;
    try {
      checkShape(r, 'input');
      if (!Array.isArray(input.files || [])) throw new Error('files must be a list of paths');
      r.files = (input.files || []).map((p) => {
        const rel = cleanPath(String(p));
        if (rel.includes(', ')) throw new Error(`path "${rel}" contains ", "`);
        const abs = resolve(root, rel);
        if (!existsSync(abs) || !statSync(abs).isFile()) throw new Error(`cited file ${rel} does not exist under the root`);
        return { path: rel, hash: hashFile(abs) };
      });
      const why = evidenceRules(r);
      if (why.length) throw new Error(why.join('; '));
    } catch (e) { errors.push(`${where}: ${e.message}`); continue; }
    const at = l.rows.findIndex((x) => x.id === r.id);
    if (at >= 0) l.rows[at] = r; else l.rows.push(r);
  }
  if (errors.length) throw new Error(errors.join('\n'));
  return l;
}

/** Store the confirmed profile and the hash of each file it came from. */
export function setProfile(ledger, { profile, stage, regulated = false, files = [] }, { root }) {
  if (![1, 2, 3].includes(Number(stage))) throw new Error('stage must be 1, 2 or 3 (stage 4 is "regulated": true on top of it)');
  const l = clone(ledger);
  const profileFiles = {};
  for (const p of files) {
    const rel = cleanPath(p);
    if (!existsSync(resolve(root, rel))) throw new Error(`profile file ${rel} does not exist under the root`);
    profileFiles[rel] = hashFile(resolve(root, rel));
  }
  l.meta = { ...l.meta, version: 1, stage: Number(stage), regulated: !!regulated, profile, profileFiles };
  return l;
}

export function stamp(ledger, { commit, now = new Date() }) {
  const l = clone(ledger);
  l.meta.lastRun = { commit, date: today(now) };
  return l;
}

/** Files changed since a commit: committed, staged, unstaged and untracked, relative to the root. Throws outside git. */
export function changedSince(root, commit) {
  const g = (...a) => execFileSync('git', ['-C', root, ...a], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const top = g('rev-parse', '--show-toplevel').trim();
  const list = [...g('diff', '--name-only', commit, '--').split('\n'), ...g('ls-files', '--others', '--exclude-standard', '--full-name').split('\n')];
  const prefix = relative(resolve(top), resolve(root)).split(sep).join('/');
  const out = new Set();
  for (const f of list.filter(Boolean)) {
    if (!prefix) out.add(f);
    else if (f.startsWith(`${prefix}/`)) out.add(f.slice(prefix.length + 1));
  }
  return [...out];
}

/** Send stale rows to recheck. Returns { ledger, changes, profileChanged, uncited, uncitedNote }. */
export function refresh(ledger, { root, now = new Date(), ledgerPath = null, changed = changedSince }) {
  const l = clone(ledger);
  const day = today(now);
  const profileDiff = Object.entries(l.meta.profileFiles || {})
    .filter(([p, h]) => !existsSync(resolve(root, p)) || hashFile(resolve(root, p)) !== h).map(([p]) => p);
  const changes = [];
  for (const r of l.rows) {
    if (r.status === 'recheck') continue;
    const reasons = [];
    for (const f of r.files) {
      const abs = resolve(root, f.path);
      if (!existsSync(abs) || !statSync(abs).isFile()) reasons.push(`${f.path} missing (deleted or moved)`);
      else if (hashFile(abs) !== f.hash) reasons.push(`${f.path} changed`);
    }
    if (r.expires && r.expires < day) reasons.push(`expired ${r.expires}`);
    if (profileDiff.length && r.status === 'n/a') reasons.push(`profile sources changed: ${profileDiff.join(', ')}`);
    if (reasons.length) { changes.push({ id: r.id, was: r.status, reasons }); r.status = 'recheck'; }
  }
  let uncited = [];
  let uncitedNote = '';
  const commit = l.meta.lastRun && l.meta.lastRun.commit;
  if (!commit) uncitedNote = 'no last run recorded, so no list of changed files';
  else {
    try {
      const cited = new Set([...l.rows.flatMap((r) => r.files.map((f) => f.path)), ...Object.keys(l.meta.profileFiles || {})]);
      if (ledgerPath) cited.add(cleanPath(ledgerPath));
      uncited = changed(root, commit).filter((f) => !cited.has(f)).sort();
    } catch (e) {
      uncitedNote = `cannot list files changed since ${commit}: ${String(e.message).split('\n')[0]}`;
    }
  }
  return { ledger: l, changes, profileChanged: profileDiff.length > 0, uncited, uncitedNote };
}

const closed = (r, day) => (r.status === 'pass' || r.status === 'n/a') && (!r.expires || r.expires >= day);

/** Readiness per stage for the rows, the stage being entered and whether regulated data is added. */
export function readiness(rows, { stage, regulated = false, now = new Date() }) {
  const day = today(now);
  const open = (n) => rows.filter((r) => r.severity === 'must-fix' && (r.stage <= Math.min(n, 3) || (regulated && r.stage === 4)) && !closed(r, day));
  const stages = [1, 2, 3].map((n) => ({ stage: n, ready: open(n).length === 0, blockers: open(n) }));
  const blockers = open(stage);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  return { stage, regulated, stages, go: blockers.length === 0, blockers, counts, probesSkipped: rows.some((r) => r.status === 'likely') };
}

/** docs/READINESS.md, then READINESS.md at the root; a new ledger goes in docs/ when the project has that folder. */
export function findLedger(root) {
  const inDocs = join(root, 'docs', 'READINESS.md');
  const atRoot = join(root, 'READINESS.md');
  if (existsSync(inDocs) && existsSync(atRoot)) throw new Error(`two ledgers, ${inDocs} and ${atRoot}: merge them into one and delete the other`);
  if (existsSync(inDocs)) return { path: inDocs, exists: true };
  if (existsSync(atRoot)) return { path: atRoot, exists: true };
  return { path: existsSync(join(root, 'docs')) ? inDocs : atRoot, exists: false };
}

function gitRoot(cwd) {
  try {
    return execFileSync('git', ['-C', cwd, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return cwd; }
}

const USAGE = `Usage: node ledger.mjs <command> [--root <dir>] [--now <ISO date>]
  find                 where the ledger is, or where a new one goes
  profile <file|->     store the confirmed profile, creating the ledger from the template if needed
  apply <file|->       add or replace rows from a JSON array
  refresh [--dry-run]  send stale rows to recheck and list changed files that no row cites
  status               readiness per stage, open must-fix rows and counts per grade
  stamp                record HEAD and today as the last run`;

export function main(argv, { cwd = process.cwd(), out = console.log, err = console.error, stdin = () => readFileSync(0, 'utf8') } = {}) {
  const args = [...argv];
  const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const dry = args.includes('--dry-run');
  if (dry) args.splice(args.indexOf('--dry-run'), 1);
  const rootArg = flag('--root');
  const nowArg = flag('--now');
  const [cmd, input] = args;
  if (!cmd || cmd === 'help' || cmd === '--help') { out(USAGE); return 0; }
  try {
    const now = nowArg ? new Date(nowArg) : new Date();
    if (Number.isNaN(now.getTime())) throw new Error(`--now "${nowArg}" is not a date`);
    const root = resolve(rootArg ? resolve(cwd, rootArg) : gitRoot(cwd));
    const found = findLedger(root);
    const rel = relative(root, found.path).split(sep).join('/');
    const readJson = () => {
      if (!input) throw new Error(`${cmd} needs a JSON file, or - for standard input`);
      return JSON.parse(input === '-' ? stdin() : readFileSync(resolve(cwd, input), 'utf8'));
    };
    const load = () => {
      if (!found.exists) throw new Error(`no ledger yet at ${rel}: run "profile" first`);
      return parseLedger(readFileSync(found.path, 'utf8'));
    };
    const save = (l) => writeFileSync(found.path, formatLedger(l));
    if (cmd === 'find') { out(`${found.exists ? 'found' : 'none yet, would create'}: ${rel}`); return 0; }
    if (cmd === 'profile') {
      const base = found.exists ? load() : parseLedger(readFileSync(join(HERE, 'READINESS-TEMPLATE.md'), 'utf8'));
      save(setProfile(base, readJson(), { root }));
      out(`profile stored in ${rel}`);
      return 0;
    }
    if (cmd === 'apply') {
      const rows = readJson();
      if (!Array.isArray(rows)) throw new Error('apply takes a JSON array of rows');
      save(applyRows(load(), rows, { root, now }));
      out(`${rows.length} row(s) written to ${rel}`);
      return 0;
    }
    if (cmd === 'refresh') {
      const r = refresh(load(), { root, now, ledgerPath: rel });
      if (r.profileChanged) out('profile sources changed since the profile was confirmed: confirm the profile again');
      for (const c of r.changes) out(`${c.id}: recheck (was ${c.was}): ${c.reasons.join('; ')}`);
      if (!r.changes.length) out('no row went stale');
      if (r.uncited.length) out(`changed since the last run, cited by no row:\n${r.uncited.map((f) => `  ${f}`).join('\n')}`);
      if (r.uncitedNote) out(r.uncitedNote);
      const rechecks = r.ledger.rows.filter((x) => x.status === 'recheck').map((x) => x.id);
      out(`rows to recheck: ${rechecks.length ? rechecks.join(', ') : 'none'}`);
      if (!dry) save(r.ledger);
      return 0;
    }
    if (cmd === 'status') {
      const l = load();
      if (!l.meta.stage) throw new Error('no profile stored: run "profile" first');
      const r = readiness(l.rows, { stage: l.meta.stage, regulated: l.meta.regulated, now });
      if (r.regulated) out('regulated data is added: the stage 4 rows count at every stage');
      for (const s of r.stages) {
        const tag = s.stage === r.stage ? ' (the stage being entered)' : '';
        const list = s.blockers.map((b) => b.id).join(', ');
        out(`stage ${s.stage} (${STAGE_NAMES[s.stage]}): ${s.ready ? 'GO' : `NO-GO, must-fix open: ${list}`}${tag}`);
      }
      out(`counts: ${STATUSES.map((s) => `${s} ${r.counts[s]}`).join(', ')}`);
      if (r.probesSkipped) out('some security rows are only "likely": probes were skipped for them');
      return 0;
    }
    if (cmd === 'stamp') {
      const commit = execFileSync('git', ['-C', root, 'rev-parse', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      save(stamp(load(), { commit, now }));
      out(`last run: ${commit.slice(0, 12)} on ${today(now)}`);
      return 0;
    }
    throw new Error(`unknown command "${cmd}"\n${USAGE}`);
  } catch (e) {
    err(e.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
