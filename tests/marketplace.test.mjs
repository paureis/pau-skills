// The marketplace: every plugin is rooted at the repository and points at skills/<plugin>/ and hooks/<plugin>/, the
// pau-skills bundle carries everything, and every skill and hook on disk is reachable from it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { build, BUNDLE } from '../scripts/build-marketplace.mjs';

const market = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
const bundle = market.plugins.find((p) => p.name === BUNDLE);
const plugins = market.plugins.filter((p) => p.name !== BUNDLE);
const commandsOf = (entry) => Object.values(entry.hooks || {}).flat().flatMap((g) => g.hooks.map((h) => h.command));

test('marketplace.json is up to date with the folders (run node scripts/build-marketplace.mjs)', () => {
  assert.equal(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'), build(ROOT));
});

test('every plugin is rooted at the repository, not strict, and has a version', () => {
  for (const p of market.plugins) {
    assert.equal(p.source, './', p.name);
    assert.equal(p.strict, false, p.name);
    assert.match(p.version || '', /^\d+\.\d+\.\d+$/, p.name);
  }
});

test('every skills/<plugin> folder belongs to a plugin entry, and the bundle lists them all', () => {
  const folders = readdirSync(join(ROOT, 'skills')).filter((d) => existsSync(join(ROOT, 'skills', d)) && !d.includes('.'));
  assert.deepEqual(folders.sort(), plugins.map((p) => p.name).sort());
  assert.deepEqual([...bundle.skills].sort(), folders.map((f) => `./skills/${f}/`).sort());
});

test('there is no plugin manifest at the root (it would conflict with strict: false)', () => {
  assert.equal(existsSync(join(ROOT, '.claude-plugin', 'plugin.json')), false);
});

test('every hook command points at a script that exists, and the bundle runs every hook', () => {
  const all = plugins.flatMap(commandsOf);
  assert.ok(all.length >= 11, `expected at least 11 hook commands, got ${all.length}`);
  for (const c of all) {
    const m = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)/.exec(c);
    assert.ok(m && existsSync(join(ROOT, m[1])), `missing script for: ${c}`);
  }
  assert.deepEqual(commandsOf(bundle).sort(), all.sort());
});

test('every skill has a SKILL.md whose name equals its folder, and a description', () => {
  for (const p of plugins) {
    for (const s of readdirSync(join(ROOT, 'skills', p.name)).filter((d) => !d.includes('.'))) {
      const text = readFileSync(join(ROOT, 'skills', p.name, s, 'SKILL.md'), 'utf8');
      assert.match(text, new RegExp(`^---\\r?\\nname: ${s}\\r?\\n`), `${p.name}/${s}: frontmatter name must equal the folder name`);
      assert.match(text, /\ndescription: \S/, `${p.name}/${s}: description missing`);
    }
  }
});

test('skill names are unique across plugins', () => {
  const names = plugins.flatMap((p) => readdirSync(join(ROOT, 'skills', p.name)).filter((d) => !d.includes('.')));
  assert.equal(new Set(names).size, names.length);
});

test('every skill description is valid YAML: an unquoted one has no ": " or " #" in it', () => {
  for (const p of plugins) {
    for (const s of readdirSync(join(ROOT, 'skills', p.name)).filter((d) => !d.includes('.'))) {
      const line = readFileSync(join(ROOT, 'skills', p.name, s, 'SKILL.md'), 'utf8').split(/\r?\n/).find((l) => l.startsWith('description: '));
      const value = line.slice('description: '.length);
      if (/^["']/.test(value)) continue;
      assert.ok(!/: | #/.test(value), `${p.name}/${s}: quote the description, it contains ": " or " #" which YAML reads as structure`);
    }
  }
});

test('every ${CLAUDE_PLUGIN_ROOT}/ path mentioned in a skill or hook file exists', () => {
  const missing = [];
  const walk = (dir) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const f = join(dir, e.name);
      if (e.isDirectory()) { walk(f); continue; }
      if (!/\.(md|mjs|json|sh|py)$/.test(e.name)) continue;
      for (const m of readFileSync(f, 'utf8').matchAll(/\$\{CLAUDE_PLUGIN_ROOT\}\/([A-Za-z0-9._\/-]+)/g)) {
        const rel = m[1].replace(/[.,:;)]+$/, '');
        if (rel.includes('*') || rel.endsWith('...')) continue;
        if (!existsSync(join(ROOT, rel))) missing.push(`${f.slice(ROOT.length + 1)}: ${rel}`);
      }
    }
  };
  walk(join(ROOT, 'skills'));
  walk(join(ROOT, 'hooks'));
  assert.deepEqual(missing, []);
});
