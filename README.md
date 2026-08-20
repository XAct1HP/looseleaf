# looseleaf

**Meet someone worth keeping.**

A college-focused dating web app. Free by design: no premium tier, no boosts,
no paid likes, no paywall in front of who likes you.

Revenue comes from **Loose Leaf for Partners** — local businesses that become
Date Partners, appear on the *date planning* surfaces, and keep a perk for
Looseleaf couples. Always labelled, and never anywhere near anything that ranks
people. See [docs/PARTNERS.md](docs/PARTNERS.md).

React + Vite + Tailwind. Mobile-first, desktop-native, PWA-ready.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the build
```

Defaults to `VITE_DATA_MODE=demo`: the whole app runs off a bundled fictional
campus, with no backend and no account. `Join your campus` walks the full
signup → verification → 8-step onboarding flow (any six digits verify); `Log in`
drops you straight into Javi's account with likes, matches, and conversations
already seeded. Settings → *Reset demo data* puts everything back.

Set `VITE_DATA_MODE=supabase` (plus keys) for real accounts — see
[docs/GOING-LIVE.md](docs/GOING-LIVE.md) for what's ported and what isn't.

## Where things live

```
src/
  data/          catalog.js (interests, prompts, spots)
                 people.js  (demo students — demo mode only)
  services/
    backend.js   ← THE ONLY MODULE THAT TALKS TO "THE BACKEND"
    demo.js      the bundled fictional campus (dynamically imported)
    live/        auth · profiles · photos · events (Supabase)
  state/
    store.jsx    reducer + actions + selectors (useStore, useDeck, useIncoming)
  lib/
    overlap.js   derives "You two overlap" from shared, opt-in profile data
  components/
    brand/       Logo, Doodles, Portrait (generated illustrated photos)
    ui/          Button, Chip, Sheet, Toast, Icons
    common/      PageHeader, EmptyState, RailCard, UniversityBadge, CampusRail
    nav/         AppLayout, DesktopSidebar, MobileNav
    profile/     ProfileCard, ProfilePhoto, PromptCard, LikeButton,
                 OverlapCard, NoteSheet, MutualsSheet
    likes/       IncomingLikeCard
    match/       MatchModal
    chat/        ChatBubble, ConversationItem, DateNudge, DatePlanner
    dates/       DateSpotCard, SpotSheet, DatePassCard, QrCode
    partners/    PartnerShell, PlanCards, FunnelChart, fields
    safety/      ReportSheet
  pages/         Landing, auth/, onboarding/, Discover, PersonPage, Likes,
                 Matches, Chat, Campus, campus/*, Profile, EditProfile,
                 Settings, Notifications, DatePasses
    partners/    PartnersLanding, PartnerAuth, PartnerOnboarding,
                 DashboardLayout, dashboard/*
supabase/
  migrations/    schema, RLS, and the callable surface
  functions/     Stripe checkout, billing portal, webhook (Deno)
tests/
  partners_test.sql   the partner platform's invariants, against real Postgres
```

### The partner platform in one paragraph

A business signs up at `/partners`, describes what kind of *date* it's good for,
picks a plan, and pays through Stripe-hosted Checkout. Once a human approves it,
its Date Spot appears to students — in the Date Spots directory, in Plan a Date,
and occasionally as a suggestion inside a conversation that's clearly going
somewhere. A couple unlocks the perk, gets a Date Pass with a QR code, and the
restaurant scans it. That scan is a verified date in the partner's dashboard.

Two rules hold it together, both enforced in the database rather than in the
UI: **relevance comes before payment** (the date type is a filter, and a
matching type is worth 34 points against a ceiling of 10 for everything money
can buy), and **partners get attribution, not dating data** (a partner has no
`profiles` row and no select policy on `date_passes` at all). `tests/partners_test.sql`
asserts both against a real Postgres.

## Deploying

Step-by-step for GitHub, Vercel, and Supabase: **[docs/DEPLOY.md](docs/DEPLOY.md)**.
Turning off demo data and opening a campus: **[docs/GOING-LIVE.md](docs/GOING-LIVE.md)**.

Short version: push to GitHub, import the repo at vercel.com/new (Vite preset,
`dist` output — `vercel.json` already handles the SPA rewrite), and set
`VITE_DATA_MODE=demo`. The site is live at that point. Supabase is groundwork:
run `supabase/migrations/*.sql` then `supabase/seed.sql` in the SQL editor, add
the URL and anon key, and flip the mode once `services/backend.js` is ported.

## Swapping in Supabase

`src/services/backend.js` is the seam. Every read and write the UI performs is
already funnelled through it, with row-shaped payloads and async signatures.
Replacing the bodies with Supabase client calls should not require touching a
component. The mapping is documented at the top of that file:

| function | becomes |
| --- | --- |
| `getDeck` | `select … from profiles` (deck query) |
| `getIncomingLikes` | `select … from likes where target = auth.uid()` |
| `buildLike` / `buildMatch` | `insert into likes` / `insert into matches` |
| `buildMessage` | `insert into messages` + realtime channel per conversation |
| `loadState` / `saveState` | replaced by the session + live queries |

Three rules have to survive that migration:

1. Ranking never reads a billing or sponsorship table.
2. Incoming likes are always returned in full — no cap, no blur, no gate.
3. No feature is gated on a plan or entitlement.

## Photos

Live mode uploads to a private Supabase bucket and renders through short-lived
signed URLs, so a leaked link expires instead of becoming a permanent public
photo of a student. Empty slots — and all of demo mode — fall back to
`components/brand/Portrait.jsx`, which generates a deterministic illustrated
stand-in from a person's id: portraits with varied hair, skin, clothing and
backdrop, plus flat "scene" illustrations for the non-portrait slots.

## Design system

Tokens live in `tailwind.config.js`: navy `#111C38`, coral `#FF6468`, notebook
blue `#A9C8F5`, margin pink `#DF62AD`, paper `#FFFDF8`, cream `#FFF6EB`,
graphite `#566070`. Type is DM Sans for UI, Fraunces for editorial moments,
Caveat for the handwritten notes. Notebook motifs (`paper-lines`, margin rules,
binder holes, folded corners) are utilities in `index.css` — used as accents,
never as wallpaper.
