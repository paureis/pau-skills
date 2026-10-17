#!/usr/bin/env node
// A stand-in for the `claude` command, for tests/skill-eval.test.mjs. It records how it was called and prints output
// in the shape the real command prints, so the tests never call a model.
//
// Every call writes <FAKE_CLAUDE_LOG>/<pid>.json: { argv, cwd, home, stdin, env } where env says which identity
// variables reached it. A call with `--tools ""` acts as the reviewer: it prints one JSON result whose text gives every
// "# Output <letter>" heading it read on standard input a 3 on every rubric criterion. Any other call acts as a worker: it
// changes notes.txt, adds done.txt, touches the installed skill (which must never reach the blind copy) and prints
// stream-json lines. FAKE_CLAUDE_FAIL=1 makes it exit 1 with nothing on standard output.
import { writeFileSync, readFileSync, appendFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const argv = process.argv.slice(2);
const cwd = process.cwd();
const stdin = (() => { try { return readFileSync(0, 'utf8'); } catch { return ''; } })();
const watched = ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'CLAUDE_CODE_CHILD_SESSION', 'CLAUDE_CODE_REMOTE_SESSION_ID',
  'CLAUDE_ADDITIONAL_DIRECTORIES', 'CLAUDE_CODE_ADDITIONAL_DIRECTORIES_CLAUDE_MD', 'KEEP_ME'];
const env = Object.fromEntries(watched.map((k) => [k, process.env[k] ?? null]));
if (process.env.FAKE_CLAUDE_LOG) {
  mkdirSync(process.env.FAKE_CLAUDE_LOG, { recursive: true });
  writeFileSync(join(process.env.FAKE_CLAUDE_LOG, `${process.pid}.json`), JSON.stringify({ argv, cwd, home: process.env.HOME, stdin, env }));
}
if (process.env.FAKE_CLAUDE_FAIL === '1') {
  process.stderr.write('fake failure\n');
  process.exit(1);
}

const toolsAt = argv.indexOf('--tools');
if (toolsAt >= 0 && argv[toolsAt + 1] === '') {
  const labels = [...stdin.matchAll(/^# Output ([A-Z])\s*$/gm)].map((m) => m[1]);
  const rubric = (stdin.split(/^# Rubric\s*$/m)[1] || '').split(/^# Output /m)[0];
  const criteria = [...rubric.matchAll(/^\s*(\d+)[.)]\s+(.+)$/gm)];
  const lines = [];
  for (const [, n, text] of criteria) {
    lines.push(`Criterion ${n}: ${text}`);
    for (const l of labels) lines.push(`  ${l}: 3  read the actions`);
  }
  lines.push(`Totals: ${labels.map((l) => `${l} 9`).join(', ')}`);
  process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, result: lines.join('\n'), total_cost_usd: 0.02 }));
  process.exit(0);
}

if (existsSync(join(cwd, 'notes.txt'))) appendFileSync(join(cwd, 'notes.txt'), 'tidied\n');
writeFileSync(join(cwd, 'done.txt'), 'finished\n');
const skillsDir = join(cwd, '.claude', 'skills');
const skills = existsSync(skillsDir) ? readdirSync(skillsDir) : [];
for (const s of skills) appendFileSync(join(skillsDir, s, 'SKILL.md'), '\nINSTALLED VARIANT TEXT\n');
const out = [
  { type: 'system', subtype: 'init', cwd, model: 'fake-model', skills: [...skills, 'verify'], slash_commands: [...skills, 'verify'], plugins: [], mcp_servers: [] },
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x1', name: 'Read', input: { file_path: join(cwd, 'notes.txt') } }] }, parent_tool_use_id: null },
  { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x1', content: 'milk', is_error: false }] }, parent_tool_use_id: null },
  { type: 'assistant', message: { role: 'assistant', content: [{ type: 'tool_use', id: 'x2', name: 'Bash', input: { command: `ls ${process.env.HOME}` } }] }, parent_tool_use_id: null },
  { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'x2', content: '', is_error: false }] }, parent_tool_use_id: null },
  { type: 'result', subtype: 'success', is_error: false, num_turns: 3, total_cost_usd: 0.05, result: `Tidied ${join(cwd, 'notes.txt')}.`, permission_denials: [] },
];
process.stdout.write(out.map((o) => JSON.stringify(o)).join('\n') + '\n');
