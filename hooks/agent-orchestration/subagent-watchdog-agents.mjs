// Subagent watchdog, the agent definitions: is a project's own agent type read-only? (q38.md item 2). A reader or a
// critic of the project's own (tools Read, Bash, Write) reads for a hundred calls and writes one report at the end, by
// design, and the no-edit rule flagged it. So a type whose definition lists tools and none of Edit, MultiEdit or
// NotebookEdit is read-only: a lone Write is the report file. No tools field means the agent gets every tool, so it
// is not read-only; nor is one limited only by disallowedTools.
//
// The hook calls definedReadOnly() at SubagentStart only, and stores the answer in the agent's state. It reads
// <project>/.claude/agents/*.md, then <home>/.claude/agents/*.md (home is PAU_SKILLS_HOME, else the user's home, as
// for the config), and matches the type to the frontmatter name line, not to the file name; the first folder with
// the name wins, so the project's definition wins over the user's. Not read: plugin agents, CLAUDE_CONFIG_DIR,
// subfolders, links, a file over 64 KB, files past the first 200 .md files of a folder (sorted by name). Facts from a
// headless run (Claude Code 2.1.332, 2026-11-26): SubagentStart's agent_type is the name line ("lector" from the file
// lector-file.md), and the input names no definition file. A .md file with no frontmatter is not an agent definition
// and is skipped: its first line, after an optional BOM and with trailing white space dropped, is not "---" (an empty
// file has none). Probes of the same version (headless, empty HOME): a README.md and a plain prompt with no frontmatter
// were missing from the init event's agents list; a "---" line led by a BOM or with trailing spaces loads, and one
// after a blank line or after leading spaces does not. Any other read or parse error means "not read-only", which is
// the rule as it was before: a .md file over 64 KB, unreadable, or opening frontmatter that does not parse, seen before
// the match, might be the type's own definition, so it makes the answer false. tools: null or ~ counts as no tools
// field.
import * as fs from 'node:fs';
import { join } from 'node:path';

const EDIT_TOOLS = new Set(['Edit', 'MultiEdit', 'NotebookEdit']);
const MAX_FILES = 200;
const MAX_BYTES = 64 * 1024;
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

/** The tools of a "tools:" value on its line: a comma list or a flow list [a, b]. undefined when it does not parse. */
function inlineTools(v) {
  let s = v;
  if (s.startsWith('[')) {
    const c = s.search(/\s#/);
    s = (c >= 0 ? s.slice(0, c) : s).trim();
    if (!s.endsWith(']')) return undefined;
    s = s.slice(1, -1);
  } else {
    s = scalar(s);
    if (s === undefined) return undefined;
  }
  const names = entries(s).map(toolName);
  return names.includes(undefined) ? undefined : names.filter((n) => n !== '');
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
 * One agent definition's frontmatter: { name (a string, or null when there is none), readOnly }, or null when the text
 * has no frontmatter that parses (no "---" first line or closing line, a key given twice, a list that does not parse).
 * readOnly: a tools field (a comma list, a flow list or a block list) that names at least one tool and none of Edit,
 * MultiEdit, NotebookEdit or "*".
 */
export function parseDefinition(text) {
  const lines = textLines(text);
  if (!opens(lines)) return null;
  const end = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
  if (end < 0) return null;
  const fields = new Map();
  let block = null; // the tools block list being read
  for (const line of lines.slice(1, end)) {
    if (line.trim() === '' || line.trimStart()[0] === '#') continue;
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
      continue; // a line under another key, such as a multi-line description
    }
    block = null;
    if (fields.has(key[1])) return null;
    const value = rest.trim();
    if (key[1] === 'tools' && !/^["']/.test(value) && NULLS.has(scalar(value))) {
      fields.set('tools', undefined); // tools: null or ~ (unquoted) is no tools field
    } else if (key[1] === 'tools') {
      const tools = value === '' ? (block = []) : inlineTools(value);
      if (tools === undefined) return null;
      fields.set('tools', tools);
    } else {
      const v = scalar(value);
      if (v === undefined) return null;
      fields.set(key[1], v);
    }
  }
  const tools = fields.get('tools');
  const readOnly = tools !== undefined && tools.length > 0 && !tools.some((n) => EDIT_TOOLS.has(n) || n === '*');
  return { name: fields.has('name') ? fields.get('name') : null, readOnly };
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
 * True when the agent type's definition, in the project's agents folder or else the home one, is read-only. A file
 * seen before the match that is over 64 KB, cannot be read, or opens frontmatter that does not parse might be the
 * type's own definition, so it makes the answer false. A file with no frontmatter (its first line, after a BOM and
 * with trailing white space dropped, is not "---") is not an agent definition for Claude Code 2.1.332, so it is
 * skipped; it still counts toward the 200 files.
 */
export function definedReadOnly(type, { project, home, io = fs } = {}) {
  if (typeof type !== 'string' || type === '') return false;
  let unknown = false;
  for (const root of [project, home]) {
    if (typeof root !== 'string' || root === '') continue;
    const dir = join(root, '.claude', 'agents');
    let names;
    try {
      names = io.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile() && d.name.endsWith('.md')).map((d) => d.name);
    } catch {
      continue;
    }
    for (const name of names.sort().slice(0, MAX_FILES)) {
      const d = definition(join(dir, name), io);
      if (d === NO_FRONTMATTER) continue;
      if (d === null) unknown = true;
      else if (d.name === type) return !unknown && d.readOnly;
    }
  }
  return false;
}
