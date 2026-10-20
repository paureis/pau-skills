// The commits part of mine.mjs: tells fix, revert and fixup commits apart and lists them with the files they touched.
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { redact, Refusal } from './mine-redact.mjs';

// ---------- commits ----------

// A fix word on its own: not inside a longer word ("prefix", "fixture", "fix_typo") or a hyphenated name ("bug-fix
// skill", "fix-it"), though a version may follow ("Hotfix-1.2.3").
const FIX = /(?<![\w-])(fix|fixes|fixed|fixing|hotfix|hotfixes|bugfix|bugfixes|quickfix)(?!\w|-[A-Za-z])/i;
// At the start of a subject a hyphenated or spaced compound is a fix too ("Bug-fix: crash on save", "hot-fix").
const LEADING_FIX = /^(bug|hot|quick)[- ]?fix(es|ed)?(?!\w|-[A-Za-z])/i;
// A subject that adds something new ("Add flaky-test-hunt: ... prove the fix") names a fix as a topic...
const NEW_WORK = /^(add|adds|added|create|creates|created|introduce|introduces|introduced|implement|implements|implemented|initial|new)\b/i;
// ...unless the new thing is the fix ("Add fix for crash", "Added a fix for the race", "Implement fix for #44").
const NEW_FIX = /^\w+\s+((a|an|the)\s+)?((bug|hot|quick) ?)?(fix|fixes)\b(?!-)/i;

/** 'revert', 'fixup', 'fix' or null for a commit subject and body. */
export function classify(subject, body) {
  if (/^revert(s|ed|ing)?\b/i.test(subject) || /This reverts commit [0-9a-f]{7,}/.test(body)) return 'revert';
  if (/^(fixup|squash|amend)!/i.test(subject)) return 'fixup';
  if (LEADING_FIX.test(subject)) return 'fix';
  if (NEW_WORK.test(subject)) return NEW_FIX.test(subject) ? 'fix' : null;
  if (FIX.test(subject)) return 'fix';
  return null;
}

function gitRoot(dir) {
  try {
    return execFileSync('git', ['-C', dir, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

export function mineCommits({ repo = '.', since, rev } = {}) {
  const root = gitRoot(resolve(repo));
  if (!root) throw new Refusal(`${redact(resolve(repo))} is not a git repository`);
  const args = ['-C', root, 'log', '--no-merges', '--name-only', '--format=%x1e%H%x1f%cI%x1f%s%x1f%b%x1f'];
  if (since) args.push(`--since=${since}`);
  if (rev !== undefined && (!rev || rev.startsWith('-'))) throw new Refusal(`--rev must name a branch or commit, not ${JSON.stringify(rev)}`);
  let label = rev;
  if (rev) args.push(rev, '--');
  else {
    try {
      label = execFileSync('git', ['-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch { label = 'HEAD'; }
  }
  let raw;
  try {
    raw = execFileSync('git', args, { encoding: 'utf8', maxBuffer: 1 << 30, stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    if (/does not have any commits/.test(String(e.stderr))) raw = '';
    else if (rev) throw new Refusal(`no branch or commit named ${JSON.stringify(rev)}`);
    else throw e;
  }
  const records = raw.split('\x1e').filter((r) => r.trim());
  const commits = [];
  const touched = new Map();
  for (const r of records) {
    const [sha, date, subject, body, filesText = ''] = r.split('\x1f');
    const kind = classify(subject, body);
    if (!kind) continue;
    const files = filesText.split('\n').map((f) => f.trim()).filter(Boolean);
    const reverts = kind === 'revert' ? (/This reverts commit ([0-9a-f]{7,})/.exec(body) || [])[1] || null : null;
    commits.push({ sha, date: date.slice(0, 10), kind, subject: redact(subject), reverts, files: files.map((f) => redact(f)) });
    for (const f of new Set(files)) touched.set(f, (touched.get(f) || 0) + 1);
  }
  const hotFiles = [...touched].filter(([, n]) => n >= 2).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 15).map(([file, count]) => ({ file: redact(file), count }));
  return { rev: label, scanned: records.length, commits, hotFiles };
}

function printCommits(res, out) {
  for (const c of res.commits) {
    out(`${c.sha.slice(0, 7)}\t${c.date}\t${c.kind}\t${c.subject}${c.reverts ? ` (reverts ${c.reverts.slice(0, 7)})` : ''}`);
    for (const f of c.files) out(`\t${f}`);
  }
  const n = (k) => res.commits.filter((c) => c.kind === k).length;
  out(`# ${n('fix')} fix, ${n('revert')} revert, ${n('fixup')} fixup in ${res.scanned} commits on ${res.rev} (merges skipped)`);
  if (res.hotFiles.length) {
    out('# Files touched by two or more of these commits:');
    for (const h of res.hotFiles) out(`# ${h.count}\t${h.file}`);
  } else {
    out('# No file was touched by two or more of these commits.');
  }
}

export { gitRoot, printCommits };
