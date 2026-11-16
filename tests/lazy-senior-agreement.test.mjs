// The shared rules of Q23 live in several files: lazy-senior's RULES.md, the roster builder and reviewer (and their
// installed copies), both TRIAGE.md copies and engineering-principles. This test fails when they drift apart.
// Text is compared whitespace-normalized: every run of spaces, tabs and newlines becomes one space, so a rewrap does
// not count as drift. Each block is located by its first and last sentence; a missing sentence is a failure.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repo } from './helpers.mjs';

const norm = (s) => s.replace(/\s+/g, ' ').trim();

// The block of `text` from the start of `first` to the end of the next `last` after it, normalized, or a message
// naming the file when either sentence is missing. indexOf returns -1 for a miss, and -1 is always a failure.
function locate(file, text, first, last) {
  const t = norm(text);
  const f = norm(first);
  const l = norm(last);
  const start = t.indexOf(f);
  if (start === -1) return { error: `${file}: the first sentence "${first}" is missing` };
  const end = t.indexOf(l, start + f.length);
  if (end === -1) return { error: `${file}: the last sentence "${last}" is missing after "${first}"` };
  return { block: t.slice(start, end + l.length) };
}

// Every problem the rules find in `texts` (a map from a file path to its text), as lines that name the file.
// A phrase rule: in each of `files`, the block from `first` to `last` exists and holds every one of `items`.
// A copy rule: the block from `first` to `last` in `source` appears word for word in each of `copies`.
export function problems(texts, rules) {
  const out = [];
  const read = (file) => (Object.hasOwn(texts, file) ? texts[file] : null);
  for (const r of rules) {
    if (r.source) {
      const text = read(r.source);
      if (text === null) { out.push(`${r.source}: the file is missing`); continue; }
      const { block, error } = locate(r.source, text, r.first, r.last);
      if (error) { out.push(error); continue; }
      for (const copy of r.copies) {
        const c = read(copy);
        if (c === null) out.push(`${copy}: the file is missing`);
        else if (!norm(c).includes(block)) out.push(`${copy}: does not hold the block from "${r.first}" to "${r.last}" of ${r.source} word for word`);
      }
      continue;
    }
    for (const file of r.files) {
      const text = read(file);
      if (text === null) { out.push(`${file}: the file is missing`); continue; }
      const { block, error } = locate(file, text, r.first, r.last);
      if (error) { out.push(error); continue; }
      for (const item of r.items || []) {
        if (!block.includes(norm(item))) out.push(`${file}: the block from "${r.first}" to "${r.last}" has no "${item}"`);
      }
    }
  }
  return out;
}

const RULES = 'skills/planning/lazy-senior/RULES.md';
const BUILDERS = ['skills/agent-orchestration/geppetto/roster/builder.md', '.claude/agents/builder.md'];
const REVIEWERS = ['skills/agent-orchestration/geppetto/roster/reviewer.md', '.claude/agents/reviewer.md'];
const TRIAGES = ['skills/verification/review-triage/TRIAGE.md', 'skills/agent-orchestration/lean-subagent-dev/TRIAGE.md'];
const PRINCIPLES_2 = 'skills/planning/engineering-principles/PRINCIPLES-2.md';
// What is never cut, from the ladder's last line. Each file says it in its own sentence; every item must be in it.
const NEVER_CUT = [
  'validation at a trust boundary',
  'error handling that prevents data loss',
  'security',
  'accessibility',
  'the calibration real hardware needs',
];

const SHARED_RULES = [
  // The ladder, from RULES.md, word for word in the builder.
  { source: RULES, first: 'Before you write code, stop at the first', last: 'or anything the user asked for.', copies: BUILDERS },
  // The never-cut list, each file by its own sentence.
  { files: [RULES, ...BUILDERS], first: 'Never cut validation', last: 'or anything the user asked for.', items: NEVER_CUT },
  { files: REVIEWERS, first: 'Never report what the contract asks for', last: 'or what a production rule below requires.', items: NEVER_CUT },
  { files: TRIAGES, first: 'It is never such a finding when it is what the contract or the user asked for', last: 'or what a production rule requires.', items: NEVER_CUT },
  // The reviewer's report line and its shortcut rule.
  { files: REVIEWERS, first: 'Bigger than needed: [file:line', last: 'the concrete case, or "none"]' },
  { files: REVIEWERS, first: 'Inside this check, a `shortcut:` comment that names its limit is a decision, not a finding', last: 'It never excuses a failed claim or a defect under step 8.' },
  // Triage's needless-addition rule and its shortcut rule.
  { files: TRIAGES, first: '**Bigger than needed.** A layer, wrapper, option or dependency that the change itself added and nothing needs', last: 'The same in code the change did not add is outside the change: Leave.' },
  { files: TRIAGES, first: 'A `shortcut:` comment that names its limit records a decision.', last: 'those go by their own rules.' },
  // engineering-principles' use-what-already-exists bullet.
  { files: [PRINCIPLES_2], first: 'Use what already exists before you write new code', last: 'subtracting stays within the code the change touches.' },
];

test('the shared rules agree in every file that carries them', () => {
  const files = new Set(SHARED_RULES.flatMap((r) => (r.source ? [r.source, ...r.copies] : r.files)));
  const texts = Object.fromEntries([...files].map((f) => [f, readFileSync(repo(f), 'utf8')]));
  assert.deepEqual(problems(texts, SHARED_RULES), []);
});

test('a phrase check names the file whose block lost an item, whether it comes first, in the middle or last', () => {
  const rules = [{ files: ['a.md', 'b.md', 'c.md'], first: 'Never cut', last: 'the end.', items: ['red paint', 'blue paint'] }];
  const good = { 'a.md': 'Intro. Never cut red paint\nor blue paint, the end. Outro.', 'b.md': 'Never cut red paint or\n  blue paint, the end.', 'c.md': 'x Never cut blue paint or red paint, the end.' };
  assert.deepEqual(problems(good, rules), []);
  const badFirst = { 'a.md': 'Intro. Never cut red paint, the end. Outro.', 'b.md': 'Never cut red paint or\n  blue paint, the end.', 'c.md': 'x Never cut blue paint or red paint, the end.' };
  assert.deepEqual(problems(badFirst, rules), ['a.md: the block from "Never cut" to "the end." has no "blue paint"']);
  const badMiddle = { 'a.md': 'Intro. Never cut red paint\nor blue paint, the end. Outro.', 'b.md': 'Never cut blue paint, the end.', 'c.md': 'x Never cut blue paint or red paint, the end.' };
  assert.deepEqual(problems(badMiddle, rules), ['b.md: the block from "Never cut" to "the end." has no "red paint"']);
  const badLast = { 'a.md': 'Intro. Never cut red paint\nor blue paint, the end. Outro.', 'b.md': 'Never cut red paint or\n  blue paint, the end.', 'c.md': 'x Never cut red paint, the end. Then blue paint.' };
  assert.deepEqual(problems(badLast, rules), ['c.md: the block from "Never cut" to "the end." has no "blue paint"']);
});

test('a missing first or last sentence fails and names the file, and never passes as a match at -1', () => {
  const rules = [{ files: ['a.md', 'b.md', 'c.md'], first: 'Start here.', last: 'Stop here.' }];
  const texts = {
    'a.md': 'Begin there. Some text. Stop here.',
    'b.md': 'Start here. Some text. Stop there.',
    'c.md': 'Stop here. Start here. Some text.',
  };
  assert.deepEqual(problems(texts, rules), [
    'a.md: the first sentence "Start here." is missing',
    'b.md: the last sentence "Stop here." is missing after "Start here."',
    'c.md: the last sentence "Stop here." is missing after "Start here."',
  ]);
  assert.deepEqual(problems({ 'b.md': 'Start here. Stop here.' }, [{ files: ['a.md', 'b.md'], first: 'Start here.', last: 'Stop here.' }]), [
    'a.md: the file is missing',
  ]);
});

test('a copy check names the copy that drifted, whether it comes first, in the middle or last, and a broken source', () => {
  const rules = [{ source: 'src.md', first: 'One:', last: 'three.', copies: ['a.md', 'b.md', 'c.md'] }];
  const src = 'Head. One: two,\nthree. Tail.';
  const good = { 'src.md': src, 'a.md': '## X\n\nOne: two, three.', 'b.md': 'One:\n  two,\n  three. More.', 'c.md': 'Before. One: two, three.' };
  assert.deepEqual(problems(good, rules), []);
  const badFirst = { 'src.md': src, 'a.md': 'One: two, four.', 'b.md': 'One:\n  two,\n  three. More.', 'c.md': 'Before. One: two, three.' };
  assert.deepEqual(problems(badFirst, rules), ['a.md: does not hold the block from "One:" to "three." of src.md word for word']);
  const badMiddle = { 'src.md': src, 'a.md': '## X\n\nOne: two, three.', 'b.md': 'One: too, three.', 'c.md': 'Before. One: two, three.' };
  assert.deepEqual(problems(badMiddle, rules), ['b.md: does not hold the block from "One:" to "three." of src.md word for word']);
  const badLast = { 'src.md': src, 'a.md': '## X\n\nOne: two, three.', 'b.md': 'One:\n  two,\n  three. More.', 'c.md': 'Before. One: two three.' };
  assert.deepEqual(problems(badLast, rules), ['c.md: does not hold the block from "One:" to "three." of src.md word for word']);
  const badSource = { 'src.md': 'Head. One: two. Tail.', 'a.md': 'One: two, three.' };
  assert.deepEqual(problems(badSource, [{ source: 'src.md', first: 'One:', last: 'three.', copies: ['a.md'] }]), [
    'src.md: the last sentence "three." is missing after "One:"',
  ]);
});
