// The merge guard denies every raw gh pr merge and gh pr close with branch deletion, for Bash and PowerShell input.
// Denying too much is accepted; denying too little is not. safe-merge.mjs is tested through its pure function with a
// fake gh, and once as a real program with a fake gh script.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { safeMerge, optionsFromEnv } from '../skills/guards/safe-merge/safe-merge.mjs';

const GUARD = repo('hooks', 'guards', 'merge-guard.mjs');
const SAFE = repo('skills', 'guards', 'safe-merge', 'safe-merge.mjs');
const BT = String.fromCharCode(96);

const hookInput = (command, tool = 'Bash') => JSON.stringify({
  session_id: 's', hook_event_name: 'PreToolUse', tool_name: tool,
  tool_input: { command, description: 'd', timeout: 120000, run_in_background: false }, tool_use_id: 't',
});
function denied(command, tool = 'Bash') {
  const r = runNode(GUARD, { input: hookInput(command, tool) });
  assert.equal(r.code, 2, `should deny: ${command}`);
  assert.match(r.stderr, /safe-merge\.mjs/);
}
function passes(command, tool = 'Bash') {
  const r = runNode(GUARD, { input: hookInput(command, tool) });
  assert.equal(r.code, 0, `should pass: ${command}\n${r.stderr}`);
  assert.equal(r.stderr, '');
}

const DENY = [
  ['merge with --delete-branch', 'gh pr merge 52 --merge --delete-branch'],
  ['merge with -d', 'gh pr merge 52 --merge -d'],
  ['merge with -md', 'gh pr merge 52 -md'],
  ['merge with -dm', 'gh pr merge 52 -dm'],
  ['merge with --delete-branch=true', 'gh pr merge 52 --merge --delete-branch=true'],
  ['merge with --delete-branch=false', 'gh pr merge 52 --merge --delete-branch=false'],
  ['merge without deletion', 'gh pr merge 5 --merge'],
  ['merge help', 'gh pr merge --help'],
  ['upper-case GH.EXE', 'GH.EXE pr merge 5 -d'],
  ['extra spaces', 'gh  pr   merge 5 -d'],
  ['-R before pr', 'gh -R owner/repo pr merge 5 -d'],
  ['-R between pr and merge', 'gh pr -R owner/repo merge 5'],
  ['after &&', 'cd x && gh pr merge 5 --merge'],
  ['after ;', 'git status; gh pr merge 5'],
  ['after a pipe', 'echo 5 | gh pr merge 5 -d'],
  ['an earlier -d of another command', 'git branch -d x; gh pr merge 5 --merge'],
  ['bash line continuation', 'gh pr merge 5 --merge \\\n-d'],
  ['bash line continuation with CRLF', 'gh pr merge 5 --merge \\\r\n-d'],
  ['pr and merge split by a continuation', 'gh pr \\\nmerge 5'],
  ['bash -c', 'bash -c "gh pr merge 5 -d"'],
  ['echo of the command (too much, accepted)', 'echo "gh pr merge 5 --delete-branch"'],
  ['number by command substitution', 'gh pr merge $(gh pr list --head x --json number -q .[0].number | cat) --merge --delete-branch'],
  ['close with --delete-branch', 'gh pr close 52 --delete-branch'],
  ['close with -d', 'gh pr close 52 -d'],
  ['close with -cd short group', 'gh pr close 52 -cd "x"'],
  ['close with deletion after the comment', 'gh pr close 52 --comment "closing" --delete-branch'],
  ['close with deletion in a later segment (too much, accepted)', 'gh pr close 52; git branch -d x'],
];
const PASS = [
  ['close without deletion', 'gh pr close 52'],
  ['close with comment', 'gh pr close 52 --comment "closing"'],
  ['close after an earlier -d of another command', 'git branch -d x; gh pr close 52'],
  ['view a PR', 'gh pr view 5'],
  ['view help', 'gh pr view --help'],
  ['list by base', 'gh pr list --base main'],
  ['the safe merge script', 'node skills/guards/safe-merge/safe-merge.mjs 5 --dry-run'],
  ['delete a local branch with git', 'git branch -d x'],
  ['delete a remote branch with git, outside the rule', 'git push origin --delete x'],
  ['unrelated command', 'npm run lint'],
];

describe('merge guard: denies', () => { for (const [n, c] of DENY) test(n, () => denied(c)); });
describe('merge guard: passes', () => { for (const [n, c] of PASS) test(n, () => passes(c)); });
describe('merge guard: PowerShell and contract', () => {
  test('PowerShell backtick line continuation', () => denied('gh pr merge 5 --merge ' + BT + '\n-d', 'PowerShell'));
  test('PowerShell & with the path to gh.exe', () => denied('& "C:\\Program Files\\GitHub CLI\\gh.exe" pr merge 5 -d', 'PowerShell'));
  test('PowerShell nested shell', () => denied('powershell -Command "gh pr merge 5 -d"', 'PowerShell'));
  test('view help passes in both tools', () => { passes('gh pr view --help', 'Bash'); passes('gh pr view --help', 'PowerShell'); });
});
describe('merge guard: odd input passes with exit 0 (a closed guard would leave sessions without a shell)', () => {
  test('not JSON', () => assert.equal(runNode(GUARD, { input: 'not json gh pr merge 5 -d' }).code, 0));
  test('empty', () => assert.equal(runNode(GUARD, { input: '' }).code, 0));
  test('no command', () => assert.equal(runNode(GUARD, { input: JSON.stringify({ tool_name: 'Bash', tool_input: {} }) }).code, 0));
  test('command not a string', () => assert.equal(runNode(GUARD, { input: JSON.stringify({ tool_name: 'Bash', tool_input: { command: 5 } }) }).code, 0));
  test('another tool', () => assert.equal(runNode(GUARD, { input: hookInput('gh pr merge 5 -d', 'Write') }).code, 0));
  test('a huge command without the order does not hang', () => {
    const t0 = Date.now();
    assert.equal(runNode(GUARD, { input: hookInput('gh pr ' + '-x y '.repeat(5000) + 'view') }).code, 0);
    assert.ok(Date.now() - t0 < 5000);
  });
});

// ---- safe-merge pure logic ----
function fakeGh({ pr = {}, stacked = [], repo = 'owner/repo', trunk = 'main', failMerge = false, failList = false } = {}) {
  const calls = [];
  const gh = (args) => {
    calls.push(args.join(' '));
    if (args[0] === 'repo') return JSON.stringify({ nameWithOwner: repo, defaultBranchRef: { name: trunk } });
    if (args[0] === 'api' && args[1] === 'user') return 'someone\n';
    if (args[0] === 'pr' && args[1] === 'view') return JSON.stringify({ state: 'OPEN', isDraft: false, isCrossRepository: false, baseRefName: 'main', headRefName: 'feature-a', headRefOid: 'abc123', mergeStateStatus: 'CLEAN', ...pr });
    if (args[0] === 'pr' && args[1] === 'list') { if (failList) throw new Error('list failed'); return JSON.stringify(stacked.map((number) => ({ number }))); }
    if (args[0] === 'pr' && args[1] === 'merge') { if (failMerge) throw Object.assign(new Error('x'), { stderr: 'merge conflict' }); return ''; }
    if (args[0] === 'api' && args[1] === '-X') return '';
    throw new Error('unexpected gh call: ' + args.join(' '));
  };
  return { gh, calls };
}

describe('safe-merge', () => {
  test('merges pinned to the head commit, without --delete-branch, then deletes the unused branch', () => {
    const { gh, calls } = fakeGh();
    const r = safeMerge(7, {}, gh);
    assert.equal(r.code, 0);
    assert.ok(calls.includes('pr merge 7 --merge --match-head-commit abc123'));
    assert.ok(!calls.some((c) => c.includes('--delete-branch')));
    assert.ok(calls.includes('api -X DELETE repos/owner/repo/git/refs/heads/feature-a'));
    assert.ok(r.lines.includes('MERGED: yes'));
  });
  test('keeps the branch when an open PR is stacked on it, and says what to do next', () => {
    const { gh, calls } = fakeGh({ stacked: [8] });
    const r = safeMerge(7, {}, gh);
    assert.equal(r.code, 0);
    assert.ok(!calls.some((c) => c.startsWith('api -X DELETE')));
    assert.ok(r.lines.some((l) => l.includes('gh pr edit 8 --base main')));
  });
  test('refuses a stacked PR (base is not the trunk) before touching anything', () => {
    const { gh, calls } = fakeGh({ pr: { baseRefName: 'feature-a', headRefName: 'feature-b' } });
    const r = safeMerge(8, {}, gh);
    assert.equal(r.code, 3);
    assert.ok(!calls.some((c) => c.startsWith('pr merge')));
  });
  test('allows a configured promotion pair and never deletes its head', () => {
    const { gh, calls } = fakeGh({ pr: { baseRefName: 'main', headRefName: 'develop' }, trunk: 'develop' });
    const r = safeMerge(9, optionsFromEnv({ SAFE_MERGE_PROMOTIONS: 'develop->main' }), gh);
    assert.equal(r.code, 0);
    assert.ok(calls.some((c) => c.startsWith('pr merge 9')));
    assert.ok(!calls.some((c) => c.startsWith('api -X DELETE')));
  });
  test('refuses a draft, a closed PR, and the wrong repository', () => {
    assert.equal(safeMerge(1, {}, fakeGh({ pr: { isDraft: true } }).gh).code, 3);
    assert.equal(safeMerge(1, {}, fakeGh({ pr: { state: 'MERGED' } }).gh).code, 3);
    assert.equal(safeMerge(1, { repo: 'other/repo' }, fakeGh().gh).code, 3);
  });
  test('a failed merge attempts no deletion', () => {
    const { gh, calls } = fakeGh({ failMerge: true });
    const r = safeMerge(7, {}, gh);
    assert.equal(r.code, 1);
    assert.ok(!calls.some((c) => c.startsWith('api -X DELETE')));
  });
  test('merged but the stacked query failed: exit 4, branch kept', () => {
    const { gh, calls } = fakeGh({ failList: true });
    const r = safeMerge(7, {}, gh);
    assert.equal(r.code, 4);
    assert.ok(r.lines.includes('MERGED: yes'));
    assert.ok(!calls.some((c) => c.startsWith('api -X DELETE')));
  });
  test('dry run only reads', () => {
    const { gh, calls } = fakeGh();
    const r = safeMerge(7, { dryRun: true }, gh);
    assert.equal(r.code, 0);
    assert.ok(!calls.some((c) => c.startsWith('pr merge') || c.startsWith('api -X')));
  });
  test('options: bad promotion and bad method are rejected', () => {
    assert.throws(() => optionsFromEnv({ SAFE_MERGE_PROMOTIONS: 'develop' }));
    assert.throws(() => optionsFromEnv({ SAFE_MERGE_METHOD: 'octopus' }));
    assert.equal(optionsFromEnv({ SAFE_MERGE_METHOD: 'squash' }).method, 'squash');
  });
  test('the real program: usage error, and a dry run against a fake gh script', () => {
    assert.equal(runNode(SAFE, { args: ['abc'] }).code, 2);
    const dir = tempDir();
    const fake = join(dir, 'gh.mjs');
    writeFileSync(fake, [
      'const a = process.argv.slice(2);',
      "if (a[0] === 'repo') console.log(JSON.stringify({ nameWithOwner: 'owner/repo', defaultBranchRef: { name: 'main' } }));",
      "else if (a[0] === 'api') console.log('someone');",
      "else if (a[1] === 'view') console.log(JSON.stringify({ state: 'OPEN', isDraft: false, isCrossRepository: false, baseRefName: 'main', headRefName: 'f', headRefOid: 'abc' }));",
      "else if (a[1] === 'list') console.log('[]');",
      'else process.exit(9);',
    ].join('\n'));
    const r = runNode(SAFE, { args: ['3', '--dry-run'], env: { SAFE_MERGE_GH_SCRIPT: fake } });
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /MERGED: no \(dry run\)/);
  });
});
