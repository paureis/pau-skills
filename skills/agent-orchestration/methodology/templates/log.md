# [Project] Log (append-only)

<!-- APPEND ONLY. Never edit or delete a past line. A log you rewrite is a log
     you cannot trust.

     Format:  ## [YYYY-MM-DD] phase | event

     A wrong entry is corrected by a new entry (today's date, the current phase)
     that names the one it supersedes, never by editing it:
       ## [YYYY-MM-DD] phase | Supersedes [YYYY-MM-DD] "<old event, in full>": <what is true instead>

     Cite run IDs, agent IDs, and commit SHAs. A finding whose provenance you
     cannot reconstruct is a rumor.

     Log the negative results too. "Evaluator round 2: holds" and "0 survivors,
     legit negative result" are as load-bearing as the successes; they are what
     convergence looks like from the outside. -->

## [YYYY-MM-DD] phase 0 | Repo initialized; state files created.
## [YYYY-MM-DD] phase 0 | Resumability smoke-test [PASSED / FAILED, fixed X].
