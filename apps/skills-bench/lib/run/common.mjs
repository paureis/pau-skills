// skills-bench runner: the names it takes from skill-eval, the paths it knows, a JSON writer, money from a transcript,
// path replacement and the way it starts skill-eval as a command.
import { mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

export {
  extractActions, findMetaWords, judgeArgv, childEnv, claudeCommand, parseScores, validateRubric,
} from '../../../../skills/verification/skill-eval/skill-eval-core.mjs';
export {
  parseUsdMicros, microsArg, microsUsd, isInside, MAX_RUNS, META_WORDS, withoutComments,
} from '../../../../skills/verification/skill-eval/skill-eval.mjs';

/** The repository root, found from this file. */
export const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
export const SKILL_EVAL = join(REPO, 'skills', 'verification', 'skill-eval', 'skill-eval.mjs');
export const DIFFICULTIES = ['simple', 'medium', 'complex'];
/** The largest file the repository may track, in bytes. */
export const MAX_BYTES = 20_000;

export const readJson = (f) => JSON.parse(readFileSync(f, 'utf8'));

/** Writes data as indented JSON, making the folder first. */
export function writeJson(file, data) {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

/**
 * A transcript's cost, a float in US dollars, as whole micro-dollars: the one rounding step for money read from claude,
 * half up, done once when it is read. Null when there is no cost.
 */
export const usdMicros = (usd) => (typeof usd === 'number' && Number.isFinite(usd) && usd >= 0 ? Math.round(usd * 1_000_000) : null);

/** realpath of a path that may not exist yet: the real nearest existing folder above it, plus the rest. */
export function realOrPlanned(p) {
  let cur = resolve(p);
  const rest = [];
  while (!existsSync(cur)) { rest.unshift(basename(cur)); cur = dirname(cur); }
  return join(realpathSync(cur), ...rest);
}

/** [from, to] pairs for a path and its real path. */
export function pathPairs(list) {
  const out = [];
  for (const [p, to] of list) {
    if (!p) continue;
    out.push([p, to]);
    try { const r = realpathSync(p); if (r !== p) out.push([r, to]); } catch { /* gone */ }
  }
  return out;
}

/** Every string in value with each pair replaced, longest first. Objects and arrays are copied. */
export function replaceDeep(value, pairs) {
  const sorted = pairs.filter(([f]) => f).sort((a, b) => b[0].length - a[0].length);
  const one = (s) => { let t = s; for (const [f, to] of sorted) t = t.split(f).join(to); return t; };
  const walk = (v) => {
    if (typeof v === 'string') return one(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(value);
}

export const firstLine = (s) => String(s ?? '').split(/\r?\n/).find((l) => l.trim())?.trim() ?? '';
export const lastLines = (s, n = 3) => String(s ?? '').split(/\r?\n/).filter((l) => l.trim()).slice(-n).join(' | ');

/**
 * Runs `node skill-eval.mjs <args>` with this environment (skill-eval itself gives each claude only its allowlist and
 * the --pass-env names) and echoes each output line to `out` with `prefix`. Resolves { code, stdout, stderr }.
 */
export function skillEval(args, { out = () => {}, prefix = '' } = {}) {
  return new Promise((done) => {
    const child = spawn(process.execPath, [SKILL_EVAL, ...args], { cwd: REPO, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    const buf = { stdout: '', stderr: '' };
    for (const k of ['stdout', 'stderr']) {
      let part = '';
      child[k].setEncoding('utf8');
      child[k].on('data', (d) => {
        buf[k] += d;
        part += d;
        const lines = part.split('\n');
        part = lines.pop();
        for (const l of lines) if (l.trim()) out(`${prefix}${l}`);
      });
      child[k].on('end', () => { if (part.trim()) out(`${prefix}${part}`); });
    }
    child.on('error', (e) => done({ code: null, stdout: buf.stdout, stderr: `${buf.stderr}${e.message}` }));
    child.on('close', (code) => done({ code, ...buf }));
  });
}
