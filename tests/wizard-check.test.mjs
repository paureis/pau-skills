// wizard.mjs check and its usage: the steps file is validated without running anything, and a problem is named by its
// place in the file without quoting a value from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { repo } from './helpers.mjs';
import { wizard, fixture, steps, step, server } from './wizard.helpers.mjs';

const USAGE = 'Usage: node wizard.mjs <check|status|run> <steps.json> [--no-open]';

// Runs check on a steps file built from `data` (an object or raw text) and returns the result.
async function check(data) {
  const dir = fixture(data);
  return wizard(['check', 'steps.json'], { cwd: dir });
}

// check refuses the file with exit 1 and names `problem`. With `quiet`, a failure message never shows the output,
// because the file holds a planted value.
async function refused(data, problem, { quiet = false } = {}) {
  const r = await check(data);
  const shown = quiet ? '(output not shown: the file holds a planted value)' : r.out;
  assert.equal(r.code, 1, shown);
  assert.ok(r.out.includes(problem), `expected "${problem}" in:\n${shown}`);
  return r;
}

test('a usage error prints the usage and exits 2', async () => {
  for (const args of [[], ['bogus', 'steps.json'], ['check'], ['status', 'a.json', 'b.json'], ['run', 'a.json', '--loud']]) {
    const r = await wizard(args, { cwd: fixture(undefined) });
    assert.equal(r.code, 2, `${args.join(' ')}: ${r.out}`);
    assert.ok(r.out.includes(USAGE), r.out);
  }
});

test('a valid file passes and prints the numbered step list, running nothing', async () => {
  const local = await server();
  try {
    const dir = fixture(steps([
      step('api-key', [{ envFile: '.env', key: 'API_KEY' }, { file: 'config/app.json' }], { say: ['Make a key.'], open: 'https://example.com/keys' }),
      step('deploy-hook', [{ env: 'DEPLOY_HOOK' }, { url: local.url('/ok'), status: 200 },
        { command: [process.execPath, '-e', "require('fs').writeFileSync('ran', '')"] }], { command: 'gh secret set DEPLOY_HOOK', confirm: true }),
    ]));
    const r = await wizard(['check', 'steps.json'], { cwd: dir });
    assert.equal(r.code, 0, r.out);
    assert.match(r.out, /^1\. api-key: Title api-key/m);
    assert.match(r.out, /envFile \.env key API_KEY/);
    assert.match(r.out, /file config\/app\.json/);
    assert.match(r.out, /^2\. deploy-hook: Title deploy-hook/m);
    assert.match(r.out, /env DEPLOY_HOOK/);
    assert.ok(r.out.includes(`url ${local.url('/ok')} status 200`), r.out);
    assert.ok(r.out.includes(`command ${process.execPath} -e`), r.out);
    assert.ok(r.out.includes(`Relative paths are read from: ${realpathSync(dir)}`), r.out);
    assert.ok(!existsSync(join(dir, 'ran')), 'check ran a command check');
    assert.equal(local.state.hits, 0, 'check made a network call');
  } finally { await local.close(); }
});

test('check counts one step as 1 step, not 1 steps', async () => {
  const r = await check(steps([step('a', [{ file: 'x' }])], 'Single'));
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^Single: 1 step$/m);
});

test('example-steps.json passes', async () => {
  const r = await wizard(['check', repo('skills', 'session-discipline', 'wizard', 'example-steps.json')], { cwd: fixture(undefined) });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^1\. /m);
  assert.match(r.out, /^2\. /m);
});

test('an unknown key is counted at its place with the keys allowed there, and neither its name nor its value is printed', async () => {
  const r = await refused({ title: 'T', steps: [step('a', [{ file: 'x', value: 'planted-check-value-41' }], { value: 'planted-check-value-42' })], value: 'planted-check-value-43' },
    'steps[0].checks[0]: 1 unknown key (allowed here: file, env, envFile, key, url, status, command)');
  assert.ok(r.out.includes('steps[0]: 1 unknown key (allowed here: id, title, say, open, command, confirm, checks)'), r.out);
  assert.ok(r.out.includes('top level: 1 unknown key (allowed here: title, steps)'), r.out);
  assert.ok(!r.out.includes('planted-check-value'), 'the output quotes a value from the file');
  assert.ok(!r.out.includes('"value"'), 'the output names an unknown key');
});

test('a value pasted as a key is printed by neither check nor status', async () => {
  const pasted = ['sk_test_', 'plantedkey', '4242'].join('');
  const dir = fixture({ title: 'T', [pasted]: 1, steps: [{ ...step('a', [{ file: 'x', [pasted]: 2 }, { [pasted]: 3 }]), [pasted]: 4 }] });
  for (const command of ['check', 'status']) {
    const r = await wizard([command, 'steps.json'], { cwd: dir });
    assert.equal(r.code, command === 'check' ? 1 : 2, `${command}: exit code`);
    assert.ok(r.out.includes('steps[0].checks[1]: 1 unknown key'), `${command}: the unknown key in steps[0].checks[1] is not named`);
    assert.ok(r.out.includes('steps[0].checks[1]: no check kind'), `${command}: the missing kind in steps[0].checks[1] is not named`);
    assert.ok(!r.out.includes('plantedkey'), `${command} prints the pasted key`);
  }
});

test('a duplicate id is refused', () => refused(steps([step('a', [{ file: 'x' }]), step('a', [{ file: 'y' }])]), 'steps[1].id: duplicate of steps[0]'));

test('an unknown check kind is refused', async () => {
  const r = await refused(steps([step('a', [{ secret: 'MY_KEY' }])]), 'steps[0].checks[0]: 1 unknown key');
  assert.ok(r.out.includes('steps[0].checks[0]: no check kind'), r.out);
  await refused(steps([step('a', [{ file: 'x', env: 'A' }])]), 'steps[0].checks[0]: more than one check kind');
});

test('a URL with credentials is refused in url and in open, and the credentials are not printed', async () => {
  let r = await refused(steps([step('a', [{ url: 'https://someone:hunter2planted@example.com/x', status: 200 }])]), 'steps[0].checks[0].url: holds credentials', { quiet: true });
  assert.ok(!r.out.includes('hunter2planted'), 'the output quotes the password');
  r = await refused(steps([step('a', [{ file: 'x' }], { open: 'https://tokenplanted@example.com/x' })]), 'steps[0].open: holds credentials', { quiet: true });
  assert.ok(!r.out.includes('tokenplanted'), 'the output quotes the user part');
});

test('a URL whose query may carry a secret is refused in url and in open, and the URL is not printed', async () => {
  const names = ['token', 'access_token', 'Secret', 'client_secret', 'key', 'apikey', 'API_KEY', 'password', 'passwd', 'pass', 'auth',
    'sig', 'signature', 'session', 'sessionid', 'code', 'credential', 'credentials'];
  for (const name of names) {
    const url = `https://example.com/x?page=2&${name}=plantedquery9`;
    let r = await refused(steps([step('a', [{ url, status: 200 }])]), 'steps[0].checks[0].url: the query holds a parameter that may carry a secret', { quiet: true });
    assert.ok(!r.out.includes('plantedquery9') && !r.out.includes('example.com'), `check prints the url with ${name}`);
    r = await refused(steps([step('a', [{ file: 'x' }], { open: url })]), 'steps[0].open: the query holds a parameter that may carry a secret', { quiet: true });
    assert.ok(!r.out.includes('plantedquery9') && !r.out.includes('example.com'), `check prints the open URL with ${name}`);
  }
  const hash = await refused(steps([step('a', [{ file: 'x' }], { open: 'https://example.com/callback#access_token=plantedquery9' })]),
    'steps[0].open: the fragment holds a parameter that may carry a secret', { quiet: true });
  assert.ok(!hash.out.includes('plantedquery9'), 'check prints the open URL with a fragment token');
  const fine = await check(steps([step('a', [{ url: 'https://example.com/keys?tab=api&mode=test&page=2', status: 200 }], { open: 'https://example.com/tokens?tab=new' })]));
  assert.equal(fine.code, 0, fine.out);
});

test('an open or url that is not http or https is refused', async () => {
  await refused(steps([step('a', [{ file: 'x' }], { open: 'ftp://example.com/file' })]), 'steps[0].open: not an http or https URL');
  await refused(steps([step('a', [{ file: 'x' }], { open: 'javascript:alert(1)' })]), 'steps[0].open: not an http or https URL');
  await refused(steps([step('a', [{ url: 'file:///etc/hosts', status: 200 }])]), 'steps[0].checks[0].url: not an http or https URL');
});

test('empty steps, a step with no checks and a missing title are refused', async () => {
  await refused(steps([]), 'steps: not a non-empty array');
  await refused(steps([step('a', [])]), 'steps[0].checks: not a non-empty array');
  await refused({ steps: [step('a', [{ file: 'x' }])] }, 'title: not a non-empty string');
  await refused(steps([{ id: 'a', checks: [{ file: 'x' }] }]), 'steps[0].title: not a non-empty string');
});

test('bad names, statuses, argv and step fields are refused by place', async () => {
  const r = await check(steps([step('a', [
    { env: '1BAD' }, { envFile: '.env', key: 'A-B' }, { url: 'https://example.com', status: 99 }, { url: 'https://example.com', status: 200.5 },
    { command: [] }, { command: ['node', ''] }, { command: 'node -v' }, { file: '' },
  ], { say: 'one line', command: ['gh'], confirm: 'yes' })]));
  assert.equal(r.code, 1, r.out);
  for (const where of ['checks[0].env', 'checks[1].key', 'checks[2].status', 'checks[3].status', 'checks[4].command', 'checks[5].command',
    'checks[6].command', 'checks[7].file', 'steps[0].say', 'steps[0].command', 'steps[0].confirm']) {
    assert.ok(r.out.includes(`${where.startsWith('steps') ? '' : 'steps[0].'}${where}: `), `${where} not named in:\n${r.out}`);
  }
});

test('invalid JSON says so without echoing the parser message, and an unreadable file is refused', async () => {
  const r = await refused('{"title": "T", "steps": [ plantedjsonword ]}', 'not valid JSON');
  assert.ok(!r.out.includes('plantedjsonword'), 'the output quotes the file');
  assert.ok(!/Unexpected token|SyntaxError/.test(r.out), r.out);
  const missing = await wizard(['check', 'nope.json'], { cwd: fixture(undefined) });
  assert.equal(missing.code, 1, missing.out);
  assert.match(missing.out, /cannot read/);
});
