// scripts/release-notes.mjs (Q31): docs/releases/v<version>.md is checked by npm test and published as a GitHub
// Release when it reaches main. Every root here is a temp folder written from the strings below; gh never runs
// (main gets an injected run, and the child process gets a PATH with no gh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { main, compareVersions, readNotes, releaseBody, treeCounts } from '../scripts/release-notes.mjs';

const SCRIPT = repo('scripts', 'release-notes.mjs');
const SHA = 'a1'.repeat(20);
const TITLE = 'Patch 0.9.0: batch 20, test run';

const GOOD = [
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
const edit = (from, to, text = GOOD) => {
  assert.ok(text.includes(from), `the fixture holds ${JSON.stringify(from)}`);
  return text.split(from).join(to);
};
const older = edit('0.9.0:', '0.8.0:');

const put = (root, file, text) => {
  mkdirSync(dirname(join(root, file)), { recursive: true });
  writeFileSync(join(root, file), text);
};

/** A root with the bundle at `version`, 2 skills, 3 distinct hook scripts (one named twice), and the notes files. */
function makeRoot(notes = { 'v0.9.0.md': GOOD }, { version = '0.9.0', media = [] } = {}) {
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

/** main with every side effect injected. The default run records gh's arguments and returns no output. */
function cli(argv, { env = { GITHUB_REPOSITORY: 'o/r', GITHUB_SHA: SHA }, run, tmp = tempDir('release-body-') } = {}) {
  const out = [];
  const err = [];
  const calls = [];
  const gh = run || ((args) => { calls.push(args); return ''; });
  const code = main(argv, { log: (s) => out.push(s), warn: (s) => err.push(s), env, run: gh, tmp });
  return { code, out: out.join('\n'), err: err.join('\n'), calls, tmp };
}
const check = (notes, opts) => cli(['check', '--root', makeRoot(notes, opts)]);
const fails = (r, re) => {
  assert.equal(r.code, 1, `exit 1\n${r.out}\n${r.err}`);
  assert.match(r.err, re);
};
const noGh = () => { throw new Error('gh must not run'); };

test('a good notes file passes check, and a missing docs/releases/ folder is fine', () => {
  const r = check();
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /1 notes file/);
  const empty = check({});
  assert.equal(empty.code, 0, empty.err);
});

test('check: a missing required heading, first, in the middle and last', () => {
  fails(check({ 'v0.9.0.md': edit('## :sparkles: New\n\n- A skill.\n\n', '') }), /v0\.9\.0\.md.*the section "New" is missing/);
  fails(check({ 'v0.9.0.md': edit('## :package: Versions\n\n- pau-skills 0.8.0 to 0.9.0.\n\n', '') }), /the section "Versions" is missing/);
  fails(check({ 'v0.9.0.md': edit('## :warning: Known issues\n\nNone.\n', '') }), /the section "Known issues" is missing/);
});

test('check: a swapped order, an empty section and a section given twice', () => {
  const versions = '## :package: Versions\n\n- pau-skills 0.8.0 to 0.9.0.\n\n';
  const swapped = edit(versions, '').split('## :inbox_tray:').join(`${versions}## :inbox_tray:`);
  fails(check({ 'v0.9.0.md': swapped }), /the section "Counts" must come after "Versions"/);
  fails(check({ 'v0.9.0.md': edit('(buffs and nerfs)\n\nNone.\n', '(buffs and nerfs)\n\n   \n') }), /the section "Changed" is empty/);
  fails(check({ 'v0.9.0.md': edit('## :warning:', '## New again\n\nMore.\n\n## :warning:') }), /the section "New" appears twice/);
});

test('check: other ## headings may sit between the required ones, and ### lines stay inside a section', () => {
  const r = check({ 'v0.9.0.md': edit('## :package:', '## Thanks\n\nSomeone.\n\n### Detail\n\n## :package:') });
  assert.equal(r.code, 0, r.err);
  const sub = check({ 'v0.9.0.md': edit('- Skills: 2', '### Totals\n\n- Skills: 2') });
  assert.equal(sub.code, 0, sub.err);
});

test('check: a heading with a Unicode emoji or trailing words matches; a longer word does not', () => {
  const unicode = edit('## :sparkles: New', '## ✨ New').split('## :warning: Known').join('## ⚠️ Known');
  const r = check({ 'v0.9.0.md': edit('## :inbox_tray: What you do', '## What you do (uploads)', unicode) });
  assert.equal(r.code, 0, r.err);
  fails(check({ 'v0.9.0.md': edit('## :sparkles: New', '## :sparkles: Newsletter') }), /the section "New" is missing/);
});

test('check: each count missing, and a count given twice', () => {
  for (const k of ['Skills', 'Hooks', 'Tests']) {
    const line = GOOD.split('\n').find((l) => l.startsWith(`- ${k}:`));
    fails(check({ 'v0.9.0.md': edit(`${line}\n`, '') }), new RegExp(`Counts: "${k}: <n>" is missing`));
  }
  fails(check({ 'v0.9.0.md': edit('- Skills: 2\n', '- Skills: 2\n- Skills: 2\n') }), /Counts: "Skills: <n>" is given 2 times/);
});

test('check: a count outside the Counts section is ignored, and a number may use thousands commas', () => {
  const outside = edit('- A skill.', '- A skill. Skills: 99, Hooks: 98, Tests: 97.');
  assert.equal(check({ 'v0.9.0.md': outside }).code, 0);
  fails(check({ 'v0.9.0.md': edit('- Skills: 2\n', '', outside) }), /Counts: "Skills: <n>" is missing/);
  const notes = readNotes(edit('- Skills: 2', '- Skills: 1,002'), { version: '0.9.0' });
  assert.deepEqual(notes.problems, []);
  assert.deepEqual(notes.counts, { Skills: 1002, Hooks: 3, Tests: 1957 });
});

test('check: line 1 is the title with the file version and no shortcode or emoji', () => {
  fails(check({ 'v0.9.0.md': edit(`# ${TITLE}`, '# Patch 0.9.1: batch 20') }), /line 1 must be "# <title>" with the version 0\.9\.0/);
  fails(check({ 'v0.9.0.md': edit(`# ${TITLE}`, `Intro\n# ${TITLE}`) }), /line 1 must be/);
  fails(check({ 'v0.9.0.md': edit(`# ${TITLE}`, `# :tada: ${TITLE}`) }), /the title holds a shortcode or an emoji/);
  fails(check({ 'v0.9.0.md': edit(`# ${TITLE}`, `# ${TITLE} \u{1F389}`) }), /the title holds a shortcode or an emoji/);
});

test('check: images only as ![...](media/<name>) with the file in docs/releases/media/', () => {
  const img = (s) => ({ 'v0.9.0.md': edit('- A skill.', `- A skill.\n\n${s}`) });
  assert.equal(check(img('![demo](media/a.gif)'), { media: ['a.gif'] }).code, 0);
  fails(check(img('![demo](https://example.com/a.gif)'), { media: ['a.gif'] }), /image target "https:\/\/example\.com\/a\.gif" is not media\/<name>/);
  fails(check(img('![demo](../media/a.gif)'), { media: ['a.gif'] }), /image target "\.\.\/media\/a\.gif"/);
  fails(check(img('![a [nested] alt](https://example.com/a.gif)'), { media: ['a.gif'] }), /image target "https:/);
  fails(check(img('![demo](media/missing.gif)'), { media: ['a.gif'] }), /docs\/releases\/media\/missing\.gif does not exist/);
  fails(check(img('![demo][r]\n\n[r]: https://example.com/a.gif'), { media: ['a.gif'] }), /reference-style image/);
  fails(check(img('![demo]\n\n[demo]: ../a.gif'), { media: ['a.gif'] }), /reference-style image/);
});

test('check: <img>, <picture>, <source> and <video> tags are refused', () => {
  for (const tag of ['<img src="media/a.gif">', '<picture>', '<source srcset="media/a.gif">', '<VIDEO src="media/a.gif">']) {
    fails(check({ 'v0.9.0.md': edit('- A skill.', `- A skill. ${tag}`) }, { media: ['a.gif'] }), /HTML <(img|picture|source|video)> tag/i);
  }
});

test('check: a bad file name is a problem, and media/ is skipped', () => {
  for (const name of ['notes.md', 'v1.2.md', 'v01.2.3.md', 'V0.9.0.md', 'v0.9.0.txt']) {
    fails(check({ 'v0.9.0.md': GOOD, [name]: GOOD }, { media: ['a.gif'] }), new RegExp(`${name.split('.').join('\\.')}: the name is not v<major>`));
  }
  assert.equal(check({ 'v0.9.0.md': GOOD }, { media: ['a.gif'] }).code, 0);
});

test('check: a version above the bundle is a problem, compared as numbers', () => {
  const v = (x) => edit('0.9.0:', `${x}:`);
  fails(check({ 'v0.10.0.md': v('0.10.0') }, { version: '0.9.0' }), /v0\.10\.0\.md: version 0\.10\.0 is above the pau-skills bundle version 0\.9\.0/);
  fails(check({ 'v0.9.1.md': v('0.9.1') }), /above the pau-skills bundle version/);
  assert.equal(check({ 'v0.8.0.md': older, 'v0.9.0.md': GOOD }).code, 0, 'below and equal pass');
  assert.equal(check({ 'v0.9.0.md': GOOD }, { version: '0.10.0' }).code, 0, '0.9.0 is below 0.10.0');
  assert.ok(compareVersions('0.10.0', '0.9.0') > 0 && compareVersions('0.9.0', '0.10.0') < 0 && compareVersions('1.2.3', '1.2.3') === 0);
});

test('check: the repository own docs/releases passes', () => {
  const r = cli(['check']);
  assert.equal(r.code, 0, r.err);
});

test('usage: an unknown command or option exits 2, and --help exits 0', () => {
  assert.equal(cli([]).code, 2);
  assert.equal(cli(['ship']).code, 2);
  assert.equal(cli(['check', '--repo', 'o/r']).code, 2);
  assert.equal(cli(['publish', '--root']).code, 2);
  assert.equal(cli(['--help']).code, 0);
});

test('tree counts: folders with a SKILL.md, and distinct hook scripts across every hooks.json', () => {
  assert.deepEqual(treeCounts(makeRoot({})), { skills: 2, hooks: 3 });
  assert.deepEqual(treeCounts(tempDir('empty-root-')), { skills: 0, hooks: 0 });
});

test('publish: a gh api failure while listing releases creates nothing', () => {
  const calls = [];
  const run = (args) => { calls.push(args); throw new Error('gh: not logged in'); };
  fails(cli(['publish', '--root', makeRoot()], { run }), /not logged in/);
  assert.equal(calls.length, 1);
});

test('publish: plans with injected existing tags, and creates only the file with no release', () => {
  const root = makeRoot({ 'v0.8.0.md': older, 'v0.9.0.md': GOOD });
  const r = cli(['publish', '--root', root, '--existing', 'v0.8.0']);
  assert.equal(r.code, 0, r.err);
  assert.equal(r.calls.length, 1);
  assert.equal(r.calls[0][2], 'v0.9.0');
  const none = cli(['publish', '--root', root, '--existing', 'v0.8.0,v0.9.0'], { run: noGh });
  assert.equal(none.code, 0, none.err);
  assert.match(none.out, /Nothing to publish/);
});

test('publish: the argv list, with --repo and --sha given', () => {
  const r = cli(['publish', '--root', makeRoot(), '--repo', 'me/x', '--sha', SHA, '--existing', ''], { env: {} });
  assert.equal(r.code, 0, r.err);
  const file = r.calls[0].at(-1);
  assert.deepEqual(r.calls, [['release', 'create', 'v0.9.0', '--repo', 'me/x', '--target', SHA, '--title', TITLE, '--notes-file', file]]);
  assert.match(r.out, /Published v0\.9\.0/);
});

test('publish: without --existing the released tags come from gh api', () => {
  const calls = [];
  const run = (args) => { calls.push(args); return args[0] === 'api' ? 'v0.8.0\n' : ''; };
  const r = cli(['publish', '--root', makeRoot({ 'v0.8.0.md': older, 'v0.9.0.md': GOOD })], { run });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(calls[0], ['api', 'repos/o/r/releases', '--paginate', '--jq', '.[].tag_name']);
  assert.equal(calls.length, 2);
  assert.equal(calls[1][2], 'v0.9.0');
});

test('publish: a Skills count that does not match the tree creates nothing', () => {
  const r = cli(['publish', '--root', makeRoot({ 'v0.9.0.md': edit('- Skills: 2', '- Skills: 3') }), '--existing', '']);
  fails(r, /Skills: 3 in Counts, but the tree has 2/);
  assert.deepEqual(r.calls, []);
});

test('publish: a Hooks count that does not match the tree creates nothing', () => {
  const r = cli(['publish', '--root', makeRoot({ 'v0.9.0.md': edit('- Hooks: 3', '- Hooks: 2') }), '--existing', '']);
  fails(r, /Hooks: 2 in Counts, but the tree has 3/);
  assert.deepEqual(r.calls, []);
});

test('publish: a version that is not the bundle version creates nothing', () => {
  const r = cli(['publish', '--root', makeRoot({ 'v0.8.0.md': older }), '--existing', '']);
  fails(r, /v0\.8\.0\.md: version 0\.8\.0 is not the bundle version 0\.9\.0/);
  assert.deepEqual(r.calls, []);
});

test('publish: an older notes file with no release blocks publishing (fail closed)', () => {
  const r = cli(['publish', '--root', makeRoot({ 'v0.8.0.md': older, 'v0.9.0.md': GOOD }), '--existing', '']);
  fails(r, /v0\.8\.0\.md: version 0\.8\.0 is not the bundle version/);
  assert.match(r.err, /Nothing was published/);
  assert.deepEqual(r.calls, []);
});

test('publish: a notes file that fails check creates nothing', () => {
  const r = cli(['publish', '--root', makeRoot({ 'v0.9.0.md': edit('## :warning: Known issues\n\nNone.\n', '') }), '--existing', '']);
  fails(r, /"Known issues" is missing/);
  assert.deepEqual(r.calls, []);
});

test('publish: the body is the file without line 1, with media links rewritten to the tag', () => {
  const notes = edit('- A skill.', '- A skill. ![demo](media/a.gif) and [the clip](media/b.gif).');
  const root = makeRoot({ 'v0.9.0.md': notes }, { media: ['a.gif', 'b.gif'] });
  let body = null;
  const run = (args) => { body = readFileSync(args.at(-1), 'utf8'); return ''; };
  assert.equal(cli(['publish', '--root', root, '--existing', ''], { run }).code, 0);
  const base = 'https://raw.githubusercontent.com/o/r/v0.9.0/docs/releases/media/';
  assert.ok(body.includes(`![demo](${base}a.gif)`), body);
  assert.ok(body.includes(`[the clip](${base}b.gif)`), body);
  assert.ok(!body.includes('](media/') && !body.includes(TITLE), body);
  assert.equal(body, releaseBody(notes, 'o/r', 'v0.9.0'));
  assert.equal(releaseBody('# t\n$& ![x](media/a.gif)', 'o/r', 'v1.0.0'), `$& ![x](https://raw.githubusercontent.com/o/r/v1.0.0/docs/releases/media/a.gif)`);
});

test('publish: the body file exists while gh runs and is deleted after, also when gh fails', () => {
  let seen = null;
  const ok = cli(['publish', '--root', makeRoot(), '--existing', ''], { run: (args) => { seen = args.at(-1); assert.ok(existsSync(seen)); return ''; } });
  assert.equal(ok.code, 0, ok.err);
  assert.ok(seen && realpathSync(dirname(dirname(seen))) === realpathSync(ok.tmp), seen);
  assert.equal(existsSync(seen), false);
  assert.deepEqual(readdirSync(ok.tmp), []);
  const bad = cli(['publish', '--root', makeRoot(), '--existing', ''], { run: (args) => { seen = args.at(-1); throw new Error('gh: HTTP 403'); } });
  fails(bad, /HTTP 403/);
  assert.equal(existsSync(seen), false);
  assert.deepEqual(readdirSync(bad.tmp), []);
});

test('publish: exit 2 without a repo, and without a sha outside a dry run', () => {
  const root = makeRoot();
  assert.equal(cli(['publish', '--root', root, '--existing', ''], { env: { GITHUB_SHA: SHA } }).code, 2);
  assert.equal(cli(['publish', '--root', root, '--existing', ''], { env: { GITHUB_REPOSITORY: 'o/r' } }).code, 2);
  assert.equal(cli(['publish', '--root', root, '--existing', ''], { env: { GITHUB_REPOSITORY: 'o/r', GITHUB_SHA: '' } }).code, 2);
  assert.equal(cli(['publish', '--root', root, '--existing', '', '--repo', 'not a repo']).code, 2);
  assert.equal(cli(['publish', '--root', root, '--existing', '', '--sha', 'xyz']).code, 2);
});

test('publish: a dry run with no sha prints <sha>, quotes each argument, writes no file and runs no gh', () => {
  const r = cli(['publish', '--dry-run', '--root', makeRoot(), '--existing', ''], { env: { GITHUB_REPOSITORY: 'o/r' }, run: noGh });
  assert.equal(r.code, 0, r.err);
  assert.ok(r.out.includes(`gh 'release' 'create' 'v0.9.0' '--repo' 'o/r' '--target' '<sha>' '--title' '${TITLE}' '--notes-file' '<body file>'`), r.out);
  assert.deepEqual(readdirSync(r.tmp), []);
  const quoted = cli(['publish', '--dry-run', '--root', makeRoot({ 'v0.9.0.md': edit(TITLE, "Patch 0.9.0: it's done") }), '--existing', ''], { run: noGh });
  assert.ok(quoted.out.includes(`'Patch 0.9.0: it'\\''s done'`), quoted.out);
});

test('publish: --existing "" never runs gh, also with nothing to publish', () => {
  const r = cli(['publish', '--root', makeRoot({}), '--existing', ''], { run: noGh });
  assert.equal(r.code, 0, r.err);
  assert.match(r.out, /Nothing to publish/);
});

test('child process: a dry run on a temp root, with a PATH that holds no gh', () => {
  const root = makeRoot({ 'v0.9.0.md': edit('- A skill.', '- A skill. ![demo](media/a.gif)') }, { media: ['a.gif'] });
  const r = runNode(SCRIPT, {
    args: ['publish', '--dry-run', '--root', root, '--repo', 'o/r', '--existing', ''],
    env: { PATH: tempDir('no-gh-'), GITHUB_SHA: '', GITHUB_REPOSITORY: '' },
  });
  assert.equal(r.code, 0, r.stderr);
  const from = /^Would publish v0\.9\.0 from (.+)$/m.exec(r.stdout);
  assert.ok(from, r.stdout);
  assert.equal(realpathSync(from[1]), realpathSync(join(root, 'docs', 'releases', 'v0.9.0.md')));
  assert.match(r.stdout, /^gh 'release' 'create' 'v0\.9\.0' '--repo' 'o\/r' '--target' '<sha>' /m);
  const failed = runNode(SCRIPT, { args: ['check', '--root', makeRoot({ 'notes.md': GOOD })] });
  assert.equal(failed.code, 1);
  assert.match(failed.stderr, /notes\.md: the name is not/);
});

test('the release workflow publishes on a push to main that touches docs/releases/, and nowhere else', () => {
  const yml = readFileSync(repo('.github', 'workflows', 'release.yml'), 'utf8');
  assert.match(yml, /^name: Release$/m);
  assert.match(yml, /^on:\n  push:\n    branches: \[main\]\n    paths: \['docs\/releases\/\*\*'\]\n  workflow_dispatch:\n/m);
  assert.doesNotMatch(yml, /pull_request/);
  assert.match(yml, /^permissions:\n  contents: write$/m);
  assert.match(yml, /^concurrency: release$/m);
  assert.match(yml, /^    if: github\.ref == 'refs\/heads\/main'$/m);
  assert.match(yml, /runs-on: ubuntu-latest/);
  assert.match(yml, /uses: actions\/checkout@v4\n        with:\n          persist-credentials: false/);
  assert.match(yml, /node-version: 22/);
  const check = yml.indexOf('run: node scripts/release-notes.mjs check\n');
  const publish = yml.indexOf('run: node scripts/release-notes.mjs publish\n');
  assert.ok(check > 0 && publish > check, 'check runs, then publish');
  assert.match(yml.slice(publish), /^ {8}env:\n {10}GH_TOKEN: \$\{\{ github\.token \}\}$/m);
});
