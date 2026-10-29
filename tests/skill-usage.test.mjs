// skill-usage appends one line per skill start (time, name, agent or typed) to
// <PAU_SKILLS_HOME or home>/.claude/pau-skills/skill-usage.tsv, for which-skill's usage report. It never prints, never
// writes the prompt, and exits 0 on every input.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync, execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { repo, tempDir } from './helpers.mjs';

const HOOK = repo('hooks', 'session-discipline', 'skill-usage.mjs');
const HOOKS_JSON = repo('hooks', 'session-discipline', 'hooks.json');
const ISO = /[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z/.source;

function setup() {
  const home = tempDir(); // PAU_SKILLS_HOME: where the hook must write
  const realHome = tempDir(); // HOME and USERPROFILE: must stay empty
  const project = tempDir();
  return { home, realHome, project, dir: join(home, '.claude', 'pau-skills'), log: join(home, '.claude', 'pau-skills', 'skill-usage.tsv') };
}

function run(ctx, input, { env = {}, timeout = 10000, nodeArgs = [] } = {}) {
  const text = typeof input === 'string' ? input : JSON.stringify(input);
  const r = spawnSync(process.execPath, [...nodeArgs, HOOK], {
    input: text,
    encoding: 'utf8',
    timeout,
    env: { ...process.env, PAU_SKILLS_HOME: ctx.home, HOME: ctx.realHome, USERPROFILE: ctx.realHome, CLAUDE_PROJECT_DIR: ctx.project, PAU_SKILLS_DISABLE: '', ...env },
  });
  assert.equal(r.status, 0, `exit ${r.status} ${r.signal || ''}`);
  assert.equal(r.stdout, '');
  assert.equal(r.stderr, '');
  assert.deepEqual(readdirSync(ctx.realHome), [], 'the hook wrote under HOME instead of PAU_SKILLS_HOME');
  return r;
}

const lines = (ctx) => (existsSync(ctx.log) ? readFileSync(ctx.log, 'utf8').split('\n').filter(Boolean) : []);
const names = (ctx) => lines(ctx).map((l) => l.split('\t').slice(1).join('\t'));

function skill(dir, name) {
  mkdirSync(join(dir, name), { recursive: true });
  writeFileSync(join(dir, name, 'SKILL.md'), `---\nname: ${name}\ndescription: test skill\n---\n`);
}
const agent = (ctx, name, extra = {}) => ({ hook_event_name: 'PreToolUse', tool_name: 'Skill', tool_input: { skill: name }, session_id: 'sess-7f3a91', cwd: ctx.project, transcript_path: join(ctx.project, 'transcript-file.jsonl'), ...extra });
const typed = (ctx, prompt) => ({ hook_event_name: 'UserPromptSubmit', prompt, session_id: 'sess-7f3a91', cwd: ctx.project, transcript_path: join(ctx.project, 'transcript-file.jsonl') });

test('an agent start is one three-field line, with no session id, folder or transcript path', () => {
  const ctx = setup();
  const before = Date.now();
  run(ctx, agent(ctx, 'pau-skills:tdd'));
  const text = readFileSync(ctx.log, 'utf8');
  assert.match(text, new RegExp(`^${ISO}\\tpau-skills:tdd\\tagent\\n$`));
  const when = Date.parse(text.split('\t')[0]);
  assert.ok(when >= before - 1000 && when <= Date.now() + 1000, 'the time is now');
  for (const s of ['sess-7f3a91', ctx.project, 'transcript-file']) assert.ok(!text.includes(s), s);
});

test('a typed project skill is recorded as typed, without its arguments', () => {
  const ctx = setup();
  skill(join(ctx.project, '.claude', 'skills'), 'deploy-notes');
  run(ctx, typed(ctx, '/deploy-notes ship the v2 build zebrafruit'));
  const text = readFileSync(ctx.log, 'utf8');
  assert.match(text, new RegExp(`^${ISO}\\tdeploy-notes\\ttyped\\n$`));
  assert.ok(!text.includes('zebrafruit') && !text.includes('ship'));
});

test('a typed home skill, a synced skill and this repository\'s own plugin skill are recorded', () => {
  const ctx = setup();
  skill(join(ctx.home, '.claude', 'skills'), 'home-notes');
  skill(join(ctx.home, '.claude', 'skills', 'synced', 'acct-1'), 'synced-notes');
  run(ctx, typed(ctx, '/home-notes'));
  run(ctx, typed(ctx, '/synced-notes now'));
  run(ctx, typed(ctx, '/pau-skills:tdd add a parser'));
  assert.deepEqual(names(ctx), ['home-notes\ttyped', 'synced-notes\ttyped', 'pau-skills:tdd\ttyped']);
});

test('a typed skill of a synced plugin is recorded only under its own prefix', () => {
  const ctx = setup();
  skill(join(ctx.home, '.claude', 'plugins', 'synced', 'acct-2', 'design', 'skills'), 'ux-copy');
  skill(join(ctx.home, '.claude', 'plugins', 'synced', 'skills'), 'escaped'); // what acct-2/../skills would reach
  run(ctx, typed(ctx, '/..:escaped'));
  run(ctx, typed(ctx, '/other:ux-copy'));
  run(ctx, typed(ctx, '/design:ux-copy the signup page'));
  assert.deepEqual(names(ctx), ['design:ux-copy\ttyped']);
});

test('built-in and custom commands are not recorded', () => {
  const ctx = setup();
  mkdirSync(join(ctx.project, '.claude', 'commands'), { recursive: true });
  writeFileSync(join(ctx.project, '.claude', 'commands', 'review.md'), 'Review the diff.\n');
  for (const p of ['/clear', '/compact keep the plan', '/review']) run(ctx, typed(ctx, p));
  assert.equal(existsSync(ctx.log), false);
});

test('/.. is not recorded, even with a SKILL.md one folder up', () => {
  const ctx = setup();
  mkdirSync(join(ctx.home, '.claude'), { recursive: true });
  writeFileSync(join(ctx.home, '.claude', 'SKILL.md'), 'x\n');
  mkdirSync(join(ctx.project, '.claude'), { recursive: true });
  writeFileSync(join(ctx.project, '.claude', 'SKILL.md'), 'x\n');
  run(ctx, typed(ctx, '/..'));
  run(ctx, typed(ctx, '/.. now'));
  assert.equal(existsSync(ctx.log), false);
});

test('a name followed by something other than a space or the end is not recorded', () => {
  const ctx = setup();
  skill(join(ctx.project, '.claude', 'skills'), 'deploy-notes');
  run(ctx, typed(ctx, '/deploy-notes/readme.md is broken'));
  run(ctx, typed(ctx, '/deploy-notes,now'));
  assert.equal(existsSync(ctx.log), false);
  run(ctx, typed(ctx, '/deploy-notes'));
  assert.deepEqual(names(ctx), ['deploy-notes\ttyped'], 'control: the bare name is recorded');
});

test('a prompt that does not start with / is not recorded, even when it names a skill', () => {
  const ctx = setup();
  skill(join(ctx.project, '.claude', 'skills'), 'deploy-notes');
  run(ctx, typed(ctx, 'deploy-notes please'));
  run(ctx, typed(ctx, ' /deploy-notes'));
  run(ctx, typed(ctx, 'run /deploy-notes'));
  assert.equal(existsSync(ctx.log), false);
});

test('another tool, and another event, record nothing', () => {
  const ctx = setup();
  run(ctx, agent(ctx, 'tdd', { tool_name: 'Read' }));
  run(ctx, agent(ctx, 'tdd', { hook_event_name: 'PostToolUse' }));
  assert.equal(existsSync(ctx.log), false);
});

test('odd input records nothing', () => {
  const ctx = setup();
  const inputs = [
    'not json',
    '{}',
    'null',
    { hook_event_name: 'PreToolUse', tool_name: 'Skill' },
    agent(ctx, 42),
    agent(ctx, 'td\td'),
    agent(ctx, 'a'.repeat(300)),
    agent(ctx, ''),
    { hook_event_name: 'UserPromptSubmit', prompt: 7 },
    { hook_event_name: 'UserPromptSubmit' },
  ];
  for (const i of inputs) run(ctx, i);
  assert.equal(existsSync(ctx.log), false);
});

test('a name of 200 characters is recorded and one of 201 is not', () => {
  const ctx = setup();
  run(ctx, agent(ctx, 'b'.repeat(201)));
  run(ctx, agent(ctx, 'a'.repeat(200)));
  assert.deepEqual(names(ctx), [`${'a'.repeat(200)}\tagent`]);
});

test('the hook is off by the project config, and off by PAU_SKILLS_DISABLE', () => {
  const ctx = setup();
  skill(join(ctx.project, '.claude', 'skills'), 'deploy-notes');
  const conf = join(ctx.project, '.claude', 'pau-skills.json');
  writeFileSync(conf, JSON.stringify({ hooks: { 'skill-usage': false } }));
  run(ctx, agent(ctx, 'tdd'));
  run(ctx, typed(ctx, '/deploy-notes'));
  writeFileSync(conf, '{}');
  run(ctx, agent(ctx, 'tdd'), { env: { PAU_SKILLS_DISABLE: 'skill-usage' } });
  run(ctx, typed(ctx, '/deploy-notes'), { env: { PAU_SKILLS_DISABLE: 'skill-usage' } });
  assert.equal(existsSync(ctx.log), false);
  run(ctx, agent(ctx, 'tdd'));
  assert.deepEqual(names(ctx), ['tdd\tagent'], 'control: on again');
});

test('the folder is made when missing, and earlier lines are kept', () => {
  const ctx = setup();
  assert.equal(existsSync(join(ctx.home, '.claude')), false);
  run(ctx, agent(ctx, 'first'));
  run(ctx, agent(ctx, 'second'));
  assert.deepEqual(names(ctx), ['first\tagent', 'second\tagent']);
});

// Every line the hook writes for "tdd" by the agent is 35 bytes: a 24-character time, a tab, tdd, a tab, agent, \n.
const OLD = '2020-01-01T00:00:00.000Z\ttdd\tagent\n';
const FIRST = 'fifteen bytes.\n';
function fill(ctx, count) {
  assert.equal(OLD.length, 35);
  assert.equal(FIRST.length, 15);
  mkdirSync(ctx.dir, { recursive: true });
  writeFileSync(ctx.log, FIRST + OLD.repeat(count));
}

test('a file of exactly 1,000,000 bytes after the append is not trimmed', () => {
  const ctx = setup();
  fill(ctx, 28_570);
  const ino = statSync(ctx.log).ino;
  run(ctx, agent(ctx, 'tdd'));
  assert.equal(statSync(ctx.log).size, 1_000_000);
  assert.equal(statSync(ctx.log).ino, ino);
  assert.ok(readFileSync(ctx.log, 'utf8').startsWith(FIRST));
});

test('one more append keeps the newest whole lines that fit in 500,000 bytes, through a renamed temporary file', () => {
  const ctx = setup();
  fill(ctx, 28_571);
  assert.equal(statSync(ctx.log).size, 1_000_000);
  const ino = statSync(ctx.log).ino;
  run(ctx, agent(ctx, 'tdd'));
  const size = statSync(ctx.log).size;
  assert.ok(size <= 500_000 && size > 500_000 - 35, `size ${size}`);
  assert.notEqual(statSync(ctx.log).ino, ino, 'the log was rewritten in place, not replaced by a renamed file');
  const all = lines(ctx);
  for (const l of all) assert.match(l, new RegExp(`^${ISO}\\ttdd\\tagent$`));
  assert.equal(all.length * 35, size);
  assert.ok(!all.at(-1).startsWith('2020-'), 'the newest line is last');
  assert.ok(all.slice(0, -1).every((l) => l.startsWith('2020-')));
  assert.deepEqual(readdirSync(ctx.dir), ['skill-usage.tsv'], 'no temporary file left');
});

// The log before the append: 14,286 old lines (500,010 bytes), one longer line, then 14,283 old lines. With the 35-byte
// line the hook appends, the newest 500,000 bytes start exactly where the cut is chosen to fall.
const FILLER = 14_286;
const AFTER = 14_283;
const longLine = (bytes) => `2020-01-01T00:00:00.000Z\t${'x'.repeat(bytes - 32)}\tagent\n`;
function fillAround(ctx, special) {
  mkdirSync(ctx.dir, { recursive: true });
  writeFileSync(ctx.log, OLD.repeat(FILLER) + special + OLD.repeat(AFTER));
}

test('a cut that lands exactly at a line start keeps that whole line: exactly 500,000 bytes', () => {
  const ctx = setup();
  const special = longLine(60);
  assert.equal(special.length, 60);
  fillAround(ctx, special);
  const after = statSync(ctx.log).size + 35;
  assert.equal(after, 1_000_010);
  assert.equal(after - 500_000, FILLER * 35, 'the cut falls on the first byte of the long line');
  run(ctx, agent(ctx, 'tdd'));
  assert.equal(statSync(ctx.log).size, 500_000);
  const text = readFileSync(ctx.log, 'utf8');
  assert.ok(text.startsWith(special), 'the long line is kept whole');
  assert.equal(lines(ctx).length, 1 + AFTER + 1);
});

test('a cut that lands on a newline byte drops only that newline: every kept line is whole', () => {
  const ctx = setup();
  const special = longLine(59);
  assert.equal(special.length, 59);
  fillAround(ctx, special);
  const after = statSync(ctx.log).size + 35;
  assert.equal(after, 1_000_009);
  assert.equal(after - 500_000, FILLER * 35 - 1, 'the cut falls on the newline that ends the filler');
  run(ctx, agent(ctx, 'tdd'));
  assert.equal(statSync(ctx.log).size, 499_999);
  const text = readFileSync(ctx.log, 'utf8');
  assert.ok(text.startsWith(special), 'the kept text starts with the long line, not an empty line');
  for (const l of text.split('\n').slice(0, -1)) assert.match(l, new RegExp(`^${ISO}\\t(tdd|x+)\\tagent$`));
});

// A preload that makes the trim fail: it records the path it was asked to write or rename, then throws.
const PRELOAD = `import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
const mode = process.env.SKILL_USAGE_FAIL;
const record = process.env.SKILL_USAGE_RECORD;
const write = fs.writeFileSync;
if (mode === 'rename') {
  fs.renameSync = (from) => { fs.appendFileSync(record, String(from) + '\\n'); throw Object.assign(new Error('forced'), { code: 'EXDEV' }); };
}
if (mode === 'write') {
  fs.writeFileSync = (path, ...rest) => {
    if (!String(path).endsWith('.tmp')) return write(path, ...rest);
    write(path, 'partial');
    fs.appendFileSync(record, String(path) + '\\n');
    throw Object.assign(new Error('forced'), { code: 'ENOSPC' });
  };
}
syncBuiltinESMExports();
`;

for (const mode of ['rename', 'write']) {
  test('a ' + mode + ' that fails during the trim leaves the log and no temporary file, named by the process id', () => {
    const ctx = setup();
    const tools = tempDir();
    const preload = join(tools, 'fail-preload.mjs');
    const record = join(tools, 'record.txt');
    writeFileSync(preload, PRELOAD);
    fill(ctx, 28_571);
    const r = run(ctx, agent(ctx, 'tdd'), { nodeArgs: ['--import', pathToFileURL(preload).href], env: { SKILL_USAGE_FAIL: mode, SKILL_USAGE_RECORD: record } });
    assert.deepEqual(readFileSync(record, 'utf8').split('\n').filter(Boolean), [join(ctx.dir, `skill-usage.tsv.${r.pid}.tmp`)]);
    assert.deepEqual(readdirSync(ctx.dir), ['skill-usage.tsv'], 'no temporary file left');
    assert.equal(statSync(ctx.log).size, 1_000_035, 'the log keeps every line when the trim fails');
  });
}

test('a log path that is a folder is a silent exit 0', () => {
  const ctx = setup();
  mkdirSync(ctx.log, { recursive: true });
  run(ctx, agent(ctx, 'tdd'));
  assert.deepEqual(readdirSync(ctx.log), []);
});

test('a prompt without / returns before reading any config file', { skip: process.platform === 'win32' }, () => {
  const ctx = setup();
  for (const d of [ctx.home, ctx.project]) {
    mkdirSync(join(d, '.claude'), { recursive: true });
    execFileSync('mkfifo', [join(d, '.claude', 'pau-skills.json')]);
  }
  run(ctx, typed(ctx, 'hello'), { timeout: 3000 });
});

test('hooks.json registers the hook under PreToolUse for Skill and under UserPromptSubmit', () => {
  const hooks = JSON.parse(readFileSync(HOOKS_JSON, 'utf8')).hooks;
  const command = 'node "${CLAUDE_PLUGIN_ROOT}/hooks/session-discipline/skill-usage.mjs"';
  const pre = (hooks.PreToolUse || []).filter((g) => g.hooks.some((h) => h.command === command));
  assert.equal(pre.length, 1);
  assert.equal(pre[0].matcher, 'Skill');
  const prompt = (hooks.UserPromptSubmit || []).filter((g) => g.hooks.some((h) => h.command === command));
  assert.equal(prompt.length, 1);
  assert.equal(prompt[0].matcher, undefined);
  for (const g of [...pre, ...prompt]) assert.deepEqual(g.hooks, [{ type: 'command', command, timeout: 5 }]);
});
