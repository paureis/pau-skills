#!/usr/bin/env node
// Pack skills as zips for upload to a claude.ai account (Customize, Skills, Upload a skill): one zip per skill, with
// the skill's folder at the zip root (<name>/SKILL.md and every bundled file, subfolders included).
//
//   node scripts/pack-skills.mjs <skill> [<skill>...]   pack the named skills (<skill> or <plugin>/<skill>)
//   node scripts/pack-skills.mjs --since <git ref>      pack every skill with a committed change between <ref> and HEAD
//   node scripts/pack-skills.mjs --all                  pack every skill
//   options: --out <dir> (default: dist/ in the repository), --root <dir> (default: the repository this script is in)
//
// What goes in: the files committed at HEAD, read with `git ls-tree` and `git cat-file`, never the files on disk. So
// the zip is exactly what was reviewed and merged, untracked files (editor backups, test output) never leak in, and
// the executable bit comes from git, which keeps it on every platform (Windows cannot show it through the file
// system). Uncommitted changes inside a skill being packed get a loud warning, because they are not in the zip.
//
// --since says for each skill whether it is new (no skill of that name had a SKILL.md at the ref) or changed (it
// replaces a skill already uploaded; claude.ai knows skills by name, so a skill moved between plugins is changed). A
// skill that existed at the ref and is gone now is listed as removed: delete it on claude.ai by hand. Files directly
// under skills/<plugin>/, such as the plugin README.md, are not skills.
//
// Before writing anything, every skill is checked against the upload rules, and if one fails nothing is written. The
// rules are from the platform docs (Agent Skills overview, and "Using Agent Skills with the API"):
// - name: at most 64 characters, lowercase letters, digits and hyphens only, no XML tags, no "anthropic" or "claude";
//   and it equals the folder name, which claude.ai also asks for.
// - description: non-empty, at most 1,024 characters, no XML tags. The claude.ai help center says 200 characters, but
//   that limit is not enforced (every skill here is longer and uploads), so it is not checked.
// - one top-level folder holding SKILL.md; total size under 30 MB uncompressed.
// The XML-tag and reserved-word regexes and the description parser are copied from tests/context-budget.test.mjs and
// tests/marketplace.test.mjs; tests/pack-skills.test.mjs fails if the copies drift apart.
//
// The zip is written by hand (deflate from node:zlib, a small central directory), so the same commit always gives the
// same bytes: entries are sorted, and every timestamp is the time of the last commit that touched the skill, in UTC.
//
// Exit: 0 packed (or nothing to pack), 1 an upload rule failed, 2 usage error, unknown skill or bad ref.
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

export const XML_TAG = /<[A-Za-z/!?]/;
export const RESERVED_NAME = /claude|anthropic/i;
export const NAME_CHARS = /^[a-z0-9-]+$/;
export const MAX_NAME = 64;
export const MAX_DESCRIPTION = 1024;
// "Under 30 MB": read as decimal megabytes, the smaller reading, so a zip that passes here passes there.
export const MAX_UNCOMPRESSED = 30 * 1000 * 1000;

// The description parser below is copied unchanged from tests/context-budget.test.mjs (keep both the same).
const ESCAPES = { 0: '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ',
  '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0', L: ' ', P: ' ' };
const HEX = { x: 2, u: 4, U: 8 };

// A line break inside a quoted value folds to a space; blank lines in between become that many newlines.
function foldBreak(raw, i) {
  let breaks = 0;
  for (;;) {
    while (raw[i] === ' ' || raw[i] === '\t') i++;
    if (raw[i] !== '\n') return { i, text: breaks ? '\n'.repeat(breaks) : ' ' };
    breaks++;
    i++;
  }
}

// raw starts just after the opening quote. Returns the value and the rest of the line after the closing quote.
function quoted(raw, quote) {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === quote && quote === "'" && raw[i + 1] === "'") { out += "'"; i += 2; continue; }
    if (c === quote) return { value: out, rest: raw.slice(i + 1).split('\n')[0] };
    if (c === '\\' && quote === '"') {
      const n = raw[i + 1];
      if (n === '\n') { i += 2; while (raw[i] === ' ' || raw[i] === '\t') i++; continue; }
      if (n in HEX) {
        const hex = raw.slice(i + 2, i + 2 + HEX[n]);
        if (!new RegExp(`^[0-9a-fA-F]{${HEX[n]}}$`).test(hex)) throw new Error(`bad \\${n} escape`);
        out += String.fromCodePoint(parseInt(hex, 16));
        i += 2 + HEX[n];
        continue;
      }
      if (!(n in ESCAPES)) throw new Error(`unknown escape \\${n}`);
      out += ESCAPES[n];
      i += 2;
      continue;
    }
    if (c === '\n') {
      out = out.replace(/[ \t]+$/, '');
      const f = foldBreak(raw, i + 1);
      out += f.text;
      i = f.i;
      continue;
    }
    out += c;
    i++;
  }
  throw new Error(`a ${quote === '"' ? 'double' : 'single'}-quoted value is never closed`);
}

// The lines of a `>` or `|` block, folded or kept, then chomped by the header's `-` (strip), `+` (keep) or neither.
function block(header, lines) {
  const m = /^([|>])([1-9]?)([+-]?)([1-9]?)\s*(#.*)?$/.exec(header);
  if (!m) throw new Error(`bad block header ${JSON.stringify(header)}`);
  const explicit = Number(m[2] || m[4]) || 0;
  const chomp = m[3];
  const first = lines.find((l) => l.trim());
  const indent = explicit || (first ? /^ */.exec(first)[0].length : 0);
  const body = lines.map((l) => (l.trim() ? l.slice(indent) : ''));
  let trailing = 0;
  while (body.length && body[body.length - 1] === '') { body.pop(); trailing++; }
  if (!body.length) return '';
  let out = '';
  if (m[1] === '|') out = body.join('\n');
  else {
    let pending = 0;
    let prevNormal = false;
    body.forEach((l, k) => {
      if (l === '') { pending++; return; }
      const normal = !/^\s/.test(l);
      if (k - pending > 0) out += prevNormal && normal ? (pending ? '\n'.repeat(pending) : ' ') : '\n'.repeat(pending + 1);
      else out += '\n'.repeat(pending);
      out += l;
      prevNormal = normal;
      pending = 0;
    });
  }
  if (chomp === '-') return out;
  return chomp === '+' ? out + '\n'.repeat(trailing + 1) : out + '\n';
}

// A plain value: the first line and any indented continuation lines, folded with spaces, up to a comment.
function plain(first, more) {
  const parts = [];
  for (const [k, raw] of [first, ...more].entries()) {
    const line = raw.trim();
    if (k > 0 && line.startsWith('#')) break;
    const text = line.replace(/(^|\s+)#.*$/, '');
    if (k === 0 && /^([[\]{}&*!%@`]|- |-$)/.test(text)) throw new Error(`a plain value cannot start with ${JSON.stringify(text[0])}`);
    if (/: |:$/.test(text)) throw new Error('a plain value cannot contain ": " (quote it)');
    parts.push(text);
    if (text !== line) break;
  }
  while (parts.length && parts[parts.length - 1] === '') parts.pop();
  let out = '';
  let pending = 0;
  parts.forEach((p, k) => {
    if (p === '') { pending++; return; }
    if (out) out += pending ? '\n'.repeat(pending) : ' ';
    out += p;
    pending = 0;
  });
  return out;
}

function parseDescription(front) {
  try {
    const at = front.map((l, i) => (/^description:(\s|$)/.test(l) ? i : -1)).filter((i) => i >= 0);
    if (!at.length) return { value: '' };
    if (at.length > 1) throw new Error('more than one description key');
    const head = front[at[0]].slice('description:'.length).trim();
    let end = at[0] + 1;
    while (end < front.length && (!front[end].trim() || /^\s/.test(front[end]))) end++;
    const more = front.slice(at[0] + 1, end);
    if (head.startsWith('"') || head.startsWith("'")) {
      const raw = [front[at[0]].slice(front[at[0]].indexOf(head[0]) + 1), ...front.slice(at[0] + 1)].join('\n');
      const { value, rest } = quoted(raw, head[0]);
      if (!/^([ \t]+#.*)?[ \t]*$/.test(rest)) throw new Error(`text after the closing quote: ${JSON.stringify(rest.trim())}`);
      return { value };
    }
    if (head.startsWith('|') || head.startsWith('>')) return { value: block(head, more) };
    return { value: plain(head, more) };
  } catch (e) {
    return { error: e.message };
  }
}

// CRC-32 (the zip polynomial). zlib.crc32 exists only from Node 20.15 and 22.2, and this repository supports Node 20+.
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

export function crc32Table(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const crc32 = typeof zlib.crc32 === 'function' ? (buf) => zlib.crc32(buf) >>> 0 : crc32Table;

// MS-DOS date and time, from UTC so the bytes do not depend on the time zone. Zip times start in 1980.
function dosTime(seconds) {
  const d = new Date(Math.max(seconds, 315532800) * 1000);
  return {
    time: (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1),
    date: ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate(),
  };
}

/**
 * A zip of `files` ([{ path, mode, data }], paths relative to the zip root, mode as a Unix file mode) with a folder
 * entry for every folder, sorted by path, every entry stamped with `seconds` (Unix time).
 */
export function buildZip(files, seconds) {
  const { time, date } = dosTime(seconds);
  const folders = new Set();
  for (const f of files) {
    const parts = f.path.split('/');
    for (let i = 1; i < parts.length; i++) folders.add(`${parts.slice(0, i).join('/')}/`);
  }
  const entries = [
    ...[...folders].map((path) => ({ path, mode: 0o040755, data: Buffer.alloc(0), folder: true })),
    ...files.map((f) => ({ ...f, folder: false })),
  ].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));

  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.path, 'utf8');
    const flags = /[^\x00-\x7f]/.test(e.path) ? 0x0800 : 0; // bit 11: the name is UTF-8
    const deflated = e.folder ? e.data : zlib.deflateRawSync(e.data, { level: 9 });
    const method = !e.folder && deflated.length < e.data.length ? 8 : 0;
    const body = method === 8 ? deflated : e.data;
    const crc = crc32(e.data);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // version needed: 2.0
    local.writeUInt16LE(flags, 6);
    local.writeUInt16LE(method, 8);
    local.writeUInt16LE(time, 10);
    local.writeUInt16LE(date, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(body.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    local.writeUInt16LE(0, 28);
    locals.push(local, name, body);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE((3 << 8) | 30, 4); // made by Unix (3), so readers take the mode from the external attributes
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(flags, 8);
    central.writeUInt16LE(method, 10);
    central.writeUInt16LE(time, 12);
    central.writeUInt16LE(date, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(body.length, 20);
    central.writeUInt32LE(e.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    // extra length, comment length, disk number, internal attributes: all 0 (bytes 30 to 37)
    central.writeUInt32LE(((e.mode << 16) | (e.folder ? 0x10 : 0)) >>> 0, 38); // Unix mode, plus the DOS folder bit
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += local.length + name.length + body.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

class Failure extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

function git(root, args, { input, buffer = false } = {}) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      input, encoding: buffer ? undefined : 'utf8', maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'pipe'],
    });
  } catch (e) {
    throw new Failure(`git ${args.join(' ')} failed: ${String(e.stderr || e.message).trim()}`, 2);
  }
}

/** Every folder skills/<plugin>/<name>/ at `rev`, as a map from name to [{ plugin, name, dir, hasSkillMd, files }]. */
function skillFolders(root, rev) {
  const out = new Map();
  const raw = git(root, ['ls-tree', '-r', '-z', '--full-tree', rev, '--', 'skills/']);
  for (const rec of raw.split('\0').filter(Boolean)) {
    const tab = rec.indexOf('\t');
    const [mode, type, sha] = rec.slice(0, tab).split(' ');
    const path = rec.slice(tab + 1);
    const parts = path.split('/');
    if (parts.length < 4) continue; // skills/<plugin>/README.md and the like are not skills
    const [, plugin, name] = parts;
    const dir = `skills/${plugin}/${name}`;
    let list = out.get(name);
    if (!list) out.set(name, (list = []));
    let folder = list.find((f) => f.dir === dir);
    if (!folder) list.push((folder = { plugin, name, dir, hasSkillMd: false, files: [] }));
    const rel = parts.slice(3).join('/');
    if (rel === 'SKILL.md') folder.hasSkillMd = true;
    folder.files.push({ rel, mode, type, sha });
  }
  return out;
}

/** The blobs for `shas`, read in one `git cat-file --batch`. */
function readBlobs(root, shas) {
  const out = new Map();
  if (!shas.length) return out;
  const buf = git(root, ['cat-file', '--batch'], { input: `${shas.join('\n')}\n`, buffer: true });
  let p = 0;
  for (const sha of shas) {
    const nl = buf.indexOf(0x0a, p);
    const [got, type, size] = buf.toString('utf8', p, nl).split(' ');
    if (got !== sha || type !== 'blob') throw new Failure(`could not read ${sha} from git`, 2);
    const start = nl + 1;
    out.set(sha, buf.subarray(start, start + Number(size)));
    p = start + Number(size) + 1;
  }
  return out;
}

/** The upload-rule problems of one skill folder; an empty list means it may be uploaded. */
export function uploadProblems(folder, files) {
  const id = folder.dir;
  const problems = [];
  const name = folder.name;
  if (name.length > MAX_NAME) problems.push(`${id}: the name is ${name.length} characters; the limit is ${MAX_NAME}`);
  if (!NAME_CHARS.test(name)) problems.push(`${id}: the name may hold only lowercase letters, digits and hyphens`);
  if (XML_TAG.test(name)) problems.push(`${id}: the name contains an XML-like tag`);
  if (RESERVED_NAME.test(name)) problems.push(`${id}: the name contains a reserved word ("claude" or "anthropic")`);
  for (const f of folder.files) {
    if (f.mode === '120000') problems.push(`${id}/${f.rel}: a symbolic link; an upload needs real files`);
    else if (f.type !== 'blob') problems.push(`${id}/${f.rel}: a ${f.type} (submodule), not a file`);
  }
  const total = files.reduce((n, f) => n + f.data.length, 0);
  if (total >= MAX_UNCOMPRESSED) {
    problems.push(`${id}: ${total} bytes uncompressed; an upload must be under ${MAX_UNCOMPRESSED} bytes (30 MB)`);
  }

  const skillMd = files.find((f) => f.rel === 'SKILL.md');
  if (!skillMd) return [...problems, `${id}: no SKILL.md in the folder`];
  const lines = skillMd.data.toString('utf8').split(/\r?\n/);
  const close = lines.indexOf('---', 1);
  if (lines[0] !== '---' || close < 0) return [...problems, `${id}/SKILL.md: no frontmatter (a block between two --- lines)`];
  const front = lines.slice(1, close);

  const names = front.filter((l) => /^name:(\s|$)/.test(l));
  const declared = names.length ? names[0].slice('name:'.length).trim().replace(/^(["'])(.*)\1$/, '$2') : '';
  if (names.length !== 1) problems.push(`${id}/SKILL.md: the frontmatter needs exactly one name`);
  else if (declared !== name) problems.push(`${id}/SKILL.md: the name "${declared}" differs from the folder name "${name}"`);

  const { value: description = '', error } = parseDescription(front);
  if (error) problems.push(`${id}/SKILL.md: the description is not valid YAML: ${error}`);
  else if (!description.trim()) problems.push(`${id}/SKILL.md: the description is empty`);
  else {
    if (description.length > MAX_DESCRIPTION) {
      problems.push(`${id}/SKILL.md: the description is ${description.length} characters; the limit is ${MAX_DESCRIPTION}`);
    }
    if (XML_TAG.test(description)) {
      problems.push(`${id}/SKILL.md: the description contains an XML-like tag, ${description.match(/<[^>]*>?/)[0]} (quote it differently or drop the angle brackets)`);
    }
  }
  return problems;
}

const USAGE = 'Usage: node scripts/pack-skills.mjs (<skill> [<skill>...] | --since <git ref> | --all) [--out <dir>] [--root <dir>]';

export function parseArgs(argv) {
  const opts = { names: [], since: null, all: false, out: null, root: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Failure(`${a} needs a value\n${USAGE}`, 2);
      return argv[++i];
    };
    if (a === '--since') opts.since = value();
    else if (a === '--out') opts.out = value();
    else if (a === '--root') opts.root = value();
    else if (a === '--all') opts.all = true;
    else if (a === '--help' || a === '-h') throw new Failure(USAGE, 0);
    else if (a.startsWith('-')) throw new Failure(`unknown option ${a}\n${USAGE}`, 2);
    else opts.names.push(a);
  }
  const modes = [opts.names.length > 0, opts.since !== null, opts.all].filter(Boolean).length;
  if (modes !== 1) throw new Failure(`give skill names, --since <ref> or --all (one of them)\n${USAGE}`, 2);
  return opts;
}

/** Which skill folders to pack, each with a status, and which skills were removed. */
function selectTargets(root, opts, head) {
  const pick = (list, label) => {
    if (list.length > 1) throw new Failure(`${label} is in more than one plugin: ${list.map((f) => f.dir).join(', ')}`, 2);
    return list[0];
  };
  if (opts.all) {
    return { targets: [...head.values()].map((list) => ({ folder: pick(list, list[0].name), status: 'packed' })), removed: [] };
  }
  if (opts.names.length) {
    const targets = [];
    for (const raw of opts.names) {
      const arg = raw.replace(/\\/g, '/').replace(/^skills\//, '').replace(/\/+$/, '');
      const parts = arg.split('/');
      let folder;
      if (parts.length === 1) folder = head.has(arg) ? pick(head.get(arg), arg) : null;
      else if (parts.length === 2) folder = (head.get(parts[1]) || []).find((f) => f.plugin === parts[0]) || null;
      if (!folder) throw new Failure(`unknown skill: ${raw} (no folder skills/<plugin>/${parts[parts.length - 1]}/ at HEAD)`, 2);
      if (!targets.some((t) => t.folder === folder)) targets.push({ folder, status: 'packed' });
    }
    return { targets, removed: [] };
  }

  const ref = opts.since;
  try {
    git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    throw new Failure(`unknown git ref: ${ref}`, 2);
  }
  const before = skillFolders(root, ref);
  const hadSkill = (name) => (before.get(name) || []).some((f) => f.hasSkillMd);
  const touched = new Set();
  const diff = git(root, ['diff', '--name-status', '--no-renames', '-z', ref, 'HEAD', '--', 'skills/']).split('\0').filter(Boolean);
  for (let i = 0; i + 1 < diff.length; i += 2) {
    const parts = diff[i + 1].split('/');
    if (parts.length >= 4) touched.add(parts[2]);
  }
  const targets = [];
  const removed = [];
  for (const name of [...touched].sort()) {
    if (head.has(name)) targets.push({ folder: pick(head.get(name), name), status: hadSkill(name) ? 'changed' : 'new' });
    else if (hadSkill(name)) removed.push(before.get(name).find((f) => f.hasSkillMd));
  }
  return { targets, removed };
}

export function main(argv, { cwd = process.cwd(), log = console.log, warn = console.error } = {}) {
  try {
    const opts = parseArgs(argv);
    const here = dirname(fileURLToPath(import.meta.url));
    const root = resolve(cwd, opts.root || join(here, '..'));
    git(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
    const out = resolve(cwd, opts.out || join(root, 'dist'));
    const head = skillFolders(root, 'HEAD');
    const { targets, removed } = selectTargets(root, opts, head);
    targets.sort((a, b) => (a.folder.name < b.folder.name ? -1 : 1));

    const blobs = readBlobs(root, [...new Set(targets.flatMap((t) => t.folder.files.filter((f) => f.type === 'blob').map((f) => f.sha)))]);
    const problems = [];
    for (const t of targets) {
      t.files = t.folder.files.filter((f) => f.type === 'blob').map((f) => ({ ...f, data: blobs.get(f.sha) }));
      problems.push(...uploadProblems(t.folder, t.files));
      const dirty = git(root, ['status', '--porcelain', '--', t.folder.dir]).trimEnd();
      if (dirty) {
        warn(`WARNING: ${t.folder.dir} has uncommitted changes. The zip holds the committed files (HEAD), not these:\n${dirty}`);
      }
    }
    if (problems.length) {
      warn(`Refused: ${problems.length} upload rule${problems.length === 1 ? '' : 's'} failed, so no zip was written:`);
      for (const p of problems) warn(`  ${p}`);
      return 1;
    }

    for (const r of removed) log(`removed  ${r.name}  (was ${r.dir}; delete it from claude.ai by hand)`);
    if (!targets.length) {
      log('nothing to pack');
      return 0;
    }
    mkdirSync(out, { recursive: true });
    const rows = [];
    for (const t of targets) {
      const seconds = Number(git(root, ['log', '-1', '--format=%ct', 'HEAD', '--', t.folder.dir]).trim()) || 0;
      const zip = buildZip(t.files.map((f) => ({ path: `${t.folder.name}/${f.rel}`, mode: f.mode === '100755' ? 0o100755 : 0o100644, data: f.data })), seconds);
      const file = join(out, `${t.folder.name}.zip`);
      writeFileSync(file, zip);
      const shown = relative(cwd, file);
      rows.push([shown && !shown.startsWith('..') ? shown : file, t.status, `${t.files.length} file${t.files.length === 1 ? '' : 's'}`, `${zip.length} bytes`]);
    }
    const width = (k) => Math.max(...rows.map((r) => r[k].length));
    for (const r of rows) log(`${r[0].padEnd(width(0))}  ${r[1].padEnd(width(1))}  ${r[2].padStart(width(2))}  ${r[3].padStart(width(3))}`);
    if (!opts.since) log('(run with --since <ref> to see which are new and which replace an uploaded skill)');
    return 0;
  } catch (e) {
    if (!(e instanceof Failure)) throw e;
    (e.code === 0 ? log : warn)(e.message);
    return e.code;
  }
}

const isMain = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) process.exitCode = main(process.argv.slice(2));
