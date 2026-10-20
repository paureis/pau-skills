// The skill-eval setup command against real folders: what it makes, and every input it refuses.
import { SCRIPT, FIX, scratch, writePrompt, setup, plan } from './skill-eval.helpers.mjs';
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, readFileSync, mkdirSync, existsSync, readdirSync, symlinkSync, chmodSync } from 'node:fs';
import { join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { runNode } from './helpers.mjs';
import { findMetaWords } from '../skills/verification/skill-eval/skill-eval.mjs';

describe('setup', () => {
  test('makes N folders per variant, each with the task, exactly one variant of the skill and an empty HOME', () => {
    const { lab, root, code, stdout, stderr } = setup();
    assert.equal(code, 0, stderr);
    const p = plan(lab);
    assert.equal(p.skill, 'tidy-notes');
    assert.equal(p.runs.length, 4);
    assert.deepEqual(p.runs.map((r) => r.variant).sort(), ['alpha', 'alpha', 'bravo', 'bravo']);
    for (const r of p.runs) {
      assert.ok(r.dir.startsWith(root + sep), r.dir);
      assert.deepEqual(findMetaWords(r.dir), [], r.dir);
      assert.ok(!r.dir.includes(r.variant), 'the folder name does not give the variant away');
      assert.equal(readFileSync(join(r.dir, 'notes.txt'), 'utf8'), readFileSync(join(FIX, 'task', 'notes.txt'), 'utf8'));
      assert.deepEqual(readdirSync(join(r.dir, '.claude', 'skills')), ['tidy-notes']);
      const skill = readFileSync(join(r.dir, '.claude', 'skills', 'tidy-notes', 'SKILL.md'), 'utf8');
      const want = readFileSync(join(FIX, r.variant === 'alpha' ? 'variant-a' : 'variant-b', 'SKILL.md'), 'utf8');
      assert.equal(skill, want);
      assert.deepEqual(readdirSync(r.home), []);
      assert.ok(!r.home.startsWith(r.dir + sep), 'HOME is outside the project folder');
      const log = spawnSync('git', ['-C', r.dir, 'log', '--format=%an <%ae>|%s'], { encoding: 'utf8' }).stdout.trim();
      assert.equal(log.split('\n').length, 1);
      assert.deepEqual(findMetaWords(log), [], log);
    }
    const dirs = new Set(p.runs.map((r) => r.dir));
    assert.equal(dirs.size, 4);
    for (const r of p.runs) assert.match(r.id, /^[0-9a-f]{4}$/, 'a run id says nothing about its variant or its place');
    assert.equal(new Set(p.runs.map((r) => r.id)).size, 4);
    assert.ok(existsSync(join(lab, 'rubric.md')));
    assert.match(stdout, /4 runs \(2 variants x 2\) \+ 1 judge = 5/);
    for (const r of p.runs) assert.ok(!r.dir.startsWith(lab), 'no run inside the lab folder');
  });

  test('the runs are listed in a shuffled order, so neither the id nor the place gives the variant away', () => {
    const orders = new Set();
    for (const seed of ['1', '2', '3', '4', '5', '6']) {
      const s = setup({ extra: ['--seed', seed] });
      assert.equal(s.code, 0, s.stderr);
      orders.add(plan(s.lab).runs.map((r) => r.variant).join(','));
    }
    assert.ok(orders.size > 1, `always ${[...orders][0]}`);
  });

  test('refuses more than 26 runs, which the letters cannot label', () => {
    const r = setup({ n: '14' });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /26/);
    assert.ok(!existsSync(r.root));
  });

  test('refuses a link in the task or a variant: the copy would point back at the original', () => {
    const task = join(scratch(), 'shop');
    mkdirSync(task, { recursive: true });
    writeFileSync(join(task, 'notes.txt'), 'milk\n');
    symlinkSync('notes.txt', join(task, 'list.txt'));
    const r = setup({ task });
    assert.equal(r.code, 1);
    assert.match(r.stderr, /list\.txt.*link/);
    const variant = join(scratch(), 'tidy');
    mkdirSync(variant);
    writeFileSync(join(variant, 'SKILL.md'), readFileSync(join(FIX, 'variant-a', 'SKILL.md')));
    symlinkSync(join(FIX, 'variant-b', 'SKILL.md'), join(variant, 'OTHER.md'));
    const v = setup({ variants: [`alpha=${variant}`, `bravo=${join(FIX, 'variant-b')}`] });
    assert.equal(v.code, 1);
    assert.match(v.stderr, /OTHER\.md.*link/);
  });

  test('refuses a root that is not new and empty, and a task, variant or prompt under the root', () => {
    const base = scratch();
    const p = writePrompt(base, '/tidy-notes clean notes.txt');
    const common = ['--variant', `b=${join(FIX, 'variant-b')}`];
    const full = join(base, 'full');
    mkdirSync(full);
    writeFileSync(join(full, 'old.txt'), 'x');
    const r1 = runNode(SCRIPT, { args: ['setup', join(base, 'lab1'), '--root', full, '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, ...common, '--prompt', p] });
    assert.equal(r1.code, 1);
    assert.match(r1.stderr, /empty/);
    const root = join(base, 'root2');
    mkdirSync(join(root, 'v'), { recursive: true });
    writeFileSync(join(root, 'v', 'SKILL.md'), readFileSync(join(FIX, 'variant-a', 'SKILL.md')));
    const r2 = runNode(SCRIPT, { args: ['setup', join(base, 'lab2'), '--root', root, '--task', join(FIX, 'task'), '--variant', `a=${join(root, 'v')}`, ...common, '--prompt', p] });
    assert.equal(r2.code, 1);
    assert.match(r2.stderr, /variant a.*under the root/);
    const root3 = join(base, 'root3');
    mkdirSync(root3);
    const p3 = writePrompt(root3, '/tidy-notes clean notes.txt');
    const r3 = runNode(SCRIPT, { args: ['setup', join(base, 'lab3'), '--root', root3, '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, ...common, '--prompt', p3] });
    assert.equal(r3.code, 1);
    assert.match(r3.stderr, /prompt.*under the root/);
    const empty = join(base, 'root4');
    mkdirSync(empty);
    const r4 = runNode(SCRIPT, { args: ['setup', join(base, 'lab4'), '--root', empty, '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, ...common, '--prompt', p] });
    assert.equal(r4.code, 0, r4.stderr);
  });

  test('a task folder named home gets a HOME that does not collide with it', () => {
    const task = join(scratch(), 'home');
    mkdirSync(task);
    writeFileSync(join(task, 'notes.txt'), 'milk\n');
    const r = setup({ task });
    assert.equal(r.code, 0, r.stderr);
    for (const run of plan(r.lab).runs) {
      assert.notEqual(run.home, run.dir);
      assert.ok(existsSync(join(run.dir, 'notes.txt')));
      assert.deepEqual(readdirSync(run.home), []);
    }
  });

  test('a failure while writing removes everything setup made, and keeps your own files in the lab', { skip: process.platform === 'win32' }, () => {
    const realGit = spawnSync('sh', ['-c', 'command -v git'], { encoding: 'utf8' }).stdout.trim();
    const bin = join(scratch(), 'bin');
    mkdirSync(bin);
    writeFileSync(join(bin, 'git'), `#!/bin/sh\nfor a in "$@"; do [ "$a" = commit ] && exit 1; done\nexec "${realGit}" "$@"\n`);
    chmodSync(join(bin, 'git'), 0o755);
    const base = scratch();
    const lab = join(base, 'lab');
    mkdirSync(lab);
    const p = writePrompt(lab, '/tidy-notes clean notes.txt');
    // An existing empty root is kept, so only the removal of each run folder can leave it empty.
    const root = join(base, 'work');
    mkdirSync(root);
    const r = runNode(SCRIPT, { args: ['setup', lab, '--root', root, '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p], env: { PATH: `${bin}:${process.env.PATH}` } });
    assert.equal(r.code, 1, r.stdout);
    assert.deepEqual(readdirSync(root), [], 'no run folder left');
    assert.deepEqual(readdirSync(lab), ['prompt.txt']);
  });

  test('--grade-reply is recorded in the plan', () => {
    const r = setup({ extra: ['--grade-reply'] });
    assert.equal(r.code, 0, r.stderr);
    assert.equal(plan(r.lab).gradeReply, true);
    assert.equal(plan(setup().lab).gradeReply, false);
  });

  test('a variant of none gets no skill folder', () => {
    const base = scratch();
    const a = writePrompt(base, 'my shopping list in notes.txt is a mess, please clean it up', 'plain.txt');
    const b = writePrompt(base, '/tidy-notes my shopping list in notes.txt is a mess, please clean it up', 'typed.txt');
    const r = runNode(SCRIPT, { args: ['setup', join(base, 'lab'), '--root', join(base, 'work'), '--task', join(FIX, 'task'), '--variant', 'without=none', '--variant', `with=${join(FIX, 'variant-b')}`, '--prompt', `without=${a}`, '--prompt', `with=${b}`, '--n', '1'] });
    assert.equal(r.code, 0, r.stderr);
    const p = plan(join(base, 'lab'));
    const none = p.runs.find((x) => x.variant === 'without');
    assert.ok(!existsSync(join(none.dir, '.claude', 'skills')));
    assert.match(p.prompts.without, /^my shopping/);
    assert.match(p.prompts.with, /^\/tidy-notes/);
  });

  for (const [why, opts, pattern] of [
    ['a meta word in the prompt', { prompt: 'please judge how well you clean notes.txt' }, /prompt.*judge/],
    ['a typed prompt for a variant that has no skill', { variants: ['without=none', `with=${join(FIX, 'variant-b')}`] }, /without.*\/tidy-notes/],
    ['variants with different skill names', { variants: [`alpha=${join(FIX, 'variant-a')}`, `bravo=${join(FIX, 'other-name')}`] }, /same name/],
    ['fewer than two variants', { variants: [`alpha=${join(FIX, 'variant-a')}`] }, /two variants/],
  ]) {
    test(`refuses ${why}, and writes nothing`, () => {
      const r = setup(opts);
      assert.equal(r.code, 1, r.stdout + r.stderr);
      assert.match(r.stderr, pattern);
      assert.ok(!existsSync(r.lab), 'no lab folder');
      assert.ok(!existsSync(r.root), 'no run folders');
    });
  }

  test('refuses a meta word anywhere in the working directory path', () => {
    const base = scratch();
    const p = writePrompt(base, '/tidy-notes clean notes.txt');
    for (const root of [join(base, 'my-tests', 'work'), join(base, 'skill-eval')]) {
      const r = runNode(SCRIPT, { args: ['setup', join(base, 'lab'), '--root', root, '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p, '--allow-word', 'test'] });
      assert.equal(r.code, 1, root);
      assert.match(r.stderr, /path/);
      assert.ok(!existsSync(join(base, 'lab')));
    }
    const slug = runNode(SCRIPT, { args: ['setup', join(base, 'lab'), '--root', join(base, 'work'), '--task', join(FIX, 'task'), '--slug', 'arena-shop', '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p] });
    assert.equal(slug.code, 1);
    assert.match(slug.stderr, /arena/);
  });

  test('refuses a meta word in a file or folder name of the task, unless the word is allowed', () => {
    const task = join(scratch(), 'shop');
    mkdirSync(join(task, 'tests'), { recursive: true });
    writeFileSync(join(task, 'notes.txt'), 'milk\n');
    writeFileSync(join(task, 'tests', 'notes_check.py'), 'print(1)\n');
    const refused = setup({ task });
    assert.equal(refused.code, 1);
    assert.match(refused.stderr, /tests/);
    const allowed = setup({ task, extra: ['--allow-word', 'test'] });
    assert.equal(allowed.code, 0, allowed.stderr);
  });

  test('a working folder path that a run could mistype only warns', () => {
    const base = scratch();
    const p = writePrompt(base, '/tidy-notes clean notes.txt');
    const r = runNode(SCRIPT, { args: ['setup', join(base, 'lab'), '--root', join(base, '-home-sam-shop', 'work'), '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p] });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /warning:.*mistype/);
    const plain = runNode(SCRIPT, { args: ['setup', join(base, 'lab2'), '--root', join(base, 'work'), '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p] });
    assert.doesNotMatch(plain.stderr, /mistype/);
  });

  test('a meta word inside a file only warns', () => {
    const task = join(scratch(), 'shop');
    mkdirSync(task, { recursive: true });
    writeFileSync(join(task, 'notes.txt'), 'milk\nwrite a benchmark later\n');
    const r = setup({ task });
    assert.equal(r.code, 0, r.stderr);
    assert.match(r.stderr, /warning.*notes\.txt:2.*benchmark/);
  });

  test('refuses a lab folder inside the root, a root inside the lab, and a lab that already has a plan', () => {
    const base = scratch();
    const p = writePrompt(base, '/tidy-notes clean notes.txt');
    const common = ['--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p];
    const r1 = runNode(SCRIPT, { args: ['setup', join(base, 'work', 'lab'), '--root', join(base, 'work'), ...common] });
    assert.equal(r1.code, 1);
    const r2 = runNode(SCRIPT, { args: ['setup', join(base, 'lab'), '--root', join(base, 'lab', 'work'), ...common] });
    assert.equal(r2.code, 1);
    mkdirSync(join(base, 'full'));
    writeFileSync(join(base, 'full', 'plan.json'), '{}');
    const r3 = runNode(SCRIPT, { args: ['setup', join(base, 'full'), '--root', join(base, 'work2'), ...common] });
    assert.equal(r3.code, 1);
    assert.deepEqual(readdirSync(join(base, 'full')), ['plan.json']);
  });

  test('accepts a lab folder that holds only your own notes, such as the prompt file', () => {
    const base = scratch();
    mkdirSync(join(base, 'lab'));
    const p = writePrompt(join(base, 'lab'), '/tidy-notes clean notes.txt');
    const r = runNode(SCRIPT, { args: ['setup', join(base, 'lab'), '--root', join(base, 'work'), '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p] });
    assert.equal(r.code, 0, r.stderr);
  });

  for (const marker of ['CLAUDE.md', 'AGENTS.md', 'CLAUDE.local.md', '.claude']) {
    test(`refuses a root with ${marker} in a parent folder, which every run would load`, () => {
      const base = scratch();
      const parent = join(base, 'shop');
      mkdirSync(parent);
      if (marker === '.claude') mkdirSync(join(parent, '.claude', 'skills'), { recursive: true });
      else writeFileSync(join(parent, marker), '# notes\n');
      const p = writePrompt(base, '/tidy-notes clean notes.txt');
      const r = runNode(SCRIPT, { args: ['setup', join(base, 'lab'), '--root', join(parent, 'work', 'here'), '--task', join(FIX, 'task'), '--variant', `a=${join(FIX, 'variant-a')}`, '--variant', `b=${join(FIX, 'variant-b')}`, '--prompt', p] });
      assert.equal(r.code, 1, r.stdout);
      assert.match(r.stderr, new RegExp(marker.replace('.', '\\.')));
      assert.ok(!existsSync(join(base, 'lab')));
    });
  }
});
