// Shared setup for the friction-review tests: a temporary HOME with a git repository and a projects folder, and
// builders for session files in the shape Claude Code writes them (tool_use lines from the assistant, tool_result lines
// from the user, noise lines of other types, one line that is not JSON, results without is_error).
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, realpathSync, utimesSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { repo, tempDir, runNode } from './helpers.mjs';
import { encodeProjectPath } from '../skills/session-discipline/friction-review/mine-transcripts.mjs';

const SCRIPT = repo('skills', 'session-discipline', 'friction-review', 'friction.mjs');

const git = (cwd, ...args) => execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

/** A git command that makes a commit, dated at date (an ISO time) and with no signing or author from the user's config. */
const commitAt = (cwd, date, ...args) => execFileSync('git', ['-c', 'user.email=test@example.com', '-c', 'user.name=Test', '-c', 'commit.gpgsign=false', ...args],
  { cwd, env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }, stdio: 'ignore' });

let next = 0;

/**
 * One tool call and its result, as the two lines a session file holds. The toolUseResult is the Bash shape unless the
 * options pass one (a Write create in a main file) or pass it as undefined (a subagent line, which has none).
 */
function step(name, input, text = 'ok', { isError, persisted, sidechain, ...more } = {}) {
  const id = `toolu_${++next}`;
  const side = sidechain ? { isSidechain: true } : {};
  const use = { type: 'assistant', ...side, timestamp: '2026-11-01T10:00:00Z', message: { model: 'some-model', role: 'assistant', content: [{ type: 'tool_use', id, name, input }] } };
  const res = { type: 'tool_result', tool_use_id: id, content: text };
  if (isError !== undefined) res.is_error = isError;
  const toolUseResult = 'toolUseResult' in more ? more.toolUseResult : persisted ? { persistedOutputSize: persisted, persistedOutputPath: '/x/tool-results/out.txt' } : isError ? `Error: ${text}` : { stdout: text, stderr: '' };
  return [use, { type: 'user', ...side, timestamp: '2026-11-01T10:00:01Z', message: { role: 'user', content: [res] }, toolUseResult }];
}

const bash = (command, text, opts) => step('Bash', { command, description: 'run it' }, text, opts);

// Lines of the other types a real session file holds, and one line that is not JSON.
const NOISE = [
  { type: 'queue-operation', operation: 'enqueue' },
  { type: 'attachment', attachment: { type: 'skill_listing' } },
  { type: 'system', subtype: 'informational', content: 'note' },
  { type: 'user', message: { role: 'user', content: 'please look at the parser' } },
  { type: 'last-prompt', lastPrompt: 'please look at the parser' },
];

function writeLines(file, steps, { noise = true } = {}) {
  mkdirSync(dirname(file), { recursive: true });
  const lines = [...(noise ? NOISE.slice(0, 4) : []), ...steps.flat(), ...(noise ? NOISE.slice(4) : [])].map((l) => JSON.stringify(l));
  if (noise) lines.splice(2, 0, '{"type": "assistant", not json');
  writeFileSync(file, lines.join('\n') + '\n');
}

const setAge = (file, minutes) => {
  const t = new Date(Date.now() - minutes * 60000);
  utimesSync(file, t, t);
};

/**
 * A temporary HOME with a git repository in src/app, its projects folder, this repository's transcript folder and one
 * for another project. session() writes a session file with its subagent files.
 */
function world() {
  const home = realpathSync(tempDir('fr-h-'));
  const main = join(home, 'src', 'app');
  mkdirSync(main, { recursive: true });
  git(main, 'init', '-q', '-b', 'main');
  const projects = join(home, '.claude', 'projects');
  const own = join(projects, encodeProjectPath(main));
  const other = join(projects, encodeProjectPath(join(home, 'src', 'other')));
  mkdirSync(own, { recursive: true });
  mkdirSync(other, { recursive: true });
  const env = { HOME: home, USERPROFILE: home, CLAUDE_CONFIG_DIR: '' };

  /** subagents: [{ name, agentType (null for no meta file), steps }]. ageMin: minutes since the file changed. */
  function session(folder, id, steps, { ageMin = 60 * 24, subagents = [], noise = true } = {}) {
    const file = join(folder, `${id}.jsonl`);
    writeLines(file, steps, { noise });
    for (const s of subagents) {
      const sub = join(folder, id, 'subagents', `agent-${s.name}.jsonl`);
      writeLines(sub, s.steps.map((pair) => pair.map((l) => ({ ...l, isSidechain: true }))), { noise: false });
      if (s.agentType !== null) writeFileSync(sub.replace(/\.jsonl$/, '.meta.json'), JSON.stringify({ agentType: s.agentType, description: 'a task' }));
      setAge(sub, ageMin);
    }
    setAge(file, ageMin);
    return file;
  }

  const file = (rel, text) => {
    mkdirSync(dirname(join(main, rel)), { recursive: true });
    writeFileSync(join(main, rel), text);
  };

  const run = (...args) => runNode(SCRIPT, { args: ['--repo', main, ...args], env });
  return { home, main, projects, own, other, env, session, file, run };
}

/** The lines of a run's output that start with prefix, without it. */
const linesOf = (stdout, prefix) => stdout.split('\n').filter((l) => l.startsWith(prefix)).map((l) => l.slice(prefix.length));

export { SCRIPT, git, commitAt, step, bash, world, setAge, linesOf, encodeProjectPath };
