// Timing for the patterns the base-rules part of review-scope adds: the splitter that finds the paths a command names,
// and the parser of `git cat-file --batch-check` answers. Each case runs in a child process killed after 5 seconds,
// with its long input on standard input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { repo } from './helpers.mjs';

const MODULE = pathToFileURL(repo('skills', 'verification', 'review-triage', 'review-scope.mjs')).href;
const LONG = 300000;
const fill = (unit, n = LONG) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);

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

const SPLITS = [
  ['no separator', fill('a'), [fill('a')]],
  ['separators ending in a letter', fill(` \t'"\`=()[],;`) + 'x', ['x']],
  ['dots then a letter', fill('.') + 'x', [fill('.') + 'x']],
  ['a letter then dots', 'x' + fill('.'), ['x']],
  ['a letter then colons', 'x' + fill(':'), ['x']],
  ['slashes and dots', fill('./') + 'x', ['x']],
];
for (const [name, input, want] of SPLITS) {
  test(`timing: namedPaths on ${name} (${input.length} characters)`, (t) => {
    const r = timed('return [...m.namedPaths(input)];', input);
    t.diagnostic(`${r.ms} ms`);
    assert.deepEqual(r.out, want);
  });
}

test(`timing: isBlobLine on ${LONG} hex digits with no space is not a blob`, (t) => {
  const r = timed('return m.isBlobLine(input);', fill('0123456789abcdef'));
  t.diagnostic(`${r.ms} ms`);
  assert.equal(r.out, false);
});

test('isBlobLine reads a blob answer, and not a tree, a missing path or a missing path that looks like an answer', () => {
  const r = timed(`const sha = 'a'.repeat(40); return [sha + ' blob 12', sha + ' tree 3', sha + ':x/REVIEW.md missing', sha + ':x blob 1/REVIEW.md missing'].map(m.isBlobLine);`, '');
  assert.deepEqual(r.out, [true, false, false, false]);
});
