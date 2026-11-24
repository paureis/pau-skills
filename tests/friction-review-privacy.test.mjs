// friction-review's friction.mjs prints pointers, never content: every printed string is redacted and then cut, the
// encoded home folder is shown as ~, a tool result's body is never printed, a refusal prints only its class, and a
// target is printed only for the tools whose input field is a path, a command, a pattern, a URL or a query.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { step, bash, world } from './friction-review.helpers.mjs';
import { encodeProjectPath } from '../skills/session-discipline/friction-review/mine-transcripts.mjs';
import { show, hideEncodedHome } from '../skills/session-discipline/friction-review/friction-show.mjs';

// Built at runtime so that no tracked file holds a machine path or a secret shape.
const TOKEN = ['sk', 'abcdefghijklmnopqrstuvwxyz0123456789'].join('-');
const OTHER_HOME = ['', 'home', 'ana', 'notes.txt'].join('/');
const ENCODED_OTHER = ['', 'home', 'ana', 'src', 'app'].join('-');
const EMAIL = ['dev', 'example.com'].join('@');

// One failing call per case, so each case has its own pointer under the "other" failure class.
function privacy() {
  const w = world();
  const home = encodeProjectPath(w.home);
  const cases = {
    token: bash(`curl -H "Authorization: Bearer ${TOKEN}" https://example.org`, 'Exit code 22\nfirst failure line', { isError: true }),
    email: bash(`git log --author=${EMAIL}`, 'Exit code 1\nsecond failure line', { isError: true }),
    home: step('Read', { file_path: join(w.home, 'notes', 'a.txt') }, '<tool_use_error>third failure line</tool_use_error>', { isError: true }),
    other: bash(`cat ${OTHER_HOME}`, 'Exit code 1\nfourth failure line', { isError: true }),
    encoded: bash(`ls ${home}-src-app/memory`, 'Exit code 1\nfifth failure line', { isError: true }),
    encodedOther: bash(`ls ${ENCODED_OTHER}/memory`, `Exit code 1\nsixth failure line in ${ENCODED_OTHER}`, { isError: true }),
    failure: bash('make deploy', `Exit code 2\nerror: token ${TOKEN} for ${EMAIL} in ${OTHER_HOME}\nBODYMARK second line of the body`, { isError: true }),
  };
  for (const [id, pair] of Object.entries(cases)) w.session(w.own, id, [pair]);
  return { w, home };
}

const pointers = (stdout) => stdout.split('\n').filter((l) => l.startsWith('  '));

test('each target and failure line is redacted: a token, an email, a home path and an encoded home folder', () => {
  const { w, home } = privacy();
  // The fixture holds the raw strings, so the checks below would see them if nothing were redacted.
  const raw = ['token', 'email', 'home', 'other', 'encoded', 'encodedOther'].map((id) => readFileSync(join(w.own, `${id}.jsonl`), 'utf8')).join('\n');
  for (const s of [TOKEN, EMAIL, w.home, OTHER_HOME, `${home}-src-app`, ENCODED_OTHER]) assert.ok(raw.includes(s), s);
  const seen = {};
  for (const id of ['token', 'email', 'home', 'other', 'encoded', 'encodedOther']) {
    const r = w.run('--session', id);
    assert.equal(r.code, 0, r.stderr);
    seen[id] = pointers(r.stdout).join('\n');
    assert.doesNotMatch(r.stdout, new RegExp([TOKEN, EMAIL, w.home, OTHER_HOME, home, ENCODED_OTHER, 'ana'].map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')));
  }
  assert.match(seen.token, /Bash curl -H "Authorization: Bearer \[secret\]" https:\/\/example\.org failed: first failure line/);
  assert.match(seen.email, /Bash git log --author=\[email\] failed: second failure line/);
  assert.match(seen.home, /Read ~\/notes\/a\.txt failed: third failure line/);
  assert.match(seen.other, /Bash cat ~\/notes\.txt failed: fourth failure line/);
  assert.match(seen.encoded, /Bash ls ~-src-app\/memory failed: fifth failure line/);
  assert.match(seen.encodedOther, /Bash ls ~-src-app\/memory failed: sixth failure line in ~-src-app/);
});

test('a failure prints only its first line, redacted and then cut, never the rest of the body', () => {
  const { w } = privacy();
  const r = w.run('--session', 'failure');
  assert.equal(r.code, 0, r.stderr);
  assert.match(r.stdout, /Bash make deploy failed: error: token \[secret\] for \[email\] in ~\/notes\.txt$/m);
  assert.doesNotMatch(r.stdout, /BODYMARK/);
  const long = world();
  long.session(long.own, 'long', [bash('make x', `Exit code 1\n${'e'.repeat(300)}`, { isError: true })]);
  const cut = long.run();
  assert.match(cut.stdout, new RegExp(`failed: ${'e'.repeat(120)}\\.\\.\\.$`, 'm'));
});

test('no result body is printed, and a refusal prints its class only', () => {
  const w = world();
  w.session(w.own, 's', [
    bash('cat big.log', `BODYMARK ${'y'.repeat(30000)}`),
    step('Grep', { pattern: 'p' }, 'BODYMARK in a.js'),
    step('Edit', { file_path: 'a.js', old_string: 'a', new_string: 'b' }, "The user doesn't want to proceed with this tool use. The tool use was rejected. REFUSALMARK", { isError: true }),
    bash('rm -rf x', 'Permission to use Bash with command rm -rf x has been denied. REFUSALMARK', { isError: true }),
    bash('git push', 'PreToolUse:Bash hook blocked this command: REFUSALMARK', { isError: true }),
  ]);
  const r = w.run();
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /BODYMARK|REFUSALMARK|doesn't want|has been denied|hook blocked/);
  assert.match(r.stdout, /^failed calls, refused: 3 in 1 of 1 session$/m);
  assert.match(r.stdout, /^ {2}~-src-app\/s\.jsonl:\d+ Edit a\.js refused$/m);
  assert.match(r.stdout, /^ {2}~-src-app\/s\.jsonl:\d+ Bash rm -rf x refused$/m);
});

test('the target is printed only for the listed tools, never the input of any other tool', () => {
  const w = world();
  w.session(w.own, 's', [
    // The control: a listed tool, whose target is printed. Only the first three pointers of a signal are printed.
    step('WebSearch', { query: 'WEBMARK' }, 'search failed', { isError: true }),
    step('Agent', { subagent_type: 'reviewer', description: 'DESCMARK', prompt: 'PROMPTMARK' }, 'Exit code 1\nagent failed', { isError: true }),
    step('mcp__tracker__search', { query: 'MCPMARK' }, 'tool failed', { isError: true }),
  ]);
  w.session(w.own, 't', [step('Skill', { skill: 'SKILLMARK' }, 'skill failed', { isError: true })], { ageMin: 2 * 24 * 60 });
  const r = w.run();
  assert.equal(r.code, 0, r.stderr);
  assert.doesNotMatch(r.stdout, /DESCMARK|PROMPTMARK|MCPMARK|SKILLMARK|reviewer/);
  assert.match(r.stdout, /^ {2}~-src-app\/s\.jsonl:\d+ Agent failed: agent failed$/m);
  assert.match(r.stdout, /^ {2}~-src-app\/s\.jsonl:\d+ mcp__tracker__search failed: tool failed$/m);
  assert.match(r.stdout, /^ {2}~-src-app\/s\.jsonl:\d+ WebSearch WEBMARK failed: search failed$/m);
  const skill = w.run('--session', 't');
  assert.doesNotMatch(skill.stdout, /SKILLMARK/);
  assert.match(skill.stdout, /^ {2}~-src-app\/t\.jsonl:\d+ Skill failed: skill failed$/m);
});

test('show redacts first and cuts after; the encoded home folder becomes ~', () => {
  // Cut first, the token would be cut short of its shape and printed in part.
  const text = `${'x'.repeat(70)} ${TOKEN}`;
  assert.equal(show(text), `${'x'.repeat(70)} [secret]`);
  assert.equal(hideEncodedHome('ls -home-ana-src-app and -Users-bo-x', '/nowhere'), 'ls ~-src-app and ~-x');
  assert.equal(hideEncodedHome('a-home-page', '/nowhere'), 'a-home-page');
  assert.equal(hideEncodedHome('in -srv-me-app', '/srv/me'), 'in ~-app');
});
