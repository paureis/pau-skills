# Ecosystem command reference

Commands for each phase, per ecosystem. Before relying on a command, check the tool's version in this project
(`npm --version`, `poetry --version`, `cargo --version` and so on): flags change between major versions of the tools
themselves, and a few commands below need a minimum version, noted where it matters. If a command is not available,
check the tool's own help (`<tool> help <command>`) rather than guessing a flag.

Throughout, "targeted update" means re-resolving only the named package (and what it strictly needs). Prefer it to
any command that re-resolves the whole tree.

## Detecting what the project uses

| Ecosystem | Manifest | Lockfile |
|-----------|----------|----------|
| npm | `package.json` | `package-lock.json` (or `npm-shrinkwrap.json`) |
| pnpm | `package.json`, `pnpm-workspace.yaml` | `pnpm-lock.yaml` |
| Yarn | `package.json`, `.yarnrc.yml` (Berry) | `yarn.lock` |
| Bun | `package.json` | `bun.lock` (text) or `bun.lockb` (older, binary) |
| pip | `requirements*.txt`, `requirements*.in` (pip-tools) | the compiled `requirements*.txt` |
| uv | `pyproject.toml` | `uv.lock` |
| Poetry | `pyproject.toml` (`[tool.poetry]` or `[project]` in Poetry 2) | `poetry.lock` |
| Go | `go.mod` | `go.sum` |
| Cargo | `Cargo.toml` | `Cargo.lock` |
| Maven | `pom.xml` | none by default |
| Gradle | `build.gradle(.kts)`, `gradle/libs.versions.toml` | `gradle.lockfile` if locking is enabled |
| Bundler | `Gemfile` | `Gemfile.lock` |
| Composer | `composer.json` | `composer.lock` |
| NuGet | `*.csproj`, `Directory.Packages.props` | `packages.lock.json` if enabled |
| Mix | `mix.exs` | `mix.lock` |
| Swift PM | `Package.swift` | `Package.resolved` |

```bash
git ls-files | grep -E '(^|/)(package\.json|pnpm-lock\.yaml|yarn\.lock|package-lock\.json|bun\.lockb?|requirements[^/]*\.(txt|in)|pyproject\.toml|uv\.lock|poetry\.lock|go\.mod|Cargo\.toml|pom\.xml|build\.gradle(\.kts)?|libs\.versions\.toml|Gemfile|composer\.json|[^/]*\.csproj|Directory\.Packages\.props|mix\.exs|Package\.swift|Dockerfile[^/]*)$'
```

With several JavaScript lockfiles present, the one the CI install step uses is the real one; the `packageManager`
field in `package.json` also says. Mention stray extra lockfiles in the report rather than deleting them.

## JavaScript and TypeScript

### npm
- Outdated: `npm outdated` (columns Current, Wanted, Latest; add `--all` for transitive, `--long` for the type).
- Clean install from lockfile: `npm ci`.
- Upgrade one within range: `npm update <pkg>`.
- Upgrade one to an exact or new major version: `npm install <pkg>@<version>` (`-D` for a dev dependency). Move
  related packages together in one command, for example `npm install react@19 react-dom@19 @types/react@19`.
- Regenerate the lockfile after a manifest edit: `npm install` (or `npm install --package-lock-only` without touching
  `node_modules`).
- Force a transitive version: an `overrides` entry in `package.json`, then `npm install`.
- Why is it here: `npm explain <pkg>` or `npm ls <pkg>`.
- Does the version exist, what does it need: `npm view <pkg>@<version> version engines peerDependencies`,
  `npm view <pkg> versions --json`, `npm view <pkg> time --json` (release dates), `npm view <pkg> maintainers`.
- Audit: `npm audit` (`--omit=dev` for production only).

### pnpm
- Outdated: `pnpm outdated` (`-r` across workspaces).
- Clean install: `pnpm install --frozen-lockfile`.
- Upgrade one within range: `pnpm update <pkg>`; to the newest major: `pnpm update <pkg> --latest`; exact:
  `pnpm add <pkg>@<version>`. Add `-r` or `--filter <workspace>` in a monorepo.
- Regenerate the lockfile: `pnpm install` (or `pnpm install --lockfile-only`).
- Force a transitive version: `pnpm.overrides` in `package.json` (or `overrides` in `pnpm-workspace.yaml` on newer
  pnpm).
- Why: `pnpm why <pkg>`. Audit: `pnpm audit`.

### Yarn
- Classic (v1): `yarn outdated`; `yarn upgrade <pkg>`; `yarn upgrade <pkg> --latest`; `yarn why <pkg>`; `yarn audit`;
  clean install `yarn install --frozen-lockfile`.
- Berry (v2 and later): there is no `yarn outdated`; use `yarn upgrade-interactive` (built in from v4, a plugin
  before). Upgrade: `yarn up <pkg>` or `yarn up <pkg>@<version>`. Why: `yarn why <pkg>`. Audit: `yarn npm audit`
  (`--recursive` for transitive). Clean install: `yarn install --immutable`. Transitive pin: `resolutions` in
  `package.json`.

### Bun
- Outdated: `bun outdated`. Upgrade: `bun update <pkg>`, `bun update <pkg> --latest`, or `bun add <pkg>@<version>`.
- Clean install: `bun install --frozen-lockfile`. Lockfile only: `bun install --lockfile-only`.
- Why: `bun why <pkg>`, and audit: `bun audit`, on recent Bun releases only; check
  `bun --help` first.

### Changelogs and codemods (JavaScript)
The package's repository (the `repository` field: `npm view <pkg> repository.url`), its GitHub Releases page, a
`CHANGELOG.md` in the repository or in the published package (`node_modules/<pkg>/CHANGELOG.md`), and for frameworks
the official upgrade guide on its docs site. Many frameworks ship codemods (for example `npx @next/codemod`,
`npx storybook@latest upgrade`, `npx @angular/cli update` via `ng update`); the migration guide names the right one.
For type packages (`@types/*`), match the major of the library they describe.

## Python

### pip with requirements files (and pip-tools)
- Outdated: `pip list --outdated` (shows installed and latest, no "wanted"; the range is in your requirements file).
- Upgrade one with pip-tools: `pip-compile --upgrade-package <pkg>` (or `<pkg>==<version>`), then `pip-sync`.
  Without pip-tools, edit the pin in the requirements file and run `pip install -r requirements.txt`.
- Regenerate everything with pip-tools: `pip-compile --upgrade` (this is a wholesale re-resolve: ask first).
- Why: `pipdeptree --reverse --packages <pkg>` (install `pipdeptree`).
- Does the version exist: `pip index versions <pkg>` (marked experimental in pip), or the PyPI JSON API
  `https://pypi.org/pypi/<pkg>/<version>/json`, which also shows `requires_python`.
- Audit: `pip-audit` (or `pip-audit -r requirements.txt`).

### uv
- Outdated: `uv tree --outdated --depth 1` (projects) or `uv pip list --outdated` (environments).
- Clean install: `uv sync --locked`.
- Upgrade one: `uv lock --upgrade-package <pkg>` (or `<pkg>==<version>`), then `uv sync`. Raise the declared range:
  `uv add "<pkg>>=<version>"`.
- Regenerate after a manifest edit: `uv lock` (keeps existing pins where it can). Everything: `uv lock --upgrade`
  (ask first).
- Why: `uv tree --invert --package <pkg>`.
- Audit: `uvx pip-audit`, or the audit command of your uv version if it has one.

### Poetry
- Outdated: `poetry show --outdated` (`--top-level` for direct only, Poetry 1.2 and later).
- Clean install: `poetry install --sync` (Poetry 1.x) or `poetry sync` (Poetry 2).
- Upgrade one within range: `poetry update <pkg>`. New major: `poetry add <pkg>@^<version>` or `poetry add <pkg>@latest`.
- Regenerate after a manifest edit: `poetry lock --no-update` on Poetry 1.x; on Poetry 2, plain `poetry lock` keeps
  pins and `poetry lock --regenerate` re-resolves everything (ask first).
- Why: `poetry show --tree` or `poetry show --why <pkg>` on recent versions.
- Audit: no built-in command; export the lock and run `pip-audit` on it.

### Changelogs (Python)
The "Project links" on the PyPI page (`https://pypi.org/project/<pkg>/`), the repository's Releases page, a
`CHANGELOG`, `CHANGES.rst` or `HISTORY` file, and the docs site's "release notes" or "what's new" pages (Django,
SQLAlchemy, pandas and NumPy all keep detailed ones). Codemods are less common; `django-upgrade` and `pyupgrade`
rewrite version-specific syntax, and some libraries ship their own migration scripts.

## Go
- Outdated: `go list -m -u all` (an available upgrade shows in brackets) or `go list -m -u -json all` for parsing.
  Direct requirements are those without `// indirect` in `go.mod`.
- Upgrade one: `go get example.com/mod@v1.4.2` (or `@latest`); minor and patch for all direct deps:
  `go get -u ./...`; patch only: `go get -u=patch ./...`.
- New major: the module path changes (`example.com/mod/v2`), so it is a new import path. `go get example.com/mod/v2@latest`,
  then update every import, then remove the old one with `go mod tidy`.
- Regenerate `go.sum` and prune: `go mod tidy`.
- Why: `go mod why -m <module>`, `go mod graph`.
- Versions that exist: `go list -m -versions <module>`.
- Audit: `govulncheck ./...` (`go install golang.org/x/vuln/cmd/govulncheck@latest`); it reports only vulnerable code
  your program actually calls.
- Changelogs: the repository's Releases and tags, pkg.go.dev for the module (its version list links to the source).
- Toolchain: the `go` line (minimum language version) and optional `toolchain` line in `go.mod`;
  `go get go@<version>` raises it. A dependency that needs a newer `go` line raises yours when you upgrade it: check the
  `go.mod` diff for that.

## Rust (Cargo)
- Outdated: `cargo outdated` (the `cargo-outdated` extension), or `cargo update --dry-run` for semver-compatible moves.
- Upgrade one within its range: `cargo update -p <crate>`; to an exact version: `cargo update -p <crate> --precise <version>`.
- New major: edit the version in `Cargo.toml`, then `cargo update -p <crate>`; or `cargo upgrade -p <crate> --incompatible`
  from the `cargo-edit` extension.
- Regenerate: `cargo generate-lockfile` re-resolves everything (ask first); targeted `cargo update -p` is the norm.
- Why: `cargo tree -i <crate>`; duplicates: `cargo tree -d`.
- Versions and metadata: `cargo info <crate>` (recent Cargo), or the crates.io page.
- Audit: `cargo audit` (`cargo-audit`) or `cargo deny check advisories` (`cargo-deny`).
- Changelogs: the crate's repository link on crates.io, `CHANGELOG.md`, and docs.rs for API diffs.
- Toolchain: `rust-toolchain.toml` and `rust-version` (MSRV) in `Cargo.toml`; a new crate version may raise its MSRV.

## Java and Kotlin

### Maven
- Outdated: `mvn versions:display-dependency-updates`, `mvn versions:display-plugin-updates`,
  `mvn versions:display-property-updates` (Versions Maven Plugin).
- Upgrade: edit the version (often a property, or the parent or BOM version, such as the Spring Boot parent), or
  `mvn versions:use-dep-version -Dincludes=<group>:<artifact> -DdepVersion=<version>`,
  `mvn versions:update-property -Dproperty=<name> -DnewVersion=<version>`. Remove the `pom.xml.versionsBackup` files
  the plugin leaves.
- No lockfile by default, so the effective versions come from the tree: `mvn dependency:tree -Dincludes=<group>:<artifact>`.
- Audit: OWASP Dependency-Check (`mvn org.owasp:dependency-check-maven:check`) or your platform's scanner.
- Wrapper: `mvn wrapper:wrapper -Dmaven=<version>`.

### Gradle
- Outdated: no built-in task; the common one is `./gradlew dependencyUpdates` from the `com.github.ben-manes.versions`
  plugin. With a version catalog, versions live in `gradle/libs.versions.toml`.
- Upgrade: edit the catalog or build file.
- Lockfile (only if dependency locking is enabled): `./gradlew dependencies --write-locks` rewrites all locks (ask
  first); `./gradlew dependencies --update-locks <group>:<artifact>` is targeted.
- Why: `./gradlew dependencyInsight --dependency <name> --configuration runtimeClasspath`.
- Wrapper: `./gradlew wrapper --gradle-version <version>`, then run it a second time so the wrapper files update
  themselves. Upgrade the Gradle wrapper before the Android Gradle Plugin or Kotlin plugin that needs it.
- Changelogs (JVM): the project's GitHub Releases, its site's release notes, and for frameworks the migration guide
  (Spring Boot keeps one per minor on its GitHub wiki). OpenRewrite recipes are the usual codemod for Spring, JUnit and
  Java version migrations.
- JDK: `maven.compiler.release` or the Gradle `java { toolchain { languageVersion = ... } }` block, plus CI and
  Docker images.

## Ruby (Bundler)
- Outdated: `bundle outdated` (`--strict` to respect Gemfile constraints, `--only-explicit` for direct gems).
- Upgrade one, keeping others still: `bundle update <gem> --conservative`. Patch or minor only: `bundle update --patch`
  or `--minor`.
- New major: change the constraint in `Gemfile`, then `bundle update <gem> --conservative`.
- Lockfile only: `bundle lock --update <gem>`.
- Why: `bundle exec gem dependency <gem> --reverse-dependencies`, or read `Gemfile.lock`.
- Versions: `gem list <gem> --remote --all`.
- Audit: `bundle audit check --update` (`bundler-audit`).
- Changelogs: the gem's RubyGems page ("Changelog" and "Source Code" links), repository Releases, and for Rails the
  official upgrade guide; `bin/rails app:update` updates config files between Rails versions.
- Runtime: `.ruby-version`, the `ruby` line in `Gemfile`.

## PHP (Composer)
- Outdated: `composer outdated --direct` (drop `--direct` for transitive).
- Upgrade one within its constraint: `composer update <vendor/pkg> --with-dependencies`.
- New major: `composer require <vendor/pkg>:^<major>` (add `--with-all-dependencies` if dependents must move too).
- Why: `composer why <vendor/pkg>`. Why a version cannot be installed: `composer why-not <vendor/pkg> <version>`, the
  fastest way to find a blocker.
- Versions: `composer show <vendor/pkg> --all`.
- Audit: `composer audit`.
- Lockfile hash only after a harmless manifest edit: `composer update --lock`.
- Changelogs: the Packagist page's source link, repository Releases, `UPGRADE.md` files (Symfony and Laravel keep
  them, plus official upgrade guides). Rector is the common codemod.

## .NET (NuGet)
- Outdated: `dotnet list package --outdated` (`--include-transitive` for transitive). Newer SDKs also accept
  `dotnet package list --outdated`.
- Upgrade one: `dotnet add <project> package <Name> --version <version>`, or edit `Directory.Packages.props` when central
  package management is on.
- Lockfile (when `RestorePackagesWithLockFile` is on): `dotnet restore --force-evaluate` re-resolves; CI should restore
  with `--locked-mode`.
- Why: `dotnet nuget why <project> <Name>` (recent SDKs).
- Audit: `dotnet list package --vulnerable --include-transitive`.
- Changelogs: the "Release Notes" and "Source repository" links on the nuget.org page, repository Releases, and
  Microsoft's "breaking changes in .NET N" pages for the runtime. The .NET Upgrade Assistant handles larger migrations.
- SDK: `global.json`, and `TargetFramework` in each project.

## Elixir (Mix)
- Outdated: `mix hex.outdated`.
- Upgrade within range: `mix deps.update <dep>`. New major: edit `mix.exs`, then `mix deps.update <dep>`.
- Clean up: `mix deps.unlock --unused`.
- Why: `mix deps.tree`.
- Versions: `mix hex.info <pkg>`.
- Audit: `mix hex.audit` (retired packages) and `mix deps.audit` (`mix_audit`).
- Changelogs: hex.pm package page links and `CHANGELOG.md`; Phoenix publishes upgrade guides per version.

## Swift (Swift PM)
- Outdated: no built-in command; compare `Package.resolved` against the dependency's tags
  (`git ls-remote --tags <url>`). `swift package show-dependencies` prints the tree.
- Upgrade within constraints: `swift package update <PackageName>`. New major: change `from:` or the range in
  `Package.swift`, then `swift package update`.
- Regenerate `Package.resolved`: `swift package resolve`.
- Audit: no built-in tool; check GitHub security advisories for each dependency's repository.
- Changelogs: repository Releases and `CHANGELOG.md`.
- Toolchain: `// swift-tools-version:` at the top of `Package.swift`.

## Runtimes and toolchains

A runtime version is usually pinned in several places that must move together. Find all of them before changing one:

```bash
git grep -nE 'node-version|python-version|go-version|java-version|ruby-version|dotnet-version|FROM |engines|requires-python|toolchain|languageVersion|TargetFramework' -- . ':!*.lock' ':!*lock.json' ':!*lock.yaml'
```

- Node: `.nvmrc`, `.node-version`, `engines.node`, `volta` in `package.json`, `.tool-versions` (asdf, mise), CI
  `node-version`, Dockerfile. Prefer an active LTS line.
- Python: `.python-version`, `requires-python` in `pyproject.toml`, `python_requires` in `setup.py`/`setup.cfg`, CI,
  Dockerfile, tox or nox configs.
- Go: `go` and `toolchain` lines in `go.mod`, CI, Dockerfile.
- JDK: compiler release level, Gradle toolchain, `.sdkmanrc`, `.java-version`, CI, Dockerfile.
- Also: `rust-toolchain.toml`, `.ruby-version`, `global.json`, `.tool-versions`.

Support and end-of-life dates are on each project's own release page; endoflife.date collects them for a quick
overview. Upgrade the runtime in its own step, before the frameworks that need it.

## Docker base images

- List tags without pulling: `skopeo list-tags docker://docker.io/library/<image>` or `crane ls <image>`; inspect one:
  `docker buildx imagetools inspect <image>:<tag>` (also shows the digest and platforms).
- Prefer a specific version tag (`python:3.12-slim-bookworm`), and pin by digest (`@sha256:...`) where the project does
  or reproducibility matters; let the update bot move the digest.
- A change of OS release inside the tag (for example Debian bookworm to trixie, Alpine 3.19 to 3.20) is a major
  upgrade even when the language version stays the same: system libraries, `apt` package names and libc can change.
  Switching between Debian-based and Alpine (musl) images changes native-extension behaviour.
- Scan: `docker scout cves <image>` or `trivy image <image>`.
- Verify: build the image, run the container, run the smoke check inside it, and compare image size.

## Update bots

If Renovate or Dependabot is configured, read its config before planning: it may group packages, pin ranges, or
ignore packages on purpose (an ignore with a comment is often a recorded blocker). Many open bot PRs are a fine
inventory source, but merge them through the same baseline-and-one-major-per-commit discipline, not in a batch.
