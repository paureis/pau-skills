// The agent-friendly-audit skill text: proofs and prototypes run in a git-ignored folder inside the project, removed
// before any run on the current code, because a headless acceptEdits run refuses a write outside the project (Q12).
// This pins the wording only; the headless cold run is the proof that an agent follows it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repo } from './helpers.mjs';

test('proofs run in a git-ignored folder inside the project, removed before any run on the current code', () => {
  const flat = readFileSync(repo('skills', 'planning', 'agent-friendly-audit', 'SKILL.md'), 'utf8').replace(/\s+/g, ' ');
  assert.doesNotMatch(flat, /outside the working tree/);
  const start = flat.indexOf('## 6. ');
  const end = flat.indexOf('## 7. ');
  assert.ok(start !== -1 && end > start, 'steps 6 and 7 found');
  const step6 = flat.slice(start, end);
  assert.match(step6, /`\.agent-audit-scratch\/\.gitignore`/);
  assert.match(step6, /`rm -r \.agent-audit-scratch`/);
  assert.match(step6, /before any run on the current code/);
});
