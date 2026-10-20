// Part of scan.mjs (instructions-audit): sizes, rule units and near-duplicates, secrets, vague and emphasised rules.
// It imports no other part; scan.mjs re-exports its public names.

// ---------------------------------------------------------------------------------------------------------------
// Size

/** Rough token estimate: about four characters per token for English prose and code. */
export const estimateTokens = (text) => Math.ceil(text.length / 4);

export function fileStats(text) {
  const lines = text === '' ? 0 : text.split(/\r?\n/).length - (/\r?\n$/.test(text) ? 1 : 0);
  return { bytes: Buffer.byteLength(text, 'utf8'), lines, tokens: estimateTokens(text) };
}

/** Sections by heading with their sizes, so the agent can see which blocks cost the most every session. */
export function sectionsOf(text) {
  const out = [];
  let cur = { heading: '(before first heading)', line: 1, chars: 0 };
  const lines = text.split(/\r?\n/); const fenced = fencedLines(lines);
  lines.forEach((line, i) => {
    const h = !fenced.has(i + 1) && /^#{1,6}\s+(.*)/.exec(line);
    if (h) { if (cur.chars) out.push(cur); cur = { heading: h[1].trim(), line: i + 1, chars: 0 }; }
    cur.chars += line.length + 1;
  });
  if (cur.chars) out.push(cur);
  return out.map((s) => ({ heading: s.heading, line: s.line, tokens: Math.ceil(s.chars / 4) }));
}

// ---------------------------------------------------------------------------------------------------------------
// Rule units and overlap

const STOP = new Set(('the a an and or of to in on for with is are was were be been it its this that these those as at by ' +
  'from into not no if then than so we you i he she they our your their do does did done have has had will would can ' +
  'could should may might must never always every any some one also only just very more most such which who what when ' +
  'where how why here there use using make sure').split(' '));

/** Content words: lower case, punctuation dropped, stopwords dropped. Code spans are kept: `npm test` and
 *  `cargo test` must not read as the same rule. */
export const tokenize = (s) => s.toLowerCase().replace(/[^a-z0-9_]+/g, ' ').split(' ').filter((w) => w.length > 1 && !STOP.has(w));

export function bigrams(s) {
  const t = tokenize(s); const out = new Set();
  for (let i = 0; i + 1 < t.length; i++) out.add(t[i] + ' ' + t[i + 1]);
  return out;
}

/** Overlap coefficient: |A and B| / min(|A|, |B|). A short rule restated inside a long one scores high. */
export function overlap(a, b) {
  if (!a.size || !b.size) return 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  let inter = 0; for (const x of small) if (big.has(x)) inter++;
  return inter / small.size;
}

// Code fences as CommonMark defines them: three or more backticks or tildes open a fence, and a backtick fence's info
// string has no backtick in it. Only a bare fence of the same character, at least as long, closes it. Any indentation
// is accepted, because fences inside list items are indented.
const FENCE_OPEN = /^\s*(`{3,}(?=[^`]*$)|~{3,})/;
const closesFence = (line, fence) => {
  const m = /^\s*(`{3,}|~{3,})\s*$/.exec(line);
  return !!m && m[1][0] === fence[0] && m[1].length >= fence.length;
};
const HEADING = /^#{1,6}\s+(.*)/;
const BULLET = /^(\s*)(?:[-*+]|\d+[.)])\s+(.*)/;

/** Lines inside code fences, fence lines included, as a Set of 1-based line numbers. */
function fencedLines(lines) {
  const s = new Set(); let fence = null;
  lines.forEach((l, i) => {
    if (fence) { s.add(i + 1); if (closesFence(l, fence)) fence = null; return; }
    const open = FENCE_OPEN.exec(l);
    if (open) { fence = open[1]; s.add(i + 1); }
  });
  return s;
}

/** Strip YAML frontmatter, keeping line numbers stable (replaced by blank lines). */
export function stripFrontmatter(text) {
  const m = /^---\r?\n[\s\S]*?\r?\n---\r?\n/.exec(text);
  return m ? m[0].replace(/[^\n]/g, '') + text.slice(m[0].length) : text;
}

/** Split an instruction file into rule units: each bullet (with its indented continuation lines), each paragraph
 *  and each table row. Code blocks and headings are not units; the heading becomes the unit's context. */
export function splitUnits(text) {
  const units = [];
  let heading = '';
  let cur = null; // { line, heading, text, indent, kind }
  const flush = () => { if (cur) { cur.text = cur.text.trim(); if (cur.text) units.push({ line: cur.line, heading: cur.heading, kind: cur.kind, text: cur.text }); } cur = null; };
  const lines = stripFrontmatter(text).split(/\r?\n/); const fenced = fencedLines(lines);
  lines.forEach((line, i) => {
    if (fenced.has(i + 1)) { flush(); return; }
    const h = HEADING.exec(line);
    if (h) { flush(); heading = h[1].trim(); return; }
    if (!line.trim()) { flush(); return; }
    if (/^\s*\|/.test(line)) {
      flush();
      if (!/^\s*\|[\s:|-]+\|?\s*$/.test(line)) units.push({ line: i + 1, heading, kind: 'row', text: line.trim() });
      return;
    }
    const b = BULLET.exec(line);
    if (b) { flush(); cur = { line: i + 1, heading, text: b[2], indent: b[1].length, kind: 'bullet' }; return; }
    if (cur && cur.kind === 'bullet' && /^\s/.test(line)) { cur.text += ' ' + line.trim(); return; }
    if (cur && cur.kind === 'paragraph') { cur.text += ' ' + line.trim(); return; }
    flush();
    cur = { line: i + 1, heading, text: line.trim(), indent: 0, kind: 'paragraph' };
  });
  flush();
  return units;
}

/** Near-duplicate pairs among units that carry { file, line, text }. */
export function findDuplicates(units, { threshold = 0.6, minBigrams = 4 } = {}) {
  const prepared = units.map((u) => ({ u, bg: bigrams(u.text), norm: tokenize(u.text).join(' ') })).filter((p) => p.bg.size >= minBigrams);
  const pairs = [];
  for (let i = 0; i < prepared.length; i++) {
    for (let j = i + 1; j < prepared.length; j++) {
      const a = prepared[i]; const b = prepared[j];
      const score = overlap(a.bg, b.bg);
      if (score >= threshold) {
        pairs.push({ score: Math.round(score * 1000) / 1000, exact: a.norm === b.norm, sameFile: a.u.file === b.u.file, a: brief(a.u), b: brief(b.u) });
      }
    }
  }
  return pairs.sort((x, y) => y.score - x.score);
}
const brief = (u) => ({ file: u.file, line: u.line, text: u.text.length > 160 ? u.text.slice(0, 157) + '...' : u.text });

// ---------------------------------------------------------------------------------------------------------------
// Secrets and personal data

const PLACEHOLDER = /^(x+|\*+|\.+|<[^>]*>|\$\{?[A-Z_]+\}?|your[_-].*|changeme|example.*|placeholder|redacted|dummy|test|none|null|true|false|\.\.\.)$/i;
export const SECRET_PATTERNS = [
  ['private key', /-----BEGIN (?:[A-Z]+ )?PRIVATE KEY-----/],
  ['AWS access key id', /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/],
  ['GitHub token', /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{40,})\b/],
  ['GitLab token', /\bglpat-[A-Za-z0-9_-]{20,}\b/],
  ['Slack token', /\bxox[abposr]-[A-Za-z0-9-]{10,}\b/],
  ['Stripe live key', /\b[sr]k_live_[A-Za-z0-9]{16,}\b/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['LLM provider key', /\bsk-(?:ant-|proj-)?[A-Za-z0-9_-]{24,}\b/],
  ['JSON web token', /\beyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/],
  ['credentials in URL', /\b[a-z][a-z0-9+.-]*:\/\/[^\s/:@]+:([^\s/@]{3,})@/i],
];
// The name may carry a prefix or suffix joined by "_" (DB_PASSWORD, SECRET_KEY), which \b alone would miss.
const ASSIGN = /(?:^|[^A-Za-z0-9])(?:[A-Za-z0-9]+_)*(password|passwd|pwd|secret|client[_-]?secret|token|auth[_-]?token|api[_-]?key|access[_-]?key|private[_-]?key)(?:_[A-Za-z0-9]+)*\s*[:=]\s*["']?([^\s"'`,;]{8,})/i;
const EMAIL = /\b[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}\b/g;
const SAFE_EMAIL_DOMAIN = /@(?:[\w-]+\.)*(example\.(com|org|net)|users\.noreply\.github\.com|noreply\.[\w.]+|anthropic\.com|localhost)$/i;
const PHONE = /(?:^|[^\w])(\+\d{1,3}[\s.-]?\(?\d{1,4}\)?(?:[\s.-]?\d{2,4}){2,4})(?!\w)/;

/** Show enough to locate a value, never enough to use it. */
export const mask = (s) => (s.length <= 8 ? '*'.repeat(s.length) : s.slice(0, 4) + '*'.repeat(Math.min(12, s.length - 6)) + s.slice(-2));

export function findSecrets(text) {
  const out = [];
  text.split(/\r?\n/).forEach((line, i) => {
    const n = i + 1;
    for (const [kind, re] of SECRET_PATTERNS) {
      const m = re.exec(line);
      if (m) { out.push({ line: n, kind, preview: mask(m[1] || m[0]) }); return; }
    }
    const a = ASSIGN.exec(line);
    if (a && !PLACEHOLDER.test(a[2]) && !/^\$|^process\.env|^os\.environ|^env\(|^\{\{/.test(a[2]) && /[0-9]/.test(a[2]) && /[A-Za-z]/.test(a[2])) {
      out.push({ line: n, kind: `assigned ${a[1].toLowerCase()}`, preview: mask(a[2]) });
      return;
    }
    for (const m of line.matchAll(EMAIL)) {
      if (!SAFE_EMAIL_DOMAIN.test(m[0])) { out.push({ line: n, kind: 'email address', preview: mask(m[0]) }); return; }
    }
    const p = PHONE.exec(line);
    if (p) out.push({ line: n, kind: 'phone number', preview: mask(p[1].replace(/\s+/g, '')) });
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Vague and emphasised rules

export const VAGUE_PHRASES = [
  'clean code', 'best practice', 'best practices', 'good code', 'high quality', 'high-quality', 'readable code',
  'maintainable', 'be careful', 'carefully', 'properly', 'as needed', 'when appropriate', 'where appropriate',
  'if appropriate', 'if necessary', 'when necessary', 'when possible', 'where possible', 'as much as possible',
  'common sense', 'be thorough', 'think hard', 'keep it simple', 'keep things simple', 'be consistent', 'consistent style',
  'follow conventions', 'follow the conventions', 'follow existing patterns', 'idiomatic', 'elegant', 'robust',
  'production-ready', 'production ready', 'avoid unnecessary', 'try to', 'reasonable', 'sensible', 'good judgment',
  'good judgement', 'clean up', 'well-structured', 'well structured', 'efficient',
];

/** A unit counts as concrete if it names something checkable: a code span, a number, a path or a quoted string. */
const isConcrete = (t) => /`[^`]+`|\d|[\w-]+\/[\w.-]+|\.[a-z]{2,4}\b|"[^"]{3,}"/.test(t);

export function findVague(units) {
  const out = [];
  for (const u of units) {
    const low = u.text.toLowerCase();
    const hits = VAGUE_PHRASES.filter((p) => new RegExp(`(^|[^a-z])${p.replace(/[-]/g, '\\-')}([^a-z]|$)`).test(low));
    if (hits.length && !isConcrete(u.text)) out.push({ ...brief(u), phrases: hits });
  }
  return out;
}

const EMPHASIS = /\b(IMPORTANT|CRITICAL|NEVER|ALWAYS|MUST|DO NOT|DON'T|NOT NEGOTIABLE|MANDATORY|REQUIRED|WARNING)\b|!!|\b(again|keep forgetting|stop doing|for the last time|i said)\b|\breminder:/;

/** Units written in capitals or with "again"-style wording: often a rule that has been broken before, and a
 *  candidate for a hook instead of more emphasis. */
export function findEmphasis(units) {
  return units.filter((u) => EMPHASIS.test(u.text)).map((u) => ({ ...brief(u), marker: (EMPHASIS.exec(u.text) || [''])[0] }));
}

export { fencedLines, brief };
