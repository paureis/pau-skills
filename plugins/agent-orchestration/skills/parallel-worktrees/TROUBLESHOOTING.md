# Troubleshooting parallel worktrees

Problems in the order people usually hit them. Each entry: what you see, why, and what to do.

## "fatal: '<branch>' is already checked out at '<path>'"

Git allows a branch to be checked out in only one worktree at a time, because two folders moving one branch would
overwrite each other's commits.

- Find where: `git worktree list`.
- If you wanted a new branch for this piece, create it: `git worktree add -b <new-branch> <path> <base>`.
- If the other worktree is finished, remove it first (Phase 6 of the skill), then add yours.
- If the listed path no longer exists, the record is stale: `git worktree prune`, then retry.
- Do not use `--force` to check the same branch out twice. Newer git versions allow `--ignore-other-worktrees` on
  some commands; it is the same trap.

## The base branch itself is "already checked out"

Integrating in the main checkout usually means the main checkout holds `main`, so you cannot add a worktree on
`main`. You do not need one: create the integration branch (`git switch -c par/<batch>/integration <base>`) in
the main checkout, or add a worktree for the integration branch.

## "fatal: '<path>' already exists"

The target folder exists, often left over from an earlier batch. Check what it contains (`ls`, `git -C <path>
status`), and if it is a dead worktree, remove it properly or pick another path.

## Locked worktrees

`git worktree remove` or `prune` skips a worktree with "is locked". Someone ran `git worktree lock`, often to keep a
worktree on a removable or network drive from being pruned while it is unmounted.

- See the reason: `git worktree list --porcelain` (a `locked <reason>` line). `worktrees.mjs status` prints it too.
- If the reason no longer applies: `git worktree unlock <path>`, then remove as usual.
- Ask before unlocking one you did not lock.

## "fatal: '<path>' contains modified or untracked files, use --force to delete it"

That refusal is the safety net. Run `git -C <path> status --short`, then commit what matters on the piece's branch,
or confirm with the user that it can be thrown away. Only then consider `--force`.

## A worktree folder was deleted by hand

`git worktree list` still shows it, possibly marked prunable, and its branch still counts as checked out.
`git worktree prune` removes the record. `worktrees.mjs status` marks such entries as `missing`.

## Moving a worktree or the main repository

Each worktree has a `.git` file that points back to the main repository, and the main repository records each
worktree's path. Moving either breaks the link. Use `git worktree move <old> <new>` for a worktree; after moving the
main repository, run `git worktree repair` (git 2.29+) from it, passing the worktree paths if needed.

## Submodules

A new worktree does not initialise submodules. Run `git -C <path> submodule update --init --recursive` after adding
it. Git's documentation still calls multiple checkouts of a superproject with submodules incomplete support, so if
submodule commands misbehave, keep submodule changes out of the parallel pieces and make them in one checkout.

## Large repositories and sparse checkout

Every worktree writes a full copy of the tracked files. For a large monorepo:

- Add worktrees with `--no-checkout`, then limit them: `git -C <path> sparse-checkout set --cone <dir1> <dir2>` and
  `git -C <path> checkout <branch>`. Include every folder the piece's build and tests need, not only the ones it
  edits.
- A partial clone (`git clone --filter=blob:none`) keeps history small; worktrees share it.
- `plan-check` runs on the main checkout's file list, so sparse worktrees do not hide files from it.

## Windows path length

Deep `node_modules` trees, Java build outputs and long branch names can exceed the old 260 character path limit,
and errors look unrelated ("file not found", "filename too long").

- Keep worktree paths short: a sibling folder like `..\wt\api` rather than a deep nested one.
- `git config --system core.longpaths true` (needs an elevated prompt) lets git handle long paths.
- Enabling long path support in Windows itself helps other tools; some older tools ignore it anyway.
- Avoid putting worktrees inside a synced folder (cloud drive clients lock files and slow installs badly).

## node_modules, virtualenvs and other per-folder installs

They are not shared between worktrees, and copying one between folders tends to break (absolute paths in scripts,
compiled native modules, virtualenv activation scripts that name the old folder).

- Install fresh in each worktree with the lockfile: `npm ci`, `pnpm install --frozen-lockfile` (pnpm's store is
  shared, so this is cheap), `yarn install --immutable`, `uv sync`, `poetry install`, `python -m venv .venv` then
  install.
- Do not symlink one worktree's `node_modules` or `.venv` into another. A piece that adds a dependency would change
  it under the other agents.
- Disk use adds up; remove worktrees promptly once merged.

## Lockfile conflicts at integration

Two pieces each added a dependency, so both changed the lockfile. Hand-merging a lockfile produces one that does not
match either manifest.

- Merge the manifest (`package.json`, `pyproject.toml`, `go.mod`, `Cargo.toml`, `Gemfile`, `composer.json`, the
  `.csproj`) by hand, keeping both additions.
- For the lockfile, take the base side, then regenerate with the owning tool: `npm install`, `pnpm install`,
  `yarn install`, `uv lock`, `poetry lock --no-update`, `go mod tidy`, `cargo generate-lockfile` or a plain
  `cargo build`, `bundle install`, `composer update --lock`, `dotnet restore --force-evaluate`.
- Run the full suite afterwards. Better still, prevent it: name one piece as the lockfile owner in Phase 1.

## Migration number collisions

Two pieces each created migration `0012_*`. Many frameworks then refuse to run, or run them in an arbitrary order.
Renumber the later one during integration (and update any reference to its name or its "depends on" field), then
run the migrations from a clean database. Pre-assigning numbers in the briefs avoids this.

## Ports already in use, tests reading another worktree's data

An agent reports passing tests that turn out to have hit another worktree's server, or tests fail with "address
already in use". Give each worktree its own `PORT` and database name in its env file and brief (Phase 3), and
check with your OS tool (`lsof -i :3000`, `ss -ltnp`, `netstat -ano | findstr :3000`) which process holds a port.

## Hooks, IDE and tool caches

- Git hooks live in the shared repository, so all worktrees run the same hooks. Tools that install hooks with an
  absolute path to one worktree's `node_modules` may fail in the others; reinstall them per worktree or use a hooks
  tool that resolves paths at run time.
- Some tools keep state keyed by folder (language servers, test watchers, coverage caches). Open each worktree as its
  own project.
- Tools that look for the repository root by finding a `.git` folder can be confused by the `.git` file in a
  worktree. Updating the tool usually fixes it; `git rev-parse --show-toplevel` is the correct way to ask.
