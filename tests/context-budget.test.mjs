// The context budget for skill descriptions. Claude Code loads the description of every skill the model may start
// into every session, so those descriptions cost context all the time. A skill with `disable-model-invocation: true`
// costs nothing until the user types `/name`. This test keeps the auto tier (skills the model may start on its own)
// small and short. See "Context budget" in docs/BACKLOG.md for the policy.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const MAX_AUTO_SKILLS = 12;
const MAX_AUTO_DESCRIPTION = 400;
const MAX_AUTO_TOTAL = 4500;
const MAX_ANY_DESCRIPTION = 1536; // Claude Code cuts any description longer than this, typed or not.

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

function readSkills() {
  const out = [];
  for (const plugin of readdirSync(join(ROOT, 'skills')).filter((d) => !d.includes('.'))) {
    for (const name of readdirSync(join(ROOT, 'skills', plugin)).filter((d) => !d.includes('.'))) {
      const lines = readFileSync(join(ROOT, 'skills', plugin, name, 'SKILL.md'), 'utf8').split(/\r?\n/);
      const end = lines.indexOf('---', 1);
      const front = lines[0] === '---' && end > 0 ? lines.slice(1, end) : [];
      const { value: description = '', error } = parseDescription(front);
      const typed = front.some((l) => /^disable-model-invocation:\s*true\s*$/.test(l));
      out.push({ id: `${plugin}/${name}`, description, typed, error });
    }
  }
  return out;
}

// Each check returns what is wrong, so the same checks run on the repository and on the fixtures below.
const auto = (skills) => skills.filter((s) => !s.typed);
const checks = {
  empty: (skills) => skills.filter((s) => !s.description.trim()).map((s) => s.id),
  count: (skills) => {
    const ids = auto(skills).map((s) => s.id);
    return ids.length > MAX_AUTO_SKILLS ? [`${ids.length} auto-tier skills: ${ids.join(', ')}`] : [];
  },
  each: (skills) => auto(skills).filter((s) => s.description.length > MAX_AUTO_DESCRIPTION).map((s) => `${s.id}: ${s.description.length}`),
  total: (skills) => {
    const total = auto(skills).reduce((n, s) => n + s.description.length, 0);
    return total > MAX_AUTO_TOTAL ? [`auto-tier descriptions total ${total} characters`] : [];
  },
  any: (skills) => skills.filter((s) => s.description.length > MAX_ANY_DESCRIPTION).map((s) => `${s.id}: ${s.description.length}`),
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
  assert.ok(auto(SKILLS).length >= 1, 'no auto-tier skill found');
  assert.ok(SKILLS.some((s) => s.typed), 'no typed-tier skill found');
});

test('every skill has a non-empty description (the / menu shows it)', () => {
  assert.deepEqual(checks.empty(SKILLS), []);
});

test(`at most ${MAX_AUTO_SKILLS} skills are in the auto tier`, () => {
  assert.deepEqual(checks.count(SKILLS), []);
});

test(`each auto-tier description is at most ${MAX_AUTO_DESCRIPTION} characters`, () => {
  assert.deepEqual(checks.each(SKILLS), []);
});

test(`auto-tier descriptions total at most ${MAX_AUTO_TOTAL} characters`, () => {
  assert.deepEqual(checks.total(SKILLS), []);
});

test(`every description is at most ${MAX_ANY_DESCRIPTION} characters`, () => {
  assert.deepEqual(checks.any(SKILLS), []);
});

test('each check flags one character or one skill over its limit, and nothing at the limit', () => {
  const skill = (id, length, typed = false) => ({ id, description: 'x'.repeat(length), typed });
  // At every limit at once: the most auto-tier skills, sharing the whole total, and a typed skill at the hard cap.
  const share = Math.floor(MAX_AUTO_TOTAL / MAX_AUTO_SKILLS);
  const sizes = Array.from({ length: MAX_AUTO_SKILLS }, (_, i) => (i === 0 ? MAX_AUTO_TOTAL - share * (MAX_AUTO_SKILLS - 1) : share));
  const atLimit = [...sizes.map((n, i) => skill(`a${i}`, n)), skill('t', MAX_ANY_DESCRIPTION, true)];
  assert.ok(sizes.every((n) => n <= MAX_AUTO_DESCRIPTION), 'fixture: the shares must fit the per-description limit');
  for (const [name, check] of Object.entries(checks)) assert.deepEqual(check(atLimit), [], name);

  assert.equal(checks.count([...atLimit, skill('extra', 0, false)]).length, 1);
  assert.deepEqual(checks.each([skill('long', MAX_AUTO_DESCRIPTION + 1)]), [`long: ${MAX_AUTO_DESCRIPTION + 1}`]);
  assert.deepEqual(checks.each([skill('typed', MAX_AUTO_DESCRIPTION + 1, true)]), []);
  const overTotal = atLimit.map((s) => (s.id === 'a1' ? skill('a1', share + 1) : s));
  assert.deepEqual(checks.total(overTotal), [`auto-tier descriptions total ${MAX_AUTO_TOTAL + 1} characters`]);
  assert.deepEqual(checks.any([skill('huge', MAX_ANY_DESCRIPTION + 1, true)]), [`huge: ${MAX_ANY_DESCRIPTION + 1}`]);
  assert.deepEqual(checks.empty([{ id: 'blank', description: ' ', typed: true }]), ['blank']);
});
