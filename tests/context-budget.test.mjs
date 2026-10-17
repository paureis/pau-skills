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

// Each check returns what is wrong, so the same checks run on the repository and on the fixtures below.
const auto = (skills) => skills.filter((s) => !s.typed);
const checks = {
  empty: (skills) => skills.filter((s) => !s.description.trim()).map((s) => s.id),
  count: (skills) => {
    const ids = auto(skills).map((s) => s.id);
    return ids.length > MAX_AUTO_SKILLS ? [`${ids.length} auto-tier skills: ${ids.join(', ')}`] : [];
  },
  each: (skills) => auto(skills).filter((s) => s.description.length > MAX_AUTO_DESCRIPTION).map((s) => `${s.id}: ${s.description.length}`),
  total: (skills) => {
    const total = auto(skills).reduce((n, s) => n + s.description.length, 0);
    return total > MAX_AUTO_TOTAL ? [`auto-tier descriptions total ${total} characters`] : [];
  },
  any: (skills) => skills.filter((s) => s.description.length > MAX_ANY_DESCRIPTION).map((s) => `${s.id}: ${s.description.length}`),
};

const SKILLS = readSkills();

test('the skills were found and parsed', () => {
  assert.ok(SKILLS.length >= 20, `expected at least 20 skills, got ${SKILLS.length}`);
  assert.ok(auto(SKILLS).length >= 1, 'no auto-tier skill found');
  assert.ok(SKILLS.some((s) => s.typed), 'no typed-tier skill found');
});

test('every skill has a non-empty description (the / menu shows it)', () => {
  assert.deepEqual(checks.empty(SKILLS), []);
});

test(`at most ${MAX_AUTO_SKILLS} skills are in the auto tier`, () => {
  assert.deepEqual(checks.count(SKILLS), []);
});

test(`each auto-tier description is at most ${MAX_AUTO_DESCRIPTION} characters`, () => {
  assert.deepEqual(checks.each(SKILLS), []);
});

test(`auto-tier descriptions total at most ${MAX_AUTO_TOTAL} characters`, () => {
  assert.deepEqual(checks.total(SKILLS), []);
});

test(`every description is at most ${MAX_ANY_DESCRIPTION} characters`, () => {
  assert.deepEqual(checks.any(SKILLS), []);
});

test('each check flags one character or one skill over its limit, and nothing at the limit', () => {
  const skill = (id, length, typed = false) => ({ id, description: 'x'.repeat(length), typed });
  // At every limit at once: the most auto-tier skills, sharing the whole total, and a typed skill at the hard cap.
  const share = Math.floor(MAX_AUTO_TOTAL / MAX_AUTO_SKILLS);
  const sizes = Array.from({ length: MAX_AUTO_SKILLS }, (_, i) => (i === 0 ? MAX_AUTO_TOTAL - share * (MAX_AUTO_SKILLS - 1) : share));
  const atLimit = [...sizes.map((n, i) => skill(`a${i}`, n)), skill('t', MAX_ANY_DESCRIPTION, true)];
  assert.ok(sizes.every((n) => n <= MAX_AUTO_DESCRIPTION), 'fixture: the shares must fit the per-description limit');
  for (const [name, check] of Object.entries(checks)) assert.deepEqual(check(atLimit), [], name);

  assert.equal(checks.count([...atLimit, skill('extra', 0, false)]).length, 1);
  assert.deepEqual(checks.each([skill('long', MAX_AUTO_DESCRIPTION + 1)]), [`long: ${MAX_AUTO_DESCRIPTION + 1}`]);
  assert.deepEqual(checks.each([skill('typed', MAX_AUTO_DESCRIPTION + 1, true)]), []);
  const overTotal = atLimit.map((s) => (s.id === 'a1' ? skill('a1', share + 1) : s));
  assert.deepEqual(checks.total(overTotal), [`auto-tier descriptions total ${MAX_AUTO_TOTAL + 1} characters`]);
  assert.deepEqual(checks.any([skill('huge', MAX_ANY_DESCRIPTION + 1, true)]), [`huge: ${MAX_ANY_DESCRIPTION + 1}`]);
  assert.deepEqual(checks.empty([{ id: 'blank', description: ' ', typed: true }]), ['blank']);
});
