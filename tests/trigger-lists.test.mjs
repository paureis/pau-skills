// The request lists for skill-eval's trigger mode (docs/backlog/q16.md): evals/triggers/requests/<skill>.json, one per
// model-invoked skill, with 3 requests that should start it and 2 near misses that should start another model-invoked
// skill or none. Request 1 is the phrase quoted after "Use when" in the description; no other request may copy a
// quoted phrase. A typed-only skill (tests/typed-only-list.mjs, decision 32) starts only when typed, so no request can
// start it: it has no list, and no near miss expects it. No model runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'node:path';
import { ROOT } from './helpers.mjs';
import { TYPED_ONLY } from './typed-only-list.mjs';
import { norm, DASHES, quoteMarks, holds, sameKeys, brokenShape, readLists, readSkills } from './trigger-lists.helpers.mjs';

// The skills that can start from a request. A new typed-only skill changes this file nowhere.
const MODEL_INVOKED_COUNT = 32;
const REQUESTS_DIR = join(ROOT, 'evals', 'triggers', 'requests');
// The lists here use bare skill names; the typed-only list holds <plugin>/<skill> ids.
const TYPED_NAMES = new Set(TYPED_ONLY.map((id) => id.split('/')[1]));

// A quote right after a letter or digit cannot open a phrase, one right before cannot close it, so "the user's" holds
// no quote. Read it only with matchAll: a global regex keeps lastIndex between strings with exec or test.
const QUOTED = /(?<![\p{L}\p{N}])'([^']+)'(?![\p{L}\p{N}])/gu;
const USE = /\bUse (whenever|when|before|for|after)\b/;

const phrases = (description) => [...description.matchAll(QUOTED)].map((m) => m[1]);

// The first phrase quoted from the first "Use when" (or whenever, before, for, after) on.
function requestOne(description) {
  const at = description.search(USE);
  return at < 0 ? undefined : phrases(description.slice(at))[0];
}

// Every description here is one double-quoted frontmatter line with no quote or backslash inside; anything else is
// reported, never guessed at.
function readDescription(text) {
  const lines = text.split(/\r?\n/);
  if (lines[0] !== '---') return { why: 'has no frontmatter' };
  const end = lines.indexOf('---', 1);
  if (end < 0) return { why: 'has no end to its frontmatter' };
  const found = lines.slice(1, end).filter((l) => l.startsWith('description:'));
  if (found.length !== 1) return { why: `has ${found.length} description lines` };
  const m = found[0].match(/^description: "([^"\\]*)"$/);
  return m ? { description: m[1] } : { why: 'has a description that is not one double-quoted line' };
}

// lists: the requests folder's entries as { file, text } (text null for a folder). skills: { name, text } with the
// SKILL.md text. typed: the names of the typed-only skills. Returns a sentence per problem naming the file, the
// request and the check. No sentence quotes a description phrase: the lists' writer must not see the descriptions.
function checkLists(lists, skills, typed = TYPED_NAMES) {
  const problems = [];
  const names = new Set(skills.map((s) => s.name));

  // Check 9: every model-invoked description is read, so checks 5 and 6 never skip a skill quietly.
  const descriptions = new Map();
  for (const skill of skills) {
    if (typed.has(skill.name)) continue;
    const { description, why } = readDescription(skill.text);
    if (why) { problems.push(`skill ${skill.name}: check 9: its SKILL.md ${why}`); continue; }
    const hasOne = requestOne(description) !== undefined;
    if (!hasOne) problems.push(`skill ${skill.name}: check 9: no phrase quoted after "Use when" or the like`);
    const marks = quoteMarks(description) === 2 * phrases(description).length;
    if (!marks) problems.push(`skill ${skill.name}: check 9: a quote mark is not around a phrase`);
    if (hasOne && marks) descriptions.set(skill.name, description);
  }

  // Check 1: one <skill>.json per model-invoked skill, and nothing else: no list for a typed-only skill.
  const wanted = new Set([...names].filter((n) => !typed.has(n)).map((n) => `${n}.json`));
  const present = new Set(lists.map((l) => l.file));
  for (const file of [...wanted].sort()) if (!present.has(file)) problems.push(`${file}: check 1: missing`);

  const seen = new Map();
  for (const { file, text } of [...lists].sort((a, b) => (a.file < b.file ? -1 : 1))) {
    if (typed.has(file.replace(/\.json$/, ''))) { problems.push(`${file}: check 1: a typed-only skill has no list, since no request can start it`); continue; }
    if (!wanted.has(file) || text === null) { problems.push(`${file}: check 1: not the list of a skill`); continue; }
    const skill = file.slice(0, -'.json'.length);
    const fail = (where, n, what) => problems.push(`${file}${where && ` ${where}`}: check ${n}: ${what}`);

    // Check 2: the shape, and the text is the list written with two spaces, so no escape hides a character.
    let list;
    try { list = JSON.parse(text); } catch { fail('', 2, 'is not valid JSON'); continue; }
    const broken = brokenShape(list);
    if (broken) { fail('', 2, broken); continue; }
    if (!sameKeys(list, ['skill', 'should', 'nearMisses'])) fail('', 2, 'keys are not exactly skill, should, nearMisses');
    if (list.skill !== skill) fail('', 2, 'skill is not the file name');
    if (list.should.length !== 3) fail('', 2, `should has ${list.should.length} requests, not 3`);
    if (list.nearMisses.length !== 2) fail('', 2, `nearMisses has ${list.nearMisses.length} entries, not 2`);
    list.nearMisses.forEach((n, i) => { if (!sameKeys(n, ['request', 'expect'])) fail('', 2, `nearMisses[${i}] keys are not exactly request, expect`); });
    if (text !== `${JSON.stringify(list, null, 2)}\n`) fail('', 2, 'text is not the list written with two-space indents and a final newline');

    const requests = [...list.should.map((r, i) => [`should[${i}]`, r]), ...list.nearMisses.map((n, i) => [`nearMisses[${i}]`, n.request])];

    // Check 3: one line a user would type, not a command or a flag.
    for (const [where, request] of requests) {
      if (!request.trim()) fail(where, 3, 'is blank');
      else if (/[\r\n]/.test(request)) fail(where, 3, 'is not one line');
      else if (/^[/-]/.test(request.trimStart())) fail(where, 3, 'starts with a slash or a hyphen');
    }

    // Check 4: a near miss names the model-invoked skill that should start instead, or none.
    list.nearMisses.forEach(({ expect }, i) => {
      if (expect !== 'none' && (!names.has(expect) || typed.has(expect))) fail(`nearMisses[${i}]`, 4, 'expect is neither a model-invoked skill nor none');
      if (expect === list.skill) fail(`nearMisses[${i}]`, 4, "expect is the list's own skill");
    });

    // Checks 5 and 6 need a description that check 9 could read.
    const description = descriptions.get(skill);
    if (description !== undefined) {
      if (list.should[0] !== requestOne(description)) fail('should[0]', 5, 'is not the request-1 phrase');
      const quoted = phrases(description).map(norm);
      let i = 0;
      for (const request of [...list.should.slice(1), ...list.nearMisses.map((n) => n.request)]) {
        i += 1;
        const where = i < list.should.length ? `should[${i}]` : `nearMisses[${i - list.should.length}]`;
        const copied = quoted.flatMap((p, k) => (holds(norm(request), p) ? [k + 1] : []));
        if (copied.length) fail(where, 6, `holds quoted phrase ${copied.join(', ')} of the description`);
      }
    }

    // Check 7: no en or em dash in the text or in what it parses to.
    const dashed = requests.filter(([, r]) => DASHES.some((d) => r.includes(d)));
    for (const [where] of dashed) fail(where, 7, 'holds an en or em dash');
    if (!dashed.length && DASHES.some((d) => text.includes(d) || JSON.stringify(list).includes(d))) fail('', 7, 'holds an en or em dash');

    // Check 8: no request twice across all lists.
    for (const [where, request] of requests) {
      const key = norm(request);
      if (seen.has(key)) fail(where, 8, `repeats ${seen.get(key)}`);
      else seen.set(key, `${file} ${where}`);
    }
  }
  return problems;
}

// The real data: every entry in the requests folder, and every skills/<plugin>/<skill>/ that holds a SKILL.md.
const REPO_SKILLS = readSkills(ROOT);
const REPO = checkLists(readLists(REQUESTS_DIR), REPO_SKILLS);
const only = (...checks) => REPO.filter((p) => checks.some((n) => p.includes(`: check ${n}: `)));

test(`there are ${MODEL_INVOKED_COUNT} model-invoked skills and every one's description is read, with its request-1 phrase`, () => {
  assert.equal(REPO_SKILLS.filter((s) => !TYPED_NAMES.has(s.name)).length, MODEL_INVOKED_COUNT);
  assert.deepEqual(only(9), []);
});

test('the requests folder holds one list per model-invoked skill and nothing else', () => assert.deepEqual(only(1), []));

test('every list has its shape, and every request is one line that is not a command', () => assert.deepEqual(only(2, 3), []));

test('every near miss names a model-invoked skill or none, never its own skill', () => assert.deepEqual(only(4), []));

test('request 1 is the request-1 phrase, and no other request copies a quoted phrase', () => assert.deepEqual(only(5, 6), []));

test('no list holds a dash, no request appears twice, and nothing else is wrong', () => {
  assert.deepEqual(only(7, 8), []);
  assert.deepEqual(REPO, []);
});

// Fixtures: three model-invoked skills and a typed-only one, delta, with no list. The apostrophes in "the user's" and
// "the agent's" are not quotes.
const ALPHA = "Plans the user's work in small steps. Use when the user says 'plan it', 'land it' or 'map the steps', or when the agent's plan is unclear.";
const BETA = "Checks a build. Use for 'check the build' or 'run checks'.";
const GAMMA = "Writes notes. Use after 'write it down'.";
const DELTA = 'Closes the day in a fixed order.';
const TYPED = new Set(['delta']);
const skillMd = (name, description) => `---\nname: ${name}\ndescription: "${description}"\n---\n\n# ${name}\n`;
const SKILLS = [['alpha', ALPHA], ['beta', BETA], ['gamma', GAMMA], ['delta', DELTA]].map(([name, d]) => ({ name, text: skillMd(name, d) }));
const makeList = (skill, should, [a, b], [c, d]) => ({ skill, should, nearMisses: [{ request: a, expect: b }, { request: c, expect: d }] });
const GOOD = {
  alpha: makeList('alpha', ['plan it', 'Break the migration into a short ordered list', 'The release has many moving parts and I keep losing track'],
    ['Compile the project on main and tell me if it breaks', 'beta'], ['What time is it in Tokyo', 'none']),
  beta: makeList('beta', ['check the build', 'Compile everything and report any errors', 'My pipeline went red after the last merge'],
    ['Order the work for the next sprint', 'alpha'], ['Tell me a joke about cats', 'none']),
  gamma: makeList('gamma', ['write it down', 'Record what we decided today in a file', 'We keep forgetting why we chose the queue'],
    ['Build the docs site and look for broken links', 'beta'], ['Translate this sentence to French', 'none']),
};
const asFile = (l, file) => ({ file, text: `${JSON.stringify(l, null, 2)}\n` });

// The checks on the good fixture after `edit` changed the parsed lists and `editFiles` the files.
function run(edit = () => {}, { editFiles = (files) => files, skills = SKILLS, typed = TYPED } = {}) {
  const lists = structuredClone(GOOD);
  edit(lists);
  return checkLists(editFiles(Object.entries(lists).map(([name, l]) => asFile(l, `${name}.json`))), skills, typed);
}

// Exactly one problem, from check n, naming `where`.
function one(problems, n, where) {
  assert.equal(problems.length, 1, `expected one check ${n} problem, got:\n${problems.join('\n')}`);
  assert.ok(problems[0].startsWith(`${where}: check ${n}: `), problems[0]);
  return problems[0];
}

test('a typed-only skill needs no list, may have none, and no near miss may expect it', () => {
  assert.deepEqual(run(), [], 'delta has no list and no request-1 phrase, and that is fine');
  const listed = run(() => {}, { editFiles: (f) => [...f, asFile({ ...GOOD.gamma, skill: 'delta' }, 'delta.json')] });
  assert.match(one(listed, 1, 'delta.json'), /typed-only/);
  one(run((l) => { l.alpha.nearMisses[1].expect = 'delta'; }), 4, 'alpha.json nearMisses[1]');
  // The same skill when it is model-invoked: its list is missing and its description has no request-1 phrase.
  assert.deepEqual(run(() => {}, { typed: new Set() }).map((p) => p.split(': ').slice(0, 2).join(': ')),
    ['skill delta: check 9', 'delta.json: check 1']);
});

test('the good fixture has no problem, and a phrase inside a longer word is not a copy', () => {
  assert.deepEqual(run(), []);
  assert.deepEqual(run((l) => { l.alpha.should[1] = 'Sort the island items by size'; }), []);
  assert.deepEqual(run((l) => { l.alpha.nearMisses[1].request = 'Print the floorplan items'; }), []);
});

test('phrase extraction reads quoted phrases, never apostrophes, and request 1 comes after "Use"', () => {
  assert.deepEqual(phrases(ALPHA), ['plan it', 'land it', 'map the steps']);
  assert.deepEqual(phrases(ALPHA), ['plan it', 'land it', 'map the steps'], 'a second read gives the same');
  assert.equal(requestOne(ALPHA), 'plan it');
  assert.equal(requestOne(BETA), 'check the build');
  assert.equal(requestOne("Says 'hello' first. Use when the user says 'bye'."), 'bye');
  assert.equal(requestOne("Use whenever 'a' happens."), 'a');
  assert.equal(requestOne("Says 'hello' and nothing else."), undefined);
  assert.deepEqual(phrases("Built in the '90s. Use when the user says 'go'."), ['go']);
});

test('check 1 catches a missing list, a list for no skill and any other entry', () => {
  one(run((l) => { delete l.gamma; }), 1, 'gamma.json');
  one(run(() => {}, { editFiles: (f) => [...f, { file: 'notes.txt', text: 'hello' }] }), 1, 'notes.txt');
  one(run(() => {}, { editFiles: (f) => [...f, asFile({ ...GOOD.gamma, skill: 'zeta' }, 'zeta.json')] }), 1, 'zeta.json');
  one(run(() => {}, { editFiles: (f) => [...f, { file: 'old', text: null }] }), 1, 'old');
});

test('check 2 catches a list that does not parse or has the wrong shape', () => {
  const rewrite = (fn) => ({ editFiles: (f) => f.map((x) => (x.file === 'beta.json' ? { ...x, text: fn(x.text) } : x)) });
  one(run(() => {}, rewrite(() => '{\n')), 2, 'beta.json');
  one(run((l) => { l.beta.notes = 'extra'; }), 2, 'beta.json');
  one(run((l) => { l.beta.skill = 'Beta'; }), 2, 'beta.json');
  one(run((l) => { l.beta.should.pop(); }), 2, 'beta.json');
  one(run((l) => { l.beta.should.push('Make sure the release is green'); }), 2, 'beta.json');
  one(run((l) => { l.beta.nearMisses.pop(); }), 2, 'beta.json');
  one(run((l) => { l.beta.nearMisses[0].why = 'planning'; }), 2, 'beta.json');
  one(run((l) => { delete l.beta.nearMisses[0].expect; }), 2, 'beta.json');
  one(run((l) => { l.beta.should[2] = 42; }), 2, 'beta.json');
  one(run((l) => { l.beta.nearMisses = 'none'; }), 2, 'beta.json');
  one(run((l) => { l.beta = ['check the build']; }), 2, 'beta.json');
  // The text must be the list written back with two spaces, so an escape cannot hide a character.
  one(run(() => {}, rewrite((t) => `${JSON.stringify(JSON.parse(t))}\n`)), 2, 'beta.json');
  one(run(() => {}, rewrite((t) => t.trimEnd())), 2, 'beta.json');
  one(run(() => {}, rewrite((t) => t.replace('Compile everything', 'Compil\\u0065 everything'))), 2, 'beta.json');
  const escaped = run(() => {}, rewrite((t) => t.replace('Compile everything', 'Compile \\u2014 everything')));
  assert.deepEqual(escaped.map((p) => p.split(': ').slice(0, 2).join(': ')), ['beta.json: check 2', 'beta.json should[1]: check 7']);
});

test('check 3 catches a blank request, a line break and a request that reads as a command', () => {
  one(run((l) => { l.gamma.should[1] = ''; }), 3, 'gamma.json should[1]');
  one(run((l) => { l.gamma.should[2] = '   '; }), 3, 'gamma.json should[2]');
  one(run((l) => { l.gamma.nearMisses[0].request = 'Build the docs\nand look for broken links'; }), 3, 'gamma.json nearMisses[0]');
  one(run((l) => { l.gamma.nearMisses[1].request = 'Translate this\rto French'; }), 3, 'gamma.json nearMisses[1]');
  one(run((l) => { l.gamma.should[1] = '/record what we decided'; }), 3, 'gamma.json should[1]');
  one(run((l) => { l.gamma.should[1] = '-v record what we decided'; }), 3, 'gamma.json should[1]');
});

test('check 4 catches a near miss that names no skill or the list\'s own skill', () => {
  one(run((l) => { l.alpha.nearMisses[1].expect = 'nobody'; }), 4, 'alpha.json nearMisses[1]');
  one(run((l) => { l.alpha.nearMisses[0].expect = 'alpha'; }), 4, 'alpha.json nearMisses[0]');
  one(run((l) => { l.gamma.nearMisses[1].expect = 'None'; }), 4, 'gamma.json nearMisses[1]');
});

test('check 5 catches a request 1 that is not the request-1 phrase, even by case', () => {
  one(run((l) => { l.alpha.should[0] = 'Plan it'; }), 5, 'alpha.json should[0]');
  one(run((l) => { l.alpha.should[0] = 'land it'; }), 5, 'alpha.json should[0]');
  one(run((l) => { l.beta.should[0] = 'check the build please'; }), 5, 'beta.json should[0]');
});

test('check 6 catches a quoted phrase in any request but the first, whatever the case and spacing', () => {
  one(run((l) => { l.alpha.should[1] = 'Can you PLAN  it for the team'; }), 6, 'alpha.json should[1]');
  one(run((l) => { l.alpha.should[1] = 'Can you plan\tit for the team'; }), 6, 'alpha.json should[1]');
  one(run((l) => { l.alpha.should[2] = 'Please map the steps before we start'; }), 6, 'alpha.json should[2]');
  one(run((l) => { l.alpha.nearMisses[0].request = 'Land it on main for the beta team'; }), 6, 'alpha.json nearMisses[0]');
  one(run((l) => { l.beta.nearMisses[1].request = 'Run checks on the cat jokes'; }), 6, 'beta.json nearMisses[1]');
});

test('check 7 catches an en dash and an em dash, each on its own', () => {
  one(run((l) => { l.alpha.should[1] = `Break the migration ${String.fromCharCode(8211)} into a list`; }), 7, 'alpha.json should[1]');
  one(run((l) => { l.beta.should[2] = `My pipeline went red ${String.fromCharCode(8212)} after the merge`; }), 7, 'beta.json should[2]');
});

test('check 8 catches a request repeated in another list, whatever the case and spacing', () => {
  one(run((l) => { l.gamma.should[2] = '  ORDER the   work FOR the next\tsprint '; }), 8, 'gamma.json should[2]');
});

test('check 9 names a skill whose description cannot be read or has no request-1 phrase', () => {
  const gamma = (text) => ({ skills: [SKILLS[0], SKILLS[1], { name: 'gamma', text }] });
  one(run(() => {}, gamma('---\nname: gamma\ndescription: plain\n---\n')), 9, 'skill gamma');
  one(run(() => {}, gamma(`---\ndescription: '${GAMMA.replaceAll("'", "''")}'\n---\n`)), 9, 'skill gamma');
  one(run(() => {}, gamma(`---\ndescription: >\n  ${GAMMA}\n---\n`)), 9, 'skill gamma');
  one(run(() => {}, gamma('---\nname: gamma\n---\n')), 9, 'skill gamma');
  one(run(() => {}, gamma(`# gamma\n\ndescription: "${GAMMA}"\n`)), 9, 'skill gamma');
  one(run(() => {}, gamma(skillMd('gamma', "Writes notes for 'write it down'."))), 9, 'skill gamma');
  one(run(() => {}, gamma(skillMd('gamma', 'Writes notes. Use after the user is done.'))), 9, 'skill gamma');
  // A phrase that holds an apostrophe is not read; the count of quote marks gives it away.
  one(run(() => {}, gamma(skillMd('gamma', "Writes notes. Use after 'write it down' or 'don't lose it'."))), 9, 'skill gamma');
});
