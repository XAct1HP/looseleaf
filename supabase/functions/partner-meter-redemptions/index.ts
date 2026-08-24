/**
 * ── Telling Stripe what to bill for ─────────────────────────────────────────
 *
 * Replaces `partner-report-usage`. That function reported a daily *count*
 * against a legacy usage record; this one reports individual redemptions to a
 * billing meter, because the unit of billing is now a single scan.
 *
 * The important design decision is that this runs *after* the fact rather
 * than inside `redeem_date_pass()`. Postgres cannot call Stripe, and it
 * shouldn't want to: a student standing at a counter must not wait on
 * api.stripe.com, and a Stripe outage must not stop a date. So the database
 * is the ledger and Stripe is told afterwards, on a schedule.
 *
 * That ordering is also what makes an invoice reconcilable. Every billable
 * unit exists as a row in `date_pass_redemptions` before Stripe hears about
 * it, with the fee it was stamped at, so a partner disputing a bill can be
 * walked through the same list their own dashboard shows them.
 *
 * Exactly-once is enforced twice over:
 *   · `bill_status` only moves pending → metered, in a single UPDATE.
 *   · The meter event carries an `identifier` derived from the row id, which
 *     Stripe deduplicates on its side. A crash between the two is safe: the
 *     rerun sends the same identifier and Stripe counts it once.
 *
 * Run it every 10–15 minutes so a partner's outstanding balance — and with it
 * their credit headroom — stays close to live. Hourly is fine too; the
 * credit ceiling is computed from the database, not from Stripe, so a late
 * meter event delays the invoice line, never the enforcement.
 *
 * Deploy with --no-verify-jwt and protect it with METER_WORKER_TOKEN:
 *   supabase functions deploy partner-meter-redemptions --no-verify-jwt
 */

import { serviceClient, meterEvent, billingConfig, json } from '../_shared/stripe.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405)

  const expected = Deno.env.get('METER_WORKER_TOKEN')
  if (!expected) return json({ error: 'Metering is not configured.' }, 409)
  if (req.headers.get('x-worker-token') !== expected) return json({ error: 'Not authorised.' }, 401)

  const db = serviceClient()

  const config = await billingConfig(db)
  if (!config?.stripe_metered_price_id) {
    return json({ error: 'No metered price configured; nothing was reported.' }, 409)
  }

  const { data: rows, error } = await db.rpc('redemptions_awaiting_meter', { p_limit: 500 })
  if (error) return json({ error: error.message }, 500)
  if (!rows?.length) return json({ reported: 0, failed: 0, note: 'nothing outstanding' })

  const done: { id: string; identifier: string }[] = []
  const failed: { id: string; error: string }[] = []

  for (const row of rows) {
    try {
      await meterEvent({
        eventName: config.stripe_meter_event_name,
        customerId: row.customer_id,
        // One redemption, one unit. The price carries the $1.50, so changing
        // what a redemption costs is a Stripe price change and a
        // `platform_billing` update — never a different number sent here.
        value: 1,
        identifier: row.meter_identifier,
        at: new Date(row.redeemed_at),
      })
      done.push({ id: row.id, identifier: row.meter_identifier })
    } catch (e) {
      // One partner's bad customer id must not stop everybody else's billing.
      // The row stays `pending` and the next run picks it up.
      failed.push({ id: row.id, error: (e as Error).message })
    }
  }

  if (done.length) {
    const { error: markError } = await db.rpc('mark_redemptions_metered', {
      p_ids: done.map((d) => d.id),
      p_identifiers: done.map((d) => d.identifier),
    })
    // Reported to Stripe but not marked here is the one genuinely awkward
    // state, so it is loud rather than silent. The rerun is still safe —
    // Stripe dedupes on the identifier — but somebody should know.
    if (markError) {
      return json(
        { reported: done.length, failed: failed.length, error: `metered but not marked: ${markError.message}` },
        500
      )
    }
  }

  return json({
    reported: done.length,
    failed: failed.length,
    // Truncated: a run that fails for everybody would otherwise return a
    // response the size of the ledger.
    errors: failed.slice(0, 10),
  })
})
