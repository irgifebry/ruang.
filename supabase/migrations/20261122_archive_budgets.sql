-- 2026-11-22 — deleting a category must not erase its transactions.
--
-- A budget row doubles as the category label on every expense that points at
-- it. Hard-deleting it used to cascade-delete those expenses, so a routine
-- "I don't need this category any more" silently destroyed months of records.
-- Keep the row and mark it archived instead: the label survives on old
-- transactions, while the category disappears from pickers and totals.
--
-- The FK stays ON DELETE CASCADE as a safety net for account purges; the app
-- never hard-deletes a budget by id any more.

begin;

alter table public.budgets add column if not exists archived_at timestamptz;

comment on column public.budgets.archived_at is
  'Set when the user removes the category. The row stays so past expenses keep their category name; hidden from pickers and totals.';

-- The previous migration added a plain unique index on (user_id, lower(name)).
-- Once a category is archived its name may be reused, so the uniqueness has to
-- cover active categories only.
drop index if exists public.budgets_user_lower_name_idx;
create unique index if not exists budgets_user_active_lower_name_idx
  on public.budgets (user_id, lower(name))
  where archived_at is null;

commit;
