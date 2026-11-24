// The context budget for skill descriptions. Claude Code loads the description of every skill the model may start
// into every session, so each one costs context all the time. Since decision 32 (docs/backlog/decisions.md), the skills
// in TYPED_ONLY (tests/typed-only-list.mjs) set `disable-model-invocation: true`: they start only when the user types
// them, and their description shows only in the / menu, so it costs no context. Every other skill is model-invoked.
// The skill listing gets about 1% of the context window (about 40,000 characters on the owner's 1M window) and is
// shared with every other plugin installed; over budget, Claude Code drops the descriptions of the least used skills.
// This test keeps each model-invoked description a short trigger list and their total small, and each typed-only
// description one short line for the / menu.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { TYPED_ONLY } from './typed-only-list.mjs';

const MAX_DESCRIPTION = 400; // a model-invoked description
const MAX_TOTAL = 14000; // all model-invoked descriptions together
const MAX_TYPED = 160; // a typed-only description: one sentence for the / menu
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

// A frontmatter line that hides a skill from the model, with any value: `false` changes nothing but still says the
// skill might be hidden, so it counts too. A typed-only skill holds exactly one, written exactly as TYPED_LINE.
const FLAG = /^(["']?)disable-model-invocation\1\s*:/;
const hasFlag = (front) => front.some((l) => FLAG.test(l));
const TYPED_LINE = 'disable-model-invocation: true';

function readSkills() {
  const out = [];
  for (const plugin of readdirSync(join(ROOT, 'skills')).filter((d) => !d.includes('.'))) {
    for (const name of readdirSync(join(ROOT, 'skills', plugin)).filter((d) => !d.includes('.'))) {
      const lines = readFileSync(join(ROOT, 'skills', plugin, name, 'SKILL.md'), 'utf8').split(/\r?\n/);
      const end = lines.indexOf('---', 1);
      const front = lines[0] === '---' && end > 0 ? lines.slice(1, end) : [];
      const { value: description = '', error } = parseDescription(front);
      out.push({ id: `${plugin}/${name}`, description, flags: front.filter((l) => FLAG.test(l)), error });
    }
  }
  return out;
}

// Each check takes the skills and the typed-only list and returns what is wrong, so the same checks run on the
// repository and on the fixtures below.
const model = (skills, list) => skills.filter((s) => !list.includes(s.id));
const typed = (skills, list) => skills.filter((s) => list.includes(s.id));
const over = (skills, max) => skills.filter((s) => s.description.length > max).map((s) => `${s.id}: ${s.description.length}`);
const checks = {
  empty: (skills) => skills.filter((s) => !s.description.trim()).map((s) => s.id),
  each: (skills, list) => over(model(skills, list), MAX_DESCRIPTION),
  typed: (skills, list) => over(typed(skills, list), MAX_TYPED),
  total: (skills, list) => {
    const total = model(skills, list).reduce((n, s) => n + s.description.length, 0);
    return total > MAX_TOTAL ? [`model-invoked descriptions total ${total} characters`] : [];
  },
  any: (skills) => over(skills, MAX_ANY_DESCRIPTION),
  upload: (skills) => over(skills, MAX_UPLOAD_DESCRIPTION),
  // The flag hides the description and stops the model, a subagent and other skills from starting the skill, so it
  // is set on exactly the skills the list names, once, and on no other skill in any form.
  flag: (skills, list) => skills.flatMap((s) => {
    if (!list.includes(s.id)) return s.flags.length ? [`${s.id}: not typed only, but sets disable-model-invocation`] : [];
    return s.flags.length === 1 && s.flags[0] === TYPED_LINE ? [] : [`${s.id}: typed only, but its frontmatter does not hold the flag line once, exactly`];
  }),
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

test('exactly the typed-only skills set disable-model-invocation: true, and no other skill has the line in any form', () => {
  assert.ok(TYPED_ONLY.length > 0, 'the typed-only list is empty');
  assert.deepEqual(checks.flag(SKILLS, TYPED_ONLY), []);
});

test(`each model-invoked description is at most ${MAX_DESCRIPTION} characters`, () => {
  assert.deepEqual(checks.each(SKILLS, TYPED_ONLY), []);
});

test(`each typed-only description is at most ${MAX_TYPED} characters`, () => {
  assert.deepEqual(checks.typed(SKILLS, TYPED_ONLY), []);
});

test(`all model-invoked descriptions together are at most ${MAX_TOTAL} characters`, () => {
  assert.deepEqual(checks.total(SKILLS, TYPED_ONLY), []);
});

test(`every description is at most ${MAX_UPLOAD_DESCRIPTION} characters (claude.ai upload) and ${MAX_ANY_DESCRIPTION} (Claude Code cut)`, () => {
  assert.deepEqual(checks.upload(SKILLS), []);
  assert.deepEqual(checks.any(SKILLS), []);
});

test('each check flags one character or one skill over its limit, and nothing at the limit', () => {
  const skill = (id, length, flags = []) => ({ id, description: 'x'.repeat(length), flags });
  // At every limit at once: as many model-invoked skills at the per-description limit as the total allows, plus one
  // that takes the rest of the total (more than nothing, at most one description), and a typed-only skill at its own
  // limit, which the total does not count.
  const full = Math.ceil(MAX_TOTAL / MAX_DESCRIPTION) - 1;
  const atLimit = [...Array.from({ length: full }, (_, i) => skill(`s${i}`, MAX_DESCRIPTION)), skill('rest', MAX_TOTAL - full * MAX_DESCRIPTION),
    skill('typed', MAX_TYPED, [TYPED_LINE])];
  const list = ['typed'];
  assert.equal(model(atLimit, list).reduce((n, s) => n + s.description.length, 0), MAX_TOTAL, 'fixture: the skills must add up to the total');
  for (const [name, check] of Object.entries(checks)) assert.deepEqual(check(atLimit, list), [], name);

  assert.deepEqual(checks.each([skill('long', MAX_DESCRIPTION + 1)], []), [`long: ${MAX_DESCRIPTION + 1}`]);
  assert.deepEqual(checks.each([skill('long', MAX_DESCRIPTION + 1)], ['long']), [], 'a typed-only description has its own limit');
  assert.deepEqual(checks.typed([skill('t', MAX_TYPED + 1)], ['t']), [`t: ${MAX_TYPED + 1}`]);
  assert.deepEqual(checks.typed([skill('m', MAX_TYPED + 1)], []), [], 'a model-invoked description is not held to the typed limit');
  const overTotal = atLimit.map((s) => (s.id === 'rest' ? skill('rest', s.description.length + 1) : s));
  assert.deepEqual(checks.total(overTotal, list), [`model-invoked descriptions total ${MAX_TOTAL + 1} characters`]);
  // The upload and cut limits hold for every skill, typed only or not.
  for (const id of ['big', 'typed']) {
    assert.deepEqual(checks.upload([skill(id, MAX_UPLOAD_DESCRIPTION + 1)], list), [`${id}: ${MAX_UPLOAD_DESCRIPTION + 1}`]);
    assert.deepEqual(checks.any([skill(id, MAX_ANY_DESCRIPTION + 1)], list), [`${id}: ${MAX_ANY_DESCRIPTION + 1}`]);
  }
  assert.deepEqual(checks.upload([skill('ok', MAX_UPLOAD_DESCRIPTION)], []), []);
  assert.deepEqual(checks.empty([{ id: 'blank', description: ' ' }]), ['blank']);

  // The flag: once and written exactly on a listed skill, and in no form on another.
  assert.equal(checks.flag([skill('hidden', 10, [TYPED_LINE]), skill('shown', 10)], []).length, 1);
  assert.equal(checks.flag([skill('hidden', 10, ['disable-model-invocation: false'])], []).length, 1);
  for (const flags of [[], ['disable-model-invocation: false'], ['disable-model-invocation:true'], [TYPED_LINE, TYPED_LINE]]) {
    assert.equal(checks.flag([skill('typed', 10, flags)], list).length, 1, JSON.stringify(flags));
  }
});

test('the flag is found in any form a frontmatter line can take', () => {
  for (const line of ['disable-model-invocation: true', 'disable-model-invocation:true', 'disable-model-invocation : "true"', 'disable-model-invocation: false', '"disable-model-invocation": true', "'disable-model-invocation': true"]) {
    assert.ok(hasFlag(['name: x', line]), line);
  }
  assert.ok(!hasFlag(['description: "mentions disable-model-invocation: true in the text"', '  disable-model-invocation: true']));
});
