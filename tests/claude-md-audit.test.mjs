// The claude-md-audit scanner: finds the instruction files an agent reads, follows @imports one level, measures them,
// and flags near-duplicate rules, references that do not resolve, secret-shaped lines and vague rules. Every
// detector has a control: something that looks similar and must not be flagged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { plugin, runNode, tempDir } from './helpers.mjs';
import {
  estimateTokens, fileStats, splitUnits, bigrams, overlap, findDuplicates, extractImports, extractReferences,
  pathCandidate, checkReferences, parseTargets, findSecrets, mask, findVague, findEmphasis, discoverFiles, scan,
  isPathScoped, sectionsOf, parseArgs, formatText,
} from '../plugins/session-discipline/skills/claude-md-audit/scan.mjs';

const SCAN = plugin('session-discipline', 'skills', 'claude-md-audit', 'scan.mjs');
const put = (root, rel, text = 'x\n') => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); return p; };

test('size: tokens are about four characters each; lines ignore the final newline', () => {
  assert.equal(estimateTokens('abcdefgh'), 2);
  assert.equal(estimateTokens('abcdefghi'), 3);
  assert.deepEqual(fileStats('one\ntwo\n'), { bytes: 8, lines: 2, tokens: 2 });
  assert.deepEqual(fileStats(''), { bytes: 0, lines: 0, tokens: 0 });
  assert.equal(fileStats('caf\u00e9').bytes, 5, 'bytes are UTF-8 bytes, not characters');
});

test('sectionsOf sizes each heading block and ignores # inside code fences', () => {
  const s = sectionsOf('# A\nshort\n```\n# not a heading\n```\n# B\n' + 'x'.repeat(400) + '\n');
  assert.deepEqual(s.map((x) => x.heading), ['A', 'B']);
  assert.ok(s[1].tokens > s[0].tokens);
});

test('splitUnits: bullets with continuations, paragraphs, table rows; skips code, headings and frontmatter', () => {
  const text = [
    '---', 'paths: src/**', '---',
    '# Testing',
    'Run the suite before every commit.',
    'It takes two minutes.',
    '',
    '- Use `pytest -q` for the fast run',
    '  and `pytest` for the full one.',
    '  - nested bullet is its own unit',
    '1. numbered item',
    '```bash',
    '- not a bullet, inside a fence',
    '```',
    '| Command | Purpose |',
    '|---|---|',
    '| `make lint` | lint |',
  ].join('\n');
  const u = splitUnits(text);
  assert.deepEqual(u.map((x) => [x.kind, x.line]), [['paragraph', 5], ['bullet', 8], ['bullet', 10], ['bullet', 11], ['row', 15], ['row', 17]]);
  assert.equal(u[0].text, 'Run the suite before every commit. It takes two minutes.');
  assert.equal(u[1].text, 'Use `pytest -q` for the fast run and `pytest` for the full one.');
  assert.equal(u[1].heading, 'Testing');
  assert.ok(!u.some((x) => /inside a fence|paths:/.test(x.text)));
});

test('overlap: a rule restated inside a longer one scores high; different tools do not collide', () => {
  const a = bigrams('Run the full test suite before pushing any branch to the remote.');
  const b = bigrams('Before opening a pull request, run the full test suite before pushing any branch to the remote, and fix failures.');
  assert.ok(overlap(a, b) >= 0.6, String(overlap(a, b)));
  const npm = bigrams('Run `npm test` before committing changes to the repository.');
  const cargo = bigrams('Run `cargo test` before committing changes to the repository.');
  assert.ok(overlap(npm, cargo) < 1, 'code spans are kept as tokens');
  assert.equal(overlap(new Set(), b), 0);
});

test('findDuplicates: within and across files, with a threshold and an unrelated control', () => {
  const units = [
    { file: 'CLAUDE.md', line: 3, text: 'Never commit directly to the main branch; open a pull request and wait for review.' },
    { file: 'AGENTS.md', line: 9, text: 'Never commit directly to the main branch; open a pull request and wait for review.' },
    { file: 'CLAUDE.md', line: 7, text: 'Database migrations live in the migrations folder and are generated with the ORM command line tool.' },
    { file: 'CLAUDE.md', line: 12, text: 'Short rule.' },
  ];
  const d = findDuplicates(units);
  assert.equal(d.length, 1);
  assert.equal(d[0].exact, true);
  assert.equal(d[0].sameFile, false);
  assert.deepEqual([d[0].a.line, d[0].b.line], [3, 9]);
  assert.equal(findDuplicates(units, { threshold: 1.01 }).length, 0);
});

test('extractImports: path-shaped @refs outside code; not emails, packages or mentions', () => {
  const text = [
    'See @docs/testing.md and @./notes/style.md.',
    'Shared: @~/.claude/shared.md',
    'Mail ops' + '@' + 'example.com, install @types/node, ping @someone.',
    'Inline `@docs/ignored.md` is not an import.',
    '```', '@docs/also-ignored.md', '```',
    '@README.md',
  ].join('\n');
  assert.deepEqual(extractImports(text).map((i) => i.ref), ['docs/testing.md', './notes/style.md', '~/.claude/shared.md', 'README.md']);
});

test('pathCandidate: real paths in, routes, globs, placeholders, URLs and dotted identifiers out', () => {
  assert.deepEqual(pathCandidate('src/app/main.py'), { ref: 'src/app/main.py', strong: true });
  assert.deepEqual(pathCandidate('./scripts/'), { ref: 'scripts', strong: false });
  assert.deepEqual(pathCandidate('pyproject.toml'), { ref: 'pyproject.toml', strong: true, bare: true });
  assert.deepEqual(pathCandidate('Makefile'), { ref: 'Makefile', strong: true, bare: true });
  for (const no of ['/api/users', 'src/**/*.ts', 'src/<module>/index.ts', 'https://example.com/a.md', 'process.env', '.env', 'v1.2.3', 'foo.bar()', 'a b/c.md', '$HOME/x.md']) {
    assert.equal(pathCandidate(no), null, no);
  }
});

test('extractReferences: code spans, prose paths and commands in fences; deduplicated', () => {
  const text = [
    'Entry point is `cmd/server/main.go`; config in config/app.yaml.',
    'Run `npm run lint`, `make test` or `just fmt`. Also `npm test`.',
    'Docs: [guide](docs/guide.md) and https://example.com/docs/page.md',
    '```sh', '$ pnpm run build', 'cat some/output.log', '```',
    'Again `cmd/server/main.go`.',
  ].join('\n');
  const got = extractReferences(text).map((r) => `${r.kind}:${r.ref}`);
  assert.deepEqual(got, ['path:cmd/server/main.go', 'path:config/app.yaml', 'script:lint', 'make:test', 'just:fmt', 'script:test', 'path:docs/guide.md', 'script:build']);
});

test('parseTargets: make targets and just recipes', () => {
  const mk = parseTargets('.PHONY: test lint\nbuild: deps\n\tgo build ./...\nVAR := 1\nfmt lint:\n', 'make');
  assert.ok(['test', 'lint', 'build', 'fmt'].every((t) => mk.has(t)));
  assert.ok(!mk.has('VAR'));
  const just = parseTargets('set shell := ["bash"]\ntest *args:\n  cargo test {{args}}\n@fmt:\n  cargo fmt\n', 'just');
  assert.ok(just.has('test') && just.has('fmt') && !just.has('set'));
});

test('checkReferences: missing paths and commands, with controls that must resolve or be skipped', () => {
  const root = tempDir('cma-refs-');
  put(root, 'src/app.py'); put(root, 'lib/util/helpers.rb'); put(root, 'pkg/README.md');
  const refs = [
    { kind: 'path', ref: 'src/app.py', strong: true },
    { kind: 'path', ref: 'src/gone.py', strong: true },
    { kind: 'path', ref: 'src/old-module', strong: false }, // first segment exists: reported
    { kind: 'path', ref: 'origin/main', strong: false }, // first segment absent: a branch, skipped
    { kind: 'path', ref: 'helpers.rb', strong: true, bare: true }, // exists elsewhere in the tree
    { kind: 'path', ref: 'nowhere.rb', strong: true, bare: true },
    { kind: 'path', ref: 'README.md', strong: true, bare: true }, // relative to the citing file's folder
    { kind: 'script', ref: 'lint' }, { kind: 'script', ref: 'vanished' },
    { kind: 'make', ref: 'test' }, { kind: 'make', ref: 'deploy' },
    { kind: 'just', ref: 'fmt' },
  ];
  const tooling = [{ scripts: { lint: 'eslint .' }, make: new Set(['test']), just: null }];
  const missing = checkReferences(refs, { fileDir: join(root, 'pkg'), root, home: root, tooling, names: new Set(['helpers.rb']) });
  assert.deepEqual(missing.map((m) => `${m.kind}:${m.ref}`), ['path:src/gone.py', 'path:src/old-module', 'path:nowhere.rb', 'script:vanished', 'make:deploy', 'just:fmt']);
  assert.match(missing.at(-1).why, /no justfile/);
});

test('findSecrets: provider tokens, assignments, private keys, emails and phones; placeholders are not flagged', () => {
  // Built at runtime so this file never contains a secret-shaped literal.
  const gh = 'gh' + 'p_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
  const aws = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
  const email = 'jane.doe' + '@' + 'acme-corp.io';
  const text = [
    `Deploy token: ${gh}`,
    `aws key ${aws}`,
    'DB_PASSWORD=hunter2hunter2x9',
    '-----BEGIN RSA ' + 'PRIVATE KEY-----',
    `Ask ${email} for access.`,
    'Call +1 415 555 0134 if the pager fires.',
    'API_KEY=<your-api-key>',
    'token: ${GITHUB_TOKEN}',
    'password = changeme',
    'Write to ops' + '@' + 'example.com for help.',
    'Use version 1.2.3 and port 8080.',
  ].join('\n');
  const got = findSecrets(text);
  assert.deepEqual(got.map((s) => [s.line, s.kind]), [
    [1, 'GitHub token'], [2, 'AWS access key id'], [3, 'assigned password'], [4, 'private key'], [5, 'email address'], [6, 'phone number'],
  ]);
  for (const s of got) assert.ok(!text.split('\n').some((l) => s.preview.length > 8 && l.includes(s.preview)), 'previews are masked');
  assert.equal(mask('abcdefghijklmnop'), 'abcd**********op');
  assert.equal(mask('short'), '*****');
});

test('findVague and findEmphasis: vague wording without anchors; capitals and "again"', () => {
  const units = splitUnits([
    '- Write clean code and follow best practices.',
    '- Be careful with `migrations/`: run `alembic check` first.',
    '- Keep functions under 40 lines.',
    '- NEVER push to main without review.',
    '- Do not edit generated files again; regenerate them.',
    '- This works against the API.',
  ].join('\n')).map((u) => ({ ...u, file: 'CLAUDE.md' }));
  const vague = findVague(units);
  assert.equal(vague.length, 1);
  assert.deepEqual(vague[0].phrases, ['clean code', 'best practices']);
  const emph = findEmphasis(units);
  assert.deepEqual(emph.map((e) => [e.line, e.marker]), [[4, 'NEVER'], [5, 'again']]);
});

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
