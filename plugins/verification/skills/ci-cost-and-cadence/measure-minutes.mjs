#!/usr/bin/env node
/**
 * Estimate GitHub Actions billed minutes for a repository over a date range, grouped by workflow, event, job, branch
 * or run conclusion. Read only: it lists runs and jobs with `gh api` and never starts, re-runs or cancels anything.
 *
 *   node measure-minutes.mjs --repo <owner>/<repo> --since YYYY-MM-DD [--until YYYY-MM-DD] [--by workflow|event|job|branch|conclusion]
 *
 * The estimate per job is max(1, ceil(seconds / 60)) between started_at and completed_at, for every job that ran (not
 * skipped, with both times), over all attempts (filter=all), times the runner multiplier (1 for Linux labels, see
 * MULTIPLIER). That is the hosted-runner billing rule as documented at the time of writing; verify it before quoting.
 * It is never the bill: the official figure may need a token scope `gh` does not have. Needs Node 20+ and `gh`
 * logged in to an account that can read the repository's Actions. Exit codes: 0 printed; 2 usage; 1 an API call failed.
 */
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Multiplier by runner label prefix, for hosted runners. Self-hosted jobs bill 0 here. Check current pricing. */
export const MULTIPLIER = [
  [/^self-hosted$/, 0],
  [/^windows/, 2],
  [/^macos/, 10],
  [/^ubuntu/, 1],
];

export function multiplierFor(labels = []) {
  for (const [re, m] of MULTIPLIER) if (labels.some((l) => re.test(String(l)))) return m;
  return 1;
}

/** Estimated billed minutes of one job, or 0 if it did not run. */
export function billedMinutes(job) {
  if (!job || job.conclusion === 'skipped' || !job.started_at || !job.completed_at) return 0;
  const seconds = (Date.parse(job.completed_at) - Date.parse(job.started_at)) / 1000;
  if (!(seconds >= 0)) return 0;
  return Math.max(1, Math.ceil(seconds / 60)) * multiplierFor(job.labels);
}

/** The group key of a job within its run. */
export function keyOf(run, job, by) {
  switch (by) {
    case 'workflow': return String(run.path ?? run.name ?? '?').split('/').pop();
    case 'event': return `${run.event ?? '?'}${run.event === 'pull_request' ? '' : ` (${run.head_branch ?? '?'})`}`;
    case 'job': return `${String(run.path ?? run.name ?? '?').split('/').pop()} / ${job.name}`;
    case 'branch': return String(run.head_branch ?? '?');
    case 'conclusion': return String(run.conclusion ?? run.status ?? '?');
    default: throw new Error(`unknown --by: ${by}`);
  }
}

/**
 * Group runs (each with its jobs) by a key. Pure: the test passes invented runs.
 * @returns {{ total: number, wasted: number, rows: Array<{ key: string, minutes: number, jobs: number, runs: number }> }}
 * `wasted` is the minutes of runs that concluded cancelled, failure or timed_out.
 */
export function group(runs, by = 'workflow') {
  const rows = new Map();
  let total = 0;
  let wasted = 0;
  for (const run of runs) {
    const seen = new Set();
    for (const job of run.jobs ?? []) {
      const m = billedMinutes(job);
      if (m === 0) continue;
      const key = keyOf(run, job, by);
      const row = rows.get(key) ?? { key, minutes: 0, jobs: 0, runs: 0 };
      row.minutes += m;
      row.jobs += 1;
      if (!seen.has(key)) { seen.add(key); row.runs += 1; }
      rows.set(key, row);
      total += m;
      if (['cancelled', 'failure', 'timed_out'].includes(run.conclusion)) wasted += m;
    }
  }
  return { total, wasted, rows: [...rows.values()].sort((a, b) => b.minutes - a.minutes || a.key.localeCompare(b.key)) };
}

export function parseArgs(argv) {
  const val = (n) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : undefined; };
  const opts = { repo: val('--repo'), since: val('--since'), until: val('--until'), by: val('--by') ?? 'workflow' };
  const date = /^\d{4}-\d{2}-\d{2}$/;
  if (!opts.repo || !/^[\w.-]+\/[\w.-]+$/.test(opts.repo)) return { error: '--repo <owner>/<repo> is required' };
  if (!opts.since || !date.test(opts.since)) return { error: '--since YYYY-MM-DD is required' };
  if (opts.until && !date.test(opts.until)) return { error: '--until must be YYYY-MM-DD' };
  if (!['workflow', 'event', 'job', 'branch', 'conclusion'].includes(opts.by)) return { error: `unknown --by: ${opts.by}` };
  return { opts };
}

function gh(path) {
  const out = execFileSync('gh', ['api', path, '--paginate', '--slurp'], { encoding: 'utf8', maxBuffer: 512 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
  return JSON.parse(out);
}

function main(argv) {
  const { opts, error } = parseArgs(argv);
  if (error) {
    console.error(`${error}\nUsage: node measure-minutes.mjs --repo <owner>/<repo> --since YYYY-MM-DD [--until YYYY-MM-DD] [--by workflow|event|job|branch|conclusion]`);
    return 2;
  }
  const range = opts.until ? `${opts.since}..${opts.until}` : `>=${opts.since}`;
  let runs;
  try {
    runs = gh(`repos/${opts.repo}/actions/runs?created=${range}&per_page=100`).flatMap((p) => p.workflow_runs ?? []);
    for (const run of runs) {
      run.jobs = gh(`repos/${opts.repo}/actions/runs/${run.id}/jobs?filter=all&per_page=100`).flatMap((p) => p.jobs ?? []);
    }
  } catch (e) {
    console.error(`An API call failed: ${String(e.stderr || e.message).split('\n')[0]}`);
    return 1;
  }
  const { total, wasted, rows } = group(runs, opts.by);
  console.log(`${opts.repo}, runs created ${range}: ${runs.length}. Estimated billed minutes: ${total} (ESTIMATE, not the bill).`);
  console.log(`Of which in cancelled, failed or timed-out runs: ${wasted}${total ? ` (${Math.round((100 * wasted) / total)}%)` : ''}.`);
  console.log(`\n| ${opts.by} | Minutes | Jobs | Runs |\n|---|---|---|---|`);
  for (const r of rows) console.log(`| ${r.key} | ${r.minutes} | ${r.jobs} | ${r.runs} |`);
  return 0;
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) process.exit(main(process.argv.slice(2)));
