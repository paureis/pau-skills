# Audit command reference

Commands for each ecosystem: run the audit, tell direct from transitive, and pin a transitive fix. Tool flags change
between versions, so check `<tool> --version` and `<tool> help <command>` before relying on a flag below.

Markers:
- `[built-in]`: ships with the package manager or SDK.
- `[needs: X]`: a separate tool. Check `command -v X` first. If it is missing, offer the ephemeral form shown, or ask
  before installing it. Never install globally without asking.

Write scanner output to the scratchpad directory, not the repository.

## Detecting what is there

```bash
git ls-files | grep -E '(^|/)(package\.json|package-lock\.json|npm-shrinkwrap\.json|pnpm-lock\.yaml|yarn\.lock|bun\.lockb?|requirements[^/]*\.(txt|in)|pyproject\.toml|uv\.lock|poetry\.lock|Pipfile(\.lock)?|setup\.py|go\.mod|go\.sum|Cargo\.toml|Cargo\.lock|pom\.xml|build\.gradle(\.kts)?|settings\.gradle(\.kts)?|libs\.versions\.toml|gradle\.lockfile|Gemfile|Gemfile\.lock|composer\.json|composer\.lock|[^/]*\.csproj|Directory\.Packages\.props|packages\.lock\.json|mix\.exs|mix\.lock|Package\.swift|Package\.resolved|Dockerfile[^/]*|[^/]*\.Dockerfile|(docker-)?compose[^/]*\.ya?ml)$'
```

A manifest without its lockfile is itself a finding (see SUPPLY-CHAIN.md).

## JavaScript and TypeScript

**npm** `[built-in]`
- Audit: `npm audit --json` (`--omit=dev` for production only). In the JSON, each entry under `vulnerabilities` has
  `isDirect`, `severity`, `via` (the advisories, or the package it comes through) and `fixAvailable`. When
  `fixAvailable.isSemVerMajor` is true, the suggested fix crosses a major; check the version it names before using it.
- Registry signatures and provenance: `npm audit signatures`.
- Why is it here: `npm explain <pkg>`, `npm ls <pkg>`.
- Pin a transitive: `overrides` in `package.json`, then `npm install`, then `npm ls <pkg>` to confirm one version.

**pnpm** `[built-in]`
- Audit: `pnpm audit --json` (`--prod` for production only). Why: `pnpm why <pkg>` (`-r` across workspaces).
- Pin a transitive: `pnpm.overrides` in `package.json` (or `overrides` in `pnpm-workspace.yaml` on recent pnpm).

**Yarn**
- Berry (v2+) `[built-in]`: `yarn npm audit --all --recursive --json`. Classic (v1): `yarn audit --json`.
- Why: `yarn why <pkg>`. Pin a transitive: `resolutions` in `package.json`.

**Bun**
- Audit: `bun audit` on recent Bun releases (`bun audit --help` to check). Otherwise scan `bun.lock` with
  `osv-scanner` or Trivy. Pin a transitive: `overrides` or `resolutions` in `package.json`.

## Python

**pip-audit** `[needs: pip-audit]`, ephemeral: `uvx pip-audit` or `pipx run pip-audit`
- Requirements file: `pip-audit -r requirements.txt --format json`.
- Current environment: `pip-audit` (audits whatever is installed in the active virtualenv, so activate the right one).
- Fully pinned, hashed requirements: add `--require-hashes` (or `--no-deps` if pinned without hashes) so it does not
  resolve again.
- uv: `uv export --format requirements-txt --no-hashes > <scratch>/req.txt`, then `pip-audit -r <scratch>/req.txt --no-deps`.
- Poetry: `poetry export -f requirements.txt --output <scratch>/req.txt` (Poetry 2 needs `poetry-plugin-export`), then
  the same.
- Pipenv: `pipenv requirements > <scratch>/req.txt`, then the same. Pipenv's own `pipenv check` and `pipenv scan`
  delegate to Safety.

**Safety** `[needs: safety]`: recent versions use `safety scan` and require an account login; the older
`safety check` is deprecated. Use it if the project already does, otherwise prefer pip-audit or osv-scanner.

Why is it here: `uv tree --invert --package <pkg>`, `poetry show --tree`, `pipdeptree -r -p <pkg>` `[needs: pipdeptree]`.

Pin a transitive: a constraints file (`pip install -c constraints.txt`), `constraint-dependencies` or
`override-dependencies` under `[tool.uv]`, or for Poetry add it as an explicit dependency with a lower bound.

## Go

**govulncheck** `[needs: govulncheck]`, ephemeral: `go run golang.org/x/vuln/cmd/govulncheck@<version> ./...`
- `govulncheck ./...` reports only vulnerabilities whose affected symbols are reachable from your code. Add
  `-show verbose` to also see those in imported packages and required modules that you do not call.
- `govulncheck -mode binary <path-to-binary>` scans a built binary.
- `govulncheck -format json ./...` for machine-readable output.
- Why this matters: Go advisories in the Go vulnerability database list affected functions, so govulncheck can say
  "your code calls this" versus "this is in your module graph". A module-level scanner reports both the same way.
- Why is it here: `go mod why -m <module>`, `go mod graph | grep <module>`.
- Retracted versions: `go list -m -u -retracted all`.
- Raise a transitive: `go get <module>@<fixed-version>` then `go mod tidy`. Minimal version selection makes the higher
  requirement win.

## Rust

- `cargo audit` `[needs: cargo-audit]`: reads `Cargo.lock`, reports RUSTSEC advisories plus warnings for yanked and
  unmaintained crates. `cargo audit --json`.
- `cargo deny check advisories` `[needs: cargo-deny]`; `cargo deny check bans sources` also enforces allowed
  registries and git sources if the project has a `deny.toml`.
- Install either only with permission: `cargo install --locked cargo-audit`.
- Why: `cargo tree -i <crate>`. Raise a transitive: `cargo update -p <crate> --precise <version>` (semver-compatible
  only), or a `[patch]` section for a fork as a last resort.

## Java and Kotlin

- **OWASP Dependency-Check** `[needs: plugin download]`: Maven `mvn org.owasp:dependency-check-maven:check`; Gradle
  apply the `org.owasp.dependencycheck` plugin and run `./gradlew dependencyCheckAnalyze`. It matches against the
  NVD by CPE, so expect false positives on similarly named artifacts and read each match. The first run downloads the
  NVD data and is slow; an NVD API key speeds it up. Adding the plugin to the build file is a change to ask about.
- Without editing the build: `osv-scanner` reads `pom.xml` and `gradle.lockfile`, and Trivy or Grype scan built jars
  and images.
- Why: `mvn dependency:tree -Dincludes=<group>:<artifact>`; `./gradlew dependencyInsight --dependency <name> --configuration runtimeClasspath`.
- Pin a transitive: Maven `<dependencyManagement>`; Gradle `constraints { implementation("<group>:<artifact>:<version>") }`.

## Ruby

- `bundle audit check --update` `[needs: bundler-audit]` (the gem's binary is also `bundle-audit`).
- Why: `bundle exec gem dependency <gem> --reverse-dependencies`, or read `Gemfile.lock`.
- Raise a transitive: `bundle update <gem> --conservative` (moves only that gem).

## PHP

- `composer audit` `[built-in, Composer 2.4+]`, `--format=json`, `--locked` to read only `composer.lock`. It also
  reports abandoned packages.
- Why: `composer why <vendor/pkg>`. Raise a transitive: `composer update <vendor/pkg> --with-dependencies`, or a
  `conflict` entry to forbid the vulnerable range.

## .NET

- `dotnet list package --vulnerable --include-transitive` `[built-in]`; also `--deprecated`. Run a `dotnet restore`
  first. Recent SDKs also warn during restore (NuGet Audit; `NuGetAuditMode` set to `all` includes transitives).
- Why: `dotnet nuget why <project> <package>` on recent SDKs.
- Pin a transitive: a direct `PackageReference`, or with Central Package Management set
  `CentralPackageTransitivePinningEnabled` and list the version in `Directory.Packages.props`.

## Elixir

- `mix hex.audit` `[built-in]`: retired packages (retirement reasons include security).
- `mix deps.audit` `[needs: mix_audit as a dev dependency]`: known advisories. Adding it to `mix.exs` is a change to
  ask about.
- Why: `mix deps.tree`. Raise a transitive: `mix deps.update <dep>`, or `override: true` as a last resort.

## Swift

- No built-in audit. Check whether your `osv-scanner` version reads `Package.resolved`; otherwise check each
  dependency's GitHub security advisories (`gh api repos/<owner>/<repo>/security-advisories`).

## Containers and OS packages

- `trivy image <image>` `[needs: trivy]`: OS packages and language packages in the image. `--severity HIGH,CRITICAL`
  and `--ignore-unfixed` reduce noise; say in the report when you used them.
- `grype <image>` `[needs: grype]`: same idea, `--only-fixed`, `-o json`.
- `docker scout cves <image>` `[needs: Docker Scout]`.
- `trivy config .` reads Dockerfiles and other config for misconfiguration (root user, unpinned tags).
- Scan the image that is deployed (pull it by the tag or digest from the deploy config), not only a local rebuild,
  which may pick up newer base layers.
- Fixes: a newer base image digest, a slimmer base (fewer OS packages, fewer CVEs), or an explicit package upgrade in
  the Dockerfile. Base image changes go through `dependency-upgrade`.

## Cross-ecosystem scanners

**osv-scanner** `[needs: osv-scanner]`, ephemeral via its container image or `go run github.com/google/osv-scanner/v2/cmd/osv-scanner@<version>`
- v2: `osv-scanner scan source -r .`, `osv-scanner scan image <image>`, `--format json`.
- v1: `osv-scanner -r .` and `--lockfile <path>`.
- Call analysis for Go (and Rust on some versions): `--call-analysis=go` in v2 (`--experimental-call-analysis` in v1).
  Check `osv-scanner --help` for your version.

**Trivy** `[needs: trivy]`: `trivy fs --scanners vuln .` for the repository, `trivy image` as above.

**Grype** `[needs: grype]`: `grype dir:.` for the repository.

**GitHub Dependabot alerts** `[needs: gh, authenticated with access to security alerts]`

```bash
gh api 'repos/{owner}/{repo}/dependabot/alerts?state=open&per_page=100' --paginate \
  --jq '.[] | [.security_advisory.ghsa_id, .security_vulnerability.severity, .dependency.package.ecosystem, .dependency.package.name, .dependency.manifest_path, .dependency.scope, (.security_vulnerability.first_patched_version.identifier // "none")] | @tsv'
```

`gh` fills in `{owner}` and `{repo}` from the current repository. A 403 or 404 usually means alerts are disabled or the
token lacks permission; say so in the coverage line rather than reporting zero alerts.

## Querying advisory databases directly

Use these for phase 3 (fresh risk) and to check one package without a scanner. Write the JSON payload to a file and
pass it with `-d @file`, so quotes and special characters cannot break the command.

**OSV.dev API** (no key needed). Ecosystem names: `npm`, `PyPI`, `Go`, `crates.io`, `Maven`, `RubyGems`,
`Packagist`, `NuGet`, `Hex`, `Pub`, `SwiftURL`, plus Linux distributions such as `Debian` and `Alpine`.

```bash
# <scratch>/q.json contains: {"package": {"name": "<package>", "ecosystem": "PyPI"}, "version": "<installed-version>"}
curl -sS -X POST https://api.osv.dev/v1/query -d @<scratch>/q.json | jq '.vulns[]? | {id, summary, published, modified}'
curl -sS https://api.osv.dev/v1/vulns/<OSV-or-GHSA-id>          # full record, including affected ranges and references
```

For many packages, `POST https://api.osv.dev/v1/querybatch` takes `{"queries": [ ... ]}` and returns IDs only; fetch
details per ID. Filter on `published` or `modified` dates for the fresh-risk window.

**GitHub global advisory database** `[needs: gh]`

```bash
gh api -X GET /advisories -f ecosystem=pip -f affects=<package> -f published='>=<YYYY-MM-DD>' \
  --jq '.[] | [.ghsa_id, .severity, .published_at, .summary] | @tsv'
```

Ecosystem values here differ from OSV: `npm`, `pip`, `go`, `rust`, `maven`, `rubygems`, `composer`, `nuget`,
`erlang` (Hex), `swift`, `pub`, `actions`. Use `modified=` instead of `published=` to catch advisories that were
updated recently, for example when a fixed version is added.

**Repository security advisories** for one project: `gh api repos/<owner>/<repo>/security-advisories`. A maintainer
can publish here before the advisory propagates elsewhere.

**Known exploited**: the CISA Known Exploited Vulnerabilities catalog is a public JSON feed; a CVE listed there moves
up a tier.
