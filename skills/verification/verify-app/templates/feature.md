# TODO(verify-app): feature name

TODO(verify-app): one paragraph on what the user sees and can do, in the user's words.

## Sub-features

- `TODO(verify-app)` one line per behaviour, each with a short ID.

## How to get to it (user's point of view)

- TODO(verify-app): every entry point a user has (a button, a shortcut, a route, a command).

## Driving it with TODO(verify-app)

Preconditions:

- TODO(verify-app): the state the app must be in, and the doctor result that confirms it.

Steps:

- **TODO(verify-app) step name.** The user action. Run `TODO(verify-app) exact command`. The observable result.
- **Proof.** Run `TODO(verify-app) exact command` to save the evidence to `$EV/<feature>/` as numbered step files. What the evidence shows.

## Gotchas

- TODO(verify-app): traps that waste or invalidate a run, and any precondition the seed data lacks.

## States

TODO(verify-app): for a feature with a screen, one line per state: how to force it, what it should look like, and the screenshot kept. For a feature with no screen (a CLI command, an HTTP endpoint), replace the list with one line that says so.

- **Loading.** TODO(verify-app) how to hold the data (intercept the request, or the app's own delay switch), what shows while it waits (a skeleton, a spinner) and where. Screenshot `$EV/<feature>/NN-loading.png`.
- **Empty.** TODO(verify-app) how to reach no data, and what shows (the message, the call to action). Screenshot `$EV/<feature>/NN-empty.png`.
- **Error.** TODO(verify-app) how to make the request fail, and what shows (the message, a retry). Screenshot `$EV/<feature>/NN-error.png`.
- **Skeleton.** TODO(verify-app) the skeleton's marker or container, measured with "States and skeletons" in `SKILL.md` at its viewports, or "No skeleton."
