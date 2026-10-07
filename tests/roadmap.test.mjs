// The roadmap hook summarizes the roadmap tables at session start, honours .claude/roadmap.json, and prints nothing
// for a project without a roadmap.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { summarize, tables } from '../hooks/session-discipline/roadmap.mjs';

const HOOK = repo('hooks', 'session-discipline', 'roadmap.mjs');

const ROADMAP = [
  '# Roadmap',
  '',
  '| # | Question | When | Blocks |',
  '|---|---|---|---|',
  '| Q1 | Which payment provider? | Now | Item 3 |',
  '| Q2 | Pricing model. Answered on 2026-01-05 | Done | Item 4 |',
  '',
  '## Phase 0',
  '',
  '| # | Item | Done when | Status |',
  '|---|---|---|---|',
  '| 1 | **Fast navigation**: skeletons | Pages load | done (2026-01-02) |',
  '| 2 | Onboarding | A new user finishes setup | in progress |',
  '| 2b | CI speed | Under 5 minutes | blocked (needs runner budget) |',
  '',
  '## Phase 1',
  '',
  '| # | Item | Done when | Status |',
  '|---|---|---|---|',
  '| 3 | Payments | First charge | pending |',
  '| 4 | Pricing page | Published | pending |',
].join('\n');

test('tables() finds every table with the header and stops at the first non-table line', () => {
  const t = tables(ROADMAP, 'Item');
  assert.equal(t.length, 2);
  assert.deepEqual(t[0].rows.map((r) => r[0]), ['1', '2', '2b']);
});

test('summary: counts, in progress, next pending, blocked with reason, open questions only, log, handoff', () => {
  const s = summarize({ roadmapText: ROADMAP, logText: '# Log\n- 2026-01-01 started\n- 2026-01-02 item 1 done\n', hasHandoff: true });
  assert.match(s, /1 done, 1 blocked, 5 in total/);
  assert.match(s, /IN PROGRESS: 2 Onboarding/);
  assert.match(s, /NEXT PENDING: 3 Payments/);
  assert.match(s, /BLOCKED: 2b \(needs runner budget\)/);
  assert.match(s, /OPEN QUESTIONS: Q1 -> Item 3$/m);
  assert.doesNotMatch(s, /Q2/);
  assert.match(s, /LAST LOG ENTRY: 2026-01-02 item 1 done/);
  assert.match(s, /HANDOFF\.md exists: read it first/);
});

test('custom headers and status words from the config', () => {
  const text = '| # | Task | State |\n|---|---|---|\n| A | Write docs | doing |\n| B | Ship | todo |\n';
  const s = summarize({ roadmapText: text, config: { itemsHeader: 'Task', statusColumn: 'State', statuses: { inProgress: 'doing', pending: 'todo' } } });
  assert.match(s, /IN PROGRESS: A Write docs/);
  assert.match(s, /NEXT PENDING: B Ship/);
});

test('as a hook: JSON additionalContext from CLAUDE_PROJECT_DIR, config file honoured', () => {
  const dir = tempDir();
  mkdirSync(join(dir, 'plan'));
  mkdirSync(join(dir, '.claude'));
  writeFileSync(join(dir, 'plan', 'ORDER.md'), ROADMAP);
  writeFileSync(join(dir, '.claude', 'roadmap.json'), JSON.stringify({ roadmap: 'plan/ORDER.md' }));
  const r = runNode(HOOK, { env: { CLAUDE_PROJECT_DIR: dir } });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /ROADMAP \(plan\/ORDER\.md\)/);
  assert.match(runNode(HOOK, { env: { CLAUDE_PROJECT_DIR: dir }, args: ['--text'] }).stdout, /^ROADMAP/);
});

test('as a hook: no roadmap file means no output and exit 0', () => {
  const r = runNode(HOOK, { env: { CLAUDE_PROJECT_DIR: tempDir() } });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});
