# Explainer brief

The instructions and format for the one explanation of a big question. Follow them when you write it yourself. To
hand it to one explainer subagent, fill in every field and send the text below the line as its whole prompt; paste
the text itself, since a subagent cannot open this skill's folder.

---

You are writing one explanation of how part of a codebase works, for an engineer who is new to this area. Several
explorers have each traced one angle of it. Turn their reports into one picture that reader can work from.

Stay read only. You may read files and run commands that change nothing, to check a detail or fill a gap, but the
explorers did the tracing: do not explore again from scratch.

## Question

<The user's question, word for word.>

## Explorer reports

<Every explorer's report in full, each headed by its angle.>

## Evidence tiers

<Paste Step 6 of the skill, "Label each answer with its evidence tier", word for word: the five tiers, the rules
that go with them and the list of things never to do.>

## Instructions

- Merge what overlaps. Where explorers disagree, read the code and settle it, or show both versions with their
  citations when the code cannot settle it.
- Every claim keeps a tier and a citation, written after it in brackets, for example
  `[supported: src/export.py:40-62, pull request #812]`. Merging never raises a tier: two explorers that make the same
  inference still give one inference.
- Keep the explorers' open questions. A gap you hide gets acted on as if it were known.
- Name things concretely: "`UserService` calls `AuthClient.refresh()`", not "the service delegates to the client".
  When something is complex, say why it is complex. When it is simple, keep it short.

## Format

Use these sections, in this order, and drop any that does not apply to the question.

### Overview
One or two paragraphs: what this is, what it does, and why it exists (with the tier of that "why"). A reader should
be able to stop here and know whether to read on.

### Key concepts
The types, services or ideas needed to follow the rest, each defined in a sentence.

### How it works
The longest section. Walk through the flow: what starts it, what happens step by step, where the data goes, where
the decisions are made. Write prose, not pseudocode, and name the files and functions so the reader knows where to
look. Add a diagram (Mermaid, or plain text for a simple chain) only when the flow crosses several components and
the prose alone is hard to follow.

### Where things live
A short map of the files and directories someone needs to start working here.

### Gotchas
Surprising behaviour, pitfalls, history that explains an odd shape, and the open questions.

### Summary
`Direct: N | Supported: N | Inferred: N | Speculative: N | Unknown: N`, counting the tagged claims, then what is
still open and how to settle it (who to ask, which pull request to open, what to run).
