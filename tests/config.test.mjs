// The shared hook config: user file, then project file, PAU_SKILLS_DISABLE, and one copy in hooks/lib for every hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, repo, tempDir, runNode } from './helpers.mjs';
import { loadConfig, hookEnabled, hookOptions, projectDir } from '../hooks/lib/config.mjs';
import { writeSnapshot } from '../hooks/session-discipline/compact-snapshot.mjs';

function dirs() {
  const home = tempDir(); const project = tempDir();
  mkdirSync(join(home, '.claude')); mkdirSync(join(project, '.claude'));
  return { home, project };
}

test('missing files give an empty config and every hook enabled', () => {
  const { home, project } = dirs();
  const c = loadConfig({ home, project });
  assert.deepEqual(c, {});
  assert.equal(hookEnabled('secret-guard', c, {}), true);
});

test('the project file wins over the user file, and option objects merge key by key', () => {
  const { home, project } = dirs();
  writeFileSync(join(home, '.claude', 'pau-skills.json'), JSON.stringify({ hooks: { a: false, b: false }, x: { p: 1, q: 1 } }));
  writeFileSync(join(project, '.claude', 'pau-skills.json'), JSON.stringify({ hooks: { b: true }, x: { q: 2 } }));
  const c = loadConfig({ home, project });
  assert.equal(hookEnabled('a', c, {}), false);
  assert.equal(hookEnabled('b', c, {}), true);
  assert.deepEqual(hookOptions('x', c), { p: 1, q: 2 });
  assert.deepEqual(hookOptions('missing', c), {});
});

test('invalid JSON counts as empty, never as an error', () => {
  const { home, project } = dirs();
  writeFileSync(join(project, '.claude', 'pau-skills.json'), '{ not json');
  writeFileSync(join(home, '.claude', 'pau-skills.json'), '[1,2]');
  assert.deepEqual(loadConfig({ home, project }), {});
});

test('a file that starts with a UTF-8 byte order mark is honoured', () => {
  const { home, project } = dirs();
  writeFileSync(join(project, '.claude', 'pau-skills.json'), '\uFEFF' + JSON.stringify({ hooks: { 'secret-guard': false } }));
  writeFileSync(join(home, '.claude', 'pau-skills.json'), '\uFEFF' + JSON.stringify({ x: { p: 1 } }));
  const c = loadConfig({ home, project });
  assert.equal(hookEnabled('secret-guard', c, {}), false);
  assert.deepEqual(hookOptions('x', c), { p: 1 });
});

test('PAU_SKILLS_DISABLE turns off named hooks, or all of them', () => {
  assert.equal(hookEnabled('a', {}, { PAU_SKILLS_DISABLE: 'b, a' }), false);
  assert.equal(hookEnabled('c', {}, { PAU_SKILLS_DISABLE: 'b, a' }), true);
  assert.equal(hookEnabled('c', {}, { PAU_SKILLS_DISABLE: 'all' }), false);
});

test('projectDir prefers CLAUDE_PROJECT_DIR, then the input cwd', () => {
  assert.equal(projectDir({ cwd: '/x' }, { CLAUDE_PROJECT_DIR: '/p' }), '/p');
  assert.equal(projectDir({ cwd: '/x' }, {}), '/x');
});

test('every hook script that reads config imports the one shared copy in hooks/lib', () => {
  const dirs = readdirSync(join(ROOT, 'hooks')).filter((d) => d !== 'lib' && existsSync(join(ROOT, 'hooks', d, 'hooks.json')));
  assert.ok(dirs.length >= 4);
  for (const d of dirs) {
    for (const f of readdirSync(join(ROOT, 'hooks', d)).filter((x) => x.endsWith('.mjs'))) {
      const text = readFileSync(join(ROOT, 'hooks', d, f), 'utf8');
      if (!text.includes('config.mjs')) continue;
      assert.match(text, /from (['"])\.\.\/lib\/config\.mjs\1/, `${d}/${f} must import ../lib/config.mjs`);
    }
    assert.equal(existsSync(join(ROOT, 'hooks', d, 'config.mjs')), false, `hooks/${d} has its own config.mjs copy`);
  }
});

test('the existing hooks honour the switch: a disabled merge guard lets the command through', () => {
  const { home, project } = dirs();
  writeFileSync(join(project, '.claude', 'pau-skills.json'), JSON.stringify({ hooks: { 'merge-guard': false } }));
  const input = JSON.stringify({ tool_name: 'Bash', cwd: project, tool_input: { command: 'gh pr merge 5 -d' } });
  const env = { PAU_SKILLS_HOME: home, CLAUDE_PROJECT_DIR: '', PAU_SKILLS_DISABLE: '' };
  assert.equal(runNode(repo('hooks', 'guards', 'merge-guard.mjs'), { input, env }).code, 0);
  writeFileSync(join(project, '.claude', 'pau-skills.json'), '{}');
  assert.equal(runNode(repo('hooks', 'guards', 'merge-guard.mjs'), { input, env }).code, 2);
});

test('the existing hooks honour the switch: no-idle and the backtick guard', () => {
  const { home, project } = dirs();
  writeFileSync(join(project, '.claude', 'pau-skills.json'), JSON.stringify({ hooks: { 'no-idle': false, 'inline-backtick-guard': false } }));
  const env = { PAU_SKILLS_HOME: home, CLAUDE_PROJECT_DIR: '', PAU_SKILLS_DISABLE: '' };
  const agent =JSON.stringify({ hook_event_name: 'SubagentStart', cwd: project });
  assert.equal(runNode(repo('hooks', 'agent-orchestration', 'no-idle.mjs'), { input: agent, env }).stdout, '');
  const bt = JSON.stringify({ tool_name: 'Bash', cwd: project, tool_input: { command: 'node -e "console.log(`x`)"' } });
  assert.equal(runNode(repo('hooks', 'guards', 'block-inline-backtick-payload.mjs'), { input: bt, env }).code, 0);
});

// One off-switch test per hook. The control shows the hook acts on its input in a project folder of its own; then
// "hooks": { "<name>": false } in the project config, and the name in PAU_SKILLS_DISABLE, must each leave it silent.
const BT = String.fromCharCode(96);
const additionalContext = (r) => JSON.parse(r.stdout).hookSpecificOutput.additionalContext;
const jsonl = (entries) => entries.map((e) => JSON.stringify(e)).join('\n');
const OFF_SWITCH = [
  {
    name: 'secret-guard', script: ['guards', 'secret-guard.mjs'],
    input: (p) => ({ tool_name: 'Write', cwd: p, tool_input: { file_path: join(p, 'src', 'a.js'), content: `const t = '${'gh' + 'p_' + 'A1b2C3d4'.repeat(5)}'` } }),
    acts: (r) => { assert.equal(r.code, 2); assert.match(r.stderr, /secret-guard/); },
  },
  {
    name: 'destructive-guard', script: ['guards', 'destructive-guard.mjs'],
    input: (p) => ({ tool_name: 'Bash', cwd: p, tool_input: { command: 'git push --force origin main' } }),
    acts: (r) => { assert.equal(r.code, 2); assert.match(r.stderr, /destructive-guard/); },
  },
  {
    name: 'no-verify-guard', script: ['guards', 'no-verify-guard.mjs'],
    input: (p) => ({ tool_name: 'Bash', cwd: p, tool_input: { command: 'git commit -n -m x' } }),
    acts: (r) => { assert.equal(r.code, 2); assert.match(r.stderr, /no-verify-guard/); },
  },
  {
    name: 'merge-guard', script: ['guards', 'merge-guard.mjs'],
    input: (p) => ({ tool_name: 'Bash', cwd: p, tool_input: { command: 'gh pr merge 5 -d' } }),
    acts: (r) => { assert.equal(r.code, 2); assert.match(r.stderr, /safe-merge/); },
  },
  {
    name: 'inline-backtick-guard', script: ['guards', 'block-inline-backtick-payload.mjs'],
    input: (p) => ({ tool_name: 'Bash', cwd: p, tool_input: { command: 'node -e "console.log(' + BT + 'x' + BT + ')"' } }),
    acts: (r) => { assert.equal(r.code, 2); assert.match(r.stderr, /write the script/); },
  },
  {
    name: 'no-idle', script: ['agent-orchestration', 'no-idle.mjs'],
    input: (p) => ({ hook_event_name: 'SubagentStart', cwd: p }),
    acts: (r) => { assert.equal(r.code, 0); assert.ok(additionalContext(r)); },
  },
  {
    name: 'branch-context', script: ['session-discipline', 'branch-context.mjs'],
    setup: (p) => execFileSync('git', ['init', '-q'], { cwd: p, stdio: 'ignore' }),
    input: (p) => ({ hook_event_name: 'SessionStart', source: 'startup', cwd: p }),
    acts: (r) => { assert.equal(r.code, 0); assert.match(additionalContext(r), /branch-context/); },
  },
  {
    name: 'compact-snapshot', script: ['session-discipline', 'compact-snapshot.mjs'],
    setup: (p) => writeSnapshot({ dir: join(p, '.claude', 'pau-skills', 'snapshots'), transcript: '', trigger: 'manual', git: '' }),
    input: (p) => ({ hook_event_name: 'SessionStart', source: 'compact', cwd: p }),
    acts: (r) => { assert.equal(r.code, 0); assert.match(additionalContext(r), /compact-snapshot/); },
  },
  {
    name: 'roadmap', script: ['session-discipline', 'roadmap.mjs'],
    setup: (p) => {
      mkdirSync(join(p, 'docs'));
      writeFileSync(join(p, 'docs', 'ROADMAP.md'), '| # | Item | Status |\n|---|---|---|\n| 1 | Ship | pending |\n');
    },
    acts: (r) => { assert.equal(r.code, 0); assert.ok(additionalContext(r)); },
  },
  {
    name: 'suppression-reason', script: ['verification', 'suppression-reason.mjs'],
    setup: (p) => { mkdirSync(join(p, 'src')); writeFileSync(join(p, 'src', 'a.ts'), 'x.y();\n'); },
    input: (p) => ({ hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: p, tool_input: { file_path: join(p, 'src', 'a.ts'), content: '// @ts-ignore\nx.y();\n' } }),
    acts: (r) => { assert.equal(r.code, 0); assert.match(additionalContext(r), /@ts-ignore/); },
  },
  {
    name: 'test-tamper-guard', script: ['verification', 'test-tamper-guard.mjs'],
    setup: (p) => { mkdirSync(join(p, 'tests')); writeFileSync(join(p, 'tests', 'test_a.py'), 'def test_a():\n    assert 1 == 1\n'); },
    input: (p) => ({ tool_name: 'Write', cwd: p, tool_input: { file_path: join(p, 'tests', 'test_a.py'), content: 'def test_a():\n    pass\n' } }),
    acts: (r) => { assert.equal(r.code, 0); assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'ask'); },
  },
  {
    name: 'verify-before-done', script: ['verification', 'verify-before-done.mjs'],
    setup: (p) => writeFileSync(join(p, 't.jsonl'), jsonl([
      { type: 'user', message: { role: 'user', content: 'fix it' } },
      { type: 'assistant', message: { content: [{ type: 'tool_use', id: 't', name: 'Edit', input: { file_path: 'src/a.rs', old_string: 'a', new_string: 'b' } }] } },
      { type: 'user', message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't', content: 'ok' }] } },
    ])),
    input: (p) => ({ hook_event_name: 'Stop', cwd: p, transcript_path: join(p, 't.jsonl'), stop_hook_active: false }),
    acts: (r) => { assert.equal(r.code, 0); assert.equal(JSON.parse(r.stdout).decision, 'block'); },
  },
];

for (const h of OFF_SWITCH) {
  test(`off switch: ${h.name} does nothing when turned off in the project config or with PAU_SKILLS_DISABLE`, () => {
    const p = tempDir(); mkdirSync(join(p, '.claude'));
    if (h.setup) h.setup(p);
    const run = (disable) => runNode(repo('hooks', ...h.script), {
      input: h.input ? JSON.stringify(h.input(p)) : '',
      env: { PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: p, PAU_SKILLS_DISABLE: disable },
    });
    const silent = (r, how) => {
      assert.equal(r.code, 0, `exit code, ${how}`);
      assert.equal(r.stdout, '', `stdout, ${how}`);
      assert.equal(r.stderr, '', `stderr, ${how}`);
    };
    h.acts(run(''));
    writeFileSync(join(p, '.claude', 'pau-skills.json'), JSON.stringify({ hooks: { [h.name]: false } }));
    silent(run(''), 'turned off in the project config');
    writeFileSync(join(p, '.claude', 'pau-skills.json'), '{}');
    silent(run(h.name), 'turned off with PAU_SKILLS_DISABLE');
  });
}
