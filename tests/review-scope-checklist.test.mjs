// The review-scope checklist, pure parts: its configuration and validation, reading the added lines out of a diff,
// and which entries a change triggers.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateConfig, resolveConfig, formatConfig, formatChange, globToRegExp, parseAddedLines, matchChecklist,
} from '../skills/verification/review-triage/review-scope.mjs';

const ENTRY = {
  trigger: { paths: ['migrations/**', 'db/schema.*'], added: 'DROP\\s+(TABLE|COLUMN)' },
  check: 'The migration keeps the old column until every reader has moved, or the change says why not.',
  why: 'A dropped column broke the nightly export (incident 2025-07, PR 412).',
};

describe('checklist configuration', () => {
  test('a valid checklist resolves, and the config text lists each entry with its number, check and trigger', () => {
    const second = { trigger: { added: 'select \\*', flags: 'i' }, check: 'Name the columns.', why: 'PR 9.' };
    const r = resolveConfig({ checklist: [ENTRY, second] });
    assert.deepEqual(r.errors, []);
    assert.deepEqual(r.config.checklist, [ENTRY, second]);
    const text = formatConfig(r.config);
    assert.match(text, /^Checklist:$/m);
    assert.match(text, /^ {2}#1 The migration keeps the old column .* \(when paths: migrations\/\*\*, db\/schema\.\* and added: \/DROP\\s\+\(TABLE\|COLUMN\)\/\)$/m);
    assert.match(text, /^ {2}#2 Name the columns\. \(when added: \/select \\\*\/i\)$/m);
  });

  test('no checklist resolves to an empty one, and the config text says none is set', () => {
    const r = resolveConfig({});
    assert.deepEqual(r.config.checklist, []);
    assert.match(formatConfig(r.config), /^Checklist: none set$/m);
  });
});

describe('checklist validation', () => {
  const errs = (checklist) => validateConfig({ checklist });
  const one = (entry) => errs([ENTRY, entry]);
  const cases = [
    ['the value is not a list', { trigger: {} }, /"checklist" must be a list/],
    ['an entry that is not an object', ['x'], /^checklist #1 must be an object/],
    ['an unknown entry key', [{ ...ENTRY, owner: 'me' }], /^checklist #1: unknown key "owner"/],
    ['an unknown trigger key', [{ ...ENTRY, trigger: { paths: ['a/**'], lines: 'x' } }], /^checklist #1: unknown key "trigger.lines"/],
    ['a trigger that is not an object', [{ ...ENTRY, trigger: 'a/**' }], /^checklist #1: "trigger" must be an object/],
    ['an empty trigger', [{ ...ENTRY, trigger: {} }], /^checklist #1: "trigger" needs paths, added or both/],
    ['a missing check', [{ trigger: ENTRY.trigger, why: 'x' }], /^checklist #1: "check" must be a non-empty string/],
    ['an empty check', [{ ...ENTRY, check: ' ' }], /^checklist #1: "check" must be a non-empty string/],
    ['a missing why', [{ trigger: ENTRY.trigger, check: 'x' }], /^checklist #1: "why" must be a non-empty string/],
    ['an empty why', [{ ...ENTRY, why: '' }], /^checklist #1: "why" must be a non-empty string/],
    ['paths that is a string', [{ ...ENTRY, trigger: { paths: 'a/**' } }], /^checklist #1: "trigger.paths" must be a non-empty list/],
    ['paths that is an empty list', [{ ...ENTRY, trigger: { paths: [] } }], /^checklist #1: "trigger.paths" must be a non-empty list/],
    ['paths holding a number', [{ ...ENTRY, trigger: { paths: [3] } }], /^checklist #1: "trigger.paths" must be a non-empty list/],
    ['an unbalanced glob', [{ ...ENTRY, trigger: { paths: ['src/{a,b'] } }], /^checklist #1: "trigger.paths": unbalanced brace/],
    ['an invalid regex', [{ ...ENTRY, trigger: { added: '(' } }], /^checklist #1: "trigger.added" is not a valid regular expression/],
    ['an empty regex', [{ ...ENTRY, trigger: { added: '' } }], /^checklist #1: "trigger.added" must be a non-empty string/],
    ['a flag other than i', [{ ...ENTRY, trigger: { added: 'x', flags: 'g' } }], /^checklist #1: "trigger.flags" may only be "i"/],
    ['flags without a regex', [{ ...ENTRY, trigger: { paths: ['a/**'], flags: 'i' } }], /^checklist #1: "trigger.flags" needs "added"/],
  ];
  for (const [name, value, want] of cases) {
    test(`${name} is reported once`, () => {
      const e = errs(value);
      assert.equal(e.length, 1, e.join('\n'));
      assert.match(e[0], want);
    });
  }

  test('an entry is named by its 1-based number', () => {
    assert.deepEqual(one({ ...ENTRY, why: '' }), ['checklist #2: "why" must be a non-empty string']);
  });

  test('a valid entry, and each trigger kind alone, has no problem', () => {
    assert.deepEqual(errs([ENTRY, { ...ENTRY, trigger: { paths: ['a/'] } }, { ...ENTRY, trigger: { added: 'x', flags: 'i' } }]), []);
  });
});

describe('parseAddedLines', () => {
  const diff = (...lines) => lines.join('\n') + '\n';
  const at = (m, p) => m.get(p) || [];

  test('hunks with and without counts give each added line its number in the new file', () => {
    const m = parseAddedLines(diff(
      'diff --git a/q.sql b/q.sql', 'index 1..2 100644', '--- a/q.sql', '+++ b/q.sql',
      '@@ -2 +2 @@', '-old', '+new two',
      '@@ -5,0 +6,2 @@', '+six', '+seven',
      '@@ -9,2 +11 @@', '-x', '-y', '+eleven',
    ));
    assert.deepEqual(at(m, 'q.sql'), [{ line: 2, text: 'new two' }, { line: 6, text: 'six' }, { line: 7, text: 'seven' }, { line: 11, text: 'eleven' }]);
  });

  test('removed lines and "No newline at end of file" are not added lines; context lines still count', () => {
    const m = parseAddedLines(diff(
      '--- a/main.go', '+++ b/main.go',
      '@@ -1,2 +1,3 @@', ' package main', '-func old() {}', '\\ No newline at end of file', '+func a() {}', '+func b() {}',
      '\\ No newline at end of file',
    ));
    assert.deepEqual(at(m, 'main.go'), [{ line: 2, text: 'func a() {}' }, { line: 3, text: 'func b() {}' }]);
  });

  test('a deleted file has no added lines, a binary file has no hunks, and the file after them is read', () => {
    const m = parseAddedLines(diff(
      'diff --git a/gone.py b/gone.py', 'deleted file mode 100644', '--- a/gone.py', '+++ /dev/null', '@@ -1 +0,0 @@', '-x = 1',
      'diff --git a/logo.png b/logo.png', 'Binary files a/logo.png and b/logo.png differ',
      'diff --git a/next.py b/next.py', 'new file mode 100644', '--- /dev/null', '+++ b/next.py', '@@ -0,0 +1 @@', '+y = 2',
    ));
    assert.deepEqual([...m.entries()], [['next.py', [{ line: 1, text: 'y = 2' }]]]);
  });

  test('a content line that reads like a file header is still content', () => {
    const m = parseAddedLines(diff(
      '--- a/m.sql', '+++ b/m.sql',
      '@@ -1,2 +1,2 @@', '--- x', '-DROP TABLE t;', '+++ b/other.sql', '+DROP TABLE u;',
    ));
    assert.deepEqual([...m.keys()], ['m.sql']);
    assert.deepEqual(at(m, 'm.sql'), [{ line: 1, text: '++ b/other.sql' }, { line: 2, text: 'DROP TABLE u;' }]);
  });

  test('a C-quoted path is unquoted, reading octal escapes as UTF-8 bytes', () => {
    const m = parseAddedLines(diff(
      '--- "a/caf\\303\\251 \\"q\\".py"', '+++ "b/caf\\303\\251 \\"q\\".py"', '@@ -0,0 +1 @@', '+x = 1',
      '--- /dev/null', '+++ "b/tab\\there\\\\.py"', '@@ -0,0 +1 @@', '+y = 2',
      '--- /dev/null', '+++ "b/raw \u00e9 \\"q\\".go"', '@@ -0,0 +1 @@', '+var z = 3',
    ));
    assert.deepEqual([...m.keys()], ['caf\u00e9 "q".py', 'tab\there\\.py', 'raw \u00e9 "q".go']);
  });

  test('a path with a space loses the tab git ends it with', () => {
    const m = parseAddedLines(diff('--- a/my file.py\t', '+++ b/my file.py\t', '@@ -1 +1 @@', '-a', '+b'));
    assert.deepEqual([...m.keys()], ['my file.py']);
  });

  test('a trailing carriage return is dropped from each line, once', () => {
    const m = parseAddedLines('+++ b/w.txt\r\n@@ -0,0 +1,2 @@\r\n+one\r\r\n+two\r\n');
    assert.deepEqual(at(m, 'w.txt'), [{ line: 1, text: 'one\r' }, { line: 2, text: 'two' }]);
  });
});

describe('matchChecklist', () => {
  const entry = (trigger, check = 'c') => ({ trigger, check, why: 'w' });
  const file = (path, more = {}) => ({ path, added: 1, removed: 0, deleted: false, untracked: false, ...more });
  const lines = (...texts) => texts.map((text, i) => ({ line: i + 1, text }));

  test('paths only: any changed file counts, a deleted one too, and `by` lists the matched paths in order', () => {
    const files = [file('db/schema.sql', { deleted: true }), file('migrations/1.sql'), file('src/a.py')];
    const r = matchChecklist([entry({ paths: ['migrations/**', 'db/schema.*'] })], files, new Map());
    assert.deepEqual(r, [{ entry: 1, check: 'c', why: 'w', by: ['db/schema.sql', 'migrations/1.sql'], timedOut: false, error: null }]);
  });

  test('regex only: every added line of every changed file is tested, and `by` is the first match as path:line', () => {
    const added = new Map([['a.py', lines('x = 1', 'DROP TABLE t')], ['b.go', lines('DROP COLUMN c')]]);
    const r = matchChecklist([entry({ added: 'DROP\\s+(TABLE|COLUMN)' })], [file('a.py'), file('b.go')], added);
    assert.deepEqual(r, [{ entry: 1, check: 'c', why: 'w', by: ['a.py:2'], timedOut: false, error: null }]);
  });

  test('the regex has no flags unless the trigger asks for "i"', () => {
    const added = new Map([['a.sql', lines('drop table t')]]);
    assert.deepEqual(matchChecklist([entry({ added: 'DROP TABLE' })], [file('a.sql')], added), []);
    assert.equal(matchChecklist([entry({ added: 'DROP TABLE', flags: 'i' })], [file('a.sql')], added).length, 1);
  });

  test('paths and regex together: a match outside the globs does not trigger', () => {
    const t = { paths: ['migrations/**'], added: 'DROP TABLE' };
    const added = new Map([['src/a.py', lines('DROP TABLE t')], ['migrations/1.sql', lines('CREATE TABLE t')]]);
    const files = [file('migrations/1.sql'), file('src/a.py')];
    assert.deepEqual(matchChecklist([entry(t)], files, added), []);
    added.set('migrations/1.sql', lines('CREATE TABLE t', 'DROP TABLE t'));
    assert.deepEqual(matchChecklist([entry(t)], files, added)[0].by, ['migrations/1.sql:2']);
  });

  test('untriggered entries are left out, and the rest keep their configuration number and order', () => {
    const entries = [entry({ paths: ['web/**'] }, 'one'), entry({ paths: ['src/**'] }, 'two'), entry({ added: 'nope' }, 'three'), entry({ added: 'y' }, 'four')];
    const r = matchChecklist(entries, [file('src/a.py')], new Map([['src/a.py', lines('y = 1')]]));
    assert.deepEqual(r.map((x) => [x.entry, x.check]), [[2, 'two'], [4, 'four']]);
  });

  test('the rules file itself never triggers an entry, by path or by its text', () => {
    const rules = '.claude/review-rules.json';
    const r = matchChecklist([entry({ paths: ['.claude/**'] }), entry({ added: 'DROP' })], [file(rules)], new Map([[rules, lines('"added": "DROP"')]]));
    assert.deepEqual(r, []);
  });
});

test('a configured checklist prints its triggered entries after the code files line and before the note', () => {
  const r = {
    base: 'main', mergeBase: 'a'.repeat(40), riskyConfigured: false, files: [],
    summary: { files: 1, added: 1, removed: 0, risky: [], tests: [], docs: [], code: ['m.sql'] },
    checklist: { entries: 2, triggered: [{ entry: 2, check: 'Keep the column.', why: 'PR 412.', by: ['a', 'b', 'c', 'd', 'e'], timedOut: false, error: null }] },
  };
  const text = formatChange(r);
  assert.match(text, /\nCode files: 1; [^\n]*\nChecklist: 1 of 2 entries triggered\n {2}#2 Keep the column\.\n {5}why: PR 412\.\n {5}triggered by: a, b, c and 2 more\nNote: /);
  assert.doesNotMatch(formatChange({ ...r, checklist: { entries: 0, triggered: [] } }), /Checklist/);
});

test('globs: repeated **/ cannot make a path match slow', () => {
  assert.equal(globToRegExp('**/**/**/y').source, globToRegExp('**/y').source);
  assert.equal(globToRegExp('a/**/**/b/**/**/**/c').source, globToRegExp('a/**/b/**/c').source);
});
