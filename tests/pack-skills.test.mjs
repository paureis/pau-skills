// scripts/pack-skills.mjs: one zip per skill for upload to claude.ai. Each test copies the fixture into a temporary
// git repository, packs from it, and reads the zips back with the small reader in tests/pack-skills.helpers.mjs (central directory, local
// headers, inflate, CRC check), so the bytes are checked here and not only by an outside tool.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { repo, runNode } from './helpers.mjs';
import { crc32Table, XML_TAG, RESERVED_NAME } from '../scripts/pack-skills.mjs';
import { SCRIPT, FIXTURE, tmp, git, makeRepo, commitAll, pack, readZip, files } from './pack-skills.helpers.mjs';

describe('CRC-32 fallback', () => {
  test('the table CRC gives the check value and matches zlib.crc32 where it exists', () => {
    assert.equal(crc32Table(Buffer.from('123456789')).toString(16), 'cbf43926');
    assert.equal(crc32Table(Buffer.alloc(0)), 0);
    if (typeof zlib.crc32 === 'function') {
      for (const s of ['', 'a', 'hello world', 'x'.repeat(10000), 'ÿ\u0000binary']) {
        assert.equal(crc32Table(Buffer.from(s)), zlib.crc32(Buffer.from(s)), JSON.stringify(s.slice(0, 20)));
      }
    }
  });
});

describe('the upload rules match the checks in the other tests', () => {
  const budget = readFileSync(repo('tests', 'context-budget.test.mjs'), 'utf8');
  const market = readFileSync(repo('tests', 'marketplace.test.mjs'), 'utf8');
  const script = readFileSync(SCRIPT, 'utf8');

  test('the XML-tag and reserved-word regexes are the same text', () => {
    assert.ok(budget.includes(`/${XML_TAG.source}/.test(`), `tests/context-budget.test.mjs no longer uses /${XML_TAG.source}/`);
    assert.equal(XML_TAG.flags, '');
    assert.ok(market.includes(`/${RESERVED_NAME.source}/${RESERVED_NAME.flags}.test(`), `tests/marketplace.test.mjs no longer uses /${RESERVED_NAME.source}/${RESERVED_NAME.flags}`);
  });

  // The description parser is copied from tests/context-budget.test.mjs; a change to one must be made to both.
  const chunk = (text, start) => {
    const at = text.indexOf(start);
    assert.ok(at >= 0, `missing: ${start}`);
    const end = text.indexOf('\n}\n', at);
    return text.slice(at, end < 0 ? undefined : end + 2);
  };
  for (const start of ['const ESCAPES = ', 'const HEX = ', 'function foldBreak(', 'function quoted(', 'function block(',
    'function plain(', 'function parseDescription(']) {
    test(`${start.trim()} is the same in the script and in tests/context-budget.test.mjs`, () => {
      const one = start.startsWith('const') ? script.slice(script.indexOf(start)).split(';\n')[0] : chunk(script, start);
      const two = start.startsWith('const') ? budget.slice(budget.indexOf(start)).split(';\n')[0] : chunk(budget, start);
      assert.equal(one, two);
    });
  }
});

describe('packing named skills', () => {
  test('the zip has the skill folder at its root, every file with its committed bytes, and subfolders', () => {
    const dir = makeRepo();
    const r = pack(dir, ['alpha']);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.zips, ['alpha.zip']);
    const entries = readZip(readFileSync(join(r.out, 'alpha.zip')));
    assert.deepEqual(entries.map((e) => e.name), ['alpha/', 'alpha/SKILL.md', 'alpha/ref/', 'alpha/ref/deep/', 'alpha/ref/deep/notes.md', 'alpha/run.sh']);
    for (const e of files(entries)) {
      assert.deepEqual(e.data, readFileSync(join(dir, 'skills', 'demo', e.name)), e.name);
      assert.ok(e.unix, `${e.name}: made by Unix, so the mode is read`);
    }
    assert.match(r.stdout, /alpha\.zip\s+\S+\s+3 files\s+\d+ bytes/);
  });

  test('a script committed as executable keeps its executable bit, and other files do not get one', () => {
    const dir = makeRepo();
    git(dir, 'update-index', '--chmod=+x', 'skills/demo/alpha/run.sh');
    git(dir, 'commit', '-q', '-m', 'executable');
    const r = pack(dir, ['alpha']);
    assert.equal(r.code, 0, r.stderr);
    const modes = Object.fromEntries(readZip(readFileSync(join(r.out, 'alpha.zip'))).map((e) => [e.name, e.mode]));
    assert.equal(modes['alpha/run.sh'], 0o100755);
    assert.equal(modes['alpha/SKILL.md'], 0o100644);
    assert.equal(modes['alpha/'] & 0o170000, 0o040000, 'a folder entry is a directory');
  });

  test('<plugin>/<skill> is accepted, and several skills give several zips', () => {
    const dir = makeRepo();
    const r = pack(dir, ['demo/alpha', 'beta']);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.zips, ['alpha.zip', 'beta.zip']);
    assert.deepEqual(readZip(readFileSync(join(r.out, 'beta.zip'))).map((e) => e.name), ['beta/', 'beta/SKILL.md']);
    assert.match(r.stdout, /beta\.zip\s+packed\s+1 file\s/);
  });

  test('two runs give identical bytes, whatever the time zone', () => {
    const dir = makeRepo();
    const one = pack(dir, ['alpha'], { TZ: 'UTC' });
    const two = pack(dir, ['alpha'], { TZ: 'Pacific/Kiritimati' });
    assert.equal(one.code, 0, one.stderr);
    assert.deepEqual(readFileSync(join(one.out, 'alpha.zip')), readFileSync(join(two.out, 'alpha.zip')));
  });

  test('the zip holds the committed files, and uncommitted changes in the skill get a warning', () => {
    const dir = makeRepo();
    writeFileSync(join(dir, 'skills', 'demo', 'alpha', 'SKILL.md'), 'not committed\n');
    writeFileSync(join(dir, 'skills', 'demo', 'alpha', 'stray.txt'), 'untracked\n');
    const r = pack(dir, ['alpha']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /WARNING.*uncommitted/);
    const entries = readZip(readFileSync(join(r.out, 'alpha.zip')));
    assert.deepEqual(entries.find((e) => e.name === 'alpha/SKILL.md').data, readFileSync(join(FIXTURE, 'skills', 'demo', 'alpha', 'SKILL.md')));
    assert.ok(!entries.some((e) => e.name.includes('stray')), 'an untracked file is not packed');
    assert.doesNotMatch(pack(dir, ['beta']).stderr, /WARNING/, 'no warning for a clean skill');
  });

  test('without --out the zips go to dist/ in the repository', () => {
    const dir = makeRepo();
    const r = runNode(SCRIPT, { args: ['--root', dir, 'beta'] });
    assert.equal(r.code, 0, r.stderr);
    assert.ok(existsSync(join(dir, 'dist', 'beta.zip')));
  });

  test('unzip -t accepts the zip, when unzip is installed', (t) => {
    if (spawnSync('unzip', ['-v'], { encoding: 'utf8' }).status !== 0) { t.skip('unzip is not on the PATH'); return; }
    const dir = makeRepo();
    git(dir, 'update-index', '--chmod=+x', 'skills/demo/alpha/run.sh');
    git(dir, 'commit', '-q', '-m', 'executable');
    const r = pack(dir, ['alpha']);
    const u = spawnSync('unzip', ['-t', join(r.out, 'alpha.zip')], { encoding: 'utf8' });
    assert.equal(u.status, 0, u.stdout + u.stderr);
    assert.match(u.stdout, /No errors detected/);
  });

  test('an unknown skill is an error, and nothing is written', () => {
    const dir = makeRepo();
    const r = pack(dir, ['alpha', 'nope']);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /nope/);
    assert.deepEqual(r.zips, []);
  });

  test('no skill and no option is a usage error', () => {
    const r = pack(makeRepo(), []);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /Usage/);
  });

  test('--help says what every option does, where the zips go, what each status means and the exit codes', () => {
    const r = runNode(SCRIPT, { args: ['--help'] });
    assert.equal(r.code, 0, r.stderr);
    for (const word of ['--since', '--all', '--out', '--root', 'dist/', 'current folder', 'new', 'changed', 'removed', 'packed', 'Exit', '0 ', '1 ', '2 ']) {
      assert.ok(r.stdout.includes(word), `--help does not mention ${JSON.stringify(word)}:\n${r.stdout}`);
    }
  });

  test('--out naming an existing file is a clear error, not a crash', () => {
    const dir = makeRepo();
    const file = join(tmp('pack-skills-out-'), 'a-file');
    writeFileSync(file, 'x');
    const r = runNode(SCRIPT, { args: ['--root', dir, '--out', file, 'alpha'] });
    assert.equal(r.code, 2, r.stdout + r.stderr);
    assert.match(r.stderr, /--out.*not a folder/);
    assert.doesNotMatch(r.stderr, /\n\s+at /, 'no stack trace');
  });

  test('git variables from the environment (as inside a git hook) do not move the run to another repository', () => {
    const dir = makeRepo();
    const outer = tmp('pack-skills-outer-');
    git(outer, 'init', '-q', '-b', 'main');
    writeFileSync(join(outer, 'other.txt'), 'x\n');
    git(outer, 'add', '-A');
    git(outer, '-c', 'user.email=test@example.com', '-c', 'user.name=Test', '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', 'outer');
    const r = pack(dir, ['alpha'], { GIT_DIR: join(outer, '.git'), GIT_WORK_TREE: outer, GIT_INDEX_FILE: join(outer, '.git', 'index') });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.zips, ['alpha.zip']);
  });

  test('the default dist/ is emptied of old zips first, and says how many', () => {
    const dir = makeRepo();
    mkdirSync(join(dir, 'dist'));
    writeFileSync(join(dir, 'dist', 'old.zip'), 'stale');
    writeFileSync(join(dir, 'dist', 'keep.txt'), 'not a zip');
    const r = runNode(SCRIPT, { args: ['--root', dir, 'beta'] });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(readdirSync(join(dir, 'dist')).sort(), ['beta.zip', 'keep.txt']);
    assert.match(r.stdout, /removed 1 old zip/);
  });

  test('with --out nothing is deleted, but other zips already there get a warning', () => {
    const dir = makeRepo();
    const out = tmp('pack-skills-out-');
    writeFileSync(join(out, 'other.zip'), 'stale');
    const r = runNode(SCRIPT, { args: ['--root', dir, '--out', out, 'beta'] });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(readdirSync(out).sort(), ['beta.zip', 'other.zip']);
    assert.match(r.stderr, /WARNING.*other\.zip/);
    assert.doesNotMatch(pack(dir, ['beta']).stderr, /WARNING/, 'no warning for an empty folder');
  });

  test('HEAD off the default branch gets a warning; on main, or detached at main, it does not', () => {
    const dir = makeRepo();
    assert.doesNotMatch(pack(dir, ['beta']).stderr, /default branch/);
    git(dir, 'checkout', '-q', '--detach');
    assert.doesNotMatch(pack(dir, ['beta']).stderr, /default branch/, 'detached at the tip of main');
    git(dir, 'checkout', '-q', '-b', 'feature');
    writeFileSync(join(dir, 'skills', 'other', 'beta', 'extra.md'), '# Extra\n');
    commitAll(dir);
    const r = pack(dir, ['beta']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /WARNING.*not on the default branch \(main\)/);
  });

  test('a file name that is not ASCII sets the UTF-8 flag (bit 11), and an ASCII one does not', () => {
    const dir = makeRepo();
    writeFileSync(join(dir, 'skills', 'demo', 'alpha', 'caf\u00e9.md'), '# Menu\n');
    commitAll(dir);
    const r = pack(dir, ['alpha']);
    assert.equal(r.code, 0, r.stderr);
    const entries = readZip(readFileSync(join(r.out, 'alpha.zip')));
    assert.equal(entries.find((e) => e.name === 'alpha/caf\u00e9.md').flags & 0x0800, 0x0800);
    assert.equal(entries.find((e) => e.name === 'alpha/SKILL.md').flags & 0x0800, 0);
  });

  test('--all packs every skill and nothing else', () => {
    const r = pack(makeRepo(), ['--all']);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.zips, ['alpha.zip', 'beta.zip']);
  });
});
