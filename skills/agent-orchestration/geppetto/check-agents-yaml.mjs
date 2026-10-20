// check-agents-yaml.mjs: the YAML subset that check-agents.mjs reads in agent frontmatter. Imported by its other
// modules; it runs nothing on its own.
// ---------------------------------------------------------------------------------------------------------------
// The YAML subset.

class YamlError extends Error {}

const ESCAPES = { 0: '\0', a: '\x07', b: '\b', t: '\t', n: '\n', v: '\v', f: '\f', r: '\r', e: '\x1b', ' ': ' ',
  '"': '"', '/': '/', '\\': '\\', N: '\x85', _: '\xa0' };

// A quoted value. `raw` starts just after the opening quote and may hold later lines. Line breaks fold to spaces.
function quoted(raw, quote) {
  let out = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    if (c === quote && quote === "'" && raw[i + 1] === "'") { out += "'"; i++; continue; }
    if (c === quote) return { value: out, rest: raw.slice(i + 1).split('\n')[0] };
    if (c === '\\' && quote === '"') {
      const n = raw[i + 1];
      if (n === 'x' || n === 'u' || n === 'U') {
        const len = { x: 2, u: 4, U: 8 }[n];
        const hex = raw.slice(i + 2, i + 2 + len);
        if (!new RegExp(`^[0-9a-fA-F]{${len}}$`).test(hex)) throw new YamlError(`bad \\${n} escape`);
        out += String.fromCodePoint(parseInt(hex, 16));
        i += 1 + len;
        continue;
      }
      if (n === '\n') { i++; while (raw[i + 1] === ' ' || raw[i + 1] === '\t') i++; continue; }
      if (!(n in ESCAPES)) throw new YamlError(`unknown escape \\${n}`);
      out += ESCAPES[n];
      i++;
      continue;
    }
    if (c === '\n') {
      out = out.replace(/[ \t]+$/, '');
      let breaks = 0;
      while (raw[i] === '\n') { breaks++; i++; while (raw[i] === ' ' || raw[i] === '\t') i++; }
      out += breaks > 1 ? '\n'.repeat(breaks - 1) : ' ';
      i--;
      continue;
    }
    out += c;
  }
  throw new YamlError(`a ${quote === '"' ? 'double' : 'single'}-quoted value is never closed`);
}

const stripComment = (s) => s.replace(/(^|\s+)#.*$/, '');

// A plain scalar: true, false, null, an integer, or text.
function scalar(text) {
  if (/^(true|True|TRUE)$/.test(text)) return true;
  if (/^(false|False|FALSE)$/.test(text)) return false;
  if (/^(null|Null|NULL|~)?$/.test(text)) return null;
  if (/^[-+]?\d+$/.test(text)) return Number(text);
  return text;
}

// An anchor (`&name `) in front of a value names it for later aliases; the value itself is what follows.
const ANCHOR = /^&[^\s[\]{},]+(\s+|$)/;

function plain(lines) {
  const parts = [];
  let ended = false;
  for (const [k, raw] of lines.entries()) {
    let line = raw.trim();
    if (k > 0 && !line) continue;
    if (k > 0 && line.startsWith('#')) { ended = true; continue; }
    if (ended) throw new YamlError(`a comment ends the value, and the line after it continues it: ${JSON.stringify(raw)}`);
    if (k === 0) line = line.replace(ANCHOR, '');
    const text = stripComment(line);
    if (k === 0 && /^([*!%@`|>]|- |-$|\? )/.test(text)) {
      throw new YamlError(`a value starting with ${JSON.stringify(text[0])} is YAML this script does not read`);
    }
    if (/: |:$/.test(text)) throw new YamlError(`a plain value cannot contain ": " (quote it): ${JSON.stringify(line)}`);
    parts.push(text);
    if (text !== line) ended = true;
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}

function blockScalar(header, lines) {
  const m = /^([|>])([1-9]?)([+-]?)([1-9]?)$/.exec(stripComment(header).trim());
  if (!m) throw new YamlError(`bad block header ${JSON.stringify(header)}`);
  const first = lines.find((l) => l.trim());
  const indent = Number(m[2] || m[4]) || (first ? /^ */.exec(first)[0].length : 0);
  const body = lines.map((l) => (l.trim() ? l.slice(indent) : ''));
  while (body.length && body[body.length - 1] === '') body.pop();
  if (!body.length) return '';
  let out;
  if (m[1] === '|') out = body.join('\n');
  else {
    out = '';
    let pending = 0;
    for (const [k, l] of body.entries()) {
      if (l === '') { pending++; continue; }
      if (k - pending > 0) out += pending ? '\n'.repeat(pending) : ' ';
      out += l;
      pending = 0;
    }
  }
  return m[3] === '-' ? out : `${out}\n`;
}

// Split a flow list's inside on commas that are not inside brackets or quotes.
function splitFlow(inner) {
  const items = [];
  let depth = 0;
  let quote = null;
  let cur = '';
  for (const c of inner) {
    if (quote) { cur += c; if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") { quote = c; cur += c; continue; }
    if (c === '[' || c === '{' || c === '(') depth++;
    if (c === ']' || c === '}' || c === ')') depth--;
    if (c === ',' && depth === 0) { items.push(cur); cur = ''; continue; }
    cur += c;
  }
  if (quote) throw new YamlError('a quoted value in a list is never closed');
  if (cur.trim()) items.push(cur);
  return items.map((s) => s.trim()).filter(Boolean);
}

function flowItem(s) {
  if (s.startsWith('"') || s.startsWith("'")) {
    const { value, rest } = quoted(s.slice(1), s[0]);
    if (rest.trim()) throw new YamlError(`text after a closing quote: ${JSON.stringify(rest.trim())}`);
    return value;
  }
  if (/^[[{]/.test(s)) return s; // nested flow value, kept as written
  return scalar(s);
}

// A flow value ([...] or {...}) that may continue on later lines.
function flow(head, more) {
  const open = head[0];
  const close = open === '[' ? ']' : '}';
  const text = [head, ...more.map((l) => l.trim())].map(stripComment).join(' ').trim();
  let depth = 0;
  let quote = null;
  let end = -1;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === quote) quote = null; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') { depth--; if (depth === 0) { end = i; break; } }
  }
  if (end < 0 || text[end] !== close) throw new YamlError(`a ${open}...${close} value is never closed`);
  if (text.slice(end + 1).trim()) throw new YamlError(`text after ${close}: ${JSON.stringify(text.slice(end + 1).trim())}`);
  const inner = text.slice(1, end);
  if (open === '{') return { flowMap: text.slice(0, end + 1) };
  return splitFlow(inner).map(flowItem);
}

// An indented block under a key with no value on its line: a `- item` list, or a nested map kept as its lines.
function nested(lines) {
  const content = lines.filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (!content.length) return null;
  if (content.some((l) => /^\s*\t/.test(l))) throw new YamlError('tabs cannot indent YAML');
  const indent = /^ */.exec(content[0])[0].length;
  if (/^-( |$)/.test(content[0].trim())) {
    const items = [];
    for (const l of content) {
      const own = /^ */.exec(l)[0].length;
      if (own < indent) throw new YamlError(`bad indentation: ${JSON.stringify(l)}`);
      if (own > indent) { if (!items.length) throw new YamlError('bad indentation'); items[items.length - 1] = { complex: true }; continue; }
      const m = /^-(?: +(.*))?$/.exec(l.trim());
      if (!m) throw new YamlError(`a list line must start with "- ": ${JSON.stringify(l)}`);
      const v = stripComment(m[1] || '').trim().replace(ANCHOR, '');
      const pair = /^[^"'[{][^:]*:( (.*)|$)/.exec(v);
      if (pair) {
        if (/^\*/.test((pair[2] || '').trim())) throw new YamlError(`the list item ${JSON.stringify(v)} reads as "key: *alias", and the alias is never defined (quote the item)`);
        items.push({ complex: true, text: v });
        continue;
      }
      items.push(v.startsWith('[') || v.startsWith('{') ? flow(v, []) : flowItem(v));
    }
    return items;
  }
  for (const l of content) {
    if (/^ */.exec(l)[0].length < indent) throw new YamlError(`bad indentation: ${JSON.stringify(l)}`);
    if (/^ */.exec(l)[0].length === indent && !/^(["']?)[^"'#\s][^"']*?\1\s*:(\s|$)/.test(l.trim())) {
      throw new YamlError(`a nested line is not "key: value": ${JSON.stringify(l)}`);
    }
  }
  return { nested: content.map((l) => l.slice(indent)) };
}

// One `key: value` entry, read strictly first. When that fails, Claude Code (2.1.303) parses again with an inline
// value read as the plain text of its line, which is how `description: Use when: x` still loads. A value that is
// quoted, a block, or a nested list or map gets no second chance, and neither does an inline value with indented
// lines after it.
function entryValue(line, head, more) {
  try {
    if (!head || head.startsWith('#')) return nested(more);
    if (head.startsWith('"') || head.startsWith("'")) {
      const raw = [line.slice(line.indexOf(head[0], line.indexOf(':')) + 1), ...more].join('\n');
      const { value, rest } = quoted(raw, head[0]);
      if (stripComment(rest).trim()) throw new YamlError(`text after the closing quote: ${JSON.stringify(rest.trim())}`);
      return value;
    }
    if (head.startsWith('|') || head.startsWith('>')) return blockScalar(head, more);
    if (head.startsWith('[') || head.startsWith('{')) return flow(head, more);
    return scalar(plain([head, ...more]));
  } catch (e) {
    if (!(e instanceof YamlError)) throw e;
    const lenient = head && !/^["'|>#]/.test(head) && !more.some((l) => l.trim() && !l.trim().startsWith('#'));
    if (lenient) return head;
    throw e;
  }
}

/**
 * Parse an agent file. Returns { data, body, error, failed, repeated }: data is null when the file has no
 * frontmatter. When an entry cannot be read, `error` says why, `failed` lists its key (or the line), and the other
 * entries are still read, so the checks that do not need the failed field can run.
 */
export function parseFrontmatter(text) {
  const lines = text.replace(/^﻿/, '').split(/\r?\n/);
  if (lines[0].trimEnd() !== '---') return { data: null, body: text, failed: [], repeated: [] };
  const close = lines.findIndex((l, i) => i > 0 && l.trimEnd() === '---');
  if (close < 0) return { data: {}, body: '', error: 'the frontmatter has no closing --- line', failed: ['*'], repeated: [], unclosed: true };
  let front = lines.slice(1, close);
  const body = lines.slice(close + 1).join('\n');
  // A frontmatter block indented as a whole is still one map.
  const content = front.filter((l) => l.trim() && !/^\s*#/.test(l));
  const indent = content.length ? Math.min(...content.map((l) => /^ */.exec(l)[0].length)) : 0;
  if (indent) front = front.map((l) => l.slice(Math.min(indent, /^ */.exec(l)[0].length)));
  const data = {};
  const failed = [];
  const repeated = [];
  const problems = [];
  for (let i = 0; i < front.length; i++) {
    const line = front[i];
    if (!line.trim() || /^\s*#/.test(line)) continue;
    const m = /^(?:"([^"]+)"|'([^']+)'|([^\s"'#:-][^:]*?|-[^\s:][^:]*?))\s*:(?:\s+(.*))?$/.exec(line);
    if (/^\s/.test(line) || !m) {
      problems.push(`line ${i + 2} is not "key: value": ${JSON.stringify(line)}`);
      failed.push(`line ${i + 2}`);
      continue;
    }
    const key = m[1] ?? m[2] ?? m[3];
    const head = (m[4] || '').trim();
    // The entry's own lines: indented ones, blank ones, and, under a key with no inline value, a list that starts at
    // the key's own column (YAML allows `tools:` followed by `- Read`).
    let end = i + 1;
    const listAtColumn = !head || head.startsWith('#');
    while (end < front.length && (!front[end].trim() || /^\s/.test(front[end]) || (listAtColumn && /^-( |$)/.test(front[end])))) end++;
    const more = front.slice(i + 1, end);
    i = end - 1;
    if (Object.hasOwn(data, key) || failed.includes(key)) repeated.push(key);
    try {
      data[key] = entryValue(line, head, more);
      const at = failed.indexOf(key);
      if (at >= 0) failed.splice(at, 1);
    } catch (e) {
      if (!(e instanceof YamlError)) throw e;
      problems.push(`${key}: ${e.message}`);
      failed.push(key);
      delete data[key];
    }
  }
  return { data, body, failed, repeated, ...(problems.length ? { error: problems.join('; ') } : {}) };
}

/** A tools or disallowedTools value as a list of entries; commas inside parentheses stay inside their entry. */
export function parseTools(value) {
  if (value === undefined || value === null) return [];
  if (Array.isArray(value)) return value.flatMap((v) => (typeof v === 'string' ? parseTools(v) : [])).filter(Boolean);
  return splitFlow(String(value));
}

const toolName = (entry) => entry.replace(/\(.*$/s, '').trim();

export { toolName };
