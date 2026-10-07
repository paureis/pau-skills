# Piece brief template

Copy this for each piece, fill every bracket, and delete the guidance lines in parentheses. The agent that receives
it has not seen the planning conversation, so anything it needs must be written here. Keep it to one screen if you
can; a long brief usually means the piece is too big.

---

## Piece: [name]

**Worktree:** [absolute path to this piece's worktree]
**Branch:** [par/<batch>/<piece>], created from base commit [sha]
**Work only inside the worktree above.** Run every command from there. Commit on this branch only.

### Goal

[One to three sentences: what is different when this piece is done, from a user's or caller's point of view.]

[Link or paste the issue, spec section or acceptance criteria this piece implements.]

### Files you own

You may create, edit and delete these, and nothing else:

- [path or glob]
- [path or glob]

### Do not touch

Other pieces own these, or they are shared. If you need a change in one, stop and say so in your report instead of
making it.

- [paths or globs owned by other pieces]
- [shared files: lockfiles, generated clients, snapshots, migration index, changelog]
- [anything numbered: "use migration number 0042, not the next free one"]

(If this piece owns the lockfile for the batch, say so here and list which dependency changes it should make.)

### Environment for this worktree

- Install: [the project's install command, e.g. `uv sync`, `npm ci`, `bundle install`]
- Env file: [path to the untracked env file already copied in, or "none needed"]
- Port: [PORT=31xx and any other ports]
- Database / services: [test database name, Compose project name, key prefix]

### Done when

All of these pass in this worktree, and you have run them yourself after your last change:

```
[the exact command, e.g. pytest tests/billing, go test ./services/billing/..., npm test -- search, cargo test -p billing]
[lint or typecheck command, if the project has one]
```

[Any extra observable check: an endpoint returns X, a page renders Y.]

### Rules

- Commit your work in small, described commits on your branch. Leave nothing uncommitted when you finish.
- Do not push to, merge into, or rebase the base branch or any other piece's branch.
- Do not run `git worktree`, `git checkout <other branch>`, `git stash` or `git reset --hard`.
- Do not skip hooks or tests to make the done-command pass. If something outside your scope breaks it, report it.

### Report back

```
Piece: [name]
Branch: [branch]   Commits: [n]   Last commit: [sha] [subject]
Done-command results: [command: PASS | FAIL, with the failing output if any]
Files changed: [list]
Needed outside my scope (not done): [file: what and why, or "none"]
Notes for integration: [renamed symbols, new config keys, new dependencies, anything another piece might collide with]
```
