-- RGD War Chat setup.
-- Warning: this resets chat and game data. Run it in Supabase SQL Editor.

drop table if exists battles cascade;
drop table if exists player_states cascade;
drop table if exists states cascade;
drop table if exists players cascade;
drop table if exists messages cascade;
drop table if exists profiles cascade;

create table profiles (
  id uuid references auth.users primary key,
  username text unique not null,
  created_at timestamp default now()
);

create table messages (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users not null,
  username text not null,
  content text not null,
  deleted boolean default false,
  created_at timestamp default now()
);

create table players (
  id uuid references auth.users primary key,
  username text unique not null,
  money numeric default 100,
  food numeric default 100,
  water numeric default 100,
  population integer default 10,
  soldiers integer default 3,
  soldier_power numeric default 1,
  day integer default 1,
  updated_at timestamp default now()
);

create table states (
  id text primary key,
  name text not null,
  x integer not null,
  y integer not null,
  soldiers integer not null,
  soldier_power numeric not null,
  money numeric not null,
  food numeric not null,
  water numeric not null
);

create table player_states (
  player_id uuid references auth.users not null,
  state_id text references states(id) not null,
  soldiers integer default 0,
  primary key (player_id, state_id)
);

create table battles (
  id uuid default gen_random_uuid() primary key,
  player_id uuid references auth.users not null,
  state_id text references states(id) not null,
  result text not null,
  report text not null,
  created_at timestamp default now()
);

insert into states (id, name, x, y, soldiers, soldier_power, money, food, water) values
  ('northwatch', 'Northwatch', 1, 1, 7, 2, 60, 90, 70),
  ('ironfield', 'Ironfield', 2, 1, 10, 2, 110, 80, 55),
  ('sunford', 'Sunford', 3, 1, 14, 3, 130, 120, 90),
  ('greenbay', 'Greenbay', 1, 2, 6, 1, 70, 160, 120),
  ('crownmere', 'Crownmere', 2, 2, 18, 4, 220, 150, 150),
  ('eastvale', 'Eastvale', 3, 2, 9, 2, 90, 80, 130),
  ('stonepass', 'Stonepass', 1, 3, 12, 3, 100, 65, 80),
  ('riverhold', 'Riverhold', 2, 3, 8, 2, 85, 140, 170),
  ('ashridge', 'Ashridge', 3, 3, 16, 4, 190, 100, 90);

alter table profiles enable row level security;
alter table messages enable row level security;
alter table players enable row level security;
alter table states enable row level security;
alter table player_states enable row level security;
alter table battles enable row level security;

create policy "Read profiles" on profiles for select using (true);
create policy "Insert own profile" on profiles for insert with check (auth.uid() = id);

create policy "Read messages" on messages for select using (auth.role() = 'authenticated');
create policy "Send own messages" on messages for insert with check (auth.uid() = user_id);
create policy "Delete own messages" on messages for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Read own player" on players for select using (auth.uid() = id);
create policy "Create own player" on players for insert with check (auth.uid() = id);
create policy "Update own player" on players for update using (auth.uid() = id) with check (auth.uid() = id);

create policy "Read states" on states for select using (auth.role() = 'authenticated');

create policy "Read own state ownership" on player_states for select using (auth.uid() = player_id);
create policy "Create own state ownership" on player_states for insert with check (auth.uid() = player_id);
create policy "Update own state ownership" on player_states for update using (auth.uid() = player_id) with check (auth.uid() = player_id);

create policy "Read own battles" on battles for select using (auth.uid() = player_id);
create policy "Create own battles" on battles for insert with check (auth.uid() = player_id);
