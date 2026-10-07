// The destructive guard denies commands that destroy work or data for good, and lets ordinary cleanup through.
// git is faked through ctx.git so the tests decide the branch and whether the tree is dirty.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { plugin, runNode, tempDir } from './helpers.mjs';
import { check, context, dangerousRmTarget } from '../plugins/guards/scripts/destructive-guard.mjs';
import { commands, splitCommands } from '../plugins/guards/scripts/shell.mjs';

const GUARD = plugin('guards', 'scripts', 'destructive-guard.mjs');
const ROOT = '/work/project';

function fakeGit({ branch = 'feature/x', dirty = false } = {}) {
  return (args) => {
    if (args[0] === 'rev-parse') return branch === null ? null : branch + '\n';
    if (args[0] === 'status') return dirty ? ' M src/a.js\n' : '';
    return null;
  };
}
const ctx = (git = fakeGit(), options = {}) => context({ root: ROOT, options, git });
const denied = (cmd, c = ctx()) => assert.ok(check(cmd, c), `should deny: ${cmd}`);
const passes = (cmd, c = ctx()) => assert.equal(check(cmd, c), null, `should pass: ${cmd}`);

describe('shell splitting', () => {
  test('splits on operators and drops quotes', () => {
    assert.deepEqual(splitCommands(`a 'b c' && d "e f"; g | h`), [['a', 'b c'], ['d', 'e f'], ['g'], ['h']]);
  });
  test('peels prefixes and env assignments, and looks inside sh -c', () => {
    const cs = commands(`sudo -E FOO=1 rm -rf x; bash -c "git push -f origin main"`);
    assert.deepEqual(cs.map((c) => c.program), ['rm', 'bash', 'git']);
    assert.equal(cs[0].env.FOO, '1');
  });
});

describe('destructive guard: rm', () => {
  for (const c of ['rm -rf /', 'rm -rf /*', 'rm -fr ~', 'rm -rf ~/', 'rm -rf $HOME', 'rm -Rf .', 'rm -rf *', 'rm -rf ..',
    'rm -rf ../other', 'rm -rf "$BUILD_DIR/"', 'rm -rf ${OUT}/dist', 'rm --recursive --force /etc', 'rm -rf /usr/local/lib',
    'rm -r --no-preserve-root /', 'sudo rm -rf /var/lib', `rm -rf ${ROOT}`, 'cd x && rm -rf ~/Documents']) {
    test(`denies ${c}`, () => denied(c));
  }
  for (const c of ['rm -rf node_modules', 'rm -rf ./dist build', `rm -rf ${ROOT}/target`, 'rm -rf /tmp/scratch-123',
    'rm -f /etc/hosts.bak', 'rm file.txt', 'rm -rf "$TMPDIR"', 'echo rm -rf / is bad']) {
    test(`passes ${c}`, () => passes(c));
  }
  test('allowPaths lets rm -r through under a named directory', () => {
    passes('rm -rf /srv/scratch/run1', ctx(fakeGit(), { allowPaths: ['/srv/scratch'] }));
    assert.equal(dangerousRmTarget('/srv/scratch/x', { root: ROOT, allowPaths: [] }) !== null, true);
  });
});

describe('destructive guard: git push', () => {
  for (const c of ['git push --force origin main', 'git push -f origin master', 'git push origin +main', 'git push origin +HEAD:main',
    'git push --force-with-lease origin main', 'git push origin --delete main', 'git push origin :production', 'git push --mirror',
    'git push -f origin feature/x', 'git push --force', 'git -C sub push -f origin release/1.2']) {
    test(`denies ${c}`, () => denied(c));
  }
  for (const c of ['git push origin feature/x', 'git push -u origin feature/x', 'git push --force-with-lease origin feature/x',
    'git push origin --delete feature/old', 'git push --tags', 'git push']) {
    test(`passes ${c}`, () => passes(c));
  }
  test('a force push with no refspec uses the current branch', () => {
    denied('git push --force-with-lease', ctx(fakeGit({ branch: 'main' })));
    passes('git push --force-with-lease', ctx(fakeGit({ branch: 'feature/y' })));
    denied('git push --force-with-lease', ctx(fakeGit({ branch: null })));
  });
  test('protectedBranches replaces the default list', () => {
    passes('git push --force-with-lease origin main', ctx(fakeGit(), { protectedBranches: ['prod'] }));
    denied('git push --force-with-lease origin prod', ctx(fakeGit(), { protectedBranches: ['prod'] }));
  });
});

describe('destructive guard: discarding local work', () => {
  const dirty = ctx(fakeGit({ dirty: true }));
  for (const c of ['git reset --hard', 'git reset --hard HEAD~1', 'git checkout .', 'git checkout -- .', 'git restore .']) {
    test(`denies ${c} on a dirty tree`, () => denied(c, dirty));
    test(`passes ${c} on a clean tree`, () => passes(c));
  }
  test('git clean -f is denied, a dry run passes', () => {
    denied('git clean -fd'); denied('git clean -fdx'); denied('git clean --force');
    passes('git clean -n'); passes('git clean -nfd'); passes('git clean --dry-run -f');
  });
  test('targeted restores and staged restores pass on a dirty tree', () => {
    passes('git checkout -- src/a.js', dirty); passes('git restore --staged .', dirty); passes('git checkout feature/x', dirty);
  });
  test('stash clear and deleting a protected branch are denied', () => {
    denied('git stash clear'); denied('git branch -D main');
    passes('git stash drop'); passes('git branch -D feature/old'); passes('git branch -d main');
  });
});

describe('destructive guard: disks, databases, infrastructure', () => {
  for (const c of ['mkfs.ext4 /dev/sdb1', 'dd if=image.iso of=/dev/sda bs=4M', 'chmod -R 777 /', 'chown -R me ~', ':(){ :|:& };:',
    'psql -c "DROP DATABASE app"', 'mysql -e "drop schema shop"', 'terraform destroy', 'terraform apply -destroy -auto-approve',
    'tofu destroy', 'kubectl delete namespace prod', 'kubectl delete ns/staging', 'kubectl delete pods --all', 'aws s3 rm s3://b --recursive',
    'aws s3 rb s3://b --force', 'gcloud projects delete my-proj']) {
    test(`denies ${c}`, () => denied(c));
  }
  for (const c of ['dd if=/dev/zero of=out.img bs=1M count=1', 'dd if=x of=/dev/null', 'chmod -R 755 ./bin', 'psql -c "DROP TABLE tmp_import"',
    'terraform plan', 'kubectl delete pod web-1', 'aws s3 rm s3://b/key', 'npm run build']) {
    test(`passes ${c}`, () => passes(c));
  }
  test('allowCommands regexes let a command through', () => {
    passes('terraform destroy -target=module.tmp', ctx(fakeGit(), { allowCommands: ['^terraform destroy -target='] }));
    denied('terraform destroy', ctx(fakeGit(), { allowCommands: ['^terraform destroy -target='] }));
  });
});

describe('destructive guard: as a hook, with real git', () => {
  test('denies git reset --hard in a repo with an uncommitted change, passes once committed', () => {
    const repo = tempDir();
    const g = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'ignore' });
    g('init', '-q'); g('config', 'user.email', 'a@example.com'); g('config', 'user.name', 'a');
    writeFileSync(join(repo, 'a.txt'), '1'); g('add', '.'); g('commit', '-qm', 'one');
    writeFileSync(join(repo, 'a.txt'), '2');
    const input = JSON.stringify({ tool_name: 'Bash', cwd: repo, tool_input: { command: 'git reset --hard' } });
    const env = { PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: '' };
    const r = runNode(GUARD, { input, env });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /destructive-guard/);
    g('commit', '-qam', 'two');
    assert.equal(runNode(GUARD, { input, env }).code, 0);
  });
  test('odd input exits 0', () => {
    assert.equal(runNode(GUARD, { input: '{}' }).code, 0);
    assert.equal(runNode(GUARD, { input: 'x' }).code, 0);
  });
});
