-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — reference data
--  Run after the migrations. Safe to re-run.
--
--  This file contains ONLY things the app needs in order to function: the
--  campus list, the interest vocabulary, and the prompt library. It contains
--  no people and no events — those come from real students now.
--
--  It contains no date spots either. A Date Spot names a real business, and
--  a seed file cannot vouch for one — they come from partners who signed up
--  and from Backstage → Spots, where a person picked them. Inventing an offer
--  for a real business is a claim about someone else's prices, not
--  placeholder content.
-- ═══════════════════════════════════════════════════════════════════════════

insert into universities (id, name, short_name, city, email_domains, areas)
values (
  '11111111-1111-4111-8111-111111111111',
  'University of Michigan',
  'Michigan',
  'Ann Arbor, MI',
  array['umich.edu'],
  array['Central Campus', 'North Campus', 'Off Campus', 'Medical Campus']
)
on conflict (id) do nothing;

--  The interest vocabulary moved into 20260828120000_compatibility.sql when it
--  grew from 28 tags to ~110 with categories. It lives in a migration rather
--  than here because `compatibility()` scores category overlap, so an interest
--  with no category is a row the engine cannot use — and a seed file is
--  optional in a way a migration is not. Nothing to do here; the migration has
--  already inserted them, and re-running it updates labels in place.

insert into prompt_catalog (category, text) values
  ('about',    'I’m weirdly competitive about...'),
  ('about',    'The way to my heart is...'),
  ('about',    'A fact about me that surprises people...'),
  ('about',    'I spend way too much money on...'),
  ('about',    'My simple pleasures are...'),
  ('about',    'You’d never guess that I...'),
  ('dating',   'My ideal first date is...'),
  ('dating',   'I’ll fall for you if...'),
  ('dating',   'The fastest way to get my attention is...'),
  ('dating',   'We’ll get along if...'),
  ('dating',   'Green flags I look for...'),
  ('dating',   'Dating me is like...'),
  ('campus',   'After class you’ll usually find me...'),
  ('campus',   'My campus hot take is...'),
  ('campus',   'The best study spot nobody talks about...'),
  ('campus',   'My major in one honest sentence...'),
  ('campus',   'Best thing I’ve done at Michigan so far...'),
  ('campus',   'The class that changed how I think...'),
  ('opinions', 'My most irrational opinion is...'),
  ('opinions', 'The hill I’ll die on is...'),
  ('opinions', 'Something everyone likes that I don’t get...'),
  ('opinions', 'I will always defend...'),
  ('random',   'A perfect Saturday looks like...'),
  ('random',   'My perfect Sunday...'),
  ('random',   'The last thing that made me laugh out loud...'),
  ('random',   'Two truths and a lie...'),
  ('random',   'My most-used emoji says a lot about me because...'),
  ('plans',    'We should absolutely...'),
  ('plans',    'Take me to..., I’ve never been'),
  ('plans',    'I’m always down for...'),
  ('plans',    'Let’s debate this over coffee:'),
  ('plans',    'Say yes to this and I am yours:')
on conflict (text) do nothing;

-- No date_spots here on purpose, for the same reason there are no events:
-- a Date Spot is a claim about a real business, and this file cannot make
-- one honestly. Partners create their own when they register. Everything
-- else on the page is added by hand in Backstage → Spots, by somebody who
-- has actually been there, and can be taken back off the same way.

-- No campus_events here on purpose. Events are student-submitted and
-- admin-approved (see the events policies in 20260819140000_real_users.sql).
-- An empty Events tab on day one is honest; a tab full of games that were
-- never scheduled is not.
