---
name: dependency-security-audit
description: "Use when the user wants to audit dependencies for vulnerabilities, check for CVEs in package.json, react to a supply-chain attack or coordinated security release (Next.js, React, etc.), routinely review dependency health, or says 'security audit', 'check vulnerabilities', 'are we vulnerable', 'scan dependencies', 'CVE check', 'is this package safe', 'supply chain check', 'check our deps', 'audit npm'. Triggers on package.json, package-lock.json, npm audit findings, or any mention of dependency-related security risk in JavaScript/TypeScript projects."
---

# Dependency Security Audit

A focused audit of an npm/pnpm/yarn project's dependencies to find real, actionable security risk — not a noisy `npm audit` dump. Categorizes findings by severity and **what the user should actually do**, in priority order.

## Core principle

Three orthogonal questions, answered in this order:

1. **Are we exposed right now?** — direct deps with known CVEs in *currently installed* versions.
2. **Is there fresh risk we don't know about yet?** — CVEs disclosed in the last 14 days that may not be in npm's advisory feed yet (especially for major frameworks).
3. **Are we one bad install away from compromise?** — packages with weak supply-chain posture (recently transferred ownership, low maintainer count, post-install scripts, recently published versions).

Don't conflate "outdated" with "vulnerable." Outdated is hygiene. Vulnerable is action.

## When to use

- User mentions a recent supply-chain attack or framework CVE (Next.js, React, lodash, etc.)
- After a coordinated security release announcement
- Routine periodic audit (monthly is reasonable for active projects)
- Before a production deploy or major release
- When `npm install` flags new packages and you want a second opinion
- When the user is anxious about being "secure" but hasn't done a real check yet

**Don't use for:** general dependency updates without security framing (use a separate dep-bump pass), or projects without `package.json`.

## Workflow

### 1. Inventory the project

Confirm what we're auditing:

```bash
# Single project or monorepo?
test -f package.json && cat package.json | grep -E '"name"|"workspaces"'

# What package manager?
test -f pnpm-lock.yaml && echo "pnpm" || test -f yarn.lock && echo "yarn" || test -f package-lock.json && echo "npm"

# Workspace packages (if monorepo)
ls -d packages/*/package.json 2>/dev/null
```

Note: a monorepo can have the same package at different versions in different workspaces. Audit each workspace's lockfile contribution, not just root.

### 2. Run the authoritative scan

Use the package manager's audit, capturing JSON for parsing:

```bash
npm audit --json > /tmp/audit.json
# Or: pnpm audit --json | tee /tmp/audit.json
# Or: yarn npm audit --recursive --json | tee /tmp/audit.json
```

**Critical: distinguish direct vs transitive vulnerabilities.**

- `isDirect: true` in the JSON → fix is in YOUR package.json. Highest priority.
- `isDirect: false` → comes via a dependency-of-dependency. Fix depends on parent updating, or use overrides.

**Critical: ignore npm audit's "fixAvailable" recommendation when it suggests a major-version downgrade of a direct dep** (e.g., "Will install next@9.3.3, which is a breaking change" when you're on 16.x). That's npm's resolver giving up — verify against the package's actual changelog.

### 3. Cross-check freshness against the network

For each direct dependency, compare installed version to npm's `latest` dist-tag:

```bash
for pkg in $(jq -r '.dependencies | keys[]' package.json); do
  installed=$(jq -r --arg p "$pkg" '.dependencies[$p]' package.json)
  latest=$(npm view "$pkg" dist-tags.latest 2>/dev/null)
  echo "$pkg: installed=$installed latest=$latest"
done
```

For **major frameworks** (next, react, express, fastify, nuxt, sveltekit, vue, nestjs, hono), also check the npm advisory feed AND the framework's security blog for the last 30 days. npm audit lags real disclosures by hours-to-days for big frameworks. Use WebSearch for "{framework} security release {current year-month}" and the framework's `/blog` or `/security` page.

### 4. Supply-chain posture (the "are we one bad install away" question)

If `socket` CLI is installed (`command -v socket`), it gives the best signal here:

```bash
socket npm install --dry-run    # scans planned install without applying
# or
socket audit                     # if available
```

Without socket, hand-check for any direct dep that's a red flag:
- Published in the last 7 days (recent compromise window for token theft)
- Maintainer count of 1 on a critical package
- Has `postinstall` / `preinstall` scripts (run arbitrary code at install time)

```bash
npm view <pkg> time.modified maintainers scripts.postinstall
```

This is judgment, not a hard rule. A recently published patch from an established maintainer is fine; a recently published 0.0.x from an unknown account installed transitively is a flag.

### 5. Categorize findings

Group output into **three tiers** so the user knows what's urgent:

| Tier | Definition | Action |
|---|---|---|
| 🔴 **Patch now** | Direct dep, exploitable CVE, patch available in a patch/minor bump | Bump version, `socket npm install`, verify, commit, deploy |
| 🟠 **Plan a patch window** | Direct dep with CVE, but fix requires major version bump OR transitive with no clear path | Open issue, schedule, surface trade-offs |
| 🟡 **Hygiene** | Outdated but no known CVE, or low-severity transitive | Batch into a periodic update |

**Do NOT lead with hygiene findings.** A noisy audit obscures the actionable items.

### 6. Recommend specific upgrade commands

For each 🔴 finding, give the exact command the user should run, AND verify the resulting versions resolve the CVE. Always use `socket npm install` over bare `npm install` if socket is available — its supply-chain scan is the safety net during the install itself.

```bash
# Example output:
# 🔴 next 16.2.1 → 16.2.6  (closes 14 advisories from May 2026 release)
# Run: socket npm install next@16.2.6 react@19.2.6 react-dom@19.2.6 eslint-config-next@16.2.6
```

### 7. Verify after fix

After install:

```bash
npm audit                              # Re-run; expect direct-CVE count to drop to 0
npm ls <patched-package>               # Confirm dedupe + version
npx tsc --noEmit                       # If TS, ensure no breaking type changes
```

If the project has a test suite, run it. If it has E2E, at minimum smoke-test the auth pipeline (login + middleware-protected route) since middleware-bypass CVEs are the most common high-severity class.

## Output structure (what to give the user)

Lead with a **one-line verdict**, then the action plan, then the details. Example:

```
🔴 You have 14 high-severity Next.js CVEs from the May 2026 coordinated release.
   Fix: bump next 16.2.1 → 16.2.6, react 19.2.4 → 19.2.6.

ACTION PLAN
1. socket npm install next@16.2.6 react@19.2.6 react-dom@19.2.6 eslint-config-next@16.2.6
2. npx tsc --noEmit
3. Commit, deploy via your normal staging → main flow

DETAILS
[per-CVE breakdown only if user asks, or as collapsible/appendix]
```

A long table of every advisory is what `npm audit` already gives you — the user doesn't need that re-printed. Synthesize.

## Common mistakes

| Mistake | What goes wrong | Fix |
|---|---|---|
| Running `npm audit fix --force` blindly | Often downgrades major versions and re-introduces the vulnerability you just patched | Read each "fixAvailable" before applying; verify it's an upgrade, not a downgrade |
| Treating transitive postcss/lodash/etc. as user-actionable | They're pulled in by a direct dep; you can't fix them directly without overrides | Surface the parent and check if a parent update resolves it; if not, recommend `overrides` only as a last resort |
| Ignoring npm audit because "everything's moderate" | Moderate can include real auth bypass, not just XSS-in-error-page | Read the advisory title for each finding, not just severity |
| Recommending the absolute `latest` blindly | A version published 2 hours ago hasn't been vetted; could itself be compromised | Prefer versions published >24h ago unless the user is responding to an active CVE |
| Forgetting workspaces in a monorepo | Each workspace has its own deps; auditing root only misses children | Audit each `packages/*/package.json` individually if not auto-hoisted |
| Missing recent disclosures | npm audit data can lag 24-72h on big disclosures | For major frameworks, WebSearch the vendor's blog for the last 30 days |
| Confusing outdated with vulnerable | A package can be 6 months behind `latest` and have zero CVEs | Only call something "vulnerable" if there's an actual advisory |

## Red flags during audit

Stop and surface these to the user immediately — don't just list them with everything else:

- A direct dependency with severity ≥ HIGH and `isDirect: true`
- An advisory describing **middleware bypass**, **auth bypass**, **SSRF**, **prototype pollution**, **RCE**, or **deserialization** (real exploitation risk, not just info-disclosure)
- A package that was recently transferred to a new maintainer in the last 30 days
- A `postinstall` script in a package you don't recognize
- A version installed that has been **deprecated or unpublished** from npm
- Lockfile entries for packages that aren't reachable from any `package.json` (orphans — possibly malicious injection)

## What's out of scope

This skill audits **dependencies**. It does NOT cover:

- Application-level vulnerabilities in your own code (SQL injection, XSS, IDOR) — different skill
- Infrastructure security (TLS config, network rules) — different skill
- Compromise detection / incident response — different skill
- License compliance — different skill

If the user is asking about runtime exploitation evidence ("were we hacked?"), redirect them: that's an incident response task, not a dependency audit.

## Real-world impact

A targeted, calibrated audit produces a 3-line action plan. A noisy audit produces 200 lines that the user closes and ignores. **Synthesize, don't dump.**
