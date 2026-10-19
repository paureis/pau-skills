# Area: billing

Load from stage 2 when the app takes money (subscriptions, one-off payments, credits, marketplace payouts). For an
app that takes no money, write one row `BIL-NA` (n/a, "takes no money"). Money as integers is COR-01; card data
scope is CMP-08.

**BIL-01 The processor is the source of truth, through verified webhooks** (2, must-fix, probe). Applies: Stripe,
Paddle, Lemon Squeezy, Braintree, app-store billing and the like. Check: access is granted from the processor's
webhook or an API read, never from a client redirect alone (a user can open the success URL by hand); webhook
signatures are verified with the raw body; events are handled idempotently by event id (COR-04). Probe: post an
unsigned event to the webhook route; it is refused. Pass: `file:line` of the check and the probe. Fix: small.

**BIL-02 Every state of a subscription** (2, must-fix). Applies: subscriptions. Check: trial end, failed payment and
retry (dunning), past due, cancel at period end, immediate cancel, refund, chargeback, plan change with proration,
and what the user can do in each. Pass: `file:line` of the handler for each event, or a test. Fix: medium.

**BIL-03 Prices and plans in one place** (2, must-fix). Applies: more than one price. Check: the amount charged
comes from the server or the processor's price id, never from a price the client sends. Probe: change the amount in
the request.

**BIL-04 Taxes and invoices** (2, must-fix). Applies: selling to consumers or businesses in places with sales tax
or VAT. Check: the processor's tax feature or a tax service, invoices with the legal fields, and business tax ids
collected where needed. Needs a person for the rules.

**BIL-05 Usage limits match the plan** (2, must-fix). Applies: plans with quotas or seats. Check: limits enforced on
the server at the moment of use, with a test at the boundary.

**BIL-06 Refunds and credits are recorded** (2, can-wait). Applies: any payments. Check: refunds go through the
processor and are mirrored in the app; credits are a ledger of entries, not a single number that is overwritten.

**BIL-07 Test and live keys kept apart** (2, must-fix). Applies: any processor. Check: test keys in development and
previews, live keys only in production, and the webhook secret per environment.
