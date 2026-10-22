// The instructions-audit scanner, the references: @imports, which code spans and prose words are paths, script, make
// and just targets, and the check that reports the ones that do not resolve.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { put } from './instructions-audit.helpers.mjs';
import {
  extractImports, extractReferences, pathCandidate, checkReferences, parseTargets,
} from '../skills/session-discipline/instructions-audit/scan.mjs';

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
