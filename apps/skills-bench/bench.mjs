#!/usr/bin/env node
/**
 * Skills Bench runner: does a skill change the outcome of real tasks? Runs each task with and without its skill (and
 * two controls on the control tasks) through skill-eval's isolation, within a cap, grades every run with the task's
 * code grader, asks one blind judge per task, makes the owner's grading sheet and exports the round.
 *
 *   node apps/skills-bench/bench.mjs plan --config <pilot.json> --model <id> [--max-usd <x>]
 *       [--price <difficulty>=<usd>]... [--usd-per-judge <y>]
 *       Lists every task in run order with its runs, estimate, hard stop and what the start rule needs to start it,
 *       then the totals and the start-rule factor. Refuses when the estimate passes the cap. Calls no claude.
 *   node apps/skills-bench/bench.mjs run --config <pilot.json> --model <id> --round <dir> --max-usd <x>
 *       [--only <task-id>]... [--n <n>] [--price <difficulty>=<usd>]... [--parallel <k>] [--pass-env <NAME>...] [--real-home]
 *       Runs the round, or resumes it: a task starts only when what is spent, its runs at their hard stop and the
 *       judge reserve stay within --max-usd.
 *   node apps/skills-bench/bench.mjs judge --round <dir> --judge-model <id> [--pass-env <NAME>...] [--real-home]
 *   node apps/skills-bench/bench.mjs owner-sheet --round <dir> --out <new folder> [--seed <n>]
 *   node apps/skills-bench/bench.mjs owner-grades --round <dir> --tdd <file> --bug-fix <file>
 *   node apps/skills-bench/bench.mjs export --round <dir> --to <folder> --auth login|api-key|unknown
 *
 * FORMAT.md has the task, grader and results formats; RUNBOOK.md has the steps of a round. SKILL_EVAL_CLAUDE names the
 * command to run instead of claude, as in skill-eval; the tests use it. Exit codes: 0 done; 1 refused or failed;
 * 2 usage. Node 20+, standard library only.
 */
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from './lib/run/args.mjs';
import { planCommand } from './lib/run/plan.mjs';
import { runCommand } from './lib/run/run.mjs';
import { judgeCommand } from './lib/run/judge.mjs';
import { ownerSheetCommand, ownerGradesCommand } from './lib/run/owner.mjs';
import { exportCommand } from './lib/run/export.mjs';

export async function main(argv, out = console.log, err = console.error) {
  let o;
  try { o = parseArgs(argv); } catch (e) { err(e.message); return 2; }
  try {
    switch (o.cmd) {
      case 'plan': return planCommand(o, out, err);
      case 'run': return await runCommand(o, out, err);
      case 'judge': return await judgeCommand(o, out, err);
      case 'owner-sheet': return ownerSheetCommand(o, out, err);
      case 'owner-grades': return ownerGradesCommand(o, out, err);
      case 'export': return exportCommand(o, out, err);
      default: throw new Error(`unknown command ${o.cmd}`);
    }
  } catch (e) {
    err(`failed: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
