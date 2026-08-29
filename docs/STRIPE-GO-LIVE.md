# Going live on Stripe

Nothing in this repo knows what mode it is in. There is no `if (test)` anywhere,
no key in the front end, and no price hard-coded in a component — the app reads
`platform_billing` for the price and the edge functions read one secret key.
Which means **the entire cutover is: recreate four objects in live mode, swap
two secrets, repoint one database row, and clear the test-mode ids out of the
tables that cached them.**

An hour, unhurried. One of the steps silently breaks everything if you do half
of it, and it is flagged where it comes up (§6).

Read this alongside [STRIPE-PAY-PER-REDEMPTION.md](STRIPE-PAY-PER-REDEMPTION.md),
which explains *why* the billing model is shaped the way it is. This file is
only the move from sandbox to live.

---

## 0 · Before you touch Stripe

- **Activate the account.** Settings → Business → real business details, a bank
  account for payouts, and tax details. Live keys exist but nothing settles
  until activation is complete, and Stripe will ask for things (EIN, bank) that
  take a day if you don't have them to hand. Do this first, not at step 6.
- **Set the statement descriptor.** Settings → Business → Public details. This
  is the string a restaurant owner sees on their card statement four weeks after
  they last thought about Loose Leaf. Make it something they'll recognise —
  `LOOSELEAF` — because a descriptor nobody recognises is a chargeback.
- **Set the branding.** Settings → Business → Branding: logo, the coral, the
  business name. It's what the billing portal and every invoice email wear, and
  it is the only part of Loose Leaf a partner's bookkeeper ever sees.
- **Know which sandbox you tested in.** Stripe's *test mode sandbox* shares many
  Dashboard settings with live mode; a *named sandbox* isolates them completely.
  So some of §4 may already be right and some may be untouched, and there is no
  way to tell by looking. Verify all of §4 in live regardless of what you
  remember setting.
- **Don't delete the sandbox or its test data.** It costs nothing to keep and
  it's where you'll reproduce the next billing bug.

---

## 1 · What carries over

Nothing. That is worth being blunt about, because "switch the key" is the
intuition and it is wrong:

| Thing | Comes across? |
| --- | --- |
| Your code | **Yes** — unchanged. Nothing in the repo names a mode. |
| Products and prices | No. Recreate, or use **Copy to live mode** (§3). |
| Billing meters | No. Recreate by hand — there is no copy button. |
| Customers, subscriptions, payment methods | **No, and they cannot be migrated.** |
| Webhook endpoints and signing secrets | No. New endpoint, new `whsec_`. |
| API keys | No. |
| Customer portal configuration | No — it is per mode. |
| Retries, dunning, invoice emails | Shared with the *test mode* sandbox, isolated from a *named* sandbox. Verify. |

> Stripe: *"All Stripe API requests occur in either a sandbox or live mode. API
> objects in one mode aren't accessible to the other."*

The consequence that bites: every `stripe_customer_id` and
`stripe_subscription_id` currently sitting in `partner_subscriptions` is a
test-mode id. Under a live key they resolve to nothing, and the failure looks
like "Stripe is broken" rather than "that customer was never real". §7 clears
them.

---

## 2 · Create the live meter

Flip the Dashboard out of the sandbox — the account picker, top left. Everything
from here is in **live mode**; check the banner is gone before each step.

**Billing → Meters → Create meter.**

| Field | Value |
| --- | --- |
| Meter name | `Date Pass redemptions` |
| Event name | `date_pass_redemption` |
| Aggregation | **Sum** |
| Value field | `value` |
| Customer mapping field | `stripe_customer_id` |

The event name must match `platform_billing.stripe_meter_event_name` **exactly**.
Check what is actually in there rather than trusting this file:

```sql
select stripe_meter_event_name, redemption_fee_cents, stripe_metered_price_id
from platform_billing;
```

A mismatch produces `v1.billing.meter.no_meter_found` and bills nobody, quietly.
That is what the second webhook endpoint in §5 is for.

Copy the meter id (`mtr_…`).

---

## 3 · Create the live product and metered price

Two ways, both fine.

**Copy it.** Open the product in the sandbox → **Copy to live mode**, top right.
Prices come with it. Then **open the copied price in live mode and confirm it is
bound to the live meter you just made.** A usage-based price is only meaningful
with a meter behind it, and a copied price that lost its meter looks completely
normal until the first invoice comes out at $0.

**Or build it.** Product catalogue → Add product:

| Field | Value |
| --- | --- |
| Name | `Loose Leaf Date Pass redemptions` |
| Description | `$1.50 per Date Pass redeemed at your business` |
| Pricing model | **Usage-based** → per unit |
| Price | `1.50 USD` per unit |
| Billing period | **Monthly** |
| Meter | the meter from §2 |

Flat per-unit only — no graduated or volume tiers. The credit ceiling in the
database prices exposure at a flat `fee_cents`, and tiers would make the two
disagree about what a partner owes. No separate $0/month flat price either; a
subscription carrying one metered item is already $0 until usage arrives, and a
second line would print a zero row on every invoice for no reason.

Copy the price id (`price_…`). It is the one thing from Stripe that ends up in
the database.

---

## 4 · The settings that are per-mode

**Billing → Revenue recovery → Retries**

| Setting | Value |
| --- | --- |
| Smart Retries | On (8 attempts over 2 weeks is the default and is fine) |
| After all retries fail | **Mark the subscription as unpaid** — never *cancel* |
| Email customers about failed payments | On |

Cancelling destroys your ability to bill that customer again and takes their
invoice history with it. `unpaid` keeps the customer, keeps generating draft
invoices, and lets them come back and pay; the webhook reads three consecutive
failures as a suspension and pauses Date Passes, and paying lifts it by itself.

**Billing → Invoices.** Turn on emailing finalised invoices and receipts. In a
sandbox Stripe sends no email at all, so this is untested by definition and it
is now the *only* thing a partner hears about money — there is no monthly charge
for them to notice.

**Settings → Billing → Customer portal**

| Option | Set to |
| --- | --- |
| Update payment method | **On** — the portal's whole job now |
| Invoice history | On |
| Billing address / tax id | On |
| **Switch plans** | **Off** |
| Cancel subscription | Off |

There is one price. A "change plan" button leading to a single option reads as a
bug. And a partner who wants to stop should pause their offers — charges stop
that day and their free listing stays up — rather than cancel the subscription,
which removes the card and with it their ability to run any offer at all.

---

## 5 · The live webhook endpoint

**Developers → Webhooks → Add endpoint**, in live mode.

```
https://<project-ref>.supabase.co/functions/v1/stripe-webhook
```

Events:

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

If the endpoint form offers an API version, pin it to **2024-06-20** — that is
what `supabase/functions/_shared/stripe.ts` pins the client to, and matching the
two means the payload shapes the handler reads are the ones Stripe sends.

Then a **second, thin endpoint** on the same URL for meter failures:

```
v1.billing.meter.error_report_triggered
v1.billing.meter.no_meter_found
```

These are how you find out redemptions are being reported and landing nowhere.
Without them that failure is invisible from every screen in the product.

Copy the new signing secret (`whsec_…`). It is **not** the sandbox one.

---

## 6 · Swap the secrets

Four values, and only these four. Note where each one lives, because two of them
live in two places:

| Secret | Lives in | New value |
| --- | --- | --- |
| `STRIPE_SECRET_KEY` | Supabase → Edge Functions → Secrets | `sk_live_…` |
| `STRIPE_WEBHOOK_SECRET` | same | the `whsec_…` from §5 |
| `PARTNER_SITE_URL` | same | `https://hellolooseleaf.com` first in the list |
| `METER_WORKER_TOKEN` | same **and** the cron job / Vault | rotate it — a new long random string |

Set them from the env file rather than from the command line. It already
exists with these four keys in it, it is gitignored by name — the repo is
public, and `sk_live_` in a shell history is one `history | grep` away from
being somewhere it shouldn't be.

Open `supabase/functions/.env`, replace the four values, then:

```powershell
supabase secrets set --env-file supabase/functions/.env
```

Then redeploy, one command per line:

```powershell
supabase functions deploy partner-billing-setup
supabase functions deploy partner-billing-sync
supabase functions deploy partner-portal
supabase functions deploy partner-meter-redemptions --no-verify-jwt
supabase functions deploy stripe-webhook --no-verify-jwt
```

> **On Windows, don't paste a multi-line command with `\` at the end of each
> line.** That is a bash line continuation and PowerShell has never heard of
> it — it hands the backslash to the program as an argument and runs each line
> as its own command. And `<like this>` is worse than a placeholder here: `<`
> and `>` are reserved redirection operators, so PowerShell refuses the line
> before it gets as far as noticing the value is fake. If you do want it
> inline, put it on **one** line with real values:
>
> ```powershell
> supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx STRIPE_WEBHOOK_SECRET=whsec_xxx PARTNER_SITE_URL=https://hellolooseleaf.com METER_WORKER_TOKEN=paste-the-token-here
> ```

**Nothing changes on Vercel.** There is no Stripe key in the front end, not even
a publishable one — the whole reason the edge functions exist. Don't go looking
for an env var to change there.

> ### The two halves of the key swap must happen together
>
> This is the step that breaks everything quietly, so it is worth walking
> through: swap `STRIPE_SECRET_KEY` to live and leave `STRIPE_WEBHOOK_SECRET`
> on the sandbox one, and live events arrive at the endpoint, fail signature
> verification, and get a 400. `stripe-webhook` is what writes
> `partner_subscriptions.payment_method_at`, and `partner_has_card()` reads
> that column and nothing else. So a real restaurant adds a real card, Stripe
> shows a real customer with a real payment method — and Loose Leaf still says
> "add a card first" when they try to publish an offer. Nothing on any screen
> points at the webhook.
>
> After the swap, check **Developers → Webhooks → your endpoint → attempts**.
> Every event should be a 200. A wall of 400s is the wrong signing secret.

If you'd rather not put a full `sk_live_` key in a function, a **restricted key**
works. It needs write on Customers, Subscriptions, Billing meters, and Customer
portal, and read on Invoices, Prices, Products, and Payment methods. Fewer
things to regret if it ever leaks.

`METER_WORKER_TOKEN` is the one people get half-right, every time: the cron job
**sends** it as `x-worker-token`, the function **checks** it, and they are stored
in two different places. If you rotate it in one and not the other, metering
401s and the ledger stops draining while everything else looks perfect. Update
the Vault secret in the same sitting:

The secret is almost certainly already there from the sandbox, and
`create_secret` on a name that exists fails with `duplicate key value violates
unique constraint "secrets_name_idx"` — it is a create, not an upsert. Look
first, then take the branch you're on:

```sql
select id, name from vault.secrets where name = 'meter_worker_token';
```

```sql
-- it exists → update it in place
select vault.update_secret(
  (select id from vault.secrets where name = 'meter_worker_token'),
  'paste-the-new-token-here');

-- no row → create it
select vault.create_secret('paste-the-new-token-here', 'meter_worker_token');
```

Then confirm the value that landed is the one you think it is:

```sql
select name, decrypted_secret = 'paste-the-new-token-here' as matches
from vault.decrypted_secrets where name = 'meter_worker_token';
```

And confirm the cron job actually *reads* Vault rather than carrying the old
token as literal text — if it does, updating Vault changes nothing:

```sql
select jobname, command from cron.job where jobname = 'meter-date-pass-redemptions';
```

The command should contain a `select decrypted_secret from
vault.decrypted_secrets` subquery. If instead you can read the token with your
own eyes, re-run `cron.schedule` with the Vault version from
STRIPE-PAY-PER-REDEMPTION §5 — same job name overwrites.

The cron job itself doesn't change if it already reads from Vault (see
STRIPE-PAY-PER-REDEMPTION §5). If it has the old token inline as literal text,
this is the moment to move it into Vault — in live it is a real credential in a
table anything with database access can read.

---

## 7 · The database cutover

Run this **once**, at the moment you swap the keys, in the SQL editor. It does
two things: points billing at the live price, and forgets every Stripe object
that only ever existed in a sandbox.

```sql
begin;

-- a) the live price, and the numbers that must agree with it
update platform_billing
   set stripe_metered_price_id = 'price_LIVE_XXXXXXXXXXXX',
       stripe_meter_event_name = 'date_pass_redemption',
       redemption_fee_cents    = 150,
       updated_at              = now()
 where id;

-- b) every cached Stripe id is a test-mode id. Under a live key they are
--    references to nothing, and the errors they produce name Stripe rather
--    than naming this.
update partner_subscriptions
   set stripe_customer_id     = null,
       stripe_subscription_id = null,
       status                 = 'incomplete',
       plan_id                = 'free',
       current_period_end     = null,
       latest_invoice_status  = null,
       metered_started_at     = null,
       payment_method_brand   = null,
       payment_method_last4   = null,
       payment_method_type    = null,
       payment_method_at      = null,
       billing_email          = null,
       updated_at             = now();

-- c) nothing scanned while testing may ever be charged to anybody. Waived
--    keeps the redemption for attribution and takes it out of the money.
update date_pass_redemptions
   set bill_status        = 'waived',
       fee_cents          = 0,
       meter_identifier   = null,
       metered_at         = null,
       stripe_invoice_id  = null
 where bill_status <> 'waived';

-- d) the credit ladder starts again. Tiers are earned by paid invoices, and
--    no invoice anybody paid in a sandbox counts.
update partner_credit
   set tier_id              = 'new',
       limit_override_cents = null,
       rate_override_cents  = null,
       paid_invoice_count   = 0,
       paid_cents_total     = 0,
       consecutive_failures = 0,
       last_paid_at         = null,
       last_failure_at      = null,
       suspended_at         = null,
       suspend_reason       = null,
       updated_at           = now();

commit;
```

Then confirm nothing is left pointing at the sandbox:

```sql
select count(*) as stale_ids from partner_subscriptions
 where stripe_customer_id is not null or stripe_subscription_id is not null;
-- 0

select bill_status, count(*) from date_pass_redemptions group by 1;
-- only 'waived'

select stripe_metered_price_id from platform_billing;
-- price_LIVE_…
```

**Every partner has to add their card again.** There is no way around it — a
payment method is a live-mode object and cannot be created from a test one. This
is painless today because the only businesses in there are yours. It is the
reason to do this *before* the ten emails go out, not after.

---

## 8 · Prove it, with real money

Test clocks don't exist in live mode, so you cannot fast-forward to an invoice.
The substitute is to finalise the draft invoice by hand. Use your own business
and your own card; the whole run costs $1.50 and you refund it at the end.

1. **Register a business** from `/partners`, approve it in Backstage. It should
   be live to students **with no card at all** — if it isn't, `partner_is_live()`
   is wrong and nothing below matters.
2. **Try to publish an offer** → refused, "add a card first".
3. **Add a real card** in Billing. Then check three things in this order:
   Stripe shows a customer with a $0/month subscription carrying one metered
   item; the webhook attempt for `payment_method.attached` is a **200**; and
   ```sql
   select payment_method_brand, payment_method_last4, payment_method_at
   from partner_subscriptions where partner_id = '<uuid>';
   ```
   has filled in. If the first is true and the third isn't, go back to §6.
4. **Publish the offer**, unlock a pass as a student, scan it at the counter.
   ```sql
   select bill_status, fee_cents from date_pass_redemptions
    order by redeemed_at desc limit 1;   -- pending, 150
   ```
5. **Fire the metering worker by hand** rather than waiting a quarter of an hour:
   ```bash
   curl -X POST "https://<project-ref>.supabase.co/functions/v1/partner-meter-redemptions" -H "x-worker-token: <METER_WORKER_TOKEN>"
   ```
   → `{"reported":1,...}`, the row goes to `metered`, and the meter in Stripe
   shows one event under that customer. (One line on purpose. In PowerShell call
   `curl.exe`, and never break the line with a `\`.)
6. **Finalise the draft invoice by hand.** Billing → Invoices → the draft on that
   customer → Finalise, then Charge. → a $1.50 invoice paid by your own card;
   `invoice.finalized` stamps `stripe_invoice_id` onto the redemption,
   `invoice.paid` flips it to `paid`, and the partner moves to **Established**.
7. **Refund it** and delete the test offer. Then clear the run so it isn't in
   your first real month's numbers:
   ```sql
   select staff_waive_redemption('<redemption-uuid>');
   ```
8. **Check the cron job is actually running in live**, because it is the thing
   most likely to have been left pointing at nothing:
   ```sql
   select jobname, schedule, active from cron.job;
   select id, status_code, left(content, 120), created
   from net._http_response order by created desc limit 5;
   ```
   `succeeded` in `cron.job_run_details` does **not** mean the request worked —
   `net.http_post` is asynchronous and the SQL succeeds whether the function
   answers 200, 401, or never. The response table is the one that tells the
   truth, and pg_net purges it after 6 hours.

---

## 9 · The first fortnight

Three things can be wrong for a week without anything on any screen looking
wrong. All three are one query.

```sql
-- 1. Is the metering worker alive? If the oldest pending row is more than a
--    day old, it is not. Stripe refuses meter events older than 35 days, so
--    every hour this stays broken is revenue that eventually cannot be billed.
select count(*), min(redeemed_at) from date_pass_redemptions
 where bill_status = 'pending';

-- 2. What is owed, and what has gone bad?
select staff_partner_revenue() -> 'outstanding_cents',
       staff_partner_revenue() -> 'at_risk_cents';

-- 3. Who is close to their ceiling? A partner at the limit stops being
--    offered to students and will never think to tell you.
select * from staff_partner_credit() order by unbilled_cents desc limit 10;
```

And in Stripe: **Developers → Webhooks → the endpoint**, once a week. A rising
error count there is the earliest warning of everything else in this file.

---

## 10 · If it goes wrong

The cutover is reversible in about two minutes, because nothing real has
happened yet.

1. Put the sandbox `sk_test_…` and its `whsec_…` back with `supabase secrets set`.
2. Set `platform_billing.stripe_metered_price_id` back to the sandbox price.
3. Re-run §7 (b) and (c) to clear whatever live objects got made.

What you cannot undo is a charge to a real business, which is why §8 uses your
own card and why nobody else is invited until it passes. If a partner ever gets
billed wrongly, `staff_waive_redemption()` takes it off their bill without
destroying the attribution, and refunding the invoice in Stripe is the other
half.
