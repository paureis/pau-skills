---
name: tidy-notes
description: "Tidy a plain text list: sort the lines and remove repeated ones. Use when the user types /tidy-notes."
disable-model-invocation: true
---

# Tidy notes

The file to tidy: $ARGUMENTS

1. Read the file.
2. Remove lines that repeat an earlier line, ignoring case and spaces at either end.
3. Sort what is left alphabetically, ignoring case.
4. Write the result back to the same file and say how many lines were removed.
