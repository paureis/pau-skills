// Shared configuration for every pau-skills hook. One file turns hooks off and sets their options:
//
//   ~/.claude/pau-skills.json          your defaults, for every project
//   <project>/.claude/pau-skills.json  this project; its keys win over the user file
//
//   {
//     "hooks": { "verify-before-done": false },
//     "destructive-guard": { "protectedBranches": ["main", "release"] }
//   }
//
// "hooks" maps a hook name to false to turn it off. Every other top-level key is the options object of the hook with
// that name. The environment variable PAU_SKILLS_DISABLE (comma-separated hook names, or "all") turns hooks off too,
// which is handy for one session: PAU_SKILLS_DISABLE=verify-before-done claude.
//
// Every plugin in this marketplace is rooted at the repository, so all hooks share this one file. A file that is
// missing or not valid JSON counts as empty: a broken config must never break a session.
import { readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

function readJson(path) {
  try {
    const value = JSON.parse(readFileSync(path, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch {
    return {};
  }
}

/** The project root for a hook: $CLAUDE_PROJECT_DIR, else the hook input's cwd, else the process cwd. */
export function projectDir(input = {}, env = process.env) {
  return env.CLAUDE_PROJECT_DIR || (typeof input.cwd === 'string' && input.cwd) || process.cwd();
}

/** The merged configuration: user file, then project file. Per-hook option objects merge key by key. */
export function loadConfig({ project = process.cwd(), home = process.env.PAU_SKILLS_HOME || homedir() } = {}) {
  const user = readJson(join(home, '.claude', 'pau-skills.json'));
  const proj = readJson(join(project, '.claude', 'pau-skills.json'));
  const out = { ...user };
  for (const [key, value] of Object.entries(proj)) {
    const prev = out[key];
    const both = prev && value && typeof prev === 'object' && typeof value === 'object' && !Array.isArray(prev) && !Array.isArray(value);
    out[key] = both ? { ...prev, ...value } : value;
  }
  return out;
}

/** False when the hook is turned off by PAU_SKILLS_DISABLE or by "hooks": { "<name>": false }. */
export function hookEnabled(name, config, env = process.env) {
  const off = String(env.PAU_SKILLS_DISABLE || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (off.includes('all') || off.includes(name)) return false;
  return !(config.hooks && config.hooks[name] === false);
}

/** The options object for one hook ({} when there is none). */
export function hookOptions(name, config) {
  const value = config[name];
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

/** Read all of stdin as text. */
export function readStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (d) => (data += d));
    process.stdin.on('end', () => resolve(data));
    process.stdin.on('error', () => resolve(data));
  });
}

/** Parse hook JSON, or null. */
export function parseInput(text) {
  try {
    const value = JSON.parse(text);
    return value && typeof value === 'object' ? value : null;
  } catch {
    return null;
  }
}
