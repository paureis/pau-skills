#!/usr/bin/env node
// PreToolUse guard for Write, Edit and MultiEdit on test files: stop and ask before a test is skipped, focused or
// stripped of assertions.
//
// Why: when a test fails and the goal is "make CI green", the cheapest edit is to the test: add .skip, mark it xfail,
// comment out the assertion, or loosen it until it passes. The agent then reports green, and the bug the test caught
// ships. Sometimes skipping really is right (a known upstream issue, a platform-only test), so this guard asks the
// user instead of refusing. A focused test (.only, fit, fdescribe) is caught too: committed by accident it silently
// turns off every other test in the file.
//
// A file counts as a test by its path: test/ tests/ spec/ __tests__/ folders, *.test.* *.spec.*, *_test.*, test_*.py,
// *Test.java/kt, *Tests.cs, *_spec.rb. The edit is flagged when it ADDS a skip or focus marker that the old text did
// not have, or when it lowers the number of assertions. Markers cover JavaScript/TypeScript, Python, Go, Rust, Java,
// Kotlin, C#, Ruby, PHP, Elixir and Dart.
//
// Option in .claude/pau-skills.json: { "test-tamper-guard": { "mode": "deny" } } refuses instead of asking
// (default "ask"). "extraTestPaths": ["checks/**"] adds globs that count as test files.
//
// Writes a PreToolUse permission decision as JSON on stdout. Exits 0 always; silent on input it does not understand.
import { readFileSync, realpathSync } from 'node:fs';
import { basename, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, hookOptions, projectDir, readStdin, parseInput } from './config.mjs';

export const NAME = 'test-tamper-guard';

const TEST_PATH = [
  /(^|[\\/])(tests?|specs?|__tests__|testing|e2e)[\\/]/i,
  /\.(test|spec)\.[a-z0-9]+$/i,
  /_(test|spec)\.[a-z0-9]+$/i,
  /(^|[\\/])test_[^\\/]+\.py$/i,
  /Tests?\.(java|kt|scala|cs|swift|php)$/,
];

export function isTestFile(path, extra = []) {
  if (typeof path !== 'string' || !path) return false;
  const p = path.replace(/\\/g, '/');
  return TEST_PATH.some((re) => re.test(p)) || extra.some((g) => globToRegExp(g).test(p) || globToRegExp(g).test(basename(p)));
}

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('(^|/)' + re + '$');
}

// [label, regex] for markers that turn a test off or narrow the run to one test.
export const MARKERS = [
  ['skip (JS/TS)', /\b(?:it|test|describe|context|suite|bench)\.skip\b|\b(?:xit|xtest|xdescribe|xcontext)\s*\(/g],
  ['focus (JS/TS)', /\b(?:it|test|describe|context|suite)\.only\b|\b(?:fit|fdescribe|fcontext)\s*\(/g],
  ['todo instead of a test (JS/TS)', /\b(?:it|test)\.todo\s*\(/g],
  ['pytest skip/xfail', /@pytest\.mark\.(?:skip|skipif|xfail)\b|\bpytest\.(?:skip|xfail)\s*\(/g],
  ['unittest skip', /@unittest\.(?:skip|skipIf|skipUnless|expectedFailure)\b|\bself\.skipTest\s*\(/g],
  ['Go skip', /\bt\.(?:Skip|SkipNow|Skipf)\s*\(/g],
  ['Rust ignore', /#\[ignore\b/g],
  ['JUnit/Kotlin disable', /@(?:Ignore|Disabled|DisabledIf\w*)\b/g],
  ['C#/NUnit/xUnit skip', /\[(?:Ignore|Explicit)\b|Skip\s*=\s*"/g],
  ['RSpec skip/pending', /^\s*(?:skip|pending|xit|xspecify|xexample|xscenario)\b/gm],
  ['PHPUnit skip', /\$this->markTest(?:Skipped|Incomplete)\s*\(|@group\s+skip/g],
  ['ExUnit skip', /@tag\s+:skip\b|@moduletag\s+:skip\b/g],
  ['Dart skip', /\bskip\s*:\s*(?:true|')/g],
];

// Assertion calls across common frameworks. Counted, not parsed: a drop in the count is the signal.
const ASSERTIONS = /\b(?:assert\w*|expect|should|must|require\.\w+|refute\w*|verify)\s*[(.!]|\bassert\s|\bt\.(?:Error|Errorf|Fatal|Fatalf|Fail|FailNow)\s*\(|\$this->assert\w*\s*\(|\bAssert\.\w+\s*\(|\bto(?:Be|Equal|Have|Throw|Match|Contain)\w*\s*\(/g;

const count = (text, re) => (text.match(new RegExp(re.source, re.flags)) || []).length;

/** What the edit adds that tampers with tests, as a list of strings (empty when nothing is wrong). */
export function findings(before, after) {
  const out = [];
  for (const [label, re] of MARKERS) {
    const added = count(after, re) - count(before, re);
    if (added > 0) out.push(`adds ${added} ${label} marker${added > 1 ? 's' : ''}`);
  }
  const lost = count(before, ASSERTIONS) - count(after, ASSERTIONS);
  if (lost > 0) out.push(`removes ${lost} assertion${lost > 1 ? 's' : ''}`);
  return out;
}

/** The before and after text of the edit, or null for a tool this guard does not check. */
export function beforeAfter(toolName, input, readFile) {
  if (!input || typeof input !== 'object') return null;
  if (toolName === 'Edit' && typeof input.old_string === 'string' && typeof input.new_string === 'string') {
    return { before: input.old_string, after: input.new_string };
  }
  if (toolName === 'MultiEdit' && Array.isArray(input.edits)) {
    return { before: input.edits.map((e) => e?.old_string || '').join('\n'), after: input.edits.map((e) => e?.new_string || '').join('\n') };
  }
  if (toolName === 'Write' && typeof input.content === 'string') {
    return { before: readFile(input.file_path) ?? '', after: input.content };
  }
  return null;
}

/** Pure decision: the hook output object, or null. */
export function decide(input, { root = process.cwd(), options = {}, readFile = () => null } = {}) {
  if (!input || typeof input !== 'object') return null;
  const path = input.tool_input?.file_path;
  if (!isTestFile(path, Array.isArray(options.extraTestPaths) ? options.extraTestPaths : [])) return null;
  const ba = beforeAfter(input.tool_name, input.tool_input, (p) => readFile(resolve(root, p)));
  if (!ba) return null;
  const found = findings(ba.before, ba.after);
  if (!found.length) return null;
  const mode = options.mode === 'deny' ? 'deny' : 'ask';
  return {
    hookSpecificOutput: {
      hookEventName: 'PreToolUse',
      permissionDecision: mode,
      permissionDecisionReason:
        `[test-tamper-guard] This edit to ${path} ${found.join(' and ')}. Weakening a test to get green hides the bug ` +
        'it caught. Fix the code under test, or tell the user why this test should change and let them approve it.',
    },
  };
}

const readFileOrNull = (p) => { try { return readFileSync(p, 'utf8'); } catch { return null; } };

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  const input = parseInput(await readStdin());
  if (input) {
    const root = projectDir(input);
    const config = loadConfig({ project: root });
    if (hookEnabled(NAME, config)) {
      const out = decide(input, { root, options: hookOptions(NAME, config), readFile: readFileOrNull });
      if (out) process.stdout.write(JSON.stringify(out) + '\n');
    }
  }
  process.exit(0);
}
