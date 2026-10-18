// The suppression-reason hook reports, as context for the model, an edit to a code file that adds a lint or type-check
// suppression with no reason. It never blocks or approves.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { isCodeFile, unexplained, decide } from '../hooks/verification/suppression-reason.mjs';

const HOOK = repo('hooks', 'verification', 'suppression-reason.mjs');

// [name, file, before, after]: each adds one suppression that carries no reason.
const NO_REASON = [
  ['eslint-disable-next-line with a rule only', 'src/a.ts', 'run();', '// eslint-disable-next-line no-console\nrun();'],
  ['eslint-disable block', 'src/a.js', 'run();', '/* eslint-disable */\nrun();'],
  ['eslint-disable-line', 'src/a.jsx', 'run();', 'run(); // eslint-disable-line react/no-danger'],
  ['@ts-ignore', 'src/a.ts', 'x.y();', '// @ts-ignore\nx.y();'],
  ['@ts-expect-error bare', 'src/a.tsx', 'x.y();', '// @ts-expect-error\nx.y();'],
  ['@ts-ignore with only a colon', 'src/a.ts', 'x.y();', '// @ts-ignore:\nx.y();'],
  ['//nolint with an empty comment', 'pkg/a.go', 'f()', 'f() //nolint:errcheck //'],
  ['eslint with dots for a reason', 'src/a.ts', 'run();', '// eslint-disable-next-line no-console -- ...\nrun();'],
  ['# noqa', 'app/a.py', 'import os', 'import os  # noqa'],
  ['# noqa with codes only', 'app/a.py', 'import os', 'import os  # noqa: F401, E501'],
  ['# type: ignore', 'app/a.py', 'x = f()', 'x = f()  # type: ignore'],
  ['# type: ignore[code]', 'app/a.py', 'x = f()', 'x = f()  # type: ignore[attr-defined]'],
  ['pylint: disable', 'app/a.py', 'def f(): pass', '# pylint: disable=broad-except\ndef f(): pass'],
  ['//nolint', 'pkg/a.go', 'f()', 'f() //nolint'],
  ['//nolint with linters only', 'pkg/a.go', 'f()', 'f() //nolint:errcheck,gosec'],
  ['NOLINT', 'src/a.cpp', 'int x;', 'int x; // NOLINT(cert-err58-cpp)'],
  ['NOLINTNEXTLINE', 'src/a.cc', 'int x;', '// NOLINTNEXTLINE\nint x;'],
  ['#[allow(', 'src/lib.rs', 'fn f() {}', '#[allow(dead_code)]\nfn f() {}'],
  ['#![allow(', 'src/lib.rs', 'mod a;', '#![allow(clippy::all)]\nmod a;'],
  ['@SuppressWarnings', 'src/A.java', 'void f() {}', '@SuppressWarnings("unchecked")\nvoid f() {}'],
  ['@Suppress', 'src/A.kt', 'fun f() {}', '@Suppress("UNUSED_PARAMETER")\nfun f() {}'],
  ['rubocop:disable', 'lib/a.rb', 'def f; end', '# rubocop:disable Metrics/MethodLength\ndef f; end'],
  ['#pragma warning disable', 'src/A.cs', 'var x = Old();', '#pragma warning disable CS0618\nvar x = Old();'],
  ['phpcs:ignore', 'src/a.php', '$x = 1;', '// phpcs:ignore Generic.Files.LineLength\n$x = 1;'],
];

// [name, file, before, after]: each adds a suppression with a reason, in the tool's own syntax or on the line above.
const WITH_REASON = [
  ['eslint -- why', 'src/a.ts', 'run();', '// eslint-disable-next-line no-console -- the CLI prints to stdout\nrun();'],
  ['eslint block -- why', 'src/a.js', 'run();', '/* eslint-disable no-undef -- browser globals */\nrun();'],
  ['@ts-expect-error with text', 'src/a.ts', 'x.y();', '// @ts-expect-error the typings miss y, fixed upstream in 2.1\nx.y();'],
  ['@ts-ignore with text after a colon', 'src/a.ts', 'x.y();', '// @ts-ignore: generated client has no types\nx.y();'],
  ['noqa with text', 'app/a.py', 'import os', 'import os  # noqa: F401  re-exported for plugins'],
  ['type: ignore with a comment', 'app/a.py', 'x = f()', 'x = f()  # type: ignore[attr-defined]  # stub is out of date'],
  ['pylint with a comment', 'app/a.py', 'def f(): pass', '# pylint: disable=broad-except  # any failure is logged and retried\ndef f(): pass'],
  ['nolint with // why', 'pkg/a.go', 'f()', 'f() //nolint:errcheck // close error is not actionable here'],
  ['NOLINT with text', 'src/a.cpp', 'int x;', 'int x; // NOLINT(cert-err58-cpp): constructed before main on purpose'],
  ['Rust reason =', 'src/lib.rs', 'fn f() {}', '#[allow(dead_code, reason = "used by the wasm build only")]\nfn f() {}'],
  ['comment on the line above (Rust)', 'src/lib.rs', 'fn f() {}', '// Used only by the wasm build.\n#[allow(dead_code)]\nfn f() {}'],
  ['comment on the line above (Python)', 'app/a.py', 'import os', '# Re-exported for plugins.\nimport os  # noqa: F401'],
  ['Java trailing comment', 'src/A.java', 'void f() {}', '@SuppressWarnings("unchecked") // raw list from the legacy API\nvoid f() {}'],
  ['rubocop -- why', 'lib/a.rb', 'def f; end', '# rubocop:disable Metrics/MethodLength -- one table of cases, clearer inline\ndef f; end'],
  ['pragma with a comment', 'src/A.cs', 'var x = Old();', '#pragma warning disable CS0618 // replacement lands in v3\nvar x = Old();'],
  ['phpcs -- why', 'src/a.php', '$x = 1;', '// phpcs:ignore Generic.Files.LineLength -- a URL\n$x = 1;'],
];

describe('suppression-reason: which files are code', () => {
  for (const p of ['src/a.ts', 'app/a.py', 'pkg/a.go', 'src/lib.rs', 'src/A.java', 'src/A.kt', 'lib/a.rb', 'src/A.cs',
    'src/a.php', 'src/a.cpp', 'src/a.c', 'src/a.h', 'web/a.vue', 'C:\\repo\\src\\a.ts']) {
    test(`code: ${p}`, () => assert.ok(isCodeFile(p)));
  }
  for (const p of ['README.md', 'notes.txt', 'config.yaml', 'package.json', 'node_modules/x/index.js', 'vendor/lib/a.go',
    'third_party/a.cc', 'dist/app.js', 'build/gen.ts', 'target/debug/build.rs', 'web/app.min.js', 'api/x_pb2.py',
    'api/x.pb.go', 'src/generated/client.ts', '.venv/lib/site.py', '']) {
    test(`not checked: ${p || '(empty)'}`, () => assert.equal(isCodeFile(p), false));
  }
  test('ignorePaths adds globs to skip', () => assert.equal(isCodeFile('legacy/a.ts', ['legacy/**']), false));
});

describe('suppression-reason: counting', () => {
  for (const [name, file, before, after] of NO_REASON) {
    test(`reports: ${name}`, () => {
      const out = decide({ tool_name: 'Edit', tool_input: { file_path: file, old_string: before, new_string: after } });
      assert.ok(out, name);
      assert.match(out.hookSpecificOutput.additionalContext, /suppression-reason/);
    });
  }
  for (const [name, file, before, after] of WITH_REASON) {
    test(`silent: ${name}`, () => {
      assert.equal(decide({ tool_name: 'Edit', tool_input: { file_path: file, old_string: before, new_string: after } }), null, name);
    });
  }
  test('a rule code alone is not a reason', () => {
    assert.equal(unexplained('// eslint-disable-next-line no-console\nrun();', 'src/a.ts').length, 1);
    assert.equal(unexplained('import os  # noqa: F401', 'app/a.py').length, 1);
  });
  test('another suppression after one is not its reason', () => {
    assert.equal(unexplained('x = f()  # type: ignore  # noqa', 'app/a.py').length, 2);
  });
  test('formatter directives are not suppressions', () => {
    assert.deepEqual(unexplained('// prettier-ignore\nconst m = [1,0,\n 0,1];\n# fmt: off\n// clang-format off', 'src/a.ts'), []);
  });
  test('the enable half of a pair is not a suppression', () => {
    assert.deepEqual(unexplained('/* eslint-enable */\n// NOLINTEND\n# rubocop:enable Metrics/AbcSize\n#pragma warning restore CS0618', 'src/a.ts'), []);
  });
  test('silent when the edit removes a suppression', () => {
    const input = { tool_name: 'Edit', tool_input: { file_path: 'src/a.ts', old_string: '// @ts-ignore\nx.y();', new_string: 'x.y();' } };
    assert.equal(decide(input), null);
  });
  test('silent when an existing suppression is left as it was', () => {
    const before = '// @ts-ignore\nx.y();\nconst a = 1;';
    const input = { tool_name: 'Edit', tool_input: { file_path: 'src/a.ts', old_string: before, new_string: before.replace('a = 1', 'a = 2') } };
    assert.equal(decide(input), null);
  });
  test('reports only the increase', () => {
    const before = '// @ts-ignore\nx.y();';
    const after = '// @ts-ignore\nx.y();\n// @ts-ignore\nz.w();';
    const out = decide({ tool_name: 'Edit', tool_input: { file_path: 'src/a.ts', old_string: before, new_string: after } });
    assert.match(out.hookSpecificOutput.additionalContext, /adds 1 /);
  });
  test('silent on a non-code file', () => {
    const input = { tool_name: 'Write', tool_input: { file_path: 'docs/lint.md', content: 'Use `// eslint-disable-next-line` sparingly.\n// @ts-ignore' } };
    assert.equal(decide(input, { readFile: () => '' }), null);
  });
  test('Write compares against the file on disk', () => {
    const input = { tool_name: 'Write', tool_input: { file_path: 'app/a.py', content: 'import os  # noqa\n' } };
    assert.equal(decide(input, { readFile: () => 'import os  # noqa\n' }), null);
    assert.ok(decide(input, { readFile: () => 'import os\n' }));
    assert.ok(decide(input, { readFile: () => null }));
  });
  test('MultiEdit adds up its edits', () => {
    const input = { tool_name: 'MultiEdit', tool_input: { file_path: 'pkg/a.go', edits: [
      { old_string: 'f()', new_string: 'f() //nolint' }, { old_string: 'g()', new_string: 'g() //nolint:errcheck // why: best effort' },
    ] } };
    assert.match(decide(input).hookSpecificOutput.additionalContext, /adds 1 /);
  });
});

describe('suppression-reason: output', () => {
  test('reports through additionalContext only, never a permission decision', () => {
    const out = decide({ tool_name: 'Edit', tool_input: { file_path: 'src/a.ts', old_string: 'x', new_string: '// @ts-ignore\nx' } });
    assert.deepEqual(Object.keys(out), ['hookSpecificOutput']);
    assert.deepEqual(Object.keys(out.hookSpecificOutput).sort(), ['additionalContext', 'hookEventName']);
    assert.equal(out.hookSpecificOutput.hookEventName, 'PreToolUse');
    assert.match(out.hookSpecificOutput.additionalContext, /@ts-ignore/);
  });
  test('other tools and odd input give nothing', () => {
    assert.equal(decide({ tool_name: 'Bash', tool_input: { command: 'x' } }), null);
    assert.equal(decide(null), null);
    assert.equal(decide({ tool_name: 'Edit', tool_input: { file_path: 'src/a.ts', old_string: 1, new_string: 2 } }), null);
  });
});

describe('suppression-reason: as a hook', () => {
  const project = () => {
    const p = tempDir(); mkdirSync(join(p, 'src'));
    writeFileSync(join(p, 'src', 'a.ts'), 'x.y();\n');
    return p;
  };
  const write = (p) => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Write', cwd: p,
    tool_input: { file_path: join(p, 'src', 'a.ts'), content: '// @ts-ignore\nx.y();\n' } });

  test('prints additionalContext for a Write that adds a reason-less suppression, exit 0, nothing on stderr', () => {
    const p = project();
    const r = runNode(HOOK, { input: write(p), env: { PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: '', PAU_SKILLS_DISABLE: '' } });
    assert.equal(r.code, 0);
    assert.equal(r.stderr, '');
    const out = JSON.parse(r.stdout);
    assert.match(out.hookSpecificOutput.additionalContext, /@ts-ignore/);
    assert.equal(out.hookSpecificOutput.permissionDecision, undefined);
  });
  test('silent when turned off in the project config', () => {
    const p = project(); mkdirSync(join(p, '.claude'));
    writeFileSync(join(p, '.claude', 'pau-skills.json'), JSON.stringify({ hooks: { 'suppression-reason': false } }));
    const r = runNode(HOOK, { input: write(p), env: { PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: '', PAU_SKILLS_DISABLE: '' } });
    assert.equal(r.code, 0); assert.equal(r.stdout, ''); assert.equal(r.stderr, '');
  });
  test('silent when turned off with PAU_SKILLS_DISABLE', () => {
    const p = project();
    const r = runNode(HOOK, { input: write(p), env: { PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: '', PAU_SKILLS_DISABLE: 'suppression-reason' } });
    assert.equal(r.code, 0); assert.equal(r.stdout, '');
  });
  for (const [name, input] of [['not JSON', 'x'], ['empty', ''], ['an array', '[1]'], ['no tool input', '{"tool_name":"Edit"}'],
    ['a path that is not a string', '{"tool_name":"Write","tool_input":{"file_path":7,"content":"# noqa"}}']]) {
    test(`malformed input (${name}): exit 0, silent`, () => {
      const r = runNode(HOOK, { input, env: { PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: '' } });
      assert.equal(r.code, 0); assert.equal(r.stdout, ''); assert.equal(r.stderr, '');
    });
  }
});

describe('suppression-reason: review fixes', () => {
  const edit = (file, after, before = '') => decide({ tool_name: 'Edit', tool_input: { file_path: file, old_string: before, new_string: after } });

  // S1: a marker counts only where the tool honours it.
  test('a comment that explains and names the directive is a reason, not a suppression', () => {
    assert.equal(edit('src/a.ts', '// We need eslint-disable-next-line here: the CLI prints to stdout.\n// eslint-disable-next-line no-console\nrun();'), null);
  });
  test('a directive inside a string literal is not a suppression', () => {
    assert.equal(edit('src/a.ts', 'const help = "// eslint-disable-next-line is banned here";\nconst t = \'// @ts-ignore\';'), null);
    assert.equal(edit('app/a.py', 'msg = "use # noqa sparingly"\nother = \'# type: ignore\''), null);
  });
  test('prose in a comment that mentions a directive is not a suppression', () => {
    assert.equal(edit('src/a.ts', '// Do not use @ts-ignore\nx.y();'), null);
  });
  test("writing the hook's own source reports nothing", () => {
    const source = readFileSync(HOOK, 'utf8');
    assert.equal(decide({ tool_name: 'Write', tool_input: { file_path: 'hooks/x.mjs', content: source } }, { readFile: () => null }), null);
  });

  // S2: the closer of an HTML comment is not a "-- reason".
  test('a bare eslint directive in an HTML comment is reported', () => {
    assert.ok(edit('web/A.vue', '<!-- eslint-disable-next-line vue/no-v-html -->\n<div v-html="x" />'));
    assert.ok(edit('web/A.svelte', '<!-- eslint-disable-next-line -->\n{@html x}'));
    assert.ok(edit('web/A.vue', '<!-- eslint-disable-line --> <div v-html="htmlContent"></div>'));
  });
  test('an eslint directive with a reason in an HTML comment is silent', () => {
    assert.equal(edit('web/A.vue', '<!-- eslint-disable-next-line vue/no-v-html -- trusted markdown from our CMS -->\n<div v-html="x" />'), null);
  });

  // S3: vendored and generated folders are judged relative to the project root.
  test('a project inside a folder named build is checked', () => {
    const root = '/home/me/build/proj';
    const out = decide({ tool_name: 'Edit', tool_input: { file_path: `${root}/src/a.ts`, old_string: 'x', new_string: '// @ts-ignore\nx' } }, { root });
    assert.ok(out);
  });
  test('source folders named build, out, gen or target below the root are checked', () => {
    for (const p of ['src/build/a.ts', 'src/out/a.ts', 'lib/gen/a.py', 'src/target/a.rs']) assert.ok(isCodeFile(p), p);
  });
  test('build output and vendored folders are judged from the project root, given absolute paths', () => {
    const at = (root, p) => decide({ tool_name: 'Edit', tool_input: { file_path: `${root}/${p}`, old_string: 'x', new_string: '// @ts-ignore\nx' } }, { root });
    assert.equal(at('/repo', 'dist/app.js'), null);
    assert.ok(at('/home/me/vendor/proj', 'src/a.ts'));
  });
  test('build output at the project root is still skipped', () => {
    for (const p of ['build/a.ts', 'out/a.js', 'gen/a.go', 'target/debug/a.rs', 'dist/a.js']) assert.equal(isCodeFile(p), false, p);
  });

  // S4: an error code alone is not a reason.
  test('a TypeScript error code alone is not a reason', () => {
    assert.ok(edit('src/a.ts', '// @ts-expect-error TS2322\nconst n: number = "x";'));
    assert.ok(edit('src/a.ts', '// @ts-ignore: TS2339, TS2345\nx.y();'));
    assert.ok(edit('pkg/a.go', 'f() //nolint:staticcheck // SA1019'));
  });

  // S6: each edit of a MultiEdit is judged on its own; doc comments, license and encoding lines are not reasons.
  test('a comment at the end of one MultiEdit edit does not explain a suppression in the next', () => {
    const input = { tool_name: 'MultiEdit', tool_input: { file_path: 'src/a.ts', edits: [
      { old_string: 'a()', new_string: 'a()\n// Load the config before anything else.' }, { old_string: 'b()', new_string: '// @ts-ignore\nb()' },
    ] } };
    assert.ok(decide(input));
  });
  test('a doc comment, a license header or an encoding line above is not a reason', () => {
    assert.ok(edit('src/lib.rs', '/// Returns the answer.\n#[allow(dead_code)]\nfn f() {}'));
    assert.ok(edit('src/a.ts', '/** The answer. */\n// @ts-ignore\nx.y();'));
    assert.ok(edit('src/a.ts', '// SPDX-License-Identifier: MIT\n// eslint-disable-next-line no-console\nrun();'));
    assert.ok(edit('app/a.py', '# -*- coding: utf-8 -*-\nimport os  # noqa'));
  });

  // S7: multi-line attributes carry their reason further down.
  test('a multi-line Rust allow with a reason is silent; without one it is reported', () => {
    assert.equal(edit('src/lib.rs', '#[allow(\n    dead_code,\n    reason = "used by the wasm build only"\n)]\nfn f() {}'), null);
    assert.ok(edit('src/lib.rs', '#[allow(\n    dead_code,\n    unused_imports\n)]\nfn f() {}'));
  });
  test('a multi-line SuppressWarnings with a trailing comment is silent', () => {
    assert.equal(edit('src/A.java', '@SuppressWarnings({\n    "unchecked",\n    "rawtypes"\n}) // raw lists from the legacy API\nvoid f() {}'), null);
    assert.ok(edit('src/A.java', '@SuppressWarnings({\n    "unchecked",\n    "rawtypes"\n})\nvoid f() {}'));
  });

  // S8: big inputs stay inside the hook's 5 second timeout.
  test('an input over the size cap is skipped silently', () => {
    const big = '// @ts-ignore\n'.repeat(80000);
    const t = Date.now();
    assert.equal(edit('src/a.ts', big), null);
    assert.ok(Date.now() - t < 1000);
  });
  test('a crafted input under the cap finishes quickly', () => {
    const crafted = '// ' + 'word '.repeat(80000) + '\n' + '//nolint '.repeat(20000) + '\n';
    const t = Date.now();
    edit('pkg/a.go', crafted);
    assert.ok(Date.now() - t < 2000, `took ${Date.now() - t} ms`);
  });
});

// S5: the real Write path reads the file on disk.
describe('suppression-reason: Write over a real file', () => {
  const setup = () => {
    const p = tempDir(); mkdirSync(join(p, 'src'));
    writeFileSync(join(p, 'src', 'a.ts'), '// @ts-ignore\nx.y();\n// @ts-ignore\nz.w();\n');
    return p;
  };
  const run = (p, content) => runNode(HOOK, { input: JSON.stringify({ tool_name: 'Write', cwd: p,
    tool_input: { file_path: join(p, 'src', 'a.ts'), content } }), env: { PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: '', PAU_SKILLS_DISABLE: '' } });
  test('rewriting a file that already has bare suppressions is silent', () => {
    const p = setup();
    const r = run(p, '// @ts-ignore\nx.y();\n// @ts-ignore\nz.w();\nconst added = 1;\n');
    assert.equal(r.code, 0); assert.equal(r.stdout, '');
  });
  test('adding one more is reported', () => {
    const p = setup();
    const r = run(p, '// @ts-ignore\nx.y();\n// @ts-ignore\nz.w();\n// @ts-ignore\nq.r();\n');
    assert.match(JSON.parse(r.stdout).hookSpecificOutput.additionalContext, /adds 1 /);
  });
  test('a project under a folder named build is checked end to end', () => {
    const base = tempDir(); const p = join(base, 'build', 'proj'); mkdirSync(join(p, 'src'), { recursive: true });
    writeFileSync(join(p, 'src', 'a.ts'), 'x.y();\n');
    const r = run(p, '// @ts-ignore\nx.y();\n');
    assert.match(r.stdout, /suppression-reason/);
  });
});
