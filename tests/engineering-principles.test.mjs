// engineering-principles keeps an index in SKILL.md and the detail in PRINCIPLES.md. The user steers with the names
// and the agent reads a principle's section before citing it, so the two files must name the same principles, in the
// same order, and every index entry must give its three parts: when it applies, the rule, the sign you skipped it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { repo } from './helpers.mjs';

const DIR = repo('skills', 'planning', 'engineering-principles');
const PARTS = ['When it applies', 'Rule', 'Sign you skipped it'];
// What the opening of PRINCIPLES.md promises for every section: the rule and why it holds (a plain paragraph before
// the first labelled one), how to apply it, and the sign you skipped it.
const SECTION_LABELS = ['How to apply it', 'Sign you skipped it'];

// Lines outside fenced code blocks, so an example in a fence is never read as a heading.
function outsideFences(text) {
  const out = [];
  let fence = null;
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*(`{3,}|~{3,})/.exec(line);
    if (fence) {
      if (m && m[1][0] === fence[0] && m[1].length >= fence.length && /^\s*(`{3,}|~{3,})\s*$/.test(line)) fence = null;
      continue;
    }
    if (m) { fence = m[1]; continue; }
    out.push(line);
  }
  return out;
}

// The index is every `### <name>` under `## Index`, up to the next `## ` heading. Each entry's parts are its
// `- **<part>:** <text>` bullets.
export function parseIndex(text) {
  const entries = [];
  let inIndex = false;
  let current = null;
  for (const line of outsideFences(text)) {
    if (/^## /.test(line)) { inIndex = /^## Index\s*$/.test(line); current = null; continue; }
    if (!inIndex) continue;
    const h = /^### (.+?)\s*$/.exec(line);
    if (h) { current = { name: h[1], parts: {} }; entries.push(current); continue; }
    const p = /^- \*\*(.+?):\*\*\s*(.*)$/.exec(line);
    if (p && current) {
      current.parts[p[1]] = current.parts[p[1]] === undefined ? p[2].trim() : null; // null marks a repeated part
      current.last = p[1];
      continue;
    }
    if (current && current.last && /^\s+\S/.test(line) && typeof current.parts[current.last] === 'string') {
      current.parts[current.last] = (current.parts[current.last] + ' ' + line.trim()).trim();
    }
  }
  return entries.map(({ name, parts }) => ({ name, parts }));
}

// PRINCIPLES.md has one `## <name>` section per principle, with its text up to the next `## ` heading.
export function parseSections(text) {
  const sections = [];
  for (const line of outsideFences(text)) {
    const h = /^## (.+?)\s*$/.exec(line);
    if (h) { sections.push({ name: h[1], body: '' }); continue; }
    if (sections.length) sections[sections.length - 1].body += line + '\n';
  }
  return sections;
}

// Every problem with the pair of files, as readable lines; none means they agree.
export function problems(skillText, principlesText) {
  const out = [];
  const index = parseIndex(skillText);
  const sections = parseSections(principlesText);
  if (index.length === 0) out.push('SKILL.md has no entries under "## Index"');
  for (const e of index) {
    for (const part of PARTS) {
      if (e.parts[part] === null) out.push(`index entry "${e.name}" gives "${part}" twice`);
      else if (!e.parts[part]) out.push(`index entry "${e.name}" has no "${part}"`);
    }
    for (const extra of Object.keys(e.parts).filter((k) => !PARTS.includes(k))) {
      out.push(`index entry "${e.name}" has an unknown part "${extra}"`);
    }
  }
  const names = index.map((e) => e.name);
  const titles = sections.map((s) => s.name);
  for (const n of names) if (!titles.includes(n)) out.push(`index entry "${n}" has no section in PRINCIPLES.md`);
  for (const t of titles) if (!names.includes(t)) out.push(`PRINCIPLES.md section "${t}" is not in the index`);
  for (const list of [names, titles]) {
    for (const d of list.filter((n, i) => list.indexOf(n) !== i)) out.push(`"${d}" appears twice`);
  }
  const shared = names.filter((n) => titles.includes(n));
  const order = titles.filter((t) => names.includes(t));
  if (shared.join('\n') !== order.join('\n')) out.push('the index and PRINCIPLES.md list the principles in different orders');
  for (const s of sections) {
    if (!s.body.trim()) { out.push(`PRINCIPLES.md section "${s.name}" is empty`); continue; }
    const first = s.body.trim().split(/\n\s*\n/)[0];
    if (/^\*\*/.test(first)) out.push(`PRINCIPLES.md section "${s.name}" has no rule paragraph before its labelled parts`);
    for (const label of SECTION_LABELS) {
      const n = s.body.split('\n').filter((l) => l.startsWith(`**${label}.**`)).length;
      if (n !== 1) out.push(`PRINCIPLES.md section "${s.name}" has ${n} "${label}" paragraphs, not one`);
    }
  }
  return out;
}

test('every principle in the index has a section of the same name in PRINCIPLES.md, and the other way round', () => {
  const skill = readFileSync(`${DIR}/SKILL.md`, 'utf8');
  const principles = readFileSync(`${DIR}/PRINCIPLES.md`, 'utf8');
  assert.deepEqual(problems(skill, principles), []);
  assert.ok(parseIndex(skill).length >= 10, 'the index lists the principles');
});

test('the check catches a missing part, a renamed section, a reordering, an empty section and a missing paragraph', () => {
  const entry = (name, parts = PARTS) => [`### ${name}`, ...parts.map((p) => `- **${p}:** text for ${p}.`), ''].join('\n');
  const skill = ['# X', '', '## Index', '', entry('Alpha'), entry('Beta'), '## After', '', '### Not an entry', ''].join('\n');
  const body = 'Body.\n\n**How to apply it.** Steps.\n\n**Sign you skipped it.** A sign.\n';
  const principles = `# Detail\n\n## Alpha\n\n${body}\n## Beta\n\n${body}`;
  assert.deepEqual(problems(skill, principles), [], 'a matching pair passes');
  assert.deepEqual(parseIndex(skill).map((e) => e.name), ['Alpha', 'Beta'], 'only entries under ## Index count');

  const noSign = skill.replace(entry('Beta'), entry('Beta', PARTS.slice(0, 2)));
  assert.deepEqual(problems(noSign, principles), ['index entry "Beta" has no "Sign you skipped it"']);

  const renamed = principles.replace('## Beta', '## Gamma');
  assert.deepEqual(problems(skill, renamed), [
    'index entry "Beta" has no section in PRINCIPLES.md',
    'PRINCIPLES.md section "Gamma" is not in the index',
  ]);

  const reordered = `# Detail\n\n## Beta\n\n${body}\n## Alpha\n\n${body}`;
  assert.deepEqual(problems(skill, reordered), ['the index and PRINCIPLES.md list the principles in different orders']);

  const empty = `# Detail\n\n## Alpha\n\n${body}\n## Beta\n\n`;
  assert.deepEqual(problems(skill, empty), ['PRINCIPLES.md section "Beta" is empty']);

  const noSignParagraph = `# Detail\n\n## Alpha\n\n${body}\n## Beta\n\n${body.replace('**Sign you skipped it.** A sign.\n', '')}`;
  assert.deepEqual(problems(skill, noSignParagraph), ['PRINCIPLES.md section "Beta" has 0 "Sign you skipped it" paragraphs, not one']);

  const noHow = `# Detail\n\n## Alpha\n\n${body.replace('**How to apply it.** Steps.\n\n', '')}\n## Beta\n\n${body}`;
  assert.deepEqual(problems(skill, noHow), ['PRINCIPLES.md section "Alpha" has 0 "How to apply it" paragraphs, not one']);

  const noRule = `# Detail\n\n## Alpha\n\n${body.replace('Body.\n\n', '')}\n## Beta\n\n${body}`;
  assert.deepEqual(problems(skill, noRule), ['PRINCIPLES.md section "Alpha" has no rule paragraph before its labelled parts']);

  const wrapped = skill.replace('- **Rule:** text for Rule.', '- **Rule:**\n  text on the next line.');
  assert.deepEqual(problems(wrapped, principles), [], 'a part may wrap onto indented lines');

  const fenced = principles + '\n```\n## Not a section\n```\n';
  assert.deepEqual(problems(skill, fenced), [], 'a heading inside a code fence is not a section');
});
