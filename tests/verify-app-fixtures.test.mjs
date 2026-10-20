// The fixture apps the verify-app skill is tried on.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { once } from 'node:events';
import { repo, runNode, tempDir } from './helpers.mjs';

// ---------------------------------------------------------------------------------------------------------------
// The fixture apps the skill is tried on: they must keep working, or the dry run cannot be repeated
// ---------------------------------------------------------------------------------------------------------------

const FIX = repo('tests', 'fixtures', 'verify-app');

describe('fixture apps', () => {
  test('the HTTP server starts on a free port, reports its data folder, stores a bookmark and stops on SIGTERM', async () => {
    const data = tempDir('verify-app-data-');
    const child = spawn(process.execPath, [join(FIX, 'http-server', 'server.mjs')], { env: { ...process.env, PORT: '0', DATA_DIR: data }, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      let out = '';
      const url = await new Promise((resolveUrl, reject) => {
        const t = setTimeout(() => reject(new Error(`no ready line: ${out}`)), 5000);
        child.stdout.on('data', (d) => {
          out += d;
          const m = /ready on (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
          if (m) { clearTimeout(t); resolveUrl(m[1]); }
        });
      });
      const health = await (await fetch(`${url}/health`)).json();
      assert.equal(health.app, 'bookmarks');
      assert.equal(health.dataDir, data);
      assert.equal(health.pid, child.pid);
      const created = await fetch(`${url}/bookmarks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/a', title: '  A  ' }) });
      assert.equal(created.status, 201);
      assert.equal((await created.json()).title, 'A');
      const dup = await fetch(`${url}/bookmarks`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ url: 'https://example.com/a', title: 'B' }) });
      assert.equal(dup.status, 409);
      const list = await (await fetch(`${url}/bookmarks`)).json();
      assert.equal(list.length, 1);
      assert.ok(existsSync(join(data, 'bookmarks.json')));
    } finally {
      child.kill('SIGTERM');
    }
    const [code] = await once(child, 'exit');
    assert.equal(code, 0);
  });

  // The web-skeleton fixture's seeded gap, written here and not in the fixture folder, so a cold run that reads the
  // fixture finds the gap by measuring it: a skeleton row (.skeleton-row) is 36 px tall and a real row (.person)
  // 56 px, so each of the three skeleton rows is 20 px short and the section below the list (#below) moves 60 px when
  // the data arrives. Keep the gap in the fixture: a dry run fixes it in a copy and measures again.
  test('the skeleton page starts, serves a skeleton 20 px too short, and its API delays, empties and fails on request', async () => {
    const child = spawn(process.execPath, [join(FIX, 'web-skeleton', 'server.mjs')], { env: { ...process.env, PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
    try {
      let out = '';
      const url = await new Promise((resolveUrl, reject) => {
        const t = setTimeout(() => reject(new Error(`no ready line: ${out}`)), 5000);
        child.stdout.on('data', (d) => {
          out += d;
          const m = /ready on (http:\/\/127\.0\.0\.1:\d+)/.exec(out);
          if (m) { clearTimeout(t); resolveUrl(m[1]); }
        });
      });
      const page = await (await fetch(`${url}/`)).text();
      assert.match(page, /data-skeleton-for="person-row"/, 'the skeleton rows carry the marker');
      assert.match(page, /data-skeleton-name/, 'the page marks its real rows');
      assert.match(page, /id="below"/, 'content below the list, so a shift can be measured');
      const px = (cls) => Number(new RegExp(`\\.${cls}\\s*\\{[^}]*\\bheight:\\s*(\\d+)px`).exec(page)?.[1]);
      assert.equal(px('person') - px('skeleton-row'), 20, 'the seeded gap: a skeleton row is 20 px shorter than a real row');
      const people = await (await fetch(`${url}/api/people`)).json();
      assert.equal(people.length, 3);
      const t0 = Date.now();
      const slow = await fetch(`${url}/api/people?delay=400`);
      assert.equal(slow.status, 200);
      assert.ok(Date.now() - t0 >= 380, `the delay switch held the answer for ${Date.now() - t0} ms`);
      assert.deepEqual(await (await fetch(`${url}/api/people?data=empty`)).json(), []);
      const failed = await fetch(`${url}/api/people?fail=1`);
      assert.equal(failed.status, 500);
      assert.ok((await failed.json()).error);
    } finally {
      child.kill('SIGTERM');
    }
    const [code] = await once(child, 'exit');
    assert.equal(code, 0);
  });

  test('the CLI adds, lists and completes items in the file it is given', () => {
    const file = join(tempDir('verify-app-cli-'), 'todo.json');
    const cli = join(FIX, 'cli', 'todo.mjs');
    const env = { TODO_FILE: file };
    assert.equal(runNode(cli, { args: ['add', 'buy', 'milk'], env }).code, 0);
    const list = runNode(cli, { args: ['list', '--json'], env });
    assert.equal(list.code, 0);
    const items = JSON.parse(list.stdout);
    assert.deepEqual(items.map((i) => [i.text, i.done]), [['buy milk', false]]);
    assert.equal(runNode(cli, { args: ['done', String(items[0].id)], env }).code, 0);
    assert.equal(JSON.parse(runNode(cli, { args: ['list', '--json'], env }).stdout)[0].done, true);
    assert.equal(runNode(cli, { args: ['done', '99'], env }).code, 1);
    assert.equal(runNode(cli, { args: ['frobnicate'], env }).code, 2);
  });
});
