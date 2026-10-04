# pau-skills

![License: MIT](https://img.shields.io/badge/license-MIT-blue)
![Skills: 14](https://img.shields.io/badge/skills-14-informational)
![Hooks: 4](https://img.shields.io/badge/hooks-4-informational)
![Claude Code plugin marketplace](https://img.shields.io/badge/Claude%20Code-plugin%20marketplace-D97757)

The Claude Code skills, hooks and scripts I use every day, packaged as a plugin marketplace. I am Alvaro "Pau" Reis,
an AI engineer. I build products with agents doing most of the implementation, and these tools are what keeps that
work honest from one session to the next.

They are for people who already use Claude Code on real projects and have noticed the same things I have: agents
report success when a file came out wrong, rules written in `CLAUDE.md` get broken anyway, and a session that ends
without a handoff costs the next one an hour.

## The idea

**A written rule that gets broken three times becomes a script, a hook or a gate.**

Most of what is here started as a sentence in a rules file. Each one was broken often enough, while it was already
written down, that I stopped rewriting the sentence and wrote code instead: a PreToolUse hook that blocks a shell
pattern, a harness that asserts the steps I kept getting wrong, a script that measures whether a new rule is just an
old one restated. The rules that are still sentences are in [docs/RULES.md](docs/RULES.md), and each one that has a
mechanism points to it.

## Installing

Run these in your shell (outside a Claude Code session). Each command is from the
[plugin commands reference](https://code.claude.com/docs/en/plugins/cli-reference).

Add the marketplace (once per machine):

```bash
claude plugin marketplace add paureis/pau-skills
```

Install one plugin:

```bash
claude plugin install session-discipline@pau-skills
```

Install all five (bash, zsh or Git Bash):

```bash
for p in session-discipline verification agent-orchestration guards planning; do
  claude plugin install "$p@pau-skills"
done
```

The same in PowerShell:

```powershell
foreach ($p in 'session-discipline','verification','agent-orchestration','guards','planning') { claude plugin install "$p@pau-skills" }
```

Installs go to your user scope by default. Add `--scope project` to record a plugin in the repository's
`.claude/settings.json` for everyone who clones it.

See what is installed, and turn a plugin off or on without removing it:

```bash
claude plugin list
claude plugin disable guards@pau-skills
claude plugin enable guards@pau-skills
```

Uninstall one plugin, or remove the marketplace together with every plugin installed from it:

```bash
claude plugin uninstall guards@pau-skills
claude plugin marketplace remove pau-skills
```

Inside a session, `/plugin marketplace add paureis/pau-skills` and `/plugin install <plugin>@pau-skills` do the same
as the first two commands. A newly installed plugin loads in your next session, or after `/reload-plugins`.

Plugin skills are namespaced: `retrospective` from `session-discipline` runs as `/session-discipline:retrospective`.
The scripts need Node.js 20 or later and no packages. `mutate.sh` needs bash (Git Bash on Windows). Hooks are active
as soon as their plugin is enabled; to turn one off, disable its plugin.

## Updating

Each plugin declares a version, and a change reaches you only when that version is bumped. Auto-update is off by
default for marketplaces that are not Anthropic's, so either turn it on for `pau-skills` under `/plugin` >
**Marketplaces**, or update by hand:

```bash
claude plugin marketplace update pau-skills
claude plugin update session-discipline@pau-skills
```

Run the second command for each plugin you use. The new version loads in your next session, or after
`/reload-plugins`.

## What is in it

| Plugin | Piece | Kind | What it does | Origin |
|---|---|---|---|---|
| session-discipline | `retrospective` | skill + script | Turns a session's corrections into rule, memory or skill edits, gated by `audit.mjs` so the rule stores do not grow by restating themselves; `--stale` finds rules that cite files that are gone | Original |
| session-discipline | `session-close` | skill | Closes a session in a fixed order: clean tree, retrospective, roadmap and log, handoff, commit and push | Original |
| session-discipline | `handoff` | skill | Writes a handoff the next session can resume from, after a retrospective gate | Original |
| session-discipline | roadmap | SessionStart hook | Prints the current, next and blocked roadmap items and open questions at session start | Original |
| verification | `mutation-test` | skill + script | `mutate.sh`: one hand mutation with its three assertions checked by script (applied by content, behaviour changed, restore verified); prints the diff on SURVIVED | Original |
| verification | `evaluator` | skill (forked context) | A hostile evaluator that has not seen how the code was built grades each contract assertion with reproducible evidence | Original |
| verification | `tdd` | skill | Red-green-refactor in vertical slices, with mocking and refactoring rules | Adapted |
| agent-orchestration | no-idle | PreToolUse + SubagentStart hook | Appends "never end your turn waiting" to every agent launch | Original |
| agent-orchestration | `methodology` | skill + documents | An operating method in which no agent certifies its own work: contracts, evidence standard, evaluator, convergence, two-file state, with templates | Original |
| agent-orchestration | `codebase-oracle` | skill | Answers questions about a codebase from evidence in it only; never guesses | Original |
| guards | inline-backtick | PreToolUse hook | Blocks `node -e`, `python -c` and similar when a backtick in the payload would be executed by bash | Original |
| guards | merge guard | PreToolUse hook | Denies a raw `gh pr merge`, and `gh pr close` with branch deletion, which close stacked PRs | Original |
| guards | `safe-merge` | skill + script | Merges a PR pinned to its head commit and deletes the branch only if no open PR is based on it | Original |
| guards | `dependency-security-audit` | skill | A ranked, actionable npm vulnerability and supply-chain audit, not an `npm audit` dump | Original |
| planning | `grill-me` | skill | Interviews you one question at a time until every branch of a plan is decided | Adapted |
| planning | `to-prd` | skill | Synthesizes the conversation into a PRD without re-interviewing | Adapted |
| planning | `to-issues` | skill | Splits a plan into vertical-slice issues for any tracker | Adapted |
| planning | `improve-codebase-architecture` | skill | Finds refactors that turn shallow modules into deep ones | Adapted |

"Adapted" means derived from [mattpocock/skills](https://github.com/mattpocock/skills). [docs/ORIGINS.md](docs/ORIGINS.md)
has, for every piece, the problem that led to it and, for each adapted skill, the upstream version it was compared
against and what this version changes, taken from a diff.

Configuration, for the pieces that have any: [session-discipline](plugins/session-discipline/README.md) (roadmap file
and format), [agent-orchestration](plugins/agent-orchestration/README.md) (rule text),
[guards](plugins/guards/README.md) (trunk, promotion pairs, protected branches).

### I also use, unmodified

My copies of these differ from upstream only by being shorter, so I do not republish them. Use the originals:

- [grill-with-docs](https://github.com/mattpocock/skills/tree/main/skills/engineering/grill-with-docs) by Matt Pocock
- [prototype](https://github.com/mattpocock/skills/tree/main/skills/engineering/prototype) by Matt Pocock

## How the pieces fit into a session

```mermaid
flowchart TD
    A([Session starts]) --> B[roadmap hook prints the current item,<br/>the next one and what is blocked]
    B --> C{Is the next step decided?}
    C -- no --> D[grill-me, then to-prd and to-issues]
    C -- yes --> E[Read-only agents first:<br/>codebase-oracle, inventory, audit]
    D --> E
    E --> F[Builder agents implement]
    F -. every launch .-> G[no-idle hook adds:<br/>never end your turn waiting]
    F -. every shell command .-> H[guards: backtick payloads,<br/>raw gh pr merge]
    F --> I[Verify: tests, then mutation-test<br/>on every guard the change relies on]
    I --> J[evaluator in a forked context,<br/>until two clean rounds]
    J -- defects --> F
    J -- holds --> K[safe-merge]
    K --> L[session-close: retrospective with audit.mjs,<br/>roadmap and log, handoff, commit]
    L --> M([Next session reads the handoff])
```

## How I use these day to day

A session starts with the roadmap hook's summary in context, and with the handoff from the last session if there is
one. I work one roadmap item at a time. Before anything is built, read-only agents report on what already exists and
what the change will touch; the design discussion starts from their reports, not the other way round. When the plan
has open decisions, `grill-me` settles them one question at a time.

Implementation goes to subagents. The no-idle hook means I no longer have to remember to tell each one not to sit
waiting on a background task, and the guards stop the two shell mistakes I made most often. Nothing counts as done
because a builder said so: each guard gets a mutation run through `mutate.sh`, and an evaluator that has not seen the
build attacks it.

When the work is done or the context is running out, `session-close` runs the retrospective (whose audit usually tells
me the lesson is already written somewhere, and the fix is a hook rather than another sentence), updates the roadmap
and the log, writes the handoff, and commits.

## Development

```bash
npm test                  # node --test, no dependencies
npm run scrub             # fails if a file carries a private name, an account id, a machine path or untranslated text
claude plugin validate .  # the marketplace; add a plugin path to check one plugin
```

To bring a new skill into the repository, start with `node scripts/new-skill.mjs <plugin> <skill-name>` and follow
[docs/ADDING-A-SKILL.md](docs/ADDING-A-SKILL.md).

## Credits

- The planning skills and `tdd` are adapted from [mattpocock/skills](https://github.com/mattpocock/skills) by Matt
  Pocock, under the MIT License. The upstream notice is in [NOTICE](NOTICE).
- Everything else is mine, under the MIT License ([LICENSE](LICENSE)).
