#!/usr/bin/env node
// A stand-in for the `claude` command, for the skills-bench runner tests, so no model is ever called.
//
// `--version` prints one plain line. `auth status` prints { loggedIn: true } (false, exit 1, when FAKE_BENCH_LOGGED_OUT
// is 1), as tests/fixtures/skill-eval/fake-claude.mjs does. A call with `--tools ""` is the judge: it scores every
// "# Output <letter>" it reads on standard input on every rubric criterion, by the token the worker left in that
// output (kiwi 5, plum 2, fig 1, lime 3, else 3), and its reply also holds an email and the value of FAKE_BENCH_ECHO.
// Any other call is a worker: it learns its variant from the "fake-variant: <name>" line of the installed
// .claude/skills/<name>/SKILL.md (no skill installed is "without"), writes made.txt with its variant's token, and
// prints stream-json lines: with a skill other than empty it starts the skill, writes a test file and runs a failing
// command before the source edit; without, it edits the source first.
//
// Settings reach it only through --pass-env: FAKE_BENCH_CONFIG names a JSON file
//   { "runs": { "<slug>/<variant>": { "cost": 0.3, "fail": true } }, "defaultCost": 0.05, "judge": { "cost": 0.02 } }
// where "*" stands for any slug or variant, "fail" exits 1 with no result line and a "cost" of null prints none.
// FAKE_BENCH_LOG names a folder where every call writes { kind, argv, cwd, names, variant } (names, never values).
import { writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join, basename } from 'node:path';
import { randomBytes } from 'node:crypto';

const argv = process.argv.slice(2);
const cwd = process.cwd();
const env = process.env;
const cfg = env.FAKE_BENCH_CONFIG ? JSON.parse(readFileSync(env.FAKE_BENCH_CONFIG, 'utf8')) : {};
const TOKENS = { with: 'kiwi', without: 'plum', broken: 'fig', empty: 'lime' };
const SCORES = { kiwi: 5, plum: 2, fig: 1, lime: 3 };

const toolsAt = argv.indexOf('--tools');
const kind = argv[0] === '--version' ? 'version' : argv[0] === 'auth' ? 'auth' : toolsAt >= 0 && argv[toolsAt + 1] === '' ? 'judge' : 'worker';
const skillsDir = join(cwd, '.claude', 'skills');
const skill = kind === 'worker' && existsSync(skillsDir) ? readdirSync(skillsDir)[0] : null;
const md = skill ? readFileSync(join(skillsDir, skill, 'SKILL.md'), 'utf8') : '';
const variant = skill ? (/^fake-variant:\s*(\S+)/m.exec(md)?.[1] ?? 'unknown') : 'without';
const stdin = kind === 'judge' ? readFileSync(0, 'utf8') : '';

if (env.FAKE_BENCH_LOG) {
  mkdirSync(env.FAKE_BENCH_LOG, { recursive: true });
  const rec = { kind, argv, cwd, names: Object.keys(env).sort(), variant: kind === 'worker' ? variant : null };
  writeFileSync(join(env.FAKE_BENCH_LOG, `${process.pid}-${randomBytes(3).toString('hex')}.json`), JSON.stringify(rec));
}

if (kind === 'version') {
  process.stdout.write('9.9.9 (Fake Claude)\n');
  process.exit(0);
}
if (kind === 'auth') {
  const out = env.FAKE_BENCH_LOGGED_OUT === '1';
  process.stdout.write(JSON.stringify({ loggedIn: !out }));
  process.exit(out ? 1 : 0);
}

if (kind === 'judge') {
  const rubric = (stdin.split(/^# Rubric\s*$/m)[1] || '').split(/^# Output /m)[0];
  const criteria = [...rubric.matchAll(/^\s*(\d+)[.)]\s+(.+)$/gm)];
  const outputs = stdin.split(/^# Output ([A-Z])\s*$/m).slice(1);
  const lines = [];
  for (const [, n, text] of criteria) {
    lines.push(`Criterion ${n}: ${text}`);
    for (let i = 0; i < outputs.length; i += 2) {
      const token = Object.keys(SCORES).find((k) => outputs[i + 1].includes(`token ${k}`));
      lines.push(`  ${outputs[i]}: ${SCORES[token] ?? 3}/5  read what it did`);
    }
  }
  lines.push('', `Notes kept by ${env.FAKE_BENCH_ECHO || 'nobody'}; checked the production code; write to ops@example.org`);
  const cost = cfg.judge && 'cost' in cfg.judge ? cfg.judge.cost : 0.02;
  const res = { type: 'result', subtype: 'success', is_error: false, result: lines.join('\n') };
  if (cost !== null) res.total_cost_usd = cost;
  process.stdout.write(JSON.stringify(res));
  process.exit(0);
}

const slug = basename(cwd);
const runs = cfg.runs || {};
const spec = runs[`${slug}/${variant}`] ?? runs[`*/${variant}`] ?? runs[`${slug}/*`] ?? {};
const file = (rel, text) => { mkdirSync(join(cwd, rel, '..'), { recursive: true }); writeFileSync(join(cwd, rel), text); };
const lines = [{ type: 'system', subtype: 'init', cwd, model: 'fake-model', skills: skill ? [skill, 'verify'] : ['verify'] }];
let id = 0;
const step = (name, input, fail = false) => {
  const tid = `t${++id}`;
  lines.push({ type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: tid, name, input }] }, parent_tool_use_id: null });
  lines.push({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: tid, content: fail ? 'exit 1: 1 failing' : 'ok', is_error: fail }] }, parent_tool_use_id: null });
};

file('made.txt', `token ${TOKENS[variant] || 'none'}\n`);
if (skill && variant !== 'empty') {
  step('Skill', { skill });
  file('src/thing.test.js', "import { test } from 'node:test';\ntest('adds', () => {});\n");
  step('Write', { file_path: join(cwd, 'src', 'thing.test.js') });
  step('Bash', { command: 'npm test' }, true);
  file('src/thing.js', 'export const add = (a, b) => a + b;\n');
  step('Edit', { file_path: join(cwd, 'src', 'thing.js') });
  step('Bash', { command: 'npm test' });
} else {
  step('Skill', { skill: 'verify' });
  file('src/thing.js', 'export const add = (a, b) => a + b;\n');
  step('Edit', { file_path: join(cwd, 'src', 'thing.js') });
  step('Bash', { command: 'npm test' }, true);
}
if (spec.fail) {
  process.stdout.write(lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
  process.stderr.write('fake failure\n');
  process.exit(1);
}
const cost = 'cost' in spec ? spec.cost : cfg.defaultCost ?? 0.05;
const result = { type: 'result', subtype: spec.subtype || 'success', is_error: false, num_turns: id + 1, result: `Done in ${cwd}.`, permission_denials: [] };
if (cost !== null) result.total_cost_usd = cost;
lines.push(result);
process.stdout.write(lines.map((l) => JSON.stringify(l)).join('\n') + '\n');
