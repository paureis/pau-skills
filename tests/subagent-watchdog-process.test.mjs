// subagent-watchdog run as a process: stdin, the config and its switches, and the state files under the system temp
// folder. Every run gets an empty HOME, USERPROFILE and PAU_SKILLS_HOME, its own TMPDIR, TMP and TEMP, and its own
// project folder, so no test touches the real ~/.claude or the real temp folder.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync, utimesSync, symlinkSync, chmodSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { serializeAgent } from '../hooks/agent-orchestration/subagent-watchdog-logic.mjs';
import { agentEntry, MIN } from './subagent-watchdog.helpers.mjs';

const HOOK = repo('hooks', 'agent-orchestration', 'subagent-watchdog.mjs');
const WIN = process.platform === 'win32';
const SID = 'sess-1';
const DAY = 24 * 60 * MIN;

function world() {
  const home = tempDir(); const tmp = tempDir(); const project = tempDir();
  const env = { HOME: home, USERPROFILE: home, PAU_SKILLS_HOME: home, TMPDIR: tmp, TMP: tmp, TEMP: tmp, CLAUDE_PROJECT_DIR: project, PAU_SKILLS_DISABLE: '' };
  const w = { home, tmp, project, env, base: join(tmp, 'pau-skills-watchdog') };
  w.run = (input, extra = {}) => runNode(HOOK, { input: typeof input === 'string' ? input : JSON.stringify(input), env: { ...env, ...extra } });
  w.dir = (sid = SID) => join(w.base, sid);
  w.file = (id = 'agent-1', sid = SID) => join(w.dir(sid), id + '.json');
  w.read = (id, sid) => JSON.parse(readFileSync(w.file(id, sid), 'utf8'));
  w.prep = () => { mkdirSync(w.base, { mode: 0o700 }); mkdirSync(w.dir(), { mode: 0o700 }); };
  w.ev = (event, extra = {}) => ({ session_id: SID, hook_event_name: event, agent_id: 'agent-1', agent_type: 'builder', cwd: project, ...extra });
  w.bash = (command, extra) => w.run(w.ev('PreToolUse', { tool_name: 'Bash', tool_input: { command } }), extra);
  return w;
}
const kindOf = (r) => { if (!r.stdout) return '-'; return JSON.parse(r.stdout).hookSpecificOutput.permissionDecision === 'ask' ? 'ask' : 'note'; };
const silent = (r, why) => assert.deepEqual([r.code, r.stdout, r.stderr], [0, '', ''], why);
const kinds = (w, n, cmd = 'npm test', extra) => Array.from({ length: n }, () => kindOf(w.bash(cmd, extra)));
const writeConfig = (dir, value) => { mkdirSync(join(dir, '.claude'), { recursive: true }); writeFileSync(join(dir, '.claude', 'pau-skills.json'), JSON.stringify(value)); };
const age = (p, ms) => { const t = (Date.now() - ms) / 1000; utimesSync(p, t, t); };
const tmps = (dir) => readdirSync(dir, { recursive: true }).filter((f) => String(f).endsWith('.tmp'));

test('P1 not JSON, empty, null, an array and a Stop event are silent with exit 0, nothing on stderr, and the temp folder stays empty; so are a TMPDIR that is a file and a state path that is a folder', () => {
  const w = world();
  for (const input of ['not json', '', 'null', '[]', '{"session_id": "sess-1"}', JSON.stringify({ session_id: SID, hook_event_name: 'Stop', cwd: w.project })]) {
    silent(w.run(input), input);
  }
  assert.deepEqual(readdirSync(w.tmp), []);
  const f = join(tempDir(), 'file');
  writeFileSync(f, 'x');
  silent(w.bash('npm test', { TMPDIR: f, TMP: f, TEMP: f }), 'TMPDIR is a file');
  w.prep();
  mkdirSync(w.file());
  silent(w.bash('npm test'), 'the state path is a folder');
  assert.deepEqual(tmps(w.dir()), []);
});

test('P2 five identical Bash runs in one subagent give a note on run 3 and an ask on run 5, kept in <TMPDIR>/pau-skills-watchdog/<session_id>/<agent_id>.json', () => {
  const w = world();
  assert.deepEqual(kinds(w, 5), ['-', '-', 'note', '-', 'ask']);
  assert.equal(w.read().calls, 5);
  assert.deepEqual(readdirSync(w.base), [SID]);
  assert.deepEqual(readdirSync(w.dir()), ['agent-1.json']);
});

test('P3 after two runs, an Edit\'s PostToolUse in the project resets the count: the next two runs give nothing and the third gives the note', () => {
  const w = world();
  kinds(w, 2);
  const edit = { tool_name: 'Edit', tool_input: { file_path: join(w.project, 'src', 'a.js'), old_string: 'a', new_string: 'b' } };
  silent(w.run(w.ev('PreToolUse', edit)));
  silent(w.run(w.ev('PostToolUse', edit)));
  assert.equal(w.read().sinceEdit, 0);
  assert.deepEqual(kinds(w, 3), ['-', '-', 'note']);
});

test('P4 a main-session PreToolUse with a stuck agent in the state file gets the status and moves shownAt; a second one right after gets nothing', () => {
  const w = world();
  w.prep();
  const now = Date.now();
  writeFileSync(w.file(), serializeAgent(agentEntry({ start: now - 20 * MIN, last: now - 11 * MIN, calls: 4 })), { mode: 0o600 });
  const input = { session_id: SID, hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: {}, cwd: w.project };
  const r = w.run(input);
  assert.deepEqual([r.code, r.stderr], [0, '']);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse');
  assert.match(out.additionalContext, /builder agent-1: 20 minutes, 4 tool calls.*looks stuck: no tool call for 11 minutes/);
  const shown = Number(readFileSync(join(w.dir(), 'shown'), 'utf8'));
  assert.ok(shown >= now && shown <= Date.now(), String(shown));
  silent(w.run(input), 'right after');
});

test('P5 SubagentStop removes the agent\'s file and prints nothing; so does a main-session PostToolUse for TaskStop', () => {
  const w = world();
  silent(w.run(w.ev('SubagentStart')));
  silent(w.run(w.ev('SubagentStart', { agent_id: 'agent-2' })));
  assert.ok(existsSync(w.file()) && existsSync(w.file('agent-2')));
  silent(w.run(w.ev('SubagentStop')));
  assert.equal(existsSync(w.file()), false);
  silent(w.run({ session_id: SID, hook_event_name: 'PostToolUse', tool_name: 'TaskStop', tool_input: { task_id: 'agent-2' }, cwd: w.project }));
  assert.equal(existsSync(w.file('agent-2')), false);
  silent(w.run(w.ev('SubagentStop')), 'a stop for a missing file');
});

test('P6 a session_id or agent_id that is not a valid id is silent and writes nothing anywhere; 128 characters are accepted', () => {
  const w = world();
  const pre = w.ev('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls' } });
  for (const session_id of ['../x', 'a/b', '', 5, 's'.repeat(129), null]) {
    silent(w.run({ ...w.ev('SubagentStart'), session_id }), String(session_id));
    silent(w.run({ ...pre, session_id }), String(session_id));
  }
  for (const agent_id of ['../x', 'a/b', '', 's'.repeat(129)]) silent(w.run({ ...pre, agent_id }), String(agent_id));
  assert.deepEqual([readdirSync(w.tmp), readdirSync(w.home), readdirSync(w.project)], [[], [], []]);
  const sid = 's'.repeat(128); const id = 'a'.repeat(128);
  silent(w.run(w.ev('SubagentStart', { session_id: sid, agent_id: id })));
  assert.equal(w.read(id, sid).type, 'builder');
});

test('P7 SubagentStart prunes old session folders and old .json, .tmp and shown files of its own session, and keeps newer ones, other files, links and its own file', () => {
  const w = world();
  w.prep();
  const mk = (rel, ms) => { const p = join(w.base, rel); writeFileSync(p, 'x'); age(p, ms); return p; };
  const dir = (name) => { mkdirSync(join(w.base, name), { mode: 0o700 }); return name; };
  for (const f of ['old.json', 'old.json.1.ab.tmp', 'shown']) mk(join(SID, f), 2 * DAY);
  for (const f of ['new.json', 'new.tmp']) mk(join(SID, f), DAY - 10 * MIN);
  mk(join(SID, 'notes.txt'), 2 * DAY);
  dir('gone'); mk(join('gone', 'a.json'), 2 * DAY); mk(join('gone', 'b.txt'), 3 * DAY);
  dir('fresh'); mk(join('fresh', 'a.json'), 2 * DAY); mk(join('fresh', 'b.json'), MIN);
  dir('mixed'); mk(join('mixed', 'a.json'), 2 * DAY); mkdirSync(join(w.base, 'mixed', 'sub'));
  mk('stray.json', 2 * DAY);
  const target = tempDir();
  if (!WIN) {
    // Only an old file in the target: a prune that followed the link would delete it.
    writeFileSync(join(target, 'a.json'), 'x'); age(join(target, 'a.json'), 2 * DAY);
    symlinkSync(target, join(w.base, 'linked'));
  }
  silent(w.run(w.ev('SubagentStart')));
  assert.deepEqual(readdirSync(w.dir()).sort(), ['agent-1.json', 'new.json', 'new.tmp', 'notes.txt']);
  assert.deepEqual(readdirSync(w.base).sort(), ['fresh', 'mixed', SID, 'stray.json', ...(WIN ? [] : ['linked'])].sort());
  assert.deepEqual(readdirSync(join(w.base, 'fresh')).sort(), ['a.json', 'b.json']);
  assert.deepEqual(readdirSync(join(w.base, 'mixed')).sort(), ['a.json', 'sub']);
  if (!WIN) assert.deepEqual(readdirSync(target), ['a.json']);
});

test('P8 turned off in the project file, in the user file, or with PAU_SKILLS_DISABLE, it is silent and writes no state', () => {
  const off = { hooks: { 'subagent-watchdog': false } };
  const cases = [
    ['project file', (w) => writeConfig(w.project, off), {}],
    ['user file', (w) => writeConfig(w.home, off), {}],
    ['PAU_SKILLS_DISABLE', () => {}, { PAU_SKILLS_DISABLE: 'subagent-watchdog' }],
    ['PAU_SKILLS_DISABLE=all', () => {}, { PAU_SKILLS_DISABLE: 'all' }],
  ];
  for (const [name, setup, extra] of cases) {
    const w = world();
    setup(w);
    assert.deepEqual(kinds(w, 5, 'npm test', extra), Array(5).fill('-'), name);
    assert.deepEqual(readdirSync(w.tmp), [], name);
  }
  assert.deepEqual(kinds(world(), 3), ['-', '-', 'note'], 'control');
});

test('P9 repeatAsk 2 in the project file asks on the 2nd run', () => {
  const w = world();
  writeConfig(w.project, { 'subagent-watchdog': { repeatAsk: 2 } });
  assert.deepEqual(kinds(w, 2), ['-', 'ask']);
});

test('P10 with TMPDIR a link to another folder: the state is found again, and an edit named by its real path or by its link path inside the project resets the counts', { skip: WIN }, () => {
  const w = world();
  const real = tempDir(); const link = join(tempDir(), 'tmp-link'); symlinkSync(real, link);
  const proj = tempDir(); const projLink = join(tempDir(), 'proj-link'); symlinkSync(proj, projLink);
  const env = { TMPDIR: link, TMP: link, TEMP: link, CLAUDE_PROJECT_DIR: projLink };
  const ev = (event, extra) => w.ev(event, { cwd: projLink, ...extra });
  const runs = (n) => Array.from({ length: n }, () => kindOf(w.run(ev('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' } }), env)));
  assert.deepEqual(runs(3), ['-', '-', 'note']);
  assert.ok(existsSync(join(real, 'pau-skills-watchdog', SID, 'agent-1.json')));
  for (const file of [join(proj, 'a.js'), join(projLink, 'b.js')]) {
    const edit = { tool_name: 'Write', tool_input: { file_path: file, content: 'x' } };
    silent(w.run(ev('PreToolUse', edit), env));
    silent(w.run(ev('PostToolUse', edit), env));
    assert.deepEqual(runs(3), ['-', '-', 'note'], file);
  }
});

test('P11 a state file that is not JSON is replaced; the folder is 0700 and the file 0600; no .tmp file is left; HOME, USERPROFILE and PAU_SKILLS_HOME stay empty', () => {
  const w = world();
  silent(w.bash('npm test'));
  writeFileSync(w.file(), 'not json');
  silent(w.bash('npm test'));
  assert.equal(w.read().calls, 1);
  if (!WIN) {
    assert.equal(statSync(w.base).mode & 0o777, 0o700);
    assert.equal(statSync(w.dir()).mode & 0o777, 0o700);
    assert.equal(statSync(w.file()).mode & 0o777, 0o600);
  }
  assert.deepEqual(tmps(w.base), []);
  assert.deepEqual(readdirSync(w.home), []);
});

test('P12 the base folder or the session folder is a link to another folder, or is group writable: silent, writes nothing, and deletes nothing in the link\'s target', { skip: WIN }, () => {
  const start = (w) => w.ev('SubagentStart');
  const pre = (w) => w.ev('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' } });
  const seed = (dir) => { mkdirSync(join(dir, 'old'), { mode: 0o700 }); writeFileSync(join(dir, 'old', 'a.json'), 'x'); age(join(dir, 'old', 'a.json'), 2 * DAY); };
  const setups = {
    'base is a link': (w, target) => { seed(target); symlinkSync(target, w.base); },
    'session is a link': (w, target) => { mkdirSync(w.base, { mode: 0o700 }); seed(target); symlinkSync(target, w.dir()); },
    'base is group writable': (w) => { mkdirSync(w.base, { mode: 0o700 }); chmodSync(w.base, 0o770); },
    'session is group writable': (w) => { w.prep(); chmodSync(w.dir(), 0o770); },
  };
  for (const [name, setup] of Object.entries(setups)) {
    const w = world();
    const target = tempDir();
    setup(w, target);
    const before = readdirSync(target, { recursive: true }).sort();
    for (const input of [start(w), pre(w), pre(w), pre(w)]) silent(w.run(input), name);
    assert.deepEqual(readdirSync(target, { recursive: true }).sort(), before, name);
    if (!name.startsWith('session is a link')) assert.equal(existsSync(w.file()), false, name);
  }
});
