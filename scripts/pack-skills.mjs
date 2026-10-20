#!/usr/bin/env node
// Pack skills as zips for upload to a claude.ai account (Customize, Skills, Upload a skill): one zip per skill, with
// the skill's folder at the zip root (<name>/SKILL.md and every bundled file, subfolders included).
//
//   node scripts/pack-skills.mjs <skill> [<skill>...]   pack the named skills (<skill> or <plugin>/<skill>)
//   node scripts/pack-skills.mjs --since <git ref>      pack every skill with a committed change between <ref> and HEAD
//   node scripts/pack-skills.mjs --all                  pack every skill
//   options: --out <dir> (default: dist/ in the repository), --root <dir> (default: the repository this script is in)
// `--help` prints the full usage (the HELP text in scripts/pack-skills-args.mjs): what each option and status means, and the exit codes.
//
// What goes in: the files committed at HEAD, read with `git ls-tree` and `git cat-file`, never the files on disk. So
// the zip is exactly what was reviewed and merged, untracked files (editor backups, test output) never leak in, and
// the executable bit comes from git, which keeps it on every platform (Windows cannot show it through the file
// system). Uncommitted changes inside a skill being packed get a loud warning, because they are not in the zip.
//
// --since says for each skill whether it is new (no skill of that name had a SKILL.md at the ref) or changed (it
// replaces a skill already uploaded; claude.ai knows skills by name, so a skill moved between plugins is changed). A
// skill that existed at the ref and is gone now (its folder, or only its SKILL.md) is listed as removed: delete it on
// claude.ai by hand. Files directly under skills/<plugin>/, such as the plugin README.md, are not skills, and neither
// is a folder that has no SKILL.md at either end. A ref that is not an ancestor of HEAD gets a warning, not a refusal
// (it may be the commit of the last upload), because the two trees are then compared across branches.
//
// Warnings, none of which stop the run: uncommitted changes in a packed skill, HEAD not on the default branch
// (origin/HEAD, else main or master; the zips are meant to be built from main), and other zips already in --out. The
// default dist/ is emptied of zips first, so it only ever holds the last run's; an --out folder is never emptied.
//
// Before writing anything, every skill is checked against the upload rules, and if one fails nothing is written. The
// rules are from the platform docs (Agent Skills overview, and "Using Agent Skills with the API"):
// - name: at most 64 characters, lowercase letters, digits and hyphens only, no XML tags, no "anthropic" or "claude";
//   and it equals the folder name, which claude.ai also asks for.
// - description: non-empty, at most 1,024 characters, no XML tags. The claude.ai help center says 200 characters, but
//   that limit is not enforced (every skill here is longer and uploads), so it is not checked.
// - one top-level folder holding SKILL.md; total size under 30 MB uncompressed.
// The XML-tag and reserved-word regexes and the description parser are copied from tests/context-budget.test.mjs and
// tests/marketplace.test.mjs; tests/pack-skills.test.mjs fails if the copies drift apart.
//
// The zip is written by hand (deflate from node:zlib, a small central directory), so the same commit always gives the
// same bytes: entries are sorted, and every timestamp is the time of the last commit that touched the skill, in UTC
// (in a shallow clone, where that commit may be missing, it is HEAD's time).
//
// Every git call runs with GIT_DIR, GIT_INDEX_FILE and GIT_WORK_TREE removed from its environment, so a run from
// inside a git hook cannot read or touch the repository that runs the hook instead of --root.
//
// Exit: 0 packed (or nothing to pack), 1 an upload rule failed, 2 usage error, unknown skill, bad ref or bad --out.
import { mkdirSync, writeFileSync, realpathSync, existsSync, statSync, readdirSync, unlinkSync } from 'node:fs';
import { join, dirname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip } from './pack-skills-zip.mjs';
import { Failure, git, branchWarning, skillFolders, readBlobs } from './pack-skills-repo.mjs';
import { parseArgs, selectTargets } from './pack-skills-args.mjs';

export { crc32Table, buildZip } from './pack-skills-zip.mjs';
export { parseArgs } from './pack-skills-args.mjs';

export const XML_TAG = /<[A-Za-z/!?]/;
export const RESERVED_NAME = /claude|anthropic/i;
export const NAME_CHARS = /^[a-z0-9-]+$/;
export const MAX_NAME = 64;
export const MAX_DESCRIPTION = 1024;
// "Under 30 MB": read as decimal megabytes, the smaller reading, so a zip that passes here passes there.
export const MAX_UNCOMPRESSED = 30 * 1000 * 1000;

// The description parser below is copied unchanged from tests/context-budget.test.mjs (keep both the same).
const ESCAPES = { 0: '\0', a: '\x07', b: '\b', t: '\t', '\t': '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ',
  '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0', L: ' ', P: ' ' };
const HEX = { x: 2, u: 4, U: 8 };

// A line break inside a quoted value folds to a space; blank lines in between become that many newlines.
function foldBreak(raw, i) {
  let breaks = 0;
  for (;;) {
    while (raw[i] === ' ' || raw[i] === '\t') i++;
    if (raw[i] !== '\n') return { i, text: breaks ? '\n'.repeat(breaks) : ' ' };
    breaks++;
    i++;
  }
}

// raw starts just after the opening quote. Returns the value and the rest of the line after the closing quote.
function quoted(raw, quote) {
  let out = '';
  let i = 0;
  while (i < raw.length) {
    const c = raw[i];
    if (c === quote && quote === "'" && raw[i + 1] === "'") { out += "'"; i += 2; continue; }
    if (c === quote) return { value: out, rest: raw.slice(i + 1).split('\n')[0] };
    if (c === '\\' && quote === '"') {
      const n = raw[i + 1];
      if (n === '\n') { i += 2; while (raw[i] === ' ' || raw[i] === '\t') i++; continue; }
      if (n in HEX) {
        const hex = raw.slice(i + 2, i + 2 + HEX[n]);
        if (!new RegExp(`^[0-9a-fA-F]{${HEX[n]}}$`).test(hex)) throw new Error(`bad \\${n} escape`);
        out += String.fromCodePoint(parseInt(hex, 16));
        i += 2 + HEX[n];
        continue;
      }
      if (!(n in ESCAPES)) throw new Error(`unknown escape \\${n}`);
      out += ESCAPES[n];
      i += 2;
      continue;
    }
    if (c === '\n') {
      out = out.replace(/[ \t]+$/, '');
      const f = foldBreak(raw, i + 1);
      out += f.text;
      i = f.i;
      continue;
    }
    out += c;
    i++;
  }
  throw new Error(`a ${quote === '"' ? 'double' : 'single'}-quoted value is never closed`);
}

// The lines of a `>` or `|` block, folded or kept, then chomped by the header's `-` (strip), `+` (keep) or neither.
function block(header, lines) {
  const m = /^([|>])([1-9]?)([+-]?)([1-9]?)\s*(#.*)?$/.exec(header);
  if (!m) throw new Error(`bad block header ${JSON.stringify(header)}`);
  const explicit = Number(m[2] || m[4]) || 0;
  const chomp = m[3];
  const first = lines.find((l) => l.trim());
  const indent = explicit || (first ? /^ */.exec(first)[0].length : 0);
  const body = lines.map((l) => (l.trim() ? l.slice(indent) : ''));
  let trailing = 0;
  while (body.length && body[body.length - 1] === '') { body.pop(); trailing++; }
  if (!body.length) return '';
  let out = '';
  if (m[1] === '|') out = body.join('\n');
  else {
    let pending = 0;
    let prevNormal = false;
    body.forEach((l, k) => {
      if (l === '') { pending++; return; }
      const normal = !/^\s/.test(l);
      if (k - pending > 0) out += prevNormal && normal ? (pending ? '\n'.repeat(pending) : ' ') : '\n'.repeat(pending + 1);
      else out += '\n'.repeat(pending);
      out += l;
      prevNormal = normal;
      pending = 0;
    });
  }
  if (chomp === '-') return out;
  return chomp === '+' ? out + '\n'.repeat(trailing + 1) : out + '\n';
}

// A plain value: the first line and any indented continuation lines, folded with spaces, up to a comment.
function plain(first, more) {
  const parts = [];
  for (const [k, raw] of [first, ...more].entries()) {
    const line = raw.trim();
    if (k > 0 && line.startsWith('#')) break;
    const text = line.replace(/(^|\s+)#.*$/, '');
    if (k === 0 && /^([[\]{}&*!%@`]|- |-$)/.test(text)) throw new Error(`a plain value cannot start with ${JSON.stringify(text[0])}`);
    if (/: |:$/.test(text)) throw new Error('a plain value cannot contain ": " (quote it)');
    parts.push(text);
    if (text !== line) break;
  }
  while (parts.length && parts[parts.length - 1] === '') parts.pop();
  let out = '';
  let pending = 0;
  parts.forEach((p, k) => {
    if (p === '') { pending++; return; }
    if (out) out += pending ? '\n'.repeat(pending) : ' ';
    out += p;
    pending = 0;
  });
  return out;
}

function parseDescription(front) {
  try {
    const at = front.map((l, i) => (/^description:(\s|$)/.test(l) ? i : -1)).filter((i) => i >= 0);
    if (!at.length) return { value: '' };
    if (at.length > 1) throw new Error('more than one description key');
    const head = front[at[0]].slice('description:'.length).trim();
    let end = at[0] + 1;
    while (end < front.length && (!front[end].trim() || /^\s/.test(front[end]))) end++;
    const more = front.slice(at[0] + 1, end);
    if (head.startsWith('"') || head.startsWith("'")) {
      const raw = [front[at[0]].slice(front[at[0]].indexOf(head[0]) + 1), ...front.slice(at[0] + 1)].join('\n');
      const { value, rest } = quoted(raw, head[0]);
      if (!/^([ \t]+#.*)?[ \t]*$/.test(rest)) throw new Error(`text after the closing quote: ${JSON.stringify(rest.trim())}`);
      return { value };
    }
    if (head.startsWith('|') || head.startsWith('>')) return { value: block(head, more) };
    return { value: plain(head, more) };
  } catch (e) {
    return { error: e.message };
  }
}

/** The upload-rule problems of one skill folder; an empty list means it may be uploaded. */
export function uploadProblems(folder, files, { maxBytes = MAX_UNCOMPRESSED } = {}) {
  const id = folder.dir;
  const problems = [];
  const name = folder.name;
  if (name.length > MAX_NAME) problems.push(`${id}: the name is ${name.length} characters; the limit is ${MAX_NAME}`);
  if (!NAME_CHARS.test(name)) problems.push(`${id}: the name may hold only lowercase letters, digits and hyphens`);
  if (XML_TAG.test(name)) problems.push(`${id}: the name contains an XML-like tag`);
  if (RESERVED_NAME.test(name)) problems.push(`${id}: the name contains a reserved word ("claude" or "anthropic")`);
  for (const f of folder.files) {
    if (f.mode === '120000') problems.push(`${id}/${f.rel}: a symbolic link; an upload needs real files`);
    else if (f.type !== 'blob') problems.push(`${id}/${f.rel}: a ${f.type} (submodule), not a file`);
  }
  const total = files.reduce((n, f) => n + f.data.length, 0);
  if (total >= maxBytes) problems.push(`${id}: ${total} bytes uncompressed; an upload must be under ${maxBytes} bytes`);

  const skillMd = files.find((f) => f.rel === 'SKILL.md');
  if (!skillMd) return [...problems, `${id}: no SKILL.md in the folder`];
  const lines = skillMd.data.toString('utf8').split(/\r?\n/);
  const close = lines.indexOf('---', 1);
  if (lines[0] !== '---' || close < 0) return [...problems, `${id}/SKILL.md: no frontmatter (a block between two --- lines)`];
  const front = lines.slice(1, close);

  const names = front.filter((l) => /^name:(\s|$)/.test(l));
  const declared = names.length ? names[0].slice('name:'.length).trim().replace(/^(["'])(.*)\1$/, '$2') : '';
  if (names.length !== 1) problems.push(`${id}/SKILL.md: the frontmatter needs exactly one name`);
  else if (declared !== name) problems.push(`${id}/SKILL.md: the name "${declared}" differs from the folder name "${name}"`);

  const { value: description = '', error } = parseDescription(front);
  if (error) problems.push(`${id}/SKILL.md: the description is not valid YAML: ${error}`);
  else if (!description.trim()) problems.push(`${id}/SKILL.md: the description is empty`);
  else {
    if (description.length > MAX_DESCRIPTION) {
      problems.push(`${id}/SKILL.md: the description is ${description.length} characters; the limit is ${MAX_DESCRIPTION}`);
    }
    if (XML_TAG.test(description)) {
      problems.push(`${id}/SKILL.md: the description contains an XML-like tag, ${description.match(/<[^>]*>?/)[0]} (quote it differently or drop the angle brackets)`);
    }
  }
  return problems;
}

export function main(argv, { cwd = process.cwd(), log = console.log, warn = console.error, maxBytes = MAX_UNCOMPRESSED } = {}) {
  try {
    const opts = parseArgs(argv);
    const here = dirname(fileURLToPath(import.meta.url));
    const root = resolve(cwd, opts.root || join(here, '..'));
    git(root, ['rev-parse', '--verify', '--quiet', 'HEAD^{commit}']);
    const out = resolve(cwd, opts.out || join(root, 'dist'));
    if (existsSync(out) && !statSync(out).isDirectory()) {
      throw new Failure(`${opts.out ? '--out' : 'the default output'} ${out} is not a folder`, 2);
    }
    const branch = branchWarning(root);
    if (branch) warn(branch);
    const head = skillFolders(root, 'HEAD');
    const { targets, removed } = selectTargets(root, opts, head, warn);
    targets.sort((a, b) => (a.folder.name < b.folder.name ? -1 : 1));

    const blobs = readBlobs(root, [...new Set(targets.flatMap((t) => t.folder.files.filter((f) => f.type === 'blob').map((f) => f.sha)))]);
    const problems = [];
    for (const t of targets) {
      t.files = t.folder.files.filter((f) => f.type === 'blob').map((f) => ({ ...f, data: blobs.get(f.sha) }));
      problems.push(...uploadProblems(t.folder, t.files, { maxBytes }));
      const dirty = git(root, ['status', '--porcelain', '--', t.folder.dir]).trimEnd();
      if (dirty) {
        warn(`WARNING: ${t.folder.dir} has uncommitted changes. The zip holds the committed files (HEAD), not these:\n${dirty}`);
      }
    }
    if (problems.length) {
      warn(`Refused: ${problems.length} upload rule${problems.length === 1 ? '' : 's'} failed, so no zip was written:`);
      for (const p of problems) warn(`  ${p}`);
      return 1;
    }

    for (const r of removed) log(`removed  ${r.name}  (was ${r.dir}; delete it from claude.ai by hand)`);
    if (removed.length && targets.some((t) => t.status === 'new')) {
      log('hint: a removed skill and a new skill can be one skill renamed; upload the new one and delete the old one.');
    }
    if (!targets.length) {
      log('nothing to pack');
      return 0;
    }
    try {
      mkdirSync(out, { recursive: true });
    } catch (e) {
      throw new Failure(`cannot create the output folder ${out}: ${e.message}`, 2);
    }
    const zipsIn = () => readdirSync(out, { withFileTypes: true }).filter((d) => d.isFile() && d.name.endsWith('.zip')).map((d) => d.name).sort();
    const shownOut = relative(cwd, out) && !relative(cwd, out).startsWith('..') ? relative(cwd, out) : out;
    if (!opts.out) {
      const stale = zipsIn();
      for (const z of stale) unlinkSync(join(out, z));
      if (stale.length) log(`removed ${stale.length} old zip${stale.length === 1 ? '' : 's'} from ${shownOut}`);
    } else {
      const ours = new Set(targets.map((t) => `${t.folder.name}.zip`));
      const others = zipsIn().filter((z) => !ours.has(z));
      if (others.length) warn(`WARNING: ${shownOut} already holds other zips, which this run did not write: ${others.join(', ')}`);
    }
    const rows = [];
    for (const t of targets) {
      const seconds = Number(git(root, ['log', '-1', '--format=%ct', 'HEAD', '--', t.folder.dir]).trim()) || 0;
      const zip = buildZip(t.files.map((f) => ({ path: `${t.folder.name}/${f.rel}`, mode: f.mode === '100755' ? 0o100755 : 0o100644, data: f.data })), seconds);
      const file = join(out, `${t.folder.name}.zip`);
      writeFileSync(file, zip);
      const shown = relative(cwd, file);
      rows.push([shown && !shown.startsWith('..') ? shown : file, t.status, `${t.files.length} file${t.files.length === 1 ? '' : 's'}`, `${zip.length} bytes`]);
    }
    const width = (k) => Math.max(...rows.map((r) => r[k].length));
    for (const r of rows) log(`${r[0].padEnd(width(0))}  ${r[1].padEnd(width(1))}  ${r[2].padStart(width(2))}  ${r[3].padStart(width(3))}`);
    if (!opts.since) log('(run with --since <ref> to see which are new and which replace an uploaded skill)');
    return 0;
  } catch (e) {
    if (!(e instanceof Failure)) throw e;
    (e.code === 0 ? log : warn)(e.message);
    return e.code;
  }
}

const isMain = (() => {
  try {
    return !!process.argv[1] && realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return false;
  }
})();
if (isMain) process.exitCode = main(process.argv.slice(2));
