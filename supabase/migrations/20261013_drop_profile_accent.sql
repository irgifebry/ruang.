-- Drop the accent colour preference.
--
-- The settings screen now offers light / dark / follow-system only; the accent
-- is the fixed brand lime defined by `--c-accent*` in `globals.css`. Nothing
-- reads or writes `profiles.accent` any more.
--
-- The five category colours in `budgets.color` are untouched — those are a
-- per-budget label, not an appearance setting.
--
-- `if exists` because a database provisioned from the current `schema.sql`
-- never had the column: a fresh project runs schema.sql and never this file,
-- while an already-provisioned project runs only the migrations. Both routes
-- have to end in the same schema.

alter table public.profiles drop column if exists accent;