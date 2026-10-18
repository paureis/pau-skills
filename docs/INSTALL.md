# Installing, updating and removing

Every command here is from the [plugin commands reference](https://code.claude.com/docs/en/plugins/cli-reference).
Run them in your shell, outside a Claude Code session. Inside a session, `/plugin marketplace add` and
`/plugin install` do the same.

## Claude Code

Add the marketplace (once per machine):

```bash
claude plugin marketplace add paureis/pau-skills
```

Then either install everything as one plugin:

```bash
claude plugin install pau-skills@pau-skills
```

or pick the plugins you want:

```bash
claude plugin install session-discipline@pau-skills
claude plugin install verification@pau-skills
claude plugin install agent-orchestration@pau-skills
claude plugin install guards@pau-skills
claude plugin install planning@pau-skills
```

The same five in one loop (bash, zsh or Git Bash, then PowerShell):

```bash
for p in session-discipline verification agent-orchestration guards planning; do
  claude plugin install "$p@pau-skills"
done
```

```powershell
foreach ($p in 'session-discipline','verification','agent-orchestration','guards','planning') { claude plugin install "$p@pau-skills" }
```

Choose one way, not both: installing the bundle and an individual plugin gives you the same skills twice and runs the
same hooks twice.

Installs go to your user scope by default. Add `--scope project` to record a plugin in the repository's
`.claude/settings.json` for everyone who clones it.

A newly installed plugin loads in your next session, or after `/reload-plugins`. Skills are namespaced by plugin:
`retrospective` runs as `/session-discipline:retrospective`, or as `/pau-skills:retrospective` from the bundle.

The scripts need Node.js 20 or later and no packages. `mutate.sh` needs bash (Git Bash on Windows).

## Skills from your claude.ai account, hooks from here

Claude Code on the web does not load plugins, but it does load the skills uploaded to your claude.ai account, and so
do the terminal and the desktop app (signed in with that account). To have every skill everywhere:

1. Upload each skill to claude.ai (Customize, Skills, Upload a skill) as a zip of its folder, for example a zip of
   `skills/verification/verify-app/` with the `verify-app/` folder at its root. Bundled files come along. Synced
   skills appear as `/anthropic-skills:<name>` (or `/<name>` when nothing else uses the name). When a skill changes
   here, upload its new zip. In a clone of this repository, `npm run pack-skills -- verify-app` builds that zip in
   `dist/` from the committed files (`--all` builds one for every skill, `--since <ref>` one for each skill changed
   since that commit), and refuses a skill claude.ai would refuse.
2. On each computer, install only the hooks, which a skill upload cannot carry:

   ```bash
   claude plugin marketplace add paureis/pau-skills
   claude plugin install pau-skills-hooks@pau-skills
   ```

`pau-skills-hooks` has every hook and no skills, so nothing loads twice. Do not install it next to `pau-skills` or
the individual plugins, which carry the same hooks; and do not install those next to uploaded skills, which would load
every skill twice. Hooks run only on your own machine; cloud sessions on the web get the skills but not the hooks.

## Other agents (Codex, Cursor, OpenCode and others)

The skills are plain `SKILL.md` folders, so the [skills](https://skills.sh) installer can copy them into any project:

```bash
npx skills@latest add paureis/pau-skills
```

It lets you choose which skills to take and which agents to install them for. Hooks are a Claude Code feature and
are not installed this way. Skills find their bundled files through `${CLAUDE_SKILL_DIR}`, which Claude Code fills
in; in an agent that does not, it means the folder the skill was copied to.

## One skill on its own

Every skill works without the plugin and without any other skill. To use one in Claude Code, copy its folder (for
example `skills/session-discipline/project-setup/`) to `~/.claude/skills/project-setup/` for every project, or to
`.claude/skills/project-setup/` in one repository. It then runs as `/project-setup`. When a skill mentions another
skill, it is an optional extra, and the skill says what to do without it.

## When skills show without a description

Claude Code puts every skill's description into each session, in a listing capped at 1% of the context window. When
the listing is full, it drops the descriptions of the least used skills and keeps only their names, and the agent can
then start those skills only when you name them. To check, ask a new session: "List every skill in your skill listing
that has no description." If the list is not empty:

1. Turn off plugins you do not use. On claude.ai, Customize, Plugins, open the plugin and turn it off; that reaches
   every session. `claude plugin disable <name>@<source>` turns off one on a single computer, but a plugin synced
   from claude.ai keeps its skills listed until it is also turned off there.
2. Remove old local copies of skills you also uploaded: a folder in `~/.claude/skills/` with the same name as one in
   `~/.claude/skills/synced/` loads the same skill twice.
3. Raise the budget with the `SLASH_COMMAND_TOOL_CHAR_BUDGET` environment variable, in characters (80000 is about 2%
   of a 1M window). On a computer, set it as a user environment variable and restart Claude; on Windows,
   `[Environment]::SetEnvironmentVariable('SLASH_COMMAND_TOOL_CHAR_BUDGET', '80000', 'User')`. For cloud sessions,
   add it to the cloud environment's variables (the environment menu in a session's title bar, then Edit); every new
   session in that environment picks it up.

## Turning things off

```bash
claude plugin list
claude plugin disable guards@pau-skills
claude plugin enable guards@pau-skills
```

To turn off a single hook instead of a whole plugin, see [hooks/README.md](../hooks/README.md).

## Updating

Each plugin declares a version, and a change reaches you only when that version is bumped. Auto-update is off by
default for marketplaces that are not Anthropic's, so either turn it on for `pau-skills` under `/plugin` >
**Marketplaces**, or update by hand:

```bash
claude plugin marketplace update pau-skills
claude plugin update pau-skills@pau-skills
```

With individual plugins, run the second command for each one you use. The new version loads in your next session,
or after `/reload-plugins`.

## Removing

Uninstall one plugin, or remove the marketplace together with every plugin installed from it:

```bash
claude plugin uninstall guards@pau-skills
claude plugin marketplace remove pau-skills
```

