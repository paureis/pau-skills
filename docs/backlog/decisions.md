# Decisions

[Back to the backlog index](../BACKLOG.md)

Decisions 1 to 21 (2026-10-17 to 2026-11-04) are in [decisions-1-to-21.md](decisions-1-to-21.md).

## Decisions taken (2026-11-06)

22. **After a brainstorm on a subagent watchdog, and a report from another chat**, each as recommended:
   - The watchdog direction is the waste detector and the orchestrator status together (Q21): a PreToolUse hook in
     subagents flags a command repeated with no edit between and a long stretch of tool calls with no edit, nudges
     first and then asks; a main-session hook shows each running subagent's minutes, tool calls and a "looks stuck"
     flag. Hard limits: never cut off a healthy long run; stopping needs a yes (the owner's or the orchestrator's,
     through TaskStop); a hook in `pau-skills-hooks` with no skill needed; it works in cloud sessions. Brief budgets
     are the runner-up.
   - Another chat reported that `verify-before-done` fired about ten times on edits a check had already covered. A
     small item, Q20, fixes the false alarms first. A check that ran inside a subagent still does not count for the
     orchestrator's edits: the orchestrator reruns the checks itself (`lean-subagent-dev`).
   - The other chat also said the AskUserQuestion prompts worked well on the owner's phone.

23. **The design of Q21, the subagent watchdog**, settled in a grilling on 2026-11-06, each as recommended:
   - A repeat is the same shell command, spaces collapsed, run again with no edit in between. An edit is Edit, Write,
     MultiEdit or NotebookEdit on a file in the project (the `verify-before-done` rule), or a `git commit`.
   - The no-progress rule skips a configurable list of read-only agent types (default `reviewer`, `Explore`, `Plan`,
     `claude-code-guide`, `web-fetch`); the repeat rule applies to every agent.
   - Defaults: a note on the 3rd identical run, "ask" on the 5th; a note at 40 tool calls since the last edit, "ask"
     at 80. All configurable.
   - The note is added after the tool call and blocks nothing. "Ask" stays on everywhere: interactive, it prompts;
     headless, it denies that one call with the reason, and the agent carries on (prototype below).
   - The main session sees one line per running subagent only when one is flagged, at most once every 5 minutes, on
     the owner's message or its next tool call. Stuck means no tool call started or finished for 10 minutes and none
     in flight; a command still running shows as "running <command> for N minutes" and is flagged only past 30.
   - The state lives in one file per session under the system temp folder; an agent's entry goes at SubagentStop,
     files older than a day are pruned.
   - On by default, off with `"subagent-watchdog": false`. One script,
     `hooks/agent-orchestration/subagent-watchdog.mjs`.
   - Prototype (one headless run, 0.005 US dollars): subagent hooks carry the main session's `session_id`, and their
     own `agent_id` and `agent_type`; main-session events carry neither. In `-p`, "ask" from PreToolUse denies the
     call, the reason reaches the agent, and it went on with its task. A denied call has a PreToolUse and no
     PostToolUse.

## Decisions taken (2026-11-11)

24. **Q22 before Q21**, from an owner brief: `verify-before-done` misses check scripts and `no-idle`'s prompt rewrite
   breaks auto mode (`pau-skills-hooks` 0.4.1). Q22 fixes both in 0.4.2 and is left on a branch for the owner's
   review, not pushed. The examples stay generic: the project where it was seen is private.

## Decisions taken (2026-11-16)

25. **Q23, the lazy senior developer, adapted from ponytail (MIT)**, from an owner brief and four answers, each as
   recommended except the hook default: one new skill `lazy-senior` with build, review and audit modes and a
   `shortcut:` debt ledger; a `lazy-senior` hook that adds a short ruleset at session start and to every subagent, on
   by default (the owner's choice; it becomes off by default if the measurement shows harm); the builder and reviewer
   agents, `review-triage` and `engineering-principles` carry the same rules, so every agent works the same way; the
   review in ponytail 5's order, lean last; a small paid `skill-eval` measurement before it ships, estimate first.
   The method is taken, not its numbers or its examples. `docs/backlog/q23.md` holds the plan.

## Decisions taken (2026-11-17)

26. **Q24, verification ideas from the Claude Code team's article**, as recommended: a diff-triggered checklist in
   `.claude/review-rules.json`, checks a change cannot edit (rules read from the base commit, an optional per-folder
   REVIEW.md), and property and differential tests taught in `tdd` and pointed to from the rest. The commit gate is
   skipped; its observe-mode idea goes into `rule-to-hook`. Q24 runs before Q21. `docs/backlog/q24.md` holds the plan.

## Decisions taken (2026-11-20)

27. **Code Mode before Q21.** The owner turns on Code Mode (experimental) for their terminal sessions to save tokens.
   A small item, Q26, checks every hook in `pau-skills-hooks` under Code Mode first, starting from a real Code Mode
   transcript the owner provides, then Q21 follows. Q25 shrinks to a note: Code Mode already filters output before
   Claude reads it, and it does not start with a mod that checks tool calls installed. `docs/backlog/q26.md` holds the
   plan.

## Decisions taken (2026-11-23)

28. **Code Mode parked, Q21 next.** The owner will not use Code Mode while it is experimental: it runs only in a
   terminal, not in the desktop app, and it turns off tools the owner uses, such as browser access. Q26 is parked with
   its plan kept, to pick up if Code Mode becomes a normal mode, since it does save tokens. Q21 is next. The owner also
   shared Claude Ship (released 2026-11-23); Q27 records what its docs say and where it could meet our skills, for the
   owner to decide.

29. **The backlog order holds, and Q27's scope.** Once an item is next in "Order", it is done next. The order changes
   only when the owner gives a specific reason; a new idea goes after the planned items, so the backlog stays short.
   The rule is in CLAUDE.md. Q21 starts now. The owner is on a personal plan and would run `/ship` both in the terminal
   and in the desktop app, so Q27 takes options 1 (name `/ship` in `safe-merge` and `lean-subagent-dev`) and 3
   (REVIEW.md files that do not confuse Code Review), after Q21. Options 2 and 4 need a Team or Enterprise plan and
   are skipped.

30. **What Q21's plan found that decision 23 did not cover**, the owner's answers each as recommended, and the changes
   the plan check and a headless prototype (0.02 US dollars) forced:
   - An edit inside the agent's own working folder counts, as well as one inside the project.
   - `eng-lead` joins the read-only types. Read-only types get repeat notes but never a repeat ask.
   - An agent with no event for 60 minutes is dropped from the status, unless it has a call in flight.
   - The prototype showed that TaskStop fires no SubagentStop, so the main session's TaskStop call removes the agent,
     and that a failing command fires PostToolUseFailure, which the hook also handles.
   - One state file per agent in a folder per session, instead of one file per session: with one shared file, parallel
     agents lost each other's stops and resets.
   - An ask's reason tells a healthy agent it may say so and go on, since only one call was refused: fixes made through
     the shell, mutation runs and poll loops reach an ask, and decision 22 forbids cutting off a healthy run.

