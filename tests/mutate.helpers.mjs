// Shared setup for the mutation harness tests: the throwaway repository built before the tests, the harness runner,
// the past-time repository builder, and the checks at load that decide which tests skip.
import { before } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { repo as repoPath, tempDir, findBash } from './helpers.mjs';

const HARNESS = repoPath('skills', 'verification', 'mutation-test', 'mutate.sh').replace(/\\/g, '/');
const BASH = findBash();
let repo;

const git = (...args) => execFileSync('git', ['-C', repo, ...args], { encoding: 'utf8' });
const SOURCE = 'export const isOwner = (user, doc) => user.id === doc.ownerId;\nexport const add = (a, b) => a + b;\n';
// The "test suite": checks isOwner only, so a mutation of add survives.
const CHECK = "import { isOwner } from './lib.mjs';\nif (!isOwner({ id: 1 }, { ownerId: 1 }) || isOwner({ id: 1 }, { ownerId: 2 })) process.exit(1);\n";

function harness(args, input = '', { env = process.env, cwd = repo } = {}) {
  const r = spawnSync(BASH, [HARNESS, ...args], { cwd, input, env, encoding: 'utf8' });
  return { code: r.status, out: (r.stdout || '') + (r.stderr || '') };
}
const assertRestored = () => {
  assert.equal(readFileSync(join(repo, 'lib.mjs'), 'utf8'), SOURCE);
  assert.equal(git('status', '--porcelain'), '');
};

before(() => {
  repo = tempDir('mutate-');
  execFileSync('git', ['init', '-q', repo]);
  git('config', 'user.email', 'test@example.com');
  git('config', 'user.name', 'test');
  git('config', 'core.autocrlf', 'false');
  git('config', 'commit.gpgsign', 'false');
  writeFileSync(join(repo, 'lib.mjs'), SOURCE);
  writeFileSync(join(repo, 'check.mjs'), CHECK);
  writeFileSync(join(repo, 'other.mjs'), 'export const x = 1;\n');
  git('add', '.');
  git('commit', '-q', '-m', 'init');
});

// A repository where git compares only a file's whole-second modification time and size with what the index recorded
// (core.checkStat minimal, in the repository's own config; the global config is an empty file, as on a CI runner).
// The command sets the file's times to 2020-01-01, keeps its size, and passes only on the original content (`extra`
// runs before that, with `ok` false on the mutant). It runs once before the harness, so the index already holds that
// past time when the harness mutates the file.
function pastTimeRepo(extra = '', { file = 'mod.js', content = 'export const v = 1;\n' } = {}) {
  const dir = tempDir('mutate-stat-');
  const empty = join(tempDir('mutate-gitconfig-'), 'empty');
  writeFileSync(empty, '');
  const env = { ...process.env, GIT_CONFIG_GLOBAL: empty };
  const sgit = (...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', env });
  execFileSync('git', ['init', '-q', dir], { env });
  sgit('config', 'user.email', 'test@example.com');
  sgit('config', 'user.name', 'test');
  sgit('config', 'commit.gpgsign', 'false');
  sgit('config', 'core.autocrlf', 'false');
  sgit('config', 'core.checkStat', 'minimal');
  mkdirSync(join(dir, file, '..'), { recursive: true });
  writeFileSync(join(dir, file), content);
  const F = JSON.stringify(file);
  writeFileSync(join(dir, 'touch.mjs'), "import { utimesSync, readFileSync, writeFileSync, rmSync, symlinkSync, chmodSync } from 'node:fs';\n" +
    "import { execFileSync } from 'node:child_process';\n" +
    `const ok = readFileSync(${F}, 'utf8').includes('v = 1');\n` + extra +
    `const t = new Date('2020-01-01T00:00:00Z');\nutimesSync(${F}, t, t);\nprocess.exit(ok ? 0 : 1);\n`);
  sgit('add', '.');
  sgit('commit', '-q', '-m', 'init');
  execFileSync(process.execPath, ['touch.mjs'], { cwd: dir, env });
  assert.equal(sgit('status', '--porcelain'), '');
  return { dir, env, sgit };
}

const asRoot = typeof process.getuid === 'function' && process.getuid() === 0;
const python = ['python3', 'python'].find((p) => spawnSync(p, ['--version'], { encoding: 'utf8' }).status === 0);

export { HARNESS, BASH, repo, git, SOURCE, CHECK, harness, assertRestored, pastTimeRepo, asRoot, python };
