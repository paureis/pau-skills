// geppetto's check-agents.mjs, the parse tests: frontmatter Claude Code loads, frontmatter it skips, and the
// claude plugin validate hint. Shared setup is in geppetto.helpers.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { tempDir } from './helpers.mjs';
import { parseFrontmatter, audit } from '../skills/agent-orchestration/geppetto/check-agents.mjs';
import { COVENANT, put, check, found, errors } from './geppetto.helpers.mjs';

// Calibrated with `claude plugin validate` on 2.1.303: Claude Code loads these, some only after it quotes a value
// that is not strict YAML. None of them may get a parse finding.
const LOADS = {
  colon: ['---', 'name: c1', 'description: Use when: x', '---', 'b'],
  examples: ['---', 'name: c2', 'description: Use this agent for reviews. Examples: <example>Context: the user wrote code. user: "Review this" assistant: "I will use the agent" </example>', '---', 'b'],
  unindentedList: ['---', 'name: c3', 'description: d', 'tools:', '- Read', '- Bash', '---', 'b'],
  anchor: ['---', 'name: c4', 'description: &d some text', '---', 'b'],
  indentedBlock: ['---', '  name: c5', '  description: d', '---', 'b'],
  duplicateKey: ['---', 'name: c6', 'description: d', 'description: e', '---', 'b'],
};
// And Claude Code skips these: `claude plugin validate` reports a YAML parse error for each.
const SKIPS = {
  commentThenMore: ['---', 'name: r1', 'description: first line # c', '  continued', '---', 'b'],
  aliasInList: ['---', 'name: r2', 'description: d', 'tools:', '  - Bash(git log: *)', '---', 'b'],
  neverClosedQuote: ['---', 'name: r3', 'description: "never closed', '---', 'b'],
  strayIndent: ['---', 'name: r5', 'description: d', '  stray: indent', '---', 'b'],
  noKey: ['---', 'name: r6', 'description: d', 'this line has no key', '---', 'b'],
};

test('parse: frontmatter Claude Code loads gets no parse finding, and its values are read the way Claude Code reads them', () => {
  for (const [label, lines] of Object.entries(LOADS)) {
    const r = check({ 'a.md': `${lines.join('\n')}\n\n${COVENANT.text}\n` });
    assert.deepEqual(found(r, 'parse'), [], label);
    assert.deepEqual(errors(r), [], label);
  }
  const value = (lines) => parseFrontmatter(lines.join('\n')).data;
  assert.equal(value(LOADS.colon).description, 'Use when: x');
  assert.match(value(LOADS.examples).description, /user: "Review this"/);
  assert.deepEqual(value(LOADS.unindentedList).tools, ['Read', 'Bash']);
  assert.equal(value(LOADS.anchor).description, 'some text');
  assert.equal(value(LOADS.indentedBlock).name, 'c5');
  assert.equal(value(LOADS.duplicateKey).description, 'e', 'the last value wins');
  assert.equal(found(check({ 'a.md': `${LOADS.duplicateKey.join('\n')}\n\n${COVENANT.text}\n` }), 'duplicate-key', 'warning').length, 1);
  const ok = parseFrontmatter([
    '---', 'name: "quoted"', "description: >", '  folded over', '  two lines', 'tools:', '  - Read', '  - Bash   # a comment',
    'skills: [tdd, "other"]', 'maxTurns: 12', 'background: false', 'hooks:', '  PreToolUse:', '    - matcher: Bash',
    '---', 'Body.',
  ].join('\n'));
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.data, {
    name: 'quoted', description: 'folded over two lines\n', tools: ['Read', 'Bash'], skills: ['tdd', 'other'],
    maxTurns: 12, background: false, hooks: ok.data.hooks,
  });
  assert.equal(ok.body.trim(), 'Body.');
  assert.equal(parseFrontmatter('No frontmatter here.\n').data, null, 'a file without frontmatter is documentation');
});

test('parse: frontmatter Claude Code skips is a warning that names claude plugin validate, and the other checks still run', () => {
  for (const [label, lines] of Object.entries(SKIPS)) {
    const r = check({ 'a.md': `${lines.join('\n')}\n\n${COVENANT.text}\n` });
    const w = found(r, 'parse');
    assert.deepEqual(w.map((f) => f.level), ['warning'], label);
    assert.match(w[0].message, /claude plugin validate/, label);
  }
  // The fields that did parse are still checked: here an unknown field and a missing covenant.
  const r = check({ 'a.md': [...SKIPS.noKey.slice(0, -2), 'colour: red', '---', 'b'].join('\n') });
  assert.equal(found(r, 'field', 'error').length, 1);
  assert.equal(found(r, 'covenant', 'error').length, 1);
  assert.equal(found(check({ 'a.md': '---\nname: x\ndescription: y\n' }), 'parse', 'warning').length, 1, 'frontmatter never closed');
});

// `claude plugin validate` (2.1.303) reads a folder of agents at a path ending in .claude/agents; a folder such as
// the bundled roster or a drafts folder fails there with "No manifest found". The hint must give a command that works.
test('parse: the claude plugin validate hint gives a command that works for the folder it names', () => {
  const broken = `${SKIPS.neverClosedQuote.join('\n')}\n\n${COVENANT.text}\n`;
  const inProject = found(check({ 'a.md': broken }), 'parse')[0].message;
  assert.match(inProject, /Run claude plugin validate \S*\.claude[/\\]agents\. /, 'the project folder is validated as it is');
  assert.doesNotMatch(inProject, /mktemp/);

  const drafts = tempDir('geppetto-drafts-');
  put(drafts, 'a.md', broken);
  const message = found(audit({ dir: drafts, project: tempDir('geppetto-empty-'), user: tempDir('geppetto-empty-user-') }), 'parse')[0].message;
  assert.match(message, /does not end in \.claude\/agents/);
  assert.ok(!message.includes(`claude plugin validate ${drafts}`), 'no direct validate of a folder validate cannot read');
  const command = /d=\$\(mktemp -d\) && .*? && claude plugin validate "\$d\/\.claude\/agents"/.exec(message);
  assert.ok(command, `a copy-and-validate command: ${message}`);
  // Run it with `ls` in place of claude: the copy lands at a path ending in .claude/agents and holds the file.
  const tmp = tempDir('geppetto-hint-');
  const out = execFileSync('sh', ['-c', command[0].replace('claude plugin validate', 'ls')], { encoding: 'utf8', env: { ...process.env, TMPDIR: tmp } });
  assert.equal(out.trim(), 'a.md');
});
