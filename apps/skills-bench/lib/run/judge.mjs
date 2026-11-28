// skills-bench runner: the judge command. One blind judge per task: skill-eval blind makes the letters and the bundle,
// and the bundle goes to claude with no tools, an empty HOME and an empty working folder. skill-eval's own judge needs
// my-read.md first, so it is not used; the owner's grades play that role here.
import { existsSync, readFileSync, writeFileSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import {
  judgeArgv, childEnv, claudeCommand, parseScores, readJson, writeJson, usdMicros, microsUsd, lastLines, MAX_BYTES,
  skillEval, pathPairs, replaceDeep,
} from './common.mjs';
import { rubricCriteria } from './config.mjs';
import { loadRound, saveState, resultPath } from './state.mjs';

const JUDGE_LIMIT_MS = 30 * 60_000;

/** The reply text cut to fit the repository's file size, with a marker line when cut. */
export function fitText(text, limit = MAX_BYTES) {
  const body = String(text).endsWith('\n') ? String(text) : `${text}\n`;
  if (Buffer.byteLength(body) <= limit) return body;
  const marker = `\n[cut: the reply was ${Buffer.byteLength(body)} bytes; the first part is kept to fit ${limit}]\n`;
  const cut = Buffer.from(body).subarray(0, limit - Buffer.byteLength(marker) - 4).toString('utf8').replace(/�+$/, '');
  return `${cut}${marker}`;
}

export const judgePaths = (round, t, id) => ({
  json: join(round, 'judge', t.skill, `${id}.json`), verdict: join(round, 'judge', t.skill, `${id}.verdict.txt`),
});

/** Asks the judge about one task; returns { costMicros, problem }. Writes the verdict and the judge file. */
function judgeTask(id, t, s, round, o, out) {
  const lab = t.lab;
  const blindDir = join(round, 'blind', id);
  const key = readJson(join(lab, 'key.json'));
  const home = o.realHome ? process.env.HOME : mkdtempSync(join(tmpdir(), 'h-'));
  const cwd = mkdtempSync(join(tmpdir(), 'j-'));
  let r;
  const pairs = pathPairs([[cwd, '<tmp>'], [home, '<home>']]);
  try {
    const { file, args } = claudeCommand(judgeArgv({ model: o.judgeModel }));
    r = spawnSync(file, args, {
      cwd, env: childEnv(process.env, home, o.passEnv), input: readFileSync(join(blindDir, 'bundle.md'), 'utf8'),
      encoding: 'utf8', timeout: JUDGE_LIMIT_MS, maxBuffer: 64 << 20,
    });
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    if (!o.realHome) rmSync(home, { recursive: true, force: true });
  }
  let res = null;
  try { res = JSON.parse(r.stdout); } catch { /* not one JSON result */ }
  const cost = usdMicros(res?.total_cost_usd);
  // No cost line: charged what a judge call may cost at most.
  const costMicros = cost ?? s.hardStopFactor * s.judgeMicros;
  if (r.status !== 0 || !res) return { costMicros, problem: `the judge exited ${r.status ?? r.signal ?? r.error?.code}${res ? '' : ' without one JSON result'}: ${lastLines(r.stderr) || 'no reason given'}` };
  const text = replaceDeep(String(res.result ?? ''), pairs);
  const paths = judgePaths(round, t, id);
  mkdirSync(join(round, 'judge', t.skill), { recursive: true });
  writeFileSync(paths.verdict, fitText(text));
  const { criteria } = rubricCriteria(join(s.tasksDir, t.skill, 'rubric.md'));
  writeJson(paths.json, { model: o.judgeModel, costMicros, criteria });
  const scores = parseScores(text).criteria;
  for (const [letter, runId] of Object.entries(key.labels)) {
    const run = t.runs.find((x) => x.id === runId);
    if (!run) continue;
    const f = resultPath(round, { skill: t.skill, id }, run.variant, run.n);
    const result = readJson(f);
    const judge = {};
    for (const c of scores) if (letter in c.scores && criteria.some((k) => k.n === c.n)) judge[c.n] = c.scores[letter];
    result.judge = Object.keys(judge).length ? judge : null;
    result.judgeLetter = letter;
    writeJson(f, result);
  }
  const read = scores.filter((c) => Object.keys(c.scores).length).length;
  out(`${id}: judged ${Object.keys(key.labels).length} outputs, ${read} criteria read, ${microsUsd(costMicros)}`);
  return { costMicros, problem: null };
}

export async function judgeCommand(o, out, err) {
  const refuse = (...lines) => { for (const l of lines) err(`refused: ${l}`); return 1; };
  const round = resolve(o.round);
  let s;
  try { s = loadRound(round); } catch (e) { return refuse(e.message); }
  if (s.judgeModel && s.judgeModel !== o.judgeModel) return refuse(`this round was judged by ${s.judgeModel}; one round has one judge model`);
  s.judgeModel = o.judgeModel;
  s.passEnv = [...new Set([...(s.passEnv || []), ...o.passEnv])].sort();
  let failed = 0;
  // A judge compares runs: a task with fewer than 2 finished runs has nothing to compare, and is skipped.
  const finished = (t) => (t.runs || []).filter((r) => r.finished).length;
  const judgeable = (t) => t.status === 'done' && !t.judged && finished(t) >= 2;
  for (const id of s.planned) {
    const t = s.tasks[id];
    if (t.status !== 'done' || t.judged) continue;
    if (!judgeable(t)) {
      Object.assign(t, { judgeStatus: 'skipped', judgeReason: `fewer than 2 finished runs (${finished(t)} of ${t.runs.length})` });
      saveState(round, s);
      out(`${id}: judge skipped: ${t.judgeReason}`);
      continue;
    }
    // This judge and the ones still to come: a task that is never judged holds nothing back here.
    const reserve = s.planned.filter((x) => judgeable(s.tasks[x])).length * s.judgeMicros;
    if (s.spentMicros + reserve > s.capMicros) {
      t.judgeStatus = 'not run (cap)';
      out(`${id}: judge not run (cap): ${microsUsd(s.spentMicros)} spent and ${microsUsd(reserve)} reserved pass the ${microsUsd(s.capMicros)} cap`);
      continue;
    }
    const { criteria, problems } = rubricCriteria(join(s.tasksDir, t.skill, 'rubric.md'));
    if (problems.length) return refuse(...problems);
    const blindDir = join(round, 'blind', id);
    if (!existsSync(join(t.lab, 'key.json')) || !existsSync(join(blindDir, 'bundle.md'))) {
      writeFileSync(join(t.lab, 'rubric.md'), ['# Rubric', '', `Task: ${t.summary}`, '', ...criteria.map((c) => `${c.n}. ${c.text}`), ''].join('\n'));
      rmSync(blindDir, { recursive: true, force: true });
      const b = await skillEval(['blind', t.lab, '--out', blindDir, '--force']);
      if (b.code !== 0) {
        Object.assign(t, { judgeStatus: 'failed', judgeReason: lastLines(b.stderr) });
        failed++;
        out(`${id}: blind failed: ${t.judgeReason}`);
        saveState(round, s);
        continue;
      }
    }
    const { costMicros, problem } = judgeTask(id, t, s, round, o, out);
    s.spentMicros += costMicros;
    t.judgeSpentMicros = (t.judgeSpentMicros || 0) + costMicros;
    if (problem) {
      Object.assign(t, { judgeStatus: 'failed', judgeReason: problem });
      failed++;
      err(`${id}: ${problem}`);
    } else {
      Object.assign(t, { judged: true, judgeStatus: 'done' });
    }
    saveState(round, s);
  }
  saveState(round, s);
  out(`Spent ${microsUsd(s.spentMicros)} of the ${microsUsd(s.capMicros)} cap`);
  return failed ? 1 : 0;
}
