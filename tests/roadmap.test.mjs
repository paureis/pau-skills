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
  // A prose line or an empty line right after the rows ends the table; a row-shaped line after it is not a row.
  for (const stop of ['Not a table line.', '']) {
    const text = ['| # | Item | Status |', '|---|---|---|', '| 1 | a | done |', stop, '| 9 | stray | pending |'].join('\n');
    assert.deepEqual(tables(text, 'Item').map((x) => x.rows.map((r) => r[0])), [['1']], `stop line: ${JSON.stringify(stop)}`);
  }
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
  // roadmap reads CLAUDE_PROJECT_DIR, never the input cwd; the user config and PAU_SKILLS_DISABLE are the test's own.
  const env = { CLAUDE_PROJECT_DIR: dir, PAU_SKILLS_HOME: tempDir(), PAU_SKILLS_DISABLE: '' };
  const r = runNode(HOOK, { env });
  assert.equal(r.code, 0);
  const out = JSON.parse(r.stdout);
  assert.equal(out.hookSpecificOutput.hookEventName, 'SessionStart');
  assert.match(out.hookSpecificOutput.additionalContext, /ROADMAP \(plan\/ORDER\.md\)/);
  assert.match(runNode(HOOK, { env, args: ['--text'] }).stdout, /^ROADMAP/);
});

test('as a hook: no roadmap file means no output and exit 0', () => {
  const r = runNode(HOOK, { env: { CLAUDE_PROJECT_DIR: tempDir() } });
  assert.equal(r.code, 0);
  assert.equal(r.stdout, '');
});
