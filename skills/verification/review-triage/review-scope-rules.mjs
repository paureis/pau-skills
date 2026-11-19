// The constants and pure functions of review-scope.mjs: configuration, globs, classifying files, fix flags, the RULES
// flag and the REVIEW.md listing, formatting.
// It compiles a checklist regex to validate it, and never runs one: review-scope-checklist.mjs does, with a time limit.
// It imports nothing and touches neither git nor the file system.

export const CONFIG_FILE = '.claude/review-rules.json';
export const BUDGET_ENV = 'LEAN_SUBAGENT_BUDGET';
export const BUDGETS = ['tight', 'normal', 'generous'];
/** Files a change must touch before it goes to a subagent, by budget. A subagent re-reads what it needs, so a tight
 * budget delegates less, not more. */
export const MIN_FILES = { tight: 5, normal: 3, generous: 2 };

export const DEFAULTS = {
  mustFix: [
    'a security hole: a secret printed, logged, committed or cached; an access check bypassed; untrusted input reaching a shell, query or file path',
    'data lost, corrupted, or written to the wrong place or the wrong account',
    'a wrong result on the main path a user takes',
    'a broken build, install, test run, typecheck or lint',
    'a failed contract or acceptance criterion',
  ],
  riskyPaths: [],
  testPaths: [
    '**/test/**', '**/tests/**', '**/__tests__/**', '**/spec/**', '**/specs/**',
    '**/*.test.*', '**/*.spec.*', '**/*_test.*', '**/*_spec.*', '**/test_*', '**/*Test.*', '**/*Tests.*',
  ],
  docPaths: ['docs/**', 'doc/**', '**/*.md', '**/*.mdx', '**/*.rst', '**/*.adoc', '**/LICENSE*', '**/CHANGELOG*'],
  checks: [],
  delegation: { budget: 'normal', minFiles: null, log: null },
  checklist: [],
};

// ---------------------------------------------------------------------------------------------------------------
// Pure functions
// ---------------------------------------------------------------------------------------------------------------

/** Clean a glob or path: backslashes to slashes, no leading ./ or /. */
export function normalizePath(p) {
  let s = String(p).trim().replace(/\\/g, '/');
  while (s.startsWith('./')) s = s.slice(2);
  return s.replace(/^\/+/, '');
}

/** Compile a glob to a RegExp over repository-relative paths. Throws on an unbalanced brace. */
export function globToRegExp(glob) {
  const g = normalizePath(glob);
  if (!/[*?{]/.test(g)) {
    const lit = g.replace(/\/+$/, '').replace(/[.+^$()|[\]\\]/g, '\\$&');
    return new RegExp(`^${lit}(?:/.*)?$`);
  }
  let out = '';
  let depth = 0;
  for (let i = 0; i < g.length; i++) {
    const c = g[i];
    if (c === '*' && g[i + 1] === '*') {
      // Repeated `**/` collapse into one: each would add a nested `.*`, and together they backtrack for seconds.
      if (g[i + 2] === '/') { out += '(?:.*/)?'; i += 2; while (g.startsWith('**/', i + 1)) i += 3; } else { out += '.*'; i += 1; }
    } else if (c === '*') out += '[^/]*';
    else if (c === '?') out += '[^/]';
    else if (c === '{') { out += '(?:'; depth++; }
    else if (c === '}' && depth > 0) { out += ')'; depth--; }
    else if (c === ',' && depth > 0) out += '|';
    else out += c.replace(/[.+^$()|[\]\\]/g, '\\$&');
  }
  if (depth !== 0) throw new Error(`unbalanced brace in glob: ${glob}`);
  if (g.endsWith('/')) out += '.*';
  return new RegExp(`^${out}$`);
}

/** A predicate that is true when a path matches any of the globs. */
export function anyMatch(globs) {
  const res = globs.map(globToRegExp);
  return (path) => res.some((re) => re.test(normalizePath(path)));
}

const isStringList = (v) => Array.isArray(v) && v.every((x) => typeof x === 'string' && x.trim() !== '');
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const ENTRY_KEYS = ['trigger', 'check', 'why'];
const TRIGGER_KEYS = ['paths', 'added', 'flags'];

/** The problems in a `checklist` value, each naming its entry as `checklist #<n>`, 1-based. */
function checklistErrors(list) {
  if (!Array.isArray(list)) return ['"checklist" must be a list of entries with trigger, check and why'];
  const errs = [];
  list.forEach((e, i) => {
    const at = `checklist #${i + 1}`;
    if (!isObject(e)) { errs.push(`${at} must be an object with trigger, check and why`); return; }
    for (const k of Object.keys(e)) if (!ENTRY_KEYS.includes(k)) errs.push(`${at}: unknown key "${k}" (known: ${ENTRY_KEYS.join(', ')})`);
    for (const k of ['check', 'why']) if (typeof e[k] !== 'string' || e[k].trim() === '') errs.push(`${at}: "${k}" must be a non-empty string`);
    const t = e.trigger;
    if (!isObject(t)) { errs.push(`${at}: "trigger" must be an object with paths, added or both`); return; }
    for (const k of Object.keys(t)) if (!TRIGGER_KEYS.includes(k)) errs.push(`${at}: unknown key "trigger.${k}" (known: ${TRIGGER_KEYS.join(', ')})`);
    const has = (k) => Object.hasOwn(t, k);
    if (!has('paths') && !has('added')) errs.push(`${at}: "trigger" needs paths, added or both`);
    if (has('paths')) {
      if (!isStringList(t.paths) || t.paths.length === 0) errs.push(`${at}: "trigger.paths" must be a non-empty list of non-empty strings`);
      else for (const g of t.paths) { try { globToRegExp(g); } catch (err) { errs.push(`${at}: "trigger.paths": ${err.message}`); } }
    }
    if (has('flags') && t.flags !== 'i') errs.push(`${at}: "trigger.flags" may only be "i"`);
    else if (has('flags') && !has('added')) errs.push(`${at}: "trigger.flags" needs "added"`);
    if (has('added')) {
      if (typeof t.added !== 'string' || t.added === '') errs.push(`${at}: "trigger.added" must be a non-empty string`);
      else { try { new RegExp(t.added, t.flags === 'i' ? 'i' : ''); } catch (err) { errs.push(`${at}: "trigger.added" is not a valid regular expression: ${err.message}`); } }
    }
  });
  return errs;
}

/** Validate a parsed config object. Returns a list of problems; empty means valid. */
export function validateConfig(cfg) {
  const errs = [];
  if (cfg === null || typeof cfg !== 'object' || Array.isArray(cfg)) return ['the configuration must be a JSON object'];
  const known = ['mustFix', 'riskyPaths', 'testPaths', 'docPaths', 'checks', 'delegation', 'checklist'];
  for (const k of Object.keys(cfg)) if (!known.includes(k)) errs.push(`unknown key "${k}" (known: ${known.join(', ')})`);
  for (const k of ['mustFix', 'riskyPaths', 'testPaths', 'docPaths', 'checks']) {
    if (k in cfg && !isStringList(cfg[k])) errs.push(`"${k}" must be a list of non-empty strings`);
  }
  for (const k of ['riskyPaths', 'testPaths', 'docPaths']) {
    if (isStringList(cfg[k])) for (const g of cfg[k]) { try { globToRegExp(g); } catch (e) { errs.push(`"${k}": ${e.message}`); } }
  }
  if ('delegation' in cfg) {
    const d = cfg.delegation;
    if (d === null || typeof d !== 'object' || Array.isArray(d)) errs.push('"delegation" must be an object');
    else {
      for (const k of Object.keys(d)) if (!['budget', 'minFiles', 'log'].includes(k)) errs.push(`unknown key "delegation.${k}"`);
      if ('budget' in d && !BUDGETS.includes(d.budget)) errs.push(`"delegation.budget" must be one of ${BUDGETS.join(', ')}`);
      if ('minFiles' in d && !(Number.isInteger(d.minFiles) && d.minFiles >= 1)) errs.push('"delegation.minFiles" must be a whole number of at least 1');
      if ('log' in d && (typeof d.log !== 'string' || d.log.trim() === '')) errs.push('"delegation.log" must be a non-empty path');
    }
  }
  if ('checklist' in cfg) errs.push(...checklistErrors(cfg.checklist));
  return errs;
}

/** Merge a valid project config over the defaults and resolve the budget. `env` is checked for BUDGET_ENV. Problems
 * in the project config are prefixed with `label`. */
export function resolveConfig(project = {}, env = {}, label = CONFIG_FILE) {
  const errs = validateConfig(project).map((e) => `${label}: ${e}`);
  const envBudget = env[BUDGET_ENV] ? String(env[BUDGET_ENV]).trim().toLowerCase() : '';
  if (envBudget && !BUDGETS.includes(envBudget)) errs.push(`${BUDGET_ENV} must be one of ${BUDGETS.join(', ')}, not "${env[BUDGET_ENV]}"`);
  if (errs.length) return { errors: errs };
  const d = project.delegation || {};
  const budget = envBudget || d.budget || DEFAULTS.delegation.budget;
  const budgetFrom = envBudget ? BUDGET_ENV : d.budget ? CONFIG_FILE : 'default';
  return {
    errors: [],
    config: {
      mustFix: [...DEFAULTS.mustFix, ...(project.mustFix || [])],
      riskyPaths: project.riskyPaths || DEFAULTS.riskyPaths,
      testPaths: project.testPaths || DEFAULTS.testPaths,
      docPaths: project.docPaths || DEFAULTS.docPaths,
      checks: project.checks || DEFAULTS.checks,
      delegation: { budget, budgetFrom, minFiles: d.minFiles || MIN_FILES[budget], log: d.log || null },
      checklist: project.checklist || DEFAULTS.checklist,
    },
  };
}

/** Parse `git diff --numstat -z --no-renames` output into [{ path, added, removed }]; binary files count 0 lines. */
export function parseNumstat(z) {
  const out = [];
  for (const rec of String(z).split('\0')) {
    const m = /^(\d+|-)\t(\d+|-)\t(.+)$/s.exec(rec.replace(/^\n+/, ''));
    if (m) out.push({ path: m[3], added: m[1] === '-' ? 0 : Number(m[1]), removed: m[2] === '-' ? 0 : Number(m[2]) });
  }
  return out;
}

/** Tag each changed file as risky, test and/or doc. A file that is both a test and a doc counts as a test. */
export function classify(files, config) {
  const risky = anyMatch(config.riskyPaths);
  const test = anyMatch(config.testPaths);
  const doc = anyMatch(config.docPaths);
  return files.map((f) => {
    const t = test(f.path);
    return { ...f, risky: risky(f.path), test: t, doc: !t && doc(f.path) };
  });
}

/** Summarise a change. `files` comes from classify(). */
export function summarizeChange(files) {
  return {
    files: files.length,
    added: files.reduce((n, f) => n + f.added, 0),
    removed: files.reduce((n, f) => n + f.removed, 0),
    risky: files.filter((f) => f.risky).map((f) => f.path),
    tests: files.filter((f) => f.test).map((f) => f.path),
    docs: files.filter((f) => f.doc).map((f) => f.path),
    code: files.filter((f) => !f.test && !f.doc).map((f) => f.path),
  };
}

/** The flags for a fix round. `fix` comes from classify(); `reviewed` is the list of paths the review looked at. */
export function fixFlags(fix, reviewed) {
  const flags = [];
  if (fix.length === 0) return flags;
  const inReview = new Set(reviewed);
  const code = fix.filter((f) => !f.test && !f.doc);
  if (code.length > 0 && !fix.some((f) => f.test && !f.deleted)) {
    flags.push({ id: 'NO_TEST', paths: code.map((f) => f.path), message: 'the fix changes code and no test. Every fix comes with a test that fails without it.' });
  }
  const risky = fix.filter((f) => f.risky).map((f) => f.path);
  if (risky.length) {
    flags.push({ id: 'RISKY', paths: risky, message: 'the fix touches risky code. Weigh the fix, not only the problem: if the problem is minor, revert this and open an issue.' });
  }
  // A new test is what the fix round asks for, and a doc the change made untrue belongs to the change, so only code
  // counts as outside it.
  const outside = code.filter((f) => !inReview.has(f.path)).map((f) => f.path);
  if (outside.length) {
    flags.push({ id: 'OUTSIDE', paths: outside, message: 'the fix touches files the reviewed change did not. Unless this is a must-fix, revert it and open an issue.' });
  }
  return flags;
}

const shQuote = (s) => (/^[A-Za-z0-9._\/@:=+-]+$/.test(s) ? s : `'${String(s).replace(/'/g, `'\\''`)}'`);

// What judges a change: the rules file, a folder's REVIEW.md, and the files the rules name.
export const REVIEW_FILE = 'REVIEW.md';
export const RULES_MESSAGES = {
  change: 'the change edits what judges it. The rules shown come from the merge base, and these edits are part of the change under review.',
  fix: 'the fix edits what judges it. Revert it unless a finding asked for it, and say so.',
};

/** The folder of a repository path, '' for the root; a file name in a folder; whether a path is a REVIEW.md. */
export const folderOf = (p) => p.slice(0, Math.max(p.lastIndexOf('/'), 0));
export const inFolder = (d, name) => (d ? `${d}/${name}` : name);
export const isReviewFile = (p) => p === REVIEW_FILE || p.endsWith(`/${REVIEW_FILE}`);

/** The folders from a path's own up to the root, nearest first. */
export function foldersUp(p) {
  const out = [];
  for (let d = folderOf(p); d; d = folderOf(d)) out.push(d);
  return [...out, ''];
}

/** True for a `git cat-file --batch-check` answer `<oid> blob <size>`, never for `<commit>:<path> missing`. */
export const isBlobLine = (line) => /^[0-9a-f]{40,64} blob \d+$/.test(line);

/** The pieces of a command that can name a path, word for word: the text split on whitespace and ' " ` = ( ) [ ] , ;,
 * each cut at a pytest `::`, without a leading ./ or a trailing . or :. A glob, a folder or a quoted path with a space
 * names no file. */
export function namedPaths(text) {
  const out = new Set();
  for (const piece of String(text).split(/[\s'"`=()[\],;]+/)) {
    const cut = piece.indexOf('::');
    const p = cut < 0 ? piece : piece.slice(0, cut);
    let start = 0;
    while (p.startsWith('./', start)) start += 2;
    let end = p.length;
    while (end > start && (p[end - 1] === '.' || p[end - 1] === ':')) end--;
    if (end > start) out.add(p.slice(start, end));
  }
  return out;
}

/** The RULES flag for changed `files`: the rules file, a REVIEW.md whose folder is not in `skillDirs` (a skill's own
 * file), and a path a `checks` command or checklist `check` of `config` names word for word. Each path has a reason. */
export function rulesFlag(files, config, skillDirs, message) {
  const texts = [...config.checks.map((c) => [c, '(named in checks)']), ...config.checklist.map((e, i) => [e.check, `(named in checklist #${i + 1})`])]
    .map(([text, reason]) => ({ named: namedPaths(text), reason }));
  const why = (path) => (path === CONFIG_FILE ? '(the review rules)'
    : isReviewFile(path) && !skillDirs.has(folderOf(path)) ? '(a REVIEW.md)'
      : texts.find((t) => t.named.has(path))?.reason);
  const hit = files.map((f) => [f.path, why(f.path)]).filter(([, reason]) => reason);
  return hit.length ? [{ id: 'RULES', paths: hit.map(([p]) => p), reasons: hit.map(([, r]) => r), message }] : [];
}

/** The REVIEW.md files above each path, nearest folder first: [{ path, show, for }] in order of first use. `atBase`
 * maps a folder to { review, skill }, true for a blob at `commit`; one beside a SKILL.md is the skill's own. */
export function reviewFiles(paths, atBase, repo, commit) {
  const found = new Map();
  for (const p of paths) {
    for (const d of foldersUp(p)) {
      const at = atBase.get(d);
      if (!at || !at.review || at.skill) continue;
      const path = inFolder(d, REVIEW_FILE);
      if (!found.has(path)) found.set(path, { path, show: `git -C ${shQuote(repo)} show ${shQuote(`${commit.slice(0, 12)}:${path}`)}`, for: [] });
      found.get(path).for.push(p);
    }
  }
  return [...found.values()];
}

const rulesLine = ({ commit, file }) => `Rules: ${file ? `${file} at ${commit.slice(0, 12)}` : `the defaults (no ${CONFIG_FILE} at ${commit.slice(0, 12)})`}`;

const flagLines = (flags) => flags.map((fl) => `  ${fl.id}: ${fl.paths.map((p, i) => (fl.reasons ? `${p} ${fl.reasons[i]}` : p)).join(', ')}: ${fl.message}`);

/** The REVIEW.md listing of `change`: a line per changed file with a REVIEW.md above it, then one command per file. */
function reviewLines(r) {
  const at = r.mergeBase.slice(0, 12);
  if (!r.reviewFiles.length) return [`REVIEW.md at ${at}: none above the changed files`];
  const listed = new Set(r.reviewFiles.map((x) => x.path));
  const lines = [`REVIEW.md at ${at}, nearest folder first:`];
  for (const f of r.files) {
    const above = foldersUp(f.path).map((d) => inFolder(d, REVIEW_FILE)).filter((p) => listed.has(p));
    if (above.length) lines.push(`  ${shQuote(f.path)}: ${above.map(shQuote).join(', ')}`);
  }
  r.reviewFiles.forEach((x, i) => lines.push(`${i ? ' '.repeat(16) : 'Read each with: '}${x.show}`));
  return lines;
}

function fileLine(f) {
  const tags = [f.risky ? 'RISKY' : '', f.test ? 'test' : '', f.doc ? 'doc' : ''].filter(Boolean).join(', ');
  return `  ${f.path}  +${f.added} -${f.removed}${tags ? `  (${tags})` : ''}`;
}

/** The checklist block: nothing when no entry is configured, else the count and each triggered entry. */
function checklistLines(c) {
  if (!c || !c.entries) return [];
  const lines = [`Checklist: ${c.triggered.length} of ${c.entries} entries triggered`];
  for (const t of c.triggered) {
    lines.push(`  #${t.entry} ${t.check}`, `     why: ${t.why}`);
    const by = t.by.length > 3 ? `${t.by.slice(0, 3).join(', ')} and ${t.by.length - 3} more` : t.by.join(', ');
    lines.push(t.error ? `     triggered: ${t.error}; check it by hand` : `     triggered by: ${by}`);
  }
  return lines;
}

export function formatChange(r) {
  const s = r.summary;
  const lines = [`Change since ${r.base} (merge base ${r.mergeBase.slice(0, 12)}): ${s.files} file(s), +${s.added} -${s.removed}`];
  if (r.rules) lines.push(rulesLine(r.rules));
  for (const f of r.files) lines.push(fileLine(f));
  if (r.flags && r.flags.length) lines.push('Flags:', ...flagLines(r.flags));
  lines.push(`Risky files: ${s.risky.length ? s.risky.join(', ') : 'none'}${r.riskyConfigured ? '' : ` (no riskyPaths in ${CONFIG_FILE})`}`);
  lines.push(`Code files: ${s.code.length}; test files: ${s.tests.length}; doc files: ${s.docs.length}`);
  lines.push(...checklistLines(r.checklist));
  if (r.reviewFiles) lines.push(...reviewLines(r));
  if (s.code.length && !s.tests.length) lines.push('Note: code changed and no test did. New behaviour without a test is a "fix if cheap" finding.');
  return lines.join('\n');
}

export function formatFix(r) {
  if (r.files.length === 0) return `Fix since ${r.since.slice(0, 12)}: nothing changed. There is no fix to look at.`;
  const s = summarizeChange(r.files);
  const lines = [`Fix since ${r.since.slice(0, 12)}: ${s.files} file(s), +${s.added} -${s.removed}`];
  if (r.rules) lines.push(rulesLine(r.rules));
  for (const f of r.files) lines.push(fileLine(f));
  lines.push(...(r.flags.length ? ['Flags:', ...flagLines(r.flags)] : ['Flags: none']));
  lines.push(...checklistLines(r.checklist));
  const tracked = r.files.filter((f) => !f.untracked).map((f) => shQuote(f.path));
  const untracked = r.files.filter((f) => f.untracked).map((f) => f.path);
  if (tracked.length) lines.push(`Second look, the fix only: git -C ${shQuote(r.repo)} diff ${r.since.slice(0, 12)} -- ${tracked.join(' ')}`);
  if (untracked.length) lines.push(`New files, not in git yet, read them whole: ${untracked.join(', ')}`);
  return lines.join('\n');
}

function triggerLine(e, i) {
  const t = e.trigger;
  const when = [t.paths ? `paths: ${t.paths.join(', ')}` : '', t.added ? `added: /${t.added}/${t.flags || ''}` : ''].filter(Boolean);
  return `  #${i + 1} ${e.check} (when ${when.join(' and ')})`;
}

export function formatConfig(c) {
  const d = c.delegation;
  return [
    `Budget: ${d.budget} (from ${d.budgetFrom}); ${d.budget === 'tight'
      ? `delegate changes of ${d.minFiles}+ files, make smaller changes yourself`
      : `delegate any change in behaviour or tests, and any change of ${d.minFiles}+ files`}`,
    `Delegation log: ${d.log || 'off'}`,
    'Must fix:', ...c.mustFix.map((m) => `  - ${m}`),
    `Risky paths: ${c.riskyPaths.length ? c.riskyPaths.join(', ') : 'none set'}`,
    `Checks: ${c.checks.length ? c.checks.join('; ') : `none set; use the project's own test, lint and typecheck commands`}`,
    `Test paths: ${c.testPaths.join(', ')}`,
    `Doc paths: ${c.docPaths.join(', ')}`,
    ...(c.checklist.length ? ['Checklist:', ...c.checklist.map(triggerLine)] : ['Checklist: none set']),
  ].join('\n');
}
