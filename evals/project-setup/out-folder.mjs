// Where a project-setup eval run writes. Claude Code loads the CLAUDE.md of every parent folder, so a run folder
// inside this repository lets the assistant, the persona and the judge read this repository's CLAUDE.md, which
// changes how they behave. With no --out, a run writes into a fresh folder under the system temp folder, and a folder
// inside the repository, or under any other CLAUDE.md, is refused. Node 20+, standard library only; nothing happens
// on import.
import { existsSync, mkdirSync, mkdtempSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';

/** The real path of p, also when p does not exist yet: the real path of its nearest existing parent, plus the rest. */
function realPath(p) {
  const missing = [];
  let at = resolve(p);
  for (;;) {
    try {
      return join(realpathSync(at), ...missing);
    } catch {
      const up = dirname(at);
      if (up === at) return join(at, ...missing);
      missing.unshift(basename(at));
      at = up;
    }
  }
}

/** True when dir is root or inside it, after resolving links on both sides. A relative dir is read from the cwd. */
export function insideRepo(dir, root) {
  const rel = relative(realPath(root), realPath(dir));
  return !(rel === '..' || rel.startsWith(`..${sep}`) || isAbsolute(rel));
}

const MEMORY = ['CLAUDE.md', 'CLAUDE.local.md', join('.claude', 'CLAUDE.md')];

/**
 * The first CLAUDE.md, CLAUDE.local.md or .claude/CLAUDE.md in dir or any parent up to the file system root, or null.
 * It walks the parents of the resolved path and of the real path, so a link can hide none.
 */
export function parentClaudeMd(dir) {
  for (const start of [resolve(dir), realPath(dir)]) {
    for (let at = start; ; at = dirname(at)) {
      for (const f of MEMORY) if (existsSync(join(at, f))) return join(at, f);
      if (dirname(at) === at) break;
    }
  }
  return null;
}

const WHY = "Claude Code loads the CLAUDE.md of every parent folder, so the assistant, the persona and the judge would read this repository's CLAUDE.md.";
const WHY_FILE = 'Claude Code loads the CLAUDE.md of every parent folder, so the assistant, the persona and the judge would read it.';

/**
 * Throws when the folder a run would write under (--out, or else the system temp folder) is inside root, or when it
 * or a parent holds a CLAUDE.md (for example a worktree inside another checkout).
 */
export function checkOut(opts, root) {
  const given = opts.out !== undefined;
  const dir = given ? opts.out : tmpdir();
  if (insideRepo(dir, root)) {
    if (given) throw new Error(`--out ${dir} is inside the repository ${root}. ${WHY} Pass a folder outside it, or leave out --out for a fresh folder under the system temp folder.`);
    throw new Error(`The system temp folder ${dir} (TMPDIR) is inside the repository ${root}. ${WHY} Point TMPDIR at a folder outside it, or pass --out a folder outside it.`);
  }
  const found = parentClaudeMd(dir);
  if (!found) return;
  if (given) throw new Error(`--out ${dir} sits under ${found}. ${WHY_FILE} Pass a folder with no CLAUDE.md above it.`);
  throw new Error(`The system temp folder ${dir} (TMPDIR) sits under ${found}. ${WHY_FILE} Point TMPDIR at a folder with no CLAUDE.md above it, or pass --out such a folder.`);
}

/** The absolute output folder: --out, made when missing, or else a new folder under the system temp folder. */
export function makeOut(opts) {
  if (opts.out === undefined) return resolve(mkdtempSync(join(tmpdir(), 'project-setup-eval-')));
  const dir = resolve(opts.out);
  mkdirSync(dir, { recursive: true });
  return dir;
}
