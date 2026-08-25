-- ═══════════════════════════════════════════════════════════════════════════
--  looseleaf — not every payment method is a card
-- ═══════════════════════════════════════════════════════════════════════════
--
--  `partner_has_card()` was right about the question and the code answering it
--  was wrong. Stripe Checkout offers Link, US bank accounts and Cash App
--  alongside cards by default, and the webhook only ever read the `.card` hash
--  and only ever listed `type = 'card'` — so a partner who checked out with
--  any of them had a perfectly chargeable payment method that the product
--  reported as *no payment method on file*, and their Date Passes stayed off.
--
--  Found the hard way: a real card added through Stripe's own page came back
--  as "none yet" on the Billing screen, with every webhook event delivered
--  correctly and nothing in any log to say why.
--
--  The column below exists so the dashboard can say what is actually on file
--  rather than assuming. Nothing gates on it — `partner_has_card()` still
--  reads `payment_method_at`, which is now set from *a payment method
--  existing* rather than from a `last4` being parseable. A Link wallet has no
--  last four digits and can be charged perfectly well.
-- ═══════════════════════════════════════════════════════════════════════════

alter table partner_subscriptions
  add column if not exists payment_method_type text;

comment on column partner_subscriptions.payment_method_type is
  'Stripe PaymentMethod type: card, link, us_bank_account, cashapp, … Display only; presence is decided by payment_method_at.';

--  Nothing gates on the type, and nothing should start to. Whether Loose Leaf
--  can bill a business is one question — is there a payment method — and the
--  answer must not quietly become "is there a payment method we recognise",
--  which is the bug this migration exists to close.
comment on function public.partner_has_card(uuid) is
  'True when Stripe has any chargeable payment method for this partner. Card, wallet, or bank — the kind is irrelevant.';
