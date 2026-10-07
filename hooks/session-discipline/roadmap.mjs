#!/usr/bin/env node
// SessionStart hook: print the roadmap's current item, the next pending one, the blocked ones and the open questions,
// so every session starts from the written order instead of from memory.
//
//   node roadmap.mjs            JSON for the hook (hookSpecificOutput.additionalContext)
//   node roadmap.mjs --text     plain text, for a human
//
// The project root is $CLAUDE_PROJECT_DIR (set by Claude Code for hooks) or the cwd. Paths, table headers and status
// words come from <root>/.claude/roadmap.json when it exists (every key optional, defaults in DEFAULTS below). If the
// roadmap file does not exist the hook prints nothing: projects without a roadmap are not nagged.
//
// Roadmap format: one or more markdown tables whose header row starts with "| # | <items header> |" and has a
// status column; and optionally one table whose header row starts with "| # | <questions header> |" and has a
// "blocks" column. A question whose row matches answeredPattern is no longer open. Ids are text ("2b" is allowed).
import { readFileSync, existsSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig as loadSharedConfig, hookEnabled } from '../lib/config.mjs';

export const DEFAULTS = {
  roadmap: 'docs/ROADMAP.md',
  log: 'docs/LOG.md',
  handoff: 'HANDOFF.md',
  itemsHeader: 'Item',
  statusColumn: 'Status',
  questionsHeader: 'Question',
  blocksColumn: 'Blocks',
  statuses: { pending: 'pending', inProgress: 'in progress', blocked: 'blocked', done: 'done' },
  answeredPattern: 'Answered on \\d{4}-\\d{2}-\\d{2}',
  rule: 'One item at a time. At the end of the session, update the statuses in the roadmap, log what was done and write the handoff.',
};

const clean = (cell) => cell.replace(/\*\*/g, '').replace(/`/g, '').trim();
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Rows of every table whose header row starts with "| # | <first>", as { header: string[], rows: string[][] }. */
export function tables(text, first) {
  const headerRe = new RegExp('^\\|\\s*#\\s*\\|\\s*' + escapeRe(first) + '\\b', 'i');
  const out = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (headerRe.test(line)) { cur = { header: line.split('|').slice(1, -1).map(clean), rows: [] }; out.push(cur); continue; }
    if (cur && /^\|\s*:?-+/.test(line)) continue;
    if (cur && line.startsWith('|')) cur.rows.push(line.split('|').slice(1, -1).map(clean));
    else cur = null;
  }
  return out;
}

const column = (header, name, fallback) => {
  const i = header.findIndex((h) => h.toLowerCase() === name.toLowerCase());
  return i >= 0 ? i : fallback;
};

/** The summary text, from the file contents. Pure, so it can be tested without a file system. */
export function summarize({ roadmapText, logText = '', hasHandoff = false, config = {} }) {
  const c = { ...DEFAULTS, ...config, statuses: { ...DEFAULTS.statuses, ...(config.statuses || {}) } };
  const s = c.statuses;
  const starts = (status, word) => status.toLowerCase().startsWith(word.toLowerCase());

  const items = [];
  for (const t of tables(roadmapText, c.itemsHeader)) {
    const st = column(t.header, c.statusColumn, t.header.length - 1);
    for (const r of t.rows) items.push({ id: r[0], title: (r[1] || '').split(':')[0].slice(0, 90), status: r[st] || '' });
  }
  const answered = new RegExp(c.answeredPattern, 'i');
  const questions = [];
  for (const t of tables(roadmapText, c.questionsHeader)) {
    const bl = column(t.header, c.blocksColumn, t.header.length - 1);
    for (const r of t.rows) if (!r.some((cell) => answered.test(cell))) questions.push({ id: r[0], blocks: r[bl] || '' });
  }

  const inProgress = items.filter((e) => starts(e.status, s.inProgress));
  const blocked = items.filter((e) => starts(e.status, s.blocked));
  const next = items.find((e) => starts(e.status, s.pending));
  const done = items.filter((e) => starts(e.status, s.done));

  const logLines = logText.split(/\r?\n/).filter((l) => l.startsWith('- ') || l.startsWith('## ['));
  const lastLog = logLines.length ? logLines[logLines.length - 1].replace(/^(- |## )/, '').slice(0, 160) : '(no log entries)';

  const parts = [];
  parts.push(`ROADMAP (${c.roadmap}): ${done.length} done, ${blocked.length} blocked, ${items.length} in total.`);
  if (inProgress.length) parts.push('IN PROGRESS: ' + inProgress.map((e) => `${e.id} ${e.title}`).join('; '));
  if (next) parts.push(`NEXT PENDING: ${next.id} ${next.title}`);
  if (blocked.length) parts.push('BLOCKED: ' + blocked.map((e) => `${e.id} ${e.status.slice(s.blocked.length).trim()}`).join('; '));
  if (questions.length) parts.push('OPEN QUESTIONS: ' + questions.map((q) => `${q.id} -> ${q.blocks}`).join('; '));
  parts.push('LAST LOG ENTRY: ' + lastLog);
  parts.push(hasHandoff ? `${c.handoff} exists: read it first.` : `No ${c.handoff}.`);
  parts.push('Rule: ' + c.rule);
  return parts.join('\n');
}

export function loadConfig(root) {
  const p = join(root, '.claude', 'roadmap.json');
  if (!existsSync(p)) return {};
  try { return JSON.parse(readFileSync(p, 'utf8').replace(/^﻿/, '')); } catch { return {}; }
}

function main(argv) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  if (!hookEnabled('roadmap', loadSharedConfig({ project: root }))) return 0;
  const config = loadConfig(root);
  const c = { ...DEFAULTS, ...config };
  const roadmapPath = join(root, c.roadmap);
  if (!existsSync(roadmapPath)) return 0;
  const logPath = join(root, c.log);
  const text = summarize({
    roadmapText: readFileSync(roadmapPath, 'utf8'),
    logText: existsSync(logPath) ? readFileSync(logPath, 'utf8') : '',
    hasHandoff: existsSync(join(root, c.handoff)),
    config,
  });
  if (argv.includes('--text')) console.log(text);
  else console.log(JSON.stringify({ hookSpecificOutput: { hookEventName: 'SessionStart', additionalContext: text } }));
  return 0;
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  try { process.exitCode = main(process.argv.slice(2)); } catch { process.exitCode = 0; } // a broken roadmap never blocks a session
}
