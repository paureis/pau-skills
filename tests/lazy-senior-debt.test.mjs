// lazy-senior's debt.mjs lists every `shortcut:` comment in the files git lists (tracked, plus untracked files no ignore
// rule matches) as `<file>:<line>: <text>`, tags a row with no upgrade trigger, and ends with a count. A marker counts
// only after a comment opener, so prose, inline code and string literals that mention the convention stay out.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync, symlinkSync, realpathSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { findMarker, hasTrigger, scanText, ledger, MAX_BYTES } from '../skills/planning/lazy-senior/debt.mjs';

const DEBT = repo('skills', 'planning', 'lazy-senior', 'debt.mjs');
const BOM = String.fromCharCode(0xfeff);
const BT = String.fromCharCode(96);
const git = (cwd, ...args) => execFileSync('git', ['-c', 'user.email=a@example.com', '-c', 'user.name=a',
  '-c', 'commit.gpgsign=false', '-c', 'core.autocrlf=false', ...args], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
const put = (dir, file, text) => {
  mkdirSync(dirname(join(dir, file)), { recursive: true });
  writeFileSync(join(dir, file), text);
};
const lines = (r) => r.stdout.split('\n').slice(0, -1);

test('findMarker: a marker after each comment opener, with the closer cut off', () => {
  const cases = [
    ['# shortcut: a, b', 'a, b'],
    ['    // shortcut: a, b', 'a, b'],
    ['/// shortcut: a', 'a'],
    ['//! shortcut: a', 'a'],
    ['## shortcut: a', 'a'],
    ['#! shortcut: a', 'a'],
    ['#= shortcut: a, b =#', 'a, b'],
    ['/* shortcut: a, b */', 'a, b'],
    ['/** shortcut: a */', 'a'],
    ['/*! shortcut: a */', 'a'],
    ['-- shortcut: a', 'a'],
    ['--- shortcut: a', 'a'],
    ['--[[ shortcut: a, b ]]', 'a, b'],
    ['; shortcut: a', 'a'],
    [';; shortcut: a', 'a'],
    ['% shortcut: a', 'a'],
    ['<!-- shortcut: a, b -->', 'a, b'],
    ['{- shortcut: a, b -}', 'a, b'],
    ['(* shortcut: a, b *)', 'a, b'],
    ['REM shortcut: a', 'a'],
    ['rem shortcut: a', 'a'],
    ['Rem shortcut: a', 'a'],
    ['@rem shortcut: a', 'a'],
    ['{/* shortcut: a, b */}', 'a, b'],
    ['{# shortcut: a, b #}', 'a, b'],
    ['<%# shortcut: a, b %>', 'a, b'],
    ['{{!-- shortcut: a, b --}}', 'a, b'],
    ['x = 1  # shortcut: after code', 'after code'],
    ['x = 1\t#\tshortcut:\ttabs', 'tabs'],
    [' * shortcut: inside a block comment', 'inside a block comment'],
    ['*\tshortcut: a', 'a'],
    ['#shortcut: no space after the opener', 'no space after the opener'],
    ['# shortcut:', ''],
    ['// keyboard shortcut: Ctrl+S, then // shortcut: the second one counts', 'the second one counts'],
  ];
  for (const [line, text] of cases) assert.equal(findMarker(line), text, line);
});

test('findMarker: prose, inline code, string literals and look-alikes are not markers', () => {
  const misses = [
    'Mark a limit with a shortcut: comment.',
    'shortcut: at the start of a line',
    '// keyboard shortcut: Ctrl+S',
    '# Shortcut: capital S',
    "'# shortcut: x, y'",
    '"// shortcut: x, y"',
    "const s = 'shortcut: x';",
    `const t = ${BT}// shortcut: x, y${BT};`,
    `Write ${BT}# shortcut: x${BT} in code.`,
    'q = x# shortcut: glued to code',
    'lorem shortcut: ends in rem',
    'a * shortcut: a star that is not first',
    'x## shortcut: x',
    'see http://example.com// shortcut: x',
    `${BOM}# shortcut: a byte order mark is not punctuation`,
    '###############// shortcut: a word of 17 characters',
  ];
  for (const line of misses) assert.equal(findMarker(line), null, line);
  assert.equal(findMarker('##############// shortcut: a word of 16 characters', false), 'a word of 16 characters');
});

test('findMarker: in prose files only an HTML comment counts', () => {
  assert.equal(findMarker('## shortcut: comments', true), null);
  assert.equal(findMarker('* shortcut: a bullet', true), null);
  assert.equal(findMarker('# shortcut: a, b', true), null);
  assert.equal(findMarker('<!-- shortcut: a, b -->', true), 'a, b');
});

test('hasTrigger: a second part after the first comma or semicolon, not a comma between digits', () => {
  assert.equal(hasTrigger('in memory, move to a store when we run two servers'), true);
  assert.equal(hasTrigger('no retry; add one when the API flakes'), true);
  assert.equal(hasTrigger('1,000 rows max, page it past that'), true);
  assert.equal(hasTrigger('linear search, use a map past 10'), true);
  assert.equal(hasTrigger('1,000 rows max'), false);
  assert.equal(hasTrigger('one process only'), false);
  assert.equal(hasTrigger('trailing comma,'), false);
  assert.equal(hasTrigger('only punctuation after it, ...'), false);
  assert.equal(hasTrigger(''), false);
  assert.equal(hasTrigger('max 100, page past that'), true);
  assert.equal(hasTrigger('small pool, 64'), true);
});

test('findMarker: a closer is cut only after the opener it belongs to', () => {
  assert.equal(findMarker('# shortcut: arr[i[j]], fix when x'), 'arr[i[j]], fix when x');
  assert.equal(findMarker('% shortcut: 50%> budget, revisit'), '50%> budget, revisit');
  assert.equal(findMarker('// shortcut: a */ b, c'), 'a */ b, c');
  assert.equal(findMarker('-- shortcut: x -}, y =# #}'), 'x -}, y =# #}');
  assert.equal(findMarker(' * shortcut: a, b */'), 'a, b');
  assert.equal(findMarker('{{!-- shortcut: a, b --}}'), 'a, b');
});

test('scanText: line numbers survive CRLF and a byte order mark, and no carriage return is kept', () => {
  assert.deepEqual(scanText(`${BOM}# shortcut: a, b\r\nx\r\n/* shortcut: c */\r\n`, 'f.py'),
    [{ line: 1, text: 'a, b' }, { line: 3, text: 'c' }]);
  assert.deepEqual(scanText('<!-- shortcut: a, b -->\n# shortcut: c\n', 'README.md'), [{ line: 1, text: 'a, b' }]);
  for (const ext of ['md', 'markdown', 'mdx', 'rst', 'adoc', 'MD']) {
    assert.deepEqual(scanText('# shortcut: c\n', `notes.${ext}`), [], ext);
  }
  assert.deepEqual(scanText('# shortcut: c\n', 'requirements.txt'), [{ line: 1, text: 'c' }]);
  assert.deepEqual(scanText('x\r# shortcut: a, b\r\ry\r# shortcut: c\r', 'old.py'),
    [{ line: 2, text: 'a, b' }, { line: 5, text: 'c' }]);
});

// The main fixture: every opener style across many languages, the cases that must not count, ignored files, an
// untracked file, a deleted tracked file, a submodule, a binary file and CRLF line endings.
function fixture() {
  const dir = tempDir();
  git(dir, 'init', '-q');
  put(dir, '.gitignore', 'build/\n');
  put(dir, 'build/out.py', '# shortcut: in an ignored folder, never listed\n');
  put(dir, 'nested/.gitignore', 'local.py\n');
  put(dir, 'nested/local.py', '# shortcut: ignored by a nested rule, never listed\n');
  put(dir, 'app.py', [
    'import os',
    '# shortcut: reads the whole file, stream it when files pass 1 GB',
    'total = 0  # shortcut: one process only',
    "'# shortcut: x, y'",
    'print("# shortcut: in a string, never")',
    '# Shortcut: capital S, never',
    'q = x# shortcut: glued to code, never',
    '',
  ].join('\n'));
  put(dir, 'main.js', [
    '// shortcut: in-memory cache, move it to a shared store when we run two servers',
    'const k = "// shortcut: x, y";',
    '// keyboard shortcut: Ctrl+S',
    "const s = 'shortcut: x';",
    `const t = ${BT}// shortcut: x, y${BT};`,
    '/** shortcut: no retry; add one if the API starts to fail */',
    '',
  ].join('\n'));
  put(dir, 'lib.c', '/* shortcut: fixed 64-byte buffer, grow it when names get longer */\n/*\n * shortcut: single thread, add a lock before a second worker\n */\n');
  put(dir, 'src/lib.rs', '/// shortcut: linear search, use a map past 1,000 items\n//! shortcut: no async\n');
  put(dir, 'query.sql', 'SELECT 1; -- shortcut: no index, add one when the table is big\n-- shortcut: 1,000 rows max\n');
  put(dir, 'init.lua', '--[[ shortcut: global state, move to a module when a second script needs it ]]\n--- shortcut: polling, switch to events if it costs CPU\n');
  put(dir, 'core.lisp', ';; shortcut: lists, switch to vectors when a profile shows it\n');
  put(dir, 'paper.tex', '% shortcut: one column, two when the venue asks\n');
  put(dir, 'page.html', '<p>Save with the keyboard shortcut: Ctrl+S</p>\n<!-- shortcut: inline styles, move them to a stylesheet when a second page needs them -->\n');
  put(dir, 'view.hbs', '{{!-- shortcut: no escaping helper, add one when users write HTML --}}\n');
  put(dir, 'Main.hs', '{- shortcut: String, use Text if input grows -}\n');
  put(dir, 'calc.ml', '(* shortcut: floats, use a decimal type before it handles money *)\n');
  put(dir, 'build.bat', 'REM shortcut: Windows only, port it when CI runs on Linux\nrem shortcut: no logging\n@rem shortcut: fixed path, read it from the environment when a second machine runs it\n');
  put(dir, 'solve.jl', '#= shortcut: dense matrix, go sparse past 10,000 rows =#\n');
  put(dir, 'page.jinja', '{# shortcut: no pagination, add it past 100 items #}\n');
  put(dir, 'show.erb', '<%# shortcut: one query per row, preload when lists get long %>\n');
  put(dir, 'App.jsx', 'export const App = () => (\n  <div>\n    {/* shortcut: a, b */}\n  </div>\n);\n');
  put(dir, 'README.md', [
    'Mark a limit with a shortcut: comment.',
    `Write ${BT}// shortcut: the limit, the trigger${BT} in code.`,
    '## shortcut: comments',
    '* shortcut: a bullet',
    '<!-- shortcut: the docs cover Linux only, add macOS when someone asks -->',
    'Shortcut: capital S is not a marker.',
    '',
  ].join('\n'));
  put(dir, 'requirements.txt', 'requests==2.32.3  # shortcut: pinned, unpin when the API settles\n');
  put(dir, 'mac.py', '# shortcut: old Mac line ends, x\rx = 1\r# shortcut: line 3\r');
  put(dir, 'win.cs', '// shortcut: no retries, add them when the network fails\r\nint x;\r\n/* shortcut: sync only, go async under load */\r\n// shortcut: one tenant\r\n');
  put(dir, 'bom.py', `${BOM}# shortcut: a byte order mark first, still line 1\n`);
  put(dir, 'empty.sh', '# shortcut:\n');
  // The NUL bytes sit on a line of their own, so only the NUL check keeps the marker on line 2 out.
  writeFileSync(join(dir, 'blob.bin'), Buffer.from('\0\0\n# shortcut: in a binary file, never\n'));
  put(dir, 'gone.py', '# shortcut: deleted from disk, never\n');
  const sub = join(dir, 'vendor', 'lib');
  mkdirSync(sub, { recursive: true });
  git(sub, 'init', '-q');
  put(sub, 'x.py', '# shortcut: inside a submodule, never\n');
  git(sub, 'add', 'x.py');
  git(sub, 'commit', '-qm', 'sub');
  git(dir, 'add', '.');
  rmSync(join(dir, 'gone.py'));
  put(dir, 'later.rb', 'x = 1 # shortcut: untracked, listed while no ignore rule matches it\n');
  return dir;
}

const EXPECTED = [
  'App.jsx:3: a, b',
  'Main.hs:1: String, use Text if input grows',
  'README.md:5: the docs cover Linux only, add macOS when someone asks',
  'app.py:2: reads the whole file, stream it when files pass 1 GB',
  'app.py:3: one process only [no-trigger]',
  'bom.py:1: a byte order mark first, still line 1',
  'build.bat:1: Windows only, port it when CI runs on Linux',
  'build.bat:2: no logging [no-trigger]',
  'build.bat:3: fixed path, read it from the environment when a second machine runs it',
  'calc.ml:1: floats, use a decimal type before it handles money',
  'core.lisp:1: lists, switch to vectors when a profile shows it',
  'empty.sh:1: [no-trigger]',
  'init.lua:1: global state, move to a module when a second script needs it',
  'init.lua:2: polling, switch to events if it costs CPU',
  'later.rb:1: untracked, listed while no ignore rule matches it',
  'lib.c:1: fixed 64-byte buffer, grow it when names get longer',
  'lib.c:3: single thread, add a lock before a second worker',
  'mac.py:1: old Mac line ends, x',
  'mac.py:3: line 3 [no-trigger]',
  'main.js:1: in-memory cache, move it to a shared store when we run two servers',
  'main.js:6: no retry; add one if the API starts to fail',
  'page.html:2: inline styles, move them to a stylesheet when a second page needs them',
  'page.jinja:1: no pagination, add it past 100 items',
  'paper.tex:1: one column, two when the venue asks',
  'query.sql:1: no index, add one when the table is big',
  'query.sql:2: 1,000 rows max [no-trigger]',
  'requirements.txt:1: pinned, unpin when the API settles',
  'show.erb:1: one query per row, preload when lists get long',
  'solve.jl:1: dense matrix, go sparse past 10,000 rows',
  'src/lib.rs:1: linear search, use a map past 1,000 items',
  'src/lib.rs:2: no async [no-trigger]',
  'view.hbs:1: no escaping helper, add one when users write HTML',
  'win.cs:1: no retries, add them when the network fails',
  'win.cs:3: sync only, go async under load',
  'win.cs:4: one tenant [no-trigger]',
  '35 markers, 7 with no trigger.',
];

test('the ledger of a fixture repository: every row, sorted by path and line, and the summary', () => {
  const dir = fixture();
  const r = runNode(DEBT, { args: [dir] });
  assert.equal(r.stderr, '');
  assert.equal(r.code, 0);
  assert.deepEqual(lines(r), EXPECTED);
  assert.doesNotMatch(r.stdout, /\r/);
});

test('the folder defaults to the current folder', () => {
  const dir = fixture();
  const r = runNode(DEBT, { cwd: dir });
  assert.equal(r.code, 0);
  assert.deepEqual(lines(r), EXPECTED);
});

test('one marker is "1 marker"; a clean repository says so', () => {
  const dir = tempDir();
  git(dir, 'init', '-q');
  put(dir, 'a.py', 'x = 1\n# a note\n');
  git(dir, 'add', '.');
  let r = runNode(DEBT, { args: [dir] });
  assert.equal(r.code, 0);
  assert.deepEqual(lines(r), ['No shortcut markers.']);
  put(dir, 'b.py', '# shortcut: one, two\n');
  r = runNode(DEBT, { args: [dir] });
  assert.deepEqual(lines(r), ['b.py:1: one, two', '1 marker, 0 with no trigger.']);
});

test('a file in a merge conflict is listed once, though git lists it once per stage', () => {
  const dir = tempDir();
  git(dir, 'init', '-q');
  put(dir, 'c.py', 'x = 1\n');
  git(dir, 'add', 'c.py');
  git(dir, 'commit', '-qm', 'one');
  const first = git(dir, 'rev-parse', '--abbrev-ref', 'HEAD').trim();
  git(dir, 'checkout', '-qb', 'other');
  put(dir, 'c.py', '# shortcut: other side, when y\n');
  git(dir, 'commit', '-qam', 'two');
  git(dir, 'checkout', '-q', first);
  put(dir, 'c.py', '# shortcut: main side, when x\n');
  git(dir, 'commit', '-qam', 'three');
  assert.throws(() => git(dir, 'merge', 'other'));
  assert.equal(git(dir, 'ls-files', '-co', '--exclude-standard').split('\n').filter((l) => l === 'c.py').length, 3);
  const r = runNode(DEBT, { args: [dir] });
  assert.equal(r.code, 0);
  assert.deepEqual(lines(r), ['c.py:2: main side, when x', 'c.py:4: other side, when y', '2 markers, 0 with no trigger.']);
});

test('a symlink is skipped, even to a file with a marker',
  { skip: process.platform === 'win32' ? 'symlinks need extra rights on Windows' : false }, () => {
    const dir = tempDir();
    const outside = tempDir();
    git(dir, 'init', '-q');
    put(outside, 'target.py', '# shortcut: behind a symlink, never\n');
    put(dir, 'a.py', '# shortcut: the real file, x\n');
    symlinkSync(join(outside, 'target.py'), join(dir, 'link.py'));
    symlinkSync(join(dir, 'a.py'), join(dir, 'same.py')); // inside the folder: the file is listed once, not twice
    git(dir, 'add', '.');
    const r = runNode(DEBT, { args: [dir] });
    assert.equal(r.stderr, '');
    assert.equal(r.code, 0);
    assert.deepEqual(lines(r), ['a.py:1: the real file, x', '1 marker, 0 with no trigger.']);
  });

const POSIX = { skip: process.platform === 'win32' ? 'needs symlinks and newlines in file names' : false };

test('a tracked file whose parent folder became a symlink is not read from outside the folder', POSIX, () => {
  const dir = tempDir();
  const outside = tempDir();
  git(dir, 'init', '-q');
  put(dir, 'sub/a.py', 'x = 1\n');
  git(dir, 'add', '.');
  rmSync(join(dir, 'sub'), { recursive: true });
  put(outside, 'a.py', '# shortcut: outside the work tree, never\n');
  symlinkSync(outside, join(dir, 'sub'));
  const r = runNode(DEBT, { args: [dir] });
  assert.equal(r.code, 0);
  assert.deepEqual(lines(r), ['No shortcut markers.']);
});

test('control characters in a path or a marker are escaped, so a file name cannot forge a row', POSIX, () => {
  const dir = tempDir();
  const ESC = String.fromCharCode(27);
  git(dir, 'init', '-q');
  put(dir, 'a\nb.py:9: forged.py', `# shortcut: ${ESC}[31mred${ESC}[0m,\tlater\n`);
  git(dir, 'add', '.');
  const r = runNode(DEBT, { args: [dir] });
  assert.equal(r.code, 0);
  assert.deepEqual(lines(r), ['a\\nb.py:9: forged.py:1: \\x1b[31mred\\x1b[0m,\\tlater', '1 marker, 0 with no trigger.']);
});

test('a file over the size limit is skipped with one warning, and the rest is still listed', () => {
  assert.equal(MAX_BYTES, 64 * 1024 * 1024);
  const dir = tempDir();
  git(dir, 'init', '-q');
  put(dir, 'big.py', '# shortcut: in a file over the limit, never\n');
  put(dir, 'small.py', '# shortcut: a, b\n');
  git(dir, 'add', '.');
  const { rows, warnings } = ledger(dir, undefined, { maxBytes: 20 });
  assert.deepEqual(rows.map((r) => `${r.file}:${r.line}`), ['small.py:1']);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /^debt\.mjs: big\.py is over 20 bytes, skipped\.$/);
});

test('timing: a marker with a 300,000-character text is listed in time', () => {
  const dir = tempDir();
  git(dir, 'init', '-q');
  writeFileSync(join(dir, 'long.py'), '# shortcut: ' + 'x'.repeat(300000) + '\n');
  git(dir, 'add', '.');
  const r = spawnSync(process.execPath, [DEBT, dir], { encoding: 'utf8', timeout: 5000 });
  assert.equal(r.error, undefined, 'killed by the timeout');
  assert.equal(r.status, 0);
  assert.equal(r.stdout.split('\n').at(-2), '1 marker, 1 with no trigger.');
});

test('outside a git work tree: one line on stderr, nothing on stdout, exit 2', () => {
  const d = tempDir();
  put(d, 'a.py', '# shortcut: not in a repository, x\n');
  // The ceiling stops git looking above the folder, so a repository around the temp folder does not count.
  const r = runNode(DEBT, { args: [d], env: { GIT_CEILING_DIRECTORIES: dirname(realpathSync(d)) } });
  assert.equal(r.code, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^[^\n]+\n$/);
  assert.match(r.stderr, /not inside a git work tree/);
});

test('a folder git cannot use: one line on stderr, exit 2', () => {
  const r = runNode(DEBT, { args: [join(tempDir(), 'missing')] });
  assert.equal(r.code, 2);
  assert.equal(r.stdout, '');
  assert.match(r.stderr, /^[^\n]+\n$/);
});

// Each file is one long line with no marker; the CLI runs in a child process that is killed after 5 seconds. The last
// file has a deep indent before many occurrences, so work done per occurrence on the indent shows up as a timeout.
const LONG = 300000;
const fill = (unit, n = LONG) => unit.repeat(Math.ceil(n / unit.length)).slice(0, n);
const TIMED = [
  ['plain', fill('x')],
  ['openers without the colon', fill('# // shortcut ')],
  ['markers after a word', fill(' x shortcut:')],
  ['markers after a deep indent', ' '.repeat(500000) + fill(' x shortcut:', 500000)],
];
for (const [name, line] of TIMED) {
  test(`timing: a long line (${name}) is scanned in time and holds no marker`, () => {
    const dir = tempDir();
    git(dir, 'init', '-q');
    writeFileSync(join(dir, 'long.py'), line + '\n');
    git(dir, 'add', '.');
    const r = spawnSync(process.execPath, [DEBT, dir], { encoding: 'utf8', timeout: 5000 });
    assert.equal(r.error, undefined, 'killed by the timeout');
    assert.equal(r.status, 0);
    assert.equal(r.stdout, 'No shortcut markers.\n');
  });
}
