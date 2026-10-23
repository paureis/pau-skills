# Templates

Fill these from the interview and the project scan. Delete every section that has nothing true to say. A short file
that is all true is better than a full file with guesses. Keep the project CLAUDE.md under about 60 lines, not
counting the production rules.

Write every sentence in the style of STYLE.md. Use the user's own words for the goal and the limits when they are
clear.

## Project CLAUDE.md

```markdown
<!-- project-setup: written YYYY-MM-DD. Run the setup again or edit this file to change it. -->
# <Project name>

## What this project is

<One to three sentences: what it does, who uses it, where it runs.>

## Commands

- Install: `<command>`
- Run: `<command>`
- Test: `<command>`
- Check (lint, types): `<command>`

<Only commands you found in the project or the user confirmed. Mark a command you did not run as "not yet run".>

## Hard limits

- <One rule per line, in the imperative. Example: "Do not add a dependency without asking first.">

## Production rules

- **<Rule name>.** <One bullet per chosen rule from PRODUCTION-RULES.md (in this skill's folder), in the project
  files' language: its name in bold with a period, then its condition and every instruction in it, as short
  sentences. Leave out the rules not chosen.>

## How we work

- <The answer to Q9, as a rule. Example: "Explain the plan before you change anything. Wait for a yes.">
- <The answer to Q10. Example: "Tell me when a step is ready to commit. Do not commit without a yes.">
- <The answer to Q11. Example: "A change is done when `pytest` passes and I have tried it in the app.">

## Writing documents

- Use short sentences, one instruction per sentence, and the active voice.
- Use one term for one thing. Do not switch synonyms.
- Say what is known, what is likely and what is unknown, and keep them separate.
- No filler, no marketing words, no em dashes.
- This applies to documents only, not to code.

## Open questions

- <Each question the user postponed, with the date. Remove a line when it is answered.>
```

Notes:

- If the project already has a CLAUDE.md, do not replace it. Propose additions and changes as a diff, keep what is
  still true, and do not repeat a rule that is already there in other words.
- If the project has an `AGENTS.md` and no CLAUDE.md, say so. Offer a CLAUDE.md that contains one line, `@AGENTS.md`,
  plus only what is specific to Claude Code.
- Never put a password, key, token or connection string in the file. Write where it lives instead: "The API key is in
  the `MODEL_API_KEY` environment variable."
- Never put the user's session mode, explanation level or surface in the project CLAUDE.md. Other people share this
  file. Those go in the personal CLAUDE.md.
- Write a production rule only when a signal the scan found, or the user's goal, shows it applies, and the user chose
  it. On the quick path, a yes to the summary that lists the rules as defaults counts as choosing them.
- Start each rule's bullet with the rule's name in bold, followed by a period, as PRODUCTION-RULES.md names it, for
  example `- **Money.** When the code stores ...`. Translate the name with the rest when the project files are in
  another language.
- Write each chosen rule as one bullet of short sentences, 25 words or fewer each. Keep its condition ("When the code
  builds a database query, ..."), so the rule asks for nothing when the condition does not hold. Keep every
  instruction in the rule: shorten the words, never drop an instruction. For example, the signed-in user rule keeps
  the role check and "copy only the fields a user may set", the money rule keeps "or a decimal type", and the secrets
  rule keeps the rotate step. Two or three lines per rule (four for the signed-in user) keep the file under 80 lines.

## Personal CLAUDE.md section

Add this as a new section at the end of `~/.claude/CLAUDE.md`. Create the file if it does not exist. Never change
or remove text that is already in the file, except an older section with the same start marker, which this section
replaces.

```markdown
<!-- project-setup:start -->
## How I like to work with Claude Code

- My coding experience: <Q1 answer, in plain words>.
- My Claude Code experience: <Q2 answer>. <For 1 or 2: "Explain Claude Code features the first time we use them.">
- Session style: <Learn | Build | Mix>.
  - Learn: "Explain what you are about to do and why, before you do it. Teach me one new idea at a time."
  - Build: "Focus on the work. Explain only when I ask or when something is risky."
  - Mix: "Do the work. Explain the important decisions in a sentence or two."
- Preferred language: <language>. Talk to me in <language>, even when the code and commands are in English.
- Write explanations in short, plain sentences. Say when you are not sure.
<!-- project-setup:end -->
```

Leave out the "Preferred language" line when the run was in English. Write the section in the user's language.

This file applies to every project on this computer. Keep the section to the lines above. Project details never go
here.

## Cheat sheet

Show this in the conversation at the end. Do not save it as a file unless the user asks. Pick the lines for the
user's surface from GUIDE.md: at most four for a first-time user and eight for others. For a Learn session, add one
sentence on what each line is for.
