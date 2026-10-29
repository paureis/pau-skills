// skill-eval module: the triggers command. Finds the skills and the request lists, prints the plan and the estimate,
// keeps the round within the cap, runs every request as a one-turn headless `claude -p` in a fresh folder that has
// every skill installed, and writes summary.json. Reading and counting the transcripts is in
// skill-eval-triggers-count.mjs. Money is whole micro-dollars throughout.
import { mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, cpSync, rmSync, realpathSync } from 'node:fs';
import { join, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { findMetaWords, skillNameOf, childEnv, platformProblem, claudeName, checkLogin } from './skill-eval-core.mjs';
import { isInside, realOrPlanned, inheritedConfig, microsArg, microsUsd } from './skill-eval-files.mjs';
import { runOne } from './skill-eval-setup.mjs';
import { readRun, countRound, renderReport, compareBaseline } from './skill-eval-triggers-count.mjs';

/** True when one more run at `price` keeps what is spent plus every run in flight within the cap (all micro-dollars). */
const fits = (spent, inFlight, price, cap) => spent + (inFlight + 1) * price <= cap;

const SKILL_NAME = /^[a-z0-9-]+$/;
const MAX_LIST_BYTES = 1_000_000;
const MAX_REQUEST = 2_000;

class Refusal extends Error {}
const refusal = (msg) => new Refusal(msg);

/** Every skill folder below `dir`: one with a SKILL.md, not looked into further; dot folders and node_modules skipped. */
function skillFolders(dir) {
  const out = [];
  const visit = (d) => {
    if (existsSync(join(d, 'SKILL.md'))) { out.push(d); return; }
    for (const e of readdirSync(d, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
      if (e.isDirectory() && !e.name.startsWith('.') && e.name !== 'node_modules') visit(join(d, e.name));
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
    if (!under.has(l.skill)) throw bad(`${l.skill} is not a skill under test (--skills)`);
    if (bySkill.has(l.skill)) throw bad(`a second list for ${l.skill}, after ${bySkill.get(l.skill)}`);
    bySkill.set(l.skill, file);
    for (const r of [...l.should, ...l.nearMisses.map((n) => n.request)]) {
      if (!r.trim()) throw bad('an empty request');
      if (/[\r\n]/.test(r)) throw bad(`a request with a line break: ${JSON.stringify(r)}`);
      if (r.length > MAX_REQUEST) throw bad(`a request longer than ${MAX_REQUEST} characters`);
      if (/^\s*\//.test(r)) throw bad(`a request starts with / (a typed name never goes through the Skill tool): ${r}`);
      if (/^\s*-/.test(r)) throw bad(`a request starts with - (it would read as an option): ${r}`);
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

function readBaseline(file) {
  const f = resolve(file);
  if (!existsSync(f)) throw refusal(`the baseline ${f} does not exist`);
  let b;
  try { b = JSON.parse(readFileSync(f, 'utf8')); } catch { throw refusal(`the baseline ${f} is not JSON`); }
  if (!b || typeof b !== 'object' || !Object.hasOwn(b, 'format') || b.format !== 1) throw refusal(`the baseline ${f} is not a summary.json with "format": 1`);
  return { file: f, data: b };
}

/** One run in its own folder under the root; resolves to its runs entry and its real cost. */
async function oneRun(run, { root, lab, o, installed, reserved }) {
  let parent;
  for (let tries = 0; ; tries++) {
    parent = mkdtempSync(join(root, 'tmp.'));
    if (!findMetaWords(basename(parent)).length) break;
    rmSync(parent, { recursive: true, force: true });
    if (tries > 20) throw new Error('could not make a neutral folder name');
  }
  try {
    const project = join(parent, 'project');
    const home = join(parent, 'home');
    for (const [name, dir] of installed) {
      cpSync(dir, join(project, '.claude', 'skills', name), { recursive: true, filter: (src) => basename(src) !== '.git' });
    }
    mkdirSync(home);
    const argv = ['-p', run.request,
      '--max-turns', '1',
      '--output-format', 'stream-json', '--verbose', '--model', o.model,
      '--setting-sources', 'project',
      '--strict-mcp-config', '--no-session-persistence', '--max-budget-usd', microsArg(2 * reserved)];
    const env = childEnv(process.env, o.realHome ? process.env.HOME : home, o.passEnv);
    const res = await runOne({ id: run.id, dir: project }, argv, { lab, timeoutMin: o.timeoutMin, env });
    const x = readRun(readFileSync(join(lab, 'runs', `${run.id}.jsonl`), 'utf8'));
    const notes = [];
    if (!x.finished) notes.push('no result line: the run did not finish');
    if (res.error) notes.push(res.error);
    else if (res.exit !== 0) notes.push(`exit ${res.exit ?? res.signal}`);
    const offered = new Set((x.skills || []).map((s) => s.split(':').pop()));
    const lacking = x.skills ? [...installed.keys()].filter((n) => !offered.has(n)) : [];
    if (lacking.length) notes.push(`the init skills list lacks ${lacking.join(', ')}`);
    return {
      ...run, started: x.started, firstTool: x.firstTool, costMicros: x.costMicros,
      result: x.finished ? (x.subtype ?? 'unknown') : 'no result line', finished: x.finished, notes,
    };
  } finally {
    rmSync(parent, { recursive: true, force: true });
  }
}

/** Runs the plan within the cap; returns { entries: Map id -> entry, spent }. */
async function round(runs, ctx, { cap, usdPerRun, parallel }) {
  const entries = new Map();
  const running = new Set();
  let spent = 0;
  let price = usdPerRun;
  let inFlight = 0;
  let costKnown = false; // until a real cost is known, one run at a time
  let next = 0;
  while (next < runs.length) {
    if (inFlight < parallel && (costKnown || inFlight === 0) && fits(spent, inFlight, price, cap)) {
      const run = runs[next++];
      const reserved = price;
      inFlight++;
      const p = oneRun(run, { ...ctx, reserved }).then((entry) => {
        const cost = entry.costMicros;
        spent += cost ?? reserved;
        if (cost !== null) {
          price = Math.max(price, cost);
          costKnown = true;
        }
        entries.set(run.id, entry);
      }).finally(() => { inFlight--; running.delete(p); });
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
  out(`Requests: ${should + near} (${should} should, ${near} near misses) in ${lists.length} lists`);
  out(`Repeats: ${o.repeats}`);
  out(`Runs: ${should + near} requests x ${o.repeats} = ${runs.length}`);
  out(`Estimate: ${microsUsd(estimate)} (${runs.length} runs x ${microsUsd(o.usdPerRunMicros)})`);
  out(`Cap: ${microsUsd(cap)}`);
  if (estimate > cap) {
    const why = `the estimate ${microsUsd(estimate)} passes the cap ${microsUsd(cap)}; raise --max-usd or lower --repeats`;
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
    const sample = join(root, 'tmp.XXXXXX', 'project');
    const hits = findMetaWords(sample);
    if (hits.length) return refuse(`the run folders' path ${sample} contains ${hits.map((h) => `"${h}"`).join(', ')}; every run sees it. Set TMPDIR to a plain folder`);
    const login = checkLogin(o);
    if (login) return refuse(login);

    mkdirSync(join(lab, 'runs'), { recursive: true });
    const { entries, spent } = await round(runs, { root, lab, o, installed }, { cap, usdPerRun: o.usdPerRunMicros, parallel: o.parallel });
    const all = runs.map((r) => entries.get(r.id) || {
      ...r, started: null, firstTool: null, costMicros: null, result: 'not run (cap)', finished: false, notes: [],
    });
    const summary = {
      format: 1, model: o.model, repeats: o.repeats, at: new Date().toISOString(), skills: names(skills.under), also: names(skills.also),
      capMicros: cap, usdPerRunMicros: o.usdPerRunMicros, estimateMicros: estimate, costMicros: spent, runsPlanned: runs.length,
      runsMade: entries.size, parallel: o.parallel, realHome: o.realHome, runs: all, ...countRound(all),
    };
    writeFileSync(join(lab, 'summary.json'), JSON.stringify(summary, null, 2) + '\n');
    out('');
    out(renderReport(summary));
    out('');
    out(`Summary: ${join(lab, 'summary.json')}; transcripts in ${join(lab, 'runs')}`);
    if (baseline) {
      const lines = compareBaseline(baseline.data, summary);
      out('');
      out(`Compared with ${baseline.file}:`);
      for (const l of lines.length ? lines : ['no change']) out(`  ${l}`);
    }
    const failed = all.filter((r) => r.result === 'no result line').length;
    if (entries.size < runs.length) err(`stopped at the cap: ${entries.size} of ${runs.length} runs made, ${microsUsd(spent)} spent of ${microsUsd(cap)}`);
    if (failed) err(`${failed} run(s) failed or did not finish; read ${join(lab, 'runs')}/<id>.err`);
    return entries.size < runs.length || failed ? 1 : 0;
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

export { fits, triggers, planRuns, discover, readLists };
