// How well the judge's 1 to 5 scores agree with the owner's own grades of the same runs. The owner's grades are in
// the skill-eval score format and are read with that skill's parser, so a line it cannot read is reported the same way.
import { parseScores, disagreements } from '../../../../skills/verification/skill-eval/skill-eval-core.mjs';
import { weightedKappa } from './stats.mjs';

const SCALE = [1, 2, 3, 4, 5];
const sameRun = (r, m) => r.skill === m.skill && r.task === m.task && r.variant === m.variant && r.n === m.n;

/** Exact share, within-one share, mean absolute difference and quadratic weighted kappa of [judge, owner] pairs. */
export function agreementOf(pairs) {
  const n = pairs.length;
  const k = weightedKappa(pairs, SCALE);
  if (!n) return { pairs: 0, exact: null, withinOne: null, meanAbsDiff: null, kappa: null, kappaFlag: k.flag };
  const gaps = pairs.map(([a, b]) => Math.abs(a - b));
  return {
    pairs: n,
    exact: gaps.filter((g) => g === 0).length / n,
    withinOne: gaps.filter((g) => g <= 1).length / n,
    meanAbsDiff: gaps.reduce((a, b) => a + b, 0) / n,
    kappa: k.kappa,
    kappaFlag: k.flag,
  };
}

function skillAgreement(skill, text, map, runs) {
  const file = `owner/grades-${skill}.txt`;
  if (text === null) return { skill, measured: false, note: `judge agreement not measured: ${file} is missing` };
  const { criteria, problems: parsed } = parseScores(text);
  const problems = parsed.map((p) => `${file} ${p}`);
  const judged = [];
  const rows = [];
  for (const c of criteria) {
    const scores = {};
    const pairs = [];
    for (const [letter, mine] of Object.entries(c.scores)) {
      const where = `${file} criterion ${c.n}, letter ${letter}`;
      const m = map.get(letter);
      if (!m) { problems.push(`${where}: the letter is not in owner/map.json`); continue; }
      if (m.skill !== skill) { problems.push(`${where}: the map gives a ${m.skill} run`); continue; }
      const run = runs.find((r) => sameRun(r, m));
      if (!run) { problems.push(`${where}: no result.json for ${m.skill}/${m.task}/${m.variant}/${m.n}`); continue; }
      const j = run.judge === null ? undefined : run.judge[String(c.n)];
      if (j === undefined) { problems.push(`${where}: the judge gave no score for this criterion`); continue; }
      scores[letter] = j;
      pairs.push([j, mine]);
    }
    judged.push({ n: c.n, scores });
    rows.push({ n: c.n, text: c.text, ...agreementOf(pairs), pairList: pairs });
  }
  const all = rows.flatMap((r) => r.pairList);
  return {
    skill,
    measured: all.length > 0,
    note: all.length ? null : `judge agreement not measured: ${file} has no score that matches a judged run`,
    problems,
    criteria: rows.map(({ pairList, ...r }) => r),
    overall: agreementOf(all),
    disagreements: disagreements(judged, criteria),
    pairList: all,
  };
}

/** Judge agreement per skill, per criterion and overall; a missing owner file means "not measured", not a failure. */
export function judgeAgreement({ runs, owner }) {
  const skills = Object.keys(owner.grades);
  if (!owner.map) {
    const note = 'judge agreement not measured: owner/map.json is missing';
    return { measured: false, note, skills: skills.map((skill) => ({ skill, measured: false, note })), overall: null };
  }
  const per = skills.map((skill) => skillAgreement(skill, owner.grades[skill], owner.map, runs));
  const all = per.flatMap((p) => p.pairList ?? []);
  return {
    measured: all.length > 0,
    note: all.length ? null : 'judge agreement not measured: no owner grade matches a judged run',
    skills: per.map(({ pairList, ...p }) => p),
    overall: all.length ? agreementOf(all) : null,
  };
}
