#!/usr/bin/env node
/**
 * The READINESS.md ledger of the launch-readiness skill (Node standard library). "help" lists the commands, which
 * take --root <dir> (default: the git top level; one ledger per app folder) and --now <ISO date>. Profile input:
 * {profile, stage (1 to 3), regulated, files: [the manifests]}. Row input: [{id, area, stage (1 to 4), severity,
 * status, source (code, command, probe, answer), evidence, files: [paths], expires, date}]; a row with a known id
 * replaces it, and a bad row stops the whole write (rules.mjs). Closed: pass or n/a, not expired. Ready for stage N:
 * every must-fix row for stages 1 to N, plus stage 4 rows when regulated data is added, is closed, and every one of
 * those stages has graded rows and was assessed by a stamped run. The table and profile block are in table.mjs.
 */
import { readFileSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { COLUMNS, STATUSES, checkShape, parseLedger, formatLedger, clone } from './table.mjs';
import { evidenceRules, insideRoot } from './rules.mjs';

export { PROBE_IDS, secretIn } from './rules.mjs';

export { COLUMNS, STATUSES, SEVERITIES, SOURCES, escapeCell, unescapeCell, splitRow, formatRow, parseLedger, formatLedger } from './table.mjs';
export const STAGE_NAMES = { 1: 'private beta', 2: 'paying customers', 3: 'enterprise buyers', 4: 'regulated data' };
const HERE = dirname(fileURLToPath(import.meta.url));
// The local calendar date: an answer that expires today holds until local midnight.
const today = (now) => [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, '0')).join('-');

/** sha256 of the whole file, first 16 hex characters: a moved line changes it too. */
export function hashFile(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex').slice(0, 16);
}

const cleanPath = (p) => p.split(sep).join('/').replace(/^\.\//, '');

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
        const { rel, abs } = insideRoot(root, p);
        if (rel.includes(', ')) throw new Error(`path "${rel}" contains ", "`);
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

/** Files the profile came from that changed, went missing or were added since it was stored. */
function profileDiff(meta, root, files = null) {
  const old = meta.profileFiles || {};
  if (!Object.keys(old).length) return [];
  const gone = Object.entries(old).filter(([p, h]) => !existsSync(resolve(root, p)) || hashFile(resolve(root, p)) !== h).map(([p]) => p);
  return [...gone, ...(files || []).filter((p) => !(p in old))];
}

/**
 * Store the confirmed profile and a hash of each file it came from. First, as refresh would, the n/a rows go to
 * recheck when those files changed; and when the stage rises or regulated data is added, the n/a and can-wait rows
 * go to recheck too, since a higher stage can make them apply or make them must-fix.
 */
export function setProfile(ledger, { profile, stage, regulated = false, files = [] }, { root }) {
  if (![1, 2, 3].includes(Number(stage))) throw new Error('stage must be 1, 2 or 3 (stage 4 is "regulated": true on top of it)');
  const l = clone(ledger);
  const profileFiles = {};
  for (const p of files) {
    const { rel, abs } = insideRoot(root, p);
    profileFiles[rel] = hashFile(abs);
  }
  const changed = profileDiff(l.meta, root, Object.keys(profileFiles)).length > 0;
  const raised = (l.meta.stage && Number(stage) > l.meta.stage) || (!!regulated && !l.meta.regulated && l.meta.stage);
  for (const r of l.rows) {
    if ((changed && r.status === 'n/a') || (raised && (r.status === 'n/a' || r.severity === 'can-wait'))) r.status = 'recheck';
  }
  l.meta = { ...l.meta, version: 1, stage: Number(stage), regulated: !!regulated, profile, profileFiles };
  return l;
}

/** Record the run: its commit, its date, and the stage that was assessed (stages above it are "not assessed"). */
export function stamp(ledger, { commit, now = new Date() }) {
  const l = clone(ledger);
  l.meta.lastRun = { commit, date: today(now) };
  l.meta.assessed = { stage: l.meta.stage, regulated: !!l.meta.regulated };
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
  const diff = profileDiff(l.meta, root);
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
    if (diff.length && r.status === 'n/a') reasons.push(`profile sources changed: ${diff.join(', ')}`);
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
  const open = l.rows.filter((r) => ['fail', 'unknown', 'likely'].includes(r.status)).map((r) => r.id);
  return { ledger: l, changes, profileChanged: diff.length > 0, uncited, uncitedNote, open };
}

const closed = (r, day) => (r.status === 'pass' || r.status === 'n/a') && (!r.expires || r.expires >= day);

/**
 * Readiness per stage. A stage is not assessed, so never GO, when a stage up to it has no rows, when it is above the
 * stage the last stamped run assessed, or when regulated data is added and no stage 4 row was graded.
 */
export function readiness(rows, { stage, regulated = false, assessed = null, now = new Date() }) {
  const day = today(now);
  const open = (n) => rows.filter((r) => r.severity === 'must-fix' && (r.stage <= Math.min(n, 3) || (regulated && r.stage === 4)) && !closed(r, day));
  const has = (n) => rows.some((r) => r.stage === n);
  const missing = (n) => [...[1, 2, 3].filter((k) => k <= n && (!has(k) || (assessed && k > assessed.stage))),
    ...(regulated && (!has(4) || (assessed && !assessed.regulated)) ? [4] : [])];
  const stages = [1, 2, 3].map((n) => ({ stage: n, ready: !open(n).length && !missing(n).length, blockers: open(n), notAssessed: missing(n) }));
  const blockers = open(stage);
  const counts = Object.fromEntries(STATUSES.map((s) => [s, rows.filter((r) => r.status === s).length]));
  const go = !blockers.length && !missing(stage).length;
  return { stage, regulated, stages, go, blockers, counts, probesSkipped: rows.some((r) => r.status === 'likely') };
}

/** docs/READINESS.md, then READINESS.md at the root; a new ledger goes in docs/ when the project has that folder. */
export function findLedger(root) {
  const inDocs = join(root, 'docs', 'READINESS.md');
  const atRoot = join(root, 'READINESS.md');
  if (existsSync(inDocs) && existsSync(atRoot)) throw new Error(`two ledgers, ${inDocs} and ${atRoot}: show both to the user and ask which one to keep`);
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
                       (with --consume, the input file is deleted once it is applied)
  refresh [--dry-run]  send stale rows to recheck and list changed files that no row cites
  status               readiness per stage, open must-fix rows and counts per grade
  stamp                record HEAD and today as the last run`;

export function main(argv, { cwd = process.cwd(), out = console.log, err = console.error, stdin = () => readFileSync(0, 'utf8') } = {}) {
  const args = [...argv];
  const flag = (name) => { const i = args.indexOf(name); if (i < 0) return null; const v = args[i + 1]; args.splice(i, 2); return v; };
  const has = (name) => { const i = args.indexOf(name); if (i >= 0) args.splice(i, 1); return i >= 0; };
  const dry = has('--dry-run');
  const consume = has('--consume');
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
    const save = (l) => {
      writeFileSync(found.path, formatLedger(l));
      if (consume && input && input !== '-') rmSync(resolve(cwd, input));
    };
    if (cmd === 'find') { out(`${found.exists ? 'found' : 'none yet, would create'}: ${rel}`); return 0; }
    if (cmd === 'profile') {
      const base = found.exists ? load() : parseLedger(readFileSync(join(HERE, 'READINESS-TEMPLATE.md'), 'utf8'));
      const next = setProfile(base, readJson(), { root });
      save(next);
      out(`profile stored in ${rel}`);
      const was = base.meta.stage;
      if (was && next.meta.stage !== was) {
        out(`stage ${next.meta.stage > was ? 'raised' : 'lowered'} from ${was} to ${next.meta.stage}: load the areas for it and grade its rows; status says "not assessed" until a stamp after that`);
      }
      const sent = next.rows.filter((r, i) => r.status === 'recheck' && base.rows[i].status !== 'recheck').map((r) => r.id);
      if (sent.length) out(`sent to recheck: ${sent.join(', ')}`);
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
      out(`open rows, grade them again: ${r.open.length ? r.open.join(', ') : 'none'}`);
      if (!dry) save(r.ledger);
      return 0;
    }
    if (cmd === 'status') {
      const l = load();
      if (!l.meta.stage) throw new Error('no profile stored: run "profile" first');
      const r = readiness(l.rows, { stage: l.meta.stage, regulated: l.meta.regulated, assessed: l.meta.assessed || null, now });
      if (r.regulated) out('regulated data added: stage 4 rows count at every stage');
      for (const s of r.stages) {
        const tag = s.stage === r.stage ? ' (the stage being entered)' : '';
        const list = s.blockers.map((b) => b.id).join(', ');
        const na = s.notAssessed.length ? `not assessed (stage ${s.notAssessed.join(', stage ')})` : '';
        const verdict = s.ready ? 'GO' : s.blockers.length ? `NO-GO, must-fix open: ${list}${na ? `; ${na}` : ''}` : na;
        out(`stage ${s.stage} (${STAGE_NAMES[s.stage]}): ${verdict}${tag}`);
      }
      out(`counts: ${STATUSES.map((s) => `${s} ${r.counts[s]}`).join(', ')}`);
      if (r.probesSkipped) out('some security rows are only "likely": probes were skipped for them');
      return 0;
    }
    if (cmd === 'stamp') {
      let commit;
      try {
        commit = execFileSync('git', ['-C', root, 'rev-parse', '--verify', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
      } catch {
        throw new Error('no commit yet (or not a git repository), so there is no run to record: the rows are still kept by file hash; stamp after the first commit');
      }
      save(stamp(load(), { commit, now }));
      out(`last run: ${commit.slice(0, 12)} on ${today(now)}`);
      return 0;
    }
    throw new Error(`unknown command "${cmd}"`);
  } catch (e) {
    err(e.message);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  process.exitCode = main(process.argv.slice(2));
}
