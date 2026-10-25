/* Send to Claude: a pau-skills addition to html-plan (Q15). scripts/pack-html-plan.mjs appends this file to
   runtime/htmlplan.js. On a page published as an artifact that declares `capabilities: {comments: {}}`, it adds a
   "Send to Claude" button after "Copy response" in the Respond sheet; a press posts the response as one comment through
   the comments capability, so the watching Claude session gets it. Anywhere else (a saved file, a chat artifact, a
   viewer that cannot send) it adds nothing, and copy and paste works as before.
   Rules from the comments contract: write only from a press, never at load or on a timer; ask canSendToClaude each
   time the sheet opens; branch on the error code, never the message; never send again by itself.
   The decisions sit on globalThis.HtmlPlanSendToClaude so tests can drive them with stub objects. */
(function () {
'use strict';
const LIMIT = 4096; // bytes of UTF-8 in one comment
const CODES = new Set(['consent_required', 'forbidden', 'invalid', 'not_found', 'rate_limited', 'unavailable', 'upstream_error',
  'claude_unavailable', 'not_granted', 'capability_disabled', 'capability_removed', 'transform_error']);
const FINAL = new Set(['consent_required', 'forbidden', 'claude_unavailable', 'invalid', 'transform_error', 'not_granted',
  'capability_disabled', 'capability_removed']);
// After one of these, the button is not offered again until the page reloads (permanent for this view).
const OFF_FOR_VISIT = new Set(['forbidden', 'not_granted', 'capability_disabled', 'capability_removed']);
const transient = (code) => code !== 'rate_limited' && !FINAL.has(code);

/** True only inside a viewer: `window.claude.use()` exists. A chat artifact's flat window.claude has no use(). */
function isArtifact(win) {
  return !!(win && win.claude && typeof win.claude.use === 'function');
}

/** The comments namespace when Send to Claude can go through right now, else null. */
async function offer(win) {
  let comments;
  try { comments = await win.claude.use('comments'); } catch { return null; }
  if (!comments) return null; // use() resolves null when this view cannot run the capability
  if (typeof comments.canSendToClaude !== 'function') return null;
  let answer;
  try { answer = await comments.canSendToClaude(); } catch { return null; }
  return answer === 'available' ? comments : null;
}

/** '' when `text` fits in one comment, else the reason it does not. */
function sizeProblem(text) {
  const bytes = new TextEncoder().encode(String(text)).length;
  return bytes > LIMIT ? `The response is ${bytes} bytes and a comment holds at most ${LIMIT} bytes, so copy it instead.` : '';
}

/** Where the comment is anchored: the page title, else main. */
function target(doc) {
  return doc.querySelector('h1') || doc.querySelector('main');
}

/** One anchorFor, then one sendToClaude. Never retries. */
async function send(comments, el, text) {
  try {
    const anchor = await comments.anchorFor(el);
    await comments.sendToClaude({ anchor, text });
    return { ok: true };
  } catch (e) {
    const code = e && typeof e.code === 'string' && CODES.has(e.code) ? e.code : 'upstream_error';
    return { ok: false, code };
  }
}

/** What to show after a send, and whether the button may be pressed again. failuresSoFar counts earlier
    unavailable, upstream_error and unknown failures in this page load. */
function after(result, failuresSoFar) {
  if (result.ok) return { message: 'Sent to Claude as a comment on this page.', enabled: false };
  const code = result.code;
  if (code === 'forbidden') return { message: 'Not sent: commenting from this page is off here. Copy the response instead.', enabled: false };
  if (FINAL.has(code)) return { message: 'Not sent. Copy the response and paste it to Claude instead.', enabled: false };
  if (code === 'rate_limited') return { message: 'Not sent: too many sends just now. Wait a moment, then press again.', enabled: true };
  if (failuresSoFar < 1) return { message: 'Not sent. Press again once, or copy the response.', enabled: true };
  return { message: 'Not sent again. Copy the response and paste it to Claude instead.', enabled: false };
}

/** Watch body for the Respond sheet and add the button to each opening where it can work. */
function attach(doc, win) {
  if (!isArtifact(win)) return;
  const visit = { failures: 0, off: false };

  async function onSheet(bg) {
    const state = bg.querySelector('.nw-send-state');
    const copy = [...bg.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Copy response');
    const pre = bg.querySelector('pre');
    if (visit.off || !state || !copy || !pre) return;
    const comments = await offer(win);
    if (!comments || !bg.isConnected || visit.off) return;
    const btn = doc.createElement('button');
    btn.className = 'nw-btn';
    btn.type = 'button';
    btn.textContent = 'Send to Claude';
    const problem = sizeProblem(pre.textContent);
    if (problem) {
      btn.disabled = true;
      btn.title = problem;
      state.textContent = problem;
    }
    btn.addEventListener('click', async () => {
      if (btn.disabled || sizeProblem(pre.textContent)) return;
      btn.disabled = true; // a second press while this one is sending would post a second comment
      state.textContent = 'Sending to Claude...';
      const result = await send(comments, target(doc), pre.textContent);
      const shown = after(result, visit.failures);
      if (!result.ok && transient(result.code)) visit.failures++;
      if (!result.ok && (OFF_FOR_VISIT.has(result.code) || (transient(result.code) && visit.failures >= 2))) visit.off = true;
      state.textContent = shown.message;
      btn.disabled = !shown.enabled;
    });
    copy.after(btn);
  }

  const watch = () => {
    const observer = new win.MutationObserver((records) => {
      for (const r of records) {
        for (const n of r.addedNodes) {
          if (n.nodeType === 1 && n.classList.contains('nw-sheet-bg') && n.querySelector('.nw-send-state')) onSheet(n);
        }
      }
    });
    observer.observe(doc.body, { childList: true });
  };
  if (doc.body) watch();
  else doc.addEventListener('DOMContentLoaded', watch, { once: true });
}

globalThis.HtmlPlanSendToClaude = { LIMIT, isArtifact, offer, sizeProblem, target, send, after, attach };
if (typeof window === 'undefined' || typeof document === 'undefined') return;
if (!isArtifact(window)) return;
attach(document, window);
})();
