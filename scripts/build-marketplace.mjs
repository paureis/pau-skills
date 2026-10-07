#!/usr/bin/env node
// Fill in the component paths of every plugin in .claude-plugin/marketplace.json from the folders on disk.
//
//   node scripts/build-marketplace.mjs           rewrite the entries' source, skills and hooks
//   node scripts/build-marketplace.mjs --check   exit 1 if marketplace.json is out of date (used by the tests)
//
// Layout: skills live in skills/<plugin>/<skill>/SKILL.md and hooks in hooks/<plugin>/ (registered in
// hooks/<plugin>/hooks.json, commands written as ${CLAUDE_PLUGIN_ROOT}/hooks/<plugin>/<script>). Every plugin entry is
// rooted at the repository ("source": "./", "strict": false), so its paths reach skills/ and hooks/ directly and the
// hooks can share hooks/lib/. Claude Code only accepts hooks inline in a marketplace entry, so this script copies each
// hooks.json into its entry. The "pau-skills" entry gets every skill folder and every hook.
//
// Names, descriptions, versions and keywords are edited by hand in marketplace.json; this script never touches them.
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BUNDLE = 'pau-skills';

const hooksOf = (root, name) => {
  const file = join(root, 'hooks', name, 'hooks.json');
  return existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')).hooks || {} : {};
};

/** The marketplace JSON text, with every entry's components computed from the repository. */
export function build(root) {
  const market = JSON.parse(readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const allSkills = [];
  const allHooks = {};
  for (const entry of market.plugins) {
    if (entry.name === BUNDLE) continue;
    if (!existsSync(join(root, 'skills', entry.name))) throw new Error(`plugin ${entry.name} has no skills/${entry.name} folder`);
    const skills = [`./skills/${entry.name}/`];
    const hooks = hooksOf(root, entry.name);
    Object.assign(entry, { source: './', strict: false, skills });
    if (Object.keys(hooks).length) entry.hooks = hooks; else delete entry.hooks;
    allSkills.push(...skills);
    for (const [event, groups] of Object.entries(hooks)) allHooks[event] = [...(allHooks[event] || []), ...groups];
  }
  const bundle = market.plugins.find((p) => p.name === BUNDLE);
  if (!bundle) throw new Error(`marketplace.json has no "${BUNDLE}" entry`);
  Object.assign(bundle, { source: './', strict: false, skills: allSkills, hooks: allHooks });
  return JSON.stringify(market, null, 2) + '\n';
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const file = join(root, '.claude-plugin', 'marketplace.json');
  const next = build(root);
  if (process.argv.includes('--check')) {
    if (readFileSync(file, 'utf8') !== next) { console.error('marketplace.json is out of date. Run: node scripts/build-marketplace.mjs'); process.exit(1); }
    console.log('marketplace.json is up to date.');
  } else {
    writeFileSync(file, next);
    console.log('marketplace.json rebuilt.');
  }
}
