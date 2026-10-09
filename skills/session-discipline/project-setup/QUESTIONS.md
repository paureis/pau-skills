# Question bank

The core questions, in order. Ask one at a time. For each question:

- **Skip it** if the project scan already answers it. Say what you found and ask the user to confirm instead.
- **Recommend an answer** and give the reason in one sentence. The user can always pick another answer.
- **Record the answer** in your notes for the drafts. The "Goes into" line says where it ends up.

The quick path asks only the five questions marked **(quick)**: Q2, Q4, Q5, Q7 and Q8. For the rest it uses the
recommended answer, or what the scan shows, and lists those defaults in the summary, so the user can change them.
On the quick path, infer Q1 from Q2 and from how the user writes, and take Q3 from the environment hint.

Number the questions as "Question 3 of 10" (or "of 5" on the quick path). Do not count the quick or full choice as a
question. If follow-ups change the total, say so.

Options are written for a multiple-choice tool. When no such tool is available, show them as a numbered list and
accept a number or free text. Every question also accepts "I am not sure". When the user picks it, use the
recommended answer and add the question to the open questions list.

---

## Q1. Coding experience

"How much do you write code yourself?"

1. Never, or almost never
2. Some: scripts, spreadsheets, small changes to existing code
3. I write code as part of my work
4. I used to write code, but not recently

Recommend nothing; this is a fact about the user. Goes into: how much you explain for the rest of the setup, and the
personal preferences if the user saves them.

## Q2. Claude Code experience (quick)

"How much have you used Claude Code before today?"

1. This is my first session
2. I use Claude in the browser or the app, but not Claude Code
3. A few sessions
4. I use it regularly

If the answer is 3 or 4 and Q1 is 3, offer the quick path now if the user did not already pick it.

## Q3. Where you run Claude Code

"Where are you using Claude Code right now?"

1. The Claude desktop app
2. A terminal window
3. Inside an editor (VS Code, Cursor, JetBrains)
4. Claude Code on the web

Detect first: the environment variable `CLAUDE_CODE_ENTRYPOINT` often names the surface. Treat its value as a hint,
not a fact, and confirm it with the user. Goes into: the cheat sheet. Never into the project CLAUDE.md, because other
people may use another surface.

## Q4. What kind of session (quick)

"What do you want from Claude Code in this project?"

1. **Learn**: explain what you do and why, and teach me how Claude Code works as we go
2. **Build**: focus on getting the work done; explain only when I ask
3. **Mix**: get the work done, and explain the important parts

Recommend Learn if Q2 is 1 or 2, and Mix otherwise. Goes into: the personal preferences (if saved), because it is a
preference of this person, not of the project. Tell the user this before they answer: "I will save this choice so
that later sessions remember it. You can change it later."

## Q5. The goal of the project (quick)

Free text. Start from the scan: "From the files, this looks like <what you found>. Is that right? Correct or add
anything in your own words." If the folder is empty, ask: "What do you want to build?" Ask about the users and where
it runs in Q6, not here.

This is the question most likely to open a follow-up. See "Follow-ups" below. Goes into: the "What this project is"
section.

## Q6. Who uses it and where it runs

"Who will use it?"

1. Only me
2. People inside my team or company
3. Customers or the public
4. Not decided yet

Then, only if the scan did not show it: "Where will it run?" (free text, for example "my laptop", "a company server",
"a cloud service"). Recommend nothing. Goes into: "What this project is". Answer 2 or 3 makes Q7 more important.

## Q7. Hard limits (quick)

"Is there anything Claude must never do in this project? Pick all that apply."

1. Never send project data or code to an outside service
2. Never add a new library or dependency without asking
3. Never change some files or folders (I will name them)
4. Never touch production systems, real customer data or live accounts
5. Something else (I will describe it)
6. No special limits

Multiple answers are allowed. For 3, 4 and 5, ask which files, systems or rules in one follow-up each. Recommend 2
and 4 for any project used by other people. Goes into: "Hard limits", each limit as one short rule.

## Q8. How much freedom Claude has (quick)

"When Claude works on a task, how do you want it to work?"

1. **Step by step**: tell me the plan first, and wait for my yes before each change
2. **Plan, then work**: tell me the plan, and after my yes, do the whole task and show me the result
3. **On its own**: do the whole task, check it, and tell me what changed at the end

Recommend 1 for Learn, 2 for Mix and 3 for Build. After the answer, explain permission modes in two or three
sentences (see GUIDE.md), and say that this answer is a working agreement in CLAUDE.md, not a setting. Do not change
any settings file. Goes into: "How we work".

## Q9. Saving work with git

Detect first: is the folder a git repository, and does it have a remote? Then ask:

"How do you want to handle commits? A commit is a saved snapshot of the project that you can go back to."

1. Claude commits after each finished step, with a clear message
2. Claude tells me when a step is ready to commit, and I decide
3. I handle git myself; Claude does not commit
4. The project does not use git yet, and I want to start (Claude can explain and set it up)
5. The project does not use git, and I do not want it now

Recommend 2 for Learn and Mix, and 1 for Build. If the user picks 4, set up git only after the setup files are
approved, and explain each command before you run it. Goes into: "How we work".

## Q10. What "done" means

Detect first: test commands, lint or type check commands, and CI files. List the commands you found. Then ask:

"How do we know a change works?"

1. Run the tests and checks I found, and they must pass
2. I check it by hand: I run the app and try it
3. Both: tests pass, and then I try it
4. There are no tests yet, and I want Claude to add them as we go
5. There are no tests yet, and I do not want them now

Recommend 3 when tests exist and 4 when they do not, unless the project is a one-off script. Do not claim a command
works unless you ran it or the user confirmed it. Goes into: "Commands" and "How we work".

## Q11. Style for documents

"When Claude writes documents for this project (CLAUDE.md, README, notes), should it use plain, short sentences? This
does not affect code."

1. Yes, plain and short
2. No, write normally
3. Match the documents that are already here

Recommend 1, unless the project already has a clear documentation style; then recommend 3. Goes into: a short
"Writing documents" section in the project CLAUDE.md. Use the five-line version in TEMPLATES.md, not this whole guide.

## Q12. Save personal preferences

Ask only after the project CLAUDE.md is written. Phase 5 of SKILL.md has the wording and the three choices: all
projects, only this project, or do not save.

---

## Follow-ups

Ask a follow-up only when an answer or something in the project opens a question that the bank above does not
cover, **and** the answer changes what goes into CLAUDE.md or how Claude should work. Examples:

- The project calls an AI model, a database or another service. Ask how the code reaches it (an address in a
  setting, a key in an environment variable), and whether Claude may call it during development.
- The project handles personal, health, payment or company-confidential data. Ask whether Claude may read sample
  data, and where test data comes from.
- The scan finds two languages or two apps in one folder. Ask which part this work is about.
- The user names a deadline, a demo or a reviewer. Ask what must work by then.

Rules for follow-ups:

- At most three follow-ups for one answer. Then move on.
- Each follow-up still has options and a recommended answer when it can.
- Offer "decide later" every time. A question the user postpones goes into the "Open questions" section, not into
  a guess.
- Do not ask a follow-up to satisfy curiosity. If the answer would not change a file or a habit, do not ask.
