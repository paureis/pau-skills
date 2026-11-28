// Reads a results folder in the skills-bench-results/1 format (round.json, one result.json per run, the judge
// files and the owner's grades) and checks every value the analysis uses. A bad round.json stops the analysis; a bad
// run file is left out and listed as a problem.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export const VARIANTS = ['with', 'without', 'broken', 'empty'];
export const DIFFICULTIES = ['simple', 'medium', 'complex'];
const MAX_BYTES = 2_000_000;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

const isUnit = (x) => typeof x === 'number' && x >= 0 && x <= 1;
const isMicros = (x) => Number.isSafeInteger(x) && x >= 0;
const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);

function readText(file) {
  const size = statSync(file).size;
  if (size > MAX_BYTES) throw new Error(`${file} is ${size} bytes; the limit is ${MAX_BYTES}`);
  return readFileSync(file, 'utf8');
}

function readJson(file) {
  try {
    return JSON.parse(readText(file));
  } catch (e) {
    throw new Error(`${file} is not readable JSON: ${e.message}`);
  }
}

/** Why a round.json cannot be analysed, or null. */
export function roundProblem(round) {
  if (!isObject(round)) return 'round.json is not an object';
  if (round.format !== 'skills-bench-results/1') return `round.json format is ${JSON.stringify(round.format)}, not "skills-bench-results/1"`;
  if (!Array.isArray(round.tasks)) return 'round.json has no tasks list';
  for (const [i, t] of round.tasks.entries()) {
    if (!isObject(t) || !NAME.test(t.skill ?? '') || !NAME.test(t.task ?? '')) return `round.json task ${i + 1} has no usable skill and task names`;
    if (!DIFFICULTIES.includes(t.difficulty)) return `round.json task ${t.skill}/${t.task} has difficulty ${JSON.stringify(t.difficulty)}`;
  }
  return null;
}

/** Why a result.json cannot be used, or null. `where` is { skill, task, variant, n } from its folder. */
export function runProblem(r, where) {
  if (!isObject(r)) return 'it is not an object';
  if (r.format !== 'skills-bench-run/1') return `format is ${JSON.stringify(r.format)}, not "skills-bench-run/1"`;
  for (const k of ['skill', 'task', 'variant', 'n']) {
    if (r[k] !== where[k]) return `${k} is ${JSON.stringify(r[k])} but the folder says ${JSON.stringify(where[k])}`;
  }
  // A run that never finished has no cost and no seconds (the runner writes null); it is a dropout.
  const unfinished = r.finished === false;
  if (!isMicros(r.costMicros) && !(unfinished && r.costMicros === null)) return `costMicros ${JSON.stringify(r.costMicros)} is not a whole number of micro-dollars`;
  if (!(typeof r.seconds === 'number' && r.seconds >= 0) && !(unfinished && r.seconds === null)) return `seconds ${JSON.stringify(r.seconds)} is not a number of 0 or more`;
  if (r.grade !== null) {
    if (!isObject(r.grade) || typeof r.grade.pass !== 'boolean') return 'grade is neither null nor an object with a pass true or false';
    if (!isUnit(r.grade.score)) return `grade score ${JSON.stringify(r.grade.score)} is not from 0 to 1`;
    if (!isUnit(r.grade.outcomeScore)) return `grade outcomeScore ${JSON.stringify(r.grade.outcomeScore)} is not from 0 to 1`;
  }
  if (r.judge !== null) {
    if (!isObject(r.judge)) return 'judge is neither null nor an object';
    for (const [k, v] of Object.entries(r.judge)) {
      if (!/^\d+$/.test(k) || !Number.isInteger(v) || v < 1 || v > 5) return `judge criterion ${k} has ${JSON.stringify(v)}, not a whole number from 1 to 5`;
    }
  }
  return null;
}

const listDirs = (dir) => (existsSync(dir) ? readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name) : []);

/**
 * Everything the analysis needs from a results folder:
 * { round, runs: [result.json], judgeCalls: [{ skill, task, costMicros }], owner: { map, grades: { skill: text|null } }, problems }.
 */
export function readResults(dir) {
  const roundFile = join(dir, 'round.json');
  if (!existsSync(roundFile)) throw new Error(`${roundFile} does not exist`);
  const round = readJson(roundFile);
  const bad = roundProblem(round);
  if (bad) throw new Error(bad);
  const problems = [];
  const runs = [];
  const judgeCalls = [];
  const seen = new Set();
  for (const t of round.tasks) {
    const key = `${t.skill}/${t.task}`;
    if (seen.has(key)) { problems.push(`round.json lists ${key} twice; the second entry is left out`); continue; }
    seen.add(key);
    for (const variant of listDirs(join(dir, t.skill, t.task))) {
      if (!VARIANTS.includes(variant)) { problems.push(`${key}/${variant} is not a variant (${VARIANTS.join(', ')}); left out`); continue; }
      for (const nName of listDirs(join(dir, t.skill, t.task, variant))) {
        const rel = `${key}/${variant}/${nName}/result.json`;
        const file = join(dir, t.skill, t.task, variant, nName, 'result.json');
        if (!/^[1-9]\d{0,3}$/.test(nName) || !existsSync(file)) { problems.push(`${rel} is missing or its folder is not a run number; left out`); continue; }
        let r;
        try { r = readJson(file); } catch (e) { problems.push(`${rel}: ${e.message}; left out`); continue; }
        const why = runProblem(r, { skill: t.skill, task: t.task, variant, n: Number(nName) });
        if (why) { problems.push(`${rel}: ${why}; left out`); continue; }
        runs.push({ ...r, difficulty: t.difficulty });
      }
    }
    const judgeFile = join(dir, 'judge', t.skill, `${t.task}.json`);
    if (existsSync(judgeFile)) {
      let j;
      try { j = readJson(judgeFile); } catch (e) { problems.push(`judge/${key}.json: ${e.message}; left out`); continue; }
      if (isObject(j) && isMicros(j.costMicros)) judgeCalls.push({ skill: t.skill, task: t.task, costMicros: j.costMicros });
      else problems.push(`judge/${key}.json has no whole costMicros; left out`);
    }
  }
  return { round, runs, judgeCalls, owner: readOwner(dir, round, problems), problems };
}

function readOwner(dir, round, problems) {
  const grades = {};
  for (const skill of [...new Set(round.tasks.map((t) => t.skill))]) {
    const f = join(dir, 'owner', `grades-${skill}.txt`);
    grades[skill] = existsSync(f) ? readText(f) : null;
  }
  const mapFile = join(dir, 'owner', 'map.json');
  let map = null;
  if (existsSync(mapFile)) {
    try {
      const m = readJson(mapFile);
      if (!isObject(m)) throw new Error('it is not an object');
      map = new Map();
      for (const [letter, v] of Object.entries(m)) {
        if (!/^[A-Z]$/.test(letter) || !isObject(v)) { problems.push(`owner/map.json: entry ${JSON.stringify(letter)} is not a letter with a run; left out`); continue; }
        map.set(letter, v);
      }
    } catch (e) {
      problems.push(`owner/map.json: ${e.message}`);
      map = null;
    }
  }
  return { map, grades };
}
