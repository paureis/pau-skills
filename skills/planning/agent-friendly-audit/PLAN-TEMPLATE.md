# Plan template

Fill in every section and show the plan in your reply; the skill's "Report" summary closes the reply after it.
Evidence is pointers and a few words of your own, never raw excerpts.

```markdown
# Agent-friendly plan: <focus or whole repository>

## Sources

| Source | Read | Gave | Notes |
|---|---|---|---|
| Review comments | <n comments on n pull requests, or skipped> | <n corrections> | <bot only, empty, no access ...> |
| Commits | <n commits on <branch> at <sha>, n fix, n revert> | <n corrections> | <shallow clone, stale branch ...> |
| Transcripts and memory | <n sessions in n folders, memory yes/no> | <n corrections> | |
| Instruction files | <files> | <n rules, n enforced> | |

Confidence of the plan: <high | medium | low>, because <which source was missing or thin>.

## Classes

| # | Class | Instances (per source) | Confidence | Layer | Proposed fix | Proof |
|---|---|---|---|---|---|---|
| 1 | <the mistake> | <reviews 2, commits 3> | high | lint | <the check; its error says what to use instead> | <command: fails on <sha>^, passes now> |

For each class:
- **Evidence**: <pointers, a few words each>
- **Why not a higher layer**: <one line per layer above the chosen one>
- **Live copies**: <none | n, where>
- **Ratchet**: <none | current count n, fail when a change adds more>
- **Open question answered by prototype**: <none | what was tried, and the result>

## Rule table (for the instruction file)

| Rule | Enforced by |
|---|---|
| <rule> | <check, test, type or "nothing yet: class n"> |

## Exceptions

An exception goes on the offending line: `<comment marker> <check name>: allowed until <date>, <reason>, approved by
<role or handle>`, using whatever the project records approvals by (a code owner team, a reviewer handle), never a
person's name. The check reads the date and fails once it has passed; the proof shows an expired exception failing.

## Seen once (not proposed)

- <the mistake>: <pointer>

## Skipped

- <source or step>: <why>
```
