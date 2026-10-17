# Benchmark checklist

Run this before you report a number, act on one, or freeze a harness: the baseline, every keep, and the final result.
Answer each question with evidence from a run, not from reading the code.

**A number with no run count, no spread or no named limiter is not ready.** Do not report it and do not keep a change
on it.

## Before you run anything

- Write down the claim you expect to make, in the words you would report ("the import is 30% faster at the median on
  the 60k-row file"). The questions below test that sentence.
- Read the harness. Note what it times, what it counts, and what it leaves out (startup, warmup, the write at the end).
- Check the machine: `uptime` for the load average and `nproc` (Linux) or `sysctl -n hw.ncpu` (macOS) for the core
  count. If something else is busy, find out what. If you cannot stop it, measure the two sides alternately so both
  see the same noise, and say so in the report.

## The questions

1. **Why not double?** Name the limiter: the resource or code path that bounds the number (one core, a lock, the
   disk, the network, the allocator, the load generator). Get it from a profile or from counters taken during a run,
   then map the hot spot to source. Profile in a run you do not report, because profilers slow the work down. Tools,
   by ecosystem:
   - any process: CPU per process (`top`, `pidstat`), I/O wait, syscall counts (`strace -c -f <command>` on Linux,
     `dtruss -c` on macOS), peak memory (`/usr/bin/time -v` on Linux, `/usr/bin/time -l` on macOS), `perf record` and
     `perf report` on Linux;
   - Python: `python -m cProfile -s cumulative <script>`, or `py-spy record` if it is installed;
   - Go: `go test -cpuprofile cpu.out -bench .` then `go tool pprof cpu.out`;
   - Rust: `cargo flamegraph` if it is installed, or `perf`;
   - JVM: async-profiler or JDK Flight Recorder (`-XX:+FlightRecorder`);
   - .NET: `dotnet-trace` and `dotnet-counters`;
   - JavaScript: `node --cpu-prof`, or the browser's performance panel.

   If a change did not move the number, the limiter explains why, so find it before you call the change useless. If
   you cannot say why the number is not twice as good, you do not know what you measured.
2. **Was it tuned?** Run it the way production runs it: release or optimized builds, production flags and
   environment, the same batching, pool sizes and cache state, the same versions and the same data. A limiter that is
   a setting (a debug build, a commit per row, a missing index, logging at debug level) means the run was untuned:
   fix the setting and measure again before you compare anything.
3. **Did it break limits?** Do the arithmetic. Compare bytes per second with the disk and network bandwidth,
   operations per second times the cost of one operation with the cores you have, and the time saved with the time
   the changed piece took. Amdahl: removing a piece that takes 10% of the run can make the run at most about 11%
   faster (1 / 0.9). A piece that takes a share p of the run can make it at most 1 / (1 - p) times faster. A result
   past a limit measured something other than the work: a cache, a no-op, a bug.
4. **Did it error?** Count failures and non-success results, and check that the output is correct, not only
   present. Rejections and early exits are fast; timeouts and retries are slow. If the harness does not count errors
   or check the output, make it, and make it exit non-zero when the output is wrong.
5. **Does it reproduce?** Run each side at least 5 times and report the median, the run count and the spread (the
   largest value minus the smallest). When you compare two sides directly, alternate them (A, B, A, B) so warmup,
   caches and drift favor neither. A gap smaller than the spread is no measurable difference.
6. **Does it matter?** Next to any micro result, measure the path a user waits on, with realistic data sizes and
   concurrency, and give the micro result as a share of the whole. A helper that takes 1% of a request can make the
   request at most 1% faster, however fast the helper gets.
7. **Did the work even happen?** Confirm the work ran inside the timed region: the rows were written, the bytes were
   read, the request reached the server, and the code used the result. Lazy code (a generator nobody iterates, a
   promise nobody awaits, a result the compiler or JIT can throw away) and a timeout give numbers for work that never
   happened. A harness that prints a count of the work done (rows, bytes, items) answers this on every run.

## What else could the number be measuring

List the other explanations and rule out each with evidence: errors, skipped or cached work, code that never ran, an
untuned side, noise, a different input, and a piece too small to matter end to end. If the time saved is larger than
the time the changed piece took, the number is wrong.

## Report

- Lead with the verdict: better, worse, no measurable difference, or inconclusive.
- Give the number with its unit, the run count, the spread and the limiter, for example "median 1.84s to 0.41s, 7
  runs each, spread 0.03s after, bound by hashing in one thread".
- Call it inconclusive when you cannot name the limiter, when a side ran untuned, or when you could not check
  questions 4 and 7. Name the gap.
