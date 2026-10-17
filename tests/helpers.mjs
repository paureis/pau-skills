// Shared helpers for the tests. Standard library only.
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const repo = (...p) => join(ROOT, ...p);

// Every folder made by tempDir (or passed to removeAtExit) is deleted when the test process exits, so a full
// `npm test` leaves nothing behind in the system temp folder.
const made = [];
process.on('exit', () => {
  for (const p of made) {
    try { rmSync(p, { recursive: true, force: true, maxRetries: 3 }); } catch { /* a leftover is not a test failure */ }
  }
});
export const removeAtExit = (p) => { made.push(p); return p; };
export const tempDir = (prefix = 'pau-skills-') => removeAtExit(mkdtempSync(join(tmpdir(), prefix)));

/** Run a node script with stdin input; returns { code, stdout, stderr }. */
export function runNode(script, { input = '', args = [], env = {}, cwd } = {}) {
  const r = spawnSync(process.execPath, [script, ...args], { input, encoding: 'utf8', cwd, env: { ...process.env, ...env } });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** A bash that runs POSIX scripts: Git Bash on Windows (not the WSL launcher in System32), plain bash elsewhere. */
export function findBash() {
  if (process.env.TEST_BASH) return process.env.TEST_BASH;
  if (process.platform !== 'win32') return 'bash';
  const exec = execFileSync('git', ['--exec-path'], { encoding: 'utf8' }).trim(); // .../mingw64/libexec/git-core
  for (const c of [join(exec, '..', '..', '..', 'bin', 'bash.exe'), join(exec, '..', '..', '..', 'usr', 'bin', 'bash.exe')]) {
    if (existsSync(c)) return c;
  }
  return 'bash';
}
