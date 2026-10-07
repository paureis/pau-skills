// The minutes estimate: per-job round-up with a one-minute floor, skipped and unfinished jobs bill nothing, runner
// multipliers apply, grouping counts each run once per group, and minutes of cancelled or failed runs are reported.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { repo, runNode } from './helpers.mjs';
import { billedMinutes, multiplierFor, group, keyOf, parseArgs } from '../skills/verification/ci-cost-and-cadence/measure-minutes.mjs';

const SCRIPT = repo('skills', 'verification', 'ci-cost-and-cadence', 'measure-minutes.mjs');
const at = (s) => new Date(Date.UTC(2026, 0, 1, 0, 0, s)).toISOString();
const job = (name, seconds, extra = {}) => ({ name, conclusion: 'success', started_at: at(0), completed_at: at(seconds), labels: ['ubuntu-latest'], ...extra });

test('billedMinutes rounds each job up to the whole minute, with a one-minute floor', () => {
  assert.equal(billedMinutes(job('a', 10)), 1);
  assert.equal(billedMinutes(job('a', 60)), 1);
  assert.equal(billedMinutes(job('a', 61)), 2);
  assert.equal(billedMinutes(job('a', 0)), 1);
});

test('skipped, unfinished and malformed jobs bill nothing', () => {
  assert.equal(billedMinutes(job('a', 300, { conclusion: 'skipped' })), 0);
  assert.equal(billedMinutes(job('a', 300, { completed_at: null })), 0);
  assert.equal(billedMinutes(job('a', 300, { started_at: null })), 0);
  assert.equal(billedMinutes({ ...job('a', 0), completed_at: at(-120) }), 0);
  assert.equal(billedMinutes(null), 0);
});

test('a cancelled or failed job still bills what it ran', () => {
  assert.equal(billedMinutes(job('a', 125, { conclusion: 'cancelled' })), 3);
  assert.equal(billedMinutes(job('a', 125, { conclusion: 'failure' })), 3);
});

test('runner multipliers: Linux 1, Windows 2, macOS 10, self-hosted 0', () => {
  assert.equal(multiplierFor(['ubuntu-latest']), 1);
  assert.equal(multiplierFor(['windows-latest']), 2);
  assert.equal(multiplierFor(['macos-14']), 10);
  assert.equal(multiplierFor(['self-hosted', 'linux']), 0);
  assert.equal(billedMinutes(job('a', 61, { labels: ['windows-latest'] })), 4);
});

test('group sums by workflow, counts each run once per group, and reports minutes of wasted runs', () => {
  const runs = [
    { id: 1, path: '.github/workflows/ci.yml', event: 'pull_request', conclusion: 'success', jobs: [job('checks', 100), job('suite', 1200)] },
    { id: 2, path: '.github/workflows/ci.yml', event: 'pull_request', conclusion: 'cancelled', jobs: [job('checks', 50), job('suite', 400, { conclusion: 'cancelled' })] },
    { id: 3, path: '.github/workflows/nightly.yml', event: 'schedule', head_branch: 'main', conclusion: 'success', jobs: [job('decide', 20), job('suite', 0, { conclusion: 'skipped' })] },
  ];
  const { total, wasted, rows } = group(runs, 'workflow');
  assert.equal(total, 2 + 20 + 1 + 7 + 1);
  assert.equal(wasted, 1 + 7);
  assert.deepEqual(rows.map((r) => [r.key, r.minutes, r.jobs, r.runs]), [['ci.yml', 30, 4, 2], ['nightly.yml', 1, 1, 1]]);
  const byJob = group(runs, 'job').rows.map((r) => r.key);
  assert.deepEqual(byJob, ['ci.yml / suite', 'ci.yml / checks', 'nightly.yml / decide']);
});

test('keyOf names the branch for non-PR events and rejects an unknown grouping', () => {
  const run = { path: '.github/workflows/ci.yml', event: 'push', head_branch: 'develop', conclusion: 'failure' };
  assert.equal(keyOf(run, job('x', 1), 'event'), 'push (develop)');
  assert.equal(keyOf({ ...run, event: 'pull_request' }, job('x', 1), 'event'), 'pull_request');
  assert.equal(keyOf(run, job('x', 1), 'conclusion'), 'failure');
  assert.throws(() => keyOf(run, job('x', 1), 'colour'));
});

test('parseArgs requires a repository and a start date', () => {
  assert.ok(parseArgs([]).error);
  assert.ok(parseArgs(['--repo', 'o/r']).error);
  assert.ok(parseArgs(['--repo', 'o/r', '--since', '2026-1-1']).error);
  assert.ok(parseArgs(['--repo', 'o/r', '--since', '2026-01-01', '--by', 'colour']).error);
  assert.deepEqual(parseArgs(['--repo', 'o/r', '--since', '2026-01-01']).opts, { repo: 'o/r', since: '2026-01-01', until: undefined, by: 'workflow' });
});

test('the CLI exits 2 with usage on bad arguments, without calling the API', () => {
  const r = runNode(SCRIPT, { args: ['--since', '2026-01-01'] });
  assert.equal(r.code, 2);
  assert.match(r.stderr, /Usage:/);
});
