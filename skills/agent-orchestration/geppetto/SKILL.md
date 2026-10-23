---
name: geppetto
description: "Designs, installs, audits and updates Claude Code subagents in .claude/agents, with a starter roster: eng-lead, builder, reviewer, writer, sweeper. Use when the user says 'create an agent', 'install the agent roster', 'audit my agents' or 'update my agents', or when agents overlap or carry leftover tools. Writes agents, not skills."
argument-hint: "[create | install | audit | update] [what the agent is for]"
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**)
---

# Geppetto

Geppetto makes and looks after a project's agent files: the subagents Claude Code loads from `.claude/agents/`. It
has four modes. **Create** designs one new agent. **Install** copies the bundled starter roster into the project.
**Audit** checks the agents already there. **Update** merges a newer bundled roster into tuned copies.

The request: $ARGUMENTS

Bundled files, open each when its mode needs it:
- `${CLAUDE_SKILL_DIR}/COVENANT.md`: the laws every agent carries, between two marker lines, and the roster version.
- `${CLAUDE_SKILL_DIR}/PRODUCTION-RULES.md`: the production rules block, between two marker lines, that agents which
  change or review code carry.
- `${CLAUDE_SKILL_DIR}/check-agents.mjs`: the audit script (Node 20+, standard library, read only). It prints what is
  wrong with each agent file and exits 1 when there is an error. It imports `check-agents-yaml.mjs` and
  `check-agents-checks.mjs`, which sit next to it; run only `check-agents.mjs`.
- The roster: `${CLAUDE_SKILL_DIR}/roster/eng-lead.md`, `${CLAUDE_SKILL_DIR}/roster/builder.md`,
  `${CLAUDE_SKILL_DIR}/roster/reviewer.md`, `${CLAUDE_SKILL_DIR}/roster/writer.md` and
  `${CLAUDE_SKILL_DIR}/roster/sweeper.md`.
- `${CLAUDE_SKILL_DIR}/templates/designer.md`: the starting point for a designer agent in Create. It is not part of
  the roster, and Install does not copy it.

## Rules for every mode

- **Show before you write, and write on a yes.** Show each file in full before creating it, and the exact diff before
  changing one: agent files, the `.gitignore` line, Audit fixes and Update merges alike. The covenant block and the
  production rules block are the one exception: each is the same in every file that carries it, so show it once in
  full and name it where it goes in each file. One yes may cover a set you showed together; a partial yes ("only
  builder and reviewer") covers only what it names. Approval of a plan or a report is not approval of a write.
- **Never overwrite an existing agent file.** Show the diff and merge on a yes instead.
- **Project scope by default.** Write to the project's `.claude/agents/`, to be committed so the agents work in cloud
  sessions and on every computer. Write to `~/.claude/agents/` only when the user asks for it; cloud sessions start
  with that folder empty.
- **Writes under `.claude/` ask twice.** Claude Code treats `.claude/` as a protected path and asks again before each
  write there, even in acceptEdits mode. Tell the user so before the first write, so the second prompt is no surprise.
- **Commit nothing.** Say what to commit; the user commits.
- **Offer `eng-lead`, never start it.** Starting it runs builders and reviewers, which costs far more than this skill.

## Facts the design rests on

Checked against the Claude Code docs (`sub-agents`, `tools-reference`, `worktrees`) on version 2.1.303:
- An agent is a Markdown file: YAML frontmatter, then the body, which becomes its system prompt. Only `name` and
  `description` are required. Claude Code ignores an unknown field without a word, and skips without a word a file
  whose YAML does not parse, that has no `description`, or whose `name` has a colon. A file with no frontmatter is
  documentation.
- `.claude/agents/` and `~/.claude/agents/` are read recursively. On a name clash the project wins over the user;
  inside one folder Claude Code loads one of the two files, by read order. A new agents folder loads only after a
  restart of Claude Code.
- With a `tools` list, an agent has only those tools. On Linux and macOS, Glob and Grep are dropped when Bash is in
  the list, so an agent with Bash searches with Bash.
- `memory` gives the agent Read, Write and Edit, so it ends any read-only design.
- `skills:` loads each named skill's full text at start-up. Claude Code skips a name that is not installed, with only
  a debug-log line.
- An agent with `isolation: worktree` works in a git worktree under `.claude/worktrees/`, branched from the remote's
  default branch (not the session's branch) unless `worktree.baseRef` is `head`.
- Agents can start agents, three layers deep by default; `CLAUDE_CODE_MAX_SUBAGENT_SPAWN_DEPTH` set to 1 turns that
  off. Agents have no AskUserQuestion tool: an agent that needs a yes stops, returns, and is continued by a message.
- An agent continued with SendMessage resumes in the background. The main session is told when it finishes; an agent
  that sent the message has no tool to wait for it.

## Pick the mode

From the request: "create", "make" or "design" an agent is **Create**; the roster or the starter agents is
**Install**; "check", "audit", "clean up" or a named problem with existing agents is **Audit**; "update" after the
skill changed is **Update**. If you cannot tell, ask which one, in one line.

## Create

1. Ask a few questions, one at a time, each with your suggested answer from what you can read in the project:
   - What one job does it do, and what does it hand back?
   - What must it never do (its anti-jobs)?
   - Does it change files, run commands, or only read?
   - Does it start or continue other agents?
   - Does it need to remember anything between runs, and is that worth giving it Write and Edit?
   - What stops it and sends it back for a human yes?
2. Decide whether a new agent is the right answer. Make one only for a job with its own goal, tool set, way of
   working, approval boundary or schedule. If an existing agent already covers it, propose a change to that agent
   instead. A "general helper" is a sign to stop and narrow the job.
3. Draft the file:
   - `name`: lowercase words joined by hyphens, no colon.
   - `description`: under 200 characters, saying when to pick this agent and not the others. The Agent tool lists
     every description in every session.
   - `tools`: the fewest that do the job. List Glob and Grep only on an agent without Bash. List Agent and SendMessage
     when the body starts or continues agents.
   - `model: inherit`. Set `effort` only with a reason, and say the reason.
   - `memory` only when the agent writes files anyway or the user accepts that it can; never on a read-only agent.
   - `isolation: worktree` when it changes code while other agents work in the same repository.
   - `skills:` only for skills installed now (see Install, step 2), and a body that works without them.
   - The body: its job, its anti-jobs, its steps, its report format, and last the covenant block copied from
     `${CLAUDE_SKILL_DIR}/COVENANT.md` from marker line to marker line. Agent bodies cannot use `${CLAUDE_SKILL_DIR}`;
     write any path they need in full.
   - For an agent that changes or reviews code, paste the production rules block from
     `${CLAUDE_SKILL_DIR}/PRODUCTION-RULES.md`, from marker line to marker line, just before the covenant. Leave it
     out of agents that plan, write prose or clean up.
4. Check the draft: save it to a scratch folder outside the project and run
   `node "${CLAUDE_SKILL_DIR}/check-agents.mjs" --dir <scratch folder>`. Fix every error.
5. Show the file and the check's output, ask, and write it on a yes. Then run the Audit's script on the project.

### A designer

For an agent that extends a design system in code, start from `${CLAUDE_SKILL_DIR}/templates/designer.md`.
1. Find the tokens file, the type and spacing scales, the components, the screens folder and the keyframe (the
   finished screen that sets the look). Suggest each one from what you read in the project and confirm it with the
   user.
2. Fill "The design system" with those paths and names, never with values: the designer reads the values from the
   files on every run.
3. Only if the user names a design MCP server that already works in their sessions, add `mcpServers: [<name>]` to the
   frontmatter, add the server's tools to `tools` as `mcp__<prefix>__*`, and name the tool under "Design tool". Read
   the prefix from the tool names the session lists for that server, not from its name: a server named
   `plugin:design:figma` lists its tools as `mcp__plugin_design_figma__...`. Say that this path is unproven.
4. Add no production rules block: the designer writes no server code.

Then check the draft and show it as in Create, steps 4 and 5.

## Install

1. Read the five roster files, `COVENANT.md` and `PRODUCTION-RULES.md`.
2. Find the installed skills that an agent could preload. A skill counts as installed when it is in
   `.claude/skills/<name>/`, `~/.claude/skills/<name>/`, or synced from claude.ai at
   `~/.claude/skills/synced/*/<name>/SKILL.md`. If `tdd` is installed, add `skills:` with it to builder's
   frontmatter, spelled the way the session's skill list shows it. Give reviewer no `skills:` line, even when
   `evaluator` is installed: that skill runs in a forked context and stops when it gets no arguments, so preloading it
   does nothing useful. Reviewer's body already carries the grading method.
3. Look at what is there: list `.claude/agents/` (it may not exist) and read every file in it, and run
   `git check-ignore -q .claude/worktrees/x` to see whether `.claude/worktrees/` is already ignored.
4. Show the plan and every file:
   - each roster file that is new, in full, with any `skills:` line you added (the covenant block and the production
     rules block each shown once, as the rules above say);
   - for each roster agent whose `name` is already in use, the diff between that file and the bundled one, and no
     write (offer Update or a merge);
   - the line `.claude/worktrees/` to add to `.gitignore` when it is not ignored (builder works in worktrees there);
   - a note that Claude Code will ask again for each write under `.claude/`.
   Then ask once.
5. On a yes, write exactly what was approved: create `.claude/agents/` if needed, write the files, and append the
   `.gitignore` line.
6. Run `node "${CLAUDE_SKILL_DIR}/check-agents.mjs" --project .` and show its result.
7. Report: what was written, what was skipped and why, the check's result, and these next steps:
   - Restart Claude Code if this created `.claude/agents/`; the folder loads only after a restart.
   - Commit `.claude/agents/` and `.gitignore`.
   - To use the roster: ask for `eng-lead` with the work to plan; it returns slices, briefs and a cost, and waits for
     a yes. Continued with the yes, it starts the builders, then a reviewer per slice, and returns each slice's
     branch, the review verdicts and a fix-round message addressed to that slice's builder. The main session sends
     those messages, waits for each builder's reply, then merges and pushes. For one small change, use `builder` and
     then `reviewer` directly. `writer` edits docs, `sweeper` frees disk space.
   - A designer agent is not in the roster: ask for Create to make one from the project's design system.
   Offer `eng-lead`; do not start it.

## Audit

1. Run `node "${CLAUDE_SKILL_DIR}/check-agents.mjs" --project .` (add `--json` to read it as data). It reads the
   project's and the user's agents and reports errors and warnings; the comment at the top of the script lists every
   check and the overlap score's threshold. When `claude` is installed, also run `claude plugin validate .claude/agents`
   (and `claude plugin validate ~/.claude/agents` for the user scope). It reads the files with Claude Code's own
   parser: a parse error there is an error, since Claude Code skips that file, whatever the script said. The script
   reports what it cannot parse as a warning and points at this command. Validate reads a folder of agents only at a
   path ending in `.claude/agents`; any other folder (a `--dir` folder such as the bundled roster) fails with "No
   manifest found". For such a folder, validate a copy, as the warning says: copy the folder to
   `<a temporary folder>/.claude/agents` and run `claude plugin validate` on that path. The script checks the
   production rules block only on an agent that carries one: it must be closed, and at the bundle's roster version
   word for word the one in `PRODUCTION-RULES.md`.
2. Add what the script cannot judge, agent by agent, from the body. For a roster agent, first diff the installed
   copy against its bundled file and judge only the lines that differ: the bundled settings (such as `effort: xhigh`
   on eng-lead) are the design, not findings.
   - Leftover tools: a tool in `tools` that no step of the body needs, or no `tools` list at all on an agent with a
     narrow job (it then has every tool).
   - One job: an agent with two unrelated jobs, or no anti-jobs.
   - The description: does it say when to pick this agent and not another?
   - A body that relies on a skill or a path that is not there.
3. Show the findings, with a proposed fix for each as an exact diff. Never apply a fix in the same message as the
   report.
4. On a yes, apply the approved fixes, run the script again and show that the findings are gone.

## Update

Each roster file carries its version on the covenant's start marker line: `<!-- covenant start: geppetto roster N -->`.
The audit warns when an installed copy carries an older number than the bundle.

1. For each bundled agent, find the installed copy by its `name` (any file in the scope, any file name) and read its
   version. Same version and same text: nothing to do. No copy: offer to install it as in Install. For an agent
   Create made (no bundled file has its name), replace only its covenant block and its production rules block, if it
   has one, with the new ones, and show that as a diff.
2. For a copy from an older bundle, separate the bundle's change from the user's tuning. If git history holds the
   copy as it was first installed (`git log --diff-filter=A --format=%H -- <file>`, then
   `git show <commit>:<file>`), use that as the base for a three-way merge:
   `git merge-file -p <installed copy> <old bundled copy> <new bundled copy>`, run on copies in a scratch folder.
   Without that history, show the diff between the installed copy and the new bundle, section by section, and say
   which parts look tuned.
3. Show the merged file and the diff from the installed copy. The covenant block and the production rules block
   always become the new ones; every other tuned line stays unless the user says otherwise. Conflicts are shown,
   never resolved silently.
4. On a yes, write the merged file. Then run the audit's script.

## Next steps

Offer to run the Audit after Create, Install or Update if it did not run. If the user wants a skill rather than an
agent, say this skill writes agents only; offer to run `skill-creator` if it is installed.
