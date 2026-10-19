// measure-boxes.js: measure a loading skeleton against the loaded screen, inside the page. Browser JavaScript: the
// same text runs from every harness (Playwright in any language, Cypress, WebdriverIO, a browser tool's evaluate).
//
// 1. Put this file's text in the page once, before or right after it opens (an init script, or an evaluate of the
//    text). It defines window.__verifyBoxes and starts a layout-shift observer that also reads the shifts recorded
//    before it started (buffered).
// 2. While the screen is held in its loading state: window.__verifyBoxes.skeleton(options) records the skeleton's
//    boxes and returns them.
// 3. Once the real content shows: window.__verifyBoxes.compare(options) returns a Promise of the report:
//      { pass, mismatches, problems, viewport, pairs, unpaired, counts, layoutShift, text }
//    `text` is the report as lines to keep as evidence; the rest is the same report for a script to check.
//
// options, the same object for both calls, every field optional:
//   skeleton      selector of skeleton boxes            default '[data-skeleton-for]'
//   skeletonName  attribute naming a skeleton box       default 'data-skeleton-for'
//   real          selector of real boxes                default '[data-skeleton-name]'
//   realName      attribute naming a real box           default 'data-skeleton-name'
//   container     a selector: pair by document order inside it instead of by name. Without `skeleton` or `real`,
//                 the boxes are its children in each state.
//   tolerance     pixels a box may be off in x, y, width or height     default 4
//   maxShift      the highest layout-shift score that passes            default 0.1
//
// Pairing: by name, the nth skeleton box called "row" with the nth real box called "row"; with `container`, the nth
// box inside it in each state. Elements that are not rendered (hidden, display: none, a template) are skipped. A box
// left without a partner is reported, and a name with more real boxes than skeleton boxes (or fewer) is reported as a
// count difference: hold the request with as many items as the skeleton has rows to compare sizes. Boxes are in page
// coordinates (scroll included) and CSS pixels, rounded to 0.1.
//
// The report fails, whatever the boxes say, when nothing matched (check the markers or the selector) or when
// compare() runs without skeleton() before it.
//
// The layout-shift score is the sum of the page's layout-shift entries without recent input (a shift within 500 ms of
// a click or a key press does not count, so load the screen by URL, not by a click). Only Chromium reports these
// entries; on other engines the score is skipped and the report says so. Zero entries is a score of 0, a pass.
(() => {
  if (window.__verifyBoxes) return;
  const types = (typeof PerformanceObserver !== 'undefined' && PerformanceObserver.supportedEntryTypes) || [];
  const supported = types.includes('layout-shift');
  const shifts = [];
  let observer = null;
  if (supported) {
    observer = new PerformanceObserver((list) => { shifts.push(...list.getEntries()); });
    observer.observe({ type: 'layout-shift', buffered: true });
  }
  const DEFAULTS = {
    skeleton: '[data-skeleton-for]', skeletonName: 'data-skeleton-for',
    real: '[data-skeleton-name]', realName: 'data-skeleton-name',
    container: null, tolerance: 4, maxShift: 0.1,
  };
  const r1 = (n) => Math.round(n * 10) / 10;
  const box = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r1(r.left + window.scrollX), y: r1(r.top + window.scrollY), width: r1(r.width), height: r1(r.height) };
  };
  const fmt = (b) => `x ${b.x}, y ${b.y}, ${b.width} by ${b.height}`;
  const signed = (n) => (n > 0 ? `+${r1(n)}` : `${r1(n)}`);

  const rendered = (el) => el.getClientRects().length > 0;

  // [{ name, box }] in document order, rendered elements only; `name` pairs a skeleton box with a real one.
  function collect(o, side) {
    const sel = side === 'skeleton' ? o.skeleton : o.real;
    if (o.container) {
      const c = document.querySelector(o.container);
      if (!c) return [];
      const given = side === 'skeleton' ? o.skeletonGiven : o.realGiven;
      const els = given ? [...c.querySelectorAll(sel)] : [...c.children];
      return els.filter(rendered).map((el) => ({ name: o.container, box: box(el) }));
    }
    const attr = side === 'skeleton' ? o.skeletonName : o.realName;
    return [...document.querySelectorAll(sel)].filter(rendered).map((el) => ({ name: el.getAttribute(attr) || '(unnamed)', box: box(el) }));
  }

  function options(given = {}) {
    return { ...DEFAULTS, ...given, skeletonGiven: 'skeleton' in given, realGiven: 'real' in given };
  }

  // Wait for two frames, so the browser has painted the last change and queued its layout-shift entries.
  const frames = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(done, 0))));

  let recorded = null;
  window.__verifyBoxes = {
    skeleton(given) {
      const o = options(given);
      recorded = collect(o, 'skeleton');
      return recorded;
    },
    async compare(given) {
      const o = options(given);
      await frames();
      if (observer) shifts.push(...observer.takeRecords());
      const real = collect(o, 'real');
      const skel = recorded || [];
      const pairs = [];
      const unpaired = [];
      const counts = [];
      // Reasons the check could not run; each one fails the report.
      const problems = [];
      if (!recorded) problems.push('skeleton() was not called: record the skeleton while the screen is loading, then compare()');
      const byName = (list) => list.reduce((m, b) => m.set(b.name, [...(m.get(b.name) || []), b.box]), new Map());
      const s = byName(skel);
      const r = byName(real);
      for (const name of new Set([...s.keys(), ...r.keys()])) {
        const sb = s.get(name) || [];
        const rb = r.get(name) || [];
        if (!recorded) continue;
        if (sb.length !== rb.length) counts.push({ name, skeleton: sb.length, real: rb.length });
        for (let i = 0; i < Math.max(sb.length, rb.length); i++) {
          if (!sb[i] || !rb[i]) { unpaired.push({ side: sb[i] ? 'skeleton' : 'real', name, index: i, box: sb[i] || rb[i] }); continue; }
          const diff = { x: r1(rb[i].x - sb[i].x), y: r1(rb[i].y - sb[i].y), width: r1(rb[i].width - sb[i].width), height: r1(rb[i].height - sb[i].height) };
          const off = Object.keys(diff).filter((k) => Math.abs(diff[k]) > o.tolerance);
          pairs.push({ name, index: i, skeleton: sb[i], real: rb[i], diff, mismatch: off.length > 0, off });
        }
      }
      const counted = shifts.filter((e) => !e.hadRecentInput);
      const score = Math.round(counted.reduce((n, e) => n + e.value, 0) * 10000) / 10000;
      const layoutShift = supported
        ? { supported: true, score, entries: counted.length, mismatch: score > o.maxShift }
        : { supported: false, score: null, entries: 0, mismatch: false, note: 'this engine has no layout-shift entries (only Chromium does): score skipped, the box check stands alone' };
      if (recorded && pairs.length === 0 && unpaired.length === 0) problems.push('no boxes matched: check the markers or the selector');
      const boxMismatches = pairs.filter((p) => p.mismatch).length;
      const mismatches = boxMismatches + unpaired.length + (layoutShift.mismatch ? 1 : 0) + problems.length;
      const viewport = { width: window.innerWidth, height: window.innerHeight };
      const text = [
        `Skeleton check at ${viewport.width} by ${viewport.height}: ${pairs.length} pair(s), tolerance ${o.tolerance} px, layout-shift limit ${o.maxShift}`,
        ...pairs.map((p) => `${p.mismatch ? 'MISMATCH' : 'ok'} ${p.name} #${p.index + 1}: skeleton ${fmt(p.skeleton)}; real ${fmt(p.real)}${p.mismatch ? `; off by ${p.off.map((k) => `${k} ${signed(p.diff[k])} px`).join(', ')}` : ''}`),
        ...problems.map((p) => `FAILED ${p}`),
        ...unpaired.map((u) => `UNPAIRED ${u.side} box ${u.name} #${u.index + 1}: ${fmt(u.box)}`),
        ...counts.map((c) => `COUNT ${c.name}: ${c.skeleton} skeleton box(es), ${c.real} real: answer the held request with ${c.skeleton} items to compare sizes; a count difference is not a size mismatch`),
        layoutShift.supported
          ? `${layoutShift.mismatch ? 'MISMATCH' : 'ok'} layout-shift score ${layoutShift.score} from ${layoutShift.entries} entr${layoutShift.entries === 1 ? 'y' : 'ies'} (limit ${o.maxShift})`
          : `skipped layout-shift score: ${layoutShift.note}`,
        mismatches ? `Result: ${mismatches} mismatch(es)` : 'Result: the skeleton matches the loaded screen',
      ].join('\n');
      return { pass: mismatches === 0, mismatches, problems, viewport, pairs, unpaired, counts, layoutShift, text };
    },
  };
})();
