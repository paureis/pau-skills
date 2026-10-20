# dependency-security-audit (Original)

Back to the [origins index](../../ORIGINS.md).

0 of 1504 word 6-grams of the original npm-only version appeared in any upstream version; the rewrite below was
written from that version, not from upstream.

**Problem.** Written during a coordinated security release of a major framework, when `npm audit` printed a long dump
with no order and no actions. The skill sorts findings into three tiers by what to do (patch now, plan a patch window, hygiene), checks for
fresh advisories that may not be in npm's feed yet, and pairs with the scanner-plus-`overrides` rule in `RULES.md`.

**Changes for this release.** Generalized from npm only to every common ecosystem: JavaScript (npm, pnpm, Yarn,
Bun), Python (pip, uv, Poetry, Pipenv), Go, Rust, Java and Kotlin, Ruby, PHP, .NET, Elixir, Swift, plus container
images and OS packages in Dockerfiles. The three questions and the three tiers are unchanged. Added a reachability
step, so an advisory in code the project never calls ranks lower (govulncheck, or grepping for call sites). Added
cross-ecosystem scanners (osv-scanner, Trivy, Grype), Dependabot alerts and direct OSV and GitHub advisory queries
for the fresh-risk check, and a rule never to install a scanner globally without asking. Per-ecosystem commands moved
to `ECOSYSTEMS.md` and per-registry supply-chain red flags to `SUPPLY-CHAIN.md`. Applying upgrades is handed to
`dependency-upgrade`.
