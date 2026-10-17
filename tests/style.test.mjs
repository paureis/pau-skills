// House style for every document a user or an agent reads: no em dashes and no en dashes. Use a comma, colon, period
// or parentheses instead. Code and scripts are not checked; only Markdown.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';

const DASHES = /[–—]/;

// Words and phrases typical of AI-written text, from the lexical rules of pstack's `unslop` skill (AI vocabulary,
// fancy ways to say "is", "not just X but Y", chatbot phrases, filler, and the plain-word rule). Only words with a
// plain replacement and almost no honest use in these documents are listed, so a hit is nearly always worth fixing.
// Left out on purpose: "underscore" (the `_` character), "landscape" and "features" (literal uses), and the
// punctuation and passive-voice rules, which this repository does not adopt. A word mentioned as a word, for example
// in a rule that bans it, goes in inline code; fenced code blocks and inline code are not checked.
const AI_PROSE = [
  ['AI vocabulary', /\b(delv(e|es|ed|ing)|pivotal|tapestry|testament|vibrant|intricate|interplay|garner(s|ed|ing)?|showcas(e|es|ed|ing)|foster(s|ed|ing)?|enduring|crucial(ly)?|additionally|enhanc(e|es|ed|ing|ement|ements))\b/i],
  ['marketing word', /\b(seamless(ly)?|cutting[- ]edge|game[- ]chang(er|ers|ing)|supercharg(e|es|ed|ing))\b/i],
  ['fancy "is"', /\b(serves? as|serving as|stands? as|boasts?)\b/i],
  ['"not just X but Y"', /\bnot (just|only|merely)\b[^.;:!?]{0,80}?\bbut\b/i],
  ['chatbot phrase', /\b(I hope this helps|let me know if|great question|absolutely right|happy to help)\b|\b(of course|certainly)!/i],
  ['filler', /\b(in order to|due to the fact that|it is important to note|it is worth noting|it'?s worth noting|needless to say)\b/i],
  ['fancy word', /\b(utili[sz](e|es|ed|ing|ation)|facilitat(e|es|ed|ing)|numerous)\b/i],
  // "leverage" the noun is a defined term in improve-codebase-architecture; only the verb is banned.
  ['"leverage" as a verb', /\bleverag(es|ed|ing)\b|\b(to|can|could|will|would|should|must|not|never|we|you|they|I) leverage\b/i],
];

// Paragraphs that quote upstream text and are kept as quoted. Each entry is a file and a pattern for the first line
// of the paragraph; the whole paragraph is skipped.
const QUOTES_UPSTREAM = [
  // The backlog item for this very rule names the words it bans.
  ['docs/BACKLOG.md', /^\*\*P0\.4 Style word list\*\*/],
];

function markdownFiles() {
  return execFileSync('git', ['-C', ROOT, 'ls-files', '-co', '--exclude-standard', '*.md'], { encoding: 'utf8' }).split('\n').filter(Boolean);
}

// Code fences as CommonMark defines them: three or more backticks or tildes open a fence, and a backtick fence's info
// string has no backtick in it. Only a bare fence of the same character, at least as long, closes it. Any indentation
// is accepted, because fences inside list items are indented.
const FENCE_OPEN = /^\s*(`{3,}(?=[^`]*$)|~{3,})/;
const closesFence = (line, fence) => {
  const m = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
  return !!m && m[1][0] === fence[0] && m[1].length >= fence.length;
};

// The prose lines of a Markdown file: fenced code blocks dropped, inline code blanked, quoted paragraphs skipped.
function proseLines(text, exempt = []) {
  const out = [];
  let fence = null;
  let skipping = false;
  let start = true;
  text.split(/\r?\n/).forEach((line, i) => {
    if (fence) {
      if (closesFence(line, fence)) fence = null;
      return;
    }
    const open = FENCE_OPEN.exec(line);
    if (open) { fence = open[1]; return; }
    if (!line.trim()) { start = true; skipping = false; return; }
    if (start) skipping = exempt.some((re) => re.test(line.trim()));
    start = false;
    if (!skipping) out.push({ n: i + 1, text: line.replace(/(`+)[\s\S]*?\1/g, '') });
  });
  return out;
}

test('no Markdown file uses an em dash or an en dash', () => {
  const files = markdownFiles();
  assert.ok(files.length > 20);
  const hits = [];
  for (const f of files) {
    readFileSync(join(ROOT, f), 'utf8').split(/\r?\n/).forEach((line, i) => { if (DASHES.test(line)) hits.push(`${f}:${i + 1}`); });
  }
  assert.deepEqual(hits, [], `dashes found at:\n${hits.join('\n')}`);
});

test('no Markdown file uses words and phrases typical of AI-written text', () => {
  const files = markdownFiles();
  assert.ok(files.length > 20);
  const hits = [];
  for (const f of files) {
    const exempt = QUOTES_UPSTREAM.filter(([file]) => file === f).map(([, re]) => re);
    for (const { n, text } of proseLines(readFileSync(join(ROOT, f), 'utf8'), exempt)) {
      for (const [rule, re] of AI_PROSE) {
        const m = re.exec(text);
        if (m) hits.push(`${f}:${n}: ${rule}: "${m[0]}"`);
      }
    }
  }
  assert.deepEqual(hits, [], `AI-typical prose found at:\n${hits.join('\n')}`);
});

test('the AI prose check skips code and catches each kind of phrase', () => {
  const sample = [
    'We delve into it.',
    'This serves as the entry point.',
    'It is not just fast, but also correct.',
    'I hope this helps!',
    'Run it in order to build.',
    'You can leverage the cache.',
    '',
    '```',
    'delve pivotal tapestry',
    '```',
    'Inline `delve` and ``serves as`` are code.',
    'Leverage at the interface is a noun.',
  ].join('\n');
  const flagged = proseLines(sample).filter(({ text }) => AI_PROSE.some(([, re]) => re.test(text))).map(({ n }) => n);
  assert.deepEqual(flagged, [1, 2, 3, 4, 5, 6]);
  const quoted = proseLines('**P0.4 Style word list**: delve,\npivotal.\n\nDelve here.', [/^\*\*P0\.4 Style word list\*\*/]);
  assert.deepEqual(quoted.map(({ n }) => n), [4]);
});

test('code fences open and close the CommonMark way', () => {
  const lines = (sample) => proseLines(sample.join('\n')).map(({ n }) => n);
  // A fence line with an info string does not close a fence; the bare fence after it does.
  assert.deepEqual(lines(['```markdown', 'text', '```js', 'code', '```', 'prose']), [6]);
  // The closing fence must be the same character and at least as long.
  assert.deepEqual(lines(['````', '```', '~~~', 'code', '`````', 'prose']), [6]);
  assert.deepEqual(lines(['~~~', '```', 'code', '~~~~', 'prose']), [5]);
  // A backtick fence's info string cannot contain a backtick, so this is inline code, not a fence.
  assert.deepEqual(lines(['```a``` is prose', 'prose']), [1, 2]);
  // Indented fences (inside list items) still count, and spaces after a closing fence are allowed.
  assert.deepEqual(lines(['- item', '  ```bash', '  delve', '  ```  ', 'prose']), [1, 5]);
});

test('"leverage" is caught as a verb and not as a noun', () => {
  const rule = AI_PROSE.find(([name]) => name === '"leverage" as a verb')[1];
  const verbs = ['It leverages the cache.', 'You should not leverage this.', 'We leveraged it.', 'Leveraging the cache helps.',
    'They leverage it.', 'We want to leverage it.', 'I leverage it.', 'Do not leverage it.', 'You can leverage the cache.'];
  const nouns = ['Leverage at the interface.', 'Deep means high leverage.', 'Where leverage is high.', 'Locality and leverage.',
    'Maximise leverage per entry point.', 'Depth produces **Leverage** for callers.'];
  assert.deepEqual(verbs.filter((s) => !rule.test(s)), []);
  assert.deepEqual(nouns.filter((s) => rule.test(s)), []);
});
