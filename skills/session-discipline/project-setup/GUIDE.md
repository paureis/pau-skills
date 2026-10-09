# Claude Code basics for the cheat sheet

Facts checked against the Claude Code documentation (https://code.claude.com/docs) in October 2026. Claude Code
changes often. If the user's version behaves differently from this file, trust what you see, tell the user, and say
that this guide may be out of date. Run `claude --version` in a terminal, or `/status` in a session, to see the
version.

## Instruction files

- `CLAUDE.md` in the project folder (or `.claude/CLAUDE.md`): shared with everyone who uses the project. Commit it.
- `CLAUDE.local.md` in the project folder: personal notes for this project. Add it to `.gitignore`.
- `~/.claude/CLAUDE.md`: personal notes for every project on this computer.
- Claude Code reads all of them at the start of a session and combines them. Keep each one short (well under 200
  lines), because every line costs context in every session.
- `@path/to/file` inside a CLAUDE.md imports another file.
- Recent versions read `AGENTS.md` only when no `CLAUDE.md` or `CLAUDE.local.md` exists. A new `CLAUDE.md` in a
  project that has an `AGENTS.md` must import it with `@AGENTS.md`, or Claude stops reading it.
- `/memory` lists these files and opens one in an editor. You can also say "add this to CLAUDE.md".

## Permission modes

A permission mode decides how often Claude Code asks before it acts.

| Mode | What it does |
|---|---|
| Manual (`default`) | Asks before each edit and each command that is not on the allow list |
| Edit automatically (`acceptEdits`) | Edits files without asking; still asks before commands |
| Plan (`plan`) | Reads and plans only; changes nothing until you approve the plan |
| Auto (`auto`) | A separate safety check reviews each action instead of you. Recent versions start in this mode |

How to switch:

- Terminal: press Shift+Tab to cycle through the modes.
- Desktop app: use the mode selector next to the send button, or press Cmd+Shift+M on a Mac.
  Shift+Tab does not change the mode here.
- VS Code: click the mode indicator at the bottom of the prompt box.

`/permissions` shows the allow, ask and deny rules, lets you add or remove one, and shows actions that auto mode
recently blocked. The documentation says auto mode "does not guarantee safety". Plan mode is the safest way to start
a large or risky task.

This skill does not change permission settings. It explains them and lets the user choose.

## Output styles

An output style changes how Claude Code talks, not what it can do.

- `Explanatory`: adds short "Insight" notes that explain choices. Good for a Learn session.
- `Learning`: adds the same notes, and also asks you to write small parts of the code yourself, marked
  `TODO(human)`. Good for someone who wants to learn to code, not only to use Claude Code.
- Switch with `/output-style <name>`, or `/config` and then "Output style". The change starts from the next message.
  In the desktop app, the documented way is the `outputStyle` key in a settings file.
- `/output-style` saves the choice for this project only, for this user. For all projects, the key goes in
  `~/.claude/settings.json`.

Suggest a style. Let the user run the command. Do not edit a settings file yourself.

## Commands for the cheat sheet

| Command | What it does |
|---|---|
| `/help` | Lists the commands |
| `/clear` | Starts a new session with empty context. CLAUDE.md files still load |
| `/resume` | Opens an earlier session. `claude --continue` in a terminal opens the last one |
| `/compact` | Summarizes the session so far to free context |
| `/context` | Shows how full the context is |
| `/rewind` (or Esc twice on an empty prompt) | Goes back to a checkpoint and undoes Claude's edits after it. Does not undo commands that Claude ran |
| `/model` | Changes the model |
| `/permissions` | Shows and changes the permission rules |
| `/memory` | Opens a CLAUDE.md file |
| `/usage` | Shows cost and plan limits |

## The desktop app

The desktop app has a Code tab next to Chat. Before the first message, the user picks the project folder, the
environment (for example Local), the model and the permission mode in the prompt area. During a session it can show:

- the diff of each change (click a line to comment on it),
- a terminal (Ctrl+backtick),
- a browser preview of a running app,
- the files, the plan and the task list.

Cmd+/ (Ctrl+/ on Windows) shows every shortcut. The panes can be dragged into any layout.

## Habits worth teaching

Pick one or two for a Learn session. Do not list them all.

- Ask for a plan first on anything bigger than one file. Plan mode is made for this.
- Use `/clear` between unrelated tasks. A long session with old context gives worse answers.
- Read the diff before you accept it. You do not need to understand every line. Ask about the lines you do not.
- Commit when a step works. Then a later mistake costs one step, not the whole day.
- Say what is wrong in plain words ("the button does nothing when I click it") and paste the exact error message.
