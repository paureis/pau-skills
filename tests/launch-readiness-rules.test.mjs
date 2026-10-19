// The evidence rules of launch-readiness's ledger.mjs: probe rows pass only on a probe, area n/a rows block until
// graded, no secret value in the evidence, and no cited file outside the repository.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { tempDir } from './helpers.mjs';
import { PROBE_IDS, secretIn, readiness } from '../skills/verification/launch-readiness/ledger.mjs';
import { SKILL, NOW, project, newLedger, put, row } from './launch-readiness.helpers.mjs';

describe('probe rows', () => {
  test('the probe ids come from the area files and cover every row in the PROBES.md table', () => {
    for (const id of ['ACC-01', 'SEC-04', 'SEC-05', 'SEC-08', 'SEC-09', 'SEC-11', 'SEC-12', 'BIL-01', 'API-02']) assert.ok(PROBE_IDS.has(id), id);
    assert.ok(!PROBE_IDS.has('SEC-01') && !PROBE_IDS.has('COR-01'));
    const table = readFileSync(join(SKILL, 'PROBES.md'), 'utf8').split('## The common probes')[1];
    for (const id of table.match(/\b[A-Z]+-\d+\b/g)) assert.ok(PROBE_IDS.has(id), `${id} is in PROBES.md but not tagged probe in its area file`);
  });

  test('a probe row passes only with a probe as its source; read from the code it is at most likely', () => {
    const root = project({ 'a.js': 'x\n', 'test/p.test.js': 'p\n' });
    const l = newLedger(root);
    assert.throws(() => put(l, [row({ id: 'ACC-01' })], root), /ACC-01 needs a probe to pass/);
    assert.throws(() => put(l, [row({ id: 'SEC-04', source: 'command', expires: '2027-01-17' })], root), /needs a probe/);
    const ok = put(l, [
      row({ id: 'ACC-01', source: 'probe', evidence: 'node --test test/p.test.js: ok', files: ['test/p.test.js', 'a.js'], expires: '2027-01-17' }),
      row({ id: 'SEC-08', status: 'likely', evidence: 'a.js:1 sets *' }),
    ], root);
    assert.deepEqual(ok.rows.map((r) => [r.id, r.source, r.status]), [['ACC-01', 'probe', 'pass'], ['SEC-08', 'code', 'likely']]);
    assert.throws(() => put(l, [row({ id: 'ACC-01', source: 'probe', evidence: 'ok', files: ['test/p.test.js'] })], root), /expiry/);
  });
});

describe('area n/a rows', () => {
  test('an area n/a row is must-fix at stage 1, so an area that comes back blocks go until it is graded', () => {
    const root = project({ 'a.js': 'x\n' });
    const l = newLedger(root);
    const na = (o) => row({ id: 'BIL-NA', area: 'billing', status: 'n/a', evidence: 'profile: takes no money', files: [], ...o });
    assert.throws(() => put(l, [na({ stage: 1, severity: 'can-wait' })], root), /BIL-NA.*must-fix at stage 1/);
    assert.throws(() => put(l, [na({ stage: 2, severity: 'must-fix' })], root), /must-fix at stage 1/);
    const r = put(l, [na({ stage: 1, severity: 'must-fix' })], root).rows[0];
    assert.equal(readiness([r], { stage: 1, now: NOW }).go, true);
    assert.equal(readiness([{ ...r, status: 'recheck' }], { stage: 1, now: NOW }).go, false);
  });
});

describe('secrets in evidence', () => {
  const stripeLike = ['sk', 'live', 'Ab3dEf6hIj9kLm2nOp5qRs8t'].join('_');
  const awsLike = 'AKIA' + 'ABCDEFGHIJKLMNOP';
  const random = createHash('sha256').update('launch-readiness').digest('base64').replace(/[+/=]/g, '');

  test('a known key prefix or a long random token is found; ordinary evidence is not', () => {
    for (const s of [stripeLike, awsLike, random, ['gh' + 'p', 'x'.repeat(36)].join('_'), `-----BEGIN ${'RSA PRIVATE'} KEY-----`]) {
      assert.ok(secretIn(`config.js:2 holds ${s} here`), s.slice(0, 6));
    }
    for (const s of ['public/config.js:2 holds a key ("demo...")', 'commit 6de2805552f3812beef914d57a96c3aad52e5033',
      'Access-Control-Allow-Origin: * at src/cors.mjs:3', 'sk_l... in src/pay.js:4', 'src/Components/HeaderLayout2.tsx:12', 'handleOAuth2CallbackRequest']) {
      assert.equal(secretIn(s), null, s);
    }
  });

  test('a row whose evidence quotes a secret is refused with a message to cite the line', () => {
    const root = project({ 'a.js': 'x\n' });
    assert.throws(() => put(newLedger(root), [row({ id: 'SEC-01', status: 'fail', evidence: `a.js:1 has ${stripeLike}` })], root),
      /looks like a secret value \("sk_l\.\.\."\): cite its file:line/);
  });
});

describe('cited paths', () => {
  test('a path outside the repository is refused: ../, absolute, or a link that leads out', () => {
    const outside = tempDir('launch-readiness-out-');
    writeFileSync(join(outside, 'x.js'), 'x\n');
    const root = project({ 'a.js': 'x\n' });
    symlinkSync(join(outside, 'x.js'), join(root, 'link.js'));
    const l = newLedger(root);
    for (const p of ['../x.js', join(outside, 'x.js'), 'link.js']) {
      assert.throws(() => put(l, [row({ id: 'A', files: [p], evidence: 'x.js:1' })], root), /outside the repository/, p);
    }
    assert.throws(() => newLedger(root, { profile: {}, stage: 1, files: ['link.js'] }), /outside the repository/);
  });
});
