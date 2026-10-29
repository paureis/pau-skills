// Shared setup for tests/skill-eval-triggers-run.test.mjs: the fixture paths, lists written into a test folder, and a
// wrapper that starts `skill-eval.mjs triggers` with the stand-in for `claude` and a temporary folder of its own.
import { writeFileSync, readFileSync, existsSync, readdirSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode } from './helpers.mjs';
import { SCRIPT, scratch } from './skill-eval.helpers.mjs';

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

export { TFIX, TFAKE, SKILLS, ALSO, PASS, writeLists, writeSkill, readLog, base, trig, flag };
