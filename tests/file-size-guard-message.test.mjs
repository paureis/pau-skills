// The file-size guard's refusal message. From docs/BACKLOG.md, item Q4:
//   "What it does": "The refusal message names the file, its size and the limit, and gives a split recipe for its
//   kind: code splits by responsibility into modules, with the old path re-exporting so callers do not change; a test
//   file splits by the behaviour each group covers; a long document becomes a short index plus one file per section;
//   a log (a changelog, a decision log) keeps recent entries and moves older ones to an archive file by period; a
//   SKILL.md keeps its steps and moves detail to a reference file next to it."
//   "Changed at the start of Q4": "The refusal message also says: when splitting is not part of the task the user
//   gave, tell the user and offer the split or a per-path override, instead of starting a large refactor unasked."
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { tempDir } from './helpers.mjs';
import { LIMIT_BYTES, put, write, edit, check, hook, makeRepo } from './file-size-guard.helpers.mjs';
import { kindOf } from '../hooks/guards/file-size-guard.mjs';

const big = 'a'.repeat(LIMIT_BYTES + 1);

// Code whose name looks like a log ("decision", "history", "changelog") is still code: the log patterns apply to text
// files only. Data files get their own kind wherever they are, test fixtures included.
const KINDS = {
  code: ['src/server.ts', 'lib/parse.py', 'cmd/main.go', 'Makefile', 'skills/verification/hillclimb/decisions.mjs',
    'src/decision_tree.py', 'lib/history.py', 'src/changelog_parser.go', 'app/HistoryService.java'],
  test: ['tests/a.js', 'test/b.rb', 'spec/c_spec.rb', 'src/__tests__/d.js', 'src/e.test.ts', 'src/f.spec.js', 'pkg/g_test.go', 'app/test_h.py'],
  document: ['docs/guide.md', 'README.mdx', 'manual.rst', 'notes.txt', 'book.adoc'],
  log: ['CHANGELOG.md', 'docs/HISTORY.rst', 'server.log', 'docs/decisions.md', 'decision-log.md', 'HISTORY', 'notes/decisions.adoc'],
  skill: ['skills/x/SKILL.md'],
  data: ['test/fixtures/big.json', 'data/rows.csv', 'tests/fixtures/events.jsonl', 'x.tsv', 'conf.yaml', 'k8s/deploy.yml', 'feed.xml', 'db/seed.sql'],
};
const RECIPE = {
  code: /by responsibility into modules.*old path re-export/s,
  test: /by the behaviour each group covers/,
  document: /short index plus one file per section/,
  log: /keep recent entries.*archive file by period/s,
  skill: /keep its steps.*reference file next to it/s,
  data: /generate it from a script at test or build time.*small sample.*ignorePaths/s,
};

describe('file-size guard: the kind of file', () => {
  for (const [kind, paths] of Object.entries(KINDS)) {
    test(`${kind}: ${paths.join(', ')}`, () => {
      for (const path of paths) assert.equal(kindOf(path), kind, path);
    });
  }
});

/** The message for an existing 1-byte file that a Write grows over the limit. */
const grown = (rel, options) => { const p = tempDir(); put(p, rel, 'x'); return check(write(p, rel, big), p, options).reason; };
/** The message for a new file written over the limit. */
const created = (rel) => { const p = tempDir(); return check(write(p, rel, big), p).reason; };

const NEW_RECIPE = {
  code: /one module per responsibility/,
  test: /one test file per behaviour group/,
  document: /short index plus one file per section/,
  log: /archive file by period/,
  skill: /reference file next to it/,
  data: /generate it from a script at test or build time/,
};

describe('file-size guard: the refusal message', () => {
  for (const [kind, paths] of Object.entries(KINDS)) {
    test(`gives the recipe for ${kind}, and only that one`, () => {
      const reason = grown(paths[0]);
      assert.match(reason, RECIPE[kind]);
      for (const [other, re] of Object.entries(RECIPE)) if (other !== kind) assert.doesNotMatch(reason, re, other);
    });
  }

  test('names the file, the size after and now in tokens, and the limit', () => {
    const p = tempDir(); put(p, 'src/a.js', 'x' + 'a'.repeat(23999)); // 6,000 tokens now
    const { reason } = check(edit(p, 'src/a.js', 'x', 'xyzw'), p, { maxTokens: 4000 }); // 6,001 after
    assert.match(reason, /^\[file-size-guard\]/);
    assert.match(reason, /src\/a\.js/);
    assert.match(reason, /6,001 tokens/);
    assert.match(reason, /6,000 now/);
    assert.match(reason, /limit is 4,000 tokens/);
  });

  test('a growth of one byte shows in bytes when the tokens round to the same number', () => {
    const p = tempDir(); put(p, 'src/a.js', 'x' + 'a'.repeat(30000)); // 30,001 bytes, 7,501 tokens
    const { reason } = check(edit(p, 'src/a.js', 'x', 'xy'), p); // 30,002 bytes, still 7,501 tokens
    assert.match(reason, /30,002 bytes/);
    assert.match(reason, /up from 30,001/);
  });

  test('a new file is worded as a new file, with no growth, split or refactor', () => {
    const reason = created('src/new.js');
    assert.match(reason, /src\/new\.js would be a new file of 5,001 tokens \(20,001 bytes\); the limit is 5,000 tokens/);
    assert.match(reason, /write it as several smaller files/);
    assert.match(reason, /tell the user/);
    for (const re of [/0 now/, /growing it/, /large refactor/, /split it/i]) assert.doesNotMatch(reason, re);
  });

  for (const [kind, paths] of Object.entries(KINDS)) {
    test(`a new ${kind} file gets the recipe for writing one`, () => assert.match(created(paths[0]), NEW_RECIPE[kind]));
  }

  test('says to tell the user instead of starting a large refactor unasked', () => {
    const reason = grown('src/a.js');
    assert.match(reason, /If splitting is not part of the task the user gave, tell the user and offer the split or a per-path limit/);
    assert.match(reason, /instead of starting a large refactor unasked/);
  });

  test('says how to set a pathLimits entry and how to turn the hook off', () => {
    const reason = grown('src/a.js');
    assert.match(reason, /"file-size-guard": \{ "pathLimits": \{ "src\/a\.js": \d+ \} \}/);
    assert.match(reason, /\.claude\/pau-skills\.json/);
    assert.match(reason, /"hooks": \{ "file-size-guard": false \}/);
    assert.match(reason, /PAU_SKILLS_DISABLE=file-size-guard/);
  });

  test('gives each config as a whole JSON file on its own line', () => {
    const reason = grown('src/a.js');
    const objects = reason.split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l));
    assert.equal(objects.length, 2);
    assert.deepEqual(Object.keys(objects[0]['file-size-guard'].pathLimits), ['src/a.js']);
    assert.ok(objects[0]['file-size-guard'].pathLimits['src/a.js'] > 5000);
    assert.deepEqual(objects[1], { hooks: { 'file-size-guard': false } });
  });

  test('says what the glob matches: the path from the root, or a bare file name in every folder', () => {
    const nested = grown('docs/guide.md');
    assert.match(nested, /matches this path from the project root/);
    assert.doesNotMatch(nested, /every folder/);
    const root = grown('README.md');
    assert.match(root, /"README\.md" matches that file name in every folder/);
    assert.doesNotMatch(root, /matches this path from the project root/);
  });

  test('says the environment switch is for the user to set when starting Claude Code', () => {
    const reason = grown('src/a.js');
    assert.match(reason, /the user can .*start Claude Code with PAU_SKILLS_DISABLE=file-size-guard/s);
    assert.match(reason, /an agent cannot set it for its own session/);
  });

  test('the hook prints it on stderr and exits 2', () => {
    const p = makeRepo();
    const r = hook(p, write(p, 'src/a.js', big));
    assert.equal(r.code, 2);
    assert.equal(r.stdout, '');
    assert.match(r.stderr, /\[file-size-guard\].*src\/a\.js/s);
  });
});
