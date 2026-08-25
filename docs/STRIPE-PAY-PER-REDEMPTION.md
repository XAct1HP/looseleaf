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
supabase functions deploy partner-billing-sync
supabase functions deploy partner-portal
supabase functions deploy partner-meter-redemptions --no-verify-jwt
supabase functions deploy stripe-webhook            --no-verify-jwt
```

`partner-billing-sync` asks Stripe directly what card is on a customer and
writes the answer. The Billing page calls it whenever somebody comes back from
Stripe's pages, so a partner is never stuck waiting on a webhook that did not
arrive. It does **not** trust the redirect — `?billing=ok` only decides that we
should go and look; Stripe decides what is true, and a hand-typed URL produces
a reconcile that says "no card".

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

```bash
supabase secrets set --env-file supabase/functions/.env
# or just the one:
supabase secrets set METER_WORKER_TOKEN=<the value>
```

> ### The token lives in two places and they must match
>
> This is the single most confusing thing in the whole setup, so it is worth
> being explicit about:
>
> | Where | Who reads it | What for |
> | --- | --- | --- |
> | **Supabase Vault**, named `meter_worker_token` | the cron job | to **send** the `x-worker-token` header |
> | **Edge Function secrets**, `METER_WORKER_TOKEN` | `partner-meter-redemptions` | to **check** that header |
>
> They are different stores. Setting only the Vault one is the natural mistake,
> because Vault is what you touch while scheduling the job — and it leaves the
> function rejecting every call, which looks exactly like a token mismatch and
> is not one.
>
> `{"error":"METER_WORKER_TOKEN is not set on this function…"}` means the
> function secret is missing. A 401 about the header means the two have drifted
> apart. Nothing is billed in either case, and nothing anywhere else looks
> wrong.

`REPORT_USAGE_TOKEN` is no longer read and can be removed.

## 5 · Schedule the metering worker

Redemptions sit in the database as `bill_status = 'pending'` until this runs.
Every 15 minutes is a good default — the credit ceiling is computed from the
database rather than from Stripe, so a late meter event delays the invoice
line and never the enforcement, but a partner watching their outstanding
balance would rather see it move.

### Where this runs

**Supabase dashboard → SQL Editor → new query → Run.** It is a one-time
statement: `cron.schedule` registers the job inside Postgres, and it fires from
then on without anything else running anywhere. You are not putting this in the
repo, in a shell, or in a deploy script.

Two prerequisites, both one-off:

1. **Database → Extensions**, enable **`pg_cron`** and **`pg_net`**. Without
   them the statement fails with `schema "cron" does not exist`.
2. Replace `<project-ref>` (the string in your Supabase URL) and
   `<METER_WORKER_TOKEN>` (the actual secret) before running. They are
   placeholders, not variables Postgres will fill in.

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

### Or use the Cron UI instead, which is better

**Integrations → Cron → Jobs → Create job.** Same pg_cron underneath, but you
pick "Edge Function" as the job type from a form, and each job gets a
**History** view. That history is the thing worth having: it is how you find
out the worker has been failing for a week without querying
`cron.job_run_details` by hand. Job names are case-sensitive and cannot be
edited after creation.

To change the schedule later, re-run `cron.schedule` with the same job name —
it overwrites. To stop it, `select cron.unschedule('meter-date-pass-redemptions');`
or delete it from the Jobs list.

### The token ends up in plaintext

Whichever route you take, the secret is stored as literal text in the
`cron.job` table, readable by anything with database access. Acceptable in a
sandbox. For live, put it in Vault and read it back at run time instead:

```sql
-- once
select vault.create_secret('<METER_WORKER_TOKEN>', 'meter_worker_token');

-- then schedule against the vault, not the literal
select cron.schedule(
  'meter-date-pass-redemptions',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := 'https://<project-ref>.supabase.co/functions/v1/partner-meter-redemptions',
    headers := jsonb_build_object(
                 'Content-Type',  'application/json',
                 'x-worker-token',
                 (select decrypted_secret from vault.decrypted_secrets
                   where name = 'meter_worker_token')),
    body    := '{}'::jsonb
  );
  $$
);
```

### If you would rather not use pg_cron at all

Nothing about this depends on it. The worker is an HTTP endpoint that takes a
header, so any scheduler works — a GitHub Actions cron, a Vercel cron job,
even cron-job.org:

```bash
curl -X POST "https://<project-ref>.supabase.co/functions/v1/partner-meter-redemptions" -H "x-worker-token: <METER_WORKER_TOKEN>"
```

Deliberately on one line. In PowerShell a trailing `\` is not a line
continuation — curl reads it as a second URL and answers
`curl: (3) URL rejected: Bad hostname` *after* having already run the real
request, so you get a valid response and an error together and it looks like
the call failed when it did not. On Windows, call `curl.exe` explicitly too:
Windows PowerShell 5.1 aliases `curl` to `Invoke-WebRequest`, which does not
understand `-X` or `-H` at all.

The tradeoff is that a scheduler living outside Supabase is one more thing that
can quietly stop without anyone noticing. Whatever you pick, alert on it.

### Checking it is actually working

Run these in the SQL Editor. Each one is shown with the output you should get
when everything is fine.

**Does the job exist, and is it on?**

```sql
select jobname, schedule, active from cron.job;
```

```
jobname                      | schedule      | active
-----------------------------+---------------+-------
meter-date-pass-redemptions  | */15 * * * *  | true
```

**Has it been firing?**

```sql
select status, return_message, start_time
from cron.job_run_details
where jobid = (select jobid from cron.job where jobname = 'meter-date-pass-redemptions')
order by start_time desc limit 10;
```

```
status     | return_message | start_time
-----------+----------------+----------------------------
succeeded  | SELECT 1       | 2026-08-24 18:45:00.213+00
succeeded  | SELECT 1       | 2026-08-24 18:30:00.198+00
succeeded  | SELECT 1       | 2026-08-24 18:15:00.221+00
```

Rows exactly 15 minutes apart. `return_message` is a bare command tag and is
**not** the function's reply — there is nothing to learn from it.

**Is the ledger draining?**

```sql
select count(*), min(redeemed_at)
from date_pass_redemptions where bill_status = 'pending';
```

```
count | min
------+----------------------------
0     | null
```

Non-zero is fine as long as `min` is inside the last 15 minutes — that is just
redemptions that happened since the last run.

### The one that actually proves it

**`succeeded` above does not mean the HTTP request worked.** `net.http_post` is
asynchronous: it queues the request and returns a request id immediately, so
the SQL statement completes whether the edge function answers 200, 401, or
never answers at all. A wall of green `succeeded` rows is perfectly compatible
with every single call being rejected. This is the failure mode that will waste
your afternoon, so check the response table too:

```sql
select id, status_code, error_msg, created,
       left(content, 200) as content
from net._http_response
order by created desc limit 10;
```

```
id   | status_code | error_msg | created                     | content
-----+-------------+-----------+-----------------------------+----------------------------------------
1043 | 200         | null      | 2026-08-24 18:45:01.402+00  | {"reported":2,"failed":0,"errors":[]}
1042 | 200         | null      | 2026-08-24 18:30:01.377+00  | {"reported":0,"failed":0,"note":"nothing outstanding"}
```

`"reported": 0` with `"nothing outstanding"` is a quiet fifteen minutes, not a
fault. Note that pg_net **purges these rows after 6 hours**, so an empty result
may only mean you are looking the morning after.

Do not wait a quarter of an hour to find out. Fire it by hand immediately after
scheduling — run the same `select net.http_post(...)` on its own, wait five
seconds, then read `net._http_response`.

### What the failures look like

| You see | It means |
| --- | --- |
| No rows in `cron.job` | Never created, or created against a different project |
| `active = false` | Exists but is paused |
| No `job_run_details` rows | Hasn't fired yet — wait for the next :00/:15/:30/:45 |
| `failed` · `schema "net" does not exist` | `pg_net` was never enabled |
| `failed` · `permission denied for schema net` | Enabled, but not granted to the job's role |
| All `succeeded`, but `pending` keeps growing | The async trap — go read `net._http_response` |
| `status_code 401` · `{"error":"Not authorised."}` | The token in the cron job ≠ `METER_WORKER_TOKEN` on the function |
| `status_code 409` · `"Metering is not configured."` | `METER_WORKER_TOKEN` is not set on the function at all |
| `status_code 409` · `"No metered price configured"` | `platform_billing.stripe_metered_price_id` is still null |
| `status_code 404` | Wrong project ref or function name in the URL |
| `timed_out = true` | Cold start. Fine occasionally, investigate if constant |
| `net._http_response` empty, cron succeeded | Probably just the 6-hour purge — look right after a run |

### What to alert on

Stripe refuses meter events older than 35 days. `redemptions_awaiting_meter()`
stops offering anything older than 30, so a redemption that has failed to
report for a month stops being retried and needs looking at rather than
silently going round forever.

The pending query is the one to wire an alert to: **if the oldest `pending` row
is more than a day old, the worker is not running.** Every hour it stays that
way is revenue that eventually cannot be billed at all, and nothing else in the
product will look wrong while it happens — partners keep scanning, students
keep getting passes, and the money quietly stops.

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
