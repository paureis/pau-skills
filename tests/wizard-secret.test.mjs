// The planted secret: one distinctive value sits in an environment variable, a .env line, a file a file check points
// at, the body a url check gets, and the output of a command check. check, status and run, on passing and failing
// paths, must never print it, and must write no file at all. The messages here name only the stream, never the value.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { wizard, fixture, steps, step, server, listing } from './wizard.helpers.mjs';

const SECRET = `planted-${randomBytes(8).toString('hex')}-value`;
const PRINT = 'process.stdout.write(process.env.WIZ_PLANTED); process.stderr.write(process.env.WIZ_PLANTED);';

test('no command prints the planted value or writes a file, on passing and failing paths', async () => {
  const local = await server(SECRET);
  try {
    const pass = steps([
      step('env', [{ env: 'WIZ_PLANTED' }]),
      step('env-file', [{ envFile: '.env', key: 'WIZ_TOKEN' }]),
      step('file', [{ file: 'secret.txt' }]),
      step('url', [{ url: local.url('/ok'), status: 200 }]),
      step('command', [{ command: [process.execPath, '-e', PRINT] }]),
    ]);
    const fail = steps([
      step('env', [{ env: 'WIZ_PLANTED_ELSEWHERE' }]),
      step('env-file', [{ envFile: '.env.fail', key: 'WIZ_TOKEN' }]),
      step('file', [{ file: 'secret.txt.missing' }]),
      step('url', [{ url: local.url('/ok'), status: 404 }]),
      step('command', [{ command: [process.execPath, '-e', `${PRINT} process.exit(1);`] }]),
    ]);
    const dir = fixture(undefined, {
      'pass.json': JSON.stringify(pass, null, 2),
      'fail.json': JSON.stringify(fail, null, 2),
      'bad.json': JSON.stringify({ title: 'T', steps: [step('a', [{ file: 'x', value: SECRET }])] }),
      'broken.json': `{"title": "T", "steps": [${SECRET}]}`,
      '.env': `WIZ_TOKEN=${SECRET}\n`,
      '.env.fail': `WIZ_TOKEN=${SECRET}\nexport WIZ_OTHER="${SECRET}" # note\nWIZ_TOKEN=\n`,
      'secret.txt': SECRET,
    });
    const before = listing(dir);
    const env = { WIZ_PLANTED: SECRET, WIZ_PLANTED_ELSEWHERE: undefined };
    const runs = [
      [['check', 'pass.json'], '', 0], [['check', 'fail.json'], '', 0], [['check', 'bad.json'], '', 1], [['check', 'broken.json'], '', 1],
      [['status', 'pass.json'], '', 0], [['status', 'fail.json'], '', 1], [['status', 'bad.json'], '', 2],
      [['run', 'pass.json'], '', 0], [['run', 'fail.json'], '\ns\n\nr\ns\n\ns\n\ns\n\ns\n', 1], [['run', 'fail.json'], '\nq\n', 1],
    ];
    for (const [args, input, code] of runs) {
      const r = await wizard(args, { cwd: dir, env, input });
      const name = args.join(' ');
      assert.equal(r.code, code, `${name}: exit code`);
      assert.ok(!r.stdout.includes(SECRET), `${name}: stdout holds the planted value`);
      assert.ok(!r.stderr.includes(SECRET), `${name}: stderr holds the planted value`);
    }
    assert.ok(listing(dir) === before, 'the wizard wrote, changed or removed a file in the fixture folder');
  } finally { await local.close(); }
});
