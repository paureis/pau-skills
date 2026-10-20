#!/usr/bin/env node
// check-agents.mjs: audit Claude Code agent files (subagents). Node 20+, standard library only, read only.
//
//   node check-agents.mjs [--project <root>] [--user <dir>] [--dir <folder>] [--json]
//
//   --project <root>  the project; its agents are in <root>/.claude/agents/, its skills in <root>/.claude/skills/.
//                     Default: the current directory.
//   --user <dir>      the user's Claude folder; agents in <dir>/agents/, skills in <dir>/skills/. Default: ~/.claude.
//   --dir <folder>    check the agent files in this one folder instead of the project and user scopes (for drafts
//                     and for the bundled roster). The skill folders of --project and --user are still used.
//   --json            print { agents, docs, findings } as JSON instead of text.
//
// Exit 0 when there is no error (warnings allowed), 1 when there is at least one error, 2 on a usage problem.
//
// Folders are read recursively, as Claude Code reads them. A .md file with no frontmatter, or with frontmatter but no
// name, is documentation kept beside the agents: it is counted and not checked. Node has no YAML parser, so this reads
// the subset agent files use: `key: value` lines with plain, quoted or block (`|`, `>`) values, `- item` lists
// (indented or not), `[a, b]` lists, anchors, and nested maps (hooks, mcpServers, experimental), which it keeps
// without checking inside. Like Claude Code, it reads an inline value that is not strict YAML (such as
// `description: Use when: x`) as the plain text of its line, and keeps the last of two equal keys. Where its own
// subset still cannot read an entry, it says so as a warning and runs every check that does not need that entry;
// `claude plugin validate <folder>` uses Claude Code's own parser and is the authority on whether the file loads.
// It reads a folder of agents only at a path ending in .claude/agents (any other folder fails with "No manifest
// found"), so for another folder the parse warning gives a command that copies the folder to
// <a temporary folder>/.claude/agents and validates the copy.
//
// Errors (Claude Code skips the file, or the agent quietly does something other than its file says):
//   name                a name with a colon, a leading dash, or over 256 characters (Claude Code skips the file)
//   description         a named agent with no description (Claude Code skips the file)
//   duplicate           two files with the same name in one scope (Claude Code loads one, by file read order)
//   field               a frontmatter field Claude Code does not know (it ignores it without a word)
//   value               a bad effort, memory, isolation, permissionMode, color, boolean or number
//   covenant            the covenant block from COVENANT.md is missing (in the project, or on a file with a roster
//                       marker), unclosed, or reworded at the bundle's roster version
//   memory-read-only    memory on an agent with no Write or Edit: memory gives the agent Read, Write and Edit
//   worktree-ignore     an agent uses isolation: worktree and .claude/worktrees/ is not git-ignored
// Warnings:
//   parse               an entry this script cannot read: run claude plugin validate on the folder (or on a copy)
//   duplicate-key       a key given twice: Claude Code keeps the last one
//   value               a model name this script does not know (the field takes what --model takes)
//   shadowed            the same name in the project and the user scope: the project's file wins
//   glob-grep           Glob or Grep listed with Bash: on Linux and macOS they are dropped when Bash is there
//   tool                a tools entry that is not a known tool name, or that reads as a map
//   description-length  a description over 200 characters (the Agent tool lists every description in every session)
//   covenant            a covenant from another roster version (run Update), or none on a personal user agent
//   agent-tools         the body says it starts or continues agents, and Agent or SendMessage is not in tools
//   skill               a skills entry that is not installed in the project's or the user's skill folders
//   overlap             two descriptions share so many words that delegation may pick the wrong agent
//
// Overlap score: each description is lowercased and split into words; words under three letters and common filler
// words are dropped. The score is the number of words both sets share divided by the number of words in either
// (Jaccard). At OVERLAP_THRESHOLD (0.5) or more, the pair is reported: half their words are the same.
//
// Judging whether an agent needs each tool for its job is left to the agent running the audit.
import { realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { readCovenant, overlapScore, OVERLAP_THRESHOLD, loadScope, checkAgent } from './check-agents-checks.mjs';
export { DESCRIPTION_MAX, NAME_MAX, OVERLAP_THRESHOLD, FIELDS, ENUMS, TOOLS, covenantOf, readCovenant, overlapScore, validateHint } from './check-agents-checks.mjs';
export { parseFrontmatter, parseTools } from './check-agents-yaml.mjs';

function gitIgnored(root, path) {
  const r = spawnSync('git', ['-C', root, 'check-ignore', '-q', '--no-index', path], { encoding: 'utf8' });
  if (r.error || r.status === 128) return null;
  return r.status === 0;
}

/** Audit the agents. Returns { agents, docs, findings }. */
export function audit({ project = process.cwd(), user = join(homedir(), '.claude'), dir, covenant } = {}) {
  const cov = covenant || readCovenant();
  const scopes = dir ? [['dir', dir]] : [['project', join(project, '.claude', 'agents')], ['user', join(user, 'agents')]];
  const agents = [];
  const docs = [];
  for (const [scope, path] of scopes) {
    const s = loadScope(scope, path);
    agents.push(...s.agents);
    docs.push(...s.docs);
  }
  const ctx = { covenant: cov, skillDirs: [join(project, '.claude', 'skills'), join(user, 'skills')], userDir: user };
  const findings = agents.flatMap((a) => checkAgent(a, ctx));
  const named = agents.filter((a) => !a.unclosed && a.data.name !== undefined && a.data.name !== null && a.data.name !== '');

  const byScope = new Map();
  for (const a of named) {
    const key = `${a.scope}\0${a.data.name}`;
    if (!byScope.has(key)) byScope.set(key, []);
    byScope.get(key).push(a);
  }
  for (const group of byScope.values()) {
    if (group.length < 2) continue;
    const [first, ...rest] = group;
    findings.push({ level: 'error', check: 'duplicate', scope: first.scope, file: first.file, rel: first.rel,
      message: `name "${first.data.name}" is also used by ${rest.map((r) => r.rel).join(', ')}: Claude Code loads only one of them, by file read order` });
  }
  for (const p of named.filter((a) => a.scope === 'project')) {
    const u = named.find((a) => a.scope === 'user' && a.data.name === p.data.name);
    if (u) findings.push({ level: 'warning', check: 'shadowed', scope: 'user', file: u.file, rel: u.rel, message: `name "${u.data.name}" is also in the project (${p.rel}): the project's file wins over the user's` });
  }
  const seen = new Set();
  const unique = named.filter((a) => typeof a.data.description === 'string' && a.data.description.trim()).filter((a) => { const k = `${a.data.name}`; if (seen.has(k)) return false; seen.add(k); return true; });
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const score = overlapScore(unique[i].data.description, unique[j].data.description);
      if (score >= OVERLAP_THRESHOLD) {
        findings.push({ level: 'warning', check: 'overlap', scope: unique[j].scope, file: unique[j].file, rel: unique[j].rel,
          message: `the descriptions of "${unique[i].data.name}" (${unique[i].scope} ${unique[i].rel}) and "${unique[j].data.name}" (${unique[j].scope} ${unique[j].rel}) overlap with a word score of ${score.toFixed(2)}: say what makes each one the right pick` });
      }
    }
  }
  if (!dir && named.some((a) => a.data.isolation === 'worktree')) {
    const ignored = gitIgnored(project, '.claude/worktrees/probe');
    const users = named.filter((a) => a.data.isolation === 'worktree').map((a) => a.data.name).join(', ');
    if (ignored === false) {
      findings.push({ level: 'error', check: 'worktree-ignore', scope: 'project', file: join(project, '.gitignore'), rel: '.gitignore',
        message: `${users} use isolation: worktree, and .claude/worktrees/ is not git-ignored: add it to .gitignore so worktrees never get committed` });
    } else if (ignored === null) {
      findings.push({ level: 'warning', check: 'worktree-ignore', scope: 'project', file: project, rel: '.',
        message: `${users} use isolation: worktree, and git could not say whether .claude/worktrees/ is ignored (not a git repository?)` });
    }
  }
  return { agents: agents.map(({ scope, file, rel, data }) => ({ scope, file, rel, data })), docs: docs.map(({ scope, file, rel }) => ({ scope, file, rel })), findings };
}

// ---------------------------------------------------------------------------------------------------------------
// The command line.

function parseArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (['--project', '--user', '--dir'].includes(a) && argv[i + 1]) opts[a.slice(2)] = resolve(argv[++i]);
    else throw new Error(`unknown argument: ${a}`);
  }
  return opts;
}

function format(result, opts) {
  const lines = [];
  const counts = {};
  for (const a of result.agents) counts[a.scope] = (counts[a.scope] || 0) + 1;
  const where = opts.dir ? opts.dir : `${join(opts.project || process.cwd(), '.claude', 'agents')} and ${join(opts.user || join(homedir(), '.claude'), 'agents')}`;
  lines.push(`check-agents: ${result.agents.length} agent file(s) in ${where}${Object.keys(counts).length ? ` (${Object.entries(counts).map(([k, v]) => `${k} ${v}`).join(', ')})` : ''}, ${result.docs.length} documentation file(s) skipped`);
  for (const f of [...result.findings].sort((x, y) => (x.level === y.level ? 0 : x.level === 'error' ? -1 : 1))) {
    lines.push(`${f.level === 'error' ? 'ERROR  ' : 'warning'}  ${f.scope}  ${f.rel}  ${f.check}: ${f.message}`);
  }
  const e = result.findings.filter((f) => f.level === 'error').length;
  const w = result.findings.length - e;
  lines.push(`${e} error(s), ${w} warning(s)`);
  return lines.join('\n');
}

function main() {
  let opts;
  try { opts = parseArgs(process.argv.slice(2)); } catch (e) {
    console.error(`${e.message}\nUsage: node check-agents.mjs [--project <root>] [--user <dir>] [--dir <folder>] [--json]`);
    process.exit(2);
  }
  const result = audit(opts);
  console.log(opts.json ? JSON.stringify(result, null, 2) : format(result, opts));
  process.exit(result.findings.some((f) => f.level === 'error') ? 1 : 0);
}

const invoked = process.argv[1] && (() => { try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; } })();
if (invoked) main();
