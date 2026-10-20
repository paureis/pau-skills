// Shared setup for the agent-friendly-audit tests: the script and fixture paths, a git helper, and builders for a
// small history and for a projects folder, all in temporary folders.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, realpathSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { repo, tempDir } from './helpers.mjs';
import { encodeProjectPath } from '../skills/planning/agent-friendly-audit/mine.mjs';

const SCRIPT = repo('skills', 'planning', 'agent-friendly-audit', 'mine.mjs');
const FIXTURE = repo('tests', 'fixtures', 'agent-friendly-audit', 'projects');
const PROJECT = join(FIXTURE, '-work-shop');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();

function commit(dir, subject, files, body = '') {
  for (const [f, text] of Object.entries(files)) {
    mkdirSync(join(dir, f, '..'), { recursive: true });
    writeFileSync(join(dir, f), text);
  }
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', subject, ...(body ? ['-m', body] : []));
  return git(dir, 'rev-parse', 'HEAD');
}

// A small history with every kind of commit the miner has to tell apart.
function history() {
  const dir = join(tempDir('afa-git-'), 'repo');
  mkdirSync(dir);
  git(dir, 'init', '-q', '-b', 'main');
  git(dir, 'config', 'user.name', 'Someone');
  git(dir, 'config', 'user.email', 'someone@example.org');
  git(dir, 'config', 'commit.gpgsign', 'false');
  commit(dir, 'Add parser', { 'src/parser.py': 'v1\n' });
  commit(dir, 'Fix empty input in parser', { 'src/parser.py': 'v2\n', 'tests/test_parser.py': 't1\n' });
  commit(dir, 'Add bug-fix skill', { 'skills/bug-fix/SKILL.md': 's\n' });
  const cache = commit(dir, 'Add cache', { 'src/cache.py': 'c\n' });
  git(dir, 'revert', '--no-edit', cache);
  commit(dir, 'parser: fixes from review', { 'src/parser.py': 'v3\n' });
  commit(dir, 'fixup! Fix empty input in parser', { 'src/parser.py': 'v4\n' });
  commit(dir, 'Fix the contact form for dev@example.com', { 'src/form.py': 'f\n' });
  git(dir, 'checkout', '-q', '-b', 'side');
  commit(dir, 'Side work', { 'src/side.py': 's\n' });
  git(dir, 'checkout', '-q', 'main');
  git(dir, 'merge', '-q', '--no-ff', '-m', 'Merge branch fix-side', 'side');
  return { dir, cache };
}

// A repository with a transcript folder for itself, one for another project, and a stray session file in the
// projects folder, all in temporary folders.
function projectsFor() {
  const home = realpathSync(tempDir('afa-h-'));
  const main = join(home, 'src', 'app');
  mkdirSync(main, { recursive: true });
  git(main, 'init', '-q', '-b', 'main');
  const projects = join(home, '.claude', 'projects');
  const own = join(projects, encodeProjectPath(main));
  const other = join(projects, encodeProjectPath(join(home, 'src', 'other')));
  mkdirSync(own, { recursive: true });
  mkdirSync(other, { recursive: true });
  const line = (text) => JSON.stringify({ type: 'user', timestamp: '2026-05-01T00:00:00Z', message: { role: 'user', content: text } }) + '\n';
  writeFileSync(join(own, 'old.jsonl'), line('own old session'));
  writeFileSync(join(own, 'new.jsonl'), line('own live session'));
  const dayAgo = new Date(Date.now() - 86400000);
  utimesSync(join(own, 'old.jsonl'), dayAgo, dayAgo);
  writeFileSync(join(other, 's.jsonl'), line('OTHER PROJECT that must not appear'));
  writeFileSync(join(projects, 'stray.jsonl'), line('STRAY that must not appear'));
  utimesSync(join(other, 's.jsonl'), dayAgo, dayAgo);
  const env = { HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: '' };
  return { home, main, projects, own, other, env };
}

export { SCRIPT, FIXTURE, PROJECT, git, commit, history, projectsFor };
