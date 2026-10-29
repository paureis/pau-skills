// skill-eval triggers: a summary split into parts that fit the file-size rule, and --baseline reading those parts.
// splitSummary and mergeParts are pure; the split-summary command, the round's summary/ folder and --baseline with a
// folder run the command with the stand-in for `claude` (no model is called).
import { SCRIPT } from './skill-eval.helpers.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { runNode } from './helpers.mjs';
import { parseArgs } from '../skills/verification/skill-eval/skill-eval.mjs';

describe('split-summary options', () => {
  test('takes a summary file and --out, and needs --out', () => {
    const o = parseArgs(['split-summary', 'summary.json', '--out', 'parts']);
    assert.equal(o.cmd, 'split-summary');
    assert.equal(o.target, 'summary.json');
    assert.equal(o.out, 'parts');
    assert.throws(() => parseArgs(['split-summary', 'summary.json']), /split-summary needs --out/);
    assert.throws(() => parseArgs(['split-summary', 'summary.json', '--out', 'a', '--force']), /unknown option --force/);
  });

  test('a command or option named like an Object property is unknown, not a match', () => {
    for (const cmd of ['constructor', 'toString', '__proto__', 'hasOwnProperty']) {
      assert.throws(() => parseArgs([cmd, 'x']), new RegExp(`unknown command ${cmd}`), cmd);
      const r = runNode(SCRIPT, { args: [cmd, 'x'] });
      assert.equal(r.code, 2, cmd);
      assert.match(r.stderr, /unknown command/, cmd);
    }
    for (const flag of ['constructor', 'toString', '__proto__']) {
      assert.throws(() => parseArgs(['split-summary', 's.json', '--out', 'a', flag, 'x']), new RegExp(`unknown option ${flag}`), flag);
    }
  });

  test('the usage text lists split-summary and a folder for --baseline', () => {
    const r = runNode(SCRIPT, { args: [] });
    assert.equal(r.code, 2);
    assert.match(r.stderr, /skill-eval\.mjs split-summary <summary\.json> --out <folder>/);
    assert.match(r.stderr, /--baseline <summary\.json or folder>/);
  });
});
