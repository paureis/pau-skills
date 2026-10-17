"""Count the most common words in a text.

top_words(text, n) returns the n most common words as (word, count) pairs, most common first, ties in alphabetical
order. A word is a run of letters, digits or apostrophes; case is ignored.
"""

import sys


def tokenize(text):
    words = []
    current = ""
    for ch in text:
        if ch.isalnum() or ch == "'":
            current = current + ch.lower()
        else:
            if current:
                words.append(current)
            current = ""
    if current:
        words.append(current)
    return words


def count_words(words):
    counts = {}
    for word in set(words):
        counts[word] = words.count(word)
    return counts


def top_words(text, n=10):
    counts = count_words(tokenize(text))
    ranked = sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    return ranked[:n]


if __name__ == "__main__":
    for word, count in top_words(sys.stdin.read(), int(sys.argv[1]) if len(sys.argv) > 1 else 10):
        print(f"{count}\t{word}")
