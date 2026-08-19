-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — reference data
--  Run after the migration. Safe to re-run.
--  Mirrors src/data/catalog.js so demo mode and live mode agree.
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

insert into interests (id, label, emoji) values
  ('live-music',    'Live music',    '🎶'),
  ('football',      'Football',      '🏈'),
  ('basketball',    'Basketball',    '🏀'),
  ('hockey',        'Hockey',        '🏒'),
  ('running',       'Running',       '🏃'),
  ('gym',           'Gym',           '🏋️'),
  ('skiing',        'Skiing',        '🎿'),
  ('travel',        'Travel',        '✈️'),
  ('photography',   'Photography',   '📷'),
  ('cooking',       'Cooking',       '🍳'),
  ('coffee',        'Coffee',        '☕'),
  ('concerts',      'Concerts',      '🎤'),
  ('cars',          'Cars',          '🚗'),
  ('motorcycles',   'Motorcycles',   '🏍️'),
  ('gaming',        'Gaming',        '🎮'),
  ('art',           'Art',           '🎨'),
  ('movies',        'Movies',        '🎬'),
  ('reading',       'Reading',       '📚'),
  ('thrifting',     'Thrifting',     '🧥'),
  ('clubbing',      'Clubbing',      '🪩'),
  ('hiking',        'Hiking',        '🥾'),
  ('pickleball',    'Pickleball',    '🥒'),
  ('golf',          'Golf',          '⛳'),
  ('baking',        'Baking',        '🧁'),
  ('dogs',          'Dogs',          '🐕'),
  ('volunteering',  'Volunteering',  '🤝'),
  ('theater',       'Theater',       '🎭'),
  ('climbing',      'Climbing',      '🧗')
on conflict (id) do nothing;

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

insert into date_spots (university_id, name, kind, tags, walk_minutes, note, is_sponsored, sponsor_name, offer_headline, offer_detail) values
  ('11111111-1111-4111-8111-111111111111', 'Vertex Coffee',            'Coffee',        array['Quiet','$'],       8,  'Good for a first date',                    true,  'Vertex Coffee', 'First-date special', 'Two coffees for $5'),
  ('11111111-1111-4111-8111-111111111111', 'Roos Roast',               'Coffee',        array['Bright','$'],      11, 'Big tables, easy to talk',                 false, null, null, null),
  ('11111111-1111-4111-8111-111111111111', 'Sava''s',                  'Food',          array['Lively','$$'],     6,  'Never a bad brunch',                       false, null, null, null),
  ('11111111-1111-4111-8111-111111111111', 'Blank Slate Creamery',     'Something fun', array['Casual','$'],      14, 'Low stakes, high reward',                  false, null, null, null),
  ('11111111-1111-4111-8111-111111111111', 'Nichols Arboretum',        'Something fun', array['Outdoors','Free'], 15, 'Best in the fall',                         false, null, null, null),
  ('11111111-1111-4111-8111-111111111111', 'Shapiro Library, 3rd floor','Study date',   array['Quiet','Free'],    4,  'Actually get work done. Allegedly.',       false, null, null, null),
  ('11111111-1111-4111-8111-111111111111', 'Ashley''s',                'Drinks',        array['Classic','$$'],    7,  'Two hundred beers, one decision',          false, null, null, null),
  ('11111111-1111-4111-8111-111111111111', 'Pinball Pete''s',          'Something fun', array['Loud','$'],        5,  'Nothing kills a silence like air hockey',  false, null, null, null)
on conflict do nothing;

insert into campus_events (university_id, title, when_text, venue, kind, emoji) values
  ('11111111-1111-4111-8111-111111111111', 'Michigan vs Wisconsin',    'Saturday · 3:30 PM',   'Michigan Stadium', 'Football',    '🏈'),
  ('11111111-1111-4111-8111-111111111111', 'Kerrytown night market',   'Thursday · 6 PM',      'Kerrytown',        'Around town', '🏮'),
  ('11111111-1111-4111-8111-111111111111', 'Student film showcase',    'Friday · 8 PM',        'State Theatre',    'Arts',        '🎬'),
  ('11111111-1111-4111-8111-111111111111', 'Hockey vs Michigan State', 'Next Friday · 7 PM',   'Yost Ice Arena',   'Hockey',      '🏒')
on conflict do nothing;
