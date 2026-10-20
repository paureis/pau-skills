// scripts/pack-skills.mjs: the upload rules that refuse a zip (name, description, size, symbolic links). The setup is
// in tests/pack-skills.helpers.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { MAX_DESCRIPTION, MAX_NAME, MAX_UNCOMPRESSED, uploadProblems, main } from '../scripts/pack-skills.mjs';
import { FIXTURE, tmp, cleanEnv, git, makeRepo, commitAll, writeSkill, pack } from './pack-skills.helpers.mjs';

describe('upload rules refuse the zip', () => {
  const longName = 'a'.repeat(MAX_NAME + 1);
  const cases = [
    ['an XML-like tag in the description', 'tagged', 'name: tagged\ndescription: Writes .claude/skills/verify-<app>/ for you.', /XML/],
    ['a reserved word in the name', 'claude-helper', 'name: claude-helper\ndescription: Fine.', /reserved/],
    ['"anthropic" in any case', 'my-Anthropic', 'name: my-Anthropic\ndescription: Fine.', /reserved|lowercase/],
    [`a description over ${MAX_DESCRIPTION} characters`, 'wordy', `name: wordy\ndescription: ${'x'.repeat(MAX_DESCRIPTION + 1)}`, /1024|characters/],
    ['an empty description', 'blank', 'name: blank\ndescription: ""', /empty/],
    ['no description', 'nodesc', 'name: nodesc', /empty|description/],
    ['a description that is not valid YAML', 'badyaml', 'name: badyaml\ndescription: has: a colon', /YAML|colon/],
    ['a name that differs from the folder', 'folder', 'name: other-name\ndescription: Fine.', /folder/],
    ['a name with characters other than lowercase letters, digits and hyphens', 'Bad_Name', 'name: Bad_Name\ndescription: Fine.', /lowercase/],
    [`a name over ${MAX_NAME} characters`, longName, `name: ${longName}\ndescription: Fine.`, /64|characters/],
  ];
  for (const [what, name, front, message] of cases) {
    test(what, () => {
      const dir = makeRepo();
      writeSkill(dir, 'demo', name, front);
      commitAll(dir);
      const r = pack(dir, [name]);
      assert.equal(r.code, 1, r.stdout + r.stderr);
      assert.match(r.stderr, message);
      assert.match(r.stderr, new RegExp(name));
      assert.deepEqual(r.zips, []);
    });
  }

  test('the same skill with a valid frontmatter is packed (the cases above fail only on their rule)', () => {
    const dir = makeRepo();
    writeSkill(dir, 'demo', 'tagged', `name: tagged\ndescription: ${'x'.repeat(MAX_DESCRIPTION)}`);
    commitAll(dir);
    const r = pack(dir, ['tagged']);
    assert.equal(r.code, 0, r.stderr);
  });

  test('a folder with no SKILL.md', () => {
    const dir = makeRepo();
    mkdirSync(join(dir, 'skills', 'demo', 'empty'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'demo', 'empty', 'notes.md'), '# Notes\n');
    commitAll(dir);
    const r = pack(dir, ['empty']);
    assert.equal(r.code, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /SKILL\.md/);
    assert.deepEqual(r.zips, []);
  });

  test(`the size rule: under ${MAX_UNCOMPRESSED} bytes uncompressed passes, exactly that many is refused`, () => {
    const skillMd = readFileSync(join(FIXTURE, 'skills', 'demo', 'alpha', 'SKILL.md'));
    const folder = { name: 'alpha', dir: 'skills/demo/alpha', files: [{ rel: 'SKILL.md', mode: '100644', type: 'blob' }, { rel: 'big.bin', mode: '100644', type: 'blob' }] };
    const withTotal = (total) => [{ rel: 'SKILL.md', data: skillMd }, { rel: 'big.bin', data: { length: total - skillMd.length } }];
    assert.deepEqual(uploadProblems(folder, withTotal(MAX_UNCOMPRESSED - 1)), []);
    const problems = uploadProblems(folder, withTotal(MAX_UNCOMPRESSED));
    assert.equal(problems.length, 1);
    assert.match(problems[0], /bytes/);
  });

  test('a skill over the size limit is refused end to end (with a small limit passed in)', () => {
    const dir = makeRepo();
    const out = tmp('pack-skills-out-');
    const said = [];
    const code = main(['--root', dir, '--out', out, 'alpha'], { log: (m) => said.push(m), warn: (m) => said.push(m), maxBytes: 100 });
    assert.equal(code, 1, said.join('\n'));
    assert.match(said.join('\n'), /alpha.*bytes uncompressed/);
    assert.deepEqual(readdirSync(out), []);
  });

  test('a symbolic link in a skill is refused', () => {
    const dir = makeRepo();
    const sha = execFileSync('git', ['hash-object', '-w', '--stdin'], { cwd: dir, input: 'SKILL.md', encoding: 'utf8', env: cleanEnv() }).trim();
    git(dir, 'update-index', '--add', '--cacheinfo', `120000,${sha},skills/demo/alpha/link.md`);
    git(dir, 'commit', '-q', '-m', 'link');
    const r = pack(dir, ['alpha']);
    assert.equal(r.code, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /link\.md.*symbolic link/);
    assert.deepEqual(r.zips, []);
  });

  test('--all refuses every bad skill and writes no zip at all', () => {
    const dir = makeRepo();
    writeSkill(dir, 'demo', 'tagged', 'name: tagged\ndescription: See <app>.');
    commitAll(dir);
    const r = pack(dir, ['--all']);
    assert.equal(r.code, 1);
    assert.match(r.stderr, /tagged/);
    assert.deepEqual(r.zips, []);
  });
});
