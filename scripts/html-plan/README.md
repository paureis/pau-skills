# The html-plan zip

`scripts/pack-html-plan.mjs` builds `html-plan.zip`: upstream html-plan (`html-plan/skills/html-plan` in
`anthropics/claude-plugins-community`, commit `06ec7b6a0a82bdc4bec44bd82d4368c42f20d7c1`) plus the pau-skills
additions in this folder. The owner uploads the zip to claude.ai in place of html-plan (Q15). No upstream file is kept
in this repository: the runtime files are far over the 20,000-byte limit, so the build reads them from a checkout.

## What the build does

1. Reads every file under `--upstream`, sorted. A symbolic link is refused.
2. Checks that every anchor in `upstream.mjs` is found exactly once in its file, before it changes anything. A new
   upstream version that moved or repeated an anchor fails here, naming the file, the anchor and the count, instead of
   shipping half patched. A folder that was already built fails too.
3. Replaces one expression in `runtime/pack.mjs` (the numbering fix: a `doc-code src` excerpt that starts on a blank
   line is numbered from its first line with text).
4. Appends, after the upstream text and a blank line: `mist.css` to `runtime/htmlplan.css`, `send-to-claude.js` to
   `runtime/htmlplan.js`, and `SKILL-addition.md` to `SKILL.md`. Upstream text is never edited, only appended to.
5. Adds `NOTICE`, which names upstream and lists the additions.
6. Checks the claude.ai upload rules (`uploadProblems` from `scripts/pack-skills.mjs`).
7. Writes `<out>/html-plan.zip`, with the folder `html-plan/` at the zip root. Every entry is stamped with the time of
   the last commit that touched the build or this folder, so the same upstream at the same commit gives the same bytes.

The build never touches the network, never deletes anything, and writes or replaces only `<out>/html-plan.zip`. On a
refusal it writes nothing and prints every problem.

## Fetch upstream

This step needs the network, so it is done by hand:

```
git clone --filter=blob:none --no-checkout https://github.com/anthropics/claude-plugins-community <folder>
cd <folder>
git sparse-checkout set html-plan
git checkout 06ec7b6a0a82bdc4bec44bd82d4368c42f20d7c1
```

## Build

```
node scripts/pack-html-plan.mjs --upstream <folder>/html-plan/skills/html-plan
```

`--out <folder>` picks the output folder (default `dist/` in the repository, which git ignores; a missing folder is
created). `--help` prints the usage. Exit codes: 0 written, 1 refused (an anchor, an upload rule or a symbolic link),
2 usage.

## Upload

On claude.ai, open Customize, then Skills, and upload `dist/html-plan.zip`, replacing html-plan.

## Files

- `upstream.mjs`: the upstream facts (repository, path, commit, author, license), the anchors and the replacement.
- `mist.css`: the Mist theme.
- `send-to-claude.js`: the Send to Claude button.
- `SKILL-addition.md`: the section appended to `SKILL.md`.
- Tests: `tests/pack-html-plan.test.mjs`, `tests/html-plan-additions.test.mjs`, `tests/html-plan-send.test.mjs`, with
  the fake upstream in `tests/fixtures/html-plan-upstream/`.
