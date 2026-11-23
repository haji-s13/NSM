-- One private row per account: the person's profile, season, run plan and HYROX plan settings.
-- Only the signed-in owner can read or change their row. Guests (anon) have no access.
-- Run in Supabase: SQL Editor -> New query -> paste -> Run. Safe to run again.

create table if not exists public.user_settings (
  user_id uuid primary key default auth.uid() references auth.users on delete cascade,
  settings jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

drop policy if exists "Read own settings" on public.user_settings;
drop policy if exists "Add own settings" on public.user_settings;
drop policy if exists "Edit own settings" on public.user_settings;
drop policy if exists "Delete own settings" on public.user_settings;
create policy "Read own settings"   on public.user_settings for select using (auth.uid() = user_id);
create policy "Add own settings"    on public.user_settings for insert with check (auth.uid() = user_id);
create policy "Edit own settings"   on public.user_settings for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own settings" on public.user_settings for delete using (auth.uid() = user_id);

revoke all on public.user_settings from anon;
grant select, insert, update, delete on public.user_settings to authenticated;
