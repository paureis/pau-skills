/**
 * The READINESS.md table and profile block of the launch-readiness skill: parse and write without loss. Cells escape
 * backslash, pipe and line breaks; prose outside the table and the "```json launch-readiness" block, and every row
 * line that did not change, are written back byte for byte. Node standard library only.
 */
export const COLUMNS = ['id', 'area', 'stage', 'severity', 'status', 'source', 'evidence', 'files', 'date', 'expires'];
export const STATUSES = ['pass', 'fail', 'likely', 'unknown', 'n/a', 'recheck'];
export const SEVERITIES = ['must-fix', 'can-wait'];
export const SOURCES = ['code', 'command', 'probe', 'answer'];
const META_OPEN = '```json launch-readiness';
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// Cells: backslash, pipe, carriage return and newline are escaped; any other backslash reads as itself.
export function escapeCell(s) {
  return String(s).replace(/[\\|\r\n]/g, (c) => ({ '\\': '\\\\', '|': '\\|', '\r': '\\r', '\n': '\\n' })[c]);
}

export function unescapeCell(s) {
  return s.replace(/\\([\\|rn])/g, (_, c) => ({ '\\': '\\', '|': '|', r: '\r', n: '\n' })[c]);
}

/** The cells of a table line, split on pipes that are not escaped, unescaped and trimmed. */
export function splitRow(line) {
  const cells = [];
  let cur = '';
  const body = line.trim().replace(/^\|/, '');
  for (let i = 0; i < body.length; i++) {
    if (body[i] === '\\' && i + 1 < body.length) { cur += body[i] + body[i + 1]; i++; continue; }
    if (body[i] === '|') { cells.push(cur); cur = ''; continue; }
    cur += body[i];
  }
  if (cur.trim()) cells.push(cur); // a line without a closing pipe
  return cells.map((c) => unescapeCell(c.trim()));
}

const isHeader = (line) => {
  if (!line.trim().startsWith('|')) return false;
  const cells = splitRow(line).map((c) => c.toLowerCase());
  return cells.length === COLUMNS.length && cells.every((c, i) => c === COLUMNS[i]);
};

function parseFiles(cell, where) {
  if (!cell) return [];
  return cell.split(', ').map((entry) => {
    const at = entry.lastIndexOf('@');
    const hash = entry.slice(at + 1);
    if (at < 1 || !/^[0-9a-f]{16}$/.test(hash)) throw new Error(`${where}: files entry "${entry}" is not path@hash`);
    return { path: entry.slice(0, at), hash };
  });
}

function rowFromCells(cells, where) {
  if (cells.length !== COLUMNS.length) throw new Error(`${where}: a row needs ${COLUMNS.length} cells, found ${cells.length}`);
  const r = Object.fromEntries(COLUMNS.map((c, i) => [c, cells[i]]));
  r.stage = Number(r.stage);
  r.files = parseFiles(r.files, where);
  checkShape(r, where);
  return r;
}

export function checkShape(r, where) {
  if (!r.id) throw new Error(`${where}: a row needs an id`);
  if (![1, 2, 3, 4].includes(r.stage)) throw new Error(`${where} (${r.id}): stage must be 1, 2, 3 or 4`);
  if (!SEVERITIES.includes(r.severity)) throw new Error(`${where} (${r.id}): severity "${r.severity}" is not ${SEVERITIES.join(' or ')}`);
  if (!STATUSES.includes(r.status)) throw new Error(`${where} (${r.id}): status "${r.status}" is not one of ${STATUSES.join(', ')}`);
  if (!SOURCES.includes(r.source)) throw new Error(`${where} (${r.id}): source "${r.source}" is not one of ${SOURCES.join(', ')}`);
  for (const k of ['date', 'expires']) {
    if (r[k] && !DATE.test(r[k])) throw new Error(`${where} (${r.id}): ${k} "${r[k]}" is not YYYY-MM-DD`);
  }
}

export function formatRow(r) {
  const files = r.files.map((f) => `${f.path}@${f.hash}`).join(', ');
  const cells = COLUMNS.map((c) => escapeCell(c === 'files' ? files : String(r[c] ?? '')));
  return `| ${cells.join(' | ')} |`;
}

/** Parse a READINESS.md text. Throws on a missing table, a malformed row or a profile block that is not JSON. */
export function parseLedger(text) {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(eol);
  const h = lines.findIndex(isHeader);
  if (h < 0) throw new Error(`no ledger table (a header row: | ${COLUMNS.join(' | ')} |)`);
  if (!/^\s*\|[\s:|-]+\|\s*$/.test(lines[h + 1] || '')) throw new Error('the ledger table has no separator line under its header');
  let end = h + 2;
  const rows = [];
  const raw = [];
  for (; end < lines.length && lines[end].trim().startsWith('|'); end++) {
    const r = rowFromCells(splitRow(lines[end]), `line ${end + 1}`);
    if (rows.some((x) => x.id === r.id)) throw new Error(`line ${end + 1}: id ${r.id} appears twice`);
    rows.push(r);
    raw.push(lines[end]);
  }
  // A blank line ends a Markdown table: rows after it would be lost on the next write, so refuse instead.
  const stray = lines.findIndex((l, i) => i > end && l.trim().startsWith('|') && !isHeader(l) && splitRow(l).length === COLUMNS.length);
  if (stray > 0) {
    const what = lines[end].trim() ? `line ${end + 1} ends the table` : `the blank line at line ${end + 1} ends the table`;
    throw new Error(`line ${stray + 1}: a ledger row after the end of the table (${what}); remove that line so the rows are one table`);
  }
  let meta = null;
  let metaAt = null;
  const m = lines.findIndex((l) => l.trim() === META_OPEN);
  if (m >= 0) {
    const close = lines.findIndex((l, i) => i > m && l.trim() === '```');
    if (close < 0) throw new Error('the profile block is never closed');
    try { meta = JSON.parse(lines.slice(m + 1, close).join('\n')); } catch (e) { throw new Error(`the profile block is not JSON: ${e.message}`); }
    metaAt = [m, close];
  }
  return { lines, eol, table: [h, end], rows, raw, meta: meta || emptyMeta(), metaAt, metaRaw: meta ? JSON.stringify(meta) : null };
}

const emptyMeta = () => ({ version: 1, stage: null, regulated: false, profile: {}, profileFiles: {}, lastRun: null });
export const clone = (l) => ({ ...l, rows: l.rows.map((r) => ({ ...r, files: r.files.map((f) => ({ ...f })) })), meta: structuredClone(l.meta) });

/** Write a parsed ledger back: prose, untouched rows and an unchanged profile block come out byte for byte. */
export function formatLedger(l) {
  const [h, end] = l.table;
  const rowLines = l.rows.map((r, i) => {
    const old = l.raw[i] !== undefined ? rowFromCells(splitRow(l.raw[i]), 'raw') : null;
    return old && JSON.stringify(old) === JSON.stringify(r) ? l.raw[i] : formatRow(r);
  });
  let out = [...l.lines.slice(0, h + 2), ...rowLines, ...l.lines.slice(end)];
  const metaText = JSON.stringify(l.meta, null, 2).split('\n');
  if (l.metaAt && l.metaRaw !== JSON.stringify(l.meta)) {
    const [m, close] = l.metaAt;
    const shift = m > h ? rowLines.length - (end - h - 2) : 0;
    out.splice(m + 1 + shift, close - m - 1, ...metaText);
  } else if (!l.metaAt) {
    out.splice(h, 0, META_OPEN, ...metaText, '```', '');
  }
  return out.join(l.eol);
}

