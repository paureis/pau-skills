#!/usr/bin/env node
// Which skills do I actually use? Reads the log the skill-usage hook writes and prints, for the last N days:
//   - the starts per skill (by the name after the last colon): the total, by the agent and typed, most first;
//   - the skills never started, found by folder name in <home>/.claude/skills/*, <home>/.claude/skills/synced/*/* and
//     <project>/.claude/skills/*, with the folders it read and the ones that were missing.
// A skill that exists only inside a plugin is not in those folders, so it cannot be listed as never started.
//
//   node usage-report.mjs [--days 30] [--project <dir>]
//
// The log is <home>/.claude/pau-skills/skill-usage.tsv, where home is PAU_SKILLS_HOME or the user's home folder. One
// line per start: <ISO time>\t<name>\t<agent|typed>. A line with any other shape is skipped and counted as malformed;
// a line older than the window is left out and counted apart. Without the log it says how to switch the hook on; a
// log it cannot read (a folder at its path, no permission) gives one line with the error code.
// Node.js standard library only, so it works when only this skill is installed. Exit 0, or 2 for bad usage.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const DAY_MS = 86_400_000;
const LOG_PARTS = ['.claude', 'pau-skills', 'skill-usage.tsv'];
const SYNCED = ['.claude', 'skills', 'synced'];
const USAGE = 'Usage: node usage-report.mjs [--days <1-3650>] [--project <dir>]';

const bare = (name) => name.split(':').pop();
const printable = (s) => s.replace(/[\x00-\x1f\x7f]/g, '?');

/** { days, project } from the command line, or null when the usage is wrong. */
function parseArgs(argv) {
  const out = { days: 30, project: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === '--days' && typeof value === 'string' && /^\d{1,4}$/.test(value) && Number(value) >= 1 && Number(value) <= 3650) {
      out.days = Number(value);
    } else if (flag === '--project' && typeof value === 'string' && value !== '' && !value.startsWith('--')) {
      out.project = value;
    } else {
      return null;
    }
    i += 1;
  }
  return out;
}

/** Counts per bare name, in a Map, and the lines left out. Pure. */
function count(text, since) {
  const counts = new Map();
  let old = 0;
  let malformed = 0;
  for (const line of text.split('\n')) {
    if (line === '' || line === '\r') continue;
    const fields = line.replace(/\r$/, '').split('\t');
    const [time, name, how] = fields;
    const when = Date.parse(time);
    if (fields.length !== 3 || Number.isNaN(when) || !name || (how !== 'agent' && how !== 'typed')) {
      malformed += 1;
      continue;
    }
    if (when < since) {
      old += 1;
      continue;
    }
    const key = bare(name);
    if (!key) {
      malformed += 1;
      continue;
    }
    const row = counts.get(key) || { agent: 0, typed: 0 };
    if (how === 'agent') row.agent += 1;
    if (how === 'typed') row.typed += 1;
    counts.set(key, row);
  }
  return { counts, old, malformed };
}

const hasSkill = (dir, name) => existsSync(join(dir, name, 'SKILL.md'));
const list = (dir) => { try { return readdirSync(dir); } catch { return []; } };

/** The skill folders under home and project: the names found, and which folders were read or missing. */
function installed(home, project) {
  const homeSkills = join(home, '.claude', 'skills');
  const synced = join(home, ...SYNCED);
  const projectSkills = join(project, '.claude', 'skills');
  const names = new Set();
  const read = [];
  const missing = [];
  for (const dir of [homeSkills, synced, projectSkills]) (existsSync(dir) ? read : missing).push(dir);
  for (const dir of [homeSkills, projectSkills]) for (const n of list(dir)) if (hasSkill(dir, n)) names.add(n);
  for (const account of list(synced)) for (const n of list(join(synced, account))) if (hasSkill(join(synced, account), n)) names.add(n);
  return { names, read, missing };
}

function table(counts) {
  const rows = [...counts].map(([name, r]) => ({ name: printable(name), total: r.agent + r.typed, agent: r.agent, typed: r.typed }));
  rows.sort((a, b) => b.total - a.total || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  const width = Math.max(5, ...rows.map((r) => r.name.length));
  const cell = (v) => String(v).padStart(6);
  return [
    `${'skill'.padEnd(width)} ${cell('total')} ${cell('agent')} ${cell('typed')}`,
    ...rows.map((r) => `${r.name.padEnd(width)} ${cell(r.total)} ${cell(r.agent)} ${cell(r.typed)}`),
  ];
}

function missingLog(log) {
  return [
    `The usage log ${log} does not exist yet. The skill-usage hook writes it, one line per skill start.`,
    '',
    'To get the hook, install it with your skills or on its own:',
    '  claude plugin install pau-skills-hooks@pau-skills',
    '  (or install the session-discipline plugin, which carries it)',
    '',
    'If the hook is installed, check it is not turned off:',
    '  - "hooks": { "skill-usage": false } in ~/.claude/pau-skills.json or in the project\'s .claude/pau-skills.json',
    '  - skill-usage or all in the PAU_SKILLS_DISABLE environment variable',
    'Then start a skill, and run this report again.',
  ].join('\n');
}

function main(argv = process.argv.slice(2)) {
  const args = parseArgs(argv);
  if (!args) {
    process.stderr.write(USAGE + '\n');
    return 2;
  }
  const { days, project } = args;
  const home = process.env.PAU_SKILLS_HOME || homedir();
  const log = join(home, ...LOG_PARTS);
  if (!existsSync(log)) {
    process.stdout.write(missingLog(log) + '\n');
    return 0;
  }
  let text;
  try {
    text = readFileSync(log, 'utf8');
  } catch (error) {
    process.stdout.write(`The usage log ${log} could not be read (${error.code || error.message}).\n`);
    return 0;
  }
  const now = Date.now();
  const since = now - days * DAY_MS;
  const { counts, old, malformed } = count(text, since);
  const { names, read, missing } = installed(home, project);
  const started = new Set(counts.keys());
  const never = [...names].filter((n) => !started.has(n)).sort();
  const out = [`Skill starts in the last ${days} days, from ${log}`, ''];
  out.push(...(counts.size ? table(counts) : [`No skill started in the last ${days} days.`]));
  out.push('', `Left out: ${old} older than ${days} days, ${malformed} malformed.`, '');
  out.push(`Never started in the last ${days} days (${never.length}):`, ...never.map((n) => `- ${n}`), '');
  out.push('Skill folders read:', ...read.map((d) => `- ${d}`), '');
  out.push('Skill folders missing:', ...missing.map((d) => `- ${d}`), '');
  out.push('A skill that exists only inside a plugin is not in these folders, so it cannot be listed as never started.');
  process.stdout.write(out.join('\n') + '\n');
  return 0;
}

process.exitCode = main();
