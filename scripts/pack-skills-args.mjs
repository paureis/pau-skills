// The command line of scripts/pack-skills.mjs: the usage and --help text, the argument parser, and the choice of which
// skills to pack (named, --all or --since) with the status of each.
import { Failure, git, gitTry, skillFolders } from './pack-skills-repo.mjs';

const USAGE = 'Usage: node scripts/pack-skills.mjs (<skill> [<skill>...] | --since <git ref> | --all) [--out <dir>] [--root <dir>]';

const HELP = `${USAGE}
       npm run pack-skills -- <the same arguments>

Writes one zip per skill for upload to claude.ai (Customize, Skills, Upload a skill), with the skill's folder at the
zip root. The zips hold the files committed at HEAD, not the files on disk, and are built only when every skill passes
the upload rules.

  <skill> [<skill>...]  pack these skills, by name (verify-app) or as <plugin>/<skill> (verification/verify-app)
  --since <git ref>     pack every skill with a committed change between <ref> and HEAD (use the commit of the last
                        upload, for example main before the batch)
  --all                 pack every skill
  --out <dir>           write the zips to <dir>, relative to the current folder, instead of dist/ in the repository;
                        nothing in <dir> is deleted
  --root <dir>          the repository to pack from, relative to the current folder (default: the repository this
                        script is in)
  --help                show this text

Without --out the zips go to dist/ in the repository, and the zips already in dist/ are deleted first.

Each zip is listed with its status:
  new       (--since) no skill of that name existed at <ref>: upload it as a new skill
  changed   (--since) it replaces the uploaded skill of the same name: open that skill on claude.ai and upload the zip
  packed    (named skills or --all) there is no ref to compare with, so new or changed is not known
and each skill that is gone with:
  removed   (--since) it existed at <ref> and has no SKILL.md at HEAD: delete it on claude.ai by hand

Exit codes:
  0  zips written, or nothing to pack
  1  an upload rule failed; no zip was written
  2  usage error, unknown skill, bad ref, or --out is not a folder`;

export function parseArgs(argv) {
  const opts = { names: [], since: null, all: false, out: null, root: null };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const value = () => {
      if (i + 1 >= argv.length || argv[i + 1].startsWith('--')) throw new Failure(`${a} needs a value\n${USAGE}`, 2);
      return argv[++i];
    };
    if (a === '--since') opts.since = value();
    else if (a === '--out') opts.out = value();
    else if (a === '--root') opts.root = value();
    else if (a === '--all') opts.all = true;
    else if (a === '--help' || a === '-h') throw new Failure(HELP, 0);
    else if (a.startsWith('-')) throw new Failure(`unknown option ${a}\n${USAGE}`, 2);
    else opts.names.push(a);
  }
  const modes = [opts.names.length > 0, opts.since !== null, opts.all].filter(Boolean).length;
  if (modes !== 1) throw new Failure(`give skill names, --since <ref> or --all (one of them)\n${USAGE}`, 2);
  return opts;
}

/** Which skill folders to pack, each with a status, and which skills were removed. */
function selectTargets(root, opts, head, warn) {
  const pick = (list, label) => {
    if (list.length > 1) throw new Failure(`${label} is in more than one plugin: ${list.map((f) => f.dir).join(', ')}`, 2);
    return list[0];
  };
  if (opts.all) {
    return { targets: [...head.values()].map((list) => ({ folder: pick(list, list[0].name), status: 'packed' })), removed: [] };
  }
  if (opts.names.length) {
    const targets = [];
    for (const raw of opts.names) {
      const arg = raw.replace(/\\/g, '/').replace(/^skills\//, '').replace(/\/+$/, '');
      const parts = arg.split('/');
      let folder;
      if (parts.length === 1) folder = head.has(arg) ? pick(head.get(arg), arg) : null;
      else if (parts.length === 2) folder = (head.get(parts[1]) || []).find((f) => f.plugin === parts[0]) || null;
      if (!folder) throw new Failure(`unknown skill: ${raw} (no folder skills/<plugin>/${parts[parts.length - 1]}/ at HEAD)`, 2);
      if (!targets.some((t) => t.folder === folder)) targets.push({ folder, status: 'packed' });
    }
    return { targets, removed: [] };
  }

  const ref = opts.since;
  try {
    git(root, ['rev-parse', '--verify', '--quiet', `${ref}^{commit}`]);
  } catch {
    throw new Failure(`unknown git ref: ${ref}`, 2);
  }
  if (gitTry(root, ['merge-base', '--is-ancestor', ref, 'HEAD']) === null) {
    warn(`WARNING: ${ref} is not an ancestor of HEAD (it is on another branch, or HEAD was moved back). The lists below compare the two trees, so new and removed may be wrong: a skill that only ever existed on ${ref}'s side shows as removed.`);
  }
  const before = skillFolders(root, ref);
  const hadSkill = (name) => (before.get(name) || []).some((f) => f.hasSkillMd);
  const touched = new Set();
  const diff = git(root, ['diff', '--name-status', '--no-renames', '-z', ref, 'HEAD', '--', 'skills/']).split('\0').filter(Boolean);
  for (let i = 0; i + 1 < diff.length; i += 2) {
    const parts = diff[i + 1].split('/');
    if (parts.length >= 4) touched.add(parts[2]);
  }
  const targets = [];
  const removed = [];
  for (const name of [...touched].sort()) {
    const live = (head.get(name) || []).filter((f) => f.hasSkillMd);
    if (live.length) targets.push({ folder: pick(live, name), status: hadSkill(name) ? 'changed' : 'new' });
    else if (hadSkill(name)) removed.push(before.get(name).find((f) => f.hasSkillMd));
    // otherwise a folder with no SKILL.md at either end: not a skill
  }
  return { targets, removed };
}

export { selectTargets };
