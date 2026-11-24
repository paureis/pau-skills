// friction-review's own redaction on top of the copied redact(): a secret after a newline of a multi-line command,
// password and key shapes, the home folder of a login with a dot; and the refusal and network classes on the shapes
// Claude Code writes. Every string here is synthetic and built at runtime.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { step, bash, world } from './friction-review.helpers.mjs';
import { show, hideEncodedHome } from '../skills/session-discipline/friction-review/friction-show.mjs';
import { classOf } from '../skills/session-discipline/friction-review/friction-signals.mjs';

const GHP = ['ghp', 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8'].join('_');
const SK = ['sk', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('-');
const PW = ['hunter', '2xyz'].join('');

test('a token on a later line of a multi-line command is redacted', () => {
  const w = world();
  w.session(w.own, 's', [bash(`cat <<'EOF' > cfg\n${GHP}\n${SK}\nEOF`, 'Exit code 1\nfailed', { isError: true })]);
  const r = w.run();
  assert.equal(r.code, 0, r.stderr);
  assert.ok(!r.stdout.includes(GHP) && !r.stdout.includes(SK), r.stdout);
  assert.doesNotMatch(r.stdout, /ghp_|sk-[a-z]/);
  assert.match(r.stdout, /Bash cat <<'EOF' > cfg \[secret\] \[secret\] EOF failed: failed$/m);
});

test('password and key shapes are redacted, and look-alikes that are not secrets stay', () => {
  const cases = [
    [`mysql -h db -uroot -p${PW} shop`, 'mysql -h db -uroot -p[secret] shop'],
    [`psql -p${PW} -h db`, 'psql -p[secret] -h db'],
    [`curl -u admin:${PW} https://x.test`, 'curl -u admin:[secret] https://x.test'],
    [`tool --password ${PW} --verbose`, 'tool --password [secret] --verbose'],
    [`tool --password=${PW}`, 'tool --password=[secret]'],
    [`curl "https://x.test/a?page=2&key=${PW}&token=${PW}"`, 'curl "https://x.test/a?page=2&key=[secret]&token=[secret]"'],
    [`curl https://x.test/a?password=${PW}`, 'curl https://x.test/a?password=[secret]'],
    [`DB_PASS=${PW} APP_TOKEN=${PW} make run`, 'DB_PASS=[secret] APP_TOKEN=[secret] make run'],
    [`export S3_SECRET=${PW} MAP_KEY='${PW}' X_PASSWORD="${PW}"`, 'export S3_SECRET=[secret] MAP_KEY=[secret] X_PASSWORD=[secret]'],
  ];
  for (const [raw, want] of cases) assert.equal(show(raw, 200), want, raw);
  // Controls: a port, a user with no password, a page number, a plain variable, a password file.
  for (const plain of ['mysql -h db -p 8080', 'ssh -p 2222 host', 'curl -u admin https://x.test', 'curl https://x.test/a?page=2&sort=name',
    'PORT=3000 KEYS=4 make run', 'tool --password-file pw.txt']) {
    assert.equal(show(plain, 200), plain);
  }
});

test('the encoded home of a login with a dot is hidden whole', () => {
  const home = join('/', 'home', 'jane.doe');
  assert.equal(hideEncodedHome('ls -home-jane-doe-src-app/x', home), 'ls ~-src-app/x');
  // Another user's folder: only the first segment of the login is known.
  assert.equal(hideEncodedHome('ls -home-ana-src', join('/', 'srv', 'me')), 'ls ~-src');
});

test('refusals by a hook or the user are classed refused and print the class only', () => {
  const shapes = [
    `PreToolUse:Bash hook error: [node "$CLAUDE_PROJECT_DIR"/hooks/guard.mjs]: ${'checking the command '.repeat(5)}Blocked: REFUSALMARK`,
    'PostToolUse:Edit hook error: [node check.mjs]: REFUSALMARK',
    'Stop hook blocking error from command: "node stop.mjs": REFUSALMARK',
    "The user doesn't want to take this action right now. REFUSALMARK",
  ];
  for (const text of shapes) assert.equal(classOf(text), 'refused', text);
  assert.equal(classOf('Exit code 1\nerror: the hook file is missing a newline'), 'other');
  const w = world();
  w.session(w.own, 's', shapes.map((text, i) => bash(`step${i}`, text, { isError: true })));
  const r = w.run();
  assert.match(r.stdout, /^failed calls, refused: 4 in 1 of 1 session$/m);
  assert.match(r.stdout, /^failed calls, other: 0 in 0 of 1 session$/m);
  assert.doesNotMatch(r.stdout, /REFUSALMARK|hook error|blocking error|take this action/);
});

test('network failures: an HTTP status from curl or a server, not any number', () => {
  for (const text of ['curl: (22) The requested URL returned error: 403', 'The requested URL returned error 401', '401 Unauthorized',
    'got 403 Forbidden from the registry', '407 Proxy Authentication Required']) {
    assert.equal(classOf(text), 'network', text);
  }
  for (const text of ['curl: (22) The requested URL returned error: 500', 'expected 403 to equal 200', 'line 401: unexpected token']) {
    assert.equal(classOf(text), 'other', text);
  }
});

test('the unreadable steps path: a content array that extractActions cannot read leaves the transcript out', () => {
  const w = world();
  w.session(w.own, 's', [bash('ls', 'a'), [{ type: 'assistant', message: { role: 'assistant', content: [null] } }]]);
  w.session(w.own, 'ok', [step('Grep', { pattern: 'OKMARK' }, 'a'), step('Edit', { file_path: 'a', old_string: 'a', new_string: 'b' })], { ageMin: 2000 });
  const r = w.run();
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /^# friction-review: 2 sessions .*; 1 transcript left out as unreadable \(its steps did not match\);/m);
  assert.match(r.stdout, /OKMARK/);
});
