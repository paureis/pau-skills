// The instructions-audit scanner, finding and scanning files: path-scoped rules, which instruction files an agent
// reads, a byte order mark, the whole scan with imports followed one level, and the command line.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { put } from './instructions-audit.helpers.mjs';
import {
  discoverFiles, scan, isPathScoped, parseArgs, formatText, readTooling,
} from '../skills/session-discipline/instructions-audit/scan.mjs';

const SCAN = repo('skills', 'session-discipline', 'instructions-audit', 'scan.mjs');

test('isPathScoped reads paths, globs and applyTo frontmatter keys', () => {
  assert.equal(isPathScoped('---\npaths:\n  - "src/**"\n---\nrule'), true);
  assert.equal(isPathScoped('---\napplyTo: "**/*.cs"\n---\nrule'), true);
  assert.equal(isPathScoped('---\ndescription: x\n---\nrule'), false);
  assert.equal(isPathScoped('no frontmatter'), false);
});

test('discoverFiles: user, project, local, rules, other tools and nested; skips dependency folders', () => {
  const home = tempDir('cma-home-'); const root = tempDir('cma-root-');
  put(home, '.claude/CLAUDE.md', '# Global\n');
  put(root, 'CLAUDE.md'); put(root, 'CLAUDE.local.md'); put(root, 'AGENTS.md'); put(root, '.cursorrules');
  put(root, '.github/copilot-instructions.md'); put(root, '.github/instructions/py.instructions.md');
  put(root, '.claude/rules/always.md', 'Always rule.\n');
  put(root, '.claude/rules/api.md', '---\npaths:\n  - "api/**"\n---\nScoped rule.\n');
  put(root, '.cursor/rules/style.mdc');
  put(root, 'services/api/CLAUDE.md'); put(root, 'services/api/AGENTS.md');
  put(root, 'node_modules/pkg/CLAUDE.md'); put(root, '.venv/lib/CLAUDE.md');
  const got = discoverFiles(root, { home, ancestors: false }).map((f) => [f.path.slice(f.path.startsWith(home) ? home.length : root.length + 1).split('\\').join('/'), f.loads]);
  const map = Object.fromEntries(got);
  assert.equal(map['/.claude/CLAUDE.md'], 'every-session');
  assert.equal(map['CLAUDE.md'], 'every-session');
  assert.equal(map['CLAUDE.local.md'], 'every-session');
  assert.equal(map['AGENTS.md'], 'other-tool');
  assert.equal(map['.claude/rules/always.md'], 'every-session');
  assert.equal(map['.claude/rules/api.md'], 'conditional');
  assert.equal(map['services/api/CLAUDE.md'], 'in-subtree');
  assert.equal(map['services/api/AGENTS.md'], 'other-tool');
  for (const k of ['.cursorrules', '.github/copilot-instructions.md', '.github/instructions/py.instructions.md', '.cursor/rules/style.mdc']) assert.ok(k in map, k);
  assert.ok(!Object.keys(map).some((k) => /node_modules|\.venv/.test(k)));
});

test('discoverFiles: a project below a .claude folder keeps its nested files; its own .claude folder still hides them', () => {
  const home = tempDir('cma-home-'); const root = join(tempDir('cma-outer-'), '.claude', 'proj');
  put(root, 'CLAUDE.md'); put(root, 'services/api/CLAUDE.md'); put(root, '.claude/inner/CLAUDE.md'); put(root, 'services/x/.claude/CLAUDE.md');
  const got = discoverFiles(root, { home, ancestors: false }).map((f) => [f.path.slice(root.length).split('\\').join('/'), f.loads]);
  const map = Object.fromEntries(got);
  assert.equal(map['/CLAUDE.md'], 'every-session');
  assert.equal(map['/services/api/CLAUDE.md'], 'in-subtree');
  assert.ok(!('/.claude/inner/CLAUDE.md' in map), 'a .claude folder inside the project hides its nested files');
  assert.ok(!('/services/x/.claude/CLAUDE.md' in map), 'a deeper .claude folder hides them too');
});

test('a byte order mark does not hide a rules file\'s frontmatter or a package.json script', () => {
  const home = tempDir('cma-home-'); const root = tempDir('cma-root-');
  put(root, '.claude/rules/api.md', '\uFEFF---\npaths:\n  - "api/**"\n---\nScoped rule.\n');
  put(root, 'package.json', '\uFEFF' + JSON.stringify({ scripts: { build: 'tsc' } }));
  const api = discoverFiles(root, { home, ancestors: false }).find((f) => f.path.endsWith('api.md'));
  assert.equal(api.loads, 'conditional');
  assert.deepEqual(readTooling(root).scripts, { build: 'tsc' });
});

test('scan: imports one level deep, totals, duplicates across an import, stale refs, global refs skipped', () => {
  const home = tempDir('cma-home-'); const root = tempDir('cma-root-');
  const rule = '- Run the formatter and the linter before every commit, and never commit generated files.\n';
  put(home, '.claude/CLAUDE.md', '# Global\nSee `some/other-project/file.md`.\n' + rule);
  put(root, 'CLAUDE.md', '# Project\n@docs/agents.md\n@docs/missing.md\nTests: `make test`. Build: `npm run build`.\n' + rule);
  put(root, 'docs/agents.md', '# Shared\nLayout is described in `docs/layout.md`.\n@docs/deeper.md\n');
  put(root, 'docs/deeper.md', 'never read\n');
  put(root, 'package.json', JSON.stringify({ scripts: { build: 'tsc' } }));
  const r = scan(root, { home, ancestors: false });
  const paths = r.files.map((f) => f.path);
  assert.deepEqual(paths, ['~/.claude/CLAUDE.md', 'CLAUDE.md', 'docs/agents.md']);
  assert.deepEqual(r.files[2].importedBy, ['CLAUDE.md']);
  assert.equal(r.files[2].loads, 'every-session');
  assert.equal(r.totals['every-session'].files, 3);
  assert.equal(r.totals['every-session'].tokens, r.files.reduce((n, f) => n + f.tokens, 0));
  assert.ok(r.notes.some((n) => /deeper\.md.*not followed/.test(n)));
  assert.deepEqual(r.missingReferences.map((m) => `${m.file}:${m.kind}:${m.ref}`).sort(), [
    'CLAUDE.md:import:docs/missing.md', 'CLAUDE.md:make:test', 'docs/agents.md:path:docs/layout.md',
  ]);
  assert.equal(r.duplicates.length, 1);
  assert.deepEqual([r.duplicates[0].a.file, r.duplicates[0].b.file], ['~/.claude/CLAUDE.md', 'CLAUDE.md']);
  assert.match(formatText(r), /Near-duplicate rule pairs[\s\S]*1\.00 exact/);

  const withGlobal = scan(root, { home, ancestors: false, globalRefs: true });
  assert.ok(withGlobal.missingReferences.some((m) => m.ref === 'some/other-project/file.md'));
});

test('scan: a CLAUDE.md that imports AGENTS.md promotes it to every-session and counts it once', () => {
  const root = tempDir('cma-root-');
  put(root, 'CLAUDE.md', '@AGENTS.md\n'); put(root, 'AGENTS.md', '# Agents\nUse `uv run pytest`.\n');
  const r = scan(root, { home: null, ancestors: false });
  assert.equal(r.files.length, 2);
  const agents = r.files.find((f) => f.path === 'AGENTS.md');
  assert.equal(agents.loads, 'every-session');
  assert.deepEqual(agents.importedBy, ['CLAUDE.md']);
});

test('parseArgs and the CLI: JSON output, threshold, errors', () => {
  assert.equal(parseArgs(['--threshold', '0.5']).threshold, 0.5);
  assert.throws(() => parseArgs(['--threshold', 'x']), /number/);
  assert.throws(() => parseArgs(['--bogus']), /unknown option/);
  const home = tempDir('cma-home-'); const root = tempDir('cma-root-');
  put(root, 'CLAUDE.md', '# Rules\n- Write clean code.\n- See `docs/gone.md`.\n');
  const j = runNode(SCAN, { args: [root, '--json', '--home', home, '--no-ancestors'] });
  assert.equal(j.code, 0, j.stderr);
  const data = JSON.parse(j.stdout);
  assert.equal(data.files[0].path, 'CLAUDE.md');
  assert.equal(data.vague.length, 1);
  assert.equal(data.missingReferences[0].ref, 'docs/gone.md');
  const t = runNode(SCAN, { args: [root, '--home', home, '--no-ancestors'] });
  assert.equal(t.code, 0);
  assert.match(t.stdout, /== Instruction files under/);
  assert.equal(runNode(SCAN, { args: [join(root, 'nope')] }).code, 1);
  assert.equal(runNode(SCAN, { args: ['--wat'] }).code, 1);
});
