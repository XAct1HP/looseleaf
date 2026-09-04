import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PartnerShell from '../../components/partners/PartnerShell'
import DatePassCard from '../../components/dates/DatePassCard'
import Button from '../../components/ui/Button'
import { IconCheck } from '../../components/ui/Icons'
import { Underline } from '../../components/brand/Doodles'
import * as partners from '../../services/partners'
import { fee } from '../../lib/partnerBilling'

/**
 * ── The page you send somebody before they sign anything ────────────────────
 *
 * Every partner conversation so far has ended the same way: they're
 * interested, and then they ask a version of "so what actually happens?" —
 * and answering it in an email produces a wall of text nobody forwards to the
 * person who will actually be scanning the passes.
 *
 * So this is that answer, on one page, in order. It is deliberately *not* a
 * pitch: there is no case for partnering here, no numbers, and no suggestion
 * about what anybody's offer should be. A business owner works that out from
 * their own room and their own slow nights, and the fastest way to lose them
 * is to arrive with opinions about how they should run their counter. What
 * they need from us is the mechanism, stated once, clearly enough to forward.
 *
 * Two rules for anyone editing it:
 *
 *   **It is generic on purpose.** It gets sent to every prospective partner,
 *   so nothing here names a business, a category or a city. A page tailored to
 *   one venue is a page that has to be rewritten for the next one, and the
 *   version that gets sent is always the one that was easiest to reach for.
 *
 *   **The pass is the real component.** `DatePassCard` is what a student
 *   actually holds, rendered from the same code — so this page cannot drift
 *   from the product the way a screenshot silently does. The scanner panels
 *   below it mirror `dashboard/Scan.jsx`; if that screen's wording changes,
 *   change it here in the same commit.
 *
 * Reached from the email we send, and from one line at the bottom of the
 * partner landing page. It is deliberately not in the nav: somebody who is
 * ready to sign up should be looking at "Become a Partner", not at an
 * explainer.
 */
export default function HowItWorks() {
  // Read rather than hardcoded, so the one number on this page that is a
  // promise about money always agrees with what the database will actually
  // charge. `pricing()` answers with the platform default when there is no
  // backend, so this renders on a cold load either way.
  const [feeCents, setFeeCents] = useState(150)
  useEffect(() => {
    let live = true
    partners
      .pricing()
      .then((p) => live && setFeeCents(p.feeCents))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  return (
    <PartnerShell>
      <main className="mx-auto max-w-[760px] px-5 pb-24 pt-12 sm:px-8 sm:pt-16">
        <header className="flex flex-col gap-5">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-mist">
            How it works
          </p>
          <h1 className="relative inline-block self-start font-display text-[34px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[44px]">
            How a Date Pass works
            <Underline className="absolute -bottom-2 left-0 text-coral/50" width={260} />
          </h1>
          <p className="max-w-[56ch] text-[18px] leading-relaxed text-graphite">
            The whole thing, from signing up to the invoice — so you can decide for yourself what
            makes sense at your place.
          </p>
          <p className="border-t border-rule pt-4 text-[14px] text-mist">
            Written for owners and managers. Nothing here needs a technical background, and nothing
            on this page asks you to commit to anything.
          </p>
        </header>

        <div className="mt-10">
          <Step n={1}>
            <StepHead>You register your business</StepHead>
            <FreeTag />
            <P>
              A short form: your name, the address, what kind of night out you are, your hours, a
              couple of photos. It saves as you go, so you can stop and come back. A person at Loose
              Leaf reads every application.
            </P>
            <Aside>No card, no payment details, nothing to cancel. The form never asks for any.</Aside>
          </Step>

          <Step n={2}>
            <StepHead>Your Date Spot goes live</StepHead>
            <FreeTag />
            <P>
              Once we approve it, your business appears as a <B>Date Spot</B> — a card students see
              when they're browsing for somewhere to go, with your photos, hours, address and
              directions.
            </P>
            <Aside>
              Being listed costs nothing and always will. You can stop here indefinitely if you want
              to see what the listing alone does.
            </Aside>
          </Step>

          <Step n={3} tone="coral">
            <StepHead>Adding a payment method unlocks offers</StepHead>
            <P>
              An <B>offer</B> is the discount you attach to your Date Spot. To switch one on, there
              has to be a card on file — that's the only thing standing between a listing and a
              running offer.
            </P>
            <P>
              The card is captured on Stripe's own page; Loose Leaf never sees the number.{' '}
              <B>Nothing is charged for having one.</B> It exists so there's somewhere to send the
              monthly invoice described at the bottom of this page.
            </P>
            <Aside>
              This is the only step in the whole flow that involves money changing hands, and it
              happens once.
            </Aside>
          </Step>

          <Step n={4}>
            <StepHead>You get recommended inside couples' conversations</StepHead>
            <P>
              Loose Leaf is a dating app for a single campus. When two students match and start
              planning where to go, the app suggests real places — chosen by what kind of date they
              said they wanted, not by who paid. Your offer travels with your card when it appears.
            </P>
            <Aside>
              Paying can't buy a place at the top of a list you don't belong on. Ask for coffee and a
              steakhouse doesn't appear at all — the fit is decided before anything else is.
            </Aside>
          </Step>

          <Step n={5}>
            <StepHead>A couple claims the offer</StepHead>
            <P>
              They tap once, from inside that conversation. Nothing is charged to them and nothing is
              charged to you at this point — claiming is not the thing that counts.
            </P>
            <Aside>
              By default an offer can only be claimed by two people who matched and are actually
              planning a date. You can loosen that if you'd rather it be claimable by anyone
              browsing.
            </Aside>
          </Step>

          <Step n={6}>
            <StepHead>A Date Pass lands on their phone</StepHead>
            <P>
              A ticket with a QR code and a short reference number, valid for however long you set.
              It sits in their wallet in the app until they use it or it expires.
            </P>

            <figure className="mt-2 flex flex-col gap-3">
              {/* The real component, not a picture of one. If the pass ever
                  changes shape, this page changes with it. */}
              <div className="max-w-[340px]">
                <DatePassCard pass={EXAMPLE_PASS} />
              </div>
              <figcaption className="text-[13px] leading-relaxed text-mist">
                An example. Your name, your offer and your own small print would be in place of
                these. The codes never use the letters O, I or L, or the digits 0 and 1 — so nothing
                is ambiguous read out loud across a counter.
              </figcaption>
            </figure>
          </Step>

          <Step n={7} tone="moss">
            <StepHead>Scanning it is the thing that counts</StepHead>
            <P>
              Your employee opens the Loose Leaf Scanner on a phone or tablet, points it at the QR
              code — or types the number underneath — and gets one of two screens. Then they apply
              the discount.
            </P>

            <div className="mt-2 grid items-start gap-4 sm:grid-cols-2">
              <ScreenFrame note="Nothing has happened yet. Checking a pass doesn't count it — pressing this does.">
                <div className="rounded-sheet border border-moss/40 bg-moss-soft px-5 py-7 text-center">
                  <Tick />
                  <h3 className="mt-5 font-display text-[21px] font-semibold leading-tight text-navy">
                    Valid Loose Leaf Date Pass
                  </h3>
                  <p className="mt-6 text-[11.5px] font-semibold uppercase tracking-[0.08em] text-[#3F7454]">
                    Offer
                  </p>
                  <p className="mt-1 font-display text-[23px] font-semibold leading-tight text-navy">
                    Your offer, in full
                  </p>
                  <p className="mt-1 text-[13.5px] text-[#3F7454]">The name you gave it</p>
                  <p className="mx-auto mt-4 max-w-[34ch] text-[12.5px] leading-relaxed text-graphite">
                    Your terms line, so the person applying the discount is reading your rules rather
                    than remembering them.
                  </p>
                  <p className="mt-5 text-[12px] uppercase tracking-[0.08em] text-[#3F7454]">
                    Status · Unused
                  </p>
                </div>
                <FauxButton>Confirm redemption</FauxButton>
              </ScreenFrame>

              <ScreenFrame note="Five to fifteen seconds, start to finish.">
                <div className="rounded-sheet border border-moss/40 bg-moss-soft px-5 py-12 text-center">
                  <Tick large />
                  <h3 className="mt-5 font-display text-[25px] font-semibold leading-tight text-navy">
                    Date verified
                  </h3>
                  <p className="mt-3 text-[14.5px] leading-relaxed text-[#3F7454]">
                    Give them the discount. This is now counted in your dashboard.
                  </p>
                </div>
                <FauxButton>Scan another</FauxButton>
              </ScreenFrame>
            </div>

            <P>
              If the pass isn't good, you get a red screen instead of the green one, saying exactly
              which it is — <em>already used</em>, <em>expired</em>, <em>cancelled</em>, or{' '}
              <em>this offer isn't running right now</em>. There is nothing to interpret and nothing
              to check anywhere else.
            </P>
            <Aside>
              A confirmed pass can't be confirmed again, and two devices scanning the same code at
              the same moment can't both succeed. Employees who scan get a login that does only this
              — no billing, no reports, nothing about the customers.
            </Aside>
          </Step>

          <Step n={8} last>
            <StepHead>One invoice at the end of the month</StepHead>
            <div className="rounded-card border border-rule bg-cream px-7 py-7">
              <p className="font-display text-[21px] font-semibold leading-snug text-navy sm:text-[24px]">
                {fee(feeCents)} per Date Pass your staff actually scanned. Nothing else, ever.
              </p>
              <p className="mt-3 max-w-[58ch] text-[15px] leading-relaxed text-graphite">
                No signup fee, no monthly fee, no advertising spend, and nothing for being listed or
                recommended. A month where nobody walked in is a month that costs nothing.
              </p>
            </div>
            <P>
              Every scan is stamped at the price on the day it happened, so a future price change
              can't reach backwards. You can see the running total at any point during the month,
              alongside the list of redemptions it's built from.
            </P>
          </Step>
        </div>

        {/* ── the levers ─────────────────────────────────────────────────
            Listed, never recommended. What the offer should be is the one
            question the business is far better placed to answer than we are,
            and arriving with a suggested discount is how you end up arguing
            about somebody else's margins. */}
        <section className="mt-12 border-t border-rule pt-9">
          <p className="text-[11.5px] font-semibold uppercase tracking-[0.14em] text-mist">
            Once you're set up
          </p>
          <h2 className="mt-2.5 font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">
            What the offer is, is entirely yours
          </h2>
          <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-graphite">
            Everything below is a setting you control from your dashboard, changeable from any device
            at any time. Edits go live the moment you save, and you can pause an offer with one tap.
            You can run up to six at once.
          </p>

          <dl className="mt-6 overflow-hidden rounded-card border border-rule bg-white">
            {LEVERS.map(([term, detail]) => (
              <div
                key={term}
                className="grid gap-1 border-b border-rule px-5 py-4 last:border-b-0 sm:grid-cols-[190px_1fr] sm:gap-x-6"
              >
                <dt className="text-[14.5px] font-medium text-navy">{term}</dt>
                <dd className="text-[14.5px] leading-relaxed text-graphite">{detail}</dd>
              </div>
            ))}
          </dl>

          <p className="mt-5 max-w-[58ch] border-l-2 border-rule pl-4 text-[14.5px] leading-relaxed text-mist">
            Worth knowing before you decide anything: a pass is issued to one person, and the app has
            no way to tell how many people walk in with it. Anything about how many the deal covers
            lives in your terms line, where your employee will read it.
          </p>
        </section>

        {/* ── who does what ──────────────────────────────────────────── */}
        <section className="mt-12 border-t border-rule pt-9">
          <h2 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">
            Who does what
          </h2>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Column
              label="Loose Leaf handles"
              items={[
                'Suggesting you to couples planning a date',
                'Issuing and expiring Date Passes',
                'Enforcing every rule and ceiling you set',
                'Counting redemptions as they’re scanned',
                'Your monthly invoice',
              ]}
            />
            <Column
              label="You handle"
              items={['Deciding what the offer is', 'Scanning the pass', 'Applying the discount']}
            />
          </div>
        </section>

        {/* ── privacy ────────────────────────────────────────────────── */}
        <section className="mt-12 border-t border-rule pt-9">
          <h2 className="font-display text-[26px] font-semibold leading-tight tracking-[-0.02em]">
            What you'll see, and what you won't
          </h2>
          <p className="mt-4 max-w-[62ch] text-[15px] leading-relaxed text-graphite">
            Your dashboard shows every redemption as a line: the time, which offer, and the last four
            characters of the code so you can match it to a receipt. Alongside it, how many dates
            you've had today, this week and this month.
          </p>
          <p className="mt-3 max-w-[62ch] text-[15px] leading-relaxed text-graphite">
            <B>There are no names anywhere in it.</B> You'll know that a real Loose Leaf date happened
            at your place and when — never who was on it, what they talked about, or why we thought
            you'd suit them. That isn't a setting we've turned off for you; there is nothing there to
            show.
          </p>
        </section>

        <section className="mt-14 rounded-card border border-rule bg-cream/60 px-7 py-8 sm:flex sm:items-center sm:justify-between sm:gap-8">
          <div className="max-w-[46ch]">
            <h2 className="font-display text-[21px] font-semibold leading-tight">
              That's the whole of it.
            </h2>
            <p className="mt-2 text-[14.5px] leading-relaxed text-graphite">
              Setting up takes about fifteen minutes, and nothing is charged until somebody walks in.
            </p>
          </div>
          <Button to="/partners/join" variant="coral" size="lg" className="mt-5 shrink-0 sm:mt-0">
            Become a Partner
          </Button>
        </section>

        <p className="mt-6 text-center text-[13.5px] text-mist">
          Already a partner and just need the scanner?{' '}
          <Link
            to="/partners/login"
            className="font-medium text-graphite underline underline-offset-2 hover:text-navy"
          >
            Log in
          </Link>
          .
        </p>
      </main>
    </PartnerShell>
  )
}

/* ── the spine ───────────────────────────────────────────────────────────
   The connecting line is drawn rather than implied, because this genuinely
   is a sequence — each step only makes sense once the one above it has
   happened, and the reader's question between any two of them is "then
   what?". Numbered markers on a set of unordered points would be
   decoration; here they are the content. */

const DOT_TONE = {
  plain: 'border-rule bg-cream text-navy',
  coral: 'border-coral bg-coral-wash text-coral-deep',
  moss: 'border-moss bg-moss-soft text-[#3F7454]',
}

function Step({ n, tone = 'plain', last = false, children }) {
  return (
    <div className="grid grid-cols-[34px_1fr] gap-x-4 sm:grid-cols-[38px_1fr] sm:gap-x-6">
      <div className="relative flex justify-center">
        {!last && (
          <span
            className="absolute bottom-0 top-9 w-[2px] bg-rule"
            aria-hidden="true"
          />
        )}
        <span
          className={`relative z-10 mt-0.5 flex h-[30px] w-[30px] items-center justify-center rounded-full border text-[13px] tabular-nums sm:h-[34px] sm:w-[34px] ${DOT_TONE[tone]}`}
        >
          {n}
        </span>
      </div>
      <div className="flex flex-col gap-3 pb-9">{children}</div>
    </div>
  )
}

function StepHead({ children }) {
  return (
    <h2 className="font-display text-[22px] font-semibold leading-tight tracking-[-0.015em] sm:text-[25px]">
      {children}
    </h2>
  )
}

function P({ children }) {
  return <p className="max-w-[62ch] text-[15.5px] leading-relaxed text-graphite">{children}</p>
}

function B({ children }) {
  return <strong className="font-semibold text-navy">{children}</strong>
}

function Aside({ children }) {
  return (
    <p className="max-w-[58ch] border-l-2 border-rule pl-4 text-[14.5px] leading-relaxed text-mist">
      {children}
    </p>
  )
}

function FreeTag() {
  return (
    <span className="inline-flex w-fit items-center rounded-full border border-moss bg-moss-soft px-2.5 py-0.5 text-[11.5px] font-semibold uppercase tracking-[0.06em] text-[#3F7454]">
      Free
    </span>
  )
}

function Tick({ large = false }) {
  return (
    <span
      className={`mx-auto flex items-center justify-center rounded-full bg-moss text-white ${
        large ? 'h-16 w-16' : 'h-14 w-14'
      }`}
    >
      <IconCheck size={large ? 34 : 28} weight={2.4} />
    </span>
  )
}

/** A phone screen, framed. The button is deliberately inert — this is a
 *  picture of the scanner, and a button that looked pressable and wasn't
 *  would be the one thing on the page that lies. */
function ScreenFrame({ children, note }) {
  return (
    <div className="rounded-[24px] border border-rule bg-white p-1.5">
      {children}
      <p className="px-3 pb-2 pt-3 text-center text-[11.5px] leading-relaxed text-mist">{note}</p>
    </div>
  )
}

function FauxButton({ children }) {
  return (
    <div
      aria-hidden="true"
      className="mt-3 rounded-2xl bg-coral py-3.5 text-center text-[15px] font-semibold text-paper"
    >
      {children}
    </div>
  )
}

function Column({ label, items }) {
  return (
    <div className="rounded-card border border-rule bg-white px-6 py-5">
      <p className="text-[11.5px] font-semibold uppercase tracking-[0.12em] text-mist">{label}</p>
      <ul className="mt-3 list-disc space-y-1.5 pl-5 text-[14.5px] leading-relaxed text-graphite marker:text-mist">
        {items.map((i) => (
          <li key={i}>{i}</li>
        ))}
      </ul>
    </div>
  )
}

/* ── content ─────────────────────────────────────────────────────────── */

/** Deliberately unbranded and deliberately vague about the deal itself — the
 *  card is here to show the *shape* of what a customer holds, not to plant a
 *  discount in a prospective partner's head before they've thought about it. */
const EXAMPLE_PASS = {
  id: 'example',
  status: 'issued',
  partnerName: 'Your business',
  offerSummary: 'Your offer appears here',
  offerTitle: 'Your offer appears here',
  daysText: 'Sun–Thu',
  code: 'LL-4KHD-9RTM',
  terms: 'Your terms line prints here, and on your employee’s screen.',
  // Far enough out that the card never renders its expired state, whenever
  // somebody happens to open this page.
  expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 14).toISOString(),
}

const LEVERS = [
  [
    'The deal',
    'A percentage off · a dollar amount off · buy-one-get-one · something free · an amount off a minimum spend · a package you describe in your own words · anything else you write yourself',
  ],
  ['Which days', 'Any combination of the seven. A Sunday-to-Thursday offer never appears on a Friday.'],
  ['What hours', 'An optional window — from a time, until a time. Leave it empty for all day.'],
  ['What dates', 'An optional start and end, for a limited run.'],
  [
    'How many',
    'A ceiling per month, per day, or in total. Reaching it stops the offer being handed out until it resets.',
  ],
  ['How long a pass lasts', 'How many days somebody has to actually come in after claiming it.'],
  [
    'How often one person',
    'Once ever · once every so many days · as often as they like. Counted from the visit, not from claiming it.',
  ],
  ['Who it’s for', 'Only two people planning a date, or anyone browsing Date Spots.'],
  [
    'Your terms',
    'A short line of small print. It prints on the customer’s pass and on your employee’s screen at the moment they scan.',
  ],
]
