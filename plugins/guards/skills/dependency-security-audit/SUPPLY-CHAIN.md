# Supply-chain red flags

Phase 4 asks whether the project is one bad install away from compromise. No single flag below proves anything. A
flag matters when it combines with others (new owner, new version, new install script, all in the same week) or when
the package sits where a compromise would hurt (it runs at install, at build, or in production with secrets).

Check direct dependencies first, then anything added or changed in the lockfile in the last 30 days
(`git log -p --since=30.days -- <lockfile>` shows what moved).

## Project-level posture

These apply in every ecosystem and are cheap to check.

| Flag | Why it matters | How to check |
|------|----------------|--------------|
| No lockfile | Every install resolves fresh, so a malicious release lands without a code change | Manifest without its lockfile (detection command in ECOSYSTEMS.md) |
| CI does not install in frozen mode | The lockfile exists but is ignored or rewritten | Look for `npm ci`, `pnpm install --frozen-lockfile`, `yarn install --immutable`, `uv sync --locked`, `poetry install` with a committed lock, `bundle install` with `BUNDLE_FROZEN`, `composer install` (not `update`), `dotnet restore --locked-mode`, `cargo build --locked` |
| Floating versions outside a lockfile | Docker tags like `latest` or `20`, `pip install <pkg>` without a version in a Dockerfile or CI step, `go install <tool>@latest`, GitHub Actions pinned to a branch | grep Dockerfiles, CI workflows and scripts |
| `curl ... \| sh` installers | Runs whatever the host serves at that moment | grep for `\| sh`, `\| bash`, `iex` |
| Git, URL or local-path dependencies | Bypass the registry, its malware scanning and often its integrity checks; a branch reference moves | Manifest entries with `git`, `github:`, `http`, `file:`, `path =`; Go `replace` directives |
| Several package sources | Dependency confusion: an internal name published on the public registry can win | Multiple registries in `.npmrc`, `pip.conf`/`--extra-index-url`, Gemfile `source` blocks, Maven or Gradle repository lists, NuGet sources without package source mapping |
| Integrity checks disabled | Silent substitution | `GONOSUMDB`, `GONOSUMCHECK`, `GOFLAGS=-insecure`, `--trusted-host`, `strict-ssl=false`, `--no-verify` style flags |

## Per-package flags

| Flag | What to look for |
|------|------------------|
| Install-time or build-time code | The package runs code on your machine or CI before your tests run (details per registry below) |
| Very recent version | Published in the last few days; hijacked accounts usually publish and get caught within that window |
| Ownership or maintainer change | New owner or publisher in the last 30 to 90 days, especially on a long-dormant package |
| Typosquat | Name one character, one separator or one scope away from a popular package; a scope or namespace that mimics an official one |
| Yanked, retracted, deprecated, retired or abandoned | The maintainer withdrew it, sometimes for security, and the lockfile still points at it |
| Dormant then sudden release | No release for a year or more, then a new version with unrelated changes or new dependencies |
| New dependencies in a patch release | A patch that adds a dependency is unusual and worth a look |
| Single maintainer on a critical package | Not a flaw by itself; it means one stolen credential is enough |
| Provenance missing where it used to exist | Earlier versions had build provenance or signatures and the new one does not |

## Per registry

**npm**
- Install code: `preinstall`, `install`, `postinstall` and `prepare` scripts. `npm view <pkg>@<version> scripts`.
  To see which installed packages have them: `npm query ':attr(scripts, [postinstall])'` on npm 8.16+, or grep
  `node_modules/*/package.json`. pnpm 10 and Bun do not run dependency scripts by default unless allowed; check the
  allow list (`onlyBuiltDependencies`, `trustedDependencies`).
- Dates: `npm view <pkg> time --json`. Maintainers: `npm view <pkg> maintainers`.
- Provenance and signatures: `npm audit signatures`.
- Deprecated: `npm view <pkg>@<version> deprecated`.

**PyPI (pip, uv, Poetry, Pipenv)**
- Install code: a source distribution (sdist) runs its build backend, and for older packages `setup.py`, at install.
  Check whether a wheel exists for your platform; `pip install --only-binary :all:` refuses to build from source.
- Dates and yanked status: `curl -sS https://pypi.org/pypi/<pkg>/json` and read `releases.<version>[].upload_time_iso_8601`,
  `yanked` and `yanked_reason`. The JSON API does not list maintainers; check the project page.
- Hash pinning (`--require-hashes`, or the hashes in `uv.lock` and `poetry.lock`) stops substitution of a known file.

**Go modules**
- No install scripts, but `go generate` directives and cgo run code when a developer invokes them.
- Dates: `curl -sS https://proxy.golang.org/<module>/@v/<version>.info`.
- Retracted: `go list -m -u -retracted all`.
- The checksum database protects against a changed module, not a malicious new one. `replace` directives to forks or
  local paths bypass the normal source.

**Cargo**
- Build code: `build.rs` and procedural macros run at compile time with full access. `cargo tree -e build` and
  `cargo tree -e proc-macro` hint at which crates contribute it.
- Dates, yanked status and publisher: `curl -sS -A '<your-project> audit' https://crates.io/api/v1/crates/<crate>`
  (crates.io requires a User-Agent). Owners: `.../crates/<crate>/owners`. `cargo audit` warns on yanked crates.

**Maven and Gradle**
- Build code: every Maven plugin and Gradle plugin runs inside the build. Gradle `buildscript` blocks and
  `settings.gradle` plugin repositories deserve the same scrutiny as runtime dependencies.
- Gradle wrapper: `gradle/wrapper/gradle-wrapper.jar` is an executable; verify its checksum against the official one
  (the Gradle wrapper validation action does this in CI) and check `distributionUrl` points at the official host.
- Dependency verification: `gradle/verification-metadata.xml` if the project uses it.
- Dates: Maven Central search, `https://search.maven.org/solrsearch/select?q=g:<group>+AND+a:<artifact>&core=gav&rows=20&wt=json`.
- Watch for `http://` repositories and for internal group IDs resolvable from public repositories.

**RubyGems (Bundler)**
- Install code: native extensions (`extconf.rb`) compile and run at install.
- Dates: `curl -sS https://rubygems.org/api/v1/versions/<gem>.json`. Owners: `https://rubygems.org/api/v1/gems/<gem>/owners.json`.
- Multiple `source` blocks or a global source plus a private one is the classic dependency-confusion setup.

**Packagist (Composer)**
- Install code: Composer runs only the root project's scripts, but packages of type `composer-plugin` run code.
  Composer 2.2+ asks before enabling a plugin; check `config.allow-plugins` for broad entries such as `true`.
- Dates: `curl -sS https://repo.packagist.org/p2/<vendor>/<pkg>.json`. `composer audit` lists abandoned packages.

**NuGet**
- Build code: `.props` and `.targets` files in a package are imported into your build; analyzers and source generators
  run in the compiler.
- Deprecated: `dotnet list package --deprecated`. Package source mapping (`packageSourceMapping` in `nuget.config`)
  is the defense against dependency confusion when several feeds are configured.

**Hex (Mix)**
- Build code: a dependency's `mix.exs` is Elixir code that runs when it compiles.
- Dates, owners and retirements: `curl -sS https://hex.pm/api/packages/<pkg>` and `.../packages/<pkg>/owners`.
  `mix hex.audit` lists retired versions in use.

**Swift PM**
- Every dependency is a git URL. Pin to a version range or exact version with the resolved revision committed in
  `Package.resolved`; a `branch:` or `revision:` requirement moves or bypasses tags.
- Build tool and command plugins run code during the build.

**Container images and OS packages**
- Pin base images by digest (`FROM <image>@sha256:<digest>`), with the tag kept as a comment for humans.
- Prefer official or verified publisher images; check who publishes an image with an unfamiliar namespace.
- `apt-get install`, `apk add` and `yum install` without versions re-resolve on each build; that is acceptable when the
  base digest is pinned and images are rebuilt on purpose, and a flag when combined with `latest`.
- `ADD <url>` and downloads without a checksum check run whatever the URL serves.

## Judging a single "is this package safe?" question

When the user asks about one package before adding it, check and report:

- [ ] Exact name matches the project they meant (repository link on the registry page points to the expected source)
- [ ] Release history: age of the package, cadence, date of the version you would install
- [ ] Owners and recent changes to them
- [ ] Install-time or build-time code, and what it does
- [ ] Open advisories for the version (OSV query in ECOSYSTEMS.md)
- [ ] Transitive dependencies it would add, and any flags on those
- [ ] Download or usage counts as a weak signal only; popular packages get hijacked too

Give a verdict (looks fine, use with care and why, or do not use and why) with the evidence for each point.
