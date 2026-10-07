// The retrospective's audit: a restated rule scores as a duplicate (the control that made the script switch from
// Jaccard to containment), an unrelated one as new, and --stale finds references to files and scripts that are gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { shingles, containment, verdict, unitsOf, findStale, projectSlug } from '../skills/session-discipline/retrospective/audit.mjs';

const AUDIT = repo('skills', 'session-discipline', 'retrospective', 'audit.mjs');
const LONG_RULE = '- Verify the artifact, never the exit code. After any scripted edit, read the seam back: grep the changed line, check git diff stat, check the last commit. A multi-line replace silently does nothing on CRLF files, and conflict resolution by deleting lines by number corrupts files while reporting success. ' +
  'Every ad-hoc check needs a control and ordered anchors, because a check with no control is a check that cannot fail and a byte offset check once matched the navigation first.';

test('containment: a short restatement inside a long unit scores high; Jaccard would not', () => {
  const proposal = 'After any scripted edit, read the seam back: grep the changed line and check git diff stat.';
  const a = shingles(proposal); const b = shingles(LONG_RULE);
  const score = containment(a, b);
  assert.ok(score >= 0.35, `score ${score}`);
  let inter = 0; for (const x of a) if (b.has(x)) inter++;
  assert.ok(inter / (a.size + b.size - inter) < 0.35, 'Jaccard of the same pair stays low, which is why containment is used');
  assert.equal(verdict(score), 'DUPLICATE/EXTENDS');
  assert.equal(verdict(containment(shingles('Always water the office plants on Mondays before standup meetings begin.'), b)), 'NEW');
});

test('unitsOf splits at headings and bullets and drops tiny units', () => {
  const text = '# Rules\n\nIntro paragraph describing operating rules for agents editing repository files through scripts, shells, hooks, gates and tests.\n' + LONG_RULE + '\n- short bullet\n';
  const units = unitsOf('test', text);
  assert.equal(units.length, 2);
  assert.match(units[1].name, /^Rules > Verify the artifact/);
});

test('projectSlug matches the Claude Code layout', () => {
  assert.equal(projectSlug('C:\\Some Dir\\repo'), 'C--Some-Dir-repo');
  assert.equal(projectSlug('/srv/work/repo'), '-srv-work-repo');
});

test('findStale reports missing paths and npm scripts, not existing ones', () => {
  const dir = tempDir();
  mkdirSync(join(dir, 'docs'));
  writeFileSync(join(dir, 'docs', 'PLAN.md'), 'x');
  const stores = [{ label: 'project CLAUDE.md', text: 'See `docs/PLAN.md` and `docs/GONE.md`; run `npm run test` and `npm run vanished`.' }];
  const missing = findStale(stores, dir, { test: 'node --test' });
  assert.deepEqual(missing.map((m) => `${m.kind}:${m.ref}`), ['path:docs/GONE.md', 'script:vanished']);
});

test('CLI: --check against a fake home, and --stale exit codes', () => {
  const home = tempDir(); const project = tempDir();
  mkdirSync(join(home, '.claude'), { recursive: true });
  writeFileSync(join(home, '.claude', 'CLAUDE.md'), '# Global\n\n' + LONG_RULE + '\n');
  const proposal = join(project, 'proposal.md');
  writeFileSync(proposal, 'After any scripted edit, read the seam back: grep the changed line and check git diff stat.');
  const r = runNode(AUDIT, { args: ['--check', proposal, '--home', home], cwd: project });
  assert.equal(r.code, 0);
  assert.match(r.stdout, /VERDICT: DUPLICATE\/EXTENDS/);
  assert.match(r.stdout, /\[global CLAUDE\.md\] Global > Verify the artifact/);

  writeFileSync(join(project, 'CLAUDE.md'), 'Read `docs/MISSING.md` first.');
  const stale = runNode(AUDIT, { args: ['--stale', '--home', home], cwd: project });
  assert.equal(stale.code, 2);
  assert.match(stale.stdout, /MISSING PATH {3}docs\/MISSING\.md/);
  writeFileSync(join(project, 'CLAUDE.md'), 'Nothing cited.');
  assert.equal(runNode(AUDIT, { args: ['--stale', '--home', home], cwd: project }).code, 0);

  const report = runNode(AUDIT, { args: ['--home', home], cwd: project });
  assert.equal(report.code, 0);
  assert.match(report.stdout, /== Rule stores ==/);
});
