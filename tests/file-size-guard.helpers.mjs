// Shared setup for the file-size-guard tests: temporary projects, git with a clean environment, and two runners (the
// pure decide() with spies, and the hook script as Claude Code starts it).
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { decide, runGit, readText } from '../hooks/guards/file-size-guard.mjs';

export const GUARD = repo('hooks', 'guards', 'file-size-guard.mjs');
export const LIMIT_BYTES = 20000; // 5,000 tokens at 4 bytes a token

// Git variables that point git at another repository are cleared for every call, so a test can never act on the
// repository that runs it.
const GIT_ENV = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'];
export const cleanEnv = (extra = {}) => ({ ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !GIT_ENV.includes(k))), ...extra });
export const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() }).trim();

/** A repository with a local identity that commits unsigned. */
export function makeRepo(dir = tempDir('fsg-')) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  return dir;
}

/** A folder that is not in any repository: git stops looking at its parent. */
export function plainDir() {
  const dir = tempDir('fsg-plain-');
  return { dir, env: { GIT_CEILING_DIRECTORIES: dirname(realpathSync(dir)) } };
}

/** Write a file, making its folders. */
export function put(root, rel, text) {
  mkdirSync(dirname(join(root, rel)), { recursive: true });
  writeFileSync(join(root, rel), text);
  return join(root, rel);
}

export const write = (root, rel, content) => ({ tool_name: 'Write', tool_input: { file_path: join(root, rel), content } });
export const edit = (root, rel, old_string, new_string, replace_all) =>
  ({ tool_name: 'Edit', tool_input: { file_path: join(root, rel), old_string, new_string, ...(replace_all === undefined ? {} : { replace_all }) } });
export const multi = (root, rel, edits) => ({ tool_name: 'MultiEdit', tool_input: { file_path: join(root, rel), edits } });

/** decide() with a git spy that answers "no repository" and counts calls, and a reader that counts reads. */
export function check(input, root, options = {}) {
  const calls = { git: [], reads: 0 };
  const gitSpy = (args, cwd) => { calls.git.push({ args, cwd }); return { status: 128, stdout: '' }; };
  const reason = decide(input, { root, options, git: gitSpy, readFile: countingReader(calls) });
  return { reason, calls };
}

/** decide() with real git, in a project that is its own repository or with the given environment. */
export function checkGit(input, root, env = {}) {
  return decide(input, { root, git: (args, cwd) => runGit(args, cwd, cleanEnv(env)) });
}

const countingReader = (calls) => (p) => { calls.reads++; return readText(p); };

/** Run the hook script as Claude Code does, isolated from the user's own config. */
export function hook(project, input, env = {}) {
  return runNode(GUARD, {
    input: typeof input === 'string' ? input : JSON.stringify(input),
    env: { PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: project, PAU_SKILLS_DISABLE: '', ...env },
  });
}
