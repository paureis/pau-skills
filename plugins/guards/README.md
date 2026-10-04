# guards

Hooks: the inline-backtick guard (Bash) and the merge guard (Bash and PowerShell). Skills: `safe-merge`,
`dependency-security-audit`.

## Inline-backtick guard

Blocks (exit 2, reason on stderr) a Bash command that invokes `node -e`, `node --eval`, `python -c`, `perl -e`,
`ruby -e`, `php -r` or `deno eval` at a command position when a backtick appears in the payload outside single quotes.
Everything else passes, including heredocs, script files, single-quoted payloads and backticks in ordinary commands.
No configuration.

## Merge guard

Denies any command containing `gh pr merge`, and `gh pr close` followed anywhere by a branch deletion flag, and points
to `scripts/safe-merge.mjs`. It errs toward denying: a command that only mentions `gh pr merge` in a string is denied
too. No configuration.

## safe-merge.mjs

```bash
node "${CLAUDE_PLUGIN_ROOT}/scripts/safe-merge.mjs" <number> --dry-run
node "${CLAUDE_PLUGIN_ROOT}/scripts/safe-merge.mjs" <number>
```

Needs the GitHub CLI (`gh`), authenticated. Configuration, all optional environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `SAFE_MERGE_REPO` | none (printed, not checked) | `owner/repo` the checkout must point at |
| `SAFE_MERGE_TRUNK` | the repository's default branch | the branch PRs merge into |
| `SAFE_MERGE_PROMOTIONS` | none | extra allowed `head->base` pairs, comma-separated, e.g. `develop->main` |
| `SAFE_MERGE_PROTECTED` | trunk, promotion branches, `main`, `master`, `develop` | branches never deleted |
| `SAFE_MERGE_METHOD` | `merge` | `merge`, `squash` or `rebase` |

A repository with a `develop` working branch that is promoted to `main` would set `SAFE_MERGE_TRUNK=develop` and
`SAFE_MERGE_PROMOTIONS=develop->main`.
