// geppetto's designer template and its fixture design system: the template passes the audit next to the roster and
// follows its design, and the fixture uses only tokens and needs one value the tokens do not have. Shared setup is in
// geppetto.helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, copyFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { repo, tempDir } from './helpers.mjs';
import { audit, parseFrontmatter, parseTools, covenantOf, rulesOf } from '../skills/agent-orchestration/geppetto/check-agents.mjs';
import { ROSTER, COVENANT, TEMPLATES } from './geppetto.helpers.mjs';

const DESIGNER = join(TEMPLATES, 'designer.md');
const FIXTURE = repo('tests', 'fixtures', 'geppetto-designer');
const SYSTEM = join(FIXTURE, 'design-system');

const filesUnder = (dir) => readdirSync(dir).sort().flatMap((n) => {
  const p = join(dir, n);
  return statSync(p).isDirectory() ? filesUnder(p) : [p];
});

test('the designer template passes the audit with no findings', () => {
  const r = audit({ dir: TEMPLATES, project: tempDir(), user: tempDir() });
  assert.deepEqual(r.agents.map((a) => a.data.name), ['designer']);
  assert.deepEqual(r.findings, []);
});

test('the designer and the bundled roster together have no findings: no overlap with builder or any other agent', () => {
  const dir = tempDir();
  for (const f of readdirSync(ROSTER).filter((x) => x.endsWith('.md'))) copyFileSync(join(ROSTER, f), join(dir, f));
  copyFileSync(DESIGNER, join(dir, 'designer.md'));
  const r = audit({ dir, project: tempDir(), user: tempDir() });
  assert.deepEqual(r.agents.map((a) => a.data.name).sort(), ['builder', 'designer', 'eng-lead', 'reviewer', 'sweeper', 'writer']);
  assert.deepEqual(r.findings, []);
});

test('the designer follows the design: tools, no memory, no production rules block, the design system and report sections, current roster version, no ${CLAUDE_SKILL_DIR}', () => {
  const text = readFileSync(DESIGNER, 'utf8');
  const { data: d, body } = parseFrontmatter(text);
  assert.equal(d.name, 'designer');
  assert.deepEqual(parseTools(d.tools), ['Read', 'Glob', 'Grep', 'Edit', 'Write']);
  assert.equal(d.model, 'inherit');
  assert.ok(d.description.length <= 200, `description is ${d.description.length} characters`);
  for (const key of ['memory', 'isolation', 'mcpServers', 'skills']) assert.equal(d[key], undefined, key);
  assert.equal(rulesOf(text).block, null);
  assert.doesNotMatch(text, /production rules start/);
  assert.match(body, /^## The design system$/m);
  assert.match(body, /^## Report$/m);
  assert.match(body.slice(body.search(/^## Report$/m)), /Invented values/);
  const c = covenantOf(text);
  assert.equal(c.version, COVENANT.version);
  assert.equal(c.block, COVENANT.block);
  assert.doesNotMatch(text, /CLAUDE_SKILL_DIR/);
});

test('the fixture keyframe and components use only tokens: no colour, size, duration or font literal outside the tokens file', () => {
  const literals = [
    /#[0-9a-fA-F]{3,8}\b/,
    /\b(?:rgb|rgba|hsl|hsla)\(/,
    /(?<![\w-])\d*\.?\d+(?:(?:px|rem|em|ms|s|vh|vw)\b|%)/,
    /font-family\s*:(?!\s*var\()/,
    /font-weight\s*:(?!\s*var\()/,
    /line-height\s*:(?!\s*var\()/,
  ];
  const scanned = filesUnder(SYSTEM).filter((f) => !f.endsWith('.md') && !f.endsWith('tokens.css'));
  const names = scanned.map((f) => relative(SYSTEM, f).split('\\').join('/'));
  for (const n of ['components/button.css', 'components/card.css', 'components/field.css', 'screens/sign-in.html']) assert.ok(names.includes(n), n);
  for (const f of scanned) {
    readFileSync(f, 'utf8').split('\n').forEach((line, i) => {
      for (const re of literals) assert.doesNotMatch(line, re, `${relative(SYSTEM, f)}:${i + 1}`);
    });
  }
  assert.match(readFileSync(join(SYSTEM, 'components', 'button.css'), 'utf8'), /background:\s*var\(--color-primary\)/);
});

test('the fixture brief needs a value the tokens do not have, and nothing in the copied folder says what to flag', () => {
  assert.doesNotMatch(readFileSync(join(SYSTEM, 'tokens.css'), 'utf8'), /success|positive|green/i);
  assert.match(readFileSync(join(SYSTEM, 'BRIEF.md'), 'utf8'), /success/i);
  assert.match(readFileSync(join(FIXTURE, 'README.md'), 'utf8'), /success colou?r/i);
  for (const f of filesUnder(SYSTEM)) assert.doesNotMatch(readFileSync(f, 'utf8'), /invent/i, relative(SYSTEM, f));
});
