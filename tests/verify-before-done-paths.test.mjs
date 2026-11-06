// The verify-before-done Stop hook counts only edits inside the project: a check followed by an edit to a scratchpad,
// a temp folder or another project must not send the agent back. These tests cover how a path is placed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync, symlinkSync, realpathSync } from 'node:fs';
import { join, dirname, sep, win32 } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { decide, assess, insideProject, toolCallsSinceLastPrompt } from '../hooks/verification/verify-before-done.mjs';

const HOOK = repo('hooks', 'verification', 'verify-before-done.mjs');

const user = (text) => ({ type: 'user', message: { role: 'user', content: text } });
const result = () => ({ type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } });
const tool = (name, input) => ({ type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name, input }] } });
const edit = (file_path) => tool('Edit', { file_path, old_string: 'a', new_string: 'b' });
const bash = (command) => tool('Bash', { command });
const jsonl = (entries) => entries.map((e) => JSON.stringify(e)).join('\n');
const turn = (...entries) => toolCallsSinceLastPrompt([user('go'), ...entries]);
const win = (p) => p.split('/').join(String.fromCharCode(92)); // builds a Windows path; never type a backslash in one
const REPO_CHECKS = ['npm run scrub', 'node scripts/build-marketplace[.]mjs --check', 'claude plugin validate'];
const nul = String.fromCharCode(0);

// A project R with a src folder, a link L to it, and R's real path.
function linked() {
  const R = tempDir();
  mkdirSync(join(R, 'src'));
  const L = join(tempDir(), 'link');
  symlinkSync(R, L, 'dir');
  return { R, L, real: realpathSync.native(R) };
}

const isIn = (file, where) => assert.equal(insideProject(file, where), true, `inside: ${file}`);
const isOut = (file, where) => assert.equal(insideProject(file, where), false, `outside: ${file}`);

describe('verify-before-done: only edits in the project count', () => {
  test('a check, then edits outside the project: verified', () => {
    const P = tempDir(), O = tempDir();
    const calls = turn(edit(join(P, 'src', 'a.js')), bash('npm test'),
      edit(join(O, 'scratchpad', 'plan.js')),
      tool('Write', { file_path: join(O, 'tmp', 'run.sh'), content: 'x' }),
      tool('MultiEdit', { file_path: join(O, 'home', '.claude', 'settings.json'), edits: [] }),
      tool('NotebookEdit', { notebook_path: join(O, 'notes', 'n.ipynb'), new_source: 'x' }),
      edit(join(O, 'artifact', 'page.html')),
      edit('../elsewhere/x.js'));
    assert.deepEqual(assess(calls, {}, { project: P, cwd: P }), { edited: [join(P, 'src', 'a.js')], verified: true });
  });
  test('a check, then an edit inside the project: not verified', () => {
    const P = tempDir();
    const at = { project: P, cwd: P };
    const a = join(P, 'src', 'a.js'), b = join(P, 'src', 'b.js');
    assert.deepEqual(assess(turn(edit(a), bash('npm test'), edit(b)), {}, at), { edited: [a, b], verified: false });
    assert.equal(assess(turn(bash('npm test'), edit('src/c.js')), {}, at).verified, false);
  });
  test('a check, then an edit to a JSON file in the project: not verified', () => {
    const P = tempDir(), O = tempDir();
    const a = join(P, 'src', 'a.js');
    for (const name of ['package.json', '.claude/pau-skills.json', 'tsconfig.json']) {
      const file = join(P, ...name.split('/'));
      const calls = turn(edit(a), bash('npm test'), edit(join(O, 'x.js')), edit(file), edit(join(O, 'y.js')));
      assert.deepEqual(assess(calls, {}, { project: P, cwd: P }), { edited: [a, file], verified: false }, name);
    }
  });
  test('the edge of the project folder', () => {
    const P = tempDir();
    const at = { project: P, cwd: P };
    isIn(join(P, '..notes.js'), at);
    isIn(join(P, 'src', 'a.js'), at);
    isOut(P + '-old' + sep + 'x.js', at);
    isOut(dirname(P), at);
    isOut(join(dirname(P), 'x.js'), at);
    isOut(P + sep + '..' + sep + 'x.js', at);
  });
  test('a linked project, or /var against /private/var, compares real paths', () => {
    const { R, L, real } = linked();
    const O = tempDir();
    isIn(join(real, 'src', 'a.js'), { project: L, cwd: L });
    isIn(join(L, 'src', 'a.js'), { project: real, cwd: real });
    isIn(join(L, 'new', 'deeper', 'x.js'), { project: real, cwd: real });
    isIn(join(R, 'src', 'a.js'), { project: real });
    isIn(join(real, 'src', 'a.js'), { project: R });
    isOut(join(O, 'x.js'), { project: L, cwd: L });
  });
  test('a link inside the project that points outside counts as inside', () => {
    const P = tempDir(), O = tempDir();
    symlinkSync(O, join(P, 'vendor'), 'dir');
    isIn(join(P, 'vendor', 'lib.js'), { project: P, cwd: P });
  });
  test('a relative path resolves against the cwd', () => {
    const P = tempDir(), O = tempDir();
    isIn('a.js', { project: P, cwd: P });
    isOut('a.js', { project: P, cwd: O });
    isIn('../x.js', { project: P, cwd: join(P, 'src') });
    isOut('../../x.js', { project: P, cwd: join(P, 'src') });
  });
  test('a path it cannot place counts as inside, and nothing throws', () => {
    const P = tempDir(), O = tempDir();
    isIn('../elsewhere/a.js', { project: P });
    isIn('../elsewhere/a.js', { project: P, cwd: 5 });
    isIn('../elsewhere/a.js', { project: P, cwd: '' });
    isIn(join(O, 'x.js'), {});
    isIn(join(O, 'x.js'), { project: 5 });
    isIn(join(O, 'x.js'), { project: '' });
    isIn(5, { project: P, cwd: P });
    isIn(join(P, 'a' + nul + 'b.js'), { project: P, cwd: P });
    isOut(join(O, 'a' + nul + 'b.js'), { project: P, cwd: P });
  });
  test('Windows paths with backslashes, drive letters and either case', () => {
    const at = { project: win('C:/work/proj'), cwd: win('C:/work/proj'), api: win32 };
    isIn(win('C:/work/proj/src/a.js'), at);
    isIn(win('src/b.js'), at);
    isIn('c:/WORK/proj/src/d.js', at);
    isOut(win('../other/c.js'), at);
    isOut(win('C:/work/proj-old/e.js'), at);
    isOut(win('D:/work/proj/f.js'), at);
    const calls = turn(edit(win('C:/work/proj/src/a.js')), bash('npm test'), edit(win('C:/temp/scratch/plan.js')));
    assert.deepEqual(assess(calls, {}, at), { edited: ['C:/work/proj/src/a.js'], verified: true });
  });
});

describe('verify-before-done: decide in a project', () => {
  test('decide uses the project and the input cwd', () => {
    const P = tempDir(), O = tempDir();
    const transcript = (later) => jsonl([user('fix it'), edit(join(P, 'src', 'a.js')), bash('npm test'), later, result()]);
    assert.equal(decide({ stop_hook_active: false, cwd: P }, { transcript: transcript(edit(join(O, 'x.js'))), project: P }), null);
    const out = decide({ stop_hook_active: false, cwd: P }, { transcript: transcript(edit(join(P, 'b.js'))), project: P });
    assert.equal(out.decision, 'block');
    assert.match(out.reason, /b\.js/);
    assert.equal(decide({ stop_hook_active: false, cwd: O }, { transcript: transcript(edit('a.js')), project: P }), null);
    assert.equal(decide({ stop_hook_active: false, cwd: P }, { transcript: transcript(edit(join(O, 'x.js'))) }).decision, 'block');
  });
});

describe('verify-before-done: as a hook in a project', () => {
  const hook = (entries, input = {}, env = {}) => {
    const transcript_path = join(tempDir(), 't.jsonl');
    writeFileSync(transcript_path, jsonl([user('fix it'), ...entries, result()]));
    return runNode(HOOK, {
      input: JSON.stringify({ hook_event_name: 'Stop', transcript_path, stop_hook_active: false, ...input }),
      env: { PAU_SKILLS_HOME: tempDir(), PAU_SKILLS_DISABLE: '', CLAUDE_PROJECT_DIR: '', ...env },
    });
  };
  const silent = (r, how) => {
    assert.equal(r.code, 0, `exit code, ${how}`);
    assert.equal(r.stderr, '', `stderr, ${how}`);
    assert.equal(r.stdout, '', `stdout, ${how}`);
  };
  const blocks = (r, how, reason) => {
    assert.equal(r.code, 0, `exit code, ${how}`);
    assert.equal(r.stderr, '', `stderr, ${how}`);
    const out = JSON.parse(r.stdout || 'null');
    assert.equal(out?.decision, 'block', `decision, ${how}`);
    if (reason) assert.match(out.reason, reason, `reason, ${how}`);
  };

  test('drops edits outside the project and keeps edits inside it', () => {
    const P = tempDir(), O = tempDir();
    mkdirSync(join(P, 'src'));
    const at = [{ cwd: join(P, 'src') }, { CLAUDE_PROJECT_DIR: P }];
    silent(hook([edit(join(P, 'src', 'a.js')), bash('npm test'), edit(join(O, 'scratch.js'))], ...at), 'outside edit');
    blocks(hook([edit(join(P, 'src', 'a.js')), bash('npm test'), edit(join(P, 'config.json'))], ...at), 'inside edit', /config\.json/);
  });
  test('a linked project: real paths count as inside', () => {
    const { L, real } = linked();
    const O = tempDir();
    blocks(hook([edit(join(real, 'src', 'a.js'))], { cwd: L }), 'real path, project by link');
    blocks(hook([edit(join(L, 'new', 'x.js'))], { cwd: real }, { CLAUDE_PROJECT_DIR: real }), 'link path, project by real path');
    silent(hook([edit(join(O, 'x.js'))], { cwd: L }), 'outside the linked project');
  });
  test('a relative file_path resolves against the input cwd', () => {
    const P = tempDir(), O = tempDir();
    silent(hook([edit('a.js')], { cwd: O }, { CLAUDE_PROJECT_DIR: P }), 'cwd outside');
    blocks(hook([edit('a.js')], { cwd: P }, { CLAUDE_PROJECT_DIR: P }), 'cwd in the project', /a\.js/);
  });
  test('testCommands from the project config count', () => {
    const P = tempDir(), P2 = tempDir();
    mkdirSync(join(P, '.claude'));
    writeFileSync(join(P, '.claude', 'pau-skills.json'), JSON.stringify({ 'verify-before-done': { testCommands: REPO_CHECKS } }));
    silent(hook([edit(join(P, 'src', 'a.js')), bash('npm run scrub')], {}, { CLAUDE_PROJECT_DIR: P }), 'with testCommands');
    blocks(hook([edit(join(P2, 'src', 'a.js')), bash('npm run scrub')], {}, { CLAUDE_PROJECT_DIR: P2 }), 'without testCommands');
  });
  test('exits 0 with nothing on stderr on input it cannot read', () => {
    const P = tempDir(), O = tempDir();
    const env = { CLAUDE_PROJECT_DIR: P };
    blocks(hook([edit('../elsewhere/a.js')], { cwd: 5 }, env), '(a) cwd 5');
    blocks(hook([edit('../elsewhere/a.js')], { cwd: null }, env), '(b) cwd null');
    silent(hook([tool('Edit', null), tool('Monitor', null), { type: 'assistant', message: { content: 'text' } }], { cwd: P }, env), '(c) odd entries');
    silent(hook([edit(join(O, 'a' + nul + 'b.js'))], { cwd: P }, env), '(d) nul outside');
    blocks(hook([edit(join(P, 'a' + nul + 'b.js'))], { cwd: P }, env), '(e) nul inside');
  });
});
