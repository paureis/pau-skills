// The shared hook config: user file, then project file, PAU_SKILLS_DISABLE, and one copy in hooks/lib for every hook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, repo, tempDir, runNode } from './helpers.mjs';
import { loadConfig, hookEnabled, hookOptions, projectDir } from '../hooks/lib/config.mjs';

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
      assert.match(text, /from '\.\.\/lib\/config\.mjs'/, `${d}/${f} must import ../lib/config.mjs`);
    }
    assert.equal(existsSync(join(ROOT, 'hooks', d, 'config.mjs')), false, `hooks/${d} has its own config.mjs copy`);
  }
});

test('the existing hooks honour the switch: a disabled merge guard lets the command through', () => {
  const { home, project } = dirs();
  writeFileSync(join(project, '.claude', 'pau-skills.json'), JSON.stringify({ hooks: { 'merge-guard': false } }));
  const input = JSON.stringify({ tool_name: 'Bash', cwd: project, tool_input: { command: 'gh pr merge 5 -d' } });
  const env = { PAU_SKILLS_HOME: home, CLAUDE_PROJECT_DIR: '' };
  assert.equal(runNode(repo('hooks', 'guards', 'merge-guard.mjs'), { input, env }).code, 0);
  writeFileSync(join(project, '.claude', 'pau-skills.json'), '{}');
  assert.equal(runNode(repo('hooks', 'guards', 'merge-guard.mjs'), { input, env }).code, 2);
});

test('the existing hooks honour the switch: no-idle and the backtick guard', () => {
  const { home, project } = dirs();
  writeFileSync(join(project, '.claude', 'pau-skills.json'), JSON.stringify({ hooks: { 'no-idle': false, 'inline-backtick-guard': false } }));
  const env = { PAU_SKILLS_HOME: home, CLAUDE_PROJECT_DIR: '' };
  const agent = JSON.stringify({ hook_event_name: 'SubagentStart', cwd: project });
  assert.equal(runNode(repo('hooks', 'agent-orchestration', 'no-idle.mjs'), { input: agent, env }).stdout, '');
  const bt = JSON.stringify({ tool_name: 'Bash', cwd: project, tool_input: { command: 'node -e "console.log(`x`)"' } });
  assert.equal(runNode(repo('hooks', 'guards', 'block-inline-backtick-payload.mjs'), { input: bt, env }).code, 0);
});
