// The upstream facts and the patch data of scripts/pack-html-plan.mjs (Q15): where html-plan comes from, the anchors
// that must each be found exactly once before anything changes, the one replacement, and the three appended files.

export const UPSTREAM = Object.freeze({
  repository: 'https://github.com/anthropics/claude-plugins-community',
  path: 'html-plan/skills/html-plan',
  commit: '06ec7b6a0a82bdc4bec44bd82d4368c42f20d7c1',
  author: 'Thariq Shihipar',
  license: 'MIT',
  licenseSource: 'as html-plan/.claude-plugin/plugin.json declares',
  rootLicense: 'Apache License 2.0',
});

// The numbering fix. Upstream runtime/pack.mjs fills <doc-code src lines="a-b"> with lines a to b and adds start="a";
// the browser's dedent() then drops every leading blank line, so each one moves every number, hl and pin a line low.
// The replacement numbers from the first line with a non-space character. It runs where `text` holds the slice (the
// whole file without lines=); a fill without lines= gets start= only when the file starts with a blank line, as
// upstream adds none otherwise (a diff without an @@ header must stay unnumbered); an explicit start= stays the author's.
export const NUMBERING = Object.freeze({
  file: 'runtime/pack.mjs',
  anchor: "(a.start || !a.lines ? '' : ` start=\"${start}\"`)",
  replacement: "(a.start ? '' : ((o) => (a.lines || o > 0 ? ` start=\"${start + o}\"` : ''))(Math.max(0, text.split('\\n').findIndex((l) => l.trim()))))",
});

// Presence checks, with no change: the places the appended files rely on.
export const PRESENT = Object.freeze([
  Object.freeze({ file: 'runtime/htmlplan.js', anchor: "h('pre', null, r.md)" }),
  Object.freeze({ file: 'runtime/htmlplan.js', anchor: "h('span', { class: 'nw-send-state' })" }),
  Object.freeze({ file: 'runtime/htmlplan.js', anchor: "'Copy response'" }),
  Object.freeze({ file: 'runtime/htmlplan.css', anchor: ':root:not([data-theme="light"]) {' }),
  Object.freeze({ file: 'runtime/htmlplan.css', anchor: ':root[data-theme="dark"] {' }),
  Object.freeze({ file: 'runtime/htmlplan.css', anchor: '.nw-toc a:hover {' }),
]);

export const ANCHORS = Object.freeze([NUMBERING, ...PRESENT]);

// Each file of scripts/html-plan/ appended to an upstream file, and what NOTICE says about it.
export const APPENDS = Object.freeze([
  Object.freeze({ file: 'runtime/htmlplan.css', from: 'mist.css', what: 'the Mist theme (a cool grey-blue page, a teal accent, the title in the sans face), appended' }),
  Object.freeze({ file: 'runtime/htmlplan.js', from: 'send-to-claude.js', what: 'a Send to Claude button in the Respond sheet, appended' }),
  Object.freeze({ file: 'SKILL.md', from: 'SKILL-addition.md', what: 'a section on the pau-skills additions, appended' }),
]);

export const REPLACED_WHAT = 'one expression replaced, so a doc-code src excerpt that starts on a blank line is numbered from its first line with text';
