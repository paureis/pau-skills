// REPORT.md from a summary. Only fixed text and numbers: no text a model wrote (the judge's verdicts stay in their
// own files). Names and owner text from the round go in inline code with dashes and backticks replaced, so a report
// saved in the repository passes tests/style.test.mjs.
import { DIFFICULTIES } from './read.mjs';

const clean = (s) => String(s).replace(/[–—]/g, '-').replace(/[`\r\n]/g, ' ').replace(/\|/g, '/').trim();
const code = (s) => `\`${clean(s)}\``;

function num(x, places = 3) {
  if (x === null || x === undefined) return 'n/a';
  const v = Number(x.toFixed(places));
  return (Object.is(v, -0) ? 0 : v).toFixed(places);
}
const pct = (x) => (x === null || x === undefined ? 'n/a' : `${Math.round(x * 100)}%`);
const interval = (w, places = 3) => (w.lo === null || w.lo === undefined ? 'no interval' : `${num(w.lo, places)} to ${num(w.hi, places)}`);
const dfText = (df, places = 2) => (df === null || df === undefined ? 'n/a' : num(df, places));
const yesNo = (b) => (b === null || b === undefined ? 'n/a' : b ? 'yes' : 'no');

/** Whole micro-dollars as dollars with all six decimals, so nothing is rounded for display. */
function dollars(micros) {
  if (micros === null || micros === undefined) return 'n/a';
  return `$${Math.floor(micros / 1e6)}.${String(micros % 1e6).padStart(6, '0')}`;
}

const table = (head, rows) => [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)];

function header(s) {
  const r = s.round;
  return [
    `# Skills Bench round ${clean(r.roundId ?? 'unnamed')}`,
    '',
    `Model ${code(r.model ?? 'unknown')}, judge ${code(r.judgeModel ?? 'unknown')}, Claude Code ${code(r.claudeVersion ?? 'unknown')}, auth ${code(r.auth ?? 'unknown')}.`,
    `Started ${code(r.startedAt ?? 'unknown')}, ended ${code(r.endedAt ?? 'unknown')}. Runs per arm planned: ${r.n ?? 'n/a'}. Calibration round: ${yesNo(r.calibration)}.`,
    `Spent ${dollars(r.spentMicros)} of a ${dollars(r.capMicros)} cap (${clean(r.currency ?? 'USD')}).`,
    '',
    `Intervals are ${Math.round(s.level * 100)}%. Scores run from 0 to 1; with minus without above 0 means the skill helped.`,
    'A run with no grade is a dropout: it counts in runs and cost, never in pass rate or scores.',
    'The methods and their sources are in apps/skills-bench/ANALYSIS.md.',
  ];
}

function problems(s) {
  return ['## Problems', '', ...(s.problems.length ? s.problems.map((p) => `- ${code(p)}`) : ['None.'])];
}

function cells(s) {
  const head = ['Skill', 'Task', 'Difficulty', 'Variant', 'Runs', 'Graded', 'Dropouts', 'Pass rate', 'Mean score',
    'Mean outcome', 'Judge mean', 'Cost per run (mean, max)', 'Seconds per run (mean, max)', 'Skill start rate', 'Note'];
  const rows = s.cells.map((c) => [code(c.skill), code(c.task), c.difficulty, c.variant, c.runs, c.graded, c.dropouts,
    num(c.passRate), num(c.meanScore), num(c.meanOutcomeScore), num(c.judgeMean, 2),
    `${dollars(c.costMeanMicros)}, ${dollars(c.costMaxMicros)}`, `${num(c.secondsMean, 1)}, ${c.secondsMax ?? 'n/a'}`,
    num(c.skillStartRate, 2), c.flag ?? '']);
  return ['## Runs per task and variant', '', ...table(head, rows)];
}

function tasks(s) {
  const head = ['Skill', 'Task', 'Difficulty', 'Control', 'Score difference', 'Welch interval', 'df',
    'Pass rate difference', 'Newcombe interval', 'Note'];
  const rows = s.tasks.map((t) => {
    const notes = [...new Set([t.score.flag && `score: ${t.score.flag}`, t.pass.flag && `pass rate: ${t.pass.flag}`].filter(Boolean))];
    return [code(t.skill), code(t.task), t.difficulty, yesNo(t.control), num(t.score.diff), interval(t.score),
      dfText(t.score.df), num(t.pass.diff), interval(t.pass), notes.join('; ')];
  });
  return ['## With minus without, per task', '', 'Score: difference in mean score with a Welch t interval. Pass rate: difference with a Newcombe hybrid score interval.', '', ...table(head, rows)];
}

function skills(s) {
  const head = ['Skill', 'Tasks (k)', 'Mean difference', 't interval', 'df', 'Note'];
  const rows = s.skills.map((k) => [code(k.skill), k.paired.k, num(k.paired.mean), interval(k.paired), dfText(k.paired.df, 0), k.paired.flag ?? '']);
  const dHead = ['Skill', 'Difficulty', 'Tasks (k)', 'Mean difference', 'Interval', 'df', 'Note'];
  const dRows = s.skills.flatMap((k) => DIFFICULTIES.map((d) => {
    const p = k.byDifficulty[d];
    if (p.welch) return [code(k.skill), d, p.k, num(p.mean), `${interval(p.welch)} (Welch)`, dfText(p.welch.df), p.flag];
    return [code(k.skill), d, p.k, num(p.mean), interval(p), dfText(p.df, 0), p.flag ?? ''];
  }));
  return [
    '## With minus without, per skill', '',
    'Paired over tasks: for each task with graded runs in both arms, mean score with minus mean score without; then a t interval on k - 1 df over those tasks.', '',
    ...table(head, rows), '',
    '## Per skill and difficulty', '',
    'The same over the tasks of one difficulty. Two tasks give df 1, so the interval is wide. One task has no paired interval; its Welch interval from the runs is shown instead.', '',
    ...table(dHead, dRows),
  ];
}

const verdictText = (v) => (v.asExpected === null ? 'not known (no interval)' : v.asExpected ? 'as expected' : 'not as expected');

function controls(s) {
  const c = s.controls;
  if (!c.tasks.length) return ['## Controls', '', 'No task has both broken and empty runs, so there are no controls in this round.'];
  const head = ['Skill', 'Task', 'Check', 'Difference', 'Welch interval', 'Excludes 0', 'Verdict'];
  const line = (skill, task, v, label) => [skill, task, label, num(v.diff), interval(v), yesNo(v.excludesZero), verdictText(v)];
  const rows = c.tasks.flatMap((t) => [line(code(t.skill), code(t.task), t.broken, 'broken minus with'), line(code(t.skill), code(t.task), t.empty, 'empty minus without')]);
  if (c.pooled) rows.push(line('pooled', 'all controls', c.pooled.broken, 'broken minus with'), line('pooled', 'all controls', c.pooled.empty, 'empty minus without'));
  return [
    '## Controls', '',
    'Control tasks are the tasks with broken and empty runs; their with and without runs also count above like any task.',
    'Broken is as expected when its difference is below 0. Empty is as expected when its interval includes 0. Pooled puts the runs of every control task together.', '',
    ...table(head, rows),
  ];
}

function agreement(s) {
  const a = s.agreement;
  const out = ['## Judge agreement with the owner\'s grades', ''];
  if (!a.skills.length) return [...out, a.note ?? 'judge agreement not measured'];
  const head = ['Criterion', 'Text', 'Pairs', 'Exact', 'Within one', 'Mean gap', 'Weighted kappa'];
  const kappa = (r) => (r.kappa === null ? r.kappaFlag : num(r.kappa));
  const stats = (r) => [r.pairs, pct(r.exact), pct(r.withinOne), num(r.meanAbsDiff, 2), kappa(r)];
  for (const k of a.skills) {
    out.push(`### ${code(k.skill)}`, '');
    if (!k.measured) out.push(k.note, '');
    if (k.criteria) {
      if (k.measured) {
        out.push(...table(head, [...k.criteria.map((c) => [c.n, code(c.text), ...stats(c)]), ['overall', '', ...stats(k.overall)]]), '');
        out.push('Pairs 2 or more apart:', '', ...(k.disagreements.length
          ? k.disagreements.map((d) => `- criterion ${d.n}, letter ${d.label}: judge ${d.judge}, owner ${d.mine}`) : ['None.']), '');
      }
      if (k.problems.length) out.push('Lines in the owner file that were not used:', '', ...k.problems.map((p) => `- ${code(p)}`), '');
    }
  }
  if (a.overall) out.push(`All skills together: ${a.overall.pairs} pairs, exact ${pct(a.overall.exact)}, within one ${pct(a.overall.withinOne)}, mean gap ${num(a.overall.meanAbsDiff, 2)}, weighted kappa ${a.overall.kappa === null ? a.overall.kappaFlag : num(a.overall.kappa)}.`);
  else if (a.note) out.push(a.note);
  out.push('', 'Weighted kappa uses quadratic weights on the 1 to 5 scale: 1 is full agreement, 0 is what chance gives.');
  return out;
}

function recommendation(s) {
  const r = s.recommendation;
  const out = ['## Recommendation for a full round', ''];
  const costs = DIFFICULTIES.map((d) => `${d} ${dollars(r.costPerRun[d].meanMicros)} (${r.costPerRun[d].runs} runs)`).join(', ');
  out.push(`- Observed cost per run, with and without runs: ${costs}.`);
  out.push(`- Observed judge cost per call: ${dollars(r.judge.meanMicros)} (${r.judge.calls} calls).`);
  if (r.runsPerArm === null) return [...out, `- ${r.flag}.`];
  out.push(`- To detect a difference of ${r.delta} in mean score at alpha ${r.alpha} and power ${r.power}, from the pooled within-arm SD ${num(r.pooledSd)} (${r.pooledDf} df over ${r.cellsUsed} with and without arms): ${r.runsPerArm} runs per arm.`);
  const f = r.fullRound;
  const counts = DIFFICULTIES.map((d) => `${f.tasks[d]} ${d}`).join(', ');
  out.push(`- Full round: the same tasks (${counts}), with and without only, ${f.runs} runs; a judge call reviews ${r.runsPerJudgeCall} runs at most, so ${f.judgeCalls} judge calls.`);
  out.push(r.budgetMicros === null ? `- ${r.flag}.` : `- Full round budget ${dollars(r.budgetMicros)}: runs at the observed mean cost of their difficulty plus the judge calls, rounded up once to the micro-dollar.`);
  if (r.flag && r.budgetMicros !== null) out.push(`- ${r.flag}.`);
  return out;
}

/** The text of REPORT.md. */
export function renderReport(s) {
  return `${[header(s), problems(s), cells(s), tasks(s), skills(s), controls(s), agreement(s), recommendation(s)]
    .map((part) => part.join('\n')).join('\n\n')}\n`;
}
