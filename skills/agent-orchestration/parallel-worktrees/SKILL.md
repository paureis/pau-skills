---
name: parallel-worktrees
description: Split a body of work into independent pieces and run them in parallel, each in its own git worktree on its own branch, so several agents (subagents in one session, or several Claude Code sessions or terminals) never edit the same checkout; decide whether parallel work is safe at all, write a brief per piece, set up the worktrees, integrate the branches one at a time with the tests run after each merge, and clean up without losing uncommitted work. Use when the user says "run these in parallel", "split this across agents", "use worktrees", "spin up several sessions on this", "fan out", "parallelize the refactor", "work on several features at once", or when a task list has pieces that touch different parts of the codebase.
argument-hint: "[the work to split, e.g. 'issues 41, 42 and 47' or a path to a plan]"
---

# Parallel worktrees

Run several agents on one repository at the same time without them overwriting each other. Each piece of work gets
its own branch and its own working folder (a git worktree), and the branches come back together one at a time.

The work to split: $ARGUMENTS

Bundled files, open them when you reach their phase:
- `${CLAUDE_PLUGIN_ROOT}/skills/agent-orchestration/parallel-worktrees/BRIEF-TEMPLATE.md`: the brief each piece's agent receives
- `${CLAUDE_PLUGIN_ROOT}/skills/agent-orchestration/parallel-worktrees/TROUBLESHOOTING.md`: errors and environment problems, with fixes
- `${CLAUDE_PLUGIN_ROOT}/skills/agent-orchestration/parallel-worktrees/worktrees.mjs`: `plan-check` finds files claimed by two pieces;
  `status` shows every worktree's branch, ahead/behind, uncommitted files and last commit (Node 20+, no dependencies)

Why worktrees and not one checkout: two agents in one folder share one index and one set of files. One agent's
`git add -A` commits the other's half-finished edit, a formatter run rewrites files the other is editing, and a
branch switch pulls the floor out from under everyone. A worktree shares the repository's history but has its own
files, index and checked-out branch, so none of that can happen.

## Phase 1: decide whether to parallelize at all

Parallel work pays only when the pieces are truly independent. Two agents editing the same file produce a merge
conflict that someone must resolve with less context than either agent had; that usually costs more than running
the pieces one after another.

Run this test for each candidate piece:

- [ ] List the files it will create, edit or delete, as paths or globs. Read the code to do this; do not guess from
      the task title.
- [ ] Name shared generated files it would touch: lockfiles (`package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`,
      `poetry.lock`, `uv.lock`, `Pipfile.lock`, `go.sum`, `Cargo.lock`, `Gemfile.lock`, `composer.lock`,
      `packages.lock.json`, `gradle.lockfile`), generated clients, snapshot files, schema dumps, migration indexes,
      route manifests, translation catalogues, changelogs.
- [ ] Name ordering dependencies: does any piece need a function, table, endpoint or type that another piece adds?
- [ ] Name sequence numbers: migrations numbered `0007_*`, version bumps, ADR numbers. Two pieces that each take
      "the next number" collide even though their files have different names.

Then write the plan as JSON and check it mechanically:

```json
{ "pieces": [
  { "name": "billing-api", "files": ["services/billing/**", "docs/billing.md"] },
  { "name": "search-ui",   "files": ["web/src/search/**", "web/src/routes/search.tsx"] }
] }
```

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/agent-orchestration/parallel-worktrees/worktrees.mjs" plan-check plan.json
```

It expands every glob against the repository's files and lists each file claimed by more than one piece, plus new
paths two pieces would both create. Exit 1 means overlap. For each overlap, pick one:

- **Serialize**: run the overlapping pieces one after another, the second starting from the first's merged result.
- **Assign an owner**: one piece owns the shared file; the others must not touch it and say in their report what
  they need changed there. Typical for a lockfile: one piece adds every new dependency, or dependency changes wait
  for integration.
- **Merge the pieces** into one.

Do not parallelize when:
- the whole job is under an hour of work for one agent; setup and integration cost more than they save;
- the change is tightly coupled (renaming a widely used type, changing a shared interface and all its callers);
- pieces share a database schema or migration sequence and cannot be given separate numbers up front;
- you cannot state how each piece proves it is done (then you cannot integrate safely either).

**Done when** `plan-check` exits 0, or every reported overlap has a written decision (serialize, owner, or merge),
and every ordering dependency is either removed or turned into a sequence.

## Phase 2: plan the pieces

- [ ] One branch per piece, all created from the **same base commit**. Record it: `git rev-parse HEAD` on an
      up-to-date base branch. Pieces started from different commits make integration harder to reason about.
- [ ] Branch names follow one pattern, for example `par/<batch>/<piece>` (`par/2024-billing/api`). A shared prefix
      makes them easy to list and delete later (`git branch --list 'par/2024-billing/*'`).
- [ ] Pre-assign anything numbered: migration numbers, ports, test database names (see Phase 3).
- [ ] Write one brief per piece from `BRIEF-TEMPLATE.md`: goal, the files it owns, what it must not touch, how it
      proves it is done (a command that must pass), and what to report. The brief is the agent's whole world: it
      did not see this conversation.
- [ ] Choose the integration order now (Phase 5), so foundations go first.

**Done when** each piece has a branch name, a brief with a done-command, and a place in the merge order.

## Phase 3: set up the worktrees

Put worktrees outside the main checkout, in a sibling folder, or in a folder inside it that git ignores:

```bash
git fetch origin
BASE=$(git rev-parse origin/main)            # the recorded base commit
git worktree add -b par/batch1/api ../myrepo-wt/api "$BASE"
git worktree add -b par/batch1/ui  ../myrepo-wt/ui  "$BASE"
# or, inside the repo: add ".worktrees/" to .gitignore first, then
git worktree add -b par/batch1/api .worktrees/api "$BASE"
git worktree list
```

A folder inside the repository that is not ignored shows up as untracked files in the main checkout, and tools that
scan the tree (test runners, linters, file watchers, search indexes) will crawl every copy. Ignore it or use a
sibling folder.

Each worktree is a fresh checkout. Nothing untracked comes with it. Budget for:

- **Dependencies**: install per worktree with the project's own command (`npm ci`, `pnpm install --frozen-lockfile`,
  `uv sync`, `poetry install`, `pip install -r requirements.txt` in a fresh venv, `bundle install`,
  `composer install`, `dotnet restore`, `mvn -q dependency:go-offline` or `./gradlew dependencies`). Go and Rust
  share their global module and registry caches, so they cost little; `node_modules` and virtualenvs are per folder.
  Read the project's README or CI config to find the real install command before guessing.
- **Environment files**: `.env`, `.env.local`, `local.settings.json`, `appsettings.Development.json` and similar
  are usually gitignored and therefore missing. Copy them explicitly. Never commit them to make this easier.
- **Build caches**: the first build in each worktree is a cold build. Shared caches (Gradle, Cargo's registry, the
  Go build cache, ccache, Turborepo or Nx remote caches) help; per-folder ones (`target/`, `dist/`, `.next/`) do not.
- **Ports**: two dev servers on port 3000 fail, or worse, one agent tests the other's server. Give each worktree its
  own: `PORT=3101`, `3102`, and the same for any second service (API, storybook, debugger).
- **Databases and other shared state**: two test suites against one database delete each other's rows. Give each a
  name: `DATABASE_URL=.../app_test_api`, `.../app_test_ui`, a separate SQLite file, a separate Docker Compose
  project (`COMPOSE_PROJECT_NAME=myrepo_api`), a separate Redis database number or key prefix, a separate S3 or
  queue prefix in local emulators.

Put the per-worktree values in the worktree's own untracked env file and in the brief.

**Claude Code alternative.** Recent Claude Code versions can create and manage worktrees themselves: `claude
--worktree <name>` starts a session in a new worktree, and the Agent tool accepts `isolation: "worktree"` so a
subagent runs in a temporary worktree that is cleaned up if it made no changes. Check the current documentation for
the exact flags and where the worktrees are placed. These remove the manual `git worktree add`, but not the per
worktree setup above, and not Phases 1, 2 and 5.

**Done when** `git worktree list` shows one worktree per piece on the right branch, and in each one the project's
install step and the piece's done-command have run once (failing tests are fine at this point; a missing dependency
is not).

## Phase 4: run the agents

- Launch one agent per piece with its brief and its worktree path as the working directory. Subagents: one Agent
  call per piece, all in the same message so they run concurrently. Separate sessions: one terminal per worktree,
  `cd` into it, start the session, paste the brief.
- Each agent edits, runs its checks and commits **only inside its own worktree**, on its own branch. It does not
  push to the base branch, does not rebase other branches, and does not run `git worktree` commands.
- The orchestrator (you) does not edit files in any worktree while agents run. Watch with
  `node "${CLAUDE_PLUGIN_ROOT}/skills/agent-orchestration/parallel-worktrees/worktrees.mjs" status --base main` and read the reports.
- If an agent reports it needs a file outside its scope, stop that piece and decide: give it the file (and check no
  other piece owns it), or queue the change for integration. Do not let it "just make the small edit".

**Done when** every agent has reported, every piece's done-command passes in its worktree, and `status` shows
`dirty 0` for each piece (everything committed).

## Phase 5: integrate

Merge one branch at a time into an integration branch, in the order chosen in Phase 2: foundations (schema, shared
types, config) first, then the pieces that build on them, the riskiest last so a problem there does not block the
others.

```bash
git switch -c par/batch1/integration "$BASE"
git merge --no-ff par/batch1/api
<full test suite, lint and build, with the project's own commands>
git merge --no-ff par/batch1/ui
<full test suite again>
```

Rebasing each branch onto the integration branch before merging works too and gives linear history; pick one style
and keep it for the batch.

- Run the **full** suite after **each** merge, not once at the end. Two pieces that each pass alone can break
  together (a renamed helper, a duplicate route, a changed default); finding which pair broke it is easy after one
  merge and slow after five.
- Resolve a conflict by reading both pieces' briefs and keeping both intents. Open the file, understand each side,
  write the combined version, and run the tests. Do not resolve by deleting one side's lines, by taking `--ours` or
  `--theirs` for a whole file you have not read, or by line numbers from a script.
- Regenerate shared generated files (lockfiles, snapshots, generated clients) with the tool that owns them after the
  merge instead of hand-merging their contents.
- If a merge breaks the suite and the fix is not obvious, abort it (`git merge --abort`, or `git reset --hard` to
  the previous merge commit on the integration branch only), continue with the next piece, and send the broken one
  back to its agent with the failure.

**Done when** every piece is merged into the integration branch, the full suite, lint and build pass on it, and it
has been merged or opened as a pull request against the base branch the way the project normally lands work.

## Phase 6: clean up

Remove a worktree only after proving nothing in it would be lost:

```bash
git -C ../myrepo-wt/api status --short          # must print nothing
git log --oneline par/batch1/integration..par/batch1/api   # must print nothing: every commit is merged
git worktree remove ../myrepo-wt/api
git worktree prune
git branch -d par/batch1/api                    # -d refuses unmerged branches; that refusal is the safety check
```

- Run these from the main checkout, not from inside the worktree being removed.
- Never use `git worktree remove --force` or `git branch -D` to get past a refusal. Find out what is uncommitted or
  unmerged first, and either commit and merge it or confirm with the user that it can go.
- After pruning, look for leftover folders git no longer tracks (prune only removes git's records) and delete them
  once you have checked their contents. Remove per-worktree env files, databases and Docker Compose projects you
  created.

**Done when** `git worktree list` shows only the worktrees that existed before the batch, the batch's branches are
deleted locally (and remotely, if they were pushed), and no batch database or container is left running.

## Do not

- Do not run two agents in the same checkout, even "just for a quick fix".
- Do not start pieces from different base commits without saying so in the plan.
- Do not let an agent edit a file another piece owns, or regenerate a shared lockfile it does not own.
- Do not merge all branches and run the tests once at the end.
- Do not remove a worktree, or delete a branch, that has uncommitted or unmerged work.
- Do not copy secrets into a tracked file to save setup time.

## Report

```
Parallel worktrees: <batch name>
Base commit: <sha>   Integration branch: <name>
Pieces:
  <name>  branch <branch>  worktree <path>  done-command <cmd>: PASS | FAIL  commits <n>
Overlaps found by plan-check: <none | list, with the decision for each>
Merge order and result after each merge: <piece>: suite PASS | FAIL (<what failed, how fixed>)
Conflicts resolved: <file: how both intents were kept>
Not merged: <piece: why, what it needs>
Cleanup: worktrees removed <n>; branches deleted <list>; leftovers <none | list>
```
