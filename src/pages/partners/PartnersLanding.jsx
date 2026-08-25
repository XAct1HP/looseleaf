import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import PartnerShell from '../../components/partners/PartnerShell'
import Pricing from '../../components/partners/Pricing'
import DateSpotCard from '../../components/dates/DateSpotCard'
import QrCode from '../../components/dates/QrCode'
import Button from '../../components/ui/Button'
import { passUrl } from '../../lib/site'
import { Underline, Star, Squiggle, CoffeeDoodle, BinderHoles } from '../../components/brand/Doodles'
import { IconPin, IconSpark, IconCalendar, IconLock, IconShield, IconEye } from '../../components/ui/Icons'
import * as partners from '../../services/partners'
import { FREE_TIER, fee, money } from '../../lib/partnerBilling'

/* ── the example card in the hero ───────────────────────────────────────── */
//  Invented on purpose. Putting a real restaurant's name next to a discount it
//  never agreed to would be a claim about someone else's prices.

const EXAMPLE_CODE = 'LL-7QK4-2F9M'

const EXAMPLE_SPOT = {
  name: 'The Lantern Room',
  kind: 'Food & Drinks',
  priceLevel: 2,
  walkMinutes: 9,
  distanceMiles: 0.8,
  note: 'Booths, long menu, nobody rushes you out.',
  dateTypes: ['dinner', 'drinks', 'first-date'],
  isPartner: true,
  offer: { summary: '15% off your date', daysText: 'Sunday–Thursday' },
}

const STEPS = [
  {
    n: '01',
    Icon: IconPin,
    title: 'Create your Date Spot',
    body:
      'Your name, your photos, your hours, your address. Then the part most listings skip: what kind of date you are actually good for. First dates, dinner, something to do with your hands.',
    detail: ['Photos and logo', 'Hours and price range', 'Date types and vibes', 'Address and contact'],
  },
  {
    n: '02',
    Icon: IconSpark,
    title: 'Create a Loose Leaf offer',
    body:
      'Something worth walking over for. You set the days, the hours, and the ceiling — so the traffic arrives on the nights you actually want it, not on a Friday you were already full.',
    detail: ['15% off, free dessert, BOGO', 'Sunday–Thursday, 4pm to close', 'Cap it monthly or daily', 'Pause it any time'],
  },
  {
    n: '03',
    Icon: IconCalendar,
    title: 'Loose Leaf sends dates your way',
    body:
      'When two people are working out where to go, we suggest places that fit them. They unlock a Date Pass, walk in, and your staff scan it. That scan is a date you can count.',
    detail: ['Suggested in the app', 'Date Pass with a QR code', 'Scan at the table', 'A verified date in your dashboard'],
  },
]

const TRUST = [
  {
    Icon: IconEye,
    title: 'Relevance comes first.',
    body:
      'You cannot buy your way into a conversation you do not belong in. Ask Loose Leaf for coffee and it will not offer you a brewery, whatever that brewery pays. Paying moves a place a little; fitting the ask moves it a lot.',
  },
  {
    Icon: IconLock,
    title: 'You get attribution, not their data.',
    body:
      'A scanned pass tells you a real Loose Leaf date is at your table. It does not tell you who they are, what they talked about, or why we suggested you. That line is enforced in the database, not by policy.',
  },
  {
    Icon: IconShield,
    title: 'It never looks like an ad.',
    body:
      'No banners, no interstitials, no popups between two people mid-conversation. A suggestion arrives once, politely, and can be waved away — and once someone waves yours away, it does not come back.',
  },
]

const FAQ = [
  {
    q: 'How is this different from buying ads?',
    a: 'An ad is shown to whoever is looking. A Loose Leaf recommendation is shown to two specific people who have already decided to go somewhere together and are working out where. You are not paying for attention — you are paying to be one of the answers when the question comes up.',
  },
  {
    q: 'What counts as a verified date?',
    a: 'A Date Pass that your staff actually scanned. Not a view, not a tap, not an unlock. Somebody walked in, showed a code, and you confirmed it.',
  },
  {
    q: 'Can I keep Loose Leaf traffic off my busy nights?',
    a: 'Yes, and most partners do. Offers carry days, hours, and monthly or daily caps. A Sunday–Thursday offer will not be shown on a Friday, and once you hit your cap for the month it stops being offered at all.',
  },
  {
    q: 'Do I have to run a discount?',
    a: 'No, and it costs you nothing not to. Your Date Spot profile — hours, photos, the lot — is free whether or not there is an offer attached. A redeemed Date Pass is the only thing we ever charge for, and you cannot have one without an offer, so a profile on its own is a perfectly good and permanently free way to use Loose Leaf.',
  },
  {
    q: 'What do you need from me to start?',
    a: 'Your business details and a few photos. No card, no plan to choose. We review new partners by hand before they go live to students, which usually takes a day or two. A card is only needed later, when you decide to turn an offer on.',
  },
  {
    q: 'When exactly am I charged?',
    a: 'When a couple hands over a Date Pass and one of your staff scans it. Not when someone views your profile, not when we suggest you, not when a pass is unlocked — only when somebody walks in and you confirm it. Redemptions add up through the month and Stripe sends one invoice at the end of it.',
  },
  {
    q: 'What stops a surprise bill?',
    a: 'Two things. Every offer carries daily and monthly caps you set, so you decide the most redemptions you will ever hand out. And your dashboard shows the running total live — the same list your invoice is built from, line for line.',
  },
  {
    q: 'Can I stop?',
    a: 'Any time, from your dashboard, through Stripe. There is nothing to cancel in the usual sense — there is no subscription and no notice period. Pause your offers and the charges stop that day. Your Date Spot can stay up for as long as you like; it never cost anything.',
  },
]

export default function PartnersLanding() {
  const [pricing, setPricing] = useState({
    feeCents: FREE_TIER.redemption_fee_cents,
    tiers: [],
  })
  const [open, setOpen] = useState(null)

  useEffect(() => {
    let live = true
    partners
      .pricing()
      .then((p) => live && setPricing(p))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [])

  return (
    <PartnerShell>
      {/* ── hero ──────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <span
          className="pointer-events-none absolute -right-40 -top-32 h-[420px] w-[420px] rounded-full bg-coral-soft/40 blur-3xl"
          aria-hidden="true"
        />
        <div className="relative mx-auto grid max-w-[1180px] items-center gap-12 px-5 pb-16 pt-12 sm:px-8 lg:grid-cols-[1.06fr_1fr] lg:pb-24 lg:pt-16">
          <div className="max-w-[560px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-cream px-3.5 py-1.5 text-[12.5px] font-medium text-graphite">
              <span className="h-1.5 w-1.5 rounded-full bg-coral" />
              Now taking partners in Ann Arbor
            </span>

            <h1 className="mt-6 font-display text-[42px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[54px]">
              Turn Loose Leaf matches into{' '}
              <span className="relative inline-block">
                customers.
                <Underline className="absolute -bottom-2 left-0 w-full text-coral" width={250} />
              </span>
            </h1>

            <p className="mt-7 max-w-[48ch] text-[16.5px] leading-relaxed text-graphite">
              Loose Leaf helps students meet, and then helps them answer the harder question:
              where should we go? Become a Loose Leaf Partner and put your business in front of
              two people deciding that right now.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button to="/partners/join" variant="coral" size="lg" className="sm:px-8">
                Become a Partner
              </Button>
              <Button href="#how" variant="outline" size="lg">
                See how it works
              </Button>
            </div>

            {/* The price belongs in the hero, not two screens down. A
                restaurant owner's second question is always "what does it
                cost", and making them scroll for it reads as an answer being
                managed. The fee is the live one, so this line and the pricing
                card below can never drift apart. */}
            <p className="mt-6 max-w-[48ch] text-[13px] leading-relaxed text-mist">
              Free to join, free to stay listed. You pay {fee(pricing.feeCents)} when a Date Pass is
              redeemed at your counter — nothing else, and nothing at all in a month where none
              are. We review every partner by hand before students see them.
            </p>
          </div>

          {/* what a student actually sees */}
          <div className="relative mx-auto w-full max-w-[420px]">
            <Star className="absolute -left-4 -top-3 animate-twinkle text-margin" size={18} />
            <Squiggle className="absolute -bottom-5 right-2 text-notebook-deep/50" width={72} />

            <div className="relative rounded-sheet border border-rule bg-cream/70 p-4 shadow-lift sm:p-5">
              <BinderHoles className="absolute left-2 top-8 bottom-8 hidden sm:flex" count={3} />
              <div className="sm:pl-4">
                <p className="mb-3 px-1 font-hand text-[17px] text-graphite">
                  what your future customers see 👀
                </p>
                <DateSpotCard spot={EXAMPLE_SPOT} fit={92} />
                <p className="mt-3 px-1 text-[12px] leading-relaxed text-mist">
                  A suggestion inside a conversation that was already going somewhere.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── how it works ──────────────────────────────────────────────── */}
      <section id="how" className="scroll-mt-20 border-y border-rule bg-cream/50">
        <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-24">
          <h2 className="max-w-[18ch] font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">
            Three steps, then it runs itself.
          </h2>
          <p className="mt-4 max-w-[56ch] text-[16px] leading-relaxed text-graphite">
            Setting up takes about fifteen minutes. After that the only thing you touch is the offer,
            and only when you want to change it.
          </p>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {STEPS.map(({ n, Icon, title, body, detail }) => (
              <div
                key={n}
                className="lift-corner relative overflow-hidden rounded-card border border-rule bg-white px-6 py-7"
              >
                <span
                  className="paper-lines-soft pointer-events-none absolute inset-x-0 bottom-0 top-24 opacity-60"
                  aria-hidden="true"
                />
                <div className="relative">
                  <div className="flex items-center justify-between">
                    <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-coral-soft text-coral-deep">
                      <Icon size={21} />
                    </span>
                    <span className="font-sans text-[13px] font-semibold tabular-nums text-mist">{n}</span>
                  </div>

                  <h3 className="mt-5 font-display text-[21px] font-semibold leading-tight">{title}</h3>
                  <p className="mt-2.5 text-[14.5px] leading-relaxed text-graphite">{body}</p>

                  <ul className="mt-5 space-y-1.5">
                    {detail.map((d) => (
                      <li key={d} className="text-[13.5px] text-graphite">
                        · {d}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── the pass ──────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.9fr]">
          <div>
            <span className="inline-flex items-center gap-2 rounded-full bg-margin-soft px-3 py-1.5 text-[12.5px] font-medium text-[#A93E7F]">
              <IconCalendar size={14} />
              The Date Pass
            </span>
            <h2 className="mt-6 font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">
              Finally, a number that means something.
            </h2>
            <p className="mt-5 max-w-[52ch] text-[16px] leading-relaxed text-graphite">
              Most local marketing ends at the impression. Loose Leaf ends at the table. When a couple
              picks you, they get a Date Pass with a code on it. Your staff scan it, it turns green,
              and that becomes one verified date in your dashboard — not an estimate, not a
              modelled attribution, an actual visit somebody confirmed.
            </p>

            <dl className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {[
                ['Single-use by default', 'A pass cannot be redeemed twice unless you say it can.'],
                ['Works without a scanner', 'Codes are short and readable, so a phone camera is optional.'],
                ['Checked server-side', 'Validity is decided by Loose Leaf, not by whatever the customer’s screen says.'],
                ['Capped where you cap it', 'Hit your monthly limit and the offer stops being handed out.'],
              ].map(([t, d]) => (
                <div key={t}>
                  <dt className="text-[14.5px] font-medium text-navy">{t}</dt>
                  <dd className="mt-1 text-[13.5px] leading-relaxed text-graphite">{d}</dd>
                </div>
              ))}
            </dl>
          </div>

          <div className="relative mx-auto w-full max-w-[360px]">
            <div className="rounded-sheet border border-rule bg-navy px-7 py-8 text-paper shadow-lift">
              <span className="paper-lines pointer-events-none absolute inset-0 rounded-sheet opacity-[0.05]" aria-hidden="true" />
              <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-paper/60">
                Your Loose Leaf Date Pass
              </p>
              <p className="mt-3 font-display text-[26px] font-semibold leading-tight">The Lantern Room</p>
              <p className="mt-1 text-[15px] text-paper/75">15% off your date</p>

              {/* A real code, generated the same way a real pass is — showing a
                  drawing of a QR on the page that explains QR codes would be a
                  small lie in the middle of an argument about trust. */}
              <div className="my-6 w-fit rounded-2xl bg-paper p-3">
                <QrCode value={passUrl(EXAMPLE_CODE)} size={124} label="Example Date Pass code" />
              </div>

              <p className="font-sans text-[15px] font-semibold tracking-[0.14em] text-paper/90">
                {EXAMPLE_CODE}
              </p>
              <p className="mt-3 text-[12.5px] text-paper/55">
                Valid Sunday–Thursday · Expires August 27
              </p>
            </div>
            <p className="mt-3 text-center font-hand text-[16px] text-graphite">
              show this to your server
            </p>
          </div>
        </div>
      </section>

      {/* ── the rules ─────────────────────────────────────────────────── */}
      <section className="border-y border-rule bg-cream/50">
        <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-24">
          <div className="flex items-start gap-5">
            <CoffeeDoodle className="hidden shrink-0 text-navy/35 sm:block" size={72} />
            <div>
              <h2 className="max-w-[20ch] font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">
                What you are buying, and what you are not.
              </h2>
              <p className="mt-4 max-w-[58ch] text-[16px] leading-relaxed text-graphite">
                Students trust Loose Leaf’s suggestions because those suggestions are not for sale.
                That trust is what makes a recommendation worth anything to you, so we protect it
                fairly aggressively.
              </p>
            </div>
          </div>

          <div className="mt-12 grid gap-5 lg:grid-cols-3">
            {TRUST.map(({ Icon, title, body }) => (
              <div key={title} className="rounded-card border border-rule bg-white px-6 py-7">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-notebook-soft text-[#2F5C99]">
                  <Icon size={21} />
                </span>
                <h3 className="mt-5 font-display text-[20px] font-semibold leading-tight">{title}</h3>
                <p className="mt-2.5 text-[14.5px] leading-relaxed text-graphite">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── pricing ───────────────────────────────────────────────────── */}
      <section id="pricing" className="mx-auto max-w-[1180px] scroll-mt-20 px-5 py-16 sm:px-8 lg:py-24">
        <h2 className="font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">
          Free until somebody walks in.
        </h2>
        <p className="mt-4 max-w-[56ch] text-[16px] leading-relaxed text-graphite">
          There are no plans and no monthly fee. Everything is switched on for every partner, and
          the only thing that costs you anything is a Date Pass one of your own staff scanned —
          which is to say, a couple who actually turned up.
        </p>

        <div className="mt-12">
          <Pricing feeCents={pricing.feeCents} tiers={pricing.tiers} />
        </div>

        <p className="mt-8 max-w-[64ch] text-[13.5px] leading-relaxed text-mist">
          Billed once a month through Stripe, in arrears, for the redemptions that happened. A
          month with none is an invoice for {money(0)} — we do not send it and you are not
          charged. You add a card when you turn on your first offer, not when you sign up.
        </p>
      </section>

      {/* ── FAQ ───────────────────────────────────────────────────────── */}
      <section className="border-t border-rule bg-cream/40">
        <div className="mx-auto max-w-[820px] px-5 py-16 sm:px-8 lg:py-20">
          <h2 className="font-display text-[28px] font-semibold leading-tight tracking-[-0.02em] sm:text-[34px]">
            Reasonable questions.
          </h2>

          <div className="mt-9 divide-y divide-rule border-y border-rule">
            {FAQ.map(({ q, a }, i) => (
              <div key={q}>
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  aria-expanded={open === i}
                  className="focus-ring flex w-full items-center justify-between gap-4 py-5 text-left"
                >
                  <span className="text-[16px] font-medium text-navy">{q}</span>
                  <span
                    className={`shrink-0 text-[22px] leading-none text-mist transition-transform ${
                      open === i ? 'rotate-45' : ''
                    }`}
                    aria-hidden="true"
                  >
                    +
                  </span>
                </button>
                {open === i && (
                  <p className="animate-fade-up pb-6 pr-8 text-[15px] leading-relaxed text-graphite">
                    {a}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── closing ───────────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-20">
        <div className="relative overflow-hidden rounded-sheet border border-navy/10 bg-navy px-7 py-14 text-center text-paper sm:px-14">
          <span className="paper-lines absolute inset-0 opacity-[0.06]" aria-hidden="true" />
          <div className="relative">
            <h2 className="mx-auto max-w-[20ch] font-display text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">
              Somebody is deciding where to take a date tonight.
            </h2>
            <p className="mx-auto mt-5 max-w-[48ch] text-[16px] leading-relaxed text-paper/75">
              Fifteen minutes to set up, and a human at Loose Leaf reads every application before it
              goes live.
            </p>
            <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
              <Button to="/partners/join" variant="coral" size="lg" className="sm:px-9">
                Become a Partner
              </Button>
              {/* Not "I already have an account" — the people most likely to
                  need this button are staff who have never had one, and were
                  added to a team by their manager this morning. */}
              <Button to="/partners/login" variant="ghost" size="lg" className="!text-paper/80 hover:!bg-white/10 hover:!text-paper">
                Log in
              </Button>
            </div>
          </div>
        </div>

        {/* Staff sent here by their manager are the one audience this page was
            never written for, and every other route off it says "Become a
            Partner" — which is how somebody ends up signing their employer up
            a second time to get at a scanner. One sentence fixes it. */}
        <p className="mx-auto mt-8 max-w-[52ch] text-center text-[13.5px] text-mist">
          Work at a Loose Leaf partner and your manager added you to the team?{' '}
          <Link to="/partners/login" className="font-medium text-graphite underline underline-offset-2 hover:text-navy">
            Log in
          </Link>{' '}
          with the email they used — you don’t need to become a partner yourself.
        </p>

        <p className="mt-4 text-center text-[13.5px] text-mist">
          Looking for the student side?{' '}
          <Link to="/" className="font-medium text-graphite underline underline-offset-2 hover:text-navy">
            Loose Leaf is here
          </Link>
          .
        </p>
      </section>
    </PartnerShell>
  )
}
