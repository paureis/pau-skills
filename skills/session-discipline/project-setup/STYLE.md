# Plain technical English

This guide is based on ASD-STE100 Simplified Technical English, with the vocabulary rules relaxed. Follow it in
everything you say during the setup and in every document you write: CLAUDE.md files, Markdown files, READMEs and
other documentation. Do not apply it to code, commands, file names, error messages or quoted text.

The goal is text that a tired or nervous reader understands on the first read, without losing technical precision.

## Sentences

- Keep sentences short. Aim for 20 words or fewer in a step and 25 words or fewer in an explanation.
- Put one instruction in each sentence. If a step has two actions, write two steps.
- Write steps in the imperative: "Open the folder." Not "You should open the folder" or "The folder can be opened."
- Put a condition before the instruction: "If the test fails, read the first error."
- Use the active voice. Say who does the action: "Claude reads the file", not "the file is read".
- Use a list when there are three or more items. Use numbered steps when the order matters.
- Keep paragraphs to about four sentences.

## Words

- Use one word for one thing, and keep it. If you say "permission prompt" once, do not later call it an "approval
  dialog". The terms below are fixed for this skill.
- Use common words when they are as precise as the technical word. Keep the technical word when it is more precise,
  and explain it the first time.
- Do not use filler: "simply", "just", "basically", "easily", "obviously", "of course".
- Do not use marketing words: "seamless", "robust", "powerful", "leverage", "cutting-edge".
- Do not use em dashes or en dashes. Use a comma, a colon, parentheses or a new sentence.

## Precision and uncertainty

- Say what you know, what you think and what you do not know, and keep them separate.
  - Known: "The tests use pytest. I found `pytest.ini`."
  - Likely: "This is probably the entry point, because it starts the server."
  - Unknown: "I do not know how the model is deployed. I did not find a deployment file."
- Do not round uncertainty up to certainty to sound confident. Do not hedge a fact you checked.
- Name the source of a fact when it matters: the file, the command or the person who said it.
- Give numbers and names, not "some" or "a few", when you have them.

## Explaining to a beginner

- Introduce one new idea at a time. Explain it in one or two sentences, then continue.
- Say what a thing does before you say what it is called.
- Use a concrete example from the user's own project when you can.
- Do not explain a thing the user already knows. Ask once, then adapt.

## Fixed terms

| Use this | Meaning | Do not switch to |
|---|---|---|
| session | One conversation with Claude Code, from start to `/clear` or exit | chat, thread |
| CLAUDE.md | A file of instructions that Claude Code reads at the start of every session | memory file, rules file, config |
| project CLAUDE.md | `CLAUDE.md` in the project folder, shared with everyone who uses the project | repo memory |
| personal CLAUDE.md | `~/.claude/CLAUDE.md`, read in every project on this computer, for this user only | global memory, user config |
| permission prompt | The question Claude Code asks before it runs a command or edits a file | approval dialog, popup |
| permission mode | The setting that decides how often Claude Code asks for permission | trust level |
| commit | A saved snapshot of the project in git | save point, checkpoint |
| checkpoint | Claude Code's own undo point for its edits, separate from git | commit |
| diff | The view of exactly what lines changed in a file | patch, changes view |
