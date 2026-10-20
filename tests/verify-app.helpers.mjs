// Shared fixtures for the verify-app tests: the skill folder and script, sample feature and SKILL.md texts, and a
// git repository with a clean verify skill in it (identity and commit.gpgsign false set), with the CLI runner.
import { execFileSync } from 'node:child_process';
import { writeFileSync, mkdirSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';

const SKILL_DIR = repo('skills', 'verification', 'verify-app');
const SCRIPT = join(SKILL_DIR, 'check-map.mjs');

const FEATURE = `# Add a bookmark

A user saves a link with a title and finds it again in the list.

## Sub-features

- \`add-ok\` saves a link.

## How to get to it (user's point of view)

- Send a POST to /bookmarks.

## Driving it with curl

- **Add.** Run \`curl -sS -X POST ...\`. The response is 201.

## Gotchas

- Titles are trimmed.

## States

- No screen: an HTTP endpoint, so there is no loading, empty or error screen to show.
`;

const GOTCHAS = '## Gotchas\n\n- Titles are trimmed.\n';

/** A feature with a screen: the three states, each with how to force it and a screenshot. */
const STATES = `## States

- **Loading.** Hold \`GET /api/bookmarks\` with \`page.route\`. Five grey rows show. Screenshot \`$EV/list/01-loading.png\`.
- **Empty.** Answer the request with \`[]\`. The list reads \`No bookmarks yet\`. Screenshot \`$EV/list/02-empty.png\`.
- **Error.** Answer it with status 500. An alert reads \`Could not load bookmarks\`. Screenshot \`$EV/list/03-error.png\`.
`;
const WITH_SCREEN = FEATURE.replace(/## States\n[\s\S]*$/, STATES);

/** FEATURE as maps made before the States heading: the four old headings only. */
const FOUR_HEADINGS = FEATURE.replace(/\n## States\n[\s\S]*$/, '');

const SKILL = `---
name: verify-shelf
description: "Drive the Shelf HTTP service and prove behaviour with evidence. Use when asked to verify Shelf."
---

# Verify Shelf

## Launch

\`\`\`bash
node server.mjs &
\`\`\`

## Doctor

\`\`\`bash
curl -sS "$URL/health"
\`\`\`

## Drive

Run \`curl -sS "$URL/bookmarks"\`.

## Evidence

Evidence folder: \`.verify-evidence/<run-id>/\`

## Cleanup

\`\`\`bash
kill "$PID"
\`\`\`
`;

const G = (cwd, ...args) => execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** A git repository with a clean verify skill at .claude/skills/verify-shelf. Returns { root, dir }. */
function makeProject({ ignore = '.verify-evidence/\n' } = {}) {
  const root = realpathSync.native(tempDir('verify-app-'));
  G(root, 'init', '-q');
  for (const [k, v] of [['user.name', 'Test'], ['user.email', 'test@example.com'], ['commit.gpgsign', 'false']]) G(root, 'config', k, v);
  if (ignore !== null) writeFileSync(join(root, '.gitignore'), ignore);
  const dir = join(root, '.claude', 'skills', 'verify-shelf');
  mkdirSync(join(dir, 'features'), { recursive: true });
  writeFileSync(join(dir, 'SKILL.md'), SKILL);
  writeFileSync(join(dir, 'features', 'README.md'), '# Shelf map\n\n## Features\n\n- [Add a bookmark](./add.md)\n- [Search](./search.md)\n');
  writeFileSync(join(dir, 'features', 'add.md'), FEATURE);
  writeFileSync(join(dir, 'features', 'search.md'), FEATURE.replace('# Add a bookmark', '# Search'));
  return { root, dir };
}

const run = (args, cwd) => runNode(SCRIPT, { args, cwd });

export { SKILL_DIR, SCRIPT, FEATURE, GOTCHAS, STATES, WITH_SCREEN, FOUR_HEADINGS, SKILL, G, makeProject, run };
