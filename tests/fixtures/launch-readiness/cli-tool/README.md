# tally

Counts lines, words and characters in text files, like `wc`, with JSON output and a total row.

```bash
python3 -m tally notes.txt other.txt
python3 -m tally --json notes.txt
cat notes.txt | python3 -m tally -
```

Tests: `python3 -m unittest discover`.
