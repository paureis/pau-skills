// The test-tamper guard asks before an edit to a test file adds a skip or focus marker or removes assertions.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { isTestFile, findings, decide } from '../hooks/verification/test-tamper-guard.mjs';

const GUARD = repo('hooks', 'verification', 'test-tamper-guard.mjs');

describe('test-tamper guard: which files are tests', () => {
  for (const p of ['src/a.test.ts', 'src/a.spec.js', 'tests/test_api.py', 'pkg/api_test.go', 'src/test/java/FooTest.java',
    'Foo.Tests/BarTests.cs', 'spec/models/user_spec.rb', '__tests__/x.js', 'test/unit/x.exs', 'C:\\repo\\tests\\a.py']) {
    test(`test file: ${p}`, () => assert.ok(isTestFile(p)));
  }
  for (const p of ['src/app.ts', 'src/testing-utils-not.ts', 'lib/contest.py', 'README.md', '']) {
    test(`not a test file: ${p || '(empty)'}`, () => assert.equal(isTestFile(p), false));
  }
  test('extraTestPaths adds globs', () => assert.ok(isTestFile('checks/smoke.sh', ['checks/**'])));
});

describe('test-tamper guard: findings', () => {
  const ADDS = [
    ['JS skip', "it('works', () => {", "it.skip('works', () => {"],
    ['JS focus', "describe('x', () => {", "describe.only('x', () => {"],
    ['xit', "it('a', f)", "xit('a', f)"],
    ['pytest skip', 'def test_a():', '@pytest.mark.skip(reason="flaky")\ndef test_a():'],
    ['pytest xfail', 'def test_a():', '@pytest.mark.xfail\ndef test_a():'],
    ['unittest skip', '    def test_a(self):', '    @unittest.skip("later")\n    def test_a(self):'],
    ['Go skip', 'func TestA(t *testing.T) {', 'func TestA(t *testing.T) {\n\tt.Skip("flaky")'],
    ['Rust ignore', '#[test]\nfn a() {}', '#[test]\n#[ignore]\nfn a() {}'],
    ['JUnit disabled', '@Test\nvoid a() {}', '@Disabled\n@Test\nvoid a() {}'],
    ['xUnit skip', '[Fact]', '[Fact(Skip = "later")]'],
    ['RSpec skip', "  it 'a' do", "  xit 'a' do"],
    ['PHPUnit skip', 'public function testA() {', 'public function testA() {\n$this->markTestSkipped("x");'],
  ];
  for (const [n, before, after] of ADDS) test(`flags ${n}`, () => assert.ok(findings(before, after).length, n));
  test('flags removed assertions', () => {
    const f = findings('expect(a).toBe(1);\nexpect(b).toBe(2);', 'expect(a).toBe(1);');
    assert.ok(f.some((x) => /removes/.test(x)));
    assert.ok(findings('assert x == 1\nassert y == 2', 'assert x == 1').length);
  });
  test('a skip marker that was already there is not new', () => {
    assert.deepEqual(findings("it.skip('a', f)\nit('b', g)", "it.skip('a', f)\nit('b', h)"), []);
  });
  test('removing a skip and adding assertions is fine', () => {
    assert.deepEqual(findings("it.skip('a', () => {})", "it('a', () => { expect(x).toBe(1) })"), []);
  });
});

describe('test-tamper guard: decide', () => {
  test('asks by default, denies in deny mode', () => {
    const input = { tool_name: 'Edit', tool_input: { file_path: 'src/a.test.ts', old_string: "it('a'", new_string: "it.only('a'" } };
    assert.equal(decide(input).hookSpecificOutput.permissionDecision, 'ask');
    assert.equal(decide(input, { options: { mode: 'deny' } }).hookSpecificOutput.permissionDecision, 'deny');
  });
  test('Write compares against the file on disk', () => {
    const input = { tool_name: 'Write', tool_input: { file_path: 'tests/test_a.py', content: 'def test_a():\n    pass\n' } };
    const read = () => 'def test_a():\n    assert f() == 1\n';
    assert.ok(decide(input, { readFile: read }));
    assert.equal(decide(input, { readFile: () => null }), null);
  });
  test('non-test files and other tools pass', () => {
    assert.equal(decide({ tool_name: 'Edit', tool_input: { file_path: 'src/a.ts', old_string: 'it(', new_string: 'it.skip(' } }), null);
    assert.equal(decide({ tool_name: 'Bash', tool_input: { command: 'x' } }), null);
  });
});

describe('test-tamper guard: as a hook', () => {
  test('prints an ask decision for a Write that drops assertions from an existing file', () => {
    const p = tempDir(); mkdirSync(join(p, 'tests'));
    writeFileSync(join(p, 'tests', 'test_a.py'), 'def test_a():\n    assert 1 == 1\n');
    const input = JSON.stringify({ tool_name: 'Write', cwd: p, tool_input: { file_path: join(p, 'tests', 'test_a.py'), content: 'def test_a():\n    pass\n' } });
    const r = runNode(GUARD, { input, env: { PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: '' } });
    assert.equal(r.code, 0);
    assert.equal(JSON.parse(r.stdout).hookSpecificOutput.permissionDecision, 'ask');
  });
  test('silent on odd input', () => {
    const r = runNode(GUARD, { input: 'x' });
    assert.equal(r.code, 0); assert.equal(r.stdout, '');
  });
});
