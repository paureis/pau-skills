---
name: sharpen
description: "Sharpen a task before starting it: restate what the user is after and the problem behind it, ask how a top expert would approach it, say whether it is over- or under-specified, keep one outside check that the result is right, confirm with the user in a few lines, then do the work. Use when the user types /sharpen or says 'sharpen this', 'think before you start', 'make sure you understand the task', or 'restate the task before you start'."
argument-hint: "[the task, or nothing to use the last message]"
disable-model-invocation: true
license: MIT (adapted from cursor/plugins pstack; see NOTICE)
metadata:
  upstream: https://github.com/cursor/plugins/tree/09d06eb4b97a1020ab31e84030e38baf1099c7dc/pstack/skills/sharpen
---

# Sharpen

The task: $ARGUMENTS (if empty, the user's last message)

Before starting:

1. Restate in your own words what the user is after and the problem they are trying to solve: why they want it.
2. Ask how a top expert would approach this task: their raw sources, their real methods, and an outside check that
   the result is right.
3. Say whether the task is over- or under-specified. Loosen constraints that don't serve the goal as readily as you
   add ones that do. Leave choices that are the user's to make open instead of deciding them.
4. Check the task against the prompt checklist below and note what is missing.
5. Fold in only what makes the work better, not bigger, but always keep one outside check that the result is right.

Then confirm, in this shape and no longer, and ask with AskUserQuestion (or a plain question) whether that is the
task:

```
Goal: <what the user is after, in your words>
Why: <the problem behind it>
Outside check: <how the result will be shown to be right>
Missing: <what the prompt checklist finds missing, or "none">
Loosen or add: <constraints you would drop or add, or "none">
Your call: <choices left to the user, as a question, or "none">
```

These lines check your understanding; they are not a new prompt, so do not hand back a rewritten one. The confirm
takes the place of working silently ("without narrating the framing", in the original): show the framing once, here,
and do not narrate it again while you work. On a yes, do the work; on a correction, restate again.

**Prompt checklist.** Put in: the goal (what is wrong or what the user wants); the done check, which can pass or
fail; the proof to show (real command output, the stored value, a before and after number); what the user already
knows (a symptom, a repro step, a log); the real constraints ("repro first", "zero behavior change"). Leave out:
the how; a list of skills or steps; "the user's theory of the cause, until the agent restates the problem".
