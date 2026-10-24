#!/usr/bin/env node
// Replay a saved project-setup run to the persona, to see whether its prompt ends the conversation.
//
//   node evals/project-setup/replay.mjs <run dir> --turns <n> --prompt base|new [--times 4] [--persona-model <model>]
//
// It reads scenario.json and transcript.json from a run folder that run.mjs wrote, cuts the conversation after a
// chosen turn, and asks the persona for its next message --times times, one after another. It counts the replies that
// hold [END], prints each reply, and writes replay-<prompt>-<turns>.json in the run folder.
//
// --turns n keeps the conversation up to the assistant's n-th message. run.mjs's progress lines count from 0, so its
// "turn 20" is --turns 21. Each time is one real persona call through `claude -p`, so it costs real model usage.
// --prompt base is the persona prompt from before Q13, kept as the control; --prompt new is run.mjs's current one.
// Node 20+, no dependencies.
import { existsSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isEnd, personaSystemPrompt, askPersona } from './run.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const USAGE = 'usage: node replay.mjs <run dir> --turns <n> --prompt base|new [--times 4] [--persona-model <model>]';

/** The persona's system prompt as run.mjs built it before Q13: the end rules come last, after the persona. */
export function basePersonaSystemPrompt(persona) {
  return [
    'You are role-playing a person who is using Claude Code, as part of a test of a setup assistant. Stay in character.',
    '',
    persona,
    '',
    'You will see the conversation so far. Write only the next message this person would type. No narration, no labels, no quotes around it. Keep it short.',
    'If the assistant asks a multiple-choice question, answer as this person would, by number or by name.',
    'If the setup is over and the assistant has started a first real task that you picked, reply with exactly [END].',
    'If the assistant asks nothing and nothing is left to answer, reply with exactly [END].',
  ].join('\n');
}

/** The first `turns` turns of a transcript, ending on the assistant's message of the last one. */
export function cutTranscript(transcript, turns) {
  const max = Math.floor(transcript.length / 2);
  if (!Number.isInteger(turns) || turns < 1 || turns > max) throw new Error(`--turns must be a whole number from 1 to ${max}`);
  const cut = transcript.slice(0, 2 * turns);
  if (cut.at(-1)?.role !== 'assistant') throw new Error(`turn ${turns} does not end on an assistant message`);
  return cut;
}

export function replayArgs(argv) {
  const o = { times: 4 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--turns') o.turns = Number(argv[++i]);
    else if (a === '--prompt') o.prompt = argv[++i];
    else if (a === '--times') o.times = Number(argv[++i]);
    else if (a === '--persona-model') o.personaModel = argv[++i];
    else if (a.startsWith('--')) throw new Error(`unknown option ${a}`);
    else if (o.runDir !== undefined) throw new Error(`more than one run dir: ${o.runDir} and ${a}`);
    else o.runDir = a;
  }
  if (o.runDir === undefined) throw new Error('give the run dir');
  if (o.turns === undefined) throw new Error('--turns is required');
  if (!Number.isInteger(o.turns) || o.turns < 1) throw new Error('--turns must be a whole number of at least 1');
  if (o.prompt !== 'base' && o.prompt !== 'new') throw new Error('--prompt must be base or new');
  if (!Number.isInteger(o.times) || o.times < 1) throw new Error('--times must be a whole number of at least 1');
  return o;
}

function readJson(file) {
  if (!existsSync(file)) throw new Error(`no ${file}`);
  return JSON.parse(readFileSync(file, 'utf8'));
}

/** The scenario and the transcript of a saved run. */
export function loadRun(runDir) {
  return { scenario: readJson(join(runDir, 'scenario.json')), transcript: readJson(join(runDir, 'transcript.json')) };
}

/** Ask the persona o.times times for its next message after the cut, and save the count of replies that end. */
export function replay(o, ask = askPersona) {
  const { scenario, transcript } = loadRun(o.runDir);
  const persona = readFileSync(join(HERE, scenario.persona), 'utf8');
  const cut = cutTranscript(transcript, o.turns);
  const build = o.prompt === 'base' ? basePersonaSystemPrompt : personaSystemPrompt;
  const system = build(persona);
  // The persona runs in an empty folder with an empty HOME, as in run.mjs, so no CLAUDE.md or skill reaches it.
  const side = mkdtempSync(join(tmpdir(), 'persona-replay-'));
  const replies = [];
  let cost = 0;
  try {
    for (let i = 0; i < o.times; i++) {
      const out = ask(system, cut, { cwd: side, home: side, personaModel: o.personaModel });
      replies.push(out.result.trim());
      cost += out.total_cost_usd || 0;
    }
  } finally {
    rmSync(side, { recursive: true, force: true });
  }
  const ended = replies.filter(isEnd).length;
  const result = { prompt: o.prompt, turns: o.turns, times: o.times, ended, costUsd: +cost.toFixed(2), last: cut.at(-1).text, replies };
  writeFileSync(join(o.runDir, `replay-${o.prompt}-${o.turns}.json`), JSON.stringify(result, null, 2));
  return result;
}

/** True when this file is the entry point, also through a symlink; false when argv[1] is missing or not a file. */
function isMain() {
  try { return !!process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; }
}

if (isMain()) {
  let o;
  try {
    o = replayArgs(process.argv.slice(2));
  } catch (e) {
    process.stderr.write(`${USAGE}\n${e.message}\n`);
    process.exit(2);
  }
  const { transcript } = loadRun(o.runDir);
  const cut = cutTranscript(transcript, o.turns);
  console.log(`cut after turn ${o.turns} of ${Math.floor(transcript.length / 2)}`);
  console.log(cut.at(-1).text.slice(0, 300));
  const r = replay(o);
  r.replies.forEach((reply, i) => console.log(`${i + 1}. ${isEnd(reply) ? 'ENDS' : 'goes on'}: ${reply.replace(/\s+/g, ' ').slice(0, 200)}`));
  console.log(`${r.prompt}: ${r.ended} of ${r.times} replies end the conversation, $${r.costUsd}`);
}
