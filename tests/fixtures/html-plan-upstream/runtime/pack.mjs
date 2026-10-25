#!/usr/bin/env node
// A tiny stand-in for upstream html-plan runtime/pack.mjs, for tests/pack-html-plan.test.mjs and
// tests/html-plan-additions.test.mjs. It fills one <doc-code src> the way upstream does and prints the attributes it
// would add. The line that builds `extra` is copied word for word from upstream line 144, so the anchor is in it.
//   node pack.mjs <file> [lines=a-b] [start=n]
import { readFileSync } from 'node:fs';

const a = { src: process.argv[2] };
for (const arg of process.argv.slice(3)) { const [k, v] = arg.split('='); a[k] = v; }
const sha = '';
let text = readFileSync(a.src, 'utf8');
let start = 1;
if (a.lines) { const mm = a.lines.match(/^(\d+)(?:-(\d+))?$/); start = +mm[1]; const end = +(mm[2] || mm[1]); text = text.split('\n').slice(start - 1, end).join('\n'); }
        const extra = (a.file ? '' : ` file="${a.src}"`) + (a.start || !a.lines ? '' : ` start="${start}"`) + (sha && !a.sha ? ` sha="${String(sha).slice(0, 12)}"` : '');
console.log(extra);
