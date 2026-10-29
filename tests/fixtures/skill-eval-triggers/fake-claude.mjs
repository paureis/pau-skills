#!/usr/bin/env node
// A stand-in for the `claude` command, for the tests/skill-eval-triggers-*.test.mjs files, so no test calls a model.
//
// Every call writes <FAKE_TRIGGERS_LOG>/<time>-<pid>.json at start: { kind, argv, prompt, cwd, home, names, skills,
// files, links, homeList, rootList, at }, where names lists every environment variable that reached it, skills lists
// the project's .claude/skills, files every path below it, links the symbolic links among them, homeList lists HOME
// and rootList lists the folder two levels above the working folder (the run root). A run rewrites its record when it
// ends, adding end (the time) and cwdAtEnd (whether its working folder still exists).
// `auth status` prints { loggedIn } and exits 1 when HOME starts with FAKE_TRIGGERS_LOGGED_OUT.
//
// A run prints stream-json lines. The words of the prompt decide what the main agent does:
//   coin     starts tidy-notes on the first call with this prompt, nothing on the second, and so on
//   check    starts the built-in verify
//   look     reads a file first and starts nothing
//   helper   a subagent starts pack-boxes before anything else (the main agent then goes on as below)
//   plugin   the skill is started with a plugin prefix, as moving-kit:<name>
//   any other prompt starts the installed skill whose first word (tidy in tidy-notes) is a word of the prompt, or
//   answers with no tool when none is.
// The cost is FAKE_TRIGGERS_COST (default 0.05; "stop" spends the whole --max-budget-usd), or 0.01 when the prompt
// says cheaply. slowly waits 1500 ms before printing, pause 500 ms. sabotage removes the folder FAKE_TRIGGERS_BREAK
// names (a skill's source folder), so the next run's copy of it fails.
// FAKE_TRIGGERS_FAIL=1 exits 1 with no output; FAKE_TRIGGERS_EXIT1=1 prints the whole transcript and then exits 1;
// FAKE_TRIGGERS_DROP=<name> leaves that skill out of the init line's skills list. A run also writes answered.txt in its
// working folder, appends a line to each installed SKILL.md and to $HOME/.seen, none of which may reach the repository.
import { writeFileSync, readFileSync, appendFileSync, readdirSync, mkdirSync, existsSync, rmSync, lstatSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

const argv = process.argv.slice(2);
const env = process.env;
const cwd = process.cwd();
const kind = argv[0] === 'auth' ? 'auth' : 'call';
const list = (dir) => { try { return readdirSync(dir).sort(); } catch { return null; } };
const prompt = kind === 'call' ? argv[argv.indexOf('-p') + 1] : null;
const skillsDir = join(cwd, '.claude', 'skills');
const installed = list(skillsDir) || [];
const walk = (dir, out = []) => {
  for (const e of list(dir) || []) {
    const p = join(dir, e);
    out.push(p);
    if (lstatSync(p).isDirectory()) walk(p, out);
  }
  return out;
};
const below = walk(skillsDir);

let earlier = 0;
let logFile = null;
let record = null;
if (env.FAKE_TRIGGERS_LOG) {
  mkdirSync(env.FAKE_TRIGGERS_LOG, { recursive: true });
  for (const f of readdirSync(env.FAKE_TRIGGERS_LOG)) {
    try {
      const c = JSON.parse(readFileSync(join(env.FAKE_TRIGGERS_LOG, f), 'utf8'));
      if (c.kind === 'call' && c.prompt === prompt) earlier++;
    } catch { /* a log being written by a parallel call */ }
  }
  record = {
    kind, argv, prompt, cwd, home: env.HOME, names: Object.keys(env).sort(), skills: list(skillsDir),
    files: below.map((p) => relative(skillsDir, p)), links: below.filter((p) => lstatSync(p).isSymbolicLink()).map((p) => relative(skillsDir, p)),
    homeList: list(env.HOME), rootList: list(dirname(dirname(cwd))), at: Date.now(),
  };
  logFile = join(env.FAKE_TRIGGERS_LOG, `${Date.now()}-${process.pid}.json`);
  writeFileSync(logFile, JSON.stringify(record));
}

if (kind === 'auth') {
  const out = env.FAKE_TRIGGERS_LOGGED_OUT && String(env.HOME).startsWith(env.FAKE_TRIGGERS_LOGGED_OUT);
  process.stdout.write(JSON.stringify({ loggedIn: !out }));
  process.exit(out ? 1 : 0);
}
if (env.FAKE_TRIGGERS_FAIL === '1') {
  process.stderr.write('fake failure\n');
  process.exit(1);
}

const words = new Set(String(prompt).toLowerCase().split(/[^a-z0-9-]+/).filter(Boolean));
const has = (w) => words.has(w);
const use = (name, input, parent = null) => ({
  type: 'assistant', parent_tool_use_id: parent,
  message: { role: 'assistant', content: [{ type: 'tool_use', id: `toolu_${name}`, name, input }] },
});
if (has('sabotage') && env.FAKE_TRIGGERS_BREAK) rmSync(env.FAKE_TRIGGERS_BREAK, { recursive: true, force: true });

const lines = [];
if (has('helper')) lines.push(use('Skill', { skill: 'pack-boxes' }, 'toolu_agent'));
let skill = null;
let read = false;
if (has('coin')) skill = earlier % 2 === 0 ? 'tidy-notes' : null;
else if (has('check')) skill = 'verify';
else if (has('look')) read = true;
else skill = installed.find((s) => has(s.split('-')[0])) ?? null;
if (skill && has('plugin')) skill = `moving-kit:${skill}`;
if (skill) lines.push(use('Skill', { skill }));
else if (read) lines.push(use('Read', { file_path: join(cwd, 'notes.txt') }));
else lines.push({ type: 'assistant', parent_tool_use_id: null, message: { role: 'assistant', content: [{ type: 'text', text: 'Here you go.' }] } });

const offered = [...installed, 'verify', 'debug'].filter((s) => s !== env.FAKE_TRIGGERS_DROP);
const budget = Number(argv[argv.indexOf('--max-budget-usd') + 1]);
const cost = has('cheaply') ? 0.01 : env.FAKE_TRIGGERS_COST === 'stop' ? budget : Number(env.FAKE_TRIGGERS_COST || '0.05');
const tool = !!(skill || read);
const out = [
  { type: 'system', subtype: 'init', cwd, model: 'fake-model', skills: offered, slash_commands: offered, plugins: [], mcp_servers: [] },
  ...lines,
  { type: 'result', subtype: tool ? 'error_max_turns' : 'success', is_error: tool, num_turns: 1, total_cost_usd: cost, result: tool ? '' : 'Here you go.' },
];

writeFileSync(join(cwd, 'answered.txt'), 'answered\n');
for (const s of installed) appendFileSync(join(skillsDir, s, 'SKILL.md'), '\nINSTALLED COPY\n');
appendFileSync(join(env.HOME, '.seen'), 'seen\n');

setTimeout(() => {
  if (logFile) writeFileSync(logFile, JSON.stringify({ ...record, end: Date.now(), cwdAtEnd: existsSync(cwd) }));
  process.stdout.write(out.map((o) => JSON.stringify(o)).join('\n') + '\n');
  if (env.FAKE_TRIGGERS_EXIT1 === '1') process.exitCode = 1;
}, has('slowly') ? 1500 : has('pause') ? 500 : 0);
