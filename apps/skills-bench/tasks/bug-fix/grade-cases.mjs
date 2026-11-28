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
  // Prints lines that look like TAP counts before the real ones at the end.
  'test/log.test.mjs': `${head('..')}console.log('fail 0');\nconsole.log('pass 9');\n${regression}`,
  // One pass and one cancelled test: no failure counted, but node --test exits 1.
  'test/cancel.test.mjs': `${head('..')}${regression}test('waits for ever', () => new Promise(() => {}));\n`,
  // Passes only with the grader's TZ=UTC and LC_ALL=C, whatever the environment it was started from.
  'test/zone.test.mjs': `${head('..')}${regression}test('UTC and C', () => {
  assert.equal(new Date(0).getHours(), 0);
  assert.equal((1234.5).toLocaleString(), '1,234.5');
});
`,
  // Passes on start too, but only after 20 s there, so a short time-out cuts it off on start only.
  'test/slow.test.mjs': `${head('..')}test('waits on start', async () => {
  if (formatDate(addMonths(parseDate('2025-01-31'), 1)) !== '2025-02-28') await new Promise((r) => setTimeout(r, 20_000));
});
`,
  // Kills the node --test that runs it, so no counts are printed.
  'test/kill.test.mjs': "process.kill(process.ppid, 'SIGKILL');\n",
};
