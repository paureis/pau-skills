// Four rules for every SKILL.md description, once checked by hand (docs/backlog/q18.md says why each one exists).
// Rule 1: every character of a description is printable ASCII, U+0020 to U+007E (docs/backlog/q19.md). That keeps
// out curly and other quote marks, which slip past the request 1 check and the copied wording check in
// tests/trigger-lists.test.mjs (those read only the ASCII apostrophe), other question marks such as the fullwidth one,
// and quote ornaments.
// Rule 2: no backtick. A description is never a place for code, and tests/standalone.test.mjs lets a backticked
// skill name pass when the text says it is installed.
// Rule 3: on a model-invoked skill, exactly one "Use ..." opener, read as tests/trigger-lists.test.mjs reads it. A
// second opener placed earlier would become the one the request 1 check reads. On a typed-only skill
// (tests/typed-only-list.mjs, decision 32), no opener and no quoted phrase: no request in words can start it, so its
// description is one sentence for the / menu.
// Rule 4: on a skill in the confirm list (tests/confirm-list.mjs), no quoted phrase holds a question mark or has one
// right after it: a question is written as a situation ("Policy since Q28" in docs/backlog/context-budget.md). With
// rule 1 in place, no question mark but the ASCII one can reach a description, so rule 4 reads only the ASCII one.
// A description the reader cannot read is a problem that names the skill, never a skip. No message holds text from a
// description: a message names the skill, the rule and, for rule 4, the phrase by its number. The long rule 1 fixtures
// are in tests/description-rules-ascii.test.mjs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ROOT, tempDir } from './helpers.mjs';
import { CONFIRM_LIST } from './confirm-list.mjs';
import { TYPED_ONLY } from './typed-only-list.mjs';
import { ch, rule1, expectProblems } from './description-rules.helpers.mjs';

// These three are the same as in tests/trigger-lists.test.mjs, source and flags (test 11 compares them). Read QUOTED
// only with matchAll: a global regex keeps lastIndex between strings with exec or test.
const DESCRIPTION_LINE = /^description: "([^"\\]*)"$/;
const USE = /\bUse (whenever|when|before|for|after)\b/;
const QUOTED = /(?<![\p{L}\p{N}])'([^']+)'(?![\p{L}\p{N}])/gu;

const SKILL_COUNT = 39;

const BACKTICK = String.fromCharCode(0x60);
const USE_ALL = new RegExp(USE.source, `${USE.flags}g`);

// Reads one skill's description. text is the SKILL.md text, or null when the folder has none.
function readDescription(id, text) {
  const fail = (why) => ({ problem: `${id}: read: ${why}` });
  if (text === null) return fail('the folder has no SKILL.md');
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return fail('its SKILL.md has no frontmatter');
  const end = lines.indexOf('---', 1);
  if (end < 0) return fail('its SKILL.md has no end to its frontmatter');
  const found = lines.slice(1, end).filter((l) => l.startsWith('description:'));
  if (found.length !== 1) return fail(`its SKILL.md has ${found.length} description lines, not 1`);
  const m = found[0].match(DESCRIPTION_LINE);
  return m ? { description: m[1] } : fail('its description is not one double-quoted line with no backslash or double quote inside');
}

// entries: { id, text } per skill folder. Returns the read skills and a problem per skill that could not be read.
function readAll(entries) {
  const skills = [];
  const problems = [];
  for (const { id, text } of entries) {
    const { description, problem } = readDescription(id, text);
    if (problem) problems.push(problem);
    else skills.push({ id, description });
  }
  return { skills, problems };
}

// Every folder under skills/<plugin>/, as <plugin>/<skill>. A folder without a SKILL.md is kept, with text null.
function walk(root) {
  const entries = [];
  const dirs = (dir) => readdirSync(dir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  for (const plugin of dirs(join(root, 'skills'))) {
    for (const skill of dirs(join(root, 'skills', plugin))) {
      const file = join(root, 'skills', plugin, skill, 'SKILL.md');
      entries.push({ id: `${plugin}/${skill}`, text: existsSync(file) ? readFileSync(file, 'utf8') : null });
    }
  }
  return entries;
}

const readSkills = (root = ROOT) => readAll(walk(root));

// Each check takes the read skills ({ id, description }) and returns a problem per skill, at most one per rule, so the
// same code runs on the repository and on the fixtures below. Rules 3 and 4 also take a list of skill ids.
const checks = {
  rule1,
  rule2: (skills) => skills.flatMap(({ id, description }) => {
    const ticks = description.split(BACKTICK).length - 1;
    return ticks > 0 ? [`${id}: rule 2: holds ${ticks} backtick(s); a description is never a place for code`] : [];
  }),
  // typed: the typed-only list.
  rule3: (skills, typed) => skills.flatMap(({ id, description }) => {
    const n = [...description.matchAll(USE_ALL)].length;
    if (!typed.includes(id)) return n === 1 ? [] : [`${id}: rule 3: has ${n} "Use when" (or whenever, before, for, after) openers, not exactly 1`];
    const q = [...description.matchAll(QUOTED)].length;
    return n + q === 0 ? [] : [`${id}: rule 3: typed only, but has ${n} "Use when" (or the like) openers and ${q} quoted phrases, not 0 and 0`];
  }),
  // A phrase with an apostrophe inside is not read here: check 9 of tests/trigger-lists.test.mjs fails on it.
  rule4: (skills, list) => skills.flatMap(({ id, description }) => {
    if (!list.includes(id)) return [];
    const bad = [];
    [...description.matchAll(QUOTED)].forEach((m, i) => {
      if (m[1].includes('?') || description[m.index + m[0].length] === '?') bad.push(i + 1);
    });
    if (!bad.length) return [];
    const what = bad.length === 1 ? `phrase ${bad[0]} holds a question mark or has one right after it`
      : `phrases ${bad.slice(0, -1).join(', ')} and ${bad.at(-1)} hold a question mark or have one right after them`;
    return [`${id}: rule 4: quoted ${what}; on a confirm-list skill a question is written as a situation`];
  }),
};

const REPO = readSkills();
const ids = () => REPO.skills.map((s) => s.id);

test('every SKILL.md description is read: one double-quoted line with no backslash or double quote inside', () => {
  assert.ok(REPO.skills.length + REPO.problems.length >= SKILL_COUNT, `found ${REPO.skills.length + REPO.problems.length} skills`);
  assert.deepEqual(REPO.problems, []);
});

test('rule 1: every description is printable ASCII only (U+0020 to U+007E)', () => {
  assert.deepEqual(checks.rule1(REPO.skills), []);
});

test('rule 2: no description holds a backtick', () => {
  assert.deepEqual(checks.rule2(REPO.skills), []);
});

test('rule 3: every model-invoked description has exactly one "Use ..." opener, and a typed-only one none and no quoted phrase', () => {
  assert.deepEqual(checks.rule3(REPO.skills, TYPED_ONLY), []);
});

test('rule 4: no quoted phrase on a confirm-list skill holds a question mark or has one right after it', () => {
  assert.ok(CONFIRM_LIST.length > 0, 'the confirm list is empty');
  assert.deepEqual(CONFIRM_LIST.filter((id) => !ids().includes(id)), [], 'every id on the confirm list is a skill');
  assert.deepEqual(checks.rule4(REPO.skills, CONFIRM_LIST), []);
});

const GOOD = "Checks the file. Use when the user says 'check this file'.";
const skillMd = (front, body = '\nBody.\n') => `---\nname: s\n${front}\n---\n${body}`;

test('the reader names a skill whose description it cannot read, and never skips it', () => {
  const unread = {
    'a plain unquoted value': skillMd(`description: ${GOOD}`),
    'a single-quoted value': skillMd(`description: '${GOOD.replaceAll("'", "''")}'`),
    'a > block': skillMd(`description: >\n  ${GOOD}`),
    // A later --- line, so only the check on line 1 can reject these three.
    'no frontmatter': `title\ndescription: "${GOOD}"\n---\n\nBody.\n`,
    'a first line of four dashes': `----\nname: s\ndescription: "${GOOD}"\n---\n\nBody.\n`,
    'a first line with text after the dashes': `--- x\nname: s\ndescription: "${GOOD}"\n---\n\nBody.\n`,
    'a frontmatter never closed': `---\nname: s\ndescription: "${GOOD}"\n\nBody.\n`,
    'two description lines': skillMd(`description: "${GOOD}"\ndescription: "${GOOD}"`),
    'no description line': skillMd('name2: s', `\n${GOOD}\n`),
    'a backslash inside': skillMd(`description: "Checks it. Use when the user says ${ch(92)}u2019check this file${ch(92)}u2019 or 'check the file'."`),
    'an escaped double quote inside': skillMd(`description: "Checks ${ch(92)}"it${ch(92)}". Use when the user says 'check this file'."`),
  };
  for (const [name, text] of Object.entries(unread)) {
    const { skills, problems } = readAll([{ id: 'f/x', text }]);
    expectProblems(problems, 1, 'f/x: read: ', text);
    assert.deepEqual(skills, [], name);
  }
  const none = readAll([{ id: 'f/x', text: null }]);
  expectProblems(none.problems, 1, 'f/x: read: ');
  assert.deepEqual(none.skills, []);

  // A good description is read, and the frontmatter ends at the first --- after line 1, not the last.
  for (const text of [skillMd(`description: "${GOOD}"`), skillMd(`description: "${GOOD}"`, '\nBody.\n\ndescription: "Other."\n\n---\n\nMore.\n')]) {
    const { skills, problems } = readAll([{ id: 'f/x', text }]);
    expectProblems(problems, 0, '', text);
    assert.deepEqual(skills, [{ id: 'f/x', description: GOOD }]);
  }
  // A value that starts and ends with a space is read whole, never trimmed.
  const spaced = readAll([{ id: 'f/x', text: skillMd(`description: " ${GOOD} "`) }]);
  expectProblems(spaced.problems, 0, '', GOOD);
  assert.deepEqual(spaced.skills, [{ id: 'f/x', description: ` ${GOOD} ` }]);

  // The walk keeps a skill folder without a SKILL.md and passes over a file.
  const root = tempDir();
  mkdirSync(join(root, 'skills', 'p', 's'), { recursive: true });
  mkdirSync(join(root, 'skills', 'p', 't'), { recursive: true });
  writeFileSync(join(root, 'skills', 'p', 't', 'SKILL.md'), skillMd(`description: "${GOOD}"`));
  writeFileSync(join(root, 'skills', 'p', 'README.md'), '# Plugin p\n');
  const tree = readSkills(root);
  expectProblems(tree.problems, 1, 'p/s: read: ');
  assert.deepEqual(tree.skills.map((s) => s.id), ['p/t']);
});

test('rule 1 through the reader: a quoted value that starts with a tab is read whole and flagged', () => {
  const tabbed = readAll([{ id: 'a/b', text: skillMd(`description: "${ch(9)}${GOOD}"`) }]);
  assert.deepEqual(tabbed.problems, []);
  const [p] = expectProblems(checks.rule1(tabbed.skills), 1, 'a/b: rule 1: ', GOOD);
  assert.equal(p, 'a/b: rule 1: holds U+0009; a description is printable ASCII only (U+0020 to U+007E)');
});

test('rule 2 catches a lone backtick and a pair', () => {
  const tick = ch(0x60);
  for (const description of [`Runs ${tick}make${tick} for you. Use when the user says 'run the build'.`,
    `Runs ${tick}make for you. Use when the user says 'run the build'.`,
    `${tick}Runs make for you. Use when the user says 'run the build'.`,
    `Runs make for you. Use when the user says 'run the build'.${tick}`]) {
    expectProblems(checks.rule2([{ id: 'a/b', description }]), 1, 'a/b: rule 2: ', description);
  }
  for (const description of ["Runs the user's build. Use when the user says 'run the build'.",
    `Runs the build${ch(0xb4)}. Use when the user says 'run the build'.`]) {
    expectProblems(checks.rule2([{ id: 'a/b', description }]), 0, '', description);
  }
});

test('rule 3 catches no opener and a second one, and passes each form alone and "Use it when"', () => {
  const said = " the user says 'write the spec'.";
  for (const description of [`Writes a spec. Start when${said}`, `Writes a spec. Use for a plan. Use when${said}`,
    `Writes a spec. Use when it helps. Use when${said}`, `Writes a spec. Use for a plan. Use after a talk. Use when${said}`]) {
    expectProblems(checks.rule3([{ id: 'a/b', description }], []), 1, 'a/b: rule 3: ', description);
  }
  for (const form of ['when', 'whenever', 'before', 'for', 'after']) {
    const description = `Writes a spec. Use ${form}${said}`;
    expectProblems(checks.rule3([{ id: 'a/b', description }], []), 0, '', description);
  }
  // Near cases, each with one real opener.
  for (const description of [`Writes a spec. Use it when stuck. Use when${said}`, `Writes a spec, Used for plans. Use when${said}`,
    `Writes a spec. Use when${said} Also use for a plan.`]) {
    expectProblems(checks.rule3([{ id: 'a/b', description }], ['c/d']), 0, '', description);
  }
});

test('rule 3 on a typed-only skill catches an opener or a quoted phrase, and passes a plain sentence', () => {
  const typed = ['a/typed'];
  for (const description of ["Writes a spec. Use when the user says 'write the spec'.", 'Writes a spec. Use for a plan.',
    "Writes the spec for 'the plan' in a file.", "Writes a spec. Use after 'a talk'. Use when done."]) {
    expectProblems(checks.rule3([{ id: 'a/typed', description }], typed), 1, 'a/typed: rule 3: ', description);
  }
  for (const description of ["Writes the user's spec from a decided talk: goals, slices and the checks for each.",
    'Writes a spec. Use it when stuck.']) {
    expectProblems(checks.rule3([{ id: 'a/typed', description }], typed), 0, '', description);
    // The same sentence on a model-invoked skill has no opener.
    expectProblems(checks.rule3([{ id: 'a/other', description }], typed), 1, 'a/other: rule 3: ', description);
  }
});

test('rule 4 catches a question mark in or right after a quoted phrase on a listed skill, and nothing else', () => {
  const list = ['a/listed'];
  // The bad phrase is phrase 2 (never the first), except in the last case, which checks that phrase 1 is read too.
  for (const [k, description] of [[2, "Checks work. Use when the user says 'check the work' or 'is it ready?'."],
    [2, "Checks work. Use when the user says 'check the work' or 'is it ready'? today."],
    [2, "Checks work. Use when the user says 'check the work' or 'is it? then go'."],
    [2, "Checks work. Use when the user says 'check the work' or '?ready'."],
    [1, "Checks work. Use when the user says 'is it ready?' or 'check the work'."]]) {
    const [p] = expectProblems(checks.rule4([{ id: 'a/listed', description }], list), 1, 'a/listed: rule 4: ', description);
    assert.match(p, new RegExp(`\\bphrase ${k}\\b`), `${JSON.stringify(p)} names phrase ${k}`);
    assert.ok(!p.includes('is it ready'));
  }
  const two = "Checks work. Use when the user says 'check the work', 'is it ready?' or 'is it done'?.";
  const [p] = expectProblems(checks.rule4([{ id: 'a/listed', description: two }], list), 1, 'a/listed: rule 4: ', two);
  assert.match(p, /\bphrases 2 and 3\b/, `${JSON.stringify(p)} names phrases 2 and 3`);

  const outside = "Ready? Use when the user says 'check it'.";
  expectProblems(checks.rule4([{ id: 'a/listed', description: outside }], list), 0, '', outside);
  const off = "Checks work. Use when the user says 'check the work' or 'is it ready?'.";
  expectProblems(checks.rule4([{ id: 'b/other', description: off }], list), 0, '', off);
  // Off the list in the same plugin as a listed skill: the list holds whole ids.
  expectProblems(checks.rule4([{ id: 'a/other', description: off }], list), 0, '', off);
});

test('the reader and the opener and phrase patterns are the same as in tests/trigger-lists.test.mjs', () => {
  const text = readFileSync(join(ROOT, 'tests', 'trigger-lists.test.mjs'), 'utf8');
  for (const [name, re] of Object.entries({ DESCRIPTION_LINE, USE, QUOTED })) {
    const needle = `/${re.source}/${re.flags}`;
    let same = false;
    for (let at = text.indexOf(needle); at >= 0 && !same; at = text.indexOf(needle, at + 1)) {
      const next = text[at + needle.length];
      same = next !== undefined && !/[A-Za-z]/.test(next);
    }
    assert.ok(same, `${name} is written ${needle} in tests/trigger-lists.test.mjs`);
  }
});
