# Create an invoice

A user picks a customer, adds line items and saves a draft invoice. The total is computed from the lines, and the
draft appears in the invoice list with the next invoice number.

## Sub-features

- `create-form` opens an empty invoice form from the list page.
- `create-lines` adds and removes line items and updates the total.
- `create-save` saves a draft with the next number.
- `create-invalid` refuses a draft with no line items and says why.
- `create-api` creates the same draft through `POST /api/invoices`.

## How to get to it (user's point of view)

- The `New invoice` button on the `Invoices` page.
- The `n` key on the `Invoices` page, when no text field has focus.
- `POST /api/invoices` with a bearer token, for API users.

## Driving it with Playwright and curl

Preconditions:

- The baseline state from `README.md`.
- No invoice exists yet, so the next number is `INV-0001`.

- **Open the form.** Choose `New invoice`. Run `await page.getByRole('button', { name: 'New invoice' }).click()`. A
  form named `Invoice` appears, and the `Customer` combobox has focus.
- **Add a line.** Pick `Acme Ltd` and add one line. Run `await page.getByRole('combobox', { name: 'Customer' }).selectOption('Acme Ltd')`,
  then `await page.getByRole('button', { name: 'Add line' }).click()`, then fill `Description` with `Design work`,
  `Quantity` with `3` and `Unit price` with `120`. The `Total` reads `360.00`.
- **Refuse an empty draft.** Remove the line and save. Run `await page.getByRole('button', { name: 'Remove line 1' }).click()`
  and `await page.getByRole('button', { name: 'Save draft' }).click()`. An alert reads `Add at least one line`, and
  the URL is still `/invoices/new`.
- **Save.** Add the line again and choose `Save draft`. The heading reads `INV-0001`, and a status reads `Draft saved`.
- **Read it back.** Run `curl -sS -H "Authorization: Bearer $INV_TOKEN" "$URL/api/invoices/INV-0001"`. Status `200`,
  `"status": "draft"` and `"total": "360.00"`.
- **API entry.** Run `curl -sS -X POST "$URL/api/invoices" -H "Authorization: Bearer $INV_TOKEN" -H 'content-type: application/json' -d '{"customer":"Blue Fern","lines":[{"description":"Hosting","quantity":1,"unitPrice":"40"}]}'`.
  Status `201`, and the body has `"number": "INV-0002"`.
- **Proof.** Open `Invoices`. Run `await page.screenshot({ path: process.env.EV + '/create-invoice/list.png' })` and
  write `await page.getByRole('table', { name: 'Invoices' }).ariaSnapshot()` to `$EV/create-invoice/list.aria.txt`.
  Both show `INV-0001` for `Acme Ltd` and `INV-0002` for `Blue Fern`.

## Gotchas

- The total is rounded on save, not while typing. Assert the saved total, not the live one.
- `n` types into a focused field instead of opening the form. Click the page heading first.
- Numbers are never reused: a deleted draft still uses up its number. Expect `INV-0003` after a delete, not `INV-0002`.
- Delete both drafts at the end with `Delete draft`, and keep the evidence.
