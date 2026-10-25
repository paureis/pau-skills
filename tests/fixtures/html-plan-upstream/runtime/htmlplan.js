/* A tiny stand-in for upstream html-plan runtime/htmlplan.js, for tests/pack-html-plan.test.mjs. Like upstream it is
   one IIFE that registers globalThis.HtmlPlan and exports it in Node, where there is no DOM. It holds the three
   htmlplan.js anchors of scripts/html-plan/upstream.mjs, each once. */
(function () {
'use strict';
const NW = { fixture: 'html-plan-upstream' };
const HAS_DOM = typeof document !== 'undefined';
const h = (tag, attrs, ...kids) => ({ tag, attrs, kids });
NW.openResponse = (r) => {
  const pre = h('pre', null, r.md);
  const state = h('span', { class: 'nw-send-state' });
  const copy = h('button', { class: 'nw-btn primary' }, 'Copy response');
  return [pre, state, copy];
};
globalThis.HtmlPlan = NW;
if (!HAS_DOM) { if (typeof module !== 'undefined') module.exports = NW; return; }
})();
