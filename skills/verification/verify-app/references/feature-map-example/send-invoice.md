# Send an invoice

A user sends a draft invoice to the customer. The invoice moves to `Sent`, can no longer be edited, and the customer
receives an email with a link to it.

## Sub-features

- `send-confirm` asks for confirmation and names the recipient.
- `send-status` moves the invoice to `Sent` and locks its lines.
- `send-email` delivers one email to the customer's billing address.
- `send-twice` refuses to send an invoice that is already sent.

## How to get to it (user's point of view)

- The `Send` button on a draft invoice's page.
- `inv send <number>` in a terminal.

## Driving it with Playwright, the test mailbox and inv

Preconditions:

- The baseline state from `README.md`, plus a draft `INV-0001` for `Acme Ltd` made through `Create an invoice`.
- Launch started the test mailbox, and the doctor reports it at `$MAIL_URL` with no messages.

Steps:

- **Ask to send.** Open `INV-0001` and choose `Send`. Run `await page.getByRole('button', { name: 'Send' }).click()`. A
  dialog named `Send invoice` names `billing@acme.example`.
- **Confirm.** Run `await page.getByRole('dialog', { name: 'Send invoice' }).getByRole('button', { name: 'Send now' }).click()`.
  The status reads `Sent`, and the `Edit` button is gone.
- **Check the email.** Run `curl -sS "$MAIL_URL/api/messages"`. One message, to `billing@acme.example`, subject
  `Invoice INV-0001 from Demo Co`, with a link to `/i/` in the body.
- **Refuse a second send.** Run `./bin/inv send INV-0001`. Exit code `1`, stderr `INV-0001 is already sent`, and the
  mailbox still has one message.
- **Proof.** Save a screenshot of the invoice page to `$EV/send-invoice/02-sent.png`, the mailbox response to
  `$EV/send-invoice/03-messages.json`, and the `inv` step as `04-send-twice.cmd`, `.out`, `.err` and `.exit`.

## Gotchas

- The real mail provider is replaced by the test mailbox only when `MAIL_MODE=capture`. Without it, Launch would
  send real email; the doctor checks the mode before any drive.
- The email is sent by a background job. Poll the mailbox for up to 10 seconds, do not read it once.
- A sent invoice cannot be deleted. Cleanup resets the database instead of deleting it through the UI.
