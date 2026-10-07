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

## Other agents (Codex, Cursor, OpenCode and others)

The skills are plain `SKILL.md` folders, so the [skills](https://skills.sh) installer can copy them into any project:

```bash
npx skills@latest add paureis/pau-skills
```

It lets you choose which skills to take and which agents to install them for. Hooks are a Claude Code feature and
are not installed this way; a few skills that run a bundled script refer to `${CLAUDE_PLUGIN_ROOT}`, which you
replace with the folder the skill was copied to.

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

