// The pau-skills additions to html-plan (Q15): the Mist theme in scripts/html-plan/mist.css, and the numbering fix that
// scripts/pack-html-plan.mjs writes into runtime/pack.mjs. The files are read inside each test, so a red run still
// shows the full count.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode } from './helpers.mjs';
import { tmp } from './pack-skills.helpers.mjs';
import { FIXTURE, build, entry } from './pack-html-plan.helpers.mjs';

const mist = () => readFileSync(repo('scripts', 'html-plan', 'mist.css'), 'utf8');

const TOKENS = ['paper', 'card', 'sunk', 'ink', 'ink-2', 'ink-3', 'line', 'line-2', 'accent', 'accent-soft', 'green',
  'green-soft', 'amber', 'amber-soft', 'red', 'red-soft', 'blue', 'blue-soft', 'purple', 'purple-soft'];

// The custom properties set in one block, in order, as [name, value] pairs.
const tokens = (body) => [...body.matchAll(/--([\w-]+):\s*([^;]+);/g)].map((m) => [m[1], m[2].trim()]);

function blocks(css) {
  const light = /^:root \{([^}]*)\}/m.exec(css);
  const media = /^@media \(prefers-color-scheme: dark\) \{\s*:root:not\(\[data-theme="light"\]\) \{([^}]*)\}\s*\}/m.exec(css);
  const forced = /^:root\[data-theme="dark"\] \{([^}]*)\}/m.exec(css);
  assert.ok(light, 'a bare :root block for the light tokens');
  assert.ok(media, 'a prefers-color-scheme dark block on :root:not([data-theme="light"])');
  assert.ok(forced, 'a :root[data-theme="dark"] block');
  return { light: light[1], media: media[1], forced: forced[1] };
}

test('A1 Mist defines the same 20 tokens in its three blocks, with the values of the chosen variant', () => {
  const { light, media, forced } = blocks(mist());
  for (const [label, body] of [['light', light], ['dark (media)', media], ['dark (data-theme)', forced]]) {
    assert.deepEqual(tokens(body).map(([n]) => n), TOKENS, `${label}: the 20 tokens from --paper to --purple-soft`);
  }
  assert.match(light, /color-scheme: light;/);
  assert.match(media, /color-scheme: dark;/);
  assert.match(forced, /color-scheme: dark;/);
  assert.deepEqual(tokens(media), tokens(forced), 'the two dark blocks are identical');
  const l = Object.fromEntries(tokens(light));
  const d = Object.fromEntries(tokens(forced));
  assert.deepEqual([l.paper, l.ink, l.accent], ['#e8ecf0', '#1b2530', '#1d6b74']);
  assert.deepEqual([d.paper, d.ink, d.accent], ['#151a20', '#dfe6ed', '#5fb2ba']);
  assert.deepEqual([l.card, l.sunk, d.card, d.sunk], ['#f5f7f9', '#dde3e9', '#1d242c', '#11151a']);
});

test('A2 Mist paints the body, marks the rail, sets the title in the sans face and adds no web font', () => {
  const css = mist();
  const lines = css.split('\n');
  const has = (line) => assert.ok(lines.includes(line), `mist.css holds the line:\n${line}`);
  has('body { background: var(--paper); color: var(--ink); }');
  has('.nw-toc a { border-radius: 0 6px 6px 0; }');
  has('.nw-toc a:hover { background: var(--card); color: var(--ink); }');
  has('.nw-sheet .nw-toc a:hover { background: var(--sunk); }');
  has('.nw-toc a.on { background: var(--sunk); }');
  const h1 = lines.find((l) => l.startsWith('h1 {'));
  assert.ok(h1, 'an h1 rule');
  assert.match(h1, /font-family: var\(--sans\);/);
  assert.match(h1, /font-weight: 600;/);
  const onAccent = '.nw-bar .nw-next, .nw-bar .nw-respond .n, .nw-asks .ttl b.todo, .nw-askrow.todo .s, .has-comment > .nw-cbtn, .nw-cbtn.on, .nw-pin-dot, .nw-pop.note .k';
  has(`@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) :is(${onAccent}) { color: var(--paper); } }`);
  has(`:root[data-theme="dark"] :is(${onAccent}) { color: var(--paper); }`);
  for (const bad of ['@import', '@font-face', 'url(', '--sans:', '--serif:', '--mono:', '--float:']) {
    assert.ok(!css.includes(bad), `mist.css must not hold ${bad}`);
  }
  assert.doesNotMatch(css, /[–—]/, 'no em or en dash');
  assert.match(lines[0], /^\/\* .*pau-skills/, 'a header comment that names pau-skills');
  assert.match(css.split('*/')[0], /Q15/);
});

test('A3 a doc-code src excerpt is numbered from its first line with text', () => {
  const r = build(FIXTURE);
  assert.equal(r.code, 0, r.stderr);
  const dir = tmp('html-plan-numbering-');
  writeFileSync(join(dir, 'pack.mjs'), entry(r, 'runtime/pack.mjs'));
  const files = {
    'one-blank.txt': 'one\n\nthree\nfour\nfive\n',
    'two-blank.txt': 'one\n\n   \nfour\nfive\n',
    'text-first.txt': 'one\ntwo\n\nfour\n',
    'starts-blank.txt': '\nsecond\nthird\n',
    'starts-text.txt': 'first\n\nthird\n',
  };
  for (const [name, body] of Object.entries(files)) writeFileSync(join(dir, name), body);
  const extra = (script, ...args) => {
    const run = runNode(script, { args, cwd: dir });
    assert.equal(run.code, 0, run.stderr);
    return run.stdout.trim();
  };
  const patched = (...args) => extra(join(dir, 'pack.mjs'), ...args);
  assert.equal(patched('one-blank.txt', 'lines=2-4'), 'file="one-blank.txt" start="3"', 'line 2 is blank');
  assert.equal(patched('two-blank.txt', 'lines=2-5'), 'file="two-blank.txt" start="4"', 'lines 2 and 3 are blank, 3 holds spaces');
  assert.equal(patched('text-first.txt', 'lines=2-4'), 'file="text-first.txt" start="2"', 'the first line has text');
  assert.equal(patched('starts-blank.txt'), 'file="starts-blank.txt" start="2"', 'a whole file that starts blank');
  assert.equal(patched('starts-text.txt'), 'file="starts-text.txt"', 'a whole file that starts with text: no start, as upstream');
  assert.equal(patched('one-blank.txt', 'lines=2-4', 'start=9'), 'file="one-blank.txt"', 'an explicit start= stays the author\'s');
  const unpatched = extra(join(FIXTURE, 'runtime', 'pack.mjs'), 'one-blank.txt', 'lines=2-4');
  assert.equal(unpatched, 'file="one-blank.txt" start="2"', 'control: upstream numbers from the blank line');
});
