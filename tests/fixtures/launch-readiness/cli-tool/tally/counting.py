"""The counting itself, independent of files and output."""
from dataclasses import dataclass
from typing import Iterable


@dataclass
class Counts:
    name: str
    lines: int = 0
    words: int = 0
    chars: int = 0

    def add(self, other: "Counts") -> None:
        self.lines += other.lines
        self.words += other.words
        self.chars += other.chars


def count_text(name: str, text: str) -> Counts:
    return Counts(name=name, lines=text.count("\n"), words=len(text.split()), chars=len(text))


def total(counts: Iterable[Counts]) -> Counts:
    result = Counts(name="total")
    for c in counts:
        result.add(c)
    return result
