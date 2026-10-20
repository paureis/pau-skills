# sharpen (Adapted from [pstack `sharpen`](https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/sharpen))

Back to the [origins index](../../ORIGINS.md).

Closest upstream: `skills/sharpen/SKILL.md`, `skills/in-your-own-words/SKILL.md` and
`skills/poteto-help/references/prompting.md`. The body shares about 25% of its word 6-grams with them (16% from
`sharpen`, 9% from `prompting.md`).

**Problem.** Agents start on the literal wording of a task, miss what the user is after, and add constraints instead
of questioning the ones that do not serve the goal.

**What this version changes.**
- The upstream paragraph becomes numbered steps; the `in-your-own-words` restatement (the goal, the problem behind it,
  and why) is the first.
- A confirm step is added on purpose. Upstream works "without narrating the framing"; here the agent confirms in a
  fixed six-line shape (Goal, Why, Outside check, Missing, Loosen or add, Your call) with AskUserQuestion or a plain
  question, then works. The lines check understanding; they are not a new prompt, and "don't hand back a rewritten
  prompt" is kept.
- The prompt checklist from `prompting.md` is inline: put in the goal, the done check, the proof, the known facts and
  the constraints; leave out the how, a list of skills or steps, and the user's theory of the cause until the agent
  restates the problem. Its mentions of `/recall`, `/how`, `/why`, `/teach` and `/loop` are dropped.

**Why.** The dry run on backlog item M3 showed that without a fixed shape the confirm ran to about 20 lines.
