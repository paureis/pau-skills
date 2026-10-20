// The skill-eval helper, pure parts: the word guard, run arguments, transcript reduction, score parsing and the command
// line, plus the actions command. The setup, run, blind, judge and unblind commands are in skill-eval-*.test.mjs.
import { SCRIPT, FIX, TRANSCRIPT, GOOD_RUBRIC } from './skill-eval.helpers.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runNode } from './helpers.mjs';
import {
  META_WORDS, findMetaWords, extractActions, renderActions, childEnv, candidateArgv, judgeArgv, validateRubric,
  parseScores, disagreements, variantMeans, skillNameOf, parseArgs, platformProblem, ALLOWED_ENV,
} from '../skills/verification/skill-eval/skill-eval.mjs';

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

describe('actions', () => {
  test('prints the reduced transcript of one file', () => {
    const r = runNode(SCRIPT, { args: ['actions', join(FIX, 'transcript.jsonl')] });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /^1\. Read: .*notes\.txt$/m);
    assert.match(r.stdout, /cost \$0\.12/);
  });
});
