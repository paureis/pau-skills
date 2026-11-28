// Test files a run of the month-end-renewal task could add, used by tests/skills-bench-tasks-bug-fix.test.mjs to check
// how grade.mjs reads them. Each runs next to the reference fix of src/renewal.mjs. Data only: the assertions about
// the grade stay in the self-check.
const head = (up) => [
  "import { test } from 'node:test';",
  "import assert from 'node:assert/strict';",
  `import { parseDate, formatDate, addMonths } from '${up}/src/renewal.mjs';`,
  '',
].join('\n');
const regression = "test('January 31 plus a month', () => assert.equal(formatDate(addMonths(parseDate('2025-01-31'), 1)), '2025-02-28'));\n";

export const CASES = {
  // At the top of the project, named as Node's test-* pattern allows with nothing after the dash.
  'test-.mjs': head('.') + regression,
};
