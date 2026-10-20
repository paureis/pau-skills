// Shared fixtures for the arena tests: the script path and a rubric that passes the checks.
import { repo } from './helpers.mjs';

const SCRIPT = repo('skills', 'agent-orchestration', 'arena', 'arena.mjs');

const GOOD_RUBRIC = [
  '# Rubric', '', 'Task: a helper', '',
  '1. A caller needs one call for the common case.',
  '2. No internal type appears in the interface.',
  '3. Errors name the input that caused them.',
  '',
].join('\n');

export { SCRIPT, GOOD_RUBRIC };
