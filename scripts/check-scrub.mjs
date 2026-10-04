#!/usr/bin/env node
// Scrub check: fail if any file in the repository carries something that belongs to a private project.
//
//   node scripts/check-scrub.mjs        exit 0 clean, 1 with one line per hit
//
// Scans every tracked file plus untracked files that are not ignored, so it works before the first commit.
// This file is excluded from its own scan (it has to name what it looks for). The denylist is kept generic:
// product, company and person names, account-identifier shapes, machine paths, and untranslated text.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const self = relative(root, fileURLToPath(import.meta.url)).replace(/\\/g, '/');

const RULES = [
  // Private products, clients and companies (case-insensitive).
  ['private name', /miconsultorio|refresh\s*radar|talent\s*scout|forward\s*thinkers|cyberse|clickup|sonrisa\s*integral|passive[- ]income/i],
  ['private name', /\bneo\b(?![-.]?\d)/i],
  // People other than the author.
  ['person', /\bmanuel\b/i],
  // The author's name is allowed only where authorship is stated.
  ['author name outside credits', /\bpau\b(?!-skills|reis)|\balvaro\b/i, (f) => !/^(README\.md|LICENSE|NOTICE|\.claude-plugin\/marketplace\.json|plugins\/[^/]+\/\.claude-plugin\/plugin\.json)$/.test(f)],
  // Account and project identifiers.
  ['supabase project ref', /\b[a-z]{20}\.supabase\.(co|in)\b|\bref\b[^\n]{0,24}\b[a-z]{20}\b|project-ref[^\n]{0,24}\b[a-z]{20}\b/i],
  ['vercel host', /\b[a-z0-9-]+\.vercel\.app\b/i],
  ['personal email', /@(gmail|hotmail|outlook|yahoo|icloud)\./i],
  ['email address', /\b[A-Za-z0-9._%+-]+@(?!example\.(com|org)\b)[A-Za-z0-9.-]+\.(com|net|org|io|app|dev|clinic|test)\b/],
  // Absolute paths from a personal machine.
  ['machine path', /[A-Za-z]:[\\/]+Users\b|\/c\/Users\/|\b[D-Z]:\\|\/Users\/[a-z]+\/|\/home\/[a-z]+\//i],
  // A scaffold from scripts/new-skill.mjs that was never filled in.
  ['unfilled scaffold placeholder', /TODO\(new-skill\)/, (f) => !/^(scripts\/new-skill\.mjs|tests\/new-skill\.test\.mjs|docs\/ADDING-A-SKILL\.md)$/.test(f)],
  // Untranslated Spanish: accented letters, inverted punctuation, and common words that never occur in English prose.
  ['non-English text', /[áéíóúñÁÉÍÓÚÑ¿¡]/],
  ['non-English text', /\b(hoja de ruta|bit[aá]cora|cierre|regla del|elemento|fusionar|guardia|reposo|mutaci[oó]n|pruebas|seguridad|consultorio|ci[oó]n|tambi[eé]n|seg[uú]n|est[aá] )\b/i],
  ['non-English text', /\b(de la|de los|en el|que no|para el|por el|con el|es un|una vez|sin el)\b/i],
];

const files = execFileSync('git', ['-C', root, 'ls-files', '-co', '--exclude-standard'], { encoding: 'utf8' })
  .split('\n').filter(Boolean).filter((f) => f !== self);

let hits = 0;
for (const f of files) {
  let text;
  try { text = readFileSync(join(root, f), 'utf8'); } catch { continue; }
  if (text.includes('\u0000')) continue; // binary
  const lines = text.split(/\r?\n/);
  for (const [label, re, applies] of RULES) {
    if (applies && !applies(f)) continue;
    lines.forEach((line, i) => {
      const m = re.exec(line);
      if (m) { hits++; console.log(`${f}:${i + 1}: ${label}: ${JSON.stringify(m[0])}`); }
    });
  }
}
console.log(hits ? `\nSCRUB FAILED: ${hits} hit(s) in ${files.length} files.` : `Scrub check passed: ${files.length} files, no hits.`);
process.exit(hits ? 1 : 0);
