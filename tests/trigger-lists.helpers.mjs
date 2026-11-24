// Generic parts of tests/trigger-lists.test.mjs: word and dash helpers, the shape of a list, and the readers for the
// requests folder and the skill folders. The checks themselves, and the patterns that read a description, stay in the
// test file (tests/description-rules.test.mjs compares those patterns by path).
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const WORD = /[\p{L}\p{N}]/u;
export const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();
export const DASHES = [String.fromCharCode(0x2013), String.fromCharCode(0x2014)];

const isWord = (c) => c !== undefined && WORD.test(c);

// Apostrophes not between two letters or digits: two per phrase, so another count means a phrase was not read.
export function quoteMarks(text) {
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text[i] === "'" && !(isWord(text[i - 1]) && isWord(text[i + 1]))) n++;
  return n;
}

// Whole words only: "land it" is not in "island items".
export function holds(text, phrase) {
  if (!phrase) return false;
  for (let at = text.indexOf(phrase); at >= 0; at = text.indexOf(phrase, at + 1)) {
    if (!isWord(text[at - 1]) && !isWord(text[at + phrase.length])) return true;
  }
  return false;
}

const isObject = (v) => typeof v === 'object' && v !== null && !Array.isArray(v);
export const sameKeys = (o, keys) => Object.keys(o).sort().join() === keys.sort().join();

// Why the other checks cannot read the list, or undefined.
export function brokenShape(list) {
  if (!isObject(list)) return 'is not an object';
  if (!Array.isArray(list.should) || !list.should.every((r) => typeof r === 'string')) return 'should is not a list of strings';
  if (!Array.isArray(list.nearMisses)) return 'nearMisses is not a list';
  const bad = list.nearMisses.findIndex((n) => !isObject(n) || typeof n.request !== 'string' || typeof n.expect !== 'string');
  return bad < 0 ? undefined : `nearMisses[${bad}] needs a string request and expect`;
}

// Every entry in the requests folder, as { file, text } (text null for a folder).
export const readLists = (dir) => readdirSync(dir, { withFileTypes: true })
  .map((e) => ({ file: e.name, text: e.isFile() ? readFileSync(join(dir, e.name), 'utf8') : null }));

// Every skills/<plugin>/<skill>/ under root that holds a SKILL.md, as { name, text }.
export function readSkills(root) {
  const out = [];
  const dirs = (p) => readdirSync(p, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  for (const plugin of dirs(join(root, 'skills'))) {
    for (const name of dirs(join(root, 'skills', plugin))) {
      const file = join(root, 'skills', plugin, name, 'SKILL.md');
      if (existsSync(file)) out.push({ name, text: readFileSync(file, 'utf8') });
    }
  }
  return out;
}
