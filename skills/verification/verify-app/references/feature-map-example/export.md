# Export invoices

A user exports invoices to a CSV file, all of them or those in a date range, to open in a spreadsheet.

## Sub-features

- `export-all` writes every invoice, one row each, with a header row.
- `export-range` keeps only invoices issued between `--from` and `--to`, both inclusive.
- `export-empty` writes only the header when nothing matches, and says so.
- `export-overwrite` refuses to replace an existing file without `--force`.

## How to get to it (user's point of view)

- `inv export --out <file> [--from <date>] [--to <date>] [--force]` in a terminal.

## Driving it with the inv command

Preconditions:

- The baseline state from `README.md`, plus drafts `INV-0001` and `INV-0002` made through `Create an invoice`, both
  issued today.
- An empty `$RUN/export/` folder.

Steps:

- **Export all.** Run `./bin/inv export --out "$RUN/export/all.csv"`. Exit code `0`, stdout `Exported 2 invoices`.
  The file has 3 lines, and the first is `number,customer,issued,status,total`.
- **Export a range.** Run `./bin/inv export --out "$RUN/export/old.csv" --from 2000-01-01 --to 2000-12-31`. Exit code
  `0`, stdout `No invoices in range; wrote the header only`, and the file has 1 line.
- **Refuse to overwrite.** Run `./bin/inv export --out "$RUN/export/all.csv"` again. Exit code `2`, stderr names the
  file and suggests `--force`, and the file is unchanged (same checksum as before).
- **Proof.** Each step is saved as `$EV/export/<nn>-<step>.cmd`, `.out`, `.err` and `.exit` (`01-all`, `02-range`,
  `03-overwrite`), and both CSV files are copied there.

## Gotchas

- Dates are in the server's time zone, not the terminal's. Near midnight, an invoice made today can fall outside
  `--to <today>`.
- The CSV uses a comma separator and a dot for decimals whatever the locale. Do not judge it by opening it in a
  spreadsheet.
- The export folder is in `$RUN`, which Cleanup deletes. Copy the files to the evidence folder before Cleanup.
