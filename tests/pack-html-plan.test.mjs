// scripts/pack-html-plan.mjs (Q15): html-plan.zip from an upstream html-plan folder plus the pau-skills additions,
// built here from the fake upstream in tests/fixtures/html-plan-upstream/, never from the network.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, symlinkSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createRequire } from 'node:module';
import { ROOT } from './helpers.mjs';
import { tmp, git, files } from './pack-skills.helpers.mjs';
import { FIXTURE, addition, upstreamFile, copyFixture, listFiles, build, entry } from './pack-html-plan.helpers.mjs';

// The seven anchors, written out here and not imported from the build, so a change to the build's list shows up.
const ANCHORS = [
  ['runtime/pack.mjs', "(a.start || !a.lines ? '' : ` start=\"${start}\"`)"],
  ['runtime/htmlplan.js', "h('pre', null, r.md)"],
  ['runtime/htmlplan.js', "h('span', { class: 'nw-send-state' })"],
  ['runtime/htmlplan.js', "'Copy response'"],
  ['runtime/htmlplan.css', ':root:not([data-theme="light"]) {'],
  ['runtime/htmlplan.css', ':root[data-theme="dark"] {'],
  ['runtime/htmlplan.css', '.nw-toc a:hover {'],
];

const text = (buf) => buf.toString('utf8');
const refused = (r, label) => {
  assert.equal(r.code, 1, `${label}: exit 1\n${r.stderr}`);
  assert.equal(r.zip, null, `${label}: no zip written`);
  assert.deepEqual(r.listing, [], `${label}: nothing written in --out`);
};

test('B1 packs html-plan.zip with every upstream file under html-plan/, untouched files byte-identical, and NOTICE added', () => {
  const out = tmp('html-plan-out-');
  writeFileSync(join(out, 'keep.txt'), 'mine\n');
  writeFileSync(join(out, 'other.zip'), 'not ours');
  const r = build(FIXTURE, { out });
  assert.equal(r.code, 0, r.stderr);
  const want = [...listFiles(FIXTURE), 'NOTICE'].map((f) => `html-plan/${f}`).sort();
  assert.deepEqual(files(r.entries).map((e) => e.name), want);
  assert.ok(r.entries.every((e) => e.name.startsWith('html-plan/')), 'one folder html-plan/ at the zip root');
  assert.ok(r.entries.some((e) => e.name === 'html-plan/'));
  assert.ok(files(r.entries).every((e) => e.mode === 0o100644 && e.unix), 'every file is a plain 0644 file');
  for (const rel of ['references/blocks.md', 'examples/plan.html']) assert.ok(entry(r, rel).equals(upstreamFile(rel)), `${rel} byte-identical`);
  assert.deepEqual(r.listing, ['html-plan.zip', 'keep.txt', 'other.zip'], 'nothing else in --out was removed');
  assert.equal(readFileSync(join(out, 'keep.txt'), 'utf8'), 'mine\n');
  assert.equal(readFileSync(join(out, 'other.zip'), 'utf8'), 'not ours');
});

test('B2 appends Mist to runtime/htmlplan.css after the upstream text', () => {
  const up = text(upstreamFile('runtime/htmlplan.css'));
  assert.ok(!up.endsWith('\n'), 'premise: the fake upstream CSS has no final newline');
  const r = build(FIXTURE);
  assert.equal(r.code, 0, r.stderr);
  assert.equal(text(entry(r, 'runtime/htmlplan.css')), `${up}\n\n${text(addition('mist.css'))}`);
});

test('B3 appends Send to Claude to runtime/htmlplan.js, and the result loads in Node the way pack.mjs loads it', () => {
  const up = text(upstreamFile('runtime/htmlplan.js'));
  assert.ok(up.endsWith('\n'), 'premise: the fake upstream script ends with a newline');
  const r = build(FIXTURE);
  assert.equal(r.code, 0, r.stderr);
  const js = text(entry(r, 'runtime/htmlplan.js'));
  assert.equal(js, `${up}\n${text(addition('send-to-claude.js'))}`);
  const dir = tmp('html-plan-runtime-');
  for (let d = dir; dirname(d) !== d; d = dirname(d)) assert.ok(!existsSync(join(d, 'package.json')), `premise: no package.json in ${d}`);
  writeFileSync(join(dir, 'htmlplan.js'), js);
  const NW = createRequire(join(dir, 'pack.mjs'))('./htmlplan.js');
  assert.equal(NW.fixture, 'html-plan-upstream', 'upstream still exports its parsers');
  assert.equal(globalThis.HtmlPlan, NW);
  assert.equal(typeof globalThis.HtmlPlanSendToClaude?.attach, 'function', 'the addition ran and did nothing else');
});

test('B4 appends the section to SKILL.md and keeps the upstream text and description', () => {
  const up = text(upstreamFile('SKILL.md'));
  const r = build(FIXTURE);
  assert.equal(r.code, 0, r.stderr);
  const md = text(entry(r, 'SKILL.md'));
  assert.equal(md, `${up}\n${text(addition('SKILL-addition.md'))}`);
  const front = (s) => s.split('\n---\n')[0];
  assert.equal(front(md), front(up), 'the frontmatter, with the description, is upstream');
  assert.match(md, /\n## pau-skills additions\n/);
});

test('B5 NOTICE names the repository, path, commit, author and license, and lists the additions', () => {
  const r = build(FIXTURE);
  assert.equal(r.code, 0, r.stderr);
  const notice = text(entry(r, 'NOTICE'));
  for (const s of ['https://github.com/anthropics/claude-plugins-community', 'html-plan/skills/html-plan',
    '06ec7b6a0a82bdc4bec44bd82d4368c42f20d7c1', 'Thariq Shihipar', 'as html-plan/.claude-plugin/plugin.json declares',
    'Apache License 2.0', 'scripts/pack-html-plan.mjs', 'pau-skills']) {
    assert.ok(notice.includes(s), `NOTICE names ${s}`);
  }
  assert.match(notice, /MIT/);
  const lines = notice.split('\n');
  for (const [file, what] of [['runtime/htmlplan.css', /Mist/], ['runtime/pack.mjs', /number/i], ['runtime/htmlplan.js', /Send to Claude/], ['SKILL.md', /section/i]]) {
    assert.ok(lines.some((l) => l.includes(file) && what.test(l)), `NOTICE lists the change to ${file}`);
  }
  assert.doesNotMatch(notice, /@/, 'no email address');
  assert.deepEqual(notice.match(/https?:\/\/\S+/g), ['https://github.com/anthropics/claude-plugins-community'], 'no other URL');
  assert.doesNotMatch(notice, /[–—]/);
});

test('B6 refuses, naming the file and the anchor, when an anchor is missing, and writes no zip', () => {
  for (const [file, anchor] of ANCHORS) {
    const up = copyFixture();
    const before = readFileSync(join(up, file), 'utf8');
    assert.equal(before.split(anchor).length, 2, `premise: the fixture holds ${anchor} once`);
    writeFileSync(join(up, file), before.split(anchor).join('GONE'));
    const r = build(up);
    refused(r, anchor);
    assert.ok(r.stderr.includes(`${file}: `) && r.stderr.includes(anchor), `stderr names ${file} and ${anchor}:\n${r.stderr}`);
    assert.match(r.stderr, /found 0 times/);
  }
});

test('B7 refuses when an anchor is found twice, and refuses a folder that was already built', () => {
  for (const [file, anchor] of ANCHORS) {
    const up = copyFixture();
    writeFileSync(join(up, file), `${readFileSync(join(up, file), 'utf8')}\n${anchor}\n`);
    const r = build(up);
    refused(r, anchor);
    assert.ok(r.stderr.includes(`${file}: `) && r.stderr.includes(anchor), `stderr names ${file} and ${anchor}:\n${r.stderr}`);
    assert.match(r.stderr, /found 2 times/);
  }
  const done = build(FIXTURE);
  assert.equal(done.code, 0, done.stderr);
  const again = join(tmp('html-plan-built-'), 'html-plan');
  for (const e of files(done.entries)) {
    const p = join(again, e.name.slice('html-plan/'.length));
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, e.data);
  }
  const r = build(again);
  refused(r, 'a built folder');
  assert.match(r.stderr, /runtime\/pack\.mjs: .*found 0 times/);
  // Mist adds `.nw-toc a:hover {` and `.nw-sheet .nw-toc a:hover {`, so a built folder holds it three times.
  assert.match(r.stderr, /runtime\/htmlplan\.css: .*\.nw-toc a:hover \{.*found 3 times/);
  assert.match(r.stderr, /NOTICE: upstream already has a NOTICE/);
});

test('B8 refuses a folder that fails the upload rules, or holds a symbolic link, and writes no zip', () => {
  const up = copyFixture();
  const md = readFileSync(join(up, 'SKILL.md'), 'utf8');
  writeFileSync(join(up, 'SKILL.md'), md.replace(/^description: .*$/m, 'description: Plans as <b>pages</b>.'));
  const r = build(up);
  refused(r, 'an XML tag in the description');
  assert.match(r.stderr, /html-plan\/SKILL\.md: the description contains an XML-like tag/);
  if (process.platform !== 'win32') {
    const linked = copyFixture();
    symlinkSync('plan.html', join(linked, 'examples', 'link.html'));
    const s = build(linked);
    refused(s, 'a symbolic link');
    assert.match(s.stderr, /examples\/link\.html: a symbolic link/);
  }
});

test('B9 every entry carries the time of the last commit to the build, and two builds give the same bytes', () => {
  const last = git(ROOT, 'log', '-1', '--format=%ct', 'HEAD', '--', 'scripts/pack-html-plan.mjs', 'scripts/html-plan');
  const seconds = Number(last || git(ROOT, 'log', '-1', '--format=%ct', 'HEAD'));
  const d = new Date(seconds * 1000);
  const time = (d.getUTCHours() << 11) | (d.getUTCMinutes() << 5) | (d.getUTCSeconds() >> 1);
  const date = ((d.getUTCFullYear() - 1980) << 9) | ((d.getUTCMonth() + 1) << 5) | d.getUTCDate();
  const a = build(FIXTURE);
  const b = build(FIXTURE);
  assert.equal(a.code, 0, a.stderr);
  for (const e of a.entries) assert.deepEqual([e.name, e.time, e.date], [e.name, time, date]);
  assert.ok(a.zip.equals(b.zip), 'the same bytes twice');
});

test('B10 usage: --help, a missing --upstream, an unknown option and bad folders', () => {
  const help = build(FIXTURE, { args: ['--help'] });
  assert.equal(help.code, 0);
  assert.match(help.stdout, /--upstream <folder>/);
  assert.match(help.stdout, /--out <folder>/);

  const here = copyFixture();
  const out = tmp('html-plan-out-');
  const none = build(here, { out, args: ['--out', out], cwd: here });
  assert.equal(none.code, 2, 'a missing --upstream is a usage error, even from inside an upstream folder');
  assert.match(none.stderr, /--upstream/);
  assert.deepEqual(none.listing, []);

  const bad = (args, label) => {
    const r = build(FIXTURE, { out, args });
    assert.equal(r.code, 2, `${label}: exit 2\n${r.stderr}`);
    assert.deepEqual(r.listing, [], `${label}: nothing written`);
    return r;
  };
  assert.match(bad(['--upstream', FIXTURE, '--out', out, '--frobnicate'], 'an unknown option').stderr, /--frobnicate/);
  assert.match(bad(['--upstream', join(FIXTURE, 'references'), '--out', out], 'no SKILL.md').stderr, /SKILL\.md/);
  bad(['--upstream', join(FIXTURE, 'SKILL.md'), '--out', out], '--upstream is a file');
  bad(['--upstream', join(FIXTURE, 'missing'), '--out', out], '--upstream does not exist');
  bad(['--upstream'], '--upstream without a folder');
  const file = join(tmp('html-plan-file-'), 'a-file');
  writeFileSync(file, 'x');
  assert.match(bad(['--upstream', FIXTURE, '--out', file], '--out is a file').stderr, /not a folder/);

  const fresh = join(tmp('html-plan-out-'), 'new', 'dist');
  const made = build(FIXTURE, { out: fresh, args: ['--upstream', FIXTURE, '--out', fresh] });
  assert.equal(made.code, 0, made.stderr);
  assert.deepEqual(made.listing, ['html-plan.zip'], 'a missing --out folder is created');
});
