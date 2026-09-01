# Deleting an account

Three things can be deleted, they are deliberately separate, and none of them
is finished by SQL alone.

| What | Called by | Refuses when |
|---|---|---|
| A student account | Settings → Delete account | never |
| A business | Partner Settings → Close this business | any redemption has been invoiced |
| A partner login | Partner Settings → Delete my login | you solely own a business |

---

## Why an Edge Function is involved at all

`delete_my_account()` clears the `public` schema and stops. Two things are
left over and neither is reachable from SQL run as the person leaving:

- **The files.** A bucket is not a foreign key. Deleting `profile_photos`
  removes the rows that point at the photos; the photos stay.
- **The auth user.** Supabase revoked write access to the `auth` schema — the
  same wall that made the signup domain check a hook rather than a trigger.
  Only the service role can delete a user, and the service role only exists in
  a function.

So `functions/delete-account` runs both halves, and the client treats a failure
there as a failed deletion rather than a cosmetic one. **Until it is deployed,
the student Delete button and the partner Delete-my-login button both fail with
an error** — which is the correct failure. The thing they replaced looked like
it worked.

## Deploy

```powershell
supabase db push
supabase functions deploy delete-account
```

`verify_jwt = true` is set in `config.toml`, so no flag is needed. No new
secrets: the function uses `SUPABASE_URL`, `SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY`, all supplied by the platform.

## Check it

1. Sign up a throwaway `.edu` account, add a photo, delete it from Settings.
2. In the SQL editor: `select count(*) from profiles where id = '<uid>';` → 0.
3. Auth → Users: the row is gone.
4. Storage → `profile-photos`: no folder for that uid.

## What survives on purpose

Two tables changed from `on delete cascade` to `on delete set null` in
`20260901120000_account_deletion.sql`, both because a row that is *about*
someone should not vanish when they leave if somebody else still needs it.

- **`reports`.** A report used to be deleted along with the person it was
  about, which meant: be reported, delete, sign up again, arrive with a clean
  queue. Now the report keeps its reason, date and triage state, and Backstage
  renders the person as "Unknown".
- **`recommendation_events`.** One student leaving used to remove impressions
  from every business they had been shown. A partner's Analytics page would
  show last month's total falling, for a month that already happened.

`date_passes.issued_to` was already `set null`, so the pass ledger — the thing
invoices are built from — was never at risk from a student leaving. That is why
`delete_my_account()` is four statements.

## The one case where the auth user stays

The same email can hold a student account and a partner login. Deleting the
auth user would take `partner_users` with it by cascade, stepping straight past
the sole-owner check and leaving a business nobody can fix. So when a student
deletes and also has a partner login, the profile goes and the login stays —
and the app says so instead of reporting a clean sweep.
