// scripts/release-notes.mjs (Q31). Roots are temp folders written from the strings in release-notes.helpers.mjs;
// gh never runs (main gets an injected run, the child process a PATH with no gh).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { compareVersions, readNotes, releaseBody, treeCounts } from '../scripts/release-notes.mjs';
import { SHA, TITLE, GOOD, edit, older, makeRoot, cli, check, checkImage, fails, noGh } from './release-notes.helpers.mjs';

const SCRIPT = repo('scripts', 'release-notes.mjs');

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
  const unicode = edit('## :sparkles: New', '## \u{2728} New').split('## :warning: Known').join('## \u{26A0}\u{FE0F} Known');
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
  for (const bad of ['1,00', '1,0000', '12,34,567', '2,']) {
    fails(check({ 'v0.9.0.md': edit('- Skills: 2', `- Skills: ${bad}`) }), new RegExp(`Counts: "Skills: ${bad}" is not a number`));
  }
  assert.equal(check({ 'v0.9.0.md': edit('- Skills: 2', '- Skills: 2 (one new)') }).code, 0);
});

test('check: a fenced ## heading is not a section, and only its own marker closes a fence', () => {
  const fenced = (open, inner, close) => ({ 'v0.9.0.md': edit('## :warning: Known issues\n\nNone.', `## :warning: Known issues\n\n${open}\n${inner}\n## :sparkles: New\n${close}`) });
  assert.equal(check(fenced('```markdown', '~~~', '```')).code, 0, 'a ~~~ inside a ``` fence');
  assert.equal(check(fenced('~~~~', '~~~', '~~~~')).code, 0, 'a shorter ~~~ inside a ~~~~ fence');
  fails(check(fenced('', '', '')), /the section "New" appears twice/);
});

test('check: line 1 is the title with the file version and no shortcode or emoji', () => {
  fails(check({ 'v0.9.0.md': edit(`# ${TITLE}`, '# Patch 0.9.1: batch 20') }), /line 1 must be "# <title>" with the version 0\.9\.0/);
  fails(check({ 'v0.9.0.md': edit(`# ${TITLE}`, `Intro\n# ${TITLE}`) }), /line 1 must be/);
  fails(check({ 'v0.9.0.md': edit(`# ${TITLE}`, `# :tada: ${TITLE}`) }), /the title holds a shortcode or an emoji/);
  fails(check({ 'v0.9.0.md': edit(`# ${TITLE}`, `# ${TITLE} \u{1F389}`) }), /the title holds a shortcode or an emoji/);
});

test('check: images only as ![...](media/<name>) with the file in docs/releases/media/', () => {
  assert.equal(checkImage('![demo](media/a.gif)').code, 0);
  fails(checkImage('![demo](https://example.com/a.gif)'), /image target "https:\/\/example\.com\/a\.gif" is not media\/<name>/);
  fails(checkImage('![demo](../media/a.gif)'), /image target "\.\.\/media\/a\.gif"/);
  fails(checkImage('![a [nested] alt](https://example.com/a.gif)'), /image target "https:/);
  fails(checkImage('![demo](media/missing.gif)'), /docs\/releases\/media\/missing\.gif does not exist/);
  fails(checkImage('![demo][r]\n\n[r]: https://example.com/a.gif'), /reference-style image/);
  fails(checkImage('![demo]\n\n[demo]: ../a.gif'), /reference-style image/);
});

test('check: the image scan reads the whole text, so no outside URL slips through', () => {
  assert.equal(checkImage('![demo](media/a.gif) and \\![not an image](https://example.com/a.gif)').code, 0, 'control');
  fails(checkImage('![wrapped\nalt](https://example.com/a.gif)'), /^docs\/releases\/v0\.9\.0\.md:9: image "!\[wrapped" is not !\[<alt>\]\(media\/<name>\)/m);
  fails(checkImage('![a [b [c]] d](https://example.com/a.gif)'), /image target "https:\/\/example\.com\/a\.gif"/);
  const label = checkImage('![My  Demo]\n\n[my demo]: https://example.com/a.gif');
  fails(label, /image "!\[My {2}Demo\]" is not/);
  fails(label, /:11: reference definition \[my demo\] points at "https:\/\/example\.com\/a\.gif", outside media\//);
  fails(checkImage('Quote:\n\n>  > [demo]: https://example.com/a.gif'), /reference definition \[demo\] points at "https:/);
  fails(checkImage('[demo]:\n  <https://example.com/a.gif>'), /reference definition \[demo\] points at "https:/);
  assert.equal(checkImage('[clip]: media/a.gif').code, 0, 'a definition of a media file is fine');
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

test('the template in docs/RELEASES.md passes check', () => {
  const fence = /^```markdown\n([\s\S]*?)^```$/m.exec(readFileSync(repo('docs', 'RELEASES.md'), 'utf8'));
  assert.ok(fence, 'docs/RELEASES.md has a markdown fence');
  const version = /^# Patch (\d+\.\d+\.\d+):/.exec(fence[1])[1];
  assert.deepEqual(readNotes(fence[1], { version }).problems, []);
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
  const r = cli(['publish', '--root', makeRoot()], { run: () => { throw new Error('gh: not logged in'); } });
  fails(r, /not logged in/);
  assert.equal(r.calls.length, 1);
});

test('publish: plans with injected existing tags, and creates only the file with no release', () => {
  const root = makeRoot({ 'v0.8.0.md': older, 'v0.9.0.md': GOOD });
  const r = cli(['publish', '--root', root, '--existing', 'v0.8.0']);
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.creates.map((a) => a[2]), ['v0.9.0']);
  const none = cli(['publish', '--root', root, '--existing', 'v0.8.0,v0.9.0'], { run: noGh });
  assert.equal(none.code, 0, none.err);
  assert.match(none.out, /Nothing to publish/);
});

test('publish: the argv list, with --repo and --sha given, after the tag lookup', () => {
  const r = cli(['publish', '--root', makeRoot(), '--repo', 'me/x', '--sha', SHA, '--existing', ''], { env: {} });
  assert.equal(r.code, 0, r.err);
  const file = r.creates[0].at(-1);
  assert.deepEqual(r.calls, [['api', 'repos/me/x/git/ref/tags/v0.9.0', '--jq', '.object.sha'],
    ['release', 'create', 'v0.9.0', '--repo', 'me/x', '--target', SHA, '--title', TITLE, '--notes-file', file]]);
  assert.match(r.out, /Published v0\.9\.0/);
});

test('publish: without --existing the released tags come from gh api', () => {
  const r = cli(['publish', '--root', makeRoot({ 'v0.8.0.md': older, 'v0.9.0.md': GOOD })], { list: 'v0.8.0\n' });
  assert.equal(r.code, 0, r.err);
  assert.deepEqual(r.calls[0], ['api', 'repos/o/r/releases', '--paginate', '--jq', '.[].tag_name']);
  assert.deepEqual(r.creates.map((a) => a[2]), ['v0.9.0']);
});

test('publish: a tag that exists goes ahead only when it points at the sha', () => {
  const pub = (opts, dry = []) => cli(['publish', '--root', makeRoot(), ...dry], opts);
  assert.deepEqual(pub({ tagSha: SHA }).creates.map((a) => a[6]), [SHA]);
  const other = pub({ tagSha: 'b2'.repeat(20) });
  fails(other, /tag v0\.9\.0 already exists at b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2b2, not at a1a1/);
  assert.deepEqual(other.creates, []);
  const broken = pub({ run: (a) => { if (a[1].endsWith('/releases')) return ''; throw new Error('gh: HTTP 500'); } });
  fails(broken, /looking up tag v0\.9\.0 failed: gh: HTTP 500/);
  assert.deepEqual(broken.creates, []);
  fails(pub({ tagSha: SHA, env: { GITHUB_REPOSITORY: 'o/r' } }, ['--dry-run']), /tag v0\.9\.0 already exists/);
  assert.equal(pub({ run: noGh }, ['--dry-run', '--existing', '']).code, 0, 'a dry run with --existing skips the lookup');
});

test('publish: a Skills count that does not match the tree creates nothing', () => {
  const r = cli(['publish', '--root', makeRoot({ 'v0.9.0.md': edit('- Skills: 2', '- Skills: 3') }), '--existing', '']);
  fails(r, /Skills: 3 in Counts, but the tree has 2/);
  assert.doesNotMatch(r.err, /older notes file/);
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
  assert.match(r.err, /Nothing was published\. An older notes file with no release must first be released by hand/);
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
  const create = (args) => { body = readFileSync(args.at(-1), 'utf8'); return ''; };
  assert.equal(cli(['publish', '--root', root, '--existing', ''], { create }).code, 0);
  const base = 'https://raw.githubusercontent.com/o/r/v0.9.0/docs/releases/media/';
  assert.ok(body.includes(`![demo](${base}a.gif)`), body);
  assert.ok(body.includes(`[the clip](${base}b.gif)`), body);
  assert.ok(!body.includes('](media/') && !body.includes(TITLE), body);
  assert.equal(body, releaseBody(notes, 'o/r', 'v0.9.0'));
  assert.equal(releaseBody('# t\n$& ![x](media/a.gif)', 'o/r', 'v1.0.0'), `$& ![x](https://raw.githubusercontent.com/o/r/v1.0.0/docs/releases/media/a.gif)`);
});

test('publish: the body file exists while gh runs and is deleted after, also when gh fails', () => {
  let seen = null;
  const ok = cli(['publish', '--root', makeRoot(), '--existing', ''], { create: (args) => { seen = args.at(-1); assert.ok(existsSync(seen)); return ''; } });
  assert.equal(ok.code, 0, ok.err);
  assert.ok(seen && realpathSync(dirname(dirname(seen))) === realpathSync(ok.tmp), seen);
  assert.equal(existsSync(seen), false);
  assert.deepEqual(readdirSync(ok.tmp), []);
  const bad = cli(['publish', '--root', makeRoot(), '--existing', ''], { create: (args) => { seen = args.at(-1); throw new Error('gh: HTTP 403'); } });
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
  for (const sha of ['xyz', 'abc1234', `${SHA}0`, 'g'.repeat(40)]) assert.equal(cli(['publish', '--root', root, '--existing', '', '--sha', sha]).code, 2, sha);
  assert.equal(cli(['publish', '--root', root, '--existing', ''], { env: { GITHUB_REPOSITORY: 'o/r', GITHUB_SHA: 'abc1234' } }).code, 2);
});

test('publish: a dry run with no sha prints <sha>, quotes each argument, writes no file and runs no gh', () => {
  const r = cli(['publish', '--dry-run', '--root', makeRoot(), '--existing', ''], { env: { GITHUB_REPOSITORY: 'o/r' }, run: noGh });
  assert.equal(r.code, 0, r.err);
  const line = `gh 'release' 'create' 'v0.9.0' '--repo' 'o/r' '--target' '<sha>' '--title' '${TITLE}' '--notes-file' '<body file>'`;
  assert.ok(r.out.includes(`${line}\n${releaseBody(GOOD, 'o/r', 'v0.9.0')}`), r.out);
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
  assert.ok(r.stdout.includes('![demo](https://raw.githubusercontent.com/o/r/v0.9.0/docs/releases/media/a.gif)'), r.stdout);
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
