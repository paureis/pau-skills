// The five production rules in skills/verification/launch-readiness/PRODUCTION-RULES.md, with copies in project-setup
// and rule-to-hook: the check ids they cite exist, the block between the markers holds five rules, the tables cover
// every rule and six ecosystems, the three skills point at their own copy, and project-setup's question ids line up.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { repo } from './helpers.mjs';

const SOURCE = repo('skills', 'verification', 'launch-readiness', 'PRODUCTION-RULES.md');
const AREAS = repo('skills', 'verification', 'launch-readiness', 'areas');
const SETUP = repo('skills', 'session-discipline', 'project-setup');
const START = '<!-- production rules start -->';
const END = '<!-- production rules end -->';
const ECOSYSTEMS = ['Python', 'JavaScript or TypeScript', 'Go', 'Java', 'Ruby', 'PHP'];
const ID = /\b[A-Z]{2,4}-\d{2}[A-Z]?\b/g;

const read = (p) => readFileSync(p, 'utf8');

// The text of a "## <heading>" section, up to the next "## " heading.
function section(text, heading) {
  const start = text.indexOf(`\n## ${heading}\n`);
  assert.notEqual(start, -1, `no "## ${heading}" section`);
  const rest = text.slice(start + heading.length + 5);
  const next = rest.search(/^## /m);
  return next === -1 ? rest : rest.slice(0, next);
}

// The cells of each table row in a section, header and separator rows left out.
const rows = (text) => text.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| ---'))
  .map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));

// The numbered rules between the two markers: [number, name].
function blockRules(text) {
  const block = text.slice(text.indexOf(START), text.indexOf(END));
  return [...block.matchAll(/^(\d)\. \*\*([^*]+)\.\*\* When /gm)].map((m) => [Number(m[1]), m[2]]);
}

test('every check id the rules cite exists in a launch-readiness area file', () => {
  const cited = [...new Set(read(SOURCE).match(ID) || [])];
  assert.ok(cited.length >= 1, 'PRODUCTION-RULES.md cites no check id');
  const headings = new Set(readdirSync(AREAS).filter((f) => f.endsWith('.md')).flatMap((f) =>
    [...read(`${AREAS}/${f}`).matchAll(/\*\*([A-Z]+-\d+[A-Z]?) [^*]+\*\* \(([^)]*)\)/g)].map((m) => m[1])));
  const missing = cited.filter((id) => !headings.has(id));
  assert.deepEqual(missing, [], `ids with no heading in areas/*.md: ${missing.join(', ')}`);
});

test('the block holds five rules between its two markers, each a condition then an instruction', () => {
  const text = read(SOURCE);
  for (const marker of [START, END]) {
    assert.notEqual(text.indexOf(marker), -1, `missing ${marker}`);
    assert.equal(text.indexOf(marker), text.lastIndexOf(marker), `${marker} appears more than once`);
  }
  assert.ok(text.indexOf(START) < text.indexOf(END), 'the start marker comes after the end marker');
  assert.deepEqual(blockRules(text).map(([n]) => n), [1, 2, 3, 4, 5]);
});

test('the tables cover each rule and the six ecosystems', () => {
  const text = read(SOURCE);
  const offer = rows(section(text, 'When to offer each rule')).filter((r) => /^\d /.test(r[0]));
  assert.deepEqual(offer.map((r) => Number(r[0].split(' ')[0])), [1, 2, 3, 4, 5]);
  assert.deepEqual(offer.map((r) => r[0].replace(/^\d /, '')), blockRules(text).map(([, name]) => name));
  for (const r of offer) assert.ok((r[1].match(ID) || []).length >= 1, `rule ${r[0]} prevents no check id`);
  for (const heading of ['Signals per ecosystem', 'Checkers per ecosystem']) {
    const names = rows(section(text, heading)).map((r) => r[0]);
    for (const e of ECOSYSTEMS) assert.ok(names.includes(e), `"${heading}" has no row for ${e}`);
  }
});

test('project-setup, rule-to-hook and launch-readiness point at their own copy', () => {
  for (const dir of [SETUP, repo('skills', 'guards', 'rule-to-hook'), repo('skills', 'verification', 'launch-readiness')]) {
    assert.ok(read(`${dir}/SKILL.md`).includes('${CLAUDE_SKILL_DIR}/PRODUCTION-RULES.md'), `${dir}/SKILL.md`);
    assert.ok(existsSync(`${dir}/PRODUCTION-RULES.md`), `${dir}/PRODUCTION-RULES.md is missing`);
  }
  for (const f of ['QUESTIONS.md', 'TEMPLATES.md']) assert.ok(read(`${SETUP}/${f}`).includes('PRODUCTION-RULES.md'), f);
});

test('project-setup question ids: Q1 to Q13 in order, every reference exists, and the quick list matches the (quick) questions', () => {
  const questions = read(`${SETUP}/QUESTIONS.md`);
  const ids = [...questions.matchAll(/^## Q(\d+)\. /gm)].map((m) => Number(m[1]));
  assert.deepEqual(ids, Array.from({ length: 13 }, (_, i) => i + 1));
  for (const f of ['SKILL.md', 'QUESTIONS.md', 'TEMPLATES.md']) {
    const bad = (read(`${SETUP}/${f}`).match(/\bQ\d+\b/g) || []).filter((q) => !ids.includes(Number(q.slice(1))));
    assert.deepEqual(bad, [], `${f} names questions that do not exist`);
  }
  const line = questions.split('\n').find((l) => l.includes('quick path asks only'));
  assert.ok(line, 'no "quick path asks only" line');
  const quick = [...questions.matchAll(/^## Q(\d+)\. .*\(quick\)$/gm)].map((m) => Number(m[1]));
  assert.deepEqual(line.match(/\bQ\d+\b/g).map((q) => Number(q.slice(1))), quick);
});
