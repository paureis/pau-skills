// Part of scan.mjs (instructions-audit): finding the instruction files of a project and the file names in it.
// It imports scan-refs.mjs only; scan.mjs re-exports its public names.
import { readdirSync, statSync, realpathSync } from 'node:fs';
import { join, dirname, resolve, relative, sep } from 'node:path';
import { homedir } from 'node:os';
import { readMaybe } from './scan-refs.mjs';

// ---------------------------------------------------------------------------------------------------------------
// Discovery

const SKIP_DIRS = new Set(['node_modules', '.git', '.hg', '.svn', 'vendor', 'dist', 'build', 'out', 'target', 'bin', 'obj',
  '.next', '.nuxt', '.svelte-kit', '.turbo', '.cache', 'coverage', '.venv', 'venv', 'env', '__pycache__', '.tox',
  '.mypy_cache', '.pytest_cache', '.gradle', '.idea', '.vscode', 'Pods', 'DerivedData', '.terraform', 'tmp', '.yarn', '.pnpm-store']);
const NESTED_NAMES = ['CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md'];

/** Root-level instruction files: [relative path or directory, scope, loads]. "loads" is when Claude Code reads it:
 *  every-session, conditional (path-scoped rules), in-subtree (nested), other-tool (read by a different agent). */
const ROOT_FILES = [
  ['CLAUDE.md', 'project', 'every-session'],
  ['.claude/CLAUDE.md', 'project', 'every-session'],
  ['CLAUDE.local.md', 'local', 'every-session'],
  ['AGENTS.md', 'agents', 'other-tool'],
  ['AGENT.md', 'agents', 'other-tool'],
  ['GEMINI.md', 'agents', 'other-tool'],
  ['.cursorrules', 'cursor', 'other-tool'],
  ['.windsurfrules', 'windsurf', 'other-tool'],
  ['.clinerules', 'cline', 'other-tool'],
  ['.github/copilot-instructions.md', 'copilot', 'other-tool'],
];
const ROOT_DIRS = [
  ['.claude/rules', 'rules', 'every-session', /\.md$/i],
  ['.cursor/rules', 'cursor', 'other-tool', /\.(mdc|md)$/i],
  ['.github/instructions', 'copilot', 'other-tool', /\.instructions\.md$/i],
  ['.clinerules', 'cline', 'other-tool', /\.md$/i],
  ['.windsurf/rules', 'windsurf', 'other-tool', /\.md$/i],
];

const isFile = (p) => { try { return statSync(p).isFile(); } catch { return false; } };
const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
const real = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };

function walkFiles(dir, re, depth = 0, out = []) {
  if (depth > 4 || !isDir(dir)) return out;
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walkFiles(p, re, depth + 1, out);
    else if (re.test(e.name)) out.push(p);
  }
  return out.sort();
}

/** A rules file with a `paths:` (or `globs:` / `applyTo:`) frontmatter key loads only for matching files. */
export const isPathScoped = (text) => { const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text); return !!m && /^(paths|globs|applyTo)\s*:/m.test(m[1]); };

/** Find the instruction files for a project. Returns [{ path, scope, loads }], deduplicated by real path. */
export function discoverFiles(root, { home = homedir(), maxDepth = 6, ancestors = true, maxDirs = 20000 } = {}) {
  root = resolve(root);
  const found = []; const seen = new Set();
  const add = (path, scope, loads) => { if (!isFile(path)) return; const r = real(path); if (seen.has(r)) return; seen.add(r); found.push({ path, scope, loads }); };

  if (home) {
    add(join(home, '.claude', 'CLAUDE.md'), 'global', 'every-session');
    for (const f of walkFiles(join(home, '.claude', 'rules'), /\.md$/i)) add(f, 'global', isPathScoped(readMaybe(f) || '') ? 'conditional' : 'every-session');
  }
  if (ancestors) {
    let d = dirname(root);
    const chain = [];
    while (d && d !== dirname(d)) { chain.push(d); d = dirname(d); }
    for (const a of chain.reverse()) for (const n of ['CLAUDE.md', 'CLAUDE.local.md']) add(join(a, n), 'ancestor', 'every-session');
  }
  for (const [rel, scope, loads] of ROOT_FILES) add(join(root, rel), scope, loads);
  for (const [rel, scope, loads, re] of ROOT_DIRS) {
    for (const f of walkFiles(join(root, rel), re)) {
      const l = loads === 'every-session' && isPathScoped(readMaybe(f) || '') ? 'conditional' : loads;
      add(f, scope, l);
    }
  }
  // Nested files, breadth-first and bounded.
  let visited = 0;
  const queue = [[root, 0]];
  while (queue.length && visited < maxDirs) {
    const [dir, depth] = queue.shift(); visited++;
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      const p = join(dir, e.name);
      if (e.isDirectory()) {
        if (depth < maxDepth && !SKIP_DIRS.has(e.name) && (!e.name.startsWith('.') || e.name === '.claude' || e.name === '.github')) queue.push([p, depth + 1]);
      } else if (dir !== root && NESTED_NAMES.includes(e.name) && !relative(root, p).split(sep).includes('.claude')) {
        add(p, 'nested', e.name === 'AGENTS.md' ? 'other-tool' : 'in-subtree');
      }
    }
  }
  return found;
}

/** Every file name in the project (bounded walk, same skipped folders), for resolving bare file names. */
export function fileNames(root, { maxDirs = 20000 } = {}) {
  const names = new Set(); const queue = [root]; let visited = 0;
  while (queue.length && visited < maxDirs) {
    const dir = queue.shift(); visited++;
    let entries; try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name)) queue.push(join(dir, e.name)); }
      else names.add(e.name);
    }
  }
  return names;
}

export { isFile, isDir, real };
