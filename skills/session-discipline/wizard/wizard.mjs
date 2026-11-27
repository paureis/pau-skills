#!/usr/bin/env node
// wizard: walks a person through setup steps only they can do, read from a JSON steps file, and checks each step
// without reading a secret's value. The person puts every value in place themselves; this script only checks that it
// is there. It never asks for, stores, prints or logs a value. check validates and runs nothing; status runs every
// check; run is for the person, in their own terminal. A relative path in a check is read from the current folder,
// not the steps file's folder. Node 20+, standard library only. Adapted from mattpocock/skills wizard (MIT); see
// NOTICE.
import { accessSync, constants, readFileSync, realpathSync, statSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { delimiter, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import http from 'node:http';
import https from 'node:https';

const USAGE = 'Usage: node wizard.mjs <check|status|run> <steps.json> [--no-open]';
const NAME = /^[A-Za-z_][A-Za-z0-9_]*$/;
const TOP_KEYS = ['title', 'steps'];
const STEP_KEYS = ['id', 'title', 'say', 'open', 'command', 'confirm', 'checks'];
// Each check kind and the keys it holds; the first key names the kind.
const KINDS = { file: ['file'], env: ['env'], envFile: ['envFile', 'key'], url: ['url', 'status'], command: ['command'] };
const CHECK_KEYS = new Set(Object.values(KINDS).flat());
const URL_TIMEOUT_MS = 10_000;
const COMMAND_TIMEOUT_MS = 30_000;
const OPENER_WAIT_MS = 3_000;
const YES = new Set(['y', 'Y', 'yes']);
const ENTER = 'Press Enter when this step is done (s to skip, q to quit)';
const CLEAR = '\x1b[2J\x1b[3J\x1b[H';

const has = (o, k) => Object.hasOwn(o, k);
const count = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const filled = (v) => typeof v === 'string' && v.trim() !== '';
const isName = (v) => typeof v === 'string' && NAME.test(v);
// An unknown key is never named, since a pasted value can sit in a key: the place, how many, and what is allowed there.
function unknownKeys(obj, allowed, at, problems) {
  const n = Object.keys(obj).filter((k) => !allowed.includes(k)).length;
  if (n) problems.push(`${at}: ${n} unknown key${n === 1 ? '' : 's'} (allowed here: ${allowed.join(', ')})`);
}

// A query or fragment parameter whose name says it may carry a secret, also inside a longer name (access_token).
const SECRET_PARAM = /token|secret|key|password|passwd|pass|auth|sig|signature|session|code|credential/i;
const secretParam = (params) => [...params.keys()].some((name) => SECRET_PARAM.test(name));

// Why a URL is refused, or '' when it is fine. The reason never holds the URL: it may hold a secret.
function urlProblem(v) {
  let u;
  try { u = new URL(v); } catch { return 'not an http or https URL'; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return 'not an http or https URL';
  if (u.username || u.password) return 'holds credentials';
  if (secretParam(u.searchParams)) return 'the query holds a parameter that may carry a secret';
  if (secretParam(new URLSearchParams(u.hash.slice(1)))) return 'the fragment holds a parameter that may carry a secret';
  return '';
}

function checkProblems(c, at, problems) {
  if (!isObject(c)) { problems.push(`${at}: not an object`); return; }
  unknownKeys(c, [...CHECK_KEYS], at, problems);
  const kinds = Object.keys(KINDS).filter((k) => has(c, k));
  if (kinds.length !== 1) {
    problems.push(`${at}: ${kinds.length ? 'more than one check kind' : 'no check kind (file, env, envFile, url or command)'}`);
    return;
  }
  const [kind] = kinds;
  for (const k of Object.keys(c)) if (CHECK_KEYS.has(k) && !KINDS[kind].includes(k)) problems.push(`${at}: key "${k}" is not part of a ${kind} check`);
  const bad = (key, why) => problems.push(`${at}.${key}: ${why}`);
  const NOT_NAME = 'not a variable name (letters, digits and _, not starting with a digit)';
  if (kind === 'file' && !filled(c.file)) bad('file', 'not a non-empty path');
  if (kind === 'env' && !isName(c.env)) bad('env', NOT_NAME);
  if (kind === 'envFile') {
    if (!filled(c.envFile)) bad('envFile', 'not a non-empty path');
    if (!isName(c.key)) bad('key', NOT_NAME);
  }
  if (kind === 'url') {
    const why = typeof c.url === 'string' ? urlProblem(c.url) : 'not an http or https URL';
    if (why) bad('url', why);
    if (!Number.isInteger(c.status) || c.status < 100 || c.status > 599) bad('status', 'not an integer from 100 to 599');
  }
  if (kind === 'command' && !(Array.isArray(c.command) && c.command.length && c.command.every((a) => typeof a === 'string' && a !== ''))) {
    bad('command', "not a non-empty array of non-empty strings (a check's command is an argv array)");
  }
}

// Every problem in a parsed steps file, each named by its place and key. No problem quotes a value from the file.
function validate(data) {
  if (!isObject(data)) return ['top level: not a JSON object'];
  const problems = [];
  unknownKeys(data, TOP_KEYS, 'top level', problems);
  if (!filled(data.title)) problems.push('title: not a non-empty string');
  if (!Array.isArray(data.steps) || data.steps.length === 0) return [...problems, 'steps: not a non-empty array'];
  const ids = new Map();
  data.steps.forEach((s, i) => {
    const at = `steps[${i}]`;
    if (!isObject(s)) { problems.push(`${at}: not an object`); return; }
    unknownKeys(s, STEP_KEYS, at, problems);
    if (!filled(s.id)) problems.push(`${at}.id: not a non-empty string`);
    else if (ids.has(s.id)) problems.push(`${at}.id: duplicate of steps[${ids.get(s.id)}]`);
    else ids.set(s.id, i);
    if (!filled(s.title)) problems.push(`${at}.title: not a non-empty string`);
    if (has(s, 'say') && !(Array.isArray(s.say) && s.say.every((l) => typeof l === 'string'))) problems.push(`${at}.say: not an array of strings`);
    if (has(s, 'open')) {
      const why = typeof s.open === 'string' ? urlProblem(s.open) : 'not an http or https URL';
      if (why) problems.push(`${at}.open: ${why}`);
    }
    if (has(s, 'command') && typeof s.command !== 'string') problems.push(`${at}.command: not a string (a step's command is text the person types)`);
    if (has(s, 'confirm') && typeof s.confirm !== 'boolean') problems.push(`${at}.confirm: not true or false`);
    if (!Array.isArray(s.checks) || s.checks.length === 0) {
      problems.push(`${at}.checks: not a non-empty array (find a check, or leave the step out and ask about it in the chat)`);
    } else s.checks.forEach((c, j) => checkProblems(c, `${at}.checks[${j}]`, problems));
  });
  return problems;
}

function load(path) {
  let text;
  try { text = readFileSync(path, 'utf8'); } catch (e) { return { problems: [`cannot read the file (${e.code || 'error'})`] }; }
  let data;
  // The parser's message quotes the input, so it is never shown.
  try { data = JSON.parse(text.replace(/^﻿/, '')); } catch { return { problems: ['not valid JSON'] }; }
  const problems = validate(data);
  return problems.length ? { problems } : { data };
}

function describe(c) {
  if (has(c, 'file')) return `file ${c.file}`;
  if (has(c, 'env')) return `env ${c.env}`;
  if (has(c, 'envFile')) return `envFile ${c.envFile} key ${c.key}`;
  if (has(c, 'url')) return `url ${c.url} status ${c.status}`;
  return `command ${c.command.join(' ')}`;
}

// A dotenv value counts when something is left once its quotes or an inline " # comment" are taken off.
function hasValue(raw) {
  const v = raw.trim();
  const quoted = /^(["'`])(.*?)\1/.exec(v);
  if (quoted) return quoted[2].trim() !== '';
  return v.replace(/(^|\s)#.*$/, '').trim() !== '';
}

// Whether the dotenv file sets key, read line by line; the last line for the key decides. Only a boolean leaves this
// function: no line and no value is kept.
function envFileSets(path, key) {
  let set = false;
  for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=(.*)$/.exec(line);
    if (m && m[1] === key) set = hasValue(m[2]);
  }
  return set;
}

// The status of one GET, or the network error's code. No redirect is followed and the body is never read: the
// response is destroyed once its status is known, so an endpoint that streams forever cannot keep the wizard running.
function urlStatus(url) {
  return new Promise((done) => {
    const lib = new URL(url).protocol === 'https:' ? https : http;
    let req;
    try {
      req = lib.get(url, { agent: false, timeout: URL_TIMEOUT_MS }, (res) => { done({ status: res.statusCode }); res.destroy(); });
    } catch (e) { done({ error: e.code || 'ERROR' }); return; }
    req.on('timeout', () => req.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })));
    req.on('error', (e) => done({ error: e.code || 'ERROR' }));
  });
}

// The time a command check may take. WIZARD_COMMAND_TIMEOUT_MS sets it, so a test does not wait the full 30 s.
function commandTimeout() {
  const ms = Number(process.env.WIZARD_COMMAND_TIMEOUT_MS);
  return Number.isInteger(ms) && ms > 0 ? ms : COMMAND_TIMEOUT_MS;
}

// The exit of a command run with no shell; its output is never read. On POSIX it runs detached (a new session with no
// terminal, so no /dev/tty), and on the timeout its whole group gets SIGKILL, so ignoring SIGTERM cannot pass. Our own
// timer: spawn's `timeout` option keeps the process alive the full time after a command that could not start.
function commandExit(argv) {
  const win = process.platform === 'win32';
  return new Promise((done) => {
    let child;
    try {
      child = spawn(argv[0], argv.slice(1), { shell: false, stdio: 'ignore', windowsHide: true, detached: !win });
    } catch (e) { done({ error: e.code || 'ERROR' }); return; }
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      try { if (win) child.kill('SIGKILL'); else process.kill(-child.pid, 'SIGKILL'); } catch { /* it has already exited */ }
    }, commandTimeout());
    child.on('error', (e) => { clearTimeout(timer); done({ error: e.code || 'ERROR' }); });
    child.on('close', (code, signal) => { clearTimeout(timer); done({ code, signal, timedOut }); });
  });
}

// '' when the check passes, otherwise what failed, named by kind and name. Never a value.
async function failure(c) {
  const what = describe(c);
  if (has(c, 'file')) {
    try { statSync(resolve(c.file)); return ''; } catch { return `${what}: not found`; }
  }
  if (has(c, 'env')) return process.env[c.env] ? '' : `${what}: not set in this terminal`;
  if (has(c, 'envFile')) {
    try { return envFileSets(resolve(c.envFile), c.key) ? '' : `${what}: not set`; } catch (e) { return `${what}: cannot read the file (${e.code || 'error'})`; }
  }
  if (has(c, 'url')) {
    const r = await urlStatus(c.url);
    if (r.error) return `${what}: expected ${c.status}, no answer (${r.error})`;
    return r.status === c.status ? '' : `${what}: expected ${c.status}, got ${r.status}`;
  }
  const r = await commandExit(c.command);
  if (r.error) return `${what}: could not start (${r.error})`;
  if (r.timedOut) return `${what}: timed out`;
  if (r.code === 0) return '';
  return `${what}: ${r.code === null ? `stopped (${r.signal})` : `exited ${r.code}`}`;
}

async function failures(s) {
  const out = [];
  for (const c of s.checks) {
    const why = await failure(c);
    if (why) out.push(why);
  }
  return out;
}

const where = () => `Relative paths are read from: ${process.cwd()}`;

function check(data) {
  console.log(where());
  console.log(`${data.title}: ${count(data.steps.length, 'step')}`);
  data.steps.forEach((s, i) => {
    console.log(`${i + 1}. ${s.id}: ${s.title}${s.confirm ? ' (asks for a yes: cannot be undone)' : ''}`);
    for (const c of s.checks) console.log(`   check: ${describe(c)}`);
  });
  console.log('The steps file is valid. Nothing was run.');
  return 0;
}

async function status(data) {
  console.log(where());
  let notDone = 0;
  for (const [i, s] of data.steps.entries()) {
    const failed = await failures(s);
    if (failed.length === 0) console.log(`${i + 1}. ${s.id}: done`);
    else {
      notDone += 1;
      console.log(`${i + 1}. ${s.id}: not done: ${failed.join('; ')}`);
    }
  }
  console.log(notDone ? `${notDone} of ${count(data.steps.length, 'step')} not done.` : 'Every step is done.');
  return notDone ? 1 : 0;
}

// The opener for this platform: the command and its argv, run with no shell, so an & in the URL stays inside its own
// argument.
export function openerFor({ url, platform, env = {}, procVersion = '', onPath: found = () => false }) {
  if (platform === 'darwin') return { command: 'open', args: [url] };
  // explorer.exe returns 1 even when it opens the page, and rundll32's exit code is no failure signal either.
  if (platform === 'win32') return { command: 'rundll32.exe', args: ['url.dll,FileProtocolHandler', url] };
  const wsl = platform === 'linux' && (Boolean(env.WSL_DISTRO_NAME) || /microsoft/i.test(procVersion));
  if (wsl && found('wslview')) return { command: 'wslview', args: [url] };
  return { command: 'xdg-open', args: [url] };
}

// Whether an executable called name is in a PATH folder (with a PATHEXT ending on Windows). No `which`.
export function onPath(name, env = process.env, platform = process.platform) {
  const win = platform === 'win32';
  const endings = win ? (env.PATHEXT || '.COM;.EXE;.BAT;.CMD').split(';').filter(Boolean) : [''];
  for (const dir of (env.PATH ?? env.Path ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const ending of endings) {
      try { accessSync(join(dir, name + ending), win ? constants.F_OK : constants.X_OK); return true; } catch { /* the next one */ }
    }
  }
  return false;
}

function procVersion() {
  try { return readFileSync('/proc/version', 'utf8'); } catch { return ''; }
}

// True when the opener started; an opener still running after a few seconds has started the browser.
function launch({ command, args }) {
  return new Promise((done) => {
    let child;
    try { child = spawn(command, args, { shell: false, stdio: 'ignore', detached: true, windowsHide: true }); } catch { done(false); return; }
    const timer = setTimeout(() => { child.unref(); done(true); }, OPENER_WAIT_MS);
    child.on('error', () => { clearTimeout(timer); done(false); });
    child.on('exit', (code) => { clearTimeout(timer); done(process.platform === 'win32' || code === 0); });
  });
}

async function openPage(url, noOpen) {
  if (noOpen || !process.stdout.isTTY) { console.log(`  Open this page: ${url}`); return; }
  const opener = openerFor({ url, platform: process.platform, env: process.env, procVersion: procVersion(), onPath: (n) => onPath(n) });
  console.log((await launch(opener)) ? `  Opened in your browser: ${url}` : `  Open this page: ${url}`);
}

// One line queue for the whole run: a new readline per prompt would lose piped lines that arrived early. null is EOF.
function lineQueue(input) {
  const queue = [];
  const waiting = [];
  let ended = false;
  const rl = createInterface({ input, terminal: false });
  rl.on('line', (l) => (waiting.length ? waiting.shift()(l) : queue.push(l)));
  rl.on('close', () => { ended = true; for (const w of waiting.splice(0)) w(null); });
  const next = () => (queue.length ? Promise.resolve(queue.shift()) : ended ? Promise.resolve(null) : new Promise((r) => waiting.push(r)));
  return {
    async ask(prompt) {
      process.stdout.write(`${prompt} `);
      const answer = await next();
      if (!input.isTTY) process.stdout.write('\n');
      return answer;
    },
    close: () => rl.close(),
  };
}

const quits = (answer) => answer === null || ['q', 'quit'].includes(answer.trim().toLowerCase());

// Shows one step and waits for the person. Returns 'done', 'skipped' or 'quit'.
async function walk(s, label, lines, noOpen) {
  console.log(`\n${label}`);
  for (const l of s.say ?? []) console.log(`  ${l}`);
  if (s.command) console.log(`  Type this in your terminal: ${s.command}`);
  if (s.open) await openPage(s.open, noOpen);
  if (s.confirm) {
    console.log('  Warning: this step cannot be undone.');
    const answer = await lines.ask('  Type y to go on; anything else stops the wizard here:');
    if (answer === null || !YES.has(answer.trim())) return 'quit';
  }
  const first = await lines.ask(ENTER);
  if (quits(first)) return 'quit';
  if (first.trim().toLowerCase() === 's') return 'skipped';
  for (;;) {
    const failed = await failures(s);
    if (failed.length === 0) { console.log('  Done.'); return 'done'; }
    for (const why of failed) console.log(`  Check failed: ${why}`);
    if (failed.some((why) => why.startsWith('env '))) {
      console.log('  A variable set in another terminal is not seen here: set it in this one and start again,'
        + ' or ask for an envFile or command check instead.');
    }
    for (;;) {
      const answer = await lines.ask('  r to retry (or Enter), s to skip, q to quit:');
      if (quits(answer)) return 'quit';
      const a = answer.trim().toLowerCase();
      if (a === 's') return 'skipped';
      if (a === '' || a === 'r') break;
    }
  }
}

async function run(data, noOpen) {
  const n = data.steps.length;
  const tty = Boolean(process.stdout.isTTY);
  console.log(`\n${data.title}\n${count(n, 'step')}. You do each step; the wizard checks it and never asks for a value.`);
  console.log(where());
  // Decided once, before the first prompt, so a re-run resumes where the last one stopped.
  const doneAtStart = [];
  for (const s of data.steps) doneAtStart.push((await failures(s)).length === 0);
  const lines = lineQueue(process.stdin);
  const done = [];
  const skipped = [];
  const notReached = [];
  let shown = 0;
  for (const [i, s] of data.steps.entries()) {
    const label = `Step ${i + 1}/${n}: ${s.title}`;
    if (doneAtStart[i]) { console.log(`${label}: already done`); done.push(s); continue; }
    if (tty && shown > 0) process.stdout.write(CLEAR);
    shown += 1;
    const outcome = await walk(s, label, lines, noOpen);
    if (outcome === 'done') done.push(s);
    else if (outcome === 'skipped') skipped.push(s);
    else { notReached.push(...data.steps.slice(i)); break; }
  }
  lines.close();
  const ids = (list) => list.map((s) => s.id).join(', ');
  console.log(`\nDone: ${ids(done) || 'none'}`);
  if (skipped.length) console.log(`Skipped, still to do by hand: ${ids(skipped)}`);
  if (notReached.length) console.log(`Not reached: ${ids(notReached)}`);
  const finished = !skipped.length && !notReached.length;
  console.log(finished ? 'Every step is done.' : 'Run the same command again to go on; steps already done are passed over.');
  return finished ? 0 : 1;
}

async function main(argv) {
  const noOpen = argv.includes('--no-open');
  const rest = argv.filter((a) => a !== '--no-open');
  const [command, path] = rest;
  if (rest.length !== 2 || !['check', 'status', 'run'].includes(command)) { console.error(USAGE); return 2; }
  const { data, problems } = load(path);
  if (problems) {
    console.error(`${path} is not a valid steps file:`);
    for (const p of problems) console.error(`  ${p}`);
    return command === 'check' ? 1 : 2;
  }
  if (command === 'check') return check(data);
  if (command === 'status') return status(data);
  return run(data, noOpen);
}

function isEntryPoint() {
  try { return realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url)); } catch { return false; }
}

if (process.argv[1] && isEntryPoint()) process.exitCode = await main(process.argv.slice(2));
