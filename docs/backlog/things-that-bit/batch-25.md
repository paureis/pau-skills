# Things that bit the twenty-fifth batch

[Back to the backlog index](../../BACKLOG.md)

Things that bit Q35, wizard:
- A worktree builder's harness branch (`worktree-agent-<id>`) stayed at the base: the builder made and committed on
  its own branch name from the brief (`claude/q35-wizard`). Merging the harness branch merged nothing. Check
  `git log <base>..<branch>` on both names before the merge.
- `runNode` in `tests/helpers.mjs` uses spawnSync, which blocks the event loop, so a `node:http` server in the same
  test process never answers. Spawn the script asynchronously for any test with a local server.
- `JSON.parse` error messages quote the input in Node 22 and 24. A script that must not print a value prints only
  "not valid JSON".
- Several readline interfaces on one piped stdin lose lines (the second prompt never gets one, and Node exits 13 on an
  unsettled top-level await). Use one line queue for the whole run.
- `res.resume()` drains a response but never closes it: a URL that streams forever kept `status` alive after it
  printed. Destroy the response once the status is known.
- `stdio: 'ignore'` covers file descriptors 0 to 2 only; a child can still open /dev/tty. On POSIX, `detached: true`
  gives it a new session with no terminal, and a timeout needs SIGKILL to the whole group, since a child can ignore
  SIGTERM.
- A pasted value can sit in a JSON key. A key-name printer that allowed "plain" keys up to 32 characters echoed
  `sk_test_...` and `AKIA...`. Never name an unknown key.
- The scrub check read the author name inside a temp-folder prefix as a hit, and `8 s:` in a test message as
  a Windows path. Use neutral prefixes and reword such messages.
- The cold run found what the review could not: the agent handed over a relative path although the skill showed the
  absolute one, dropped an approved step whose check needed a fact it did not have, and could not see `status`'s exit
  code under a narrow allowlist, so `status` now ends with a summary line.
- A headless `claude -p` with an empty HOME authenticates from the container environment with no extra setup.
- README.md was 7 bytes under its limit; the new line needed three bullets shortened (it is 28 under now).
  `wizard.mjs` is 410 bytes under the file-size limit: split it before it grows.
