// wizard.mjs status: every check kind passes and fails, one line per step, and the exit code says whether all are done.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { wizard, fixture, steps, step, exits, server } from './wizard.helpers.mjs';

// The status line of step `id`.
const line = (out, id) => out.split('\n').find((l) => new RegExp(`^\\d+\\. ${id}: `).test(l)) ?? `(no line for ${id})`;
const done = (out, id) => assert.match(line(out, id), new RegExp(`^\\d+\\. ${id}: done$`), out);
const notDone = (out, id, why) => {
  assert.match(line(out, id), new RegExp(`^\\d+\\. ${id}: not done`), out);
  assert.ok(line(out, id).includes(why), `${id} should name "${why}":\n${out}`);
};

async function status(list, { files = {}, env = {} } = {}) {
  return wizard(['status', 'steps.json'], { cwd: fixture(steps(list), files), env });
}

test('file: done when the path exists, not done when it does not', async () => {
  const r = await status([step('here', [{ file: 'config/app.json' }]), step('away', [{ file: 'absent.txt' }])], { files: { 'config/app.json': '{}' } });
  assert.equal(r.code, 1, r.out);
  done(r.out, 'here');
  notDone(r.out, 'away', 'file absent.txt');
});

test('env: done when set and non-empty in this environment', async () => {
  const r = await status([step('set', [{ env: 'WIZ_SET' }]), step('empty', [{ env: 'WIZ_EMPTY' }]), step('unset', [{ env: 'WIZ_UNSET' }])],
    { env: { WIZ_SET: 'yes', WIZ_EMPTY: '', WIZ_UNSET: undefined } });
  assert.equal(r.code, 1, r.out);
  done(r.out, 'set');
  notDone(r.out, 'empty', 'env WIZ_EMPTY');
  notDone(r.out, 'unset', 'env WIZ_UNSET');
});

test('envFile: a plain, export or indented line counts; empty, quoted empty, comment-only and commented-out lines do not', async () => {
  const env = ['PLAIN=abc', 'export EXPORTED=def', '  INDENTED=ghi', 'HASH=abc#def', 'QUOTED="x y"', 'EMPTY=', 'DQ=""', "SQ=''",
    'COMMENT_ONLY= # fill this in', '#GONE=jkl', '# HIDDEN=mno', 'TWICE=first', 'TWICE=', 'LATER=', 'LATER=second', ''].join('\r\n');
  const set = ['PLAIN', 'EXPORTED', 'INDENTED', 'HASH', 'QUOTED', 'LATER'];
  const unset = ['EMPTY', 'DQ', 'SQ', 'COMMENT_ONLY', 'GONE', 'HIDDEN', 'TWICE', 'MISSING'];
  const r = await status([...set, ...unset].map((k) => step(k.toLowerCase(), [{ envFile: '.env', key: k }])).concat(step('nofile', [{ envFile: 'none.env', key: 'PLAIN' }])),
    { files: { '.env': env } });
  assert.equal(r.code, 1, r.out);
  for (const k of set) done(r.out, k.toLowerCase());
  for (const k of unset) notDone(r.out, k.toLowerCase(), `envFile .env key ${k}`);
  notDone(r.out, 'nofile', 'envFile none.env key PLAIN');
});

test('url: done on the expected status, not done with expected and actual, and a network error by its code', async () => {
  const local = await server('body');
  const closed = await server();
  const refused = closed.url('/ok');
  await closed.close();
  try {
    const r = await status([step('ok', [{ url: local.url('/ok'), status: 200 }]), step('gone', [{ url: local.url('/gone'), status: 404 }]),
      step('wrong', [{ url: local.url('/missing'), status: 200 }]), step('down', [{ url: refused, status: 200 }])]);
    assert.equal(r.code, 1, r.out);
    done(r.out, 'ok');
    done(r.out, 'gone');
    notDone(r.out, 'wrong', `url ${local.url('/missing')} status 200: expected 200, got 404`);
    notDone(r.out, 'down', 'ECONNREFUSED');
  } finally { await local.close(); }
});

test('command: done when it exits 0, not done with the argv as written when it does not', async () => {
  const r = await status([step('zero', [exits(0)]), step('one', [exits(1)]), step('none', [{ command: ['wizard-no-such-program-here'] }])]);
  assert.equal(r.code, 1, r.out);
  done(r.out, 'zero');
  notDone(r.out, 'one', `command ${process.execPath} -e process.exit(1): exited 1`);
  notDone(r.out, 'none', 'command wizard-no-such-program-here');
});

test('a step is done only when every check passes, and status exits 0 when every step is done', async () => {
  const mixed = await status([step('both', [exits(0), exits(1)])]);
  assert.equal(mixed.code, 1, mixed.out);
  notDone(mixed.out, 'both', 'exited 1');
  const all = await status([step('a', [exits(0)]), step('b', [{ file: 'x' }])], { files: { x: '' } });
  assert.equal(all.code, 0, all.out);
  done(all.out, 'a');
  done(all.out, 'b');
  assert.match(all.out, /^Relative paths are read from: /m);
});

test('a bad file exits 2 and names the problems as check does', async () => {
  const r = await status([step('a', [{ file: 'x', value: 'v' }])]);
  assert.equal(r.code, 2, r.out);
  assert.ok(r.out.includes('steps[0].checks[0]: 1 unknown key'), r.out);
});
