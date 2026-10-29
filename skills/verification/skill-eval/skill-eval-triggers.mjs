// skill-eval module: the triggers command. Finds the skills and the request lists, prints the plan and the estimate,
// keeps the round within the cap, runs every request as a one-turn headless `claude -p` in a fresh folder that has
// every skill installed, and writes summary.json. Reading and counting the transcripts is in
// skill-eval-triggers-count.mjs. Money is whole micro-dollars throughout.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, cpSync, rmSync, realpathSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { findMetaWords, skillNameOf, childEnv, platformProblem, claudeName, checkLogin } from './skill-eval-core.mjs';
import { isInside, realOrPlanned, inheritedConfig, microsArg, microsUsd, git, isFreeFolder, writeParts } from './skill-eval-files.mjs';
import { runOne } from './skill-eval-setup.mjs';
import { readRun, countRound, renderReport, compareBaseline, splitSummary, mergeParts } from './skill-eval-triggers-count.mjs';

/**
 * True when a run with hard stop `stop` may start: what was spent, plus the hard stops of the runs in flight
 * (`reserved`), plus its own hard stop stay within the cap (all micro-dollars). A run cannot spend past its hard stop,
 * so the round cannot pass the cap unless a run costs more than its hard stop.
 */
const fits = (spent, reserved, stop, cap) => spent + reserved + stop <= cap;

const SKILL_NAME = /^[a-z0-9-]+$/;
const MAX_LIST_BYTES = 1_000_000;
const MAX_REQUEST = 2_000;

class Refusal extends Error {}
const refusal = (msg) => new Refusal(msg);

/**
 * Every skill folder below `dir`: one with a SKILL.md, not looked into further; dot folders and node_modules skipped.
 * A link to a folder is followed, the way Claude Code loads a linked skill folder; a folder already seen is skipped.
 */
function skillFolders(dir) {
  const out = [];
  const seen = new Set();
  const visit = (d) => {
    const real = realpathSync(d);
    if (seen.has(real)) return;
    seen.add(real);
    if (existsSync(join(d, 'SKILL.md'))) { out.push(d); return; }
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.name.startsWith('.') || e.name === 'node_modules') continue;
      const p = join(d, e.name);
      if (e.isDirectory() || (e.isSymbolicLink() && statSync(p, { throwIfNoEntry: false })?.isDirectory())) visit(p);
    }
  };
  visit(dir);
  return out;
}

/** { under: Map name -> folder, also: Map name -> folder } from the --skills and --also folders; throws a Refusal. */
function discover(skillDirs, alsoDirs) {
  const files = new Map();
  const found = { under: new Map(), also: new Map() };
  for (const [kind, dirs] of [['under', skillDirs], ['also', alsoDirs]]) {
    for (const d of dirs.map((x) => resolve(x))) {
      if (!existsSync(d) || !statSync(d).isDirectory()) throw refusal(`the folder ${d} does not exist`);
      const folders = skillFolders(d);
      if (!folders.length) throw refusal(`no SKILL.md below ${d}`);
      for (const f of folders) {
        const md = join(f, 'SKILL.md');
        const name = skillNameOf(readFileSync(md, 'utf8'));
        if (!name) throw refusal(`${md} has no name in its frontmatter`);
        if (!SKILL_NAME.test(name)) throw refusal(`${md}: the name ${name} may hold only lower-case letters, digits and -`);
        if (files.has(name)) throw refusal(`the name ${name} is used twice: ${files.get(name)} and ${md}`);
        files.set(name, md);
        found[kind].set(name, f);
      }
    }
  }
  return found;
}

const isRequest = (r) => typeof r === 'string';

/** The lists in `dir`, by skill name: [{ skill, file, should: [text], nearMisses: [{ request, expect }] }]; throws a Refusal. */
function readLists(dir, under, installed) {
  const d = resolve(dir);
  if (!existsSync(d) || !statSync(d).isDirectory()) throw refusal(`the folder ${d} does not exist`);
  const lists = [];
  const bySkill = new Map();
  for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    if (!e.isFile() || !e.name.endsWith('.json')) continue;
    const file = join(d, e.name);
    const bad = (why) => refusal(`${file}: ${why}`);
    if (statSync(file).size > MAX_LIST_BYTES) throw bad(`larger than ${MAX_LIST_BYTES} bytes`);
    let l;
    try { l = JSON.parse(readFileSync(file, 'utf8')); } catch (err) { throw bad(`not JSON (${err.message})`); }
    const shape = l && typeof l === 'object' && !Array.isArray(l) && typeof l.skill === 'string' && Array.isArray(l.should)
      && Array.isArray(l.nearMisses) && l.should.every(isRequest)
      && l.nearMisses.every((n) => n && typeof n === 'object' && isRequest(n.request) && typeof n.expect === 'string');
    if (!shape) throw bad('a list is { "skill": "<name>", "should": ["<request>", ...], "nearMisses": [{ "request": "...", "expect": "<skill or none>" }, ...] }');
    if (!l.should.length && !l.nearMisses.length) throw bad('no requests');
    if (l.skill === 'round') throw bad('a list may not be for a skill named round: its part would clash with round.json in summary/');
    if (!under.has(l.skill)) throw bad(`${l.skill} is not a skill under test (--skills)`);
    if (bySkill.has(l.skill)) throw bad(`a second list for ${l.skill}, after ${bySkill.get(l.skill)}`);
    bySkill.set(l.skill, file);
    const requests = [...l.should.map((r, i) => [`should ${i + 1}`, r]), ...l.nearMisses.map((n, i) => [`nearMisses ${i + 1}`, n.request])];
    for (const [where, r] of requests) {
      if (!r.trim()) throw bad(`${where} is empty`);
      // A line break, a tab, NUL and the like: a request is one line a user types, and NUL cannot reach a process.
      if (/[\x00-\x1f\x7f]/.test(r)) throw bad(`${where} has a control character: ${JSON.stringify(r)}`);
      if (r.length > MAX_REQUEST) throw bad(`${where} is longer than ${MAX_REQUEST} characters`);
      if (/^\s*\//.test(r)) throw bad(`${where} starts with / (a typed name never goes through the Skill tool): ${r}`);
      if (/^\s*-/.test(r)) throw bad(`${where} starts with - (it would read as an option): ${r}`);
    }
    for (const n of l.nearMisses) {
      if (n.expect === l.skill) throw bad(`the near miss ${JSON.stringify(n.request)} expects its own list's skill; put it under should`);
      if (n.expect !== 'none' && !installed.has(n.expect)) throw bad(`the near miss ${JSON.stringify(n.request)} expects ${n.expect}, which is not installed (--skills or --also) and not "none"`);
    }
    lists.push({ skill: l.skill, file, should: l.should, nearMisses: l.nearMisses });
  }
  if (!lists.length) throw refusal(`no lists: ${d} holds no .json file`);
  return lists.sort((a, b) => (a.skill < b.skill ? -1 : 1));
}

/** Every run, repeat 1 of every request first; within a repeat by list, should before near misses, in file order. */
function planRuns(lists, repeats) {
  const items = lists.flatMap((l) => [
    ...l.should.map((request, i) => ({ list: l.skill, kind: 'should', index: i + 1, request, expect: l.skill })),
    ...l.nearMisses.map((n, i) => ({ list: l.skill, kind: 'nearMiss', index: i + 1, request: n.request, expect: n.expect })),
  ]);
  const runs = [];
  for (let repeat = 1; repeat <= repeats; repeat++) {
    for (const it of items) runs.push({ id: `${it.list}-${it.kind === 'should' ? 's' : 'n'}${it.index}-r${repeat}`, ...it, repeat });
  }
  return runs;
}

/** An older summary.json, or a folder of its parts (round.json and every other *.json) merged into one. */
function readBaseline(file) {
  const f = resolve(file);
  if (!existsSync(f)) throw refusal(`the baseline ${f} does not exist`);
  const read = (p) => { try { return JSON.parse(readFileSync(p, 'utf8')); } catch { throw refusal(`the baseline ${p} is not JSON`); } };
  if (statSync(f).isDirectory()) {
    const names = readdirSync(f, { withFileTypes: true }).filter((e) => e.isFile() && e.name.endsWith('.json')).map((e) => e.name).sort();
    const parts = Object.fromEntries(names.map((n) => [n, read(join(f, n))]));
    try { return { file: f, data: mergeParts(parts) }; } catch (e) { throw refusal(`the baseline folder ${f}: ${e.message}`); }
  }
  const b = read(f);
  if (!b || typeof b !== 'object' || !Object.hasOwn(b, 'format') || b.format !== 1) throw refusal(`the baseline ${f} is not a summary.json with "format": 1`);
  return { file: f, data: b };
}

/** A runs entry for a run that never started claude: it is failed, and it costs nothing. */
const notStarted = (run, why) => ({
  ...run, started: 'none', firstTool: null, costMicros: null, result: 'failed before claude started', finished: false, spawned: false,
  notes: [`failed before claude started: ${why}`],
});

/**
 * One run in its own folder under the root, with hard stop `stop`; resolves to its runs entry and never rejects: a run
 * whose folder, copy or start fails is a failed run. `runner` starts claude (runOne; the tests pass a stand-in).
 */
async function oneRun(run, { root, lab, o, installed, stop, runner = runOne }) {
  let parent = null;
  try {
    for (let tries = 0; ; tries++) {
      parent = mkdtempSync(join(root, 'tmp.'));
      if (!findMetaWords(basename(parent)).length) break;
      rmSync(parent, { recursive: true, force: true });
      parent = null;
      if (tries > 20) throw new Error('could not make a neutral folder name');
    }
    const project = join(parent, 'project');
    const home = join(parent, 'home');
    for (const [name, dir] of installed) {
      // The real files, also behind a link, so a run never writes through a link into the source.
      cpSync(dir, join(project, '.claude', 'skills', name), { recursive: true, dereference: true, filter: (src) => basename(src) !== '.git' });
    }
    mkdirSync(home);
    const argv = ['-p', run.request,
      '--max-turns', '1',
      '--output-format', 'stream-json', '--verbose', '--model', o.model,
      '--setting-sources', 'project',
      '--strict-mcp-config', '--no-session-persistence', '--max-budget-usd', microsArg(stop)];
    const env = childEnv(process.env, o.realHome ? process.env.HOME : home, o.passEnv);
    const res = await runner({ id: run.id, dir: project }, argv, { lab, timeoutMin: o.timeoutMin, env });
    if (res.error) return notStarted(run, res.error);
    const file = join(lab, 'runs', `${run.id}.jsonl`);
    const x = readRun(existsSync(file) ? readFileSync(file, 'utf8') : '');
    const notes = [];
    if (!x.finished) notes.push('no result line: the run did not finish');
    // claude -p --max-turns 1 exits 1 after every run that ends error_max_turns, the usual one-turn end: no note.
    if (res.exit !== 0 && !(res.exit === 1 && x.subtype === 'error_max_turns')) notes.push(`exit ${res.exit ?? res.signal}`);
    const offered = new Set((x.skills || []).map((s) => s.split(':').pop()));
    const lacking = x.skills ? [...installed.keys()].filter((n) => !offered.has(n)) : [];
    if (lacking.length) notes.push(`the init skills list lacks ${lacking.join(', ')}`);
    return {
      ...run, started: x.started, firstTool: x.firstTool, costMicros: x.costMicros,
      result: x.finished ? (x.subtype ?? 'unknown') : 'no result line', finished: x.finished, spawned: true, notes,
    };
  } catch (e) {
    return notStarted(run, e.message);
  } finally {
    if (parent) rmSync(parent, { recursive: true, force: true });
  }
}

/** Runs the plan within the cap; returns { entries: Map id -> entry, spent }. */
async function round(runs, ctx, { cap, usdPerRun, parallel }) {
  const entries = new Map();
  const running = new Set();
  let spent = 0;
  let price = usdPerRun; // the highest real cost seen, never lowered, at least --usd-per-run
  let reserved = 0; // the hard stops of the runs in flight
  let inFlight = 0;
  let costKnown = false; // until a real cost is known, one run at a time
  let next = 0;
  while (next < runs.length) {
    const stop = 2 * price;
    if (inFlight < parallel && (costKnown || inFlight === 0) && fits(spent, reserved, stop, cap)) {
      const run = runs[next++];
      inFlight++;
      reserved += stop;
      const p = oneRun(run, { ...ctx, stop }).then((entry) => {
        const cost = entry.costMicros;
        spent += cost ?? (entry.spawned ? stop : 0);
        if (cost !== null) {
          price = Math.max(price, cost);
          costKnown = true;
        }
        entries.set(run.id, entry);
      }).finally(() => { inFlight--; reserved -= stop; running.delete(p); });
      running.add(p);
      continue;
    }
    if (inFlight === 0) break;
    await Promise.race(running);
  }
  await Promise.all(running);
  return { entries, spent };
}

async function triggers(o, out, err) {
  const refuse = (msg) => { err(`refused: ${msg}`); return 1; };
  const lab = resolve(o.target);
  let skills;
  let lists;
  let baseline = null;
  try {
    skills = discover(o.skills, o.also);
    const installed = new Map([...skills.under, ...skills.also]);
    lists = readLists(o.requests, skills.under, installed);
    if (o.baseline) baseline = readBaseline(o.baseline);
  } catch (e) {
    if (e instanceof Refusal) return refuse(e.message);
    throw e;
  }
  if (existsSync(lab) && !statSync(lab).isDirectory()) return refuse(`${lab} is not a folder`);
  if (existsSync(join(lab, 'summary.json'))) return refuse(`${lab} already holds a summary.json; use a new lab folder`);
  if (!isFreeFolder(join(lab, 'summary'))) return refuse(`${join(lab, 'summary')} already exists and is not an empty folder; use a new lab folder`);
  const labReal = realOrPlanned(lab);
  for (const d of [...o.skills, ...o.also, o.requests]) {
    if (isInside(labReal, realOrPlanned(d))) return refuse(`the lab folder ${lab} is inside ${resolve(d)}; keep it apart from the skills and the lists`);
  }

  const installed = new Map([...skills.under, ...skills.also]);
  const runs = planRuns(lists, o.repeats);
  const should = lists.reduce((n, l) => n + l.should.length, 0);
  const near = lists.reduce((n, l) => n + l.nearMisses.length, 0);
  const estimate = runs.length * o.usdPerRunMicros;
  const cap = o.capMicros;
  const names = (m) => [...m.keys()].sort();
  out(`Skills under test: ${skills.under.size} (${lists.length} with a list): ${names(skills.under).join(', ')}`);
  out(`Also installed: ${skills.also.size ? `${skills.also.size}: ${names(skills.also).join(', ')}` : 'none'}`);
  out(`Requests: ${should + near} (${should} should, ${near} near ${near === 1 ? 'miss' : 'misses'}) in ${lists.length} ${lists.length === 1 ? 'list' : 'lists'}`);
  out(`Repeats: ${o.repeats}`);
  out(`Runs: ${should + near} requests x ${o.repeats} = ${runs.length}`);
  out(`Estimate: ${microsUsd(estimate)} (${runs.length} runs x ${microsUsd(o.usdPerRunMicros)})`);
  out(`Cap: ${microsUsd(cap)}`);
  let why = null;
  if (estimate > cap) {
    why = `the estimate ${microsUsd(estimate)} passes the cap ${microsUsd(cap)}; raise --max-usd or lower --repeats`;
  } else if (2 * o.usdPerRunMicros > cap) {
    why = `the cap ${microsUsd(cap)} is below one run's hard stop ${microsUsd(2 * o.usdPerRunMicros)} (twice --usd-per-run), so no run could start; raise --max-usd`;
  }
  if (why) {
    if (o.plan) { out(`This round would be refused: ${why}`); return 0; }
    return refuse(why);
  }
  if (o.plan) { out('Plan only: nothing was run or written.'); return 0; }

  const platform = platformProblem(process.platform, claudeName());
  if (platform) return refuse(platform);
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'r-')));
  try {
    const inherited = inheritedConfig(root);
    if (inherited.length) {
      return refuse(`a run under ${root} would also load ${inherited.join(', ')}; set TMPDIR to a folder with no Claude Code files in it or above it`);
    }
    const repo = git(root, ['rev-parse', '--show-toplevel']);
    if (repo.status === 0) {
      return refuse(`the run root ${root} is inside the git work tree ${repo.stdout.trim()} (git rev-parse --show-toplevel succeeds there), so a run's git commands would reach that repository; set TMPDIR to a folder outside every repository`);
    }
    const sample = join(root, 'tmp.XXXXXX', 'project');
    const hits = findMetaWords(sample);
    if (hits.length) return refuse(`the run folders' path ${sample} contains ${hits.map((h) => `"${h}"`).join(', ')}; every run sees it. Set TMPDIR to a plain folder`);
    const login = checkLogin(o);
    if (login) return refuse(login);

    mkdirSync(join(lab, 'runs'), { recursive: true });
    // round never rejects: a run that fails is a failed entry, and every run in flight has ended when it returns.
    const { entries, spent } = await round(runs, { root, lab, o, installed }, { cap, usdPerRun: o.usdPerRunMicros, parallel: o.parallel });
    const all = runs.map((r) => entries.get(r.id) || {
      ...r, started: null, firstTool: null, costMicros: null, result: 'not run (cap)', finished: false, spawned: false, notes: [],
    });
    const summary = {
      format: 1, model: o.model, repeats: o.repeats, at: new Date().toISOString(), skills: names(skills.under), also: names(skills.also),
      currency: 'USD', capMicros: cap, usdPerRunMicros: o.usdPerRunMicros, estimateMicros: estimate, costMicros: spent,
      runsPlanned: runs.length, runsMade: entries.size, parallel: o.parallel, realHome: o.realHome, runs: all, ...countRound(all),
    };
    writeFileSync(join(lab, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    for (const w of writeParts(join(lab, 'summary'), splitSummary(summary))) err(`warning: ${w}`);
    out('');
    out(renderReport(summary));
    out('');
    out(`Summary: ${join(lab, 'summary.json')} and its parts in ${join(lab, 'summary')}; transcripts in ${join(lab, 'runs')}`);
    if (baseline) {
      const lines = compareBaseline(baseline.data, summary);
      out('');
      out(`Compared with ${baseline.file}:`);
      for (const l of lines.length ? lines : ['no change']) out(`  ${l}`);
    }
    const failed = all.filter((r) => r.started !== null && !r.finished).length;
    if (entries.size < runs.length) err(`stopped at the cap: ${entries.size} of ${runs.length} runs made, ${microsUsd(spent)} spent of ${microsUsd(cap)}`);
    if (spent > cap) err(`the round ended above the cap by ${microsUsd(spent - cap)}: a run cost more than its hard stop`);
    if (failed) err(`${failed} run(s) failed or did not finish; read ${join(lab, 'runs')}/<id>.err`);
    return entries.size < runs.length || failed || spent > cap ? 1 : 0;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export { fits, triggers, planRuns, discover, readLists, oneRun };
