# launch-readiness, `ledger.mjs`, `table.mjs` and `rules.mjs` (Original)

Back to the [origins index](../../ORIGINS.md).

Ideas only, from two posts the owner shared on 2026-10-19 (authors not recorded, text not saved): a long checklist of
what an app needs "before it touches a paying customer", which gave the area list and most checks, and a 16-line
"security prompt", which gave SEC-01 to SEC-15. Both were written again from general knowledge with a stack condition
on each check. The stage tiers borrow the idea of OWASP ASVS levels. The ledger, the probes, the questionnaire with
expiry and "no single score" were settled in the owner's `brainstorm` and `grill-me` sessions the same day.

**Problem.** An app built mostly by agents works in a demo and still has gaps: a route without an ownership check, a
key in the page, money stored as a float. Generic checklists are too long and not sized to the app, and a grade from
reading code alone misses what only a running app shows.

**What it does.** A profile the owner confirms before anything runs; stages 1 to 3 that stack, and regulated data
added to any of them; one area file per topic, loaded only when the profile needs it; evidence or "unknown", never a
grade from a package name; probe tests for security suspects, written into the project's own suite on a yes; a
questionnaire with expiry for what code cannot show; a `READINESS.md` ledger that `ledger.mjs` keeps (hashes of the
cited files, a stage marked "not assessed" until its rows are graded, probe rows that cannot pass from code, evidence
that refuses secret values); a verdict with at most ten must-fix rows and no single score; and small fixes on a yes,
bigger ones as briefs.

**Why.** The owner wants an honest answer before their own apps reach paying users, and the same check as the app
changes. The sixth batch's review found five ways the first ledger gave a false GO, all fixed with a test each; the
cold run on a fixture web app with five seeded gaps found all five and confirmed the ownership gap with a failing
probe.
