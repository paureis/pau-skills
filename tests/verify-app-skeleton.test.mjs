// The verify-app in-page skeleton helper (templates/measure-boxes.js), run in a stub page.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import vm from 'node:vm';
import { SKILL_DIR } from './verify-app.helpers.mjs';

// ---------------------------------------------------------------------------------------------------------------
// The in-page skeleton helper, run in a stub page: CI has no browser
// ---------------------------------------------------------------------------------------------------------------

const HELPER = readFileSync(join(SKILL_DIR, 'templates', 'measure-boxes.js'), 'utf8');

/**
 * A stub page: elements by selector, swapped between the loading and the loaded state; shifts for the observer.
 * An element is [name, left, top, width, height] in viewport coordinates, or with 'hidden' after them for one that is
 * not rendered (hidden, display: none, a template): it has no client rects and a zero box, as in a browser.
 */
function stubPage({ loading, loaded, shifts = [], types = ['layout-shift', 'paint'], scroll = [0, 0] }) {
  let state = loading;
  const el = (attr, name, b) => {
    const hidden = b[4] === 'hidden';
    const r = hidden ? { left: 0, top: 0, width: 0, height: 0 } : { left: b[0], top: b[1], width: b[2], height: b[3] };
    return { getAttribute: (a) => (a === attr ? name : null), getBoundingClientRect: () => r, getClientRects: () => (hidden ? [] : [r]) };
  };
  const all = (sel) => {
    const [attr, list] = state[sel] || [null, []];
    return list.map(([name, ...b]) => el(attr, name, b));
  };
  class PerformanceObserver {
    static supportedEntryTypes = types;
    constructor(cb) { this.cb = cb; }
    observe() {}
    takeRecords() { return shifts.splice(0); }
  }
  const window = { scrollX: scroll[0], scrollY: scroll[1], innerWidth: 390, innerHeight: 844 };
  const ctx = {
    window, PerformanceObserver, setTimeout, requestAnimationFrame: (f) => setTimeout(f, 0),
    document: {
      querySelectorAll: all,
      querySelector: (sel) => (state[sel] ? { children: all(sel), querySelectorAll: all } : null),
    },
  };
  vm.runInNewContext(HELPER, ctx);
  return { api: window.__verifyBoxes, load: () => { state = loaded; } };
}

/** The helper runs in another realm: copy its results into this one before deepEqual. */
const plain = (x) => JSON.parse(JSON.stringify(x));

const ROWS = (h, gap = 8) => [0, 1, 2].map((i) => ['person-row', 16, 64 + i * (h + gap), 358, h]);

describe('the skeleton helper', () => {
  test('pairs boxes by marker and reports each one off by more than 4 px, with its numbers', async () => {
    const { api, load } = stubPage({
      loading: { '[data-skeleton-for]': ['data-skeleton-for', ROWS(36)] },
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', ROWS(56)] },
      shifts: [{ value: 0.0418, hadRecentInput: false }],
    });
    assert.equal(api.skeleton().length, 3);
    load();
    const r = plain(await api.compare());
    assert.equal(r.pass, false);
    assert.equal(r.mismatches, 3);
    assert.deepEqual(r.pairs.map((p) => p.diff), [{ x: 0, y: 0, width: 0, height: 20 }, { x: 0, y: 20, width: 0, height: 20 }, { x: 0, y: 40, width: 0, height: 20 }]);
    assert.match(r.text, /MISMATCH person-row #3: skeleton x 16, y 152, 358 by 36; real x 16, y 192, 358 by 56; off by y \+40 px, height \+20 px/);
    assert.deepEqual(r.layoutShift, { supported: true, score: 0.0418, entries: 1, mismatch: false });
  });

  test('a box off by exactly 4 px passes and one off by 4.5 px does not', async () => {
    for (const [h, pass] of [[60, true], [60.5, false]]) {
      const { api, load } = stubPage({
        loading: { '[data-skeleton-for]': ['data-skeleton-for', [['card', 0, 0, 100, 56]]] },
        loaded: { '[data-skeleton-name]': ['data-skeleton-name', [['card', 0, 0, 100, h]]] },
      });
      api.skeleton();
      load();
      assert.equal((await api.compare()).pass, pass, `height ${h}`);
    }
  });

  test('a matching skeleton with no layout-shift entries passes', async () => {
    const { api, load } = stubPage({
      loading: { '[data-skeleton-for]': ['data-skeleton-for', ROWS(56)] },
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', ROWS(56)] },
    });
    api.skeleton();
    load();
    const r = plain(await api.compare());
    assert.equal(r.pass, true, r.text);
    assert.equal(r.layoutShift.score, 0);
    assert.match(r.text, /matches the loaded screen/);
  });

  test('a layout-shift score above 0.1 is a mismatch, and shifts after input do not count', async () => {
    const { api, load } = stubPage({
      loading: { '[data-skeleton-for]': ['data-skeleton-for', ROWS(56)] },
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', ROWS(56)] },
      shifts: [{ value: 0.08, hadRecentInput: false }, { value: 0.05, hadRecentInput: false }, { value: 0.5, hadRecentInput: true }],
    });
    api.skeleton();
    load();
    const r = plain(await api.compare());
    assert.equal(r.layoutShift.score, 0.13);
    assert.equal(r.layoutShift.entries, 2);
    assert.equal(r.pass, false);
    assert.match(r.text, /MISMATCH layout-shift score 0\.13/);
  });

  test('a box left without a partner is reported', async () => {
    const { api, load } = stubPage({
      loading: { '[data-skeleton-for]': ['data-skeleton-for', [...ROWS(56), ['avatar', 0, 0, 40, 40]]] },
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', ROWS(56).slice(0, 2)] },
    });
    api.skeleton();
    load();
    const r = plain(await api.compare());
    assert.equal(r.pass, false);
    assert.deepEqual(r.unpaired.map((u) => [u.side, u.name, u.index]).sort(), [['skeleton', 'avatar', 0], ['skeleton', 'person-row', 2]]);
    assert.match(r.text, /UNPAIRED skeleton box avatar #1/);
  });

  test('without markers, boxes pair by document order inside the container', async () => {
    const { api, load } = stubPage({
      loading: { '#people': [null, ROWS(36)] },
      loaded: { '#people': [null, ROWS(56)] },
    });
    api.skeleton({ container: '#people' });
    load();
    const r = plain(await api.compare({ container: '#people' }));
    assert.equal(r.pairs.length, 3);
    assert.equal(r.mismatches, 3);
  });

  test('no box matching the markers or the selector fails, and says to check them', async () => {
    const { api, load } = stubPage({ loading: {}, loaded: {} });
    assert.equal(api.skeleton().length, 0);
    load();
    const r = plain(await api.compare());
    assert.equal(r.pass, false, r.text);
    assert.match(r.text, /no boxes matched: check the markers or the selector/);
    assert.doesNotMatch(r.text, /matches the loaded screen/);
  });

  test('compare() before skeleton() fails with that reason, not with every real box unpaired', async () => {
    const { api, load } = stubPage({
      loading: {},
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', ROWS(56)] },
    });
    load();
    const r = plain(await api.compare());
    assert.equal(r.pass, false);
    assert.match(r.text, /skeleton\(\) was not called/);
    assert.deepEqual(r.unpaired, []);
    assert.doesNotMatch(r.text, /UNPAIRED/);
  });

  test('in container mode, children that are not rendered are skipped, not measured as empty boxes', async () => {
    const { api, load } = stubPage({
      loading: { '#people': [null, [...ROWS(56), ['tpl', 0, 0, 0, 0, 'hidden']]] },
      loaded: { '#people': [null, [['tpl', 0, 0, 0, 0, 'hidden'], ...ROWS(56)]] },
    });
    assert.equal(api.skeleton({ container: '#people' }).length, 3);
    load();
    const r = plain(await api.compare({ container: '#people' }));
    assert.equal(r.pairs.length, 3);
    assert.deepEqual(r.unpaired, []);
    assert.equal(r.pass, true, r.text);
  });

  test('a skeleton with fewer rows than the list says the counts differ, which resizing cannot fix', async () => {
    const five = [0, 1, 2, 3, 4].map((i) => ['person-row', 16, 64 + i * 64, 358, 56]);
    const { api, load } = stubPage({
      loading: { '[data-skeleton-for]': ['data-skeleton-for', ROWS(56)] },
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', five] },
    });
    api.skeleton();
    load();
    const r = plain(await api.compare());
    assert.equal(r.pass, false);
    assert.equal(r.unpaired.length, 2);
    assert.match(r.text, /COUNT person-row: 3 skeleton box\(es\), 5 real: answer the held request with 3 items/);
  });

  test('boxes are in page coordinates: the scroll offset is added', async () => {
    const { api, load } = stubPage({
      loading: { '[data-skeleton-for]': ['data-skeleton-for', ROWS(56)] },
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', ROWS(56)] },
      scroll: [10, 300],
    });
    assert.deepEqual(plain(api.skeleton())[0].box, { x: 26, y: 364, width: 358, height: 56 });
    load();
    const r = plain(await api.compare());
    assert.deepEqual(r.pairs[2].real, { x: 26, y: 492, width: 358, height: 56 });
  });

  test('an engine without layout-shift entries skips the score and says so', async () => {
    const { api, load } = stubPage({
      loading: { '[data-skeleton-for]': ['data-skeleton-for', ROWS(56)] },
      loaded: { '[data-skeleton-name]': ['data-skeleton-name', ROWS(56)] },
      shifts: [{ value: 0.5, hadRecentInput: false }],
      types: ['paint'],
    });
    api.skeleton();
    load();
    const r = plain(await api.compare());
    assert.equal(r.layoutShift.supported, false);
    assert.equal(r.layoutShift.score, null);
    assert.equal(r.pass, true);
    assert.match(r.text, /skipped layout-shift score: .*only Chromium/);
  });
});
