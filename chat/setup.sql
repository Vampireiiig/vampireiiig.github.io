-- RGD War Chat setup.
-- Warning: this resets chat and game data. Run it in Supabase SQL Editor.

drop table if exists battles cascade;
drop table if exists trade_offers cascade;
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
  food numeric default 50,
  water numeric default 50,
  population integer default 10,
  soldiers integer default 3,
  soldier_power numeric default 1,
  day integer default 1,
  last_day_at timestamp default now(),
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
  custom_name text,
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

create table trade_offers (
  id uuid default gen_random_uuid() primary key,
  from_player uuid references auth.users not null,
  from_username text not null,
  to_username text not null,
  status text default 'pending',
  offer jsonb not null,
  request jsonb not null,
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
alter table trade_offers enable row level security;

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

create policy "Read relevant trades" on trade_offers for select using (
  auth.uid() = from_player or
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.username = trade_offers.to_username)
);
create policy "Create own trades" on trade_offers for insert with check (auth.uid() = from_player);
create policy "Update received trades" on trade_offers for update using (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.username = trade_offers.to_username)
) with check (
  exists (select 1 from profiles where profiles.id = auth.uid() and profiles.username = trade_offers.to_username)
);

create or replace function accept_trade_offer(trade_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  t trade_offers%rowtype;
  receiver_id uuid;
  giver players%rowtype;
  receiver players%rowtype;
  offer_land text;
  request_land text;
  request_land_id text;
begin
  select * into t from trade_offers where id = trade_id for update;
  if not found then
    raise exception 'Trade not found';
  end if;

  select id into receiver_id from profiles where username = t.to_username;
  if receiver_id is null or auth.uid() <> receiver_id then
    raise exception 'Only the receiving player can accept this trade';
  end if;

  if t.status <> 'pending' then
    raise exception 'This trade is no longer pending';
  end if;

  select * into giver from players where id = t.from_player for update;
  select * into receiver from players where id = receiver_id for update;

  if giver.money < coalesce((t.offer->>'money')::numeric, 0)
    or giver.food < coalesce((t.offer->>'food')::numeric, 0)
    or giver.water < coalesce((t.offer->>'water')::numeric, 0)
    or giver.soldiers < coalesce((t.offer->>'soldiers')::integer, 0)
    or giver.population < coalesce((t.offer->>'population')::integer, 0) then
    raise exception 'Offering player no longer owns enough resources';
  end if;

  if receiver.money < coalesce((t.request->>'money')::numeric, 0)
    or receiver.food < coalesce((t.request->>'food')::numeric, 0)
    or receiver.water < coalesce((t.request->>'water')::numeric, 0)
    or receiver.soldiers < coalesce((t.request->>'soldiers')::integer, 0)
    or receiver.population < coalesce((t.request->>'population')::integer, 0) then
    raise exception 'You do not own enough resources';
  end if;

  offer_land := nullif(t.offer->>'land', '');
  if offer_land is not null and not exists (
    select 1 from player_states where player_id = t.from_player and state_id = offer_land
  ) then
    raise exception 'Offering player no longer owns offered land';
  end if;

  request_land := nullif(t.request->>'land', '');
  if request_land is not null then
    select ps.state_id into request_land_id
    from player_states ps
    join states s on s.id = ps.state_id
    where ps.player_id = receiver_id
      and lower(coalesce(ps.custom_name, s.name, ps.state_id)) = lower(request_land)
    limit 1;

    if request_land_id is null then
      raise exception 'You do not own the requested land';
    end if;
  end if;

  update players set
    money = money - coalesce((t.offer->>'money')::numeric, 0) + coalesce((t.request->>'money')::numeric, 0),
    food = food - coalesce((t.offer->>'food')::numeric, 0) + coalesce((t.request->>'food')::numeric, 0),
    water = water - coalesce((t.offer->>'water')::numeric, 0) + coalesce((t.request->>'water')::numeric, 0),
    soldiers = soldiers - coalesce((t.offer->>'soldiers')::integer, 0) + coalesce((t.request->>'soldiers')::integer, 0),
    population = population - coalesce((t.offer->>'population')::integer, 0) + coalesce((t.request->>'population')::integer, 0),
    updated_at = now()
  where id = t.from_player;

  update players set
    money = money + coalesce((t.offer->>'money')::numeric, 0) - coalesce((t.request->>'money')::numeric, 0),
    food = food + coalesce((t.offer->>'food')::numeric, 0) - coalesce((t.request->>'food')::numeric, 0),
    water = water + coalesce((t.offer->>'water')::numeric, 0) - coalesce((t.request->>'water')::numeric, 0),
    soldiers = soldiers + coalesce((t.offer->>'soldiers')::integer, 0) - coalesce((t.request->>'soldiers')::integer, 0),
    population = population + coalesce((t.offer->>'population')::integer, 0) - coalesce((t.request->>'population')::integer, 0),
    updated_at = now()
  where id = receiver_id;

  if offer_land is not null then
    update player_states
    set player_id = receiver_id
    where player_id = t.from_player and state_id = offer_land;
  end if;

  if request_land_id is not null then
    update player_states
    set player_id = t.from_player
    where player_id = receiver_id and state_id = request_land_id;
  end if;

  update trade_offers set status = 'accepted' where id = trade_id;
end;
$$;
