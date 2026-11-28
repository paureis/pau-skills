#!/usr/bin/env node
// A fixture grader for the skills-bench runner tests, in contract 2 (apps/skills-bench/FORMAT.md). It passes a run that
// left made.txt, and also writes graded.txt into --run, as a careless grader might: the runner must give it a copy, so
// the file never reaches the blind diff. A task whose task.json has "fixtureGrade": "crash" makes it exit 1, and
// "no-outcome" leaves out its outcome check.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const arg = (name) => process.argv[process.argv.indexOf(name) + 1];
const task = arg('--task');
const run = arg('--run');
const t = JSON.parse(readFileSync(join(task, 'task.json'), 'utf8'));
if (t.fixtureGrade === 'crash') {
  process.stderr.write('cannot grade this run: the task asks the grader to stop\n');
  process.exit(1);
}
writeFileSync(join(run, 'graded.txt'), 'graded\n');
const made = existsSync(join(run, 'made.txt'));
const tested = existsSync(join(run, 'src', 'thing.test.js'));
const checks = [
  { name: 'made', kind: 'outcome', required: true, pass: made, detail: made ? `made.txt is in ${run}` : 'made.txt is missing' },
  { name: 'tested', kind: 'process', required: false, pass: tested, detail: tested ? 'a test file was written' : 'no test file' },
].filter((c) => t.fixtureGrade !== 'no-outcome' || c.kind !== 'outcome');
const pass = checks.every((c) => !c.required || c.pass);
process.stdout.write(JSON.stringify({ pass, score: checks.filter((c) => c.pass).length / checks.length, checks }) + '\n');
