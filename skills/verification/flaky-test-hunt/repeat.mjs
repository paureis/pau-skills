#!/usr/bin/env node
/**
 * Run one command many times and measure how often it fails. Built for hunting intermittent test failures: it gives
 * a failure rate with a 95% interval instead of an impression, and groups failing runs by a normalized signature of
 * their last output lines so that two different failure modes are not mistaken for one.
 *
 *   node repeat.mjs [options] -- <command> [args...]
 *
 * Options:
 *   --runs N         how many runs (default 20); with --until-fail it is the cap
 *   --parallel K     run up to K copies at once (default 1, sequential)
 *   --until-fail     stop scheduling new runs after the first failure (runs already started are allowed to finish)
 *   --timeout S      kill a run after S seconds and count it as a timeout (default 0, no limit)
 *   --tail L         output lines kept per failure and used for its signature (default 20)
 *   --keep M         distinct failure signatures whose output is printed (default 5; all are counted)
 *   --json FILE      also write the full result as JSON
 *   --shell          run the command through the system shell (needed for pipes, &&, or npm/npx on Windows)
 *   --quiet          no progress characters on stderr
 *
 * Each run gets REPEAT_RUN (1-based index) and REPEAT_TOTAL in its environment, so a test can log which run it was.
 * Exit codes: 0 every run passed; 1 at least one run failed or timed out; 2 usage error or the command could not start.
 * Node 20+ standard library only.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { realpathSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const USAGE = 'Usage: node repeat.mjs [--runs N] [--parallel K] [--until-fail] [--timeout S] [--tail L] [--keep M] [--json FILE] [--shell] [--quiet] -- <command> [args...]';

/** Parse the command line. Pure. Returns { opts } or { error }. Everything after the first "--" is the command. */
export function parseArgs(argv) {
  const sep = argv.indexOf('--');
  if (sep < 0) return { error: 'missing "--" before the command' };
  const own = argv.slice(0, sep);
  const command = argv.slice(sep + 1);
  if (command.length === 0) return { error: 'no command after "--"' };
  const opts = { runs: 20, parallel: 1, untilFail: false, timeout: 0, tail: 20, keep: 5, json: null, shell: false, quiet: false, command };
  const ints = { '--runs': ['runs', 1], '--parallel': ['parallel', 1], '--timeout': ['timeout', 0], '--tail': ['tail', 1], '--keep': ['keep', 0] };
  for (let i = 0; i < own.length; i++) {
    const a = own[i];
    if (a in ints) {
      const [key, min] = ints[a];
      const raw = own[++i];
      const n = Number(raw);
      if (raw === undefined || !Number.isFinite(n) || n < min || (key !== 'timeout' && !Number.isInteger(n))) {
        return { error: `${a} needs a number >= ${min}, got ${raw === undefined ? 'nothing' : JSON.stringify(raw)}` };
      }
      opts[key] = n;
    } else if (a === '--json') {
      const f = own[++i];
      if (!f) return { error: '--json needs a file path' };
      opts.json = f;
    } else if (a === '--until-fail') opts.untilFail = true;
    else if (a === '--shell') opts.shell = true;
    else if (a === '--quiet') opts.quiet = true;
    else return { error: `unknown option: ${a}` };
  }
  return { opts };
}

/**
 * Wilson score interval for k failures in n runs. Pure. Better than the plain k/n +- normal interval for the small
 * counts and rates near zero that flaky tests produce: it never goes below 0 and does not collapse to [0, 0] at k = 0.
 */
export function wilson(k, n, z = 1.96) {
  if (!(n > 0)) return { low: 0, high: 1 };
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  return { low: Math.max(0, center - half), high: Math.min(1, center + half) };
}

/**
 * Clean runs needed to claim, with the given confidence, that a failure rate p is gone: the smallest n with
 * (1 - p)^n <= 1 - confidence. For 95% this is close to 3 / p (the "rule of three"): p = 5% needs 59, p = 1% needs 299.
 */
export function runsNeeded(p, confidence = 0.95) {
  if (!(p > 0 && p < 1) || !(confidence > 0 && confidence < 1)) throw new RangeError('p and confidence must be in (0, 1)');
  return Math.ceil(Math.log(1 - confidence) / Math.log(1 - p));
}

const ANSI = /\u001b\[[0-9;?]*[ -/]*[@-~]/g;

/**
 * Reduce failure output to a signature that is equal for "the same failure" across runs. Pure. Strips colour codes,
 * keeps the last `lines` non-empty lines, and replaces what changes from run to run without changing the failure:
 * timestamps, clock times, durations, UUIDs, hex addresses, temporary paths, ports in host:port, and numbers of four
 * or more digits (pids, seeds, counters). Small numbers stay, so "expected 3, got 4" and "expected 3, got 5" differ.
 */
export function normalizeSignature(output, lines = 20) {
  const kept = String(output ?? '')
    .replace(ANSI, '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(-lines);
  return kept
    .map((l) => l
      .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '<uuid>')
      .replace(/\b\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?/g, '<date>')
      .replace(/\b\d{4}-\d{2}-\d{2}\b/g, '<date>')
      .replace(/\b\d{1,2}:\d{2}:\d{2}(\.\d+)?\b/g, '<time>')
      .replace(/\b0x[0-9a-f]{4,}\b/gi, '<hex>')
      .replace(/(\/tmp|\/var\/folders|\/private\/var\/folders|[A-Za-z]:\\[^\s]*\\Temp)[\\/][^\s:'")]+/g, '<tmp>')
      .replace(/\b(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1?\]):\d+/g, '$1:<port>')
      .replace(/\b\d+(\.\d+)?\s?(ms|msec|s|sec|secs|seconds|m|min|minutes)\b/g, '<dur>')
      .replace(/\b\d{4,}\b/g, '<n>')
      .replace(/\s+/g, ' '))
    .join('\n');
}

/** Short stable id of a signature, for tables and JSON. */
export const signatureId = (sig) => createHash('sha256').update(sig).digest('hex').slice(0, 10);

function quantile(sorted, q) {
  if (sorted.length === 0) return 0;
  const i = Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1));
  return sorted[i];
}

/**
 * Summarize run records. Pure. Each record: { index, outcome: 'pass' | 'fail' | 'timeout', code, signal, durationMs,
 * output } (output only matters for failures). Timeouts count as failures in the rate and are also counted apart.
 */
export function summarize(records, { tail = 20 } = {}) {
  const sorted = [...records].sort((a, b) => a.index - b.index);
  const n = sorted.length;
  const failedRuns = sorted.filter((r) => r.outcome !== 'pass');
  const k = failedRuns.length;
  const groups = new Map();
  for (const r of failedRuns) {
    const sig = r.outcome === 'timeout' ? '<timeout>' : normalizeSignature(r.output, tail);
    const id = signatureId(sig);
    r.signature = id;
    const g = groups.get(id) ?? { id, count: 0, runs: [], outcome: r.outcome, signature: sig, example: lastLines(r.output, tail), firstRun: r.index };
    g.count++;
    g.runs.push(r.index);
    groups.set(id, g);
  }
  const durations = sorted.map((r) => r.durationMs).sort((a, b) => a - b);
  const mean = n ? durations.reduce((s, d) => s + d, 0) / n : 0;
  return {
    runs: n,
    passed: n - k,
    failed: k,
    timedOut: sorted.filter((r) => r.outcome === 'timeout').length,
    rate: n ? k / n : 0,
    interval95: wilson(k, n),
    pattern: sorted.map((r) => (r.outcome === 'pass' ? '.' : r.outcome === 'timeout' ? 'T' : 'F')).join(''),
    durationsMs: { min: durations[0] ?? 0, median: quantile(durations, 0.5), p90: quantile(durations, 0.9), max: durations[n - 1] ?? 0, mean },
    failures: [...groups.values()].sort((a, b) => b.count - a.count || a.firstRun - b.firstRun),
  };
}

function lastLines(output, lines) {
  return String(output ?? '').replace(ANSI, '').split(/\r?\n/).filter((l) => l.trim()).slice(-lines).join('\n');
}

const pct = (x) => `${(100 * x).toFixed(x > 0 && x < 0.1 ? 1 : 0)}%`;
const secs = (ms) => `${(ms / 1000).toFixed(ms < 10000 ? 2 : 1)}s`;

/** Human-readable report of a summary. Pure. */
export function formatSummary(s, { keep = 5, command = [] } = {}) {
  const out = [];
  out.push(`Command: ${command.join(' ')}`);
  out.push(`Runs: ${s.runs}   passed: ${s.passed}   failed: ${s.failed}${s.timedOut ? ` (of which timed out: ${s.timedOut})` : ''}`);
  out.push(`Failure rate: ${s.failed}/${s.runs} = ${pct(s.rate)}   95% interval (Wilson): ${pct(s.interval95.low)} to ${pct(s.interval95.high)}`);
  if (s.failed === 0 && s.runs > 0) {
    out.push(`No failures. With ${s.runs} clean runs a failure rate above about ${pct(Math.min(1, 3 / s.runs))} is unlikely (rule of three);`);
    out.push('a lower rate is not ruled out. See SKILL.md for how many runs a fix claim needs.');
  }
  out.push(`Durations: min ${secs(s.durationsMs.min)}, median ${secs(s.durationsMs.median)}, p90 ${secs(s.durationsMs.p90)}, max ${secs(s.durationsMs.max)}`);
  out.push(`Pattern (run order, . pass, F fail, T timeout): ${s.pattern.length > 200 ? s.pattern.slice(0, 200) + '...' : s.pattern}`);
  if (s.failures.length) {
    out.push('', `Distinct failure signatures: ${s.failures.length}`);
    s.failures.forEach((g, i) => {
      out.push(`  [${g.id}] ${g.count}x ${g.outcome}, runs ${g.runs.slice(0, 15).join(', ')}${g.runs.length > 15 ? ', ...' : ''}`);
      if (i < keep) {
        out.push('  ---- last lines of run ' + g.firstRun + ' ----');
        for (const l of (g.example || '(no output)').split('\n')) out.push('  | ' + l);
      }
    });
  }
  return out.join('\n');
}

function quoteForShell(arg) {
  if (/^[\w@%+=:,./\\-]+$/.test(arg)) return arg;
  return process.platform === 'win32' ? `"${arg.replace(/"/g, '""')}"` : `'${arg.replace(/'/g, "'\\''")}'`;
}

function killTree(child) {
  if (!child.pid) return;
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    else process.kill(-child.pid, 'SIGKILL');
  } catch { try { child.kill('SIGKILL'); } catch { /* already gone */ } }
}

const MAX_OUTPUT = 256 * 1024;
const active = new Set();

/** Run the command once. Resolves to a run record; rejects only when the command cannot be started at all. */
export function runOnce(opts, index) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, REPEAT_RUN: String(index), REPEAT_TOTAL: String(opts.runs) };
    const [file, ...args] = opts.command;
    const useShell = opts.shell;
    const child = useShell
      ? spawn(opts.command.length === 1 ? file : opts.command.map(quoteForShell).join(' '), { shell: true, env, detached: process.platform !== 'win32' })
      : spawn(file, args, { env, detached: process.platform !== 'win32' });
    active.add(child);
    const started = performance.now();
    let output = '';
    let timedOut = false;
    const take = (chunk) => { output += chunk; if (output.length > MAX_OUTPUT * 2) output = output.slice(-MAX_OUTPUT); };
    child.stdout.setEncoding('utf8').on('data', take);
    child.stderr.setEncoding('utf8').on('data', take);
    const timer = opts.timeout > 0 ? setTimeout(() => { timedOut = true; killTree(child); }, opts.timeout * 1000) : null;
    child.on('error', (err) => { active.delete(child); if (timer) clearTimeout(timer); reject(err); });
    child.on('close', (code, signal) => {
      active.delete(child);
      if (timer) clearTimeout(timer);
      const outcome = timedOut ? 'timeout' : code === 0 ? 'pass' : 'fail';
      resolve({ index, outcome, code, signal, durationMs: performance.now() - started, output: outcome === 'pass' ? '' : output.slice(-MAX_OUTPUT) });
    });
  });
}

/** Run the command opts.runs times with up to opts.parallel at once. `runner` is injectable for tests. */
export async function repeat(opts, { runner = runOnce, onResult = () => {} } = {}) {
  const records = [];
  let next = 1;
  let stop = false;
  let fatal = null;
  const worker = async () => {
    while (!stop && !fatal && next <= opts.runs) {
      const index = next++;
      try {
        const r = await runner(opts, index);
        records.push(r);
        onResult(r);
        if (opts.untilFail && r.outcome !== 'pass') stop = true;
      } catch (err) { fatal = err; }
    }
  };
  await Promise.all(Array.from({ length: Math.min(opts.parallel, opts.runs) }, worker));
  if (fatal) throw fatal;
  return records;
}

async function main(argv) {
  const { opts, error } = parseArgs(argv);
  if (error) { console.error(`${error}\n${USAGE}`); return 2; }
  const progress = (r) => { if (!opts.quiet) process.stderr.write(r.outcome === 'pass' ? '.' : r.outcome === 'timeout' ? 'T' : 'F'); };
  // Runs are started in their own process group (so a timeout can kill the whole tree), which also means Ctrl+C does
  // not reach them. Forward it.
  process.on('SIGINT', () => { for (const c of active) killTree(c); process.exit(130); });
  let records;
  const startedAt = new Date().toISOString();
  try {
    records = await repeat(opts, { onResult: progress });
  } catch (err) {
    if (!opts.quiet) process.stderr.write('\n');
    console.error(`Could not start the command: ${err.message}. If it is a shell builtin, a script on Windows (npm, npx), or uses pipes or &&, add --shell.`);
    return 2;
  }
  if (!opts.quiet) process.stderr.write('\n');
  const s = summarize(records, { tail: opts.tail });
  console.log(formatSummary(s, { keep: opts.keep, command: opts.command }));
  if (opts.json) {
    const data = {
      command: opts.command, startedAt, options: { ...opts, command: undefined },
      summary: { ...s, failures: undefined },
      failures: s.failures,
      runs: records.sort((a, b) => a.index - b.index).map(({ output, ...r }) => r),
    };
    writeFileSync(opts.json, JSON.stringify(data, null, 2) + '\n');
    console.log(`\nJSON written to ${opts.json}`);
  }
  return s.failed ? 1 : 0;
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) process.exit(await main(process.argv.slice(2)));
