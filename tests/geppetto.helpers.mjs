// Shared setup for the geppetto test files: paths, the covenant, an agent file builder, a project checker and a git
// helper. Each test file imports what it uses.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { execFileSync } from 'node:child_process';
import { repo, tempDir } from './helpers.mjs';
import { readCovenant, readRules, audit } from '../skills/agent-orchestration/geppetto/check-agents.mjs';

const SKILL = repo('skills', 'agent-orchestration', 'geppetto');
const SCRIPT = join(SKILL, 'check-agents.mjs');
const ROSTER = join(SKILL, 'roster');
const COVENANT = readCovenant(join(SKILL, 'COVENANT.md'));
const RULES = readRules(join(SKILL, 'PRODUCTION-RULES.md'));
const TEMPLATES = join(SKILL, 'templates');

const put = (root, rel, text) => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); return p; };

// An agent file: frontmatter lines from `fields` in order, then the body and, unless told not to, the covenant block.
function agent(fields = {}, { body = 'You do one job and report on it.', covenant = COVENANT.text } = {}) {
  const f = { name: 'tester', description: 'Runs one narrow job for these tests and reports what it found.', ...fields };
  const lines = Object.entries(f).filter(([, v]) => v !== undefined).map(([k, v]) => (v === '' ? `${k}:` : `${k}: ${v}`));
  return `---\n${lines.join('\n')}\n---\n\n${body}\n\n${covenant || ''}\n`;
}

// A project with the given agent files under .claude/agents/, checked with an empty user folder.
function check(files, { user = {}, setup } = {}) {
  const project = tempDir('geppetto-project-');
  const home = tempDir('geppetto-user-');
  for (const [rel, text] of Object.entries(files)) put(project, join('.claude', 'agents', rel), text);
  for (const [rel, text] of Object.entries(user)) put(home, join('agents', rel), text);
  if (setup) setup(project, home);
  return audit({ project, user: home });
}
const found = (result, check, level) => result.findings.filter((f) => f.check === check && (!level || f.level === level));
const errors = (result) => result.findings.filter((f) => f.level === 'error');

const git = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8' });

export { SKILL, SCRIPT, ROSTER, COVENANT, RULES, TEMPLATES, put, agent, check, found, errors, git };
