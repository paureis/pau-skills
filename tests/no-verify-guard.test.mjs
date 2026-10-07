// The no-verify guard denies skipping git hooks and commit signing, and understands quotes and short option groups.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { plugin, runNode, tempDir } from './helpers.mjs';
import { check } from '../plugins/guards/scripts/no-verify-guard.mjs';

const GUARD = plugin('guards', 'scripts', 'no-verify-guard.mjs');

const DENY = ['git commit --no-verify -m "x"', 'git commit -n -m x', 'git commit -nm x', 'git commit -anm x', 'git commit -an',
  'git push --no-verify', 'git merge --no-verify feature', 'git rebase --no-verify main', 'git -c core.hooksPath=/dev/null commit -m x',
  'HUSKY=0 git commit -m x', 'SKIP=eslint git commit -m x', 'LEFTHOOK=0 git push', 'git commit --no-gpg-sign -m x',
  'git -c commit.gpgsign=false commit -m x', 'git add . && git commit --no-verify -m wip', 'bash -c "git commit -n -m x"'];
const PASS = ['git commit -m "skip with --no-verify next time"', 'git commit -mn', 'git commit -m "-n"', 'git commit -am fix',
  'git commit --amend --no-edit', 'git push origin feature', 'git log -n 5', 'ls -n && git commit -m x', 'HUSKY=1 git commit -m x',
  'git commit -F msg.txt', 'git commit --message -n', 'git commit -m -n', 'npm run lint -- --no-verify', 'echo HUSKY=0'];

describe('no-verify guard: denies', () => { for (const c of DENY) test(c, () => assert.ok(check(c), c)); });
describe('no-verify guard: passes', () => { for (const c of PASS) test(c, () => assert.equal(check(c), null, c)); });

test('allowSigningBypass lets --no-gpg-sign through but not --no-verify', () => {
  assert.equal(check('git commit --no-gpg-sign -m x', { allowSigningBypass: true }), null);
  assert.ok(check('git commit --no-verify -m x', { allowSigningBypass: true }));
});

test('as a hook: exit 2 with the reason, exit 0 on odd input', () => {
  const env = { PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: '' };
  const r = runNode(GUARD, { input: JSON.stringify({ tool_name: 'Bash', cwd: tempDir(), tool_input: { command: 'git commit -n -m x' } }), env });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /no-verify-guard/);
  assert.equal(runNode(GUARD, { input: 'nope' }).code, 0);
  assert.equal(runNode(GUARD, { input: JSON.stringify({ tool_name: 'Write', tool_input: {} }) }).code, 0);
});
