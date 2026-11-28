// skills-bench runner: the plan of a round (runs, estimate, hard stops, what the start rule needs per task) and the
// plan command, which calls no claude.
import { MAX_RUNS, microsUsd, parseUsdMicros } from './common.mjs';
import { loadConfig, loadTasks, runOrder, parsePrices, priceOf } from './config.mjs';

/** The hard stop of one run of a task: hardStopFactor x the price of its difficulty. */
export const hardStopOf = (difficulty, prices, factor) => factor * prices[difficulty];

/**
 * The start rule: a task starts only when what is spent, plus its runs at their hard stop, plus the judge reserve
 * (one judge price for every planned task not yet judged), stays within the cap. Returns what it needs and whether
 * that fits.
 */
export function startNeed({ spent, runs, hardStop, reserve, cap }) {
  const need = spent + runs * hardStop + reserve;
  return { need, fits: need <= cap };
}

/** Problems that stop a task before setup: more runs than skill-eval can label. */
export function runCountProblems(tasks, n) {
  return tasks.filter((t) => t.variants.length * n > MAX_RUNS)
    .map((t) => `${t.id}: ${t.variants.length} variants x ${n} = ${t.variants.length * n} runs; skill-eval labels at most ${MAX_RUNS}`);
}

/**
 * Rows in run order, each with its runs, price, hard stop, estimate and the amount the start rule needs to start it
 * when every earlier task cost its estimate; then the totals and the start-rule factor.
 */
export function planRows(tasks, { prices, factor, judgeMicros, n, capMicros }) {
  const reserve = tasks.length * judgeMicros;
  let before = 0;
  const rows = tasks.map((t) => {
    const runs = t.variants.length * n;
    const hardStop = hardStopOf(t.difficulty, prices, factor);
    const estimate = runs * prices[t.difficulty];
    const { need } = startNeed({ spent: before, runs, hardStop, reserve, cap: capMicros });
    before += estimate;
    return { task: t, runs, price: prices[t.difficulty], hardStop, estimate, need };
  });
  const runs = rows.reduce((a, r) => a + r.runs, 0);
  const estimate = before + reserve;
  const maxNeed = Math.max(0, ...rows.map((r) => r.need));
  // Every price grown by f grows every need by f, so the start rule holds for every task while f x maxNeed <= cap.
  const hundredths = maxNeed ? Math.floor((capMicros * 100) / maxNeed) : null;
  return { rows, runs, judges: tasks.length, estimate, cap: capMicros, margin: capMicros - estimate, maxNeed, hundredths };
}

const factorText = (h) => (h === null ? 'unbounded' : `${Math.floor(h / 100)}.${String(h % 100).padStart(2, '0')}`);

export function renderPlan(p, out) {
  out('Task  Skill  Difficulty  Variants  Runs  Estimate  Hard stop per run  Start rule needs');
  for (const r of p.rows) {
    out(`${r.task.id}  ${r.task.skill}  ${r.task.difficulty}  ${r.task.variants.map((v) => v.name).join(',')}  ${r.runs}  ${microsUsd(r.estimate)}  ${microsUsd(r.hardStop)}  ${microsUsd(r.need)}`);
  }
  out(`Runs: ${p.runs}`);
  out(`Judge calls: ${p.judges}`);
  out(`Estimate: ${microsUsd(p.estimate)}`);
  out(`Cap: ${microsUsd(p.cap)}`);
  out(`Margin: ${microsUsd(p.margin)}`);
  out(`Start-rule factor: ${factorText(p.hundredths)} (every price can grow by this factor and the start rule still lets every task start in order)`);
}

/** The prices, judge price and cap a plan or a round starts from. */
export function settings(cfg, o) {
  const cli = parsePrices(o.prices);
  const prices = Object.fromEntries(Object.keys(cfg.prices).map((d) => [d, priceOf(d, cfg, cli)]));
  const capMicros = o.maxUsd === undefined ? cfg.capMicros : parseUsdMicros(o.maxUsd);
  if (!capMicros) throw new Error(`--max-usd takes US dollars above 0 with at most 6 decimals: ${o.maxUsd}`);
  const judgeMicros = o.usdPerJudge === undefined ? cfg.judgeMicros : parseUsdMicros(o.usdPerJudge);
  if (!judgeMicros) throw new Error(`--usd-per-judge takes US dollars above 0 with at most 6 decimals: ${o.usdPerJudge}`);
  return { cli, prices, capMicros, judgeMicros };
}

export function planCommand(o, out, err) {
  const refuse = (...lines) => { for (const l of lines) err(`refused: ${l}`); return 1; };
  let cfg;
  let s;
  try { cfg = loadConfig(o.config); s = settings(cfg, o); } catch (e) { return refuse(e.message); }
  const { tasks, problems, warnings } = loadTasks(cfg);
  if (problems.length) return refuse('these tasks break contract 1 (FORMAT.md):', ...problems);
  const n = o.n ?? cfg.n;
  const ordered = runOrder(tasks, cfg);
  const many = runCountProblems(ordered, n);
  if (many.length) return refuse(...many);
  for (const w of warnings) err(`warning: ${w}`);
  const p = planRows(ordered, { prices: s.prices, factor: cfg.hardStopFactor, judgeMicros: s.judgeMicros, n, capMicros: s.capMicros });
  out(`Model: ${o.model}`);
  renderPlan(p, out);
  if (p.estimate > p.cap) return refuse(`the estimate ${microsUsd(p.estimate)} passes the cap ${microsUsd(p.cap)}`);
  if (p.hundredths !== null && p.hundredths < 100) err('warning: at these prices the start rule would skip a task before the end of the order');
  return 0;
}
