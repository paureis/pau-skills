// geppetto's check-agents.mjs, the production rules tests: the block is checked only when an agent carries it, and the
// roster's builder and reviewer carry it word for word. Shared setup is in geppetto.helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { rulesOf } from '../skills/agent-orchestration/geppetto/check-agents.mjs';
import { ROSTER, COVENANT, RULES, agent, check, found } from './geppetto.helpers.mjs';

const RULES_START = '<!-- production rules start -->';
const RULES_END = '<!-- production rules end -->';

test('rules: an agent without the production rules block has no rules finding; the block is never required', () => {
  const plain = agent();
  const r = check({ 'tester.md': plain }, { user: { 'mine.md': agent({ name: 'mine', description: 'A personal helper that sorts the notes folder by date.' }) } });
  assert.deepEqual(found(r, 'rules'), []);
  assert.deepEqual(r.findings, []);
});

test('rules: the block word for word, or reflowed, has no finding', () => {
  assert.ok(RULES.text.startsWith(RULES_START) && RULES.text.endsWith(RULES_END), 'RULES.text runs from marker line to marker line');
  assert.ok(RULES.block && RULES.block.includes('Production rules'), 'RULES.block holds the words of the block');
  const reflowed = RULES.text.replace(/\. /g, '.\n');
  assert.notEqual(reflowed, RULES.text);
  for (const body of [RULES.text, reflowed]) {
    const r = check({ 'tester.md': agent({}, { body }) });
    assert.deepEqual(r.findings, []);
  }
});

test("rules: a reworded block is an error at the bundle's roster version", () => {
  assert.equal(RULES.text.split('parameter').length, 2, "'parameter' appears once in the block");
  const r = check({ 'tester.md': agent({}, { body: RULES.text.replace('parameter', 'placeholder') }) });
  const f = found(r, 'rules', 'error');
  assert.equal(f.length, 1);
  assert.equal(found(r, 'rules').length, 1);
  assert.match(f[0].message, /PRODUCTION-RULES\.md/);
});

test('rules: a start marker with no end marker after it is an error', () => {
  const open = RULES.text.replace(RULES_END, '');
  for (const body of [open, `${RULES_END}\n\n${open}`]) {
    const r = check({ 'tester.md': agent({}, { body }) });
    const f = found(r, 'rules', 'error');
    assert.equal(f.length, 1);
    assert.equal(f[0].message, 'the production rules start marker has no end marker after it');
  }
  assert.deepEqual(rulesOf(open), { block: null, error: 'the production rules start marker has no end marker after it' });
  assert.deepEqual(rulesOf('no block here'), { block: null });
});

test('rules: at an older roster version a reworded block gets no rules finding; the covenant warning already says to run Update', () => {
  const older = COVENANT.text.replace(`geppetto roster ${COVENANT.version}`, `geppetto roster ${COVENANT.version - 1}`);
  assert.notEqual(older, COVENANT.text);
  const r = check({ 'tester.md': agent({}, { body: RULES.text.replace('parameter', 'placeholder'), covenant: older }) });
  assert.deepEqual(found(r, 'rules'), []);
  const w = found(r, 'covenant', 'warning');
  assert.equal(w.length, 1);
  assert.match(w[0].message, /run Update/);
});

test('the roster: builder and reviewer carry the block word for word, just before the covenant; eng-lead, writer and sweeper do not', () => {
  for (const name of ['builder', 'reviewer']) {
    const text = readFileSync(join(ROSTER, `${name}.md`), 'utf8');
    assert.equal(rulesOf(text).block, RULES.block, name);
    const end = text.indexOf(RULES_END);
    const covenant = text.indexOf('<!-- covenant start:');
    assert.notEqual(end, -1, name);
    assert.notEqual(covenant, -1, name);
    assert.ok(end < covenant, `${name}: the rules block ends before the covenant starts`);
    assert.equal(text.slice(end + RULES_END.length, covenant).trim(), '', `${name}: nothing between the two blocks`);
  }
  for (const name of ['eng-lead', 'writer', 'sweeper']) {
    const text = readFileSync(join(ROSTER, `${name}.md`), 'utf8');
    assert.equal(rulesOf(text).block, null, name);
    assert.equal(text.indexOf(RULES_START), -1, name);
  }
});
