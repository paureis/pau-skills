// The file-size guard refuses a Write, Edit or MultiEdit that leaves a file in the project over its token limit and
// larger than it was. From docs/BACKLOG.md, item Q4:
//   "Changed at the start of Q4": "One rule covers both refusals: refuse when the size after the change is over the
//   limit and larger than the size before (a new file counts as 0 before). A file that crosses the limit always
//   grows, so no second case is needed."
//   "Changed at the start of batch 7": "Size after the change is computed by applying the edit to the file's current
//   text (each `MultiEdit` edit in order, `replace_all` on every occurrence), in UTF-8 bytes. An `old_string` not in
//   the file passes: the tool fails anyway." and "The hook checks only files inside the project."
//   "What it does": "Limit: 5,000 tokens by default, for every file type, set per project in the hooks config, with
//   per-path overrides for a file that must be big." "It exits 0 on input it does not understand and checks
//   `hookEnabled()`."
// The skip rules and the lister are in file-size-guard-skips.test.mjs, the message in file-size-guard-message.test.mjs.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, symlinkSync } from 'node:fs';
import { join } from 'node:path';
import { repo, tempDir } from './helpers.mjs';
import { LIMIT_BYTES, put, write, edit, multi, check, hook, makeRepo, plainDir } from './file-size-guard.helpers.mjs';

const pad = (n) => 'a'.repeat(n);

describe('file-size guard: registration', () => {
  test('hooks.json runs it on PreToolUse for Write, Edit and MultiEdit with a 5 second timeout', () => {
    const groups = JSON.parse(readFileSync(repo('hooks', 'guards', 'hooks.json'), 'utf8')).hooks.PreToolUse;
    const group = groups.find((g) => g.hooks.some((h) => h.command.includes('file-size-guard.mjs')));
    assert.ok(group, 'no PreToolUse group runs file-size-guard.mjs');
    for (const tool of ['Write', 'Edit', 'MultiEdit']) assert.ok(group.matcher.split('|').includes(tool), tool);
    const h = group.hooks.find((x) => x.command.includes('file-size-guard.mjs'));
    assert.equal(h.command, 'node "${CLAUDE_PLUGIN_ROOT}/hooks/guards/file-size-guard.mjs"');
    assert.equal(h.type, 'command');
    assert.equal(h.timeout, 5);
  });
});

describe('file-size guard: the limit', () => {
  test('a write that crosses the limit is refused; exactly the limit is not over it', () => {
    const p = tempDir(); put(p, 'src/a.js', pad(19000));
    assert.ok(check(write(p, 'src/a.js', pad(LIMIT_BYTES + 1)), p).reason);
    assert.equal(check(write(p, 'src/a.js', pad(LIMIT_BYTES)), p).reason, null);
  });

  test('a new file counts as 0 before', () => {
    const p = tempDir();
    assert.ok(check(write(p, 'src/new.js', pad(LIMIT_BYTES + 1)), p).reason);
    assert.equal(check(write(p, 'src/new.js', pad(100)), p).reason, null);
  });

  test('a file already over the limit may not grow, by one byte', () => {
    const p = tempDir(); put(p, 'src/big.js', 'x' + pad(30000));
    assert.ok(check(edit(p, 'src/big.js', 'x', 'xy'), p).reason);
    assert.ok(check(write(p, 'src/big.js', 'x' + pad(30001)), p).reason);
  });

  test('a shrink and a same-size change to an over-limit file pass', () => {
    const p = tempDir(); put(p, 'src/big.js', 'xyz' + pad(30000));
    assert.equal(check(edit(p, 'src/big.js', 'xyz', 'x'), p).reason, null);
    assert.equal(check(edit(p, 'src/big.js', 'xyz', 'abc'), p).reason, null);
    assert.equal(check(write(p, 'src/big.js', pad(30003)), p).reason, null);
  });

  test('size is measured in UTF-8 bytes, not characters', () => {
    const p = tempDir();
    const text = '\u00e9'.repeat(10001); // 10,001 characters, 20,002 bytes
    assert.ok(check(write(p, 'src/accents.txt', text), p).reason);
  });
});

describe('file-size guard: applying edits', () => {
  test('Edit replaces the first occurrence; replace_all replaces every one', () => {
    const p = tempDir(); put(p, 'src/a.js', 'x' + pad(LIMIT_BYTES - 1));
    assert.ok(check(edit(p, 'src/a.js', 'x', 'xy'), p).reason);
    put(p, 'src/b.js', 'x\n'.repeat(5000)); // 10,000 bytes
    assert.ok(check(edit(p, 'src/b.js', 'x', 'xyzz', true), p).reason); // 25,000 bytes
    assert.equal(check(edit(p, 'src/b.js', 'x', 'xyz', true), p).reason, null); // exactly 20,000
  });

  test('an old_string found more than once without replace_all passes: the tool refuses it', () => {
    const p = tempDir(); put(p, 'src/b.js', 'x\n'.repeat(5000));
    assert.equal(check(edit(p, 'src/b.js', 'x', pad(LIMIT_BYTES)), p).reason, null);
    assert.equal(check(edit(p, 'src/b.js', 'x', pad(LIMIT_BYTES), false), p).reason, null);
  });

  test('an old_string not in the file passes: the tool fails anyway', () => {
    const p = tempDir(); put(p, 'src/a.js', 'hello\n');
    assert.equal(check(edit(p, 'src/a.js', 'missing', pad(LIMIT_BYTES + 1)), p).reason, null);
    assert.equal(check(multi(p, 'src/a.js', [{ old_string: 'hello', new_string: pad(LIMIT_BYTES + 1) }, { old_string: 'missing', new_string: '' }]), p).reason, null);
  });

  test('MultiEdit applies its edits in order, each with its own replace_all', () => {
    const p = tempDir(); put(p, 'src/a.js', 'A' + pad(19990));
    // In order: A becomes BB, then BB becomes 50 Cs (20,040 bytes). Applied to the original, BB is not there.
    assert.ok(check(multi(p, 'src/a.js', [{ old_string: 'A', new_string: 'BB' }, { old_string: 'BB', new_string: 'C'.repeat(50) }]), p).reason);
    put(p, 'src/b.js', 'q\n'.repeat(5000));
    assert.ok(check(multi(p, 'src/b.js', [{ old_string: 'q', new_string: 'qqqq', replace_all: true }]), p).reason);
    assert.equal(check(multi(p, 'src/b.js', [{ old_string: 'q', new_string: 'qqqq' }]), p).reason, null);
  });

  test('an empty old_string on a missing file makes a new file of new_string', () => {
    const p = tempDir();
    assert.ok(check(edit(p, 'src/new.js', '', pad(LIMIT_BYTES + 1)), p).reason);
    assert.ok(check(multi(p, 'src/new2.js', [{ old_string: '', new_string: pad(LIMIT_BYTES + 1) }]), p).reason);
    assert.equal(check(edit(p, 'src/new3.js', 'x', pad(LIMIT_BYTES + 1)), p).reason, null);
  });

  test('an empty old_string on a file that is not blank passes: the tool refuses it', () => {
    const p = tempDir(); put(p, 'src/a.js', 'code\n');
    assert.equal(check(edit(p, 'src/a.js', '', pad(LIMIT_BYTES + 1)), p).reason, null);
    put(p, 'src/blank.js', '\n');
    assert.ok(check(edit(p, 'src/blank.js', '', pad(LIMIT_BYTES + 1)), p).reason);
  });

  test('$& and $$ in new_string count literally', () => {
    const p = tempDir(); put(p, 'src/a.js', 'x' + pad(19997)); // 19,998 bytes
    assert.ok(check(edit(p, 'src/a.js', 'x', '$&$&'), p).reason); // 20,001 bytes, not 19,999
    assert.ok(check(edit(p, 'src/a.js', 'x', '$$$$', true), p).reason);
  });
});

describe('file-size guard: options', () => {
  test('maxTokens sets the limit; an invalid value falls back to 5,000', () => {
    const p = tempDir();
    assert.ok(check(write(p, 'a.js', pad(401)), p, { maxTokens: 100 }).reason);
    assert.equal(check(write(p, 'a.js', pad(400)), p, { maxTokens: 100 }).reason, null);
    for (const bad of [-1, 0, 'x', null, Infinity]) {
      assert.equal(check(write(p, 'a.js', pad(LIMIT_BYTES)), p, { maxTokens: bad }).reason, null, String(bad));
      assert.ok(check(write(p, 'a.js', pad(LIMIT_BYTES + 1)), p, { maxTokens: bad }).reason, String(bad));
    }
  });

  test('pathLimits: the first matching glob wins, relative to the project root', () => {
    const p = tempDir();
    const options = { maxTokens: 100, pathLimits: { 'src/big.js': 6000, 'src/*.js': 50, 'docs/**': 'x' } };
    assert.equal(check(write(p, 'src/big.js', pad(24000)), p, options).reason, null);
    assert.ok(check(write(p, 'src/big.js', pad(24001)), p, options).reason);
    assert.ok(check(write(p, 'src/other.js', pad(201)), p, options).reason);
    assert.equal(check(write(p, 'lib/c.js', pad(400)), p, options).reason, null); // no glob: maxTokens
    assert.equal(check(write(p, 'docs/x/y.md', pad(400)), p, options).reason, null); // invalid value: maxTokens
    assert.ok(check(write(p, 'docs/x/y.md', pad(401)), p, options).reason);
  });

  test('a pathLimits entry in the project config raises the limit for that path only', () => {
    const p = makeRepo();
    put(p, '.claude/pau-skills.json', JSON.stringify({ 'file-size-guard': { pathLimits: { 'data/big.json': 8000 } } }));
    assert.equal(hook(p, write(p, 'data/big.json', pad(30000))).code, 0);
    assert.equal(hook(p, write(p, 'data/other.json', pad(30000))).code, 2);
  });
});

describe('file-size guard: switches', () => {
  // "It exits 0 on input it does not understand and checks `hookEnabled()`."
  test('turned off in the project config, or with PAU_SKILLS_DISABLE, it is silent', () => {
    const p = makeRepo(); mkdirSync(join(p, '.claude'));
    const input = write(p, 'src/a.js', pad(LIMIT_BYTES + 1));
    const on = hook(p, input);
    assert.equal(on.code, 2); assert.match(on.stderr, /file-size-guard/);
    writeFileSync(join(p, '.claude', 'pau-skills.json'), JSON.stringify({ hooks: { 'file-size-guard': false } }));
    assert.deepEqual(hook(p, input), { code: 0, stdout: '', stderr: '' });
    writeFileSync(join(p, '.claude', 'pau-skills.json'), '{}');
    assert.deepEqual(hook(p, input, { PAU_SKILLS_DISABLE: 'file-size-guard' }), { code: 0, stdout: '', stderr: '' });
  });
});

describe('file-size guard: inputs', () => {
  test('input it does not understand exits 0 silently', () => {
    const { dir: p, env } = plainDir(); put(p, 'dir/x', 'x');
    const big = pad(LIMIT_BYTES + 1);
    const inputs = [
      'not json', '', '[]', JSON.stringify({ tool_name: 'Write' }),
      { tool_name: 'Write', tool_input: 'x' },
      { tool_name: 'Read', tool_input: { file_path: join(p, 'a.js'), content: big } },
      { tool_name: 'NotebookEdit', tool_input: { notebook_path: join(p, 'a.ipynb'), new_source: big } },
      { tool_name: 'Write', tool_input: { file_path: 42, content: big } },
      { tool_name: 'Write', tool_input: { file_path: join(p, 'a.js'), content: 42 } },
      { tool_name: 'Edit', tool_input: { file_path: join(p, 'dir'), old_string: 'x', new_string: big } },
      { tool_name: 'Write', tool_input: { file_path: join(p, 'dir'), content: big } }, // unreadable: a folder
      { tool_name: 'MultiEdit', tool_input: { file_path: join(p, 'a.js'), edits: 'x' } },
    ];
    for (const input of inputs) assert.deepEqual(hook(p, input, env), { code: 0, stdout: '', stderr: '' }, JSON.stringify(input).slice(0, 80));
  });

  test('a path outside the project passes; a relative path is resolved against the project', () => {
    const p = tempDir(); const other = tempDir();
    assert.equal(check(write(other, 'notes.md', pad(LIMIT_BYTES + 1)), p).reason, null);
    assert.equal(check({ tool_name: 'Write', tool_input: { file_path: '../outside.md', content: pad(LIMIT_BYTES + 1) } }, p).reason, null);
    assert.ok(check({ tool_name: 'Write', tool_input: { file_path: 'src/rel.js', content: pad(LIMIT_BYTES + 1) } }, p).reason);
  });

  test('a project reached through a link still counts, from either side', () => {
    const real = makeRepo(); const link = join(tempDir(), 'link');
    symlinkSync(real, link, 'dir');
    assert.equal(hook(link, write(real, 'src/a.js', pad(LIMIT_BYTES + 1))).code, 2);
    assert.equal(hook(real, write(link, 'src/a.js', pad(LIMIT_BYTES + 1))).code, 2);
    assert.equal(hook(link, write(link, 'src/deep/new/a.js', pad(LIMIT_BYTES + 1))).code, 2);
  });

  test('a passing change reads at most one file and runs no git; only a refusal runs git', () => {
    const p = tempDir(); put(p, 'src/a.js', 'x' + pad(100));
    for (const input of [write(p, 'src/a.js', pad(200)), edit(p, 'src/a.js', 'x', 'y'), write(p, 'src/new.js', pad(10))]) {
      const { reason, calls } = check(input, p);
      assert.equal(reason, null);
      assert.ok(calls.reads <= 1, `reads: ${calls.reads}`);
      assert.equal(calls.git.length, 0);
    }
    const refused = check(write(p, 'src/a.js', pad(LIMIT_BYTES + 1)), p);
    assert.ok(refused.reason);
    assert.ok(refused.calls.git.length > 0);
  });
});
