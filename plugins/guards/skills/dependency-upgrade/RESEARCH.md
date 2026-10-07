# Researching a major bump

One copy of this checklist per major upgrade. The output is a short research note that the plan in phase 4 is built
from. Research before touching code: an hour reading release notes is cheaper than an afternoon reverse-engineering
a failure that the migration guide described in one sentence.

## 1. Confirm the target

- [ ] The target version exists and is a final release: query the registry (`ECOSYSTEMS.md`), not memory. Note its
      release date.
- [ ] Decide the target. The newest major is usually right; the latest patch of the previous major is sometimes
      better when the newest one is days old, has a long list of open regressions, or its ecosystem (plugins, adapters)
      has not caught up. Say which you chose and why.
- [ ] List every major between current and target. Each one has its own breaking changes; read them all.

## 2. Find the primary sources

Read sources in this order, and record the links in the note:

1. The official migration or upgrade guide on the project's docs site.
2. The release notes for each major (repository Releases page, or the "what's new" page).
3. `CHANGELOG.md` (or `CHANGES`, `HISTORY`, `UPGRADE.md`, `NEWS`) in the repository at the target tag.
4. If none of these exist, the commit log between the two tags (`<repo>/compare/<old-tag>...<new-tag>`) and issues
   labelled "breaking".

Blog posts, forum answers and summaries are secondary: useful for finding a gotcha, never a substitute for the
project's own notes. If the release notes cannot be found at all, say so in the report; that is itself a risk signal.

## 3. Extract the breaking changes that touch this code

For each breaking change listed in the sources:

- [ ] Name the affected API, option, config key, CLI flag, default, or behaviour.
- [ ] Search the codebase for it, including config files, templates, scripts and tests (for example
      `git grep -n '<symbol>'`), and record the hit count and files.
- [ ] Zero hits: note it as not applicable. Some changes have no greppable symbol (a changed default, different
      ordering, a stricter parser, a new timezone or encoding default); mark those "behavioural" and plan a test or a
      smoke check that would expose them.
- [ ] Hits: write the fix as a task, with the replacement API from the guide.

Also note deprecations introduced in the target version: they are the next upgrade's breaking changes, and fixing them
now is usually cheap.

## 4. Requirements and compatibility

- [ ] Minimum runtime (Node, Python, Go, JDK, Rust MSRV, Ruby, PHP, .NET) for the target version, compared with what
      the project runs in development, CI and production.
- [ ] Peer dependencies or companion packages that must move in lockstep (a framework and its renderer, a library and
      its type definitions, a plugin and its host, a BOM and its members).
- [ ] Other direct dependencies that cap this package: do any of them declare a range that excludes the target?
      (`npm explain`, `composer why-not`, `cargo tree -i`, `pipdeptree --reverse` and similar.) If so, does a release of
      that dependency support the target yet? This is the most common blocker.
- [ ] Platform support dropped (an OS, a CPU architecture, a browser target, a database version).
- [ ] Build tooling changes (a new bundler default, ESM only, a changed compiler flag).

## 5. Migration help

- [ ] An official codemod or migration tool exists? Record the exact command from the guide and which breaking changes
      it covers and which it does not.
- [ ] A compatibility layer or flag that lets the upgrade land in two steps (enable new behaviour behind a flag first,
      remove the old usage later)?
- [ ] Known regressions: skim the project's issue tracker for open issues labelled as regressions against the target
      version.

## 6. Supply-chain check

- [ ] Publisher and maintainers are the same as for the version you use now, or the change is explained (a project
      moved to a foundation, an organisation renamed). An unexplained change of owner is a flag.
- [ ] Release cadence: a sudden major after a long silence, or several majors in a few days, is a flag.
- [ ] New install-time scripts (`postinstall`, `build.rs`, `setup.py` with network access) that the old version did
      not have.
- [ ] The package name is exactly the one the project already uses; watch for lookalike names in guides and answers.
- [ ] Known vulnerabilities in the target version (the ecosystem's audit command, or the GitHub advisory database).

Any flag goes into the report under "Supply-chain flags" and is raised with the user before installing.

## 7. The research note

```
### <package> <current> -> <target>

Sources: <migration guide link>, <release notes links>, <changelog link>
Intermediate majors read: <list>
Runtime: needs <runtime> >= <version>; project has <version> (ok | upgrade first)
Peers / lockstep: <packages and versions>
Cappers: <direct deps whose range excludes the target, and whether a fix is released>
Breaking changes that hit this code:
  - <change>: <n> hits in <files>; fix: <replacement>
Behavioural changes to verify: <list, with how to check each>
Not applicable: <changes with zero hits, one line each>
Codemod: <command> covers <items>; manual: <items>
Risk flags: <none | details>
Estimate: <small | medium | large>, and why
```
