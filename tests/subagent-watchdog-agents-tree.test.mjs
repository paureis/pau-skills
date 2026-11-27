// subagent-watchdog: the agent definitions read the way Claude Code 2.1.332 loads them (q42.md): a tools flow list not
// closed on its line, the subfolders and links under .claude/agents within limits, a file with no description, and a
// type defined more than once. Real tempDir() folders, as in subagent-watchdog-agents.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import { mkdirSync, writeFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import { parseDefinition, definedReadOnly } from '../hooks/agent-orchestration/subagent-watchdog-agents.mjs';

const WIN = process.platform === 'win32';
/** A definition with a description line: Claude Code drops one without. */
const desc = (front) => `---\ndescription: Reads files.\n${front}\n---\nBody.\n`;
const R = desc('name: lector\ntools: Read');
const E = desc('name: lector\ntools: Read, Edit');
const ro = (text) => { const d = parseDefinition(text); return d === null ? null : d.readOnly; };

/** A root whose .claude/agents holds the given files; a name ending in "/" is an empty folder. */
function agents(files = {}) {
  const root = tempDir(); const dir = join(root, '.claude', 'agents');
  mkdirSync(dir, { recursive: true });
  for (const [name, text] of Object.entries(files)) {
    if (name.endsWith('/')) { mkdirSync(join(dir, name), { recursive: true }); continue; }
    mkdirSync(join(dir, name, '..'), { recursive: true });
    writeFileSync(join(dir, name), text);
  }
  return { root, dir };
}
const ask = (project, home) => definedReadOnly('lector', { project: project && project.root, home: home && home.root });
const timed = (f) => { const t = process.hrtime.bigint(); const v = f(); return [v, Number(process.hrtime.bigint() - t) / 1e6]; };

// Probe (Claude Code 2.1.332, headless, empty HOME, 2026-11-27): "tools: [Read, Grep" loads, and the agent had only Grep.
test('T1 a flow list not closed on its line is a comma list of the whole value: the first entry keeps its "[" and names no tool; a list carried on to the next line still does not parse', () => {
  for (const [v, want] of [['[Read, Grep', true], ['[Read, Edit', false], ['[Edit, Read', true], ['[Edit', false], ['[Read,', false], ['[Edit, Grep # x]', true]]) {
    assert.equal(ro(desc(`name: x\ntools: ${v}`)), want, v);
  }
  for (const text of [desc('name: x\ntools: [Read,\n  Grep]'), desc('name: x\ntools: [Read, Grep,\n  Edit]'), desc('name: x\ntools: [Read,\nGrep]')]) {
    assert.equal(parseDefinition(text), null, text);
  }
  assert.equal(ask(agents({ 'a.md': desc('name: other\ntools: [Read, Grep'), 'b.md': R })), true, 'an unclosed list of another name first');
});

// Probe (same run): sub/x.md and sub/deeper/y.md load; hidden folders and files load; the same name twice is one agent.
test('T2 subfolders are read at any depth, hidden ones too; a type defined twice is read-only only when every definition is', () => {
  assert.equal(ask(agents({ 'sub/a.md': R })), true, 'sub/a.md');
  assert.equal(ask(agents({ 'sub/deeper/b.md': R })), true, 'sub/deeper/b.md');
  assert.equal(ask(agents({ '.hidden/k.md': R, '.l-hidden.md': R })), true, 'hidden');
  assert.equal(ask(agents({ 'a.md': R, 'sub/b.md': E })), false, 'top level read-only, subfolder edits');
  assert.equal(ask(agents({ 'a.md': E, 'sub/b.md': R })), false, 'top level edits, subfolder read-only');
  assert.equal(ask(agents({ 'a.md': R, 'sub/b.md': R })), true, 'both read-only');
  assert.equal(ask(agents({ 'a.md': R, 'b.md': E })), false, 'two in one folder');
});

test('T3 links to a file and to a folder are followed; a link to a folder already read is skipped, also when name order reaches it deep first; a dangling or looping link of any name is skipped, as Claude Code cannot load it either', { skip: WIN }, () => {
  const other = agents({ 'x/real.md': R });
  let p = agents();
  symlinkSync(join(other.dir, 'x', 'real.md'), join(p.dir, 'link.md'));
  assert.equal(ask(p), true, 'a linked file');
  p = agents();
  symlinkSync(join(other.dir, 'x'), join(p.dir, 'lx'));
  assert.equal(ask(p), true, 'a linked folder');
  for (const [to, why] of [['..', 'a link to the parent folder'], ['.', 'a link to .claude/agents itself']]) {
    p = agents({ 'a.md': R, 'sub/b.md': R });
    symlinkSync(join(p.dir, to), join(p.dir, 'loop'));
    symlinkSync(join(p.dir, to), join(p.dir, 'sub', 'loop'));
    const [v, ms] = timed(() => ask(p));
    assert.equal(v, true, why);
    assert.ok(ms < 1000, `${why}: ${ms} ms`);
  }
  const chain = Array.from({ length: 6 }, (_, i) => `c${i}`).join('/');
  for (const [real, via] of [['r', 'a'], ['b', 'z']]) {
    p = agents({ [`${real}/x/${chain}/m.md`]: R, [`${via}/y/`]: '' });
    symlinkSync(join(p.dir, real, 'x'), join(p.dir, via, 'y', 'link'));
    assert.equal(ask(p), true, `${via}/y/link to ${real}/x, whose match is 8 levels down`);
  }
  for (const [name, to, why] of [['gone.md', 'missing', 'a dangling .md link'], ['gone', 'missing', 'a dangling link not named .md'],
    ['.#a.md', 'user@host.1234', 'an editor lock link'], ['self.md', 'self.md', 'a link to itself']]) {
    p = agents({ 'a.md': R });
    symlinkSync(join(p.dir, to), join(p.dir, name));
    assert.equal(ask(p), true, why);
  }
  p = agents({ 'a.md': R });
  symlinkSync(join(p.dir, 'l2'), join(p.dir, 'l1'));
  symlinkSync(join(p.dir, 'l1'), join(p.dir, 'l2'));
  assert.equal(ask(p), true, 'two links to each other');
  p = agents({ 'a.md': E });
  symlinkSync(join(p.dir, 'missing'), join(p.dir, 'gone.md'));
  assert.equal(ask(p), false, 'a dangling link next to a match that edits');
});

/** fs with some calls replaced; an error with the given code from those calls whose path matches. */
const failing = (calls, match, code) => new Proxy(fs, {
  get: (t, k) => (calls.includes(k) ? (p, ...a) => { if (match(String(p))) throw Object.assign(new Error(code), { code }); return t[k](p, ...a); } : t[k]),
});

test('T10 any other stat error (EACCES) is an unknown, so is a subfolder that cannot be listed; the top folder that cannot be listed is skipped', () => {
  const p = agents({ 'a.md': R, 'locked': 'x', 'sub/b.md': R });
  assert.equal(definedReadOnly('lector', { project: p.root }), true, 'control: the real fs');
  assert.equal(definedReadOnly('lector', { project: p.root, io: failing(['statSync'], (s) => s.endsWith('locked'), 'EACCES') }), false, 'EACCES on stat');
  assert.equal(definedReadOnly('lector', { project: p.root, io: failing(['readdirSync'], (s) => s.endsWith('sub'), 'EACCES') }), false, 'a subfolder that cannot be listed');
  const h = agents({ 'b.md': R });
  assert.equal(definedReadOnly('lector', { project: p.root, home: h.root, io: failing(['readdirSync'], (s) => s === p.dir, 'EACCES') }), true, 'the project folder cannot be listed: home decides');
});

// Probe (same version, 2026-11-27): a described .md file in .claude/agents/.git/objects/ab/ loads. The watchdog skips
// .git on purpose: no one keeps a definition there, and the loose object folders of a git repository kept as the agents
// folder pass the 200 folders after about 110 commits.
test('T11 a folder named .git is not read and counts toward no limit; a .MD file (upper case) is not read, as Claude Code does not load it', () => {
  const git = Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`.git/objects/${i}/`, '']));
  assert.equal(ask(agents({ 'a.md': R, ...git, '.git/objects/ab/e.md': E })), true, 'a .git of 300 folders');
  assert.equal(ask(agents({ 'a.md': R, 'b.MD': E })), true, 'a .MD file that edits');
  assert.equal(ask(agents({ 'a.MD': R })), false, 'only a .MD file');
});

const deep = (n) => Array(n).fill('s').join('/');

test('T4 folders up to 8 levels below .claude/agents are read; a folder 9 levels down, even an empty one, leaves the root incomplete', () => {
  assert.equal(ask(agents({ [`${deep(8)}/a.md`]: R })), true, 'a match 8 levels down');
  assert.equal(ask(agents({ 'a.md': R, [`${deep(9)}/b.md`]: R })), false, 'a match 9 levels down, a top-level match');
  assert.equal(ask(agents({ 'a.md': R, [`${deep(9)}/`]: '' })), false, 'an empty folder 9 levels down');
});

test('T5 at most 200 .md files across the tree, files with no frontmatter included; one more leaves the root incomplete', () => {
  const notes = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`f${i % 4}/n${i}.md`, '# Notes\n']));
  assert.equal(ask(agents({ ...notes(199), 'f3/zz.md': R })), true, '200 files, the match in a subfolder');
  assert.equal(ask(agents({ 'a.md': R, ...notes(200) })), false, '201 files, a top-level match');
});

test('T6 at most 200 folders, .claude/agents itself included; one more leaves the root incomplete', () => {
  const dirs = (n) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`d${i}/`, '']));
  assert.equal(ask(agents({ 'a.md': R, ...dirs(199) })), true, '199 subfolders');
  assert.equal(ask(agents({ 'a.md': R, ...dirs(200) })), false, '200 subfolders');
});

// Probes (same version, 2026-11-27): Claude Code drops each of these files from the init event's agents list.
const SKIPPED = [
  ['no description key', (n, t) => `---\nname: ${n}\ntools: ${t}\n---\n`],
  ['description: with nothing after it, a key next', (n, t) => `---\nname: ${n}\ndescription:\ntools: ${t}\n---\n`],
  ['description: with nothing after it, the last line', (n, t) => `---\nname: ${n}\ntools: ${t}\ndescription:   \n---\n`],
  ...['""', "''", '~', 'null', 'Null', 'NULL', '# x', '~ # x'].map((v) => [`description: ${v}`, (n, t) => `---\nname: ${n}\ndescription: ${v}\ntools: ${t}\n---\n`]),
  // Probed: "|" and ">" with no body are dropped; the other block scalar indicators read the same in YAML.
  ...['|', '>', '|-', '>+', '|2', '>-1', '| # x'].map((v) => [`description: ${v} with no body`, (n, t) => `---\nname: ${n}\ndescription: ${v}\ntools: ${t}\n---\n`]),
  ['description: | with no body, the last line', (n, t) => `---\nname: ${n}\ntools: ${t}\ndescription: |\n---\n`],
  // Not probed: a line at column 0 that is not a key is no indented line, so the description stays empty.
  ['description: with a line at column 0 after it', (n, t) => `---\nname: ${n}\ndescription:\nReads files.\ntools: ${t}\n---\n`],
];
for (const [why, make] of SKIPPED) {
  test(`T7 ${why}: not a definition (not a match and not an unknown)`, () => {
    assert.equal(parseDefinition(make('lector', 'Read')).described, false);
    assert.equal(ask(agents({ 'a.md': make('lector', 'Read, Edit'), 'b.md': R })), true, 'next to a read-only one');
    assert.equal(ask(agents({ 'a.md': make('lector', 'Read') })), false, 'alone');
    assert.equal(ask(agents({ 'a.md': make('other', 'Edit') }), agents({ 'b.md': R })), true, 'another name in the project, the match in home');
  });
}

test('T7 a description: an indented line after "description:" (probed: loads), a block scalar, a quoted "~" or "null"; a value that is only a comment is empty for tools too', () => {
  for (const d of ['description:\n  Reads files.', 'description: # x\n  Reads files.', 'description: |\n  Reads.', 'description: "~"', "description: 'null'", 'description: r']) {
    const text = `---\nname: lector\n${d}\ntools: Read, Edit\n---\n`;
    assert.equal(parseDefinition(text).described, true, d);
    assert.equal(ask(agents({ 'a.md': text, 'b.md': R })), false, d);
  }
  assert.equal(ro(desc('name: x\ntools: # Edit')), false, 'tools: # Edit');
  assert.equal(ro(desc('name: x\ntools: # a list\n  - Read')), true, 'a block list after a comment');
});

test('T8 the project wins: a read-only project definition over a home one that edits; a project one that edits never falls through to home; an unknown in home after a project match does not count', () => {
  assert.equal(ask(agents({ 'a.md': R }), agents({ 'b.md': E })), true);
  assert.equal(ask(agents({ 'a.md': E }), agents({ 'b.md': R })), false);
  assert.equal(ask(agents({ 'a.md': R }), agents({ 'big.md': E + 'x'.repeat(70 * 1024) })), true);
});

/** Files padded with non-.md files so the tree holds exactly n entries (files and folders). */
function padded(files, n) {
  const paths = new Set();
  for (const name of Object.keys(files)) {
    const parts = name.split('/').filter((s) => s !== '');
    for (let i = 1; i <= parts.length; i++) paths.add(parts.slice(0, i).join('/'));
  }
  const out = { ...files };
  for (let i = paths.size; i < n; i++) out[`d0/x${i}.txt`] = 'x';
  return out;
}

test('T9 a tree at every limit at once (5,000 entries, 200 folders, 8 levels, 200 .md files of 64 KB) is read in under 1 s; a wide folder of 5,000 entries is read, one more leaves the root incomplete', (t) => {
  const big = (i) => { const t = desc(`name: o${i}\ntools: Read`); return t + 'x'.repeat(65536 - t.length); };
  const files = { 'a.md': R, [`${deep(8)}/m.md`]: big(0) };
  for (let i = 0; i < 191; i++) files[`d${i}/`] = '';
  for (let i = 1; i < 199; i++) files[`d${i % 191}/o${i}.md`] = big(i);
  const full = agents(padded(files, 5000));
  const [v, ms] = timed(() => ask(full));
  assert.equal(v, true, 'every limit at once');
  assert.ok(ms < 1000, `${ms} ms`);
  const wide = (n) => agents({ 'a.md': R, ...Object.fromEntries(Array.from({ length: n }, (_, i) => [`wide/x${i}.txt`, 'x'])) });
  const at = wide(4998);
  const [w, wms] = timed(() => ask(at));
  assert.equal(w, true, '5,000 entries in a wide folder');
  assert.ok(wms < 1000, `${wms} ms`);
  assert.equal(ask(wide(4999)), false, '5,001 entries, a top-level match');
  t.diagnostic(`every limit: ${Math.round(ms)} ms; the wide folder: ${Math.round(wms)} ms`);
});
