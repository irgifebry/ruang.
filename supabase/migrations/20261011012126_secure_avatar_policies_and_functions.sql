-- The prior dashboard policies granted the public role write access to every
-- object in the public avatars bucket. Recreate writes with owner-folder checks.
drop policy if exists "Allow avatar delete" on storage.objects;
drop policy if exists "Allow avatar update" on storage.objects;
drop policy if exists "Allow avatar upload" on storage.objects;
drop policy if exists "Users upload own avatar" on storage.objects;
drop policy if exists "Users update own avatar" on storage.objects;
drop policy if exists "Users delete own avatar" on storage.objects;

create policy "Users upload own avatar" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users update own avatar" on storage.objects
  for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users delete own avatar" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

-- The signup trigger runs as its owner through the trigger, not via PostgREST RPC.
do $$
begin
  if to_regprocedure('public.create_profile_for_better_user()') is not null then
    revoke execute on function public.create_profile_for_better_user()
      from public, anon, authenticated;
  end if;

  if to_regprocedure('public.validate_expense_month()') is not null then
    alter function public.validate_expense_month() set search_path = '';
  end if;

  if to_regprocedure('public.validate_salary_month()') is not null then
    alter function public.validate_salary_month() set search_path = '';
  end if;
end;
$$;
