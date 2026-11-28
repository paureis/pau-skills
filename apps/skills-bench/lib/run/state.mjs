// skills-bench runner: the round folder and its state file, round.json. A round folder holds round.json (the state),
// labs/<task>/ (each skill-eval lab), blind/<task>/ (each blind copy), results/ (one result.json per run), judge/ and
// owner/. Run roots live outside it, one mktemp -d per task, recorded in the state.
import { existsSync, statSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { REPO, readJson, writeJson, isInside, realOrPlanned } from './common.mjs';

export const STATE_FORMAT = 'skills-bench-state/1';

export const statePath = (round) => join(round, 'round.json');
export const resultPath = (round, t, variant, n) => join(round, 'results', t.skill, t.id, variant, String(n), 'result.json');

/**
 * The state of a round folder: null for a new or empty folder, the state for a folder holding a round.json this
 * bench wrote. Throws on anything else, and on a folder inside the repository.
 */
export function openRound(dir) {
  const round = resolve(dir);
  if (isInside(realOrPlanned(round), realOrPlanned(REPO))) {
    throw new Error(`the round folder ${round} is inside the repository; keep a round outside it (for example in mktemp -d), so no run or lab file is ever committed by mistake`);
  }
  if (!existsSync(round)) return null;
  if (!statSync(round).isDirectory()) throw new Error(`${round} is not a folder`);
  if (!readdirSync(round).length) return null;
  let s = null;
  try { s = readJson(statePath(round)); } catch { /* not ours */ }
  if (!s || s.format !== STATE_FORMAT) throw new Error(`${round} is not empty and holds no round.json this bench wrote; give a new or empty folder, or a round folder to resume`);
  return s;
}

/** The state of an existing round, or a thrown error. */
export function loadRound(dir) {
  const s = openRound(dir);
  if (!s) throw new Error(`${resolve(dir)} holds no round; start one with run`);
  return s;
}

export function saveState(round, s) {
  s.endedAt = new Date().toISOString();
  writeJson(statePath(round), s);
}

/** A round id: the date and 4 hex digits. */
export const newRoundId = (now = new Date()) => `${now.toISOString().slice(0, 10)}-${randomBytes(2).toString('hex')}`;

/** The judge reserve: one judge price for every planned task not yet judged. */
export const judgeReserve = (s) => s.planned.filter((id) => !s.tasks[id].judged).length * s.judgeMicros;
