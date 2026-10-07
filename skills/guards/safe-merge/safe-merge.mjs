#!/usr/bin/env node
// Merge a pull request without breaking the ones stacked on it.
//
//   node safe-merge.mjs <number> [--dry-run]
//
// The rule: a branch is deleted only when no open PR uses it as its base; deleting it earlier makes GitHub close the
// stacked PRs. This program always merges without --delete-branch, pinned to the head commit it just read, and deletes
// the remote head branch in a separate step, after the merge, only if the stacked-PR query comes back empty.
//
// Configuration (environment variables, all optional):
//   SAFE_MERGE_REPO        owner/repo the checkout must point at; refuse otherwise (default: no check, but printed)
//   SAFE_MERGE_TRUNK       the branch PRs are merged into (default: the repository's default branch)
//   SAFE_MERGE_PROMOTIONS  extra allowed head->base pairs, comma-separated, e.g. "develop->main"
//   SAFE_MERGE_PROTECTED   branches never deleted, comma-separated (default: trunk, promotion branches, main, master, develop)
//   SAFE_MERGE_METHOD      merge | squash | rebase (default: merge)
//
// Exit codes: 0 done; 1 the merge failed (no deletion attempted); 2 usage; 3 refused before merging; 4 merged but the
// branch could not be deleted or the decision could not be made (the output always says whether the merge happened).
import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const errorText = (e) => {
  const err = e && e.stderr ? String(e.stderr).trim() : '';
  return err || (e && e.message ? String(e.message) : String(e));
};
const list = (s) => (s || '').split(',').map((x) => x.trim()).filter(Boolean);

/** Options from the environment. Pure: takes the env object. */
export function optionsFromEnv(env) {
  const promotions = list(env.SAFE_MERGE_PROMOTIONS).map((p) => {
    const m = /^([^\s>-][^\s>]*)\s*->\s*(\S+)$/.exec(p);
    if (!m) throw new Error(`SAFE_MERGE_PROMOTIONS entry not understood: ${p} (expected head->base)`);
    return { head: m[1], base: m[2] };
  });
  const method = env.SAFE_MERGE_METHOD || 'merge';
  if (!['merge', 'squash', 'rebase'].includes(method)) throw new Error(`SAFE_MERGE_METHOD must be merge, squash or rebase, not ${method}`);
  return {
    repo: env.SAFE_MERGE_REPO || null,
    trunk: env.SAFE_MERGE_TRUNK || null,
    promotions,
    protectedBranches: env.SAFE_MERGE_PROTECTED ? list(env.SAFE_MERGE_PROTECTED) : null,
    method,
  };
}

/**
 * Merge PR `number`. `gh` is a function (args) => stdout text that throws if gh fails: the program passes the real one
 * and the tests a fake that records the calls.
 * @returns {{ code: number, lines: string[] }}
 */
export function safeMerge(number, options, gh) {
  const n = String(number);
  const o = options || {};
  const dryRun = Boolean(o.dryRun);
  const lines = [];
  const say = (t) => lines.push(t);
  const end = (code) => ({ code, lines });
  const refuse = (why, instruction) => {
    say(`NOT MERGED (nothing was touched): ${why}`);
    if (instruction) say(instruction);
    say('MERGED: no');
    return end(3);
  };

  // Destination: owner/repo, default branch and active account, before writing anything remote.
  let repo, trunk, account;
  try {
    const info = JSON.parse(gh(['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef']));
    repo = info.nameWithOwner;
    trunk = o.trunk || (info.defaultBranchRef && info.defaultBranchRef.name);
    account = gh(['api', 'user', '-q', '.login']).trim();
  } catch (e) {
    return refuse(`could not read the repository or the gh account (${errorText(e)}).`, 'Check gh auth status and try again.');
  }
  if (!repo || !trunk) return refuse('the repository or its default branch could not be determined.');
  say(`Destination: ${repo} (gh account: ${account}), trunk ${trunk}`);
  if (o.repo && repo !== o.repo) {
    return refuse(`the repository is ${repo} and SAFE_MERGE_REPO expects ${o.repo}.`, 'Run the program from the right checkout.');
  }
  const promotions = o.promotions || [];
  const protectedBranches = o.protectedBranches || [...new Set([trunk, ...promotions.flatMap((p) => [p.head, p.base]), 'main', 'master', 'develop'])];
  const method = o.method || 'merge';

  let pr;
  try {
    pr = JSON.parse(gh(['pr', 'view', n, '--json', 'state,isDraft,isCrossRepository,baseRefName,headRefName,headRefOid,mergeStateStatus']));
  } catch (e) {
    return refuse(`could not read PR #${n} (${errorText(e)}).`);
  }
  const { state, isDraft, isCrossRepository: fork, baseRefName: base, headRefName: head, headRefOid: oid, mergeStateStatus: checks } = pr || {};
  if (!head || !base || !oid) return refuse(`the gh answer about PR #${n} is not understood.`);
  say(`PR #${n}: ${head} -> ${base}, state ${state}, mergeStateStatus ${checks ?? 'unknown'} (information, it does not decide).`);

  if (state !== 'OPEN') return refuse(`PR #${n} is not open (state ${state}); if it was already merged there is nothing to do.`);
  if (isDraft) return refuse(`PR #${n} is a draft.`, `Mark it ready with: gh pr ready ${n}`);
  const validBase = base === trunk || promotions.some((p) => p.head === head && p.base === base);
  if (!validBase) {
    return refuse(
      `the base of PR #${n} is ${base}, not ${trunk}: it is a stacked PR and would merge into a branch that is not the trunk.`,
      `Steps: merge the PR below it first, then gh pr edit ${n} --base ${trunk}, bring ${trunk} into the PR's branch, ` +
        'and close and reopen it so CI runs (changing the base does not trigger it).',
    );
  }

  const stackedOn = () => {
    const out = JSON.parse(gh(['pr', 'list', '--base', head, '--state', 'open', '--json', 'number']));
    if (!Array.isArray(out) || out.some((x) => !x || typeof x.number !== 'number')) throw new Error('the stacked PR list is not understood');
    return out.map((x) => x.number);
  };
  const mergeArgs = ['pr', 'merge', n, `--${method}`, '--match-head-commit', oid];

  if (dryRun) {
    say('--dry-run: reads only; nothing is merged or deleted.');
    say(`Would run: gh ${mergeArgs.join(' ')}`);
    if (fork) say(`Would delete no branch: PR #${n} comes from a fork and ${head} does not live in ${repo}.`);
    else if (protectedBranches.includes(head)) say(`Would not delete ${head}: it is a protected branch.`);
    else {
      try {
        const stacked = stackedOn();
        say(stacked.length
          ? `Would not delete ${head}: open PRs ${stacked.map((x) => '#' + x).join(', ')} use it as their base.`
          : `Would delete the remote branch ${head} after merging (no open PR uses it as its base now).`);
      } catch (e) {
        say(`Would not delete ${head}: the stacked PRs could not be queried (${errorText(e)}).`);
      }
    }
    say('MERGED: no (dry run)');
    return end(0);
  }

  // Merge the head that was read, not another one pushed between the read and the merge.
  try {
    gh(mergeArgs);
  } catch (e) {
    say(`THE MERGE FAILED: ${errorText(e)}`);
    say('MERGED: no (no branch deletion was attempted)');
    return end(1);
  }
  say(`Merged PR #${n} (${head} -> ${base}).`);
  say('MERGED: yes');

  if (fork) { say(`No branch deleted: the PR comes from a fork and ${head} does not live in ${repo}.`); return end(0); }
  if (protectedBranches.includes(head)) { say(`Branch ${head} not deleted: it is a protected branch.`); return end(0); }

  let stacked;
  try {
    stacked = stackedOn();
  } catch (e) {
    say(`${head} NOT DELETED: could not check whether an open PR uses it as its base (${errorText(e)}).`);
    say('The merge already happened; do not run it again. Delete the branch by hand once no open PR uses it.');
    return end(4);
  }
  if (stacked.length > 0) {
    say(`${head} NOT DELETED: ${stacked.map((x) => 'PR #' + x).join(', ')} use it as their base. Branches are deleted when the whole chain is merged.`);
    for (const x of stacked) {
      say(`Next step for PR #${x}: gh pr edit ${x} --base ${trunk}; bring ${trunk} into its branch; close and reopen it (gh pr close ${x}, gh pr reopen ${x}) so CI runs.`);
    }
    return end(0);
  }
  if (!/^[A-Za-z0-9._/-]+$/.test(head)) { say(`${head} NOT DELETED: the branch name has characters this program does not handle.`); return end(4); }
  try {
    gh(['api', '-X', 'DELETE', `repos/${repo}/git/refs/heads/${head}`]);
  } catch (e) {
    say(`${head} NOT DELETED: ${errorText(e)}`);
    say('The merge already happened; do not run it again.');
    return end(4);
  }
  say(`Deleted the remote branch ${head} (no open PR used it as its base). The local branch, if any, is deleted by hand.`);
  return end(0);
}

function main(argv) {
  const dryRun = argv.includes('--dry-run');
  const rest = argv.filter((a) => a !== '--dry-run');
  if (rest.length !== 1 || !/^\d+$/.test(rest[0])) {
    console.log('Usage: node safe-merge.mjs <number> [--dry-run]');
    return 2;
  }
  let options;
  try { options = optionsFromEnv(process.env); } catch (e) { console.log(String(e.message)); return 2; }
  // SAFE_MERGE_GH_SCRIPT is for testing the real program only: a node script that stands in for gh.
  const fake = process.env.SAFE_MERGE_GH_SCRIPT;
  const gh = (args) => fake
    ? execFileSync(process.execPath, [fake, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] })
    : execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  const { code, lines } = safeMerge(rest[0], { ...options, dryRun }, gh);
  console.log(lines.join('\n'));
  return code;
}

// Only runs as a program; tests import safeMerge without launching anything. realpath: on Windows the drive letter's
// case can differ between import.meta.url and argv.
const isMain = (() => { try { return import.meta.url === pathToFileURL(realpathSync.native(process.argv[1])).href; } catch { return false; } })();
if (isMain) process.exit(main(process.argv.slice(2)));
