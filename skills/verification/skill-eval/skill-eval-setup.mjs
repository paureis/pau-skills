// skill-eval module: the setup and run commands.
import {
  mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, statSync, mkdtempSync, cpSync, rmSync,
  createWriteStream,
} from 'node:fs';
import { join, resolve, basename, sep } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import {
  escapeRe, findMetaWords, skillNameOf, childEnv, platformProblem, candidateArgv, claudeName, claudeCommand, checkLogin,
  extractActions, MAX_RUNS, rubricTemplate,
} from './skill-eval-core.mjs';
import { isInside, realOrPlanned, inheritedConfig, walk, readText, HOME_NAME, buildRun, readJson, money } from './skill-eval-files.mjs';
import { mulberry32, shuffle } from './skill-eval-blind.mjs';

// ---------------------------------------------------------------------------------------------------------------
// setup
// ---------------------------------------------------------------------------------------------------------------

function setup(o, out, err) {
  const refuse = (...lines) => { for (const l of lines) err(`refused: ${l}`); return 1; };
  const lab = resolve(o.target);
  const root = resolve(o.root);
  const task = resolve(o.task);
  const allow = o.allowWords;

  if (existsSync(lab) && !statSync(lab).isDirectory()) return refuse(`${lab} is not a folder`);
  if (existsSync(join(lab, 'plan.json'))) return refuse(`${lab} already holds a plan; use a new lab folder`);
  if (!existsSync(task) || !statSync(task).isDirectory()) return refuse(`the task ${task} is not a folder`);
  const [labReal, rootReal, taskReal] = [lab, root, task].map(realOrPlanned);
  if (isInside(labReal, rootReal) || isInside(rootReal, labReal)) {
    return refuse(`the lab folder ${lab} and the root ${root} must be apart: neither inside the other, so no run can reach the plan`);
  }
  if (isInside(rootReal, taskReal) || isInside(labReal, taskReal)) return refuse(`the root and the lab folder must be outside the task folder ${task}`);
  if (isInside(taskReal, rootReal)) return refuse(`the task ${task} is under the root; keep it outside, the root holds only the run folders`);
  const inherited = inheritedConfig(rootReal);
  if (inherited.length) {
    return refuse(`a run under ${root} would also load ${inherited.join(', ')}; pick a root with no Claude Code files in it or above it (outside your home folder and outside any project)`);
  }

  if (o.variants.length < 2) return refuse('give at least two variants (--variant <name>=<skill folder or none>, once per variant)');
  if (o.variants.length * o.n > MAX_RUNS) {
    return refuse(`${o.variants.length} variants x ${o.n} = ${o.variants.length * o.n} runs; at most ${MAX_RUNS} can be labelled A to Z`);
  }
  const names = o.variants.map((v) => v.name);
  if (new Set(names).size !== names.length) return refuse(`variant names repeat: ${names.join(', ')}`);
  const skillNames = new Set();
  for (const v of o.variants) {
    if (!v.dir) continue;
    v.dir = resolve(v.dir);
    if (isInside(realOrPlanned(v.dir), rootReal)) return refuse(`variant ${v.name} (${v.dir}) is under the root; keep it outside, the root holds only the run folders`);
    const md = join(v.dir, 'SKILL.md');
    if (!existsSync(md)) return refuse(`variant ${v.name}: ${md} does not exist`);
    const n = skillNameOf(readFileSync(md, 'utf8'));
    if (!n) return refuse(`variant ${v.name}: ${md} has no name in its frontmatter`);
    skillNames.add(n);
  }
  if (skillNames.size > 1) {
    return refuse(`every variant must be the same skill with the same name, so the same prompt reaches it; the variants are named ${[...skillNames].join(', ')}`);
  }
  const skill = skillNames.size ? [...skillNames][0] : null;
  const exempt = skill ? [skill] : [];

  // Prompts: one for every variant, a shared one or one each.
  const prompts = {};
  const shared = o.prompts.filter((p) => !p.variant);
  if (shared.length > 1) return refuse('give one shared --prompt, or one --prompt <variant>=<file> per variant');
  for (const p of o.prompts.filter((x) => x.variant)) {
    if (!names.includes(p.variant)) return refuse(`--prompt names ${p.variant}, which is not a variant`);
  }
  for (const v of o.variants) {
    const p = o.prompts.find((x) => x.variant === v.name) || shared[0];
    if (!p) return refuse(`variant ${v.name} has no prompt`);
    const f = resolve(p.file);
    if (!existsSync(f)) return refuse(`the prompt file ${f} does not exist`);
    if (isInside(realOrPlanned(f), rootReal)) return refuse(`the prompt file ${f} is under the root; a run could read it. Keep it in the lab folder`);
    prompts[v.name] = readFileSync(f, 'utf8').trim();
    if (!prompts[v.name]) return refuse(`the prompt for ${v.name} is empty`);
    const hits = findMetaWords(prompts[v.name], { allow, exempt });
    if (hits.length) return refuse(`the prompt for ${v.name} contains ${hits.map((h) => `"${h}"`).join(', ')}; write what a user would type, with no word that says the run is measured`);
    if (!v.dir && skill && new RegExp(`^/${escapeRe(skill)}(\\s|$)`).test(prompts[v.name])) {
      return refuse(`variant ${v.name} has no skill, but its prompt starts with /${skill}; give it its own prompt (--prompt ${v.name}=<file>)`);
    }
  }
  if (existsSync(root) && (!statSync(root).isDirectory() || readdirSync(root).length)) {
    return refuse(`the root ${root} must be new and empty (for example from mktemp -d): it may hold only the run folders`);
  }

  // The working directory path: refused on any hit, whatever --allow-word says.
  const slug = o.slug || basename(task);
  if (!/^[A-Za-z0-9._-]+$/.test(slug)) return refuse(`the folder name ${slug} may hold only letters, digits, dot, underscore and -`);
  const pathHits = findMetaWords(`${rootReal}${sep}${slug}`);
  if (pathHits.length) return refuse(`the working directory path ${join(rootReal, slug)} contains ${pathHits.map((h) => `"${h}"`).join(', ')}; every run sees it. Pick a root and a folder name a user might pick`);

  // A long path, or a part that starts with -, gets mistyped: a dry run read `-home-x/` as `-home-x-` and was refused.
  const pathWarnings = [];
  const sample = join(rootReal, 'tmp.XXXXXX', slug);
  if (sample.length > 100 || rootReal.split(sep).some((part) => part.startsWith('-'))) {
    pathWarnings.push(`the working folder path (${sample}) is long or has a part that starts with -; a run may mistype it and be refused. A short root such as one from mktemp -d is safer`);
  }

  // Names inside the task and the variants: refused. Links: refused. Contents: a warning.
  const nameHits = [];
  const others = [];
  const warnings = [];
  const scan = (dir, shown) => {
    for (const e of walk(dir)) {
      if (e.other) { others.push(`${shown}/${e.rel} is ${e.other}`); continue; }
      const hits = findMetaWords(e.rel.split('/').pop(), { allow, exempt });
      if (hits.length) nameHits.push(`${shown}/${e.rel} (${hits.join(', ')})`);
      if (e.dir) continue;
      const text = readText(e.abs);
      if (text === null) continue;
      text.split(/\r?\n/).forEach((line, i) => {
        const h = findMetaWords(line, { allow, exempt });
        if (h.length) warnings.push(`${shown}/${e.rel}:${i + 1}: ${h.map((x) => `"${x}"`).join(', ')}`);
      });
    }
  };
  scan(task, 'task');
  if (skill && existsSync(join(task, '.claude', 'skills', skill))) {
    return refuse(`the task already has .claude/skills/${skill}; remove it, each run gets its own variant there`);
  }
  for (const v of o.variants) if (v.dir) scan(v.dir, `variant ${v.name}`);
  if (others.length) {
    return refuse('a copy of a link would point back at the original, shared by every run; replace these with the files themselves:', ...others.slice(0, 20));
  }
  if (nameHits.length) {
    return refuse(`these names contain a word a run must not see; rename them, or pass --allow-word when the word belongs to the task itself:`, ...nameHits.slice(0, 20));
  }
  if (spawnSync('git', ['--version']).status !== 0) return refuse('git is needed to record what each run changed');

  // Write, and on any failure remove what was made.
  const labExisted = existsSync(lab);
  const rootExisted = existsSync(root);
  const made = [];
  const rng = mulberry32(o.seed ?? randomInt(2 ** 31));
  try {
    mkdirSync(join(lab, 'runs'), { recursive: true });
    const noGit = (src) => basename(src) !== '.git';
    cpSync(task, join(lab, 'source', 'task'), { recursive: true, filter: noGit });
    for (const v of o.variants) if (v.dir) cpSync(v.dir, join(lab, 'source', 'variants', v.name), { recursive: true, filter: noGit });
    mkdirSync(root, { recursive: true });
    const plan = { skill, slug, root, n: o.n, allowWords: allow, gradeReply: !!o.gradeReply, variants: o.variants, prompts, runs: [] };
    const ids = new Set();
    const newId = () => {
      for (;;) {
        const id = Math.floor(rng() * 0x10000).toString(16).padStart(4, '0');
        if (!ids.has(id)) { ids.add(id); return id; }
      }
    };
    const slots = shuffle(o.variants.flatMap((v) => Array.from({ length: o.n }, () => v.name)), rng);
    for (const variant of slots) {
      let parent;
      for (let tries = 0; ; tries++) {
        parent = mkdtempSync(join(root, 'tmp.'));
        made.push(parent);
        if (!findMetaWords(basename(parent)).length) break;
        if (tries > 20) throw new Error('could not make a neutral folder name');
      }
      const run = { id: newId(), variant, dir: join(parent, slug), home: join(parent, HOME_NAME(slug)) };
      buildRun(run, plan, lab);
      plan.runs.push(run);
    }
    writeFileSync(join(lab, 'plan.json'), JSON.stringify(plan, null, 2) + '\n');
    writeFileSync(join(lab, 'rubric.md'), rubricTemplate());
  } catch (e) {
    for (const d of made) rmSync(d, { recursive: true, force: true });
    if (!rootExisted) rmSync(root, { recursive: true, force: true });
    if (!labExisted) rmSync(lab, { recursive: true, force: true });
    else for (const f of ['runs', 'source', 'plan.json', 'rubric.md']) rmSync(join(lab, f), { recursive: true, force: true });
    throw e;
  }

  for (const w of pathWarnings) err(`warning: ${w}`);
  for (const w of warnings.slice(0, 20)) err(`warning: ${w}`);
  if (warnings.length > 20) err(`warning: and ${warnings.length - 20} more lines with such words`);
  if (warnings.length) err('warning: a run reads these files; keep such words only where the task or the skill needs them');
  const total = o.variants.length * o.n;
  out(`Lab folder: ${lab} (only you read it: the plan, the sources, the rubric, the transcripts and the key go here)`);
  out(`Skill: ${skill || '(none: the variants differ by prompt only)'}`);
  out(`Runs: ${total} runs (${o.variants.length} variants x ${o.n}) + 1 judge = ${total + 1} claude -p runs`);
  out(`Next: write ${join(lab, 'rubric.md')}, then: node skill-eval.mjs run ${lab} --model <model>`);
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------
// run
// ---------------------------------------------------------------------------------------------------------------

function runOne(run, argv, { lab, timeoutMin, env }) {
  return new Promise((done) => {
    const { file, args } = claudeCommand(argv);
    const started = Date.now();
    const stdout = createWriteStream(join(lab, 'runs', `${run.id}.jsonl`));
    const stderr = createWriteStream(join(lab, 'runs', `${run.id}.err`));
    let child;
    try {
      child = spawn(file, args, { cwd: run.dir, env, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e) {
      done({ exit: null, error: e.message, seconds: 0 });
      return;
    }
    child.stdout.pipe(stdout);
    child.stderr.pipe(stderr);
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMin * 60_000);
    let settled = false;
    const finish = (r) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      let pending = 2;
      const end = () => { if (--pending === 0) done({ ...r, seconds: Math.round((Date.now() - started) / 1000) }); };
      stdout.end(end);
      stderr.end(end);
    };
    child.on('error', (e) => finish({ exit: null, error: e.message }));
    child.on('close', (code, signal) => finish({ exit: code, signal }));
  });
}

async function run(o, out, err) {
  const lab = resolve(o.target);
  const planFile = join(lab, 'plan.json');
  if (!existsSync(planFile)) { err(`refused: ${planFile} does not exist (run setup first)`); return 1; }
  const plan = readJson(planFile);
  const platform = platformProblem(process.platform, claudeName());
  if (platform) { err(`refused: ${platform}`); return 1; }
  if (existsSync(join(lab, 'key.json'))) {
    err('refused: a blind copy of these runs exists (key.json); runs made now would not match it. Start a new lab folder with setup');
    return 1;
  }
  const done = plan.runs.filter((r) => existsSync(join(lab, 'runs', `${r.id}.jsonl`)));
  if (done.length && !o.force) {
    err(`refused: transcripts already exist for ${done.map((r) => r.id).join(', ')}; pass --force to rebuild every run folder and run again`);
    return 1;
  }
  if (done.length) {
    // A rerun starts from the lab's copies, not from what the last run left behind.
    for (const r of plan.runs) buildRun(r, plan, lab);
    writeFileSync(planFile, JSON.stringify(plan, null, 2) + '\n');
  }
  const login = checkLogin(o);
  if (login) { err(`refused: ${login}`); return 1; }
  mkdirSync(join(lab, 'runs'), { recursive: true });
  writeFileSync(join(lab, 'run.json'), JSON.stringify({ model: o.model, effort: o.effort, allowTools: o.allowTools, passEnv: o.passEnv, realHome: o.realHome, maxBudgetUsd: o.maxBudgetUsd, at: new Date().toISOString() }, null, 2) + '\n');
  const queue = [...plan.runs];
  const results = new Map();
  const width = o.parallel || queue.length;
  const worker = async () => {
    while (queue.length) {
      const r = queue.shift();
      const argv = candidateArgv({ prompt: plan.prompts[r.variant], model: o.model, skill: plan.variants.find((v) => v.name === r.variant).dir ? plan.skill : null, allowTools: o.allowTools, effort: o.effort, maxBudgetUsd: o.maxBudgetUsd });
      const env = childEnv(process.env, o.realHome ? process.env.HOME : r.home, o.passEnv);
      const res = await runOne(r, argv, { lab, timeoutMin: o.timeoutMin, env });
      writeFileSync(join(lab, 'runs', `${r.id}.json`), JSON.stringify(res, null, 2) + '\n');
      results.set(r.id, res);
    }
  };
  await Promise.all(Array.from({ length: Math.min(width, queue.length) }, worker));

  let total = 0;
  let bad = 0;
  for (const r of plan.runs) {
    const res = results.get(r.id);
    const x = extractActions(readFileSync(join(lab, 'runs', `${r.id}.jsonl`), 'utf8'));
    total += x.costUsd || 0;
    const hasSkill = !!plan.variants.find((v) => v.name === r.variant).dir;
    const notes = [];
    if (!x.finished) notes.push('no result line: the run did not finish');
    if (res.error) notes.push(res.error);
    if (plan.skill && x.skills.length && x.skills.includes(plan.skill) !== hasSkill) {
      // Worded the same either way, so the line does not say which variant the run had.
      notes.push(`isolation broken: the skills offered do not match this run's variant (unblind shows which)`);
    }
    if (x.denials.length) notes.push(`refused by permissions: ${x.denials.join('; ')}`);
    if (res.exit !== 0 || !x.finished) bad++;
    out(`${r.id}: exit ${res.exit ?? res.signal ?? 'none'}, ${money(x.costUsd)}${notes.length ? `; ${notes.join('; ')}` : ''}`);
  }
  out(`Candidate runs: ${plan.runs.length}, total ${money(total)}`);
  if (bad) err(`${bad} run(s) failed or did not finish; read ${join(lab, 'runs')}/<id>.err`);
  return bad ? 1 : 0;
}

export { setup, run };
