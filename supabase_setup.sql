-- 1. Create Tables for Update List
create table if not exists app_versions (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  is_done boolean default false,
  is_collapsed boolean default false,
  position integer not null default 0,
  created_at timestamptz default now()
);

create table if not exists app_todos (
  id uuid default gen_random_uuid() primary key,
  title text not null,
  description text,
  type text check (type in ('new', 'bug')) not null,
  is_done boolean default false,
  version_id uuid references app_versions(id) on delete cascade,
  position integer not null default 0,
  created_at timestamptz default now()
);

-- 2. Enable RLS
alter table app_versions enable row level security;
alter table app_todos enable row level security;

-- 3. Create Policies for Update List
-- We allow 'anon' and 'authenticated' roles to access these tables.
-- This supports the current architecture where some API routes might use the anonymous client.

-- App Versions
create policy "Allow all access to app_versions"
on app_versions for all
to anon, authenticated
using (true)
with check (true);

-- App Todos
create policy "Allow all access to app_todos"
on app_todos for all
to anon, authenticated
using (true)
with check (true);


-- 4. Fix RLS for Data Repository Uploads (Pull Data Error)
-- Ensure the bucket exists
insert into storage.buckets (id, name, public)
values ('data-repository', 'data-repository', false)
on conflict (id) do nothing;

-- Allow authenticated users to upload files to data-repository
create policy "Allow authenticated uploads to data-repository"
on storage.objects for insert
to authenticated
with check ( bucket_id = 'data-repository' );

-- Allow authenticated users to select/download files
create policy "Allow authenticated download from data-repository"
on storage.objects for select
to authenticated
using ( bucket_id = 'data-repository' );

-- Allow anon to download (needed for Server-side API config fetching if it uses anon client)
create policy "Allow anon download from data-repository"
on storage.objects for select
to anon
using ( bucket_id = 'data-repository' );
