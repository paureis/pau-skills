# Property and differential tests

An example test checks the inputs you thought of. A property test states a rule that holds for every input, lets a
generator try hundreds of inputs, and shrinks a failure to the smallest input that still breaks the rule. A
differential test runs two versions of the code on the same inputs and compares what they return.

## When a property test pays

Where the input space is too big for examples and edge cases get missed:
- parsers and serializers;
- money and other arithmetic (rounding, splitting, totals, overflow);
- data writes and migrations;
- a rewrite or an optimisation of code that works today;
- sorting, merging and de-duplication.

Skip it for glue code, and for a function with a handful of inputs: there, examples are clearer and cover every case.
A property test sits next to the example tests; keep the examples that show the main cases.

## The four properties

| Property | The rule | Tiny example |
|---|---|---|
| Round trip | decoding what you encoded gives back the input | `decode(encode(x)) == x` |
| Invariant | something stays true of every output | `sort(xs)` is ordered and holds the same items; the shares of a split amount add up to the amount; a map keeps the length |
| Idempotency | applying twice equals applying once | running a migration twice leaves the same schema as once; two upserts of a row leave one row |
| Equivalence with a naive version | a slow, obvious version is the oracle | `dedupe(xs) == naive_dedupe(xs)`, where the naive one is a nested loop |

Take the rule from the requirement, as with any expected value, never from a run of the code. "It does not crash" is
a property too, the weakest one: add a real check where you can.

```python
# Python, Hypothesis
@given(st.lists(st.text()))
def test_round_trip(items):
    assert decode(encode(items)) == items
```

```ts
// TypeScript, fast-check: amounts in whole cents
fc.assert(fc.property(fc.integer({ min: 0, max: 10 ** 12 }), fc.integer({ min: 1, max: 50 }), (cents, parts) => {
  const shares = split(cents, parts);
  return shares.length === parts && shares.reduce((a, b) => a + b, 0) === cents;
}));
```

```rust
// Rust, proptest
proptest! {
    #[test]
    fn dedupe_matches_naive(xs in proptest::collection::vec(any::<u8>(), 0..50)) {
        prop_assert_eq!(dedupe(&xs), naive_dedupe(&xs));
    }
}
```

## Generators

- Cover the edges: empty, zero, the maximum, negative numbers, duplicates, and non-ASCII text (accented letters,
  emoji, right-to-left scripts). For a text format, include its delimiter and its quote character. Library defaults
  reach most of these; check that a generator you wrote does too.
- Constrain with the library's own builders (a range, a size limit, a mapped or combined generator) instead of
  filtering most inputs away. A filter that rejects most inputs spends the run on rejected cases; Hypothesis stops
  with a failed health check ("filtering out a lot of inputs").
- Money: generate whole minor units (integers) or a decimal type, never binary floats.

## Seeded runs and replay

A failure you cannot replay is a flaky test. The run prints its seed or saves the failing case; replay with it until
the fix passes; then keep the shrunk failing case as an ordinary example test, so it runs on every build even when
the library's saved file is gone.

| Library | On a failure | Replay |
|---|---|---|
| Hypothesis | prints "Failing test case:" and saves it under `.hypothesis/examples` | the next run tries the saved case first; fix the seed with `pytest --hypothesis-seed=<n>`, `@seed(<n>)` or `settings(derandomize=True)` |
| fast-check | prints `{ seed, path }` and the counterexample | `fc.assert(property, { seed, path })` |
| proptest | prints the minimal failing input and the path of `proptest-regressions/<file>.txt`, where it saves a `cc <seed>` line | later runs replay that file first: commit it |
| jqwik | prints `seed = ...` and writes `.jqwik-database` | `@Property(seed = "...")`; by default it tries the last failed sample first |
| gopter | prints "failed with initial seed: N" | `gopter.DefaultTestParametersWithSeed(N)` |
| rapid (Go) | prints `-rapid.seed=N` and a fail file under `testdata/rapid/` | `go test -run <Test> -rapid.seed=N`, or the printed `-rapid.failfile=` |
| Go `testing/quick` | prints no seed | pass `&quick.Config{Rand: rand.New(rand.NewSource(seed))}` and log the seed yourself |
| Go fuzzing (`go test -fuzz`) | writes the input to `testdata/fuzz/<FuzzName>/` | plain `go test` replays every file there: commit it |

## Without a property library

Use the project's own property library if it has one. Without one, write a seeded loop with the standard library:
Python `random.Random(seed)`, Go `testing/quick`, or in JavaScript, which has no seedable random in its standard
library, a small seeded generator of a few lines. Print the seed on failure. Ask before adding a library, and name it,
its size and its license. A loop does not shrink: cut a failing input down by hand before you keep it as an example.

```python
seed = int(os.environ.get("SEED", random.randrange(2**32)))
rnd = random.Random(seed)
for _ in range(500):
    xs = [rnd.randint(-1000, 1000) for _ in range(rnd.randint(0, 20))]
    assert fast_sort(xs) == sorted(xs), f"seed={seed} input={xs}"
```

## Libraries by ecosystem

| Ecosystem | Library |
|---|---|
| Python | Hypothesis |
| JavaScript, TypeScript | fast-check |
| Rust | proptest |
| Java | jqwik |
| Kotlin | kotest-property |
| Scala | ScalaCheck |
| .NET (C#, F#) | FsCheck, CsCheck |
| Go | rapid; gopter (last release 2024); the standard `testing/quick` (frozen: no new features), whose `quick.CheckEqual` compares a function with a naive version; built-in fuzzing (`go test -fuzz`) |
| Haskell | QuickCheck |
| Erlang | PropEr |
| Elixir | StreamData |
| Ruby | prop_check |
| PHP | Eris |
| C++ | RapidCheck |

## Differential tests for a rewrite or a migration

The old version is the oracle: it is what callers rely on today.
1. Keep the old version runnable: a frozen copy, the old commit checked out in a separate worktree
   (`git worktree add <dir> <commit>`), or the old service.
2. Run old and new on the same inputs: seeded random ones from a generator, or recorded ones.
3. Normalize what does not matter before you compare: timestamps, generated IDs, the order of output that has no
   order, whitespace, and float noise within a tolerance you state. Never a tolerance for money: amounts match
   exactly.
4. Keep a file of approved differences, each with its reason (the old bug the rewrite fixes, a field the new version
   adds).
5. Fail on any other difference, and print the input, both outputs and the seed.
6. Delete the harness, the old copy and the approved list when the migration is done.

Recorded inputs from production can hold personal data: never commit them. Remove the personal data first, or
generate the inputs instead.

```
for input in generated(seed) + recorded:
    old_out, new_out = normalize(old(input)), normalize(new(input))
    if old_out != new_out and not approved(input):
        fail(seed, input, old_out, new_out)
```

## The two-edit check still applies

A property that never fails proves nothing. Break the code once (return a wrong value, drop an item, round the wrong
way), watch the property fail, then restore. Use `mutation-test` if it is installed; otherwise break the code by hand,
run, and restore with `git checkout -- <file>`.

In any mutation run, fix the seed so the control run and the mutant see the same inputs. Git-ignore `.hypothesis/`
and `.jqwik-database` first, and after each run delete what a mutant wrote under `proptest-regressions/`,
`testdata/rapid/` or `testdata/fuzz/`; never commit those. An untracked file left behind makes the next harness run
refuse with "the tree has uncommitted changes".
