// skills-bench runner: the run command. One skill-eval lab per task, run in the order of pilot.json, each task started
// only when the start rule lets it (plan.mjs), with a hard stop per run set by its difficulty.
import { existsSync, readdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, basename, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { REPO, findMetaWords, microsArg, microsUsd, parseUsdMicros, lastLines, skillEval } from './common.mjs';
import { loadConfig, loadTasks, runOrder, priceOf } from './config.mjs';
import { settings, planRows, hardStopOf, startNeed, runCountProblems } from './plan.mjs';
import { STATE_FORMAT, openRound, saveState, newRoundId, judgeReserve } from './state.mjs';
import { collectTask } from './collect.mjs';

/** A new empty folder for one task's runs, outside the round, with no word a run must not see in its name. */
function makeRoot() {
  for (let i = 0; i < 20; i++) {
    const d = mkdtempSync(join(tmpdir(), 'r-'));
    if (!findMetaWords(basename(d)).length) return d;
    rmSync(d, { recursive: true, force: true });
  }
  throw new Error('could not make a run root with a neutral name');
}

const gitOut = (args) => {
  const r = spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};

/** "<repo path> at <commit>" for each variant folder a round uses, keyed "<skill>/<variant>". */
function variantSources(tasks) {
  const commit = gitOut(['rev-parse', '--short=12', 'HEAD']) || 'unknown';
  const out = {};
  for (const t of tasks) {
    for (const v of t.variants.filter((x) => x.dir)) {
      const rel = relative(REPO, v.dir);
      const inside = rel && !rel.startsWith('..') && !isAbsolute(rel);
      const dirty = inside && gitOut(['status', '--porcelain', '--', rel]);
      out[`${t.skill}/${v.name}`] = inside ? `${rel.split('\\').join('/')} at ${commit}${dirty ? ' with uncommitted changes' : ''}` : 'a folder outside the repository';
    }
  }
  return out;
}

function newState(o, cfg, s, ordered, n, p) {
  const now = new Date().toISOString();
  return {
    format: STATE_FORMAT, roundId: newRoundId(), startedAt: now, endedAt: now, model: o.model, config: cfg.file,
    tasksDir: cfg.tasksDir, n, calibration: o.only.length > 0 && n === 1, capMicros: s.capMicros, estimateMicros: p.estimate,
    judgeMicros: cfg.judgeMicros, hardStopFactor: cfg.hardStopFactor, seenMicros: {}, spentMicros: 0, judgeModel: null,
    modelsReported: [], variantSources: variantSources(ordered), planned: ordered.map((t) => t.id),
    tasks: Object.fromEntries(ordered.map((t) => [t.id, {
      skill: t.skill, difficulty: t.difficulty, control: t.control, summary: t.summary, variants: t.variants.map((v) => v.name),
      status: 'planned', runsPlanned: t.variants.length * n, runsMade: 0, hardStopMicros: null, spentMicros: 0, judged: false,
    }])),
  };
}

const started = (lab) => existsSync(join(lab, 'runs')) && readdirSync(join(lab, 'runs')).some((f) => f.endsWith('.jsonl'));

export async function runCommand(o, out, err) {
  const refuse = (...lines) => { for (const l of lines) err(`refused: ${l}`); return 1; };
  if (o.maxUsd === undefined) return refuse('run needs --max-usd <cap in US dollars>: a round never starts without a cap');
  if (!parseUsdMicros(o.maxUsd)) return refuse(`--max-usd takes US dollars above 0 with at most 6 decimals: ${o.maxUsd}`);
  let cfg;
  let set;
  let s;
  try {
    cfg = loadConfig(o.config);
    set = settings(cfg, o);
    s = openRound(o.round);
  } catch (e) { return refuse(e.message); }
  const round = resolve(o.round);
  const { tasks, problems } = loadTasks(cfg);
  if (problems.length) return refuse('these tasks break contract 1 (FORMAT.md):', ...problems);
  const unknown = o.only.filter((id) => !tasks.some((t) => t.id === id));
  if (unknown.length) return refuse(`--only names no task: ${unknown.join(', ')}`);
  const n = o.n ?? (s ? s.n : cfg.n);
  const ordered = runOrder(tasks, cfg).filter((t) => !o.only.length || o.only.includes(t.id));
  const many = runCountProblems(ordered, n);
  if (many.length) return refuse(...many);
  if (s) {
    if (s.model !== o.model) return refuse(`this round runs ${s.model}; resume it with the same --model`);
    if (s.n !== n) return refuse(`this round runs ${s.n} runs per variant; resume it with the same --n`);
    if (s.planned.join(',') !== ordered.map((t) => t.id).join(',')) return refuse(`this round plans ${s.planned.join(', ')}; resume it with the same --only`);
    s.capMicros = set.capMicros;
    out(`Resuming round ${s.roundId}: spent ${microsUsd(s.spentMicros)} so far`);
  } else {
    const p = planRows(ordered, { prices: set.prices, factor: cfg.hardStopFactor, judgeMicros: cfg.judgeMicros, n, capMicros: set.capMicros });
    s = newState(o, cfg, set, ordered, n, p);
    out(`Round ${s.roundId}: ${p.runs} runs, estimate ${microsUsd(p.estimate)}, cap ${microsUsd(set.capMicros)}`);
  }
  saveState(round, s);

  let failed = 0;
  for (const task of ordered) {
    const t = s.tasks[task.id];
    if (t.status === 'done') { out(`${task.id}: done before, skipped`); continue; }
    if (t.status === 'running' && t.lab && existsSync(join(t.lab, 'plan.json')) && started(t.lab)) {
      // The last round stopped while this task ran: what its runs left is kept, and a run with no result is charged.
      collectTask(task, t, s, round, cfg);
      saveState(round, s);
      out(`${task.id}: collected the runs of an interrupted round`);
      continue;
    }
    for (const d of [t.lab, t.root]) if (d) rmSync(d, { recursive: true, force: true });
    const prices = Object.fromEntries(Object.keys(cfg.prices).map((d) => [d, priceOf(d, cfg, set.cli, s.seenMicros)]));
    t.hardStopMicros = hardStopOf(task.difficulty, prices, cfg.hardStopFactor);
    const runs = task.variants.length * n;
    const rule = startNeed({ spent: s.spentMicros, runs, hardStop: t.hardStopMicros, reserve: judgeReserve(s), cap: s.capMicros });
    if (!rule.fits) {
      t.status = 'not run (cap)';
      saveState(round, s);
      out(`${task.id}: not run (cap): it needs ${microsUsd(rule.need)} of the ${microsUsd(s.capMicros)} cap (${runs} runs at a ${microsUsd(t.hardStopMicros)} hard stop, plus the judge reserve)`);
      continue;
    }
    t.lab = join(round, 'labs', task.id);
    t.root = makeRoot();
    t.status = 'running';
    saveState(round, s);
    out(`${task.id}: ${runs} runs, hard stop ${microsUsd(t.hardStopMicros)} per run`);
    const echo = { out, prefix: `  ${task.id}: ` };
    const setup = await skillEval(['setup', t.lab, '--root', t.root, '--task', join(task.dir, 'start'), '--slug', task.slug,
      '--n', String(n), ...task.allowWords.flatMap((w) => ['--allow-word', w]),
      ...task.variants.flatMap((v) => ['--variant', `${v.name}=${v.dir || 'none'}`]), '--prompt', task.promptFile], echo);
    let ran = null;
    if (setup.code === 0) {
      ran = await skillEval(['run', t.lab, '--model', o.model, '--allow-tool', ...task.allowTools, '--timeout-min', String(task.timeoutMin),
        '--max-budget-usd', microsArg(t.hardStopMicros), '--parallel', String(o.parallel ?? cfg.parallel),
        ...(o.passEnv.length ? ['--pass-env', ...o.passEnv] : []), ...(o.realHome ? ['--real-home'] : [])], echo);
    }
    if (setup.code !== 0 || (ran.code !== 0 && !started(t.lab))) {
      // Refused before any run started (setup, or run's login check): nothing was spent.
      Object.assign(t, { status: 'failed', reason: lastLines((setup.code !== 0 ? setup : ran).stderr) || 'no reason given' });
      rmSync(t.root, { recursive: true, force: true });
      failed++;
      saveState(round, s);
      out(`${task.id}: failed: ${t.reason}`);
      continue;
    }
    const charged = collectTask(task, t, s, round, cfg);
    saveState(round, s);
    out(`${task.id}: done, ${t.runsMade} runs, ${t.dropouts.length} dropouts, ${microsUsd(charged)} charged`);
  }
  const by = (st) => ordered.filter((x) => s.tasks[x.id].status === st).length;
  out(`Spent ${microsUsd(s.spentMicros)} of the ${microsUsd(s.capMicros)} cap; tasks done ${by('done')}, not run (cap) ${by('not run (cap)')}, failed ${by('failed')}`);
  out(`Next: node apps/skills-bench/bench.mjs judge --round ${round} --judge-model <id>`);
  return failed ? 1 : 0;
}
