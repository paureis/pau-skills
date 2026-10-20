// Shared setup for the skill-eval test files: the check at load on the temporary folder, the fixture paths, and the
// setup, run and judge wrappers that start the helper with a stand-in for the `claude` command.
import { writeFileSync, readFileSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { repo, runNode, tempDir } from './helpers.mjs';
import { INHERITED } from '../skills/verification/skill-eval/skill-eval.mjs';

// Every test here makes its roots in the temporary folder, and setup refuses a root below a folder that holds an
// INHERITED entry. Look once, with this file's own walk from the real path setup checks, so a temporary folder in
// the wrong place gives one clear failure instead of dozens of unrelated ones.
{
  const found = [];
  for (let dir = realpathSync(tmpdir()); ; dir = dirname(dir)) {
    for (const f of INHERITED) if (existsSync(join(dir, f))) found.push(join(dir, f));
    if (dirname(dir) === dir) break;
  }
  if (found.length) {
    throw new Error(`the temporary folder ${tmpdir()} is below ${found.join(', ')}. setup refuses a root below any of them, `
      + 'and every test here makes its roots in the temporary folder. Set TMPDIR to a folder with none of them in it or above it.');
  }
}

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

export { SCRIPT, FIX, FAKE, TRANSCRIPT, MY_READ, PASS, GOOD_RUBRIC, scratch, writePrompt, setup, plan, readLog, runFake, judgeFake };
