# Shipping looseleaf

Three services, in this order: GitHub → Vercel → Supabase. The app deploys and
works on step 2; Supabase is groundwork for when the real backend goes in.

---

## 1. GitHub

Everything git needs is in place — `.gitignore`, `vercel.json`, `.env.example`
— but the repo itself has to be initialised from your side. (The sandbox that
wrote these files mounts the folder read/write-but-no-delete, and git needs to
delete lock files as it works, so it can't run there cleanly.)

From the project folder, in PowerShell or Git Bash:

```bash
git init
git add -A
git commit -m "Looseleaf: college dating app, demo data"
git branch -M main
```

Sanity check before you push — this should list ~80 files and **no**
`node_modules`, `dist`, `.env`, or `_to_delete`:

```bash
git ls-files | wc -l
```

Then create the remote:

1. Go to <https://github.com/new>
   - **Repository name:** `looseleaf`
   - **Visibility:** Public
   - **Do not** tick "Add a README", ".gitignore", or a license — the repo
     already has them, and a pre-initialised remote makes the first push messy.
2. Copy the HTTPS URL GitHub shows you:

```bash
git remote add origin https://github.com/<your-username>/looseleaf.git
git push -u origin main
```

If it asks for a password, GitHub wants a token, not your account password:
<https://github.com/settings/tokens> → *Fine-grained token* → repo access to
`looseleaf` → **Contents: Read and write**. Paste the token as the password.

> **OneDrive note.** This folder lives inside OneDrive. Git and OneDrive both
> want to manage the same files, and OneDrive occasionally locks `.git` mid-sync,
> which shows up as random `unable to write` errors. If that bites, move the
> project somewhere outside OneDrive (`C:\dev\looseleaf`) and push from there.

---

## 2. Vercel

1. <https://vercel.com/new> → **Import Git Repository** → authorise GitHub if
   prompted → pick `looseleaf`.
2. Vercel detects Vite. Confirm the settings match:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
3. Environment variables — add one now so the first deploy is deliberate:
   - `VITE_DATA_MODE` = `demo`
4. **Deploy.**

`vercel.json` in the repo handles the part people usually get wrong: the SPA
rewrite. Without it, `looseleaf.vercel.app/app/discover` 404s on refresh because
there's no such file on disk. The rewrite sends every unmatched path to
`index.html` and lets React Router take over.

Every push to `main` redeploys production; every pull request gets its own
preview URL.

---

## 3. Supabase

1. <https://supabase.com/dashboard> → **New project**
   - Name: `looseleaf`
   - Region: pick the one nearest your users (`us-east-1` for Michigan)
   - Save the database password somewhere real — it is shown once.
2. Wait for provisioning (~2 minutes).
3. **SQL Editor** → run each migration in `supabase/migrations/` in filename
   order. Each should finish with "Success. No rows returned."
   - `20260819120000_init.sql` — schema, RLS, storage
   - `20260819130000_signup_domain_hook.sql` — campus-only signups
   - `20260819140000_real_users.sql` — admins, event moderation, waitlist
4. New query → paste `supabase/seed.sql` → **Run**. This loads the campus, the
   interests, the prompt library, and the date spots. No people, no events.
   (Run seed *before* enabling the signup hook — the hook reads the university
   list, so with no rows seeded it would reject every signup.)
5. **Authentication → Providers → Email**: turn on *Confirm email*, and turn
   **off** *Enable email signups* only if you want invite-only. Under
   **URL Configuration**, set:
   - Site URL: your Vercel production URL
   - Redirect URLs: add `http://localhost:5173/**` and `https://<your-vercel-url>/**`
6. **Project Settings → API**: copy the *Project URL* and the *anon public* key.

### The domain

Production is **hellolooseleaf.com**.

1. Vercel → Project → Settings → Domains → add `hellolooseleaf.com` **and**
   `www.hellolooseleaf.com`. Set the apex as primary and let `www` redirect to
   it, so there's one canonical URL rather than two versions of every page.
2. At your registrar, add the records Vercel shows you — usually an `A` record
   on the apex pointing at `76.76.21.21`, and a `CNAME` on `www` pointing at
   `cname.vercel-dns.com`. Vercel's panel is authoritative; use what it prints.
3. Wait for the certificate to go green (usually a couple of minutes).

Then tell the app and Supabase about it, or shared links will keep pointing at
the old `.vercel.app` URL:

- **Vercel → Environment Variables:** `VITE_SITE_URL=https://hellolooseleaf.com`
  Every shareable link is built from this, never from `window.location` — which
  on a preview deployment would hand someone a link to a preview build.
- **Supabase → Authentication → URL Configuration:**
  - Site URL: `https://hellolooseleaf.com`
  - Redirect URLs: `https://hellolooseleaf.com/**`, `https://www.hellolooseleaf.com/**`,
    and `http://localhost:5173/**` for local dev.

`index.html` carries absolute `og:` and `twitter:` tags pointing at
`https://hellolooseleaf.com/og.png`. They have to be absolute — iMessage,
Instagram, Slack and the rest fetch them server-side, where a relative path
means nothing. If the domain ever changes, those tags and `VITE_SITE_URL`
change together.

Check the share card renders with any OG debugger (opengraph.dev, or just
paste the link into a group chat) once DNS is live.

---

### Restricting signups to campus email domains

Supabase doesn't gate signups by domain in the dashboard, and you **cannot** do
it with a trigger on `auth.users` — Supabase revoked write access to the `auth`
schema for the `postgres` role, so that fails with
`42501: permission denied for schema auth`. The supported mechanism is a
**Before User Created** auth hook (free plan, Postgres function).

Two steps, and it does nothing until you do both.

1. Run `supabase/migrations/20260819130000_signup_domain_hook.sql` in the SQL
   editor. It creates `public.restrict_signup_to_campus(event jsonb)`, grants it
   to `supabase_auth_admin`, and revokes it from `anon`/`authenticated`.
2. **Dashboard → Authentication → Hooks → Before User Created** → choose
   **Postgres**, select `public.restrict_signup_to_campus`, enable.

The hook checks the address against `universities.email_domains`, so adding a
campus is an insert rather than a code change:

```sql
insert into universities (name, short_name, city, email_domains, areas)
values ('Michigan State University', 'MSU', 'East Lansing, MI',
        array['msu.edu'], array['North', 'South', 'Off Campus']);
```

Verified behaviour (case-insensitive, and unknown `.edu` domains are rejected
too — it's an allowlist, not a `.edu` regex):

| signup email | result |
| --- | --- |
| `Javi@UMICH.edu` | allowed |
| `javi@gmail.com` | 403, "Looseleaf isn't on your campus yet…" |
| `someone@msu.edu` (before the insert above) | 403 |
| no email | 400 |

Calling the hook as `anon` or `authenticated` fails with permission denied, so
it can't be probed through the Data APIs.

### Wiring the keys

Local — create `.env.local` (git-ignored):

```
VITE_DATA_MODE=demo
VITE_SUPABASE_URL=https://xxxxxxxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
```

Vercel — Project → Settings → Environment Variables, same three keys, all
environments. Redeploy for them to take effect.

The anon key is *meant* to be public; it's safe in the browser because every
table has row-level security. The **service role** key is not — it bypasses all
policies. It never belongs in a `VITE_` variable or in this repo.

Set `VITE_DATA_MODE=supabase` once the migrations are applied — signup,
profiles, photos, events, and the waitlist all run live. Discovery, likes,
matches, and chat are not ported yet, and a campus stays closed until it has
enough members, so those surfaces aren't reachable. See
**[docs/GOING-LIVE.md](GOING-LIVE.md)**.

Missing keys aren't fatal: the app logs a warning and falls back to demo rather
than shipping a blank page.

---

## What "porting" actually means

`src/services/backend.js` is the only module the UI talks to. Each exported
function maps to a query the schema already supports:

| backend.js | Supabase |
| --- | --- |
| `getDeck` | `supabase.rpc('get_deck', { p_limit: 20 })` |
| `getIncomingLikes` | `from('likes').select('*, from_profile(*)').eq('to_profile', uid)` |
| `buildLike` | `from('likes').insert(...)` |
| `likeBack` | `supabase.rpc('create_match', { other })` → returns conversation id |
| `buildMessage` | `from('messages').insert(...)` + `channel('conv:<id>')` |
| `setTonight` | `from('tonight_status').upsert(...)` (expires on its own) |
| `loadState`/`saveState` | deleted — the session plus live queries replace them |

The three invariants the schema enforces, restated because they're the product:

1. No plan, tier, entitlement, or credit table exists. Nothing about who you see
   is purchasable.
2. The select policy on `likes` returns every like you receive, in full. No cap,
   no blur, no gate.
3. No coordinates, addresses, or last-seen timestamps are stored anywhere.
