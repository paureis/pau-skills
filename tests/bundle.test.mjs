// The pau-skills bundle entry carries every plugin's skills and hooks, kept in sync by scripts/build-bundle.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { build, BUNDLE } from '../scripts/build-bundle.mjs';

const market = JSON.parse(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'));
const bundle = market.plugins.find((p) => p.name === BUNDLE);

test('the bundle entry is up to date with the plugins (run node scripts/build-bundle.mjs)', () => {
  assert.equal(readFileSync(join(ROOT, '.claude-plugin', 'marketplace.json'), 'utf8'), build(ROOT));
});

test('the bundle is rooted at the repository and is not strict', () => {
  assert.equal(bundle.source, './');
  assert.equal(bundle.strict, false);
});

test('every hook command in the bundle points at a script that exists', () => {
  const cmds = Object.values(bundle.hooks).flat().flatMap((g) => g.hooks.map((h) => h.command));
  assert.ok(cmds.length >= 11, `expected at least 11 hook commands, got ${cmds.length}`);
  for (const c of cmds) {
    const m = /\$\{CLAUDE_PLUGIN_ROOT\}\/([^"]+)/.exec(c);
    assert.ok(m && existsSync(join(ROOT, m[1])), `missing script for: ${c}`);
  }
});

test('the bundle lists every plugin skills folder, and every skill has a SKILL.md with a matching name', () => {
  const plugins = market.plugins.filter((p) => p.name !== BUNDLE);
  for (const p of plugins) {
    const dir = join(ROOT, p.source, 'skills');
    if (!existsSync(dir)) continue;
    assert.ok(bundle.skills.includes(`./${p.source.replace(/^\.\//, '')}/skills/`), `${p.name} skills missing from the bundle`);
    for (const s of readdirSync(dir)) {
      const text = readFileSync(join(dir, s, 'SKILL.md'), 'utf8');
      assert.match(text, new RegExp(`^---\\r?\\nname: ${s}\\r?\\n`), `${p.name}/${s}: frontmatter name must equal the folder name`);
      assert.match(text, /\ndescription: \S/, `${p.name}/${s}: description missing`);
    }
  }
});

test('plugin versions agree between plugin.json and the marketplace', () => {
  for (const p of market.plugins.filter((x) => x.name !== BUNDLE)) {
    const manifest = JSON.parse(readFileSync(join(ROOT, p.source, '.claude-plugin', 'plugin.json'), 'utf8'));
    assert.equal(manifest.version, p.version, `${p.name}: plugin.json ${manifest.version} vs marketplace ${p.version}`);
  }
});
