// The verify-before-done Stop hook counts a check script, the Lua tool commands and the checks a project declares in
// .claude/review-rules.json, and says how to stop a false alarm.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { repo, runNode, tempDir } from './helpers.mjs';
import { decide, assess, toolCallsSinceLastPrompt } from '../hooks/verification/verify-before-done.mjs';

const HOOK = repo('hooks', 'verification', 'verify-before-done.mjs');

const user = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const result = () => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } });
const tool = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name, input }] } });
const edit = (file_path) => tool('Edit', { file_path, old_string: 'a', new_string: 'b' });
const bash = (command) => tool('Bash', { command });
const jsonl = (entries) => entries.map((e) => JSON.stringify(e)).join('\n');
const turn = (...entries) => toolCallsSinceLastPrompt([user('go'), ...entries]);
const win = (p) => p.split('/').join(String.fromCharCode(92)); // builds a Windows path; never type a backslash in one
const show = (c) => c.replace(/\n/g, ' (new line) ').replace(/\t/g, ' (tab) ');
const ran = (command) => assess(turn(edit('src/main.lua'), bash(command))).verified;
const gate = (command, checks = ['bin/gate --full']) => assess(turn(edit('src/main.lua'), bash(command)), {}, {}, checks).verified;

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
  ]) {
    test(`does not count: ${show(c)}`, () => assert.equal(ran(c), false, c));
  }
});

describe('verify-before-done: checks declared in .claude/review-rules.json', () => {
  for (const c of [
    'bin/gate --full', 'cd app && bin/gate --full', 'true; bin/gate --full', '(bin/gate --full)', 'cd app\nbin/gate --full',
    'timeout 600 bin/gate --full', 'bin/gate   --full', 'bin/gate --full > out.txt 2>&1', 'bin/gate --full; echo done',
    'bin/gate --full\necho done', 'bin/gate --full>out.txt', 'bin/gate --full</dev/null', 'bin/gate --full&& echo ok',
    'bin/gate --full|tee log',
  ]) {
    test(`counts: ${show(c)}`, () => {
      assert.equal(gate(c, []), false, `without the check: ${c}`);
      assert.equal(gate(c), true, c);
    });
  }
  test('counts: the check "  bin/gate   --full  " against bin/gate --full', () => {
    assert.equal(gate('bin/gate --full', ['  bin/gate   --full  ']), true);
  });
  for (const c of ['echo "bin/gate --full"', 'echo bin/gate --full', 'xbin/gate --full', 'bin/gate --fuller', 'bin/gate', 'BIN/GATE --full']) {
    test(`does not count: ${c}`, () => assert.equal(gate(c), false, c));
  }
  test('does not count: the check bin/gate.sh against bin/gateXsh', () => assert.equal(gate('bin/gateXsh', ['bin/gate.sh']), false));
  test('counts: the check bin/gate.sh against bin/gate.sh', () => assert.equal(gate('bin/gate.sh', ['bin/gate.sh']), true));
  test('a valid check in the middle of the list counts', () => {
    assert.equal(gate('bin/gate --full', ['make lint', 'bin/gate --full', 'cargo xtask ci']), true);
  });
  test('blank entries are skipped', () => {
    for (const list of [['', 'bin/gate --full'], ['bin/gate --full', '   '], ['\t', 'bin/gate --full', '']]) {
      assert.equal(gate('ls; pwd', list), false, JSON.stringify(list));
      assert.equal(gate('bin/gate --full', list), true, JSON.stringify(list));
    }
  });
  test('a list of blank entries only counts as no checks', () => {
    for (const list of [[''], ['   '], ['\t']]) assert.equal(gate('ls; pwd', list), false, JSON.stringify(list));
  });
  test('entries that are not strings are skipped, and nothing throws', () => {
    for (const list of [[5, null, {}, ['bin/gate --full'], 'bin/gate --full'], ['bin/gate --full', 5, null, {}, ['bin/gate --full']],
      [5, null, 'bin/gate --full', {}, ['bin/gate --full']]]) {
      assert.equal(gate('bin/gate --full', list), true, JSON.stringify(list));
      assert.equal(gate('ls; pwd', list), false, JSON.stringify(list));
    }
  });
  test('an entry that is not a string is never turned into text', () => {
    assert.equal(gate('bin/gate --full', [['bin/gate --full']]), false);
    assert.equal(gate('bin/gate --full', 'bin/gate --full'), false);
    assert.equal(gate('bin/gate --full', null), false);
  });
  test('checks in the hook options do not count', () => {
    assert.equal(assess(turn(edit('src/main.lua'), bash('bin/gate --full')), { checks: ['bin/gate --full'] }).verified, false);
  });
  test('decide passes the checks on', () => {
    const transcript = jsonl([user('fix it'), edit('src/main.lua'), bash('bin/gate --full'), result()]);
    assert.equal(decide({ stop_hook_active: false }, { transcript, checks: ['bin/gate --full'] }), null);
    assert.equal(decide({ stop_hook_active: false }, { transcript }).decision, 'block');
  });
});

describe('verify-before-done: the review-rules file, as a hook', () => {
  const hook = (P, command, cwd = P) => {
    const transcript_path = join(tempDir(), 't.jsonl');
    writeFileSync(transcript_path, jsonl([user('fix it'), edit(join(P, 'src', 'main.lua')), bash(command), result()]));
    return runNode(HOOK, {
      input: JSON.stringify({ hook_event_name: 'Stop', transcript_path, stop_hook_active: false, cwd }),
      env: { CLAUDE_PROJECT_DIR: P, PAU_SKILLS_HOME: tempDir(), PAU_SKILLS_DISABLE: '' },
    });
  };
  const project = (text) => {
    const P = tempDir();
    if (text !== undefined) { mkdirSync(join(P, '.claude')); writeFileSync(join(P, '.claude', 'review-rules.json'), text); }
    return P;
  };
  const silent = (r, how) => assert.deepEqual([r.code, r.stdout, r.stderr], [0, '', ''], how);
  const blocks = (r, how) => {
    assert.deepEqual([r.code, r.stderr], [0, ''], how);
    assert.equal(JSON.parse(r.stdout || 'null')?.decision, 'block', how);
  };
  test('a declared check counts', () => silent(hook(project('{"checks":["bin/gate --full"]}'), 'bin/gate --full'), 'review-rules'));
  test('a declared check counts in a file with a byte order mark', () => {
    silent(hook(project(String.fromCharCode(0xfeff) + '{"checks":["bin/gate --full"]}'), 'bin/gate --full'), 'BOM');
  });
  for (const [how, text] of [['no file', undefined], ['broken', '{"checks": ['], ['null', 'null'], ['an array', '["bin/gate --full"]'],
    ['a string', '"bin/gate --full"'], ['checks a string', '{"checks": "bin/gate --full"}'], ['bad entries', '{"checks": [5, null, "", "  "]}']]) {
    test(`blocks with a review-rules file that is ${how}`, () => blocks(hook(project(text), 'bin/gate --full'), how));
  }
  test('the file is read from the project folder, not the cwd', () => {
    const P = project(), P2 = project('{"checks":["bin/gate --full"]}');
    blocks(hook(P, 'bin/gate --full', P2), 'file in the cwd only');
  });
});

describe('verify-before-done: the block message', () => {
  const reason = () => decide({ stop_hook_active: false }, { transcript: jsonl([user('fix it'), edit('src/main.go'), result()]) }).reason;
  test('says how to name a check for this hook', () => {
    const r = reason();
    for (const s of ['main.go', 'testCommands', '.claude/pau-skills.json', 'checks', '.claude/review-rules.json',
      '{"verify-before-done": {"testCommands": ["^bin/gate"]}}', '{"checks": ["bin/gate --full"]}']) assert.ok(r.includes(s), s);
  });
  test('the fixed text names no file the other tests look for', () => {
    const r = reason();
    for (const re of [/a\.ts/, /a\.js/, /b\.js/, /a\.rs/, /config\.json/]) assert.doesNotMatch(r, re);
  });
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
    ['many (bin/gate --ful', fill('(bin/gate --ful', 100000), ['bin/gate --full']],
    ['200 checks', fill('bin/gate --step; ', 20000), Array.from({ length: 200 }, (_, i) => `bin/gate --step${i}`)],
  ]) {
    test(`timing: ${name}`, (t) => t.diagnostic(`${timed(command, checks).toFixed(1)} ms`));
  }
});
