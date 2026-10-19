// The context budget for skill descriptions. Claude Code loads the description of every skill the model may start
// into every session, and since P0.5 (docs/BACKLOG.md, decision 7) every skill may be started by the model, so every
// description costs context all the time. The skill listing gets about 1% of the context window (about 40,000
// characters on the owner's 1M window) and is shared with every other plugin installed; over budget, Claude Code drops
// the descriptions of the least used skills. This test keeps each description a short trigger list and the total small.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const MAX_DESCRIPTION = 400;
const MAX_TOTAL = 14000;
const MAX_ANY_DESCRIPTION = 1536; // Claude Code cuts any description longer than this.
const MAX_UPLOAD_DESCRIPTION = 1024; // claude.ai refuses to upload a skill with a longer description.

// The frontmatter is the block between the first two `---` lines. Like tests/marketplace.test.mjs, the description is
// the `description:` key; its value is read the way YAML reads it, so its length is the length Claude Code sees: a
// plain value with its continuation lines, a single- or double-quoted value (escapes, folding, a trailing comment), or
// a `>` or `|` block. A value that is not valid YAML is an error, reported by a test, never a crash.
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

// The frontmatter line that hides a skill from the model, with any value: `false` changes nothing but still says the
// skill might be hidden, so it goes too.
const hasFlag = (front) => front.some((l) => /^(["']?)disable-model-invocation\1\s*:/.test(l));

function readSkills() {
  const out = [];
  for (const plugin of readdirSync(join(ROOT, 'skills')).filter((d) => !d.includes('.'))) {
    for (const name of readdirSync(join(ROOT, 'skills', plugin)).filter((d) => !d.includes('.'))) {
      const lines = readFileSync(join(ROOT, 'skills', plugin, name, 'SKILL.md'), 'utf8').split(/\r?\n/);
      const end = lines.indexOf('---', 1);
      const front = lines[0] === '---' && end > 0 ? lines.slice(1, end) : [];
      const { value: description = '', error } = parseDescription(front);
      out.push({ id: `${plugin}/${name}`, description, flag: hasFlag(front), error });
    }
  }
  return out;
}

// Each check returns what is wrong, so the same checks run on the repository and on the fixtures below.
const checks = {
  empty: (skills) => skills.filter((s) => !s.description.trim()).map((s) => s.id),
  each: (skills) => skills.filter((s) => s.description.length > MAX_DESCRIPTION).map((s) => `${s.id}: ${s.description.length}`),
  total: (skills) => {
    const total = skills.reduce((n, s) => n + s.description.length, 0);
    return total > MAX_TOTAL ? [`descriptions total ${total} characters`] : [];
  },
  any: (skills) => skills.filter((s) => s.description.length > MAX_ANY_DESCRIPTION).map((s) => `${s.id}: ${s.description.length}`),
  upload: (skills) => skills.filter((s) => s.description.length > MAX_UPLOAD_DESCRIPTION).map((s) => `${s.id}: ${s.description.length}`),
  // Every skill loads on its own (decision 7). A ratchet at zero: the flag hides the description and stops the model,
  // and other skills, from starting the skill.
  flag: (skills) => skills.filter((s) => s.flag).map((s) => s.id),
  // claude.ai refuses to upload a skill whose description contains anything shaped like an XML tag, such as `<app>`.
  tags: (skills) => skills.filter((s) => /<[A-Za-z/!?]/.test(s.description)).map((s) => `${s.id}: ${s.description.match(/<[^>]*>?/)[0]}`),
};

const SKILLS = readSkills();

test('every description parses as YAML', () => {
  assert.deepEqual(SKILLS.filter((s) => s.error).map((s) => `${s.id}: ${s.error}`), []);
});

test('descriptions are read the way YAML reads them, and a bad one is an error, not a crash', () => {
  const parse = (text) => parseDescription(text.split('\n'));
  const value = (text) => {
    const r = parse(text);
    assert.equal(r.error, undefined, `${JSON.stringify(text)}: ${r.error}`);
    return r.value;
  };
  assert.equal(value('name: x\ndescription: plain text\nother: y'), 'plain text');
  assert.equal(value('description: plain text\n  continued here\nother: y'), 'plain text continued here');
  assert.equal(value('description: plain # a comment'), 'plain');
  assert.equal(value('description:\n  starts on the next line'), 'starts on the next line');
  assert.equal(value('description: >\n  folded\n  lines\nother: y'), 'folded lines\n');
  assert.equal(value('description: >-\n  folded\n  lines\n\n  new paragraph'), 'folded lines\nnew paragraph');
  assert.equal(value('description: |\n  literal\n  lines\nother: y'), 'literal\nlines\n');
  assert.equal(value('description: |-\n  literal\n    indented'), 'literal\n  indented');
  assert.equal(value('description: "\\x41\\u0042 \\"q\\" it\'s"'), 'AB "q" it\'s');
  assert.equal(value('description: "quoted" # a comment'), 'quoted');
  assert.equal(value('description: "spans\n  two lines"'), 'spans two lines');
  assert.equal(value("description: 'single ''quoted'' # not a comment'"), "single 'quoted' # not a comment");
  assert.equal(value('name: x'), '');
  assert.equal(value('description: >\nother: y'), '');
  for (const bad of ['description: "never closed', 'description: "bad \\q escape"', 'description: "x" trailing',
    "description: 'never closed", 'description: has: a colon', 'description: [a, list]', 'description: > bad']) {
    assert.ok(parse(bad).error, `should not parse: ${JSON.stringify(bad)}`);
  }
});

test('the skills were found and parsed', () => {
  assert.ok(SKILLS.length >= 20, `expected at least 20 skills, got ${SKILLS.length}`);
});

test('no description contains an XML-like tag (claude.ai rejects the upload)', () => {
  assert.deepEqual(checks.tags(SKILLS), []);
  const fake = (description) => ({ id: 'x', description });
  assert.deepEqual(checks.tags([fake('a project skill, .claude/skills/verify-<app>/')]), ['x: <app>']);
  assert.deepEqual(checks.tags([fake('closing </b> tag')]).length, 1);
  assert.deepEqual(checks.tags([fake('use it when a < b, or for 2<3')]), []);
});

test('every skill has a non-empty description (the / menu and the model both read it)', () => {
  assert.deepEqual(checks.empty(SKILLS), []);
});

test('no skill sets disable-model-invocation: every skill loads on its own', () => {
  assert.deepEqual(checks.flag(SKILLS), []);
});

test(`each description is at most ${MAX_DESCRIPTION} characters`, () => {
  assert.deepEqual(checks.each(SKILLS), []);
});

test(`all descriptions together are at most ${MAX_TOTAL} characters`, () => {
  assert.deepEqual(checks.total(SKILLS), []);
});

test(`every description is at most ${MAX_UPLOAD_DESCRIPTION} characters (claude.ai upload) and ${MAX_ANY_DESCRIPTION} (Claude Code cut)`, () => {
  assert.deepEqual(checks.upload(SKILLS), []);
  assert.deepEqual(checks.any(SKILLS), []);
});

test('each check flags one character or one skill over its limit, and nothing at the limit', () => {
  const skill = (id, length, flag = false) => ({ id, description: 'x'.repeat(length), flag });
  // At every limit at once: as many skills at the per-description limit as the total allows, plus one that takes the
  // rest of the total (more than nothing, at most one description).
  const full = Math.ceil(MAX_TOTAL / MAX_DESCRIPTION) - 1;
  const atLimit = [...Array.from({ length: full }, (_, i) => skill(`s${i}`, MAX_DESCRIPTION)), skill('rest', MAX_TOTAL - full * MAX_DESCRIPTION)];
  assert.equal(atLimit.reduce((n, s) => n + s.description.length, 0), MAX_TOTAL, 'fixture: the skills must add up to the total');
  for (const [name, check] of Object.entries(checks)) assert.deepEqual(check(atLimit), [], name);

  assert.deepEqual(checks.each([skill('long', MAX_DESCRIPTION + 1)]), [`long: ${MAX_DESCRIPTION + 1}`]);
  const overTotal = atLimit.map((s) => (s.id === 'rest' ? skill('rest', s.description.length + 1) : s));
  assert.deepEqual(checks.total(overTotal), [`descriptions total ${MAX_TOTAL + 1} characters`]);
  assert.deepEqual(checks.upload([skill('big', MAX_UPLOAD_DESCRIPTION + 1)]), [`big: ${MAX_UPLOAD_DESCRIPTION + 1}`]);
  assert.deepEqual(checks.upload([skill('ok', MAX_UPLOAD_DESCRIPTION)]), []);
  assert.deepEqual(checks.any([skill('huge', MAX_ANY_DESCRIPTION + 1)]), [`huge: ${MAX_ANY_DESCRIPTION + 1}`]);
  assert.deepEqual(checks.empty([{ id: 'blank', description: ' ' }]), ['blank']);
  assert.deepEqual(checks.flag([skill('hidden', 10, true), skill('shown', 10)]), ['hidden']);
});

test('the flag is found in any form a frontmatter line can take', () => {
  for (const line of ['disable-model-invocation: true', 'disable-model-invocation:true', 'disable-model-invocation : "true"', 'disable-model-invocation: false', '"disable-model-invocation": true', "'disable-model-invocation': true"]) {
    assert.ok(hasFlag(['name: x', line]), line);
  }
  assert.ok(!hasFlag(['description: "mentions disable-model-invocation: true in the text"', '  disable-model-invocation: true']));
});
