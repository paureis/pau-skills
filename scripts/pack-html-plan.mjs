#!/usr/bin/env node
// Build html-plan.zip for upload to claude.ai (Q15): upstream html-plan, read from a folder on disk, plus the
// pau-skills additions in scripts/html-plan/. See scripts/html-plan/README.md for the fetch step and the upload.
//
//   node scripts/pack-html-plan.mjs --upstream <folder> [--out <folder>]
//
// The zip holds upstream byte for byte, with the folder html-plan/ at its root, except: runtime/pack.mjs (one
// anchored replacement, the numbering fix), runtime/htmlplan.css, runtime/htmlplan.js and SKILL.md (each with a file
// appended after the upstream text and a blank line), and a new NOTICE. Every anchor in scripts/html-plan/upstream.mjs
// must be found exactly once before anything changes, so a new upstream version fails loudly instead of shipping half
// patched. The result must pass the upload rules of scripts/pack-skills.mjs (uploadProblems); a symbolic link fails
// them. Entries are sorted and stamped with the time of the last commit that touched this script or scripts/html-plan/
// (HEAD's time when there is none), so the same upstream at the same commit gives the same bytes.
//
// The build reads only --upstream and scripts/html-plan/, never touches the network, never deletes anything, and
// writes or replaces only <out>/html-plan.zip. On a refusal nothing is written and every problem is printed.
//
// Exit: 0 written, 1 refused (an anchor, an upload rule, a symbolic link), 2 usage (no --upstream, an unknown option,
// --upstream not a folder or without SKILL.md, --out not a folder).
import { readdirSync, lstatSync, readFileSync, readlinkSync, existsSync, statSync, mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildZip } from './pack-skills-zip.mjs';
import { uploadProblems } from './pack-skills.mjs';
import { Failure, git, gitTry } from './pack-skills-repo.mjs';
import { UPSTREAM, NUMBERING, ANCHORS, APPENDS, REPLACED_WHAT } from './html-plan/upstream.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(HERE, '..');
const NAME = 'html-plan';

export const HELP = `Build html-plan.zip: upstream html-plan plus the pau-skills additions in scripts/html-plan/.

  node scripts/pack-html-plan.mjs --upstream <folder> [--out <folder>]

  --upstream <folder>  the upstream skill folder, html-plan/skills/html-plan in a checkout of
                       ${UPSTREAM.repository} at ${UPSTREAM.commit}
                       (scripts/html-plan/README.md shows the fetch)
  --out <folder>       where html-plan.zip is written (default: dist/ in the repository; created if missing)
  --help               print this text

Only <out>/html-plan.zip is written or replaced. Nothing is written when a check fails.
Exit: 0 written, 1 refused (an anchor, an upload rule, a symbolic link), 2 usage.`;

export function parseArgs(argv) {
  const opts = {};
  if (argv.includes('--help') || argv.includes('-h')) return { help: true };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a !== '--upstream' && a !== '--out') throw new Failure(`unknown option or argument: ${a} (see --help)`, 2);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith('--')) throw new Failure(`${a} needs a folder (see --help)`, 2);
    const key = a.slice(2);
    if (opts[key] !== undefined) throw new Failure(`${a} is given twice`, 2);
    opts[key] = value;
    i++;
  }
  if (!opts.upstream) throw new Failure('--upstream <folder> is required (see --help)', 2);
  return opts;
}

/** Every entry under `dir`, sorted by path. A symbolic link is read as itself (mode 120000), never followed. */
export function readTree(dir) {
  const out = [];
  const walk = (rel) => {
    for (const name of readdirSync(join(dir, rel))) {
      const r = rel ? `${rel}/${name}` : name;
      const abs = join(dir, r);
      const st = lstatSync(abs);
      if (st.isDirectory()) walk(r);
      else if (st.isSymbolicLink()) out.push({ rel: r, mode: '120000', type: 'blob', data: Buffer.from(readlinkSync(abs)) });
      else if (st.isFile()) out.push({ rel: r, mode: '100644', type: 'blob', data: readFileSync(abs) });
      else out.push({ rel: r, mode: 'other', type: 'special file', data: Buffer.alloc(0) });
    }
  };
  walk('');
  return out.sort((x, y) => (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0));
}

export function notice() {
  return [
    'html-plan, built by scripts/pack-html-plan.mjs in pau-skills',
    '',
    'This folder is the html-plan skill from upstream, with three pau-skills additions.',
    '',
    'Upstream:',
    `  Repository: ${UPSTREAM.repository}`,
    `  Path: ${UPSTREAM.path}`,
    `  Commit: ${UPSTREAM.commit}`,
    `  Author: ${UPSTREAM.author}`,
    `  License: ${UPSTREAM.license}, ${UPSTREAM.licenseSource}.`,
    `  The upstream repository's root LICENSE is the ${UPSTREAM.rootLicense}.`,
    '',
    'Every upstream file is kept byte for byte, except these:',
    ...APPENDS.filter((a) => a.file !== 'SKILL.md').map((a) => `  ${a.file}: ${a.what}.`),
    `  ${NUMBERING.file}: ${REPLACED_WHAT}.`,
    ...APPENDS.filter((a) => a.file === 'SKILL.md').map((a) => `  ${a.file}: ${a.what}.`),
    '  NOTICE: this file, new.',
    '',
  ].join('\n');
}

/** The files of the zip, and every problem that stops the build. `appends` maps a scripts/html-plan/ file name to its data. */
export function assemble(tree, appends) {
  const problems = [];
  const byRel = new Map(tree.map((f) => [f.rel, f]));
  const textOf = (rel) => (byRel.get(rel)?.mode === '100644' ? byRel.get(rel).data.toString('utf8') : '');
  for (const { file, anchor } of ANCHORS) {
    const count = textOf(file).split(anchor).length - 1;
    if (count !== 1) problems.push(`${file}: the anchor ${anchor} was found ${count} times; it must be found exactly once (is this upstream at ${UPSTREAM.commit.slice(0, 7)}, not yet built?)`);
  }
  if (byRel.has('NOTICE')) problems.push('NOTICE: upstream already has a NOTICE, which the build would replace (is this a built folder?)');
  for (const f of tree) if (f.mode === 'other') problems.push(`${NAME}/${f.rel}: not a regular file, folder or symbolic link`);
  if (problems.length) return { files: [], problems: [...problems, ...uploadProblems({ dir: NAME, name: NAME, files: tree }, tree)] };

  const files = tree.map((f) => ({ ...f }));
  const at = (rel) => files.find((f) => f.rel === rel);
  const pack = at(NUMBERING.file);
  pack.data = Buffer.from(pack.data.toString('utf8').replace(NUMBERING.anchor, () => NUMBERING.replacement), 'utf8');
  for (const { file, from } of APPENDS) {
    const f = at(file);
    const gap = f.data.length && f.data[f.data.length - 1] === 0x0a ? '\n' : '\n\n';
    f.data = Buffer.concat([f.data, Buffer.from(gap, 'utf8'), appends.get(from)]);
  }
  files.push({ rel: 'NOTICE', mode: '100644', type: 'blob', data: Buffer.from(notice(), 'utf8') });
  files.sort((x, y) => (x.rel < y.rel ? -1 : x.rel > y.rel ? 1 : 0));
  problems.push(...uploadProblems({ dir: NAME, name: NAME, files }, files));
  return { files, problems };
}

/** The time of the last commit that touched the build, else HEAD's time, in Unix seconds. */
function stamp(root) {
  const last = gitTry(root, ['log', '-1', '--format=%ct', 'HEAD', '--', 'scripts/pack-html-plan.mjs', 'scripts/html-plan']);
  return Number(last || git(root, ['log', '-1', '--format=%ct', 'HEAD']).trim()) || 0;
}

export function main(argv, { cwd = process.cwd(), log = console.log, warn = console.error } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      log(HELP);
      return 0;
    }
    const upstream = resolve(cwd, opts.upstream);
    if (!existsSync(upstream) || !statSync(upstream).isDirectory()) throw new Failure(`--upstream ${upstream} is not a folder`, 2);
    if (!existsSync(join(upstream, 'SKILL.md'))) {
      throw new Failure(`--upstream ${upstream} has no SKILL.md (point it at ${UPSTREAM.path} in the upstream checkout)`, 2);
    }
    const out = resolve(cwd, opts.out || join(ROOT, 'dist'));
    if (existsSync(out) && !statSync(out).isDirectory()) throw new Failure(`--out ${out} is not a folder`, 2);

    const appends = new Map(APPENDS.map(({ from }) => [from, readFileSync(join(HERE, 'html-plan', from))]));
    const { files, problems } = assemble(readTree(upstream), appends);
    if (problems.length) {
      warn(`Refused: ${problems.length} problem${problems.length === 1 ? '' : 's'}, so no zip was written:`);
      for (const p of problems) warn(`  ${p}`);
      return 1;
    }
    const zip = buildZip(files.map((f) => ({ path: `${NAME}/${f.rel}`, mode: 0o100644, data: f.data })), stamp(ROOT));
    try {
      mkdirSync(out, { recursive: true });
    } catch (e) {
      throw new Failure(`cannot create the output folder ${out}: ${e.message}`, 2);
    }
    const file = join(out, `${NAME}.zip`);
    writeFileSync(file, zip);
    log(`${file}  ${files.length} files  ${zip.length} bytes`);
    return 0;
  } catch (e) {
    if (!(e instanceof Failure)) throw e;
    warn(e.message);
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
