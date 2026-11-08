-- Run in Supabase SQL Editor after creating/importing the bot tables.
-- Create a Supabase Auth user for each person who may access the dashboard,
-- then add their Auth user UUID to dashboard_access.

create table if not exists public.dashboard_access (
  user_id uuid primary key references auth.users (id) on delete cascade
);

alter table public.dashboard_access enable row level security;
revoke all on public.dashboard_access from anon, public;

drop policy if exists "Dashboard users can see their own access"
  on public.dashboard_access;
create policy "Dashboard users can see their own access"
  on public.dashboard_access
  for select
  to authenticated
  using (user_id = (select auth.uid()));

drop policy if exists "Dashboard access is restricted to the current user"
  on public.dashboard_access;
create policy "Dashboard access is restricted to the current user"
  on public.dashboard_access
  as restrictive
  for select
  to authenticated
  using (user_id = (select auth.uid()));

grant select on public.dashboard_access to authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'users',
    'admins',
    'support_requests',
    'bot_settings',
    'user_topics'
  ]
  loop
    if to_regclass(format('public.%I', table_name)) is null then
      raise exception 'Required table public.% does not exist', table_name;
    end if;

    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, public', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('drop policy if exists %I on public.%I',
      'Dashboard users can read ' || table_name, table_name);
    execute format('drop policy if exists %I on public.%I',
      'Dashboard access restriction ' || table_name, table_name);
    execute format(
      'create policy %I on public.%I for select to authenticated using ' ||
      '(exists (select 1 from public.dashboard_access where user_id = (select auth.uid())))',
      'Dashboard users can read ' || table_name,
      table_name
    );
    execute format(
      'create policy %I on public.%I as restrictive for select to authenticated using ' ||
      '(exists (select 1 from public.dashboard_access where user_id = (select auth.uid())))',
      'Dashboard access restriction ' || table_name,
      table_name
    );
  end loop;
end
$$;

-- After creating an Auth user in Supabase Dashboard > Authentication > Users,
-- grant that user access by inserting their Auth UUID:
-- insert into public.dashboard_access (user_id)
-- values ('00000000-0000-0000-0000-000000000000');
