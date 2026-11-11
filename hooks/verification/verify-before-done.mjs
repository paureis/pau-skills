#!/usr/bin/env node
// Stop hook: before the agent ends its turn, check that code it changed since the user's last message was followed by
// a test, build, lint or type check. If not, send it back once to verify, or to say plainly that it did not.
//
// Why: "Done, the feature is implemented" after edits that were never run is the most common false report an agent
// makes. A rule in CLAUDE.md that says "run the tests before saying done" gets skipped exactly when the agent is most
// confident. This hook reads what actually happened in the transcript instead of trusting the summary.
//
// How it decides:
//   1. Find the user's last real message in the transcript (tool results do not count). A user entry whose
//      origin.kind is task-notification, peer, auto-continuation or channel was sent by the harness or another
//      agent, so it does not count: a task notification that arrives while the session is idle must not hide the
//      edits made before it. Any other entry keeps this rule: no origin or no kind, "human", "coordinator" (a
//      worker's prompt), and kinds whose meaning is not verified, such as suggestion. The window also starts after
//      this hook's own feedback (a user entry whose text holds "[verify-before-done]"), so an edit it already sent
//      the agent back for is not judged again on a later turn; an edit after the feedback still counts.
//   2. After it, list file edits (Write, Edit, MultiEdit, NotebookEdit). Documentation and plain text files
//      (.md, .mdx, .txt, .rst, .adoc, images) do not count. Only edits inside the project count ($CLAUDE_PROJECT_DIR,
//      else the input's cwd), so an edit to a scratchpad or a temp folder does not. A relative path resolves against
//      the input's cwd. An edit is inside if the path as written or its real path is inside. A path it cannot place
//      counts.
//   3. If there was at least one edit, look for a shell command (Bash, PowerShell, or the command of a Monitor call)
//      after the LAST edit that runs a check: a test runner, a build, a linter or a type checker, in any common
//      language (see VERIFY below), a check script, a Lua tool, one of "testCommands", or a check the project
//      declares. Package-manager flags between the tool and its script count (--prefix, --cwd, --filter,
//      --workspace, -C, -w, each with its value), as in "npm --prefix web test".
//      A check script, a Lua tool and a declared check start a command: at its start, or after ; & | ( or a new line
//      (so after && || and $( too), with an optional timeout prefix (timeout, then any of -k <v>, -s <v>,
//      --kill-after=<v>, --signal=<v>, --preserve-status, --foreground and -v, then a duration such as 600, 10m, 1.5h).
//      - A check script: an interpreter (bash, sh, zsh, pwsh, powershell, node, python, python3, python3.11 and the
//        like, or py, each with an optional .exe, in any case), its flags (only -ExecutionPolicy and its short forms
//        -exec, -ep and -ex take a value), then a script path; or a path
//        run directly, ./x or .\x (in "& .\x", the PowerShell call operator & is a separator). A flag for inline code
//        or a module means there is no script: -c for bash, sh, zsh and python, -m for python, -e, -p, --eval and
//        --print for node, -c, -Command and -EncodedCommand for pwsh and powershell, in any case. The file name, after
//        the last / or \, is split into words at every character that is not an ASCII letter, between a lowercase
//        letter and a capital, and between a capital and a capital followed by a lowercase letter (APITests is API
//        and Tests). It is a check script when a word starts with check, test, verify or lint, or is ci, in any case.
//        A folder name does not count: "bash tests/run.sh" is not a check.
//      - A Lua tool: "lune run" with a path in which a folder or file name has such a word, "luau-lsp analyze",
//        "selene", or "stylua" with --check among its arguments.
//      - A declared check (see below): literal text, case-sensitive, in which a run of spaces and tabs counts as one
//        space, followed by the end, white space or ; & | ) < >.
//      A check started in the background (run_in_background) counts like any other.
//      A check inside a subagent does not count, because the main session reruns the checks itself (decision 22).
//   4. None found: block the stop with a reason, which also says how to name a check this hook missed (testCommands,
//      or checks in .claude/review-rules.json). If the agent has already been sent back once (stop_hook_active), it
//      is allowed to stop, so this can never loop.
//
// Options in .claude/pau-skills.json:
//   { "verify-before-done": {
//       "testCommands": ["^bin/gate", "just verify"],   (extra regexes that count as verification)
//       "ignorePaths": ["*.lock", "docs/**"] } }        (globs of edits that never need verification)
// Turn it off with { "hooks": { "verify-before-done": false } }.
// The checks a project lists for other skills in .claude/review-rules.json count too: { "checks": ["make test"] }.
// It is read from the project folder. A file that is missing or not valid JSON, a value that is not an object, or a
// "checks" that is not a list counts as no checks; an entry that is not a string or is blank is skipped. A leading
// byte order mark is ignored.
//
// Writes {"decision":"block","reason":...} on stdout to block. Exits 0 always; silent on anything it cannot read.
// An edit it cannot place inside or outside the project still counts.
import { readFileSync, realpathSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, hookOptions, projectDir, readStdin, parseInput } from '../lib/config.mjs';

export const NAME = 'verify-before-done';

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
// A Monitor call carries a shell command in `command` too.
const SHELL_TOOLS = new Set(['Bash', 'PowerShell', 'Monitor']);
const NON_CODE = /\.(md|mdx|markdown|txt|rst|adoc|png|jpe?g|gif|svg|webp|ico|pdf|csv)$/i;

// One package-manager flag with its value: --prefix, --cwd, --filter, --workspace, -C or -w. A bare value cannot start
// with a quote, so a quoted value matches one way only: two ways made many quoted flags take exponential time, and a
// bare match of `"my build"` read its second word as the script.
const PM_FLAG = String.raw`\s+(?:--prefix|--cwd|--filter|--workspace|-C|-w)(?:=|\s+)(?:"[^"]*"|'[^']*'|[^\s"']\S*)`;

export const VERIFY = new RegExp([
  String.raw`\b(?:npm|pnpm|yarn|bun)(?:${PM_FLAG})*\s+(?:run\s+)?(?:test|tests|check|lint|build|typecheck|type-check|verify|validate|ci)\b`,
  String.raw`\b(?:npx|pnpm\s+exec|bunx)\s+(?:jest|vitest|mocha|ava|tsc|eslint|biome|playwright|cypress)\b`,
  String.raw`\b(?:jest|vitest|mocha|tsc|eslint|biome|playwright\s+test|cypress\s+run)\b`,
  String.raw`\bnode\s+--test\b|\bdeno\s+(?:test|check|lint)\b|\bbun\s+test\b`,
  String.raw`\b(?:pytest|py\.test|tox|nox|mypy|pyright|ruff|flake8|pylint|black\s+--check)\b|\bpython3?\s+-m\s+(?:pytest|unittest|mypy)\b|\buv\s+run\s+(?:pytest|mypy|ruff)\b`,
  String.raw`\bcargo\s+(?:test|check|clippy|build|nextest)\b`,
  String.raw`\bgo\s+(?:test|vet|build)\b|\bgolangci-lint\b|\bstaticcheck\b`,
  String.raw`\b(?:mvn|mvnw|gradle|gradlew)\b[^\n]*\b(?:test|verify|check|build|package)\b`,
  String.raw`\bdotnet\s+(?:test|build)\b`,
  String.raw`\b(?:rspec|rubocop|minitest)\b|\b(?:bundle\s+exec\s+)?rake\s+(?:test|spec)\b|\brails\s+test\b`,
  String.raw`\b(?:phpunit|pest|phpstan|psalm)\b|\bcomposer\s+(?:test|check)\b`,
  String.raw`\bmix\s+(?:test|compile|credo|dialyzer)\b`,
  String.raw`\bswift\s+(?:test|build)\b|\bxcodebuild\b[^\n]*\btest\b`,
  String.raw`\bflutter\s+(?:test|analyze)\b|\bdart\s+(?:test|analyze)\b`,
  String.raw`\b(?:ctest|bazel\s+(?:test|build)|buck2?\s+(?:test|build)|meson\s+test|ninja)\b`,
  String.raw`\bmake(?:\s+-\S+)*(?:\s+(?:test|tests|check|lint|build|all|ci|verify))?\s*(?:$|[;&|])`,
  String.raw`\b(?:just|task)\s+(?:test|check|lint|build|ci|verify)\b`,
  String.raw`\bshellcheck\b|\bterraform\s+(?:validate|plan)\b|\bhelm\s+lint\b`,
].join('|'), 'i');

// Where a command starts: the start, or after ; & | ( or a new line (which covers && || and $( too), then an optional
// timeout prefix: timeout, its options, a duration, the command. No part holds white space or ; & | ( ) < >, so each
// piece of text can be read one way only, and a long command that does not match is read in linear time.
const PART = String.raw`[^\s;&|()<>]`;
const START = String.raw`(?:^|[;&|\n(])[ \t]*(?:timeout(?:[ \t]+(?:-[ks][ \t]+${PART}+|--(?:kill-after|signal)=${PART}+|--preserve-status|--foreground|-v))*[ \t]+\d+(?:\.\d+)?[smhd]?[ \t]+)?`;
const END = String.raw`(?=$|[\s;&|)<>])`;
const squeeze = (s) => s.replace(/[ \t]+/g, ' ');

// A check script or a Lua tool: an interpreter with its flags and a script, a script run directly, or a Lua tool.
// -ExecutionPolicy and its short forms take a value; the longer forms come first, so each is tried one way only.
const EP = '(?:ExecutionPolicy|exec|ep|ex)';
const SHAPES = new RegExp(START + '(?:' + [
  String.raw`(?<interp>bash|sh|zsh|pwsh|powershell|node|python(?:3(?:\.\d+)?)?|py)(?:\.exe)?(?<flags>(?:[ \t]+(?:-${EP}[ \t]+[^-\s;&|()<>]${PART}*|-(?!${EP}[ \t]+[^-\s;&|()<>])${PART}*))*)[ \t]+(?<script>[^-\s;&|()<>]${PART}*)`,
  String.raw`(?<direct>\.[/\\]${PART}*)`,
  String.raw`lune[ \t]+run[ \t]+(?<lune>${PART}+)`,
  String.raw`(?:luau-lsp[ \t]+analyze|selene)${END}`,
  String.raw`stylua[ \t][^;&|()\n]*?(?<=[ \t])--check${END}`,
].join('|') + ')', 'gi');

/** True when a file or folder name has a word that marks a check: check, test, verify or lint at its start, or ci. */
function checkWord(name) {
  return name.replace(/([a-z])(?=[A-Z])|([A-Z])(?=[A-Z][a-z])/g, '$1$2 ').split(/[^A-Za-z]+/)
    .some((w) => /^(?:check|test|verify|lint)|^ci$/i.test(w));
}

// The flags after which an interpreter runs code or a module given inline, so what follows is not a script path.
const CODE_FLAGS = new Map([['sh', ['-c']], ['python', ['-c', '-m']], ['node', ['-e', '-p', '--eval', '--print']],
  ['pwsh', ['-c', '-command', '-encodedcommand']]]);
const family = (name) => name.toLowerCase().replace(/^(?:ba|z)sh$/, 'sh').replace(/^py(?:thon.*)?$/, 'python').replace(/^powershell$/, 'pwsh');

/** True when the flags of an interpreter make it run inline code or a module. */
function inlineCode(interp, flags) {
  const code = interp === undefined ? [] : CODE_FLAGS.get(family(interp)) ?? [];
  return flags.trim().split(/[ \t]+/).some((f) => code.includes(f.toLowerCase()));
}

/** True when the command runs a check script or a Lua tool check. */
function runsScript(cmd) {
  for (const { groups: g } of cmd.matchAll(SHAPES)) {
    const script = g.script ?? g.direct;
    if (script !== undefined) { if (!inlineCode(g.interp, g.flags ?? '') && checkWord(script.split(/[/\\]/).pop())) return true; }
    else if (g.lune === undefined || g.lune.split(/[/\\]/).some(checkWord)) return true;
  }
  return false;
}

/** Each declared check as a pattern for a whole command; an entry that is not a string or is blank is skipped. */
function checkPatterns(checks) {
  return (Array.isArray(checks) ? checks : []).filter((c) => typeof c === 'string' && c.trim())
    .map((c) => new RegExp(START + squeeze(c.trim()).replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + END));
}

/** The "checks" list of <project>/.claude/review-rules.json, or [] when there is none. */
function declaredChecks(project) {
  try {
    const value = JSON.parse(readFileSync(path.join(project, '.claude', 'review-rules.json'), 'utf8').replace(/^\uFEFF/, ''));
    return Array.isArray(value?.checks) ? value.checks : [];
  } catch { return []; }
}

function globToRegExp(glob) {
  let re = '';
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    if (c === '*' && glob[i + 1] === '*') { re += '.*'; i++; if (glob[i + 1] === '/') i++; }
    else if (c === '*') re += '[^/]*';
    else re += c.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
  }
  return new RegExp('(^|/)' + re + '$');
}

/** Parse JSONL text into entries, skipping lines that are not JSON. */
export function parseTranscript(text) {
  const out = [];
  for (const line of String(text).split(/\r?\n/)) {
    if (!line.trim()) continue;
    try { out.push(JSON.parse(line)); } catch { /* partial line */ }
  }
  return out;
}

const blocks = (entry) => (Array.isArray(entry?.message?.content) ? entry.message.content : []);

// The origin kinds of a user entry sent by the harness or another agent.
const NOT_TYPED = new Set(['task-notification', 'peer', 'auto-continuation', 'channel']);

/** A message the user typed (not a tool result, not a meta or sidechain entry, not sent by the harness). */
export function isUserPrompt(entry) {
  if (!entry || entry.type !== 'user' || entry.isMeta || entry.isSidechain) return false;
  if (entry.origin && typeof entry.origin === 'object' && NOT_TYPED.has(entry.origin.kind)) return false;
  const content = entry.message?.content;
  if (typeof content === 'string') return content.trim().length > 0;
  if (!Array.isArray(content)) return false;
  return content.some((b) => b?.type === 'text') && !content.some((b) => b?.type === 'tool_result');
}

/** This hook's own feedback, which Claude Code stores as a user entry. */
function ownFeedback(e) {
  const c = e?.type === 'user' ? e.message?.content : undefined;
  const texts = typeof c === 'string' ? [c] : Array.isArray(c) ? c.filter((b) => b?.type === 'text').map((b) => b.text) : [];
  return texts.some((t) => typeof t === 'string' && t.includes(`[${NAME}]`));
}

/** The tool calls after the user's last message or this hook's last feedback, in order, as { name, input }. */
export function toolCallsSinceLastPrompt(entries) {
  let start = 0;
  entries.forEach((e, i) => { if (isUserPrompt(e) || ownFeedback(e)) start = i + 1; });
  const calls = [];
  for (const e of entries.slice(start)) {
    if (e?.type !== 'assistant' || e.isSidechain) continue;
    for (const b of blocks(e)) if (b?.type === 'tool_use') calls.push({ name: b.name, input: b.input || {} });
  }
  return calls;
}

/** The real path of p. For a path that does not exist, the real path of its nearest existing folder plus the rest. */
function realOrNearest(p, api) {
  const rest = [];
  let dir = p;
  for (;;) {
    try { return api.join(realpathSync.native(dir), ...rest); } catch { /* missing, or not a path on this system */ }
    const up = api.dirname(dir);
    if (up === dir) return p;
    rest.unshift(api.basename(dir));
    dir = up;
  }
}

/** True when file is root or inside it. Both are absolute, for the same path functions. */
function within(file, root, api) {
  const rel = api.relative(root, file);
  return rel !== '..' && !rel.startsWith('..' + api.sep) && !api.isAbsolute(rel);
}

/**
 * True when an edited file is inside the project folder. A relative path resolves against cwd. The edit is inside if
 * the path as written or its real path is inside: real paths place a file in a linked project, or on macOS a /var path
 * against /private/var, and the path as written keeps a file reached through a link inside the project (a linked
 * package, a vendored folder) inside. A path it cannot place (no project, a relative path with no cwd, a value that is
 * not a string) counts as inside, so the hook never goes quiet on input it cannot read. api is node:path; the tests
 * pass path.win32.
 */
export function insideProject(file, { project, cwd, api = path } = {}) {
  if (typeof file !== 'string') return true;
  if (typeof project !== 'string' || !project) return true;
  if (!api.isAbsolute(file) && (typeof cwd !== 'string' || !cwd)) return true;
  const abs = api.isAbsolute(file) ? api.resolve(file) : api.resolve(cwd, file);
  const root = api.resolve(project);
  return within(abs, root, api) || within(realOrNearest(abs, api), realOrNearest(root, api), api);
}

/** Pure decision over the tool calls: { edited: string[], verified: boolean }. */
export function assess(calls, options = {}, where = {}, checks = []) {
  const own = checkPatterns(checks);
  const extra = (Array.isArray(options.testCommands) ? options.testCommands : []).map((s) => { try { return new RegExp(s); } catch { return null; } }).filter(Boolean);
  const ignore = (Array.isArray(options.ignorePaths) ? options.ignorePaths : []).map(globToRegExp);
  let lastEdit = -1;
  const edited = [];
  calls.forEach((c, i) => {
    if (!EDIT_TOOLS.has(c.name)) return;
    const raw = String(c.input.file_path || c.input.notebook_path || '');
    const p = raw.replace(/\\/g, '/');
    if (!p || NON_CODE.test(p) || ignore.some((re) => re.test(p)) || !insideProject(raw, where || {})) return;
    lastEdit = i;
    if (!edited.includes(p)) edited.push(p);
  });
  if (lastEdit < 0) return { edited, verified: true };
  const verified = calls.slice(lastEdit + 1).some((c) => {
    if (!SHELL_TOOLS.has(c.name) || typeof c.input.command !== 'string') return false;
    const cmd = c.input.command;
    const flat = own.length ? squeeze(cmd) : ''; // once per call, not once per check
    return VERIFY.test(cmd) || runsScript(cmd) || own.some((re) => re.test(flat)) || extra.some((re) => re.test(cmd));
  });
  return { edited, verified };
}

/** The Stop hook output, or null to let the agent stop. */
export function decide(input, { transcript = '', options = {}, project, checks = [] } = {}) {
  if (!input || input.stop_hook_active) return null;
  const { edited, verified } = assess(toolCallsSinceLastPrompt(parseTranscript(transcript)), options, { project, cwd: input.cwd }, checks);
  if (verified) return null;
  const names = edited.slice(0, 5).map((p) => path.basename(p)).join(', ') + (edited.length > 5 ? `, and ${edited.length - 5} more` : '');
  return {
    decision: 'block',
    reason:
      `[verify-before-done] You changed ${names} since the user's last message, and no test, build, lint or type ` +
      "check ran after the last edit. Run the project's checks now and report the actual result. If there is nothing " +
      'that can be run, or running it is not possible here, say that plainly in your reply instead of implying the ' +
      'change works. If a check did run and this is a false alarm, name it for this hook: a regular expression in ' +
      'testCommands in .claude/pau-skills.json, for example {"verify-before-done": {"testCommands": ["^bin/gate"]}}, ' +
      'or the command in checks in .claude/review-rules.json, for example {"checks": ["bin/gate --full"]}.',
  };
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  const input = parseInput(await readStdin());
  if (input && !input.stop_hook_active && typeof input.transcript_path === 'string') {
    const project = projectDir(input);
    const config = loadConfig({ project });
    if (hookEnabled(NAME, config)) {
      let transcript = '';
      try { transcript = readFileSync(input.transcript_path, 'utf8'); } catch { transcript = ''; }
      const out = decide(input, { transcript, options: hookOptions(NAME, config), project, checks: declaredChecks(project) });
      if (out) process.stdout.write(JSON.stringify(out) + '\n');
    }
  }
  process.exit(0);
}
