// Shared fixtures for tests/release-notes*.test.mjs: a good notes file as a string, a temp root built from strings,
// and main with every side effect injected, so gh never runs.
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { tempDir } from './helpers.mjs';
import { main } from '../scripts/release-notes.mjs';

export const SHA = 'a1'.repeat(20);
export const TITLE = 'Patch 0.9.0: batch 20, test run';

export const GOOD = [
  `# ${TITLE}`, '',
  'One line about the batch.', '',
  '## :sparkles: New', '', '- A skill.', '',
  '## :arrow_up: Changed (buffs and nerfs)', '', 'None.', '',
  '## :package: Versions', '', '- pau-skills 0.8.0 to 0.9.0.', '',
  '## :bar_chart: Counts', '', '- Skills: 2', '- Hooks: 3', '- Tests: 1,957', '',
  '## :inbox_tray: What you do', '', 'No hook changed.', '',
  '## :warning: Known issues', '', 'None.', '',
].join('\n');

/** GOOD with `from` replaced by `to`; `from` must be there, so a typo cannot pass as a check that found nothing. */
export const edit = (from, to, text = GOOD) => {
  assert.ok(text.includes(from), `the fixture holds ${JSON.stringify(from)}`);
  return text.split(from).join(to);
};
export const older = edit('0.9.0:', '0.8.0:');

export const put = (root, file, text) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
};

/** A root with the bundle at `version`, 2 skills, 3 distinct hook scripts (one named twice), and the notes files. */
export function makeRoot(notes = { 'v0.9.0.md': GOOD }, { version = '0.9.0', media = [] } = {}) {
  const root = tempDir('release-notes-');
  put(root, '.claude-plugin/marketplace.json', JSON.stringify({ plugins: [{ name: 'other', version: '9.9.9' }, { name: 'pau-skills', version }] }));
  put(root, 'skills/p/a/SKILL.md', 'a');
  put(root, 'skills/p/b/SKILL.md', 'b');
  put(root, 'skills/q/not-a-skill/README.md', 'no SKILL.md here');
  const cmd = (plugin, s) => ({ type: 'command', command: `node "\${CLAUDE_PLUGIN_ROOT}/hooks/${plugin}/${s}.mjs"` });
  put(root, 'hooks/p/hooks.json', JSON.stringify({ hooks: { PreToolUse: [{ matcher: 'Bash', hooks: [cmd('p', 'one'), cmd('p', 'two')] }], Stop: [{ hooks: [cmd('p', 'one')] }] } }));
  put(root, 'hooks/q/hooks.json', JSON.stringify({ hooks: { SessionStart: [{ hooks: [cmd('q', 'three')] }] } }));
  put(root, 'hooks/lib/config.mjs', '// shared, not a hook');
  for (const [name, text] of Object.entries(notes)) put(root, `docs/releases/${name}`, text);
  for (const m of media) put(root, `docs/releases/media/${m}`, 'GIF89a');
  return root;
}

/** gh's answer when a tag does not exist, as the injected run throws it. */
export const notFound = () => Object.assign(new Error('gh: Not Found (HTTP 404)'), { stderr: 'gh: Not Found (HTTP 404)' });

/**
 * main with every side effect injected. The default run records gh's arguments, answers the tag lookup with a 404
 * (the tag does not exist) and returns no output for anything else.
 */
export function cli(argv, { env = { GITHUB_REPOSITORY: 'o/r', GITHUB_SHA: SHA }, run, tmp = tempDir('release-body-') } = {}) {
  const out = [];
  const err = [];
  const calls = [];
  const gh = run || ((args) => {
    calls.push(args);
    if (args[0] === 'api' && /\/git\/ref\/tags\//.test(args[1])) throw notFound();
    return '';
  });
  const code = main(argv, { log: (s) => out.push(s), warn: (s) => err.push(s), env, run: gh, tmp });
  return { code, out: out.join('\n'), err: err.join('\n'), calls, creates: calls.filter((a) => a[0] === 'release'), tmp };
}
export const check = (notes, opts) => cli(['check', '--root', makeRoot(notes, opts)]);
export const fails = (r, re) => {
  assert.equal(r.code, 1, `exit 1\n${r.out}\n${r.err}`);
  assert.match(r.err, re);
};
export const noGh = () => { throw new Error('gh must not run'); };
