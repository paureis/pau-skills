// wizard.mjs run with piped stdin and stdout: the steps in order, resume, the confirm gate, skip, quit, EOF, opening a
// page, and the function that picks the browser opener.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chmodSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { delimiter, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { tempDir } from './helpers.mjs';
import { WIZARD, wizard, fixture, steps, step, exits, passesLater } from './wizard.helpers.mjs';

const { openerFor, onPath } = await import(pathToFileURL(WIZARD).href);

const run = (list, input, { files = {}, env = {}, args = [] } = {}) => wizard(['run', 'steps.json', ...args], { cwd: fixture(steps(list), files), env, input });
const prompts = (out) => out.split('Press Enter when this step is done (s to skip, q to quit)').length - 1;
const summary = (out, label) => out.split('\n').find((l) => l.startsWith(`${label}: `))?.slice(label.length + 2);

test('run walks the steps in order, showing say lines and the command without running it', async () => {
  const typed = `${process.execPath} -e "require('fs').writeFileSync('typed', '')"`;
  const dir = fixture(steps([step('a', [passesLater('a.count')], { say: ['First, do the first thing.'], command: typed }), step('b', [passesLater('b.count')])], 'Two steps'));
  const r = await wizard(['run', 'steps.json'], { cwd: dir, input: '\n\n' });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Two steps/);
  assert.match(r.out, /2 steps/);
  const order = ['Step 1/2: Title a', 'First, do the first thing.', typed, 'Step 2/2: Title b'].map((s) => r.out.indexOf(s));
  assert.ok(order.every((n, i) => n >= 0 && (i === 0 || n > order[i - 1])), r.out);
  assert.equal(prompts(r.out), 2, r.out);
  assert.equal(summary(r.out, 'Done'), 'a, b', r.out);
  assert.ok(!existsSync(join(dir, 'typed')), "the wizard ran the step's command");
});

test('run passes over a step that already passes, a confirm step too, so a re-run resumes', async () => {
  const r = await run([step('a', [{ file: 'there' }], { confirm: true }), step('b', [passesLater('b.count')])], '\n', { files: { there: '' } });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /Step 1\/2: Title a: already done/);
  assert.equal(prompts(r.out), 1, r.out);
  assert.ok(!/cannot be undone/.test(r.out), 'the confirm step asked for a yes');
  assert.equal(summary(r.out, 'Done'), 'a, b', r.out);
});

test('a confirm step stops the wizard on any answer but y, Y or yes', async () => {
  for (const answer of ['n', '', 'yep', 'q']) {
    const r = await run([step('a', [passesLater('a.count')], { confirm: true }), step('b', [passesLater('b.count')])], `${answer}\n\n\n`);
    assert.equal(r.code, 1, `${JSON.stringify(answer)}: ${r.out}`);
    assert.match(r.out, /cannot be undone/);
    assert.equal(prompts(r.out), 0, r.out);
    assert.equal(summary(r.out, 'Not reached'), 'a, b', r.out);
  }
});

test('a confirm step goes on with y, Y or yes', async () => {
  for (const answer of ['y', 'Y', 'yes']) {
    const r = await run([step('a', [passesLater('a.count')], { confirm: true }), step('b', [passesLater('b.count')])], `${answer}\n\n\n`);
    assert.equal(r.code, 0, `${answer}: ${r.out}`);
    assert.equal(summary(r.out, 'Done'), 'a, b', r.out);
  }
});

test('a failed check is named; r and an empty line retry, s skips, and the skipped step is still to do', async () => {
  const r = await run([step('a', [exits(1)]), step('b', [passesLater('b.count')])], '\n\nr\ns\n\n');
  assert.equal(r.code, 1, r.out);
  assert.equal(r.out.split(`Check failed: command ${process.execPath} -e process.exit(1): exited 1`).length - 1, 3, r.out);
  assert.equal(summary(r.out, 'Done'), 'b', r.out);
  assert.equal(summary(r.out, 'Skipped, still to do by hand'), 'a', r.out);
  assert.equal(summary(r.out, 'Not reached'), undefined, r.out);
});

test('s at the Enter prompt skips the step without running its checks', async () => {
  const r = await run([step('a', [passesLater('a.count')]), step('b', [passesLater('b.count')])], 's\n\n');
  assert.equal(r.code, 1, r.out);
  assert.equal(prompts(r.out), 2, r.out);
  assert.ok(!r.out.includes('Check failed'), r.out);
  assert.equal(summary(r.out, 'Skipped, still to do by hand'), 'a', r.out);
  assert.equal(summary(r.out, 'Done'), 'b', r.out);
});

test('one step is counted as 1 step, not 1 steps', async () => {
  const r = await run([step('a', [passesLater('a.count')])], '\n');
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^1 step\. /m);
  assert.ok(!/\b1 steps\b/.test(r.out), r.out);
});

test('q stops the wizard; the step where it stopped and the later ones are not reached', async () => {
  const atEnter = await run([step('a', [passesLater('a.count')]), step('b', [exits(1)]), step('c', [exits(1)])], '\nq\n\n');
  assert.equal(atEnter.code, 1, atEnter.out);
  assert.equal(summary(atEnter.out, 'Done'), 'a', atEnter.out);
  assert.equal(summary(atEnter.out, 'Not reached'), 'b, c', atEnter.out);
  const afterFail = await run([step('a', [exits(1)]), step('b', [exits(1)])], '\nq\n\n');
  assert.equal(afterFail.code, 1, afterFail.out);
  assert.equal(summary(afterFail.out, 'Not reached'), 'a, b', afterFail.out);
});

test('EOF at any prompt quits', async () => {
  const none = await run([step('a', [exits(1)]), step('b', [exits(1)])], '');
  assert.equal(none.code, 1, none.out);
  assert.equal(summary(none.out, 'Not reached'), 'a, b', none.out);
  const midway = await run([step('a', [passesLater('a.count')]), step('b', [exits(1)])], '\n\n');
  assert.equal(midway.code, 1, midway.out);
  assert.equal(summary(midway.out, 'Done'), 'a', midway.out);
  assert.equal(summary(midway.out, 'Not reached'), 'b', midway.out);
});

test('a failed env check says a variable set in another terminal is not seen', async () => {
  const r = await run([step('a', [{ env: 'WIZ_NOT_HERE' }])], '\nq\n', { env: { WIZ_NOT_HERE: undefined } });
  assert.equal(r.code, 1, r.out);
  assert.match(r.out, /another terminal/);
  assert.match(r.out, /envFile or command check/);
});

test('run with a bad file exits 2', async () => {
  const r = await run([step('a', [])], '\n');
  assert.equal(r.code, 2, r.out);
  assert.ok(r.out.includes('steps[0].checks: not a non-empty array'), r.out);
});

test('with piped stdout the URL is printed, nothing is opened, and the screen is never cleared', { skip: process.platform === 'win32' }, async () => {
  const bin = tempDir('wizard-bin-');
  const marks = tempDir('wizard-marks-');
  for (const name of ['xdg-open', 'open', 'wslview']) {
    writeFileSync(join(bin, name), `#!/bin/sh\necho opened > "${join(marks, name)}"\n`);
    chmodSync(join(bin, name), 0o755);
  }
  const url = 'https://example.com/keys?tab=api&mode=test';
  const list = [step('a', [passesLater('a.count')], { open: url }), step('b', [passesLater('b.count')])];
  for (const args of [[], ['--no-open']]) {
    const r = await run(list, '\n\n', { args, env: { PATH: `${bin}${delimiter}${process.env.PATH}` } });
    assert.equal(r.code, 0, r.out);
    assert.ok(r.out.includes(`Open this page: ${url}`), r.out);
    assert.deepEqual(readdirSync(marks), [], `an opener ran with ${args.join(' ') || 'no flag'}`);
    assert.ok(!r.out.includes('\x1b['), 'the output holds an escape sequence');
  }
});

test('openerFor picks open, rundll32, wslview or xdg-open, with the URL in one argv element', () => {
  const url = 'https://example.com/a?x=1&y=2';
  assert.deepEqual(openerFor({ url, platform: 'darwin', env: {}, procVersion: '', onPath: () => true }), { command: 'open', args: [url] });
  const win = openerFor({ url, platform: 'win32', env: {}, procVersion: '', onPath: () => true });
  assert.deepEqual(win, { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url] });
  assert.equal(win.args.at(-1), url, 'the & split the URL');
  const has = (names) => (n) => names.includes(n);
  assert.deepEqual(openerFor({ url, platform: 'linux', env: { WSL_DISTRO_NAME: 'Ubuntu' }, procVersion: '', onPath: has(['wslview']) }), { command: 'wslview', args: [url] });
  assert.deepEqual(openerFor({ url, platform: 'linux', env: {}, procVersion: 'Linux version 5.15.0-microsoft-standard-WSL2', onPath: has(['wslview']) }), { command: 'wslview', args: [url] });
  assert.deepEqual(openerFor({ url, platform: 'linux', env: { WSL_DISTRO_NAME: 'Ubuntu' }, procVersion: '', onPath: has([]) }), { command: 'xdg-open', args: [url] });
  assert.deepEqual(openerFor({ url, platform: 'linux', env: {}, procVersion: 'Linux version 6.8.0-generic', onPath: has(['wslview']) }), { command: 'xdg-open', args: [url] });
  assert.deepEqual(openerFor({ url, platform: 'freebsd', env: {}, procVersion: '', onPath: has([]) }), { command: 'xdg-open', args: [url] });
});

test('onPath finds an executable in a PATH folder and nothing else', { skip: process.platform === 'win32' }, () => {
  const bin = tempDir('wizard-path-');
  writeFileSync(join(bin, 'wiz-tool'), '#!/bin/sh\n');
  chmodSync(join(bin, 'wiz-tool'), 0o755);
  writeFileSync(join(bin, 'wiz-plain'), 'not executable');
  assert.equal(onPath('wiz-tool', { PATH: `/nonexistent${delimiter}${bin}` }, 'linux'), true);
  assert.equal(onPath('wiz-plain', { PATH: bin }, 'linux'), false);
  assert.equal(onPath('wiz-missing', { PATH: bin }, 'linux'), false);
});
