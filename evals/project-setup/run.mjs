#!/usr/bin/env node
// Run the project-setup skill end to end against a simulated user, then grade the result.
//
//   node evals/project-setup/run.mjs [--scenario <name>] [--baseline] [--out <dir>] [--max-turns 30]
//                                    [--model <model>] [--persona-model <model>] [--no-judge]
//
// For each scenario in scenarios.json: copy the fixture into a fresh folder, install the skill as a standalone
// personal skill in a sandboxed HOME (so the real ~/.claude is never touched), and talk to `claude -p` one turn at a
// time. A second `claude -p` plays the persona and writes each user reply. The run stops when the persona replies
// [END] or the turn limit is reached. --baseline runs the same persona without the skill, to compare.
//
// Each run writes transcript.json, tools.json, files.json, grade.json and judge.json under <out>/<scenario>[-baseline]/.
// This costs real model usage: about 30 to 60 model calls per scenario. Node 20+, no dependencies.
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync, renameSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { grade } from './grade.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, '..', '..');
const SKILL = join(ROOT, 'skills', 'session-discipline', 'project-setup');
const RENAMES = { gitignore: '.gitignore', 'env.example': '.env.example', 'env.canary': '.env', 'github-workflows': '.github/workflows' };
const BASELINE_OPENING = 'Hi. I am new to Claude Code. Please help me set up Claude Code for this project and write a CLAUDE.md for it.';

function args(argv) {
  const o = { maxTurns: 30, out: join(HERE, 'results'), judge: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scenario') o.scenario = argv[++i];
    else if (a === '--baseline') o.baseline = true;
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--max-turns') o.maxTurns = Number(argv[++i]);
    else if (a === '--model') o.model = argv[++i];
    else if (a === '--persona-model') o.personaModel = argv[++i];
    else if (a === '--no-judge') o.judge = false;
    else throw new Error(`unknown option ${a}`);
  }
  return o;
}

function childEnv(home) {
  const env = { ...process.env, HOME: home };
  // A nested claude would otherwise inherit this session's identity.
  for (const k of ['CLAUDE_CODE_SESSION_ID', 'CLAUDECODE', 'CLAUDE_CODE_CHILD_SESSION']) delete env[k];
  return env;
}

function claude(argv, { cwd, home, input }) {
  const r = spawnSync('claude', argv, { cwd, env: childEnv(home), input, encoding: 'utf8', timeout: 600_000, maxBuffer: 64 << 20 });
  if (r.status !== 0) throw new Error(`claude exited ${r.status}: ${(r.stderr || r.stdout || '').slice(0, 2000)}`);
  return JSON.parse(r.stdout);
}

function copyFixture(name, dest) {
  mkdirSync(dest, { recursive: true });
  if (!name) return;
  cpSync(join(HERE, 'fixtures', name), dest, { recursive: true });
  for (const [from, to] of Object.entries(RENAMES)) {
    if (!existsSync(join(dest, from))) continue;
    mkdirSync(dirname(join(dest, to)), { recursive: true });
    renameSync(join(dest, from), join(dest, to));
  }
  const git = (...a) => spawnSync('git', a, { cwd: dest, encoding: 'utf8' });
  git('init', '-q', '-b', 'main');
  git('config', 'user.name', 'Eval Person');
  git('config', 'user.email', 'eval@example.com');
  git('add', '-A');
  git('commit', '-q', '-m', 'Initial commit');
}

function snapshot(dir, skip = /^(\.git|node_modules)(\/|$)/) {
  const out = {};
  const walk = (d) => {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      const rel = relative(dir, p).replace(/\\/g, '/');
      if (skip.test(rel)) continue;
      if (e.isDirectory()) walk(p);
      else if (e.isFile() && statSync(p).size < 200_000) out[rel] = readFileSync(p, 'utf8');
    }
  };
  if (existsSync(dir)) walk(dir);
  return out;
}

function homeFiles(home) {
  const out = {};
  for (const f of ['.claude/CLAUDE.md', '.claude/settings.json']) if (existsSync(join(home, f))) out[f] = readFileSync(join(home, f), 'utf8');
  return out;
}

function findSessionLog(home, id) {
  const base = join(home, '.claude', 'projects');
  if (!existsSync(base)) return null;
  for (const d of readdirSync(base)) {
    const f = join(base, d, `${id}.jsonl`);
    if (existsSync(f)) return f;
  }
  return null;
}

function readLog(file) {
  if (!file) return [];
  return readFileSync(file, 'utf8').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
}

/** Text blocks and tool calls the assistant produced in the log entries of one turn. */
function turnContent(entries, turn) {
  const texts = [];
  const tools = [];
  for (const e of entries) {
    if (e.type !== 'assistant' || !Array.isArray(e.message?.content)) continue;
    for (const c of e.message.content) {
      if (c.type === 'text' && c.text.trim()) texts.push(c.text.trim());
      if (c.type === 'tool_use') tools.push({ turn, name: c.name, path: c.input?.file_path || c.input?.path || c.input?.pattern, command: c.input?.command, skill: c.input?.skill || c.input?.name });
    }
  }
  return { text: texts.join('\n\n'), tools };
}

function personaReply(persona, transcript, opts) {
  const system = [
    'You are role-playing a person who is using Claude Code, as part of a test of a setup assistant. Stay in character.',
    '',
    persona,
    '',
    'You will see the conversation so far. Write only the next message this person would type. No narration, no labels, no quotes around it. Keep it short.',
    'If the assistant asks a multiple-choice question, answer as this person would, by number or by name.',
    'If the setup is over and the assistant has started a first real task that you picked, reply with exactly [END].',
    'If the assistant asks nothing and nothing is left to answer, reply with exactly [END].',
  ].join('\n');
  const convo = transcript.map((m) => `${m.role === 'user' ? 'YOU' : 'ASSISTANT'}:\n${m.text}`).join('\n\n---\n\n');
  const argv = ['-p', '--output-format', 'json', '--no-session-persistence', '--tools', '', '--system-prompt', system];
  if (opts.personaModel) argv.push('--model', opts.personaModel);
  return claude(argv, { cwd: opts.cwd, home: opts.home, input: `Conversation so far:\n\n${convo}\n\nWrite your next message.` }).result.trim();
}

function judge(run, opts) {
  const rubric = readFileSync(join(HERE, 'JUDGE.md'), 'utf8');
  const persona = readFileSync(join(HERE, run.scenario.persona), 'utf8');
  const convo = run.transcript.map((m) => `${m.role.toUpperCase()}:\n${m.text}`).join('\n\n---\n\n');
  const written = Object.entries({ ...run.files.project, ...Object.fromEntries(Object.entries(run.files.home).map(([k, v]) => [`~/${k}`, v])) })
    .filter(([k]) => /CLAUDE(\.local)?\.md$|\.gitignore$/.test(k))
    .map(([k, v]) => `=== ${k}\n${v}`).join('\n\n');
  const input = `${rubric}\n\n# Persona\n\n${persona}\n\n# Conversation\n\n${convo}\n\n# Files after the run\n\n${written}\n`;
  const argv = ['-p', '--output-format', 'json', '--no-session-persistence', '--tools', ''];
  if (opts.personaModel) argv.push('--model', opts.personaModel);
  const text = claude(argv, { cwd: opts.cwd, home: opts.home, input }).result;
  const m = /\{[\s\S]*\}/.exec(text);
  try { return JSON.parse(m[0]); } catch { return { error: 'judge did not return JSON', raw: text }; }
}

function runScenario(scenario, opts) {
  const name = scenario.name + (opts.baseline ? '-baseline' : '');
  const dir = join(opts.out, name);
  rmSync(dir, { recursive: true, force: true });
  const project = join(dir, 'project');
  const home = join(dir, 'home');
  // The persona and the judge run in an empty folder with an empty HOME, so no CLAUDE.md or skill reaches them.
  const side = join(dir, 'side');
  mkdirSync(side, { recursive: true });
  copyFixture(scenario.fixture, project);
  mkdirSync(join(home, '.claude'), { recursive: true });
  if (scenario.homeClaudeMd) writeFileSync(join(home, '.claude', 'CLAUDE.md'), scenario.homeClaudeMd);
  if (!opts.baseline) cpSync(SKILL, join(home, '.claude', 'skills', 'project-setup'), { recursive: true });
  const homeBefore = homeFiles(home);
  const persona = readFileSync(join(HERE, scenario.persona), 'utf8');

  const id = randomUUID();
  const transcript = [];
  const tools = [];
  let seen = 0;
  let message = opts.baseline ? BASELINE_OPENING : scenario.opening;
  let cost = 0;
  for (let turn = 0; turn < opts.maxTurns; turn++) {
    transcript.push({ role: 'user', text: message });
    const argv = ['-p', message, '--output-format', 'json', turn === 0 ? '--session-id' : '--resume', id,
      '--permission-mode', 'acceptEdits', '--add-dir', home,
      // No person can answer a multiple-choice prompt in -p mode, so the skill must use its plain-text fallback.
      '--disallowedTools', 'AskUserQuestion',
      // Loading a skill that declares allowed-tools asks for permission when the model loads it; a person would click
      // allow. A typed /project-setup does not ask.
      '--allowedTools', 'Skill(project-setup)', 'Bash(git *)', 'Bash(ls *)', 'Bash(cat *)', 'Bash(echo *)', 'Bash(printenv *)', 'Bash(find *)', 'Bash(claude --version)'];
    if (opts.model) argv.push('--model', opts.model);
    const out = claude(argv, { cwd: project, home, input: '' });
    cost += out.total_cost_usd || 0;
    const entries = readLog(findSessionLog(home, id));
    const { text, tools: t } = turnContent(entries.slice(seen), turn);
    seen = entries.length;
    transcript.push({ role: 'assistant', text: text || out.result || '' });
    tools.push(...t);
    process.stderr.write(`  ${name} turn ${turn}: ${t.length} tool calls\n`);
    message = personaReply(persona, transcript, { ...opts, cwd: side, home: side });
    if (/^\[END\]$/.test(message)) break;
  }

  const files = { project: snapshot(project), home: homeFiles(home), homeBefore };
  const run = { scenario, transcript, tools, files, baseline: !!opts.baseline };
  const checks = grade(run);
  const result = { name, turns: transcript.length / 2, costUsd: +cost.toFixed(2), checks };
  if (opts.judge) result.judge = judge(run, { ...opts, cwd: side, home: side });
  for (const [f, v] of Object.entries({ 'scenario.json': scenario, 'transcript.json': transcript, 'tools.json': tools, 'files.json': files, 'grade.json': checks, 'judge.json': result.judge || null })) {
    writeFileSync(join(dir, f), JSON.stringify(v, null, 2));
  }
  return result;
}

const opts = args(process.argv.slice(2));
const scenarios = JSON.parse(readFileSync(join(HERE, 'scenarios.json'), 'utf8')).filter((s) => !opts.scenario || s.name === opts.scenario);
if (!scenarios.length) throw new Error(`no scenario named ${opts.scenario}`);
const results = [];
for (const s of scenarios) {
  const r = runScenario(s, opts);
  results.push(r);
  const passed = r.checks.filter((c) => c.pass).length;
  console.log(`\n${r.name}: ${passed}/${r.checks.length} checks, ${r.turns} turns, $${r.costUsd}`);
  for (const c of r.checks) console.log(`  ${c.pass ? 'PASS' : 'FAIL'}  ${c.id}${c.pass || !c.detail ? '' : `  (${c.detail})`}`);
  if (r.judge) console.log(`  judge: ${JSON.stringify(r.judge.scores || r.judge)}`);
}
writeFileSync(join(opts.out, `summary${opts.baseline ? '-baseline' : ''}.json`), JSON.stringify(results, null, 2));
