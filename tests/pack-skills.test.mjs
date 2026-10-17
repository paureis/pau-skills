// scripts/pack-skills.mjs: one zip per skill for upload to claude.ai. Each test copies the fixture into a temporary
// git repository, packs from it, and reads the zips back with the small reader below (central directory, local
// headers, inflate, CRC check), so the bytes are checked here and not only by an outside tool.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { repo, runNode, tempDir } from './helpers.mjs';
import { crc32Table, XML_TAG, RESERVED_NAME, MAX_DESCRIPTION, MAX_NAME, MAX_UNCOMPRESSED } from '../scripts/pack-skills.mjs';

const SCRIPT = repo('scripts', 'pack-skills.mjs');
const FIXTURE = repo('tests', 'fixtures', 'pack-skills');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

// A temporary repository holding the fixture, committed once. CI has no git identity, so set one locally.
function makeRepo() {
  const dir = tempDir('pack-skills-repo-');
  cpSync(FIXTURE, dir, { recursive: true });
  git(dir, 'init', '-q');
  git(dir, 'config', 'user.email', 'test@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'commit.gpgsign', 'false');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'fixture');
  return dir;
}

function commitAll(dir, message = 'change') {
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', message);
}

function writeSkill(dir, plugin, name, front, body = '# Body\n') {
  mkdirSync(join(dir, 'skills', plugin, name), { recursive: true });
  writeFileSync(join(dir, 'skills', plugin, name, 'SKILL.md'), `---\n${front}\n---\n\n${body}`);
}

function pack(dir, args, env = {}) {
  const out = tempDir('pack-skills-out-');
  const r = runNode(SCRIPT, { args: ['--root', dir, '--out', out, ...args], env });
  return { ...r, out, zips: existsSync(out) ? readdirSync(out).sort() : [] };
}

// The reader: the end-of-central-directory record, then every central entry and its local header.
function readZip(buf) {
  const eocd = buf.length - 22;
  assert.equal(buf.readUInt32LE(eocd), 0x06054b50, 'end of central directory record at the very end');
  const count = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  let p = buf.readUInt32LE(eocd + 16);
  assert.equal(p + cdSize, eocd, 'the central directory ends where the end record starts');
  const entries = [];
  for (let i = 0; i < count; i++) {
    assert.equal(buf.readUInt32LE(p), 0x02014b50, 'central directory entry signature');
    const madeBy = buf.readUInt16LE(p + 4);
    const method = buf.readUInt16LE(p + 10);
    const crc = buf.readUInt32LE(p + 16);
    const csize = buf.readUInt32LE(p + 20);
    const usize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const external = buf.readUInt32LE(p + 38);
    const offset = buf.readUInt32LE(p + 42);
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
    p += 46 + nameLen + extraLen + commentLen;

    assert.equal(buf.readUInt32LE(offset), 0x04034b50, `${name}: local header signature`);
    assert.equal(buf.readUInt16LE(offset + 8), method, `${name}: same method in both headers`);
    assert.equal(buf.readUInt32LE(offset + 14), crc, `${name}: same CRC in both headers`);
    const localName = buf.toString('utf8', offset + 30, offset + 30 + buf.readUInt16LE(offset + 26));
    assert.equal(localName, name, 'same name in both headers');
    const start = offset + 30 + buf.readUInt16LE(offset + 26) + buf.readUInt16LE(offset + 28);
    const raw = buf.subarray(start, start + csize);
    const data = method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw);
    assert.ok(method === 0 || method === 8, `${name}: stored or deflated`);
    assert.equal(data.length, usize, `${name}: uncompressed size`);
    assert.equal(crc32Table(data), crc, `${name}: CRC matches the content`);
    entries.push({ name, data, mode: external >>> 16, unix: madeBy >> 8 === 3, time: buf.readUInt16LE(offset + 10), date: buf.readUInt16LE(offset + 12) });
  }
  return entries;
}

const files = (entries) => entries.filter((e) => !e.name.endsWith('/'));

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

  test('--all packs every skill and nothing else', () => {
    const r = pack(makeRepo(), ['--all']);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.zips, ['alpha.zip', 'beta.zip']);
  });
});

describe('--since', () => {
  // Base: alpha, beta, gamma and delta in demo. Then: alpha changes, epsilon is added, gamma is deleted, delta moves
  // to the other plugin, and the plugin README changes.
  function history() {
    const dir = makeRepo();
    writeSkill(dir, 'demo', 'gamma', 'name: gamma\ndescription: Deleted later.');
    writeSkill(dir, 'demo', 'delta', 'name: delta\ndescription: Moved to another plugin later.');
    commitAll(dir, 'base');
    const base = git(dir, 'rev-parse', 'HEAD');
    writeFileSync(join(dir, 'skills', 'demo', 'alpha', 'ref', 'deep', 'notes.md'), '# Notes\n\nChanged.\n');
    writeSkill(dir, 'other', 'epsilon', 'name: epsilon\ndescription: Added after the base.');
    rmSync(join(dir, 'skills', 'demo', 'gamma'), { recursive: true });
    mkdirSync(join(dir, 'skills', 'other'), { recursive: true });
    cpSync(join(dir, 'skills', 'demo', 'delta'), join(dir, 'skills', 'other', 'delta'), { recursive: true });
    rmSync(join(dir, 'skills', 'demo', 'delta'), { recursive: true });
    writeFileSync(join(dir, 'skills', 'demo', 'README.md'), '# Demo plugin\n\nChanged.\n');
    commitAll(dir, 'later');
    return { dir, base };
  }

  test('packs the new and changed skills, says which is which, and lists the removed one', () => {
    const { dir, base } = history();
    const r = pack(dir, ['--since', base]);
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(r.zips, ['alpha.zip', 'delta.zip', 'epsilon.zip']);
    assert.match(r.stdout, /alpha\.zip\s+changed\b/);
    assert.match(r.stdout, /delta\.zip\s+changed\b/, 'a skill moved between plugins keeps its name, so it is changed');
    assert.match(r.stdout, /epsilon\.zip\s+new\b/);
    assert.match(r.stdout, /removed\s+gamma\b/);
    assert.doesNotMatch(r.stdout, /beta|README/);
  });

  test('a ref with no skill change after it prints "nothing to pack" and exits 0', () => {
    const { dir } = history();
    const r = pack(dir, ['--since', 'HEAD']);
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /nothing to pack/);
    assert.deepEqual(r.zips, []);
  });

  test('a bad ref is an error', () => {
    const r = pack(makeRepo(), ['--since', 'no-such-ref']);
    assert.notEqual(r.code, 0);
    assert.match(r.stderr, /no-such-ref/);
    assert.deepEqual(r.zips, []);
  });
});

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

  test(`more than ${MAX_UNCOMPRESSED} bytes uncompressed`, () => {
    const dir = makeRepo();
    writeFileSync(join(dir, 'skills', 'demo', 'alpha', 'big.bin'), Buffer.alloc(MAX_UNCOMPRESSED));
    commitAll(dir);
    const r = pack(dir, ['alpha']);
    assert.equal(r.code, 1, r.stdout + r.stderr);
    assert.match(r.stderr, /MB|bytes/);
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
