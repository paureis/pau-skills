#!/usr/bin/env node
/**
 * Instruction-file scanner for the instructions-audit skill. Node 20+ standard library only.
 *
 *   node scan.mjs [root]                 text report for the project at [root] (default: the current directory)
 *   node scan.mjs [root] --json          the same data as JSON
 *   node scan.mjs --threshold 0.5        near-duplicate floor (bigram overlap coefficient, default 0.6)
 *   node scan.mjs --min-bigrams 4        ignore units with fewer content bigrams than this (default 4)
 *   node scan.mjs --max-depth 6          how deep to look for nested instruction files (default 6)
 *   node scan.mjs --home <dir>           read user-level files from <dir>/.claude instead of the real home (tests)
 *   node scan.mjs --no-ancestors         skip CLAUDE.md files in directories above the root
 *   node scan.mjs --global-refs          also check path references in user-level files (off: they cite many projects)
 *
 * What it does mechanically, so the agent does not have to do it by eye:
 *   - finds the instruction files an agent reads (Claude Code, plus AGENTS.md, Cursor, Copilot, Windsurf, Cline,
 *     Gemini), follows @imports one level deep, and reports bytes, lines and estimated tokens (~4 characters each);
 *   - splits every file into rule units (bullets, paragraphs, table rows) and lists near-duplicate pairs, within
 *     and across files, scored by the overlap coefficient of content-word bigrams;
 *   - lists backticked or path-like references, @imports and npm/make/just commands that do not resolve;
 *   - lists lines that look like secrets or personal data (previews are masked);
 *   - lists vague-rule candidates and heavily emphasised rules (a common sign of a rule that keeps being broken).
 * Judgment (contradictions, relevance, what is missing) stays with the agent. Exit code is 0 unless usage is wrong.
 */
import { realpathSync } from 'node:fs';
import { join, dirname, resolve, relative, sep, isAbsolute } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { fileStats, sectionsOf, stripFrontmatter, splitUnits, findDuplicates, findSecrets, findVague, findEmphasis } from './scan-units.mjs';
import { extractImports, extractReferences, readMaybe, readTooling, checkReferences } from './scan-refs.mjs';
import { isFile, isDir, real, discoverFiles, fileNames } from './scan-discover.mjs';
export { estimateTokens, fileStats, sectionsOf, tokenize, bigrams, overlap, stripFrontmatter, splitUnits, findDuplicates, SECRET_PATTERNS, mask, findSecrets, VAGUE_PHRASES, findVague, findEmphasis } from './scan-units.mjs';
export { extractImports, pathCandidate, extractReferences, parseTargets, readTooling, checkReferences } from './scan-refs.mjs';
export { isPathScoped, discoverFiles, fileNames } from './scan-discover.mjs';

// ---------------------------------------------------------------------------------------------------------------
// Scan

const LOAD_RANK = { 'every-session': 0, 'in-subtree': 1, conditional: 2, 'other-tool': 3 };

export function scan(root, { home = homedir(), threshold = 0.6, minBigrams = 4, maxDepth = 6, ancestors = true, globalRefs = false, maxImports = 50 } = {}) {
  root = resolve(root);
  const display = (p) => {
    const rel = relative(root, p);
    if (!rel.startsWith('..') && !isAbsolute(rel)) return rel.split(sep).join('/');
    if (home) { const h = relative(home, p); if (!h.startsWith('..') && !isAbsolute(h)) return '~/' + h.split(sep).join('/'); }
    return p.split(sep).join('/');
  };
  const files = discoverFiles(root, { home, maxDepth, ancestors }).map((f) => ({ ...f, text: readMaybe(f.path) ?? '', importedBy: [] }));
  const byReal = new Map(files.map((f) => [real(f.path), f]));
  const notes = [];
  const brokenImports = [];

  // Follow @imports one level deep: imports of discovered files are read; imports inside imported files are listed
  // in notes but not followed (Claude Code follows deeper, so the true load can be larger than reported).
  let followed = 0;
  for (const f of [...files]) {
    for (const imp of extractImports(f.text)) {
      const target = imp.ref.startsWith('~/') ? join(home || homedir(), imp.ref.slice(2)) : resolve(dirname(f.path), imp.ref);
      if (!isFile(target)) { brokenImports.push({ file: display(f.path), line: imp.line, kind: 'import', ref: imp.ref, why: 'imported file does not exist' }); continue; }
      const r = real(target);
      const existing = byReal.get(r);
      if (existing) {
        existing.importedBy.push(display(f.path));
        if (LOAD_RANK[f.loads] < LOAD_RANK[existing.loads]) existing.loads = f.loads;
        continue;
      }
      if (followed >= maxImports) { notes.push(`import limit (${maxImports}) reached; ${imp.ref} in ${display(f.path)} not read`); continue; }
      followed++;
      const nf = { path: target, scope: f.scope === 'global' ? 'global' : 'import', loads: f.loads, text: readMaybe(target) ?? '', importedBy: [display(f.path)] };
      files.push(nf); byReal.set(r, nf);
      for (const deeper of extractImports(nf.text)) notes.push(`${display(target)}:${deeper.line} imports ${deeper.ref} (second level, not followed)`);
    }
  }

  const rootTooling = readTooling(root);
  const names = fileNames(root);
  const out = { root: root.split(sep).join('/'), files: [], totals: {}, duplicates: [], missingReferences: [...brokenImports], secrets: [], vague: [], emphasis: [], largestSections: [], notes };
  const allUnits = [];
  const sections = [];
  for (const f of files) {
    const name = display(f.path);
    out.files.push({ path: name, scope: f.scope, loads: f.loads, importedBy: f.importedBy, ...fileStats(f.text) });
    const units = splitUnits(f.text).map((u) => ({ ...u, file: name }));
    allUnits.push(...units);
    for (const s of sectionsOf(stripFrontmatter(f.text))) sections.push({ file: name, ...s });
    if (f.scope !== 'global' || globalRefs) {
      const fileDir = dirname(f.path);
      const tooling = fileDir === root ? [rootTooling] : [readTooling(fileDir), rootTooling];
      for (const m of checkReferences(extractReferences(f.text), { fileDir, root, home, tooling, names })) {
        out.missingReferences.push({ file: name, line: m.line, kind: m.kind, ref: m.ref, why: m.why });
      }
    }
    for (const s of findSecrets(f.text)) out.secrets.push({ file: name, ...s });
  }
  for (const f of out.files) {
    out.totals[f.loads] ??= { files: 0, bytes: 0, tokens: 0 };
    out.totals[f.loads].files++; out.totals[f.loads].bytes += f.bytes; out.totals[f.loads].tokens += f.tokens;
  }
  out.duplicates = findDuplicates(allUnits, { threshold, minBigrams });
  out.vague = findVague(allUnits);
  out.emphasis = findEmphasis(allUnits);
  out.largestSections = sections.sort((a, b) => b.tokens - a.tokens).slice(0, 12);
  out.unitCount = allUnits.length;
  out.threshold = threshold;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Text output

export function formatText(r) {
  const L = [];
  const pad = (v, n) => String(v).padStart(n);
  L.push(`== Instruction files under ${r.root} ==`);
  if (!r.files.length) L.push('  none found');
  for (const f of r.files) {
    const imp = f.importedBy.length ? `  (imported by ${f.importedBy.join(', ')})` : '';
    L.push(`  ${pad(f.bytes, 7)} B ${pad(f.lines, 5)} lines ~${pad(f.tokens, 6)} tok  ${f.loads.padEnd(13)} ${f.path}${imp}`);
  }
  L.push('');
  L.push('== Estimated tokens by when they load ==');
  for (const k of Object.keys(LOAD_RANK)) if (r.totals[k]) L.push(`  ${k.padEnd(13)} ~${pad(r.totals[k].tokens, 6)} tok in ${r.totals[k].files} file(s)`);
  L.push('');
  L.push('== Largest sections ==');
  for (const s of r.largestSections) L.push(`  ~${pad(s.tokens, 5)} tok  ${s.file}:${s.line}  ${s.heading}`);
  L.push('');
  L.push(`== Near-duplicate rule pairs (overlap >= ${r.threshold}) ==`);
  if (!r.duplicates.length) L.push('  none');
  for (const d of r.duplicates) {
    L.push(`  ${d.score.toFixed(2)}${d.exact ? ' exact' : ''}  ${d.a.file}:${d.a.line}  "${d.a.text}"`);
    L.push(`        <-> ${d.b.file}:${d.b.line}  "${d.b.text}"`);
  }
  L.push('');
  L.push('== References that do not resolve ==');
  if (!r.missingReferences.length) L.push('  none');
  for (const m of r.missingReferences) L.push(`  ${m.file}:${m.line}  ${m.kind.padEnd(6)} ${m.ref}  (${m.why})`);
  L.push('');
  L.push('== Possible secrets or personal data (masked) ==');
  if (!r.secrets.length) L.push('  none');
  for (const s of r.secrets) L.push(`  ${s.file}:${s.line}  ${s.kind}  ${s.preview}`);
  L.push('');
  L.push('== Vague-rule candidates (no concrete anchor) ==');
  if (!r.vague.length) L.push('  none');
  for (const v of r.vague) L.push(`  ${v.file}:${v.line}  [${v.phrases.join(', ')}]  "${v.text}"`);
  L.push('');
  L.push('== Emphasised rules (check whether they keep being broken) ==');
  if (!r.emphasis.length) L.push('  none');
  for (const e of r.emphasis) L.push(`  ${e.file}:${e.line}  [${e.marker}]  "${e.text}"`);
  if (r.notes.length) { L.push(''); L.push('== Notes =='); for (const n of r.notes) L.push(`  ${n}`); }
  L.push('');
  L.push(`${r.files.length} file(s), ${r.unitCount} rule unit(s), ${r.duplicates.length} near-duplicate pair(s), ${r.missingReferences.length} unresolved reference(s), ${r.secrets.length} possible secret(s).`);
  return L.join('\n');
}

// ---------------------------------------------------------------------------------------------------------------
// CLI

export function parseArgs(args) {
  const o = { root: process.cwd(), json: false, threshold: 0.6, minBigrams: 4, maxDepth: 6, home: homedir(), ancestors: true, globalRefs: false };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const num = () => { const v = Number(args[++i]); if (!Number.isFinite(v)) throw new Error(`${a} needs a number`); return v; };
    if (a === '--json') o.json = true;
    else if (a === '--threshold') o.threshold = num();
    else if (a === '--min-bigrams') o.minBigrams = num();
    else if (a === '--max-depth') o.maxDepth = num();
    else if (a === '--home') { o.home = args[++i]; if (!o.home) throw new Error('--home needs a directory'); }
    else if (a === '--no-ancestors') o.ancestors = false;
    else if (a === '--global-refs') o.globalRefs = true;
    else if (a === '-h' || a === '--help') o.help = true;
    else if (a.startsWith('-')) throw new Error(`unknown option ${a}`);
    else o.root = a;
  }
  return o;
}

function main(args) {
  let o;
  try { o = parseArgs(args); } catch (e) { process.stderr.write(`scan.mjs: ${e.message}\n`); return 1; }
  if (o.help) { process.stdout.write('usage: node scan.mjs [root] [--json] [--threshold 0.6] [--min-bigrams 4] [--max-depth 6] [--home dir] [--no-ancestors] [--global-refs]\n'); return 0; }
  if (!isDir(o.root)) { process.stderr.write(`scan.mjs: not a directory: ${o.root}\n`); return 1; }
  const r = scan(o.root, o);
  process.stdout.write((o.json ? JSON.stringify(r, null, 2) : formatText(r)) + '\n');
  return 0;
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) process.exit(main(process.argv.slice(2)));
