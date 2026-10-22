// Shared setup for the instructions-audit tests: writing a file into a temporary project.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

/** Write `text` to `rel` under `root`, making the folders it needs; returns the full path. */
export const put = (root, rel, text = 'x\n') => { const p = join(root, rel); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, text); return p; };
