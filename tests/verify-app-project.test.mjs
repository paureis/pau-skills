// The verify-app map checker run on real folders in a real git repository, and the bundled template and example.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, readFileSync, readdirSync, cpSync, realpathSync, rmSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { runNode, tempDir } from './helpers.mjs';
import { headings, checkFeature, indexLinks, compareIndex, placeholders, checkMap } from '../skills/verification/verify-app/check-map.mjs';
import { SKILL_DIR, SCRIPT, FEATURE, GOTCHAS, FOUR_HEADINGS, SKILL, G, makeProject, run } from './verify-app.helpers.mjs';

// ---------------------------------------------------------------------------------------------------------------
// Real folders in a real git repository
// ---------------------------------------------------------------------------------------------------------------

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
