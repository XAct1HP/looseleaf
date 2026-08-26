# tests

SQL that asserts the things the product would be broken without, against a real
PostgreSQL 16 — not a mock. It is the only place the load-bearing promises of
the partner platform are actually *checked* rather than merely commented.

## Running it

```bash
createdb looseleaf_test
psql looseleaf_test -f tests/local-stubs.sql          # stand-ins for Supabase's auth/storage
for f in supabase/migrations/*.sql; do psql looseleaf_test -v ON_ERROR_STOP=1 -f "$f"; done
psql looseleaf_test -c "grant all on all tables in schema public to authenticated;
                        grant all on all sequences in schema public to authenticated;
                        grant execute on all functions in schema public to authenticated;"
psql looseleaf_test -f tests/partners_test.sql
```

Every check prints `PASS <what it means>`. The first failure aborts, because a
half-run privacy test is worse than no test at all.

`local-stubs.sql` recreates just enough of Supabase — `auth.uid()`, `auth.jwt()`,
`auth.users`, the `authenticated` role, a storage schema, and the realtime
publication — for the migrations to apply anywhere. `auth.uid()` reads a session
setting, so a test picks who it is acting as with
`select set_config('test.uid', '<uuid>', false)`.

Note the grants: without them, direct-table tests fail with "permission denied"
rather than with the RLS result you were trying to measure — which would make
every privacy assertion pass for entirely the wrong reason.

## What partners_test.sql asserts

**Relevance before payment.** Ask for coffee and a paying, featured brewery with
a live offer does not appear at all, while a free coffee shop ranks first. Ask
for dinner and the same partner ranks first, because now it fits. Within a set
that all match, a free spot that fits better still beats a paying one.

**Partners cannot reach dating data.** Acting as a real partner account through
the `authenticated` role, `date_passes`, `profiles`, `messages`, `likes`, and
`recommendation_events` all return zero rows. No partner-facing function returns
an OUT column whose name suggests a person — checked against
`information_schema`, not by reading the source.

**Students cannot reach partner data.** Billing, funnel events, and the
redemption ledger are all empty; a student sees their own pass and no others,
and calling `partner_overview()` raises.

**Redemption is atomic and single-use.** A pass redeems once, refuses the
second time with "Already used.", records exactly one redemption row, and lands
one verified date in the funnel. A code from another business reads as unknown
rather than as "exists but not yours", which would leak.

**Roles mean what they say.** An invitation puts nobody on the team until it is
accepted, doesn't show up for the wrong address, and can't be accepted by
someone holding the id. Staff can look a pass up — the whole point of the role
— but read zero rows from `date_passes` or `profiles`, can't add people, and
can't edit the Date Spot. The last owner can neither demote nor remove
themselves; with a second owner in place, both work.

**A role reaches exactly the pages it was given.** `partner_my_pages()` returns
`{scan}` for staff and `{scan,team}` for a manager, and every page outside that
list is checked twice — once as "the tab isn't there" and once as "the RPC
raises anyway". Staff read zero rows from `partner_offers`, including their own
employer's caps. A manager can invite staff and move people between staff and
manager, but cannot invite an owner, promote themselves to one, or remove one.
An owner granting `billing` takes effect immediately and revoking it takes
effect too. `settings` cannot be granted **even by writing it straight into
`partners.role_pages` by hand** — the assertion does exactly that and then
checks the manager still can't reach it.

**Scanning cannot be taken away.** `set_partner_role_pages()` puts `scan` back
into whatever it is handed, including an empty array. Writing
`{"manager": [], "staff": []}` straight into `partners.role_pages` still leaves
both roles reaching exactly `{scan}` and nothing else — and a student reaches
nothing at all, so the rule doesn't hand the scanner to strangers.

**Students read offers through the view, never the table.** Zero rows from
`partner_offers`, one from `public_offers`, and no column of the view whose
name suggests a cap, a count, or an internal status — so a business's
commercial limits stay the business's.

**Commercial state actually gates visibility.** Paying without approval isn't
live; approval without paying isn't live; a suspended partner stops being live
immediately; and a `past_due` subscription drops the spot out of both
recommendations and the spots directory.

**An offer is only as often as the business said.** A date-only perk refuses to
unlock from browsing, refuses a conversation id the caller isn't in, and works
inside a real one. A thirty-day cooldown refuses on day twenty-nine and allows
on day thirty-one, counted from the *redemption* — so unlocking a pass and
never going does not spend the allowance, and one person's visit costs nobody
else theirs. `once` does not quietly lapse after a year; `unlimited` still
means unlimited.

**A manager can register a business without becoming its owner.** The founding
manager reaches every page including Settings, so they can set up billing and
invite the actual owner — but cannot promote themselves, and hands the account
over automatically the moment an owner accepts. A manager who did *not*
register the place holds nothing, and writing `settings` into `role_pages` by
hand still gets neither of them anywhere.

**Discover is chosen, not shuffled.** A campus of fifty shows five people a
day, sixty shows six, a hundred shows ten, and five hundred still shows ten.
Asking twice in a day is the same five rather than five more; deciding about
somebody takes them out for good without pulling a replacement in the same day;
the next day tops back up to five; and a day you never opened does not stack up
to ten tomorrow. Preferences are checked **both ways** — somebody whose own
settings rule you out is never spent out of your five.

**Compatibility is fair to whoever answered least.** It means the same thing
from either side, a pair with no survey between them still scores, answering
the same way raises it and the opposite way lowers it, a middle answer is
halfway to both ends rather than a disagreement, and an unanswered question is
neither. Nothing that orders people mentions a table with a price on it —
asserted against `pg_get_functiondef`, not by reading the source.

**Nobody is sent somewhere they can't get into.** A 21+ bar is not suggested to
a twenty-year-old, and not suggested at all to somebody who said no to drinks.
Asking for nothing in particular suggests what the two of them both said they
liked. A business naming who it suits can only remove itself from suggestions,
never lift itself up them.
