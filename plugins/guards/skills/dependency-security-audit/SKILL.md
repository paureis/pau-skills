---
name: dependency-security-audit
description: "Audit a project's dependencies for known vulnerabilities, fresh disclosures and supply-chain risk in any ecosystem (npm, pnpm, Yarn, Bun, pip, uv, Poetry, Pipenv, Go modules, Cargo, Maven, Gradle, Bundler, Composer, NuGet, Mix, Swift PM, container images and OS packages in Dockerfiles), then produce a short report ranked by what to do. Use when the user says 'security audit', 'check vulnerabilities', 'are we vulnerable', 'scan dependencies', 'CVE check', 'is this package safe', 'supply chain check', 'check our deps', 'audit npm', 'pip audit', 'cargo audit', 'govulncheck', 'bundle audit', 'composer audit', 'scan the Docker image', 'Dependabot alerts', or mentions a supply-chain attack, a coordinated security release of a framework, or a CVE in a library the project uses."
---

# Dependency security audit

Find the dependency risk that needs action in this project, in whatever languages it uses, and report it ranked by
what the user should do. The output is a short action plan, not a re-print of a scanner's output.

Reference files, open them when you reach their phase:
- `${CLAUDE_PLUGIN_ROOT}/skills/dependency-security-audit/ECOSYSTEMS.md`: per-ecosystem audit commands, how to tell
  direct from transitive, how to pin a transitive fix, cross-ecosystem scanners, and registry queries.
- `${CLAUDE_PLUGIN_ROOT}/skills/dependency-security-audit/SUPPLY-CHAIN.md`: supply-chain red flags per registry and
  how to check each one.

## Core principle

Three separate questions, answered in this order:

1. **Are we exposed right now?** Known advisories against the versions actually installed (the lockfile, the built
   image), not the ranges written in the manifest.
2. **Is there fresh risk the databases do not show yet?** Advisories disclosed in roughly the last 14 to 30 days,
   which can take hours to days to reach a scanner's feed, especially during a coordinated release of a large
   framework.
3. **Are we one bad install away from compromise?** Weak supply-chain posture: install-time code, recent ownership
   changes, typosquats, brand-new versions, floating versions, missing lockfiles, git and URL dependencies.

Outdated is hygiene. Vulnerable is action. A package two years behind with no advisory is not a security finding, and
calling it one buries the findings that are.

## When to use

- The user mentions a supply-chain attack, a framework CVE, or a coordinated security release.
- Before a production release, or as a periodic check (monthly suits an active project).
- An install, a bot or CI flagged something and the user wants a second opinion.
- The user asks whether a specific package is safe to add.

Not for: routine version bumps without a security reason (use the `guards` plugin's `dependency-upgrade` skill),
vulnerabilities in the project's own code, infrastructure configuration, or "were we hacked?" questions, which are
incident response.

## Rules

- **Do not install a tool globally without asking.** Many scanners below are not built in; ECOSYSTEMS.md marks them
  `[needs: ...]`. Check with `command -v <tool>` first. If missing, offer an ephemeral run (`npx`, `uvx`, `pipx run`,
  `go run <module>@<version>`, a pinned container image) or ask before installing. A scanner is code you execute,
  so prefer a pinned version over `latest`.
- **Do not run fix commands during the audit.** No `npm audit fix`, `composer update`, `cargo update` or similar until
  the report is accepted. `npm audit fix --force` in particular can move a direct dependency to an older major.
- **Do not invent advisories.** Every finding cites an identifier you read in tool output or a primary source (GHSA,
  CVE, OSV, RUSTSEC, PYSEC, GO-) and a fixed version you confirmed exists in the registry.
- **Do not lead with hygiene.** A long list of low-severity or outdated items hides the two lines that matter.
- **Do not trust severity alone.** Read each advisory's title and affected function. A "moderate" can be an auth
  bypass; a "critical" can sit in a code path this project never calls.
- **Do not recommend a version published in the last day or two** unless it is the fix for an advisory being actively
  exploited. Fresh releases are the window in which a hijacked account does its damage.

## Phase 1: Inventory

1. List every manifest, lockfile, Dockerfile and compose file (detection command at the top of ECOSYSTEMS.md),
   including nested projects and workspaces in a monorepo. Each workspace or sub-project can resolve the same package
   to a different version.
2. Note per ecosystem: lockfile present or not, package manager and its version, and which audit tools are installed.
3. Note what ships: production versus dev or test dependencies, and which images are deployed.

Done when you have a table: path, ecosystem, lockfile (yes/no), audit tool available (yes/no/needs install), shipped
or dev-only.

## Phase 2: Are we exposed right now?

1. Run the ecosystem's native audit with JSON output where it has one (ECOSYSTEMS.md). Save output to the scratchpad,
   not the repository.
2. Run one cross-ecosystem scanner over the whole repository if available (`osv-scanner`, `trivy fs`, `grype dir:`),
   and an image scanner over each deployed image. Different databases disagree; a finding in either is worth reading.
3. If the repository is on GitHub, pull open Dependabot alerts with `gh api` (ECOSYSTEMS.md). They are often already
   triaged by someone, and a dismissed alert carries its reason.
4. Normalize every finding into one row: package, ecosystem, installed version, advisory ID, severity, fixed version,
   direct or transitive (and the direct parent), prod or dev, and the dependency path.
5. Deduplicate: the same advisory reported by three tools is one finding.

### Reachability

A vulnerable package is not the same as a vulnerable program. The advisory usually names a function, class, option or
input format. If the project never reaches it, the finding drops a tier, but it does not disappear: code changes, and
a later caller can make it reachable.

- **Go**: `govulncheck ./...` does this for you. It analyzes the call graph and separates vulnerabilities in code you
  call from those that are only in modules you import. Trust its symbol-level result over a module-level scanner.
- **Other ecosystems**: find the affected symbol in the advisory (or the fix commit it links), then grep for call
  sites: direct imports of the package, the symbol name, and the config option or file format that triggers it. For a
  transitive package, also check whether the direct parent passes user input into it.
- `osv-scanner` can do call analysis for some languages; ECOSYSTEMS.md lists the flag.

Record the result as reachable, not reachable (with the grep you ran), or unknown. Unknown ranks as reachable.

Done when every finding has a normalized row and a reachability verdict.

## Phase 3: Is there fresh risk?

Advisory databases lag disclosures. For each **direct** dependency that is a framework, a server, an auth or crypto
library, a parser, or anything that handles untrusted input:

- [ ] Query OSV or the GitHub advisory database for advisories published or modified in the last 30 days
      (ECOSYSTEMS.md has the `curl` and `gh api` forms).
- [ ] Check the project's own security page, security advisories tab, and release notes for the last 30 days.
- [ ] If the user named an incident or a release, search the web for it and read the vendor's primary source, not a
      summary.

Note anything found that the scanners in phase 2 missed, with the source link and its date.

Done when each high-exposure direct dependency is checked, and the list of what was checked is written down.

## Phase 4: Are we one bad install away?

Follow SUPPLY-CHAIN.md. At minimum, for direct dependencies and for anything added or changed in the last 30 days:

- [ ] A lockfile exists and CI installs from it in frozen mode.
- [ ] No floating versions where a lockfile cannot protect you (Docker `latest` tags, `*` ranges with no lockfile,
      unpinned `pip install` lines in Dockerfiles or CI scripts, `curl | sh` installers).
- [ ] Git, URL and local-path dependencies listed and justified.
- [ ] Install-time or build-time code from dependencies identified (npm lifecycle scripts, Python sdists and build
      backends, Cargo `build.rs` and proc macros, Gradle and Maven plugins, Composer plugins, native gem extensions,
      MSBuild targets, SwiftPM plugins).
- [ ] Versions published in the last few days, yanked or retracted versions, recent ownership changes, and names one
      edit away from a popular package.

This is judgment, not a checklist score. A fresh patch from a long-standing maintainer is normal; a fresh `0.0.x`
from a new account, pulled in transitively with an install script, is a flag.

Done when every item is checked or marked not applicable, and each flag names the package and the evidence.

## Phase 5: Rank

| Tier | Definition | What the user does |
|------|------------|--------------------|
| **Patch now** | Reachable or unknown, in shipped code, fix available in a patch or minor bump; or any confirmed malicious or compromised version | Apply the fix today, verify, deploy |
| **Plan a patch window** | Fix needs a major bump, or transitive with no fixed parent yet, or high severity but not reachable | Open an issue, schedule it, state the trade-off and any mitigation |
| **Hygiene** | Dev-only and low impact, low severity, outdated with no advisory, posture improvements | Batch into the next routine update |

Raise a finding one tier for: remote code execution, auth or middleware bypass, SSRF, deserialization, path traversal,
prototype pollution reaching user input, or a known exploit in the wild (the CISA KEV catalog lists these). Lower it
one tier when the code is provably unreachable or the package is dev-only and never runs on untrusted input.

Done when every finding has a tier and a one-line reason.

## Phase 6: Fix commands and verification

For each "Patch now" finding, give the exact command for this project's package manager, the version it moves to,
and confirm that version exists and is at or above the advisory's fixed version. For a transitive finding, prefer
upgrading the direct parent; pin the transitive version (override, constraint, resolution) only when no parent release
fixes it, and only to a semver-compatible version. ECOSYSTEMS.md lists the pin mechanism per ecosystem.

Anything that crosses a major version, touches a runtime or toolchain, or bundles several upgrades goes through the
`guards` plugin's `dependency-upgrade` skill, which plans, commits and verifies one step at a time.

If the user asks you to apply the patch-level fixes now: apply them through a supply-chain scanner if the project
uses one, re-run the same audit commands from phase 2, confirm the finding is gone and nothing new appeared, then run
the project's build and tests. The audit is not closed until the re-scan is clean for the items you fixed.

## Report

Lead with a one-line verdict, then the actions, then supporting detail. Use this shape:

```
Verdict: <one line, e.g. "2 findings need a patch today; 1 needs a planned upgrade; posture is otherwise sound.">

PATCH NOW
1. <package> <installed> -> <fixed> (<ecosystem>, direct|transitive via <parent>) <advisory ID>: <what it allows>.
   Reachability: <reachable | not reachable (how checked) | unknown>. Command: <exact command>

PLAN A PATCH WINDOW
- <package>: <advisory ID>, <why it cannot be patched today>, <mitigation if any>, next step: dependency-upgrade

SUPPLY-CHAIN FLAGS
- <package or file>: <flag> (<evidence>)

HYGIENE (batched)
- <count> outdated or low-severity items; list on request

COVERAGE
- Scanned: <ecosystems and tools, with versions>. Not scanned: <what and why, e.g. tool missing, no lockfile>
- Fresh-risk check: <dependencies checked, sources, date range>
```

Say what you could not check. A clean report with a silent gap reads as "safe" when it means "not looked at".

## Common mistakes

| Mistake | What goes wrong | Do instead |
|---------|-----------------|------------|
| Auditing the manifest instead of the lockfile or image | Ranges hide what is actually installed | Scan lockfiles and built images |
| Root only in a monorepo | Workspaces and sub-projects resolve their own versions | Scan every path from phase 1 |
| Ignoring Dockerfiles | The base image and OS packages often carry more CVEs than the app | Scan the built image, not only the source |
| Treating transitive CVEs as directly fixable | Editing a transitive version by hand breaks the parent | Upgrade the parent first, pin second |
| Applying the scanner's suggested fix blindly | Some "fixes" downgrade majors or re-resolve the whole tree | Read each suggested version before running anything |
| Trusting one database | Feeds differ in coverage and timing | One native tool plus one cross-ecosystem scanner |
| Calling unreachable code critical | The user patches noise and stops reading | State reachability next to severity |

## Stop and tell the user immediately

Do not wait for the report when you find:

- A version reported as malicious, or a package removed from the registry for malware.
- A "Patch now" finding in an internet-facing service.
- A lockfile entry not reachable from any manifest, or a lockfile resolved URL pointing at an unexpected host.
- A dependency whose ownership changed in the last 30 days and that gained install-time code in the same window.
