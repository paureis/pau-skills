// The typed-only skills (tests/typed-only-list.mjs, decision 32 in docs/backlog/decisions.md) start only when the user
// types them: a request in words, the agent, a subagent and other skills cannot start one. So:
// - every id on the list is a skill, and none is on the confirm list (it cannot start on its own, so it has no yes to
//   ask for);
// - no skill starts a typed-only skill: a paragraph of a skill's Markdown that names a typed-only skill X as `X` also
//   holds `/X`, the name the user can type. A paragraph that holds only `/X` is fine. The router (which-skill) and X's
//   own folder are not read, except a folder in it that is installed apart (APART below);
// - the README ("What loads on its own") and which-skill ("Skills you type") name exactly the skills on the list.
// What the start check cannot catch: a mention without backticks, text in a file that is not Markdown, and a
// namespaced form such as `/pau-skills:X`, which it does not count as the typed form (write `/X` next to it).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join, relative } from 'node:path';
import { ROOT } from './helpers.mjs';
import { TYPED_ONLY } from './typed-only-list.mjs';
import { CONFIRM_LIST } from './confirm-list.mjs';

const ROUTER = 'session-discipline/which-skill';

// A file that names a typed-only skill only to run a script from that skill's folder, which runs without starting the
// skill. Each entry is the file, the skill it names, and the word the paragraph must also hold.
const EXCEPTIONS = [
  // Both say: if lean-subagent-dev is installed, run the review-scope.mjs in its folder.
  { file: 'skills/guards/rule-to-hook/MUTATION.md', name: 'lean-subagent-dev', holds: 'review-scope.mjs' },
  { file: 'skills/planning/lazy-senior/REVIEW.md', name: 'lean-subagent-dev', holds: 'review-scope.mjs' },
];

// Folders inside a typed-only skill that are installed apart from it, so they are read even for the skill's own name:
// geppetto installs each roster file as an agent of its own, which cannot start geppetto either.
const APART = { 'agent-orchestration/geppetto': ['roster/'] };

const bare = (id) => id.split('/')[1];
const tick = (s) => String.fromCharCode(0x60) + s + String.fromCharCode(0x60);

function markdownFiles(dir) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const f = join(dir, e.name);
    if (e.isDirectory()) out.push(...markdownFiles(f));
    else if (e.name.endsWith('.md')) out.push(f);
  }
  return out;
}

// Every skill folder as <plugin>/<skill>, and every Markdown file in it as { skill, file, text }, file from the root.
function readRepo(root) {
  const dirs = (p) => readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  const skills = [];
  const files = [];
  for (const plugin of dirs(join(root, 'skills'))) {
    for (const name of dirs(join(root, 'skills', plugin))) {
      const id = `${plugin}/${name}`;
      skills.push(id);
      for (const f of markdownFiles(join(root, 'skills', plugin, name))) {
        files.push({ skill: id, file: relative(root, f).split('\\').join('/'), text: readFileSync(f, 'utf8') });
      }
    }
  }
  return { skills, files };
}

// Each check returns what is wrong, so the same checks run on the repository and on the fixtures below.
const checks = {
  unknown: (skills, typed) => typed.filter((id) => !skills.includes(id)),
  confirmed: (typed, confirm) => typed.filter((id) => confirm.includes(id)),
  starts: (files, typed, exceptions = EXCEPTIONS, apart = APART) => files.flatMap(({ skill, file, text }) => {
    if (skill === ROUTER) return [];
    const out = [];
    const own = (id) => skill === id && !(apart[id] ?? []).some((sub) => file.startsWith(`skills/${id}/${sub}`));
    text.split(/\n\s*\n/).forEach((para) => {
      for (const id of typed) {
        const name = bare(id);
        if (own(id) || !para.includes(tick(name)) || para.includes(tick(`/${name}`))) continue;
        if (exceptions.some((e) => e.file === file && e.name === name && para.includes(e.holds))) continue;
        out.push(`${file}: names ${name} in backticks with no typed /${name} in the same paragraph`);
      }
    });
    return out;
  }),
};

// The skill names in backticks between start and the next end after it, like namedSkills in confirm-step.test.mjs.
function namedSkills(text, start, end, known) {
  const from = text.indexOf(start);
  const to = text.indexOf(end, from + start.length);
  assert.ok(from >= 0 && to > from, `section from ${JSON.stringify(start)} to ${JSON.stringify(end)} not found`);
  assert.equal(text.indexOf(start, from + 1), -1, `${JSON.stringify(start)} is found once`);
  const names = new Set(known.map(bare));
  return [...new Set([...text.slice(from, to).matchAll(/`([a-z0-9-]+)`/g)].map((m) => m[1]).filter((n) => names.has(n)))].sort();
}

const REPO = readRepo(ROOT);
const typedNames = () => TYPED_ONLY.map(bare).sort();

test('every typed-only id is a skill folder, and none is on the confirm list', () => {
  assert.ok(TYPED_ONLY.length > 0, 'the typed-only list is empty');
  assert.deepEqual(checks.unknown(REPO.skills, TYPED_ONLY), []);
  assert.deepEqual(checks.confirmed(TYPED_ONLY, CONFIRM_LIST), []);
});

test('no skill starts a typed-only skill: a backticked name comes with the name to type', () => {
  assert.ok(REPO.files.length > REPO.skills.length, 'the Markdown files were read');
  assert.deepEqual(checks.starts(REPO.files, TYPED_ONLY), []);
});

test('every exception is still needed: its file names the skill for the script in its folder', () => {
  for (const e of EXCEPTIONS) {
    const f = REPO.files.find((x) => x.file === e.file);
    assert.ok(f, `${e.file} exists`);
    assert.equal(checks.starts([f], TYPED_ONLY, []).length, 1, `${e.file} still names ${e.name}`);
  }
  for (const [id, subs] of Object.entries(APART)) {
    for (const sub of subs) assert.ok(REPO.files.some((f) => f.file.startsWith(`skills/${id}/${sub}`)), `skills/${id}/${sub} holds Markdown`);
  }
});

test('the README names exactly the typed-only skills in "What loads on its own", before the ask-first list', () => {
  const readme = readFileSync(join(ROOT, 'README.md'), 'utf8');
  assert.deepEqual(namedSkills(readme, '## What loads on its own', 'Some skills cost something', REPO.skills), typedNames());
});

test('which-skill names exactly the typed-only skills under "Skills you type"', () => {
  const router = readFileSync(join(ROOT, 'skills', ...ROUTER.split('/'), 'SKILL.md'), 'utf8');
  assert.deepEqual(namedSkills(router, '## Skills you type', '\n## ', REPO.skills), typedNames());
});

test('each check catches its case on fixtures and passes a good one', () => {
  const typed = ['p/closer'];
  const skills = ['p/closer', 'p/other', ROUTER];
  assert.deepEqual(checks.unknown(skills, typed), []);
  assert.deepEqual(checks.unknown(skills, [...typed, 'p/gone']), ['p/gone']);
  assert.deepEqual(checks.confirmed(typed, ['p/other']), []);
  assert.deepEqual(checks.confirmed(typed, ['p/other', 'p/closer']), ['p/closer']);

  const file = (skill, text, name = 'SKILL.md') => ({ skill, file: `skills/${skill}/${name}`, text });
  const good = [
    file('p/other', `Intro.\n\nThe user can type ${tick('/closer')} if it is installed.\n`),
    file('p/other', `Type ${tick('/closer')} or ask for ${tick('closer')}.\n`, 'MORE.md'),
    file('p/closer', `Run ${tick('closer')} again.\n`),
    file(ROUTER, `${tick('closer')} fits here.\n`),
    file('p/other', `Use ${tick('closers')} or ${tick('p/closer')}.\n`),
  ];
  assert.deepEqual(checks.starts(good, typed, []), []);
  const bad = file('p/other', `Intro.\n\nRun the ${tick('closer')} skill if it is installed.\n\nThen type ${tick('/closer')}.\n`);
  assert.deepEqual(checks.starts([bad], typed, []), [`${bad.file}: names closer in backticks with no typed /closer in the same paragraph`]);
  // An exception holds for its file, its skill and its word only.
  const script = file('p/other', `If ${tick('closer')} is installed, run the tool.mjs in its folder.\n`);
  const except = [{ file: script.file, name: 'closer', holds: 'tool.mjs' }];
  assert.deepEqual(checks.starts([script], typed, except), []);
  assert.equal(checks.starts([{ ...script, file: 'skills/p/other/X.md' }], typed, except).length, 1);
  assert.equal(checks.starts([{ ...script, text: script.text.replace('tool.mjs', 'tool') }], typed, except).length, 1);
  // A folder of the skill's own that is installed apart is read, even for the skill's own name.
  const apart = { 'p/closer': ['roster/'] };
  const agent = file('p/closer', `Then run ${tick('closer')} again.\n`, 'roster/lead.md');
  assert.deepEqual(checks.starts([agent], typed, [], apart), [`${agent.file}: names closer in backticks with no typed /closer in the same paragraph`]);
  assert.deepEqual(checks.starts([{ ...agent, file: 'skills/p/closer/rosters.md' }], typed, [], apart), []);
  assert.deepEqual(checks.starts([agent], typed, [], {}), []);

  const doc = `# T\n\n## Skills you type\n\n${tick('closer')} and ${tick('/other')} and ${tick('nope')}.\n\n## Next\n\n${tick('other')}.\n`;
  assert.deepEqual(namedSkills(doc, '## Skills you type', '\n## ', skills), ['closer']);
  assert.throws(() => namedSkills(doc, '## Missing', '\n## ', skills));
});
