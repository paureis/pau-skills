#!/usr/bin/env node
// Build the `pau-skills` bundle entry in .claude-plugin/marketplace.json from the individual plugins.
//
//   node scripts/build-bundle.mjs           rewrite the bundle entry's skills and hooks
//   node scripts/build-bundle.mjs --check   exit 1 if the entry is out of date (used by the tests)
//
// The bundle installs every skill and hook in the marketplace as one plugin. Its source is the repository root, so
// its component paths can reach into plugins/<name>/ without leaving the plugin directory, and nothing is copied.
// Claude Code only accepts hooks inline in a marketplace entry, so this script inlines each plugin's hooks.json,
// rewriting ${CLAUDE_PLUGIN_ROOT}/scripts/ to ${CLAUDE_PLUGIN_ROOT}/plugins/<name>/scripts/. Edit a plugin's
// hooks.json, then run this script; never edit the bundle's hooks by hand.
import { readFileSync, writeFileSync, existsSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const BUNDLE = 'pau-skills';

/** The bundle entry's skills and hooks, computed from the repository. Pure apart from reading files. */
export function compute(root) {
  const market = JSON.parse(readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const skills = [];
  const hooks = {};
  for (const p of market.plugins) {
    if (p.name === BUNDLE) continue;
    const dir = p.source.replace(/^\.\//, '');
    if (existsSync(join(root, dir, 'skills'))) skills.push(`./${dir}/skills/`);
    const hooksFile = join(root, dir, 'hooks', 'hooks.json');
    if (!existsSync(hooksFile)) continue;
    const text = readFileSync(hooksFile, 'utf8').split('${CLAUDE_PLUGIN_ROOT}/scripts/').join('${CLAUDE_PLUGIN_ROOT}/' + dir + '/scripts/');
    for (const [event, groups] of Object.entries(JSON.parse(text).hooks || {})) {
      hooks[event] = [...(hooks[event] || []), ...groups];
    }
  }
  return { market, skills, hooks };
}

export function build(root) {
  const { market, skills, hooks } = compute(root);
  const entry = market.plugins.find((p) => p.name === BUNDLE);
  if (!entry) throw new Error(`marketplace.json has no "${BUNDLE}" entry`);
  entry.skills = skills;
  entry.hooks = hooks;
  return JSON.stringify(market, null, 2) + '\n';
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '..');
  const file = join(root, '.claude-plugin', 'marketplace.json');
  const next = build(root);
  if (process.argv.includes('--check')) {
    if (readFileSync(file, 'utf8') !== next) { console.error('The pau-skills bundle entry is out of date. Run: node scripts/build-bundle.mjs'); process.exit(1); }
    console.log('Bundle entry is up to date.');
  } else {
    writeFileSync(file, next);
    console.log('Bundle entry rebuilt.');
  }
}
