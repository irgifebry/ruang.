-- Remove default budget categories on new accounts.
-- 
-- New accounts will now only get a profile, without any starter categories.
-- This changes the behavior of the create_profile_for_user trigger function.

create or replace function public.create_profile_for_user()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id) values (new.id);
  
  return new;
end;
$$;