# Adding a skill

The checklist for bringing a skill, hook or script from a working project into this repository. Do the steps in
order; the scrub check and the validator at the end catch most of what gets forgotten.

1. **Pick the plugin group** by purpose: `session-discipline` (starting and closing sessions), `verification`
   (proving work is correct), `agent-orchestration` (working with subagents), `guards` (hooks that block mistakes,
   and safety checks), `planning` (from idea to sliced work). If none fits, a new group needs its own
   `.claude-plugin/plugin.json` and an entry in `.claude-plugin/marketplace.json`.

2. **Scaffold it**: `node scripts/new-skill.mjs <plugin> <skill-name>`. This creates the `SKILL.md` and adds a stub
   to `docs/ORIGINS.md` and a bullet to the plugin's list in the README reference. Every placeholder is marked `TODO(new-skill)`, and the scrub
   check fails until none is left. The script refuses a name that already exists in any plugin.

3. **Copy the skill in and generalise it.** Bring its `SKILL.md` body and any bundled files across from the project.
   Then:
   - Translate everything into English.
   - Remove product, client and people names, account and project IDs, URLs and machine paths. Replace a project
     specific with configuration (an environment variable or an optional file under `.claude/`), documented in the
     plugin's `README.md`. Do not replace it with a different hard-coded stand-in.
   - Reference bundled files as `${CLAUDE_PLUGIN_ROOT}/...`, never `~/.claude/...` or an absolute path.
   - Keep scripts dependency-free and cross-platform (Node standard library; bash only where bash is the point).
   - A hook script exits 0 on input it does not understand, unless failing closed is the point of the hook.

4. **Record its origin** in the stub in `docs/ORIGINS.md`:
   - Original or adapted. If you are not sure, diff it against the likely upstream before deciding, and do not
     guess.
   - The problem that led to it, with the names removed.
   - What generalising it changed.
   - For an adapted skill, a "What this version changes" list taken from a real diff against the closest upstream
     version, the upstream license in `NOTICE`, and `license` and `metadata.upstream` lines in its frontmatter.
   - A skill that differs from upstream only by being shorter is not published here. List it in the README under
     "I also use, unmodified".

5. **Fill in the README bullet**: one line on what it does, with " (adapted)" after the name if it is adapted. Add
   it to the right section under "Problems this fixes" too, and to the `which-skill` router
   (`plugins/session-discipline/skills/which-skill/SKILL.md`). Update the skill and hook count badges if they changed.
   For a hook: read the shared `config.mjs` in the plugin's `scripts/` folder, call `hookEnabled(<name>, config)`
   before acting, add a row and an options section to `docs/HOOKS.md`, and register it in the plugin's
   `hooks/hooks.json`.

6. **Add or extend tests** for any script with logic, in `tests/*.test.mjs` (`node:test`, no dependencies). Then
   prove the tests can fail: run one mutation through the harness (commit first; the harness refuses a dirty tree):
   `bash plugins/verification/scripts/mutate.sh <script> node --test tests/<file>.test.mjs < mutation.sed`.

7. **Run the checks** as separate commands, so a failure is not hidden behind the next one:
   ```bash
   npm test
   npm run scrub
   ```

8. **Rebuild the bundle** if any `hooks.json` changed: `node scripts/build-bundle.mjs` (the tests fail while the
   bundle entry in `marketplace.json` is out of date). Then **bump the plugin's version** in `plugins/<plugin>/.claude-plugin/plugin.json` and in its entry in
   `.claude-plugin/marketplace.json`; the two must agree. Users only receive a change when this version changes.
   Use a minor bump for a new skill and a patch bump for a fix.

9. **Validate**:
   ```bash
   claude plugin validate . --strict
   claude plugin validate ./plugins/<plugin> --strict
   ```

10. **Commit** with the message from a file (`git commit -F <file>`), then push.
