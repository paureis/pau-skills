// Shared helpers for the wizard tests (skills/session-discipline/wizard/wizard.mjs). Standard library only.
import { spawn } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, relative } from 'node:path';
import { repo, tempDir } from './helpers.mjs';

export const WIZARD = repo('skills', 'session-discipline', 'wizard', 'wizard.mjs');

// The child's environment: no proxy between it and 127.0.0.1, whatever this machine sets. A key set to undefined in
// `extra` is removed.
export function childEnv(extra = {}) {
  const env = { ...process.env, NO_PROXY: '127.0.0.1,localhost', no_proxy: '127.0.0.1,localhost', ...extra };
  delete env.NODE_USE_ENV_PROXY;
  for (const [k, v] of Object.entries(extra)) if (v === undefined) delete env[k];
  return env;
}

// Runs the wizard without blocking this process, so a server here can answer its url checks. stdin and stdout are
// pipes, never a terminal. A wizard still running after `killAfterMs` is killed, and the result has `killed: true`.
export function wizard(args, { cwd, env = {}, input = '', killAfterMs = 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const child = spawn(process.execPath, [WIZARD, ...args], { cwd, env: childEnv(env) });
    let stdout = '';
    let stderr = '';
    let killed = false;
    const timer = setTimeout(() => { killed = true; child.kill('SIGKILL'); }, killAfterMs);
    child.stdout.setEncoding('utf8').on('data', (d) => { stdout += d; });
    child.stderr.setEncoding('utf8').on('data', (d) => { stderr += d; });
    child.on('error', reject);
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, stdout, stderr, out: stdout + stderr, killed, ms: Date.now() - started });
    });
    child.stdin.on('error', () => {}); // the wizard may stop before it reads all the input
    child.stdin.end(input);
  });
}

// A fixture folder holding `files` (name to text) and, unless steps is undefined, steps.json.
export function fixture(steps, files = {}) {
  const dir = tempDir('wizard-');
  for (const [name, text] of Object.entries(files)) {
    mkdirSync(dirname(join(dir, name)), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  if (steps !== undefined) writeFileSync(join(dir, 'steps.json'), typeof steps === 'string' ? steps : JSON.stringify(steps, null, 2));
  return dir;
}

export const steps = (list, title = 'Test setup') => ({ title, steps: list });
export const step = (id, checks, more = {}) => ({ id, title: `Title ${id}`, checks, ...more });

// A command check that exits with `code`.
export const exits = (code) => ({ command: [process.execPath, '-e', `process.exit(${code})`] });

// A command check that fails the first time it runs in the folder (when run starts) and passes from then on. It
// counts its runs in a file named `counter`.
export const passesLater = (counter) => ({
  command: [process.execPath, '-e',
    `const fs = require('fs'); const n = fs.existsSync('${counter}') ? 1 : 0; fs.writeFileSync('${counter}', 'x'); process.exit(n ? 0 : 1);`],
});

// A server on 127.0.0.1: /ok answers 200 and any other path 404, both with `body`. `hits` counts the requests.
export async function server(body = 'hello') {
  const state = { hits: 0 };
  const s = createServer((req, res) => {
    state.hits += 1;
    res.statusCode = req.url === '/ok' ? 200 : 404;
    res.end(body);
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return {
    state,
    url: (path) => `http://127.0.0.1:${s.address().port}${path}`,
    close: () => new Promise((r) => { s.closeAllConnections?.(); s.close(() => r()); }),
  };
}

// Every file under dir as "name\ncontent", sorted, joined into one string.
export function listing(dir) {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.isDirectory()) { out.push(`${relative(dir, p)}/`); walk(p); }
      else out.push(`${relative(dir, p)}\n${readFileSync(p, 'utf8')}`);
    }
  };
  walk(dir);
  return out.sort().join('\n\0\n');
}
