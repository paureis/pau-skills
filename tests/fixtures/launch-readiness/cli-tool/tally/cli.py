"""Command-line entry point."""
import argparse
import json
import sys
from typing import List, Optional

from tally import __version__
from tally.counting import Counts, count_text, total


def read_source(path: str) -> str:
    if path == "-":
        return sys.stdin.read()
    with open(path, encoding="utf-8", errors="replace") as handle:
        return handle.read()


def format_table(rows: List[Counts]) -> str:
    width = max(len(r.name) for r in rows)
    lines = [f"{'name':<{width}}  {'lines':>7} {'words':>7} {'chars':>8}"]
    for r in rows:
        lines.append(f"{r.name:<{width}}  {r.lines:>7} {r.words:>7} {r.chars:>8}")
    return "\n".join(lines)


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(prog="tally", description="Count lines, words and characters.")
    parser.add_argument("files", nargs="+", help="files to count, or - for standard input")
    parser.add_argument("--json", action="store_true", help="print JSON instead of a table")
    parser.add_argument("--version", action="version", version=f"tally {__version__}")
    args = parser.parse_args(argv)

    rows = []
    for path in args.files:
        try:
            rows.append(count_text(path, read_source(path)))
        except OSError as error:
            print(f"tally: {path}: {error.strerror}", file=sys.stderr)
            return 1
    if len(rows) > 1:
        rows.append(total(rows))

    if args.json:
        print(json.dumps([r.__dict__ for r in rows], indent=2))
    else:
        print(format_table(rows))
    return 0
