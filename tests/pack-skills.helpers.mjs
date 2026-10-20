// Shared setup for tests/pack-skills*.test.mjs: the fixture repository, the packer run, the temporary-folder cleanup and
// the small zip reader (central directory, local headers, inflate, CRC check).
import { after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { cpSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import zlib from 'node:zlib';
import { repo, runNode, tempDir } from './helpers.mjs';
import { crc32Table } from '../scripts/pack-skills.mjs';

const SCRIPT = repo('scripts', 'pack-skills.mjs');
const FIXTURE = repo('tests', 'fixtures', 'pack-skills');

// Every temporary folder a test makes is removed when the file is done, so a run leaves nothing behind.
const made = [];
const tmp = (prefix) => {
  const dir = tempDir(prefix);
  made.push(dir);
  return dir;
};
after(() => { for (const dir of made) rmSync(dir, { recursive: true, force: true }); });

// Git variables that point git at another repository (set, for example, inside a git hook) are cleared for every
// call, here and in the script, so a test can never act on the repository that runs it.
const GIT_ENV = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'];
const cleanEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !GIT_ENV.includes(k)));
const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', env: cleanEnv() }).trim();

// A temporary repository holding the fixture, committed once on main. CI has no git identity, so set one locally.
function makeRepo() {
  const dir = tmp('pack-skills-repo-');
  cpSync(FIXTURE, dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
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
  const out = tmp('pack-skills-out-');
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
    const flags = buf.readUInt16LE(p + 8);
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
    assert.equal(buf.readUInt16LE(offset + 6), flags, `${name}: same flags in both headers`);
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
    entries.push({ name, data, flags, mode: external >>> 16, unix: madeBy >> 8 === 3, time: buf.readUInt16LE(offset + 10), date: buf.readUInt16LE(offset + 12) });
  }
  return entries;
}

const files = (entries) => entries.filter((e) => !e.name.endsWith('/'));

export { SCRIPT, FIXTURE, tmp, cleanEnv, git, makeRepo, commitAll, writeSkill, pack, readZip, files };
