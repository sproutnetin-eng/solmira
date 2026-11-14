-- Solution preview gating (poster pays to unlock the full solution).
--   f_preview : short teaser shown to everyone (and to the poster for judging)
--               before the reward payment is captured.
--   f_files   : per-field answers uploaded as a file instead of typed text,
--               keyed by the f_* column name, e.g.
--               { "f_understanding": { "name": "a.pdf", "url": "..." } }
-- The 7 full text fields stay hidden from the poster until the payment is
-- marked paid; admins and the author always see them.
-- Restart the server after applying this migration.

alter table public.submissions
  add column if not exists f_preview text;

alter table public.submissions
  add column if not exists f_files jsonb not null default '{}'::jsonb;

comment on column public.submissions.f_preview is
  'Short solution teaser visible before the reward is paid.';
comment on column public.submissions.f_files is
  'Per-field file answers keyed by f_* column name.';
