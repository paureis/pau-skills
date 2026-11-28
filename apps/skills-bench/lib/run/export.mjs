// skills-bench runner: export, which writes a round in contract 3 (FORMAT.md) to a folder that can be committed. Paths
// become <project>, <home>, <tmp> and <repo>, environment values <env>, emails <email>; then every written file is
// checked for temporary and home paths the scrub check misses, and the export fails on a hit.
import { existsSync, readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, rmSync, mkdtempSync } from 'node:fs';
import { join, resolve, dirname, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { REPO, MAX_BYTES, claudeCommand, childEnv, readJson, firstLine, pathPairs, replaceDeep } from './common.mjs';
import { loadRound, resultPath } from './state.mjs';
import { judgePaths } from './judge.mjs';

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const KEY = /\bsk-[A-Za-z0-9_-]{12,}/g;
const MIN_ENV = 8;

/** The first line of `claude --version`, or "unknown" when claude is missing or fails. */
export function claudeVersion() {
  const home = mkdtempSync(join(tmpdir(), 'h-'));
  try {
    const { file, args } = claudeCommand(['--version']);
    const r = spawnSync(file, args, { cwd: home, env: childEnv(process.env, home), encoding: 'utf8', timeout: 60_000 });
    return r.status === 0 && firstLine(r.stdout) ? firstLine(r.stdout) : 'unknown';
  } catch { return 'unknown'; } finally {
    rmSync(home, { recursive: true, force: true });
  }
}

/** The places in a text where a temporary or home path is left, as short sentences. */
export function leftPaths(text, home = process.env.HOME) {
  const roots = ['/tmp', '/root', '/var/folders', '/private/var', ...(home && home.length > 1 ? [home] : [])];
  const hits = [];
  String(text).split(/\r?\n/).forEach((line, i) => {
    for (const r of roots) {
      const re = new RegExp(`(?<![\\w<>.-])${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?![\\w.-])`);
      if (re.test(line)) hits.push(`line ${i + 1} has ${r}`);
    }
  });
  return hits;
}

function exportPairs(s, round) {
  const list = [[round, '<tmp>'], [REPO, '<repo>'], [process.env.HOME, '<home>']];
  for (const t of Object.values(s.tasks)) {
    if (t.root) list.push([t.root, '<tmp>']);
    if (t.lab) list.push([t.lab, '<tmp>']);
    for (const r of t.runs || []) list.push([r.dir, '<project>'], [r.home, '<home>']);
  }
  const pairs = pathPairs(list.filter(([p]) => p && p.length > 1));
  const keep = new Set([s.model, s.judgeModel].filter(Boolean));
  const taken = new Set(pairs.map(([p]) => p));
  const env = Object.values(process.env).filter((v) => typeof v === 'string' && v.length >= MIN_ENV && !keep.has(v) && !taken.has(v));
  return { pairs, env: env.map((v) => [v, '<env>']) };
}

const isFree = (dir) => !existsSync(dir) || (statSync(dir).isDirectory() && !readdirSync(dir).length);

export function exportCommand(o, out, err) {
  const refuse = (...lines) => { for (const l of lines) err(`refused: ${l}`); return 1; };
  const round = resolve(o.round);
  const to = resolve(o.to);
  let s;
  try { s = loadRound(round); } catch (e) { return refuse(e.message); }
  if (!isFree(to)) return refuse(`${to} is not a new or empty folder`);
  const { pairs, env } = exportPairs(s, round);
  const clean = (v) => {
    const hidden = replaceDeep(replaceDeep(v, pairs), env);
    const walk = (x) => (typeof x === 'string' ? x.replace(EMAIL, '<email>').replace(KEY, '<key>')
      : Array.isArray(x) ? x.map(walk) : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x).map(([k, y]) => [k, walk(y)])) : x);
    return walk(hidden);
  };
  const files = {};
  const json = (rel, data) => { files[rel] = JSON.stringify(clean(data), null, 2) + '\n'; };
  const text = (rel, t) => { files[rel] = clean(String(t)); };
  json('round.json', {
    format: 'skills-bench-results/1', roundId: s.roundId, startedAt: s.startedAt, endedAt: s.endedAt, model: s.model,
    modelsReported: s.modelsReported, judgeModel: s.judgeModel, claudeVersion: claudeVersion(), auth: o.auth, currency: 'USD',
    capMicros: s.capMicros, spentMicros: s.spentMicros, estimateMicros: s.estimateMicros, n: s.n, calibration: s.calibration,
    variantSources: s.variantSources,
    tasks: s.planned.map((id) => {
      const t = s.tasks[id];
      return { skill: t.skill, task: id, difficulty: t.difficulty, variants: t.variants, status: ['done', 'not run (cap)'].includes(t.status) ? t.status : 'failed', runsPlanned: t.runsPlanned, runsMade: t.runsMade, hardStopMicros: t.hardStopMicros };
    }),
  });
  for (const id of s.planned) {
    const t = s.tasks[id];
    for (const r of t.runs || []) {
      const f = resultPath(round, { skill: t.skill, id }, r.variant, r.n);
      if (existsSync(f)) json(relative(round, f).split('\\').join('/').replace(/^results\//, ''), readJson(f));
    }
    const jp = judgePaths(round, t, id);
    if (existsSync(jp.json)) json(`judge/${t.skill}/${id}.json`, readJson(jp.json));
    if (existsSync(jp.verdict)) text(`judge/${t.skill}/${id}.verdict.txt`, readFileSync(jp.verdict, 'utf8'));
  }
  for (const f of ['map.json', 'grades-tdd.txt', 'grades-bug-fix.txt']) {
    const p = join(round, 'owner', f);
    if (!existsSync(p)) continue;
    if (f.endsWith('.json')) json(`owner/${f}`, readJson(p)); else text(`owner/${f}`, readFileSync(p, 'utf8'));
  }

  for (const [rel, body] of Object.entries(files)) {
    mkdirSync(dirname(join(to, rel)), { recursive: true });
    writeFileSync(join(to, rel), body);
  }
  // Read back what was written: the scrub check misses temporary and home paths, so they are looked for here.
  const hits = [];
  for (const rel of Object.keys(files)) {
    const body = readFileSync(join(to, rel), 'utf8');
    for (const h of leftPaths(body)) hits.push(`${rel}: ${h}`);
    const bytes = Buffer.byteLength(body);
    if (bytes > MAX_BYTES) err(`warning: ${rel} is ${bytes} bytes, over ${MAX_BYTES}, the largest file the repository may track`);
  }
  if (hits.length) {
    for (const rel of Object.keys(files)) rmSync(join(to, rel), { force: true });
    err(`failed: a temporary or home path is left in the export, so its files were removed from ${to}:`);
    for (const h of hits.slice(0, 20)) err(`  ${h}`);
    return 1;
  }
  out(`Exported round ${s.roundId} to ${to}: ${Object.keys(files).length} files`);
  return 0;
}
