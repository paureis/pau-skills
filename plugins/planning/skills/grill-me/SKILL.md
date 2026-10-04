---
name: grill-me
description: Interview the user relentlessly about a plan or design until reaching shared understanding — walking each branch of the decision tree, resolving dependencies between decisions one at a time, and recommending an answer for each question. Use when the user wants to stress-test or pressure-test a plan, get grilled on their design, poke holes in an approach, or work through design decisions before building — e.g. "grill me", "interrogate my plan", "stress-test this design", "poke holes in this". Explores the codebase to answer questions the code can answer instead of asking. General-purpose; works on any plan in any project.
license: MIT (adapted from mattpocock/skills; see NOTICE)
metadata:
  upstream: https://github.com/mattpocock/skills/tree/main/skills/productivity/grill-me
---

# Grill Me

Interview the user relentlessly about every aspect of the plan or design until you reach a **shared understanding** — every open decision resolved, no ambiguity left.

## How to run it

- **One question at a time.** Never dump a list. Resolve each branch before opening the next.
- **Walk the whole decision tree.** Go down each branch and resolve dependencies between decisions in order — an earlier answer usually shapes the next question, so the sequence matters.
- **Recommend an answer for every question**, with a brief why. The user can override; your job is to bring a default, not just an open-ended prompt.
- **Explore instead of asking.** If a question can be answered by reading the codebase, go find the answer yourself — only ask the user what genuinely needs *their* judgment (intent, priorities, tradeoffs, preferences).
- **Be relentless.** Don't stop early to be polite or to save time. Keep going until every open decision is settled and you both understand the plan the same way.

## When it's done

You're done when there are no unresolved branches left — when you could hand the plan to someone else and they wouldn't have to ask "but what about X?" Summarize the decisions reached so the user can confirm.
