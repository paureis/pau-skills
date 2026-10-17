// The verify-app map checker: heading, index and frontmatter rules (pure), the whole check against real folders in a
// real git repository, the bundled template and example, and the two fixture apps the skill is tried on.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, readdirSync, cpSync, realpathSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { repo, runNode, tempDir } from './helpers.mjs';
import {
  headings, checkFeature, indexLinks, compareIndex, parseFrontmatter, checkSkill, evidenceFolder, placeholders,
  parseArgs, checkMap,
} from '../skills/verification/verify-app/check-map.mjs';

const SKILL_DIR = repo('skills', 'verification', 'verify-app');
const SCRIPT = join(SKILL_DIR, 'check-map.mjs');

const FEATURE = `# Add a bookmark

A user saves a link with a title and finds it again in the list.

## Sub-features

- \`add-ok\` saves a link.

## How to get to it (user's point of view)

- Send a POST to /bookmarks.

## Driving it with curl

- **Add.** Run \`curl -sS -X POST ...\`. The response is 201.

## Gotchas

- Titles are trimmed.
`;

const SKILL = `---
name: verify-shelf
description: "Drive the Shelf HTTP service and prove behaviour with evidence. Use when asked to verify Shelf."
---

# Verify Shelf

## Launch

Run it.

## Doctor

Check it.

## Drive

Drive it.

## Evidence

Evidence folder: \`.verify-evidence/<run-id>/\`

## Cleanup

Stop what you started.
`;

describe('headings', () => {
  test('reads levels and text, and skips fenced code', () => {
    const h = headings('# T\n\n## A\n```\n## not a heading\n```\n~~~sh\n## nor this\n~~~\n### B ##\n');
    assert.deepEqual(h.map((x) => [x.level, x.text]), [[1, 'T'], [2, 'A'], [3, 'B']]);
  });
});

describe('checkFeature', () => {
  test('a file with the four headings in order, each with content, is clean', () => assert.deepEqual(checkFeature(FEATURE), []));

  test('accepts the upstream spellings of the headings and any harness name', () => {
    const text = FEATURE.replace("(user's point of view)", '(user POV)').replace('with curl', 'with tmux');
    assert.deepEqual(checkFeature(text), []);
  });

  test('a missing heading is named', () => {
    const p = checkFeature(FEATURE.replace('## Gotchas\n\n- Titles are trimmed.\n', ''));
    assert.equal(p.length, 1);
    assert.match(p[0], /missing.*Gotchas/);
  });

  test('headings out of order are reported', () => {
    const swapped = FEATURE.replace('## Sub-features', '## TMP').replace('## Gotchas', '## Sub-features').replace('## TMP', '## Gotchas');
    assert.ok(checkFeature(swapped).some((m) => /order/.test(m)));
  });

  test('a duplicate heading is reported', () => {
    assert.ok(checkFeature(`${FEATURE}\n## Gotchas\n\n- again\n`).some((m) => /twice|more than once/.test(m)));
  });

  test('an extra second-level heading is reported', () => {
    assert.ok(checkFeature(`${FEATURE}\n## Notes\n\n- x\n`).some((m) => /Notes/.test(m)));
  });

  test('an empty section is reported', () => {
    const p = checkFeature(FEATURE.replace("- Send a POST to /bookmarks.\n", ''));
    assert.ok(p.some((m) => /How to get to it.*empty/.test(m)), p.join('\n'));
  });

  test('a heading inside a code block does not count', () => {
    const p = checkFeature(FEATURE.replace('## Gotchas\n\n- Titles are trimmed.\n', '```\n## Gotchas\n```\n'));
    assert.ok(p.some((m) => /missing.*Gotchas/.test(m)));
  });
});

describe('index', () => {
  test('indexLinks keeps local Markdown links and drops URLs, anchors, code and links outside the folder', () => {
    const text = [
      '- [Add](./add.md) and [Search](search.md#top)',
      '- [Docs](https://example.com/x.md) [Here](#features) [Skill](../SKILL.md) [Img](shot.png)',
      '```', '[Hidden](hidden.md)', '```', '`[Inline](inline.md)`',
    ].join('\n');
    assert.deepEqual(indexLinks(text), ['add.md', 'search.md']);
  });

  test('compareIndex reports dead links, unlisted files and duplicates, and ignores README.md', () => {
    const r = compareIndex(['add.md', 'gone.md', 'add.md', 'README.md'], ['README.md', 'add.md', 'search.md']);
    assert.deepEqual(r, { dead: ['gone.md'], unlisted: ['search.md'], duplicate: ['add.md'] });
  });

  test('a matching index is clean', () => {
    assert.deepEqual(compareIndex(['a.md', 'b.md'], ['b.md', 'a.md', 'README.md']), { dead: [], unlisted: [], duplicate: [] });
  });
});

describe('the generated SKILL.md', () => {
  test('parseFrontmatter reads name and description, quoted or not', () => {
    assert.deepEqual(parseFrontmatter(SKILL), { name: 'verify-shelf', description: 'Drive the Shelf HTTP service and prove behaviour with evidence. Use when asked to verify Shelf.' });
    assert.equal(parseFrontmatter('# no frontmatter\n'), null);
  });

  test('a complete file is clean', () => assert.deepEqual(checkSkill(SKILL, 'verify-shelf'), []));

  test('no frontmatter means the skill never registers', () => {
    assert.ok(checkSkill(SKILL.replace(/^---[\s\S]*?---\n/, ''), 'verify-shelf').some((m) => /frontmatter/.test(m)));
  });

  test('a name that is not the folder name is reported', () => {
    assert.ok(checkSkill(SKILL, 'verify-other').some((m) => /name/.test(m)));
  });

  test('a missing description is reported', () => {
    assert.ok(checkSkill(SKILL.replace(/description:.*\n/, ''), 'verify-shelf').some((m) => /description/.test(m)));
  });

  test('each of the five sections is required', () => {
    for (const s of ['Launch', 'Doctor', 'Drive', 'Evidence', 'Cleanup']) {
      const p = checkSkill(SKILL.replace(`## ${s}\n`, `## Other ${s.toLowerCase()}\n`), 'verify-shelf');
      assert.ok(p.some((m) => m.includes(s)), `${s}: ${p.join('; ')}`);
    }
  });

  test('evidenceFolder takes the fixed part of the named path', () => {
    assert.equal(evidenceFolder(SKILL), '.verify-evidence');
    assert.equal(evidenceFolder('Evidence folder: `artifacts/verify/$RUN_ID`'), 'artifacts/verify');
    assert.equal(evidenceFolder('Evidence folder: `./proof/`'), 'proof');
    assert.equal(evidenceFolder('Evidence goes somewhere'), null);
    assert.equal(evidenceFolder('Evidence folder: `<run-id>`'), null);
  });

  test('a SKILL.md that names no evidence folder is reported', () => {
    assert.ok(checkSkill(SKILL.replace(/Evidence folder:.*\n/, 'Keep proof.\n'), 'verify-shelf').some((m) => /Evidence folder/.test(m)));
  });

  test('placeholders lists the lines still marked TODO(verify-app)', () => {
    assert.deepEqual(placeholders('a\nTODO(verify-app): the port\nb\nx TODO(verify-app)\n'), [2, 4]);
  });
});

describe('parseArgs', () => {
  test('a folder, --evidence and --json', () => {
    assert.deepEqual(parseArgs(['dir', '--evidence', 'proof', '--json']).opts, { dir: 'dir', evidence: 'proof', json: true });
  });
  test('usage errors', () => {
    assert.ok(parseArgs(['--nope']).error);
    assert.ok(parseArgs(['--evidence']).error);
    assert.ok(parseArgs(['a', 'b']).error);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Real folders in a real git repository
// ---------------------------------------------------------------------------------------------------------------

const G = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** A git repository with a clean verify skill at .claude/skills/verify-shelf. Returns { root, dir }. */
function makeProject({ ignore = '.verify-evidence/\n' } = {}) {
  const root = realpathSync.native(tempDir('verify-app-'));
  G(root, 'init', '-q');
  for (const [k, v] of [['user.name', 'Test'], ['user.email', 'test@example.com'], ['commit.gpgsign', 'false']]) G(root, 'config', k, v);
  if (ignore !== null) writeFileSync(join(root, '.gitignore'), ignore);
  const dir = join(root, '.claude', 'skills', 'verify-shelf');
  mkdirSync(join(dir, 'features'), { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), SKILL);
  writeFileSync(join(dir, 'features', 'README.md'), '# Shelf map\n\n## Features\n\n- [Add a bookmark](./add.md)\n- [Search](./search.md)\n');
  writeFileSync(join(dir, 'features', 'add.md'), FEATURE);
  writeFileSync(join(dir, 'features', 'search.md'), FEATURE.replace('# Add a bookmark', '# Search'));
  return { root, dir };
}

const run = (args, cwd) => runNode(SCRIPT, { args, cwd });

describe('check-map.mjs on a real project', () => {
  test('a clean map exits 0', () => {
    const { dir } = makeProject();
    const r = run([dir]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /clean/i);
  });

  test('with no folder argument it finds the only .claude/skills/verify-* folder', () => {
    const { root } = makeProject();
    const r = run([], root);
    assert.equal(r.code, 0, r.stdout + r.stderr);
  });

  test('two verify-* folders and no argument is a usage error that lists both', () => {
    const { root } = makeProject();
    mkdirSync(join(root, '.claude', 'skills', 'verify-other'), { recursive: true });
    const r = run([], root);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /verify-other/);
    assert.match(r.stderr, /verify-shelf/);
  });

  test('a folder that does not exist, or has no SKILL.md, is a usage error', () => {
    const { root } = makeProject();
    assert.equal(run([join(root, 'nope')]).code, 2);
    mkdirSync(join(root, 'empty'));
    assert.equal(run([join(root, 'empty')]).code, 2);
  });

  test('a feature file missing a heading exits 1 and names the file', () => {
    const { dir } = makeProject();
    writeFileSync(join(dir, 'features', 'search.md'), FEATURE.replace('## Gotchas\n\n- Titles are trimmed.\n', ''));
    const r = run([dir]);
    assert.equal(r.code, 1, r.stdout);
    assert.match(r.stdout, /search\.md.*Gotchas/);
  });

  test('a feature file on disk that the index does not list exits 1', () => {
    const { dir } = makeProject();
    writeFileSync(join(dir, 'features', 'export.md'), FEATURE);
    const r = run([dir]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /export\.md/);
  });

  test('an index entry with no file exits 1', () => {
    const { dir } = makeProject();
    writeFileSync(join(dir, 'features', 'README.md'), '# Map\n\n- [Add](./add.md)\n- [Search](./search.md)\n- [Gone](./gone.md)\n');
    const r = run([dir]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /gone\.md/);
  });

  test('a missing features/README.md exits 1', () => {
    const { dir } = makeProject();
    rmSync(join(dir, 'features', 'README.md'));
    const r = run([dir]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /README\.md/);
  });

  test('an evidence folder git does not ignore exits 1', () => {
    const { dir } = makeProject({ ignore: 'node_modules/\n' });
    const r = run([dir]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /\.verify-evidence.*not ignored/);
  });

  test('a tracked file inside the evidence folder exits 1, even when the folder is ignored now', () => {
    const { root, dir } = makeProject({ ignore: null });
    mkdirSync(join(root, '.verify-evidence'));
    writeFileSync(join(root, '.verify-evidence', 'old.txt'), 'x');
    G(root, 'add', '.verify-evidence/old.txt');
    writeFileSync(join(root, '.gitignore'), '.verify-evidence/\n');
    const r = run([dir]);
    assert.equal(r.code, 1, r.stdout);
    assert.match(r.stdout, /tracked/);
  });

  test('--evidence overrides the folder named in SKILL.md', () => {
    const { dir } = makeProject({ ignore: 'proof/\n' });
    assert.equal(run([dir]).code, 1);
    assert.equal(run([dir, '--evidence', 'proof']).code, 0);
  });

  test('an evidence folder outside the repository is a note, not a problem', () => {
    const { dir } = makeProject({ ignore: '' });
    const outside = realpathSync.native(tempDir('verify-evidence-'));
    const r = run([dir, '--evidence', outside, '--json']);
    assert.equal(r.code, 0, r.stdout);
    const out = JSON.parse(r.stdout);
    assert.deepEqual(out.problems, []);
    assert.ok(out.notes.some((n) => /outside the repository/.test(n)));
  });

  test('a leftover TODO(verify-app) marker exits 1 with its line', () => {
    const { dir } = makeProject();
    writeFileSync(join(dir, 'features', 'add.md'), FEATURE.replace('Titles are trimmed.', 'TODO(verify-app): a trap'));
    const r = run([dir]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /add\.md:\d+/);
  });

  test('--json reports every problem with its file', () => {
    const { dir } = makeProject({ ignore: '' });
    writeFileSync(join(dir, 'features', 'extra.md'), '# Extra\n');
    const out = JSON.parse(run([dir, '--json']).stdout);
    const files = out.problems.map((p) => p.file);
    assert.ok(files.includes('features/extra.md'));
    assert.ok(files.includes('SKILL.md') || files.includes('.gitignore'));
  });

  test('checkMap returns the same result as the command', () => {
    const { dir } = makeProject();
    assert.deepEqual(checkMap(dir).problems, []);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// What the skill ships
// ---------------------------------------------------------------------------------------------------------------

describe('the bundled template and example', () => {
  test('the template filled in, with the example map, passes the checker', () => {
    const { root } = makeProject();
    const dir = join(root, '.claude', 'skills', 'verify-notes');
    mkdirSync(dir, { recursive: true });
    const template = readFileSync(join(SKILL_DIR, 'templates', 'verify-skill.md'), 'utf8');
    assert.ok(placeholders(template).length > 0, 'the template marks what to fill in');
    const filled = template.replace(/verify-<app>/g, 'verify-notes').replace(/TODO\(verify-app\)/g, 'filled in');
    writeFileSync(join(dir, 'SKILL.md'), filled);
    cpSync(join(SKILL_DIR, 'references', 'feature-map-example'), join(dir, 'features'), { recursive: true });
    const r = run([dir]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
  });

  test('the feature template has the four headings', () => {
    const text = readFileSync(join(SKILL_DIR, 'templates', 'feature.md'), 'utf8').replace(/TODO\(verify-app\)/g, 'filled in');
    assert.deepEqual(checkFeature(text), []);
  });

  test('every example feature file is listed in the example index', () => {
    const ex = join(SKILL_DIR, 'references', 'feature-map-example');
    const files = readdirSync(ex).filter((f) => f.endsWith('.md'));
    const links = indexLinks(readFileSync(join(ex, 'README.md'), 'utf8'));
    assert.deepEqual(compareIndex(links, files), { dead: [], unlisted: [], duplicate: [] });
    assert.ok(files.length >= 3);
  });
});

// ---------------------------------------------------------------------------------------------------------------
// The fixture apps the skill is tried on: they must keep working, or the dry run cannot be repeated
// ---------------------------------------------------------------------------------------------------------------

const FIX = repo('tests', 'fixtures', 'verify-app');

describe('fixture apps', () => {
  test('the HTTP server starts on a free port, reports its data folder, stores a bookmark and stops on SIGTERM', async () => {
    const data = tempDir('verify-app-data-');
    const child = spawn(process.execPath, [join(FIX, 'http-server', 'server.mjs')], { env: { ...process.env, PORT: '0', DATA_DIR: data }, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      let out = '';
      const url = await new Promise((resolveUrl, reject) => {
        const t = setTimeout(() => reject(new Error(`no ready line: ${out}`)), 5000);
        child.stdout.on('data', (d) => {
          out += d;
          const m = /ready on (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
          if (m) { clearTimeout(t); resolveUrl(m[1]); }
        });
      });
      const health = await (await fetch(`${url}/health`)).json();
      assert.equal(health.app, 'bookmarks');
      assert.equal(health.dataDir, data);
      assert.equal(health.pid, child.pid);
      const created = await fetch(`${url}/bookmarks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/a', title: '  A  ' }) });
      assert.equal(created.status, 201);
      assert.equal((await created.json()).title, 'A');
      const dup = await fetch(`${url}/bookmarks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/a', title: 'B' }) });
      assert.equal(dup.status, 409);
      const list = await (await fetch(`${url}/bookmarks`)).json();
      assert.equal(list.length, 1);
      assert.ok(existsSync(join(data, 'bookmarks.json')));
    } finally {
      child.kill('SIGTERM');
    }
    const [code] = await once(child, 'exit');
    assert.equal(code, 0);
  });

  test('the CLI adds, lists and completes items in the file it is given', () => {
    const file = join(tempDir('verify-app-cli-'), 'todo.json');
    const cli = join(FIX, 'cli', 'todo.mjs');
    const env = { TODO_FILE: file };
    assert.equal(runNode(cli, { args: ['add', 'buy', 'milk'], env }).code, 0);
    const list = runNode(cli, { args: ['list', '--json'], env });
    assert.equal(list.code, 0);
    const items = JSON.parse(list.stdout);
    assert.deepEqual(items.map((i) => [i.text, i.done]), [['buy milk', false]]);
    assert.equal(runNode(cli, { args: ['done', String(items[0].id)], env }).code, 0);
    assert.equal(JSON.parse(runNode(cli, { args: ['list', '--json'], env }).stdout)[0].done, true);
    assert.equal(runNode(cli, { args: ['done', '99'], env }).code, 1);
    assert.equal(runNode(cli, { args: ['frobnicate'], env }).code, 2);
  });
});
