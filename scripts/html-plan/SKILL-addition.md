## pau-skills additions

This copy is upstream html-plan at commit 06ec7b6 plus three pau-skills additions (see NOTICE):

- The Mist theme, appended to `runtime/htmlplan.css`: a cool grey-blue page, a teal accent, and a body that is painted in light and dark mode.
- A numbering fix in `runtime/pack.mjs`: a `doc-code src` excerpt that starts on a blank line is numbered from its first line with text, so `hl` and pins land on the right line.
- A Send to Claude button in the Respond sheet, appended to `runtime/htmlplan.js`. It posts the response as one comment on the artifact.

When you publish a page as an artifact, declare `capabilities: {comments: {}}` so the button works. Without it the button stays hidden, and copy and paste works as before.

For a decisions page, use `<doc-plan open="needs">`, which opens the paths to the decisions. For such pages this replaces "Leave it at the default" in `references/blocks.md`.
