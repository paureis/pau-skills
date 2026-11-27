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

// check refuses the file with exit 1 and names `problem`.
async function refused(data, problem) {
  const r = await check(data);
  assert.equal(r.code, 1, r.out);
  assert.ok(r.out.includes(problem), `expected "${problem}" in:\n${r.out}`);
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

test('example-steps.json passes', async () => {
  const r = await wizard(['check', repo('skills', 'session-discipline', 'wizard', 'example-steps.json')], { cwd: fixture(undefined) });
  assert.equal(r.code, 0, r.out);
  assert.match(r.out, /^1\. /m);
  assert.match(r.out, /^2\. /m);
});

test('an unknown key is named by its place, and its value is not printed', async () => {
  const r = await refused({ title: 'T', steps: [step('a', [{ file: 'x', value: 'planted-check-value-41' }], { value: 'planted-check-value-42' })], value: 'planted-check-value-43' },
    'steps[0].checks[0]: unknown key "value"');
  assert.ok(r.out.includes('steps[0]: unknown key "value"'), r.out);
  assert.ok(r.out.includes('top level: unknown key "value"'), r.out);
  assert.ok(!r.out.includes('planted-check-value'), 'the output quotes a value from the file');
});

test('a duplicate id is refused', () => refused(steps([step('a', [{ file: 'x' }]), step('a', [{ file: 'y' }])]), 'steps[1].id: duplicate of steps[0]'));

test('an unknown check kind is refused', async () => {
  const r = await refused(steps([step('a', [{ secret: 'MY_KEY' }])]), 'steps[0].checks[0]: unknown key "secret"');
  assert.ok(r.out.includes('steps[0].checks[0]: no check kind'), r.out);
  await refused(steps([step('a', [{ file: 'x', env: 'A' }])]), 'steps[0].checks[0]: more than one check kind');
});

test('a URL with credentials is refused in url and in open, and the credentials are not printed', async () => {
  let r = await refused(steps([step('a', [{ url: 'https://someone:hunter2planted@example.com/x', status: 200 }])]), 'steps[0].checks[0].url: holds credentials');
  assert.ok(!r.out.includes('hunter2planted'), 'the output quotes the password');
  r = await refused(steps([step('a', [{ file: 'x' }], { open: 'https://tokenplanted@example.com/x' })]), 'steps[0].open: holds credentials');
  assert.ok(!r.out.includes('tokenplanted'), 'the output quotes the user part');
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
