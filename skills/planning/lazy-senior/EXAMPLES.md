# Examples

Five before-and-after pairs, each in a different language. Under each: the rung of the ladder in `RULES.md` it stops
at, and what it leaves out on purpose.

## 1. The platform: a disclosure widget (HTML)

Before: a click handler on a `div`. It cannot be reached with the keyboard, and a screen reader does not know it opens.

```html
<div class="faq">
  <div class="faq-question" onclick="toggle(this)">How do I reset my password?</div>
  <div class="faq-answer" hidden>Open Settings, then Security, then Reset password.</div>
</div>
<script>
  function toggle(el) {
    const answer = el.nextElementSibling;
    answer.hidden = !answer.hidden;
  }
</script>
```

After: the browser's own element.

```html
<details class="faq">
  <summary>How do I reset my password?</summary>
  <p>Open Settings, then Security, then Reset password.</p>
</details>
```

Rung 3. The `summary` takes focus, opens with Enter or Space, and is announced as expanded or collapsed, with no
script. Left out: an open and close animation, which nobody asked for. If the project has its own disclosure
component, rung 2 wins and you use that.

## 2. The standard library: unique, sorted tags (Go)

Before: a set and a sort written by hand.

```go
func uniqueTags(tags []string) []string {
	seen := map[string]bool{}
	var out []string
	for _, t := range tags {
		if !seen[t] {
			seen[t] = true
			out = append(out, t)
		}
	}
	for i := 0; i < len(out); i++ {
		for j := i + 1; j < len(out); j++ {
			if out[j] < out[i] {
				out[i], out[j] = out[j], out[i]
			}
		}
	}
	return out
}
```

After: the `slices` package (Go 1.21 and later).

```go
func uniqueTags(tags []string) []string {
	out := slices.Clone(tags) // sort a copy, so the caller's slice keeps its order
	slices.Sort(out)
	return slices.Compact(out)
}
```

Rung 3. Same result for every input, including an empty or nil slice, and no quadratic sort. Left out: folding case,
so "Go" and "go" stay two tags; nobody asked for that.

## 3. An installed dependency: retries on a flaky service (Python)

Before: a hand-written loop. It tries five times with the same one-second wait, and returns the body of a 404 as if it
were the invoice.

```python
def fetch_invoice(session, base_url, invoice_id):
    for attempt in range(5):
        try:
            response = session.get(f"{base_url}/invoices/{invoice_id}", timeout=10)
            if response.status_code < 500:
                return response.json()
        except requests.ConnectionError:
            pass
        time.sleep(1)
    raise RuntimeError("invoice service unavailable")
```

After: `requests` is already installed, and its adapter takes a `urllib3` retry policy.

```python
import requests
from requests.adapters import HTTPAdapter
from urllib3.util import Retry


def make_session():
    retry = Retry(
        total=3,
        backoff_factor=0.5,  # a longer wait after each failed try
        status_forcelist=[502, 503, 504],
        allowed_methods=["GET", "HEAD"],  # never a POST: a retried charge could charge twice
    )
    session = requests.Session()
    session.mount("https://", HTTPAdapter(max_retries=retry))
    return session


def fetch_invoice(session, base_url, invoice_id):
    response = session.get(f"{base_url}/invoices/{invoice_id}", timeout=10)
    response.raise_for_status()
    return response.json()
```

Rung 4. Retries only requests that are safe to repeat, with a cap and a growing wait, and a 4xx now raises instead of
passing as data. Left out: retrying a POST, which needs an idempotency key the service would have to support first,
and a circuit breaker.

## 4. A deletion: an interface and a factory with one implementation (TypeScript)

Before: a policy interface, one class and a factory with an option no caller sets.

```ts
export interface RetentionPolicy {
  isExpired(createdAt: Date, now: Date): boolean;
}

class DaysRetentionPolicy implements RetentionPolicy {
  constructor(private readonly days: number) {}
  isExpired(createdAt: Date, now: Date): boolean {
    return now.getTime() - createdAt.getTime() > this.days * 24 * 60 * 60 * 1000;
  }
}

export function createRetentionPolicy(options: { kind?: "days"; days?: number } = {}): RetentionPolicy {
  return new DaysRetentionPolicy(options.days ?? 30);
}

// cleanup.ts
const policy = createRetentionPolicy();
const expired = uploads.filter((u) => policy.isExpired(u.createdAt, new Date()));
```

After: one function.

```ts
const DAY_MS = 24 * 60 * 60 * 1000;

export function isExpired(createdAt: Date, now: Date, days = 30): boolean {
  return now.getTime() - createdAt.getTime() > days * DAY_MS;
}

// cleanup.ts
const now = new Date();
const expired = uploads.filter((u) => isExpired(u.createdAt, now));
```

Rung 1: the interface, the class and the `kind` option did not need to exist. This is safe only because the code is
internal and the search came first: one implementation, no test double or mock implements `RetentionPolicy`, the
package does not export it, no caller passes `kind`, and one test passes `days`, so `days` stays a parameter. Left
out: a second kind of policy, until one is asked for.

## 5. A guard kept: a port from the environment (Rust)

Before: short, and wrong. It panics when `PORT` is unset or not a number, accepts 0, and turns 70000 into port 4464
without a word.

```rust
fn port() -> u16 {
    let raw = std::env::var("PORT").unwrap();
    raw.parse::<u32>().unwrap() as u16
}
```

After: still short, and the outside value is checked.

```rust
fn port() -> Result<u16, String> {
    let raw = std::env::var("PORT").map_err(|_| "PORT is not set, or is not valid text".to_string())?;
    match raw.trim().parse::<u16>() {
        Ok(p) if p > 0 => Ok(p),
        _ => Err(format!("PORT must be a whole number from 1 to 65535, got {raw:?}")),
    }
}

fn main() {
    match port() {
        Ok(p) => println!("listening on port {p}"),
        Err(e) => {
            eprintln!("{e}");
            std::process::exit(2);
        }
    }
}
```

Rung 3: the standard library's `parse::<u16>` does the range check up to 65535; the code adds only the check for 0.
The guard stays because the value comes from outside the program: a bad value stops the start with a message that
names it, instead of a panic or a wrong port. Left out: a default port, which nobody asked for.
