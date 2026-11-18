// The RULES flag: a change that edits a folder's REVIEW.md, or a file the rules name word for word, is flagged. A
// REVIEW.md next to a SKILL.md is that skill's own file and is not.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { put, commit, run, repoWith, json } from './review-scope.helpers.mjs';
import { resolveConfig, rulesFlag, namedPaths } from '../skills/verification/review-triage/review-scope.mjs';

const entry = (trigger, check, why = 'PR 1.') => ({ trigger, check, why });
const reasons = (flag) => Object.fromEntries(flag.paths.map((p, i) => [p, flag.reasons[i]]));

test('an edited, added or deleted REVIEW.md is flagged; one next to a SKILL.md at the base, or new with its SKILL.md, is not', () => {
  const { dir } = repoWith({
    'src/REVIEW.md': 'a\n', 'docs/REVIEW.md': 'a\n', 'src/x.py': 'x = 1\n',
    'skills/a/SKILL.md': 'a\n', 'skills/a/REVIEW.md': 'a\n', 'skills/c/REVIEW.md': 'a\n',
  });
  for (const p of ['src/REVIEW.md', 'skills/a/REVIEW.md', 'skills/c/REVIEW.md']) put(dir, p, 'b\n');
  rmSync(join(dir, 'docs', 'REVIEW.md'));
  for (const p of ['skills/b/SKILL.md', 'skills/b/REVIEW.md', 'skills/c/SKILL.md', 'lib/REVIEW.md', 'REVIEW.md', 'lib/REVIEW.md.bak', 'lib/xREVIEW.md']) put(dir, p, 'n\n');
  const r = run(dir, ['change', '--json']);
  assert.equal(r.code, 0, r.stderr);
  const [flag, ...rest] = json(r).flags;
  assert.deepEqual(rest, []);
  assert.deepEqual(reasons(flag), {
    'docs/REVIEW.md': '(a REVIEW.md)', 'lib/REVIEW.md': '(a REVIEW.md)', 'REVIEW.md': '(a REVIEW.md)',
    'skills/c/REVIEW.md': '(a REVIEW.md)', 'src/REVIEW.md': '(a REVIEW.md)',
  });
  const text = run(dir, ['change']).stdout;
  assert.match(text, /\nFlags:\n {2}RULES: [^\n]*src\/REVIEW\.md \(a REVIEW\.md\): the change edits what judges it\./);
});

test('a new REVIEW.md is skipped only beside a SKILL.md that is a changed file, and a deleted base SKILL.md skips nothing, in change and fix', () => {
  const { dir } = repoWith({
    '.gitignore': 'ignored/SKILL.md\n', 'gone/SKILL.md': 's\n', 'gone/REVIEW.md': 'a\n',
    'skills/s/SKILL.md': 's\n', 'skills/s/REVIEW.md': 'a\n', 'src/x.py': 'x = 1\n',
  });
  put(dir, 'src/x.py', 'x = 2\n');
  commit(dir, 'work');
  for (const p of ['ignored/SKILL.md', 'ignored/REVIEW.md', 'folder/SKILL.md/x.md', 'folder/REVIEW.md', 'gone/REVIEW.md', 'skills/s/REVIEW.md', 'new/SKILL.md', 'new/REVIEW.md']) put(dir, p, 'n\n');
  rmSync(join(dir, 'gone', 'SKILL.md'));
  const want = ['folder/REVIEW.md', 'gone/REVIEW.md', 'ignored/REVIEW.md'];
  for (const args of [['change', '--json'], ['fix', '--since', 'HEAD', '--json']]) {
    const flag = json(run(dir, args)).flags.find((f) => f.id === 'RULES');
    assert.deepEqual(flag.paths, want, args[0]);
  }
});

test('a path named word for word in a checks command or a checklist check is flagged, with its reason', () => {
  const { config } = resolveConfig({
    checks: ['pytest tests/a.py', 'python -m unittest ./tests/b.py', 'make test FILE=tests/c.py', `sh -c "pytest 'tests/d.py'"`,
      'pytest tests/e.py::test_refund', 'go test ./pkg/... -run=TestPick'],
    checklist: [entry({ paths: ['src/**'] }, 'Runs tests/a.py too.'), entry({ paths: ['src/**'] }, 'Check that it still runs tests/f.py.')],
  }, {});
  const files = ['tests/a.py', 'tests/b.py', 'tests/c.py', 'tests/d.py', 'tests/e.py', 'tests/f.py', 'tests/g.py', 'pkg/pick.go'].map((path) => ({ path }));
  const flags = rulesFlag(files, config, new Set(), 'the message');
  assert.equal(flags.length, 1);
  assert.equal(flags[0].message, 'the message');
  assert.deepEqual(reasons(flags[0]), {
    'tests/a.py': '(named in checks)', 'tests/b.py': '(named in checks)', 'tests/c.py': '(named in checks)',
    'tests/d.py': '(named in checks)', 'tests/e.py': '(named in checks)', 'tests/f.py': '(named in checklist #2)',
  });
});

test('a path is named only as a whole piece: not inside a longer path, a folder, a glob or a quoted path with a space', () => {
  const { config } = resolveConfig({ checks: ['pytest old_tests/a.py tests/a.py.bak', `pytest 'tests/*.py' tests/ "tests/my b.py"`] }, {});
  assert.deepEqual(rulesFlag([{ path: 'tests/a.py' }, { path: 'tests/my b.py' }], config, new Set(), 'm'), []);
  assert.deepEqual([...namedPaths('pytest ./tests/a.py::test_x, (x.py). [y:] z=`w`;')], ['pytest', 'tests/a.py', 'x.py', 'y', 'z', 'w']);
});
