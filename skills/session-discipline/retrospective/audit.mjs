#!/usr/bin/env node
/**
 * Rules audit for the retrospective skill. No dependencies.
 *
 *   node audit.mjs                       size report + the most overlapping pairs across every rule store
 *   node audit.mjs --check <file.md>     score ONE proposed learning against every existing unit (the gate)
 *   node audit.mjs --stale               list backticked paths and `npm run` scripts cited in project rules that no longer exist
 *   node audit.mjs --top 30              more pairs; --min 0.18 lowers the overlap floor
 *   node audit.mjs --home <dir>          read the user stores from <dir>/.claude instead of the real home (tests)
 *
 * Run it from the project root. Stores (all optional): ~/.claude/CLAUDE.md, ./CLAUDE.md, the project's memory dir
 * (~/.claude/projects/<slug>/memory, slug derived from the cwd the way Claude Code does), every SKILL.md under
 * ~/.claude/skills/<name> and ./.claude/skills/<name>, and the skills synced from claude.ai under
 * ~/.claude/skills/synced/<id>/<name>. CLAUDE.md files are split into units at headings and bullets; each memory
 * file and each skill is one unit. Overlap is bigram containment after stopword removal: two paragraphs that restate
 * each other score high, two that share a topic in different words score low. That is what the gate is for: "is
 * this ALREADY here" before "add it".
 *
 * Short CLAUDE.md units (12 or fewer content words) have too few bigrams for that: "Use pnpm, never npm." has two,
 * and an unrelated sentence sharing one scores 0.500. --check scores them instead by the share of the unit's
 * distinct content words found in the proposal, every word inside a code span included whatever its length (a word
 * score: DUPLICATE at 3 or more shared words and a share of 0.75, RELATED at 2 and 0.5). A word-score verdict is a
 * candidate: the agent reads the bullet (one line) and confirms it before dropping or merging a learning. Known
 * limits: a unit of one or two content words can never be DUPLICATE (read those yourself), negation is lost ("never"
 * and "not" are stopwords), and word forms and synonyms differ ("test" against "tests", "ask" against "asking",
 * "before" against "first"). Synced skills are scored by --check, labelled [synced skill]; a skill that is both
 * local and synced is one unit with both labels. Short units and synced skills stay out of the pairs report and the
 * largest units: synced skills are edited at their source, and synced files run to tens of KB.
 */
import { readFileSync, readdirSync, existsSync, statSync, realpathSync } from 'node:fs';
import { join, basename, dirname } from 'node:path';
import { homedir } from 'node:os';
import { pathToFileURL } from 'node:url';

const STOP = new Set('the a an and or of to in on for with is are was were be been it its this that these those as at by from into not no if then than so we you i he she they our your their do does did done have has had will would can could should may might must never always every any some one two three also only just very more most such which who what when where how why here there'.split(' '));

export const tokens = (s) => s.toLowerCase().replace(/`[^`]*`/g, ' code ').replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w) && w.length > 2);

// Word BIGRAMS and the overlap coefficient (intersection over the SMALLER set), not 3-shingle Jaccard: a control
// run scored a rule that was already present nearly verbatim at 0.058 with Jaccard, because a short proposal
// against a long unit is dominated by the unit's size. Containment answers the real question: "how much of the
// NEW text is already in there".
export const shingles = (s) => { const t = tokens(s); const out = new Set(); for (let i = 0; i + 1 < t.length; i++) out.add(t[i] + ' ' + t[i + 1]); return out; };
export const containment = (a, b) => { if (!a.size || !b.size) return 0; let inter = 0; for (const x of a) if (b.has(x)) inter++; return inter / Math.min(a.size, b.size); };

export const DUPLICATE_AT = 0.35;
export const RELATED_AT = 0.15;
export function verdict(top) {
  return top >= DUPLICATE_AT ? 'DUPLICATE/EXTENDS' : top >= RELATED_AT ? 'RELATED' : 'NEW';
}

// Short units: the same words as tokens(), but a code span keeps its words ("`pnpm`" is "pnpm", not "code"), of any
// length ("`rg`" is "rg"), because in a short bullet the tool named in the span is often the whole rule. The proposal
// keeps words of any length, so a plain "rg" in it matches.
export const SHORT_MAX = 12;
const plainWords = (s) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w && !STOP.has(w));
export const words = (s) => [
  ...plainWords(s.replace(/`[^`]*`/g, ' ')).filter((w) => w.length > 2),
  ...[...s.matchAll(/`([^`]*)`/g)].flatMap((m) => plainWords(m[1])),
];

/** Word score of a short unit against a proposal: { shared, total, score } over the unit's distinct content words. */
export function wordScore(unitText, proposalText) {
  const mine = new Set(words(unitText)); const theirs = new Set(plainWords(proposalText));
  let shared = 0; for (const w of mine) if (theirs.has(w)) shared++;
  return { shared, total: mine.size, score: mine.size ? shared / mine.size : 0 };
}
export function wordVerdict({ shared, score }) {
  return shared >= 3 && score >= 0.75 ? 'DUPLICATE/EXTENDS' : shared >= 2 && score >= 0.5 ? 'RELATED' : 'NEW';
}
const RANK = { 'DUPLICATE/EXTENDS': 2, RELATED: 1, NEW: 0 };

/** Claude Code's project slug: every ':', '\', '/' and space becomes one '-' ("C:\Some Dir" -> "C--Some-Dir"). */
export const projectSlug = (cwd) => cwd.replace(/[:\\/ ]/g, '-');

/** Split a CLAUDE.md into units: each heading starts a unit; each top-level or first-level bullet starts a unit. A unit
 * of 12 or fewer content words is marked short; one with none is dropped. */
export function unitsOf(label, text) {
  const out = [];
  let cur = null; let name = label;
  for (const line of text.split(/\r?\n/)) {
    const h = /^#{1,6}\s+(.*)/.exec(line);
    const b = /^\s{0,4}- /.test(line);
    if (h) { if (cur) out.push(cur); name = h[1].trim(); cur = { store: label, name, text: '' }; continue; }
    if (b) { if (cur) out.push(cur); cur = { store: label, name: `${name} > ${line.trim().slice(2, 70).trim()}`, text: '' }; }
    if (!cur) cur = { store: label, name, text: '' };
    cur.text += line + '\n';
  }
  if (cur) out.push(cur);
  return out.map((u) => { const n = tokens(u.text).length; return n > SHORT_MAX ? u : n > 0 ? { ...u, short: true } : null; }).filter(Boolean);
}

// Paths worth checking: anything under a usual top-level folder, or a bare file name with a known extension.
const PATH_RE = /`((?:src|docs|scripts|tests|test|lib|app|packages|public|config|\.github|\.claude)\/[A-Za-z0-9_.\-/()[\]]+|[A-Za-z0-9_.-]+\.(?:md|mjs|cjs|js|ts|tsx|json|toml|sql|yml|yaml|sh))`/g;
const NPM_RE = /`npm run ([a-z0-9:_-]+)`/g;

/** Stale references in the given stores: [{ kind: 'path'|'script', ref, store }]. */
export function findStale(storeList, cwd, scripts) {
  const missing = [];
  for (const s of storeList) {
    const seen = new Set();
    for (const m of s.text.matchAll(PATH_RE)) {
      const p = m[1].replace(/\/\*\*?$/, '').replace(/\[[^\]]*\]/g, '_');
      if (seen.has(p) || /[*<>]/.test(p)) continue; seen.add(p);
      if (!existsSync(join(cwd, p))) missing.push({ kind: 'path', ref: p, store: s.label });
    }
    for (const m of s.text.matchAll(NPM_RE)) {
      if (seen.has('npm:' + m[1])) continue; seen.add('npm:' + m[1]);
      if (!(m[1] in scripts)) missing.push({ kind: 'script', ref: m[1], store: s.label });
    }
  }
  return missing;
}

function main(args) {
  const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
  const TOP = Number(opt('--top', 20));
  const MIN = Number(opt('--min', 0.30));
  const CHECK = opt('--check', null);
  const home = opt('--home', homedir());
  const cwd = process.cwd();

  const stores = [];
  const add = (label, file) => { if (existsSync(file)) stores.push({ label, file, text: readFileSync(file, 'utf8') }); };
  add('global CLAUDE.md', join(home, '.claude', 'CLAUDE.md'));
  add('project CLAUDE.md', join(cwd, 'CLAUDE.md'));
  const memDir = join(home, '.claude', 'projects', projectSlug(cwd), 'memory');
  const memFiles = existsSync(memDir) ? readdirSync(memDir).filter((f) => f.endsWith('.md') && f !== 'MEMORY.md') : [];
  const skillDirs = [join(home, '.claude', 'skills'), join(cwd, '.claude', 'skills')];
  const skillFiles = skillDirs.filter((d) => existsSync(d))
    .flatMap((d) => readdirSync(d).map((s) => join(d, s, 'SKILL.md')))
    .filter((f) => existsSync(f));
  // Synced from claude.ai: synced/<id>/<name>/SKILL.md, with files such as manifest.json beside the folders, so an
  // entry that is not a folder is skipped, never read as one.
  const isDir = (p) => { try { return statSync(p).isDirectory(); } catch { return false; } };
  const subdirs = (d) => (isDir(d) ? readdirSync(d).map((n) => join(d, n)) : []);
  const syncedFiles = subdirs(join(home, '.claude', 'skills', 'synced')).flatMap(subdirs)
    .map((d) => join(d, 'SKILL.md')).filter((f) => existsSync(f));
  const skillName = (f) => basename(dirname(f)) + '/SKILL.md';

  const units = [];
  for (const s of stores) units.push(...unitsOf(s.label, s.text));
  for (const f of memFiles) units.push({ store: 'memory', name: f, text: readFileSync(join(memDir, f), 'utf8').replace(/^---[\s\S]*?---\r?\n/, '') });
  for (const f of skillFiles) units.push({ store: 'skill', name: skillName(f), text: readFileSync(f, 'utf8') });
  // A synced skill that is also installed locally is one unit with both labels, scored against both texts.
  const local = new Map(units.filter((u) => u.store === 'skill').map((u) => [u.name, u]));
  const synced = new Map();
  for (const f of syncedFiles) if (!synced.has(skillName(f))) synced.set(skillName(f), f);
  for (const [name, f] of synced) {
    const text = readFileSync(f, 'utf8');
    const u = local.get(name);
    if (u) { u.store = 'skill, synced skill'; u.alt = text; } else units.push({ store: 'synced skill', synced: true, name, text });
  }
  for (const u of units) { u.sh = shingles(u.text); if (u.alt) u.altSh = shingles(u.alt); }
  // The pairs report and the largest units: long units of the local stores only.
  const reportUnits = units.filter((u) => !u.short && !u.synced);

  if (CHECK) {
    const text = readFileSync(CHECK, 'utf8');
    const sh = shingles(text);
    const scored = units.map((u) => {
      if (u.short) { const w = wordScore(u.text, text); return { u, score: w.score, v: wordVerdict(w), note: `  (word score: ${w.shared} of ${w.total} words)` }; }
      const score = Math.max(containment(sh, u.sh), u.altSh ? containment(sh, u.altSh) : 0);
      return { u, score, v: verdict(score), note: '' };
    }).sort((a, b) => RANK[b.v] - RANK[a.v] || b.score - a.score).slice(0, 8);
    console.log(`Proposed learning: ${CHECK} (${tokens(text).length} content words). Closest existing units (bigram containment; short CLAUDE.md units by word score):`);
    for (const { u, score, note } of scored) console.log(`  ${score.toFixed(3)}  [${u.store}] ${u.name}${note}`);
    const v = scored[0]?.v ?? 'NEW';
    console.log(v === 'DUPLICATE/EXTENDS' ? '\nVERDICT: DUPLICATE/EXTENDS. This is already stated; edit that unit (or make it enforceable). Do not add a new one.'
      : v === 'RELATED' ? '\nVERDICT: RELATED. Add only what is new, inside the closest unit.'
      : '\nVERDICT: NEW. A new unit is justified only if it is a rule that will recur, not a one-off.');
    return 0;
  }

  if (args.includes('--stale')) {
    // Project stores only: the global CLAUDE.md, the user's skills and the synced skills cite paths of many projects.
    const projectStores = stores.filter((s) => s.label !== 'global CLAUDE.md');
    for (const f of memFiles) projectStores.push({ label: `memory ${f}`, text: readFileSync(join(memDir, f), 'utf8') });
    const localSkills = join(cwd, '.claude', 'skills');
    if (existsSync(localSkills)) for (const d of readdirSync(localSkills)) { const p = join(localSkills, d, 'SKILL.md'); if (existsSync(p)) projectStores.push({ label: `project skill ${d}`, text: readFileSync(p, 'utf8') }); }
    let scripts = {};
    try { scripts = JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8').replace(/^\uFEFF/, '')).scripts || {}; } catch {}
    const missing = findStale(projectStores, cwd, scripts);
    for (const m of missing) console.log(m.kind === 'path' ? `  MISSING PATH   ${m.ref}   <- ${m.store}` : `  MISSING SCRIPT npm run ${m.ref}   <- ${m.store}`);
    console.log(missing.length ? `\n${missing.length} stale reference(s): fix or delete the sentence that cites each one.` : 'No stale references in project CLAUDE.md, memory or project skills.');
    return missing.length ? 2 : 0;
  }

  const est = (n) => Math.round(n / 4); // rough tokens
  console.log('== Rule stores ==');
  for (const s of stores) console.log(`  ${String(s.text.length).padStart(7)} bytes  ~${String(est(s.text.length)).padStart(5)} tok  ${s.label}  (${s.file})`);
  if (existsSync(join(memDir, 'MEMORY.md'))) { const n = readFileSync(join(memDir, 'MEMORY.md'), 'utf8').length; console.log(`  ${String(n).padStart(7)} bytes  ~${String(est(n)).padStart(5)} tok  MEMORY.md index (loaded every session)`); }
  const memBytes = memFiles.reduce((n, f) => n + statSync(join(memDir, f)).size, 0);
  console.log(`  ${String(memBytes).padStart(7)} bytes  ~${String(est(memBytes)).padStart(5)} tok  ${memFiles.length} memory files (loaded on recall)`);
  console.log(`  ${skillFiles.length} skills`);
  const syncedBytes = [...synced.values()].reduce((n, f) => n + statSync(f).size, 0);
  console.log(`  ${String(syncedBytes).padStart(7)} bytes  ~${String(est(syncedBytes)).padStart(5)} tok  ${synced.size} synced skills from claude.ai (edited at their source; scored only by --check)`);

  console.log('\n== Largest units ==');
  for (const u of [...reportUnits].sort((a, b) => b.text.length - a.text.length).slice(0, 8)) console.log(`  ${String(u.text.length).padStart(6)} bytes  [${u.store}] ${u.name}`);

  console.log(`\n== Most overlapping pairs (bigram containment, floor ${MIN}) ==`);
  const pairs = [];
  for (let i = 0; i < reportUnits.length; i++) for (let j = i + 1; j < reportUnits.length; j++) {
    const s = containment(reportUnits[i].sh, reportUnits[j].sh);
    if (s >= MIN) pairs.push({ s, a: reportUnits[i], b: reportUnits[j] });
  }
  pairs.sort((x, y) => y.s - x.s);
  if (!pairs.length) console.log('  none above the floor');
  for (const p of pairs.slice(0, TOP)) console.log(`  ${p.s.toFixed(3)}  [${p.a.store}] ${p.a.name}\n         <-> [${p.b.store}] ${p.b.name}`);
  const shortCount = units.filter((u) => u.short).length;
  console.log(`\n${reportUnits.length} units compared, ${pairs.length} pairs at or above the floor. Scored only by --check: ${shortCount} short CLAUDE.md units, ${units.filter((u) => u.synced).length} synced-only skills.`);
  return 0;
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) process.exit(main(process.argv.slice(2)));
