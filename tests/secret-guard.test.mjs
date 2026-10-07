// The secret guard denies credentials written into files, by known format or by a random-looking literal assigned to
// a secret-sounding name, and lets placeholders, environment lookups and .env files through.
// Token fixtures are assembled at runtime so this file itself never contains a credential-shaped string.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { findSecret, decide, allowedPath, entropy } from '../hooks/guards/secret-guard.mjs';

const GUARD = repo('hooks', 'guards', 'secret-guard.mjs');
const j = (...p) => p.join('');

const SECRETS = [
  ['AWS key id', j('AKIA', 'QWERTYUIOPASDF12')],
  ['GitHub token', j('gh', 'p_', 'A1b2C3d4'.repeat(5))],
  ['GitHub fine-grained token', j('github', '_pat_', 'A1b2C3d4E5'.repeat(7))],
  ['GitLab token', j('gl', 'pat-', 'A1b2C3d4E5f6G7h8I9j0')],
  ['Slack token', j('xo', 'xb-', '1234567890-abcdefghij')],
  ['Stripe live key', j('sk', '_live_', 'A1b2C3d4E5f6G7h8I9j0K1')],
  ['Google API key', j('AI', 'za', 'SyA1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6q')],
  ['Anthropic key', j('sk-', 'ant-', 'api03-A1b2C3d4E5f6G7h8I9j0K1')],
  ['OpenAI project key', j('sk-', 'proj-', 'A1b2C3d4E5'.repeat(5))],
  ['private key', j('-----BEGIN ', 'RSA PRIVATE KEY-----\nMIIEow...')],
  ['OpenSSH private key', j('-----BEGIN ', 'OPENSSH PRIVATE KEY-----')],
  ['password in a URL', j('postgres://admin:', 'Hu7xK2pQ9z', '@db.internal:5432/app')],
  ['assigned literal (python)', j('API_KEY = "', 'q8Zr2LmX9vT4nB7kW1pY3sJ6', '"')],
  ['assigned literal (yaml)', j('client_secret: ', 'Zx9Qw8Er7Ty6Ui5Op4As3Df2')],
  ['assigned literal (json)', j('{"password": "', 'Tr0ub4dor&3xKq9Lm2Zp', '"}')],
  ['assigned literal (shell)', j('export AUTH_TOKEN=', 'a8F3kL0pQ7zX2mN5vB9cR4tY')],
];
const SAFE = [
  ['env lookup (node)', 'const key = process.env.OPENAI_API_KEY;'],
  ['env lookup (python)', 'API_KEY = os.environ["API_KEY"]'],
  ['template variable', 'token: ${GITHUB_TOKEN}'],
  ['placeholder', 'API_KEY = "your-api-key-here-please-change"'],
  ['changeme', 'password: changeme_before_deploying_now'],
  ['xxxx placeholder', 'secret = "xxxxxxxxxxxxxxxxxxxxxxxx"'],
  ['example in the value', j('aws_access_key_id = ', 'AKIAIOSFODNN7EXAMPLE')],
  ['words, not a secret', 'token_type = "bearer_access_token_value"'],
  ['short value', 'password = "hunter2"'],
  ['a hash that is not under a secret name', 'commit = "9fceb02d0ae598e95dc970b74767f19372d61af8"'],
  ['URL without password', 'https://example.org/org/repo.git'],
  ['URL with a variable password', 'postgres://admin:${DB_PASSWORD}@db:5432/app'],
  ['ordinary code', 'function token(x) { return x.split(" ").map(Number); }'],
];

describe('secret guard: findSecret', () => {
  for (const [n, s] of SECRETS) test(`finds ${n}`, () => assert.ok(findSecret(`line\n${s}\nline`), s));
  for (const [n, s] of SAFE) test(`ignores ${n}`, () => assert.equal(findSecret(s), null, s));
  test('entropy of a random literal is above 3.5 and of a repeated one below', () => {
    assert.ok(entropy('q8Zr2LmX9vT4nB7kW1pY3sJ6') > 3.5);
    assert.ok(entropy('aaaaaaaaaaaaaaaaaaaa') < 1);
  });
});

describe('secret guard: paths', () => {
  test('.env files are where secrets belong', () => {
    assert.equal(allowedPath('/p/.env', '/p'), true);
    assert.equal(allowedPath('/p/.env.local', '/p'), true);
    assert.equal(allowedPath('/p/config/.env.production', '/p'), true);
  });
  test('shared env templates are checked', () => {
    assert.equal(allowedPath('/p/.env.example', '/p'), false);
    assert.equal(allowedPath('/p/.env.sample', '/p'), false);
  });
  test('allowPaths globs match relative paths and basenames', () => {
    assert.equal(allowedPath('/p/tests/fixtures/keys/a.pem', '/p', ['tests/fixtures/**']), true);
    assert.equal(allowedPath('/p/src/a.pem', '/p', ['tests/fixtures/**']), false);
    assert.equal(allowedPath('/p/src/a.key.test', '/p', ['*.key.test']), true);
  });
});

describe('secret guard: decide', () => {
  const key = j('AKIA', 'QWERTYUIOPASDF12');
  test('Write, Edit, MultiEdit and NotebookEdit are all checked', () => {
    assert.ok(decide({ tool_name: 'Write', tool_input: { file_path: 'a.py', content: `k = "${key}"` } }));
    assert.ok(decide({ tool_name: 'Edit', tool_input: { file_path: 'a.py', old_string: 'x', new_string: key } }));
    assert.ok(decide({ tool_name: 'MultiEdit', tool_input: { file_path: 'a.py', edits: [{ old_string: 'a', new_string: 'b' }, { old_string: 'c', new_string: key }] } }));
    assert.ok(decide({ tool_name: 'NotebookEdit', tool_input: { notebook_path: 'a.ipynb', new_source: key } }));
  });
  test('the reason shows only a prefix of the secret', () => {
    const r = decide({ tool_name: 'Write', tool_input: { file_path: 'a.py', content: key } });
    assert.match(r, /AKIAQW\.\.\./);
    assert.ok(!r.includes(key));
  });
  test('an Edit that keeps an existing secret is not a new leak', () => {
    assert.equal(decide({ tool_name: 'Edit', tool_input: { file_path: 'a.py', old_string: `k = "${key}"  # old`, new_string: `k = "${key}"  # new` } }), null);
  });
  test('other tools and odd input pass', () => {
    assert.equal(decide({ tool_name: 'Bash', tool_input: { command: key } }), null);
    assert.equal(decide({ tool_name: 'Write', tool_input: {} }), null);
    assert.equal(decide(null), null);
  });
});

describe('secret guard: as a hook', () => {
  const key = j('gh', 'p_', 'A1b2C3d4'.repeat(5));
  const env = (home) => ({ PAU_SKILLS_HOME: home, CLAUDE_PROJECT_DIR: '' });
  test('denies with exit 2 and a reason on stderr', () => {
    const p = tempDir();
    const r = runNode(GUARD, { input: JSON.stringify({ tool_name: 'Write', cwd: p, tool_input: { file_path: join(p, 'src/a.js'), content: `const t = '${key}'` } }), env: env(tempDir()) });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /secret-guard.*GitHub token/);
  });
  test('passes when turned off in the project config, and honours allowPaths', () => {
    const p = tempDir(); mkdirSync(join(p, '.claude'));
    const input = JSON.stringify({ tool_name: 'Write', cwd: p, tool_input: { file_path: join(p, 'fixtures/a.txt'), content: key } });
    writeFileSync(join(p, '.claude', 'pau-skills.json'), JSON.stringify({ 'secret-guard': { allowPaths: ['fixtures/**'] } }));
    assert.equal(runNode(GUARD, { input, env: env(tempDir()) }).code, 0);
    writeFileSync(join(p, '.claude', 'pau-skills.json'), JSON.stringify({ hooks: { 'secret-guard': false } }));
    const other = JSON.stringify({ tool_name: 'Write', cwd: p, tool_input: { file_path: join(p, 'src/a.txt'), content: key } });
    assert.equal(runNode(GUARD, { input: other, env: env(tempDir()) }).code, 0);
  });
  test('garbage input exits 0', () => {
    assert.equal(runNode(GUARD, { input: 'not json' }).code, 0);
    assert.equal(runNode(GUARD, { input: '' }).code, 0);
  });
});
