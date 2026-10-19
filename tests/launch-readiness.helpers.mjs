// Shared fixtures for the launch-readiness ledger tests: a sample ledger, project folders, rows and the CLI runner.
import { writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { repo, tempDir } from './helpers.mjs';
import { COLUMNS, parseLedger, applyRows, setProfile, main } from '../skills/verification/launch-readiness/ledger.mjs';

export const SKILL = repo('skills', 'verification', 'launch-readiness');
export const NOW = new Date('2026-10-19T12:00:00Z');
export const day = (d) => new Date(`${d}T12:00:00Z`);

export const HEADER = `| ${COLUMNS.join(' | ')} |`;
export const SEP = `| ${COLUMNS.map(() => '---').join(' | ')} |`;

export const SAMPLE = [
  '# Launch readiness',
  '',
  'Prose with  two spaces, a trailing space and a | pipe ',
  '',
  '```json launch-readiness',
  ...JSON.stringify({ version: 1, stage: 2, regulated: false, profile: { stack: 'Node 20' }, profileFiles: {}, lastRun: null }, null, 2).split('\n'),
  '```',
  '',
  HEADER,
  SEP,
  '| SEC-08 | security | 2 | must-fix | fail | code | src/cors.mjs:3 sets the origin to \\* \\| any | src/cors.mjs@0123456789abcdef | 2026-10-19 |  |',
  '| CMP-01 | compliance | 3 | can-wait | unknown | answer | ask: line one\\nline two \\\\ done |  | 2026-10-19 | 2027-10-19 |',
  '',
  'Notes after the table.',
  '',
].join('\n');

/** A project folder with the given files, and a ledger made from the bundled template. */
export function project(files = {}) {
  const root = tempDir('launch-readiness-');
  for (const [p, body] of Object.entries(files)) {
    mkdirSync(join(root, p, '..'), { recursive: true });
    writeFileSync(join(root, p), body);
  }
  return root;
}

export function newLedger(root, profile = { profile: { stack: 'Node 20' }, stage: 2, regulated: false, files: [] }) {
  const text = readFileSync(join(SKILL, 'READINESS-TEMPLATE.md'), 'utf8');
  return setProfile(parseLedger(text), profile, { root });
}

export const put = (l, rows, root) => applyRows(l, rows, { root, now: NOW });
export const row = (o) => ({ area: 'security', stage: 2, severity: 'must-fix', status: 'pass', source: 'code', evidence: 'a.js:1 ok', files: ['a.js'], ...o });

export const git = (root, ...args) => execFileSync('git', ['-C', root, '-c', 'user.name=t', '-c', 'user.email=t@example.com', ...args], { encoding: 'utf8' });
/** Make root a git repository with one commit; returns the commit. */
export function commitAll(root) {
  git(root, 'init', '-q');
  git(root, 'add', '.');
  git(root, 'commit', '-qm', 'start');
  return git(root, 'rev-parse', 'HEAD').trim();
}

/** Run main in process; returns { code, out, err }. */
export function run(args, cwd, input = '') {
  const out = [];
  const err = [];
  const code = main([...args, '--now', NOW.toISOString()], { cwd, stdin: () => input, out: (s) => out.push(s), err: (s) => err.push(s) });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

