-- Run this in Supabase → SQL Editor
-- (re-run this if you ran the old version with the email column)

drop table if exists messages cascade;
drop table if exists profiles cascade;

create table profiles (
  id uuid references auth.users primary key,
  username text unique not null,
  created_at timestamp default now()
);

create table messages (
  id uuid default gen_random_uuid() primary key,
  username text not null,
  content text not null,
  created_at timestamp default now()
);

-- Security rules
alter table profiles enable row level security;
alter table messages enable row level security;

create policy "Anyone can read profiles"       on profiles for select using (true);
create policy "Users can insert own profile"   on profiles for insert with check (auth.uid() = id);

create policy "Logged in users can read msgs"  on messages for select using (auth.role() = 'authenticated');
create policy "Logged in users can send msgs"  on messages for insert with check (auth.role() = 'authenticated');
