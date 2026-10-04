# session-discipline

Skills: `retrospective` (with `audit.mjs`), `session-close`, `handoff`. Hook: the roadmap summary at SessionStart.

## Roadmap hook

At session start, `scripts/roadmap.mjs` reads the project's roadmap and adds a short summary to the context: the
items in progress, the next pending item, the blocked items with their reasons, the open questions and what they
block, the last log entry, and whether a handoff file exists. If the roadmap file does not exist, it prints nothing.

### Format

A markdown file with one or more item tables and, optionally, one question table:

```markdown
| # | Question | When | Blocks |
|---|---|---|---|
| Q1 | Which payment provider? | Before item 3 | Item 3 |
| Q2 | Pricing model. Answered on 2026-01-05 | Done | Item 4 |

| # | Item | Done when | Status |
|---|---|---|---|
| 1 | Fast navigation: skeleton screens | Every list page shows a skeleton | done (2026-01-02) |
| 2 | Onboarding | A new account finishes setup unaided | in progress |
| 2b | CI speed | Under 5 minutes | blocked (needs runner budget) |
| 3 | Payments | First real charge | pending |
```

Ids are text, so `2b` works for an item inserted between two others. The status column is found by its header name;
the title is the text of the item cell before the first colon. A question whose row contains "Answered on
YYYY-MM-DD" is no longer listed.

### Configuration

Optional `.claude/roadmap.json` in the project root. Every key is optional; these are the defaults:

```json
{
  "roadmap": "docs/ROADMAP.md",
  "log": "docs/LOG.md",
  "handoff": "HANDOFF.md",
  "itemsHeader": "Item",
  "statusColumn": "Status",
  "questionsHeader": "Question",
  "blocksColumn": "Blocks",
  "statuses": { "pending": "pending", "inProgress": "in progress", "blocked": "blocked", "done": "done" },
  "answeredPattern": "Answered on \\d{4}-\\d{2}-\\d{2}",
  "rule": "One item at a time. At the end of the session, update the statuses in the roadmap, log what was done and write the handoff."
}
```

Header and status words can be changed to match an existing roadmap, including one written in another language. The
log's last entry is its last line starting with `- ` or `## [`. `session-close` reads the same file for the roadmap,
log and handoff paths.

To see what the hook prints: `node <plugin>/scripts/roadmap.mjs --text` from the project root.

## Retrospective audit

```bash
node "${CLAUDE_PLUGIN_ROOT}/skills/retrospective/audit.mjs"                 # sizes and most-overlapping pairs
node "${CLAUDE_PLUGIN_ROOT}/skills/retrospective/audit.mjs" --check rule.md # score a proposed rule (the gate)
node "${CLAUDE_PLUGIN_ROOT}/skills/retrospective/audit.mjs" --stale         # cited paths and npm scripts that are gone
```

`${CLAUDE_PLUGIN_ROOT}` is substituted inside the plugin's skills; from a terminal, use the plugin's install path.
Run from the project root. It reads `~/.claude/CLAUDE.md`, `./CLAUDE.md`, the project's memory directory under
`~/.claude/projects/`, and every `SKILL.md` under `~/.claude/skills` and `./.claude/skills`.
