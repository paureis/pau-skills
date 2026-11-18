// Setup shared by the review-scope test files: a git repository with a base commit and a reviewed feature commit, and
// a runner for the CLI that is killed after a timeout, so a hang fails one test instead of the whole suite.
// The git helpers are copies of the ones in tests/review-scope.test.mjs.
import { execFileSync, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { repo, tempDir } from './helpers.mjs';
import { BUDGET_ENV } from '../skills/verification/review-triage/review-scope.mjs';

export const SCRIPT = repo('skills', 'verification', 'review-triage', 'review-scope.mjs');

export const g = (dir, ...args) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
export const put = (dir, path, text) => { mkdirSync(dirname(join(dir, path)), { recursive: true }); writeFileSync(join(dir, path), text); };
export const commit = (dir, msg) => { g(dir, 'add', '-A'); g(dir, '-c', 'user.name=t', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', msg); return g(dir, 'rev-parse', 'HEAD'); };

/** Run the CLI on `dir` in a child process killed after `timeout` ms. `error` is set when it was killed. */
export function run(dir, args, { env = {}, timeout = 10000 } = {}) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args, '--repo', dir], {
    encoding: 'utf8', timeout, env: { ...process.env, [BUDGET_ENV]: '', ...env },
  });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr, error: r.error };
}

/** A repository on branch `feature`: the base commit on `main` holds `rules` as .claude/review-rules.json, and the
 * reviewed commit changes src/msg.py and adds tests/test_msg.py. */
export function setup(rules = { riskyPaths: ['core/**'] }) {
  const dir = tempDir('review-scope-');
  g(dir, 'init', '-q', '-b', 'main');
  put(dir, 'core/pick.py', 'def pick():\n    return 1\n');
  put(dir, 'src/msg.py', 'MSG = "ok"\n');
  put(dir, '.claude/review-rules.json', JSON.stringify(rules));
  commit(dir, 'base');
  g(dir, 'switch', '-q', '-c', 'feature');
  put(dir, 'src/msg.py', 'MSG = "done"\n');
  put(dir, 'tests/test_msg.py', 'def test_msg():\n    assert True\n');
  const reviewed = commit(dir, 'feature');
  return { dir, reviewed };
}
