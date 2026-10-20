// No tracked file in this repository is over its token limit. From docs/BACKLOG.md, item Q4:
//   "What it does": "Repository test `tests/file-size.test.mjs` applies the same rule and the same skip list to every
//   tracked file, so CI catches a change made outside Claude Code. It shares the size and skip logic with the hook
//   instead of copying it."
//   "Changed at the start of Q4": "The repository test reads the limit and overrides from this repository's
//   `.claude/pau-skills.json` only, never the user's file under HOME, so CI and every computer judge the same way."
// The on/off switch is not read: turning the hook off for a session must not turn this check off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tempDir } from './helpers.mjs';
import { loadConfig, hookOptions } from '../hooks/lib/config.mjs';
import { listOversized, NAME } from '../hooks/guards/file-size-guard.mjs';

/** The options the repository test uses: this repository's config file, with a HOME that has none. */
const repoOptions = () => hookOptions(NAME, loadConfig({ project: ROOT, home: tempDir() }));

test('the options come from the repository config only, never from HOME', () => {
  const home = tempDir();
  mkdirSync(join(home, '.claude'));
  writeFileSync(join(home, '.claude', 'pau-skills.json'), JSON.stringify({ [NAME]: { maxTokens: 1, ignorePaths: ['**'] } }));
  const saved = process.env.PAU_SKILLS_HOME;
  process.env.PAU_SKILLS_HOME = home;
  try {
    assert.equal(hookOptions(NAME, loadConfig({ project: ROOT, home })).maxTokens, 1, 'control: the file is read when it is HOME');
    const options = repoOptions();
    assert.notEqual(options.maxTokens, 1);
    assert.equal(options.ignorePaths, undefined);
  } finally {
    if (saved === undefined) delete process.env.PAU_SKILLS_HOME; else process.env.PAU_SKILLS_HOME = saved;
  }
});

test('no tracked file is over its token limit', () => {
  const over = listOversized(ROOT, repoOptions());
  const lines = over.map((f) => `${f.path}: ${f.tokens} tokens, limit ${f.limit}`);
  assert.equal(over.length, 0, `${over.length} tracked files are over their token limit (bytes / 4):\n${lines.join('\n')}`);
});
