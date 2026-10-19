// ledger.mjs of launch-readiness: evidence rules, rechecks, uncited changes, profile recheck, stage readiness, the
// command line. The fixtures' gaps are listed in tests/fixtures/launch-readiness/README.md.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync, renameSync, rmSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { repo } from './helpers.mjs';
import {
  formatLedger, hashFile, refresh, readiness, findLedger, stamp, changedSince,
} from '../skills/verification/launch-readiness/ledger.mjs';
import { NOW, day, SAMPLE, project, newLedger, put, row, git, commitAll, run } from './launch-readiness.helpers.mjs';

describe('applyRows', () => {
  test('hashes each cited file whole (sha256, 16 hex characters) and stamps the date', () => {
    const root = project({ 'a.js': 'one\ntwo\n' });
    const l = put(newLedger(root), [row({ id: 'R1' })], root);
    assert.equal(l.rows[0].files[0].hash, hashFile(join(root, 'a.js')));
    assert.match(l.rows[0].files[0].hash, /^[0-9a-f]{16}$/);
    assert.equal(l.rows[0].date, '2026-10-19');
  });

  test('refuses rows that break the evidence rules, and changes nothing', () => {
    const root = project({ 'a.js': 'x\n', 'yarn.lock': 'x\n' });
    const l = newLedger(root);
    const bad = [
      [row({ id: 'P', evidence: 'looks fine' }), /file:line/],
      [row({ id: 'C', source: 'command', evidence: 'audit: 0', files: ['yarn.lock'] }), /expiry/],
      [row({ id: 'C2', source: 'command', evidence: 'audit: 0', files: [], expires: '2026-11-19' }), /input file/],
      [row({ id: 'Q', source: 'answer', evidence: 'yes', files: [] }), /expiry/],
      [row({ id: 'U', status: 'unknown', evidence: '' }), /how to check/],
      [row({ id: 'N', status: 'n/a', evidence: '' }), /profile reason/],
      [row({ id: 'S', stage: 5 }), /stage/],
      [row({ id: 'V', severity: 'high' }), /severity/],
      [row({ id: 'M', files: ['gone.js'] }), /gone\.js/],
      [row({ id: 'E', expires: '19/10/2026', source: 'answer', files: [] }), /YYYY-MM-DD/],
    ];
    for (const [r, re] of bad) assert.throws(() => put(l, [r], root), re, r.id);
    assert.deepEqual(l.rows, []);
  });
});

describe('refresh', () => {
  function twoRows() {
    const root = project({ 'a.js': 'one\ntwo\n', 'b.js': 'keep\n' });
    const l = put(newLedger(root), [row({ id: 'A' }), row({ id: 'B', files: ['b.js'], evidence: 'b.js:1 ok' })], root);
    return { root, l };
  }

  test('a row whose cited file changed goes to recheck; the others stay', () => {
    const { root, l } = twoRows();
    writeFileSync(join(root, 'a.js'), 'one\nTWO\n');
    const r = refresh(l, { root, now: NOW });
    assert.deepEqual(r.changes, [{ id: 'A', was: 'pass', reasons: ['a.js changed'] }]);
    assert.deepEqual(r.ledger.rows.map((x) => [x.status, x.evidence]), [['recheck', 'a.js:1 ok'], ['pass', 'b.js:1 ok']]);
  });

  test('a moved line counts as a change, since the whole file is hashed', () => {
    const { root, l } = twoRows();
    writeFileSync(join(root, 'a.js'), 'two\none\n');
    assert.deepEqual(refresh(l, { root, now: NOW }).changes.map((c) => c.id), ['A']);
  });

  test('nothing changed, nothing to recheck', () => {
    const { root, l } = twoRows();
    const r = refresh(l, { root, now: NOW });
    assert.deepEqual(r.changes, []);
    assert.equal(formatLedger(r.ledger), formatLedger(l));
  });

  test('a cited file that is missing or moved sends its row to recheck', () => {
    const { root, l } = twoRows();
    renameSync(join(root, 'a.js'), join(root, 'moved.js'));
    rmSync(join(root, 'b.js'));
    const r = refresh(l, { root, now: NOW });
    assert.deepEqual(r.changes.map((c) => [c.id, c.reasons[0]]), [['A', 'a.js missing (deleted or moved)'], ['B', 'b.js missing (deleted or moved)']]);
  });

  test('an answer or a command result past its expiry goes to recheck, and not a day before', () => {
    const root = project({ 'package-lock.json': '{}\n' });
    const l = put(newLedger(root), [
      row({ id: 'Q', source: 'answer', evidence: 'owner: on-call rota exists', files: [], expires: '2027-01-18' }),
      row({ id: 'C', source: 'command', evidence: 'npm audit: 0', files: ['package-lock.json'], expires: '2026-11-18' }),
    ], root);
    assert.deepEqual(refresh(l, { root, now: day('2026-11-18') }).changes, []);
    assert.deepEqual(refresh(l, { root, now: day('2026-11-19') }).changes, [{ id: 'C', was: 'pass', reasons: ['expired 2026-11-18'] }]);
    assert.deepEqual(refresh(l, { root, now: day('2027-01-19') }).changes.map((c) => c.id), ['Q', 'C']);
  });

  test('when a manifest the profile came from changes, the n/a rows go to recheck and the rest stay', () => {
    const root = project({ 'package.json': '{"name":"x"}\n', 'a.js': 'x\n' });
    let l = newLedger(root, { profile: { stack: 'Node' }, stage: 2, regulated: false, files: ['package.json'] });
    l = put(l, [
      row({ id: 'AI-01', area: 'ai features', status: 'n/a', evidence: 'profile: no AI features', files: [] }),
      row({ id: 'A' }),
    ], root);
    assert.equal(refresh(l, { root, now: NOW }).profileChanged, false);
    writeFileSync(join(root, 'package.json'), '{"name":"x","dependencies":{"openai":"1"}}\n');
    const r = refresh(l, { root, now: NOW });
    assert.equal(r.profileChanged, true);
    assert.deepEqual(r.changes, [{ id: 'AI-01', was: 'n/a', reasons: ['profile sources changed: package.json'] }]);
  });

  test('a manifest that disappears also changes the profile', () => {
    const root = project({ 'go.mod': 'module x\n' });
    const l = newLedger(root, { profile: {}, stage: 1, files: ['go.mod'] });
    rmSync(join(root, 'go.mod'));
    assert.equal(refresh(l, { root, now: NOW }).profileChanged, true);
  });
});

describe('files changed since the last run that no row cites', () => {
  test('are listed, so a new route is looked at; cited files, manifests and the ledger are not', () => {
    const root = project({ 'package.json': '{}\n', 'src/a.js': 'a\n', 'src/c.js': 'c\n' });
    const head = commitAll(root);
    let l = newLedger(root, { profile: { stack: 'Node' }, stage: 2, regulated: false, files: ['package.json'] });
    l = put(l, [row({ id: 'A', files: ['src/a.js'], evidence: 'src/a.js:1 ok' })], root);
    l = stamp(l, { commit: head, now: NOW });
    assert.deepEqual(l.meta.lastRun, { commit: head, date: '2026-10-19' });
    writeFileSync(join(root, 'READINESS.md'), formatLedger(l));
    writeFileSync(join(root, 'src/a.js'), 'a2\n');
    writeFileSync(join(root, 'src/c.js'), 'c2\n');
    writeFileSync(join(root, 'package.json'), '{"x":1}\n');
    mkdirSync(join(root, 'src/routes'));
    writeFileSync(join(root, 'src/routes/new.js'), 'route\n');
    git(root, 'add', 'src/c.js');
    git(root, 'commit', '-qm', 'later');
    const r = refresh(l, { root, now: NOW, ledgerPath: 'READINESS.md' });
    assert.deepEqual(r.uncited, ['src/c.js', 'src/routes/new.js']);
    assert.deepEqual(changedSince(root, head).sort(), ['READINESS.md', 'package.json', 'src/a.js', 'src/c.js', 'src/routes/new.js']);
  });

  test('without a last run, or outside git, nothing is listed and the reason is given', () => {
    const root = project({ 'a.js': 'x\n' });
    const r = refresh(newLedger(root), { root, now: NOW });
    assert.deepEqual(r.uncited, []);
    assert.match(r.uncitedNote, /no last run/);
    const r2 = refresh(stamp(newLedger(root), { commit: 'abc1234', now: NOW }), { root, now: NOW });
    assert.match(r2.uncitedNote, /abc1234/);
  });
});

describe('readiness', () => {
  const rows = (...list) => list.map((o, i) => row({ id: `R${i}`, stage: 1, files: [], date: '', expires: '', ...o }));
  const stageReady = (r, n) => r.stages.find((s) => s.stage === n).ready;
  const rd = (list, o = {}) => readiness(list, { stage: 1, regulated: false, now: NOW, ...o });

  test('stages 1 to 3 stack: a must-fix row blocks its own stage and every later one', () => {
    const r = rd(rows({ stage: 2, status: 'fail' }), { stage: 3 });
    assert.deepEqual(r.stages.map((s) => [s.stage, s.ready]), [[1, true], [2, false], [3, false]]);
    assert.equal(r.go, false);
    assert.deepEqual(r.blockers.map((b) => b.id), ['R0']);
  });

  test('a can-wait row never blocks; pass and n/a close a row; fail, unknown and recheck do not', () => {
    assert.equal(rd(rows({ severity: 'can-wait', status: 'fail' })).go, true);
    assert.equal(rd(rows({ status: 'n/a' })).go, true);
    for (const status of ['fail', 'unknown', 'recheck']) {
      assert.equal(rd(rows({ status })).go, false, status);
    }
  });

  test('a must-fix security row that is only "likely" blocks go, and the result says probes were skipped', () => {
    const r = rd(rows({ area: 'security', status: 'likely' }));
    assert.equal(r.go, false);
    assert.equal(r.probesSkipped, true);
    assert.equal(rd(rows({})).probesSkipped, false);
  });

  test('stage 4 adds its rows to the stage the app is at, here stage 2, without needing stage 3', () => {
    const list = rows({ stage: 4, status: 'fail' }, { stage: 3, status: 'fail' }, { stage: 2 });
    const plain = rd(list, { stage: 2 });
    assert.equal(plain.go, true, 'stage 4 rows do not count when no regulated data is added');
    const reg = rd(list, { stage: 2, regulated: true });
    assert.equal(reg.go, false);
    assert.deepEqual(reg.blockers.map((b) => b.id), ['R0']);
    assert.equal(stageReady(reg, 1), false, 'regulated data counts at every stage');
    const fixed = rd(rows({ stage: 4 }, { stage: 3, status: 'fail' }, { stage: 2 }), { stage: 2, regulated: true });
    assert.equal(fixed.go, true, 'stage 3 is not required for stage 2 with regulated data');
  });

  test('a pass past its expiry does not close the row, even before a refresh', () => {
    const list = rows({ source: 'answer', expires: '2026-10-18' });
    assert.equal(rd(list).go, false);
    assert.equal(rd(list, { now: day('2026-10-18') }).go, true);
  });

  test('counts every grade', () => {
    const r = rd(rows({}, { status: 'fail' }, { status: 'fail' }, { status: 'n/a' }));
    assert.deepEqual(r.counts, { pass: 1, fail: 2, likely: 0, unknown: 0, 'n/a': 1, recheck: 0 });
  });
});

describe('finding the ledger', () => {
  test('docs/READINESS.md first, then the root; a new ledger goes in docs/ when the project has one', () => {
    const a = project({ 'x.txt': '' });
    assert.deepEqual(findLedger(a), { path: join(a, 'READINESS.md'), exists: false });
    mkdirSync(join(a, 'docs'));
    assert.deepEqual(findLedger(a), { path: join(a, 'docs', 'READINESS.md'), exists: false });
    writeFileSync(join(a, 'docs', 'READINESS.md'), SAMPLE);
    assert.deepEqual(findLedger(a), { path: join(a, 'docs', 'READINESS.md'), exists: true });
  });

  test('a root ledger is kept when a docs/ folder is added later, and two ledgers are an error', () => {
    const a = project({ 'READINESS.md': SAMPLE });
    mkdirSync(join(a, 'docs'));
    assert.deepEqual(findLedger(a), { path: join(a, 'READINESS.md'), exists: true });
    writeFileSync(join(a, 'docs', 'READINESS.md'), SAMPLE);
    assert.throws(() => findLedger(a), /two ledgers/);
  });
});

describe('the command line', () => {
  test('profile, apply, status, refresh and stamp work from a subfolder, with paths from the repository root', () => {
    const root = project({ 'package.json': '{}\n', 'src/a.js': 'x\n', 'docs/.keep': '' });
    commitAll(root);
    const sub = join(root, 'src');
    const ok = (r) => { assert.equal(r.code, 0, r.err); return r; };
    ok(run(['profile', '-'], sub, JSON.stringify({ profile: { stack: 'Node' }, stage: 2, files: ['package.json'] })));
    assert.ok(existsSync(join(root, 'docs', 'READINESS.md')));
    writeFileSync(join(root, 'in.json'), JSON.stringify([row({ id: 'SEC-08', status: 'fail', evidence: 'src/a.js:1 *', files: ['src/a.js'] })]));
    ok(run(['apply', '../in.json', '--consume'], sub));
    assert.ok(!existsSync(join(root, 'in.json')), '--consume deletes the input after a good apply');
    assert.match(ok(run(['status'], sub)).out, /stage 2 \(paying customers\): NO-GO, must-fix open: SEC-08/);
    ok(run(['stamp'], sub));
    let r;
    writeFileSync(join(root, 'src/a.js'), 'y\n');
    r = run(['refresh', '--dry-run'], sub);
    assert.match(r.out, /SEC-08: recheck \(was fail\): src\/a\.js changed/);
    const ledger = () => readFileSync(join(root, 'docs', 'READINESS.md'), 'utf8');
    assert.match(ledger(), /\| SEC-08 \|[^\n]*\| fail \|/, '--dry-run writes nothing');
    run(['refresh'], sub);
    assert.match(ledger(), /\| SEC-08 \|[^\n]*\| recheck \|/);
  });

  test('a bad input exits 1 with the reason and leaves the ledger as it was', () => {
    const root = project({ 'a.js': 'x\n' });
    writeFileSync(join(root, 'READINESS.md'), SAMPLE);
    writeFileSync(join(root, 'rows.json'), JSON.stringify([row({ id: 'X', evidence: 'no line' })]));
    const r = run(['apply', 'rows.json', '--root', '.', '--consume'], root);
    assert.deepEqual([r.code, existsSync(join(root, 'rows.json'))], [1, true]);
    assert.match(r.err, /file:line/);
    assert.equal(readFileSync(join(root, 'READINESS.md'), 'utf8'), SAMPLE);
  });
});

describe('the fixtures', () => {
  test('nothing inside the copied fixture folders names a seeded gap', () => {
    const base = repo('tests', 'fixtures', 'launch-readiness');
    const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
    for (const dir of ['web-app', 'cli-tool']) {
      for (const f of walk(join(base, dir))) {
        assert.doesNotMatch(readFileSync(f, 'utf8'), /seeded|\bgap\b|\bfake\b|vulnerab|insecure|\bIDOR\b|TODO|FIXME/i, f);
      }
    }
  });
});
