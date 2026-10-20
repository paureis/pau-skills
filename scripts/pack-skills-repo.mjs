// The git side of scripts/pack-skills.mjs: the Failure error, git calls with a clean environment, the default-branch
// warning, and the skill folders and blobs read from a commit.
import { execFileSync } from 'node:child_process';

class Failure extends Error {
  constructor(message, code) {
    super(message);
    this.code = code;
  }
}

const GIT_ENV = ['GIT_DIR', 'GIT_INDEX_FILE', 'GIT_WORK_TREE'];
const gitEnv = () => Object.fromEntries(Object.entries(process.env).filter(([k]) => !GIT_ENV.includes(k)));

function git(root, args, { input, buffer = false } = {}) {
  try {
    return execFileSync('git', ['-C', root, ...args], {
      input, encoding: buffer ? undefined : 'utf8', maxBuffer: 1 << 30, stdio: ['pipe', 'pipe', 'pipe'], env: gitEnv(),
    });
  } catch (e) {
    throw new Failure(`git ${args.join(' ')} failed: ${String(e.stderr || e.message).trim()}`, 2);
  }
}

/** The trimmed output of a git command, or null when it exits non-zero. */
function gitTry(root, args) {
  try {
    return git(root, args).trim();
  } catch {
    return null;
  }
}

/** A warning when HEAD is not the default branch (origin/HEAD, else main, else master), or null. */
function branchWarning(root) {
  let name = null;
  const remote = gitTry(root, ['symbolic-ref', '--quiet', 'refs/remotes/origin/HEAD']);
  if (remote) name = remote.replace(/^refs\/remotes\/origin\//, '');
  else name = ['main', 'master'].find((n) => gitTry(root, ['rev-parse', '--verify', '--quiet', `refs/heads/${n}`]) !== null) || null;
  if (!name) return null;
  if (gitTry(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']) === name) return null;
  const head = gitTry(root, ['rev-parse', 'HEAD']);
  for (const ref of [`refs/heads/${name}`, `refs/remotes/origin/${name}`]) {
    if (head && gitTry(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]) === head) return null;
  }
  const at = gitTry(root, ['symbolic-ref', '--quiet', '--short', 'HEAD']) || 'a detached HEAD';
  return `WARNING: HEAD (${at}) is not on the default branch (${name}). The zips are meant to be built from ${name} after the merge.`;
}

/** Every folder skills/<plugin>/<name>/ at `rev`, as a map from name to [{ plugin, name, dir, hasSkillMd, files }]. */
function skillFolders(root, rev) {
  const out = new Map();
  const raw = git(root, ['ls-tree', '-r', '-z', '--full-tree', rev, '--', 'skills/']);
  for (const rec of raw.split('\0').filter(Boolean)) {
    const tab = rec.indexOf('\t');
    const [mode, type, sha] = rec.slice(0, tab).split(' ');
    const path = rec.slice(tab + 1);
    const parts = path.split('/');
    if (parts.length < 4) continue; // skills/<plugin>/README.md and the like are not skills
    const [, plugin, name] = parts;
    const dir = `skills/${plugin}/${name}`;
    let list = out.get(name);
    if (!list) out.set(name, (list = []));
    let folder = list.find((f) => f.dir === dir);
    if (!folder) list.push((folder = { plugin, name, dir, hasSkillMd: false, files: [] }));
    const rel = parts.slice(3).join('/');
    if (rel === 'SKILL.md') folder.hasSkillMd = true;
    folder.files.push({ rel, mode, type, sha });
  }
  return out;
}

/** The blobs for `shas`, read in one `git cat-file --batch`. */
function readBlobs(root, shas) {
  const out = new Map();
  if (!shas.length) return out;
  const buf = git(root, ['cat-file', '--batch'], { input: `${shas.join('\n')}\n`, buffer: true });
  let p = 0;
  for (const sha of shas) {
    const nl = buf.indexOf(0x0a, p);
    const [got, type, size] = buf.toString('utf8', p, nl).split(' ');
    if (got !== sha || type !== 'blob') throw new Failure(`could not read ${sha} from git`, 2);
    const start = nl + 1;
    out.set(sha, buf.subarray(start, start + Number(size)));
    p = start + Number(size) + 1;
  }
  return out;
}

export { Failure, git, gitTry, branchWarning, skillFolders, readBlobs };
