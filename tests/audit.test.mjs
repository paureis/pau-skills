// The retrospective's audit: a restated rule scores as a duplicate (the control that made the script switch from
// Jaccard to containment), an unrelated one as new, and --stale finds references to files and scripts that are gone.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import * as audit from '../skills/session-discipline/retrospective/audit.mjs';

const { shingles, containment, verdict, unitsOf, findStale, projectSlug } = audit;
const wordScore = (...a) => audit.wordScore(...a);
const wordVerdict = (...a) => audit.wordVerdict(...a);

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

test('unitsOf splits at headings and bullets, keeps short units marked short, drops empty ones', () => {
  const text = '# Rules\n\nIntro paragraph describing operating rules for agents editing repository files through scripts, shells, hooks, gates and tests.\n' + LONG_RULE + '\n- short bullet\n# Empty\n';
  const units = unitsOf('test', text);
  assert.deepEqual(units.map((u) => !!u.short), [false, false, true]);
  assert.match(units[1].name, /^Rules > Verify the artifact/);
  assert.match(units[2].name, /^Rules > short bullet/);
});

test('wordScore: a short unit scores by the share of its distinct content words, code spans included', () => {
  const bullet = '- Use `pnpm`, never `npm`.\n';
  const dup = wordScore(bullet, 'Install packages with pnpm, not npm: use pnpm everywhere.');
  assert.deepEqual([dup.shared, dup.total], [3, 3]);
  assert.equal(wordVerdict(dup), 'DUPLICATE/EXTENDS');
  // Two shared words of three: related at most, never a duplicate.
  assert.equal(wordVerdict(wordScore(bullet, 'Use pnpm workspaces for the monorepo.')), 'RELATED');
  // Code spans are words here: a different tool in the same sentence shape is new.
  assert.equal(wordVerdict(wordScore(bullet, 'Use `uv` for Python, not `pip`.')), 'NEW');
  const longer = '- Run the linter before every commit to main.\n';
  assert.equal(wordVerdict(wordScore(longer, 'Run the commit hooks in CI as well.')), 'NEW');
  assert.notEqual(wordVerdict(wordScore(longer, 'Run the linter on a pull request.')), 'DUPLICATE/EXTENDS');
});

// A fake home and project: short bullets in both CLAUDE.md files, a synced skill with a manifest beside it, a skill
// that is both local and synced, and a large synced skill that matches a local one.
function fixture() {
  const home = tempDir(); const project = tempDir();
  const synced = join(home, '.claude', 'skills', 'synced', 'abc_123');
  mkdirSync(join(synced, 'deploy-notes'), { recursive: true });
  mkdirSync(join(synced, 'shared-skill'), { recursive: true });
  mkdirSync(join(synced, 'big-copy'), { recursive: true });
  mkdirSync(join(home, '.claude', 'skills', 'shared-skill'), { recursive: true });
  mkdirSync(join(home, '.claude', 'skills', 'local-original'), { recursive: true });
  writeFileSync(join(home, '.claude', 'skills', 'synced', 'stray.json'), '{}');
  writeFileSync(join(synced, 'manifest.json'), '{"skills":[]}');
  writeFileSync(join(home, '.claude', 'CLAUDE.md'), '# Global\n\n' + LONG_RULE + '\n- Use `pnpm`, never `npm`.\n');
  writeFileSync(join(project, 'CLAUDE.md'), '# Project\n\n- Use `pnpm`, never `npm`.\n- Run the linter before every commit to main.\n');
  writeFileSync(join(synced, 'deploy-notes', 'SKILL.md'), '---\nname: deploy-notes\n---\nTag the release, then wait for the canary dashboard to stay green for an hour before promoting the build to every region.\n');
  const shared = '---\nname: shared-skill\n---\nRotate the signing keys every quarter and record the fingerprint of each new key in the security runbook.\n';
  writeFileSync(join(synced, 'shared-skill', 'SKILL.md'), shared);
  writeFileSync(join(home, '.claude', 'skills', 'shared-skill', 'SKILL.md'), shared);
  const big = '---\nname: big\n---\n' + 'Profile the slow query with the planner output before adding any index to the orders table. '.repeat(40);
  writeFileSync(join(synced, 'big-copy', 'SKILL.md'), big);
  writeFileSync(join(home, '.claude', 'skills', 'local-original', 'SKILL.md'), big);
  return { home, project };
}

test('CLI --check: a restated short bullet is a DUPLICATE by word score; a partial overlap is not', () => {
  const { home, project } = fixture();
  const proposal = join(project, 'proposal.md');
  writeFileSync(proposal, 'Install packages with `pnpm`, not `npm`: use pnpm everywhere.\n');
  const r = runNode(AUDIT, { args: ['--check', proposal, '--home', home], cwd: project });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /VERDICT: DUPLICATE\/EXTENDS/);
  assert.match(r.stdout, /1\.000 +\[project CLAUDE\.md\] Project > Use `pnpm`, never `npm`\..*word score/);

  writeFileSync(proposal, 'Run the commit hooks in CI as well.\n');
  const partial = runNode(AUDIT, { args: ['--check', proposal, '--home', home], cwd: project });
  assert.doesNotMatch(partial.stdout, /VERDICT: DUPLICATE/);
  assert.match(partial.stdout, /Run the linter before every commit to main.*word score: 2 of 5/);
});

test('CLI --check: synced skills are scored and labelled; one both local and synced shows once', () => {
  const { home, project } = fixture();
  const proposal = join(project, 'proposal.md');
  writeFileSync(proposal, 'Wait for the canary dashboard to stay green for an hour before promoting the build.\n');
  const r = runNode(AUDIT, { args: ['--check', proposal, '--home', home], cwd: project });
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /\[synced skill\] deploy-notes\/SKILL\.md/);
  assert.match(r.stdout, /VERDICT: DUPLICATE\/EXTENDS/);

  writeFileSync(proposal, 'Rotate the signing keys every quarter and record each fingerprint in the security runbook.\n');
  const both = runNode(AUDIT, { args: ['--check', proposal, '--home', home], cwd: project });
  assert.equal(both.stdout.split('shared-skill/SKILL.md').length - 1, 1, both.stdout);
  assert.match(both.stdout, /\[skill, synced skill\] shared-skill\/SKILL\.md/);
});

test('CLI report: short units and synced skills stay out of the pairs and the largest units; synced counted apart', () => {
  const { home, project } = fixture();
  const r = runNode(AUDIT, { args: ['--home', home], cwd: project });
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /pnpm|linter/);
  assert.doesNotMatch(r.stdout, /big-copy|deploy-notes|\[synced skill\]/);
  assert.doesNotMatch(r.stdout, /shared-skill\/SKILL\.md\n\s*<-> \[[^\]]*\] shared-skill/);
  assert.match(r.stdout, /3 synced skills/);
  assert.match(r.stdout, /local-original\/SKILL\.md/);
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

  // A package.json that starts with a byte order mark still counts its scripts.
  writeFileSync(join(project, 'package.json'), '\uFEFF' + JSON.stringify({ scripts: { build: 'tsc' } }));
  writeFileSync(join(project, 'CLAUDE.md'), 'Build with `npm run build`.');
  const bom = runNode(AUDIT, { args: ['--stale', '--home', home], cwd: project });
  assert.equal(bom.code, 0, bom.stdout);
  writeFileSync(join(project, 'CLAUDE.md'), 'Nothing cited.');

  const report = runNode(AUDIT, { args: ['--home', home], cwd: project });
  assert.equal(report.code, 0);
  assert.match(report.stdout, /== Rule stores ==/);
});
