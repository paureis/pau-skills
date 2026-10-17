# Bookmarks

A tiny HTTP service that saves links. It is a fixture for trying the `verify-app` skill: a dry run copies this folder
to a temporary place, makes it a git repository, and generates a verification skill for it.

## Run it

```bash
PORT=0 DATA_DIR=./data node server.mjs
```

It prints `listening on <url>` when the port is open and `ready on <url>` when it has loaded its data. Until then
`/health` returns 503. Stop it with Ctrl+C or SIGTERM.

## Use it

```bash
curl -sS -X POST "$URL/bookmarks" -H 'content-type: application/json' -d '{"url":"https://example.com","title":"Example","tags":["ref"]}'
curl -sS "$URL/bookmarks?tag=ref"
curl -sS -X DELETE "$URL/bookmarks/1"
```

The page at `/` lists the saved bookmarks.
