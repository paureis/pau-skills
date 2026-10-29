// skill-eval module, the triggers mode's pure part: reading one transcript, counting a round, the report text and the
// comparison with an older summary. No file system, no child process. Every lookup by a name from input uses a Map or
// Object.hasOwn, so a skill or tool named "constructor" is only a name.
import { microsUsd } from './skill-eval-files.mjs';

/** A skill name compared by the part after its last colon: "moving-kit:pack-boxes" is "pack-boxes". */
const bare = (name) => String(name).split(':').pop();

/**
 * What one stream-json transcript shows: { started, firstTool, costMicros, subtype, skills, finished }. `started` is the
 * bare `skill` of the main agent's first Skill call, or "none"; `skills` is the init line's list, or null without one.
 */
export function readRun(text) {
  const x = { started: 'none', firstTool: null, costMicros: null, subtype: null, skills: null, finished: false };
  let toolSeen = false;
  let skillSeen = false;
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    let e;
    try { e = JSON.parse(line); } catch { continue; }
    if (!e || typeof e !== 'object') continue;
    if (e.type === 'system' && e.subtype === 'init') {
      x.skills = Array.isArray(e.skills) ? e.skills.map(String) : [];
    } else if (e.type === 'assistant' && Array.isArray(e.message?.content)) {
      if (e.parent_tool_use_id) continue; // a subagent's call does not count
      for (const c of e.message.content) {
        if (c?.type !== 'tool_use') continue;
        if (!toolSeen) { toolSeen = true; x.firstTool = typeof c.name === 'string' ? c.name : null; }
        if (c.name !== 'Skill' || skillSeen) continue;
        skillSeen = true;
        const s = c.input?.skill;
        x.started = typeof s === 'string' && bare(s).trim() ? bare(s) : 'none';
      }
    } else if (e.type === 'result') {
      x.finished = true;
      x.subtype = typeof e.subtype === 'string' ? e.subtype : null;
      x.costMicros = typeof e.total_cost_usd === 'number' && Number.isFinite(e.total_cost_usd) ? Math.round(e.total_cost_usd * 1e6) : null;
    }
  }
  return x;
}

const nearMissRight = (started, expect) => started === 'none' || started === expect;
const meantFor = (run) => (run.kind === 'should' ? run.list : run.expect);
const isUnsteady = (startedList) => new Set(startedList).size > 1;

/** A run that counts: it was made, and it either finished or started a skill before it stopped. */
const counts = (run) => run.started !== null && run.started !== undefined && (run.finished || run.started !== 'none');

/** True when the run did what its list asked: a should run started its list's skill, or a near miss was right. */
const isRight = (run) => (run.kind === 'should' ? run.started === run.list : nearMissRight(run.started, run.expect));

const byName = (map) => Object.fromEntries([...map].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));

/**
 * Counts a round from its `runs` entries: { perSkill, nearMisses, unsteady, missKinds }. perSkill holds every skill with
 * a list or a start: hits, shouldRuns, misses and wrongStarts. Runs not made, and failed runs that started nothing, are
 * left out of every count.
 */
export function countRound(runs) {
  const per = new Map();
  const skill = (name) => {
    if (!per.has(name)) per.set(name, { hits: 0, shouldRuns: 0, misses: [], wrongStarts: [] });
    return per.get(name);
  };
  const nearMisses = { right: 0, total: 0, wrong: [] };
  const missKinds = { answered: 0, lookedFirst: 0, byTool: new Map() };
  const requests = new Map();
  for (const run of runs) skill(run.list);
  for (const run of runs.filter(counts)) {
    if (run.started !== 'none') skill(run.started);
    if (run.kind === 'should') {
      const s = skill(run.list);
      s.shouldRuns++;
      if (run.started === run.list) s.hits++;
      else s.misses.push({ id: run.id, request: run.request, started: run.started, firstTool: run.started === 'none' ? run.firstTool : null });
      if (run.started === 'none') {
        if (run.firstTool) {
          missKinds.lookedFirst++;
          missKinds.byTool.set(run.firstTool, (missKinds.byTool.get(run.firstTool) || 0) + 1);
        } else missKinds.answered++;
      }
    } else {
      nearMisses.total++;
      if (nearMissRight(run.started, run.expect)) nearMisses.right++;
      else nearMisses.wrong.push({ id: run.id, list: run.list, request: run.request, expect: run.expect, started: run.started });
    }
    if (run.started !== 'none' && run.started !== meantFor(run)) {
      skill(run.started).wrongStarts.push({ id: run.id, list: run.list, kind: run.kind, request: run.request, meantFor: meantFor(run) });
    }
    const key = `${run.list}\n${run.kind}\n${run.index}`;
    if (!requests.has(key)) requests.set(key, { list: run.list, kind: run.kind, index: run.index, request: run.request, started: [] });
    requests.get(key).started.push(run.started);
  }
  const unsteady = [...requests.values()].filter((r) => isUnsteady(r.started)).map((r) => ({ ...r, started: [...new Set(r.started)] }));
  return { perSkill: byName(per), nearMisses, unsteady, missKinds: { ...missKinds, byTool: byName(missKinds.byTool) } };
}

const quote = (s) => JSON.stringify(String(s));

/** The readable report of a summary, as one string. */
export function renderReport(s) {
  const lines = [`Cost: ${microsUsd(s.costMicros)} spent, estimate ${microsUsd(s.estimateMicros)}, cap ${microsUsd(s.capMicros)}; ${s.runsMade} of ${s.runsPlanned} runs made`];
  if (s.costMicros > s.capMicros) lines.push(`Above the cap by ${microsUsd(s.costMicros - s.capMicros)}: a run cost more than its hard stop`);
  lines.push('', 'Per skill:');
  for (const [name, p] of Object.entries(s.perSkill)) {
    const misses = p.misses.map((m) => (m.started !== 'none' ? m.started : m.firstTool ? `none after ${m.firstTool}` : 'none with no tool'));
    const wrong = p.wrongStarts.map((w) => `${w.id} (meant for ${w.meantFor})`);
    lines.push(`  ${name}: hits ${p.hits} of ${p.shouldRuns}; misses ${misses.length}${misses.length ? `: ${misses.join(', ')}` : ''}; wrong starts ${wrong.length}${wrong.length ? `: ${wrong.join(', ')}` : ''}`);
  }
  lines.push('', `Near misses right: ${s.nearMisses.right} of ${s.nearMisses.total}`);
  for (const w of s.nearMisses.wrong) lines.push(`  wrong: ${w.id} started ${w.started}, expected ${w.expect}: ${quote(w.request)}`);
  lines.push('', `Unsteady requests: ${s.unsteady.length ? s.unsteady.length : 'none'}`);
  for (const u of s.unsteady) lines.push(`  ${u.list} ${u.kind} ${u.index}: ${u.started.join(' / ')}: ${quote(u.request)}`);
  const tools = Object.entries(s.missKinds.byTool).map(([t, n]) => `${t} ${n}`).join(', ');
  lines.push('', `Should runs that started nothing: ${s.missKinds.answered} answered or did nothing, ${s.missKinds.lookedFirst} looked first${tools ? ` (${tools})` : ''}`);
  const noted = s.runs.filter((r) => r.notes && r.notes.length);
  if (noted.length) {
    lines.push('', 'Notes:');
    for (const r of noted) lines.push(`  ${r.id}: ${r.notes.join('; ')}`);
  }
  const notRun = s.runs.filter((r) => r.started === null).map((r) => r.id);
  if (notRun.length) lines.push('', `Not run (cap): ${notRun.length}: ${notRun.join(', ')}`);
  return lines.join('\n');
}

/** Per request (list, kind, request text): how many counted runs were right, of how many. */
function shares(runs) {
  const out = new Map();
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!run || typeof run !== 'object') continue;
    const key = `${run.list}\n${run.kind}\n${run.request}`;
    if (!out.has(key)) out.set(key, { list: run.list, kind: run.kind, request: run.request, right: 0, total: 0 });
    if (!counts(run)) continue;
    out.get(key).total++;
    if (isRight(run)) out.get(key).right++;
  }
  return out;
}

const own = (obj, key) => (obj && typeof obj === 'object' && Object.hasOwn(obj, key) ? obj[key] : undefined);
const wrongCount = (p) => (Array.isArray(own(p, 'wrongStarts')) ? p.wrongStarts.length : null);

/** What got better or worse since an older summary, one line each: hits and wrong starts per skill, then requests. */
export function compareBaseline(old, now) {
  const lines = [];
  const change = (what, before, after, higherIsBetter) => {
    if (typeof before !== 'number' || typeof after !== 'number' || before === after) return;
    lines.push(`${(after > before) === higherIsBetter ? 'better' : 'worse'}: ${what} ${before} -> ${after}`);
  };
  const oldPer = own(old, 'perSkill');
  for (const [name, p] of Object.entries(now.perSkill || {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const before = own(oldPer, name);
    if (!before) continue;
    change(`${name} hits`, own(before, 'hits'), p.hits, true);
    change(`${name} wrong starts`, wrongCount(before), wrongCount(p), false);
  }
  const was = shares(own(old, 'runs'));
  const is = shares(now.runs);
  const label = (r) => `${r.list} ${r.kind} ${quote(r.request)}`;
  for (const [key, r] of is) {
    const b = was.get(key);
    if (!b || !b.total || !r.total) continue;
    const diff = r.right * b.total - b.right * r.total;
    if (diff) lines.push(`${diff > 0 ? 'better' : 'worse'}: ${label(r)}: right ${b.right} of ${b.total} -> ${r.right} of ${r.total}`);
  }
  for (const [key, r] of is) if (!was.has(key)) lines.push(`new: ${label(r)}`);
  for (const [key, r] of was) if (!is.has(key)) lines.push(`gone: ${label(r)}`);
  return lines;
}

export { bare, nearMissRight, meantFor, isUnsteady, counts };
