/**
 * ── The performance fee, built but switched off ─────────────────────────────
 *
 * "$199/month + $5 per verified date" is a plausible future for Loose Leaf,
 * and retrofitting metering onto live subscriptions is genuinely painful — so
 * the path exists. It is deliberately behind three separate locks, and all
 * three have to be opened by hand:
 *
 *   1. `partner_plans.per_verified_date_cents` above zero
 *   2. `partner_plans.stripe_metered_price_id` pointing at a real metered price
 *   3. `partner_subscriptions.metered_started_at` set for that partner
 *
 * Any one of them missing and this function reports nothing for that partner.
 * Nobody gets a surprise line on an invoice because a row was edited.
 *
 * Run it on a schedule (pg_cron → net.http_post, or any external scheduler)
 * once a day. It reports yesterday's verified dates as usage; the counts come
 * from `date_pass_redemptions`, which is the same table the partner's own
 * dashboard shows, so an invoice can always be reconciled against it.
 *
 * Deploy with --no-verify-jwt and protect it with REPORT_USAGE_TOKEN.
 */

import { stripe, serviceClient, json } from '../_shared/stripe.ts'

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405)

  const expected = Deno.env.get('REPORT_USAGE_TOKEN')
  if (!expected) return json({ error: 'Usage reporting is not configured.' }, 409)
  if (req.headers.get('x-report-token') !== expected) return json({ error: 'Not authorised.' }, 401)

  const db = serviceClient()

  const now = new Date()
  const dayEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const dayStart = new Date(dayEnd.getTime() - 86_400_000)

  const { data: subs, error } = await db
    .from('partner_subscriptions')
    .select('partner_id, stripe_subscription_id, metered_started_at, plan:partner_plans(id, per_verified_date_cents, stripe_metered_price_id)')
    .not('metered_started_at', 'is', null)
    .in('status', ['active', 'trialing'])

  if (error) return json({ error: error.message }, 500)

  const reported: string[] = []
  const skipped: string[] = []

  for (const sub of subs ?? []) {
    const plan = sub.plan as { per_verified_date_cents?: number; stripe_metered_price_id?: string } | null

    // All three locks, checked again here rather than trusted from the query.
    if (!plan?.per_verified_date_cents || !plan.stripe_metered_price_id || !sub.stripe_subscription_id) {
      skipped.push(sub.partner_id)
      continue
    }

    const { count } = await db
      .from('date_pass_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('partner_id', sub.partner_id)
      .gte('redeemed_at', dayStart.toISOString())
      .lt('redeemed_at', dayEnd.toISOString())

    if (!count) continue

    try {
      const full = await stripe.subscriptions.retrieve(sub.stripe_subscription_id)
      const item = full.items.data.find((i) => i.price?.id === plan.stripe_metered_price_id)
      if (!item) {
        skipped.push(sub.partner_id)
        continue
      }

      await stripe.subscriptionItems.createUsageRecord(
        item.id,
        {
          quantity: count,
          timestamp: Math.floor(dayStart.getTime() / 1000),
          action: 'set',
        },
        // Same day reported twice is the same record, not two.
        { idempotencyKey: `ll-usage-${sub.partner_id}-${dayStart.toISOString().slice(0, 10)}` }
      )
      reported.push(sub.partner_id)
    } catch {
      skipped.push(sub.partner_id)
    }
  }

  return json({ day: dayStart.toISOString().slice(0, 10), reported, skipped })
})
