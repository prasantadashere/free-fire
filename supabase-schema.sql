-- Free Fire MAX Scoreboard — Supabase setup
-- Run the entire script in Supabase Dashboard > SQL Editor.
-- Contact details live in team_contacts and are NOT publicly readable.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);
create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(trim(name)) between 1 and 20),
  created_at timestamptz not null default now()
);
create table if not exists public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 80),
  group_id uuid references public.groups(id) on delete set null,
  created_at timestamptz not null default now()
);
create table if not exists public.team_contacts (
  team_id uuid primary key references public.teams(id) on delete cascade,
  contact_person text,
  contact_details text,
  updated_at timestamptz not null default now()
);
create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) between 1 and 100),
  stage text not null default 'Online Qualifiers',
  description text,
  created_at timestamptz not null default now()
);
create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  match_number integer not null check (match_number > 0),
  map_name text not null check (length(trim(map_name)) between 1 and 80),
  label text,
  created_at timestamptz not null default now(),
  unique(event_id, match_number)
);
create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches(id) on delete cascade,
  team_id uuid not null references public.teams(id) on delete cascade,
  placement integer not null check (placement between 1 and 12),
  kills integer not null default 0 check (kills between 0 and 100),
  placement_points integer generated always as (
    case placement when 1 then 12 when 2 then 9 when 3 then 8 when 4 then 7
      when 5 then 6 when 6 then 5 when 7 then 4 when 8 then 3
      when 9 then 2 when 10 then 1 else 0 end
  ) stored,
  total_points integer generated always as (
    (case placement when 1 then 12 when 2 then 9 when 3 then 8 when 4 then 7
      when 5 then 6 when 6 then 5 when 7 then 4 when 8 then 3
      when 9 then 2 when 10 then 1 else 0 end) + kills
  ) stored,
  created_at timestamptz not null default now(),
  unique(match_id, team_id),
  unique(match_id, placement)
);

create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (select 1 from public.admin_users where user_id = auth.uid());
$$;

alter table public.admin_users enable row level security;
alter table public.groups enable row level security;
alter table public.teams enable row level security;
alter table public.team_contacts enable row level security;
alter table public.events enable row level security;
alter table public.matches enable row level security;
alter table public.match_results enable row level security;

-- Recreate policies safely when re-running this setup.
drop policy if exists "Admins can read admin list" on public.admin_users;
drop policy if exists "Admins manage groups" on public.groups;
drop policy if exists "Public read groups" on public.groups;
drop policy if exists "Admins manage teams" on public.teams;
drop policy if exists "Public read teams" on public.teams;
drop policy if exists "Admins manage contacts" on public.team_contacts;
drop policy if exists "Admins manage events" on public.events;
drop policy if exists "Public read events" on public.events;
drop policy if exists "Admins manage matches" on public.matches;
drop policy if exists "Public read matches" on public.matches;
drop policy if exists "Admins manage results" on public.match_results;
drop policy if exists "Public read results" on public.match_results;

create policy "Admins can read admin list" on public.admin_users for select to authenticated using (public.is_admin());
create policy "Admins manage groups" on public.groups for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public read groups" on public.groups for select to anon, authenticated using (true);
create policy "Admins manage teams" on public.teams for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public read teams" on public.teams for select to anon, authenticated using (true);
create policy "Admins manage contacts" on public.team_contacts for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Admins manage events" on public.events for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public read events" on public.events for select to anon, authenticated using (true);
create policy "Admins manage matches" on public.matches for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public read matches" on public.matches for select to anon, authenticated using (true);
create policy "Admins manage results" on public.match_results for all to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "Public read results" on public.match_results for select to anon, authenticated using (true);

grant usage on schema public to anon, authenticated;
grant select on public.groups, public.teams, public.events, public.matches, public.match_results to anon, authenticated;
grant all on public.groups, public.teams, public.team_contacts, public.events, public.matches, public.match_results to authenticated;
grant select on public.team_contacts to authenticated;
grant select on public.admin_users to authenticated;

-- IMPORTANT: Create an admin user first in Authentication > Users.
-- Copy that user's UUID, then run this with the real UUID:
-- insert into public.admin_users (user_id) values ('YOUR_AUTH_USER_UUID');
