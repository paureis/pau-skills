// HOOK-EVENTS.md, the rule-to-hook skill's events summary: the UserPromptExpansion row and the Exit code 0 bullet
// (moved here from rule-to-hook-templates.test.mjs, which covers the templates), with its PreCompact and PostCompact
// exceptions; one row each for PostToolUseFailure, PostToolBatch, StopFailure, TaskCompleted, PostCompact, ConfigChange
// and PreSkillShellCommand with its input fields, its matcher, its block verdict and what exit 2 does; the ConfigChange
// policy_settings exception; PostToolUseFailure as reminders only; the PreCompact row's exit 2 and the SessionStart
// source fork; and the line that says the table is not the full list of the 34 hook events.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repo } from './helpers.mjs';

describe('HOOK-EVENTS.md', () => {
  const md = readFileSync(repo('skills', 'guards', 'rule-to-hook', 'HOOK-EVENTS.md'), 'utf8');
  const events = md.split('\n## The events\n')[1]?.split('\n## ')[0] ?? '';
  const rows = events.split('\n').filter((l) => l.startsWith('| `')).map((l) => l.split('|').slice(1, -1).map((c) => c.trim()));
  test('the events table has one UserPromptExpansion row with its input fields and how exit 2 blocks', () => {
    const found = rows.filter((r) => r[0] === '`UserPromptExpansion`');
    assert.equal(found.length, 1);
    const [row] = found;
    assert.equal(row.length, 5);
    for (const f of ['expansion_type', 'command_name', 'command_args', 'command_source']) assert.ok(row[2].includes(`\`${f}\``), f);
    assert.match(row[3], /exit 2 blocks the expansion/i);
  });
  // [event, input fields, matcher (the field it is tested against, or null for none), the verdict that starts the
  // block cell, what exit 2 does]
  const NEW = [
    ['PostToolUseFailure', ['tool_name', 'tool_input', 'tool_use_id', 'error', 'is_interrupt', 'duration_ms'], 'tool_name', 'Not the call (', /exit 2 shows stderr to Claude at once/i],
    ['PostToolBatch', ['tool_calls'], null, 'Not the calls (', /exit 2 stops the agentic loop \(stderr to the user only\)/i],
    ['StopFailure', ['error', 'error_details', 'last_assistant_message'], 'error', 'No. ', /output and exit codes are ignored/i],
    ['TaskCompleted', ['task_id', 'task_subject', 'task_description', 'teammate_name', 'team_name'], null, 'Yes. ', /exit 2 prevents the task completion/i],
    ['PostCompact', ['trigger', 'compact_summary'], 'trigger', 'No. ', /exit 2 is like any other error, stderr to the user only/i],
    ['ConfigChange', ['source', 'file_path'], 'source', 'Yes. ', /exit 2 blocks the change/i],
    ['PreSkillShellCommand', ['tool_name', 'tool_input', 'tool_use_id', 'command_name', 'command_source', 'invoked_by'], 'tool_name', 'Yes. ', /exit 2 keeps the command from running/i],
  ];
  for (const [name, fields, matcher, verdict, exit2] of NEW) {
    test(`the events table has one ${name} row with its input fields, its matcher and what exit 2 does`, () => {
      const found = rows.filter((r) => r[0] === `\`${name}\``);
      assert.equal(found.length, 1);
      const [row] = found;
      assert.equal(row.length, 5);
      for (const f of fields) assert.ok(row[2].includes(`\`${f}\``), f);
      if (matcher) assert.match(row[2], new RegExp(`\`${matcher}\` \\([^)]*the matcher is tested against it`));
      else assert.match(row[2], /no matcher/);
      assert.ok(row[3].startsWith(verdict), `the block cell starts with ${verdict}`);
      assert.match(row[3], exit2);
    });
  }
  test('the StopFailure row lists the error values its matcher sees', () => {
    const row = rows.find((r) => r[0] === '`StopFailure`') ?? [];
    for (const v of ['rate_limit', 'overloaded', 'authentication_failed', 'billing_error', 'server_error', 'max_output_tokens', 'unknown']) assert.ok(row[2]?.includes(`\`${v}\``), v);
  });
  test('the PostCompact row sends a rule for Claude to SessionStart with source compact', () => {
    const row = rows.find((r) => r[0] === '`PostCompact`') ?? [];
    assert.match(row[4] ?? '', /`SessionStart` with source `compact`/);
  });
  test('the ConfigChange row says a policy_settings change is applied even when exit 2 blocks', () => {
    const row = rows.find((r) => r[0] === '`ConfigChange`') ?? [];
    assert.match(row[3] ?? '', /except a `policy_settings` change, which is applied anyway/);
  });
  test('the PostToolUseFailure row only informs: reminders for Claude, the block in PreToolUse, no refused-call claim', () => {
    const row = rows.find((r) => r[0] === '`PostToolUseFailure`') ?? [];
    assert.doesNotMatch(row[1] ?? '', /refused/);
    assert.match(row[4] ?? '', /remind Claude/);
    assert.match(row[4] ?? '', /belongs in `PreToolUse`/);
  });
  test('the TaskCompleted and PreSkillShellCommand rows say their facts were not probed live', () => {
    for (const name of ['TaskCompleted', 'PreSkillShellCommand']) {
      const row = rows.find((r) => r[0] === `\`${name}\``) ?? [];
      assert.match(row[1] ?? '', /not probed live/, name);
    }
    const row = rows.find((r) => r[0] === '`PreSkillShellCommand`') ?? [];
    assert.match(row[1] ?? '', /whether `PreToolUse` also fires .* is not settled/);
  });
  test('the PreCompact row says exit 2 blocks compaction', () => {
    const row = rows.find((r) => r[0] === '`PreCompact`') ?? [];
    assert.match(row[3] ?? '', /^Yes\. Exit 2 blocks compaction/);
  });
  test('the SessionStart row lists source fork', () => {
    const row = rows.find((r) => r[0] === '`SessionStart`') ?? [];
    for (const v of ['startup', 'resume', 'clear', 'compact', 'fork']) assert.ok(row[2]?.includes(`\`${v}\``), v);
  });
  test('one line under the events table says it is not the full list of hook events', () => {
    assert.ok(events.split('\n').some((l) => /^The table is not the full list of hook events: Claude Code 2\.1\.332 has 34,/.test(l)));
  });
  test('the Exit code 0 bullet says plain stdout reaches Claude on UserPromptExpansion', () => {
    const bullet = md.split('\n- ').find((b) => b.startsWith('**Exit code 0**'));
    assert.ok(bullet);
    assert.match(bullet, /`UserPromptExpansion`/);
  });
  test('the Exit code 0 bullet names the PreCompact and PostCompact exceptions for plain stdout', () => {
    const bullet = md.split('\n- ').find((b) => b.startsWith('**Exit code 0**')) ?? '';
    assert.match(bullet, /`PreCompact`[^.]*compact instructions/);
    assert.match(bullet, /`PostCompact`[^.]*user/);
  });
});
