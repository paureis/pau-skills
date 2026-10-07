#!/usr/bin/env node
// Stop hook: before the agent ends its turn, check that code it changed since the user's last message was followed by
// a test, build, lint or type check. If not, send it back once to verify, or to say plainly that it did not.
//
// Why: "Done, the feature is implemented" after edits that were never run is the most common false report an agent
// makes. A rule in CLAUDE.md that says "run the tests before saying done" gets skipped exactly when the agent is most
// confident. This hook reads what actually happened in the transcript instead of trusting the summary.
//
// How it decides:
//   1. Find the user's last real message in the transcript (tool results do not count).
//   2. After it, list file edits (Write, Edit, MultiEdit, NotebookEdit). Documentation and plain text files
//      (.md, .mdx, .txt, .rst, .adoc, images) do not count.
//   3. If there was at least one edit, look for a shell command after the LAST edit that runs a check: a test runner,
//      a build, a linter or a type checker, in any common language (see VERIFY below), or one of "testCommands".
//   4. None found: block the stop with a reason. If the agent has already been sent back once (stop_hook_active),
//      it is allowed to stop, so this can never loop.
//
// Options in .claude/pau-skills.json:
//   { "verify-before-done": {
//       "testCommands": ["./scripts/check", "just verify"],   (extra regexes that count as verification)
//       "ignorePaths": ["*.lock", "docs/**"] } }              (globs of edits that never need verification)
// Turn it off with { "hooks": { "verify-before-done": false } }.
//
// Writes {"decision":"block","reason":...} on stdout to block. Exits 0 always; silent on anything it cannot read.
import { readFileSync, realpathSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, hookOptions, projectDir, readStdin, parseInput } from '../lib/config.mjs';

export const NAME = 'verify-before-done';

const EDIT_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit']);
const SHELL_TOOLS = new Set(['Bash', 'PowerShell']);
const NON_CODE = /\.(md|mdx|markdown|txt|rst|adoc|png|jpe?g|gif|svg|webp|ico|pdf|csv)$/i;

export const VERIFY = new RegExp([
  String.raw`\b(?:npm|pnpm|yarn|bun)\s+(?:run\s+)?(?:test|tests|check|lint|build|typecheck|type-check|verify|validate|ci)\b`,
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

/** A message the user typed (not a tool result, not a meta or sidechain entry). */
export function isUserPrompt(entry) {
  if (!entry || entry.type !== 'user' || entry.isMeta || entry.isSidechain) return false;
  const content = entry.message?.content;
  if (typeof content === 'string') return content.trim().length > 0;
  if (!Array.isArray(content)) return false;
  return content.some((b) => b?.type === 'text') && !content.some((b) => b?.type === 'tool_result');
}

/** The tool calls after the user's last message, in order, as { name, input }. */
export function toolCallsSinceLastPrompt(entries) {
  let start = 0;
  entries.forEach((e, i) => { if (isUserPrompt(e)) start = i + 1; });
  const calls = [];
  for (const e of entries.slice(start)) {
    if (e?.type !== 'assistant' || e.isSidechain) continue;
    for (const b of blocks(e)) if (b?.type === 'tool_use') calls.push({ name: b.name, input: b.input || {} });
  }
  return calls;
}

/** Pure decision over the tool calls: { edited: string[], verified: boolean }. */
export function assess(calls, options = {}) {
  const extra = (Array.isArray(options.testCommands) ? options.testCommands : []).map((s) => { try { return new RegExp(s); } catch { return null; } }).filter(Boolean);
  const ignore = (Array.isArray(options.ignorePaths) ? options.ignorePaths : []).map(globToRegExp);
  let lastEdit = -1;
  const edited = [];
  calls.forEach((c, i) => {
    if (!EDIT_TOOLS.has(c.name)) return;
    const p = String(c.input.file_path || c.input.notebook_path || '').replace(/\\/g, '/');
    if (!p || NON_CODE.test(p) || ignore.some((re) => re.test(p))) return;
    lastEdit = i;
    if (!edited.includes(p)) edited.push(p);
  });
  if (lastEdit < 0) return { edited, verified: true };
  const verified = calls.slice(lastEdit + 1).some((c) => {
    if (!SHELL_TOOLS.has(c.name) || typeof c.input.command !== 'string') return false;
    return VERIFY.test(c.input.command) || extra.some((re) => re.test(c.input.command));
  });
  return { edited, verified };
}

/** The Stop hook output, or null to let the agent stop. */
export function decide(input, { transcript = '', options = {} } = {}) {
  if (!input || input.stop_hook_active) return null;
  const { edited, verified } = assess(toolCallsSinceLastPrompt(parseTranscript(transcript)), options);
  if (verified) return null;
  const names = edited.slice(0, 5).map((p) => basename(p)).join(', ') + (edited.length > 5 ? `, and ${edited.length - 5} more` : '');
  return {
    decision: 'block',
    reason:
      `[verify-before-done] You changed ${names} since the user's last message, and no test, build, lint or type ` +
      "check ran after the last edit. Run the project's checks now and report the actual result. If there is nothing " +
      'that can be run, or running it is not possible here, say that plainly in your reply instead of implying the ' +
      'change works.',
  };
}

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  const input = parseInput(await readStdin());
  if (input && !input.stop_hook_active && typeof input.transcript_path === 'string') {
    const config = loadConfig({ project: projectDir(input) });
    if (hookEnabled(NAME, config)) {
      let transcript = '';
      try { transcript = readFileSync(input.transcript_path, 'utf8'); } catch { transcript = ''; }
      const out = decide(input, { transcript, options: hookOptions(NAME, config) });
      if (out) process.stdout.write(JSON.stringify(out) + '\n');
    }
  }
  process.exit(0);
}
