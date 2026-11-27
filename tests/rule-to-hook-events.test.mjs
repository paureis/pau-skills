// HOOK-EVENTS.md, the rule-to-hook skill's events summary: the UserPromptExpansion row and the Exit code 0 bullet.
// Moved here from rule-to-hook-templates.test.mjs, which covers the templates.
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
  test('the Exit code 0 bullet says plain stdout reaches Claude on UserPromptExpansion', () => {
    const bullet = md.split('\n- ').find((b) => b.startsWith('**Exit code 0**'));
    assert.ok(bullet);
    assert.match(bullet, /`UserPromptExpansion`/);
  });
});
