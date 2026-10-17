#!/usr/bin/env node
// todo: a tiny command-line to-do list used to try the verify-app skill. Node standard library only.
//
//   node todo.mjs [--file <path>] add <text...>     prints "added <id>: <text>"
//   node todo.mjs [--file <path>] list [--json]     one line per item, "[x]" when done; or a JSON array
//   node todo.mjs [--file <path>] done <id>         marks it done; exit 1 when there is no such item
//   node todo.mjs --version
//
// The list is kept in --file, else $TODO_FILE, else ./todo.json. Exit codes: 0 done, 1 no such item, 2 usage.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const USAGE = 'usage: todo [--file <path>] add <text...> | list [--json] | done <id> | --version';
const args = process.argv.slice(2);
let file = process.env.TODO_FILE || 'todo.json';
if (args[0] === '--file') { file = args[1]; args.splice(0, 2); }
if (!file) { console.error(USAGE); process.exit(2); }
file = resolve(file);

if (args[0] === '--version') { console.log('todo 1.0.0'); process.exit(0); }

const load = () => (existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { nextId: 1, items: [] });
const store = (s) => writeFileSync(file, JSON.stringify(s, null, 2));

const [cmd, ...rest] = args;
if (cmd === 'add' && rest.length) {
  const s = load();
  const item = { id: s.nextId++, text: rest.join(' '), done: false };
  s.items.push(item);
  store(s);
  console.log(`added ${item.id}: ${item.text}`);
} else if (cmd === 'list' && (rest.length === 0 || (rest.length === 1 && rest[0] === '--json'))) {
  const { items } = load();
  if (rest[0] === '--json') console.log(JSON.stringify(items));
  else if (items.length === 0) console.log('nothing to do');
  else for (const i of items) console.log(`${i.done ? '[x]' : '[ ]'} ${i.id} ${i.text}`);
} else if (cmd === 'done' && rest.length === 1 && /^\d+$/.test(rest[0])) {
  const s = load();
  const item = s.items.find((i) => i.id === Number(rest[0]));
  if (!item) { console.error(`no item ${rest[0]}`); process.exit(1); }
  item.done = true;
  store(s);
  console.log(`done ${item.id}: ${item.text}`);
} else {
  console.error(USAGE);
  process.exit(2);
}
