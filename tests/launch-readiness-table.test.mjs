// The READINESS.md table of launch-readiness: cells escape |, newlines and backslashes; the file round-trips byte for
// byte; a changed row rewrites only its own line.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { escapeCell, unescapeCell, splitRow, parseLedger, formatLedger } from '../skills/verification/launch-readiness/ledger.mjs';
import { SKILL, NOW, SAMPLE, project, put, row } from './launch-readiness.helpers.mjs';

describe('cells', () => {
  test('escape |, newlines and backslashes, and read back what was written', () => {
    for (const s of ['plain', 'a | b', 'line one\nline two', 'back\\slash', '\\|', '\\n is not a newline', 'cr\r\nlf', '|\\\n']) {
      const e = escapeCell(s);
      assert.doesNotMatch(e, /\n|\r/, `no raw line break in ${JSON.stringify(e)}`);
      assert.equal(unescapeCell(e), s);
    }
    assert.equal(escapeCell('a | b\nc \\ d'), 'a \\| b\\nc \\\\ d');
  });

  test('a row splits on unescaped pipes only', () => {
    assert.deepEqual(splitRow('| a \\| b | c\\\\ | d |'), ['a | b', 'c\\', 'd']);
    assert.deepEqual(splitRow('| x |  |'), ['x', '']);
  });
});

describe('parse and write', () => {
  test('a ledger round-trips byte for byte, rows and all', () => {
    const l = parseLedger(SAMPLE);
    assert.equal(formatLedger(l), SAMPLE);
    assert.equal(l.rows.length, 2);
    assert.deepEqual(l.rows[0], {
      id: 'SEC-08', area: 'security', stage: 2, severity: 'must-fix', status: 'fail', source: 'code',
      evidence: 'src/cors.mjs:3 sets the origin to \\* | any', files: [{ path: 'src/cors.mjs', hash: '0123456789abcdef' }],
      date: '2026-10-19', expires: '',
    });
    assert.equal(l.rows[1].evidence, 'ask: line one\nline two \\ done');
    assert.equal(l.rows[1].expires, '2027-10-19');
    assert.deepEqual(l.meta.profile, { stack: 'Node 20' });
  });

  test('changing a row rewrites that line only; the prose and the other rows stay byte for byte', () => {
    const root = project({ 'a.js': 'x\n' });
    const l = put(parseLedger(SAMPLE), [row({ id: 'SEC-08', status: 'likely', evidence: 'a.js:1 now | fixed' })], root);
    const before = SAMPLE.split('\n');
    const after = formatLedger(l).split('\n');
    const changed = before.map((line, i) => (line === after[i] ? null : i)).filter((i) => i !== null);
    assert.deepEqual([after.length, changed.length], [before.length, 1]);
    assert.match(after[changed[0]], /^\| SEC-08 \| security \| 2 \| must-fix \| likely \| code \| a\.js:1 now \\\| fixed \| a\.js@[0-9a-f]{16} \| 2026-10-19 \|/);
    assert.deepEqual(parseLedger(formatLedger(l)).rows, l.rows);
  });

  test('CRLF files keep their line endings', () => {
    const crlf = SAMPLE.replace(/\n/g, '\r\n');
    assert.equal(formatLedger(parseLedger(crlf)), crlf);
  });

  test('a new row is added at the end of the table; a row with every awkward character round-trips', () => {
    const root = project({ 'a.js': 'x\n', 'b dir/c.js': 'y\n' });
    const evidence = 'a.js:1 says "a | b"\nthen \\n and \\| literally';
    const l = put(parseLedger(SAMPLE), [row({ id: 'NEW-1', evidence, files: ['a.js', 'b dir/c.js'] })], root);
    const text = formatLedger(l);
    assert.ok(text.endsWith('\n\nNotes after the table.\n'));
    const { id, evidence: e, files } = parseLedger(text).rows.at(-1);
    assert.deepEqual([id, e, files.map((f) => f.path)], ['NEW-1', evidence, ['a.js', 'b dir/c.js']]);
    assert.equal(formatLedger(parseLedger(text)), text);
  });

  test('a ledger with no table, a broken row or an unknown status is an error, not a guess', () => {
    assert.throws(() => parseLedger('# nothing here\n'), /no ledger table/);
    assert.throws(() => parseLedger(SAMPLE.replace('| fail |', '| failed |')), /status "failed"/);
    assert.throws(() => parseLedger(SAMPLE.replace('| 2026-10-19 |  |', '| 2026-10-19 |')), /10 cells/);
    assert.throws(() => parseLedger(SAMPLE.replace('"stage": 2,', '"stage": 2')), /profile block/);
  });

  test('a blank line inside the table is an error naming the line, not rows silently dropped; an id appears once', () => {
    const lines = SAMPLE.split('\n');
    const at = lines.findIndex((l) => l.startsWith('| CMP-01'));
    const gap = [...lines.slice(0, at), '', ...lines.slice(at)].join('\n');
    assert.throws(() => parseLedger(gap), new RegExp(`line ${at + 2}: .*blank line at line ${at + 1}`));
    assert.throws(() => parseLedger(SAMPLE.replace('| CMP-01 |', '| SEC-08 |')), /id SEC-08 appears twice/);
  });

  test('the bundled template parses and has no rows', () => {
    assert.deepEqual(parseLedger(readFileSync(join(SKILL, 'READINESS-TEMPLATE.md'), 'utf8')).rows, []);
  });
});

