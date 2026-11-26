// compact-snapshot counts the session's compactions from its transcript and, from the handoffAfter-th one (default
// 2), tells the session to hand off. The boundary and summary lines are real ones from a probe, trimmed.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, readFileSync, readdirSync, writeFileSync, utimesSync } from 'node:fs';
import { join } from 'node:path';
import { repo, runNode, tempDir } from './helpers.mjs';
import { compactionNumber, compactNote, handoffAfter, latestSnapshot, writeSnapshot } from '../hooks/session-discipline/compact-snapshot.mjs';

const SNAP = repo('hooks', 'session-discipline', 'compact-snapshot.mjs');
const [B, S] = readFileSync(repo('tests', 'fixtures', 'compact-snapshot', 'boundary-and-summary.jsonl'), 'utf8').trim().split('\n');
const U = JSON.stringify({ type: 'user', message: { role: 'user', content: 'Keep going.' } });
const A = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Done.' }] } });
// An assistant line whose Bash command only mentions the boundary text.
const FAKE = JSON.stringify({ type: 'assistant', message: { content: [{ type: 'tool_use', name: 'Bash', input: { command: 'grep \'"type":"system","subtype":"compact_boundary"\' t.jsonl' } }] } });
const side = (line) => JSON.stringify({ ...JSON.parse(line), isSidechain: true });
const t = (...lines) => lines.join('\n') + '\n';
const HANDOFF = /^\[compact-snapshot\] This is compaction (\d+) in this session\. Finish the current step, then write a handoff or the next kickoff and tell the user to start a new session\./;
const line = (text) => { const m = HANDOFF.exec(text); return m ? Number(m[1]) : null; };

describe('compact-snapshot: the compaction number', () => {
  test('the fixture lines parse as a boundary and its summary', () => {
    assert.equal(JSON.parse(B).subtype, 'compact_boundary');
    assert.equal(JSON.parse(S).isCompactSummary, true);
  });
  test('no boundary is the first compaction', () => assert.equal(compactionNumber(t(U, A)), 1));
  test('a boundary followed only by its summary is that compaction, already written', () => assert.equal(compactionNumber(t(U, A, B, S)), 1));
  test('a boundary followed by an assistant line means the new boundary is not written yet', () => assert.equal(compactionNumber(t(U, A, B, S, U, A)), 2));
  test('two boundaries with an assistant line between them, the new one written', () => assert.equal(compactionNumber(t(B, S, A, B, S)), 2));
  test('sidechain lines are not counted', () => {
    assert.equal(compactionNumber(t(B, S, side(A))), 1);
    assert.equal(compactionNumber(t(side(B), A)), 1);
  });
  test('a partial boundary line at the end is skipped', () => assert.equal(compactionNumber(t(B, S) + B.slice(0, 60)), 1));
  test('a line that only mentions compact_boundary in a command is not a boundary', () => {
    assert.equal(compactionNumber(t(FAKE, B, S)), 1);
    assert.equal(compactionNumber(t(FAKE, A)), 1);
  });
  test('empty and odd text count as the first compaction', () => {
    assert.equal(compactionNumber(''), 1);
    assert.equal(compactionNumber('5\nnull\n"x"\n'), 1);
  });
});

describe('compact-snapshot: the hand-off line', () => {
  const two = t(U, A, B, S, U, A);
  const one = t(U, A);
  test('none at the first compaction, the line at the second', () => {
    assert.equal(compactNote({ transcript: one, snap: null, opts: {} }), '');
    assert.equal(compactNote({ transcript: t(U, A, B, S), snap: null, opts: {} }), '');
    assert.equal(line(compactNote({ transcript: two, snap: null, opts: {} })), 2);
    assert.equal(line(compactNote({ transcript: t(B, S, A, B, S), snap: null, opts: {} })), 2);
  });
  test('the line comes first, then the snapshot after a blank line', () => {
    const text = compactNote({ transcript: two, snap: { path: '/s.md', text: '# Pre-compaction snapshot', compaction: 0 }, opts: {} });
    assert.match(text, HANDOFF);
    assert.match(text, /new session\.\n\n\[compact-snapshot\] The conversation was just compacted/);
  });
  test('no readable transcript gives no line, and the snapshot is still there', () => {
    const text = compactNote({ transcript: null, snap: { path: '/s.md', text: 'facts', compaction: 5 }, opts: {} });
    assert.equal(line(text), null);
    assert.match(text, /^\[compact-snapshot\] The conversation was just compacted/);
  });
  test('the larger of the transcript count and the snapshot count wins, for the same session', () => {
    assert.equal(line(compactNote({ transcript: one, snap: { path: '/s.md', text: '', compaction: 3, session: 'S1' }, opts: {}, session: 'S1' })), 3);
    assert.equal(line(compactNote({ transcript: t(B, S, A, B, S, A), snap: { path: '/s.md', text: '', compaction: 2, session: 'S1' }, opts: {}, session: 'S1' })), 3);
  });
  test('another session\'s snapshot gives neither its count nor its text', () => {
    assert.equal(compactNote({ transcript: one, snap: { path: '/x.md', text: 'X facts', compaction: 3, session: 'X' }, opts: {}, session: 'Y' }), '');
  });
  test('a SessionStart with no session_id uses neither the count nor a snapshot that records a session', () => {
    for (const session of [undefined, '', 42]) {
      assert.equal(compactNote({ transcript: one, snap: { path: '/x.md', text: 'X facts', compaction: 3, session: 'X' }, opts: {}, session }), '');
    }
  });
  test('a snapshot that records no session is still shown, and its count is not used', () => {
    const text = compactNote({ transcript: one, snap: { path: '/old.md', text: 'old facts', compaction: 3, session: '' }, opts: {}, session: 'Y' });
    assert.equal(line(text), null);
    assert.match(text, /^\[compact-snapshot\] The conversation was just compacted[^\n]*\n\nold facts/);
  });
  test('handoffAfter: 0 turns the line off', () => {
    assert.equal(compactNote({ transcript: two, snap: null, opts: { handoffAfter: 0 } }), '');
    assert.equal(compactNote({ transcript: t(B, S, A, B, S, A, B, S, A), snap: null, opts: { handoffAfter: 0 } }), '');
  });
  test('handoffAfter: 3 prints none at 2 and prints at 3', () => {
    assert.equal(compactNote({ transcript: two, snap: null, opts: { handoffAfter: 3 } }), '');
    assert.equal(line(compactNote({ transcript: t(B, S, A, B, S, A), snap: null, opts: { handoffAfter: 3 } })), 3);
  });
  test('handoffAfter: 1 prints at the first compaction', () => assert.equal(line(compactNote({ transcript: one, snap: null, opts: { handoffAfter: 1 } })), 1));
  test('an invalid handoffAfter keeps 2', () => {
    for (const v of [-1, 1.5, 2.5, '2', '3', '0', true, null, [], {}]) {
      assert.equal(handoffAfter({ handoffAfter: v }), 2, JSON.stringify(v));
      assert.equal(compactNote({ transcript: one, snap: null, opts: { handoffAfter: v } }), '', `no line at 1 with ${JSON.stringify(v)}`);
      assert.equal(line(compactNote({ transcript: two, snap: null, opts: { handoffAfter: v } })), 2, `a line at 2 with ${JSON.stringify(v)}`);
    }
    assert.equal(handoffAfter({}), 2);
    assert.equal(handoffAfter({ handoffAfter: 4 }), 4);
  });
});

describe('compact-snapshot: the count PreCompact records', () => {
  test('the snapshot records the boundaries in the file plus one, and latestSnapshot reads it back', () => {
    const dir = join(tempDir(), 'snaps');
    writeSnapshot({ dir, transcript: t(U, A, B, S, U), trigger: 'auto', git: '' });
    const snap = latestSnapshot(dir);
    assert.equal(snap.compaction, 2);
    assert.match(snap.text, /^# Pre-compaction snapshot \([^)]*\)\n\ncompaction: 2\n/);
  });
  test('a snapshot with no count line reads as 0', () => {
    const dir = tempDir();
    writeFileSync(join(dir, 'a.md'), '# Pre-compaction snapshot (x, auto)\n\nfacts\n');
    assert.equal(latestSnapshot(dir).compaction, 0);
    assert.equal(latestSnapshot(dir).session, '');
  });
  test('the snapshot records the session next to the count', () => {
    const dir = join(tempDir(), 'snaps');
    writeSnapshot({ dir, transcript: t(U, A), trigger: 'auto', git: '', session: 'SESSION-A' });
    const snap = latestSnapshot(dir);
    assert.match(snap.text, /^# Pre-compaction snapshot \([^)]*\)\n\ncompaction: 1\nsession: SESSION-A\n\n/);
    assert.equal(snap.session, 'SESSION-A');
    assert.equal(snap.compaction, 1);
  });
  test('a session_id with a line break, over 200 characters or not a string is not written', () => {
    for (const session of ['a\nsession: b', 'a\rb', 'x'.repeat(201), '', 42, null]) {
      const dir = join(tempDir(), 'snaps');
      writeSnapshot({ dir, transcript: t(U, A), trigger: 'auto', git: '', session });
      const snap = latestSnapshot(dir);
      assert.doesNotMatch(snap.text, /^session:/m, JSON.stringify(session));
      assert.equal(snap.session, '', JSON.stringify(session));
      assert.equal(snap.compaction, 1);
    }
    const dir = join(tempDir(), 'snaps');
    writeSnapshot({ dir, transcript: '', trigger: 'auto', git: '', session: 'x'.repeat(200) });
    assert.equal(latestSnapshot(dir).session, 'x'.repeat(200));
  });
});

describe('compact-snapshot: count and hand-off as a hook', () => {
  const setup = (config) => {
    const project = tempDir();
    mkdirSync(join(project, '.claude'));
    if (config) writeFileSync(join(project, '.claude', 'pau-skills.json'), JSON.stringify({ 'compact-snapshot': config }));
    const env = { PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: project, PAU_SKILLS_DISABLE: '' };
    const tpath = join(project, 't.jsonl');
    const run = (input) => runNode(SNAP, { input: JSON.stringify({ cwd: project, transcript_path: tpath, session_id: 'SESSION-A', ...input }), env });
    const start = () => run({ hook_event_name: 'SessionStart', source: 'compact' });
    const pre = () => run({ hook_event_name: 'PreCompact', trigger: 'manual' });
    const context = (r) => (r.stdout ? JSON.parse(r.stdout).hookSpecificOutput.additionalContext : '');
    return { project, tpath, run, start, pre, context, snaps: join(project, '.claude', 'pau-skills', 'snapshots') };
  };
  test('the second compaction prints the line first and the snapshot after it', () => {
    const h = setup();
    writeFileSync(h.tpath, t(U, A, B, S, U, A));
    const w = h.pre();
    assert.equal(w.code, 0); assert.equal(w.stdout, '');
    const r = h.start();
    assert.equal(r.code, 0);
    const text = h.context(r);
    assert.equal(line(text), 2);
    assert.match(text, /new session\.\n\n\[compact-snapshot\] The conversation was just compacted/);
  });
  test('the first compaction prints the snapshot with no line', () => {
    const h = setup();
    writeFileSync(h.tpath, t(U, A));
    h.pre();
    const text = h.context(h.start());
    assert.match(text, /^\[compact-snapshot\] The conversation was just compacted/);
    assert.doesNotMatch(text, /This is compaction/);
  });
  test('the line alone when there is no snapshot', () => {
    const h = setup();
    writeFileSync(h.tpath, t(U, A, B, S, U, A));
    const text = h.context(h.start());
    assert.equal(line(text), 2);
    assert.doesNotMatch(text, /The conversation was just compacted/);
  });
  test('two compactions with no assistant line between: the PreCompact count wins', () => {
    const h = setup();
    writeFileSync(h.tpath, t(U, A, B, S, U));
    const w = h.pre();
    assert.equal(w.code, 0); assert.equal(w.stdout, '');
    const text = h.context(h.start());
    assert.equal(line(text), 2);
    assert.match(text, /The conversation was just compacted/);
  });
  test('another session in the same project gives neither its count nor its text', () => {
    const h = setup();
    const ty = join(h.project, 'y.jsonl'); const tx = join(h.project, 'x.jsonl');
    writeFileSync(ty, t(U, A)); writeFileSync(tx, t(U, A, B, S, U, A));
    h.run({ hook_event_name: 'PreCompact', trigger: 'auto', session_id: 'SESSION-Y', transcript_path: ty });
    h.run({ hook_event_name: 'PreCompact', trigger: 'auto', session_id: 'SESSION-X', transcript_path: tx });
    assert.match(latestSnapshot(h.snaps).text, /^session: SESSION-X$/m);
    const r = h.run({ hook_event_name: 'SessionStart', source: 'compact', session_id: 'SESSION-Y', transcript_path: ty });
    assert.equal(r.code, 0); assert.equal(r.stdout, '');
  });
  test('another session\'s snapshot is ignored when this session\'s PreCompact wrote nothing', () => {
    const h = setup();
    const tx = join(h.project, 'x.jsonl');
    writeFileSync(tx, t(U, A, B, S, U)); writeFileSync(h.tpath, t(U, A));
    h.run({ hook_event_name: 'PreCompact', trigger: 'auto', session_id: 'SESSION-X', transcript_path: tx });
    const r = h.run({ hook_event_name: 'SessionStart', source: 'compact', session_id: 'SESSION-Y' });
    assert.equal(r.code, 0); assert.equal(r.stdout, '');
  });
  test('a snapshot older than an hour is ignored for the count', () => {
    const h = setup();
    writeFileSync(h.tpath, t(U, A, B, S, U));
    h.pre();
    const old = (Date.now() - 2 * 3600 * 1000) / 1000;
    for (const f of readdirSync(h.snaps).filter((x) => x.endsWith('.md'))) utimesSync(join(h.snaps, f), old, old);
    const r = h.start();
    assert.equal(r.code, 0); assert.equal(r.stdout, '');
  });
  test('handoffAfter: 1 prints the line at the first compaction', () => {
    const h = setup({ handoffAfter: 1 });
    writeFileSync(h.tpath, t(U, A));
    assert.equal(line(h.context(h.start())), 1);
  });
  test('handoffAfter: 0 prints no line', () => {
    const h = setup({ handoffAfter: 0 });
    writeFileSync(h.tpath, t(B, S, A, B, S, A));
    const r = h.start();
    assert.equal(r.code, 0); assert.equal(r.stdout, '');
  });
  test('SessionStart startup prints nothing, even on a two-compaction transcript', () => {
    const h = setup();
    writeFileSync(h.tpath, t(U, A, B, S, U, A));
    h.pre();
    const r = h.run({ hook_event_name: 'SessionStart', source: 'startup' });
    assert.equal(r.code, 0); assert.equal(r.stdout, '');
  });
  test('a missing transcript gives no line, the snapshot is still printed, and odd input exits 0', () => {
    const h = setup();
    writeSnapshot({ dir: h.snaps, transcript: t(B, S, A, B, S), trigger: 'auto', git: '' });
    const r = h.run({ hook_event_name: 'SessionStart', source: 'compact', transcript_path: join(h.project, 'nope.jsonl') });
    assert.equal(r.code, 0);
    const text = h.context(r);
    assert.match(text, /^\[compact-snapshot\] The conversation was just compacted/);
    assert.doesNotMatch(text, /This is compaction/);
    const none = h.run({ hook_event_name: 'SessionStart', source: 'compact', transcript_path: 42 });
    assert.equal(none.code, 0);
    for (const input of ['x', '{}', 'null', '[]']) assert.equal(runNode(SNAP, { input, env: { PAU_SKILLS_HOME: tempDir(), CLAUDE_PROJECT_DIR: h.project, PAU_SKILLS_DISABLE: '' } }).code, 0);
  });
});
