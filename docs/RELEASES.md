# Releases

Each batch that bumps the `pau-skills` bundle version gets one GitHub Release, written like game patch notes. Releases
start with batch 20; the batches before it get none (no backfill).

## How a release is made

1. The batch's pull request adds `docs/releases/v<bundle version>.md`, written from the template below.
2. `npm test` runs `node scripts/release-notes.mjs check` on every notes file, so a malformed file fails CI.
3. When the pull request merges to main, `.github/workflows/release.yml` runs `check`, then `publish`. `publish`
   creates one release for each notes file that has none, with `gh release create`, tagged
   `v<bundle version>` at the merge commit. The tag is made by the release, so no session pushes a tag.
4. `publish` refuses, and creates nothing, when a notes file with no release does not carry the bundle version in
   `.claude-plugin/marketplace.json`, or when its `Skills` or `Hooks` count does not match the tree. It fails
   closed: an older notes file with no release blocks the new one too.

A batch with no bundle bump gets no release and no notes file.

## The template

The file name is `v<version>.md`, with the version of the `pau-skills` bundle after the batch. Line 1 is the title:
`Patch <version>: batch <n>, <theme>`. The title line holds no shortcode or emoji; the `##` headings carry them.

```markdown
# Patch 0.23.0: batch 20, <theme>

One or two lines on what the batch was about.

## :sparkles: New

- `skill-name` (plugin): what it does, in one line.

## :arrow_up: Changed (buffs and nerfs)

- `skill-name`: what changed and why it matters to you.
- Removed: `old-skill`, replaced by `skill-name`.

## :package: Versions

- `pau-skills` 0.22.0 to 0.23.0, `verification` 0.9.0 to 0.10.0.

## :bar_chart: Counts

- Skills: 40
- Hooks: 16
- Tests: 1,990

## :inbox_tray: What you do

- Upload as new: `skill-name.zip`.
- Replace: `other-skill.zip`.
- Delete: `old-skill`.
- Hooks: `claude plugin marketplace update pau-skills`, then
  `claude plugin update pau-skills-hooks@pau-skills`. Or: No hook changed.

## :warning: Known issues

None.
```

The six sections must come in this order: New, Changed, Versions, Counts, What you do, Known issues. A heading
matches when, after its shortcodes or Unicode emoji, it starts with the section's words, so
`## :arrow_up: Changed (buffs and nerfs)` counts as Changed. Other `##` headings may sit between them. Every section has at least one line;
write "None." when there is nothing to say. The Counts section holds exactly one each of `Skills: <n>`, `Hooks: <n>`
and `Tests: <n>`; a number may use thousands commas.

Write emoji as GitHub shortcodes (`:sparkles:`); Unicode emoji also work in the headings, never in the title line.
A session cannot reach `gh api emojis` or `gh api markdown` to check
a shortcode or a preview, so keep to common ones like those in the template.

Notes follow the house style: the style test's banned words (for example `game-changing`, `enhance`, `showcase`,
`supercharge`, `boasts`) and the scrub's author-name rule apply to them as to any other file.

## Where each fact comes from

- New, changed and removed skills:
  `node scripts/pack-skills.mjs --since <main before the batch> --out <scratch folder>`, which lists each skill
  as new, changed or removed and builds the zips.
- Versions: `git diff <main before the batch> -- .claude-plugin/marketplace.json`.
- Skills and hooks: the publish check counts them (folders under `skills/<plugin>/` with a `SKILL.md`, and the
  distinct hook scripts named in every `hooks/<plugin>/hooks.json`). The pre-merge check below names any mismatch.
- Tests: the `# tests` line of `npm test` on the batch's last commit. The publish check does not count tests.

What you do lists the zips to upload as new, to replace, or to delete on claude.ai, and the hook update commands
(see "Updating" in [INSTALL.md](INSTALL.md)) when a hook changed, or "No hook changed."

## GIFs and images

The only image form is `![what it shows](media/<name>)`, with the file committed in `docs/releases/media/`: the
project's own files, never one from outside the repository. `publish` points each `](media/` link at the file at the
release's tag, so the image does not change when main does. `check` refuses any other image target, a missing media
file, a reference-style image, and an HTML `<img>`, `<picture>`, `<source>` or `<video>` tag.

Without code, the owner can also drag a GIF into a published release on github.com, which uploads it to the release.

## Before the merge

Run the pre-merge check from the batch's branch:

```bash
node scripts/release-notes.mjs publish --dry-run --repo <owner/name>
```

It lists the existing releases with `gh api` (that works from a session), runs the publish checks, and prints the
`gh release create` command it would run, with `<sha>` for the merge commit. Use `--existing <every released tag>`,
comma separated, only when gh is unavailable. `--existing ""` would treat every older notes file as unpublished, so
it fails from the second release on.

A release can publish while CI is red on that commit, because the workflows run apart. So the batch merges only on
green.

## When something goes wrong

- The run failed: fix the cause on main, then use "Run workflow" on the Release workflow in the Actions tab (it
  publishes only from main). Or create the release by hand on github.com from the notes file: tag
  `v<version>` at the merge commit, the title from line 1, and the rest of the file as the body.
- An older notes file was never released: release it by hand on github.com first, at its own merge commit. Until
  then `publish` refuses every newer file.
- Editing a notes file after its release does not change the release. Edit the release on github.com as well.
