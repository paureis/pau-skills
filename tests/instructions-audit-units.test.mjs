// The instructions-audit scanner, the rule units: sizes, heading sections, code fences, how a file splits into rules,
// overlap and near-duplicate rules, secret-shaped lines, and vague or emphatic wording. Every detector has a control:
// something that looks similar and must not be flagged.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  estimateTokens, fileStats, splitUnits, bigrams, overlap, findDuplicates, extractImports, extractReferences,
  findSecrets, mask, findVague, findEmphasis, sectionsOf,
} from '../skills/session-discipline/instructions-audit/scan.mjs';

test('size: tokens are about four characters each; lines ignore the final newline', () => {
  assert.equal(estimateTokens('abcdefgh'), 2);
  assert.equal(estimateTokens('abcdefghi'), 3);
  assert.deepEqual(fileStats('one\ntwo\n'), { bytes: 8, lines: 2, tokens: 2 });
  assert.deepEqual(fileStats(''), { bytes: 0, lines: 0, tokens: 0 });
  assert.equal(fileStats('caf\u00e9').bytes, 5, 'bytes are UTF-8 bytes, not characters');
});

test('sectionsOf sizes each heading block and ignores # inside code fences', () => {
  const s = sectionsOf('# A\nshort\n```\n# not a heading\n```\n# B\n' + 'x'.repeat(400) + '\n');
  assert.deepEqual(s.map((x) => x.heading), ['A', 'B']);
  assert.ok(s[1].tokens > s[0].tokens);
});

// Fences close the CommonMark way: a bare fence of the same character, at least as long. A toggle on any fence line
// would end these fences early and read the lines after the inner fence as prose.
const NESTED = [
  ['````md', '```', '# in backticks', '@docs/in-backticks.md', '````'],
  ['~~~~', '~~~', '# in tildes', '@docs/in-tildes.md', '~~~~'],
  ['```', '~~~', '# other character', '@docs/other-character.md', '```'],
  ['```', '```js', '# info string', '@docs/info-string.md', '`````'],
];

test('sectionsOf: nested and mixed fences, longer closers and info strings on a closer', () => {
  for (const block of NESTED) {
    const s = sectionsOf(['# A', ...block, '# B', 'text'].join('\n'));
    assert.deepEqual(s.map((x) => x.heading), ['A', 'B'], block.join(' | '));
  }
});

test('extractImports, extractReferences and splitUnits skip the whole of a nested fence', () => {
  for (const block of NESTED) {
    const text = ['# A', ...block, '@docs/after.md', 'See `docs/after-span.md` here.'].join('\n');
    assert.deepEqual(extractImports(text).map((i) => i.ref), ['docs/after.md'], block.join(' | '));
    assert.deepEqual(extractReferences(text).filter((r) => r.kind === 'path').map((r) => r.ref), ['docs/after-span.md'], block.join(' | '));
    assert.deepEqual(splitUnits(text).map((u) => u.heading + ': ' + u.text),
      ['A: @docs/after.md See `docs/after-span.md` here.'], block.join(' | '));
  }
});

test('splitUnits: bullets with continuations, paragraphs, table rows; skips code, headings and frontmatter', () => {
  const text = [
    '---', 'paths: src/**', '---',
    '# Testing',
    'Run the suite before every commit.',
    'It takes two minutes.',
    '',
    '- Use `pytest -q` for the fast run',
    '  and `pytest` for the full one.',
    '  - nested bullet is its own unit',
    '1. numbered item',
    '```bash',
    '- not a bullet, inside a fence',
    '```',
    '| Command | Purpose |',
    '|---|---|',
    '| `make lint` | lint |',
  ].join('\n');
  const u = splitUnits(text);
  assert.deepEqual(u.map((x) => [x.kind, x.line]), [['paragraph', 5], ['bullet', 8], ['bullet', 10], ['bullet', 11], ['row', 15], ['row', 17]]);
  assert.equal(u[0].text, 'Run the suite before every commit. It takes two minutes.');
  assert.equal(u[1].text, 'Use `pytest -q` for the fast run and `pytest` for the full one.');
  assert.equal(u[1].heading, 'Testing');
  assert.ok(!u.some((x) => /inside a fence|paths:/.test(x.text)));
});

test('overlap: a rule restated inside a longer one scores high; different tools do not collide', () => {
  const a = bigrams('Run the full test suite before pushing any branch to the remote.');
  const b = bigrams('Before opening a pull request, run the full test suite before pushing any branch to the remote, and fix failures.');
  assert.ok(overlap(a, b) >= 0.6, String(overlap(a, b)));
  const npm = bigrams('Run `npm test` before committing changes to the repository.');
  const cargo = bigrams('Run `cargo test` before committing changes to the repository.');
  assert.ok(overlap(npm, cargo) < 1, 'code spans are kept as tokens');
  assert.equal(overlap(new Set(), b), 0);
});

test('findDuplicates: within and across files, with a threshold and an unrelated control', () => {
  const units = [
    { file: 'CLAUDE.md', line: 3, text: 'Never commit directly to the main branch; open a pull request and wait for review.' },
    { file: 'AGENTS.md', line: 9, text: 'Never commit directly to the main branch; open a pull request and wait for review.' },
    { file: 'CLAUDE.md', line: 7, text: 'Database migrations live in the migrations folder and are generated with the ORM command line tool.' },
    { file: 'CLAUDE.md', line: 12, text: 'Short rule.' },
  ];
  const d = findDuplicates(units);
  assert.equal(d.length, 1);
  assert.equal(d[0].exact, true);
  assert.equal(d[0].sameFile, false);
  assert.deepEqual([d[0].a.line, d[0].b.line], [3, 9]);
  assert.equal(findDuplicates(units, { threshold: 1.01 }).length, 0);
});

test('findSecrets: provider tokens, assignments, private keys, emails and phones; placeholders are not flagged', () => {
  // Built at runtime so this file never contains a secret-shaped literal.
  const gh = 'gh' + 'p_' + 'A1b2C3d4E5f6G7h8I9j0K1l2M3n4O5p6Q7r8';
  const aws = 'AK' + 'IA' + 'ABCDEFGHIJKLMNOP';
  const email = 'jane.doe' + '@' + 'acme-corp.io';
  const text = [
    `Deploy token: ${gh}`,
    `aws key ${aws}`,
    'DB_PASSWORD=hunter2hunter2x9',
    '-----BEGIN RSA ' + 'PRIVATE KEY-----',
    `Ask ${email} for access.`,
    'Call +1 415 555 0134 if the pager fires.',
    'API_KEY=<your-api-key>',
    'token: ${GITHUB_TOKEN}',
    'password = changeme',
    'Write to ops' + '@' + 'example.com for help.',
    'Use version 1.2.3 and port 8080.',
  ].join('\n');
  const got = findSecrets(text);
  assert.deepEqual(got.map((s) => [s.line, s.kind]), [
    [1, 'GitHub token'], [2, 'AWS access key id'], [3, 'assigned password'], [4, 'private key'], [5, 'email address'], [6, 'phone number'],
  ]);
  for (const s of got) assert.ok(!text.split('\n').some((l) => s.preview.length > 8 && l.includes(s.preview)), 'previews are masked');
  assert.equal(mask('abcdefghijklmnop'), 'abcd**********op');
  assert.equal(mask('short'), '*****');
  // Eight characters or fewer are all stars; from nine on, the first four and the last two show.
  assert.equal(mask('abcdefg'), '*******');
  assert.equal(mask('abcdefgh'), '********');
  assert.equal(mask('abcdefghi'), 'abcd***hi');
});

test('findVague and findEmphasis: vague wording without anchors; capitals and "again"', () => {
  const units = splitUnits([
    '- Write clean code and follow best practices.',
    '- Be careful with `migrations/`: run `alembic check` first.',
    '- Keep functions under 40 lines.',
    '- NEVER push to main without review.',
    '- Do not edit generated files again; regenerate them.',
    '- This works against the API.',
  ].join('\n')).map((u) => ({ ...u, file: 'CLAUDE.md' }));
  const vague = findVague(units);
  assert.equal(vague.length, 1);
  assert.deepEqual(vague[0].phrases, ['clean code', 'best practices']);
  const emph = findEmphasis(units);
  assert.deepEqual(emph.map((e) => [e.line, e.marker]), [[4, 'NEVER'], [5, 'again']]);
});
