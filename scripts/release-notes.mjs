#!/usr/bin/env node
// Patch notes as GitHub Releases (Q31). A batch's pull request adds docs/releases/v<bundle version>.md; npm test
// runs `check` on every notes file, and .github/workflows/release.yml runs `check` and `publish` when the merge
// reaches main. docs/RELEASES.md has the template and the steps.
//
//   node scripts/release-notes.mjs check [--root <dir>]
//   node scripts/release-notes.mjs publish [--root <dir>] [--repo <owner/name>] [--sha <commit>] [--dry-run]
//                                          [--existing <tag,tag,...>]
//
// check: every file in docs/releases/ (media/ aside) is v<major>.<minor>.<patch>.md, has the title on line 1, the six
// sections in order, the three counts, images only from docs/releases/media/, and a version no higher than the
// pau-skills bundle in .claude-plugin/marketplace.json.
// publish: one release per notes file whose tag has none, tagged at --sha (the merge commit), so no session pushes a
// tag. Every unreleased file must carry the bundle version and the tree's skill and hook counts, or nothing is
// created (fail closed), and a tag that exists must point at --sha. The released tags come from gh api, or from
// --existing, with which a dry run runs no gh at all.
//
// Exit: 0 ok, 1 problems (nothing was created), 2 usage.
import { readFileSync, readdirSync, existsSync, statSync, writeFileSync, rmSync, mkdtempSync, realpathSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { BUNDLE } from './build-marketplace.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const SECTIONS = ['New', 'Changed', 'Versions', 'Counts', 'What you do', 'Known issues'];
export const COUNTS = ['Skills', 'Hooks', 'Tests'];
const NAME = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)\.md$/;
const SHORTCODE = /:[a-z0-9_+-]+:/i;
const EMOJI = /[\p{Extended_Pictographic}\p{Regional_Indicator}\u{20E3}]/u;
// Shortcodes, Unicode emoji (with their joiners, variation selectors and skin tones) and spaces before a heading's words.
const LEAD = /^(?:\s|:[a-z0-9_+-]+:|[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Regional_Indicator}\u{200D}\u{FE0F}\u{20E3}])+/iu;
const COUNT = /\b(Skills|Hooks|Tests):[ \t]*(\d[\d,]*)/g;
const NUMBER = /^(?:\d{1,3}(?:,\d{3})*|\d+)$/;
// The one accepted image form, tried at every unescaped "![": alt text with no bracket or line break, then (target).
const IMAGE = /!\[[^[\]\n]*\]\(([^)\s]*)\)/y;
// Any "](target" on the same line, to name the target of a refused image.
const TARGET = /!\[[^\n]*?\]\(([^)\s]*)/y;
// A reference definition: [label]: url at the start of a line, after any blockquote or list markers.
const REF_DEF = /^(?:[ \t]*(?:>|[-*+]|\d+[.)]))*[ \t]*\[([^\]\n]*)\]:[ \t]*(\S*)/;
const HTML_MEDIA = /<(img|picture|source|video)\b/gi;
const MEDIA = /^media\/((?!\.)[\w.-]+)$/;
const REPO = /^[\w.-]+\/[\w.-]+$/;
const SHA = /^[0-9a-f]{40}$/i;

export const HELP = `Check and publish the patch notes in docs/releases/ (docs/RELEASES.md).

  node scripts/release-notes.mjs check [--root <dir>]
  node scripts/release-notes.mjs publish [--root <dir>] [--repo <owner/name>] [--sha <commit>] [--dry-run]
                                         [--existing <tag,tag,...>]

  --root <dir>       the repository (default: the one this script is in)
  --repo <o/name>    the GitHub repository (default: GITHUB_REPOSITORY)
  --sha <commit>     the full 40-character commit id each new release is tagged at (default: GITHUB_SHA;
                     not needed with --dry-run)
  --dry-run          print the gh command and the body of each release instead of running it
  --existing <tags>  the tags that already have a release, comma separated, instead of gh api; a dry run
                     with it runs no gh at all (--existing "" means none).

Exit: 0 ok, 1 problems (nothing was created), 2 usage.`;

class Failure extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

/** Below zero when version a is lower than b, compared part by part as numbers. */
export const compareVersions = (a, b) => {
  const x = a.split('.').map(Number);
  const y = b.split('.').map(Number);
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i] ? -1 : 1;
  return 0;
};

const sectionOf = (heading) => {
  const rest = heading.replace(LEAD, () => '');
  return SECTIONS.find((s) => rest.toLowerCase().startsWith(s.toLowerCase()) && !/^\p{L}/u.test(rest.slice(s.length)));
};

/** The title, counts and problems ({ line, msg }) of one notes file's text. `hasMedia(name)` says if media/<name> exists. */
export function readNotes(text, { version, hasMedia = () => false }) {
  const lines = text.split(/\r?\n/);
  const problems = [];
  const at = (i, msg) => problems.push({ line: i + 1, msg });
  const title = lines[0].startsWith('# ') ? lines[0].slice(2).trim() : '';
  const holds = new RegExp(`(?<![\\d.])${version.split('.').join('\\.')}(?!\\.?\\d)`);
  if (!title || !holds.test(title)) at(0, `line 1 must be "# <title>" with the version ${version} in the title`);
  else if (SHORTCODE.test(title) || EMOJI.test(title)) at(0, 'the title holds a shortcode or an emoji; put them in the ## headings');

  const heads = [];
  // A fence closes only on a bare line of its own character, at least as long (CommonMark), so ~~~ never ends ```.
  let fence = null;
  lines.forEach((l, i) => {
    const f = /^\s*(`{3,}|~{3,})(.*)$/.exec(l);
    if (fence) {
      if (f && f[1][0] === fence[0] && f[1].length >= fence.length && !f[2].trim()) fence = null;
    } else if (f && !(f[1][0] === '`' && f[2].includes('`'))) fence = f[1];
    else if (/^#{1,2}\s/.test(l)) heads.push({ i, section: /^##\s/.test(l) ? sectionOf(l.slice(3)) : undefined });
  });
  const found = new Map();
  heads.forEach((h, k) => {
    if (!h.section) return;
    if (found.has(h.section)) return at(h.i, `the section "${h.section}" appears twice`);
    found.set(h.section, { i: h.i, body: lines.slice(h.i + 1, k + 1 < heads.length ? heads[k + 1].i : lines.length) });
  });
  let last = null;
  for (const s of SECTIONS) {
    const f = found.get(s);
    if (!f) { at(0, `the section "${s}" is missing; the sections are ## ${SECTIONS.join(', ')}, in that order`); continue; }
    if (!f.body.some((l) => l.trim())) at(f.i, `the section "${s}" is empty; write "None." if there is nothing to say`);
    if (last && f.i < last.i) at(f.i, `the section "${s}" must come after "${last.s}"`);
    else last = { s, i: f.i };
  }

  const counts = {};
  const countsSection = found.get('Counts');
  if (countsSection) {
    const seen = new Map(COUNTS.map((k) => [k, []]));
    for (const m of countsSection.body.join('\n').matchAll(COUNT)) {
      if (!NUMBER.test(m[2])) at(countsSection.i, `Counts: "${m[1]}: ${m[2]}" is not a number; write digits, with commas only between groups of three`);
      seen.get(m[1]).push(Number(m[2].split(',').join('')));
    }
    for (const [k, v] of seen) {
      if (v.length === 1) counts[k] = v[0];
      else at(countsSection.i, `Counts: "${k}: <n>" is ${v.length ? `given ${v.length} times` : 'missing'}; write it once`);
    }
  }

  problems.push(...imageProblems(text, lines, hasMedia));
  return { title, counts, problems };
}

// The whole text is scanned, not line by line, so alt text that wraps or nests brackets cannot hide an image.
function imageProblems(text, lines, hasMedia) {
  const out = [];
  const lineOf = (p) => text.slice(0, p).split('\n').length;
  for (let p = text.indexOf('!['); p !== -1; p = text.indexOf('![', p + 2)) {
    let slashes = 0;
    while (text[p - 1 - slashes] === '\\') slashes++;
    if (slashes % 2) continue;
    const at = (msg) => out.push({ line: lineOf(p), msg });
    IMAGE.lastIndex = p;
    const media = MEDIA.exec(IMAGE.exec(text)?.[1] ?? '');
    if (media) {
      if (!hasMedia(media[1])) at(`image media/${media[1]}: docs/releases/media/${media[1]} does not exist`);
      continue;
    }
    TARGET.lastIndex = p;
    const target = TARGET.exec(text)?.[1];
    if (target !== undefined && !MEDIA.test(target)) at(`image target "${target}" is not media/<name>; only the project's own files in docs/releases/media/ are allowed`);
    else at(`image "${text.slice(p).split('\n')[0].slice(0, 40)}" is not ![<alt>](media/<name>); reference-style images, and alt text with a bracket or a line break, are refused`);
  }
  lines.forEach((l, i) => {
    const def = REF_DEF.exec(l);
    // The destination may sit on the next line, and may be written <url>.
    const url = def && (def[2] || (lines[i + 1] || '').trim().split(/\s/)[0]).replace(/^<(.*)>$/, (_, u) => u);
    if (def && !MEDIA.test(url)) out.push({ line: i + 1, msg: `reference definition [${def[1]}] points at "${url}", outside media/` });
    for (const m of l.matchAll(HTML_MEDIA)) out.push({ line: i + 1, msg: `HTML <${m[1].toLowerCase()}> tag: write an image as ![...](media/<name>)` });
  });
  return out;
}

const isFile = (p) => existsSync(p) && statSync(p).isFile();
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();
const dirs = (p) => (isDir(p) ? readdirSync(p).filter((n) => isDir(join(p, n))).sort() : []);

function bundleVersion(root) {
  const market = JSON.parse(readFileSync(join(root, '.claude-plugin', 'marketplace.json'), 'utf8'));
  const version = (market.plugins || []).find((p) => p.name === BUNDLE)?.version;
  if (typeof version !== 'string' || !/^\d+\.\d+\.\d+$/.test(version)) throw new Error(`the "${BUNDLE}" entry has no <major>.<minor>.<patch> version`);
  return version;
}

/** The bundle version, every notes file with what it holds, and every check problem, as "<file>:<line>: <problem>". */
export function checkRoot(root) {
  const problems = [];
  const notes = [];
  let bundle = null;
  try {
    bundle = bundleVersion(root);
  } catch (e) {
    problems.push(`.claude-plugin/marketplace.json: ${e.message}`);
  }
  const dir = join(root, 'docs', 'releases');
  if (!isDir(dir)) return { bundle, notes, problems };
  for (const name of readdirSync(dir).sort()) {
    const file = join(dir, name);
    const rel = `docs/releases/${name}`;
    if (name === 'media' && isDir(file)) continue;
    const m = NAME.exec(name);
    if (!m || !isFile(file)) { problems.push(`${rel}: the name is not v<major>.<minor>.<patch>.md`); continue; }
    const version = `${m[1]}.${m[2]}.${m[3]}`;
    const text = readFileSync(file, 'utf8');
    const r = readNotes(text, { version, hasMedia: (n) => isFile(join(dir, 'media', n)) });
    problems.push(...r.problems.map((p) => `${rel}:${p.line}: ${p.msg}`));
    if (bundle && compareVersions(version, bundle) > 0) problems.push(`${rel}: version ${version} is above the ${BUNDLE} bundle version ${bundle}`);
    notes.push({ file, rel, version, tag: `v${version}`, title: r.title, counts: r.counts, text });
  }
  return { bundle, notes, problems };
}

/** Skills: folders skills/<plugin>/<skill>/ with a SKILL.md. Hooks: distinct hooks/<plugin>/<script>.mjs in the commands of every hooks/<plugin>/hooks.json. */
export function treeCounts(root) {
  let skills = 0;
  for (const p of dirs(join(root, 'skills'))) skills += dirs(join(root, 'skills', p)).filter((s) => isFile(join(root, 'skills', p, s, 'SKILL.md'))).length;
  const hooks = new Set();
  for (const p of dirs(join(root, 'hooks'))) {
    const file = join(root, 'hooks', p, 'hooks.json');
    if (!isFile(file)) continue;
    for (const groups of Object.values(JSON.parse(readFileSync(file, 'utf8')).hooks || {})) {
      for (const g of groups) for (const h of g.hooks || []) for (const m of String(h.command || '').matchAll(/hooks\/[\w.-]+\/[\w.-]+\.mjs/g)) hooks.add(m[0]);
    }
  }
  return { skills, hooks: hooks.size };
}

/** The release body: the notes without line 1, with media/ links pointing at the files at the release's tag. */
export function releaseBody(text, repo, tag) {
  const base = `https://raw.githubusercontent.com/${repo}/${tag}/docs/releases/media/`;
  return text.split(/\r?\n/).slice(1).join('\n').replace(/\]\(media\//g, () => `](${base}`);
}

export function parseArgs(argv) {
  const [cmd, ...rest] = argv;
  if (cmd === '--help' || cmd === '-h') return { help: true };
  if (cmd !== 'check' && cmd !== 'publish') throw new Failure(`the command must be check or publish, not ${cmd === undefined ? 'nothing' : cmd} (see --help)`, 2);
  const allowed = cmd === 'check' ? ['--root'] : ['--root', '--repo', '--sha', '--existing'];
  const opts = { cmd };
  for (let i = 0; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--help' || a === '-h') return { help: true };
    if (a === '--dry-run' && cmd === 'publish') { opts.dryRun = true; continue; }
    if (!allowed.includes(a)) throw new Failure(`unknown option for ${cmd}: ${a} (see --help)`, 2);
    const value = rest[++i];
    if (value === undefined || value.startsWith('--')) throw new Failure(`${a} needs a value (see --help)`, 2);
    const key = a.slice(2);
    if (opts[key] !== undefined) throw new Failure(`${a} is given twice`, 2);
    opts[key] = value;
  }
  return opts;
}

const quote = (s) => `'${s.split("'").join("'\\''")}'`;
// stderr is piped, so a failure carries gh's message (a missing tag is "Not Found (HTTP 404)").
const ghRun = (args) => execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

function publish(opts, root, { env, log, warn, run, tmp }) {
  const repo = opts.repo || env.GITHUB_REPOSITORY;
  const sha = opts.sha || env.GITHUB_SHA;
  if (!repo) throw new Failure('publish needs --repo <owner/name> or GITHUB_REPOSITORY', 2);
  if (!REPO.test(repo)) throw new Failure(`--repo ${repo} is not <owner/name>`, 2);
  if (!sha && !opts.dryRun) throw new Failure('publish needs --sha <commit> or GITHUB_SHA (or --dry-run)', 2);
  if (sha && !SHA.test(sha)) throw new Failure(`--sha ${sha} is not a full 40-character commit id`, 2);

  const { bundle, notes, problems } = checkRoot(root);
  if (problems.length) {
    for (const p of problems) warn(p);
    warn(`Nothing was published: ${problems.length} check problem${problems.length === 1 ? '' : 's'}.`);
    return 1;
  }
  let released;
  try {
    released = opts.existing !== undefined ? opts.existing.split(',') : run(['api', `repos/${repo}/releases`, '--paginate', '--jq', '.[].tag_name']).split(/\r?\n/);
  } catch (e) {
    warn(`Listing the releases of ${repo} with gh api failed: ${e.message}`);
    return 1;
  }
  const existing = new Set(released.map((t) => t.trim()).filter(Boolean));
  const pending = notes.filter((n) => !existing.has(n.tag));
  if (!pending.length) {
    log(`Nothing to publish: ${notes.length ? `all ${notes.length} notes files have a release` : 'docs/releases/ holds no notes file'}.`);
    return 0;
  }

  const tree = treeCounts(root);
  const bad = [];
  for (const n of pending) {
    if (n.version !== bundle) bad.push(`${n.rel}: version ${n.version} is not the bundle version ${bundle}, and ${n.tag} has no release`);
    if (n.counts.Skills !== tree.skills) bad.push(`${n.rel}: Skills: ${n.counts.Skills} in Counts, but the tree has ${tree.skills}`);
    if (n.counts.Hooks !== tree.hooks) bad.push(`${n.rel}: Hooks: ${n.counts.Hooks} in Counts, but the tree has ${tree.hooks}`);
  }
  if (bad.length) {
    for (const b of bad) warn(b);
    const older = pending.some((n) => compareVersions(n.version, bundle) < 0);
    warn(`Nothing was published.${older ? ' An older notes file with no release must first be released by hand on github.com, at its merge commit.' : ''}`);
    return 1;
  }

  // gh ignores --target when the tag exists and attaches the release to the tag's commit, so look the tag up first.
  // A dry run given --existing skips the lookup, so it runs no gh.
  if (!(opts.dryRun && opts.existing !== undefined)) {
    for (const n of pending) {
      let at = null;
      try {
        at = run(['api', `repos/${repo}/git/ref/tags/${n.tag}`, '--jq', '.object.sha']).trim();
      } catch (e) {
        if (!/HTTP 404|Not Found/.test(`${e.stderr || ''} ${e.message}`)) {
          warn(`Nothing was published: looking up tag ${n.tag} failed: ${e.message}`);
          return 1;
        }
      }
      if (at !== null && at !== sha) {
        warn(`Nothing was published: tag ${n.tag} already exists at ${at}, not at ${sha || 'the merge commit'}, and gh would attach the release there. Check the tag on github.com and delete it or release it by hand.`);
        return 1;
      }
    }
  }

  for (const n of pending) {
    const args = (file) => ['release', 'create', n.tag, '--repo', repo, '--target', sha || '<sha>', '--title', n.title, '--notes-file', file];
    if (opts.dryRun) {
      log(`Would publish ${n.tag} from ${n.file}`);
      log(`gh ${args('<body file>').map(quote).join(' ')}`);
      log(releaseBody(n.text, repo, n.tag));
      continue;
    }
    const dir = mkdtempSync(join(tmp, 'release-notes-'));
    const file = join(dir, 'body.md');
    try {
      writeFileSync(file, releaseBody(n.text, repo, n.tag));
      run(args(file));
    } catch (e) {
      warn(`gh release create ${n.tag} failed: ${e.message}`);
      return 1;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    log(`Published ${n.tag} at ${sha}: https://github.com/${repo}/releases/tag/${n.tag}`);
  }
  return 0;
}

export function main(argv, { cwd = process.cwd(), env = process.env, log = console.log, warn = console.error, run = ghRun, tmp = tmpdir() } = {}) {
  try {
    const opts = parseArgs(argv);
    if (opts.help) {
      log(HELP);
      return 0;
    }
    const root = opts.root ? resolve(cwd, opts.root) : ROOT;
    if (!isDir(root)) throw new Failure(`--root ${root} is not a folder`, 2);
    if (opts.cmd === 'publish') return publish(opts, root, { env, log, warn, run, tmp });
    const { notes, problems } = checkRoot(root);
    if (problems.length) {
      for (const p of problems) warn(p);
      warn(`Release notes check failed: ${problems.length} problem${problems.length === 1 ? '' : 's'} in ${notes.length} notes file${notes.length === 1 ? '' : 's'}.`);
      return 1;
    }
    log(`Release notes check passed: ${notes.length} notes file${notes.length === 1 ? '' : 's'}.`);
    return 0;
  } catch (e) {
    if (!(e instanceof Failure)) throw e;
    warn(e.message);
    return e.code;
  }
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) process.exitCode = main(process.argv.slice(2));
