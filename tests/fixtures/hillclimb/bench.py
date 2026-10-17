"""Benchmark harness for wordfreq.top_words: one run of the realistic case.

Builds the same text every time (a fixed seed), runs top_words once, checks the answer against collections.Counter,
and prints the work done. Exits 1 when the answer is wrong, so a broken change cannot look fast.
Usage: python3 bench.py [words, default 40000]
"""

import collections
import random
import re
import sys

from wordfreq import top_words


def make_text(n_words, seed=7):
    rng = random.Random(seed)
    consonants, vowels = "bcdfgklmnprstvz", "aeiou"
    syllables = [c + v for c in consonants for v in vowels]
    vocabulary = sorted({"".join(rng.choice(syllables) for _ in range(rng.randint(2, 4))) for _ in range(4000)})
    weights = [1.0 / (rank + 1) for rank in range(len(vocabulary))]
    words = rng.choices(vocabulary, weights=weights, k=n_words)
    lines, line = [], []
    for i, word in enumerate(words):
        line.append(word.capitalize() if i % 11 == 0 else word)
        if len(line) == 12:
            lines.append(" ".join(line) + ".")
            line = []
    lines.append(" ".join(line))
    return "\n".join(lines)


def expected(text, n):
    counts = collections.Counter(re.findall(r"[0-9a-z']+", text.lower()))
    return sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:n]


def main():
    n_words = int(sys.argv[1]) if len(sys.argv) > 1 else 40000
    text = make_text(n_words)
    got = top_words(text, 20)
    want = expected(text, 20)
    if got != want:
        print(f"wrong answer: got {got[:3]}, want {want[:3]}", file=sys.stderr)
        sys.exit(1)
    print(f"errors=0 work={n_words}")


if __name__ == "__main__":
    main()
