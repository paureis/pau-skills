// Shared setup for tests/pack-html-plan.test.mjs and tests/html-plan-additions.test.mjs: the fake upstream, a copy of
// it to change, the build run, and the zip read back. Temporary folders are removed when the test file is done.
import { cpSync, readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode } from './helpers.mjs';
import { tmp, readZip, files } from './pack-skills.helpers.mjs';

export const BUILD = repo('scripts', 'pack-html-plan.mjs');
export const FIXTURE = repo('tests', 'fixtures', 'html-plan-upstream');
export const addition = (name) => readFileSync(repo('scripts', 'html-plan', name));
export const upstreamFile = (rel) => readFileSync(join(FIXTURE, rel));

/** A copy of the fake upstream that a test may change. */
export function copyFixture() {
  const dir = join(tmp('html-plan-upstream-'), 'html-plan');
  cpSync(FIXTURE, dir, { recursive: true });
  return dir;
}

/** Every file under `dir`, as sorted paths relative to it. */
export function listFiles(dir, rel = '') {
  return readdirSync(join(dir, rel)).flatMap((name) => {
    const r = rel ? `${rel}/${name}` : name;
    return statSync(join(dir, r)).isDirectory() ? listFiles(dir, r) : [r];
  }).sort();
}

/** Run the build on `upstream` into a fresh (or the given) --out folder, and read back what it wrote. */
export function build(upstream, { out = tmp('html-plan-out-'), args, cwd } = {}) {
  const r = runNode(BUILD, { args: args || ['--upstream', upstream, '--out', out], cwd });
  const file = join(out, 'html-plan.zip');
  const zip = existsSync(file) ? readFileSync(file) : null;
  return { ...r, out, zip, entries: zip ? readZip(zip) : [], listing: existsSync(out) ? readdirSync(out).sort() : [] };
}

/** The data of html-plan/<rel> in a build's zip, or undefined. */
export const entry = (r, rel) => files(r.entries).find((e) => e.name === `html-plan/${rel}`)?.data;
