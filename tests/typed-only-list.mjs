// The typed-only list: the skills that start only when the user types them, with `disable-model-invocation: true` in
// their frontmatter. This is the only place the list is decided (decision 32, docs/backlog/decisions.md).
// tests/context-budget.test.mjs, tests/description-rules.test.mjs, tests/trigger-lists.test.mjs and
// tests/typed-only.test.mjs import it. It holds no test, so npm test (which runs only tests/*.test.mjs) never runs it
// on its own.

// Who may be on it: a skill the user always starts on purpose, that no other skill starts. A request in words, the
// agent, a subagent and other skills cannot start a typed-only skill, and it costs no context until it is typed. A
// typed-only skill may start model-invoked skills, never another typed-only one.
// A typed-only skill is never on the confirm list (tests/confirm-list.mjs): it cannot start on its own, so it has no
// yes to ask for.
export const TYPED_ONLY = [
  'agent-orchestration/geppetto', 'agent-orchestration/lean-subagent-dev', 'agent-orchestration/overnight-run',
  'planning/agent-friendly-audit', 'session-discipline/session-close', 'verification/launch-readiness',
  'verification/skill-eval',
];
