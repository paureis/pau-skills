// skills-bench runner: what each run of a task did, from its transcript, and its grade from the task's code grader.
// The grader gets a copy of the run folder, so nothing it does can reach the diff that blind reads later.
import { existsSync, readFileSync, mkdtempSync, mkdirSync, cpSync, rmSync } from 'node:fs';
import { join, basename, relative, isAbsolute } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { extractActions, childEnv, readJson, writeJson, usdMicros, firstLine, pathPairs, replaceDeep } from './common.mjs';
import { resultPath } from './state.mjs';

const EDIT_TOOLS = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'];
const GRADE_LIMIT_MS = 5 * 60_000;

/** True for a test file: a path with a test, tests or __tests__ part, or a name with .test., .spec., _test. or test_. */
export function isTestPath(p) {
  const parts = String(p).split(/[\\/]/).filter(Boolean);
  const name = parts[parts.length - 1] || '';
  return parts.slice(0, -1).some((x) => ['test', 'tests', '__tests__'].includes(x))
    || ['.test.', '.spec.', '_test.'].some((s) => name.includes(s)) || name.startsWith('test_');
}

/** skillStarted and the process signals of one run's actions. */
export function processSignals(x, skill, runDir) {
  const rel = (p) => {
    const r = runDir ? relative(runDir, p) : p;
    return r && !r.startsWith('..') && !isAbsolute(r) ? r : p;
  };
  // A Skill step's target is the skill's name and its arguments; a plugin skill is named <plugin>:<skill>.
  const named = (s) => { const name = s.target.split(/\s/)[0]; return name === skill || name.endsWith(`:${skill}`); };
  const skillStarted = x.steps.some((s) => s.tool === 'Skill' && named(s));
  const edits = x.steps.filter((s) => EDIT_TOOLS.includes(s.tool));
  const firstTest = edits.find((s) => isTestPath(rel(s.target)));
  const firstSource = edits.find((s) => !isTestPath(rel(s.target)));
  const until = firstSource ? firstSource.n : Infinity;
  const failedBefore = x.steps.some((s) => s.n < until && ['Bash', 'PowerShell'].includes(s.tool) && s.failed);
  return {
    skillStarted,
    process: { firstTestEditStep: firstTest?.n ?? null, firstSourceEditStep: firstSource?.n ?? null, failedCommandBeforeFirstSourceEdit: failedBefore },
  };
}

/** The subtype of a transcript's last result line, or null. */
export function lastResultSubtype(text) {
  let sub = null;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.includes('"result"')) continue;
    try { const e = JSON.parse(line); if (e.type === 'result') sub = e.subtype ?? null; } catch { /* not JSON */ }
  }
  return sub;
}

const isCheck = (c) => c && typeof c.name === 'string' && ['outcome', 'process'].includes(c.kind)
  && typeof c.required === 'boolean' && typeof c.pass === 'boolean' && typeof c.detail === 'string';

/** Contract 2: the grade of one run folder, from a copy of it. { grade, gradeError }, one of them null. */
export function gradeRun(graderFile, taskDir, runDir) {
  if (!existsSync(runDir)) return { grade: null, gradeError: 'the run folder is gone' };
  const tmp = mkdtempSync(join(tmpdir(), 'g-'));
  try {
    const copy = join(tmp, basename(runDir));
    cpSync(runDir, copy, { recursive: true });
    mkdirSync(join(tmp, 'home'));
    const r = spawnSync(process.execPath, [graderFile, '--task', taskDir, '--run', copy], {
      cwd: tmp, env: childEnv(process.env, join(tmp, 'home')), encoding: 'utf8', timeout: GRADE_LIMIT_MS, maxBuffer: 16 << 20,
    });
    const hide = (v) => replaceDeep(v, pathPairs([[copy, '<project>'], [tmp, '<tmp>']]));
    if (r.error || r.signal) return { grade: null, gradeError: hide(`the grader did not finish: ${r.error?.code || r.signal}`) };
    if (r.status !== 0) return { grade: null, gradeError: hide(`the grader exited ${r.status}: ${firstLine(r.stderr) || 'no reason given'}`) };
    const lines = r.stdout.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length !== 1) return { grade: null, gradeError: `the grader printed ${lines.length} lines, not one JSON line` };
    let g;
    try { g = JSON.parse(lines[0]); } catch { return { grade: null, gradeError: 'the grader did not print JSON' }; }
    if (typeof g.pass !== 'boolean' || typeof g.score !== 'number' || g.score < 0 || g.score > 1 || !Array.isArray(g.checks) || !g.checks.every(isCheck)) {
      return { grade: null, gradeError: 'the grader printed JSON that is not contract 2: { pass, score, checks: [{ name, kind, required, pass, detail }] }' };
    }
    const outcome = g.checks.filter((c) => c.kind === 'outcome');
    const outcomeScore = outcome.length ? outcome.filter((c) => c.pass).length / outcome.length : null;
    return { grade: hide({ pass: g.pass, score: g.score, checks: g.checks, outcomeScore }), gradeError: null };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/**
 * Reads every run of a finished task from its lab, writes its result.json and returns the charges: a run's cost from
 * its result line, or its hard stop when it has none (it failed, or was killed at its timeout).
 */
export function collectTask(task, t, s, round, cfg) {
  const lab = t.lab;
  const plan = readJson(join(lab, 'plan.json'));
  const counts = {};
  const runs = [];
  let charged = 0;
  let made = 0;
  const models = new Set(s.modelsReported);
  for (const r of plan.runs) {
    counts[r.variant] = (counts[r.variant] || 0) + 1;
    const n = counts[r.variant];
    const resFile = join(lab, 'runs', `${r.id}.json`);
    const res = existsSync(resFile) ? readJson(resFile) : null;
    if (res) made++;
    const tFile = join(lab, 'runs', `${r.id}.jsonl`);
    const text = existsSync(tFile) ? readFileSync(tFile, 'utf8') : '';
    const x = extractActions(text);
    if (x.model) models.add(x.model);
    const cost = x.finished ? usdMicros(x.costUsd) : null;
    charged += cost ?? t.hardStopMicros;
    if (cost !== null) s.seenMicros[task.difficulty] = Math.max(s.seenMicros[task.difficulty] || 0, cost);
    const { grade, gradeError } = gradeRun(join(cfg.tasksDir, task.skill, 'grade.mjs'), task.dir, r.dir);
    const result = {
      format: 'skills-bench-run/1', roundId: s.roundId, skill: task.skill, task: task.id, difficulty: task.difficulty,
      variant: r.variant, n, runId: r.id, finished: x.finished, exit: res ? res.exit ?? null : null,
      resultSubtype: lastResultSubtype(text), seconds: res ? res.seconds ?? null : null, costMicros: cost, turns: x.turns,
      toolCalls: x.steps.length, failedToolCalls: x.steps.filter((st) => st.failed).length, denials: x.denials.length,
      ...processSignals(x, task.skill, r.dir), grade, gradeError, judge: null, judgeLetter: null,
    };
    writeJson(resultPath(round, task, r.variant, n), result);
    runs.push({ id: r.id, variant: r.variant, n, dir: r.dir, home: r.home, finished: x.finished });
  }
  s.modelsReported = [...models].sort();
  Object.assign(t, { status: 'done', runs, runsMade: made, spentMicros: charged, dropouts: runs.filter((r) => !r.finished).map((r) => r.id) });
  s.spentMicros += charged;
  return charged;
}
