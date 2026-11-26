// reframe and sharpen are taken from cursor/plugins pstack word for word (decision 33 in docs/backlog/decisions.md,
// docs/backlog/q37.md). Only the frontmatter is ours: a description that meets our typed-only rules, and the license
// and upstream lines. So for each skill this checks:
// - the committed copy of upstream (tests/fixtures/pstack-upstream/<name>/SKILL.md) still has the sha256 it had when
//   it was copied at the pin, so the copy the bodies are checked against cannot drift;
// - the body of skills/planning/<name>/SKILL.md, everything after the line `---` that closes the frontmatter, equals
//   the fixture's body byte for byte;
// - our frontmatter is exactly the six lines of the template, with only the description value free, so no extra key
//   and no leftover upstream line gets through.
// The body reader is tested on small fixtures too, so a reader that cuts at the wrong `---` fails here.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const PIN = '41e400932eca14f289e7db717a70455256b6d388';
// sha256sum of the upstream files at the pin.
const SKILLS = {
  reframe: '1e2e8a11da838c9169dae6fb71257041cf4e91d58862d1629354648b9bd458f3',
  sharpen: 'aac4f8e6a1ffd70e3763314db37d3c2eb0cfea08bc63e98907aca6dae0343031',
};

const fixture = (name) => readFileSync(join(ROOT, 'tests', 'fixtures', 'pstack-upstream', name, 'SKILL.md'));
const ours = (name) => readFileSync(join(ROOT, 'skills', 'planning', name, 'SKILL.md'));
const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

// Splits a SKILL.md held as a Buffer at the first `---` line after line 1. Returns { lines, body }: the frontmatter
// lines between the two `---` lines, and the body as a Buffer of every byte after the closing line. Throws when line 1
// is not `---` or no line closes the frontmatter.
function split(buf) {
  const open = Buffer.from('---\n');
  if (!buf.subarray(0, open.length).equals(open)) throw new Error('line 1 is not ---');
  const close = buf.indexOf('\n---\n', open.length - 1);
  if (close < 0) throw new Error('no --- line closes the frontmatter');
  const inside = buf.subarray(open.length, close + 1).toString('utf8');
  return { lines: inside === '' ? [] : inside.slice(0, -1).split('\n'), body: buf.subarray(close + '\n---\n'.length) };
}

// What is wrong with our frontmatter lines for skill `name`, one sentence per line that is not the template's.
function frontmatterProblems(name, lines) {
  const want = [
    `name: ${name}`,
    /^description: "[^"\\]+"$/,
    'disable-model-invocation: true',
    'license: MIT (adapted from cursor/plugins pstack; see NOTICE)',
    'metadata:',
    `  upstream: https://github.com/cursor/plugins/tree/${PIN}/pstack/skills/${name}`,
  ];
  const out = [];
  if (lines.length !== want.length) out.push(`${name}: has ${lines.length} frontmatter lines, not ${want.length}`);
  want.forEach((w, i) => {
    const line = lines[i];
    const ok = line !== undefined && (typeof w === 'string' ? line === w : w.test(line));
    if (!ok) out.push(`${name}: frontmatter line ${i + 2} is ${JSON.stringify(line)}, not ${w}`);
  });
  return out;
}

for (const [name, hash] of Object.entries(SKILLS)) {
  test(`${name}: the committed upstream copy still has its sha256 from ${PIN.slice(0, 7)}`, () => {
    assert.equal(sha256(fixture(name)), hash);
  });

  test(`${name}: the body of skills/planning/${name}/SKILL.md is upstream's, byte for byte`, () => {
    const mine = split(ours(name)).body;
    const theirs = split(fixture(name)).body;
    assert.ok(theirs.length > 0, 'the upstream body is not empty');
    assert.ok(mine.equals(theirs), `the body differs from upstream (${mine.length} bytes, upstream ${theirs.length})`);
  });

  test(`${name}: the frontmatter is the six template lines, with only the description free`, () => {
    assert.deepEqual(frontmatterProblems(name, split(ours(name)).lines), []);
  });
}

test('the body reader catches a change in the body and passes a change in the frontmatter only', () => {
  const b = (s) => Buffer.from(s, 'utf8');
  const body = (s) => split(b(s)).body;
  const base = '---\nname: x\ndescription: "a --- b"\n---\n\nIntro.\n---\nMore text.\n';
  assert.deepEqual(split(b(base)).lines, ['name: x', 'description: "a --- b"']);
  // The body holds its own --- line, and a frontmatter value holds ---: only the first closing line ends the block.
  assert.equal(body(base).toString('utf8'), '\nIntro.\n---\nMore text.\n');
  const same = (s) => body(s).equals(body(base));
  const other = '---\nname: y\nlicense: MIT\ndescription: "other"\n---\n\nIntro.\n---\nMore text.\n';
  assert.ok(same(other), 'a change in the frontmatter only');
  assert.ok(!same(base.replace('More text.', 'More text!')), 'one byte in the body');
  assert.ok(!same(base.replace('Intro.', 'Intro,')), 'one byte before the body --- line');
  assert.ok(!same(base.slice(0, -1)), 'the final newline missing');
  assert.ok(!same(`${base}\n`), 'a second final newline');
  assert.ok(!same(base.replace(/\n$/, ' \n')), 'a space before the final newline');
  assert.throws(() => body(base.replace(/\n/g, '\r\n')), /line 1/, 'CRLF line endings are not read as LF');
  assert.ok(!same(base.replace('Intro.\n---\n', 'Intro.\r\n---\n')), 'one line ending in the body');
  assert.deepEqual(split(b('---\n---\nBody.\n')), { lines: [], body: b('Body.\n') });
  assert.throws(() => split(b('name: x\n---\nBody.\n')), /line 1/);
  assert.throws(() => split(b('---\nname: x\nBody.\n')), /closes/);
  assert.throws(() => split(b('---\nname: x\n---')), /closes/);
});

test('the frontmatter check catches an extra key, a leftover upstream line and a changed line', () => {
  const good = [
    'name: x',
    'description: "Do one thing well."',
    'disable-model-invocation: true',
    'license: MIT (adapted from cursor/plugins pstack; see NOTICE)',
    'metadata:',
    `  upstream: https://github.com/cursor/plugins/tree/${PIN}/pstack/skills/x`,
  ];
  assert.deepEqual(frontmatterProblems('x', good), []);
  const bad = (lines) => frontmatterProblems('x', lines).length > 0;
  assert.ok(bad([...good.slice(0, 3), 'argument-hint: "[task]"', ...good.slice(3)]), 'an extra key');
  assert.ok(bad([...good, 'argument-hint: "[task]"']), 'an extra key at the end');
  assert.ok(bad(['name: x', ...good]), 'a leftover upstream name line');
  assert.ok(bad(good.slice(0, -1)), 'a missing line');
  assert.ok(bad([good[1], good[0], ...good.slice(2)]), 'two lines swapped');
  assert.ok(bad(good.map((l) => l.replace(PIN, '09d06eb4b97a1020ab31e84030e38baf1099c7dc'))), 'another pin');
  assert.ok(bad(good.map((l) => l.replace('/x', '/y'))), 'another skill in the upstream link');
  assert.ok(bad(good.map((l, i) => (i === 1 ? 'description: Do one thing well.' : l))), 'an unquoted description');
  assert.ok(bad(good.map((l, i) => (i === 1 ? 'description: ""' : l))), 'an empty description');
  assert.ok(bad(good.map((l, i) => (i === 2 ? 'disable-model-invocation: false' : l))), 'model-invoked');
});
