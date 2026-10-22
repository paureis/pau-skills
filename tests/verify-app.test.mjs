// The verify-app map checker: heading, index and frontmatter rules (pure), the whole check against real folders in a
// real git repository, the bundled template and example, and the two fixture apps the skill is tried on.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tempDir } from './helpers.mjs';
import {
  headings, checkFeature, indexLinks, compareIndex, parseFrontmatter, checkSkill, evidenceFolder, placeholders,
  parseArgs, featureFiles,
} from '../skills/verification/verify-app/check-map.mjs';
import { FEATURE, GOTCHAS, STATES, WITH_SCREEN, FOUR_HEADINGS, SKILL } from './verify-app.helpers.mjs';

describe('headings', () => {
  test('reads levels and text, and skips fenced code', () => {
    const h = headings('# T\n\n## A\n```\n## not a heading\n```\n~~~sh\n## nor this\n~~~\n### B ##\n');
    assert.deepEqual(h.map((x) => [x.level, x.text]), [[1, 'T'], [2, 'A'], [3, 'B']]);
  });
});

describe('checkFeature', () => {
  test('a file with the five headings in order, each with content, is clean', () => {
    assert.match(FEATURE, /## States\n\n- No screen[^\n]*\n$/);
    assert.deepEqual(checkFeature(FEATURE), []);
  });

  test('accepts the upstream spellings of the headings and any harness name', () => {
    const text = FEATURE.replace("(user's point of view)", '(user POV)').replace('with curl', 'with tmux');
    assert.deepEqual(checkFeature(text), []);
  });

  test('a missing heading is named', () => {
    const p = checkFeature(FEATURE.replace('## Gotchas\n\n- Titles are trimmed.\n', ''));
    assert.equal(p.length, 1);
    assert.match(p[0], /missing.*Gotchas/);
  });

  test('headings out of order are reported', () => {
    const swapped = FEATURE.replace('## Sub-features', '## TMP').replace('## Gotchas', '## Sub-features').replace('## TMP', '## Gotchas');
    assert.ok(checkFeature(swapped).some((m) => /order/.test(m)));
  });

  test('a duplicate heading is reported', () => {
    assert.ok(checkFeature(`${FEATURE}\n## Gotchas\n\n- again\n`).some((m) => /twice|more than once/.test(m)));
  });

  test('an extra second-level heading is reported', () => {
    assert.ok(checkFeature(`${FEATURE}\n## Notes\n\n- x\n`).some((m) => /Notes/.test(m)));
  });

  test('an empty section is reported', () => {
    const p = checkFeature(FEATURE.replace("- Send a POST to /bookmarks.\n", ''));
    assert.ok(p.some((m) => /How to get to it.*empty/.test(m)), p.join('\n'));
  });

  test('States is required, and its absence names maintain mode as the way to add it', () => {
    const p = checkFeature(FOUR_HEADINGS);
    assert.equal(p.length, 1, p.join('\n'));
    assert.match(p[0], /missing heading "## States"/);
    assert.match(p[0], /maintain mode/);
  });

  test('States comes after Gotchas', () => {
    const text = FOUR_HEADINGS.replace(GOTCHAS, `${STATES}\n${GOTCHAS}`);
    assert.ok(checkFeature(text).some((m) => /order/.test(m) && /Gotchas, States/.test(m)), checkFeature(text).join('\n'));
  });

  test('an empty States section is reported by name', () => {
    const p = checkFeature(`${FOUR_HEADINGS}\n## States\n\n`);
    assert.equal(p.length, 1, p.join('\n'));
    assert.match(p[0], /"## States" is empty/);
  });

  test('a feature with a screen passes with its three states, which the checker does not parse', () => {
    assert.deepEqual(checkFeature(WITH_SCREEN), []);
    assert.deepEqual(checkFeature(WITH_SCREEN.replace(/- \*\*Empty[^\n]*\n/, '')), []);
  });

  test('an extra heading is reported against the five headings', () => {
    assert.ok(checkFeature(`${FEATURE}\n## Notes\n\n- x\n`).some((m) => /five headings/.test(m)));
  });

  test('a States heading with extra words counts', () => {
    assert.deepEqual(checkFeature(FEATURE.replace('## States\n', '## States (no screen)\n')), []);
  });

  test('a heading inside a code block does not count', () => {
    const p = checkFeature(FEATURE.replace(GOTCHAS, '```\n## Gotchas\n```\n'));
    assert.ok(p.some((m) => /missing.*Gotchas/.test(m)));
  });
});

describe('index', () => {
  test('indexLinks keeps local Markdown links and drops URLs, anchors, code and links outside the folder', () => {
    const text = [
      '- [Add](./add.md) and [Search](search.md#top)',
      '- [Docs](https://example.com/x.md) [Here](#features) [Skill](../SKILL.md) [Img](shot.png)',
      '```', '[Hidden](hidden.md)', '```', '`[Inline](inline.md)`',
    ].join('\n');
    assert.deepEqual(indexLinks(text), ['add.md', 'search.md']);
  });

  test('compareIndex reports dead links, unlisted files and duplicates, and ignores README.md', () => {
    const r = compareIndex(['add.md', 'gone.md', 'add.md', 'README.md'], ['README.md', 'add.md', 'search.md']);
    assert.deepEqual(r, { dead: ['gone.md'], unlisted: ['search.md'], duplicate: ['add.md'] });
  });

  test('a matching index is clean', () => {
    assert.deepEqual(compareIndex(['a.md', 'b.md'], ['b.md', 'a.md', 'README.md']), { dead: [], unlisted: [], duplicate: [] });
  });
});

describe('the generated SKILL.md', () => {
  test('parseFrontmatter reads name and description, quoted or not', () => {
    assert.deepEqual(parseFrontmatter(SKILL), { name: 'verify-shelf', description: 'Drive the Shelf HTTP service and prove behaviour with evidence. Use when asked to verify Shelf.' });
    assert.equal(parseFrontmatter('# no frontmatter\n'), null);
  });

  test('a complete file is clean', () => assert.deepEqual(checkSkill(SKILL, 'verify-shelf'), []));

  test('no frontmatter means the skill never registers', () => {
    assert.ok(checkSkill(SKILL.replace(/^---[\s\S]*?---\n/, ''), 'verify-shelf').some((m) => /frontmatter/.test(m)));
  });

  test('a name that is not the folder name is reported', () => {
    assert.ok(checkSkill(SKILL, 'verify-other').some((m) => /name/.test(m)));
  });

  test('a missing description is reported', () => {
    assert.ok(checkSkill(SKILL.replace(/description:.*\n/, ''), 'verify-shelf').some((m) => /description/.test(m)));
  });

  test('each of the five sections is required', () => {
    for (const s of ['Launch', 'Doctor', 'Drive', 'Evidence', 'Cleanup']) {
      const p = checkSkill(SKILL.replace(`## ${s}\n`, `## Other ${s.toLowerCase()}\n`), 'verify-shelf');
      assert.ok(p.some((m) => m.includes(s)), `${s}: ${p.join('; ')}`);
    }
  });

  test('evidenceFolder takes the fixed part of the named path', () => {
    assert.equal(evidenceFolder(SKILL), '.verify-evidence');
    assert.equal(evidenceFolder('Evidence folder: `artifacts/verify/$RUN_ID`'), 'artifacts/verify');
    assert.equal(evidenceFolder('Evidence folder: `./proof/`'), 'proof');
    assert.equal(evidenceFolder('Evidence goes somewhere'), null);
    assert.equal(evidenceFolder('Evidence folder: `<run-id>`'), null);
  });

  test('a SKILL.md that names no evidence folder is reported', () => {
    assert.ok(checkSkill(SKILL.replace(/Evidence folder:.*\n/, 'Keep proof.\n'), 'verify-shelf').some((m) => /Evidence folder/.test(m)));
  });

  test('placeholders lists the lines still marked TODO(verify-app)', () => {
    assert.deepEqual(placeholders('a\nTODO(verify-app): the port\nb\nx TODO(verify-app)\n'), [2, 4]);
  });
});

describe('parseArgs', () => {
  test('a folder, --evidence and --json', () => {
    assert.deepEqual(parseArgs(['dir', '--evidence', 'proof', '--json']).opts, { dir: 'dir', evidence: 'proof', json: true });
  });
  test('usage errors', () => {
    assert.ok(parseArgs(['--nope']).error);
    assert.ok(parseArgs(['--evidence']).error);
    assert.ok(parseArgs(['a', 'b']).error);
  });
});

describe('Markdown details', () => {
  test('a fence closes only on a bare fence of the same character, at least as long', () => {
    // Gotchas comes before States, so the replacement goes where Gotchas was.
    const body = (inner) => FEATURE.replace(GOTCHAS, `${inner}\n`);
    // Each code block hides a "## Gotchas", so the heading must still be missing.
    for (const inner of ['```\n~~~\n## Gotchas\n```', '````\n```\n## Gotchas\n````', '```\n```sh\n## Gotchas\n```']) {
      assert.ok(checkFeature(body(inner)).some((m) => /missing.*Gotchas/.test(m)), inner);
    }
    // A longer closing fence closes, so the heading after it counts.
    assert.deepEqual(checkFeature(body('```\nx\n````\n\n## Gotchas\n\n- y\n')), []);
  });

  test('a file with CRLF line endings and a code block is read like one with LF', () => {
    const text = FEATURE.replace('- Titles are trimmed.\n', '```\ncode\n```\n\n- Titles are trimmed.\n').replace(/\n/g, '\r\n');
    assert.deepEqual(checkFeature(text), []);
  });

  test('Setext headings count', () => {
    const text = FEATURE.replace('# Add a bookmark\n', 'Add a bookmark\n==============\n').replace('## Gotchas\n', 'Gotchas\n-------\n');
    assert.deepEqual(checkFeature(text), []);
    assert.deepEqual(headings('Title\n=====\n\ntext\n\nSub\n---\n').map((h) => [h.level, h.text]), [[1, 'Title'], [2, 'Sub']]);
  });

  test('a "---" after a blank line or a list item is a rule, not a heading', () => {
    assert.deepEqual(headings('text\n\n---\n- item\n---\n'), []);
  });

  test('a third-level heading inside a section is part of the section', () => {
    const text = FEATURE.replace("- `add-ok` saves a link.\n", '### Saving\n\n- `add-ok` saves a link.\n');
    assert.deepEqual(checkFeature(text), []);
  });

  test('frontmatter with a byte order mark or trailing spaces on its fences is read', () => {
    assert.equal(parseFrontmatter(`\uFEFF${SKILL}`).name, 'verify-shelf');
    assert.equal(parseFrontmatter(SKILL.replace('---\n', '---  \n').replace('\n---\n', '\n--- \n')).name, 'verify-shelf');
    assert.equal(parseFrontmatter(SKILL.replace(/\n/g, '\r\n')).name, 'verify-shelf');
  });

  test('a file saved with a byte order mark, as some Windows editors do, is read like one without', () => {
    assert.deepEqual(checkFeature(`\uFEFF${FEATURE}`), []);
    assert.deepEqual(checkSkill(`\uFEFF${SKILL}`, 'verify-shelf'), []);
    assert.deepEqual(headings('\uFEFF# T\n\n## A\n').map((h) => [h.level, h.text]), [[1, 'T'], [2, 'A']]);
    // The frontmatter after the mark is still frontmatter, not text over a Setext underline.
    assert.deepEqual(headings('\uFEFF---\nname: x\n---\n# T\n').map((h) => [h.level, h.text]), [[1, 'T']]);
  });
});

describe('index links, more forms', () => {
  test('angle brackets, single-quoted titles, reference definitions and percent escapes', () => {
    const text = "- [My](<my feature.md>)\n- [Add](add.md 'Add')\n- [Pay](billing/pay.md \"Pay\")\n- [Sp](two%20words.md)\n\n[ref]: ref.md\n[url]: https://example.com/x.md\n";
    assert.deepEqual(indexLinks(text), ['my feature.md', 'add.md', 'billing/pay.md', 'two words.md', 'ref.md']);
  });

  test('a malformed percent escape does not throw', () => {
    assert.deepEqual(indexLinks('- [x](100%.md)\n'), ['100%.md']);
  });
});

describe('the generated SKILL.md, fill spots', () => {
  test('a leftover template token is reported', () => {
    for (const tok of ['<app>', '<surface>', '<harness>']) {
      const p = checkSkill(SKILL.replace('# Verify Shelf', `# Verify ${tok}`), 'verify-shelf');
      assert.ok(p.some((m) => m.includes(tok)), tok);
    }
  });

  test('a required section with nothing under it is reported', () => {
    const empty = checkSkill(SKILL.replace("Run `curl -sS \"$URL/bookmarks\"`.\n", ''), 'verify-shelf');
    assert.ok(empty.some((m) => /Drive.*empty/.test(m)), empty.join('; '));
  });

  test('Launch, Doctor and Cleanup need a command in a code block, not only prose', () => {
    for (const s of ['Launch', 'Doctor', 'Cleanup']) {
      const re = new RegExp(`(## ${s}\\n\\n)\`\`\`bash\\n[^\`]*\`\`\`\\n`);
      const text = SKILL.replace(re, '$1Do the usual thing.\n');
      assert.notEqual(text, SKILL, s);
      assert.ok(checkSkill(text, 'verify-shelf').some((m) => m.includes(s) && /command/.test(m)), s);
    }
  });

  test('an empty code block is not a command', () => {
    const text = SKILL.replace('```bash\nkill "$PID"\n```', '```bash\n\n```');
    assert.ok(checkSkill(text, 'verify-shelf').some((m) => /Cleanup.*command/.test(m)));
  });
});

describe('featureFiles', () => {
  test('lists .md files in subfolders as relative paths and skips folders, even one named like a file', () => {
    const d = tempDir('verify-app-ff-');
    mkdirSync(join(d, 'billing'));
    mkdirSync(join(d, 'old.md'));
    writeFileSync(join(d, 'README.md'), '#');
    writeFileSync(join(d, 'add.md'), '#');
    writeFileSync(join(d, 'billing', 'pay.md'), '#');
    writeFileSync(join(d, 'old.md', 'inner.md'), '#');
    writeFileSync(join(d, 'notes.txt'), 'x');
    assert.deepEqual(featureFiles(d), ['README.md', 'add.md', 'billing/pay.md', 'old.md/inner.md']);
  });
});
