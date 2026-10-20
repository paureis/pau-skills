// skill-eval module: the blind, judge and unblind commands, and the seeded shuffle that setup also uses.
import { mkdirSync, readFileSync, writeFileSync, existsSync, realpathSync, mkdtempSync, rmSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { randomInt } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import {
  childEnv, platformProblem, judgeArgv, claudeName, claudeCommand, checkLogin, extractActions, replaceAll, finalSection,
  renderActions, validateRubric, withoutComments, parseScores, disagreements, variantMeans,
} from './skill-eval-core.mjs';
import { isInside, realOrPlanned, isEmptyOrMissing, gitEnv, git, ignoredManifest, readJson, mtime, money } from './skill-eval-files.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------------------------------------------
// blind
// ---------------------------------------------------------------------------------------------------------------

function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffle(items, rng) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const DIFF_LIMIT = 100_000;

/** The ignored files a run created, changed or deleted, as lines. */
function ignoredChanges(run, skill) {
  const before = run.ignored || {};
  const now = ignoredManifest(run.dir, skill);
  const lines = [];
  for (const [f, h] of Object.entries(now)) {
    if (!(f in before)) lines.push(`new: ${f}`);
    else if (before[f] !== h) lines.push(`changed: ${f}`);
  }
  for (const f of Object.keys(before)) if (!(f in now)) lines.push(`deleted: ${f}`);
  return lines.sort((a, b) => (a.split(': ')[1] < b.split(': ')[1] ? -1 : 1));
}

/** Everything a run changed since its first commit, the installed skill left out, and the commits it made. */
function changesOf(run, skill) {
  const tmp = mkdtempSync(join(tmpdir(), 'idx-'));
  try {
    const env = gitEnv({ GIT_INDEX_FILE: join(tmp, 'index') });
    const spec = ['--', '.', ...(skill ? [`:(exclude).claude/skills/${skill}`] : [])];
    for (const args of [['read-tree', 'HEAD'], ['add', '-A', ...spec]]) {
      const r = git(run.dir, args, env);
      if (r.status !== 0) throw new Error(`git ${args.join(' ')} failed in a run folder: ${r.stderr}`);
    }
    let diff = git(run.dir, ['diff', '--cached', '--no-color', '--no-ext-diff', run.base, ...spec], env).stdout;
    if (diff.length > DIFF_LIMIT) diff = `${diff.slice(0, DIFF_LIMIT)}\n[diff cut at ${DIFF_LIMIT} characters]\n`;
    const commits = git(run.dir, ['log', '--format=%s', `${run.base}..HEAD`]).stdout.trim();
    return { diff, commits };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

/** A fenced code block whose fence is longer than any run of backticks inside the text. */
function fenced(text, info = '') {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  const fence = '`'.repeat(Math.max(3, longest + 1));
  return [`${fence}${info}`, text, fence].join('\n');
}

function judgeBrief() {
  const text = readFileSync(join(HERE, 'JUDGE-BRIEF.md'), 'utf8');
  const at = text.search(/^---\s*$/m);
  return (at >= 0 ? text.slice(at).replace(/^---\s*\r?\n/, '') : text).trim();
}

function blind(o, out, err) {
  const refuse = (...lines) => { for (const l of lines) err(`refused: ${l}`); return 1; };
  const lab = resolve(o.target);
  if (!existsSync(join(lab, 'plan.json'))) return refuse(`${lab} has no plan.json (run setup first)`);
  const plan = readJson(join(lab, 'plan.json'));
  const keyFile = join(lab, 'key.json');
  if (existsSync(keyFile) && !o.force) return refuse(`${keyFile} exists: a blind copy was already made. Pass --force to make a new one and replace the key`);
  const scored = ['my-read.md', 'verdict.md'].filter((f) => existsSync(join(lab, f)));
  if (existsSync(keyFile) && scored.length) {
    return refuse(`${scored.join(' and ')} score the current letters; new letters would pair them with the wrong runs. Move them out of ${lab} first`);
  }
  const rubric = existsSync(join(lab, 'rubric.md')) ? readFileSync(join(lab, 'rubric.md'), 'utf8') : '';
  const problems = validateRubric(rubric);
  if (problems.length) return refuse(...problems);

  const forbidden = [realOrPlanned(lab), realOrPlanned(plan.root)];
  let blindDir;
  if (o.out) {
    blindDir = resolve(o.out);
    if (forbidden.some((f) => isInside(realOrPlanned(blindDir), f))) return refuse(`${blindDir} is inside the lab folder or the root`);
    if (!isEmptyOrMissing(blindDir)) return refuse(`${blindDir} exists and is not empty`);
  } else if (forbidden.some((f) => isInside(realpathSync(tmpdir()), f))) {
    return refuse('the temporary folder is inside the lab folder or the root; pass --out <folder outside both>');
  }

  const outputs = [];
  const dropouts = [];
  for (const r of plan.runs) {
    const t = join(lab, 'runs', `${r.id}.jsonl`);
    const x = existsSync(t) ? extractActions(readFileSync(t, 'utf8')) : null;
    if (!x || (!x.finished && !x.steps.length)) { dropouts.push(r.id); continue; }
    outputs.push({ run: r, x });
  }
  if (outputs.length < 2) return refuse(`fewer than 2 runs have output (dropouts: ${dropouts.join(', ') || 'none'}); run them first`);

  const rng = mulberry32(o.seed ?? randomInt(2 ** 31));
  const labelled = shuffle(outputs, rng).map((item, i) => ({ ...item, label: String.fromCharCode(65 + i) }));
  const files = {};
  for (const { run: r, x, label } of labelled) {
    const { diff, commits } = changesOf(r, plan.skill);
    const ignored = ignoredChanges(r, plan.skill);
    const pairs = [];
    for (const [p, to] of [[r.dir, '<project>'], [r.home, '<home>'], [dirname(r.dir), '<tmp>'], [plan.root, '<tmp>']]) {
      pairs.push([p, to]);
      try { pairs.push([realpathSync(p), to]); } catch { /* gone */ }
    }
    const body = [
      `# Output ${label}`, '',
      renderActions(x, { final: false }),
      '## What it changed', '',
      diff.trim() ? fenced(diff.trimEnd(), 'diff') : 'No file changed.', '',
      ...(ignored.length ? ['## Ignored files it changed (.gitignore covers them; names only)', '', ...ignored.slice(0, 50).map((l) => `- ${l}`), ...(ignored.length > 50 ? [`- and ${ignored.length - 50} more`] : []), ''] : []),
      ...(commits ? ['## Commits it made', '', commits, ''] : []),
      finalSection(x, { work: plan.gradeReply }),
    ].join('\n');
    files[label] = replaceAll(body, pairs);
  }

  if (o.out) mkdirSync(blindDir, { recursive: true });
  else blindDir = mkdtempSync(join(tmpdir(), 'blind-'));
  const shown = withoutComments(rubric);
  const rubricBody = shown.replace(/^\s*#\s*Rubric\s*\r?\n/, '').trim();
  for (const [label, text] of Object.entries(files)) writeFileSync(join(blindDir, `${label}.md`), text);
  writeFileSync(join(blindDir, 'rubric.md'), shown);
  const replyNote = plan.gradeReply
    ? ['', 'For this task the final message is the work product: grade it as the run\'s output, and check what it says about its own steps against "What it did".']
    : [];
  const bundle = [judgeBrief(), ...replyNote, '', '# Rubric', '', rubricBody, '', ...Object.values(files)].join('\n');
  writeFileSync(join(blindDir, 'bundle.md'), bundle);
  const key = { labels: Object.fromEntries(labelled.map((l) => [l.label, l.run.id])), dropouts, blindDir };
  writeFileSync(keyFile, JSON.stringify(key, null, 2) + '\n');

  out(`Blind folder: ${blindDir}`);
  out(`Outputs: ${labelled.map((l) => l.label).join(', ')}`);
  out(`Dropouts: ${dropouts.length}`);
  out(`Next: read every output there, write your scores to ${join(lab, 'my-read.md')}, then run judge. Do not open key.json yet.`);
  return 0;
}

// ---------------------------------------------------------------------------------------------------------------
// judge and unblind
// ---------------------------------------------------------------------------------------------------------------

const SCORE_FORMAT = 'one "Criterion <n>: <text>" line per criterion, then one "  <letter>: <1-5>/5  <evidence>" line per output, and nothing else in the block';

function judge(o, out, err) {
  const refuse = (...lines) => { for (const l of lines) err(`refused: ${l}`); return 1; };
  const lab = resolve(o.target);
  const keyFile = join(lab, 'key.json');
  if (!existsSync(keyFile)) return refuse('no blind copy yet; run blind first');
  const key = readJson(keyFile);
  const bundleFile = join(key.blindDir, 'bundle.md');
  if (!existsSync(bundleFile)) return refuse(`${bundleFile} is missing; run blind --force again`);
  const mine = join(lab, 'my-read.md');
  if (!existsSync(mine)) return refuse(`write your own scores to ${mine} first (${SCORE_FORMAT}): a verdict read first anchors them`);
  if (mtime(mine) < mtime(keyFile)) return refuse(`${mine} is older than key.json: it scores letters from an earlier blind copy. Score the current letters`);
  const myScores = parseScores(readFileSync(mine, 'utf8'));
  if (!myScores.criteria.some((c) => Object.keys(c.scores).length)) return refuse(`${mine} has no scores in the format: ${SCORE_FORMAT}`);
  if (myScores.problems.length) return refuse(`${mine} has lines that look like scores but are not read; fix them (${SCORE_FORMAT}):`, ...myScores.problems);
  if (existsSync(join(lab, 'verdict.md')) && !o.force) return refuse('verdict.md exists; pass --force to ask again and replace it');
  const plan = readJson(join(lab, 'plan.json'));
  const platform = platformProblem(process.platform, claudeName());
  if (platform) return refuse(platform);
  const login = checkLogin(o);
  if (login) return refuse(login);

  const cwd = mkdtempSync(join(tmpdir(), 'r-'));
  const home = o.realHome ? null : mkdtempSync(join(tmpdir(), 'h-'));
  try {
    for (const d of [cwd, home].filter(Boolean)) {
      if ([lab, plan.root, key.blindDir].some((f) => isInside(realpathSync(d), realOrPlanned(f)))) return refuse('the temporary folder is inside the lab, the root or the blind folder');
    }
    const { file, args } = claudeCommand(judgeArgv({ model: o.model, effort: o.effort }));
    const env = childEnv(process.env, home || process.env.HOME, o.passEnv);
    const r = spawnSync(file, args, { cwd, env, input: readFileSync(bundleFile, 'utf8'), encoding: 'utf8', timeout: 30 * 60_000, maxBuffer: 64 << 20 });
    if (r.status !== 0) { err(`failed: the reviewer exited ${r.status}: ${(r.stderr || r.stdout || '').slice(0, 2000)}`); return 1; }
    let res;
    try { res = JSON.parse(r.stdout); } catch { err('failed: the reviewer did not print one JSON result'); return 1; }
    writeFileSync(join(lab, 'verdict.md'), String(res.result ?? '') + '\n');
    writeFileSync(join(lab, 'judge.json'), JSON.stringify({ model: o.model, effort: o.effort, realHome: o.realHome, costUsd: res.total_cost_usd ?? null, isError: !!res.is_error }, null, 2) + '\n');
    const read = parseScores(res.result);
    const n = read.criteria.filter((c) => Object.keys(c.scores).length).length;
    out(`Verdict: ${join(lab, 'verdict.md')} (${n ? `${n} criteria read` : `no scores in the format; read it by hand`}), cost ${money(res.total_cost_usd)}`);
    for (const pr of read.problems) out(`warning: verdict ${pr}`);
    out(`Next: node skill-eval.mjs unblind ${lab}`);
    return 0;
  } finally {
    rmSync(cwd, { recursive: true, force: true });
    if (home) rmSync(home, { recursive: true, force: true });
  }
}

function unblind(o, out, err) {
  const lab = resolve(o.target);
  for (const f of ['plan.json', 'key.json', 'my-read.md', 'verdict.md']) {
    if (!existsSync(join(lab, f))) { err(`refused: ${join(lab, f)} is missing (order: blind, my-read.md, judge, unblind)`); return 1; }
  }
  for (const f of ['my-read.md', 'verdict.md']) {
    if (mtime(join(lab, f)) < mtime(join(lab, 'key.json'))) {
      err(`refused: ${join(lab, f)} is older than key.json: it scores the letters of an earlier blind copy`);
      return 1;
    }
  }
  const plan = readJson(join(lab, 'plan.json'));
  const key = readJson(join(lab, 'key.json'));
  const variantOf = (id) => plan.runs.find((r) => r.id === id).variant;
  const labelToVariant = Object.fromEntries(Object.entries(key.labels).map(([l, id]) => [l, variantOf(id)]));
  out('Letter  Run  Variant');
  for (const [l, id] of Object.entries(key.labels)) out(`${l}       ${id}   ${labelToVariant[l]}`);
  if (key.dropouts.length) out(`Dropouts: ${key.dropouts.map((id) => `${id} (${variantOf(id)})`).join(', ')}`);

  const judgedRead = parseScores(readFileSync(join(lab, 'verdict.md'), 'utf8'));
  const judged = judgedRead.criteria;
  const mine = parseScores(readFileSync(join(lab, 'my-read.md'), 'utf8')).criteria;
  for (const pr of judgedRead.problems) out(`warning: verdict ${pr}`);
  const show = (who, scores) => {
    if (!scores.some((c) => Object.keys(c.scores).length)) { out(`${who}: no scores in the format; compare by hand`); return; }
    out(`${who}, mean per criterion by variant:`);
    for (const [v, row] of Object.entries(variantMeans(scores, labelToVariant))) {
      out(`  ${v}: ${Object.entries(row).filter(([k]) => k !== 'total').map(([k, val]) => `${k}: ${val}`).join(', ')}, total ${row.total}`);
    }
  };
  show('Judge', judged);
  show('You', mine);
  const d = disagreements(judged, mine);
  out(`Disagreements (2 or more apart; each one is a finding to explain):${d.length ? '' : ' none'}`);
  for (const x of d) out(`  criterion ${x.n}, ${x.label}: judge ${x.judge}, you ${x.mine} (${labelToVariant[x.label]})`);

  let runsCost = 0;
  for (const r of plan.runs) {
    const t = join(lab, 'runs', `${r.id}.jsonl`);
    if (existsSync(t)) runsCost += extractActions(readFileSync(t, 'utf8')).costUsd || 0;
  }
  const j = existsSync(join(lab, 'judge.json')) ? readJson(join(lab, 'judge.json')) : {};
  const runInfo = existsSync(join(lab, 'run.json')) ? readJson(join(lab, 'run.json')) : {};
  out(`Cost: ${plan.runs.length} runs ${money(runsCost)} + judge ${money(j.costUsd)} = ${money(runsCost + (j.costUsd || 0))}`);
  out(`Models: runs ${runInfo.model || 'unknown'}, judge ${j.model || 'unknown'}`);
  return 0;
}

export { mulberry32, shuffle, blind, judge, unblind };
