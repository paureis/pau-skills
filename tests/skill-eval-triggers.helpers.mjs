// Shared setup for tests/skill-eval-triggers-run.test.mjs: the fixture paths, lists written into a test folder, and a
// wrapper that starts `skill-eval.mjs triggers` with the stand-in for `claude` and a temporary folder of its own.
import { writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync, cpSync, realpathSync } from 'node:fs';
import { join, dirname, basename, sep } from 'node:path';
import assert from 'node:assert/strict';
import { repo, runNode } from './helpers.mjs';
import { SCRIPT, scratch } from './skill-eval.helpers.mjs';
import { ALLOWED_ENV } from '../skills/verification/skill-eval/skill-eval.mjs';

const TFIX = repo('tests', 'fixtures', 'skill-eval-triggers');
const TFAKE = join(TFIX, 'fake-claude.mjs');
const SKILLS = join(TFIX, 'skills');
const ALSO = join(TFIX, 'also');

// The variables the stand-in reads, passed the way a user passes a login variable.
const PASS = ['--pass-env', 'FAKE_TRIGGERS_LOG', 'FAKE_TRIGGERS_COST', 'FAKE_TRIGGERS_FAIL', 'FAKE_TRIGGERS_EXIT1',
  'FAKE_TRIGGERS_DROP', 'FAKE_TRIGGERS_LOGGED_OUT'];

/** Write { <skill>: { should, nearMisses } } as one <skill>.json per list into a new folder; returns the folder. */
function writeLists(lists, dir = join(scratch(), 'requests')) {
  mkdirSync(dir, { recursive: true });
  for (const [skill, l] of Object.entries(lists)) {
    writeFileSync(join(dir, `${skill}.json`), JSON.stringify({ skill, should: l.should || [], nearMisses: l.nearMisses || [] }));
  }
  return dir;
}

/** Write a SKILL.md with this frontmatter name (or none) into dir. */
function writeSkill(dir, name) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), `---\n${name === null ? '' : `name: ${name}\n`}description: "A skill."\n---\n\n# A skill\n`);
  return dir;
}

const readLog = (log) => (existsSync(log)
  ? readdirSync(log).sort().map((f) => JSON.parse(readFileSync(join(log, f), 'utf8'))).sort((a, b) => a.at - b.at)
  : []);

/** The usual options: the fixture skills under test, these lists, a model and a cap of 5 dollars. */
const base = (requests, extra = []) => ['--skills', SKILLS, '--requests', requests, '--model', 'some-model', '--max-usd', '5', ...extra];

/**
 * Run `triggers <lab> ...args` with the stand-in. The child's TMPDIR is a test folder (`tmp`), so the run root and the
 * login check's folders are made there. Returns { code, stdout, stderr, lab, tmp, calls, auth, summary }.
 */
function trig(args, { env = {}, lab = join(scratch(), 'lab'), tmp = scratch() } = {}) {
  const log = join(scratch(), 'log');
  const r = runNode(SCRIPT, {
    args: ['triggers', lab, ...args, ...PASS],
    env: {
      SKILL_EVAL_CLAUDE: TFAKE, FAKE_TRIGGERS_LOG: log, TMPDIR: tmp, CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'parent',
      CLAUDE_CONFIG_DIR: '/elsewhere', KEEP_ME: 'yes', HTTPS_PROXY: 'http://proxy.example.com:3128', LANG: 'C.UTF-8', ...env,
    },
  });
  const all = readLog(log);
  const file = join(lab, 'summary.json');
  return {
    ...r, lab, tmp, calls: all.filter((c) => c.kind === 'call'), auth: all.filter((c) => c.kind === 'auth'),
    summary: existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : null,
  };
}

/** The value after a flag in one call's arguments. */
const flag = (call, name) => call.argv[call.argv.indexOf(name) + 1];

/** The ids of the runs a round made, in plan order. */
const ids = (r) => r.summary.runs.filter((x) => x.started !== null).map((x) => x.id);

const PLAN_LISTS = join(TFIX, 'plan-requests');
const ROUND_LISTS = join(TFIX, 'requests');

// Lists the command must refuse, each written as odd-list.json next to nothing else: [why, content].
const BAD_LISTS = [
  ['not JSON', '{ nope'],
  ['no should array', { skill: 'tidy-notes', should: 'tidy', nearMisses: [] }],
  ['no requests', { skill: 'tidy-notes', should: [], nearMisses: [] }],
  ['a near miss without expect', { skill: 'tidy-notes', should: [], nearMisses: [{ request: 'x y' }] }],
  ['skill not under test', { skill: 'water-plants', should: ['water it'], nearMisses: [] }],
  ['expect not installed', { skill: 'tidy-notes', should: [], nearMisses: [{ request: 'x y', expect: 'nobody' }] }],
  ['expects its own skill', { skill: 'tidy-notes', should: [], nearMisses: [{ request: 'x y', expect: 'tidy-notes' }] }],
  ['empty request', { skill: 'tidy-notes', should: ['  '], nearMisses: [] }],
  ['line break', { skill: 'tidy-notes', should: ['tidy\nnotes'], nearMisses: [] }],
  ['a typed name', { skill: 'tidy-notes', should: ['/tidy-notes go'], nearMisses: [] }],
  ['a dash', { skill: 'tidy-notes', should: ['-p tidy'], nearMisses: [] }],
];

// Skill folders the command must refuse, made inside an --also folder: [why, make(dir), what the refusal says].
const BAD_SKILLS = [
  ['no name', (d) => writeSkill(join(d, 'nameless'), null), /nameless.SKILL\.md has no name/],
  ['bad name', (d) => writeSkill(join(d, 'shouty'), 'Shouty_Name'), /shouty.SKILL\.md.*Shouty_Name/],
  ['twice', (d) => writeSkill(join(d, 'again'), 'tidy-notes'), /tidy-notes.*twice.*again.SKILL\.md/],
];

/** Copies of the fixture skills, --also skills and round lists in test folders, so a lab can be put inside them. */
function copyInputs() {
  const out = {};
  for (const [key, from] of [['skills', SKILLS], ['also', ALSO], ['requests', ROUND_LISTS]]) {
    out[key] = join(scratch(), key);
    cpSync(from, out[key], { recursive: true });
  }
  return out;
}

// The arguments of every run, in order, with the prompt right after -p.
const RUN_ARGV = (prompt, model, budget) => ['-p', prompt, '--max-turns', '1', '--output-format', 'stream-json', '--verbose',
  '--model', model, '--setting-sources', 'project', '--strict-mcp-config', '--no-session-persistence', '--max-budget-usd', budget];

/**
 * One run of a parallel 1 round, as the stand-in logged it: only the allowlist and the passed names in its environment,
 * a folder named project under a fresh tmp.XXXXXX in the temporary folder, an empty HOME beside it, exactly `skills`
 * installed, and a root that holds only this run's folder.
 */
function checkRunCall(c, tmp, skills) {
  const extra = c.names.filter((n) => !ALLOWED_ENV.includes(n) && !/^LC_/.test(n) && !/^FAKE_TRIGGERS_/.test(n) && !['HOME', '__CF_USER_TEXT_ENCODING'].includes(n));
  assert.deepEqual(extra, [], 'only the allowlist and the passed names reach a run');
  assert.ok(c.names.includes('HTTPS_PROXY'));
  assert.equal(basename(c.cwd), 'project');
  // A run reports its real working folder; the temporary folder may be a link (macOS), so compare it resolved.
  assert.ok(c.cwd.startsWith(realpathSync(tmp) + sep), 'under the temporary folder');
  assert.equal(c.home, join(dirname(c.cwd), 'home'));
  assert.deepEqual(c.homeList, [], 'an empty HOME');
  assert.deepEqual(c.skills, skills);
  assert.deepEqual(c.rootList, [basename(dirname(c.cwd))], 'the root holds only this run\'s folder');
  assert.match(basename(dirname(c.cwd)), /^tmp\./);
}

export {
  TFIX, TFAKE, SKILLS, ALSO, PASS, PLAN_LISTS, ROUND_LISTS, BAD_LISTS, BAD_SKILLS, RUN_ARGV, writeLists, writeSkill, readLog, base,
  trig, flag, ids, copyInputs, checkRunCall,
};
