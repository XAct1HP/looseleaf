/**
 * ── Telling somebody they were invited ──────────────────────────────────────
 *
 * Until this existed, adding a person to a business created a row and then
 * nothing happened. The invitee was never told, so the only channel that
 * actually reached them was their manager remembering to say it out loud —
 * and the person with the least context on the product was the one the whole
 * flow assumed the most about. (That is the same shape as the login bug in
 * 20260826120000 and the manifest bug before it. It keeps happening because
 * the newest person's path is the one nobody walks.)
 *
 * Three deliberate properties:
 *
 *   **It is not allowed to fail the invitation.** The invite is already saved
 *   by the time this runs. Mail is best-effort and says so in its response —
 *   `{ sent: false, reason }` is a normal answer, and the Team page reads it
 *   and tells the inviter to pass the word along themselves. A bounced email
 *   must never look like "adding them didn't work."
 *
 *   **It knows nothing the caller didn't.** `partner_invite_notice()` is gated
 *   on the same team permission that created the invitation and hands back an
 *   address, a role, a business name and an expiry. There is no token in the
 *   email and no token in this function: the link goes to the ordinary login
 *   page, and the invitation is still accepted against the address in the
 *   invitee's own token on the other side of it. Forwarding the mail achieves
 *   exactly nothing, which is the property worth protecting.
 *
 *   **It writes nothing.** No "notified_at" column, because a send that half
 *   worked should not leave a record saying it did. Sending again is safe and
 *   the invitee just gets another copy.
 *
 * Secrets, on top of the ones every function gets:
 *   RESEND_API_KEY   re_…      the same Resend account that sends auth mail
 *   RESEND_FROM      optional  defaults to "Loose Leaf <partners@hellolooseleaf.com>"
 *
 * With no key set this returns `{ sent: false, reason: 'not_configured' }` and
 * the UI degrades to the old behaviour — which is the honest failure mode for
 * a deployment that hasn't finished setting mail up yet.
 */

import { callerClient, json, CORS, defaultReturnTo } from '../_shared/edge.ts'

const RESEND_KEY = Deno.env.get('RESEND_API_KEY') ?? ''
const FROM = Deno.env.get('RESEND_FROM') ?? 'Loose Leaf <partners@hellolooseleaf.com>'

/** What each role is actually for, in the words the Team page uses. */
const ROLE_BLURB: Record<string, string> = {
  staff: 'scan Loose Leaf Date Passes at the counter',
  manager: 'scan Date Passes and manage who else can',
  owner: 'run the Loose Leaf account, including billing',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return json({ error: 'POST only.' }, 405)

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return json({ error: 'Expected JSON.' }, 400)
  }

  const inviteId = String(body.invite_id ?? '')
  if (!inviteId) return json({ error: 'invite_id is required.' }, 400)

  const authHeader = req.headers.get('Authorization') ?? ''
  if (!authHeader) return json({ error: 'Not signed in.' }, 401)

  // The permission check *is* this call: `partner_invite_notice` refuses
  // anybody without the team page, running as the caller under their own
  // policies. There is no second, weaker check here to get out of step
  // with it.
  const supabase = callerClient(authHeader)
  const { data, error } = await supabase.rpc('partner_invite_notice', { p_invite: inviteId })
  if (error) return json({ error: error.message }, 403)

  const notice = Array.isArray(data) ? data[0] : data
  if (!notice?.invite_email) return json({ error: 'That invitation is no longer open.' }, 404)

  if (!RESEND_KEY) return json({ sent: false, reason: 'not_configured' })

  const site = defaultReturnTo() || 'https://hellolooseleaf.com'
  const role = String(notice.invite_role ?? 'staff')

  // Staff are handed straight to the scanner with the install walkthrough
  // open, because for them that *is* the product and the counter phone is
  // where they'll be standing. Everyone else gets the dashboard's own
  // landing logic.
  const link =
    role === 'staff'
      ? `${site}/partners/login?next=${encodeURIComponent('/partners/dashboard/scan?install=1')}`
      : `${site}/partners/login`

  const business = String(notice.partner_name ?? 'a Loose Leaf partner')
  const address = String(notice.invite_email)
  const blurb = ROLE_BLURB[role] ?? 'help run this business on Loose Leaf'

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${RESEND_KEY}`,
        'Content-Type': 'application/json',
        // The invitation row is the unit of work, so re-sending the same
        // invitation inside Resend's dedup window is one email rather than
        // two — a manager pressing the button twice is not a reason to
        // arrive twice in somebody's inbox.
        'Idempotency-Key': `partner-invite-${inviteId}`,
      },
      body: JSON.stringify({
        from: FROM,
        to: [address],
        subject: `${business} added you on Loose Leaf`,
        text: textBody({ business, blurb, address, link }),
        html: htmlBody({ business, blurb, address, link }),
      }),
    })

    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      // Reported, not raised. The caller's invitation is fine and the caller
      // needs to know one specific thing: that they have to tell this person
      // themselves.
      return json({ sent: false, reason: 'send_failed', detail: detail.slice(0, 300) })
    }

    return json({ sent: true, to: address })
  } catch (e) {
    return json({ sent: false, reason: 'send_failed', detail: (e as Error).message })
  }
})

type Parts = { business: string; blurb: string; address: string; link: string }

/**
 * Plain text first, and not as an afterthought — a good half of the people
 * this reaches are opening it on a phone behind a counter, and the shortest
 * version of it has to make sense on its own.
 */
function textBody({ business, blurb, address, link }: Parts) {
  return [
    `${business} added you to their Loose Leaf account.`,
    '',
    `Loose Leaf is a dating app for the local campus. When two students plan a date,`,
    `it suggests places to go — and ${business} is one of them. Your part is to ${blurb}.`,
    '',
    `To get in, open this link and enter ${address}:`,
    link,
    '',
    `We'll email you a short code. There is no password, and there is no account`,
    `for you to create — that address is already expected.`,
    '',
    `If you're reading this on the phone you'll use at the counter, open it there:`,
    `it'll offer to add the scanner to your home screen, which is the whole setup.`,
    '',
    `Didn't expect this? Ignore it. Nothing happens until somebody logs in.`,
  ].join('\n')
}

/**
 * Inline styles and a table-free layout on purpose. This is read in Gmail, in
 * Outlook, and in whatever is on an eight-year-old counter iPad, and none of
 * them agree about anything except inline CSS on block elements.
 */
function htmlBody({ business, blurb, address, link }: Parts) {
  const esc = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

  return `<div style="margin:0;padding:32px 20px;background:#FFF6EB;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;color:#566070;line-height:1.6;">
  <div style="max-width:480px;margin:0 auto;background:#FFFDF8;border:1px solid #EDE7DC;border-radius:20px;padding:32px 28px;">
    <p style="margin:0 0 22px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#8B93A3;">Loose Leaf for Partners</p>

    <h1 style="margin:0 0 16px;font-size:24px;line-height:1.25;color:#111C38;font-weight:600;">${esc(business)} added you on Loose Leaf.</h1>

    <p style="margin:0 0 16px;font-size:15px;">Loose Leaf is a dating app for the local campus. When two students plan a date it suggests real places to go, and ${esc(business)} is one of them. Your part is to ${esc(blurb)}.</p>

    <p style="margin:0 0 24px;font-size:15px;">Log in with <strong style="color:#111C38;">${esc(address)}</strong> and we'll email you a short code. There's no password, and nothing for you to sign up for &mdash; that address is already expected.</p>

    <a href="${esc(link)}" style="display:inline-block;background:#FF6468;color:#FFFDF8;text-decoration:none;font-size:16px;font-weight:600;padding:14px 26px;border-radius:14px;">Log in to ${esc(business)}</a>

    <p style="margin:24px 0 0;padding-top:20px;border-top:1px solid #EDE7DC;font-size:13.5px;color:#8B93A3;">Reading this on the phone you'll use at the counter? Open it there &mdash; it'll offer to add the scanner to your home screen, and that's the whole setup.</p>

    <p style="margin:14px 0 0;font-size:13.5px;color:#8B93A3;">Didn't expect this? Ignore it. Nothing happens until somebody logs in.</p>
  </div>
</div>`
}
