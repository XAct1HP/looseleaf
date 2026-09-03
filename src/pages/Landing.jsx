import { Link } from 'react-router-dom'
import Logo from '../components/brand/Logo'
import Button from '../components/ui/Button'
import Portrait from '../components/brand/Portrait'
import UniversityBadge from '../components/common/UniversityBadge'
import TopMenu from '../components/nav/TopMenu'
import { Underline, Star, HandHeart, Squiggle } from '../components/brand/Doodles'
import { IconEye, IconCap, IconPeople, IconCoffee, IconLock, IconPin } from '../components/ui/Icons'

function Annotation({ children, className = '', rotate = -4 }) {
  return (
    <span
      className={`absolute z-30 whitespace-nowrap rounded-xl border border-rule bg-white/95 px-3 py-1.5 font-hand text-[16px] leading-none text-navy shadow-paper backdrop-blur ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      {children}
    </span>
  )
}

function HeroCard({ id, name, age, line, chip, className = '', rotate = 0, scene = 'portrait' }) {
  return (
    <div
      className={`absolute w-[158px] overflow-hidden rounded-[20px] border border-rule bg-white p-2 shadow-lift sm:w-[184px] ${className}`}
      style={{ transform: `rotate(${rotate}deg)` }}
    >
      <div className="relative aspect-[3/4] overflow-hidden rounded-[14px]">
        <Portrait id={id} scene={scene} rounded="rounded-[14px]" />
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-navy/75 via-navy/35 to-transparent px-3 pb-2.5 pt-10">
          <p className="font-display text-[16px] font-semibold leading-none text-white">
            {name}, {age}
          </p>
          <p className="mt-1 text-[11.5px] leading-tight text-white/75">{line}</p>
        </div>
      </div>
      {chip && (
        <p className="mt-2 ml-0.5 inline-flex rounded-full bg-coral-soft px-2 py-1 text-[10.5px] font-medium text-coral-deep">
          {chip}
        </p>
      )}
    </div>
  )
}

const PHILOSOPHY = [
  {
    Icon: IconEye,
    title: 'See your likes.',
    body: 'Everyone who likes you is visible. No blur, no counter, no upgrade screen standing between you and a person.',
    tone: 'coral',
  },
  {
    Icon: IconCap,
    title: 'Meet your campus.',
    body: 'Profiles are tied to verified universities, so the people you see are actually people you could run into.',
    tone: 'blue',
  },
  {
    Icon: IconPeople,
    title: 'Find your overlap.',
    body: 'Mutual friends, shared interests, the same weird class. Context makes a first message so much easier.',
    tone: 'pink',
  },
  {
    Icon: IconCoffee,
    title: 'Actually go out.',
    body: 'When a conversation is going somewhere, Looseleaf helps it become a plan with a time and a place.',
    tone: 'moss',
  },
]

const TONES = {
  coral: 'bg-coral-soft text-coral-deep',
  blue: 'bg-notebook-soft text-[#2F5C99]',
  pink: 'bg-margin-soft text-[#A93E7F]',
  moss: 'bg-moss-soft text-[#3F7454]',
}

export default function Landing() {
  return (
    <div className="min-h-screen bg-paper">
      {/* ── nav ─────────────────────────────────────────────────── */}
      {/* "For businesses" belongs up here, not only in the Date Spots section
          halfway down the page — a restaurant owner who has been told about
          Loose Leaf arrives at the top and shouldn't have to scroll past a
          product built for students to find the one built for them. */}
      <header className="relative mx-auto flex max-w-[1180px] items-center justify-between px-5 py-5 sm:px-8">
        <Logo size="md" />
        <TopMenu
          items={[
            { to: '/events', label: 'Live events' },
            { to: '/partners', label: 'For businesses' },
            { to: '/login', label: 'Log in' },
            { to: '/join', label: 'Join your campus', variant: 'primary' },
          ]}
        />
      </header>

      {/* ── hero ────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden">
        <div className="mx-auto grid max-w-[1180px] items-center gap-10 px-5 pb-16 pt-8 sm:px-8 lg:grid-cols-[1.05fr_1fr] lg:gap-6 lg:pb-24 lg:pt-14">
          <div className="relative z-10 max-w-[540px]">
            <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-cream px-3.5 py-1.5 text-[12.5px] font-medium text-graphite">
              <span className="h-1.5 w-1.5 rounded-full bg-coral" />
              Now at the University of Michigan
            </span>

            {/* "Meet someone worth keeping" read as though the someone were
                a thing to acquire — a friend called it out and they were
                right. This is the notebook the whole brand is built on
                instead, and it puts the reader at the centre of it rather
                than the person they haven't met yet. */}
            <h1 className="relative mt-5 font-display text-[42px] font-semibold leading-[1.06] tracking-[-0.03em] sm:text-[54px] lg:text-[58px]">
              Write your next
              <br />
              <span className="relative inline-block">
                chapter.
                <Underline className="absolute -bottom-2 left-0 w-full text-coral" width={200} />
              </span>
            </h1>

            <p className="mt-7 max-w-[46ch] text-[16.5px] leading-relaxed text-graphite">
              Meet people from your campus, see who likes you, and make actual plans. Free, and
              nothing here is for sale.
            </p>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Button to="/join" variant="coral" size="lg" className="sm:px-8">
                Join your campus
              </Button>
              <Button to="/login" variant="outline" size="lg">
                I already have an account
              </Button>
            </div>

            <p className="mt-5 flex items-center gap-2 text-[13px] text-mist">
              <IconLock size={15} />
              Free. Verified with your .edu email.
            </p>
          </div>

          {/* card collage */}
          <div className="relative mx-auto h-[430px] w-full max-w-[470px] sm:h-[500px] lg:h-[540px]">
            {/* desk texture */}
            <div
              className="paper-lines absolute inset-x-0 top-8 bottom-8 rounded-[36px] bg-cream/60 opacity-70"
              aria-hidden="true"
            />
            <Star className="absolute right-8 top-2 animate-twinkle text-margin" size={20} />
            <Squiggle className="absolute bottom-4 left-4 text-notebook-deep/60" width={80} />

            <HeroCard
              id="p-emma-0"
              name="Emma"
              age={20}
              line="Psychology ’28"
              chip="A relationship"
              className="left-0 top-0 z-10"
              rotate={-5}
            />
            <HeroCard
              id="p-dev-0"
              name="Dev"
              age={21}
              line="Computer Science ’27"
              chip="Dating"
              className="right-0 top-[9%] z-10"
              rotate={4}
            />
            <HeroCard
              id="p-maya-0"
              name="Maya"
              age={19}
              line="Env. Science ’29"
              chip="Seeing where this goes"
              className="bottom-0 left-[19%] z-20"
              rotate={-2}
            />

            <Annotation className="left-[36%] top-[1%] z-30 hidden sm:block" rotate={-6}>
              same campus
            </Annotation>
            <Annotation className="-right-[2%] top-[63%] z-30" rotate={5}>
              3 mutuals
            </Annotation>
            <Annotation className="-left-[4%] top-[57%] z-30" rotate={-3}>
              also loves live music
            </Annotation>
            <Annotation className="bottom-[2%] -right-[2%] z-30 hidden sm:block" rotate={4}>
              coffee &gt; drinks
            </Annotation>

            <span className="absolute left-[44%] top-[26%] z-30 animate-float-soft">
              <HandHeart size={26} className="text-coral drop-shadow" />
            </span>
          </div>
        </div>
      </section>

      {/* ── philosophy ──────────────────────────────────────────── */}
      <section className="border-y border-rule bg-cream/50">
        <div className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-24">
          <h2 className="max-w-[16ch] font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
            Built for how people actually meet at college.
          </h2>

          <div className="mt-12 grid gap-5 sm:grid-cols-2">
            {PHILOSOPHY.map(({ Icon, title, body, tone }) => (
              <div key={title} className="lift-corner rounded-card border border-rule bg-white px-7 py-7">
                <span className={`inline-flex h-11 w-11 items-center justify-center rounded-2xl ${TONES[tone]}`}>
                  <Icon size={21} />
                </span>
                <h3 className="mt-5 font-display text-[21px] font-semibold leading-tight">{title}</h3>
                <p className="mt-2.5 text-[15px] leading-relaxed text-graphite">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── somewhere to go ─────────────────────────────────────── */}
      <section className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1fr_0.85fr]">
          <div className="max-w-[540px]">
            <span className="inline-flex items-center gap-2 rounded-full bg-margin-soft px-3 py-1.5 text-[12.5px] font-medium text-[#A93E7F]">
              <IconPin size={14} />
              Date Spots
            </span>

            <h2 className="mt-6 font-display text-[32px] font-semibold leading-tight tracking-[-0.02em] sm:text-[40px]">
              Match. Talk.{' '}
              <span className="relative inline-block">
                Actually go somewhere.
                <Underline className="absolute -bottom-2 left-0 w-full text-margin/70" width={300} />
              </span>
            </h2>

            <p className="mt-6 max-w-[50ch] text-[16.5px] leading-relaxed text-graphite">
              The hardest part of a good conversation is the bit where somebody has to suggest a
              plan. Looseleaf knows what you both like and what’s a short walk from campus, so when
              you’re ready it can just tell you where to go — and some of those places keep a perk
              for Looseleaf dates.
            </p>

            <ul className="mt-7 space-y-3">
              {[
                ['Picked around you two', 'Suggestions come from what you both actually said you like.'],
                ['Perks you can carry', 'Unlock an offer and you get a Date Pass to show when you arrive.'],
                ['Say no and it goes away', 'Wave one off and it doesn’t come back. Nothing here nags.'],
              ].map(([t, d]) => (
                <li key={t} className="flex gap-3">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-coral" />
                  <span>
                    <span className="text-[15px] font-medium text-navy">{t}</span>
                    <span className="mt-0.5 block text-[14px] leading-relaxed text-graphite">{d}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>

          {/* what a suggestion looks like in a conversation */}
          <div className="relative mx-auto w-full max-w-[400px]">
            <Star className="absolute -right-3 -top-4 animate-twinkle text-margin" size={18} />

            <div className="rounded-sheet border border-rule bg-cream/70 p-4 shadow-paper sm:p-5">
              <div className="space-y-2.5">
                <p className="ml-auto w-fit max-w-[80%] rounded-[18px] rounded-br-md bg-navy px-4 py-2.5 text-[14px] text-paper">
                  ok but where though
                </p>
                <p className="w-fit max-w-[80%] rounded-[18px] rounded-bl-md border border-rule bg-white px-4 py-2.5 text-[14px] text-navy">
                  genuinely no idea, you pick
                </p>
              </div>

              <div className="relative mt-4 rounded-card border border-rule bg-white px-5 py-5 shadow-paper">
                <h3 className="font-display text-[17px] font-semibold leading-tight">
                  You two might like this 👀
                </h3>

                <div className="mt-3.5 flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-cream text-graphite">
                    <IconPin size={18} />
                  </span>
                  <div className="min-w-0">
                    <p className="font-display text-[17px] font-semibold leading-tight text-navy">
                      The Lantern Room
                    </p>
                    <p className="mt-0.5 text-[12.5px] text-mist">
                      Casual · Food &amp; Drinks · 9 min walk
                    </p>
                  </div>
                </div>

                <div className="mt-3.5 rounded-2xl border border-[#F2E6D6] bg-cream px-4 py-2.5">
                  <p className="text-[11.5px] font-semibold uppercase tracking-[0.07em] text-mist">
                    Looseleaf perk
                  </p>
                  <p className="mt-0.5 text-[14px] font-medium text-navy">15% off your date</p>
                </div>

                <div className="mt-4 flex gap-2">
                  <span className="flex-1 rounded-2xl bg-coral px-4 py-2.5 text-center text-[14px] font-medium text-white">
                    Plan this date
                  </span>
                  <span className="rounded-2xl border border-rule px-4 py-2.5 text-[14px] font-medium text-graphite">
                    Not this one
                  </span>
                </div>
              </div>
            </div>

            <p className="mt-3 px-1 text-center text-[12px] leading-relaxed text-mist">
              Suggestions are labelled, occasional, and always dismissible.
            </p>
          </div>
        </div>

        <p className="mt-12 border-t border-rule pt-6 text-[13.5px] text-mist">
          Own a great date spot?{' '}
          <Link
            to="/partners"
            className="font-medium text-graphite underline underline-offset-2 hover:text-navy"
          >
            Become a Looseleaf Partner →
          </Link>
        </p>
      </section>

      {/* ── the promise ─────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1180px] px-5 py-16 sm:px-8 lg:py-24">
        <div className="relative overflow-hidden rounded-sheet border border-navy/10 bg-navy px-7 py-12 text-paper sm:px-14 sm:py-16">
          <span
            className="paper-lines absolute inset-0 opacity-[0.06]"
            aria-hidden="true"
          />
          <div className="relative max-w-[620px]">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-[12.5px] font-medium">
              <HandHeart size={14} className="text-coral" />
              The promise
            </span>
            <h2 className="mt-6 font-display text-[34px] font-semibold leading-[1.1] tracking-[-0.02em] sm:text-[44px]">
              Dating features aren’t for sale.
            </h2>
            <p className="mt-6 text-[16.5px] leading-relaxed text-paper/80">
              Looseleaf is free, and the things that decide who you meet will never have a price
              tag on them. Everyone here sees the same app: the same likes, the same messages, the
              same chance of being seen.
            </p>

            <ul className="mt-8 grid gap-2.5 sm:grid-cols-2">
              {[
                'Every incoming like is visible',
                'No boosts, roses, or super likes',
                'No paywall on messaging',
                'Ads never touch who you see',
              ].map((t) => (
                <li key={t} className="flex items-center gap-2.5 text-[14.5px] text-paper/90">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-coral/25 text-coral">
                    <HandHeart size={11} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* ── closing ─────────────────────────────────────────────── */}
      <section className="mx-auto max-w-[1180px] px-5 pb-20 sm:px-8">
        <div className="rounded-sheet border border-rule bg-cream px-7 py-14 text-center sm:px-14">
          <UniversityBadge className="mb-6" />
          <h2 className="mx-auto max-w-[18ch] font-display text-[30px] font-semibold leading-tight tracking-[-0.02em] sm:text-[38px]">
            Your next chapter starts on your campus.
          </h2>
          <p className="mx-auto mt-4 max-w-[44ch] text-[15.5px] leading-relaxed text-graphite">
            Takes about four minutes to set up. You can pause any time, and nothing here is trying to keep you
            on your phone.
          </p>
          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <Button to="/join" variant="coral" size="lg" className="sm:px-9">
              Join your campus
            </Button>
            <Button to="/login" variant="ghost" size="lg">
              Log in
            </Button>
          </div>
        </div>
      </section>

      {/* ── footer ──────────────────────────────────────────────── */}
      <footer className="border-t border-rule">
        <div className="mx-auto flex max-w-[1180px] flex-col gap-5 px-5 py-9 sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <Logo size="sm" />
          <p className="text-[13px] text-mist">
            Made for college, in Ann Arbor, MI
          </p>
          <nav className="flex gap-5 text-[13px] text-graphite">
            <Link to="/join" className="hover:text-navy">
              Safety
            </Link>
            <Link to="/join" className="hover:text-navy">
              Privacy
            </Link>
            <Link to="/partners" className="hover:text-navy">
              For businesses
            </Link>
            <Link to="/join" className="hover:text-navy">
              Contact
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  )
}
