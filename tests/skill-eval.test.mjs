// The skill-eval helper: the word guard, transcript reduction and score parsing (pure), and the setup, run, blind,
// judge and unblind commands against real folders, with a stand-in for the `claude` command so no model is called.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, symlinkSync, utimesSync, chmodSync } from 'node:fs';
import { join, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { repo, runNode, tempDir } from './helpers.mjs';
import {
  META_WORDS, findMetaWords, extractActions, renderActions, childEnv, candidateArgv, judgeArgv, validateRubric,
  parseScores, disagreements, variantMeans, skillNameOf, parseArgs, rubricTemplate, platformProblem, ALLOWED_ENV,
} from '../skills/verification/skill-eval/skill-eval.mjs';

const SCRIPT = repo('skills', 'verification', 'skill-eval', 'skill-eval.mjs');
const FIX = repo('tests', 'fixtures', 'skill-eval');
const FAKE = join(FIX, 'fake-claude.mjs');
const TRANSCRIPT = readFileSync(join(FIX, 'transcript.jsonl'), 'utf8');

// The orchestrator's own scores, in the format the judge uses.
const MY_READ = ['Criterion 1: gone', '  A: 5/5', '  B: 3/5', '  C: 3/5', '  D: 3/5', 'Criterion 2: sorted', '  A: 3/5', '  B: 3/5', '  C: 3/5', '  D: 3/5', 'Criterion 3: copy', '  A: 3/5', '  B: 3/5', '  C: 3/5', '  D: 3/5'].join('\n');

// The variables the stand-in needs, passed the way a user passes a login variable.
const PASS = ['--pass-env', 'FAKE_CLAUDE_LOG', 'FAKE_CLAUDE_FAIL', 'FAKE_CLAUDE_DENY', 'FAKE_CLAUDE_LOGGED_OUT'];

const GOOD_RUBRIC = ['# Rubric', '', '1. Repeated lines are gone.', '2. The lines are sorted.', '3. A copy of the original exists.', ''].join('\n');

// A neutral prefix: the folder names the tests make must not trip the word guard themselves.
const scratch = () => tempDir('kettle-');

function writePrompt(dir, text, name = 'prompt.txt') {
  const f = join(dir, name);
  writeFileSync(f, text);
  return f;
}

/** setup with the fixture variants; returns { lab, root, code, stdout, stderr }. */
function setup({ extra = [], prompt = '/tidy-notes my shopping list in notes.txt is a mess, please clean it up', task = join(FIX, 'task'), n = '2', variants } = {}) {
  const base = scratch();
  const lab = join(base, 'lab');
  const root = join(base, 'work');
  const p = writePrompt(base, prompt);
  const vs = variants || [`alpha=${join(FIX, 'variant-a')}`, `bravo=${join(FIX, 'variant-b')}`];
  const args = ['setup', lab, '--root', root, '--task', task, ...vs.flatMap((v) => ['--variant', v]), '--prompt', p, '--n', n, ...extra];
  const r = runNode(SCRIPT, { args });
  return { lab, root, base, ...r };
}

const plan = (lab) => JSON.parse(readFileSync(join(lab, 'plan.json'), 'utf8'));

const readLog = (log) => (existsSync(log) ? readdirSync(log).map((f) => JSON.parse(readFileSync(join(log, f), 'utf8'))) : []);

function runFake(lab, { extra = [], env = {} } = {}) {
  const log = join(scratch(), 'log');
  const r = runNode(SCRIPT, { args: ['run', lab, '--model', 'some-model', ...extra, ...PASS], env: { SKILL_EVAL_CLAUDE: FAKE, FAKE_CLAUDE_LOG: log, CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'parent', CLAUDE_CODE_REMOTE_SESSION_ID: 'parent', CLAUDE_ADDITIONAL_DIRECTORIES: '/somewhere', CLAUDE_CONFIG_DIR: '/elsewhere', KEEP_ME: 'yes', HTTPS_PROXY: 'http://proxy.example.com:3128', LANG: 'C.UTF-8', ...env } });
  const all = readLog(log);
  return { ...r, calls: all.filter((c) => c.kind !== 'auth'), auth: all.filter((c) => c.kind === 'auth') };
}

function judgeFake(lab, { extra = [], env = {} } = {}) {
  const log = join(scratch(), 'log');
  const r = runNode(SCRIPT, { args: ['judge', lab, '--model', 'judge-model', ...extra, ...PASS], env: { SKILL_EVAL_CLAUDE: FAKE, FAKE_CLAUDE_LOG: log, CLAUDECODE: '1', ...env } });
  const all = readLog(log);
  return { ...r, calls: all.filter((c) => c.kind !== 'auth'), auth: all.filter((c) => c.kind === 'auth') };
}

describe('findMetaWords', () => {
  test('catches every listed word and its common forms, in any case', () => {
    const text = 'Evaluate tests judging Rubric benchmarks candidates experiment scored comparison arena';
    assert.deepEqual(findMetaWords(text).sort(), ['arena', 'benchmark', 'candidate', 'compare', 'eval', 'experiment', 'judge', 'rubric', 'score', 'test'].sort());
  });

  test('the list holds the backlog words and the upstream additions', () => {
    for (const w of ['eval', 'test', 'judge', 'rubric', 'benchmark', 'candidate', 'experiment', 'score', 'compare', 'arena']) {
      assert.ok(META_WORDS.includes(w), w);
    }
  });

  test('finds words inside names: camelCase, snake_case, kebab-case and paths', () => {
    assert.deepEqual(findMetaWords('myTestFile'), ['test']);
    assert.deepEqual(findMetaWords('run_eval.sh'), ['eval']);
    assert.deepEqual(findMetaWords('/tmp/skill-eval/work'), ['eval']);
    assert.deepEqual(findMetaWords('JUDGE.md'), ['judge']);
  });

  test('does not flag words that only contain the letters in the middle', () => {
    assert.deepEqual(findMetaWords('the latest contest protest attest scorpion medieval'), []);
  });

  test('allowed words and the exempt skill name are not reported', () => {
    assert.deepEqual(findMetaWords('add tests for the parser', { allow: ['test'] }), []);
    assert.deepEqual(findMetaWords('/evaluator check this', { exempt: ['evaluator'] }), []);
    assert.deepEqual(findMetaWords('/evaluator then score it', { exempt: ['evaluator'] }), ['score']);
  });
});

describe('skillNameOf', () => {
  test('reads the name from the frontmatter', () => {
    assert.equal(skillNameOf(readFileSync(join(FIX, 'variant-a', 'SKILL.md'), 'utf8')), 'tidy-notes');
    assert.equal(skillNameOf('no frontmatter'), null);
  });
});

describe('childEnv', () => {
  test('keeps only the allowlist and the variables passed by name, and sets HOME', () => {
    const env = childEnv({
      PATH: '/bin', HOME: '/root', LANG: 'C.UTF-8', LC_ALL: 'C', TMPDIR: '/t', HTTPS_PROXY: 'p', https_proxy: 'p', NO_PROXY: 'n',
      NODE_EXTRA_CA_CERTS: '/ca', SSL_CERT_FILE: '/ca2', PWD: '/here', OLDPWD: '/there', CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'x',
      CLAUDE_CONFIG_DIR: '/cfg', ANTHROPIC_API_KEY: 'k', CLAUDE_CODE_USER_EMAIL: 'e', CLAUDE_EFFORT: 'max', LEAN_SUBAGENT_BUDGET: 'tight',
      SKILL_EVAL_CLAUDE: '/x', VSCODE_PID: '1', CLAUDE_CODE_SYNC_SKILLS: '1', MY_LOGIN: 's',
    }, '/sandbox', ['MY_LOGIN', 'NOT_SET']);
    assert.deepEqual(Object.keys(env).sort(), ['HOME', 'HTTPS_PROXY', 'LANG', 'LC_ALL', 'MY_LOGIN', 'NODE_EXTRA_CA_CERTS', 'NO_PROXY', 'PATH', 'SSL_CERT_FILE', 'TMPDIR', 'https_proxy']);
    assert.equal(env.HOME, '/sandbox');
  });

  test('the allowlist holds no Claude Code, Anthropic, IDE or working-folder variable', () => {
    assert.deepEqual(ALLOWED_ENV.filter((n) => /CLAUDE|ANTHROPIC|PWD|VSCODE|IDE|EMAIL|BUDGET/i.test(n)), []);
  });
});

describe('platformProblem', () => {
  test('refuses Windows for the real command, which would lose argument quoting, and accepts a script or another system', () => {
    assert.match(platformProblem('win32', 'claude'), /Windows/);
    assert.equal(platformProblem('win32', 'C:/x/fake.mjs'), null);
    assert.equal(platformProblem('linux', 'claude'), null);
    assert.equal(platformProblem('darwin', 'claude'), null);
  });
});

describe('candidateArgv', () => {
  test('a headless stream-json run limited to project settings, with the model, and no flag that hides the variant', () => {
    const a = candidateArgv({ prompt: '/tidy-notes go', model: 'm1', skill: 'tidy-notes', allowTools: ['Bash(ls *)'] });
    assert.equal(a[0], '-p');
    assert.equal(a[1], '/tidy-notes go');
    const has = (...xs) => { const i = a.indexOf(xs[0]); return i >= 0 && xs.every((x, k) => a[i + k] === x); };
    assert.ok(has('--output-format', 'stream-json'));
    assert.ok(a.includes('--verbose'));
    assert.ok(has('--model', 'm1'));
    assert.ok(has('--setting-sources', 'project'));
    assert.ok(a.includes('--strict-mcp-config'));
    assert.ok(has('--permission-mode', 'acceptEdits'));
    assert.ok(has('--disallowedTools', 'AskUserQuestion'));
    assert.ok(has('--allowedTools', 'Skill(tidy-notes)', 'Bash(ls *)'));
    assert.ok(!a.includes('--bare') && !a.includes('--disable-slash-commands'));
  });

  test('no Skill() rule without a skill, and effort and budget are passed when given', () => {
    const a = candidateArgv({ prompt: 'go', model: 'm', skill: null, allowTools: [], effort: 'high', maxBudgetUsd: '2' });
    assert.ok(!a.some((x) => /^Skill\(/.test(x)));
    assert.ok(a.join(' ').includes('--effort high'));
    assert.ok(a.join(' ').includes('--max-budget-usd 2'));
  });
});

describe('judgeArgv', () => {
  test('no tools at all, nothing saved, one JSON result, the model given', () => {
    const a = judgeArgv({ model: 'm2' });
    const i = a.indexOf('--tools');
    assert.ok(i >= 0 && a[i + 1] === '', 'an empty --tools list turns every tool off');
    assert.ok(a.includes('--no-session-persistence'));
    assert.ok(a.join(' ').includes('--output-format json'));
    assert.ok(a.join(' ').includes('--model m2'));
    assert.ok(a.includes('--strict-mcp-config'));
  });
});

describe('extractActions', () => {
  const x = extractActions(TRANSCRIPT);

  test('lists every tool call in order with what it touched', () => {
    assert.deepEqual(x.steps.map((s) => s.tool), ['Read', 'Bash', 'Write', 'Agent', 'Grep', 'Skill', 'Edit']);
    assert.match(x.steps[0].target, /notes\.txt$/);
    assert.equal(x.steps[1].target, 'cp notes.txt notes.txt.bak');
    assert.match(x.steps[3].target, /check the list/);
    assert.match(x.steps[5].target, /tidy-notes/);
  });

  test('marks failed calls with the first line of the error, and calls made by a subagent', () => {
    assert.equal(x.steps[1].failed, 'Claude requested permissions to use Bash, but you have not granted it yet.');
    assert.equal(x.steps[6].failed, 'String not found in file');
    assert.equal(x.steps[0].failed, null);
    assert.equal(x.steps[4].bySubagent, true);
    assert.equal(x.steps[2].bySubagent, false);
  });

  test('keeps the run facts: model, skills offered, denials, final text, cost, turns', () => {
    assert.equal(x.model, 'claude-sonnet-5-5');
    assert.deepEqual(x.skills, ['tidy-notes', 'verify', 'debug']);
    assert.deepEqual(x.denials, ['Bash: cp notes.txt notes.txt.bak']);
    assert.match(x.finalText, /^Removed 3 repeated lines/);
    assert.equal(x.costUsd, 0.1234);
    assert.equal(x.turns, 7);
    assert.equal(x.finished, true);
    assert.equal(x.badLines, 1);
  });

  test('a transcript with no result line is not finished', () => {
    const cut = TRANSCRIPT.split('\n').filter((l) => !l.includes('"type":"result"')).join('\n');
    assert.equal(extractActions(cut).finished, false);
  });

  test('renderActions replaces machine paths and never shows the final text as evidence', () => {
    const md = renderActions(x, { replace: [['/tmp/w/tmp.Ab12Cd/kitchen', '<project>']] });
    assert.ok(!md.includes('/tmp/w/'), md);
    assert.match(md, /<project>\/notes\.txt/);
    assert.match(md, /failed: String not found/);
    assert.match(md, /subagent/);
    assert.match(md, /not evidence/i);
  });
});

describe('rubric and scores', () => {
  test('a rubric needs 3 to 6 numbered criteria and no placeholder', () => {
    assert.deepEqual(validateRubric(GOOD_RUBRIC), []);
    assert.match(validateRubric('1. one\n2. two').join(' '), /3 to 6/);
    assert.match(validateRubric('1. <criterion>\n2. b\n3. c').join(' '), /placeholder/);
  });

  test('parseScores reads "Criterion n" blocks of "<letter>: <n>/5" lines, bold or plain', () => {
    const text = ['Criterion 1: gone', '  A: 4/5  evidence', '  **B**: 2/5 evidence', '', 'Criterion 2: sorted', '- A: 5/5', '- B: 3/5', 'Totals: A 9, B 5'].join('\n');
    const r = parseScores(text);
    assert.deepEqual(r.criteria, [{ n: 1, text: 'gone', scores: { A: 4, B: 2 } }, { n: 2, text: 'sorted', scores: { A: 5, B: 3 } }]);
    assert.deepEqual(r.problems, []);
    assert.deepEqual(parseScores('nothing here').criteria, []);
  });

  test('a block ends at the first line that is not a score, so a later note never counts as a score', () => {
    const text = ['Criterion 1: gone', '  A: 5/5  ok', '  B: 5/5  ok', 'Criterion 2: sorted', '  A: 5/5', '  B: 5/5', '',
      'Notes:', '  A: 2 refused commands', '  B: 1 retry', 'Output A: 1/5 sloppy'].join('\n');
    const r = parseScores(text);
    assert.deepEqual(r.criteria.map((c) => c.scores), [{ A: 5, B: 5 }, { A: 5, B: 5 }]);
    assert.match(r.problems.join(' '), /outside a criterion/);
  });

  test('a score without /5, or a letter twice in one block, is not read as a score', () => {
    assert.deepEqual(parseScores('Criterion 1: x\n  A: 4  evidence').criteria[0].scores, {});
    const twice = parseScores('Criterion 1: x\n  A: 4/5\n  A: 2/5');
    assert.deepEqual(twice.criteria[0].scores, { A: 4 });
    assert.match(twice.problems.join(' '), /twice/);
  });

  test('disagreements are scores two or more apart on the same criterion and label', () => {
    const judge = [{ n: 1, scores: { A: 4, B: 2 } }, { n: 2, scores: { A: 5, B: 3 } }];
    const mine = [{ n: 1, scores: { A: 2, B: 2 } }, { n: 2, scores: { A: 4, B: 3 } }];
    assert.deepEqual(disagreements(judge, mine), [{ n: 1, label: 'A', judge: 4, mine: 2 }]);
  });

  test('variantMeans averages each criterion over the labels of each variant', () => {
    const scores = [{ n: 1, scores: { A: 4, B: 2, C: 5, D: 1 } }];
    const means = variantMeans(scores, { A: 'alpha', B: 'bravo', C: 'alpha', D: 'bravo' });
    assert.deepEqual(means, { alpha: { 1: 4.5, total: 4.5 }, bravo: { 1: 1.5, total: 1.5 } });
  });
});

describe('parseArgs', () => {
  test('setup with repeated options', () => {
    const o = parseArgs(['setup', 'lab', '--root', 'r', '--task', 't', '--variant', 'a=x', '--variant', 'b=none', '--prompt', 'p', '--n', '3', '--allow-word', 'test']);
    assert.deepEqual(o.variants, [{ name: 'a', dir: 'x' }, { name: 'b', dir: null }]);
    assert.equal(o.n, 3);
    assert.deepEqual(o.allowWords, ['test']);
    assert.deepEqual(o.prompts, [{ variant: null, file: 'p' }]);
  });

  test('--allow-tool takes one rule or several, and can repeat', () => {
    const o = parseArgs(['run', 'lab', '--allow-tool', 'Bash(cp *)', 'Bash(ls *)', '--model', 'm', '--allow-tool', 'Edit']);
    assert.deepEqual(o.allowTools, ['Bash(cp *)', 'Bash(ls *)', 'Edit']);
    assert.equal(o.model, 'm');
    assert.throws(() => parseArgs(['run', 'lab', '--model', 'm', '--allow-tool']));
  });

  test('--pass-env takes one name or several, for run and judge', () => {
    assert.deepEqual(parseArgs(['run', 'lab', '--model', 'm', '--pass-env', 'A_KEY', 'B_KEY']).passEnv, ['A_KEY', 'B_KEY']);
    assert.deepEqual(parseArgs(['judge', 'lab', '--model', 'm', '--pass-env', 'A_KEY']).passEnv, ['A_KEY']);
    assert.throws(() => parseArgs(['run', 'lab', '--model', 'm', '--pass-env', 'not a name']));
  });

  test('with no arguments it prints only the usage', () => {
    const r = runNode(SCRIPT);
    assert.equal(r.code, 2);
    assert.match(r.stderr, /^usage:/);
    assert.doesNotMatch(r.stderr, /unknown command/);
  });

  test('bad input throws', () => {
    for (const bad of [[], ['nope'], ['setup'], ['setup', 'lab', '--n', '0'], ['setup', 'lab', '--variant', 'noequals'],
      ['setup', 'lab', '--variant', 'Bad Name=x'], ['run', 'lab', '--parallel', 'x'], ['blind', 'lab', '--seed', 'x'], ['run', 'lab', '--wat', '1']]) {
      assert.throws(() => parseArgs(bad), undefined, JSON.stringify(bad));
    }
  });
});

describe('setup', () => {
  test('makes N folders per variant, each with the task, exactly one variant of the skill and an empty HOME', () => {
    const { lab, root, code, stdout, stderr } = setup();
    assert.equal(code, 0, stderr);
    const p = plan(lab);
    assert.equal(p.skill, 'tidy-notes');
    assert.equal(p.runs.length, 4);
    assert.deepEqual(p.runs.map((r) => r.variant).sort(), ['alpha', 'alpha', 'bravo', 'bravo']);
    for (const r of p.runs) {
      assert.ok(r.dir.startsWith(root + sep), r.dir);
      assert.deepEqual(findMetaWords(r.dir), [], r.dir);
      assert.ok(!r.dir.includes(r.variant), 'the folder name does not give the variant away');
      assert.equal(readFileSync(join(r.dir, 'notes.txt'), 'utf8'), readFileSync(join(FIX, 'task', 'notes.txt'), 'utf8'));
      assert.deepEqual(readdirSync(join(r.dir, '.claude', 'skills')), ['tidy-notes']);
      const skill = readFileSync(join(r.dir, '.claude', 'skills', 'tidy-notes', 'SKILL.md'), 'utf8');
      const want = readFileSync(join(FIX, r.variant === 'alpha' ? 'variant-a' : 'variant-b', 'SKILL.md'), 'utf8');
      assert.equal(skill, want);
      assert.deepEqual(readdirSync(r.home), []);
      assert.ok(!r.home.startsWith(r.dir + sep), 'HOME is outside the project folder');
      const log = spawnSync('git', ['-C', r.dir, 'log', '--format=%an <%ae>|%s'], { encoding: 'utf8' }).stdout.trim();
      assert.equal(log.split('\n').length, 1);
      assert.deepEqual(findMetaWords(log), [], log);
    }
    const dirs = new Set(p.runs.map((r) => r.dir));
    assert.equal(dirs.size, 4);
    for (const r of p.runs) assert.match(r.id, /^[0-9a-f]{4}$/, 'a run id says nothing about its variant or its place');
    assert.equal(new Set(p.runs.map((r) => r.id)).size, 4);
    assert.ok(existsSync(join(lab, 'rubric.md')));
    assert.match(stdout, /4 runs \(2 variants x 2\) \+ 1 judge = 5/);
    for (const r of p.runs) assert.ok(!r.dir.startsWith(lab), 'no run inside the lab folder');
  });

  test('the runs are listed in a shuffled order, so neither the id nor the place gives the variant away', () => {
    const orders = new Set();
    for (const seed of ['1', '2', '3', '4', '5', '6']) {
      const s = setup({ extra: ['--seed', seed] });
      assert.equal(s.code, 0, s.stderr);
      orders.add(plan(s.lab).runs.map((r) => r.variant).join(','));
    }
    assert.ok(orders.size > 1, `always ${[...orders][0]}`);
  });

  test('refuses more than 26 runs, which the letters cannot label', () => {
    const r = setup({ n: '14' });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /26/);
    assert.ok(!existsSync(r.root));
  });

  test('refuses a link in the task or a variant: the copy would point back at the original', () => {
    const task = join(scratch(), 'shop');
    mkdirSync(task, { recursive: true });
    writeFileSync(join(task, 'notes.txt'), 'milk\n');
    symlinkSync('notes.txt', join(task, 'list.txt'));
    const r = setup({ task });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /list\.txt.*link/);
    const variant = join(scratch(), 'tidy');
    mkdirSync(variant);
    writeFileSync(join(variant, 'SKILL.md'), readFileSync(join(FIX, 'variant-a', 'SKILL.md')));
    symlinkSync(join(FIX, 'variant-b', 'SKILL.md'), join(variant, 'OTHER.md'));
    const v = setup({ variants: [`alpha=${variant}`, `bravo=${join(FIX, 'variant-b')}`] });
    assert.equal(v.code, 1);
    assert.match(v.stderr, /OTHER\.md.*link/);
  });

  test('refuses a root that is not new and empty, and a task, variant or prompt under the root', () => {
    const base = scratch();
    const p = writePrompt(base, '/tidy-notes clean notes.txt');
    const common = ['--variant', `b=${join(FIX, 'variant-b')}`];
    const full = join(base, 'full');
    mkdirSync(full);
    writeFileSync(join(full, 'old.txt'), 'x');
    const r1 = runNode(SCRIPT, { args: ['setup', join(base, 'lab1'), '--root', full, '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, ...common, '--prompt', p] });
    assert.equal(r1.code, 1);
    assert.match(r1.stderr, /empty/);
    const root = join(base, 'root2');
    mkdirSync(join(root, 'v'), { recursive: true });
    writeFileSync(join(root, 'v', 'SKILL.md'), readFileSync(join(FIX, 'variant-a', 'SKILL.md')));
    const r2 = runNode(SCRIPT, { args: ['setup', join(base, 'lab2'), '--root', root, '--task', join(FIX, 'task'), '--variant', `a=${join(root, 'v')}`, ...common, '--prompt', p] });
    assert.equal(r2.code, 1);
    assert.match(r2.stderr, /variant a.*under the root/);
    const root3 = join(base, 'root3');
    mkdirSync(root3);
    const p3 = writePrompt(root3, '/tidy-notes clean notes.txt');
    const r3 = runNode(SCRIPT, { args: ['setup', join(base, 'lab3'), '--root', root3, '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, ...common, '--prompt', p3] });
    assert.equal(r3.code, 1);
    assert.match(r3.stderr, /prompt.*under the root/);
    const empty = join(base, 'root4');
    mkdirSync(empty);
    const r4 = runNode(SCRIPT, { args: ['setup', join(base, 'lab4'), '--root', empty, '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, ...common, '--prompt', p] });
    assert.equal(r4.code, 0, r4.stderr);
  });

  test('a task folder named home gets a HOME that does not collide with it', () => {
    const task = join(scratch(), 'home');
    mkdirSync(task);
    writeFileSync(join(task, 'notes.txt'), 'milk\n');
    const r = setup({ task });
    assert.equal(r.code, 0, r.stderr);
    for (const run of plan(r.lab).runs) {
      assert.notEqual(run.home, run.dir);
      assert.ok(existsSync(join(run.dir, 'notes.txt')));
      assert.deepEqual(readdirSync(run.home), []);
    }
  });

  test('a failure while writing removes everything setup made, and keeps your own files in the lab', { skip: process.platform === 'win32' }, () => {
    const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
    const bin = join(scratch(), 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'git'), `#!/bin/sh\nfor a in "$@"; do [ "$a" = commit ] && exit 1; done\nexec "${realGit}" "$@"\n`);
    chmodSync(join(bin, 'git'), 0o755);
    const base = scratch();
    const lab = join(base, 'lab');
    mkdirSync(lab);
    const p = writePrompt(lab, '/tidy-notes clean notes.txt');
    // An existing empty root is kept, so only the removal of each run folder can leave it empty.
    const root = join(base, 'work');
    mkdirSync(root);
    const r = runNode(SCRIPT, { args: ['setup', lab, '--root', root, '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p], env: { PATH: `${bin}:${process.env.PATH}` } });
    assert.equal(r.code, 1, r.stdout);
    assert.deepEqual(readdirSync(root), [], 'no run folder left');
    assert.deepEqual(readdirSync(lab), ['prompt.txt']);
  });

  test('--grade-reply is recorded in the plan', () => {
    const r = setup({ extra: ['--grade-reply'] });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(plan(r.lab).gradeReply, true);
    assert.equal(plan(setup().lab).gradeReply, false);
  });

  test('a variant of none gets no skill folder', () => {
    const base = scratch();
    const a = writePrompt(base, 'my shopping list in notes.txt is a mess, please clean it up', 'plain.txt');
    const b = writePrompt(base, '/tidy-notes my shopping list in notes.txt is a mess, please clean it up', 'typed.txt');
    const r = runNode(SCRIPT, { args: ['setup', join(base, 'lab'), '--root', join(base, 'work'), '--task', join(FIX, 'task'), '--variant', 'without=none', '--variant', `with=${join(FIX, 'variant-b')}`, '--prompt', `without=${a}`, '--prompt', `with=${b}`, '--n', '1'] });
    assert.equal(r.code, 0, r.stderr);
    const p = plan(join(base, 'lab'));
    const none = p.runs.find((x) => x.variant === 'without');
    assert.ok(!existsSync(join(none.dir, '.claude', 'skills')));
    assert.match(p.prompts.without, /^my shopping/);
    assert.match(p.prompts.with, /^\/tidy-notes/);
  });

  for (const [why, opts, pattern] of [
    ['a meta word in the prompt', { prompt: 'please judge how well you clean notes.txt' }, /prompt.*judge/],
    ['a typed prompt for a variant that has no skill', { variants: ['without=none', `with=${join(FIX, 'variant-b')}`] }, /without.*\/tidy-notes/],
    ['variants with different skill names', { variants: [`alpha=${join(FIX, 'variant-a')}`, `bravo=${join(FIX, 'other-name')}`] }, /same name/],
    ['fewer than two variants', { variants: [`alpha=${join(FIX, 'variant-a')}`] }, /two variants/],
  ]) {
    test(`refuses ${why}, and writes nothing`, () => {
      const r = setup(opts);
      assert.equal(r.code, 1, r.stdout + r.stderr);
      assert.match(r.stderr, pattern);
      assert.ok(!existsSync(r.lab), 'no lab folder');
      assert.ok(!existsSync(r.root), 'no run folders');
    });
  }

  test('refuses a meta word anywhere in the working directory path', () => {
    const base = scratch();
    const p = writePrompt(base, '/tidy-notes clean notes.txt');
    for (const root of [join(base, 'my-tests', 'work'), join(base, 'skill-eval')]) {
      const r = runNode(SCRIPT, { args: ['setup', join(base, 'lab'), '--root', root, '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p, '--allow-word', 'test'] });
      assert.equal(r.code, 1, root);
      assert.match(r.stderr, /path/);
      assert.ok(!existsSync(join(base, 'lab')));
    }
    const slug = runNode(SCRIPT, { args: ['setup', join(base, 'lab'), '--root', join(base, 'work'), '--task', join(FIX, 'task'), '--slug', 'arena-shop', '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p] });
    assert.equal(slug.code, 1);
    assert.match(slug.stderr, /arena/);
  });

  test('refuses a meta word in a file or folder name of the task, unless the word is allowed', () => {
    const task = join(scratch(), 'shop');
    mkdirSync(join(task, 'tests'), { recursive: true });
    writeFileSync(join(task, 'notes.txt'), 'milk\n');
    writeFileSync(join(task, 'tests', 'notes_check.py'), 'print(1)\n');
    const refused = setup({ task });
    assert.equal(refused.code, 1);
    assert.match(refused.stderr, /tests/);
    const allowed = setup({ task, extra: ['--allow-word', 'test'] });
    assert.equal(allowed.code, 0, allowed.stderr);
  });

  test('a working folder path that a run could mistype only warns', () => {
    const base = scratch();
    const p = writePrompt(base, '/tidy-notes clean notes.txt');
    const r = runNode(SCRIPT, { args: ['setup', join(base, 'lab'), '--root', join(base, '-home-sam-shop', 'work'), '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p] });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /warning:.*mistype/);
    const plain = runNode(SCRIPT, { args: ['setup', join(base, 'lab2'), '--root', join(base, 'work'), '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p] });
    assert.doesNotMatch(plain.stderr, /mistype/);
  });

  test('a meta word inside a file only warns', () => {
    const task = join(scratch(), 'shop');
    mkdirSync(task, { recursive: true });
    writeFileSync(join(task, 'notes.txt'), 'milk\nwrite a benchmark later\n');
    const r = setup({ task });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /warning.*notes\.txt:2.*benchmark/);
  });

  test('refuses a lab folder inside the root, a root inside the lab, and a lab that already has a plan', () => {
    const base = scratch();
    const p = writePrompt(base, '/tidy-notes clean notes.txt');
    const common = ['--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p];
    const r1 = runNode(SCRIPT, { args: ['setup', join(base, 'work', 'lab'), '--root', join(base, 'work'), ...common] });
    assert.equal(r1.code, 1);
    const r2 = runNode(SCRIPT, { args: ['setup', join(base, 'lab'), '--root', join(base, 'lab', 'work'), ...common] });
    assert.equal(r2.code, 1);
    mkdirSync(join(base, 'full'));
    writeFileSync(join(base, 'full', 'plan.json'), '{}');
    const r3 = runNode(SCRIPT, { args: ['setup', join(base, 'full'), '--root', join(base, 'work2'), ...common] });
    assert.equal(r3.code, 1);
    assert.deepEqual(readdirSync(join(base, 'full')), ['plan.json']);
  });

  test('accepts a lab folder that holds only your own notes, such as the prompt file', () => {
    const base = scratch();
    mkdirSync(join(base, 'lab'));
    const p = writePrompt(join(base, 'lab'), '/tidy-notes clean notes.txt');
    const r = runNode(SCRIPT, { args: ['setup', join(base, 'lab'), '--root', join(base, 'work'), '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p] });
    assert.equal(r.code, 0, r.stderr);
  });

  for (const marker of ['CLAUDE.md', 'AGENTS.md', 'CLAUDE.local.md', '.claude']) {
    test(`refuses a root with ${marker} in a parent folder, which every run would load`, () => {
      const base = scratch();
      const parent = join(base, 'shop');
      mkdirSync(parent);
      if (marker === '.claude') mkdirSync(join(parent, '.claude', 'skills'), { recursive: true });
      else writeFileSync(join(parent, marker), '# notes\n');
      const p = writePrompt(base, '/tidy-notes clean notes.txt');
      const r = runNode(SCRIPT, { args: ['setup', join(base, 'lab'), '--root', join(parent, 'work', 'here'), '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p] });
      assert.equal(r.code, 1, r.stdout);
      assert.match(r.stderr, new RegExp(marker.replace('.', '\\.')));
      assert.ok(!existsSync(join(base, 'lab')));
    });
  }
});

describe('run', () => {
  test('needs --model', () => {
    const { lab } = setup();
    const r = runNode(SCRIPT, { args: ['run', lab], env: { SKILL_EVAL_CLAUDE: FAKE } });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /--model/);
  });

  test('prints the calls a run had refused, so a blocked run is seen before blinding', () => {
    const { lab } = setup();
    const r = runFake(lab, { env: { FAKE_CLAUDE_DENY: '1' } });
    assert.match(r.stdout, /refused by permissions: Bash: rm -rf build/);
  });

  test('runs every folder with its own HOME, no identity of this session, and saves each transcript in the lab', () => {
    const { lab } = setup();
    const p = plan(lab);
    const r = runFake(lab, { extra: ['--allow-tool', 'Bash(ls *)'] });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.calls.length, 4);
    for (const run of p.runs) {
      const call = r.calls.find((c) => c.cwd === run.dir);
      assert.ok(call, `a call ran in ${run.dir}`);
      assert.equal(call.home, run.home);
      const extra = call.names.filter((n) => !ALLOWED_ENV.includes(n) && !/^LC_/.test(n) && !['HOME', 'FAKE_CLAUDE_LOG'].includes(n));
      assert.deepEqual(extra, [], 'only the allowlist and the passed names reach a run');
      for (const n of ['PATH', 'HOME', 'HTTPS_PROXY', 'LANG', 'FAKE_CLAUDE_LOG']) assert.ok(call.names.includes(n), n);
      assert.equal(call.argv[1], p.prompts[run.variant]);
      assert.ok(call.argv.includes('Bash(ls *)'));
      assert.ok(call.argv.includes('some-model'));
      assert.ok(existsSync(join(lab, 'runs', `${run.id}.jsonl`)));
      assert.ok(!existsSync(join(run.dir, `${run.id}.jsonl`)));
    }
    assert.match(r.stdout, /total \$0\.20/);
  });

  test('refuses to run again over saved transcripts unless --force', () => {
    const { lab } = setup();
    assert.equal(runFake(lab).code, 0);
    const again = runFake(lab);
    assert.equal(again.code, 1);
    assert.equal(again.calls.length, 0);
    assert.equal(runFake(lab, { extra: ['--force'] }).code, 0);
  });

  test('--force rebuilds every run folder, its HOME and the installed variant from the lab before running again', () => {
    const { lab } = setup();
    assert.equal(runFake(lab).code, 0);
    assert.equal(runFake(lab, { extra: ['--force'] }).code, 0);
    for (const run of plan(lab).runs) {
      assert.equal(readFileSync(join(run.dir, 'notes.txt'), 'utf8').split('tidied').length - 1, 1, 'the first run\'s edit is gone');
      assert.equal(readFileSync(join(run.dir, '.claude', 'skills', 'tidy-notes', 'SKILL.md'), 'utf8').split('INSTALLED VARIANT TEXT').length - 1, 1);
      assert.equal(readFileSync(join(run.home, '.seen'), 'utf8').trim().split('\n').length, 1, 'a fresh HOME');
      const log = spawnSync('git', ['-C', run.dir, 'log', '--format=%H'], { encoding: 'utf8' }).stdout.trim().split('\n');
      assert.deepEqual(log, [run.base]);
    }
  });

  test('refuses to run again once a blind copy exists', () => {
    const { lab } = setup();
    assert.equal(runFake(lab).code, 0);
    writeFileSync(join(lab, 'rubric.md'), GOOD_RUBRIC);
    assert.equal(runNode(SCRIPT, { args: ['blind', lab, '--out', join(scratch(), 'b')] }).code, 0);
    const again = runFake(lab, { extra: ['--force'] });
    assert.equal(again.code, 1);
    assert.match(again.stderr, /blind/);
    assert.equal(again.calls.length, 0);
  });

  test('checks the login under the empty HOME first, and points at --real-home when it fails', () => {
    const s = setup();
    // The login is checked under a fresh empty HOME in the temporary folder, named h-XXXXXX.
    const emptyHomes = join(tmpdir(), 'h-');
    const out = runFake(s.lab, { env: { FAKE_CLAUDE_LOGGED_OUT: emptyHomes } });
    assert.equal(out.code, 1);
    assert.match(out.stderr, /logged in.*--real-home/s);
    assert.equal(out.calls.length, 0, 'no run started');
    assert.ok(out.auth.length >= 1);
    const real = runFake(s.lab, { extra: ['--real-home'], env: { FAKE_CLAUDE_LOGGED_OUT: emptyHomes } });
    assert.equal(real.code, 0, real.stderr);
    for (const c of real.calls) assert.equal(c.home, process.env.HOME);
    assert.equal(JSON.parse(readFileSync(join(s.lab, 'run.json'), 'utf8')).realHome, true);
  });

  test('a run that fails is reported and the command exits 1', () => {
    const { lab } = setup();
    const r = runFake(lab, { env: { FAKE_CLAUDE_FAIL: '1' } });
    assert.equal(r.code, 1);
    assert.match(r.stdout + r.stderr, /exit 1/);
  });
});

describe('blind, judge and unblind', () => {
  function ready() {
    const s = setup();
    assert.equal(runFake(s.lab).code, 0);
    writeFileSync(join(s.lab, 'rubric.md'), GOOD_RUBRIC);
    return s;
  }

  test('blind refuses an unfilled rubric', () => {
    const s = setup();
    runFake(s.lab);
    const r = runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b')] });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /placeholder|3 to 6/);
  });

  test('blind writes one file per run under shuffled letters, with no variant, run id, path or skill text in it', () => {
    const s = ready();
    const out = join(scratch(), 'b');
    const r = runNode(SCRIPT, { args: ['blind', s.lab, '--out', out, '--seed', '3'] });
    assert.equal(r.code, 0, r.stderr);
    assert.deepEqual(readdirSync(out).sort(), ['A.md', 'B.md', 'C.md', 'D.md', 'bundle.md', 'rubric.md']);
    const key = JSON.parse(readFileSync(join(s.lab, 'key.json'), 'utf8'));
    assert.deepEqual(Object.keys(key.labels).sort(), ['A', 'B', 'C', 'D']);
    const p = plan(s.lab);
    for (const l of ['A', 'B', 'C', 'D']) {
      const md = readFileSync(join(out, `${l}.md`), 'utf8');
      assert.match(md, new RegExp(`^# Output ${l}`, 'm'));
      assert.match(md, /done\.txt/, 'the new file is in the diff');
      assert.match(md, /^````+diff$/m, 'the diff fence is longer than any fence inside the diff');
      assert.match(md, /\+tidied/, 'the change to notes.txt is in the diff');
      assert.ok(md.indexOf('## What it changed') < md.indexOf('## What it said at the end'), 'the run\'s own words come last');
      assert.ok(!md.includes('INSTALLED VARIANT TEXT'), 'the installed skill never reaches the blind copy');
      for (const run of p.runs) {
        assert.ok(!md.includes(run.dir) && !md.includes(run.home), 'no absolute run path');
        assert.ok(!new RegExp(`\\b${run.id}\\b`).test(md), 'no run id');
      }
      assert.ok(!/\b(alpha|bravo)\b/.test(md), 'no variant name');
    }
    const bundle = readFileSync(join(out, 'bundle.md'), 'utf8');
    assert.match(bundle, /# Rubric/);
    assert.match(bundle, /Repeated lines are gone/);
    for (const l of ['A', 'B', 'C', 'D']) assert.match(bundle, new RegExp(`^# Output ${l}$`, 'm'));
    assert.ok(!bundle.includes('key.json') && !bundle.includes(s.lab), 'the bundle does not point at the key');
    assert.doesNotMatch(r.stdout, /alpha|bravo|\br\d+\b/);
  });

  test('the letters are shuffled: different seeds give different letter-to-run maps', () => {
    const s = ready();
    const maps = new Set();
    for (const seed of ['1', '2', '3', '4', '5', '6']) {
      const r = runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b'), '--seed', seed, '--force'] });
      assert.equal(r.code, 0, r.stderr);
      maps.add(JSON.stringify(JSON.parse(readFileSync(join(s.lab, 'key.json'), 'utf8')).labels));
    }
    assert.ok(maps.size > 1, 'every seed gave the same letters');
  });

  test('blind --force refuses while your read or a verdict for the old letters exists', () => {
    const s = ready();
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b')] }).code, 0);
    writeFileSync(join(s.lab, 'my-read.md'), MY_READ);
    const r = runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b'), '--force'] });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /my-read\.md/);
  });

  test('judge and unblind refuse a read older than the key', () => {
    const s = ready();
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b')] }).code, 0);
    writeFileSync(join(s.lab, 'my-read.md'), MY_READ);
    const old = new Date(Date.now() - 3600_000);
    utimesSync(join(s.lab, 'my-read.md'), old, old);
    const j = judgeFake(s.lab);
    assert.equal(j.code, 1);
    assert.match(j.stderr, /older than/);
    writeFileSync(join(s.lab, 'my-read.md'), MY_READ);
    assert.equal(judgeFake(s.lab).code, 0);
    utimesSync(join(s.lab, 'verdict.md'), old, old);
    const u = runNode(SCRIPT, { args: ['unblind', s.lab] });
    assert.equal(u.code, 1);
    assert.match(u.stderr, /older than/);
  });

  test('files the task ignores through .gitignore are listed when a run changes them', () => {
    const task = join(scratch(), 'shop');
    mkdirSync(join(task, 'build'), { recursive: true });
    writeFileSync(join(task, 'notes.txt'), 'milk\n');
    writeFileSync(join(task, '.gitignore'), 'build/\n');
    writeFileSync(join(task, 'build', 'old.txt'), 'kept\n');
    const s = setup({ task });
    assert.equal(s.code, 0, s.stderr);
    assert.equal(runFake(s.lab).code, 0);
    writeFileSync(join(s.lab, 'rubric.md'), GOOD_RUBRIC);
    const out = join(scratch(), 'b');
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', out] }).code, 0);
    const md = readFileSync(join(out, 'A.md'), 'utf8');
    assert.match(md, /## Ignored files it changed[\s\S]*new: build\/out\.txt/);
    assert.doesNotMatch(md, /build\/old\.txt/, 'an ignored file it left alone is not listed');
  });

  test('with --grade-reply the final message is marked as the work product', () => {
    const s = setup({ extra: ['--grade-reply'] });
    assert.equal(runFake(s.lab).code, 0);
    writeFileSync(join(s.lab, 'rubric.md'), GOOD_RUBRIC);
    const out = join(scratch(), 'b');
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', out] }).code, 0);
    const md = readFileSync(join(out, 'A.md'), 'utf8');
    assert.match(md, /## What it said at the end \(the work product/);
    assert.doesNotMatch(md, /not evidence/);
    assert.match(readFileSync(join(out, 'bundle.md'), 'utf8'), /final message is the work product/);
  });

  test('the rubric guidance in an HTML comment never reaches the reviewer, and the template keeps it there', () => {
    const s = ready();
    assert.match(rubricTemplate(), /<!--[\s\S]*variant[\s\S]*-->/);
    writeFileSync(join(s.lab, 'rubric.md'), `${GOOD_RUBRIC}\n<!-- note to self: variant two adds the copy -->\n`);
    const out = join(scratch(), 'b');
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', out] }).code, 0);
    assert.doesNotMatch(readFileSync(join(out, 'bundle.md'), 'utf8'), /note to self|variant two/);
    assert.doesNotMatch(readFileSync(join(out, 'rubric.md'), 'utf8'), /note to self/);
  });

  test('blind refuses a second time while a key exists, and refuses an --out inside the lab or the root', () => {
    const s = ready();
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b')] }).code, 0);
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b')] }).code, 1);
    const t = ready();
    assert.equal(runNode(SCRIPT, { args: ['blind', t.lab, '--out', join(t.lab, 'b')] }).code, 1);
    assert.equal(runNode(SCRIPT, { args: ['blind', t.lab, '--out', join(t.root, 'b')] }).code, 1);
  });

  test('judge sends the bundle on standard input to a run with no tools, in an empty folder, and saves the verdict in the lab', () => {
    const s = ready();
    const out = join(scratch(), 'b');
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', out] }).code, 0);
    writeFileSync(join(s.lab, 'my-read.md'), MY_READ);
    const r = judgeFake(s.lab);
    assert.equal(r.code, 0, r.stderr);
    assert.equal(r.calls.length, 1);
    const [c] = r.calls;
    assert.equal(c.stdin, readFileSync(join(out, 'bundle.md'), 'utf8'));
    assert.ok(c.argv.includes('judge-model'));
    assert.ok(!c.names.includes('CLAUDECODE'));
    assert.ok(r.auth.length >= 1, 'the login was checked first');
    for (const d of [c.cwd, c.home]) {
      assert.ok(!d.startsWith(s.lab) && !d.startsWith(s.root) && !d.startsWith(out), d);
    }
    assert.match(readFileSync(join(s.lab, 'verdict.md'), 'utf8'), /Criterion 1/);
  });

  test('judge refuses before blind, needs --model, and refuses until your own read is saved', () => {
    const s = ready();
    assert.equal(judgeFake(s.lab).code, 1);
    assert.equal(runNode(SCRIPT, { args: ['judge', s.lab], env: { SKILL_EVAL_CLAUDE: FAKE } }).code, 2);
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b')] }).code, 0);
    const early = judgeFake(s.lab);
    assert.equal(early.code, 1, 'no read of my own yet');
    assert.match(early.stderr, /my-read\.md/);
    writeFileSync(join(s.lab, 'my-read.md'), 'I liked A best.\nCriterion 1: x\n  A: 4  no score out of 5');
    const unreadable = judgeFake(s.lab);
    assert.equal(unreadable.code, 1, 'a read with no scores in the format is refused');
    assert.match(unreadable.stderr, /Criterion/);
    writeFileSync(join(s.lab, 'my-read.md'), `${MY_READ}\nNotes:\n  A: 2/5 stray`);
    const stray = judgeFake(s.lab);
    assert.equal(stray.code, 1, 'a score line outside a block is refused in your own read');
    assert.match(stray.stderr, /outside a criterion/);
    assert.equal(early.calls.length + unreadable.calls.length + stray.calls.length, 0, 'no judge was started');
  });

  test('unblind refuses until the verdict is saved, then maps letters to variants and lists disagreements', () => {
    const s = ready();
    assert.equal(runNode(SCRIPT, { args: ['blind', s.lab, '--out', join(scratch(), 'b')] }).code, 0);
    writeFileSync(join(s.lab, 'my-read.md'), MY_READ);
    const early = runNode(SCRIPT, { args: ['unblind', s.lab] });
    assert.equal(early.code, 1, 'no verdict yet');
    assert.match(early.stderr, /verdict\.md/);
    assert.equal(judgeFake(s.lab).code, 0);
    const r = runNode(SCRIPT, { args: ['unblind', s.lab] });
    assert.equal(r.code, 0, r.stderr);
    const key = JSON.parse(readFileSync(join(s.lab, 'key.json'), 'utf8')).labels;
    for (const [label, run] of Object.entries(key)) {
      const variant = plan(s.lab).runs.find((x) => x.id === run).variant;
      assert.match(r.stdout, new RegExp(`${label}\\s+${run}\\s+${variant}`));
    }
    assert.match(r.stdout, /alpha.*3/);
    assert.match(r.stdout, /Disagreements.*\n.*criterion 1, A: judge 3, you 5/);
    assert.match(r.stdout, /cost/i);
  });
});

describe('actions', () => {
  test('prints the reduced transcript of one file', () => {
    const r = runNode(SCRIPT, { args: ['actions', join(FIX, 'transcript.jsonl')] });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /^1\. Read: .*notes\.txt$/m);
    assert.match(r.stdout, /cost \$0\.12/);
  });
});

test('nothing above writes inside the repository', () => {
  const status = spawnSync('git', ['-C', repo(), 'status', '--porcelain', '--', 'tests/fixtures/skill-eval'], { encoding: 'utf8' }).stdout;
  assert.doesNotMatch(status, /done\.txt|tidied/);
});
