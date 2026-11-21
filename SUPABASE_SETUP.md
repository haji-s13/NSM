# Accounts and saved plans (Supabase)

The planner's sign-in and saved plans use a free [Supabase](https://supabase.com) project.
Until it's configured, the home page offers **Continue as guest** only.

## 1. Create the project

1. Sign up at supabase.com and create a new project (the free plan is enough).
2. Wait for it to finish setting up.

## 2. Create the plans table

Open **SQL Editor → New query**, paste this, and click **Run**:

```sql
create table if not exists public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users on delete cascade,
  name text not null check (char_length(name) between 1 and 100),
  settings jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.plans enable row level security;

create policy "Read own plans"   on public.plans for select using (auth.uid() = user_id);
create policy "Add own plans"    on public.plans for insert with check (auth.uid() = user_id);
create policy "Edit own plans"   on public.plans for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "Delete own plans" on public.plans for delete using (auth.uid() = user_id);

create index if not exists plans_user_updated on public.plans (user_id, updated_at desc);

-- Let signed-in users use the table through the API (row-level security still limits them to their own rows).
grant select, insert, update, delete on public.plans to authenticated;
```

Row-level security means each signed-in person can only see and change their own plans. Visitors who aren't signed in get no access at all.

If you created the table before the `grant` line was added to this guide, run just that line on its own.

## 3. Set the site address

Open **Authentication → URL Configuration**:

- **Site URL**: `https://haji-s13.github.io/NSM/`
- **Redirect URLs**: add `https://haji-s13.github.io/NSM/` and `https://haji-s13.github.io/NSM/index.html`

This is where the "confirm your email" link sends people.

## 4. Connect the planner

Open **Project Settings → API** (or **Data API**) and copy:

- **Project URL** (for example `https://abcd1234.supabase.co`)
- **anon public** key (or the **publishable** key)

Put them in `config.js`:

```js
window.NSM_CONFIG = {
  supabaseUrl: "https://abcd1234.supabase.co",
  supabaseAnonKey: "eyJ...",
};
```

Never use the **service_role** / secret key here: it bypasses row-level security.

Commit and push, and the home page shows sign-in and create-account.
