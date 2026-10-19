// The verify-app map checker: heading, index and frontmatter rules (pure), the whole check against real folders in a
// real git repository, the bundled template and example, and the two fixture apps the skill is tried on.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { writeFileSync, mkdirSync, readFileSync, readdirSync, cpSync, realpathSync, existsSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import vm from 'node:vm';
import { repo, runNode, tempDir } from './helpers.mjs';
import {
  headings, checkFeature, indexLinks, compareIndex, parseFrontmatter, checkSkill, evidenceFolder, placeholders,
  parseArgs, checkMap, featureFiles,
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

## States

- No screen: an HTTP endpoint, so there is no loading, empty or error screen to show.
`;

const GOTCHAS = '## Gotchas\n\n- Titles are trimmed.\n';

/** A feature with a screen: the three states, each with how to force it and a screenshot. */
const STATES = `## States

- **Loading.** Hold \`GET /api/bookmarks\` with \`page.route\`. Five grey rows show. Screenshot \`$EV/list/01-loading.png\`.
- **Empty.** Answer the request with \`[]\`. The list reads \`No bookmarks yet\`. Screenshot \`$EV/list/02-empty.png\`.
- **Error.** Answer it with status 500. An alert reads \`Could not load bookmarks\`. Screenshot \`$EV/list/03-error.png\`.
`;
const WITH_SCREEN = FEATURE.replace(/## States\n[\s\S]*$/, STATES);

/** FEATURE as maps made before the States heading: the four old headings only. */
const FOUR_HEADINGS = FEATURE.replace(/\n## States\n[\s\S]*$/, '');

const SKILL = `---
name: verify-shelf
description: "Drive the Shelf HTTP service and prove behaviour with evidence. Use when asked to verify Shelf."
---

# Verify Shelf

## Launch

\`\`\`bash
node server.mjs &
\`\`\`

## Doctor

\`\`\`bash
curl -sS "$URL/health"
\`\`\`

## Drive

Run \`curl -sS "$URL/bookmarks"\`.

## Evidence

Evidence folder: \`.verify-evidence/<run-id>/\`

## Cleanup

\`\`\`bash
kill "$PID"
\`\`\`
`;

describe('headings', () => {
  test('reads levels and text, and skips fenced code', () => {
    const h = headings('# T\n\n## A\n```\n## not a heading\n```\n~~~sh\n## nor this\n~~~\n### B ##\n');
    assert.deepEqual(h.map((x) => [x.level, x.text]), [[1, 'T'], [2, 'A'], [3, 'B']]);
  });
});

describe('checkFeature', () => {
  test('a file with the five headings in order, each with content, is clean', () => assert.deepEqual(checkFeature(FEATURE), []));

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

  test('States is required, and its absence names maintain mode as the way to add it', () => {
    const p = checkFeature(FOUR_HEADINGS);
    assert.equal(p.length, 1, p.join('\n'));
    assert.match(p[0], /missing heading "## States"/);
    assert.match(p[0], /maintain mode/);
  });

  test('States comes after Gotchas', () => {
    const text = FOUR_HEADINGS.replace(GOTCHAS, `${STATES}\n${GOTCHAS}`);
    assert.ok(checkFeature(text).some((m) => /order/.test(m) && /Gotchas, States/.test(m)), checkFeature(text).join('\n'));
  });

  test('an empty States section is reported by name', () => {
    const p = checkFeature(`${FOUR_HEADINGS}\n## States\n\n`);
    assert.equal(p.length, 1, p.join('\n'));
    assert.match(p[0], /"## States" is empty/);
  });

  test('a feature with no screen passes with a one-line States body', () => {
    assert.match(FEATURE, /## States\n\n- No screen[^\n]*\n$/);
    assert.deepEqual(checkFeature(FEATURE), []);
  });

  test('a feature with a screen passes with its three states, which the checker does not parse', () => {
    assert.deepEqual(checkFeature(WITH_SCREEN), []);
    assert.deepEqual(checkFeature(WITH_SCREEN.replace(/- \*\*Empty[^\n]*\n/, '')), []);
  });

  test('an extra heading is reported against the five headings', () => {
    assert.ok(checkFeature(`${FEATURE}\n## Notes\n\n- x\n`).some((m) => /five headings/.test(m)));
  });

  test('a States heading with extra words counts', () => {
    assert.deepEqual(checkFeature(FEATURE.replace('## States\n', '## States (no screen)\n')), []);
  });

  test('a heading inside a code block does not count', () => {
    const p = checkFeature(FEATURE.replace(GOTCHAS, '```\n## Gotchas\n```\n'));
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

describe('Markdown details', () => {
  test('a fence closes only on a bare fence of the same character, at least as long', () => {
    // Gotchas comes before States, so the replacement goes where Gotchas was.
    const body = (inner) => FEATURE.replace(GOTCHAS, `${inner}\n`);
    // Each code block hides a "## Gotchas", so the heading must still be missing.
    for (const inner of ['```\n~~~\n## Gotchas\n```', '````\n```\n## Gotchas\n````', '```\n```sh\n## Gotchas\n```']) {
      assert.ok(checkFeature(body(inner)).some((m) => /missing.*Gotchas/.test(m)), inner);
    }
    // A longer closing fence closes, so the heading after it counts.
    assert.deepEqual(checkFeature(body('```\nx\n````\n\n## Gotchas\n\n- y\n')), []);
  });

  test('a file with CRLF line endings and a code block is read like one with LF', () => {
    const text = FEATURE.replace('- Titles are trimmed.\n', '```\ncode\n```\n\n- Titles are trimmed.\n').replace(/\n/g, '\r\n');
    assert.deepEqual(checkFeature(text), []);
  });

  test('Setext headings count', () => {
    const text = FEATURE.replace('# Add a bookmark\n', 'Add a bookmark\n==============\n').replace('## Gotchas\n', 'Gotchas\n-------\n');
    assert.deepEqual(checkFeature(text), []);
    assert.deepEqual(headings('Title\n=====\n\ntext\n\nSub\n---\n').map((h) => [h.level, h.text]), [[1, 'Title'], [2, 'Sub']]);
  });

  test('a "---" after a blank line or a list item is a rule, not a heading', () => {
    assert.deepEqual(headings('text\n\n---\n- item\n---\n'), []);
  });

  test('a third-level heading inside a section is part of the section', () => {
    const text = FEATURE.replace("- `add-ok` saves a link.\n", '### Saving\n\n- `add-ok` saves a link.\n');
    assert.deepEqual(checkFeature(text), []);
  });

  test('frontmatter with a byte order mark or trailing spaces on its fences is read', () => {
    assert.equal(parseFrontmatter(`\uFEFF${SKILL}`).name, 'verify-shelf');
    assert.equal(parseFrontmatter(SKILL.replace('---\n', '---  \n').replace('\n---\n', '\n--- \n')).name, 'verify-shelf');
    assert.equal(parseFrontmatter(SKILL.replace(/\n/g, '\r\n')).name, 'verify-shelf');
  });
});

describe('index links, more forms', () => {
  test('angle brackets, single-quoted titles, reference definitions and percent escapes', () => {
    const text = "- [My](<my feature.md>)\n- [Add](add.md 'Add')\n- [Pay](billing/pay.md \"Pay\")\n- [Sp](two%20words.md)\n\n[ref]: ref.md\n[url]: https://example.com/x.md\n";
    assert.deepEqual(indexLinks(text), ['my feature.md', 'add.md', 'billing/pay.md', 'two words.md', 'ref.md']);
  });

  test('a malformed percent escape does not throw', () => {
    assert.deepEqual(indexLinks('- [x](100%.md)\n'), ['100%.md']);
  });
});

describe('the generated SKILL.md, fill spots', () => {
  test('a leftover template token is reported', () => {
    for (const tok of ['<app>', '<surface>', '<harness>']) {
      const p = checkSkill(SKILL.replace('# Verify Shelf', `# Verify ${tok}`), 'verify-shelf');
      assert.ok(p.some((m) => m.includes(tok)), tok);
    }
  });

  test('a required section with nothing under it is reported', () => {
    const empty = checkSkill(SKILL.replace("Run `curl -sS \"$URL/bookmarks\"`.\n", ''), 'verify-shelf');
    assert.ok(empty.some((m) => /Drive.*empty/.test(m)), empty.join('; '));
  });

  test('Launch, Doctor and Cleanup need a command in a code block, not only prose', () => {
    for (const s of ['Launch', 'Doctor', 'Cleanup']) {
      const re = new RegExp(`(## ${s}\\n\\n)\`\`\`bash\\n[^\`]*\`\`\`\\n`);
      const text = SKILL.replace(re, '$1Do the usual thing.\n');
      assert.notEqual(text, SKILL, s);
      assert.ok(checkSkill(text, 'verify-shelf').some((m) => m.includes(s) && /command/.test(m)), s);
    }
  });

  test('an empty code block is not a command', () => {
    const text = SKILL.replace('```bash\nkill "$PID"\n```', '```bash\n\n```');
    assert.ok(checkSkill(text, 'verify-shelf').some((m) => /Cleanup.*command/.test(m)));
  });
});

describe('featureFiles', () => {
  test('lists .md files in subfolders as relative paths and skips folders, even one named like a file', () => {
    const d = tempDir('verify-app-ff-');
    mkdirSync(join(d, 'billing'));
    mkdirSync(join(d, 'old.md'));
    writeFileSync(join(d, 'README.md'), '#');
    writeFileSync(join(d, 'add.md'), '#');
    writeFileSync(join(d, 'billing', 'pay.md'), '#');
    writeFileSync(join(d, 'old.md', 'inner.md'), '#');
    writeFileSync(join(d, 'notes.txt'), 'x');
    assert.deepEqual(featureFiles(d), ['README.md', 'add.md', 'billing/pay.md', 'old.md/inner.md']);
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

  test('a map with only the four old headings exits 1, names States and says maintain mode adds it', () => {
    const { dir } = makeProject();
    writeFileSync(join(dir, 'features', 'add.md'), FOUR_HEADINGS);
    writeFileSync(join(dir, 'features', 'search.md'), FOUR_HEADINGS.replace('# Add a bookmark', '# Search'));
    const r = run([dir]);
    assert.equal(r.code, 1, r.stdout);
    assert.match(r.stdout, /add\.md: missing heading "## States".*maintain mode/);
    assert.match(r.stdout, /search\.md: missing heading "## States".*maintain mode/);
    assert.match(r.stdout, /2 problem\(s\)/);
  });

  test('an empty States section exits 1 and names the file', () => {
    const { dir } = makeProject();
    writeFileSync(join(dir, 'features', 'search.md'), `${FOUR_HEADINGS}\n## States\n`);
    const r = run([dir]);
    assert.equal(r.code, 1, r.stdout);
    assert.match(r.stdout, /search\.md: "## States" is empty/);
  });

  test('a feature file missing a heading exits 1 and names the file', () => {
    const { dir } = makeProject();
    writeFileSync(join(dir, 'features', 'search.md'), FEATURE.replace(GOTCHAS, ''));
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

  test('a feature in a subfolder that the index links is found', () => {
    const { dir } = makeProject();
    mkdirSync(join(dir, 'features', 'billing'));
    writeFileSync(join(dir, 'features', 'billing', 'pay.md'), FEATURE);
    writeFileSync(join(dir, 'features', 'README.md'), '# Map\n\n- [Add](./add.md)\n- [Search](./search.md)\n- [Pay](billing/pay.md)\n');
    const r = run([dir]);
    assert.equal(r.code, 0, r.stdout);
  });

  test('a feature whose file name needs %20 in the link is found', () => {
    const { dir } = makeProject();
    writeFileSync(join(dir, 'features', 'my feature.md'), FEATURE);
    writeFileSync(join(dir, 'features', 'README.md'), '# Map\n\n- [Add](./add.md)\n- [Search](./search.md)\n- [Mine](my%20feature.md)\n');
    assert.equal(run([dir]).code, 0);
  });

  test('a folder named like a feature file does not crash the checker', () => {
    const { dir } = makeProject();
    mkdirSync(join(dir, 'features', 'old.md'));
    const r = run([dir]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
  });

  test('a malformed percent escape in the index is a problem, not a crash', () => {
    const { dir } = makeProject();
    writeFileSync(join(dir, 'features', 'README.md'), '# Map\n\n- [Add](./add.md)\n- [Search](./search.md)\n- [x](100%.md)\n');
    const r = run([dir]);
    assert.equal(r.code, 1, r.stderr);
    assert.match(r.stdout, /100%\.md/);
    assert.equal(r.stderr, '');
  });

  test('an index with no feature files at all is a problem', () => {
    const { dir } = makeProject();
    rmSync(join(dir, 'features', 'add.md'));
    rmSync(join(dir, 'features', 'search.md'));
    writeFileSync(join(dir, 'features', 'README.md'), '# Map\n');
    const r = run([dir]);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /no feature files/);
  });

  test('the repository root as the evidence folder is a problem', () => {
    const { dir } = makeProject();
    const r = run([dir, '--evidence', '.']);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /repository root/);
  });

  test('an absolute evidence path through a symlink, to a folder not made yet, is checked inside the repository', () => {
    const { root, dir } = makeProject({ ignore: '' });
    const link = join(realpathSync.native(tempDir('verify-app-link-')), 'repo');
    symlinkSync(root, link);
    const r = run([dir, '--evidence', join(link, 'proof', 'later')]);
    assert.equal(r.code, 1, r.stdout);
    assert.match(r.stdout, /proof\/later.*not ignored/);
  });

  test('an existing evidence folder reached through a symlink is checked inside the repository', () => {
    const { root, dir } = makeProject({ ignore: '' });
    mkdirSync(join(root, 'proof'));
    const link = join(realpathSync.native(tempDir('verify-app-link-')), 'repo');
    symlinkSync(root, link);
    const r = run([dir, '--evidence', join(link, 'proof')]);
    assert.equal(r.code, 1, r.stdout);
    assert.match(r.stdout, /proof.*not ignored/);
  });

  test('git missing from PATH is a usage error, not a skipped check', () => {
    const { dir } = makeProject();
    const r = runNode(SCRIPT, { args: [dir], env: { PATH: tempDir('verify-app-nopath-') } });
    assert.equal(r.code, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /git/);
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
    const filled = template.replace(/<app>/g, 'notes').replace(/<surface>/g, 'web UI').replace(/<harness>/g, 'Playwright').replace(/TODO\(verify-app\)/g, 'filled in');
    writeFileSync(join(dir, 'SKILL.md'), filled);
    cpSync(join(SKILL_DIR, 'references', 'feature-map-example'), join(dir, 'features'), { recursive: true });
    const r = run([dir]);
    assert.equal(r.code, 0, r.stdout + r.stderr);
  });

  test('the template with its markers deleted and nothing filled in is not clean', () => {
    const { root } = makeProject();
    const dir = join(root, '.claude', 'skills', 'verify-notes');
    mkdirSync(dir, { recursive: true });
    const template = readFileSync(join(SKILL_DIR, 'templates', 'verify-skill.md'), 'utf8');
    const stripped = template.split('\n').filter((l) => !l.includes('TODO(verify-app)')).join('\n').replace(/verify-<app>/g, 'verify-notes');
    writeFileSync(join(dir, 'SKILL.md'), stripped);
    cpSync(join(SKILL_DIR, 'references', 'feature-map-example'), join(dir, 'features'), { recursive: true });
    const out = JSON.parse(run([dir, '--json']).stdout);
    const msgs = out.problems.map((p) => `${p.file}: ${p.message}`).join('\n');
    assert.match(msgs, /<app>/, 'a leftover <app> is reported');
    for (const s of ['Launch', 'Doctor', 'Cleanup']) assert.match(msgs, new RegExp(`${s}.*(empty|no command)`), `${s} with nothing filled in is reported:\n${msgs}`);
  });

  test('the example map with its States sections taken out fails with the maintain-mode message for each file', () => {
    const { root } = makeProject();
    const dir = join(root, '.claude', 'skills', 'verify-notes');
    mkdirSync(dir, { recursive: true });
    const template = readFileSync(join(SKILL_DIR, 'templates', 'verify-skill.md'), 'utf8');
    writeFileSync(join(dir, 'SKILL.md'), template.replace(/<app>/g, 'notes').replace(/<surface>/g, 'web UI').replace(/<harness>/g, 'Playwright').replace(/TODO\(verify-app\)/g, 'filled in'));
    cpSync(join(SKILL_DIR, 'references', 'feature-map-example'), join(dir, 'features'), { recursive: true });
    const examples = readdirSync(join(dir, 'features')).filter((f) => f.endsWith('.md') && f !== 'README.md');
    for (const f of examples) {
      const p = join(dir, 'features', f);
      const text = readFileSync(p, 'utf8');
      assert.match(text, /\n## States\n/, `${f} has a States section`);
      writeFileSync(p, text.replace(/\n## States\n[\s\S]*$/, '\n'));
    }
    const out = JSON.parse(run([dir, '--json']).stdout);
    assert.deepEqual(out.problems.map((p) => p.file).sort(), examples.map((f) => `features/${f}`).sort());
    for (const p of out.problems) assert.match(p.message, /missing heading "## States".*maintain mode/);
  });

  test('the example map has a feature with no screen, and says so under States', () => {
    const ex = join(SKILL_DIR, 'references', 'feature-map-example');
    const bodies = readdirSync(ex).filter((f) => f.endsWith('.md') && f !== 'README.md')
      .map((f) => readFileSync(join(ex, f), 'utf8').split('\n## States\n')[1] || '');
    assert.ok(bodies.some((b) => /no screen/i.test(b)), 'one example says it has no screen');
    assert.ok(bodies.some((b) => /loading/i.test(b) && /empty/i.test(b) && /error/i.test(b) && /\.png/.test(b)), 'one example has all three states with screenshots');
  });

  test('the feature template has the five headings', () => {
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
// The in-page skeleton helper, run in a stub page: CI has no browser
// ---------------------------------------------------------------------------------------------------------------

const HELPER = readFileSync(join(SKILL_DIR, 'templates', 'measure-boxes.js'), 'utf8');

/**
 * A stub page: elements by selector, swapped between the loading and the loaded state; shifts for the observer.
 * An element is [name, left, top, width, height] in viewport coordinates, or with 'hidden' after them for one that is
 * not rendered (hidden, display: none, a template): it has no client rects and a zero box, as in a browser.
 */
function stubPage({ loading, loaded, shifts = [], types = ['layout-shift', 'paint'], scroll = [0, 0] }) {
  let state = loading;
  const el = (attr, name, b) => {
    const hidden = b[4] === 'hidden';
    const r = hidden ? { left: 0, top: 0, width: 0, height: 0 } : { left: b[0], top: b[1], width: b[2], height: b[3] };
    return { getAttribute: (a) => (a === attr ? name : null), getBoundingClientRect: () => r, getClientRects: () => (hidden ? [] : [r]) };
  };
  const all = (sel) => {
    const [attr, list] = state[sel] || [null, []];
    return list.map(([name, ...b]) => el(attr, name, b));
  };
  class PerformanceObserver {
    static supportedEntryTypes = types;
    constructor(cb) { this.cb = cb; }
    observe() {}
    takeRecords() { return shifts.splice(0); }
  }
  const window = { scrollX: scroll[0], scrollY: scroll[1], innerWidth: 390, innerHeight: 844 };
  const ctx = {
    window, PerformanceObserver, setTimeout, requestAnimationFrame: (f) => setTimeout(f, 0),
    document: {
      querySelectorAll: all,
      querySelector: (sel) => (state[sel] ? { children: all(sel), querySelectorAll: all } : null),
    },
  };
  vm.runInNewContext(HELPER, ctx);
  return { api: window.__verifyBoxes, load: () => { state = loaded; } };
}

/** The helper runs in another realm: copy its results into this one before deepEqual. */
const plain = (x) => JSON.parse(JSON.stringify(x));

const ROWS = (h, gap = 8) => [0, 1, 2].map((i) => ['person-row', 16, 64 + i * (h + gap), 358, h]);

describe('the skeleton helper', () => {
  test('pairs boxes by marker and reports each one off by more than 4 px, with its numbers', async () => {
    const { api, load } = stubPage({
      loading: { '[data-skeleton-for]': ['data-skeleton-for', ROWS(36)] },
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', ROWS(56)] },
      shifts: [{ value: 0.0418, hadRecentInput: false }],
    });
    assert.equal(api.skeleton().length, 3);
    load();
    const r = plain(await api.compare());
    assert.equal(r.pass, false);
    assert.equal(r.mismatches, 3);
    assert.deepEqual(r.pairs.map((p) => p.diff), [{ x: 0, y: 0, width: 0, height: 20 }, { x: 0, y: 20, width: 0, height: 20 }, { x: 0, y: 40, width: 0, height: 20 }]);
    assert.match(r.text, /MISMATCH person-row #3: skeleton x 16, y 152, 358 by 36; real x 16, y 192, 358 by 56; off by y \+40 px, height \+20 px/);
    assert.deepEqual(r.layoutShift, { supported: true, score: 0.0418, entries: 1, mismatch: false });
  });

  test('a box off by exactly 4 px passes and one off by 4.5 px does not', async () => {
    for (const [h, pass] of [[60, true], [60.5, false]]) {
      const { api, load } = stubPage({
        loading: { '[data-skeleton-for]': ['data-skeleton-for', [['card', 0, 0, 100, 56]]] },
        loaded: { '[data-skeleton-name]': ['data-skeleton-name', [['card', 0, 0, 100, h]]] },
      });
      api.skeleton();
      load();
      assert.equal((await api.compare()).pass, pass, `height ${h}`);
    }
  });

  test('a matching skeleton with no layout-shift entries passes', async () => {
    const { api, load } = stubPage({
      loading: { '[data-skeleton-for]': ['data-skeleton-for', ROWS(56)] },
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', ROWS(56)] },
    });
    api.skeleton();
    load();
    const r = plain(await api.compare());
    assert.equal(r.pass, true, r.text);
    assert.equal(r.layoutShift.score, 0);
    assert.match(r.text, /matches the loaded screen/);
  });

  test('a layout-shift score above 0.1 is a mismatch, and shifts after input do not count', async () => {
    const { api, load } = stubPage({
      loading: { '[data-skeleton-for]': ['data-skeleton-for', ROWS(56)] },
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', ROWS(56)] },
      shifts: [{ value: 0.08, hadRecentInput: false }, { value: 0.05, hadRecentInput: false }, { value: 0.5, hadRecentInput: true }],
    });
    api.skeleton();
    load();
    const r = plain(await api.compare());
    assert.equal(r.layoutShift.score, 0.13);
    assert.equal(r.layoutShift.entries, 2);
    assert.equal(r.pass, false);
    assert.match(r.text, /MISMATCH layout-shift score 0\.13/);
  });

  test('a box left without a partner is reported', async () => {
    const { api, load } = stubPage({
      loading: { '[data-skeleton-for]': ['data-skeleton-for', [...ROWS(56), ['avatar', 0, 0, 40, 40]]] },
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', ROWS(56).slice(0, 2)] },
    });
    api.skeleton();
    load();
    const r = plain(await api.compare());
    assert.equal(r.pass, false);
    assert.deepEqual(r.unpaired.map((u) => [u.side, u.name, u.index]).sort(), [['skeleton', 'avatar', 0], ['skeleton', 'person-row', 2]]);
    assert.match(r.text, /UNPAIRED skeleton box avatar #1/);
  });

  test('without markers, boxes pair by document order inside the container', async () => {
    const { api, load } = stubPage({
      loading: { '#people': [null, ROWS(36)] },
      loaded: { '#people': [null, ROWS(56)] },
    });
    api.skeleton({ container: '#people' });
    load();
    const r = plain(await api.compare({ container: '#people' }));
    assert.equal(r.pairs.length, 3);
    assert.equal(r.mismatches, 3);
  });

  test('no box matching the markers or the selector fails, and says to check them', async () => {
    const { api, load } = stubPage({ loading: {}, loaded: {} });
    assert.equal(api.skeleton().length, 0);
    load();
    const r = plain(await api.compare());
    assert.equal(r.pass, false, r.text);
    assert.match(r.text, /no boxes matched: check the markers or the selector/);
    assert.doesNotMatch(r.text, /matches the loaded screen/);
  });

  test('compare() before skeleton() fails with that reason, not with every real box unpaired', async () => {
    const { api, load } = stubPage({
      loading: {},
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', ROWS(56)] },
    });
    load();
    const r = plain(await api.compare());
    assert.equal(r.pass, false);
    assert.match(r.text, /skeleton\(\) was not called/);
    assert.deepEqual(r.unpaired, []);
    assert.doesNotMatch(r.text, /UNPAIRED/);
  });

  test('in container mode, children that are not rendered are skipped, not measured as empty boxes', async () => {
    const { api, load } = stubPage({
      loading: { '#people': [null, [...ROWS(56), ['tpl', 0, 0, 0, 0, 'hidden']]] },
      loaded: { '#people': [null, [['tpl', 0, 0, 0, 0, 'hidden'], ...ROWS(56)]] },
    });
    assert.equal(api.skeleton({ container: '#people' }).length, 3);
    load();
    const r = plain(await api.compare({ container: '#people' }));
    assert.equal(r.pairs.length, 3);
    assert.deepEqual(r.unpaired, []);
    assert.equal(r.pass, true, r.text);
  });

  test('a skeleton with fewer rows than the list says the counts differ, which resizing cannot fix', async () => {
    const five = [0, 1, 2, 3, 4].map((i) => ['person-row', 16, 64 + i * 64, 358, 56]);
    const { api, load } = stubPage({
      loading: { '[data-skeleton-for]': ['data-skeleton-for', ROWS(56)] },
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', five] },
    });
    api.skeleton();
    load();
    const r = plain(await api.compare());
    assert.equal(r.pass, false);
    assert.equal(r.unpaired.length, 2);
    assert.match(r.text, /COUNT person-row: 3 skeleton box\(es\), 5 real: answer the held request with 3 items/);
  });

  test('boxes are in page coordinates: the scroll offset is added', async () => {
    const { api, load } = stubPage({
      loading: { '[data-skeleton-for]': ['data-skeleton-for', ROWS(56)] },
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', ROWS(56)] },
      scroll: [10, 300],
    });
    assert.deepEqual(plain(api.skeleton())[0].box, { x: 26, y: 364, width: 358, height: 56 });
    load();
    const r = plain(await api.compare());
    assert.deepEqual(r.pairs[2].real, { x: 26, y: 492, width: 358, height: 56 });
  });

  test('an engine without layout-shift entries skips the score and says so', async () => {
    const { api, load } = stubPage({
      loading: { '[data-skeleton-for]': ['data-skeleton-for', ROWS(56)] },
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', ROWS(56)] },
      shifts: [{ value: 0.5, hadRecentInput: false }],
      types: ['paint'],
    });
    api.skeleton();
    load();
    const r = plain(await api.compare());
    assert.equal(r.layoutShift.supported, false);
    assert.equal(r.layoutShift.score, null);
    assert.equal(r.pass, true);
    assert.match(r.text, /skipped layout-shift score: .*only Chromium/);
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

  // The web-skeleton fixture's seeded gap, written here and not in the fixture folder, so a cold run that reads the
  // fixture finds the gap by measuring it: a skeleton row (.skeleton-row) is 36 px tall and a real row (.person)
  // 56 px, so each of the three skeleton rows is 20 px short and the section below the list (#below) moves 60 px when
  // the data arrives. Keep the gap in the fixture: a dry run fixes it in a copy and measures again.
  test('the skeleton page starts, serves a skeleton 20 px too short, and its API delays, empties and fails on request', async () => {
    const child = spawn(process.execPath, [join(FIX, 'web-skeleton', 'server.mjs')], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
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
      const page = await (await fetch(`${url}/`)).text();
      assert.match(page, /data-skeleton-for="person-row"/, 'the skeleton rows carry the marker');
      assert.match(page, /data-skeleton-name/, 'the page marks its real rows');
      assert.match(page, /id="below"/, 'content below the list, so a shift can be measured');
      const px = (cls) => Number(new RegExp(`\\.${cls}\\s*\\{[^}]*\\bheight:\\s*(\\d+)px`).exec(page)?.[1]);
      assert.equal(px('person') - px('skeleton-row'), 20, 'the seeded gap: a skeleton row is 20 px shorter than a real row');
      const people = await (await fetch(`${url}/api/people`)).json();
      assert.equal(people.length, 3);
      const t0 = Date.now();
      const slow = await fetch(`${url}/api/people?delay=400`);
      assert.equal(slow.status, 200);
      assert.ok(Date.now() - t0 >= 380, `the delay switch held the answer for ${Date.now() - t0} ms`);
      assert.deepEqual(await (await fetch(`${url}/api/people?data=empty`)).json(), []);
      const failed = await fetch(`${url}/api/people?fail=1`);
      assert.equal(failed.status, 500);
      assert.ok((await failed.json()).error);
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
