// log.mjs for the overnight-run skill: the decision log of an unattended run. Covers the header and the row ids, the
// spreadsheet formula guard, flattening of tabs and newlines, every refusal of append (an empty field, a superseded id
// that does not exist, a log inside a git work tree, a file edited by hand), the append-only guarantee, show, and the
// command line.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync, symlinkSync, realpathSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import {
  HEADER, guardCell, flatten, cleanCell, insideGitTree, appendRow, main,
} from '../skills/agent-orchestration/overnight-run/log.mjs';

const SCRIPT = repo('skills', 'agent-orchestration', 'overnight-run', 'log.mjs');
const ROW = { run: 'run-1', phase: 'loop', decision: 'kept the parser fix', reason: 'two more fixtures pass', evidence: 'commit 3a9f1c2', result: 'remaining 4' };

const newLog = () => join(tempDir('overnight-'), 'decisions.tsv');

/** Run main in process with an empty environment unless one is given; returns { code, out, err }. */
function run(args, env = {}) {
  const out = [];
  const err = [];
  const code = main(args, (s) => out.push(s), (s) => err.push(s), env);
  return { code, out: out.join('\n'), err: err.join('\n') };
}

function append(log, fields = {}, env = {}) {
  const args = ['append', log];
  for (const [k, v] of Object.entries({ ...ROW, ...fields })) if (v !== undefined) args.push(`--${k}`, v);
  return run(args, env);
}

const rows = (log) => readFileSync(log, 'utf8').slice(0, -1).split('\n').slice(1).map((l) => l.split('\t'));
const col = (name) => HEADER.indexOf(name);

describe('the formula guard', () => {
  test('prefixes a cell that starts with = + - or @ with a single quote', () => {
    for (const v of ['=1+1', '+SUM(A1)', '-2', '@cmd', '=HYPERLINK("http://x")']) assert.equal(guardCell(v), `'${v}`);
  });

  test('also after leading whitespace, and when a tab or carriage return comes first', () => {
    assert.equal(guardCell('  =1+1'), "'  =1+1");
    assert.equal(guardCell('\t=1'), "'\t=1");
    assert.equal(guardCell('\tplain'), "'\tplain");
    assert.equal(guardCell('\rplain'), "'\rplain");
    assert.equal(guardCell('\n-1'), "'\n-1");
  });

  test('leaves other cells alone, including those signs later in the text', () => {
    for (const v of ['commit 3a9f1c2', 'a=b', '5 - 3', 'mail me @ noon', "'already quoted", '']) assert.equal(guardCell(v), v);
  });
});

describe('flattening', () => {
  test('replaces tabs, carriage returns, newlines and other control characters with spaces', () => {
    assert.equal(flatten('a\tb\nc\r\nd'), 'a b c  d');
    assert.equal(flatten('x\u0000y\u007fz\u2028w'), 'x y z w');
    assert.equal(flatten('plain text'), 'plain text');
  });

  test('cleanCell guards on the raw value, then flattens, so a leading tab cannot hide a formula', () => {
    assert.equal(cleanCell('\t=1'), "' =1");
    assert.equal(cleanCell('one\ttwo'), 'one two');
    assert.equal(cleanCell('-0.5s'), "'-0.5s");
  });
});

describe('append', () => {
  test('creates the file and its folder with the header, then one row per call with ids from 1', () => {
    const log = join(tempDir('overnight-'), 'a', 'b', 'decisions.tsv');
    const r = append(log);
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /appended row 1/);
    const text = readFileSync(log, 'utf8');
    assert.equal(text.split('\n')[0], HEADER.join('\t'));
    assert.deepEqual(HEADER, ['id', 'time', 'run', 'phase', 'decision', 'reason', 'evidence', 'result', 'supersedes']);
    assert.equal(append(log, { decision: 'second' }).code, 0);
    const two = rows(log);
    assert.equal(two.length, 2);
    assert.deepEqual(two.map((x) => x[col('id')]), ['1', '2']);
    assert.equal(two[0][col('run')], 'run-1');
    assert.equal(two[0][col('evidence')], 'commit 3a9f1c2');
    assert.equal(two[0][col('supersedes')], '');
    assert.match(two[0][col('time')], /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
  });

  test('an empty file gets the header too', () => {
    const log = newLog();
    writeFileSync(log, '');
    assert.equal(append(log).code, 0);
    assert.equal(readFileSync(log, 'utf8').split('\n')[0], HEADER.join('\t'));
    assert.equal(rows(log).length, 1);
  });

  test('the time is the clock in ISO 8601, and only a function parameter can set it', () => {
    const log = newLog();
    const { id } = appendRow(log, ROW, new Date('2026-05-24T09:02:00.123Z'));
    assert.equal(id, 1);
    assert.equal(rows(log)[0][col('time')], '2026-05-24T09:02:00Z');
    const before = Date.now();
    append(log);
    const t = Date.parse(rows(log)[1][col('time')]);
    assert.ok(t >= before - 1000 && t <= Date.now() + 1000, 'the command line stamps the current time');
    const r = run(['append', log, ...Object.entries(ROW).flatMap(([k, v]) => [`--${k}`, v]), '--time', '2020-01-01T00:00:00Z']);
    assert.equal(r.code, 2, 'there is no --time option');
    assert.equal(rows(log).length, 2);
  });

  test('guards formulas and flattens every free text field it writes', () => {
    const log = newLog();
    const r = append(log, { run: '@run', phase: '+p', decision: '=cmd|calc', reason: 'line one\nline two', evidence: '\t-1', result: '  =2' });
    assert.equal(r.code, 0, r.err);
    const [row] = rows(log);
    assert.equal(row.length, HEADER.length, 'a tab inside a field did not add a column');
    assert.equal(row[col('run')], "'@run");
    assert.equal(row[col('phase')], "'+p");
    assert.equal(row[col('decision')], "'=cmd|calc");
    assert.equal(row[col('reason')], 'line one line two');
    assert.equal(row[col('evidence')], "' -1");
    assert.equal(row[col('result')], "'  =2");
    assert.equal(readFileSync(log, 'utf8').split('\n').length, 3, 'the header, one row and the final newline');
  });

  test('refuses a row with a required field missing or empty, and writes nothing', () => {
    for (const name of ['run', 'phase', 'decision', 'reason', 'evidence', 'result']) {
      for (const value of [undefined, '', '   ', '\n\t']) {
        const log = newLog();
        const r = append(log, { [name]: value });
        assert.equal(r.code, 1, `${name}=${JSON.stringify(value)} was accepted`);
        assert.match(r.err, new RegExp(`--${name}`));
        assert.equal(existsSync(log), false);
      }
    }
  });

  test('--run defaults to the session id from the environment', () => {
    const log = newLog();
    assert.equal(append(log, { run: undefined }, { CLAUDE_CODE_SESSION_ID: 'abc-123' }).code, 0);
    assert.equal(rows(log)[0][col('run')], 'abc-123');
    assert.equal(append(log, { run: undefined }, {}).code, 1);
  });

  test('supersedes by appending a row that names an earlier one, and refuses an id that does not exist', () => {
    const log = newLog();
    append(log);
    append(log, { decision: 'reverted the cache' });
    const before = readFileSync(log, 'utf8');
    for (const id of ['3', '99']) {
      const r = append(log, { supersedes: id });
      assert.equal(r.code, 1, `superseding ${id} was accepted`);
      assert.match(r.err, /no row/);
    }
    for (const id of ['two', '0', '-1', '1.5', '']) assert.equal(append(log, { supersedes: id }).code, 2, `--supersedes ${JSON.stringify(id)}`);
    assert.equal(readFileSync(log, 'utf8'), before);
    const r = append(log, { phase: 'audit', decision: 'the cache was kept, not reverted', evidence: 'commit 9b1e004', supersedes: '2' });
    assert.equal(r.code, 0, r.err);
    assert.match(r.out, /supersedes row 2/);
    const all = rows(log);
    assert.equal(all[2][col('id')], '3');
    assert.equal(all[2][col('supersedes')], '2');
    assert.equal(all[1][col('decision')], 'reverted the cache', 'the superseded row is unchanged');
  });

  test('never rewrites earlier rows: every append leaves the old bytes as a prefix', () => {
    const log = newLog();
    append(log);
    let prev = readFileSync(log, 'utf8');
    for (let i = 0; i < 4; i++) {
      assert.equal(append(log, { decision: `attempt ${i}`, supersedes: i % 2 ? '1' : undefined }).code, 0);
      const now = readFileSync(log, 'utf8');
      assert.ok(now.startsWith(prev) && now.length > prev.length, `append ${i} changed earlier bytes`);
      prev = now;
    }
  });

  test('refuses a file that is not a decision log, was cut, or has a row with the wrong field count', () => {
    const notOurs = newLog();
    writeFileSync(notOurs, 'ts\tphase\tdecision\twhy\tevidence\tresult\n');
    assert.match(append(notOurs).err, /header/);
    const cut = newLog();
    append(cut);
    writeFileSync(cut, readFileSync(cut, 'utf8').trimEnd());
    const cutBefore = readFileSync(cut, 'utf8');
    assert.match(append(cut).err, /newline/);
    assert.equal(readFileSync(cut, 'utf8'), cutBefore);
    const edited = newLog();
    append(edited);
    writeFileSync(edited, readFileSync(edited, 'utf8') + 'a\tb\n');
    const r = append(edited);
    assert.equal(r.code, 1);
    assert.match(r.err, /fields/);
  });

  test('refuses a log inside a git work tree, where a reset or clean could erase it', () => {
    // A bare .git folder is enough to mark a work tree, so the test needs no git and no identity.
    const dir = realpathSync(tempDir('overnight-repo-'));
    mkdirSync(join(dir, '.git'));
    mkdirSync(join(dir, 'sub'));
    assert.equal(insideGitTree(join(dir, 'sub', 'decisions.tsv')), dir);
    assert.equal(insideGitTree(join(dir, 'not-yet', 'deeper', 'decisions.tsv')), dir);
    const r = append(join(dir, 'sub', 'decisions.tsv'));
    assert.equal(r.code, 1);
    assert.match(r.err, /git work tree/);
    assert.equal(existsSync(join(dir, 'sub', 'decisions.tsv')), false);
    // A worktree or submodule has a .git file instead of a folder.
    const wt = tempDir('overnight-wt-');
    writeFileSync(join(wt, '.git'), 'gitdir: elsewhere\n');
    assert.equal(insideGitTree(join(wt, 'decisions.tsv')), wt);
    assert.equal(insideGitTree(newLog()), null);
  });

  test('refuses a link that leads into a git work tree', () => {
    const dir = realpathSync(tempDir('overnight-repo-'));
    mkdirSync(join(dir, '.git'));
    const link = join(tempDir('overnight-'), 'link.tsv');
    symlinkSync(join(dir, 'decisions.tsv'), link);
    assert.match(append(link).err, /git work tree/);
    assert.equal(existsSync(join(dir, 'decisions.tsv')), false);
  });
});

describe('show', () => {
  test('prints the rows as a table and marks each superseded row', () => {
    const log = newLog();
    append(log);
    append(log, { decision: 'a | pipe' });
    append(log, { phase: 'audit', decision: 'correction', supersedes: '1' });
    const r = run(['show', log]);
    assert.equal(r.code, 0, r.err);
    const lines = r.out.split('\n');
    assert.equal(lines[0], `| ${HEADER.join(' | ')} | superseded by |`);
    assert.match(lines[2], /^\| 1 \|.*\| 3 \|$/);
    assert.match(lines[3], /a \\\| pipe/);
    assert.match(r.out, /3 rows, 1 superseded/);
  });

  test('--last prints only the latest rows, and a missing log is an error', () => {
    const log = newLog();
    for (let i = 0; i < 5; i++) append(log, { decision: `d${i}` });
    const r = run(['show', log, '--last', '2']);
    assert.equal(r.code, 0);
    assert.doesNotMatch(r.out, /\| d2 \|/);
    assert.match(r.out, /\| d3 \|/);
    assert.match(r.out, /\| d4 \|/);
    assert.equal(run(['show', join(tempDir('overnight-'), 'none.tsv')]).code, 1);
    assert.equal(run(['show', log, '--last', 'x']).code, 2);
  });
});

describe('usage', () => {
  test('unknown commands and options, a missing value and a repeated option exit 2', () => {
    assert.equal(run([]).code, 2);
    assert.equal(run(['frobnicate']).code, 2);
    assert.equal(run(['append']).code, 2);
    assert.equal(run(['append', newLog(), '--colour', 'red']).code, 2);
    assert.equal(run(['append', newLog(), '--phase']).code, 2);
    assert.equal(run(['append', newLog(), '--phase', 'a', '--phase', 'b']).code, 2);
    const r = run(['show']);
    assert.equal(r.code, 2);
    assert.match(r.err, /usage|needs/);
  });

  test('the command line works end to end', () => {
    const log = newLog();
    const args = ['append', log, ...Object.entries(ROW).flatMap(([k, v]) => [`--${k}`, v])];
    const r = runNode(SCRIPT, { args, env: { CLAUDE_CODE_SESSION_ID: '' } });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stdout, /appended row 1/);
    assert.equal(runNode(SCRIPT, { args: ['append', log, '--phase', 'loop'] }).code, 1);
    assert.equal(runNode(SCRIPT, { args: ['nope'] }).code, 2);
  });
});
