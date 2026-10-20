#!/usr/bin/env node
// Scaffold a new skill in one of the marketplace's plugins.
//
//   node scripts/new-skill.mjs <plugin> <skill-name> [--root <repo dir>]
//
// Creates skills/<plugin>/<skill-name>/SKILL.md with frontmatter and the ORIGINS stub file
// docs/origins/<plugin>/<skill-name>.md, adds a line linking that file at the end of the plugin's list in the
// docs/ORIGINS.md index, and adds a bullet for the skill at the end of the plugin's list in docs/REFERENCE.md. Every
// placeholder is marked TODO(new-skill); the scrub check fails while any is left, so a half-filled scaffold cannot be
// committed by accident. Refuses an unknown plugin, a name that is not kebab-case, a name that already exists in any
// plugin, a stub file, index line or reference bullet that already exists, and a repository whose anchors are missing
// or ambiguous. It changes nothing unless every check passes.
// Exit codes: 0 created; 2 refused. See docs/ADDING-A-SKILL.md for the rest of the checklist.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const MARK = 'TODO(new-skill)';

/** Plan the four edits without touching the disk. Returns { files: [{ path, text }] } or throws with the reason. */
export function plan(root, pluginName, skill) {
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(skill || '')) throw new Error(`the skill name must be kebab-case (a-z, 0-9, single dashes): ${skill}`);
  // claude.ai refuses to upload a skill whose name contains either word anywhere.
  if (/claude|anthropic/.test(skill)) throw new Error(`names containing "claude" or "anthropic" are reserved: ${skill}`);
  const pluginsDir = join(root, 'skills');
  const plugins = existsSync(pluginsDir) ? readdirSync(pluginsDir).filter((p) => !p.includes('.')) : [];
  if (!plugins.includes(pluginName)) throw new Error(`unknown plugin "${pluginName}"; plugins: ${plugins.join(', ') || 'none'}`);
  for (const p of plugins) {
    if (existsSync(join(pluginsDir, p, skill))) throw new Error(`a skill named "${skill}" already exists in plugin ${p}`);
  }

  const originsPath = join(root, 'docs', 'ORIGINS.md');
  const stubPath = join(root, 'docs', 'origins', pluginName, skill + '.md');
  const referencePath = join(root, 'docs', 'REFERENCE.md');
  const origins = readFileSync(originsPath, 'utf8');
  const reference = readFileSync(referencePath, 'utf8');
  const stubLink = `origins/${pluginName}/${skill}.md`;
  if (existsSync(stubPath)) throw new Error(`docs/${stubLink} already exists`);
  if (origins.includes('](' + stubLink + ')')) throw new Error(`docs/ORIGINS.md already has a line for ${skill}`);
  if (reference.includes('- **' + skill + '**') || reference.includes('- **[' + skill + '](')) throw new Error(`docs/REFERENCE.md already lists ${skill}`);

  // ORIGINS stub: one file per entry, its heading at level 1, then a link back to the index.
  const classification = `${MARK}: Original | Adapted from <upstream link>`;
  const stub = [
    `# ${skill} (${classification})`,
    '',
    'Back to the [origins index](../../ORIGINS.md).',
    '',
    `${MARK}: for an adapted skill, the closest upstream version and how much text is shared.`,
    '',
    `**Problem.** ${MARK}: the failure or need that led to it, with names removed.`,
    '',
    `**Changes for this release.** ${MARK}: what generalising it changed (or "None"). For an adapted skill, a`,
    `"What this version changes" list taken from a diff against upstream, and why.`,
    '',
  ].join('\n');

  // ORIGINS index: a line at the end of the plugin's list. The group heading must occur exactly once.
  const index = origins.split('\n');
  const group = index.indexOf('## ' + pluginName);
  if (group < 0 || index.indexOf('## ' + pluginName, group + 1) >= 0) throw new Error(`docs/ORIGINS.md must have exactly one "## ${pluginName}" heading`);
  const at = listEnd(index, group, (l) => l.startsWith('- ['));
  if (at < 0) throw new Error(`docs/ORIGINS.md: no entry list under "## ${pluginName}"`);
  index.splice(at, 0, `- [${skill}](${stubLink}): ${classification}`);

  // REFERENCE: a bullet at the end of the plugin's skill list in its "## <plugin>" section, before the "- Hook" line
  // when there is one.
  const lines = reference.split('\n');
  const head = lines.indexOf('## ' + pluginName);
  if (head < 0 || lines.indexOf('## ' + pluginName, head + 1) >= 0) throw new Error(`docs/REFERENCE.md must have exactly one "## ${pluginName}" heading`);
  const insert = listEnd(lines, head, (l) => l.startsWith('- **'));
  if (insert < 0) throw new Error(`docs/REFERENCE.md: no skill list under "## ${pluginName}"`);
  lines.splice(insert, 0, `- **[${skill}](../skills/${pluginName}/${skill}/SKILL.md)**: ${MARK}: one line on what it does (add " (adapted)" after the name if it is).`);

  const skillMd = [
    '---',
    `name: ${skill}`,
    // Every skill loads on its own, so the description is in every session's context: one sentence, then the phrases
    // a user would actually say, at most 400 characters (docs/ADDING-A-SKILL.md, step 2).
    `description: ${MARK}: one sentence on what the skill does, then "Use when ..." with the phrases a user would actually say.`,
    '---',
    '',
    `# ${skill}`,
    '',
    `${MARK}: the instructions. Reference bundled files as \${CLAUDE_PLUGIN_ROOT}/skills/${pluginName}/${skill}/<file>.`,
    '',
  ].join('\n');

  return {
    files: [
      { path: join(pluginsDir, pluginName, skill, 'SKILL.md'), text: skillMd, create: true },
      { path: stubPath, text: stub, create: true },
      { path: originsPath, text: index.join('\n') },
      { path: referencePath, text: lines.join('\n') },
    ],
  };
}

/**
 * The line index just after the list that follows the heading at `head`, or before its "- Hook:" or "- Hooks:" line
 * when there is one. `isItem` tells a list item; an indented line continues one. A paragraph between the heading and
 * the list is skipped. Returns -1 when the section has neither a list nor a hooks line.
 */
function listEnd(lines, head, isItem) {
  let insert = -1;
  for (let k = head + 1; k < lines.length && !lines[k].startsWith('#') && lines[k] !== '---'; k++) {
    if (/^- Hooks?:/.test(lines[k])) return k;
    if (isItem(lines[k]) || lines[k].startsWith('  ')) insert = k + 1;
    else if (lines[k] === '' && insert >= 0) break;
  }
  return insert;
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
