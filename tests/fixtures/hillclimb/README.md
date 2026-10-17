# hillclimb fixture

A small Python program with slow paths, for a dry run of the `hillclimb` skill. Copy this folder into a new git
repository outside this one before using it; never run it in place.

- `wordfreq.py`: `top_words(text, n)`, the code to make faster.
- `bench.py`: the harness. One run of the realistic case (40,000 words by default, a fixed seed), checked against
  `collections.Counter`; it exits 1 on a wrong answer and prints its error and work counts.
- `test_wordfreq.py`: the regression gate, `python3 -m unittest`.

The metric is the wall time of `python3 bench.py`, lower is better. Set `PYTHONDONTWRITEBYTECODE=1` so the runs leave
no cache folders behind.
