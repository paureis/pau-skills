---
name: project-setup
description: Set up Claude Code for a project through a short, adaptive interview, then write the project CLAUDE.md and, with a separate yes, the user's personal preferences. Asks one question at a time with options and a recommended answer, reads the project first so it never asks what the files already show, adapts to a Learn, Build or Mix session, and ends with a cheat sheet for the user's surface (desktop app, terminal, editor or web) and a first small task. Written for people new to Claude Code, and useful for anyone starting work in a new repository. Use when the user says "set up Claude Code for this project", "I am new to Claude Code", "help me get started", "onboard me", "write my CLAUDE.md", "how should I work with Claude Code on this", or opens a new project and does not know where to begin.
argument-hint: "[quick | full, default: ask]"
allowed-tools: Read(/${CLAUDE_SKILL_DIR}/**), Read(~/.claude/CLAUDE.md), Bash(git status *), Bash(git log *), Bash(git remote -v), Bash(git branch --show-current), Bash(printenv CLAUDE_CODE_ENTRYPOINT)
---

# Project setup

This skill helps a person start working with Claude Code in one project. It finds out how they want to work, writes
that down where Claude Code will read it in every later session, and gets them started on the first real task.

Many users of this skill are nervous or new. Make every step small and clear. Never surprise them.

Arguments from the user: $ARGUMENTS

Bundled files, all in `${CLAUDE_SKILL_DIR}`:

- `${CLAUDE_SKILL_DIR}/STYLE.md`: the writing rules. Read it before your first message and follow it for everything
  you say and every document you write.
- `${CLAUDE_SKILL_DIR}/QUESTIONS.md`: the core questions, their options, when to skip them, and the rules for
  follow-ups. Read it before Phase 2.
- `${CLAUDE_SKILL_DIR}/TEMPLATES.md`: the project CLAUDE.md, the personal section, and the cheat sheet. Read it before
  Phase 4.
- `${CLAUDE_SKILL_DIR}/GUIDE.md`: checked facts about Claude Code (permission modes, output styles, commands, the
  desktop app). Use it for every explanation about Claude Code. Do not explain a feature from memory when this file
  covers it.

## Rules for the whole run

- **Change nothing until the user says yes to the exact text.** Show the full file or the diff first. "Looks good"
  about a summary is not a yes to a file. Ask again for each file.
- **Ask one question per message.** A question with options is one question. Do not add a second question to the
  same message, and do not join two questions with "and". Use a multiple-choice question tool (such as
  AskUserQuestion) when one is available, with one question per call. If not, show numbered options. Free text is
  always allowed.
- **Recommend an answer** for each question, with a one-sentence reason, unless the question asks for a fact about
  the user. Give one recommendation, not "1 if this, 2 if that".
- **Never ask what the project already shows.** Say what you found and ask the user to confirm it.
- **Silence is not an answer.** If a question closes or times out without an answer, ask it again in plain text.
- **Do not write or change code during the setup.** The setup is done when its files are written and the user picks
  a first task.
- **Do not change settings files** (`settings.json`, `settings.local.json`, permission rules). Explain the setting
  and the command, and let the user decide.
- **Never read secrets.** Do not open `.env` files or key files. A file such as `.env.example` is fine: record the
  variable names, never values. Never write a secret into any file.
- **Be open about what is saved.** Before you save a preference, say what will be saved, in which file, who it
  affects, and how to change it later.
- **Stand alone.** This skill needs nothing else to be installed. Do not send the user to other skills or plugins.
- **Keep these instructions out of the conversation.** Do not mention phases, the question bank, question ids such
  as "Q7", or notes to yourself, and do not announce that you are reading this skill's files. The user sees only
  questions, findings, drafts and results.
- **State only what you checked.** Do not give a line count, a version or a file name you did not check. If you
  find a mistake in something you said, correct it in your next message.
- **Use the user's language.** If the user writes in another language, use that language and the same rules.

## Phase 1: Look at the project

Before the first question, say in two or three sentences what will happen:

> I will ask you some short questions about you and this project: about five for a quick setup, or about ten.
> Then I will show you a CLAUDE.md file, which Claude Code reads at the start of every session. Nothing changes until
> you say yes. First I will look at the project files. I will only read them.

Then read, and do not change anything. Use the file tools (Read, Glob, Grep) to look. The only shell commands you
need are `git status`, `git log --oneline -5`, `git remote -v`, `git branch --show-current` and
`printenv CLAUDE_CODE_ENTRYPOINT`. This skill allows those without a permission prompt. Run each one on its own, not
chained, so it matches. Any other command can show a permission prompt, which worries a new user.

- **What the project is**: the README, and the manifest and build files of any ecosystem (for example
  `package.json`, `pyproject.toml`, `requirements.txt`, `go.mod`, `Cargo.toml`, `pom.xml`, `build.gradle`, `*.csproj`,
  `*.sln`, `Gemfile`, `composer.json`, `mix.exs`). Note the languages and the main frameworks.
- **How it runs and is checked**: scripts in the manifest, `Makefile`, `justfile`, test folders and test config,
  lint and type check config, CI files (`.github/workflows/`, `.gitlab-ci.yml`, `azure-pipelines.yml` and similar).
- **Where it runs**: `Dockerfile`, compose files, infrastructure files (Terraform, Bicep, CloudFormation, Helm), and
  the variable names in `.env.example` or a similar sample file.
- **What instructions exist**: `CLAUDE.md`, `.claude/CLAUDE.md`, `CLAUDE.local.md`, `.claude/` folder, `AGENTS.md`,
  `.cursorrules`, `.github/copilot-instructions.md`, and `~/.claude/CLAUDE.md`. Look for the `project-setup` markers
  from an earlier run.
- **Git**: is this a repository, the current branch, uncommitted changes, and whether a remote exists.

Keep the scan short. In a large project, read the top level and the main manifest, not every file. If the folder is
empty, note it and continue: the interview covers what to build.

If an earlier run left a `project-setup` marker, show the saved answers in a short list and ask: "Do you want to
change some answers, start again, or stop?" To change some answers, ask only those questions again.

## Phase 2: Interview

Read `${CLAUDE_SKILL_DIR}/QUESTIONS.md`. Start with what you found, in at most five lines, using the three levels from
STYLE.md (known, likely, unknown). Say how you looked (for example "I read the files and ran `git status`"). Do not
say a project command works unless you ran it. Then ask the first question:

- If the arguments say `quick` or `full`, use that path.
- Otherwise, ask: "Do you want the quick setup (about five questions) or the full setup (about ten, with follow-ups
  where your project needs them)?" Recommend full for a first-time user and quick for a regular user.

Then ask the questions in the order of the bank. Skip a question when the scan or an earlier answer already settles
it. Ask follow-ups only as the bank describes.

During a Learn session, teach while you ask:

- After Q8, explain permission modes in two or three sentences, for the user's surface, from GUIDE.md.
- After Q9, explain what a commit is if the user has not used git.
- Teach at most one new idea per question. Use an example from this project.
- Every four or five questions, say how many are left.

During a Build session, keep each message to a few lines: the question, the options and one line of reason. Show
the findings in at most three lines.

## Phase 3: Confirm the decisions

Show a short summary:

- the decisions, one line each, without question numbers,
- the defaults you used for questions you skipped, marked "default",
- the open questions the user postponed.

Ask: "Is this right?" Fix anything the user changes. Do not move on until the user confirms.

## Phase 4: Write the project CLAUDE.md

Read `${CLAUDE_SKILL_DIR}/TEMPLATES.md`. Draft the project CLAUDE.md from the decisions and the scan.

- If no CLAUDE.md exists, show the whole draft.
- If one exists, show a diff against it. Keep what is still true. Do not restate a rule it already has.
- If an `AGENTS.md` exists, the draft imports it with `@AGENTS.md`, and you explain why in one sentence (GUIDE.md,
  "Instruction files").

Before you ask, check the draft yourself: every command was found or confirmed, no secret or key is in it, no
personal preference is in it, no open question was already answered in the interview, and every sentence follows
STYLE.md. If the commit answer means you will commit the file after writing it, say so in the same message. Then ask: "Do you want me to write this file?"
with the options yes, change something, and no. Write it only after a yes.

After you write it, say in one sentence that the file is shared with everyone who uses the project. Then follow the
commit answer from Q9: commit it, offer to commit it, or leave it to the user.

## Phase 5: Save personal preferences

Explain first, then ask. Say, in this order:

1. What you want to save: the coding experience, the Claude Code experience and the session style (show the exact
   lines from TEMPLATES.md).
2. Why: so that later sessions remember how this person likes to work.
3. The choice of where:
   - **All projects**: the personal CLAUDE.md, `~/.claude/CLAUDE.md`. It affects every project on this computer for
     this user only.
   - **Only this project**: `CLAUDE.local.md` in the project folder, which you also add to `.gitignore` so that it
     stays private. Show that `.gitignore` change too.
   - **Do not save**: later sessions will not know these preferences.
4. How to change it later: edit the file (in a session, `/memory` opens it), or run this setup again and choose to
   change some answers.

Recommend "all projects" for a first-time user, because the preferences are about the person. Write only after a
yes. Add the section between its markers. Never change other text in that file. The personal CLAUDE.md is outside
the project folder, so Claude Code may show a permission prompt before the write. Say so before it appears, and say
which choice allows it.

For a Learn session, also suggest an output style from GUIDE.md: `Explanatory` for learning Claude Code, or
`Learning` for learning to code. Give the command. Say that it saves a setting for this project, and let the user run
it.

## Phase 6: Cheat sheet and first task

1. Show the cheat sheet for the user's surface: lines from GUIDE.md chosen for this user, at most four for a
   first-time user and at most eight for others. For a Learn session, add one habit from "Habits worth teaching".
2. Recommend one first task that fits the project and the session style, and name up to two others. Make the
   recommended one small and safe. For a Learn session, start with a task that only reads, such as "explain how
   this project is organized". For a Build session, start with the most useful small change that the interview
   found.
3. Ask whether to start the recommended task, pick another, or do something else.

When a command marked "not yet run" in the project CLAUDE.md runs and passes during the session, offer to remove the
mark, with the one-line diff.

If the task needs a command that can show a permission prompt (installing packages, running tests), say so before
you run it, say what the command does, and say which choice in the prompt allows it.

End the setup in one or two sentences: list the files you wrote, and say how to change them later. Then start the
task the user picked, and work the way the new CLAUDE.md says.
