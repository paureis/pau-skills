// The Send to Claude addition to html-plan (Q15): scripts/html-plan/send-to-claude.js, run in a `vm` context with stub
// window, document, MutationObserver and claude objects. Values made inside the context are compared as JSON copies,
// because assert/strict deepEqual also compares prototypes, which differ between contexts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { repo } from './helpers.mjs';

const source = () => readFileSync(repo('scripts', 'html-plan', 'send-to-claude.js'), 'utf8');
const plain = (v) => JSON.parse(JSON.stringify(v));
const settle = async () => { for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r)); };
const WRITE_VERBS = ['sendToClaude', 'create', 'reply', 'openComposer', 'resolve', 'delete', 'customAnchors', 'onSendToClaude', 'compose'];

// A small DOM: elements with classes, text, children, click listeners, and childList records for observers.
class El {
  constructor(doc, tag, cls = '', text = '') {
    Object.assign(this, { doc, tagName: tag.toUpperCase(), nodeType: 1, className: cls, ownText: text, children: [], parentNode: null, disabled: false, title: '', clicks: [] });
  }
  get classList() { return { contains: (c) => this.className.split(/\s+/).includes(c) }; }
  get textContent() { return this.ownText + this.children.map((c) => c.textContent).join(''); }
  set textContent(v) { this.ownText = String(v); this.children = []; }
  get isConnected() { let n = this; while (n.parentNode) n = n.parentNode; return n === this.doc.root; }
  append(...kids) {
    for (const k of kids) { k.parentNode = this; this.children.push(k); }
    for (const o of this.doc.observers) if (o.target === this) queueMicrotask(() => o.cb([{ type: 'childList', target: this, addedNodes: kids, removedNodes: [] }], o));
  }
  after(node) { const sib = this.parentNode.children; sib.splice(sib.indexOf(this) + 1, 0, node); node.parentNode = this.parentNode; }
  remove() { const p = this.parentNode; p.children.splice(p.children.indexOf(this), 1); this.parentNode = null; }
  matches(sel) { const [tag, ...cls] = sel.split('.'); return (!tag || this.tagName === tag.toUpperCase()) && cls.every((c) => this.classList.contains(c)); }
  querySelectorAll(sel) { const out = []; const walk = (n) => { for (const c of n.children) { if (c.matches(sel)) out.push(c); walk(c); } }; walk(this); return out; }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
  addEventListener(type, fn) { if (type === 'click') this.clicks.push(fn); }
  click() { if (!this.disabled) for (const fn of this.clicks) fn({ type: 'click', target: this }); }
}

function makeDoc({ h1 = true, body = true } = {}) {
  const doc = { observers: [], made: [], events: new Map(), readyState: body ? 'complete' : 'loading', body: null };
  doc.root = new El(doc, 'html');
  doc.documentElement = doc.root;
  doc.createElement = (tag) => new El(doc, tag);
  doc.querySelector = (sel) => doc.root.querySelector(sel);
  doc.addEventListener = (type, fn) => { doc.events.set(type, [...(doc.events.get(type) || []), fn]); };
  doc.ready = () => {
    const b = new El(doc, 'body');
    const main = new El(doc, 'main');
    if (h1) main.append(new El(doc, 'h1', '', 'The plan'));
    b.append(main);
    doc.root.append(b);
    doc.body = b;
    doc.readyState = 'interactive';
    for (const fn of doc.events.get('DOMContentLoaded') || []) fn({ type: 'DOMContentLoaded' });
  };
  if (body) doc.ready();
  doc.MutationObserver = class {
    constructor(cb) { this.cb = cb; doc.made.push(this); }
    observe(target, opts) {
      if (!target || typeof target !== 'object') throw new TypeError('observe: the target is not a Node');
      Object.assign(this, { target, opts });
      doc.observers.push(this);
    }
  };
  return doc;
}

// The Respond sheet as upstream's openResponse() builds it, appended to body.
function openSheet(doc, md = 'My answer\n') {
  const el = (tag, cls, text, ...kids) => { const e = new El(doc, tag, cls, text); e.append(...kids); return e; };
  const pre = el('pre', '', md);
  const state = el('span', 'nw-send-state');
  const copy = el('button', 'nw-btn primary', 'Copy response');
  const footer = el('footer', '', '', el('button', 'nw-btn danger', 'Reset'), state, el('span', 'sp'), copy);
  const bg = el('div', 'nw-sheet-bg', '', el('div', 'nw-sheet', '', el('header', '', '', el('h3', '', 'Your response'), el('button', 'nw-btn', 'Close')),
    el('div', 'body', '', el('p', 'hint', 'Copy this and paste it to Claude.'), pre), footer));
  doc.body.append(bg);
  const button = () => footer.children.find((b) => b.textContent === 'Send to Claude') || null;
  return { bg, pre, state, copy, footer, button };
}

// A stub comments namespace that records every call; each method can be replaced.
function stubComments(over = {}) {
  const calls = [];
  const ns = { canSendToClaude: async () => 'available', anchorFor: async (el) => ({ path: 'a', x: 1, y: 2, tag: el?.tagName }), sendToClaude: async () => ({ threadId: 't', commentId: 'c' }), ...over };
  const comments = Object.fromEntries(Object.entries(ns).map(([k, fn]) => [k, (...args) => { calls.push([k, ...args]); return fn(...args); }]));
  return { comments, calls, claude: { use: async (name) => { calls.push(['use', name]); return comments; } } };
}

function load({ win = true, claude, body = true, h1 = true } = {}) {
  const ctx = { TextEncoder, console };
  let doc = null;
  if (win) {
    doc = makeDoc({ body, h1 });
    Object.assign(ctx, { document: doc, MutationObserver: doc.MutationObserver });
    ctx.window = ctx;
    if (claude !== undefined) ctx.claude = claude;
  }
  vm.createContext(ctx);
  vm.runInContext(source(), ctx, { filename: 'send-to-claude.js' });
  return { ctx, doc, api: ctx.HtmlPlanSendToClaude };
}

test('S1 does nothing on a page that is not an artifact, and waits for body when there is none yet', async () => {
  for (const claude of [undefined, { sendConversationMessage() {} }, { use: 'not a function' }]) {
    const { doc, api } = load({ claude });
    assert.equal(typeof api.attach, 'function');
    const sheet = openSheet(doc);
    await settle();
    assert.equal(doc.made.length, 0, 'no observer');
    assert.equal(sheet.button(), null, 'no button');
    assert.equal(sheet.footer.children.length, 4, 'the footer is untouched');
  }
  const { api } = load({ claude: undefined });
  assert.equal(api.isArtifact({}), false);
  assert.equal(api.isArtifact({ claude: {} }), false, 'a flat window.claude has no use()');
  assert.equal(api.isArtifact({ claude: { use: async () => null } }), true);
  const bare = load({ win: false });
  assert.equal(typeof bare.api.sizeProblem, 'function', 'loads with no window or document');

  const { claude } = stubComments();
  const early = load({ claude, body: false });
  assert.equal(early.doc.observers.length, 0, 'nothing observed before body exists');
  early.doc.ready();
  assert.equal(early.doc.observers.length, 1, 'attached on DOMContentLoaded');
  assert.equal(early.doc.observers[0].target, early.doc.body);
  const sheet = openSheet(early.doc);
  await settle();
  assert.ok(sheet.button(), 'the button is offered once attached');
});

test('S2 offers the button only when canSendToClaude answers available, asked again on every open', async () => {
  const { api } = load({ claude: undefined });
  const win = (use) => ({ claude: { use } });
  const ok = stubComments();
  assert.equal(await api.offer(win(async () => ok.comments)), ok.comments);
  assert.equal(await api.offer(win(async () => null)), null, 'a null namespace');
  assert.equal(await api.offer(win(async () => { throw { code: 'unavailable' }; })), null, 'use() rejects');
  assert.equal(await api.offer(win(async () => ({ sendToClaude: async () => ({}) }))), null, 'no canSendToClaude');
  for (const answer of ['writers_only', 'no_session', 'off', 'maybe', undefined]) {
    const s = stubComments({ canSendToClaude: async () => answer });
    assert.equal(await api.offer(win(async () => s.comments)), null, `answer ${answer}`);
  }
  const bad = stubComments({ canSendToClaude: async () => { throw { code: 'capability_removed' }; } });
  assert.equal(await api.offer(win(async () => bad.comments)), null, 'a rejected check');

  let answer = 'available';
  const s = stubComments({ canSendToClaude: async () => answer });
  const { doc } = load({ claude: s.claude });
  const first = openSheet(doc);
  await settle();
  assert.ok(first.button(), 'offered on available');
  first.bg.remove();
  answer = 'writers_only';
  const second = openSheet(doc);
  await settle();
  assert.equal(second.button(), null, 'gone when the answer changes');
  assert.equal(s.calls.filter(([k]) => k === 'canSendToClaude').length, 2);
});

test('S3 the comment limit is 4096 bytes of UTF-8, not 4096 characters', async () => {
  const { api } = load({ claude: undefined });
  const e = String.fromCharCode(0xe9);
  assert.equal(api.sizeProblem('a'.repeat(4096)), '');
  assert.match(api.sizeProblem('a'.repeat(4097)), /4097.*4096|4096.*4097/);
  assert.equal(api.sizeProblem(e.repeat(2048)), '');
  assert.notEqual(api.sizeProblem(e.repeat(2049)), '', '2049 characters, 4098 bytes');

  const s = stubComments();
  const { doc } = load({ claude: s.claude });
  const sheet = openSheet(doc, 'x'.repeat(5000));
  await settle();
  const b = sheet.button();
  assert.ok(b, 'shown, with the reason');
  assert.equal(b.disabled, true);
  assert.match(b.title, /5000/);
  assert.equal(sheet.state.textContent, b.title);
  b.disabled = false;
  b.click();
  await settle();
  assert.equal(s.calls.filter(([k]) => k === 'sendToClaude').length, 0, 'an oversize response is never sent');
});

test('S4 sends the exact text at the anchor of the h1, or of main when there is no h1', async () => {
  for (const h1 of [true, false]) {
    const s = stubComments();
    const { doc, api } = load({ claude: s.claude, h1 });
    const want = doc.querySelector(h1 ? 'h1' : 'main');
    assert.equal(api.target(doc), want);
    const md = '## Answers\n\n  kept as typed  \n';
    const sheet = openSheet(doc, md);
    await settle();
    sheet.button().click();
    await settle();
    const anchors = s.calls.filter(([k]) => k === 'anchorFor');
    const sends = s.calls.filter(([k]) => k === 'sendToClaude');
    assert.equal(anchors.length, 1);
    assert.equal(anchors[0][1], want, `anchorFor gets the ${h1 ? 'h1' : 'main'}`);
    assert.equal(sends.length, 1);
    assert.deepEqual(plain(sends[0][1]), { anchor: { path: 'a', x: 1, y: 2, tag: want.tagName }, text: md });
    assert.equal(sends[0][1].text, sheet.pre.textContent);
  }
  const { api } = load({ claude: undefined });
  const ok = stubComments();
  assert.deepEqual(plain(await api.send(ok.comments, { tagName: 'H1' }, 'hi')), { ok: true });
  const bad = stubComments({ anchorFor: async () => { throw { code: 'invalid', message: 'no' }; } });
  assert.deepEqual(plain(await api.send(bad.comments, null, 'hi')), { ok: false, code: 'invalid' });
  assert.equal(bad.calls.filter(([k]) => k === 'sendToClaude').length, 0, 'no send without an anchor');
});

test('S5 every outcome of a press, with one send per press and no second button after a lasting refusal', async () => {
  const { api } = load({ claude: undefined });
  const after = (r, n = 0) => plain(api.after(r, n));
  const ok = after({ ok: true });
  assert.equal(ok.enabled, false);
  assert.match(ok.message, /sent/i);
  assert.doesNotMatch(ok.message, /not sent/i);
  for (const code of ['consent_required', 'forbidden', 'claude_unavailable', 'invalid', 'transform_error', 'not_granted', 'capability_disabled', 'capability_removed']) {
    const r = after({ ok: false, code });
    assert.equal(r.enabled, false, code);
    assert.match(r.message, /not sent/i, code);
    assert.match(r.message, /copy/i, code);
  }
  assert.match(after({ ok: false, code: 'forbidden' }).message, /commenting from this page is off/i);
  const slow = after({ ok: false, code: 'rate_limited' });
  assert.equal(slow.enabled, true);
  assert.match(slow.message, /wait/i);
  for (const code of ['unavailable', 'upstream_error', 'not_found', 'something_new']) {
    assert.equal(after({ ok: false, code }, 0).enabled, true, `${code}, first failure`);
    assert.match(after({ ok: false, code }, 0).message, /press again/i);
    assert.equal(after({ ok: false, code }, 1).enabled, false, `${code}, second failure`);
  }
  for (const r of [ok, slow, after({ ok: false, code: 'unavailable' }, 1)]) assert.doesNotMatch(r.message, /[–—]/);

  // Transient failures: one send per press, enabled after the first, disabled after the second, then not offered again.
  const flaky = stubComments({ sendToClaude: async () => { throw { code: 'unavailable' }; } });
  const page = load({ claude: flaky.claude });
  let sheet = openSheet(page.doc);
  await settle();
  sheet.button().click();
  await settle();
  assert.equal(flaky.calls.filter(([k]) => k === 'sendToClaude').length, 1, 'never retried by itself');
  assert.equal(sheet.button().disabled, false);
  assert.match(sheet.state.textContent, /not sent/i);
  sheet.bg.remove();
  sheet = openSheet(page.doc);
  await settle();
  sheet.button().click();
  await settle();
  assert.equal(flaky.calls.filter(([k]) => k === 'sendToClaude').length, 2);
  assert.equal(sheet.button().disabled, true, 'disabled after the second failure in this page load');
  sheet.bg.remove();
  sheet = openSheet(page.doc);
  await settle();
  assert.equal(sheet.button(), null, 'not offered again until the page reloads');

  // Two presses before the first send settles make one send.
  let release;
  const held = stubComments({ sendToClaude: () => new Promise((r) => { release = r; }) });
  const busy = load({ claude: held.claude });
  sheet = openSheet(busy.doc);
  await settle();
  sheet.button().click();
  sheet.button().click();
  await settle();
  assert.equal(held.calls.filter(([k]) => k === 'sendToClaude').length, 1, 'one send for a double press');
  assert.match(sheet.state.textContent, /sending/i);
  release({});
  await settle();
  assert.match(sheet.state.textContent, /sent/i);
  assert.equal(sheet.button().disabled, true, 'disabled after a success');
  sheet.bg.remove();
  sheet = openSheet(busy.doc);
  await settle();
  assert.ok(sheet.button() && !sheet.button().disabled, 'offered again in a new opening after a success');

  // forbidden is lasting: the next opening has no button.
  const refused = stubComments({ sendToClaude: async () => { throw { code: 'forbidden' }; } });
  const off = load({ claude: refused.claude });
  sheet = openSheet(off.doc);
  await settle();
  sheet.button().click();
  await settle();
  assert.equal(sheet.button().disabled, true);
  assert.match(sheet.state.textContent, /commenting from this page is off/i);
  sheet.bg.remove();
  sheet = openSheet(off.doc);
  await settle();
  assert.equal(sheet.button(), null, 'no button after forbidden until the page reloads');
  assert.equal(sheet.copy.textContent, 'Copy response', 'copy stays');
});

test('S6 writes nothing at load or when the sheet opens', async () => {
  const calls = [];
  const comments = new Proxy({}, {
    get: (t, k) => (k === 'then' ? undefined : (...args) => { calls.push(String(k)); return Promise.resolve(k === 'canSendToClaude' ? 'available' : {}); }),
  });
  const claude = new Proxy({}, { get: (t, k) => (k === 'then' ? undefined : (...args) => { calls.push(String(k)); return Promise.resolve(k === 'use' ? comments : {}); }) });
  const { doc } = load({ claude });
  await settle();
  assert.deepEqual(calls.filter((k) => WRITE_VERBS.includes(k)), [], 'no write verb at load');
  const sheet = openSheet(doc);
  await settle();
  assert.ok(sheet.button(), 'control: the button is offered');
  assert.deepEqual(calls.filter((k) => WRITE_VERBS.includes(k)), [], 'no write verb before a press');
  sheet.button().click();
  await settle();
  assert.deepEqual(calls.filter((k) => WRITE_VERBS.includes(k)), ['sendToClaude'], 'control: a press sends once');
});
