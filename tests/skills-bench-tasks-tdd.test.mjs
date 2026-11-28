// Self-check for the skills-bench tdd tasks (apps/skills-bench/tasks/tdd/). For every task: task.json meets the task
// contract, the size fits the difficulty, the prompt and the start's names carry no word that tells a run it is
// measured, the start is a plain green Node project without the behaviour, and the code grader (grade.mjs) fails the
// start, passes start + reference, sees the reference tests catch every bad version, and marks the weak tests down.
// Once: the rubric is usable, and the broken and empty variants keep the tdd skill's frontmatter and file list.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile, execFileSync, spawnSync } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync, readdirSync, lstatSync, readlinkSync, mkdirSync, copyFileSync, existsSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { ROOT, repo, tempDir } from './helpers.mjs';
import { findMetaWords, skillNameOf, validateRubric, withoutComments } from '../skills/verification/skill-eval/skill-eval-core.mjs';

const run = promisify(execFile);
const BASE = 'b524f2a6aa34a60343970af97513e065c12ebc62';
const TASKS = repo('apps', 'skills-bench', 'tasks', 'tdd');
const GRADER = join(TASKS, 'grade.mjs');
const VARIANTS = repo('apps', 'skills-bench', 'variants');
const SKILL = 'skills/verification/tdd';
const OPTIONS = { timeout: 180_000 };
const SIZE = {
  simple: { modules: [1, 1], lines: [30, 80], timeoutMin: 15 },
  medium: { modules: [2, 3], lines: [100, 250], timeoutMin: 15 },
  complex: { modules: [5, 50], lines: [400, 800], timeoutMin: 30 },
};
const PER_DIFFICULTY = { simple: 2, medium: 2, complex: 1 };
const PHRASES = ['build it test first', 'make sure this is tested'];
const CHECKS = [
  ['acceptance-tests-pass', 'outcome', true],
  ['start-tests-still-pass', 'outcome', true],
  ['new-tests-pass-on-reference', 'outcome', false],
  ['new-tests-catch-bad-versions', 'outcome', false],
  ['run-tests-pass-on-run-code', 'process', false],
];

/** Every entry under dir, dot folders included, as { rel, dir, link } with forward-slash paths. */
function walk(dir, base = dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : 1))) {
    const full = join(dir, e.name);
    const rel = full.slice(base.length + 1).split('\\').join('/');
    const st = lstatSync(full);
    out.push({ rel, dir: st.isDirectory(), link: st.isSymbolicLink() });
    if (st.isDirectory()) out.push(...walk(full, base));
  }
  return out;
}
const filesOf = (dir) => walk(dir).filter((e) => !e.dir && !e.link).map((e) => e.rel);
const read = (...p) => readFileSync(join(...p), 'utf8');
const isTest = (rel) => /\.test\.[cm]?js$/.test(rel) || rel.startsWith('test/');

/** A fresh folder with each overlay folder laid over the last, at the same relative paths. */
function layered(...dirs) {
  const out = tempDir('skills-bench-tdd-');
  for (const d of dirs) {
    for (const f of filesOf(d)) {
      mkdirSync(dirname(join(out, f)), { recursive: true });
      copyFileSync(join(d, f), join(out, f));
    }
  }
  return out;
}

/** A hash of every path, file and link target under dir. */
function treeHash(dir) {
  const h = createHash('sha256');
  for (const e of walk(dir)) {
    h.update(`${e.rel}\0${e.dir ? 'd' : e.link ? `l${readlinkSync(join(dir, e.rel))}` : 'f'}\0`);
    if (!e.dir && !e.link) h.update(readFileSync(join(dir, e.rel)));
  }
  return h.digest('hex');
}

function cleanEnv() {
  const env = { ...process.env, TZ: 'UTC', LC_ALL: 'C' };
  delete env.NODE_TEST_CONTEXT;
  return env;
}

/** node --test in cwd on the given files (none: the default patterns, as npm test runs it); { ok, pass, fail }. */
function nodeTest(cwd, files = []) {
  const r = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], { cwd, env: cleanEnv(), encoding: 'utf8', timeout: 60_000 });
  const count = (w) => { const m = [...r.stdout.matchAll(new RegExp(`^# ${w} (\\d+)$`, 'gm'))].at(-1); return m ? Number(m[1]) : null; };
  const pass = count('pass');
  const fail = count('fail');
  return { ok: r.status === 0 && pass > 0 && fail === 0, pass, fail, out: r.stdout.slice(-2000) };
}

/** Grade a run folder against a task; checks the output is one JSON line and both folders are left as they were. */
async function grade(task, runDir) {
  const before = [treeHash(task), treeHash(runDir)];
  const r = await run(process.execPath, [GRADER, '--task', task, '--run', runDir], { encoding: 'utf8', timeout: 300_000, maxBuffer: 1 << 24 });
  assert.deepEqual([treeHash(task), treeHash(runDir)], before, 'the grader changed the task or the run folder');
  assert.ok(r.stdout.endsWith('\n') && !r.stdout.slice(0, -1).includes('\n'), `not one line: ${r.stdout}`);
  const g = JSON.parse(r.stdout);
  assert.deepEqual(Object.keys(g), ['pass', 'score', 'checks']);
  assert.deepEqual(g.checks.map((c) => [c.name, c.kind, c.required]), CHECKS);
  for (const c of g.checks) assert.ok(typeof c.pass === 'boolean' && typeof c.detail === 'string' && c.detail, JSON.stringify(c));
  assert.equal(g.pass, g.checks.filter((c) => c.required).every((c) => c.pass));
  assert.equal(g.score, g.checks.filter((c) => c.pass).length / g.checks.length);
  return g;
}

const taskIds = existsSync(TASKS) ? readdirSync(TASKS, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort() : [];
const meta = (id) => JSON.parse(read(TASKS, id, 'task.json'));
const badNames = (id) => readdirSync(join(TASKS, id, 'bad'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => e.name).sort();

test('the tasks: 2 simple, 2 medium, 1 complex; one simple and one medium are controls, each with the most bad versions', () => {
  const tasks = taskIds.map(meta);
  for (const [d, n] of Object.entries(PER_DIFFICULTY)) {
    const same = tasks.filter((t) => t.difficulty === d);
    assert.equal(same.length, n, `${d} tasks`);
    const controls = same.filter((t) => t.control === true);
    assert.equal(controls.length, d === 'complex' ? 0 : 1, `${d} controls`);
    for (const c of controls) {
      for (const t of same) assert.ok(badNames(c.id).length >= badNames(t.id).length, `${c.id} has fewer bad versions than ${t.id}`);
    }
  }
});

for (const id of taskIds) {
  const dir = join(TASKS, id);
  const start = join(dir, 'start');
  const reference = join(dir, 'reference');

  test(`${id}: task.json meets the contract and the size fits the difficulty`, () => {
    const t = meta(id);
    assert.equal(t.id, id);
    assert.match(id, /^[a-z0-9-]+$/);
    assert.equal(t.skill, 'tdd');
    assert.ok(Object.hasOwn(SIZE, t.difficulty), t.difficulty);
    assert.match(t.slug, /^[A-Za-z0-9-]+$/);
    assert.deepEqual(findMetaWords(t.slug), [], 'the slug, with no allow list');
    assert.ok(typeof t.summary === 'string' && t.summary.trim() && !t.summary.includes('\n'), 'summary');
    assert.deepEqual(t.allowTools, ['Bash(npm test)', 'Bash(node *)', 'Bash(git *)']);
    assert.deepEqual(t.allowWords, ['test']);
    assert.equal(t.timeoutMin, SIZE[t.difficulty].timeoutMin);
    assert.equal(typeof t.control, 'boolean');
    assert.ok(Array.isArray(t.interface) && t.interface.length > 0, 'interface');
    // The reference project is start + reference/: an interface module the behaviour reaches without changing it
    // (booking-cancel's availability.js) is only in start/.
    const done = layered(start, reference);
    for (const p of t.interface) assert.ok(existsSync(join(done, p)), `interface path ${p} is not in the reference project`);
    assert.ok(t.interface.some((p) => existsSync(join(reference, p))), 'no interface module is in reference/');
    const n = badNames(id).length;
    assert.ok(n >= 4 && n <= 6, `${n} bad versions`);
    for (const f of filesOf(dir)) assert.ok(lstatSync(join(dir, f)).size < 20_000, `${f} is 20,000 bytes or more`);

    const sources = filesOf(done).filter((f) => /\.[cm]?js$/.test(f) && !isTest(f));
    const lines = sources.reduce((sum, f) => sum + read(done, f).split('\n').filter((l) => l.trim()).length, 0);
    const size = SIZE[t.difficulty];
    assert.ok(sources.length >= size.modules[0] && sources.length <= size.modules[1], `${sources.length} modules for ${t.difficulty}`);
    assert.ok(lines >= size.lines[0] && lines <= size.lines[1], `${lines} source lines for ${t.difficulty}`);
  });

  test(`${id}: the prompt and the start carry no word that tells a run it is measured`, () => {
    const t = meta(id);
    const prompt = read(dir, 'prompt.txt');
    assert.deepEqual(findMetaWords(prompt, { allow: ['test'], exempt: ['tdd'] }), [], 'prompt');
    assert.ok(!prompt.trimStart().startsWith('/'), 'the prompt is a slash command');
    assert.ok(PHRASES.some((p) => prompt.toLowerCase().includes(p)), 'the prompt uses a phrase from the skill description');
    for (const p of t.interface) assert.ok(prompt.includes(p), `the prompt does not name ${p}`);
    const entries = walk(start);
    for (const e of entries) assert.deepEqual(findMetaWords(e.rel, { allow: ['test'], exempt: ['tdd'] }), [], e.rel);
    assert.deepEqual(entries.filter((e) => e.link).map((e) => e.rel), [], 'links in start/');
    const banned = entries.filter((e) => ['.git', '.claude', 'CLAUDE.md', 'AGENTS.md'].includes(e.rel.split('/').at(-1)));
    assert.deepEqual(banned.map((e) => e.rel), []);
    for (const f of filesOf(dir).filter((f) => f !== 'prompt.txt')) {
      const text = read(dir, f);
      assert.deepEqual(findMetaWords(text, { allow: ['test'], exempt: ['tdd'] }), [], `words in ${f}`);
      assert.deepEqual(text.match(/@(?!example\.com\b)[A-Za-z0-9-]+\.[A-Za-z.]+/g) ?? [], [], `emails in ${f}`);
    }
    const pkg = JSON.parse(read(start, 'package.json'));
    assert.equal(pkg.scripts?.test, 'node --test');
    assert.equal(pkg.dependencies, undefined);
    assert.equal(pkg.devDependencies, undefined);
  });

  test(`${id}: the start's tests pass and the reference tests fail on every bad version`, () => {
    const s = nodeTest(layered(start));
    assert.ok(s.ok, `start tests: ${s.out}`);
    const refTests = filesOf(reference).filter(isTest);
    assert.ok(refTests.length > 0, 'reference tests');
    const good = nodeTest(layered(start, reference), refTests);
    assert.ok(good.ok, `reference tests on the reference: ${good.out}`);
    for (const b of badNames(id)) {
      const r = nodeTest(layered(start, reference, join(dir, 'bad', b)), refTests);
      assert.ok(!r.ok && r.fail > 0, `the reference tests pass on bad/${b}`);
    }
  });

  test(`${id}: the grader fails the start, passes the reference and marks the weak tests down`, OPTIONS, async () => {
    const [onStart, onReference, onWeak] = await Promise.all([
      grade(dir, layered(start)),
      grade(dir, layered(start, reference)),
      grade(dir, layered(start, reference, join(dir, 'weak'))),
    ]);
    assert.equal(onStart.pass, false);
    assert.equal(onStart.checks[0].pass, false, 'the acceptance tests pass on the start');
    assert.equal(onStart.checks[2].detail, 'the run added or changed no test files');
    assert.match(onStart.checks[3].detail, new RegExp(`^0 of ${badNames(id).length} bad versions caught, .*; the new tests do not pass on the reference$`));
    assert.equal(onReference.pass, true, JSON.stringify(onReference));
    assert.deepEqual(onReference.checks.filter((c) => c.kind === 'outcome').map((c) => c.pass), [true, true, true, true], JSON.stringify(onReference));
    assert.equal(onReference.score, 1);
    assert.equal(onWeak.pass, true, JSON.stringify(onWeak));
    assert.equal(onWeak.checks[3].pass, false, JSON.stringify(onWeak.checks[3]));
    assert.match(onWeak.checks[3].detail, new RegExp(`^0 of ${badNames(id).length} bad versions caught`));
    assert.ok(onWeak.score < 1);
  });
}

test('the grader exits 1 with the reason on stderr when it cannot grade', () => {
  const empty = tempDir('skills-bench-tdd-');
  const cases = [[], ['--task', empty, '--run', empty], ['--task', join(TASKS, taskIds[0]), '--run', join(empty, 'missing')]];
  for (const args of cases) {
    const r = spawnSync(process.execPath, [GRADER, ...args], { encoding: 'utf8', timeout: 60_000 });
    assert.equal(r.status, 1, args.join(' '));
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /^grade\.mjs: could not grade: \S.*\n$/);
  }
});

// Edge cases, on duration-parse (6 bad versions). A run is start + reference, then the files given here.
const DP = join(TASKS, 'duration-parse');
const DP_START_TEST = read(DP, 'start', 'test', 'duration.test.js');
function runWith(files, dirs = [join(DP, 'start'), join(DP, 'reference')]) {
  const d = layered(...dirs);
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(dirname(join(d, f)), { recursive: true });
    writeFileSync(join(d, f), text);
  }
  return d;
}
function gradeWith(runDir, env = {}) {
  const r = spawnSync(process.execPath, [GRADER, '--task', DP, '--run', runDir], { encoding: 'utf8', timeout: 120_000, env: { ...process.env, ...env } });
  return { ...r, g: r.status === 0 ? JSON.parse(r.stdout) : null };
}
const HEAD = "import { test } from 'node:test';\nimport assert from 'node:assert/strict';\nimport { parseDuration } from '../src/duration.js';\n";

test('with the time budget used up no node --test starts: the checks fail with that detail and the grade exits 0', () => {
  const r = gradeWith(runWith({}), { SKILLS_BENCH_BUDGET_MS: '0' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.g.pass, false);
  for (const c of r.g.checks) assert.match(c.detail, /time budget used up$/, c.name);
});

test('a run that uses up the time budget is stopped and the later checks fail with the budget detail', OPTIONS, () => {
  const slow = `${HEAD}test('waits', () => new Promise((done) => setTimeout(done, 15_000)));\n`;
  const r = gradeWith(runWith({ 'test/slow.test.js': slow }), { SKILLS_BENCH_BUDGET_MS: '6000' });
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(r.g.checks.slice(0, 2).map((c) => c.pass), [true, true]);
  assert.match(r.g.checks[2].detail, /^2 test files new or changed, on the reference: node --test was stopped after \d+ ms$/);
  assert.equal(r.g.checks[4].detail, '2 test files: time budget used up');
});

test('a node --test that prints no counts cannot be graded: exit 1, the reason on stderr, nothing on stdout', () => {
  const r = gradeWith(runWith({ 'test/gone.test.js': "process.kill(process.ppid, 'SIGKILL');\n" }));
  assert.equal(r.status, 1);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^grade\.mjs: could not grade: node --test printed no pass and fail counts .*\n$/);
});

test('a run that breaks a start behaviour and weakens its test fails the start tests check', () => {
  const code = read(DP, 'reference', 'src', 'duration.js').replace('if (!Number.isInteger(seconds) || seconds < 0)', 'if (seconds < 0)');
  const tests = read(DP, 'reference', 'test', 'duration.test.js').replace("  assert.throws(() => formatDuration(1.5), RangeError);\n  assert.throws(() => formatDuration('60'), RangeError);\n", '');
  const r = gradeWith(runWith({ 'src/duration.js': code, 'test/duration.test.js': tests }));
  assert.equal(r.g.checks[1].pass, false, r.g.checks[1].detail);
  assert.equal(r.g.checks[4].pass, true, 'the edited tests pass on the run code');
  assert.equal(r.g.pass, false);
});

test('test files that run no test do not pass', () => {
  const skipped = `${HEAD}test.skip('parses hours', () => assert.equal(parseDuration('1h'), 3600));\n`;
  const r = gradeWith(runWith({ 'test/later.test.js': skipped }, [join(DP, 'start')]));
  assert.equal(r.g.checks[2].pass, false);
  assert.equal(r.g.checks[2].detail, '1 test file new or changed, on the reference: 0 passed, 0 failed, exit 0');
});

test('4 of 6 bad versions caught is under 75%', () => {
  const four = `${HEAD}test('four rules', () => {\n  assert.equal(parseDuration('2H'), 7200);\n  assert.throws(() => parseDuration(''), RangeError);\n  assert.equal(parseDuration('90'), 90);\n  assert.equal(parseDuration('1.5h'), 5400);\n});\n`;
  const r = gradeWith(runWith({ 'test/duration.test.js': DP_START_TEST, 'test/parse.test.js': four }));
  assert.equal(r.g.checks[3].detail, '4 of 6 bad versions caught, 5 needed; missed: total-rounded-down, unknown-unit-skipped');
  assert.equal(r.g.checks[3].pass, false);
});

test('output over the buffer limit fails the check with a detail instead of stopping the grade', () => {
  const noisy = `${HEAD}test('talks', () => { console.log('x'.repeat(200_000)); });\n`;
  const r = gradeWith(runWith({ 'test/noisy.test.js': noisy }), { SKILLS_BENCH_MAX_BUFFER: '50000' });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.g.checks[0].pass, true, r.g.checks[0].detail);
  assert.match(r.g.checks[2].detail, /: node --test printed more than 50000 bytes$/);
  assert.equal(r.g.checks[4].detail, '2 test files: node --test printed more than 50000 bytes');
});

test('the rubric is usable: 3 to 6 numbered criteria and comments, naming no skill or variant', () => {
  const text = read(TASKS, 'rubric.md');
  assert.deepEqual(validateRubric(text), []);
  const lines = withoutComments(text).split('\n').filter((l) => l.trim());
  assert.ok(lines.length >= 3 && lines.length <= 6, `${lines.length} lines`);
  for (const l of lines) assert.match(l, /^\d+\. \S/);
  assert.doesNotMatch(withoutComments(text), /\btdd\b|variant|version|skill/i);
});

test('the broken and empty variants keep the tdd skill frontmatter and file list at the base', () => {
  const git = (...a) => execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' });
  const baseFiles = git('ls-tree', '--name-only', `${BASE}:${SKILL}`).split('\n').filter(Boolean).sort();
  const front = (text) => /^---\n[\s\S]*?\n---\n/.exec(text)?.[0];
  const baseFront = front(git('show', `${BASE}:${SKILL}/SKILL.md`));
  assert.ok(baseFront, 'the base SKILL.md has frontmatter');
  for (const v of ['tdd-broken', 'tdd-empty']) {
    const d = join(VARIANTS, v);
    assert.deepEqual(filesOf(d).sort(), baseFiles, v);
    const text = read(d, 'SKILL.md');
    assert.equal(skillNameOf(text), 'tdd');
    assert.equal(front(text), baseFront, `${v} frontmatter`);
    for (const f of baseFiles.filter((f) => f !== 'SKILL.md')) assert.equal(read(d, f), git('show', `${BASE}:${SKILL}/${f}`), `${v}/${f}`);
  }
  assert.equal(read(VARIANTS, 'tdd-empty', 'SKILL.md').slice(baseFront.length).trim(), '', 'the empty variant has a body');
  const broken = read(VARIANTS, 'tdd-broken', 'SKILL.md').slice(baseFront.length);
  for (const advice of [/implementation first/i, /tests? last/i, /cop(y|ied) .*output/i, /mock/i, /only the new test/i]) {
    assert.match(broken, advice);
  }
});
