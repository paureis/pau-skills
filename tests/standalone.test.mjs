// Every skill must work when it is installed on its own, without the plugin and without any other skill. These tests
// check the mechanical part of that: a skill finds its files through ${CLAUDE_SKILL_DIR}, reaches outside its folder
// only for optional extras listed here, mentions another skill only as optional, and keeps copied scripts identical.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { ROOT } from './helpers.mjs';

// The router's whole job is to name other skills, so it is the one exception to the "if installed" rule.
const ROUTERS = new Set(['which-skill']);

// ${CLAUDE_PLUGIN_ROOT} paths outside the skill's own folder. Each one is an optional extra: the skill says what to
// do without it.
const OPTIONAL_OUTSIDE = {
  'guards/rule-to-hook': ['hooks/guards/', 'skills/verification/mutation-test/mutate.sh'],
  'verification/evaluator': ['skills/verification/mutation-test/mutate.sh'],
};

// A script a skill needs from another skill is copied into its folder. The copies must stay identical.
const COPIES = [['skills/session-discipline/retrospective/audit.mjs', 'skills/session-discipline/session-close/audit.mjs']];

function skills() {
  const out = [];
  for (const plugin of readdirSync(join(ROOT, 'skills'), { withFileTypes: true }).filter((d) => d.isDirectory())) {
    for (const s of readdirSync(join(ROOT, 'skills', plugin.name), { withFileTypes: true }).filter((d) => d.isDirectory())) {
      out.push({ id: `${plugin.name}/${s.name}`, name: s.name, dir: join(ROOT, 'skills', plugin.name, s.name) });
    }
  }
  return out;
}

function files(dir, re) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) out.push(...files(f, re));
    else if (re.test(e.name)) out.push(f);
  }
  return out;
}

const ALL = skills();

test('no skill uses ${CLAUDE_PLUGIN_ROOT} for its own files', () => {
  const hits = [];
  for (const s of ALL) {
    for (const f of files(s.dir, /\.(md|mjs|sh|py|json)$/)) {
      if (readFileSync(f, 'utf8').includes(`\${CLAUDE_PLUGIN_ROOT}/skills/${s.id}/`)) hits.push(relative(ROOT, f));
    }
  }
  assert.deepEqual(hits, [], 'use ${CLAUDE_SKILL_DIR}/<file> (in SKILL.md) or a path relative to the skill folder');
});

test('a skill reaches outside its folder only for the optional extras listed in this test', () => {
  const found = {};
  for (const s of ALL) {
    for (const f of files(s.dir, /\.(md|mjs|sh|py|json)$/)) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9._\/-]+)/g)) {
        (found[s.id] ||= new Set()).add(m[1].replace(/[.,:;)`]+$/, '').replace(/\*\.mjs$/, ''));
      }
    }
  }
  const actual = Object.fromEntries(Object.entries(found).map(([k, v]) => [k, [...v].sort()]));
  const expected = Object.fromEntries(Object.entries(OPTIONAL_OUTSIDE).map(([k, v]) => [k, [...v].sort()]));
  assert.deepEqual(actual, expected);
});

test('relative links in a skill stay inside its folder', () => {
  const bad = [];
  for (const s of ALL) {
    for (const f of files(s.dir, /\.md$/)) {
      for (const m of readFileSync(f, 'utf8').matchAll(/\]\(([^)#\s]+)\)/g)) {
        const target = m[1];
        if (/^[a-z]+:/i.test(target)) continue; // a URL
        const abs = resolve(dirname(f), target);
        if (relative(s.dir, abs).startsWith('..') || !existsSync(abs)) bad.push(`${relative(ROOT, f)}: ${target}`);
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('a skill that names another skill says what to do if that skill is not installed', () => {
  const names = ALL.map((s) => s.name);
  const bad = [];
  for (const s of ALL) {
    if (ROUTERS.has(s.name)) continue;
    for (const f of files(s.dir, /\.md$/)) {
      for (const para of readFileSync(f, 'utf8').split(/\n\s*\n/)) {
        for (const other of names) {
          if (other === s.name || !para.includes('`' + other + '`')) continue;
          if (!/\bif\s+(it\s+is\s+|they\s+are\s+)?(also\s+)?installed\b|\bis\s+(also\s+)?installed\b/i.test(para)) {
            bad.push(`${relative(ROOT, f)}: \`${other}\` in "${para.trim().slice(0, 80)}..."`);
          }
        }
      }
    }
  }
  assert.deepEqual(bad, []);
});

test('scripts copied between skills are identical', () => {
  for (const [a, b] of COPIES) {
    assert.equal(readFileSync(join(ROOT, b), 'utf8'), readFileSync(join(ROOT, a), 'utf8'), `${b} differs from ${a}: copy it again`);
  }
});
