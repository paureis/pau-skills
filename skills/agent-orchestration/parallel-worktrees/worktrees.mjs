#!/usr/bin/env node
/**
 * Helpers for running several agents in parallel git worktrees. Read only: it never creates, removes or changes a
 * worktree, a branch or a file.
 *
 *   node worktrees.mjs status [--base <branch>] [--repo <dir>] [--json]
 *       One line per worktree: path, branch, ahead/behind the base branch, dirty file count, last commit.
 *       Without --base it uses origin/HEAD, then main, then master, whichever exists first.
 *
 *   node worktrees.mjs plan-check <plan.json> [--repo <dir>] [--json]
 *       Reads {"pieces":[{"name":"api","files":["src/api/**","docs/api.md"]}, ...]}, expands each glob against
 *       `git ls-files` (tracked plus untracked, not ignored) and reports every file claimed by more than one piece.
 *       A literal path that does not exist yet (a file a piece will create) is compared against the other pieces'
 *       globs too, and identical globs are reported even when they match nothing.
 *
 * Glob syntax, relative to the repository root with forward slashes: `*` and `?` stay inside one path segment, `**`
 * crosses segments, `[abc]` and `{a,b}` work as in most shells, a trailing `/` means everything under that folder,
 * and a path without glob characters matches that file or everything under that folder.
 *
 * Exit codes: status 0 printed, 1 a git command failed, 2 usage. plan-check 0 no overlap, 1 overlap found,
 * 2 usage or an invalid plan. Needs Node 20+ and git 2.7+ on PATH.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, realpathSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

// ---------------------------------------------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------------------------------------------

/** Parse `git worktree list --porcelain` into [{ path, head, branch, detached, bare, locked, prunable }]. */
export function parseWorktreeList(text) {
  const out = [];
  let cur = null;
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trimEnd();
    if (line === '') { if (cur) out.push(cur); cur = null; continue; }
    const sp = line.indexOf(' ');
    const key = sp < 0 ? line : line.slice(0, sp);
    const val = sp < 0 ? '' : line.slice(sp + 1);
    if (key === 'worktree') { if (cur) out.push(cur); cur = { path: val, head: null, branch: null, detached: false, bare: false, locked: false, prunable: false }; continue; }
    if (!cur) continue;
    if (key === 'HEAD') cur.head = val;
    else if (key === 'branch') cur.branch = val.replace(/^refs\/heads\//, '');
    else if (key === 'detached') cur.detached = true;
    else if (key === 'bare') cur.bare = true;
    else if (key === 'locked') cur.locked = val || true;
    else if (key === 'prunable') cur.prunable = val || true;
  }
  if (cur) out.push(cur);
  return out;
}

/** Parse `git rev-list --left-right --count <base>...<ref>`: left is only in base (behind), right only in ref (ahead). */
export function parseAheadBehind(text) {
  const m = /^\s*(\d+)\s+(\d+)\s*$/.exec(String(text));
  return m ? { behind: Number(m[1]), ahead: Number(m[2]) } : null;
}

/** Count changed paths in `git status --porcelain=v1 -z` output (a rename or copy is one path, not two). */
export function countDirty(z) {
  const parts = String(z).split('\0');
  let n = 0;
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i];
    if (p.length < 4) continue;
    n++;
    if (p[0] === 'R' || p[0] === 'C' || p[1] === 'R' || p[1] === 'C') i++; // the next entry is the original path
  }
  return n;
}

const GLOB_CHARS = /[*?[{]/;

/** Clean a plan path: backslashes to slashes, no leading ./ or /. */
export function normalizeGlob(glob) {
  let g = String(glob).trim().replace(/\\/g, '/');
  while (g.startsWith('./')) g = g.slice(2);
  g = g.replace(/^\/+/, '');
  return g;
}

export const isLiteral = (glob) => !GLOB_CHARS.test(normalizeGlob(glob));

/** Turn a glob into an anchored RegExp. Throws on an unbalanced brace. */
export function globToRegExp(glob) {
  let g = normalizeGlob(glob);
  if (g.endsWith('/')) g += '**';
  let re = '';
  let depth = 0;
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*') {
      if (g[i + 1] === '*') {
        const atSegmentStart = i === 0 || g[i - 1] === '/';
        if (atSegmentStart && g[i + 2] === '/') { re += '(?:.*/)?'; i += 2; } else { re += '.*'; i += 1; }
      } else re += '[^/]*';
    } else if (c === '?') re += '[^/]';
    else if (c === '[') {
      const j = g.indexOf(']', i + 2);
      if (j < 0) { re += '\\['; continue; }
      let cls = g.slice(i + 1, j).replace(/\\/g, '\\\\');
      if (cls[0] === '!') cls = '^' + cls.slice(1);
      re += `[${cls}]`;
      i = j;
    } else if (c === '{') { depth++; re += '(?:'; }
    else if (c === '}' && depth > 0) { depth--; re += ')'; }
    else if (c === ',' && depth > 0) re += '|';
    else re += c.replace(/[.+^$(){}|\\\]]/, '\\$&');
  }
  if (depth !== 0) throw new Error(`unbalanced brace in glob: ${glob}`);
  return new RegExp(`^${re}$`);
}

/** A predicate for one plan entry: glob semantics, or for a literal path, that file or anything under that folder. */
export function matcher(glob) {
  const g = normalizeGlob(glob).replace(/\/+$/, '');
  if (isLiteral(glob)) return (path) => path === g || path.startsWith(g + '/');
  const re = globToRegExp(glob);
  return (path) => re.test(path);
}

/** Check the plan's shape. Returns a list of problems (empty when valid). */
export function validatePlan(plan) {
  const errors = [];
  if (!plan || typeof plan !== 'object' || !Array.isArray(plan.pieces)) return ['the plan must be an object with a "pieces" array'];
  if (plan.pieces.length < 2) errors.push('a plan needs at least two pieces to be worth checking');
  const names = new Set();
  plan.pieces.forEach((p, i) => {
    const label = p && typeof p.name === 'string' && p.name ? p.name : `#${i + 1}`;
    if (!p || typeof p.name !== 'string' || !p.name.trim()) errors.push(`piece ${label}: "name" must be a non-empty string`);
    else if (names.has(p.name)) errors.push(`piece ${label}: duplicate name`);
    else names.add(p.name);
    if (!p || !Array.isArray(p.files) || p.files.length === 0 || p.files.some((f) => typeof f !== 'string' || !normalizeGlob(f))) {
      errors.push(`piece ${label}: "files" must be a non-empty array of non-empty strings`);
      return;
    }
    for (const f of p.files) {
      try { globToRegExp(f); } catch (e) { errors.push(`piece ${label}: ${e.message}`); }
    }
  });
  return errors;
}

/**
 * Find overlaps between pieces. `files` is the repository's file list (forward slashes, relative to the root).
 * Returns { pieces: [{ name, matched, unmatched: [globs that matched no file] }],
 *           overlaps: [{ a, b, files: [existing files both claim], planned: [new paths both claim], sameGlobs: [...] }] }.
 */
export function findOverlaps(plan, files) {
  const all = [...new Set(files.map((f) => f.replace(/\\/g, '/')))].sort();
  const pieces = plan.pieces.map((p) => {
    const entries = p.files.map((glob) => ({ glob, norm: normalizeGlob(glob).replace(/\/+$/, ''), test: matcher(glob), literal: isLiteral(glob) }));
    const matched = new Set();
    const unmatched = [];
    for (const e of entries) {
      let hit = false;
      for (const f of all) if (e.test(f)) { matched.add(f); hit = true; }
      if (!hit) unmatched.push(e.glob);
    }
    const planned = entries.filter((e) => e.literal && unmatched.includes(e.glob)).map((e) => e.norm);
    return { name: p.name, entries, matched, unmatched, planned };
  });

  const overlaps = [];
  for (let i = 0; i < pieces.length; i++) {
    for (let j = i + 1; j < pieces.length; j++) {
      const A = pieces[i];
      const B = pieces[j];
      const shared = [...A.matched].filter((f) => B.matched.has(f)).sort();
      const planned = new Set();
      for (const path of A.planned) if (B.entries.some((e) => e.test(path))) planned.add(path);
      for (const path of B.planned) if (A.entries.some((e) => e.test(path))) planned.add(path);
      const bGlobs = new Set(B.entries.map((e) => e.norm));
      const sameGlobs = [...new Set(A.entries.map((e) => e.norm).filter((g) => bGlobs.has(g)))].sort();
      if (shared.length || planned.size || sameGlobs.length) {
        overlaps.push({ a: A.name, b: B.name, files: shared, planned: [...planned].sort(), sameGlobs });
      }
    }
  }
  return { pieces: pieces.map((p) => ({ name: p.name, matched: p.matched.size, unmatched: p.unmatched })), overlaps };
}

/** Human-readable plan-check report. */
export function formatPlanCheck(result, { limit = 20 } = {}) {
  const lines = [];
  for (const p of result.pieces) {
    lines.push(`${p.name}: ${p.matched} existing file(s)` + (p.unmatched.length ? `; matched nothing (new or mistyped?): ${p.unmatched.join(', ')}` : ''));
  }
  lines.push('');
  if (!result.overlaps.length) {
    lines.push('No overlap: no file is claimed by more than one piece.');
    return lines.join('\n');
  }
  lines.push(`OVERLAP: ${result.overlaps.length} pair(s) of pieces claim the same files. Serialize them, merge them into one piece, or give each shared file a single owner.`);
  for (const o of result.overlaps) {
    lines.push('', `${o.a} <> ${o.b}`);
    if (o.sameGlobs.length) lines.push(`  same entries: ${o.sameGlobs.join(', ')}`);
    if (o.files.length) {
      lines.push(`  ${o.files.length} existing file(s):`);
      for (const f of o.files.slice(0, limit)) lines.push(`    ${f}`);
      if (o.files.length > limit) lines.push(`    ... and ${o.files.length - limit} more (use --json for all)`);
    }
    if (o.planned.length) lines.push(`  new path(s) both would create or own: ${o.planned.join(', ')}`);
  }
  return lines.join('\n');
}

/** Human-readable status table. */
export function formatStatus(rows, base) {
  const head = ['worktree', 'branch', base ? `vs ${base}` : 'vs base', 'dirty', 'last commit'];
  const body = rows.map((r) => [
    r.path + (r.current ? ' (here)' : ''),
    r.branch ?? (r.bare ? '(bare)' : r.detached ? `(detached ${String(r.head ?? '').slice(0, 7)})` : '-'),
    r.aheadBehind ? `+${r.aheadBehind.ahead} -${r.aheadBehind.behind}` : '-',
    r.missing ? 'missing' : r.dirty == null ? '-' : String(r.dirty),
    r.lastCommit ?? '-',
  ]);
  const widths = head.map((h, i) => Math.max(h.length, ...body.map((b) => b[i].length)));
  const fmt = (cells) => cells.map((c, i) => (i === cells.length - 1 ? c : c.padEnd(widths[i]))).join('  ');
  const lines = [fmt(head), fmt(widths.map((w) => '-'.repeat(w))), ...body.map(fmt)];
  const notes = rows.filter((r) => r.locked || r.prunable || r.missing).map((r) =>
    `note: ${r.path}` + (r.missing ? ' does not exist on disk (run `git worktree prune`)' : '') +
    (r.locked ? ` is locked${typeof r.locked === 'string' ? ` (${r.locked})` : ''}` : '') +
    (r.prunable && !r.missing ? ' is prunable' : ''));
  if (!base) notes.push('note: no base branch found; pass --base <branch> for ahead/behind counts');
  return [...lines, ...(notes.length ? ['', ...notes] : [])].join('\n');
}

export function parseArgs(argv) {
  const opts = { cmd: argv[0], base: null, repo: '.', json: false, file: null };
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--base' || a === '--repo') {
      const v = argv[++i];
      if (!v || v.startsWith('--')) return { error: `${a} needs a value` };
      opts[a.slice(2)] = v;
    } else if (a.startsWith('--')) return { error: `unknown option: ${a}` };
    else if (opts.cmd === 'plan-check' && !opts.file) opts.file = a;
    else return { error: `unexpected argument: ${a}` };
  }
  if (opts.cmd !== 'status' && opts.cmd !== 'plan-check') return { error: opts.cmd ? `unknown command: ${opts.cmd}` : 'a command is required' };
  if (opts.cmd === 'plan-check' && !opts.file) return { error: 'plan-check needs a plan file' };
  return { opts };
}

// ---------------------------------------------------------------------------------------------------------------
// Git access
// ---------------------------------------------------------------------------------------------------------------

/** Run git in `cwd` and return stdout. Throws with git's first stderr line on failure. */
export function git(cwd, args) {
  try {
    return execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    const msg = String(e.stderr || e.message).trim().split('\n')[0];
    const err = new Error(`git ${args.join(' ')}: ${msg}`);
    err.gitFailed = true;
    throw err;
  }
}

const tryGit = (cwd, args) => { try { return git(cwd, args).trim(); } catch { return null; } };

/** The base branch to compare against: the given one, else origin/HEAD, main, master. Null when none exists. */
export function detectBase(cwd, base) {
  if (base) return base;
  const originHead = tryGit(cwd, ['symbolic-ref', '--quiet', '--short', 'refs/remotes/origin/HEAD']);
  if (originHead) return originHead;
  for (const b of ['main', 'master']) if (tryGit(cwd, ['rev-parse', '--verify', '--quiet', `refs/heads/${b}`])) return b;
  return null;
}

const samePath = (a, b) => {
  const norm = (p) => { try { return realpathSync.native(p); } catch { return resolve(p); } };
  const x = norm(a); const y = norm(b);
  return process.platform === 'win32' ? x.toLowerCase() === y.toLowerCase() : x === y;
};

/** Collect status rows for every worktree of the repository at `cwd`. */
export function collectStatus({ cwd = '.', base = null } = {}) {
  const top = git(cwd, ['rev-parse', '--show-toplevel']).trim();
  const baseRef = detectBase(cwd, base);
  if (base && !tryGit(cwd, ['rev-parse', '--verify', '--quiet', `${base}^{commit}`])) {
    const err = new Error(`base branch not found: ${base}`);
    err.gitFailed = true;
    throw err;
  }
  const list = parseWorktreeList(git(cwd, ['worktree', 'list', '--porcelain']));
  const rows = list.map((w) => {
    const row = { ...w, current: samePath(w.path, top), missing: !w.bare && !existsSync(w.path), dirty: null, aheadBehind: null, lastCommit: null };
    if (w.bare || !w.head) return row;
    if (baseRef) row.aheadBehind = parseAheadBehind(tryGit(cwd, ['rev-list', '--left-right', '--count', `${baseRef}...${w.head}`]) ?? '');
    row.lastCommit = tryGit(cwd, ['log', '-1', '--format=%h %cr: %s', w.head]);
    if (!row.missing) {
      const z = tryGit(w.path, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
      row.dirty = z == null ? null : countDirty(z);
    }
    return row;
  });
  return { base: baseRef, rows };
}

/** The repository's file list for glob expansion: tracked plus untracked files that are not ignored. */
export function repoFiles(cwd = '.') {
  return git(cwd, ['ls-files', '-z', '--cached', '--others', '--exclude-standard']).split('\0').filter(Boolean);
}

// ---------------------------------------------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------------------------------------------

const USAGE = 'Usage:\n  node worktrees.mjs status [--base <branch>] [--repo <dir>] [--json]\n  node worktrees.mjs plan-check <plan.json> [--repo <dir>] [--json]';

export function main(argv) {
  const { opts, error } = parseArgs(argv);
  if (error) { console.error(`${error}\n${USAGE}`); return 2; }

  if (opts.cmd === 'status') {
    try {
      const { base, rows } = collectStatus({ cwd: opts.repo, base: opts.base });
      console.log(opts.json ? JSON.stringify({ base, worktrees: rows }, null, 2) : formatStatus(rows, base));
      return 0;
    } catch (e) {
      console.error(e.message);
      return e.gitFailed ? 1 : 2;
    }
  }

  let plan;
  try { plan = JSON.parse(readFileSync(opts.file, 'utf8')); } catch (e) { console.error(`cannot read plan ${opts.file}: ${e.message}`); return 2; }
  const problems = validatePlan(plan);
  if (problems.length) { console.error(`invalid plan:\n  ${problems.join('\n  ')}`); return 2; }
  let files;
  try { files = repoFiles(opts.repo); } catch (e) { console.error(e.message); return 2; }
  const result = findOverlaps(plan, files);
  console.log(opts.json ? JSON.stringify(result, null, 2) : formatPlanCheck(result));
  return result.overlaps.length ? 1 : 0;
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) process.exit(main(process.argv.slice(2)));
