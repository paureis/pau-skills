// The verify-before-done Stop hook counts a check script run through an interpreter or directly, and the Lua tool
// commands. Declared checks, the review-rules file and the block message are in verify-before-done-checks.test.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { repo } from './helpers.mjs';
import { assess, toolCallsSinceLastPrompt } from '../hooks/verification/verify-before-done.mjs';

const HOOK = repo('hooks', 'verification', 'verify-before-done.mjs');

const user = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const tool = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name, input }] } });
const edit = (file_path) => tool('Edit', { file_path, old_string: 'a', new_string: 'b' });
const bash = (command) => tool('Bash', { command });
const turn = (...entries) => toolCallsSinceLastPrompt([user('go'), ...entries]);
const win = (p) => p.split('/').join(String.fromCharCode(92)); // builds a Windows path; never type a backslash in one
const show = (c) => c.replace(/\n/g, ' (new line) ').replace(/\t/g, ' (tab) ');
const ran = (command) => assess(turn(edit('src/main.lua'), bash(command))).verified;

describe('verify-before-done: check scripts and Lua tools', () => {
  for (const c of [
    'bash tools/check.sh --quiet', 'bash tools/check.sh --quiet </dev/null; echo EXIT=$?',
    'timeout 600 bash tools/check.sh --quiet </dev/null > out.txt 2>&1', 'lune run tests/run',
    'sh tools/check.sh', 'zsh tools/check.sh', 'bash -e tools/check.sh', 'python -u scripts/run_tests.py', 'python3 scripts/check.py',
    'node ./scripts/verify.mjs', 'node scripts/lint-all.mjs', 'pwsh scripts/lint.ps1', 'pwsh -NoProfile -File scripts/test.ps1',
    win('powershell -ExecutionPolicy Bypass -File ./scripts/check.ps1'), win('python scripts/lint.py'),
    win('powershell.exe -ExecutionPolicy Bypass -File ./scripts/check.ps1'), 'PowerShell -File scripts/test.ps1',
    'python -V; bash tools/check.sh', './scripts/verify.mjs', win('./scripts/test.ps1'), win('& ./scripts/check.ps1'),
    'bash tools/checks.sh', 'bash scripts/ci.sh', 'bash scripts/run-ci.sh', 'pwsh -File scripts/RunTests.ps1',
    'node scripts/runChecks.mjs', 'pwsh -File scripts/APITests.ps1', 'pwsh -File scripts/RunUITests.ps1',
    'pwsh -File scripts/RunCI.ps1', 'bash scripts/runCi.sh',
    'cd app; bash tools/check.sh', 'cd app && bash tools/check.sh', 'false || bash tools/check.sh', 'echo y | bash tools/check.sh',
    'sleep 1 & bash tools/check.sh', 'cd app\nbash tools/check.sh', '(bash tools/check.sh)',
    'timeout -k 5 600 bash tools/check.sh', 'timeout 10m bash tools/check.sh', 'timeout --signal=KILL 600 bash tools/check.sh',
    'timeout -s KILL 600 bash tools/check.sh', 'timeout --kill-after=5 600 bash tools/check.sh',
    'timeout --preserve-status 600 bash tools/check.sh', 'timeout --foreground 600 bash tools/check.sh',
    'timeout -v 600 bash tools/check.sh', 'timeout 30s bash tools/check.sh', 'timeout 1.5h bash tools/check.sh',
    'timeout 2d bash tools/check.sh',
    'luau-lsp analyze src', 'selene src', 'stylua --check src', 'cd game && selene .', 'selene;echo x',
  ]) {
    test(`counts: ${show(c)}`, () => assert.equal(ran(c), true, c));
  }
  test(`counts in a PowerShell call: ${win('./scripts/test.ps1')}`, () => {
    assert.equal(assess(turn(edit('src/main.lua'), tool('PowerShell', { command: win('./scripts/test.ps1') }))).verified, true);
  });
  test('counts in a Monitor call: bash tools/check.sh', () => {
    assert.equal(assess(turn(edit('src/main.lua'), tool('Monitor', { command: 'bash tools/check.sh' }))).verified, true);
  });
  test('counts: a check started in the background', () => {
    assert.equal(assess(turn(edit('src/main.lua'), tool('Bash', { command: 'npm test', run_in_background: true }))).verified, true);
  });
  for (const c of [
    'cat tools/check.sh', 'grep -r check src', 'git add tools/check.sh', 'echo bash tools/check.sh', 'echo "bash tools/check.sh"',
    'timeout 600 cat tools/check.sh', 'python latest.py', 'bash contest.sh', 'bash scripts/recheck.sh', 'bash scripts/unverify.sh',
    'bash scripts/glint.sh', 'bash special.sh', 'node decide.mjs', 'bash scripts/city.sh', 'bash scripts/davinci.sh',
    'pwsh -File scripts/getLatest.ps1', 'pwsh -File scripts/GetContest.ps1', 'bash scripts/LATEST.sh', 'pwsh -File scripts/CONTEST.ps1',
    'bash tests/run.sh', win('bash tests/run.sh'), 'pythonx scripts/check.py', 'python.exex scripts/check.py',
    'lune run build', 'stylua src', 'cat selene.toml', 'grep -rn selene src', 'luau-lsp --version',
    'pwsh -ExecutionPolicy x;cat tools/check.sh',
  ]) {
    test(`does not count: ${show(c)}`, () => assert.equal(ran(c), false, c));
  }
});

// Each runs in a child process killed after 10 s; the command goes in on standard input, since one argument over
// 131,072 bytes fails to spawn on Linux.
function timed(command, checks = []) {
  const code = 'import { assess } from ' + JSON.stringify(pathToFileURL(HOOK).href) + ';\n' +
    "import { readFileSync } from 'node:fs';\n" +
    "const { command, checks } = JSON.parse(readFileSync(0, 'utf8'));\n" +
    "const calls = [{ name: 'Edit', input: { file_path: 'src/main.lua' } }, { name: 'Bash', input: { command } }];\n" +
    'const t = performance.now(); const r = assess(calls, {}, {}, checks);\n' +
    'console.log(JSON.stringify({ verified: r.verified, ms: performance.now() - t }));';
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', code], { input: JSON.stringify({ command, checks }), encoding: 'utf8', timeout: 10000 });
  assert.equal(run.signal, null, 'killed after 10 s');
  const { verified, ms } = JSON.parse(run.stdout);
  assert.equal(verified, false);
  assert.ok(ms < 500, `${ms} ms`);
  return ms;
}
const fill = (s, n) => s.repeat(Math.ceil(n / s.length));

describe('verify-before-done: long commands that are not checks are read in under 500 ms', () => {
  for (const [name, command, checks] of [
    ["many '; '", fill('; ', 20000)], ['many (', fill('(', 20000)], ['many new lines', fill('\n', 20000)],
    ['many flags, no script', 'bash' + fill(' -e', 20000) + ' cat'],
    ['many -ExecutionPolicy pairs', 'powershell' + fill(' -ExecutionPolicy Bypass', 20000) + ' -File x.ps1'],
    ['many timeout -k 5', 'timeout' + fill(' -k 5', 20000) + ' 600 cat tools/check.sh'],
    ['many timeout -v', 'timeout' + fill(' -v', 20000) + ' 600 cat x'],
    ['many timeout prefixes', fill('timeout 600 ', 20000) + 'cat x'],
    ['a deep folder', 'bash ' + fill('a/', 20000) + 'run.sh'], ['a long name', 'bash ' + fill('a-', 20000) + 'x.sh'],
    ['a long direct path', './' + fill('x', 20000)], ['a deep lune path', 'lune run ' + fill('a/', 20000) + 'build'],
    ['many stylua arguments', 'stylua' + fill(' src', 20000)],
    ['many (bash -e', fill('(bash -e', 100000)], ['many ;bash -e', fill(';bash -e', 100000)], ['many (./a', fill('(./a', 100000)],
    ['many (timeout -k 5', fill('(timeout -k 5', 100000)], ['many (pwsh -ExecutionPolicy x', fill('(pwsh -ExecutionPolicy x', 100000)],
    ['many (stylua x', fill('(stylua x', 100000)],
    ['many (pwsh -ExecutionPolicy x, 300,000 characters', fill('(pwsh -ExecutionPolicy x', 300000)],
  ]) {
    test(`timing: ${name}`, (t) => t.diagnostic(`${timed(command, checks).toFixed(1)} ms`));
  }
});

