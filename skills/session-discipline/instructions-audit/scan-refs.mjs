// Part of scan.mjs (instructions-audit): @imports, path and command references, and whether they resolve.
// It imports scan-units.mjs only; scan.mjs re-exports its public names.
import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { stripFrontmatter, fencedLines } from './scan-units.mjs';

// ---------------------------------------------------------------------------------------------------------------
// References: @imports, paths, commands

const KNOWN_EXT = new Set(('md mdx mdc txt rst adoc json jsonc json5 yaml yml toml ini cfg conf lock xml csv ' +
  'js mjs cjs jsx ts tsx mts cts vue svelte astro html css scss sass less ' +
  'py pyi ipynb rb erb go mod rs java kt kts scala groovy gradle swift m mm c h cc cpp cxx hpp hh cs fs fsx vb csproj sln ' +
  'php ex exs erl hs ml clj dart lua pl r jl zig nim ' +
  'sh bash zsh fish ps1 psm1 bat cmd sql prisma graphql gql proto tf tfvars hcl nix dockerfile tmpl').split(' '));
const KNOWN_NAMES = new Set(['Dockerfile', 'Makefile', 'GNUmakefile', 'Justfile', 'justfile', 'Gemfile', 'Rakefile', 'Procfile', 'Containerfile', 'Vagrantfile', 'Brewfile', 'Pipfile']);

const trimRef = (r) => r.replace(/[.,;:!?)\]'"]+$/, '');

/** @imports in Claude Code syntax: "@path" at line start or after whitespace, outside code spans and blocks.
 *  Only path-shaped targets count (a known extension or an explicit ./ ../ ~/ / prefix), so "@types/node" and
 *  "@someone" are not imports. */
export function extractImports(text) {
  const lines = text.split(/\r?\n/); const fenced = fencedLines(lines); const out = [];
  lines.forEach((raw, i) => {
    if (fenced.has(i + 1)) return;
    const line = raw.replace(/`[^`]*`/g, ' ');
    for (const m of line.matchAll(/(?:^|\s)@((?:~\/|\.{1,2}\/|\/)?[\w.\-/~]+)/g)) {
      const ref = trimRef(m[1]);
      const last = ref.split('/').pop();
      const ext = last.includes('.') ? last.split('.').pop().toLowerCase() : '';
      if (/^(~\/|\.{1,2}\/|\/)/.test(ref) || KNOWN_EXT.has(ext) || KNOWN_NAMES.has(last)) out.push({ line: i + 1, ref });
    }
  });
  return out;
}

const COMMANDS = [
  [/^(?:npm|pnpm|yarn|bun)\s+run\s+([\w:.@/-]+)/, 'script'],
  [/^npm\s+(test|start)\b/, 'script'],
  [/^make\s+(?:-\S+\s+)*([A-Za-z0-9_.-]+)/, 'make'],
  [/^just\s+([A-Za-z_][\w-]*)/, 'just'],
];

function commandRef(s) {
  for (const [re, kind] of COMMANDS) { const m = re.exec(s); if (m) return { kind, ref: m[1] }; }
  return null;
}

/** Classify a code-span or bare token as a path reference worth checking, or null. */
export function pathCandidate(s) {
  let p = trimRef(s.trim());
  if (!p || /\s/.test(p) || /:\/\//.test(p) || /^[-@#$%]/.test(p) || /[*?<>{}$|=,;"'`()]/.test(p)) return null;
  if (p.startsWith('/') ) return null; // routes (/api/users) and machine paths; neither is checkable here
  if (/^[A-Za-z]:[\\/]/.test(p)) return null;
  p = p.replace(/^\.\//, '');
  const last = p.replace(/\/$/, '').split('/').pop();
  const ext = last.includes('.') ? last.split('.').pop().toLowerCase() : '';
  const hasExt = (KNOWN_EXT.has(ext) && !/^\d+$/.test(last.split('.')[0])) || KNOWN_NAMES.has(last);
  if (p.includes('/')) {
    if (!p.split('/').filter(Boolean).every((seg) => /^[\w.@\-[\]~]+$/.test(seg))) return null;
    return { ref: p.replace(/\/$/, ''), strong: hasExt || p.startsWith('~/') || p.startsWith('../') };
  }
  if (hasExt && !last.startsWith('.')) return { ref: p, strong: true, bare: true };
  return null;
}

/** Every reference in a file: { line, kind: 'path'|'script'|'make'|'just', ref, strong? }. Code spans are checked
 *  for paths and commands; fenced blocks for commands only (shell examples and output are too noisy for paths);
 *  plain prose for slash paths with a known extension. */
export function extractReferences(text) {
  const lines = stripFrontmatter(text).split(/\r?\n/); const fenced = fencedLines(lines); const out = [];
  const seen = new Set();
  const push = (r) => { const k = r.kind + ':' + r.ref; if (!seen.has(k)) { seen.add(k); out.push(r); } };
  lines.forEach((line, i) => {
    const n = i + 1;
    if (fenced.has(n)) {
      const c = commandRef(line.trim().replace(/^\$\s+/, ''));
      if (c) push({ line: n, ...c });
      return;
    }
    for (const m of line.matchAll(/`([^`\n]+)`/g)) {
      const span = m[1].trim();
      const c = commandRef(span);
      if (c) { push({ line: n, ...c }); continue; }
      const p = pathCandidate(span);
      if (p) push({ line: n, kind: 'path', ...p });
    }
    const prose = line.replace(/`[^`]*`/g, ' ').replace(/\b[\w+.-]+:\/\/\S+/g, ' ').replace(/\[[^\]]*\]\(([^)\s]+)\)/g, ' $1 ');
    for (const m of prose.matchAll(/(?:^|[\s(])((?:\.{1,2}\/)?[\w.@-]+\/[\w.@/-]*[\w-]\.[A-Za-z][\w]{0,9})(?=[\s),.;:!?]|$)/g)) {
      const p = pathCandidate(m[1]);
      if (p && p.strong) push({ line: n, kind: 'path', ...p });
    }
  });
  return out;
}

/** Targets declared in a Makefile or justfile (enough to catch a renamed or removed target). */
export function parseTargets(text, kind) {
  const out = new Set();
  for (const line of text.split(/\r?\n/)) {
    if (kind === 'make') {
      const m = /^([A-Za-z0-9_.\-/ ]+?)\s*::?(?!=)/.exec(line);
      if (m && !line.startsWith('\t')) for (const t of m[1].split(/\s+/)) if (t && !t.startsWith('.')) out.add(t);
      const phony = /^\.PHONY\s*:\s*(.*)/.exec(line);
      if (phony) for (const t of phony[1].split(/\s+/)) if (t) out.add(t);
    } else {
      const m = /^@?([A-Za-z_][\w-]*)(?:\s+[^:=\n]*)?\s*:(?!=)/.exec(line);
      if (m) out.add(m[1]);
    }
  }
  return out;
}

// A leading byte order mark (some Windows editors write one) is dropped, or it hides frontmatter and breaks JSON.
const readMaybe = (f) => { try { return readFileSync(f, 'utf8').replace(/^\uFEFF/, ''); } catch { return null; } };

/** Project tooling the command references are checked against, read from a directory. */
export function readTooling(dir) {
  let scripts = null;
  const pkg = readMaybe(join(dir, 'package.json'));
  if (pkg != null) { try { scripts = JSON.parse(pkg).scripts || {}; } catch { scripts = {}; } }
  const mk = ['Makefile', 'makefile', 'GNUmakefile'].map((f) => readMaybe(join(dir, f))).find((t) => t != null);
  const jf = ['justfile', 'Justfile', '.justfile'].map((f) => readMaybe(join(dir, f))).find((t) => t != null);
  return { scripts, make: mk == null ? null : parseTargets(mk, 'make'), just: jf == null ? null : parseTargets(jf, 'just') };
}

/** Which references do not resolve. A path resolves against the citing file's directory, then the project root
 *  (and the home directory for ~/). A bare file name (`audit.mjs`) also resolves if a file of that name exists
 *  anywhere in the project (`names`, from fileNames()), since prose often names a file without its folder. A weak path (a slash path with no file extension, which may be a branch,
 *  a package or a route) is reported only when its first segment exists, so `src/old-module` is caught but
 *  `origin/main` is not. Commands are checked against the nearest package.json, Makefile or justfile. */
export function checkReferences(refs, { fileDir, root, home, tooling = [], names = null, exists = existsSync }) {
  const missing = [];
  const bases = [...new Set([fileDir, root].filter(Boolean))];
  const tool = (key) => tooling.find((t) => t[key] != null)?.[key] ?? null;
  for (const r of refs) {
    if (r.kind === 'path') {
      if (r.ref.startsWith('~/')) { if (home && !exists(join(home, r.ref.slice(2)))) missing.push({ ...r, why: 'not found under the home directory' }); continue; }
      const found = bases.some((b) => exists(resolve(b, r.ref)));
      if (found) continue;
      if (r.bare && names && names.has(r.ref)) continue;
      if (!r.strong) {
        const first = r.ref.split('/')[0];
        if (!bases.some((b) => exists(resolve(b, first)))) continue;
      }
      missing.push({ ...r, why: 'no such file or directory' });
    } else if (r.kind === 'script') {
      const s = tool('scripts');
      if (s == null) missing.push({ ...r, why: 'no package.json found' });
      else if (!(r.ref in s)) missing.push({ ...r, why: 'no such script in package.json' });
    } else if (r.kind === 'make' || r.kind === 'just') {
      const t = tool(r.kind);
      if (t == null) missing.push({ ...r, why: r.kind === 'make' ? 'no Makefile found' : 'no justfile found' });
      else if (!t.has(r.ref)) missing.push({ ...r, why: `no such ${r.kind} target` });
    }
  }
  return missing;
}

export { readMaybe };
