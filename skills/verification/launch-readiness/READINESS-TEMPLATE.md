# Launch readiness

Kept by the launch-readiness skill. The profile block and the checks table are rewritten by its `ledger.mjs`; the
rest of this file is yours and stays as you write it. Commit it when you are happy with it.

## Verdict

No run yet.

## Profile

```json launch-readiness
{
  "version": 1,
  "stage": null,
  "regulated": false,
  "profile": {},
  "profileFiles": {},
  "lastRun": null
}
```

## Checks

Stages: 1 private beta, 2 paying customers, 3 enterprise buyers, 4 regulated data (added to the stage the app is
at). Status: pass, fail, likely (a security suspect with no probe), unknown, n/a, recheck. Files: each cited file
with the first 16 hex characters of its sha256; when one changes, the row goes back to recheck.

| id | area | stage | severity | status | source | evidence | files | date | expires |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |

## Needs a person

None listed yet.
