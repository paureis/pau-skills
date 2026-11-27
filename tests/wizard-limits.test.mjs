// wizard.mjs keeps no process alive and lets no check reach the terminal: a url that streams forever, a command that
// ignores SIGTERM and leaves a child behind, and a command that opens /dev/tty.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { setTimeout as sleep } from 'node:timers/promises';
import { WIZARD, childEnv, wizard, fixture, steps, step } from './wizard.helpers.mjs';

test('a url check on an endpoint that never stops streaming still lets status exit', async () => {
  const s = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'text/plain' });
    const tick = setInterval(() => res.write('chunk\n'), 200);
    res.on('close', () => clearInterval(tick));
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  try {
    const dir = fixture(steps([step('stream', [{ url: `http://127.0.0.1:${s.address().port}/`, status: 200 }])]));
    const r = await wizard(['status', 'steps.json'], { cwd: dir, killAfterMs: 8000 });
    assert.equal(r.killed, false, `status did not exit within 8 s\n${r.out}`);
    assert.equal(r.code, 0, r.out);
    assert.ok(r.ms < 5000, `status took ${r.ms} ms`);
  } finally {
    s.closeAllConnections();
    await new Promise((r) => s.close(r));
  }
});

// Ignores SIGTERM and starts a child that would write `late` after 2.5 s, unless its process group is killed.
const HANG = `const { spawn } = require('child_process');
spawn(process.execPath, ['-e', "setTimeout(() => require('fs').writeFileSync('late', ''), 2500)"], { stdio: 'ignore' });
process.on('SIGTERM', () => {});
setInterval(() => {}, 1000);
`;

test('a command check that ignores SIGTERM fails as timed out, and its whole process group is killed', { skip: process.platform === 'win32' }, async () => {
  const dir = fixture(steps([step('hang', [{ command: [process.execPath, 'hang.js'] }])]), { 'hang.js': HANG });
  const r = await wizard(['status', 'steps.json'], { cwd: dir, env: { WIZARD_COMMAND_TIMEOUT_MS: '1000' }, killAfterMs: 8000 });
  assert.equal(r.killed, false, `status did not exit within 8 s\n${r.out}`);
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /^1\. hang: not done: command .*hang\.js: timed out$/m);
  assert.ok(r.ms < 5000, `status took ${r.ms} ms`);
  await sleep(3000);
  assert.ok(!existsSync(join(dir, 'late')), 'a child of the command outlived the timeout');
});

// `script` gives the wizard a pseudo-terminal as its controlling terminal; without one this cannot be tested here.
const hasScript = process.platform === 'linux' && spawnSync('script', ['--version']).status === 0;

test('a command check cannot open the terminal the wizard runs in', { skip: !hasScript && 'needs util-linux script' }, () => {
  const dir = fixture(steps([step('tty', [{ command: [process.execPath, '-e', "require('fs').writeSync(require('fs').openSync('/dev/tty', 'w'), 'tty-' + 'reached')"] }])]));
  const line = [process.execPath, WIZARD, 'status', 'steps.json'].map((a) => `'${a}'`).join(' ');
  const r = spawnSync('script', ['-qec', line, '/dev/null'], { cwd: dir, env: childEnv(), encoding: 'utf8', timeout: 20000 });
  assert.ok(r.stdout.includes('Relative paths are read from:'), `the wizard did not run under script:\n${r.stdout}${r.stderr}`);
  assert.match(r.stdout, /1\. tty: not done: command /, r.stdout);
  assert.ok(!r.stdout.includes('tty-reached'), 'the command wrote to the terminal');
});
