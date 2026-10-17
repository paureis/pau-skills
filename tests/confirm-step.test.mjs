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

const CONFIRM_PARAGRAPH = 'If you started this skill on your own, without the user typing its name or asking for it, first '
  + 'say in one or two lines what it will do and what it will cost, and wait for a yes. If the user asked for it, go ahead.';

// Settled in the P0.5 plan check. Grouped by why the skill asks.
const CONFIRM_LIST = [
  // launches subagents or headless runs
  'agent-orchestration/arena', 'agent-orchestration/codebase-oracle', 'agent-orchestration/parallel-worktrees',
  'planning/agent-friendly-audit', 'planning/brainstorm', 'verification/hillclimb', 'verification/skill-eval',
  'verification/verify-app',
  // takes over the session or sets a way of working
  'agent-orchestration/lean-subagent-dev', 'agent-orchestration/methodology', 'planning/grill-me',
  // writes, commits or files outside the conversation
  'guards/dependency-upgrade', 'guards/rule-to-hook', 'planning/improve-codebase-architecture', 'planning/to-issues',
  'session-discipline/handoff', 'session-discipline/instructions-audit', 'session-discipline/project-setup',
  'session-discipline/retrospective', 'session-discipline/session-close', 'verification/ci-cost-and-cadence',
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
      out.push({ id: `${plugin.name}/${s.name}`, paragraphs: paragraphs(skillMd), elsewhere });
    }
  }
  return out;
}

// Each check returns what is wrong, so the same checks run on the repository and on the fixtures below.
const checks = {
  missing: (skills, list) => skills.filter((s) => list.includes(s.id) && !s.paragraphs.includes(CONFIRM_PARAGRAPH)).map((s) => s.id),
  repeated: (skills) => skills.filter((s) => s.paragraphs.filter((p) => p === CONFIRM_PARAGRAPH).length > 1).map((s) => s.id),
  unlisted: (skills, list) => skills.filter((s) => !list.includes(s.id) && [...s.paragraphs, ...s.elsewhere].some((p) => p.startsWith(OPENING))).map((s) => s.id),
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

test('the paragraph has no dash and no XML-like tag', () => {
  assert.doesNotMatch(CONFIRM_PARAGRAPH, /[–—]|<[A-Za-z/]/);
});

test('each check catches its case on fixtures, and a wrapped copy still counts', () => {
  const wrapped = paragraphs(`# Title\n\nIntro.\n\n${CONFIRM_PARAGRAPH.replace('first say', 'first\nsay')}\n\n## Step 1`);
  assert.ok(wrapped.includes(CONFIRM_PARAGRAPH), 'a copy wrapped over two lines is the same paragraph');
  const fenced = paragraphs(`\`\`\`\n${CONFIRM_PARAGRAPH}\n\`\`\`\n\nAfter.`);
  assert.deepEqual(fenced, ['After.'], 'a copy inside a fence is not a paragraph');

  const skill = (id, paras, elsewhere = []) => ({ id, paragraphs: paras, elsewhere });
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
});
