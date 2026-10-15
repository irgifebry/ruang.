-- Stop inventing a salary record for new accounts.
--
-- `create_profile_for_user` inserted a `salary_records` row with amount 0 for the
-- current month. Nothing had been typed at that point, so a brand-new account
-- already looked like it had salary history: the row showed up in the history
-- list as "Rp0" and every month before the first save reported a negative
-- balance.
--
-- A history entry now exists only for a month where the user actually saved a
-- salary. Zero is treated as "not filled in" by the app rather than as a value,
-- so this row never carried information worth keeping. Existing rows are left
-- alone: deleting a zero the user may have set on purpose is not this
-- migration's call, and the app filters them out either way.

create or replace function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);

  insert into public.budgets (user_id, name, monthly_limit, color)
  values
    (new.id, 'Makan & minum',        2400000, 'lime'),
    (new.id, 'Tempat tinggal',       3000000, 'blue'),
    (new.id, 'Transportasi',         1200000, 'orange'),
    (new.id, 'Tagihan',               950000, 'violet'),
    (new.id, 'Hiburan & gaya hidup', 1400000, 'pink');

  return new;
end;
$$;