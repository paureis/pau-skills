// subagent-watchdog under parallel writers, and its write path through an injected io object: one state file per
// agent, written through a temp file and a rename, so no agent's write can undo another's and a reader always sees a
// whole file. Also times every regular expression and the edit test on long input that does not match.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repo, tempDir } from './helpers.mjs';
import { PATTERNS } from '../hooks/agent-orchestration/subagent-watchdog-logic.mjs';
import { update, paths } from '../hooks/agent-orchestration/subagent-watchdog.mjs';

const HOOK = repo('hooks', 'agent-orchestration', 'subagent-watchdog.mjs');
const LOGIC = repo('hooks', 'agent-orchestration', 'subagent-watchdog-logic.mjs');
const SID = 'sess-c';

function world() {
  const home = tempDir(); const tmp = tempDir(); const project = tempDir();
  const env = { HOME: home, USERPROFILE: home, PAU_SKILLS_HOME: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp, CLAUDE_PROJECT_DIR: project, PAU_SKILLS_DISABLE: '' };
  return { home, tmp, project, env, p: paths(SID, tmp) };
}
const pre = (w, id, command = 'npm test') => ({ session_id: SID, hook_event_name: 'PreToolUse', agent_id: id, agent_type: 'builder', cwd: w.project, tool_name: 'Bash', tool_input: { command } });

function runAsync(w, input) {
  return new Promise((resolve) => {
    const c = spawn(process.execPath, [HOOK], { env: { ...process.env, ...w.env } });
    let stdout = ''; let stderr = '';
    c.stdout.on('data', (d) => (stdout += d));
    c.stderr.on('data', (d) => (stderr += d));
    c.on('close', (code) => resolve({ code, stdout, stderr }));
    c.stdin.end(JSON.stringify(input));
  });
}

/** Run chains of events in parallel while a reader parses every state file; returns the runs and the read counts. */
async function race(w, chains) {
  let running = true; let reads = 0; let bad = 0;
  const reader = (async () => {
    while (running) {
      let names = [];
      try { names = fs.readdirSync(w.p.dir).filter((f) => f.endsWith('.json')); } catch { /* not made yet */ }
      for (const f of names) {
        let body;
        try { body = fs.readFileSync(join(w.p.dir, f), 'utf8'); } catch { continue; }
        reads++;
        try { JSON.parse(body); } catch { bad++; }
      }
      await new Promise((r) => setImmediate(r));
    }
  })();
  const results = await Promise.all(chains.map(async (inputs) => { const out = []; for (const i of inputs) out.push(await runAsync(w, i)); return out; }));
  running = false;
  await reader;
  return { runs: results.flat(), reads, bad };
}
const tmps = (dir) => fs.readdirSync(dir).filter((f) => f.endsWith('.tmp'));

test('C1 8 processes in parallel, each its own agent in one session, 25 Bash PreToolUse events each: all exit 0 silently on stderr, every read parses, no .tmp is left, and each agent counts exactly 25', async () => {
  const w = world();
  const ids = Array.from({ length: 8 }, (_, i) => `agent-${i}`);
  const { runs, reads, bad } = await race(w, ids.map((id) => Array.from({ length: 25 }, (_, k) => pre(w, id, `step ${k}`))));
  assert.equal(runs.length, 200);
  for (const r of runs) assert.deepEqual([r.code, r.stderr], [0, '']);
  assert.ok(reads > 0);
  assert.equal(bad, 0);
  assert.deepEqual(tmps(w.p.dir), []);
  for (const id of ids) assert.equal(JSON.parse(fs.readFileSync(w.p.agent(id), 'utf8')).calls, 25, id);
});

test('C2 one agent, 4 processes in parallel with 25 PreToolUse events each: all exit 0, the file always parses, and calls is between 25 and 100', async (t) => {
  const w = world();
  const { runs, bad } = await race(w, Array.from({ length: 4 }, (_, c) => Array.from({ length: 25 }, (_, k) => pre(w, 'agent-1', `c${c} ${k}`))));
  for (const r of runs) assert.deepEqual([r.code, r.stderr], [0, '']);
  assert.equal(bad, 0);
  assert.deepEqual(tmps(w.p.dir), []);
  const calls = JSON.parse(fs.readFileSync(w.p.agent('agent-1'), 'utf8')).calls;
  assert.ok(calls >= 25 && calls <= 100, String(calls));
  t.diagnostic(`one agent, 4 parallel writers: ${100 - calls} of 100 counts lost`);
});

/** fs with every call recorded as [name, ...string arguments]. */
function recorder() {
  const calls = [];
  const io = new Proxy(fs, {
    get(target, name) {
      const v = target[name];
      if (typeof v !== 'function') return v;
      return (...args) => { calls.push([name, ...args.filter((a) => typeof a === 'string'), ...args.filter((a) => a && typeof a === 'object' && !Buffer.isBuffer(a))]); return v.apply(target, args); };
    },
  });
  return { io, calls };
}
const WRITERS = ['writeFileSync', 'appendFileSync', 'openSync', 'copyFileSync', 'cpSync', 'createWriteStream', 'truncateSync', 'writeSync'];

test('C3 a write goes to a temp file in the session folder with flag wx and mode 0600 and is renamed over the agent\'s file, which is never opened for writing', () => {
  const w = world();
  const { io, calls } = recorder();
  for (let i = 0; i < 3; i++) update(pre(w, 'agent-1'), { env: w.env, io, tmp: w.tmp });
  const file = w.p.agent('agent-1');
  const writes = calls.filter(([n]) => WRITERS.includes(n));
  const renames = calls.filter(([n]) => n === 'renameSync');
  assert.equal(writes.length, 3);
  assert.equal(renames.length, 3);
  writes.forEach(([name, tmpFile, , opts], i) => {
    assert.equal(name, 'writeFileSync');
    assert.ok(tmpFile.startsWith(file + '.' + process.pid + '.') && /\.[0-9a-f]{8}\.tmp$/.test(tmpFile), tmpFile);
    assert.deepEqual(opts, { flag: 'wx', mode: 0o600 });
    assert.deepEqual(renames[i].slice(1), [tmpFile, file]);
  });
  assert.ok(!calls.some(([n, a]) => WRITERS.includes(n) && a === file), 'the state file was opened for writing');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).calls, 3);
  assert.deepEqual(tmps(w.p.dir), []);
});

test('C4 SubagentStop and a TaskStop unlink the agent\'s file; a stop for a missing file is silent; neither writes', () => {
  const w = world();
  const env = { env: w.env, tmp: w.tmp };
  update(pre(w, 'agent-1'), env);
  update(pre(w, 'agent-2'), env);
  const stops = [
    ['agent-1', { session_id: SID, hook_event_name: 'SubagentStop', agent_id: 'agent-1', cwd: w.project }],
    ['agent-2', { session_id: SID, hook_event_name: 'PostToolUse', tool_name: 'TaskStop', tool_input: { task_id: 'agent-2' }, cwd: w.project }],
  ];
  for (const [id, input] of stops) {
    for (const round of ['present', 'missing']) {
      const { io, calls } = recorder();
      assert.equal(fs.existsSync(w.p.agent(id)), round === 'present');
      assert.equal(update(input, { ...env, io }), null);
      assert.equal(fs.existsSync(w.p.agent(id)), false, `${id} ${round}`);
      assert.deepEqual(calls.filter(([n]) => WRITERS.includes(n) || n === 'renameSync' || n === 'mkdirSync'), [], `${id} ${round}`);
      assert.deepEqual(calls.filter(([n]) => n === 'unlinkSync').map(([, f]) => f), [w.p.agent(id)], `${id} ${round}`);
    }
  }
});

// The child measures one case: the input on stdin, the case and the project as arguments.
const CHILD = `
import { readFileSync } from 'node:fs';
const [, logic, hook, which, project] = process.argv;
const m = await import(logic);
const h = await import(hook);
const text = readFileSync(0, 'utf8');
const t = process.hrtime.bigint();
if (which === 'session') h.SESSION_ID.test(text);
else if (which.startsWith('pattern:')) m.PATTERNS[which.slice(8)].test(text);
else if (which === 'normalize') m.normalizeCommand(text);
else if (which === 'bash') m.isEdit({ tool_name: 'Bash', tool_input: { command: text }, cwd: project }, { project, cwd: project });
else if (which === 'path') m.isEdit({ tool_name: 'Edit', tool_input: { file_path: text }, cwd: project }, { project, cwd: project });
process.stdout.write(String(Number(process.hrtime.bigint() - t) / 1e6));
`;

test('C5 timing: every pattern, the session-id pattern, normalizeCommand and isEdit on 100,000 and 300,000 characters that do not match, in a child process killed at 20 s', () => {
  const project = tempDir();
  const cases = [];
  for (const n of [100000, 300000]) {
    for (const which of [...Object.keys(PATTERNS).map((k) => 'pattern:' + k), 'session']) {
      cases.push([which, 'a'.repeat(n) + '!', 250], [which, 'h' + 'a'.repeat(n) + '!', 250]);
    }
    cases.push(['normalize', 'a'.repeat(n), 250], ['normalize', ' \t'.repeat(n / 2), 250]);
    cases.push(['bash', 'a;'.repeat(n / 2), 1000], ['bash', '$('.repeat(n / 2), 1000], ['bash', 'bash -c "' + 'a;'.repeat(n / 2) + '"', 1000]);
    cases.push(['path', '/a'.repeat(n / 2), 1000]);
  }
  assert.ok(Object.keys(PATTERNS).length >= 2);
  const args = [pathToFileURL(LOGIC).href, pathToFileURL(HOOK).href];
  for (const [which, input, budget] of cases) {
    const label = `${which} on ${input.length} characters starting ${JSON.stringify(input.slice(0, 4))}`;
    const r = spawnSync(process.execPath, ['--input-type=module', '-e', CHILD, ...args, which, project], { input, encoding: 'utf8', timeout: 20000 });
    assert.equal(r.status, 0, `${label}: ${r.signal || r.stderr}`);
    const ms = Number(r.stdout);
    assert.ok(ms < budget, `${label}: ${ms} ms, over ${budget}`);
  }
});
