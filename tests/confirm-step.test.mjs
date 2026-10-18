// Every skill loads on its own (docs/BACKLOG.md, decision 7), so the model can start a skill the user never asked for.
// The skills that launch subagents or paid runs, take over the session, or write outside the conversation first say
// what they will do and what it costs, and wait for a yes. They all use the same paragraph, word for word, so the
// rule reads the same everywhere and this test can find it. The list below is the only place it is decided: a skill
// on it must carry the paragraph, and a skill not on it must not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const CONFIRM_PARAGRAPH = 'If you started this skill on your own, without the user typing its name or asking for what it does, first '
  + 'say in one or two lines what it will do and what it will cost, and wait for a yes. A remark or a question that '
  + 'only matches its description is not asking for it. If the user asked for it, or the brief you are working from '
  + 'does, go ahead.';

// Settled with the owner after the P0.5 review: only skills whose cost has no other gate. Skills that already stop
// for the user's yes before they write (retrospective, instructions-audit, to-issues, ci-cost-and-cadence,
// project-setup), conversations the user can stop with a word (brainstorm, grill-me) and skills that write only a
// local file or a proposal (handoff, to-prd, improve-codebase-architecture) do not ask twice.
const CONFIRM_LIST = [
  // launches subagents or headless runs
  'agent-orchestration/arena', 'agent-orchestration/codebase-oracle', 'agent-orchestration/parallel-worktrees',
  'planning/agent-friendly-audit', 'verification/hillclimb', 'verification/skill-eval', 'verification/verify-app',
  // commits, pushes or installs with no other gate
  'guards/dependency-upgrade', 'guards/rule-to-hook', 'planning/architect', 'session-discipline/session-close',
  // sets the whole session's way of working
  'agent-orchestration/lean-subagent-dev', 'agent-orchestration/methodology',
];

// The words every copy starts with: a paragraph that starts this way but differs is a copy that drifted.
const OPENING = 'If you started this skill on your own';

const normalize = (p) => p.replace(/\s+/g, ' ').trim();

// Paragraphs of a Markdown file, outside fenced code blocks (a skill may quote text in a fence without meaning it).
function paragraphs(text) {
  const out = [];
  let fence = null;
  let current = [];
  const flush = () => { if (current.length) out.push(normalize(current.join(' '))); current = []; };
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) { if (m && m[1][0] === fence[0] && m[1].length >= fence.length) fence = null; continue; }
    if (m) { flush(); fence = m[1]; continue; }
    if (!line.trim()) flush();
    else current.push(line);
  }
  flush();
  return out;
}

function markdownFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) out.push(...markdownFiles(f));
    else if (e.name.endsWith('.md')) out.push(f);
  }
  return out;
}

function readSkills() {
  const out = [];
  for (const plugin of readdirSync(join(ROOT, 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const s of readdirSync(join(ROOT, 'skills', plugin.name), { withFileTypes: true }).filter((d) => d.isDirectory())) {
      const dir = join(ROOT, 'skills', plugin.name, s.name);
      const skillMd = readFileSync(join(dir, 'SKILL.md'), 'utf8');
      const elsewhere = markdownFiles(dir).filter((f) => !f.endsWith(`${s.name}/SKILL.md`)).flatMap((f) => paragraphs(readFileSync(f, 'utf8')));
      const text = markdownFiles(dir).map((f) => readFileSync(f, 'utf8')).join('\n\n');
      out.push({ id: `${plugin.name}/${s.name}`, paragraphs: paragraphs(skillMd), elsewhere, text });
    }
  }
  return out;
}

// Each check returns what is wrong, so the same checks run on the repository and on the fixtures below.
const checks = {
  missing: (skills, list) => skills.filter((s) => list.includes(s.id) && !s.paragraphs.includes(CONFIRM_PARAGRAPH)).map((s) => s.id),
  repeated: (skills) => skills.filter((s) => s.paragraphs.filter((p) => p === CONFIRM_PARAGRAPH).length > 1).map((s) => s.id),
  // Anywhere in the skill's Markdown, not only at the start of a paragraph: a copy in a list item, a quote or the
  // tail of another paragraph asks for a yes just the same.
  unlisted: (skills, list) => skills.filter((s) => !list.includes(s.id) && normalize(s.text).includes(OPENING)).map((s) => s.id),
  drifted: (skills) => skills.flatMap((s) => [...s.paragraphs, ...s.elsewhere].filter((p) => p.startsWith(OPENING) && p !== CONFIRM_PARAGRAPH).map((p) => `${s.id}: ${p.slice(0, 120)}`)),
  outsideSkillMd: (skills) => skills.filter((s) => s.elsewhere.some((p) => p.startsWith(OPENING))).map((s) => s.id),
  unknown: (skills, list) => list.filter((id) => !skills.some((s) => s.id === id)),
};

const SKILLS = readSkills();

test('every skill on the confirm list carries the confirm paragraph in its SKILL.md, word for word', () => {
  assert.deepEqual(checks.missing(SKILLS, CONFIRM_LIST), []);
});

test('no skill carries the paragraph twice, and none carries a reworded copy', () => {
  assert.deepEqual(checks.repeated(SKILLS), []);
  assert.deepEqual(checks.drifted(SKILLS), []);
});

test('no skill off the confirm list carries the paragraph, and it lives only in SKILL.md', () => {
  assert.deepEqual(checks.unlisted(SKILLS, CONFIRM_LIST), []);
  assert.deepEqual(checks.outsideSkillMd(SKILLS), []);
});

test('every name on the confirm list is a skill', () => {
  assert.deepEqual(checks.unknown(SKILLS, CONFIRM_LIST), []);
});

// The README and the which-skill router each list the skills that ask first. Both lists name exactly the skills above.
function namedSkills(text, start, end) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `section from ${JSON.stringify(start)} to ${JSON.stringify(end)} not found`);
  const known = new Set(SKILLS.map((s) => s.id.split('/')[1]));
  return [...new Set([...text.slice(from, to).matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]).filter((n) => known.has(n)))].sort();
}
const listed = () => CONFIRM_LIST.map((id) => id.split('/')[1]).sort();

test('the README names exactly the skills on the confirm list', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.deepEqual(namedSkills(readme, 'Some skills cost something', 'keeps this list'), listed());
});

test('which-skill names exactly the skills on the confirm list', () => {
  const router = readFileSync(join(ROOT, 'skills', 'session-discipline', 'which-skill', 'SKILL.md'), 'utf8');
  assert.deepEqual(namedSkills(router, '## Which skills ask first', '\n## '), listed());
});

test('the paragraph has no dash and no XML-like tag', () => {
  assert.doesNotMatch(CONFIRM_PARAGRAPH, /[–—]|<[A-Za-z/]/);
});

test('each check catches its case on fixtures, and a wrapped copy still counts', () => {
  const wrapped = paragraphs(`# Title\n\nIntro.\n\n${CONFIRM_PARAGRAPH.replace('first say', 'first\nsay')}\n\n## Step 1`);
  assert.ok(wrapped.includes(CONFIRM_PARAGRAPH), 'a copy wrapped over two lines is the same paragraph');
  const fenced = paragraphs(`\`\`\`\n${CONFIRM_PARAGRAPH}\n\`\`\`\n\nAfter.`);
  assert.deepEqual(fenced, ['After.'], 'a copy inside a fence is not a paragraph');

  const skill = (id, paras, elsewhere = [], text = paras.join('\n\n')) => ({ id, paragraphs: paras, elsewhere, text });
  const good = [skill('a/listed', ['Intro.', CONFIRM_PARAGRAPH]), skill('b/other', ['Intro.'])];
  const list = ['a/listed'];
  for (const [name, check] of Object.entries(checks)) assert.deepEqual(check(good, list), [], name);

  assert.deepEqual(checks.missing([skill('a/listed', ['Intro.'])], list), ['a/listed']);
  assert.deepEqual(checks.repeated([skill('a/listed', [CONFIRM_PARAGRAPH, CONFIRM_PARAGRAPH])]), ['a/listed']);
  assert.deepEqual(checks.unlisted([...good, skill('c/extra', [CONFIRM_PARAGRAPH])], list), ['c/extra']);
  const reworded = CONFIRM_PARAGRAPH.replace('wait for a yes', 'wait for an answer');
  assert.equal(checks.drifted([skill('a/listed', [reworded])]).length, 1);
  assert.deepEqual(checks.missing([skill('a/listed', [reworded])], list), ['a/listed']);
  assert.deepEqual(checks.outsideSkillMd([skill('a/listed', [CONFIRM_PARAGRAPH], [CONFIRM_PARAGRAPH])]), ['a/listed']);
  assert.deepEqual(checks.unknown(good, ['a/listed', 'z/gone']), ['z/gone']);

  // A copy hidden in a list item, a quote or the tail of another paragraph still counts as carrying the paragraph.
  for (const hidden of [`- ${CONFIRM_PARAGRAPH}`, `> ${CONFIRM_PARAGRAPH}`, `Intro line.\n${CONFIRM_PARAGRAPH}`]) {
    const text = `# Title\n\n${hidden}\n`;
    assert.deepEqual(checks.unlisted([skill('c/extra', paragraphs(text), [], text)], list), ['c/extra'], hidden.slice(0, 12));
  }
});
