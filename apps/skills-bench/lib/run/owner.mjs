// skills-bench runner: the owner sheet (10 blind runs the owner grades by hand) and reading the owner's grades back.
// The sheet holds the letter texts, the rubrics and empty grades files; which run each letter is goes only to
// <round>/owner/map.json.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomInt } from 'node:crypto';
import { parseScores, readJson, writeJson, isFreeFolder, DIFFICULTIES } from './common.mjs';
import { rubricCriteria } from './config.mjs';
import { loadRound, resultPath } from './state.mjs';

export const SHEET_SKILLS = [['tdd', 'ABCDE'], ['bug-fix', 'FGHIJ']];
const PER_SKILL = 5;

/** A small seeded generator (an LCG), so a sheet can be made again from its seed. */
function seeded(seed) {
  let a = (seed >>> 0) || 1;
  return () => { a = (Math.imul(a, 1664525) + 1013904223) >>> 0; return a / 4294967296; };
}

function shuffle(items, rng) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Five runs of one skill: every difficulty first, then the less picked variant and an unused task. */
export function pickRuns(cands, rng) {
  const pool = shuffle(cands, rng);
  const picks = [];
  const take = (pred) => {
    const count = (v) => picks.filter((p) => p.variant === v).length;
    const used = (id) => (picks.some((p) => p.task === id) ? 1 : 0);
    const ok = pool.filter((c) => !picks.includes(c) && pred(c));
    ok.sort((a, b) => count(a.variant) - count(b.variant) || used(a.task) - used(b.task));
    if (ok.length) picks.push(ok[0]);
  };
  for (const d of [...DIFFICULTIES].reverse()) take((c) => c.difficulty === d);
  while (picks.length < PER_SKILL && picks.length < pool.length) take(() => true);
  return picks;
}

export function ownerSheetCommand(o, out, err) {
  const refuse = (...lines) => { for (const l of lines) err(`refused: ${l}`); return 1; };
  const round = resolve(o.round);
  const dest = resolve(o.out);
  let s;
  try { s = loadRound(round); } catch (e) { return refuse(e.message); }
  const mapFile = join(round, 'owner', 'map.json');
  if (existsSync(mapFile)) return refuse(`an owner sheet was made for this round already (${mapFile}); a new one needs new grades, so remove ${join(round, 'owner')} first`);
  if (!isFreeFolder(dest)) return refuse(`${dest} is not a new or empty folder`);
  const seed = o.seed ?? randomInt(2 ** 31);
  const rng = seeded(seed);
  const map = {};
  const files = {};
  for (const [skill, letters] of SHEET_SKILLS) {
    const cands = [];
    for (const id of s.planned) {
      const t = s.tasks[id];
      if (t.skill !== skill || !t.judged) continue;
      for (const r of t.runs.filter((x) => ['with', 'without'].includes(x.variant))) {
        const res = readJson(resultPath(round, { skill, id }, r.variant, r.n));
        if (res.finished && res.judgeLetter && existsSync(join(round, 'blind', id, `${res.judgeLetter}.md`))) {
          cands.push({ skill, task: id, difficulty: t.difficulty, variant: r.variant, n: r.n, letter: res.judgeLetter });
        }
      }
    }
    const picks = pickRuns(cands, rng);
    const lack = [
      ...(picks.length < PER_SKILL ? [`${PER_SKILL} finished runs`] : []),
      ...['with', 'without'].filter((v) => !picks.some((p) => p.variant === v)).map((v) => `a ${v} run`),
      ...DIFFICULTIES.filter((d) => !picks.some((p) => p.difficulty === d)).map((d) => `a ${d} run`),
    ];
    if (lack.length) return refuse(`${skill} has no judged set of runs with ${lack.join(', ')}; judge more tasks first`);
    const { criteria } = rubricCriteria(join(s.tasksDir, skill, 'rubric.md'));
    shuffle(picks, rng).forEach((p, i) => {
      const L = letters[i];
      const plan = readJson(join(s.tasks[p.task].lab, 'plan.json'));
      const text = readFileSync(join(round, 'blind', p.task, `${p.letter}.md`), 'utf8').replace(/^# Output [A-Z][ \t]*$/m, `# Output ${L}`);
      files[`${L}.txt`] = [`Task: ${s.tasks[p.task].summary}`, '', 'Prompt:', '', plan.prompts[p.variant], '', text].join('\n');
      map[L] = { skill, task: p.task, difficulty: p.difficulty, variant: p.variant, n: p.n };
    });
    files[`rubric-${skill}.txt`] = [`Rubric for letters ${letters[0]} to ${letters[PER_SKILL - 1]}`, '',
      ...criteria.map((c) => `${c.n}. ${c.text}`), '',
      `Score every letter 1 to 5 on every criterion in grades-${skill}.txt: replace each ?/5 with your score and <your reason> with what you saw.`, ''].join('\n');
    files[`grades-${skill}.txt`] = criteria.map((c) => [`Criterion ${c.n}: ${c.text}`,
      ...[...letters].map((L) => `  ${L}: ?/5  <your reason>`), ''].join('\n')).join('\n');
  }
  mkdirSync(dest, { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dest, name), text.endsWith('\n') ? text : `${text}\n`);
  writeJson(mapFile, map);
  out(`Owner sheet: ${dest} (${Object.keys(map).length} letters, seed ${seed})`);
  out(`The map is only in ${mapFile}; the sheet does not hold it.`);
  return 0;
}

/** Why a grades file is not complete for its letters and criteria, as sentences. */
export function gradeProblems(text, letters, criteria) {
  const { criteria: got, problems } = parseScores(text);
  const out = [...problems];
  for (const g of got) {
    if (!criteria.some((c) => c.n === g.n)) out.push(`criterion ${g.n} is not in the rubric`);
    for (const L of Object.keys(g.scores)) if (!letters.includes(L)) out.push(`criterion ${g.n} scores ${L}, which is not one of ${letters.join(', ')}`);
  }
  for (const c of criteria) {
    const blocks = got.filter((g) => g.n === c.n);
    if (blocks.length > 1) out.push(`criterion ${c.n} is there ${blocks.length} times`);
    for (const L of letters) if (!blocks.length || !(L in blocks[0].scores)) out.push(`criterion ${c.n} has no 1 to 5 score for ${L}`);
  }
  return out;
}

export function ownerGradesCommand(o, out, err) {
  const refuse = (...lines) => { for (const l of lines) err(`refused: ${l}`); return 1; };
  const round = resolve(o.round);
  let s;
  try { s = loadRound(round); } catch (e) { return refuse(e.message); }
  const mapFile = join(round, 'owner', 'map.json');
  if (!existsSync(mapFile)) return refuse(`${mapFile} is missing; make the owner sheet first`);
  const map = readJson(mapFile);
  const texts = {};
  const problems = [];
  for (const [skill, file] of [['tdd', o.tdd], ['bug-fix', o.bugFix]]) {
    const f = resolve(file);
    if (!existsSync(f)) { problems.push(`${skill}: ${f} does not exist`); continue; }
    texts[skill] = readFileSync(f, 'utf8');
    const letters = Object.keys(map).filter((L) => map[L].skill === skill).sort();
    const { criteria } = rubricCriteria(join(s.tasksDir, skill, 'rubric.md'));
    problems.push(...gradeProblems(texts[skill], letters, criteria).map((p) => `${skill}: ${p}`));
  }
  if (problems.length) {
    return refuse('the grades are not complete; every letter needs a 1 to 5 score on every criterion (a "?/5" line left as it is ends its block, so the lines after it are not read):', ...problems);
  }
  for (const [skill, text] of Object.entries(texts)) writeFileSync(join(round, 'owner', `grades-${skill}.txt`), text);
  out(`Stored the owner's grades in ${join(round, 'owner')}: grades-tdd.txt and grades-bug-fix.txt`);
  return 0;
}
