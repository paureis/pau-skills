// The confirm list: the skills that carry the confirm paragraph and ask for a yes before they start on their own.
// This is the only place the list is decided. tests/confirm-step.test.mjs and tests/description-rules.test.mjs import
// it. It holds no test, so npm test (which runs only tests/*.test.mjs) never runs it on its own.

// Settled with the owner after the P0.5 review: only skills whose cost has no other gate. Skills that already stop
// for the user's yes before they write (retrospective, instructions-audit, to-issues, ci-cost-and-cadence,
// project-setup, improve-codebase-architecture, whose code changes start only on an explicit ask to implement),
// conversations the user can stop with a word (brainstorm, grill-me) and skills that write only a local file or a
// proposal (handoff, to-prd) do not ask twice.
export const CONFIRM_LIST = [
  // launches subagents or headless runs
  'agent-orchestration/arena', 'agent-orchestration/codebase-oracle', 'agent-orchestration/overnight-run',
  'agent-orchestration/parallel-worktrees',
  'planning/agent-friendly-audit', 'verification/hillclimb', 'verification/skill-eval', 'verification/verify-app',
  // commits, pushes or installs with no other gate
  'guards/dependency-upgrade', 'guards/rule-to-hook', 'planning/architect', 'session-discipline/session-close',
  // sets the whole session's way of working
  'agent-orchestration/lean-subagent-dev', 'agent-orchestration/methodology',
];
