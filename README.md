# looseleaf

**Meet someone worth keeping.**

A college-focused dating web app. Free by design: no premium tier, no boosts,
no paid likes, no paywall in front of who likes you. Revenue is meant to come
later from clearly-labelled local sponsorships on the *date planning* surfaces
only — never from anything that ranks people.

React + Vite + Tailwind. Mobile-first, desktop-native, PWA-ready.

## Run it

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # production build into dist/
npm run preview  # serve the build
```

The demo starts signed out. `Join your campus` walks the full signup →
verification → 8-step onboarding flow (any six digits verify). `Log in` drops
you straight into Javi's account with likes, matches, and conversations
already seeded.

Settings → *Reset demo data* puts everything back.

## Where things live

```
src/
  data/          catalog.js (interests, prompts, spots, events)
                 people.js  (18 demo students + the signed-in user)
  services/
    backend.js   ← THE ONLY MODULE THAT TALKS TO "THE BACKEND"
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
    safety/      ReportSheet
  pages/         Landing, auth/, onboarding/, Discover, PersonPage, Likes,
                 Matches, Chat, Campus, campus/*, Profile, EditProfile,
                 Settings, Notifications
```

## Deploying

Step-by-step for GitHub, Vercel, and Supabase: **[docs/DEPLOY.md](docs/DEPLOY.md)**.

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

There are no real photo uploads yet. `components/brand/Portrait.jsx` generates
a deterministic illustrated stand-in from a person's id — portraits with varied
hair, skin, clothing and backdrop, plus a set of flat "scene" illustrations for
the non-portrait slots. `ProfilePhoto` already accepts a `src`, so real uploads
drop in with the illustrations as the fallback.

## Design system

Tokens live in `tailwind.config.js`: navy `#111C38`, coral `#FF6468`, notebook
blue `#A9C8F5`, margin pink `#DF62AD`, paper `#FFFDF8`, cream `#FFF6EB`,
graphite `#566070`. Type is DM Sans for UI, Fraunces for editorial moments,
Caveat for the handwritten notes. Notebook motifs (`paper-lines`, margin rules,
binder holes, folded corners) are utilities in `index.css` — used as accents,
never as wallpaper.
