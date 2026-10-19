# Team

A one-page web app whose People list loads from an API behind a skeleton. It is a fixture for the `States` section
and the skeleton recipe of the `verify-app` skill: a dry run copies this folder to a temporary place, drives it with
a browser, and checks each state and the skeleton.

## Run it

```bash
PORT=0 node server.mjs
```

It prints `ready on <url>` when it serves requests. Stop it with Ctrl+C or SIGTERM.

## The states

| State | Page URL | What shows |
|---|---|---|
| Loading | `/?delay=3000` (or hold `GET /api/people` in the browser) | three grey skeleton rows |
| Loaded | `/` | three people |
| Empty | `/?data=empty` | `No people yet.` |
| Error | `/?fail=1` | an alert, `Could not load people.`, with `Try again` |

The page passes its query string on to `/api/people`, so the same switches work on the API.

Skeleton rows carry `data-skeleton-for="person-row"` and real rows `data-skeleton-name="person-row"`.
