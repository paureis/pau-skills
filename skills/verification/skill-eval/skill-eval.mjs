#!/usr/bin/env node
/**
 * Blind runs of two or more variants of a skill or a prompt, as headless `claude -p` sessions, and a blind review of
 * what each run did. Every step that leaks the setup to a run, or the key to the reviewer, is done here.
 *
 *   node skill-eval.mjs setup <lab-dir> --root <dir> --task <dir> --variant <name>=<skill-dir|none> (twice or more)
 *                       --prompt [<name>=]<file> [--n 3] [--slug <folder name>] [--allow-word <word>]... [--grade-reply]
 *                       [--seed <integer>]
 *       Checks the prompt, the working directory path and every file and folder name for the words a run must never
 *       see (META_WORDS), and refuses on a hit; a hit inside a file only warns. Refuses a link in the task or a
 *       variant, more than 26 runs, a root that is not new and empty or that has CLAUDE.md, CLAUDE.local.md, AGENTS.md
 *       or .claude in it or above it, and a lab, task, variant or prompt under the root. Then copies the task and the
 *       variants into <lab-dir>/source/ and makes, per variant, N folders <root>/tmp.XXXXXX/<slug>, each a copy of the
 *       task (without .git) with that variant of the skill in .claude/skills/<name>/, a fresh git repository with one
 *       commit, and an empty HOME next to it. Runs get random ids and a shuffled order. The plan (which folder is which
 *       variant) and a rubric template go to <lab-dir>. On a failure it removes what it made.
 *
 *   node skill-eval.mjs run <lab-dir> --model <model> [--effort <level>] [--allow-tool <rule>...]...
 *                       [--pass-env <NAME>...] [--real-home] [--parallel <k>] [--timeout-min 30] [--max-budget-usd <x>]
 *                       [--force]
 *       Checks that `claude auth status` is logged in under an empty HOME, then runs every folder as
 *       `claude -p <prompt> --output-format stream-json --verbose` with the empty HOME, only the project's settings, no
 *       MCP server and an environment built from ALLOWED_ENV plus the --pass-env names, and saves each transcript as
 *       <lab-dir>/runs/<id>.jsonl. --force rebuilds every folder and HOME from <lab-dir>/source/ first. --real-home
 *       uses your HOME instead, when the empty one cannot log in. Prints the cost of each run and the total.
 *
 *   node skill-eval.mjs actions <transcript.jsonl>
 *       Prints what one run did: every tool call with the file, command or pattern it used, failures, permission
 *       denials, and its final message (which is not evidence).
 *
 *   node skill-eval.mjs blind <lab-dir> [--out <dir>] [--seed <integer>] [--force]
 *       Checks <lab-dir>/rubric.md (3 to 6 numbered criteria, no placeholder), then writes one file per run under
 *       shuffled letters: its actions, the diff of everything it changed (the installed skill left out), the ignored
 *       files it changed, its commits, and its final message, with machine paths replaced. Also writes bundle.md: the
 *       reviewer brief, the rubric and every output. The key goes to <lab-dir>/key.json and is not printed. --force
 *       makes new letters, and is refused while my-read.md or verdict.md for the old letters exists.
 *
 *   node skill-eval.mjs judge <lab-dir> --model <model> [--effort <level>] [--pass-env <NAME>...] [--real-home] [--force]
 *       Needs your own scores in <lab-dir>/my-read.md first, newer than the key. Sends bundle.md on standard input to
 *       `claude -p` with no tools, no saved session, an empty HOME and an empty working folder, and saves the reply as
 *       <lab-dir>/verdict.md.
 *
 *   node skill-eval.mjs unblind <lab-dir>
 *       Prints which letter was which run and variant, the mean scores per variant from the verdict and from your
 *       read, every score where you and the reviewer are 2 or more apart, and the cost.
 *
 *   node skill-eval.mjs triggers <lab-dir> --skills <dir> [--skills <dir>]... --requests <dir> --model <model>
 *                       --max-usd <x> [--also <dir>]... [--repeats 2] [--usd-per-run 0.08] [--parallel 3] [--plan]
 *                       [--baseline <summary.json>] [--pass-env <NAME>...] [--real-home] [--timeout-min 5]
 *       Runs every request of the lists in --requests (one <name>.json per skill) as a one-turn `claude -p`, each in a
 *       fresh folder with every skill of --skills and --also in its .claude/skills/, and records the first skill it
 *       started. Prints the plan and the estimate first (--plan stops there), keeps the round under --max-usd, writes
 *       <lab-dir>/summary.json and prints hits, misses and wrong starts per skill; --baseline compares with an older
 *       summary. TRIGGERS.md has the rules.
 *
 * Scores, in my-read.md and in the verdict: a "Criterion <n>: <text>" line, then one "  <letter>: <1-5>/5  <evidence>"
 * line per output; the block ends at the first other line. SKILL_EVAL_CLAUDE names the command to run instead of
 * `claude` (a .mjs or .js file runs with this Node); the tests use it. Windows is refused for the real command.
 * Exit codes: 0 done; 1 refused or failed; 2 usage. Node 20+, standard library only.
 */
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { extractActions, renderActions } from './skill-eval-core.mjs';
import { parseArgs, money } from './skill-eval-files.mjs';
import { setup, run } from './skill-eval-setup.mjs';
import { blind, judge, unblind } from './skill-eval-blind.mjs';
import { triggers } from './skill-eval-triggers.mjs';

export {
  META_WORDS, findMetaWords, skillNameOf, ALLOWED_ENV, childEnv, platformProblem, candidateArgv, judgeArgv, targetOf,
  extractActions, finalSection, renderActions, MIN_CRITERIA, MAX_RUNS, MAX_CRITERIA, validateRubric, withoutComments,
  rubricTemplate, parseScores, disagreements, variantMeans,
} from './skill-eval-core.mjs';
export { parseArgs, isInside, INHERITED, inheritedConfig, parseUsdMicros, microsArg, microsUsd } from './skill-eval-files.mjs';

function actions(o, out, err) {
  const f = resolve(o.target);
  if (!existsSync(f)) { err(`refused: ${f} does not exist`); return 1; }
  const x = extractActions(readFileSync(f, 'utf8'));
  out(renderActions(x));
  out(`model ${x.model || 'unknown'}, ${x.turns ?? '?'} turns, cost ${money(x.costUsd)}, skills offered: ${x.skills.join(', ') || 'none listed'}${x.badLines ? `, ${x.badLines} lines not JSON` : ''}`);
  return 0;
}

export async function main(argv, out = console.log, err = console.error) {
  let o;
  try { o = parseArgs(argv); } catch (e) { err(e.message); return 2; }
  try {
    switch (o.cmd) {
      case 'setup': return setup(o, out, err);
      case 'run': return await run(o, out, err);
      case 'actions': return actions(o, out, err);
      case 'blind': return blind(o, out, err);
      case 'judge': return judge(o, out, err);
      case 'triggers': return await triggers(o, out, err);
      default: return unblind(o, out, err);
    }
  } catch (e) {
    err(`failed: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then((code) => { process.exitCode = code; });
}
