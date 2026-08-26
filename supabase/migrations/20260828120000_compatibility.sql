-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — the compatibility engine
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Discover is deliberately tiny: a handful of people a day, and once you have
--  passed on somebody they never come back. That makes *ordering* the entire
--  product. With twenty people a day, a mediocre sort costs a student one
--  scroll. With five, it costs them a fifth of everyone they will ever be
--  shown. This file is the ordering.
--
--  Four things happen here:
--
--   1. **The interest list grows** from 28 flat tags to ~110 grouped into
--      thirteen categories, so two people who share nothing exactly can still
--      be scored as both-outdoorsy rather than as strangers.
--
--   2. **A short survey** — how you like to spend a date, roughly what it
--      should cost, and six either/ors about how you actually live. All
--      optional. See `profile_survey`.
--
--   3. **`compatibility(a, b)`** scores a pair out of 100, and — this is the
--      part that matters — scores it *as a percentage of what was achievable
--      for that pair*. Somebody who skipped the survey cannot earn the survey
--      points, so a raw total would bury them forever behind anybody who
--      answered. The same lesson `recommend_date_spots` learned about
--      "surprise us" stamping every suggestion with 49% fit.
--
--   4. **`get_deck()` is rewritten** around three rules the old one didn't
--      have: preferences are checked *both ways*, the day's people are chosen
--      by compatibility, and the deck is exactly **10% of the campus, capped
--      at 10** — five people the day a campus opens at fifty.
--
--  The invariant from 20260819120000 still holds and is asserted again in the
--  tests: nothing in this file joins a plan, a subscription, a credit row or a
--  date_spot. Ordering people has no price.
-- ═══════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════════════════════════════
--  1 · Interests, grouped
-- ═══════════════════════════════════════════════════════════════════════════

alter table interests add column if not exists category text;
alter table interests add column if not exists sort     int not null default 0;

comment on column interests.category is
  'Grouping for the picker, and the softer signal underneath exact matches in '
  'compatibility(). Mirrors INTEREST_CATEGORIES in src/data/catalog.js.';

--  Idempotent, and it updates rather than skipping: this is the same list as
--  src/data/catalog.js and the two drifting apart is the failure mode. Ids are
--  foreign keys on real people's profiles, so ids never change — only labels,
--  emoji and category do.
insert into interests (id, label, emoji, category, sort) values
  ('live-music',     'Live music',        '🎶',  'music',     10),
  ('concerts',       'Concerts',          '🎤',  'music',     11),
  ('festivals',      'Festivals',         '🎪',  'music',     12),
  ('vinyl',          'Vinyl',             '📀',  'music',     13),
  ('karaoke',        'Karaoke',           '🎙️',  'music',     14),
  ('making-music',   'Playing music',     '🎸',  'music',     15),
  ('djing',          'DJing',             '🎧',  'music',     16),
  ('hip-hop',        'Hip-hop',           '🔊',  'music',     17),
  ('country',        'Country',           '🤠',  'music',     18),
  ('indie',          'Indie',             '🎵',  'music',     19),
  ('edm',            'EDM',               '🪩',  'music',     20),

  ('football',       'Football',          '🏈',  'sports',    30),
  ('basketball',     'Basketball',        '🏀',  'sports',    31),
  ('hockey',         'Hockey',            '🏒',  'sports',    32),
  ('baseball',       'Baseball',          '⚾',  'sports',    33),
  ('soccer',         'Soccer',            '⚽',  'sports',    34),
  ('volleyball',     'Volleyball',        '🏐',  'sports',    35),
  ('tennis',         'Tennis',            '🎾',  'sports',    36),
  ('golf',           'Golf',              '⛳',  'sports',    37),
  ('pickleball',     'Pickleball',        '🥒',  'sports',    38),
  ('tailgating',     'Tailgates',         '🚙',  'sports',    39),
  ('college-sports', 'College games',     '📣',  'sports',    40),
  ('f1',             'F1',                '🏁',  'sports',    41),
  ('fantasy-sports', 'Fantasy leagues',   '📊',  'sports',    42),

  ('gym',            'Gym',               '🏋️',  'fitness',   50),
  ('lifting',        'Lifting',           '💪',  'fitness',   51),
  ('running',        'Running',           '🏃',  'fitness',   52),
  ('run-club',       'Run club',          '👟',  'fitness',   53),
  ('yoga',           'Yoga',              '🧘',  'fitness',   54),
  ('pilates',        'Pilates',           '🤸',  'fitness',   55),
  ('climbing',       'Climbing',          '🧗',  'fitness',   56),
  ('swimming',       'Swimming',          '🏊',  'fitness',   57),
  ('cycling',        'Cycling',           '🚴',  'fitness',   58),
  ('skiing',         'Skiing',            '🎿',  'fitness',   59),
  ('snowboarding',   'Snowboarding',      '🏂',  'fitness',   60),
  ('skating',        'Skating',           '🛹',  'fitness',   61),
  ('martial-arts',   'Martial arts',      '🥋',  'fitness',   62),
  ('dance',          'Dance',             '💃',  'fitness',   63),
  ('intramurals',    'Intramurals',       '🏆',  'fitness',   64),

  ('hiking',         'Hiking',            '🥾',  'outdoors',  70),
  ('camping',        'Camping',           '⛺',  'outdoors',  71),
  ('backpacking',    'Backpacking',       '🎒',  'outdoors',  72),
  ('fishing',        'Fishing',           '🎣',  'outdoors',  73),
  ('kayaking',       'Kayaking',          '🛶',  'outdoors',  74),
  ('beach',          'The lake',          '🏖️',  'outdoors',  75),
  ('stargazing',     'Stargazing',        '🌌',  'outdoors',  76),
  ('gardening',      'Gardening',         '🌱',  'outdoors',  77),
  ('national-parks', 'National parks',    '🏞️',  'outdoors',  78),

  ('coffee',         'Coffee',            '☕',  'food',      90),
  ('tea',            'Tea',               '🍵',  'food',      91),
  ('boba',           'Boba',              '🧋',  'food',      92),
  ('cooking',        'Cooking',           '🍳',  'food',      93),
  ('baking',         'Baking',            '🧁',  'food',      94),
  ('brunch',         'Brunch',            '🥞',  'food',      95),
  ('foodie',         'Trying new places', '🍜',  'food',      96),
  ('bbq',            'BBQ',               '🍖',  'food',      97),
  ('sushi',          'Sushi',             '🍣',  'food',      98),
  ('spicy-food',     'Spicy food',        '🌶️',  'food',      99),
  ('dessert',        'Dessert first',     '🍨',  'food',     100),
  ('craft-beer',     'Craft beer',        '🍺',  'food',     101),
  ('wine',           'Wine',              '🍷',  'food',     102),
  ('cocktails',      'Cocktails',         '🍸',  'food',     103),
  ('farmers-market', 'Farmers market',    '🥕',  'food',     104),

  ('art',            'Art',               '🎨',  'making',   110),
  ('drawing',        'Drawing',           '✏️',  'making',   111),
  ('painting',       'Painting',          '🖌️',  'making',   112),
  ('photography',    'Photography',       '📷',  'making',   113),
  ('filmmaking',     'Filmmaking',        '🎥',  'making',   114),
  ('writing',        'Writing',           '✍️',  'making',   115),
  ('poetry',         'Poetry',            '📝',  'making',   116),
  ('crafts',         'Crafts',            '🧶',  'making',   117),
  ('ceramics',       'Ceramics',          '🏺',  'making',   118),
  ('woodworking',    'Woodworking',       '🪵',  'making',   119),
  ('design',         'Design',            '🖍️',  'making',   120),
  ('fashion',        'Fashion',           '👗',  'making',   121),
  ('diy',            'Fixing things',     '🔧',  'making',   122),

  ('movies',         'Movies',            '🎬',  'screens',  130),
  ('tv',             'TV shows',          '📺',  'screens',  131),
  ('horror',         'Horror',            '👻',  'screens',  132),
  ('rom-coms',       'Rom-coms',          '💘',  'screens',  133),
  ('documentaries',  'Documentaries',     '🎞️',  'screens',  134),
  ('anime',          'Anime',             '🍥',  'screens',  135),
  ('reading',        'Reading',           '📚',  'screens',  136),
  ('true-crime',     'True crime',        '🔍',  'screens',  137),
  ('podcasts',       'Podcasts',          '🎧',  'screens',  138),
  ('comics',         'Comics',            '💥',  'screens',  139),
  ('theater',        'Theater',           '🎭',  'screens',  140),

  ('gaming',         'Gaming',            '🎮',  'games',    150),
  ('board-games',    'Board games',       '🎲',  'games',    151),
  ('chess',          'Chess',             '♟️',  'games',    152),
  ('dnd',            'D&D',               '🐉',  'games',    153),
  ('trivia',         'Trivia nights',     '❓',  'games',    154),
  ('poker',          'Poker',             '🃏',  'games',    155),
  ('arcade',         'Arcades',           '🕹️',  'games',    156),
  ('puzzles',        'Puzzles',           '🧩',  'games',    157),

  ('clubbing',       'Clubbing',          '🪩',  'going-out', 170),
  ('bars',           'Bars',              '🍻',  'going-out', 171),
  ('house-parties',  'House parties',     '🏠',  'going-out', 172),
  ('comedy',         'Comedy shows',      '🎙️',  'going-out', 173),
  ('museums',        'Museums',           '🖼️',  'going-out', 174),
  ('thrifting',      'Thrifting',         '🧥',  'going-out', 175),
  ('road-trips',     'Road trips',        '🛣️',  'going-out', 176),

  ('long-walks',     'Long walks',        '🚶',  'quiet',    190),
  ('journaling',     'Journaling',        '📔',  'quiet',    191),
  ('plants',         'Plants',            '🪴',  'quiet',    192),
  ('meditation',     'Meditation',        '🧘‍♀️', 'quiet',   193),

  ('volunteering',   'Volunteering',      '🤝',  'campus',   200),
  ('greek-life',     'Greek life',        '🏛️',  'campus',   201),
  ('research',       'Research',          '🔬',  'campus',   202),
  ('startups',       'Startups',          '🚀',  'campus',   203),
  ('debate',         'Debate',            '🗣️',  'campus',   204),
  ('tutoring',       'Tutoring',          '📐',  'campus',   205),
  ('club-sports',    'Club sports',       '🥅',  'campus',   206),
  ('student-media',  'Student media',     '📰',  'campus',   207),

  ('travel',         'Travel',            '✈️',  'world',    220),
  ('study-abroad',   'Study abroad',      '🌍',  'world',    221),
  ('languages',      'Languages',         '🗺️',  'world',    222),
  ('history',        'History',           '🏺',  'world',    223),
  ('cars',           'Cars',              '🚗',  'world',    224),
  ('motorcycles',    'Motorcycles',       '🏍️',  'world',    225),

  ('dogs',           'Dogs',              '🐕',  'animals',  240),
  ('cats',           'Cats',              '🐈',  'animals',  241),
  ('horses',         'Horses',            '🐎',  'animals',  242)
on conflict (id) do update
  set label    = excluded.label,
      emoji    = excluded.emoji,
      category = excluded.category,
      sort     = excluded.sort;


-- ═══════════════════════════════════════════════════════════════════════════
--  2 · The survey
-- ═══════════════════════════════════════════════════════════════════════════
--
--  Every column is nullable, and being null is not the same as being average:
--  an unanswered question is *excluded from the denominator* rather than
--  scored as a miss. See `compatibility()`.
--
--  `ideal_dates` is the one that earns its place twice. It says something real
--  about a person, and it is the only thing that lets Loose Leaf suggest a
--  place two specific people would both actually enjoy — the tokens are
--  `date_spots.date_types`, which is the vocabulary businesses already
--  describe themselves in.

create table if not exists profile_survey (
  profile_id       uuid primary key references profiles (id) on delete cascade,

  -- how you like a date to go
  ideal_dates      text[] not null default '{}',
  budget_level     int check (budget_level between 1 and 4),
  max_walk_minutes int check (max_walk_minutes between 5 and 60),
  drinks           text check (drinks in ('never', 'sometimes', 'happy-to')),

  -- six either/ors, each with a middle. Ends are unique across the whole
  -- survey and the middle is always 'either' — that is what lets one tiny
  -- position function score all six.
  going_out        text check (going_out    in ('homebody', 'either', 'out-out')),
  chronotype       text check (chronotype   in ('early', 'either', 'night')),
  planning         text check (planning     in ('planner', 'either', 'spontaneous')),
  group_size       text check (group_size   in ('one-on-one', 'either', 'big-group')),
  texting          text check (texting      in ('texter', 'either', 'in-person')),
  conversation     text check (conversation in ('deep', 'either', 'light')),

  updated_at       timestamptz not null default now()
);

alter table profile_survey enable row level security;

--  Same shape as every other profile-adjacent table: yours to write, readable
--  by the people who can already read your profile. It rides on the `profiles`
--  select policy rather than repeating it, so the no-directory rule from
--  20260819160000 keeps applying without being restated (and without being
--  forgotten the next time it changes).
drop policy if exists "survey: yours" on profile_survey;
create policy "survey: yours" on profile_survey
  for all to authenticated
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

drop policy if exists "survey: readable with the profile" on profile_survey;
create policy "survey: readable with the profile" on profile_survey
  for select to authenticated
  using (exists (select 1 from profiles p where p.id = profile_survey.profile_id));

drop trigger if exists profile_survey_touch on profile_survey;
create trigger profile_survey_touch before update on profile_survey
  for each row execute function public.touch_updated_at();


-- ═══════════════════════════════════════════════════════════════════════════
--  3 · Scoring a pair
-- ═══════════════════════════════════════════════════════════════════════════

--  1 · 2 · 3 for the two ends and the middle of any either/or. The middle
--  token is shared across all six questions and every end token is unique,
--  which is the whole reason this is one function and not six CASE blocks.
create or replace function public.trait_pos(v text)
returns int
language sql immutable as $$
  select case v
    when 'homebody'    then 1  when 'out-out'     then 3
    when 'early'       then 1  when 'night'       then 3
    when 'planner'     then 1  when 'spontaneous' then 3
    when 'one-on-one'  then 1  when 'big-group'   then 3
    when 'texter'      then 1  when 'in-person'   then 3
    when 'deep'        then 1  when 'light'       then 3
    when 'either'      then 2
    else null
  end;
$$;

--  Two answers to the same either/or, scored 2 · 1 · 0. A middle answer is
--  *adjacent to both ends*, not a shrug: an early bird and somebody who said
--  "either" get a point, because they are genuinely fine together.
create or replace function public.trait_agreement(a text, b text)
returns int
language sql immutable as $$
  select case
    when a is null or b is null then null
    when public.trait_pos(a) is null or public.trait_pos(b) is null then null
    else greatest(0, 2 - abs(public.trait_pos(a) - public.trait_pos(b)))
  end;
$$;

--  How close two intentions are. Relationship↔casual is the mismatch this
--  exists to catch; everything adjacent on the scale is fine.
create or replace function public.intention_pos(v intention)
returns int
language sql immutable as $$
  select case v
    when 'relationship' then 1
    when 'dating'       then 2
    when 'seeing'       then 3
    when 'events'       then 3
    when 'casual'       then 4
  end;
$$;

/*
  ── compatibility(a, b) ─────────────────────────────────────────────────────

  Out of 100, and symmetric: compatibility(a,b) = compatibility(b,a). Every
  term below is something *both* people chose to put on their own profile.

    shared interests          24   the strongest single signal
    shared interest areas      8   both outdoorsy, even with nothing exact
    here for the same thing   16   relationship vs casual is the real mismatch
    same idea of a date       12
    same idea of money         6
    the six either/ors        12
    same graduating year       6
    same corner of campus      4
    an org in common           6
    a mutual connection        6

  **Scored against what was achievable for this pair.** If either person
  skipped the survey, its 30 points leave the denominator as well as the
  numerator — otherwise everybody who skipped it would sit permanently below
  everybody who answered, which is a worse product for the person who is
  already giving you the least information.
*/
create or replace function public.compatibility(p_a uuid, p_b uuid)
returns int
language plpgsql stable security definer set search_path = public as $$
declare
  a profiles%rowtype;
  b profiles%rowtype;
  sa profile_survey%rowtype;
  sb profile_survey%rowtype;
  earned    numeric := 0;
  available numeric := 0;
  n         int;
  t         int;
begin
  select * into a from profiles where id = p_a;
  select * into b from profiles where id = p_b;
  if a.id is null or b.id is null then return 0; end if;

  select * into sa from profile_survey where profile_id = p_a;
  select * into sb from profile_survey where profile_id = p_b;

  -- ── interests, exactly ──────────────────────────────────────────────────
  select count(*) into n
  from profile_interests x
  join profile_interests y on y.interest_id = x.interest_id
  where x.profile_id = p_a and y.profile_id = p_b;

  if exists (select 1 from profile_interests where profile_id = p_a)
     and exists (select 1 from profile_interests where profile_id = p_b) then
    available := available + 24;
    earned := earned + least(24, 8 * n);
  end if;

  -- ── interests, roughly ──────────────────────────────────────────────────
  --  Two people with no exact overlap can still both be outdoorsy. Worth
  --  little on its own, worth a lot on a small campus where exact overlap is
  --  rare and the alternative is ordering by nothing.
  select count(*) into n from (
    select i.category
    from profile_interests x join interests i on i.id = x.interest_id
    where x.profile_id = p_a and i.category is not null
    intersect
    select i.category
    from profile_interests y join interests i on i.id = y.interest_id
    where y.profile_id = p_b and i.category is not null
  ) shared;

  if exists (select 1 from profile_interests where profile_id = p_a)
     and exists (select 1 from profile_interests where profile_id = p_b) then
    available := available + 8;
    earned := earned + least(8, 2 * n);
  end if;

  -- ── here for the same thing ─────────────────────────────────────────────
  available := available + 16;
  earned := earned + case abs(public.intention_pos(a.intention) - public.intention_pos(b.intention))
                       when 0 then 16
                       when 1 then 10
                       when 2 then 4
                       else 0
                     end;

  -- ── the same idea of a date ─────────────────────────────────────────────
  if cardinality(sa.ideal_dates) > 0 and cardinality(sb.ideal_dates) > 0 then
    available := available + 12;
    select count(*) into n
    from (select unnest(sa.ideal_dates) intersect select unnest(sb.ideal_dates)) s;
    earned := earned + least(12, 6 * n);
  end if;

  -- ── the same idea of money ──────────────────────────────────────────────
  --  Not "the same number" — one apart is fine. This is here because being
  --  quietly out of your depth on the bill is a real way for a good first
  --  date to go wrong.
  if sa.budget_level is not null and sb.budget_level is not null then
    available := available + 6;
    earned := earned + case abs(sa.budget_level - sb.budget_level)
                         when 0 then 6 when 1 then 4 when 2 then 1 else 0 end;
  end if;

  -- ── the six either/ors ──────────────────────────────────────────────────
  foreach t in array array[1, 2, 3, 4, 5, 6] loop
    declare
      va text;
      vb text;
      agree int;
    begin
      va := case t when 1 then sa.going_out when 2 then sa.chronotype
                   when 3 then sa.planning  when 4 then sa.group_size
                   when 5 then sa.texting   else sa.conversation end;
      vb := case t when 1 then sb.going_out when 2 then sb.chronotype
                   when 3 then sb.planning  when 4 then sb.group_size
                   when 5 then sb.texting   else sb.conversation end;
      agree := public.trait_agreement(va, vb);
      if agree is not null then
        available := available + 2;
        earned := earned + agree;
      end if;
    end;
  end loop;

  -- ── the same year ───────────────────────────────────────────────────────
  --  A first-year and a final-year is not a moral failing, but it is a
  --  different life, and on a campus it is a real predictor.
  available := available + 6;
  earned := earned + case
    when a.grad_year = b.grad_year then 6
    when abs(coalesce(nullif(regexp_replace(a.grad_year, '\D', '', 'g'), ''), '0')::int
           - coalesce(nullif(regexp_replace(b.grad_year, '\D', '', 'g'), ''), '0')::int) = 1 then 3
    else 0 end;

  -- ── the same corner of campus ───────────────────────────────────────────
  if a.area is not null and b.area is not null then
    available := available + 4;
    earned := earned + case when a.area = b.area then 4 else 0 end;
  end if;

  -- ── an org in common ────────────────────────────────────────────────────
  if cardinality(a.orgs) > 0 and cardinality(b.orgs) > 0 then
    available := available + 6;
    select count(*) into n
    from (select unnest(a.orgs) intersect select unnest(b.orgs)) s;
    earned := earned + case when n > 0 then 6 else 0 end;
  end if;

  -- ── somebody you both know ──────────────────────────────────────────────
  --  An intersection of two accepted-connection lists, which is exactly what
  --  mutuals_with() already shows a student. It moves the ranking; it does not
  --  reveal anything the profile wouldn't.
  available := available + 6;
  select count(*) into n from (
    select case when c.profile_id = p_a then c.friend_id else c.profile_id end as who
    from connections c
    where c.accepted and (c.profile_id = p_a or c.friend_id = p_a)
    intersect
    select case when c.profile_id = p_b then c.friend_id else c.profile_id end
    from connections c
    where c.accepted and (c.profile_id = p_b or c.friend_id = p_b)
  ) s;
  earned := earned + case when n > 0 then 6 else 0 end;

  if available <= 0 then return 50; end if;
  return greatest(1, least(99, round(100 * earned / available)))::int;
end;
$$;

/*
  The same arithmetic, in words, for the card. Ordered by how much each thing
  actually moved the score, capped at three, and never saying anything the
  profile itself doesn't already show — this is a summary of two public
  profiles, not a disclosure.
*/
create or replace function public.compatibility_reasons(p_a uuid, p_b uuid)
returns text[]
language plpgsql stable security definer set search_path = public as $$
declare
  a profiles%rowtype;
  b profiles%rowtype;
  sa profile_survey%rowtype;
  sb profile_survey%rowtype;
  out_lines text[] := '{}';
  n int;
  first_shared text;
  org text;
begin
  select * into a from profiles where id = p_a;
  select * into b from profiles where id = p_b;
  if a.id is null or b.id is null then return out_lines; end if;
  select * into sa from profile_survey where profile_id = p_a;
  select * into sb from profile_survey where profile_id = p_b;

  select count(*), min(i.label) into n, first_shared
  from profile_interests x
  join profile_interests y on y.interest_id = x.interest_id
  join interests i on i.id = x.interest_id
  where x.profile_id = p_a and y.profile_id = p_b;

  if n = 1 then
    out_lines := out_lines || format('You both put %s', lower(first_shared));
  elsif n > 1 then
    out_lines := out_lines || format('%s interests in common', n);
  end if;

  if cardinality(sa.ideal_dates) > 0 and cardinality(sb.ideal_dates) > 0 then
    select count(*) into n
    from (select unnest(sa.ideal_dates) intersect select unnest(sb.ideal_dates)) s;
    if n > 0 then
      out_lines := out_lines || 'You want the same kind of date';
    end if;
  end if;

  select count(*) into n from (
    select case when c.profile_id = p_a then c.friend_id else c.profile_id end as who
    from connections c where c.accepted and (c.profile_id = p_a or c.friend_id = p_a)
    intersect
    select case when c.profile_id = p_b then c.friend_id else c.profile_id end
    from connections c where c.accepted and (c.profile_id = p_b or c.friend_id = p_b)
  ) s;
  if n > 0 then
    out_lines := out_lines || format('%s mutual connection%s', n, case when n > 1 then 's' else '' end);
  end if;

  if a.intention = b.intention then
    out_lines := out_lines || format('You’re both here for the same thing');
  end if;

  select min(o) into org from (select unnest(a.orgs) intersect select unnest(b.orgs)) t(o);
  if org is not null then
    out_lines := out_lines || format('You’re both in %s', org);
  end if;

  if public.trait_agreement(sa.chronotype, sb.chronotype) = 2 and sa.chronotype = 'night' then
    out_lines := out_lines || 'You’re both night owls';
  elsif public.trait_agreement(sa.chronotype, sb.chronotype) = 2 and sa.chronotype = 'early' then
    out_lines := out_lines || 'You’re both up early';
  end if;

  if public.trait_agreement(sa.going_out, sb.going_out) = 2 and sa.going_out = 'homebody' then
    out_lines := out_lines || 'Neither of you needs a big night out';
  end if;

  if a.grad_year = b.grad_year then
    out_lines := out_lines || format('Both graduating in ’%s', a.grad_year);
  end if;

  if a.area is not null and a.area = b.area then
    out_lines := out_lines || format('Both around %s', a.area);
  end if;

  return out_lines[1:3];
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  4 · The deck
-- ═══════════════════════════════════════════════════════════════════════════

/*
  ── How many people a day ───────────────────────────────────────────────────

  Ten percent of the campus, capped at ten. Fifty people — the threshold a
  campus opens at — is five a day. A hundred is ten, and it never goes above
  that however big the campus gets.

  The arithmetic is the product decision, so it lives in one function that the
  deck, the counter on the Discover header and the tests all read. Roughly half
  the campus is not somebody you are looking for, so five a day out of fifty is
  about five days of Discover before the pool is genuinely dry — which is the
  honest number, and the reason the empty state below says what it says.
*/
create or replace function public.deck_size_for(p_campus uuid)
returns int
language sql stable security definer set search_path = public as $$
  select greatest(1, least(10, round(public.campus_member_count(p_campus) / 10.0)::int));
$$;

--  `deck_views` stops meaning "seen" and starts meaning "assigned to you, once,
--  for good". `acted_at` is what separates *you have not opened the app* from
--  *you decided about this person* — without it, a day you never opened would
--  silently burn five people you were never shown.
alter table deck_views add column if not exists acted_at timestamptz;

create index if not exists deck_views_pending_idx
  on deck_views (profile_id, seen_at desc) where acted_at is null;

/*
  ── Who is even eligible ────────────────────────────────────────────────────

  The old deck checked *your* preferences and not theirs, so it spent a scarce
  daily allowance showing you people whose own settings excluded you. With
  twenty a day that was a rounding error. With five it is a fifth of your day,
  and it is also a small cruelty in both directions.

  So preferences are now checked both ways. Everything in here is a filter —
  a hard yes or no — and nothing in here is scored.
*/
create or replace function public.deck_candidates()
returns setof profiles
language sql stable security definer set search_path = public as $$
  select p.*
  from profiles p
  join profiles me on me.id = auth.uid()
  join profile_preferences mine on mine.profile_id = me.id
  left join profile_preferences theirs on theirs.profile_id = p.id
  join universities u on u.id = me.university_id
  where p.id <> me.id
    and (u.is_live or public.campus_member_count(u.id) >= u.open_threshold)
    and p.is_paused = false
    and p.onboarded_at is not null
    and p.university_id = me.university_id
    -- what you asked for
    and p.age between mine.min_age and mine.max_age
    and (
      cardinality(mine.interested_in) = 0
      or 'everyone' = any (mine.interested_in)
      or p.gender = any (mine.interested_in)
    )
    -- and what they asked for
    and (theirs.profile_id is null or me.age between theirs.min_age and theirs.max_age)
    and (
      theirs.profile_id is null
      or cardinality(theirs.interested_in) = 0
      or 'everyone' = any (theirs.interested_in)
      or me.gender = any (theirs.interested_in)
    )
    and not public.blocked_between(me.id, p.id)
    and not exists (select 1 from deck_views v where v.profile_id = me.id and v.seen_id = p.id)
    and not exists (select 1 from likes l where l.from_profile = me.id and l.to_profile = p.id)
    and not public.is_matched_with(p.id);
$$;

/*
  ── Today's deck ────────────────────────────────────────────────────────────

  Volatile, because reading the deck is also what assigns it. That is
  deliberate and it is load-bearing twice over:

  * A person assigned to you is a person you will never be offered again, so
    the assignment has to be written down at the moment it happens rather than
    recomputed. Recomputing would mean a different sort order tomorrow quietly
    re-showing somebody.
  * `knows()` — the no-directory rule from 20260819160000 — treats a
    `deck_views` row as permission to read that profile. So the daily cap is
    not only a product decision about pacing, it is also the ceiling on how
    many strangers' profiles any one account can ever read. Ten a day, and only
    the ten Loose Leaf chose.

  Unacted assignments roll over rather than expiring, so closing the app
  without deciding costs you nothing; the top-up is what is capped per day, not
  the pile.
*/
--  It used to return `setof profiles`, which Postgres will not let a
--  `create or replace` widen. It has to hand back the fit and the reasons with
--  the person now — a second round trip per card to ask "and how well do these
--  two match?" would be a query per person shown.
drop function if exists public.get_deck(int);

create or replace function public.get_deck(p_limit int default null)
returns table (
  id            uuid,
  university_id uuid,
  first_name    text,
  gender        text,
  pronouns      text,
  grad_year     text,
  major         text,
  minor         text,
  area          text,
  orgs          text[],
  intention     intention,
  age           int,
  fit           int,
  reasons       text[]
)
language plpgsql volatile security definer set search_path = public as $$
declare
  v_me      uuid := auth.uid();
  v_campus  uuid;
  v_size    int;
  v_today   int;
  v_pending int;
  v_room    int;
begin
  --  Aliased, because the OUT parameters above shadow the column names inside
  --  the body — the same plpgsql trap `issue_date_pass` hit.
  select me.university_id into v_campus from profiles me where me.id = v_me;
  if v_campus is null then return; end if;

  v_size := coalesce(p_limit, public.deck_size_for(v_campus));

  select count(*) into v_today
  from deck_views where profile_id = v_me and seen_at::date = current_date;

  select count(*) into v_pending
  from deck_views where profile_id = v_me and acted_at is null;

  --  Two ceilings, and the smaller wins: no more than a day's worth handed out
  --  today, and no more than a day's worth waiting for you at any moment.
  v_room := least(v_size - v_today, v_size - v_pending);

  if v_room > 0 then
    insert into deck_views (profile_id, seen_id)
    select v_me, c.id
    from public.deck_candidates() c
    order by public.compatibility(v_me, c.id) desc,
             -- A stable shuffle underneath the score, so an unlucky tie isn't
             -- the same unlucky tie every day.
             md5(c.id::text || v_me::text || current_date::text)
    limit v_room
    on conflict (profile_id, seen_id) do nothing;
  end if;

  return query
  select p.id, p.university_id, p.first_name, p.gender, p.pronouns, p.grad_year,
         p.major, p.minor, p.area, p.orgs, p.intention, p.age,
         public.compatibility(v_me, p.id),
         public.compatibility_reasons(v_me, p.id)
  from deck_views v
  join profiles p on p.id = v.seen_id
  where v.profile_id = v_me
    and v.acted_at is null
    and p.is_paused = false
    and not public.blocked_between(v_me, p.id)
  order by public.compatibility(v_me, p.id) desc, v.seen_at
  limit v_size;
end;
$$;

--  Liking or passing is deciding, and deciding is what retires somebody from
--  the deck. Called by the client after either; idempotent.
create or replace function public.mark_deck_acted(p_person uuid)
returns void
language sql volatile security definer set search_path = public as $$
  insert into deck_views (profile_id, seen_id, acted_at)
  values (auth.uid(), p_person, now())
  on conflict (profile_id, seen_id)
    do update set acted_at = coalesce(deck_views.acted_at, now());
$$;

/*
  What the Discover page needs to say something true when there is nobody
  there — because "that's everyone for today" and "there is nobody left on this
  campus for you" are different sentences, and telling somebody the first when
  the second is true means they come back tomorrow to the same empty screen.
*/
create or replace function public.deck_status()
returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v_me     uuid := auth.uid();
  v_campus uuid;
  v_size   int;
  v_left   int;
  v_today  int;
  v_open   boolean;
begin
  select university_id into v_campus from profiles where id = v_me;
  if v_campus is null then return jsonb_build_object('error', 'no profile'); end if;

  select (u.is_live or public.campus_member_count(u.id) >= u.open_threshold)
    into v_open from universities u where u.id = v_campus;

  v_size := public.deck_size_for(v_campus);
  select count(*) into v_left from public.deck_candidates();
  select count(*) into v_today
  from deck_views where profile_id = v_me and seen_at::date = current_date;

  return jsonb_build_object(
    'campus_open',   v_open,
    'daily_size',    v_size,
    'shown_today',   v_today,
    'pool_left',     v_left,
    'members',       public.campus_member_count(v_campus)
  );
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  5 · Somewhere for the two of you to go
-- ═══════════════════════════════════════════════════════════════════════════
--
--  `recommend_date_spots` already read both people's interests. It now reads
--  both people's survey answers as well, which changes what "Surprise us"
--  means: instead of the generic best place on campus, it is the best place
--  for the *intersection* of two specific people — what they both call a good
--  date, the lower of their two budgets, the shorter of their two walks.
--
--  Two of the new rules are hard exclusions rather than weights, because
--  getting them wrong is not a worse suggestion, it is a bad evening:
--
--   · **Minimum age.** A spot with `min_age` 21 is not suggested to a couple
--     where either person is 19. That column has existed since the partner
--     schema and nothing ever read it.
--   · **Drinks.** If either person said no to drinks, a drinks-only place is
--     not suggested to them. Somebody's Friday should not depend on the other
--     person's answer being the loud one.
--
--  The commercial cap is untouched at 10, and everything added here is
--  relevance the *students* declared, not anything a business can buy.

alter table partner_targeting add column if not exists interests text[] not null default '{}';

comment on column partner_targeting.interests is
  'Optional. When set, this business is only suggested to couples where at '
  'least one of them has one of these interests. A narrowing filter, like '
  'every other column here — it can never make a partner appear more often.';

create or replace function public.recommend_date_spots(
  p_date_type      text default null,
  p_vibes          text[] default '{}',
  p_max_price      int default null,
  p_max_walk       int default null,
  p_at             timestamptz default now(),
  p_conversation   uuid default null,
  p_surface        text default 'planner',
  p_limit          int default 6
)
returns table (
  spot_id       uuid,
  name          text,
  kind          text,
  note          text,
  tags          text[],
  date_types    text[],
  vibes         text[],
  price_level   int,
  walk_minutes  int,
  distance_miles numeric,
  cover_path    text,
  logo_path     text,
  address_line  text,
  is_partner    boolean,
  partner_id    uuid,
  offer_id      uuid,
  offer_title   text,
  offer_summary text,
  fit           int
)
language plpgsql stable security definer set search_path = public as $$
declare
  v_me        uuid := auth.uid();
  v_campus    uuid;
  v_other     uuid;
  v_interests text[];
  --  the couple, as the recommender sees them
  v_wanted    text[] := '{}';   -- date types they both like
  v_budget    int;              -- the lower of two budgets
  v_walk      int;              -- the shorter of two walks
  v_no_drinks boolean := false; -- either of them said no
  v_min_age   int;              -- the younger of the two
  -- Weights. See the note above before touching these.
  k_type      int := 34;   -- asked for coffee, serves coffee
  k_vibe_each int := 6;    -- per shared vibe
  k_vibe_cap  int := 18;
  k_price     int := 14;
  k_walk      int := 16;
  k_open      int := 8;
  k_interest  int := 10;
  k_couple    int := 12;   -- what the two of them both call a good date
  k_partner_cap int := 10; -- the entire ceiling on what money moves
  k_floor     int := 24;   -- below this, not shown at all
begin
  select university_id, age into v_campus, v_min_age from profiles where id = v_me;
  if v_campus is null then return; end if;

  if p_conversation is not null then
    select case when c.profile_a = v_me then c.profile_b else c.profile_a end
      into v_other
    from conversations cv
    join matches c on c.id = cv.match_id
    where cv.id = p_conversation
      and (c.profile_a = v_me or c.profile_b = v_me);
  end if;

  -- Both people's interests, used only to score *places*. Nothing about
  -- either person leaves this function.
  select coalesce(array_agg(distinct pi.interest_id), '{}')
    into v_interests
  from profile_interests pi
  where pi.profile_id = v_me or (v_other is not null and pi.profile_id = v_other);

  --  What the two of them, together, call a good date. With a partner in the
  --  conversation this is an intersection where one exists and a union where
  --  it doesn't — two people who agree get exactly what they agree on, and two
  --  people who agree on nothing still get both their lists rather than an
  --  empty one.
  if v_other is null then
    select coalesce(s.ideal_dates, '{}') into v_wanted
    from profile_survey s where s.profile_id = v_me;
  else
    select coalesce(array(
      select unnest(sa.ideal_dates) intersect select unnest(sb.ideal_dates)
    ), '{}') into v_wanted
    from profile_survey sa, profile_survey sb
    where sa.profile_id = v_me and sb.profile_id = v_other;

    if coalesce(cardinality(v_wanted), 0) = 0 then
      select coalesce(array_agg(distinct d), '{}') into v_wanted
      from profile_survey s, unnest(s.ideal_dates) d
      where s.profile_id in (v_me, v_other);
    end if;
  end if;

  select min(s.budget_level), min(s.max_walk_minutes),
         bool_or(s.drinks = 'never')
    into v_budget, v_walk, v_no_drinks
  from profile_survey s
  where s.profile_id = v_me or (v_other is not null and s.profile_id = v_other);

  if v_other is not null then
    select least(v_min_age, p.age) into v_min_age from profiles p where p.id = v_other;
  end if;

  --  A caller who said what they wanted wins over the survey; the survey is
  --  what fills in the blanks, not what overrides an answer.
  p_max_price := coalesce(p_max_price, v_budget);
  p_max_walk  := coalesce(p_max_walk, v_walk);
  v_no_drinks := coalesce(v_no_drinks, false);

  return query
  with live_offer as (
    select distinct on (o.partner_id)
      o.partner_id, o.id, o.title,
      case o.offer_type
        when 'percent_off'     then o.percent_off || '% off your date'
        when 'amount_off'      then '$' || (o.amount_off_cents / 100.0)::numeric(10,2) || ' off'
        when 'free_item'       then 'Free ' || coalesce(o.free_item, 'treat')
        when 'bogo'            then 'Buy one, get one'
        when 'spend_threshold' then '$' || (o.amount_off_cents / 100.0)::numeric(10,2)
                                     || ' off $' || (o.min_spend_cents / 100.0)::numeric(10,2) || '+'
        else coalesce(o.description, o.title)
      end as summary
    from partner_offers o
    where o.status = 'active'
      and public.offer_is_open(o.id, p_at)
    order by o.partner_id, o.created_at desc
  ),
  scored as (
    select
      d.id, d.name, d.kind, d.note, d.tags, d.date_types, d.vibes,
      d.price_level, d.walk_minutes, d.distance_miles,
      d.cover_path, d.logo_path, d.address_line,
      d.partner_id,
      lo.id as offer_id, lo.title as offer_title, lo.summary as offer_summary,

      -- relevance
      (case when p_date_type is null then k_type / 2
            when p_date_type = any (d.date_types) then k_type
            else 0 end)
      + least(k_vibe_cap,
              k_vibe_each * coalesce(cardinality(array(
                select unnest(d.vibes) intersect select unnest(p_vibes))), 0))
      -- what the two of them both call a good date
      + (case when coalesce(cardinality(v_wanted), 0) = 0 then 0
              else least(k_couple, 6 * coalesce(cardinality(array(
                select unnest(d.date_types) intersect select unnest(v_wanted))), 0))
         end)
      + (case when p_max_price is null or d.price_level is null then k_price / 2
              when d.price_level <= p_max_price then k_price
              when d.price_level = p_max_price + 1 then k_price / 2
              else 0 end)
      + (case when d.walk_minutes is null then k_walk / 2
              when d.walk_minutes <= 5  then k_walk
              when d.walk_minutes <= 10 then k_walk - 4
              when d.walk_minutes <= 15 then k_walk - 8
              when d.walk_minutes <= 25 then k_walk - 12
              else 0 end)
      + (case when p_max_walk is null or d.walk_minutes is null then 0
              when d.walk_minutes <= p_max_walk then 0 else -k_walk end)
      + (case when public.spot_is_open(d.id, p_at) then k_open else 0 end)
      + least(k_interest,
              2 * coalesce(cardinality(array(
                select unnest(d.date_types || d.vibes || d.tags)
                intersect select unnest(v_interests))), 0))
        as relevance,

      -- the entire commercial contribution, capped
      least(k_partner_cap,
            (case when d.partner_id is not null
                   and public.partner_has(d.partner_id, 'featured_placement') then 6 else 0 end)
          + (case when lo.id is not null then 4 else 0 end))
        as boost
    from date_spots d
    left join live_offer lo
      on lo.partner_id = d.partner_id and d.partner_id is not null
    left join partner_targeting t
      on t.partner_id = d.partner_id
    where d.university_id = v_campus
      and d.is_published
      -- Asked for coffee, get coffee. This is a filter and not a weight on
      -- purpose: it is the line that makes "a business cannot buy its way
      -- into a conversation it doesn't belong in" true absolutely rather
      -- than true by arithmetic. Callers wanting a wider net pass null,
      -- which is what "Surprise us" does.
      and (p_date_type is null or p_date_type = any (d.date_types))
      -- Nobody is sent somewhere they cannot get into.
      and (d.min_age is null or v_min_age is null or v_min_age >= d.min_age)
      -- If either of them said no to drinks, a place that is only drinks is
      -- not a suggestion, it is an awkward evening.
      and not (
        v_no_drinks
        and 'drinks' = any (d.date_types)
        and coalesce(cardinality(array(
              select unnest(d.date_types)
              except select unnest(array['drinks', 'late-night', 'romantic', 'casual']))), 0) = 0
      )
      and (
        d.partner_id is null
        or (
          public.partner_is_live(d.partner_id)
          and public.partner_has(d.partner_id, 'discovery')
          -- chat and planner surfaces need the recommendation entitlement;
          -- the spots directory only needs discovery.
          and (p_surface in ('discovery', 'homepage')
               or public.partner_has(d.partner_id, 'recommendations'))
          and (p_surface <> 'chat'
               or public.partner_has(d.partner_id, 'chat_recommendations'))
          -- a partner's own narrowing, honoured as an exclusion only
          and coalesce(t.is_paused, false) = false
          and (t.date_types is null or cardinality(t.date_types) = 0
               or p_date_type is null or p_date_type = any (t.date_types))
          and (t.price_levels is null or cardinality(t.price_levels) = 0
               or d.price_level is null or d.price_level = any (t.price_levels))
          and (t.days_of_week is null or cardinality(t.days_of_week) = 0
               or extract(dow from p_at)::int = any (t.days_of_week))
          -- "we're a good fit for people who are into…", which can only ever
          -- remove this business from a suggestion, never add it to one
          and (t.interests is null or cardinality(t.interests) = 0
               or coalesce(cardinality(array(
                    select unnest(t.interests) intersect select unnest(v_interests))), 0) > 0)
        )
      )
      -- don't suggest the same place into the same conversation twice, and
      -- never re-suggest something this person waved away
      and not exists (
        select 1 from recommendation_events re
        where re.date_spot_id = d.id
          and re.viewer = v_me
          and (
            re.outcome = 'dismissed'
            or (p_conversation is not null
                and re.conversation_id = p_conversation
                and re.created_at > now() - interval '7 days')
          )
      )
  )
  select
    s.id, s.name, s.kind, s.note, s.tags, s.date_types, s.vibes,
    s.price_level, s.walk_minutes, s.distance_miles,
    s.cover_path, s.logo_path, s.address_line,
    s.partner_id is not null,
    s.partner_id, s.offer_id, s.offer_title, s.offer_summary,
    -- The fit percentage is scored against what could actually have been
    -- earned *for this request*. Asking "surprise us" makes the date-type and
    -- vibe points unreachable, and dividing by a ceiling nobody could hit
    -- would stamp a confident suggestion with "49% fit".
    least(99, greatest(1, ((s.relevance + s.boost) * 100) / greatest(1,
        (case when p_date_type is null then k_type / 2 else k_type end)
      + (case when coalesce(cardinality(p_vibes), 0) = 0 then 0 else k_vibe_cap end)
      + (case when coalesce(cardinality(v_wanted), 0) = 0 then 0 else k_couple end)
      + (case when p_max_price is null then k_price / 2 else k_price end)
      + k_walk + k_open + (k_interest / 2) + k_partner_cap)))::int
  from scored s
  where s.relevance >= k_floor
  order by (s.relevance + s.boost) desc, s.walk_minutes nulls last, s.name
  limit greatest(1, least(p_limit, 20));
end;
$$;


-- ═══════════════════════════════════════════════════════════════════════════
--  6 · Grants
-- ═══════════════════════════════════════════════════════════════════════════

grant execute on function
  public.compatibility(uuid, uuid),
  public.compatibility_reasons(uuid, uuid),
  public.deck_size_for(uuid),
  public.deck_candidates(),
  public.get_deck(int),
  public.mark_deck_acted(uuid),
  public.deck_status(),
  public.trait_pos(text),
  public.trait_agreement(text, text),
  public.intention_pos(intention)
to authenticated;
