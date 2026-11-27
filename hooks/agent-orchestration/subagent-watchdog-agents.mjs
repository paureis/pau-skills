// Subagent watchdog, the agent definitions: is a project's own agent type read-only? (q38.md item 2). A reader or a
// critic of the project's own (tools Read, Bash, Write) reads for a hundred calls and writes one report at the end, by
// design, and the no-edit rule flagged it. So a type whose definition lists tools and none of Edit, MultiEdit or
// NotebookEdit is read-only: a lone Write is the report file. No tools field means the agent gets every tool, so it
// is not read-only; nor is one limited only by disallowedTools.
//
// The hook calls definedReadOnly() at SubagentStart only, and stores the answer in the agent's state. It reads the
// .md files (lower case) of <project>/.claude/agents and its subfolders, then the same under <home> (PAU_SKILLS_HOME,
// else the user's home, as for the config), and matches the type to the frontmatter name line, not to the file name.
// The first root with the name decides, so the project's definitions win over the user's; there, every definition of
// the name must be read-only. Links to files and folders are followed; hidden and git-ignored entries are read. Per
// root at most 200 .md files, 64 KB a file, 8 folder levels below .claude/agents, 200 folders (.claude/agents
// included) and 5,000 entries; a walk stopped at a limit leaves the root incomplete. Not read: plugin agents,
// CLAUDE_CONFIG_DIR, .MD files. Facts from headless runs (Claude Code 2.1.332, empty HOME, the init event's agents
// list): SubagentStart's agent_type is the name line ("lector" from lector-file.md), and the input names no definition
// file (2026-11-26). A README.md and a prompt with no frontmatter do not load; a "---" first line led by a BOM or with
// trailing spaces loads, one after a blank line or leading spaces does not (2026-11-26). Subfolders at any depth, a
// linked file, a linked folder, hidden and git-ignored ones load; the same name at top level and in a subfolder is one
// agent, which copy wins is not known; no description, an empty one ("", '', or no indented line after it), null, ~ or
// only a comment drop the file; "tools: [Read, Grep" loads with Grep alone; a .MD file does not load (2026-11-27). So a
// file with no frontmatter, or no description, is skipped. A flow list carried on to the next line loads too, but is
// not read here: that line could hold an Edit. Any other read or parse error, or a root left incomplete, is an unknown,
// which means "not read-only": it might be the type's own definition. tools: null or ~ counts as no tools field.
import * as fs from 'node:fs';
import { join } from 'node:path';

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'NotebookEdit']);
const MAX_FILES = 200; // .md files per root, across the tree
const MAX_BYTES = 64 * 1024;
const MAX_DEPTH = 8; // folder levels below .claude/agents
const MAX_DIRS = 200; // folders per root, .claude/agents included
const MAX_ENTRIES = 5000; // entries stat'd per root, of any kind
const NULLS = new Set(['null', 'Null', 'NULL', '~']);

/** A YAML scalar: the text inside quotes, or the plain text before a comment. undefined for text after a quote. */
function scalar(v) {
  const q = v[0];
  if (q === '"' || q === "'") {
    const end = v.indexOf(q, 1);
    if (end < 0) return undefined;
    const rest = v.slice(end + 1).trim();
    return rest === '' || rest[0] === '#' ? v.slice(1, end) : undefined;
  }
  const c = v.search(/\s#/);
  return (c >= 0 ? v.slice(0, c) : v).trim();
}

/** Split at commas outside parentheses: "Bash(git add, git commit), Read" is two entries. */
function entries(v) {
  const out = [];
  let depth = 0; let from = 0;
  for (let i = 0; i < v.length; i++) {
    if (v[i] === '(') depth++;
    else if (v[i] === ')') depth = Math.max(0, depth - 1);
    else if (v[i] === ',' && depth === 0) { out.push(v.slice(from, i)); from = i + 1; }
  }
  out.push(v.slice(from));
  return out;
}

/** A tool name from one list entry: unquoted, with a (...) suffix such as Bash(git *) dropped. */
function toolName(e) {
  const s = scalar(e.trim());
  if (s === undefined) return undefined;
  const i = s.indexOf('(');
  return (i >= 0 ? s.slice(0, i) : s).trim();
}

/**
 * The tools of a "tools:" value on its line, a comma list or a flow list [a, b]: { tools, open }, or undefined when it
 * does not parse. A flow list not closed on its line (open) is a comma list of the whole value, as Claude Code 2.1.332
 * reads it: the first entry keeps its "[" and names no tool, so it is dropped ("[Read, Grep" is Grep alone).
 */
function inlineTools(v) {
  let s = v; let open = false;
  if (s.startsWith('[')) {
    const c = s.search(/\s#/);
    s = (c >= 0 ? s.slice(0, c) : s).trim();
    open = !s.endsWith(']');
    if (!open) s = s.slice(1, -1);
  } else {
    s = scalar(s);
    if (s === undefined) return undefined;
  }
  const names = entries(s).map(toolName).slice(open ? 1 : 0);
  return names.includes(undefined) ? undefined : { tools: names.filter((n) => n !== ''), open };
}

/** The lines of a text, after an optional byte order mark. */
function textLines(text) {
  let t = String(text);
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1);
  return t.split(/\r?\n/);
}

/**
 * Frontmatter opens when the first line, trailing white space dropped, is "---". The hook skips only files Claude Code
 * would not load; Claude Code also needs a line break after "---", a closing line and a name, so some files it skips still
 * count here as a possible match (the cautious side).
 */
const opens = (lines) => lines[0].trimEnd() === '---';

/**
 * One agent definition's frontmatter: { name (a string, or null when there is none), readOnly, described }, or null
 * when the text has no frontmatter that parses (no "---" first line or closing line, a key given twice, a list that
 * does not parse, a flow list not closed on its line that goes on to the next line). readOnly: a tools field (a comma
 * list, a flow list or a block list) that names at least one tool and none of Edit, MultiEdit, NotebookEdit or "*".
 * described: a description that is not empty. Claude Code 2.1.332 drops a file with none, an empty one
 * ("description:" with no indented line after it, "", ''), or an unquoted null, Null, NULL or ~. A value that is only
 * a comment is empty.
 */
export function parseDefinition(text) {
  const lines = textLines(text);
  if (!opens(lines)) return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
  if (end < 0) return null;
  const fields = new Map();
  let block = null; // the tools block list being read
  let open = false; // the tools flow list on the line before was not closed
  let empty = null; // the key on the line before, when its value was empty
  for (const line of lines.slice(1, end)) {
    if (line.trim() === '' || line.trimStart()[0] === '#') continue;
    const prev = empty; empty = null;
    if (block !== null && /^\s*-(\s|$)/.test(line)) {
      const name = toolName(line.slice(line.indexOf('-') + 1));
      if (name === undefined) return null;
      if (name !== '') block.push(name);
      continue;
    }
    const key = /^([A-Za-z_][\w-]*):/.exec(line);
    const rest = key ? line.slice(key[0].length) : '';
    if (!key || (rest !== '' && !/^\s/.test(rest))) {
      if (block !== null) return null; // an indented line in the block list that is not an item
      if (open) return null; // the flow list goes on: read on one line only, it could hide an Edit
      if (prev === 'description' && /^\s/.test(line)) fields.set('description', line.trim());
      continue; // a line under another key, such as a multi-line description
    }
    block = null; open = false;
    if (fields.has(key[1])) return null;
    const value = rest.trim()[0] === '#' ? '' : rest.trim();
    if (value === '') empty = key[1];
    if (key[1] === 'tools' && !/^["']/.test(value) && NULLS.has(scalar(value))) {
      fields.set('tools', undefined); // tools: null or ~ (unquoted) is no tools field
    } else if (key[1] === 'tools') {
      const t = value === '' ? { tools: (block = []), open: false } : inlineTools(value);
      if (t === undefined) return null;
      open = t.open;
      fields.set('tools', t.tools);
    } else {
      const v = scalar(value);
      if (v === undefined) return null;
      fields.set(key[1], key[1] === 'description' && !/^["']/.test(value) && NULLS.has(v) ? '' : v);
    }
  }
  const tools = fields.get('tools');
  const readOnly = tools !== undefined && tools.length > 0 && !tools.some((n) => EDIT_TOOLS.has(n) || n === '*');
  const described = Boolean(fields.get('description'));
  return { name: fields.has('name') ? fields.get('name') : null, readOnly, described };
}

const NO_FRONTMATTER = Symbol('no frontmatter');

/**
 * One definition file: its parsed frontmatter; NO_FRONTMATTER for a file read in full whose first line does not open
 * one (not an agent definition); null for a file over 64 KB, one that cannot be read, or frontmatter that does not parse.
 */
function definition(file, io) {
  try {
    if (io.statSync(file).size > MAX_BYTES) return null;
    const text = io.readFileSync(file, 'utf8');
    return opens(textLines(text)) ? parseDefinition(text) : NO_FRONTMATTER;
  } catch {
    return null;
  }
}

/**
 * The parsed definitions under dir and its subfolders, read breadth first so each real folder is first reached at its
 * smallest depth; links to files and folders are followed (statSync). [] when dir cannot be listed. null for an
 * unknown: an entry that cannot be listed, stat'd or read (a dangling or looping link of any name), a definition()
 * null, or a limit that stops the walk (the root is then incomplete). A real folder already read is skipped silently.
 */
function tree(dir, io) {
  const defs = [];
  const seen = new Set();
  try { seen.add(io.realpathSync(dir)); } catch { return defs; }
  const queue = [[dir, 0]];
  let files = 0; let count = 0;
  for (let q = 0; q < queue.length; q++) {
    const [folder, depth] = queue[q];
    let names;
    // shortcut: a folder is listed in full before the entry cap applies; read it with opendirSync if a folder of
    // millions of entries under .claude/agents ever shows up.
    try { names = io.readdirSync(folder); } catch { return q === 0 ? defs : null; }
    for (const name of names) {
      if (++count > MAX_ENTRIES) return null;
      const path = join(folder, name);
      try {
        const st = io.statSync(path);
        if (st.isDirectory()) {
          const real = io.realpathSync(path);
          if (seen.has(real)) continue;
          if (depth + 1 > MAX_DEPTH || seen.size >= MAX_DIRS) return null;
          seen.add(real);
          queue.push([path, depth + 1]);
        } else if (st.isFile() && name.endsWith('.md')) {
          if (++files > MAX_FILES) return null;
          const d = definition(path, io);
          if (d === null) return null;
          if (d !== NO_FRONTMATTER) defs.push(d);
        }
      } catch {
        return null;
      }
    }
  }
  return defs;
}

/**
 * True when the agent type is read-only by its definitions: the project's .claude/agents tree, or else the home one.
 * In the first root with a definition of that name (a frontmatter name line and a description; a file Claude Code
 * 2.1.332 drops for no description is skipped), true only when every definition of that name there is read-only and
 * no unknown was met in that root or an earlier one. An unknown (see tree(): a file over 64 KB, unreadable, or opening
 * frontmatter that does not parse, or a walk stopped at a limit) might be the type's own definition, so it makes the
 * answer false wherever it is in the root. A file with no frontmatter (its first line, after a BOM and with trailing
 * white space dropped, is not "---") is not an agent definition, so it is skipped; it still counts toward the 200
 * files. The walk order does not change the answer.
 */
export function definedReadOnly(type, { project, home, io = fs } = {}) {
  if (typeof type !== 'string' || type === '') return false;
  for (const root of [project, home]) {
    if (typeof root !== 'string' || root === '') continue;
    const defs = tree(join(root, '.claude', 'agents'), io);
    if (defs === null) return false; // an unknown: the answer is false in this root and in every later one
    const same = defs.filter((d) => d.described && d.name === type);
    if (same.length > 0) return same.every((d) => d.readOnly);
  }
  return false;
}
