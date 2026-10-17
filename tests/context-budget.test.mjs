// The context budget for skill descriptions. Claude Code loads the description of every skill the model may start
// into every session, so those descriptions cost context all the time. A skill with `disable-model-invocation: true`
// costs nothing until the user types `/name`. This test keeps the auto tier (skills the model may start on its own)
// small and short. See "Context budget" in docs/BACKLOG.md for the policy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const MAX_AUTO_SKILLS = 12;
const MAX_AUTO_DESCRIPTION = 400;
const MAX_AUTO_TOTAL = 4500;
const MAX_ANY_DESCRIPTION = 1536; // Claude Code cuts any description longer than this, typed or not.

// The frontmatter is the block between the first two `---` lines. Like tests/marketplace.test.mjs, the description is
// the one line that starts with `description: `; a quoted value is unquoted the way YAML reads it.
function unquote(value) {
  if (value.startsWith('"')) return JSON.parse(value);
  if (value.startsWith("'")) return value.slice(1, -1).replace(/''/g, "'");
  return value;
}

function readSkills() {
  const out = [];
  for (const plugin of readdirSync(join(ROOT, 'skills')).filter((d) => !d.includes('.'))) {
    for (const name of readdirSync(join(ROOT, 'skills', plugin)).filter((d) => !d.includes('.'))) {
      const lines = readFileSync(join(ROOT, 'skills', plugin, name, 'SKILL.md'), 'utf8').split(/\r?\n/);
      const end = lines.indexOf('---', 1);
      const front = lines[0] === '---' && end > 0 ? lines.slice(1, end) : [];
      const line = front.find((l) => l.startsWith('description: '));
      const description = line ? unquote(line.slice('description: '.length).trim()) : '';
      const typed = front.some((l) => /^disable-model-invocation:\s*true\s*$/.test(l));
      out.push({ id: `${plugin}/${name}`, description, typed });
    }
  }
  return out;
}

const SKILLS = readSkills();
const AUTO = SKILLS.filter((s) => !s.typed);

test('the skills were found and parsed', () => {
  assert.ok(SKILLS.length >= 20, `expected at least 20 skills, got ${SKILLS.length}`);
  assert.ok(AUTO.length >= 1, 'no auto-tier skill found');
});

test('every skill has a non-empty description (the / menu shows it)', () => {
  assert.deepEqual(SKILLS.filter((s) => !s.description.trim()).map((s) => s.id), []);
});

test(`at most ${MAX_AUTO_SKILLS} skills are in the auto tier`, () => {
  assert.ok(AUTO.length <= MAX_AUTO_SKILLS, `${AUTO.length} auto-tier skills:\n${AUTO.map((s) => s.id).join('\n')}`);
});

test(`each auto-tier description is at most ${MAX_AUTO_DESCRIPTION} characters`, () => {
  const long = AUTO.filter((s) => s.description.length > MAX_AUTO_DESCRIPTION).map((s) => `${s.id}: ${s.description.length}`);
  assert.deepEqual(long, []);
});

test(`auto-tier descriptions total at most ${MAX_AUTO_TOTAL} characters`, () => {
  const total = AUTO.reduce((n, s) => n + s.description.length, 0);
  assert.ok(total <= MAX_AUTO_TOTAL, `auto-tier descriptions total ${total} characters`);
});

test(`every description is at most ${MAX_ANY_DESCRIPTION} characters`, () => {
  const long = SKILLS.filter((s) => s.description.length > MAX_ANY_DESCRIPTION).map((s) => `${s.id}: ${s.description.length}`);
  assert.deepEqual(long, []);
});
