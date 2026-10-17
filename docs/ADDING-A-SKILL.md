# Adding a skill

The checklist for bringing a skill, hook or script from a working project into this repository. Do the steps in
order; the scrub check and the validator at the end catch most of what gets forgotten.

1. **Pick the plugin group** by purpose: `session-discipline` (starting and closing sessions), `verification`
   (proving work is correct), `agent-orchestration` (working with subagents), `guards` (hooks that block mistakes,
   and safety checks), `planning` (from idea to sliced work). The skill goes in `skills/<plugin>/<skill-name>/` and
   a hook script in `hooks/<plugin>/`. If none fits, a new group needs a `skills/<group>/` folder and an entry
   (name, description, version, keywords) in `.claude-plugin/marketplace.json`; `scripts/build-marketplace.mjs` fills
   in the rest.

2. **Scaffold it**: `node scripts/new-skill.mjs <plugin> <skill-name>`. This creates the `SKILL.md` and adds a stub
   to `docs/ORIGINS.md` and a bullet to the plugin's list in the README reference. Every placeholder is marked
   `TODO(new-skill)`, and the scrub check fails until none is left. The script refuses a name that already exists in any plugin.
   Every skill loads on its own: never add `disable-model-invocation: true` (`tests/context-budget.test.mjs` fails on
   it). Claude Code puts every description into every session's context, so write it as a short trigger list: one
   sentence on what the skill does, then "Use when" with the phrases a person would actually say, and, where another
   skill could be picked for the same words, what makes this one different. At most 400 characters, all descriptions
   together at most 12,000, no XML-like tag such as `<word>`, and no other skill's name in backticks. Leave out what
   the body already says.
   If the skill launches subagents or headless runs, takes over the session, or writes outside the conversation, add
   it to `CONFIRM_LIST` in `tests/confirm-step.test.mjs` and to the lists in the README ("What loads on its own") and
   `which-skill`, and paste this paragraph into its `SKILL.md`, word for word, near the top (or at the start of the
   step that costs, when only one step does):

   ```
   If you started this skill on your own, without the user typing its name or asking for it, first say in one or two
   lines what it will do and what it will cost, and wait for a yes. If the user asked for it, go ahead.
   ```

   Any skill can start another, so a mention of another skill says "use `<name>` if it is installed" for a step
   inside the work the user asked for, and "offer to run `<name>` if it is installed" for a next step after this one.

3. **Copy the skill in and generalise it.** Bring its `SKILL.md` body and any bundled files across from the project.
   Then:
   - Translate everything into English.
   - Remove product, client and people names, account and project IDs, URLs and machine paths. Replace a project
     specific with configuration (an environment variable or an optional file under `.claude/`), documented in the
     plugin's `skills/<plugin>/README.md`. Do not replace it with a different hard-coded stand-in.
   - Reference bundled files as `${CLAUDE_PLUGIN_ROOT}/skills/<plugin>/<skill>/<file>`, never `~/.claude/...` or an
     absolute path. Every plugin is rooted at the repository, so `${CLAUDE_PLUGIN_ROOT}` is the repository root and
     any file in it can be reached; a test checks that every such path exists. For a file in the skill's own folder,
     `${CLAUDE_SKILL_DIR}/<file>` is better: Claude Code sets it for plugin and standalone installs alike, while
     `${CLAUDE_PLUGIN_ROOT}` is set only for plugins. A skill that reads its bundled files outside the project should
     also allow those reads in its frontmatter, `allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)` (the leading `/` makes
     the path absolute), so the user does not see a permission prompt for them.
   - Make it stand alone: it must work when it is the only skill installed. If it mentions another skill, say "if
     it is installed" and what to do without it. If it needs another skill's script, copy the script into its folder
     and add the pair to `COPIES` in `tests/standalone.test.mjs`.
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
   (`skills/session-discipline/which-skill/SKILL.md`). Update the skill and hook count badges if they changed.
   For a hook: import `../lib/config.mjs`, call `hookEnabled(<name>, config)` before acting, add a row and an
   options section to `hooks/README.md`, and register it in `hooks/<plugin>/hooks.json` as
   `node "${CLAUDE_PLUGIN_ROOT}/hooks/<plugin>/<script>.mjs"`.

6. **Add or extend tests** for any script with logic, in `tests/*.test.mjs` (`node:test`, no dependencies). Then
   prove the tests can fail: run one mutation through the harness (commit first; the harness refuses a dirty tree):
   `bash skills/verification/mutation-test/mutate.sh <script> node --test tests/<file>.test.mjs < mutation.sed`.

7. **Run the checks** as separate commands, so a failure is not hidden behind the next one:
   ```bash
   npm test
   npm run scrub
   ```

8. **Rebuild the marketplace** if a `hooks.json` or a plugin folder changed: `node scripts/build-marketplace.mjs`
   (the tests fail while `marketplace.json` is out of date). Then **bump the plugin's version** in its entry in
   `.claude-plugin/marketplace.json`, and the `pau-skills` bundle's version too, since it ships the same files. A
   change to a hook also bumps `pau-skills-hooks`, which ships every hook and no skills.
   Users only receive a change when the version changes. Use a minor bump for a new skill and a patch bump for a fix.
   Add a line to `CHANGELOG.md`.

9. **Validate**:
   ```bash
   claude plugin validate . --strict
   ```

10. **Commit** with the message from a file (`git commit -F <file>`), then push.

11. **After the merge, ship it to claude.ai.** Skills can also be uploaded to a claude.ai account, which syncs them to
    the terminal, the desktop app and the web. Run `npm run pack-skills -- <name>` on main: it writes
    `dist/<name>.zip` with the folder at the zip root, built from the committed files, and refuses when claude.ai
    would (a name that is not lowercase letters, digits and hyphens, holds "claude" or "anthropic", or differs from
    the folder; an empty description, one over 1,024 characters, or one with an XML-like tag such as `<word>`; over
    30 MB). Without `--out` it first removes old zips from `dist/`, and it warns when HEAD is not on main. Upload the
    zip under Customize, Skills; to replace a skill, open it and upload the new zip. Uploaded skills appear as
    `/anthropic-skills:<name>` in a session started after the upload.
