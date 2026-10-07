# Working on this repository

This is a Claude Code plugin marketplace. Read this before changing anything.

## Layout

- `skills/<plugin>/<skill>/SKILL.md`: every skill, grouped by plugin. Bundled files (reference docs, scripts,
  templates) sit next to the `SKILL.md` that uses them.
- `hooks/<plugin>/`: hook scripts and the `hooks.json` that registers them. `hooks/lib/` is shared by all hooks.
- `.claude-plugin/marketplace.json`: one entry per plugin plus the `pau-skills` bundle. Every entry is rooted at the
  repository (`"source": "./"`, `"strict": false`). Never add `.claude-plugin/plugin.json`; it conflicts with that.
- `scripts/`: repository tooling. `tests/`: `node:test` suites. `docs/`: install guide, origins, rules, how to add a
  skill.

## Rules

- Follow [docs/ADDING-A-SKILL.md](docs/ADDING-A-SKILL.md) for any new skill or hook.
- After changing a `hooks.json` or adding a plugin folder, run `node scripts/build-marketplace.mjs`. Never edit the
  `skills` or `hooks` fields in `marketplace.json` by hand.
- Bundled files are referenced as `${CLAUDE_PLUGIN_ROOT}/skills/<plugin>/<skill>/<file>` or
  `${CLAUDE_PLUGIN_ROOT}/hooks/<plugin>/<file>`. A test fails on any such path that does not exist.
- Scripts and hooks use the Node.js standard library only (Node 20+). A hook exits 0 on input it does not
  understand, unless failing closed is its purpose, and checks `hookEnabled()` from `hooks/lib/config.mjs`.
- Skills are language-neutral: never assume JavaScript; cover the common ecosystems or detect the project's tooling.
- Writing style: plain, direct English. No em or en dashes (a test enforces this), no marketing words.
- Bump the version of every plugin whose files changed, and the `pau-skills` bundle, in `marketplace.json`, and add a
  line to `CHANGELOG.md`.

## Checks before every commit

```bash
npm test
npm run scrub
node scripts/build-marketplace.mjs --check
claude plugin validate . --strict
```

Prove a new test can fail with `bash skills/verification/mutation-test/mutate.sh` (commit first).
