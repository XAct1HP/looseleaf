# How Loose Leaf decides

Two questions, one engine: **who you see**, and **where the two of you go**.

Everything here lives in `20260828120000_compatibility.sql`, is mirrored for the
demo campus in `src/lib/compatibility.js`, and is asserted in
`tests/partners_test.sql` §18.

---

## Why the ordering is the product

Discover is five people a day on a campus of fifty, and once you have decided
about somebody they never come back. That is a deliberate constraint, and it
changes what a sort is worth. With twenty people a day a mediocre order costs
somebody one scroll. With five it costs them a fifth of everyone they will ever
be shown on that campus.

So the deck is chosen, not shuffled, and the choosing is written down where it
can be argued with.

---

## How many people a day

**Ten percent of the campus, capped at ten.** `deck_size_for()`.

| Campus | A day's Discover |
| --- | --- |
| 50 (a campus opens here) | 5 |
| 60 | 6 |
| 100 | 10 |
| 500 | 10 |

A campus does not open below its threshold, so five is the floor in practice.
Roughly half of any campus is not somebody you are looking for, which makes the
opening week about five days of Discover before the pool runs dry — that is the
honest number, and it is why the empty state says two different things.

`deck_views` is the record of who has been handed to you. Three properties:

- **Reading the deck assigns it.** `get_deck()` is volatile and writes the row
  as it hands somebody over. Recomputing "the best five left" on every read is
  not a deck at all — pass on somebody and the next-best person slides up to
  take their place, and the day never ends.
- **Unacted people roll over.** Closing the app without deciding costs you
  nothing. The *top-up* is capped per day, not the pile, so a week away does
  not leave seventy people waiting.
- **The cap is also a privacy ceiling.** `knows()` — the no-directory rule from
  20260819160000 — treats a `deck_views` row as permission to read that
  profile. Ten a day is therefore also the most profiles any account can ever
  read, and only the ten Loose Leaf chose.

---

## Who is eligible at all

`deck_candidates()`, all filters, nothing scored: same campus, campus open, not
paused, onboarded, not blocked either way, not already decided about, not
already liked, not already matched — and **preferences checked in both
directions**.

That last one was a real flaw. The old deck checked your preferences and not
theirs, so it spent a fifth of a five-person day showing you somebody whose own
settings ruled you out, and showing them to you did nothing for either of you.

---

## Scoring a pair

`compatibility(a, b)`, out of 100, symmetric.

| What | Points | Why it's worth that |
| --- | --- | --- |
| Shared interests | 24 | The strongest single signal, and the one people actually recognise on a card |
| Shared interest *areas* | 8 | Two people with nothing exact in common can still both be outdoorsy |
| Here for the same thing | 16 | Relationship vs casual is the mismatch that wastes both people's time |
| Same idea of a date | 12 | From the survey — and it is what makes date-spot matching possible at all |
| Same idea of money | 6 | Being quietly out of your depth on the bill is a real way for a first date to go wrong |
| The six either/ors | 12 | 2 each; same answer 2, adjacent 1, opposite 0 |
| Same graduating year | 6 | Same year, one apart, or neither |
| Same corner of campus | 4 | You will actually run into each other |
| An org in common | 6 | Strong, and self-declared on both sides |
| Somebody you both know | 6 | The intersection `mutuals_with()` already shows |

### The one idea worth understanding

The score is **a percentage of what was achievable for that pair**, not of a
fixed 100. If either person skipped the survey, its thirty points leave the
denominator as well as the numerator.

Score against a fixed ceiling instead and everybody who skipped a question sits
permanently below everybody who answered — which punishes the person who has
told you least, exactly when you most want to give them a good first
impression. (`recommend_date_spots` learned the same lesson the hard way:
dividing by points nobody could earn stamped every "surprise us" suggestion
with 49% fit.)

### The middle answer is not a shrug

Each either/or has three options and the middle scores as *adjacent to both
ends*. A night owl and somebody who said "either" are not a mismatch, and
pretending they are would push everybody towards answering at the extremes.

Every end token is unique across the whole survey and the middle is always
`either`, which is what lets one four-line `trait_pos()` score all six
questions instead of six CASE blocks.

---

## What a student sees

A percentage and the reasons behind it, in one card. Not two: the number is the
arithmetic and the reasons are the arithmetic in words, and stacking them meant
reading "3 shared interests" directly above "3 interests in common".

Every line is something both people chose to put on their own profile.
`compatibility_reasons()` builds them in the order they carry weight, capped at
three.

---

## Where the two of you go

`recommend_date_spots()` already read both people's interests. It now reads
both people's survey answers, which changes what **"Surprise us"** means: not
the generically best place on campus, but the best place for the intersection
of two specific people — what they both call a good date, the lower of their
two budgets, the shorter of their two walks.

Two of the rules are hard exclusions rather than weights, because getting them
wrong is not a worse suggestion, it is a bad evening:

- **Minimum age.** A 21+ place is never suggested to a couple where either
  person is 19. `date_spots.min_age` had existed since the partner schema and
  nothing had ever read it.
- **Drinks.** If either of them said no to drinks, a drinks-only place is not
  suggested. Neither person is told which of them it was.

The commercial ceiling is unchanged and still asserted: a matching date type is
worth 34, and everything money can buy is worth at most 10, combined. The
couple's own answers are worth 12 — they can move a free place above a paying
one and never the other way round.

### The partner half

`partner_targeting` gained `interests`: *"we're a good fit for people into…"*.
Like every other column on that table it is a **narrowing filter** — set it and
the business is only suggested to couples where at least one of them has one of
those interests. It cannot make anybody appear more often.

That is not a limitation to work around, it is the deal: a business that could
buy its way into a conversation it doesn't belong in is a business whose
recommendation is worth nothing to the student reading it.

---

## Keeping the two implementations in step

The database is the authority. `src/lib/compatibility.js` exists so the demo
campus orders itself the same way a real one does — a demo that sorts people
differently is a demo of a different product. Same weight table, same names,
same order. Change one, change both.

The demo floors its deck at five rather than the two that ten percent of
eighteen invented people would give: five is what a real campus shows on the
day it opens, which is the behaviour worth demonstrating.
