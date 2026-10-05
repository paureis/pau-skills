# Nightly decision: pseudocode

STARTING POINT. Implement as a small script with a pure `decide()` function whose reads (runs, jobs, annotations, tree
diff) are passed in as functions, so a unit test can feed it invented histories. Every path that is not a clear "skip"
returns "run". Print the reason on every outcome.

```
SUITE_JOB   = "Nightly full suite"      # literal name of the nightly suite job
MARKER      = "tested-tree"             # annotation title written by the suite's last step
CAP_HOURS   = 12
MAX_CHECKED = 30

decide(event, force, test_alert, now, current_tree, current_run_id,
       runs(), jobs(run_id), annotations(job_id), changed_paths(ref_tree)):
  try:
    manual = (event == "workflow_dispatch")
    if test_alert and manual: return skip(mode="test-alert", "exercise the alert; never a reference")
    if force and manual:      return run("forced")

    done = [r for r in runs() if r.branch == INTEGRATION and r.status == "completed" and r.id != current_run_id]
                                                         # newest first

    # Cap: one full suite per CAP_HOURS, counting red runs too.
    for r in done:
      created = parse(r.created_at); if unreadable: return run("unreadable date")
      if created < now - CAP_HOURS: continue
      s = job named SUITE_JOB in jobs(r.id)
      if s and s.conclusion in {failure, cancelled, timed_out}:
        return skip(mode="cap-after-red", "suite was red in run r.id; no heartbeat, nothing closed; use force after a fix")
      if s and s.conclusion == success:
        return skip(mode="no-changes", "suite already ran in run r.id within the cap")

    # Reference: newest green suite job WITH the marker.
    ref = None
    for r in first MAX_CHECKED of done:
      s = job named SUITE_JOB in jobs(r.id)
      if not s or s.conclusion != success: continue
      m = annotation in annotations(s.id) with title == MARKER and a 40-hex message
      if not m: continue                     # a green run without the marker is not a reference
      ref = (r.id, m.message); break
    if not ref: return run("no reference")
    if current_tree is not 40-hex: return run("unreadable current tree")

    # Tree against tree (git diff --name-only --no-renames <ref tree> <current tree>); an error means run.
    paths = changed_paths(ref.tree)          # raises if the object is missing from the checkout
    if paths is empty:              return skip(mode="no-changes", "identical to tested tree")
    if all paths are documentation: return skip(mode="no-changes", "documentation only since tested tree")
    return run("code changed since tested tree: first few paths")
  except any error:
    return run("unexpected error: <message>")
```

Outputs to `$GITHUB_OUTPUT`: `run=true|false`, `mode=run|no-changes|cap-after-red|test-alert`, `reason=<one line>`.
If `$GITHUB_OUTPUT` is missing, exit non-zero: the suite job's condition (`run != 'false'`) then runs the suite.

Unit cases worth a mutation each: a green run without the marker; a green run on another branch; a red run newer than
the green one; a cancelled run inside the cap window; a reference tree missing from the checkout; an identical tree;
documentation only; one code file; an unreadable date; `force` and `test_alert` outside `workflow_dispatch` (ignored).
