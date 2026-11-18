// Timing for the patterns review-scope uses to read a diff and match a glob. Each case runs in a child process that is
// killed after 5 seconds, with its long input on standard input: a regex that blocks the thread cannot be stopped by
// node:test's own timeout, and one argument over 131,072 bytes fails to spawn on Linux.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { repo } from './helpers.mjs';

const MODULE = pathToFileURL(repo('skills', 'verification', 'review-triage', 'review-scope.mjs')).href;
const LONG = 300000;
const fill = (unit, n = LONG) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);

/** Run `body` (which sees `input` and the module as `m`) in a child; returns what it prints and the time it took. */
function timed(body, input) {
  const code = `import * as m from ${JSON.stringify(MODULE)};
let input = ''; process.stdin.setEncoding('utf8');
for await (const c of process.stdin) input += c;
const t0 = performance.now(); const out = (() => { ${body} })();
console.log(JSON.stringify({ out, ms: Math.round(performance.now() - t0) }));`;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', code], { input, encoding: 'utf8', timeout: 5000 });
  assert.equal(r.error, undefined, 'killed by the timeout');
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

const DIFFS = [
  ['a hunk header that never closes', '+++ b/x\n@@ -' + fill('1')],
  ['a hunk header with a count that never closes', '+++ b/x\n@@ -1,' + fill('2')],
  ['a quoted path that never closes', '+++ "b/' + fill('\\')],
  ['a long quoted path of escapes', '+++ "b/' + fill('\\') + '"'],
  ['file headers with no hunk', fill('+++ b/')],
  ['a path with a space and its tab', '+++ b/' + fill('a ') + '\t\n'],
];
for (const [name, input] of DIFFS) {
  test(`timing: parseAddedLines on ${name} (${input.length} characters) finds no added line`, (t) => {
    const r = timed('return m.parseAddedLines(input).size;', input);
    t.diagnostic(`${r.ms} ms`);
    assert.equal(r.out, 0);
  });
}

test('timing: a glob of repeated **/ on a long path that does not match', (t) => {
  const r = timed(`return m.anyMatch(['**/**/**/**/**/y'])(input);`, fill('a/'));
  t.diagnostic(`${r.ms} ms`);
  assert.equal(r.out, false);
});
