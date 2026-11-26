// compact-snapshot blocks a compaction once the session has compacted maxCompactions times (default 2, 0 for no
// limit), and still saves the snapshot first, since Claude Code compacts anyway when the request cannot go out
// uncompacted. Probe (Claude Code 2.1.332, 2026-11-26): a PreCompact hook that prints {"decision":"block","reason"}
// and exits 0 stops /compact, and the result reads "Compaction blocked by PreCompact hook: [command hook]: <reason>".
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { blockReason, compactNote, maxCompactions } from '../hooks/session-discipline/compact-snapshot.mjs';

const SNAP = repo('hooks', 'session-discipline', 'compact-snapshot.mjs');
const [B, S] = readFileSync(repo('tests', 'fixtures', 'compact-snapshot', 'boundary-and-summary.jsonl'), 'utf8').trim().split('\n');
const U = JSON.stringify({ type: 'user', message: { role: 'user', content: 'Keep going.' } });
const A = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } });
const side = (line) => JSON.stringify({ ...JSON.parse(line), isSidechain: true });
const t = (...lines) => lines.join('\n') + '\n';
const REASON = /^\[compact-snapshot\] This session has already compacted (twice|\d+ times), its limit \(maxCompactions in \.claude\/pau-skills\.json\)\. This compaction is blocked: finish the current step, write a handoff or the next kickoff, and tell the user to start a new session\.$/;
const LAST = 'This session has reached its limit of compactions, so the next one will be blocked.';

describe('compact-snapshot: the compaction limit', () => {
  test('maxCompactions is a whole number of 0 or more, else 2', () => {
    assert.equal(maxCompactions({}), 2);
    assert.equal(maxCompactions(undefined), 2);
    assert.equal(maxCompactions({ maxCompactions: 0 }), 0);
    assert.equal(maxCompactions({ maxCompactions: 3 }), 3);
    for (const bad of [-1, 1.5, '3', null, true]) assert.equal(maxCompactions({ maxCompactions: bad }), 2, String(bad));
  });
  test('no reason before two compactions are done, a reason from the third attempt on', () => {
    assert.equal(blockReason({ transcript: t(U, A), opts: {} }), '');
    assert.equal(blockReason({ transcript: t(U, A, B, S, U, A), opts: {} }), '');
    const r = blockReason({ transcript: t(U, A, B, S, U, A, B, S, U, A), opts: {} });
    assert.match(r, REASON);
    assert.match(r, /already compacted twice/);
    assert.match(blockReason({ transcript: t(B, S, A, B, S, A, B, S, A), opts: {} }), /already compacted 3 times/);
  });
  test('maxCompactions 0 never blocks, and 3 blocks only after three', () => {
    assert.equal(blockReason({ transcript: t(B, S, A, B, S, A, B, S, A), opts: { maxCompactions: 0 } }), '');
    assert.equal(blockReason({ transcript: t(B, S, A, B, S, A), opts: { maxCompactions: 3 } }), '');
    assert.match(blockReason({ transcript: t(B, S, A, B, S, A, B, S, A), opts: { maxCompactions: 3 } }), /already compacted 3 times/);
  });
  test('boundaries in a subagent\'s sidechain are not the session\'s compactions', () => {
    assert.equal(blockReason({ transcript: t(side(B), side(B), A, B, S, A), opts: {} }), '');
  });
  test('the hand-off line says the next compaction will be blocked once the limit is reached', () => {
    const two = t(U, A, B, S, U, A);
    assert.ok(compactNote({ transcript: two, snap: null, opts: {} }).includes(LAST));
    assert.ok(!compactNote({ transcript: two, snap: null, opts: { maxCompactions: 0 } }).includes(LAST));
    assert.ok(!compactNote({ transcript: two, snap: null, opts: { maxCompactions: 3 } }).includes(LAST));
  });
});

describe('compact-snapshot: the limit as a hook', () => {
  const setup = (config, env = {}) => {
    const project = tempDir();
    mkdirSync(join(project, '.claude'));
    if (config) writeFileSync(join(project, '.claude', 'pau-skills.json'), JSON.stringify({ 'compact-snapshot': config }));
    const tpath = join(project, 't.jsonl');
    const pre = () => runNode(SNAP, {
      input: JSON.stringify({ hook_event_name: 'PreCompact', trigger: 'auto', cwd: project, transcript_path: tpath, session_id: 'SESSION-A' }),
      env: { PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: project, PAU_SKILLS_DISABLE: '', ...env },
    });
    const snaps = () => { try { return readdirSync(join(project, '.claude', 'pau-skills', 'snapshots')).filter((f) => f.endsWith('.md')); } catch { return []; } };
    return { tpath, pre, snaps };
  };
  const third = t(U, A, B, S, U, A, B, S, U, A);
  test('a third compaction is blocked with the reason, exit 0, and the snapshot is still written', () => {
    const h = setup();
    writeFileSync(h.tpath, third);
    const r = h.pre();
    assert.equal(r.code, 0);
    const out = JSON.parse(r.stdout);
    assert.equal(out.decision, 'block');
    assert.match(out.reason, REASON);
    assert.equal(h.snaps().length, 1);
  });
  test('the second compaction is not blocked', () => {
    const h = setup();
    writeFileSync(h.tpath, t(U, A, B, S, U, A));
    const r = h.pre();
    assert.equal(r.code, 0);
    assert.equal(r.stdout, '');
    assert.equal(h.snaps().length, 1);
  });
  test('maxCompactions 0 and PAU_SKILLS_DISABLE each let the third compaction run', () => {
    for (const h of [setup({ maxCompactions: 0 }), setup(null, { PAU_SKILLS_DISABLE: 'compact-snapshot' })]) {
      writeFileSync(h.tpath, third);
      const r = h.pre();
      assert.equal(r.code, 0);
      assert.equal(r.stdout, '');
    }
  });
});
