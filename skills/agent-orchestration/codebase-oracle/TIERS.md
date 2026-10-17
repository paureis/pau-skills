# Evidence tiers

Every claim sits in one of five tiers. The tier decides what the answer may say. When a brief asks for the tiers,
paste this whole file, examples included, without shortening it.

## The five tiers

**Direct.** The evidence answers the question on its own.
- Behaviour: you read the code along the whole path the question is about, from entry point to result, including
  the branch that applies; or you ran it and saw the result.
- Absence: a thorough search proves something is not there. Say where you looked and what you searched for. Example:
  "I searched the API directory, the shared library folder, and all config files. There is no file upload handling
  anywhere, no storage client, and no multipart parsing. This would need to be built."
- Intent: an author stated the reason for the exact thing asked, in words that give a reason ("because", "so that",
  "to", "since"), in a commit message, a pull request description or review, an issue, a design doc, or a code
  comment ("clamp to 100 because the upstream API rejects larger values"). Facts set side by side that let a reader
  work out a reason are not a stated reason. Neither is a reason stated for a neighbouring thing (another file,
  another entry, an earlier version): for example, a commit that says one entry is rooted at the repository "so
  nothing is copied" states that reason for that entry only. Both are Supported at best, or Inferred.
- Wording: plain and cited. "X does Y (`file`, lines A-B)." "X exists because Z (pull request #N)."

**Supported.** Several pieces of indirect evidence agree, and none states the answer outright.
- Behaviour: you read most of the path, and the rest is pinned by tests or by call sites that all agree.
- Intent: for example the pull request title says "speed up export", its issue is labelled as a performance bug, and
  the tests added with it all use very large inputs. Or a reason stated for a neighbouring thing, together with
  evidence that the same reason covers the thing asked.
- Wording: "The evidence points strongly to X:" followed by each piece, cited.

**Inferred.** A reasonable reading that nothing states.
- Behaviour: you read part of the path and filled the rest from names, one call site, or a convention seen
  elsewhere. Or the path runs through a link you cannot see (a dependency, a remote service, a platform, a step that
  people do by hand) whose behaviour is documented: cite the document.
- Intent: for example the change was merged the same day an incident was reported, so it was likely a hotfix.
- Wording: hedged, naming what it was inferred from. "Given A and B, X seems likely." "X appears to", "likely",
  "is consistent with".

**Speculative.** A plausible idea on thin evidence, where other explanations fit as well.
- Wording: "One possibility is X, but there is no direct evidence." Always next to at least one other possibility,
  so the user can say which is right.

**Unknown.** The available evidence cannot settle the question: a link you cannot see with no record of it at all
(no code, no document), history that was squashed, a reason nobody wrote down.
- For intent, Unknown is allowed only after the record lookup was tried: the commits, then the pull requests and
  issues they name. The answer says which part found nothing and which could not be reached, and why (no network, no
  login, an API error). Expecting the record to be empty is not a lookup.
- Wording: say what you searched, where, and for what, and who or what could settle it (the author, a runtime log,
  the pull request record). "I searched X, Y and Z" is useful; "I couldn't find out" is not.

## Evidence from outside the repository

- **Documentation of a process** (a runbook, a contributing guide, "how we release") is a claim about what people do,
  not proof that it happens. It is direct evidence that this is the documented process, and Inferred evidence that
  this is what happens, unless something you can see confirms it (a CI log, a release artifact, the result in the
  environment).
- **Platform, framework or tool behaviour** (what a setting means to the tool, what a library does by default) known
  from general knowledge is not evidence. Such a claim is Speculative, next to another possibility, until something
  settles it: the vendor's documentation (Inferred, citing the page) or an experiment (Direct, with the output). For
  example, flip the setting on a scratch copy of the repository and run the tool or its validator. General knowledge
  may suggest where to look and which candidate to test; it is never the answer by itself.

## Rules that go with the tiers

- Confidence words ("because", "the reason is", "was designed to", "fixes", "the team decided") need direct or
  supported evidence, with the citation right next to them. Never use them for an inference.
- Never cite code as evidence for its own intent. Code shows what happens, not why it was meant to. "It retries three
  times, so it was designed for a flaky network" is a guess. Intent comes from commit messages, pull request
  discussion, issues, design docs and comments that state a reason, each at the tier its wording earns.
- An absence of evidence about intent is not evidence: "no one mentioned security, so it was not a concern" is not
  a finding. This is different from a search that proves code is absent, which is direct.
- An API error is not evidence. A 404 from a pull request route can mean the token lacks permission; report the
  error and treat that record as not reached.
- Do not fit a tidy reason to messy history. A pattern repeated across files may be copy and paste, not a decision.
- When sources disagree, show both with citations and let the user decide. When a comment or doc disagrees with the
  code about behaviour, the code wins, and the conflict is part of the answer.
- Two explorers that repeat the same inference still give one inference. Merging reports never raises a tier.
