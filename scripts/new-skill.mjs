#!/usr/bin/env node
// Scaffold a new skill in one of the marketplace's plugins.
//
//   node scripts/new-skill.mjs <plugin> <skill-name> [--root <repo dir>]
//
// Creates plugins/<plugin>/skills/<skill-name>/SKILL.md with frontmatter, adds a stub section for it at the end of
// the plugin's group in docs/ORIGINS.md, and adds a bullet for it to the plugin's list in the README reference. Every
// placeholder is marked TODO(new-skill); the scrub check fails while any is left, so a half-filled scaffold cannot be
// committed by accident. Refuses an unknown plugin, a name that is not kebab-case, a name that already exists in any
// plugin, and a repository whose anchors are missing or ambiguous. It changes nothing unless every check passes.
// Exit codes: 0 created; 2 refused. See docs/ADDING-A-SKILL.md for the rest of the checklist.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MARK = 'TODO(new-skill)';

/** Plan the three edits without touching the disk. Returns { files: [{ path, text }] } or throws with the reason. */
export function plan(root, pluginName, skill) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skill || '')) throw new Error(`the skill name must be kebab-case (a-z, 0-9, single dashes): ${skill}`);
  if (skill.startsWith('claude-') || skill.startsWith('anthropic-')) throw new Error(`names starting with claude- or anthropic- are reserved: ${skill}`);
  const pluginsDir = join(root, 'plugins');
  const plugins = existsSync(pluginsDir) ? readdirSync(pluginsDir).filter((p) => existsSync(join(pluginsDir, p, '.claude-plugin', 'plugin.json'))) : [];
  if (!plugins.includes(pluginName)) throw new Error(`unknown plugin "${pluginName}"; plugins: ${plugins.join(', ') || 'none'}`);
  for (const p of plugins) {
    if (existsSync(join(pluginsDir, p, 'skills', skill))) throw new Error(`a skill named "${skill}" already exists in plugin ${p}`);
  }

  const originsPath = join(root, 'docs', 'ORIGINS.md');
  const readmePath = join(root, 'README.md');
  const origins = readFileSync(originsPath, 'utf8');
  const readme = readFileSync(readmePath, 'utf8');
  if (new RegExp('^### ' + skill + ' \\(', 'm').test(origins)) throw new Error(`docs/ORIGINS.md already has a section for ${skill}`);
  if (readme.includes('- **' + skill + '**')) throw new Error(`README.md already lists ${skill}`);

  // ORIGINS: insert before the "---" that closes the plugin's group. The group heading must occur exactly once.
  const heading = '\n## ' + pluginName + '\n';
  const at = origins.indexOf(heading);
  if (at < 0 || origins.indexOf(heading, at + 1) >= 0) throw new Error(`docs/ORIGINS.md must have exactly one "## ${pluginName}" heading`);
  const close = origins.indexOf('\n---\n', at + heading.length);
  if (close < 0) throw new Error(`docs/ORIGINS.md: no "---" closes the ${pluginName} group`);
  const stub = [
    '',
    `### ${skill} (${MARK}: Original | Adapted from <upstream link>)`,
    '',
    `${MARK}: for an adapted skill, the closest upstream version and how much text is shared.`,
    '',
    `**Problem.** ${MARK}: the failure or need that led to it, with names removed.`,
    '',
    `**Changes for this release.** ${MARK}: what generalising it changed (or "None"). For an adapted skill, a`,
    `"What this version changes" list taken from a diff against upstream, and why.`,
    '',
  ].join('\n');
  const newOrigins = origins.slice(0, close) + '\n' + stub + origins.slice(close);

  // README: insert a bullet at the end of the plugin's skill list in its "### <plugin>" reference section, before the
  // "- Hook" line when there is one.
  const lines = readme.split('\n');
  const head = lines.findIndex((l) => l === '### ' + pluginName);
  if (head < 0 || lines.indexOf('### ' + pluginName, head + 1) >= 0) throw new Error(`README.md must have exactly one "### ${pluginName}" heading`);
  let first = head + 1;
  while (first < lines.length && lines[first] === '') first++;
  let insert = -1;
  for (let k = first; k < lines.length && !lines[k].startsWith('#'); k++) {
    if (/^- Hooks?:/.test(lines[k])) { insert = k; break; }
    if (lines[k].startsWith('- **') || lines[k].startsWith('  ')) insert = k + 1;
    else if (lines[k] === '' && insert >= 0) break;
  }
  if (insert < 0) throw new Error(`README.md: no skill list under "### ${pluginName}"`);
  lines.splice(insert, 0, `- **${skill}**: ${MARK}: one line on what it does (add " (adapted)" after the name if it is).`);

  const skillMd = [
    '---',
    `name: ${skill}`,
    `description: ${MARK}: what the skill does, then "Use when ..." with the phrases a user would actually type.`,
    '---',
    '',
    `# ${skill}`,
    '',
    `${MARK}: the instructions. Reference bundled files as \${CLAUDE_PLUGIN_ROOT}/skills/${skill}/<file>.`,
    '',
  ].join('\n');

  return {
    files: [
      { path: join(pluginsDir, pluginName, 'skills', skill, 'SKILL.md'), text: skillMd, create: true },
      { path: originsPath, text: newOrigins },
      { path: readmePath, text: lines.join('\n') },
    ],
  };
}

function main(argv) {
  const i = argv.indexOf('--root');
  const root = i >= 0 ? argv[i + 1] : join(dirname(fileURLToPath(import.meta.url)), '..');
  const rest = i >= 0 ? argv.filter((_, k) => k !== i && k !== i + 1) : argv;
  if (rest.length !== 2 || !root) {
    console.error('Usage: node scripts/new-skill.mjs <plugin> <skill-name> [--root <repo dir>]');
    return 2;
  }
  let p;
  try { p = plan(root, rest[0], rest[1]); } catch (e) { console.error('NOT CREATED: ' + e.message); return 2; }
  for (const f of p.files) {
    if (f.create) mkdirSync(dirname(f.path), { recursive: true });
    writeFileSync(f.path, f.text);
    console.log((f.create ? 'created  ' : 'updated  ') + f.path);
  }
  console.log(`\nNext: fill every ${MARK} placeholder, then follow docs/ADDING-A-SKILL.md (the scrub check fails until none is left).`);
  return 0;
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) process.exit(main(process.argv.slice(2)));
