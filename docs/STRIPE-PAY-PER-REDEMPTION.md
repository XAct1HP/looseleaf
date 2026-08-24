# Reconfiguring Stripe for pay per redemption

Everything Loose Leaf for Partners charges for is now one event: a Date Pass
that a partner's own staff scanned. $1.50 each, billed once a month in
arrears. There is no plan to buy, no monthly fee, and no card asked for at
signup.

This is the list of things you have to change **in the Stripe dashboard**, in
the order they have to happen. The code changes are already in the repo; none
of them work until steps 1–4 are done.

Do the whole thing in a **sandbox** first and run the end-to-end check at the
bottom. The live account has real partners on it.

---

## What is being replaced

| Before | After |
| --- | --- |
| Three products, three monthly prices ($49 / $99 / $199) | One product, one **metered** price at $1.50/unit |
| Checkout in `subscription` mode, picking a plan | Checkout in `subscription` mode, $0 base, purely to capture a card |
| `partner-checkout` function | `partner-billing-setup` function |
| `partner-report-usage` (legacy usage records, switched off) | `partner-meter-redemptions` (billing meter events) |
| A failed payment hides the Date Spot | A failed payment pauses Date Passes; the listing stays up |
| Credit risk: none, you were paid up front | Credit risk: capped per partner by `partner_credit`, in the database |

**Yes, there is still a Stripe Subscription object.** It costs $0/month and
carries one metered item. It exists because Stripe only gives you monthly
invoice generation, Smart Retries, dunning email, and a portal invoice history
for subscription invoices — building that for standalone invoices is weeks of
work. The partner never picks it, never sees a recurring line, and a month
with no redemptions produces a $0 invoice that charges them nothing. If anyone
asks, "no subscription" is true of the product; the Stripe object is plumbing.

---

## 1 · Create the billing meter

**Billing → Meters → Create meter** (or `POST /v1/billing/meters`).

| Field | Value |
| --- | --- |
| Meter name | `Date Pass redemptions` |
| Event name | `date_pass_redemption` |
| Aggregation | **Sum** |
| Value field | `value` |
| Customer mapping field | `stripe_customer_id` |

The **event name must match exactly**. It is stored in
`platform_billing.stripe_meter_event_name` and sent verbatim on every meter
event; a mismatch produces `v1.billing.meter.no_meter_found` and silently
bills nobody.

Copy the meter id (`mtr_…`).

## 2 · Create the product and its metered price

**Product catalogue → Add product.**

| Field | Value |
| --- | --- |
| Name | `Loose Leaf Date Pass redemptions` |
| Description | `$1.50 per Date Pass redeemed at your business` |
| Pricing model | **Usage-based** → Per unit |
| Price | `1.50 USD` per unit |
| Billing period | **Monthly** |
| Meter | the meter from step 1 |

Leave it at a single flat per-unit rate. Do **not** use graduated or volume
tiers — the credit ceiling in the database prices exposure at a flat
`fee_cents` per redemption, and tiered pricing would make the two disagree.

Copy the price id (`price_…`).

> Do not add a separate $0/month flat price. A subscription with one metered
> item is already $0 until usage arrives, and a second line item would show up
> on every invoice as a zero row for no reason.

## 3 · Tell Loose Leaf about both

```sql
update platform_billing set
  redemption_fee_cents    = 150,
  stripe_meter_event_name = 'date_pass_redemption',
  stripe_metered_price_id = 'price_XXXXXXXXXXXX',
  updated_at              = now()
where id;
```

`redemption_fee_cents` must match the Stripe price. It is what gets stamped
onto each `date_pass_redemptions.fee_cents`, what the dashboard shows the
partner, and what the credit ceiling is measured in — Stripe decides what is
actually charged, this decides what everyone is told beforehand. If they ever
drift, the partner sees one number and pays another.

**Changing the price later** means updating both, in this order: create a new
Stripe price against the same meter, update `stripe_metered_price_id` and
`redemption_fee_cents` together, then migrate existing subscriptions onto the
new price. Redemptions already recorded keep the fee they were stamped with,
so a price rise never applies retroactively.

## 4 · Deploy the functions and set the secrets

```bash
supabase functions deploy partner-billing-setup
supabase functions deploy partner-portal
supabase functions deploy partner-meter-redemptions --no-verify-jwt
supabase functions deploy stripe-webhook            --no-verify-jwt
```

`partner-checkout` and `partner-report-usage` are gone. Delete them so a stale
deployment can't take a card for a plan that no longer exists:

```bash
supabase functions delete partner-checkout
supabase functions delete partner-report-usage
```

New secret, alongside the existing ones:

```
METER_WORKER_TOKEN=<a long random string>
```

`REPORT_USAGE_TOKEN` is no longer read and can be removed.

## 5 · Schedule the metering worker

Redemptions sit in the database as `bill_status = 'pending'` until this runs.
Every 15 minutes is a good default — the credit ceiling is computed from the
database rather than from Stripe, so a late meter event delays the invoice
line and never the enforcement, but a partner watching their outstanding
balance would rather see it move.

With `pg_cron` and `pg_net`:

```sql
select cron.schedule(
  'meter-date-pass-redemptions',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/partner-meter-redemptions',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-worker-token', '<METER_WORKER_TOKEN>'),
    body    := '{}'::jsonb
  );
  $$
);
```

Stripe refuses meter events older than 35 days. `redemptions_awaiting_meter()`
stops offering anything older than 30, so a redemption that has failed to
report for a month stops being retried and needs looking at rather than
silently going round forever. Worth an alert if that query ever returns rows
older than a week.

## 6 · Update the webhook endpoint

**Developers → Webhooks →** your existing endpoint. Keep the same URL and
signing secret; change the event list to:

```
checkout.session.completed
customer.subscription.created
customer.subscription.updated
customer.subscription.deleted
invoice.finalized
invoice.paid
invoice.payment_failed
invoice.marked_uncollectible
payment_method.attached
payment_method.detached
customer.updated
```

`invoice.finalized` is the new one that matters: it is what stamps the invoice
id onto the redemptions it covers, which is what makes a bill reconcilable
against the partner's own list. Without it every invoice is a number with
nothing behind it.

Also add a **thin** endpoint for meter errors — these are how you find out
that redemptions are being reported and landing nowhere:

```
v1.billing.meter.error_report_triggered
v1.billing.meter.no_meter_found
```

## 7 · Retries and what happens after them

**Billing → Revenue recovery → Retries.**

| Setting | Value | Why |
| --- | --- | --- |
| Smart Retries | On | 8 attempts over 2 weeks is the default and is fine |
| After all retries fail | **Mark the subscription as unpaid** | Not "cancel" |
| Email customers about failed payments | On | |

**Mark as unpaid, never cancel.** A cancelled subscription deletes your ability
to bill that customer at all and takes the invoice history with it from the
partner's point of view. `unpaid` keeps the customer, keeps generating draft
invoices, and lets a partner come back and pay. The webhook reads three
consecutive failures as a suspension and pauses Date Passes; paying lifts it
automatically.

**Billing → Invoices.** Turn on emailing finalised invoices and receipts —
this is now the only communication a partner gets about money, since there is
no monthly charge to notice.

## 8 · Reconfigure the billing portal

**Settings → Billing → Customer portal.**

| Option | Set to |
| --- | --- |
| Update payment method | **On** — this is the portal's main job now |
| Invoice history | **On** |
| Update billing address / tax id | On |
| **Switch plans** | **Off** |
| **Cancel subscription** | Off, or "at end of period" |

Plan switching must be off. There is one price, and a "change plan" button
that leads to a single option reads like a bug.

Cancellation is a judgement call. A partner who wants to stop just pauses
their offers — charges stop that day, and their free listing stays. Letting
them cancel the subscription from the portal removes the card and therefore
their ability to run offers at all, which is a bigger action than they
probably mean. Off, with "pause your offers instead" in the dashboard, is the
kinder default.

---

## 9 · Migrating the partners who are already paying

Anyone currently on `date-spot`, `featured`, or `date-partner`.

Check who that is first:

```sql
select p.name, s.plan_id, s.status, s.stripe_subscription_id, s.current_period_end
from partner_subscriptions s join partners p on p.id = s.partner_id
where s.plan_id in ('date-spot','featured','date-partner')
  and s.status in ('active','trialing','past_due');
```

For each one, in Stripe:

1. **Cancel the old subscription immediately, with proration.** In the
   dashboard: Subscriptions → the subscription → Cancel → *immediately* →
   tick **"Prorate the final invoice"**. They get credited for the unused part
   of the month they already paid for. That credit sits on the customer
   balance and is spent automatically against their first redemption invoice,
   which is a good first impression of the new model.
2. **Create a new subscription** on the same customer with the metered price
   from step 2. No trial, no billing cycle anchor — let it start now.
3. Confirm the webhook wrote `plan_id = 'free'` and a `payment_method_at` on
   their `partner_subscriptions` row.

Then archive the old prices and products so nothing can subscribe to them
again. **Archive, do not delete** — deleting breaks the invoice history that
already references them.

The migration SQL already sets `legacy_plan_id` on every row, so which tier
each business used to be on stays readable afterwards.

Email them before you do it. Going from "$199/month, everything included" to
"free, $1.50 a redemption" is good news for almost every partner, but finding
out via a cancellation email from Stripe is not how anyone wants to hear it.

---

## 10 · The credit ceiling, and how to run it

This is the part that answers "what stops a restaurant taking the foot traffic
and not paying". A monthly invoice is a bill, not a collection — so the
exposure is capped, and the cap lives in the database rather than in Stripe.

Every partner has a row in `partner_credit` with a tier. The tier sets the
most unbilled redemption they can accrue:

| Tier | Limit | Grace | Earned by |
| --- | --- | --- | --- |
| New partner | $25 | $10 | everyone starts here — about 16 redemptions |
| Established | $75 | $20 | one invoice paid |
| Trusted | $200 | $50 | 3 invoices, $150 lifetime, no failure in 90 days |
| Anchor | $500 | $100 | 6 invoices, $600 lifetime, no failure in 180 days |

Two thresholds, not one, and the gap between them is the point:

- **At the limit**, the partner stops being able to *hand out* passes. Their
  offers drop out of `public_offers` and out of recommendations. Students
  never see an error — the offer simply isn't offered.
- **Past the limit plus the grace band**, already-issued passes stop being
  honoured too. This is deliberately later, so somebody standing at a counter
  holding a valid pass is not turned away because the restaurant is behind on
  an invoice.

The Date Spot stays live through all of it. It was always free; hiding it
punishes students and gains you no leverage.

Tune any of it with an UPDATE — no deploy:

```sql
-- give new partners more rope
update partner_credit_tiers set limit_cents = 4000 where id = 'new';

-- one business you know personally
select staff_set_partner_credit('<partner-uuid>', 50000, null, null, 'Known good, owner is a friend of the campus');

-- back to the ladder
select staff_set_partner_credit('<partner-uuid>', -1, null, null, null);

-- write off a redemption without losing the attribution
select staff_waive_redemption('<redemption-uuid>');
```

Worth watching weekly:

```sql
select (staff_partner_revenue() -> 'outstanding_cents');  -- owed, not yet collected
select (staff_partner_revenue() -> 'at_risk_cents');      -- gone uncollectible
select * from staff_partner_credit() order by unbilled_cents desc limit 10;
```

`exposure_ceiling_cents` is the number to keep an eye on as you grow: the sum
of every partner's limit, i.e. the theoretical worst case if everyone stopped
paying at once. It should stay small relative to cash on hand.

---

## 11 · End-to-end check, in a sandbox

Do not skip this. Nothing in this repo has ever run against real Stripe.

1. Sign up a test business, get it approved from Backstage. **It should be
   live to students with no card at all.** If it isn't, `partner_is_live()`
   didn't get replaced.
2. Draft an offer. Try to publish it → refused, "add a card first".
3. Add a card in Billing (`4242 4242 4242 4242`). Confirm in Stripe that you
   have a customer with a $0/month subscription carrying one metered item, and
   that `partner_subscriptions.payment_method_at` filled in.
4. Publish the offer. Unlock a pass as a test student, scan it.
5. `select bill_status, fee_cents from date_pass_redemptions order by redeemed_at desc limit 1;`
   → `pending`, `150`.
6. Fire the worker by hand:
   ```bash
   curl -X POST https://<ref>.supabase.co/functions/v1/partner-meter-redemptions \
        -H 'x-worker-token: <METER_WORKER_TOKEN>'
   ```
   → row goes to `metered`; the meter shows 1 event under that customer.
7. In Stripe, advance the test clock a month (or finalise the draft invoice by
   hand). → invoice for $1.50, `invoice.finalized` stamps `stripe_invoice_id`,
   `invoice.paid` flips the row to `paid` and moves the partner to
   **Established**.
8. Swap the card for `4000 0000 0000 0341` (fails on charge) and run another
   cycle. → `invoice.payment_failed`, tier drops to New, **but the Date Spot
   is still visible to students**. Confirm that last part specifically; it is
   the behaviour most likely to have been got wrong.
9. Push a partner over their cap (`staff_set_partner_credit(id, 300, …)` and
   two redemptions). → their offer vanishes from the student side, an issued
   pass still scans, and the dashboard says which of the two is happening.

---

## What this costs you

At $1.50 a redemption, batched monthly, Stripe's cut is roughly:

| Partner's month | Invoice | Stripe fee | You keep |
| --- | --- | --- | --- |
| 10 redemptions | $15.00 | $0.74 | $14.26 (95%) |
| 50 redemptions | $75.00 | $2.48 | $72.52 (97%) |
| 200 redemptions | $300.00 | $9.00 | $291.00 (97%) |

For comparison, charging $1.50 per scan as it happened would cost $0.34 in
fees every time — 23% — and that is the single reason this is billed monthly
rather than at the counter.
