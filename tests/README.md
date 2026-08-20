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

**Commercial state actually gates visibility.** Paying without approval isn't
live; approval without paying isn't live; a suspended partner stops being live
immediately; and a `past_due` subscription drops the spot out of both
recommendations and the spots directory.
