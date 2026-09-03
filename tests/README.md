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

---

## `live_events_test.sql` — 110 assertions

Run the same way as `partners_test.sql`, after the same stubs and migrations:

```
psql -d ll -f tests/local-stubs.sql
for f in supabase/migrations/*.sql; do psql -d ll -f "$f"; done
psql -d ll -c "grant all on all tables in schema public to authenticated"
psql -d ll -f tests/live_events_test.sql
```

The three sections worth reading first are 5, 6/10 and 8; the rest is plumbing.

**No roster exists.** A participant reads exactly one participant row — their
own — plus their own answers, their own pairings and their own votes, and an
outsider reads none of it. What somebody learns about the person opposite comes
from `event_state()`, which returns a first name plus only the fields the host
marked `show_to_partner`; the test asserts a field marked shown gets through
and an unshown one does not, by value as well as by label.

**A host sees counts, never a vote, and never an email.** A host reads zero
rows from `live_event_votes` and zero from `live_event_matches`, and is still
told how many matches there were. `host_roster()` is asserted not to contain an
`@` address or any answer text — the protection is a hand-written select list,
so the test greps the JSON rather than trusting the shape.

**The rotation is actually a rotation.** Ten people over nine rounds produce
all 45 pairs, each exactly once, with no byes, no repeats, and no station used
twice in a round. A tenth round — where there is nobody new left to meet —
re-seats the whole room rather than stranding anybody. Seven people over seven
rounds give exactly one bye each: bye fairness is a hard constraint, chosen
before the search rather than scored during it, so `max - min <= 1` holds by
construction and not by luck. `across` mode never seats two people who gave the
same answer on the split field, and when the groups are uneven the surplus side
takes byes rather than the constraint being quietly dropped.

**A no is invisible, and a match is a promise.** One yes is not a match; a yes
and a no is not a match; the person turned down reads nothing about it. Two
profile-less people who match get no conversation — the row sits there until
they both build a profile, at which point a trigger opens the thread with the
canonical `a < b` ordering the rest of the app expects. That is the conversion
mechanic, and it is tested rather than hoped for.

**The event drives itself.** Polling `event_state()` mid-round changes nothing;
polling it after the round and its break have elapsed starts the next round —
so a host whose phone has locked cannot stall the room. It stops at
`planned_rounds` rather than generating byes forever. The clock is rewound with
an `update` rather than a `sleep`, because a test that waits four minutes is a
test nobody runs.

Section 17 (suspending a host) is deliberately last: it kills every event that
host owns, so anything reading one of them has to have run already.
