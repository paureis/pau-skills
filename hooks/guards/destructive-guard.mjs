#!/usr/bin/env node
// PreToolUse guard for Bash and PowerShell: deny commands that destroy work or data that cannot be brought back.
//
// Why: every one of these has a well-known story. `rm -rf "$DIR/"` with DIR unset deletes from the root. A force push
// to main rewrites history other people have pulled. `git reset --hard` or `git checkout .` with uncommitted edits
// throws away hours of work with no reflog entry. `git clean -fd` deletes untracked files, which git never saw and
// cannot restore. An agent reaches for these when it wants a clean slate, and the clean slate is usually your work.
//
// Denied:
//   - rm with -r on the filesystem root, the home directory, `.`, `..`, `*`, a path outside the project, a path that
//     starts with an unquoted-looking variable followed by a slash ($DIR/...), or with --no-preserve-root.
//     Temporary directories (the OS temp dir, /tmp, /var/tmp) are allowed.
//   - git push that forces (--force, -f, +refspec, --mirror) onto a protected branch, or deletes one; a bare --force
//     on any other branch (use --force-with-lease, which refuses to overwrite commits you have not seen).
//   - git reset --hard, git checkout/restore of `.`, and git stash clear, when tracked files have uncommitted changes.
//   - git clean -f without -n (untracked files are not in git, so nothing can restore them).
//   - git branch -D on a protected branch.
//   - mkfs, dd onto a device, recursive chmod/chown of the root, a fork bomb.
//   - DROP DATABASE / DROP SCHEMA passed to any command, terraform destroy (and apply -destroy), kubectl delete of a
//     namespace or with --all, aws s3 rm --recursive and s3 rb --force, gcloud projects delete.
//
// Options in .claude/pau-skills.json:
//   { "destructive-guard": {
//       "protectedBranches": ["main", "master", "develop", "production", "release/*"],   (this list replaces the default)
//       "allowCommands": ["^terraform destroy -target="],   (regexes; a command matching one is never denied)
//       "allowPaths": ["/srv/scratch"] } }                   (rm -r is allowed under these absolute paths)
//
// Denies with exit code 2 and the reason on stderr. Exits 0 on input it does not understand. It runs `git` (read-only,
// 3 second timeout) only when a command needs the current branch or the working-tree state.
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { resolve, isAbsolute, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { loadConfig, hookEnabled, hookOptions, projectDir, readStdin, parseInput } from '../lib/config.mjs';
import { commands, gitSubcommand, shortHas } from '../lib/shell.mjs';

export const NAME = 'destructive-guard';
export const DEFAULT_PROTECTED = ['main', 'master', 'develop', 'trunk', 'production', 'prod', 'staging', 'release', 'release/*', 'stable'];

const branchMatches = (branch, patterns) => patterns.some((p) => (p.endsWith('/*') ? branch.startsWith(p.slice(0, -1)) : branch === p));

const under = (path, dir) => {
  const a = resolve(path), b = resolve(dir);
  return a === b || a.startsWith(b.endsWith(sep) ? b : b + sep);
};

/** Why an rm target is dangerous, or null. */
export function dangerousRmTarget(target, { root, home = homedir(), allowPaths = [] }) {
  const t = target.replace(/\/+$/, '') || '/';
  if (/^\$\{?[A-Za-z_][A-Za-z0-9_]*\}?\//.test(target)) return `${target} starts with a variable; if it is empty this deletes from the root`;
  if (t === '/' || /^\/\*?$/.test(target) || target === '/*') return 'the filesystem root';
  if (/^(~|\$HOME|\$\{HOME\})(\/\*?)?$/.test(t) || /^(~|\$HOME|\$\{HOME\})\/\*$/.test(target)) return 'your home directory';
  if (t === '.' || t === './*' || target === '*' || target === './*' || t === '*') return 'the whole current directory';
  if (t === '..' || t.startsWith('../') || t === '../*') return 'a path above the current directory';
  let abs = null;
  if (t.startsWith('~/')) abs = home + t.slice(1);
  else if (/^\$\{?HOME\}?\//.test(t)) abs = home + t.replace(/^\$\{?HOME\}?/, '');
  else if (isAbsolute(t)) abs = t;
  if (abs) {
    const safe = [tmpdir(), '/tmp', '/var/tmp', ...allowPaths];
    if (safe.some((d) => under(abs, d))) return null;
    if (resolve(abs) === resolve(home)) return 'your home directory';
    if (!under(abs, root)) return `${t} is outside the project (${root})`;
    if (resolve(abs) === resolve(root)) return 'the whole project';
  }
  return null;
}

function checkRm(args, ctx) {
  let recursive = false;
  const targets = [];
  let options = true;
  for (const a of args) {
    if (options && a === '--') { options = false; continue; }
    if (options && a === '--no-preserve-root') return 'rm --no-preserve-root removes the safety net that stops rm -rf /';
    if (options && (a === '--recursive' || shortHas(a, 'r') || shortHas(a, 'R'))) { recursive = true; continue; }
    if (options && a.startsWith('-')) continue;
    targets.push(a);
  }
  if (!recursive) return null;
  for (const t of targets) {
    const why = dangerousRmTarget(t, ctx);
    if (why) return `rm -r on ${why}`;
  }
  return null;
}

function checkPush(rest, ctx) {
  let force = false, lease = false, del = false, mirror = false;
  const positional = [];
  for (const a of rest) {
    if (a === '--force' || shortHas(a, 'f')) force = true;
    else if (a.startsWith('--force-with-lease') || a === '--force-if-includes') lease = true;
    else if (a === '--delete' || shortHas(a, 'd')) del = true;
    else if (a === '--mirror') mirror = true;
    else if (!a.startsWith('-')) positional.push(a);
  }
  if (mirror) return 'git push --mirror overwrites every branch and tag on the remote';
  const refspecs = positional.slice(1);
  const targets = [];
  for (const r of refspecs) {
    const plus = r.startsWith('+');
    const spec = plus ? r.slice(1) : r;
    const dst = spec.includes(':') ? spec.split(':').pop() : spec;
    const deleting = del || (spec.startsWith(':') && spec.length > 1);
    targets.push({ branch: dst.replace(/^refs\/heads\//, ''), forced: plus || force, deleting });
  }
  if (refspecs.length === 0) {
    const current = ctx.git(['rev-parse', '--abbrev-ref', 'HEAD']);
    targets.push({ branch: current ? current.trim() : '', forced: force, deleting: false, implicit: true });
  }
  for (const t of targets) {
    const protectedBranch = t.branch && branchMatches(t.branch, ctx.protectedBranches);
    if (protectedBranch && t.deleting) return `git push deleting the protected branch ${t.branch}`;
    if (protectedBranch && (t.forced || lease)) return `a force push to the protected branch ${t.branch}`;
    if (!t.branch && t.implicit && (force || lease)) return 'a force push when the current branch could not be determined';
    if (t.forced && !lease) return `git push --force to ${t.branch || 'the current branch'}; use --force-with-lease, which refuses to overwrite commits you have not fetched`;
  }
  return null;
}

function dirtyTracked(ctx) {
  const out = ctx.git(['status', '--porcelain', '--untracked-files=no']);
  return out !== null && out.trim().length > 0;
}

function checkGit(args, ctx) {
  const { sub, rest } = gitSubcommand(args);
  const gctx = { ...ctx, git: (a) => ctx.git(a, args) };
  if (sub === 'push') return checkPush(rest, gctx);
  if (sub === 'reset' && rest.includes('--hard') && dirtyTracked(gctx)) return 'git reset --hard with uncommitted changes to tracked files (they are not in the reflog); commit or stash first';
  if (sub === 'clean') {
    const force = rest.some((a) => a === '--force' || shortHas(a, 'f'));
    const dry = rest.some((a) => a === '--dry-run' || shortHas(a, 'n'));
    if (force && !dry) return 'git clean -f deletes untracked files, which git never stored; run git clean -n first and delete the files you named by hand';
  }
  if ((sub === 'checkout' || sub === 'restore') && !rest.includes('--staged')) {
    const paths = rest.filter((a) => !a.startsWith('-'));
    if (paths.some((p) => p === '.' || p === ':/' || p === '*') && dirtyTracked(gctx)) return `git ${sub} ${paths.join(' ')} discards every uncommitted change; commit or stash first, or name the files`;
  }
  if (sub === 'stash' && rest[0] === 'clear') return 'git stash clear deletes every stash with no way back';
  if (sub === 'branch' && rest.some((a) => a === '-D' || (a === '--delete' && rest.includes('--force')))) {
    const names = rest.filter((a) => !a.startsWith('-'));
    const hit = names.find((n) => branchMatches(n, ctx.protectedBranches));
    if (hit) return `git branch -D on the protected branch ${hit}`;
  }
  return null;
}

function checkOther({ program, args }, ctx) {
  const all = args.join(' ');
  if (/^mkfs(\.|$)/.test(program)) return `${program} formats a filesystem`;
  if (program === 'dd' && args.some((a) => /^of=\/dev\/(?!null$|zero$|stdout$|stderr$)/.test(a))) return 'dd writing onto a device';
  if ((program === 'chmod' || program === 'chown') && args.some((a) => a === '-R' || a === '--recursive') && args.some((a) => a === '/' || a === '/*' || a === '~' || a === '$HOME')) return `recursive ${program} of the root or home directory`;
  if (/\bdrop\s+(?:database|schema)\b/i.test(all)) return 'DROP DATABASE / DROP SCHEMA';
  if (program === 'terraform' || program === 'tofu') {
    if (args.includes('destroy') || (args.includes('apply') && args.includes('-destroy'))) return `${program} destroy removes every resource in the state`;
  }
  if (program === 'kubectl' && args.includes('delete') && (args.some((a) => a === 'namespace' || a === 'ns' || /^(namespaces?|ns)\//.test(a)) || args.includes('--all') || args.includes('-A') || args.includes('--all-namespaces'))) return 'kubectl delete of a namespace or of everything';
  if (program === 'aws' && args[0] === 's3' && ((args[1] === 'rm' && args.includes('--recursive')) || (args[1] === 'rb' && args.includes('--force')))) return `aws s3 ${args[1]} deleting a bucket's contents`;
  if (program === 'gcloud' && args.includes('projects') && args.includes('delete')) return 'gcloud projects delete';
  if (program === 'rm') return checkRm(args, ctx);
  if (program === 'git') return checkGit(args, ctx);
  return null;
}

const FORK_BOMB = /:\s*\(\s*\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/;

/** Pure decision for one command line: the deny reason, or null. ctx.git(args, gitArgs) returns stdout or null. */
export function check(command, ctx) {
  if (FORK_BOMB.test(command)) return 'a fork bomb';
  for (const re of ctx.allowCommands) { try { if (new RegExp(re).test(command)) return null; } catch { /* bad regex: ignore */ } }
  for (const c of commands(command)) {
    const why = checkOther(c, ctx);
    if (why) return why;
  }
  return null;
}

export function context({ root, options = {}, git }) {
  return {
    root,
    home: homedir(),
    protectedBranches: Array.isArray(options.protectedBranches) ? options.protectedBranches : DEFAULT_PROTECTED,
    allowCommands: Array.isArray(options.allowCommands) ? options.allowCommands : [],
    allowPaths: Array.isArray(options.allowPaths) ? options.allowPaths : [],
    git,
  };
}

/** Run git read-only in the project, honouring a -C dir from the command being checked. */
export function realGit(root) {
  return (args, gitArgs = []) => {
    const c = gitArgs.indexOf('-C');
    const cwd = c >= 0 && gitArgs[c + 1] ? resolve(root, gitArgs[c + 1]) : root;
    try { return execFileSync('git', args, { cwd, encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] }); } catch { return null; }
  };
}

export const reason = (why) =>
  `[destructive-guard] Blocked: ${why}. This cannot be undone. If it really is what the user wants, ask them to run ` +
  'it themselves, or to allow it in .claude/pau-skills.json ("destructive-guard": { "allowCommands": [...] }).';

const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) {
  const input = parseInput(await readStdin());
  const command = input && (input.tool_name === 'Bash' || input.tool_name === 'PowerShell') ? input.tool_input?.command : null;
  if (typeof command === 'string') {
    const root = projectDir(input);
    const config = loadConfig({ project: root });
    if (hookEnabled(NAME, config)) {
      const why = check(command, context({ root, options: hookOptions(NAME, config), git: realGit(root) }));
      if (why) { process.stderr.write(reason(why) + '\n'); process.exit(2); }
    }
  }
  process.exit(0);
}
