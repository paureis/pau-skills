// skills-bench runner: reading pilot.json and the tasks, the contract 1 checks a task must pass before setup, the run
// order and the price of each difficulty.
import { readdirSync, readFileSync, existsSync, statSync, lstatSync } from 'node:fs';
import { join, isAbsolute, resolve } from 'node:path';
import {
  REPO, DIFFICULTIES, MAX_BYTES, readJson, findMetaWords, validateRubric, withoutComments, parseUsdMicros, META_WORDS,
} from './common.mjs';

const GROUPS = ['complex', 'control', 'medium', 'simple'];
const ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const BASE_TOOLS = ['Bash(npm test)', 'Bash(node *)', 'Bash(git *)'];
const FORBIDDEN_NAMES = ['.git', '.claude', 'CLAUDE.md', 'CLAUDE.local.md', 'AGENTS.md'];

const usd = (v, what) => {
  const m = parseUsdMicros(v);
  if (m === null || m <= 0) throw new Error(`${what} takes US dollars above 0 with at most 6 decimals, as a string such as "0.15": ${JSON.stringify(v)}`);
  return m;
};
const posInt = (v, what, max = 1000) => {
  if (!Number.isInteger(v) || v < 1 || v > max) throw new Error(`${what} must be a whole number from 1 to ${max}: ${JSON.stringify(v)}`);
  return v;
};
const abs = (p) => (isAbsolute(p) ? p : join(REPO, p));

/** pilot.json, checked, with its paths made absolute and its money in micro-dollars. Throws on a bad file. */
export function loadConfig(file) {
  const where = resolve(file);
  let c;
  try { c = readJson(where); } catch (e) { throw new Error(`${where} is not readable JSON (${e.message})`); }
  if (c.format !== 'skills-bench-pilot/1') throw new Error(`${where}: format must be "skills-bench-pilot/1"`);
  if (typeof c.tasksDir !== 'string' || !c.skills || typeof c.skills !== 'object' || !Object.keys(c.skills).length) {
    throw new Error(`${where}: tasksDir (a path) and skills ({ "<skill>": "<skill folder>" }) are required`);
  }
  const skills = new Map(Object.entries(c.skills).map(([k, v]) => [k, abs(String(v))]));
  const ctl = c.controls || {};
  if (!skills.has(ctl.skill) || typeof ctl.broken !== 'string' || typeof ctl.empty !== 'string') {
    throw new Error(`${where}: controls needs a skill from skills, and broken and empty folders`);
  }
  const order = c.order;
  if (!Array.isArray(order) || order.length !== GROUPS.length || !GROUPS.every((g) => order.includes(g))) {
    throw new Error(`${where}: order must list each of ${GROUPS.join(', ')} once`);
  }
  const prices = {};
  for (const d of DIFFICULTIES) prices[d] = usd(c.usdPerRun?.[d], `usdPerRun.${d}`);
  return {
    file: where, raw: c, tasksDir: abs(c.tasksDir), skills,
    controls: { skill: ctl.skill, broken: abs(ctl.broken), empty: abs(ctl.empty) },
    n: posInt(c.n, 'n', 20), capMicros: usd(c.maxUsd, 'maxUsd'), prices, judgeMicros: usd(c.usdPerJudge, 'usdPerJudge'),
    hardStopFactor: posInt(c.hardStopFactor, 'hardStopFactor', 10), parallel: posInt(c.parallel, 'parallel', 100), order,
  };
}

/** Every file and folder under dir as { rel, abs, dir, link, size }. Never follows a link. */
function walk(dir, rel = '') {
  const out = [];
  for (const name of readdirSync(join(dir, rel)).sort()) {
    const r = rel ? `${rel}/${name}` : name;
    const st = lstatSync(join(dir, r));
    out.push({ rel: r, abs: join(dir, r), dir: st.isDirectory(), link: st.isSymbolicLink(), size: st.size });
    if (st.isDirectory()) out.push(...walk(dir, r));
  }
  return out;
}

/** The criteria of a skill's rubric.md as [{ n, text }], and its problems against contract 1. */
export function rubricCriteria(file) {
  if (!existsSync(file)) return { criteria: [], problems: [`${file} is missing`] };
  const text = readFileSync(file, 'utf8');
  const problems = validateRubric(text).map((p) => `${file}: ${p}`);
  const criteria = [];
  for (const line of withoutComments(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    const m = /^(\d+)\.\s+(\S.*)$/.exec(line.trim());
    if (m) criteria.push({ n: Number(m[1]), text: m[2].trim() });
    else problems.push(`${file}: only numbered criteria lines and HTML comments may be in it, not: ${line.trim().slice(0, 80)}`);
  }
  return { criteria, problems };
}

function checkStart(start, where, problems) {
  if (!existsSync(start) || !statSync(start).isDirectory()) { problems.push(`${where}: start/ is missing`); return; }
  let pkg = null;
  try { pkg = readJson(join(start, 'package.json')); } catch { problems.push(`${where}: start/package.json is missing or not JSON`); }
  if (pkg && pkg.scripts?.test !== 'node --test') problems.push(`${where}: start/package.json needs "test": "node --test"`);
  for (const k of ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies']) {
    if (pkg && pkg[k] && Object.keys(pkg[k]).length) problems.push(`${where}: start/package.json has ${k}; a task has none`);
  }
  for (const e of walk(start)) {
    const name = e.rel.split('/').pop();
    if (e.link) problems.push(`${where}: start/${e.rel} is a link`);
    if (FORBIDDEN_NAMES.includes(name)) problems.push(`${where}: start/${e.rel} may not be in a task`);
    const hits = findMetaWords(name, { allow: ['test'] });
    if (hits.length) problems.push(`${where}: start/${e.rel} has a name with ${hits.join(', ')}`);
  }
}

/** One task folder against contract 1: the task, or null and problems. */
function loadTask(dir, skill, cfg, problems) {
  const id = dir.split(/[\\/]/).pop();
  const where = `task ${skill}/${id}`;
  const before = problems.length;
  if (!ID.test(id)) problems.push(`${where}: a task id has only lowercase letters, digits and -`);
  let t;
  try { t = readJson(join(dir, 'task.json')); } catch { problems.push(`${where}: task.json is missing or not JSON`); return null; }
  if (t.id !== id) problems.push(`${where}: task.json id is ${JSON.stringify(t.id)}, not the folder name`);
  if (t.skill !== skill) problems.push(`${where}: task.json skill is ${JSON.stringify(t.skill)}, not ${skill}`);
  if (!DIFFICULTIES.includes(t.difficulty)) problems.push(`${where}: difficulty must be one of ${DIFFICULTIES.join(', ')}`);
  if (typeof t.slug !== 'string' || !/^[A-Za-z0-9-]+$/.test(t.slug)) problems.push(`${where}: slug has only letters, digits and -`);
  else if (findMetaWords(t.slug).length) problems.push(`${where}: slug ${t.slug} has a word a run must not see (${findMetaWords(t.slug).join(', ')})`);
  if (typeof t.summary !== 'string' || !t.summary.trim() || /[\r\n]/.test(t.summary)) problems.push(`${where}: summary must be one line`);
  const tools = Array.isArray(t.allowTools) && t.allowTools.every((x) => typeof x === 'string' && x.trim()) ? t.allowTools : null;
  const wanted = [...BASE_TOOLS, ...(skill === 'bug-fix' ? ['Bash(npm test *)'] : [])];
  if (!tools || !wanted.every((w) => tools.includes(w))) problems.push(`${where}: allowTools must hold ${wanted.join(', ')}`);
  const words = Array.isArray(t.allowWords) ? t.allowWords : null;
  if (!words || !words.every((w) => META_WORDS.includes(w))) problems.push(`${where}: allowWords must be a list of words from ${META_WORDS.join(', ')}`);
  if (skill === 'tdd' && !(words || []).includes('test')) problems.push(`${where}: a tdd task needs "test" in allowWords, or setup refuses its prompt and its test files`);
  const minutes = t.difficulty === 'complex' ? 30 : 15;
  if (t.timeoutMin !== minutes) problems.push(`${where}: timeoutMin must be ${minutes} for a ${t.difficulty} task`);
  if (typeof t.control !== 'boolean') problems.push(`${where}: control must be true or false`);
  if (t.control === true && skill !== cfg.controls.skill) problems.push(`${where}: only ${cfg.controls.skill} tasks run the controls`);
  if (skill === 'tdd' && (!Array.isArray(t.interface) || !t.interface.length || !t.interface.every((p) => typeof p === 'string' && !isAbsolute(p) && !p.split(/[\\/]/).includes('..')))) {
    problems.push(`${where}: a tdd task needs interface, a list of paths relative to start/`);
  }
  if (t.maxFixLines !== undefined && !Number.isInteger(t.maxFixLines)) problems.push(`${where}: maxFixLines must be a whole number`);
  const promptFile = join(dir, 'prompt.txt');
  const prompt = existsSync(promptFile) ? readFileSync(promptFile, 'utf8').trim() : '';
  if (!prompt) problems.push(`${where}: prompt.txt is missing or empty`);
  if (prompt.startsWith('/')) problems.push(`${where}: prompt.txt starts with /, a slash command`);
  const hits = findMetaWords(prompt, { allow: ['test'] });
  if (hits.length) problems.push(`${where}: prompt.txt has ${hits.join(', ')}; only forms of "test" may be in it`);
  checkStart(join(dir, 'start'), where, problems);
  for (const e of walk(dir)) if (!e.dir && e.size > MAX_BYTES) problems.push(`${where}: ${e.rel} is ${e.size} bytes, over ${MAX_BYTES}`);
  if (problems.length > before) return null;
  const variants = [{ name: 'with', dir: cfg.skills.get(skill) }, { name: 'without', dir: null }];
  if (t.control) variants.push({ name: 'broken', dir: cfg.controls.broken }, { name: 'empty', dir: cfg.controls.empty });
  return {
    id, skill, difficulty: t.difficulty, slug: t.slug, summary: t.summary.trim(), allowTools: tools, allowWords: words,
    timeoutMin: t.timeoutMin, control: t.control, dir, promptFile, prompt, variants,
  };
}

/** Every task of every skill in pilot.json: { tasks, problems, warnings }. */
export function loadTasks(cfg) {
  const problems = [];
  const warnings = [];
  const tasks = [];
  for (const skill of cfg.skills.keys()) {
    const sdir = join(cfg.tasksDir, skill);
    if (!existsSync(sdir)) { problems.push(`${sdir} is missing`); continue; }
    if (!existsSync(join(sdir, 'grade.mjs'))) problems.push(`${skill}: grade.mjs is missing`);
    problems.push(...rubricCriteria(join(sdir, 'rubric.md')).problems);
    const dirs = readdirSync(sdir).filter((n) => statSync(join(sdir, n)).isDirectory()).sort();
    const mine = dirs.map((n) => loadTask(join(sdir, n), skill, cfg, problems)).filter(Boolean);
    tasks.push(...mine);
    const count = (d) => mine.filter((t) => t.difficulty === d).length;
    const want = { simple: 2, medium: 2, complex: 1 };
    for (const d of DIFFICULTIES) if (count(d) !== want[d]) warnings.push(`${skill} has ${count(d)} ${d} tasks; the pilot plans ${want[d]}`);
    if (skill === cfg.controls.skill) {
      const ctl = mine.filter((t) => t.control).map((t) => t.difficulty).sort().join(', ');
      if (ctl !== 'medium, simple') warnings.push(`${skill} runs the controls on ${ctl || 'no task'}; the pilot plans one simple and one medium task`);
    }
  }
  const seen = new Set();
  for (const t of tasks) {
    if (seen.has(t.id)) problems.push(`task id ${t.id} is used by more than one skill; ids name the lab folders, so they must differ`);
    seen.add(t.id);
  }
  return { tasks, problems, warnings };
}

/** Tasks in run order: the groups of pilot.json, and within a group the skills taken in turn. */
export function runOrder(tasks, cfg) {
  const group = (t) => (t.control ? 'control' : t.difficulty);
  const rank = (t) => DIFFICULTIES.length - DIFFICULTIES.indexOf(t.difficulty);
  const out = [];
  for (const g of cfg.order) {
    const bySkill = [...cfg.skills.keys()].map((s) => tasks.filter((t) => group(t) === g && t.skill === s)
      .sort((a, b) => rank(a) - rank(b) || (a.id < b.id ? -1 : 1)));
    for (let i = 0; bySkill.some((l) => i < l.length); i++) for (const l of bySkill) if (i < l.length) out.push(l[i]);
  }
  return out;
}

/** --price <difficulty>=<usd> values as { difficulty: micros }. Throws on a bad one. */
export function parsePrices(list = []) {
  const out = {};
  for (const p of list) {
    const m = /^([a-z]+)=(.+)$/.exec(p);
    if (!m || !DIFFICULTIES.includes(m[1])) throw new Error(`--price takes <difficulty>=<usd> with a difficulty from ${DIFFICULTIES.join(', ')}: ${p}`);
    out[m[1]] = usd(m[2], `--price ${m[1]}`);
  }
  return out;
}

/** The price of a difficulty: the highest of the pilot.json default, its --price and the highest real cost seen. */
export const priceOf = (d, cfg, cli = {}, seen = {}) => Math.max(cfg.prices[d], cli[d] || 0, seen[d] || 0);
