---
name: sharpen
description: "Sharpen a task before starting it: restate what the user is after and the problem behind it, ask how a top expert would approach it, say whether it is over- or under-specified, keep one outside check that the result is right, confirm with the user in a few lines, then do the work. Use when the user types /sharpen or says 'sharpen this', 'think before you start', 'make sure you understand the task', or 'check my prompt first'."
argument-hint: "[the task, or nothing to use the last message]"
disable-model-invocation: true
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/sharpen
---

# Sharpen

The task: $ARGUMENTS (if empty, the user's last message)

Before starting:

1. Restate in your own words what the user is after and the problem they are trying to solve.
2. Ask how a top expert would approach this task: their raw sources, their real methods, and an outside check that
   the result is right.
3. Say whether the task is over- or under-specified. Loosen constraints that don't serve the goal as readily as you
   add ones that do. Leave choices that are the user's to make open instead of deciding them.
4. Check the task against the prompt checklist below and note what is missing.
5. Fold in only what makes the work better, not bigger, but always keep one outside check that the result is right.

Then confirm, in a few lines: the restatement, the outside check, and anything you would loosen, add or ask. Ask
with AskUserQuestion (or a plain question) whether that is the task. Do not hand back a rewritten prompt. On a yes,
do the work; on a correction, restate again.

**Prompt checklist.** Put in: the goal (what is wrong or what the user wants); the done check, which can pass or
fail; the proof to show (real command output, the stored value, a before and after number); what the user already
knows (a symptom, a repro step, a log); the real constraints ("repro first", "zero behavior change"). Leave out:
the how; a list of skills or steps; "the user's theory of the cause, until the agent restates the problem".
